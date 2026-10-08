export type PitchEnd = 'home' | 'away';
export type PitchProjectionMode = 'perspective' | 'top-down';
export type PerspectiveElevation = 30 | 40 | 50;
export type Point = { x: number; y: number };
export type WorldPoint = Point & { z: number };
export type ProjectedPoint = Point & { depth: number; pixelsPerSquare: number };
export type PitchCameraOptions = {
  width: number; height: number; end?: PitchEnd; mode?: PitchProjectionMode;
  focus?: number; transverseFocus?: number; zoom?: number; perspectiveElevation?: PerspectiveElevation;
};
export type PitchDirection = 'up' | 'down' | 'left' | 'right';
export type PitchViewportRect = { left: number; top: number; width: number; height: number };
export type PlaneMatrix = readonly (readonly number[])[];

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
  readonly perspectiveElevation: PerspectiveElevation;
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
    this.perspectiveElevation = options.perspectiveElevation ?? 40;
    if (![30, 40, 50].includes(this.perspectiveElevation))
      throw new RangeError('Perspective elevation must be 30, 40 or 50 degrees');
    this.elevation = this.mode === 'perspective' ? this.perspectiveElevation : 90;
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
      focus: this.focus, transverseFocus: this.transverseFocus, zoom: this.zoom,
      perspectiveElevation: this.perspectiveElevation, ...options });
  }

  private depth(point: Point): number {
    return DISTANCE + (point.x - this.focus) * this.orientation * this.cosine;
  }

  project(point: Point): ProjectedPoint | null {
    return this.projectRaised(point, 0);
  }

  /** Height in world squares; shared by scenery surfaces, risers and sprite anchors. */
  projectRaised(point: Point, rise: number): ProjectedPoint | null {
    if (!finitePoint(point) || !Number.isFinite(rise)) return null;
    const depth = this.depth(point) - rise * this.sine;
    if (depth < NEAR - EPSILON) return null;
    const factor = this.mode === 'perspective' ? DISTANCE / Math.max(NEAR, depth) : 1;
    const result = { x: this.center.x + (point.y - this.transverseFocus) * this.orientation * this.scale * factor,
      y: this.center.y - (point.x - this.focus) * this.orientation * this.sine * this.scale * factor - rise * this.cosine * this.scale * factor,
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

  /** Ground homography for painted scenery registered in canonical world space. */
  planeImageTransform(sourceToWorld: PlaneMatrix, rise = 0): string {
    if (!Number.isFinite(rise)) throw new RangeError('Scenery height must be finite');
    if (sourceToWorld.length !== 3 || sourceToWorld.some(row => row.length !== 3 || !row.every(Number.isFinite)))
      throw new RangeError('Scenery registration must be a finite 3 by 3 matrix');
    const o = this.orientation, s = this.scale, d = DISTANCE, cx = this.center.x, cy = this.center.y;
    const k = d - o * this.focus * this.cosine - rise * this.sine;
    const projection = this.mode === 'top-down'
      ? [[0, o * s, cx - o * s * this.transverseFocus], [-o * s, 0, cy + o * s * this.focus], [0, 0, 1]]
      : [[cx * o * this.cosine, o * s * d, cx * k - o * s * d * this.transverseFocus],
        [o * (cy * this.cosine - s * d * this.sine), 0, cy * k + o * s * d * this.sine * this.focus - rise * s * d * this.cosine],
        [o * this.cosine, 0, k]];
    const h = projection.map(row => [0, 1, 2].map(column => row.reduce((sum, value, index) => sum + value * sourceToWorld[index][column], 0)));
    const n = Math.abs(h[2][2]) || 1;
    return `matrix3d(${[h[0][0], h[1][0], 0, h[2][0], h[0][1], h[1][1], 0, h[2][1],
      0, 0, n, 0, h[0][2], h[1][2], 0, h[2][2]].map(value => value / n).join(',')})`;
  }

  /** Project a source rectangle on any affine world plane, including upright walls. */
  surfaceImage(width: number, height: number, origin: WorldPoint, across: WorldPoint, down: WorldPoint) {
    if (![width,height].every(value => Number.isFinite(value) && value > 0)
      || ![origin,across,down].every(p => [p.x,p.y,p.z].every(Number.isFinite)))
      throw new RangeError('Scenery surface must have finite world coordinates and positive source dimensions');
    const h=this.surfaceProjection(origin,across,down);
    const value=(row:number,p:Point)=>h[row][0]*p.x+h[row][1]*p.y+h[row][2];
    let visible=[{x:0,y:0},{x:width,y:0},{x:width,y:height},{x:0,y:height}];
    // Clip source pixels against the lens and viewport before CSS projection.
    const planes=[(p:Point)=>value(2,p)-(this.mode==='perspective'?NEAR:0),
      (p:Point)=>value(0,p),(p:Point)=>this.width*value(2,p)-value(0,p),
      (p:Point)=>value(1,p),(p:Point)=>this.height*value(2,p)-value(1,p)];
    for(const distance of planes) visible=this.clip(visible,distance);
    return this.croppedSurface(h,visible);
  }

  /** A painted jigsaw section registered on a ground or upright world plane. */
  registeredSurfaceImage(width: number, height: number, sourceToPlane: PlaneMatrix,
    origin: WorldPoint, across: WorldPoint, down: WorldPoint,
    bounds: {x0:number;y0:number;x1:number;y1:number}) {
    if (![width,height].every(v=>Number.isFinite(v)&&v>0)
      || sourceToPlane.length!==3 || sourceToPlane.some(r=>r.length!==3||!r.every(Number.isFinite))
      || ![origin,across,down].every(p=>[p.x,p.y,p.z].every(Number.isFinite))
      || ![bounds.x0,bounds.y0,bounds.x1,bounds.y1].every(Number.isFinite) || bounds.x1<=bounds.x0 || bounds.y1<=bounds.y0)
      throw new RangeError('Jigsaw registration needs a finite plane, positive dimensions and ordered bounds');
    const projection=this.surfaceProjection(origin,across,down);
    const h=projection.map(row=>[0,1,2].map(c=>row.reduce((sum,v,i)=>sum+v*sourceToPlane[i][c],0)));
    const value=(m:PlaneMatrix,row:number,p:Point)=>m[row][0]*p.x+m[row][1]*p.y+m[row][2];
    let visible=[{x:0,y:0},{x:width,y:0},{x:width,y:height},{x:0,y:height}];
    const planes=[
      (p:Point)=>value(sourceToPlane,2,p)-EPSILON,
      (p:Point)=>value(sourceToPlane,0,p)-bounds.x0*value(sourceToPlane,2,p),
      (p:Point)=>bounds.x1*value(sourceToPlane,2,p)-value(sourceToPlane,0,p),
      (p:Point)=>value(sourceToPlane,1,p)-bounds.y0*value(sourceToPlane,2,p),
      (p:Point)=>bounds.y1*value(sourceToPlane,2,p)-value(sourceToPlane,1,p),
      (p:Point)=>value(h,2,p)-(this.mode==='perspective'?NEAR:0)*value(sourceToPlane,2,p),
      (p:Point)=>value(h,0,p),(p:Point)=>this.width*value(h,2,p)-value(h,0,p),
      (p:Point)=>value(h,1,p),(p:Point)=>this.height*value(h,2,p)-value(h,1,p)];
    for(const distance of planes)visible=this.clip(visible,distance);
    return this.croppedSurface(h,visible);
  }
  /** The common world-plane lens used by affine and registered artwork. */
  private surfaceProjection(origin:WorldPoint,across:WorldPoint,down:WorldPoint) {
    const column = (p: WorldPoint, offset: boolean) => {
      const x=p.x-(offset?this.focus:0), y=p.y-(offset?this.transverseFocus:0);
      const depth=(offset?DISTANCE:0)+this.orientation*x*this.cosine-p.z*this.sine;
      return this.mode==='top-down'
        ? [this.orientation*this.scale*y+(offset?this.center.x:0),
          -this.orientation*this.scale*x+(offset?this.center.y:0),offset?1:0]
        : [this.center.x*depth+this.orientation*this.scale*DISTANCE*y,
          this.center.y*depth-this.orientation*this.scale*DISTANCE*this.sine*x-this.scale*DISTANCE*this.cosine*p.z,depth];
    };
    const columns=[column(across,false),column(down,false),column(origin,true)];
    return [0,1,2].map(row=>columns.map(col=>col[row]));
  }

  /** Crop before emitting CSS so both surface types share viewport behavior. */
  private croppedSurface(h:number[][],visible:Point[]) {
    if(visible.length<3)return null;
    const left=Math.min(...visible.map(p=>p.x)), top=Math.min(...visible.map(p=>p.y));
    const croppedWidth=Math.max(...visible.map(p=>p.x))-left, croppedHeight=Math.max(...visible.map(p=>p.y))-top;
    if(croppedWidth<EPSILON||croppedHeight<EPSILON)return null;
    for(const row of h)row[2]+=row[0]*left+row[1]*top;
    const n=Math.abs(h[2][2])||1;
    const transform=`matrix3d(${[h[0][0],h[1][0],0,h[2][0],h[0][1],h[1][1],0,h[2][1],
      0,0,n,0,h[0][2],h[1][2],0,h[2][2]].map(v=>v/n).join(',')})`;
    const clipPath='polygon('+visible.map(p=>(p.x-left)/croppedWidth*100+'% '+(p.y-top)/croppedHeight*100+'%').join(',')+')';
    return {left,top,width:croppedWidth,height:croppedHeight,transform,clipPath,sourcePolygon:visible};
  }

}
