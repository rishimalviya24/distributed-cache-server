// cache/strategies.js
class CacheNode {
  constructor(key, value) {
    this.key = key;
    this.value = value;
    this.frequency = 1;
    this.timestamp = Date.now();
    this.prev = null;
    this.next = null;
  }
}

/**
 * Least Recently Used (LRU) Cache Implementation
 * Evicts the least recently accessed item when capacity is reached
 */
class LRUCache {
  constructor(capacity = 100) {
    this.capacity = capacity;
    this.cache = new Map();
    this.head = new CacheNode(0, 0);
    this.tail = new CacheNode(0, 0);
    this.head.next = this.tail;
    this.tail.prev = this.head;
    this.hits = 0;
    this.misses = 0;
    this.evictions = 0;
  }

  /**
   * Add node right after head
   */
  _addNode(node) {
    node.prev = this.head;
    node.next = this.head.next;
    this.head.next.prev = node;
    this.head.next = node;
  }

  /**
   * Remove an existing node from the linked list
   */
  _removeNode(node) {
    const prevNode = node.prev;
    const nextNode = node.next;
    prevNode.next = nextNode;
    nextNode.prev = prevNode;
  }

  /**
   * Move certain node to the head
   */
  _moveToHead(node) {
    this._removeNode(node);
    this._addNode(node);
  }

  /**
   * Pop the current tail
   */
  _popTail() {
    const lastNode = this.tail.prev;
    this._removeNode(lastNode);
    return lastNode;
  }

  get(key) {
    const node = this.cache.get(key);
    if (node) {
      this.hits++;
      // Move the accessed node to the head
      this._moveToHead(node);
      return node.value;
    }
    this.misses++;
    return null;
  }

  set(key, value) {
    const node = this.cache.get(key);

    if (node) {
      // Update the value and move to head
      node.value = value;
      node.timestamp = Date.now();
      this._moveToHead(node);
    } else {
      const newNode = new CacheNode(key, value);

      if (this.cache.size >= this.capacity) {
        // Remove the least recently used node
        const tail = this._popTail();
        this.cache.delete(tail.key);
        this.evictions++;
      }

      this.cache.set(key, newNode);
      this._addNode(newNode);
    }
  }

  delete(key) {
    const node = this.cache.get(key);
    if (node) {
      this._removeNode(node);
      this.cache.delete(key);
      return true;
    }
    return false;
  }

  clear() {
    this.cache.clear();
    this.head.next = this.tail;
    this.tail.prev = this.head;
    this.hits = 0;
    this.misses = 0;
    this.evictions = 0;
  }

  getAll() {
    const entries = [];
    for (const [key, node] of this.cache) {
      entries.push({
        key,
        value: node.value,
        timestamp: node.timestamp,
        accessCount: 'N/A'
      });
    }
    return entries.sort((a, b) => b.timestamp - a.timestamp);
  }

  getMetrics() {
    return {
      strategy: 'LRU',
      capacity: this.capacity,
      size: this.cache.size,
      hits: this.hits,
      misses: this.misses,
      evictions: this.evictions,
      hitRate: this.hits + this.misses > 0 ? (this.hits / (this.hits + this.misses) * 100).toFixed(2) : 0
    };
  }
}

/**
 * Least Frequently Used (LFU) Cache Implementation
 * Evicts the least frequently accessed item when capacity is reached
 */
class LFUCache {
  constructor(capacity = 100) {
    this.capacity = capacity;
    this.cache = new Map();
    this.frequencies = new Map();
    this.minFrequency = 0;
    this.hits = 0;
    this.misses = 0;
    this.evictions = 0;
  }

  get(key) {
    if (!this.cache.has(key)) {
      this.misses++;
      return null;
    }

    this.hits++;
    const node = this.cache.get(key);
    this._updateFrequency(node);
    return node.value;
  }

  set(key, value) {
    if (this.capacity <= 0) return;

    if (this.cache.has(key)) {
      const node = this.cache.get(key);
      node.value = value;
      node.timestamp = Date.now();
      this._updateFrequency(node);
      return;
    }

    if (this.cache.size >= this.capacity) {
      this._evict();
    }

    const newNode = new CacheNode(key, value);
    this.cache.set(key, newNode);
    this._addToFrequency(newNode, 1);
    this.minFrequency = 1;
  }

  delete(key) {
    if (!this.cache.has(key)) return false;

    const node = this.cache.get(key);
    this._removeFromFrequency(node);
    this.cache.delete(key);
    return true;
  }

  _updateFrequency(node) {
    const oldFreq = node.frequency;
    const newFreq = oldFreq + 1;

    this._removeFromFrequency(node);
    node.frequency = newFreq;
    node.timestamp = Date.now();
    this._addToFrequency(node, newFreq);

    if (this.minFrequency === oldFreq && !this.frequencies.has(oldFreq)) {
      this.minFrequency++;
    }
  }

  _addToFrequency(node, frequency) {
    if (!this.frequencies.has(frequency)) {
      this.frequencies.set(frequency, new Set());
    }
    this.frequencies.get(frequency).add(node);
  }

  _removeFromFrequency(node) {
    const freq = node.frequency;
    if (this.frequencies.has(freq)) {
      this.frequencies.get(freq).delete(node);
      if (this.frequencies.get(freq).size === 0) {
        this.frequencies.delete(freq);
      }
    }
  }

  _evict() {
    const minFreqNodes = this.frequencies.get(this.minFrequency);
    const nodeToEvict = minFreqNodes.values().next().value;
    
    this._removeFromFrequency(nodeToEvict);
    this.cache.delete(nodeToEvict.key);
    this.evictions++;
  }

  clear() {
    this.cache.clear();
    this.frequencies.clear();
    this.minFrequency = 0;
    this.hits = 0;
    this.misses = 0;
    this.evictions = 0;
  }

  getAll() {
    const entries = [];
    for (const [key, node] of this.cache) {
      entries.push({
        key,
        value: node.value,
        timestamp: node.timestamp,
        accessCount: node.frequency
      });
    }
    return entries.sort((a, b) => b.accessCount - a.accessCount);
  }

  getMetrics() {
    return {
      strategy: 'LFU',
      capacity: this.capacity,
      size: this.cache.size,
      hits: this.hits,
      misses: this.misses,
      evictions: this.evictions,
      hitRate: this.hits + this.misses > 0 ? (this.hits / (this.hits + this.misses) * 100).toFixed(2) : 0
    };
  }
}

module.exports = { LRUCache, LFUCache };