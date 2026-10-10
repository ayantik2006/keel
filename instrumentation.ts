// Fail fast at server start if the encryption key is missing or malformed.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { assertEncryptionConfig } = await import("./lib/crypto");
    assertEncryptionConfig();
  }
}
