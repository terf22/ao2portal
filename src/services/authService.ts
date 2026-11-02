import { db, addAuditLog } from '../db/dexie';
import { User, UserRole, UserSession } from '../types';
import { GoogleUserInfo, setCachedGoogleToken } from '../config/googleAuth';

export const AUTH_STORAGE_KEY = 'aoii_portal_auth_session';

/**
 * SHA-256 password hashing using Web Crypto API
 */
export async function hashPassword(plainText: string): Promise<string> {
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const encoder = new TextEncoder();
    const data = encoder.encode(plainText);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  // Simple deterministic fallback for non-crypto environments
  let hash = 0;
  for (let i = 0; i < plainText.length; i++) {
    const char = plainText.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return Math.abs(hash).toString(16).padStart(16, '0');
}

/**
 * Retrieve active user session from local storage
 */
export function getStoredSession(): UserSession | null {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && parsed.username) {
        return parsed as UserSession;
      }
    }
  } catch (err) {
    console.warn('Failed to parse auth session:', err);
  }
  return null;
}

/**
 * Save user session to local storage
 */
export function saveStoredSession(session: UserSession): void {
  try {
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session));
  } catch (err) {
    console.warn('Failed to persist auth session:', err);
  }
}

/**
 * Update current user session and persist to IndexedDB
 */
export async function updateUserSession(partial: Partial<UserSession>): Promise<UserSession | null> {
  const current = getStoredSession();
  if (!current) return null;
  const updated: UserSession = { ...current, ...partial };
  saveStoredSession(updated);

  try {
    const allUsers = await db.users.toArray();
    const existing = allUsers.find(
      (u) =>
        (updated.userId && u.id === updated.userId) ||
        u.username.toLowerCase() === updated.username.toLowerCase()
    );
    if (existing) {
      const updatedUser: User = {
        ...existing,
        fullName: updated.fullName ? updated.fullName.trim() : existing.fullName,
        email: updated.email !== undefined ? updated.email : existing.email,
        schoolStation: updated.schoolLocation !== undefined ? updated.schoolLocation : existing.schoolStation,
      };
      await db.users.put(updatedUser);
    }
  } catch (err) {
    console.warn('Could not update user record in IndexedDB:', err);
  }

  return updated;
}

/**
 * Clear user session (Sign Out)
 */
export async function clearStoredSession(actorName = 'User'): Promise<void> {
  try {
    localStorage.removeItem(AUTH_STORAGE_KEY);
    setCachedGoogleToken(null);
    await addAuditLog(actorName, 'Session', 'AUTH', 'USER_LOGOUT', 'User signed out from the portal');
  } catch (err) {
    console.warn('Error during logout:', err);
  }
}

/**
 * Login with username or email and password
 */
export async function loginWithCredentials(
  usernameOrEmail: string,
  plainPassword: string,
  schoolLocationDefault = ''
): Promise<UserSession> {
  const cleanId = usernameOrEmail.trim().toLowerCase();
  if (!cleanId || !plainPassword) {
    throw new Error('Please provide both username/email and password.');
  }

  const hashedPassword = await hashPassword(plainPassword);

  // Look up user in IndexedDB
  const allUsers = await db.users.toArray();
  const user = allUsers.find(
    (u) =>
      u.username.toLowerCase() === cleanId ||
      (u.email && u.email.toLowerCase() === cleanId)
  );

  if (!user) {
    throw new Error('Account not found. Please check your username or create a new account.');
  }

  // Check password if set
  if (user.passwordHash && user.passwordHash !== hashedPassword) {
    throw new Error('Incorrect password. Please try again.');
  }

  // Status checks: only ACTIVE users may log in
  const userStatus = user.status || (user.role === 'Superadmin' || user.username === 'superadmin' ? 'ACTIVE' : 'PENDING');

  if (userStatus === 'PENDING') {
    throw new Error(
      'Account Pending Approval: Your account registration has been submitted and is awaiting approval by the Division Superadmin. You will be able to log in once your registration is approved.'
    );
  }

  if (userStatus === 'SUSPENDED') {
    throw new Error(
      'Account Suspended: This account has been suspended by the administrator. Portal access is restricted.'
    );
  }

  if (userStatus === 'REJECTED') {
    throw new Error(
      `Account Registration Declined: ${user.rejectionReason ? user.rejectionReason : 'Your registration was rejected by the Superadmin. Please contact Division IT or your Cluster AO.'}`
    );
  }

  const session: UserSession = {
    userId: user.id,
    username: user.username,
    fullName: user.fullName || user.username,
    email: user.email || (user.username.includes('@') ? user.username : undefined),
    avatarUrl: user.avatarUrl,
    role: user.role || 'AO II',
    status: userStatus,
    schoolLocation: user.schoolStation || schoolLocationDefault || 'Station Assigned',
    ipAddress: '127.0.0.1',
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'Mozilla/5.0',
    loginTime: new Date().toLocaleTimeString('en-PH'),
    isGoogleLinked: !!user.isGoogleUser,
  };

  saveStoredSession(session);
  await addAuditLog(session.fullName || session.username, session.role, 'AUTH', 'USER_LOGIN', `Signed in via credentials (${session.username})`);

  return session;
}

