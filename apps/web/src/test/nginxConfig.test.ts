import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * In Nginx a regex location (the static-file rule for .png, .js, …) beats a plain prefix location. An API address
 * ending in .png — the company logo and app icons — would then be looked up as a file and answer 404. Every location
 * that proxies to the API must therefore take priority with `^~` (or be an exact `=` match).
 */
// Vitest runs from apps/web, where nginx.conf lives.
const conf = readFileSync(resolve(process.cwd(), 'nginx.conf'), 'utf8');
const locations = [...conf.matchAll(/location\s+([^{]+?)\s*\{([^}]*)\}/g)].map(([, head, body]) => ({ head: head!.trim(), body: body! }));

describe('nginx config', () => {
  it('keeps API and realtime addresses ahead of the static-file regex', () => {
    const proxied = locations.filter((location) => /proxy_pass\s+http:\/\/api:3000/.test(location.body));
    expect(proxied.map((location) => location.head)).toEqual(expect.arrayContaining(['^~ /api/']));
    for (const location of proxied) expect(location.head, location.head).toMatch(/^(\^~|=)\s/);
  });

  it('still serves static files with long caching', () => {
    expect(locations.some((location) => location.head.startsWith('~*') && location.head.includes('png') && /expires 1y/.test(location.body))).toBe(true);
  });
});
