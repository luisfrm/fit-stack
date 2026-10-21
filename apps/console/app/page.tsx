import { sessionService } from "@workspace/auth/service";
import { redirect } from "next/navigation";

export default async function HomePage() {
  const { data: session } = await sessionService.getSession();

  if (!session) {
    return redirect('/login');
  }

  return redirect('/dashboard');
}