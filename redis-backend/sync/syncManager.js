const { v4: uuidv4 } = require("uuid");
const { io: Client } = require("socket.io-client");

class SyncManager {
  constructor(cacheInstance, io, peerNodes = []) {
    this.cache = cacheInstance;
    this.io = io;
    this.nodeId = uuidv4();
    this.syncEnabled = true;
    this.syncHistory = [];
    this.connectedPeers = new Map(); // Outgoing connections
    this.connectedNodes = new Map(); // Incoming connections
    this.peers = peerNodes;
    this.connections = []; // ✅ Add this to track peer sockets

    this.selfUrl =
      process.env.SELF_URL || `http://localhost:${process.env.PORT}`;
    console.log("🔗 [SyncManager] Starting with Node ID:", this.nodeId);
    console.log("🔗 [SyncManager] Self URL:", this.selfUrl);
    console.log(
      "🔗 [SyncManager] Attempting to connect with peers:",
      peerNodes
    );

    this.setupSocketHandlers();

    // Delay peer connection for Render cold start
    setTimeout(() => this.connectToPeers(), 4000);
  }

  setupSocketHandlers() {
    this.io.on("connection", (socket) => {
      console.log(`🟢 Incoming node connected: ${socket.id}`);

      socket.on("register-node", (nodeInfo) => {
        console.log(`📥 Registered node: ${nodeInfo.nodeId}`);
        this.connectedNodes.set(socket.id, {
          ...nodeInfo,
          socketId: socket.id,
          lastSync: Date.now(),
        });

        socket.emit("register-node", {
          nodeId: this.nodeId,
          port: process.env.PORT,
        });

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
  this.peers.forEach((peerUrl) => {
    if (!peerUrl || peerUrl === this.selfUrl || this.connectedPeers.has(peerUrl)) {
      console.log(`⚠️ Skipping peer (self or already connected): ${peerUrl}`);
      return;
    }

    const socket = Client(peerUrl, {
      reconnectionAttempts: 5,
      timeout: 5000,
      transports: ['websocket']
    });

    socket.on('connect', () => {
      console.log(`✅ Connected to peer: ${peerUrl}`);
      this.connectedPeers.set(peerUrl, socket);
      socket.emit('sync-initialize', { nodeId: this.syncManager.nodeId });
    });

    socket.on('connect_error', (err) => {
      console.error(`❌ WebSocket error connecting to ${peerUrl}: ${err.message}`);
    });

    socket.on('disconnect', () => {
      console.warn(`⚠️ Disconnected from peer: ${peerUrl}`);
      this.connectedPeers.delete(peerUrl);
    });
  });

  // 🔁 Wake up all peers every 30s to avoid Render sleep
  setInterval(() => {
    this.peers.forEach((peerUrl) => {
      if (peerUrl !== this.selfUrl) {
        axios.head(`${peerUrl}/ping`).catch(() => {
          console.log(`⚠️ Failed ping to ${peerUrl}`);
        });
      }
    });
  }, 30000); // 30 seconds
}
  broadcastOperation(operation) {
    if (!this.syncEnabled) return;

    const syncData = {
      ...operation,
      nodeId: this.nodeId,
      timestamp: Date.now(),
      operationId: uuidv4(),
    };

    this.io.emit("cache-operation", syncData);
    this.connectedPeers.forEach((socket) => {
      socket.emit("cache-operation", syncData);
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
      })
    );

    const peerNodes = Array.from(this.connectedPeers.entries()).map(
      ([url, socket]) => ({
        id: url,
        nodeId: socket.nodeId || "unknown",
        lastSync: socket.lastSync || null,
        status: "connected",
      })
    );

    this.io.emit("node-list-update", {
      nodes: [...serverNodes, ...peerNodes],
      totalNodes: serverNodes.length + peerNodes.length + 1,
      currentNode: this.nodeId,
    });
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
      connectedNodes: this.connectedNodes.size + this.connectedPeers.size,
      syncEnabled: this.syncEnabled,
      totalSyncOperations: this.syncHistory.length,
      lastSyncTime:
        this.syncHistory.length > 0 ? this.syncHistory[0].timestamp : null,
      nodeList: [
        ...Array.from(this.connectedNodes.values()),
        ...Array.from(this.connectedPeers.entries()).map(([url, socket]) => ({
          id: url,
          nodeId: socket.nodeId || "unknown",
          lastSync: socket.lastSync || null,
          status: "connected",
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
    return this.syncEnabled;
  }

  forceSync() {
    this.io.emit("cache-sync", {
      type: "full-sync",
      data: this.cache.getAll(),
      nodeId: this.nodeId,
      timestamp: Date.now(),
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

await this.syncManager.initialize();
this.connectToPeers();

module.exports = SyncManager;
