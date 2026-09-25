import { Application, Container, Graphics, Sprite, Text, Texture } from 'pixi.js';

import { PARITY_GEOMETRY, PARITY_PLAYERS, interpolatedSquare, parityPreview, paritySpriteUrl, squareAt } from './pitch-parity-model';
import type { ParityPlayer, ParitySquare, ParityState } from './pitch-parity-model';

type PlayerView = { container: Container; sprite: Sprite | null };
const pitchUrl = `${import.meta.env.BASE_URL}preview/parity-pitch.svg`;

/** Local M5 experiment only. Receives presentation state and emits square intents. */
export class ParityPixiBoard {
  private app: Application | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private abort = new AbortController();
  private textures = new Map<string, Texture>();
  private players = new Map<string, PlayerView>();
  private overlay = new Graphics();
  private pathLabels = new Container();
  private selection = new Graphics();
  private playerLayer = new Container();
  private ball = new Graphics();
  private destroyed = false;
  private contextLost: ((event: Event) => void) | null = null;
  private assetIssues: string[] = [];

  get assetMessage() { return this.assetIssues.join(' '); }

  async mount(host: HTMLElement, onSquare: (square: ParitySquare) => void, onHover: (square: ParitySquare | null) => void, onFailure: () => void, fault: string | null) {
    if (fault === 'init') throw new Error('Simulated WebGL initialization failure');
    const app = new Application();
    this.app = app;
    try {
      await app.init({ width: PARITY_GEOMETRY.width, height: PARITY_GEOMETRY.height, preference: ['webgl'],
        backgroundAlpha: 0, resolution: Math.min(window.devicePixelRatio || 1, 2), autoDensity: true, antialias: false });
      if (this.destroyed) return;
      app.ticker.stop();
      this.canvas = app.canvas;
      this.canvas.setAttribute('aria-label', 'Pixi parity pitch; use the labeled fallback grid if graphics fail');
      this.contextLost = event => { event.preventDefault(); onFailure(); };
      this.canvas.addEventListener('webglcontextlost', this.contextLost, { once: true });
      this.canvas.addEventListener('click', event => {
        const square = this.squareForPointer(event);
        if (square) onSquare(square);
      });
      this.canvas.addEventListener('pointermove', event => onHover(this.squareForPointer(event)));
      this.canvas.addEventListener('pointerleave', () => onHover(null));
      host.appendChild(this.canvas);

      const pitchTexture = await this.loadTexture(pitchUrl);
      if (this.destroyed) return;
      if (pitchTexture) {
        const background = new Sprite(pitchTexture);
        background.width = PARITY_GEOMETRY.width;
        background.height = PARITY_GEOMETRY.height;
        app.stage.addChild(background);
      } else {
        this.assetIssues.push('Pitch texture failed; using a labeled plain-field fallback.');
        const plain = new Graphics().rect(0, 0, 960, 564).fill(0x202b20).rect(12, 12, 936, 540).fill(0x56632b);
        for (let x = 0; x <= 26; x++) plain.moveTo(12 + x * 36, 12).lineTo(12 + x * 36, 552).stroke({ color: 0xd4cd99, alpha: .35, width: 1 });
        for (let y = 0; y <= 15; y++) plain.moveTo(12, 12 + y * 36).lineTo(948, 12 + y * 36).stroke({ color: 0xd4cd99, alpha: .35, width: 1 });
        app.stage.addChild(plain);
      }
      app.stage.addChild(this.overlay, this.pathLabels, this.selection, this.ball, this.playerLayer);
      this.playerLayer.sortableChildren = true;
      const spriteUrls = [...new Set(PARITY_PLAYERS.map(paritySpriteUrl))];
      await Promise.all(spriteUrls.map(async url => {
        const texture = await this.loadTexture(fault === 'sprite' && url === paritySpriteUrl(PARITY_PLAYERS[0]) ? `${import.meta.env.BASE_URL}preview/parity-missing-sprite.png` : url);
        if (texture && !this.destroyed) {
          texture.source.scaleMode = 'nearest';
          this.textures.set(url, texture);
        } else if (!this.destroyed) this.assetIssues.push(`Sprite unavailable: ${url.split('/').pop()}; using labeled token.`);
      }));
      if (this.destroyed) return;
      for (const player of PARITY_PLAYERS) this.addPlayer(player);
    } catch (error) {
      this.destroy();
      throw error;
    }
  }

