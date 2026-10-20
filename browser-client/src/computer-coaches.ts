export type ComputerCoach = {
  key: string;
  id: string | null;
  name: string;
  difficulty: string;
  teamName: string | null;
  description: string;
  avatar: string;
};

// Protocol IDs select the server's pinned policy. Future profiles cannot create a match.
export const computerCoaches: readonly ComputerCoach[] = [{
  key: 'gobbo',
  id: 'coach-bugman-random',
  name: 'Gobbo “Wot Now?” Snotpick',
  difficulty: 'Horrible',
  teamName: "Bugman's Best",
  description: 'Calls plays by throwing a squig at the playbook.',
  avatar: '/assets/computer-coaches/gobbo-v1.png',
}, {
  key: 'bogruk', id: 'coach-bogruk-weak', name: 'Bogruk the Almost Clever', difficulty: 'Weak',
  teamName: "Bogruk's Almost Best",
  description: 'Loves a risky play, especially when there’s a perfectly good safe one.',
  avatar: '/assets/computer-coaches/bogruk-v1.png',
}, {
  key: 'grimbald', id: null, name: 'Coach Grimbald Ironwhistle', difficulty: 'Fair',
  teamName: null,
  description: 'Knows the fundamentals: protect the ball, hold the line, and foul with purpose.',
  avatar: '/assets/computer-coaches/grimbald-v1.png',
}, {
  key: 'morgath', id: null, name: 'Morgath Blackquill', difficulty: 'Good',
  teamName: null,
  description: 'Punishes sloppy positioning and makes you fight for every square.',
  avatar: '/assets/computer-coaches/morgath-v1.png',
}, {
  key: 'deep-bruise', id: null, name: 'Deep Bruise', difficulty: 'Expert',
  teamName: null,
  description: 'A legendary coaching contraption forged from the match records of the world’s finest—and most devious—Blood Bowl minds.',
  avatar: '/assets/computer-coaches/deep-bruise-v1.png',
}];
