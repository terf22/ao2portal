export interface School {
  id: string; // Unique 6-digit DepEd School ID (e.g., "123456")
  name: string; // Official School Name
  district: string; // District assignment (e.g., "Zamboanga Central")
  division?: string;
  region?: string;
  schoolHeadName?: string;
  schoolHeadPosition?: string;
  address?: string;
  contactEmail?: string;
  contactNumber?: string;
  isPrimary?: boolean;
}

export interface SchoolProfile {
  schoolId: string;
  schoolName: string;
  district: string;
  division: string;
  region: string;
  schoolHeadName: string;
  schoolHeadPosition: string;
  address: string;
  contactEmail?: string;
  contactNumber?: string;
}

export interface User {
  id: string; // Unique identifier (e.g., "superadmin_id" or "aoii_id")
  username: string; // Login username or email
  passwordHash?: string; // Hashed password stored client-side
  fullName: string;
  role: UserRole;
  email?: string;
  avatarUrl?: string;
  schoolStation?: string;
  isGoogleUser?: boolean;
  createdAt?: string;
}

export type PersonnelType = 'Teaching' | 'Non-Teaching' | 'JO/COS';
export type EmploymentStatus = 'Permanent' | 'Provisional' | 'Substitute' | 'Contractual' | 'ContractOfService';
export type WorkSchedule = 'Teaching' | 'Non-Teaching' | 'Custom';
export type WorkScheduleType = WorkSchedule;
export type DTRDayStatus =
  | 'REGULAR'
  | 'CLASS_SUSPENDED_FULL'
  | 'CLASS_SUSPENDED_AM'
  | 'CLASS_SUSPENDED_PM'
  | 'HOLIDAY'
  | 'OB'
  | 'LEAVE'
  | 'SATURDAY'
  | 'SUNDAY';

export interface DTRLog {
  amArrival: string; // HH:MM (24h or "07:30")
  amDeparture: string;
  pmArrival: string;
  pmDeparture: string;
  status: DTRDayStatus;
  note?: string;
}

export type LeaveEntryType = 'ACCRUAL' | 'AVAILMENT' | 'CREDIT_EARNED' | 'CREDIT_DEBITED';
export type LeaveCategory = 'VL' | 'SL' | 'SERVICE_CREDIT';

export interface LeaveLedgerEntry {
  id: string;
  date: string; // YYYY-MM-DD
  type: LeaveEntryType;
  leaveCategory: LeaveCategory;
  amount: number; // Positive for earned/accrued, negative for availed/deducted
  particulars: string; // e.g., "Accrued Jan 2026", "Attended Division INSET Seminar", "Absence Offsetting"
  referenceDocument?: string; // e.g., Division Memo No. 45, s. 2026, Certificate of Appearance
}

export interface ServiceRecordBlock {
  id: string;
  from: string; // YYYY-MM-DD
  to: string; // YYYY-MM-DD or "PRESENT"
  designation: string; // e.g., "Teacher I", "Teacher II"
  status: string; // "Permanent", "Substitute"
  monthlySalary: number; // PHP
  station: string; // e.g., "Zamboanga City High School - Main"
  branch: string; // e.g., "National"
  lwop: string; // "None" or number of days
  separationDateCause: string; // e.g., "Promotion", "N/A"
  dateFrom?: string;
  dateTo?: string;
  salaryRate?: number;
  placeOfAssignment?: string;
  separationDate?: string;
  separationCause?: string;
}

