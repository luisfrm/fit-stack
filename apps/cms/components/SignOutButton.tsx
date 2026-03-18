"use client";

import { sessionService } from "@/lib/session-service";
import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";

export default function SignOutButton() {
    const router = useRouter();

    const handleSignOut = async () => {
      await sessionService.signOut(() => {
          router.push("/");
          router.refresh();
      });
    };
    return (
      <button
        aria-label="Cerrar sesión"
        className="ml-auto text-slate-500 hover:text-slate-300 transition-colors"
        onClick={handleSignOut}
      >
        <LogOut className="w-4 h-4" />
      </button>
    );
}