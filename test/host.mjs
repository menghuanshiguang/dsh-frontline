/**
 * Locate the host's prompt packages at run time.
 *
 * The host install moves between layouts — a plain checkout, an asar bundle, a
 * profile whose `node_modules` symlinks into the global npm root — so no absolute
 * path is baked into a test. Order: `DSH_MODULE_ROOT` (explicit override),
 * `~/.dsh/profiles/node_modules` (the default profile's links), then the global
 * npm root those links point at.
 *
 * Run: used by integration.mjs and lifecycle.mjs
 */
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

/** @returns the candidate `node_modules` directories, in lookup order. */
export function hostModuleRoots() {
  const home = os.homedir();
  const appData = process.env.APPDATA ?? path.join(home, 'AppData', 'Roaming');
  return [
    process.env.DSH_MODULE_ROOT,
    path.join(home, '.dsh', 'profiles', 'node_modules'),
    path.join(appData, 'npm', 'node_modules', '@deepseek-ai', 'dsh', 'node_modules'),
  ].filter(Boolean);
}

/**
 * Resolve a host package entry point to a `file:` URL.
 * @param relative - path inside `node_modules`, e.g. `@deepseek-ai/cordis/lib/index.js`.
 * @returns the module URL.
 */
export function hostEntry(relative) {
  for (const root of hostModuleRoots()) {
    const candidate = path.join(root, relative);
    if (existsSync(candidate)) return pathToFileURL(candidate).href;
  }
  throw new Error(
    `cannot locate ${relative} — set DSH_MODULE_ROOT to the node_modules directory that holds @deepseek-ai`,
  );
}
