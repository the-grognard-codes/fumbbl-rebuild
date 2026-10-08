// Generated from modular stadium originals and measured transparent regions. Run assets:sync.
export const stadiumModules = {
  "old-world-classic": {
    "id": "old-world-classic",
    "version": "v3",
    "atlas": "old-world-classic-v3.png",
    "palette": {
      "stone": "#73746b",
      "riser": "#403c34",
      "rail": "#b5a078",
      "cloth": "#3579b4"
    },
    "width": 1122,
    "height": 1402,
    "regions": {
      "stone": {
        "x": 42,
        "y": 86,
        "width": 177,
        "height": 183
      },
      "timber": {
        "x": 289,
        "y": 147,
        "width": 287,
        "height": 107
      },
      "gate": {
        "x": 630,
        "y": 111,
        "width": 214,
        "height": 160
      },
      "gateTop": {
        "x": 897,
        "y": 113,
        "width": 192,
        "height": 139
      },
      "crowd": {
        "x": 32,
        "y": 381,
        "width": 270,
        "height": 166
      },
      "crowdSide": {
        "x": 329,
        "y": 383,
        "width": 284,
        "height": 163
      },
      "crowdTop": {
        "x": 653,
        "y": 342,
        "width": 209,
        "height": 212
      },
      "banner": {
        "x": 929,
        "y": 334,
        "width": 156,
        "height": 223
      },
      "bench": {
        "x": 39,
        "y": 697,
        "width": 274,
        "height": 97
      },
      "benchTop": {
        "x": 344,
        "y": 688,
        "width": 223,
        "height": 88
      },
      "pavilion": {
        "x": 623,
        "y": 609,
        "width": 232,
        "height": 205
      },
      "pavilionTop": {
        "x": 909,
        "y": 617,
        "width": 173,
        "height": 189
      },
      "mugs": {
        "x": 72,
        "y": 946,
        "width": 186,
        "height": 138
      },
      "torch": {
        "x": 394,
        "y": 843,
        "width": 89,
        "height": 259
      },
      "torchTop": {
        "x": 675,
        "y": 925,
        "width": 91,
        "height": 143
      },
      "pennant": {
        "x": 910,
        "y": 869,
        "width": 170,
        "height": 212
      },
      "crowdBack": {
        "x": 25,
        "y": 1193,
        "width": 312,
        "height": 159
      },
      "crowdSideReverse": {
        "x": 358,
        "y": 1194,
        "width": 283,
        "height": 159
      },
      "fanRest": {
        "x": 678,
        "y": 1229,
        "width": 173,
        "height": 124
      },
      "fanCheer": {
        "x": 902,
        "y": 1187,
        "width": 191,
        "height": 166
      }
    }
  },
  "badlands-brawl": {
    "id": "badlands-brawl",
    "version": "v3",
    "atlas": "badlands-brawl-v3.png",
    "palette": {
      "stone": "#514b42",
      "riser": "#292724",
      "rail": "#827a63",
      "cloth": "#c56c24"
    },
    "width": 1122,
    "height": 1402,
    "regions": {
      "stone": {
        "x": 35,
        "y": 79,
        "width": 193,
        "height": 194
      },
      "timber": {
        "x": 275,
        "y": 116,
        "width": 301,
        "height": 146
      },
      "gate": {
        "x": 620,
        "y": 75,
        "width": 230,
        "height": 198
      },
      "gateTop": {
        "x": 892,
        "y": 92,
        "width": 213,
        "height": 181
      },
      "crowd": {
        "x": 28,
        "y": 378,
        "width": 285,
        "height": 184
      },
      "crowdSide": {
        "x": 334,
        "y": 385,
        "width": 284,
        "height": 177
      },
      "crowdTop": {
        "x": 650,
        "y": 358,
        "width": 214,
        "height": 211
      },
      "banner": {
        "x": 912,
        "y": 337,
        "width": 189,
        "height": 249
      },
      "bench": {
        "x": 27,
        "y": 717,
        "width": 301,
        "height": 111
      },
      "benchTop": {
        "x": 346,
        "y": 695,
        "width": 236,
        "height": 112
      },
      "pavilion": {
        "x": 612,
        "y": 619,
        "width": 254,
        "height": 220
      },
      "pavilionTop": {
        "x": 901,
        "y": 627,
        "width": 197,
        "height": 220
      },
      "mugs": {
        "x": 67,
        "y": 953,
        "width": 213,
        "height": 140
      },
      "torch": {
        "x": 395,
        "y": 857,
        "width": 109,
        "height": 253
      },
      "torchTop": {
        "x": 655,
        "y": 939,
        "width": 126,
        "height": 160
      },
      "pennant": {
        "x": 903,
        "y": 868,
        "width": 182,
        "height": 226
      },
      "crowdBack": {
        "x": 23,
        "y": 1178,
        "width": 297,
        "height": 179
      },
      "crowdSideReverse": {
        "x": 343,
        "y": 1180,
        "width": 272,
        "height": 177
      },
      "fanRest": {
        "x": 640,
        "y": 1221,
        "width": 218,
        "height": 136
      },
      "fanCheer": {
        "x": 888,
        "y": 1159,
        "width": 220,
        "height": 198
      }
    }
  }
} as const;
export const stadiumGeometry = {
  "pitch": {
    "length": 26,
    "width": 15
  },
  "apron": 2,
  "outer": {
    "x": [
      -6,
      32
    ],
    "y": [
      -6,
      21
    ]
  },
  "wallHeight": 1.1,
  "crowdRows": 4,
  "crowdRise": 0.8,
  "crowdRowRise": 0.2,
  "crowdHeight": 1,
  "crowdSpan": 2,
  "lockerRooms": [
    {
      "id": "home-locker",
      "side": "north",
      "team": "home",
      "x": 6,
      "y": -2,
      "span": 2.4
    },
    {
      "id": "away-locker",
      "side": "south",
      "team": "away",
      "x": 20,
      "y": 17,
      "span": 2.4
    }
  ],
  "benches": [
    {
      "side": "north",
      "team": "home",
      "x": 9,
      "y": -3.25,
      "along": 3,
      "across": 1.1
    },
    {
      "side": "south",
      "team": "away",
      "x": 17,
      "y": 18.25,
      "along": 3,
      "across": 1.1
    }
  ],
  "pavilion": {
    "side": "north",
    "x": 3,
    "y": -3.7,
    "along": 2.65,
    "across": 2.65
  },
  "partitions": [
    {
      "id": "north-midfield",
      "x": 13,
      "y0": -6,
      "y1": -2
    },
    {
      "id": "south-midfield",
      "x": 13,
      "y0": 17,
      "y1": 21
    }
  ]
} as const;
export const modularStadiumVenues: Readonly<Record<string, keyof typeof stadiumModules>> = {"Old World Classic":"old-world-classic","Badlands Brawl":"badlands-brawl"};
export const modularStadiumTeams: Readonly<Record<string, keyof typeof stadiumModules>> = {"human":"old-world-classic","orc":"badlands-brawl"};
