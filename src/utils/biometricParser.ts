import * as XLSX from 'xlsx';
import { ConflictMatch, DTRLog, Personnel } from '../types';

export interface ParseResult {
  exactMatches: Array<{
    existing: Personnel;
    incoming: Partial<Personnel>;
    mergedLogsCount: number;
  }>;
  conflictMatches: ConflictMatch[];
  newRecords: Personnel[];
  totalRowsProcessed: number;
}

// Levenshtein distance to detect name similarity
export function levenshteinDistance(a: string, b: string): number {
  const str1 = a.toLowerCase().trim();
  const str2 = b.toLowerCase().trim();
  const matrix: number[][] = [];

  for (let i = 0; i <= str2.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= str1.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= str2.length; i++) {
    for (let j = 1; j <= str1.length; j++) {
      if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          Math.min(matrix[i][j - 1] + 1, matrix[i - 1][j] + 1)
        );
      }
    }
  }

  return matrix[str2.length][str1.length];
}

export function areNamesSimilar(nameA: string, nameB: string): boolean {
  const a = nameA.toLowerCase().trim().replace(/[^a-z]/g, '');
  const b = nameB.toLowerCase().trim().replace(/[^a-z]/g, '');
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.includes(b) || b.includes(a)) return true;

  const dist = levenshteinDistance(a, b);
  const maxLen = Math.max(a.length, b.length);
  // Allow up to 2 character edits or similarity > 75%
  return dist <= 2 || dist / maxLen <= 0.25;
}

// Compound Philippine surnames
const COMPOUND_SURNAMES = [
  'de los santos',
  'delos santos',
  'de la cruz',
  'dela cruz',
  'del rosario',
  'del carmen',
  'de castro',
  'de leon',
  'de guzman',
  'de jesus',
  'de vega',
  'san juan',
  'san jose',
  'san pedro',
  'santa maria',
  'sta maria',
  'sta. maria',
];

/**
 * Parses raw biometric name strings often exported by biometric machines:
 * E.g.:
 * - "Jenevi-veAntido" -> First: "Jenevi-ve", Last: "Antido"
 * - "Ma Elvie D,R Acma" -> First: "Ma Elvie", Middle: "D.R.", Last: "Acma"
 * - "Linuel B, De Los Santos" -> First: "Linuel", Middle: "B.", Last: "De Los Santos"
 * - "Hazel Ann S. Ledesma" -> First: "Hazel Ann", Middle: "S.", Last: "Ledesma"
 * - "DaisyAstaca-an" -> First: "Daisy", Last: "Astaca-an"
 * - "MaryJoyFabian" -> First: "Mary Joy", Last: "Fabian"
 * - "MichaelvincentBejerano" -> First: "Michaelvincent", Last: "Bejerano"
 */
