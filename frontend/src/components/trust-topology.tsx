"use client";

/**
 * Interactive trust-topology diagram for the homepage hero.
 *
 * It plays a guided scenario — a forged SEBI circular with a swapped payment QR
 * travelling through the whole rail — and flips the diagram through live states
 * (intake → engine → source matched → tamper detected → do not pay → evidence →
 * campaign linked). The viewer can play/pause, step, or click a node to open its
 * surface. This is the 5-minute-pitch centrepiece: it tells the product story
 * instead of just looking like a diagram.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

interface NodeDef {
  id: string;
  x: number;
  y: number;
  label: string;
  state: string;
  labelY: number;
  stateY: number;
  route?: string;
}

const NODES: NodeDef[] = [
  { id: "issuer", x: 275, y: 58, label: "issuer", state: "PUBLISH", labelY: 22, stateY: 38, route: "/issuer" },
  { id: "content", x: 82, y: 132, label: "content", state: "INPUT", labelY: 162, stateY: 177, route: "/verify" },
  { id: "registry", x: 468, y: 132, label: "registry", state: "KNOWN", labelY: 162, stateY: 177, route: "/issuer" },
  { id: "verifier", x: 82, y: 300, label: "verifier", state: "CHECK", labelY: 331, stateY: 346, route: "/verify" },
  { id: "investor", x: 468, y: 300, label: "investor", state: "DECIDE", labelY: 331, stateY: 346, route: "/verify" },
  { id: "evidence", x: 198, y: 400, label: "evidence", state: "EXPORT", labelY: 431, stateY: 446, route: "/dashboard" },
  { id: "radar", x: 352, y: 400, label: "radar", state: "LINK", labelY: 431, stateY: 446, route: "/dashboard" },
];

const PATHS: { id: string; d: string; kind: string }[] = [
  { id: "issuer-core", d: "M 275 74 L 275 177", kind: "primary" },
  { id: "content-core", d: "M 98 137 C 165 145 207 178 235 207", kind: "primary" },
  { id: "core-registry", d: "M 315 207 C 354 177 405 143 452 137", kind: "primary" },
  { id: "core-verifier", d: "M 235 242 C 190 257 148 281 98 296", kind: "primary" },
  { id: "verifier-investor", d: "M 98 305 C 205 354 345 354 452 305", kind: "decision" },
  { id: "verifier-evidence", d: "M 91 315 C 115 352 151 383 187 397", kind: "secondary" },
  { id: "evidence-radar", d: "M 214 400 L 336 400", kind: "secondary" },
  { id: "radar-registry", d: "M 364 390 C 426 340 461 237 466 148", kind: "secondary" },
];

type Tone = "neutral" | "info" | "alert" | "warn";

interface Beat {
  chip: string;
  tone: Tone;
  caption: string;
  nodes: string[]; // highlighted nodes
  alert: string[]; // nodes flipped to alert (red)
  pathId: string | null; // path highlighted + token motion
  tokenPath: string; // token travel path (d)
  dur: number; // token travel ms
}

const TOKEN_ARRIVE = "M -30 132 L 82 132";

const BEATS: Beat[] = [
  {
    chip: "INTAKE",
    tone: "neutral",
    caption: "A forged SEBI circular with a swapped payment QR is forwarded to an investor.",
    nodes: ["content"],
    alert: [],
    pathId: null,
    tokenPath: TOKEN_ARRIVE,
    dur: 1100,
  },
  {
    chip: "TRUST ENGINE",
    tone: "info",
    caption: "It is hashed (SHA-256) and perceptually fingerprinted by the trust engine.",
    nodes: ["content"],
    alert: [],
    pathId: "content-core",
    tokenPath: PATHS[1].d,
    dur: 1300,
  },
  {
    chip: "SOURCE MATCHED",
    tone: "info",
    caption: "The fingerprint matches a genuine signed circular in the tamper-evident registry.",
    nodes: ["registry"],
    alert: [],
    pathId: "core-registry",
    tokenPath: PATHS[2].d,
    dur: 1300,
  },
  {
    chip: "TAMPER DETECTED",
    tone: "alert",
    caption: "Frames match the genuine record — but the payment QR points to an unapproved payee.",
    nodes: [],
    alert: ["verifier"],
    pathId: "core-verifier",
    tokenPath: PATHS[3].d,
    dur: 1300,
  },
  {
    chip: "DO NOT PAY",
    tone: "alert",
    caption: "The investor is warned before paying — with the fraud UPI handle named explicitly.",
    nodes: [],
    alert: ["investor"],
    pathId: "verifier-investor",
    tokenPath: PATHS[4].d,
    dur: 1500,
  },
  {
    chip: "EVIDENCE SIGNED",
    tone: "warn",
    caption: "A tamper-evident, Ed25519-signed evidence pack is exported for the regulator.",
    nodes: ["evidence"],
    alert: [],
    pathId: "verifier-evidence",
    tokenPath: PATHS[5].d,
    dur: 1200,
  },
  {
    chip: "CAMPAIGN LINKED",
    tone: "warn",
    caption: "Shared indicators link this report to a wider fraud campaign on the SupTech radar.",
    nodes: ["radar", "evidence"],
    alert: [],
    pathId: "evidence-radar",
    tokenPath: PATHS[6].d,
    dur: 1200,
  },
];

const DWELL = 700; // pause after the token finishes before the next beat

export function TrustTopology() {
  const router = useRouter();
  const [beat, setBeat] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [tokenPos, setTokenPos] = useState<{ x: number; y: number }>({ x: -30, y: 132 });
  const measurePathRef = useRef<SVGPathElement>(null);

  const current = BEATS[beat];

  // Drive the travelling token with a single React-controlled position (one
  // token, explicit interpolation along the path) — no SMIL, so old and new
  // states can never render together. Honours reduced-motion by jumping to the
  // path end instead of animating.
  useEffect(() => {
    const path = measurePathRef.current;
    if (!path) return;
    const len = path.getTotalLength();
    const reduce =
      typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      const end = path.getPointAtLength(len);
      setTokenPos({ x: end.x, y: end.y });
      return;
    }
    let raf = 0;
    let start = 0;
    const dur = current.dur;
    const step = (ts: number) => {
      if (!start) start = ts;
      const t = Math.min(1, (ts - start) / dur);
      const p = path.getPointAtLength(t * len);
      setTokenPos({ x: p.x, y: p.y });
      if (t < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [beat, current.dur, current.tokenPath]);

  // Respect reduced-motion: stop autoplay so captions don't change on their own.
  useEffect(() => {
    if (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPlaying(false);
    }
  }, []);

  // Auto-advance while playing.
  useEffect(() => {
    if (!playing) return;
    const hold = current.dur + DWELL;
    const timer = window.setTimeout(() => setBeat((b) => (b + 1) % BEATS.length), hold);
    return () => window.clearTimeout(timer);
  }, [beat, playing, current.dur]);

  const go = useCallback((next: number) => {
    setBeat(((next % BEATS.length) + BEATS.length) % BEATS.length);
  }, []);

  const nodeClass = (id: string): string => {
    if (current.alert.includes(id)) return "topology-node is-alert";
    if (current.nodes.includes(id)) return "topology-node is-active";
    return "topology-node";
  };

  return (
    <div className={`trust-topology-wrap tone-${current.tone}`}>
      <svg
        className="trust-topology"
        viewBox="0 0 550 460"
        role="group"
        aria-label="Interactive PramaanSetu trust flow: a forged circular travels from content intake through the trust engine, registry match, tamper detection, investor warning, evidence export, and campaign linking. Each node opens its product surface."
      >
        <defs>
          <marker id="flow-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" />
          </marker>
        </defs>

        <g className="topology-lines">
          {PATHS.map((path) => (
            <path
              id={path.id}
              className={`${path.kind}${current.pathId === path.id ? " is-live" : ""}`}
              key={path.id}
              d={path.d}
              markerEnd="url(#flow-arrow)"
            />
          ))}
        </g>

        <circle className="orbit orbit-outer" cx="275" cy="225" r="75" />
        <circle className="orbit orbit-inner" cx="275" cy="225" r="57" />
        <circle className="scan-ring" cx="275" cy="225" r="50" />
        <circle className="core-ring" cx="275" cy="225" r="44" />
        <circle className="core" cx="275" cy="225" r="8" />
        <text className="core-label" x="275" y="218">PRAMAAN</text>
        <text className="core-sub" x="275" y="244">TRUST ENGINE</text>

        {NODES.map((node) => (
          <g
            className={`topology-station${node.route ? " is-clickable" : ""}`}
            key={node.id}
            onClick={node.route ? () => router.push(node.route!) : undefined}
            role={node.route ? "button" : undefined}
            tabIndex={node.route ? 0 : undefined}
            onKeyDown={
              node.route
                ? (e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      router.push(node.route!);
                    }
                  }
                : undefined
            }
          >
            <circle className={nodeClass(node.id)} cx={node.x} cy={node.y} r="15" />
            <circle className="topology-node-dot" cx={node.x} cy={node.y} r="4" />
            <text className="topology-label" x={node.x} y={node.labelY}>{node.label}</text>
            <text className="topology-node-state" x={node.x} y={node.stateY}>{node.state}</text>
          </g>
        ))}

        {/* Hidden path, used only to measure the token's route for this beat. */}
        <path ref={measurePathRef} d={current.tokenPath} fill="none" stroke="none" />
        {/* Single React-controlled travelling token (no SMIL). */}
        <g
          className={`topology-token tone-${current.tone}`}
          transform={`translate(${tokenPos.x} ${tokenPos.y})`}
          aria-hidden="true"
        >
          <circle r="9" />
          <circle className="topology-token-core" r="3.5" />
        </g>
      </svg>

      <div className="topology-story">
        <div className="topology-story-line" aria-live="polite">
          <span className={`topology-chip tone-${current.tone}`}>{current.chip}</span>
          <p>{current.caption}</p>
        </div>
        <div className="topology-controls">
          <div className="topology-progress">
            {BEATS.map((b, i) => (
              <button
                key={b.chip}
                className={`topology-tick ${i === beat ? "active" : ""} ${i < beat ? "done" : ""}`}
                onClick={() => { setPlaying(false); go(i); }}
                aria-label={`Step ${i + 1}: ${b.chip}`}
              />
            ))}
          </div>
          <div className="topology-buttons">
            <button onClick={() => { setPlaying(false); go(beat - 1); }} aria-label="Previous step">‹</button>
            <button className="play" onClick={() => setPlaying((p) => !p)} aria-label={playing ? "Pause" : "Play"}>
              {playing ? "❚❚" : "▶"}
            </button>
            <button onClick={() => { setPlaying(false); go(beat + 1); }} aria-label="Next step">›</button>
          </div>
        </div>
      </div>
    </div>
  );
}
