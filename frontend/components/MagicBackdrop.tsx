"use client";

import { useEffect, useRef, useCallback } from "react";

/**
 * Candlelit-night-over-Hogwarts backdrop used by the auth screens
 * (login / forgot-password / reset-password / change-password).
 *
 * Pure <canvas> animation — twinkling stars, a crescent moon, drifting
 * nebulae, the Hogwarts castle above the Black Lake, levitating Great-Hall
 * candles, rising golden embers, and the odd owl, broomstick rider or
 * Weasley Ford Anglia crossing the sky.
 */
type Flyer = {
  kind: "owl" | "broom" | "car";
  x: number;
  y: number;
  vx: number;
  vy: number;
  scale: number;
  ph: number;
};
export default function MagicBackdrop({ className = "" }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Persistent particle state, seeded once per mount.
  const stateRef = useRef<{
    stars: { x: number; y: number; r: number; ph: number; sp: number }[];
    candles: { x: number; y: number; scale: number; ph: number; drift: number }[];
    embers: { x: number; y: number; r: number; sp: number; ph: number }[];
    shooting: { x: number; y: number; len: number; vx: number; vy: number; life: number } | null;
    nextShoot: number;
    flyers: Flyer[];
    nextFlyer: number;
  }>({ stars: [], candles: [], embers: [], shooting: null, nextShoot: 3, flyers: [], nextFlyer: 2 });

  const seed = useCallback((W: number, H: number) => {
    const rand = (a: number, b: number) => a + Math.random() * (b - a);
    stateRef.current.stars = Array.from({ length: 150 }, () => ({
      x: Math.random() * W,
      y: Math.random() * H * 0.85,
      r: rand(0.4, 1.7),
      ph: Math.random() * Math.PI * 2,
      sp: rand(0.4, 1.6),
    }));
    stateRef.current.candles = Array.from({ length: 7 }, (_, i) => ({
      x: (i + 0.5) / 7 + rand(-0.04, 0.04),
      y: rand(0.14, 0.6),
      scale: rand(0.7, 1.35),
      ph: Math.random() * Math.PI * 2,
      drift: rand(0.25, 0.6),
    }));
    stateRef.current.embers = Array.from({ length: 34 }, () => ({
      x: Math.random() * W,
      y: Math.random() * H,
      r: rand(0.6, 2.2),
      sp: rand(8, 26),
      ph: Math.random() * Math.PI * 2,
    }));
  }, []);

  const drawFrame = useCallback((canvas: HTMLCanvasElement) => {
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const W = canvas.width;
    const H = canvas.height;
    const t = Date.now() / 1000;
    const S = stateRef.current;

    // ── Night sky gradient ──
    const sky = ctx.createLinearGradient(0, 0, W * 0.3, H);
    sky.addColorStop(0, "#0a0e24");
    sky.addColorStop(0.45, "#171043");
    sky.addColorStop(0.75, "#0f0a26");
    sky.addColorStop(1, "#07060f");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);

    // ── Drifting nebulae ──
    const nebulae = [
      { bx: 0.22, by: 0.3, r: 260, hue: 250, a: 0.22 },
      { bx: 0.8, by: 0.62, r: 300, hue: 275, a: 0.18 },
      { bx: 0.62, by: 0.12, r: 200, hue: 43, a: 0.12 },
    ];
    nebulae.forEach((n, i) => {
      const x = n.bx * W + Math.sin(t * 0.05 + i * 1.7) * 26;
      const y = n.by * H + Math.cos(t * 0.04 + i * 1.3) * 22;
      const g = ctx.createRadialGradient(x, y, 0, x, y, n.r);
      g.addColorStop(0, `hsla(${n.hue}, 80%, 62%, ${n.a})`);
      g.addColorStop(0.55, `hsla(${n.hue + 12}, 75%, 50%, ${n.a * 0.35})`);
      g.addColorStop(1, "transparent");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, n.r, 0, Math.PI * 2);
      ctx.fill();
    });

    // ── Crescent moon (top-right) ──
    const mx = W * 0.84;
    const my = H * 0.16;
    const mr = Math.max(26, W * 0.032);
    const halo = ctx.createRadialGradient(mx, my, 0, mx, my, mr * 4);
    halo.addColorStop(0, "rgba(253, 240, 198, 0.28)");
    halo.addColorStop(0.5, "rgba(226, 168, 74, 0.08)");
    halo.addColorStop(1, "transparent");
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(mx, my, mr * 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.save();
    ctx.beginPath();
    ctx.arc(mx, my, mr, 0, Math.PI * 2);
    ctx.fillStyle = "#fdf3d4";
    ctx.fill();
    ctx.globalCompositeOperation = "destination-out";
    ctx.beginPath();
    ctx.arc(mx + mr * 0.55, my - mr * 0.25, mr * 0.95, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // ── Twinkling stars ──
    S.stars.forEach((s) => {
      const tw = 0.35 + (Math.sin(t * s.sp + s.ph) * 0.5 + 0.5) * 0.65;
      ctx.globalAlpha = tw;
      ctx.fillStyle = s.r > 1.2 ? "#e8e2ff" : "#fdf6e3";
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
      if (s.r > 1.3) {
        ctx.globalAlpha = tw * 0.5;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r * 2.4, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(232, 226, 255, 0.25)";
        ctx.fill();
      }
    });
    ctx.globalAlpha = 1;

    // ── Shooting star ──
    if (!S.shooting && t > S.nextShoot) {
      S.shooting = {
        x: Math.random() * W * 0.7,
        y: Math.random() * H * 0.35,
        len: 90 + Math.random() * 80,
        vx: 360 + Math.random() * 160,
        vy: 120 + Math.random() * 90,
        life: 1,
      };
    }
    if (S.shooting) {
      const sh = S.shooting;
      sh.x += sh.vx * 0.016;
      sh.y += sh.vy * 0.016;
      sh.life -= 0.016;
      const ang = Math.atan2(sh.vy, sh.vx);
      const tailX = sh.x - Math.cos(ang) * sh.len;
      const tailY = sh.y - Math.sin(ang) * sh.len;
      const grad = ctx.createLinearGradient(sh.x, sh.y, tailX, tailY);
      grad.addColorStop(0, `rgba(255, 244, 214, ${Math.max(0, sh.life)})`);
      grad.addColorStop(1, "transparent");
      ctx.strokeStyle = grad;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(sh.x, sh.y);
      ctx.lineTo(tailX, tailY);
      ctx.stroke();
      if (sh.life <= 0 || sh.x > W + 120) {
        S.shooting = null;
        S.nextShoot = t + 4 + Math.random() * 7;
      }
    }

    // ── Hogwarts castle on the cliff ──
    const gY = H * 1.0;
    const bY = H * 0.82; // tower baseline

    // distant mountain ridge for depth
    ctx.fillStyle = "#100f24";
    ctx.beginPath();
    ctx.moveTo(0, gY);
    ctx.lineTo(0, H * 0.74);
    [
      [0.15, 0.68], [0.3, 0.76], [0.46, 0.66], [0.62, 0.75],
      [0.78, 0.64], [0.9, 0.72], [1, 0.68],
    ].forEach(([rx, ry]) => ctx.lineTo(rx * W, ry * H));
    ctx.lineTo(W, gY);
    ctx.closePath();
    ctx.fill();

    // castle + cliff silhouette
    const castleColor = "#090a1c";

    // the cliff / hillside the castle stands on
    ctx.fillStyle = castleColor;
    ctx.beginPath();
    ctx.moveTo(0, gY);
    ctx.lineTo(0, H * 0.9);
    ctx.bezierCurveTo(W * 0.22, H * 0.95, W * 0.34, H * 0.8, W * 0.55, H * 0.82);
    ctx.bezierCurveTo(W * 0.76, H * 0.84, W * 0.86, H * 0.97, W, H * 0.9);
    ctx.lineTo(W, gY);
    ctx.closePath();
    ctx.fill();

    const towers: { x: number; w: number; h: number; roof: "spire" | "crenel" }[] = [
      { x: 0.06, w: 0.045, h: 0.10, roof: "crenel" },
      { x: 0.14, w: 0.060, h: 0.16, roof: "spire" },
      { x: 0.22, w: 0.045, h: 0.11, roof: "crenel" },
      { x: 0.31, w: 0.078, h: 0.20, roof: "spire" },
      { x: 0.42, w: 0.055, h: 0.15, roof: "crenel" },
      { x: 0.51, w: 0.072, h: 0.31, roof: "spire" }, // Astronomy Tower
      { x: 0.60, w: 0.055, h: 0.19, roof: "spire" },
      { x: 0.69, w: 0.088, h: 0.25, roof: "spire" }, // Great Hall block
      { x: 0.79, w: 0.050, h: 0.14, roof: "crenel" },
      { x: 0.88, w: 0.070, h: 0.21, roof: "spire" },
      { x: 0.96, w: 0.050, h: 0.12, roof: "crenel" },
    ];

    const paintCastle = () => {
      // curtain wall linking the towers
      ctx.fillStyle = castleColor;
      ctx.fillRect(W * 0.03, bY - H * 0.09, W * 0.95, H * 0.13);

      towers.forEach((tw) => {
        const cx = tw.x * W;
        const w = tw.w * W;
        const topY = bY - tw.h * H;
        ctx.fillStyle = castleColor;
        ctx.fillRect(cx - w / 2, topY, w, bY - topY + H * 0.04);

        if (tw.roof === "spire") {
          const spireH = w * 1.5;
          ctx.beginPath();
          ctx.moveTo(cx - w / 2 - w * 0.12, topY);
          ctx.lineTo(cx, topY - spireH);
          ctx.lineTo(cx + w / 2 + w * 0.12, topY);
          ctx.closePath();
          ctx.fill();
        } else {
          const m = w / 5;
          for (let k = 0; k < 3; k++) {
            ctx.fillRect(cx - w / 2 + k * 2 * m, topY - m, m, m);
          }
        }
      });
    };
    paintCastle();

    // ── warm lit windows ──
    const windowGlow = (wx: number, wy: number, ww: number, wh: number, phase: number) => {
      const a = 0.45 + Math.sin(t * 1.6 + phase) * 0.28 + Math.sin(t * 11 + phase) * 0.06;
      ctx.fillStyle = `rgba(255, 190, 105, ${Math.max(0.12, a)})`;
      ctx.fillRect(wx, wy, ww, wh);
      ctx.fillStyle = `rgba(255, 150, 60, ${Math.max(0.06, a * 0.4)})`;
      ctx.fillRect(wx - 1, wy - 1, ww + 2, wh + 2);
    };

    towers.forEach((tw, ti) => {
      const cx = tw.x * W;
      const w = tw.w * W;
      const topY = bY - tw.h * H;
      const rows = Math.max(2, Math.round((bY - topY) / (H * 0.05)));
      for (let r = 0; r < rows; r++) {
        const wy = topY + H * 0.03 + r * H * 0.045;
        if (wy > bY + H * 0.02) break;
        const cols = w > W * 0.05 ? 2 : 1;
        for (let c = 0; c < cols; c++) {
          if ((r + c + ti) % 3 === 0) continue;
          const wx = cx - w / 2 + w * 0.28 + c * w * 0.44 - 1.5;
          windowGlow(wx, wy, 3, 4.5, ti * 2 + r + c);
        }
      }
    });
    // a few windows along the curtain wall
    for (let i = 0; i < 14; i++) {
      const wx = W * 0.05 + i * W * 0.066;
      windowGlow(wx, bY - H * 0.045, 3, 4, i * 1.7 + 5);
    }

    // ── Black Lake: reflection + shimmer ──
    const waterY = bY + H * 0.05;
    if (waterY < H) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, waterY, W, H - waterY);
      ctx.clip();
      const water = ctx.createLinearGradient(0, waterY, 0, H);
      water.addColorStop(0, "#0a0b1e");
      water.addColorStop(1, "#05050e");
      ctx.fillStyle = water;
      ctx.fillRect(0, waterY, W, H - waterY);
      // mirrored castle about the shoreline, faded and squished
      ctx.translate(0, waterY * 1.55);
      ctx.scale(1, -0.55);
      ctx.globalAlpha = 0.16;
      paintCastle();
      ctx.restore();
      // horizontal shimmer lines
      for (let i = 0; i < 5; i++) {
        const ly = waterY + (i + 1) * ((H - waterY) / 6);
        ctx.strokeStyle = `rgba(255, 200, 120, ${0.05 + Math.sin(t * 1.2 + i) * 0.03})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let x = 0; x <= W; x += 6) {
          const y = ly + Math.sin(x * 0.03 + t * 1.5 + i) * 1.4;
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
    }

    // ── Owls, broomstick riders & the Weasley Ford Anglia ──
    // Each launches from a random edge on a random heading across the sky.
    if (t > S.nextFlyer) {
      const roll = Math.random();
      const makeFlyer = (kind: Flyer["kind"], speed: number, scale: number): Flyer => {
        const edge = [0, 0, 0, 1, 1, 1, 2, 3][Math.floor(Math.random() * 8)];
        let x = 0;
        let y = 0;
        let baseAng = 0;
        if (edge === 0) { x = -50; y = Math.random() * H; baseAng = 0; }
        else if (edge === 1) { x = W + 50; y = Math.random() * H; baseAng = Math.PI; }
        else if (edge === 2) { x = Math.random() * W; y = -50; baseAng = Math.PI / 2; }
        else { x = Math.random() * W; y = H + 50; baseAng = -Math.PI / 2; }
        const ang = baseAng + (Math.random() - 0.5) * Math.PI * 0.62; // ±56° spread
        return {
          kind, x, y,
          vx: Math.cos(ang) * speed,
          vy: Math.sin(ang) * speed,
          scale,
          ph: Math.random() * Math.PI * 2,
        };
      };

      if (roll < 0.5) {
        const owl = makeFlyer("owl", 70 + Math.random() * 45, 0.8 + Math.random() * 0.5);
        S.flyers.push(owl);
        if (Math.random() < 0.35) {
          const n = Math.hypot(owl.vx, owl.vy) || 1; // second owl trails just behind
          S.flyers.push({
            ...owl,
            x: owl.x - (owl.vx / n) * 34,
            y: owl.y - (owl.vy / n) * 34,
            scale: 0.8 + Math.random() * 0.5,
            ph: Math.random() * Math.PI * 2,
          });
        }
        S.nextFlyer = t + 6 + Math.random() * 9;
      } else if (roll < 0.82) {
        S.flyers.push(makeFlyer("broom", 150 + Math.random() * 80, 0.9 + Math.random() * 0.4));
        S.nextFlyer = t + 9 + Math.random() * 13;
      } else {
        if (!S.flyers.some((f) => f.kind === "car")) {
          S.flyers.push(makeFlyer("car", 46 + Math.random() * 30, 1));
        }
        S.nextFlyer = t + 24 + Math.random() * 22;
      }
    }

    // sprites are drawn nose-toward +x; orient() rotates them onto their
    // heading and mirrors vertically when that heading points left, so "up"
    // stays up whichever way they fly.
    const orient = (x: number, y: number, s: number, ang: number) => {
      ctx.translate(x, y);
      ctx.rotate(ang);
      const norm = Math.atan2(Math.sin(ang), Math.cos(ang));
      if (Math.abs(norm) > Math.PI / 2) ctx.scale(1, -1);
      ctx.scale(s, s);
    };

    const drawOwl = (x: number, y: number, s: number, ang: number, ph: number) => {
      const flap = Math.sin(t * 11 + ph);
      ctx.save();
      orient(x, y, s, ang);
      ctx.translate(0, Math.sin(t * 2.5 + ph) * 3);
      ctx.fillStyle = "#0c0b16";
      ctx.beginPath();
      ctx.ellipse(0, 0, 4.6, 6.6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(0.6, -6.4, 3.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(-2.4, -8.4); ctx.lineTo(-1.2, -11.4); ctx.lineTo(-0.2, -8.4);
      ctx.moveTo(3.2, -8.4); ctx.lineTo(2.0, -11.4); ctx.lineTo(1.0, -8.4);
      ctx.fill();
      const wa = flap * 0.9;
      ctx.beginPath();
      ctx.moveTo(-1.5, -2);
      ctx.quadraticCurveTo(-12, -2 - wa * 9, -14, 4 - wa * 4);
      ctx.quadraticCurveTo(-8, 1, -1.5, 3);
      ctx.moveTo(1.5, -2);
      ctx.quadraticCurveTo(12, -2 - wa * 9, 14, 4 - wa * 4);
      ctx.quadraticCurveTo(8, 1, 1.5, 3);
      ctx.fill();
      ctx.fillStyle = "rgba(255, 190, 110, 0.75)";
      ctx.fillRect(-1.6, -7, 1, 1);
      ctx.fillRect(1.0, -7, 1, 1);
      ctx.restore();
    };

    const drawBroom = (x: number, y: number, s: number, ang: number, ph: number) => {
      ctx.save();
      orient(x, y, s, ang);
      ctx.translate(0, Math.sin(t * 3 + ph) * 1.6);
      for (let k = 1; k <= 6; k++) {
        ctx.globalAlpha = 0.45 / k;
        ctx.fillStyle = "rgba(255, 210, 130, 0.9)";
        ctx.beginPath();
        ctx.arc(-24 - k * 5, Math.sin(t * 8 + k) * 1.6, 1.6 / k + 0.35, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      ctx.strokeStyle = "#0c0b16";
      ctx.fillStyle = "#0c0b16";
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(16, -1);
      ctx.lineTo(-14, 3);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-14, 0.5);
      ctx.lineTo(-25, -4);
      ctx.lineTo(-25, 6.5);
      ctx.lineTo(-14, 5);
      ctx.closePath();
      ctx.fill();
      const cf = Math.sin(t * 9 + ph) * 2.4;
      ctx.beginPath();
      ctx.moveTo(-1, -6.5);
      ctx.quadraticCurveTo(-12, -6 + cf, -17, 1.5 + cf);
      ctx.quadraticCurveTo(-9, -2, -1, -1.5);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(-2.5, 0.5);
      ctx.quadraticCurveTo(-4.5, -8, -1, -9.5);
      ctx.quadraticCurveTo(3.5, -10.5, 4.5, -3.5);
      ctx.lineTo(2, 0.5);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.arc(2, -11.5, 2.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    };

    const drawCar = (x: number, y: number, s: number, ang: number, ph: number) => {
      ctx.save();
      orient(x, y, s, ang);
      ctx.translate(0, Math.sin(t * 1.6 + ph) * 4);
      ctx.rotate(Math.sin(t * 0.9 + ph) * 0.04);
      // forward headlight beams
      const beam = ctx.createLinearGradient(18, 0, 78, 0);
      beam.addColorStop(0, "rgba(255, 244, 200, 0.30)");
      beam.addColorStop(1, "transparent");
      ctx.fillStyle = beam;
      ctx.beginPath();
      ctx.moveTo(18, -4);
      ctx.lineTo(78, -22);
      ctx.lineTo(78, 18);
      ctx.lineTo(18, 5);
      ctx.closePath();
      ctx.fill();
      // Ford Anglia body — long bonnet, upright cabin, reverse-rake rear window
      ctx.fillStyle = "#5fa89e";
      ctx.beginPath();
      ctx.moveTo(-22, 5);
      ctx.lineTo(-22, 0.5);
      ctx.lineTo(-16, -2);
      ctx.lineTo(-11, -9.5);
      ctx.lineTo(2, -11);
      ctx.lineTo(6.5, -3.5);
      ctx.lineTo(20, -3);
      ctx.lineTo(22.5, 2);
      ctx.lineTo(21.5, 6.5);
      ctx.lineTo(-20.5, 6.5);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#2f5d58";
      ctx.fillRect(-20, 4.5, 42, 2.4);
      // warm-lit cabin
      ctx.fillStyle = "rgba(255, 198, 122, 0.85)";
      ctx.beginPath();
      ctx.moveTo(-13, -2.5);
      ctx.lineTo(-9, -8.4);
      ctx.lineTo(0.6, -9.4);
      ctx.lineTo(3, -3);
      ctx.closePath();
      ctx.fill();
      // wheels
      ctx.fillStyle = "#0b0b12";
      ctx.beginPath(); ctx.arc(-12.5, 7.5, 3.3, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(13, 7.5, 3.3, 0, Math.PI * 2); ctx.fill();
      // headlight glow
      const hl = ctx.createRadialGradient(20.5, -0.5, 0, 20.5, -0.5, 7);
      hl.addColorStop(0, "rgba(255, 245, 205, 0.95)");
      hl.addColorStop(1, "transparent");
      ctx.fillStyle = hl;
      ctx.beginPath();
      ctx.arc(20.5, -0.5, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    };

    for (let i = S.flyers.length - 1; i >= 0; i--) {
      const f = S.flyers[i];
      f.x += f.vx * 0.016;
      f.y += f.vy * 0.016;
      const margin = f.kind === "car" ? 140 : 80;
      if (f.x < -margin || f.x > W + margin || f.y < -margin || f.y > H + margin) {
        S.flyers.splice(i, 1);
        continue;
      }
      const ang = Math.atan2(f.vy, f.vx);
      if (f.kind === "owl") drawOwl(f.x, f.y, f.scale, ang, f.ph);
      else if (f.kind === "broom") drawBroom(f.x, f.y, f.scale, ang, f.ph);
      else drawCar(f.x, f.y, f.scale, ang, f.ph);
    }

    // ── Levitating candles ──
    S.candles.forEach((c, i) => {
      const cx = c.x * W;
      const cy = c.y * H + Math.sin(t * c.drift + c.ph) * 12;
      const sc = c.scale;
      const flick = 0.75 + (Math.sin(t * 7 + c.ph) * 0.5 + 0.5) * 0.25 + Math.sin(t * 23 + i) * 0.05;

      // flame glow
      const fg = ctx.createRadialGradient(cx, cy - 16 * sc, 0, cx, cy - 16 * sc, 60 * sc);
      fg.addColorStop(0, `rgba(255, 214, 140, ${0.5 * flick})`);
      fg.addColorStop(0.4, `rgba(240, 160, 60, ${0.18 * flick})`);
      fg.addColorStop(1, "transparent");
      ctx.fillStyle = fg;
      ctx.beginPath();
      ctx.arc(cx, cy - 16 * sc, 60 * sc, 0, Math.PI * 2);
      ctx.fill();

      // candle body
      ctx.fillStyle = "rgba(247, 240, 224, 0.85)";
      ctx.fillRect(cx - 2.4 * sc, cy - 10 * sc, 4.8 * sc, 26 * sc);
      ctx.fillStyle = "rgba(220, 205, 178, 0.5)";
      ctx.fillRect(cx - 2.4 * sc, cy - 10 * sc, 1.4 * sc, 26 * sc);

      // wick + flame
      ctx.fillStyle = "#3a2a1a";
      ctx.fillRect(cx - 0.5, cy - 13 * sc, 1, 3 * sc);
      const fh = (10 + Math.sin(t * 9 + i) * 2.4) * sc * flick;
      const fx = cx + Math.sin(t * 5 + i) * 1.2 * sc;
      const flame = ctx.createLinearGradient(cx, cy - 12 * sc, cx, cy - 12 * sc - fh);
      flame.addColorStop(0, "rgba(255, 240, 200, 0.95)");
      flame.addColorStop(0.5, "rgba(255, 176, 74, 0.9)");
      flame.addColorStop(1, "rgba(255, 120, 40, 0)");
      ctx.fillStyle = flame;
      ctx.beginPath();
      ctx.moveTo(cx - 3 * sc, cy - 12 * sc);
      ctx.quadraticCurveTo(fx - 3.4 * sc, cy - 12 * sc - fh * 0.55, fx, cy - 12 * sc - fh);
      ctx.quadraticCurveTo(fx + 3.4 * sc, cy - 12 * sc - fh * 0.55, cx + 3 * sc, cy - 12 * sc);
      ctx.closePath();
      ctx.fill();
    });

    // ── Rising golden embers ──
    S.embers.forEach((e) => {
      e.y -= e.sp * 0.016;
      e.x += Math.sin(t * 0.9 + e.ph) * 0.4;
      if (e.y < -10) {
        e.y = H + 10;
        e.x = Math.random() * W;
      }
      const glow = 0.4 + (Math.sin(t * 2 + e.ph) * 0.5 + 0.5) * 0.6;
      ctx.globalAlpha = glow;
      ctx.fillStyle = "rgba(255, 198, 112, 0.9)";
      ctx.beginPath();
      ctx.arc(e.x, e.y, e.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = glow * 0.4;
      ctx.beginPath();
      ctx.arc(e.x, e.y, e.r * 3, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255, 176, 74, 0.35)";
      ctx.fill();
    });
    ctx.globalAlpha = 1;

    // subtle top vignette so header text stays readable
    const vg = ctx.createLinearGradient(0, 0, 0, H);
    vg.addColorStop(0, "rgba(4, 4, 12, 0.35)");
    vg.addColorStop(0.3, "rgba(4, 4, 12, 0)");
    vg.addColorStop(1, "rgba(4, 4, 12, 0.4)");
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, W, H);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let raf = 0;
    const resize = () => {
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
      seed(canvas.width, canvas.height);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    const loop = () => {
      drawFrame(canvas);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [drawFrame, seed]);

  return (
    <canvas
      ref={canvasRef}
      className={`absolute inset-0 w-full h-full ${className}`}
      style={{ display: "block" }}
    />
  );
}
