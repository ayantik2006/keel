import { test } from "node:test";
import assert from "node:assert/strict";

const { parseDotenv, serializeDotenv, formatDotenvValue, exportFilename } = await import("../lib/dotenv.ts");

const values = (text) => Object.fromEntries(parseDotenv(text).entries.map((e) => [e.key, e.value]));

test("plain assignments, export prefix, spacing, comments and blank lines", () => {
  const r = parseDotenv(
    [
      "# a comment",
      "",
      "A=1",
      "export B=two",
      "  C  =  spaced value  ",
      "D=a=b=c",
      "   # indented comment",
      "E=",
      "F=a#b",
      "G=value # trailing comment",
    ].join("\n"),
  );
  assert.deepEqual(r.problems, []);
  assert.deepEqual(values(r.entries.map((e) => `${e.key}=${e.value}`).join("\n")).A, "1");
  assert.deepEqual(
    r.entries.map((e) => [e.key, e.value]),
    [["A", "1"], ["B", "two"], ["C", "spaced value"], ["D", "a=b=c"], ["E", ""], ["F", "a#b"], ["G", "value"]],
  );
});

test("quoted values: double quotes with escapes, single quotes literal", () => {
  const r = parseDotenv(
    [
      'A="hello world"',
      'B="line1\\nline2\\ttab \\"quoted\\" back\\\\slash"',
      "C='single $HOME \\n stays literal'",
      'D="  keeps edges  "',
      'E=""',
      'F="unknown \\q \\d escape"',
      'G="value" # comment after quote',
      "H='it''s'", // adjacent quote: junk after closing quote
    ].join("\n"),
  );
  const map = Object.fromEntries(r.entries.map((e) => [e.key, e.value]));
  assert.equal(map.A, "hello world");
  assert.equal(map.B, 'line1\nline2\ttab "quoted" back\\slash');
  assert.equal(map.C, "single $HOME \\n stays literal");
  assert.equal(map.D, "  keeps edges  ");
  assert.equal(map.E, "");
  assert.equal(map.F, "unknown \\q \\d escape");
  assert.equal(map.G, "value");
  assert.equal(map.H, undefined);
  assert.deepEqual(r.problems.map((p) => [p.line, p.key]), [[8, "H"]]);
});

test("multiline quoted values keep line numbers correct", () => {
  const r = parseDotenv(['A="first', "second", 'third"', "B=after", "C='x", "y'", "D=end"].join("\n"));
  assert.deepEqual(r.problems, []);
  assert.deepEqual(
    r.entries.map((e) => [e.key, e.value, e.line]),
    [["A", "first\nsecond\nthird", 1], ["B", "after", 4], ["C", "x\ny", 5], ["D", "end", 7]],
  );
});

test("CRLF, BOM and a missing final newline", () => {
  const r = parseDotenv("﻿A=1\r\nB=\"x\r\ny\"\r\nC=3");
  assert.deepEqual(r.problems, []);
  assert.deepEqual(r.entries.map((e) => [e.key, e.value]), [["A", "1"], ["B", "x\ny"], ["C", "3"]]);
});

test("malformed lines are reported with line numbers and never guessed", () => {
  const r = parseDotenv(
    [
      "GOOD=1",
      "no equals sign here",
      "1BAD=x",
      "BAD-KEY=x",
      '=novalue',
      'UNQUOTED="ok" junk',
      "GOOD2=2",
    ].join("\n"),
  );
  assert.deepEqual(r.entries.map((e) => e.key), ["GOOD", "GOOD2"]);
  assert.deepEqual(
    r.problems.map((p) => p.line),
    [2, 3, 4, 5, 6],
  );
  assert.match(r.problems[0].message, /KEY=VALUE/);
  assert.match(r.problems[1].message, /Invalid key/);
  assert.match(r.problems[4].message, /closing quote/);
});

test("an unterminated quote stops parsing instead of swallowing the file", () => {
  const r = parseDotenv('A=1\nB="never closed\nC=3');
  assert.deepEqual(r.entries.map((e) => e.key), ["A"]);
  assert.equal(r.problems.length, 1);
  assert.equal(r.problems[0].line, 2);
  assert.match(r.problems[0].message, /Unterminated/);
});

test("duplicate keys are all returned so the caller must resolve them", () => {
  const r = parseDotenv("A=1\nB=2\nA=3");
  assert.deepEqual(r.entries.filter((e) => e.key === "A").map((e) => [e.value, e.line]), [["1", 1], ["3", 3]]);
});

test("variable expansion is not performed", () => {
  assert.equal(values("A=${B}\nB=x").A, "${B}");
});

test("export formatting quotes and escapes safely", () => {
  assert.equal(formatDotenvValue("plain-value_1.2"), "plain-value_1.2");
  assert.equal(formatDotenvValue(""), '""');
  assert.equal(formatDotenvValue("has space"), '"has space"');
  assert.equal(formatDotenvValue("a#b"), '"a#b"');
  assert.equal(formatDotenvValue('say "hi"'), '"say \\"hi\\""');
  assert.equal(formatDotenvValue("line1\nline2"), '"line1\\nline2"');
  assert.equal(formatDotenvValue("back\\slash"), '"back\\\\slash"');
  assert.equal(formatDotenvValue("päss"), '"päss"');
  assert.equal(
    serializeDotenv([{ key: "A", value: "1" }, { key: "B", value: "x y" }]),
    'A=1\nB="x y"\n',
  );
  assert.equal(serializeDotenv([]), "");
  assert.throws(() => serializeDotenv([{ key: "bad key", value: "x" }]));
});

test("what is exported parses back to exactly the same values", () => {
  const alphabet = ["a", "Z", "0", " ", "\t", "\n", "\r", '"', "'", "\\", "#", "$", "=", "{", "}", "é", "🔐", " ", "`", "&", "|", ";"];
  let seed = 12345;
  const rand = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  const pairs = [];
  for (let i = 0; i < 400; i++) {
    const len = Math.floor(rand() * 12);
    let v = "";
    for (let j = 0; j < len; j++) v += alphabet[Math.floor(rand() * alphabet.length)];
    pairs.push({ key: `K${i}`, value: v });
  }
  // include the awkward fixed cases too
  pairs.push({ key: "WS", value: "  lead and trail  " }, { key: "EMPTY", value: "" }, { key: "ENDS_BS", value: "ends\\" });

  const text = serializeDotenv(pairs);
  const parsed = parseDotenv(text);
  assert.deepEqual(parsed.problems, []);
  assert.equal(parsed.entries.length, pairs.length);
  for (let i = 0; i < pairs.length; i++) {
    assert.equal(parsed.entries[i].key, pairs[i].key);
    assert.equal(parsed.entries[i].value, pairs[i].value, `pair ${i}`);
  }
});

test("export filenames", () => {
  assert.equal(exportFilename("production"), ".env.production");
  assert.equal(exportFilename("development"), ".env.development");
  assert.equal(exportFilename("../etc/passwd"), ".env");
  assert.equal(exportFilename('x"; evil'), ".env");
});
