Console RSC Migration — Bundle Baseline
========================================

Total .next/ size: 22,496,855 B (~21.5 MB)
  static/  (client):  3,027,526 B (~2.9 MB)
  server/  (server): 19,469,329 B (~18.6 MB)

Build output: spec/baseline-console-build.log
Build status: succeeded (with expected DYNAMIC_SERVER_USAGE warnings from headers() in auth)

Routes (all dynamic ƒ due to session validation in dashboard/layout.tsx):
  ƒ /
  ƒ /dashboard
  ƒ /dashboard/organizations
  ƒ /dashboard/organizations/[id]/settings
  ƒ /dashboard/organizations/[id]/subscriptions
  ƒ /dashboard/plans
  ƒ /dashboard/settings
  ƒ /dashboard/settings/currencies
  ƒ /dashboard/settings/payment-methods
  ƒ /dashboard/subscriptions

After migration target: static/ should DECREASE as client components shrink
and "use client" is removed from page-level files.
