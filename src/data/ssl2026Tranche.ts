import * as XLSX from 'xlsx';

export interface SSLSalaryStep {
  step: number;
  salary: number; // in Philippine Pesos (PHP)
}

export interface SSLGradeRow {
  grade: number;
  steps: number[]; // Array of 8 salaries for Steps 1 through 8
}

export interface SSLGradeTableRow {
  salaryGrade: number;
  benchmarkPositions: string[];
  steps: Record<1 | 2 | 3 | 4 | 5 | 6 | 7 | 8, number>;
}

export interface SalaryTrancheConfig {
  title: string;
  effectiveYear?: string;
  circularRef?: string;
  uploadedAt: string;
  sourceFileName?: string;
  matrix: Record<number, number[]>; // SG 1 to 33 -> 8 steps (values in PHP)
}

export const STORAGE_KEY_TRANCHE = 'aoii_custom_salary_tranche';

// Standard Benchmark DepEd and Civil Service positions for Grades 1 to 33
export const BENCHMARK_POSITIONS: Record<number, string[]> = {
  1: ['Utility Worker I', 'Messenger'],
  2: ['Administrative Aide II'],
  3: ['Administrative Aide III', 'Driver I'],
  4: ['Administrative Aide IV', 'Bookbinder'],
  5: ['Administrative Aide V'],
  6: ['Administrative Aide VI'],
  7: ['Administrative Assistant I', 'Computer Operator I'],
  8: ['Administrative Assistant II', 'Draftsman II'],
  9: ['Administrative Assistant III', 'Senior Bookkeeper'],
  10: ['Administrative Officer I'],
  11: ['Teacher I', 'Registrar I'],
  12: ['Teacher II'],
  13: ['Teacher III'],
  14: ['Administrative Officer III'],
  15: ['Administrative Officer II (AO II)'],
  16: ['Special Science Teacher I', 'Master Teacher I (Elementary)'],
  17: ['Head Teacher I'],
  18: ['Master Teacher I (Secondary)', 'Head Teacher III'],
  19: ['Master Teacher II', 'Head Teacher IV'],
  20: ['Master Teacher III', 'Head Teacher V'],
  21: ['Master Teacher IV', 'Principal I'],
  22: ['Principal II', 'Head Teacher VI'],
  23: ['Principal III'],
  24: ['Principal IV'],
  25: ['Education Program Supervisor (EPS)', 'Public Schools District Supervisor (PSDS)'],
  26: ['Chief Education Supervisor (CID / SGOD)'],
  27: ['Assistant Schools Division Superintendent (Junior)'],
  28: ['Assistant Schools Division Superintendent (ASDS)'],
  29: ['Director III / ASDS Senior'],
  30: ['Schools Division Superintendent (SDS)'],
  31: ['Regional Director (RD)', 'Assistant Secretary'],
  32: ['Undersecretary'],
  33: ['Secretary of Education'],
};

// Clean, empty baseline matrix for Salary Grades 1 to 33 with zero values (no hardcoded salary figures)
export function createEmptySalaryMatrix(): Record<number, number[]> {
  const empty: Record<number, number[]> = {};
  for (let sg = 1; sg <= 33; sg++) {
    empty[sg] = [0, 0, 0, 0, 0, 0, 0, 0];
  }
  return empty;
}

export const EMPTY_SALARY_MATRIX = createEmptySalaryMatrix();

// LocalStorage accessor for user-uploaded custom tranche
export function getLoadedSalaryTranche(): SalaryTrancheConfig | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_TRANCHE);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && parsed.matrix) {
      return parsed as SalaryTrancheConfig;
    }
  } catch (err) {
    console.warn('Failed to parse custom salary tranche from storage:', err);
  }
  return null;
}

// Checks whether an active, valid salary tranche is uploaded with non-zero rates
export function hasSalaryTrancheData(): boolean {
  const tranche = getLoadedSalaryTranche();
  if (!tranche || !tranche.matrix) return false;
  // Check if at least one step in any salary grade is greater than 0
  for (let sg = 1; sg <= 33; sg++) {
    const steps = tranche.matrix[sg];
    if (steps && steps.some((val) => val > 0)) {
      return true;
    }
  }
  return false;
}

// Retrieves the active matrix: either the user-uploaded tranche or the blank matrix
export function getActiveSalaryMatrix(): Record<number, number[]> {
  const custom = getLoadedSalaryTranche();
  if (custom && custom.matrix) {
    return custom.matrix;
  }
  return EMPTY_SALARY_MATRIX;
}

