/**
 * Independent tech detection: fetch a homepage and match its HTML and response headers
 * against known signatures. This is the ground truth the tech-stack suite is scored against,
 * so it must stay independent of Clay (and of BuiltWith, which Clay's function uses).
 */

export interface Signature {
  id: string;
  /** Names Clay/BuiltWith uses for this technology. Any match counts as Clay reporting it. */
  clayNames: string[];
  html?: RegExp[];
  /** header name (lowercase) → pattern on its value. */
  headers?: Record<string, RegExp>;
}

export const SIGNATURES: Signature[] = [
  {
    id: "Google Tag Manager",
    clayNames: ["Google Tag Manager"],
    html: [/googletagmanager\.com\/gtm\.js/i, /\bGTM-[A-Z0-9]{4,}\b/],
  },
  {
    id: "Google Analytics",
    clayNames: ["Google Analytics", "Google Analytics 4", "Google Universal Analytics", "Google Analytics Classic", "Global Site Tag"],
    html: [/googletagmanager\.com\/gtag\/js/i, /google-analytics\.com\/(?:analytics|ga)\.js/i, /\bgtag\(\s*['"]config['"]\s*,\s*['"](?:G|UA)-/i, /google-analytics\.com\/g\/collect/i],
  },
  { id: "Segment", clayNames: ["Segment"], html: [/cdn\.segment\.(?:com|io)\/analytics\.js/i, /cdn\.segment\.(?:com|io)\/analytics-next/i] },
  {
    id: "HubSpot",
    clayNames: ["Hubspot", "HubSpot", "HubSpot Analytics", "Hubspot Forms", "HubSpot Forms", "Hubspot Ads", "HubSpot CMS Hub", "HubSpot COS"],
    html: [/js(?:-[a-z0-9]+)?\.hs-scripts\.com/i, /js\.hs-analytics\.net/i, /js\.hsforms\.net/i, /js\.hs-banner\.com/i, /\bhs-script-loader\b/i],
  },
  { id: "Marketo", clayNames: ["Marketo", "Marketo Forms", "Marketo Munchkin"], html: [/munchkin\.marketo\.net/i, /\bmktoForms2\b/, /\.mktoweb\.com/i] },
  { id: "Intercom", clayNames: ["Intercom"], html: [/widget\.intercom\.io/i, /js\.intercomcdn\.com/i, /\bintercomSettings\b/] },
  { id: "Drift", clayNames: ["Drift"], html: [/js\.driftt\.com/i, /\bdrift\.load\(/] },
  { id: "Qualified", clayNames: ["Qualified"], html: [/js\.qualified\.com/i] },
  { id: "6sense", clayNames: ["6sense", "6Sense"], html: [/j\.6sc\.co/i, /\b6sc\.co\/j\//i] },
  {
    id: "LinkedIn Insight",
    clayNames: ["LinkedIn Insights", "LinkedIn Insight Tag", "LinkedIn Ads"],
    html: [/snap\.licdn\.com\/li\.lms-analytics/i, /\b_linkedin_partner_id\b/, /px\.ads\.linkedin\.com/i],
  },
  {
    id: "Meta Pixel",
    clayNames: ["Facebook Pixel", "Meta Pixel", "Facebook Custom Audiences", "Facebook Conversion Tracking"],
    html: [/connect\.facebook\.net\/[a-z_A-Z]+\/fbevents\.js/i, /\bfbq\(\s*['"]init['"]/],
  },
  { id: "Hotjar", clayNames: ["Hotjar"], html: [/static\.hotjar\.com/i, /\bhjSiteSettings\b|\b_hjSettings\b/] },
  { id: "Optimizely", clayNames: ["Optimizely"], html: [/cdn\.optimizely\.com/i, /\boptimizely\.com\/js\//i] },
  {
    id: "Next.js",
    clayNames: ["Next.js"],
    html: [/\/_next\/static\//, /\b__NEXT_DATA__\b/, /self\.__next_f\b/],
    headers: { "x-powered-by": /next\.js/i },
  },
  { id: "Webflow", clayNames: ["Webflow"], html: [/\bdata-wf-(?:site|page)=/i, /assets(?:-global)?\.website-files\.com/i, /\bwebflow\.js\b/i] },
  { id: "WordPress", clayNames: ["WordPress"], html: [/\/wp-content\//i, /\/wp-includes\//i, /<meta[^>]+generator[^>]+WordPress/i] },
  {
    id: "Cloudflare",
    clayNames: ["Cloudflare", "CloudFlare", "Cloudflare CDN", "Cloudflare Hosting", "Cloudflare JS"],
    headers: { server: /cloudflare/i, "cf-ray": /./ },
  },
  { id: "Vercel", clayNames: ["Vercel"], headers: { server: /vercel/i, "x-vercel-id": /./, "x-vercel-cache": /./ } },
  { id: "Fastly", clayNames: ["Fastly"], headers: { "x-served-by": /cache-[a-z]{3}/i, "x-fastly-request-id": /./, via: /varnish/i } },
  { id: "Stripe.js", clayNames: ["Stripe"], html: [/js\.stripe\.com\/v\d/i] },
];

export type SiteVerdict = "verified" | "unverifiable";

export interface SiteTruth {
  domain: string;
  /** static = raw HTML + headers; rendered = headless Chromium, including every network request. */
  method: "static" | "rendered";
  /** Network requests seen while rendering. */
  requests?: number;
  verdict: SiteVerdict;
  /** Why the site couldn't be checked, when unverifiable. */
  reason?: string;
  finalUrl?: string;
  httpStatus?: number;
  htmlBytes?: number;
  /** Signature ids detected; only meaningful when verified. */
  detected: string[];
  /** Which pattern fired for each detection, so a reviewer can audit the truth. */
  evidence: Record<string, string>;
  /** Response headers worth keeping (no cookies). */
  headers: Record<string, string>;
}

export interface TruthSnapshot<T> {
  source: string;
  method: string;
  generatedAt: string;
  entries: T[];
}

export const KEPT_HEADERS = ["server", "x-powered-by", "via", "cf-ray", "x-vercel-id", "x-vercel-cache", "x-served-by", "x-fastly-request-id", "x-cache", "content-type"];

/** Pages under this size with no scripts are almost always a bot wall or an empty client-side shell. */
const MIN_HTML_BYTES = 1500;
const CHALLENGE_PATTERNS = [/<title>\s*Just a moment\.\.\.\s*<\/title>/i, /cdn-cgi\/challenge-platform\/h\/[bg]\/orchestrate/i, /Attention Required! \| Cloudflare/i, /px-captcha/i, /elements\.namedItem\(["']solution["']\)/, /<title>\s*Access Denied\s*<\/title>/i];

/** `text` is the page HTML, plus every request URL when the page was rendered. */
export function detect(text: string, headers: Record<string, string>): { detected: string[]; evidence: Record<string, string> } {
  const detected: string[] = [];
  const evidence: Record<string, string> = {};
  for (const sig of SIGNATURES) {
    const htmlHit = sig.html?.find((re) => re.test(text));
    if (htmlHit) {
      detected.push(sig.id);
      evidence[sig.id] = `page ${htmlHit.source}`;
      continue;
    }
    const headerHit = Object.entries(sig.headers ?? {}).find(([name, re]) => headers[name] !== undefined && re.test(headers[name] ?? ""));
    if (headerHit) {
      detected.push(sig.id);
      evidence[sig.id] = `header ${headerHit[0]}: ${headers[headerHit[0]]}`;
    }
  }
  return { detected, evidence };
}

export function classifyPage(status: number, html: string): string | undefined {
  if (status >= 400) return `HTTP ${status}`;
  if (CHALLENGE_PATTERNS.some((re) => re.test(html)) && html.length < 50_000) return "bot challenge page";
  if (html.length < MIN_HTML_BYTES) return `only ${html.length} bytes of HTML`;
  return undefined;
}

export const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";

export async function fetchSiteTruth(domain: string, fetchImpl: typeof fetch = fetch, timeoutMs = 10_000): Promise<SiteTruth> {
  const base: SiteTruth = { domain, method: "static", verdict: "unverifiable", detected: [], evidence: {}, headers: {} };
  let response: Response;
  let html: string;
  try {
    response = await fetchImpl(`https://${domain}/`, {
      redirect: "follow",
      signal: AbortSignal.timeout(timeoutMs),
      headers: { "user-agent": BROWSER_UA, accept: "text/html,application/xhtml+xml", "accept-language": "en-US,en;q=0.9" },
    });
    html = await response.text();
  } catch (error) {
    return { ...base, reason: `fetch failed: ${error instanceof Error ? error.message : String(error)}` };
  }
  const headers: Record<string, string> = {};
  for (const name of KEPT_HEADERS) {
    const value = response.headers.get(name);
    if (value !== null) headers[name] = value;
  }
  const page = { ...base, finalUrl: response.url, httpStatus: response.status, htmlBytes: html.length, headers };
  const problem = classifyPage(response.status, html);
  if (problem) return { ...page, reason: problem };
  return { ...page, verdict: "verified", ...detect(html, headers) };
}

/** Which of our detectable technologies does a Clay tech-stack string mention? */
export function clayMentions(clayTechs: readonly string[]): Set<string> {
  const reported = new Set(clayTechs.map((t) => t.trim().toLowerCase()));
  const hits = new Set<string>();
  for (const sig of SIGNATURES) {
    if (sig.clayNames.some((name) => reported.has(name.toLowerCase()))) hits.add(sig.id);
  }
  return hits;
}
