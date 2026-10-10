# Keel brand assets

Geometric K monogram (spine + diagonal arm + diagonal leg, separated by a deliberate gap) and a custom lowercase `keel` wordmark. All artwork is plain vector paths: no fonts, no raster images, no background rectangle.

## Which file to use

| Need | File |
|---|---|
| Logo on light backgrounds | `keel-logo.svg` / `keel-logo.png` |
| Logo on dark backgrounds | `keel-logo-white.svg` / `keel-logo-white.png` |
| Favicon, app icon, compact UI (light surfaces) | `keel-icon.svg`, `icon-sizes/keel-icon-{16,32,48,128,256,512}.png` |
| Favicon / compact UI on dark surfaces | `keel-icon-white.svg`, `icon-sizes/keel-icon-white-*.png` |
| Sidebars and themed UI | `keel-icon-mono.svg` (fill is `currentColor`, inherits text colour) |
| Optional accent | `keel-logo-blue.*`, `keel-icon-blue.*` (+ `icon-sizes/keel-icon-blue-*.png`) |

## Colours

- Near-black `#0A0A0A` (primary)
- White `#FFFFFF` (inverted)
- Blue `#2563EB` (optional accent; the mark never depends on it)

Each file is a single solid colour. No gradients, shadows or effects.

## PNG dimensions

- `keel-logo*.png`: 2400 x 755
- `keel-icon*.png`: 1024 x 1024
- `keel-icon-mono.png`: 512 x 512
- `icon-sizes/`: 16, 32, 48, 128, 256, 512 px square (each rendered directly from the vector, not downscaled from a larger PNG)

SVG viewBoxes: logo `0 0 165.38 52`, icon `1 2 60 60`. Padding is about 6 units around the lockup and about 7 units around the icon.

## Verify transparency

```python
from PIL import Image
im = Image.open("keel-logo.png")
print(im.mode)             # RGBA
print(im.getpixel((0, 0))) # (r, g, b, 0): corner pixel has alpha 0
print(im.getchannel("A").getextrema())  # (0, 255)
```

ImageMagick: `identify -format "%[channels] %[opaque]\n" keel-logo.png` should print `srgba false`.

SVG check: `grep -c "<rect\|<image" keel-logo.svg` should print `0`.

## Usage notes

- Keep clear space of at least the K's spine width around the logo.
- Below about 24 px, use the icon alone rather than the lockup.
- Do not recolour outside the three colours above, and do not add effects.
