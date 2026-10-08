// Generated from canonical stadium catalog and PNG bounds. Run assets:sync.
export const stadiumAtlases = {
  "old-world-classic": {
    "id": "old-world-classic",
    "version": "v2",
    "atlas": "old-world-classic-v2.png",
    "palette": {
      "stone": "#73746b",
      "riser": "#403c34",
      "rail": "#b5a078",
      "cloth": "#3579b4"
    },
    "roles": [
      "stone",
      "timber",
      "gate",
      "gateTop",
      "crowd",
      "crowdSide",
      "crowdTop",
      "banner",
      "bench",
      "benchTop",
      "pavilion",
      "pavilionTop",
      "mugs",
      "torch",
      "torchTop",
      "pennant"
    ],
    "provenance": "source/human-provenance.json",
    "width": 1254,
    "height": 1254,
    "regions": {
      "stone": {
        "x": 86,
        "y": 89,
        "width": 153,
        "height": 153
      },
      "timber": {
        "x": 391,
        "y": 93,
        "width": 160,
        "height": 150
      },
      "gate": {
        "x": 697,
        "y": 106,
        "width": 171,
        "height": 133
      },
      "gateTop": {
        "x": 1016,
        "y": 120,
        "width": 155,
        "height": 123
      },
      "crowd": {
        "x": 50,
        "y": 404,
        "width": 215,
        "height": 163
      },
      "crowdSide": {
        "x": 373,
        "y": 406,
        "width": 204,
        "height": 161
      },
      "crowdTop": {
        "x": 678,
        "y": 443,
        "width": 215,
        "height": 100
      },
      "banner": {
        "x": 1037,
        "y": 376,
        "width": 120,
        "height": 185
      },
      "bench": {
        "x": 62,
        "y": 751,
        "width": 194,
        "height": 86
      },
      "benchTop": {
        "x": 382,
        "y": 745,
        "width": 180,
        "height": 88
      },
      "pavilion": {
        "x": 673,
        "y": 687,
        "width": 219,
        "height": 177
      },
      "pavilionTop": {
        "x": 1010,
        "y": 699,
        "width": 177,
        "height": 172
      },
      "mugs": {
        "x": 105,
        "y": 1029,
        "width": 131,
        "height": 130
      },
      "torch": {
        "x": 432,
        "y": 993,
        "width": 76,
        "height": 172
      },
      "torchTop": {
        "x": 732,
        "y": 1027,
        "width": 100,
        "height": 120
      },
      "pennant": {
        "x": 1021,
        "y": 1022,
        "width": 149,
        "height": 126
      }
    }
  },
  "badlands-brawl": {
    "id": "badlands-brawl",
    "version": "v2",
    "atlas": "badlands-brawl-v2.png",
    "palette": {
      "stone": "#514b42",
      "riser": "#292724",
      "rail": "#827a63",
      "cloth": "#c56c24"
    },
    "roles": [
      "stone",
      "timber",
      "gate",
      "gateTop",
      "crowd",
      "crowdSide",
      "crowdTop",
      "banner",
      "bench",
      "benchTop",
      "pavilion",
      "pavilionTop",
      "mugs",
      "torch",
      "torchTop",
      "pennant"
    ],
    "provenance": "source/orc-provenance.json",
    "width": 1254,
    "height": 1254,
    "regions": {
      "stone": {
        "x": 89,
        "y": 97,
        "width": 143,
        "height": 143
      },
      "timber": {
        "x": 401,
        "y": 97,
        "width": 140,
        "height": 142
      },
      "gate": {
        "x": 701,
        "y": 90,
        "width": 166,
        "height": 150
      },
      "gateTop": {
        "x": 1011,
        "y": 106,
        "width": 174,
        "height": 144
      },
      "crowd": {
        "x": 49,
        "y": 405,
        "width": 198,
        "height": 151
      },
      "crowdSide": {
        "x": 367,
        "y": 405,
        "width": 205,
        "height": 152
      },
      "crowdTop": {
        "x": 687,
        "y": 437,
        "width": 205,
        "height": 104
      },
      "banner": {
        "x": 1034,
        "y": 365,
        "width": 131,
        "height": 213
      },
      "bench": {
        "x": 60,
        "y": 744,
        "width": 194,
        "height": 94
      },
      "benchTop": {
        "x": 378,
        "y": 732,
        "width": 185,
        "height": 101
      },
      "pavilion": {
        "x": 682,
        "y": 686,
        "width": 204,
        "height": 164
      },
      "pavilionTop": {
        "x": 1009,
        "y": 685,
        "width": 177,
        "height": 190
      },
      "mugs": {
        "x": 96,
        "y": 1021,
        "width": 131,
        "height": 136
      },
      "torch": {
        "x": 429,
        "y": 979,
        "width": 86,
        "height": 192
      },
      "torchTop": {
        "x": 713,
        "y": 1020,
        "width": 138,
        "height": 140
      },
      "pennant": {
        "x": 1028,
        "y": 1011,
        "width": 140,
        "height": 145
      }
    }
  }
} as const;
export const stadiumRoleLayout = {
  "stone": {
    "worldWidth": 1,
    "view": "ground",
    "anchor": {
      "perspective": [
        0.5,
        1
      ],
      "overhead": [
        0.5,
        0.5
      ]
    },
    "footprint": {
      "along": 1,
      "across": 1
    },
    "layer": "structure",
    "rise": "0.3 per terrace row",
    "cutaway": "near-end",
    "motion": "static"
  },
  "timber": {
    "worldWidth": 1,
    "view": "ground",
    "anchor": {
      "perspective": [
        0.5,
        1
      ],
      "overhead": [
        0.5,
        0.5
      ]
    },
    "footprint": {
      "along": 1,
      "across": 1
    },
    "layer": "structure",
    "rise": "0.3 per terrace row",
    "cutaway": "near-end",
    "motion": "static"
  },
  "gate": {
    "worldWidth": 2.4,
    "view": "perspective",
    "anchor": {
      "perspective": [
        0.5,
        1
      ],
      "overhead": [
        0.5,
        0.5
      ]
    },
    "footprint": {
      "along": 2.4,
      "across": 0.6
    },
    "layer": "furnishings",
    "rise": "ground",
    "cutaway": "near-end",
    "motion": "static"
  },
  "gateTop": {
    "worldWidth": 2.4,
    "view": "overhead",
    "anchor": {
      "perspective": [
        0.5,
        1
      ],
      "overhead": [
        0.5,
        0.5
      ]
    },
    "footprint": {
      "along": 2.4,
      "across": 0.6
    },
    "layer": "furnishings",
    "rise": "ground",
    "cutaway": "near-end",
    "motion": "static"
  },
  "crowd": {
    "worldWidth": 1.35,
    "view": "perspective",
    "anchor": {
      "perspective": [
        0.5,
        1
      ],
      "overhead": [
        0.5,
        0.5
      ]
    },
    "footprint": {
      "along": 1.35,
      "across": 0.5
    },
    "layer": "supporters",
    "rise": "0.3 per terrace row",
    "cutaway": "near-end",
    "motion": "sparse-sway"
  },
  "crowdSide": {
    "worldWidth": 1.35,
    "view": "side",
    "anchor": {
      "perspective": [
        0.5,
        1
      ],
      "overhead": [
        0.5,
        0.5
      ]
    },
    "footprint": {
      "along": 1.35,
      "across": 0.5
    },
    "layer": "supporters",
    "rise": "0.3 per terrace row",
    "cutaway": "near-end",
    "motion": "sparse-sway"
  },
  "crowdTop": {
    "worldWidth": 1.35,
    "view": "overhead",
    "anchor": {
      "perspective": [
        0.5,
        1
      ],
      "overhead": [
        0.5,
        0.5
      ]
    },
    "footprint": {
      "along": 1.35,
      "across": 0.5
    },
    "layer": "supporters",
    "rise": "0.3 per terrace row",
    "cutaway": "near-end",
    "motion": "sparse-sway"
  },
  "banner": {
    "worldWidth": 0.55,
    "view": "perspective",
    "anchor": {
      "perspective": [
        0.5,
        1
      ],
      "overhead": [
        0.5,
        0.5
      ]
    },
    "footprint": {
      "along": 0.55,
      "across": 0.55
    },
    "layer": "furnishings",
    "rise": "ground",
    "cutaway": "none",
    "motion": "static"
  },
  "bench": {
    "worldWidth": 1.65,
    "view": "perspective",
    "anchor": {
      "perspective": [
        0.5,
        1
      ],
      "overhead": [
        0.5,
        0.5
      ]
    },
    "footprint": {
      "along": 1.65,
      "across": 0.8
    },
    "layer": "furnishings",
    "rise": "ground",
    "cutaway": "none",
    "motion": "static"
  },
  "benchTop": {
    "worldWidth": 1.65,
    "view": "overhead",
    "anchor": {
      "perspective": [
        0.5,
        1
      ],
      "overhead": [
        0.5,
        0.5
      ]
    },
    "footprint": {
      "along": 1.65,
      "across": 0.8
    },
    "layer": "furnishings",
    "rise": "ground",
    "cutaway": "none",
    "motion": "static"
  },
  "pavilion": {
    "worldWidth": 2.65,
    "view": "perspective",
    "anchor": {
      "perspective": [
        0.5,
        1
      ],
      "overhead": [
        0.5,
        0.5
      ]
    },
    "footprint": {
      "along": 2.65,
      "across": 2.65
    },
    "layer": "furnishings",
    "rise": "ground",
    "cutaway": "none",
    "motion": "static"
  },
  "pavilionTop": {
    "worldWidth": 2.65,
    "view": "overhead",
    "anchor": {
      "perspective": [
        0.5,
        1
      ],
      "overhead": [
        0.5,
        0.5
      ]
    },
    "footprint": {
      "along": 2.65,
      "across": 2.65
    },
    "layer": "furnishings",
    "rise": "ground",
    "cutaway": "none",
    "motion": "static"
  },
  "mugs": {
    "worldWidth": 0.45,
    "view": "perspective",
    "anchor": {
      "perspective": [
        0.5,
        1
      ],
      "overhead": [
        0.5,
        0.5
      ]
    },
    "footprint": {
      "along": 0.45,
      "across": 0.45
    },
    "layer": "furnishings",
    "rise": "ground",
    "cutaway": "none",
    "motion": "static"
  },
  "torch": {
    "worldWidth": 0.42,
    "view": "perspective",
    "anchor": {
      "perspective": [
        0.5,
        1
      ],
      "overhead": [
        0.5,
        0.5
      ]
    },
    "footprint": {
      "along": 0.42,
      "across": 0.42
    },
    "layer": "furnishings",
    "rise": "ground",
    "cutaway": "none",
    "motion": "fire-flicker"
  },
  "torchTop": {
    "worldWidth": 0.42,
    "view": "overhead",
    "anchor": {
      "perspective": [
        0.5,
        1
      ],
      "overhead": [
        0.5,
        0.5
      ]
    },
    "footprint": {
      "along": 0.42,
      "across": 0.42
    },
    "layer": "furnishings",
    "rise": "ground",
    "cutaway": "none",
    "motion": "fire-flicker"
  },
  "pennant": {
    "worldWidth": 0.55,
    "view": "perspective",
    "anchor": {
      "perspective": [
        0.5,
        1
      ],
      "overhead": [
        0.5,
        0.5
      ]
    },
    "footprint": {
      "along": 0.55,
      "across": 0.55
    },
    "layer": "furnishings",
    "rise": "ground",
    "cutaway": "none",
    "motion": "wind",
    "overheadComposition": "cloth-triangle-and-pole-dot"
  }
} as const;
export const stadiumVenues: Readonly<Record<string, keyof typeof stadiumAtlases>> = {
  "Old World Classic": "old-world-classic",
  "Badlands Brawl": "badlands-brawl"
};
export const stadiumTeams: Readonly<Record<string, keyof typeof stadiumAtlases>> = {
  "human": "old-world-classic",
  "orc": "badlands-brawl"
};
