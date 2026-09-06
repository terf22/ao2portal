import jsPDF from 'jspdf';
import { calculateDTRMonth, formatMinutesToHM } from './dtrEngine';
import { calculateNOSIEligibility } from './nosiEngine';
import { Personnel, SchoolProfile } from '../types';
import { formatPHP } from '../data/ssl2026Tranche';

export async function generateSingleForm48PDF(
  personnel: Personnel,
  year: number,
  month: number,
  schoolProfile?: SchoolProfile
): Promise<Blob> {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'in',
    format: [3.5, 8.5], // Exact 3.5" x 8.5" Civil Service Form 48 dimensions!
  });

  const summary = calculateDTRMonth(personnel, year, month);
  const fullName = `${personnel.lastName.toUpperCase()}, ${personnel.firstName} ${personnel.middleName ? personnel.middleName[0] + '.' : ''} ${personnel.extensionName || ''}`.trim();

  // Header
  doc.setFont('times', 'normal');
  doc.setFontSize(8);
  doc.text('Civil Service Form No. 48', 1.75, 0.35, { align: 'center' });
  doc.setFont('times', 'bold');
  doc.setFontSize(10);
  doc.text('DAILY TIME RECORD', 1.75, 0.52, { align: 'center' });

  doc.setFont('times', 'normal');
  doc.setFontSize(7.5);
  doc.text('-----o0o-----', 1.75, 0.64, { align: 'center' });

  // Employee Name
  doc.setFont('times', 'bold');
  doc.setFontSize(8.5);
  doc.text(fullName, 1.75, 0.85, { align: 'center' });
  doc.setLineWidth(0.01);
  doc.line(0.3, 0.88, 3.2, 0.88);
  doc.setFont('times', 'italic');
  doc.setFontSize(6.5);
  doc.text('(Name in Print)', 1.75, 0.98, { align: 'center' });

  // Month & Official Hours
  doc.setFont('times', 'normal');
  doc.setFontSize(7);
  doc.text(`For the month of: ${summary.monthName} ${year}`, 0.3, 1.15);
  const sched = personnel.personnelType === 'Teaching' ? '7:30-11:30 AM / 12:30-4:30 PM' : '8:00-12:00 NN / 1:00-5:00 PM';
  doc.text(`Official hours for arrival and departure: ${sched}`, 0.3, 1.27);

  // Table setup
  const startY = 1.38;
  const colX = [0.25, 0.55, 0.95, 1.35, 1.75, 2.15, 2.55, 3.25];
  const rowHeight = 0.165;

  // Header row
  doc.setFont('times', 'bold');
  doc.setFontSize(5.5);
  doc.rect(colX[0], startY, colX[7] - colX[0], rowHeight * 2);
  doc.text('Day', colX[0] + 0.15, startY + 0.2, { align: 'center' });
  doc.text('A.M.', colX[1] + 0.4, startY + 0.12, { align: 'center' });
  doc.text('P.M.', colX[3] + 0.4, startY + 0.12, { align: 'center' });
  doc.text('Undertime / Late', colX[5] + 0.35, startY + 0.12, { align: 'center' });

  // Sub headers
  doc.line(colX[1], startY + 0.16, colX[7], startY + 0.16);
  doc.text('Arrival', colX[1] + 0.2, startY + 0.28, { align: 'center' });
  doc.text('Departure', colX[2] + 0.2, startY + 0.28, { align: 'center' });
  doc.text('Arrival', colX[3] + 0.2, startY + 0.28, { align: 'center' });
  doc.text('Departure', colX[4] + 0.2, startY + 0.28, { align: 'center' });
  doc.text('Hours', colX[5] + 0.2, startY + 0.28, { align: 'center' });
  doc.text('Minutes', colX[6] + 0.35, startY + 0.28, { align: 'center' });

  // Render Days 1 to 31
  let currentY = startY + rowHeight * 2;
  doc.setFont('courier', 'normal');
  doc.setFontSize(5.5);

  for (let i = 0; i < 31; i++) {
    const dayData = summary.days[i];
    doc.rect(colX[0], currentY, colX[7] - colX[0], rowHeight);

    const dayNumStr = String(i + 1);
    doc.setFont('times', 'bold');
    doc.text(dayNumStr, colX[0] + 0.15, currentY + 0.12, { align: 'center' });
    doc.setFont('courier', 'normal');

    if (dayData) {
      if (dayData.status !== 'REGULAR') {
        doc.setFont('times', 'italic');
        doc.text(dayData.statusLabel || dayData.status, colX[1] + 0.8, currentY + 0.12);
        doc.setFont('courier', 'normal');
      } else {
        const log = dayData.log;
        doc.text(log?.amArrival || '', colX[1] + 0.05, currentY + 0.12);
        doc.text(log?.amDeparture || '', colX[2] + 0.05, currentY + 0.12);
        doc.text(log?.pmArrival || '', colX[3] + 0.05, currentY + 0.12);
        doc.text(log?.pmDeparture || '', colX[4] + 0.05, currentY + 0.12);

        const tardyMin = dayData.tardinessMinutes + dayData.undertimeMinutes;
        if (tardyMin > 0) {
          const hm = formatMinutesToHM(tardyMin);
          doc.text(hm.hours > 0 ? String(hm.hours) : '', colX[5] + 0.15, currentY + 0.12);
          doc.text(String(hm.minutes), colX[6] + 0.25, currentY + 0.12);
        }
      }
    }

    currentY += rowHeight;
  }

  // TOTAL Row
  doc.setFont('times', 'bold');
  doc.rect(colX[0], currentY, colX[7] - colX[0], rowHeight);
  doc.text('TOTAL', colX[1] + 0.8, currentY + 0.12, { align: 'center' });
  const totalLateMin = summary.totalTardinessMinutes + summary.totalUndertimeMinutes;
  const totalHM = formatMinutesToHM(totalLateMin);
  doc.setFont('courier', 'bold');
  doc.text(totalHM.hours > 0 ? String(totalHM.hours) : '0', colX[5] + 0.15, currentY + 0.12);
  doc.text(String(totalHM.minutes), colX[6] + 0.25, currentY + 0.12);

  // Certification Footer
  currentY += 0.22;
  doc.setFont('times', 'italic');
  doc.setFontSize(5.5);
  const certText =
    'I certify on my honor that the above is a true and correct report of the hours of work performed, record of which was made daily at the time of arrival and departure from office.';
  doc.text(doc.splitTextToSize(certText, 2.9), 0.3, currentY);

  currentY += 0.42;
  doc.setFont('times', 'normal');
  doc.line(0.5, currentY, 3.0, currentY);
  doc.setFontSize(6.5);
  doc.text('Signature of Employee', 1.75, currentY + 0.12, { align: 'center' });

  currentY += 0.25;
  doc.setFontSize(5.5);
  doc.text('Verified as to the prescribed office hours:', 0.3, currentY);

  currentY += 0.35;
  doc.line(0.5, currentY, 3.0, currentY);
  doc.setFont('times', 'bold');
  doc.setFontSize(6.5);
  const headName = schoolProfile?.schoolHeadName || 'School Head / Principal / In-Charge';
  const headPos = schoolProfile?.schoolHeadPosition || 'Principal';
  doc.text(headName, 1.75, currentY + 0.1, { align: 'center' });
  doc.setFont('times', 'normal');
  doc.setFontSize(5);
  doc.text(`${headPos} • ${schoolProfile?.schoolName || 'DepEd Division of Zamboanga City'}`, 1.75, currentY + 0.19, { align: 'center' });

  return doc.output('blob');
}

