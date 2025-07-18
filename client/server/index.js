const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// Mapowanie pokoi na użytkowników i stan playera
const rooms = {};
const playerStates = {};

io.on('connection', (socket) => {
  // Dołączanie do pokoju
  socket.on('join-room', ({ roomId, userName }) => {
    socket.join(roomId);
    socket.userName = userName;
    socket.roomId = roomId;
    
    if (!rooms[roomId]) rooms[roomId] = [];
    
    // Sprawdź czy użytkownik już nie istnieje w pokoju
    const existingUser = rooms[roomId].find(u => u.id === socket.id);
    if (!existingUser) {
      rooms[roomId].push({ id: socket.id, userName });
      
      // Powiadom innych użytkowników o nowym użytkowniku
      io.to(roomId).emit('user-joined', { id: socket.id, userName });
      
      // Wyślij listę użytkowników do wszystkich
      io.to(roomId).emit('users-update', rooms[roomId]);
    }
  });

  // Synchronizacja playera
  socket.on('player-action', ({ roomId, action, time }) => {
    if (!playerStates[roomId]) playerStates[roomId] = { playing: false, time: 0 };
    if (action === 'seek' && typeof time === 'number') playerStates[roomId].time = time;
    socket.to(roomId).emit('player-action', { action, time, fromUser: socket.userName });
  });
  socket.on('player-get-state', ({ roomId }) => {
    if (!playerStates[roomId]) playerStates[roomId] = { playing: false, time: 0 };
    socket.emit('player-state', playerStates[roomId]);
  });

  // Synchronizacja linku do filmu Dailymotion
  socket.on('set-player-url', ({ roomId, url, type }) => {
    if (!playerStates[roomId]) playerStates[roomId] = { playing: false, time: 0 };
    playerStates[roomId].playerUrl = { url, type };
    io.to(roomId).emit('player-url', { url, type });
  });
  socket.on('get-player-url', ({ roomId }) => {
    if (playerStates[roomId] && playerStates[roomId].playerUrl) {
      socket.emit('player-url', playerStates[roomId].playerUrl);
    }
  });

  // Czat
  socket.on('chat-message', ({ roomId, userName, message }) => {
    io.to(roomId).emit('chat-message', { userName, message });
  });

  // WebRTC Signaling
  socket.on('offer', ({ roomId, to, offer }) => {
    io.to(to).emit('offer', { from: socket.id, offer });
  });

  socket.on('answer', ({ roomId, to, answer }) => {
    io.to(to).emit('answer', { from: socket.id, answer });
  });

  socket.on('ice-candidate', ({ roomId, to, candidate }) => {
    io.to(to).emit('ice-candidate', { from: socket.id, candidate });
  });

  // Rozłączanie
  socket.on('disconnecting', () => {
    for (const roomId of socket.rooms) {
      if (rooms[roomId]) {
        // Powiadom innych użytkowników o opuszczeniu
        const leavingUser = rooms[roomId].find(u => u.id === socket.id);
        socket.to(roomId).emit('user-left', { id: socket.id, userName: leavingUser ? leavingUser.userName : undefined });
        // Zapamiętaj userName przed usunięciem
        rooms[roomId] = rooms[roomId].filter(u => u.id !== socket.id);
        // Wyślij aktualizację tylko jeśli użytkownik rzeczywiście istniał
        if (leavingUser) {
          io.to(roomId).emit('users-update', rooms[roomId], leavingUser.userName);
        }
      }
    }
  });
});

app.get('/', (req, res) => {
  res.send('WatchParty backend działa!');
});

const PORT = process.env.PORT || 5000;

server.listen(PORT, '0.0.0.0', () => {
  console.log(`HTTP Server running on port ${PORT}`);
  console.log(`Access from other devices: http://192.168.0.139:${PORT}`);
}); 