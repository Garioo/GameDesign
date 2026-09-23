// Comment-box mention round trip (lib/personMentions.ts): the textarea shows
// "@Name" while the stored body keeps @[Name](user:<id>) tokens.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");
const source = ts.transpileModule(fs.readFileSync(require.resolve("../lib/personMentions.ts"), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText;
const compiled = { exports: {} };
new Function("module", "exports", source)(compiled, compiled.exports);
const { decodeMentionsForEditing, encodeEditedMentions } = compiled.exports;

const NICO = "cfdd5d34-db5b-4b82-afac-4bdd9f82b42a";
const BOB = "00000000-0000-0000-0000-000000000002";

test("stored tokens show as @Name and encode back unchanged", () => {
  const body = `Hi @[nicolailarsson](user:${NICO}), can you check this?`;
  const { text, mentions } = decodeMentionsForEditing(body);
  assert.equal(text, "Hi @nicolailarsson, can you check this?");
  assert.equal(encodeEditedMentions(text, mentions), body);
});

test("edits around a mention keep it; deleting its text drops it", () => {
  const mentions = [{ name: "nicolailarsson", userId: NICO }];
  assert.equal(
    encodeEditedMentions("@nicolailarsson please look", mentions),
    `@[nicolailarsson](user:${NICO}) please look`,
  );
  assert.equal(encodeEditedMentions("@nicolai please look", mentions), "@nicolai please look");
  assert.equal(encodeEditedMentions("mail @nicolailarssonx", mentions), "mail @nicolailarssonx");
});

test("longer names win over shorter ones that prefix them", () => {
  const mentions = [{ name: "Bob", userId: BOB }, { name: "Bob Smith", userId: NICO }];
  assert.equal(
    encodeEditedMentions("@Bob Smith and @Bob.", mentions),
    `@[Bob Smith](user:${NICO}) and @[Bob](user:${BOB}).`,
  );
});
