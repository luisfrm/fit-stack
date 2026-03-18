import { sessionService } from "@/lib/session-service";
import { redirect } from "next/navigation";

export default async function HomePage() {
  const { data: session } = await sessionService.getSession();

  if (!session) {
    return redirect('/login');
  }

  return redirect('/dashboard');
}
