import "server-only";
import { getServerSession } from "next-auth";
import { ZodError } from "zod";
import { authOptions } from "./auth";
import { AdminAccessError, AdminUserChangeError } from "./admin-service";
import { RequestError } from "./project-http";
import { FileError } from "./file-validation";
import { admin } from "./admin";
const reply = (error: string, status: number) =>
  Response.json(
    { error },
    { status, headers: { "Cache-Control": "private, no-store" } },
  );
export async function adminRequest(
  action: (userId: string) => Promise<Response>,
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return reply("Please log in.", 401);
    if (!(await admin.allowed(session.user.id)))
      return reply("Administrator access is required.", 403);
    return await action(session.user.id);
  } catch (error) {
    if (error instanceof AdminAccessError) return reply(error.message, 403);
    if (error instanceof AdminUserChangeError || error instanceof RequestError)
      return reply(error.message, error.status);
    if (error instanceof FileError) return reply(error.message, error.status);
    if (error instanceof ZodError)
      return reply("Please check the submitted fields.", 400);
    return reply(
      "The admin dashboard is temporarily unavailable. Please try again.",
      503,
    );
  }
}
