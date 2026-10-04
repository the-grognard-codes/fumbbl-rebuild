// Reference fixture only. x is length, y is width; both are zero-based square indices.
window.pitchReferenceScene = {
  width: 15, length: 26,
  endZones: [0, 25], midfieldBoundary: 13, wideZoneBoundaries: [4, 11],
  ball: { x: 12, y: 7 }, selected: 'home-3',
  players: [
    { id: 'home-1', team: 'home', number: 1, x: 11, y: 6 },
    { id: 'home-2', team: 'home', number: 2, x: 11, y: 7 },
    { id: 'home-3', team: 'home', number: 3, x: 9, y: 7, hero: true },
    { id: 'home-4', team: 'home', number: 4, x: 11, y: 8 },
    { id: 'home-5', team: 'home', number: 5, x: 10, y: 2 },
    { id: 'home-6', team: 'home', number: 6, x: 10, y: 4 },
    { id: 'home-7', team: 'home', number: 7, x: 10, y: 10 },
    { id: 'home-8', team: 'home', number: 8, x: 10, y: 12 },
    { id: 'home-9', team: 'home', number: 9, x: 9, y: 5 },
    { id: 'home-10', team: 'home', number: 10, x: 9, y: 9 },
    { id: 'home-11', team: 'home', number: 11, x: 9, y: 3 },
    { id: 'away-1', team: 'away', number: 1, x: 14, y: 6 },
    { id: 'away-2', team: 'away', number: 2, x: 14, y: 7 },
    { id: 'away-3', team: 'away', number: 3, x: 14, y: 8 },
    { id: 'away-4', team: 'away', number: 4, x: 15, y: 2 },
    { id: 'away-5', team: 'away', number: 5, x: 15, y: 4 },
    { id: 'away-6', team: 'away', number: 6, x: 15, y: 10 },
    { id: 'away-7', team: 'away', number: 7, x: 15, y: 12 },
    { id: 'away-8', team: 'away', number: 8, x: 16, y: 5 },
    { id: 'away-9', team: 'away', number: 9, x: 16, y: 9 },
    { id: 'away-10', team: 'away', number: 10, x: 16, y: 7 },
    { id: 'away-11', team: 'away', number: 11, x: 16, y: 11 }
  ],
  views: [
    { id: 'perspective-55-home', label: 'Default · home coach', elevation: 55, yaw: 0, perspective: true, end: 'home' },
    { id: 'perspective-55-away', label: 'Default · away coach', elevation: 55, yaw: 0, perspective: true, end: 'away' },
    { id: 'parallel-55-home', label: 'End-on parallel', elevation: 55, yaw: 0, perspective: false, end: 'home' },
    { id: 'perspective-45-home', label: 'Lower perspective', elevation: 45, yaw: 0, perspective: true, end: 'home' },
    { id: 'parallel-45-home', label: 'Lower parallel', elevation: 45, yaw: 0, perspective: false, end: 'home' },
    { id: 'perspective-65-home', label: 'Higher perspective', elevation: 65, yaw: 0, perspective: true, end: 'home' },
    { id: 'parallel-65-home', label: 'Higher parallel', elevation: 65, yaw: 0, perspective: false, end: 'home' },
    { id: 'yaw-left-perspective-home', label: 'Left yaw · perspective', elevation: 55, yaw: -15, perspective: true, end: 'home' },
    { id: 'yaw-left-parallel-home', label: 'Left yaw · parallel', elevation: 55, yaw: -15, perspective: false, end: 'home' },
    { id: 'yaw-right-perspective-home', label: 'Right yaw · perspective', elevation: 55, yaw: 15, perspective: true, end: 'home' },
    { id: 'yaw-right-parallel-home', label: 'Right yaw · parallel', elevation: 55, yaw: 15, perspective: false, end: 'home' },
    { id: 'isometric-home', label: 'Fixed classical isometric', elevation: Math.atan(1 / Math.sqrt(2)) * 180 / Math.PI, yaw: 45, perspective: false, end: 'home' }
  ]
};
