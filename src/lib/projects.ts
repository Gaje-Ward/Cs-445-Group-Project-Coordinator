import "server-only";
import { getDb } from "./db";
import { createProjectService } from "./project-service";

export const projects = {
  create: (userId: string, input: unknown) =>
    createProjectService(getDb()).create(userId, input),
  list: (userId: string, today?: string) =>
    createProjectService(getDb()).list(userId, today),
  get: (userId: string, id: string) =>
    createProjectService(getDb()).get(userId, id),
  edit: (userId: string, id: string, input: unknown) =>
    createProjectService(getDb()).edit(userId, id, input),
};
