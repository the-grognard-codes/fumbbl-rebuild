"""Draw an upright, native-scale sideline from indexed pixel artwork."""

import argparse
from collections import Counter
from pathlib import Path
from random import Random

from PIL import Image, ImageDraw


SIZE = (112, 416)
COLORS = {
    "outline": "#291e1d",
    "deep": "#392b26",
    "earth": "#4f3b2f",
    "dust": "#8f7454",
    "path": "#9c805e",
    "path light": "#a78b67",
    "path pale": "#af916e",
    "grass dark": "#444d2c",
    "grass": "#565c35",
    "grass light": "#69703a",
    "mortar": "#584d40",
    "stone shade": "#776953",
    "stone": "#918164",
    "stone warm": "#9c8668",
    "stone light": "#b1a083",
    "stone rim": "#c1af90",
    "wood deep": "#483024",
    "wood shade": "#5d3a28",
    "wood": "#815332",
    "wood light": "#a57143",
    "wood rim": "#c7975d",
    "iron": "#474849",
    "iron light": "#747571",
    "thread deep": "#392a32",
    "thread": "#74434c",
    "thread light": "#965862",
    "brass deep": "#83603c",
    "brass": "#bc8b4b",
    "brass light": "#dfb36a",
    "flame deep": "#a2472e",
    "flame": "#df7337",
    "flame light": "#f6ac4e",
    "ivory": "#e3cf9b",
    "eye": "#fcdb99",
    "hair deep": "#3b2822",
    "hair": "#684230",
    "hair light": "#9d6845",
    "russet deep": "#502e24",
    "russet": "#914f32",
    "russet light": "#c87943",
    "silver deep": "#514846",
    "silver": "#877974",
    "silver light": "#b9a69a",
    "skin dark shade": "#6b4437",
    "skin dark": "#a2674e",
    "skin dark light": "#c38463",
    "skin tawny shade": "#9b623f",
    "skin tawny": "#cf8f60",
    "skin tawny light": "#e7ae78",
    "skin fair shade": "#ad7657",
    "skin fair": "#dba17b",
    "skin fair light": "#f3c195",
    "skin olive shade": "#596044",
    "skin olive": "#798059",
    "skin olive light": "#a6a879",
    "boot": "#4a342b",
    "primary 1": "#362a38",
    "primary 2": "#5c424f",
    "primary 3": "#835766",
    "primary 4": "#a57782",
    "secondary 1": "#554133",
    "secondary 2": "#836346",
    "secondary 3": "#af8d5a",
    "secondary 4": "#d2b987",
    "linen 1": "#4d4138",
    "linen 2": "#80715b",
    "linen 3": "#a39375",
    "linen 4": "#c6b797",
    "leather 1": "#50392d",
    "leather 2": "#725037",
    "leather 3": "#98724c",
    "leather 4": "#ba9464",
    "charcoal 1": "#343433",
    "charcoal 2": "#535654",
    "charcoal 3": "#6d716b",
    "charcoal 4": "#8b9084",
    "wool 1": "#424435",
    "wool 2": "#666851",
    "wool 3": "#85876b",
    "wool 4": "#a3a484",
}
INDEX = {name: i for i, name in enumerate(COLORS, start=1)}
MATERIALS = {
    INDEX[f"{ramp} {shade}"]: (slot, shade, 0, 255)
    for slot, ramp in enumerate(("primary", "secondary"), start=1)
    for shade in range(1, 5)
}