export async function generateBatchForm48PDF(
  personnelList: Personnel[],
  year: number,
  month: number,
  onProgress?: (completed: number, total: number) => void,
  schoolProfile?: SchoolProfile
): Promise<Blob> {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'in',
    format: [3.5, 8.5],
  });

  const total = personnelList.length;

  for (let idx = 0; idx < total; idx++) {
    if (idx > 0) {
      doc.addPage([3.5, 8.5], 'portrait');
    }

    const p = personnelList[idx];
    const summary = calculateDTRMonth(p, year, month);
    const fullName = `${p.lastName.toUpperCase()}, ${p.firstName} ${p.middleName ? p.middleName[0] + '.' : ''} ${p.extensionName || ''}`.trim();

    doc.setFont('times', 'normal');
    doc.setFontSize(8);
    doc.text('Civil Service Form No. 48', 1.75, 0.35, { align: 'center' });
    doc.setFont('times', 'bold');
    doc.setFontSize(10);
    doc.text('DAILY TIME RECORD', 1.75, 0.52, { align: 'center' });

    doc.setFont('times', 'normal');
    doc.setFontSize(7.5);
    doc.text('-----o0o-----', 1.75, 0.64, { align: 'center' });

    doc.setFont('times', 'bold');
    doc.setFontSize(8.5);
    doc.text(fullName, 1.75, 0.85, { align: 'center' });
    doc.line(0.3, 0.88, 3.2, 0.88);
    doc.setFont('times', 'italic');
    doc.setFontSize(6.5);
    doc.text('(Name in Print)', 1.75, 0.98, { align: 'center' });

    doc.setFont('times', 'normal');
    doc.setFontSize(7);
    doc.text(`For the month of: ${summary.monthName} ${year}`, 0.3, 1.15);
    const sched = p.personnelType === 'Teaching' ? '7:30-11:30 AM / 12:30-4:30 PM' : '8:00-12:00 NN / 1:00-5:00 PM';
    doc.text(`Official hours: ${sched}`, 0.3, 1.27);

    const startY = 1.38;
    const colX = [0.25, 0.55, 0.95, 1.35, 1.75, 2.15, 2.55, 3.25];
    const rowHeight = 0.165;

    doc.setFont('times', 'bold');
    doc.setFontSize(5.5);
    doc.rect(colX[0], startY, colX[7] - colX[0], rowHeight * 2);
    doc.text('Day', colX[0] + 0.15, startY + 0.2, { align: 'center' });
    doc.text('A.M.', colX[1] + 0.4, startY + 0.12, { align: 'center' });
    doc.text('P.M.', colX[3] + 0.4, startY + 0.12, { align: 'center' });
    doc.text('Undertime / Late', colX[5] + 0.35, startY + 0.12, { align: 'center' });

    doc.line(colX[1], startY + 0.16, colX[7], startY + 0.16);
    doc.text('Arr.', colX[1] + 0.2, startY + 0.28, { align: 'center' });
    doc.text('Dep.', colX[2] + 0.2, startY + 0.28, { align: 'center' });
    doc.text('Arr.', colX[3] + 0.2, startY + 0.28, { align: 'center' });
    doc.text('Dep.', colX[4] + 0.2, startY + 0.28, { align: 'center' });
    doc.text('Hrs', colX[5] + 0.2, startY + 0.28, { align: 'center' });
    doc.text('Min', colX[6] + 0.35, startY + 0.28, { align: 'center' });

    let currentY = startY + rowHeight * 2;
    doc.setFont('courier', 'normal');
    doc.setFontSize(5.5);

    for (let i = 0; i < 31; i++) {
      const dayData = summary.days[i];
      doc.rect(colX[0], currentY, colX[7] - colX[0], rowHeight);
      doc.setFont('times', 'bold');
      doc.text(String(i + 1), colX[0] + 0.15, currentY + 0.12, { align: 'center' });
      doc.setFont('courier', 'normal');

      if (dayData) {
        if (dayData.status !== 'REGULAR') {
          doc.setFont('times', 'italic');
          doc.text(dayData.statusLabel || dayData.status, colX[1] + 0.8, currentY + 0.12);
          doc.setFont('courier', 'normal');
        } else {
          const log = dayData.log;
          doc.text(log?.amArrival || '', colX[1] + 0.05, currentY + 0.12);
          doc.text(log?.amDeparture || '', colX[2] + 0.05, currentY + 0.12);
          doc.text(log?.pmArrival || '', colX[3] + 0.05, currentY + 0.12);
          doc.text(log?.pmDeparture || '', colX[4] + 0.05, currentY + 0.12);

          const tardyMin = dayData.tardinessMinutes + dayData.undertimeMinutes;
          if (tardyMin > 0) {
            const hm = formatMinutesToHM(tardyMin);
            doc.text(hm.hours > 0 ? String(hm.hours) : '', colX[5] + 0.15, currentY + 0.12);
            doc.text(String(hm.minutes), colX[6] + 0.25, currentY + 0.12);
          }
        }
      }
      currentY += rowHeight;
    }

    doc.setFont('times', 'bold');
    doc.rect(colX[0], currentY, colX[7] - colX[0], rowHeight);
    doc.text('TOTAL', colX[1] + 0.8, currentY + 0.12, { align: 'center' });
    const totalLateMin = summary.totalTardinessMinutes + summary.totalUndertimeMinutes;
    const totalHM = formatMinutesToHM(totalLateMin);
    doc.setFont('courier', 'bold');
    doc.text(totalHM.hours > 0 ? String(totalHM.hours) : '0', colX[5] + 0.15, currentY + 0.12);
    doc.text(String(totalHM.minutes), colX[6] + 0.25, currentY + 0.12);

    currentY += 0.22;
    doc.setFont('times', 'italic');
    doc.setFontSize(5.5);
    const certText =
      'I certify on my honor that the above is a true and correct report of the hours of work performed, record of which was made daily at the time of arrival and departure from office.';
    doc.text(doc.splitTextToSize(certText, 2.9), 0.3, currentY);

    currentY += 0.42;
    doc.setFont('times', 'normal');
    doc.line(0.5, currentY, 3.0, currentY);
    doc.setFontSize(6.5);
    doc.text('Signature of Employee', 1.75, currentY + 0.12, { align: 'center' });

    currentY += 0.25;
    doc.setFontSize(5.5);
    doc.text('Verified as to the prescribed office hours:', 0.3, currentY);

    currentY += 0.35;
    doc.line(0.5, currentY, 3.0, currentY);
    doc.setFont('times', 'bold');
    doc.setFontSize(6.5);
    const headName = schoolProfile?.schoolHeadName || 'School Head / Principal';
    const headPos = schoolProfile?.schoolHeadPosition || 'Principal';
    doc.text(headName, 1.75, currentY + 0.1, { align: 'center' });
    doc.setFont('times', 'normal');
    doc.setFontSize(5);
    doc.text(`${headPos} • ${schoolProfile?.schoolName || 'DepEd Division of Zamboanga City'}`, 1.75, currentY + 0.19, { align: 'center' });

    if (onProgress) {
      onProgress(idx + 1, total);
    }
  }

  return doc.output('blob');
}

