// ✅ Updated version of your Dashboard component with working SyncTab node list display
import React, { useState, useEffect } from "react";
import {
  Server,
  Database,
  Activity,
  Settings,
  Plus,
  Trash2,
  RefreshCw,
  Users,
  Zap,
} from "lucide-react";

// API Service
const API_BASE_URL = "https://redis-backend-comz.onrender.com/api";

const apiService = {
  async getAllCache() {
    const response = await fetch(`${API_BASE_URL}/cache`);
    return await response.json();
  },

  async getCacheItem(key) {
    const response = await fetch(`${API_BASE_URL}/cache/${key}`);
    return await response.json();
  },

  async setCacheItem(key, value, ttl = null) {
    const response = await fetch(`${API_BASE_URL}/cache`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, value, ttl }),
    });
    return await response.json();
  },

  async deleteCacheItem(key) {
    const response = await fetch(`${API_BASE_URL}/cache/${key}`, {
      method: "DELETE",
    });
    return await response.json();
  },

  async clearCache() {
    const response = await fetch(`${API_BASE_URL}/cache`, {
      method: "DELETE",
    });
    return await response.json();
  },

  async changeStrategy(strategy) {
    const response = await fetch(`${API_BASE_URL}/strategy`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ strategy }),
    });
    return await response.json();
  },

  async getMetrics() {
    const response = await fetch(`${API_BASE_URL}/metrics`);
    return await response.json();
  },

  async getSyncStatus() {
    const response = await fetch(`${API_BASE_URL}/sync/status`);
    return await response.json();
  },

  async getSyncHistory() {
    const response = await fetch(`${API_BASE_URL}/sync/history`);
    return await response.json();
  },

  async toggleSync() {
    const response = await fetch(`${API_BASE_URL}/sync/toggle`, {
      method: "POST",
    });
    return await response.json();
  },

  async forceSync() {
    const response = await fetch(`${API_BASE_URL}/sync/force`, {
      method: "POST" });
    return await response.json();
  },
};

const calculateHitRate = (hits, misses) => {
  const total = hits + misses;
  if (total === 0) return 0;
  return Math.round((hits / total) * 100);
};



