#!/usr/bin/env python3
"""Stamp the canonical Cuebook wordmark into a viewpoint HTML's bottom-right safe zone."""

from __future__ import annotations

import argparse
import json
from pathlib import Path


ASSET = Path(__file__).resolve().parents[1] / "assets" / "cuebook-wordmark.svg"
MARKER = 'data-cuebook-wordmark="v1"'


def stamp(html: str, background: str) -> tuple[str, bool]:
    if MARKER in html:
        return html, False
    if "</style>" not in html or "</main>" not in html:
        raise ValueError("Viewpoint HTML needs style and main closing tags.")
    color = "#F2F3F4" if background == "dark" else "#101411"
    css = (
        f'.cuebook-wordmark{{position:absolute;right:41px;bottom:34px;width:136px;height:26px;'
        f'color:{color};z-index:50;pointer-events:none}}'
    )
    svg = ASSET.read_text(encoding="utf-8").strip()
    svg = svg.replace(
        "<svg ",
        '<svg class="cuebook-wordmark" data-cuebook-wordmark="v1" data-role="brand" aria-label="Cuebook" ',
        1,
    ).replace('fill="#F2F3F4"', 'fill="currentColor"')
    html = html.replace("</style>", f"{css}\n</style>", 1)
    html = html.replace("</main>", f"  {svg}\n</main>", 1)
    return html, True


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("html", type=Path)
    parser.add_argument("--background", choices=("light", "dark"), default="light", help="Background directly behind the bottom-right wordmark.")
    args = parser.parse_args()
    source = args.html.read_text(encoding="utf-8")
    output, changed = stamp(source, args.background)
    if changed:
        args.html.write_text(output, encoding="utf-8")
    print(json.dumps({"html": str(args.html), "changed": changed, "background": args.background}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
