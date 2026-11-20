import "server-only";
import { getDb } from "./db";
import { createTaskService } from "./task-service";

export const tasks = {
  list: (userId: string, projectId: string) =>
    createTaskService(getDb()).list(userId, projectId),
  create: (userId: string, projectId: string, input: unknown) =>
    createTaskService(getDb()).create(userId, projectId, input),
  edit: (userId: string, projectId: string, id: string, input: unknown) =>
    createTaskService(getDb()).edit(userId, projectId, id, input),
  remove: (userId: string, projectId: string, id: string, input: unknown) =>
    createTaskService(getDb()).remove(userId, projectId, id, input),
};