// Dashboard Component
const Dashboard = () => {
  const [cacheItems, setCacheItems] = useState([]);
  const [metrics, setMetrics] = useState({});
  const [loading, setLoading] = useState(true);
  const [currentStrategy, setCurrentStrategy] = useState("LRU");
  const [newKey, setNewKey] = useState("");
  const [newValue, setNewValue] = useState("");
  const [activeTab, setActiveTab] = useState("cache");

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 5000);
    return () => clearInterval(interval);
  }, []);

  const loadData = async () => {
    try {
      const [cacheData, metricsData] = await Promise.all([
        apiService.getAllCache(),
        apiService.getMetrics(),
      ]);

      if (cacheData.success) {
        setCacheItems(cacheData.items || []);
      }

      if (metricsData.success) {
        // Process metrics data to ensure hit rate is calculated
        const processedMetrics = {
          ...metricsData,
          cache: {
            ...metricsData.cache,
            hitRate:
              metricsData.cache?.hitRate ||
              calculateHitRate(
                metricsData.cache?.hits || 0,
                metricsData.cache?.misses || 0
              ),
            hits: metricsData.cache?.hits || 0,
            misses: metricsData.cache?.misses || 0,
            size: metricsData.cache?.size || 0,
            capacity: metricsData.cache?.capacity || 100,
            strategy: metricsData.cache?.strategy || "LRU",
            evictions: metricsData.cache?.evictions || 0,
          },
          sync: {
            ...metricsData.sync,
            connectedNodes: metricsData.sync?.connectedNodes || 0,
          },
        };

        setMetrics(processedMetrics);
        setCurrentStrategy(processedMetrics.cache.strategy);
      }
    } catch (error) {
      console.error("Error loading data:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddItem = async () => {
    if (!newKey || !newValue) return;

    try {
      const result = await apiService.setCacheItem(newKey, newValue);
      if (result.success) {
        setNewKey("");
        setNewValue("");
        // Refresh data after adding item
        setTimeout(() => loadData(), 100);
      }
    } catch (error) {
      console.error("Error adding item:", error);
    }
  };

  const handleDeleteItem = async (key) => {
    try {
      const result = await apiService.deleteCacheItem(key);
      if (result.success) {
        // Refresh data after deleting item
        setTimeout(() => loadData(), 100);
      }
    } catch (error) {
      console.error("Error deleting item:", error);
    }
  };

  const handleClearCache = async () => {
    try {
      const result = await apiService.clearCache();
      if (result.success) {
        // Refresh data after clearing cache
        setTimeout(() => loadData(), 100);
      }
    } catch (error) {
      console.error("Error clearing cache:", error);
    }
  };

  const handleStrategyChange = async (strategy) => {
    try {
      const result = await apiService.changeStrategy(strategy);
      if (result.success) {
        setCurrentStrategy(strategy);
        // Refresh data after changing strategy
        setTimeout(() => loadData(), 100);
      }
    } catch (error) {
      console.error("Error changing strategy:", error);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <Database className="h-8 w-8 text-blue-600 mr-3" />
              <h1 className="text-xl font-bold text-gray-900">
                Distributed Cache System
              </h1>
            </div>
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2">
                <span className="text-sm text-gray-500">Strategy:</span>
                <select
                  value={currentStrategy}
                  onChange={(e) => handleStrategyChange(e.target.value)}
                  className="border border-gray-300 rounded-md px-3 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="LRU">LRU</option>
                  <option value="LFU">LFU</option>
                </select>
              </div>
              <button
                onClick={loadData}
                className="flex items-center space-x-2 bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 transition-colors"
              >
                <RefreshCw className="h-4 w-4" />
                <span>Refresh</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <div className="bg-white p-6 rounded-lg shadow-sm border">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <Database className="h-8 w-8 text-blue-600" />
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">
                    Cache Size
                  </dt>
                  <dd className="text-lg font-medium text-gray-900">
                    {metrics.cache?.size || 0} /{" "}
                    {metrics.cache?.capacity || 100}
                  </dd>
                </dl>
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-lg shadow-sm border">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <Activity className="h-8 w-8 text-green-600" />
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">
                    Hit Rate
                  </dt>
                  <dd className="text-lg font-medium text-gray-900">
                    {metrics.cache?.hitRate || 0}%
                  </dd>
                </dl>
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-lg shadow-sm border">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <Zap className="h-8 w-8 text-yellow-600" />
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">
                    Total Hits
                  </dt>
                  <dd className="text-lg font-medium text-gray-900">
                    {metrics.cache?.hits || 0}
                  </dd>
                </dl>
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-lg shadow-sm border">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <Users className="h-8 w-8 text-purple-600" />
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">
                    Connected Nodes
                  </dt>
                  <dd className="text-lg font-medium text-gray-900">
                    {metrics.sync?.connectedNodes || 0}
                  </dd>
                </dl>
              </div>
            </div>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="bg-white rounded-lg shadow-sm border">
          <div className="border-b border-gray-200">
            <nav className="-mb-px flex space-x-8 px-6">
              {[
                { id: "cache", label: "Cache Entries", icon: Database },
                { id: "sync", label: "Sync Status", icon: Server },
                { id: "metrics", label: "Metrics", icon: Activity },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`${
                    activeTab === tab.id
                      ? "border-blue-500 text-blue-600"
                      : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                  } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm flex items-center space-x-2`}
                >
                  <tab.icon className="h-4 w-4" />
                  <span>{tab.label}</span>
                </button>
              ))}
            </nav>
          </div>

          <div className="p-6">
            {activeTab === "cache" && (
              <CacheTab
                cacheItems={cacheItems}
                onAddItem={handleAddItem}
                onDeleteItem={handleDeleteItem}
                onClearCache={handleClearCache}
                newKey={newKey}
                setNewKey={setNewKey}
                newValue={newValue}
                setNewValue={setNewValue}
              />
            )}
            {activeTab === "sync" && <SyncTab />}
            {activeTab === "metrics" && <MetricsTab metrics={metrics} />}
          </div>
        </div>
      </div>
    </div>
  );
};

