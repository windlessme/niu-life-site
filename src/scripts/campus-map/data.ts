// The campus map data the apps share (src/data/campus-map, copied by
// scripts/sync-campus-map.mjs): an OpenStreetMap overview and floor plans
// drawn from each building's evacuation signs, all in metres east (x) and
// south (y), north up.

export type Pt = [number, number];

export type SpaceKind = 'room' | 'corridor' | 'stairs' | 'elevator' | 'restroom' | 'void' | 'terrace';

export interface Space {
  kind: SpaceKind;
  rect?: [number, number, number, number];
  polygon?: Pt[];
  /** The school's classroom code, e.g. 工423. */
  code?: string;
  name?: string;
  note?: string;
}

export interface Link {
  to: string;
  name: string;
  at: Pt;
  toward: Pt;
}

export interface Floor {
  id: string;
  outline: Pt[];
  spaces: Space[];
  links?: Link[];
  /** Who the floor belongs to, e.g. 環境工程學系, and what people call it. */
  unit?: string;
  aliases?: string[];
}

export interface Building {
  id: string;
  name: string;
  floors: Floor[];
}

export interface OverviewBuilding {
  id: number;
  polygon: Pt[];
  campus?: boolean;
  name?: string;
  levels?: number;
  plan?: string;
  /** False for structures like 司令台: on the map and in search, not the list. */
  listed?: boolean;
}

export interface Overview {
  attribution: string;
  bounds: [number, number, number, number];
  boundary: Pt[];
  buildings: OverviewBuilding[];
  areas: { kind: 'sport' | 'green' | 'water' | 'parking'; polygon: Pt[] }[];
  roads: { kind: 'street' | 'service' | 'path'; line: Pt[]; name?: string }[];
}

export interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export function points(s: Space): Pt[] {
  if (s.rect) {
    const [x, y, w, h] = s.rect;
    return [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
  }
  return s.polygon ?? [];
}

export function box(pts: Pt[]): Box {
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
}

export const union = (a: Box, b: Box): Box => ({
  x0: Math.min(a.x0, b.x0),
  y0: Math.min(a.y0, b.y0),
  x1: Math.max(a.x1, b.x1),
  y1: Math.max(a.y1, b.y1),
});

export const centre = (b: Box): Pt => [(b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2];

/** Area-weighted centre of a polygon, where a building's name goes. */
export function centroid(poly: Pt[]): Pt {
  let a = 0, x = 0, y = 0;
  poly.forEach((p, i) => {
    const q = poly[(i + 1) % poly.length];
    const cross = p[0] * q[1] - q[0] * p[1];
    a += cross;
    x += (p[0] + q[0]) * cross;
    y += (p[1] + q[1]) * cross;
  });
  return Math.abs(a) < 1e-6 ? centre(box(poly)) : [x / (3 * a), y / (3 * a)];
}

/** Rooms are what lists, search and taps pick; toilets are only labelled. */
export const isRoom = (s: Space) => s.kind === 'room';

/** Code, else name: what a list or the plan leads with. */
export const label = (s: Space) => s.code ?? s.name;

/** The name and note under a code, or just the note under a name. */
export const details = (s: Space) => (s.code ? [s.name, s.note] : [s.note]).filter((t): t is string => !!t);

/** 'B1' → '地下 1 樓', '3F' → '3 樓'. */
export const floorTitle = (id: string) => (id.startsWith('B') ? `地下 ${id.slice(1)} 樓` : `${id.slice(0, -1)} 樓`);

/** '地上 6 層，地下 1 層'. */
export function levels(b: Building) {
  const below = b.floors.filter((f) => f.id.startsWith('B')).length;
  const above = b.floors.length - below;
  return below ? `地上 ${above} 層，地下 ${below} 層` : `地上 ${above} 層`;
}

export const defaultFloor = (b: Building) => b.floors.find((f) => f.id === '1F') ?? b.floors[0];

export function buildingBox(b: Building): Box {
  return b.floors
    .flatMap((f) => [f.outline, ...f.spaces.map(points)])
    .map(box)
    .reduce(union);
}

export interface RoomHit {
  building: Building;
  floor: Floor;
  space: Space;
}

/** Full-width forms to ASCII, whitespace dropped: '工 ４２３' → '工423'. */
export const normalize = (text: string) =>
  text.replace(/[！-～]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0)).replace(/\s/g, '');

function namesUnit(f: Floor, q: string) {
  return !!f.unit && (f.unit.includes(q) || (f.aliases ?? []).some((a) => a.includes(q) || q.includes(a)));
}

/**
 * Rooms whose code, name or note contains the query, in building and floor
 * order; a bare number matches codes ('305' → 教305), and a department's
 * name or nickname its offices ('環工' → 系辦公室). Same rules as the apps.
 */
export function searchRooms(buildings: Building[], query: string): RoomHit[] {
  const q = normalize(query);
  if (!q) return [];
  const hit = (s: Space) =>
    (!!s.code && (s.code.includes(q) || s.code.slice(1).startsWith(q))) ||
    !!s.name?.includes(q) ||
    !!s.note?.includes(q);
  const out: RoomHit[] = [];
  for (const building of buildings)
    for (const floor of building.floors)
      for (const space of floor.spaces)
        if (isRoom(space) && label(space) && (hit(space) || (space.note === floor.unit && namesUnit(floor, q))))
          out.push({ building, floor, space });
  return out;
}

/** The room a code or name names, longest match first: '工 423（BIM）'. */
export function locate(buildings: Building[], text: string): RoomHit | undefined {
  const t = normalize(text);
  let best: RoomHit | undefined;
  for (const building of buildings)
    for (const floor of building.floors)
      for (const space of floor.spaces) {
        const l = label(space);
        if (isRoom(space) && l && t.includes(l) && (!best || l.length > label(best.space)!.length))
          best = { building, floor, space };
      }
  return best;
}

/** Named campus buildings, one per name, those with floor plans first. */
export function namedBuildings(o: Overview) {
  const seen = new Set<string>();
  return o.buildings
    .filter((b) => b.campus && b.name && !seen.has(b.name) && seen.add(b.name))
    .sort((a, b) => Number(!!b.plan) - Number(!!a.plan) || a.name!.localeCompare(b.name!, 'zh-Hant'));
}
