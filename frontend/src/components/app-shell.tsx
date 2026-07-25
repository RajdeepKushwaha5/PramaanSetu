"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const NAV = [
  { href: "/", label: "overview" },
  { href: "/verify", label: "verify" },
  { href: "/issuer", label: "signing rail" },
  { href: "/dashboard", label: "suptech radar" },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [theme, setTheme] = useState<"dark" | "light">("dark");

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const saved = window.localStorage.getItem("pramaan-theme");
      const next =
        saved === "light" || saved === "dark"
          ? saved
          : window.matchMedia("(prefers-color-scheme: light)").matches
            ? "light"
            : "dark";
      setTheme(next);
      document.documentElement.dataset.theme = next;
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.dataset.theme = next;
    window.localStorage.setItem("pramaan-theme", next);
  }

  return (
    <div className="site-frame">
      <header className="site-header">
        <Link href="/" className="brand" aria-label="PramaanSetu home">
          <LogoMark />
          <span>pramaan<span>setu</span></span>
        </Link>

        <nav className="primary-nav" aria-label="Primary navigation">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={pathname === item.href ? "active" : ""}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="header-actions">
          <span className="system-pill">
            <i />
            system live
          </span>
          <button
            className="icon-button"
            onClick={toggleTheme}
            aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
            title="Toggle theme"
          >
            {theme === "dark" ? "☼" : "☾"}
          </button>
        </div>
      </header>

      <div className="context-bar">
        <span>SEBI TECHSPRINT / PS–01</span>
        <span className="context-copy">
          CRYPTOGRAPHIC PROVENANCE · FRAUD INTELLIGENCE · INVESTOR SAFETY
        </span>
        <span>INDIA / 2026</span>
      </div>

      {children}

      <footer className="site-footer">
        <div>
          <LogoMark />
          <p>Proof before persuasion.</p>
        </div>
        <div className="footer-meta">
          <span>ED25519 / SHA–256</span>
          <span>SEBI SECURITIES MARKET TECHSPRINT</span>
        </div>
      </footer>
    </div>
  );
}

export function LogoMark() {
  return (
    <span className="logo-mark" aria-hidden="true">
      {Array.from({ length: 9 }, (_, i) => <i key={i} />)}
    </span>
  );
}
