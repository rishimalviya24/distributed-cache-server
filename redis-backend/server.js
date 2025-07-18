// server.js - Fixed version
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
    
    // ✅ FIX: CORS configuration ko broader banao
    this.io = socketIo(this.server, {
      cors: {
        origin: "https://redis-frontend.onrender.com", // Ya specific URLs add karo
        methods: ['GET', 'POST', 'DELETE', 'PUT'],
        allowedHeaders: ['Content-Type', 'Authorization'],
        credentials: true
      },
      transports: ['websocket', 'polling'], // ✅ Both transports allow karo
      allowEIO3: true
    });

    this.currentStrategy = 'LRU';
    this.cache = new LRUCache(parseInt(process.env.CACHE_CAPACITY) || 100);

    // ✅ FIX: Environment variables properly parse karo
    const peerNodes = process.env.PEER_NODES
      ? process.env.PEER_NODES.split(',')
          .map(url => url.trim())
          .filter(url => url && url.length > 0) // Empty URLs filter out karo
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
      crossOriginResourcePolicy: false // ✅ FIX: Cross-origin requests allow karo
    }));
    this.app.use(compression());
    
    // ✅ FIX: CORS ko properly configure karo
    this.app.use(cors({
      origin: [
    'https://redis-frontend.onrender.com',
    'https://redis-node1-gx8k.onrender.com',
    'https://redis-node2-1i2v.onrender.com',
    'https://redis-node3-0d9j.onrender.com',
    'http://localhost:3000'
  ], // Ya specific domains add karo
      credentials: true,
      methods: ['GET', 'POST', 'DELETE', 'PUT', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
    }));
    
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true }));

    // ✅ FIX: Preflight requests handle karo
    this.app.options('*', cors());

    this.app.use((req, res, next) => {
      console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
      next();
    });
  }

  setupRoutes() {
    // ✅ FIX: Health check endpoint add karo
    this.app.get('/ping', (req, res) => res.json({ status: 'ok' }));
    this.app.head('/ping', (req, res) => res.status(200).end());
    
    this.app.get('/health', (req, res) => res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      nodeId: this.syncManager.nodeId,
      connectedPeers: this.syncManager.connectedPeers.size,
      connectedNodes: this.syncManager.connectedNodes.size
    }));

    // Rest of your routes...
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

  // Rest of your methods remain the same...
  setupWebSocketEvents() {
    this.io.on('connection', (socket) => {
      console.log(`🟢 WebSocket client connected: ${socket.id}`);
      
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

      socket.on('disconnect', () => {
        console.log(`🔴 WebSocket client disconnected: ${socket.id}`);
      });
    });
  }

  // ... rest of your methods remain the same

  start() {
    const PORT = process.env.PORT || 5000;
    this.server.listen(PORT, '0.0.0.0', () => { // ✅ FIX: All interfaces pe listen karo
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