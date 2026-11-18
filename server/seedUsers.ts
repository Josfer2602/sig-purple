import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const usersToCreate = [
    { email: 'admin@purplebtl.com', role: 'Admin', password: 'password123' },
    { email: 'directorio@purplebtl.com', role: 'Directorio', password: 'password123' },
    { email: 'cuentas@purplebtl.com', role: 'Cuentas', password: 'password123' },
    { email: 'produccion@purplebtl.com', role: 'Producción', password: 'password123' },
    { email: 'contabilidad@purplebtl.com', role: 'Contabilidad', password: 'password123' }
  ];

  for (const user of usersToCreate) {
    const existingUser = await prisma.user.findUnique({ where: { email: user.email } });
    
    if (existingUser) {
      console.log(`El usuario ${user.email} ya existe.`);
    } else {
      const hashedPassword = await bcrypt.hash(user.password, 10);
      await prisma.user.create({
        data: {
          email: user.email,
          password: hashedPassword,
          role: user.role
        }
      });
      console.log(`Usuario creado: ${user.email} (Rol: ${user.role}) / ${user.password}`);
    }
  }
}

main()
  .catch(e => {
    console.error(e);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
