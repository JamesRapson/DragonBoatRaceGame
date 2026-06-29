import { CONFIG } from '../shared/config';
import type { Boat, Entity, GameView } from '../shared/types';

const WATER_COLOR = '#185fa5';
const BANK_COLOR = '#3b6d11';
const GREENS = ['#2f5e0d', '#41760f', '#558f17', '#6aa823', '#7cbb2e'];
const TIDE_FLOW_PX_PER_S = 26; // how fast tide ripples drift in their direction

function rr(min: number, max: number): number { return min + Math.random() * (max - min); }

/** Draw a small "~" wavelet starting at (sx,sy) spanning `len`. */
function wavelet(c: CanvasRenderingContext2D, sx: number, sy: number, len: number): void {
  c.beginPath();
  c.moveTo(sx, sy);
  c.quadraticCurveTo(sx + len * 0.25, sy - len * 0.4, sx + len * 0.5, sy);
  c.quadraticCurveTo(sx + len * 0.75, sy + len * 0.4, sx + len, sy);
  c.stroke();
}

function makeTile(w: number, h: number, paint: (c: CanvasRenderingContext2D) => void): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const c = cv.getContext('2d')!;
  c.lineCap = 'round';
  paint(c);
  return cv;
}

const RIPPLE_SPEC: Array<[number, number, string]> = [
  [6, 14, 'rgba(255,255,255,0.28)'], [50, 10, 'rgba(255,255,255,0.18)'],
  [26, 32, 'rgba(255,255,255,0.25)'], [62, 38, 'rgba(255,255,255,0.16)'],
  [8, 46, 'rgba(255,255,255,0.22)'], [38, 50, 'rgba(0,0,0,0.10)'],
  [2, 26, 'rgba(0,0,0,0.10)'],
];

export class Renderer {
  private ctx: CanvasRenderingContext2D;
  private cssW = 0;
  private cssH = 0;
  private dpr = 1;

  // Layout (recomputed on resize)
  private waterLeft = 0;
  private waterW = 0;
  private bankW = 0;
  private pxX = 1;
  private pxY = 1;
  private midY = 0;
  private now = 0; // current sim-time, set each frame

  // Patterns
  private water: CanvasPattern;
  private tideFast: CanvasPattern;
  private tideSlow: CanvasPattern;
  private grass: CanvasPattern;
  private fringe: HTMLCanvasElement;
  private tileH = 56;
  private grassTileH = 60;

  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!;

    const waterTile = makeTile(80, 56, (c) => {
      for (const [x, y, col] of RIPPLE_SPEC) { c.strokeStyle = col; c.lineWidth = 2; wavelet(c, x, y, 12); }
    });
    const tideTile = (stroke: string, lw: number) => makeTile(80, 56, (c) => {
      c.strokeStyle = stroke; c.lineWidth = lw;
      for (const [x, y] of RIPPLE_SPEC) wavelet(c, x, y, 12);
    });
    const grassTile = makeTile(60, 60, (c) => {
      for (let i = 0; i < 28; i++) {
        const x = rr(3, 57), by = rr(22, 56);
        const len = rr(10, 22), tipy = Math.max(4, by - len);
        const tilt = rr(-6, 6);
        c.strokeStyle = GREENS[(Math.random() * GREENS.length) | 0];
        c.lineWidth = rr(1.2, 2.2);
        c.beginPath();
        c.moveTo(x, by);
        c.quadraticCurveTo(x + tilt * 0.4, (by + tipy) / 2, x + tilt, tipy);
        c.stroke();
      }
    });
    this.fringe = makeTile(34, 60, (c) => {
      c.fillStyle = '#356309';
      c.fillRect(0, 0, 12, 60);
      for (let i = 0; i < 11; i++) {
        const y = rr(4, 56), tip = rr(14, 32), hh = rr(3, 6);
        c.fillStyle = GREENS[(Math.random() * GREENS.length) | 0];
        c.beginPath();
        c.moveTo(9, y - hh); c.lineTo(tip, y); c.lineTo(9, y + hh); c.closePath();
        c.fill();
      }
    });

