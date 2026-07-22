import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const src = (file) => readFileSync(path.join(process.cwd(), file), "utf8");
const appCss = src("src/styles/app.css");
const trackCss = src("src/styles/track-record.css");

assert.match(appCss, /--standard-page-width:\s*430px/);
assert.match(appCss, /\.app-shell\s*\{[^}]*width:\s*min\(100%,\s*var\(--standard-page-width\)\)/s);
assert.match(appCss, /\.app-shell\.view-kline-lab\s*\{[^}]*width:\s*min\(100%,\s*1180px\)/s);
assert.match(appCss, /\.view-claw \.ai-claw-composer\s*\{[^}]*width:\s*min\(100%,\s*var\(--standard-page-width\)\)/s);
assert.match(appCss, /\.bottom-nav\s*\{[^}]*width:\s*min\(100%,\s*var\(--standard-page-width\)\)/s);
assert.match(appCss, /\.view-claw \.ai-claw-composer\s*\{[^}]*width:\s*min\(var\(--standard-page-width\),\s*calc\(100% - 32px\)\)/s);
assert.match(appCss, /\.view-claw \.ai-claw-composer\s*\{[^}]*width:\s*min\(calc\(var\(--standard-page-width\) - 32px\),\s*calc\(100vw - 32px\)\)/s);
assert.match(appCss, /\.app-shell\.view-login \.auth-standalone,\s*\.app-shell\.view-register \.auth-standalone\s*\{[^}]*width:\s*100%[^}]*max-width:\s*100%[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/s);
assert.doesNotMatch(trackCss, /\.app-shell:has\(\.public-track-record-view\)/);
assert.match(trackCss, /\.public-track-record-view\s*\{[^}]*width:\s*100%/s);
assert.match(trackCss, /\.app-shell\.view-track-record\s*>\s*\.public-track-record-view\s*\{[^}]*padding:\s*28px 16px 112px\s*!important/s);
assert.match(trackCss, /\.track-record-controls\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*0\.95fr\)\s*minmax\(0,\s*1\.05fr\)/s);
assert.match(trackCss, /\.app-shell\.view-track-record \.track-record-heading h1\s*\{[^}]*font-size:\s*42px/s);
assert.match(trackCss, /\.app-shell\.view-track-record \.track-trust-primary strong\s*\{[^}]*font-size:\s*54px/s);

console.log("page width contract passed");
