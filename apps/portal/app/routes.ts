import { type RouteConfig, index } from "@react-router/dev/routes";

/**
 * Config-based routes. The portal is a member-facing app; product screens land
 * here in P3.
 */
export default [index("routes/home.tsx")] satisfies RouteConfig;
