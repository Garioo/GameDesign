// Copying several page blocks (lib/blockClipboard.ts): plain text, HTML for
// other apps, and the embedded blocks for pasting back into a page.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");
const source = ts.transpileModule(fs.readFileSync(require.resolve("../lib/blockClipboard.ts"), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const compiled = { exports: {} };
new Function("module", "exports", "require", source)(compiled, compiled.exports, () => ({}));
const { blocksToPlainText, blocksToHtml, parseCopiedBlocks } = compiled.exports;

const blocks = [
  { id: "a", type: "h3", text: "Github" },
  { id: "b", type: "text", text: "Set up <b>github</b> &amp; overleaf" },
  { id: "c", type: "numbered", text: "One" },
  { id: "d", type: "numbered", text: "Two" },
  { id: "e", type: "todo", text: "Invite Cumhur", checked: true },
  { id: "f", type: "table", text: "", rows: [["A", "B"], ["1", "2"]] },
];

test("plain text keeps headings, lists, to-dos and tables readable", () => {
  assert.equal(
    blocksToPlainText(blocks),
    "### Github\nSet up github & overleaf\n1. One\n2. Two\n- [x] Invite Cumhur\nA\tB\n1\t2",
  );
});

test("HTML is semantic and pastes back as the same blocks without ids", () => {
  const html = blocksToHtml(blocks);
  assert.match(html, /<h3>Github<\/h3><p>Set up <b>github<\/b> &amp; overleaf<\/p><ol><li>One<\/li><li>Two<\/li><\/ol>/);
  const back = parseCopiedBlocks(`<meta charset="utf-8">${html}`);
  assert.deepEqual(back, blocks.map(({ id, ...rest }) => rest));
});

test("foreign or malformed clipboard HTML isn't treated as blocks", () => {
  assert.equal(parseCopiedBlocks("<p>hello</p>"), null);
  assert.equal(parseCopiedBlocks('<div data-foundry-blocks="%5B%7B%22type%22%3A%22evil%22%7D%5D"></div>'), null);
  assert.equal(parseCopiedBlocks('<div data-foundry-blocks="not-json"></div>'), null);
});
