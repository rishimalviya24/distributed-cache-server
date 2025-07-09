// socketService.js
let socket = null;
let reconnectInterval = null;
let pingInterval = null;

const createSocket = (onMessage, onOpen, onClose) => {
  const WS_URL = 'wss://redis-backend-comz.onrender.com'; // Update this to your WebSocket URL

  socket = new WebSocket(WS_URL);

  socket.onopen = () => {
    console.log("🟢 WebSocket Connected");
    onOpen();

    // Start ping every 20s
    pingInterval = setInterval(() => {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: 'ping' }));
      }
    }, 20000);
  };

  socket.onmessage = (event) => {
    onMessage(JSON.parse(event.data));
  };

  socket.onclose = () => {
    console.log("🔴 WebSocket Disconnected");
    onClose();

    // Retry connection after 3 seconds
    reconnectInterval = setTimeout(() => {
      createSocket(onMessage, onOpen, onClose);
    }, 3000);
  };

  socket.onerror = (err) => {
    console.error("❌ WebSocket Error:", err);
    socket.close(); // Trigger onclose
  };
};

const closeSocket = () => {
  clearInterval(pingInterval);
  clearTimeout(reconnectInterval);
  if (socket) socket.close();
};

export default {
  createSocket,
  closeSocket,
};
