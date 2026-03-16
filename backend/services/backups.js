// Backup report integration for Atlas UI
import fs from 'fs/promises';

const BACKUP_REPORT_PATH = process.env.BACKUP_REPORT_PATH || '/srv/atlas/ansible/inventory/backup_report.json';
const STALE_HOURS = 36; // Backups older than this are considered stale

export async function getBackupReport() {
  try {
    const data = await fs.readFile(BACKUP_REPORT_PATH, 'utf-8');
    const report = JSON.parse(data);
    return report.hosts || [];
  } catch (error) {
    console.error('Backup report error:', error.message);
    return [];
  }
}

export async function getBackupSummary() {
  try {
    const hosts = await getBackupReport();
    
    if (hosts.length === 0) {
      return {
        total: 0,
        ok: 0,
        stale: 0,
        status: 'unknown'
      };
    }

    const ok = hosts.filter(h => h.status === 'OK' && h.age_hours < STALE_HOURS).length;
    const stale = hosts.filter(h => h.age_hours >= STALE_HOURS).length;
    const failed = hosts.filter(h => h.status !== 'OK').length;
    
    let status = 'healthy';
    if (failed > 0) status = 'degraded';
    else if (stale > 0) status = 'warning';

    return {
      total: hosts.length,
      ok,
      stale,
      failed,
      status
    };
  } catch (error) {
    console.error('Backup summary error:', error.message);
    return {
      total: 0,
      ok: 0,
      stale: 0,
      status: 'error'
    };
  }
}
