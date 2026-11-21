"""Reproduce the three flat review stills at native resolution (Pillow 13)."""
from pathlib import Path

from layers.neutral_preview import neutral_crowd
from PIL import Image, ImageChops, ImageEnhance, ImageFilter

ROOT = Path(__file__).resolve().parent
PITCH = (272, 352, 752, 1184)
# Measured outer grass bounds, including a few dirt pixels on every edge.
GROUND = [(219, 281, 804, 1264), (230, 284, 796, 1215), (231, 283, 798, 1282)]


def prepare(index, bounds, track):
    source = Image.open(ROOT / "sources" / f"scene-{index:02}.webp").convert("RGB")
    assert source.size == track.size == (1024, 1536)
    ground = source.crop(bounds)
    red, green, _ = ground.split()
    grass = ImageChops.subtract(green, red).point(lambda value: 255 if value > 2 else 0)
    # Blend fresh track into the original dirt fringe around the painted grass.
    fringe = grass.filter(ImageFilter.MaxFilter(15)).filter(ImageFilter.GaussianBlur(2))
    mask = ImageChops.lighter(fringe, grass)
    result = source.copy()
    result.paste(track.crop(bounds), bounds, mask)
    turf = ImageEnhance.Contrast(source.crop(PITCH)).enhance(0.80)
    result.paste(turf, PITCH)
    assert ImageChops.difference(turf, result.crop(PITCH)).getbbox() is None
    if index == 2:
        original = result
        result = neutral_crowd(original)
        changed = ImageChops.difference(original, result).split()
        neutral_mask = ImageChops.lighter(ImageChops.lighter(changed[0], changed[1]), changed[2]).point(lambda value: 255 if value else 0)
        neutral_mask.convert("1").save(ROOT / "neutral-clothing-mask.png")
    result.save(ROOT / f"candidate-{index:02}.webp", lossless=True, method=6, quality=100)


if __name__ == "__main__":
    track = Image.open(ROOT / "sources" / "track.webp").convert("RGB")
    for index, bounds in enumerate(GROUND, start=1):
        prepare(index, bounds, track)
