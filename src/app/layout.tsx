import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
export const metadata: Metadata = {
  title: "Group Project Coordinator",
  description: "A workspace for student group projects.",
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <header className="border-b border-slate-200 bg-white">
          <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4 px-6 py-5">
            <Link href="/" className="text-lg font-bold">
              Group Project Coordinator
            </Link>
            <nav
              aria-label="Main navigation"
              className="flex gap-5 text-sm font-semibold"
            >
              <Link href="/">Home</Link>
              <Link href="/login">Login</Link>
              <Link href="/register">Register</Link>
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-5xl px-6 py-12">{children}</main>
        <footer className="mx-auto max-w-5xl px-6 py-8 text-sm text-slate-500">
          CS445 · Built by Gaje Ward
        </footer>
      </body>
    </html>
  );
}
