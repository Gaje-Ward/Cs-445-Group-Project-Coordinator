import { afterAll, expect, it } from "vitest";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { createUserService, DuplicateEmailError } from "@/lib/user-service";
import { testDatabaseUrl } from "../../scripts/test-database";
import { verifyPassword } from "@/lib/password";
import { randomUUID } from "node:crypto";
const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: testDatabaseUrl() }),
});
const ids: string[] = [];
const service = createUserService({
  findByEmail: (email) => db.user.findUnique({ where: { email } }),
  create: async (data) => {
    const user = await db.user.create({ data });
    ids.push(user.id);
    return user;
  },
});
afterAll(async () => {
  if (ids.length) await db.user.deleteMany({ where: { id: { in: ids } } });
  await db.$disconnect();
});
it("persists registration and verifies login against real PostgreSQL", async () => {
  const input = {
    name: "Integration Student",
    email: "integration-" + randomUUID() + "@example.com",
    password: "a long integration passphrase",
  };
  const user = await service.register(input);
  const stored = await db.user.findUniqueOrThrow({ where: { id: user.id } });
  expect(stored.passwordHash).not.toBe(input.password);
  expect(await verifyPassword(input.password, stored.passwordHash)).toBe(true);
  expect(await service.authenticate(input)).toEqual(user);
  expect(
    await service.authenticate({
      ...input,
      password: "a wrong integration passphrase",
    }),
  ).toBeNull();
  await expect(service.register(input)).rejects.toBeInstanceOf(
    DuplicateEmailError,
  );
  expect(user).not.toHaveProperty("passwordHash");
});
it("enforces unique email under concurrent registration", async () => {
  const input = {
    name: "Race Student",
    email: "race-" + randomUUID() + "@example.com",
    password: "a long integration passphrase",
  };
  const results = await Promise.allSettled([
    service.register(input),
    service.register(input),
  ]);
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
  const failure = results.find(
    (r) => r.status === "rejected",
  ) as PromiseRejectedResult;
  expect(failure.reason).toBeInstanceOf(DuplicateEmailError);
});
