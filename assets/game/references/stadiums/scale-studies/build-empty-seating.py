"""Compile the Gatehouse seating bays at game resolution. Zero is always off-limits."""
from pathlib import Path
from PIL import Image, ImageDraw

# Outlines traced in the 1024 by 1536 design frame. Each value identifies one bay.
NORTH = [
    [(76,36),(235,36),(235,128),(43,128),(43,102),(60,92),(60,65),(73,58)],
    [(316,36),(705,36),(705,128),(316,128)],
    [(787,36),(946,36),(951,67),(962,70),(965,94),(979,105),(979,128),(787,128)],
]
WEST = [
    [(27,170),(112,209),(112,489),(27,489)],
    [(28,562),(112,562),(112,684),(66,684),(58,667),(42,656),(28,659)],
    [(28,762),(112,762),(112,856),(28,856)],
    [(28,930),(112,930),(112,1297),(79,1332),(28,1347)],
]
EAST = [[(1023-x,y) for x,y in polygon] for polygon in WEST]
SOUTH = [
    [(92,1384),(232,1384),(232,1500),(60,1500),(55,1482),(36,1470),(36,1461),(60,1420)],
    [(316,1384),(416,1384),(416,1500),(316,1500)],
    [(602,1384),(706,1384),(706,1500),(602,1500)],
    [(794,1384),(932,1384),(965,1420),(987,1461),(982,1472),(958,1486),(956,1500),(794,1500)],
]

def native(points):
    return [(round(x*790/1024),round(y*1188/1536)) for x,y in points]

mask = Image.new("L",(790,1188))
draw = ImageDraw.Draw(mask)
for value, polygon in enumerate(NORTH + WEST + EAST + SOUTH, 1):
    draw.polygon(native(polygon),fill=value)
# North braziers project in front of the first row.
for x in (380,645):
    draw.polygon(native([(x-15,132),(x-15,114),(x-6,106),(x,89),(x+8,105),(x+14,112),(x+15,132)]),fill=0)
mask.save(Path(__file__).with_name("empty-seating.png"),optimize=True)
