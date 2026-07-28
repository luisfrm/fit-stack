"use client";

import { ChevronLeft } from "lucide-react";
import { Button } from "@workspace/ui/components";
import { useRouter } from "next/navigation";

export function BackButton() {
  const router = useRouter();
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => router.push("/dashboard/subscriptions")}
      className="gap-2 text-foreground/60 hover:text-foreground font-bold uppercase tracking-wider"
    >
      <ChevronLeft className="size-4" />
      Suscripciones SaaS
    </Button>
  );
}
