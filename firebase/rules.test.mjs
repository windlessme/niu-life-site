// 奶娃追蹤 rules against the Firestore emulator: npm install, then npm test.
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { readFileSync } from 'node:fs';
import { doc, collection, writeBatch, serverTimestamp, Timestamp, getDocs, query, where, orderBy, limit, getDoc, setDoc, updateDoc } from 'firebase/firestore';

const env = await initializeTestEnvironment({
  projectId: 'demo-naiwa',
  firestore: { rules: readFileSync(new URL('./firestore.rules', import.meta.url), 'utf8'), host: '127.0.0.1', port: 8080 },
});
const later = () => Timestamp.fromMillis(Date.now() + 2 * 3600e3);
function send(db, uid, data) {
  const b = writeBatch(db);
  b.set(doc(db, 'naiwaReporters', uid), { last: serverTimestamp() });
  b.set(doc(collection(db, 'naiwaReports')), { v: 1, mood: 'sleeping', at: serverTimestamp(), expiresAt: later(), ...data });
  return b.commit();
}
let n = 0;
async function check(name, p) { try { await p; console.log('ok  ', name); } catch (e) { n++; console.log('FAIL', name, e.message); } }

const a = env.authenticatedContext('alice').firestore();
const b = env.authenticatedContext('bob').firestore();
const c = env.authenticatedContext('carol').firestore();
const d = env.authenticatedContext('dave').firestore();
const e = env.authenticatedContext('erin').firestore();
const anon = env.unauthenticatedContext().firestore();

await check('campus report', assertSucceeds(send(a, 'alice', { kind: 'campus', x: 10, y: -20 })));
await check('second within 5 min denied', assertFails(send(a, 'alice', { kind: 'campus', x: 10, y: -20 })));
await check('floor report with room', assertSucceeds(send(b, 'bob', { kind: 'floor', building: 'jiaose', floor: '3F', x: 20, y: 10, room: '教305' })));
await check('unknown floor denied', assertFails(send(c, 'carol', { kind: 'floor', building: 'jiaose', floor: '9F', x: 20, y: 10 })));
await check('unknown building denied', assertFails(send(c, 'carol', { kind: 'floor', building: 'nope', floor: '1F', x: 20, y: 10 })));
await check('outside campus denied', assertFails(send(c, 'carol', { kind: 'campus', x: 9999, y: 0 })));
await check('outside building denied', assertFails(send(c, 'carol', { kind: 'floor', building: 'jiaose', floor: '1F', x: 500, y: 10 })));
await check('extra field denied', assertFails(send(c, 'carol', { kind: 'campus', x: 1, y: 1, uid: 'carol' })));
await check('campus with building denied', assertFails(send(c, 'carol', { kind: 'campus', x: 1, y: 1, building: 'jiaose' })));
await check('bad mood denied', assertFails(send(c, 'carol', { kind: 'campus', x: 1, y: 1, mood: 'angry' })));
await check('report without reporter denied', assertFails(setDoc(doc(collection(d, 'naiwaReports')), { v: 1, kind: 'campus', x: 1, y: 1, mood: 'here', at: serverTimestamp(), expiresAt: later() })));
await check('someone else\'s turn denied', assertFails(setDoc(doc(d, 'naiwaReporters', 'alice'), { last: serverTimestamp() })));
await check('signed out denied', assertFails(send(anon, 'x', { kind: 'campus', x: 1, y: 1 })));
await check('far expiry denied', assertFails(send(e, 'erin', { kind: 'campus', x: 1, y: 1, expiresAt: Timestamp.fromMillis(Date.now() + 10 * 3600e3) })));
const q = query(collection(c, 'naiwaReports'), where('at', '>', Timestamp.fromMillis(Date.now() - 3600e3)), orderBy('at', 'desc'), limit(100));
await check('list recent', assertSucceeds(getDocs(q)));
const docs = await getDocs(q); console.log('     listed', docs.size);
await check('signed out may list recent (the website)', assertSucceeds(getDocs(query(collection(anon, 'naiwaReports'), where('at', '>', Timestamp.fromMillis(Date.now() - 3600e3)), orderBy('at', 'desc'), limit(100)))));
await check('signed out list without limit denied', assertFails(getDocs(collection(anon, 'naiwaReports'))));
await check('list without limit denied', assertFails(getDocs(collection(c, 'naiwaReports'))));
await check('read others\' turn denied', assertFails(getDoc(doc(c, 'naiwaReporters', 'alice'))));
await check('update report denied', assertFails(updateDoc(docs.docs[0].ref, { mood: 'here' })));
await env.cleanup();
process.exit(n ? 1 : 0);
