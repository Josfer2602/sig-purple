import { runFullBackup } from './services/backupService';
runFullBackup().then(r => console.log('Backup Success:', r)).catch(console.error);
