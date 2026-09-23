// Page/canvas links in task descriptions (lib/pageLinks.ts): the text box
// shows [[Title]], the stored text keeps [[Title]](<ref>).
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");
const source = ts.transpileModule(fs.readFileSync(require.resolve("../lib/pageLinks.ts"), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const compiled = { exports: {} };
new Function("module", "exports", source)(compiled, compiled.exports);
const { splitPageLinks, stripPageLinks, decodePageLinksForEditing, encodeEditedPageLinks } = compiled.exports;

const PAGE = "11111111-2222-3333-4444-555555555555";
const CANVAS = `canvas:aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee`;
const stored = `See [[Concept proposal]](${PAGE}) and [[Flow]](${CANVAS}).`;

test("stored links split into link segments and strip to titles", () => {
  assert.deepEqual(splitPageLinks(stored), [
    { text: "See " },
    { text: "Concept proposal", link: { title: "Concept proposal", ref: PAGE } },
    { text: " and " },
    { text: "Flow", link: { title: "Flow", ref: CANVAS } },
    { text: "." },
  ]);
  assert.equal(stripPageLinks(stored), "See Concept proposal and Flow.");
});

test("editing shows [[Title]] and encodes back unchanged", () => {
  const { text, links } = decodePageLinksForEditing(stored);
  assert.equal(text, "See [[Concept proposal]] and [[Flow]].");
  assert.equal(encodeEditedPageLinks(text, links), stored);
});

test("typed [[Title]] without a picked page stays plain text", () => {
  assert.equal(encodeEditedPageLinks("See [[Nothing]]", []), "See [[Nothing]]");
  const links = [{ title: "Concept proposal", ref: PAGE }];
  assert.equal(encodeEditedPageLinks("[[Concept propos]]", links), "[[Concept propos]]");
});
