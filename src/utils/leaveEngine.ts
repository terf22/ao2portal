import { LeaveCategory, LeaveLedgerEntry, Personnel } from '../types';

export type NonWorkingDayCategory =
  | 'HOLIDAY'
  | 'SATURDAY_SUNDAY'
  | 'SUMMER_VACATION_BREAK'
  | 'CHRISTMAS_BREAK';

export interface ServiceCreditClaimInput {
  date: string; // YYYY-MM-DD
  trainingTitle: string;
  hoursCompleted: number;
  category: NonWorkingDayCategory;
  referenceDocument?: string;
}

export function calculateServiceCreditsFromHours(hours: number): number {
  // Standard Civil Service / DepEd rule: 8 hours = 1 day service credit (or 1 hour = 0.125 days)
  const days = Math.round((hours / 8) * 1000) / 1000;
  return days;
}

export function calculateTeachingServiceCreditBalance(personnel: Personnel): number {
  if (personnel.personnelType !== 'Teaching') return 0;
  let total = 0;
  if (personnel.leaveLedger && Array.isArray(personnel.leaveLedger)) {
    for (const entry of personnel.leaveLedger) {
      if (entry.leaveCategory === 'SERVICE_CREDIT') {
        total += entry.amount;
      }
    }
  }
  return Math.max(0, Math.round(total * 1000) / 1000);
}

export function calculateNonTeachingLeaveBalances(personnel: Personnel): {
  vacationLeave: number;
  sickLeave: number;
  totalAccruedMonths: number;
} {
  if (personnel.personnelType === 'Teaching') {
    return { vacationLeave: 0, sickLeave: 0, totalAccruedMonths: 0 };
  }

  // Calculate months from continuousServiceStart to current date
  const startDate = new Date(personnel.continuousServiceStart || '2023-01-01');
  const now = new Date();
  const monthsElapsed = Math.max(
    0,
    (now.getFullYear() - startDate.getFullYear()) * 12 +
      (now.getMonth() - startDate.getMonth())
  );

  let vl = personnel.vacationLeaveCredits ?? 0;
  let sl = personnel.sickLeaveCredits ?? 0;

  // If ledger is present, calculate balance from ledger or starting baseline
  if (personnel.leaveLedger && personnel.leaveLedger.length > 0) {
    let ledgerVL = 0;
    let ledgerSL = 0;
    for (const item of personnel.leaveLedger) {
      if (item.leaveCategory === 'VL') ledgerVL += item.amount;
      if (item.leaveCategory === 'SL') ledgerSL += item.amount;
    }
    // If ledger has entries, we ensure the current balance incorporates them
    vl = Math.max(0, vl);
    sl = Math.max(0, sl);
  }

  return {
    vacationLeave: Math.round(vl * 100) / 100,
    sickLeave: Math.round(sl * 100) / 100,
    totalAccruedMonths: monthsElapsed,
  };
}

export function createServiceCreditEntry(
  claim: ServiceCreditClaimInput
): LeaveLedgerEntry {
  const amount = calculateServiceCreditsFromHours(claim.hoursCompleted);
  const categoryLabels: Record<NonWorkingDayCategory, string> = {
    HOLIDAY: 'Official Holiday Duty',
    SATURDAY_SUNDAY: 'Weekend Training / Seminar',
    SUMMER_VACATION_BREAK: 'Summer / End-of-School-Year Break Service',
    CHRISTMAS_BREAK: 'Christmas Break Special Activity',
  };

  return {
    id: `SC-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    date: claim.date,
    type: 'CREDIT_EARNED',
    leaveCategory: 'SERVICE_CREDIT',
    amount,
    particulars: `${claim.trainingTitle} (${categoryLabels[claim.category]} - ${claim.hoursCompleted} hrs)`,
    referenceDocument: claim.referenceDocument,
  };
}

export function createServiceCreditOffsetEntry(
  absenceDate: string,
  daysToOffset: number,
  reason: string
): LeaveLedgerEntry {
  return {
    id: `SC-OFFSET-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    date: absenceDate,
    type: 'CREDIT_DEBITED',
    leaveCategory: 'SERVICE_CREDIT',
    amount: -Math.abs(daysToOffset),
    particulars: `Absence Offsetting for ${absenceDate}: ${reason}`,
    referenceDocument: 'Civil Service Form 6 Endorsement',
  };
}

export function createNonTeachingAvailmentEntry(
  category: 'VL' | 'SL',
  date: string,
  amountDays: number,
  particulars: string,
  referenceDocument?: string
): LeaveLedgerEntry {
  return {
    id: `LV-AVAIL-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    date,
    type: 'AVAILMENT',
    leaveCategory: category,
    amount: -Math.abs(amountDays),
    particulars,
    referenceDocument: referenceDocument || 'Approved CS Form 6 Application',
  };
}

export function createNonTeachingMonthlyAccrual(
  monthYearStr: string // e.g. "March 2026"
): { vlEntry: LeaveLedgerEntry; slEntry: LeaveLedgerEntry } {
  const dateStr = new Date().toISOString().split('T')[0];
  return {
    vlEntry: {
      id: `ACCRUAL-VL-${Date.now()}`,
      date: dateStr,
      type: 'ACCRUAL',
      leaveCategory: 'VL',
      amount: 1.25,
      particulars: `Monthly CSC Standard Accrual - ${monthYearStr}`,
    },
    slEntry: {
      id: `ACCRUAL-SL-${Date.now()}`,
      date: dateStr,
      type: 'ACCRUAL',
      leaveCategory: 'SL',
      amount: 1.25,
      particulars: `Monthly CSC Standard Accrual - ${monthYearStr}`,
    },
  };
}
