const { spawn, execSync } = require('child_process');
const fs = require('fs');

const O_RDWR = fs.constants.O_RDWR;
const O_NONBLOCK = fs.constants.O_NONBLOCK;

class StreamManager {
  constructor(matchIndex, onStatusChange) {
    this.matchIndex = matchIndex;
    this.onStatusChange = onStatusChange;
    this.fifoPath = `/tmp/tennis-scorebug-${matchIndex}.fifo`;
    this.courtNumber = matchIndex + 1;
    this.bugUrl = `https://tennisbeta.chrissabato.com/broadcast/scorebug.php?court=${this.courtNumber}`;

    this.status = 'idle';
    this.error = null;
    this.stderrTail = '';

    this._ffmpeg = null;
    this._fifoFd = null;
    this._renderTimer = null;
  }

  async start(srtInput, srtOutput) {
    if (this.status === 'live' || this.status === 'starting') return;

    this._setStatus('starting');
    this.error = null;
    this.stderrTail = '';

    try {
      this._setupFifo();
    } catch (err) {
      this._setStatus('error', `FIFO setup failed: ${err.message}`);
      return;
    }

    const args = [
      '-i', srtInput,
      '-f', 'mjpeg', '-framerate', '1', '-i', this.fifoPath,
      '-filter_complex', '[0:v][1:v]overlay=x=20:y=H-h-20:format=auto',
      '-c:v', 'libx264', '-preset', 'ultrafast', '-tune', 'zerolatency', '-threads', '1',
      '-c:a', 'copy',
      '-f', 'mpegts', srtOutput,
    ];

    this._ffmpeg = spawn('ffmpeg', args);

    this._ffmpeg.stderr.on('data', (chunk) => {
      this.stderrTail += chunk.toString();
      if (this.stderrTail.length > 2048) {
        this.stderrTail = this.stderrTail.slice(-2048);
      }
    });

    this._ffmpeg.on('spawn', () => {
      this._setStatus('live');
      this._renderTimer = setInterval(() => this._fetchAndWrite(), 1000);
    });

    this._ffmpeg.on('error', (err) => {
      this._setStatus('error', err.message);
      this._cleanup();
    });

    this._ffmpeg.on('close', (code) => {
      if (this.status === 'live' || this.status === 'starting') {
        this._setStatus('error', `FFmpeg exited with code ${code}`);
      }
      this._cleanup();
    });
  }

  stop() {
    if (this.status === 'idle') return;
    this._setStatus('idle');
    this._cleanup();
  }

  // kept for API compatibility with server.js
  updateMatchData(data) {}

  getState() {
    return {
      matchIndex: this.matchIndex,
      status: this.status,
      error: this.error,
      stderrTail: this.stderrTail,
    };
  }

  _setupFifo() {
    try { fs.unlinkSync(this.fifoPath); } catch (_) {}
    execSync(`mkfifo ${this.fifoPath}`);
    this._fifoFd = fs.openSync(this.fifoPath, O_RDWR | O_NONBLOCK);
  }

  async _fetchAndWrite() {
    if (this._fifoFd === null) return;
    try {
      const res = await fetch(this.bugUrl, { signal: AbortSignal.timeout(3000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      fs.writeSync(this._fifoFd, buf);
    } catch (err) {
      if (err.code === 'EPIPE') {
        this._setStatus('error', 'FIFO write EPIPE — pipe broken');
        this._cleanup();
      } else {
        console.error(`[StreamManager ${this.matchIndex}] fetch error:`, err.message);
      }
    }
  }

  _cleanup() {
    if (this._renderTimer) {
      clearInterval(this._renderTimer);
      this._renderTimer = null;
    }

    if (this._ffmpeg) {
      const proc = this._ffmpeg;
      this._ffmpeg = null;
      try { proc.kill('SIGTERM'); } catch (_) {}
      setTimeout(() => {
        try { proc.kill('SIGKILL'); } catch (_) {}
      }, 3000);
    }

    if (this._fifoFd !== null) {
      try { fs.closeSync(this._fifoFd); } catch (_) {}
      this._fifoFd = null;
    }

    try { fs.unlinkSync(this.fifoPath); } catch (_) {}
  }

  _setStatus(status, error = null) {
    this.status = status;
    this.error = error;
    if (this.onStatusChange) {
      this.onStatusChange(this.matchIndex, status, error);
    }
  }
}

module.exports = StreamManager;
