// Copies the files the site serves into dist/site for Cloudflare Workers static assets.
//
// The site has no build step, but the repo root also holds tests, tooling and
// node_modules, so only the files listed here are published.
//
// Usage: node scripts/build-site.js [output-dir]
import { cpSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Files and folders served to players, relative to the repo root. */
export const SITE_FILES = ['index.html', 'sw.js', 'manifest.webmanifest', 'src', 'icons'];

/** Replaces outDir with a fresh copy of SITE_FILES. */
export function buildSite(outDir) {
  rmSync(outDir, { recursive: true, force: true });
  for (const path of SITE_FILES) {
    cpSync(resolve(root, path), resolve(outDir, path), { recursive: true });
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const out = resolve(root, process.argv[2] ?? 'dist/site');
  buildSite(out);
  console.log(`wrote ${out}`);
}
