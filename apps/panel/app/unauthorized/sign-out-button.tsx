"use client";

import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { sessionService } from "@/lib/services/session-service";
import { Button } from "@workspace/ui/components";

export default function SignOutButton() {
  const router = useRouter();

  const handleSignOut = async () => {
    await sessionService.signOut(() => {
      router.push("/login");
      router.refresh();
    });
  };

  return (
    <Button
      variant="white"
      fullWidth
      onClick={handleSignOut}
      leftIcon={<LogOut className="w-4 h-4" />}
    >
      Cerrar Sesión
    </Button>
  );
}
