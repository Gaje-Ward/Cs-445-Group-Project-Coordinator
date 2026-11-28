import "server-only";
import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { users } from "./users";
import { loginSchema } from "./validation";
import { allowLogin, allowAuthWork } from "./rate-limit";
import { getDb } from "./db";
import { loadSessionUser } from "./session-user";
export const authOptions: NextAuthOptions = {
  secret: process.env.NEXTAUTH_SECRET,
  session: { strategy: "jwt", maxAge: 8 * 60 * 60 },
  pages: { signIn: "/login", error: "/login" },
  providers: [
    CredentialsProvider({
      name: "Email and password",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const parsed = loginSchema.safeParse(credentials);
        if (
          !parsed.success ||
          !allowAuthWork("login") ||
          !allowLogin(parsed.data.email)
        )
          return null;
        try {
          return await users.authenticate(parsed.data);
        } catch {
          throw new Error(
            "Login is temporarily unavailable. Please try again.",
          );
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      // Only values from a verified database user are accepted; ignore session update input.
      if (user) {
        const account = await getDb().user.findUnique({
          where: { id: user.id },
          select: { isActive: true, sessionVersion: true },
        });
        if (
          !account?.isActive ||
          typeof user.sessionVersion !== "number" ||
          account.sessionVersion !== user.sessionVersion
        )
          throw new Error("Account is unavailable.");
        token.sessionVersion = user.sessionVersion;
        token.sub = user.id;
        token.name = user.name;
        token.email = user.email;
      }
      return token;
    },
    async session({ session, token }) {
      const user = await loadSessionUser(
        getDb(),
        token.sub ?? "",
        token.sessionVersion,
      );
      return {
        expires: session.expires,
        user: user ?? { id: "", name: null, email: null },
      };
    },
  },
  logger: {
    error(code) {
      console.error("Authentication error:", code);
    },
    warn(code) {
      console.warn("Authentication warning:", code);
    },
    debug() {},
  },
};
