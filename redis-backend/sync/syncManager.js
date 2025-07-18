const { v4: uuidv4 } = require("uuid");
const { io: Client } = require("socket.io-client");

class SyncManager {
  constructor(cacheInstance, io, peerNodes = []) {
    this.cache = cacheInstance;
    this.io = io;
    this.nodeId = uuidv4();
    this.syncEnabled = true;
    this.syncHistory = [];
    this.connectedPeers = new Map();
    this.connectedNodes = new Map();
    this.connections = [];
    
    // ✅ FIX: Self URL properly set karo
    this.selfUrl = process.env.SELF_URL || `http://localhost:${process.env.PORT}`;
    
    // ✅ FIX: Peers list se self URL remove karo
    this.peers = peerNodes.filter(peerUrl => {
      const isSelf = peerUrl === this.selfUrl || 
                    peerUrl.includes(`localhost:${process.env.PORT}`) ||
                    !peerUrl || peerUrl.trim() === '';
      if (isSelf) {
        console.log(`⚠️ Filtered out self/invalid peer: ${peerUrl}`);
      }
      return !isSelf;
    });

    console.log("🔗 [SyncManager] Starting with Node ID:", this.nodeId);
    console.log("🔗 [SyncManager] Self URL:", this.selfUrl);
    console.log("🔗 [SyncManager] Valid peers after filtering:", this.peers);

    this.setupSocketHandlers();

    // ✅ FIX: Render cold start ke liye delay badhaao
    setTimeout(() => this.connectToPeers(), 8000);
  }

  setupSocketHandlers() {
    this.io.on("connection", (socket) => {
      console.log(`🟢 Incoming node connected: ${socket.id}`);

      socket.on("register-node", (nodeInfo) => {
        console.log(`📥 Registered node: ${nodeInfo.nodeId} from ${nodeInfo.selfUrl}`);
        this.connectedNodes.set(socket.id, {
          ...nodeInfo,
          socketId: socket.id,
          lastSync: Date.now(),
        });

        // Respond with our node info
        socket.emit("register-node", {
          nodeId: this.nodeId,
          port: process.env.PORT,
          selfUrl: this.selfUrl
        });

        // Send full cache sync
        socket.emit("cache-sync", {
          type: "full-sync",
          data: this.cache.getAll(),
          nodeId: this.nodeId,
          timestamp: Date.now(),
        });

        this.broadcastNodeList();
      });

      socket.on("cache-operation", (operation) => {
        this.handleRemoteOperation(operation, socket.id);
      });

      socket.on("request-sync", () => {
        socket.emit("cache-sync", {
          type: "full-sync",
          data: this.cache.getAll(),
          nodeId: this.nodeId,
          timestamp: Date.now(),
        });
      });

      socket.on("disconnect", () => {
        this.connectedNodes.delete(socket.id);
        console.log(`🔴 Node disconnected (incoming): ${socket.id}`);
        this.broadcastNodeList();
      });
    });
  }

  connectToPeers() {
    console.log(`🔄 Attempting to connect to ${this.peers.length} peers...`);
    
    this.peers.forEach((peerUrl, index) => {
      // ✅ FIX: Each peer connection ko delay se start karo
      setTimeout(() => this.connectToPeer(peerUrl), index * 2000);
    });
  }

  connectToPeer(peerUrl) {
    // ✅ FIX: Already connected check karo
    if (this.connectedPeers.has(peerUrl)) {
      console.log(`⚠️ Already connected to peer: ${peerUrl}`);
      return;
    }

    console.log(`🔗 Attempting to connect to peer: ${peerUrl}`);

    const socket = Client(peerUrl, {
      reconnectionAttempts: 10, // ✅ FIX: Retry attempts badhaao
      reconnectionDelay: 2000,
      timeout: 10000, // ✅ FIX: Timeout badhaao
      transports: ['websocket', 'polling'], // ✅ FIX: Both transports try karo
      forceNew: true,
      autoConnect: true
    });

    // Connection timeout handler
    const connectionTimeout = setTimeout(() => {
      console.log(`⏰ Connection timeout for peer: ${peerUrl}`);
      socket.disconnect();
    }, 15000);

    socket.on("connect", () => {
      clearTimeout(connectionTimeout);
      console.log(`✅ Connected to peer: ${peerUrl}`);

      this.connectedPeers.set(peerUrl, socket);
      this.connections.push(socket);

      // Register with peer
      socket.emit("register-node", {
        nodeId: this.nodeId,
        port: process.env.PORT,
        selfUrl: this.selfUrl,
      });

      this.broadcastNodeList();
    });

    socket.on("register-node", (info) => {
      console.log(`📡 Peer ${peerUrl} registered as node: ${info.nodeId}`);
      socket.nodeId = info.nodeId;
      socket.lastSync = Date.now();
      this.broadcastNodeList();
    });

    socket.on("cache-sync", (syncData) => {
      if (syncData.nodeId !== this.nodeId) {
        console.log(`📥 Received sync from ${syncData.nodeId}`);
        syncData.data.forEach(({ key, value }) => {
          this.cache.set(key, value);
        });
        socket.lastSync = Date.now();
        this.broadcastNodeList();
      }
    });

    socket.on("cache-operation", (operation) => {
      this.handleRemoteOperation(operation);
    });

    socket.on("disconnect", (reason) => {
      clearTimeout(connectionTimeout);
      console.log(`🔌 Disconnected from peer: ${peerUrl} (Reason: ${reason})`);
      this.connectedPeers.delete(peerUrl);
      this.connections = this.connections.filter((s) => s !== socket);
      this.broadcastNodeList();
      
      // ✅ FIX: Auto-reconnect attempt after disconnect
      if (this.syncEnabled) {
        setTimeout(() => {
          console.log(`🔄 Attempting to reconnect to ${peerUrl}...`);
          this.connectToPeer(peerUrl);
        }, 5000);
      }
    });

    socket.on("connect_error", (err) => {
      clearTimeout(connectionTimeout);
      console.error(`❌ Failed to connect to ${peerUrl}: ${err.message}`);
      
      // ✅ FIX: Retry logic
      setTimeout(() => {
        if (this.syncEnabled && !this.connectedPeers.has(peerUrl)) {
          console.log(`🔄 Retrying connection to ${peerUrl}...`);
          this.connectToPeer(peerUrl);
        }
      }, 10000);
    });

    socket.on("error", (err) => {
      console.error(`🚨 Socket error for ${peerUrl}:`, err.message);
    });
  }

