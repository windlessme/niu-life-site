// 奶娃追蹤 on /map: the reports students send from the NIU-Life app, read
// from Firestore's REST API (reads need no sign-in; only the app writes).
// Same rules as the app: an hour on the map, fading as they age, and the
// newest one per place.

import type { Pt } from './data';

/** Set by the deploy workflow; without it the layer stays off. */
const PROJECT = import.meta.env.PUBLIC_NAIWA_PROJECT as string | undefined;

export const LIFETIME = 60 * 60 * 1000;

export const MOODS: Record<string, string> = {
  here: '就在這裡',
  sleeping: '在睡覺',
  walking: '在散步',
  eating: '在吃東西',
};

export type NaiwaSpot =
  | { kind: 'campus'; at: Pt }
  | { kind: 'floor'; building: string; floor: string; at: Pt; room?: string };

export interface NaiwaReport {
  id: string;
  spot: NaiwaSpot;
  mood: string;
  at: number;
}

export const naiwaEnabled = () => !!PROJECT;

type Value = { stringValue?: string; doubleValue?: number; integerValue?: string; timestampValue?: string };

function parse(name: string, f: Record<string, Value>): NaiwaReport | undefined {
  const num = (v?: Value) => (v?.doubleValue ?? (v?.integerValue !== undefined ? Number(v.integerValue) : undefined));
  const x = num(f.x), y = num(f.y);
  const at = f.at?.timestampValue ? Date.parse(f.at.timestampValue) : NaN;
  if (x === undefined || y === undefined || Number.isNaN(at)) return;
  const kind = f.kind?.stringValue;
  let spot: NaiwaSpot;
  if (kind === 'campus') spot = { kind, at: [x, y] };
  else if (kind === 'floor' && f.building?.stringValue && f.floor?.stringValue)
    spot = { kind, building: f.building.stringValue, floor: f.floor.stringValue, at: [x, y], room: f.room?.stringValue };
  else return;
  return { id: name.split('/').pop()!, spot, mood: f.mood?.stringValue ?? 'here', at };
}

/** Reports from the last hour, newest first. */
export async function fetchReports(now = Date.now()): Promise<NaiwaReport[]> {
  if (!PROJECT) return [];
  const res = await fetch(`https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents:runQuery`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: 'naiwaReports' }],
        where: { fieldFilter: { field: { fieldPath: 'at' }, op: 'GREATER_THAN', value: { timestampValue: new Date(now - LIFETIME).toISOString() } } },
        orderBy: [{ field: { fieldPath: 'at' }, direction: 'DESCENDING' }],
        limit: 100,
      },
    }),
  });
  if (!res.ok) throw new Error(`naiwa ${res.status}`);
  const rows = (await res.json()) as { document?: { name: string; fields: Record<string, Value> } }[];
  return rows.flatMap((r) => (r.document ? parse(r.document.name, r.document.fields) ?? [] : []));
}

const dist = (a: Pt, b: Pt) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/** Still shown at [now], one per place: within 8 m on a floor or 15 m outdoors. */
export function current(reports: NaiwaReport[], now = Date.now()) {
  const kept: NaiwaReport[] = [];
  const same = (a: NaiwaSpot, b: NaiwaSpot) =>
    a.kind === 'campus' && b.kind === 'campus'
      ? dist(a.at, b.at) < 15
      : a.kind === 'floor' && b.kind === 'floor' && a.building === b.building && a.floor === b.floor && dist(a.at, b.at) < 8;
  for (const r of [...reports].sort((a, b) => b.at - a.at))
    if (now - r.at < LIFETIME && !kept.some((k) => same(k.spot, r.spot))) kept.push(r);
  return kept;
}

/** 1 when new, .35 at the end of the hour. */
export const opacity = (r: NaiwaReport, now = Date.now()) => 1 - Math.min(Math.max((now - r.at) / LIFETIME, 0), 1) * 0.65;

export const age = (r: NaiwaReport, now = Date.now()) => {
  const m = Math.floor((now - r.at) / 60000);
  return m < 1 ? '剛剛' : `${m} 分鐘前`;
};
