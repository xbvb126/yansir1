import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createPublicMetadataArtifacts, parsePublicSiteOrigin } from "./public-metadata-artifacts.mjs";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const webDirectory = path.resolve(scriptDirectory, "..");
const publicDirectory = path.join(webDirectory, "public");
const indexPath = path.join(webDirectory, "index.html");
const production = process.argv.includes("--production") || process.env.NODE_ENV === "production";
const origin = parsePublicSiteOrigin(process.env.PUBLIC_SITE_ORIGIN, { required: production });
const indexTemplate = await readFile(indexPath, "utf8");
const artifacts = createPublicMetadataArtifacts(origin, indexTemplate);

await mkdir(publicDirectory, { recursive: true });
await Promise.all([
  writeFile(path.join(publicDirectory, "robots.txt"), artifacts.robots, "utf8"),
  writeFile(path.join(publicDirectory, "sitemap.xml"), artifacts.sitemap, "utf8"),
  writeFile(indexPath, artifacts.indexHtml, "utf8")
]);
