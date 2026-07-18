import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createPublicMetadataArtifacts, parsePublicSiteOrigin } from "../scripts/public-metadata-artifacts.mjs";

const root = process.cwd();
const outDir = path.join(root, "tests", ".tmp-public-metadata");
mkdirSync(outDir, { recursive: true });
const outfile = path.join(outDir, "public-metadata.mjs");
const esbuildBin = path.resolve(root, "..", "..", "node_modules", "esbuild", "bin", "esbuild");

function fakeDocument() {
  const elements = [];
  const head = {
    querySelector(selector) {
      const match = selector.match(/^(meta|link)\[(name|property|rel)="([^"]+)"\]$/);
      if (!match) return null;
      return elements.find((element) => element.tagName === match[1] && element.attributes.get(match[2]) === match[3]) || null;
    },
    appendChild(element) { elements.push(element); }
  };
  return {
    title: "",
    documentElement: { lang: "" },
    head,
    createElement(tagName) {
      const attributes = new Map();
      return {
        tagName,
        attributes,
        content: "",
        href: "",
        set rel(value) { attributes.set("rel", value); },
        get rel() { return attributes.get("rel") || ""; },
        setAttribute(name, value) { attributes.set(name, value); }
      };
    }
  };
}

try {
  execFileSync(process.execPath, [esbuildBin, "src/features/portal/publicMetadata.ts", "--bundle", "--platform=node", "--format=esm", `--outfile=${outfile}`], { cwd: root });
  globalThis.document = fakeDocument();
  const metadata = await import(pathToFileURL(outfile));
  metadata.syncPublicMetadata("data", { href: "https://portal.example/yansir/?view=data&symbol=BTC#chart" });
  assert.equal(document.documentElement.lang, "zh-CN");
  assert.equal(document.title, "市场数据 | Yansir");
  const canonical = document.head.querySelector('link[rel="canonical"]');
  const ogUrl = document.head.querySelector('meta[property="og:url"]');
  assert.equal(canonical.href, "https://portal.example/yansir/?view=data", "canonical URL should remove symbol and hash state");
  assert.equal(ogUrl.content, canonical.href, "runtime canonical and Open Graph URL must agree");
  assert.equal(document.head.querySelector('meta[name="description"]').content, "浏览公开加密市场概览与币种数据。");
  metadata.syncPublicMetadata("account", { href: "https://portal.example/yansir/?view=account" });
  assert.equal(document.head.querySelector('meta[name="robots"]').content, "noindex,nofollow", "private routes must reset stale public metadata and opt out of indexing");
  assert.equal(document.head.querySelector('link[rel="canonical"]').href, "", "private routes must not retain a public canonical URL");

  assert.throws(() => parsePublicSiteOrigin("", { required: true }), /required/i);
  assert.throws(() => parsePublicSiteOrigin("/yansir", { required: true }), /absolute http/i);
  assert.throws(() => parsePublicSiteOrigin("ftp://example.test/yansir", { required: true }), /absolute http/i);
  assert.equal(parsePublicSiteOrigin("https://example.test/yansir/", { required: true }), "https://example.test/yansir");

  const template = readFileSync(path.join(root, "index.html"), "utf8");
  const artifacts = createPublicMetadataArtifacts("https://example.test/yansir", template);
  assert.match(artifacts.robots, /Sitemap: https:\/\/example\.test\/yansir\/sitemap\.xml/);
  const locations = [...artifacts.sitemap.matchAll(/<loc>(.*?)<\/loc>/g)].map((match) => match[1].replaceAll("&amp;", "&"));
  assert.deepEqual(locations, [
    "https://example.test/yansir/",
    "https://example.test/yansir/?view=data",
    "https://example.test/yansir/?view=radar",
    "https://example.test/yansir/?view=track-record",
    "https://example.test/yansir/?view=plans"
  ]);
  assert.ok(locations.every((value) => /^https?:\/\//.test(value)), "all sitemap locations must be absolute HTTP(S) URLs");
  assert.match(artifacts.indexHtml, /rel="canonical" href="https:\/\/example\.test\/yansir\/"/);
  assert.match(artifacts.indexHtml, /property="og:url" content="https:\/\/example\.test\/yansir\/"/);
  assert.doesNotMatch(artifacts.indexHtml, /localhost:3200/);
} finally {
  delete globalThis.document;
  rmSync(outDir, { recursive: true, force: true });
}

console.log("public metadata behavior tests passed");
