#python3 build_hitbox.py <tile_id> <svg_path> spikeHitboxes.json


#!/usr/bin/env python3
"""
Regenerates a single tile's entry in spikeHitboxes.json by rasterizing its
SVG at high resolution and re-sampling it into the exact 200x200 mask grid
that touching.js's is_pixel_on_spike()/bakeForLevel() index into.

Coordinate derivation (matches touching.js's rot===0 branch):
    ix = (-dy * 2) + 100          # dy = upward offset (screen Y-down world)
    iy = (dx  * 2) + 100          # dx = rightward offset from tile center
  =>  dy = (100 - ix) / 2
      dx = (iy - 100) / 2

Tile-local pixel coords (0..60, Y-down, matching the SVG's own coordinate
system once its outer translate() is undone) relate to dx/dy by:
    localX = 30 + dx = iy/2 - 20
    localY = 30 - dy = ix/2 - 20

And the SVG file's own coordinate system is just localX/localY shifted by
a constant pad (since the <g transform="translate(...)"> + viewBox only
translates, never scales -- confirmed by width/height == viewBox size):
    PAD = (viewBoxSize - TILE_SIZE) / 2
    svgX = localX + PAD
    svgY = localY + PAD

Anything outside the SVG's own viewBox is guaranteed transparent (no
spike), since a tile's artwork never bleeds past its own file.
"""
import subprocess
import sys
import re
import json
from PIL import Image

TILE_SIZE = 60
SUPERSAMPLE = 10  # raster px per svg unit; 0.5-unit mask cell -> 5x5 px block
ALPHA_THRESHOLD = 127  # 0-255; average block alpha above this counts as solid


def get_viewbox_size(svg_path):
    text = open(svg_path).read()
    m = re.search(r'viewBox="([\d.,\s]+)"', text)
    parts = re.split(r'[,\s]+', m.group(1).strip())
    w, h = float(parts[2]), float(parts[3])
    assert abs(w - h) < 1e-6, "expected a square viewBox"
    return w


def rasterize(svg_path, scale):
    size = get_viewbox_size(svg_path)
    px = round(size * scale)
    out_path = svg_path + f".raster_{px}.png"
    subprocess.run(
        ["rsvg-convert", "-w", str(px), "-h", str(px), svg_path, "-o", out_path],
        check=True,
    )
    img = Image.open(out_path).convert("RGBA")
    return img, size


def build_mask(svg_path):
    img, view_size = rasterize(svg_path, SUPERSAMPLE)
    alpha = img.split()[-1]  # alpha channel
    pixels = alpha.load()
    px_w, px_h = img.size

    pad = (view_size - TILE_SIZE) / 2.0
    decoded = bytearray(40000)

    for ix in range(200):
        localY = ix / 2.0 - 20.0
        svgY = localY + pad
        if svgY < 0 or svgY >= view_size:
            continue
        for iy in range(200):
            localX = iy / 2.0 - 20.0
            svgX = localX + pad
            if svgX < 0 or svgX >= view_size:
                continue

            rx0 = int(round(svgX * SUPERSAMPLE))
            ry0 = int(round(svgY * SUPERSAMPLE))
            block = SUPERSAMPLE // 2  # 0.5-unit cell -> half the supersample step
            rx1 = min(px_w, rx0 + block)
            ry1 = min(px_h, ry0 + block)
            if rx0 >= px_w or ry0 >= px_h or rx1 <= rx0 or ry1 <= ry0:
                continue

            total = 0
            count = 0
            for yy in range(ry0, ry1):
                for xx in range(rx0, rx1):
                    total += pixels[xx, yy]
                    count += 1
            avg = total / count if count else 0

            if avg > ALPHA_THRESHOLD:
                char_index = (40000 - ((iy + 1) * 200)) + ix
                decoded[char_index] = 1

    return decoded


def encode_binary_rle(data):
    if not data:
        return ""
    result = []
    current_val = data[0]
    current_count = 0
    for v in data:
        if v == current_val:
            current_count += 1
        else:
            result.append(str(current_count))
            current_val = v
            current_count = 1
    result.append(str(current_count))
    return f"{data[0]}|{' '.join(result)}"


def main():
    if len(sys.argv) < 3:
        print("usage: build_hitbox.py <tile_id> <svg_path> [spikeHitboxes.json]")
        sys.exit(1)

    tile_id = sys.argv[1]
    svg_path = sys.argv[2]
    json_path = sys.argv[3] if len(sys.argv) > 3 else "spikeHitboxes.json"

    mask = build_mask(svg_path)
    encoded = encode_binary_rle(mask)

    with open(json_path) as f:
        data = json.load(f)

    old = data.get(tile_id, "<none>")
    data[tile_id] = encoded

    with open(json_path, "w") as f:
        json.dump(data, f)

    solid_count = sum(mask)
    print(f"tile {tile_id}: {solid_count}/40000 solid pixels")
    print(f"old length: {len(old)} chars, new length: {len(encoded)} chars")


if __name__ == "__main__":
    main()