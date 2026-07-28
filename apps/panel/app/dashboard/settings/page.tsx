"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useWindowSize } from "@workspace/ui/hooks/use-window-size";
import { SettingsMobileMenu } from "./settings-nav";

export default function SettingsRootPage() {
  const router = useRouter();
  const { width } = useWindowSize();
  const isDesktop = width !== undefined && width >= 1024;

  useEffect(() => {
    if (width !== undefined && isDesktop) {
      router.replace("/dashboard/settings/general");
    }
  }, [isDesktop, router, width]);

  if (width === undefined || isDesktop) return null;

  return <SettingsMobileMenu />;
}
