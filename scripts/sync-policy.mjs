// Brings the app's privacy policy in as src/content/privacy.md. The policy
// lives in windlessme/niu-app-android; a sibling checkout is used when
// present, otherwise the file is downloaded from GitHub.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const local = new URL('../../niu-app-android/docs/android-privacy-policy.md', import.meta.url);
const remote =
  'https://raw.githubusercontent.com/windlessme/niu-app-android/main/docs/android-privacy-policy.md';

let text;
if (!process.env.CI && existsSync(local)) {
  text = readFileSync(local, 'utf8');
} else {
  const response = await fetch(remote);
  if (!response.ok) throw new Error(`policy download failed: ${response.status}`);
  text = await response.text();
}

// The heading and 更新日期 become frontmatter; the page lays them out itself.
const lines = text.split('\n');
const title = lines.find((l) => l.startsWith('# '))?.slice(2).trim();
const updated = lines.find((l) => l.startsWith('更新日期：'))?.trim();
if (!title || !updated) throw new Error('policy is missing its title or 更新日期 line');
const body = lines.filter((l) => !l.startsWith('# ') && !l.startsWith('更新日期：')).join('\n');
mkdirSync(new URL('../src/content/', import.meta.url), { recursive: true });
writeFileSync(
  new URL('../src/content/privacy.md', import.meta.url),
  `---\ntitle: ${JSON.stringify(title)}\nupdated: ${JSON.stringify(updated)}\n---\n${body.trimStart()}`,
);
console.log(`privacy.md ← ${process.env.CI || !existsSync(local) ? remote : local.pathname} (${updated})`);
