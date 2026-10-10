// Usage (dry run is the default):
//   npm run migrate:rbac [-- --apply]
// Creates one owner membership per existing project, for its recorded owner.
// Additive only: nothing is modified or deleted.
import { MongoClient } from "mongodb";
import { migrateRbac } from "../lib/migrate-rbac";

const apply = process.argv.includes("--apply");
const uri = process.env.MONGODB_URI;
if (!uri) throw new Error("MONGODB_URI is not set");

const client = new MongoClient(uri);
await client.connect();
try {
  const report = await migrateRbac(client.db(), { apply });
  console.log(apply ? "Applied:" : "Dry run (nothing written):");
  console.log(JSON.stringify(report, null, 2));
} finally {
  await client.close();
}
