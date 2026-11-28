import { admin } from "@/lib/admin";
import { adminRequest } from "@/lib/admin-http";
import { fileDownload } from "@/lib/file-http";
export const runtime = "nodejs";
export async function GET(
  _request: Request,
  context: { params: Promise<{ fileId: string }> },
) {
  return adminRequest(async (userId) =>
    fileDownload(await admin.download(userId, (await context.params).fileId)),
  );
}
