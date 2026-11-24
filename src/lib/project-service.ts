import "server-only";
import type { PrismaClient } from "@/generated/prisma/client";
import { projectSchema } from "./project-validation";
import { summarizeTasks } from "./project-progress";
import { getProjectCalendar } from "./project-calendar";

const fields = {
  id: true,
  name: true,
  description: true,
  deadline: true,
  createdAt: true,
  updatedAt: true,
} as const;
export class ProjectNotFoundError extends Error {
  constructor() {
    super("Project not found.");
  }
}
export function createProjectService(db: PrismaClient) {
  return {
    async create(userId: string, input: unknown) {
      const data = projectSchema.parse(input);
      return db.$transaction(async (tx) =>
        tx.project.create({
          data: { ...data, memberships: { create: { userId, role: "OWNER" } } },
          select: fields,
        }),
      );
    },
    async list(userId: string, today = getProjectCalendar().today) {
      const items = await db.project.findMany({
        where: { memberships: { some: { userId } } },
        select: {
          ...fields,
          tasks: { select: { status: true, dueDate: true } },
        },
        orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
      });
      return items.map(({ tasks, ...project }) => ({
        ...project,
        progress: summarizeTasks(tasks, today),
      }));
    },
    async get(userId: string, id: string) {
      const project = await db.project.findFirst({
        where: { id, memberships: { some: { userId } } },
        select: {
          ...fields,
          memberships: { where: { userId }, select: { role: true } },
        },
      });
      if (!project) throw new ProjectNotFoundError();
      const { memberships, ...publicProject } = project;
      return { ...publicProject, role: memberships[0].role };
    },
    async edit(userId: string, id: string, input: unknown) {
      const data = projectSchema.parse(input);
      return db.$transaction(async (tx) => {
        // Authorization is part of the write predicate, not a separate preflight check.
        const changed = await tx.project.updateMany({
          where: { id, memberships: { some: { userId, role: "OWNER" } } },
          data,
        });
        if (changed.count !== 1) throw new ProjectNotFoundError();
        return tx.project.findUniqueOrThrow({ where: { id }, select: fields });
      });
    },
  };
}
