/**
 * Google Authentication & Firebase Workspace Integration Configuration
 * Uses the provisioned OAuth Client ID from Google Cloud / AI Studio
 */

import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  signInWithPopup,
  GoogleAuthProvider,
  User as FirebaseUser,
  signOut as firebaseSignOut,
} from 'firebase/auth';
import firebaseConfigJson from '../../firebase-applet-config.json';

export const firebaseConfig = firebaseConfigJson;

export const GOOGLE_CLIENT_ID =
  firebaseConfig.oAuthClientId ||
  '151352064517-6m84egpp5mjc24psh011knn430cgajc9.apps.googleusercontent.com';

// Initialize Firebase App singleton safely
export const firebaseApp = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
export const auth = getAuth(firebaseApp);

export const googleDriveProvider = new GoogleAuthProvider();
googleDriveProvider.addScope('https://www.googleapis.com/auth/drive.file');
googleDriveProvider.addScope('https://www.googleapis.com/auth/userinfo.email');
googleDriveProvider.addScope('https://www.googleapis.com/auth/userinfo.profile');
googleDriveProvider.setCustomParameters({
  prompt: 'select_account',
});

// Cache for access token in-memory
let inMemoryAccessToken: string | null = null;

export function setGoogleAccessToken(token: string | null) {
  inMemoryAccessToken = token;
}

export function getGoogleAccessToken(): string | null {
  return inMemoryAccessToken;
}

/**
 * Sign in using Firebase Google Auth popup
 * Yields user profile and OAuth access token
 */
export async function signInWithGooglePopup(): Promise<{
  user: FirebaseUser;
  accessToken: string;
}> {
  try {
    const result = await signInWithPopup(auth, googleDriveProvider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    const token = credential?.accessToken;

    if (!token) {
      // Fallback: get token from STS or user
      const idToken = await result.user.getIdToken();
      // If credential accessToken is somehow empty, still return user with idToken as fallback
      inMemoryAccessToken = token || idToken;
      return { user: result.user, accessToken: token || idToken };
    }

    inMemoryAccessToken = token;
    return { user: result.user, accessToken: token };
  } catch (error: unknown) {
    console.error('Firebase Google Sign-In error:', error);
    throw error;
  }
}

/**
 * Sign out of Firebase session
 */
export async function signOutGoogle(): Promise<void> {
  try {
    await firebaseSignOut(auth);
  } catch (e) {
    console.warn('Sign out warning:', e);
  } finally {
    inMemoryAccessToken = null;
  }
}
