// Usage (dry run is the default):
//   npm run migrate:env-access [-- --apply]
// Grants existing members and viewers access to non-production environments.
// Production is never granted. Additive only.
import { MongoClient } from "mongodb";
import { migrateEnvironmentAccess } from "../lib/migrate-env-access";

const apply = process.argv.includes("--apply");
const uri = process.env.MONGODB_URI;
if (!uri) throw new Error("MONGODB_URI is not set");

const client = new MongoClient(uri);
await client.connect();
try {
  const report = await migrateEnvironmentAccess(client.db(), { apply });
  console.log(apply ? "Applied:" : "Dry run (nothing written):");
  console.log(JSON.stringify(report, null, 2));
} finally {
  await client.close();
}