    this.water = this.ctx.createPattern(waterTile, 'repeat')!;
    this.tideFast = this.ctx.createPattern(tideTile('rgba(255,255,255,0.72)', 3.4), 'repeat')!;
    this.tideSlow = this.ctx.createPattern(tideTile('rgba(0,0,0,0.42)', 1.3), 'repeat')!;
    this.grass = this.ctx.createPattern(grassTile, 'repeat')!;
  }

  resize(): void {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.cssW = this.canvas.clientWidth;
    this.cssH = this.canvas.clientHeight;
    this.canvas.width = Math.round(this.cssW * this.dpr);
    this.canvas.height = Math.round(this.cssH * this.dpr);
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    this.bankW = this.cssW * 0.085;
    this.waterLeft = this.bankW;
    this.waterW = this.cssW - this.bankW * 2;
    this.pxX = this.waterW / CONFIG.RIVER_WIDTH_M;
    this.pxY = this.cssH / (CONFIG.VIEW_AHEAD_M + CONFIG.VIEW_BEHIND_M);
    this.midY = this.cssH * 0.5;
  }

  // --- world → screen helpers ---
  private sx(x: number): number { return this.waterLeft + x * this.pxX; }
  private sy(cy: number, camDist: number): number { return this.midY - (cy - camDist) * this.pxY; }

  render(game: GameView): void {
    // game.player may be undefined before the first multiplayer snapshot.
    const cam = game.player ? game.player.dist : 0;
    this.now = game.time;
    if (this.cssW === 0) this.resize();

    this.drawWater(cam);
    this.drawTides(game.entities, cam);
    this.drawFinish(cam);
    this.drawEntities(game.entities, cam);

    // Boats: rivals first, the local player's boat on top.
    for (const b of game.boats) if (!b.isPlayer) this.drawBoat(b, cam);
    if (game.player) this.drawBoat(game.player, cam);

    this.drawBanks(cam);
  }

  private scrollOffset(cam: number, tileH: number): number {
    return ((cam * this.pxY) % tileH + tileH) % tileH;
  }

  private drawWater(cam: number): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.beginPath();
    ctx.rect(this.waterLeft, 0, this.waterW, this.cssH);
    ctx.clip();
    ctx.fillStyle = WATER_COLOR;
    ctx.fillRect(this.waterLeft, 0, this.waterW, this.cssH);
    const off = this.scrollOffset(cam, this.tileH);
    ctx.translate(0, off);
    ctx.fillStyle = this.water;
    ctx.fillRect(this.waterLeft, -this.tileH, this.waterW, this.cssH + this.tileH * 2);
    ctx.restore();
  }

  private roundRectPath(x: number, y: number, w: number, h: number, r: number): void {
    const ctx = this.ctx;
    const rad = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rad, y);
    ctx.arcTo(x + w, y, x + w, y + h, rad);
    ctx.arcTo(x + w, y + h, x, y + h, rad);
    ctx.arcTo(x, y + h, x, y, rad);
    ctx.arcTo(x, y, x + w, y, rad);
    ctx.closePath();
  }

  private drawTides(entities: Entity[], cam: number): void {
    const ctx = this.ctx;
    for (const e of entities) {
      if (e.kind !== 'tide') continue;
      const w = e.w * this.pxX;
      const h = e.len * this.pxY;
      const left = this.sx(e.x) - w / 2;
      const top = this.sy(e.cy, cam) - h / 2;
      if (top > this.cssH || top + h < 0) continue;
      ctx.save();
      this.roundRectPath(left, top, w, h, 8);
      ctx.clip();
      ctx.fillStyle = e.withTide ? 'rgba(255,255,255,0.0)' : 'rgba(0,0,0,0.0)';
      ctx.fillRect(left, top, w, h);
      // Ripples flow in the tide's direction: with the boats (boost) = up the
      // screen, against = down. Offset cycles within one tile height.
      const dir = e.withTide ? -1 : 1;
      const off = (((dir * this.now * TIDE_FLOW_PX_PER_S) % this.tileH) + this.tileH) % this.tileH;
      ctx.translate(left, top - this.tileH + off);
      ctx.fillStyle = e.withTide ? this.tideFast : this.tideSlow;
      ctx.fillRect(0, 0, w, h + this.tileH * 2);
      ctx.restore();
    }
  }

  private drawFinish(cam: number): void {
    const y = this.sy(CONFIG.RACE_LENGTH_M, cam);
    if (y < -20 || y > this.cssH + 20) return;
    const ctx = this.ctx;
    const sq = 14;
    for (let i = 0; i * sq < this.waterW; i++) {
      ctx.fillStyle = i % 2 === 0 ? '#ffffff' : '#101010';
      ctx.fillRect(this.waterLeft + i * sq, y - 7, sq, 14);
    }
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(this.waterLeft, y - 8); ctx.lineTo(this.waterLeft + this.waterW, y - 8);
    ctx.moveTo(this.waterLeft, y + 8); ctx.lineTo(this.waterLeft + this.waterW, y + 8); ctx.stroke();
  }

  private drawEntities(entities: Entity[], cam: number): void {
    const ctx = this.ctx;
    for (const e of entities) {
      if (e.kind === 'tide') continue;
      if (e.kind === 'disk' && e.collectedBy !== -1) continue;
      const cx = this.sx(e.x);
      const cy = this.sy(e.cy, cam);
      if (cy < -30 || cy > this.cssH + 30) continue;

      if (e.kind === 'log') {
        // A wooden log lying across the river: bark cylinder with sawn ends.
        const w = e.w * this.pxX;
        const h = Math.max(7, e.len * this.pxY);
        const r = h / 2;
        ctx.save();
        ctx.translate(cx, cy);

        // Bark body.
        this.roundRectPath(-w / 2, -h / 2, w, h, r);
        ctx.fillStyle = '#7a4f25';
        ctx.fill();
        // Lighter highlight band along the top (cylinder sheen).
        this.roundRectPath(-w / 2 + r * 0.3, -h / 2 + h * 0.14, w - r * 0.6, h * 0.34, h * 0.17);
        ctx.fillStyle = '#9c6c39';
        ctx.fill();
        // Length-wise grain lines.
        ctx.strokeStyle = 'rgba(60,35,15,0.5)'; ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(-w / 2 + r, -h * 0.05); ctx.lineTo(w / 2 - r, -h * 0.05);
        ctx.moveTo(-w / 2 + r, h * 0.18); ctx.lineTo(w / 2 - r, h * 0.18);
        ctx.stroke();
        // Bark outline.
        this.roundRectPath(-w / 2, -h / 2, w, h, r);
        ctx.strokeStyle = '#3f2912'; ctx.lineWidth = 1; ctx.stroke();

        // Sawn end-grain at both ends: pale wood + a growth ring + pith.
        for (const sx of [-1, 1]) {
          const ex = sx * (w / 2 - r);
          ctx.fillStyle = '#c69a5e';
          ctx.beginPath(); ctx.ellipse(ex, 0, r * 0.6, r * 0.82, 0, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = '#8a6534'; ctx.lineWidth = 0.8;
          ctx.beginPath(); ctx.ellipse(ex, 0, r * 0.34, r * 0.5, 0, 0, Math.PI * 2); ctx.stroke();
          ctx.fillStyle = '#6e4b22';
          ctx.beginPath(); ctx.arc(ex, 0, Math.max(0.8, r * 0.12), 0, Math.PI * 2); ctx.fill();
        }
        ctx.restore();
      } else if (e.kind === 'fish') {
        // Modern speedboat profile, always level; bow faces its horizontal heading.
        // Sized from its real hull length at the same horizontal scale as logs,
        // so it stays consistent with (and smaller than) longer features.
        const L = Math.max(12, e.len * this.pxX);
        const Hh = L * 0.52;
        ctx.save();
        ctx.translate(cx, cy);
        if (e.vx < 0) ctx.scale(-1, 1);

        // Hull — sleek, with a sharp raked bow.
        ctx.beginPath();
        ctx.moveTo(-L * 0.46, -Hh * 0.14); // transom top
        ctx.lineTo(L * 0.28, -Hh * 0.18); // foredeck
        ctx.lineTo(L * 0.50, -Hh * 0.02); // bow tip
        ctx.lineTo(L * 0.40, Hh * 0.26);
        ctx.quadraticCurveTo(0, Hh * 0.42, -L * 0.40, Hh * 0.26); // planing bottom
        ctx.closePath();
        ctx.fillStyle = '#eef2f6';
        ctx.fill();
        ctx.strokeStyle = '#27384a'; ctx.lineWidth = 1.2; ctx.stroke();

        // Teal waterline accent stripe.
        ctx.beginPath();
        ctx.moveTo(-L * 0.44, Hh * 0.04);
        ctx.lineTo(L * 0.46, Hh * 0.0);
        ctx.lineWidth = Math.max(1.5, Hh * 0.12);
        ctx.strokeStyle = '#17a6b8';
        ctx.stroke();

        // Low deckhouse.
        ctx.beginPath();
        ctx.moveTo(-L * 0.24, -Hh * 0.16);
        ctx.lineTo(L * 0.02, -Hh * 0.16);
        ctx.lineTo(L * 0.00, -Hh * 0.40);
        ctx.lineTo(-L * 0.22, -Hh * 0.40);
        ctx.closePath();
        ctx.fillStyle = '#dfe6ec';
        ctx.fill();
        ctx.strokeStyle = '#9fb0bd'; ctx.lineWidth = 1; ctx.stroke();

        // Raked, tinted windshield.
        ctx.beginPath();
        ctx.moveTo(L * 0.04, -Hh * 0.16);
        ctx.lineTo(L * 0.20, -Hh * 0.16);
        ctx.lineTo(L * 0.13, -Hh * 0.44);
        ctx.lineTo(L * 0.03, -Hh * 0.40);
        ctx.closePath();
        ctx.fillStyle = '#7fd0e6';
        ctx.fill();
        ctx.strokeStyle = '#3a6b8c'; ctx.lineWidth = 0.8; ctx.stroke();

        // Radar arch.
        ctx.strokeStyle = '#33424f'; ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(-L * 0.16, -Hh * 0.40);
        ctx.quadraticCurveTo(-L * 0.10, -Hh * 0.66, -L * 0.04, -Hh * 0.40);
        ctx.stroke();

        // Dark transom / engine block at the stern.
        ctx.fillStyle = '#33424f';
        ctx.fillRect(-L * 0.50, -Hh * 0.04, L * 0.07, Hh * 0.24);

        ctx.restore();
      } else { // disk
        const r = Math.max(9, (e.w * this.pxX) / 2 * 2.4);
        ctx.fillStyle = '#fac775';
        ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#ef9f27'; ctx.lineWidth = 2; ctx.stroke();
        ctx.fillStyle = '#854f0b';
        ctx.beginPath();
        ctx.moveTo(cx + r * 0.1, cy - r * 0.55);
        ctx.lineTo(cx - r * 0.35, cy + r * 0.1);
        ctx.lineTo(cx, cy + r * 0.1);
        ctx.lineTo(cx - r * 0.1, cy + r * 0.55);
        ctx.lineTo(cx + r * 0.35, cy - r * 0.1);
        ctx.lineTo(cx, cy - r * 0.1);
        ctx.closePath(); ctx.fill();
      }
    }
  }

  private drawBoat(b: Boat, cam: number): void {
    const ctx = this.ctx;
    const cx = this.sx(b.x);
    const cy = this.sy(b.dist, cam);
    if (cy < -80 || cy > this.cssH + 80) return;

    const halfW = (CONFIG.BOAT_WID_M * this.pxX) / 2;
    const halfL = (CONFIG.BOAT_LEN_M * this.pxY) / 2;
    const penalised = this.now < Math.max(b.obstUntil, b.bankUntil, b.collUntil);

    ctx.save();
    ctx.translate(cx, cy);
    if (penalised) ctx.globalAlpha = 0.6;

    // Paddles — both banks stroke in unison (same vertical sweep).
    const sweep = Math.sin(b.strokePhase * Math.PI * 2) * (CONFIG.STROKE_ANGLE_DEG * Math.PI / 180);
    const rows = CONFIG.PADDLES_PER_SIDE;
    const bladeLen = halfW * 1.7 + 3;
    ctx.strokeStyle = b.accent;
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.fillStyle = b.accent;
    for (let i = 0; i < rows; i++) {
      const ry = -halfL * 0.55 + (halfL * 1.1) * (i / (rows - 1));
      for (const side of [-1, 1]) {
        const pivotX = side * halfW * 0.8;
        const tipX = pivotX + side * bladeLen * Math.cos(sweep);
        const tipY = ry + bladeLen * Math.sin(sweep);
        ctx.beginPath();
        ctx.moveTo(pivotX, ry);
        ctx.lineTo(tipX, tipY);
        ctx.stroke();
        ctx.fillRect(tipX - 1.4, tipY - 2, 2.8, 4);
      }
    }

    // Hull
    ctx.fillStyle = b.hull;
    ctx.strokeStyle = '#1b1b1b';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, -halfL); // bow
    ctx.quadraticCurveTo(halfW * 1.25, -halfL * 0.6, halfW, halfL * 0.2);
    ctx.quadraticCurveTo(halfW, halfL, 0, halfL); // stern
    ctx.quadraticCurveTo(-halfW, halfL, -halfW, halfL * 0.2);
    ctx.quadraticCurveTo(-halfW * 1.25, -halfL * 0.6, 0, -halfL);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Dragon head
    ctx.fillStyle = b.accent;
    ctx.beginPath();
    ctx.arc(0, -halfL * 0.78, Math.max(3, halfW * 0.7), 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Player gets a highlight ring.
    if (b.isPlayer) {
      ctx.strokeStyle = '#ffe08a';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.ellipse(0, 0, halfW + 4, halfL + 4, 0, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.restore();
  }

  private drawBanks(cam: number): void {
    const ctx = this.ctx;
    const off = this.scrollOffset(cam, this.grassTileH);
    for (const side of ['L', 'R'] as const) {
      const x0 = side === 'L' ? 0 : this.cssW - this.bankW;
      ctx.save();
      ctx.beginPath(); ctx.rect(x0, 0, this.bankW, this.cssH); ctx.clip();
      ctx.fillStyle = BANK_COLOR; ctx.fillRect(x0, 0, this.bankW, this.cssH);
      ctx.translate(0, off);
      ctx.fillStyle = this.grass;
      ctx.fillRect(x0, -this.grassTileH, this.bankW, this.cssH + this.grassTileH * 2);
      ctx.restore();
    }
    // Ragged fringe along each inner edge.
    const fOff = this.scrollOffset(cam, 60);
    const fw = 34;
    for (const side of ['L', 'R'] as const) {
      ctx.save();
      if (side === 'L') {
        ctx.translate(this.waterLeft - fw + 12, fOff - 60);
      } else {
        ctx.translate(this.cssW - this.bankW - 12 + fw, fOff - 60);
        ctx.scale(-1, 1);
      }
      for (let y = 0; y < this.cssH + 120; y += 60) {
        ctx.drawImage(this.fringe, 0, y);
      }
      ctx.restore();
    }
  }
}
