// 奶娃追蹤 on /map: visitors' reports, read from Firestore's REST API
// (reads need no sign-in). An hour on the map, fading as they age, and the
// newest one per place; a newer 「不在這裡了」 clears the place.

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

/** Sent from a report's card when 奶娃 has left; never shown as a marker. */
export const GONE = 'gone';

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

/**
 * Still shown at [now], one per place (within 8 m on a floor or 15 m
 * outdoors), unless the newest there says 奶娃 has left.
 */
export function current(reports: NaiwaReport[], now = Date.now()) {
  const kept: NaiwaReport[] = [];
  const same = (a: NaiwaSpot, b: NaiwaSpot) =>
    a.kind === 'campus' && b.kind === 'campus'
      ? dist(a.at, b.at) < 15
      : a.kind === 'floor' && b.kind === 'floor' && a.building === b.building && a.floor === b.floor && dist(a.at, b.at) < 8;
  for (const r of [...reports].sort((a, b) => b.at - a.at))
    if (now - r.at < LIFETIME && !kept.some((k) => same(k.spot, r.spot))) kept.push(r);
  return kept.filter((r) => r.mood !== GONE);
}

/** 1 when new, .35 at the end of the hour. */
export const opacity = (r: NaiwaReport, now = Date.now()) => 1 - Math.min(Math.max((now - r.at) / LIFETIME, 0), 1) * 0.65;

export const age = (r: NaiwaReport, now = Date.now()) => {
  const m = Math.floor((now - r.at) / 60000);
  return m < 1 ? '剛剛' : `${m} 分鐘前`;
};

// ── Reporting ─────────────────────────────────────────────────────────
// Anonymous sign-in through the Identity Toolkit REST API, kept in this
// browser, then one batched write: the reporter's turn and the report,
// both stamped with the server's time as the rules require.

const API_KEY = import.meta.env.PUBLIC_NAIWA_API_KEY as string | undefined;
const SESSION = 'naiwa.session', LAST = 'naiwa.lastReport', ACCEPTED = 'naiwa.accepted';
export const PACE = 5 * 60 * 1000;
/** How long Firestore keeps a report before its TTL policy deletes it. */
const KEPT = 2 * 60 * 60 * 1000;

export const canReport = () => !!PROJECT && !!API_KEY;

const store = {
  get(key: string) {
    try { return localStorage.getItem(key); } catch { return null; }
  },
  set(key: string, value: string) {
    try { localStorage.setItem(key, value); } catch { /* private mode */ }
  },
};

export const accepted = () => store.get(ACCEPTED) === '1';
export const accept = () => store.set(ACCEPTED, '1');

/** Milliseconds until the next report is allowed, or 0. */
export function wait(now = Date.now()) {
  const last = Number(store.get(LAST) ?? 0);
  return Math.max(0, last + PACE - now);
}

interface Session { uid: string; token: string; refresh: string; expires: number }

async function session(): Promise<Session> {
  const saved = JSON.parse(store.get(SESSION) ?? 'null') as Session | null;
  if (saved && saved.expires - Date.now() > 60_000) return saved;
  let next: Session;
  if (saved?.refresh) {
    const res = await fetch(`https://securetoken.googleapis.com/v1/token?key=${API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: saved.refresh }),
    });
    if (!res.ok) {
      store.set(SESSION, 'null');
      return session();
    }
    const j = await res.json();
    next = { uid: j.user_id, token: j.id_token, refresh: j.refresh_token, expires: Date.now() + Number(j.expires_in) * 1000 };
  } else {
    const res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ returnSecureToken: true }),
    });
    if (!res.ok) throw new Error(`sign-in ${res.status}`);
    const j = await res.json();
    next = { uid: j.localId, token: j.idToken, refresh: j.refreshToken, expires: Date.now() + Number(j.expiresIn) * 1000 };
  }
  store.set(SESSION, JSON.stringify(next));
  return next;
}

const randomId = () => {
  const abc = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  return Array.from(crypto.getRandomValues(new Uint8Array(20)), (n) => abc[n % abc.length]).join('');
};

/** The report's fields on the wire, as the rules list them. */
export function wireFields(spot: NaiwaSpot, mood: string, now = Date.now()) {
  const fields: Record<string, Value> = {
    v: { integerValue: '1' },
    kind: { stringValue: spot.kind },
    x: { doubleValue: spot.at[0] },
    y: { doubleValue: spot.at[1] },
    mood: { stringValue: mood },
    expiresAt: { timestampValue: new Date(now + KEPT).toISOString() },
  };
  if (spot.kind === 'floor') {
    fields.building = { stringValue: spot.building };
    fields.floor = { stringValue: spot.floor };
    if (spot.room) fields.room = { stringValue: spot.room };
  }
  return fields;
}

export type Sent = 'sent' | 'tooSoon' | 'failed';

export async function send(spot: NaiwaSpot, mood: string): Promise<Sent> {
  if (!canReport()) return 'failed';
  if (wait() > 0) return 'tooSoon';
  try {
    const s = await session();
    const docs = `projects/${PROJECT}/databases/(default)/documents`;
    const res = await fetch(`https://firestore.googleapis.com/v1/${docs}:commit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${s.token}` },
      body: JSON.stringify({
        writes: [
          {
            update: { name: `${docs}/naiwaReporters/${s.uid}`, fields: {} },
            updateTransforms: [{ fieldPath: 'last', setToServerValue: 'REQUEST_TIME' }],
          },
          {
            update: { name: `${docs}/naiwaReports/${randomId()}`, fields: wireFields(spot, mood) },
            updateTransforms: [{ fieldPath: 'at', setToServerValue: 'REQUEST_TIME' }],
            currentDocument: { exists: false },
          },
        ],
      }),
    });
    if (res.status === 403) return 'tooSoon';
    if (!res.ok) return 'failed';
  } catch {
    return 'failed';
  }
  store.set(LAST, String(Date.now()));
  return 'sent';
}
