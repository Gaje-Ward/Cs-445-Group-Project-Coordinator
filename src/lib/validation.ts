import { z } from "zod";
const email = z
  .string()
  .trim()
  .toLowerCase()
  .email("Enter a valid email address.")
  .max(254);
export const passwordSchema = z
  .string()
  .min(12, "Use at least 12 characters.")
  .max(72, "Use at most 72 characters.")
  .refine(
    (value) => new TextEncoder().encode(value).length <= 72,
    "Password must be at most 72 UTF-8 bytes.",
  );
export const registrationSchema = z
  .object({
    name: z.string().trim().min(2, "Use at least 2 characters.").max(80),
    email,
    password: passwordSchema,
  })
  .strict();
export const loginSchema = z.object({ email, password: passwordSchema });
export type RegistrationInput = z.infer<typeof registrationSchema>;
