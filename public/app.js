const socket = io();

const roomIdInput = document.getElementById('roomId');
const videoUrlInput = document.getElementById('videoUrl');
const joinBtn = document.getElementById('joinBtn');
const loadBtn = document.getElementById('loadBtn');
const statusEl = document.getElementById('status');
const usersEl = document.getElementById('users');
const playerContainer = document.getElementById('playerContainer');

let roomJoined = false;
let player;
let suppressOutbound = false;

const YOUTUBE_REGEXP = /(?:youtube\.com\/(?:watch\?v=|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{6,})/i;
const VIMEO_REGEXP = /vimeo\.com\/(\d+)/i;

const setStatus = (text) => {
  statusEl.textContent = `Статус: ${text}`;
};

const parseUrl = (url) => {
  const trimmed = (url || '').trim();
  if (!trimmed) return null;

  const youtube = trimmed.match(YOUTUBE_REGEXP);
  if (youtube) {
    return { provider: 'youtube', id: youtube[1] };
  }

  const vimeo = trimmed.match(VIMEO_REGEXP);
  if (vimeo) {
    return { provider: 'vimeo', id: vimeo[1] };
  }

  return { provider: 'html5', src: trimmed };
};

const attachPlayerEvents = () => {
  player.on('play', () => {
    if (suppressOutbound || !roomJoined) return;
    socket.emit('player-event', { playing: true, currentTime: player.currentTime || 0 });
  });

  player.on('pause', () => {
    if (suppressOutbound || !roomJoined) return;
    socket.emit('player-event', { playing: false, currentTime: player.currentTime || 0 });
  });

  player.on('seeked', () => {
    if (suppressOutbound || !roomJoined) return;
    socket.emit('player-event', { currentTime: player.currentTime || 0 });
  });
};

const createPlayer = (url) => {
  const parsed = parseUrl(url);
  playerContainer.innerHTML = '';

  if (!parsed) {
    if (player) {
      player.destroy();
      player = undefined;
    }
    return;
  }

  const el = document.createElement('video');
  el.controls = true;
  el.crossOrigin = 'anonymous';
  el.playsInline = true;

  if (parsed.provider === 'html5') {
    const source = document.createElement('source');
    source.src = parsed.src;
    source.type = 'video/mp4';
    el.appendChild(source);
  }

  playerContainer.appendChild(el);

  if (player) player.destroy();

  player = new Plyr(el, {
    autoplay: false,
    ratio: '16:9',
  });

  if (parsed.provider === 'youtube' || parsed.provider === 'vimeo') {
    player.source = {
      type: 'video',
      sources: [
        {
          src: parsed.id,
          provider: parsed.provider,
        },
      ],
    };
  }

  attachPlayerEvents();
};

joinBtn.addEventListener('click', () => {
  const roomId = roomIdInput.value.trim();
  if (!roomId) {
    setStatus('укажите комнату');
    return;
  }

  socket.emit('join-room', { roomId });
  roomJoined = true;
  loadBtn.disabled = false;
  setStatus(`подключено к комнате ${roomId}`);
});

loadBtn.addEventListener('click', () => {
  if (!roomJoined) return;
  const videoUrl = videoUrlInput.value.trim();
  socket.emit('set-video-url', { videoUrl });
  createPlayer(videoUrl);
});

socket.on('room-users', ({ count }) => {
  usersEl.textContent = `Участников в комнате: ${count}`;
});

socket.on('sync-video-url', ({ videoUrl }) => {
  if (!videoUrl) return;
  videoUrlInput.value = videoUrl;
  createPlayer(videoUrl);
});

socket.on('sync-player-state', async ({ playing, currentTime }) => {
  if (!player) return;

  suppressOutbound = true;
  try {
    if (typeof currentTime === 'number' && Number.isFinite(currentTime)) {
      const drift = Math.abs((player.currentTime || 0) - currentTime);
      if (drift > 1.2) {
        player.currentTime = currentTime;
      }
    }

    if (playing && player.paused) {
      await player.play();
    }

    if (!playing && !player.paused) {
      player.pause();
    }
  } catch (_err) {
    // autoplay and provider restrictions may block play attempts
  } finally {
    setTimeout(() => {
      suppressOutbound = false;
    }, 150);
  }
});
