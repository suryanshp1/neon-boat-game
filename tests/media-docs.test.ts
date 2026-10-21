import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT = path.resolve(__dirname, '..');

describe('README and Gameplay Media Artifacts', () => {
  const requiredMedia = [
    'docs/media/screenshot-neon-night.png',
    'docs/media/screenshot-golden-hour.png',
    'docs/media/screenshot-contracts-map.png',
    'docs/media/screenshot-shipyard-diagnostics.png',
    'docs/media/gameplay.mp4',
    'docs/media/gameplay-preview.gif',
  ];

  it('verifies all gameplay screenshots and video files exist and are non-empty', () => {
    for (const relPath of requiredMedia) {
      const fullPath = path.join(ROOT, relPath);
      expect(fs.existsSync(fullPath), `Missing media file: ${relPath}`).toBe(true);
      const stat = fs.statSync(fullPath);
      expect(stat.size).toBeGreaterThan(10_000);
    }
  });

  it('verifies README.md exists and embeds all screenshots and gameplay video/gif', () => {
    const readmePath = path.join(ROOT, 'README.md');
    expect(fs.existsSync(readmePath)).toBe(true);
    const content = fs.readFileSync(readmePath, 'utf-8');

    for (const relPath of requiredMedia) {
      expect(content).toContain(relPath);
    }
    expect(content).toContain('Neon Tides');
    expect(content).toContain('Controls');
    expect(content).toContain('Architecture');
  });
});
