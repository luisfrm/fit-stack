import { authClient } from "@/lib/auth-client";
import { redirect } from "next/navigation";
import { headers } from "next/headers";

/**
 * Endpoint to clear the active organization context and return to the dashboard.
 * Used when the current organization context is invalid or the organization has been deleted.
 */
export async function GET() {
  try {
    await authClient.organization.setActive({ 
      organizationId: null,
      fetchOptions: {
        headers: await headers()
      }
    });
  } catch (error) {
    console.error("Error resetting org context:", error);
  }
  redirect("/dashboard");
}