export function generateNOSILetterPDF(personnel: Personnel): Blob {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'in',
    format: 'letter',
  });

  const res = calculateNOSIEligibility(personnel);

  // DepEd Official Republic Header
  doc.setFont('times', 'normal');
  doc.setFontSize(9);
  doc.text('Republic of the Philippines', 4.25, 0.8, { align: 'center' });
  doc.setFont('times', 'bold');
  doc.setFontSize(11);
  doc.text('Department of Education', 4.25, 0.98, { align: 'center' });
  doc.setFont('times', 'normal');
  doc.setFontSize(9);
  doc.text('REGION IX, ZAMBOANGA PENINSULA', 4.25, 1.14, { align: 'center' });
  doc.setFont('times', 'bold');
  doc.setFontSize(10);
  doc.text('SCHOOLS DIVISION OF ZAMBOANGA CITY', 4.25, 1.3, { align: 'center' });

  doc.setLineWidth(0.02);
  doc.line(0.8, 1.45, 7.7, 1.45);

  doc.setFont('times', 'bold');
  doc.setFontSize(13);
  doc.text('NOTICE OF STEP INCREMENT', 4.25, 1.8, { align: 'center' });

  const todayStr = new Date().toLocaleDateString('en-PH', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  doc.setFont('times', 'normal');
  doc.setFontSize(10);
  doc.text(`Date: ${todayStr}`, 0.8, 2.2);

  doc.setFont('times', 'bold');
  doc.text(`TO: ${res.name.toUpperCase()}`, 0.8, 2.5);
  doc.setFont('times', 'normal');
  doc.text(`Position: ${personnel.positionTitle}`, 0.8, 2.7);
  doc.text(`Station: ${personnel.schoolStation}`, 0.8, 2.9);

  // Body text
  const bodyText =
    `Pursuant to the provisions of Joint Circular No. 1, s. 2012 of the Civil Service Commission (CSC) and the Department of Budget and Management (DBM), and CSC-DBM Joint Circular No. 1, s. 2016 implementing Section 34 of the Salary Standardization Law, your salary is hereby adjusted effective ${res.adjustedEligibilityDate}, having completed at least three (3) years of continuous satisfactory service in your present position without any disruptive leaves without pay.`;
  doc.text(doc.splitTextToSize(bodyText, 6.9), 0.8, 3.4);

  // Table of details
  doc.rect(0.8, 4.3, 6.9, 1.6);
  doc.line(0.8, 4.7, 7.7, 4.7);
  doc.line(3.8, 4.3, 3.8, 5.9);

  doc.setFont('times', 'bold');
  doc.text('Item Description', 1.0, 4.55);
  doc.text('Particulars / Rate', 4.0, 4.55);

  doc.setFont('times', 'normal');
  doc.text('1. Plantilla Item Number:', 1.0, 4.95);
  doc.text(personnel.plantillaItemNo, 4.0, 4.95);

  doc.text('2. Actual Salary prior to adjustment:', 1.0, 5.2);
  doc.text(`SG ${res.currentSalaryGrade}, Step ${res.currentStep} (${formatPHP(res.currentSalary)})`, 4.0, 5.2);

  doc.text('3. Adjusted Salary effective date:', 1.0, 5.45);
  doc.setFont('times', 'bold');
  doc.text(`SG ${res.currentSalaryGrade}, Step ${res.nextStep} (${formatPHP(res.nextSalary)})`, 4.0, 5.45);
  doc.setFont('times', 'normal');

  doc.text('4. Monthly Differential / Increase:', 1.0, 5.7);
  doc.text(formatPHP(res.salaryDifference), 4.0, 5.7);

  const closingText =
    'This Step Increment is subject to post-audit by the Commission on Audit (COA) and to the condition that should there be any overpayment made by reason of this adjustment, the same shall be refunded by the personnel.';
  doc.text(doc.splitTextToSize(closingText, 6.9), 0.8, 6.3);

  // Signatures
  doc.text('Very truly yours,', 0.8, 7.2);
  doc.setFont('times', 'bold');
  doc.text('ROY C. TUBALLA, EMD, JD, CESO VI', 4.5, 7.8, { align: 'center' });
  doc.setFont('times', 'normal');
  doc.text('Schools Division Superintendent', 4.5, 8.0, { align: 'center' });
  doc.text('DepEd Division of Zamboanga City', 4.5, 8.2, { align: 'center' });

  return doc.output('blob');
}