// Cache Tab Component
const CacheTab = ({
  cacheItems,
  onAddItem,
  onDeleteItem,
  onClearCache,
  newKey,
  setNewKey,
  newValue,
  setNewValue,
}) => {
  return (
    <div className="space-y-6">
      {/* Add New Item Form */}
      <div className="bg-gray-50 p-4 rounded-lg">
        <h3 className="text-lg font-medium text-gray-900 mb-4">
          Add New Cache Entry
        </h3>
        <div className="flex space-x-4">
          <input
            type="text"
            placeholder="Key"
            value={newKey}
            onChange={(e) => setNewKey(e.target.value)}
            className="flex-1 border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <input
            type="text"
            placeholder="Value"
            value={newValue}
            onChange={(e) => setNewValue(e.target.value)}
            className="flex-1 border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            onClick={onAddItem}
            className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 transition-colors flex items-center space-x-2"
          >
            <Plus className="h-4 w-4" />
            <span>Add</span>
          </button>
        </div>
      </div>

      {/* Cache Items Table */}
      <div>
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-medium text-gray-900">
            Cache Entries ({cacheItems.length})
          </h3>
          <button
            onClick={onClearCache}
            className="bg-red-600 text-white px-4 py-2 rounded-md hover:bg-red-700 transition-colors flex items-center space-x-2"
          >
            <Trash2 className="h-4 w-4" />
            <span>Clear All</span>
          </button>
        </div>

        {cacheItems.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            No cache entries found. Add some items to get started.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Key
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Value
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Timestamp
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Access Count
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {cacheItems.map((item) => {
                  let parsed = {};
                  try {
                    parsed =
                      typeof item.value === "string"
                        ? JSON.parse(item.value)
                        : item.value;
                  } catch (e) {
                    parsed = {
                      value: "Invalid JSON",
                      accessCount: 0,
                      timestamp: "",
                    };
                  }

                  return (
                    <tr key={item.key}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {item.key}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {parsed.value}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {new Date(parsed.timestamp).toLocaleString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {parsed.accessCount}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        <button
                          onClick={() => onDeleteItem(item.key)}
                          className="text-red-600 hover:text-red-900 flex items-center space-x-1"
                        >
                          <Trash2 className="h-4 w-4" />
                          <span>Delete</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

// Sync Tab Component
const SyncTab = () => {
  const [syncStatus, setSyncStatus] = useState({});
  const [syncHistory, setSyncHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadSyncData();
    const interval = setInterval(loadSyncData, 3000);
    return () => clearInterval(interval);
  }, []);

  const loadSyncData = async () => {
    try {
      const [statusData, historyData] = await Promise.all([
        apiService.getSyncStatus(),
        apiService.getSyncHistory(),
      ]);

      if (statusData.success) {
        setSyncStatus(statusData);
      }

      if (historyData.success) {
        setSyncHistory(historyData.history || []);
      }
    } catch (error) {
      console.error("Error loading sync data:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleSync = async () => {
    try {
      const result = await apiService.toggleSync();
      if (result.success) {
        loadSyncData();
      }
    } catch (error) {
      console.error("Error toggling sync:", error);
    }
  };

 const handleForceSync = async () => {
  try {
    const result = await apiService.forceSync();
    if (result.success) {
      alert(result.message || "Force sync started"); // ✅ Show message
      loadSyncData(); // ✅ Refresh sync status and history
    } else {
      alert("Force sync failed");
    }
  } catch (error) {
    console.error("Error forcing sync:", error);
    alert("Something went wrong while forcing sync");
  }
};


  if (loading) {
    return <div className="text-center py-8">Loading sync data...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Sync Status */}
      <div className="bg-gray-50 p-4 rounded-lg">
        <h3 className="text-lg font-medium text-gray-900 mb-4">
          Synchronization Status
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <div className="text-sm text-gray-500">Node ID</div>
            <div className="text-lg font-medium text-gray-900">
              {syncStatus.nodeId || "N/A"}
            </div>
          </div>
          <div>
            <div className="text-sm text-gray-500">Connected Nodes</div>
            <div className="text-lg font-medium text-gray-900">
              {syncStatus.connectedNodes || 0}
            </div>
          </div>
          <div>
            <div className="text-sm text-gray-500">Sync Status</div>
            <div
              className={`text-lg font-medium ${
                syncStatus.syncEnabled ? "text-green-600" : "text-red-600"
              }`}
            >
              {syncStatus.syncEnabled ? "Enabled" : "Disabled"}
            </div>
          </div>
          <div>
            <div className="text-sm text-gray-500">Total Sync Operations</div>
            <div className="text-lg font-medium text-gray-900">
              {syncStatus.totalSyncOperations || 0}
            </div>
          </div>
        </div>
        <div className="mt-4 flex space-x-4">
          <button
            onClick={handleToggleSync}
            className={`px-4 py-2 rounded-md transition-colors ${
              syncStatus.syncEnabled
                ? "bg-red-600 text-white hover:bg-red-700"
                : "bg-green-600 text-white hover:bg-green-700"
            }`}
          >
            {syncStatus.syncEnabled ? "Disable Sync" : "Enable Sync"}
          </button>
          <button
            onClick={handleForceSync}
            className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 transition-colors"
          >
            Force Sync
          </button>
        </div>
      </div>

      {/* Sync History */}
      <div>
        <h3 className="text-lg font-medium text-gray-900 mb-4">
          Recent Sync Operations
        </h3>
        {syncHistory.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            No sync operations recorded yet.
          </div>
        ) : (
          <div className="space-y-2">
            {syncHistory.map((operation, index) => (
              <div
                key={operation.id || index}
                className="bg-white p-4 rounded-lg border"
              >
                <div className="flex justify-between items-start">
                  <div>
                    <div className="text-sm font-medium text-gray-900">
                      {operation.type?.toUpperCase() || "UNKNOWN"} Operation
                    </div>
                    <div className="text-sm text-gray-500">
                      {operation.key && `Key: ${operation.key}`}
                      {operation.value &&
                        ` | Value: ${JSON.stringify(operation.value)}`}
                    </div>
                  </div>
                  <div className="text-sm text-gray-500">
                    {new Date(operation.timestamp).toLocaleString()}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

// Metrics Tab Component
const MetricsTab = ({ metrics }) => {
  return (
    <div className="space-y-6">
      {/* Cache Metrics */}
      <div className="bg-gray-50 p-4 rounded-lg">
        <h3 className="text-lg font-medium text-gray-900 mb-4">
          Cache Metrics
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <div>
            <div className="text-sm text-gray-500">Strategy</div>
            <div className="text-lg font-medium text-gray-900">
              {metrics.cache?.strategy || "LRU"}
            </div>
          </div>
          <div>
            <div className="text-sm text-gray-500">Capacity</div>
            <div className="text-lg font-medium text-gray-900">
              {metrics.cache?.capacity || 100}
            </div>
          </div>
          <div>
            <div className="text-sm text-gray-500">Current Size</div>
            <div className="text-lg font-medium text-gray-900">
              {metrics.cache?.size || 0}
            </div>
          </div>
          <div>
            <div className="text-sm text-gray-500">Hit Rate</div>
            <div className="text-lg font-medium text-green-600">
              {metrics.cache?.hitRate || 0}%
            </div>
          </div>
          <div>
            <div className="text-sm text-gray-500">Total Hits</div>
            <div className="text-lg font-medium text-green-600">
              {metrics.cache?.hits || 0}
            </div>
          </div>
          <div>
            <div className="text-sm text-gray-500">Total Misses</div>
            <div className="text-lg font-medium text-red-600">
              {metrics.cache?.misses || 0}
            </div>
          </div>
          <div>
            <div className="text-sm text-gray-500">Evictions</div>
            <div className="text-lg font-medium text-yellow-600">
              {metrics.cache?.evictions || 0}
            </div>
          </div>
        </div>
      </div>

      {/* Server Metrics */}
      <div className="bg-gray-50 p-4 rounded-lg">
        <h3 className="text-lg font-medium text-gray-900 mb-4">
          Server Metrics
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <div className="text-sm text-gray-500">Uptime</div>
            <div className="text-lg font-medium text-gray-900">
              {metrics.server?.uptime
                ? `${Math.floor(metrics.server.uptime / 3600)}h ${Math.floor(
                    (metrics.server.uptime % 3600) / 60
                  )}m`
                : "N/A"}
            </div>
          </div>
          <div>
            <div className="text-sm text-gray-500">Memory Usage</div>
            <div className="text-lg font-medium text-gray-900">
              {metrics.server?.memory
                ? `${Math.round(
                    metrics.server.memory.heapUsed / 1024 / 1024
                  )} MB`
                : "N/A"}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
