# 🚀 Distributed Cache Server

A robust, scalable distributed cache system with real-time synchronization, monitoring dashboard, and support for LRU/LFU strategies.

---

## 📚 Table of Contents

- [🚀 Distributed Cache Server](#-distributed-cache-server)
  - [📚 Table of Contents](#-table-of-contents)
  - [📝 Overview](#-overview)
  - [🏗️ Main Structure \& Flow](#️-main-structure--flow)
  - [🧠 Caching Strategies: LRU vs LFU](#-caching-strategies-lru-vs-lfu)
    - [LRU (Least Recently Used)](#lru-least-recently-used)
    - [LFU (Least Frequently Used)](#lfu-least-frequently-used)
    - [Runtime Strategy Switching](#runtime-strategy-switching)
  - [🛡️ Middleware Setup](#️-middleware-setup)
  - [🛣️ API Routes Breakdown](#️-api-routes-breakdown)
    - [Health Check Routes](#health-check-routes)
    - [Cache CRUD Operations](#cache-crud-operations)
    - [Bulk Operations](#bulk-operations)
    - [Metrics Endpoint](#metrics-endpoint)
  - [🔌 WebSocket \& Real-time Communication](#-websocket--real-time-communication)
  - [🔄 SyncManager Module](#-syncmanager-module)
  - [🛑 Error Handling](#-error-handling)
  - [⚙️ Environment Configuration](#️-environment-configuration)
  - [🏛️ Architecture \& Improvements](#️-architecture--improvements)
  - [🌟 Key Benefits](#-key-benefits)
- [Distributed Caching System - Complete Guide](#distributed-caching-system---complete-guide)
  - [🧠 Part 1: High-Level Overview](#-part-1-high-level-overview)
    - [What is a Distributed Caching System?](#what-is-a-distributed-caching-system)
    - [Purpose of This Project](#purpose-of-this-project)
    - [Why LRU and LFU Caching?](#why-lru-and-lfu-caching)
    - [Role of Peer Node Synchronization](#role-of-peer-node-synchronization)
    - [Frontend Dashboard Visualization](#frontend-dashboard-visualization)
  - [🧠 Part 2: Overall Architecture](#-part-2-overall-architecture)
  - [🧠 Part 3: Code Explanation — Feature-by-Feature](#-part-3-code-explanation--feature-by-feature)
    - [✅ Server Setup (`CacheServer` class)](#-server-setup-cacheserver-class)
    - [✅ Middleware Stack](#-middleware-stack)
    - [✅ LRU \& LFU Cache Logic](#-lru--lfu-cache-logic)
    - [✅ Cache API Operations](#-cache-api-operations)
    - [✅ WebSocket Events](#-websocket-events)
  - [🧠 Part 4: Peer-to-Peer Sync Logic (`SyncManager` class)](#-part-4-peer-to-peer-sync-logic-syncmanager-class)
    - [Node Discovery \& Connection Process](#node-discovery--connection-process)
    - [Synchronization Events](#synchronization-events)
    - [Connection Types](#connection-types)
    - [Node List Broadcasting](#node-list-broadcasting)
  - [🧠 Part 5: Sync History \& Metrics](#-part-5-sync-history--metrics)
    - [Sync History Management](#sync-history-management)
    - [Metrics Collection](#metrics-collection)
    - [API Endpoints for Monitoring](#api-endpoints-for-monitoring)
  - [🧠 Part 6: Key Features Summary](#-part-6-key-features-summary)
    - [Real-time Synchronization](#real-time-synchronization)
    - [Monitoring \& Debugging](#monitoring--debugging)
    - [Production Considerations](#production-considerations)
    - [Scalability Features](#scalability-features)

---

## 📝 Overview

This project implements a distributed cache server with real-time synchronization between nodes and a modern React dashboard for monitoring and management. It supports both **LRU (Least Recently Used)** and **LFU (Least Frequently Used)** cache strategies, and provides a RESTful API for cache operations.

---

## 🏗️ Main Structure & Flow

**CacheServer Class**

```js
class CacheServer {
  constructor() {
    this.app = express();           // Express app
    this.server = http.createServer(this.app);  // HTTP server
    this.io = socketIo(this.server);           // WebSocket server
    this.cache = new LRUCache(100);            // Default LRU cache
    this.syncManager = new SyncManager();      // Peer sync manager
  }
}
```

**Real-world analogy:**  
- `app` = Main library building  
- `server` = Security guard managing entry/exit  
- `io` = Intercom system for real-time announcements  
- `cache` = Book storage system (LRU/LFU)  
- `syncManager` = Network connecting multiple library branches  

**Why `http.createServer()` + socket.io?**

- Express alone = Only HTTP requests (one-way communication)
- HTTP + Socket.IO = HTTP + WebSocket (two-way real-time communication)
- Use case: When cache updates, all connected clients get instant notifications

**start() Method**

```js
start() {
  const PORT = process.env.PORT || 5000;
  this.server.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
  });
}
```

- Creates actual server socket
- Binds to port (5000 default)
- Starts accepting connections

---

## 🧠 Caching Strategies: LRU vs LFU

### LRU (Least Recently Used)

> When cache is full, removes item that wasn't accessed for longest time

```js
// Example: Cache capacity = 3
// Add: A, B, C (cache full)
// Access: A (A moves to front)
// Add: D → B gets removed (least recently used)
```

### LFU (Least Frequently Used)

> When cache is full, removes item with lowest access count

```js
// Example: Cache capacity = 3
// Add: A(count=1), B(count=3), C(count=2)
// Add: D → A gets removed (lowest frequency)
```

### Runtime Strategy Switching

```js
async changeStrategy(req, res) {
  const { strategy } = req.body;
  // Save current data
  const currentData = this.cache.getAll();
  const capacity = this.cache.capacity;
  // Switch strategy
  this.cache = strategy === 'LRU' ? new LRUCache(capacity) : new LFUCache(capacity);
  // Restore data
  currentData.forEach(item => this.cache.set(item.key, item.value));
  // Sync with peers
  this.syncManager.broadcastOperation({ type: 'strategy-change', strategy });
}
```

**Analogy:** Library changing from "remove oldest borrowed book" to "remove least popular book".

---

## 🛡️ Middleware Setup

**Security & Performance Middleware**

```js
setupMiddleware() {
  this.app.use(helmet());        // Security headers
  this.app.use(compression());   // Gzip compression
  this.app.use(cors({
    origin: process.env.FRONTEND_URL || "http://localhost:3000",
    credentials: true
  }));
  this.app.use(express.json({ limit: '10mb' }));  // JSON parsing
}
```

- `helmet()`: Adds security headers (XSS protection, etc.)
- `compression()`: Reduces response size (faster loading)
- `cors()`: Allows frontend to access API from different domain
- `express.json()`: Parses JSON requests, max 10MB

**Custom Logger**

```js
this.app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});
```

Logs every request with timestamp — useful for debugging and monitoring.

---

## 🛣️ API Routes Breakdown

### Health Check Routes

```js
// For uptime monitoring services (UptimeRobot, Pingdom)
this.app.get('/ping', (req, res) => {
  res.status(200).send("pong - " + new Date().toISOString());
});

// Detailed health info
this.app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    nodeId: this.syncManager.nodeId
  });
});
```

### Cache CRUD Operations

```js
// GET /api/cache/mykey
async getCacheItem(req, res) {
  const item = this.cache.get(key);
  if (item) {
    item.accessCount++;  // Track access frequency
    res.json({ success: true, value: item });
  } else {
    res.status(404).json({ message: 'Key not found' });
  }
}

// POST /api/cache { key: "mykey", value: "myvalue" }
async setCacheItem(req, res) {
  this.cache.set(key, {
    value,
    timestamp: new Date().toISOString(),
    accessCount: 1
  });
  // Sync with peer nodes
  this.syncManager.broadcastOperation({ type: 'set', key, value });
  // Notify WebSocket clients
  this.broadcastCacheUpdate();
}
```

### Bulk Operations

```js
// POST /api/cache/bulk
// Body: { items: [{ key: "k1", value: "v1" }, { key: "k2", value: "v2" }] }
async bulkSetItems(req, res) {
  const { items } = req.body;
  let successCount = 0;
  items.forEach(item => {
    this.cache.set(item.key, item.value);
    successCount++;
    this.syncManager.broadcastOperation({ type: 'set', key: item.key, value: item.value });
  });
  res.json({ successCount, totalCount: items.length });
}
```

**Why bulk?**  
Instead of 100 separate API calls, make 1 call with 100 items — reduces network overhead and improves performance.

### Metrics Endpoint

```js
// GET /api/metrics
async getMetrics(req, res) {
  res.json({
    cache: this.cache.getMetrics(),  // Hit rate, miss rate, size
    sync: this.syncManager.getSyncStats(),  // Peer status, sync count
    server: {
      uptime: process.uptime(),
      memory: process.memoryUsage()
    }
  });
}
```

Returns:  
- Cache hit/miss ratio  
- Memory usage  
- Sync status with peers  
- Server uptime  

---

## 🔌 WebSocket & Real-time Communication

**Why WebSockets in Cache Server?**

```js
setupWebSocketEvents() {
  this.io.on('connection', (socket) => {
    // Send current cache state to new client
    socket.emit('cache-state', {
      items: this.cache.getAll(),
      metrics: this.cache.getMetrics(),
      strategy: this.currentStrategy
    });
  });
}
```

**Analogy:**  
Library's digital display board showing:  
- Current books available  
- Popular books  
- System status  
- Updates in real-time when books are borrowed/returned

**Real-time Broadcasts**

```js
broadcastCacheUpdate() {
  this.io.emit('cache-state', {
    items: this.cache.getAll(),
    metrics: this.cache.getMetrics(),
    strategy: this.currentStrategy
  });
}
```

**Triggers:**  
- When item is added/deleted  
- When cache is cleared  
- When strategy is changed  
- When sync operation completes  

---

## 🔄 SyncManager Module

**Role of SyncManager**

```js
// In constructor
const peerNodes = process.env.PEER_NODES.split(',');
this.syncManager = new SyncManager(this.cache, this.io, peerNodes);
```

**Purpose:** Keeps multiple cache servers synchronized

**How Sync Works**

```js
// When local cache is updated
this.syncManager.broadcastOperation({ 
  type: 'set', 
  key: 'mykey', 
  value: 'myvalue' 
});

// This internally:
// 1. Sends HTTP/WebSocket request to all peer nodes
// 2. Each peer updates their local cache
// 3. Tracks sync success/failure
// 4. Maintains sync history
```

**Analogy:**  
When one library branch gets new books, it notifies all other branches to update their catalogs

**Sync Control APIs**

```js
// POST /api/sync/toggle - Enable/disable sync
async toggleSync(req, res) {
  const enabled = this.syncManager.toggleSync();
  res.json({ syncEnabled: enabled });
}

// POST /api/sync/force - Force sync with all peers
async forceSync(req, res) {
  this.syncManager.forceSync();
  res.json({ message: 'Force sync initiated' });
}

// GET /api/sync/status - Check peer connectivity
async getSyncStatus(req, res) {
  const syncStats = this.syncManager.getSyncStats();
  res.json({ ...syncStats });
}
```

---

## 🛑 Error Handling

**Global Error Handler**

```js
errorHandler(error, req, res, next) {
  console.error('Server Error:', error);
  res.status(500).json({ 
    success: false, 
    message: 'Internal server error',
    error: process.env.NODE_ENV === 'development' ? error.message : undefined
  });
}
```

- Logs all errors to console
- In development: Shows full error details
- In production: Shows generic error message (security)
- Always returns JSON response

**Error Handling in Routes**

```js
async setCacheItem(req, res) {
  try {
    const { key, value } = req.body;
    // Validation
    if (!key || value === undefined) {
      return res.status(400).json({ 
        success: false, 
        message: 'Key and value are required' 
      });
    }
    // Cache operation
    this.cache.set(key, value);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
}
```

---

## ⚙️ Environment Configuration

**Key Environment Variables**

```env
PORT=5000
CACHE_CAPACITY=1000
PEER_NODES=http://node1.com:5000,http://node2.com:5000
FRONTEND_URL=https://mycache-frontend.com
NODE_ENV=production
```

**Usage in Code:**

```js
// Server port
const PORT = process.env.PORT || 5000;

// Cache size
this.cache = new LRUCache(parseInt(process.env.CACHE_CAPACITY) || 100);

// Peer nodes for sync
const peerNodes = process.env.PEER_NODES
  ? process.env.PEER_NODES.split(',').map(url => url.trim())
  : [];

// CORS origin
this.app.use(cors({
  origin: process.env.FRONTEND_URL || "http://localhost:3000"
}));
```

**Deployment Platforms**

- Render: Easy deployment, good for small projects
- Railway: Modern platform with better performance
- Heroku: Popular but expensive
- AWS/GCP: For enterprise scale

---

## 🏛️ Architecture & Improvements

**Current Architecture**

```
Frontend (React/Vue) 
    ↕ (WebSocket + HTTP)
Cache Server Node 1 ← → Cache Server Node 2
    ↕ (Sync)              ↕ (Sync)
Cache Server Node 3 ← → Cache Server Node 4
```

**Possible Improvements**

1. **TTL (Time To Live) Expiry**
    ```js
    // Current: Items stay forever
    // Improvement: Add expiry time
    this.cache.set(key, value, { ttl: 3600 }); // 1 hour expiry
    ```
2. **Authentication**
    ```js
    // Add JWT middleware
    this.app.use('/api', authenticateToken);
    ```
3. **Rate Limiting**
    ```js
    const rateLimit = require('express-rate-limit');
    this.app.use('/api', rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 100 // limit each IP to 100 requests per windowMs
    }));
    ```
4. **Persistence**
    ```js
    // Save cache to disk/database
    setInterval(() => {
      fs.writeFileSync('cache-backup.json', JSON.stringify(this.cache.getAll()));
    }, 60000); // Every minute
    ```

**Debugging Sync Issues**

```sh
# Check sync status
GET /api/sync/status

# Check sync history
GET /api/sync/history?limit=50

# Force sync
POST /api/sync/force

# Toggle sync on/off
POST /api/sync/toggle
```

**Scaling with More Nodes**

```env
# Add more nodes in .env
PEER_NODES=node1.com:5000,node2.com:5000,node3.com:5000,node4.com:5000
```

SyncManager automatically handles:
- Connection management
- Failure recovery
- Conflict resolution
- Load balancing

---

## 🌟 Key Benefits

- **Distributed:** Multiple nodes working together
- **Real-time:** Instant updates via WebSocket
- **Flexible:** Switch between LRU/LFU strategies
- **Resilient:** Handles node failures gracefully
- **Monitorable:** Rich metrics and sync status
- **Scalable:** Easy to add more nodes

---

> This architecture is perfect for applications needing fast, distributed caching with real-time




server.js + syncMAnage.js

# Distributed Caching System - Complete Guide

## 🧠 Part 1: High-Level Overview

### What is a Distributed Caching System?
A distributed caching system is a network of cache servers that work together to store and retrieve data across multiple nodes. Unlike a single cache server, distributed caching provides:
- **Scalability**: Multiple nodes can handle more requests
- **Fault Tolerance**: If one node fails, others continue working
- **Data Distribution**: Cache data is spread across multiple locations
- **Consistency**: All nodes maintain synchronized data

### Purpose of This Project
This project implements a **peer-to-peer distributed cache** where:
- Multiple cache servers can run simultaneously
- Each server maintains its own cache (LRU or LFU)
- All servers synchronize their data in real-time
- Frontend dashboard provides live monitoring
- No single point of failure (truly distributed)

### Why LRU and LFU Caching?
- **LRU (Least Recently Used)**: Evicts items that haven't been accessed recently
  - Best for: Applications with temporal locality (recently used items likely to be used again)
  - Use case: Web sessions, recent user data
- **LFU (Least Frequently Used)**: Evicts items with lowest access frequency
  - Best for: Applications where popular items should stay longer
  - Use case: Content delivery, popular product catalogs

### Role of Peer Node Synchronization
- **Consistency**: All nodes have the same data
- **Fault Tolerance**: If one node fails, others have the data
- **Load Distribution**: Requests can be served by any node
- **Real-time Updates**: Changes propagate instantly across all nodes

### Frontend Dashboard Visualization
The dashboard shows:
- Real-time cache contents and metrics
- Node connectivity status
- Sync history and operations
- Performance metrics (hit/miss ratios)
- Cache strategy switching interface

## 🧠 Part 2: Overall Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    DISTRIBUTED CACHE SYSTEM                     │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   CACHE NODE A  │    │   CACHE NODE B  │    │   CACHE NODE C  │
│  (Port 5000)    │    │  (Port 5001)    │    │  (Port 5002)    │
├─────────────────┤    ├─────────────────┤    ├─────────────────┤
│ Express Server  │    │ Express Server  │    │ Express Server  │
│ Socket.io       │    │ Socket.io       │    │ Socket.io       │
│ LRU/LFU Cache   │    │ LRU/LFU Cache   │    │ LRU/LFU Cache   │
│ SyncManager     │    │ SyncManager     │    │ SyncManager     │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         │    WebSocket P2P      │    WebSocket P2P      │
         │◄─────────────────────►│◄─────────────────────►│
         │                       │                       │
         └───────────────────────┼───────────────────────┘
                                 │
                                 │ HTTP/WebSocket
                                 ▼
                    ┌─────────────────────────┐
                    │   FRONTEND DASHBOARD    │
                    │                         │
                    │ • Real-time cache view  │
                    │ • Node status monitor   │
                    │ • Sync history         │
                    │ • Performance metrics  │
                    │ • Strategy switching   │
                    └─────────────────────────┘

COMMUNICATION FLOWS:
─────────────────────
• HTTP API: Frontend ↔ Any Cache Node (REST operations)
• WebSocket: Frontend ↔ Cache Node (real-time updates)
• WebSocket P2P: Cache Node ↔ Cache Node (sync operations)
```

## 🧠 Part 3: Code Explanation — Feature-by-Feature

### ✅ Server Setup (`CacheServer` class)

```javascript
class CacheServer {
  constructor() {
    this.app = express();                    // HTTP server
    this.server = http.createServer(this.app); // HTTP server wrapper
    this.io = socketIo(this.server);        // WebSocket server
    
    // Cache initialization
    this.currentStrategy = 'LRU';
    this.cache = new LRUCache(capacity);
    
    // Peer nodes from environment
    const peerNodes = process.env.PEER_NODES?.split(',') || [];
    
    // Initialize synchronization manager
    this.syncManager = new SyncManager(this.cache, this.io, peerNodes);
  }
}
```

**Key Routes Exposed:**
- `GET /api/cache/:key` - Retrieve cached item
- `POST /api/cache` - Store new item
- `DELETE /api/cache/:key` - Remove item
- `DELETE /api/cache` - Clear entire cache
- `POST /api/strategy` - Switch between LRU/LFU
- `GET /api/metrics` - Get cache and sync statistics
- `GET /api/sync/status` - Get synchronization status
- `POST /api/sync/toggle` - Enable/disable sync
- `POST /api/sync/force` - Force full synchronization

**Startup Process:**
1. Initialize Express server with middleware
2. Create cache instance (LRU by default)
3. Parse peer nodes from environment variables
4. Initialize SyncManager with peers
5. Setup HTTP routes and WebSocket handlers
6. Start server on specified port
7. Begin peer connection attempts (with 4s delay for cold starts)

### ✅ Middleware Stack

```javascript
setupMiddleware() {
  this.app.use(helmet());        // Security headers
  this.app.use(compression());   // Response compression
  this.app.use(cors({            // Cross-origin requests
    origin: process.env.FRONTEND_URL,
    credentials: true
  }));
  this.app.use(express.json({ limit: '10mb' })); // JSON parsing
  this.app.use(express.urlencoded({ extended: true })); // URL encoding
  
  // Custom request logger
  this.app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
    next();
  });
}
```

**Why Each Middleware:**
- **Helmet**: Adds security headers (XSS protection, content type sniffing prevention)
- **Compression**: Reduces response size using gzip/deflate
- **CORS**: Allows frontend to make requests from different domain
- **JSON Parser**: Handles JSON request bodies (up to 10MB)
- **URL Encoder**: Handles form-encoded data
- **Logger**: Tracks all incoming requests with timestamps

### ✅ LRU & LFU Cache Logic

**LRU (Least Recently Used):**
```javascript
// Conceptual LRU implementation
class LRUCache {
  constructor(capacity) {
    this.capacity = capacity;
    this.cache = new Map(); // Maintains insertion order
  }
  
  get(key) {
    if (this.cache.has(key)) {
      const value = this.cache.get(key);
      this.cache.delete(key);  // Remove from current position
      this.cache.set(key, value); // Add to end (most recent)
      return value;
    }
    return null;
  }
  
  set(key, value) {
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.capacity) {
      // Remove least recently used (first item)
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
    this.cache.set(key, value);
  }
}
```

**LFU (Least Frequently Used):**
```javascript
// Conceptual LFU implementation
class LFUCache {
  constructor(capacity) {
    this.capacity = capacity;
    this.cache = new Map();
    this.frequencies = new Map(); // Track access counts
  }
  
  get(key) {
    if (this.cache.has(key)) {
      this.frequencies.set(key, (this.frequencies.get(key) || 0) + 1);
      return this.cache.get(key);
    }
    return null;
  }
  
  set(key, value) {
    if (this.cache.size >= this.capacity && !this.cache.has(key)) {
      // Find least frequently used item
      let minFreq = Infinity;
      let leastFreqKey = null;
      
      for (let [k, freq] of this.frequencies) {
        if (freq < minFreq) {
          minFreq = freq;
          leastFreqKey = k;
        }
      }
      
      this.cache.delete(leastFreqKey);
      this.frequencies.delete(leastFreqKey);
    }
    
    this.cache.set(key, value);
    this.frequencies.set(key, (this.frequencies.get(key) || 0) + 1);
  }
}
```

### ✅ Cache API Operations

**GET Operation:**
```javascript
async getCacheItem(req, res) {
  const { key } = req.params;
  const item = this.cache.get(key);  // Cache hit/miss
  
  if (item) {
    // Update metadata
    item.timestamp = new Date().toISOString();
    item.accessCount = (item.accessCount || 0) + 1;
    this.cache.set(key, item);
    
    res.json({ success: true, key, value: item });
  } else {
    res.status(404).json({ success: false, message: 'Key not found' });
  }
  
  this.broadcastMetrics(); // Real-time metrics update
}
```

**SET Operation:**
```javascript
async setCacheItem(req, res) {
  const { key, value } = req.body;
  
  // Store in local cache
  this.cache.set(key, {
    value,
    timestamp: new Date().toISOString(),
    accessCount: 1
  });
  
  // Broadcast to all peer nodes
  this.syncManager.broadcastOperation({ type: 'set', key, value });
  
  res.json({ success: true, message: 'Item cached successfully' });
  this.broadcastCacheUpdate(); // Real-time UI update
}
```

**Strategy Switch:**
```javascript
async changeStrategy(req, res) {
  const { strategy } = req.body; // 'LRU' or 'LFU'
  
  // Preserve existing data
  const currentData = this.cache.getAll();
  const capacity = this.cache.capacity;
  
  // Create new cache instance
  this.cache = strategy === 'LRU' ? 
    new LRUCache(capacity) : 
    new LFUCache(capacity);
    
  // Restore data
  currentData.forEach(item => this.cache.set(item.key, item.value));
  
  // Update sync manager reference
  this.syncManager.cache = this.cache;
  
  // Broadcast strategy change to peers
  this.syncManager.broadcastOperation({ type: 'strategy-change', strategy });
}
```

### ✅ WebSocket Events

**Connection Handler:**
```javascript
setupWebSocketEvents() {
  this.io.on('connection', (socket) => {
    // Send initial cache state to new client
    socket.emit('cache-state', {
      items: this.cache.getAll(),
      metrics: this.cache.getMetrics(),
      strategy: this.currentStrategy
    });
    
    // Handle client requests for cache state
    socket.on('get-cache-state', () => {
      socket.emit('cache-state', {
        items: this.cache.getAll(),
        metrics: this.cache.getMetrics(),
        strategy: this.currentStrategy
      });
    });
  });
}
```

**Broadcast Functions:**
```javascript
broadcastCacheUpdate() {
  // Send to all connected frontends
  this.io.emit('cache-state', {
    items: this.cache.getAll(),
    metrics: this.cache.getMetrics(),
    strategy: this.currentStrategy
  });
}

broadcastMetrics() {
  // Send real-time metrics
  this.io.emit('metrics-update', this.cache.getMetrics());
}
```

## 🧠 Part 4: Peer-to-Peer Sync Logic (`SyncManager` class)

### Node Discovery & Connection Process

```javascript
connectToPeers() {
  this.peers.forEach((peerUrl) => {
    // Skip self-connection
    if (peerUrl === this.selfUrl) return;
    
    // Create outgoing socket connection
    const socket = Client(peerUrl, {
      reconnectionAttempts: 5,
      timeout: 5000,
      transports: ['websocket']
    });
    
    socket.on('connect', () => {
      console.log(`✅ Connected to peer: ${peerUrl}`);
      this.connectedPeers.set(peerUrl, socket);
      
      // Register this node with peer
      socket.emit('register-node', {
        nodeId: this.nodeId,
        port: process.env.PORT
      });
    });
  });
}
```

### Synchronization Events

**1. Node Registration:**
```javascript
socket.on('register-node', (nodeInfo) => {
  // Store peer information
  this.connectedNodes.set(socket.id, {
    ...nodeInfo,
    socketId: socket.id,
    lastSync: Date.now()
  });
  
  // Send full cache state to new node
  socket.emit('cache-sync', {
    type: 'full-sync',
    data: this.cache.getAll(),
    nodeId: this.nodeId,
    timestamp: Date.now()
  });
  
  // Update node list across all clients
  this.broadcastNodeList();
});
```

**2. Full Synchronization:**
```javascript
socket.on('cache-sync', (syncData) => {
  if (syncData.nodeId !== this.nodeId) {
    console.log(`📥 Received full-sync from ${syncData.nodeId}`);
    
    // Apply all received data
    syncData.data.forEach(({ key, value }) => {
      this.cache.set(key, value);
    });
    
    socket.lastSync = Date.now();
    this.broadcastNodeList();
  }
});
```

**3. Operation Broadcasting:**
```javascript
broadcastOperation(operation) {
  if (!this.syncEnabled) return;
  
  const syncData = {
    ...operation,
    nodeId: this.nodeId,
    timestamp: Date.now(),
    operationId: uuidv4()
  };
  
  // Send to all incoming connections (server mode)
  this.io.emit('cache-operation', syncData);
  
  // Send to all outgoing connections (client mode)
  this.connectedPeers.forEach((socket) => {
    socket.emit('cache-operation', syncData);
  });
  
  this.addToSyncHistory(syncData);
}
```

**4. Remote Operation Handling:**
```javascript
handleRemoteOperation(operation, fromSocketId = null) {
  // Ignore operations from self
  if (operation.nodeId === this.nodeId) return;
  
  try {
    switch (operation.type) {
      case 'set':
        this.cache.set(operation.key, operation.value);
        break;
      case 'delete':
        this.cache.delete(operation.key);
        break;
      case 'clear':
        this.cache.clear();
        break;
      case 'strategy-change':
        // Handle strategy changes
        break;
    }
    
    // Record in sync history
    this.addToSyncHistory({
      ...operation,
      source: 'remote',
      fromNode: fromSocketId || operation.nodeId
    });
  } catch (err) {
    console.error('❌ Error handling remote operation:', err);
  }
}
```

### Connection Types

**Two-Way Connections:**
- **Incoming**: Other nodes connect to this node (server mode)
- **Outgoing**: This node connects to other nodes (client mode)

```javascript
// Track both connection types
this.connectedPeers = new Map();  // outgoing connections
this.connectedNodes = new Map();  // incoming connections
```

### Node List Broadcasting

```javascript
broadcastNodeList() {
  // Compile information from both connection types
  const serverNodes = Array.from(this.connectedNodes.values());
  const peerNodes = Array.from(this.connectedPeers.entries());
  
  // Send to all frontends
  this.io.emit('node-list-update', {
    nodes: [...serverNodes, ...peerNodes],
    totalNodes: serverNodes.length + peerNodes.length + 1,
    currentNode: this.nodeId
  });
}
```

## 🧠 Part 5: Sync History & Metrics

### Sync History Management

```javascript
addToSyncHistory(operation) {
  // Add to beginning of array
  this.syncHistory.unshift({ 
    ...operation, 
    id: uuidv4() 
  });
  
  // Maintain maximum 100 operations
  if (this.syncHistory.length > 100) {
    this.syncHistory = this.syncHistory.slice(0, 100);
  }
}

getSyncHistory(limit = 20) {
  return this.syncHistory.slice(0, limit);
}
```

### Metrics Collection

```javascript
getSyncStats() {
  return {
    nodeId: this.nodeId,
    connectedNodes: this.connectedNodes.size + this.connectedPeers.size,
    syncEnabled: this.syncEnabled,
    totalSyncOperations: this.syncHistory.length,
    lastSyncTime: this.syncHistory.length > 0 ? 
      this.syncHistory[0].timestamp : null,
    nodeList: [
      ...Array.from(this.connectedNodes.values()),
      ...Array.from(this.connectedPeers.entries())
    ]
  };
}
```

### API Endpoints for Monitoring

```javascript
// GET /api/metrics - Complete system metrics
async getMetrics(req, res) {
  const cacheMetrics = this.cache.getMetrics();
  const syncStats = this.syncManager.getSyncStats();
  
  res.json({
    cache: cacheMetrics,      // Hit/miss ratios, capacity usage
    sync: syncStats,          // Node connections, sync operations
    server: {                 // Server health
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      timestamp: Date.now()
    }
  });
}

// GET /api/sync/history - Recent sync operations
async getSyncHistory(req, res) {
  const limit = parseInt(req.query.limit) || 20;
  const history = this.syncManager.getSyncHistory(limit);
  res.json({ success: true, history });
}
```

## 🧠 Part 6: Key Features Summary

### Real-time Synchronization
- **Event-driven**: Operations broadcast immediately via WebSocket
- **Bidirectional**: Each node can be both client and server
- **Fault-tolerant**: Handles disconnections and reconnections
- **Consistent**: All nodes maintain identical cache state

### Monitoring & Debugging
- **Sync History**: Track all operations across nodes
- **Real-time Metrics**: Live performance monitoring
- **Node Status**: Track connections and health
- **Strategy Switching**: Hot-swap between LRU/LFU

### Production Considerations
- **Environment Variables**: Configure peers, capacity, URLs
- **Health Checks**: `/ping` and `/health` endpoints
- **Error Handling**: Comprehensive error catching and logging
- **Security**: Helmet, CORS, and request validation
- **Performance**: Compression and efficient data structures

### Scalability Features
- **Horizontal Scaling**: Add more nodes easily
- **Load Distribution**: Any node can serve requests
- **Bulk Operations**: Efficient batch processing
- **Configurable Capacity**: Per-node cache sizing

This distributed cache system provides a robust, scalable solution for applications requiring fast, consistent data access across multiple servers. The peer-to-peer architecture ensures no single point of failure while maintaining data consistency through real-time synchronization.