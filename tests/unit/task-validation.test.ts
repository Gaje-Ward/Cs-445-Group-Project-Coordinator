import { expect, it } from "vitest";
import {
  taskSchema,
  taskUpdateSchema,
  deleteTaskSchema,
} from "@/lib/task-validation";

it("normalizes optional fields and defaults new work to To do", () => {
  expect(taskSchema.parse({ title: "  Draft report  " })).toEqual({
    title: "Draft report",
    description: null,
    status: "TODO",
    dueDate: null,
    assigneeId: null,
  });
  expect(taskUpdateSchema.parse({ status: "DONE" })).toEqual({
    status: "DONE",
  });
  expect(
    taskUpdateSchema.parse({ assigneeId: "", dueDate: "", description: " " }),
  ).toEqual({ assigneeId: null, dueDate: null, description: null });
});
it("checks real calendar dates and text boundaries", () => {
  expect(
    taskSchema
      .parse({ title: "Ok", dueDate: "2028-02-29" })
      .dueDate?.toISOString(),
  ).toBe("2028-02-29T00:00:00.000Z");
  for (const input of [
    { title: " " },
    { title: "x".repeat(161) },
    { title: "Ok", description: "x".repeat(4001) },
    { title: "Ok", dueDate: "2026-02-29" },
    { title: "Ok", dueDate: "0000-01-01" },
    { title: "Ok", status: "BLOCKED" },
    { title: "Ok", assigneeId: "x".repeat(129) },
  ])
    expect(taskSchema.safeParse(input).success).toBe(false);
});
it("rejects empty edits and client attempts to supply project or identity fields", () => {
  expect(taskUpdateSchema.safeParse({}).success).toBe(false);
  for (const extra of [
    { projectId: "other" },
    { userId: "owner" },
    { role: "OWNER" },
    { assigneeProjectId: "other" },
    { id: "task" },
  ]) {
    expect(
      taskSchema.safeParse({ title: "Valid task", ...extra }).success,
    ).toBe(false);
    expect(
      taskUpdateSchema.safeParse({ status: "DONE", ...extra }).success,
    ).toBe(false);
    expect(deleteTaskSchema.safeParse(extra).success).toBe(false);
  }
});