export interface RegistrationOutcome {
  success: boolean;
  user: User;
  isPending: boolean;
  message: string;
}

/**
 * Register a new user account in IndexedDB
 * Newly registered accounts start with status = 'PENDING' awaiting Superadmin approval
 */
export async function registerNewAccount(details: {
  fullName: string;
  username: string;
  email?: string;
  password: string;
  role: UserRole;
  schoolStation?: string;
}): Promise<RegistrationOutcome> {
  const cleanUsername = details.username.trim().toLowerCase();
  const cleanEmail = details.email?.trim().toLowerCase() || (cleanUsername.includes('@') ? cleanUsername : undefined);

  if (!cleanUsername) {
    throw new Error('Please enter a valid username or email address.');
  }
  if (!details.fullName.trim()) {
    throw new Error('Please enter your full name.');
  }
  if (!details.password || details.password.length < 4) {
    throw new Error('Password must be at least 4 characters long.');
  }

  // Check for duplicate username in IndexedDB
  const allUsers = await db.users.toArray();
  const existing = allUsers.find(
    (u) =>
      u.username.toLowerCase() === cleanUsername ||
      (cleanEmail && u.email && u.email.toLowerCase() === cleanEmail)
  );

  if (existing) {
    throw new Error('An account with this username or email already exists. Please sign in instead.');
  }

  const hashedPassword = await hashPassword(details.password);
  const userId = `USER-${Date.now().toString(36).toUpperCase()}`;

  const newUser: User = {
    id: userId,
    username: cleanUsername,
    passwordHash: hashedPassword,
    fullName: details.fullName.trim(),
    role: details.role,
    status: 'PENDING',
    email: cleanEmail,
    schoolStation: details.schoolStation?.trim() || '',
    isGoogleUser: false,
    createdAt: new Date().toISOString(),
  };

  await db.users.add(newUser);

  await addAuditLog(
    newUser.fullName,
    newUser.role,
    'AUTH',
    'USER_REGISTERED_PENDING',
    `Registered new ${newUser.role} account (${newUser.username}) - Awaiting Superadmin approval`
  );

  return {
    success: true,
    user: newUser,
    isPending: true,
    message: `Account registered successfully for ${newUser.fullName}! Your account is pending Superadmin approval before you can sign in.`,
  };
}

/**
 * Fetch all registered accounts from IndexedDB
 */
export async function getAllRegisteredUsers(): Promise<User[]> {
  try {
    return await db.users.toArray();
  } catch (err) {
    console.error('Failed to load registered users:', err);
    return [];
  }
}

/**
 * Approve a pending user account
 */
export async function approveUserAccount(
  userId: string,
  actor: UserSession | string
): Promise<User> {
  const user = await db.users.get(userId);
  if (!user) throw new Error('User not found.');

  const actorName = typeof actor === 'string' ? actor : actor.fullName || actor.username;
  const actorRole = typeof actor === 'string' ? 'Superadmin' : actor.role;

  const updated: User = {
    ...user,
    status: 'ACTIVE',
    rejectionReason: undefined,
    approvedBy: actorName,
    approvedAt: new Date().toISOString(),
  };

  await db.users.put(updated);
  await addAuditLog(
    actorName,
    actorRole,
    'USER_MANAGEMENT',
    'USER_APPROVED',
    `Approved ${user.role} account for ${user.fullName} (${user.username})`,
    'INFO'
  );

  return updated;
}

/**
 * Reject a pending user account
 */
export async function rejectUserAccount(
  userId: string,
  reason: string,
  actor: UserSession | string
): Promise<User> {
  const user = await db.users.get(userId);
  if (!user) throw new Error('User not found.');

  const actorName = typeof actor === 'string' ? actor : actor.fullName || actor.username;
  const actorRole = typeof actor === 'string' ? 'Superadmin' : actor.role;

  const updated: User = {
    ...user,
    status: 'REJECTED',
    rejectionReason: reason || 'Registration declined by administrator',
  };

  await db.users.put(updated);
  await addAuditLog(
    actorName,
    actorRole,
    'USER_MANAGEMENT',
    'USER_REJECTED',
    `Rejected registration for ${user.fullName} (${user.username}). Reason: ${updated.rejectionReason}`,
    'WARNING'
  );

  return updated;
}

/**
 * Suspend an active user account
 */
