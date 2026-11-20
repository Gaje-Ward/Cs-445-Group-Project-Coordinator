import { tasks } from "@/lib/tasks";
import { projectInput, projectReply, projectRequest } from "@/lib/project-http";
export const runtime = "nodejs";
type Context = { params: Promise<{ id: string; taskId: string }> };

export async function PATCH(request: Request, context: Context) {
  return projectRequest(async (userId) => {
    const { id, taskId } = await context.params;
    return projectReply({
      task: await tasks.edit(userId, id, taskId, await projectInput(request)),
    });
  });
}
export async function DELETE(request: Request, context: Context) {
  return projectRequest(async (userId) => {
    const { id, taskId } = await context.params;
    await tasks.remove(userId, id, taskId, await projectInput(request));
    return projectReply({ removed: true });
  });
}
