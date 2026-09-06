import { DTRDayStatus, DTRLog, Personnel, WorkSchedule } from '../types';

export interface ShiftSchedule {
  amStart: string; // e.g. "08:00" or "07:30"
  amEnd: string;   // e.g. "12:00" or "11:30"
  pmStart: string; // e.g. "13:00" or "12:30"
  pmEnd: string;   // e.g. "17:00" or "16:30"
}

export const TEACHING_SCHEDULE: ShiftSchedule = {
  amStart: '07:30',
  amEnd: '11:30',
  pmStart: '12:30',
  pmEnd: '16:30',
};

export const NON_TEACHING_SCHEDULE: ShiftSchedule = {
  amStart: '08:00',
  amEnd: '12:00',
  pmStart: '13:00',
  pmEnd: '17:00',
};

export function getScheduleForPersonnel(personnel: Personnel): ShiftSchedule {
  if (personnel.workSchedule === 'Teaching' || personnel.personnelType === 'Teaching') {
    return TEACHING_SCHEDULE;
  }
  return NON_TEACHING_SCHEDULE;
}

export function parseTimeToMinutes(timeStr: string): number | null {
  if (!timeStr || !timeStr.includes(':')) return null;
  const parts = timeStr.trim().split(':');
  if (parts.length < 2) return null;
  const h = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  if (isNaN(h) || isNaN(m)) return null;
  return h * 60 + m;
}

export function formatMinutesToHM(totalMinutes: number): { hours: number; minutes: number; display: string } {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return {
    hours,
    minutes,
    display: `${hours > 0 ? `${hours}h ` : ''}${minutes}m`,
  };
}

export interface DayCalculation {
  dayNumber: number;
  dateStr: string;
  dayOfWeek: string;
  isWeekend: boolean;
  log?: DTRLog;
  tardinessMinutes: number;
  undertimeMinutes: number;
  hoursRendered: number;
  status: DTRDayStatus;
  statusLabel: string;
  note?: string;
}

