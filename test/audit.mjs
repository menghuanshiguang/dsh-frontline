/**
 * Profile audit: is this row actually composed into a profile, and would a
 * profile-level whitelist silently drop part of it?
 *
 * A prompt plugin fails in a way nothing else catches: it registers fine, the
 * process starts fine, and then a `keepSections` whitelist in some OTHER row
 * filters the text out at assembly time — no error, no log, just a model that
 * never saw the layer. `dsh plugin add` cannot check this either: it edits
 * `package.json`, not the patch that overrides the prompt.
 *
 * So this test reads the installed profile as data:
 *
 *   1. dependency + bundle — both present, and the `link:`/path target exists
 *   2. keepSections coverage — every row that whitelists sections either names
 *      all six layers or is inert (not composed from a bundle); a live row that
 *      would drop a layer is the one failure mode worth blocking on
 *   3. stale names — a whitelist entry from an older generation (`astra:*`) is a
 *      rename that has not been applied to this profile yet
 *
 * Run: node test/audit.mjs [profile ...]   (default: every profile found)
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const PACKAGE = '@local/dsh-frontline';
const ROW_ID = 'frontline';
/** The four section names are ABI: a profile patch lists them literally in `keepSections`. */
const SECTIONS = ['identity:head', 'identity:core', 'discipline:head', 'discipline:core'];
/** Context anchors are not filterable by `keepSections`; they are audited for reporting only. */
const CONTEXTS = ['identity:runtime', 'discipline:runtime'];

const profilesRoot = path.join(os.homedir(), '.dsh', 'profiles');

const listProfiles = () => {
  const requested = process.argv.slice(2);
  let found = [];
  try {
    found = readdirSync(profilesRoot).filter((entry) => {
      const dir = path.join(profilesRoot, entry);
      return statSync(dir).isDirectory() && existsSync(path.join(dir, 'package.json'));
    });
  } catch {
    found = [];
  }
  return requested.length ? requested.filter((name) => found.includes(name)) : found;
};

