import { describe, expect, it } from 'vitest';
import { buildArtifact } from '../scripts/build-artifact.js';

const html = `<!doctype html>
<html lang="en-GB">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width">
<link rel="manifest" href="manifest.webmanifest" data-pwa>
<title>Gummy Sudoku</title>
</head>
<body>
<main></main>
<script type="module" src="src/app.js"></script>
</body>
</html>`;
const logic = 'export const add = (a, b) => a + b;\nexport function twice(x) { return 2 * x; }\n';
const app =
  "import {\n  add,\n  twice,\n} from './sudoku.js';\nconsole.log(add(1, twice(2)), '$&');\n";

describe('buildArtifact', () => {
  const out = buildArtifact(html, logic, app);

  it('drops the document wrapper and PWA-only tags', () => {
    expect(out).not.toMatch(/<html|<head|<body|<!doctype|<meta|data-pwa/i);
    expect(out.startsWith('<title>Gummy Sudoku</title>')).toBe(true);
  });

  it('inlines both modules without import or export', () => {
    expect(out).toContain('const add = (a, b) => a + b;');
    expect(out).toContain('function twice(x)');
    expect(out).not.toMatch(/\bexport\b|\bimport\b|src="src\/app\.js"/);
  });

  it('copies code with $ signs untouched', () => {
    expect(out).toContain("'$&'");
  });
});