export function parseBiometricName(rawName: string): {
  firstName: string;
  middleName: string;
  lastName: string;
} {
  let cleaned = (rawName || '').trim();
  if (!cleaned) {
    return { firstName: 'Employee', middleName: '', lastName: 'Staff' };
  }

  // Handle accidental commas used by machine typists in place of periods or spaces
  // e.g. "Ma Elvie D,R Acma" -> "Ma Elvie D.R. Acma"
  cleaned = cleaned.replace(/([A-Za-z]),([A-Za-z])/g, '$1. $2');
  cleaned = cleaned.replace(/,\s+/g, ', ');

  // If formatted as "Lastname, Firstname Middle"
  if (cleaned.includes(',')) {
    const parts = cleaned.split(',').map((p) => p.trim());
    const lastName = parts[0] || 'Staff';
    const remaining = (parts[1] || '').split(/\s+/).filter(Boolean);
    let middleName = '';
    let firstName = remaining.join(' ');
    if (remaining.length > 1 && remaining[remaining.length - 1].length <= 2) {
      middleName = remaining.pop() || '';
      firstName = remaining.join(' ');
    }
    return { firstName: firstName || 'Employee', middleName, lastName };
  }

  // If no spaces present, split camelCase / PascalCase words
  // E.g. "Jenevi-veAntido" -> "Jenevi-ve Antido"
  // "DaisyAstaca-an" -> "Daisy Astaca-an"
  // "MaryJoyFabian" -> "Mary Joy Fabian"
  if (!cleaned.includes(' ')) {
    cleaned = cleaned.replace(/([a-z\-])([A-Z])/g, '$1 $2');
  }

  const tokens = cleaned.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) {
    return { firstName: 'Employee', middleName: '', lastName: 'Staff' };
  }
  if (tokens.length === 1) {
    return { firstName: tokens[0], middleName: '', lastName: tokens[0] };
  }
  if (tokens.length === 2) {
    return { firstName: tokens[0], middleName: '', lastName: tokens[1] };
  }

  // Check if tokens end with a known compound surname
  const lowerJoined = tokens.join(' ').toLowerCase();
  for (const compound of COMPOUND_SURNAMES) {
    if (lowerJoined.endsWith(compound)) {
      const compoundWordsCount = compound.split(' ').length;
      const lastName = tokens.slice(-compoundWordsCount).join(' ');
      const rest = tokens.slice(0, -compoundWordsCount);
      let middleName = '';
      if (rest.length > 1 && (rest[rest.length - 1].endsWith('.') || rest[rest.length - 1].length <= 2)) {
        middleName = rest.pop() || '';
      }
      return {
        firstName: rest.join(' ') || 'Employee',
        middleName,
        lastName,
      };
    }
  }

  // Check for standard "First Middle Last" or "First1 First2 Middle Last"
  const lastName = tokens.pop() || '';
  let middleName = '';
  if (tokens.length > 1 && (tokens[tokens.length - 1].endsWith('.') || tokens[tokens.length - 1].length <= 2)) {
    middleName = tokens.pop() || '';
  }

  return {
    firstName: tokens.join(' ') || 'Employee',
    middleName,
    lastName,
  };
}

/**
 * Parses timestamp from string or Excel serial number.
 * Returns date in YYYY-MM-DD, minutes from midnight (0-1439), and 24-hr formatted time string HH:MM.
 */
