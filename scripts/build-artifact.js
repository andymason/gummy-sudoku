// Makes the Claude Artifact version of index.html.
//
// Artifacts supply their own <html>/<head>/<body> wrapper and can't run
// service workers, so this keeps only the page content, drops tags marked
// `data-pwa`, and inlines src/sudoku.js and src/app.js as one module script.
//
// Usage: node scripts/build-artifact.js [output-path]
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(resolve(root, path), 'utf8');

/** Returns the artifact HTML for the given index.html and module sources. */
export function buildArtifact(html, logic, app) {
  const head = html.match(/<head>([\s\S]*?)<\/head>/)?.[1];
  const body = html.match(/<body>([\s\S]*?)<\/body>/)?.[1];
  if (head === undefined || body === undefined)
    throw new Error('index.html needs <head> and <body>');

  const pageHead = head
    // the artifact wrapper already sets these
    .replaceAll(/\s*<meta charset[^>]*>|\s*<meta name="viewport"[^>]*>/g, '')
    .replaceAll(/\s*<[^>]*\sdata-pwa(?:\s[^>]*)?>/g, '');

  const bundle = [
    '<script type="module">',
    logic.replaceAll(/^export /gm, ''),
    app.replace(/^import \{[\s\S]*?\} from '\.\/sudoku\.js';\n/m, ''),
    '</script>',
  ].join('\n');

  const tag = '<script type="module" src="src/app.js"></script>';
  if (!body.includes(tag)) throw new Error(`index.html needs ${tag}`);

  return `${pageHead.trim()}\n${body.replace(tag, () => bundle).trim()}\n`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const out = resolve(root, process.argv[2] ?? 'dist/artifact.html');
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, buildArtifact(read('index.html'), read('src/sudoku.js'), read('src/app.js')));
  console.log(`wrote ${out}`);
}
