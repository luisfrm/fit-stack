import { z } from "zod";
import { Text } from "@workspace/ui/components/text";
import { Title } from "@workspace/ui/components/title";

import {
  createServerApi,
  forwardRequestHeaders,
} from "../lib/api/server";
import { cloudflareContext } from "../lib/cloudflare";
import type { Route } from "./+types/home";

/**
 * Transport spike (RD-171).
 *
 * The loader runs on the Worker and reaches the API through the `API` service
 * binding (or the documented dev HTTP transport). Both calls are real requests:
 * `/healthz` proves the hop, `/api/auth/get-session` proves the session cookie
 * survives it.
 */
const healthSchema = z.object({
  status: z.string(),
  timestamp: z.string(),
});

const sessionSchema = z
  .object({
    user: z.object({
      id: z.string(),
      email: z.string(),
      name: z.string().nullish(),
    }),
    session: z.object({
      id: z.string(),
    }),
  })
  .nullable();

export function meta() {
  return [
    { title: "Fit Stack · Portal del miembro" },
    { name: "description", content: "Portal del miembro del gimnasio." },
  ];
}

export async function loader({ context, request }: Route.LoaderArgs) {
  const api = createServerApi(context.get(cloudflareContext));
  const headers = forwardRequestHeaders(request);

  const health = healthSchema.parse(await api.json("/healthz", { headers }));
  const session = sessionSchema.parse(
    await api.json("/api/auth/get-session", { headers }),
  );

  return {
    api: { status: health.status, checkedAt: health.timestamp },
    member: session
      ? { email: session.user.email, name: session.user.name ?? session.user.email }
      : null,
  };
}

export default function Home({ loaderData }: Route.ComponentProps) {
  const { api, member } = loaderData;

  return (
    <main>
      <Title as="h1" size="section">
        Portal del miembro
      </Title>
      <Text variant="muted">
        API: {api.status} · {api.checkedAt}
      </Text>
      <Text>
        {member ? `Sesión: ${member.name} <${member.email}>` : "Sesión: sin autenticar"}
      </Text>
    </main>
  );
}
