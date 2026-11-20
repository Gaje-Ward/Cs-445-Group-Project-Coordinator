import { members } from "@/lib/members";
import { projectInput, projectReply, projectRequest } from "@/lib/project-http";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context) {
  return projectRequest(async (userId) =>
    projectReply({
      members: await members.list(userId, (await context.params).id),
    }),
  );
}

export async function POST(request: Request, context: Context) {
  return projectRequest(async (userId) =>
    projectReply(
      {
        member: await members.add(
          userId,
          (await context.params).id,
          await projectInput(request),
        ),
      },
      201,
    ),
  );
}

export async function DELETE(request: Request, context: Context) {
  return projectRequest(async (userId) => {
    await members.remove(
      userId,
      (await context.params).id,
      await projectInput(request),
    );
    return projectReply({ removed: true });
  });
}
