// /map: the campus overview and each building's floor plans, the same data
// and the same steps as the apps' campus map. Overview → building card →
// floor plan with a floor picker, room list and search; the address keeps
// the building, floor and room so a link opens the same view.

import {
  box, buildingBox, centre, centroid, defaultFloor, details, floorTitle, isRoom, label, labelBox, largestBox, levels, locate, union, zoneOf, zoneText,
  namedBuildings, normalize, points, searchRooms, shortCode,
  type Box, type Building, type Floor, type Link, type Zone, type Overview, type OverviewBuilding, type Pt, type RoomHit,
  type Space,
} from './data';
import { Viewport, type Padding } from './viewport';
import { accept, accepted, age, canReport, current, fetchReports, GONE, MOODS, naiwaEnabled, opacity, send, wait, type NaiwaReport, type NaiwaSpot } from './naiwa';

const NS = 'http://www.w3.org/2000/svg';
const ORDER: Space['kind'][] = ['terrace', 'corridor', 'void', 'room', 'restroom', 'stairs', 'elevator'];
const PHONE = matchMedia('(max-width: 820px)');

function el<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number> = {}, parent?: Element) {
  const node = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  parent?.append(node);
  return node;
}

function html<K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<HTMLElementTagNameMap[K]> & { class?: string } = {}, ...children: (Node | string | null | undefined | false)[]) {
  const node = document.createElement(tag);
  const { class: cls, ...rest } = props;
  if (cls) node.className = cls;
  Object.assign(node, rest);
  for (const c of children) if (c) node.append(c);
  return node;
}

