"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

export interface GNode {
  path: string;
  title: string;
  folder: string;
  hot: boolean;
  fav: boolean;
}
export interface GEdge {
  a: string;
  b: string;
  /** true = inferred from a daily log's co-occurrence rather than a direct wiki-link */
  soft?: boolean;
}

interface SimNode extends GNode {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  degree: number;
}

const ORANGE = "#ff6200";
const NODE_DIM = "#39424e";
const NODE_TEXT = "rgba(242,242,238,0.85)";

export default function GraphScreen({ nodes, edges, logCount = 0 }: { nodes: GNode[]; edges: GEdge[]; logCount?: number }) {
  const router = useRouter();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [selected, setSelected] = useState<SimNode | null>(null);
  const [folderFilter, setFolderFilter] = useState<string | null>(null);
  const stateRef = useRef<{
    sim: SimNode[];
    byPath: Map<string, SimNode>;
    edges: { a: SimNode; b: SimNode; soft: boolean }[];
    view: { x: number; y: number; k: number };
    alpha: number;
    dragging: SimNode | null;
    selected: SimNode | null;
    filter: string | null;
  } | null>(null);

  const folders = useMemo(() => {
    const counts = new Map<string, number>();
    nodes.forEach((n) => counts.set(n.folder, (counts.get(n.folder) ?? 0) + 1));
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
  }, [nodes]);

  /* ---------- init simulation ---------- */
  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;

    const DPR = Math.min(2, window.devicePixelRatio || 1);
    const W = wrap.clientWidth;
    const H = Math.max(420, window.innerHeight - 320);
    canvas.width = W * DPR;
    canvas.height = H * DPR;
    canvas.style.width = `${W}px`;
    canvas.style.height = `${H}px`;
    const ctx = canvas.getContext("2d")!;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);

    const degree = new Map<string, number>();
    edges.forEach((e) => {
      degree.set(e.a, (degree.get(e.a) ?? 0) + 1);
      degree.set(e.b, (degree.get(e.b) ?? 0) + 1);
    });

    // seed positions: cluster by folder around a ring
    const folderList = [...new Set(nodes.map((n) => n.folder))];
    const folderAngle = new Map(folderList.map((f, i) => [f, (i / folderList.length) * Math.PI * 2]));
    const sim: SimNode[] = nodes.map((n, i) => {
      const ang = (folderAngle.get(n.folder) ?? 0) + (i % 7) * 0.13;
      const rad = 90 + (i % 5) * 22;
      const d = degree.get(n.path) ?? 0;
      return {
        ...n,
        x: W / 2 + Math.cos(ang) * rad,
        y: H / 2 + Math.sin(ang) * rad,
        vx: 0,
        vy: 0,
        degree: d,
        r: 3 + Math.min(7, Math.sqrt(d) * 1.9),
      };
    });
    const byPath = new Map(sim.map((n) => [n.path, n]));
    const simEdges = edges
      .map((e) => ({ a: byPath.get(e.a)!, b: byPath.get(e.b)!, soft: !!e.soft }))
      .filter((e) => e.a && e.b);

    const st = {
      sim,
      byPath,
      edges: simEdges,
      view: { x: 0, y: 0, k: 1 },
      alpha: 1,
      dragging: null as SimNode | null,
      selected: null as SimNode | null,
      filter: null as string | null,
    };
    stateRef.current = st;

    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    let running = true;

    const step = () => {
      if (!running) return;
      const a = st.alpha;
      if (a > 0.003) {
        // repulsion (O(n²) fine at this scale)
        for (let i = 0; i < sim.length; i++) {
          for (let j = i + 1; j < sim.length; j++) {
            const n1 = sim[i], n2 = sim[j];
            let dx = n1.x - n2.x, dy = n1.y - n2.y;
            let d2 = dx * dx + dy * dy;
            if (d2 < 1) { dx = Math.random() - 0.5; dy = Math.random() - 0.5; d2 = 1; }
            const f = Math.min(120, 900 / d2) * a;
            const d = Math.sqrt(d2);
            const fx = (dx / d) * f, fy = (dy / d) * f;
            n1.vx += fx; n1.vy += fy;
            n2.vx -= fx; n2.vy -= fy;
          }
        }
        // springs
        for (const e of st.edges) {
          const dx = e.b.x - e.a.x, dy = e.b.y - e.a.y;
          const d = Math.max(1, Math.sqrt(dx * dx + dy * dy));
          // bridged edges pull more weakly — they're weaker evidence than a real link
          const f = (d - 64) * (e.soft ? 0.006 : 0.012) * a;
          const fx = (dx / d) * f, fy = (dy / d) * f;
          e.a.vx += fx; e.a.vy += fy;
          e.b.vx -= fx; e.b.vy -= fy;
        }
        // center gravity + integrate
        for (const n of sim) {
          n.vx += (W / 2 - n.x) * 0.0035 * a;
          n.vy += (H / 2 - n.y) * 0.0035 * a;
          if (st.dragging !== n) {
            n.vx *= 0.82; n.vy *= 0.82;
            n.x += n.vx; n.y += n.vy;
          }
        }
        st.alpha *= reduce ? 0.85 : 0.985;
      }
      draw(ctx, W, H, st);
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);

    /* ---------- gestures ---------- */
    const pointers = new Map<number, { x: number; y: number }>();
    let pinchStart: { dist: number; k: number } | null = null;
    let panStart: { x: number; y: number; vx: number; vy: number } | null = null;
    let moved = false;

    const toWorld = (px: number, py: number) => ({
      x: (px - st.view.x) / st.view.k,
      y: (py - st.view.y) / st.view.k,
    });
    const pick = (px: number, py: number): SimNode | null => {
      const { x, y } = toWorld(px, py);
      let best: SimNode | null = null, bestD = 18;
      for (const n of sim) {
        const d = Math.hypot(n.x - x, n.y - y);
        if (d < bestD + n.r) { best = n; bestD = d; }
      }
      return best;
    };
    const pos = (ev: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      return { x: ev.clientX - rect.left, y: ev.clientY - rect.top };
    };

    const down = (ev: PointerEvent) => {
      canvas.setPointerCapture(ev.pointerId);
      const p = pos(ev);
      pointers.set(ev.pointerId, p);
      moved = false;
      if (pointers.size === 2) {
        const [p1, p2] = [...pointers.values()];
        pinchStart = { dist: Math.hypot(p1.x - p2.x, p1.y - p2.y), k: st.view.k };
        st.dragging = null;
      } else {
        const hit = pick(p.x, p.y);
        if (hit) { st.dragging = hit; st.alpha = Math.max(st.alpha, 0.35); }
        else panStart = { x: p.x, y: p.y, vx: st.view.x, vy: st.view.y };
      }
    };
    const move = (ev: PointerEvent) => {
      if (!pointers.has(ev.pointerId)) return;
      const p = pos(ev);
      const prev = pointers.get(ev.pointerId)!;
      if (Math.hypot(p.x - prev.x, p.y - prev.y) > 3) moved = true;
      pointers.set(ev.pointerId, p);

      if (pointers.size === 2 && pinchStart) {
        const [p1, p2] = [...pointers.values()];
        const dist = Math.hypot(p1.x - p2.x, p1.y - p2.y);
        const k = Math.max(0.4, Math.min(3.2, (pinchStart.k * dist) / pinchStart.dist));
        const cx = (p1.x + p2.x) / 2, cy = (p1.y + p2.y) / 2;
        const w = toWorld(cx, cy);
        st.view.k = k;
        st.view.x = cx - w.x * k;
        st.view.y = cy - w.y * k;
      } else if (st.dragging) {
        const w = toWorld(p.x, p.y);
        st.dragging.x = w.x; st.dragging.y = w.y;
        st.dragging.vx = 0; st.dragging.vy = 0;
        st.alpha = Math.max(st.alpha, 0.25);
      } else if (panStart) {
        st.view.x = panStart.vx + (p.x - panStart.x);
        st.view.y = panStart.vy + (p.y - panStart.y);
      }
    };
    const up = (ev: PointerEvent) => {
      const p = pos(ev);
      if (!moved && pointers.size === 1) {
        const hit = pick(p.x, p.y);
        st.selected = hit;
        setSelected(hit);
      }
      pointers.delete(ev.pointerId);
      if (pointers.size < 2) pinchStart = null;
      st.dragging = null;
      panStart = null;
    };
    const wheel = (ev: WheelEvent) => {
      ev.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const cx = ev.clientX - rect.left, cy = ev.clientY - rect.top;
      const w = toWorld(cx, cy);
      const k = Math.max(0.4, Math.min(3.2, st.view.k * (ev.deltaY < 0 ? 1.12 : 0.89)));
      st.view.k = k;
      st.view.x = cx - w.x * k;
      st.view.y = cy - w.y * k;
    };

    canvas.addEventListener("pointerdown", down);
    canvas.addEventListener("pointermove", move);
    canvas.addEventListener("pointerup", up);
    canvas.addEventListener("pointercancel", up);
    canvas.addEventListener("wheel", wheel, { passive: false });

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      canvas.removeEventListener("pointerdown", down);
      canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointerup", up);
      canvas.removeEventListener("pointercancel", up);
      canvas.removeEventListener("wheel", wheel);
    };
  }, [nodes, edges]);

  // sync filter into the render loop
  useEffect(() => {
    if (stateRef.current) stateRef.current.filter = folderFilter;
  }, [folderFilter]);

  return (
    <div>
      <div className="font-data" style={{ display: "flex", justifyContent: "space-between", fontSize: 9, letterSpacing: "0.16em", color: "var(--color-faint)", marginBottom: 8 }}>
        <span>
          <span style={{ color: "var(--acc)" }}>{nodes.length}</span> NODES ·{" "}
          <span style={{ color: "var(--acc)" }}>{edges.length}</span> LINKS
        </span>
        <span>DRAG · PINCH · TAP</span>
      </div>

      <div ref={wrapRef} className="panel ticks" style={{ position: "relative", overflow: "hidden", touchAction: "none" }}>
        <canvas ref={canvasRef} style={{ display: "block" }} />
        {selected && (
          <div
            style={{
              position: "absolute",
              left: 8,
              right: 8,
              bottom: 8,
              background: "rgba(7,7,8,0.94)",
              border: "1px solid var(--acc-line)",
              padding: "10px 12px",
              display: "flex",
              alignItems: "center",
              gap: 10,
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12.5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{selected.title}</div>
              <div className="font-data" style={{ fontSize: 8.5, color: "var(--color-faint)" }}>
                {selected.path} · {selected.degree} links
              </div>
            </div>
            <button
              onClick={() => router.push(`/vault/${selected.path.replace(/\.md$/, "")}`)}
              className="font-display"
              style={{ background: "var(--acc)", color: "#050505", padding: "8px 13px", fontWeight: 700, letterSpacing: "0.1em", fontSize: 12 }}
            >
              OPEN ▸
            </button>
          </div>
        )}
      </div>

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 }}>
        {folders.map(([f, count]) => (
          <button
            key={f}
            onClick={() => setFolderFilter(folderFilter === f ? null : f)}
            className="font-data"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              fontSize: 9,
              letterSpacing: "0.14em",
              padding: "6px 9px",
              border: folderFilter === f ? "1px solid var(--acc)" : "1px solid var(--color-line)",
              color: folderFilter === f ? "var(--acc)" : "var(--color-dim)",
              background: folderFilter === f ? "var(--acc-soft)" : "transparent",
            }}
          >
            <i style={{ width: 6, height: 6, background: folderFilter === f ? "var(--acc)" : NODE_DIM }} />
            {f.toUpperCase()} <b style={{ color: "var(--acc)", fontWeight: 400 }}>{count}</b>
          </button>
        ))}
      </div>

      {logCount > 0 && (
        <p className="font-data" style={{ marginTop: 10, fontSize: 8.5, letterSpacing: "0.1em", color: "var(--color-faint)", lineHeight: 1.7 }}>
{`${logCount} DAILY LOGS ARE HIDDEN — WHAT THEY MENTIONED IS LINKED DIRECTLY INSTEAD (FAINT LINES).`}
        </p>
      )}
    </div>
  );
}

