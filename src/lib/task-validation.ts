import { z } from "zod";
import { calendarDateSchema } from "./project-validation";

export const taskStatuses = ["TODO", "IN_PROGRESS", "DONE"] as const;
const fields = {
  title: z
    .string()
    .trim()
    .min(2, "Use at least 2 characters.")
    .max(160, "Use at most 160 characters."),
  description: z
    .string()
    .trim()
    .max(4000, "Use at most 4,000 characters.")
    .nullish()
    .transform((value) => value || null),
  status: z.enum(taskStatuses).optional(),
  dueDate: z
    .union([calendarDateSchema, z.literal("")])
    .nullish()
    .transform((value) => (value ? new Date(value + "T00:00:00.000Z") : null)),
  assigneeId: z
    .union([z.string().min(1).max(128), z.literal("")])
    .nullish()
    .transform((value) => value || null),
};

export const taskSchema = z
  .object(fields)
  .strict()
  .transform((input) => ({
    ...input,
    status: input.status ?? "TODO",
  }));
export const taskUpdateSchema = z
  .object(fields)
  .partial()
  .strict()
  .refine(
    (input) => Object.values(input).some((value) => value !== undefined),
    "Choose a change to save.",
  );
export const deleteTaskSchema = z.object({}).strict();
