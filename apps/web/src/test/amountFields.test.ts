import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/** Every source file of the web app, tests excluded. */
function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sources(path);
    return /\.tsx$/.test(entry.name) && !/\.test\.tsx$/.test(entry.name) ? [path] : [];
  });
}

describe('deal amount fields', () => {
  it('take any amount to the kopeck everywhere a deal is created or edited (Бабенко: 10 550 ₴, not only 10 000 or 11 000)', () => {
    const fields = sources(resolve(__dirname, '..')).flatMap((file) =>
      [...readFileSync(file, 'utf8').matchAll(/label="Сумма, ₴"><input [^>]*>/g)].map((match) => ({ file, input: match[0] })));
    expect(fields.length).toBeGreaterThanOrEqual(4);
    for (const { file, input } of fields) expect({ file, step: input.match(/step="([^"]*)"/)?.[1] }).toEqual({ file, step: '0.01' });
  });
});
