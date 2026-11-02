import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  TrendingUp,
  Search,
  ArrowRight,
  Calculator,
  Users,
  Filter,
  Download,
  UploadCloud,
  Trash2,
  FileSpreadsheet,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  FileText,
  FileCheck2,
  ShieldAlert,
  Sparkles,
  Lock,
} from 'lucide-react';
import {
  getLoadedSalaryTranche,
  hasSalaryTrancheData,
  getSalaryRows,
  getSalary,
  compareSalaryPoints,
  formatPHP,
  downloadSalaryTrancheTemplate,
  exportActiveSalaryTrancheExcel,
  parseSalaryTrancheFile,
  saveSalaryTranche,
  clearSalaryTranche,
  deployOfficialSalaryTranche,
  SalaryTrancheConfig,
} from '../data/ssl2026Tranche';
import { addAuditLog } from '../db/dexie';
import { Personnel, UserSession } from '../types';

interface SSLMatrixExplorerProps {
  personnelList?: Personnel[];
  currentUser?: UserSession;
}

export const SSLMatrixExplorer: React.FC<SSLMatrixExplorerProps> = ({
  personnelList = [],
  currentUser,
}) => {
  const isSuperadmin = currentUser?.role === 'Superadmin';
  // Tranche state & reactive listener
  const [activeTranche, setActiveTranche] = useState<SalaryTrancheConfig | null>(() =>
    getLoadedSalaryTranche()
  );
  const [isTrancheActive, setIsTrancheActive] = useState<boolean>(() => hasSalaryTrancheData());
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // Upload UI State
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null
  );
  const [isDragging, setIsDragging] = useState(false);

  // Filters & Search
  const [searchTerm, setSearchTerm] = useState('');
  const [filterGrade, setFilterGrade] = useState<number | 'ALL'>('ALL');
  const [showStationGradesOnly, setShowStationGradesOnly] = useState(false);

  // Comparison Tool State
  const [pointA_Grade, setPointA_Grade] = useState<number>(11); // Teacher I entry
  const [pointA_Step, setPointA_Step] = useState<number>(1);
  const [pointB_Grade, setPointB_Grade] = useState<number>(13); // Teacher III promotion
  const [pointB_Step, setPointB_Step] = useState<number>(1);

  // Listen to external or internal tranche updates
  useEffect(() => {
    const handleTrancheUpdate = () => {
      setActiveTranche(getLoadedSalaryTranche());
      setIsTrancheActive(hasSalaryTrancheData());
      setRefreshTrigger((prev) => prev + 1);
    };

    window.addEventListener('salary-tranche-updated', handleTrancheUpdate);
    return () => {
      window.removeEventListener('salary-tranche-updated', handleTrancheUpdate);
    };
  }, []);

  // Matrix rows dynamically computed from active tranche
  const matrixRows = useMemo(() => {
    // refreshTrigger is referenced to recompute when custom event fires
    void refreshTrigger;
    return getSalaryRows();
  }, [refreshTrigger, activeTranche]);

  // Active Station Roster Auto-Detection across SSL Tranche
  const staffByGrade = useMemo(() => {
    const map = new Map<number, Personnel[]>();
    personnelList.forEach((p) => {
      const list = map.get(p.salaryGrade) || [];
      list.push(p);
      map.set(p.salaryGrade, list);
    });
    return map;
  }, [personnelList]);

  const activeGrades = useMemo(() => Array.from(staffByGrade.keys()), [staffByGrade]);

  const totalStationMonthlyWages = useMemo(() => {
    if (!isTrancheActive) return 0;
    return personnelList.reduce(
      (sum, p) => sum + getSalary(p.salaryGrade, p.stepIncrement),
      0
    );
  }, [personnelList, isTrancheActive, refreshTrigger]);

  const comparison = useMemo(() => {
    // refreshTrigger triggers re-calculation
    void refreshTrigger;
    return compareSalaryPoints(pointA_Grade, pointA_Step, pointB_Grade, pointB_Step);
  }, [pointA_Grade, pointA_Step, pointB_Grade, pointB_Step, refreshTrigger, activeTranche]);

  // Annual cumulative impact (12 months salary + 1 mo Mid-Year + 1 mo Year-End bonus = 14 months)
  const annualDifferential14Months = comparison.monthlyDifference * 14;

  const filteredMatrix = useMemo(() => {
    return matrixRows.filter((row) => {
      const matchGrade = filterGrade === 'ALL' || row.salaryGrade === filterGrade;
      const term = searchTerm.trim().toLowerCase();
      const matchSearch =
        term === '' ||
        String(row.salaryGrade).includes(term) ||
        `sg ${row.salaryGrade}`.includes(term) ||
        `grade ${row.salaryGrade}`.includes(term) ||
        (staffByGrade.get(row.salaryGrade) || []).some(
          (p) =>
            p.lastName?.toLowerCase().includes(term) ||
            p.firstName?.toLowerCase().includes(term) ||
            p.positionTitle?.toLowerCase().includes(term)
        );
      const matchStation = !showStationGradesOnly || staffByGrade.has(row.salaryGrade);
      return matchGrade && matchSearch && matchStation;
    });
  }, [matrixRows, filterGrade, searchTerm, showStationGradesOnly, staffByGrade]);

  // File Upload Handler
  const handleFileUpload = async (file: File) => {
    setIsUploading(true);
    setUploadMessage(null);

    try {
      const parseResult = await parseSalaryTrancheFile(file);

      if (!parseResult.success || !parseResult.config) {
        setUploadMessage({
          type: 'error',
          text: parseResult.errors.join(' ') || 'Failed to process spreadsheet file.',
        });
        setIsUploading(false);
        return;
      }

      const configWithAuthor: SalaryTrancheConfig = {
        ...parseResult.config,
        updatedBy: currentUser?.fullName || currentUser?.username || 'Division Superadmin',
      };

      saveSalaryTranche(configWithAuthor);
      setActiveTranche(configWithAuthor);
      setIsTrancheActive(true);
      setRefreshTrigger((prev) => prev + 1);

      // Log Audit Entry
      if (currentUser) {
        await addAuditLog(
          currentUser.username,
          currentUser.role,
          'SALARY_TRANCHE',
          'TRANCHE_UPLOAD',
          `Uploaded and deployed salary tranche "${configWithAuthor.title}" with ${parseResult.validGradesCount} configured grades to all AO II roles.`
        );
      }

      setUploadMessage({
        type: 'success',
        text: `Successfully uploaded and deployed "${configWithAuthor.title}" (${parseResult.validGradesCount} Salary Grades). Automatically reflected in all AO II accounts.`,
      });
    } catch (err) {
      setUploadMessage({
        type: 'error',
        text: `Upload error: ${err instanceof Error ? err.message : String(err)}`,
      });
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleDeployPreset = async (preset: 'SSL_2026' | 'SSL_2025') => {
    try {
      const deployed = deployOfficialSalaryTranche(
        preset,
        currentUser?.fullName || currentUser?.username || 'Division Superadmin'
      );
      setActiveTranche(deployed);
      setIsTrancheActive(true);
      setRefreshTrigger((prev) => prev + 1);

      if (currentUser) {
        await addAuditLog(
          currentUser.username,
          currentUser.role,
          'SALARY_TRANCHE',
          'DEPLOY_TRANCHE_PRESET',
          `Deployed "${deployed.title}" division-wide. Automatically reflected in all AO II accounts.`,
          'INFO'
        );
      }

      setUploadMessage({
        type: 'success',
        text: `Successfully deployed "${deployed.title}"! Automatically reflected in the accounts of all AO II roles.`,
      });
    } catch (err) {
      setUploadMessage({
        type: 'error',
        text: `Failed to deploy preset: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  };

  const handleClearTranche = async () => {
    if (
      window.confirm(
        'Are you sure you want to remove the current salary tranche data? All compensation figures, Form 48 wage calculations, and step amounts will reset to zero until a new template is uploaded.'
      )
    ) {
      clearSalaryTranche();
      setActiveTranche(null);
      setIsTrancheActive(false);
      setRefreshTrigger((prev) => prev + 1);

      if (currentUser) {
        await addAuditLog(
          currentUser.username,
          currentUser.role,
          'SALARY_TRANCHE',
          'TRANCHE_CLEAR',
          'Removed active salary tranche data; reverted to blank baseline.'
        );
      }

      setUploadMessage({
        type: 'success',
        text: 'Salary tranche data removed. The system is now in blank template mode.',
      });
    }
  };

  const applyPreset = (sgA: number, stepA: number, sgB: number, stepB: number) => {
    setPointA_Grade(sgA);
    setPointA_Step(stepA);
    setPointB_Grade(sgB);
    setPointB_Step(stepB);
  };

  return (
    <div className="space-y-6">
      {/* Hidden File Input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx, .xls, .csv"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFileUpload(file);
        }}
      />

      {/* Superadmin vs AO II Authority Notice Banner */}
      {isSuperadmin ? (
        <div className="bg-gradient-to-r from-blue-900 to-indigo-950 text-white p-5 rounded-xl border border-blue-800 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded bg-amber-500 text-blue-950 text-[10px] font-bold uppercase tracking-wider">
                Superadmin Authority
              </span>
              <span className="text-xs text-blue-200">Central Tranche Governance</span>
            </div>
            <h3 className="text-base font-bold text-white">
              Official Salary Standardization Law (SSL) Tranche Deployment
            </h3>
            <p className="text-xs text-blue-100 max-w-2xl leading-relaxed">
              As Superadmin, you are responsible for updating the latest statutory Salary Tranche. Any updates deployed here automatically propagate in real-time to the accounts of all <strong className="text-amber-300">AO II roles only</strong> across all division stations.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              onClick={() => handleDeployPreset('SSL_2026')}
              className="px-3 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-lg text-xs shadow-sm transition flex items-center gap-1.5"
              title="Deploy official statutory 2026 SSL VI Tranche (EO 64) to all AO II accounts"
            >
              <Sparkles className="w-4 h-4 text-slate-950" />
              <span>Deploy 2026 SSL Tranche</span>
            </button>
            <button
              onClick={() => handleDeployPreset('SSL_2025')}
              className="px-3 py-2 bg-blue-800 hover:bg-blue-700 text-white font-semibold rounded-lg text-xs border border-blue-600 transition flex items-center gap-1.5"
              title="Deploy 2025 SSL V Tranche schedule"
            >
              <span>Deploy 2025 Tranche</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="bg-gradient-to-r from-emerald-900 to-teal-950 text-white p-4 rounded-xl border border-emerald-800 shadow-sm flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-emerald-500/20 border border-emerald-400/40 flex items-center justify-center shrink-0">
              <CheckCircle2 className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] bg-emerald-400/20 text-emerald-200 px-2 py-0.5 rounded font-bold uppercase tracking-wider">
                  AO II Auto-Reflected Tranche
                </span>
                <span className="text-xs text-emerald-300">&bull; Governed by Division Superadmin</span>
              </div>
              <p className="text-xs text-emerald-100 mt-0.5">
                This official Salary Tranche is deployed by the Division Superadmin and automatically reflected in your station payroll, Form 48 DTR computations, and NOSI 3-year step increments.
              </p>
            </div>
          </div>
          <div className="hidden sm:flex items-center gap-1 text-[11px] text-emerald-200 bg-emerald-950/60 px-3 py-1.5 rounded-lg border border-emerald-800">
            <Lock className="w-3.5 h-3.5 text-emerald-400" />
            <span>Central Managed</span>
          </div>
        </div>
      )}

      {/* Module Banner & Action Bar */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <TrendingUp className="w-6 h-6 text-emerald-600" />
              <h2 className="text-lg font-bold text-slate-900">
                Salary Standardization Law (SSL) Tranche Matrix
              </h2>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Customizable statutory compensation schedule for Salary Grades 1 to 33. {isSuperadmin ? 'Upload or select official circular schedules to publish division-wide.' : 'View official statutory salary rates and correlate with active station staffing.'}
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => downloadSalaryTrancheTemplate()}
              className="px-3 py-2 rounded-lg text-xs font-semibold bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 hover:border-slate-400 transition shadow-sm flex items-center gap-2"
              title="Download standardized DepEd Excel template with SG 1 to 33"
            >
              <Download className="w-4 h-4 text-slate-600" />
              <span>Download Template (.xlsx)</span>
            </button>

            {isSuperadmin && (
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
                className="px-3.5 py-2 rounded-lg text-xs font-bold bg-[#1e3a8a] text-white hover:bg-blue-900 transition shadow-sm flex items-center gap-2"
                title="Upload populated Excel or CSV spreadsheet and deploy to AO II roles"
              >
                {isUploading ? (
                  <RefreshCw className="w-4 h-4 animate-spin text-white" />
                ) : (
                  <UploadCloud className="w-4 h-4 text-white" />
                )}
                <span>{isTrancheActive ? 'Upload & Deploy New (.xlsx)' : 'Upload & Deploy Tranche (.xlsx)'}</span>
              </button>
            )}

            {isTrancheActive && (
              <>
                <button
                  onClick={() => exportActiveSalaryTrancheExcel()}
                  className="px-3 py-2 rounded-lg text-xs font-semibold bg-emerald-50 border border-emerald-300 text-emerald-800 hover:bg-emerald-100 transition shadow-sm flex items-center gap-2"
                  title="Export active table to Excel"
                >
                  <FileSpreadsheet className="w-4 h-4 text-emerald-700" />
                  <span>Export Active (.xlsx)</span>
                </button>

                {isSuperadmin && (
                  <button
                    onClick={handleClearTranche}
                    className="px-3 py-2 rounded-lg text-xs font-semibold bg-rose-50 border border-rose-200 text-rose-700 hover:bg-rose-100 transition shadow-sm flex items-center gap-1.5"
                    title="Remove tranche data and return to blank template"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                    <span>Clear Data</span>
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        {/* Tranche Status Badge Bar */}
        <div className="mt-4 pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-slate-500">Status:</span>
            {isTrancheActive ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-900 font-bold border border-emerald-300">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700" />
                <span>
                  Active Schedule: {activeTranche?.title || 'Custom Upload'}
                  {activeTranche?.updatedBy && (
                    <span className="font-normal text-emerald-800 ml-1">
                      &bull; Deployed by {activeTranche.updatedBy}
                    </span>
                  )}
                  {activeTranche?.uploadedAt && (
                    <span className="font-normal text-emerald-700 ml-1">
                      ({new Date(activeTranche.uploadedAt).toLocaleDateString()})
                    </span>
                  )}
                </span>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-100 text-amber-900 font-bold border border-amber-300">
                <AlertCircle className="w-3.5 h-3.5 text-amber-700" />
                <span>{isSuperadmin ? 'No Salary Tranche Deployed — Click "Deploy 2026 SSL Tranche" above' : 'Tranche Pending Superadmin Deployment'}</span>
              </span>
            )}
          </div>

          {personnelList.length > 0 && (
            <span className="px-2.5 py-1 rounded-lg text-xs font-bold bg-slate-100 text-slate-700 border border-slate-200 flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5 text-slate-500" />
              <span>{isSuperadmin ? 'Division Roster:' : 'Station Roster:'} {personnelList.length} personnel across {activeGrades.length} Salary Grades</span>
            </span>
          )}
        </div>
      </div>

      {/* Upload Notification Message */}
      {uploadMessage && (
        <div
          className={`p-4 rounded-xl border flex items-start justify-between gap-3 text-xs ${
            uploadMessage.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : 'bg-rose-50 border-rose-200 text-rose-900'
          }`}
        >
          <div className="flex items-center gap-2">
            {uploadMessage.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            )}
            <span>{uploadMessage.text}</span>
          </div>
          <button
            onClick={() => setUploadMessage(null)}
            className="text-slate-400 hover:text-slate-600 font-bold text-sm leading-none"
          >
            &times;
          </button>
        </div>
      )}

      {/* Empty State Banner & Drag-Drop Uploader (Visible when no tranche is uploaded) */}
      {!isTrancheActive && (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragging(false);
            const file = e.dataTransfer.files?.[0];
            if (file) handleFileUpload(file);
          }}
          className={`p-6 rounded-xl border-2 border-dashed transition text-center ${
            isDragging
              ? 'border-blue-500 bg-blue-50/70'
              : 'border-slate-300 bg-gradient-to-b from-slate-50 to-white'
          }`}
        >
          <div className="max-w-xl mx-auto space-y-3">
            <div className="w-12 h-12 rounded-full bg-blue-100 text-[#1e3a8a] flex items-center justify-center mx-auto shadow-sm">
              <FileSpreadsheet className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                Salary Tranche Data Has Been Cleared
              </h3>
              <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                As requested, no hardcoded salary figures are pre-loaded into the system. Download our official Excel template pre-structured with DepEd / Civil Service Salary Grades 1 to 33 and Steps 1 to 8, fill in your approved circular rates, and upload the file below.
              </p>
            </div>

            <div className="pt-2 flex flex-wrap items-center justify-center gap-3">
              <button
                onClick={() => downloadSalaryTrancheTemplate()}
                className="px-4 py-2 rounded-lg text-xs font-bold bg-white border border-slate-300 text-slate-700 hover:bg-slate-100 transition shadow-sm flex items-center gap-2"
              >
                <Download className="w-4 h-4 text-slate-600" />
                <span>1. Download Excel Template</span>
              </button>

              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
                className="px-4 py-2 rounded-lg text-xs font-bold bg-[#1e3a8a] text-white hover:bg-blue-900 transition shadow-sm flex items-center gap-2"
              >
                <UploadCloud className="w-4 h-4 text-white" />
                <span>2. Upload Completed Tranche (.xlsx / .csv)</span>
              </button>
            </div>
            <p className="text-[11px] text-slate-400">
              Or drag and drop your completed spreadsheet file directly into this box.
            </p>
          </div>
        </div>
      )}

      {/* Station Auto-Detection Summary Card (Visible if personnel exist & tranche active) */}
      {isTrancheActive && personnelList.length > 0 && (
        <div className="bg-emerald-50/60 border border-emerald-200 rounded-xl p-4 text-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <span className="text-[11px] font-bold text-emerald-950 uppercase tracking-wider block">
                Station Compensation Overview (Uploaded Schedule)
              </span>
              <p className="text-emerald-800 text-xs mt-0.5">
                Total monthly wage bill across detected station personnel: <strong>{formatPHP(totalStationMonthlyWages)}</strong> (Annualized 14-month budget: <strong>{formatPHP(totalStationMonthlyWages * 14)}</strong>).
              </p>
            </div>
            <button
              onClick={() => setShowStationGradesOnly(!showStationGradesOnly)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 shrink-0 ${
                showStationGradesOnly
                  ? 'bg-emerald-800 text-white'
                  : 'bg-white text-emerald-800 border border-emerald-300 hover:bg-emerald-100'
              }`}
            >
              <Filter className="w-3.5 h-3.5" />
              <span>{showStationGradesOnly ? 'Showing Station Grades Only' : 'Filter to Station Grades'}</span>
            </button>
          </div>
        </div>
      )}

      {/* Point-to-Point Comparison Tool */}
      <div className="bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 text-white p-6 rounded-xl shadow-lg border border-slate-800">
        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <Calculator className="w-5 h-5 text-amber-400" />
            <h3 className="text-sm font-bold tracking-wide uppercase">
              Interactive Point-to-Point Compensation Comparison
            </h3>
          </div>
          <span className="text-[11px] text-slate-400">
            {isTrancheActive
              ? 'Calculate statutory salary adjustments, promotions, and 3-year step increments'
              : 'Upload a salary tranche above to activate variance calculations'}
          </span>
        </div>

        {/* Quick Presets */}
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
          <span className="text-slate-400 text-[11px]">Quick Presets:</span>
          <button
            onClick={() => applyPreset(11, 1, 11, 2)}
            className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] border border-slate-700 transition"
          >
            SG 11 (Step 1 → Step 2)
          </button>
          <button
            onClick={() => applyPreset(11, 1, 12, 1)}
            className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] border border-slate-700 transition"
          >
            SG 11 → SG 12
          </button>
          <button
            onClick={() => applyPreset(11, 1, 13, 1)}
            className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] border border-slate-700 transition"
          >
            SG 11 → SG 13
          </button>
          <button
            onClick={() => applyPreset(13, 1, 18, 1)}
            className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] border border-slate-700 transition"
          >
            SG 13 → SG 18
          </button>
        </div>

        {/* Selector Columns */}
        <div className="mt-5 grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
          {/* Point A */}
          <div className="md:col-span-4 bg-slate-800/80 p-4 rounded-xl border border-slate-700">
            <span className="text-[11px] uppercase tracking-wider text-slate-400 font-bold block mb-2">
              Point A: Baseline Salary Grade &amp; Step
            </span>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] text-slate-300 block mb-1">Salary Grade</label>
                <select
                  aria-label="Point A Salary Grade"
                  value={pointA_Grade}
                  onChange={(e) => setPointA_Grade(Number(e.target.value))}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-amber-400"
                >
                  {Array.from({ length: 33 }, (_, i) => i + 1).map((sg) => (
                    <option key={sg} value={sg}>
                      Salary Grade {sg}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[11px] text-slate-300 block mb-1">Step</label>
                <select
                  aria-label="Point A Step"
                  value={pointA_Step}
                  onChange={(e) => setPointA_Step(Number(e.target.value))}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-amber-400"
                >
                  {[1, 2, 3, 4, 5, 6, 7, 8].map((s) => (
                    <option key={s} value={s}>
                      Step {s}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="mt-3 pt-3 border-t border-slate-700/60 flex justify-between items-center text-xs">
              <span className="text-slate-400">Monthly:</span>
              <span className="font-bold text-amber-300 font-mono text-sm">
                {isTrancheActive ? formatPHP(comparison.fromSalary) : '— (Pending Upload)'}
              </span>
            </div>
          </div>

          {/* Center Arrow */}
          <div className="md:col-span-1 flex justify-center text-amber-400">
            <ArrowRight className="w-6 h-6 hidden md:block" />
            <div className="md:hidden text-center text-xs text-slate-400 py-1">TO</div>
          </div>

          {/* Point B */}
          <div className="md:col-span-4 bg-slate-800/80 p-4 rounded-xl border border-slate-700">
            <span className="text-[11px] uppercase tracking-wider text-slate-400 font-bold block mb-2">
              Point B: Target Salary Grade &amp; Step
            </span>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] text-slate-300 block mb-1">Salary Grade</label>
                <select
                  aria-label="Point B Salary Grade"
                  value={pointB_Grade}
                  onChange={(e) => setPointB_Grade(Number(e.target.value))}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-amber-400"
                >
                  {Array.from({ length: 33 }, (_, i) => i + 1).map((sg) => (
                    <option key={sg} value={sg}>
                      Salary Grade {sg}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[11px] text-slate-300 block mb-1">Step</label>
                <select
                  aria-label="Point B Step"
                  value={pointB_Step}
                  onChange={(e) => setPointB_Step(Number(e.target.value))}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-amber-400"
                >
                  {[1, 2, 3, 4, 5, 6, 7, 8].map((s) => (
                    <option key={s} value={s}>
                      Step {s}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="mt-3 pt-3 border-t border-slate-700/60 flex justify-between items-center text-xs">
              <span className="text-slate-400">Monthly:</span>
              <span className="font-bold text-emerald-400 font-mono text-sm">
                {isTrancheActive ? formatPHP(comparison.toSalary) : '— (Pending Upload)'}
              </span>
            </div>
          </div>

          {/* Metric Results Card */}
          <div className="md:col-span-3 bg-blue-900/60 border border-blue-700/60 p-4 rounded-xl flex flex-col justify-between">
            <span className="text-[10px] uppercase font-bold text-blue-300">Variance &amp; Growth</span>
            <div className="my-2">
              <div className="text-xl font-black font-mono text-white">
                {isTrancheActive ? (
                  <>
                    {comparison.monthlyDifference >= 0 ? '+' : ''}
                    {formatPHP(comparison.monthlyDifference)}
                  </>
                ) : (
                  '—'
                )}
              </div>
              <div className="flex items-center gap-2 mt-1">
                {isTrancheActive ? (
                  <>
                    <span
                      className={`text-xs font-bold px-2 py-0.5 rounded ${
                        comparison.monthlyDifference >= 0
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                          : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                      }`}
                    >
                      {comparison.percentageIncrease >= 0 ? '+' : ''}
                      {comparison.percentageIncrease.toFixed(2)}%
                    </span>
                    <span className="text-[10px] text-slate-300">Monthly</span>
                  </>
                ) : (
                  <span className="text-[10px] text-slate-400">Upload tranche to view %</span>
                )}
              </div>
            </div>

            <div className="pt-2 border-t border-blue-800/80 text-[11px] text-slate-300">
              <span>Annual Impact (14 Months):</span>
              <span className="font-bold text-amber-300 block font-mono">
                {isTrancheActive ? (
                  <>
                    {comparison.monthlyDifference >= 0 ? '+' : ''}
                    {formatPHP(annualDifferential14Months)} / yr
                  </>
                ) : (
                  '—'
                )}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Complete 33 Grade Matrix Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {/* Table Search & Filter Bar */}
        <div className="p-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search salary grade (e.g. 11)..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs focus:ring-1 focus:ring-blue-600 focus:outline-none w-56 text-slate-900"
              />
            </div>

            <select
              aria-label="Filter Matrix by Salary Grade"
              value={filterGrade}
              onChange={(e) =>
                setFilterGrade(e.target.value === 'ALL' ? 'ALL' : Number(e.target.value))
              }
              className="bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 font-medium focus:ring-1 focus:ring-blue-600 focus:outline-none"
            >
              <option value="ALL">All Salary Grades (1 - 33)</option>
              {Array.from({ length: 33 }, (_, i) => i + 1).map((sg) => (
                <option key={sg} value={sg}>
                  Salary Grade {sg}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-500">
              Showing <strong>{filteredMatrix.length}</strong> of 33 Salary Grades
            </span>
          </div>
        </div>

        {/* Dense Matrix Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                <th className="p-3 w-32 text-center font-bold">Salary Grade</th>
                {[1, 2, 3, 4, 5, 6, 7, 8].map((s) => (
                  <th key={s} className="p-3 text-right font-mono min-w-[95px]">
                    Step {s}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-900">
              {filteredMatrix.map((row) => {
                const isPointA = row.salaryGrade === pointA_Grade;
                const isPointB = row.salaryGrade === pointB_Grade;
                const staffAtGrade = staffByGrade.get(row.salaryGrade) || [];

                return (
                  <tr
                    key={row.salaryGrade}
                    className={`hover:bg-blue-50/40 transition-colors ${
                      isPointA || isPointB
                        ? 'bg-amber-50/40'
                        : staffAtGrade.length > 0
                        ? 'bg-emerald-50/20'
                        : ''
                    }`}
                  >
                    <td className="p-3 text-center font-bold text-slate-900 font-mono whitespace-nowrap">
                      <div className="flex items-center justify-center gap-1.5">
                        <span className="text-xs font-black text-slate-800">Grade {row.salaryGrade}</span>
                        {staffAtGrade.length > 0 && (
                          <span
                            className="px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 flex items-center gap-0.5"
                            title={`${staffAtGrade.length} personnel at this grade: ${staffAtGrade.map((p) => p.lastName).join(', ')}`}
                          >
                            <Users className="w-2.5 h-2.5 text-emerald-700" />
                            <span>{staffAtGrade.length}</span>
                          </span>
                        )}
                      </div>
                    </td>
                    {[1, 2, 3, 4, 5, 6, 7, 8].map((s) => {
                      const amount = row.steps[s as 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8];
                      const isHighlightedA = isPointA && pointA_Step === s;
                      const isHighlightedB = isPointB && pointB_Step === s;
                      const staffAtStep = staffAtGrade.filter((p) => (p.stepIncrement || 1) === s);
                      const hasValue = isTrancheActive && amount > 0;

                      return (
                        <td
                          key={s}
                          onClick={() => {
                            setPointB_Grade(row.salaryGrade);
                            setPointB_Step(s);
                          }}
                          className={`p-3 text-right font-mono cursor-pointer transition relative ${
                            isHighlightedA
                              ? 'bg-amber-200 text-amber-950 font-bold ring-1 ring-amber-400'
                              : isHighlightedB
                              ? 'bg-emerald-200 text-emerald-950 font-bold ring-1 ring-emerald-400'
                              : staffAtStep.length > 0
                              ? 'bg-emerald-50 text-emerald-950 font-semibold ring-1 ring-emerald-300 hover:bg-emerald-100'
                              : 'hover:bg-slate-100'
                          }`}
                          title={`Click to set SG ${row.salaryGrade} Step ${s} as Target Point B`}
                        >
                          <div className={hasValue ? 'text-slate-900' : 'text-slate-300'}>
                            {hasValue ? formatPHP(amount) : '—'}
                          </div>
                          {staffAtStep.length > 0 && (
                            <div className="text-[9.5px] font-sans font-bold text-emerald-800 bg-emerald-200/70 rounded px-1 mt-0.5 inline-block">
                              {staffAtStep.length} staff
                            </div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
