/**
 * Cloud Sync Service: Real-time Firestore synchronization for DepEd School Profiles,
 * Clusters, and Personnel across multiple devices and browsers.
 * 
 * Local-First Architecture:
 * Reads and rapid operations use IndexedDB (Dexie) for zero-latency offline operation.
 * Mutations are automatically queued and synced to Firestore in real-time.
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
import { firebaseApp } from '../config/googleAuth';
import firebaseConfigJson from '../../firebase-applet-config.json';
import { db, addAuditLog } from '../db/dexie';
import { School, Personnel, SyncQueueItem, AuditLog } from '../types';

// Safely initialize Firestore with the provisioned database ID
const dbId = (firebaseConfigJson as { firestoreDatabaseId?: string }).firestoreDatabaseId;
export const firestoreDb = getFirestore(firebaseApp, dbId || undefined);

/**
 * Health check on app startup (as required by Firestore integration best practices)
 */
export async function testFirestoreConnection(): Promise<boolean> {
  try {
    await getDocFromServer(doc(firestoreDb, 'test', 'connection'));
    return true;
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes('the client is offline')) {
      console.warn('Firestore client is currently offline. Operating in local-first mode.');
    }
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
    }

    if (item.table === 'personnel') {
      const payload = item.payload as Partial<Personnel>;
      const id = payload?.id;
      if (!id) return true;

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
    }

    if (item.table === 'audit_logs') {
      const payload = item.payload as Partial<AuditLog>;
      const id = payload?.id;
      if (id) {
        const clean = sanitizeForFirestore({
          ...payload,
          id: String(id),
        });
        await setDoc(doc(firestoreDb, 'audit_logs', String(id)), clean, { merge: true });
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
 * Automatically synchronizes cloud schools into local IndexedDB and triggers listener callback.
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

        // Mirror cloud schools into local IndexedDB cache
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
 * Particularly useful for Superadmin monitoring Division-wide roster updates.
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

        // Mirror cloud personnel into local IndexedDB cache
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
 * Publish all local school profiles and personnel to the Firestore cloud database
 * so other computers/browsers in the Division immediately see them.
 */
export async function publishAllLocalToCloud(): Promise<{ schoolsSynced: number; personnelSynced: number }> {
  let schoolsSynced = 0;
  let personnelSynced = 0;

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

    if (schoolsSynced > 0 || personnelSynced > 0) {
      await addAuditLog(
        'Cloud Sync Engine',
        'System',
        'CLOUD_SYNC',
        'FULL_PUBLISH',
        `Published ${schoolsSynced} schools and ${personnelSynced} personnel records to Division Cloud.`
      );
    }
  } catch (err) {
    console.error('Failed to publish local records to cloud:', err);
  }

  return { schoolsSynced, personnelSynced };
}

/**
 * Pull all schools and personnel from Firestore into local IndexedDB
 */
export async function pullAllCloudData(): Promise<{ schoolsCount: number; personnelCount: number }> {
  let schoolsCount = 0;
  let personnelCount = 0;

  try {
    const [schoolsSnap, personnelSnap] = await Promise.all([
      getDocs(collection(firestoreDb, 'schools')),
      getDocs(collection(firestoreDb, 'personnel')),
    ]);

    const cloudSchools: School[] = [];
    schoolsSnap.forEach((d) => {
      cloudSchools.push(d.data() as School);
    });

    const cloudPersonnel: Personnel[] = [];
    personnelSnap.forEach((d) => {
      cloudPersonnel.push(d.data() as Personnel);
    });

    if (cloudSchools.length > 0) {
      await db.schools.bulkPut(cloudSchools);
      schoolsCount = cloudSchools.length;
    }

    if (cloudPersonnel.length > 0) {
      await db.personnel.bulkPut(cloudPersonnel);
      personnelCount = cloudPersonnel.length;
    }
  } catch (err) {
    console.warn('Failed to pull cloud data into local database:', err);
  }

  return { schoolsCount, personnelCount };
}
