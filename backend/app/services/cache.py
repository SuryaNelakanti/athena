"""
Cache Service - In-memory caching for proxy responses with TTL.

This provides a simple in-memory cache for proxy responses to reduce
latency and cost for repeated identical requests.
"""
from typing import Optional, Dict, Any
from dataclasses import dataclass, field
from datetime import datetime, timedelta
import hashlib
import json
import time
import asyncio


@dataclass
class CacheEntry:
    """A single cache entry with metadata."""
    key: str
    value: Any
    created_at: float
    ttl_seconds: int
    hits: int = 0
    
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
            "temperature": kwargs.get("temperature", 1.0),
            "max_tokens": kwargs.get("max_tokens"),
            "top_p": kwargs.get("top_p", 1.0),
        }
        
        # Sort keys for consistent hashing
        key_str = json.dumps(key_data, sort_keys=True)
        return hashlib.sha256(key_str.encode()).hexdigest()[:32]
    
    async def get(self, model: str, messages: list, **kwargs) -> Optional[Any]:
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
        self._cache[key] = CacheEntry(
            key=key,
            value=response,
            created_at=time.time(),
            ttl_seconds=ttl or self._default_ttl,
        )
    
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
        
        return {
            "enabled": self._enabled,
            "entries": len(self._cache),
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
