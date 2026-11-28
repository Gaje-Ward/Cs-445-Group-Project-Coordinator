import { admin } from "@/lib/admin";
import { adminRequest } from "@/lib/admin-http";
import { projectInput } from "@/lib/project-http";
export const runtime = "nodejs";
export async function POST(
  request: Request,
  context: { params: Promise<{ userId: string }> },
) {
  return adminRequest(async (actorId) => {
    await admin.resetPassword(
      actorId,
      (await context.params).userId,
      await projectInput(request),
    );
    return Response.json(
      { message: "Password reset. Existing sessions have ended." },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  });
}
