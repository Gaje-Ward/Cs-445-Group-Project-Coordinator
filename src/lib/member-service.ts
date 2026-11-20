import "server-only";
import type { PrismaClient } from "@/generated/prisma/client";
import { ProjectNotFoundError } from "./project-service";
import { addMemberSchema, removeMemberSchema } from "./member-validation";

export class MemberChangeError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 404 | 409,
  ) {
    super(message);
  }
}

export function createMemberService(db: PrismaClient) {
  return {
    async list(userId: string, projectId: string) {
      const project = await db.project.findFirst({
        where: { id: projectId, memberships: { some: { userId } } },
        select: {
          memberships: {
            orderBy: [
              { role: "asc" },
              { user: { name: "asc" } },
              { userId: "asc" },
            ],
            select: {
              userId: true,
              role: true,
              user: { select: { name: true } },
            },
          },
        },
      });
      if (!project) throw new ProjectNotFoundError();
      return project.memberships.map(({ user, ...membership }) => ({
        ...membership,
        name: user.name,
      }));
    },
    async add(userId: string, projectId: string, input: unknown) {
      const { email } = addMemberSchema.parse(input);
      return db.$transaction(async (tx) => {
        const project = await tx.project.findFirst({
          where: {
            id: projectId,
            memberships: { some: { userId, role: "OWNER" } },
          },
          select: { id: true },
        });
        if (!project) throw new ProjectNotFoundError();
        const user = await tx.user.findUnique({
          where: { email },
          select: { id: true, name: true },
        });
        if (!user)
          throw new MemberChangeError(
            "No account uses that email address. Ask your teammate to register first.",
            400,
          );
        // The unique project/user key also handles simultaneous add requests.
        const created = await tx.projectMember.createMany({
          data: [{ projectId, userId: user.id, role: "MEMBER" }],
          skipDuplicates: true,
        });
        if (created.count !== 1)
          throw new MemberChangeError(
            "That person is already on this project.",
            409,
          );
        return { userId: user.id, name: user.name, role: "MEMBER" as const };
      });
    },
    async remove(userId: string, projectId: string, input: unknown) {
      const target = removeMemberSchema.parse(input);
      return db.$transaction(async (tx) => {
        const project = await tx.project.findFirst({
          where: {
            id: projectId,
            memberships: { some: { userId, role: "OWNER" } },
          },
          select: { id: true },
        });
        if (!project) throw new ProjectNotFoundError();
        const membership = await tx.projectMember.findUnique({
          where: { projectId_userId: { projectId, userId: target.userId } },
          select: { role: true },
        });
        if (membership?.role === "OWNER")
          throw new MemberChangeError(
            "The project owner cannot be removed.",
            409,
          );
        const deleted = await tx.projectMember.deleteMany({
          where: {
            projectId,
            userId: target.userId,
            role: "MEMBER",
            project: { memberships: { some: { userId, role: "OWNER" } } },
          },
        });
        if (deleted.count !== 1)
          throw new MemberChangeError(
            "That person is no longer on this project.",
            404,
          );
      });
    },
  };
}
