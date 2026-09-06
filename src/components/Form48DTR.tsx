import React, { useState, useMemo } from 'react';
import {
  Printer,
  Download,
  Calendar,
  User,
  Clock,
  Layers,
  Edit3,
  CheckCircle2,
  FileSpreadsheet,
  FileDown,
  LayoutList,
  FileText,
  Smartphone,
  ChevronRight,
} from 'lucide-react';
import {
  calculateDTRMonth,
  formatMinutesToHM,
  DayCalculation,
} from '../utils/dtrEngine';
import {
  generateSingleForm48PDF,
  generateBatchForm48PDF,
} from '../utils/pdfExport';
import { addAuditLog } from '../db/dexie';
import {
  DTRDayStatus,
  DTRLog,
  DTRPrintMode,
  Personnel,
  PrintPaperSize,
  SchoolProfile,
  UserSession,
} from '../types';

interface Form48DTRProps {
  personnelList: Personnel[];
  currentUser: UserSession;
  paperSize: PrintPaperSize;
  onUpdatePersonnel: (updated: Personnel) => Promise<void>;
  schoolProfile?: SchoolProfile;
}

export const Form48DTR: React.FC<Form48DTRProps> = ({
  personnelList,
  currentUser,
  paperSize,
  onUpdatePersonnel,
  schoolProfile,
}) => {
  const [selectedPersonnelId, setSelectedPersonnelId] = useState<string>(
    personnelList[0]?.id || ''
  );
  const [selectedYear, setSelectedYear] = useState<number>(2026);
  const [selectedMonth, setSelectedMonth] = useState<number>(8); // September (0-indexed 8)
  const [printMode, setPrintMode] = useState<DTRPrintMode>('2-Up');
  const [viewMode, setViewMode] = useState<'CARD' | 'LIST'>('CARD');

  // Inline day editor modal
  const [editingDay, setEditingDay] = useState<DayCalculation | null>(null);
  const [overrideAmArrival, setOverrideAmArrival] = useState('');
  const [overrideAmDeparture, setOverrideAmDeparture] = useState('');
  const [overridePmArrival, setOverridePmArrival] = useState('');
  const [overridePmDeparture, setOverridePmDeparture] = useState('');
  const [overrideStatus, setOverrideStatus] = useState<DTRDayStatus>('REGULAR');
  const [overrideNote, setOverrideNote] = useState('');
  const [isSavingDay, setIsSavingDay] = useState(false);

  // Batch PDF Progress
  const [isBatchExporting, setIsBatchExporting] = useState(false);
  const [batchProgress, setBatchProgress] = useState({ current: 0, total: 0 });

  const activePersonnel = useMemo(() => {
    return (
      personnelList.find((p) => p.id === selectedPersonnelId) ||
      personnelList[0] ||
      null
    );
  }, [personnelList, selectedPersonnelId]);

  const dtrSummary = useMemo(() => {
    if (!activePersonnel) return null;
    return calculateDTRMonth(activePersonnel, selectedYear, selectedMonth);
  }, [activePersonnel, selectedYear, selectedMonth]);

  const handleOpenDayEditor = (day: DayCalculation) => {
    // DeptHead and Staff can also view/edit if authorized
    setEditingDay(day);
    setOverrideAmArrival(day.log?.amArrival || (day.isWeekend ? '' : '07:30'));
    setOverrideAmDeparture(day.log?.amDeparture || (day.isWeekend ? '' : '11:30'));
    setOverridePmArrival(day.log?.pmArrival || (day.isWeekend ? '' : '12:30'));
    setOverridePmDeparture(day.log?.pmDeparture || (day.isWeekend ? '' : '16:30'));
    setOverrideStatus(day.status);
    setOverrideNote(day.note || '');
  };

  const handleSaveDayOverride = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activePersonnel || !editingDay) return;

    setIsSavingDay(true);
    try {
      const updatedLogs: Record<string, DTRLog> = {
        ...(activePersonnel.dtrLogs || {}),
      };

      updatedLogs[editingDay.dateStr] = {
        amArrival: overrideAmArrival.trim(),
        amDeparture: overrideAmDeparture.trim(),
        pmArrival: overridePmArrival.trim(),
        pmDeparture: overridePmDeparture.trim(),
        status: overrideStatus,
        note: overrideNote.trim(),
      };

      const updatedPersonnel: Personnel = {
        ...activePersonnel,
        dtrLogs: updatedLogs,
        updatedAt: Date.now(),
      };

      await onUpdatePersonnel(updatedPersonnel);

      await addAuditLog(
        currentUser.username,
        currentUser.role,
        'DTR_EDIT',
        'UPDATE_TIME_LOG',
        `Modified Form 48 record for ${activePersonnel.lastName} on ${editingDay.dateStr} [Status: ${overrideStatus}]`
      );

      setEditingDay(null);
    } catch (err) {
      console.error('Failed to update DTR record:', err);
    } finally {
      setIsSavingDay(false);
    }
  };

  const handleExportSinglePDF = async () => {
    if (!activePersonnel) return;
    try {
      const blob = await generateSingleForm48PDF(
        activePersonnel,
        selectedYear,
        selectedMonth,
        schoolProfile
      );
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `CSC_Form_48_${activePersonnel.lastName}_${selectedYear}_${selectedMonth + 1}.pdf`;
      a.click();
      URL.revokeObjectURL(url);

      await addAuditLog(
        currentUser.username,
        currentUser.role,
        'PDF_EXPORT',
        'FORM48_SINGLE_PDF',
        `Generated Form 48 PDF for ${activePersonnel.lastName} (${dtrSummary?.monthName} ${selectedYear})`
      );
    } catch (err) {
      console.error('Error generating PDF:', err);
    }
  };

  const handleExportBatchPDF = async () => {
    if (personnelList.length === 0) return;
    setIsBatchExporting(true);
    setBatchProgress({ current: 0, total: personnelList.length });

    try {
      const blob = await generateBatchForm48PDF(
        personnelList,
        selectedYear,
        selectedMonth,
        (current, total) => {
          setBatchProgress({ current, total });
        },
        schoolProfile
      );

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `CSC_Form_48_BATCH_Zamboanga_${selectedYear}_${selectedMonth + 1}.pdf`;
      a.click();
      URL.revokeObjectURL(url);

      await addAuditLog(
        currentUser.username,
        currentUser.role,
        'PDF_EXPORT',
        'FORM48_BATCH_PDF',
        `Generated batch Form 48 PDF for all ${personnelList.length} personnel for ${dtrSummary?.monthName} ${selectedYear}.`
      );
    } catch (err) {
      console.error('Failed batch export:', err);
    } finally {
      setIsBatchExporting(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  if (!activePersonnel || !dtrSummary) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-12 text-center max-w-xl mx-auto my-8 shadow-sm space-y-3">
        <Clock className="w-10 h-10 text-slate-300 mx-auto" />
        <h3 className="text-base font-bold text-slate-800">No Personnel Records in Database</h3>
        <p className="text-xs text-slate-500 leading-relaxed">
          The local database is currently empty. To generate CSC Form 48 Daily Time Records, please add personnel in the <strong>Personnel Manager (PIMS)</strong> or upload an attendance log file via the <strong>Biometrics Uploader</strong>.
        </p>
      </div>
    );
  }

  const totalLateMin = dtrSummary.totalTardinessMinutes + dtrSummary.totalUndertimeMinutes;
  const totalLateHM = formatMinutesToHM(totalLateMin);

  // Reusable sub-component rendering the exact Form 48 card (3.5" x 8.5")
  const renderDTRCard = (isCopy = false) => {
    const fullName = `${activePersonnel.lastName.toUpperCase()}, ${activePersonnel.firstName} ${activePersonnel.middleName ? activePersonnel.middleName[0] + '.' : ''} ${activePersonnel.extensionName || ''}`.trim();
    const schedText =
      activePersonnel.personnelType === 'Teaching'
        ? '7:30 - 11:30 AM / 12:30 - 4:30 PM'
        : '8:00 - 12:00 NN / 1:00 - 5:00 PM';

    return (
      <div
        className="form48-card bg-white border border-slate-900 shadow-md p-3 text-slate-900 select-none flex flex-col justify-between"
        style={{
          width: '3.5in',
          height: '8.5in',
          boxSizing: 'border-box',
          fontSize: '8px',
          lineHeight: '1.2',
        }}
      >
        {/* Top Header */}
        <div className="text-center">
          <p className="text-[7.5px] italic text-slate-700">Civil Service Form No. 48</p>
          <h2 className="text-[11px] font-bold tracking-tight uppercase font-serif mt-0.5">
            DAILY TIME RECORD
          </h2>
          <p className="text-[6.5px] tracking-widest text-slate-500 mt-0.5">-----o0o-----</p>

          <div className="mt-2 border-b border-slate-900 pb-0.5">
            <p className="text-[9.5px] font-bold uppercase tracking-wider">{fullName}</p>
          </div>
          <p className="text-[7px] italic text-slate-600 mt-0.5">(Name in Print)</p>

          <div className="flex justify-between items-center text-[7px] mt-2 px-1">
            <span>
              For the month of: <strong>{dtrSummary.monthName} {selectedYear}</strong>
            </span>
          </div>
          <p className="text-[6.5px] text-left px-1 text-slate-700 mt-0.5">
            Official hours for arrival/departure: <strong>{schedText}</strong>
          </p>
        </div>

        {/* Day-by-Day Table */}
        <div className="mt-1 flex-1">
          <table className="w-full border-collapse border border-slate-900 text-center text-[6.5px]">
            <thead>
              <tr className="bg-slate-100 font-bold">
                <th rowSpan={2} className="border border-slate-900 w-5 py-0.5">Day</th>
                <th colSpan={2} className="border border-slate-900 py-0.5">A.M.</th>
                <th colSpan={2} className="border border-slate-900 py-0.5">P.M.</th>
                <th colSpan={2} className="border border-slate-900 py-0.5">Undertime / Late</th>
              </tr>
              <tr className="bg-slate-50 text-[6px] font-semibold">
                <th className="border border-slate-900 w-9">Arrival</th>
                <th className="border border-slate-900 w-9">Departure</th>
                <th className="border border-slate-900 w-9">Arrival</th>
                <th className="border border-slate-900 w-9">Departure</th>
                <th className="border border-slate-900 w-6">Hours</th>
                <th className="border border-slate-900 w-6">Min</th>
              </tr>
            </thead>
            <tbody>
              {dtrSummary.days.map((day) => {
                const dayLate = day.tardinessMinutes + day.undertimeMinutes;
                const lateHM = formatMinutesToHM(dayLate);
                const isSpecial = day.status !== 'REGULAR';

                return (
                  <tr
                    key={day.dayNumber}
                    onClick={() => !isCopy && handleOpenDayEditor(day)}
                    className={`h-[15.5px] transition-colors ${
                      !isCopy ? 'hover:bg-amber-100/60 cursor-pointer' : ''
                    } ${day.isWeekend ? 'bg-slate-50/70' : ''}`}
                    title={
                      !isCopy
                        ? `Day ${day.dayNumber} (${day.dayOfWeek}) - Click to edit times or status`
                        : ''
                    }
                  >
                    <td className="border border-slate-900 font-bold">{day.dayNumber}</td>
                    {isSpecial ? (
                      <td
                        colSpan={6}
                        className="border border-slate-900 italic font-semibold text-[6.5px] text-slate-700 px-1 text-center bg-slate-100/60 tracking-wider"
                      >
                        {day.statusLabel} {day.note ? `— ${day.note}` : ''}
                      </td>
                    ) : (
                      <>
                        <td className="border border-slate-900 font-mono text-[7px]">
                          {day.log?.amArrival || ''}
                        </td>
                        <td className="border border-slate-900 font-mono text-[7px]">
                          {day.log?.amDeparture || ''}
                        </td>
                        <td className="border border-slate-900 font-mono text-[7px]">
                          {day.log?.pmArrival || ''}
                        </td>
                        <td className="border border-slate-900 font-mono text-[7px]">
                          {day.log?.pmDeparture || ''}
                        </td>
                        <td className="border border-slate-900 font-mono font-bold">
                          {lateHM.hours > 0 ? lateHM.hours : ''}
                        </td>
                        <td className="border border-slate-900 font-mono font-bold">
                          {dayLate > 0 ? lateHM.minutes : ''}
                        </td>
                      </>
                    )}
                  </tr>
                );
              })}

              {/* Total Summary Row */}
              <tr className="bg-slate-200 font-bold text-[7px]">
                <td colSpan={5} className="border border-slate-900 text-right pr-2 py-0.5">
                  TOTAL
                </td>
                <td className="border border-slate-900 font-mono">
                  {totalLateHM.hours > 0 ? totalLateHM.hours : '0'}
                </td>
                <td className="border border-slate-900 font-mono">{totalLateHM.minutes}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Verification Certification Footer */}
        <div className="mt-1 pt-1 border-t border-slate-900 text-[6.5px] leading-tight">
          <p className="italic text-justify">
            I certify on my honor that the above is a true and correct report of the hours of
            work performed, record of which was made daily at the time of arrival and
            departure from office.
          </p>

          <div className="mt-3 text-center">
            <div className="w-3/4 mx-auto border-b border-slate-900" />
            <p className="text-[6.5px] mt-0.5 italic">Signature of Employee</p>
          </div>

          <p className="mt-1 text-[6.5px]">Verified as to the prescribed office hours:</p>

          <div className="mt-3 text-center">
            <div className="w-3/4 mx-auto border-b border-slate-900" />
            <p className="text-[7px] font-bold uppercase mt-0.5">
              {schoolProfile?.schoolHeadName || 'School Head / Principal'}
            </p>
            <p className="text-[5.5px] text-slate-600">
              {schoolProfile?.schoolHeadPosition || 'In-Charge'}
              {schoolProfile?.schoolName ? ` • ${schoolProfile.schoolName}` : ''}
            </p>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Control Toolbar (Hidden in Print) */}
      <div className="no-print bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          {/* Employee & Date Selectors */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Personnel Selector */}
            <div className="flex items-center gap-2">
              <User className="w-4 h-4 text-slate-500" />
              <label htmlFor="select-personnel-f48" className="text-xs font-semibold text-slate-700">Personnel:</label>
              <select
                id="select-personnel-f48"
                aria-label="Select Personnel for Form 48"
                value={selectedPersonnelId}
                onChange={(e) => setSelectedPersonnelId(e.target.value)}
                className="bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 font-medium focus:ring-1 focus:ring-blue-600 focus:outline-none"
              >
                {personnelList.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.lastName}, {p.firstName} {p.biometricId ? `[AC #${p.biometricId}]` : ''} ({p.positionTitle}) - {p.schoolStation}
                  </option>
                ))}
              </select>
            </div>

            {/* Month Selector */}
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-slate-500" />
              <label htmlFor="select-month-f48" className="text-xs font-semibold text-slate-700">Month:</label>
              <select
                id="select-month-f48"
                aria-label="Select Month for Form 48"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(Number(e.target.value))}
                className="bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 font-medium focus:ring-1 focus:ring-blue-600 focus:outline-none"
              >
                {[
                  'January', 'February', 'March', 'April', 'May', 'June',
                  'July', 'August', 'September', 'October', 'November', 'December'
                ].map((name, idx) => (
                  <option key={name} value={idx}>
                    {name}
                  </option>
                ))}
              </select>
            </div>

            {/* Year Selector */}
            <div className="flex items-center gap-2">
              <label htmlFor="select-year-f48" className="text-xs font-semibold text-slate-700">Year:</label>
              <select
                id="select-year-f48"
                aria-label="Select Year for Form 48"
                value={selectedYear}
                onChange={(e) => setSelectedYear(Number(e.target.value))}
                className="bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 font-medium focus:ring-1 focus:ring-blue-600 focus:outline-none"
              >
                {[2024, 2025, 2026, 2027].map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Action Buttons: 1-Up/2-Up, Print, Single PDF, Batch PDF, and View Switcher */}
          <div className="flex flex-wrap items-center gap-2">
            {/* View Mode Switcher: Cardstock vs Mobile Daily List */}
            <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-300 text-xs">
              <button
                type="button"
                onClick={() => setViewMode('CARD')}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md transition ${
                  viewMode === 'CARD'
                    ? 'bg-white text-blue-900 font-bold shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
                title="View official CSC Form 48 Cardstock"
              >
                <FileText className="w-3 h-3 text-blue-700" />
                <span>Cardstock Grid</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('LIST')}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md transition ${
                  viewMode === 'LIST'
                    ? 'bg-white text-blue-900 font-bold shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
                title="View mobile-friendly daily log cards"
              >
                <Smartphone className="w-3 h-3 text-amber-600" />
                <span>Mobile Cards</span>
              </button>
            </div>

            {/* Print Mode Switcher (visible in CARD view) */}
            {viewMode === 'CARD' && (
              <div className="hidden sm:flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-300 text-xs">
                <button
                  onClick={() => setPrintMode('1-Up')}
                  className={`px-2.5 py-1 rounded-md transition ${
                    printMode === '1-Up'
                      ? 'bg-white text-blue-900 font-bold shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  1-Up
                </button>
                <button
                  onClick={() => setPrintMode('2-Up')}
                  className={`px-2.5 py-1 rounded-md transition ${
                    printMode === '2-Up'
                      ? 'bg-white text-blue-900 font-bold shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  2-Up
                </button>
              </div>
            )}

            {/* Export Single PDF */}
            <button
              onClick={handleExportSinglePDF}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs font-medium transition shadow-sm"
              title="Download 3.5x8.5 Official Form 48 PDF for selected employee"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export PDF</span>
            </button>

            {/* Export Batch PDF */}
            <button
              onClick={handleExportBatchPDF}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-900 hover:bg-blue-800 text-white rounded-lg text-xs font-medium transition shadow-sm"
              title="Generate Form 48 for all school personnel in one consolidated PDF document"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-amber-300" />
              <span className="hidden sm:inline">Batch All ({personnelList.length})</span>
              <span className="sm:hidden">Batch</span>
            </button>

            {/* Print Directly */}
            <button
              onClick={handlePrint}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-lg text-xs transition shadow-sm"
              title="Print directly to connected physical printer or save as PDF"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print</span>
            </button>
          </div>
        </div>

        {/* Quick Stats Summary Bar */}
        <div className="mt-3 pt-3 border-t border-slate-100 flex flex-wrap items-center gap-3 sm:gap-4 text-xs text-slate-600">
          <div className="flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-blue-600 shrink-0" />
            <span className="truncate">
              Sched: <strong>{activePersonnel.workSchedule}</strong>
            </span>
          </div>
          <span className="text-slate-300">&bull;</span>
          <div>
            Hours: <strong className="text-slate-900">{dtrSummary.totalHoursRendered} hrs</strong>
          </div>
          <span className="text-slate-300">&bull;</span>
          <div>
            Tardiness / Undertime:{' '}
            <strong className={totalLateMin > 0 ? 'text-amber-700 font-bold' : 'text-emerald-700 font-semibold'}>
              {totalLateHM.display}
            </strong>
          </div>
          <span className="text-slate-300">&bull;</span>
          <span className="text-[11px] text-slate-500 italic">
            Tap or click any row/card to edit timestamps.
          </span>
        </div>
      </div>

      {/* Swipe prompt on small screens when viewing official table */}
      {viewMode === 'CARD' && (
        <div className="no-print sm:hidden flex items-center justify-between bg-blue-50 border border-blue-200 text-blue-900 text-[11px] px-3 py-2 rounded-lg">
          <span>👉 Swipe horizontally to browse full 31-day Form 48 card</span>
          <button
            onClick={() => setViewMode('LIST')}
            className="font-bold underline text-blue-700 ml-2 shrink-0"
          >
            Switch to Mobile Cards
          </button>
        </div>
      )}

      {/* Responsive Card-Based Layout List (Mobile Friendly View) */}
      {viewMode === 'LIST' && (
        <div className="no-print space-y-2.5">
          <div className="flex items-center justify-between pb-1">
            <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wide">
              31-Day DTR Daily Record Breakdown
            </h3>
            <button
              onClick={() => setViewMode('CARD')}
              className="text-xs text-blue-700 hover:text-blue-900 font-medium flex items-center gap-1"
            >
              <span>View Official Cardstock</span>
              <ChevronRight className="w-3 h-3" />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {dtrSummary.days.map((day) => {
              const dayLate = day.tardinessMinutes + day.undertimeMinutes;
              const lateHM = formatMinutesToHM(dayLate);
              const isSpecial = day.status !== 'REGULAR';

              return (
                <div
                  key={day.dayNumber}
                  onClick={() => handleOpenDayEditor(day)}
                  className={`p-3 rounded-xl border transition-all cursor-pointer shadow-xs ${
                    day.isWeekend
                      ? 'bg-slate-50/80 border-slate-200 text-slate-500'
                      : isSpecial
                      ? 'bg-amber-50/60 border-amber-200 text-slate-800'
                      : 'bg-white border-slate-200 hover:border-blue-400 hover:shadow-sm text-slate-800'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className={`w-7 h-7 rounded-lg flex items-center justify-center font-bold text-xs ${
                        day.isWeekend
                          ? 'bg-slate-200 text-slate-700'
                          : 'bg-blue-900 text-white'
                      }`}>
                        {day.dayNumber}
                      </span>
                      <div>
                        <div className="font-bold text-xs text-slate-900">{day.dayOfWeek}</div>
                        <div className="text-[10px] text-slate-500">{day.dateStr}</div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${
                        day.status === 'REGULAR'
                          ? 'bg-emerald-100 text-emerald-800'
                          : day.status === 'WEEKEND'
                          ? 'bg-slate-200 text-slate-600'
                          : 'bg-amber-100 text-amber-800'
                      }`}>
                        {day.statusLabel}
                      </span>
                      <Edit3 className="w-3.5 h-3.5 text-slate-400 hover:text-blue-600" />
                    </div>
                  </div>

                  {isSpecial ? (
                    <div className="text-xs italic bg-slate-100/70 p-2 rounded-lg text-slate-600 text-center font-medium">
                      {day.statusLabel} {day.note ? `— ${day.note}` : ''}
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-2 text-[11px] bg-slate-50 p-2 rounded-lg border border-slate-100 font-mono">
                      <div>
                        <span className="text-[10px] text-slate-400 block font-sans uppercase">A.M. In &bull; Out</span>
                        <span className="text-slate-900 font-semibold">
                          {day.log?.amArrival || '—'} &bull; {day.log?.amDeparture || '—'}
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 block font-sans uppercase">P.M. In &bull; Out</span>
                        <span className="text-slate-900 font-semibold">
                          {day.log?.pmArrival || '—'} &bull; {day.log?.pmDeparture || '—'}
                        </span>
                      </div>
                    </div>
                  )}

                  {dayLate > 0 && (
                    <div className="mt-2 text-[10px] font-bold text-amber-700 bg-amber-50 px-2 py-1 rounded border border-amber-200 flex items-center justify-between">
                      <span>Tardiness / Undertime:</span>
                      <span>{lateHM.hours > 0 ? `${lateHM.hours}h ` : ''}{lateHM.minutes}m</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Printable Area / Canvas (Always rendered for print, swipeable on screen) */}
      <div className={`printable-area w-full overflow-x-auto py-3 px-1 sm:px-4 bg-slate-100/70 border border-slate-200 rounded-xl ${
        viewMode === 'LIST' ? 'hidden print:block' : 'block'
      }`}>
        <div className="min-w-max mx-auto flex justify-center py-2">
          {printMode === '1-Up' ? (
            <div className="flex justify-center w-full">
              {renderDTRCard(false)}
            </div>
          ) : (
            /* 2-Up Side-by-Side with 0.25" Cutting Guideline */
            <div className="flex items-center gap-0 justify-center">
              {/* Left Card */}
              <div>{renderDTRCard(false)}</div>

              {/* 0.25" Cutting Guideline */}
              <div
                className="flex flex-col items-center justify-between"
                style={{ width: '0.25in', height: '8.5in' }}
              >
                <div className="h-full border-r border-dashed border-slate-400 w-1/2 relative">
                  <span
                    className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 -rotate-90 text-[7px] text-slate-400 uppercase tracking-widest whitespace-nowrap bg-white px-1 select-none"
                  >
                    ✂ 0.25" CUTTING GUIDELINE
                  </span>
                </div>
              </div>

              {/* Right Card (Exact Copy for Duplicate Submission) */}
              <div>{renderDTRCard(true)}</div>
            </div>
          )}
        </div>
      </div>

      {/* Inline Day Override Modal */}
      {editingDay && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 no-print">
          <div className="w-full max-w-md bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden text-slate-900">
            <div className="bg-slate-900 text-white p-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Edit3 className="w-4 h-4 text-amber-400" />
                <h3 className="text-sm font-bold">
                  Edit Time Record — Day {editingDay.dayNumber} ({editingDay.dayOfWeek}, {editingDay.dateStr})
                </h3>
              </div>
              <button
                onClick={() => setEditingDay(null)}
                className="text-slate-400 hover:text-white font-bold"
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleSaveDayOverride} className="p-5 space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Day Status / Prescribed Attendance
                </label>
                <select
                  value={overrideStatus}
                  onChange={(e) => setOverrideStatus(e.target.value as DTRDayStatus)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-900 focus:ring-1 focus:ring-blue-600 focus:outline-none"
                >
                  <option value="REGULAR">REGULAR (Regular In/Out)</option>
                  <option value="CLASS_SUSPENDED_FULL">CLASS SUSPENDED (Full Day)</option>
                  <option value="CLASS_SUSPENDED_AM">CLASS SUSPENDED (AM Only)</option>
                  <option value="CLASS_SUSPENDED_PM">CLASS SUSPENDED (PM Only)</option>
                  <option value="HOLIDAY">HOLIDAY (Official Non-Working)</option>
                  <option value="OB">OFFICIAL BUSINESS (OB / Travel Order)</option>
                  <option value="LEAVE">ON LEAVE (Civil Service Form 6)</option>
                  <option value="SATURDAY">SATURDAY</option>
                  <option value="SUNDAY">SUNDAY</option>
                </select>
              </div>

              {overrideStatus === 'REGULAR' && (
                <div className="grid grid-cols-2 gap-3 bg-slate-50 p-3 rounded-lg border border-slate-200">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-0.5">
                      AM Arrival (HH:MM)
                    </label>
                    <input
                      type="text"
                      placeholder="07:30"
                      value={overrideAmArrival}
                      onChange={(e) => setOverrideAmArrival(e.target.value)}
                      className="w-full bg-white border border-slate-300 rounded px-2.5 py-1.5 font-mono text-xs focus:outline-none focus:border-blue-600"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-0.5">
                      AM Departure (HH:MM)
                    </label>
                    <input
                      type="text"
                      placeholder="11:30"
                      value={overrideAmDeparture}
                      onChange={(e) => setOverrideAmDeparture(e.target.value)}
                      className="w-full bg-white border border-slate-300 rounded px-2.5 py-1.5 font-mono text-xs focus:outline-none focus:border-blue-600"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-0.5">
                      PM Arrival (HH:MM)
                    </label>
                    <input
                      type="text"
                      placeholder="12:30"
                      value={overridePmArrival}
                      onChange={(e) => setOverridePmArrival(e.target.value)}
                      className="w-full bg-white border border-slate-300 rounded px-2.5 py-1.5 font-mono text-xs focus:outline-none focus:border-blue-600"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-0.5">
                      PM Departure (HH:MM)
                    </label>
                    <input
                      type="text"
                      placeholder="16:30"
                      value={overridePmDeparture}
                      onChange={(e) => setOverridePmDeparture(e.target.value)}
                      className="w-full bg-white border border-slate-300 rounded px-2.5 py-1.5 font-mono text-xs focus:outline-none focus:border-blue-600"
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Administrative Note / Memorandum Attachment
                </label>
                <input
                  type="text"
                  placeholder="e.g. Typhoon Warning Signal No. 2 Suspension / Travel Order No. 45"
                  value={overrideNote}
                  onChange={(e) => setOverrideNote(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-xs focus:ring-1 focus:ring-blue-600 focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditingDay(null)}
                  className="px-3 py-1.5 rounded-lg text-slate-600 hover:bg-slate-100 font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingDay}
                  className="px-4 py-1.5 rounded-lg bg-blue-900 hover:bg-blue-800 text-white font-semibold transition flex items-center gap-1.5"
                >
                  {isSavingDay ? (
                    'Saving...'
                  ) : (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5 text-amber-300" />
                      <span>Save Record</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Batch Export Progress Modal */}
      {isBatchExporting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 no-print">
          <div className="w-full max-w-sm bg-white rounded-xl shadow-2xl p-6 text-center text-slate-900 border border-slate-200">
            <FileDown className="w-10 h-10 text-blue-600 mx-auto animate-bounce mb-3" />
            <h4 className="text-sm font-bold text-slate-900">Generating Batch Form 48</h4>
            <p className="text-xs text-slate-500 mt-1">
              Compiling individual cards into unified consolidated PDF document...
            </p>

            {/* Progress Bar */}
            <div className="w-full bg-slate-100 rounded-full h-2.5 mt-4 overflow-hidden border border-slate-200">
              <div
                className="bg-blue-600 h-2.5 transition-all duration-200 rounded-full"
                style={{
                  width: `${(batchProgress.current / Math.max(1, batchProgress.total)) * 100}%`,
                }}
              />
            </div>

            <p className="text-xs font-mono font-semibold text-slate-700 mt-2">
              {batchProgress.current} / {batchProgress.total} completed
            </p>
          </div>
        </div>
      )}
    </div>
  );
};
