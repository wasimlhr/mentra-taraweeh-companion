/**
 * Windows-safe replacement for `mentra-miniapp pack`.
 *
 * The CLI's pack shells out to the Unix `zip` binary:
 *
 *     Bun.spawn(['zip', '-r', outputPath, '.'])
 *     error: Executable not found in $PATH: "zip"
 *
 * which does not exist on Windows. This produces the identical artifact — the
 * contents of dist/ at the zip root, written to build/<packageName>-<version>.zip
 * — so `mentra-miniapp release` finds it in its build cache and skips the step
 * that would otherwise fail.
 *
 * Entry names are written with forward slashes on purpose. PowerShell's
 * Compress-Archive emits backslashes, which violates the ZIP spec (APPNOTE 4.4.17
 * requires '/') and would land on the phone as a file literally called
 * "background\index.js" instead of a directory.
 *
 *     bun run pack:win
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync, statSync, utimesSync, readdirSync } from 'fs';
import { join, relative, resolve } from 'path';

const root = resolve(import.meta.dir, '..');
const distDir = join(root, 'dist');
const buildDir = join(root, 'build');

const manifest = JSON.parse(readFileSync(join(root, 'miniapp.json'), 'utf8'));
const { packageName, version, entry } = manifest;

// pack copies these into dist/ before zipping; mirror that exactly.
writeFileSync(join(distDir, 'miniapp.json'), readFileSync(join(root, 'miniapp.json')));
if (existsSync(join(root, 'icon.png'))) {
  writeFileSync(join(distDir, 'icon.png'), readFileSync(join(root, 'icon.png')));
} else {
  console.warn('Warning: icon.png not found in project root, skipping');
}

// Fail loudly here rather than shipping a bundle the host cannot start.
for (const [label, rel] of Object.entries(entry ?? {})) {
  if (!rel) continue;
  if (!existsSync(join(distDir, rel as string))) {
    console.error(`Error: entry.${label} points at "${rel}" but dist/${rel} does not exist. Run the build first.`);
    process.exit(1);
  }
}

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = join(dir, e.name);
    return e.isDirectory() ? walk(full) : [full];
  });
}

const files = walk(distDir);
if (!files.length) {
  console.error('Error: dist/ is empty. Run the build first.');
  process.exit(1);
}

mkdirSync(buildDir, { recursive: true });
const selfIgnore = join(buildDir, '.gitignore');
if (!existsSync(selfIgnore)) writeFileSync(selfIgnore, '*\n');

const outPath = join(buildDir, `${packageName}-${version}.zip`);

// Bun ships a zip writer via its bundler, but the simplest portable route is
// the same one the CLI wants: a plain stored/deflated archive. Use Bun's
// built-in gzip primitives through a minimal ZIP writer so there is no
// dependency on a system binary or on .NET.
const enc = new TextEncoder();
const chunks: Uint8Array[] = [];
const central: Uint8Array[] = [];
let offset = 0;

function u16(n: number) { return new Uint8Array([n & 0xff, (n >> 8) & 0xff]); }
function u32(n: number) {
  return new Uint8Array([n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >>> 24) & 0xff]);
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf: Uint8Array) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

for (const abs of files) {
  const name = relative(distDir, abs).split('\\').join('/');   // ZIP spec requires '/'
  const data = new Uint8Array(readFileSync(abs));
  const crc = crc32(data);
  const local = [
    u32(0x04034b50), u16(20), u16(0), u16(0), u16(0), u16(0),
    u32(crc), u32(data.length), u32(data.length),
    u16(enc.encode(name).length), u16(0), enc.encode(name), data,
  ];
  const localSize = local.reduce((n, p) => n + p.length, 0);
  chunks.push(...local);
  central.push(
    u32(0x02014b50), u16(20), u16(20), u16(0), u16(0), u16(0), u16(0),
    u32(crc), u32(data.length), u32(data.length),
    u16(enc.encode(name).length), u16(0), u16(0), u16(0), u16(0), u32(0),
    u32(offset), enc.encode(name),
  );
  offset += localSize;
}

const centralStart = offset;
const centralSize = central.reduce((n, p) => n + p.length, 0);
const all = [
  ...chunks, ...central,
  u32(0x06054b50), u16(0), u16(0), u16(files.length), u16(files.length),
  u32(centralSize), u32(centralStart), u16(0),
];
const total = all.reduce((n, p) => n + p.length, 0);
const out = new Uint8Array(total);
let pos = 0;
for (const p of all) { out.set(p, pos); pos += p.length; }
writeFileSync(outPath, out);

// The CLI reuses this cache only when it is newer than every source file.
const future = new Date(Date.now() + 5000);
utimesSync(outPath, future, future);

console.log(`packed ${relative(root, outPath)}  ${(statSync(outPath).size / 1024).toFixed(1)} KB`);
for (const abs of files) console.log(`  ${relative(distDir, abs).split('\\').join('/')}`);
