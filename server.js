const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const fs = require('fs');

const ScorePoller = require('./src/score-poller');
const StreamManager = require('./src/stream-manager');

const PORT = 3000;
const NUM_STREAMS = 6;

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Clean up stale FIFOs on startup
for (let i = 0; i < NUM_STREAMS; i++) {
  try { fs.unlinkSync(`/tmp/tennis-scorebug-${i}.fifo`); } catch (_) {}
}

// Score poller
const poller = new ScorePoller();

// Stream managers
const streams = new Map();
for (let i = 0; i < NUM_STREAMS; i++) {
  streams.set(i, new StreamManager(i, onStreamStatusChange));
}

function broadcast(message) {
  const payload = JSON.stringify(message);
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  });
}

function onStreamStatusChange(matchIndex, status, error) {
  const mgr = streams.get(matchIndex);
  broadcast({
    type: 'stream:status',
    matchIndex,
    status,
    error,
    stderrTail: mgr ? mgr.stderrTail : '',
  });
}

// WebSocket connection handler
wss.on('connection', (ws) => {
  // Send current stream statuses
  for (const [, mgr] of streams) {
    ws.send(JSON.stringify({
      type: 'stream:status',
      ...mgr.getState(),
    }));
  }

  // Send latest score data if available
  const latest = poller.getLatest();
  if (latest) {
    ws.send(JSON.stringify({ type: 'score:data', matches: latest }));
  }
});

// Score poller events
poller.on('data', (data) => {
  broadcast({ type: 'score:data', matches: data });
  for (const [i, mgr] of streams) {
    const matchData = Array.isArray(data) ? data[i] : null;
    if (matchData) mgr.updateMatchData(matchData);
  }
});

poller.on('error', () => {
  broadcast({ type: 'score:error' });
});

// REST API
app.post('/api/stream/start', async (req, res) => {
  const { matchIndex, srtInput, srtOutput } = req.body;
  const idx = parseInt(matchIndex, 10);

  if (isNaN(idx) || idx < 0 || idx >= NUM_STREAMS) {
    return res.status(400).json({ error: 'Invalid matchIndex' });
  }
  if (!srtInput || !srtOutput) {
    return res.status(400).json({ error: 'srtInput and srtOutput required' });
  }

  const mgr = streams.get(idx);
  await mgr.start(srtInput, srtOutput);
  res.json({ ok: true, status: mgr.status });
});

app.post('/api/stream/stop', (req, res) => {
  const { matchIndex } = req.body;
  const idx = parseInt(matchIndex, 10);

  if (isNaN(idx) || idx < 0 || idx >= NUM_STREAMS) {
    return res.status(400).json({ error: 'Invalid matchIndex' });
  }

  const mgr = streams.get(idx);
  mgr.stop();
  res.json({ ok: true, status: mgr.status });
});

// Graceful shutdown
function shutdown() {
  console.log('\nShutting down...');
  poller.stop();
  for (const [, mgr] of streams) {
    mgr.stop();
  }
  setTimeout(() => process.exit(0), 3500);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// Start
poller.start();
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Tennis Restream Manager running at http://localhost:${PORT}`);
});
