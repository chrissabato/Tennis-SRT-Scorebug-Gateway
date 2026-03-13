(function () {
  'use strict';

  const NUM_STREAMS = 6;
  const grid = document.getElementById('stream-grid');
  const scoreStatusEl = document.getElementById('score-status');

  const DEFAULT_BUG_URL = 'https://tennis.chrissabato.com/broadcast/scorebug.php?court={court}';
  const scorebugUrlEl = document.getElementById('scorebug-url');
  scorebugUrlEl.value = load('scorebug-url', DEFAULT_BUG_URL);
  scorebugUrlEl.addEventListener('input', () => save('scorebug-url', scorebugUrlEl.value));

  function getBugUrl(courtNumber) {
    const tpl = scorebugUrlEl.value.trim() || DEFAULT_BUG_URL;
    return tpl.replace('{court}', courtNumber);
  }

  const panels = [];
  for (let i = 0; i < NUM_STREAMS; i++) {
    const panel = buildPanel(i);
    grid.appendChild(panel.el);
    panels.push(panel);
  }

  function buildSrtUrl(host, port, mode, latency, streamid) {
    const h = host.trim();
    const p = port.trim();
    const m = mode || 'caller';
    if (!p) return '';
    const hostPart = m === 'listener' ? '' : h;
    const lat = parseInt(latency, 10);
    const latParam = lat > 0 ? `&latency=${lat}` : '';
    const sidParam = streamid.trim() ? `&streamid=${encodeURIComponent(streamid.trim())}` : '';
    return `srt://${hostPart}:${p}?mode=${m}${latParam}${sidParam}`;
  }

  function save(key, val) { localStorage.setItem(key, val); }
  function load(key, def = '') { return localStorage.getItem(key) ?? def; }

  function buildPanel(i) {
    const el = document.createElement('div');
    el.className = 'panel';
    el.innerHTML = `
      <div class="panel-header">
        <span class="panel-title">Court ${i + 1}</span>
        <span class="badge badge-idle" id="badge-${i}"><span class="signal-dot" id="signal-${i}"></span>Idle</span>
      </div>
      <div class="match-preview" id="preview-${i}">—</div>

      <div class="srt-group">
        <div class="srt-group-label">Ingest</div>
        <div class="srt-row">
          <div class="field-group">
            <label>Host / IP</label>
            <input type="text" id="in-host-${i}" placeholder="(any)" autocomplete="off" spellcheck="false">
          </div>
          <div class="field-group">
            <label>Port</label>
            <input type="text" id="in-port-${i}" placeholder="5000" autocomplete="off" spellcheck="false">
          </div>
          <div class="field-group">
            <label>Mode</label>
            <select id="in-mode-${i}">
              <option value="listener">Listener</option>
              <option value="caller">Caller</option>
            </select>
          </div>
        </div>
        <div class="srt-row-2">
          <div class="field-group">
            <label>Latency (ms)</label>
            <input type="number" id="in-latency-${i}" placeholder="120" min="0" max="10000">
          </div>
          <div class="field-group">
            <label>Stream ID</label>
            <input type="text" id="in-streamid-${i}" placeholder="optional" autocomplete="off" spellcheck="false">
          </div>
        </div>
      </div>

      <div class="srt-group">
        <div class="srt-group-label">Output</div>
        <div class="srt-row">
          <div class="field-group">
            <label>Host / IP</label>
            <input type="text" id="out-host-${i}" placeholder="host" autocomplete="off" spellcheck="false">
          </div>
          <div class="field-group">
            <label>Port</label>
            <input type="text" id="out-port-${i}" placeholder="5001" autocomplete="off" spellcheck="false">
          </div>
          <div class="field-group">
            <label>Mode</label>
            <select id="out-mode-${i}">
              <option value="caller">Caller</option>
              <option value="listener">Listener</option>
            </select>
          </div>
        </div>
        <div class="srt-row-2">
          <div class="field-group">
            <label>Latency (ms)</label>
            <input type="number" id="out-latency-${i}" placeholder="120" min="0" max="10000">
          </div>
          <div class="field-group">
            <label>Stream ID</label>
            <input type="text" id="out-streamid-${i}" placeholder="optional" autocomplete="off" spellcheck="false">
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
      inHost:     el.querySelector(`#in-host-${i}`),
      inPort:     el.querySelector(`#in-port-${i}`),
      inMode:     el.querySelector(`#in-mode-${i}`),
      inLatency:  el.querySelector(`#in-latency-${i}`),
      inStreamid: el.querySelector(`#in-streamid-${i}`),
      outHost:    el.querySelector(`#out-host-${i}`),
      outPort:    el.querySelector(`#out-port-${i}`),
      outMode:    el.querySelector(`#out-mode-${i}`),
      outLatency: el.querySelector(`#out-latency-${i}`),
      outStreamid:el.querySelector(`#out-streamid-${i}`),
    };

    // Restore
    fields.inHost.value      = load(`s${i}-in-host`);
    fields.inPort.value      = load(`s${i}-in-port`);
    fields.inMode.value      = load(`s${i}-in-mode`, 'listener');
    fields.inLatency.value   = load(`s${i}-in-latency`);
    fields.inStreamid.value  = load(`s${i}-in-streamid`);
    fields.outHost.value     = load(`s${i}-out-host`);
    fields.outPort.value     = load(`s${i}-out-port`);
    fields.outMode.value     = load(`s${i}-out-mode`, 'caller');
    fields.outLatency.value  = load(`s${i}-out-latency`);
    fields.outStreamid.value = load(`s${i}-out-streamid`);

    // Persist
    fields.inHost.addEventListener('input',      () => save(`s${i}-in-host`,      fields.inHost.value));
    fields.inPort.addEventListener('input',      () => save(`s${i}-in-port`,      fields.inPort.value));
    fields.inMode.addEventListener('change',     () => save(`s${i}-in-mode`,      fields.inMode.value));
    fields.inLatency.addEventListener('input',   () => save(`s${i}-in-latency`,   fields.inLatency.value));
    fields.inStreamid.addEventListener('input',  () => save(`s${i}-in-streamid`,  fields.inStreamid.value));
    fields.outHost.addEventListener('input',     () => save(`s${i}-out-host`,     fields.outHost.value));
    fields.outPort.addEventListener('input',     () => save(`s${i}-out-port`,     fields.outPort.value));
    fields.outMode.addEventListener('change',    () => save(`s${i}-out-mode`,     fields.outMode.value));
    fields.outLatency.addEventListener('input',  () => save(`s${i}-out-latency`,  fields.outLatency.value));
    fields.outStreamid.addEventListener('input', () => save(`s${i}-out-streamid`, fields.outStreamid.value));

    const startBtn = el.querySelector(`#start-${i}`);
    const stopBtn  = el.querySelector(`#stop-${i}`);
    startBtn.addEventListener('click', () => startStream(i));
    stopBtn.addEventListener('click',  () => stopStream(i));

    const panel = {
      el,
      badge:         el.querySelector(`#badge-${i}`),
      preview:       el.querySelector(`#preview-${i}`),
      scorebugImg:   el.querySelector(`#scorebug-${i}`),
      signalDot:     el.querySelector(`#signal-${i}`),
      fields,
      startBtn,
      stopBtn,
      errorEl:       el.querySelector(`#error-${i}`),
      allInputs:     Object.values(fields),
      courtNumber:   i + 1,
      _bugTimer:     null,
    };

    return panel;
  }

  function applyStatus(i, status, signal, error, stderrTail) {
    const p = panels[i];
    if (!p) return;

    const badgeMap = {
      idle:     ['badge-idle',     'Idle'],
      starting: ['badge-starting', 'Starting'],
      live:     ['badge-live',     'Live'],
      slate:    ['badge-starting', 'No Signal'],
      error:    ['badge-error',    'Error'],
    };
    const [cls, label] = badgeMap[status] || badgeMap.idle;
    p.badge.className = 'badge ' + cls;
    p.badge.childNodes[1].textContent = label;
    p.signalDot.className = 'signal-dot' + (signal ? ' signal-ok' : status === 'live' ? ' signal-none' : status === 'error' ? ' signal-err' : '');

    const isLive = status === 'live' || status === 'starting' || status === 'slate';
    const isIdle = status === 'idle';

    p.startBtn.disabled = isLive;
    p.stopBtn.disabled = isIdle;
    p.allInputs.forEach(el => el.disabled = isLive);

    // Show/hide config fields
    const configEls = p.el.querySelectorAll('.srt-group');
    configEls.forEach(el => el.style.display = isLive ? 'none' : '');

    if (status === 'live') {
      p.scorebugImg.style.display = 'block';
      if (!p._bugTimer) {
        const refresh = () => {
          p.scorebugImg.src = getBugUrl(p.courtNumber) + `&_=${Date.now()}`;
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
    const { inHost, inPort, inMode, inLatency, inStreamid, outHost, outPort, outMode, outLatency, outStreamid } = p.fields;
    const srtInput  = buildSrtUrl(inHost.value,  inPort.value,  inMode.value,  inLatency.value,  inStreamid.value);
    const srtOutput = buildSrtUrl(outHost.value, outPort.value, outMode.value, outLatency.value, outStreamid.value);
    if (!srtInput || !srtOutput) {
      alert('Please enter a port for both Ingest and Output.');
      return;
    }
    try {
      const res = await fetch('/api/stream/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ matchIndex: i, srtInput, srtOutput, bugUrl: getBugUrl(i + 1) }),
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
        applyStatus(msg.matchIndex, msg.status, msg.signal, msg.error, msg.stderrTail);
      } else if (msg.type === 'score:error') {
        scoreStatusEl.textContent = 'Score API error — using cached data';
        scoreStatusEl.className = 'score-status err';
      } else if (msg.type === 'sys:stats') {
        const cpuEl   = document.getElementById('cpu-val');
        const memEl   = document.getElementById('mem-val');
        const gpuItem = document.getElementById('gpu-item');
        const gpuEl   = document.getElementById('gpu-val');
        const gmemItem= document.getElementById('gmem-item');
        const gmemEl  = document.getElementById('gmem-val');

        cpuEl.textContent = `${msg.cpu}%`;
        memEl.textContent = `${msg.mem.usedMb}/${msg.mem.totalMb}MB (${msg.mem.percent}%)`;

        cpuEl.closest('.sys-item').className = 'sys-item' + (msg.cpu > 90 ? ' sys-crit' : msg.cpu > 70 ? ' sys-warn' : '');
        memEl.closest('.sys-item').className = 'sys-item' + (msg.mem.percent > 90 ? ' sys-crit' : msg.mem.percent > 70 ? ' sys-warn' : '');

        if (msg.gpu) {
          gpuItem.style.display = '';
          gmemItem.style.display = '';
          gpuEl.textContent = `${msg.gpu.gpuPercent}%`;
          gmemEl.textContent = `${msg.gpu.memUsed}/${msg.gpu.memTotal}MB`;
          gpuItem.className = 'sys-item' + (msg.gpu.gpuPercent > 90 ? ' sys-crit' : msg.gpu.gpuPercent > 70 ? ' sys-warn' : '');
          gmemItem.className = 'sys-item' + ((msg.gpu.memUsed / msg.gpu.memTotal) > 0.9 ? ' sys-crit' : (msg.gpu.memUsed / msg.gpu.memTotal) > 0.7 ? ' sys-warn' : '');
        }
      }
    });
  }

  connect();
})();
