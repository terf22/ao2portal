/**
 * Cloud Sync Service: Real-time Firestore synchronization and administration
 * for DepEd School Profiles, Clusters, Personnel, Announcements, and Audit Logs.
 * 
 * Local-First Architecture:
 * - Offline-first IndexedDB (Dexie) for zero-latency local operations.
 * - Real-time sync & cloud governance via Firestore.
 * - Comprehensive administrative deletion tooling for Superadmin.
 */

import {
  getFirestore,
  doc,
  setDoc,
  deleteDoc,
  getDocs,
  collection,
  onSnapshot,
  getDocFromServer,
  writeBatch,
  Unsubscribe,
} from 'firebase/firestore';
import { firebaseApp, auth } from '../config/googleAuth';
import firebaseConfigJson from '../../firebase-applet-config.json';
import { db, addAuditLog } from '../db/dexie';
import { School, Personnel, SyncQueueItem, AuditLog, Announcement } from '../types';

// Safely initialize Firestore with the provisioned database ID
const dbId = (firebaseConfigJson as { firestoreDatabaseId?: string }).firestoreDatabaseId;
export const firestoreDb = getFirestore(firebaseApp, dbId || undefined);

export enum OperationType {
  CREATE = 'create',
  READ = 'read',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  BATCH = 'batch',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map((p) => ({
        providerId: p.providerId,
        email: p.email,
      })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

/**
 * Health check on app startup
 */
export async function testFirestoreConnection(): Promise<boolean> {
  const path = 'test/connection';
  try {
    await getDocFromServer(doc(firestoreDb, 'test', 'connection'));
    return true;
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes('the client is offline')) {
      console.warn('Firestore client is currently offline. Operating in local-first mode.');
      return false;
    }
    // Non-fatal warning on health check
    console.warn('Firestore connection health check returned notice:', err);
    return false;
  }
}

/**
 * Clean object by stripping undefined keys which Firestore rejects
 */
function sanitizeForFirestore<T extends Record<string, unknown>>(obj: T): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) {
      result[key] = value;
    }
  }
  return result;
}

/**
 * Sync a single queued mutation item to Firestore
 */
export async function syncQueueItemToFirestore(item: SyncQueueItem): Promise<boolean> {
  try {
    if (item.table === 'schools') {
      const payload = item.payload as Partial<School>;
      const id = payload?.id;
      if (!id) return true;

      const path = `schools/${id}`;
      try {
        if (item.action === 'DELETE') {
          await deleteDoc(doc(firestoreDb, 'schools', String(id)));
        } else {
          const clean = sanitizeForFirestore({
            id: String(id),
            name: payload.name || '',
            district: payload.district || '',
            division: payload.division || '',
            region: payload.region || '',
            schoolHeadName: payload.schoolHeadName || '',
            schoolHeadPosition: payload.schoolHeadPosition || '',
            address: payload.address || '',
            contactEmail: payload.contactEmail || '',
            contactNumber: payload.contactNumber || '',
            isPrimary: !!payload.isPrimary,
            updatedAt: new Date().toISOString(),
          });
          await setDoc(doc(firestoreDb, 'schools', String(id)), clean, { merge: true });
        }
        return true;
      } catch (err) {
        handleFirestoreError(err, item.action === 'DELETE' ? OperationType.DELETE : OperationType.WRITE, path);
      }
    }

    if (item.table === 'personnel') {
      const payload = item.payload as Partial<Personnel>;
      const id = payload?.id;
      if (!id) return true;

      const path = `personnel/${id}`;
      try {
        if (item.action === 'DELETE') {
          await deleteDoc(doc(firestoreDb, 'personnel', String(id)));
        } else {
          const clean = sanitizeForFirestore({
            ...payload,
            id: String(id),
            updatedAt: new Date().toISOString(),
          });
          await setDoc(doc(firestoreDb, 'personnel', String(id)), clean, { merge: true });
        }
        return true;
      } catch (err) {
        handleFirestoreError(err, item.action === 'DELETE' ? OperationType.DELETE : OperationType.WRITE, path);
      }
    }

    if (item.table === 'audit_logs') {
      const payload = item.payload as Partial<AuditLog>;
      const id = payload?.id;
      if (id) {
        const path = `audit_logs/${id}`;
        try {
          const clean = sanitizeForFirestore({
            ...payload,
            id: String(id),
          });
          await setDoc(doc(firestoreDb, 'audit_logs', String(id)), clean, { merge: true });
        } catch (err) {
          handleFirestoreError(err, OperationType.WRITE, path);
        }
      }
      return true;
    }

    return true;
  } catch (err) {
    console.warn(`Failed to sync ${item.table} item (${item.id}) to Firestore:`, err);
    throw err;
  }
}

