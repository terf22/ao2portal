import * as XLSX from 'xlsx';
import { Personnel, ServiceRecordBlock } from '../types';

export interface ServiceRecordExcelRow {
  from: string;
  to: string;
  position: string;
  status: string;
  sg: number | string;
  step: number | string;
  salary: number | string;
  office: string;
  lwop: number | string;
  remarks: string;
}

/**
 * Authentic sample service record data matching the user's uploaded spreadsheet
 * for personnel: OMAR, MICHEL FALCASANTOS
 */
export const SAMPLE_OMAR_SERVICE_ROWS: ServiceRecordExcelRow[] = [
  { from: '05/15/2013', to: '12/31/2013', position: 'TCH1', status: 'REG/PERM', sg: 11, step: 1, salary: '18,549.00', office: 'LICOMO ES', lwop: 0, remarks: 'ORIGINAL' },
  { from: '01/01/2014', to: '12/31/2014', position: 'TCH1', status: 'REG/PERM', sg: 11, step: 1, salary: '18,549.00', office: 'LICOMO ES', lwop: 0, remarks: 'SALARY TRANCHE' },
  { from: '01/01/2015', to: '12/31/2015', position: 'TCH1', status: 'REG/PERM', sg: 11, step: 1, salary: '18,549.00', office: 'LICOMO ES', lwop: 0, remarks: 'SALARY TRANCHE' },
  { from: '01/01/2016', to: '05/14/2016', position: 'TCH1', status: 'REG/PERM', sg: 11, step: 1, salary: '19,620.00', office: 'LICOMO ES', lwop: 0, remarks: 'SALARY TRANCHE' },
  { from: '05/15/2016', to: '12/31/2016', position: 'TCH1', status: 'REG/PERM', sg: 11, step: 2, salary: '19,853.00', office: 'LICOMO ES', lwop: 0, remarks: 'STEP INCREMENT' },
  { from: '01/01/2017', to: '12/31/2017', position: 'TCH1', status: 'REG/PERM', sg: 11, step: 2, salary: '20,437.00', office: 'LICOMO ES', lwop: 0, remarks: 'SALARY TRANCHE' },
  { from: '01/01/2018', to: '12/31/2018', position: 'TCH1', status: 'REG/PERM', sg: 11, step: 2, salary: '21,038.00', office: 'LICOMO ES', lwop: 0, remarks: 'SALARY TRANCHE' },
  { from: '01/01/2019', to: '05/14/2019', position: 'TCH1', status: 'REG/PERM', sg: 11, step: 2, salary: '22,600.00', office: 'LICOMO ES', lwop: 0, remarks: 'SALARY TRANCHE' },
  { from: '05/15/2019', to: '12/31/2019', position: 'TCH1', status: 'REG/PERM', sg: 11, step: 3, salary: '26,754.00', office: 'LICOMO ES', lwop: 0, remarks: 'SALARY TRANCHE' },
  { from: '01/01/2020', to: '10/21/2020', position: 'TCH1', status: 'REG/PERM', sg: 11, step: 3, salary: '28,276.00', office: 'LICOMO ES', lwop: 0, remarks: 'SALARY TRANCHE' },
  { from: '10/22/2020', to: '12/31/2020', position: 'TCH3', status: 'REG/PERM', sg: 13, step: 1, salary: '29,798.00', office: 'LICOMO ES', lwop: 0, remarks: 'RECLASSIFICATION' },
  { from: '01/01/2021', to: '01/31/2021', position: 'TCH3', status: 'REG/PERM', sg: 13, step: 1, salary: '31,320.00', office: 'LICOMO ES', lwop: 0, remarks: 'SALARY TRANCHE' },
  { from: '01/01/2022', to: '12/31/2022', position: 'TCH3', status: 'REG/PERM', sg: 13, step: 1, salary: '30,111.00', office: 'LICOMO ES', lwop: 0, remarks: 'SALARY TRANCHE' },
  { from: '01/01/2023', to: '10/21/2023', position: 'TCH3', status: 'REG/PERM', sg: 13, step: 1, salary: '30,111.00', office: 'MANGUSU IS', lwop: 0, remarks: 'SALARY TRANCHE' },
  { from: '10/22/2023', to: '12/31/2023', position: 'TCH3', status: 'REG/PERM', sg: 13, step: 2, salary: '31,633.00', office: 'MANGUSU IS', lwop: 0, remarks: 'STEP INCREMENT' },
  { from: '01/01/2024', to: '12/31/2024', position: 'TCH3', status: 'REG/PERM', sg: 13, step: 2, salary: '33,183.00', office: 'MANGUSU IS', lwop: 0, remarks: 'SALARY TRANCHE' },
  { from: '01/01/2025', to: '12/31/2025', position: 'TCH3', status: 'REG/PERM', sg: 13, step: 2, salary: '34,733.00', office: 'MANGUSU IS', lwop: 0, remarks: 'SALARY TRANCHE' },
  { from: '01/01/2026', to: 'PRESENT', position: 'TCH3', status: 'REG/PERM', sg: 13, step: 2, salary: '36,283.00', office: 'MANGUSU IS', lwop: 0, remarks: 'SALARY TRANCHE' },
];

