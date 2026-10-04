export type PitchEnd = 'home' | 'away';
export type PitchProjectionMode = 'perspective' | 'top-down';
export type Point = { x: number; y: number };
export type ProjectedPoint = Point & { depth: number; pixelsPerSquare: number };
export type PitchCameraOptions = {
  width: number; height: number; end?: PitchEnd; mode?: PitchProjectionMode;
  focus?: number; transverseFocus?: number; zoom?: number;
};
export type PitchDirection = 'up' | 'down' | 'left' | 'right';
export type PitchViewportRect = { left: number; top: number; width: number; height: number };

export const PITCH_LENGTH = 26;
export const PITCH_WIDTH = 15;
const NEAR = 0.5;
const EPSILON = 1e-9;
const REFERENCE_WIDTH = 1672;
const REFERENCE_HEIGHT = 941;
// Preserve the approved reference's world-space height/lens calibration.
const REFERENCE_SLOPE = (836 - 551) / (9 * REFERENCE_HEIGHT);
const DISTANCE = (1 / Math.tan(55 * Math.PI / 180)) / REFERENCE_SLOPE;
const REFERENCE_SCALE = 551 / 9 + 445 * REFERENCE_SLOPE;
const finitePoint = (point: Point) => Number.isFinite(point.x) && Number.isFinite(point.y);
const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value));

/** Immutable local camera. It knows geometry, never players, legality or transport. */
export class PitchProjection {
  readonly width: number;
  readonly height: number;
  readonly end: PitchEnd;
  readonly mode: PitchProjectionMode;
  readonly focus: number;
  readonly transverseFocus: number;
  readonly zoom: number;
  readonly center: Readonly<Point>;
  readonly scale: number;
  readonly distance = DISTANCE;
  readonly elevation: number;
  private readonly sine: number;
  private readonly cosine: number;
  private readonly orientation: number;

  constructor(options: PitchCameraOptions) {
    if (![options.width, options.height].every(value => Number.isFinite(value) && value > 0))
      throw new RangeError('Pitch viewport dimensions must be positive and finite');
    const focus = options.focus ?? 13, transverse = options.transverseFocus ?? 7.5, zoom = options.zoom ?? 1;
    if (![focus, transverse, zoom].every(Number.isFinite) || zoom < 0.5 || zoom > 3)
      throw new RangeError('Pitch camera values must be finite and zoom must be between 0.5 and 3');
    this.end = options.end ?? 'home';
    this.mode = options.mode ?? 'perspective';
    if (!['home', 'away'].includes(this.end) || !['perspective', 'top-down'].includes(this.mode))
      throw new RangeError('Unknown pitch orientation or projection');
    this.width = options.width; this.height = options.height;
    this.focus = clamp(focus, 0, PITCH_LENGTH);
    this.transverseFocus = clamp(transverse, 0, PITCH_WIDTH);
    this.zoom = zoom;
    this.orientation = this.end === 'away' ? -1 : 1;
    this.elevation = this.mode === 'perspective' ? 40 : 90;
    this.sine = Math.sin(this.elevation * Math.PI / 180);
    this.cosine = this.mode === 'top-down' ? 0 : Math.cos(this.elevation * Math.PI / 180);
    this.center = Object.freeze({ x: this.width / 2, y: this.height * 445 / REFERENCE_HEIGHT });
    const nearWidthFit = (this.width * (1 - 250 / REFERENCE_WIDTH)) / PITCH_WIDTH
      - (this.height - this.center.y) * this.cosine / this.sine / DISTANCE;
    const baseScale = this.mode === 'perspective'
      ? Math.min(REFERENCE_SCALE * this.height / REFERENCE_HEIGHT, nearWidthFit)
      : Math.min(this.width * (1 - 460 / REFERENCE_WIDTH) / PITCH_WIDTH,
        this.height * 320 / REFERENCE_HEIGHT / 4.58);
    // Extremely tall/narrow surfaces use the operable detail/text fallback. Never
    // create a zero/negative lens while preparing that layout.
    this.scale = Math.max(1, baseScale) * zoom;
  }

  with(options: Partial<PitchCameraOptions>): PitchProjection {
    return new PitchProjection({ width: this.width, height: this.height, end: this.end, mode: this.mode,
      focus: this.focus, transverseFocus: this.transverseFocus, zoom: this.zoom, ...options });
  }

  private depth(point: Point): number {
    return DISTANCE + (point.x - this.focus) * this.orientation * this.cosine;
  }

  project(point: Point): ProjectedPoint | null {
    if (!finitePoint(point)) return null;
    const depth = this.depth(point);
    if (depth < NEAR - EPSILON) return null;
    const factor = this.mode === 'perspective' ? DISTANCE / Math.max(NEAR, depth) : 1;
    const result = { x: this.center.x + (point.y - this.transverseFocus) * this.orientation * this.scale * factor,
      y: this.center.y - (point.x - this.focus) * this.orientation * this.sine * this.scale * factor,
      depth, pixelsPerSquare: this.scale * factor };
    return finitePoint(result) && Number.isFinite(result.depth) && Number.isFinite(result.pixelsPerSquare) ? result : null;
  }

  /** Inverts the ground plane, including outside the viewport for geometry/reveal. */
  unproject(point: Point): Point | null {
    if (!finitePoint(point)) return null;
    const vertical = (this.center.y - point.y) / this.scale;
    const divisor = this.sine * DISTANCE - vertical * this.cosine;
    if (divisor <= EPSILON) return null;
    const along = this.mode === 'perspective' ? vertical * DISTANCE / divisor : vertical;
    const depth = DISTANCE + along * this.cosine;
    if (depth < NEAR - EPSILON) return null;
    const factor = this.mode === 'perspective' ? DISTANCE / depth : 1;
    const result = { x: this.focus + along * this.orientation,
      y: this.transverseFocus + (point.x - this.center.x) / this.scale / factor * this.orientation };
    return finitePoint(result) ? result : null;
  }

