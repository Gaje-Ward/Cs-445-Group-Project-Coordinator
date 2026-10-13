import "server-only";
import { getDb } from "./db";
import { createUserService } from "./user-service";
export const users = createUserService({
  findByEmail: (email) =>
    getDb().user.findUnique({
      where: { email },
      select: { id: true, name: true, email: true, passwordHash: true },
    }),
  create: (data) =>
    getDb().user.create({
      data,
      select: { id: true, name: true, email: true },
    }),
});
