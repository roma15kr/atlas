import { describe, expect, it } from 'vitest';
import fixture from './brandingContrast.fixture.json';
import { accentReadable, BRANDING_PRESETS, brandingTokens, contrastRatio, lightSidebar, tabTitle } from './branding';

describe('branding colours', () => {
  it('lets every ready-made pair pass the contrast rule', () => {
    for (const preset of BRANDING_PRESETS) expect(accentReadable(preset.accentColor), preset.key).toBe(true);
    expect(accentReadable('#f5d90a')).toBe(false);
  });

  it('measures contrast exactly like the API (shared fixture)', () => {
    for (const row of fixture) expect(contrastRatio(row.color, '#ffffff'), row.color).toBeCloseTo(row.onWhite, 3);
  });

  it('picks dark sidebar text on a light sidebar and light text on a dark one', () => {
    expect(lightSidebar('#f1f3f2')).toBe(true);
    expect(brandingTokens({ accentColor: '#37474f', sidebarColor: '#f1f3f2' })['--sidebar-text']).toBe('#202827');
    expect(brandingTokens({ accentColor: '#176f68', sidebarColor: '#1d2a28' })['--sidebar-text']).toBe('#ffffff');
  });

  it('derives darker and lighter accent shades', () => {
    const tokens = brandingTokens({ accentColor: '#3949ab', sidebarColor: '#1f2540' });
    expect(tokens['--primary']).toBe('#3949ab');
    expect(contrastRatio(tokens['--primary-dark']!, '#ffffff')).toBeGreaterThan(contrastRatio('#3949ab', '#ffffff'));
    expect(contrastRatio(tokens['--primary-soft']!, '#ffffff')).toBeLessThan(1.3);
  });

  it('puts the app name after the page name in the tab title', () => {
    expect(tabTitle('Задачи', 'RDIM Office')).toBe('Задачи · RDIM Office');
    expect(tabTitle('RDIM Office', 'RDIM Office')).toBe('RDIM Office');
  });
});