  cellAt(point: Point): Point | null {
    if (point.x < 0 || point.y < 0 || point.x > this.width || point.y > this.height) return null;
    const unsnapped = this.unproject(point);
    const snap = (value: number) => Math.abs(value - Math.round(value)) < EPSILON ? Math.round(value) : value;
    const world = unsnapped ? { x: snap(unsnapped.x), y: snap(unsnapped.y) } : null;
    if (!world || world.x < 0 || world.y < 0 || world.x >= PITCH_LENGTH || world.y >= PITCH_WIDTH) return null;
    return { x: Math.floor(world.x), y: Math.floor(world.y) };
  }

  /** Converts CSS client coordinates even when the SVG is scaled or page-offset. */
  fromClient(point: Point, bounds: PitchViewportRect): Point | null {
    if (!finitePoint(point) || ![bounds.left, bounds.top, bounds.width, bounds.height].every(Number.isFinite)
      || bounds.width <= 0 || bounds.height <= 0) return null;
    const result = { x: (point.x - bounds.left) * this.width / bounds.width,
      y: (point.y - bounds.top) * this.height / bounds.height };
    return finitePoint(result) ? result : null;
  }

  square(point: Point, inset = 0, clipToViewport = false): Point[] {
    if (!Number.isInteger(point.x) || !Number.isInteger(point.y) || point.x < 0 || point.x >= PITCH_LENGTH
      || point.y < 0 || point.y >= PITCH_WIDTH || !Number.isFinite(inset) || inset < 0 || inset >= 0.5) return [];
    return this.polygon([{ x: point.x + inset, y: point.y + inset }, { x: point.x + 1 - inset, y: point.y + inset },
      { x: point.x + 1 - inset, y: point.y + 1 - inset }, { x: point.x + inset, y: point.y + 1 - inset }], clipToViewport);
  }

  /** Clips in world space before projection, so scenery never crosses the lens. */
  polygon(points: readonly Point[], clipToViewport = false): Point[] {
    if (points.length < 3 || !points.every(finitePoint)) return [];
    let world = [...points];
    if (this.mode === 'perspective') world = this.clip(world, point => this.depth(point) - NEAR);
    let projected: Point[] = world.map(point => this.project(point)).filter((point): point is ProjectedPoint => point !== null);
    if (clipToViewport) for (const distance of [(p: Point) => p.x, (p: Point) => this.width - p.x,
      (p: Point) => p.y, (p: Point) => this.height - p.y]) projected = this.clip(projected, distance);
    return projected;
  }

  private clip(points: Point[], distance: (point: Point) => number): Point[] {
    const result: Point[] = [];
    for (let index = 0; index < points.length; index++) {
      const start = points[index], end = points[(index + 1) % points.length];
      const a = distance(start), b = distance(end), startInside = a >= 0, endInside = b >= 0;
      if (startInside) result.push(start);
      if (startInside !== endInside) {
        const fraction = a / (a - b);
        result.push({ x: start.x + fraction * (end.x - start.x), y: start.y + fraction * (end.y - start.y) });
      }
    }
    return result;
  }

  visibleCells(): Point[] {
    const cells: Point[] = [];
    for (let x = 0; x < PITCH_LENGTH; x++) for (let y = 0; y < PITCH_WIDTH; y++)
      if (this.square({ x, y }, 0, true).length >= 3) cells.push({ x, y });
    return cells;
  }

  visibleBounds(): { minX: number; maxX: number; minY: number; maxY: number } | null {
    const cells = this.visibleCells();
    return cells.length ? { minX: Math.min(...cells.map(p => p.x)), maxX: Math.max(...cells.map(p => p.x)),
      minY: Math.min(...cells.map(p => p.y)), maxY: Math.max(...cells.map(p => p.y)) } : null;
  }

  isVisible(point: Point, padding = 0): boolean {
    const p = this.project(point);
    return !!p && p.x >= padding && p.x <= this.width - padding && p.y >= padding && p.y <= this.height - padding;
  }

  neighbor(square: Point, direction: PitchDirection): Point {
    const x = square.x + (direction === 'up' ? this.orientation : direction === 'down' ? -this.orientation : 0);
    const y = square.y + (direction === 'right' ? this.orientation : direction === 'left' ? -this.orientation : 0);
    return { x: clamp(x, 0, PITCH_LENGTH - 1), y: clamp(y, 0, PITCH_WIDTH - 1) };
  }

  /** Positive travel goes toward the opponent's end, independent of coach end. */
  travel(squares: number): PitchProjection {
    return this.with({ focus: this.focus + squares * this.orientation });
  }

  panPixels(delta: Point): PitchProjection {
    const moved = this.unproject({ x: this.center.x + delta.x, y: this.center.y + delta.y });
    if (!moved) return this;
    return this.with({ focus: this.focus - (moved.x - this.focus),
      transverseFocus: this.zoom > 1 ? this.transverseFocus - (moved.y - this.transverseFocus) : this.transverseFocus });
  }

  /** Centers an offscreen target without changing its canonical identity. */
  reveal(point: Point, padding = 24): PitchProjection {
    if (this.isVisible(point, padding)) return this;
    let camera = this.with({ focus: point.x });
    if (!camera.isVisible(point, padding)) camera = camera.with({ transverseFocus: point.y });
    return camera;
  }

  get vanishingPoint(): Point | null {
    return this.mode === 'perspective'
      ? { x: this.center.x, y: this.center.y - this.scale * DISTANCE * this.sine / this.cosine } : null;
  }
}