# The cloth digits are authored alongside skin and trim on the original pixel
# grid. 1–4 belong to the primary kit and 5–8 belong to the secondary kit.
FANS = (
    (
        "....oooo.....",
        "...o8886o....",
        "..o887776o...",
        "..o765555oo..",
        "..o#sLLLso...",
        "..o#SfefSo...",
        "...oSffsSo...",
        "....oSfSo....",
        "...oo566oo...",
        "..o3447773o..",
        "..o4437632o..",
        ".oS4435322So.",
        ".oLSo322oSfo.",
        "..oo22221oo..",
        "...o1oo1o....",
        "...ob..bo....",
        "....o..o.....",
    ),
    (
        "....ooooo....",
        "...o44443o...",
        "..o4433332o..",
        "..o4322221o..",
        ".o43sLLLs2o..",
        ".o33SfefS2o..",
        ".o32SfffS1o..",
        "..o3S%s%S1o..",
        "..ooSSSS11oo.",
        ".o334333778o.",
        ".o344333876o.",
        "oS244332665o.",
        "oLo2333222o..",
        ".ooo222211o..",
        "...o1o1o1o...",
        "...obo.obo...",
        "....o...o....",
    ),
    (
        "......oooo......",
        "....ooLffSo.....",
        "....oLLffSSo....",
        "....oLfefSSo....",
        "....oSfS%#o.....",
        ".....o%###o.....",
        ".....oS##o......",
        "....oo655ooo....",
        "...o47753332o...",
        "..o443353432o...",
        "ooS34433222Soo..",
        "oLL3433322SoSLo.",
        ".oo2333221o.oo..",
        "...o22221o......",
        "....o1o1o.......",
        "....oboobo......",
        ".....o..o.......",
    ),
    (
        ".......oo.......",
        "....ooor#o......",
        "...o*rrr#oo.....",
        "..o*rr##r##o....",
        ".o##sLLLs##o....",
        ".o#sSfefS##o....",
        ".o#oSffsSob#o...",
        "..o#oS%So..oo...",
        "..o#o566o.......",
        "...o344533ooo...",
        "..o4435332oSLoo.",
        "..oS335322SLfSo.",
        "..oLSo3222o....",
        "...ooo2221o.....",
        "....o1oo1o......",
        "....obo.obo.....",
        ".....o...o......",
    ),
    (
        "..........ooo...",
        "....oooo.oKjKo..",
        "...o&&##ooBjBo..",
        "..o&&&&##oBBBo..",
        "..o&#sLLSoSooo..",
        "..o#sLfefSLo....",
        ".o#osSfffSo2o...",
        ".o#ooS%So433o...",
        "..oo47754433o...",
        "...o44353432o...",
        "..oS44353222o...",
        "..oLSo332221o...",
        "...ooo22211o....",
        "....o1o1o1o.....",
        "....obo.obo.....",
        ".....o...o......",
    ),
    (
        "................",
        ".....oooo.......",
        "....o*rr#o......",
        "...o*rrr##o.....",
        ".oLo#sLLSoLo....",
        "..oSoSfefSo.....",
        "...oSffffSo.....",
        "....oS%SSo......",
        "...o488743o.....",
        "..o44876432o....",
        "..o44353232o....",
        "..oS433222Soo...",
        "..oLSo222oSLo...",
        "...ooo211oooo...",
        "....o1o1o.......",
        "....oboobo......",
        ".....o..o.......",
    ),
    (
        "................",
        "...oooooo.......",
        "..o788886oo.....",
        "..o77666555o....",
        ".oo5sLLS555oo...",
        "..o5SfefS5o.....",
        "..o5SfffS5o.....",
        "...oSo%oSo......",
        "...o56665o..ooo.",
        "..o344544ooSLo.",
        "..o4435433SLSo..",
        "..oS435323ooo...",
        "..oLLo22221o....",
        "...ooo22211o....",
        "....o1oo1o......",
        "....obo.obo.....",
        ".....o...o......",
    ),
)


