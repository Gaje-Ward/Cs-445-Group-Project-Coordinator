import "server-only";
import { hash, compare } from "bcryptjs";
import { passwordSchema } from "./validation";
export const BCRYPT_COST = 12;
export async function hashPassword(password: string) {
  return hash(passwordSchema.parse(password), BCRYPT_COST);
}
export async function verifyPassword(password: string, passwordHash: string) {
  if (!passwordSchema.safeParse(password).success) return false;
  return compare(password, passwordHash);
}
// Keep missing-user and wrong-password requests doing comparable password work.
let dummyHash: Promise<string> | undefined;
export function getDummyHash() {
  return (dummyHash ??= hash("dummy-password-not-an-account", BCRYPT_COST));
}