// Alias for backwards compatibility with any direct matrix reads
export const SSL_2026_MATRIX: Record<number, number[]> = new Proxy(EMPTY_SALARY_MATRIX, {
  get(_target, prop) {
    const active = getActiveSalaryMatrix();
    const key = Number(prop);
    if (!isNaN(key) && active[key]) {
      return active[key];
    }
    return [0, 0, 0, 0, 0, 0, 0, 0];
  },
});

// Retrieves monthly basic salary for a specific Grade and Step
export function getSalary(grade: number, step: number): number {
  const g = Math.max(1, Math.min(33, grade));
  const s = Math.max(1, Math.min(8, step));
  const matrix = getActiveSalaryMatrix();
  const steps = matrix[g];
  if (!steps) return 0;
  return steps[s - 1] || 0;
}

// Dynamic rows generator for matrix explorer table
export function getSalaryRows(customMatrix?: Record<number, number[]>): SSLGradeTableRow[] {
  const matrix = customMatrix || getActiveSalaryMatrix();
  const rows: SSLGradeTableRow[] = [];

  for (let sg = 1; sg <= 33; sg++) {
    const arr = matrix[sg] || [0, 0, 0, 0, 0, 0, 0, 0];
    rows.push({
      salaryGrade: sg,
      benchmarkPositions: BENCHMARK_POSITIONS[sg] || [`Salary Grade ${sg}`],
      steps: {
        1: arr[0] || 0,
        2: arr[1] || 0,
        3: arr[2] || 0,
        4: arr[3] || 0,
        5: arr[4] || 0,
        6: arr[5] || 0,
        7: arr[6] || 0,
        8: arr[7] || 0,
      },
    });
  }

  return rows;
}

export const SSL_2026_ROWS: SSLGradeTableRow[] = getSalaryRows();

// Formats a number to Philippine Pesos (PHP)
export function formatPHP(amount: number): string {
  if (isNaN(amount) || amount === 0) {
    return '₱0.00';
  }
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

// Saves custom salary tranche to storage and triggers portal-wide event
export function saveSalaryTranche(config: SalaryTrancheConfig): void {
  try {
    localStorage.setItem(STORAGE_KEY_TRANCHE, JSON.stringify(config));
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('salary-tranche-updated', { detail: config }));
    }
  } catch (err) {
    console.error('Failed to save salary tranche:', err);
    throw err;
  }
}

// Clears custom salary tranche from storage and resets to empty state
export function clearSalaryTranche(): void {
  try {
    localStorage.removeItem(STORAGE_KEY_TRANCHE);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('salary-tranche-updated', { detail: null }));
    }
  } catch (err) {
    console.error('Failed to clear salary tranche:', err);
  }
}

export interface VarianceResult {
  fromGrade: number;
  fromStep: number;
  fromSalary: number;
  toGrade: number;
  toStep: number;
  toSalary: number;
  absoluteVariance: number;
  monthlyDifference: number;
  percentageIncrease: number;
  isPromotion: boolean;
  isStepIncrement: boolean;
}

export function compareSalaryPoints(
  fromGrade: number,
  fromStep: number,
  toGrade: number,
  toStep: number
): VarianceResult {
  const fromSalary = getSalary(fromGrade, fromStep);
  const toSalary = getSalary(toGrade, toStep);
  const absoluteVariance = toSalary - fromSalary;
  const percentageIncrease = fromSalary > 0 ? (absoluteVariance / fromSalary) * 100 : 0;

  return {
    fromGrade,
    fromStep,
    fromSalary,
    toGrade,
    toStep,
    toSalary,
    absoluteVariance,
    monthlyDifference: absoluteVariance,
    percentageIncrease,
    isPromotion: toGrade > fromGrade,
    isStepIncrement: toGrade === fromGrade && toStep > fromStep,
  };
}

export const compareSSLSteps = compareSalaryPoints;

// ----------------------------------------------------------------------
// EXCEL TEMPLATE DOWNLOAD AND SPREADSHEET IMPORT PARSER
// ----------------------------------------------------------------------

/**
 * Generates and downloads the official standardized DepEd DBM Salary Tranche Template (.xlsx)
 * pre-populated with Salary Grades 1 to 33, standard civil service benchmark titles,
 * and blank Step 1-8 fields ready for the AO II or Division HR to enter approved statutory rates.
 */
