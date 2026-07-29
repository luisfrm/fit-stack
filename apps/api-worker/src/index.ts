import { Hono } from 'hono';
import { createAuth } from './lib/auth';
import { createDb } from '@workspace/database/factory';
import { corsMiddleware } from './lib/cors';
import { onError } from './lib/errors';
import type { AppEnv } from './lib/env';

// Sub-routers
import { memberRoutes } from './routes/members.route';
import { planRoutes } from './routes/plans.route';
import { subscriptionRoutes } from './routes/subscriptions.route';
import { paymentRoutes } from './routes/payments.route';
import { classRoutes } from './routes/classes.route';
import { trainerRoutes } from './routes/trainers.route';
import { cmsRoutes } from './routes/cms.route';
import { dashboardRoutes } from './routes/dashboard.route';
import { settingsRoutes } from './routes/settings.route';
import { reportRoutes } from './routes/reports.route';
import { organizationRoutes } from './routes/organizations.route';
import { uploadRoutes } from './routes/upload.route';
import { initRoutes } from './routes/init.route';
import { publicRoutes } from './routes/public.route';

// Platform Sub-routers
import { platformPlanRoutes } from './routes/platform-plans.route';
import { platformSubscriptionRoutes } from './routes/platform-subscriptions.route';
import { platformOrganizationRoutes } from './routes/platform-organizations.route';
import { platformSettingsRoutes } from './routes/platform-settings.route';

const app = new Hono<AppEnv>();

// Public Healthcheck and Static Endpoints (no auth or DB required)
app.get('/healthz', (c) => c.json({ status: 'ok', timestamp: new Date().toISOString() }));
app.get('/favicon.ico', (c) => c.text('', 204));

// Apply CORS middleware for all /api routes
app.use('/api/*', corsMiddleware);

// Per-request Context Setup (Auth, Db, Session)
app.use('*', async (c, next) => {
  // Defensive check for missing DATABASE_URL
  if (!c.env.DATABASE_URL) {
    return c.json({ error: 'Database connection string is missing or not configured' }, 500);
  }

  const auth = createAuth(c.env);
  const db = createDb(c.env.DATABASE_URL);
  c.set('auth', auth);
  c.set('db', db);

  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (session) {
    c.set('session', session.session);
    c.set('user', session.user);
  }

  await next();
});

// Global Error Handler
app.onError(onError);

// Better Auth Engine Handler
app.on(['POST', 'GET'], '/api/auth/*', (c) => c.get('auth').handler(c.req.raw));

// Mount Application Routes
app.route('/api/members', memberRoutes);
app.route('/api/plans', planRoutes);
app.route('/api/subscriptions', subscriptionRoutes);
app.route('/api/payments', paymentRoutes);
app.route('/api/classes', classRoutes);
app.route('/api/trainers', trainerRoutes);
app.route('/api/cms', cmsRoutes);
app.route('/api/dashboard', dashboardRoutes);
app.route('/api/settings', settingsRoutes);
app.route('/api/reports', reportRoutes);
app.route('/api/organizations', organizationRoutes);
app.route('/api/upload', uploadRoutes);
app.route('/api/init', initRoutes);
app.route('/api/public', publicRoutes);

// Mount SaaS Platform Routes (Admin)
app.route('/api/platform/plans', platformPlanRoutes);
app.route('/api/platform/subscriptions', platformSubscriptionRoutes);
app.route('/api/platform/organizations', platformOrganizationRoutes);
app.route('/api/platform/settings', platformSettingsRoutes);

export default app;
