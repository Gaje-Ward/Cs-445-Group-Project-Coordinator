import { expect, it } from "vitest";
import {
  ideaSchema,
  ideaVoteSchema,
  deleteIdeaSchema,
  ideaPageSchema,
} from "@/lib/idea-validation";
it("trims idea text and enforces the title and description limits", () => {
  expect(
    ideaSchema.parse({
      title: "  Use diagrams  ",
      body: "  Explain the design\nThen review.  ",
    }),
  ).toEqual({
    title: "Use diagrams",
    body: "Explain the design\nThen review.",
  });
  for (const input of [
    { title: " ", body: "valid" },
    { title: "x", body: "valid" },
    { title: "x".repeat(121), body: "valid" },
    { title: "Valid", body: " " },
    { title: "Valid", body: "x".repeat(4001) },
  ])
    expect(ideaSchema.safeParse(input).success).toBe(false);
  expect(
    ideaSchema.safeParse({ title: "x".repeat(120), body: "x".repeat(4000) })
      .success,
  ).toBe(true);
});
it("rejects supplied identities and vote totals", () => {
  for (const field of ["id", "projectId", "authorId", "voteCount", "createdAt"])
    expect(
      ideaSchema.safeParse({
        title: "Valid",
        body: "Description",
        [field]: "fake",
      }).success,
    ).toBe(false);
  expect(ideaVoteSchema.parse({ voted: false })).toEqual({ voted: false });
  for (const input of [
    { voted: 1 },
    { voted: "true" },
    { voted: true, userId: "other" },
    {},
  ])
    expect(ideaVoteSchema.safeParse(input).success).toBe(false);
  expect(deleteIdeaSchema.safeParse({ authorId: "other" }).success).toBe(false);
});
it("bounds page numbers", () => {
  expect(ideaPageSchema.parse("2")).toBe(2);
  for (const page of [0, -1, 1.2, 1000001, "no"])
    expect(ideaPageSchema.safeParse(page).success).toBe(false);
});
