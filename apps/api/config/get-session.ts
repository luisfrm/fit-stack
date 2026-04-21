import { auth, type Session } from "@/config/auth";
import { headers } from "next/headers";

export async function getSession(): Promise<Session | null> {
  return await auth.api.getSession({
    headers: await headers(),
  });
}