export interface Personnel {
  id: string; // Employee ID (Primary Key)
  biometricId?: string; // Hardware Biometric AC-No / Enrollee Number (e.g., "80038", "5002499")
  lastName: string;
  firstName: string;
  middleName: string;
  extensionName?: string; // e.g., Jr., III
  positionTitle: string;
  plantillaItemNo: string;
  tin: string;
  dob: string; // YYYY-MM-DD
  pob: string;
  schoolId: string; // Foreign Key referencing School.id
  schoolStation?: string; // Display station name
  gsisBPNo: string;
  personnelType: PersonnelType;
  employmentStatus: EmploymentStatus;
  workSchedule: WorkSchedule;
  stepIncrement: number; // 1 to 8
  salaryGrade: number; // 1 to 33
  lastPromotionDate: string; // YYYY-MM-DD
  lastStepIncrementDate: string; // YYYY-MM-DD
  continuousServiceStart: string; // YYYY-MM-DD
  dtrLogs: Record<string, DTRLog>; // Keyed by date "YYYY-MM-DD"
  serviceCredits: number; // Accumulated days (Teachers only)
  vacationLeaveCredits: number; // Accumulated days (Non-Teaching only)
  sickLeaveCredits: number; // Accumulated days (Non-Teaching only)
  leaveLedger: LeaveLedgerEntry[]; // History of leave updates, accruals, and usages
  serviceRecordBlocks?: ServiceRecordBlock[]; // DepEd Service Record (EO 54)
  lwopDays?: number; // Total recorded Leave Without Pay days
  maternityLeaveDays?: number; // RA 11210 Maternity Leave (up to 105 days exempt)
  updatedAt: number; // Timestamp for sync conflict resolution
}

export interface SyncQueueItem {
  id?: number; // Auto-incremented local ID
  table: 'personnel' | 'audit_logs' | 'schools' | 'users';
  action: 'INSERT' | 'UPDATE' | 'DELETE';
  payload: Record<string, unknown> | Personnel | AuditLog | School | User | unknown;
  timestamp: number;
}

export type AuditCategory =
  | 'SECURITY'
  | 'AUTH'
  | 'DATA_PORTABILITY'
  | 'EXCEL_IMPORT'
  | 'DTR_EDIT'
  | 'PDF_EXPORT'
  | 'NOSI_CALC'
  | 'DATABASE_EXPORT'
  | 'DATABASE_IMPORT'
  | 'CLOUD_SYNC'
  | 'LEAVE_MANAGEMENT'
  | 'SCHOOL_CONFIG';

export type AuditSeverity = 'INFO' | 'WARNING' | 'CRITICAL';

export interface AuditLog {
  id: string;
  timestamp: string;
  actor: string;
  role: string;
  category: AuditCategory;
  action: string;
  details: string;
  severity: AuditSeverity;
}

export interface EncryptedPackage {
  salt: string;
  iv: string;
  ciphertext: string;
  timestamp: string;
}

export type UserRole = 'Superadmin' | 'AO II' | 'Admin' | 'DeptHead' | 'Staff';

export interface UserSession {
  userId?: string;
  username: string;
  fullName?: string;
  email?: string;
  avatarUrl?: string;
  role: UserRole;
  ipAddress: string;
  schoolLocation: string;
  loginTime: string;
  userAgent: string;
  isGoogleLinked?: boolean;
  googleAccessToken?: string;
  googleEmail?: string;
  googleName?: string;
}

export type DTRPrintMode = '1-Up' | '2-Up';
export type PrintPaperSize = 'Letter' | 'A4' | 'Legal' | 'Cardstock_3.5x8.5';

export interface ConflictMatch {
  incomingRecord: Partial<Personnel> & { rawRowNumber?: number };
  existingRecord: Personnel;
  conflictType: 'ID_MATCH_NAME_MISMATCH' | 'NAME_MATCH_ID_MISMATCH';
  details: string;
}

export interface NOSICalculationResult {
  personnelId: string;
  name: string;
  position: string;
  currentSalaryGrade: number;
  currentStep: number;
  nextStep: number;
  currentSalary: number;
  nextSalary: number;
  salaryDifference: number;
  baseEligibilityDate: string; // 3 years from last step
  adjustedEligibilityDate: string; // adjusted by LWoP
  daysRemaining: number;
  monthsCompleted: number;
  lwopDaysDeducted: number;
  maternityLeaveDaysExempt: number;
  status: 'DUE NOW' | 'UPCOMING' | 'ON TRACK' | 'RESET APPLIED';
  remarks: string;
  isEligibleNow?: boolean;
  personnel?: Personnel;
}
