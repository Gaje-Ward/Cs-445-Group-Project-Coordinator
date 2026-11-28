import "dotenv/config";
import { z } from "zod";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdir, writeFile, unlink } from "node:fs/promises";
import { resolve, join } from "node:path";
import { getDb } from "../src/lib/db";
import { hashPassword } from "../src/lib/password";
const email = z
  .string()
  .trim()
  .toLowerCase()
  .email()
  .max(254)
  .parse(process.argv[2]);
const revoke = process.argv.includes("--revoke"),
  create = process.argv.includes("--create");
if (revoke && create) throw new Error("Choose either --create or --revoke.");
const db = getDb();
let credentialsPath: string | undefined;
try {
  const existing = await db.user.findUnique({
    where: { email },
    select: { id: true },
  });
  if (existing) {
    await db.user.update({
      where: { id: existing.id },
      data: { isAdmin: !revoke },
      select: { id: true },
    });
    console.log(
      revoke
        ? "Administrator access removed. Existing login details are unchanged."
        : "Administrator access granted. Existing login details are unchanged.",
    );
  } else {
    if (!create)
      throw new Error(
        "No account has this email. Register first, or use --create for a separate administrator account.",
      );
    const password = randomBytes(24).toString("base64url");
    const directory = resolve(".data");
    await mkdir(directory, { recursive: true, mode: 0o700 });
    credentialsPath = join(directory, "admin-login-" + randomUUID() + ".txt");
    await writeFile(
      credentialsPath,
      "Admin login\nEmail: " +
        email +
        "\nPassword: " +
        password +
        "\nSign in at the application's /login page.\n",
      { flag: "wx", mode: 0o600 },
    );
    try {
      await db.user.create({
        data: {
          name: "Administrator",
          email,
          passwordHash: await hashPassword(password),
          isAdmin: true,
        },
        select: { id: true },
      });
    } catch (error) {
      await unlink(credentialsPath);
      throw error;
    }
    console.log(
      "Administrator account created. Private login details: " +
        credentialsPath,
    );
  }
} finally {
  await db.$disconnect();
}
