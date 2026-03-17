import { db } from './client';
import { membershipPlans } from './schema';
import { eq } from 'drizzle-orm';

async function main() {
  console.log('--- 🏁 Iniciando Seeding de la Base de Datos ---');

  // 1. Crear Planes de Membresía Básicos
  const plans = [
    {
      name: 'Standard',
      price: 4500, // $45.00
      features: ['Acceso a área de pesas', 'Vestidores y lockers', 'Clases grupales limitadas'],
      isPopular: false,
      isVisibleOnSite: true,
    },
    {
      name: 'Black Edition',
      price: 8900, // $89.00
      features: ['Acceso 24/7 Nacional', 'Clases grupales ilimitadas', 'Acceso a Spa & Sauna', '2 Invitados gratis p/mes'],
      isPopular: true,
      isVisibleOnSite: true,
    },
    {
      name: 'Platinum',
      price: 11000, // $110.00
      features: ['Sesión de Fisioterapia', 'Entrenador Personal', 'Zona VIP & Espejos'],
      isPopular: false,
      isVisibleOnSite: true,
    },
  ];

  console.log('Sembrando planes de membresía...');
  for (const plan of plans) {
    const existingPlan = await db.select().from(membershipPlans).where(eq(membershipPlans.name, plan.name));
    if (existingPlan.length === 0) {
      await db.insert(membershipPlans).values(plan);
      console.log(`✅ Plan creado: ${plan.name}`);
    }
  }

  console.log('--- 🏁 Seeding completado con éxito ---');
  process.exit(0);
}

main().catch((err) => {
  console.error('❌ Error durante el seed:', err);
  process.exit(1);
});
