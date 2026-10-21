# README & Gameplay Media Capture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Capture real in-game WebGL2 screenshots and a choreographed gameplay video/GIF of *Neon Tides*, and author a comprehensive `README.md` embedding the visual media, architecture, controls, and developer workflows.

**Architecture:** A deterministic Playwright + Chromium WebGL2 automation script (`scripts/capture-media.py`) drives the running Vite preview server, injects real keyboard/UI interactions across time-of-day phases, camera modes, and HUD drawers, captures four `1280×720` PNG screenshots, records a ~10-second choreographed gameplay sequence, and transcodes it with `ffmpeg` into both an H.264 `.mp4` (`docs/media/gameplay.mp4`) and an inline-renderable palette-optimized `.gif` (`docs/media/gameplay-preview.gif`). A Vitest suite (`tests/media-docs.test.ts`) validates that `README.md` and every embedded media asset exist and meet size/format invariants.

**Tech Stack:** TypeScript, Three.js (WebGL2), Rapier3D WASM, Vite, Python Playwright, `ffmpeg` (`libx264` + `palettegen`/`paletteuse`), Vitest.

## Global Constraints

- All screenshots and videos must be captured from the live WebGL2 render of *Neon Tides* (no mockups or placeholder images).
- Video outputs must include both `docs/media/gameplay.mp4` (H.264 `yuv420p` with `+faststart`) and `docs/media/gameplay-preview.gif` (for automatic inline rendering on GitHub Markdown).
- Every relative image and video link inside `README.md` must resolve to an existing, non-empty file verified by `npm test`.

---

### Task 1: Media & README Verification Test Suite

**Files:**
- Create: `tests/media-docs.test.ts`

**Interfaces:**
- Consumes: `README.md`, `docs/media/*`
- Produces: Automated verification of README structure and media artifacts (`npm test`)

- [ ] **Step 1: Write the failing test**

```typescript
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/media-docs.test.ts`
Expected: FAIL with `Missing media file: docs/media/screenshot-neon-night.png`

---

### Task 2: Automated Gameplay Screenshot & Video Capture Pipeline

**Files:**
- Create: `scripts/capture-media.py`
- Modify: `package.json` (add `"media:capture"` script)
- Create: `docs/media/screenshot-neon-night.png`
- Create: `docs/media/screenshot-golden-hour.png`
- Create: `docs/media/screenshot-contracts-map.png`
- Create: `docs/media/screenshot-shipyard-diagnostics.png`
- Create: `docs/media/gameplay.mp4`
- Create: `docs/media/gameplay-preview.gif`

**Interfaces:**
- Consumes: Live Vite server at `http://127.0.0.1:4173`, `/opt/homebrew/bin/ffmpeg`
- Produces: 4 PNG screenshots + 1 MP4 video + 1 animated GIF in `docs/media/`

- [ ] **Step 1: Create `scripts/capture-media.py` to choreograph gameplay and capture screenshots + video**

```python
#!/usr/bin/env python3
"""
Automated Gameplay Screenshot & Video Capture for Neon Tides.
Launches headless Chrome with hardware WebGL2 enabled, drives the boat across
Mirai Harbour & Akari Canal, captures 4 high-resolution screenshots, records
live gameplay video, and transcodes MP4 + palette-optimized GIF via ffmpeg.
"""
import os
import shutil
import subprocess
import time
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
MEDIA_DIR = ROOT / "docs" / "media"
TMP_VIDEO_DIR = ROOT / "docs" / "media" / "_tmp_video"


def transcode_video(raw_webm: Path, mp4_out: Path, gif_out: Path) -> None:
    ffmpeg = shutil.which("ffmpeg") or "/opt/homebrew/bin/ffmpeg"
    subprocess.run(
        [
            ffmpeg, "-y",
            "-ss", "0.8",
            "-i", str(raw_webm),
            "-c:v", "libx264",
            "-preset", "slow",
            "-crf", "20",
            "-pix_fmt", "yuv420p",
            "-movflags", "+faststart",
            str(mp4_out),
        ],
        check=True,
    )
    palette_Filter = (
        "fps=15,scale=800:-1:flags=lanczos,split[s0][s1];"
        "[s0]palettegen=max_colors=256:stats_mode=diff[p];"
        "[s1][p]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle"
    )
    subprocess.run(
        [
            ffmpeg, "-y",
            "-i", str(mp4_out),
            "-vf", palette_Filter,
            "-loop", "0",
            str(gif_out),
        ],
        check=True,
    )
```

- [ ] **Step 2: Run `scripts/capture-media.py` against the local Vite server and verify media outputs**

Run: `/opt/anaconda3/bin/python3 scripts/capture-media.py`
Expected: Generates all 6 files in `docs/media/` with non-zero sizes.

---

### Task 3: Author Comprehensive `README.md`

**Files:**
- Create: `README.md`

**Interfaces:**
- Consumes: `docs/media/*`, `docs/superpowers/specs/2026-10-21-neon-tides-design.md`, `package.json`
- Produces: Root `README.md` with embedded gameplay GIF, MP4 video link/player, 4-panel screenshot gallery, architecture diagram, controls table, and setup instructions.

- [ ] **Step 1: Write `README.md`**

Include:
1. Title, bilingual subtitle (`NEON TIDES // ネオン・タイズ`), and tech stack badges.
2. Gameplay Video Showcase (`docs/media/gameplay-preview.gif` inline + `docs/media/gameplay.mp4` HD video link & HTML5 `<video>` tag).
3. Screenshot Gallery (`screenshot-neon-night.png`, `screenshot-golden-hour.png`, `screenshot-contracts-map.png`, `screenshot-shipyard-diagnostics.png`).
4. System Architecture Mermaid flowchart + 4-Subsystem technical deep dive.
5. Complete Controls & Instrumentation Reference Table.
6. Four Japanese Maritime Districts & Three Playable Vessel Archetypes.
7. Quick Start, Asset Pipeline (`blender-mcp`), and Testing commands.

- [ ] **Step 2: Run full test suite to verify all tests pass**

Run: `npm test && npm run build`
Expected: All 5 test files pass (`tests/media-docs.test.ts` + 4 existing suites) and production build succeeds.
