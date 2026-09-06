import React, { useState, useMemo } from 'react';
import {
  CalendarDays,
  Plus,
  MinusCircle,
  FileCheck2,
  Award,
  CheckCircle2,
  AlertTriangle,
  History,
  ShieldCheck,
  Building,
} from 'lucide-react';
import {
  calculateTeachingServiceCreditBalance,
  calculateNonTeachingLeaveBalances,
  createServiceCreditEntry,
  createServiceCreditOffsetEntry,
  createNonTeachingAvailmentEntry,
  createNonTeachingMonthlyAccrual,
  NonWorkingDayCategory,
} from '../utils/leaveEngine';
import { addAuditLog } from '../db/dexie';
import { LeaveLedgerEntry, Personnel, UserSession } from '../types';

interface LeaveLedgerManagerProps {
  personnelList: Personnel[];
  currentUser: UserSession;
  onUpdatePersonnel: (updated: Personnel) => Promise<void>;
}

export const LeaveLedgerManager: React.FC<LeaveLedgerManagerProps> = ({
  personnelList,
  currentUser,
  onUpdatePersonnel,
}) => {
  const [selectedPersonnelId, setSelectedPersonnelId] = useState<string>(
    personnelList[0]?.id || ''
  );

  // Teaching: Claim Service Credit Modal
  const [isClaimModalOpen, setIsClaimModalOpen] = useState(false);
  const [claimDate, setClaimDate] = useState(new Date().toISOString().split('T')[0]);
  const [claimTitle, setClaimTitle] = useState('Division INSET / Curriculum Alignment');
  const [claimHours, setClaimHours] = useState(8);
  const [claimCategory, setClaimCategory] = useState<NonWorkingDayCategory>('SATURDAY_SUNDAY');
  const [claimReference, setClaimReference] = useState('Division Memorandum No. 104, s. 2026');

  // Teaching: Offset Absences Modal
  const [isOffsetModalOpen, setIsOffsetModalOpen] = useState(false);
  const [offsetDate, setOffsetDate] = useState(new Date().toISOString().split('T')[0]);
  const [offsetDays, setOffsetDays] = useState(1);
  const [offsetReason, setOffsetReason] = useState('Personal emergency offset by approved service credit');

  // Non-Teaching: Availment Modal
  const [isAvailModalOpen, setIsAvailModalOpen] = useState(false);
  const [availCategory, setAvailCategory] = useState<'VL' | 'SL'>('VL');
  const [availDate, setAvailDate] = useState(new Date().toISOString().split('T')[0]);
  const [availDays, setAvailDays] = useState(1);
  const [availReason, setAvailReason] = useState('Vacation Leave application (CS Form 6)');

  // Non-Teaching: Manual Balance Override Modal
  const [isOverrideModalOpen, setIsOverrideModalOpen] = useState(false);
  const [overrideVL, setOverrideVL] = useState<number>(0);
  const [overrideSL, setOverrideSL] = useState<number>(0);

  const activePersonnel = useMemo(() => {
    return (
      personnelList.find((p) => p.id === selectedPersonnelId) ||
      personnelList[0] ||
      null
    );
  }, [personnelList, selectedPersonnelId]);

  const isTeaching = activePersonnel?.personnelType === 'Teaching';

  // Balances
  const serviceCreditBalance = useMemo(() => {
    if (!activePersonnel || !isTeaching) return 0;
    return calculateTeachingServiceCreditBalance(activePersonnel);
  }, [activePersonnel, isTeaching]);

  const nonTeachingBalances = useMemo(() => {
    if (!activePersonnel || isTeaching) return { vacationLeave: 0, sickLeave: 0, totalAccruedMonths: 0 };
    return calculateNonTeachingLeaveBalances(activePersonnel);
  }, [activePersonnel, isTeaching]);

  const ledger: LeaveLedgerEntry[] = activePersonnel?.leaveLedger || [];

  // Submit Claim Service Credit
  const handleClaimSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activePersonnel) return;

    const newEntry = createServiceCreditEntry({
      date: claimDate,
      trainingTitle: claimTitle,
      hoursCompleted: Number(claimHours),
      category: claimCategory,
      referenceDocument: claimReference,
    });

    const updatedLedger = [newEntry, ...ledger];
    const newServiceCredits = (activePersonnel.serviceCredits || 0) + newEntry.amount;

    const updated: Personnel = {
      ...activePersonnel,
      serviceCredits: Math.round(newServiceCredits * 1000) / 1000,
      leaveLedger: updatedLedger,
      updatedAt: Date.now(),
    };

    await onUpdatePersonnel(updated);

    await addAuditLog(
      currentUser.username,
      currentUser.role,
      'LEAVE_MANAGEMENT',
      'SERVICE_CREDIT_EARNED',
      `Credited ${newEntry.amount} service days to ${activePersonnel.lastName} for ${claimTitle} (${claimHours} hrs)`
    );

    setIsClaimModalOpen(false);
  };

  // Submit Absence Offset
  const handleOffsetSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activePersonnel) return;

    const days = Number(offsetDays);
    if (days > serviceCreditBalance) {
      if (!window.confirm('Days to offset exceeds current Service Credit balance! Proceed with administrative override?')) {
        return;
      }
    }

    const newEntry = createServiceCreditOffsetEntry(offsetDate, days, offsetReason);
    const updatedLedger = [newEntry, ...ledger];
    const newServiceCredits = Math.max(0, (activePersonnel.serviceCredits || 0) - days);

    // Also update DTR log for that day if present
    const updatedLogs = { ...(activePersonnel.dtrLogs || {}) };
    if (!updatedLogs[offsetDate]) {
      updatedLogs[offsetDate] = {
        amArrival: '07:30',
        amDeparture: '11:30',
        pmArrival: '12:30',
        pmDeparture: '16:30',
        status: 'OB',
        note: `Absence Offset via Service Credit (${days} day)`,
      };
    } else {
      updatedLogs[offsetDate].note = `Absence Offset via Service Credit (${days} day)`;
    }

    const updated: Personnel = {
      ...activePersonnel,
      serviceCredits: Math.round(newServiceCredits * 1000) / 1000,
      leaveLedger: updatedLedger,
      dtrLogs: updatedLogs,
      updatedAt: Date.now(),
    };

    await onUpdatePersonnel(updated);

    await addAuditLog(
      currentUser.username,
      currentUser.role,
      'LEAVE_MANAGEMENT',
      'SERVICE_CREDIT_OFFSET',
      `Offset ${days} day absence on ${offsetDate} for ${activePersonnel.lastName} using Service Credits.`
    );

    setIsOffsetModalOpen(false);
  };

  // Non-Teaching: Submit Availment
  const handleAvailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activePersonnel) return;

    const days = Number(availDays);
    const currentBal = availCategory === 'VL' ? nonTeachingBalances.vacationLeave : nonTeachingBalances.sickLeave;

    if (days > currentBal) {
      if (!window.confirm(`Requested ${days} day(s) exceeds active ${availCategory} balance (${currentBal} days). Force authorized administrative override?`)) {
        return;
      }
    }

    const newEntry = createNonTeachingAvailmentEntry(availCategory, availDate, days, availReason);
    const updatedLedger = [newEntry, ...ledger];

    let newVL = activePersonnel.vacationLeaveCredits ?? 0;
    let newSL = activePersonnel.sickLeaveCredits ?? 0;
    if (availCategory === 'VL') newVL = Math.max(0, newVL - days);
    if (availCategory === 'SL') newSL = Math.max(0, newSL - days);

    const updated: Personnel = {
      ...activePersonnel,
      vacationLeaveCredits: Math.round(newVL * 100) / 100,
      sickLeaveCredits: Math.round(newSL * 100) / 100,
      leaveLedger: updatedLedger,
      updatedAt: Date.now(),
    };

    await onUpdatePersonnel(updated);

    await addAuditLog(
      currentUser.username,
      currentUser.role,
      'LEAVE_MANAGEMENT',
      'LEAVE_AVAILED',
      `Deducted ${days} ${availCategory} days for ${activePersonnel.lastName} (${availReason})`
    );

    setIsAvailModalOpen(false);
  };

  // Non-Teaching: Monthly Accrual Trigger
  const handleTriggerMonthlyAccrual = async () => {
    if (!activePersonnel) return;
    const monthName = new Date().toLocaleDateString('en-PH', { month: 'long', year: 'numeric' });
    const { vlEntry, slEntry } = createNonTeachingMonthlyAccrual(monthName);

    const updatedLedger = [vlEntry, slEntry, ...ledger];
    const newVL = (activePersonnel.vacationLeaveCredits || 0) + 1.25;
    const newSL = (activePersonnel.sickLeaveCredits || 0) + 1.25;

    const updated: Personnel = {
      ...activePersonnel,
      vacationLeaveCredits: Math.round(newVL * 100) / 100,
      sickLeaveCredits: Math.round(newSL * 100) / 100,
      leaveLedger: updatedLedger,
      updatedAt: Date.now(),
    };

    await onUpdatePersonnel(updated);

    await addAuditLog(
      currentUser.username,
      currentUser.role,
      'LEAVE_MANAGEMENT',
      'CSC_MONTHLY_ACCRUAL',
      `Applied CSC standard monthly accrual (+1.25 VL, +1.25 SL) for ${activePersonnel.lastName} (${monthName})`
    );

    alert(`Successfully credited +1.25 Vacation Leave and +1.25 Sick Leave for ${monthName}!`);
  };

  // Non-Teaching: Manual Override
  const handleOpenOverride = () => {
    if (!activePersonnel) return;
    setOverrideVL(activePersonnel.vacationLeaveCredits || 0);
    setOverrideSL(activePersonnel.sickLeaveCredits || 0);
    setIsOverrideModalOpen(true);
  };

  const handleSaveOverride = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activePersonnel) return;

    const updated: Personnel = {
      ...activePersonnel,
      vacationLeaveCredits: Number(overrideVL),
      sickLeaveCredits: Number(overrideSL),
      updatedAt: Date.now(),
    };

    await onUpdatePersonnel(updated);

    await addAuditLog(
      currentUser.username,
      currentUser.role,
      'LEAVE_MANAGEMENT',
      'ADMIN_BALANCE_OVERRIDE',
      `Manually overwritten leave balances for ${activePersonnel.lastName}: VL=${overrideVL}, SL=${overrideSL}`
    );

    setIsOverrideModalOpen(false);
  };

  if (!activePersonnel) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-12 text-center max-w-xl mx-auto my-8 shadow-sm space-y-3">
        <CalendarDays className="w-10 h-10 text-slate-300 mx-auto" />
        <h3 className="text-base font-bold text-slate-800">No Personnel Records in Database</h3>
        <p className="text-xs text-slate-500 leading-relaxed">
          There are no personnel records available to manage leave ledgers. Add personnel in the <strong>Personnel Manager (PIMS)</strong> to compute teaching service credits and Civil Service vacation/sick leave balances.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Module Banner */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <CalendarDays className="w-6 h-6 text-emerald-600" />
              <h2 className="text-lg font-bold text-slate-900">
                Leave Management &amp; Service Credit Ledger
              </h2>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              DepEd specialized leave computation: Teaching Service Credit accumulation vs. Non-Teaching CSC 1.25 monthly accruals.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <label htmlFor="select-personnel-leave" className="text-xs font-semibold text-slate-700">Personnel:</label>
            <select
              id="select-personnel-leave"
              aria-label="Select Personnel for Leave Ledger"
              value={selectedPersonnelId}
              onChange={(e) => setSelectedPersonnelId(e.target.value)}
              className="bg-slate-50 border border-slate-300 rounded-lg px-3 py-1.5 text-xs text-slate-900 font-semibold focus:ring-1 focus:ring-blue-600 focus:outline-none"
            >
              {personnelList.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.lastName}, {p.firstName} &bull; {p.personnelType} ({p.positionTitle})
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Dynamic Module Interface Based On Personnel Type */}
      {isTeaching ? (
        /* TEACHING PERSONNEL: SERVICE CREDIT ENGINE */
        <div className="space-y-6">
          {/* Status & Balance Card */}
          <div className="bg-gradient-to-r from-blue-900 to-indigo-950 text-white p-6 rounded-xl shadow-md border border-blue-800 flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div>
              <span className="px-2.5 py-0.5 rounded-full bg-blue-700/60 text-amber-300 border border-blue-500/40 text-[10px] font-bold uppercase tracking-wider">
                Teaching Position &bull; RA 4670 Magna Carta for Public School Teachers
              </span>
              <h3 className="text-xl font-bold mt-2">
                {activePersonnel.lastName}, {activePersonnel.firstName}
              </h3>
              <p className="text-xs text-blue-200 mt-0.5">
                {activePersonnel.positionTitle} &bull; {activePersonnel.schoolStation}
              </p>
              <p className="text-xs text-slate-300 mt-2 max-w-xl leading-relaxed">
                Teachers do not earn standard vacation/sick leave. Service credits are earned strictly for official duties, training, and seminars on non-working days (Holidays, Weekends, and Summer Breaks).
              </p>
            </div>

            {/* Service Credit Balance Block */}
            <div className="bg-white/10 backdrop-blur-sm p-4 rounded-xl border border-white/20 text-center min-w-[200px]">
              <span className="text-xs text-blue-200 font-medium block">Available Service Credits</span>
              <div className="text-3xl font-black text-amber-400 font-mono mt-1">
                {serviceCreditBalance.toFixed(3)}
              </div>
              <span className="text-[11px] text-blue-200 block mt-0.5">Days Balance</span>

              <div className="mt-4 flex flex-col gap-2">
                <button
                  onClick={() => setIsClaimModalOpen(true)}
                  className="w-full py-1.5 px-3 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs transition shadow-sm flex items-center justify-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Claim Service Credit</span>
                </button>
                <button
                  onClick={() => setIsOffsetModalOpen(true)}
                  className="w-full py-1.5 px-3 rounded-lg bg-white/20 hover:bg-white/30 text-white font-semibold text-xs transition border border-white/20 flex items-center justify-center gap-1"
                >
                  <MinusCircle className="w-3.5 h-3.5" />
                  <span>Offset Absence</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* NON-TEACHING PERSONNEL: CSC CUMULATIVE LEAVE ACCRUAL */
        <div className="space-y-6">
          <div className="bg-gradient-to-r from-slate-900 to-purple-950 text-white p-6 rounded-xl shadow-md border border-purple-900/50 flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div>
              <span className="px-2.5 py-0.5 rounded-full bg-purple-700/60 text-purple-200 border border-purple-500/40 text-[10px] font-bold uppercase tracking-wider">
                Non-Teaching Civil Service Personnel &bull; CSC Rule XVI Accrual
              </span>
              <h3 className="text-xl font-bold mt-2">
                {activePersonnel.lastName}, {activePersonnel.firstName}
              </h3>
              <p className="text-xs text-purple-200 mt-0.5">
                {activePersonnel.positionTitle} &bull; {activePersonnel.schoolStation}
              </p>
              <p className="text-xs text-slate-300 mt-2 max-w-xl leading-relaxed">
                Standard Civil Service accrual: 1.25 days Vacation Leave + 1.25 days Sick Leave per month of satisfactory continuous service.
              </p>
            </div>

            {/* Dual Balance Indicators */}
            <div className="flex items-center gap-3">
              <div className="bg-white/10 backdrop-blur-sm p-4 rounded-xl border border-white/20 text-center min-w-[130px]">
                <span className="text-xs text-slate-300 font-medium block">Vacation Leave</span>
                <div className="text-2xl font-black text-amber-400 font-mono mt-1">
                  {nonTeachingBalances.vacationLeave.toFixed(2)}
                </div>
                <span className="text-[10px] text-slate-300">Days Active</span>
              </div>

              <div className="bg-white/10 backdrop-blur-sm p-4 rounded-xl border border-white/20 text-center min-w-[130px]">
                <span className="text-xs text-slate-300 font-medium block">Sick Leave</span>
                <div className="text-2xl font-black text-emerald-400 font-mono mt-1">
                  {nonTeachingBalances.sickLeave.toFixed(2)}
                </div>
                <span className="text-[10px] text-slate-300">Days Active</span>
              </div>
            </div>
          </div>

          {/* Quick Action Toolbar for Non-Teaching */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <div className="flex items-center gap-2 text-xs text-slate-600">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              <span>
                Standard Monthly Accrual: <strong>+1.25 VL</strong> and <strong>+1.25 SL</strong> per month.
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleTriggerMonthlyAccrual}
                className="px-3.5 py-1.5 bg-blue-900 hover:bg-blue-800 text-white rounded-lg text-xs font-bold shadow-sm transition"
              >
                + Trigger Monthly 1.25 Accrual
              </button>
              <button
                onClick={() => setIsAvailModalOpen(true)}
                className="px-3.5 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-lg text-xs font-bold shadow-sm transition"
              >
                - File / Avail Leave
              </button>
              <button
                onClick={handleOpenOverride}
                className="px-3 py-1.5 border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-lg text-xs font-semibold transition"
              >
                Manual Balance Override
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Historical Leave Ledger Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <History className="w-4 h-4 text-slate-500" />
            <h4 className="text-sm font-bold text-slate-800">
              Official Transaction Ledger ({ledger.length} entries)
            </h4>
          </div>
          <span className="text-xs text-slate-400">
            Certified record for {activePersonnel.lastName}, {activePersonnel.firstName}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                <th className="p-3">Date</th>
                <th className="p-3">Type</th>
                <th className="p-3">Category</th>
                <th className="p-3">Particulars / Event Details</th>
                <th className="p-3">Reference Memo</th>
                <th className="p-3 text-right">Amount (Days)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-900">
              {ledger.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-6 text-center text-slate-400 italic">
                    No transactions recorded in ledger yet.
                  </td>
                </tr>
              ) : (
                ledger.map((entry) => (
                  <tr key={entry.id} className="hover:bg-slate-50">
                    <td className="p-3 font-mono text-slate-700">{entry.date}</td>
                    <td className="p-3">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          entry.type === 'CREDIT_EARNED' || entry.type === 'ACCRUAL'
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-rose-100 text-rose-800'
                        }`}
                      >
                        {entry.type}
                      </span>
                    </td>
                    <td className="p-3 font-semibold text-slate-700">{entry.leaveCategory}</td>
                    <td className="p-3 text-slate-800">{entry.particulars}</td>
                    <td className="p-3 text-slate-500 font-mono text-[11px]">
                      {entry.referenceDocument || '—'}
                    </td>
                    <td className="p-3 text-right font-mono font-bold">
                      <span
                        className={
                          entry.amount >= 0 ? 'text-emerald-700' : 'text-rose-700'
                        }
                      >
                        {entry.amount >= 0 ? `+${entry.amount}` : entry.amount}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Claim Service Credit Modal */}
      {isClaimModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden text-slate-900">
            <div className="bg-blue-900 text-white p-4 flex items-center justify-between">
              <h3 className="text-sm font-bold flex items-center gap-2">
                <Award className="w-4 h-4 text-amber-400" />
                Claim Teaching Service Credit
              </h3>
              <button
                onClick={() => setIsClaimModalOpen(false)}
                className="text-slate-400 hover:text-white font-bold"
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleClaimSubmit} className="p-5 space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Date of Training / Seminar
                </label>
                <input
                  type="date"
                  value={claimDate}
                  onChange={(e) => setClaimDate(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded px-2.5 py-1.5 text-xs font-mono"
                  required
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Non-Working Day Category
                </label>
                <select
                  value={claimCategory}
                  onChange={(e) => setClaimCategory(e.target.value as NonWorkingDayCategory)}
                  className="w-full bg-slate-50 border border-slate-300 rounded px-2.5 py-1.5 text-xs"
                >
                  <option value="SATURDAY_SUNDAY">Saturday / Sunday Weekend Duty</option>
                  <option value="HOLIDAY">Official National / Division Holiday</option>
                  <option value="SUMMER_VACATION_BREAK">Summer Break (End-of-School-Year)</option>
                  <option value="CHRISTMAS_BREAK">Christmas Vacation Special Duty</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Training / Seminar Title or Activity Description
                </label>
                <input
                  type="text"
                  value={claimTitle}
                  onChange={(e) => setClaimTitle(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded px-2.5 py-1.5 text-xs"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Hours Rendered</label>
                  <input
                    type="number"
                    min={1}
                    max={24}
                    value={claimHours}
                    onChange={(e) => setClaimHours(Number(e.target.value))}
                    className="w-full bg-slate-50 border border-slate-300 rounded px-2.5 py-1.5 text-xs font-mono font-bold"
                    required
                  />
                  <span className="text-[10px] text-slate-500 mt-0.5 block">
                    8 hrs = 1.0 day credit
                  </span>
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Calculated Credits Earned
                  </label>
                  <div className="bg-amber-50 border border-amber-200 rounded px-2.5 py-1.5 text-xs font-mono font-bold text-amber-900">
                    +{(claimHours / 8).toFixed(3)} Days
                  </div>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Authority / Division Memo Reference
                </label>
                <input
                  type="text"
                  value={claimReference}
                  onChange={(e) => setClaimReference(e.target.value)}
                  placeholder="e.g. Division Memorandum No. 104, s. 2026"
                  className="w-full bg-slate-50 border border-slate-300 rounded px-2.5 py-1.5 text-xs"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsClaimModalOpen(false)}
                  className="px-3 py-1.5 rounded-lg text-slate-600 hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-lg bg-blue-900 hover:bg-blue-800 text-white font-semibold flex items-center gap-1"
                >
                  <CheckCircle2 className="w-3.5 h-3.5 text-amber-300" />
                  <span>Credit to Ledger</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Offset Absence Modal */}
      {isOffsetModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden text-slate-900">
            <div className="bg-slate-900 text-white p-4 flex items-center justify-between">
              <h3 className="text-sm font-bold flex items-center gap-2">
                <MinusCircle className="w-4 h-4 text-amber-400" />
                Offset Absence via Service Credits
              </h3>
              <button
                onClick={() => setIsOffsetModalOpen(false)}
                className="text-slate-400 hover:text-white font-bold"
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleOffsetSubmit} className="p-5 space-y-4 text-xs">
              <div className="p-3 bg-blue-50 rounded-lg border border-blue-200 text-blue-900">
                Current Available Balance: <strong>{serviceCreditBalance.toFixed(3)} days</strong>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Date of Absence to Offset
                </label>
                <input
                  type="date"
                  value={offsetDate}
                  onChange={(e) => setOffsetDate(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded px-2.5 py-1.5 text-xs font-mono"
                  required
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Days to Offset (Debit)
                </label>
                <input
                  type="number"
                  step="0.5"
                  min="0.5"
                  max="30"
                  value={offsetDays}
                  onChange={(e) => setOffsetDays(Number(e.target.value))}
                  className="w-full bg-slate-50 border border-slate-300 rounded px-2.5 py-1.5 text-xs font-mono font-bold"
                  required
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Justification / Note
                </label>
                <input
                  type="text"
                  value={offsetReason}
                  onChange={(e) => setOffsetReason(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded px-2.5 py-1.5 text-xs"
                  required
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsOffsetModalOpen(false)}
                  className="px-3 py-1.5 rounded-lg text-slate-600 hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-lg bg-rose-700 hover:bg-rose-600 text-white font-semibold flex items-center gap-1"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Apply Absence Offset</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Non-Teaching Availment Modal */}
      {isAvailModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden text-slate-900">
            <div className="bg-slate-900 text-white p-4 flex items-center justify-between">
              <h3 className="text-sm font-bold flex items-center gap-2">
                <CalendarDays className="w-4 h-4 text-amber-400" />
                File Availment (Non-Teaching Leave)
              </h3>
              <button
                onClick={() => setIsAvailModalOpen(false)}
                className="text-slate-400 hover:text-white font-bold"
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleAvailSubmit} className="p-5 space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Leave Category</label>
                <select
                  value={availCategory}
                  onChange={(e) => setAvailCategory(e.target.value as 'VL' | 'SL')}
                  className="w-full bg-slate-50 border border-slate-300 rounded px-2.5 py-1.5 text-xs font-semibold"
                >
                  <option value="VL">Vacation Leave (VL) - Bal: {nonTeachingBalances.vacationLeave}</option>
                  <option value="SL">Sick Leave (SL) - Bal: {nonTeachingBalances.sickLeave}</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Inclusive Date</label>
                <input
                  type="date"
                  value={availDate}
                  onChange={(e) => setAvailDate(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded px-2.5 py-1.5 text-xs font-mono"
                  required
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Number of Days</label>
                <input
                  type="number"
                  step="0.5"
                  min="0.5"
                  value={availDays}
                  onChange={(e) => setAvailDays(Number(e.target.value))}
                  className="w-full bg-slate-50 border border-slate-300 rounded px-2.5 py-1.5 text-xs font-mono font-bold"
                  required
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Particulars / Reason</label>
                <input
                  type="text"
                  value={availReason}
                  onChange={(e) => setAvailReason(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded px-2.5 py-1.5 text-xs"
                  required
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsAvailModalOpen(false)}
                  className="px-3 py-1.5 rounded-lg text-slate-600 hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-lg bg-blue-900 hover:bg-blue-800 text-white font-semibold"
                >
                  Deduct &amp; Save
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Manual Override Modal */}
      {isOverrideModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden text-slate-900">
            <div className="bg-slate-900 text-white p-4 flex items-center justify-between">
              <h3 className="text-sm font-bold flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-amber-400" />
                Administrative Balance Override
              </h3>
              <button
                onClick={() => setIsOverrideModalOpen(false)}
                className="text-slate-400 hover:text-white font-bold"
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleSaveOverride} className="p-5 space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Vacation Leave (VL) Days
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={overrideVL}
                  onChange={(e) => setOverrideVL(Number(e.target.value))}
                  className="w-full bg-slate-50 border border-slate-300 rounded px-2.5 py-1.5 text-xs font-mono font-bold"
                  required
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Sick Leave (SL) Days
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={overrideSL}
                  onChange={(e) => setOverrideSL(Number(e.target.value))}
                  className="w-full bg-slate-50 border border-slate-300 rounded px-2.5 py-1.5 text-xs font-mono font-bold"
                  required
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsOverrideModalOpen(false)}
                  className="px-3 py-1.5 rounded-lg text-slate-600 hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-lg bg-blue-900 hover:bg-blue-800 text-white font-semibold"
                >
                  Confirm Overwrite
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
