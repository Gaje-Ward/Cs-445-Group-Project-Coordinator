import { projects } from "@/lib/projects";
import { projectInput, projectReply, projectRequest } from "@/lib/project-http";
export const runtime = "nodejs";
export async function GET() {
  return projectRequest(async (userId) =>
    projectReply({ projects: await projects.list(userId) }),
  );
}
export async function POST(request: Request) {
  return projectRequest(async (userId) =>
    projectReply(
      { project: await projects.create(userId, await projectInput(request)) },
      201,
    ),
  );
}
