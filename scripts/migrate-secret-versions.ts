// Usage (dry run is the default):
//   npm run migrate:versions [-- --apply]
// Records each pre-history secret's current value as version 1 (BASELINE).
// Does not invent earlier history. Additive only.
import { MongoClient } from "mongodb";
import { migrateSecretVersions } from "../lib/migrate-secret-versions";

const apply = process.argv.includes("--apply");
const uri = process.env.MONGODB_URI;
if (!uri) throw new Error("MONGODB_URI is not set");

const client = new MongoClient(uri);
await client.connect();
try {
  const report = await migrateSecretVersions(client.db(), { apply });
  console.log(apply ? "Applied:" : "Dry run (nothing written):");
  console.log(JSON.stringify(report, null, 2));
} finally {
  await client.close();
}
