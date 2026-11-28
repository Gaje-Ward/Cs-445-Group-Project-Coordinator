import "dotenv/config";
import { getDb } from "../src/lib/db";
import { FileStore } from "../src/lib/file-store";
import { cleanFileStorage } from "../src/lib/file-service";
const apply = process.argv.includes("--apply");
const db = getDb();
try {
  console.log(
    JSON.stringify(await cleanFileStorage(db, new FileStore(), apply)),
  );
} finally {
  await db.$disconnect();
}
