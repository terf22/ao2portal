import React from 'react';
import {
  Users,
  Award,
  Clock,
  TrendingUp,
  CalendarDays,
  UploadCloud,
  FileCheck2,
  ShieldCheck,
  Building2,
  ArrowRight,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';
import { calculateNOSIEligibility } from '../utils/nosiEngine';
import { formatPHP, getSalary, hasSalaryTrancheData, getLoadedSalaryTranche } from '../data/ssl2026Tranche';
import { Personnel, SchoolProfile, UserSession } from '../types';
import { ActiveTab } from './Sidebar';

interface ExecutiveDashboardProps {
  personnelList: Personnel[];
  currentUser: UserSession;
  selectedStation: string;
  schoolProfile?: SchoolProfile;
  onOpenSchoolModal?: () => void;
  onNavigate: (tab: ActiveTab) => void;
}

export const ExecutiveDashboard: React.FC<ExecutiveDashboardProps> = ({
  personnelList,
  currentUser,
  selectedStation,
  schoolProfile,
  onOpenSchoolModal,
  onNavigate,
}) => {
  // Stats
  const totalCount = personnelList.length;
  const teachingCount = personnelList.filter((p) => p.personnelType === 'Teaching').length;
  const nonTeachingCount = personnelList.filter((p) => p.personnelType === 'Non-Teaching').length;

  const stationPersonnel = personnelList.filter(
    (p) => selectedStation === 'All Stations' || p.schoolStation === selectedStation
  );

  // NOSI Due
  const nosiEvaluations = personnelList.map((p) => calculateNOSIEligibility(p));
  const dueNosi = nosiEvaluations.filter((n) => n.isEligibleNow);
  const upcomingNosi = nosiEvaluations.filter((n) => !n.isEligibleNow && n.daysRemaining <= 180);

  // Dynamic DTR Compliance Calculation
  const personnelWithDTR = personnelList.filter(
    (p) => p.dtrLogs && Object.keys(p.dtrLogs).length > 0
  ).length;
  const dtrCompliancePct = totalCount > 0 ? Math.round((personnelWithDTR / totalCount) * 100) : 0;

  // Dynamic Pending Leaves Calculation
  const pendingLeavesCount = personnelList.reduce((acc, p) => {
    const pending = (p.leaveLedger || []).filter(
      (entry) =>
        entry.type === 'CLAIM' &&
        (!entry.particulars || !entry.particulars.toLowerCase().includes('approved'))
    ).length;
    return acc + pending;
  }, 0);

  // 2026 SSL Tranche Auto-Detection
  const totalMonthlyPayroll = personnelList.reduce((sum, p) => {
    return sum + getSalary(p.salaryGrade, p.stepIncrement);
  }, 0);

  // Annualized Personnel Services (14-Month statutory basis: 12 mos basic + 1 mo Mid-Year + 1 mo Year-End bonus)
  const annualPersonnelServices = totalMonthlyPayroll * 14;

  // Average Salary Grade
  const averageSalaryGrade =
    totalCount > 0
      ? (personnelList.reduce((sum, p) => sum + p.salaryGrade, 0) / totalCount).toFixed(1)
      : '0';

  // Projected increase upon pending NOSI Step execution
  const projectedNosiIncrease = dueNosi.reduce((sum, n) => {
    const currentSal = getSalary(n.personnel.salaryGrade, n.personnel.stepIncrement);
    const nextSal = getSalary(
      n.personnel.salaryGrade,
      Math.min(8, (n.personnel.stepIncrement || 1) + 1)
    );
    return sum + (nextSal - currentSal);
  }, 0);

  // Tranche Grade Distribution
  const gradeDistribution = React.useMemo(() => {
    const map = new Map<
      number,
      { count: number; monthlyTotal: number; positions: Set<string> }
    >();
    personnelList.forEach((p) => {
      const existing = map.get(p.salaryGrade) || {
        count: 0,
        monthlyTotal: 0,
        positions: new Set<string>(),
      };
      existing.count += 1;
      existing.monthlyTotal += getSalary(p.salaryGrade, p.stepIncrement);
      if (p.positionTitle) existing.positions.add(p.positionTitle);
      map.set(p.salaryGrade, existing);
    });
    return Array.from(map.entries())
      .map(([grade, data]) => ({
        grade,
        count: data.count,
        monthlyTotal: data.monthlyTotal,
        positions: Array.from(data.positions),
      }))
      .sort((a, b) => a.grade - b.grade);
  }, [personnelList]);

  return (
    <div className="space-y-6">
      {/* Welcome Banner */}
      <div className="bg-gradient-to-r from-[#1e3a8a] via-blue-900 to-indigo-950 text-white rounded-xl p-6 shadow-sm border border-blue-900/40 relative overflow-hidden">
        <div className="relative z-10">
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full bg-[#d97706] text-white text-[10px] font-bold uppercase tracking-wider shadow-xs">
              {schoolProfile?.division ? `${schoolProfile.region ? `${schoolProfile.region} • ` : ''}${schoolProfile.division}` : 'DepEd Station Portal'}
            </span>
            <span className="text-xs text-blue-200/80">&bull; RA 6758 &amp; CSC Form 48 Standard</span>
          </div>

          <h1 className="text-xl sm:text-2xl font-bold mt-2 text-white tracking-tight">
            Administrative Officer II Operations Portal
          </h1>
          <p className="text-xs text-blue-100/90 mt-1 max-w-2xl leading-relaxed">
            Operating station:{' '}
            <strong className="text-white">
              {selectedStation || schoolProfile?.schoolName || 'Station Not Yet Configured'}
            </strong>
            . Real-time automatic calculation of station staffing, statutory 2026 SSL salary tranche expenditure, CSC Form 48 DTR automation, and 3-year step increment tracking.
          </p>

          <div className="mt-5 flex flex-wrap gap-2.5">
            {(!schoolProfile?.schoolName || !schoolProfile?.schoolId) && onOpenSchoolModal && (
              <button
                onClick={onOpenSchoolModal}
                className="px-3.5 py-1.5 bg-amber-400 hover:bg-amber-300 text-blue-950 rounded-lg text-xs font-bold shadow-sm transition flex items-center gap-1.5"
              >
                <Building2 className="w-3.5 h-3.5" />
                <span>Configure School Details Now</span>
              </button>
            )}
            <button
              onClick={() => onNavigate('PIMS')}
              className="px-3.5 py-1.5 bg-white text-[#1e3a8a] hover:bg-slate-100 rounded-lg text-xs font-bold shadow-sm transition flex items-center gap-1.5"
            >
              <Users className="w-3.5 h-3.5 text-[#1e3a8a]" />
              <span>PIMS Personnel Roster</span>
            </button>
            <button
              onClick={() => onNavigate('FORM48')}
              className="px-3.5 py-1.5 bg-blue-800 hover:bg-blue-700 text-white rounded-lg text-xs font-bold shadow-sm transition flex items-center gap-1.5"
            >
              <Clock className="w-3.5 h-3.5 text-amber-300" />
              <span>Generate Form 48 DTR</span>
            </button>
            <button
              onClick={() => onNavigate('BIOMETRIC_UPLOAD')}
              className="px-3.5 py-1.5 bg-blue-950/80 hover:bg-blue-900 text-white border border-blue-800 rounded-lg text-xs font-semibold transition flex items-center gap-1.5"
            >
              <UploadCloud className="w-3.5 h-3.5 text-blue-300" />
              <span>Import Attendance / Biometrics</span>
            </button>
          </div>
        </div>
      </div>

      {/* First-Time Setup Welcome Banner if clean slate */}
      {totalCount === 0 && (
        <div className="bg-white rounded-xl border-2 border-dashed border-blue-200 p-6 space-y-4">
          <div className="flex items-start gap-3">
            <div className="p-2.5 bg-blue-100 rounded-xl text-blue-800 shrink-0">
              <Building2 className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <h3 className="text-base font-bold text-slate-900">
                Fresh Setup: Enter Your School Details &amp; Build Your Roster
              </h3>
              <p className="text-xs text-slate-600 leading-relaxed max-w-3xl">
                All previous sample data and default configurations have been completely cleared. You can now input your own official DepEd school information, add teachers and staff in PIMS, or upload your biometric logs.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2">
            <div
              onClick={onOpenSchoolModal}
              className="p-4 rounded-lg bg-blue-50/70 border border-blue-200 hover:bg-blue-50 transition cursor-pointer flex flex-col justify-between space-y-3"
            >
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-blue-900 uppercase tracking-wide">Step 1</span>
                  <Building2 className="w-4 h-4 text-blue-700" />
                </div>
                <h4 className="text-sm font-bold text-slate-900 mt-1">School Station Details</h4>
                <p className="text-[11px] text-slate-600 mt-1">
                  {schoolProfile?.schoolName
                    ? `Configured: ${schoolProfile.schoolName} (${schoolProfile.schoolId})`
                    : 'Set your official School Name, 6-digit DepEd ID, and Principal signatory.'}
                </p>
              </div>
              <span className="text-xs font-bold text-blue-700 inline-flex items-center gap-1">
                {schoolProfile?.schoolName ? 'Update Details' : 'Input School Details'} &rarr;
              </span>
            </div>

            <div
              onClick={() => onNavigate('PIMS')}
              className="p-4 rounded-lg bg-emerald-50/70 border border-emerald-200 hover:bg-emerald-50 transition cursor-pointer flex flex-col justify-between space-y-3"
            >
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-emerald-900 uppercase tracking-wide">Step 2</span>
                  <Users className="w-4 h-4 text-emerald-700" />
                </div>
                <h4 className="text-sm font-bold text-slate-900 mt-1">Personnel Information (PIMS)</h4>
                <p className="text-[11px] text-slate-600 mt-1">
                  Add your teaching and non-teaching personnel, plantilla item numbers, and salary grades.
                </p>
              </div>
              <span className="text-xs font-bold text-emerald-700 inline-flex items-center gap-1">
                Add Personnel &rarr;
              </span>
            </div>

            <div
              onClick={() => onNavigate('BIOMETRIC_UPLOAD')}
              className="p-4 rounded-lg bg-purple-50/70 border border-purple-200 hover:bg-purple-50 transition cursor-pointer flex flex-col justify-between space-y-3"
            >
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-purple-900 uppercase tracking-wide">Step 3</span>
                  <UploadCloud className="w-4 h-4 text-purple-700" />
                </div>
                <h4 className="text-sm font-bold text-slate-900 mt-1">Biometric Attendance</h4>
                <p className="text-[11px] text-slate-600 mt-1">
                  Upload daily time log spreadsheets (Excel/CSV) from your biometrics terminal to auto-generate Form 48 DTRs.
                </p>
              </div>
              <span className="text-xs font-bold text-purple-700 inline-flex items-center gap-1">
                Upload Logs &rarr;
              </span>
            </div>
          </div>
        </div>
      )}

      {/* KPI Cards: Dynamic 5-column responsive grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {/* Total Personnel */}
        <div
          onClick={() => onNavigate('PIMS')}
          className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm hover:border-[#1e3a8a] transition cursor-pointer"
        >
          <p className="text-[11px] font-bold text-slate-400 uppercase mb-1 tracking-wider">Total Personnel</p>
          <div className="flex items-end gap-2">
            <span className="text-2xl sm:text-3xl font-bold text-[#1e3a8a]">{totalCount}</span>
            <span className="text-[11px] text-green-600 font-bold mb-1">+{teachingCount} Teaching</span>
          </div>
          <p className="text-[11px] text-slate-500 mt-1 truncate">
            {nonTeachingCount} Non-Teaching &bull; {stationPersonnel.length} at station
          </p>
        </div>

        {/* Salary Tranche Payroll (Adaptive to Custom Upload) */}
        <div
          onClick={() => onNavigate('SSL2026')}
          className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm hover:border-emerald-600 transition cursor-pointer"
        >
          <p className="text-[11px] font-bold text-slate-400 uppercase mb-1 tracking-wider">Salary Tranche</p>
          <div className="flex items-end gap-1.5">
            {hasSalaryTrancheData() ? (
              <span className="text-xl sm:text-2xl font-bold text-emerald-700">
                {formatPHP(totalMonthlyPayroll)}
              </span>
            ) : (
              <span className="text-lg sm:text-xl font-bold text-amber-600">
                Tranche Pending
              </span>
            )}
          </div>
          <p className="text-[11px] text-slate-500 mt-1 truncate">
            {hasSalaryTrancheData()
              ? `Annual: ${formatPHP(annualPersonnelServices)}`
              : 'Click to upload DBM template'}
          </p>
        </div>

        {/* DTR Compliance */}
        <div
          onClick={() => onNavigate('FORM48')}
          className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm hover:border-[#1e3a8a] transition cursor-pointer"
        >
          <p className="text-[11px] font-bold text-slate-400 uppercase mb-1 tracking-wider">DTR Compliance</p>
          <div className="flex items-end gap-2">
            <span className="text-2xl sm:text-3xl font-bold text-[#1e3a8a]">{dtrCompliancePct}%</span>
            <span className="text-[11px] text-slate-400 mb-1">
              {totalCount > 0 ? `${personnelWithDTR}/${totalCount} logged` : '0/0'}
            </span>
          </div>
          <p className="text-[11px] text-slate-500 mt-1 truncate">
            Form 48 records verified
          </p>
        </div>

        {/* NOSI Due Soon */}
        <div
          onClick={() => onNavigate('NOSI')}
          className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm hover:border-[#d97706] transition cursor-pointer"
        >
          <p className="text-[11px] font-bold text-slate-400 uppercase mb-1 tracking-wider">NOSI Due Soon</p>
          <div className="flex items-end gap-2">
            <span className="text-2xl sm:text-3xl font-bold text-[#d97706]">{dueNosi.length}</span>
            <span className="text-[11px] text-slate-400 mb-1">Eligible Now</span>
          </div>
          <p className="text-[11px] text-slate-500 mt-1 truncate">
            {upcomingNosi.length} upcoming in 180 days
          </p>
        </div>

        {/* Pending Leaves */}
        <div
          onClick={() => onNavigate('LEAVE_LEDGER')}
          className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm hover:border-[#1e3a8a] transition cursor-pointer"
        >
          <p className="text-[11px] font-bold text-slate-400 uppercase mb-1 tracking-wider">Pending Leaves</p>
          <div className="flex items-end gap-2">
            <span className="text-2xl sm:text-3xl font-bold text-[#1e3a8a]">{pendingLeavesCount}</span>
            <span className="text-[11px] text-amber-600 font-bold mb-1">
              {pendingLeavesCount > 0 ? 'Requires Action' : 'All Cleared'}
            </span>
          </div>
          <p className="text-[11px] text-slate-500 mt-1 truncate">
            Service credits &amp; CSC leaves
          </p>
        </div>
      </div>

      {/* Dedicated 2026 Salary Tranche Auto-Detection Banner */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <TrendingUp className="w-5 h-5 text-emerald-600 shrink-0" />
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                2026 Salary Standardization Law (SSL) Tranche Auto-Detection
              </h3>
              <p className="text-xs text-slate-500">
                Statutory salary matrix and station personnel services budget computed live from active personnel roster.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => onNavigate('SSL2026')}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-lg text-xs font-bold transition"
            >
              <span>Explore Full 2026 SSL Matrix</span>
              <ArrowRight className="w-3.5 h-3.5 text-emerald-700" />
            </button>
          </div>
        </div>

        {totalCount === 0 ? (
          <div className="py-6 text-center text-slate-400 text-xs italic space-y-2">
            <p>
              2026 SSL Tranche Auto-Detector is currently on standby (0 personnel records detected).
            </p>
            <p className="text-[11px] text-slate-400">
              When personnel are added or imported, their Salary Grade (1–33) and Step (1–8) are automatically correlated with the national salary matrix.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* 4-Stat Micro Dashboard */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
                <span className="text-slate-400 text-[10.5px] uppercase font-bold block mb-0.5">
                  Monthly Basic Payroll
                </span>
                <span className="text-base font-bold text-slate-900">
                  {formatPHP(totalMonthlyPayroll)}
                </span>
              </div>
              <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
                <span className="text-slate-400 text-[10.5px] uppercase font-bold block mb-0.5">
                  Annualized (14 Months)
                </span>
                <span className="text-base font-bold text-slate-900">
                  {formatPHP(annualPersonnelServices)}
                </span>
              </div>
              <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
                <span className="text-slate-400 text-[10.5px] uppercase font-bold block mb-0.5">
                  Average Salary Grade
                </span>
                <span className="text-base font-bold text-blue-900">
                  SG {averageSalaryGrade}
                </span>
              </div>
              <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
                <span className="text-slate-400 text-[10.5px] uppercase font-bold block mb-0.5">
                  Pending NOSI Impact
                </span>
                <span className="text-base font-bold text-amber-700">
                  +{formatPHP(projectedNosiIncrease)}/mo
                </span>
              </div>
            </div>

            {/* Tranche Distribution Badges */}
            <div>
              <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block mb-2">
                Active Salary Grade Tranches Detected at Station:
              </span>
              <div className="flex flex-wrap gap-2">
                {gradeDistribution.map((item) => (
                  <div
                    key={item.grade}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-50/70 border border-emerald-200 text-xs"
                  >
                    <span className="font-bold text-emerald-950 font-mono">
                      SG {item.grade}
                    </span>
                    <span className="text-emerald-700 text-[11px]">
                      ({item.positions.slice(0, 2).join(', ')})
                    </span>
                    <span className="px-1.5 py-0.5 rounded bg-white font-bold text-emerald-800 text-[10.5px] shadow-xs">
                      {item.count} {item.count === 1 ? 'person' : 'personnel'}
                    </span>
                    <span className="font-semibold text-slate-600 font-mono text-[11px]">
                      {formatPHP(item.monthlyTotal)}/mo
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Main Content Area: Recent Personnel Activity Table & Institutional Advisory */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Recent Personnel Activity (Matching Professional Polish Table) */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-bold text-slate-700 text-sm">Recent Personnel Activity</h3>
              <div className="flex gap-2">
                <button
                  onClick={() => onNavigate('BIOMETRIC_UPLOAD')}
                  className="px-3 py-1 bg-[#1e3a8a] hover:bg-blue-900 text-white text-xs font-bold rounded shadow-sm transition"
                >
                  Import Biometrics
                </button>
                <button
                  onClick={() => onNavigate('PORTABLE_DATA')}
                  className="px-3 py-1 bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-bold rounded border border-slate-200 transition"
                >
                  Export Audit Log
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead className="bg-slate-50 sticky top-0">
                  <tr className="text-[11px] uppercase text-slate-400 font-bold">
                    <th className="px-6 py-3 border-b border-slate-100">Employee ID</th>
                    <th className="px-6 py-3 border-b border-slate-100">Name</th>
                    <th className="px-6 py-3 border-b border-slate-100">Position</th>
                    <th className="px-6 py-3 border-b border-slate-100">Service Status</th>
                    <th className="px-6 py-3 border-b border-slate-100">Last Action</th>
                  </tr>
                </thead>
                <tbody className="text-xs divide-y divide-slate-100 text-slate-700">
                  {personnelList.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-6 py-8 text-center text-slate-400 italic">
                        No personnel records found in the database. Use <strong>Import Biometrics</strong> or the <strong>PIMS Manager</strong> to add school staff.
                      </td>
                    </tr>
                  ) : (
                    personnelList.slice(0, 5).map((p) => {
                      const isDue = dueNosi.some((n) => n.personnel.id === p.id);
                      return (
                        <tr key={p.id} className="hover:bg-slate-50 transition-colors">
                          <td className="px-6 py-3 font-mono font-bold text-slate-900">{p.id}</td>
                          <td className="px-6 py-3 font-semibold text-slate-900">
                            {p.lastName}, {p.firstName}
                          </td>
                          <td className="px-6 py-3 text-slate-600">
                            {p.positionTitle} (SG {p.salaryGrade})
                          </td>
                          <td className="px-6 py-3">
                            {isDue ? (
                              <span className="px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full text-[10px] font-bold uppercase">
                                NOSI Due
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded-full text-[10px] font-bold uppercase">
                                On Track
                              </span>
                            )}
                          </td>
                          <td className="px-6 py-3 text-slate-500 text-[11px]">
                            {isDue ? 'Step increment notice eligible' : 'DTR logged regular hours'}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            <div className="p-4 border-t border-slate-100 bg-slate-50 text-[11px] text-slate-500 flex flex-wrap items-center justify-between gap-2">
              <span>Showing {Math.min(5, personnelList.length)} of {personnelList.length} personnel records</span>
              <span>Offline Cache: Active &bull; Local Encryption Active</span>
            </div>
          </div>

          {/* Quick Module Navigation Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div
              onClick={() => onNavigate('FORM48')}
              className="bg-white p-4 rounded-xl border border-slate-200 hover:border-[#1e3a8a] cursor-pointer transition shadow-sm group"
            >
              <Clock className="w-6 h-6 text-[#1e3a8a] mb-2 group-hover:translate-x-0.5 transition" />
              <h4 className="text-xs font-bold text-slate-900">CSC Form 48 (DTR)</h4>
              <p className="text-[11px] text-slate-500 mt-1">
                Generate official 3.5"×8.5" and A4 2-Up printable DTR cards with late/undertime tally.
              </p>
            </div>

            <div
              onClick={() => onNavigate('LEAVE_LEDGER')}
              className="bg-white p-4 rounded-xl border border-slate-200 hover:border-emerald-600 cursor-pointer transition shadow-sm group"
            >
              <CalendarDays className="w-6 h-6 text-emerald-700 mb-2 group-hover:translate-x-0.5 transition" />
              <h4 className="text-xs font-bold text-slate-900">Leave &amp; Service Credits</h4>
              <p className="text-[11px] text-slate-500 mt-1">
                Claim non-working day service credits for teachers or 1.25 CSC monthly accruals.
              </p>
            </div>

            <div
              onClick={() => onNavigate('SERVICE_RECORDS')}
              className="bg-white p-4 rounded-xl border border-slate-200 hover:border-purple-600 cursor-pointer transition shadow-sm group"
            >
              <FileCheck2 className="w-6 h-6 text-purple-700 mb-2 group-hover:translate-x-0.5 transition" />
              <h4 className="text-xs font-bold text-slate-900">Service Records (EO 54)</h4>
              <p className="text-[11px] text-slate-500 mt-1">
                Manage appointment chronologies, salary adjustments, and print CSC Form 212 records.
              </p>
            </div>
          </div>
        </div>

        {/* Right 1 Col: Institutional Reference & Advisory */}
        <div className="space-y-4">
          <div className="bg-[#1e3a8a] text-white p-5 rounded-xl border border-blue-900 shadow-sm text-xs space-y-3">
            <span className="text-[10px] font-bold text-amber-300 uppercase tracking-wider block">
              Division Circular &bull; AO II Protocol
            </span>
            <h4 className="text-sm font-bold text-white">
              Official DepEd Zamboanga Compliance Standards
            </h4>
            <ul className="space-y-2 text-[11px] text-blue-100">
              <li className="flex items-start gap-2">
                <span className="text-amber-300">&bull;</span>
                <span>
                  <strong>Form 48 Printing:</strong> Print onto official 3.5" × 8.5" cardstock or 2-Up duplex on standard Legal paper.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-amber-300">&bull;</span>
                <span>
                  <strong>NOSI Notice:</strong> Transmit 30 days prior to effective date directly to the Division HRMO.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-amber-300">&bull;</span>
                <span>
                  <strong>Teaching Hours:</strong> Strictly requires 6 hours classroom teaching + 2 hours preparation duties daily.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-amber-300">&bull;</span>
                <span>
                  <strong>Offline Synchronization:</strong> Outbox automatically syncs whenever internet connectivity is detected.
                </span>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};
