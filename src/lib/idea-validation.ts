import { z } from "zod";
export const IDEA_PAGE_SIZE = 25;
export const ideaPageSchema = z.coerce
  .number()
  .int()
  .min(1)
  .max(1000000)
  .default(1);
export const ideaSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(2, "Use at least 2 characters for the title.")
      .max(120, "Keep the title to 120 characters or fewer."),
    body: z
      .string()
      .trim()
      .min(1, "Describe your idea before posting.")
      .max(4000, "Keep the description to 4,000 characters or fewer."),
  })
  .strict();
export const ideaVoteSchema = z.object({ voted: z.boolean() }).strict();
export const deleteIdeaSchema = z.object({}).strict();
