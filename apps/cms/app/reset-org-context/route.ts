import { authClient } from "@/lib/auth-client";
import { redirect } from "next/navigation";

/**
 * Endpoint to clear the active organization context and return to the dashboard.
 * Used when the current organization context is invalid or the organization has been deleted.
 */
export async function GET() {
  await authClient.organization.setActive({ organizationId: null });
  redirect("/dashboard");
}
