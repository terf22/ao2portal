import React, { useState, useEffect, useMemo, useCallback } from 'react';
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
  ShieldAlert,
  Megaphone,
  Radio,
  Bell,
  Sparkles,
  Activity,
  UserCheck,
  ArrowRightLeft,
  Info,
  ExternalLink,
} from 'lucide-react';
import { calculateNOSIEligibility } from '../utils/nosiEngine';
import { formatPHP, getSalary, hasSalaryTrancheData, getLoadedSalaryTranche } from '../data/ssl2026Tranche';
import { Announcement, AuditLog, Personnel, SchoolProfile, UserSession } from '../types';
import { ActiveTab } from './Sidebar';
import { getAnnouncements, getAuditLogs, db } from '../db/dexie';

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
  const isSuperadmin = currentUser.role === 'Superadmin';

  // Division-wide Stats
  const totalCount = personnelList.length;
  const teachingCount = personnelList.filter((p) => p.personnelType === 'Teaching').length;
  const nonTeachingCount = personnelList.filter((p) => p.personnelType === 'Non-Teaching').length;

  // Station Stats for non-Superadmin
  const stationPersonnel = personnelList.filter(
    (p) => selectedStation === 'All Stations' || p.schoolStation === selectedStation
  );

  // NOSI Due (for non-Superadmin)
  const nosiEvaluations = useMemo(
    () => personnelList.map((p) => calculateNOSIEligibility(p)),
    [personnelList]
  );
  const dueNosi = useMemo(() => nosiEvaluations.filter((n) => n.isEligibleNow), [nosiEvaluations]);
  const upcomingNosi = useMemo(
    () => nosiEvaluations.filter((n) => !n.isEligibleNow && n.daysRemaining <= 180),
    [nosiEvaluations]
  );

  // DTR Compliance
  const personnelWithDTR = personnelList.filter(
    (p) => p.dtrLogs && Object.keys(p.dtrLogs).length > 0
  ).length;
  const dtrCompliancePct = totalCount > 0 ? Math.round((personnelWithDTR / totalCount) * 100) : 0;

  // Pending Leaves
  const pendingLeavesCount = personnelList.reduce((acc, p) => {
    const pending = (p.leaveLedger || []).filter(
      (entry) =>
        entry.type === 'CLAIM' &&
        (!entry.particulars || !entry.particulars.toLowerCase().includes('approved'))
    ).length;
    return acc + pending;
  }, 0);

  // Tranche Data & Payroll Calculations
  const [activeTranche, setActiveTranche] = useState(() => getLoadedSalaryTranche());
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [recentLogs, setRecentLogs] = useState<AuditLog[]>([]);
  const [userStats, setUserStats] = useState({ total: 0, pending: 0, active: 0 });

  const loadDashboardData = useCallback(async () => {
    try {
      const anns = await getAnnouncements(currentUser.role);
      setAnnouncements(anns);
      setActiveTranche(getLoadedSalaryTranche());

      if (isSuperadmin) {
        const logs = await getAuditLogs(8);
        setRecentLogs(logs);

        const allUsers = await db.users.toArray();
        const pending = allUsers.filter((u) => u.status === 'PENDING').length;
        const active = allUsers.filter((u) => u.status === 'ACTIVE').length;
        setUserStats({ total: allUsers.length, pending, active });
      }
    } catch (err) {
      console.warn('Dashboard data refresh error:', err);
    }
  }, [currentUser.role, isSuperadmin]);

  useEffect(() => {
    loadDashboardData();

    const handleAnnouncements = () => loadDashboardData();
    const handleTranche = () => {
      setActiveTranche(getLoadedSalaryTranche());
      loadDashboardData();
    };

    window.addEventListener('announcements-updated', handleAnnouncements);
    window.addEventListener('salary-tranche-updated', handleTranche);

    const interval = setInterval(loadDashboardData, 8000);

    return () => {
      window.removeEventListener('announcements-updated', handleAnnouncements);
      window.removeEventListener('salary-tranche-updated', handleTranche);
      clearInterval(interval);
    };
  }, [loadDashboardData]);

  const totalMonthlyPayroll = personnelList.reduce((sum, p) => {
    return sum + getSalary(p.salaryGrade, p.stepIncrement);
  }, 0);

  const annualPersonnelServices = totalMonthlyPayroll * 14;

  const averageSalaryGrade =
    totalCount > 0
      ? (personnelList.reduce((sum, p) => sum + p.salaryGrade, 0) / totalCount).toFixed(1)
      : '0';

  const projectedNosiIncrease = dueNosi.reduce((sum, n) => {
    const currentSal = getSalary(n.personnel.salaryGrade, n.personnel.stepIncrement);
    const nextSal = getSalary(
      n.personnel.salaryGrade,
      Math.min(8, (n.personnel.stepIncrement || 1) + 1)
    );
    return sum + (nextSal - currentSal);
  }, 0);

  const gradeDistribution = useMemo(() => {
    const map = new Map<number, { count: number; monthlyTotal: number; positions: Set<string> }>();
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

  // =========================================================================
  // SUPERADMIN DEDICATED DIVISION OVERSIGHT DASHBOARD
  // Strictly without School Details, Form 48, NOSI, or Biometrics merge
  // =========================================================================
  if (isSuperadmin) {
    const activeAnnouncements = announcements.filter((a) => a.isActive);

    return (
      <div className="space-y-6">
        {/* Top Division Oversight Banner */}
        <div className="bg-gradient-to-r from-[#1e3a8a] via-blue-900 to-indigo-950 text-white rounded-xl p-6 shadow-sm border border-blue-900/40 relative overflow-hidden">
          <div className="relative z-10">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="px-2.5 py-0.5 rounded-full bg-amber-500 text-blue-950 text-[10px] font-black uppercase tracking-wider shadow-xs">
                Division Superadmin
              </span>
              <span className="text-xs text-blue-200">
                Department of Education &bull; Division of Zamboanga City
              </span>
              <span className="text-xs text-emerald-300 font-mono flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                Division Master Control Active
              </span>
            </div>

            <h1 className="text-xl sm:text-2xl font-bold mt-2 text-white tracking-tight">
              Division IT &amp; Systems Governance Console
            </h1>
            <p className="text-xs text-blue-100/90 mt-1 max-w-3xl leading-relaxed">
              Division-wide oversight. Manage user account approvals and data transfers, update and deploy the official statutory Salary Tranche (SSL) to all AO II accounts, post broadcast announcements, and monitor real-time audit activity across all stations.
            </p>

            {/* Quick Actions */}
            <div className="mt-5 flex flex-wrap gap-2.5">
              <button
                onClick={() => onNavigate('SUPERADMIN_MONITOR')}
                className="px-3.5 py-1.5 bg-amber-400 hover:bg-amber-300 text-blue-950 rounded-lg text-xs font-bold shadow-sm transition flex items-center gap-1.5"
              >
                <UserCheck className="w-3.5 h-3.5" />
                <span>
                  User Approvals &amp; Governance
                  {userStats.pending > 0 ? ` (${userStats.pending} Pending)` : ''}
                </span>
              </button>

              <button
                onClick={() => onNavigate('SSL2026')}
                className="px-3.5 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 rounded-lg text-xs font-bold shadow-sm transition flex items-center gap-1.5"
              >
                <TrendingUp className="w-3.5 h-3.5" />
                <span>Deploy Salary Tranche (SSL)</span>
              </button>

              <button
                onClick={() => onNavigate('SUPERADMIN_MONITOR')}
                className="px-3.5 py-1.5 bg-white/10 hover:bg-white/20 text-white rounded-lg text-xs font-semibold border border-white/20 transition flex items-center gap-1.5"
              >
                <Megaphone className="w-3.5 h-3.5 text-amber-300" />
                <span>Post Broadcast Announcement</span>
              </button>

              <button
                onClick={() => onNavigate('PIMS')}
                className="px-3.5 py-1.5 bg-white text-[#1e3a8a] hover:bg-slate-100 rounded-lg text-xs font-bold shadow-sm transition flex items-center gap-1.5"
              >
                <Users className="w-3.5 h-3.5 text-[#1e3a8a]" />
                <span>Division Personnel Roster</span>
              </button>
            </div>
          </div>
        </div>

        {/* Superadmin Division KPI Cards (5-Column) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {/* Total Division Personnel */}
          <div
            onClick={() => onNavigate('PIMS')}
            className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm hover:border-[#1e3a8a] transition cursor-pointer"
          >
            <p className="text-[11px] font-bold text-slate-400 uppercase mb-1 tracking-wider">
              Division Personnel
            </p>
            <div className="flex items-end gap-2">
              <span className="text-2xl sm:text-3xl font-bold text-[#1e3a8a]">{totalCount}</span>
              <span className="text-[11px] text-green-600 font-bold mb-1">
                +{teachingCount} Teaching
              </span>
            </div>
            <p className="text-[11px] text-slate-500 mt-1 truncate">
              {nonTeachingCount} Non-Teaching personnel
            </p>
          </div>

          {/* User Accounts & Approvals */}
          <div
            onClick={() => onNavigate('SUPERADMIN_MONITOR')}
            className={`p-4 rounded-xl border shadow-sm transition cursor-pointer ${
              userStats.pending > 0
                ? 'bg-amber-50/70 border-amber-300 hover:border-amber-500'
                : 'bg-white border-slate-200 hover:border-[#1e3a8a]'
            }`}
          >
            <p className="text-[11px] font-bold text-slate-400 uppercase mb-1 tracking-wider">
              User Approvals
            </p>
            <div className="flex items-end gap-2">
              <span
                className={`text-2xl sm:text-3xl font-bold ${
                  userStats.pending > 0 ? 'text-amber-800' : 'text-slate-800'
                }`}
              >
                {userStats.pending}
              </span>
              <span className="text-[11px] text-slate-500 mb-1">
                Pending / {userStats.total} Users
              </span>
            </div>
            <p className="text-[11px] text-slate-500 mt-1 truncate">
              {userStats.active} Active accounts in division
            </p>
          </div>

          {/* Active Division Salary Tranche */}
          <div
            onClick={() => onNavigate('SSL2026')}
            className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm hover:border-emerald-600 transition cursor-pointer"
          >
            <p className="text-[11px] font-bold text-slate-400 uppercase mb-1 tracking-wider">
              Salary Tranche
            </p>
            <div className="flex items-end gap-1.5">
              <span className="text-lg sm:text-xl font-bold text-emerald-700 truncate">
                {activeTranche?.title ? 'Active & Deployed' : 'Not Configured'}
              </span>
            </div>
            <p className="text-[11px] text-emerald-800 mt-1 truncate font-medium">
              Reflected to all AO II roles only
            </p>
          </div>

          {/* Broadcast Announcements */}
          <div
            onClick={() => onNavigate('SUPERADMIN_MONITOR')}
            className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm hover:border-blue-700 transition cursor-pointer"
          >
            <p className="text-[11px] font-bold text-slate-400 uppercase mb-1 tracking-wider">
              Broadcasts
            </p>
            <div className="flex items-end gap-2">
              <span className="text-2xl sm:text-3xl font-bold text-blue-900">
                {activeAnnouncements.length}
              </span>
              <span className="text-[11px] text-slate-500 mb-1">Active Bulletins</span>
            </div>
            <p className="text-[11px] text-slate-500 mt-1 truncate">Click to post announcement</p>
          </div>

          {/* System Activity Stream */}
          <div
            onClick={() => onNavigate('SUPERADMIN_MONITOR')}
            className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm hover:border-indigo-600 transition cursor-pointer"
          >
            <p className="text-[11px] font-bold text-slate-400 uppercase mb-1 tracking-wider">
              Activity Trail
            </p>
            <div className="flex items-end gap-2">
              <span className="text-2xl sm:text-3xl font-bold text-indigo-900">
                {recentLogs.length}
              </span>
              <span className="text-[11px] text-slate-500 mb-1">Recent Events</span>
            </div>
            <p className="text-[11px] text-slate-500 mt-1 truncate">Live cryptographic audit</p>
          </div>
        </div>

        {/* Main Superadmin Content: Announcements & Live Activity Feed */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left 2 Cols: Activity Feed & Active Announcements */}
          <div className="lg:col-span-2 space-y-6">
            {/* Live System Activity Feed */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Activity className="w-4 h-4 text-indigo-600" />
                  <h3 className="font-bold text-slate-800 text-sm">
                    Live System Activity &amp; Audit Feed
                  </h3>
                </div>
                <button
                  onClick={() => onNavigate('SUPERADMIN_MONITOR')}
                  className="text-xs font-bold text-[#1e3a8a] hover:underline flex items-center gap-1"
                >
                  <span>View All Logs</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="divide-y divide-slate-100 max-h-80 overflow-y-auto">
                {recentLogs.length === 0 ? (
                  <div className="p-8 text-center text-slate-400 text-xs italic">
                    No activity logs recorded yet. System events will appear here in real time.
                  </div>
                ) : (
                  recentLogs.map((log) => (
                    <div
                      key={log.id}
                      className="p-3.5 hover:bg-slate-50 transition text-xs flex items-start justify-between gap-3"
                    >
                      <div className="space-y-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-slate-900">{log.actor}</span>
                          <span className="px-1.5 py-0.2 rounded bg-slate-100 text-slate-700 text-[10px] font-semibold">
                            {log.role}
                          </span>
                          <span className="px-1.5 py-0.2 rounded bg-blue-50 text-blue-800 text-[10px] font-bold font-mono">
                            {log.category}
                          </span>
                          <span
                            className={`px-1.5 py-0.2 rounded text-[10px] font-bold ${
                              log.severity === 'CRITICAL'
                                ? 'bg-rose-100 text-rose-800'
                                : log.severity === 'WARNING'
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            {log.severity}
                          </span>
                        </div>
                        <p className="text-slate-600 truncate">{log.details}</p>
                      </div>
                      <span className="text-[10px] text-slate-400 whitespace-nowrap font-mono shrink-0">
                        {new Date(log.timestamp).toLocaleTimeString('en-PH', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Active Announcements Broadcast Widget */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Megaphone className="w-4 h-4 text-amber-600" />
                  <h3 className="font-bold text-slate-800 text-sm">
                    Active Broadcast Announcements
                  </h3>
                </div>
                <button
                  onClick={() => onNavigate('SUPERADMIN_MONITOR')}
                  className="px-3 py-1 bg-[#1e3a8a] hover:bg-blue-900 text-white text-xs font-bold rounded-lg shadow-sm transition flex items-center gap-1.5"
                >
                  <Megaphone className="w-3.5 h-3.5 text-amber-300" />
                  <span>+ Post Announcement</span>
                </button>
              </div>

              <div className="divide-y divide-slate-100">
                {activeAnnouncements.length === 0 ? (
                  <div className="p-8 text-center text-slate-400 text-xs italic">
                    No active announcements broadcasted. Click "+ Post Announcement" to publish a bulletin to specific user roles or all accounts.
                  </div>
                ) : (
                  activeAnnouncements.map((ann) => (
                    <div key={ann.id} className="p-4 hover:bg-slate-50 transition space-y-1.5">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-2">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${
                              ann.priority === 'CRITICAL'
                                ? 'bg-rose-100 text-rose-800 border border-rose-300'
                                : ann.priority === 'URGENT'
                                ? 'bg-amber-100 text-amber-900 border border-amber-300'
                                : 'bg-blue-100 text-blue-800'
                            }`}
                          >
                            {ann.priority}
                          </span>
                          <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-bold text-[10px]">
                            Target: {ann.targetRole === 'ALL' ? 'Broadcast to All' : `${ann.targetRole} Only`}
                          </span>
                        </div>
                        <span className="text-[10px] text-slate-400 font-mono">
                          {new Date(ann.createdAt).toLocaleDateString('en-PH')} &bull; By {ann.author}
                        </span>
                      </div>
                      <h4 className="text-xs font-bold text-slate-900">{ann.title}</h4>
                      <p className="text-xs text-slate-600 leading-relaxed">{ann.content}</p>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Right 1 Col: Superadmin Governance Protocol & Rules */}
          <div className="space-y-4">
            <div className="bg-[#1e3a8a] text-white p-5 rounded-xl border border-blue-900 shadow-sm text-xs space-y-3">
              <span className="text-[10px] font-bold text-amber-300 uppercase tracking-wider block">
                Division Authority &bull; System Governance
              </span>
              <h4 className="text-sm font-bold text-white">
                Superadmin Roles &amp; Operational Responsibilities
              </h4>
              <ul className="space-y-2.5 text-[11px] text-blue-100">
                <li className="flex items-start gap-2">
                  <span className="text-amber-300 font-bold">&bull;</span>
                  <span>
                    <strong>Zero School Assignment:</strong> Superadmin has no single-school station assignment and operates division-wide across all DepEd clusters.
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-amber-300 font-bold">&bull;</span>
                  <span>
                    <strong>Salary Tranche Governance:</strong> Superadmin is solely responsible for uploading or deploying the statutory Salary Tranche (SSL). It automatically reflects in the account of all <strong>AO II roles only</strong>.
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-amber-300 font-bold">&bull;</span>
                  <span>
                    <strong>User Approvals &amp; Account Control:</strong> All newly registered accounts (Principals, AO II, Dept Heads) require Superadmin review and approval before gaining system access.
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-amber-300 font-bold">&bull;</span>
                  <span>
                    <strong>Resignation &amp; Handover Data Transfer:</strong> In case personnel resign or transfer schools, Superadmin can transfer all station roster data to the replacement officer.
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-amber-300 font-bold">&bull;</span>
                  <span>
                    <strong>Broadcast Announcements:</strong> Push official circulars, memos, and urgent notifications targeted to specific roles or broadcast to all division accounts.
                  </span>
                </li>
              </ul>
            </div>

            {/* Quick Link Card to Salary Tranche */}
            <div
              onClick={() => onNavigate('SSL2026')}
              className="bg-white p-4 rounded-xl border border-emerald-200 hover:border-emerald-500 cursor-pointer transition shadow-sm group"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-emerald-600" />
                  <h4 className="text-xs font-bold text-slate-900">
                    Salary Tranche Deployment Center
                  </h4>
                </div>
                <ArrowRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-emerald-700 group-hover:translate-x-0.5 transition" />
              </div>
              <p className="text-[11px] text-slate-500 mt-1.5">
                Current active tranche:{' '}
                <strong className="text-emerald-800">
                  {activeTranche?.title || 'None Deployed'}
                </strong>
                . Click to upload new DBM schedules or deploy official statutory presets.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // =========================================================================
  // OPERATIONAL ROLES (AO II, Admin, DeptHead, Staff)
  // Station-based operations: Form 48, NOSI, Biometrics, Leave Ledger
  // =========================================================================
  const relevantAnnouncements = announcements.filter(
    (a) => a.isActive && (a.targetRole === 'ALL' || a.targetRole === currentUser.role)
  );

  return (
    <div className="space-y-6">
      {/* Official Division Announcements Banner (if active) */}
      {relevantAnnouncements.length > 0 && (
        <div className="space-y-3">
          {relevantAnnouncements.map((ann) => (
            <div
              key={ann.id}
              className={`rounded-xl p-4 shadow-sm border flex items-start gap-3.5 text-xs ${
                ann.priority === 'CRITICAL'
                  ? 'bg-rose-50 border-rose-300 text-rose-950'
                  : ann.priority === 'URGENT'
                  ? 'bg-amber-50 border-amber-300 text-amber-950'
                  : 'bg-blue-50 border-blue-200 text-blue-950'
              }`}
            >
              <div
                className={`p-2 rounded-lg shrink-0 ${
                  ann.priority === 'CRITICAL'
                    ? 'bg-rose-500 text-white'
                    : ann.priority === 'URGENT'
                    ? 'bg-amber-500 text-white'
                    : 'bg-blue-800 text-white'
                }`}
              >
                <Megaphone className="w-4 h-4" />
              </div>
              <div className="space-y-1 min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${
                      ann.priority === 'CRITICAL'
                        ? 'bg-rose-200 text-rose-900'
                        : ann.priority === 'URGENT'
                        ? 'bg-amber-200 text-amber-900'
                        : 'bg-blue-200 text-blue-900'
                    }`}
                  >
                    Division Announcement &bull; {ann.priority}
                  </span>
                  <span className="text-[11px] text-slate-500 font-mono">
                    Published {new Date(ann.createdAt).toLocaleDateString('en-PH')} by {ann.author}
                  </span>
                </div>
                <h4 className="font-bold text-sm text-slate-900">{ann.title}</h4>
                <p className="text-slate-700 leading-relaxed">{ann.content}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Welcome Banner */}
      <div className="bg-gradient-to-r from-[#1e3a8a] via-blue-900 to-indigo-950 text-white rounded-xl p-6 shadow-sm border border-blue-900/40 relative overflow-hidden">
        <div className="relative z-10">
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full bg-[#d97706] text-white text-[10px] font-bold uppercase tracking-wider shadow-xs">
              {schoolProfile?.division
                ? `${schoolProfile.region ? `${schoolProfile.region} • ` : ''}${schoolProfile.division}`
                : 'DepEd Station Portal'}
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
            . Real-time automatic calculation of station staffing, statutory salary tranche expenditure deployed by Superadmin, CSC Form 48 DTR automation, and 3-year step increment tracking.
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
                Input your official DepEd school information, add teachers and staff in PIMS, or upload your biometric logs.
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
                  <span className="text-xs font-bold text-blue-900 uppercase tracking-wide">
                    Step 1
                  </span>
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
                  <span className="text-xs font-bold text-emerald-900 uppercase tracking-wide">
                    Step 2
                  </span>
                  <Users className="w-4 h-4 text-emerald-700" />
                </div>
                <h4 className="text-sm font-bold text-slate-900 mt-1">
                  Personnel Information (PIMS)
                </h4>
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
                  <span className="text-xs font-bold text-purple-900 uppercase tracking-wide">
                    Step 3
                  </span>
                  <UploadCloud className="w-4 h-4 text-purple-700" />
                </div>
                <h4 className="text-sm font-bold text-slate-900 mt-1">Biometric Attendance</h4>
                <p className="text-[11px] text-slate-600 mt-1">
                  Upload daily time log spreadsheets from your biometrics terminal to auto-generate Form 48 DTRs.
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
          <p className="text-[11px] font-bold text-slate-400 uppercase mb-1 tracking-wider">
            Station Personnel
          </p>
          <div className="flex items-end gap-2">
            <span className="text-2xl sm:text-3xl font-bold text-[#1e3a8a]">{totalCount}</span>
            <span className="text-[11px] text-green-600 font-bold mb-1">
              +{teachingCount} Teaching
            </span>
          </div>
          <p className="text-[11px] text-slate-500 mt-1 truncate">
            {nonTeachingCount} Non-Teaching &bull; {stationPersonnel.length} at station
          </p>
        </div>

        {/* Salary Tranche Payroll */}
        <div
          onClick={() => onNavigate('SSL2026')}
          className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm hover:border-emerald-600 transition cursor-pointer"
        >
          <p className="text-[11px] font-bold text-slate-400 uppercase mb-1 tracking-wider">
            Salary Tranche
          </p>
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
              : 'Governed by Superadmin'}
          </p>
        </div>

        {/* DTR Compliance */}
        <div
          onClick={() => onNavigate('FORM48')}
          className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm hover:border-[#1e3a8a] transition cursor-pointer"
        >
          <p className="text-[11px] font-bold text-slate-400 uppercase mb-1 tracking-wider">
            DTR Compliance
          </p>
          <div className="flex items-end gap-2">
            <span className="text-2xl sm:text-3xl font-bold text-[#1e3a8a]">{dtrCompliancePct}%</span>
            <span className="text-[11px] text-slate-400 mb-1">
              {totalCount > 0 ? `${personnelWithDTR}/${totalCount} logged` : '0/0'}
            </span>
          </div>
          <p className="text-[11px] text-slate-500 mt-1 truncate">Form 48 records verified</p>
        </div>

        {/* NOSI Due Soon */}
        <div
          onClick={() => onNavigate('NOSI')}
          className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm hover:border-[#d97706] transition cursor-pointer"
        >
          <p className="text-[11px] font-bold text-slate-400 uppercase mb-1 tracking-wider">
            NOSI Due Soon
          </p>
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
          <p className="text-[11px] font-bold text-slate-400 uppercase mb-1 tracking-wider">
            Pending Leaves
          </p>
          <div className="flex items-end gap-2">
            <span className="text-2xl sm:text-3xl font-bold text-[#1e3a8a]">
              {pendingLeavesCount}
            </span>
            <span className="text-[11px] text-amber-600 font-bold mb-1">
              {pendingLeavesCount > 0 ? 'Requires Action' : 'All Cleared'}
            </span>
          </div>
          <p className="text-[11px] text-slate-500 mt-1 truncate">
            Service credits &amp; CSC leaves
          </p>
        </div>
      </div>

      {/* Dedicated Salary Tranche Auto-Detection Banner for AO II */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <TrendingUp className="w-5 h-5 text-emerald-600 shrink-0" />
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-slate-900">
                  Salary Standardization Law (SSL) Tranche Auto-Detection
                </h3>
                <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-900 text-[10px] font-bold">
                  Deployed by Superadmin
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Statutory salary matrix automatically correlated with station personnel staffing and payroll calculations.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => onNavigate('SSL2026')}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-lg text-xs font-bold transition"
            >
              <span>Explore Active Matrix</span>
              <ArrowRight className="w-3.5 h-3.5 text-emerald-700" />
            </button>
          </div>
        </div>

        {totalCount === 0 ? (
          <div className="py-6 text-center text-slate-400 text-xs italic space-y-2">
            <p>SSL Tranche Auto-Detector is currently on standby (0 personnel records detected).</p>
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
                        No personnel records found. Use <strong>Import Biometrics</strong> or <strong>PIMS Manager</strong> to add staff.
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
              <span>IndexedDB Active &bull; Station Safe Mode</span>
            </div>
          </div>

          {/* Quick Module Navigation Cards for AO II */}
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
                  <strong>Salary Tranche Schedule:</strong> Updates made by the Division Superadmin are automatically applied to your station's personnel calculations.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-amber-300">&bull;</span>
                <span>
                  <strong>Teaching Hours:</strong> Strictly requires 6 hours classroom teaching + 2 hours preparation duties daily.
                </span>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};
