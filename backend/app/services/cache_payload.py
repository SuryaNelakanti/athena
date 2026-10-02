import base64
import binascii
import json
import secrets
import string
from typing import Any, Optional

from cryptography.hazmat.primitives.ciphers.aead import AESGCM


class CachePayloadCodec:
    """Normalize cache encryption keys and encode/decode cached values."""

    def decode_key(self, cache_key: str) -> bytes:
        cache_key = cache_key.strip()
        if not cache_key:
            raise ValueError("Cache key cannot be empty.")
        if self.looks_like_hex(cache_key):
            return bytes.fromhex(cache_key)
        padded = cache_key + "=" * (-len(cache_key) % 4)
        try:
            return base64.urlsafe_b64decode(padded.encode("ascii"))
        except binascii.Error as error:
            raise ValueError("Cache key must be base64url or hex encoded.") from error

    def looks_like_hex(self, value: str) -> bool:
        return len(value) % 2 == 0 and all(character in string.hexdigits for character in value)

    def normalize_key(self, cache_key: Optional[str | bytes]) -> Optional[bytes]:
        if cache_key is None:
            return None
        key_bytes = cache_key if isinstance(cache_key, bytes) else self.decode_key(cache_key)
        if len(key_bytes) != 32:
            raise ValueError("Cache key must decode to 32 bytes for AES-256-GCM.")
        return key_bytes

    def encrypt(self, payload: bytes, key: bytes, aad: str) -> tuple[bytes, bytes]:
        nonce = secrets.token_bytes(12)
        ciphertext = AESGCM(key).encrypt(nonce, payload, aad.encode("utf-8"))
        return ciphertext, nonce

    def decrypt(self, ciphertext: bytes, nonce: bytes, key: bytes, aad: str) -> bytes:
        return AESGCM(key).decrypt(nonce, ciphertext, aad.encode("utf-8"))

    def serialize(self, value: Any) -> bytes:
        return json.dumps(value, sort_keys=True).encode("utf-8")

    def deserialize(self, payload: bytes) -> Any:
        return json.loads(payload.decode("utf-8"))
