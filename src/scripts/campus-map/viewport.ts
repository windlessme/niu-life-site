// Pan and zoom for an SVG world group: drag, wheel, pinch, double-tap and
// animated flights, with taps reported separately from drags.

import type { Box, Pt } from './data';

export interface View {
  s: number;
  tx: number;
  ty: number;
}

export interface Padding {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

export class Viewport {
  view: View = { s: 1, tx: 0, ty: 0 };
  /** Plans turn 90° clockwise when a wide building meets a tall screen. */
  rotated = false;
  private fit: View = { s: 1, tx: 0, ty: 0 };
  private content: Box = { x0: 0, y0: 0, x1: 1, y1: 1 };
  private maxZoom = 8;
  private frame = 0;
  private flight = 0;
  private pointers = new Map<number, Pt>();
  private start?: { at: Pt; time: number; view: View; moved: boolean; pinch?: { d: number; mid: Pt } };

  constructor(
    private svg: SVGSVGElement,
    private world: SVGGElement,
    private onChange: () => void,
    private onTap: (target: Element | null, at: Pt) => void,
  ) {
    svg.addEventListener('pointerdown', (e) => this.down(e));
    svg.addEventListener('pointermove', (e) => this.move(e));
    svg.addEventListener('pointerup', (e) => this.up(e));
    svg.addEventListener('pointercancel', (e) => this.up(e, true));
    svg.addEventListener('wheel', (e) => this.wheel(e), { passive: false });
    svg.addEventListener('dblclick', (e) => {
      e.preventDefault();
      this.zoomAt(this.local(e), 2, true);
    });
  }

  get size() {
    const r = this.svg.getBoundingClientRect();
    return { w: r.width, h: r.height };
  }

  /** Frames [content] in the area [pad] leaves clear; zoom stays between that and [maxZoom] times it. */
  frameTo(
    content: Box,
    pad: Padding,
    opts: { rotate?: boolean; maxZoom?: number; animate?: boolean; turnBy?: Box } = {},
  ) {
    const { w, h } = this.size;
    const room = { w: Math.max(w - pad.left - pad.right, 40), h: Math.max(h - pad.top - pad.bottom, 40) };
    const bw = content.x1 - content.x0, bh = content.y1 - content.y0;
    // Whether to turn is the whole building's call (turnBy), so every floor turns alike.
    const turn = opts.turnBy ?? content;
    this.rotated = !!opts.rotate && turn.x1 - turn.x0 > turn.y1 - turn.y0 && room.h > room.w;
    const [cw, ch] = this.rotated ? [bh, bw] : [bw, bh];
    const s = Math.min(room.w / cw, room.h / ch);
    const c: Pt = [(content.x0 + content.x1) / 2, (content.y0 + content.y1) / 2];
    const [rx, ry] = this.rot(c, s);
    this.fit = { s, tx: pad.left + room.w / 2 - rx, ty: pad.top + room.h / 2 - ry };
    this.content = content;
    this.maxZoom = opts.maxZoom ?? 8;
    this.go(this.fit, opts.animate);
  }

  /** Back to the whole view. */
  reset(animate = true) {
    this.go(this.fit, animate);
  }

  /** Centres a world point at [zoom] times the fitted scale within the clear area. */
  focus(at: Pt, zoom: number, pad: Padding) {
    const { w, h } = this.size;
    const s = this.fit.s * Math.min(zoom, this.maxZoom);
    const [rx, ry] = this.rot(at, s);
    const cx = pad.left + (w - pad.left - pad.right) / 2;
    const cy = pad.top + (h - pad.top - pad.bottom) / 2;
    this.go({ s, tx: cx - rx, ty: cy - ry }, true);
  }

  zoomBy(factor: number) {
    const { w, h } = this.size;
    this.zoomAt([w / 2, h / 2], factor, true);
  }

  toScreen(p: Pt): Pt {
    const [x, y] = this.rot(p, this.view.s);
    return [x + this.view.tx, y + this.view.ty];
  }

  /** How many screen pixels one metre is right now. */
  get scale() {
    return this.view.s;
  }

  get zoom() {
    return this.view.s / this.fit.s;
  }

  private rot([x, y]: Pt, s: number): Pt {
    return this.rotated ? [-y * s, x * s] : [x * s, y * s];
  }

  private local(e: { clientX: number; clientY: number }): Pt {
    const r = this.svg.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  }

