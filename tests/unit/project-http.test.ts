import { afterEach, expect, it, vi } from "vitest";
vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
import { getServerSession } from "next-auth";
import { projectReply, projectRequest } from "@/lib/project-http";
import { ProjectNotFoundError } from "@/lib/project-service";
import { projectSchema } from "@/lib/project-validation";
import { MemberChangeError } from "@/lib/member-service";
import { TaskNotFoundError, TaskAssignmentError } from "@/lib/task-service";
afterEach(() => vi.resetAllMocks());
it("returns safe task lookup and assignment feedback", async () => {
  vi.mocked(getServerSession).mockResolvedValue({ user: { id: "verified" } });
  for (const [error, status] of [
    [new TaskNotFoundError(), 404],
    [new TaskAssignmentError(), 409],
  ] as const) {
    const response = await projectRequest(async () => {
      throw error;
    });
    expect(response.status).toBe(status);
    expect(await response.json()).toEqual({ error: error.message });
  }
});
it("returns expected membership errors without treating them as outages", async () => {
  vi.mocked(getServerSession).mockResolvedValue({ user: { id: "verified" } });
  for (const status of [400, 404, 409] as const) {
    const response = await projectRequest(async () => {
      throw new MemberChangeError("Membership feedback", status);
    });
    expect(response.status).toBe(status);
    expect(await response.json()).toEqual({ error: "Membership feedback" });
  }
});
it("rejects anonymous requests before invoking persistence", async () => {
  vi.mocked(getServerSession).mockResolvedValue(null);
  const action = vi.fn();
  const response = await projectRequest(action);
  expect(response.status).toBe(401);
  expect(action).not.toHaveBeenCalled();
});
it("passes only the verified session identity and disables response caching", async () => {
  vi.mocked(getServerSession).mockResolvedValue({ user: { id: "verified" } });
  const action = vi.fn(async () => projectReply({ saved: true }));
  const response = await projectRequest(action);
  expect(action).toHaveBeenCalledWith("verified");
  expect(response.headers.get("cache-control")).toBe("no-store");
});
it("returns useful validation fields and a generic inaccessible-project response", async () => {
  vi.mocked(getServerSession).mockResolvedValue({ user: { id: "verified" } });
  const invalid = await projectRequest(async () => {
    projectSchema.parse({ name: " " });
    return projectReply({});
  });
  expect(invalid.status).toBe(400);
  expect((await invalid.json()).fields.name).toEqual([
    "Use at least 2 characters.",
  ]);
  const missing = await projectRequest(async () => {
    throw new ProjectNotFoundError();
  });
  expect(missing.status).toBe(404);
  expect(await missing.json()).toEqual({ error: "Project not found." });
});
it("does not expose database or authentication failures", async () => {
  vi.mocked(getServerSession).mockResolvedValue({ user: { id: "verified" } });
  const response = await projectRequest(async () => {
    throw new Error("postgresql://private:secret@database/internal-table");
  });
  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({
    error: "Projects are temporarily unavailable. Please try again.",
  });
  vi.mocked(getServerSession).mockRejectedValue(
    new Error("private auth details"),
  );
  expect((await projectRequest(vi.fn())).status).toBe(503);
});
