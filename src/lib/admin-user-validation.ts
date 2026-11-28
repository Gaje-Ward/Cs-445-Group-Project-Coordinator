import { z } from "zod";
import { passwordSchema } from "./validation";
export const adminPasswordResetSchema = z
  .object({ password: passwordSchema })
  .strict();
export const adminDeleteUserSchema = z
  .object({
    confirmationEmail: z.string().trim().toLowerCase().email().max(254),
    transferOwnedProjects: z.boolean().default(false),
    expectedOwnedProjectCount: z.number().int().min(0).optional(),
  })
  .strict()
  .refine(
    (value) =>
      !value.transferOwnedProjects ||
      value.expectedOwnedProjectCount !== undefined,
    "Review the owned project count before transferring ownership.",
  );
export const adminUserChangeSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(2, "Use at least 2 characters.")
      .max(80)
      .optional(),
    isAdmin: z.boolean().optional(),
    isActive: z.boolean().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, "Choose a change to save.");
