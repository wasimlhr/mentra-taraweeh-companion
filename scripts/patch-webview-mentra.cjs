const fs = require('fs');
const path = require('path');
const p = path.join(__dirname, '..', 'public', 'webview.html');

// Always start from Even Hub original
const src = path.join(
  'd:',
  'G2_DEV',
  'QuranLiveMeaning',
  'taraweeh-companion',
  'app',
  'index.html',
);
let html = fs.readFileSync(src, 'utf8');

const mentraHelpers = `
  // ─── MentraOS phone webview mode ───────────────────────────────────────────
  // Reuses Even Hub UI; Mentra handles mic + glasses. This page only polls live state.
  var MENTRA_MODE = true;
  var _mentraPollTimer = null;
  var _mentraLastRef = '';

  function mentraTokens() {
    var params = new URLSearchParams(window.location.search);
    var signed = params.get('aos_signed_user_token') || '';
    var front = params.get('aos_frontend_token') || '';
    try {
      if (signed) localStorage.setItem('mentra_signed_token', signed);
      else signed = localStorage.getItem('mentra_signed_token') || '';
      if (front) localStorage.setItem('mentra_frontend_token', front);
      else front = localStorage.getItem('mentra_frontend_token') || '';
    } catch (_) {}
    return { signed: signed, front: front };
  }

  function mentraAuthHeaders() {
    var t = mentraTokens();
    var h = { 'Accept': 'application/json' };
    var token = t.front || t.signed;
    if (token) h['Authorization'] = 'Bearer ' + token;
    return h;
  }

  function mentraApiUrl(path) {
    var t = mentraTokens();
    var q = [];
    if (t.signed) q.push('aos_signed_user_token=' + encodeURIComponent(t.signed));
    if (t.front) q.push('aos_frontend_token=' + encodeURIComponent(t.front));
    return path + (q.length ? ('?' + q.join('&')) : '');
  }

  function mentraConnectLive() {
    if (_mentraPollTimer) { clearInterval(_mentraPollTimer); _mentraPollTimer = null; }
    setWsPill('warn', 'Mentra: connecting…');
    setStatus('Connecting to Mentra session…');

    function poll() {
      fetch(mentraApiUrl('/api/live'), { headers: mentraAuthHeaders(), credentials: 'include' })
        .then(function (r) { return r.json(); })
        .then(function (data) {
          if (!data || data.ok === false) {
            setWsPill('err', 'Mentra: error');
            return;
          }
          if (!data.active) {
            setWsPill('warn', 'Mentra: waiting');
            setStatus(data.message || 'Open Quran Companion from Mentra…');
            return;
          }
          setWsPill('ok', 'Mentra: live');
          var state = data.state || {
            mode: data.mode || 'SEARCHING',
            arabic: data.arabic || '',
            transliteration: data.transliteration || '',
            translation: data.translation || '',
            confidence: data.confidence
          };
          handleServerMsg({ type: 'state', state: state });
          var label = data.ref || data.mode || 'Listening…';
          if (label !== _mentraLastRef) {
            _mentraLastRef = label;
            setStatus(label);
          }
        })
        .catch(function (err) {
          setWsPill('err', 'Mentra: offline');
          setStatus('Live API unreachable', 'error');
          if (typeof log === 'function') log('Mentra poll: ' + (err && err.message || err), 'err');
        });
    }

    poll();
    _mentraPollTimer = setInterval(poll, 800);
    S.ws = { readyState: 1, send: function () {}, close: function () {} };
    S.isRecording = true;
  }
`;

if (!html.includes("const APP_VERSION = 'v2.6.5';")) {
  throw new Error('APP_VERSION marker missing in source');
}
html = html.replace(
  "const APP_VERSION = 'v2.6.5';",
  "const APP_VERSION = 'v2.6.5-mentra';\n" + mentraHelpers,
);