export async function suspendUserAccount(
  userId: string,
  actor: UserSession | string,
  reason?: string
): Promise<User> {
  const user = await db.users.get(userId);
  if (!user) throw new Error('User not found.');
  if (user.username === 'superadmin') {
    throw new Error('The primary superadmin account cannot be suspended.');
  }

  const actorName = typeof actor === 'string' ? actor : actor.fullName || actor.username;
  const actorRole = typeof actor === 'string' ? 'Superadmin' : actor.role;

  const updated: User = {
    ...user,
    status: 'SUSPENDED',
    rejectionReason: reason || 'Account suspended by administrator',
  };

  await db.users.put(updated);
  await addAuditLog(
    actorName,
    actorRole,
    'USER_MANAGEMENT',
    'USER_SUSPENDED',
    `Suspended account for ${user.fullName} (${user.username})`,
    'WARNING'
  );

  return updated;
}

/**
 * Reactivate a suspended or rejected user account
 */
export async function reactivateUserAccount(
  userId: string,
  actor: UserSession | string
): Promise<User> {
  const user = await db.users.get(userId);
  if (!user) throw new Error('User not found.');

  const actorName = typeof actor === 'string' ? actor : actor.fullName || actor.username;
  const actorRole = typeof actor === 'string' ? 'Superadmin' : actor.role;

  const updated: User = {
    ...user,
    status: 'ACTIVE',
    rejectionReason: undefined,
  };

  await db.users.put(updated);
  await addAuditLog(
    actorName,
    actorRole,
    'USER_MANAGEMENT',
    'USER_REACTIVATED',
    `Reactivated account for ${user.fullName} (${user.username})`,
    'INFO'
  );

  return updated;
}

/**
 * Delete a user account permanently
 */
export async function deleteUserAccount(
  userId: string,
  actor: UserSession | string
): Promise<void> {
  const user = await db.users.get(userId);
  if (!user) throw new Error('User not found.');
  if (user.username === 'superadmin') {
    throw new Error('The primary superadmin account cannot be deleted.');
  }

  const actorName = typeof actor === 'string' ? actor : actor.fullName || actor.username;
  const actorRole = typeof actor === 'string' ? 'Superadmin' : actor.role;

  await db.users.delete(userId);
  await addAuditLog(
    actorName,
    actorRole,
    'USER_MANAGEMENT',
    'USER_DELETED',
    `Permanently deleted user account ${user.fullName} (${user.username})`,
    'WARNING'
  );
}

/**
 * Modify user role and assigned school station
 */
export async function updateUserRoleAndStation(
  userId: string,
  newRole: UserRole,
  newStation: string,
  actor: UserSession | string
): Promise<User> {
  const user = await db.users.get(userId);
  if (!user) throw new Error('User not found.');

  const actorName = typeof actor === 'string' ? actor : actor.fullName || actor.username;
  const actorRole = typeof actor === 'string' ? 'Superadmin' : actor.role;

  const updated: User = {
    ...user,
    role: newRole,
    schoolStation: newStation.trim(),
  };

  await db.users.put(updated);
  await addAuditLog(
    actorName,
    actorRole,
    'USER_MANAGEMENT',
    'USER_ROLE_UPDATED',
    `Updated ${user.fullName} role to ${newRole} & station to "${newStation}"`,
    'INFO'
  );

  return updated;
}

/**
 * Transfer personnel records and station assignment from one account to another
 * (e.g., when an AO or Principal resigns or is reassigned)
 */