export function downloadSalaryTrancheTemplate(filename = 'DepEd_Salary_Tranche_Template.xlsx'): void {
  const workbook = XLSX.utils.book_new();

  // Sheet 1: Data Matrix
  const matrixHeaders = [
    'Salary Grade',
    'Benchmark DepEd Position',
    'Step 1',
    'Step 2',
    'Step 3',
    'Step 4',
    'Step 5',
    'Step 6',
    'Step 7',
    'Step 8',
  ];

  const dataRows: (string | number)[][] = [matrixHeaders];

  for (let sg = 1; sg <= 33; sg++) {
    const pos = BENCHMARK_POSITIONS[sg]?.join(' / ') || `Salary Grade ${sg}`;
    // Empty cells for steps 1-8 so user can enter official figures
    dataRows.push([sg, pos, '', '', '', '', '', '', '', '']);
  }

  const worksheet = XLSX.utils.aoa_to_sheet(dataRows);

  // Set column widths
  worksheet['!cols'] = [
    { wch: 14 }, // Salary Grade
    { wch: 45 }, // Benchmark Position
    { wch: 14 }, // Step 1
    { wch: 14 }, // Step 2
    { wch: 14 }, // Step 3
    { wch: 14 }, // Step 4
    { wch: 14 }, // Step 5
    { wch: 14 }, // Step 6
    { wch: 14 }, // Step 7
    { wch: 14 }, // Step 8
  ];

  XLSX.utils.book_append_sheet(workbook, worksheet, 'Salary Tranche Matrix');

  // Sheet 2: Official Guidelines & Notes
  const guideRows = [
    ['DEPARTMENT OF EDUCATION - DIVISION OF ZAMBOANGA CITY'],
    ['ADMINISTRATIVE OFFICER II (AO II) - SALARY TRANCHE IMPORT TEMPLATE'],
    [''],
    ['INSTRUCTIONS FOR FILLING OUT THE TEMPLATE:'],
    ['1. Do NOT modify or delete the header names in row 1 of the "Salary Tranche Matrix" sheet.'],
    ['2. The "Salary Grade" column must contain numbers 1 through 33.'],
    ['3. Fill in the monthly statutory salary rates in Philippine Pesos (PHP) for Steps 1 through 8.'],
    ['4. Values can be entered as plain numbers (e.g. 30227) or formatted with commas (e.g. 30,227.00).'],
    ['5. Benchmark positions are for reference and will not affect salary parsing if modified.'],
    ['6. Save the file and upload it directly into the AOII Portal via the "Upload Salary Tranche" button.'],
    ['7. Once uploaded, the system will immediately recalculate Form 48, NOSI, and payroll analytics.'],
    [''],
    ['REFERENCE: Department of Budget and Management (DBM) National Budget Circular (NBC) / SSL Tranche Schedule'],
  ];

  const guideSheet = XLSX.utils.aoa_to_sheet(guideRows);
  guideSheet['!cols'] = [{ wch: 80 }];
  XLSX.utils.book_append_sheet(workbook, guideSheet, 'Instructions & Notes');

  // Write and download
  XLSX.writeFile(workbook, filename);
}

/**
 * Exports currently active salary tranche rates to an Excel file (.xlsx)
 */
export function exportActiveSalaryTrancheExcel(filename = 'Active_Salary_Tranche_Schedule.xlsx'): void {
  const custom = getLoadedSalaryTranche();
  const matrix = getActiveSalaryMatrix();
  const workbook = XLSX.utils.book_new();

  const matrixHeaders = [
    'Salary Grade',
    'Benchmark DepEd Position',
    'Step 1',
    'Step 2',
    'Step 3',
    'Step 4',
    'Step 5',
    'Step 6',
    'Step 7',
    'Step 8',
  ];

  const dataRows: (string | number)[][] = [matrixHeaders];

  for (let sg = 1; sg <= 33; sg++) {
    const pos = BENCHMARK_POSITIONS[sg]?.join(' / ') || `Salary Grade ${sg}`;
    const steps = matrix[sg] || [0, 0, 0, 0, 0, 0, 0, 0];
    dataRows.push([
      sg,
      pos,
      steps[0] || 0,
      steps[1] || 0,
      steps[2] || 0,
      steps[3] || 0,
      steps[4] || 0,
      steps[5] || 0,
      steps[6] || 0,
      steps[7] || 0,
    ]);
  }

  const worksheet = XLSX.utils.aoa_to_sheet(dataRows);
  worksheet['!cols'] = [
    { wch: 14 },
    { wch: 45 },
    { wch: 14 },
    { wch: 14 },
    { wch: 14 },
    { wch: 14 },
    { wch: 14 },
    { wch: 14 },
    { wch: 14 },
    { wch: 14 },
  ];

  XLSX.utils.book_append_sheet(workbook, worksheet, custom?.title || 'Active Salary Tranche');
  XLSX.writeFile(workbook, filename);
}

/**
 * Parses an uploaded Excel (.xlsx, .xls) or CSV file containing a Salary Tranche Matrix.
 * Extracts Salary Grades 1 to 33 and Steps 1 to 8, with thorough error reporting.
 */
