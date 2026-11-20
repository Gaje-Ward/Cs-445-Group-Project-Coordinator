import "server-only";
import { getDb } from "./db";
import { createMemberService } from "./member-service";

export const members = {
  list: (userId: string, projectId: string) =>
    createMemberService(getDb()).list(userId, projectId),
  add: (userId: string, projectId: string, input: unknown) =>
    createMemberService(getDb()).add(userId, projectId, input),
  remove: (userId: string, projectId: string, input: unknown) =>
    createMemberService(getDb()).remove(userId, projectId, input),
};
