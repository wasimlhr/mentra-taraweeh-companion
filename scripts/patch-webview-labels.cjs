const fs = require('fs');
const p = require('path').join(__dirname, '..', 'public', 'webview.html');
let h = fs.readFileSync(p, 'utf8');
const pairs = [
  ['G2 mic', 'Glasses mic'],
  ['G2 + Ring ready', 'Glasses + Ring ready'],
  ["'G2 ready'", "'Glasses ready'"],
  ['Start Listening (Glasses mic)', 'Start Listening (Glasses mic)'], // noop if already done
  ['PC mic', 'Phone mic'],
];
for (const [a, b] of pairs) {
  if (a !== b) h = h.split(a).join(b);
}
// Mentra: simplify settings screen — hide Even-only sections
const marker = 'async function detectBridge() {';
const idx = h.indexOf(marker);
if (idx < 0) throw new Error('detectBridge missing');
// After MENTRA_MODE early return block, ensure we hide heavy settings.
// Inject helper once near mentraConnectLive
if (!h.includes('function mentraSimplifySettingsUI')) {
  const injectAt = h.indexOf('function mentraConnectLive()');
  if (injectAt < 0) throw new Error('mentraConnectLive missing');
  const helper = `
  function mentraSimplifySettingsUI() {
    // Hide Even Hub–only settings blocks; Mentra app Settings owns mode/API keys.
    var hideIds = ['wakeServerRow', 'wakeServerMainBtn'];
    hideIds.forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.style.display = 'none';
    });
    document.querySelectorAll('.s-section, .s-card').forEach(function (el) {
      var t = (el.textContent || '').toLowerCase();
      if (t.indexOf('connection') === 0 || t.indexOf('microphone') >= 0 && el.classList.contains('s-section')) {
        /* keep mic label rename only */
      }
    });
    // Soften settings header note
    var ver = document.getElementById('settingsVersion');
    if (ver) {
      ver.insertAdjacentHTML('beforebegin',
        '<div class="s-warn" style="margin:12px 0;padding:12px;border-radius:8px;background:var(--bc-2);font-size:13px;line-height:1.4">' +
        '<strong>Mentra:</strong> Use Mentra app → Quran Companion → Settings for Mode, Surah hint, transliteration, and API keys. ' +
        'Audio comes from <strong>Glasses mic</strong> (Mentra). Phone mic is only if you change MentraOS mic preference.' +
        '</div>');
    }
  }

`;
  h = h.slice(0, injectAt) + helper + h.slice(injectAt);
}

// Call simplify from Mentra detectBridge return path
if (!h.includes('mentraSimplifySettingsUI()')) {
  h = h.replace(
    'setStatus(\'Listening via Mentra — Pause / Reset below\');\n      _updateReciteModeUI();\n      return;',
    'setStatus(\'Listening via Mentra — Pause / Reset below\');\n      _updateReciteModeUI();\n      mentraSimplifySettingsUI();\n      return;',
  );
}

fs.writeFileSync(p, h);
console.log('ok', (h.match(/Glasses mic/g) || []).length, 'Glasses mic refs');
