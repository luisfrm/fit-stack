"use client";

import { sessionService } from "@workspace/auth/service";
import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@workspace/ui/components/button";
import type { ComponentProps } from "react";

interface SignOutButtonProps {
  readonly redirectTo?: string;
  readonly variant?: ComponentProps<typeof Button>["variant"];
  readonly size?: ComponentProps<typeof Button>["size"];
  readonly fullWidth?: boolean;
  readonly className?: string;
  readonly showLabel?: boolean;
}

export default function SignOutButton({
  redirectTo = "/",
  variant = "ghost",
  size = "xs",
  fullWidth = false,
  className = "ml-auto text-slate-500 hover:text-slate-300 transition-colors border-none bg-transparent hover:bg-transparent px-1",
  showLabel = false,
}: SignOutButtonProps) {
  const router = useRouter();

  const handleSignOut = async () => {
    await sessionService.signOut(() => {
      router.push(redirectTo);
      router.refresh();
    });
  };
  return (
    <Button
      aria-label="Cerrar sesión"
      variant={variant}
      size={size}
      fullWidth={fullWidth}
      className={className}
      leftIcon={showLabel ? <LogOut className="w-4 h-4" /> : undefined}
      onClick={handleSignOut}
    >
      {showLabel ? "Cerrar Sesión" : <LogOut className="w-4 h-4" />}
    </Button>
  );
}