/**
 * Robust date normalizer that handles:
 * - Excel numeric date serials (e.g. 41409 -> 05/15/2013, 41639 -> 12/31/2013)
 * - Formatted strings: MM/DD/YYYY, M/D/YYYY, YYYY-MM-DD, DD-MMM-YYYY, DD/MM/YYYY
 * - Ongoing keywords: PRESENT, CURRENT, TO DATE, ONWARDS -> 'PRESENT'
 * - Date objects without timezone day shifting
 */
export function normalizeDateValue(formattedVal: unknown, rawVal?: unknown): string {
  if (formattedVal === null || formattedVal === undefined) formattedVal = '';
  if (rawVal === null || rawVal === undefined) rawVal = '';

  let str = String(formattedVal).replace(/^['"`\s]+|['"`\s]+$/g, '').trim();
  const rawStr = String(rawVal).replace(/^['"`\s]+|['"`\s]+$/g, '').trim();

  // If formattedVal is empty but rawVal has content
  if (!str && rawStr) {
    str = rawStr;
  }
  if (!str) return '';

  // Present / Current / Ongoing check
  if (/^(present|current|to\s*date|onwards|now|continue|continuous)$/i.test(str)) {
    return 'PRESENT';
  }

  // Already standard MM/DD/YYYY
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(str)) {
    return str;
  }

  // Check Excel serial number (numeric value between 1000 and 100000)
  // In Excel, 1900 date system: 41409 = 2013-05-15, 41639 = 2013-12-31, 41640 = 2014-01-01
  const numVal =
    typeof rawVal === 'number'
      ? rawVal
      : !isNaN(Number(str)) && !str.includes('/') && !str.includes('-') && !str.includes('.')
      ? Number(str)
      : NaN;

  if (!isNaN(numVal) && numVal > 1000 && numVal < 100000) {
    // Excel epoch is Dec 30, 1899 in UTC to account for the leap year bug in Excel
    const excelEpoch = new Date(Date.UTC(1899, 11, 30));
    const msPerDay = 86400 * 1000;
    const dateObj = new Date(excelEpoch.getTime() + numVal * msPerDay);
    const y = dateObj.getUTCFullYear();
    const m = String(dateObj.getUTCMonth() + 1).padStart(2, '0');
    const d = String(dateObj.getUTCDate()).padStart(2, '0');
    return `${m}/${d}/${y}`;
  }

  // If rawVal is a Date object (prevent browser timezone shifting previous day)
  if (rawVal instanceof Date && !isNaN(rawVal.getTime())) {
    if (rawVal.getUTCHours() === 0 && rawVal.getUTCMinutes() === 0) {
      const m = String(rawVal.getUTCMonth() + 1).padStart(2, '0');
      const d = String(rawVal.getUTCDate()).padStart(2, '0');
      const y = rawVal.getUTCFullYear();
      return `${m}/${d}/${y}`;
    } else {
      const m = String(rawVal.getMonth() + 1).padStart(2, '0');
      const d = String(rawVal.getDate()).padStart(2, '0');
      const y = rawVal.getFullYear();
      return `${m}/${d}/${y}`;
    }
  }

  // Check ISO format: YYYY-MM-DD or YYYY/MM/DD
  const isoMatch = str.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (isoMatch) {
    const y = isoMatch[1];
    const m = isoMatch[2].padStart(2, '0');
    const d = isoMatch[3].padStart(2, '0');
    return `${m}/${d}/${y}`;
  }

  // Month lookup dictionary
  const monthNames: Record<string, string> = {
    jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
    jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
    january: '01', february: '02', march: '03', april: '04', june: '06',
    july: '07', august: '08', september: '09', october: '10', november: '11', december: '12',
  };

  // Check DD-MMM-YYYY or DD-MMM-YY (e.g., 15-May-2013, 15 May 2013, 15-May-13)
  const textMonthMatch1 = str.match(/^(\d{1,2})[-/\s]+([A-Za-z]+)[-/\s,]+(\d{2,4})/);
  if (textMonthMatch1) {
    const d = textMonthMatch1[1].padStart(2, '0');
    const mStr = textMonthMatch1[2].toLowerCase();
    let y = textMonthMatch1[3];
    if (y.length === 2) y = (Number(y) > 50 ? '19' : '20') + y;
    if (monthNames[mStr]) {
      return `${monthNames[mStr]}/${d}/${y}`;
    }
  }

  // Check MMM-DD-YYYY (e.g., May 15, 2013)
  const textMonthMatch2 = str.match(/^([A-Za-z]+)[-/\s]+(\d{1,2})[-/\s,]+(\d{2,4})/);
  if (textMonthMatch2) {
    const mStr = textMonthMatch2[1].toLowerCase();
    const d = textMonthMatch2[2].padStart(2, '0');
    let y = textMonthMatch2[3];
    if (y.length === 2) y = (Number(y) > 50 ? '19' : '20') + y;
    if (monthNames[mStr]) {
      return `${monthNames[mStr]}/${d}/${y}`;
    }
  }

  // Check M/D/YYYY or MM/DD/YYYY or D/M/YYYY with '/', '-', or '.'
  const slashMatch = str.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/);
  if (slashMatch) {
    const part1 = Number(slashMatch[1]);
    const part2 = Number(slashMatch[2]);
    let year = slashMatch[3];
    if (year.length === 2) {
      year = (Number(year) > 50 ? '19' : '20') + year;
    }

    // In DepEd standard, format is MM/DD/YYYY.
    // If part1 > 12, part1 must be the day (DD/MM/YYYY)
    if (part1 > 12 && part2 <= 12) {
      const m = String(part2).padStart(2, '0');
      const d = String(part1).padStart(2, '0');
      return `${m}/${d}/${year}`;
    } else {
      const m = String(part1).padStart(2, '0');
      const d = String(part2).padStart(2, '0');
      return `${m}/${d}/${year}`;
    }
  }

  return str;
}

/**
 * Format salary into standard comma-separated numeric string (e.g. 18,549.00)
 */
export function formatSalaryValue(rawVal: unknown): string {
  if (rawVal === null || rawVal === undefined) return '0.00';
  const cleanStr = String(rawVal).replace(/[^0-9.]/g, '');
  if (!cleanStr) return '0.00';
  const num = parseFloat(cleanStr);
  if (isNaN(num)) return String(rawVal);
  return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Helper to clean and validate salary grade (1..33)
 */
function cleanSG(rawSg: unknown, designation?: string): string {
  const digits = String(rawSg || '').replace(/[^0-9]/g, '');
  if (digits && Number(digits) >= 1 && Number(digits) <= 33) {
    return digits;
  }
  // Infer from common DepEd designations if absent
  if (designation) {
    const d = designation.toUpperCase();
    if (d.includes('TCH1') || d.includes('TEACHER I') || d.includes('T-1')) return '11';
    if (d.includes('TCH2') || d.includes('TEACHER II') || d.includes('T-2')) return '12';
    if (d.includes('TCH3') || d.includes('TEACHER III') || d.includes('T-3')) return '13';
    if (d.includes('MT1') || d.includes('MASTER TEACHER I')) return '18';
    if (d.includes('MT2') || d.includes('MASTER TEACHER II')) return '19';
    if (d.includes('HT1') || d.includes('HEAD TEACHER I')) return '14';
    if (d.includes('AO2') || d.includes('ADMINISTRATIVE OFFICER II')) return '11';
    if (d.includes('ADAS2') || d.includes('ADMINISTRATIVE ASSISTANT II')) return '8';
    if (d.includes('ADAS3') || d.includes('ADMINISTRATIVE ASSISTANT III')) return '9';
    if (d.includes('ADA6') || d.includes('ADMINISTRATIVE AIDE VI')) return '6';
    if (d.includes('SP-1') || d.includes('PRINCIPAL I')) return '19';
  }
  return '11';
}

/**
 * Helper to clean step increment (1..8)
 */
function cleanStep(rawStep: unknown): string {
  const digits = String(rawStep || '').replace(/[^0-9]/g, '');
  if (digits && Number(digits) >= 1 && Number(digits) <= 8) {
    return digits;
  }
  return '1';
}

/**
 * Downloads the official Excel template for Service Records (.xlsx)
 * Matching the exact DepEd Form 029 data fields:
 * Row 1: Name: | [PERSONNEL_NAME]
 * Row 2: (blank)
 * Row 3: From | To | Position | Status | SG | Step | Monthly Salary | Office / Station | Leave W/O Pay | Remarks
 */
export function downloadServiceRecordTemplate(options?: {
  personnelName?: string;
  useSampleData?: boolean;
  existingBlocks?: ServiceRecordBlock[];
  filename?: string;
}): void {
  const nameToUse = options?.personnelName?.trim() || 'OMAR, MICHEL FALCASANTOS';
  const filename = options?.filename || `Service_Record_Template_${nameToUse.replace(/[^a-zA-Z0-9_-]/g, '_')}.xlsx`;

  const workbook = XLSX.utils.book_new();

  // Sheet 1: Service Record Data
  const sheetData: (string | number)[][] = [
    ['Name:', nameToUse],
    [''],
    ['From', 'To', 'Position', 'Status', 'SG', 'Step', 'Monthly Salary', 'Office / Station', 'Leave W/O Pay', 'Remarks'],
  ];

  if (options?.existingBlocks && options.existingBlocks.length > 0) {
    for (const b of options.existingBlocks) {
      sheetData.push([
        b.from || b.dateFrom || '',
        b.to || b.dateTo || 'PRESENT',
        b.designation || '',
        b.status || 'REG/PERM',
        b.salaryGrade ? Number(b.salaryGrade) || b.salaryGrade : 11,
        b.step ? Number(b.step) || b.step : 1,
        formatSalaryValue(b.monthlySalary),
        b.schoolAssignment || b.station || '',
        b.lwop === 'NONE' || !b.lwop ? 0 : b.lwop,
        b.remarks || '',
      ]);
    }
  } else if (options?.useSampleData !== false) {
    // Populate with authentic sample rows matching the user's uploaded guide
    for (const row of SAMPLE_OMAR_SERVICE_ROWS) {
      sheetData.push([
        row.from,
        row.to,
        row.position,
        row.status,
        row.sg,
        row.step,
        row.salary,
        row.office,
        row.lwop,
        row.remarks,
      ]);
    }
  }

  const worksheet = XLSX.utils.aoa_to_sheet(sheetData);

  // Set explicit column widths to match authentic spreadsheet layout
  worksheet['!cols'] = [
    { wch: 14 }, // From
    { wch: 14 }, // To
    { wch: 14 }, // Position
    { wch: 14 }, // Status
    { wch: 8 },  // SG
    { wch: 8 },  // Step
    { wch: 16 }, // Monthly Salary
    { wch: 22 }, // Office / Station
    { wch: 16 }, // Leave W/O Pay
    { wch: 24 }, // Remarks
  ];

  XLSX.utils.book_append_sheet(workbook, worksheet, 'Service Record');

  // Sheet 2: Guidelines & User Reference
  const guideData: string[][] = [
    ['DEPARTMENT OF EDUCATION - DIVISION OF ZAMBOANGA CITY'],
    ['SERVICE RECORD (FORM F-ADM-PER-029.0 / EO 54) - EXCEL IMPORT GUIDE'],
    [''],
    ['COLUMN DESCRIPTIONS & INSTRUCTIONS:'],
    ['1. Row 1: "Name:" in column A, and the Personnel Complete Legal Name in column B (e.g. LASTNAME, FIRSTNAME MIDDLENAME).'],
    ['2. Row 2 is left blank as a visual separator.'],
    ['3. Row 3 contains the official table headers. You can also upload multi-sheet files or DepEd Form 029 exports.'],
    ['   - From: Starting date of appointment (Format: MM/DD/YYYY, e.g., 05/15/2013)'],
    ['   - To: Ending date of appointment (Format: MM/DD/YYYY, or "PRESENT" for current ongoing appointment)'],
    ['   - Position: DepEd appointment title or designation (e.g., TCH1, TCH2, TCH3, MT1, ADAS2, AO2)'],
    ['   - Status: Civil service status (e.g., REG/PERM, PERM., PROV., SUBST., CONTRACTUAL)'],
    ['   - SG: Salary Grade number (e.g., 11 for Teacher I, 13 for Teacher III)'],
    ['   - Step: Step increment (1 to 8)'],
    ['   - Monthly Salary: Monthly salary rate in Philippine Pesos (e.g., 18,549.00 or 36,283.00)'],
    ['   - Office / Station: School station or assigned office (e.g., LICOMO ES, MANGUSU IS)'],
    ['   - Leave W/O Pay: Number of days on leave without pay (LWOP), enter 0 or NONE if none'],
    ['   - Remarks: Action type (e.g., ORIGINAL, SALARY TRANCHE, STEP INCREMENT, RECLASSIFICATION, PROMOTION)'],
    [''],
    ['DATE IMPORT RELIABILITY:'],
    ['- Both text formatted dates (e.g., 05/15/2013, 5/15/2013) and Excel date numbers (serials) are automatically detected.'],
    ['- The system preserves exact dates and avoids browser timezone day-shifting errors.'],
    ['- The word "PRESENT" or "CURRENT" in the "To" column is automatically recognized for ongoing service.'],
  ];

  const guideSheet = XLSX.utils.aoa_to_sheet(guideData);
  guideSheet['!cols'] = [{ wch: 95 }];
  XLSX.utils.book_append_sheet(workbook, guideSheet, 'Format Guide & Instructions');

  XLSX.writeFile(workbook, filename);
}

export interface ParsedServiceRecordResult {
  detectedName: string | null;
  blocks: ServiceRecordBlock[];
  summary: {
    totalRows: number;
    earliestDate: string;
    latestDate: string;
    latestPosition: string;
    latestStatus: string;
    latestSG: string | number;
    latestStep: string | number;
    latestSalary: string;
    latestOffice: string;
  };
  warnings: string[];
  errors: string[];
}

/**
 * Parses an uploaded Excel (.xlsx, .xls) or CSV file for a Service Record.
 * Reliably extracts exact dates, personnel names, and record blocks.
 */
export async function parseServiceRecordExcel(file: File): Promise<ParsedServiceRecordResult> {
  const arrayBuffer = await file.arrayBuffer();

  // Read without cellDates to keep raw serial numbers intact, avoiding timezone shifts
  const workbook = XLSX.read(arrayBuffer, {
    type: 'array',
    cellDates: false,
  });

  if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
    throw new Error('The uploaded workbook contains no sheets.');
  }

  // Find the most appropriate sheet (service record, 029, or first sheet)
  let targetSheetName = workbook.SheetNames[0];
  for (const sheetName of workbook.SheetNames) {
    const lower = sheetName.toLowerCase();
    if (lower.includes('service') || lower.includes('record') || lower.includes('029') || lower.includes('data')) {
      targetSheetName = sheetName;
      break;
    }
  }

  const sheet = workbook.Sheets[targetSheetName];
  if (!sheet) {
    throw new Error('Could not access spreadsheet data.');
  }

  // formattedRows contains rendered text values (cell.w in SheetJS)
  const formattedRows: unknown[][] = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    raw: false,
    defval: '',
    blankrows: false,
  }) as unknown[][];

  // rawRows contains underlying values (numbers, serials, raw strings)
  const rawRows: unknown[][] = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    raw: true,
    defval: '',
    blankrows: false,
  }) as unknown[][];

  if (formattedRows.length === 0) {
    throw new Error('The uploaded Excel file is empty.');
  }

  let detectedName: string | null = null;
  const warnings: string[] = [];
  const errors: string[] = [];

  // Step 1: Detect personnel name across the top rows
  const maxScanRows = Math.min(30, formattedRows.length);
  for (let r = 0; r < maxScanRows; r++) {
    const row = formattedRows[r] || [];
    for (let c = 0; c < row.length; c++) {
      const cellVal = String(row[c] || '').trim();
      if (!cellVal) continue;

      // Pattern: "Name: OMAR, MICHEL FALCASANTOS"
      if (/^name\s*[:=-]/i.test(cellVal) || /^personnel\s*[:=-]/i.test(cellVal) || /^employee\s*[:=-]/i.test(cellVal)) {
        const parts = cellVal.split(/[:=-]/);
        if (parts[1] && parts[1].trim()) {
          detectedName = parts[1].trim();
          break;
        }
        if (row[c + 1] && String(row[c + 1]).trim()) {
          detectedName = String(row[c + 1]).trim();
          break;
        }
      } else if (cellVal.toLowerCase() === 'name:' || cellVal.toLowerCase() === 'name') {
        if (row[c + 1] && String(row[c + 1]).trim()) {
          detectedName = String(row[c + 1]).trim();
          break;
        }
      } else if (/^surname/i.test(cellVal) && row[c + 1] && /^given\s*name/i.test(String(row[c + 1]))) {
        // Next row may have [LASTNAME, FIRSTNAME, MIDDLENAME]
        const nextRow = formattedRows[r + 1] || [];
        const sur = String(nextRow[c] || '').trim();
        const giv = String(nextRow[c + 1] || '').trim();
        const mid = String(nextRow[c + 2] || '').trim();
        if (sur && giv) {
          detectedName = `${sur}, ${giv} ${mid}`.trim();
          break;
        }
      }
    }
    if (detectedName) break;
  }

  // Fallback: Check if sheet name or file name has personnel name
  if (!detectedName) {
    const cleanSheet = targetSheetName.trim();
    if (
      !/^(sheet\d*|template|service\s*record|record|page\d*|data)$/i.test(cleanSheet) &&
      cleanSheet.length >= 4
    ) {
      detectedName = cleanSheet;
    } else if (file.name) {
      const cleanFileName = file.name.replace(/\.[^/.]+$/, '').replace(/service[_\s-]*record/gi, '').replace(/template/gi, '').replace(/[_-]/g, ' ').trim();
      if (cleanFileName.length >= 4 && !/^\d+$/.test(cleanFileName)) {
        detectedName = cleanFileName.toUpperCase();
      }
    }
  }

  // Step 2: Locate Header Row
  let headerRowIndex = -1;
  const colIndices: Record<string, number> = {
    from: -1,
    to: -1,
    position: -1,
    status: -1,
    sg: -1,
    step: -1,
    salary: -1,
    office: -1,
    remittingAgency: -1,
    branch: -1,
    lwop: -1,
    sepDate: -1,
    sepCause: -1,
    remarks: -1,
  };

  for (let r = 0; r < Math.min(35, formattedRows.length); r++) {
    const row = formattedRows[r] || [];
    const lowerRow = row.map((cell) => String(cell || '').trim().toLowerCase());

    const hasFrom = lowerRow.some((val) => val === 'from' || (val.includes('from') && !val.includes('leave') && !val.includes('lwop')));
    const hasTo = lowerRow.some((val) => val === 'to' || (val.includes('to') && !val.includes('leave') && !val.includes('lwop')));
    const hasPos = lowerRow.some((val) => val === 'position' || val.includes('designation') || val.includes('title') || val === 'rank');
    const hasSalary = lowerRow.some((val) => val === 'salary' || val.includes('salary') || val.includes('rate') || val === 'compensation');

    if ((hasFrom && hasTo) || (hasFrom && hasPos) || (hasPos && hasSalary)) {
      headerRowIndex = r;
      lowerRow.forEach((val, idx) => {
        if (
          val === 'from' ||
          val === 'date from' ||
          val === 'period from' ||
          val === 'start date' ||
          (val.includes('from') && !val.includes('lwop') && !val.includes('leave') && !val.includes('absence'))
        ) {
          if (colIndices.from === -1) colIndices.from = idx;
        } else if (
          val === 'to' ||
          val === 'date to' ||
          val === 'period to' ||
          val === 'end date' ||
          (val.includes('to') && !val.includes('lwop') && !val.includes('leave') && !val.includes('absence'))
        ) {
          if (colIndices.to === -1) colIndices.to = idx;
        } else if (
          val === 'position' ||
          val === 'designation' ||
          val === 'title' ||
          val === 'plantilla title' ||
          val.includes('position') ||
          val.includes('designation')
        ) {
          if (colIndices.position === -1) colIndices.position = idx;
        } else if (val === 'status' || val.includes('status') || val.includes('appt')) {
          if (colIndices.status === -1) colIndices.status = idx;
        } else if (val === 'sg' || val === 'salary grade' || val === 'sal grade' || val === 'sal. grade' || val === 'grade') {
          if (colIndices.sg === -1) colIndices.sg = idx;
        } else if (val === 'step' || val === 'step inc' || val === 'step increment' || val === 's' || val === 'step no') {
          if (colIndices.step === -1) colIndices.step = idx;
        } else if (
          val === 'salary' ||
          val === 'monthly salary' ||
          val === 'annual salary' ||
          val === 'salary rate' ||
          val === 'rate' ||
          val === 'monthly rate' ||
          val === 'compensation' ||
          val.includes('salary') ||
          val.includes('rate')
        ) {
          if (colIndices.salary === -1 && !val.includes('grade') && !val.includes('sg')) {
            colIndices.salary = idx;
          }
        } else if (
          val === 'office' ||
          val === 'station' ||
          val === 'school' ||
          val === 'office / station' ||
          val === 'school assignment' ||
          val === 'place of assignment' ||
          val.includes('school') ||
          val.includes('station') ||
          val.includes('assignment')
        ) {
          if (colIndices.office === -1 && !val.includes('remitting')) {
            colIndices.office = idx;
          }
        } else if (val.includes('remitting') || val.includes('agency')) {
          if (colIndices.remittingAgency === -1) colIndices.remittingAgency = idx;
        } else if (val === 'branch' || val.includes('branch')) {
          if (colIndices.branch === -1) colIndices.branch = idx;
        } else if (val.includes('leave') || val.includes('lwop') || val.includes('w/o pay') || val.includes('lv.ab')) {
          if (colIndices.lwop === -1) colIndices.lwop = idx;
        } else if (val.includes('sep') && val.includes('date')) {
          if (colIndices.sepDate === -1) colIndices.sepDate = idx;
        } else if (val.includes('cause') || (val.includes('sep') && val.includes('cause'))) {
          if (colIndices.sepCause === -1) colIndices.sepCause = idx;
        } else if (val === 'remarks' || val.includes('remark') || val.includes('action') || val.includes('notation')) {
          if (colIndices.remarks === -1) colIndices.remarks = idx;
        }
      });
      break;
    }
  }

  // If header not found by keyword, check if data rows start immediately (e.g. column 0 is a date)
  if (headerRowIndex === -1) {
    let dataStartRow = -1;
    for (let r = 0; r < Math.min(10, formattedRows.length); r++) {
      const fVal = formattedRows[r]?.[0];
      const rVal = rawRows[r]?.[0];
      const parsedDate = normalizeDateValue(fVal, rVal);
      if (parsedDate && parsedDate !== 'PRESENT' && /^\d{2}\/\d{2}\/\d{4}$/.test(parsedDate)) {
        dataStartRow = r;
        break;
      }
    }

    if (dataStartRow !== -1) {
      headerRowIndex = dataStartRow - 1;
    } else {
      headerRowIndex = formattedRows.length >= 3 ? 2 : 0;
    }

    colIndices.from = 0;
    colIndices.to = 1;
    colIndices.position = 2;
    colIndices.status = 3;
    colIndices.sg = 4;
    colIndices.step = 5;
    colIndices.salary = 6;
    colIndices.office = 7;
    colIndices.lwop = 8;
    colIndices.remarks = 9;
    warnings.push('Header row was inferred automatically based on standard template structure.');
  }

  // Ensure default fallbacks for missing column indices
  if (colIndices.from === -1) colIndices.from = 0;
  if (colIndices.to === -1) colIndices.to = 1;
  if (colIndices.position === -1) colIndices.position = 2;
  if (colIndices.status === -1) colIndices.status = 3;

  // Check if SG and Salary are inverted (e.g. Salary in column 4 and SG in column 6)
  if (colIndices.sg !== -1 && colIndices.salary !== -1 && headerRowIndex + 1 < formattedRows.length) {
    const sampleRow = formattedRows[headerRowIndex + 1] || [];
    const valAtSg = parseFloat(String(sampleRow[colIndices.sg] || '').replace(/[^0-9.]/g, ''));
    const valAtSalary = parseFloat(String(sampleRow[colIndices.salary] || '').replace(/[^0-9.]/g, ''));
    if (!isNaN(valAtSg) && valAtSg > 500 && !isNaN(valAtSalary) && valAtSalary <= 33) {
      // Columns are inverted! Swap them
      const temp = colIndices.sg;
      colIndices.sg = colIndices.salary;
      colIndices.salary = temp;
    }
  }

  // Step 3: Parse Data Rows
  const blocks: ServiceRecordBlock[] = [];

  for (let r = headerRowIndex + 1; r < formattedRows.length; r++) {
    const fRow = formattedRows[r] || [];
    const rRow = rawRows[r] || [];
    if (fRow.length === 0 && rRow.length === 0) continue;

    const getFVal = (colIdx: number) => (colIdx >= 0 && colIdx < fRow.length ? fRow[colIdx] : '');
    const getRVal = (colIdx: number) => (colIdx >= 0 && colIdx < rRow.length ? rRow[colIdx] : '');

    const fFrom = getFVal(colIndices.from);
    const rFrom = getRVal(colIndices.from);
    const fTo = getFVal(colIndices.to);
    const rTo = getRVal(colIndices.to);

    const fPos = getFVal(colIndices.position);
    const rPos = getRVal(colIndices.position);
    const fStatus = getFVal(colIndices.status);
    const rStatus = getRVal(colIndices.status);
    const fSg = getFVal(colIndices.sg);
    const rSg = getRVal(colIndices.sg);
    const fStep = getFVal(colIndices.step);
    const rStep = getRVal(colIndices.step);
    const fSalary = getFVal(colIndices.salary);
    const rSalary = getRVal(colIndices.salary);
    const fOffice = getFVal(colIndices.office);
    const rOffice = getRVal(colIndices.office);
    const fRemitting = colIndices.remittingAgency !== -1 ? getFVal(colIndices.remittingAgency) : '';
    const fBranch = colIndices.branch !== -1 ? getFVal(colIndices.branch) : '';
    const fLwop = colIndices.lwop !== -1 ? getFVal(colIndices.lwop) : '';
    const rLwop = colIndices.lwop !== -1 ? getRVal(colIndices.lwop) : '';
    const fSepDate = colIndices.sepDate !== -1 ? getFVal(colIndices.sepDate) : '';
    const fSepCause = colIndices.sepCause !== -1 ? getFVal(colIndices.sepCause) : '';
    const fRemarks = colIndices.remarks !== -1 ? getFVal(colIndices.remarks) : '';
    const rRemarks = colIndices.remarks !== -1 ? getRVal(colIndices.remarks) : '';

    // Check for footer rows to stop parsing
    const rowStr = fRow.map((c) => String(c || '').toLowerCase()).join(' ');
    if (
      rowStr.includes('certified correct') ||
      rowStr.includes('schools division superintendent') ||
      rowStr.includes('administrative officer') ||
      rowStr.includes('prepared by') ||
      rowStr.includes('issued upon request') ||
      rowStr.includes('page 1 of') ||
      rowStr.includes('page 2 of')
    ) {
      // Reached footer
      break;
    }

    const fromDate = normalizeDateValue(fFrom, rFrom);
    let toDate = normalizeDateValue(fTo, rTo);
    const position = String(fPos || rPos || '').trim().toUpperCase();

    // If both dates and position are completely empty, skip row
    if (!fromDate && !toDate && !position) {
      continue;
    }

    // Default empty 'To' date on the last row to 'PRESENT'
    if (!toDate && r === formattedRows.length - 1) {
      toDate = 'PRESENT';
    }

    const cleanSalary = formatSalaryValue(fSalary || rSalary);
    const cleanSgVal = cleanSG(fSg || rSg, position);
    const cleanStepVal = cleanStep(fStep || rStep);
    const officeStr = String(fOffice || rOffice || '').trim().toUpperCase() || 'MANGUSU IS';
    const statusStr = String(fStatus || rStatus || '').trim().toUpperCase() || 'REG/PERM';
    const remarksStr = String(fRemarks || rRemarks || '').trim().toUpperCase();

    let lwopStr = 'NONE';
    const rawLwopVal = fLwop !== '' ? fLwop : rLwop;
    if (rawLwopVal !== '' && String(rawLwopVal).trim() !== '0' && String(rawLwopVal).toUpperCase() !== 'NONE') {
      lwopStr = String(rawLwopVal).trim().toUpperCase();
    }

    const remittingAgencyStr = String(fRemitting || '').trim().toUpperCase() || 'ZAMBOANGA CITY HIGH SCHOOL - 1000030811';
    const branchStr = String(fBranch || '').trim().toUpperCase() || 'NAT.';

    let sepDateCauseStr = 'N/A';
    if (fSepDate || fSepCause) {
      sepDateCauseStr = `${fSepDate || ''} ${fSepCause || ''}`.trim() || 'N/A';
    }

    const block: ServiceRecordBlock = {
      id: `srb-import-${Date.now()}-${r}-${Math.random().toString(36).substring(2, 6)}`,
      from: fromDate || '01/01/2026',
      to: toDate || 'PRESENT',
      dateFrom: fromDate || '01/01/2026',
      dateTo: toDate || 'PRESENT',
      designation: position || 'TEACHER I',
      status: statusStr,
      monthlySalary: cleanSalary,
      salaryGrade: cleanSgVal,
      step: cleanStepVal,
      schoolAssignment: officeStr,
      remittingAgency: remittingAgencyStr,
      station: officeStr,
      branch: branchStr,
      lwop: lwopStr,
      separationDateCause: sepDateCauseStr,
      remarks: remarksStr,
    };

    blocks.push(block);
  }

  if (blocks.length === 0) {
    errors.push('No valid service record rows could be extracted from the uploaded spreadsheet.');
  }

  // Step 4: Summary calculation
  const latestBlock = blocks[blocks.length - 1];
  const earliestBlock = blocks[0];

  const summary = {
    totalRows: blocks.length,
    earliestDate: earliestBlock ? earliestBlock.from : 'N/A',
    latestDate: latestBlock ? latestBlock.to : 'N/A',
    latestPosition: latestBlock ? latestBlock.designation : 'N/A',
    latestStatus: latestBlock ? latestBlock.status : 'N/A',
    latestSG: latestBlock ? latestBlock.salaryGrade || '11' : '11',
    latestStep: latestBlock ? latestBlock.step || '1' : '1',
    latestSalary: latestBlock ? String(latestBlock.monthlySalary) : '0.00',
    latestOffice: latestBlock ? latestBlock.schoolAssignment || 'N/A' : 'N/A',
  };

  return {
    detectedName,
    blocks,
    summary,
    warnings,
    errors,
  };
}
