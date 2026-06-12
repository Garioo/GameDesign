// Formula engine + sampling helpers for the stat curve block.
//
// Formulas are one-variable math ("50 * level^1.8") compiled to RPN via
// shunting-yard and evaluated per sample — no eval(), no Function(), so
// nothing typed into a doc can execute as code. Any bare identifier that
// isn't a known constant or function reads as the x variable, which lets
// designers write "level", "wave", "depth"… without declaring anything.

export type CompiledFormula = {
  /** Evaluate at x. Returns NaN for math errors (log of negatives etc.). */
  eval: (x: number) => number;
};

const FUNCS: Record<string, (v: number) => number> = {
  sqrt: Math.sqrt,
  abs: Math.abs,
  log: Math.log, // natural log
  log2: Math.log2,
  log10: Math.log10,
  exp: Math.exp,
  floor: Math.floor,
  ceil: Math.ceil,
  round: Math.round,
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
};

const CONSTS: Record<string, number> = {
  pi: Math.PI,
  e: Math.E,
};

type Tok =
  | { k: "num"; v: number }
  | { k: "x" }
  | { k: "const"; v: number }
  | { k: "fn"; name: string }
  | { k: "op"; op: string }
  | { k: "(" }
  | { k: ")" };

function tokenize(src: string): Tok[] {
  const toks: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === " " || c === "\t") {
      i++;
    } else if (/[0-9.]/.test(c)) {
      const m = /^\d*\.?\d+(e[+-]?\d+)?/i.exec(src.slice(i));
      if (!m) throw new Error(`Bad number at "${src.slice(i, i + 8)}"`);
      toks.push({ k: "num", v: parseFloat(m[0]) });
      i += m[0].length;
    } else if (/[a-zA-Z_]/.test(c)) {
      const m = /^[a-zA-Z_][a-zA-Z0-9_]*/.exec(src.slice(i))!;
      const name = m[0].toLowerCase();
      i += m[0].length;
      if (FUNCS[name]) toks.push({ k: "fn", name });
      else if (name in CONSTS) toks.push({ k: "const", v: CONSTS[name] });
      else toks.push({ k: "x" }); // any other identifier is the variable
    } else if ("+-*/^".includes(c)) {
      toks.push({ k: "op", op: c });
      i++;
    } else if (c === "(") {
      toks.push({ k: "(" });
      i++;
    } else if (c === ")") {
      toks.push({ k: ")" });
      i++;
    } else {
      throw new Error(`Unexpected "${c}"`);
    }
  }
  return toks;
}

// "neg" sits between * and ^ so -x^2 parses as -(x^2), like calculators do.
const PREC: Record<string, number> = { "+": 1, "-": 1, "*": 2, "/": 2, neg: 2.5, "^": 3 };
const RIGHT_ASSOC = new Set(["^", "neg"]);

/** Compile a formula, or throw with a human-readable message. */
export function compileFormula(src: string): CompiledFormula {
  const toks = tokenize(src);
  if (toks.length === 0) throw new Error("Empty formula");

  // Shunting-yard with unary minus rewritten to "neg".
  const out: Tok[] = [];
  const stack: Tok[] = [];
  let prev: Tok | null = null;
  for (const t of toks) {
    if (t.k === "num" || t.k === "x" || t.k === "const") {
      out.push(t);
    } else if (t.k === "fn") {
      stack.push(t);
    } else if (t.k === "op") {
      const unary =
        t.op === "-" &&
        (!prev || prev.k === "(" || prev.k === "op" || prev.k === "fn");
      const op = unary ? "neg" : t.op;
      while (stack.length) {
        const top = stack[stack.length - 1];
        const topPrec =
          top.k === "op" ? PREC[top.op] : top.k === "fn" ? 5 : -1;
        if (
          topPrec > PREC[op] ||
          (topPrec === PREC[op] && !RIGHT_ASSOC.has(op))
        ) {
          out.push(stack.pop()!);
        } else break;
      }
      stack.push({ k: "op", op });
    } else if (t.k === "(") {
      stack.push(t);
    } else {
      // ")"
      let matched = false;
      while (stack.length) {
        const top = stack.pop()!;
        if (top.k === "(") {
          matched = true;
          break;
        }
        out.push(top);
      }
      if (!matched) throw new Error("Unbalanced parentheses");
      if (stack.length && stack[stack.length - 1].k === "fn") out.push(stack.pop()!);
    }
    prev = t;
  }
  while (stack.length) {
    const top = stack.pop()!;
    if (top.k === "(") throw new Error("Unbalanced parentheses");
    out.push(top);
  }

  // One dry run so syntax errors surface at compile time, not first sample.
  const run = (x: number): number => {
    const st: number[] = [];
    for (const t of out) {
      if (t.k === "num" || t.k === "const") st.push(t.v);
      else if (t.k === "x") st.push(x);
      else if (t.k === "fn") {
        if (st.length < 1) throw new Error("Malformed formula");
        st.push(FUNCS[t.name](st.pop()!));
      } else if (t.k === "op") {
        if (t.op === "neg") {
          if (st.length < 1) throw new Error("Malformed formula");
          st.push(-st.pop()!);
        } else {
          if (st.length < 2) throw new Error("Malformed formula");
          const b = st.pop()!;
          const a = st.pop()!;
          st.push(
            t.op === "+" ? a + b
            : t.op === "-" ? a - b
            : t.op === "*" ? a * b
            : t.op === "/" ? a / b
            : Math.pow(a, b),
          );
        }
      }
    }
    if (st.length !== 1) throw new Error("Malformed formula");
    return st[0];
  };
  run(1);

  return {
    eval: (x: number) => {
      try {
        return run(x);
      } catch {
        return NaN;
      }
    },
  };
}

