"""Cut the approved Gatehouse painting with Pillow 13.0.0."""

import argparse
from collections import Counter
from hashlib import sha256
import json
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageEnhance, ImageFilter, ImageOps


ROOT = Path(__file__).resolve().parent
SOURCE = ROOT.parent / "candidate-02.webp"
SOURCE_HASH = "5f212289b0fb4a783176e4e4b93b226f32abfc81376a7c8bf883c0a83e72242c"
WIDTH, HEIGHT = 1024, 1536
PITCH = (272, 352, 752, 1184)
SIDE_TOP, SIDE_BOTTOM = 132, 1312
VISITOR = (818, 133, WIDTH, 512)

# Small boxes around heraldry, stopping before the gilded fringe and hardware.
HOME_LIONS = [
    ("far-left", "ends", (339, 137, 379, 198)),
    ("far-center", "ends", (486, 134, 541, 204)),
    ("far-right", "ends", (653, 137, 696, 199)),
    ("left-upper", "sides", (101, 403, 129, 476)),
    ("left-middle", "sides", (49, 794, 82, 882)),
    ("left-lower", "sides", (24, 1166, 63, 1244)),
    ("right-middle", "sides", (948, 794, 983, 883)),
    ("right-lower", "sides", (960, 1172, 999, 1250)),
    ("near-left", "ends", (308, 1295, 361, 1367)),
    ("near-right", "ends", (664, 1294, 720, 1365)),
]
VISITOR_SKULL = (973, 231, 1016, 294)

# The travelling crop follows the crowd side of the wall. It stops short of
# importing painted apron, flames, or props over the matching near corner.
AWAY_VISITOR_EDGES = [
    [
        (0, 1042), (35, 1041), (49, 1046), (60, 1067), (70, 1085),
        (72, 1100), (74, 1124), (79, 1138), (85, 1152), (93, 1164),
        (91, 1198), (90, 1221), (97, 1237), (96, 1252), (89, 1265),
        (66, 1268), (48, 1270), (25, 1267), (0, 1263),
    ],
    [
        (0, 1328), (15, 1329), (28, 1325), (41, 1323), (59, 1329),
        (68, 1340), (65, 1350), (56, 1358), (49, 1365), (33, 1366),
        (22, 1362), (0, 1361),
    ],
]

# The bounds follow the cloth edges, inset from poles, braziers, and faces.
GOLD_CLOTH = [
    ((393, 139), (404, 139), (399, 153)),
    ((409, 137), (440, 137), (426, 158)),
    ((445, 137), (460, 137), (453, 151)),
    ((569, 138), (586, 138), (579, 153)),
    ((588, 138), (608, 138), (598, 157)),
    ((625, 138), (644, 137), (635, 156)),
    ((14, 514), (28, 511), (27, 538)),
    ((48, 495), (64, 488), (64, 522)),
    ((952, 491), (973, 499), (970, 527)),
    ((992, 508), (1014, 515), (998, 539)),
    ((161, 19), (177, 16), (175, 30), (160, 33)),
    ((355, 6), (367, 10), (364, 24), (350, 21)),
    ((380, 13), (395, 15), (393, 27), (377, 27)),
    ((413, 10), (426, 9), (428, 21), (415, 25)),
    ((791, 10), (811, 5), (813, 17), (794, 23)),
]

BENCH_CLOTH = [
    ((126, 529), (162, 535), (151, 591), (115, 584)),
    ((859, 525), (895, 516), (910, 584), (873, 582)),
    ((116, 860), (151, 868), (132, 941), (101, 937)),
    ((875, 871), (908, 868), (924, 941), (891, 942)),
]

# Outer spectators and banners, clear of the torch pillars, barrels, and
# bench frames. Hand-traced bounds keep reflected blue out of the masks.
LEFT_CLOTH = [
    (0, 96), (119, 100), (107, 155), (128, 202), (138, 248),
    (134, 286), (129, 327), (126, 366), (136, 388), (134, 491),
    (129, 525), (101, 551), (94, 590), (90, 632), (77, 674),
    (79, 708), (91, 741), (91, 823), (93, 908), (88, 966),
    (72, 1013), (60, 1059), (62, 1100), (67, 1135), (75, 1166),
    (75, 1249), (67, 1286), (51, 1319), (0, 1319),
]
HOME_CLOTH = [
    ((0, 0), (1023, 0), (1023, 105), (0, 105)),
    ((0, 1316), (217, 1316), (250, 1378), (386, 1407), (639, 1407),
     (774, 1378), (806, 1316), (1023, 1316), (1023, 1535), (0, 1535)),
    LEFT_CLOTH,
    [(WIDTH - 1 - x, y) for x, y in LEFT_CLOTH],
    ((391, 136), (462, 136), (462, 164), (391, 164)),
    ((568, 136), (644, 136), (644, 163), (568, 163)),
    # Right hanging cloths are slightly wider where their poles join the wall.
    ((928, 746), (945, 756), (963, 789), (986, 807), (983, 931), (954, 946), (930, 916)),
    ((949, 1142), (965, 1164), (1002, 1177), (1004, 1266), (973, 1276), (948, 1254)),
]

