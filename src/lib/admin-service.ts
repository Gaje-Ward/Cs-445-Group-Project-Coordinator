import "server-only";
import { z } from "zod";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { FileStore } from "./file-store";
import { FileError } from "./file-validation";
import {
  adminUserChangeSchema,
  adminPasswordResetSchema,
  adminDeleteUserSchema,
} from "./admin-user-validation";
import { hashPassword } from "./password";

export class AdminAccessError extends Error {
  constructor() {
    super("Administrator access is required.");
  }
}
export class AdminUserChangeError extends Error {
  constructor(
    message: string,
    readonly status = 409,
  ) {
    super(message);
  }
}
export const adminQuerySchema = z
  .object({
    view: z.enum(["users", "projects", "files", "history"]).default("users"),
    kind: z.enum(["all", "projects", "files"]).default("all"),
    q: z.string().trim().max(120).default(""),
    page: z.coerce.number().int().min(1).max(1000000).default(1),
    projectId: z.string().max(64).optional(),
  })
  .strict();
export type AdminQuery = z.infer<typeof adminQuerySchema>;
export const ADMIN_PAGE_SIZE = 25;

export function createAdminService(db: PrismaClient, store = new FileStore()) {
  async function allowed(userId: string) {
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { isAdmin: true, isActive: true },
    });
    return user?.isAdmin === true && user.isActive === true;
  }
  async function requireAdmin(userId: string) {
    if (!(await allowed(userId))) throw new AdminAccessError();
  }
  async function manageUser<T>(
    actorId: string,
    targetId: string,
    action: (
      tx: Prisma.TransactionClient,
      target: {
        id: string;
        name: string;
        email: string;
        isAdmin: boolean;
        isActive: boolean;
      },
    ) => Promise<T>,
  ) {
    return db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(445, 2)`;
      const actor = await tx.user.findUnique({
        where: { id: actorId },
        select: { isAdmin: true, isActive: true },
      });
      if (!actor?.isAdmin || !actor.isActive) throw new AdminAccessError();
      const target = await tx.user.findUnique({
        where: { id: targetId },
        select: {
          id: true,
          name: true,
          email: true,
          isAdmin: true,
          isActive: true,
        },
      });
      if (!target) throw new AdminUserChangeError("User not found.", 404);
      return action(tx, target);
    });
  }
  return {
    allowed,
    async deleteUser(actorId: string, targetId: string, input: unknown) {
      await requireAdmin(actorId);
      const {
        confirmationEmail,
        transferOwnedProjects,
        expectedOwnedProjectCount,
      } = adminDeleteUserSchema.parse(input);
      return manageUser(actorId, targetId, async (tx, target) => {
        if (actorId === targetId)
          throw new AdminUserChangeError(
            "You cannot permanently delete your own administrator account.",
          );
        if (confirmationEmail !== target.email)
          throw new AdminUserChangeError(
            "Enter this account's email address to confirm deletion.",
            400,
          );
        // Block new memberships/uploads while checking ownership and deleting the account.
        await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id"=${targetId} FOR UPDATE`;
        if (
          target.isAdmin &&
          target.isActive &&
          (await tx.user.count({ where: { isAdmin: true, isActive: true } })) <=
            1
        )
          throw new AdminUserChangeError(
            "Keep at least one active administrator.",
          );
        const owned = await tx.projectMember.findMany({
          where: { userId: targetId, role: "OWNER" },
          select: { projectId: true },
          orderBy: { projectId: "asc" },
        });
        if (owned.length && !transferOwnedProjects)
          throw new AdminUserChangeError(
            "Transfer this user's owned projects before permanently deleting the account.",
          );
        if (transferOwnedProjects && owned.length !== expectedOwnedProjectCount)
          throw new AdminUserChangeError(
            "Owned projects changed. Refresh and review them before deleting the account.",
          );
        for (const { projectId } of owned) {
          await tx.$queryRaw`SELECT "id" FROM "Project" WHERE "id"=${projectId} FOR UPDATE`;
          await tx.projectMember.upsert({
            where: { projectId_userId: { projectId, userId: actorId } },
            create: { projectId, userId: actorId, role: "OWNER" },
            update: { role: "OWNER" },
          });
        }
        await tx.projectMember.deleteMany({ where: { userId: targetId } });
        await tx.user.delete({ where: { id: targetId }, select: { id: true } });
      });
    },
    async resetPassword(actorId: string, targetId: string, input: unknown) {
      await requireAdmin(actorId);
      const { password } = adminPasswordResetSchema.parse(input);
      const passwordHash = await hashPassword(password);
      await manageUser(actorId, targetId, (tx) =>
        tx.user.update({
          where: { id: targetId },
          data: { passwordHash, sessionVersion: { increment: 1 } },
          select: { id: true },
        }),
      );
    },
    async changeUser(actorId: string, targetId: string, input: unknown) {
      await requireAdmin(actorId);
      const change = adminUserChangeSchema.parse(input);
      return manageUser(actorId, targetId, async (tx, target) => {
        if (
          actorId === targetId &&
          (change.isAdmin === false || change.isActive === false)
        )
          throw new AdminUserChangeError(
            "You cannot disable your own account or remove your own administrator access.",
          );
        const nextAdmin = change.isAdmin ?? target.isAdmin,
          nextActive = change.isActive ?? target.isActive;
        if (change.isAdmin === true && !nextActive)
          throw new AdminUserChangeError(
            "Reactivate this account before granting administrator access.",
          );
        if (
          target.isAdmin &&
          target.isActive &&
          (!nextAdmin || !nextActive) &&
          (await tx.user.count({ where: { isAdmin: true, isActive: true } })) <=
            1
        )
          throw new AdminUserChangeError(
            "Keep at least one active administrator.",
          );
        return tx.user.update({
          where: { id: targetId },
          data: {
            ...change,
            ...(change.isActive !== undefined &&
            change.isActive !== target.isActive
              ? { sessionVersion: { increment: 1 } }
              : {}),
          },
          select: {
            id: true,
            name: true,
            email: true,
            isAdmin: true,
            isActive: true,
          },
        });
      });
    },
    async overview(userId: string, input: unknown = {}) {
      await requireAdmin(userId);
      const query = adminQuerySchema.parse(input);
      const [users, projects, files, usage] = await Promise.all([
        db.user.count(),
        db.project.count(),
        db.projectFile.count({ where: { state: "READY" } }),
        db.projectFile.aggregate({
          where: { state: "READY" },
          _sum: { size: true },
        }),
      ]);
      return {
        query,
        counts: { users, projects, files, bytes: usage._sum.size ?? 0 },
      };
    },
    async users(userId: string, input: unknown = {}) {
      await requireAdmin(userId);
      const query = adminQuerySchema.parse(input);
      const where: Prisma.UserWhereInput = query.q
        ? {
            OR: [
              { name: { contains: query.q, mode: "insensitive" } },
              { email: { contains: query.q, mode: "insensitive" } },
            ],
          }
        : {};
      const [total, items] = await Promise.all([
        db.user.count({ where }),
        db.user.findMany({
          where,
          select: {
            id: true,
            name: true,
            email: true,
            isAdmin: true,
            isActive: true,
            createdAt: true,
            _count: { select: { memberships: true, uploads: true } },
          },
          orderBy: [{ createdAt: "desc" }, { id: "asc" }],
          skip: (query.page - 1) * ADMIN_PAGE_SIZE,
          take: ADMIN_PAGE_SIZE,
        }),
      ]);
      const ownership = items.length
        ? await db.projectMember.groupBy({
            by: ["userId"],
            where: {
              userId: { in: items.map((user) => user.id) },
              role: "OWNER",
            },
            _count: { _all: true },
          })
        : [];
      const ownedCounts = new Map(
        ownership.map((row) => [row.userId, row._count._all]),
      );
      return {
        items: items.map((user) => ({
          ...user,
          ownedProjectCount: ownedCounts.get(user.id) ?? 0,
        })),
        total,
        page: query.page,
        pageSize: ADMIN_PAGE_SIZE,
      };
    },
    async projects(userId: string, input: unknown = {}) {
      await requireAdmin(userId);
      const query = adminQuerySchema.parse(input);
      const where: Prisma.ProjectWhereInput = query.q
        ? {
            OR: [
              { name: { contains: query.q, mode: "insensitive" } },
              { description: { contains: query.q, mode: "insensitive" } },
            ],
          }
        : {};
      const [total, items] = await Promise.all([
        db.project.count({ where }),
        db.project.findMany({
          where,
          select: {
            id: true,
            name: true,
            description: true,
            deadline: true,
            createdAt: true,
            memberships: {
              where: { role: "OWNER" },
              select: { user: { select: { name: true, email: true } } },
            },
            _count: {
              select: {
                memberships: true,
                tasks: true,
                files: { where: { state: "READY" } },
              },
            },
          },
          orderBy: [{ createdAt: "desc" }, { id: "asc" }],
          skip: (query.page - 1) * ADMIN_PAGE_SIZE,
          take: ADMIN_PAGE_SIZE,
        }),
      ]);
      return { items, total, page: query.page, pageSize: ADMIN_PAGE_SIZE };
    },
    async files(userId: string, input: unknown = {}) {
      await requireAdmin(userId);
      const query = adminQuerySchema.parse(input);
      const where: Prisma.ProjectFileWhereInput = {
        ...(query.projectId ? { projectId: query.projectId } : {}),
        ...(query.q
          ? {
              OR: [
                { name: { contains: query.q, mode: "insensitive" } },
                {
                  project: { name: { contains: query.q, mode: "insensitive" } },
                },
                {
                  uploader: {
                    email: { contains: query.q, mode: "insensitive" },
                  },
                },
              ],
            }
          : {}),
      };
      const [total, items] = await Promise.all([
        db.projectFile.count({ where }),
        db.projectFile.findMany({
          where,
          select: {
            id: true,
            name: true,
            size: true,
            mediaType: true,
            state: true,
            createdAt: true,
            project: { select: { id: true, name: true } },
            uploader: { select: { name: true, email: true } },
          },
          orderBy: [{ createdAt: "desc" }, { id: "asc" }],
          skip: (query.page - 1) * ADMIN_PAGE_SIZE,
          take: ADMIN_PAGE_SIZE,
        }),
      ]);
      return { items, total, page: query.page, pageSize: ADMIN_PAGE_SIZE };
    },
    async history(userId: string, input: unknown = {}) {
      await requireAdmin(userId);
      const query = adminQuerySchema.parse(input);
      const where: Prisma.DeletionRecordWhereInput = {
        ...(query.projectId ? { projectId: query.projectId } : {}),
        ...(query.kind !== "all"
          ? { kind: query.kind === "projects" ? "PROJECT" : "FILE" }
          : {}),
        ...(query.q
          ? {
              OR: [
                { name: { contains: query.q, mode: "insensitive" } },
                { projectName: { contains: query.q, mode: "insensitive" } },
              ],
            }
          : {}),
      };
      const [total, items] = await Promise.all([
        db.deletionRecord.count({ where }),
        db.deletionRecord.findMany({
          where,
          select: {
            id: true,
            kind: true,
            name: true,
            projectId: true,
            projectName: true,
            deletedAt: true,
          },
          orderBy: [{ deletedAt: "desc" }, { id: "asc" }],
          skip: (query.page - 1) * ADMIN_PAGE_SIZE,
          take: ADMIN_PAGE_SIZE,
        }),
      ]);
      return { items, total, page: query.page, pageSize: ADMIN_PAGE_SIZE };
    },
    async download(userId: string, id: string) {
      await requireAdmin(userId);
      const file = await db.projectFile.findFirst({
        where: { id, state: "READY" },
        select: { id: true, name: true, size: true, storageKey: true },
      });
      if (!file) throw new FileError("File not found.", 404);
      let body: ReadableStream<Uint8Array> | Uint8Array;
      if (file.storageKey) {
        try {
          body = await store.read(file.storageKey, file.size);
        } catch {
          throw new FileError(
            "This file is temporarily unavailable. Please try again.",
            503,
          );
        }
      } else {
        const legacy = await db.projectFile.findFirst({
          where: { id, state: "READY" },
          select: { data: true },
        });
        if (!legacy?.data) throw new FileError("File not found.", 404);
        body = new Uint8Array(legacy.data);
      }
      return { name: file.name, size: file.size, body };
    },
  };
}
