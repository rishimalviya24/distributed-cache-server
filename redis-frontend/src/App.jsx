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
      method: "POST",
    });
    return await response.json();
  },
};

// Helper: calculate hit rate
const calculateHitRate = (hits, misses) => {
  const total = hits + misses;
  if (total === 0) return 0;
  return Math.round((hits / total) * 100);
};

// ✅ Dashboard Component
const Dashboard = () => {
  const [cacheItems, setCacheItems] = useState([]);
  const [metrics, setMetrics] = useState({});
  const [loading, setLoading] = useState(true);
  const [currentStrategy, setCurrentStrategy] = useState("LRU");
  const [newKey, setNewKey] = useState("");
  const [newValue, setNewValue] = useState("");
  const [activeTab, setActiveTab] = useState("cache");

  // ✅ Keep-alive ping inside component
  useEffect(() => {
    const interval = setInterval(() => {
      fetch("https://redis-backend-comz.onrender.com/ping")
        .then((res) => res.text())
        .then((msg) => console.log("🔁 Ping Response:", msg))
        .catch((err) => console.error("❌ Ping failed:", err.message));
    }, 10000);
    return () => clearInterval(interval);
  }, []);

  // Auto-refresh data every 5s
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
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold flex items-center">
          <Database className="mr-2 text-blue-600" />
          Distributed Cache Dashboard
        </h1>
        <div className="flex items-center space-x-4">
          <select
            value={currentStrategy}
            onChange={(e) => handleStrategyChange(e.target.value)}
            className="border px-2 py-1 rounded-md text-sm"
          >
            <option value="LRU">LRU</option>
            <option value="LFU">LFU</option>
          </select>
          <button
            onClick={loadData}
            className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700"
          >
            <RefreshCw className="inline-block w-4 h-4 mr-2" />
            Refresh
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatsCard label="Cache Size" value={`${metrics.cache?.size || 0} / ${metrics.cache?.capacity || 100}`} icon={<Database />} />
        <StatsCard label="Hit Rate" value={`${metrics.cache?.hitRate || 0}%`} icon={<Activity />} />
        <StatsCard label="Total Hits" value={metrics.cache?.hits || 0} icon={<Zap />} />
        <StatsCard label="Connected Nodes" value={metrics.sync?.connectedNodes || 0} icon={<Users />} />
      </div>

      <div className="bg-white shadow rounded-md p-4">
        <h2 className="text-xl font-semibold mb-4">Add New Cache Entry</h2>
        <div className="flex space-x-2 mb-4">
          <input
            type="text"
            placeholder="Key"
            value={newKey}
            onChange={(e) => setNewKey(e.target.value)}
            className="border px-3 py-2 rounded-md flex-1"
          />
          <input
            type="text"
            placeholder="Value"
            value={newValue}
            onChange={(e) => setNewValue(e.target.value)}
            className="border px-3 py-2 rounded-md flex-1"
          />
          <button
            onClick={handleAddItem}
            className="bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700"
          >
            <Plus className="inline-block w-4 h-4 mr-1" />
            Add
          </button>
        </div>
        <div className="flex justify-between items-center">
          <h3 className="text-lg font-medium">Cache Items ({cacheItems.length})</h3>
          <button
            onClick={handleClearCache}
            className="bg-red-600 text-white px-4 py-2 rounded-md hover:bg-red-700"
          >
            <Trash2 className="inline-block w-4 h-4 mr-1" />
            Clear All
          </button>
        </div>
        <table className="w-full mt-4 text-sm border">
          <thead className="bg-gray-100">
            <tr>
              <th className="p-2 text-left">Key</th>
              <th className="p-2 text-left">Value</th>
              <th className="p-2 text-left">Timestamp</th>
              <th className="p-2 text-left">Access</th>
              <th className="p-2 text-left">Actions</th>
            </tr>
          </thead>
          <tbody>
            {cacheItems.map((item) => {
              let parsed = {};
              try {
                parsed = typeof item.value === "string" ? JSON.parse(item.value) : item.value;
              } catch {
                parsed = { value: item.value, accessCount: 0, timestamp: "" };
              }
              return (
                <tr key={item.key} className="border-t">
                  <td className="p-2">{item.key}</td>
                  <td className="p-2">{parsed.value}</td>
                  <td className="p-2">{new Date(parsed.timestamp).toLocaleString()}</td>
                  <td className="p-2">{parsed.accessCount}</td>
                  <td className="p-2">
                    <button
                      onClick={() => handleDeleteItem(item.key)}
                      className="text-red-600 hover:underline"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// Reusable StatsCard Component
const StatsCard = ({ label, value, icon }) => (
  <div className="bg-white shadow rounded-md p-4 flex items-center space-x-4">
    <div className="text-blue-600">{icon}</div>
    <div>
      <div className="text-sm text-gray-500">{label}</div>
      <div className="text-lg font-semibold text-gray-900">{value}</div>
    </div>
  </div>
);

export default Dashboard;
