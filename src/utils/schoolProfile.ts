import { School, SchoolProfile } from '../types';
import { db, queueSync, addAuditLog } from '../db/dexie';

export const SCHOOL_PROFILE_STORAGE_KEY = 'deped_school_station_profile_v2';

export const EMPTY_SCHOOL_PROFILE: SchoolProfile = {
  schoolId: '',
  schoolName: '',
  district: '',
  division: '',
  region: '',
  schoolHeadName: '',
  schoolHeadPosition: '',
  address: '',
  contactEmail: '',
  contactNumber: '',
};

export const DEFAULT_SCHOOL_PROFILE: SchoolProfile = EMPTY_SCHOOL_PROFILE;

export function hasConfiguredSchoolProfile(profile: SchoolProfile): boolean {
  return Boolean(
    profile &&
      profile.schoolName?.trim() &&
      profile.schoolId?.trim() &&
      profile.schoolHeadName?.trim()
  );
}

export function getStoredSchoolProfile(): SchoolProfile {
  try {
    const raw =
      localStorage.getItem(SCHOOL_PROFILE_STORAGE_KEY) ||
      localStorage.getItem('deped_school_station_profile_v1');

    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        const result: SchoolProfile = {
          ...EMPTY_SCHOOL_PROFILE,
          ...parsed,
        };
        // If loaded from legacy v1 key, upgrade seamlessly to current key
        if (!localStorage.getItem(SCHOOL_PROFILE_STORAGE_KEY) && hasConfiguredSchoolProfile(result)) {
          try {
            localStorage.setItem(SCHOOL_PROFILE_STORAGE_KEY, JSON.stringify(result));
          } catch {
            // ignore
          }
        }
        return result;
      }
    }
  } catch (err) {
    console.warn('Failed to parse stored school profile:', err);
  }
  return EMPTY_SCHOOL_PROFILE;
}

/**
 * Robust async loader that checks both localStorage and IndexedDB (Dexie).
 * Guarantees school profile data persists permanently across updates and republications.
 */
export async function loadPersistedSchoolProfile(): Promise<SchoolProfile> {
  const localProfile = getStoredSchoolProfile();
  if (hasConfiguredSchoolProfile(localProfile)) {
    return localProfile;
  }

  try {
    const schools = await db.schools.toArray();
    if (schools.length > 0) {
      const primary = schools.find((s) => s.isPrimary) || schools[0];
      if (primary && primary.name?.trim()) {
        const recovered: SchoolProfile = {
          schoolId: primary.id || '',
          schoolName: primary.name || '',
          district: primary.district || '',
          division: primary.division || '',
          region: primary.region || '',
          schoolHeadName: primary.schoolHeadName || '',
          schoolHeadPosition: primary.schoolHeadPosition || '',
          address: primary.address || '',
          contactEmail: primary.contactEmail || '',
          contactNumber: primary.contactNumber || '',
        };
        // Re-persist to localStorage for immediate synchronous reads
        try {
          localStorage.setItem(SCHOOL_PROFILE_STORAGE_KEY, JSON.stringify(recovered));
        } catch {
          // ignore
        }
        return recovered;
      }
    }
  } catch (err) {
    console.warn('Failed to recover school profile from IndexedDB:', err);
  }

  return localProfile;
}

export async function saveStoredSchoolProfile(
  profile: SchoolProfile,
  actor = 'AO II'
): Promise<void> {
  try {
    localStorage.setItem(SCHOOL_PROFILE_STORAGE_KEY, JSON.stringify(profile));

    // Also persist into Dexie schools table as the primary school station
    const schoolRecord: School = {
      id: profile.schoolId,
      name: profile.schoolName,
      district: profile.district,
      division: profile.division,
      region: profile.region,
      schoolHeadName: profile.schoolHeadName,
      schoolHeadPosition: profile.schoolHeadPosition,
      address: profile.address,
      contactEmail: profile.contactEmail,
      contactNumber: profile.contactNumber,
      isPrimary: true,
    };

    await db.schools.put(schoolRecord);
    await queueSync('schools', 'UPDATE', schoolRecord);
    await addAuditLog(
      actor,
      'AO II',
      'SCHOOL_CONFIG',
      'UPDATE_SCHOOL_PROFILE',
      `Updated school station profile: ${profile.schoolName} (ID: ${profile.schoolId}) - Head: ${profile.schoolHeadName}`
    );
  } catch (err) {
    console.error('Failed to save school profile to storage:', err);
    throw err;
  }
}
