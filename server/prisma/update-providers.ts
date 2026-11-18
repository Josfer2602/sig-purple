import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Actualizando nombres de proveedores...');
  
  const nombresProveedores = [
    "Impresiones y Gráficos Visual S.A.C.", "Productora Audiovisual Flash E.I.R.L.", 
    "Logística Integral para Eventos S.A.", "Catering Delicias Gourmet S.A.C.",
    "Estructuras y Toldos VIP S.R.L.", "Merchandising Creativo S.A.C.",
    "Agencia de Modelos Elite S.A.", "Sonido e Iluminación Pro E.I.R.L.",
    "Transportes Express BTL S.A.C.", "Mobiliario Lounge S.R.L.",
    "Animaciones y Shows Estrella S.A.C.", "Diseño de Stands Expo S.A.",
    "Impresión 3D e Innovación S.A.C.", "Fotografía y Video Premium E.I.R.L.",
    "Uniformes Corporativos Textil S.A.C.", "Seguridad y Control VIP S.R.L.",
    "Flores y Decoración Eventos S.A.C.", "Pantallas LED Gigantes S.A.",
    "Módulos y Exhibidores S.R.L.", "Regalos Corporativos Exclusivos S.A.C."
  ];

  const proveedores = await prisma.proveedor.findMany();
  
  for (let i = 0; i < proveedores.length; i++) {
    const proveedor = proveedores[i];
    const nuevoNombre = nombresProveedores[i % nombresProveedores.length];
    
    await prisma.proveedor.update({
      where: { id: proveedor.id },
      data: {
        razonSocial: nuevoNombre,
        nombre: `Contacto de ${nuevoNombre.split(' ')[0]}`,
        correo: `contacto@${nuevoNombre.split(' ')[0].toLowerCase()}.com`
      }
    });
  }
  
  console.log(`✅ Actualizados los nombres de ${proveedores.length} proveedores.`);
}

main()
  .catch((e) => {
    console.error(e);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
