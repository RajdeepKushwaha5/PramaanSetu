"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { ROLE_META, RoleSwitcher, useRole, type Role } from "@/components/role";
import { apiUrl } from "@/lib/api";

type Health = "connecting" | "online" | "degraded" | "offline";
const HEALTH_LABEL: Record<Health, string> = {
  connecting: "connecting…",
  online: "system live",
  degraded: "degraded",
  offline: "backend offline",
};

const NAV: { href: string; label: string; surface: Role | "overview" }[] = [
  { href: "/", label: "overview", surface: "overview" },
  { href: "/verify", label: "verify", surface: "investor" },
  { href: "/issuer", label: "signing rail", surface: "issuer" },
  { href: "/dashboard", label: "suptech radar", surface: "regulator" },
];

const ROLE_CONTEXT: Record<Role, string> = {
  investor: "INVESTOR SAFETY · VERIFY BEFORE YOU TRUST",
  issuer: "ISSUER DESK · SIGN OFFICIAL COMMUNICATIONS",
  regulator: "SUPTECH RADAR · MARKET-WIDE FRAUD INTELLIGENCE",
};

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { role } = useRole();
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [health, setHealth] = useState<Health>("connecting");
  const nav = role
    ? [
        ...NAV.filter((item) => item.surface === role),
        ...NAV.filter((item) => item.surface !== role),
      ]
    : NAV;

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

  // Poll real backend health so the status pill reflects reality, not a hardcoded
  // "live". Shows connecting / online / degraded / offline.
  useEffect(() => {
    let alive = true;
    const check = async () => {
      try {
        const r = await fetch(apiUrl("/api/health"), { cache: "no-store" });
        const d = (await r.json()) as { status?: string };
        if (!alive) return;
        if (!r.ok || d.status === "critical") setHealth("offline");
        else if (d.status === "degraded") setHealth("degraded");
        else setHealth("online");
      } catch {
        if (alive) setHealth("offline");
      }
    };
    void check();
    const interval = window.setInterval(() => void check(), 15000);
    return () => {
      alive = false;
      window.clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    let observer: IntersectionObserver | undefined;
    const timer = window.setTimeout(() => {
      const targets = document.querySelectorAll(
        ".page > section, .panel, .layer-card, .principle-table > div, .radar-stat",
      );

      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        targets.forEach((target) => target.classList.add("is-visible"));
        return;
      }

      observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              entry.target.classList.add("is-visible");
              observer?.unobserve(entry.target);
            }
          });
        },
        { threshold: 0.08, rootMargin: "0px 0px -6% 0px" },
      );

      targets.forEach((target) => {
        target.classList.add("reveal-ready");
        observer?.observe(target);
      });
    }, 0);

    return () => {
      window.clearTimeout(timer);
      observer?.disconnect();
    };
  }, [pathname]);

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
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`${pathname === item.href ? "active" : ""} ${role && item.surface === role ? "role-primary" : ""}`}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="header-actions">
          <RoleSwitcher />
          <span className={`system-pill status-${health}`} title={`Backend: ${health}`}>
            <i />
            {HEALTH_LABEL[health]}
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
        <span>{role ? `${ROLE_META[role].label.toUpperCase()} MODE / PS–01` : "SEBI TECHSPRINT / PS–01"}</span>
        <span className="context-copy">
          {role ? ROLE_CONTEXT[role] : "CRYPTOGRAPHIC PROVENANCE · FRAUD INTELLIGENCE · INVESTOR SAFETY"}
        </span>
        <span>{role ? ROLE_META[role].identity.toUpperCase() : "INDIA / 2026"}</span>
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
