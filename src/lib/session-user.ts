import "server-only";
import type { PrismaClient } from "@/generated/prisma/client";
export async function loadSessionUser(
  db: PrismaClient,
  id: string,
  version: unknown,
) {
  if (!id) return null;
  const user = await db.user.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      email: true,
      isActive: true,
      sessionVersion: true,
    },
  });
  const expected = version === undefined ? 0 : version;
  if (!user?.isActive || user.sessionVersion !== expected) return null;
  return { id: user.id, name: user.name, email: user.email };
}