  broadcastOperation(operation) {
    if (!this.syncEnabled) return;

    const syncData = {
      ...operation,
      nodeId: this.nodeId,
      timestamp: Date.now(),
      operationId: uuidv4(),
    };

    // Broadcast to incoming connections
    this.io.emit("cache-operation", syncData);
    
    // Broadcast to outgoing peer connections
    this.connectedPeers.forEach((socket, peerUrl) => {
      if (socket.connected) {
        socket.emit("cache-operation", syncData);
      } else {
        console.log(`⚠️ Peer ${peerUrl} not connected, skipping broadcast`);
      }
    });

    this.addToSyncHistory(syncData);
  }

  handleRemoteOperation(operation, fromSocketId = null) {
    if (operation.nodeId === this.nodeId) return;

    try {
      switch (operation.type) {
        case "set":
          this.cache.set(operation.key, operation.value);
          break;
        case "delete":
          this.cache.delete(operation.key);
          break;
        case "clear":
          this.cache.clear();
          break;
      }

      this.addToSyncHistory({
        ...operation,
        source: "remote",
        fromNode: fromSocketId || operation.nodeId,
      });
    } catch (err) {
      console.error("❌ Error handling remote operation:", err);
    }
  }

  broadcastNodeList() {
    const serverNodes = Array.from(this.connectedNodes.values()).map(
      (node) => ({
        id: node.socketId,
        nodeId: node.nodeId || "unknown",
        lastSync: node.lastSync,
        status: "connected",
        type: "incoming"
      })
    );

    const peerNodes = Array.from(this.connectedPeers.entries()).map(
      ([url, socket]) => ({
        id: url,
        nodeId: socket.nodeId || "unknown",
        lastSync: socket.lastSync || null,
        status: socket.connected ? "connected" : "disconnected",
        type: "outgoing"
      })
    );

    const nodeList = [...serverNodes, ...peerNodes];
    
    this.io.emit("node-list-update", {
      nodes: nodeList,
      totalNodes: nodeList.length,
      currentNode: this.nodeId,
      connectedPeers: this.connectedPeers.size,
      connectedNodes: this.connectedNodes.size
    });

    console.log(`📊 Broadcasting node list: ${nodeList.length} total nodes`);
  }

  addToSyncHistory(operation) {
    this.syncHistory.unshift({ ...operation, id: uuidv4() });
    if (this.syncHistory.length > 100) {
      this.syncHistory = this.syncHistory.slice(0, 100);
    }
  }

  getSyncStats() {
    return {
      nodeId: this.nodeId,
      connectedNodes: this.connectedNodes.size,
      connectedPeers: this.connectedPeers.size,
      totalConnections: this.connectedNodes.size + this.connectedPeers.size,
      syncEnabled: this.syncEnabled,
      totalSyncOperations: this.syncHistory.length,
      lastSyncTime: this.syncHistory.length > 0 ? this.syncHistory[0].timestamp : null,
      selfUrl: this.selfUrl,
      configuredPeers: this.peers.length,
      nodeList: [
        ...Array.from(this.connectedNodes.values()).map(node => ({
          ...node,
          type: 'incoming'
        })),
        ...Array.from(this.connectedPeers.entries()).map(([url, socket]) => ({
          id: url,
          nodeId: socket.nodeId || "unknown",
          lastSync: socket.lastSync || null,
          status: socket.connected ? "connected" : "disconnected",
          type: 'outgoing'
        })),
      ],
    };
  }

  getSyncHistory(limit = 20) {
    return this.syncHistory.slice(0, limit);
  }

  toggleSync() {
    this.syncEnabled = !this.syncEnabled;
    this.io.emit("sync-status-change", {
      enabled: this.syncEnabled,
      nodeId: this.nodeId,
    });
    
    if (this.syncEnabled) {
      // Re-attempt peer connections
      setTimeout(() => this.connectToPeers(), 1000);
    }
    
    return this.syncEnabled;
  }

  forceSync() {
    const syncData = {
      type: "full-sync",
      data: this.cache.getAll(),
      nodeId: this.nodeId,
      timestamp: Date.now(),
    };

    this.io.emit("cache-sync", syncData);
    this.connectedPeers.forEach((socket) => {
      if (socket.connected) {
        socket.emit("cache-sync", syncData);
      }
    });
  }

  simulateNodeFailure(duration = 5000) {
    this.syncEnabled = false;
    setTimeout(() => {
      this.syncEnabled = true;
      this.forceSync();
    }, duration);
  }
}

module.exports = SyncManager;