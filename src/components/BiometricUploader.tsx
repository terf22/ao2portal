import React, { useState, useRef } from 'react';
import * as XLSX from 'xlsx';
import {
  UploadCloud,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  UserCheck,
  UserPlus,
  Download,
  RefreshCw,
  Layers,
  Clock,
  Sparkles,
  Info,
  Calendar,
  Users,
  FileText,
  HelpCircle,
} from 'lucide-react';
import { parseBiometricOrRosterFile, ParseResult } from '../utils/biometricParser';
import {
  downloadBiometricTemplateCSV,
  downloadBiometricWorkbookTemplate,
} from '../data/sampleBiometricLogs';
import { addAuditLog } from '../db/dexie';
import { ConflictMatch, DTRLog, Personnel, SchoolProfile, UserSession } from '../types';

interface BiometricUploaderProps {
  existingRoster: Personnel[];
  currentUser: UserSession;
  schoolProfile?: SchoolProfile;
  onApplyImport: (
    updatedPersonnel: Personnel[],
    newPersonnel: Personnel[]
  ) => Promise<void>;
}

export const BiometricUploader: React.FC<BiometricUploaderProps> = ({
  existingRoster,
  currentUser,
  schoolProfile,
  onApplyImport,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [parsedData, setParsedData] = useState<ParseResult | null>(null);
  const [showFormatGuide, setShowFormatGuide] = useState(false);

  // Conflict Resolution Flow
  const [unresolvedConflicts, setUnresolvedConflicts] = useState<ConflictMatch[]>([]);
  const [activeConflictIndex, setActiveConflictIndex] = useState<number>(0);
  const [resolvedChoices, setResolvedChoices] = useState<
    Array<{
      action: 'MERGE' | 'CREATE_SEPARATE';
      incoming: Partial<Personnel>;
      existing: Personnel;
    }>
  >([]);

  // Finished import summary
  const [importSummary, setImportSummary] = useState<{
    autoMerged: number;
    resolvedMerged: number;
    brandNew: number;
    totalRows: number;
  } | null>(null);

  const handleProcessFile = async (file: File) => {
    setIsProcessing(true);
    setImportSummary(null);
    try {
      const result = await parseBiometricOrRosterFile(file, existingRoster);
      setParsedData(result);
      setUnresolvedConflicts(result.conflictMatches);
      setActiveConflictIndex(0);
      setResolvedChoices([]);
    } catch (err) {
      console.error('Failed to parse spreadsheet:', err);
      alert('Error reading Excel/CSV file. Please ensure it is a valid spreadsheet.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleProcessFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleProcessFile(e.target.files[0]);
    }
  };

  // Conflict Action: Merge With Existing
  const handleResolveMerge = () => {
    if (!parsedData || unresolvedConflicts.length === 0) return;
    const currentConflict = unresolvedConflicts[activeConflictIndex];

    const nextChoices = [
      ...resolvedChoices,
      {
        action: 'MERGE' as const,
        incoming: currentConflict.incomingRecord,
        existing: currentConflict.existingRecord,
      },
    ];
    setResolvedChoices(nextChoices);

    if (activeConflictIndex < unresolvedConflicts.length - 1) {
      setActiveConflictIndex((prev) => prev + 1);
    } else {
      // All resolved!
      commitFullImport(nextChoices);
    }
  };

  // Conflict Action: Create As Separate Person
  const handleResolveCreateSeparate = () => {
    if (!parsedData || unresolvedConflicts.length === 0) return;
    const currentConflict = unresolvedConflicts[activeConflictIndex];

    const nextChoices = [
      ...resolvedChoices,
      {
        action: 'CREATE_SEPARATE' as const,
        incoming: currentConflict.incomingRecord,
        existing: currentConflict.existingRecord,
      },
    ];
    setResolvedChoices(nextChoices);

    if (activeConflictIndex < unresolvedConflicts.length - 1) {
      setActiveConflictIndex((prev) => prev + 1);
    } else {
      // All resolved!
      commitFullImport(nextChoices);
    }
  };

  const commitFullImport = async (
    allResolutions: Array<{
      action: 'MERGE' | 'CREATE_SEPARATE';
      incoming: Partial<Personnel>;
      existing: Personnel;
    }>
  ) => {
    if (!parsedData) return;

    const updatedList: Personnel[] = [];
    const newList: Personnel[] = [...parsedData.newRecords];

    const countAutoMerged = parsedData.exactMatches.length;
    let countResolvedMerged = 0;

    // 1. Process Condition A: Exact Matches
    for (const match of parsedData.exactMatches) {
      const mergedLogs: Record<string, DTRLog> = {
        ...(match.existing.dtrLogs || {}),
        ...((match.incoming.dtrLogs as Record<string, DTRLog>) || {}),
      };
      updatedList.push({
        ...match.existing,
        biometricId: match.incoming.biometricId || match.existing.biometricId,
        dtrLogs: mergedLogs,
        updatedAt: Date.now(),
      });
    }

    // 2. Process Condition B: User Decisions
    for (const res of allResolutions) {
      if (res.action === 'MERGE') {
        countResolvedMerged++;
        const targetExisting =
          updatedList.find((p) => p.id === res.existing.id) || res.existing;

        const mergedLogs: Record<string, DTRLog> = {
          ...(targetExisting.dtrLogs || {}),
          ...((res.incoming.dtrLogs as Record<string, DTRLog>) || {}),
        };

        const updatedPerson: Personnel = {
          ...targetExisting,
          biometricId: res.incoming.biometricId || targetExisting.biometricId,
          dtrLogs: mergedLogs,
          updatedAt: Date.now(),
        };

        const existingIdx = updatedList.findIndex((p) => p.id === targetExisting.id);
        if (existingIdx >= 0) {
          updatedList[existingIdx] = updatedPerson;
        } else {
          updatedList.push(updatedPerson);
        }
      } else {
        // Create as Separate
        const incomingId = res.incoming.id || `DEPED-ZC-${Math.floor(100000 + Math.random() * 900000)}`;
        const brandNewPerson: Personnel = {
          id: incomingId,
          biometricId: res.incoming.biometricId || incomingId,
          lastName: res.incoming.lastName || 'Staff',
          firstName: res.incoming.firstName || 'Personnel',
          middleName: res.incoming.middleName || '',
          extensionName: res.incoming.extensionName || '',
          positionTitle: res.incoming.positionTitle || 'Teacher I',
          plantillaItemNo: `OSEC-DECSB-${incomingId}`,
          tin: '000-000-000-000',
          dob: '1992-01-01',
          pob: 'Zamboanga City',
          schoolId: res.incoming.schoolId || schoolProfile?.schoolId || '',
          schoolStation: res.incoming.schoolStation || schoolProfile?.schoolName || 'School Station',
          gsisBPNo: '2000000000',
          personnelType: 'Teaching',
          employmentStatus: 'Permanent',
          workSchedule: 'Teaching',
          stepIncrement: 1,
          salaryGrade: 11,
          lastPromotionDate: '2023-01-01',
          lastStepIncrementDate: '2023-01-01',
          continuousServiceStart: '2023-01-01',
          dtrLogs: (res.incoming.dtrLogs as Record<string, DTRLog>) || {},
          serviceCredits: 0,
          vacationLeaveCredits: 0,
          sickLeaveCredits: 0,
          leaveLedger: [],
          serviceRecordBlocks: [],
          lwopDays: 0,
          maternityLeaveDays: 0,
          updatedAt: Date.now(),
        };
        newList.push(brandNewPerson);
      }
    }

    await onApplyImport(updatedList, newList);

    await addAuditLog(
      currentUser.username,
      currentUser.role,
      'EXCEL_IMPORT',
      'BIOMETRIC_IMPORT_COMMITTED',
      `Imported attendance & roster file: ${countAutoMerged} auto-merged, ${countResolvedMerged} user-merged, ${newList.length} new personnel added.`
    );

    setImportSummary({
      autoMerged: countAutoMerged,
      resolvedMerged: countResolvedMerged,
      brandNew: newList.length,
      totalRows: parsedData.totalRowsProcessed,
    });

    setParsedData(null);
    setUnresolvedConflicts([]);
  };

  const currentConflict = unresolvedConflicts[activeConflictIndex];

  return (
    <div className="space-y-6">
      {/* Header Banner & Template Download Controls */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <UploadCloud className="w-6 h-6 text-purple-600" />
              <h2 className="text-lg font-bold text-slate-900">
                Biometrics Terminal &amp; Excel Attendance Importer
              </h2>
            </div>
            <p className="text-xs text-slate-500 mt-1 max-w-2xl">
              Supports native biometric machine export formats (<strong>AC-No., Name, Time</strong>) and consolidated <strong>Form 48</strong> daily sheets. De-duplicates multiple swipes and converts raw punches to Civil Service morning arrival, lunch out, lunch return, and dismissal times.
            </p>
          </div>

          {/* Action Buttons for Templates */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={downloadBiometricTemplateCSV}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 hover:bg-slate-100 text-slate-700 rounded-lg text-xs font-semibold transition border border-slate-300"
              title="Download clean CSV template with AC-No., Name, Time headers"
            >
              <Download className="w-3.5 h-3.5 text-purple-600" />
              <span>Biometric CSV Template</span>
            </button>

            <button
              onClick={downloadBiometricWorkbookTemplate}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 hover:bg-slate-100 text-slate-700 rounded-lg text-xs font-semibold transition border border-slate-300"
              title="Download full Excel workbook with raw punches & Form 48 summary sheets"
            >
              <Download className="w-3.5 h-3.5 text-emerald-600" />
              <span>Master Excel Template (.xlsx)</span>
            </button>
          </div>
        </div>

        {/* Format Guide Toggle */}
        <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="text-slate-500">
            Export raw punches directly from your biometric terminal in CSV or Excel format.
          </div>

          <button
            onClick={() => setShowFormatGuide(!showFormatGuide)}
            className="text-blue-700 hover:text-blue-800 font-semibold inline-flex items-center gap-1"
          >
            <HelpCircle className="w-3.5 h-3.5" />
            <span>{showFormatGuide ? 'Hide Format Specifications' : 'View Format Specifications (AC-No., Name, Time)'}</span>
          </button>
        </div>

        {/* Collapsible Format Specification Drawer */}
        {showFormatGuide && (
          <div className="p-4 bg-slate-50 rounded-lg border border-slate-200 text-xs space-y-3">
            <div className="font-bold text-slate-800 flex items-center gap-1.5">
              <Info className="w-4 h-4 text-purple-600" />
              <span>DepEd Hardware Biometric Format Specifications:</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="p-2.5 bg-white rounded border border-slate-200">
                <span className="font-bold text-purple-900 block font-mono">1. AC-No. (Biometric ID)</span>
                <p className="text-slate-600 mt-1 text-[11px]">
                  Access Control / Enrollee number assigned in the terminal (e.g. <code>80038</code>, <code>200001</code>, <code>5002499</code>). Maps to <code>biometricId</code> and employee ID.
                </p>
              </div>
              <div className="p-2.5 bg-white rounded border border-slate-200">
                <span className="font-bold text-purple-900 block font-mono">2. Name</span>
                <p className="text-slate-600 mt-1 text-[11px]">
                  Enrollee Name. Handles camelCase (<code>Jenevi-veAntido</code> &rarr; <em>Jenevi-ve Antido</em>), typos (<code>Ma Elvie D,R Acma</code> &rarr; <em>Ma Elvie D.R. Acma</em>), and compound surnames (<em>De Los Santos, Dela Cruz</em>).
                </p>
              </div>
              <div className="p-2.5 bg-white rounded border border-slate-200">
                <span className="font-bold text-purple-900 block font-mono">3. Time (Timestamp)</span>
                <p className="text-slate-600 mt-1 text-[11px]">
                  Formatted as <code>MM/DD/YYYY h:mm AM/PM</code>. Multiple punches per day are de-duplicated and sorted into Form 48 Morning Arrival, Lunch Out, Lunch In, and Afternoon Dismissal.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Import Finished Banner */}
      {importSummary && (
        <div className="bg-emerald-50 border border-emerald-300 p-5 rounded-xl text-emerald-950">
          <div className="flex items-center gap-2 font-bold text-sm">
            <CheckCircle2 className="w-5 h-5 text-emerald-600" />
            <span>Biometric Import &amp; Synchronization Completed Successfully!</span>
          </div>
          <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div className="bg-white/80 p-2.5 rounded border border-emerald-200">
              <span className="text-slate-500 block">Total Punches Processed</span>
              <span className="font-bold text-slate-900 text-sm">{importSummary.totalRows}</span>
            </div>
            <div className="bg-white/80 p-2.5 rounded border border-emerald-200">
              <span className="text-slate-500 block">Safe Auto-Merged</span>
              <span className="font-bold text-emerald-700 text-sm">{importSummary.autoMerged}</span>
            </div>
            <div className="bg-white/80 p-2.5 rounded border border-emerald-200">
              <span className="text-slate-500 block">Conflict-Resolved Merges</span>
              <span className="font-bold text-blue-700 text-sm">{importSummary.resolvedMerged}</span>
            </div>
            <div className="bg-white/80 p-2.5 rounded border border-emerald-200">
              <span className="text-slate-500 block">New Personnel Profiles</span>
              <span className="font-bold text-purple-700 text-sm">{importSummary.brandNew}</span>
            </div>
          </div>
          <button
            onClick={() => setImportSummary(null)}
            className="mt-3 text-xs font-semibold text-emerald-700 hover:underline inline-flex items-center gap-1"
          >
            <span>&larr; Upload another biometric log or spreadsheet</span>
          </button>
        </div>
      )}

      {/* Drag & Drop Upload Zone */}
      {!parsedData && !importSummary && (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-all ${
            isDragging
              ? 'border-purple-600 bg-purple-50/50 scale-[1.01]'
              : 'border-slate-300 hover:border-purple-500 bg-white'
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx, .xls, .csv"
            onChange={handleFileInputChange}
            className="hidden"
          />

          <div className="w-16 h-16 rounded-full bg-purple-100 text-purple-600 mx-auto flex items-center justify-center mb-4 shadow-inner">
            {isProcessing ? (
              <RefreshCw className="w-8 h-8 animate-spin" />
            ) : (
              <FileSpreadsheet className="w-8 h-8" />
            )}
          </div>

          <h3 className="text-base font-bold text-slate-800">
            {isProcessing ? 'Analyzing biometric punches & attendance records...' : 'Drop Biometric Log or Personnel Spreadsheet Here'}
          </h3>
          <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
            Compatible with DepEd school biometric terminals (<strong>AC-No., Name, Time</strong>) and consolidated rosters in <strong>.csv</strong>, <strong>.xlsx</strong>, or <strong>.xls</strong> format.
          </p>

          <div className="mt-6 flex justify-center gap-3">
            <span className="px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold shadow-sm inline-flex items-center gap-1.5">
              <UploadCloud className="w-4 h-4" />
              <span>Browse Spreadsheet File</span>
            </span>
          </div>
        </div>
      )}

      {/* Parse Preview & Ready-To-Commit State (When No Ambiguities Exist) */}
      {parsedData && unresolvedConflicts.length === 0 && (
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-100 gap-2">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-600" />
              <h3 className="text-sm font-bold text-slate-900">
                Biometric Punch Analysis Complete — Ready to Commit
              </h3>
            </div>
            <span className="text-xs text-slate-500 font-mono bg-slate-100 px-2.5 py-1 rounded">
              {parsedData.totalRowsProcessed} raw punch rows &bull; {parsedData.exactMatches.length + parsedData.newRecords.length} unique personnel
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div className="p-3.5 bg-emerald-50 rounded-lg border border-emerald-200">
              <div className="flex items-center justify-between">
                <span className="font-bold text-emerald-900 block">
                  Condition A: Safe Auto-Merge ({parsedData.exactMatches.length})
                </span>
                <UserCheck className="w-4 h-4 text-emerald-600" />
              </div>
              <p className="text-emerald-700 mt-1 text-[11px]">
                Matches existing employee ID or Biometric ID and name. Punches will be merged directly into their Form 48 daily cards.
              </p>
            </div>

            <div className="p-3.5 bg-blue-50 rounded-lg border border-blue-200">
              <div className="flex items-center justify-between">
                <span className="font-bold text-blue-900 block">
                  New Personnel Profiles ({parsedData.newRecords.length})
                </span>
                <UserPlus className="w-4 h-4 text-blue-600" />
              </div>
              <p className="text-blue-700 mt-1 text-[11px]">
                New employees detected from biometric hardware. Complete profiles with plantilla, position, and full August 2026 Form 48 logs will be created.
              </p>
            </div>
          </div>

          {/* Detailed Preview Table */}
          <div className="border border-slate-200 rounded-lg overflow-hidden">
            <div className="bg-slate-50 px-4 py-2 text-[11px] font-bold text-slate-600 uppercase tracking-wider border-b border-slate-200 flex justify-between">
              <span>Parsed Personnel &amp; Form 48 Daily Log Summary</span>
              <span>Showing all {parsedData.exactMatches.length + parsedData.newRecords.length} records</span>
            </div>
            <div className="max-h-72 overflow-y-auto divide-y divide-slate-100 text-xs">
              {/* Exact Matches */}
              {parsedData.exactMatches.map((m, idx) => (
                <div key={`exact-${idx}`} className="px-4 py-2.5 flex items-center justify-between hover:bg-slate-50">
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-[11px] bg-purple-100 text-purple-800 px-2 py-0.5 rounded font-bold">
                      AC #{m.incoming.biometricId || m.existing.biometricId || m.existing.id}
                    </span>
                    <div>
                      <div className="font-bold text-slate-800">
                        {m.existing.lastName}, {m.existing.firstName} {m.existing.middleName}
                      </div>
                      <div className="text-[11px] text-slate-500">{m.existing.positionTitle} &bull; {m.existing.schoolStation}</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded">
                      <CheckCircle2 className="w-3 h-3" /> Auto-Merge ({m.mergedLogsCount} days)
                    </span>
                  </div>
                </div>
              ))}

              {/* New Records */}
              {parsedData.newRecords.map((p, idx) => (
                <div key={`new-${idx}`} className="px-4 py-2.5 flex items-center justify-between hover:bg-slate-50">
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-[11px] bg-blue-100 text-blue-800 px-2 py-0.5 rounded font-bold">
                      AC #{p.biometricId || p.id}
                    </span>
                    <div>
                      <div className="font-bold text-slate-800">
                        {p.lastName}, {p.firstName} {p.middleName}
                      </div>
                      <div className="text-[11px] text-slate-500">{p.positionTitle} &bull; {p.schoolStation}</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-700 bg-blue-100 px-2 py-0.5 rounded">
                      <UserPlus className="w-3 h-3" /> New Personnel ({Object.keys(p.dtrLogs || {}).length} days)
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              onClick={() => setParsedData(null)}
              className="px-4 py-2 rounded-lg text-xs text-slate-600 hover:bg-slate-100 font-medium"
            >
              Discard
            </button>
            <button
              onClick={() => commitFullImport([])}
              className="px-5 py-2.5 rounded-lg bg-blue-900 hover:bg-blue-800 text-white text-xs font-bold shadow-sm flex items-center gap-1.5"
            >
              <CheckCircle2 className="w-4 h-4 text-amber-300" />
              <span>Commit &amp; Save Into Form 48 Database</span>
            </button>
          </div>
        </div>
      )}

      {/* Interactive Side-by-Side Conflict Resolution Wizard (Condition B) */}
      {unresolvedConflicts.length > 0 && currentConflict && (
        <div className="bg-white rounded-xl border-2 border-amber-300 shadow-xl overflow-hidden text-slate-900">
          <div className="bg-amber-500 text-slate-950 px-5 py-3 flex items-center justify-between font-bold">
            <div className="flex items-center gap-2 text-sm">
              <AlertTriangle className="w-5 h-5 text-slate-950" />
              <span>
                Conflict Match Detected ({activeConflictIndex + 1} of {unresolvedConflicts.length})
              </span>
            </div>
            <span className="text-xs px-2 py-0.5 rounded bg-slate-950 text-amber-300 font-mono">
              Action Required
            </span>
          </div>

          <div className="p-6 space-y-6">
            <div className="p-3 bg-amber-50 rounded-lg border border-amber-200 text-xs text-amber-900">
              <strong>Collision Details:</strong> {currentConflict.details}
            </div>

            {/* Side-by-Side Comparison Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Existing System Record */}
              <div className="p-4 rounded-xl border border-slate-300 bg-slate-50 space-y-3">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
                  Existing Record in Database
                </span>
                <div>
                  <h4 className="text-base font-bold text-slate-900">
                    {currentConflict.existingRecord.lastName}, {currentConflict.existingRecord.firstName}
                  </h4>
                  <p className="text-xs text-slate-500">{currentConflict.existingRecord.positionTitle}</p>
                </div>
                <div className="text-xs space-y-1 font-mono text-slate-700 bg-white p-3 rounded border border-slate-200">
                  <div>Employee ID: <strong className="text-blue-900">{currentConflict.existingRecord.id}</strong></div>
                  <div>Biometric ID: <strong>{currentConflict.existingRecord.biometricId || 'None assigned'}</strong></div>
                  <div>Station: {currentConflict.existingRecord.schoolStation}</div>
                  <div>Plantilla: {currentConflict.existingRecord.plantillaItemNo}</div>
                </div>
              </div>

              {/* Incoming Record From Biometric Terminal */}
              <div className="p-4 rounded-xl border-2 border-blue-400 bg-blue-50/50 space-y-3">
                <span className="text-[10px] font-bold uppercase tracking-wider text-blue-700 block">
                  Incoming Biometric Terminal Record
                </span>
                <div>
                  <h4 className="text-base font-bold text-blue-950">
                    {currentConflict.incomingRecord.lastName}, {currentConflict.incomingRecord.firstName}
                  </h4>
                  <p className="text-xs text-slate-500">{currentConflict.incomingRecord.positionTitle || 'Teacher I'}</p>
                </div>
                <div className="text-xs space-y-1 font-mono text-slate-700 bg-white p-3 rounded border border-blue-200">
                  <div>Hardware AC-No: <strong className="text-blue-900">{currentConflict.incomingRecord.biometricId || currentConflict.incomingRecord.id}</strong></div>
                  <div>Station: {currentConflict.incomingRecord.schoolStation}</div>
                  <div>
                    Form 48 Days to Attach:{' '}
                    <strong>{Object.keys(currentConflict.incomingRecord.dtrLogs || {}).length} days</strong>
                  </div>
                </div>
              </div>
            </div>

            {/* Decision Actions */}
            <div className="pt-4 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3">
              <span className="text-xs text-slate-500">
                Designate how this record must be integrated into the DepEd Zamboanga division roster:
              </span>

              <div className="flex items-center gap-3">
                <button
                  onClick={handleResolveCreateSeparate}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold shadow-sm"
                  title="Generate a completely new personnel profile in IndexedDB"
                >
                  <UserPlus className="w-4 h-4 text-purple-300" />
                  <span>Create as Separate Person</span>
                </button>

                <button
                  onClick={handleResolveMerge}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-900 hover:bg-blue-800 text-white text-xs font-bold shadow-sm"
                  title="Consolidate logs and data into the existing employee profile"
                >
                  <UserCheck className="w-4 h-4 text-amber-300" />
                  <span>Merge with Existing Record</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
