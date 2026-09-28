const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config();

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Import socket handlers
const lobbyHandler = require('./sockets/lobbyHandler');

// Register Socket.io events
io.on('connection', (socket) => {
  console.log(`⚡ Connected client: ${socket.id}`);
  lobbyHandler(io, socket);

  socket.on('error', (err) => {
    console.error(`Socket error on ${socket.id}:`, err);
  });
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'Assignment 14 Real-Time Multiplayer Live Quiz Battle',
    timestamp: new Date().toISOString()
  });
});

if (process.env.NODE_ENV !== 'test') {
  server.listen(PORT, () => {
    console.log(`====================================================`);
    console.log(`🎮 Real-Time Quiz Battle Server running on http://localhost:${PORT}`);
    console.log(`🎪 Host Dashboard: http://localhost:${PORT}/host.html`);
    console.log(`📱 Player Gamepad: http://localhost:${PORT}/player.html`);
    console.log(`====================================================`);
  });
}

module.exports = { app, server, io };
