import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { buildSite, SITE_FILES } from '../scripts/build-site.js';

describe('buildSite', () => {
  const out = mkdtempSync(join(tmpdir(), 'gummy-site-'));
  buildSite(out);
  afterAll(() => rmSync(out, { recursive: true, force: true }));

  it('copies only the served files', () => {
    expect(readdirSync(out).toSorted()).toEqual(SITE_FILES.toSorted());
  });

  it('includes the modules and gummy artwork', () => {
    expect(existsSync(join(out, 'src/app.js'))).toBe(true);
    expect(existsSync(join(out, 'src/sudoku.js'))).toBe(true);
    expect(existsSync(join(out, 'icons/gummies/bear.svg'))).toBe(true);
  });
});
