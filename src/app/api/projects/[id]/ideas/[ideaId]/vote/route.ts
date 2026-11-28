import { ideas } from "@/lib/ideas";
import { projectRequest, projectReply, projectInput } from "@/lib/project-http";
export const runtime = "nodejs";
export async function PUT(
  request: Request,
  context: { params: Promise<{ id: string; ideaId: string }> },
) {
  return projectRequest(async (userId) => {
    const { id, ideaId } = await context.params;
    return projectReply(
      await ideas.vote(userId, id, ideaId, await projectInput(request)),
    );
  });
}
