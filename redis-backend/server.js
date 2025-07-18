// server.js - Complete version with all missing methods
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
    
    // CORS configuration
    this.io = socketIo(this.server, {
      cors: {
        origin: "https://redis-frontend.onrender.com",
        methods: ['GET', 'POST', 'DELETE', 'PUT'],
        allowedHeaders: ['Content-Type', 'Authorization'],
        credentials: true
      },
      transports: ['websocket', 'polling'],
      allowEIO3: true
    });

    this.currentStrategy = 'LRU';
    this.cache = new LRUCache(parseInt(process.env.CACHE_CAPACITY) || 100);

    // Environment variables properly parse
    const peerNodes = process.env.PEER_NODES
      ? process.env.PEER_NODES.split(',')
          .map(url => url.trim())
          .filter(url => url && url.length > 0)
      : [];

    console.log('🔗 [SyncManager] Attempting peer connections:', peerNodes);
    console.log('🌐 Self node URL:', process.env.SELF_URL || `http://localhost:${process.env.PORT}`);

    this.syncManager = new SyncManager(this.cache, this.io, peerNodes);

    this.setupMiddleware();
    this.setupRoutes();
    this.setupWebSocketEvents();
  }

  setupMiddleware() {
    this.app.use(helmet({
      crossOriginResourcePolicy: false
    }));
    this.app.use(compression());
    
    this.app.use(cors({
      origin: [
        'https://redis-frontend.onrender.com',
        'https://redis-node1-gx8k.onrender.com',
        'https://redis-node2-1i2v.onrender.com',
        'https://redis-node3-0d9j.onrender.com',
        'http://localhost:3000'
      ],
      credentials: true,
      methods: ['GET', 'POST', 'DELETE', 'PUT', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
    }));
    
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true }));
    this.app.options('*', cors());

    this.app.use((req, res, next) => {
      console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
      next();
    });
  }

  setupRoutes() {
    // Health check endpoints
    this.app.get('/ping', (req, res) => res.json({ status: 'ok' }));
    this.app.head('/ping', (req, res) => res.status(200).end());
    
    this.app.get('/health', (req, res) => res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      nodeId: this.syncManager.nodeId,
      connectedPeers: this.syncManager.connectedPeers.size,
      connectedNodes: this.syncManager.connectedNodes.size
    }));

    // Cache routes
    this.app.get('/api/cache/:key', this.getCacheItem.bind(this));
    this.app.post('/api/cache', this.setCacheItem.bind(this));
    this.app.delete('/api/cache/:key', this.deleteCacheItem.bind(this));
    this.app.delete('/api/cache', this.clearCache.bind(this));

    this.app.get('/api/cache', this.getAllCacheItems.bind(this));
    this.app.post('/api/strategy', this.changeStrategy.bind(this));
    this.app.get('/api/metrics', this.getMetrics.bind(this));

    // Sync routes
    this.app.get('/api/sync/status', this.getSyncStatus.bind(this));
    this.app.get('/api/sync/history', this.getSyncHistory.bind(this));
    this.app.post('/api/sync/toggle', this.toggleSync.bind(this));
    this.app.post('/api/sync/force', this.forceSync.bind(this));

    // Bulk operations
    this.app.post('/api/cache/bulk', this.bulkSetItems.bind(this));
    this.app.delete('/api/cache/bulk', this.bulkDeleteItems.bind(this));

    this.app.use(this.errorHandler.bind(this));
  }

  setupWebSocketEvents() {
    this.io.on('connection', (socket) => {
      console.log(`🟢 WebSocket client connected: ${socket.id}`);
      
      // Send initial state
      socket.emit('cache-state', {
        items: this.cache.getAll(),
        metrics: this.cache.getMetrics(),
        strategy: this.currentStrategy
      });

      // Send sync status
      socket.emit('sync-status', this.syncManager.getSyncStats());

      socket.on('get-cache-state', () => {
        socket.emit('cache-state', {
          items: this.cache.getAll(),
          metrics: this.cache.getMetrics(),
          strategy: this.currentStrategy
        });
      });

      socket.on('get-sync-status', () => {
        socket.emit('sync-status', this.syncManager.getSyncStats());
      });

      socket.on('disconnect', () => {
        console.log(`🔴 WebSocket client disconnected: ${socket.id}`);
      });
    });

    // Broadcast updates every 5 seconds
    setInterval(() => {
      this.io.emit('cache-state', {
        items: this.cache.getAll(),
        metrics: this.cache.getMetrics(),
        strategy: this.currentStrategy
      });
      
      this.io.emit('sync-status', this.syncManager.getSyncStats());
    }, 5000);
  }

  // ✅ MISSING METHODS - Add these to fix the error

  getCacheItem(req, res) {
    try {
      const { key } = req.params;
      const value = this.cache.get(key);
      
      if (value !== undefined) {
        res.json({ 
          success: true, 
          key, 
          value,
          timestamp: new Date().toISOString()
        });
      } else {
        res.status(404).json({ 
          success: false, 
          message: 'Key not found',
          key 
        });
      }
    } catch (error) {
      res.status(500).json({ 
        success: false, 
        message: 'Error retrieving cache item',
        error: error.message 
      });
    }
  }

  setCacheItem(req, res) {
    try {
      const { key, value } = req.body;
      
      if (!key) {
        return res.status(400).json({ 
          success: false, 
          message: 'Key is required' 
        });
      }

      this.cache.set(key, value);
      
      // Broadcast to other nodes
      this.syncManager.broadcastOperation({
        type: 'set',
        key,
        value
      });

      // Emit to connected clients
      this.io.emit('cache-update', {
        type: 'set',
        key,
        value,
        timestamp: new Date().toISOString()
      });

      res.json({ 
        success: true, 
        message: 'Item cached successfully',
        key,
        value
      });
    } catch (error) {
      res.status(500).json({ 
        success: false, 
        message: 'Error setting cache item',
        error: error.message 
      });
    }
  }

  deleteCacheItem(req, res) {
    try {
      const { key } = req.params;
      const existed = this.cache.delete(key);
      
      if (existed) {
        // Broadcast to other nodes
        this.syncManager.broadcastOperation({
          type: 'delete',
          key
        });

        // Emit to connected clients
        this.io.emit('cache-update', {
          type: 'delete',
          key,
          timestamp: new Date().toISOString()
        });

        res.json({ 
          success: true, 
          message: 'Item deleted successfully',
          key 
        });
      } else {
        res.status(404).json({ 
          success: false, 
          message: 'Key not found',
          key 
        });
      }
    } catch (error) {
      res.status(500).json({ 
        success: false, 
        message: 'Error deleting cache item',
        error: error.message 
      });
    }
  }

  clearCache(req, res) {
    try {
      this.cache.clear();
      
      // Broadcast to other nodes
      this.syncManager.broadcastOperation({
        type: 'clear'
      });

      // Emit to connected clients
      this.io.emit('cache-update', {
        type: 'clear',
        timestamp: new Date().toISOString()
      });

      res.json({ 
        success: true, 
        message: 'Cache cleared successfully' 
      });
    } catch (error) {
      res.status(500).json({ 
        success: false, 
        message: 'Error clearing cache',
        error: error.message 
      });
    }
  }

  getAllCacheItems(req, res) {
    try {
      const items = this.cache.getAll();
      res.json({ 
        success: true, 
        items,
        count: items.length,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      res.status(500).json({ 
        success: false, 
        message: 'Error retrieving cache items',
        error: error.message 
      });
    }
  }

  changeStrategy(req, res) {
    try {
      const { strategy } = req.body;
      
      if (!['LRU', 'LFU'].includes(strategy)) {
        return res.status(400).json({ 
          success: false, 
          message: 'Invalid strategy. Must be LRU or LFU' 
        });
      }

      // Save current data
      const currentData = this.cache.getAll();
      
      // Create new cache with new strategy
      const capacity = this.cache.capacity;
      this.cache = strategy === 'LRU' 
        ? new LRUCache(capacity)
        : new LFUCache(capacity);
      
      // Restore data
      currentData.forEach(({ key, value }) => {
        this.cache.set(key, value);
      });

      this.currentStrategy = strategy;

      res.json({ 
        success: true, 
        message: `Strategy changed to ${strategy}`,
        strategy: this.currentStrategy
      });
    } catch (error) {
      res.status(500).json({ 
        success: false, 
        message: 'Error changing strategy',
        error: error.message 
      });
    }
  }

  getMetrics(req, res) {
    try {
      const metrics = this.cache.getMetrics();
      res.json({ 
        success: true, 
        metrics: {
          ...metrics,
          strategy: this.currentStrategy,
          nodeId: this.syncManager.nodeId,
          connectedPeers: this.syncManager.connectedPeers.size,
          connectedNodes: this.syncManager.connectedNodes.size
        }
      });
    } catch (error) {
      res.status(500).json({ 
        success: false, 
        message: 'Error retrieving metrics',
        error: error.message 
      });
    }
  }

  getSyncStatus(req, res) {
    try {
      const status = this.syncManager.getSyncStats();
      res.json({ 
        success: true, 
        syncStatus: status
      });
    } catch (error) {
      res.status(500).json({ 
        success: false, 
        message: 'Error retrieving sync status',
        error: error.message 
      });
    }
  }

  getSyncHistory(req, res) {
    try {
      const limit = parseInt(req.query.limit) || 20;
      const history = this.syncManager.getSyncHistory(limit);
      res.json({ 
        success: true, 
        history,
        count: history.length
      });
    } catch (error) {
      res.status(500).json({ 
        success: false, 
        message: 'Error retrieving sync history',
        error: error.message 
      });
    }
  }

  toggleSync(req, res) {
    try {
      const enabled = this.syncManager.toggleSync();
      res.json({ 
        success: true, 
        message: `Sync ${enabled ? 'enabled' : 'disabled'}`,
        syncEnabled: enabled
      });
    } catch (error) {
      res.status(500).json({ 
        success: false, 
        message: 'Error toggling sync',
        error: error.message 
      });
    }
  }

  forceSync(req, res) {
    try {
      this.syncManager.forceSync();
      res.json({ 
        success: true, 
        message: 'Force sync initiated'
      });
    } catch (error) {
      res.status(500).json({ 
        success: false, 
        message: 'Error forcing sync',
        error: error.message 
      });
    }
  }

  bulkSetItems(req, res) {
    try {
      const { items } = req.body;
      
      if (!Array.isArray(items)) {
        return res.status(400).json({ 
          success: false, 
          message: 'Items must be an array' 
        });
      }

      const results = [];
      items.forEach(({ key, value }) => {
        if (key) {
          this.cache.set(key, value);
          results.push({ key, success: true });
          
          // Broadcast each item
          this.syncManager.broadcastOperation({
            type: 'set',
            key,
            value
          });
        } else {
          results.push({ key, success: false, message: 'Key is required' });
        }
      });

      // Emit to connected clients
      this.io.emit('cache-update', {
        type: 'bulk-set',
        items: results.filter(r => r.success),
        timestamp: new Date().toISOString()
      });

      res.json({ 
        success: true, 
        message: 'Bulk set completed',
        results
      });
    } catch (error) {
      res.status(500).json({ 
        success: false, 
        message: 'Error bulk setting items',
        error: error.message 
      });
    }
  }

  bulkDeleteItems(req, res) {
    try {
      const { keys } = req.body;
      
      if (!Array.isArray(keys)) {
        return res.status(400).json({ 
          success: false, 
          message: 'Keys must be an array' 
        });
      }

      const results = [];
      keys.forEach(key => {
        const existed = this.cache.delete(key);
        results.push({ key, success: existed });
        
        if (existed) {
          // Broadcast deletion
          this.syncManager.broadcastOperation({
            type: 'delete',
            key
          });
        }
      });

      // Emit to connected clients
      this.io.emit('cache-update', {
        type: 'bulk-delete',
        keys: results.filter(r => r.success).map(r => r.key),
        timestamp: new Date().toISOString()
      });

      res.json({ 
        success: true, 
        message: 'Bulk delete completed',
        results
      });
    } catch (error) {
      res.status(500).json({ 
        success: false, 
        message: 'Error bulk deleting items',
        error: error.message 
      });
    }
  }

  errorHandler(error, req, res, next) {
    console.error('🚨 Server Error:', error);
    
    if (res.headersSent) {
      return next(error);
    }

    res.status(500).json({
      success: false,
      message: 'Internal Server Error',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
    });
  }

  start() {
    const PORT = process.env.PORT || 5000;
    this.server.listen(PORT, '0.0.0.0', () => {
      console.log(`🚀 Distributed Cache Server running on port ${PORT}`);
      console.log(`📊 Cache Strategy: ${this.currentStrategy}`);
      console.log(`🔄 Node ID: ${this.syncManager.nodeId}`);
      console.log(`💾 Cache Capacity: ${this.cache.capacity}`);
      console.log(`🌐 Server URL: ${process.env.SELF_URL || `http://localhost:${PORT}`}`);
    });
  }
}

if (require.main === module) {
  const server = new CacheServer();
  server.start();
}

module.exports = CacheServer;