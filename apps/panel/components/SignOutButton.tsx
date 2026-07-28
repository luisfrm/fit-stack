"use client";

import { sessionService } from "@/lib/services/session-service";
import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@workspace/ui/components/button";

export default function SignOutButton() {
  const router = useRouter();

  const handleSignOut = async () => {
    await sessionService.signOut(() => {
      router.push("/");
      router.refresh();
    });
  };
  return (
    <Button
      aria-label="Cerrar sesión"
      variant="ghost"
      size="xs"
      className="ml-auto text-slate-500 hover:text-slate-300 transition-colors border-none bg-transparent hover:bg-transparent px-1"
      onClick={handleSignOut}
    >
      <LogOut className="w-4 h-4" />
    </Button>
  );
}