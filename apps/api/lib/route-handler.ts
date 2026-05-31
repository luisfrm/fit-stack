import { NextRequest, NextResponse } from "next/server";
import type { Session } from "@/config/auth";
import { getSession } from "@/config/get-session";
import { authorize } from "@/config/auth-utils";
import { PERMISSION_ACTIONS, PERMISSION_MODULES, type PermissionAction, type PermissionModule } from "@workspace/shared";

export interface AuthContext {
  session: Session;
  organizationId: string;
}

export interface RouteContext {
  params?: Promise<Record<string, string>>;
}

type AuthenticatedHandler<TParams = Record<string, string>> = (
  req: NextRequest,
  context: AuthContext & { params?: TParams }
) => Promise<Response>;

function handleError(error: unknown) {
  console.error("[Route Handler Error]", error);
  const message = error instanceof Error ? error.message : "Internal server error";
  return NextResponse.json({ error: message }, { status: 500 });
}

export function withAuth<TParams = Record<string, string>>(
  module: PermissionModule,
  action: PermissionAction
) {
  return function (handler: AuthenticatedHandler<TParams>) {
    return async (req: NextRequest, routeCtx?: RouteContext): Promise<Response> => {
      try {
        const session = await getSession();
        if (!session) {
          return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const sessionOrg = session.session as { activeOrganizationId?: string };
        const organizationId = sessionOrg?.activeOrganizationId;

        if (!organizationId) {
          return NextResponse.json({ error: "No active organization" }, { status: 401 });
        }

        const hasPermission = await authorize(session, organizationId, module, action);
        if (!hasPermission) {
          return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        const params = routeCtx?.params ? await routeCtx.params : undefined;

        return await handler(req, { session, organizationId, params: params as TParams });
      } catch (error) {
        return handleError(error);
      }
    };
  };
}

export function withSession<TParams = Record<string, string>>() {
  return function (handler: AuthenticatedHandler<TParams>) {
    return async (req: NextRequest, routeCtx?: RouteContext): Promise<Response> => {
      try {
        const session = await getSession();
        if (!session) {
          return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const sessionOrg = session.session as { activeOrganizationId?: string };
        const organizationId = sessionOrg?.activeOrganizationId;

        if (!organizationId) {
          return NextResponse.json({ error: "No active organization" }, { status: 401 });
        }

        const params = routeCtx?.params ? await routeCtx.params : undefined;

        return await handler(req, { session, organizationId, params: params as TParams });
      } catch (error) {
        return handleError(error);
      }
    };
  };
}

export function withPlatformAuth<TParams = Record<string, string>>() {
  return function (handler: AuthenticatedHandler<TParams>) {
    return async (req: NextRequest, routeCtx?: RouteContext): Promise<Response> => {
      try {
        const session = await getSession();
        if (!session) {
          return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const userRole = (session.user as { role?: string }).role;
        if (userRole !== "admin") {
          return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        const params = routeCtx?.params ? await routeCtx.params : undefined;

        return await handler(req, { session, organizationId: "", params: params as TParams });
      } catch (error) {
        return handleError(error);
      }
    };
  };
}