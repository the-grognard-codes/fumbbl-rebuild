"""Make the owner-review neutral crowd proof from the approved native Gatehouse still."""

from PIL import Image, ImageChops, ImageDraw, ImageFilter

from .cut import RED_CLOTH, VISITOR, home_cloth, visitor_cloth

# Each entry selects one person's hat and visible garment around a face centre.
# The cloth masks perform the final pixel selection inside these bounds.
# Format: face x/y, left/right reach, cap height, depth of visible clothing.
HOME = [
    (28,16,15,15,19,17), (110,18,15,13,20,20), (185,50,15,13,18,19),
    (233,30,15,13,17,21), (325,17,16,15,16,23), (376,62,15,15,18,20),
    (410,84,17,17,18,23), (443,44,15,14,15,19), (528,30,18,18,20,27),
    (569,79,14,17,17,20), (636,26,17,17,19,20), (672,74,16,13,16,24),
    (735,16,13,12,16,20), (808,41,17,17,22,25), (862,89,17,15,17,14),
    (890,19,19,16,17,22), (943,44,16,16,17,22), (991,73,15,18,18,22),
    (17,87,16,16,18,19), (82,69,18,15,16,25), (133,66,15,14,17,20),
    (49,127,17,16,18,23), (31,162,14,15,16,22), (94,199,16,15,16,25),
    (18,237,15,16,19,22), (91,248,14,13,18,19), (25,285,18,17,23,25),
    (62,297,13,12,15,22), (18,347,16,14,16,22), (65,392,14,14,17,23),
    (20,451,19,12,17,24), (996,118,15,18,17,26), (970,137,15,14,15,17),
    (56,550,16,16,17,23), (22,632,18,16,18,23), (35,707,18,15,16,23),
    (18,787,17,15,16,21), (37,950,20,15,18,23), (18,1018,18,14,17,22),
    (29,1085,20,12,19,25), (988,562,19,15,17,22), (1014,608,15,17,17,23),
    (973,683,16,16,17,22), (1004,749,17,19,17,22), (1006,929,14,18,18,21),
    (979,995,17,19,16,24), (995,1046,16,18,19,21), (1002,1087,17,21,18,24),
    (30,1327,17,16,16,22), (82,1372,19,18,18,24), (186,1382,18,18,20,25),
    (21,1417,17,15,18,20), (134,1393,15,16,16,20), (185,1460,18,19,22,32),
    (44,1490,20,18,18,25), (100,1500,20,17,18,26), (249,1488,18,18,20,26),
    (279,1426,18,15,15,21), (349,1453,19,20,18,24), (404,1518,17,20,16,23),
    (433,1453,20,17,17,24), (512,1460,17,16,17,23), (549,1516,18,18,20,24),
    (588,1444,17,18,17,22), (681,1431,18,19,16,25), (720,1489,18,15,17,25),
    (777,1393,17,16,17,23), (782,1479,18,20,17,22), (855,1370,16,20,17,23),
    (846,1491,18,18,16,24), (901,1449,19,16,18,24), (929,1347,19,16,17,25),
    (985,1376,17,20,18,23), (968,1446,18,19,18,22), (986,1491,18,18,17,24),
]
VISITING = [
    (965,177,15,15,16,20), (930,207,15,15,17,20), (913,240,13,16,15,25),
    (937,270,15,15,17,27), (956,348,15,16,20,29), (977,307,15,16,15,20),
    (966,383,16,17,17,25), (1002,425,17,16,16,27),
]

# Shadow and highlight pairs keep the painted fold shading in each garment.
RAMPS = [
    ((48,31,24),(165,123,82)), ((44,43,42),(151,146,134)),
    ((64,46,32),(193,157,111)), ((31,32,34),(116,119,121)),
]


def paint_people(result, source, allowed, people):
    selected = set()
    for i, (x, y, left, right, up, down) in enumerate(people):
        box = (max(0,x-left-6), max(0,y-up-4), min(source.width,x+right+7), min(source.height,y+down+9))
        garment = allowed.crop(box)
        outline = Image.new("L", garment.size)
        ImageDraw.Draw(outline).ellipse((4,2,outline.width-5,outline.height-3), fill=255)
        support = garment.point(lambda value: 255 if value else 0)
        selected_cloth = ImageChops.multiply(support, outline)
        for _ in range(4):
            selected_cloth = ImageChops.multiply(selected_cloth.filter(ImageFilter.MaxFilter(3)), support)
        garment = ImageChops.multiply(garment, selected_cloth)
        dark, light = RAMPS[i % len(RAMPS)]
        count = 0
        for j, shade in enumerate(garment.get_flattened_data()):
            if shade == 0:
                continue
            px = (box[0] + j % garment.width, box[1] + j // garment.width)
            if px in selected:
                continue
            selected.add(px)
            t = ((shade - 1) % 16) / 15
            result.putpixel(px, tuple(round(a + t*(b-a)) for a,b in zip(dark,light)))
            count += 1
        if count < 10:
            raise ValueError(f"Check garment at {(x,y)}: {count} pixels")
    return len(selected)


def neutral_crowd(source):
    result = source.copy()
    home = home_cloth(source)
    away = Image.new("L", source.size)
    away.paste(visitor_cloth(source), VISITOR[:2])
    for banner in RED_CLOTH[:2]:
        ImageDraw.Draw(away).polygon(banner, fill=0)
    for group, allowed, people in [("Home",home,HOME),("Visiting",away,VISITING)]:
        print(group, len(people), "garments,", paint_people(result,source,allowed,people), "pixels")
    return result
