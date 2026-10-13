"use client";
import { signOut } from "next-auth/react";
import { useState } from "react";
export function LogoutButton() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  return (
    <div>
      <button
        disabled={pending}
        className="rounded-lg border border-slate-300 bg-white px-4 py-2 font-semibold"
        onClick={async () => {
          setPending(true);
          setError("");
          try {
            await signOut({ callbackUrl: "/" });
          } catch {
            setError("Could not log out. Please try again.");
            setPending(false);
          }
        }}
      >
        {pending ? "Logging out…" : "Log out"}
      </button>
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
