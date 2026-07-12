# python3 buildhitbox.py 7 assets/tiles/7.svg spikeHitboxes.json


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
a pad (since the <g transform="translate(...)"> + viewBox only
translates, never scales -- confirmed by width/height == viewBox size):
    PAD_X = (viewBoxWidth  - TILE_SIZE) / 2
    PAD_Y = (viewBoxHeight - TILE_SIZE) / 2
    svgX = localX + PAD_X
    svgY = localY + PAD_Y

Not every tile's viewBox is square (tile 7's is 66 x 65.39155, for
instance) -- PAD_X and PAD_Y are computed independently per axis so this
still works when it isn't. A square viewBox is just the special case
PAD_X == PAD_Y.

Anything outside the SVG's own viewBox is guaranteed transparent (no
spike), since a tile's artwork never bleeds past its own file.

---

PNG PLAYER SPRITES use a completely different format from tiles -- this
is NOT the same 200x200 grid, just re-sized. touching.js's
is_pixel_on_player() indexes a 70x70 grid (HITBOX_RES=70) at SCALE=2,
with its own charIndex formula:

    dx = px - PLAYER_X            # rightward offset from player origin
    dy = py + PLAYER_Y            # upward offset (screen Y-down world)
    ix = dx * 2 + 35   (at direction 0, i.e. cos=1, sin=0)
    iy = dy * 2 + 35
    base = HITBOX_RES*HITBOX_RES - HITBOX_RES   # = 4830
    charIndex = base - iy*HITBOX_RES + ix

Unlike the tile format, dx maps to ix and dy maps to iy directly (no
axis swap). The baked mask is direction-independent -- rotation is
applied at runtime via cos/sin, so we only need to fill it at the
canonical (unrotated) orientation above.

The PNG's own pixel grid (col=x rightward, row=y downward, top-left
origin) is mapped to dx/dy via a player-origin anchor point in pixel
space and a pixels-per-world-unit scale:
    dx = (col - anchor_x) / px_per_unit
    dy = (anchor_y - row) / px_per_unit   (row grows down, dy grows up)
