import "server-only";
import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { users } from "./users";
import { loginSchema } from "./validation";
import { allowLogin, allowAuthWork } from "./rate-limit";
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
        token.sub = user.id;
        token.name = user.name;
        token.email = user.email;
      }
      return token;
    },
    async session({ session, token }) {
      return {
        expires: session.expires,
        user: { id: token.sub ?? "", name: token.name, email: token.email },
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
