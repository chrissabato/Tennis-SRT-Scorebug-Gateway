const { spawn, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const O_RDWR = fs.constants.O_RDWR;
const O_NONBLOCK = fs.constants.O_NONBLOCK;

const SLATE_PATH = path.join(__dirname, '..', 'no-video-detected.mp4');
const RECONNECT_INTERVAL = 15000; // ms between reconnect attempts while in slate mode

class StreamManager {
  constructor(matchIndex, onStatusChange) {
    this.matchIndex = matchIndex;
    this.onStatusChange = onStatusChange;
    this.fifoPath = `/tmp/tennis-scorebug-${matchIndex}.fifo`;
    this.courtNumber = matchIndex + 1;
    this.bugUrl = `https://tennisbeta.chrissabato.com/broadcast/scorebug.php?court=${this.courtNumber}`;

    this.status = 'idle';
    this.signal = false;   // true = actively receiving frames
    this.error = null;
    this.stderrTail = '';

    this._ffmpeg = null;
    this._slateFfmpeg = null;
    this._fifoFd = null;
    this._renderTimer = null;
    this._lastFrame = 0;
    this._signalCheckTimer = null;
    this._reconnectTimer = null;
    this._srtInput = null;
    this._srtOutput = null;
  }

  async start(srtInput, srtOutput, bugUrl) {
    if (bugUrl) this.bugUrl = bugUrl;
    this._srtInput = srtInput;
    this._srtOutput = srtOutput;

    if (this.status === 'live' || this.status === 'starting') return;

    // If slate is running, tear it down before starting main pipeline
    this._stopSlate();
    if (this._reconnectTimer) { clearTimeout(this._reconnectTimer); this._reconnectTimer = null; }

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

      // Check every 3s if frame count is advancing; switch to slate if signal lost
      let prevFrame = 0;
      this._signalCheckTimer = setInterval(() => {
        const hasSignal = this._lastFrame > prevFrame;
        prevFrame = this._lastFrame;

        if (hasSignal && !this.signal) {
          this.signal = true;
          this._notifySignal();
        } else if (!hasSignal && this.signal) {
          // Had signal, lost it — go to slate and schedule reconnect
          this.signal = false;
          this._notifySignal();
          if (this.status === 'live') this._switchToSlate();
        }
      }, 3000);
    });

    this._ffmpeg.on('error', (err) => {
      this._cleanupMain();
      this._switchToSlate(`FFmpeg error: ${err.message}`);
    });

    this._ffmpeg.on('close', (code) => {
      if (this.status === 'live' || this.status === 'starting') {
        this._switchToSlate(`FFmpeg exited with code ${code}`);
      } else {
        this._cleanupMain();
      }
    });
  }

  stop() {
    if (this.status === 'idle') return;
    this.signal = false;
    this._setStatus('idle');
    if (this._reconnectTimer) { clearTimeout(this._reconnectTimer); this._reconnectTimer = null; }
    this._stopSlate();
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
        this._cleanupMain();
        this._switchToSlate('FIFO write EPIPE — pipe broken');
      } else if (err.code === 'EAGAIN') {
        // FFmpeg not reading — stalled, skip frame silently
      } else {
        console.error(`[StreamManager ${this.matchIndex}] fetch error:`, err.message);
      }
    }
  }

  _switchToSlate(reason) {
    this._cleanupMain();
    this._startSlate(reason);
    this._scheduleReconnect();
  }

  _startSlate(reason) {
    if (this._slateFfmpeg || !this._srtOutput) return;

    console.log(`[StreamManager ${this.matchIndex}] Starting slate${reason ? ': ' + reason : ''}`);

    const args = [
      '-stream_loop', '-1',
      '-re',
      '-i', SLATE_PATH,
      '-c:v', 'h264_nvenc', '-preset', 'p1', '-tune', 'ull',
      '-c:a', 'aac', '-ar', '48000',
      '-f', 'mpegts', this._srtOutput,
    ];

    this._slateFfmpeg = spawn('ffmpeg', args);
    this._setStatus('slate');
    this.signal = false;

    this._slateFfmpeg.stderr.on('data', (chunk) => {
      const text = chunk.toString();
      this.stderrTail += text;
      if (this.stderrTail.length > 2048) {
        this.stderrTail = this.stderrTail.slice(-2048);
      }
    });

    this._slateFfmpeg.on('close', () => {
      if (this.status === 'slate') {
        this._slateFfmpeg = null;
        // Restart slate after brief delay if still in slate mode
        setTimeout(() => {
          if (this.status === 'slate') this._startSlate();
        }, 2000);
      }
    });
  }

  _stopSlate() {
    if (this._slateFfmpeg) {
      const proc = this._slateFfmpeg;
      this._slateFfmpeg = null;
      try { proc.kill('SIGTERM'); } catch (_) {}
      setTimeout(() => { try { proc.kill('SIGKILL'); } catch (_) {} }, 3000);
    }
  }

  _scheduleReconnect() {
    if (this._reconnectTimer) return;
    this._reconnectTimer = setTimeout(() => {
      this._reconnectTimer = null;
      if (this.status === 'slate' && this._srtInput && this._srtOutput) {
        console.log(`[StreamManager ${this.matchIndex}] Attempting reconnect...`);
        // stop() will kill slate; start() will relaunch main pipeline
        this._stopSlate();
        setTimeout(() => this.start(this._srtInput, this._srtOutput), 1000);
      }
    }, RECONNECT_INTERVAL);
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
