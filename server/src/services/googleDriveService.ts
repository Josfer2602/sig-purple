import { google } from 'googleapis';
import fs from 'fs';
import path from 'path';
import { Readable } from 'stream';
import { fixFileNameEncoding } from './driveService';

// Asegúrate de que las credenciales estén en el .env o en el mismo nivel
const CREDENTIALS_PATH = process.env.GOOGLE_APPLICATION_CREDENTIALS || path.join(__dirname, '../../google-credentials.json');

let auth: any = null;

try {
  if (fs.existsSync(CREDENTIALS_PATH)) {
    auth = new google.auth.GoogleAuth({
      keyFile: CREDENTIALS_PATH,
      scopes: ['https://www.googleapis.com/auth/drive.file', 'https://www.googleapis.com/auth/drive'],
    });
  } else {
    console.warn(`[Google Drive] No se encontró el archivo de credenciales en ${CREDENTIALS_PATH}`);
  }
} catch (e) {
  console.error('[Google Drive] Error inicializando auth:', e);
}

/**
 * Busca una subcarpeta por nombre dentro de un parentFolderId. Si no existe, la crea.
 */
export const getOrCreateDriveFolder = async (parentFolderId: string, folderName: string): Promise<string> => {
  if (!auth) throw new Error('Google Drive no está configurado (Faltan credenciales).');
  const drive = google.drive({ version: 'v3', auth });

  try {
    const escapedName = folderName.replace(/'/g, "\\'");
    const query = `mimeType='application/vnd.google-apps.folder' and '${parentFolderId}' in parents and name='${escapedName}' and trashed=false`;
    const response = await drive.files.list({
      q: query,
      spaces: 'drive',
      fields: 'files(id, name)',
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
      corpora: 'allDrives',
    });

    if (response.data.files && response.data.files.length > 0) {
      return response.data.files[0].id as string;
    }

    const fileMetadata = {
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentFolderId],
    };

    const file = await drive.files.create({
      requestBody: fileMetadata,
      fields: 'id',
      supportsAllDrives: true,
    });

    return file.data.id as string;
  } catch (error) {
    console.error(`Error buscando/creando carpeta ${folderName}:`, error);
    throw error;
  }
};

/**
 * Resuelve una ruta jerárquica de carpetas y luego sube el archivo.
 */
export const resolvePathAndUpload = async (filePath: string, fileName: string, mimeType: string, rootFolderId: string, pathFolders: string[]) => {
  let currentParentId = rootFolderId;
  for (const folderName of pathFolders) {
    const cleanName = folderName.replace(/[\/\\]/g, '-').trim() || 'General';
    currentParentId = await getOrCreateDriveFolder(currentParentId, cleanName);
  }
  return uploadFileToDrive(filePath, fileName, mimeType, currentParentId);
};

/**
 * Sube un archivo a Google Drive y devuelve la URL y el ID del archivo.
 * @param filePath Ruta local del archivo
 * @param fileName Nombre con el que se guardará en Drive
 * @param mimeType Tipo MIME del archivo
 * @param folderId ID de la carpeta compartida en Drive (de .env)
 */
export const uploadFileToDrive = async (filePath: string, fileName: string, mimeType: string, folderId: string) => {
  if (!auth) {
    throw new Error('Google Drive no está configurado (Faltan credenciales).');
  }
  
  if (!folderId) {
     throw new Error('Google Drive Folder ID no proporcionado.');
  }

  const drive = google.drive({ version: 'v3', auth });

  const fileMetadata = {
    name: fixFileNameEncoding(fileName),
    parents: [folderId],
  };

  const media = {
    mimeType: mimeType,
    body: fs.createReadStream(filePath),
  };

  try {
    const file = await drive.files.create({
      requestBody: fileMetadata,
      media: media,
      fields: 'id, webViewLink, webContentLink',
      supportsAllDrives: true,
    });

    console.log(`Archivo subido a Drive exitosamente: ${fileName} (${file.data.id})`);

    return {
      id: file.data.id,
      webViewLink: file.data.webViewLink,
      webContentLink: file.data.webContentLink,
    };
  } catch (error) {
    console.error('Error subiendo archivo a Google Drive:', error);
    throw error;
  }
};

export const uploadBufferToDrive = async (buffer: Buffer, fileName: string, mimeType: string, folderId: string) => {
  if (!auth) throw new Error('Google Drive no está configurado (Faltan credenciales).');
  if (!folderId) throw new Error('Google Drive Folder ID no proporcionado.');

  const drive = google.drive({ version: 'v3', auth });
  const fileMetadata = { name: fileName, parents: [folderId] };
  const media = { mimeType: mimeType, body: Readable.from(buffer) };

  try {
    const file = await drive.files.create({
      requestBody: fileMetadata,
      media: media,
      fields: 'id, webViewLink, webContentLink',
      supportsAllDrives: true,
    });
    console.log(`Buffer subido a Drive exitosamente: ${fileName} (${file.data.id})`);
    return { id: file.data.id, webViewLink: file.data.webViewLink, webContentLink: file.data.webContentLink };
  } catch (error) {
    console.error('Error subiendo buffer a Google Drive:', error);
    throw error;
  }
};

export const resolvePathAndUploadBuffer = async (buffer: Buffer, fileName: string, mimeType: string, rootFolderId: string, pathFolders: string[]) => {
  let currentParentId = rootFolderId;
  for (const folderName of pathFolders) {
    const cleanName = folderName.replace(/[\/\\]/g, '-').trim() || 'General';
    currentParentId = await getOrCreateDriveFolder(currentParentId, cleanName);
  }
  return uploadBufferToDrive(buffer, fileName, mimeType, currentParentId);
};

export const downloadBufferFromDrive = async (fileId: string): Promise<Buffer> => {
  if (!auth) throw new Error('Google Drive no está configurado (Faltan credenciales).');
  const drive = google.drive({ version: 'v3', auth });

  try {
    const response = await drive.files.get(
      { fileId: fileId, alt: 'media' },
      { responseType: 'arraybuffer' }
    );
    return Buffer.from(response.data as ArrayBuffer);
  } catch (error) {
    console.error(`Error descargando archivo ${fileId} de Google Drive:`, error);
    throw error;
  }
};
