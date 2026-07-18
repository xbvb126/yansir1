import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const isProduction = process.env.NODE_ENV === "production";
const configuredOrigin = process.env.PUBLIC_SITE_ORIGIN?.trim();

if (isProduction && !configuredOrigin) {
  throw new Error("PUBLIC_SITE_ORIGIN is required for production builds (include the deployed base path, for example https://example.com/yansir).");
}

const origin = (configuredOrigin || "http://localhost:3200/yansir").replace(/\/+$/, "");
const destinations = ["", "?view=data", "?view=radar", "?view=track-record", "?view=plans"];
const publicDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../public");

function escapeXml(value) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

const robots = `User-agent: *\nAllow: /\n\nSitemap: ${origin}/sitemap.xml\n`;
const sitemapEntries = destinations
  .map((destination) => `  <url><loc>${escapeXml(`${origin}/${destination}`)}</loc></url>`)
  .join("\n");
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${sitemapEntries}\n</urlset>\n`;

await mkdir(publicDirectory, { recursive: true });
await Promise.all([
  writeFile(path.join(publicDirectory, "robots.txt"), robots, "utf8"),
  writeFile(path.join(publicDirectory, "sitemap.xml"), sitemap, "utf8")
]);
