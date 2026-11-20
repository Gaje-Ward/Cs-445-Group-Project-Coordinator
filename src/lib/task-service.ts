import "server-only";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { ProjectNotFoundError } from "./project-service";
import {
  taskSchema,
  taskUpdateSchema,
  deleteTaskSchema,
} from "./task-validation";

export class TaskNotFoundError extends Error {
  constructor() {
    super("Task not found.");
  }
}
export class TaskAssignmentError extends Error {
  constructor() {
    super("Choose someone who is still a member of this project.");
  }
}
const fields = {
  id: true,
  title: true,
  description: true,
  status: true,
  dueDate: true,
  assigneeId: true,
  createdAt: true,
  updatedAt: true,
  assignee: { select: { user: { select: { name: true } } } },
} as const;
type StoredTask = Prisma.TaskGetPayload<{ select: typeof fields }>;
function publicTask({ assignee, ...task }: StoredTask) {
  return { ...task, assigneeName: assignee?.user.name ?? null };
}
async function membership(
  tx: Prisma.TransactionClient,
  userId: string,
  projectId: string,
) {
  const member = await tx.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId } },
    select: { role: true },
  });
  if (!member) throw new ProjectNotFoundError();
  return member;
}
async function assignment(
  tx: Prisma.TransactionClient,
  projectId: string,
  assigneeId: string | null | undefined,
) {
  if (assigneeId === undefined) return {};
  if (
    assigneeId &&
    !(await tx.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId: assigneeId } },
      select: { userId: true },
    }))
  )
    throw new TaskAssignmentError();
  return { assigneeId, assigneeProjectId: assigneeId ? projectId : null };
}
async function assignmentWrite<T>(write: () => Promise<T>) {
  try {
    return await write();
  } catch (error) {
    // The membership FK is the final check if an assignee is removed concurrently.
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "P2003"
    )
      throw new TaskAssignmentError();
    throw error;
  }
}

export function createTaskService(db: PrismaClient) {
  return {
    async list(userId: string, projectId: string) {
      const project = await db.project.findFirst({
        where: { id: projectId, memberships: { some: { userId } } },
        select: {
          tasks: {
            orderBy: [
              { status: "asc" },
              { dueDate: { sort: "asc", nulls: "last" } },
              { createdAt: "desc" },
              { id: "asc" },
            ],
            select: fields,
          },
        },
      });
      if (!project) throw new ProjectNotFoundError();
      return project.tasks.map(publicTask);
    },
    async create(userId: string, projectId: string, input: unknown) {
      const { assigneeId, ...data } = taskSchema.parse(input);
      return assignmentWrite(() =>
        db.$transaction(async (tx) => {
          await membership(tx, userId, projectId);
          const assignee = await assignment(tx, projectId, assigneeId);
          return publicTask(
            await tx.task.create({
              data: { ...data, projectId, ...assignee },
              select: fields,
            }),
          );
        }),
      );
    },
    async edit(userId: string, projectId: string, id: string, input: unknown) {
      const { assigneeId, ...data } = taskUpdateSchema.parse(input);
      return assignmentWrite(() =>
        db.$transaction(async (tx) => {
          await membership(tx, userId, projectId);
          if (
            !(await tx.task.findFirst({
              where: { id, projectId },
              select: { id: true },
            }))
          )
            throw new TaskNotFoundError();
          const assignee = await assignment(tx, projectId, assigneeId);
          const updated = await tx.task.updateMany({
            where: {
              id,
              projectId,
              project: { memberships: { some: { userId } } },
            },
            data: { ...data, ...assignee },
          });
          if (updated.count !== 1) throw new TaskNotFoundError();
          return publicTask(
            await tx.task.findUniqueOrThrow({ where: { id }, select: fields }),
          );
        }),
      );
    },
    async remove(
      userId: string,
      projectId: string,
      id: string,
      input: unknown,
    ) {
      deleteTaskSchema.parse(input);
      return db.$transaction(async (tx) => {
        const member = await membership(tx, userId, projectId);
        if (member.role !== "OWNER") throw new TaskNotFoundError();
        const deleted = await tx.task.deleteMany({
          where: {
            id,
            projectId,
            project: { memberships: { some: { userId, role: "OWNER" } } },
          },
        });
        if (deleted.count !== 1) throw new TaskNotFoundError();
      });
    },
  };
}
