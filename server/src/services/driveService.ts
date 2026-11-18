import { google, drive_v3 } from 'googleapis';
import { Readable } from 'stream';
import fs from 'fs';
import path from 'path';
import { getOAuth2Client, getStoredTokens, saveTokens } from './calendarService';

export interface DriveItem {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  sizeBytes?: number;
  modifiedTime?: string;
  createdTime?: string;
  webViewLink?: string;
  webContentLink?: string;
  iconLink?: string;
  thumbnailLink?: string;
  isFolder: boolean;
  fileExtension?: string;
  iconType: 'folder' | 'pdf' | 'sheet' | 'doc' | 'slide' | 'image' | 'video' | 'zip' | 'audio' | 'other';
  owners?: { displayName?: string; emailAddress?: string; photoLink?: string }[];
  capabilities?: {
    canEdit?: boolean;
    canDownload?: boolean;
    canDelete?: boolean;
  };
}

export interface SharedDriveItem {
  id: string;
  name: string;
  colorRgb?: string;
  backgroundImageLink?: string;
  canAddChildren?: boolean;
}

/**
 * Obtiene el cliente autenticado de Google Drive v3 para un usuario
 * con fallback a Service Account si no hay tokens OAuth disponibles.
 */
export async function getDriveClient(userEmail?: string): Promise<drive_v3.Drive> {
  const tokens = getStoredTokens(userEmail);
  const scopeStr = typeof tokens?.scope === 'string' ? tokens.scope : '';
  const hasDriveScope = scopeStr.includes('auth/drive') || scopeStr.includes('drive.file');

  if (tokens && (tokens.access_token || tokens.refresh_token) && hasDriveScope) {
    const oauth2Client = getOAuth2Client();
    oauth2Client.setCredentials(tokens);

    // Auto-refresh token listener
    oauth2Client.on('tokens', (newTokens) => {
      saveTokens({ ...tokens, ...newTokens }, userEmail);
    });

    return google.drive({ version: 'v3', auth: oauth2Client });
  }

  // Fallback a Service Account (cuenta oficial con acceso directo a Repositorio SIG PurpleBTL)
  const CREDENTIALS_PATH = process.env.GOOGLE_APPLICATION_CREDENTIALS || path.join(__dirname, '../../google-credentials.json');
  const resolvedCredsPath = path.isAbsolute(CREDENTIALS_PATH) ? CREDENTIALS_PATH : path.resolve(process.cwd(), CREDENTIALS_PATH);
  if (fs.existsSync(resolvedCredsPath)) {
    const auth = new google.auth.GoogleAuth({
      keyFile: resolvedCredsPath,
      scopes: ['https://www.googleapis.com/auth/drive', 'https://www.googleapis.com/auth/drive.file'],
    });
    return google.drive({ version: 'v3', auth });
  }

  // Si no hay Service Account pero hay tokens, intentar con OAuth
  if (tokens && (tokens.access_token || tokens.refresh_token)) {
    const oauth2Client = getOAuth2Client();
    oauth2Client.setCredentials(tokens);
    return google.drive({ version: 'v3', auth: oauth2Client });
  }

  throw new Error('No se encontraron credenciales de Google Workspace ni Service Account para acceder a Google Drive.');
}

/**
 * Determina el tipo de archivo para iconos en UI
 */
function resolveIconType(mimeType: string, extension?: string): DriveItem['iconType'] {
  if (mimeType === 'application/vnd.google-apps.folder') return 'folder';
  if (mimeType.includes('pdf') || extension === 'pdf') return 'pdf';
  if (
    mimeType.includes('spreadsheet') || 
    mimeType.includes('excel') || 
    extension === 'xlsx' || 
    extension === 'xls' || 
    extension === 'csv'
  ) return 'sheet';
  if (
    mimeType.includes('document') || 
    mimeType.includes('word') || 
    extension === 'docx' || 
    extension === 'doc'
  ) return 'doc';
  if (
    mimeType.includes('presentation') || 
    mimeType.includes('powerpoint') || 
    extension === 'pptx' || 
    extension === 'ppt'
  ) return 'slide';
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType.startsWith('audio/')) return 'audio';
  if (
    mimeType.includes('zip') || 
    mimeType.includes('compressed') || 
    mimeType.includes('tar') || 
    mimeType.includes('rar')
  ) return 'zip';

  return 'other';
}

/**
 * Formatea bytes a tamaño legible (KB, MB, GB)
 */