/* ---------- presets ---------- */
export interface CurvePreset {
  label: string;
  formula: string;
}
export const CURVE_PRESETS: CurvePreset[] = [
  { label: "Linear", formula: "10 * x" },
  { label: "Power (XP-style)", formula: "50 * x^1.8" },
  { label: "Exponential", formula: "10 * 1.15^x" },
  { label: "Logarithmic", formula: "40 * log(x + 1)" },
  { label: "Logistic (S-curve)", formula: "100 / (1 + exp(-0.15 * (x - 30)))" },
  { label: "Decay", formula: "100 * 0.92^x" },
];

/* ---------- sampling ---------- */

/**
 * Smooth interpolation through hand-placed points: monotone cubic (Fritsch–
 * Carlson), which never overshoots between points — for game curves that
 * matters more than perfect smoothness. Outside the points' x-range the
 * curve clamps to the end values.
 */
export function pointsInterpolator(pts: [number, number][]): (x: number) => number {
  const p = [...pts].sort((a, b) => a[0] - b[0]);
  if (p.length === 0) return () => NaN;
  if (p.length === 1) return () => p[0][1];

  const n = p.length;
  const xs = p.map((q) => q[0]);
  const ys = p.map((q) => q[1]);
  const dx: number[] = [];
  const slope: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    const h = xs[i + 1] - xs[i] || 1e-9;
    dx.push(h);
    slope.push((ys[i + 1] - ys[i]) / h);
  }
  // Tangents (Fritsch–Carlson)
  const m: number[] = [slope[0]];
  for (let i = 1; i < n - 1; i++) {
    if (slope[i - 1] * slope[i] <= 0) m.push(0);
    else {
      const w1 = 2 * dx[i] + dx[i - 1];
      const w2 = dx[i] + 2 * dx[i - 1];
      m.push((w1 + w2) / (w1 / slope[i - 1] + w2 / slope[i]));
    }
  }
  m.push(slope[n - 2]);

  return (x: number) => {
    if (x <= xs[0]) return ys[0];
    if (x >= xs[n - 1]) return ys[n - 1];
    let i = 0;
    while (i < n - 2 && x > xs[i + 1]) i++;
    const t = (x - xs[i]) / dx[i];
    const t2 = t * t;
    const t3 = t2 * t;
    return (
      ys[i] * (2 * t3 - 3 * t2 + 1) +
      m[i] * dx[i] * (t3 - 2 * t2 + t) +
      ys[i + 1] * (-2 * t3 + 3 * t2) +
      m[i + 1] * dx[i] * (t3 - t2)
    );
  };
}

export interface SampledSeries {
  /** Plot samples; NaN where the function is undefined (breaks the path). */
  values: { x: number; y: number }[];
  error?: string;
}

/** Sample one series across the domain for plotting. */
export function sampleSeries(
  series: { mode: "formula" | "points"; formula?: string; points?: [number, number][] },
  domain: [number, number],
  count = 121,
): SampledSeries {
  let f: (x: number) => number;
  if (series.mode === "formula") {
    try {
      f = compileFormula(series.formula ?? "").eval;
    } catch (e) {
      return { values: [], error: e instanceof Error ? e.message : "Bad formula" };
    }
  } else {
    f = pointsInterpolator(series.points ?? []);
  }
  const [min, max] = domain;
  const span = max - min;
  const values: { x: number; y: number }[] = [];
  for (let i = 0; i < count; i++) {
    const x = min + (span * i) / (count - 1);
    const y = f(x);
    values.push({ x, y: Number.isFinite(y) ? y : NaN });
  }
  return { values };
}

/** Round for display: integers stay clean, small values keep precision. */
export function fmt(v: number): string {
  if (!Number.isFinite(v)) return "—";
  const a = Math.abs(v);
  if (a >= 1000) return Math.round(v).toLocaleString("en-US");
  if (a >= 100) return v.toFixed(0);
  if (a >= 1) return parseFloat(v.toFixed(1)).toString();
  return parseFloat(v.toFixed(3)).toString();
}
