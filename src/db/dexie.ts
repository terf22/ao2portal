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
    this.version(3).stores({
      users: 'id, username, role, status',
      schools: 'id, name, district',
      personnel: 'id, lastName, positionTitle, schoolId, schoolStation, updatedAt',
      auditLogs: 'id, timestamp, category, severity',
      syncQueue: '++id, table, action, timestamp',
    });
  }
}

export const db = new AOIIDatabase();

export const DEFAULT_USERS: User[] = [
  {
    id: 'user_superadmin_default',
    username: 'superadmin',
    passwordHash: 'ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f', // password123
    fullName: 'Division IT & Systems Superadmin',
    role: 'Superadmin',
    status: 'ACTIVE',
    email: 'superadmin@deped.gov.ph',
    schoolStation: 'Division Office - Zamboanga City',
    createdAt: '2026-01-01T00:00:00.000Z',
  },
];

export const DEFAULT_SCHOOLS: School[] = [
  {
    id: '123456',
    name: 'Zamboanga Central School',
    district: 'Zamboanga Central',
    division: 'Division of Zamboanga City',
    region: 'Region IX (Zamboanga Peninsula)',
    schoolHeadName: 'School Head / Principal IV',
    schoolHeadPosition: 'Principal IV',
    address: 'Zamboanga City, Region IX',
    isPrimary: true,
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

  // Seed default authentication users if not already present
  // Clean up any deprecated preconfigured sample accounts (e.g. ao2_admin, principal)
  try {
    const deprecatedUsernames = ['ao2_admin', 'principal'];
    const deprecatedIds = ['user_ao2_default', 'user_schoolhead_default'];
    const usersToClean = await db.users
      .filter((u) => deprecatedUsernames.includes(u.username) || deprecatedIds.includes(u.id))
      .toArray();
    for (const u of usersToClean) {
      await db.users.delete(u.id);
    }
  } catch (err) {
    console.warn('Error purging deprecated preconfigured users:', err);
  }

  // Ensure default superadmin exists and is ACTIVE
  for (const defaultUser of DEFAULT_USERS) {
    try {
      const existing = await db.users.where('username').equals(defaultUser.username).first();
      if (!existing) {
        await db.users.add(defaultUser);
      } else {
        // Enforce superadmin ACTIVE status and role
        if (existing.status !== 'ACTIVE' || !existing.passwordHash || existing.role !== 'Superadmin') {
          await db.users.put({
            ...existing,
            role: 'Superadmin',
            status: 'ACTIVE',
            passwordHash: existing.passwordHash || defaultUser.passwordHash,
          });
        }
      }
    } catch (err) {
      console.warn('Error checking/seeding user table for:', defaultUser.username, err);
    }
  }

  // Ensure any other existing users have a defined status (default to PENDING if missing)
  try {
    const allUsers = await db.users.toArray();
    for (const user of allUsers) {
      if (!user.status) {
        const isSuper = user.username === 'superadmin' || user.role === 'Superadmin';
        await db.users.put({
          ...user,
          status: isSuper ? 'ACTIVE' : 'PENDING',
        });
      }
    }
  } catch (err) {
    console.warn('Error verifying user account statuses:', err);
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
