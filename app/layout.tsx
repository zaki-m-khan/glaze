import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import Link from "next/link";
import type { ReactNode } from "react";
import { REPO_URL } from "@/lib/data";
import { Logo } from "./_components/Logo";
import { ThemeToggle, themeBootScript } from "./_components/ThemeToggle";
import "./globals.css";

const sans = IBM_Plex_Sans({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-sans" });
const mono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-mono" });

export const metadata: Metadata = {
  title: { default: "Glaze: CI for Clay functions", template: "%s · Glaze" },
  description: "Glaze benchmarks Clay functions against independent ground truth and catches regressions on pull requests.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f4ef" },
    { media: "(prefers-color-scheme: dark)", color: "#111210" },
  ],
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
      </head>
      <body>
        <header className="top">
          <div className="wrap">
            <Link href="/" className="brand">
              <Logo />
              Glaze
            </Link>
            <nav className="nav" aria-label="Main">
              <Link href="/">Benchmark</Link>
              <Link href="/compare/">Compare</Link>
              <Link href="/about/">About</Link>
              <a href={REPO_URL} className="hide-sm">
                GitHub
              </a>
              <ThemeToggle />
            </nav>
          </div>
        </header>
        <main>
          <div className="wrap">{children}</div>
        </main>
        <footer>
          <div className="wrap">
            <span>Glaze · CI and benchmarking for Clay functions. Not affiliated with Clay.</span>
            <a href={REPO_URL}>Source on GitHub</a>
          </div>
        </footer>
      </body>
    </html>
  );
}
