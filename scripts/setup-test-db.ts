import { execFileSync } from "node:child_process";
import { testDatabaseUrl } from "./test-database";
execFileSync(
  process.execPath,
  ["node_modules/prisma/build/index.js", "migrate", "deploy"],
  {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: testDatabaseUrl() },
  },
);
