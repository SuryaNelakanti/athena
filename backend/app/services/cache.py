"""
Cache Service - In-memory caching for proxy responses with TTL.

This provides a simple in-memory cache for proxy responses to reduce
latency and cost for repeated identical requests.
Supports optional AES-256-GCM encryption for cached values using a
client-provided key.
"""
from typing import Optional, Dict, Any
from dataclasses import dataclass
import base64
import binascii
import hashlib
import json
import secrets
import string
import time

from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.exceptions import InvalidTag


@dataclass
class CacheEntry:
    """A single cache entry with metadata."""
    key: str
    value: Any
    created_at: float
    ttl_seconds: int
    hits: int = 0
    encrypted: bool = False
    nonce: Optional[bytes] = None
    
    def is_expired(self) -> bool:
        return time.time() > (self.created_at + self.ttl_seconds)


class CacheService:
    """
    Simple in-memory cache with TTL support.
    
    For production, this can be extended to use Redis or SQLite.
    """
    
    def __init__(self, default_ttl: int = 3600, max_entries: int = 1000):
        """
        Initialize the cache service.
        
        Args:
            default_ttl: Default TTL in seconds (1 hour)
            max_entries: Maximum number of entries to store
        """
        self._cache: Dict[str, CacheEntry] = {}
        self._default_ttl = default_ttl
        self._max_entries = max_entries
        self._enabled = True
        self._stats = {
            "hits": 0,
            "misses": 0,
            "evictions": 0,
        }
    
    @property
    def enabled(self) -> bool:
        return self._enabled
    
    def enable(self):
        """Enable the cache."""
        self._enabled = True
    
    def disable(self):
        """Disable the cache (bypass mode)."""
        self._enabled = False
    
    def _generate_key(self, model: str, messages: list, **kwargs) -> str:
        """
        Generate a cache key from request parameters.
        
        Uses SHA256 hash of the normalized request content.
        """
        # Normalize the request for hashing
        key_data = {
            "model": model,
            "messages": messages,
            # Only include parameters that affect the response
            "provider": kwargs.get("provider"),
            "temperature": kwargs.get("temperature", 1.0),
            "max_tokens": kwargs.get("max_tokens"),
            "top_p": kwargs.get("top_p", 1.0),
            "presence_penalty": kwargs.get("presence_penalty", 0.0),
            "frequency_penalty": kwargs.get("frequency_penalty", 0.0),
            "stop": kwargs.get("stop"),
            "n": kwargs.get("n", 1),
            "logit_bias": kwargs.get("logit_bias"),
            "user": kwargs.get("user"),
            "stream": kwargs.get("stream", False),
        }
        
        # Sort keys for consistent hashing
        key_str = json.dumps(key_data, sort_keys=True)
        return hashlib.sha256(key_str.encode()).hexdigest()[:32]
    
    def _decode_cache_key(self, cache_key: str) -> bytes:
        cache_key = cache_key.strip()
        if not cache_key:
            raise ValueError("Cache key cannot be empty.")
        if self._looks_like_hex(cache_key):
            return bytes.fromhex(cache_key)
        padded = cache_key + "=" * (-len(cache_key) % 4)
        try:
            return base64.urlsafe_b64decode(padded.encode("ascii"))
        except binascii.Error as exc:
            raise ValueError("Cache key must be base64url or hex encoded.") from exc

    def _looks_like_hex(self, value: str) -> bool:
        return len(value) % 2 == 0 and all(c in string.hexdigits for c in value)

    def _normalize_cache_key(self, cache_key: Optional[str | bytes]) -> Optional[bytes]:
        if cache_key is None:
            return None
        if isinstance(cache_key, bytes):
            key_bytes = cache_key
        else:
            key_bytes = self._decode_cache_key(cache_key)
        if len(key_bytes) != 32:
            raise ValueError("Cache key must decode to 32 bytes for AES-256-GCM.")
        return key_bytes

    def normalize_encryption_key(self, encryption_key: Optional[str | bytes]) -> Optional[bytes]:
        return self._normalize_cache_key(encryption_key)

    def _encrypt_payload(self, payload: bytes, key: bytes, aad: str) -> tuple[bytes, bytes]:
        nonce = secrets.token_bytes(12)
        aesgcm = AESGCM(key)
        ciphertext = aesgcm.encrypt(nonce, payload, aad.encode("utf-8"))
        return ciphertext, nonce

    def _decrypt_payload(self, ciphertext: bytes, nonce: bytes, key: bytes, aad: str) -> bytes:
        aesgcm = AESGCM(key)
        return aesgcm.decrypt(nonce, ciphertext, aad.encode("utf-8"))

    def _serialize_value(self, value: Any) -> bytes:
        return json.dumps(value, sort_keys=True).encode("utf-8")

    def _deserialize_value(self, payload: bytes) -> Any:
        return json.loads(payload.decode("utf-8"))

    async def get(
        self,
        model: str,
        messages: list,
        encryption_key: Optional[str | bytes] = None,
        **kwargs
    ) -> Optional[Any]:
        """
        Get a cached response if available and not expired.
        
        Returns None if cache is disabled or no valid entry exists.
        """
        if not self._enabled:
            return None
        
        key = self._generate_key(model, messages, **kwargs)
        entry = self._cache.get(key)
        
        if entry is None:
            self._stats["misses"] += 1
            return None
        
        if entry.is_expired():
            # Clean up expired entry
            del self._cache[key]
            self._stats["misses"] += 1
            self._stats["evictions"] += 1
            return None
        
        if entry.encrypted:
            key_bytes = self._normalize_cache_key(encryption_key)
            if not key_bytes or not entry.nonce:
                self._stats["misses"] += 1
                return None
            try:
                plaintext = self._decrypt_payload(entry.value, entry.nonce, key_bytes, entry.key)
            except InvalidTag:
                self._stats["misses"] += 1
                return None
            entry.hits += 1
            self._stats["hits"] += 1
            return self._deserialize_value(plaintext)

        if encryption_key is not None:
            self._stats["misses"] += 1
            return None

        # Cache hit
        entry.hits += 1
        self._stats["hits"] += 1
        return entry.value
    
    async def set(
        self,
        model: str,
        messages: list,
        response: Any,
        ttl: Optional[int] = None,
        encryption_key: Optional[str | bytes] = None,
        **kwargs
    ):
        """
        Store a response in the cache.
        
        Args:
            model: The model name
            messages: The request messages
            response: The response to cache
            ttl: Optional TTL override in seconds
        """
        if not self._enabled:
            return
        
        # Evict old entries if at capacity
        if len(self._cache) >= self._max_entries:
            await self._evict_oldest()
        
        key = self._generate_key(model, messages, **kwargs)
        key_bytes = self._normalize_cache_key(encryption_key)
        if key_bytes:
            payload = self._serialize_value(response)
            ciphertext, nonce = self._encrypt_payload(payload, key_bytes, key)
            entry = CacheEntry(
                key=key,
                value=ciphertext,
                created_at=time.time(),
                ttl_seconds=ttl or self._default_ttl,
                encrypted=True,
                nonce=nonce,
            )
        else:
            entry = CacheEntry(
                key=key,
                value=response,
                created_at=time.time(),
                ttl_seconds=ttl or self._default_ttl,
            )
        self._cache[key] = entry
    
    async def _evict_oldest(self, count: int = 100):
        """Evict the oldest entries from the cache."""
        if not self._cache:
            return
        
        # Sort by creation time and remove oldest
        sorted_entries = sorted(
            self._cache.items(), 
            key=lambda x: x[1].created_at
        )
        
        for key, _ in sorted_entries[:count]:
            del self._cache[key]
            self._stats["evictions"] += 1
    
    async def invalidate(self, model: str, messages: list, **kwargs):
        """Invalidate a specific cache entry."""
        key = self._generate_key(model, messages, **kwargs)
        if key in self._cache:
            del self._cache[key]
    
    async def clear(self):
        """Clear all cache entries."""
        self._cache.clear()
    
    def get_stats(self) -> Dict[str, Any]:
        """Get cache statistics."""
        total = self._stats["hits"] + self._stats["misses"]
        hit_rate = (self._stats["hits"] / total * 100) if total > 0 else 0
        encrypted_entries = sum(1 for entry in self._cache.values() if entry.encrypted)

        return {
            "enabled": self._enabled,
            "entries": len(self._cache),
            "encrypted_entries": encrypted_entries,
            "max_entries": self._max_entries,
            "default_ttl": self._default_ttl,
            "hits": self._stats["hits"],
            "misses": self._stats["misses"],
            "evictions": self._stats["evictions"],
            "hit_rate_percent": round(hit_rate, 2),
        }


# Global cache instance
_cache_instance: Optional[CacheService] = None


def get_cache() -> CacheService:
    """Get the global cache instance."""
    global _cache_instance
    if _cache_instance is None:
        _cache_instance = CacheService()
    return _cache_instance


def configure_cache(
    default_ttl: int = 3600,
    max_entries: int = 1000,
    enabled: bool = True
) -> CacheService:
    """Configure and return the global cache instance."""
    global _cache_instance
    _cache_instance = CacheService(
        default_ttl=default_ttl,
        max_entries=max_entries
    )
    if not enabled:
        _cache_instance.disable()
    return _cache_instance
