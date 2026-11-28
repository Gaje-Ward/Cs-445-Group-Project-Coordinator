import "server-only";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { ProjectNotFoundError } from "./project-service";
import {
  ideaSchema,
  ideaVoteSchema,
  deleteIdeaSchema,
  ideaPageSchema,
  IDEA_PAGE_SIZE,
} from "./idea-validation";

export class IdeaNotFoundError extends Error {
  constructor() {
    super("Idea not found.");
  }
}
const fields = {
  id: true,
  title: true,
  body: true,
  authorId: true,
  createdAt: true,
  author: { select: { name: true } },
} as const;
async function membership(
  tx: Prisma.TransactionClient,
  userId: string,
  projectId: string,
) {
  const user = await tx.$queryRaw<
    { id: string }[]
  >`SELECT "id" FROM "User" WHERE "id"=${userId} AND "isActive"=true FOR KEY SHARE`;
  if (!user.length) throw new ProjectNotFoundError();
  // Match account deletion and upload lock order before holding the membership.
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
export function createIdeaService(db: PrismaClient) {
  return {
    async list(userId: string, projectId: string, input: unknown = 1) {
      const requestedPage = ideaPageSchema.parse(input);
      return db.$transaction(async (tx) => {
        await membership(tx, userId, projectId);
        const total = await tx.idea.count({ where: { projectId } });
        const pageCount = Math.max(1, Math.ceil(total / IDEA_PAGE_SIZE)),
          page = Math.min(requestedPage, pageCount);
        const items = await tx.idea.findMany({
          where: { projectId },
          select: {
            ...fields,
            _count: { select: { votes: true } },
            votes: { where: { userId }, select: { userId: true } },
          },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take: IDEA_PAGE_SIZE,
          skip: (page - 1) * IDEA_PAGE_SIZE,
        });
        return {
          items: items.map(({ author, _count, votes, ...idea }) => ({
            ...idea,
            authorName: author?.name ?? "Former user",
            voteCount: _count.votes,
            voted: votes.length > 0,
          })),
          total,
          page,
          pageCount,
        };
      });
    },
    async create(userId: string, projectId: string, input: unknown) {
      const data = ideaSchema.parse(input);
      return db.$transaction(async (tx) => {
        await membership(tx, userId, projectId);
        const { author, ...idea } = await tx.idea.create({
          data: { ...data, projectId, authorId: userId },
          select: fields,
        });
        return {
          ...idea,
          authorName: author?.name ?? "Former user",
          voteCount: 0,
          voted: false,
        };
      });
    },
    async vote(
      userId: string,
      projectId: string,
      ideaId: string,
      input: unknown,
    ) {
      const { voted } = ideaVoteSchema.parse(input);
      return db.$transaction(async (tx) => {
        await membership(tx, userId, projectId);
        const idea = await tx.$queryRaw<
          { id: string }[]
        >`SELECT "id" FROM "Idea" WHERE "id"=${ideaId} AND "projectId"=${projectId} FOR UPDATE`;
        if (!idea.length) throw new IdeaNotFoundError();
        // An explicit desired state makes retries safe; the primary key prevents duplicate votes.
        if (voted)
          await tx.ideaVote.createMany({
            data: [{ projectId, ideaId, userId }],
            skipDuplicates: true,
          });
        else
          await tx.ideaVote.deleteMany({
            where: { projectId, ideaId, userId },
          });
        return {
          voted,
          voteCount: await tx.ideaVote.count({ where: { projectId, ideaId } }),
        };
      });
    },
    async remove(
      userId: string,
      projectId: string,
      id: string,
      input: unknown,
    ) {
      deleteIdeaSchema.parse(input);
      return db.$transaction(async (tx) => {
        const member = await membership(tx, userId, projectId);
        const changed = await tx.idea.deleteMany({
          where: {
            id,
            projectId,
            ...(member.role === "OWNER" ? {} : { authorId: userId }),
          },
        });
        if (changed.count !== 1) throw new IdeaNotFoundError();
      });
    },
  };
}