# Red wraps only the visiting section. These selections follow actual cloth
# inside the group. The colour test then removes exposed skin and cool shadows.
RED_CLOTH = [
    ((980, 221), (1015, 226), (1017, 299), (1004, 307), (985, 299), (974, 266)),
    ((901, 377), (929, 415), (933, 445), (923, 493), (916, 485), (903, 464)),
    ((961, 169), (976, 167), (981, 171), (980, 178), (973, 176), (963, 172)),
    ((985, 171), (993, 169), (993, 179), (986, 186)),
    ((960, 209), (969, 206), (981, 202), (982, 219), (974, 217), (969, 214)),
    ((921, 222), (933, 221), (937, 226), (937, 232), (929, 230), (920, 226)),
    ((906, 249), (909, 253), (910, 263), (906, 267), (901, 261), (900, 252)),
    ((920, 255), (930, 250), (925, 259), (922, 267), (918, 272), (916, 265)),
    ((929, 298), (940, 292), (943, 287), (951, 282), (953, 298), (943, 303)),
    ((960, 295), (970, 289), (980, 291), (981, 300), (977, 302), (966, 300)),
    ((931, 323), (941, 319), (942, 326), (937, 333), (929, 338), (927, 332)),
    ((944, 367), (958, 361), (962, 365), (958, 371), (951, 377), (944, 378)),
    ((964, 369), (974, 370), (979, 375), (979, 381), (972, 377), (963, 373)),
    ((949, 398), (957, 398), (957, 409), (953, 413), (949, 408)),
    ((978, 400), (986, 400), (992, 406), (991, 413), (986, 411), (980, 405)),
    ((996, 445), (1001, 445), (1009, 441), (1019, 441), (1013, 448), (1009, 460), (999, 460)),
]


def polygon_mask(size, polygons):
    mask = Image.new("L", size)
    draw = ImageDraw.Draw(mask)
    for polygon in polygons:
        draw.polygon(polygon, fill=255)
    return mask


def gold(red, green, blue):
    return red >= 96 and red >= green * 1.15 and green >= 42 and blue <= green * 0.72


def cobalt(red, green, blue):
    return blue >= 73 and blue - red >= 34 and blue - green >= 24 and blue >= red * 1.60


def scarlet(red, green, blue):
    return red >= 85 and green <= red * 0.24 and blue <= red * 0.39


def shade(red, green, blue):
    # Preserve tonal ordering without letting the original pigment's luminance
    # flatten the cobalt and red masks into the darkest few entries.
    peak = max(red, green, blue)
    return 1 + max(0, min(15, round((peak - 35) * 15 / 220)))


def home_cloth(image):
    mask = Image.new("L", image.size)
    blue_regions = polygon_mask(image.size, HOME_CLOTH).load()
    gold_regions = polygon_mask(image.size, GOLD_CLOTH).load()
    bench_regions = polygon_mask(image.size, BENCH_CLOTH).load()
    pixels = image.load()
    for y in range(HEIGHT):
        for x in range(WIDTH):
            red, green, blue = pixels[x, y]
            if (blue_regions[x, y] or bench_regions[x, y]) and cobalt(red, green, blue):
                mask.putpixel((x, y), shade(red, green, blue))
            elif gold_regions[x, y] and gold(red, green, blue):
                mask.putpixel((x, y), 16 + shade(red, green, blue))
            elif bench_regions[x, y] and 113 <= red <= 236 and 3 <= red - green <= 45 and green - blue <= 48:
                # Linen stripes between blue stripes are also cloth.
                mask.putpixel((x, y), 16 + shade(red, green, blue))
    # The flat banners at the ends hang beyond the crowd bounds.
    for x0, y0, x1, y1 in [
        (333, 122, 385, 217), (472, 121, 552, 231), (647, 122, 698, 215),
        (299, 1280, 368, 1396), (661, 1280, 732, 1396),
    ]:
        for y in range(y0, y1):
            for x in range(x0, x1):
                rgb = pixels[x, y]
                if cobalt(*rgb):
                    mask.putpixel((x, y), shade(*rgb))
    return mask


