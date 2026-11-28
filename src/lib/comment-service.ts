import "server-only";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { ProjectNotFoundError } from "./project-service";
import {
  commentSchema,
  editCommentSchema,
  deleteCommentSchema,
  commentPageSchema,
  COMMENT_PAGE_SIZE,
} from "./comment-validation";
export class CommentNotFoundError extends Error {
  constructor() {
    super("Comment not found.");
  }
}
export class CommentConflictError extends Error {
  constructor() {
    super(
      "This comment changed or was removed. Refresh the discussion before trying again.",
    );
  }
}
const fields = {
  id: true,
  body: true,
  authorId: true,
  version: true,
  createdAt: true,
  updatedAt: true,
  author: { select: { name: true } },
} as const;
type StoredComment = Prisma.CommentGetPayload<{ select: typeof fields }>;
function publicComment({ author, ...comment }: StoredComment) {
  return { ...comment, authorName: author?.name ?? "Former user" };
}
async function membership(
  tx: Prisma.TransactionClient,
  userId: string,
  projectId: string,
) {
  const user = await tx.$queryRaw<
    { id: string }[]
  >`SELECT "id" FROM "User" WHERE "id"=${userId} AND "isActive"=true FOR KEY SHARE`;
  if (!user.length) throw new ProjectNotFoundError();
  // Use the same user-before-project lock order as account deletion and uploads.
  const project = await tx.$queryRaw<
    { id: string }[]
  >`SELECT p."id" FROM "Project" p JOIN "ProjectMember" m ON m."projectId"=p."id" WHERE p."id"=${projectId} AND m."userId"=${userId} FOR KEY SHARE OF p`;
  if (!project.length) throw new ProjectNotFoundError();
  const members = await tx.$queryRaw<
    { role: "OWNER" | "MEMBER" }[]
  >`SELECT "role"::text AS "role" FROM "ProjectMember" WHERE "projectId"=${projectId} AND "userId"=${userId} FOR KEY SHARE`;
  if (!members.length) throw new ProjectNotFoundError();
  return members[0];
}
export function createCommentService(db: PrismaClient) {
  return {
    async list(userId: string, projectId: string, input: unknown = 1) {
      const requestedPage = commentPageSchema.parse(input);
      return db.$transaction(async (tx) => {
        await membership(tx, userId, projectId);
        const total = await tx.comment.count({ where: { projectId } });
        const pageCount = Math.max(1, Math.ceil(total / COMMENT_PAGE_SIZE));
        const page = Math.min(requestedPage, pageCount);
        const items = await tx.comment.findMany({
          where: { projectId },
          select: fields,
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take: COMMENT_PAGE_SIZE,
          skip: (page - 1) * COMMENT_PAGE_SIZE,
        });
        return {
          items: items.map(publicComment),
          total,
          page,
          pageCount,
          pageSize: COMMENT_PAGE_SIZE,
        };
      });
    },
    async create(userId: string, projectId: string, input: unknown) {
      const { body } = commentSchema.parse(input);
      return db.$transaction(async (tx) => {
        await membership(tx, userId, projectId);
        return publicComment(
          await tx.comment.create({
            data: { projectId, authorId: userId, body },
            select: fields,
          }),
        );
      });
    },
    async edit(userId: string, projectId: string, id: string, input: unknown) {
      const { body, version } = editCommentSchema.parse(input);
      return db.$transaction(async (tx) => {
        await membership(tx, userId, projectId);
        const comment = await tx.comment.findFirst({
          where: { id, projectId },
          select: { authorId: true, version: true },
        });
        if (!comment || comment.authorId !== userId)
          throw new CommentNotFoundError();
        if (comment.version !== version) throw new CommentConflictError();
        const changed = await tx.comment.updateMany({
          where: { id, projectId, authorId: userId, version },
          data: { body, version: { increment: 1 } },
        });
        if (changed.count !== 1) throw new CommentConflictError();
        return publicComment(
          await tx.comment.findUniqueOrThrow({ where: { id }, select: fields }),
        );
      });
    },
    async remove(
      userId: string,
      projectId: string,
      id: string,
      input: unknown,
    ) {
      const { version } = deleteCommentSchema.parse(input);
      return db.$transaction(async (tx) => {
        const member = await membership(tx, userId, projectId);
        const comment = await tx.comment.findFirst({
          where: { id, projectId },
          select: { authorId: true, version: true },
        });
        if (
          !comment ||
          (comment.authorId !== userId && member.role !== "OWNER")
        )
          throw new CommentNotFoundError();
        if (comment.version !== version) throw new CommentConflictError();
        if (
          (await tx.comment.deleteMany({ where: { id, projectId, version } }))
            .count !== 1
        )
          throw new CommentConflictError();
      });
    },
  };
}
