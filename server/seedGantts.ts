import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const uuidv4 = () => Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);

async function main() {
  // We need a client to attach projects to
  let client = await prisma.cliente.findFirst();
  if (!client) {
    client = await prisma.cliente.create({
      data: {
        id: uuidv4(),
        empresa: 'Cliente Demo',
        contacto: 'Juan Perez',
        email: 'juan@demo.com',
        telefono: '999999999',
        estado: 'Activo'
      }
    });
  }

  const startDateBase = new Date();
  startDateBase.setDate(startDateBase.getDate() - 5);

  const projectsToCreate = [
    { name: 'Activación BTL Mall Sur', taskCount: 8 },
    { name: 'Lanzamiento Producto X', taskCount: 12 },
    { name: 'Campaña Navideña 2026', taskCount: 15 },
    { name: 'Feria Gastronómica', taskCount: 6 },
    { name: 'Tour Universitario', taskCount: 10 }
  ];

  for (let i = 0; i < projectsToCreate.length; i++) {
    const pData = projectsToCreate[i];
    
    // Create Project
    const project = await prisma.proyecto.create({
      data: {
        id: uuidv4(),
        clienteId: client.id,
        nombre: pData.name,
        fechaRegistro: new Date().toISOString().split('T')[0],
        tipoServicio: 'BTL',
        tipoProyecto: 'Evento',
        subtotal: 50000,
        estado: 'En Ejecución',
        presupuestoEstimado: '50000',
        projectManager: 'Admin'
      }
    });

    // Create Gantt
    const gantt = await prisma.projectGantt.create({
      data: {
        id: uuidv4(),
        projectId: project.id,
        name: `Cronograma - ${pData.name}`,
        status: 'Activo',
        version: 1,
        shareToken: uuidv4()
      }
    });

    // Create Tasks
    let currentStart = new Date(startDateBase);
    for (let t = 0; t < pData.taskCount; t++) {
      const duration = Math.floor(Math.random() * 5) + 2; // 2 to 6 days
      const end = new Date(currentStart);
      end.setDate(end.getDate() + duration);

      await prisma.ganttTask.create({
        data: {
          id: uuidv4(),
          ganttId: gantt.id,
          name: `Fase ${t + 1}: ${['Diseño', 'Producción', 'Logística', 'Implementación', 'Supervisión', 'Desmontaje'][t % 6]}`,
          startDate: currentStart.toISOString().split('T')[0],
          endDate: end.toISOString().split('T')[0],
          progress: Math.floor(Math.random() * 100),
          dependencies: t > 0 ? 'prev' : '',
          type: 'task',
          assignee: ['Juan', 'Maria', 'Pedro', 'Ana'][Math.floor(Math.random() * 4)]
        }
      });

      // Next task starts 1-2 days before the previous ends
      currentStart = new Date(end);
      currentStart.setDate(currentStart.getDate() - Math.floor(Math.random() * 2));
    }
    
    console.log(`Creado proyecto ${pData.name} con ${pData.taskCount} tareas.`);
  }
}

main()
  .catch(e => {
    console.error(e);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
