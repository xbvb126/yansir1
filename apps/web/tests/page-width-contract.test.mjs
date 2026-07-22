import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const src = (file) => readFileSync(path.join(process.cwd(), file), "utf8");
const appCss = src("src/styles/app.css");
const trackCss = src("src/styles/track-record.css");

assert.match(appCss, /--standard-page-width:\s*430px/);
assert.match(appCss, /\.app-shell\s*\{[^}]*width:\s*min\(100vw,\s*var\(--standard-page-width\)\)/s);
assert.match(appCss, /\.app-shell\.view-kline-lab\s*\{[^}]*width:\s*min\(100vw,\s*1180px\)/s);
assert.doesNotMatch(trackCss, /\.app-shell:has\(\.public-track-record-view\)/);
assert.match(trackCss, /\.public-track-record-view\s*\{[^}]*width:\s*100%/s);

console.log("page width contract passed");
