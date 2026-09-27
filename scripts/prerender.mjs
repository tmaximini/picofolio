/**
 * Post-build step (see package.json "build"):
 *  - dist/app.html   — the untouched SPA shell, marked noindex. The Worker
 *                      serves it for every app route (/overview, /holdings…)
 *                      so returning users never see landing markup flash.
 *  - dist/index.html — the same shell with the landing page prerendered into
 *                      #root; served for "/" and hydrated by main.tsx.
 */
import { readFile, rm, writeFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const dist = `${root}dist/`;
const ssrDir = `${root}.ssr/`;

const shell = await readFile(`${dist}index.html`, "utf8");
if (!shell.includes('<div id="root"></div>')) {
  throw new Error("prerender: #root placeholder not found in dist/index.html");
}

// The app shell: noindex, and no canonical/structured data claims of its own.
const robots = /<meta name="robots" content="[^"]*" \/>/;
if (!robots.test(shell)) throw new Error("prerender: robots meta not found in index.html");
const appShell = shell
  .replace(robots, '<meta name="robots" content="noindex" />')
  .replace(/\s*<link rel="canonical"[^>]*>/, "")
  .replace(/\s*<script type="application\/ld\+json">[\s\S]*?<\/script>/, "");
await writeFile(`${dist}app.html`, appShell);

// Node has no localStorage — the persisted store falls back to its initial
// (first-run) state, which is exactly the landing page.
const { render } = await import(pathToFileURL(`${ssrDir}entry-prerender.js`).href);
const html = render();
if (!html.includes("hero__title")) throw new Error("prerender: landing markup missing");
await writeFile(`${dist}index.html`, shell.replace('<div id="root"></div>', `<div id="root">${html}</div>`));
await rm(ssrDir, { recursive: true, force: true });

console.log(`prerender: index.html +${(html.length / 1024).toFixed(1)} KiB, app.html written`);
