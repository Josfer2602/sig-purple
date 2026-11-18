const sqlite3 = require('sqlite3').verbose();
const { PrismaClient } = require('@prisma/client');
const path = require('path');

const prisma = new PrismaClient();
const dbPath = path.join(__dirname, '../prisma/dev.db');

const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY, (err) => {
  if (err) {
    console.error('Error opening db', err.message);
    process.exit(1);
  }
});

db.all('SELECT * FROM User', async (err, rows) => {
  if (err) {
    console.error('Error querying users', err.message);
    process.exit(1);
  }
  
  console.log(`Found ${rows.length} users in SQLite.`);
  
  for (const row of rows) {
    try {
      await prisma.user.upsert({
        where: { id: row.id },
        update: {},
        create: {
          id: row.id,
          email: row.email,
          password: row.password,
          role: row.role,
          smtpHost: row.smtpHost,
          smtpPort: row.smtpPort,
          smtpUser: row.smtpUser,
          smtpPass: row.smtpPass,
          createdAt: new Date(row.createdAt)
        }
      });
      console.log(`✅ Migrated user ${row.email}`);
    } catch (e) {
      console.error(`❌ Error migrating user ${row.email}:`, e.message);
    }
  }
  
  console.log("Migration complete!");
  process.exit(0);
});
