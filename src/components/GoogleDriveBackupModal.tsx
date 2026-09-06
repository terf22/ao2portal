import React, { useState, useEffect } from 'react';
import {
  X,
  UploadCloud,
  DownloadCloud,
  CheckCircle2,
  AlertCircle,
  FolderSync,
  ExternalLink,
  RefreshCw,
  Clock,
  HardDrive,
  FileJson,
  ShieldCheck,
} from 'lucide-react';
import {
  uploadBackupToGoogleDrive,
  listGoogleDriveBackups,
  downloadGoogleDriveBackup,
  GoogleDriveFileMeta,
  BackupDataPackage,
  getCachedGoogleToken,
  setCachedGoogleToken,
  fetchGoogleUserProfile,
} from '../services/googleDriveService';
import {
  signInWithGooglePopup,
  GOOGLE_CLIENT_ID,
} from '../config/googleAuth';
import { db, addAuditLog } from '../db/dexie';
import { SchoolProfile, UserSession } from '../types';
import { saveStoredSchoolProfile } from '../utils/schoolProfile';

interface GoogleDriveBackupModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: UserSession;
  schoolProfile: SchoolProfile;
  onRestoreComplete: () => Promise<void>;
}

export const GoogleDriveBackupModal: React.FC<GoogleDriveBackupModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  schoolProfile,
  onRestoreComplete,
}) => {
  const [accessToken, setAccessToken] = useState<string | null>(() => {
    return currentUser.googleAccessToken || getCachedGoogleToken();
  });
  const [isConnecting, setIsConnecting] = useState(false);
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [isLoadingBackups, setIsLoadingBackups] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [backups, setBackups] = useState<GoogleDriveFileMeta[]>([]);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [lastSavedMeta, setLastSavedMeta] = useState<GoogleDriveFileMeta | null>(null);

  useEffect(() => {
    const token = currentUser.googleAccessToken || getCachedGoogleToken();
    if (token) {
      setAccessToken(token);
    }
  }, [currentUser.googleAccessToken]);

  // Load existing backups from Google Drive if token is available
  useEffect(() => {
    if (isOpen && accessToken) {
      loadBackupsList(accessToken);
    }
  }, [isOpen, accessToken]);

  const loadBackupsList = async (token: string) => {
    setIsLoadingBackups(true);
    try {
      const files = await listGoogleDriveBackups(token);
      setBackups(files);
    } catch (err: unknown) {
      console.warn('Failed to load drive backups:', err);
    } finally {
      setIsLoadingBackups(false);
    }
  };

  // Connect Google Account if not yet linked
  const handleConnectGoogle = async () => {
    setStatusMessage(null);
    setIsConnecting(true);

    // Primary: Firebase Auth Popup Flow
    try {
      const { user, accessToken: token } = await signInWithGooglePopup();
      if (token) {
        setAccessToken(token);
        setCachedGoogleToken(token);
        setStatusMessage({
          type: 'success',
          text: `Connected to Google Drive (${user.email || 'DepEd User'}).`,
        });
        loadBackupsList(token);
        setIsConnecting(false);
        return;
      }
    } catch (popupErr: unknown) {
      const errorStr = String(popupErr);
      if (errorStr.includes('popup-closed-by-user') || errorStr.includes('cancelled-popup-request')) {
        setIsConnecting(false);
        return;
      }
      console.warn('Firebase popup flow fallback to GSI token client:', popupErr);
    }

    // Secondary / Fallback: Google Identity Services (GSI) Token Client
    if (typeof window !== 'undefined' && window.google?.accounts?.oauth2) {
      try {
        const client = window.google.accounts.oauth2.initTokenClient({
          client_id: GOOGLE_CLIENT_ID,
          scope: 'https://www.googleapis.com/auth/drive.file email profile openid',
          callback: async (res) => {
            setIsConnecting(false);
            if (res.access_token) {
              setAccessToken(res.access_token);
              setCachedGoogleToken(res.access_token);
              try {
                const user = await fetchGoogleUserProfile(res.access_token);
                setStatusMessage({
                  type: 'success',
                  text: `Connected to Google Drive (${user.email}).`,
                });
              } catch {
                setStatusMessage({
                  type: 'success',
                  text: 'Connected to Google Drive.',
                });
              }
              loadBackupsList(res.access_token);
            } else if (res.error) {
              setStatusMessage({
                type: 'error',
                text: `Authorization response: ${res.error}`,
              });
            }
          },
          error_callback: () => {
            setIsConnecting(false);
            setStatusMessage({
              type: 'error',
              text: 'Unable to open Google authorization popup. Please check popup blockers.',
            });
          },
        });
        client.requestAccessToken();
      } catch (err: unknown) {
        setIsConnecting(false);
        setStatusMessage({
          type: 'error',
          text: err instanceof Error ? err.message : 'Google OAuth initialization failed.',
        });
      }
    } else {
      setIsConnecting(false);
      setStatusMessage({
        type: 'error',
        text: 'Google authentication service is initializing. Please try again in a moment.',
      });
    }
  };

  // Perform Snapshot Backup to Google Drive
  const handleBackupNow = async () => {
    if (!accessToken) {
      handleConnectGoogle();
      return;
    }

    setIsBackingUp(true);
    setStatusMessage(null);

    try {
      // Gather all local database tables
      const personnelList = await db.personnel.toArray();
      const schoolsList = await db.schools.toArray();
      const auditLogsList = await db.auditLogs.toArray();

      const backupPayload: BackupDataPackage = {
        appVersion: '3.5.0-PWA-GDRIVE',
        exportTimestamp: new Date().toISOString(),
        schoolProfile: { ...schoolProfile },
        personnelCount: personnelList.length,
        personnel: personnelList,
        schools: schoolsList,
        auditLogsCount: auditLogsList.length,
        auditLogs: auditLogsList,
        systemMetadata: {
          author: currentUser.fullName || currentUser.username,
          role: currentUser.role,
          division: schoolProfile.division || 'Division of Zamboanga City',
          schoolLocation: schoolProfile.schoolName || currentUser.schoolLocation,
        },
      };

      const result = await uploadBackupToGoogleDrive(accessToken, backupPayload);
      setLastSavedMeta(result);
      setStatusMessage({
        type: 'success',
        text: `Snapshot successfully saved to Google Drive as "${result.name}"!`,
      });

      await addAuditLog(
        currentUser.fullName || currentUser.username,
        currentUser.role,
        'DATA_PORTABILITY',
        'GDRIVE_BACKUP_SAVED',
        `Saved snapshot to Google Drive: ${result.name} (File ID: ${result.id})`
      );

      await loadBackupsList(accessToken);
    } catch (err: unknown) {
      console.error('Google Drive backup error:', err);
      setStatusMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to upload backup to Google Drive.',
      });
    } finally {
      setIsBackingUp(false);
    }
  };

  // Restore snapshot from Google Drive
  const handleRestoreBackup = async (file: GoogleDriveFileMeta) => {
    if (!accessToken) return;
    const confirm = window.confirm(
      `Are you sure you want to restore the backup "${file.name}"?\n\nThis will merge and update your personnel and school station records.`
    );
    if (!confirm) return;

    setIsRestoring(true);
    setStatusMessage(null);

    try {
      const backupData = await downloadGoogleDriveBackup(accessToken, file.id);

      if (backupData.schoolProfile && typeof backupData.schoolProfile === 'object') {
        await saveStoredSchoolProfile(backupData.schoolProfile as unknown as SchoolProfile, currentUser.fullName);
      }

      if (Array.isArray(backupData.personnel) && backupData.personnel.length > 0) {
        for (const p of backupData.personnel) {
          // Put will insert or update existing by id
          await db.personnel.put(p as never);
        }
      }

      if (Array.isArray(backupData.schools) && backupData.schools.length > 0) {
        for (const s of backupData.schools) {
          await db.schools.put(s as never);
        }
      }

      await addAuditLog(
        currentUser.fullName || currentUser.username,
        currentUser.role,
        'DATA_PORTABILITY',
        'GDRIVE_BACKUP_RESTORED',
        `Restored data from Google Drive backup ${file.name}`
      );

      setStatusMessage({
        type: 'success',
        text: `Backup "${file.name}" restored successfully! Loaded ${backupData.personnel?.length || 0} personnel records.`,
      });

      await onRestoreComplete();
    } catch (err: unknown) {
      console.error('Google Drive restore error:', err);
      setStatusMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to download and restore backup.',
      });
    } finally {
      setIsRestoring(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-fadeIn">
      <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="bg-gradient-to-r from-blue-900 via-indigo-900 to-blue-950 text-white p-4 sm:p-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center border border-white/20">
              <FolderSync className="w-5 h-5 text-amber-300" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold">Google Drive Cloud Storage</h2>
              <p className="text-xs text-blue-200">
                Safe, automated cloud backup &amp; multi-device restore for AO II Portal records
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-blue-200 hover:text-white hover:bg-white/10 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-5">
          {/* Status notification */}
          {statusMessage && (
            <div
              className={`p-3.5 rounded-xl text-xs flex items-start gap-2.5 ${
                statusMessage.type === 'success'
                  ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
                  : statusMessage.type === 'error'
                  ? 'bg-rose-50 border border-rose-200 text-rose-800'
                  : 'bg-blue-50 border border-blue-200 text-blue-800'
              }`}
            >
              {statusMessage.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              )}
              <div className="flex-1 font-medium">{statusMessage.text}</div>
            </div>
          )}

          {/* Connection Status Box */}
          <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-white shadow-xs border border-slate-200 flex items-center justify-center shrink-0">
                <svg className="w-4 h-4" viewBox="0 0 24 24">
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
              </div>
              <div>
                <p className="text-xs font-bold text-slate-800">
                  {accessToken ? 'Google Drive Connected' : 'Google Drive Not Connected'}
                </p>
                <p className="text-[11px] text-slate-500">
                  {currentUser.googleEmail
                    ? `Account: ${currentUser.googleEmail}`
                    : accessToken
                    ? 'Authenticated for active session'
                    : 'Link your Google account to save data directly to Drive'}
                </p>
              </div>
            </div>

            <button
              onClick={handleConnectGoogle}
              disabled={isConnecting}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition shrink-0 ${
                accessToken
                  ? 'border-slate-300 text-slate-700 hover:bg-slate-100'
                  : 'bg-blue-700 hover:bg-blue-800 text-white border-blue-700 shadow-xs'
              }`}
            >
              {isConnecting
                ? 'Connecting...'
                : accessToken
                ? 'Re-authorize Account'
                : 'Connect Google Drive'}
            </button>
          </div>

          {/* Action: Save Snapshot Now */}
          <div className="p-4 rounded-xl border-2 border-dashed border-blue-200 bg-blue-50/50 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div>
              <h3 className="text-sm font-bold text-blue-950 flex items-center gap-1.5">
                <UploadCloud className="w-4 h-4 text-blue-700" />
                <span>Save Snapshot to Google Drive</span>
              </h3>
              <p className="text-xs text-blue-800/80 mt-0.5">
                Uploads a verified JSON package containing your School Profile, Personnel List,
                Form 48 logs, and Audit trails into &ldquo;DepEd AO II Portal Backups&rdquo;.
              </p>
            </div>

            <button
              onClick={handleBackupNow}
              disabled={isBackingUp || !accessToken}
              className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-[#1e3a8a] hover:bg-blue-900 text-white font-bold text-xs shadow-md transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 shrink-0"
            >
              {isBackingUp ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Saving to Drive...</span>
                </>
              ) : (
                <>
                  <UploadCloud className="w-4 h-4 text-amber-300" />
                  <span>Save Backup to Drive</span>
                </>
              )}
            </button>
          </div>

          {/* Last Saved Link */}
          {lastSavedMeta?.webViewLink && (
            <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs flex items-center justify-between">
              <span className="text-emerald-900 font-medium">
                Latest backup file: <strong>{lastSavedMeta.name}</strong>
              </span>
              <a
                href={lastSavedMeta.webViewLink}
                target="_blank"
                rel="noopener noreferrer"
                className="text-emerald-700 hover:text-emerald-900 font-bold flex items-center gap-1 underline"
              >
                <span>Open in Google Drive</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          )}

          {/* Existing Google Drive Backups List */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                <HardDrive className="w-3.5 h-3.5 text-slate-500" />
                <span>Available Backups in Google Drive</span>
              </h4>
              {accessToken && (
                <button
                  onClick={() => loadBackupsList(accessToken)}
                  disabled={isLoadingBackups}
                  className="text-[11px] text-blue-700 hover:underline flex items-center gap-1 font-medium"
                >
                  <RefreshCw className={`w-3 h-3 ${isLoadingBackups ? 'animate-spin' : ''}`} />
                  <span>Refresh List</span>
                </button>
              )}
            </div>

            {!accessToken ? (
              <div className="p-6 text-center rounded-xl border border-slate-200 bg-slate-50/50 text-slate-500 text-xs">
                Connect your Google account above to view and restore backups stored in your Google Drive.
              </div>
            ) : isLoadingBackups ? (
              <div className="p-6 text-center rounded-xl border border-slate-200 bg-slate-50/50 text-slate-500 text-xs flex items-center justify-center gap-2">
                <RefreshCw className="w-4 h-4 animate-spin text-blue-600" />
                <span>Checking Google Drive folder...</span>
              </div>
            ) : backups.length === 0 ? (
              <div className="p-6 text-center rounded-xl border border-slate-200 bg-slate-50/50 text-slate-500 text-xs">
                No backup files found yet in your &ldquo;DepEd AO II Portal Backups&rdquo; folder. Click &ldquo;Save Backup to Drive&rdquo; above to create your first cloud snapshot.
              </div>
            ) : (
              <div className="divide-y divide-slate-200 rounded-xl border border-slate-200 overflow-hidden bg-white max-h-56 overflow-y-auto">
                {backups.map((b) => (
                  <div key={b.id} className="p-3 hover:bg-slate-50 flex items-center justify-between gap-3 text-xs">
                    <div className="min-w-0 flex items-center gap-2.5">
                      <FileJson className="w-4 h-4 text-amber-600 shrink-0" />
                      <div className="min-w-0">
                        <p className="font-bold text-slate-800 truncate">{b.name}</p>
                        <p className="text-[11px] text-slate-400 flex items-center gap-2">
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {new Date(b.createdTime).toLocaleString('en-PH')}
                          </span>
                          {b.size && <span>&bull; {(parseInt(b.size, 10) / 1024).toFixed(1)} KB</span>}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {b.webViewLink && (
                        <a
                          href={b.webViewLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="Open in Google Drive"
                          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
                        >
                          <ExternalLink className="w-4 h-4" />
                        </a>
                      )}
                      <button
                        onClick={() => handleRestoreBackup(b)}
                        disabled={isRestoring}
                        className="px-2.5 py-1 rounded-lg text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 transition flex items-center gap-1"
                      >
                        <DownloadCloud className="w-3 h-3" />
                        <span>Restore</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Privacy & DepEd Security Note */}
          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-[11px] text-slate-500 flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-blue-700 shrink-0" />
            <span>
              Google Drive access uses restricted file-scope (`drive.file`). The app only accesses files and folders it creates specifically for your DepEd portal backups.
            </span>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="bg-slate-50 p-3.5 sm:p-4 border-t border-slate-200 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-bold text-slate-700 hover:bg-slate-200 transition"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
