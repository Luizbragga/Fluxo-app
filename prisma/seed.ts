import { PrismaClient, Role } from '@prisma/client';
const prisma = new PrismaClient();

/** util: cria se não existir */
async function ensureTenant(slug: string, name: string) {
  const existing = await prisma.tenant.findFirst({ where: { slug } });
  if (existing) return existing;
  return prisma.tenant.create({
    data: { slug, name },
  });
}

/** util: upsert por (tenantId, email) que é único no seu schema */
async function ensureUser(params: {
  tenantId: string;
  email: string;
  name: string;
  role: Role;
  passwordHash: string;
  phone?: string | null;
  active?: boolean;
}) {
  const {
    tenantId,
    email,
    name,
    role,
    passwordHash,
    phone = null,
    active = true,
  } = params;
  return prisma.user.upsert({
    where: { tenantId_email: { tenantId, email } },
    update: {
      name,
      role,
      phone,
      passwordHash,
      active,
    },
    create: {
      tenantId,
      email,
      name,
      role,
      phone,
      passwordHash,
      active,
    },
  });
}

/** util: pega ou cria um provider (1:1 com user) */
async function ensureProvider(params: {
  tenantId: string;
  userId: string;
  name: string;
  weekdayTemplate?: any;
  specialty?: any;
}) {
  const {
    tenantId,
    userId,
    name,
    weekdayTemplate = {},
    specialty = 'barber',
  } = params;
  // provider é 1:1 com userId (unique), então ou existe ou criamos
  const exists = await prisma.provider.findFirst({
    where: { tenantId, userId },
  });
  if (exists) return exists;

  return prisma.provider.create({
    data: {
      tenantId,
      userId,
      name,
      specialty,
      weekdayTemplate,
      active: true,
    },
  });
}

/** util: cria service se não existir por (tenantId, name) — não é unique no schema, então fazemos find+create */
async function ensureService(params: {
  tenantId: string;
  name: string;
  durationMin: number;
  priceCents: number;
  active?: boolean;
}) {
  const { tenantId, name, durationMin, priceCents, active = true } = params;
  const existing = await prisma.service.findFirst({
    where: { tenantId, name },
  });
  if (existing) {
    // mantém valores principais atualizados
    return prisma.service.update({
      where: { id: existing.id },
      data: { durationMin, priceCents, active },
    });
  }
  return prisma.service.create({
    data: { tenantId, name, durationMin, priceCents, active },
  });
}

async function main() {
  // 1) Tenant
  const tenant = await ensureTenant('demo-barber', 'Demo Barber');

  // 2) Usuários
  // hash "demo123" (exemplo) — troque se quiser
  const passwordHash =
    '$2b$10$wC7Gv3mW4W2m3q9oTgHqYOGb3gkqv0Zl6aI2P6l0oW9a4q7s1O9y.';

  const owner = await ensureUser({
    tenantId: tenant.id,
    email: 'owner@demo.com',
    name: 'Owner Demo',
    role: 'owner',
    passwordHash,
    active: true,
  });

  const providerUser = await ensureUser({
    tenantId: tenant.id,
    email: 'provider@demo.com',
    name: 'Rafa Barber (User)',
    role: 'provider',
    passwordHash,
    active: true,
  });

  // 3) Provider (vincula ao providerUser)
  const provider = await ensureProvider({
    tenantId: tenant.id,
    userId: providerUser.id,
    name: 'Rafa Barber',
    specialty: 'barber',
    weekdayTemplate: {
      mon: [
        ['09:00', '12:00'],
        ['14:00', '18:00'],
      ],
      tue: [
        ['09:00', '12:00'],
        ['14:00', '18:00'],
      ],
      wed: [],
      thu: [
        ['09:00', '12:00'],
        ['14:00', '18:00'],
      ],
      fri: [
        ['09:00', '12:00'],
        ['14:00', '18:00'],
      ],
      sat: [['09:00', '12:00']],
      sun: [],
    },
  });

  // 4) Services
  const corte = await ensureService({
    tenantId: tenant.id,
    name: 'Corte',
    durationMin: 30,
    priceCents: 1500,
  });

  const barba = await ensureService({
    tenantId: tenant.id,
    name: 'Barba',
    durationMin: 30,
    priceCents: 1200,
  });

  // 5) Um agendamento hoje (opcional)
  const now = new Date();
  const start = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
      11,
      15,
      0,
    ),
  );
  const end = new Date(start.getTime() + corte.durationMin * 60_000);

  await prisma.appointment.create({
    data: {
      tenantId: tenant.id,
      providerId: provider.id,
      serviceId: corte.id,
      startAt: start,
      endAt: end,
      clientName: 'Cliente Demo',
      clientPhone: '+351910000000',
      status: 'scheduled',
      serviceName: corte.name,
      serviceDurationMin: corte.durationMin,
      servicePriceCents: corte.priceCents,
    },
  });

  console.log('Seed OK:', {
    tenant: { id: tenant.id, slug: tenant.slug },
    owner: { id: owner.id, email: owner.email },
    providerUser: { id: providerUser.id, email: providerUser.email },
    provider: { id: provider.id, name: provider.name },
    services: [corte.name, barba.name],
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => prisma.$disconnect());
