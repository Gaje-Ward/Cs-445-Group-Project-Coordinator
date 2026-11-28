import { ideas } from "@/lib/ideas";
import { projectRequest, projectReply, projectInput } from "@/lib/project-http";
export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) {
  return projectRequest(async (userId) =>
    projectReply(
      await ideas.list(
        userId,
        (await context.params).id,
        new URL(request.url).searchParams.get("page") ?? 1,
      ),
    ),
  );
}
export async function POST(request: Request, context: Context) {
  return projectRequest(async (userId) =>
    projectReply(
      {
        idea: await ideas.create(
          userId,
          (await context.params).id,
          await projectInput(request),
        ),
      },
      201,
    ),
  );
}
