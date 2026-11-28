import { beforeEach, expect, it, vi } from "vitest";
vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/admin", () => ({ admin: { allowed: vi.fn() } }));
import { getServerSession } from "next-auth";
import { admin } from "@/lib/admin";
import { adminRequest } from "@/lib/admin-http";
import { FileError } from "@/lib/file-validation";
beforeEach(() => {
  vi.resetAllMocks();
});
it("rejects anonymous requests before inspecting any admin data", async () => {
  vi.mocked(getServerSession).mockResolvedValue(null);
  const action = vi.fn();
  const response = await adminRequest(action);
  expect(response.status).toBe(401);
  expect(action).not.toHaveBeenCalled();
  expect(admin.allowed).not.toHaveBeenCalled();
});
it("checks database permission before running an authenticated action", async () => {
  vi.mocked(getServerSession).mockResolvedValue({
    user: { id: "ordinary-user" },
    expires: "unused",
  });
  vi.mocked(admin.allowed).mockResolvedValue(false);
  const action = vi.fn();
  const response = await adminRequest(action);
  expect(response.status).toBe(403);
  expect(response.headers.get("cache-control")).toContain("no-store");
  expect(action).not.toHaveBeenCalled();
  expect(admin.allowed).toHaveBeenCalledWith("ordinary-user");
});
it("passes only the verified session identity to an authorized action", async () => {
  vi.mocked(getServerSession).mockResolvedValue({
    user: { id: "admin-id" },
    expires: "unused",
  });
  vi.mocked(admin.allowed).mockResolvedValue(true);
  const action = vi.fn().mockResolvedValue(Response.json({ ok: true }));
  expect((await adminRequest(action)).status).toBe(200);
  expect(action).toHaveBeenCalledWith("admin-id");
});
it("returns a generic unavailable response when the permission lookup fails", async () => {
  vi.mocked(getServerSession).mockResolvedValue({
    user: { id: "admin-id" },
    expires: "unused",
  });
  vi.mocked(admin.allowed).mockRejectedValue(
    new Error("private database details"),
  );
  const response = await adminRequest(vi.fn());
  expect(response.status).toBe(503);
  expect(await response.text()).not.toContain("private database details");
});
it("keeps missing-file responses private and uncached", async () => {
  vi.mocked(getServerSession).mockResolvedValue({
    user: { id: "admin-id" },
    expires: "unused",
  });
  vi.mocked(admin.allowed).mockResolvedValue(true);
  const response = await adminRequest(async () => {
    throw new FileError("File not found.", 404);
  });
  expect(response.status).toBe(404);
  expect(response.headers.get("cache-control")).toContain("no-store");
});
