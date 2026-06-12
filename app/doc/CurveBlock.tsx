"use client";

// Stat curve block: inline SVG plot of 1–3 series over a shared x-domain.
// Each series is a formula or hand-dragged points. Pure JSON in, JSON out —
// the parent persists via the normal block pipeline (see BlockEditor).

import { useMemo, useRef, useState } from "react";
import type { CurveData, CurveSeries } from "./data";
import {
  compileFormula,
  CURVE_PRESETS,
  fmt,
  pointsInterpolator,
  sampleSeries,
  type SampledSeries,
} from "./curve";

const MAX_SERIES = 3;
/** Series colors: ember first, then teammates' blue / green from the palette. */
const SERIES_COLORS = ["var(--ember)", "#5a83d6", "#3f9d6e"];

const W = 560;
const H = 220;
const PAD = { l: 46, r: 12, t: 10, b: 26 };

export const DEFAULT_CURVE: CurveData = {
  domain: [1, 60],
  series: [{ label: "Series 1", mode: "formula", formula: "50 * x^1.8" }],
  xLabel: "level",
  yLabel: "value",
};

/** Fill in anything missing — rows written by other clients may be sparse. */
function normalize(c: CurveData | undefined): CurveData {
  const d = c ?? DEFAULT_CURVE;
  const domain: [number, number] =
    Array.isArray(d.domain) && d.domain.length === 2 && d.domain[0] < d.domain[1]
      ? d.domain
      : [1, 60];
  const series =
    Array.isArray(d.series) && d.series.length > 0
      ? d.series.slice(0, MAX_SERIES)
      : DEFAULT_CURVE.series;
  return { ...d, domain, series };
}

/** "Nice" tick values for an axis range. */
function ticks(min: number, max: number, n = 4): number[] {
  const span = max - min;
  if (!(span > 0)) return [min];
  const step = Math.pow(10, Math.floor(Math.log10(span / n)));
  const candidates = [step, step * 2, step * 5, step * 10];
  const s = candidates.find((c) => span / c <= n + 1) ?? step * 10;
  const out: number[] = [];
  for (let v = Math.ceil(min / s) * s; v <= max + s * 1e-9; v += s) {
    out.push(parseFloat(v.toPrecision(12)));
  }
  return out;
}

