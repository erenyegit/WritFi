"use client";

import { useEffect, useRef } from "react";

import { useReducedMotion } from "./useMotion";

/** Smiles (expiries) from front to back, and samples along each. */
const CURVES = 38;
const POINTS = 150;
/** Seconds for the surface to rise, back row first. */
const RISE = 0.9;
const STAGGER = 0.03;
/** Opacity steps a line is cut into where it fades out behind text. */
const STEPS = 5;

/**
 * Implied volatility across moneyness `m` (−1 deep in the money for puts,
 * +1 for calls) at tenor `tau` (0 the nearest Friday, 1 the furthest),
 * scaled to roughly 0…0.8. A smile with a put skew that flattens with time,
 * moving slowly as if the market were breathing. It is the shape the desk
 * prices every option on.
 */
function smile(m: number, tau: number, t: number) {
  const wings = 0.55 * m * m * (1 - 0.4 * tau);
  const skew = m < 0 ? -m * 0.14 * (1 - 0.5 * tau) : 0;
  const breathe = 0.06 * Math.sin(2.4 * m + 3.2 * tau + t * 0.45) + 0.035 * Math.sin(5.2 * tau - t * 0.3 + m * 1.3);
  return 0.06 + wings + skew + breathe * (0.55 + 0.45 * tau);
}

/**
 * The page's backdrop, one fixed canvas behind everything. Under the element
 * marked `data-backdrop-anchor` (the early access pass, the coming soon card)
 * a volatility surface is engraved in fine lines, the way a plate is drawn
 * for print: one smile per expiry receding into depth, each nearer ridge
 * hiding what lies behind it, the card floating over the valley floor. It
 * rises row by row when the page opens, then breathes and sways slowly.
 * Behind text marked `data-backdrop-avoid` its lines fade out.
 *
 * Nothing follows the pointer. With reduced motion it draws one still frame;
 * in a hidden tab it stops.
 */