export interface MonthSummary {
  year: number;
  month: number; // 0-11
  monthName: string;
  daysInMonth: number;
  days: DayCalculation[];
  totalTardinessMinutes: number;
  totalUndertimeMinutes: number;
  totalHoursRendered: number;
  regularDaysPresent: number;
  absentDays: number;
  leavesTaken: number;
  holidays: number;
  officialBusinessCount: number;
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

export function calculateDTRMonth(
  personnel: Personnel,
  year: number,
  month: number // 0-indexed (0 = Jan, 8 = Sep)
): MonthSummary {
  const schedule = getScheduleForPersonnel(personnel);
  const amStartMin = parseTimeToMinutes(schedule.amStart) ?? 480;
  const amEndMin = parseTimeToMinutes(schedule.amEnd) ?? 720;
  const pmStartMin = parseTimeToMinutes(schedule.pmStart) ?? 780;
  const pmEndMin = parseTimeToMinutes(schedule.pmEnd) ?? 1020;

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const days: DayCalculation[] = [];

  let totalTardiness = 0;
  let totalUndertime = 0;
  let totalHours = 0;
  let regularPresent = 0;
  let absentDays = 0;
  let leavesTaken = 0;
  let holidays = 0;
  let obCount = 0;

  for (let d = 1; d <= daysInMonth; d++) {
    const currentDate = new Date(year, month, d);
    const dayOfWeekShort = currentDate.toLocaleDateString('en-US', { weekday: 'short' });
    const isSaturday = currentDate.getDay() === 6;
    const isSunday = currentDate.getDay() === 0;
    const isWeekend = isSaturday || isSunday;

    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const log = personnel.dtrLogs?.[dateStr];

    let status: DTRDayStatus = isSaturday ? 'SATURDAY' : isSunday ? 'SUNDAY' : 'REGULAR';
    if (log && log.status) {
      status = log.status;
    }

    let dayTardy = 0;
    let dayUndertime = 0;
    let dayHours = 0;

    const amArr = log?.amArrival ? parseTimeToMinutes(log.amArrival) : null;
    const amDep = log?.amDeparture ? parseTimeToMinutes(log.amDeparture) : null;
    const pmArr = log?.pmArrival ? parseTimeToMinutes(log.pmArrival) : null;
    const pmDep = log?.pmDeparture ? parseTimeToMinutes(log.pmDeparture) : null;

    if (status === 'REGULAR') {
      if (!isWeekend) {
        if (!amArr && !amDep && !pmArr && !pmDep) {
          // Absent if weekday with no time logs
          absentDays++;
        } else {
          regularPresent++;
        }
      }

      // Tardiness
      if (amArr !== null && amArr > amStartMin) {
        dayTardy += (amArr - amStartMin);
      }
      if (pmArr !== null && pmArr > pmStartMin) {
        dayTardy += (pmArr - pmStartMin);
      }

      // Undertime
      if (amDep !== null && amDep < amEndMin) {
        dayUndertime += (amEndMin - amDep);
      }
      if (pmDep !== null && pmDep < pmEndMin) {
        dayUndertime += (pmEndMin - pmDep);
      }

      // Actual rendered hours calculation
      let amMinutes = 0;
      if (amArr !== null && amDep !== null && amDep > amArr) {
        amMinutes = Math.min(amDep, amEndMin) - Math.max(amArr, amStartMin);
        if (amMinutes < 0) amMinutes = 0;
      }
      let pmMinutes = 0;
      if (pmArr !== null && pmDep !== null && pmDep > pmArr) {
        pmMinutes = Math.min(pmDep, pmEndMin) - Math.max(pmArr, pmStartMin);
        if (pmMinutes < 0) pmMinutes = 0;
      }
      dayHours = (amMinutes + pmMinutes) / 60;
    } else if (status === 'HOLIDAY') {
      holidays++;
      dayHours = 8;
    } else if (status === 'LEAVE') {
      leavesTaken++;
    } else if (status === 'OB') {
      obCount++;
      dayHours = 8;
    } else if (status === 'CLASS_SUSPENDED_FULL') {
      dayHours = 8;
    } else if (status === 'CLASS_SUSPENDED_AM') {
      dayHours = 4;
    } else if (status === 'CLASS_SUSPENDED_PM') {
      dayHours = 4;
    }

    totalTardiness += dayTardy;
    totalUndertime += dayUndertime;
    totalHours += dayHours;

    let statusLabel = '';
    if (status === 'HOLIDAY') statusLabel = 'HOLIDAY';
    else if (status === 'SATURDAY') statusLabel = 'SATURDAY';
    else if (status === 'SUNDAY') statusLabel = 'SUNDAY';
    else if (status === 'CLASS_SUSPENDED_FULL') statusLabel = 'SUSPENDED';
    else if (status === 'CLASS_SUSPENDED_AM') statusLabel = 'SUSPENDED AM';
    else if (status === 'CLASS_SUSPENDED_PM') statusLabel = 'SUSPENDED PM';
    else if (status === 'OB') statusLabel = 'OFFICIAL BUSINESS';
    else if (status === 'LEAVE') statusLabel = 'ON LEAVE';

    days.push({
      dayNumber: d,
      dateStr,
      dayOfWeek: dayOfWeekShort,
      isWeekend,
      log,
      tardinessMinutes: dayTardy,
      undertimeMinutes: dayUndertime,
      hoursRendered: dayHours,
      status,
      statusLabel,
      note: log?.note,
    });
  }

  return {
    year,
    month,
    monthName: MONTH_NAMES[month] || '',
    daysInMonth,
    days,
    totalTardinessMinutes: totalTardiness,
    totalUndertimeMinutes: totalUndertime,
    totalHoursRendered: Math.round(totalHours * 10) / 10,
    regularDaysPresent: regularPresent,
    absentDays,
    leavesTaken,
    holidays,
    officialBusinessCount: obCount,
  };
}
