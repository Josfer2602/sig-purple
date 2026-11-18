const { PrismaClient } = require('@prisma/client');

async function migrateUsers() {
  const localPrisma = new PrismaClient({
    datasources: { db: { url: "postgresql://postgres:admin123@localhost:5432/sig_purple_db?schema=public" } }
  });
  
  const remotePrisma = new PrismaClient({
    datasources: { db: { url: "postgresql://postgres:K78Ba0tsU3Ng43g4@db.yxvjrgefltlhectejqfu.supabase.co:5432/postgres" } }
  });

  try {
    const localUsers = await localPrisma.user.findMany();
    console.log(`Found ${localUsers.length} users in LOCAL database.`);

    for (const u of localUsers) {
      await remotePrisma.user.upsert({
        where: { id: u.id },
        update: {},
        create: {
          id: u.id,
          email: u.email,
          password: u.password,
          role: u.role,
          smtpHost: u.smtpHost,
          smtpPort: u.smtpPort,
          smtpUser: u.smtpUser,
          smtpPass: u.smtpPass,
          createdAt: u.createdAt
        }
      });
      console.log(`✅ Migrated user: ${u.email}`);
    }
    console.log("Migration complete!");
  } catch (err) {
    console.error("Error during migration:", err);
  } finally {
    await localPrisma.$disconnect();
    await remotePrisma.$disconnect();
  }
}

migrateUsers().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
