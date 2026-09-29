/* Firm-jelly physics for the login page's stress-relief blob.

   The body is a rigid disc (position, velocity, angle, spin) plus a handful of smooth
   deformation modes — radius(φ) = R · (1 + Σ aₙ·cos nφ + bₙ·sin nφ) for n = 2..4. Each mode
   is a damped spring, so the jelly can only squash/stretch/wobble in broad, gelatin-like
   shapes (no watery surface ripples). Floor/wall contacts and the pointer grab are forces
   applied at surface points; each is split into a push on the body, a twist, and a push on
   every mode — which is what makes a landing squash it and a fast drag stretch it. */

export const JELLY_HZ = 2.2; // base wobble frequency — higher = firmer jelly
const MODES = [2, 3, 4];
const MODE_HZ = [JELLY_HZ, JELLY_HZ * 1.45, JELLY_HZ * 1.9];
const MODE_ZETA = 0.13; // wobble damping ratio (lower = jigglier, longer wobble)
const MODE_MAX = 0.32; // max amplitude per mode (fraction of R)
const MODE_TOTAL_MAX = 0.5;
// How strongly surface forces deform the shape vs. move the body. A filled jelly is
// heavier to deform than a thin ring, and too high a value makes contacts pump energy in.
const MODE_COUPLING = 0.6;

export const SAMPLES = 64;
export const STEP = 1 / 480;
const GRAVITY = 1500;
const AIR_DAMP = 0.2;
const CONTACT_K = 6000; // per surface sample, acceleration per px of penetration
const CONTACT_C = 70; // contact damping (lower = bouncier)
const FRICTION_C = 30;
const FRICTION_MU = 0.6;
const GRAB_K = 380;
const GRAB_C = 24;
const GRAB_STRETCH = 2.5; // extra shape pull at the grabbed spot, so holding it visibly stretches
const RIGHTING_K = 14; // roly-poly torque pulling the face upright
const SPIN_DAMP = 1.6;
const MAX_SPEED = 3200;
const MAX_SPIN = 14;

const TRIG = Array.from({ length: SAMPLES }, (_, k) => {
  const phi = (k / SAMPLES) * Math.PI * 2;
  return {
    c: Math.cos(phi),
    s: Math.sin(phi),
    cn: MODES.map((n) => Math.cos(n * phi)),
    sn: MODES.map((n) => Math.sin(n * phi)),
  };
});

export type Grab = { k: number; rho: number };

export class Jelly {
  R: number;
  x: number;
  y: number;
  vx = 0;
  vy = 0;
  ang = 0;
  spin = 0;
  a = MODES.map(() => 0);
  b = MODES.map(() => 0);
  va = MODES.map(() => 0);
  vb = MODES.map(() => 0);
  bounds = { w: 0, h: 0, floor: 0, pad: 4 };
  grab: Grab | null = null;
  pointer = { x: 0, y: 0, vx: 0, vy: 0 };
  /** World-space surface points, refreshed every step (used for drawing and hit tests). */
  px = new Float64Array(SAMPLES);
  py = new Float64Array(SAMPLES);

  constructor(R: number, x: number, y: number) {
    this.R = R;
    this.x = x;
    this.y = y;
    this.updateSurface();
  }

  radiusAt(k: number): number {
    const t = TRIG[k];
    let r = 1;
    for (let m = 0; m < MODES.length; m++) r += this.a[m] * t.cn[m] + this.b[m] * t.sn[m];
    return this.R * r;
  }

  updateSurface() {
    const cos = Math.cos(this.ang);
    const sin = Math.sin(this.ang);
    for (let k = 0; k < SAMPLES; k++) {
      const t = TRIG[k];
      const r = this.radiusAt(k);
      this.px[k] = this.x + r * (cos * t.c - sin * t.s);
      this.py[k] = this.y + r * (sin * t.c + cos * t.s);
    }
  }

  /** Deformation magnitude — ~0 at rest, 0.1+ when visibly squished. */
  strain(): number {
    let s = 0;
    for (let m = 0; m < MODES.length; m++) s += Math.hypot(this.a[m], this.b[m]);
    return s;
  }

  /** Squash along the body's own x/y axes (from the n=2 mode), for scaling the face. */
  squash(): number {
    return this.a[0];
  }

  contains(x: number, y: number, slop = 0): boolean {
    let inside = false;
    for (let i = 0, j = SAMPLES - 1; i < SAMPLES; j = i++) {
      const ax = this.px[i], ay = this.py[i], bx = this.px[j], by = this.py[j];
      if (ay > y !== by > y && x < ((bx - ax) * (y - ay)) / (by - ay) + ax) inside = !inside;
    }
    if (inside || slop <= 0) return inside;
    for (let k = 0; k < SAMPLES; k++) if (Math.hypot(this.px[k] - x, this.py[k] - y) < slop) return true;
    return false;
  }

