const express = require('express');
const cors = require('cors');
const http = require('http');
const socketIo = require('socket.io');
const compression = require('compression');
const helmet = require('helmet');
require('dotenv').config();

const { LRUCache, LFUCache } = require('./cache/strategies');
const SyncManager = require('./sync/syncManager');

class CacheServer {
  constructor() {
    this.app = express();
    this.server = http.createServer(this.app);
    this.io = socketIo(this.server, {
      cors: {
        origin: "https://redis-backend-comz.onrender.com",
        methods: ["GET", "POST", "DELETE", "PUT"]
      }
    });

    this.currentStrategy = 'LRU';
    this.cache = new LRUCache(parseInt(process.env.CACHE_CAPACITY) || 100);

    const peerNodes = process.env.PEER_NODES
      ? process.env.PEER_NODES.split(',').map(url => url.trim())
      : [];

    console.log("🔗 [SyncManager] Attempting peer connections:", peerNodes);
    console.log("🌐 Self node URL:", `http://localhost:${process.env.PORT}`);

    this.syncManager = new SyncManager(this.cache, this.io, peerNodes);

    this.setupMiddleware();
    this.setupRoutes();
    this.setupWebSocketEvents();
  }

  setupMiddleware() {
    this.app.use(helmet());
    this.app.use(compression());
    this.app.use(cors({
      origin: process.env.FRONTEND_URL || "http://localhost:3000",
      credentials: true
    }));
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true }));

    this.app.use((req, res, next) => {
      console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
      next();
    });
  }

  setupRoutes() {
    // ✅ Ping Route for UptimeRobot or health checks
    this.app.head('/ping', (req, res) => {
  res.status(200).end(); // HEAD should not have body
});

    this.app.get('/health', (req, res) => {
      res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        nodeId: this.syncManager.nodeId
      });
    });

    this.app.get('/api/cache/:key', this.getCacheItem.bind(this));
    this.app.post('/api/cache', this.setCacheItem.bind(this));
    this.app.delete('/api/cache/:key', this.deleteCacheItem.bind(this));
    this.app.delete('/api/cache', this.clearCache.bind(this));

    this.app.get('/api/cache', this.getAllCacheItems.bind(this));
    this.app.post('/api/strategy', this.changeStrategy.bind(this));
    this.app.get('/api/metrics', this.getMetrics.bind(this));

    this.app.get('/api/sync/status', this.getSyncStatus.bind(this));
    this.app.get('/api/sync/history', this.getSyncHistory.bind(this));
    this.app.post('/api/sync/toggle', this.toggleSync.bind(this));
    this.app.post('/api/sync/force', this.forceSync.bind(this));

    this.app.post('/api/cache/bulk', this.bulkSetItems.bind(this));
    this.app.delete('/api/cache/bulk', this.bulkDeleteItems.bind(this));

    this.app.use(this.errorHandler.bind(this));
  }

  setupWebSocketEvents() {
    this.io.on('connection', (socket) => {
      socket.emit('cache-state', {
        items: this.cache.getAll(),
        metrics: this.cache.getMetrics(),
        strategy: this.currentStrategy
      });

      socket.on('get-cache-state', () => {
        socket.emit('cache-state', {
          items: this.cache.getAll(),
          metrics: this.cache.getMetrics(),
          strategy: this.currentStrategy
        });
      });
    });
  }

  async getCacheItem(req, res) {
    try {
      const { key } = req.params;
      const item = this.cache.get(key);

      if (item) {
        item.timestamp = new Date().toISOString();
        item.accessCount = (item.accessCount || 0) + 1;

        this.cache.set(key, item);

        res.json({ success: true, key, value: item });
      } else {
        res.status(404).json({ success: false, message: 'Key not found', key });
      }

      this.broadcastMetrics();
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  async setCacheItem(req, res) {
    try {
      const { key, value } = req.body;
      if (!key || value === undefined) {
        return res.status(400).json({ success: false, message: 'Key and value are required' });
      }

      this.cache.set(key, {
        value,
        timestamp: new Date().toISOString(),
        accessCount: 1
      });

      this.syncManager.broadcastOperation({ type: 'set', key, value });

      res.json({ success: true, message: 'Item cached successfully', key, value });
      this.broadcastCacheUpdate();
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  async deleteCacheItem(req, res) {
    try {
      const { key } = req.params;
      const deleted = this.cache.delete(key);

      if (deleted) {
        this.syncManager.broadcastOperation({ type: 'delete', key });
        res.json({ success: true, message: 'Item deleted successfully', key });
      } else {
        res.status(404).json({ success: false, message: 'Key not found', key });
      }

      this.broadcastCacheUpdate();
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  async clearCache(req, res) {
    try {
      this.cache.clear();
      this.syncManager.broadcastOperation({ type: 'clear' });
      res.json({ success: true, message: 'Cache cleared successfully' });
      this.broadcastCacheUpdate();
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  async getAllCacheItems(req, res) {
    try {
      const items = this.cache.getAll();
      res.json({ success: true, items, count: items.length });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  async changeStrategy(req, res) {
    try {
      const { strategy } = req.body;
      if (!['LRU', 'LFU'].includes(strategy)) {
        return res.status(400).json({ success: false, message: 'Invalid strategy. Use LRU or LFU' });
      }

      const currentData = this.cache.getAll();
      const capacity = this.cache.capacity;
      this.cache = strategy === 'LRU' ? new LRUCache(capacity) : new LFUCache(capacity);
      currentData.forEach(item => this.cache.set(item.key, item.value));

      this.currentStrategy = strategy;
      this.syncManager.cache = this.cache;

      this.syncManager.broadcastOperation({ type: 'strategy-change', strategy });

      res.json({ success: true, message: `Strategy changed to ${strategy}`, strategy });
      this.broadcastCacheUpdate();
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  async getMetrics(req, res) {
    try {
      const cacheMetrics = this.cache.getMetrics();
      const syncStats = this.syncManager.getSyncStats();

      res.json({
        success: true,
        cache: cacheMetrics,
        sync: syncStats,
        server: {
          uptime: process.uptime(),
          memory: process.memoryUsage(),
          timestamp: Date.now()
        }
      });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  async getSyncStatus(req, res) {
    try {
      const syncStats = this.syncManager.getSyncStats();
      res.json({ success: true, ...syncStats });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  async getSyncHistory(req, res) {
    try {
      const limit = parseInt(req.query.limit) || 20;
      const history = this.syncManager.getSyncHistory(limit);
      res.json({ success: true, history });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  async toggleSync(req, res) {
    try {
      const enabled = this.syncManager.toggleSync();
      res.json({ success: true, syncEnabled: enabled, message: `Synchronization ${enabled ? 'enabled' : 'disabled'}` });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  async forceSync(req, res) {
    try {
      this.syncManager.forceSync();
      res.json({ success: true, message: 'Force sync initiated' });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  async bulkSetItems(req, res) {
    try {
      const { items } = req.body;
      if (!Array.isArray(items)) {
        return res.status(400).json({ success: false, message: 'Items must be an array' });
      }

      let successCount = 0;
      const errors = [];

      items.forEach((item, index) => {
        try {
          if (item.key && item.value !== undefined) {
            this.cache.set(item.key, {
              value: item.value,
              timestamp: new Date().toISOString(),
              accessCount: 1
            });
            successCount++;
            this.syncManager.broadcastOperation({ type: 'set', key: item.key, value: item.value });
          } else {
            errors.push(`Item ${index}: Key and value required`);
          }
        } catch (error) {
          errors.push(`Item ${index}: ${error.message}`);
        }
      });

      res.json({ success: true, message: 'Bulk operation completed', successCount, totalCount: items.length, errors });
      this.broadcastCacheUpdate();
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  async bulkDeleteItems(req, res) {
    try {
      const { keys } = req.body;
      if (!Array.isArray(keys)) {
        return res.status(400).json({ success: false, message: 'Keys must be an array' });
      }

      let deletedCount = 0;
      keys.forEach(key => {
        if (this.cache.delete(key)) {
          deletedCount++;
          this.syncManager.broadcastOperation({ type: 'delete', key });
        }
      });

      res.json({ success: true, message: 'Bulk delete completed', deletedCount, totalCount: keys.length });
      this.broadcastCacheUpdate();
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  broadcastCacheUpdate() {
    this.io.emit('cache-state', {
      items: this.cache.getAll(),
      metrics: this.cache.getMetrics(),
      strategy: this.currentStrategy
    });
  }

  broadcastMetrics() {
    this.io.emit('metrics-update', this.cache.getMetrics());
  }

  errorHandler(error, req, res, next) {
    console.error('Server Error:', error);
    res.status(500).json({ success: false, message: 'Internal server error', error: process.env.NODE_ENV === 'development' ? error.message : undefined });
  }

  start() {
    const PORT = process.env.PORT || 5000;
    this.server.listen(PORT, () => {
      console.log(`🚀 Distributed Cache Server running on port ${PORT}`);
      console.log(`📊 Cache Strategy: ${this.currentStrategy}`);
      console.log(`🔄 Node ID: ${this.syncManager.nodeId}`);
      console.log(`💾 Cache Capacity: ${this.cache.capacity}`);
    });
  }
}

if (require.main === module) {
  const server = new CacheServer();
  server.start();
}

module.exports = CacheServer;
