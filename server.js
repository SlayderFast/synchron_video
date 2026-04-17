const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const rooms = new Map();

app.use(express.static('public'));

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

io.on('connection', (socket) => {
  socket.on('join-room', ({ roomId, username }) => {
    if (!roomId) return;

    socket.join(roomId);
    socket.data.roomId = roomId;
    socket.data.username = username || 'Guest';

    const room = rooms.get(roomId) || {
      users: new Set(),
      videoUrl: '',
      playerState: {
        playing: false,
        currentTime: 0,
        updatedAt: Date.now(),
      },
    };

    room.users.add(socket.id);
    rooms.set(roomId, room);

    io.to(roomId).emit('room-users', { count: room.users.size });

    socket.emit('sync-video-url', { videoUrl: room.videoUrl });
    socket.emit('sync-player-state', room.playerState);
  });

  socket.on('set-video-url', ({ videoUrl }) => {
    const roomId = socket.data.roomId;
    if (!roomId) return;

    const room = rooms.get(roomId);
    if (!room) return;

    room.videoUrl = videoUrl || '';
    room.playerState = {
      playing: false,
      currentTime: 0,
      updatedAt: Date.now(),
    };

    socket.to(roomId).emit('sync-video-url', { videoUrl: room.videoUrl });
    io.to(roomId).emit('sync-player-state', room.playerState);
  });

  socket.on('player-event', (payload) => {
    const roomId = socket.data.roomId;
    if (!roomId) return;

    const room = rooms.get(roomId);
    if (!room) return;

    room.playerState = {
      ...room.playerState,
      ...payload,
      updatedAt: Date.now(),
    };

    socket.to(roomId).emit('sync-player-state', room.playerState);
  });

  socket.on('disconnect', () => {
    const roomId = socket.data.roomId;
    if (!roomId) return;

    const room = rooms.get(roomId);
    if (!room) return;

    room.users.delete(socket.id);

    if (room.users.size === 0) {
      rooms.delete(roomId);
      return;
    }

    io.to(roomId).emit('room-users', { count: room.users.size });
  });
});

const port = process.env.PORT || 3000;
server.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`Synchron Video server started on http://localhost:${port}`);
});
