import "server-only";
import { getDb } from "./db";
import { createFileService } from "./file-service";
export const files = {
  list: (userId: string, projectId: string) =>
    createFileService(getDb()).list(userId, projectId),
  upload: (
    userId: string,
    projectId: string,
    name: string,
    size: number,
    body: ReadableStream<Uint8Array>,
    signal?: AbortSignal,
  ) =>
    createFileService(getDb()).uploadStream(
      userId,
      projectId,
      name,
      size,
      body,
      signal,
    ),
  download: (userId: string, projectId: string, id: string) =>
    createFileService(getDb()).download(userId, projectId, id),
  remove: (userId: string, projectId: string, id: string) =>
    createFileService(getDb()).remove(userId, projectId, id),
};
