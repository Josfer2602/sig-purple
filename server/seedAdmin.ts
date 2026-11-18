import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const email = 'jose.narva@purplebtl.com';
  const existingUser = await prisma.user.findUnique({ where: { email } });
  
  if (existingUser) {
    console.log('El usuario administrador ya existe.');
    return;
  }

  const hashedPassword = await bcrypt.hash('admin123', 10);
  
  await prisma.user.create({
    data: {
      email,
      password: hashedPassword,
      role: 'Directorio'
    }
  });

  console.log('Usuario administrador creado exitosamente: jose.narva@purplebtl.com / admin123');
}

main()
  .catch(e => {
    console.error(e);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