export async function parseSalaryTrancheFile(
  file: File
): Promise<{ success: boolean; config?: SalaryTrancheConfig; validGradesCount: number; errors: string[] }> {
  const errors: string[] = [];

  try {
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array' });

    if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
      return { success: false, validGradesCount: 0, errors: ['The uploaded file contains no worksheets.'] };
    }

    // Pick the first sheet or the one named with "Matrix" / "Salary" / "Tranche"
    let sheetName = workbook.SheetNames[0];
    const candidate = workbook.SheetNames.find((s) => /matrix|salary|tranche/i.test(s));
    if (candidate) sheetName = candidate;

    const sheet = workbook.Sheets[sheetName];
    if (!sheet) {
      return { success: false, validGradesCount: 0, errors: ['Unable to read worksheet content.'] };
    }

    // Convert sheet to JSON rows
    const rows = XLSX.utils.sheet_to_json<(string | number)[]>(sheet, { header: 1, defval: '' });

    if (!rows || rows.length < 2) {
      return { success: false, validGradesCount: 0, errors: ['The worksheet is empty or does not have enough rows.'] };
    }

    // Locate header row containing "Grade" or "SG"
    let headerRowIdx = -1;
    for (let r = 0; r < Math.min(rows.length, 15); r++) {
      const row = rows[r];
      if (Array.isArray(row)) {
        const hasGrade = row.some((cell) => /grade|sg|salary\s*grade/i.test(String(cell)));
        const hasStep = row.some((cell) => /step\s*1|step1|^1$/i.test(String(cell)));
        if (hasGrade || hasStep) {
          headerRowIdx = r;
          break;
        }
      }
    }

    if (headerRowIdx === -1) {
      headerRowIdx = 0; // Fallback to first row
    }

    const headers = (rows[headerRowIdx] || []).map((h) => String(h).trim().toLowerCase());

    // Map column indices
    let gradeCol = headers.findIndex((h) => /salary\s*grade|^grade$|^sg$/i.test(h));
    if (gradeCol === -1) gradeCol = 0; // default to first column

    const stepCols: number[] = [];
    for (let s = 1; s <= 8; s++) {
      const colIdx = headers.findIndex((h) => new RegExp(`step\\s*${s}|^${s}$`, 'i').test(h));
      stepCols.push(colIdx);
    }

    // If specific step headers were not found, fallback to sequential columns right after grade/position
    for (let s = 0; s < 8; s++) {
      if (stepCols[s] === -1) {
        // Try col index offset: if col 0 is SG and col 1 is Position, then steps are cols 2 through 9
        const fallbackCol = gradeCol === 0 ? 2 + s : 1 + s;
        stepCols[s] = fallbackCol;
      }
    }

    const newMatrix = createEmptySalaryMatrix();
    let validCount = 0;

    for (let r = headerRowIdx + 1; r < rows.length; r++) {
      const row = rows[r];
      if (!Array.isArray(row) || row.length === 0) continue;

      const rawGrade = String(row[gradeCol] || '').trim();
      const gradeMatch = rawGrade.match(/\d+/);
      if (!gradeMatch) continue;

      const grade = parseInt(gradeMatch[0], 10);
      if (grade < 1 || grade > 33) continue;

      const steps: number[] = [];
      let hasAnyRate = false;

      for (let s = 0; s < 8; s++) {
        const cIdx = stepCols[s];
        const rawVal = cIdx !== -1 && cIdx < row.length ? row[cIdx] : '';
        const cleanedStr = String(rawVal).replace(/[₱$,\s]/g, '').trim();
        const num = parseFloat(cleanedStr);
        const rate = isNaN(num) || num < 0 ? 0 : Math.round(num * 100) / 100;
        steps.push(rate);
        if (rate > 0) hasAnyRate = true;
      }

      if (hasAnyRate) {
        newMatrix[grade] = steps;
        validCount++;
      }
    }

    if (validCount === 0) {
      return {
        success: false,
        validGradesCount: 0,
        errors: [
          'No valid salary amounts found in the file. Please ensure Salary Grades 1-33 have positive numeric values under Steps 1-8.',
        ],
      };
    }

    const config: SalaryTrancheConfig = {
      title: file.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' '),
      uploadedAt: new Date().toISOString(),
      sourceFileName: file.name,
      matrix: newMatrix,
    };

    return {
      success: true,
      config,
      validGradesCount: validCount,
      errors,
    };
  } catch (err) {
    return {
      success: false,
      validGradesCount: 0,
      errors: [`Error parsing spreadsheet: ${err instanceof Error ? err.message : String(err)}`],
    };
  }
}
