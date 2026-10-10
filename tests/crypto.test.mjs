import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const crypto = await import("../lib/crypto.ts");
const { encryptValue, decryptValue, assertEncryptionConfig } = crypto;

const newKey = () => randomBytes(32).toString("base64");
beforeEach(() => {
  process.env.SECRETS_ENCRYPTION_KEY = newKey();
  delete process.env.SECRETS_ENCRYPTION_KEY_V2;
});

const flip = (b64) => {
  const buf = Buffer.from(b64, "base64");
  buf[0] ^= 0x01;
  return buf.toString("base64");
};

test("round trip returns the original plaintext", () => {
  for (const text of ["postgres://u:p@h/db", "ünïcödé 🔐", "x".repeat(10_000), " "]) {
    assert.equal(decryptValue(encryptValue(text, "id-1"), "id-1"), text);
  }
});

test("payload is versioned and does not contain the plaintext", () => {
  const enc = encryptValue("super-secret-value", "id-1");
  assert.equal(enc.v, 1);
  assert.equal(Buffer.from(enc.iv, "base64").length, 12);
  assert.equal(Buffer.from(enc.tag, "base64").length, 16);
  assert.ok(!JSON.stringify(enc).includes("super-secret-value"));
});

test("repeated encryption gives different ciphertext and nonce", () => {
  const seen = new Set();
  for (let i = 0; i < 200; i++) {
    seen.add(encryptValue("same plaintext", "id-1").iv);
  }
  assert.equal(seen.size, 200);
  const a = encryptValue("same plaintext", "id-1");
  const b = encryptValue("same plaintext", "id-1");
  assert.notEqual(a.ciphertext, b.ciphertext);
});

test("tampered ciphertext, tag, nonce, or record id fail closed", () => {
  const enc = encryptValue("value", "id-1");
  const cases = {
    ciphertext: { ...enc, ciphertext: flip(enc.ciphertext) },
    tag: { ...enc, tag: flip(enc.tag) },
    iv: { ...enc, iv: flip(enc.iv) },
  };
  for (const [name, bad] of Object.entries(cases)) {
    assert.throws(() => decryptValue(bad, "id-1"), { name: "DecryptionError" }, name);
  }
  assert.throws(() => decryptValue(enc, "id-2"), { name: "DecryptionError" });
});

test("truncated or malformed tag and nonce are rejected", () => {
  const enc = encryptValue("value", "id-1");
  const shortTag = Buffer.from(enc.tag, "base64").subarray(0, 4).toString("base64");
  const shortIv = Buffer.from(enc.iv, "base64").subarray(0, 8).toString("base64");
  assert.throws(() => decryptValue({ ...enc, tag: shortTag }, "id-1"), { name: "DecryptionError" });
  assert.throws(() => decryptValue({ ...enc, iv: shortIv }, "id-1"), { name: "DecryptionError" });
  for (const bad of [null, undefined, "plaintext", {}, { ...enc, v: undefined }, { ...enc, v: 0 }, { ...enc, ciphertext: 5 }]) {
    assert.throws(() => decryptValue(bad, "id-1"), { name: "DecryptionError" });
  }
});

test("decrypting with a different key fails", () => {
  const enc = encryptValue("value", "id-1");
  process.env.SECRETS_ENCRYPTION_KEY = newKey();
  assert.throws(() => decryptValue(enc, "id-1"), { name: "DecryptionError" });
});

test("unknown key version needs its own key and is rejected without it", () => {
  const enc = encryptValue("value", "id-1");
  assert.throws(() => decryptValue({ ...enc, v: 2 }, "id-1"), {
    name: "EncryptionConfigError",
  });
});

test("missing or invalid keys are rejected", () => {
  const bad = [
    undefined,
    "",
    "short",
    randomBytes(16).toString("base64"),
    randomBytes(33).toString("base64"),
    randomBytes(32).toString("hex"),
    Buffer.alloc(32).toString("base64"),
    `${newKey().slice(0, 42)}!=`,
  ];
  for (const value of bad) {
    if (value === undefined) delete process.env.SECRETS_ENCRYPTION_KEY;
    else process.env.SECRETS_ENCRYPTION_KEY = value;
    assert.throws(() => assertEncryptionConfig(), { name: "EncryptionConfigError" });
    assert.throws(() => encryptValue("v", "id"), { name: "EncryptionConfigError" });
  }
  process.env.SECRETS_ENCRYPTION_KEY = newKey();
  assertEncryptionConfig();
});

test("config error messages never contain the key", () => {
  const key = randomBytes(31).toString("base64");
  process.env.SECRETS_ENCRYPTION_KEY = key;
  try {
    assertEncryptionConfig();
    assert.fail("should throw");
  } catch (err) {
    assert.ok(!String(err.message).includes(key));
  }
});

test("server-only modules are never imported by client components", () => {
  const files = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const p = path.join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.(tsx?|mjs)$/.test(name)) files.push(p);
    }
  };
  walk(path.join(root, "app"));

  for (const file of files) {
    const src = readFileSync(file, "utf8");
    if (!/^\s*["']use client["']/.test(src)) continue;
    // Client code may import pure shared modules from lib/ (such as dotenv),
    // but never a module that is marked server-only.
    for (const m of src.matchAll(/from\s+["'](?:@\/lib|(?:\.\.?\/)+lib)\/([\w-]+)["']/g)) {
      const lib = readFileSync(path.join(root, "lib", `${m[1]}.ts`), "utf8");
      assert.ok(
        !lib.includes('import "server-only"'),
        `${path.relative(root, file)} imports server-only lib/${m[1]}`,
      );
    }
  }

  for (const name of ["crypto.ts", "db.ts", "api.ts", "migrate-secrets.ts"]) {
    const src = readFileSync(path.join(root, "lib", name), "utf8");
    assert.ok(src.startsWith('import "server-only";'), `lib/${name} lacks server-only`);
  }
});
