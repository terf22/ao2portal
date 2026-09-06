import React, { useState, useMemo } from 'react';
import {
  Award,
  AlertCircle,
  Clock,
  Printer,
  Download,
  Calendar,
  ShieldCheck,
  CheckCircle2,
  FileCheck,
  Building,
  UserCheck,
} from 'lucide-react';
import { calculateNOSIEligibility } from '../utils/nosiEngine';
import { generateNOSILetterPDF } from '../utils/pdfExport';
import { formatPHP, getSalary } from '../data/ssl2026Tranche';
import { addAuditLog } from '../db/dexie';
import { Personnel, UserSession } from '../types';

interface NOSIEngineProps {
  personnelList: Personnel[];
  currentUser: UserSession;
  onUpdatePersonnel: (updated: Personnel) => Promise<void>;
}

export const NOSIEngine: React.FC<NOSIEngineProps> = ({
  personnelList,
  currentUser,
  onUpdatePersonnel,
}) => {
  const [selectedPersonnelId, setSelectedPersonnelId] = useState<string>(
    personnelList[0]?.id || ''
  );
  const [filterStatus, setFilterStatus] = useState<'ALL' | 'DUE NOW' | 'UPCOMING' | 'ON TRACK' | 'RESET APPLIED'>('ALL');
  const [showLetterPreview, setShowLetterPreview] = useState(false);
  const [isApplyingStep, setIsApplyingStep] = useState(false);

  // Leave adjustment modal
  const [editingLeaveExclusions, setEditingLeaveExclusions] = useState<Personnel | null>(null);
  const [lwopInput, setLwopInput] = useState<number>(0);
  const [maternityInput, setMaternityInput] = useState<number>(0);

  const activePersonnel = useMemo(() => {
    return (
      personnelList.find((p) => p.id === selectedPersonnelId) ||
      personnelList[0] ||
      null
    );
  }, [personnelList, selectedPersonnelId]);

  // Compute NOSI evaluations for all personnel
  const nosiCalculations = useMemo(() => {
    return personnelList.map((p) => ({
      personnel: p,
      result: calculateNOSIEligibility(p),
    }));
  }, [personnelList]);

  const filteredList = useMemo(() => {
    if (filterStatus === 'ALL') return nosiCalculations;
    return nosiCalculations.filter((item) => item.result.status === filterStatus);
  }, [nosiCalculations, filterStatus]);

  const activeResult = useMemo(() => {
    if (!activePersonnel) return null;
    return calculateNOSIEligibility(activePersonnel);
  }, [activePersonnel]);

  const handleApplyStepIncrement = async () => {
    if (!activePersonnel || !activeResult) return;
    if (activeResult.currentStep >= 8) {
      alert('Personnel is already at maximum Step 8.');
      return;
    }

    const confirmMsg = `Confirm applying Step Increment to Step ${activeResult.nextStep} for ${activePersonnel.lastName}, ${activePersonnel.firstName}? New monthly salary will be ${formatPHP(activeResult.nextSalary)}.`;
    if (!window.confirm(confirmMsg)) return;

    setIsApplyingStep(true);
    try {
      const todayStr = new Date().toISOString().split('T')[0];
      const updated: Personnel = {
        ...activePersonnel,
        stepIncrement: activeResult.nextStep,
        lastStepIncrementDate: todayStr,
        updatedAt: Date.now(),
      };

      await onUpdatePersonnel(updated);

      await addAuditLog(
        currentUser.username,
        currentUser.role,
        'NOSI_CALC',
        'APPLY_STEP_INCREMENT',
        `Awarded Step Increment (Step ${activeResult.nextStep}, SG ${activePersonnel.salaryGrade}) to ${activePersonnel.lastName}, ${activePersonnel.firstName}.`
      );

      alert(`Step increment successfully applied! ${activePersonnel.lastName} is now at Step ${activeResult.nextStep}.`);
    } catch (err) {
      console.error('Failed to apply step increment:', err);
    } finally {
      setIsApplyingStep(false);
    }
  };

  const handleOpenLeaveExclusionModal = (p: Personnel) => {
    setEditingLeaveExclusions(p);
    setLwopInput(p.lwopDays || 0);
    setMaternityInput(p.maternityLeaveDays || 0);
  };

  const handleSaveLeaveExclusion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingLeaveExclusions) return;

    const updated: Personnel = {
      ...editingLeaveExclusions,
      lwopDays: Number(lwopInput),
      maternityLeaveDays: Number(maternityInput),
      updatedAt: Date.now(),
    };

    await onUpdatePersonnel(updated);

    await addAuditLog(
      currentUser.username,
      currentUser.role,
      'LEAVE_MANAGEMENT',
      'UPDATE_EXCLUSIONS',
      `Updated statutory exclusions for ${editingLeaveExclusions.lastName}: LWoP=${lwopInput} days, Maternity=${maternityInput} days (RA 11210 protected).`
    );

    setEditingLeaveExclusions(null);
  };

  const handleExportNOSIPDF = () => {
    if (!activePersonnel) return;
    const blob = generateNOSILetterPDF(activePersonnel);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `DepEd_NOSI_Letter_${activePersonnel.lastName}_Step${activeResult?.nextStep}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const getBadgeStyle = (status: string) => {
    switch (status) {
      case 'DUE NOW':
        return 'bg-rose-100 text-rose-800 border-rose-300 font-bold';
      case 'UPCOMING':
        return 'bg-amber-100 text-amber-800 border-amber-300 font-semibold';
      case 'RESET APPLIED':
        return 'bg-purple-100 text-purple-800 border-purple-300';
      default:
        return 'bg-emerald-100 text-emerald-800 border-emerald-300';
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header Card */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm no-print">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Award className="w-6 h-6 text-amber-500" />
              <h2 className="text-lg font-bold text-slate-900">
                Notice of Step Increment (NOSI) Engine
              </h2>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Automated Civil Service Commission (CSC) and DBM Joint Circular 3-Year statutory evaluation with RA 11210 Maternity protections.
            </p>
          </div>

          {/* Status Filter Tabs */}
          <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-lg border border-slate-200 text-xs font-medium">
            {(['ALL', 'DUE NOW', 'UPCOMING', 'ON TRACK', 'RESET APPLIED'] as const).map((status) => (
              <button
                key={status}
                onClick={() => setFilterStatus(status)}
                className={`px-3 py-1.5 rounded-md transition ${
                  filterStatus === status
                    ? 'bg-blue-900 text-white shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {status}
              </button>
            ))}
          </div>
        </div>

        {/* Statutory Policy Highlights */}
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
          <div className="p-3 rounded-lg bg-blue-50/60 border border-blue-200/80">
            <span className="font-bold text-blue-900 block mb-0.5">3-Year Continuous Service</span>
            <p className="text-slate-600 text-[11px]">
              Requires 36 months satisfactory service from last step increment date or promotion.
            </p>
          </div>
          <div className="p-3 rounded-lg bg-amber-50/60 border border-amber-200/80">
            <span className="font-bold text-amber-900 block mb-0.5">Leave Without Pay (LWoP)</span>
            <p className="text-slate-600 text-[11px]">
              Every day of approved/unapproved LWoP pushes the eligibility date out day-for-day.
            </p>
          </div>
          <div className="p-3 rounded-lg bg-emerald-50/60 border border-emerald-200/80">
            <span className="font-bold text-emerald-900 block mb-0.5">RA 11210 Maternity Protected</span>
            <p className="text-slate-600 text-[11px]">
              Up to 105 days of expanded maternity leave does NOT delay or count against step increments.
            </p>
          </div>
        </div>
      </div>

      {/* Main Roster & Inspection Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 no-print">
        {/* Left Column: Personnel Table */}
        <div className="lg:col-span-7 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-800">
              Roster Eligibility Evaluation ({filteredList.length})
            </h3>
            <span className="text-xs text-slate-400">Click a row to inspect or issue NOSI</span>
          </div>

          <div className="overflow-x-auto flex-1">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                  <th className="p-3">Employee Name</th>
                  <th className="p-3">Position &amp; Station</th>
                  <th className="p-3">Current</th>
                  <th className="p-3">Months</th>
                  <th className="p-3">Status</th>
                  <th className="p-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredList.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-slate-400">
                      No personnel records found. Add personnel in the PIMS Manager to track NOSI step increments.
                    </td>
                  </tr>
                ) : (
                  filteredList.map(({ personnel, result }) => {
                    const isSelected = personnel.id === selectedPersonnelId;
                    return (
                      <tr
                        key={personnel.id}
                        onClick={() => setSelectedPersonnelId(personnel.id)}
                        className={`cursor-pointer transition-colors ${
                          isSelected ? 'bg-blue-50/80 font-medium' : 'hover:bg-slate-50'
                        }`}
                      >
                        <td className="p-3">
                          <div className="font-bold text-slate-900">
                            {personnel.lastName}, {personnel.firstName}
                          </div>
                          <div className="text-[11px] text-slate-400 font-mono">{personnel.id}</div>
                        </td>
                        <td className="p-3">
                          <div className="text-slate-800">{personnel.positionTitle}</div>
                          <div className="text-[11px] text-slate-500 truncate max-w-[160px]">
                            {personnel.schoolStation}
                          </div>
                        </td>
                        <td className="p-3">
                          <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-mono text-[11px]">
                            SG {personnel.salaryGrade} Step {personnel.stepIncrement}
                          </span>
                        </td>
                        <td className="p-3 font-mono">
                          {result.monthsCompleted} / 36 mo
                        </td>
                        <td className="p-3">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] border ${getBadgeStyle(
                              result.status
                            )}`}
                          >
                            {result.status}
                          </span>
                        </td>
                        <td className="p-3 text-right">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleOpenLeaveExclusionModal(personnel);
                            }}
                            className="text-[11px] text-blue-700 hover:underline font-semibold"
                          >
                            Exclusions
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right Column: Selected Employee Card & Letter Trigger */}
        {activePersonnel && activeResult ? (
          <div className="lg:col-span-5 space-y-4">
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-4">
              <div className="flex items-start justify-between pb-3 border-b border-slate-100">
                <div>
                  <span
                    className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] border ${getBadgeStyle(
                      activeResult.status
                    )} mb-2`}
                  >
                    {activeResult.status}
                  </span>
                  <h3 className="text-base font-bold text-slate-900">{activeResult.name}</h3>
                  <p className="text-xs text-slate-500">{activePersonnel.positionTitle}</p>
                  <p className="text-xs text-slate-500">{activePersonnel.schoolStation}</p>
                </div>
                <button
                  onClick={() => handleOpenLeaveExclusionModal(activePersonnel)}
                  className="text-xs text-blue-700 bg-blue-50 px-2.5 py-1 rounded-lg hover:bg-blue-100 font-medium"
                >
                  Adjust Leaves
                </button>
              </div>

              {/* Step & Salary Comparison */}
              <div className="grid grid-cols-2 gap-3 bg-slate-50 p-3 rounded-lg border border-slate-200 text-xs">
                <div>
                  <span className="text-[11px] text-slate-500 block">Current Rate</span>
                  <span className="font-bold text-slate-900 block mt-0.5">
                    Step {activeResult.currentStep} &bull; {formatPHP(activeResult.currentSalary)}
                  </span>
                </div>
                <div>
                  <span className="text-[11px] text-slate-500 block">Adjusted Rate (Next)</span>
                  <span className="font-bold text-emerald-700 block mt-0.5">
                    Step {activeResult.nextStep} &bull; {formatPHP(activeResult.nextSalary)}
                  </span>
                </div>
                <div className="col-span-2 pt-2 border-t border-slate-200 flex justify-between text-xs font-semibold">
                  <span className="text-slate-600">Monthly Increase / Differential:</span>
                  <span className="text-emerald-700 font-bold">
                    +{formatPHP(activeResult.salaryDifference)} / mo
                  </span>
                </div>
              </div>

              {/* Statutory Dates Calculation */}
              <div className="space-y-2 text-xs">
                <div className="flex justify-between py-1 border-b border-slate-100">
                  <span className="text-slate-500">Service Timer Baseline:</span>
                  <span className="font-medium text-slate-800">
                    {activePersonnel.lastStepIncrementDate || activePersonnel.continuousServiceStart}
                  </span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-100">
                  <span className="text-slate-500">3-Year Standard Due Date:</span>
                  <span className="font-medium text-slate-800">{activeResult.baseEligibilityDate}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-100">
                  <span className="text-slate-500">LWoP Excluded Days:</span>
                  <span className="font-medium text-amber-700">+{activeResult.lwopDaysDeducted} days</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-100">
                  <span className="text-slate-500">RA 11210 Maternity Exemption:</span>
                  <span className="font-medium text-emerald-700">
                    {activeResult.maternityLeaveDaysExempt} days protected
                  </span>
                </div>
                <div className="flex justify-between py-1 font-bold">
                  <span className="text-slate-700">Effective Adjusted Date:</span>
                  <span className="text-blue-900">{activeResult.adjustedEligibilityDate}</span>
                </div>
              </div>

              {/* Remarks Box */}
              <div className="p-3 bg-amber-50/60 rounded-lg border border-amber-200/70 text-xs text-amber-900 leading-relaxed">
                {activeResult.remarks}
              </div>

              {/* Actions */}
              <div className="flex flex-col gap-2 pt-2">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setShowLetterPreview(true)}
                    className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold shadow-sm"
                  >
                    <FileCheck className="w-4 h-4 text-amber-400" />
                    <span>View Official Letter</span>
                  </button>

                  <button
                    onClick={handleExportNOSIPDF}
                    className="flex items-center gap-1 px-3 py-2 border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-lg text-xs font-medium"
                    title="Export official DepEd letter in PDF format"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>PDF</span>
                  </button>
                </div>

                {currentUser.role === 'Admin' || currentUser.role === 'Superadmin' ? (
                  <button
                    onClick={handleApplyStepIncrement}
                    disabled={isApplyingStep || activeResult.currentStep >= 8}
                    className={`w-full py-2 px-3 rounded-lg text-xs font-bold text-white flex items-center justify-center gap-1.5 transition shadow-sm ${
                      activeResult.currentStep >= 8
                        ? 'bg-slate-400 cursor-not-allowed'
                        : activeResult.status === 'DUE NOW'
                        ? 'bg-emerald-600 hover:bg-emerald-500'
                        : 'bg-blue-800 hover:bg-blue-700'
                    }`}
                  >
                    <CheckCircle2 className="w-4 h-4 text-white" />
                    <span>
                      {activeResult.currentStep >= 8
                        ? 'Maximum Step 8 Reached'
                        : `Apply Step ${activeResult.nextStep} in Database`}
                    </span>
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        ) : (
          <div className="lg:col-span-5 bg-white p-8 rounded-xl border border-slate-200 text-center text-slate-400 text-xs">
            Select an employee from the table or add personnel in the PIMS Manager to review statutory Step Increment status and generate NOSI notices.
          </div>
        )}
      </div>

      {/* Official DepEd Printable Letter Preview Modal / Section */}
      {showLetterPreview && activePersonnel && activeResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 no-print overflow-y-auto">
          <div className="w-full max-w-3xl bg-white rounded-xl shadow-2xl border border-slate-300 overflow-hidden text-slate-900 my-8">
            <div className="p-3 bg-slate-900 text-white flex items-center justify-between">
              <span className="text-xs font-bold flex items-center gap-2">
                <Printer className="w-4 h-4 text-amber-400" />
                DepEd Official Notice of Step Increment Document Template
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => window.print()}
                  className="px-2.5 py-1 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded text-xs font-bold"
                >
                  Print Letter
                </button>
                <button
                  onClick={handleExportNOSIPDF}
                  className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-white rounded text-xs font-medium"
                >
                  Download PDF
                </button>
                <button
                  onClick={() => setShowLetterPreview(false)}
                  className="text-slate-400 hover:text-white px-2 font-bold"
                >
                  &times;
                </button>
              </div>
            </div>

            {/* Republic Letter Body */}
            <div className="p-8 font-serif-doc text-slate-900 text-sm leading-relaxed max-w-2xl mx-auto">
              <div className="text-center font-serif leading-tight">
                <p className="text-xs uppercase">Republic of the Philippines</p>
                <p className="text-sm font-bold uppercase mt-0.5">Department of Education</p>
                <p className="text-xs">Region IX, Zamboanga Peninsula</p>
                <p className="text-xs font-bold">SCHOOLS DIVISION OF ZAMBOANGA CITY</p>
                <div className="border-b-2 border-slate-900 my-3" />
              </div>

              <h2 className="text-center font-bold text-base uppercase tracking-widest my-4">
                NOTICE OF STEP INCREMENT
              </h2>

              <p className="text-xs text-right mb-4">
                Date: {new Date().toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })}
              </p>

              <div className="mb-4 text-xs font-sans">
                <p><strong>TO: {activeResult.name.toUpperCase()}</strong></p>
                <p>Position: {activePersonnel.positionTitle}</p>
                <p>Station: {activePersonnel.schoolStation}</p>
              </div>

              <p className="text-xs text-justify mb-4">
                Pursuant to the provisions of Joint Circular No. 1, s. 2012 of the Civil Service Commission (CSC) and the Department of Budget and Management (DBM), and CSC-DBM Joint Circular No. 1, s. 2016 implementing Section 34 of the Salary Standardization Law, your salary is hereby adjusted effective <strong>{activeResult.adjustedEligibilityDate}</strong>, having completed at least three (3) years of continuous satisfactory service in your present position without any disruptive leaves without pay.
              </p>

              {/* Detail Table */}
              <div className="my-4 border border-slate-900 font-sans text-xs">
                <div className="grid grid-cols-2 p-2 border-b border-slate-900 bg-slate-50 font-bold">
                  <div>Item Description</div>
                  <div>Particulars / Rate</div>
                </div>
                <div className="grid grid-cols-2 p-2 border-b border-slate-200">
                  <div>1. Plantilla Item Number:</div>
                  <div className="font-mono">{activePersonnel.plantillaItemNo}</div>
                </div>
                <div className="grid grid-cols-2 p-2 border-b border-slate-200">
                  <div>2. Actual Salary prior to adjustment:</div>
                  <div>
                    SG {activeResult.currentSalaryGrade}, Step {activeResult.currentStep} (
                    {formatPHP(activeResult.currentSalary)})
                  </div>
                </div>
                <div className="grid grid-cols-2 p-2 border-b border-slate-200 bg-emerald-50/50">
                  <div className="font-bold">3. Adjusted Salary effective date:</div>
                  <div className="font-bold text-emerald-900">
                    SG {activeResult.currentSalaryGrade}, Step {activeResult.nextStep} (
                    {formatPHP(activeResult.nextSalary)})
                  </div>
                </div>
                <div className="grid grid-cols-2 p-2">
                  <div>4. Monthly Differential / Increase:</div>
                  <div className="font-bold">+{formatPHP(activeResult.salaryDifference)}</div>
                </div>
              </div>

              <p className="text-xs text-justify italic mb-8">
                This Step Increment is subject to post-audit by the Commission on Audit (COA) and to the condition that should there be any overpayment made by reason of this adjustment, the same shall be refunded by the personnel.
              </p>

              <div className="mt-8 flex justify-end text-xs font-sans text-center">
                <div>
                  <p className="mb-10 text-left">Very truly yours,</p>
                  <p className="font-bold uppercase tracking-wide">ROY C. TUBALLA, EMD, JD, CESO VI</p>
                  <p className="text-slate-600">Schools Division Superintendent</p>
                  <p className="text-slate-500 text-[10px]">DepEd Division of Zamboanga City</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Adjust Leave Exclusions Modal */}
      {editingLeaveExclusions && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 no-print">
          <div className="w-full max-w-md bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden text-slate-900">
            <div className="bg-slate-900 text-white p-4 flex items-center justify-between">
              <h3 className="text-sm font-bold flex items-center gap-2">
                <Calendar className="w-4 h-4 text-amber-400" />
                Statutory Leave Exclusions — {editingLeaveExclusions.lastName}
              </h3>
              <button
                onClick={() => setEditingLeaveExclusions(null)}
                className="text-slate-400 hover:text-white font-bold"
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleSaveLeaveExclusion} className="p-5 space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Leave Without Pay (LWoP) Days
                </label>
                <input
                  type="number"
                  min={0}
                  value={lwopInput}
                  onChange={(e) => setLwopInput(Number(e.target.value))}
                  className="w-full bg-slate-50 border border-slate-300 rounded px-3 py-2 text-xs focus:ring-1 focus:ring-blue-600 focus:outline-none"
                  required
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  Pushes the 3-year eligibility date out by {lwopInput} days.
                </p>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  RA 11210 Maternity Leave Days (Max 105 Days Exempt)
                </label>
                <input
                  type="number"
                  min={0}
                  max={105}
                  value={maternityInput}
                  onChange={(e) => setMaternityInput(Number(e.target.value))}
                  className="w-full bg-slate-50 border border-slate-300 rounded px-3 py-2 text-xs focus:ring-1 focus:ring-blue-600 focus:outline-none"
                  required
                />
                <p className="text-[11px] text-emerald-700 mt-1">
                  RA 11210 protection: Up to 105 days will NEVER delay or penalize step increment eligibility.
                </p>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditingLeaveExclusions(null)}
                  className="px-3 py-1.5 rounded-lg text-slate-600 hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-lg bg-blue-900 hover:bg-blue-800 text-white font-semibold"
                >
                  Save Exclusions
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