class Study:
    def __init__(self):
        self.pixels = Image.new("P", SIZE)
        self.owners = Image.new("I", SIZE)
        self.ink = ImageDraw.Draw(self.pixels)
        self.owner_ink = ImageDraw.Draw(self.owners)
        self.random = Random(572)
        self.fans = {}
        self.bays = []
        self.prop = False

    def rect(self, x, y, width, height, color):
        bounds = (x, y, x + width - 1, y + height - 1)
        self.ink.rectangle(bounds, INDEX[color])
        self.owner_ink.rectangle(bounds, -1 if self.prop else 0)

    def point(self, x, y, color, owner=0):
        self.ink.point((x, y), INDEX[color])
        self.owner_ink.point((x, y), -1 if self.prop else owner)

    def terrain(self):
        self.rect(3, 0, 60, 416, "deep")
        self.rect(61, 0, 51, 416, "earth")
        self.rect(65, 0, 43, 416, "dust")
        self.rect(69, 0, 36, 416, "path")
        self.rect(106, 0, 4, 416, "grass dark")
        self.rect(108, 0, 3, 416, "grass")
        for y in range(416):
            self.point(110 + (y // 7) % 2, y, "grass light")
        for _ in range(480):
            x = self.random.randrange(71, 105)
            y = self.random.randrange(416)
            shade = self.random.choice(("dust", "path light", "path light", "path pale"))
            self.rect(x, y, self.random.choice((1, 1, 2)), 1, shade)
        for y in (36, 120, 197, 297, 382):
            for x, dy in ((71, 0), (74, 5), (96, 4), (101, 12)):
                self.rect(x, y + dy, 4, 2, "dust")
                self.rect(x, y + dy, 3, 1, "path pale")
        self.rect(59, 0, 11, 416, "outline")
        self.rect(60, 0, 8, 416, "mortar")
        self.rect(61, 0, 6, 416, "stone shade")
        self.rect(62, 0, 4, 416, "stone light")
        for y in range(0, 416, 10):
            self.rect(61, y, 7, 1, "mortar")
            self.rect(62, y + 1, 4, 1, "stone rim")
            self.rect(65, y + 4, 2, 1, "stone")
            self.point(62, y + 7, "stone warm")

    def terrace(self, top, height):
        self.rect(4, top, 55, height, "mortar")
        for x in (5, 23, 41):
            self.rect(x + 1, top + 1, 15, height - 1, "stone shade")
            self.rect(x + 1, top + 1, 11, height - 2, "stone")
            self.rect(x, top, 3, height, "stone rim")
            self.rect(x + 1, top, 2, height, "stone light")
            self.rect(x + 15, top, 3, height, "wood deep")
            self.rect(x + 15, top, 1, height, "wood light")
            for y in range(top + 5 + (x % 3) * 2, top + height - 3, 11):
                self.rect(x + 3, y, 10, 1, "stone warm")
                self.rect(x + 3, y + 1, 6, 1, "stone light")
                self.point(x + 15, y, "wood rim")
        for y in (top, top + height - 4):
            self.rect(2, y + 2, 56, 3, "deep")
            self.rect(1, y, 60, 3, "wood")
            self.rect(2, y, 58, 1, "wood rim")
            for x in (1, 21, 40, 59):
                self.rect(x, y - 1, 4, 5, "wood deep")
                self.rect(x, y - 1, 3, 2, "wood light")
                self.point(x + 1, y, "iron")

    def stairs(self, y):
        for step in range(9):
            x = 3 + step * 6
            self.rect(x, y, 6, 14, "mortar")
            self.rect(x, y + 1, 5, 12, "stone shade" if step % 3 == 0 else "stone")
            self.rect(x + 1, y + 1, 1, 12, "stone light")
            self.rect(x + 2, y + 6 + step % 4, 3, 1, "stone warm")
        self.rect(0, y - 1, 58, 2, "wood deep")
        self.rect(1, y, 57, 1, "wood light")
        self.rect(1, y + 13, 58, 3, "wood shade")
        self.rect(1, y + 13, 58, 1, "wood rim")

    def buttress(self, y):
        self.rect(57, y, 17, 12, "outline")
        self.rect(58, y + 1, 15, 10, "mortar")
        self.rect(59, y + 1, 11, 9, "stone shade")
        self.rect(60, y + 1, 10, 4, "stone light")
        self.rect(61, y + 1, 8, 1, "stone rim")
        self.rect(59, y + 6, 12, 1, "stone")
        self.rect(60, y + 8, 11, 1, "stone")
        self.point(69, y + 8, "stone light")
        self.point(71, y + 3, "stone")

    def brazier(self, x, y):
        self.prop = True
        self.rect(x + 1, y + 9, 7, 4, "outline")
        self.rect(x + 2, y + 10, 5, 2, "brass deep")
        self.rect(x, y + 6, 9, 4, "outline")
        self.rect(x + 1, y + 6, 7, 3, "brass deep")
        self.rect(x + 1, y + 6, 7, 1, "brass")
        flames = (
            "....r....",
            "...rR.r..",
            "..rRRrRr.",
            "..rRyRRr.",
            ".rRRyyRr.",
            ".rRyiiyr.",
            "..rRyyR..",
        )
        tokens = {"r": "flame deep", "R": "flame", "y": "flame light", "i": "ivory"}
        for dy, row in enumerate(flames):
            for dx, token in enumerate(row):
                if token != ".":
                    self.point(x + dx, y + dy, tokens[token])
        for dx in (1, 4, 7):
            self.point(x + dx, y + 8, "brass light")
        self.prop = False

    def gate(self, y):
        self.rect(60, y, 13, 25, "outline")
        self.rect(62, y + 1, 10, 23, "mortar")
        self.rect(63, y + 5, 8, 15, "wood deep")
        self.rect(65, y + 6, 6, 13, "wood shade")
        for i in (7, 11, 15):
            self.rect(65, y + i, 6, 2, "wood")
            self.point(65, y + i, "wood light")
        self.rect(66, y + 5, 2, 15, "iron")
        for end in (y, y + 20):
            self.rect(58, end, 15, 5, "stone shade")
            self.rect(59, end, 12, 2, "stone light")
            self.rect(59, end, 4, 1, "stone rim")
            self.point(69, end + 3, "mortar")

    def standard(self, x, y):
        self.prop = True
        self.rect(x, y, 2, 24, "wood deep")
        self.rect(x, y, 1, 22, "wood rim")
        self.rect(x - 9, y + 2, 12, 2, "brass deep")
        self.rect(x - 9, y + 3, 9, 12, "thread deep")
        self.rect(x - 8, y + 4, 7, 11, "thread")
        self.rect(x - 8, y + 4, 1, 10, "thread light")
        self.rect(x - 7, y + 15, 5, 2, "thread")
        self.rect(x - 6, y + 17, 3, 1, "thread deep")
        # Three merlons and a gate cutout form the heraldic charge.
        self.rect(x - 7, y + 8, 5, 4, "brass light")
        for dx in (-7, -5, -3):
            self.point(x + dx, y + 7, "ivory")
        self.rect(x - 5, y + 10, 1, 2, "thread")
        self.point(x, y - 1, "brass light")
        self.prop = False

    def barrel(self, x, y):
        self.prop = True
        self.rect(x + 1, y, 7, 10, "outline")
        self.rect(x, y + 2, 9, 6, "outline")
        self.rect(x + 1, y + 2, 7, 6, "wood shade")
        self.rect(x + 2, y + 1, 5, 2, "wood light")
        self.rect(x + 3, y + 2, 3, 1, "wood rim")
        self.rect(x + 2, y + 3, 1, 5, "wood light")
        self.rect(x + 5, y + 3, 1, 5, "wood")
        for dy in (4, 7):
            self.rect(x + 1, y + dy, 7, 1, "iron")
            self.point(x + 2, y + dy, "iron light")
        self.prop = False

    def dugout(self, y):
        self.rect(73, y + 1, 29, 63, "deep")
        self.rect(74, y + 2, 27, 60, "wood shade")
        self.rect(78, y + 3, 22, 58, "wood")
        self.rect(87, y + 5, 12, 54, "wood light")
        self.rect(94, y + 4, 3, 56, "wood")
        for dy in range(6, 61, 7):
            self.rect(77, y + dy, 22, 1, "wood shade")
            self.rect(90, y + dy + 1, 8, 1, "wood rim")
        # Exposed seat, back wall, open front, and stone end posts.
        self.rect(78, y + 6, 8, 50, "wood deep")
        self.rect(79, y + 6, 5, 49, "wood light")
        self.rect(80, y + 6, 1, 49, "wood rim")
        for dy in (9, 30):
            self.rect(79, y + dy, 6, 1, "wood shade")
            self.point(80, y + dy + 1, "brass")
        self.rect(84, y + 5, 2, 51, "wood shade")
        self.rect(75, y, 2, 63, "stone light")
        self.rect(77, y, 1, 63, "stone shade")
        for dy in (0, 58):
            self.rect(75, y + dy, 26, 5, "mortar")
            self.rect(75, y + dy, 25, 2, "stone light")
            self.rect(77, y + dy, 21, 1, "stone rim")
            self.rect(96, y + dy - 1, 5, 6, "stone shade")
            self.rect(96, y + dy - 1, 4, 2, "stone light")
        self.barrel(90, y + 46)

    def fan(self, x, y, pose, complexion, hair, neutral, reverse):
        owner = len(self.fans) + 1
        self.fans[owner] = neutral
        skin = f"skin {complexion}"
        tokens = {
            "o": "outline", "b": "boot", "s": f"{skin} shade",
            "S": f"{skin} shade", "f": skin, "L": f"{skin} light",
            "e": "outline", "%": "hair deep", "#": f"{hair} deep",
            "r": hair, "*": f"{hair} light", "&": f"{hair} light",
            "K": "ivory", "j": "brass light", "B": "brass deep",
        }
        primary, secondary = neutral or ("primary", "secondary")
        for shade in range(1, 5):
            tokens[str(shade)] = f"{primary} {shade}"
            tokens[str(shade + 4)] = f"{secondary} {shade}"
        for dy, row in enumerate(FANS[pose]):
            pixels = row[::-1] if reverse else row
            for dx, token in enumerate(pixels):
                if token != ".":
                    self.point(x + dx, y + dy, tokens[token], owner)

    def spectators(self, top, bay):
        count = 0
        neutrals = 0
        complexions = ("tawny", "fair", "dark", "olive")
        hair = ("hair", "russet", "silver")
        neutral_ramps = (
            ("linen", "leather"), ("leather", "charcoal"),
            ("charcoal", "linen"), ("wool", "leather"),
        )
        for row in range(4):
            for column in range(3):
                pose = (bay * 3 + row * 2 + column * 4) % len(FANS)
                x = (6, 23, 42)[column] + (bay + row * 2 + column) % 3 - 1
                y = top + 3 + row * 19 + (bay * 2 + row + column * 3) % 8
                fixed_clothing = (row + bay) % 3 == column
                neutral = neutral_ramps[(bay + row) % len(neutral_ramps)] if fixed_clothing else None
                self.fan(x, y, pose, complexions[(row + bay + column) % len(complexions)],
                         hair[(row * 2 + bay + column) % len(hair)], neutral,
                         (row * 2 + column + bay) % 5 == 0)
                count += 1
                neutrals += fixed_clothing
        self.bays.append((count, neutrals))

    def draw(self):
        self.terrain()
        for top in (3, 110, 218, 325):
            self.terrace(top, 90)
        for y in (94, 201, 309):
            self.stairs(y)
            self.gate(y - 4)
        self.dugout(123)
        self.dugout(233)
        self.barrel(80, 99)
        self.barrel(78, 305)
        self.barrel(88, 308)
        for y in (49, 195, 297, 374):
            self.buttress(y)
        for y in (49, 195, 374):
            self.brazier(62, y - 3)
        for bay, top in enumerate((3, 110, 218, 325)):
            self.spectators(top, bay)
        self.standard(59, 186)
        self.standard(59, 296)
        self.standard(57, 66)

    def render(self, *, cutout=False):
        color_values = [(0, 0, 0, 0)]
        for color in COLORS.values():
            color_values.append(tuple(bytes.fromhex(color[1:])) + (255,))
        artwork_pixels = []
        material_pixels = []
        shade_counts = Counter()
        owner_counts = Counter()
        visible_fans = set()
        for index, owner in zip(self.pixels.get_flattened_data(), self.owners.get_flattened_data(), strict=True):
            if cutout and owner == 0:
                index = 0
            rgba = color_values[index]
            material = MATERIALS.get(index, (0, 0, 0, rgba[3]))
            if owner > 0:
                visible_fans.add(owner)
            if index in MATERIALS:
                assert owner > 0 and self.fans[owner] is None, "Tint outside team fan clothing"
                shade_counts[material[:2]] += 1
                owner_counts[owner] += 1
            artwork_pixels.append(rgba)
            material_pixels.append(material)
        assert len(self.bays) == 4 and all(neutral * 3 == count for count, neutral in self.bays)
        assert visible_fans == self.fans.keys()
        assert set(shade_counts) == {(slot, shade) for slot in (1, 2) for shade in range(1, 5)}
        assert owner_counts.keys() == {owner for owner, neutral in self.fans.items() if not neutral}
        assert (0, 0, 0, 0) in material_pixels and (0, 0, 0, 255) in material_pixels
        artwork, materials = (Image.new("RGBA", SIZE) for _ in range(2))
        artwork.putdata(artwork_pixels)
        materials.putdata(material_pixels)
        assert artwork.getchannel("A").tobytes() == materials.getchannel("A").tobytes()
        return artwork, materials, sum(shade_counts.values())


def draw_rear_context():
    """Draw the fixed concourse behind the study in the wider comparison crop."""
    rear = Image.new("RGBA", (160, SIZE[1]), COLORS["deep"])
    ink = ImageDraw.Draw(rear)

    def rect(x, y, width, height, color):
        ink.rectangle((x, y, x + width - 1, y + height - 1), COLORS[color])

    rect(0, 0, 160, 416, "deep")
    rect(17, 0, 74, 416, "mortar")
    rect(92, 0, 65, 416, "earth")
    rect(142, 0, 14, 416, "deep")
    for y in range(-8, 416, 8):
        for x in range(20 + (y // 8 % 2) * 8, 90, 16):
            rect(x, y, min(15, 90 - x), 7, "stone shade")
            rect(x, y, min(8, 90 - x), 1, "stone")
        for x in range(94 + (y // 8 % 2) * 9, 142, 18):
            rect(x, y, min(17, 142 - x), 7, "mortar")
            rect(x, y, min(11, 142 - x), 1, "stone shade")
    for x in (13, 86, 145):
        rect(x, 0, 7, 416, "outline")
        rect(x + 1, 0, 5, 416, "mortar")
        rect(x + 2, 0, 2, 416, "stone shade")
        for y in range(5 + x % 9, 416, 11):
            rect(x + 1, y, 5, 1, "deep")
            rect(x + 2, y + 1, 2, 1, "stone")
    for start, width, length in ((24, 42, 50), (131, 55, 46), (239, 48, 52), (344, 57, 47)):
        # Long timber covers sit over the farther edge of the concourse.
        rect(0, start + 2, width + 10, length + 4, "earth")
        rect(0, start, width + 5, length + 3, "outline")
        rect(0, start, width, length, "wood shade")
        rect(0, start, width, 2, "wood")
        for y in range(start + 4, start + length, 6):
            rect(0, y, width, 1, "wood deep")
            rect(1 + (y % 7), y + 1, width // 2, 1, "wood")
        rect(width - 4, start, 4, length, "wood deep")
        rect(width - 4, start, 1, length, "wood light")
        for y in (start + 3, start + length - 7):
            rect(width - 5, y, 10, 5, "wood deep")
            rect(width - 4, y, 7, 2, "wood")
            rect(width + 2, y + 1, 1, 1, "iron")
    for y in (94, 201, 309):
        for step in range(7):
            x = 80 + step * 10
            rect(x, y, 10, 14, "mortar")
            rect(x, y + 1, 8, 12, "stone shade")
            rect(x + 1, y + 1, 1, 12, "stone")
            rect(x + 3, y + 2 + step % 4, 4, 1, "stone warm")
        rect(80, y + 13, 78, 3, "wood deep")
        rect(81, y + 13, 76, 1, "wood")
        for x in (82, 105, 128, 151):
            rect(x, y + 11, 4, 6, "wood deep")
            rect(x, y + 11, 3, 2, "wood")
    return rear


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="Validate the checked-in PNGs")
    args = parser.parse_args()
    study = Study()
    study.draw()
    artwork, materials, tint_pixels = study.render()
    cutout, cutout_materials, cutout_tint_pixels = study.render(cutout=True)
    assert tint_pixels == cutout_tint_pixels
    images = {
        "mask-first-sideline": artwork,
        "mask-first-sideline.materials": materials,
        "mask-first-sideline.cutout": cutout,
        "mask-first-sideline.cutout.materials": cutout_materials,
        "mask-first-sideline.rear": draw_rear_context(),
    }
    for name, image in images.items():
        path = Path(__file__).with_name(f"{name}.png")
        if args.check:
            with Image.open(path) as saved:
                assert saved.mode == image.mode and saved.size == image.size, f"Wrong format for {name}"
                assert saved.tobytes() == image.tobytes(), f"Regenerate {name}"
        else:
            image.save(path)
    print(f"{SIZE[0]}×{SIZE[1]}, {len(study.fans)} fans, "
          f"{sum(neutral for _, neutral in study.bays)} fixed-clothing fans, "
          f"{tint_pixels} tint pixels across eight indices")


if __name__ == "__main__":
    main()