"""
import subprocess
import sys
import re
import json
from PIL import Image

TILE_SIZE = 60
SUPERSAMPLE = 10  # raster px per svg unit; 0.5-unit mask cell -> 5x5 px block
ALPHA_THRESHOLD = 127  # 0-255; average block alpha above this counts as solid

HITBOX_RES = 70    # player grid is 70x70, per touching.js
PLAYER_SCALE = 2   # world-units-to-index scale, per touching.js SCALE const


def get_viewbox(svg_path):
    text = open(svg_path).read()
    m = re.search(r'viewBox="([\d.\-,\s]+)"', text)
    parts = re.split(r'[,\s]+', m.group(1).strip())
    min_x, min_y, w, h = (float(p) for p in parts[:4])
    return min_x, min_y, w, h


def rasterize(svg_path, scale):
    min_x, min_y, view_w, view_h = get_viewbox(svg_path)
    px_w = round(view_w * scale)
    px_h = round(view_h * scale)
    out_path = svg_path + f".raster_{px_w}x{px_h}.png"
    subprocess.run(
        ["rsvg-convert", "-w", str(px_w), "-h", str(px_h), svg_path, "-o", out_path],
        check=True,
    )
    img = Image.open(out_path).convert("RGBA")
    return img, min_x, min_y, view_w, view_h


def build_mask(svg_path):
    img, min_x, min_y, view_w, view_h = rasterize(svg_path, SUPERSAMPLE)
    alpha = img.split()[-1]  # alpha channel
    pixels = alpha.load()
    px_w, px_h = img.size

    # Independent per-axis pad -- see module docstring. Identical to the
    # old single `pad` when view_w == view_h.
    pad_x = (view_w - TILE_SIZE) / 2.0
    pad_y = (view_h - TILE_SIZE) / 2.0
    decoded = bytearray(40000)

    for ix in range(200):
        localY = ix / 2.0 - 20.0
        svgY = localY + pad_y
        # pixel row is relative to the viewBox origin (min_y), not absolute 0
        pxY = svgY - min_y
        if pxY < 0 or pxY >= view_h:
            continue
        for iy in range(200):
            localX = iy / 2.0 - 20.0
            svgX = localX + pad_x
            pxX = svgX - min_x
            if pxX < 0 or pxX >= view_w:
                continue

            rx0 = int(round(pxX * SUPERSAMPLE))
            ry0 = int(round(pxY * SUPERSAMPLE))
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

    # The decoded array is laid out row-major as a 200x200 grid where
    # decoded[row*200 + col] corresponds to (ix=col, iy=199-row).
    # Empirically, the raw sample grid comes out mirrored vertically and
    # rotated 90 deg counter-clockwise relative to what touching.js expects,
    # so undo that here: mirror vertically, then rotate 90 deg clockwise.
    import numpy as np
    grid = np.frombuffer(bytes(decoded), dtype=np.uint8).reshape(200, 200)
    grid = np.flipud(grid)
    grid = np.rot90(grid, k=1)  # k=1 -> 90 deg counter-clockwise
    decoded = bytearray(grid.tobytes())

    return decoded


def build_mask_player(png_path, anchor_x=None, anchor_y=None, px_per_unit=None):
    img = Image.open(png_path).convert("RGBA")
    alpha = img.split()[-1]
    pixels = alpha.load()
    px_w, px_h = img.size

    if anchor_x is None:
        anchor_x = px_w / 2.0
    if anchor_y is None:
        anchor_y = px_h / 2.0

    if px_per_unit is None:
        px_per_unit = 2.0

    size = HITBOX_RES * HITBOX_RES
    base = size - HITBOX_RES


    half_cell_units = 1.0 / (2 * PLAYER_SCALE)
    half_cell_px = max(1, round(half_cell_units * px_per_unit))

    decoded = bytearray(size)

    for iy in range(HITBOX_RES):
        dy = (iy - HITBOX_RES / 2.0) / PLAYER_SCALE
        row_f = anchor_y + dy * px_per_unit
        for ix in range(HITBOX_RES):
            dx = (ix - HITBOX_RES / 2.0) / PLAYER_SCALE
            col_f = anchor_x + dx * px_per_unit

            cx0 = int(round(col_f)) - half_cell_px
            cy0 = int(round(row_f)) - half_cell_px
            cx1 = min(px_w, cx0 + 2 * half_cell_px + 1)
            cy1 = min(px_h, cy0 + 2 * half_cell_px + 1)
            cx0 = max(0, cx0)
            cy0 = max(0, cy0)
            if cx0 >= px_w or cy0 >= px_h or cx1 <= cx0 or cy1 <= cy0:
                continue

            total = 0
            count = 0
            for yy in range(cy0, cy1):
                for xx in range(cx0, cx1):
                    total += pixels[xx, yy]
                    count += 1
            avg = total / count if count else 0

            if avg > ALPHA_THRESHOLD:
                char_index = base - iy * HITBOX_RES + ix
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
        print("usage (tile):   build_hitbox.py <tile_id> <svg_path> [spikeHitboxes.json]")
        print("usage (player): build_hitbox.py <player|crouched|wallcrouched> <png_path> "
              "[spikeHitboxes.json] [--anchor-x=N] [--anchor-y=N] [--px-per-unit=N]")
        sys.exit(1)

    tile_id = sys.argv[1]
    src_path = sys.argv[2]

    positional = [a for a in sys.argv[3:] if not a.startswith("--")]
    flags = {}
    for a in sys.argv[3:]:
        if a.startswith("--") and "=" in a:
            k, v = a[2:].split("=", 1)
            flags[k] = v

    json_path = positional[0] if positional else "spikeHitboxes.json"

    ext = src_path.rsplit(".", 1)[-1].lower()
    if ext == "svg":
        mask = build_mask(src_path)
    elif ext == "png":
        anchor_x = float(flags["anchor-x"]) if "anchor-x" in flags else None
        anchor_y = float(flags["anchor-y"]) if "anchor-y" in flags else None
        px_per_unit = float(flags["px-per-unit"]) if "px-per-unit" in flags else None
        mask = build_mask_player(src_path, anchor_x, anchor_y, px_per_unit)
    else:
        print(f"error: unrecognized file type '.{ext}' -- expected .svg or .png")
        sys.exit(1)

    encoded = encode_binary_rle(mask)

    with open(json_path) as f:
        data = json.load(f)

    old = data.get(tile_id, "<none>")
    data[tile_id] = encoded

    with open(json_path, "w") as f:
        json.dump(data, f)

    solid_count = sum(mask)
    print(f"{tile_id}: {solid_count}/{len(mask)} solid pixels")
    print(f"old length: {len(old)} chars, new length: {len(encoded)} chars")


if __name__ == "__main__":
    main()