export function Backdrop() {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const lineProbe = useRef<HTMLSpanElement>(null);
  const paperProbe = useRef<HTMLSpanElement>(null);
  const reduced = useReducedMotion();

  useEffect(() => {
    const box = wrap.current;
    const cv = canvas.current;
    if (!box || !cv) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;

    let vw = 0;
    let vh = 0;
    let dpr = 1;
    let line = "#243EB0";
    let paper = "#F5F6F8";
    let dark = false;

    // One ridge at a time: its screen points, where its own floor lies, and how far it fades.
    const xs = new Float32Array(POINTS);
    const ys = new Float32Array(POINTS);
    const bx = new Float32Array(POINTS);
    const by = new Float32Array(POINTS);
    const fade = new Float32Array(POINTS);

    let anchor: HTMLElement | null = null;
    let avoidEl: HTMLElement | null = null;
    let born = 0;
    let raf = 0;
    let running = false;
    let frame = 0;
    let blank = true;

    const readColours = () => {
      if (lineProbe.current) line = getComputedStyle(lineProbe.current).color || line;
      if (paperProbe.current) paper = getComputedStyle(paperProbe.current).color || paper;
      const [r = 255, g = 255, b = 255] = (paper.match(/\d+/g) ?? []).map(Number);
      dark = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 < 0.5;
    };

    const size = () => {
      vw = window.innerWidth;
      vh = window.innerHeight;
      dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      cv.width = Math.round(vw * dpr);
      cv.height = Math.round(vh * dpr);
      cv.style.width = `${vw}px`;
      cv.style.height = `${vh}px`;
    };

    const avoidRect = () => {
      if (!avoidEl || !avoidEl.isConnected) return null;
      const a = avoidEl.getBoundingClientRect();
      return { left: a.left - 20, right: a.right + 20, top: a.top - 16, bottom: a.bottom + 16 };
    };

    const findAnchor = (now: number) => {
      avoidEl = document.querySelector<HTMLElement>("[data-backdrop-avoid]");
      const next = document.querySelector<HTMLElement>("[data-backdrop-anchor]");
      // A new page, a new rise.
      if (next !== anchor) born = now;
      anchor = next;
    };

    const step = (a: number) => Math.max(0, Math.min(STEPS, Math.round(a * STEPS)));

    const drawSurface = (now: number) => {
      if (!anchor || !anchor.isConnected) return false;
      const r = anchor.getBoundingClientRect();
      const Wd = Math.max(900, vw * 1.35);
      const D = Wd * 0.55;
      const Hs = Math.min(300, Math.max(150, vh * 0.3));
      // The valley opens across the page, its floor just under the anchor.
      const cx = vw / 2;
      const floor = r.bottom + Math.min(120, Math.max(60, r.height * 0.4));
      if (floor + 200 < 0 || floor - D > vh + 200) return false;

      const t = (now - born) / 1000;
      const pitch = 0.55;
      const cP = Math.cos(pitch);
      const sP = Math.sin(pitch);
      const yaw = 0.12 * Math.sin(t * 0.07);
      const cY = Math.cos(yaw);
      const sY = Math.sin(yaw);
      const F = Wd * 1.5;
      const avoid = avoidRect();
      const ink = dark ? 0.5 : 0.62;

      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.strokeStyle = line;
      ctx.fillStyle = paper;

      // Back to front, so every ridge covers the lines it stands in front of.
      for (let c = CURVES - 1; c >= 0; c--) {
        const tau = c / (CURVES - 1);
        const k = Math.min(1, Math.max(0, (t - (CURVES - 1 - c) * STAGGER) / RISE));
        const rise = 1 - Math.pow(1 - k, 3);
        if (rise <= 0) continue;
        const zc = tau * D - D / 2;
        for (let j = 0; j < POINTS; j++) {
          const m = -1 + (2 * j) / (POINTS - 1);
          const h = smile(m, tau, t) * rise;
          const X = (m * Wd) / 2;
          const X1 = X * cY - zc * sY;
          const Z1 = X * sY + zc * cY + D / 2;
          const persp = F / (F + Z1 * cP);
          const sx = cx + X1 * persp;
          xs[j] = sx;
          ys[j] = floor + (-h * Hs * cP - Z1 * sP) * persp;
          bx[j] = sx;
          by[j] = floor - Z1 * sP * persp;
          let f = 1;
          if (avoid) {
            const dx = Math.max(avoid.left - sx, 0, sx - avoid.right);
            const dy = Math.max(avoid.top - ys[j], 0, ys[j] - avoid.bottom);
            f = Math.min(1, Math.hypot(dx, dy) / 64);
          }
          fade[j] = f;
        }

        // Paper between the ridge and its own floor hides the farther rows behind it.
        ctx.globalAlpha = 1;
        ctx.beginPath();
        ctx.moveTo(xs[0], ys[0]);
        for (let j = 1; j < POINTS; j++) ctx.lineTo(xs[j], ys[j]);
        for (let j = POINTS - 1; j >= 0; j--) ctx.lineTo(bx[j], by[j] + 1);
        ctx.closePath();
        ctx.fill();

        // The ridge: nearer rows darker and a little heavier, cut into runs where it fades.
        const depth = (1 - 0.8 * tau) * rise * ink;
        ctx.lineWidth = 0.5 + 0.7 * (1 - tau);
        let from = 0;
        let level = step(fade[0]);
        for (let j = 1; j <= POINTS; j++) {
          const next = j < POINTS ? step(fade[j]) : -1;
          if (next === level) continue;
          const to = Math.min(j, POINTS - 1);
          if (level > 0 && to > from) {
            ctx.globalAlpha = depth * (level / STEPS);
            ctx.beginPath();
            ctx.moveTo(xs[from], ys[from]);
            for (let q = from + 1; q <= to; q++) ctx.lineTo(xs[q], ys[q]);
            ctx.stroke();
          }
          from = to;
          level = next;
        }
      }
      ctx.globalAlpha = 1;
      return true;
    };

    const render = (now: number) => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, vw, vh);
      blank = !drawSurface(now);
    };

    const tick = (now: number) => {
      if (!running) return;
      raf = requestAnimationFrame(tick);
      if (frame++ % 30 === 0) {
        readColours();
        findAnchor(now);
      }
      // No surface on this page: clear once, then only keep looking for one.
      if (!anchor) {
        if (!blank) render(now);
        return;
      }
      render(now);
    };

    const start = () => {
      if (running || reduced || document.hidden) return;
      running = true;
      raf = requestAnimationFrame(tick);
    };
    const stop = () => {
      running = false;
      cancelAnimationFrame(raf);
    };

    // One still frame, risen, for reduced motion.
    const still = () => {
      readColours();
      findAnchor(performance.now());
      born = performance.now() - 8000;
      render(performance.now());
    };
    let stillQueued = 0;
    const queueStill = () => {
      if (!reduced || stillQueued) return;
      stillQueued = requestAnimationFrame(() => {
        stillQueued = 0;
        still();
      });
    };

    size();
    readColours();
    if (reduced) still();
    else start();

    const onResize = () => {
      size();
      queueStill();
    };
    window.addEventListener("resize", onResize);
    // In reduced motion the still frame follows the anchor as the page scrolls
    // or its layout shifts (an account loading above it, say).
    window.addEventListener("scroll", queueStill, { passive: true });
    const layout = new ResizeObserver(queueStill);
    layout.observe(document.body);
    const onVisibility = () => (document.hidden ? stop() : start());
    document.addEventListener("visibilitychange", onVisibility);
    const themeWatch = new MutationObserver(() => {
      readColours();
      queueStill();
    });
    themeWatch.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

    return () => {
      stop();
      cancelAnimationFrame(stillQueued);
      themeWatch.disconnect();
      layout.disconnect();
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", queueStill);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [reduced]);

  return (
    <div ref={wrap} aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10">
      <canvas ref={canvas} className="block" />
      <span ref={lineProbe} className="hidden text-[rgb(var(--heat))]" />
      <span ref={paperProbe} className="hidden text-paper" />
    </div>
  );
}
