import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  FileCheck2,
  Printer,
  Plus,
  Trash2,
  Edit2,
  Edit3,
  CheckCircle2,
  Calendar,
  Building,
  DollarSign,
  Download,
  LayoutList,
  Table as TableIcon,
  Smartphone,
  UserCheck,
  RotateCcw,
  Save,
  X,
  Sparkles,
  ShieldCheck,
  HelpCircle,
  Image as ImageIcon,
  Upload,
  FileSpreadsheet,
  FileDown,
  UploadCloud,
  AlertTriangle,
  Info,
  UserPlus,
  Loader2,
} from 'lucide-react';
import { formatPHP } from '../data/ssl2026Tranche';
import { addAuditLog } from '../db/dexie';
import { updateUserSession } from '../services/authService';
import {
  SAMPLE_SERVICE_RECORD_PERSONNEL,
  SAMPLE_OMAR_PERSONNEL,
} from '../data/sampleServiceRecord';
import {
  downloadServiceRecordTemplate,
  parseServiceRecordExcel,
  ParsedServiceRecordResult,
} from '../utils/serviceRecordExcel';
import { Personnel, SchoolProfile, ServiceRecordBlock, UserSession } from '../types';

interface ServiceRecordViewProps {
  personnelList: Personnel[];
  currentUser: UserSession;
  schoolProfile?: SchoolProfile;
  onUpdatePersonnel: (updated: Personnel) => Promise<void>;
}

