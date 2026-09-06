import { getSalary } from '../data/ssl2026Tranche';
import { NOSICalculationResult, Personnel } from '../types';

export function calculateNOSIEligibility(
  personnel: Personnel,
  targetDate: Date = new Date()
): NOSICalculationResult {
  // Determine start date for the 3-year clock:
  // If promotion happened more recently than step increment, use promotion date; else lastStepIncrementDate; fallback to continuousServiceStart
  let timerStartDateStr = personnel.lastStepIncrementDate || personnel.continuousServiceStart;
  let resetApplied = false;

  if (personnel.lastPromotionDate) {
    const promoTime = new Date(personnel.lastPromotionDate).getTime();
    const stepTime = new Date(timerStartDateStr).getTime();
    if (promoTime > stepTime) {
      timerStartDateStr = personnel.lastPromotionDate;
      resetApplied = true;
    }
  }

  const startDate = new Date(timerStartDateStr);

  // 3-Year statutory baseline rule (36 months)
  const baseEligibilityDate = new Date(startDate);
  baseEligibilityDate.setFullYear(baseEligibilityDate.getFullYear() + 3);

  // Leave Without Pay (LWoP) deductions: pushes due date out day-for-day
  const lwopDays = personnel.lwopDays || 0;

  // RA 11210 Maternity Leave Exception: up to 105 days exempt
  const maternityDays = Math.min(105, personnel.maternityLeaveDays || 0);

  // Effective days pushed out = LWoP days
  const adjustedEligibilityDate = new Date(baseEligibilityDate);
  if (lwopDays > 0) {
    adjustedEligibilityDate.setDate(adjustedEligibilityDate.getDate() + lwopDays);
  }

  // Calculation of remaining days and completed months
  const nowMs = targetDate.getTime();
  const adjustedMs = adjustedEligibilityDate.getTime();
  const diffTime = adjustedMs - nowMs;
  const daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  // Months completed since timer start
  const monthsDiff =
    (targetDate.getFullYear() - startDate.getFullYear()) * 12 +
    (targetDate.getMonth() - startDate.getMonth());
  const monthsCompleted = Math.max(0, monthsDiff);

  // Status Badge Determination
  let status: 'DUE NOW' | 'UPCOMING' | 'ON TRACK' | 'RESET APPLIED' = 'ON TRACK';

  if (daysRemaining <= 0) {
    status = 'DUE NOW';
  } else if (daysRemaining <= 60) {
    status = 'UPCOMING';
  } else if (resetApplied && monthsCompleted < 12) {
    status = 'RESET APPLIED';
  } else {
    status = 'ON TRACK';
  }

  const currentGrade = personnel.salaryGrade || 11;
  const currentStep = personnel.stepIncrement || 1;
  const nextStep = Math.min(8, currentStep + 1);

  const currentSalary = getSalary(currentGrade, currentStep);
  const nextSalary = getSalary(currentGrade, nextStep);
  const salaryDifference = nextSalary - currentSalary;

  let remarks = '';
  if (status === 'DUE NOW') {
    remarks = `Eligible for Step ${nextStep} since ${adjustedEligibilityDate.toLocaleDateString('en-PH', { dateStyle: 'medium' })}. Completed ${monthsCompleted} months of continuous satisfactory service.`;
  } else if (status === 'UPCOMING') {
    remarks = `Due for Step ${nextStep} in ${daysRemaining} days (${adjustedEligibilityDate.toLocaleDateString('en-PH', { dateStyle: 'medium' })}).`;
  } else if (status === 'RESET APPLIED') {
    remarks = `Promotion/Reclassification on ${timerStartDateStr} reset the 3-year timer. Running month ${monthsCompleted} of 36.`;
  } else {
    remarks = `Satisfactory service on track (${monthsCompleted} of 36 months). Target eligibility: ${adjustedEligibilityDate.toLocaleDateString('en-PH', { dateStyle: 'medium' })}.`;
  }

  if (lwopDays > 0) {
    remarks += ` Excluded ${lwopDays} days LWoP.`;
  }
  if (maternityDays > 0) {
    remarks += ` Protected by RA 11210 (${maternityDays} days Maternity Leave credited without penalty).`;
  }

  return {
    personnelId: personnel.id,
    name: `${personnel.lastName}, ${personnel.firstName} ${personnel.middleName ? personnel.middleName[0] + '.' : ''} ${personnel.extensionName || ''}`.trim(),
    position: personnel.positionTitle,
    currentSalaryGrade: currentGrade,
    currentStep,
    nextStep,
    currentSalary,
    nextSalary,
    salaryDifference,
    baseEligibilityDate: baseEligibilityDate.toISOString().split('T')[0],
    adjustedEligibilityDate: adjustedEligibilityDate.toISOString().split('T')[0],
    daysRemaining,
    monthsCompleted,
    lwopDaysDeducted: lwopDays,
    maternityLeaveDaysExempt: maternityDays,
    status,
    remarks,
    isEligibleNow: status === 'DUE NOW',
    personnel,
  };
}
