import { comments } from "@/lib/comments";
import { projectRequest, projectReply, projectInput } from "@/lib/project-http";
export const runtime = "nodejs";
type Context = { params: Promise<{ id: string; commentId: string }> };
export async function PATCH(request: Request, context: Context) {
  return projectRequest(async (userId) => {
    const { id, commentId } = await context.params;
    return projectReply({
      comment: await comments.edit(
        userId,
        id,
        commentId,
        await projectInput(request),
      ),
    });
  });
}
export async function DELETE(request: Request, context: Context) {
  return projectRequest(async (userId) => {
    const { id, commentId } = await context.params;
    await comments.remove(userId, id, commentId, await projectInput(request));
    return projectReply({ message: "Comment deleted." });
  });
}
