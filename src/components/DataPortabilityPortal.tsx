import React, { useState, useRef } from 'react';
import {
  FolderLock,
  Lock,
  Unlock,
  Download,
  Upload,
  KeyRound,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  UserCheck,
  Database,
  FileDown,
  Trash2,
  FolderSync,
  UploadCloud,
} from 'lucide-react';
import {
  encryptDataWithPIN,
  decryptDataWithPIN,
  EncryptedPackage,
} from '../utils/crypto';
import { db, addAuditLog, clearAllPersonnelData } from '../db/dexie';
import { Personnel, UserSession } from '../types';

interface DataPortabilityPortalProps {
  personnelList: Personnel[];
  currentUser: UserSession;
  onRefreshRoster: () => Promise<void>;
  onOpenGoogleDriveModal?: () => void;
}

export const DataPortabilityPortal: React.FC<DataPortabilityPortalProps> = ({
  personnelList,
  currentUser,
  onRefreshRoster,
  onOpenGoogleDriveModal,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Export State
  const [exportScope, setExportScope] = useState<'FULL_DATABASE' | 'SINGLE_TEACHER'>('FULL_DATABASE');
  const [selectedTeacherId, setSelectedTeacherId] = useState<string>(personnelList[0]?.id || '');
  const [exportPin, setExportPin] = useState('');
  const [isExporting, setIsExporting] = useState(false);
  const [exportSuccessMsg, setExportSuccessMsg] = useState('');

  // Import State
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importPin, setImportPin] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const [importStatus, setImportStatus] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  // Handle Export
  const handleExport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!exportPin || exportPin.length < 4) {
      alert('Please enter a secure 4 to 6 digit numeric PIN.');
      return;
    }

    setIsExporting(true);
    setExportSuccessMsg('');

    try {
      let payloadData: unknown;
      let filename = '';

      if (exportScope === 'FULL_DATABASE') {
        const allPersonnel = await db.personnel.toArray();
        const allLogs = await db.auditLogs.toArray();
        payloadData = {
          exportType: 'FULL_DATABASE',
          version: '2026.1',
          division: 'DepEd Zamboanga City Division',
          exportedAt: new Date().toISOString(),
          personnel: allPersonnel,
          auditLogs: allLogs,
        };
        filename = `DepEd_Zamboanga_FullDatabase_Backup_${new Date().toISOString().split('T')[0]}.aoii.enc`;
      } else {
        const teacher = personnelList.find((p) => p.id === selectedTeacherId);
        if (!teacher) {
          alert('Selected teacher not found.');
          setIsExporting(false);
          return;
        }
        payloadData = {
          exportType: 'SINGLE_TEACHER_TRANSFER',
          version: '2026.1',
          division: 'DepEd Zamboanga City Division',
          exportedAt: new Date().toISOString(),
          personnel: [teacher],
        };
        filename = `DepEd_Transfer_Package_${teacher.lastName}_${teacher.id}.aoii.enc`;
      }

      // Encrypt with Web Crypto AES-GCM PBKDF2
      const pkgType = exportScope === 'FULL_DATABASE' ? 'DATABASE_EXPORT' : 'SINGLE_PERSONNEL_EXPORT';
      const encryptedPackage = await encryptDataWithPIN(
        payloadData,
        exportPin,
        pkgType,
        exportScope === 'FULL_DATABASE' ? personnelList.length : 1,
        `DepEd Zamboanga ${exportScope}`
      );

      // Package to JSON file
      const blob = new Blob([JSON.stringify(encryptedPackage, null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);

      await addAuditLog(
        currentUser.username,
        currentUser.role,
        'DATABASE_EXPORT',
        'PIN_ENCRYPTED_EXPORT',
        `Exported encrypted package [Scope: ${exportScope}] protected by 256-bit AES-GCM.`
      );

      setExportSuccessMsg(`Successfully generated and downloaded encrypted archive: ${filename}`);
      setExportPin('');
    } catch (err) {
      console.error('Export failed:', err);
      alert('Encryption or export error. Please retry.');
    } finally {
      setIsExporting(false);
    }
  };

  // Handle File Selection for Decryption & Ingestion
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setImportFile(e.target.files[0]);
      setImportStatus(null);
    }
  };

  // Handle Decryption & Ingestion
  const handleImport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!importFile) {
      alert('Please select an .aoii.enc container file first.');
      return;
    }
    if (!importPin) {
      alert('Please provide the encryption PIN to unlock this package.');
      return;
    }

    setIsImporting(true);
    setImportStatus(null);

    try {
      const fileText = await importFile.text();
      const parsedPackage: EncryptedPackage = JSON.parse(fileText);

      if (!parsedPackage.salt || !parsedPackage.iv || !parsedPackage.ciphertext) {
        throw new Error('Invalid file format. File does not appear to be an .aoii.enc encrypted package.');
      }

      // Decrypt using Web Crypto API
      const decryptedData = await decryptDataWithPIN<{
        exportType: string;
        personnel?: Personnel[];
        auditLogs?: unknown[];
      }>(parsedPackage, importPin);

      if (!decryptedData || !decryptedData.personnel) {
        throw new Error('Decrypted payload does not contain valid personnel records.');
      }

      // Ingest records into Dexie
      const incomingList = decryptedData.personnel;
      let insertedCount = 0;
      let updatedCount = 0;

      for (const p of incomingList) {
        const existing = await db.personnel.get(p.id);
        if (existing) {
          await db.personnel.put({ ...p, updatedAt: Date.now() });
          updatedCount++;
        } else {
          await db.personnel.add({ ...p, updatedAt: Date.now() });
          insertedCount++;
        }
      }

      await onRefreshRoster();

      await addAuditLog(
        currentUser.username,
        currentUser.role,
        'DATABASE_IMPORT',
        'PIN_DECRYPTED_INGESTION',
        `Successfully decrypted and ingested ${incomingList.length} records (${insertedCount} new, ${updatedCount} updated) from package.`
      );

      setImportStatus({
        type: 'success',
        message: `Package successfully unlocked! Ingested ${incomingList.length} personnel (${insertedCount} newly enrolled, ${updatedCount} updated) without disrupting host school data.`,
      });

      setImportFile(null);
      setImportPin('');
    } catch (err: unknown) {
      console.error('Decryption failed:', err);
      const errMsg = err instanceof Error ? err.message : String(err);
      setImportStatus({
        type: 'error',
        message:
          errMsg.includes('Decryption failed')
            ? 'Incorrect security PIN. Cryptographic signature check failed. Data could not be decrypted.'
            : `Import error: ${errMsg}`,
      });
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Module Banner */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <FolderLock className="w-6 h-6 text-amber-600" />
              <h2 className="text-lg font-bold text-slate-900">
                Secure Data Portability Portal (PIN-Encrypted Container)
              </h2>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Zero-dependency offline database backup and teacher transfer profile exchange using Web Crypto API 256-bit AES-GCM encryption.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="px-3 py-1 rounded-lg text-xs font-semibold bg-amber-50 text-amber-900 border border-amber-300 flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5 text-amber-600" />
              <span>AES-256-GCM / PBKDF2 SHA-256</span>
            </span>
          </div>
        </div>
      </div>

      {/* Google Drive Integration Card */}
      <div className="bg-gradient-to-r from-blue-900 to-indigo-900 rounded-xl p-5 text-white shadow-md flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center shrink-0 border border-white/20">
            <FolderSync className="w-5 h-5 text-amber-300" />
          </div>
          <div>
            <h3 className="text-sm font-bold flex items-center gap-2">
              <span>Google Drive Cloud Backup &amp; Sync</span>
              {currentUser.isGoogleLinked && (
                <span className="px-1.5 py-0.5 rounded text-[10px] bg-emerald-500/30 text-emerald-200 border border-emerald-400/40">
                  Connected
                </span>
              )}
            </h3>
            <p className="text-xs text-blue-200 mt-0.5">
              Directly save or restore complete school database snapshots to your personal or DepEd Google Drive folder.
            </p>
          </div>
        </div>

        {onOpenGoogleDriveModal && (
          <button
            type="button"
            onClick={onOpenGoogleDriveModal}
            className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-900 font-bold text-xs shadow-xs transition flex items-center gap-2 shrink-0 cursor-pointer"
          >
            <UploadCloud className="w-4 h-4 text-slate-900" />
            <span>Open Google Drive Cloud Storage</span>
          </button>
        )}
      </div>

      {/* Main Two-Column Workflow */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Left Column: Export Package */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col justify-between">
          <div className="p-5 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <Download className="w-5 h-5 text-blue-600" />
              <h3 className="text-sm font-bold text-slate-900">Export Encrypted School Archive</h3>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Generate a portable <strong>.aoii.enc</strong> container file protected by a custom numeric PIN for flash-drive transport.
            </p>
          </div>

          <form onSubmit={handleExport} className="p-5 space-y-4 text-xs flex-1 flex flex-col justify-between">
            <div className="space-y-4">
              {/* Scope Selection */}
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Export Scope</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setExportScope('FULL_DATABASE')}
                    className={`p-3 rounded-lg border text-left transition ${
                      exportScope === 'FULL_DATABASE'
                        ? 'border-blue-600 bg-blue-50/50 ring-1 ring-blue-600 text-blue-950 font-bold'
                        : 'border-slate-300 hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <Database className="w-4 h-4 mb-1 text-blue-600" />
                    <span>Full School Database</span>
                    <p className="text-[10.5px] font-normal text-slate-500 mt-0.5">
                      All personnel, DTRs, and audit trail
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setExportScope('SINGLE_TEACHER')}
                    className={`p-3 rounded-lg border text-left transition ${
                      exportScope === 'SINGLE_TEACHER'
                        ? 'border-blue-600 bg-blue-50/50 ring-1 ring-blue-600 text-blue-950 font-bold'
                        : 'border-slate-300 hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <UserCheck className="w-4 h-4 mb-1 text-blue-600" />
                    <span>Single Teacher Transfer</span>
                    <p className="text-[10.5px] font-normal text-slate-500 mt-0.5">
                      For inter-school transfer deployment
                    </p>
                  </button>
                </div>
              </div>

              {/* Single Teacher Picker if chosen */}
              {exportScope === 'SINGLE_TEACHER' && (
                <div>
                  <label htmlFor="select-transferring-teacher" className="block font-semibold text-slate-700 mb-1">
                    Select Transferring Teacher
                  </label>
                  <select
                    id="select-transferring-teacher"
                    aria-label="Select Transferring Teacher"
                    value={selectedTeacherId}
                    onChange={(e) => setSelectedTeacherId(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-xs font-semibold focus:ring-1 focus:ring-blue-600 focus:outline-none text-slate-900"
                  >
                    {personnelList.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.lastName}, {p.firstName} &bull; {p.positionTitle} ({p.id})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Numeric PIN */}
              <div>
                <label className="block font-semibold text-slate-700 mb-1 flex items-center gap-1.5">
                  <KeyRound className="w-3.5 h-3.5 text-amber-600" />
                  <span>Set Security PIN (4 to 6 Digits) *</span>
                </label>
                <input
                  type="password"
                  maxLength={6}
                  placeholder="e.g. 202699"
                  value={exportPin}
                  onChange={(e) => setExportPin(e.target.value.replace(/[^0-9]/g, ''))}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-xs font-mono tracking-widest text-slate-900 focus:ring-1 focus:ring-blue-600 focus:outline-none"
                  required
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  Share this numeric PIN securely with the receiving school's AO II to allow decryption.
                </p>
              </div>

              {exportSuccessMsg && (
                <div className="p-3 bg-emerald-50 rounded-lg border border-emerald-300 text-xs text-emerald-900 flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  <span>{exportSuccessMsg}</span>
                </div>
              )}
            </div>

            <div className="pt-4 border-t border-slate-100">
              <button
                type="submit"
                disabled={isExporting || exportPin.length < 4}
                className="w-full py-2 px-4 rounded-lg bg-blue-900 hover:bg-blue-800 disabled:bg-slate-300 text-white font-bold text-xs transition shadow-sm flex items-center justify-center gap-1.5"
              >
                <Lock className="w-3.5 h-3.5 text-amber-300" />
                <span>{isExporting ? 'Encrypting with AES-GCM...' : 'Generate Encrypted Package'}</span>
              </button>
            </div>
          </form>
        </div>

        {/* Right Column: Import & Ingest Package */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col justify-between">
          <div className="p-5 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <Upload className="w-5 h-5 text-emerald-600" />
              <h3 className="text-sm font-bold text-slate-900">Unlock &amp; Ingest Encrypted Package</h3>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Decrypt an incoming <strong>.aoii.enc</strong> container file and seamlessly merge the transferring teacher or database.
            </p>
          </div>

          <form onSubmit={handleImport} className="p-5 space-y-4 text-xs flex-1 flex flex-col justify-between">
            <div className="space-y-4">
              {/* File Picker */}
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Select Container (.aoii.enc) *
                </label>
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-slate-300 hover:border-emerald-500 rounded-lg p-4 text-center cursor-pointer bg-slate-50/50"
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".enc,.json"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                  <FileDown className="w-6 h-6 text-slate-400 mx-auto mb-1" />
                  {importFile ? (
                    <span className="font-bold text-emerald-700 block">{importFile.name}</span>
                  ) : (
                    <span className="text-slate-500 text-xs">Click to browse or drop .aoii.enc file</span>
                  )}
                </div>
              </div>

              {/* Decryption PIN */}
              <div>
                <label className="block font-semibold text-slate-700 mb-1 flex items-center gap-1.5">
                  <KeyRound className="w-3.5 h-3.5 text-amber-600" />
                  <span>Enter Decryption PIN *</span>
                </label>
                <input
                  type="password"
                  maxLength={6}
                  placeholder="Enter 4-6 digit PIN"
                  value={importPin}
                  onChange={(e) => setImportPin(e.target.value.replace(/[^0-9]/g, ''))}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-xs font-mono tracking-widest text-slate-900 focus:ring-1 focus:ring-emerald-600 focus:outline-none"
                  required
                />
              </div>

              {importStatus && (
                <div
                  className={`p-3 rounded-lg border text-xs flex items-start gap-2 ${
                    importStatus.type === 'success'
                      ? 'bg-emerald-50 border-emerald-300 text-emerald-950'
                      : 'bg-rose-50 border-rose-300 text-rose-950'
                  }`}
                >
                  {importStatus.type === 'success' ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  )}
                  <span>{importStatus.message}</span>
                </div>
              )}
            </div>

            <div className="pt-4 border-t border-slate-100">
              <button
                type="submit"
                disabled={isImporting || !importFile || !importPin}
                className="w-full py-2 px-4 rounded-lg bg-emerald-700 hover:bg-emerald-600 disabled:bg-slate-300 text-white font-bold text-xs transition shadow-sm flex items-center justify-center gap-1.5"
              >
                <Unlock className="w-3.5 h-3.5 text-white" />
                <span>{isImporting ? 'Verifying & Decrypting...' : 'Unlock & Merge into School Roster'}</span>
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* Database Maintenance & Purge Controls */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Database className="w-5 h-5 text-slate-700" />
              <h3 className="text-sm font-bold text-slate-900">Database Maintenance</h3>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Current local storage status: <strong>{personnelList.length}</strong> personnel records stored in IndexedDB.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={async () => {
                if (window.confirm('Are you sure you want to clear all personnel records from the local database? This action is irreversible.')) {
                  await clearAllPersonnelData();
                  await onRefreshRoster();
                }
              }}
              disabled={personnelList.length === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-50 hover:bg-rose-100 disabled:bg-slate-100 disabled:text-slate-400 text-rose-700 rounded-lg text-xs font-semibold border border-rose-200 disabled:border-slate-200 transition"
            >
              <Trash2 className="w-3.5 h-3.5 text-rose-600" />
              <span>Clear Personnel Database ({personnelList.length})</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