/** Strip comments so a commented-out row is not read as live config. */
const stripComments = (text) =>
  text
    .split(/\r?\n/)
    .filter((line) => !/^\s*#/.test(line))
    .join('\n');

/** Cut the patch into `- id:` rows, each with the keys that follow it. */
function parseRows(text) {
  const lines = stripComments(text).split(/\r?\n/);
  const rows = [];
  for (let index = 0; index < lines.length; index += 1) {
    const match = /^(\s*)- id:\s*(\S+)\s*$/.exec(lines[index]);
    if (!match) continue;
    const indent = match[1].length;
    const row = { id: match[2], line: index + 1, name: undefined, disabled: false, keepSections: undefined };
    for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
      const line = lines[cursor];
      if (line.trim() === '') continue;
      const lineIndent = line.length - line.trimStart().length;
      if (lineIndent <= indent && /^\s*-/.test(line)) break;
      const hit = (pattern) => pattern.exec(line);
      const name = hit(/^\s*name:\s*['"]?([^'"\s]+)['"]?/);
      if (name && row.name === undefined) row.name = name[1];
      if (/^\s*disabled:\s*true/.test(line)) row.disabled = true;
      const inline = hit(/^\s*keepSections:\s*\[(.*)\]/);
      if (inline) {
        row.keepSections = inline[1]
          .split(',')
          .map((item) => item.trim().replace(/^['"]|['"]$/g, ''))
          .filter(Boolean);
      } else if (/^\s*keepSections:\s*$/.test(line)) {
        const list = [];
        for (let inner = cursor + 1; inner < lines.length; inner += 1) {
          const item = /^\s*-\s*([^\s#]+)/.exec(lines[inner]);
          if (!item) break;
          list.push(item[1].replace(/^['"]|['"]$/g, ''));
        }
        row.keepSections = list;
      }
    }
    rows.push(row);
  }
  return rows;
}

const baseName = (spec) => spec.replace(/^@[^/]+\//, '').replace(/\/.*$/, '');

/** A row is live only when its target is composed from a bundle AND it is not disabled.
 *
 * A row may carry no `name:` at all — it then patches whichever bundle row has
 * that id, which is the common shape (`- id: claudecode-prompt` overriding a
 * package the bundle already composes), so the id is the fallback target.
 */
function describeRow(row, bundles) {
  const base = row.name ? baseName(row.name) : row.id;
  if (!bundles.includes(base) && !bundles.includes(row.name ?? '')) {
    return { live: false, reason: `not composed (no "${base}" in dsh.profile.bundles)` };
  }
  if (row.disabled) return { live: false, reason: 'disabled in this patch' };
  return { live: true, reason: 'live' };
}

const findings = [];
const report = (level, profile, message) => findings.push({ level, profile, message });

function auditProfile(profile) {
  const dir = path.join(profilesRoot, profile);
  const manifest = JSON.parse(readFileSync(path.join(dir, 'package.json'), 'utf8'));
  const dependencies = manifest.dependencies ?? {};
  const bundles = manifest.dsh?.profile?.bundles ?? [];
  const patchPath = path.join(dir, 'cordis.patch.yml');
  const patch = existsSync(patchPath) ? readFileSync(patchPath, 'utf8') : '';
  const rows = parseRows(patch);

  /* 1. dependency + bundle + the target the link points at */
  const spec = dependencies[PACKAGE];
  if (!spec) {
    report('INFO', profile, `${PACKAGE} is not installed in this profile`);
  } else {
    if (!bundles.includes(PACKAGE)) {
      report('FAIL', profile, `${PACKAGE} is a dependency but missing from dsh.profile.bundles — it will never load`);
    }
    if (spec.startsWith('link:')) {
      const target = spec.slice('link:'.length);
      if (!existsSync(target)) {
        report('FAIL', profile, `${PACKAGE} links to a missing path: ${target}`);
      }
    }
    const inserts = rows.filter((row) => row.id === ROW_ID);
    if (!inserts.length) {
      // The package's own bundle patch supplies the insert, so a profile usually
      // has no row for it. Only worth saying, not worth failing.
      report('INFO', profile, `no "- id: ${ROW_ID}" row in cordis.patch.yml — the bundle patch inserts it, so this is expected`);
    }
  }

  /* 2. keepSections coverage, weighted by whether the row is live */
  for (const row of rows) {
    if (!row.keepSections) continue;
    const { live, reason } = describeRow(row, bundles);
    const missing = SECTIONS.filter((name) => !row.keepSections.includes(name));
    if (missing.length) {
      report(
        live ? 'WARN' : 'INFO',
        profile,
        `row "${row.id}" (${reason}) whitelists sections but omits: ${missing.join(', ')}`,
      );
    }
    // `keepSections` filters sections; a context anchor has no entry there. If a
    // variant replaces the prompt, confirm the runtime snapshot still renders.
    report('INFO', profile, `row "${row.id}" cannot retain context layers (${CONTEXTS.join(', ')}) — confirm the runtime snapshot survives its variant`);
  }

  /* 3. stale generation names in any whitelist */
  const stale = new Map();
  for (const row of rows) {
    for (const name of row.keepSections ?? []) {
      if (/^astra:/.test(name)) stale.set(name, row.id);
    }
  }
  for (const [name, rowId] of stale) {
    report('WARN', profile, `row "${rowId}" whitelists the retired name "${name}" — the rename to identity:* was never applied here`);
  }

  return { package: PACKAGE, installed: Boolean(spec), bundles: bundles.length, rows: rows.length };
}

const profiles = listProfiles();
if (!profiles.length) {
  console.log(`audit skipped — no profile with a package.json under ${profilesRoot}`);
  process.exit(0);
}

for (const profile of profiles) {
  const summary = auditProfile(profile);
  // The "not installed" INFO is the header line's job, not a finding.
  const mine = findings.filter((finding) => finding.profile === profile && !/is not installed/.test(finding.message));
  const worst = ['FAIL', 'WARN', 'INFO'].find((level) => mine.some((finding) => finding.level === level));
  if (summary.installed) {
    const state = worst === 'FAIL' ? 'FAIL' : worst === 'WARN' ? 'WARN' : 'OK  ';
    console.log(`${profile.padEnd(10)} ${state}  ${PACKAGE} composed (${summary.bundles} bundles, ${summary.rows} patch rows)`);
  } else {
    console.log(`${profile.padEnd(10)} none  ${PACKAGE} is not installed in this profile`);
  }
  for (const { level, message } of mine) console.log(`           ${level} ${message}`);
}

const failures = findings.filter((finding) => finding.level === 'FAIL').length;
const warnings = findings.filter((finding) => finding.level === 'WARN').length;
console.log('\naudit %s — failures=%d warnings=%d', failures ? 'FAILED' : warnings ? 'PASSED (with warnings)' : 'PASSED', failures, warnings);
process.exit(failures ? 1 : 0);
