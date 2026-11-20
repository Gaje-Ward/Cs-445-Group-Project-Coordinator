import { z } from "zod";
import { registrationSchema } from "./validation";

export const addMemberSchema = registrationSchema
  .pick({ email: true })
  .strict();
export const removeMemberSchema = z
  .object({
    userId: z.string().min(1).max(128),
  })
  .strict();