def visitor_cloth(image):
    regions = polygon_mask(image.size, RED_CLOTH).crop(VISITOR)
    mask = Image.new("L", regions.size)
    for y in range(mask.height):
        for x in range(mask.width):
            if regions.getpixel((x, y)):
                rgb = image.getpixel((x + VISITOR[0], y + VISITOR[1]))
                if scarlet(*rgb):
                    mask.putpixel((x, y), shade(*rgb))
    return mask


def artwork_alpha(image, alpha):
    result = image.convert("RGBA")
    result.putalpha(alpha)
    return result


def take_emblem(image, box, cloth_color):
    """Lift a gold icon and the narrow dark outline painted around it."""
    source = image.crop(box)
    contour = Image.new("L", source.size)
    for y in range(source.height):
        for x in range(source.width):
            if gold(*source.getpixel((x, y))):
                contour.putpixel((x, y), 255)
    contour = contour.filter(ImageFilter.MaxFilter(3))
    assert contour.getbbox(), box
    emblem = artwork_alpha(source, contour)
    # Reuse contiguous cloth pixels from the same row to fill under the icon.
    for y in range(source.height):
        left = box[0] - 10
        right = min(image.width, box[2] + 10)
        row = [
            x for x in range(max(0, left), right)
            if cloth_color(*image.getpixel((x, y + box[1])))
            and (not box[0] <= x < box[2] or not contour.getpixel((x - box[0], y)))
        ]
        for x in range(source.width):
            if contour.getpixel((x, y)) and row:
                color_x = min(row, key=lambda candidate: abs(candidate - (x + box[0])))
                source.putpixel((x, y), image.getpixel((color_x, y + box[1])))
    image.paste(source, box)
    return emblem


def eases(value):
    value = min(1, max(0, value))
    return value * value * (3 - 2 * value)


def visitor_mattes():
    x0, y0, x1, y1 = VISITOR
    size = (x1 - x0, y1 - y0)
    inner = Image.new("L", size)
    for y in range(size[1]):
        for x in range(size[0]):
            # Feather over the empty apron and the blue home supporters
            # surrounding the visiting block.
            main = eases((x - 12) / 43) * eases((y - 2) / 34) * eases((size[1] - y - 1) / 35)
            inner.putpixel((x, y), round(255 * main))
    # Use binary alpha on the approved home art so Canvas premultiplication
    # cannot perturb native pixels at the seam.
    outer = Image.new("L", size, 255)
    return inner, outer


def away_matte(size, away_y):
    paths = [[(x, y - away_y) for x, y in edge] for edge in AWAY_VISITOR_EDGES]
    path = polygon_mask(size, paths)
    return path.filter(ImageFilter.GaussianBlur(1.2))


