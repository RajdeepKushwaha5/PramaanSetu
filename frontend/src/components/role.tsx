"use client";

/**
 * Mock authentication + role context.
 *
 * The SEBI TechSprint organisers confirmed a mock login is acceptable for the
 * demo ("focus should be on system functionality"), so this is deliberately
 * frictionless and fully offline — no external identity provider that could
 * fail on the virtual jury call. It models the three real personas the product
 * serves and remembers the choice in localStorage.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useRouter } from "next/navigation";

export type Role = "investor" | "issuer" | "regulator";

interface RoleMeta {
  label: string;
  identity: string; // mock display identity
  surface: string; // primary route for this persona
  blurb: string;
  glyph: string;
}

export const ROLE_META: Record<Role, RoleMeta> = {
  investor: {
    label: "Investor",
    identity: "Retail Investor (demo)",
    surface: "/verify",
    blurb: "Verify a suspicious message, image, video, or document before you act on it.",
    glyph: "◎",
  },
  issuer: {
    label: "Issuer",
    identity: "SEBI Communications Desk (demo)",
    surface: "/issuer",
    blurb: "Sign official communications so investors can prove they are genuine.",
    glyph: "✦",
  },
  regulator: {
    label: "Regulator",
    identity: "SEBI SupTech Analyst (demo)",
    surface: "/dashboard",
    blurb: "Monitor linked fraud campaigns and export tamper-evident evidence.",
    glyph: "◈",
  },
};

interface RoleContextValue {
  role: Role | null;
  ready: boolean;
  setRole: (role: Role) => void;
  signOut: () => void;
}

const RoleContext = createContext<RoleContextValue | null>(null);

export function useRole(): RoleContextValue {
  const ctx = useContext(RoleContext);
  if (!ctx) throw new Error("useRole must be used within RoleProvider");
  return ctx;
}

const STORAGE_KEY = "pramaan-role";

export function RoleProvider({ children }: { children: React.ReactNode }) {
  const [role, setRoleState] = useState<Role | null>(null);
  const [ready, setReady] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved === "investor" || saved === "issuer" || saved === "regulator") {
        setRoleState(saved);
        document.documentElement.dataset.role = saved;
      }
      setReady(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const setRole = useCallback(
    (next: Role) => {
      setRoleState(next);
      window.localStorage.setItem(STORAGE_KEY, next);
      document.documentElement.dataset.role = next;
    },
    [],
  );

  const signOut = useCallback(() => {
    setRoleState(null);
    window.localStorage.removeItem(STORAGE_KEY);
    delete document.documentElement.dataset.role;
    router.push("/");
  }, [router]);

  const value = useMemo(
    () => ({ role, ready, setRole, signOut }),
    [role, ready, setRole, signOut],
  );

  return (
    <RoleContext.Provider value={value}>
      {children}
      {ready && role === null && <MockLoginGate />}
    </RoleContext.Provider>
  );
}

function MockLoginGate() {
  const { setRole } = useRole();
  const router = useRouter();

  function choose(role: Role, navigate: boolean) {
    setRole(role);
    if (navigate) router.push(ROLE_META[role].surface);
  }

  return (
    <div className="mock-login" role="dialog" aria-modal="true" aria-label="Choose a role">
      <div className="mock-login-card">
        <div className="mock-login-head">
          <span className="micro-label">MOCK ACCESS · DEMO ONLY</span>
          <h2>Choose how you&apos;re signing in</h2>
          <p>
            PramaanSetu serves three personas. Pick one to explore its surface —
            this is a demo login (no password), so you can switch any time from
            the header.
          </p>
        </div>
        <div className="mock-login-roles">
          {(Object.keys(ROLE_META) as Role[]).map((r) => (
            <button key={r} className="mock-role" onClick={() => choose(r, true)}>
              <span className="mock-role-glyph">{ROLE_META[r].glyph}</span>
              <strong>{ROLE_META[r].label}</strong>
              <span className="mock-role-id">{ROLE_META[r].identity}</span>
              <p>{ROLE_META[r].blurb}</p>
              <span className="mock-role-go">enter →</span>
            </button>
          ))}
        </div>
        <button className="mock-login-skip" onClick={() => choose("investor", false)}>
          continue as guest investor
        </button>
      </div>
    </div>
  );
}

/** Compact header control: current identity + role switch + sign out. */
export function RoleSwitcher() {
  const { role, ready, setRole, signOut } = useRole();
  const [open, setOpen] = useState(false);
  const router = useRouter();

  if (!ready || role === null) return null;
  const meta = ROLE_META[role];

  return (
    <div className={`role-switcher ${open ? "open" : ""}`}>
      <button className="role-current" onClick={() => setOpen((v) => !v)} aria-haspopup="menu" aria-expanded={open}>
        <span className="role-glyph">{meta.glyph}</span>
        <span className="role-text">
          <b>{meta.label}</b>
          <i>{meta.identity}</i>
        </span>
        <span className="role-caret">{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div className="role-menu" role="menu">
          {(Object.keys(ROLE_META) as Role[]).map((r) => (
            <button
              key={r}
              className={`role-menu-item ${r === role ? "active" : ""}`}
              onClick={() => {
                setRole(r);
                setOpen(false);
                router.push(ROLE_META[r].surface);
              }}
            >
              <span>{ROLE_META[r].glyph}</span>
              <b>{ROLE_META[r].label}</b>
              {r === role && <i>current</i>}
            </button>
          ))}
          <button className="role-menu-signout" onClick={() => { setOpen(false); signOut(); }}>
            sign out
          </button>
        </div>
      )}
    </div>
  );
}

export function RoleSurfaceNotice({
  surface,
  title,
  children,
  soft = false,
}: {
  surface: Role;
  title: string;
  children: React.ReactNode;
  soft?: boolean;
}) {
  const { role, setRole } = useRole();
  const router = useRouter();
  const allowed = role === surface;

  if (allowed && soft) return null;

  return (
    <div className={`role-surface-notice ${allowed ? "allowed" : "blocked"}`}>
      <div>
        <span className="micro-label">
          {allowed ? `${ROLE_META[surface].label.toUpperCase()} MODE ACTIVE` : "ROLE MISMATCH"}
        </span>
        <strong>{title}</strong>
        <p>{children}</p>
      </div>
      {!allowed && (
        <button
          type="button"
          onClick={() => {
            setRole(surface);
            router.push(ROLE_META[surface].surface);
          }}
        >
          switch to {ROLE_META[surface].label.toLowerCase()} →
        </button>
      )}
    </div>
  );
}
