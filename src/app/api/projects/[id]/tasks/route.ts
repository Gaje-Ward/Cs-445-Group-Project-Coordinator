import { tasks } from "@/lib/tasks";
import { projectInput, projectReply, projectRequest } from "@/lib/project-http";
export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context) {
  return projectRequest(async (userId) =>
    projectReply({
      tasks: await tasks.list(userId, (await context.params).id),
    }),
  );
}
export async function POST(request: Request, context: Context) {
  return projectRequest(async (userId) =>
    projectReply(
      {
        task: await tasks.create(
          userId,
          (await context.params).id,
          await projectInput(request),
        ),
      },
      201,
    ),
  );
}
