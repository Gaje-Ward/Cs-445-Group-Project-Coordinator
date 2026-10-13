import "server-only";
import { registrationSchema, loginSchema } from "./validation";
import { getDummyHash, hashPassword, verifyPassword } from "./password";
export type PublicUser = { id: string; name: string; email: string };
export type StoredUser = PublicUser & { passwordHash: string };
export type UserStore = {
  findByEmail: (email: string) => Promise<StoredUser | null>;
  create: (data: {
    name: string;
    email: string;
    passwordHash: string;
  }) => Promise<PublicUser>;
};
export class DuplicateEmailError extends Error {
  constructor() {
    super("An account with this email already exists.");
  }
}
function isUniqueViolation(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2002"
  );
}
export function createUserService(store: UserStore) {
  return {
    async register(input: unknown): Promise<PublicUser> {
      const { name, email, password } = registrationSchema.parse(input);
      if (await store.findByEmail(email)) throw new DuplicateEmailError();
      const passwordHash = await hashPassword(password);
      try {
        const user = await store.create({ name, email, passwordHash });
        return { id: user.id, name: user.name, email: user.email };
      } catch (error) {
        if (isUniqueViolation(error)) throw new DuplicateEmailError();
        throw error;
      }
    },
    async authenticate(input: unknown): Promise<PublicUser | null> {
      const parsed = loginSchema.safeParse(input);
      if (!parsed.success) return null;
      const user = await store.findByEmail(parsed.data.email);
      const valid = await verifyPassword(
        parsed.data.password,
        user?.passwordHash ?? (await getDummyHash()),
      );
      if (!user || !valid) return null;
      return { id: user.id, name: user.name, email: user.email };
    },
  };
}
