#!/usr/bin/env python3
"""Render Chrome Web Store images and the site's social card from store/src/*.html.

Needs headless Chrome (set CHROME, or a Playwright Chromium in ~/Library/Caches) and ImageMagick.
The product shot is lifted from site/index.html so screenshots never drift from the homepage.
"""

import glob
import os
import re
import shutil
import subprocess
import sys
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "store", "src")
OUT = os.path.join(ROOT, "store", "images")
SCALE = 2


def find_chrome() -> str:
    if os.environ.get("CHROME"):
        return os.environ["CHROME"]
    candidates = glob.glob(
        os.path.expanduser(
            "~/Library/Caches/ms-playwright/chromium-*/chrome-mac*/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing"
        )
    )
    candidates += [
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
        shutil.which("google-chrome") or "",
        shutil.which("chromium") or "",
    ]
    for path in sorted(candidates, reverse=True):
        if path and os.path.exists(path):
            return path
    sys.exit("No Chrome found. Set CHROME=/path/to/chrome.")


def product_shot() -> str:
    html = open(os.path.join(ROOT, "site", "index.html"), encoding="utf-8").read()
    start = html.index('<div class="shot"')
    end = html.index('<div class="shot__fade"></div>', start)
    shot = html[start:end] + "</div>"
    return shot.replace('src="assets/', 'src="../../site/assets/')


def size_of(path: str) -> tuple[int, int]:
    html = open(path, encoding="utf-8").read()
    match = re.search(r"--w:\s*(\d+)px;\s*--h:\s*(\d+)px", html)
    if not match:
        sys.exit(f"{path} has no --w/--h canvas size")
    return int(match.group(1)), int(match.group(2))


def main() -> None:
    chrome = find_chrome()
    os.makedirs(OUT, exist_ok=True)
    shot = product_shot()
    for template in sorted(glob.glob(os.path.join(SRC, "*.html"))):
        name = os.path.splitext(os.path.basename(template))[0]
        width, height = size_of(template)
        html = open(template, encoding="utf-8").read().replace("{{SHOT}}", shot)
        with tempfile.NamedTemporaryFile("w", suffix=".html", dir=SRC, delete=False, encoding="utf-8") as tmp:
            tmp.write(html)
        raw = os.path.join(tempfile.gettempdir(), f"{name}.raw.png")
        try:
            # Headless Chrome enforces a minimum window width, so render wider and crop.
            subprocess.run(
                [
                    chrome,
                    "--headless",
                    "--hide-scrollbars",
                    "--disable-gpu",
                    f"--force-device-scale-factor={SCALE}",
                    f"--window-size={max(width, 600)},{height}",
                    f"--screenshot={raw}",
                    f"file://{tmp.name}",
                ],
                check=True,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
        finally:
            os.unlink(tmp.name)
        target = os.path.join(OUT, f"{name}.png")
        # The store wants 24-bit PNG without alpha at the exact size.
        subprocess.run(
            [
                "magick",
                raw,
                "-crop",
                f"{width * SCALE}x{height * SCALE}+0+0",
                "+repage",
                "-filter",
                "Lanczos",
                "-resize",
                f"{width}x{height}!",
                "-background",
                "white",
                "-alpha",
                "remove",
                "-alpha",
                "off",
                "PNG24:" + target,
            ],
            check=True,
        )
        os.unlink(raw)
        print(f"{target} {width}x{height}")
    shutil.copy(os.path.join(OUT, "og-1200x630.png"), os.path.join(ROOT, "site", "assets", "og.png"))
    subprocess.run(
        ["rsvg-convert", "-w", "128", "-h", "128", os.path.join(ROOT, "brand", "icon.svg"), "-o", os.path.join(OUT, "store-icon-128.png")],
        check=True,
    )
    print(os.path.join(OUT, "store-icon-128.png"), "128x128")
    subprocess.run(
        ["rsvg-convert", "-w", "120", "-h", "120", os.path.join(ROOT, "brand", "icon-tight.svg"), "-o", os.path.join(OUT, "oauth-logo-120.png")],
        check=True,
    )
    print(os.path.join(OUT, "oauth-logo-120.png"), "120x120")


if __name__ == "__main__":
    main()