export default function CurveBlock({
  data,
  onChange,
}: {
  data: CurveData | undefined;
  onChange: (curve: CurveData) => void;
}) {
  const curve = normalize(data);
  const [active, setActive] = useState(0);
  const [copied, setCopied] = useState(false);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const dragRef = useRef<{ series: number; point: number } | null>(null);

  const activeIdx = Math.min(active, curve.series.length - 1);
  const activeSeries = curve.series[activeIdx];

  const sampled: SampledSeries[] = useMemo(
    () => curve.series.map((s) => sampleSeries(s, curve.domain)),
    [curve.series, curve.domain],
  );

  // Shared y-range across series (plus visible points), padded a touch.
  const [yMin, yMax] = useMemo(() => {
    let lo = Infinity;
    let hi = -Infinity;
    for (const s of sampled) {
      for (const v of s.values) {
        if (Number.isFinite(v.y)) {
          lo = Math.min(lo, v.y);
          hi = Math.max(hi, v.y);
        }
      }
    }
    for (const s of curve.series) {
      if (s.mode === "points") {
        for (const [, y] of s.points ?? []) {
          lo = Math.min(lo, y);
          hi = Math.max(hi, y);
        }
      }
    }
    if (!Number.isFinite(lo) || !Number.isFinite(hi)) return [0, 1];
    if (lo === hi) return [lo - 1, hi + 1];
    const pad = (hi - lo) * 0.06;
    return [lo >= 0 && lo - pad < 0 ? 0 : lo - pad, hi + pad];
  }, [sampled, curve.series]);

  const [xMin, xMax] = curve.domain;
  const px = (x: number) => PAD.l + ((x - xMin) / (xMax - xMin)) * (W - PAD.l - PAD.r);
  const py = (y: number) => H - PAD.b - ((y - yMin) / (yMax - yMin)) * (H - PAD.t - PAD.b);
  const fromPx = (cx: number, cy: number): [number, number] => [
    xMin + ((cx - PAD.l) / (W - PAD.l - PAD.r)) * (xMax - xMin),
    yMin + ((H - PAD.b - cy) / (H - PAD.t - PAD.b)) * (yMax - yMin),
  ];

  const pathFor = (s: SampledSeries): string => {
    let d = "";
    let pen = false;
    for (const v of s.values) {
      if (!Number.isFinite(v.y)) {
        pen = false;
        continue;
      }
      const cmd = pen ? "L" : "M";
      d += `${cmd}${px(v.x).toFixed(1)},${py(Math.max(yMin, Math.min(yMax, v.y))).toFixed(1)}`;
      pen = true;
    }
    return d;
  };

  /* ---------- mutations (always emit a fresh CurveData) ---------- */
  const patch = (p: Partial<CurveData>) => onChange({ ...curve, ...p });
  const patchSeries = (i: number, p: Partial<CurveSeries>) =>
    patch({ series: curve.series.map((s, j) => (j === i ? { ...s, ...p } : s)) });

  const addSeries = () => {
    if (curve.series.length >= MAX_SERIES) return;
    patch({
      series: [
        ...curve.series,
        { label: `Series ${curve.series.length + 1}`, mode: "formula", formula: "10 * x" },
      ],
    });
    setActive(curve.series.length);
  };
  const removeSeries = (i: number) => {
    if (curve.series.length <= 1) return;
    patch({ series: curve.series.filter((_, j) => j !== i) });
    setActive(0);
  };

  const setMode = (mode: "formula" | "points") => {
    if (mode === activeSeries.mode) return;
    if (mode === "points" && !(activeSeries.points?.length)) {
      // Seed editable points from the current formula so the shape carries over.
      const seed = sampleSeries(activeSeries, curve.domain, 7).values
        .filter((v) => Number.isFinite(v.y))
        .map((v): [number, number] => [
          parseFloat(v.x.toPrecision(6)),
          parseFloat(v.y.toPrecision(6)),
        ]);
      patchSeries(activeIdx, { mode, points: seed.length >= 2 ? seed : [[xMin, 0], [xMax, 10]] });
    } else {
      patchSeries(activeIdx, { mode });
    }
  };

  /* ---------- point editing (active series, points mode only) ---------- */
  const svgPoint = (e: React.PointerEvent): [number, number] | null => {
    const svg = svgRef.current;
    if (!svg) return null;
    const r = svg.getBoundingClientRect();
    const cx = ((e.clientX - r.left) / r.width) * W;
    const cy = ((e.clientY - r.top) / r.height) * H;
    return fromPx(cx, cy);
  };

  const clampPt = (p: [number, number]): [number, number] => [
    Math.max(xMin, Math.min(xMax, parseFloat(p[0].toPrecision(6)))),
    parseFloat(p[1].toPrecision(6)),
  ];

  const onPlotPointerDown = (e: React.PointerEvent) => {
    if (activeSeries.mode !== "points") return;
    if ((e.target as Element).closest("[data-handle]")) return; // handled below
    const p = svgPoint(e);
    if (!p) return;
    const pts = [...(activeSeries.points ?? []), clampPt(p)].sort((a, b) => a[0] - b[0]);
    patchSeries(activeIdx, { points: pts });
  };

  const onHandleDown = (e: React.PointerEvent, pointIdx: number) => {
    e.stopPropagation();
    dragRef.current = { series: activeIdx, point: pointIdx };
    (e.target as Element).setPointerCapture(e.pointerId);
  };
  const onHandleMove = (e: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    const p = svgPoint(e);
    if (!p) return;
    const pts = [...(curve.series[drag.series].points ?? [])];
    pts[drag.point] = clampPt(p);
    // Keep sorted by x; track the moved point through the re-sort.
    const moved = pts[drag.point];
    pts.sort((a, b) => a[0] - b[0]);
    drag.point = pts.indexOf(moved);
    patchSeries(drag.series, { points: pts });
  };
  const onHandleUp = () => {
    dragRef.current = null;
  };
  const removePoint = (pointIdx: number) => {
    const pts = activeSeries.points ?? [];
    if (pts.length <= 2) return; // a curve needs at least two points
    patchSeries(activeIdx, { points: pts.filter((_, j) => j !== pointIdx) });
  };

  /* ---------- values table ---------- */
  const step = curve.tableStep ?? 0;
  const tableRows: number[] = useMemo(() => {
    if (!(step > 0)) return [];
    const rows: number[] = [];
    for (let x = xMin; x <= xMax + 1e-9 && rows.length < 200; x += step) {
      rows.push(parseFloat(x.toPrecision(10)));
    }
    return rows;
  }, [step, xMin, xMax]);

  const evaluators = useMemo(
    () =>
      curve.series.map((s) => {
        if (s.mode === "formula") {
          try {
            return compileFormula(s.formula ?? "").eval;
          } catch {
            return null;
          }
        }
        return pointsInterpolator(s.points ?? []);
      }),
    [curve.series],
  );

  const copyTable = async () => {
    const header = [curve.xLabel || "x", ...curve.series.map((s) => s.label)].join("\t");
    const lines = tableRows.map((x) =>
      [x, ...evaluators.map((f) => (f ? fmt(f(x)) : "—"))].join("\t"),
    );
    try {
      await navigator.clipboard.writeText([header, ...lines].join("\n"));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked — values stay visible to copy by hand */
    }
  };

  const xTicks = ticks(xMin, xMax);
  const yTicks = ticks(yMin, yMax);
  const activeError = sampled[activeIdx]?.error;

  return (
    <div className="curve" contentEditable={false}>
      {/* series chips + add */}
      <div className="curve-head">
        <div className="curve-chips">
          {curve.series.map((s, i) => (
            <button
              key={i}
              type="button"
              className={"curve-chip" + (i === activeIdx ? " is-active" : "")}
              style={{ "--series": SERIES_COLORS[i] } as React.CSSProperties}
              onClick={() => setActive(i)}
            >
              <span className="curve-chip-dot" />
              {s.label || `Series ${i + 1}`}
            </button>
          ))}
          {curve.series.length < MAX_SERIES && (
            <button type="button" className="curve-add" onClick={addSeries} title="Add a series">
              +
            </button>
          )}
        </div>
        <div className="curve-mode">
          <button
            type="button"
            className={"curve-mode-btn" + (activeSeries.mode === "formula" ? " is-on" : "")}
            onClick={() => setMode("formula")}
          >
            Formula
          </button>
          <button
            type="button"
            className={"curve-mode-btn" + (activeSeries.mode === "points" ? " is-on" : "")}
            onClick={() => setMode("points")}
          >
            Points
          </button>
        </div>
      </div>

      {/* active series controls */}
      <div className="curve-controls">
        <input
          className="curve-input curve-label-input"
          value={activeSeries.label}
          maxLength={40}
          onChange={(e) => patchSeries(activeIdx, { label: e.target.value })}
          placeholder="Label"
          title="Series label"
        />
        {activeSeries.mode === "formula" ? (
          <>
            <input
              className={"curve-input curve-formula" + (activeError ? " is-error" : "")}
              value={activeSeries.formula ?? ""}
              onChange={(e) => patchSeries(activeIdx, { formula: e.target.value })}
              placeholder="e.g. 50 * level^1.8"
              spellCheck={false}
            />
            <select
              className="curve-input curve-preset"
              value=""
              onChange={(e) => {
                const p = CURVE_PRESETS.find((q) => q.label === e.target.value);
                if (p) patchSeries(activeIdx, { formula: p.formula });
              }}
              title="Start from a preset"
            >
              <option value="" disabled>
                Preset…
              </option>
              {CURVE_PRESETS.map((p) => (
                <option key={p.label} value={p.label}>
                  {p.label}
                </option>
              ))}
            </select>
          </>
        ) : (
          <span className="curve-hint">
            Click the plot to add points · drag to move · double-click a point to remove
          </span>
        )}
        {curve.series.length > 1 && (
          <button
            type="button"
            className="curve-remove"
            onClick={() => removeSeries(activeIdx)}
            title="Remove this series"
          >
            Remove
          </button>
        )}
      </div>
      {activeError && <p className="curve-error">{activeError}</p>}

      {/* plot */}
      <svg
        ref={svgRef}
        className={"curve-plot" + (activeSeries.mode === "points" ? " is-editable" : "")}
        viewBox={`0 0 ${W} ${H}`}
        onPointerDown={onPlotPointerDown}
        role="img"
        aria-label={`Curve: ${curve.series.map((s) => s.label).join(", ")}`}
      >
        {yTicks.map((t) => (
          <g key={`y${t}`}>
            <line className="curve-grid" x1={PAD.l} x2={W - PAD.r} y1={py(t)} y2={py(t)} />
            <text className="curve-tick" x={PAD.l - 6} y={py(t) + 3} textAnchor="end">
              {fmt(t)}
            </text>
          </g>
        ))}
        {xTicks.map((t) => (
          <text
            key={`x${t}`}
            className="curve-tick"
            x={px(t)}
            y={H - PAD.b + 14}
            textAnchor="middle"
          >
            {fmt(t)}
          </text>
        ))}
        <line className="curve-axis" x1={PAD.l} x2={W - PAD.r} y1={H - PAD.b} y2={H - PAD.b} />
        <line className="curve-axis" x1={PAD.l} x2={PAD.l} y1={PAD.t} y2={H - PAD.b} />
        {curve.series.map((s, i) => (
          <path
            key={i}
            className={"curve-line" + (i === activeIdx ? " is-active" : "")}
            d={pathFor(sampled[i])}
            style={{ stroke: SERIES_COLORS[i] }}
          />
        ))}
        {activeSeries.mode === "points" &&
          (activeSeries.points ?? []).map((p, i) => (
            <circle
              key={i}
              data-handle
              className="curve-handle"
              cx={px(p[0])}
              cy={py(Math.max(yMin, Math.min(yMax, p[1])))}
              r={5.5}
              style={{ fill: SERIES_COLORS[activeIdx] }}
              onPointerDown={(e) => onHandleDown(e, i)}
              onPointerMove={onHandleMove}
              onPointerUp={onHandleUp}
              onDoubleClick={() => removePoint(i)}
            />
          ))}
        {curve.yLabel && (
          <text className="curve-axis-label" x={PAD.l + 4} y={PAD.t + 8}>
            {curve.yLabel}
          </text>
        )}
        {curve.xLabel && (
          <text className="curve-axis-label" x={W - PAD.r} y={H - PAD.b - 5} textAnchor="end">
            {curve.xLabel}
          </text>
        )}
      </svg>

      {/* domain + labels + table toggle */}
      <div className="curve-foot">
        <label className="curve-foot-field">
          {curve.xLabel || "x"} from
          <input
            className="curve-input curve-num"
            type="number"
            value={xMin}
            onChange={(e) => {
              const v = parseFloat(e.target.value);
              if (Number.isFinite(v) && v < xMax) patch({ domain: [v, xMax] });
            }}
          />
          to
          <input
            className="curve-input curve-num"
            type="number"
            value={xMax}
            onChange={(e) => {
              const v = parseFloat(e.target.value);
              if (Number.isFinite(v) && v > xMin) patch({ domain: [xMin, v] });
            }}
          />
        </label>
        <label className="curve-foot-field">
          axis labels
          <input
            className="curve-input curve-axis-input"
            value={curve.xLabel ?? ""}
            maxLength={24}
            placeholder="x"
            onChange={(e) => patch({ xLabel: e.target.value })}
          />
          <input
            className="curve-input curve-axis-input"
            value={curve.yLabel ?? ""}
            maxLength={24}
            placeholder="y"
            onChange={(e) => patch({ yLabel: e.target.value })}
          />
        </label>
        <label className="curve-foot-field">
          table every
          <input
            className="curve-input curve-num"
            type="number"
            min={0}
            value={step || ""}
            placeholder="off"
            onChange={(e) => {
              const v = parseFloat(e.target.value);
              patch({ tableStep: Number.isFinite(v) && v > 0 ? v : 0 });
            }}
          />
        </label>
      </div>

      {/* sampled values */}
      {tableRows.length > 0 && (
        <div className="curve-table-wrap">
          <table className="curve-table">
            <thead>
              <tr>
                <th>{curve.xLabel || "x"}</th>
                {curve.series.map((s, i) => (
                  <th key={i}>
                    <span
                      className="curve-chip-dot"
                      style={{ "--series": SERIES_COLORS[i] } as React.CSSProperties}
                    />
                    {s.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tableRows.map((x) => (
                <tr key={x}>
                  <td>{fmt(x)}</td>
                  {evaluators.map((f, i) => (
                    <td key={i}>{f ? fmt(f(x)) : "—"}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <button type="button" className="curve-copy" onClick={copyTable}>
            {copied ? "Copied!" : "Copy as TSV"}
          </button>
        </div>
      )}
    </div>
  );
}
