// Reconstruct the live session's actual system prompt and runtime snapshot, then remove
// exactly the six frontline entries (the plugin registers nothing else) to obtain the
// "not installed" variant. Byte-level deltas and real API token counts come out of this.
import { readFileSync, writeFileSync } from 'node:fs';
const SESSION = process.env.SESSION_JSONL ?? new URL('./raw/session-excerpt.jsonl', import.meta.url);
const lines = readFileSync(SESSION, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
const plugin = JSON.parse(readFileSync(new URL('./raw/plugin-texts.json', import.meta.url), 'utf8'));

const sysMsg = lines.find((j) => j.type === 'system/message');
const withSys = sysMsg.data.message.content.map((c) => c.text).join('\n\n');
const ctxMsg = lines.find((j) => j.type === 'user/message' && j.data?.source?.kind === 'runtime-context');
const ctxSource = ctxMsg.data.source;
const sections = ctxSource.sections ?? [];
const prefix = 'Current runtime context. This snapshot supersedes earlier runtime-context snapshots.';
const snapWith = 'Current runtime context. This snapshot supersedes earlier runtime-context snapshots.\n\n' + sections.map((s) => s.text).join('\n\n');

const pluginNames = new Set(plugin.map((e) => e.name));
const kept = sections.filter((s) => !pluginNames.has(s.name));
const snapWithout = 'Current runtime context. This snapshot supersedes earlier runtime-context snapshots.\n\n' + kept.map((s) => s.text).join('\n\n');
console.log('snapshot sections:', sections.map((s) => s.name).join(', '));
console.log('removed:', sections.filter((s) => pluginNames.has(s.name)).map((s) => s.name).join(', '));

// Remove each plugin section from the rendered system message together with one separator.
let withoutSys = withSys;
for (const e of plugin.filter((x) => x.kind === 'section')) {
  const at = withoutSys.indexOf(e.text);
  if (at < 0) throw new Error(`section not found in real prompt: ${e.name}`);
  if (withoutSys.slice(at - 2, at) === '\n\n') withoutSys = withoutSys.slice(0, at - 2) + withoutSys.slice(at + e.text.length);
  else if (withoutSys.slice(at + e.text.length, at + e.text.length + 2) === '\n\n') withoutSys = withoutSys.slice(0, at) + withoutSys.slice(at + e.text.length + 2);
  else throw new Error(`no separator around ${e.name}`);
}
if (withoutSys.includes('ChatGPT-6 Astra') || withoutSys.includes('ENGINEERING DISCIPLINE')) throw new Error('residual plugin text');

const enc = new TextEncoder();
const len = (s) => [...s].length;
const out = {
  system: { with: len(withSys), without: len(withoutSys), bytesWith: enc.encode(withSys).length, bytesWithout: enc.encode(withoutSys).length },
  snapshot: { with: len(snapWith), without: len(snapWithout) },
  totalCharsWith: len(withSys) + len(snapWith),
  totalCharsWithout: len(withoutSys) + len(snapWithout),
};
out.totalDeltaChars = out.totalCharsWith - out.totalCharsWithout;
console.log(JSON.stringify(out, null, 2));
writeFileSync(new URL('./raw/real-system-without.txt', import.meta.url), withoutSys);
writeFileSync(new URL('./raw/real-snapshot-without.txt', import.meta.url), snapWithout);
writeFileSync(new URL('./raw/real-prompt-sizes.json', import.meta.url), JSON.stringify(out, null, 2));

// Token truth: the provider's own usage for the two prompt variants.
const KEY = process.env.DEEPSEEK_API_KEY;
async function count(system, snapshot) {
  const body = JSON.stringify({ model: 'deepseek-flash', max_tokens: 1, thinking: { type: 'disabled' }, system, messages: [{ role: 'user', content: snapshot }, { role: 'user', content: 'Reply with the single word: ok' }] });
  const res = await fetch('https://api.deepseek.com/anthropic/v1/messages', { method: 'POST', headers: { 'x-api-key': KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' }, body });
  const j = JSON.parse(await res.text());
  if (!res.ok) throw new Error(JSON.stringify(j).slice(0, 300));
  return j.usage.input_tokens + (j.usage.cache_read_input_tokens ?? 0) + (j.usage.cache_creation_input_tokens ?? 0);
}
const w = await count(withSys, snapWith);
const wo = await count(withoutSys, snapWithout);
console.log(`real prompt tokens: with=${w} without=${wo} delta=${w - wo}`);
writeFileSync(new URL('./raw/real-prompt-tokens.json', import.meta.url), JSON.stringify({ with: w, without: wo, delta: w - wo }, null, 2));
