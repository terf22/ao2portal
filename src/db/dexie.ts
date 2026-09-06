import Dexie, { type Table } from 'dexie';
import {
  AuditCategory,
  AuditLog,
  AuditSeverity,
  Personnel,
  School,
  SyncQueueItem,
  User,
} from '../types';

export class AOIIDatabase extends Dexie {
  users!: Table<User>;
  schools!: Table<School>;
  personnel!: Table<Personnel>;
  auditLogs!: Table<AuditLog>;
  syncQueue!: Table<SyncQueueItem>;

  constructor() {
    super('AOIIDatabase');
    this.version(1).stores({
      personnel: 'id, lastName, positionTitle, schoolStation, updatedAt',
      auditLogs: 'id, timestamp, category, severity',
      syncQueue: '++id, table, action, timestamp',
    });
    this.version(2).stores({
      users: 'id, username, role',
      schools: 'id, name, district',
      personnel: 'id, lastName, positionTitle, schoolId, schoolStation, updatedAt',
      auditLogs: 'id, timestamp, category, severity',
      syncQueue: '++id, table, action, timestamp',
    });
  }
}

export const db = new AOIIDatabase();

export const DEFAULT_SCHOOLS: School[] = [];

export const DEFAULT_USERS: User[] = [
  {
    id: 'superadmin_id',
    username: 'superadmin',
    passwordHash: '8c6976e5b5410415bde908bd4dee15dfb167a9c873fc4bb8a81f6f2ab448a918', // 'admin' sha256
    fullName: 'Division Superintendent Office',
    role: 'Superadmin',
  },
  {
    id: 'aoii_id',
    username: 'ao2_cluster',
    passwordHash: '5e884898da28047151d0e56f8dc6292773603d0d6aabbdd62a11ef721d1542d8', // 'password' sha256
    fullName: 'Administrative Officer II',
    role: 'AO II',
  },
];

export async function addAuditLog(
  actor: string,
  role: string,
  category: AuditCategory,
  action: string,
  details: string,
  severity: AuditSeverity = 'INFO'
): Promise<string> {
  const log: AuditLog = {
    id: `LOG-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    timestamp: new Date().toISOString(),
    actor,
    role,
    category,
    action,
    details,
    severity,
  };
  try {
    await db.auditLogs.add(log);
  } catch (err) {
    console.error('Failed to log audit action:', err);
  }
  return log.id;
}

export async function enqueueSync(
  table: 'personnel' | 'audit_logs' | 'schools' | 'users',
  action: 'INSERT' | 'UPDATE' | 'DELETE',
  payload: Record<string, unknown> | Personnel | AuditLog | School | User | unknown
): Promise<void> {
  try {
    await db.syncQueue.add({
      table,
      action,
      payload,
      timestamp: Date.now(),
    });
  } catch (err) {
    console.error('Failed to enqueue sync item:', err);
  }
}

export async function purgeSampleData(): Promise<void> {
  // Never clear existing user data on app startup or republishing.
  // This guarantees that all personnel, school profiles, attendance logs,
  // and audit trails persist permanently across deployments and reloads.
}

export async function clearAllDatabaseData(): Promise<void> {
  await db.personnel.clear();
  await db.schools.clear();
  await db.auditLogs.clear();
  await db.syncQueue.clear();
}

export async function seedDatabaseIfEmpty(): Promise<boolean> {
  // Request persistent storage from browser to prevent eviction
  if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.persist) {
    try {
      await navigator.storage.persist();
    } catch {
      // Non-critical, ignore if unsupported
    }
  }

  // If any default schools were specified, seed only if table is empty
  if (DEFAULT_SCHOOLS.length > 0) {
    try {
      const schoolCount = await db.schools.count();
      if (schoolCount === 0) {
        await db.schools.bulkAdd(DEFAULT_SCHOOLS);
      }
    } catch (err) {
      console.warn('Error checking/seeding schools table:', err);
    }
  }

  // Ensure default authentication users exist in Dexie only if empty
  try {
    const userCount = await db.users.count();
    if (userCount === 0) {
      await db.users.bulkAdd(DEFAULT_USERS);
    }
  } catch (err) {
    console.warn('Error checking/seeding users table:', err);
  }

  return true;
}

export async function resetDatabaseWithSampleData(): Promise<void> {
  await clearAllDatabaseData();
}

export async function clearAllPersonnelData(): Promise<void> {
  await db.personnel.clear();
}

export const queueSync = enqueueSync;
export const initializeDatabaseWithSamples = seedDatabaseIfEmpty;

export async function getAuditLogs(limitCount = 200): Promise<AuditLog[]> {
  try {
    return await db.auditLogs.orderBy('timestamp').reverse().limit(limitCount).toArray();
  } catch (err) {
    console.error('Failed to get audit logs:', err);
    return [];
  }
}