/**
 * Subscribe in real-time to all schools registered in the Division.
 */
export function subscribeToCloudSchools(
  onSchoolsUpdated: (schools: School[]) => void
): Unsubscribe {
  try {
    const schoolsCol = collection(firestoreDb, 'schools');
    return onSnapshot(
      schoolsCol,
      async (snapshot) => {
        const schoolsList: School[] = [];
        snapshot.forEach((d) => {
          const data = d.data() as School;
          schoolsList.push(data);
        });

        if (schoolsList.length > 0) {
          try {
            await db.schools.bulkPut(schoolsList);
          } catch (cacheErr) {
            console.warn('Error caching cloud schools in local IndexedDB:', cacheErr);
          }
        }

        onSchoolsUpdated(schoolsList);
      },
      (error) => {
        console.warn('Real-time cloud schools subscription notice:', error.message);
      }
    );
  } catch (err) {
    console.warn('Failed to attach real-time cloud schools subscription:', err);
    return () => {};
  }
}

/**
 * Subscribe in real-time to personnel records.
 */
export function subscribeToCloudPersonnel(
  onPersonnelUpdated: (personnel: Personnel[]) => void
): Unsubscribe {
  try {
    const personnelCol = collection(firestoreDb, 'personnel');
    return onSnapshot(
      personnelCol,
      async (snapshot) => {
        const list: Personnel[] = [];
        snapshot.forEach((d) => {
          const data = d.data() as Personnel;
          list.push(data);
        });

        if (list.length > 0) {
          try {
            await db.personnel.bulkPut(list);
          } catch (cacheErr) {
            console.warn('Error caching cloud personnel in local IndexedDB:', cacheErr);
          }
        }

        onPersonnelUpdated(list);
      },
      (error) => {
        console.warn('Real-time cloud personnel subscription notice:', error.message);
      }
    );
  } catch (err) {
    console.warn('Failed to attach real-time cloud personnel subscription:', err);
    return () => {};
  }
}

/**
 * Publish all local school profiles, personnel, and announcements to the Firestore cloud database
 */
export async function publishAllLocalToCloud(): Promise<{
  schoolsSynced: number;
  personnelSynced: number;
  announcementsSynced: number;
}> {
  let schoolsSynced = 0;
  let personnelSynced = 0;
  let announcementsSynced = 0;

  try {
    const localSchools = await db.schools.toArray();
    for (const school of localSchools) {
      if (school.id && school.name) {
        const clean = sanitizeForFirestore({
          id: String(school.id),
          name: school.name,
          district: school.district || '',
          division: school.division || '',
          region: school.region || '',
          schoolHeadName: school.schoolHeadName || '',
          schoolHeadPosition: school.schoolHeadPosition || '',
          address: school.address || '',
          contactEmail: school.contactEmail || '',
          contactNumber: school.contactNumber || '',
          isPrimary: !!school.isPrimary,
          updatedAt: new Date().toISOString(),
        });
        await setDoc(doc(firestoreDb, 'schools', String(school.id)), clean, { merge: true });
        schoolsSynced++;
      }
    }

    const localPersonnel = await db.personnel.toArray();
    for (const p of localPersonnel) {
      if (p.id) {
        const clean = sanitizeForFirestore({
          ...p,
          id: String(p.id),
          updatedAt: new Date().toISOString(),
        });
        await setDoc(doc(firestoreDb, 'personnel', String(p.id)), clean, { merge: true });
        personnelSynced++;
      }
    }

    const localAnnouncements = await db.announcements.toArray();
    for (const a of localAnnouncements) {
      if (a.id) {
        const clean = sanitizeForFirestore({
          ...a,
          id: String(a.id),
        });
        await setDoc(doc(firestoreDb, 'announcements', String(a.id)), clean, { merge: true });
        announcementsSynced++;
      }
    }

    if (schoolsSynced > 0 || personnelSynced > 0 || announcementsSynced > 0) {
      await addAuditLog(
        'Cloud Sync Engine',
        'System',
        'CLOUD_SYNC',
        'FULL_PUBLISH',
        `Published ${schoolsSynced} schools, ${personnelSynced} personnel, and ${announcementsSynced} announcements to Division Cloud.`
      );
    }
  } catch (err) {
    console.error('Failed to publish local records to cloud:', err);
    throw err;
  }

  return { schoolsSynced, personnelSynced, announcementsSynced };
}

