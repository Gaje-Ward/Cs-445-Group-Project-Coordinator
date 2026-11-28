import "server-only";
import { getDb } from "./db";
import { createAdminService } from "./admin-service";
export const admin = {
  allowed: (userId: string) => createAdminService(getDb()).allowed(userId),
  overview: (userId: string, input: unknown) =>
    createAdminService(getDb()).overview(userId, input),
  users: (userId: string, input: unknown) =>
    createAdminService(getDb()).users(userId, input),
  projects: (userId: string, input: unknown) =>
    createAdminService(getDb()).projects(userId, input),
  files: (userId: string, input: unknown) =>
    createAdminService(getDb()).files(userId, input),
  history: (userId: string, input: unknown) =>
    createAdminService(getDb()).history(userId, input),
  download: (userId: string, id: string) =>
    createAdminService(getDb()).download(userId, id),
};
