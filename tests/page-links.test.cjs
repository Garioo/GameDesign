// Page/canvas links in task descriptions (lib/pageLinks.ts): the text box
// shows [[Title]], the stored text keeps [[Title]](<ref>).
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");
// Load a lib/*.ts file (and its relative imports) as CommonJS.
function load(file) {
  const out = ts.transpileModule(fs.readFileSync(require.resolve(`../lib/${file}.ts`), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const mod = { exports: {} };
  new Function("module", "exports", "require", out)(mod, mod.exports, (p) => load(p.replace("./", "")));
  return mod.exports;
}
const compiled = { exports: load("pageLinks") };
const { splitPageLinks, stripPageLinks, decodePageLinksForEditing, encodeEditedPageLinks, plainLinkedText, linkIconName } = compiled.exports;

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

test("section links round-trip too", () => {
  const SECTION = "section:99999999-8888-7777-6666-555555555555";
  const text = `All of [[Meetings]](${SECTION})`;
  assert.equal(stripPageLinks(text), "All of Meetings");
  const { text: shown, links } = decodePageLinksForEditing(text);
  assert.equal(shown, "All of [[Meetings]]");
  assert.equal(encodeEditedPageLinks(shown, links), text);
});

test("board and task links round-trip, and plain text drops links and formatting", () => {
  const BOARD = "board:12345678-1234-1234-1234-123456789abc";
  const TASK = "task:87654321-4321-4321-4321-cba987654321";
  const text = `**Prep** for [[Sprint]](${BOARD}) and _[[Write report]](${TASK})_`;
  assert.equal(plainLinkedText(text), "Prep for Sprint and Write report");
  const { text: shown, links } = decodePageLinksForEditing(text);
  assert.equal(shown, "**Prep** for [[Sprint]] and _[[Write report]]_");
  assert.equal(encodeEditedPageLinks(shown, links), text);
  assert.equal(linkIconName(BOARD), "board");
  assert.equal(linkIconName(TASK), "task");
});
