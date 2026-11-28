import { files } from "@/lib/files";
import { projectRequest, projectReply } from "@/lib/project-http";
import { fileInput } from "@/lib/file-http";
import { projects } from "@/lib/projects";
export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };
export async function GET(_request: Request, context: Context) {
  return projectRequest(async (userId) =>
    projectReply({
      files: await files.list(userId, (await context.params).id),
    }),
  );
}
export async function POST(request: Request, context: Context) {
  return projectRequest(async (userId) => {
    const { id } = await context.params;
    await projects.get(userId, id);
    const { name, size, body } = fileInput(request);
    return projectReply(
      {
        file: await files.upload(userId, id, name, size, body, request.signal),
      },
      201,
    );
  });
}
