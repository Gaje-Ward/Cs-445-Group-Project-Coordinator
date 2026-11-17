import { z } from "zod";

// Deadlines are calendar dates, stored at UTC midnight without a time-of-day.
const deadline = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date in YYYY-MM-DD format.")
  .refine((value) => {
    const date = new Date(value + "T00:00:00.000Z");
    return (
      value.slice(0, 4) !== "0000" &&
      Number.isFinite(date.getTime()) &&
      date.toISOString().slice(0, 10) === value
    );
  }, "Choose a valid calendar date.");

export const projectSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(2, "Use at least 2 characters.")
      .max(120, "Use at most 120 characters."),
    description: z
      .string()
      .trim()
      .max(2000, "Use at most 2,000 characters.")
      .optional()
      .nullable(),
    deadline: z
      .union([deadline, z.literal("")])
      .optional()
      .nullable(),
  })
  .strict()
  .transform((input) => ({
    name: input.name,
    description: input.description || null,
    deadline: input.deadline
      ? new Date(input.deadline + "T00:00:00.000Z")
      : null,
  }));
