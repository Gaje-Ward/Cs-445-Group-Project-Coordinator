import { beforeEach, expect, it, vi } from "vitest";
import type { PrismaClient } from "@/generated/prisma/client";
import { loadSessionUser } from "@/lib/session-user";
const findUnique = vi.fn();
const db = { user: { findUnique } } as unknown as PrismaClient;
const active = {
  id: "user",
  name: "Current name",
  email: "user@example.com",
  isActive: true,
  sessionVersion: 0,
};
beforeEach(() => {
  vi.resetAllMocks();
  findUnique.mockResolvedValue(active);
});
it("keeps existing version-zero sessions valid and returns only current safe fields", async () => {
  expect(await loadSessionUser(db, "user", undefined)).toEqual({
    id: "user",
    name: "Current name",
    email: "user@example.com",
  });
});
it("rejects disabled accounts and permanently invalidates their old session versions", async () => {
  findUnique.mockResolvedValue({
    ...active,
    isActive: false,
    sessionVersion: 1,
  });
  expect(await loadSessionUser(db, "user", 0)).toBeNull();
  findUnique.mockResolvedValue({
    ...active,
    isActive: true,
    sessionVersion: 2,
  });
  expect(await loadSessionUser(db, "user", 0)).toBeNull();
  expect(await loadSessionUser(db, "user", 2)).toMatchObject({ id: "user" });
});
it("rejects missing identities and fails closed on a database outage", async () => {
  expect(await loadSessionUser(db, "", 0)).toBeNull();
  expect(findUnique).not.toHaveBeenCalled();
  findUnique.mockResolvedValue(null);
  expect(await loadSessionUser(db, "deleted", 0)).toBeNull();
  findUnique.mockRejectedValue(new Error("offline"));
  await expect(loadSessionUser(db, "user", 0)).rejects.toThrow("offline");
});
