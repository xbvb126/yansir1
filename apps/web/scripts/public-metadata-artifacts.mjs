const LOCAL_PUBLIC_SITE_ORIGIN = "http://localhost:3200/yansir";
const PUBLIC_DESTINATIONS = ["", "?view=data", "?view=radar", "?view=track-record", "?view=plans"];

export function parsePublicSiteOrigin(value, { required = false } = {}) {
  const configured = String(value || "").trim();
  if (!configured && required) {
    throw new Error("PUBLIC_SITE_ORIGIN is required for production builds and must be an absolute HTTP(S) URL.");
  }

  const candidate = configured || LOCAL_PUBLIC_SITE_ORIGIN;
  let parsed;
  try {
    parsed = new URL(candidate);
  } catch {
    throw new Error("PUBLIC_SITE_ORIGIN must be an absolute HTTP(S) URL, including the deployed base path.");
  }
  if (!/^https?:$/.test(parsed.protocol) || parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error("PUBLIC_SITE_ORIGIN must be an absolute HTTP(S) URL without credentials, query parameters, or a hash.");
  }

  return parsed.toString().replace(/\/+$/, "");
}

function escapeXml(value) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function injectInitialPublicUrl(indexHtml, publicHomeUrl) {
  const canonicalPattern = /(<link\s+rel="canonical"\s+href=")[^"]*("\s*\/?>)/i;
  const ogUrlPattern = /(<meta\s+property="og:url"\s+content=")[^"]*("\s*\/?>)/i;
  if (!canonicalPattern.test(indexHtml) || !ogUrlPattern.test(indexHtml)) {
    throw new Error("index.html must contain canonical and og:url tags before public metadata generation.");
  }
  return indexHtml
    .replace(canonicalPattern, `$1${publicHomeUrl}$2`)
    .replace(ogUrlPattern, `$1${publicHomeUrl}$2`);
}

export function createPublicMetadataArtifacts(value, indexHtml) {
  const origin = parsePublicSiteOrigin(value, { required: true });
  const homeUrl = `${origin}/`;
  const robots = `User-agent: *\nAllow: /\n\nSitemap: ${origin}/sitemap.xml\n`;
  const sitemapEntries = PUBLIC_DESTINATIONS
    .map((destination) => `  <url><loc>${escapeXml(`${homeUrl}${destination}`)}</loc></url>`)
    .join("\n");
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${sitemapEntries}\n</urlset>\n`;
  return {
    robots,
    sitemap,
    indexHtml: injectInitialPublicUrl(indexHtml, homeUrl)
  };
}
