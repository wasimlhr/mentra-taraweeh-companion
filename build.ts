/**
 * Bundles the two layers into the paths miniapp.json declares:
 *
 *   dist/background/index.js   the always-on glasses logic
 *   dist/ui/index.html         the on-demand phone tile
 *
 * Target is `browser`, not `node`. The background layer runs in a bare JS
 * engine (JavaScriptCore on iOS, QuickJS on Android) — no Node built-ins exist
 * there, and building for `node` would let a stray import resolve at build time
 * and then fail on the device.
 */
import { copyFileSync, mkdirSync } from 'fs';

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

// The tile is a single static HTML file — a settings and status screen with no
// framework, so there is nothing to bundle. Copy it verbatim. Without an
// emitted UI the host has nothing to route the tile to and reports the miniapp
// as unresolved.
mkdirSync('dist/ui', { recursive: true });
copyFileSync('src/ui/index.html', 'dist/ui/index.html');
console.log('copied dist/ui/index.html');