/**
 * Pull all schools, personnel, and announcements from Firestore into local IndexedDB
 */
export async function pullAllCloudData(): Promise<{
  schoolsCount: number;
  personnelCount: number;
  announcementsCount: number;
}> {
  let schoolsCount = 0;
  let personnelCount = 0;
  let announcementsCount = 0;

  try {
    const [schoolsSnap, personnelSnap, annSnap] = await Promise.all([
      getDocs(collection(firestoreDb, 'schools')),
      getDocs(collection(firestoreDb, 'personnel')),
      getDocs(collection(firestoreDb, 'announcements')),
    ]);

    const cloudSchools: School[] = [];
    schoolsSnap.forEach((d) => {
      cloudSchools.push(d.data() as School);
    });

    const cloudPersonnel: Personnel[] = [];
    personnelSnap.forEach((d) => {
      cloudPersonnel.push(d.data() as Personnel);
    });

    const cloudAnn: Announcement[] = [];
    annSnap.forEach((d) => {
      cloudAnn.push(d.data() as Announcement);
    });

    if (cloudSchools.length > 0) {
      await db.schools.bulkPut(cloudSchools);
      schoolsCount = cloudSchools.length;
    }

    if (cloudPersonnel.length > 0) {
      await db.personnel.bulkPut(cloudPersonnel);
      personnelCount = cloudPersonnel.length;
    }

    if (cloudAnn.length > 0) {
      await db.announcements.bulkPut(cloudAnn);
      announcementsCount = cloudAnn.length;
    }
  } catch (err) {
    console.warn('Failed to pull cloud data into local database:', err);
  }

  return { schoolsCount, personnelCount, announcementsCount };
}

// =========================================================================
// SUPERADMIN FIREBASE CLOUD DELETION & PURGE OPERATIONS
// =========================================================================

export type CloudCollectionType = 'personnel' | 'schools' | 'announcements' | 'audit_logs';

export interface CloudRecordSummary {
  id: string;
  title: string;
  subtitle: string;
  updatedAt?: string;
  raw: Record<string, unknown>;
}

export interface CloudCollectionMetrics {
  personnel: number;
  schools: number;
  announcements: number;
  audit_logs: number;
}

/**
 * Query live document counts across all cloud collections in Firestore
 */
export async function fetchCloudMetrics(): Promise<CloudCollectionMetrics> {
  const metrics: CloudCollectionMetrics = {
    personnel: 0,
    schools: 0,
    announcements: 0,
    audit_logs: 0,
  };

  try {
    const [pSnap, sSnap, aSnap, lSnap] = await Promise.all([
      getDocs(collection(firestoreDb, 'personnel')),
      getDocs(collection(firestoreDb, 'schools')),
      getDocs(collection(firestoreDb, 'announcements')),
      getDocs(collection(firestoreDb, 'audit_logs')),
    ]);

    metrics.personnel = pSnap.size;
    metrics.schools = sSnap.size;
    metrics.announcements = aSnap.size;
    metrics.audit_logs = lSnap.size;
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, 'collections_count');
  }

  return metrics;
}