/* ---------- rendering ---------- */
function draw(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  st: NonNullable<React.MutableRefObject<{
    sim: SimNode[];
    edges: { a: SimNode; b: SimNode; soft: boolean }[];
    view: { x: number; y: number; k: number };
    selected: SimNode | null;
    filter: string | null;
  } | null>["current"]>
) {
  ctx.clearRect(0, 0, W, H);

  // dotted grid backdrop
  ctx.fillStyle = "rgba(255,255,255,0.045)";
  for (let gx = 12; gx < W; gx += 26) {
    for (let gy = 12; gy < H; gy += 26) ctx.fillRect(gx, gy, 1, 1);
  }

  ctx.save();
  ctx.translate(st.view.x, st.view.y);
  ctx.scale(st.view.k, st.view.k);

  const sel = st.selected;
  const neighbors = new Set<string>();
  if (sel) {
    neighbors.add(sel.path);
    for (const e of st.edges) {
      if (e.a === sel) neighbors.add(e.b.path);
      if (e.b === sel) neighbors.add(e.a.path);
    }
  }
  const visible = (n: SimNode) =>
    (!st.filter || n.folder === st.filter) && (!sel || neighbors.has(n.path));

  // edges
  for (const e of st.edges) {
    const active = visible(e.a) && visible(e.b);
    const touchesSel = sel && (e.a === sel || e.b === sel);
    // bridged (co-occurred-in-a-daily-log) edges render fainter than real wiki-links
    ctx.strokeStyle = touchesSel
      ? e.soft
        ? "rgba(255,98,0,0.28)"
        : "rgba(255,98,0,0.55)"
      : active
      ? e.soft
        ? "rgba(255,255,255,0.045)"
        : "rgba(255,255,255,0.10)"
      : "rgba(255,255,255,0.03)";
    ctx.lineWidth = touchesSel ? 1.2 : 0.6;
    ctx.beginPath();
    ctx.moveTo(e.a.x, e.a.y);
    ctx.lineTo(e.b.x, e.b.y);
    ctx.stroke();
  }

  // nodes
  for (const n of st.sim) {
    const on = visible(n);
    const isSel = sel === n;
    ctx.beginPath();
    ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
    if (n.hot || n.fav) {
      ctx.fillStyle = on ? ORANGE : "rgba(255,98,0,0.18)";
      if (on) { ctx.shadowColor = "rgba(255,98,0,0.8)"; ctx.shadowBlur = 10; }
    } else {
      ctx.fillStyle = on ? NODE_DIM : "rgba(57,66,78,0.25)";
    }
    ctx.fill();
    ctx.shadowBlur = 0;
    if (isSel) {
      ctx.strokeStyle = "#f2f2ee";
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.arc(n.x, n.y, n.r + 3.5, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  // labels for prominent/selected nodes
  ctx.font = `${10 / st.view.k < 8 ? 8 : 10}px "Share Tech Mono", monospace`;
  ctx.textAlign = "center";
  for (const n of st.sim) {
    const show = visible(n) && (n.degree >= 5 || sel === n || st.view.k > 1.6);
    if (!show) continue;
    ctx.fillStyle = sel === n ? "#fff" : NODE_TEXT;
    const label = n.title.length > 22 ? `${n.title.slice(0, 21)}…` : n.title;
    ctx.fillText(label, n.x, n.y - n.r - 5);
  }

  ctx.restore();
}