  /** Grab at a world point: anchors to the nearest surface direction, at that depth. */
  startGrab(x: number, y: number) {
    const dx = x - this.x;
    const dy = y - this.y;
    const phiWorld = Math.atan2(dy, dx);
    let phi = phiWorld - this.ang;
    phi = ((phi % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    const k = Math.round((phi / (Math.PI * 2)) * SAMPLES) % SAMPLES;
    const rho = Math.min(1, Math.hypot(dx, dy) / this.radiusAt(k));
    this.grab = { k, rho };
    this.pointer.x = x;
    this.pointer.y = y;
    this.pointer.vx = 0;
    this.pointer.vy = 0;
  }

  /** Poke: dent the surface in at a world point so it boings back out. */
  poke(x: number, y: number, strength = 1.6) {
    const phi = Math.atan2(y - this.y, x - this.x) - this.ang;
    for (let m = 0; m < MODES.length; m++) {
      this.va[m] -= strength * Math.cos(MODES[m] * phi) * (m === 0 ? 1 : 0.6);
      this.vb[m] -= strength * Math.sin(MODES[m] * phi) * (m === 0 ? 1 : 0.6);
    }
    this.vx -= Math.cos(phi + this.ang) * 120;
    this.vy -= Math.sin(phi + this.ang) * 120;
  }

  step(dt = STEP) {
    const { R } = this;
    const cos = Math.cos(this.ang);
    const sin = Math.sin(this.ang);
    let fx = 0;
    let fy = GRAVITY;
    let torque = 0;
    const qa = MODES.map(() => 0);
    const qb = MODES.map(() => 0);

    const apply = (k: number, ux: number, uy: number, rx: number, ry: number, Fx: number, Fy: number, rho: number) => {
      fx += Fx;
      fy += Fy;
      torque += rx * Fy - ry * Fx;
      const Fr = (Fx * ux + Fy * uy) * rho;
      const t = TRIG[k];
      for (let m = 0; m < MODES.length; m++) {
        qa[m] += (MODE_COUPLING * Fr * t.cn[m]) / R;
        qb[m] += (MODE_COUPLING * Fr * t.sn[m]) / R;
      }
    };

    const pointState = (k: number, rho: number) => {
      const t = TRIG[k];
      const ux = cos * t.c - sin * t.s;
      const uy = sin * t.c + cos * t.s;
      const r = this.radiusAt(k) * rho;
      let rv = 0;
      for (let m = 0; m < MODES.length; m++) rv += this.va[m] * t.cn[m] + this.vb[m] * t.sn[m];
      rv *= R * rho;
      const rx = r * ux;
      const ry = r * uy;
      return {
        ux, uy, rx, ry,
        px: this.x + rx,
        py: this.y + ry,
        vx: this.vx - this.spin * ry + rv * ux,
        vy: this.vy + this.spin * rx + rv * uy,
      };
    };

    // Floor, ceiling and walls as inward-facing planes: penetration d = c - n·P.
    const { w, floor, pad } = this.bounds;
    const planes = [
      { nx: 0, ny: -1, c: -floor },
      { nx: 0, ny: 1, c: pad },
      { nx: 1, ny: 0, c: pad },
      { nx: -1, ny: 0, c: -(w - pad) },
    ];
    for (let k = 0; k < SAMPLES; k++) {
      const p = pointState(k, 1);
      for (const pl of planes) {
        const d = pl.c - (pl.nx * p.px + pl.ny * p.py);
        if (d <= 0) continue;
        const vn = pl.nx * p.vx + pl.ny * p.vy;
        const Fn = Math.max(0, CONTACT_K * d - CONTACT_C * vn);
        const tx = -pl.ny;
        const ty = pl.nx;
        const vt = tx * p.vx + ty * p.vy;
        const Ft = Math.max(-FRICTION_MU * Fn, Math.min(FRICTION_MU * Fn, -vt * FRICTION_C));
        apply(k, p.ux, p.uy, p.rx, p.ry, pl.nx * Fn + tx * Ft, pl.ny * Fn + ty * Ft, 1);
      }
    }

    if (this.grab) {
      const { k, rho } = this.grab;
      const p = pointState(k, rho);
      const Fx = GRAB_K * (this.pointer.x - p.px) + GRAB_C * (this.pointer.vx - p.vx);
      const Fy = GRAB_K * (this.pointer.y - p.py) + GRAB_C * (this.pointer.vy - p.vy);
      apply(k, p.ux, p.uy, p.rx, p.ry, Fx, Fy, Math.max(0.35, rho) * GRAB_STRETCH);
      // Pointer velocity is only sampled on move events; let it fade when the pointer rests.
      this.pointer.vx *= 1 - 8 * dt;
      this.pointer.vy *= 1 - 8 * dt;
    }

    const inertia = 0.5 * R * R;
    const air = 1 - AIR_DAMP * dt;
    this.vx = (this.vx + fx * dt) * air;
    this.vy = (this.vy + fy * dt) * air;
    this.spin += (torque / inertia - RIGHTING_K * Math.sin(this.ang) - SPIN_DAMP * this.spin) * dt;

    const sp = Math.hypot(this.vx, this.vy);
    if (sp > MAX_SPEED) {
      this.vx *= MAX_SPEED / sp;
      this.vy *= MAX_SPEED / sp;
    }
    this.spin = Math.max(-MAX_SPIN, Math.min(MAX_SPIN, this.spin));

    let total = 0;
    for (let m = 0; m < MODES.length; m++) {
      const om = MODE_HZ[m] * Math.PI * 2;
      this.va[m] += (qa[m] - om * om * this.a[m] - 2 * MODE_ZETA * om * this.va[m]) * dt;
      this.vb[m] += (qb[m] - om * om * this.b[m] - 2 * MODE_ZETA * om * this.vb[m]) * dt;
      this.a[m] = Math.max(-MODE_MAX, Math.min(MODE_MAX, this.a[m] + this.va[m] * dt));
      this.b[m] = Math.max(-MODE_MAX, Math.min(MODE_MAX, this.b[m] + this.vb[m] * dt));
      total += Math.abs(this.a[m]) + Math.abs(this.b[m]);
    }
    if (total > MODE_TOTAL_MAX) {
      const s = MODE_TOTAL_MAX / total;
      for (let m = 0; m < MODES.length; m++) {
        this.a[m] *= s;
        this.b[m] *= s;
      }
    }

    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.ang += this.spin * dt;
    // keep the angle in (-π, π] so the roly-poly torque always rights via the short way
    this.ang = Math.atan2(Math.sin(this.ang), Math.cos(this.ang));
    this.updateSurface();
  }
}