export const ServiceRecordView: React.FC<ServiceRecordViewProps> = ({
  personnelList,
  currentUser,
  schoolProfile,
  onUpdatePersonnel,
}) => {
  // Combine personnelList with official sample personnel options
  const effectivePersonnelList = useMemo(() => {
    const list = [...personnelList];
    const hasSampleRamirez = list.some((p) => p.id === SAMPLE_SERVICE_RECORD_PERSONNEL.id);
    if (!hasSampleRamirez) {
      list.unshift(SAMPLE_SERVICE_RECORD_PERSONNEL);
    }
    const hasSampleOmar = list.some((p) => p.id === SAMPLE_OMAR_PERSONNEL.id);
    if (!hasSampleOmar) {
      list.push(SAMPLE_OMAR_PERSONNEL);
    }
    return list;
  }, [personnelList]);

  const [selectedPersonnelId, setSelectedPersonnelId] = useState<string>(() => {
    if (personnelList.length > 0) return personnelList[0].id;
    return SAMPLE_OMAR_PERSONNEL.id;
  });

  const [viewLayout, setViewLayout] = useState<'TABLE' | 'CARDS'>('TABLE');

  // Official Document Signatory States
  const [isEditingSignatory, setIsEditingSignatory] = useState(false);
  const [signatorySuccessMsg, setSignatorySuccessMsg] = useState<string | null>(null);

  // Excel Template & Import States
  const [isDownloadModalOpen, setIsDownloadModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isParsingExcel, setIsParsingExcel] = useState(false);
  const [parsedExcelData, setParsedExcelData] = useState<ParsedServiceRecordResult | null>(null);
  const [uploadedFileName, setUploadedFileName] = useState<string>('');
  const [targetPersonnelIdForImport, setTargetPersonnelIdForImport] = useState<string>('');
  const [importMode, setImportMode] = useState<'REPLACE' | 'APPEND'>('REPLACE');
  const [syncProfileWithLatest, setSyncProfileWithLatest] = useState<boolean>(true);
  const [excelImportSuccessMsg, setExcelImportSuccessMsg] = useState<string | null>(null);
  const [excelImportErrorMsg, setExcelImportErrorMsg] = useState<string | null>(null);

  // Hidden file input ref for excel upload
  const excelFileInputRef = useRef<HTMLInputElement | null>(null);

  // Logo Customization States (stored in localStorage for persistence)
  const [headerLogo, setHeaderLogo] = useState<string | null>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('deped_sr_header_logo') || null;
    }
    return null;
  });

  const [footerLeftLogo, setFooterLeftLogo] = useState<string | null>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('deped_sr_footer_left_logo') || null;
    }
    return null;
  });

  const [footerRightLogo, setFooterRightLogo] = useState<string | null>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('deped_sr_footer_right_logo') || null;
    }
    return null;
  });

  const [isLogoModalOpen, setIsLogoModalOpen] = useState(false);
  const [logoSuccessMsg, setLogoSuccessMsg] = useState<string | null>(null);

  // Hidden file input refs for logo uploads
  const headerFileInputRef = useRef<HTMLInputElement | null>(null);
  const footerLeftFileInputRef = useRef<HTMLInputElement | null>(null);
  const footerRightFileInputRef = useRef<HTMLInputElement | null>(null);

  // Default signatories matching authentic DepEd Division of Zamboanga City document
  const [signatoryName, setSignatoryName] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('ao2_service_record_signatory');
      if (saved && saved.trim()) return saved.trim();
    }
    if (
      currentUser.fullName &&
      currentUser.fullName.trim() &&
      currentUser.fullName.trim().toLowerCase() !== currentUser.username.trim().toLowerCase() &&
      currentUser.fullName.trim() !== 'Administrative Officer II'
    ) {
      return currentUser.fullName.trim();
    }
    return 'LINUEL B. DE LOS SANTOS';
  });

  const [signatoryTitle, setSignatoryTitle] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('ao2_service_record_title');
      if (saved && saved.trim()) return saved.trim();
    }
    return 'Administrative Officer II';
  });

  const [certifierName, setCertifierName] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('ao2_service_record_certifier');
      if (saved && saved.trim()) return saved.trim();
    }
    return 'AL RAHIMIN T. KENOH, J.D.';
  });

  const [certifierTitle, setCertifierTitle] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('ao2_service_record_certifier_title');
      if (saved && saved.trim()) return saved.trim();
    }
    return 'Division Administrative Officer V';
  });

  const [certifierOffice, setCertifierOffice] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('ao2_service_record_certifier_office');
      if (saved && saved.trim()) return saved.trim();
    }
    return 'Chief, Administrative Services';
  });

  const [dateIssued, setDateIssued] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('ao2_service_record_date_issued');
      if (saved && saved.trim()) return saved.trim();
    }
    const today = new Date();
    return today.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  });

  // Modal editing temporary state
  const [tempSignatoryName, setTempSignatoryName] = useState(signatoryName);
  const [tempSignatoryTitle, setTempSignatoryTitle] = useState(signatoryTitle);
  const [tempCertifierName, setTempCertifierName] = useState(certifierName);
  const [tempCertifierTitle, setTempCertifierTitle] = useState(certifierTitle);
  const [tempCertifierOffice, setTempCertifierOffice] = useState(certifierOffice);
  const [tempDateIssued, setTempDateIssued] = useState(dateIssued);
  const [alsoUpdateProfile, setAlsoUpdateProfile] = useState(true);

  // Sync if currentUser.fullName changes externally
  useEffect(() => {
    const saved = localStorage.getItem('ao2_service_record_signatory');
    if (!saved && currentUser.fullName && currentUser.fullName !== currentUser.username && currentUser.fullName !== 'Administrative Officer II') {
      setSignatoryName(currentUser.fullName);
    }
  }, [currentUser.fullName, currentUser.username]);

  const handleOpenSignatoryModal = () => {
    setTempSignatoryName(signatoryName);
    setTempSignatoryTitle(signatoryTitle);
    setTempCertifierName(certifierName);
    setTempCertifierTitle(certifierTitle);
    setTempCertifierOffice(certifierOffice);
    setTempDateIssued(dateIssued);
    setSignatorySuccessMsg(null);
    setIsEditingSignatory(true);
  };

  const handleSaveSignatories = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanSignatory = tempSignatoryName.trim() || 'LINUEL B. DE LOS SANTOS';
    const cleanTitle = tempSignatoryTitle.trim() || 'Administrative Officer II';
    const cleanCertifier = tempCertifierName.trim() || 'AL RAHIMIN T. KENOH, J.D.';
    const cleanCertifierTitle = tempCertifierTitle.trim() || 'Division Administrative Officer V';
    const cleanCertifierOffice = tempCertifierOffice.trim() || 'Chief, Administrative Services';
    const cleanDate = tempDateIssued.trim() || dateIssued;

    setSignatoryName(cleanSignatory);
    setSignatoryTitle(cleanTitle);
    setCertifierName(cleanCertifier);
    setCertifierTitle(cleanCertifierTitle);
    setCertifierOffice(cleanCertifierOffice);
    setDateIssued(cleanDate);

    if (typeof window !== 'undefined') {
      localStorage.setItem('ao2_service_record_signatory', cleanSignatory);
      localStorage.setItem('ao2_service_record_title', cleanTitle);
      localStorage.setItem('ao2_service_record_certifier', cleanCertifier);
      localStorage.setItem('ao2_service_record_certifier_title', cleanCertifierTitle);
      localStorage.setItem('ao2_service_record_certifier_office', cleanCertifierOffice);
      localStorage.setItem('ao2_service_record_date_issued', cleanDate);
    }

    if (alsoUpdateProfile) {
      await updateUserSession({ fullName: cleanSignatory });
    }

    setSignatorySuccessMsg('Signatories updated successfully!');
    setTimeout(() => {
      setSignatorySuccessMsg(null);
      setIsEditingSignatory(false);
    }, 1000);
  };

  const handleResetSignatories = () => {
    const defaultName = 'LINUEL B. DE LOS SANTOS';
    const defaultTitle = 'Administrative Officer II';
    const defaultCert = 'AL RAHIMIN T. KENOH, J.D.';
    const defaultCertTitle = 'Division Administrative Officer V';
    const defaultOffice = 'Chief, Administrative Services';
    const today = new Date().toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    setSignatoryName(defaultName);
    setSignatoryTitle(defaultTitle);
    setCertifierName(defaultCert);
    setCertifierTitle(defaultCertTitle);
    setCertifierOffice(defaultOffice);
    setDateIssued(today);

    if (typeof window !== 'undefined') {
      localStorage.removeItem('ao2_service_record_signatory');
      localStorage.removeItem('ao2_service_record_title');
      localStorage.removeItem('ao2_service_record_certifier');
      localStorage.removeItem('ao2_service_record_certifier_title');
      localStorage.removeItem('ao2_service_record_certifier_office');
      localStorage.removeItem('ao2_service_record_date_issued');
    }
    setIsEditingSignatory(false);
  };

  // Logo file upload handler
  const handleLogoFileUpload = (file: File, type: 'header' | 'footerLeft' | 'footerRight') => {
    if (!file.type.startsWith('image/')) {
      alert('Please upload a valid image file (PNG, JPG, JPEG, WEBP, or SVG).');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      if (type === 'header') {
        setHeaderLogo(dataUrl);
        localStorage.setItem('deped_sr_header_logo', dataUrl);
      } else if (type === 'footerLeft') {
        setFooterLeftLogo(dataUrl);
        localStorage.setItem('deped_sr_footer_left_logo', dataUrl);
      } else if (type === 'footerRight') {
        setFooterRightLogo(dataUrl);
        localStorage.setItem('deped_sr_footer_right_logo', dataUrl);
      }
      setLogoSuccessMsg(
        `${type === 'header' ? 'Header' : type === 'footerLeft' ? 'Footer Left' : 'Footer Right'} logo uploaded successfully!`
      );
      setTimeout(() => setLogoSuccessMsg(null), 3000);
    };
    reader.readAsDataURL(file);
  };

  // Reset logo to official default
  const handleResetLogo = (type: 'header' | 'footerLeft' | 'footerRight') => {
    if (type === 'header') {
      setHeaderLogo(null);
      localStorage.removeItem('deped_sr_header_logo');
    } else if (type === 'footerLeft') {
      setFooterLeftLogo(null);
      localStorage.removeItem('deped_sr_footer_left_logo');
    } else if (type === 'footerRight') {
      setFooterRightLogo(null);
      localStorage.removeItem('deped_sr_footer_right_logo');
    }
    setLogoSuccessMsg(`Reset ${type === 'header' ? 'Header' : type === 'footerLeft' ? 'Footer Left' : 'Footer Right'} logo to official default.`);
    setTimeout(() => setLogoSuccessMsg(null), 3000);
  };

  // Add/Edit Record Block Modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingBlockIndex, setEditingBlockIndex] = useState<number | null>(null);

  // Form states for Service Record Block
  const [dateFrom, setDateFrom] = useState('06/14/2019');
  const [dateTo, setDateTo] = useState('12/31/2019');
  const [designation, setDesignation] = useState('TEACHER I');
  const [status, setStatus] = useState('PERM.');
  const [salaryRate, setSalaryRate] = useState('20,754.00');
  const [salaryGrade, setSalaryGrade] = useState('11');
  const [stepIncrement, setStepIncrement] = useState('1');
  const [schoolAssignment, setSchoolAssignment] = useState('MANGUSU IS');
  const [remittingAgency, setRemittingAgency] = useState('ZAMBOANGA CITY HIGH SCHOOL - 1000030811');
  const [branch, setBranch] = useState('NAT.');
  const [lwopFrom, setLwopFrom] = useState('');
  const [lwopTo, setLwopTo] = useState('');
  const [lwop, setLwop] = useState('NONE');
  const [separationDate, setSeparationDate] = useState('');
  const [separationCause, setSeparationCause] = useState('');
  const [remarks, setRemarks] = useState('SALARY TRANCHE');

  const activePersonnel = useMemo(() => {
    return (
      effectivePersonnelList.find((p) => p.id === selectedPersonnelId) ||
      effectivePersonnelList[0] ||
      null
    );
  }, [effectivePersonnelList, selectedPersonnelId]);

  const blocks: ServiceRecordBlock[] = activePersonnel?.serviceRecordBlocks || [];

  const handleOpenAddModal = () => {
    setEditingBlockIndex(null);
    setDateFrom('01/01/2026');
    setDateTo('PRESENT');
    setDesignation(activePersonnel?.positionTitle || 'TEACHER I');
    setStatus('PERM.');
    setSalaryRate('32,109.00');
    setSalaryGrade(String(activePersonnel?.salaryGrade || '11'));
    setStepIncrement(String(activePersonnel?.stepIncrement || '3'));
    setSchoolAssignment(activePersonnel?.schoolStation ? activePersonnel.schoolStation.replace('INTEGRATED SCHOOL', 'IS') : 'MANGUSU IS');
    setRemittingAgency(activePersonnel?.remittingAgency || 'ZAMBOANGA CITY HIGH SCHOOL - 1000030811');
    setBranch('NAT.');
    setLwopFrom('');
    setLwopTo('');
    setLwop('NONE');
    setSeparationDate('');
    setSeparationCause('');
    setRemarks('SALARY TRANCHE');
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (block: ServiceRecordBlock, index: number) => {
    setEditingBlockIndex(index);
    setDateFrom(block.from || block.dateFrom || '');
    setDateTo(block.to || block.dateTo || 'PRESENT');
    setDesignation(block.designation || 'TEACHER I');
    setStatus(block.status || 'PERM.');
    setSalaryRate(
      typeof block.monthlySalary === 'number'
        ? block.monthlySalary.toLocaleString('en-US', { minimumFractionDigits: 2 })
        : String(block.monthlySalary || '')
    );
    setSalaryGrade(String(block.salaryGrade || activePersonnel?.salaryGrade || '11'));
    setStepIncrement(String(block.step || activePersonnel?.stepIncrement || '1'));
    setSchoolAssignment(block.schoolAssignment || block.station || activePersonnel?.schoolStation || 'MANGUSU IS');
    setRemittingAgency(block.remittingAgency || activePersonnel?.remittingAgency || 'ZAMBOANGA CITY HIGH SCHOOL - 1000030811');
    setBranch(block.branch || 'NAT.');
    setLwopFrom(block.lwopFrom || '');
    setLwopTo(block.lwopTo || '');
    setLwop(block.lwop || 'NONE');
    setSeparationDate(block.separationDate || '');
    setSeparationCause(block.separationCause || block.separationDateCause || '');
    setRemarks(block.remarks || '');
    setIsModalOpen(true);
  };

  const handleDeleteBlock = async (index: number) => {
    if (!activePersonnel) return;
    if (!window.confirm('Delete this service history row?')) return;

    const newBlocks = [...blocks];
    newBlocks.splice(index, 1);

    const updated: Personnel = {
      ...activePersonnel,
      serviceRecordBlocks: newBlocks,
      updatedAt: Date.now(),
    };

    await onUpdatePersonnel(updated);

    await addAuditLog(
      currentUser.username,
      currentUser.role,
      'SECURITY',
      'SERVICE_RECORD_DELETE',
      `Deleted service history row for ${activePersonnel.lastName}`
    );
  };

  const handleSaveBlock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activePersonnel) return;

    const cleanSalary = salaryRate.trim();

    const newBlock: ServiceRecordBlock = {
      id: editingBlockIndex !== null && blocks[editingBlockIndex]?.id ? blocks[editingBlockIndex].id : `SRB-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      from: dateFrom.trim(),
      to: dateTo.trim(),
      dateFrom: dateFrom.trim(),
      dateTo: dateTo.trim(),
      designation: designation.trim().toUpperCase(),
      status: status.trim().toUpperCase(),
      monthlySalary: cleanSalary,
      salaryGrade: salaryGrade.trim(),
      step: stepIncrement.trim(),
      schoolAssignment: schoolAssignment.trim().toUpperCase(),
      remittingAgency: remittingAgency.trim().toUpperCase(),
      station: remittingAgency.trim().toUpperCase(),
      branch: branch.trim().toUpperCase(),
      lwopFrom: lwopFrom.trim(),
      lwopTo: lwopTo.trim(),
      lwop: lwop.trim() || 'NONE',
      separationDate: separationDate.trim(),
      separationCause: separationCause.trim(),
      separationDateCause: separationCause.trim() || 'N/A',
      remarks: remarks.trim().toUpperCase(),
    };

    const newBlocks = [...blocks];
    if (editingBlockIndex !== null) {
      newBlocks[editingBlockIndex] = newBlock;
    } else {
      newBlocks.push(newBlock);
    }

    const updated: Personnel = {
      ...activePersonnel,
      serviceRecordBlocks: newBlocks,
      updatedAt: Date.now(),
    };

    await onUpdatePersonnel(updated);

    await addAuditLog(
      currentUser.username,
      currentUser.role,
      'SECURITY',
      'SERVICE_RECORD_UPDATE',
      `${editingBlockIndex !== null ? 'Updated' : 'Added'} service history block for ${activePersonnel.lastName}`
    );

    setIsModalOpen(false);
  };

  const handleDownloadSampleGuide = () => {
    downloadServiceRecordTemplate({
      personnelName: 'OMAR, MICHEL FALCASANTOS',
      useSampleData: true,
      filename: 'DepEd_Service_Record_Sample_Guide_OMAR_MICHEL.xlsx',
    });
  };

  const handleDownloadBlankTemplate = () => {
    downloadServiceRecordTemplate({
      personnelName: '',
      useSampleData: false,
      filename: 'DepEd_Service_Record_Blank_Template.xlsx',
    });
  };

  const handleExportActivePersonnel = () => {
    if (!activePersonnel) return;
    const fullName = `${activePersonnel.lastName}, ${activePersonnel.firstName} ${activePersonnel.middleName || ''}`.trim();
    downloadServiceRecordTemplate({
      personnelName: fullName,
      existingBlocks: blocks,
      filename: `Service_Record_${activePersonnel.lastName}_${activePersonnel.firstName}.xlsx`,
    });
  };

  const handleExcelFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await processExcelFile(file);
    if (e.target) e.target.value = '';
  };

  const processExcelFile = async (file: File) => {
    setIsParsingExcel(true);
    setExcelImportErrorMsg(null);
    setExcelImportSuccessMsg(null);
    try {
      const result = await parseServiceRecordExcel(file);
      setUploadedFileName(file.name);
      setParsedExcelData(result);

      // Auto-match personnel
      let matchedId = selectedPersonnelId;
      if (result.detectedName) {
        const cleanDetected = result.detectedName.toLowerCase().replace(/[^a-z0-9]/g, ' ').trim();
        const matched = effectivePersonnelList.find((p) => {
          const lMatch = cleanDetected.includes(p.lastName.toLowerCase());
          const fMatch = cleanDetected.includes(p.firstName.toLowerCase());
          return lMatch && fMatch;
        });
        if (matched) {
          matchedId = matched.id;
        } else if (cleanDetected.includes('omar') || cleanDetected.includes('falcasantos')) {
          matchedId = SAMPLE_OMAR_PERSONNEL.id;
        }
      }
      setTargetPersonnelIdForImport(matchedId);
      setIsImportModalOpen(true);
    } catch (err: any) {
      console.error('Failed to parse Excel file:', err);
      setExcelImportErrorMsg(err?.message || 'Failed to read Excel file. Please ensure it follows the recommended template format.');
    } finally {
      setIsParsingExcel(false);
    }
  };

  const handleConfirmExcelImport = async () => {
    if (!parsedExcelData || parsedExcelData.blocks.length === 0) {
      setExcelImportErrorMsg('No valid service record rows were found in the uploaded spreadsheet.');
      return;
    }

    let targetPersonnel: Personnel | null = null;

    if (targetPersonnelIdForImport === 'CREATE_NEW') {
      const rawName = parsedExcelData.detectedName || 'NEW PERSONNEL';
      let lName = 'PERSONNEL';
      let fName = 'NEW';
      let mName = '';

      if (rawName.includes(',')) {
        const parts = rawName.split(',');
        lName = parts[0].trim().toUpperCase();
        const fmParts = (parts[1] || '').trim().split(/\s+/);
        fName = (fmParts[0] || 'EMPLOYEE').toUpperCase();
        mName = fmParts.slice(1).join(' ').toUpperCase();
      } else {
        const parts = rawName.trim().split(/\s+/);
        if (parts.length >= 2) {
          lName = parts[parts.length - 1].toUpperCase();
          fName = parts.slice(0, -1).join(' ').toUpperCase();
        } else {
          lName = rawName.toUpperCase();
          fName = 'EMPLOYEE';
        }
      }

      const summary = parsedExcelData.summary;
      const newId = `EMP-${Date.now().toString().slice(-6)}`;

      targetPersonnel = {
        id: newId,
        lastName: lName,
        firstName: fName,
        middleName: mName,
        positionTitle: summary.latestPosition !== 'N/A' ? summary.latestPosition : 'TEACHER I',
        plantillaItemNo: `OSEC-DECSB-${summary.latestPosition || 'TCH1'}-${Math.floor(100000 + Math.random() * 900000)}-2024`,
        tin: '000-000-000-000',
        dob: '1990-01-01',
        pob: 'Zamboanga City',
        schoolId: schoolProfile?.schoolId || 'SCH-MANGUSU',
        schoolStation: summary.latestOffice !== 'N/A' ? summary.latestOffice : (schoolProfile?.schoolName || 'MANGUSU INTEGRATED SCHOOL'),
        districtName: schoolProfile?.districtName || 'VITALI DIST. / MANGUSU INTEGRATED SCHOOL',
        remittingAgency: 'ZAMBOANGA CITY HIGH SCHOOL - 1000030811',
        gsisBPNo: '200' + Math.floor(1000000 + Math.random() * 9000000),
        personnelType: 'Teaching',
        employmentStatus: 'Permanent',
        workSchedule: 'Teaching',
        salaryGrade: Number(summary.latestSG) || 11,
        stepIncrement: Number(summary.latestStep) || 1,
        continuousServiceStart: summary.earliestDate !== 'N/A' ? summary.earliestDate : '2015-01-01',
        lastPromotionDate: summary.latestDate !== 'PRESENT' && summary.latestDate !== 'N/A' ? summary.latestDate : '2024-01-01',
        lastStepIncrementDate: '2024-01-01',
        dtrLogs: {},
        serviceCredits: 15,
        vacationLeaveCredits: 0,
        sickLeaveCredits: 0,
        leaveLedger: [],
        updatedAt: Date.now(),
        serviceRecordBlocks: parsedExcelData.blocks,
      };
    } else {
      const existing = effectivePersonnelList.find((p) => p.id === targetPersonnelIdForImport);
      if (!existing) {
        setExcelImportErrorMsg('The selected target personnel could not be located.');
        return;
      }

      let finalBlocks: ServiceRecordBlock[] = [];
      if (importMode === 'REPLACE') {
        finalBlocks = [...parsedExcelData.blocks];
      } else {
        finalBlocks = [...(existing.serviceRecordBlocks || []), ...parsedExcelData.blocks];
      }

      targetPersonnel = {
        ...existing,
        serviceRecordBlocks: finalBlocks,
        updatedAt: Date.now(),
      };

      if (syncProfileWithLatest && parsedExcelData.blocks.length > 0) {
        const latest = parsedExcelData.blocks[parsedExcelData.blocks.length - 1];
        if (latest.designation) {
          targetPersonnel.positionTitle = latest.designation;
        }
        if (latest.salaryGrade) {
          targetPersonnel.salaryGrade = Number(latest.salaryGrade) || targetPersonnel.salaryGrade;
        }
        if (latest.step) {
          targetPersonnel.stepIncrement = Number(latest.step) || targetPersonnel.stepIncrement;
        }
        if (latest.schoolAssignment) {
          targetPersonnel.schoolStation = latest.schoolAssignment;
        }
      }
    }

    if (targetPersonnel) {
      await onUpdatePersonnel(targetPersonnel);
      setSelectedPersonnelId(targetPersonnel.id);

      await addAuditLog(
        currentUser.username,
        currentUser.role,
        'EXCEL_IMPORT',
        'SERVICE_RECORD_IMPORT',
        `Imported ${parsedExcelData.blocks.length} service record rows from "${uploadedFileName}" for ${targetPersonnel.lastName}, ${targetPersonnel.firstName}`
      );

      setExcelImportSuccessMsg(
        `Successfully imported ${parsedExcelData.blocks.length} service record rows for ${targetPersonnel.lastName}, ${targetPersonnel.firstName} (${targetPersonnel.positionTitle})!`
      );
      setIsImportModalOpen(false);
      setParsedExcelData(null);
    }
  };

  const handleLoadSample = async () => {
    setSelectedPersonnelId(SAMPLE_OMAR_PERSONNEL.id);
    const exists = personnelList.some((p) => p.id === SAMPLE_OMAR_PERSONNEL.id);
    if (!exists) {
      await onUpdatePersonnel(SAMPLE_OMAR_PERSONNEL);
    }
  };

  const formattedDob = useMemo(() => {
    if (!activePersonnel?.dob) return 'March 6, 1997';
    try {
      const d = new Date(activePersonnel.dob);
      if (isNaN(d.getTime())) return activePersonnel.dob;
      return d.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
    } catch {
      return activePersonnel.dob;
    }
  }, [activePersonnel?.dob]);

  if (!activePersonnel) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-12 text-center max-w-xl mx-auto my-8 shadow-sm space-y-3">
        <FileCheck2 className="w-10 h-10 text-slate-300 mx-auto" />
        <h3 className="text-base font-bold text-slate-800">No Personnel Records in Database</h3>
        <p className="text-xs text-slate-500 leading-relaxed">
          There are no personnel records available to display service history.
        </p>
        <button
          type="button"
          onClick={handleLoadSample}
          className="px-4 py-2 bg-[#1e3a8a] text-white rounded-lg text-xs font-bold shadow-xs hover:bg-blue-900 transition"
        >
          Load Authentic Sample Record (Omar, Michel F.)
        </button>
      </div>
    );
  }

  const isSampleActive =
    activePersonnel.id === SAMPLE_SERVICE_RECORD_PERSONNEL.id ||
    activePersonnel.id === SAMPLE_OMAR_PERSONNEL.id;

  return (
    <div className="space-y-6">
      {/* Control Toolbar */}
      <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-sm no-print">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <FileCheck2 className="w-5 h-5 text-[#1e3a8a]" />
              <h2 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight">
                DepEd Service Record (F-ADM-PER-029.0)
              </h2>
              {isSampleActive && (
                <span className="px-2 py-0.5 bg-amber-100 text-amber-800 border border-amber-300 rounded-full text-[10px] font-bold">
                  Official Sample Preview
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Division of Zamboanga City &bull; Executive Order No. 54 dated August 10, 1954 standard format
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Personnel Selector */}
            <div className="flex items-center gap-1.5">
              <label htmlFor="service-record-personnel-select" className="text-xs font-medium text-slate-600">
                Personnel:
              </label>
              <select
                id="service-record-personnel-select"
                aria-label="Select Personnel for Service Record"
                value={selectedPersonnelId}
                onChange={(e) => setSelectedPersonnelId(e.target.value)}
                className="bg-slate-50 border border-slate-300 rounded-lg px-3 py-1.5 text-xs text-slate-900 font-semibold focus:ring-1 focus:ring-blue-600 focus:outline-none max-w-[240px]"
              >
                {effectivePersonnelList.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.lastName}, {p.firstName} {p.middleName ? p.middleName[0] + '.' : ''} ({p.positionTitle})
                  </option>
                ))}
              </select>
            </div>

            {/* Quick Sample Button */}
            {!isSampleActive && (
              <button
                type="button"
                onClick={handleLoadSample}
                className="flex items-center gap-1 px-2.5 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 rounded-lg text-xs font-semibold transition"
                title="View the authentic sample document format"
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-600" />
                <span>Sample Document</span>
              </button>
            )}

            {/* Layout Switcher */}
            <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200 text-xs">
              <button
                type="button"
                onClick={() => setViewLayout('TABLE')}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-md transition ${
                  viewLayout === 'TABLE'
                    ? 'bg-white text-[#1e3a8a] font-bold shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
                title="View authentic DepEd document layout"
              >
                <TableIcon className="w-3 h-3 text-[#1e3a8a]" />
                <span>Form 029</span>
              </button>
              <button
                type="button"
                onClick={() => setViewLayout('CARDS')}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-md transition ${
                  viewLayout === 'CARDS'
                    ? 'bg-white text-slate-900 font-bold shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
                title="Mobile list view"
              >
                <Smartphone className="w-3 h-3 text-amber-600" />
                <span>Cards</span>
              </button>
            </div>

            {/* Download Excel Format Button */}
            <button
              type="button"
              onClick={() => setIsDownloadModalOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 rounded-lg text-xs font-semibold border border-emerald-300 transition shadow-xs"
              title="Download official Excel template format guide matching DepEd standards"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-700" />
              <span>Download Format</span>
            </button>

            {/* Upload Excel Button */}
            <button
              type="button"
              onClick={() => excelFileInputRef.current?.click()}
              disabled={isParsingExcel}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg text-xs font-semibold shadow-xs transition disabled:opacity-50"
              title="Upload an Excel (.xlsx) file to populate service record history for personnel"
            >
              {isParsingExcel ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Upload className="w-3.5 h-3.5" />
              )}
              <span>Upload Excel</span>
            </button>
            <input
              ref={excelFileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={handleExcelFileSelect}
              className="hidden"
            />

            {/* Upload Logos Button */}
            <button
              type="button"
              onClick={() => setIsLogoModalOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg text-xs font-semibold border border-slate-300 transition"
              title="Upload official Header Logo, Footer Left Logo, and Footer Right Logo"
            >
              <ImageIcon className="w-3.5 h-3.5 text-[#1e3a8a]" />
              <span>Upload Logos</span>
            </button>

            {/* Signatories Config Button */}
            <button
              type="button"
              onClick={handleOpenSignatoryModal}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg text-xs font-semibold border border-slate-300 transition"
              title="Configure Official Signatory Names & AO II Complete Name"
            >
              <UserCheck className="w-3.5 h-3.5 text-[#1e3a8a]" />
              <span>Signatories</span>
            </button>

            {/* Add Service Block Button */}
            <button
              type="button"
              onClick={handleOpenAddModal}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-[#1e3a8a] hover:bg-blue-900 text-white rounded-lg text-xs font-semibold shadow-xs transition"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Row</span>
            </button>

            {/* Print Document Button */}
            <button
              type="button"
              onClick={() => window.print()}
              className="flex items-center gap-1.5 px-3.5 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-lg text-xs font-bold shadow-xs transition"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print Document</span>
            </button>
          </div>
        </div>
      </div>

      {/* Excel Import Success Notification */}
      {excelImportSuccessMsg && (
        <div className="no-print p-3.5 bg-emerald-50 border border-emerald-300 rounded-xl text-emerald-900 text-xs flex items-center justify-between shadow-xs">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            <div>
              <strong>Import Successful:</strong> {excelImportSuccessMsg}
            </div>
          </div>
          <button
            type="button"
            onClick={() => setExcelImportSuccessMsg(null)}
            className="text-emerald-700 hover:text-emerald-950 p-1 rounded-lg hover:bg-emerald-100 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Excel Import Error Notification */}
      {excelImportErrorMsg && (
        <div className="no-print p-3.5 bg-red-50 border border-red-300 rounded-xl text-red-900 text-xs flex items-center justify-between shadow-xs">
          <div className="flex items-center gap-2.5">
            <AlertTriangle className="w-5 h-5 text-red-600 shrink-0" />
            <div>
              <strong>Import Error:</strong> {excelImportErrorMsg}
            </div>
          </div>
          <button
            type="button"
            onClick={() => setExcelImportErrorMsg(null)}
            className="text-red-700 hover:text-red-950 p-1 rounded-lg hover:bg-red-100 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* AO II Name Verification Notice if name is still raw username */}
      {signatoryName.trim().toUpperCase() === currentUser.username.trim().toUpperCase() && (
        <div className="no-print p-3 bg-blue-50 border border-blue-200 rounded-xl text-blue-950 text-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs">
          <div className="flex items-center gap-2">
            <UserCheck className="w-4 h-4 text-[#1e3a8a] shrink-0" />
            <span>
              <strong>Official Signatory Notice:</strong> The document is using your username (<strong>{currentUser.username}</strong>). Click <strong>Set Complete Name</strong> to display your complete legal civil service name (e.g. <em>LINUEL B. DE LOS SANTOS, AO II</em>).
            </span>
          </div>
          <button
            type="button"
            onClick={handleOpenSignatoryModal}
            className="px-3 py-1.5 bg-[#1e3a8a] hover:bg-blue-900 text-white rounded-lg font-bold text-xs shrink-0 shadow-xs transition"
          >
            Set Complete Name
          </button>
        </div>
      )}

      {/* ========================================================================= */}
      {/* AUTHENTIC DEPED FORM F-ADM-PER-029.0 PRINTABLE SERVICE RECORD */}
      {/* ========================================================================= */}
      <div className="bg-white p-6 sm:p-10 rounded-2xl border border-slate-300 shadow-lg text-black printable-area max-w-5xl mx-auto font-serif print:p-0 print:m-0 print:border-none print:shadow-none print:rounded-none print:max-w-none print:w-full print:overflow-visible">
        
        {/* Top Header: Header Logo & Republic Heading */}
        <div className="text-center leading-tight">
          {/* Header Seal: Uploaded Image or Built-in Vector DepEd Seal */}
          <div className="flex justify-center mb-1 print:mb-0.5">
            <div className="relative group/hdr cursor-pointer" onClick={() => setIsLogoModalOpen(true)} title="Click to change Header Logo">
              {headerLogo ? (
                <img
                  src={headerLogo}
                  alt="Official DepEd Header Logo"
                  className="w-14 h-14 print:w-12 print:h-12 object-contain mx-auto"
                />
              ) : (
                <svg
                  className="w-13 h-13 print:w-11 print:h-11"
                  viewBox="0 0 100 100"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <circle cx="50" cy="50" r="46" stroke="#1e3a8a" strokeWidth="3" fill="#ffffff" />
                  <circle cx="50" cy="50" r="41" stroke="#b45309" strokeWidth="1.5" />
                  <path
                    d="M50 12 L53 22 L63 22 L55 28 L58 38 L50 32 L42 38 L45 28 L37 22 L47 22 Z"
                    fill="#b45309"
                  />
                  {/* Golden Sun & Rays */}
                  <circle cx="50" cy="46" r="11" fill="#f59e0b" />
                  <path d="M50 30 L50 35 M50 57 L50 62 M34 46 L39 46 M61 46 L66 46" stroke="#d97706" strokeWidth="2" strokeLinecap="round" />
                  {/* Open Book */}
                  <path
                    d="M26 62 C34 59 44 60 50 64 C56 60 66 59 74 62 L74 74 C66 71 56 72 50 76 C44 72 34 71 26 74 Z"
                    fill="#1e3a8a"
                  />
                  <path
                    d="M50 64 L50 76"
                    stroke="#ffffff"
                    strokeWidth="1.5"
                  />
                  {/* Laurel Leaves */}
                  <path
                    d="M22 48 C20 60 26 72 38 78"
                    stroke="#15803d"
                    strokeWidth="2"
                    strokeLinecap="round"
                    fill="none"
                  />
                  <path
                    d="M78 48 C80 60 74 72 62 78"
                    stroke="#15803d"
                    strokeWidth="2"
                    strokeLinecap="round"
                    fill="none"
                  />
                  {/* Stars */}
                  <polygon points="50,18 51.5,22 55,22 52,24.5 53,28 50,25.5 47,28 48,24.5 45,22 48.5,22" fill="#d97706" />
                  <polygon points="28,28 29.5,31 33,31 30,33 31,36 28,34 25,36 26,33 23,31 26.5,31" fill="#d97706" />
                  <polygon points="72,28 73.5,31 77,31 74,33 75,36 72,34 69,36 70,33 67,31 70.5,31" fill="#d97706" />
                </svg>
              )}
              {/* Screen-only hover button to quickly upload/change */}
              <button
                type="button"
                className="no-print absolute -bottom-1 -right-2 bg-white/95 text-[#1e3a8a] hover:bg-blue-50 border border-slate-300 rounded-full p-1 shadow-xs opacity-0 group-hover/hdr:opacity-100 transition"
                title="Change Header Logo"
              >
                <Edit3 className="w-2.5 h-2.5" />
              </button>
            </div>
          </div>

          <p className="text-[11px] uppercase tracking-normal">Republic of the Philippines</p>
          <p className="text-[12px] uppercase font-semibold">Department of Education Region IX,</p>
          <p className="text-[11px] italic">Zamboanga Peninsula</p>
          <p className="text-[12.5px] font-bold uppercase tracking-wider mt-0.5">DIVISION OF ZAMBOANGA CITY</p>
          <p className="text-[10.5px]">Baliwasan Chico, Zamboanga City</p>
        </div>

        {/* Form Title */}
        <div className="text-center mt-3 mb-2 print:mt-1.5 print:mb-1">
          <h1 className="text-[14px] font-extrabold tracking-wider uppercase underline underline-offset-4 decoration-1">SERVICE RECORD</h1>
          <p className="text-[10px] font-normal italic">(To be accomplished by Employer)</p>
        </div>

        {/* Employee Personal Information Details Grid */}
        <div className="text-[10.5px] leading-tight space-y-1.5 mt-2 print:text-[9.5px] print:space-y-1 print:mt-1 font-serif">
          {/* Row 1: Name Columns + Married note */}
          <div className="grid grid-cols-12 gap-2 items-start">
            <div className="col-span-8 grid grid-cols-3 gap-2">
              <div className="text-left">
                <span className="font-bold uppercase text-[12px] print:text-[11px] tracking-wide">
                  {activePersonnel.lastName}
                </span>
                <p className="text-[9px] text-slate-600 font-sans mt-0.5">(Last Name)</p>
              </div>
              <div className="text-left">
                <span className="font-bold uppercase text-[12px] print:text-[11px] tracking-wide">
                  {activePersonnel.firstName}
                </span>
                <p className="text-[9px] text-slate-600 font-sans mt-0.5">(First Name)</p>
              </div>
              <div className="text-left">
                <span className="font-bold uppercase text-[12px] print:text-[11px] tracking-wide">
                  {activePersonnel.middleName || 'BERENGUER'}
                </span>
                <p className="text-[9px] text-slate-600 font-sans mt-0.5">(Middle Name)</p>
              </div>
            </div>
            <div className="col-span-4 text-right text-[9px] text-slate-600 italic font-sans leading-tight">
              (If married, give also full name and other surname used)
            </div>
          </div>

          {/* Row 2: Date of Birth, Place of Birth + Verification note */}
          <div className="grid grid-cols-12 gap-2 items-start">
            <div className="col-span-8 grid grid-cols-3 gap-2">
              <div className="text-left">
                <span className="font-bold text-[11px] print:text-[10px]">
                  {formattedDob}
                </span>
                <p className="text-[9px] text-slate-600 font-sans mt-0.5">(Date of Birth)</p>
              </div>
              <div className="col-span-2 text-left">
                <span className="font-bold text-[11px] print:text-[10px]">
                  {activePersonnel.pob || 'Sumisip, Basilan'}
                </span>
                <p className="text-[9px] text-slate-600 font-sans mt-0.5">(Place of Birth)</p>
              </div>
            </div>
            <div className="col-span-4 text-right text-[8.5px] text-slate-600 italic font-sans leading-tight">
              (Date herein should be checked from birth baptismal certificate or some other official document.)
            </div>
          </div>

          {/* Row 3: District / Current School */}
          <div className="flex items-baseline gap-2 pt-0.5">
            <span className="font-bold text-[9.5px] tracking-tight uppercase whitespace-nowrap">
              DIST./CURRENT SCHOOL:
            </span>
            <span className="font-bold uppercase text-[10px] print:text-[9.5px]">
              {activePersonnel.districtName || `${schoolProfile?.district || 'VITALI DIST.'} / ${activePersonnel.schoolStation || 'MANGUSU INTEGRATED SCHOOL'}`}
            </span>
          </div>

          {/* Row 4: GSIS BP No. */}
          <div className="flex items-baseline gap-2">
            <span className="font-bold text-[9.5px] tracking-tight uppercase whitespace-nowrap">
              GSIS BP NO:
            </span>
            <span className="font-bold text-[10px] print:text-[9.5px] font-sans">
              {activePersonnel.gsisBPNo || '2005735100'}
            </span>
          </div>

          {/* Row 5: Employee No. */}
          <div className="flex items-baseline gap-2">
            <span className="font-bold text-[9.5px] tracking-tight uppercase whitespace-nowrap">
              EMPLOYEE NO.:
            </span>
            <span className="font-bold text-[10px] print:text-[9.5px] font-sans">
              {activePersonnel.id || '6275714'}
            </span>
          </div>

          {/* Row 6: T.I.N. */}
          <div className="flex items-baseline gap-2">
            <span className="font-bold text-[9.5px] tracking-tight uppercase whitespace-nowrap">
              T.I.N.
            </span>
            <span className="font-bold text-[10px] print:text-[9.5px] font-sans">
              {activePersonnel.tin || '705-389-537-000'}
            </span>
          </div>

          {/* Row 7: Item No. / Current Position */}
          <div className="flex items-baseline gap-2 pb-0.5">
            <span className="font-bold text-[9.5px] tracking-tight uppercase whitespace-nowrap">
              ITEM NO./ CURRENT POSITION:
            </span>
            <span className="font-bold uppercase text-[10px] print:text-[9.5px] font-sans">
              {activePersonnel.plantillaItemNo || 'OSEC-DECSB-TCH1-570740-2018'} / {activePersonnel.positionTitle === 'TEACHER I' ? 'TCH1' : activePersonnel.positionTitle}
            </span>
          </div>
        </div>

        {/* Certification Statement Above Table */}
        <p className="text-[9.5px] text-justify leading-snug my-2 print:my-1.5 font-serif">
          This is to certify that the employee named herein above actually rendered service in this office or Office as indicated below each line of which is supported by appointment and other papers actually issued and approved by the authorities concerned:
        </p>

        {/* 15-Column DepEd Form 029 Multi-Tier Table */}
        <div className="overflow-x-auto print:overflow-visible print:w-full">
          <table className="w-full border-collapse border border-black text-[9px] print:text-[7.5px] leading-tight font-sans service-record-table print:w-full">
            <thead>
              {/* Header Tier 1: Groupings */}
              <tr className="bg-slate-50 text-center font-bold">
                <th colSpan={2} className="border border-black px-1 py-1 print:px-0.5 print:py-0.5">
                  SERVICE<br /><span className="font-normal text-[8.5px] print:text-[7px]">(Inclusive Dates)</span>
                </th>
                <th colSpan={5} className="border border-black px-1 py-1 print:px-0.5 print:py-0.5">
                  RECORD OF APPOINTMENT
                </th>
                <th colSpan={2} className="border border-black px-1 py-1 print:px-0.5 print:py-0.5">
                  OFFICE<br /><span className="font-normal text-[8.5px] print:text-[7px]">Station/Place</span>
                </th>
                <th rowSpan={2} className="border border-black px-1 py-1 print:px-0.5 print:py-0.5 align-middle whitespace-nowrap">
                  BRANCH
                </th>
                <th colSpan={2} className="border border-black px-1 py-1 print:px-0.5 print:py-0.5">
                  LV.AB.<br /><span className="font-normal text-[8.5px] print:text-[7px]">w/o pay</span>
                </th>
                <th colSpan={2} className="border border-black px-1 py-1 print:px-0.5 print:py-0.5">
                  SEPARATION
                </th>
                <th rowSpan={2} className="border border-black px-1 py-1 print:px-0.5 print:py-0.5 align-middle whitespace-nowrap">
                  REMARKS
                </th>
              </tr>

              {/* Header Tier 2: Sub-columns */}
              <tr className="bg-slate-50 text-center font-bold text-[8.5px] print:text-[7px]">
                <th className="border border-black px-1 py-1 print:px-0.5 print:py-0.5">From</th>
                <th className="border border-black px-1 py-1 print:px-0.5 print:py-0.5">To</th>
                <th className="border border-black px-1 py-1 print:px-0.5 print:py-0.5">Designation</th>
                <th className="border border-black px-1 py-1 print:px-0.5 print:py-0.5">Status</th>
                <th className="border border-black px-1 py-1 print:px-0.5 print:py-0.5">Monthly<br />Salary</th>
                <th className="border border-black px-0.5 py-1 print:px-0.5 print:py-0.5">SG</th>
                <th className="border border-black px-0.5 py-1 print:px-0.5 print:py-0.5">S</th>
                <th className="border border-black px-1 py-1 print:px-0.5 print:py-0.5">School/Office<br />Assignment</th>
                <th className="border border-black px-1 py-1 print:px-0.5 print:py-0.5">Remitting Agency</th>
                <th className="border border-black px-1 py-1 print:px-0.5 print:py-0.5">From</th>
                <th className="border border-black px-1 py-1 print:px-0.5 print:py-0.5">To</th>
                <th className="border border-black px-1 py-1 print:px-0.5 print:py-0.5">Date</th>
                <th className="border border-black px-1 py-1 print:px-0.5 print:py-0.5">Cause</th>
              </tr>

              {/* Header Tier 3: Official Column Numbering */}
              <tr className="bg-slate-100 text-center text-[8px] print:text-[6.5px] font-bold">
                <th colSpan={2} className="border border-black py-0.5 print:py-0.5">1</th>
                <th className="border border-black py-0.5 print:py-0.5">2</th>
                <th className="border border-black py-0.5 print:py-0.5">3</th>
                <th className="border border-black py-0.5 print:py-0.5">4</th>
                <th className="border border-black py-0.5 print:py-0.5">5</th>
                <th className="border border-black py-0.5 print:py-0.5"></th>
                <th colSpan={2} className="border border-black py-0.5 print:py-0.5">6</th>
                <th className="border border-black py-0.5 print:py-0.5">7</th>
                <th colSpan={2} className="border border-black py-0.5 print:py-0.5">8</th>
                <th colSpan={2} className="border border-black py-0.5 print:py-0.5">9</th>
                <th className="border border-black py-0.5 print:py-0.5">10</th>
              </tr>
            </thead>

            <tbody>
              {blocks.length === 0 ? (
                <tr>
                  <td colSpan={15} className="border border-black p-4 text-center text-slate-500 italic">
                    No service record history blocks recorded. Click &ldquo;Add Row&rdquo; to insert appointment history.
                  </td>
                </tr>
              ) : (
                blocks.map((block, idx) => {
                  const salaryDisplay = typeof block.monthlySalary === 'number'
                    ? block.monthlySalary.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                    : String(block.monthlySalary || '');

                  return (
                    <tr
                      key={block.id || idx}
                      className="hover:bg-blue-50/50 group text-[8.5px] print:text-[7.5px] transition"
                    >
                      {/* 1. Inclusive Dates (From & To) */}
                      <td className="border border-black px-1 py-1 print:px-0.5 print:py-0.5 text-center font-mono whitespace-nowrap">
                        {block.from || block.dateFrom}
                      </td>
                      <td className="border border-black px-1 py-1 print:px-0.5 print:py-0.5 text-center font-mono whitespace-nowrap">
                        {block.to || block.dateTo}
                      </td>

                      {/* 2. Designation */}
                      <td className="border border-black px-1.5 py-1 print:px-0.5 print:py-0.5 text-left font-semibold uppercase whitespace-nowrap print:whitespace-normal">
                        {block.designation}
                      </td>

                      {/* 3. Status */}
                      <td className="border border-black px-1 py-1 print:px-0.5 print:py-0.5 text-center font-semibold uppercase whitespace-nowrap print:whitespace-normal">
                        {block.status}
                      </td>

                      {/* 4. Monthly Salary */}
                      <td className="border border-black px-1.5 py-1 print:px-0.5 print:py-0.5 text-right font-mono whitespace-nowrap">
                        {salaryDisplay}
                      </td>

                      {/* 5. SG & Step S */}
                      <td className="border border-black px-0.5 py-1 print:px-0.5 print:py-0.5 text-center font-bold">
                        {block.salaryGrade || activePersonnel.salaryGrade || 11}
                      </td>
                      <td className="border border-black px-0.5 py-1 print:px-0.5 print:py-0.5 text-center font-bold">
                        {block.step || 1}
                      </td>

                      {/* 6. Station/Place: School/Office Assignment & Remitting Agency */}
                      <td className="border border-black px-1.5 py-1 print:px-0.5 print:py-0.5 text-left uppercase whitespace-normal break-words font-medium">
                        {block.schoolAssignment || block.station || activePersonnel.schoolStation || 'MANGUSU IS'}
                      </td>
                      <td className="border border-black px-1.5 py-1 print:px-0.5 print:py-0.5 text-left uppercase whitespace-normal break-words text-[8px] print:text-[6.5px]">
                        {block.remittingAgency || activePersonnel.remittingAgency || 'ZAMBOANGA CITY HIGH SCHOOL - 1000030811'}
                      </td>

                      {/* 7. Branch */}
                      <td className="border border-black px-1 py-1 print:px-0.5 print:py-0.5 text-center font-semibold uppercase whitespace-nowrap">
                        {block.branch || 'NAT.'}
                      </td>

                      {/* 8. LV.AB w/o pay (From / To) */}
                      <td className="border border-black px-1 py-1 print:px-0.5 print:py-0.5 text-center font-mono text-[8px] print:text-[6.5px]">
                        {block.lwopFrom || ''}
                      </td>
                      <td className="border border-black px-1 py-1 print:px-0.5 print:py-0.5 text-center font-mono text-[8px] print:text-[6.5px]">
                        {block.lwopTo || ''}
                      </td>

                      {/* 9. Separation (Date / Cause) */}
                      <td className="border border-black px-1 py-1 print:px-0.5 print:py-0.5 text-center font-mono text-[8px] print:text-[6.5px]">
                        {block.separationDate || ''}
                      </td>
                      <td className="border border-black px-1 py-1 print:px-0.5 print:py-0.5 text-center font-sans text-[8px] print:text-[6.5px]">
                        {block.separationCause || (block.separationDateCause !== 'N/A' ? block.separationDateCause : '')}
                      </td>

                      {/* 10. Remarks */}
                      <td className="border border-black px-1.5 py-1 print:px-0.5 print:py-0.5 text-left uppercase font-semibold whitespace-normal break-words relative">
                        <span>{block.remarks || ''}</span>
                        {/* Interactive Edit/Delete buttons on hover (hidden during print) */}
                        <span className="no-print absolute right-1 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 flex items-center gap-1 bg-white/95 px-1 py-0.5 rounded shadow-xs">
                          <button
                            type="button"
                            onClick={() => handleOpenEditModal(block, idx)}
                            className="text-blue-700 hover:text-blue-900 p-0.5"
                            title="Edit row"
                          >
                            <Edit2 className="w-2.5 h-2.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteBlock(idx)}
                            className="text-red-600 hover:text-red-800 p-0.5"
                            title="Delete row"
                          >
                            <Trash2 className="w-2.5 h-2.5" />
                          </button>
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Executive Order No. 54 Certification Footnote */}
        <p className="text-[9.5px] text-center italic mt-2 mb-3 print:mt-1.5 print:mb-2 font-serif">
          Issued in compliance with Executive Order No. 54 dated August 10, 1954 and in accordance with No. 58 dated August 10, 1954 of the system.
        </p>

        {/* Official Signatory Section */}
        <div className="mt-4 sm:mt-5 print:mt-2 flex justify-between items-start font-sans px-2 sm:px-4 print-avoid-break">
          {/* Left: PREPARED BY */}
          <div className="text-left min-w-[220px]">
            <p className="text-[10px] font-bold text-slate-800 uppercase tracking-wide mb-7 print:mb-5">
              PREPARED BY:
            </p>
            <div className="w-52 sm:w-56 border-b border-black mb-1" />
            <p
              onClick={handleOpenSignatoryModal}
              className="font-bold text-[10.5px] uppercase tracking-wide text-black cursor-pointer hover:text-blue-900 transition flex items-center gap-1.5"
              title="Click to edit signatory name"
            >
              <span>{signatoryName}</span>
              <Edit3 className="w-3 h-3 text-blue-700 no-print inline" />
            </p>
            <p className="text-[9.5px] text-slate-700 font-medium">{signatoryTitle}</p>

            <div className="mt-3 print:mt-1.5 flex items-baseline gap-1 text-[9.5px] text-slate-800">
              <span className="font-bold">Date issued:</span>
              <span
                onClick={handleOpenSignatoryModal}
                className="cursor-pointer hover:underline"
                title="Click to edit date issued"
              >
                {dateIssued}
              </span>
            </div>
          </div>

          {/* Right: CERTIFIED CORRECT */}
          <div className="text-left min-w-[240px]">
            <p className="text-[10px] font-bold text-slate-800 uppercase tracking-wide mb-7 print:mb-5">
              CERTIFIED CORRECT :
            </p>
            <div className="w-56 sm:w-60 border-b border-black mb-1" />
            <p
              onClick={handleOpenSignatoryModal}
              className="font-bold text-[10.5px] uppercase tracking-wide text-black cursor-pointer hover:text-blue-900 transition flex items-center gap-1.5"
              title="Click to edit certifier name"
            >
              <span>{certifierName}</span>
              <Edit3 className="w-3 h-3 text-blue-700 no-print inline" />
            </p>
            <p className="text-[9.5px] text-slate-700 font-medium">{certifierTitle}</p>
            <p className="text-[9px] text-slate-600 italic">{certifierOffice}</p>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* EXACT OFFICIAL FOOTER LAYOUT (MATCHING SPECIFICATION IMAGE) */}
        {/* ========================================================================= */}
        <div className="mt-4 sm:mt-6 print:mt-2 pt-2 border-t border-slate-700 font-sans print-avoid-break">
          <div className="flex justify-between items-end gap-3 sm:gap-4">
            
            {/* FOOTER LEFT: Form Code + Division Seal / Banner Logo */}
            <div className="flex flex-col items-start text-left shrink-0">
              {/* Form ID Label positioned flush left above the logo */}
              <div className="text-[9px] text-slate-800 font-mono tracking-tight mb-0.5">
                F-ADM-PER-029.0 09/25/2021
              </div>

              {/* Footer Left Logo: Uploaded Image or Authentic Division Seal */}
              <div
                className="relative group/flogo cursor-pointer shrink-0"
                onClick={() => setIsLogoModalOpen(true)}
                title="Click to upload/change Footer Left Logo (includes seal, address & motto)"
              >
                {footerLeftLogo ? (
                  <img
                    src={footerLeftLogo}
                    alt="Division of Zamboanga City Footer Logo"
                    className="max-h-16 max-w-[320px] sm:max-w-[380px] object-contain object-left"
                  />
                ) : (
                  /* Authentic Vector Division of Zamboanga City Seal */
                  <svg
                    className="w-12 h-12 print:w-11 print:h-11"
                    viewBox="0 0 100 100"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    {/* Red outer ring */}
                    <circle cx="50" cy="50" r="48" fill="#b91c1c" />
                    {/* Inner border */}
                    <circle cx="50" cy="50" r="40" fill="#ffffff" />
                    {/* Inner circle background */}
                    <circle cx="50" cy="50" r="37" fill="#e0f2fe" />

                    {/* Curved Banner Arc Text Mockup */}
                    <path
                      id="topArc"
                      d="M 18,50 A 32,32 0 1,1 82,50"
                      fill="none"
                    />
                    <text fill="#ffffff" fontSize="6.5" fontWeight="bold" letterSpacing="0.5">
                      <textPath href="#topArc" startOffset="50%" textAnchor="middle">
                        REPUBLIC OF THE PHILIPPINES
                      </textPath>
                    </text>

                    {/* Traditional Zamboanga Vinta Boat Sail */}
                    {/* Stripes of Red, White, Blue, Yellow */}
                    <path d="M50 18 L68 46 L50 46 Z" fill="#2563eb" />
                    <path d="M50 18 L32 46 L50 46 Z" fill="#dc2626" />
                    <path d="M42 46 L50 20 L58 46 Z" fill="#facc15" />
                    <path d="M46 46 L50 22 L54 46 Z" fill="#ffffff" />

                    {/* Boat Hull */}
                    <path
                      d="M26 48 C34 56 66 56 74 48 L70 52 C62 58 38 58 30 52 Z"
                      fill="#92400e"
                    />

                    {/* DepEd Text on Sail */}
                    <rect x="36" y="32" width="28" height="8" rx="2" fill="#ffffff" opacity="0.9" />
                    <text x="50" y="38" fill="#1e3a8a" fontSize="6.5" fontWeight="900" textAnchor="middle">
                      DepED
                    </text>

                    {/* Bottom Yellow Ribbon */}
                    <path
                      d="M20 72 C32 84 68 84 80 72 L82 78 C68 92 32 92 18 78 Z"
                      fill="#ca8a04"
                    />
                    <text x="50" y="81" fill="#ffffff" fontSize="5" fontWeight="bold" textAnchor="middle">
                      REGION IX, ZAMBOANGA PENINSULA
                    </text>

                    {/* Outer Decorative Stars */}
                    <polygon points="12,50 13.5,53 17,53 14,55 15,58 12,56 9,58 10,55 7,53 10.5,53" fill="#ffffff" />
                    <polygon points="88,50 89.5,53 93,53 90,55 91,58 88,56 85,58 86,55 83,53 86.5,53" fill="#ffffff" />
                  </svg>
                )}
                {/* Screen-only hover button */}
                <button
                  type="button"
                  className="no-print absolute -top-1 -right-1 bg-white/95 text-[#1e3a8a] hover:bg-blue-50 border border-slate-300 rounded-full p-1 shadow-xs opacity-0 group-hover/flogo:opacity-100 transition"
                  title="Change Footer Left Logo"
                >
                  <Edit3 className="w-2.5 h-2.5" />
                </button>
              </div>
            </div>

            {/* FOOTER RIGHT: ISO 9001:2015 CERTIFIED Emblem (or Uploaded Custom Logo) */}
            <div
              className="relative group/rlogo cursor-pointer shrink-0 text-right"
              onClick={() => setIsLogoModalOpen(true)}
              title="Click to upload/change Footer Right Logo"
            >
              {footerRightLogo ? (
                <img
                  src={footerRightLogo}
                  alt="Official Certification Logo"
                  className="max-h-14 max-w-[190px] object-contain"
                />
              ) : (
                /* Authentic Vector ISO 9001:2015 CERTIFIED Emblem matching uploaded screenshot */
                <div className="flex flex-col items-end min-w-[170px]">
                  {/* Top: ISO 9001:2015 with Blue Horizontal Bar extending to the right */}
                  <div className="flex items-center justify-end gap-1.5 w-full">
                    <span className="font-black text-[#004b99] text-[11px] tracking-tight whitespace-nowrap">
                      ISO 9001:2015
                    </span>
                    <div className="h-[2px] bg-[#004b99] flex-1 max-w-[80px]" />
                  </div>

                  {/* Middle: Big Bold Red "CERTIFIED" */}
                  <div className="font-black text-[#e11d48] text-[22px] tracking-tight leading-none my-0.5 uppercase">
                    CERTIFIED
                  </div>

                  {/* Bottom: Blue Horizontal Bar with "TUV 100 05 4286" at the right */}
                  <div className="flex items-center justify-end gap-1.5 w-full">
                    <div className="h-[2px] bg-[#004b99] flex-1 max-w-[55px]" />
                    <span className="font-extrabold text-[#004b99] text-[9.5px] tracking-tight whitespace-nowrap">
                      TUV 100 05 4286
                    </span>
                  </div>
                </div>
              )}
              {/* Screen-only hover button */}
              <button
                type="button"
                className="no-print absolute -top-2 -left-2 bg-white/95 text-[#1e3a8a] hover:bg-blue-50 border border-slate-300 rounded-full p-1 shadow-xs opacity-0 group-hover/rlogo:opacity-100 transition"
                title="Change Footer Right Logo"
              >
                <Edit3 className="w-2.5 h-2.5" />
              </button>
            </div>

          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* MOBILE / RESPONSIVE CARDS VIEW */}
      {/* ========================================================================= */}
      {viewLayout === 'CARDS' && (
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4 no-print">
          <div className="flex items-center justify-between pb-3 border-b border-slate-200">
            <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
              <Smartphone className="w-4 h-4 text-amber-600" />
              <span>Service Record Entries ({blocks.length})</span>
            </h3>
            <button
              type="button"
              onClick={handleOpenAddModal}
              className="px-3 py-1.5 bg-[#1e3a8a] text-white rounded-lg text-xs font-bold flex items-center gap-1 shadow-xs"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Block</span>
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {blocks.map((block, idx) => (
              <div
                key={block.id || idx}
                className="p-4 rounded-xl border border-slate-200 bg-slate-50 hover:bg-white hover:border-blue-300 transition space-y-2 text-xs"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className="font-bold text-slate-900 text-sm">
                      {block.designation}
                    </span>
                    <span className="ml-2 px-2 py-0.5 bg-blue-100 text-blue-800 rounded font-semibold text-[10px]">
                      {block.status}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => handleOpenEditModal(block, idx)}
                      className="p-1 text-blue-700 hover:bg-blue-50 rounded"
                      title="Edit"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteBlock(idx)}
                      className="p-1 text-red-600 hover:bg-red-50 rounded"
                      title="Delete"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-1 text-[11px] text-slate-600">
                  <div>
                    <span className="text-slate-400">Inclusive Dates:</span>
                    <p className="font-mono font-bold text-slate-800">{block.from} to {block.to}</p>
                  </div>
                  <div>
                    <span className="text-slate-400">Monthly Salary:</span>
                    <p className="font-mono font-bold text-slate-900">
                      ₱{typeof block.monthlySalary === 'number' ? block.monthlySalary.toLocaleString() : block.monthlySalary}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-1 text-[11px] text-slate-600">
                  <div>
                    <span className="text-slate-400">SG / Step:</span>
                    <p className="font-bold text-slate-800">SG {block.salaryGrade || 11} - Step {block.step || 1}</p>
                  </div>
                  <div>
                    <span className="text-slate-400">Remarks:</span>
                    <p className="font-bold text-amber-700">{block.remarks || 'None'}</p>
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-200 text-[11px] text-slate-600">
                  <span className="text-slate-400">Assignment / Station:</span>
                  <p className="font-medium text-slate-800">{block.schoolAssignment || block.station}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* LOGO CUSTOMIZATION & UPLOAD MODAL */}
      {/* ========================================================================= */}
      {isLogoModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 no-print">
          <div className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden text-slate-900 max-h-[92vh] flex flex-col">
            <div className="bg-[#1e3a8a] text-white p-4 sm:p-5 flex items-center justify-between shrink-0">
              <div>
                <h3 className="text-base font-bold flex items-center gap-2">
                  <ImageIcon className="w-5 h-5 text-amber-400" />
                  Customize Service Record Logos &amp; Seals
                </h3>
                <p className="text-xs text-blue-200 mt-0.5">
                  Upload official PNG, JPG, or SVG images for Header, Footer Left, and Footer Right
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsLogoModalOpen(false)}
                className="text-white/80 hover:text-white p-1 rounded-lg text-lg font-bold"
              >
                ✕
              </button>
            </div>

            <div className="p-5 sm:p-6 space-y-5 overflow-y-auto text-xs">
              {logoSuccessMsg && (
                <div className="p-3 bg-emerald-50 border border-emerald-300 rounded-xl text-emerald-800 text-xs font-semibold flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>{logoSuccessMsg}</span>
                </div>
              )}

              {/* 1. Header Logo Card */}
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-[#1e3a8a]" />
                    <span className="font-bold text-slate-900 text-xs">1. Header Logo (Top DepEd Seal)</span>
                  </div>
                  {headerLogo && (
                    <span className="px-2 py-0.5 bg-blue-100 text-blue-800 rounded font-bold text-[10px]">
                      Custom Uploaded
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-slate-600 leading-tight">
                  Positioned at the top center of the Service Record above &ldquo;Republic of the Philippines&rdquo;.
                </p>

                <div className="flex flex-col sm:flex-row items-center gap-4 bg-white p-3 rounded-lg border border-slate-200">
                  <div className="w-16 h-16 bg-slate-100 rounded-lg flex items-center justify-center overflow-hidden border border-slate-200 p-1 shrink-0">
                    {headerLogo ? (
                      <img src={headerLogo} alt="Header Logo Preview" className="w-full h-full object-contain" />
                    ) : (
                      <span className="text-[10px] text-slate-400 font-medium text-center">Default Seal</span>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2 flex-1">
                    <input
                      type="file"
                      ref={headerFileInputRef}
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) handleLogoFileUpload(f, 'header');
                      }}
                      accept="image/*"
                      className="hidden"
                    />
                    <button
                      type="button"
                      onClick={() => headerFileInputRef.current?.click()}
                      className="px-3.5 py-1.5 bg-[#1e3a8a] hover:bg-blue-900 text-white rounded-lg font-bold text-xs flex items-center gap-1.5 shadow-xs transition"
                    >
                      <Upload className="w-3.5 h-3.5" />
                      <span>{headerLogo ? 'Replace Header Logo' : 'Upload Header Logo'}</span>
                    </button>

                    {headerLogo && (
                      <button
                        type="button"
                        onClick={() => handleResetLogo('header')}
                        className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-medium text-xs flex items-center gap-1 border border-slate-300 transition"
                      >
                        <RotateCcw className="w-3 h-3" />
                        <span>Reset to Default</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* 2. Footer Left Logo Card */}
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-red-600" />
                    <span className="font-bold text-slate-900 text-xs">2. Footer Left Logo (Division Seal &amp; Contact Banner)</span>
                  </div>
                  {footerLeftLogo && (
                    <span className="px-2 py-0.5 bg-blue-100 text-blue-800 rounded font-bold text-[10px]">
                      Custom Uploaded
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-slate-600 leading-tight">
                  Positioned at the bottom left below &ldquo;F-ADM-PER-029.0 09/25/2021&rdquo;. Upload your division banner logo (which already includes the seal, Baliwasan Chico address, contact info, and division motto).
                </p>

                <div className="flex flex-col sm:flex-row items-center gap-4 bg-white p-3 rounded-lg border border-slate-200">
                  <div className="w-28 h-16 bg-slate-100 rounded-lg flex items-center justify-center overflow-hidden border border-slate-200 p-1 shrink-0">
                    {footerLeftLogo ? (
                      <img src={footerLeftLogo} alt="Footer Left Preview" className="w-full h-full object-contain" />
                    ) : (
                      <span className="text-[10px] text-slate-400 font-medium text-center">Default Seal</span>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2 flex-1">
                    <input
                      type="file"
                      ref={footerLeftFileInputRef}
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) handleLogoFileUpload(f, 'footerLeft');
                      }}
                      accept="image/*"
                      className="hidden"
                    />
                    <button
                      type="button"
                      onClick={() => footerLeftFileInputRef.current?.click()}
                      className="px-3.5 py-1.5 bg-[#1e3a8a] hover:bg-blue-900 text-white rounded-lg font-bold text-xs flex items-center gap-1.5 shadow-xs transition"
                    >
                      <Upload className="w-3.5 h-3.5" />
                      <span>{footerLeftLogo ? 'Replace Left Logo' : 'Upload Footer Left Logo'}</span>
                    </button>

                    {footerLeftLogo && (
                      <button
                        type="button"
                        onClick={() => handleResetLogo('footerLeft')}
                        className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-medium text-xs flex items-center gap-1 border border-slate-300 transition"
                      >
                        <RotateCcw className="w-3 h-3" />
                        <span>Reset to Default</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* 3. Footer Right Logo Card */}
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-600" />
                    <span className="font-bold text-slate-900 text-xs">3. Footer Right Logo (ISO 9001:2015 Certification Emblem)</span>
                  </div>
                  {footerRightLogo && (
                    <span className="px-2 py-0.5 bg-blue-100 text-blue-800 rounded font-bold text-[10px]">
                      Custom Uploaded
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-slate-600 leading-tight">
                  Positioned at the bottom right. Default is the official ISO 9001:2015 CERTIFIED emblem (TUV 100 05 4286).
                </p>

                <div className="flex flex-col sm:flex-row items-center gap-4 bg-white p-3 rounded-lg border border-slate-200">
                  <div className="w-28 h-16 bg-slate-100 rounded-lg flex items-center justify-center overflow-hidden border border-slate-200 p-1 shrink-0">
                    {footerRightLogo ? (
                      <img src={footerRightLogo} alt="Footer Right Preview" className="w-full h-full object-contain" />
                    ) : (
                      <span className="text-[10px] text-slate-400 font-medium text-center">Default ISO Badge</span>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2 flex-1">
                    <input
                      type="file"
                      ref={footerRightFileInputRef}
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) handleLogoFileUpload(f, 'footerRight');
                      }}
                      accept="image/*"
                      className="hidden"
                    />
                    <button
                      type="button"
                      onClick={() => footerRightFileInputRef.current?.click()}
                      className="px-3.5 py-1.5 bg-[#1e3a8a] hover:bg-blue-900 text-white rounded-lg font-bold text-xs flex items-center gap-1.5 shadow-xs transition"
                    >
                      <Upload className="w-3.5 h-3.5" />
                      <span>{footerRightLogo ? 'Replace Right Logo' : 'Upload Footer Right Logo'}</span>
                    </button>

                    {footerRightLogo && (
                      <button
                        type="button"
                        onClick={() => handleResetLogo('footerRight')}
                        className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-medium text-xs flex items-center gap-1 border border-slate-300 transition"
                      >
                        <RotateCcw className="w-3 h-3" />
                        <span>Reset to Default</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-end shrink-0">
              <button
                type="button"
                onClick={() => setIsLogoModalOpen(false)}
                className="px-5 py-2 bg-[#1e3a8a] hover:bg-blue-900 text-white font-bold rounded-xl text-xs shadow-xs transition"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* ADD / EDIT RECORD BLOCK MODAL */}
      {/* ========================================================================= */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 no-print">
          <div className="w-full max-w-xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden text-slate-900 max-h-[90vh] flex flex-col">
            <div className="bg-[#1e3a8a] text-white p-4 sm:p-5 flex items-center justify-between shrink-0">
              <h3 className="text-sm sm:text-base font-bold flex items-center gap-2">
                <FileCheck2 className="w-4 h-4 text-amber-400" />
                {editingBlockIndex !== null ? 'Edit Service Record Row' : 'Add Service Record Row'}
              </h3>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="text-white/80 hover:text-white font-bold text-lg p-1"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveBlock} className="p-5 space-y-4 text-xs overflow-y-auto">
              {/* Row 1: From & To */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">From Date (MM/DD/YYYY)</label>
                  <input
                    type="text"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                    placeholder="06/14/2019"
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-1.5 text-xs font-mono font-semibold"
                    required
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">To Date (MM/DD/YYYY or PRESENT)</label>
                  <input
                    type="text"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                    placeholder="12/31/2019 or PRESENT"
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-1.5 text-xs font-mono font-semibold"
                    required
                  />
                </div>
              </div>

              {/* Row 2: Designation & Status */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Designation / Position</label>
                  <input
                    type="text"
                    value={designation}
                    onChange={(e) => setDesignation(e.target.value)}
                    placeholder="TEACHER I"
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-1.5 text-xs font-semibold uppercase"
                    required
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Appointment Status</label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-1.5 text-xs font-semibold"
                  >
                    <option value="PERM.">PERM. (Permanent)</option>
                    <option value="PROB.">PROB. (Probationary)</option>
                    <option value="SUBST.">SUBST. (Substitute)</option>
                    <option value="CONT.">CONT. (Contractual)</option>
                    <option value="PROV.">PROV. (Provisional)</option>
                  </select>
                </div>
              </div>

              {/* Row 3: Monthly Salary, SG, Step */}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Monthly Salary (PHP)</label>
                  <input
                    type="text"
                    value={salaryRate}
                    onChange={(e) => setSalaryRate(e.target.value)}
                    placeholder="20,754.00"
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-1.5 text-xs font-mono font-bold"
                    required
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Salary Grade (SG)</label>
                  <input
                    type="number"
                    value={salaryGrade}
                    onChange={(e) => setSalaryGrade(e.target.value)}
                    placeholder="11"
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-1.5 text-xs font-semibold text-center"
                    min="1"
                    max="33"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Step (S)</label>
                  <input
                    type="number"
                    value={stepIncrement}
                    onChange={(e) => setStepIncrement(e.target.value)}
                    placeholder="1"
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-1.5 text-xs font-semibold text-center"
                    min="1"
                    max="8"
                  />
                </div>
              </div>

              {/* Row 4: School Assignment & Remitting Agency */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">School/Office Assignment</label>
                  <input
                    type="text"
                    value={schoolAssignment}
                    onChange={(e) => setSchoolAssignment(e.target.value)}
                    placeholder="MANGUSU IS"
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-1.5 text-xs uppercase"
                    required
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Remitting Agency</label>
                  <input
                    type="text"
                    value={remittingAgency}
                    onChange={(e) => setRemittingAgency(e.target.value)}
                    placeholder="ZAMBOANGA CITY HIGH SCHOOL - 1000030811"
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-1.5 text-xs uppercase text-[11px]"
                    required
                  />
                </div>
              </div>

              {/* Row 5: Branch, Separation, and Remarks */}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Branch</label>
                  <input
                    type="text"
                    value={branch}
                    onChange={(e) => setBranch(e.target.value)}
                    placeholder="NAT."
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-1.5 text-xs font-semibold uppercase"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block font-bold text-slate-700 mb-1">Remarks</label>
                  <input
                    type="text"
                    value={remarks}
                    onChange={(e) => setRemarks(e.target.value)}
                    placeholder="ORIGINAL / SALARY TRANCHE / STEP INCREMENT / MATERNITY LEAVE"
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-1.5 text-xs font-semibold uppercase"
                  />
                </div>
              </div>

              {/* Quick Remarks Presets */}
              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                <span className="text-[10px] text-slate-500 font-medium">Quick presets:</span>
                {['ORIGINAL', 'SALARY TRANCHE', 'STEP INCREMENT', 'MATERNITY LEAVE', 'PROMOTION', 'RECLASSIFICATION'].map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setRemarks(preset)}
                    className="px-2 py-0.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-[10px] font-semibold border border-slate-300 transition"
                  >
                    {preset}
                  </button>
                ))}
              </div>

              {/* Optional LV.AB w/o pay & Separation */}
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2 text-[11px]">
                <span className="font-bold text-slate-700">Optional: Leave Without Pay &amp; Separation Details</span>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-slate-600 mb-0.5">LV.AB w/o pay From Date</label>
                    <input
                      type="text"
                      value={lwopFrom}
                      onChange={(e) => setLwopFrom(e.target.value)}
                      placeholder="e.g. 09/08/2025"
                      className="w-full bg-white border border-slate-300 rounded px-2 py-1 text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-600 mb-0.5">LV.AB w/o pay To Date</label>
                    <input
                      type="text"
                      value={lwopTo}
                      onChange={(e) => setLwopTo(e.target.value)}
                      placeholder="e.g. 12/21/2025"
                      className="w-full bg-white border border-slate-300 rounded px-2 py-1 text-xs"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-slate-600 mb-0.5">Separation Date</label>
                    <input
                      type="text"
                      value={separationDate}
                      onChange={(e) => setSeparationDate(e.target.value)}
                      placeholder="e.g. 12/31/2026"
                      className="w-full bg-white border border-slate-300 rounded px-2 py-1 text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-600 mb-0.5">Separation Cause</label>
                    <input
                      type="text"
                      value={separationCause}
                      onChange={(e) => setSeparationCause(e.target.value)}
                      placeholder="e.g. Transfer to Region"
                      className="w-full bg-white border border-slate-300 rounded px-2 py-1 text-xs"
                    />
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-slate-600 hover:bg-slate-100 font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-[#1e3a8a] hover:bg-blue-900 text-white font-bold flex items-center gap-1.5 shadow-xs transition"
                >
                  <CheckCircle2 className="w-3.5 h-3.5 text-amber-300" />
                  <span>Save Record Row</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* CONFIGURE DOCUMENT SIGNATORIES MODAL */}
      {/* ========================================================================= */}
      {isEditingSignatory && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 no-print">
          <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden text-slate-900">
            <div className="bg-[#1e3a8a] text-white p-4 sm:p-5 flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold flex items-center gap-2">
                  <UserCheck className="w-5 h-5 text-amber-400" />
                  Configure Official Document Signatories
                </h3>
                <p className="text-xs text-blue-200 mt-0.5">
                  DepEd Form F-ADM-PER-029.0 Official Signatures &amp; Date
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsEditingSignatory(false)}
                className="text-white/80 hover:text-white p-1 rounded-lg text-lg font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveSignatories} className="p-6 space-y-4 text-xs">
              {/* Prepared By Section */}
              <div className="p-3.5 bg-blue-50/70 border border-blue-200 rounded-xl space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-blue-950 flex items-center gap-1.5 text-xs">
                    <span className="w-2 h-2 rounded-full bg-blue-600 inline-block" />
                    PREPARED BY (Administrative Officer II)
                  </span>
                  <span className="text-[10px] text-slate-500 font-mono">
                    Account: {currentUser.username}
                  </span>
                </div>

                <div>
                  <label className="block font-bold text-slate-800 mb-1">
                    Complete Official Name of AO II:
                  </label>
                  <input
                    type="text"
                    value={tempSignatoryName}
                    onChange={(e) => setTempSignatoryName(e.target.value)}
                    placeholder="LINUEL B. DE LOS SANTOS"
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-bold text-slate-900 uppercase focus:ring-2 focus:ring-blue-700 outline-none"
                    required
                  />
                  <p className="text-[11px] text-slate-600 mt-1">
                    Enter the complete official civil service name as it will appear on the signature line.
                  </p>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Official Position Designation:
                  </label>
                  <input
                    type="text"
                    value={tempSignatoryTitle}
                    onChange={(e) => setTempSignatoryTitle(e.target.value)}
                    placeholder="Administrative Officer II"
                    className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs text-slate-800 focus:ring-2 focus:ring-blue-700 outline-none"
                    required
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Date Issued (DepEd Document):
                  </label>
                  <input
                    type="text"
                    value={tempDateIssued}
                    onChange={(e) => setTempDateIssued(e.target.value)}
                    placeholder="September 11, 2026"
                    className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs text-slate-800 focus:ring-2 focus:ring-blue-700 outline-none"
                    required
                  />
                </div>
              </div>

              {/* Certified Correct By Section */}
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                <span className="font-bold text-slate-800 flex items-center gap-1.5 text-xs">
                  <span className="w-2 h-2 rounded-full bg-slate-500 inline-block" />
                  CERTIFIED CORRECT (Division Official)
                </span>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Certifying Official Complete Name:
                  </label>
                  <input
                    type="text"
                    value={tempCertifierName}
                    onChange={(e) => setTempCertifierName(e.target.value)}
                    placeholder="AL RAHIMIN T. KENOH, J.D."
                    className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-bold text-slate-900 uppercase focus:ring-2 focus:ring-blue-700 outline-none"
                    required
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                      Official Title:
                    </label>
                    <input
                      type="text"
                      value={tempCertifierTitle}
                      onChange={(e) => setTempCertifierTitle(e.target.value)}
                      placeholder="Division Administrative Officer V"
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs text-slate-800 focus:ring-2 focus:ring-blue-700 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                      Office / Unit:
                    </label>
                    <input
                      type="text"
                      value={tempCertifierOffice}
                      onChange={(e) => setTempCertifierOffice(e.target.value)}
                      placeholder="Chief, Administrative Services"
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs text-slate-800 focus:ring-2 focus:ring-blue-700 outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* Profile Synchronization Option */}
              <label className="flex items-center gap-2 p-2.5 bg-amber-50/80 border border-amber-200 rounded-xl cursor-pointer">
                <input
                  type="checkbox"
                  checked={alsoUpdateProfile}
                  onChange={(e) => setAlsoUpdateProfile(e.target.checked)}
                  className="rounded text-blue-900 focus:ring-blue-800 h-4 w-4"
                />
                <span className="text-[11px] text-amber-950 font-medium leading-tight">
                  Also update my account profile name across the portal (in header, logs, and backups)
                </span>
              </label>

              {signatorySuccessMsg && (
                <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs font-semibold flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span>{signatorySuccessMsg}</span>
                </div>
              )}

              <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={handleResetSignatories}
                  className="px-3 py-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg text-xs font-medium inline-flex items-center gap-1 transition"
                  title="Reset to DepEd Zamboanga City default signatories"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Reset Default</span>
                </button>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsEditingSignatory(false)}
                    className="px-3.5 py-2 rounded-xl text-xs text-slate-600 hover:bg-slate-100 font-medium transition"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 rounded-xl text-xs font-bold bg-[#1e3a8a] hover:bg-blue-900 text-white flex items-center gap-1.5 shadow-xs transition"
                  >
                    <Save className="w-3.5 h-3.5" />
                    <span>Save Signatories</span>
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* EXCEL DOWNLOAD TEMPLATE & GUIDELINES MODAL */}
      {/* ========================================================================= */}
      {isDownloadModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs no-print overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-2xl w-full shadow-2xl border border-slate-200 overflow-hidden my-6">
            {/* Header */}
            <div className="bg-linear-to-r from-emerald-800 via-emerald-700 to-teal-800 text-white p-5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-white/10 rounded-xl">
                  <FileSpreadsheet className="w-6 h-6 text-emerald-200" />
                </div>
                <div>
                  <h3 className="text-base font-bold">Service Record Excel Guide & Templates</h3>
                  <p className="text-xs text-emerald-100">
                    Department of Education &bull; Form 029 Standard Spreadsheet Format
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsDownloadModalOpen(false)}
                className="p-1.5 hover:bg-white/10 rounded-lg text-emerald-100 hover:text-white transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 sm:p-6 space-y-5 max-h-[75vh] overflow-y-auto">
              {/* Instructions banner */}
              <div className="p-4 bg-emerald-50/70 border border-emerald-200 rounded-xl text-xs text-emerald-950 space-y-2">
                <div className="flex items-center gap-2 font-bold text-emerald-900">
                  <Info className="w-4 h-4 text-emerald-700 shrink-0" />
                  <span>How Service Record Excel Upload Works</span>
                </div>
                <p className="text-slate-700 leading-relaxed">
                  You can maintain each personnel’s service history in Microsoft Excel and upload it at any time. The system automatically maps the columns, parses all date variations (MM/DD/YYYY, Excel serial codes, 'Present'), computes salaries, and formats the official Form 029 document.
                </p>
              </div>

              {/* Download Option Cards */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Select a Download Option:
                </h4>

                {/* Option 1: Official DepEd Sample Guide */}
                <div className="p-4 rounded-xl border border-emerald-200 bg-emerald-50/40 hover:bg-emerald-50/80 transition flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm text-slate-900">
                        Official Sample Guide (OMAR, MICHEL FALCASANTOS)
                      </span>
                      <span className="px-2 py-0.5 bg-emerald-600 text-white rounded-full text-[10px] font-bold">
                        Recommended Guide
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 leading-relaxed">
                      Pre-filled with authentic 18-row service history (Teacher I to Teacher III, step increments, SSL tranches, and remarks) matching your division’s official records.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      handleDownloadSampleGuide();
                      setIsDownloadModalOpen(false);
                    }}
                    className="px-4 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-bold inline-flex items-center gap-1.5 shrink-0 shadow-xs transition"
                  >
                    <Download className="w-4 h-4" />
                    <span>Download Guide (.xlsx)</span>
                  </button>
                </div>

                {/* Option 2: Blank Template */}
                <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100/80 transition flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm text-slate-900">
                        Blank Service Record Template
                      </span>
                      <span className="px-2 py-0.5 bg-slate-200 text-slate-700 rounded-full text-[10px] font-bold">
                        Ready for Data Entry
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 leading-relaxed">
                      Clean spreadsheet template containing all official headers, instructions, and column definitions ready for entering new personnel service records.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      handleDownloadBlankTemplate();
                      setIsDownloadModalOpen(false);
                    }}
                    className="px-4 py-2.5 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-bold inline-flex items-center gap-1.5 shrink-0 shadow-xs transition"
                  >
                    <Download className="w-4 h-4" />
                    <span>Download Template (.xlsx)</span>
                  </button>
                </div>

                {/* Option 3: Export Active Personnel */}
                {activePersonnel && (
                  <div className="p-4 rounded-xl border border-blue-200 bg-blue-50/40 hover:bg-blue-50/80 transition flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-slate-900">
                          Export Active: {activePersonnel.lastName}, {activePersonnel.firstName}
                        </span>
                        <span className="px-2 py-0.5 bg-blue-100 text-blue-800 rounded-full text-[10px] font-bold">
                          {blocks.length} Recorded Blocks
                        </span>
                      </div>
                      <p className="text-xs text-slate-600 leading-relaxed">
                        Export this personnel's currently active service history directly into an Excel spreadsheet for backup, external editing, or archiving.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        handleExportActivePersonnel();
                        setIsDownloadModalOpen(false);
                      }}
                      className="px-4 py-2.5 bg-[#1e3a8a] hover:bg-blue-900 text-white rounded-xl text-xs font-bold inline-flex items-center gap-1.5 shrink-0 shadow-xs transition"
                    >
                      <Download className="w-4 h-4" />
                      <span>Export Record (.xlsx)</span>
                    </button>
                  </div>
                )}
              </div>

              {/* Column Structure Reference */}
              <div className="space-y-2 pt-2 border-t border-slate-100">
                <h4 className="text-xs font-bold text-slate-700">Official Template Column Layout:</h4>
                <div className="overflow-x-auto text-[10px] rounded-lg border border-slate-200">
                  <table className="min-w-full divide-y divide-slate-200 bg-white">
                    <thead className="bg-slate-100 text-slate-700 font-bold">
                      <tr>
                        <th className="px-2 py-1.5 text-left">From (Date)</th>
                        <th className="px-2 py-1.5 text-left">To (Date)</th>
                        <th className="px-2 py-1.5 text-left">Designation</th>
                        <th className="px-2 py-1.5 text-left">Status</th>
                        <th className="px-2 py-1.5 text-center">SG</th>
                        <th className="px-2 py-1.5 text-center">Step</th>
                        <th className="px-2 py-1.5 text-right">Monthly Salary</th>
                        <th className="px-2 py-1.5 text-left">Office / Station</th>
                        <th className="px-2 py-1.5 text-left">Leave W/O Pay</th>
                        <th className="px-2 py-1.5 text-left">Remarks</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-600">
                      <tr>
                        <td className="px-2 py-1 font-mono">05/15/2013</td>
                        <td className="px-2 py-1 font-mono">12/31/2013</td>
                        <td className="px-2 py-1 font-semibold text-slate-900">TCH1</td>
                        <td className="px-2 py-1">REG/PERM</td>
                        <td className="px-2 py-1 text-center">11</td>
                        <td className="px-2 py-1 text-center">1</td>
                        <td className="px-2 py-1 text-right font-mono">18,549.00</td>
                        <td className="px-2 py-1">LICOMO ES</td>
                        <td className="px-2 py-1 font-mono">NONE</td>
                        <td className="px-2 py-1 italic">ORIGINAL</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="bg-slate-50 px-6 py-3.5 border-t border-slate-200 flex justify-end">
              <button
                type="button"
                onClick={() => setIsDownloadModalOpen(false)}
                className="px-5 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-xl text-xs font-bold transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* EXCEL IMPORT CONFIRMATION & MAPPING MODAL */}
      {/* ========================================================================= */}
      {isImportModalOpen && parsedExcelData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs no-print overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-3xl w-full shadow-2xl border border-slate-200 overflow-hidden my-6">
            {/* Header */}
            <div className="bg-linear-to-r from-[#1e3a8a] via-blue-900 to-indigo-900 text-white p-5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-white/10 rounded-xl">
                  <UploadCloud className="w-6 h-6 text-blue-200" />
                </div>
                <div>
                  <h3 className="text-base font-bold">Review & Import Service Record Spreadsheet</h3>
                  <p className="text-xs text-blue-200">
                    File: <span className="font-mono text-white">{uploadedFileName}</span> &bull; {parsedExcelData.blocks.length} service row(s) detected
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsImportModalOpen(false);
                  setParsedExcelData(null);
                }}
                className="p-1.5 hover:bg-white/10 rounded-lg text-blue-200 hover:text-white transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 sm:p-6 space-y-5 max-h-[75vh] overflow-y-auto">
              {/* Warnings or notices */}
              {parsedExcelData.warnings.length > 0 && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 space-y-1">
                  <div className="flex items-center gap-2 font-bold text-amber-800">
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                    <span>Spreadsheet Notes ({parsedExcelData.warnings.length}):</span>
                  </div>
                  <ul className="list-disc list-inside space-y-0.5 text-amber-950 pl-2">
                    {parsedExcelData.warnings.slice(0, 4).map((w, idx) => (
                      <li key={idx}>{w}</li>
                    ))}
                    {parsedExcelData.warnings.length > 4 && (
                      <li className="italic">+ {parsedExcelData.warnings.length - 4} more notes</li>
                    )}
                  </ul>
                </div>
              )}

              {/* Personnel Assignment Section */}
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <label className="text-xs font-bold text-slate-800 block">
                      Target Personnel to Apply Records to:
                    </label>
                    <p className="text-[11px] text-slate-500">
                      Detected in spreadsheet: <span className="font-bold text-slate-800">{parsedExcelData.detectedName || 'Not specified'}</span>
                    </p>
                  </div>

                  <select
                    value={targetPersonnelIdForImport}
                    onChange={(e) => setTargetPersonnelIdForImport(e.target.value)}
                    className="bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-900 font-semibold focus:ring-2 focus:ring-blue-600 focus:outline-none max-w-sm w-full"
                  >
                    <optgroup label="Existing Personnel Roster">
                      {effectivePersonnelList.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.lastName}, {p.firstName} {p.middleName || ''} ({p.positionTitle})
                        </option>
                      ))}
                    </optgroup>
                    <optgroup label="Or Create New Profile">
                      <option value="CREATE_NEW">
                        + Create New Personnel Profile for "{parsedExcelData.detectedName || 'New Employee'}"
                      </option>
                    </optgroup>
                  </select>
                </div>

                {/* Import Mode Radio */}
                <div className="pt-3 border-t border-slate-200 flex flex-wrap items-center gap-6">
                  <span className="text-xs font-bold text-slate-700">Import Mode:</span>
                  <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-800 cursor-pointer">
                    <input
                      type="radio"
                      name="importMode"
                      checked={importMode === 'REPLACE'}
                      onChange={() => setImportMode('REPLACE')}
                      className="text-[#1e3a8a] focus:ring-blue-600"
                    />
                    <span>Replace Entire Existing Service History (Recommended)</span>
                  </label>
                  <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-800 cursor-pointer">
                    <input
                      type="radio"
                      name="importMode"
                      checked={importMode === 'APPEND'}
                      onChange={() => setImportMode('APPEND')}
                      className="text-[#1e3a8a] focus:ring-blue-600"
                    />
                    <span>Append to Existing History</span>
                  </label>
                </div>

                {/* Synchronize checkbox */}
                <div className="pt-2">
                  <label className="inline-flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={syncProfileWithLatest}
                      onChange={(e) => setSyncProfileWithLatest(e.target.checked)}
                      className="rounded text-[#1e3a8a] focus:ring-blue-600"
                    />
                    <span>
                      Synchronize personnel master profile with latest service block (Position:{' '}
                      <strong>{parsedExcelData.summary.latestPosition}</strong>, SG:{' '}
                      <strong>{parsedExcelData.summary.latestSG}</strong>, Step:{' '}
                      <strong>{parsedExcelData.summary.latestStep}</strong>)
                    </span>
                  </label>
                </div>
              </div>

              {/* Data Preview Table */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                    Spreadsheet Preview ({parsedExcelData.blocks.length} Rows):
                  </h4>
                  <span className="text-[11px] text-slate-500 font-mono">
                    Span: {parsedExcelData.summary.earliestDate} &rarr; {parsedExcelData.summary.latestDate}
                  </span>
                </div>

                <div className="overflow-x-auto max-h-64 rounded-xl border border-slate-200">
                  <table className="min-w-full divide-y divide-slate-200 text-xs bg-white">
                    <thead className="bg-slate-100 text-slate-700 font-bold sticky top-0">
                      <tr>
                        <th className="px-2.5 py-2 text-left">#</th>
                        <th className="px-2.5 py-2 text-left">From</th>
                        <th className="px-2.5 py-2 text-left">To</th>
                        <th className="px-2.5 py-2 text-left">Designation</th>
                        <th className="px-2.5 py-2 text-left">Status</th>
                        <th className="px-2.5 py-2 text-center">SG</th>
                        <th className="px-2.5 py-2 text-center">Step</th>
                        <th className="px-2.5 py-2 text-right">Monthly Salary</th>
                        <th className="px-2.5 py-2 text-left">Office / Station</th>
                        <th className="px-2.5 py-2 text-left">Remarks</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-700">
                      {parsedExcelData.blocks.map((b, idx) => (
                        <tr key={idx} className="hover:bg-slate-50/80 transition">
                          <td className="px-2.5 py-1.5 font-mono text-slate-400">{idx + 1}</td>
                          <td className="px-2.5 py-1.5 font-mono whitespace-nowrap">{b.from}</td>
                          <td className="px-2.5 py-1.5 font-mono whitespace-nowrap">{b.to}</td>
                          <td className="px-2.5 py-1.5 font-bold text-slate-900 whitespace-nowrap">
                            {b.designation}
                          </td>
                          <td className="px-2.5 py-1.5 whitespace-nowrap">{b.status}</td>
                          <td className="px-2.5 py-1.5 text-center font-mono">{b.salaryGrade || '-'}</td>
                          <td className="px-2.5 py-1.5 text-center font-mono">{b.step || '-'}</td>
                          <td className="px-2.5 py-1.5 text-right font-mono whitespace-nowrap">
                            ₱{typeof b.monthlySalary === 'number' ? b.monthlySalary.toLocaleString('en-US', { minimumFractionDigits: 2 }) : (b.monthlySalary || '0.00')}
                          </td>
                          <td className="px-2.5 py-1.5 max-w-[160px] truncate" title={b.schoolAssignment}>
                            {b.schoolAssignment}
                          </td>
                          <td className="px-2.5 py-1.5 text-[11px] text-slate-500 italic max-w-[160px] truncate" title={b.remarks}>
                            {b.remarks || '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="bg-slate-50 px-6 py-4 border-t border-slate-200 flex items-center justify-between">
              <button
                type="button"
                onClick={() => {
                  setIsImportModalOpen(false);
                  setParsedExcelData(null);
                }}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-200/60 rounded-xl transition"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={handleConfirmExcelImport}
                className="px-6 py-2.5 bg-[#1e3a8a] hover:bg-blue-900 text-white rounded-xl text-xs font-bold inline-flex items-center gap-2 shadow-xs transition"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>
                  Confirm & Apply {parsedExcelData.blocks.length} Rows to{' '}
                  {targetPersonnelIdForImport === 'CREATE_NEW'
                    ? 'New Personnel'
                    : (effectivePersonnelList.find((p) => p.id === targetPersonnelIdForImport)?.lastName || 'Selected Personnel')}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