/**
 * Fetch records from a specific cloud Firestore collection for inspection
 */
export async function fetchCloudCollectionRecords(
  coll: CloudCollectionType
): Promise<CloudRecordSummary[]> {
  try {
    const snap = await getDocs(collection(firestoreDb, coll));
    const records: CloudRecordSummary[] = [];

    snap.forEach((docSnap) => {
      const data = docSnap.data() as Record<string, unknown>;
      const id = docSnap.id;

      let title = id;
      let subtitle = '';
      const updatedAt = (data.updatedAt as string) || (data.timestamp as string) || (data.createdAt as string);

      if (coll === 'personnel') {
        const p = data as unknown as Personnel;
        title = `${p.lastName || ''}, ${p.firstName || ''} ${p.middleName || ''}`.trim() || (data.fullName as string) || id;
        subtitle = `${p.positionTitle || 'Staff'} • SG-${p.salaryGrade || 0} • ${p.schoolStation || 'Station Unassigned'}`;
      } else if (coll === 'schools') {
        const s = data as unknown as School;
        title = s.name || `School ID: ${id}`;
        subtitle = `${s.district || 'District N/A'} • Head: ${s.schoolHeadName || 'Unassigned'}`;
      } else if (coll === 'announcements') {
        const a = data as unknown as Announcement;
        title = a.title || 'Untitled Circular';
        subtitle = `Target: ${a.targetRole || 'ALL'} • Priority: ${a.priority || 'NORMAL'} • By: ${a.author || 'Admin'}`;
      } else if (coll === 'audit_logs') {
        const l = data as unknown as AuditLog;
        title = `[${l.category || 'LOG'}] ${l.action || 'EVENT'}`;
        subtitle = `${l.actor || 'System'} (${l.role || ''}) • ${l.details || ''}`;
      }

      records.push({
        id,
        title,
        subtitle,
        updatedAt,
        raw: data,
      });
    });

    return records;
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, coll);
  }
}

/**
 * Delete a specific individual document from Firebase Firestore
 */
