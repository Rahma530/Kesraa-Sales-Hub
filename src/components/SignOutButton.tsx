"use client";

import { signOut } from "next-auth/react";

export default function SignOutButton() {
  return (
    <button onClick={() => signOut({ callbackUrl: "/login" })} className="text-xs px-3.5 py-1.5 bg-red-500 hover:bg-red-600 text-white rounded-lg transition-colors font-bold ml-2 mt-4">
      Sign Out
    </button>
  );
}
