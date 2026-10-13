import { beforeEach, expect, it, vi } from "vitest";
vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn(() => {
    throw new Error("redirect");
  }),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
beforeEach(() => vi.clearAllMocks());
it("redirects an unauthenticated session to login", async () => {
  vi.mocked(getServerSession).mockResolvedValue(null);
  await expect(requireUser()).rejects.toThrow("redirect");
  expect(redirect).toHaveBeenCalledWith("/login");
});
it("rejects a session missing a user id", async () => {
  vi.mocked(getServerSession).mockResolvedValue({ user: { name: "Unknown" } });
  await expect(requireUser()).rejects.toThrow("redirect");
});
it("returns the authenticated identity", async () => {
  const user = { id: "123", name: "Student", email: "student@example.com" };
  vi.mocked(getServerSession).mockResolvedValue({ user });
  expect(await requireUser()).toEqual(user);
  expect(redirect).not.toHaveBeenCalled();
});
