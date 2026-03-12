(function () {
  'use strict';

  const NUM_STREAMS = 6;
  const grid = document.getElementById('stream-grid');
  const scoreStatusEl = document.getElementById('score-status');

  const panels = [];
  for (let i = 0; i < NUM_STREAMS; i++) {
    const panel = buildPanel(i);
    grid.appendChild(panel.el);
    panels.push(panel);
  }

  function buildSrtUrl(host, port, mode) {
    const h = host.trim();
    const p = port.trim();
    const m = mode || 'caller';
    if (!p) return '';
    const hostPart = m === 'listener' ? '' : h;
    return `srt://${hostPart}:${p}?mode=${m}`;
  }

  function save(key, val) { localStorage.setItem(key, val); }
  function load(key, def = '') { return localStorage.getItem(key) ?? def; }

  function buildPanel(i) {
    const el = document.createElement('div');
    el.className = 'panel';
    el.innerHTML = `
      <div class="panel-header">
        <span class="panel-title">Court ${i + 1}</span>
        <span class="badge badge-idle" id="badge-${i}">Idle</span>
      </div>
      <div class="match-preview" id="preview-${i}">—</div>

      <div class="srt-group">
        <div class="srt-group-label">Ingest</div>
        <div class="srt-row">
          <div class="field-group field-host">
            <label>Host / IP</label>
            <input type="text" id="in-host-${i}" placeholder="(any)" autocomplete="off" spellcheck="false">
          </div>
          <div class="field-group field-port">
            <label>Port</label>
            <input type="text" id="in-port-${i}" placeholder="5000" autocomplete="off" spellcheck="false">
          </div>
          <div class="field-group field-mode">
            <label>Mode</label>
            <select id="in-mode-${i}">
              <option value="listener">Listener</option>
              <option value="caller">Caller</option>
            </select>
          </div>
        </div>
      </div>

      <div class="srt-group">
        <div class="srt-group-label">Output</div>
        <div class="srt-row">
          <div class="field-group field-host">
            <label>Host / IP</label>
            <input type="text" id="out-host-${i}" placeholder="host" autocomplete="off" spellcheck="false">
          </div>
          <div class="field-group field-port">
            <label>Port</label>
            <input type="text" id="out-port-${i}" placeholder="5001" autocomplete="off" spellcheck="false">
          </div>
          <div class="field-group field-mode">
            <label>Mode</label>
            <select id="out-mode-${i}">
              <option value="caller">Caller</option>
              <option value="listener">Listener</option>
            </select>
          </div>
        </div>
      </div>

      <img class="scorebug-preview" id="scorebug-${i}" style="display:none" alt="scorebug">

      <div class="panel-actions">
        <button class="btn-start" id="start-${i}">Start</button>
        <button class="btn-stop" id="stop-${i}" disabled>Stop</button>
      </div>
      <div class="error-area" id="error-${i}"></div>
    `;

    const fields = {
      inHost:  el.querySelector(`#in-host-${i}`),
      inPort:  el.querySelector(`#in-port-${i}`),
      inMode:  el.querySelector(`#in-mode-${i}`),
      outHost: el.querySelector(`#out-host-${i}`),
      outPort: el.querySelector(`#out-port-${i}`),
      outMode: el.querySelector(`#out-mode-${i}`),
    };

    // Restore
    fields.inHost.value  = load(`s${i}-in-host`);
    fields.inPort.value  = load(`s${i}-in-port`);
    fields.inMode.value  = load(`s${i}-in-mode`, 'listener');
    fields.outHost.value = load(`s${i}-out-host`);
    fields.outPort.value = load(`s${i}-out-port`);
    fields.outMode.value = load(`s${i}-out-mode`, 'caller');

    // Persist
    fields.inHost.addEventListener('input',  () => save(`s${i}-in-host`,  fields.inHost.value));
    fields.inPort.addEventListener('input',  () => save(`s${i}-in-port`,  fields.inPort.value));
    fields.inMode.addEventListener('change', () => save(`s${i}-in-mode`,  fields.inMode.value));
    fields.outHost.addEventListener('input',  () => save(`s${i}-out-host`, fields.outHost.value));
    fields.outPort.addEventListener('input',  () => save(`s${i}-out-port`, fields.outPort.value));
    fields.outMode.addEventListener('change', () => save(`s${i}-out-mode`, fields.outMode.value));

    const startBtn = el.querySelector(`#start-${i}`);
    const stopBtn  = el.querySelector(`#stop-${i}`);
    startBtn.addEventListener('click', () => startStream(i));
    stopBtn.addEventListener('click',  () => stopStream(i));

    return {
      el,
      badge:         el.querySelector(`#badge-${i}`),
      preview:       el.querySelector(`#preview-${i}`),
      scorebugImg:   el.querySelector(`#scorebug-${i}`),
      fields,
      startBtn,
      stopBtn,
      errorEl:       el.querySelector(`#error-${i}`),
      allInputs:     Object.values(fields),
      courtNumber:   i + 1,
      _bugTimer:     null,
    };
  }

  function applyStatus(i, status, error, stderrTail) {
    const p = panels[i];
    if (!p) return;

    const badgeMap = {
      idle:     ['badge-idle',     'Idle'],
      starting: ['badge-starting', 'Starting'],
      live:     ['badge-live',     'Live'],
      error:    ['badge-error',    'Error'],
    };
    const [cls, label] = badgeMap[status] || badgeMap.idle;
    p.badge.className = 'badge ' + cls;
    p.badge.textContent = label;

    const isLive = status === 'live' || status === 'starting';
    const isIdle = status === 'idle';

    p.startBtn.disabled = isLive;
    p.stopBtn.disabled = isIdle;
    p.allInputs.forEach(el => el.disabled = isLive);

    if (status === 'live') {
      p.scorebugImg.style.display = 'block';
      if (!p._bugTimer) {
        const refresh = () => {
          p.scorebugImg.src = `https://tennisbeta.chrissabato.com/broadcast/scorebug.php?court=${p.courtNumber}&_=${Date.now()}`;
        };
        refresh();
        p._bugTimer = setInterval(refresh, 2000);
      }
    } else {
      p.scorebugImg.style.display = 'none';
      p.scorebugImg.src = '';
      if (p._bugTimer) { clearInterval(p._bugTimer); p._bugTimer = null; }
    }

    if (status === 'error' && (error || stderrTail)) {
      p.errorEl.classList.add('visible');
      p.errorEl.textContent = [error, stderrTail].filter(Boolean).join('\n---\n');
    } else {
      p.errorEl.classList.remove('visible');
      p.errorEl.textContent = '';
    }
  }

  function applyScoreData(matches) {
    if (!Array.isArray(matches)) return;
    matches.forEach((m, i) => {
      if (!panels[i]) return;
      panels[i].preview.textContent = '';
    });
    scoreStatusEl.textContent = 'Score data live';
    scoreStatusEl.className = 'score-status ok';
  }

  async function startStream(i) {
    const p = panels[i];
    const { inHost, inPort, inMode, outHost, outPort, outMode } = p.fields;
    const srtInput  = buildSrtUrl(inHost.value,  inPort.value,  inMode.value);
    const srtOutput = buildSrtUrl(outHost.value, outPort.value, outMode.value);
    if (!srtInput || !srtOutput) {
      alert('Please enter a port for both Ingest and Output.');
      return;
    }
    try {
      const res = await fetch('/api/stream/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ matchIndex: i, srtInput, srtOutput }),
      });
      const data = await res.json();
      if (!res.ok) alert(data.error || 'Failed to start stream');
    } catch (err) {
      alert('Network error: ' + err.message);
    }
  }

  async function stopStream(i) {
    try {
      const res = await fetch('/api/stream/stop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ matchIndex: i }),
      });
      const data = await res.json();
      if (!res.ok) alert(data.error || 'Failed to stop stream');
    } catch (err) {
      alert('Network error: ' + err.message);
    }
  }

  function connect() {
    const ws = new WebSocket(`ws://${location.host}`);

    ws.addEventListener('open', () => {
      scoreStatusEl.textContent = 'Connected';
      scoreStatusEl.className = 'score-status ok';
    });

    ws.addEventListener('close', () => {
      scoreStatusEl.textContent = 'Disconnected — reconnecting...';
      scoreStatusEl.className = 'score-status err';
      setTimeout(connect, 3000);
    });

    ws.addEventListener('error', () => ws.close());

    ws.addEventListener('message', (evt) => {
      let msg;
      try { msg = JSON.parse(evt.data); } catch (_) { return; }

      if (msg.type === 'score:data') {
        applyScoreData(msg.matches);
      } else if (msg.type === 'stream:status') {
        applyStatus(msg.matchIndex, msg.status, msg.error, msg.stderrTail);
      } else if (msg.type === 'score:error') {
        scoreStatusEl.textContent = 'Score API error — using cached data';
        scoreStatusEl.className = 'score-status err';
      }
    });
  }

  connect();
})();
