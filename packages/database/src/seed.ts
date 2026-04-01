import { db } from './client';
import { membershipPlans, permissions, roles, rolePermissions, members, verification } from './schema';
import { eq, inArray } from 'drizzle-orm';
import { DEFAULT_PERMISSIONS, DEFAULT_ROLES } from './constants/rbac-defaults';
import crypto from 'node:crypto';

async function seedPlans() {
  const plansData = [
    {
      name: 'Standard',
      price: 4500,
      features: ['Acceso a área de pesas', 'Vestidores y lockers', 'Clases grupales limitadas'],
      isPopular: false,
      isVisibleOnSite: true,
    },
    {
      name: 'Black Edition',
      price: 8900,
      features: ['Acceso 24/7 Nacional', 'Clases grupales ilimitadas', 'Acceso a Spa & Sauna', '2 Invitados gratis p/mes'],
      isPopular: true,
      isVisibleOnSite: true,
    },
    {
      name: 'Platinum',
      price: 11000,
      features: ['Sesión de Fisioterapia', 'Entrenador Personal', 'Zona VIP & Espejos'],
      isPopular: false,
      isVisibleOnSite: true,
    },
  ];

  console.log('📦 Sembrando planes de membresía...');
  for (const plan of plansData) {
    const existingPlan = await db.select().from(membershipPlans).where(eq(membershipPlans.name, plan.name));
    if (existingPlan.length === 0) {
      await db.insert(membershipPlans).values(plan);
      console.log(`✅ Plan creado: ${plan.name}`);
    }
  }
}

async function seedRBAC() {
  console.log('🔑 Sembrando permisos...');
  for (const p of DEFAULT_PERMISSIONS) {
    await db.insert(permissions).values(p).onConflictDoNothing();
  }

  console.log('🛡️  Sembrando roles...');
  for (const r of DEFAULT_ROLES) {
    let roleRecord = (await db.select().from(roles).where(eq(roles.name, r.name)))[0];
    if (!roleRecord) {
      const inserted = await db.insert(roles).values({ name: r.name, description: r.description }).returning();
      roleRecord = inserted[0];
    }

    if (!roleRecord) throw new Error(`CRITICAL: Falló la creación del rol ${r.name}`);

    const permsInDb = await db.select().from(permissions).where(inArray(permissions.slug, r.permissions));
    await db.delete(rolePermissions).where(eq(rolePermissions.roleId, roleRecord.id));
    for (const p of permsInDb) {
      await db.insert(rolePermissions).values({
        roleId: roleRecord.id,
        permissionId: p.id
      });
    }
    console.log(`⛓️  Permisos sincronizados para el rol: ${roleRecord.name}`);
  }
}

async function seedInitialAdmin() {
  const initialAdminEmail = process.env.INITIAL_ADMIN_EMAIL;
  if (!initialAdminEmail) {
    console.log('\n⚠️  No se detectó INITIAL_ADMIN_EMAIL. Saltando bootstrap.');
    return;
  }

  console.log(`🚀 Configurando Bootstrap para administrador inicial: ${initialAdminEmail}`);
  const adminRole = (await db.select().from(roles).where(eq(roles.name, 'admin')))[0];
  if (!adminRole) throw new Error('Rol "admin" no encontrado.');

  const existingMember = (await db.select().from(members).where(eq(members.email, initialAdminEmail)))[0];
  if (!existingMember) {
    await db.insert(members).values({
      email: initialAdminEmail,
      firstName: 'System',
      lastName: 'Admin',
      role: 'admin',
      roleId: adminRole.id,
      isActive: true
    });
    console.log(`✅ Registro de Miembro creado para ${initialAdminEmail}`);
  }

  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + 48);

  await db.delete(verification).where(eq(verification.identifier, initialAdminEmail));
  await db.insert(verification).values({
    id: crypto.randomUUID(),
    identifier: initialAdminEmail,
    value: token,
    expiresAt,
  });

  const cmsUrl = process.env.FRONTEND_URL || 'http://localhost:3001';
  console.log('\n' + '⭐'.repeat(30));
  console.log('🛠️  ENLACE DE BOOTSTRAP GENERADO');
  console.log(`Utiliza este enlace para configurar tu cuenta administradora:`);
  console.log(`${cmsUrl}/register?token=${token}`);
  console.log('⭐'.repeat(30) + '\n');
}

async function main() {
  console.log('--- 🏁 Iniciando Seeding de la Base de Datos ---');
  await seedPlans();
  await seedRBAC();
  await seedInitialAdmin();
  console.log('--- 🏁 Seeding completado con éxito ---');
  process.exit(0);
}

main().catch((err) => {
  console.error('❌ Error durante el seed:', err);
  process.exit(1);
});
