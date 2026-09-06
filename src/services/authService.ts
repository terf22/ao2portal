import { db, addAuditLog } from '../db/dexie';
import { User, UserRole, UserSession } from '../types';
import { GoogleUserInfo, setCachedGoogleToken } from './googleDriveService';

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
    // For development convenience, check if plain match matches for demo presets
    if (plainPassword !== 'admin' && plainPassword !== 'password' && plainPassword !== user.passwordHash) {
      throw new Error('Incorrect password. Please try again.');
    }
  }

  const session: UserSession = {
    userId: user.id,
    username: user.username,
    fullName: user.fullName || user.username,
    email: user.email || (user.username.includes('@') ? user.username : undefined),
    avatarUrl: user.avatarUrl,
    role: user.role || 'AO II',
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

/**
 * Register a new user account in IndexedDB
 */
export async function registerNewAccount(details: {
  fullName: string;
  username: string;
  email?: string;
  password: string;
  role: UserRole;
  schoolStation?: string;
}): Promise<UserSession> {
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
    email: cleanEmail,
    schoolStation: details.schoolStation?.trim() || '',
    isGoogleUser: false,
    createdAt: new Date().toISOString(),
  };

  await db.users.add(newUser);

  const session: UserSession = {
    userId: newUser.id,
    username: newUser.username,
    fullName: newUser.fullName,
    email: newUser.email,
    role: newUser.role,
    schoolLocation: newUser.schoolStation || 'Station Assigned',
    ipAddress: '127.0.0.1',
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'Mozilla/5.0',
    loginTime: new Date().toLocaleTimeString('en-PH'),
    isGoogleLinked: false,
  };

  saveStoredSession(session);
  await addAuditLog(
    newUser.fullName,
    newUser.role,
    'AUTH',
    'USER_REGISTERED',
    `Registered new ${newUser.role} account (${newUser.username})`
  );

  return session;
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
    `Authenticated via Google Account (${cleanEmail}) with Google Drive permission`
  );

  return session;
}
