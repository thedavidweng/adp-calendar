import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const sourceRoot = resolve(fileURLToPath(new URL('..', import.meta.url)), 'src');

describe('core boundary', () => {
  it('does not use the DOM, chrome, or userscript APIs', () => {
    const banned = /\b(document|window|chrome|GM_|localStorage|sessionStorage)\b/;
    for (const file of sourceFiles(sourceRoot)) {
      expect(readFileSync(file, 'utf8'), file).not.toMatch(banned);
    }
  });
});

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) {
      return sourceFiles(path);
    }
    return path.endsWith('.ts') ? [path] : [];
  });
}