const connectStart = html.indexOf('  function connectWS() {');
const connectEnd = html.indexOf('  function resetMatchPanel() {');
if (connectStart < 0 || connectEnd < 0) throw new Error('connectWS markers not found');
html =
  html.slice(0, connectStart) +
  `  function connectWS() {
    if (MENTRA_MODE) {
      mentraConnectLive();
      return;
    }
    _cancelReconnect();
    _closeWsSilently(S.ws);
    setWsPill('warn', 'Service: connecting…');
    S.ws = new WebSocket(getWsUrl());
    S.ws.binaryType = 'arraybuffer';
    S.ws.onopen = function () {
      setWsPill('ok', 'Service: online');
      log('WS connected', 'ok');
      _startWsPing();
    };
    S.ws.onmessage = function (ev) {
      if (typeof ev.data !== 'string') return;
      var msg;
      try { msg = JSON.parse(ev.data); } catch (_) { return; }
      handleServerMsg(msg);
    };
    S.ws.onclose = function () {
      _stopWsPing();
      setWsPill('err', 'Service: reconnecting…');
      _wsReconnectTimer = setTimeout(connectWS, 1000);
    };
    S.ws.onerror = function () {
      setWsPill('err', 'Service: offline');
    };
  }

` +
  html.slice(connectEnd);

const prevStart = html.indexOf('  window.manualPrevAyah = function () {');
const nextStart = html.indexOf('  window.manualNextAyah = function () {');
if (prevStart < 0 || nextStart < 0) throw new Error('manual nav markers not found');
// End of next function: find closing `};` after nextStart
let nextEnd = html.indexOf('};', nextStart);
if (nextEnd < 0) throw new Error('manualNext end not found');
nextEnd += 2;
html =
  html.slice(0, prevStart) +
  `  window.manualPrevAyah = function () {
    if (MENTRA_MODE) {
      fetch(mentraApiUrl('/api/prev'), { method: 'POST', headers: mentraAuthHeaders(), credentials: 'include' });
      return;
    }
    if (S.ws && S.ws.readyState === WebSocket.OPEN) {
      S.ws.send(JSON.stringify({ type: 'manual_prev' }));
    }
    mirrorManualNavOnGlasses();
  };
  window.manualNextAyah = function () {
    if (MENTRA_MODE) {
      fetch(mentraApiUrl('/api/next'), { method: 'POST', headers: mentraAuthHeaders(), credentials: 'include' });
      return;
    }
    if (S.ws && S.ws.readyState === WebSocket.OPEN) {
      S.ws.send(JSON.stringify({ type: 'manual_advance' }));
    }
    mirrorManualNavOnGlasses();
  }` +
  html.slice(nextEnd);

const bridgeIdx = html.indexOf('async function detectBridge()');
if (bridgeIdx < 0) throw new Error('detectBridge not found after patches');
const bridgeBodyStart = html.indexOf('{', bridgeIdx);
const insertAt = bridgeBodyStart + 1;
const mentraBridge = `
    if (MENTRA_MODE) {
      log('Mentra webview — phone UI (mic + glasses via MentraOS)', 'ok');
      S.isG2 = false;
      S.bridge = null;
      setPill('sPillG2', 'ok', 'Mentra');
      var btn = document.getElementById('recordBtn');
      if (btn) {
        btn.textContent = 'Listening via Mentra';
        btn.disabled = true;
        btn.classList.add('recording');
      }
      var idle = document.getElementById('matchIdle');
      var panel = document.getElementById('matchPanel');
      if (idle) idle.style.display = 'none';
      if (panel) panel.style.display = '';
      setStatus('Listening via Mentra glasses mic…');
      return;
    }
`;
html = html.slice(0, insertAt) + mentraBridge + html.slice(insertAt);

const verLine =
  "document.getElementById('versionEl').textContent = APP_VERSION + ' ' + (S.settings.pipelineVersion || 'v4').toUpperCase();";
if (!html.includes(verLine)) throw new Error('versionEl line not found');
html = html.replace(
  verLine,
  "document.getElementById('versionEl').textContent = APP_VERSION + ' ' + (S.settings.pipelineVersion || 'v4').toUpperCase() + (MENTRA_MODE ? ' · Mentra' : '');",
);

fs.writeFileSync(p, html);
console.log('OK bytes', html.length);
console.log('checks', {
  mentra: html.includes('var MENTRA_MODE = true'),
  poll: html.includes('mentraConnectLive'),
  bridge: html.includes('Listening via Mentra'),
  version: html.includes('v2.6.5-mentra'),
});
