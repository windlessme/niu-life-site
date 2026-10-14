// /map: the campus overview and each building's floor plans, the same data
// and the same steps as the apps' campus map. Overview → building card →
// floor plan with a floor picker, room list and search; the address keeps
// the building, floor and room so a link opens the same view.

import {
  box, buildingBox, centre, centroid, defaultFloor, details, floorTitle, isRoom, label, levels, locate,
  namedBuildings, normalize, points, searchRooms,
  type Box, type Building, type Floor, type Link, type Overview, type OverviewBuilding, type Pt, type RoomHit,
  type Space,
} from './data';
import { Viewport, type Padding } from './viewport';

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

  const viewport = new Viewport(svg, world, () => labels(), (target) => tap(target));

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
      const rank = (b: OverviewBuilding) => (b === state.picked ? 0 : b.plan ? 1 : 2);
      const order = [...texts].sort((a, b) => rank(a.b) - rank(b.b) || area(b.b) - area(a.b));
      const taken: Box[] = [];
      for (const t of order) {
        const [x, y] = viewport.toScreen(t.at);
        const w = measure(t.b.name!, 12, 700) + 4;
        const r = { x0: x - w / 2, y0: y - 9, x1: x + w / 2, y1: y + 9 };
        const fits = !taken.some((o) => r.x0 < o.x1 && r.x1 > o.x0 && r.y0 < o.y1 && r.y1 > o.y0);
        t.node.style.display = fits ? '' : 'none';
        if (!fits) continue;
        taken.push({ x0: r.x0 - 2, y0: r.y0 - 2, x1: r.x1 + 2, y1: r.y1 + 2 });
        t.node.setAttribute('x', x.toFixed(1));
        t.node.setAttribute('y', y.toFixed(1));
        t.node.textContent = t.b.name!;
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
    el('path', { d: path(f.outline), class: 'cm-slab' }, world);
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
        if (kind === 'stairs') {
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

    const rooms = f.spaces.filter((s) => (isRoom(s) || s.kind === 'restroom') && label(s)).map((s) => ({
      s, b: box(points(s)),
      code: el('text', { class: 'cm-code' }, overlay),
      name: el('text', { class: 'cm-room-name' }, overlay),
    }));
    const links = (f.links ?? []).map((l) => drawLink(l));
    labels = () => {
      for (const r of rooms) placeRoom(r);
      for (const l of links) l();
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
    for (const t of [main, r.s.code ? main.slice(1) : null]) {
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

  /** A pill reading 往… just inside its doorway, arrow pointing out. */
  function drawLink(l: Link) {
    const g = el('g', { class: 'cm-link' }, overlay);
    const pill = el('rect', { rx: 11, height: 22 }, g);
    const text = el('text', {}, g);
    text.textContent = `往${l.name}`;
    const arrow = el('path', {}, g);
    const tw = measure(text.textContent, 12, 600);
    const w = tw + 30;
    return () => {
      let [dx, dy] = l.toward;
      if (viewport.rotated) [dx, dy] = [-dy, dx];
      const n = Math.hypot(dx, dy);
      [dx, dy] = [dx / n, dy / n];
      const [ax, ay] = viewport.toScreen(l.at);
      const cx = ax - (dx * w) / 2, cy = ay - (dy * 22) / 2;
      pill.setAttribute('x', (cx - w / 2).toFixed(1));
      pill.setAttribute('y', (cy - 11).toFixed(1));
      pill.setAttribute('width', w.toFixed(1));
      text.setAttribute('x', (cx - w / 2 + 10).toFixed(1));
      text.setAttribute('y', (cy + 4.5).toFixed(1));
      const tip: Pt = [cx + w / 2 - 10 + dx * 4, cy + dy * 4];
      const bk: Pt = [tip[0] - dx * 9, tip[1] - dy * 9];
      const [sx, sy] = [-dy * 4.5, dx * 4.5];
      arrow.setAttribute('d', `M${tip[0]} ${tip[1]}L${bk[0] + sx} ${bk[1] + sy}L${bk[0] - sx} ${bk[1] - sy}Z`);
    };
  }

  function floorFrame(animate = false) {
    viewport.frameTo(buildingBox(state.building!), padding(), { rotate: true, maxZoom: 6, animate });
  }

  function focusRoom(s: Space) {
    viewport.focus(centre(box(points(s))), 2.4, padding());
  }

  // ── Selection ──────────────────────────────────────────────────────
  function highlight() {
    for (const sh of shapes) sh.el.classList.toggle('on', sh.space ? sh.space === state.room : sh.outline === state.picked);
    labels();
  }

  function tap(target: Element | null) {
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
    viewport.reset(false);
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
        setSummary(label(room)!, [`${b.name} ${floorTitle(f.id)}`, ...details(room)].join('・'), [closeButton('取消標示', () => selectRoom(undefined, false))]);
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
    const named = namedBuildings(overview);
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
      const btn = html('button', { type: 'button', class: `cm-floor${f === state.floor ? ' current' : ''}`, textContent: f.id });
      btn.setAttribute('aria-label', floorTitle(f.id));
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
}
