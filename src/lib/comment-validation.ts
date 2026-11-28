import { z } from "zod";
export const COMMENT_MAX_LENGTH = 4000;
export const COMMENT_PAGE_SIZE = 25;
export const commentPageSchema = z.coerce
  .number()
  .int()
  .min(1)
  .max(1000000)
  .default(1);
const body = z
  .string()
  .trim()
  .min(1, "Write a comment before posting.")
  .max(COMMENT_MAX_LENGTH, "Keep comments to 4,000 characters or fewer.");
const version = z.number().int().min(0);
export const commentSchema = z.object({ body }).strict();
export const editCommentSchema = z.object({ body, version }).strict();
export const deleteCommentSchema = z.object({ version }).strict();
