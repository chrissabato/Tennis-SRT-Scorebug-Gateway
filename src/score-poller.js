const { EventEmitter } = require('events');

const POLL_URL = 'https://tennisbeta.chrissabato.com/broadcast/match-scores.php';
const POLL_INTERVAL = 5000;

class ScorePoller extends EventEmitter {
  constructor() {
    super();
    this._latestData = null;
    this._timer = null;
  }

  start() {
    this._poll();
    this._timer = setInterval(() => this._poll(), POLL_INTERVAL);
  }

  stop() {
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
  }

  getLatest() {
    return this._latestData;
  }

  async _poll() {
    try {
      const res = await fetch(POLL_URL, { signal: AbortSignal.timeout(4000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      this._latestData = data;
      this.emit('data', data);
    } catch (err) {
      console.error('[ScorePoller] fetch error:', err.message);
      this.emit('error', err);
    }
  }
}

module.exports = ScorePoller;
