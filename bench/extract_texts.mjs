// Mount the real plugin modules against a recording prompt registry.
// This exercises the plugin's real apply() path and captures exactly what it registers.
import { writeFileSync } from 'node:fs';
const base = process.env.PLUGIN_ROOT
  ?? `${process.env.DSH_PROFILE_DIR}/node_modules/@local/dsh-frontline`;
const identity = await import(base + '/src/identity.js');
const discipline = await import(base + '/src/discipline.js');

const captured = [];
const prompt = {
  section(entry) { captured.push({ kind: 'section', ...entry }); return () => {}; },
  context(entry) { captured.push({ kind: 'context', ...entry }); return () => {}; },
  getSectionOrder(name) { return name === 'FILE_REFERENCE' ? 900 : undefined; },
  getContextOrder(name) { return name === 'SUBAGENT_DELEGATION' ? 120 : undefined; },
};
const ctx = {
  systemPrompt: prompt,
  effect(fn) { return fn(); },
  logger() { return { info() {} }; },
};
identity.apply(ctx, {});
discipline.apply(ctx, {});
captured.sort((a, b) => a.order - b.order);
const enc = new TextEncoder();
let totalChars = 0, totalBytes = 0, totalCjk = 0;
for (const e of captured) {
  const c = [...e.text].length, b = enc.encode(e.text).length;
  const j = (e.text.match(/[\u4e00-\u9fff]/g) || []).length;
  totalChars += c; totalBytes += b; totalCjk += j;
  console.log(`${e.kind.padEnd(8)} ${e.name.padEnd(20)} order=${String(e.order).padEnd(6)} chars=${String(c).padStart(6)} bytes=${String(b).padStart(6)} cjk=${j}`);
}
console.log(`TOTAL entries=${captured.length} chars=${totalChars} bytes=${totalBytes} cjk=${totalCjk}`);
writeFileSync(new URL('./raw/plugin-texts.json', import.meta.url), JSON.stringify(captured, null, 2));
