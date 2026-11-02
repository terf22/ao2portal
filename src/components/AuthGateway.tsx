import React, { useState } from 'react';
import {
  Building2,
  Lock,
  Mail,
  User as UserIcon,
  Shield,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import { UserRole, UserSession, School } from '../types';
import {
  loginWithCredentials,
  registerNewAccount,
} from '../services/authService';

interface AuthGatewayProps {
  schools: School[];
  defaultSchoolName?: string;
  onLoginSuccess: (session: UserSession) => void;
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
      const outcome = await registerNewAccount({
        fullName: regFullName,
        username: regUsername,
        email: regEmail || undefined,
        password: regPassword,
        role: regRole,
        schoolStation: regSchool || defaultSchoolName,
      });

      setSuccessMsg(
        `Registration submitted for ${outcome.user.fullName}! Your account is now PENDING approval by the Division Superadmin. Once approved, you will be able to sign in.`
      );
      // Switch to login tab and pre-fill username
      setActiveTab('LOGIN');
      setLoginIdentifier(regUsername);
      setLoginPassword('');
      setRegFullName('');
      setRegUsername('');
      setRegEmail('');
      setRegPassword('');
      setRegConfirmPassword('');
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to register account.');
    } finally {
      setIsLoading(false);
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
            School Operations, PIMS, CSC Form 48 DTR, SSL 2026 &amp; Real-time Cloud Synchronization
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
                    placeholder="e.g. maria_santos or maria.santos@deped.gov.ph"
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
            </form>
          )}

          {/* TAB 2: CREATE ACCOUNT FORM */}
          {activeTab === 'REGISTER' && (
            <form onSubmit={handleRegisterSubmit} className="space-y-3.5">
              <div className="p-2.5 rounded-xl bg-blue-50 border border-blue-200 text-blue-900 text-xs flex items-start gap-2">
                <Shield className="w-4 h-4 text-blue-700 shrink-0 mt-0.5" />
                <span>
                  <strong>Superadmin Approval Required:</strong> All newly registered accounts start in <strong>PENDING</strong> status. The Superadmin is responsible for reviewing and approving each Principal, AO II, Dept Head, and Staff account before you can log in.
                </span>
              </div>
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
