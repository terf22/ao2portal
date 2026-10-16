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

export interface GoogleUserInfo {
  sub: string;
  name: string;
  given_name?: string;
  family_name?: string;
  picture?: string;
  email: string;
  email_verified?: boolean;
}

export function getGoogleClientId(): string {
  if (typeof window !== 'undefined') {
    const custom = localStorage.getItem('ao2_custom_google_client_id');
    if (custom && custom.trim()) {
      return custom.trim();
    }
  }
  return (
    (import.meta as any).env?.VITE_GOOGLE_CLIENT_ID ||
    (firebaseConfig as any).oAuthClientId ||
    '151352064517-6m84egpp5mjc24psh011knn430cgajc9.apps.googleusercontent.com'
  );
}

export function setCustomGoogleClientId(clientId: string | null): void {
  if (typeof window !== 'undefined') {
    if (clientId && clientId.trim()) {
      localStorage.setItem('ao2_custom_google_client_id', clientId.trim());
    } else {
      localStorage.removeItem('ao2_custom_google_client_id');
    }
  }
}

export const GOOGLE_CLIENT_ID = getGoogleClientId();

// Initialize Firebase App singleton safely
export const firebaseApp = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
export const auth = getAuth(firebaseApp);

export const googleLoginProvider = new GoogleAuthProvider();
googleLoginProvider.addScope('email');
googleLoginProvider.addScope('profile');
googleLoginProvider.setCustomParameters({
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

export const setCachedGoogleToken = setGoogleAccessToken;
export const getCachedGoogleToken = getGoogleAccessToken;

/**
 * Fetch authenticated Google User Profile info from userinfo endpoint
 */
export async function fetchGoogleUserProfile(accessToken: string): Promise<GoogleUserInfo> {
  const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch Google profile: ${res.status} ${res.statusText}`);
  }

  return (await res.json()) as GoogleUserInfo;
}

/**
 * Sign in using Firebase Google Auth popup
 * Yields user profile and OAuth access token (standard email + profile scopes, no sensitive Drive scopes)
 */
export async function signInWithGooglePopup(): Promise<{
  user: FirebaseUser;
  accessToken: string;
}> {
  try {
    const result = await signInWithPopup(auth, googleLoginProvider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    const token = credential?.accessToken;

    if (!token) {
      // Fallback: get token from STS or user
      const idToken = await result.user.getIdToken();
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
