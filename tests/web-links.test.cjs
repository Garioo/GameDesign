// Pasted links in page text (lib/webLinks.ts): only http(s)/mailto hrefs are
// kept, and URLs inside pasted text become escaped <a> tags.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");
const source = ts.transpileModule(fs.readFileSync(require.resolve("../lib/webLinks.ts"), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const compiled = { exports: {} };
new Function("module", "exports", source)(compiled, compiled.exports);
const { safeLinkHref, linkifyText } = compiled.exports;

test("only http(s) and mailto links are allowed", () => {
  assert.equal(safeLinkHref("https://overleaf.com/project/1"), "https://overleaf.com/project/1");
  assert.equal(safeLinkHref("  http://example.com  "), "http://example.com/");
  assert.equal(safeLinkHref("www.github.com"), "https://www.github.com/");
  assert.equal(safeLinkHref("mailto:a@b.dk"), "mailto:a@b.dk");
  assert.equal(safeLinkHref("javascript:alert(1)"), null);
  assert.equal(safeLinkHref("data:text/html,<b>x</b>"), null);
  assert.equal(safeLinkHref("see https://x.com"), null, "text with spaces isn't a single link");
  assert.equal(safeLinkHref(""), null);
});

test("URLs in pasted text become links; the rest is escaped", () => {
  assert.equal(
    linkifyText("Read https://example.com/a?b=1&c=2, then <reply>."),
    'Read <a href="https://example.com/a?b=1&amp;c=2">https://example.com/a?b=1&amp;c=2</a>, then &lt;reply&gt;.',
  );
  assert.equal(linkifyText("go to www.github.com\nnow"), 'go to <a href="https://www.github.com/">www.github.com</a><br>now');
  assert.equal(linkifyText("no links here"), "no links here");
});
