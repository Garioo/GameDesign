/* ---------------------------------------------------------------------------
 * Tiny dependency-free syntax highlighter for script blocks.
 * Not a real parser — a single-pass scanner that classifies comments,
 * strings, numbers, keywords, types and calls. Good enough to make code
 * read like code; wrong tokens degrade to plain text, never break layout.
 * ------------------------------------------------------------------------- */

import type { ReactNode } from "react";

export type Lang =
  | "csharp"
  | "js"
  | "gdscript"
  | "python"
  | "lua"
  | "c"
  | "rust"
  | "java"
  | "json"
  | "css"
  | "plain";

const EXT_LANG: Record<string, Lang> = {
  cs: "csharp",
  js: "js", jsx: "js", ts: "js", tsx: "js", mjs: "js", cjs: "js",
  gd: "gdscript",
  py: "python",
  lua: "lua",
  c: "c", h: "c", cpp: "c", hpp: "c", cc: "c", hh: "c", glsl: "c", hlsl: "c", shader: "c",
  rs: "rust",
  java: "java",
  json: "json",
  css: "css", scss: "css", less: "css",
};

const LANG_LABEL: Record<Lang, string> = {
  csharp: "C#",
  js: "JS/TS",
  gdscript: "GDScript",
  python: "Python",
  lua: "Lua",
  c: "C/C++",
  rust: "Rust",
  java: "Java",
  json: "JSON",
  css: "CSS",
  plain: "Text",
};

export function detectLang(path: string): Lang {
  const ext = path.slice(path.lastIndexOf(".") + 1).toLowerCase();
  return EXT_LANG[ext] ?? "plain";
}

export function langLabel(lang: Lang): string {
  return LANG_LABEL[lang];
}

const KW = (s: string) => new Set(s.split(" "));

interface LangConfig {
  line: string[]; // line-comment openers
  block: boolean; // supports /* ... */
  keywords: Set<string>;
}

const SHARED_C =
  "if else for while do switch case default break continue return new this base super " +
  "true false null void var let const function class struct interface enum namespace " +
  "using import export from public private protected internal static readonly override " +
  "virtual abstract async await try catch finally throw typeof instanceof in of is as " +
  "get set yield extends implements sealed partial out ref string int float double bool " +
  "char long uint byte object decimal delegate event foreach lock unsafe sizeof";

const CONFIG: Record<Lang, LangConfig> = {
  csharp: { line: ["//"], block: true, keywords: KW(SHARED_C) },
  js: { line: ["//"], block: true, keywords: KW(SHARED_C + " undefined NaN type keyof satisfies declare") },
  c: { line: ["//"], block: true, keywords: KW(SHARED_C + " auto unsigned signed short template typename inline constexpr nullptr include define pragma ifdef ifndef endif") },
  java: { line: ["//"], block: true, keywords: KW(SHARED_C + " package final synchronized transient volatile instanceof boolean") },
  rust: { line: ["//"], block: true, keywords: KW("fn let mut const if else match loop while for in return break continue struct enum impl trait pub use mod crate self Self super where async await move ref dyn Box Vec String Option Some None Result Ok Err true false i8 i16 i32 i64 u8 u16 u32 u64 f32 f64 usize isize bool str") },
  gdscript: { line: ["#"], block: false, keywords: KW("func var const if elif else for while match return break continue pass class class_name extends signal export onready tool static yield await preload load self true false null and or not in is as void int float bool String Array Dictionary Vector2 Vector3 Node print") },
  python: { line: ["#"], block: false, keywords: KW("def class if elif else for while return break continue pass import from as with try except finally raise lambda yield global nonlocal del assert and or not in is None True False self async await print") },
  lua: { line: ["--"], block: false, keywords: KW("function local if then else elseif end for while repeat until do return break and or not nil true false in pairs ipairs print self require") },
  json: { line: [], block: false, keywords: KW("true false null") },
  css: { line: ["//"], block: true, keywords: KW("inherit initial unset none auto important solid dashed dotted flex grid block inline absolute relative fixed sticky hidden hover focus active root") },
  plain: { line: [], block: false, keywords: KW("") },
};

interface Tok {
  cls: string | null;
  text: string;
}

function tokenize(code: string, lang: Lang): Tok[] {
  const cfg = CONFIG[lang];
  const toks: Tok[] = [];
  let i = 0;
  const push = (cls: string | null, text: string) => {
    if (text) toks.push({ cls, text });
  };

  while (i < code.length) {
    const ch = code[i];

    const lc = cfg.line.find((p) => code.startsWith(p, i));
    if (lc) {
      let j = code.indexOf("\n", i);
      if (j < 0) j = code.length;
      push("cmt", code.slice(i, j));
      i = j;
      continue;
    }
    if (cfg.block && code.startsWith("/*", i)) {
      let j = code.indexOf("*/", i + 2);
      j = j < 0 ? code.length : j + 2;
      push("cmt", code.slice(i, j));
      i = j;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      let j = i + 1;
      while (j < code.length && code[j] !== ch) {
        if (code[j] === "\\") j++;
        if (ch !== "`" && code[j] === "\n") break; // unterminated — stop at EOL
        j++;
      }
      j = Math.min(j + 1, code.length);
      push("str", code.slice(i, j));
      i = j;
      continue;
    }
    if (/\d/.test(ch)) {
      let j = i;
      while (j < code.length && /[\w.]/.test(code[j])) j++;
      push("num", code.slice(i, j));
      i = j;
      continue;
    }
    if (/[A-Za-z_]/.test(ch)) {
      let j = i;
      while (j < code.length && /\w/.test(code[j])) j++;
      const word = code.slice(i, j);
      let k = j;
      while (k < code.length && code[k] === " ") k++;
      let cls: string | null = null;
      if (cfg.keywords.has(word)) cls = "kw";
      else if (code[k] === "(") cls = "fn"; // calls win over PascalCase
      else if (/^[A-Z]/.test(word)) cls = "type";
      push(cls, word);
      i = j;
      continue;
    }
    if (/\s/.test(ch)) {
      let j = i;
      while (j < code.length && /[ \t]/.test(code[j])) j++;
      if (j === i) j++; // newline
      push(null, code.slice(i, j));
      i = j;
      continue;
    }
    push("pun", ch);
    i++;
  }
  return toks;
}

/** Tokenized lines, ready to render. Each line is a list of spans. */
export function highlightLines(code: string, lang: Lang): Tok[][] {
  const lines: Tok[][] = [[]];
  for (const tok of tokenize(code, lang)) {
    const parts = tok.text.split("\n");
    parts.forEach((part, idx) => {
      if (idx > 0) lines.push([]);
      if (part) lines[lines.length - 1].push({ cls: tok.cls, text: part });
    });
  }
  return lines;
}

export function renderLine(toks: Tok[]): ReactNode {
  return toks.map((t, i) =>
    t.cls ? (
      <span key={i} className={`tok-${t.cls}`}>
        {t.text}
      </span>
    ) : (
      t.text
    ),
  );
}