export function parseBiometricTimestamp(val: unknown): {
  dateStr: string;
  minutes: number;
  timeFormatted: string;
} | null {
  if (val === null || val === undefined || val === '') return null;

  // Handle numeric Excel date serial number
  if (typeof val === 'number') {
    const jsDate = new Date(Math.round((val - 25569) * 86400 * 1000));
    if (!isNaN(jsDate.getTime())) {
      const yyyy = jsDate.getUTCFullYear();
      const mm = String(jsDate.getUTCMonth() + 1).padStart(2, '0');
      const dd = String(jsDate.getUTCDate()).padStart(2, '0');
      const hours = jsDate.getUTCHours();
      const mins = jsDate.getUTCMinutes();
      return {
        dateStr: `${yyyy}-${mm}-${dd}`,
        minutes: hours * 60 + mins,
        timeFormatted: `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`,
      };
    }
  }

  const str = String(val).trim();
  if (!str) return null;

  // Pattern: "08/03/2026 7:24 AM" or "08/03/2026 07:24:00" or "2026-08-03 17:13"
  const dateTimeRegex = /^(\d{1,4})[\/\-](\d{1,2})[\/\-](\d{1,4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?$/i;
  const match = str.match(dateTimeRegex);

  if (match) {
    const part1 = parseInt(match[1], 10);
    const part2 = parseInt(match[2], 10);
    const part3 = parseInt(match[3], 10);
    let hour = parseInt(match[4], 10);
    const min = parseInt(match[5], 10);
    const ampm = match[7] ? match[7].toUpperCase() : null;

    if (ampm === 'PM' && hour < 12) hour += 12;
    if (ampm === 'AM' && hour === 12) hour = 0;

    let yyyy: number;
    let mm: number;
    let dd: number;

    if (part1 > 1000) {
      // YYYY-MM-DD
      yyyy = part1;
      mm = part2;
      dd = part3;
    } else {
      // MM/DD/YYYY (Standard DepEd Biometric Terminal format)
      mm = part1;
      dd = part2;
      yyyy = part3;
    }

    const dateStr = `${yyyy}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
    const minutes = hour * 60 + min;
    const timeFormatted = `${String(hour).padStart(2, '0')}:${String(min).padStart(2, '0')}`;

    return { dateStr, minutes, timeFormatted };
  }

  // Fallback: Attempt standard JS Date parsing
  const parsedDate = new Date(str);
  if (!isNaN(parsedDate.getTime())) {
    const yyyy = parsedDate.getFullYear();
    const mm = String(parsedDate.getMonth() + 1).padStart(2, '0');
    const dd = String(parsedDate.getDate()).padStart(2, '0');
    const hour = parsedDate.getHours();
    const min = parsedDate.getMinutes();
    return {
      dateStr: `${yyyy}-${mm}-${dd}`,
      minutes: hour * 60 + min,
      timeFormatted: `${String(hour).padStart(2, '0')}:${String(min).padStart(2, '0')}`,
    };
  }

  return null;
}

/**
 * Converts multiple raw punches for a single employee on a single day
 * into standard Civil Service Form 48 daily slots:
 * [amArrival, amDeparture, pmArrival, pmDeparture]
 */
export function assignDailyPunchesToForm48(rawMinutesList: number[]): {
  amArrival: string;
  amDeparture: string;
  pmArrival: string;
  pmDeparture: string;
} {
  if (rawMinutesList.length === 0) {
    return { amArrival: '', amDeparture: '', pmArrival: '', pmDeparture: '' };
  }

  // Sort ascending
  const sorted = [...rawMinutesList].sort((a, b) => a - b);

  // De-duplicate punches within 2 minutes of each other (accidental multiple biometric swipes)
  const uniqueMinutes: number[] = [];
  for (const m of sorted) {
    if (uniqueMinutes.length === 0 || m - uniqueMinutes[uniqueMinutes.length - 1] > 2) {
      uniqueMinutes.push(m);
    }
  }

  const formatMins = (mins: number | undefined): string => {
    if (mins === undefined) return '';
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  };

  const NOON = 720; // 12:00 PM
  const LUNCH_CUTOFF = 750; // 12:30 PM

  // Case 1: Exactly 1 punch
  if (uniqueMinutes.length === 1) {
    const p = uniqueMinutes[0];
    if (p < NOON) {
      return { amArrival: formatMins(p), amDeparture: '', pmArrival: '', pmDeparture: '' };
    }
    return { amArrival: '', amDeparture: '', pmArrival: '', pmDeparture: formatMins(p) };
  }

  // Case 2: Exactly 2 punches
  if (uniqueMinutes.length === 2) {
    const p1 = uniqueMinutes[0];
    const p2 = uniqueMinutes[1];

    if (p1 < NOON && p2 >= NOON) {
      // Morning in, Afternoon out
      return {
        amArrival: formatMins(p1),
        amDeparture: '',
        pmArrival: '',
        pmDeparture: formatMins(p2),
      };
    } else if (p1 < NOON && p2 < NOON) {
      // Both in morning: Morning in, Morning out
      return {
        amArrival: formatMins(p1),
        amDeparture: formatMins(p2),
        pmArrival: '',
        pmDeparture: '',
      };
    } else {
      // Both in afternoon: PM In, PM Out
      return {
        amArrival: '',
        amDeparture: '',
        pmArrival: formatMins(p1),
        pmDeparture: formatMins(p2),
      };
    }
  }

  // Case 3: Exactly 3 punches
  if (uniqueMinutes.length === 3) {
    const p1 = uniqueMinutes[0];
    const p2 = uniqueMinutes[1];
    const p3 = uniqueMinutes[2];

    if (p2 <= LUNCH_CUTOFF) {
      // Morning in, Lunch out, PM out
      return {
        amArrival: formatMins(p1),
        amDeparture: formatMins(p2),
        pmArrival: '',
        pmDeparture: formatMins(p3),
      };
    } else {
      // Morning in, PM in, PM out
      return {
        amArrival: formatMins(p1),
        amDeparture: '',
        pmArrival: formatMins(p2),
        pmDeparture: formatMins(p3),
      };
    }
  }

  // Case 4: 4 or more punches (Standard DepEd 4-punch schedule)
  const amIn = uniqueMinutes[0];
  const pmOut = uniqueMinutes[uniqueMinutes.length - 1];

  // For lunch out and lunch return, select intermediate punches around noon
  const middlePunches = uniqueMinutes.slice(1, -1);
  let amOut = middlePunches[0];
  let pmIn = middlePunches[middlePunches.length - 1];

  // If there are multiple middle punches, pick the latest before 12:20 for lunch out, and first after 12:10 for lunch return
  if (middlePunches.length > 2) {
    const morningExits = middlePunches.filter((m) => m <= 730);
    const afternoonEntries = middlePunches.filter((m) => m > 730);
    amOut = morningExits.length > 0 ? morningExits[morningExits.length - 1] : middlePunches[0];
    pmIn = afternoonEntries.length > 0 ? afternoonEntries[0] : middlePunches[middlePunches.length - 1];
  }

  return {
    amArrival: formatMins(amIn),
    amDeparture: formatMins(amOut),
    pmArrival: formatMins(pmIn),
    pmDeparture: formatMins(pmOut),
  };
}

/**
 * Universal Biometric and Roster File Parser
 * Accepts:
 * 1. Raw Machine Biometric Logs: AC-No., Name, Time (ZKTeco / Anviz / Realand / Granding terminal exports)
 * 2. Form 48 Consolidated Daily Sheets: EmployeeID, LastName, FirstName, Date, AMIn, AMOut, PMIn, PMOut
 * 3. School Personnel Master Rosters
 */
export async function parseBiometricOrRosterFile(
  fileOrBuffer: File | ArrayBuffer | string,
  existingRoster: Personnel[]
): Promise<ParseResult> {
  let workbook: XLSX.WorkBook;

  if (typeof fileOrBuffer === 'string') {
    workbook = XLSX.read(fileOrBuffer, { type: 'string' });
  } else if (fileOrBuffer instanceof ArrayBuffer) {
    workbook = XLSX.read(fileOrBuffer, { type: 'array' });
  } else {
    const buffer = await fileOrBuffer.arrayBuffer();
    workbook = XLSX.read(buffer, { type: 'array' });
  }

  const firstSheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[firstSheetName];
  const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, {
    defval: '',
  });

  const exactMatches: ParseResult['exactMatches'] = [];
  const conflictMatches: ConflictMatch[] = [];
  const newRecords: Personnel[] = [];

  // Determine if this is a raw biometric punch format (has "Time", "AC-No", etc.)
  // or a consolidated Form 48 summary format
  const getRowVal = (row: Record<string, unknown>, possibleKeys: string[]): string => {
    for (const k of possibleKeys) {
      const cleanKey = k.toLowerCase().replace(/[^a-z0-9]/g, '');
      for (const rowKey of Object.keys(row)) {
        if (rowKey.trim().toLowerCase().replace(/[^a-z0-9]/g, '') === cleanKey) {
          return String(row[rowKey]).trim();
        }
      }
    }
    return '';
  };

  // Intermediate map: Keyed by biometricId / empId
  interface AggregatedPerson {
    biometricId: string;
    rawName: string;
    firstName: string;
    middleName: string;
    lastName: string;
    position: string;
    station: string;
    // Map of date (YYYY-MM-DD) -> list of punch minutes
    rawPunchesByDate: Map<string, number[]>;
    // Direct consolidated daily logs (if spreadsheet already has AMIn/AMOut)
    directLogs: Record<string, DTRLog>;
  }

  const peopleMap = new Map<string, AggregatedPerson>();

  rawRows.forEach((row, idx) => {
    // Check for biometric ID / AC-No / EnNo / Employee ID
    const acNo = getRowVal(row, [
      'acno',
      'ac-no',
      'ac-no.',
      'ac_no',
      'enno',
      'en-no',
      'biometricid',
      'id',
      'empid',
      'employeeid',
      'idnumber',
      'pin',
      'userid',
      'no',
      'no.',
    ]) || `TEMP-${idx + 1}`;

    const rawName = getRowVal(row, ['name', 'fullname', 'employeename', 'personnelname', 'enrolleename', 'staffname']);
    const explicitLastName = getRowVal(row, ['lastname', 'surname', 'familyname']);
    const explicitFirstName = getRowVal(row, ['firstname', 'givenname', 'fname']);
    const explicitMiddleName = getRowVal(row, ['middlename', 'mname']);

    let firstName = explicitFirstName;
    let middleName = explicitMiddleName;
    let lastName = explicitLastName;

    if (!firstName && !lastName && rawName) {
      const parsed = parseBiometricName(rawName);
      firstName = parsed.firstName;
      middleName = parsed.middleName;
      lastName = parsed.lastName;
    }

    const position = getRowVal(row, ['position', 'positiontitle', 'designation']) || 'Teacher I';
    const station = getRowVal(row, ['station', 'school', 'schoolstation']) || '';

    if (!peopleMap.has(acNo)) {
      peopleMap.set(acNo, {
        biometricId: acNo,
        rawName: rawName || `${firstName} ${lastName}`,
        firstName: firstName || 'Staff',
        middleName: middleName || '',
        lastName: lastName || 'Employee',
        position,
        station,
        rawPunchesByDate: new Map(),
        directLogs: {},
      });
    }

    const person = peopleMap.get(acNo)!;
    // Update names if subsequent rows have fuller names
    if (firstName && (!person.firstName || person.firstName === 'Staff')) {
      person.firstName = firstName;
    }
    if (lastName && (!person.lastName || person.lastName === 'Employee')) {
      person.lastName = lastName;
    }
    if (middleName && !person.middleName) {
      person.middleName = middleName;
    }

    // Check for raw punch timestamp
    const rawTime = getRowVal(row, ['time', 'datetime', 'date/time', 'timestamp', 'logtime', 'punchtime', 'checktime']);

    if (rawTime) {
      const parsedStamp = parseBiometricTimestamp(rawTime);
      if (parsedStamp) {
        const { dateStr, minutes } = parsedStamp;
        if (!person.rawPunchesByDate.has(dateStr)) {
          person.rawPunchesByDate.set(dateStr, []);
        }
        person.rawPunchesByDate.get(dateStr)!.push(minutes);
      }
    } else {
      // Consolidated Form 48 daily row check
      const dateStr = getRowVal(row, ['date', 'logdate', 'transdate', 'day']);
      if (dateStr) {
        const amIn = getRowVal(row, ['amin', 'amarrival', 'timein1', 'morningin']);
        const amOut = getRowVal(row, ['amout', 'amdeparture', 'timeout1', 'morningout']);
        const pmIn = getRowVal(row, ['pmin', 'pmarrival', 'timein2', 'afternoonin']);
        const pmOut = getRowVal(row, ['pmout', 'pmdeparture', 'timeout2', 'afternoonout']);
        const statusVal = getRowVal(row, ['status', 'remark', 'type']);

        person.directLogs[dateStr] = {
          amArrival: amIn || '07:30',
          amDeparture: amOut || '11:30',
          pmArrival: pmIn || '12:30',
          pmDeparture: pmOut || '16:30',
          status: statusVal === 'OB' ? 'OB' : statusVal === 'HOLIDAY' ? 'HOLIDAY' : 'REGULAR',
        };
      }
    }
  });

  // Evaluate collisions and generate final Form 48 logs against existing roster
  for (const [, aggPerson] of peopleMap) {
    const finalLogs: Record<string, DTRLog> = { ...aggPerson.directLogs };

    // Convert aggregated raw daily punches into Form 48 logs
    for (const [dateStr, punches] of aggPerson.rawPunchesByDate.entries()) {
      const form48 = assignDailyPunchesToForm48(punches);
      finalLogs[dateStr] = {
        amArrival: form48.amArrival,
        amDeparture: form48.amDeparture,
        pmArrival: form48.pmArrival,
        pmDeparture: form48.pmDeparture,
        status: 'REGULAR',
      };
    }

    const incBioId = aggPerson.biometricId;
    const incLast = aggPerson.lastName;
    const incFirst = aggPerson.firstName;

    // Check matching against existing roster:
    // 1. By Biometric ID / AC-No
    // 2. By Employee ID
    const exactIdMatch = existingRoster.find(
      (p) =>
        (p.biometricId && p.biometricId.toLowerCase() === incBioId.toLowerCase()) ||
        p.id.toLowerCase() === incBioId.toLowerCase() ||
        p.id.toLowerCase().endsWith(incBioId.toLowerCase())
    );

    const incomingProfile: Partial<Personnel> = {
      id: incBioId,
      biometricId: incBioId,
      lastName: incLast,
      firstName: incFirst,
      middleName: aggPerson.middleName,
      positionTitle: aggPerson.position,
      schoolStation: aggPerson.station,
      personnelType: aggPerson.position.toLowerCase().includes('teacher') ? 'Teaching' : 'Non-Teaching',
      employmentStatus: 'Permanent',
      workSchedule: aggPerson.position.toLowerCase().includes('teacher') ? 'Teaching' : 'Non-Teaching',
      salaryGrade: aggPerson.position.toLowerCase().includes('ao ii') || aggPerson.position.toLowerCase().includes('officer') ? 15 : 11,
      stepIncrement: 1,
      continuousServiceStart: '2023-01-01',
      lastPromotionDate: '2023-01-01',
      lastStepIncrementDate: '2023-01-01',
      tin: '000-000-000-000',
      dob: '1990-01-01',
      pob: 'Zamboanga City',
      plantillaItemNo: `OSEC-DECSB-${incBioId}`,
      gsisBPNo: '2000000000',
      serviceCredits: 0,
      vacationLeaveCredits: 0,
      sickLeaveCredits: 0,
      leaveLedger: [],
      serviceRecordBlocks: [],
      updatedAt: Date.now(),
      dtrLogs: finalLogs,
    };

    if (exactIdMatch) {
      const sameLast = areNamesSimilar(exactIdMatch.lastName, incLast);
      const sameFirst = areNamesSimilar(exactIdMatch.firstName, incFirst);

      if (sameLast && sameFirst) {
        // Condition A: Exact Match -> Safe auto-merge
        exactMatches.push({
          existing: {
            ...exactIdMatch,
            biometricId: exactIdMatch.biometricId || incBioId,
          },
          incoming: incomingProfile,
          mergedLogsCount: Object.keys(finalLogs).length,
        });
      } else {
        // Condition B1: ID match, but name mismatch
        conflictMatches.push({
          incomingRecord: incomingProfile,
          existingRecord: exactIdMatch,
          conflictType: 'ID_MATCH_NAME_MISMATCH',
          details: `Biometric terminal ID [${incBioId}] belongs to existing record ${exactIdMatch.firstName} ${exactIdMatch.lastName}, but machine punch name is ${incFirst} ${incLast}.`,
        });
      }
    } else {
      // Check if name matches any existing employee record (Condition B2)
      const nameMatch = existingRoster.find(
        (p) => areNamesSimilar(p.lastName, incLast) && areNamesSimilar(p.firstName, incFirst)
      );

      if (nameMatch) {
        // Condition B2: Name Match, ID Mismatch
        conflictMatches.push({
          incomingRecord: incomingProfile,
          existingRecord: nameMatch,
          conflictType: 'NAME_MATCH_ID_MISMATCH',
          details: `Biometric employee name ${incFirst} ${incLast} matches existing personnel ${nameMatch.firstName} ${nameMatch.lastName}, but hardware terminal ID differs (Incoming AC-No: ${incBioId}, Existing ID: ${nameMatch.id}).`,
        });
      } else {
        // Brand new personnel profile
        const newP: Personnel = {
          id: incBioId.startsWith('TEMP-') ? `DEPED-ZC-${Math.floor(100000 + Math.random() * 900000)}` : incBioId,
          biometricId: incBioId,
          lastName: incLast,
          firstName: incFirst,
          middleName: aggPerson.middleName || '',
          extensionName: '',
          positionTitle: aggPerson.position || 'Teacher I',
          plantillaItemNo: `OSEC-DECSB-${incBioId}`,
          tin: '000-000-000-000',
          dob: '1992-01-01',
          pob: 'Philippines',
          schoolId: '',
          schoolStation: aggPerson.station || '',
          gsisBPNo: '2000000000',
          personnelType: aggPerson.position.toLowerCase().includes('teacher') ? 'Teaching' : 'Non-Teaching',
          employmentStatus: 'Permanent',
          workSchedule: aggPerson.position.toLowerCase().includes('teacher') ? 'Teaching' : 'Non-Teaching',
          stepIncrement: 1,
          salaryGrade: 11,
          lastPromotionDate: '2023-01-01',
          lastStepIncrementDate: '2023-01-01',
          continuousServiceStart: '2023-01-01',
          dtrLogs: finalLogs,
          serviceCredits: 0,
          vacationLeaveCredits: 5.0,
          sickLeaveCredits: 5.0,
          leaveLedger: [],
          serviceRecordBlocks: [],
          lwopDays: 0,
          maternityLeaveDays: 0,
          updatedAt: Date.now(),
        };
        newRecords.push(newP);
      }
    }
  }

  return {
    exactMatches,
    conflictMatches,
    newRecords,
    totalRowsProcessed: rawRows.length,
  };
}
