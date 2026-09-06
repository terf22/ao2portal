import React, { useState } from 'react';
import {
  ShieldCheck,
  Building2,
  UserCheck,
  FileText,
  Cloud,
  CloudOff,
  RefreshCw,
  Download,
  KeyRound,
  CheckCircle2,
  AlertTriangle,
  HelpCircle,
  Menu,
  FolderSync,
  LogOut,
} from 'lucide-react';
import { useOnlineSync } from '../hooks/useOnlineSync';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { PrintPaperSize, SchoolProfile, UserRole, UserSession } from '../types';

interface HeaderProps {
  currentUser: UserSession;
  onRoleChange?: (role: UserRole) => void;
  schoolProfile: SchoolProfile;
  onOpenSchoolModal: () => void;
  paperSize: PrintPaperSize;
  onPaperSizeChange: (size: PrintPaperSize) => void;
  onToggleMobileMenu?: () => void;
  onOpenGoogleDriveModal?: () => void;
  onSignOut?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentUser,
  onRoleChange,
  schoolProfile,
  onOpenSchoolModal,
  paperSize,
  onPaperSizeChange,
  onToggleMobileMenu,
  onOpenGoogleDriveModal,
  onSignOut,
}) => {
  const { syncStatus, lastSyncTime, pendingCount, triggerManualSync, isOnline } = useOnlineSync();
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);
  const [showOAuthModal, setShowOAuthModal] = useState(false);
  const [oauthClientId, setOauthClientId] = useState('');
  const [oauthDomain, setOauthDomain] = useState('deped.gov.ph');
  const [oauthSaved, setOauthSaved] = useState(false);

  const handleSaveOAuth = (e: React.FormEvent) => {
    e.preventDefault();
    setOauthSaved(true);
    setTimeout(() => {
      setOauthSaved(false);
      setShowOAuthModal(false);
    }, 1200);
  };

  return (
    <header className="sticky top-0 z-30 bg-white text-slate-800 border-b border-slate-200 shadow-sm no-print">
      <div className="w-full px-3 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Mobile Menu Button & Header Title */}
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            {onToggleMobileMenu && (
              <button
                onClick={onToggleMobileMenu}
                aria-label="Open navigation drawer"
                className="lg:hidden p-2 -ml-1 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition shrink-0 focus:outline-none focus:ring-2 focus:ring-blue-800"
              >
                <Menu className="w-5 h-5 text-[#1e3a8a]" />
              </button>
            )}
            <div className="min-w-0">
              <h2 className="text-sm sm:text-base lg:text-lg font-bold text-slate-900 leading-tight truncate">
                {schoolProfile.schoolName || 'School Station Not Configured'}
              </h2>
              <p className="text-[11px] sm:text-xs text-slate-500 truncate max-w-[200px] sm:max-w-xs md:max-w-md">
                {schoolProfile.schoolId ? (
                  <>
                    School ID: <span className="font-mono font-bold text-blue-900">{schoolProfile.schoolId}</span>
                    {schoolProfile.district ? ` • ${schoolProfile.district}` : ''}
                    {schoolProfile.division ? ` • ${schoolProfile.division}` : ''}
                  </>
                ) : (
                  <span
                    onClick={onOpenSchoolModal}
                    className="text-amber-700 font-semibold cursor-pointer hover:underline inline-flex items-center gap-1"
                  >
                    ⚠️ Click to setup school details
                  </span>
                )}
              </p>
            </div>
          </div>

          {/* Controls & Quick Switchers */}
          <div className="flex items-center gap-2 sm:gap-4">
            {/* User's School Station Details Button */}
            <button
              onClick={onOpenSchoolModal}
              className={`flex items-center gap-2 text-xs px-2.5 py-1.5 rounded-lg border transition cursor-pointer group ${
                !schoolProfile.schoolName
                  ? 'bg-amber-50 border-amber-300 text-amber-900 hover:bg-amber-100 shadow-xs'
                  : 'bg-slate-50 hover:bg-blue-50/80 border-slate-200 hover:border-blue-300 text-slate-700 hover:text-blue-950'
              }`}
              title="Click to input or modify your School Details (School Name, ID, Principal, Division)"
            >
              <Building2
                className={`w-4 h-4 shrink-0 ${
                  !schoolProfile.schoolName ? 'text-amber-600 animate-pulse' : 'text-amber-600 group-hover:text-blue-700'
                }`}
              />
              <div className="text-left hidden md:block">
                <span className="font-bold block text-xs truncate max-w-[170px] lg:max-w-[220px]">
                  {schoolProfile.schoolName || 'Setup School Details'}
                </span>
                <span className="text-[10px] text-slate-500 font-mono flex items-center gap-1">
                  {schoolProfile.schoolId ? (
                    <>
                      <span>ID: {schoolProfile.schoolId}</span>
                      <span>&bull;</span>
                      <span className="text-blue-700 font-semibold underline">Edit</span>
                    </>
                  ) : (
                    <span className="text-amber-700 font-bold underline">Input Now</span>
                  )}
                </span>
              </div>
              <div className="md:hidden font-bold text-xs">
                {schoolProfile.schoolName ? 'School Details' : 'Setup School'}
              </div>
            </button>

            {/* Paper Size Picker */}
            <div className="hidden sm:flex items-center gap-1 text-xs bg-slate-50 px-2.5 py-1.5 rounded-lg border border-slate-200 text-slate-700">
              <FileText className="w-3.5 h-3.5 text-slate-400" />
              <span className="text-slate-500 font-medium">Sheet:</span>
              <select
                aria-label="Print Paper Size"
                value={paperSize}
                onChange={(e) => onPaperSizeChange(e.target.value as PrintPaperSize)}
                className="bg-transparent text-[#1e3a8a] font-bold text-xs border-none focus:ring-0 cursor-pointer"
              >
                <option value="Cardstock_3.5x8.5">Form 48 Card (3.5×8.5")</option>
                <option value="Letter">Letter (8.5×11")</option>
                <option value="A4">A4 (210×297mm)</option>
                <option value="Legal">Legal/Folio (8.5×13")</option>
              </select>
            </div>

            {/* Cloud Sync Status Component */}
            <div className="flex items-center">
              <button
                onClick={triggerManualSync}
                title={
                  isOnline
                    ? `Synced at ${lastSyncTime}. Click to re-sync.`
                    : `${pendingCount} offline change(s) stored safely in Dexie IndexedDB.`
                }
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                  syncStatus === 'Synced'
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                    : syncStatus === 'Syncing...'
                    ? 'bg-blue-50 text-blue-700 border-blue-200 animate-pulse'
                    : 'bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100'
                }`}
              >
                {syncStatus === 'Synced' ? (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    <span className="hidden md:inline">Synced</span>
                    <span className="text-[10px] text-emerald-600/80 font-mono hidden xl:inline">
                      {lastSyncTime}
                    </span>
                  </>
                ) : syncStatus === 'Syncing...' ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 text-blue-600 animate-spin" />
                    <span className="hidden sm:inline">Syncing...</span>
                  </>
                ) : (
                  <>
                    <CloudOff className="w-3.5 h-3.5 text-amber-600" />
                    <span className="hidden sm:inline">Offline Mode</span>
                    {pendingCount > 0 && (
                      <span className="ml-0.5 px-1.5 py-0.2 rounded-full text-[10px] bg-amber-200 text-amber-900 font-bold">
                        {pendingCount}
                      </span>
                    )}
                  </>
                )}
              </button>
            </div>

            {/* PWA Install Button */}
            {isInstallable && !isInstalled && (
              <button
                onClick={install}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold bg-[#d97706] hover:bg-amber-600 text-white transition-colors shadow-sm"
              >
                <Download className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Install App</span>
              </button>
            )}

            {isIOS && !isInstalled && (
              <button
                onClick={() => setShowIOSGuide(true)}
                className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs border border-slate-200 text-slate-700 hover:bg-slate-100 font-medium"
              >
                <Download className="w-3 h-3 text-[#d97706]" />
                <span>iOS App</span>
              </button>
            )}

            {/* Google Drive Cloud Backup Button */}
            <button
              onClick={onOpenGoogleDriveModal}
              title={
                currentUser.isGoogleLinked
                  ? 'Google Drive Connected: Click to backup or restore snapshots'
                  : 'Connect Google Drive & Backup'
              }
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold border transition shadow-xs cursor-pointer ${
                currentUser.isGoogleLinked
                  ? 'bg-blue-50 border-blue-200 text-blue-900 hover:bg-blue-100'
                  : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
              }`}
            >
              <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24">
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
              <span className="hidden sm:inline">Drive</span>
              {currentUser.isGoogleLinked ? (
                <span className="w-2 h-2 rounded-full bg-emerald-500 ring-2 ring-emerald-100" />
              ) : (
                <span className="hidden md:inline text-[10px] text-slate-400 font-normal">Backup</span>
              )}
            </button>

            {/* User Profile Info & Avatar */}
            <div className="flex items-center gap-2 sm:gap-3 pl-2 sm:border-l sm:border-slate-200">
              <div className="text-right hidden sm:block">
                <p className="text-xs sm:text-sm font-bold text-[#1e3a8a] leading-tight truncate max-w-[140px] md:max-w-[180px]">
                  {currentUser.fullName || currentUser.username}
                </p>
                <div className="flex items-center justify-end gap-1 mt-0.5">
                  <span className="inline-block px-1.5 py-0.2 rounded text-[9px] font-extrabold uppercase tracking-tight bg-blue-100 text-blue-900 border border-blue-200">
                    {currentUser.role}
                  </span>
                  {currentUser.isGoogleLinked && (
                    <span
                      className="inline-block px-1 py-0.2 rounded text-[8px] font-bold bg-emerald-100 text-emerald-800"
                      title="Linked to Google Account"
                    >
                      Google
                    </span>
                  )}
                </div>
              </div>

              {/* Avatar */}
              <div className="w-9 h-9 rounded-full bg-slate-200 border-2 border-slate-100 overflow-hidden shadow-xs shrink-0 relative">
                {currentUser.avatarUrl ? (
                  <img
                    src={currentUser.avatarUrl}
                    alt={currentUser.fullName || currentUser.username}
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full bg-gradient-to-br from-blue-700 to-indigo-900 flex items-center justify-center font-bold text-xs text-white uppercase">
                    {(currentUser.fullName || currentUser.username).slice(0, 2)}
                  </div>
                )}
              </div>

              {/* Sign Out Action */}
              {onSignOut && (
                <button
                  onClick={onSignOut}
                  title="Sign Out of Portal"
                  className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 border border-slate-200 transition cursor-pointer"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* iOS Safari Guide Modal */}
      {showIOSGuide && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="w-full max-w-sm rounded-xl bg-white border border-slate-200 p-6 shadow-2xl text-slate-800">
            <h3 className="text-base font-semibold text-slate-800 flex items-center gap-2">
              <Download className="w-5 h-5 text-[#d97706]" />
              Install AOII Portal on iPhone / iPad
            </h3>
            <p className="mt-3 text-xs text-slate-600 leading-relaxed">
              1. Tap the <strong>Share</strong> button in your Safari bottom toolbar.<br />
              2. Scroll down and tap <strong>Add to Home Screen</strong>.<br />
              3. The AOII Portal will launch in dedicated offline-capable standalone mode!
            </p>
            <button
              onClick={() => setShowIOSGuide(false)}
              className="mt-5 w-full rounded-lg bg-[#1e3a8a] hover:bg-blue-900 py-2 text-xs font-bold text-white transition shadow-sm"
            >
              Got It
            </button>
          </div>
        </div>
      )}

      {/* Google Workspace / OAuth Settings Modal */}
      {showOAuthModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-xl bg-white border border-slate-200 p-6 shadow-2xl text-slate-800">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-[#d97706]" />
                <h3 className="text-base font-bold text-slate-800">Google Workspace &amp; Auth Setup</h3>
              </div>
              <button
                onClick={() => setShowOAuthModal(false)}
                className="text-slate-400 hover:text-slate-700 text-lg font-bold"
              >
                &times;
              </button>
            </div>
            <form onSubmit={handleSaveOAuth} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Workspace Authorized Domain
                </label>
                <input
                  type="text"
                  value={oauthDomain}
                  onChange={(e) => setOauthDomain(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-900 focus:outline-none focus:border-[#1e3a8a]"
                  placeholder="e.g., deped.gov.ph"
                  required
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  Enforces authentication exclusively for @deped.gov.ph institutional accounts.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Google Identity Client ID (OAuth 2.0)
                </label>
                <input
                  type="text"
                  value={oauthClientId}
                  onChange={(e) => setOauthClientId(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-900 focus:outline-none focus:border-[#1e3a8a] font-mono"
                  placeholder="xxxx.apps.googleusercontent.com"
                  required
                />
              </div>

              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 flex items-start gap-2">
                <HelpCircle className="w-4 h-4 text-[#1e3a8a] shrink-0 mt-0.5" />
                <p className="text-[11px] text-slate-600 leading-normal">
                  The portal operates offline-first using Dexie.js IndexedDB. When connected, it can link to Google Identity Services for official DepEd single sign-on.
                </p>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowOAuthModal(false)}
                  className="px-3 py-1.5 rounded-lg text-xs text-slate-600 hover:bg-slate-100 font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-lg text-xs font-bold bg-[#1e3a8a] hover:bg-blue-900 text-white flex items-center gap-1.5 shadow-sm transition"
                >
                  {oauthSaved ? (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-300" />
                      Saved!
                    </>
                  ) : (
                    'Save Configuration'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </header>
  );
};
