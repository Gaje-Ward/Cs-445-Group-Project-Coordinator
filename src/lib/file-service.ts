import "server-only";
import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@/generated/prisma/client";
import {
  FileError,
  fileType,
  validateFileSize,
  PROJECT_FILE_BYTES,
  PROJECT_FILE_COUNT,
} from "./file-validation";
import { FileStore } from "./file-store";
import { ProjectNotFoundError } from "./project-service";
const fields = {
  id: true,
  name: true,
  mediaType: true,
  size: true,
  uploaderId: true,
  createdAt: true,
  uploader: { select: { name: true } },
} as const;
const transfers = globalThis as unknown as { activeFileUploads?: number };
export function createFileService(
  db: PrismaClient,
  store = new FileStore(),
  projectQuota = PROJECT_FILE_BYTES,
) {
  async function uploadStream(
    userId: string,
    projectId: string,
    name: string,
    size: number,
    body: ReadableStream<Uint8Array>,
    signal?: AbortSignal,
  ) {
    const { mediaType } = fileType(name);
    validateFileSize(size);
    if ((transfers.activeFileUploads ?? 0) >= 2)
      throw new FileError(
        "Other uploads are in progress. Please try again shortly.",
        429,
      );
    transfers.activeFileUploads = (transfers.activeFileUploads ?? 0) + 1;
    const storageKey = randomUUID();
    let id: string | undefined;
    try {
      const reserved = await db.$transaction(async (tx) => {
        // Match account deletion's user-before-project lock order.
        const account = await tx.$queryRaw<
          { id: string }[]
        >`SELECT "id" FROM "User" WHERE "id"=${userId} AND "isActive"=true FOR KEY SHARE`;
        if (!account.length) throw new ProjectNotFoundError();
        const rows = await tx.$queryRaw<
          { id: string }[]
        >`SELECT p."id" FROM "Project" p JOIN "ProjectMember" m ON m."projectId"=p."id" JOIN "User" u ON u."id"=m."userId" WHERE p."id"=${projectId} AND m."userId"=${userId} AND u."isActive"=true FOR UPDATE OF p`;
        if (!rows.length) throw new ProjectNotFoundError();
        const usage = await tx.projectFile.aggregate({
          where: { projectId },
          _sum: { size: true },
          _count: true,
        });
        if (
          usage._count >= PROJECT_FILE_COUNT ||
          (usage._sum.size ?? 0) + size > projectQuota
        )
          throw new FileError(
            "This project has reached its file limit. Delete a file before uploading more.",
            409,
          );
        return tx.projectFile.create({
          data: {
            projectId,
            uploaderId: userId,
            name,
            mediaType,
            size,
            storageKey,
            state: "PENDING",
          },
          select: { id: true },
        });
      });
      id = reserved.id;
      await store.write(storageKey, name, size, body, signal);
      return await db.$transaction(async (tx) => {
        const updated = await tx.projectFile.updateMany({
          where: {
            id,
            state: "PENDING",
            project: {
              memberships: { some: { userId, user: { isActive: true } } },
            },
          },
          data: { state: "READY" },
        });
        if (!updated.count) throw new ProjectNotFoundError();
        const { uploader, ...file } = await tx.projectFile.findUniqueOrThrow({
          where: { id },
          select: fields,
        });
        return { ...file, uploaderName: uploader?.name ?? "Former user" };
      });
    } catch (error) {
      if (id) {
        // Keep a reservation for maintenance if storage or the database is unavailable.
        try {
          const record = await db.projectFile.findUnique({
            where: { id },
            select: { state: true },
          });
          if (record?.state === "PENDING") {
            await store.remove(storageKey);
            await db.projectFile.deleteMany({
              where: { id, state: "PENDING" },
            });
          }
        } catch {}
      }
      throw error;
    } finally {
      transfers.activeFileUploads!--;
    }
  }
  return {
    uploadStream,
    upload(userId: string, projectId: string, name: string, data: Uint8Array) {
      return uploadStream(
        userId,
        projectId,
        name,
        data.length,
        new ReadableStream({
          start(controller) {
            controller.enqueue(data);
            controller.close();
          },
        }),
      );
    },
    async list(userId: string, projectId: string) {
      const project = await db.project.findFirst({
        where: { id: projectId, memberships: { some: { userId } } },
        select: {
          files: {
            where: { state: "READY" },
            select: fields,
            orderBy: [{ createdAt: "desc" }, { id: "asc" }],
          },
        },
      });
      if (!project) throw new ProjectNotFoundError();
      return project.files.map(({ uploader, ...file }) => ({
        ...file,
        uploaderName: uploader?.name ?? "Former user",
      }));
    },
    async download(userId: string, projectId: string, id: string) {
      const where = {
        id,
        projectId,
        state: "READY" as const,
        project: { memberships: { some: { userId } } },
      };
      const file = await db.projectFile.findFirst({
        where,
        select: { name: true, size: true, storageKey: true },
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
          where,
          select: { data: true },
        });
        if (!legacy?.data) throw new FileError("File not found.", 404);
        body = new Uint8Array(legacy.data);
      }
      return { name: file.name, size: file.size, body };
    },
    async remove(userId: string, projectId: string, id: string) {
      const record = await db.$transaction(async (tx) => {
        const changed = await tx.projectFile.updateMany({
          where: {
            id,
            projectId,
            state: { in: ["READY", "DELETING"] },
            project: { memberships: { some: { userId } } },
            OR: [
              { uploaderId: userId },
              { project: { memberships: { some: { userId, role: "OWNER" } } } },
            ],
          },
          data: { state: "DELETING" },
        });
        if (!changed.count)
          throw new FileError("File not found or you cannot delete it.", 404);
        return tx.projectFile.findUniqueOrThrow({
          where: { id },
          select: { storageKey: true },
        });
      });
      if (record.storageKey) await store.remove(record.storageKey);
      await db.projectFile.deleteMany({ where: { id, state: "DELETING" } });
    },
  };
}

export async function cleanFileStorage(
  db: PrismaClient,
  store: FileStore,
  apply = false,
  now = new Date(),
) {
  // Active uploads have a 30-minute deadline; recovery waits a full day.
  const cutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const stale = await db.projectFile.findMany({
    where: {
      state: { in: ["PENDING", "DELETING"] },
      createdAt: { lt: cutoff },
    },
    select: { id: true, storageKey: true },
  });
  let records = 0,
    orphans = 0;
  for (const file of stale) {
    if (apply) {
      if (file.storageKey) await store.remove(file.storageKey);
      await db.projectFile.deleteMany({
        where: { id: file.id, state: { in: ["PENDING", "DELETING"] } },
      });
    }
    records++;
  }
  for (const key of await store.olderKeys(cutoff)) {
    if (
      !(await db.projectFile.findUnique({
        where: { storageKey: key },
        select: { id: true },
      }))
    ) {
      if (apply) await store.remove(key);
      orphans++;
    }
  }
  return { records, orphans, applied: apply };
}
