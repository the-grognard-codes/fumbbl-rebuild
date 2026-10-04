type Kind = 'move' | 'block' | 'blitz' | 'other' | 'end' | 'confirm';

export function ActionGlyph({ kind }: { kind: Kind }) {
  const paths: Record<Kind, string> = {
    move: 'M16 2l-5 6h4v7H8v-4l-6 5 6 5v-4h7v7h-4l5 6 5-6h-4v-7h7v4l6-5-6-5v4h-7V8h4z',
    block: 'M16 3l11 4v9c0 6-5 10-11 14C10 26 5 22 5 16V7z',
    blitz: 'M18 1 6 18h9l-2 13 13-19h-9z',
    other: 'M5 5h4v4H5zM12 5h16v4H12zM5 14h4v4H5zM12 14h16v4H12zM5 23h4v4H5zM12 23h16v4H12z',
    end: 'M4 4v24l12-12zM17 4v24l12-12z',
    confirm: 'M3 16l8 8L29 6l-4-4-14 15-4-5z',
  };
  return <svg viewBox="0 0 32 32" aria-hidden="true" focusable="false"><path d={paths[kind]} fill="currentColor"/></svg>;
}