  private async loadTexture(url: string): Promise<Texture | null> {
    try {
      const response = await fetch(url, { signal: this.abort.signal });
      if (!response.ok || !response.headers.get('content-type')?.startsWith('image/')) throw new Error(`Asset ${response.status}`);
      const objectUrl = URL.createObjectURL(await response.blob());
      const image = new Image();
      try { image.src = objectUrl; await image.decode(); }
      finally { URL.revokeObjectURL(objectUrl); }
      if (this.destroyed) return null;
      return Texture.from(image);
    } catch { return null; }
  }

  private addPlayer(player: ParityPlayer) {
    const container = new Container();
    const texture = this.textures.get(paritySpriteUrl(player));
    let sprite: Sprite | null = null;
    const teamColor = player.team === 'home' ? 0x77a6d7 : 0xdf9850;
    const base = new Graphics();
    if (player.team === 'home') base.moveTo(2, 35).lineTo(34, 35).stroke({ color: teamColor, width: 3 });
    else for (const x of [2, 12, 22]) base.moveTo(x, 35).lineTo(x + 6, 35).stroke({ color: teamColor, width: 3 });
    container.addChild(base);
    if (texture) {
      sprite = new Sprite(texture);
      sprite.anchor.set(.5, 1);
      sprite.position.set(18, 36);
      sprite.width = 36 * (player.large ? 80 : 64) / 56;
      // Source PNGs are square; the 64:56 (or 80:56) display scale extends above a cell.
      sprite.height = sprite.width;
      container.addChild(sprite);
    } else {
      container.addChild(new Graphics().circle(18, 18, 15).fill(teamColor).stroke({ color: 0x10191d, width: 2 }));
      const fallback = new Text({ text: player.team === 'home' ? 'H' : 'A', style: { fontFamily: 'sans-serif', fontSize: 14, fontWeight: 'bold', fill: 0x10191d } });
      fallback.anchor.set(.5);
      fallback.position.set(18, 18);
      container.addChild(fallback);
    }
    const labelWidth = player.number > 9 ? 17 : 12;
    container.addChild(new Graphics().rect(38 - labelWidth, 26, labelWidth, 12).fill({ color: 0x10191d, alpha: .88 }));
    const number = new Text({ text: String(player.number), style: { fontFamily: 'sans-serif', fontSize: 10, fontWeight: 'bold', fill: 0xf4ecdb } });
    number.position.set(39 - labelWidth, 25);
    container.addChild(number);
    this.playerLayer.addChild(container);
    this.players.set(player.id, { container, sprite });
  }

  private squareForPointer(event: MouseEvent | PointerEvent): ParitySquare | null {
    if (!this.canvas) return null;
    const rect = this.canvas.getBoundingClientRect();
    const x = (event.clientX - rect.left) * PARITY_GEOMETRY.width / rect.width;
    const y = (event.clientY - rect.top) * PARITY_GEOMETRY.height / rect.height;
    return squareAt(Math.floor((x - 12) / 36), Math.floor((y - 12) / 36));
  }

