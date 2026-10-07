// Generated from canonical stadium catalog and PNG bounds. Run assets:sync.
export const stadiumAtlases = {
  "old-world-classic": {
    "id": "old-world-classic",
    "version": "v1",
    "atlas": "old-world-classic-v1.png",
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
        "x": 43,
        "y": 40,
        "width": 262,
        "height": 262
      },
      "timber": {
        "x": 342,
        "y": 40,
        "width": 266,
        "height": 260
      },
      "gate": {
        "x": 641,
        "y": 64,
        "width": 280,
        "height": 232
      },
      "gateTop": {
        "x": 950,
        "y": 95,
        "width": 271,
        "height": 212
      },
      "crowd": {
        "x": 30,
        "y": 373,
        "width": 284,
        "height": 250
      },
      "crowdSide": {
        "x": 314,
        "y": 386,
        "width": 299,
        "height": 238
      },
      "crowdTop": {
        "x": 642,
        "y": 437,
        "width": 294,
        "height": 144
      },
      "banner": {
        "x": 997,
        "y": 344,
        "width": 179,
        "height": 280
      },
      "bench": {
        "x": 26,
        "y": 748,
        "width": 288,
        "height": 136
      },
      "benchTop": {
        "x": 314,
        "y": 737,
        "width": 296,
        "height": 131
      },
      "pavilion": {
        "x": 628,
        "y": 638,
        "width": 309,
        "height": 265
      },
      "pavilionTop": {
        "x": 970,
        "y": 658,
        "width": 246,
        "height": 261
      },
      "mugs": {
        "x": 97,
        "y": 986,
        "width": 183,
        "height": 208
      },
      "torch": {
        "x": 416,
        "y": 949,
        "width": 107,
        "height": 262
      },
      "torchTop": {
        "x": 706,
        "y": 997,
        "width": 153,
        "height": 188
      },
      "pennant": {
        "x": 981,
        "y": 1005,
        "width": 216,
        "height": 191
      }
    }
  },
  "badlands-brawl": {
    "id": "badlands-brawl",
    "version": "v1",
    "atlas": "badlands-brawl-v1.png",
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
        "x": 43,
        "y": 40,
        "width": 261,
        "height": 261
      },
      "timber": {
        "x": 339,
        "y": 40,
        "width": 270,
        "height": 261
      },
      "gate": {
        "x": 635,
        "y": 38,
        "width": 306,
        "height": 263
      },
      "gateTop": {
        "x": 941,
        "y": 79,
        "width": 295,
        "height": 235
      },
      "crowd": {
        "x": 26,
        "y": 383,
        "width": 288,
        "height": 244
      },
      "crowdSide": {
        "x": 314,
        "y": 387,
        "width": 307,
        "height": 240
      },
      "crowdTop": {
        "x": 639,
        "y": 456,
        "width": 302,
        "height": 154
      },
      "banner": {
        "x": 941,
        "y": 314,
        "width": 265,
        "height": 313
      },
      "bench": {
        "x": 21,
        "y": 627,
        "width": 293,
        "height": 266
      },
      "benchTop": {
        "x": 314,
        "y": 627,
        "width": 297,
        "height": 314
      },
      "pavilion": {
        "x": 629,
        "y": 634,
        "width": 312,
        "height": 273
      },
      "pavilionTop": {
        "x": 941,
        "y": 627,
        "width": 291,
        "height": 309
      },
      "mugs": {
        "x": 96,
        "y": 980,
        "width": 186,
        "height": 220
      },
      "torch": {
        "x": 412,
        "y": 941,
        "width": 119,
        "height": 276
      },
      "torchTop": {
        "x": 678,
        "y": 990,
        "width": 210,
        "height": 221
      },
      "pennant": {
        "x": 986,
        "y": 982,
        "width": 216,
        "height": 213
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
    "motion": "wind"
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
