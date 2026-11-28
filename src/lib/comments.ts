import "server-only";
import { getDb } from "./db";
import { createCommentService } from "./comment-service";
export const comments = {
  list: (userId: string, projectId: string, page: unknown = 1) =>
    createCommentService(getDb()).list(userId, projectId, page),
  create: (userId: string, projectId: string, input: unknown) =>
    createCommentService(getDb()).create(userId, projectId, input),
  edit: (userId: string, projectId: string, id: string, input: unknown) =>
    createCommentService(getDb()).edit(userId, projectId, id, input),
  remove: (userId: string, projectId: string, id: string, input: unknown) =>
    createCommentService(getDb()).remove(userId, projectId, id, input),
};
