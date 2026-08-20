/**
 * Packages the extension for each browser.
 *
 *   node scripts/build-extension.mjs
 *
 * Chrome/Edge use manifest.json (MV3 service worker).
 * Firefox uses manifest.firefox.json (MV3 event page) — Firefox doesn't support
 * `background.service_worker`, so shipping one manifest for both silently breaks
 * the add-on there.
 */

import { cp, mkdir, rm, readdir, stat, writeFile, readFile } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { join, relative } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);
const ROOT = new URL("..", import.meta.url).pathname;
const SRC = join(ROOT, "extension");
const OUT = join(ROOT, "dist");

const SHARED_SKIP = new Set(["manifest.firefox.json", ".DS_Store"]);

async function build(target, manifestFile) {
  const dest = join(OUT, target);
  await rm(dest, { recursive: true, force: true });
  await mkdir(dest, { recursive: true });

  for (const entry of await readdir(SRC)) {
    if (SHARED_SKIP.has(entry)) continue;
    await cp(join(SRC, entry), join(dest, entry), { recursive: true });
  }

  // Swap in the target's manifest.
  const manifest = await readFile(join(SRC, manifestFile), "utf8");
  await writeFile(join(dest, "manifest.json"), manifest);

  // Zip it if the system has `zip`; otherwise leave the folder for manual loading.
  try {
    await run("zip", ["-rq", join(OUT, `zapply-${target}.zip`), "."], { cwd: dest });
    console.log(`  dist/${target}/  ->  dist/zapply-${target}.zip`);
  } catch {
    console.log(`  dist/${target}/  (install \`zip\` to produce an archive)`);
  }
}

await rm(OUT, { recursive: true, force: true });
console.log("Building extension packages:");
await build("chrome", "manifest.json");
await build("firefox", "manifest.firefox.json");
console.log(`
  Chrome/Edge : load dist/chrome as an unpacked extension, or upload the zip.
  Firefox     : about:debugging -> Load Temporary Add-on -> dist/firefox/manifest.json
`);
