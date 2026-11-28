import { expect, it } from "vitest";
import {
  commentSchema,
  editCommentSchema,
  deleteCommentSchema,
  commentPageSchema,
  COMMENT_MAX_LENGTH,
} from "@/lib/comment-validation";
it("trims comments, preserves line breaks, and accepts the length boundary", () => {
  expect(commentSchema.parse({ body: "  Team notes\nNext step  " })).toEqual({
    body: "Team notes\nNext step",
  });
  expect(
    commentSchema.parse({ body: "x".repeat(COMMENT_MAX_LENGTH) }).body,
  ).toHaveLength(COMMENT_MAX_LENGTH);
  for (const body of ["", "  \n\t ", "x".repeat(COMMENT_MAX_LENGTH + 1)])
    expect(() => commentSchema.parse({ body })).toThrow();
});
it("rejects client identity, project, and timestamp fields", () => {
  for (const extra of [
    { authorId: "someone" },
    { projectId: "other" },
    { createdAt: "forged" },
    { isAdmin: true },
  ])
    expect(() =>
      commentSchema.parse({ body: "Valid comment", ...extra }),
    ).toThrow();
  expect(() =>
    editCommentSchema.parse({
      body: "Updated",
      version: 0,
      authorId: "someone",
    }),
  ).toThrow();
  expect(() =>
    deleteCommentSchema.parse({ version: 0, role: "OWNER" }),
  ).toThrow();
});
it("requires an exact nonnegative version for editing or deletion", () => {
  expect(editCommentSchema.parse({ body: "Updated", version: 0 })).toEqual({
    body: "Updated",
    version: 0,
  });
  expect(deleteCommentSchema.parse({ version: 1 })).toEqual({ version: 1 });
  for (const version of [undefined, -1, 0.5, "0", true]) {
    expect(() =>
      editCommentSchema.parse({ body: "Updated", version }),
    ).toThrow();
    expect(() => deleteCommentSchema.parse({ version })).toThrow();
  }
});
it("bounds pagination and provides a default first page", () => {
  expect(commentPageSchema.parse(undefined)).toBe(1);
  expect(commentPageSchema.parse("2")).toBe(2);
  for (const page of [0, -1, 1.5, "bad", 1000001])
    expect(() => commentPageSchema.parse(page)).toThrow();
});
