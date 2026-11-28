import "server-only";
import { z } from "zod";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { FileStore } from "./file-store";
import { FileError } from "./file-validation";

export class AdminAccessError extends Error {
  constructor() {
    super("Administrator access is required.");
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
      select: { isAdmin: true },
    });
    return user?.isAdmin === true;
  }
  async function requireAdmin(userId: string) {
    if (!(await allowed(userId))) throw new AdminAccessError();
  }

  return {
    allowed,

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

            createdAt: true,
            _count: { select: { memberships: true, uploads: true } },
          },
          orderBy: [{ createdAt: "desc" }, { id: "asc" }],
          skip: (query.page - 1) * ADMIN_PAGE_SIZE,
          take: ADMIN_PAGE_SIZE,
        }),
      ]);
      return { items, total, page: query.page, pageSize: ADMIN_PAGE_SIZE };
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