  draw(state: ParityState) {
    if (!this.app || this.destroyed || this.players.size === 0) return;
    const preview = parityPreview(state);
    this.overlay.clear();
    this.pathLabels.removeChildren().forEach(child => child.destroy());
    this.selection.clear();
    this.ball.clear();
    const colors = { clear: 0x5eead4, dodge: 0xf59e0b, rush: 0xb699ff, both: 0xfb7185 };
    for (const route of preview.routes.values()) {
      const square = route.path[route.path.length - 1], color = colors[route.risk];
      this.overlay.rect(13 + square.x * 36, 13 + square.y * 36, 34, 34).fill({ color, alpha: route.risk === 'clear' ? .17 : .38 }).stroke({ color, alpha: .35, width: 1 });
    }
    const path = state.phase === 'moving' ? state.motionPath : preview.route?.path ?? [];
    if (path.length > 1) {
      for (const [index, square] of path.entries()) {
        if (index === 0) this.overlay.moveTo(30 + square.x * 36, 30 + square.y * 36);
        else this.overlay.lineTo(30 + square.x * 36, 30 + square.y * 36);
      }
      this.overlay.stroke({ color: 0x102532, width: 7 });
      for (const [index, square] of path.entries()) {
        if (index === 0) this.overlay.moveTo(30 + square.x * 36, 30 + square.y * 36);
        else this.overlay.lineTo(30 + square.x * 36, 30 + square.y * 36);
      }
      this.overlay.stroke({ color: 0xfff3b0, width: 3 });
      for (const [index, square] of path.slice(1).entries()) {
        this.overlay.circle(30 + square.x * 36, 30 + square.y * 36, 6).fill(0x102532).stroke({ color: 0xfff3b0, width: 1 });
        const label = new Text({ text: String(index + 1), style: { fontFamily: 'sans-serif', fontSize: 10, fill: 0xfff3b0 } });
        label.anchor.set(.5);
        label.position.set(30 + square.x * 36, 30 + square.y * 36);
        this.pathLabels.addChild(label);
      }
    }
    if (preview.pointed) this.overlay.rect(14 + preview.pointed.x * 36, 14 + preview.pointed.y * 36, 32, 32).stroke({ color: 0xfff3b0, width: 3 });
    if (preview.selected) this.selection.rect(12 + preview.selected.x * 36, 12 + preview.selected.y * 36, 36, 36).stroke({ color: 0xf4e9bb, width: 3 });
    for (const player of PARITY_PLAYERS) {
      const view = this.players.get(player.id)!;
      view.container.visible = state.crowded || PARITY_PLAYERS.indexOf(player) < 6;
      if (!view.container.visible) continue;
      const actual = preview.players.find(candidate => candidate.id === player.id)!;
      const visual = interpolatedSquare(state, actual);
      view.container.position.set(12 + visual.x * 36, 12 + visual.y * 36);
      view.container.zIndex = 10 + Math.floor(visual.y) * 26 + Math.floor(visual.x);
      if (view.sprite) {
        view.sprite.rotation = state.proneId === player.id ? 75 * Math.PI / 180 : 0;
        view.sprite.alpha = state.proneId === player.id ? .8 : 1;
      }
    }
    const carrier = preview.players.find(player => player.id === 'home-1');
    if (carrier) {
      const visual = interpolatedSquare(state, carrier);
      this.ball.circle(38 + visual.x * 36, 36 + visual.y * 36, 5).fill(0xdb9362).stroke({ color: 0xffffff, width: 1 });
    }
    this.app.render();
  }

  simulateContextLoss() {
    if (!this.canvas) return;
    const gl = this.canvas.getContext('webgl2');
    const extension = gl?.getExtension('WEBGL_lose_context');
    if (extension) extension.loseContext();
    else this.canvas.dispatchEvent(new Event('webglcontextlost', { cancelable: true }));
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.abort.abort();
    if (this.canvas && this.contextLost) this.canvas.removeEventListener('webglcontextlost', this.contextLost);
    this.canvas = null;
    this.contextLost = null;
    const app = this.app;
    this.app = null;
    if (app?.renderer) app.destroy(true, { children: true });
    for (const texture of this.textures.values()) texture.destroy(true);
    this.textures.clear();
    this.players.clear();
  }
}
