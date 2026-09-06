import React, { useState, useEffect } from 'react';
import {
  Building2,
  Lock,
  Mail,
  User as UserIcon,
  Shield,
  Eye,
  EyeOff,
  Cloud,
  CheckCircle2,
  AlertCircle,
  FolderSync,
  HelpCircle,
} from 'lucide-react';
import { UserRole, UserSession, School } from '../types';
import {
  loginWithCredentials,
  registerNewAccount,
  authenticateWithGoogle,
} from '../services/authService';
import {
  fetchGoogleUserProfile,
  GoogleUserInfo,
} from '../services/googleDriveService';
import {
  signInWithGooglePopup,
  getGoogleClientId,
  setCustomGoogleClientId,
} from '../config/googleAuth';

interface AuthGatewayProps {
  schools: School[];
  defaultSchoolName?: string;
  onLoginSuccess: (session: UserSession) => void;
}

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient: (config: {
            client_id: string;
            scope: string;
            callback: (response: { access_token?: string; error?: string }) => void;
            error_callback?: (err: unknown) => void;
          }) => {
            requestAccessToken: () => void;
          };
        };
      };
    };
  }
}

export const AuthGateway: React.FC<AuthGatewayProps> = ({
  schools,
  defaultSchoolName = '',
  onLoginSuccess,
}) => {
  const [activeTab, setActiveTab] = useState<'LOGIN' | 'REGISTER'>('LOGIN');

  // Login form state
  const [loginIdentifier, setLoginIdentifier] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [showLoginPassword, setShowLoginPassword] = useState(false);

  // Registration form state
  const [regFullName, setRegFullName] = useState('');
  const [regUsername, setRegUsername] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regConfirmPassword, setRegConfirmPassword] = useState('');
  const [showRegPassword, setShowRegPassword] = useState(false);
  const [regRole, setRegRole] = useState<UserRole>('AO II');
  const [regSchool, setRegSchool] = useState(defaultSchoolName);

  // Status & loading
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [googleClientReady, setGoogleClientReady] = useState(false);
  const [showGoogleHelp, setShowGoogleHelp] = useState(false);
  const [customClientIdInput, setCustomClientIdInput] = useState(() => (typeof window !== 'undefined' ? localStorage.getItem('ao2_custom_google_client_id') || '' : ''));
  const [clientIdSavedMsg, setClientIdSavedMsg] = useState<string | null>(null);

  const handleSaveCustomClientId = (e: React.FormEvent) => {
    e.preventDefault();
    setCustomGoogleClientId(customClientIdInput);
    setClientIdSavedMsg('Google OAuth Client ID saved successfully!');
    setTimeout(() => setClientIdSavedMsg(null), 4000);
  };

  // Check if Google GSI is available
  useEffect(() => {
    const checkGSI = () => {
      if (typeof window !== 'undefined' && window.google?.accounts?.oauth2) {
        setGoogleClientReady(true);
      }
    };
    checkGSI();
    const timer = setInterval(checkGSI, 1000);
    return () => clearInterval(timer);
  }, []);

  // Handle Standard Login
  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);
    setIsLoading(true);

    try {
      const session = await loginWithCredentials(
        loginIdentifier,
        loginPassword,
        defaultSchoolName
      );
      setSuccessMsg(`Welcome back, ${session.fullName || session.username}!`);
      setTimeout(() => {
        onLoginSuccess(session);
      }, 400);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Invalid credentials. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  // Handle Account Registration
  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (regPassword !== regConfirmPassword) {
      setErrorMsg('Passwords do not match. Please verify.');
      return;
    }

    setIsLoading(true);
    try {
      const session = await registerNewAccount({
        fullName: regFullName,
        username: regUsername,
        email: regEmail || undefined,
        password: regPassword,
        role: regRole,
        schoolStation: regSchool || defaultSchoolName,
      });

      setSuccessMsg(`Account created successfully! Welcome, ${session.fullName}.`);
      setTimeout(() => {
        onLoginSuccess(session);
      }, 500);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to register account.');
    } finally {
      setIsLoading(false);
    }
  };

  // Handle Google Sign-In & Google Drive OAuth
  const handleGoogleSignIn = async () => {
    setErrorMsg(null);
    setSuccessMsg(null);
    setIsLoading(true);

    // Primary: Firebase Auth Popup Flow
    try {
      const { user, accessToken } = await signInWithGooglePopup();
      const profile: GoogleUserInfo = {
        sub: user.uid,
        name: user.displayName || user.email || 'DepEd Google User',
        email: user.email || 'deped.user@deped.gov.ph',
        picture: user.photoURL || undefined,
        email_verified: user.emailVerified,
      };
      const session = await authenticateWithGoogle(
        profile,
        accessToken,
        regRole || 'AO II',
        defaultSchoolName
      );
      setSuccessMsg(`Authenticated via Google (${profile.email}). Connected to Google Drive!`);
      setTimeout(() => {
        onLoginSuccess(session);
      }, 400);
      return;
    } catch (popupErr: unknown) {
      const errorStr = String(popupErr);
      if (errorStr.includes('popup-closed-by-user') || errorStr.includes('cancelled-popup-request')) {
        setIsLoading(false);
        return;
      }
      console.warn('Firebase popup flow fallback to GSI token client:', popupErr);
    }

    // Secondary / Fallback: Google Identity Services (GSI) Token Client
    if (typeof window !== 'undefined' && window.google?.accounts?.oauth2) {
      try {
        const tokenClient = window.google.accounts.oauth2.initTokenClient({
          client_id: getGoogleClientId(),
          scope: 'https://www.googleapis.com/auth/drive.file email profile openid',
          callback: async (tokenResponse) => {
            if (tokenResponse.error) {
              setIsLoading(false);
              setErrorMsg(`Google Authorization notice: ${tokenResponse.error}. You can also sign in using a local account.`);
              return;
            }

            if (tokenResponse.access_token) {
              try {
                const profile = await fetchGoogleUserProfile(tokenResponse.access_token);
                const session = await authenticateWithGoogle(
                  profile,
                  tokenResponse.access_token,
                  regRole || 'AO II',
                  defaultSchoolName
                );
                setSuccessMsg(`Authenticated via Google (${profile.email}). Connected to Google Drive!`);
                setTimeout(() => {
                  onLoginSuccess(session);
                }, 400);
              } catch (profileErr: unknown) {
                console.warn('Google profile fetch fallback:', profileErr);
                const fallbackProfile: GoogleUserInfo = {
                  sub: 'google_user_' + Date.now(),
                  name: 'DepEd Google User',
                  email: 'deped.user@deped.gov.ph',
                };
                const session = await authenticateWithGoogle(
                  fallbackProfile,
                  tokenResponse.access_token,
                  regRole || 'AO II',
                  defaultSchoolName
                );
                onLoginSuccess(session);
              } finally {
                setIsLoading(false);
              }
            } else {
              setIsLoading(false);
            }
          },
          error_callback: (err) => {
            console.error('GSI Error:', err);
            setIsLoading(false);
            setErrorMsg('Unable to complete Google Sign-In popup. Check popup blocker or sign in with username/password.');
          },
        });

        tokenClient.requestAccessToken();
      } catch (gsiErr: unknown) {
        console.error('Failed to launch Google Token Client:', gsiErr);
        setIsLoading(false);
        setErrorMsg('Google Sign-In initialization failed. Please use regular sign in or check your connection.');
      }
    } else {
      setIsLoading(false);
      setShowGoogleHelp(true);
    }
  };

  // Quick Demo account filler
  const fillDemoAccount = (role: 'AO II' | 'Superadmin') => {
    setActiveTab('LOGIN');
    if (role === 'AO II') {
      setLoginIdentifier('ao2_cluster');
      setLoginPassword('password');
    } else {
      setLoginIdentifier('superadmin');
      setLoginPassword('admin');
    }
  };

  return (
    <div className="min-h-screen w-full bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 flex flex-col justify-center items-center p-4 sm:p-6 lg:p-8 relative overflow-hidden font-sans">
      {/* Background Decorative Pattern */}
      <div className="absolute inset-0 opacity-10 bg-[radial-gradient(#d97706_1px,transparent_1px)] [background-size:24px_24px] pointer-events-none" />
      <div className="absolute -top-40 -left-40 w-96 h-96 bg-blue-600/20 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-amber-500/15 rounded-full blur-3xl pointer-events-none" />

      {/* Main Authentication Card */}
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden relative z-10">
        {/* DepEd Official Header Strip */}
        <div className="bg-[#1e3a8a] text-white p-6 sm:p-8 text-center border-b-4 border-amber-500 relative">
          <div className="w-16 h-16 sm:w-20 sm:h-20 mx-auto rounded-full bg-white p-1.5 shadow-md flex items-center justify-center mb-3">
            <div className="w-full h-full rounded-full border-2 border-blue-900 flex flex-col items-center justify-center bg-blue-50 text-blue-950 p-1 text-center">
              <span className="text-[7px] font-serif font-black uppercase tracking-tighter leading-none text-blue-900">
                DepEd
              </span>
              <Building2 className="w-5 h-5 sm:w-6 sm:h-6 text-amber-600 my-0.5" />
              <span className="text-[6px] font-sans font-bold uppercase tracking-tight text-blue-950">
                Region IX
              </span>
            </div>
          </div>

          <p className="text-[10px] sm:text-xs tracking-widest text-amber-300 font-semibold uppercase">
            Republic of the Philippines &bull; Department of Education
          </p>
          <h1 className="text-lg sm:text-xl font-black tracking-tight text-white mt-1">
            Administrative Officer II Portal
          </h1>
          <p className="text-xs text-blue-100/90 mt-1 max-w-sm mx-auto leading-relaxed">
            School Operations, PIMS, CSC Form 48 DTR, SSL 2026 &amp; Google Drive Cloud Backup
          </p>
        </div>

        {/* Tab Switcher (Sign In vs Create Account) */}
        <div className="flex border-b border-slate-200 bg-slate-50/80">
          <button
            type="button"
            onClick={() => {
              setActiveTab('LOGIN');
              setErrorMsg(null);
            }}
            className={`flex-1 py-3.5 text-xs sm:text-sm font-bold transition-all flex items-center justify-center gap-2 ${
              activeTab === 'LOGIN'
                ? 'bg-white text-[#1e3a8a] border-b-2 border-blue-800 shadow-xs'
                : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <Lock className="w-4 h-4" />
            <span>Sign In</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab('REGISTER');
              setErrorMsg(null);
            }}
            className={`flex-1 py-3.5 text-xs sm:text-sm font-bold transition-all flex items-center justify-center gap-2 ${
              activeTab === 'REGISTER'
                ? 'bg-white text-[#1e3a8a] border-b-2 border-blue-800 shadow-xs'
                : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <UserIcon className="w-4 h-4" />
            <span>Create Account</span>
          </button>
        </div>

        {/* Card Body */}
        <div className="p-6 sm:p-8 space-y-5">
          {/* Feedback Messages */}
          {errorMsg && (
            <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start gap-2.5 animate-fadeIn">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <div className="flex-1 font-medium">{errorMsg}</div>
            </div>
          )}

          {successMsg && (
            <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-start gap-2.5 animate-fadeIn">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <div className="flex-1 font-medium">{successMsg}</div>
            </div>
          )}

          {/* Google Sign-In & Google Drive Button */}
          <div className="space-y-2">
            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={isLoading}
              className="w-full flex items-center justify-center gap-3 py-3 px-4 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 font-bold text-xs sm:text-sm shadow-xs hover:shadow-md transition active:scale-[0.99] cursor-pointer disabled:opacity-50"
            >
              <svg className="w-4 h-4 sm:w-5 sm:h-5" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                />
              </svg>
              <span>
                {activeTab === 'LOGIN' ? 'Sign in with Google' : 'Register with Google'}
              </span>
            </button>

            <div className="flex items-center justify-between text-[11px] text-slate-500 px-1">
              <span className="flex items-center gap-1.5">
                <FolderSync className="w-3.5 h-3.5 text-blue-600" />
                <span>Enables 1-click Google Drive database backup</span>
              </span>
              <button
                type="button"
                onClick={() => setShowGoogleHelp((prev) => !prev)}
                className="text-blue-700 hover:underline flex items-center gap-0.5 font-medium"
              >
                <HelpCircle className="w-3 h-3" />
                <span>Info</span>
              </button>
            </div>

            {showGoogleHelp && (
              <div className="p-3.5 rounded-xl bg-blue-50 border border-blue-200 text-blue-950 text-[11px] leading-relaxed space-y-2.5 shadow-sm">
                <div>
                  <p className="font-bold text-blue-900 text-xs">Google Account & Drive Sync</p>
                  <p className="text-slate-600 mt-0.5">
                    Connecting your Google account allows automatic cloud backups directly to a private folder in your Google Drive.
                  </p>
                </div>

                <div className="p-2.5 rounded-lg bg-white border border-blue-100 text-slate-700 space-y-1.5">
                  <p className="font-semibold text-blue-900 flex items-center justify-between">
                    <span>Self-Hosted & GitHub Pages Setup</span>
                  </p>
                  <p className="text-[10px] text-slate-500">
                    If you see <em>&ldquo;Error 401: invalid_client&rdquo;</em> on GitHub Pages, enter your own Google OAuth Client ID created from{' '}
                    <a
                      href="https://console.cloud.google.com/apis/credentials"
                      target="_blank"
                      rel="noreferrer"
                      className="text-blue-600 underline font-medium"
                    >
                      Google Cloud Console
                    </a>{' '}
                    with your domain added to Authorized Origins:
                  </p>

                  <div className="flex gap-1.5 pt-1">
                    <input
                      type="text"
                      value={customClientIdInput}
                      onChange={(e) => setCustomClientIdInput(e.target.value)}
                      placeholder="e.g. 123456...apps.googleusercontent.com"
                      className="flex-1 px-2.5 py-1.5 rounded-lg border border-slate-300 text-[10px] focus:ring-1 focus:ring-blue-600 outline-none font-mono"
                    />
                    <button
                      type="button"
                      onClick={handleSaveCustomClientId}
                      className="px-2.5 py-1.5 bg-blue-700 hover:bg-blue-800 text-white font-semibold rounded-lg text-[10px] whitespace-nowrap transition"
                    >
                      Save
                    </button>
                    {customClientIdInput && (
                      <button
                        type="button"
                        onClick={() => {
                          setCustomClientIdInput('');
                          setCustomGoogleClientId(null);
                        }}
                        className="px-2 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 font-semibold rounded-lg text-[10px] transition"
                      >
                        Reset
                      </button>
                    )}
                  </div>
                  {clientIdSavedMsg && (
                    <p className="text-[10px] text-emerald-600 font-medium">{clientIdSavedMsg}</p>
                  )}
                </div>

                <div className="pt-0.5 border-t border-blue-200/60 text-slate-600">
                  <p className="font-medium text-slate-800">No Google Cloud setup? No problem!</p>
                  <p>
                    You can immediately sign in using the <strong>local credentials</strong> below or click the <strong>Register</strong> tab. You still get complete local offline storage and file backups.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Divider */}
          <div className="relative flex items-center justify-center">
            <div className="border-t border-slate-200 w-full" />
            <span className="bg-white px-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider relative">
              Or with local credentials
            </span>
          </div>

          {/* TAB 1: SIGN IN FORM */}
          {activeTab === 'LOGIN' && (
            <form onSubmit={handleLoginSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Username or DepEd Email
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                    <Mail className="w-4 h-4" />
                  </div>
                  <input
                    type="text"
                    required
                    value={loginIdentifier}
                    onChange={(e) => setLoginIdentifier(e.target.value)}
                    placeholder="e.g. ao2_cluster or juan.delacruz@deped.gov.ph"
                    className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-slate-300 text-xs sm:text-sm focus:ring-2 focus:ring-blue-800 focus:border-blue-800 outline-none transition"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-bold text-slate-700">Password</label>
                </div>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                    <Lock className="w-4 h-4" />
                  </div>
                  <input
                    type={showLoginPassword ? 'text' : 'password'}
                    required
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    placeholder="Enter password"
                    className="w-full pl-9 pr-10 py-2.5 rounded-xl border border-slate-300 text-xs sm:text-sm focus:ring-2 focus:ring-blue-800 focus:border-blue-800 outline-none transition"
                  />
                  <button
                    type="button"
                    onClick={() => setShowLoginPassword((prev) => !prev)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-700"
                  >
                    {showLoginPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-3 px-4 bg-[#1e3a8a] hover:bg-blue-900 text-white font-bold text-xs sm:text-sm rounded-xl shadow-md hover:shadow-lg transition active:scale-[0.99] flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {isLoading ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    <Lock className="w-4 h-4 text-amber-400" />
                    <span>Sign In to Portal</span>
                  </>
                )}
              </button>

              {/* Quick Fill Demo Helper */}
              <div className="pt-2 border-t border-slate-100 flex flex-col gap-1.5">
                <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider text-center">
                  Quick Sign-In Shortcut:
                </span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => fillDemoAccount('AO II')}
                    className="flex-1 py-1.5 px-2 bg-blue-50 hover:bg-blue-100 text-blue-900 rounded-lg text-[11px] font-bold border border-blue-200 transition"
                  >
                    AO II Admin
                  </button>
                  <button
                    type="button"
                    onClick={() => fillDemoAccount('Superadmin')}
                    className="flex-1 py-1.5 px-2 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg text-[11px] font-bold border border-slate-200 transition"
                  >
                    Division Superadmin
                  </button>
                </div>
              </div>
            </form>
          )}

          {/* TAB 2: CREATE ACCOUNT FORM */}
          {activeTab === 'REGISTER' && (
            <form onSubmit={handleRegisterSubmit} className="space-y-3.5">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Full Name &amp; Title
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                    <UserIcon className="w-4 h-4" />
                  </div>
                  <input
                    type="text"
                    required
                    value={regFullName}
                    onChange={(e) => setRegFullName(e.target.value)}
                    placeholder="e.g. Maria Clara L. Santos, EdD"
                    className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-300 text-xs sm:text-sm focus:ring-2 focus:ring-blue-800 outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Username
                  </label>
                  <input
                    type="text"
                    required
                    value={regUsername}
                    onChange={(e) => setRegUsername(e.target.value)}
                    placeholder="e.g. maria_santos"
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs sm:text-sm focus:ring-2 focus:ring-blue-800 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    DepEd Email (Optional)
                  </label>
                  <input
                    type="email"
                    value={regEmail}
                    onChange={(e) => setRegEmail(e.target.value)}
                    placeholder="name@deped.gov.ph"
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs sm:text-sm focus:ring-2 focus:ring-blue-800 outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Official Role
                  </label>
                  <select
                    value={regRole}
                    onChange={(e) => setRegRole(e.target.value as UserRole)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-semibold focus:ring-2 focus:ring-blue-800 outline-none bg-white"
                  >
                    <option value="AO II">AO II (Cluster Admin)</option>
                    <option value="Superadmin">Superadmin (Division)</option>
                    <option value="Admin">Principal / Head</option>
                    <option value="DeptHead">Department Head</option>
                    <option value="Staff">Staff / Teacher</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    School Station
                  </label>
                  <input
                    type="text"
                    value={regSchool}
                    onChange={(e) => setRegSchool(e.target.value)}
                    placeholder="e.g. Zamboanga City HS"
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs sm:text-sm focus:ring-2 focus:ring-blue-800 outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Password
                  </label>
                  <div className="relative">
                    <input
                      type={showRegPassword ? 'text' : 'password'}
                      required
                      value={regPassword}
                      onChange={(e) => setRegPassword(e.target.value)}
                      placeholder="At least 4 chars"
                      className="w-full px-3 pr-8 py-2 rounded-xl border border-slate-300 text-xs sm:text-sm focus:ring-2 focus:ring-blue-800 outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setShowRegPassword((prev) => !prev)}
                      className="absolute inset-y-0 right-0 pr-2.5 flex items-center text-slate-400"
                    >
                      {showRegPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Confirm Password
                  </label>
                  <input
                    type="password"
                    required
                    value={regConfirmPassword}
                    onChange={(e) => setRegConfirmPassword(e.target.value)}
                    placeholder="Repeat password"
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs sm:text-sm focus:ring-2 focus:ring-blue-800 outline-none"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-3 px-4 bg-emerald-700 hover:bg-emerald-600 text-white font-bold text-xs sm:text-sm rounded-xl shadow-md transition active:scale-[0.99] flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 mt-2"
              >
                {isLoading ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    <Shield className="w-4 h-4 text-emerald-200" />
                    <span>Create Account &amp; Enter Portal</span>
                  </>
                )}
              </button>
            </form>
          )}

          {/* Footer note */}
          <div className="pt-3 border-t border-slate-100 text-center space-y-1">
            <p className="text-[10px] text-slate-500">
              Offline-Ready &bull; Encrypted in Browser IndexedDB &bull; Compliant with DepEd &amp; CSC Standards
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
