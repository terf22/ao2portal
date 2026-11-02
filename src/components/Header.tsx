import React, { useState, useEffect } from 'react';
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
  Megaphone,
  Bell,
  X,
} from 'lucide-react';
import { useOnlineSync } from '../hooks/useOnlineSync';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { Announcement, PrintPaperSize, SchoolProfile, UserRole, UserSession } from '../types';
import { getAnnouncements } from '../db/dexie';

interface HeaderProps {
  currentUser: UserSession;
  onRoleChange?: (role: UserRole) => void;
  schoolProfile: SchoolProfile;
  onOpenSchoolModal: () => void;
  paperSize: PrintPaperSize;
  onPaperSizeChange: (size: PrintPaperSize) => void;
  onToggleMobileMenu?: () => void;
  onSignOut?: () => void;
  onUpdateProfile?: (updated: Partial<UserSession>) => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentUser,
  onRoleChange,
  schoolProfile,
  onOpenSchoolModal,
  paperSize,
  onPaperSizeChange,
  onToggleMobileMenu,
  onSignOut,
  onUpdateProfile,
}) => {
  const { syncStatus, lastSyncTime, pendingCount, triggerManualSync, isOnline } = useOnlineSync();
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);
  const [showOAuthModal, setShowOAuthModal] = useState(false);
  const [oauthClientId, setOauthClientId] = useState('');
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [profileFullName, setProfileFullName] = useState(currentUser.fullName || '');
  const [profileEmail, setProfileEmail] = useState(currentUser.email || '');
  const [profileSavedMsg, setProfileSavedMsg] = useState<string | null>(null);

  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [showAnnouncementsModal, setShowAnnouncementsModal] = useState(false);

  useEffect(() => {
    const fetchAnnouncements = async () => {
      try {
        const anns = await getAnnouncements(currentUser.role);
        setAnnouncements(anns.filter((a) => a.isActive));
      } catch {
        // ignore
      }
    };
    fetchAnnouncements();
    window.addEventListener('announcements-updated', fetchAnnouncements);
    return () => window.removeEventListener('announcements-updated', fetchAnnouncements);
  }, [currentUser.role]);

  const handleOpenProfileModal = () => {
    setProfileFullName(currentUser.fullName || '');
    setProfileEmail(currentUser.email || '');
    setShowProfileModal(true);
  };

  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    if (onUpdateProfile) {
      onUpdateProfile({
        fullName: profileFullName.trim() || currentUser.username,
        email: profileEmail.trim(),
      });
      setProfileSavedMsg('Profile updated successfully!');
      setTimeout(() => {
        setProfileSavedMsg(null);
        setShowProfileModal(false);
      }, 1200);
    } else {
      setShowProfileModal(false);
    }
  };
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

  const isSuperadmin = currentUser.role === 'Superadmin';

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
            {isSuperadmin ? (
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded bg-[#1e3a8a] text-white text-[10px] font-bold uppercase tracking-wider">
                    Superadmin
                  </span>
                  <span className="text-xs text-slate-500 hidden sm:inline">&bull; Division Office Authority</span>
                </div>
                <h2 className="text-sm sm:text-base lg:text-lg font-bold text-slate-900 leading-tight truncate">
                  DepEd Division of Zamboanga City
                </h2>
                <p className="text-[11px] sm:text-xs text-slate-500 truncate">
                  Division Systems &bull; Central SSL Tranche &bull; Account Approvals &amp; Handover
                </p>
              </div>
            ) : (
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
            )}
          </div>

          {/* Controls & Quick Switchers */}
          <div className="flex items-center gap-2 sm:gap-4">
            {/* Division Announcements Bell */}
            <button
              onClick={() => setShowAnnouncementsModal(true)}
              title="View Division Announcements"
              className="relative p-2 text-slate-600 hover:text-[#1e3a8a] hover:bg-slate-100 rounded-lg transition"
            >
              <Megaphone className="w-4 h-4" />
              {announcements.length > 0 && (
                <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-amber-500 ring-2 ring-white animate-pulse" />
              )}
            </button>

            {/* School Station Details Button (Hidden for Superadmin) */}
            {!isSuperadmin && (
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
            )}

            {/* Paper Size Picker (Hidden for Superadmin) */}
            {!isSuperadmin && (
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
            )}

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



            {/* User Profile Info & Avatar */}
            <div className="flex items-center gap-2 sm:gap-3 pl-2 sm:border-l sm:border-slate-200">
              <button
                type="button"
                onClick={handleOpenProfileModal}
                className="flex items-center gap-2 sm:gap-3 text-left group p-1 -m-1 rounded-xl hover:bg-blue-50/70 transition cursor-pointer"
                title="Click to edit Complete Name & Profile"
              >
                <div className="text-right hidden sm:block">
                  <p className="text-xs sm:text-sm font-bold text-[#1e3a8a] group-hover:text-blue-900 leading-tight truncate max-w-[140px] md:max-w-[180px]">
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
                <div className="w-9 h-9 rounded-full bg-slate-200 border-2 border-slate-100 overflow-hidden shadow-xs shrink-0 relative group-hover:ring-2 group-hover:ring-blue-600 transition">
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
              </button>

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
      {/* Profile & Complete Name Modal */}
      {showProfileModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden text-slate-900">
            <div className="bg-[#1e3a8a] text-white p-5 flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold flex items-center gap-2">
                  <UserCheck className="w-5 h-5 text-amber-400" />
                  User Profile &amp; Signatory Settings
                </h3>
                <p className="text-xs text-blue-200 mt-0.5">
                  Update your official complete name and portal credentials
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowProfileModal(false)}
                className="text-white/80 hover:text-white text-lg font-bold p-1 rounded-lg"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveProfile} className="p-6 space-y-4 text-xs">
              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1">
                  Complete Official Full Name
                </label>
                <input
                  type="text"
                  value={profileFullName}
                  onChange={(e) => setProfileFullName(e.target.value)}
                  placeholder="e.g. MARIA TERESA F. SANTOS, AO II"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs sm:text-sm font-semibold text-slate-900 focus:ring-2 focus:ring-blue-800 outline-none uppercase"
                  required
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  This official name will appear on the Service Record <strong>&ldquo;Prepared by:&rdquo;</strong> signatory line, DTR reports, and system certifications instead of your login username.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    System Username
                  </label>
                  <input
                    type="text"
                    disabled
                    value={currentUser.username}
                    className="w-full px-3 py-2 bg-slate-100 border border-slate-200 rounded-xl text-xs text-slate-500 font-mono"
                  />
                  <p className="text-[10px] text-slate-400 mt-0.5">Login account ID</p>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Assigned Role
                  </label>
                  <input
                    type="text"
                    disabled
                    value={currentUser.role}
                    className="w-full px-3 py-2 bg-slate-100 border border-slate-200 rounded-xl text-xs text-slate-500 font-semibold"
                  />
                  <p className="text-[10px] text-slate-400 mt-0.5">Role clearance</p>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  DepEd Email Address
                </label>
                <input
                  type="email"
                  value={profileEmail}
                  onChange={(e) => setProfileEmail(e.target.value)}
                  placeholder="name@deped.gov.ph"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs sm:text-sm text-slate-900 focus:ring-2 focus:ring-blue-800 outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  School Station / Office
                </label>
                <input
                  type="text"
                  disabled
                  value={schoolProfile.schoolName || currentUser.schoolLocation || 'Station Configured'}
                  className="w-full px-3 py-2 bg-slate-100 border border-slate-200 rounded-xl text-xs text-slate-600 font-medium"
                />
              </div>

              {profileSavedMsg && (
                <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs font-semibold flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span>{profileSavedMsg}</span>
                </div>
              )}

              <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowProfileModal(false)}
                  className="px-4 py-2 rounded-xl text-xs text-slate-600 hover:bg-slate-100 font-medium transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl text-xs font-bold bg-[#1e3a8a] hover:bg-blue-900 text-white shadow-md transition"
                >
                  Save Profile
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Announcements Drawer / Modal */}
      {showAnnouncementsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4 animate-fadeIn">
          <div className="bg-white rounded-2xl max-w-lg w-full max-h-[85vh] flex flex-col shadow-2xl overflow-hidden border border-slate-200">
            <div className="p-4 bg-[#1e3a8a] text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Megaphone className="w-5 h-5 text-amber-300" />
                <div>
                  <h3 className="font-bold text-sm">Division Broadcast Bulletins</h3>
                  <p className="text-[10px] text-blue-200">Official Notices &amp; Administrative Circulars</p>
                </div>
              </div>
              <button
                onClick={() => setShowAnnouncementsModal(false)}
                className="text-blue-200 hover:text-white p-1 rounded-lg hover:bg-white/10 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 overflow-y-auto space-y-3 flex-1">
              {announcements.length === 0 ? (
                <div className="text-center py-10 space-y-2">
                  <Megaphone className="w-8 h-8 text-slate-300 mx-auto" />
                  <p className="text-xs text-slate-500 font-medium">
                    No active division announcements for your role at this time.
                  </p>
                </div>
              ) : (
                announcements.map((ann) => (
                  <div
                    key={ann.id}
                    className="p-3.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-white transition space-y-1.5 text-xs"
                  >
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${
                            ann.priority === 'CRITICAL'
                              ? 'bg-rose-100 text-rose-800 border border-rose-300'
                              : ann.priority === 'URGENT'
                              ? 'bg-amber-100 text-amber-900 border border-amber-300'
                              : 'bg-blue-100 text-blue-800'
                          }`}
                        >
                          {ann.priority}
                        </span>
                        <span className="px-1.5 py-0.5 rounded bg-slate-200 text-slate-700 font-semibold text-[10px]">
                          {ann.targetRole === 'ALL' ? 'All Roles' : `${ann.targetRole} Only`}
                        </span>
                      </div>
                      <span className="text-[10px] text-slate-400 font-mono">
                        {new Date(ann.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                    <h4 className="font-bold text-slate-900">{ann.title}</h4>
                    <p className="text-slate-600 leading-relaxed">{ann.content}</p>
                    <div className="pt-1 text-[10px] text-slate-400">
                      Author: <span className="font-semibold text-slate-600">{ann.author}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
            <div className="p-3 bg-slate-50 border-t border-slate-200 flex justify-end">
              <button
                onClick={() => setShowAnnouncementsModal(false)}
                className="px-4 py-1.5 rounded-xl text-xs font-semibold bg-slate-200 hover:bg-slate-300 text-slate-700 transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
};
