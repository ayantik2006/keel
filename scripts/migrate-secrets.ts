// Usage (dry run is the default):
//   node --no-warnings --experimental-transform-types \
//     --import ./scripts/ts-loader/register.mjs --env-file=.env.local \
//     scripts/migrate-secrets.ts [--apply --confirm-backup]
import { MongoClient } from "mongodb";
import { migrateSecrets } from "../lib/migrate-secrets";
import { assertEncryptionConfig } from "../lib/crypto";

const apply = process.argv.includes("--apply");
if (apply && !process.argv.includes("--confirm-backup")) {
  console.error(
    "Refusing to write. Take a backup first (e.g. mongodump), then re-run with --apply --confirm-backup.",
  );
  process.exit(1);
}

assertEncryptionConfig();
const uri = process.env.MONGODB_URI;
if (!uri) throw new Error("MONGODB_URI is not set");

const client = new MongoClient(uri);
await client.connect();
try {
  const report = await migrateSecrets(client.db(), { apply });
  console.log(apply ? "Applied:" : "Dry run (nothing written):");
  console.log(JSON.stringify(report, null, 2));
  if (report.failed.length) process.exitCode = 2;
} finally {
  await client.close();
}
