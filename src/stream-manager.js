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
    this.bugUrl = `https://tennis.chrissabato.com/broadcast/scorebug.php?court=${this.courtNumber}`;

    this.status = 'idle';
    this.signal = false;   // true = actively receiving frames
    this.bitrate = 8000;   // kbps
    this.error = null;
    this.stderrTail = '';

    this._ffmpeg = null;
    this._fifoFd = null;
    this._renderTimer = null;
    this._lastFrame = 0;
    this._signalCheckTimer = null;
  }

  async start(srtInput, srtOutput, bugUrl, bitrate) {
    if (bugUrl) this.bugUrl = bugUrl;
    if (bitrate) this.bitrate = bitrate;
    if (this.status === 'live' || this.status === 'starting') return;

    this._setStatus('starting');
    this.error = null;
    this.stderrTail = '';
    this._lastFrame = 0;

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
      '-c:v', 'h264_nvenc', '-preset', 'p1', '-tune', 'ull',
      '-b:v', `${this.bitrate}k`, '-maxrate', `${this.bitrate * 2}k`, '-bufsize', `${this.bitrate * 2}k`, '-g', '60',
      '-c:a', 'copy',
      '-stats', '-stats_period', '2',
      '-f', 'mpegts', srtOutput,
    ];

    this._ffmpeg = spawn('ffmpeg', args);

    // Parse frame count from stderr stats line: "frame= 123 fps=..."
    this._ffmpeg.stderr.on('data', (chunk) => {
      const text = chunk.toString();
      const m = text.match(/frame=\s*(\d+)/);
      if (m) this._lastFrame = parseInt(m[1], 10);
      this.stderrTail += text;
      if (this.stderrTail.length > 2048) {
        this.stderrTail = this.stderrTail.slice(-2048);
      }
    });

    this._ffmpeg.on('spawn', () => {
      this._setStatus('live');
      this._renderTimer = setInterval(() => this._fetchAndWrite(), 1000);

      // Check every 3s if frame count is advancing
      let prevFrame = 0;
      this._signalCheckTimer = setInterval(() => {
        const hasSignal = this._lastFrame > prevFrame;
        prevFrame = this._lastFrame;
        if (hasSignal !== this.signal) {
          this.signal = hasSignal;
          this._notifySignal();
        }
      }, 3000);
    });

    this._ffmpeg.on('error', (err) => {
      this._setStatus('error', err.message);
      this._cleanupMain();
    });

    this._ffmpeg.on('close', (code) => {
      if (this.status === 'live' || this.status === 'starting') {
        console.error(`[StreamManager ${this.matchIndex}] FFmpeg exited (code ${code}): ${this.stderrTail.slice(-300)}`);
        this._setStatus('error', `FFmpeg exited with code ${code}`);
      }
      this._cleanupMain();
    });
  }

  stop() {
    if (this.status === 'idle') return;
    this.signal = false;
    this._setStatus('idle');
    this._cleanupMain();
  }

  updateMatchData(data) {}

  getState() {
    return {
      matchIndex: this.matchIndex,
      status: this.status,
      signal: this.signal,
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
        this._cleanupMain();
      } else if (err.code === 'EAGAIN') {
        // FFmpeg not reading — stalled, skip frame silently
      } else {
        console.error(`[StreamManager ${this.matchIndex}] fetch error:`, err.message);
      }
    }
  }

  _cleanupMain() {
    if (this._renderTimer) { clearInterval(this._renderTimer); this._renderTimer = null; }
    if (this._signalCheckTimer) { clearInterval(this._signalCheckTimer); this._signalCheckTimer = null; }

    if (this._ffmpeg) {
      const proc = this._ffmpeg;
      this._ffmpeg = null;
      try { proc.kill('SIGTERM'); } catch (_) {}
      setTimeout(() => { try { proc.kill('SIGKILL'); } catch (_) {} }, 3000);
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

  _notifySignal() {
    if (this.onStatusChange) {
      this.onStatusChange(this.matchIndex, this.status, this.error);
    }
  }
}

module.exports = StreamManager;
