import {
  pgTable,
  serial,
  text,
  timestamp,
  boolean,
  integer,
  jsonb,
  pgEnum,
} from 'drizzle-orm/pg-core';

// --- ENUMS ---
export const roleEnum = pgEnum('role', ['admin', 'manager', 'trainer', 'client']);
export const exerciseTypeEnum = pgEnum('exercise_type', ['compound', 'isolated']);
export const subscriptionStatusEnum = pgEnum('subscription_status', ['active', 'expired', 'cancelled']);

// --- CORE: USERS & MEMBERS ---

// User: Personas que pueden hacer LOGIN (Admins, Managers, Trainers, o Clientes usando la app)
export const user = pgTable('user', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  username: text('username').notNull().unique(), // Nuevo: Soporte para login por username
  emailVerified: boolean('email_verified').default(false).notNull(),
  image: text('image'),
  passwordHash: text('password_hash'),
  role: roleEnum('role').default('client').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Members: Los clientes reales del gimnasio a los que se les factura
export const members = pgTable('members', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => user.id), // Vínculo opcional si usan la app
  firstName: text('first_name').notNull(),
  lastName: text('last_name').notNull(),
  documentId: text('document_id'), // DNI/Cédula para validación presencial
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});


// --- GYM MANAGEMENT: MEMBRESÍAS ---

// Planes de Membresía (Ej: Basic, VIP, Platinum) - Usado tanto en CMS como en Facturación
export const membershipPlans = pgTable('membership_plans', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  price: integer('price').notNull(), // Guardado en centavos (ej: $45.00 -> 4500)
  features: jsonb('features'), // Array: ["Acceso 24/7", "Zonas VIP"]
  isPopular: boolean('is_popular').default(false).notNull(),
  isVisibleOnSite: boolean('is_visible_on_site').default(true).notNull(),
});

// Suscripciones: Relaciona a un Miembro con un Plan que pagó
export const subscriptions = pgTable('subscriptions', {
  id: serial('id').primaryKey(),
  memberId: integer('member_id').references(() => members.id).notNull(),
  planId: integer('plan_id').references(() => membershipPlans.id).notNull(),
  startDate: timestamp('start_date').notNull(),
  endDate: timestamp('end_date').notNull(),
  status: subscriptionStatusEnum('status').default('active').notNull(),
});


// --- FITNESS APP: TRAINERS, EJERCICIOS Y RUTINAS ---

// Perfiles de Entrenadores (Conectados a su cuenta de login)
export const trainerProfiles = pgTable('trainer_profiles', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => user.id).notNull().unique(), 
  specialities: text('specialities'), // Ej: "Hipertrofia, Powerlifting"
});

// Catálogo Base de Ejercicios
export const exercises = pgTable('exercises', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(), // Ej: "Press de Banca Plano"
  type: exerciseTypeEnum('type').notNull(), // 'compound' o 'isolated'
  primaryMuscle: text('primary_muscle').notNull(), // Ej: "Pectoral Mayor"
  secondaryMuscles: text('secondary_muscles').array(), // Matriz nativa PostgreSQL ["Tríceps", "Deltoides"]
  mediaUrl: text('media_url'), // URL de Cloudflare R2 (video MP4 o imagen)
  executionNotes: text('execution_notes'), // Notas técnicas para el movimiento
  metadata: jsonb('metadata'), // Extensible: {"equipment": "barbell", "difficulty": "intermediate"}
});

// Rutinas Definidas (Plantillas armadas por trainers o default del gym)
export const routineTemplates = pgTable('routine_templates', {
  id: serial('id').primaryKey(),
  trainerId: integer('trainer_id').references(() => trainerProfiles.id), // Null si es rutina general del sistema
  name: text('name').notNull(), // Ej: "Pecho y Tríceps Básico"
  description: text('description'),
});

// Los ejercicios específicos que componen una plantilla de rutina
export const routineTemplateItems = pgTable('routine_template_items', {
  id: serial('id').primaryKey(),
  routineTemplateId: integer('routine_template_id').references(() => routineTemplates.id).notNull(),
  exerciseId: integer('exercise_id').references(() => exercises.id).notNull(),
  sets: integer('sets').notNull(),
  reps: text('reps').notNull(), // Text para permitir "8-12" o "Al fallo"
  restSeconds: integer('rest_seconds'), // Segundos de descanso (ej: 90)
  orderIndex: integer('order_index').notNull(), // Asegura el orden secuencial de la rutina
});

// Sesiones de Entrenamiento (El check-in del usuario indicando que empezó a hacer ejercicio hoy)
export const workoutSessions = pgTable('workout_sessions', {
  id: serial('id').primaryKey(),
  memberId: integer('member_id').references(() => members.id).notNull(),
  routineTemplateId: integer('routine_template_id').references(() => routineTemplates.id), // Opcional (quizá entrenó libre)
  date: timestamp('date').defaultNow().notNull(),
  durationMinutes: integer('duration_minutes'), // Tiempo total de la sesión
  notes: text('notes'), // Sensaciones del usuario
});

// Logs de la Sesión: Lo que realmente levantó el cliente ese día
export const workoutSessionLogs = pgTable('workout_session_logs', {
  id: serial('id').primaryKey(),
  sessionId: integer('session_id').references(() => workoutSessions.id).notNull(),
  exerciseId: integer('exercise_id').references(() => exercises.id).notNull(),
  setsCompleted: integer('sets_completed').notNull(),
  weightUsed: jsonb('weight_used'), // Array: [100, 105, 105] (Kilos/Libras por cada set)
  repsCompleted: jsonb('reps_completed'), // Array: [10, 8, 7] (Reps hechas por cada set)
});


// --- CMS & MARKETING WEBSITE ---

// Coaches que se muestran como "Vitrina" en la web (Totalmente desacoplado de los Trainers de la App)
export const cmsCoaches = pgTable('cms_coaches', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  role: text('role').notNull(), // Ej: "Yoga Expert"
  specialities: jsonb('specialities'), // Ej: ["Vinyasa", "Meditation"]
  imageUrl: text('image_url'), // URL de Cloudflare R2
  isVisible: boolean('is_visible').default(true).notNull(),
  displayOrder: integer('display_order').default(0).notNull(), // Para controlar quién sale primero
});

// Horarios y Clases Grupales publicados en la web
export const cmsClasses = pgTable('cms_classes', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(), // Ej: "Power Tour"
  timeInfo: text('time_info').notNull(), // Ej: "10:00 AM"
  description: text('description'),
  trainerName: text('trainer_name'), // Simple texto, no es una FK, es solo para display
  isVisible: boolean('is_visible').default(true).notNull(),
});
