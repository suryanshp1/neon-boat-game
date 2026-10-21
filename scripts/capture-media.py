#!/usr/bin/env python3
"""
Automated Gameplay Screenshot & Video Capture for Neon Tides.
Launches headless Chromium with hardware WebGL2 enabled, drives the boat across
Mirai Harbour & Akari Canal, captures 4 high-resolution screenshots, records
live gameplay video, and transcodes MP4 + palette-optimized GIF via ffmpeg.
"""
import os
import shutil
import socket
import subprocess
import time
import urllib.request
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
MEDIA_DIR = ROOT / "docs" / "media"
TMP_VIDEO_DIR = MEDIA_DIR / "_tmp_video"
PORT = 4177
URL = f"http://127.0.0.1:{PORT}/"


def is_port_open(port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.settimeout(0.3)
        return s.connect_ex(("127.0.0.1", port)) == 0


def wait_for_server(url: str, timeout_s: float = 15.0) -> None:
    deadline = time.time() + timeout_s
    while time.time() < deadline:
        try:
            with urllib.request.urlopen(url, timeout=1.0) as resp:
                if resp.status == 200:
                    return
        except Exception:
            time.sleep(0.25)
    raise RuntimeError(f"Server at {url} did not start within {timeout_s}s")


def transcode_video(raw_webm: Path, mp4_out: Path, gif_out: Path) -> None:
    ffmpeg = shutil.which("ffmpeg") or "/opt/homebrew/bin/ffmpeg"
    if not Path(ffmpeg).exists():
        raise FileNotFoundError("ffmpeg binary not found")

    # 1. Transcode to universally compatible H.264 MP4 (1280x720, yuv420p, faststart)
    subprocess.run(
        [
            ffmpeg,
            "-y",
            "-ss",
            "0.6",
            "-i",
            str(raw_webm),
            "-c:v",
            "libx264",
            "-preset",
            "slow",
            "-crf",
            "20",
            "-pix_fmt",
            "yuv420p",
            "-movflags",
            "+faststart",
            str(mp4_out),
        ],
        check=True,
    )

    # 2. Generate high-quality palette-optimized animated GIF for inline GitHub README playback
    palette_filter = (
        "fps=15,scale=800:-1:flags=lanczos,split[s0][s1];"
        "[s0]palettegen=max_colors=256:stats_mode=diff[p];"
        "[s1][p]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle"
    )
    subprocess.run(
        [
            ffmpeg,
            "-y",
            "-i",
            str(mp4_out),
            "-vf",
            palette_filter,
            "-loop",
            "0",
            str(gif_out),
        ],
        check=True,
    )


def capture_all() -> None:
    MEDIA_DIR.mkdir(parents=True, exist_ok=True)
    if TMP_VIDEO_DIR.exists():
        shutil.rmtree(TMP_VIDEO_DIR)
    TMP_VIDEO_DIR.mkdir(parents=True, exist_ok=True)

    server_proc = None
    if not is_port_open(PORT):
        server_proc = subprocess.Popen(
            ["npx", "vite", "--port", str(PORT), "--host", "127.0.0.1"],
            cwd=str(ROOT),
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )

    try:
        wait_for_server(URL)

        with sync_playwright() as p:
            chrome_path = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
            launch_kwargs = {
                "headless": True,
                "args": [
                    "--use-angle=metal",
                    "--enable-webgl",
                    "--ignore-gpu-blocklist",
                    "--enable-gpu-rasterization",
                ],
            }
            if Path(chrome_path).exists():
                launch_kwargs["executable_path"] = chrome_path

            browser = p.chromium.launch(**launch_kwargs)
            context = browser.new_context(
                viewport={"width": 1280, "height": 720},
                device_scale_factor=2,
                record_video_dir=str(TMP_VIDEO_DIR),
                record_video_size={"width": 1280, "height": 720},
            )
            page = context.new_page()
            page.goto(URL, wait_until="networkidle")

            # Wait for WebGL canvas, Rapier WASM, and all 10 GLB models to finish booting
            page.wait_for_selector("#viewport-container canvas", timeout=10000)
            page.wait_for_selector("#hud-speed-val", timeout=10000)
            time.sleep(1.2)

            # Segment 1: Accelerate with Hydro-Boost out of Mirai Harbour in Neon Night
            page.keyboard.down("KeyW")
            page.keyboard.down("ShiftLeft")
            time.sleep(1.3)
            page.keyboard.down("KeyD")
            time.sleep(0.55)
            page.keyboard.up("KeyD")
            time.sleep(0.6)

            # Screenshot 1: Hero Neon Night Action Shot (Boost active, thruster plumes, skyline & beacon)
            page.screenshot(path=str(MEDIA_DIR / "screenshot-neon-night.png"))

            # Segment 2: Carve a wake drift turn and switch to Golden Hour / Sunset + Close Action Camera
            page.keyboard.down("Space")
            page.keyboard.down("KeyA")
            time.sleep(0.75)
            page.keyboard.up("KeyA")
            page.keyboard.up("Space")

            # Cycle Time-of-Day to Golden Hour (3 presses of KeyT) & Close Action Camera (KeyC)
            page.keyboard.press("KeyT")
            time.sleep(0.15)
            page.keyboard.press("KeyT")
            time.sleep(0.15)
            page.keyboard.press("KeyT")
            time.sleep(0.15)
            page.keyboard.press("KeyC")
            time.sleep(1.1)

            # Screenshot 2: Golden Hour Atmospheric Wave-Riding
            page.screenshot(path=str(MEDIA_DIR / "screenshot-golden-hour.png"))

            # Segment 3: Return to Neon Night (KeyT) & Open Contracts + 4x4km Bay Radar Map Drawer (KeyM)
            page.keyboard.press("KeyT")
            time.sleep(0.2)
            page.keyboard.press("KeyM")
            time.sleep(0.85)

            # Screenshot 3: Contracts & 4x4 km Bay Map Drawer
            page.screenshot(path=str(MEDIA_DIR / "screenshot-contracts-map.png"))

            # Segment 4: Toggle Japanese Localization + CTO Telemetry [F3] + Marina & Fleet Shipyard [B]
            page.keyboard.press("Escape")
            time.sleep(0.15)
            page.evaluate("document.getElementById('btn-lang-toggle')?.click()")
            page.keyboard.press("F3")
            page.keyboard.press("KeyB")
            time.sleep(0.85)

            # Screenshot 4: Shipyard Upgrades + Japanese Localization + CTO Telemetry Overlay
            page.screenshot(path=str(MEDIA_DIR / "screenshot-shipyard-diagnostics.png"))

            # Finale: Close drawer, switch back to English + standard chase cam, and boost through the bay
            page.keyboard.press("Escape")
            page.keyboard.press("F3")
            page.evaluate("document.getElementById('btn-lang-toggle')?.click()")
            time.sleep(1.2)

            page.keyboard.up("ShiftLeft")
            page.keyboard.up("KeyW")

            video_obj = page.video
            context.close()
            browser.close()

            if not video_obj:
                raise RuntimeError("Playwright did not produce a video recording")
            raw_video_path = Path(video_obj.path())

        mp4_path = MEDIA_DIR / "gameplay.mp4"
        gif_path = MEDIA_DIR / "gameplay-preview.gif"
        transcode_video(raw_video_path, mp4_path, gif_path)
    finally:
        if TMP_VIDEO_DIR.exists():
            shutil.rmtree(TMP_VIDEO_DIR, ignore_errors=True)
        if server_proc is not None:
            server_proc.terminate()
            try:
                server_proc.wait(timeout=3)
            except Exception:
                server_proc.kill()


if __name__ == "__main__":
    capture_all()
    print("Successfully captured screenshots, gameplay.mp4, and gameplay-preview.gif in docs/media/")
