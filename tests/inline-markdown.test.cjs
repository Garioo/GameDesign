// **bold** / _italic_ in plain-text notes (lib/inlineMarkdown.ts).
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");
const out = ts.transpileModule(fs.readFileSync(require.resolve("../lib/inlineMarkdown.ts"), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const mod = { exports: {} };
new Function("module", "exports", out)(mod, mod.exports);
const { parseInlineMarkdown, stripInlineMarkdown, toggleInlineMarker } = mod.exports;

test("bold, italic and nesting parse; snake_case stays plain", () => {
  assert.deepEqual(parseInlineMarkdown("Bring **the _GN_ mic** and file_name_here"), [
    "Bring ",
    { bold: ["the ", { italic: ["GN"] }, " mic"] },
    " and file_name_here",
  ]);
  assert.equal(stripInlineMarkdown("**Room** _B2_"), "Room B2");
});

test("⌘B / ⌘I wrap, unwrap and insert empty pairs", () => {
  assert.deepEqual(toggleInlineMarker("see room", 4, 8, "**"), { value: "see **room**", start: 6, end: 10 });
  assert.deepEqual(toggleInlineMarker("see **room**", 6, 10, "**"), { value: "see room", start: 4, end: 8 });
  assert.deepEqual(toggleInlineMarker("see **room**", 4, 12, "**"), { value: "see room", start: 4, end: 8 });
  assert.deepEqual(toggleInlineMarker("x", 1, 1, "_"), { value: "x__", start: 2, end: 2 });
});
