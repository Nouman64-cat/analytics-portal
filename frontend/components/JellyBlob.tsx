"use client";

import { useEffect, useRef } from "react";
import { Jelly, SAMPLES, STEP } from "./jellyPhysics";

/* Squishy stress-relief jelly for the login page — grab, stretch, fling, poke.
   Physics live in ./jellyPhysics; this component handles sizing, input and drawing. */

export default function JellyBlob({ onSquish }: { onSquish?: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const onSquishRef = useRef(onSquish);

  useEffect(() => {
    onSquishRef.current = onSquish;
  }, [onSquish]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let w = 0;
    let h = 0;
    let jelly: Jelly | null = null;
    const hover = { x: 0, y: 0, inside: false, t: 0 };
    let press: { x: number; y: number; t: number } | null = null;
    let nextBlink = performance.now() + 2500;
    let blinkUntil = 0;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = rect.width;
      h = rect.height;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const R = Math.max(60, Math.min(140, Math.min(w, h) * 0.19));
      if (!jelly) jelly = new Jelly(R, w / 2, Math.min(h * 0.3, h - R - 60));
      jelly.R = R;
      jelly.bounds = { w, h, floor: h - 28, pad: 4 };
      jelly.x = Math.min(Math.max(jelly.x, R), w - R);
      jelly.y = Math.min(jelly.y, h - 28 - R);
    };

    const draw = (now: number) => {
      if (!jelly) return;
      const j = jelly;
      const { R } = j;
      ctx.clearRect(0, 0, w, h);

      let minX = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (let k = 0; k < SAMPLES; k++) {
        minX = Math.min(minX, j.px[k]);
        maxX = Math.max(maxX, j.px[k]);
        maxY = Math.max(maxY, j.py[k]);
      }

      // Floor shadow — fades and shrinks as the jelly rises.
      const floor = j.bounds.floor;
      const lift = Math.max(0, floor - maxY);
      const shadowAlpha = Math.max(0, 0.22 - lift / 1400);
      const shadowW = ((maxX - minX) / 2) * Math.max(0.4, 1 - lift / 800);
      if (shadowAlpha > 0) {
        ctx.fillStyle = `rgba(190, 80, 130, ${shadowAlpha})`;
        ctx.beginPath();
        ctx.ellipse((minX + maxX) / 2, floor + 6, shadowW, 9, 0, 0, Math.PI * 2);
        ctx.fill();
      }

      // Body: smooth closed curve through the surface samples.
      ctx.beginPath();
      const L = SAMPLES - 1;
      ctx.moveTo((j.px[L] + j.px[0]) / 2, (j.py[L] + j.py[0]) / 2);
      for (let k = 0; k < SAMPLES; k++) {
        const n = (k + 1) % SAMPLES;
        ctx.quadraticCurveTo(j.px[k], j.py[k], (j.px[k] + j.px[n]) / 2, (j.py[k] + j.py[n]) / 2);
      }
      ctx.closePath();
      const g = ctx.createRadialGradient(j.x - R * 0.35, j.y - R * 0.45, R * 0.1, j.x, j.y, R * 1.35);
      g.addColorStop(0, "#ffe3ee");
      g.addColorStop(0.45, "#ffa8c9");
      g.addColorStop(1, "#f06a9e");
      ctx.fillStyle = g;
      ctx.shadowColor = "rgba(240, 106, 158, 0.35)";
      ctx.shadowBlur = 30;
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.lineWidth = 2;
      ctx.strokeStyle = "rgba(214, 70, 128, 0.35)";
      ctx.stroke();

      // Face + gloss ride along with the body's spin and squash.
      const sq = j.squash();
      ctx.save();
      ctx.translate(j.x, j.y);
      ctx.rotate(j.ang);
      ctx.scale(1 + sq * 0.9, 1 - sq * 0.9);

      ctx.fillStyle = "rgba(255, 255, 255, 0.6)";
      ctx.beginPath();
      ctx.ellipse(-R * 0.38, -R * 0.5, R * 0.2, R * 0.1, -0.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(-R * 0.12, -R * 0.66, R * 0.045, 0, Math.PI * 2);
      ctx.fill();

      if (now > nextBlink) {
        blinkUntil = now + 130;
        nextBlink = now + 2500 + Math.random() * 3500;
      }
      const blinking = now < blinkUntil;
      const squished = j.strain() > 0.12 || j.grab !== null;

      // Pupils glance toward the cursor (in the rotated face frame).
      const dx = hover.x - j.x;
      const dy = hover.y - j.y;
      const lx = dx * Math.cos(-j.ang) - dy * Math.sin(-j.ang);
      const ly = dx * Math.sin(-j.ang) + dy * Math.cos(-j.ang);
      const ld = Math.hypot(lx, ly) || 1;
      const look = hover.inside ? Math.min(1, ld / (R * 2)) * R * 0.035 : 0;
      const ox = (lx / ld) * look;
      const oy = (ly / ld) * look;

      const eyeY = -R * 0.08;
      const eyeR = R * 0.075;
      ctx.fillStyle = "#4a1f38";
      ctx.strokeStyle = "#4a1f38";
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.lineWidth = Math.max(2.5, R * 0.035);
      for (const sx of [-1, 1]) {
        const ex = sx * R * 0.28;
        if (squished) {
          // happy squint: ^ ^
          ctx.beginPath();
          ctx.moveTo(ex - eyeR, eyeY + eyeR * 0.4);
          ctx.lineTo(ex, eyeY - eyeR * 0.6);
          ctx.lineTo(ex + eyeR, eyeY + eyeR * 0.4);
          ctx.stroke();
        } else if (blinking) {
          ctx.beginPath();
          ctx.moveTo(ex - eyeR, eyeY);
          ctx.lineTo(ex + eyeR, eyeY);
          ctx.stroke();
        } else {
          ctx.beginPath();
          ctx.ellipse(ex + ox, eyeY + oy, eyeR, eyeR * 1.15, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = "#fff";
          ctx.beginPath();
          ctx.arc(ex + ox - eyeR * 0.3, eyeY + oy - eyeR * 0.4, eyeR * 0.32, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = "#4a1f38";
        }
      }

      ctx.fillStyle = "rgba(255, 110, 150, 0.45)";
      for (const sx of [-1, 1]) {
        ctx.beginPath();
        ctx.ellipse(sx * R * 0.46, R * 0.1, R * 0.1, R * 0.06, 0, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.fillStyle = "#4a1f38";
      ctx.beginPath();
      if (squished) {
        ctx.ellipse(0, R * 0.16, R * 0.07, R * 0.09, 0, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.arc(0, R * 0.08, R * 0.1, 0.15 * Math.PI, 0.85 * Math.PI);
        ctx.stroke();
      }
      ctx.restore();
    };

    const toLocal = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };

    const onDown = (e: PointerEvent) => {
      if (!jelly) return;
      const { x, y } = toLocal(e);
      if (!jelly.contains(x, y, 24)) return;
      canvas.setPointerCapture(e.pointerId);
      jelly.startGrab(x, y);
      press = { x, y, t: performance.now() };
      hover.t = press.t;
      canvas.style.cursor = "grabbing";
    };

    const onMove = (e: PointerEvent) => {
      const { x, y } = toLocal(e);
      const now = performance.now();
      if (jelly?.grab) {
        const dt = Math.max(1, now - hover.t) / 1000;
        const p = jelly.pointer;
        // smoothed pointer velocity, so a flick carries into the throw
        p.vx = p.vx * 0.5 + ((x - p.x) / dt) * 0.5;
        p.vy = p.vy * 0.5 + ((y - p.y) / dt) * 0.5;
        p.x = x;
        p.y = y;
      } else if (jelly) {
        canvas.style.cursor = jelly.contains(x, y, 24) ? "grab" : "default";
      }
      hover.x = x;
      hover.y = y;
      hover.inside = true;
      hover.t = now;
    };

    const onUp = (e: PointerEvent) => {
      if (!jelly?.grab || !press) return;
      const { x, y } = toLocal(e);
      const tap = Math.hypot(x - press.x, y - press.y) < 6 && performance.now() - press.t < 250;
      jelly.grab = null;
      if (tap) jelly.poke(x, y);
      press = null;
      canvas.style.cursor = jelly.contains(x, y, 24) ? "grab" : "default";
      onSquishRef.current?.();
    };

    const onLeave = () => {
      hover.inside = false;
    };

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointercancel", onUp);
    canvas.addEventListener("pointerleave", onLeave);

    let raf = 0;
    let prev = performance.now();
    let acc = 0;
    const frame = (now: number) => {
      acc += Math.min(0.05, (now - prev) / 1000);
      prev = now;
      while (acc >= STEP) {
        jelly?.step();
        acc -= STEP;
      }
      draw(now);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointercancel", onUp);
      canvas.removeEventListener("pointerleave", onLeave);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full touch-none select-none"
      aria-label="Squishy jelly — drag to stretch and fling it"
      role="img"
    />
  );
}
