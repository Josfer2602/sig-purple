const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  const email = 'admin@purplebtl.com';
  const password = await bcrypt.hash('admin123', 10);
  
  const existing = await prisma.user.findUnique({ where: { email } });
  
  if (!existing) {
    await prisma.user.create({
      data: {
        email,
        password,
        role: 'Admin',
      }
    });
    console.log('Usuario admin creado exitosamente: admin@purplebtl.com / admin123');
  } else {
    await prisma.user.update({
      where: { email },
      data: { password, role: 'Admin' }
    });
    console.log('Usuario admin actualizado exitosamente: admin@purplebtl.com / admin123');
  }
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
