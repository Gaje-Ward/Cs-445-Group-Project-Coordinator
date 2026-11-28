import "server-only";
import { getDb } from "./db";
import { createIdeaService } from "./idea-service";
export const ideas = {
  list: (userId: string, projectId: string, page: unknown = 1) =>
    createIdeaService(getDb()).list(userId, projectId, page),
  create: (userId: string, projectId: string, input: unknown) =>
    createIdeaService(getDb()).create(userId, projectId, input),
  vote: (userId: string, projectId: string, id: string, input: unknown) =>
    createIdeaService(getDb()).vote(userId, projectId, id, input),
  remove: (userId: string, projectId: string, id: string, input: unknown) =>
    createIdeaService(getDb()).remove(userId, projectId, id, input),
};