function formatBytes(bytes?: number): string | undefined {
  if (bytes === undefined || bytes === null || isNaN(bytes)) return undefined;
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

/**
 * Lista las Unidades Compartidas (Shared Drives) a las que tiene acceso el usuario
 */
export async function listSharedDrives(userEmail?: string): Promise<SharedDriveItem[]> {
  const drive = await getDriveClient(userEmail);

  try {
    const res = await drive.drives.list({
      pageSize: 50,
      fields: 'drives(id, name, colorRgb, backgroundImageLink, capabilities)'
    });

    const drives = res.data.drives || [];
    return drives.map(d => ({
      id: d.id || '',
      name: d.name || 'Unidad Compartida',
      colorRgb: d.colorRgb || undefined,
      backgroundImageLink: d.backgroundImageLink || undefined,
      canAddChildren: d.capabilities?.canAddChildren ?? true
    }));
  } catch (error: any) {
    console.error('Error listing shared drives:', error);
    throw new Error(`Error al listar Unidades Compartidas: ${error.message}`);
  }
}

/**
 * Lista archivos y carpetas dentro de una Unidad Compartida o carpeta de Google Drive
 */
export async function listDriveFiles(
  userEmail: string | undefined,
  options: {
    driveId?: string;
    folderId?: string;
    searchTerm?: string;
    pageToken?: string;
    pageSize?: number;
  }
): Promise<{ files: DriveItem[]; nextPageToken?: string; currentFolderName?: string }> {
  const drive = await getDriveClient(userEmail);
  const { driveId, folderId, searchTerm, pageToken, pageSize = 80 } = options;

  let q = 'trashed = false';

  if (searchTerm && searchTerm.trim()) {
    const cleanSearch = searchTerm.replace(/'/g, "\\'");
    q += ` and name contains '${cleanSearch}'`;
  } else if (folderId) {
    q += ` and '${folderId}' in parents`;
  } else if (driveId) {
    q += ` and '${driveId}' in parents`;
  } else {
    q += ` and 'root' in parents`;
  }

  // Corpora setting according to Google Drive v3 rules:
  // - 'drive' when querying a specific shared drive
  // - 'allDrives' when navigating or searching inside a folder that may be in a shared drive
  // - 'user' when querying personal My Drive root
  let corpora: 'drive' | 'allDrives' | 'user' = 'user';
  if (driveId) {
    corpora = 'drive';
  } else if (folderId) {
    corpora = 'allDrives';
  }

  try {
    // Si tenemos un folderId específico, intentamos obtener su nombre para el breadcrumb
    let currentFolderName: string | undefined;
    if (folderId) {
      try {
        const folderMeta = await drive.files.get({
          fileId: folderId,
          supportsAllDrives: true,
          fields: 'id, name'
        });
        currentFolderName = folderMeta.data.name || undefined;
      } catch (e) {
        // Ignorar si no se puede leer metadato del folder
      }
    }

    const res = await drive.files.list({
      q,
      pageSize,
      pageToken: pageToken || undefined,
      includeItemsFromAllDrives: true,
      supportsAllDrives: true,
      corpora,
      driveId: driveId || undefined,
      fields: 'nextPageToken, files(id, name, mimeType, size, modifiedTime, createdTime, webViewLink, webContentLink, iconLink, thumbnailLink, owners(displayName, emailAddress, photoLink), capabilities(canEdit, canDownload, canDelete), fileExtension)',
      orderBy: 'folder, name'
    });

    const rawFiles = res.data.files || [];
    const files: DriveItem[] = rawFiles.map(f => {
      const isFolder = f.mimeType === 'application/vnd.google-apps.folder';
      const sizeBytes = f.size ? parseInt(f.size, 10) : undefined;
      const fileExt = f.fileExtension || (f.name && f.name.includes('.') ? f.name.split('.').pop()?.toLowerCase() : undefined);

      return {
        id: f.id || '',
        name: f.name || 'Sin título',
        mimeType: f.mimeType || 'application/octet-stream',
        size: formatBytes(sizeBytes),
        sizeBytes,
        modifiedTime: f.modifiedTime || undefined,
        createdTime: f.createdTime || undefined,
        webViewLink: f.webViewLink || undefined,
        webContentLink: f.webContentLink || undefined,
        iconLink: f.iconLink || undefined,
        thumbnailLink: f.thumbnailLink || undefined,
        isFolder,
        fileExtension: fileExt,
        iconType: resolveIconType(f.mimeType || '', fileExt),
        owners: (f.owners || []).map(o => ({
          displayName: o.displayName || undefined,
          emailAddress: o.emailAddress || undefined,
          photoLink: o.photoLink || undefined
        })),
        capabilities: {
          canEdit: f.capabilities?.canEdit ?? false,
          canDownload: f.capabilities?.canDownload ?? true,
          canDelete: f.capabilities?.canDelete ?? false
        }
      };
    });

    return {
      files,
      nextPageToken: res.data.nextPageToken || undefined,
      currentFolderName
    };
  } catch (error: any) {
    console.error('Error listing drive files:', error);
    throw new Error(`Error al explorar archivos de Google Drive: ${error.message}`);
  }
}

/**
 * Crea una nueva carpeta en Google Drive o Unidad Compartida
 */
export async function createDriveFolder(
  userEmail: string | undefined,
  options: {
    name: string;
    parentFolderId?: string;
    driveId?: string;
  }
): Promise<DriveItem> {
  const drive = await getDriveClient(userEmail);
  const parentId = options.parentFolderId || options.driveId || 'root';

  try {
    const res = await drive.files.create({
      requestBody: {
        name: options.name,
        mimeType: 'application/vnd.google-apps.folder',
        parents: [parentId]
      },
      supportsAllDrives: true,
      fields: 'id, name, mimeType, modifiedTime, webViewLink'
    });

    const f = res.data;
    return {
      id: f.id || '',
      name: f.name || options.name,
      mimeType: 'application/vnd.google-apps.folder',
      isFolder: true,
      iconType: 'folder',
      modifiedTime: f.modifiedTime || new Date().toISOString(),
      webViewLink: f.webViewLink || undefined
    };
  } catch (error: any) {
    console.error('Error creating drive folder:', error);
    throw new Error(`Error al crear carpeta: ${error.message}`);
  }
}

/**
 * Corrige nombres de archivos cuyos caracteres especiales/tildes en UTF-8
 * fueron malinterpretados como Latin-1 (ISO-8859-1) durante la subida multipart/form-data.
 * Ejemplo: "CotizaciÃ³n" -> "Cotización", "dÃ­a" -> "día", "CampaÃ±a" -> "Campaña".
 */
export function fixFileNameEncoding(name: string): string {
  if (!name) return name;
  const utf8AsLatin1Regex = /[\xC2-\xDF][\x80-\xBF]|[\xE0-\xEF][\x80-\xBF]{2}/;
  if (utf8AsLatin1Regex.test(name)) {
    try {
      const decoded = Buffer.from(name, 'latin1').toString('utf8');
      if (!decoded.includes('\uFFFD')) {
        return decoded;
      }
    } catch (e) {}
  }
  return name;
}

/**
 * Sube un archivo a Google Drive o Unidad Compartida
 */
export async function uploadFileToDrive(
  userEmail: string | undefined,
  options: {
    name: string;
    mimeType: string;
    buffer: Buffer;
    parentFolderId?: string;
    driveId?: string;
  }
): Promise<DriveItem> {
  const drive = await getDriveClient(userEmail);
  const parentId = options.parentFolderId || options.driveId || 'root';
  const cleanName = fixFileNameEncoding(options.name.trim());

  const stream = new Readable();
  stream.push(options.buffer);
  stream.push(null);

  try {
    const res = await drive.files.create({
      requestBody: {
        name: cleanName,
        parents: [parentId]
      },
      media: {
        mimeType: options.mimeType || 'application/octet-stream',
        body: stream
      },
      supportsAllDrives: true,
      fields: 'id, name, mimeType, size, modifiedTime, webViewLink, webContentLink'
    });

    const f = res.data;
    const sizeBytes = f.size ? parseInt(f.size, 10) : options.buffer.length;

    return {
      id: f.id || '',
      name: f.name || cleanName,
      mimeType: f.mimeType || options.mimeType,
      size: formatBytes(sizeBytes),
      sizeBytes,
      isFolder: false,
      iconType: resolveIconType(f.mimeType || options.mimeType, cleanName.split('.').pop()?.toLowerCase()),
      modifiedTime: f.modifiedTime || new Date().toISOString(),
      webViewLink: f.webViewLink || undefined,
      webContentLink: f.webContentLink || undefined
    };
  } catch (error: any) {
    console.error('Error uploading file to drive:', error);
    throw new Error(`Error al subir archivo a Google Drive: ${error.message}`);
  }
}

/**
 * Función compatible con backupService para subir archivos locales a Drive
 */
export async function uploadToDrive(filePath: string, fileName: string, folderId?: string): Promise<any> {
  try {
    const drive = await getDriveClient();
    const parentId = folderId || 'root';
    const res = await drive.files.create({
      requestBody: {
        name: fileName,
        parents: [parentId]
      },
      media: {
        body: fs.createReadStream(filePath)
      },
      supportsAllDrives: true,
      fields: 'id, name, webViewLink'
    });
    return res.data;
  } catch (err) {
    console.error('Error in uploadToDrive backup helper:', err);
    return { id: '', webViewLink: '' };
  }
}

export interface CreateProjectFolderOptions {
  clientName: string;
  projectName: string;
  userEmail?: string;
  driveId?: string;
}

export interface ProjectFolderResult {
  success: boolean;
  folderId: string;
  webViewLink?: string;
  clientFolderId: string;
  clientFolderName: string;
  projectFolderName: string;
}

/**
 * Crea la estructura completa oficial de carpetas de un proyecto en Google Drive:
 * Repositorio SIG PurpleBTL > [Cliente] > [Proyecto] /
 *   ├── Administrativo/
 *   ├── Creatividad/
 *   ├── Cuentas/ (Cotización Cliente, Entregable Cliente, Gantt, Información Cliente, Presentaciones)
 *   ├── Diseño/ (Archivo Ai)
 *   └── Producción/ (Cotizaciones de proveedores, Desglose de Producción, Facturas, Fotos de Ejecución, Órdenes de compra, Pago a proveedor)
 */
export async function createProjectDriveStructure(
  options: CreateProjectFolderOptions
): Promise<ProjectFolderResult> {
  const cleanClient = (options.clientName || 'Cliente General').trim();
  const cleanProject = (options.projectName || 'Proyecto').trim();

  const drive = await getDriveClient(options.userEmail);

  // 1. Resolver la Unidad Compartida destino
  let targetDriveId = options.driveId || process.env.GOOGLE_DRIVE_FOLDER_ID;
  if (!targetDriveId) {
    try {
      const drives = await listSharedDrives(options.userEmail);
      const match = drives.find(d => 
        d.name.toLowerCase().includes('repositorio sig purplebtl') || 
        d.name.toLowerCase().includes('reporsitorio sig purplebtl') ||
        d.name.toLowerCase().includes('proyectos')
      ) || drives[0];
      if (match) targetDriveId = match.id;
    } catch (e) {
      console.warn('No se pudo listar unidades compartidas para buscar repositorio:', e);
    }
  }

  if (!targetDriveId) {
    throw new Error('No se encontró la Unidad Compartida "Repositorio SIG PurpleBTL" en Google Drive.');
  }

  // 2. Buscar o crear carpeta del Cliente dentro de la Unidad Compartida
  const escapedClient = cleanClient.replace(/'/g, "\\'");
  let clientFolderId: string | undefined;
  let clientFolderLink: string | undefined;

  try {
    const searchRes = await drive.files.list({
      q: `mimeType = 'application/vnd.google-apps.folder' and '${targetDriveId}' in parents and name = '${escapedClient}' and trashed = false`,
      corpora: 'drive',
      driveId: targetDriveId,
      includeItemsFromAllDrives: true,
      supportsAllDrives: true,
      fields: 'files(id, name, webViewLink)',
      pageSize: 10
    });

    if (searchRes.data.files && searchRes.data.files.length > 0) {
      clientFolderId = searchRes.data.files[0].id!;
      clientFolderLink = searchRes.data.files[0].webViewLink || undefined;
    } else {
      // Búsqueda insensible a mayúsculas/minúsculas
      const allRootRes = await drive.files.list({
        q: `mimeType = 'application/vnd.google-apps.folder' and '${targetDriveId}' in parents and trashed = false`,
        corpora: 'drive',
        driveId: targetDriveId,
        includeItemsFromAllDrives: true,
        supportsAllDrives: true,
        fields: 'files(id, name, webViewLink)',
        pageSize: 100
      });
      const match = (allRootRes.data.files || []).find(
        f => (f.name || '').trim().toLowerCase() === cleanClient.toLowerCase()
      );
      if (match) {
        clientFolderId = match.id!;
        clientFolderLink = match.webViewLink || undefined;
      }
    }
  } catch (err: any) {
    console.error('Error buscando carpeta del cliente en Drive:', err.message);
  }

  if (!clientFolderId) {
    console.log(`[Google Drive] Creando carpeta para cliente "${cleanClient}" en unidad compartida...`);
    const newClientRes = await drive.files.create({
      requestBody: {
        name: cleanClient,
        mimeType: 'application/vnd.google-apps.folder',
        parents: [targetDriveId]
      },
      supportsAllDrives: true,
      fields: 'id, name, webViewLink'
    });
    clientFolderId = newClientRes.data.id!;
    clientFolderLink = newClientRes.data.webViewLink || undefined;
  }

  // 3. Buscar o crear carpeta del Proyecto dentro de la carpeta del Cliente
  const escapedProject = cleanProject.replace(/'/g, "\\'");
  let projectFolderId: string | undefined;
  let projectFolderLink: string | undefined;

  try {
    const projSearchRes = await drive.files.list({
      q: `mimeType = 'application/vnd.google-apps.folder' and '${clientFolderId}' in parents and name = '${escapedProject}' and trashed = false`,
      corpora: 'allDrives',
      includeItemsFromAllDrives: true,
      supportsAllDrives: true,
      fields: 'files(id, name, webViewLink)',
      pageSize: 10
    });

    if (projSearchRes.data.files && projSearchRes.data.files.length > 0) {
      projectFolderId = projSearchRes.data.files[0].id!;
      projectFolderLink = projSearchRes.data.files[0].webViewLink || undefined;
    }
  } catch (err: any) {
    console.error('Error buscando carpeta del proyecto en Drive:', err.message);
  }

  if (!projectFolderId) {
    console.log(`[Google Drive] Creando carpeta para proyecto "${cleanProject}" en cliente "${cleanClient}"...`);
    const newProjRes = await drive.files.create({
      requestBody: {
        name: cleanProject,
        mimeType: 'application/vnd.google-apps.folder',
        parents: [clientFolderId]
      },
      supportsAllDrives: true,
      fields: 'id, name, webViewLink'
    });
    projectFolderId = newProjRes.data.id!;
    projectFolderLink = newProjRes.data.webViewLink || undefined;
  }

  // Helper para buscar o crear subcarpeta
  const findOrCreateSubfolder = async (parentId: string, folderName: string): Promise<string> => {
    const escName = folderName.replace(/'/g, "\\'");
    try {
      const res = await drive.files.list({
        q: `mimeType = 'application/vnd.google-apps.folder' and '${parentId}' in parents and name = '${escName}' and trashed = false`,
        corpora: 'allDrives',
        includeItemsFromAllDrives: true,
        supportsAllDrives: true,
        fields: 'files(id, name)',
        pageSize: 5
      });
      if (res.data.files && res.data.files.length > 0) {
        return res.data.files[0].id!;
      }
    } catch (e: any) {
      console.warn(`Error buscando subcarpeta "${folderName}":`, e.message);
    }

    const created = await drive.files.create({
      requestBody: {
        name: folderName,
        mimeType: 'application/vnd.google-apps.folder',
        parents: [parentId]
      },
      supportsAllDrives: true,
      fields: 'id'
    });
    return created.data.id!;
  };

  // 4. Crear las 5 áreas principales en paralelo
  const [adminId, creatId, cuentasId, disenoId, prodId] = await Promise.all([
    findOrCreateSubfolder(projectFolderId, 'Administrativo'),
    findOrCreateSubfolder(projectFolderId, 'Creatividad'),
    findOrCreateSubfolder(projectFolderId, 'Cuentas'),
    findOrCreateSubfolder(projectFolderId, 'Diseño'),
    findOrCreateSubfolder(projectFolderId, 'Producción')
  ]);

  // 5. Crear todas las subcarpetas departamentales en paralelo
  await Promise.all([
    // Subcarpetas de Cuentas
    findOrCreateSubfolder(cuentasId, 'Cotización Cliente'),
    findOrCreateSubfolder(cuentasId, 'Entregable Cliente'),
    findOrCreateSubfolder(cuentasId, 'Gantt'),
    findOrCreateSubfolder(cuentasId, 'Información Cliente'),
    findOrCreateSubfolder(cuentasId, 'Presentaciones'),

    // Subcarpetas de Diseño
    findOrCreateSubfolder(disenoId, 'Archivo Ai'),

    // Subcarpetas de Producción
    findOrCreateSubfolder(prodId, 'Cotizaciones de proveedores'),
    findOrCreateSubfolder(prodId, 'Desglose de Producción'),
    findOrCreateSubfolder(prodId, 'Facturas'),
    findOrCreateSubfolder(prodId, 'Fotos de Ejecución'),
    findOrCreateSubfolder(prodId, 'Órdenes de compra'),
    findOrCreateSubfolder(prodId, 'Pago a proveedor')
  ]);

  console.log(`[Google Drive] ✅ Estructura completa de carpetas creada exitosamente para "${cleanProject}"`);

  return {
    success: true,
    folderId: projectFolderId,
    webViewLink: projectFolderLink,
    clientFolderId,
    clientFolderName: cleanClient,
    projectFolderName: cleanProject
  };
}

export interface ProviderFolderResult {
  success: boolean;
  folderId: string;
  webViewLink?: string;
  rootFolderId: string;
}

export async function getOrCreateProviderDriveFolder(options: {
  providerName: string;
  userEmail?: string;
}): Promise<ProviderFolderResult> {
  const drive = await getDriveClient(options.userEmail);
  const cleanProvider = (options.providerName || 'Proveedor General').trim();
  
  // 1. Resolver Unidad Compartida
  let targetDriveId = process.env.GOOGLE_DRIVE_FOLDER_ID;
  if (!targetDriveId) {
    try {
      const drives = await listSharedDrives(options.userEmail);
      const match = drives.find(d => 
        d.name.toLowerCase().includes('repositorio sig purplebtl') || 
        d.name.toLowerCase().includes('reporsitorio sig purplebtl') ||
        d.name.toLowerCase().includes('proyectos')
      ) || drives[0];
      if (match) targetDriveId = match.id;
    } catch(e) {}
  }
  if (!targetDriveId) throw new Error('No se encontró Unidad Compartida para proveedores.');

  const findOrCreateFolder = async (parentId: string, folderName: string, isDriveRoot = false): Promise<{id: string, link?: string}> => {
    const escName = folderName.replace(/'/g, "\\'");
    let q = `mimeType = 'application/vnd.google-apps.folder' and '${parentId}' in parents and name = '${escName}' and trashed = false`;
    const listRes = await drive.files.list({
      q,
      corpora: isDriveRoot ? 'drive' : 'allDrives',
      driveId: isDriveRoot ? parentId : undefined,
      includeItemsFromAllDrives: true,
      supportsAllDrives: true,
      fields: 'files(id, name, webViewLink)',
      pageSize: 5
    });
    if (listRes.data.files && listRes.data.files.length > 0) {
      return { id: listRes.data.files[0].id!, link: listRes.data.files[0].webViewLink || undefined };
    }
    const created = await drive.files.create({
      requestBody: {
        name: folderName,
        mimeType: 'application/vnd.google-apps.folder',
        parents: [parentId]
      },
      supportsAllDrives: true,
      fields: 'id, webViewLink'
    });
    return { id: created.data.id!, link: created.data.webViewLink || undefined };
  };

  const rootRes = await findOrCreateFolder(targetDriveId, 'Proveedores', true);
  const provRes = await findOrCreateFolder(rootRes.id, cleanProvider, false);

  return {
    success: true,
    folderId: provRes.id,
    webViewLink: provRes.link,
    rootFolderId: rootRes.id
  };
}

export interface UploadProjectFileOptions {
  projectId?: string;
  clienteId?: string;
  clientName?: string;
  projectName?: string;
  area?: 'Producción' | 'Cuentas' | 'Diseño' | 'Creatividad' | 'Administrativo' | string;
  subfolder?: string; // 'Pago a proveedor' | 'Órdenes de compra' | 'Cotizaciones de proveedores' | 'Facturas' | 'Desglose de Producción' | 'Cotización Cliente' | 'Gantt'
  fileName: string;
  mimeType?: string;
  buffer?: Buffer;
  filePath?: string;
  userEmail?: string;
  prisma?: any;
  versioning?: boolean;
  itemIdentifier?: string; // ej: 'OC-2026-001' o 'PAG-2026-001'
  entityName?: string;     // ej: '11-M CREATIVE'
}

export interface UploadProjectFileResult {
  id: string;
  webViewLink?: string;
  webContentLink?: string;
  folderId: string;
  folderName: string;
  fileName?: string;
}

/**
 * Sube un archivo a la carpeta oficial y subcarpeta departamental del proyecto correspondiente en Drive:
 * [Cliente] > [Proyecto] > [Área (ej: Producción)] > [Subcarpeta (ej: Pago a proveedor u Órdenes de compra)]
 */
export async function uploadToProjectDriveFolder(
  options: UploadProjectFileOptions
): Promise<UploadProjectFileResult> {
  const drive = await getDriveClient(options.userEmail);
  const targetArea = options.area || 'Producción';
  const targetSubfolder = options.subfolder || 'Pago a proveedor';

  let projectDriveFolderId: string | undefined;
  let clientName = options.clientName;
  let projectName = options.projectName;

  // 1. Si tenemos prisma y projectId, buscar proyecto y su cliente
  if (options.prisma && options.projectId) {
    try {
      const proy = await options.prisma.proyecto.findUnique({
        where: { id: options.projectId },
        include: { cliente: true }
      });
      if (proy) {
        projectName = proy.nombre;
        clientName = proy.cliente?.empresa || clientName;
        projectDriveFolderId = proy.driveFolderId || undefined;
      }
    } catch (e: any) {
      console.warn('Error buscando proyecto en DB para Drive:', e.message);
    }
  }

  // 2. Si aún no tenemos cliente pero tenemos clienteId
  if (options.prisma && !clientName && options.clienteId) {
    try {
      const cli = await options.prisma.cliente.findUnique({
        where: { id: options.clienteId }
      });
      if (cli) clientName = cli.empresa;
    } catch (e) {}
  }

  // 3. Si no tenemos projectDriveFolderId pero sí tenemos clientName y projectName,
  // crear o resolver la estructura del proyecto en Google Drive
  if (!projectDriveFolderId && clientName && projectName) {
    try {
      const structureResult = await createProjectDriveStructure({
        clientName,
        projectName,
        userEmail: options.userEmail
      });
      projectDriveFolderId = structureResult.folderId;

      // Actualizar en base de datos si tenemos prisma y projectId
      if (options.prisma && options.projectId && structureResult.folderId) {
        try {
          await options.prisma.proyecto.update({
            where: { id: options.projectId },
            data: {
              driveFolderId: structureResult.folderId,
              driveFolderUrl: structureResult.webViewLink
            }
          });
        } catch (dbErr: any) {
          console.warn('No se pudo actualizar driveFolderId en DB:', dbErr.message);
        }
      }
    } catch (createErr: any) {
      console.error('Error al resolver estructura de proyecto en Drive:', createErr.message);
    }
  }

  // Helper para buscar o crear subcarpeta dentro de un directorio padre
  const findOrCreateSubfolder = async (parentId: string, folderName: string): Promise<string> => {
    const escName = folderName.replace(/'/g, "\\'");
    try {
      const res = await drive.files.list({
        q: `mimeType = 'application/vnd.google-apps.folder' and '${parentId}' in parents and name = '${escName}' and trashed = false`,
        corpora: 'allDrives',
        includeItemsFromAllDrives: true,
        supportsAllDrives: true,
        fields: 'files(id, name)',
        pageSize: 5
      });
      if (res.data.files && res.data.files.length > 0) {
        return res.data.files[0].id!;
      }
    } catch (e: any) {
      console.warn(`Error buscando subcarpeta "${folderName}":`, e.message);
    }

    const created = await drive.files.create({
      requestBody: {
        name: folderName,
        mimeType: 'application/vnd.google-apps.folder',
        parents: [parentId]
      },
      supportsAllDrives: true,
      fields: 'id'
    });
    return created.data.id!;
  };

  // 4. Determinar la carpeta final destino
  let targetFolderId: string;
  let finalFolderName = targetSubfolder;

  if (projectDriveFolderId) {
    // Buscar / asegurar carpeta del área (ej: 'Producción') dentro de la carpeta del proyecto
    const areaFolderId = await findOrCreateSubfolder(projectDriveFolderId, targetArea);

    // Buscar / asegurar subcarpeta (ej: 'Pago a proveedor' u 'Órdenes de compra') dentro del área
    if (targetSubfolder) {
      targetFolderId = await findOrCreateSubfolder(areaFolderId, targetSubfolder);
    } else {
      targetFolderId = areaFolderId;
      finalFolderName = targetArea;
    }
  } else {
    // Fallback: Si no hay proyecto, subir a carpeta general en la Unidad Compartida
    const targetDriveId = process.env.GOOGLE_DRIVE_FOLDER_ID || 'root';
    const folderName = options.subfolder || options.area || 'Comprobantes_Generales';
    targetFolderId = await findOrCreateSubfolder(targetDriveId, folderName);
    finalFolderName = folderName;
  }

  // 4.1 LÓGICA DE DESGLOSE POR CARPETAS Y CONTROL DE VERSIONES
  // Si ya existen versiones previas para este ítem (orden, pago, etc.), se desglosa creando
  // una subcarpeta específica "[ID] - [Proveedor]" y agrupando el historial (V1, V2, etc.)
  let uploadParentFolderId = targetFolderId;
  let finalFileNameToUpload = fixFileNameEncoding(options.fileName.trim());
  const itemIdentifier = (options.itemIdentifier || '').trim();
  const entityName = (options.entityName || '').trim();

  if (options.versioning || itemIdentifier) {
    try {
      const escId = (itemIdentifier || finalFileNameToUpload).replace(/'/g, "\\'");
      const cleanEntity = entityName.replace(/[/\\?%*:|"<>]/g, '_').trim();
      const dedicatedFolderName = cleanEntity && itemIdentifier 
        ? `${itemIdentifier} - ${cleanEntity}` 
        : (itemIdentifier || path.basename(finalFileNameToUpload, path.extname(finalFileNameToUpload)));
      const escDedicatedName = dedicatedFolderName.replace(/'/g, "\\'");

      // A) Buscar si ya existe una subcarpeta desglosada para este ítem
      const folderSearch = await drive.files.list({
        q: `mimeType = 'application/vnd.google-apps.folder' and '${targetFolderId}' in parents and (name = '${escDedicatedName}' or name contains '${escId}') and trashed = false`,
        corpora: 'allDrives',
        includeItemsFromAllDrives: true,
        supportsAllDrives: true,
        fields: 'files(id, name)',
        pageSize: 5
      });

      let dedicatedFolderId: string | null = null;
      if (folderSearch.data.files && folderSearch.data.files.length > 0) {
        dedicatedFolderId = folderSearch.data.files[0].id!;
        finalFolderName = folderSearch.data.files[0].name!;
      }

      // B) Buscar si existen archivos existentes para este ítem directamente en targetFolderId
      const rootFilesSearch = await drive.files.list({
        q: `mimeType != 'application/vnd.google-apps.folder' and '${targetFolderId}' in parents and (name contains '${escId}' or name = '${finalFileNameToUpload.replace(/'/g, "\\'")}') and trashed = false`,
        corpora: 'allDrives',
        includeItemsFromAllDrives: true,
        supportsAllDrives: true,
        fields: 'files(id, name)',
        pageSize: 50
      });
      const rootFiles = rootFilesSearch.data.files || [];

      const ext = path.extname(finalFileNameToUpload);
      const baseName = path.basename(finalFileNameToUpload, ext).replace(/_v\d+$/i, '');

      if (dedicatedFolderId) {
        // CASO 1: Ya existe la subcarpeta dedicada. Subir la nueva versión allí.
        uploadParentFolderId = dedicatedFolderId;

        // Si quedó algún archivo previo en la raíz, moverlo dentro de la carpeta desglosada
        for (const rf of rootFiles) {
          try {
            await drive.files.update({
              fileId: rf.id!,
              addParents: dedicatedFolderId,
              removeParents: targetFolderId,
              supportsAllDrives: true
            });
          } catch (mErr: any) {
            console.warn(`No se pudo mover archivo ${rf.name} a subcarpeta desglosada:`, mErr.message);
          }
        }

        // Determinar siguiente correlativo de versión dentro de la subcarpeta
        const subFilesSearch = await drive.files.list({
          q: `mimeType != 'application/vnd.google-apps.folder' and '${dedicatedFolderId}' in parents and trashed = false`,
          corpora: 'allDrives',
          includeItemsFromAllDrives: true,
          supportsAllDrives: true,
          fields: 'files(id, name)',
          pageSize: 100
        });
        const subFiles = subFilesSearch.data.files || [];
        const nextVersion = subFiles.length + 1;
        finalFileNameToUpload = `${baseName}_v${nextVersion}${ext}`;

      } else if (rootFiles.length > 0) {
        // CASO 2: Ya existe al menos un archivo previo en la raíz -> Desglosar por carpeta automáticamente
        console.log(`[Google Drive] Desglosando versiones en carpeta para "${dedicatedFolderName}"...`);
        const newFolderRes = await drive.files.create({
          requestBody: {
            name: dedicatedFolderName,
            mimeType: 'application/vnd.google-apps.folder',
            parents: [targetFolderId]
          },
          supportsAllDrives: true,
          fields: 'id, name'
        });
        dedicatedFolderId = newFolderRes.data.id!;
        uploadParentFolderId = dedicatedFolderId;
        finalFolderName = dedicatedFolderName;

        // Mover los archivos previos a la nueva subcarpeta y numerarlos como V1, etc.
        for (let i = 0; i < rootFiles.length; i++) {
          const rf = rootFiles[i];
          let updatedName = rf.name || '';
          if (!/_v\d+/i.test(updatedName)) {
            const rfExt = path.extname(updatedName);
            const rfBase = path.basename(updatedName, rfExt);
            updatedName = `${rfBase}_v${i + 1}${rfExt}`;
          }
          try {
            await drive.files.update({
              fileId: rf.id!,
              addParents: dedicatedFolderId,
              removeParents: targetFolderId,
              requestBody: { name: updatedName },
              supportsAllDrives: true
            });
          } catch (mErr: any) {
            console.warn(`Error moviendo ${rf.name} a subcarpeta ${dedicatedFolderName}:`, mErr.message);
          }
        }

        // El nuevo archivo a subir será _v${rootFiles.length + 1}
        finalFileNameToUpload = `${baseName}_v${rootFiles.length + 1}${ext}`;

      } else {
        // CASO 3: Primera versión absoluta, se deposita directamente en targetFolderId sin sufijo _v
        uploadParentFolderId = targetFolderId;
      }
    } catch (verErr: any) {
      console.warn(`[Google Drive] Error en desglose por versión para ${itemIdentifier}:`, verErr.message);
      uploadParentFolderId = targetFolderId;
    }
  }

  // 5. Realizar la subida del archivo (Buffer o FileStream)
  let mediaBody: any;
  if (options.buffer) {
    const stream = new Readable();
    stream.push(options.buffer);
    stream.push(null);
    mediaBody = stream;
  } else if (options.filePath && fs.existsSync(options.filePath)) {
    mediaBody = fs.createReadStream(options.filePath);
  } else {
    throw new Error('No se proporcionó ni buffer ni filePath válido para subir a Google Drive.');
  }

  const mimeType = options.mimeType || 'application/octet-stream';

  const uploadRes = await drive.files.create({
    requestBody: {
      name: finalFileNameToUpload,
      parents: [uploadParentFolderId]
    },
    media: {
      mimeType,
      body: mediaBody
    },
    supportsAllDrives: true,
    fields: 'id, name, mimeType, webViewLink, webContentLink'
  });

  const fileData = uploadRes.data;
  console.log(`[Google Drive] ✅ Archivo "${finalFileNameToUpload}" subido exitosamente a "${finalFolderName}" (ID: ${fileData.id})`);

  return {
    id: fileData.id || '',
    webViewLink: fileData.webViewLink || undefined,
    webContentLink: fileData.webContentLink || undefined,
    folderId: uploadParentFolderId,
    folderName: finalFolderName,
    fileName: finalFileNameToUpload
  };
}