export async function deleteCloudDocument(
  coll: CloudCollectionType,
  docId: string,
  operatorUsername: string = 'Superadmin',
  deleteFromLocal: boolean = false
): Promise<boolean> {
  const path = `${coll}/${docId}`;
  try {
    await deleteDoc(doc(firestoreDb, coll, docId));

    // Optionally also purge from local IndexedDB cache
    if (deleteFromLocal) {
      try {
        if (coll === 'personnel') await db.personnel.delete(docId);
        else if (coll === 'schools') await db.schools.delete(docId);
        else if (coll === 'announcements') await db.announcements.delete(docId);
        else if (coll === 'audit_logs') await db.auditLogs.delete(docId);
      } catch (localErr) {
        console.warn('Local mirror deletion note:', localErr);
      }
    }

    await addAuditLog(
      operatorUsername,
      'Superadmin',
      'SECURITY',
      'CLOUD_DOC_DELETE',
      `Permanently deleted document "${docId}" from Firestore collection "${coll}" (Local purge: ${deleteFromLocal}).`,
      'CRITICAL'
    );

    return true;
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

/**
 * Delete multiple specific documents from a Firebase Firestore collection in batches
 */
export async function deleteMultipleCloudDocuments(
  coll: CloudCollectionType,
  docIds: string[],
  operatorUsername: string = 'Superadmin',
  deleteFromLocal: boolean = true
): Promise<number> {
  if (!docIds || docIds.length === 0) return 0;
  let deletedCount = 0;
  const path = coll;

  try {
    const chunkSize = 400;
    for (let i = 0; i < docIds.length; i += chunkSize) {
      const chunk = docIds.slice(i, i + chunkSize);
      const batch = writeBatch(firestoreDb);
      for (const id of chunk) {
        batch.delete(doc(firestoreDb, coll, id));
      }
      await batch.commit();
      deletedCount += chunk.length;
    }

    if (deleteFromLocal) {
      try {
        if (coll === 'personnel') await db.personnel.bulkDelete(docIds);
        else if (coll === 'schools') await db.schools.bulkDelete(docIds);
        else if (coll === 'announcements') await db.announcements.bulkDelete(docIds);
        else if (coll === 'audit_logs') await db.auditLogs.bulkDelete(docIds);
      } catch (localErr) {
        console.warn('Local mirror multi-deletion note:', localErr);
      }
    }

    await addAuditLog(
      operatorUsername,
      'Superadmin',
      'SECURITY',
      'CLOUD_MULTI_DOC_DELETE',
      `Superadmin batch-deleted ${deletedCount} documents from Firestore collection "${coll}" (Local purge: ${deleteFromLocal}).`,
      'CRITICAL'
    );

    return deletedCount;
  } catch (err) {
    handleFirestoreError(err, OperationType.BATCH, path);
  }
}

/**
 * Purge all documents from a specific Firestore collection in batches
 */
export async function purgeCloudCollection(
  coll: CloudCollectionType,
  operatorUsername: string = 'Superadmin',
  purgeLocal: boolean = false
): Promise<number> {
  let deletedCount = 0;
  const path = coll;

  try {
    const snap = await getDocs(collection(firestoreDb, coll));
    if (snap.empty) return 0;

    // Batch delete in chunks of 400 (Firestore max batch limit is 500)
    const docs = snap.docs;
    const chunkSize = 400;

    for (let i = 0; i < docs.length; i += chunkSize) {
      const chunk = docs.slice(i, i + chunkSize);
      const batch = writeBatch(firestoreDb);
      for (const d of chunk) {
        batch.delete(d.ref);
      }
      await batch.commit();
      deletedCount += chunk.length;
    }

    // Optionally wipe local IndexedDB table as well
    if (purgeLocal) {
      try {
        if (coll === 'personnel') await db.personnel.clear();
        else if (coll === 'schools') await db.schools.clear();
        else if (coll === 'announcements') await db.announcements.clear();
        else if (coll === 'audit_logs') await db.auditLogs.clear();
      } catch (localErr) {
        console.warn('Local collection clear note:', localErr);
      }
    }

    await addAuditLog(
      operatorUsername,
      'Superadmin',
      'SECURITY',
      'CLOUD_COLLECTION_PURGE',
      `Superadmin purged ${deletedCount} documents from Firestore collection "${coll}" (Purged local: ${purgeLocal}).`,
      'CRITICAL'
    );

    return deletedCount;
  } catch (err) {
    handleFirestoreError(err, OperationType.BATCH, path);
  }
}

/**
 * Purge ENTIRE Firebase cloud database across all collections (Factory Reset)
 */
export async function purgeEntireCloudDatabase(
  operatorUsername: string = 'Superadmin',
  purgeLocal: boolean = false
): Promise<{
  personnelDeleted: number;
  schoolsDeleted: number;
  announcementsDeleted: number;
  auditLogsDeleted: number;
}> {
  const result = {
    personnelDeleted: 0,
    schoolsDeleted: 0,
    announcementsDeleted: 0,
    auditLogsDeleted: 0,
  };

  try {
    result.personnelDeleted = await purgeCloudCollection('personnel', operatorUsername, purgeLocal);
    result.schoolsDeleted = await purgeCloudCollection('schools', operatorUsername, purgeLocal);
    result.announcementsDeleted = await purgeCloudCollection('announcements', operatorUsername, purgeLocal);
    result.auditLogsDeleted = await purgeCloudCollection('audit_logs', operatorUsername, purgeLocal);

    await addAuditLog(
      operatorUsername,
      'Superadmin',
      'SECURITY',
      'CLOUD_DATABASE_PURGE_ALL',
      `Complete Division Cloud wipe executed: ${result.personnelDeleted} personnel, ${result.schoolsDeleted} schools, ${result.announcementsDeleted} announcements, ${result.auditLogsDeleted} audit logs deleted from Firestore.`,
      'CRITICAL'
    );
  } catch (err) {
    console.error('Failed to purge complete cloud database:', err);
    throw err;
  }

  return result;
}