  private clamp(v: View): View {
    const s = Math.min(Math.max(v.s, this.fit.s * 0.9), this.fit.s * this.maxZoom);
    // Keep the middle of the screen over the content.
    const { w, h } = this.size;
    const c = this.content;
    const corners = [[c.x0, c.y0], [c.x1, c.y1]].map((p) => this.rot(p as Pt, s));
    const xs = corners.map((p) => p[0]), ys = corners.map((p) => p[1]);
    const tx = Math.min(Math.max(v.tx, w / 2 - Math.max(...xs)), w / 2 - Math.min(...xs));
    const ty = Math.min(Math.max(v.ty, h / 2 - Math.max(...ys)), h / 2 - Math.min(...ys));
    return { s, tx, ty };
  }

  private set(v: View) {
    this.view = this.clamp(v);
    const { s, tx, ty } = this.view;
    this.world.setAttribute(
      'transform',
      this.rotated ? `matrix(0 ${s} ${-s} 0 ${tx} ${ty})` : `matrix(${s} 0 0 ${s} ${tx} ${ty})`,
    );
    if (!this.frame) {
      this.frame = requestAnimationFrame(() => {
        this.frame = 0;
        this.onChange();
      });
    }
  }

  private go(target: View, animate = false) {
    cancelAnimationFrame(this.flight);
    if (!animate || reduced()) {
      this.set(target);
      return;
    }
    const from = { ...this.view };
    const to = this.clamp(target);
    const t0 = performance.now();
    const step = (now: number) => {
      const t = ease(Math.min((now - t0) / 380, 1));
      // Scale moves geometrically so zooming feels even.
      const s = from.s * (to.s / from.s) ** t;
      this.set({ s, tx: from.tx + (to.tx - from.tx) * t, ty: from.ty + (to.ty - from.ty) * t });
      if (t < 1) this.flight = requestAnimationFrame(step);
    };
    this.flight = requestAnimationFrame(step);
  }

  private zoomAt([x, y]: Pt, factor: number, animate = false) {
    const v = this.view;
    const s = Math.min(Math.max(v.s * factor, this.fit.s * 0.9), this.fit.s * this.maxZoom);
    const k = s / v.s;
    this.go({ s, tx: x - (x - v.tx) * k, ty: y - (y - v.ty) * k }, animate);
  }

  private wheel(e: WheelEvent) {
    e.preventDefault();
    cancelAnimationFrame(this.flight);
    // Trackpad pinches arrive as ctrl+wheel with small deltas.
    const delta = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
    this.zoomAt(this.local(e), Math.exp(-delta * (e.ctrlKey ? 0.01 : 0.0015)));
  }

  private down(e: PointerEvent) {
    if (e.button !== 0) return;
    cancelAnimationFrame(this.flight);
    this.svg.setPointerCapture(e.pointerId);
    this.pointers.set(e.pointerId, this.local(e));
    this.begin(e.timeStamp);
  }

  private begin(time: number) {
    const pts = [...this.pointers.values()];
    const moved = this.start?.moved ?? false;
    if (pts.length >= 2) {
      const [a, b] = pts;
      this.start = {
        at: a, time, view: { ...this.view }, moved: true,
        pinch: { d: Math.hypot(a[0] - b[0], a[1] - b[1]), mid: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] },
      };
    } else if (pts.length === 1) {
      this.start = { at: pts[0], time, view: { ...this.view }, moved };
    }
  }

  private move(e: PointerEvent) {
    if (!this.pointers.has(e.pointerId) || !this.start) return;
    this.pointers.set(e.pointerId, this.local(e));
    const pts = [...this.pointers.values()];
    const st = this.start;
    if (st.pinch && pts.length >= 2) {
      const [a, b] = pts;
      const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
      const mid: Pt = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      const s = Math.min(Math.max(st.view.s * (d / st.pinch.d), this.fit.s * 0.9), this.fit.s * this.maxZoom);
      const k = s / st.view.s;
      this.set({
        s,
        tx: mid[0] - (st.pinch.mid[0] - st.view.tx) * k,
        ty: mid[1] - (st.pinch.mid[1] - st.view.ty) * k,
      });
      return;
    }
    const [x, y] = pts[0];
    const dx = x - st.at[0], dy = y - st.at[1];
    if (!st.moved && Math.hypot(dx, dy) < 6) return;
    st.moved = true;
    this.svg.classList.add('dragging');
    this.set({ s: st.view.s, tx: st.view.tx + dx, ty: st.view.ty + dy });
  }

  private up(e: PointerEvent, cancelled = false) {
    if (!this.pointers.has(e.pointerId)) return;
    this.pointers.delete(e.pointerId);
    const st = this.start;
    if (this.pointers.size) {
      this.begin(e.timeStamp);
      return;
    }
    this.svg.classList.remove('dragging');
    this.start = undefined;
    if (!cancelled && st && !st.moved && e.timeStamp - st.time < 500) {
      // The pointer was captured, so find what is under it.
      const under = document.elementFromPoint(e.clientX, e.clientY);
      this.onTap(under, this.local(e));
    }
  }
}
