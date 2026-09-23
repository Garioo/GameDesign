// Word diff + HTML flattening for the page edit history (lib/textDiff.ts).
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");
const out = ts.transpileModule(fs.readFileSync(require.resolve("../lib/textDiff.ts"), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const mod = { exports: {} };
new Function("module", "exports", out)(mod, mod.exports);
const { diffWords, htmlToPlain } = mod.exports;

test("changed words show as removed + added, the rest stays", () => {
  assert.deepEqual(diffWords("The player jumps high", "The player dashes high"), [
    { kind: "same", text: "The player " },
    { kind: "removed", text: "jumps" },
    { kind: "added", text: "dashes" },
    { kind: "same", text: " high" },
  ]);
});

test("pure additions and removals", () => {
  assert.deepEqual(diffWords("", "New text"), [{ kind: "added", text: "New text" }]);
  assert.deepEqual(diffWords("Old text", ""), [{ kind: "removed", text: "Old text" }]);
  assert.deepEqual(diffWords("A B", "A B C"), [
    { kind: "same", text: "A B" },
    { kind: "added", text: " C" },
  ]);
});

test("huge texts fall back to a whole replace", () => {
  const big = "word ".repeat(1000);
  assert.deepEqual(diffWords(big, big + "x").map((p) => p.kind), ["removed", "added"]);
});

test("block HTML flattens to plain text", () => {
  assert.equal(htmlToPlain("<b>Hit</b> &amp; run<br>again &lt;3"), "Hit & run\nagain <3");
  assert.equal(htmlToPlain('Ask <a data-mention="user:x">@Bo</a>'), "Ask @Bo");
});
