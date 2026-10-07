import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import Link from "next/link";
import type { ReactNode } from "react";
import { REPO_URL } from "@/lib/data";
import { ThemeToggle, themeBootScript } from "./_components/ThemeToggle";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = {
  title: { default: "Glaze: test your Clay functions", template: "%s · Glaze" },
  description: "Run Clay functions on real companies, check the answers, and catch bad changes before they ship.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f0f8ff" },
    { media: "(prefers-color-scheme: dark)", color: "#001433" },
  ],
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
      </head>
      <body>
        <header className="top">
          <div className="wrap">
            <Link href="/" className="brand">
              {/* eslint-disable-next-line @next/next/no-img-element -- static export, tiny brand asset */}
              <img src="/brand/dot-yellow.png" alt="" width={24} height={24} />
              Glaze
            </Link>
            <nav className="nav" aria-label="Main">
              <Link href="/#results">Results</Link>
              <Link href="/about/">Why</Link>
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
            <span>Glaze is an independent project by Zaki Khan. It&apos;s not made by Clay.</span>
            <a href={REPO_URL}>Code on GitHub</a>
          </div>
        </footer>
      </body>
    </html>
  );
}
