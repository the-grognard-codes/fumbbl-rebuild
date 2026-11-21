const assets = import.meta.glob<string>('../../assets/game/pitch/stadiums/mockup/*.{png,gz}', {
  eager: true,
  import: 'default',
  query: '?url'
});

export function mockupAsset(file: string) {
  return assets[`../../assets/game/pitch/stadiums/mockup/${file}`];
}
