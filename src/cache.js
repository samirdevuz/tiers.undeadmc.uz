'use strict';

const { config } = require('./config');

// Oddiy xotiradagi kesh: har bir yozuv TTL dan keyin eskiradi, o'lcham cheklangan.
class TtlCache {
  constructor(ttlMs, maxEntries) {
    this.ttlMs = ttlMs;
    this.maxEntries = maxEntries;
    this.map = new Map();
  }

  get(key) {
    const entry = this.map.get(key);
    if (!entry) return undefined;
    if (entry.expires <= Date.now()) {
      this.map.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set(key, value) {
    if (this.map.size >= this.maxEntries) {
      this.map.delete(this.map.keys().next().value);
    }
    this.map.set(key, { value, expires: Date.now() + this.ttlMs });
  }

  wrap(key, build) {
    let value = this.get(key);
    if (value === undefined) {
      value = build();
      this.set(key, value);
    }
    return value;
  }

  clear() {
    this.map.clear();
  }
}

module.exports = new TtlCache(config.cacheTtlMs, 1000);
