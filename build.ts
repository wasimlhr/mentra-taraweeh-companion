/**
 * Bundles the background layer into dist/background/index.js, the path
 * miniapp.json declares as the entry point.
 *
 * There is no UI layer: this miniapp is driven entirely by glasses gestures and
 * renders straight to the display, so there is no tile to open and nothing for
 * a WebView to show.
 *
 * Target is `browser`, not `node`. The background layer runs in a bare JS
 * engine (JavaScriptCore on iOS, QuickJS on Android) — no Node built-ins exist
 * there, and building for `node` would let a stray import resolve here and then
 * fail on the device.
 */
const result = await Bun.build({
  entrypoints: ['src/background/index.ts'],
  outdir: 'dist/background',
  target: 'browser',
  format: 'esm',
  // `release`/`pack` run this with NODE_ENV=production so dev-only branches
  // tree-shake out of the shipped bundle.
  define: {
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV ?? 'development'),
  },
  minify: process.env.NODE_ENV === 'production',
});

if (!result.success) {
  console.error('Build failed:');
  for (const log of result.logs) console.error(log);
  process.exit(1);
}

for (const output of result.outputs) {
  console.log(`built ${output.path} (${(output.size / 1024).toFixed(1)} KB)`);
}