class Cut:
    def __init__(self, output):
        assert sha256(SOURCE.read_bytes()).hexdigest() == SOURCE_HASH
        self.output = output
        self.output.mkdir(parents=True, exist_ok=True)
        self.source = Image.open(SOURCE).convert("RGB")
        assert self.source.size == (WIDTH, HEIGHT)
        self.layers = []
        self.files = []

    def save(self, name, image):
        is_mask = image.mode == "L"
        path = self.output / f"{name}.{'png' if is_mask else 'webp'}"
        if is_mask:
            image.save(path, optimize=True)
        else:
            image.save(path, lossless=True, method=6)
        self.files.append(path)
        decoded = Image.open(path).convert(image.mode)
        # RGB below transparent pixels is irrelevant and may be discarded by WebP.
        if image.mode == "RGBA":
            assert decoded.getchannel("A").tobytes() == image.getchannel("A").tobytes()
            visible = image.getchannel("A").point(lambda value: 255 if value else 0)
            for channel in range(3):
                difference = ImageChops.difference(decoded.getchannel(channel), image.getchannel(channel))
                assert ImageChops.multiply(difference, visible).getbbox() is None, path
        else:
            assert decoded.tobytes() == image.tobytes(), path
        return path.name

    def art(self, name, role, image, x, y, *, mirror=True, indices=None, **fields):
        layer = {
            "id": name, "role": role, "image": self.save(name, image),
            "home": {"x": x, "y": y},
            "away": {"x": WIDTH - x - image.width, "y": y, "flipX": mirror},
            **fields,
        }
        if indices is not None:
            assert indices.size == image.size and indices.getextrema()[1] <= 32
            if image.mode == "RGBA":
                transparent = image.getchannel("A").point(lambda value: 0 if value else 255)
                assert ImageChops.multiply(indices, transparent).getbbox() is None
            layer.update(mask=self.save(f"{name}-cloth", indices), team="home")
        self.layers.append(layer)
        return layer

    def emblem_group(self, group, pieces):
        home = Image.new("RGBA", self.source.size)
        away = Image.new("RGBA", self.source.size)
        for x, y, emblem in pieces:
            home.alpha_composite(emblem, (x, y))
            away.alpha_composite(emblem, (WIDTH - x - emblem.width, y))
        home_box = home.getchannel("A").getbbox()
        away_box = away.getchannel("A").getbbox()
        layer = self.art(f"{group}-emblems", "emblem", home.crop(home_box), *home_box[:2],
                         mirror=False, group=group)
        layer["away"].update(x=away_box[0], y=away_box[1],
                             image=self.save(f"{group}-emblems-away", away.crop(away_box)))

    def compose(self, view, visitor="orc", calm=False):
        result = Image.new("RGBA", self.source.size)
        for layer in self.layers:
            if visitor is None and (layer["role"] == "visitor" or layer.get("group") == "visitor"):
                continue
            pose = layer[view]
            name = pose.get("image", layer["image"])
            if visitor == "human":
                name = pose.get("humanImage", layer.get("humanImage", name))
            if calm:
                name = layer.get("calmImage", name)
            image = Image.open(self.output / name).convert("RGBA")
            if pose.get("flipX"):
                image = ImageOps.mirror(image)
            result.alpha_composite(image, (pose["x"], pose["y"]))
        assert result.getchannel("A").getextrema() == (255, 255), (view, visitor)
        return result.convert("RGB")

    def run(self, previews):
        painting = self.source.copy()
        neutral = Image.open(ROOT.parent / "neutral-clothing-mask.png").convert("L")
        assert neutral.size == painting.size and neutral.histogram()[255] == 20_082
        cloth = home_cloth(painting)
        cloth.paste(0, mask=neutral)
        emblems = []
        for name, group, box in HOME_LIONS:
            emblem = take_emblem(painting, box, cobalt)
            cloth.paste(0, box, emblem.getchannel("A"))
            emblems.append((name, group, box, emblem))

        apron_alpha = Image.new("L", painting.size, 255)
        # The side rectangles stop outside the pitch, and the end pieces cover
        # the matching corners only past the horizontal edge of each side.
        left = (0, SIDE_TOP, PITCH[0], SIDE_BOTTOM)
        right = (PITCH[2], SIDE_TOP, WIDTH, SIDE_BOTTOM)
        inner, outer = visitor_mattes()
        vx, vy, vr, vb = VISITOR
        home_visitor = painting.crop(VISITOR)
        visitor_mask = visitor_cloth(self.source)
        visitor_mask.paste(0, mask=neutral.crop(VISITOR))
        fallback_box = (0, vy, vr - vx, vb)
        fallback = ImageOps.mirror(painting.crop(fallback_box))
        painting.paste(fallback, VISITOR, inner)
        cloth.paste(ImageOps.mirror(cloth.crop(fallback_box)), VISITOR, inner.point(lambda v: 255 if v > 127 else 0))

        for name, box, gap in [
            ("far-end", (0, 0, WIDTH, PITCH[1]), (SIDE_TOP, PITCH[1])),
            ("near-end", (0, PITCH[3], WIDTH, HEIGHT), (PITCH[3], SIDE_BOTTOM)),
        ]:
            alpha = apron_alpha.copy()
            alpha.paste(0, (0, gap[0], PITCH[0], gap[1]))
            alpha.paste(0, (PITCH[2], gap[0], WIDTH, gap[1]))
            indices = ImageChops.multiply(cloth, alpha).crop(box)
            self.art(name, "ends", artwork_alpha(painting.crop(box), alpha.crop(box)), *box[:2], indices=indices)
        for name, box in [("left-stand", left), ("right-stand", right)]:
            self.art(name, "sides", painting.crop(box), *box[:2], indices=cloth.crop(box))
        for group in ("ends", "sides"):
            pieces = [(box[0], box[1], emblem) for _, kind, box, emblem in emblems if kind == group]
            if group == "sides":
                fallback_lion = next((box, emblem) for name, _, box, emblem in emblems if name == "left-upper")
                box, emblem = fallback_lion
                pieces.append((WIDTH - box[2], box[1], emblem))
            self.emblem_group(group, pieces)

        # A home group fills the spot underneath the visiting overlay. The
        # original visiting group remains upright when moved to its opposite
        # position. Only the soft seam crosses the top or bottom of its crop.
        away_y = HEIGHT - vb
        away_alpha = away_matte(home_visitor.size, away_y)
        shifted_mask = ImageOps.mirror(visitor_mask)
        shifted_mask.paste(0, (0, 0), away_alpha.point(lambda v: 0 if v == 255 else 255))
        skull = take_emblem(home_visitor, tuple(
            coordinate - (vx if i % 2 == 0 else vy) for i, coordinate in enumerate(VISITOR_SKULL)
        ), scarlet)
        shifted_visitor = ImageOps.mirror(home_visitor)
        # The native home asset covers the full fallback. The moved group uses
        # the feathered matte to retain pixels around the destination seam.
        overlay = self.art("visiting-section", "visitor", artwork_alpha(home_visitor, outer),
                           vx, vy, mirror=False, indices=visitor_mask)
        overlay["team"] = "away"
        overlay["away"].update(
            y=away_y, image=self.save("visiting-section-away", artwork_alpha(shifted_visitor, away_alpha)),
            mask=self.save("visiting-section-away-cloth", shifted_mask),
        )
        standard = self.art("visiting-standard", "emblem", skull, *VISITOR_SKULL[:2], mirror=False, group="visitor")
        standard["away"]["y"] = away_y + VISITOR_SKULL[1] - vy
        # Fit the smaller far-end lion at native scale, retaining gold pixels
        # but leaving the lion's original blue backing on the far-end banner.
        human = Image.new("RGBA", skull.size)
        human_lion = emblems[0][3].copy()
        for y in range(human_lion.height):
            for x in range(human_lion.width):
                red, green, blue, alpha = human_lion.getpixel((x, y))
                if alpha and not gold(red, green, blue):
                    human_lion.putpixel((x, y), (red, green, blue, 0))
        crest = human_lion.crop(human_lion.getchannel("A").getbbox())
        assert crest.width <= human.width and crest.height <= human.height, (crest.size, human.size)
        human.alpha_composite(crest, ((human.width - crest.width) // 2, (human.height - crest.height) // 2))
        standard["humanImage"] = self.save("visiting-standard-human", human)

        turf = self.source.crop(PITCH)
        self.art("balanced-turf", "turf", turf, *PITCH[:2], mirror=False,
                 calmImage=self.save("calm-turf", ImageEnhance.Contrast(turf).enhance(0.72)))

        native = self.compose("home")
        changed = differences(self.source, native)
        assert not changed, changed
        visitor_pixels = {}
        for view in ("home", "away"):
            orc = self.compose(view)
            human = self.compose(view, "human")
            no_visitor = self.compose(view, None)
            calm = self.compose(view, calm=True)
            count = differences(orc, no_visitor)
            assert count > 5_000, (view, count)
            assert differences(orc, human) > 300
            assert differences(orc, calm, outside=PITCH) == 0
            visitor_pixels[view] = {"fallback": count, "humanCrest": differences(orc, human)}
            if previews:
                previews.mkdir(parents=True, exist_ok=True)
                for label, img in [("orc", orc), ("human", human), ("no-visitor", no_visitor), ("calm", calm)]:
                    img.save(previews / f"{view}-{label}.png")

        stats = {
            "nativeOutsidePitchDifferentPixels": differences(self.source, native, outside=PITCH),
            "nativeInsidePitchDifferentPixels": changed,
            "outsidePitchPixels": WIDTH * HEIGHT - turf.width * turf.height,
            "visitorDifferentPixels": visitor_pixels,
            "maskPixels": {
                path.stem: dict(sorted(Counter(Image.open(path).get_flattened_data()).items()))
                for path in self.files if path.suffix == ".png"
            },
        }
        manifest = {
            "width": WIDTH, "height": HEIGHT, "pixelsPerSquare": 32,
            "pitch": {"x": PITCH[0], "y": PITCH[1], "width": turf.width, "height": turf.height},
            "sourceSha256": SOURCE_HASH, "layers": self.layers, "verification": stats,
        }
        payload = json.dumps(manifest, indent=2) + "\n"
        (self.output / "manifest.json").write_text(payload, encoding="utf-8", newline="\n")
        total = sum(path.stat().st_size for path in self.files)
        print(f"Native reconstruction: {changed} changed pixels. {len(self.files)} images: {total:,} bytes.")
        print(f"Visitor changes (home / away): {visitor_pixels}")


def differences(source, result, outside=None):
    delta = ImageChops.difference(source, result)
    red, green, blue = delta.split()
    values = ImageChops.lighter(ImageChops.lighter(red, green), blue)
    if outside:
        values.paste(0, outside)
    return source.width * source.height - values.histogram()[0]


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=ROOT)
    parser.add_argument("--previews", type=Path)
    args = parser.parse_args()
    Cut(args.output).run(args.previews)
