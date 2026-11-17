import { projects } from "@/lib/projects";
import { projectInput, projectReply, projectRequest } from "@/lib/project-http";
export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };
export async function GET(_request: Request, context: Context) {
  return projectRequest(async (userId) =>
    projectReply({
      project: await projects.get(userId, (await context.params).id),
    }),
  );
}
export async function PATCH(request: Request, context: Context) {
  return projectRequest(async (userId) =>
    projectReply({
      project: await projects.edit(
        userId,
        (await context.params).id,
        await projectInput(request),
      ),
    }),
  );
}
