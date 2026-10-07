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
  }
} as const;
export const stadiumVenues: Readonly<Record<string, keyof typeof stadiumAtlases>> = {
  "Old World Classic": "old-world-classic"
};
export const stadiumTeams: Readonly<Record<string, keyof typeof stadiumAtlases>> = {
  "human": "old-world-classic"
};
