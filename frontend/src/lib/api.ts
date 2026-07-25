/**
 * Base URL of the PramaanSetu backend (Express API).
 * Set NEXT_PUBLIC_API_URL in .env.local; defaults to local dev backend.
 */
export const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export function apiUrl(path: string): string {
  const base = API_BASE.replace(/\/$/, "");
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${base}${p}`;
}
