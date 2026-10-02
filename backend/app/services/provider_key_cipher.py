"""Versioned encryption and legacy decoding for stored provider keys."""

from __future__ import annotations

import base64
import binascii
import hashlib
import os

from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives.ciphers.aead import AESGCM


class ProviderKeyDecryptionError(ValueError):
    """Raised when a stored provider key cannot be authenticated or decoded."""


class ProviderKeyCipher:
    """Encode durable keys with AES-GCM and decode the legacy format."""

    _ENCRYPTION_PREFIX = "v1:"
    _ENCRYPTION_CONTEXT = b"athena.provider-key.v1"
    _NONCE_SIZE = 12

    @staticmethod
    def _secret() -> bytes:
        raw = os.getenv("ATHENA_PROVIDER_KEY_SECRET", "athena-local-dev-provider-key-secret")
        return hashlib.sha256(raw.encode("utf-8")).digest()

    @classmethod
    def _legacy_crypt(cls, data: bytes) -> bytes:
        secret = cls._secret()
        stream = bytearray()
        counter = 0
        while len(stream) < len(data):
            stream.extend(hashlib.sha256(secret + counter.to_bytes(8, "big")).digest())
            counter += 1
        return bytes(byte ^ stream[idx] for idx, byte in enumerate(data))

    @classmethod
    def encrypt(cls, api_key: str) -> str:
        nonce = os.urandom(cls._NONCE_SIZE)
        ciphertext = AESGCM(cls._secret()).encrypt(
            nonce,
            api_key.encode("utf-8"),
            cls._ENCRYPTION_CONTEXT,
        )
        payload = base64.urlsafe_b64encode(nonce + ciphertext).decode("ascii")
        return f"{cls._ENCRYPTION_PREFIX}{payload}"

    @classmethod
    def decrypt(cls, encrypted_api_key: str) -> str:
        if encrypted_api_key.startswith(cls._ENCRYPTION_PREFIX):
            payload = encrypted_api_key[len(cls._ENCRYPTION_PREFIX):]
            try:
                encoded_payload = base64.b64decode(
                    payload.encode("ascii"),
                    altchars=b"-_",
                    validate=True,
                )
                if len(encoded_payload) < cls._NONCE_SIZE + 16:
                    raise ValueError("Encrypted provider key is too short")
                nonce = encoded_payload[:cls._NONCE_SIZE]
                ciphertext = encoded_payload[cls._NONCE_SIZE:]
                plaintext = AESGCM(cls._secret()).decrypt(
                    nonce,
                    ciphertext,
                    cls._ENCRYPTION_CONTEXT,
                )
                return plaintext.decode("utf-8")
            except (binascii.Error, UnicodeError, InvalidTag, ValueError) as cause:
                raise ProviderKeyDecryptionError(
                    "Unable to decrypt provider key; verify ATHENA_PROVIDER_KEY_SECRET."
                ) from cause

        try:
            encrypted = base64.b64decode(
                encrypted_api_key.encode("ascii"),
                altchars=b"-_",
                validate=True,
            )
            return cls._legacy_crypt(encrypted).decode("utf-8")
        except (binascii.Error, UnicodeError, ValueError) as cause:
            raise ProviderKeyDecryptionError(
                "Unable to decode legacy provider key."
            ) from cause