export async function transferAccountData(
  params: {
    sourceUserId: string;
    targetUserId: string;
    transferStation: boolean;
    transferPersonnel: boolean;
    suspendSourceUser: boolean;
    remarks?: string;
  },
  actor: UserSession | string
): Promise<{ affectedPersonnel: number; sourceUser: User; targetUser: User }> {
  const { sourceUserId, targetUserId, transferStation, transferPersonnel, suspendSourceUser, remarks } = params;

  if (sourceUserId === targetUserId) {
    throw new Error('Source and destination accounts must be different.');
  }

  const sourceUser = await db.users.get(sourceUserId);
  const targetUser = await db.users.get(targetUserId);

  if (!sourceUser) throw new Error('Source account not found.');
  if (!targetUser) throw new Error('Target account not found.');

  const actorName = typeof actor === 'string' ? actor : actor.fullName || actor.username;
  const actorRole = typeof actor === 'string' ? 'Superadmin' : actor.role;

  let affectedPersonnel = 0;

  // 1. Inherit or reassign school station
  let updatedTargetUser: User = { ...targetUser };
  if (transferStation && sourceUser.schoolStation) {
    updatedTargetUser = {
      ...updatedTargetUser,
      schoolStation: sourceUser.schoolStation,
    };
    await db.users.put(updatedTargetUser);
  }

  // 2. Transfer / reassign personnel records
  if (transferPersonnel && sourceUser.schoolStation) {
    const sourceStationNorm = sourceUser.schoolStation.trim().toLowerCase();
    const allPersonnel = await db.personnel.toArray();
    const matching = allPersonnel.filter(
      (p) =>
        (p.schoolStation && p.schoolStation.trim().toLowerCase() === sourceStationNorm) ||
        (p.schoolId && sourceStationNorm.includes(p.schoolId))
    );

    // If destination has a distinct school station name, update records to reflect new handover
    const newStationName = updatedTargetUser.schoolStation || sourceUser.schoolStation;
    for (const p of matching) {
      const updatedP = {
        ...p,
        schoolStation: newStationName,
        updatedAt: Date.now(),
      };
      await db.personnel.put(updatedP);
      affectedPersonnel++;
    }
  }

  // 3. Optionally suspend source user (resigned/transferred)
  let updatedSourceUser: User = { ...sourceUser };
  if (suspendSourceUser && sourceUser.username !== 'superadmin') {
    updatedSourceUser = {
      ...updatedSourceUser,
      status: 'SUSPENDED',
      transferredTo: targetUser.id,
      transferredAt: new Date().toISOString(),
      rejectionReason: `Resigned / Relinquished station. Records transferred to ${targetUser.fullName} (${targetUser.username})`,
    };
    await db.users.put(updatedSourceUser);
  }

  // 4. Log detailed audit trail
  const details = `Transferred data from ${sourceUser.fullName} (${sourceUser.username}) to ${targetUser.fullName} (${targetUser.username}). Station Handover: ${transferStation ? 'Yes' : 'No'}. Personnel Handed Over: ${affectedPersonnel} records. Source Suspended: ${suspendSourceUser ? 'Yes' : 'No'}. Reason/Remarks: ${remarks || 'Personnel resignation/reassignment'}`;

  await addAuditLog(
    actorName,
    actorRole,
    'DATA_PORTABILITY',
    'ACCOUNT_DATA_TRANSFER',
    details,
    'CRITICAL'
  );

  return {
    affectedPersonnel,
    sourceUser: updatedSourceUser,
    targetUser: updatedTargetUser,
  };
}

/**
 * Authenticate or register with Google Account
 */
export async function authenticateWithGoogle(
  googleUser: GoogleUserInfo,
  accessToken: string,
  assignedRole: UserRole = 'AO II',
  schoolLocation = ''
): Promise<UserSession> {
  setCachedGoogleToken(accessToken);

  const cleanEmail = googleUser.email.toLowerCase();
  const allUsers = await db.users.toArray();

  let matchedUser = allUsers.find(
    (u) =>
      (u.email && u.email.toLowerCase() === cleanEmail) ||
      u.username.toLowerCase() === cleanEmail
  );

  if (!matchedUser) {
    // Register as new Google user in IndexedDB
    const userId = `GOOGLE-${Date.now().toString(36).toUpperCase()}`;
    matchedUser = {
      id: userId,
      username: cleanEmail,
      fullName: googleUser.name,
      email: cleanEmail,
      role: assignedRole,
      status: assignedRole === 'Superadmin' ? 'ACTIVE' : 'PENDING',
      avatarUrl: googleUser.picture,
      schoolStation: schoolLocation,
      isGoogleUser: true,
      createdAt: new Date().toISOString(),
    };
    await db.users.add(matchedUser);

    await addAuditLog(
      matchedUser.fullName,
      matchedUser.role,
      'AUTH',
      'USER_REGISTERED_GOOGLE',
      `Registered new user with Google account (${cleanEmail})`
    );
  } else {
    // Update avatar and google linkage if needed
    if (googleUser.picture && matchedUser.avatarUrl !== googleUser.picture) {
      matchedUser.avatarUrl = googleUser.picture;
      matchedUser.isGoogleUser = true;
      await db.users.put(matchedUser);
    }
  }

  const session: UserSession = {
    userId: matchedUser.id,
    username: matchedUser.username,
    fullName: googleUser.name || matchedUser.fullName,
    email: cleanEmail,
    avatarUrl: googleUser.picture,
    role: matchedUser.role,
    schoolLocation: matchedUser.schoolStation || schoolLocation || 'Station Assigned',
    ipAddress: '127.0.0.1',
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'Mozilla/5.0',
    loginTime: new Date().toLocaleTimeString('en-PH'),
    isGoogleLinked: true,
    googleAccessToken: accessToken,
    googleEmail: cleanEmail,
    googleName: googleUser.name,
  };

  saveStoredSession(session);
  await addAuditLog(
    session.fullName || session.username,
    session.role,
    'AUTH',
    'USER_LOGIN_GOOGLE',
    `Authenticated via Google Account (${cleanEmail})`
  );

  return session;
}
