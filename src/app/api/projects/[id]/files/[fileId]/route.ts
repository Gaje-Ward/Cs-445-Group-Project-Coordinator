import { z } from "zod";
import { files } from "@/lib/files";
import { projectRequest, projectReply, projectInput } from "@/lib/project-http";
import { fileDownload } from "@/lib/file-http";
export const runtime = "nodejs";
type Context = { params: Promise<{ id: string; fileId: string }> };
export async function GET(_request: Request, context: Context) {
  return projectRequest(async (userId) => {
    const { id, fileId } = await context.params;
    return fileDownload(await files.download(userId, id, fileId));
  });
}
export async function DELETE(request: Request, context: Context) {
  return projectRequest(async (userId) => {
    z.object({})
      .strict()
      .parse(await projectInput(request));
    const { id, fileId } = await context.params;
    await files.remove(userId, id, fileId);
    return projectReply({ message: "File deleted." });
  });
}
