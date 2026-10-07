/**
 * Captures dashboard screenshots for the README.
 * Usage: npx tsx scripts/screenshots.ts [baseUrl]   (default http://localhost:3217, e.g. `npm run dev -- --port 3217`)
 */
import { mkdirSync } from "node:fs";
import { chromium } from "@playwright/test";
import { headlineRuns } from "../src/lib/data";

const base = process.argv[2] ?? "http://localhost:3217";
const funding = headlineRuns().find((r) => r.suite === "funding");

const shots: { name: string; path: string; width: number; height: number; dark?: boolean; fullPage?: boolean; open?: string }[] = [
  { name: "desktop", path: "/", width: 1280, height: 860 },
  { name: "mobile", path: "/", width: 390, height: 844 },
  { name: "mobile-dark", path: "/", width: 390, height: 844, dark: true },
  ...(funding ? [{ name: "mobile-run", path: `/runs/${funding.id}/`, width: 390, height: 844, open: "intercom" }] : []),
];

mkdirSync("docs", { recursive: true });
const browser = await chromium.launch();
for (const shot of shots) {
  const page = await browser.newPage({
    viewport: { width: shot.width, height: shot.height },
    deviceScaleFactor: 2,
    colorScheme: shot.dark ? "dark" : "light",
  });
  await page.goto(`${base}${shot.path}`, { waitUntil: "networkidle" });
  if (shot.open) {
    const row = page.locator("details", { hasText: shot.open }).first();
    await row.locator("summary").click();
    await row.scrollIntoViewIfNeeded();
  }
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  if (overflow > 0) throw new Error(`${shot.name}: page overflows horizontally by ${overflow}px`);
  await page.screenshot({ path: `docs/${shot.name}.png`, fullPage: shot.fullPage ?? false });
  console.log(`docs/${shot.name}.png`);
  await page.close();
}
await browser.close();
