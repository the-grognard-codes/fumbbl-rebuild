/** Choose a fixed neutral edge with WCAG contrast against any saved kit colour. */
export function splashOutline(hex: string): string {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) return '#edf5ff';
  const channels = [1, 3, 5].map(offset => parseInt(hex.slice(offset, offset + 2), 16) / 255)
    .map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
  const luminance = channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722;
  return luminance > .179 ? '#000000' : '#ffffff';
}
