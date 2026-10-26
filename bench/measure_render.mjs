// Host-side cost of rendering the six registered entries the way renderPrompt does.
import { readFileSync } from 'node:fs';
const entries = JSON.parse(readFileSync(new URL('./raw/plugin-texts.json', import.meta.url), 'utf8'));
const sections = entries.filter((e) => e.kind === 'section').map((e) => e.text);
const contexts = entries.filter((e) => e.kind === 'context').map((e) => e.text);
const N = 20000;
let sink = 0;
const t0 = performance.now();
for (let i = 0; i < N; i++) {
  const prompt = sections.join('\n\n');
  const ctx = 'Current runtime context. This snapshot supersedes earlier runtime-context snapshots.\n\n' + contexts.join('\n\n');
  sink += prompt.length + ctx.length;
}
const ms = performance.now() - t0;
console.log(`renders=${N} totalMs=${ms.toFixed(1)} perRenderUs=${((ms / N) * 1000).toFixed(3)} bytes=${sink}`);