const path = (pts: Pt[], close = true) =>
  pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(2)} ${p[1].toFixed(2)}`).join('') + (close ? 'Z' : '');

/** Text widths for label fitting, measured once per font and string. */
const measure = (() => {
  const ctx = document.createElement('canvas').getContext('2d')!;
  const family = getComputedStyle(document.body).fontFamily;
  const cache = new Map<string, number>();
  return (text: string, size: number, weight = 600) => {
    const key = `${weight} ${size} ${text}`;
    let w = cache.get(key);
    if (w === undefined) {
      ctx.font = `${weight} ${size}px ${family}`;
      w = ctx.measureText(text).width;
      cache.set(key, w);
    }
    return w;
  };
})();

/** 'A（B）' → ['A', 'B'], so a name with an alias takes two short lines. */
const mapName = (name: string) => {
  const m = name.match(/^(.*?)\s*[（(]([^）)]+)[）)]\s*$/);
  return m ? [m[1], m[2]] : [name];
};

const byLabel = (a: Space, b: Space) => label(a)!.localeCompare(label(b)!, 'zh-Hant', { numeric: true });

interface State {
  building?: Building;
  floor?: Floor;
  room?: Space;
  /** The overview building picked on the map or in the list. */
  picked?: OverviewBuilding;
  query: string;
}

export async function start(root: HTMLElement) {
  const files = import.meta.glob<{ default: unknown }>('../../data/campus-map/*.json');
  const load = async (name: string) => (await files[`../../data/campus-map/${name}.json`]()).default;
  const overview = (await load('campus')) as Overview;
  const plans = [...new Set(overview.buildings.map((b) => b.plan).filter((p): p is string => !!p))];
  const buildings = (await Promise.all(plans.map(load))) as Building[];
  const plan = (id?: string) => buildings.find((b) => b.id === id);
  const outlineOf = (b: Building) => overview.buildings.find((o) => o.plan === b.id);

  const svg = root.querySelector<SVGSVGElement>('.cm-svg')!;
  const world = svg.querySelector<SVGGElement>('.cm-world')!;
  const overlay = svg.querySelector<SVGGElement>('.cm-labels')!;
  const panel = root.querySelector<HTMLElement>('.cm-panel')!;
  const head = panel.querySelector<HTMLElement>('.cm-head')!;
  const handle = panel.querySelector<HTMLButtonElement>('.cm-handle')!;
  const back = panel.querySelector<HTMLButtonElement>('.cm-back')!;
  const input = panel.querySelector<HTMLInputElement>('.cm-search')!;
  const summary = panel.querySelector<HTMLElement>('.cm-summary')!;
  const body = panel.querySelector<HTMLElement>('.cm-body')!;
  const floorsBox = root.querySelector<HTMLElement>('.cm-floors')!;
  const credit = root.querySelector<HTMLElement>('.cm-credit')!;
  credit.textContent = overview.attribution;

  const state: State = { query: '' };
  let shapes: { el: SVGElement; space?: Space; outline?: OverviewBuilding }[] = [];
  let labels: () => void = () => {};

  const viewport = new Viewport(svg, world, () => relabel(), (target, at) => tap(target, at));

  // ── Drawer (phones) ────────────────────────────────────────────────
  // The header sits outside the list, so dragging or tapping it opens and
  // closes the drawer wherever the list is scrolled.
  const peek = () => head.offsetHeight;
  const tall = () => root.clientHeight * 0.62;
  let sheetOpen = false;
  function setSheet(open: boolean, animate = true) {
    sheetOpen = open;
    panel.classList.toggle('open', open);
    panel.style.transition = animate ? '' : 'none';
    panel.style.height = PHONE.matches ? `${open ? tall() : peek()}px` : '';
    // The 奶娃 banner sits just above the closed drawer.
    root.style.setProperty('--cm-peek', `${peek()}px`);
    handle.setAttribute('aria-expanded', String(open));
    handle.setAttribute('aria-label', open ? '收合清單' : '展開清單');
  }
  handle.addEventListener('click', () => setSheet(!sheetOpen));
  {
    let drag: { y: number; h: number; moved: boolean } | undefined;
    head.addEventListener('pointerdown', (e) => {
      // Anywhere on the header drags, the search field and buttons too; a
      // press that doesn't move stays a tap.
      if (!PHONE.matches) return;
      drag = { y: e.clientY, h: panel.offsetHeight, moved: false };
    });
    head.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const dy = e.clientY - drag.y;
      if (!drag.moved && Math.abs(dy) < 6) return;
      if (!drag.moved) head.setPointerCapture(e.pointerId);
      drag.moved = true;
      panel.style.transition = 'none';
      panel.style.height = `${Math.min(Math.max(drag.h - dy, peek()), tall())}px`;
    });
    const end = (e: PointerEvent) => {
      if (!drag) return;
      const moved = drag.moved;
      const v = drag.h - (e.clientY - drag.y);
      drag = undefined;
      if (moved) {
        // The click a drag ends with is not a tap on what it ended over.
        const swallow = (ev: Event) => {
          ev.stopImmediatePropagation();
          ev.preventDefault();
        };
        head.addEventListener('click', swallow, { capture: true, once: true });
        setTimeout(() => head.removeEventListener('click', swallow, { capture: true }), 400);
        (document.activeElement as HTMLElement | null)?.blur();
        setSheet(v > (peek() + tall()) / 2);
      }
    };
    head.addEventListener('pointerup', end);
    head.addEventListener('pointercancel', end);
  }

  /** The map area the panel and controls leave clear. */
  function padding(): Padding {
    const side = state.building ? 64 : 20;
    if (PHONE.matches) return { top: 16, right: side, bottom: peek() + 16, left: 16 };
    return { top: 24, right: side + 8, bottom: 56, left: 24 };
  }

  // ── Overview ───────────────────────────────────────────────────────
  function drawOverview() {
    world.replaceChildren();
    overlay.replaceChildren();
    shapes = [];
    const [x0, y0, x1, y1] = overview.bounds;
    el('rect', { x: x0, y: y0, width: x1 - x0, height: y1 - y0, class: 'cm-ground' }, world);
    el('path', { d: path(overview.boundary), class: 'cm-campus' }, world);
    for (const a of overview.areas) el('path', { d: path(a.polygon), class: `cm-area cm-${a.kind}` }, world);
    const roads = el('g', { class: 'cm-roads' }, world);
    for (const pass of ['casing', 'fill'])
      for (const kind of ['path', 'service', 'street'] as const)
        for (const r of overview.roads)
          if (r.kind === kind && !(pass === 'casing' && kind === 'path'))
            el('path', { d: path(r.line, false), class: `cm-road cm-${kind} cm-${pass}` }, roads);
    for (const b of overview.buildings) {
      const node = el('path', {
        d: path(b.polygon),
        class: `cm-building${b.plan ? ' cm-plan' : b.campus ? ' cm-ours' : ''}`,
      }, world);
      shapes.push({ el: node, outline: b });
    }
    el('path', { d: path(overview.boundary), class: 'cm-boundary' }, world);

    const named = overview.buildings.filter((b) => b.campus && b.name);
    const texts = named.map((b) => ({ b, at: centroid(b.polygon), node: el('text', { class: 'cm-name' }, overlay) }));
    labels = () => {
      const s = viewport.scale;
      // Roads keep a readable width but never draw thinner than they are.
      root.style.setProperty('--street', `${Math.max(7, 5 * s)}px`);
      root.style.setProperty('--service', `${Math.max(3.5, 3 * s)}px`);
      root.style.setProperty('--path', `${Math.max(1.2, 1.5 * s)}px`);
      // Picked first, then buildings with plans or a name people know them
      // by (格致大樓 is 電資學院), then the rest; 司令台 and the like last.
      const rank = (b: OverviewBuilding) =>
        b === state.picked ? 0 : b.plan ? 1 : b.name!.includes('（') ? 1.5 : b.listed === false ? 3 : 2;
      const order = [...texts].sort((a, b) => rank(a.b) - rank(b.b) || area(b.b) - area(a.b));
      const taken: Box[] = [];
      const { w: vw, h: vh } = viewport.size;
      const free = (r: Box) => !taken.some((o) => r.x0 < o.x1 && r.x1 > o.x0 && r.y0 < o.y1 && r.y1 > o.y0);
      for (const t of order) {
        // A name with another in brackets stacks them: 格致大樓 / 電資學院.
        const lines = mapName(t.b.name!);
        const [x, y] = viewport.toScreen(t.at);
        const bb = screenBox(box(t.b.polygon));
        const hw = (bb.x1 - bb.x0) / 2, hh = (bb.y1 - bb.y0) / 2;
        let placed: { r: Box; size: number } | undefined;
        // On the building, else around it, then a size smaller, so the
        // crowded west side keeps its names at the whole-campus view.
        for (const size of PHONE.matches ? [11, 9.5, 8.5] : [12, 10.5, 9.5]) {
          const w = Math.max(...lines.map((l) => measure(l, size, 700))) + 4;
          const h = lines.length * size * 1.25 + 4;
          const dx = hw + w / 2, dy = hh + h / 2;
          const ring = [[0, -dy], [0, dy], [-dx, 0], [dx, 0], [dx, -dy], [-dx, -dy], [dx, dy], [-dx, dy]];
          for (const [ox, oy] of [[0, 0], ...ring]) {
            const r = { x0: x + ox - w / 2, y0: y + oy - h / 2, x1: x + ox + w / 2, y1: y + oy + h / 2 };
            const onScreen = r.x0 >= 0 && r.y0 >= 0 && r.x1 <= vw && r.y1 <= vh;
            if ((ox || oy) && !onScreen) continue;
            if (free(r)) {
              placed = { r, size };
              break;
            }
          }
          if (placed) break;
        }
        t.node.style.display = placed ? '' : 'none';
        if (!placed) continue;
        const { r, size } = placed;
        taken.push({ x0: r.x0 - 2, y0: r.y0 - 2, x1: r.x1 + 2, y1: r.y1 + 2 });
        const cx = (r.x0 + r.x1) / 2;
        t.node.style.fontSize = `${size}px`;
        t.node.replaceChildren();
        lines.forEach((l, i) => {
          el('tspan', { x: cx.toFixed(1), y: (r.y0 + 2 + size * 0.95 + i * size * 1.25).toFixed(1) }, t.node).textContent = l;
        });
        t.node.classList.toggle('on', t.b === state.picked);
        t.node.classList.toggle('planned', !!t.b.plan);
      }
    };
    highlight();
  }

  const areaCache = new Map<OverviewBuilding, number>();
  function area(b: OverviewBuilding) {
    let a = areaCache.get(b);
    if (a === undefined) {
      const bx = box(b.polygon);
      a = (bx.x1 - bx.x0) * (bx.y1 - bx.y0);
      areaCache.set(b, a);
    }
    return a;
  }

  function overviewFrame(animate = false) {
    const c = box(overview.boundary);
    viewport.frameTo({ x0: c.x0 - 60, y0: c.y0 - 60, x1: c.x1 + 60, y1: c.y1 + 60 }, padding(), { maxZoom: 10, animate });
  }

  // ── Floor plans ────────────────────────────────────────────────────
  function drawFloor(f: Floor) {
    world.replaceChildren();
    overlay.replaceChildren();
    shapes = [];
    el('path', { d: (f.outlines ?? [f.outline]).map((r) => path(r)).join(''), class: 'cm-slab' }, world);
    // A zone's floor is shaded apart from the rest.
    for (const z of f.zones ?? []) el('path', { d: path(z.polygon), class: 'cm-zone' }, world);
    const gap = 0.18;
    for (const kind of ORDER)
      for (const s of f.spaces) {
        if (s.kind !== kind) continue;
        const flat = kind === 'corridor' || kind === 'terrace';
        let node: SVGElement;
        if (s.rect && !flat) {
          const [x, y, w, h] = s.rect;
          node = el('rect', {
            x: x + gap, y: y + gap, width: Math.max(w - 2 * gap, 0.1), height: Math.max(h - 2 * gap, 0.1),
            rx: 0.45, class: `cm-space cm-${kind}`,
          }, world);
        } else {
          node = el('path', { d: path(points(s)), class: `cm-space cm-${kind}` }, world);
        }
        const bx = box(points(s));
        if (kind === 'stairs' && !s.rect) {
          // A drawn flight, maybe slanted: treads square to its longest side.
          const g = el('g', { class: 'cm-treads' }, world);
          for (const [a, b] of treads(points(s))) el('path', { d: `M${a[0]} ${a[1]}L${b[0]} ${b[1]}` }, g);
        } else if (kind === 'stairs') {
          const g = el('g', { class: 'cm-treads' }, world);
          const across = bx.x1 - bx.x0 >= bx.y1 - bx.y0;
          for (let t = (across ? bx.x0 : bx.y0) + 0.8; t < (across ? bx.x1 : bx.y1) - 0.8; t += 0.45)
            el('path', { d: across ? `M${t} ${bx.y0 + 0.5}V${bx.y1 - 0.5}` : `M${bx.x0 + 0.5} ${t}H${bx.x1 - 0.5}` }, g);
        }
        if (kind === 'elevator' || kind === 'void') {
          const m = kind === 'elevator' ? 0.4 : 0.8;
          el('path', {
            d: `M${bx.x0 + m} ${bx.y0 + m}L${bx.x1 - m} ${bx.y1 - m}M${bx.x1 - m} ${bx.y0 + m}L${bx.x0 + m} ${bx.y1 - m}`,
            class: 'cm-cross',
          }, world);
        }
        if (isRoom(s)) {
          node.classList.add('cm-pick');
          shapes.push({ el: node, space: s });
        }
      }

    // Zones' edges, dashed: a boundary, not a wall.
    for (const z of f.zones ?? []) el('path', { d: path(z.polygon), class: 'cm-zone-edge' }, world);

    const rooms = f.spaces.filter((s) => (isRoom(s) || s.kind === 'restroom') && label(s)).map((s) => ({
      s, b: labelBox(s),
      code: el('text', { class: 'cm-code' }, overlay),
      name: el('text', { class: 'cm-room-name' }, overlay),
    }));
    const links = [
      ...(f.links ?? []).map((l) => drawLink(l)),
      ...(f.zones ?? []).filter((z) => z.entrance).map((z) => drawLink({ to: '', name: '', ...z.entrance! }, '獨立入口')),
    ];
    const tags = (f.zones ?? []).map((z) => zoneTag(z, f.spaces));
    labels = () => {
      for (const r of rooms) placeRoom(r);
      for (const l of links) l();
      for (const t of tags) t();
    };
    highlight();
  }

  function screenBox(b: Box): Box {
    const [a, c] = [viewport.toScreen([b.x0, b.y0]), viewport.toScreen([b.x1, b.y1])];
    return { x0: Math.min(a[0], c[0]), y0: Math.min(a[1], c[1]), x1: Math.max(a[0], c[0]), y1: Math.max(a[1], c[1]) };
  }

  function wrap(text: string, size: number, width: number, max: number, weight = 500) {
    const lines: string[] = [];
    let line = '';
    for (const ch of text) {
      if (line && measure(line + ch, size, weight) > width) {
        lines.push(line);
        line = ch;
        if (lines.length === max) return null;
      } else line += ch;
    }
    if (line) lines.push(line);
    return lines.length <= max ? lines : null;
  }

  function placeRoom(r: { s: Space; b: Box; code: SVGTextElement; name: SVGTextElement }) {
    const sb = screenBox(r.b);
    const w = sb.x1 - sb.x0 - 6, h = sb.y1 - sb.y0 - 4;
    const [cx, cy] = [(sb.x0 + sb.x1) / 2, (sb.y0 + sb.y1) / 2];
    const on = r.s === state.room;
    const main = label(r.s)!;
    // Codes drop their building prefix when tight (工423 → 423), then shrink
    // down to 7 px, so even a cupboard-sized room keeps its number. A room
    // known only by its name wraps onto up to three lines.
    let size = 12;
    let shown: string[] | undefined;
    for (const t of [main, shortCode(r.s)]) {
      if (!t) continue;
      const k = Math.min(1, w / measure(t, 12, 700), (h - 2) / 14);
      if (k >= 1 || (t !== main && 12 * k >= 7)) {
        shown = [t];
        size = 12 * k;
        break;
      }
    }
    if (!shown && !r.s.code)
      for (let sz = 12; sz >= 7; sz *= 0.9) {
        const lines = wrap(main, sz, w, 3, 700);
        if (lines && lines.length * sz * 1.2 <= h) {
          shown = lines;
          size = sz;
          break;
        }
      }
    r.code.style.fontSize = `${size.toFixed(1)}px`;
    const sub = r.s.code && r.s.name && size >= 12 && h >= 40 ? wrap(r.s.name, 11, w, h >= 56 ? 2 : 1) : null;
    r.code.style.display = shown ? '' : 'none';
    r.name.style.display = shown && sub ? '' : 'none';
    r.code.classList.toggle('on', on);
    r.name.classList.toggle('on', on);
    if (!shown) return;
    const lines = sub ?? [];
    const head = shown.length * size * 1.2;
    const total = head + 3 + lines.length * 13;
    r.code.replaceChildren();
    shown.forEach((l, i) => {
      el('tspan', { x: cx.toFixed(1), y: (cy - total / 2 + size + i * size * 1.2).toFixed(1) }, r.code).textContent = l;
    });
    r.name.replaceChildren();
    lines.forEach((l, i) => {
      el('tspan', { x: cx.toFixed(1), y: (cy - total / 2 + head + 3 + 11 + i * 13).toFixed(1) }, r.name).textContent = l;
    });
  }

  /** A pill reading 往… just inside its doorway, arrow pointing out; one
   *  through a north or south wall reads top to bottom. */
  /** The zone's name in its largest open part, clear of rooms. Same as the app. */
  function zoneTag(z: Zone, spaces: Space[]) {
    const t = el('text', { class: 'cm-zone-tag' }, overlay);
    t.textContent = z.name;
    const free = largestBox(z.polygon, spaces.filter((s) => s.kind !== 'corridor').map(points));
    const b = free.x1 > free.x0 && free.y1 > free.y0 ? free : largestBox(z.polygon);
    return () => {
      const [x, y] = centre(screenBox(b));
      t.setAttribute('x', x.toFixed(1));
      t.setAttribute('y', (y + 4).toFixed(1));
    };
  }

  function drawLink(l: Link, label = `往${l.name}`) {
    const g = el('g', { class: 'cm-link' }, overlay);
    const pill = el('rect', {}, g);
    const text = el('text', {}, g);
    const arrow = el('path', {}, g);
    const tw = measure(label, 12, 600);
    return () => {
      let [dx, dy] = l.toward;
      if (viewport.rotated) [dx, dy] = [-dy, dx];
      const n = Math.hypot(dx, dy);
      [dx, dy] = [dx / n, dy / n];
      const upright = Math.abs(dy) > Math.abs(dx);
      const chars = [...label];
      const w = upright ? 22 : tw + 30;
      const h = upright ? chars.length * 13 + 30 : 22;
      const [ax, ay] = viewport.toScreen(l.at);
      const cx = ax - (dx * w) / 2, cy = ay - (dy * h) / 2;
      pill.setAttribute('x', (cx - w / 2).toFixed(1));
      pill.setAttribute('y', (cy - h / 2).toFixed(1));
      pill.setAttribute('width', w.toFixed(1));
      pill.setAttribute('height', h.toFixed(1));
      pill.setAttribute('rx', '11');
      text.replaceChildren();
      // Text away from the doorway, the arrow at it.
      if (upright) {
        const top = dy > 0 ? cy - h / 2 + 10 : cy - h / 2 + 24;
        chars.forEach((c, i) => {
          el('tspan', { x: cx.toFixed(1), y: (top + 10 + i * 13).toFixed(1), 'text-anchor': 'middle' }, text).textContent = c;
        });
      } else {
        el('tspan', { x: (dx > 0 ? cx - w / 2 + 10 : cx - w / 2 + 20).toFixed(1), y: (cy + 4.5).toFixed(1) }, text).textContent = label;
      }
      const end: Pt = upright ? [cx, dy > 0 ? cy + h / 2 - 10 : cy - h / 2 + 10] : [dx > 0 ? cx + w / 2 - 10 : cx - w / 2 + 10, cy];
      const tip: Pt = [end[0] + dx * 4, end[1] + dy * 4];
      const bk: Pt = [tip[0] - dx * 9, tip[1] - dy * 9];
      const [sx, sy] = [-dy * 4.5, dx * 4.5];
      arrow.setAttribute('d', `M${tip[0]} ${tip[1]}L${bk[0] + sx} ${bk[1] + sy}L${bk[0] - sx} ${bk[1] - sy}Z`);
    };
  }

  // Floors share the building's framing so rooms stay put between floors,
  // except a floor much smaller than the building, which fills the view.
  function floorFrame(animate = false) {
    const whole = buildingBox(state.building!);
    const f = state.floor!;
    const own = [...(f.outlines ?? [f.outline]), ...f.spaces.map(points)].map(box).reduce(union);
    const small = own.x1 - own.x0 < (whole.x1 - whole.x0) * 0.85 || own.y1 - own.y0 < (whole.y1 - whole.y0) * 0.85;
    viewport.frameTo(small ? own : whole, padding(), { rotate: true, maxZoom: 6, animate, turnBy: whole });
  }

  function focusRoom(s: Space) {
    viewport.focus(centre(box(points(s))), 2.4, padding());
  }

  // ── 奶娃追蹤 ───────────────────────────────────────────────────────
  // Reports over the map in screen pixels. Reporting: a disclosure the
  // first time, then a tap on the overview or a floor plan, then what
  // 奶娃 is doing.
  const naiwaLayer = root.querySelector<HTMLElement>('.cm-naiwa')!;
  const naiwaChip = root.querySelector<HTMLButtonElement>('.cm-naiwa-chip')!;
  const naiwaCard = root.querySelector<HTMLElement>('.cm-naiwa-card')!;
  const naiwaBanner = root.querySelector<HTMLElement>('.cm-naiwa-banner')!;
  let naiwa: NaiwaReport[] = [];
  /** Placing a report: the next tap on the map marks the spot. */
  let placing = false;
  let pending: NaiwaSpot | undefined;

  function relabel() {
    labels();
    placeNaiwa();
  }

  const inside = (p: Pt, poly: Pt[]) => {
    let hit = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i], [xj, yj] = poly[j];
      if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) hit = !hit;
    }
    return hit;
  };

  /** A floor report's room while the plan still has it. */
  const naiwaRoom = (r: NaiwaReport) => {
    if (r.spot.kind !== 'floor') return;
    const { room } = r.spot;
    const f = plan(r.spot.building)?.floors.find((x) => x.id === (r.spot as { floor: string }).floor);
    return room ? f?.spaces.find((s) => label(s) === room) : undefined;
  };

  function naiwaPlace(r: NaiwaReport) {
    if (r.spot.kind === 'campus') {
      const at = r.spot.at;
      return overview.buildings.find((o) => o.name && inside(at, o.polygon))?.name ?? '校園';
    }
    const b = plan(r.spot.building);
    const room = naiwaRoom(r);
    return [`${b?.name ?? r.spot.building} ${floorTitle(r.spot.floor)}`, room ? label(room) : r.spot.room].filter(Boolean).join('・');
  }

  function marker(at: Pt, r: NaiwaReport | undefined, badge?: string) {
    const [x, y] = viewport.toScreen(at);
    const btn = html('button', { type: 'button', class: r ? 'cm-paw' : 'cm-paw cm-paw-pending' });
    if (!r) btn.tabIndex = -1;
    btn.style.left = `${x}px`;
    btn.style.top = `${y}px`;
    if (r) btn.style.opacity = opacity(r).toFixed(2);
    btn.setAttribute('aria-label', r ? `奶娃${MOODS[r.mood] ?? ''}，${naiwaPlace(r)}，${age(r)}` : '要回報的位置');
    btn.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5.5" cy="10" r="2.2"/><circle cx="9.5" cy="5.8" r="2.2"/><circle cx="14.5" cy="5.8" r="2.2"/><circle cx="18.5" cy="10" r="2.2"/><path d="M12 11c-3 0-6 4.2-6 6.6 0 1.7 1.3 2.4 2.7 2.4 1.3 0 2.1-.7 3.3-.7s2 .7 3.3.7c1.4 0 2.7-.7 2.7-2.4C18 15.2 15 11 12 11z"/></svg>';
    if (badge) btn.append(html('span', { textContent: badge }));
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (r && !placing) showNaiwa(r);
    });
    naiwaLayer.append(btn);
  }

  function placeNaiwa() {
    naiwaLayer.replaceChildren();
    if (!naiwaEnabled()) return;
    drawReports();
    // The spot being reported, on top.
    const p = pending;
    if (p && (p.kind === 'campus' ? !state.building : state.building?.id === p.building && state.floor?.id === p.floor))
      marker(p.at, undefined);
  }

  function drawReports() {
    const shown = current(naiwa);
    if (state.building) {
      const b = state.building, f = state.floor!;
      for (const r of shown)
        if (r.spot.kind === 'floor' && r.spot.building === b.id && r.spot.floor === f.id) {
          const room = naiwaRoom(r);
          marker(room ? centre(labelBox(room)) : r.spot.at, r);
        }
      return;
    }
    const inBuildings = new Map<string, NaiwaReport[]>();
    for (const r of shown) {
      if (r.spot.kind === 'campus') marker(r.spot.at, r);
      else inBuildings.set(r.spot.building, [...(inBuildings.get(r.spot.building) ?? []), r]);
    }
    for (const [id, list] of inBuildings) {
      const o = overview.buildings.find((x) => x.plan === id);
      if (!o) continue;
      const floors = [...new Set(list.map((r) => (r.spot as { floor: string }).floor))];
      marker(centroid(o.polygon), list[0], floors.length > 2 ? `${floors.length} 層` : floors.join('・'));
    }
  }

  function naiwaCardShow(title: string, sub: string, actions: HTMLElement[], body: HTMLElement[] = [], onClose?: () => void) {
    naiwaCard.replaceChildren(
      html('div', { class: 'cm-naiwa-head' },
        html('div', {},
          html('p', { class: 'cm-title', textContent: title }),
          sub ? html('p', { class: 'cm-sub', textContent: sub }) : null),
        closeButton('關閉', () => {
          naiwaCard.hidden = true;
          onClose?.();
        })),
      ...body,
      ...(actions.length ? [html('div', { class: 'cm-naiwa-actions' }, ...actions)] : []),
    );
    naiwaCard.hidden = false;
  }

  function button(text: string, onClick: () => void, solid = false) {
    const b = html('button', { type: 'button', class: solid ? 'pill pill-solid' : 'pill', textContent: text });
    b.addEventListener('click', onClick);
    return b;
  }

  const say = (text: string) => html('p', { class: 'cm-naiwa-note', textContent: text });

  /** What the report sends and keeps, before the first one. */
  function disclose(then: () => void) {
    const points = [
      '這是限時功能，開放期間與內容可能隨時調整，也可能提前結束。',
      '回報時會上傳你在地圖上點的位置（校園座標，或大樓、樓層與教室）、奶娃的狀態和回報時間。不使用定位，也不需要登入。',
      '所有人都看得到回報內容，但看不出是誰回報的。',
      '為了防止洗版，網站會在這個瀏覽器建立一組 Firebase 匿名識別碼，並記錄它最後一次回報的時間，每 5 分鐘只能回報一次。',
      '回報 1 小時後不再顯示，約 2 小時後從伺服器刪除。',
      '看到奶娃時請保持距離，不要追逐或餵食。',
    ];
    naiwaCardShow('回報奶娃・限時功能', '', [
      button('同意並開始', () => {
        accept();
        then();
      }, true),
      button('暫時不要', () => { naiwaCard.hidden = true; }),
    ], [html('ul', { class: 'cm-naiwa-points' }, ...points.map((t) => html('li', { textContent: t })))]);
  }

  /** Past the disclosure and the 5-minute pace, then [go]. */
  function whenReady(go: () => void) {
    if (!accepted()) return disclose(go);
    const left = wait();
    if (left > 0) naiwaCardShow('回報奶娃', '', [], [say(`每 5 分鐘只能回報一次，請 ${Math.ceil(left / 60000)} 分鐘後再試。`)]);
    else go();
  }

  function startReport() {
    whenReady(startPlacing);
  }

  function startPlacing() {
    naiwaCard.hidden = true;
    placing = true;
    pending = undefined;
    naiwaLayer.classList.add('placing');
    naiwaBanner.hidden = false;
    naiwaBanner.querySelector('.cm-naiwa-banner-text')!.textContent = state.building
      ? `點平面圖上奶娃的位置（${floorTitle(state.floor!.id)}）`
      : '點地圖上奶娃的位置；在大樓裡的話，先點大樓進入平面圖';
    setSheet(false);
  }

  function stopPlacing() {
    placing = false;
    pending = undefined;
    naiwaLayer.classList.remove('placing');
    naiwaBanner.hidden = true;
    placeNaiwa();
  }
  naiwaBanner.querySelector('button')!.addEventListener('click', () => {
    naiwaCard.hidden = true;
    stopPlacing();
  });

  /** A tap while placing: on campus outdoors, or on the floor shown. */
  function placeAt(screen: Pt, target: Element | null) {
    const at = viewport.toWorld(screen);
    let spot: NaiwaSpot | undefined;
    if (state.building) {
      const f = state.floor!;
      const onFloor = (f.outlines ?? [f.outline]).some((r) => inside(at, r)) || f.spaces.some((s) => inside(at, points(s)));
      if (onFloor) {
        const room = f.spaces.find((s) => isRoom(s) && label(s) && inside(at, points(s)));
        spot = { kind: 'floor', building: state.building.id, floor: f.id, at, room: room ? label(room) : undefined };
      }
    } else if (inside(at, overview.boundary)) {
      // A tap on a building with plans opens them; it is likely inside.
      const node = target?.closest('.cm-building');
      const o = shapes.find((sh) => sh.el === node)?.outline;
      const b = plan(o?.plan);
      if (b) {
        openBuilding(b);
        naiwaBanner.querySelector('.cm-naiwa-banner-text')!.textContent = `點平面圖上奶娃的位置（${floorTitle(state.floor!.id)}），也可以換樓層`;
        return;
      }
      spot = { kind: 'campus', at };
    }
    if (!spot) {
      naiwaBanner.querySelector('.cm-naiwa-banner-text')!.textContent = state.building ? '請點在這層樓的範圍內' : '請點在校園範圍內';
      return;
    }
    pending = spot;
    placeNaiwa();
    askMood(spot);
  }

  function spotPlace(spot: NaiwaSpot) {
    return naiwaPlace({ id: '', spot, mood: 'here', at: Date.now() });
  }

  async function report(spot: NaiwaSpot, mood: string, thanks: string) {
    for (const b of naiwaCard.querySelectorAll('button')) b.disabled = true;
    const sent = await send(spot, mood);
    if (sent === 'sent') {
      stopPlacing();
      naiwaCardShow('已回報，謝謝你！', thanks, []);
      await refreshNaiwa();
    } else {
      naiwaCardShow('回報奶娃', spotPlace(spot), [], [say(sent === 'tooSoon' ? '每 5 分鐘只能回報一次，請稍後再試。' : '回報失敗，請檢查網路後再試一次。')], stopPlacing);
    }
  }

  function askMood(spot: NaiwaSpot) {
    const moods = Object.entries(MOODS).map(([key, text]) => button(text, () => report(spot, key, spotPlace(spot))));
    naiwaCardShow('奶娃在做什麼？', spotPlace(spot), moods, [], stopPlacing);
  }

  function showNaiwa(r: NaiwaReport) {
    const actions: HTMLElement[] = [];
    const spot = r.spot;
    if (canReport())
      actions.push(
        button('還在這裡', () => whenReady(() => askMood(r.spot)), true),
        button('不在這裡了', () => whenReady(() => report(r.spot, GONE, `${naiwaPlace(r)}的標記已從地圖移除`))),
      );
    if (spot.kind === 'floor' && state.building?.id !== spot.building) {
      const b = plan(spot.building);
      const open = html('button', { type: 'button', class: 'pill', textContent: '查看樓層平面圖' });
      open.addEventListener('click', () => {
        naiwaCard.hidden = true;
        if (b) openBuilding(b, b.floors.find((f) => f.id === spot.floor), naiwaRoom(r));
      });
      actions.push(open);
    }
    naiwaCardShow(`奶娃${MOODS[r.mood] ?? ''}`, `${naiwaPlace(r)}・${age(r)}`, actions);
  }

  function renderNaiwaChip() {
    if (!naiwaEnabled()) return;
    const n = current(naiwa).length;
    naiwaChip.hidden = false;
    naiwaChip.querySelector('.cm-naiwa-count')!.textContent = n ? `奶娃・${n}` : '奶娃追蹤';
    naiwaChip.setAttribute('aria-label', n ? `奶娃追蹤，地圖上有 ${n} 筆回報` : '奶娃追蹤');
  }
  naiwaChip.addEventListener('click', () => {
    const n = current(naiwa).length;
    naiwaCardShow('奶娃追蹤', n ? `地圖上有 ${n} 筆最近 1 小時的回報（限時功能）` : '最近 1 小時沒有回報（限時功能）',
      canReport() ? [button('回報奶娃', startReport, true)] : []);
  });

  async function refreshNaiwa() {
    if (!naiwaEnabled() || document.hidden) return;
    try {
      naiwa = await fetchReports();
    } catch {
      return; // Keep what's on the map; try again next round.
    }
    renderNaiwaChip();
    renderFloors();
    placeNaiwa();
  }
  if (naiwaEnabled()) {
    setInterval(refreshNaiwa, 60_000);
    // Older reports fade, then leave.
    setInterval(() => {
      renderNaiwaChip();
      placeNaiwa();
    }, 30_000);
    document.addEventListener('visibilitychange', refreshNaiwa);
  }

  // ── Selection ──────────────────────────────────────────────────────
  function highlight() {
    for (const sh of shapes) sh.el.classList.toggle('on', sh.space ? sh.space === state.room : sh.outline === state.picked);
    relabel();
  }

  function tap(target: Element | null, at: Pt) {
    if (placing) return placeAt(at, target);
    const node = target?.closest('.cm-pick, .cm-building');
    const sh = shapes.find((s) => s.el === node);
    if (state.building) {
      state.room = sh?.space && sh.space !== state.room ? sh.space : undefined;
      if (state.room && !label(state.room)) state.room = undefined;
      syncUrl();
    } else {
      const o = sh?.outline;
      state.picked = o && o !== state.picked && (o.campus || o.name) ? o : undefined;
    }
    highlight();
    renderPanel();
  }

  function pickOutline(o: OverviewBuilding) {
    state.picked = o;
    highlight();
    renderPanel();
    viewport.focus(centroid(o.polygon), 3, padding());
    setSheet(false);
  }

  function openBuilding(b: Building, floor?: Floor, room?: Space, push = true) {
    const entering = state.building !== b;
    state.building = b;
    state.floor = floor ?? defaultFloor(b);
    state.room = room;
    state.picked = undefined;
    if (push) syncUrl(entering);
    drawFloor(state.floor);
    renderFloors();
    renderPanel();
    floorFrame();
    if (room) requestAnimationFrame(() => focusRoom(room));
  }

  function selectFloor(f: Floor) {
    if (!state.building || f === state.floor) return;
    state.floor = f;
    state.room = undefined;
    syncUrl();
    drawFloor(f);
    renderFloors();
    renderPanel();
    floorFrame();
  }

  function selectRoom(s: Space | undefined, fly = true) {
    state.room = s;
    syncUrl();
    highlight();
    renderPanel();
    if (s && fly) focusRoom(s);
  }

  function leaveBuilding(push = true) {
    const was = state.building && outlineOf(state.building);
    state.building = state.floor = state.room = undefined;
    state.picked = was;
    if (push) syncUrl(true);
    floorsBox.hidden = true;
    credit.hidden = false;
    drawOverview();
    renderPanel();
    overviewFrame();
    if (was) viewport.focus(centroid(was.polygon), 3, padding());
  }

  function choose(hit: RoomHit) {
    clearQuery();
    setSheet(false);
    if (hit.building === state.building) {
      if (hit.floor !== state.floor) selectFloor(hit.floor);
      selectRoom(hit.space);
    } else openBuilding(hit.building, hit.floor, hit.space);
  }

  // ── Address ────────────────────────────────────────────────────────
  function syncUrl(push = false) {
    const p = new URLSearchParams();
    if (state.building) {
      p.set('b', state.building.id);
      if (state.floor) p.set('f', state.floor.id);
      if (state.room) p.set('r', label(state.room)!);
    }
    const url = `${location.pathname}${p.size ? `?${p}` : ''}`;
    if (url === `${location.pathname}${location.search}`) return;
    (push ? history.pushState : history.replaceState).call(history, null, '', url);
  }

  function applyUrl() {
    const p = new URLSearchParams(location.search);
    const b = plan(p.get('b') ?? undefined);
    const r = p.get('r');
    const hit = r ? locate(b ? [b] : buildings, r) : undefined;
    if (hit) {
      openBuilding(hit.building, hit.floor, hit.space, false);
      return;
    }
    if (b) {
      openBuilding(b, b.floors.find((f) => f.id === p.get('f')), undefined, false);
      return;
    }
    if (state.building) leaveBuilding(false);
  }
  addEventListener('popstate', applyUrl);

  // ── Panel ──────────────────────────────────────────────────────────
  function row(title: string, subtitle: string | undefined, onClick: () => void, opts: { current?: boolean; tag?: string } = {}) {
    const btn = html('button', { type: 'button', class: `cm-row${opts.current ? ' current' : ''}` },
      html('span', { class: 'cm-row-text' },
        html('span', { class: 'cm-row-title', textContent: title }),
        subtitle ? html('span', { class: 'cm-row-sub', textContent: subtitle }) : null),
      opts.tag ? html('span', { class: 'cm-tag', textContent: opts.tag }) : null);
    if (opts.current) btn.setAttribute('aria-current', 'true');
    btn.addEventListener('click', onClick);
    return btn;
  }

  function section(title: string, rows: HTMLElement[]) {
    return html('section', { class: 'cm-section' }, html('h2', { class: 'cm-eyebrow', textContent: title }), html('div', { class: 'cm-group' }, ...rows));
  }

  function setSummary(title: string, subtitle: string, actions: HTMLElement[] = []) {
    summary.replaceChildren(
      html('div', { class: 'cm-summary-text' },
        html('h1', { class: 'cm-title', textContent: title }),
        subtitle ? html('p', { class: 'cm-sub', textContent: subtitle }) : null),
      ...actions,
    );
  }

  function closeButton(label: string, onClick: () => void) {
    const b = html('button', { type: 'button', class: 'cm-icon', title: label, innerHTML: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>' });
    b.setAttribute('aria-label', label);
    b.addEventListener('click', onClick);
    return b;
  }

  function renderPanel() {
    back.hidden = !state.building;
    input.placeholder = state.building ? '搜尋教室、系所' : '搜尋大樓、教室、系所';
    if (state.query) return renderResults();

    if (state.building) {
      const b = state.building, f = state.floor!, room = state.room;
      const rooms = f.spaces.filter((s) => isRoom(s) && label(s)).sort(byLabel);
      if (room) {
        const zone = zoneOf(f, room);
        setSummary(
          label(room)!,
          [`${b.name} ${floorTitle(f.id)}`, ...details(room), ...(zone ? [zoneText(zone)] : [])].join('・'),
          [closeButton('取消標示', () => selectRoom(undefined, false))],
        );
      } else {
        setSummary(`${b.name} ${floorTitle(f.id)}`, f.unit ?? '');
      }
      body.replaceChildren(
        rooms.length
          ? section('本層教室', rooms.map((s) => row(label(s)!, details(s).join('・') || undefined, () => {
              setSheet(false);
              selectRoom(s);
            }, { current: s === room })))
          : html('p', { class: 'cm-empty', textContent: '這一層還沒有教室編號。' }),
      );
      return;
    }

    const o = state.picked;
    if (o) {
      const b = plan(o.plan);
      const open = html('button', { type: 'button', class: 'pill pill-solid cm-open', textContent: '查看樓層平面圖' });
      open.addEventListener('click', () => openBuilding(b!));
      setSummary(o.name ?? '建築', b ? levels(b) : o.levels ? `地上 ${o.levels} 層` : '還沒有樓層平面圖',
        [closeButton('關閉', () => { state.picked = undefined; highlight(); renderPanel(); })]);
      if (b) summary.append(open);
    } else {
      setSummary('國立宜蘭大學', '點選地圖上的建築，或搜尋大樓、教室與系所');
    }
    const named = namedBuildings(overview).filter((n) => n.listed !== false);
    const go = (n: OverviewBuilding) => () => {
      const b = plan(n.plan);
      if (b) openBuilding(b);
      else pickOutline(n);
    };
    body.replaceChildren(
      section('有樓層平面圖', named.filter((n) => n.plan).map((n) => row(n.name!, levels(plan(n.plan)!), go(n), { current: n === o, tag: '平面圖' }))),
      section('其他建築', named.filter((n) => !n.plan).map((n) => row(n.name!, n.levels ? `地上 ${n.levels} 層` : undefined, go(n), { current: n === o }))),
    );
  }

  function renderResults() {
    const q = normalize(state.query);
    const named = namedBuildings(overview).filter((n) => n.name!.includes(q));
    const rooms = searchRooms(buildings, q);
    const here = state.building;
    // The building you are in first.
    rooms.sort((a, b) => Number(b.building === here) - Number(a.building === here));
    setSummary(`「${state.query.trim()}」`, named.length + rooms.length ? `${named.length + rooms.length} 筆結果` : '找不到符合的大樓或教室');
    const parts: HTMLElement[] = [];
    if (named.length)
      parts.push(section('大樓', named.map((n) => row(n.name!, n.plan ? levels(plan(n.plan)!) : '還沒有樓層平面圖', () => {
        clearQuery();
        setSheet(false);
        const b = plan(n.plan);
        if (b) openBuilding(b);
        else {
          if (state.building) leaveBuilding();
          pickOutline(n);
        }
      }, { tag: n.plan ? '平面圖' : undefined }))));
    if (rooms.length)
      parts.push(section('教室', rooms.slice(0, 80).map((h) => row(label(h.space)!,
        [`${h.building.name} ${floorTitle(h.floor.id)}`, ...details(h.space)].join('・'), () => choose(h)))));
    if (!parts.length)
      parts.push(html('p', { class: 'cm-empty', textContent: '試試教室代碼（例如 工423、教305）、教室名稱或系所簡稱（例如 環工）。' }));
    body.replaceChildren(...parts);
  }

  function clearQuery() {
    state.query = '';
    input.value = '';
    input.blur();
  }

  input.addEventListener('input', () => {
    state.query = input.value;
    body.scrollTop = 0;
    renderPanel();
  });
  input.addEventListener('focus', () => setSheet(true));
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      clearQuery();
      renderPanel();
    }
    if (e.key === 'Enter') body.querySelector<HTMLButtonElement>('.cm-row')?.click();
  });
  back.addEventListener('click', () => {
    clearQuery();
    leaveBuilding();
  });

  // ── Floor picker and zoom ──────────────────────────────────────────
  function renderFloors() {
    const b = state.building;
    floorsBox.hidden = !b;
    credit.hidden = !!b;
    if (!b) return;
    floorsBox.replaceChildren(...[...b.floors].reverse().map((f) => {
      const spotted = current(naiwa).some((r) => r.spot.kind === 'floor' && r.spot.building === b.id && r.spot.floor === f.id);
      const btn = html('button', { type: 'button', class: `cm-floor${f === state.floor ? ' current' : ''}${spotted ? ' cm-spotted' : ''}`, textContent: f.id });
      btn.setAttribute('aria-label', spotted ? `${floorTitle(f.id)}，有奶娃回報` : floorTitle(f.id));
      if (f === state.floor) btn.setAttribute('aria-current', 'true');
      btn.addEventListener('click', () => selectFloor(f));
      return btn;
    }));
  }

  root.querySelector('.cm-zoom-in')!.addEventListener('click', () => viewport.zoomBy(1.6));
  root.querySelector('.cm-zoom-out')!.addEventListener('click', () => viewport.zoomBy(1 / 1.6));
  root.querySelector('.cm-fit')!.addEventListener('click', () => viewport.reset());

  // Refit when the map area changes size (rotation, panel, window).
  let last = '';
  new ResizeObserver(() => {
    const key = `${svg.clientWidth}x${svg.clientHeight}`;
    if (key === last) return;
    last = key;
    setSheet(sheetOpen, false);
    if (state.building) {
      floorFrame();
      if (state.room) focusRoom(state.room);
    } else overviewFrame();
  }).observe(svg);
  PHONE.addEventListener('change', () => setSheet(false, false));

  root.classList.add('ready');
  drawOverview();
  renderPanel();
  setSheet(false, false);
  overviewFrame();
  applyUrl();
  refreshNaiwa();
}

/** Tread lines across a polygon flight, square to its longest side and cut
 * at its walls (each line's crossings with the edges, paired up). */
function treads(ps: Pt[]): [Pt, Pt][] {
  let o = ps[0], u: Pt = [1, 0], len = 0;
  ps.forEach((a, i) => {
    const b = ps[(i + 1) % ps.length], dx = b[0] - a[0], dy = b[1] - a[1], d = Math.hypot(dx, dy);
    if (d > len) { len = d; o = a; u = [dx / d, dy / d]; }
  });
  const along = ps.map((p) => (p[0] - o[0]) * u[0] + (p[1] - o[1]) * u[1]);
  const lo = Math.min(...along), hi = Math.max(...along);
  const out: [Pt, Pt][] = [];
  for (let t = lo + 0.8; t < hi - 0.8; t += 0.45) {
    // Points where the edges cross the line at t, ordered across it.
    const hits: Pt[] = [];
    ps.forEach((a, i) => {
      const b = ps[(i + 1) % ps.length], ta = along[i], tb = along[(i + 1) % ps.length];
      if ((ta - t) * (tb - t) >= 0 && !(ta === t && tb !== t)) return;
      const k = (t - ta) / (tb - ta);
      hits.push([a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k]);
    });
    hits.sort((p, q) => (p[0] * -u[1] + p[1] * u[0]) - (q[0] * -u[1] + q[1] * u[0]));
    for (let i = 0; i + 1 < hits.length; i += 2) out.push([hits[i], hits[i + 1]]);
  }
  return out;
}
