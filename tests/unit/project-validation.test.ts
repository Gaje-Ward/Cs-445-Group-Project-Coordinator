import { expect, it } from "vitest";
import { projectSchema } from "@/lib/project-validation";
it("normalizes valid project input and optional fields", () => {
  expect(projectSchema.parse({ name: "  My project  " })).toEqual({
    name: "My project",
    description: null,
    deadline: null,
  });
  expect(
    projectSchema.parse({
      name: "Project",
      description: " notes ",
      deadline: "2028-02-29",
    }),
  ).toEqual({
    name: "Project",
    description: "notes",
    deadline: new Date("2028-02-29T00:00:00.000Z"),
  });
  expect(
    projectSchema.parse({ name: "Project", description: "  ", deadline: "" })
      .deadline,
  ).toBeNull();
  expect(
    projectSchema.safeParse({ name: "Project", deadline: "2020-01-01" })
      .success,
  ).toBe(true);
});
it.each(["", " ", "x", "x".repeat(121), null, 123])(
  "rejects invalid name %s",
  (name) => {
    expect(projectSchema.safeParse({ name }).success).toBe(false);
  },
);
it.each(["x".repeat(2001), 4, {}, []])(
  "rejects invalid description",
  (description) => {
    expect(
      projectSchema.safeParse({ name: "Project", description }).success,
    ).toBe(false);
  },
);
it.each([
  "2026-02-29",
  "2026-02-30",
  "2026-13-01",
  "2026-00-01",
  "0000-01-01",
  "10/12/2026",
  "2026-01-01T10:00:00Z",
  123,
])("rejects invalid deadline %s", (deadline) => {
  expect(projectSchema.safeParse({ name: "Project", deadline }).success).toBe(
    false,
  );
});
it("rejects client ownership and identity fields", () => {
  for (const field of ["id", "userId", "role", "memberships"])
    expect(
      projectSchema.safeParse({ name: "Project", [field]: "attacker" }).success,
    ).toBe(false);
});
