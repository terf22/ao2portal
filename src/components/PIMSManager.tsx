import React, { useState, useMemo } from 'react';
import {
  Users,
  Search,
  Plus,
  Edit2,
  Trash2,
  Building2,
  Filter,
  CheckCircle2,
  ShieldAlert,
  UserCheck,
  Eye,
  Calendar,
} from 'lucide-react';
import { formatPHP, getSalary } from '../data/ssl2026Tranche';
import { addAuditLog } from '../db/dexie';
import {
  EmploymentStatus,
  Personnel,
  PersonnelType,
  School,
  SchoolProfile,
  UserSession,
  WorkScheduleType,
} from '../types';

interface PIMSManagerProps {
  personnelList: Personnel[];
  currentUser: UserSession;
  stations: string[];
  schools?: School[];
  schoolProfile?: SchoolProfile;
  onAddPersonnel: (personnel: Personnel) => Promise<void>;
  onUpdatePersonnel: (personnel: Personnel) => Promise<void>;
  onDeletePersonnel: (id: string) => Promise<void>;
}

export const PIMSManager: React.FC<PIMSManagerProps> = ({
  personnelList,
  currentUser,
  stations,
  schools,
  schoolProfile,
  onAddPersonnel,
  onUpdatePersonnel,
  onDeletePersonnel,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<'ALL' | 'Teaching' | 'Non-Teaching'>('ALL');
  const [filterStation, setFilterStation] = useState<string>('ALL');

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingPersonnel, setEditingPersonnel] = useState<Personnel | null>(null);
  const [viewingPersonnel, setViewingPersonnel] = useState<Personnel | null>(null);

  // Form Fields
  const [formData, setFormData] = useState<Partial<Personnel>>({
    id: '',
    lastName: '',
    firstName: '',
    middleName: '',
    extensionName: '',
    positionTitle: 'Teacher I',
    plantillaItemNo: '',
    tin: '',
    dob: '1992-05-15',
    pob: '',
    schoolStation: schoolProfile?.schoolName || stations[0] || '',
    gsisBPNo: '',
    personnelType: 'Teaching',
    employmentStatus: 'Permanent',
    workSchedule: 'Teaching',
    stepIncrement: 1,
    salaryGrade: 11,
    lastPromotionDate: '2023-01-01',
    lastStepIncrementDate: '2023-01-01',
    continuousServiceStart: '2023-01-01',
    lwopDays: 0,
    maternityLeaveDays: 0,
  });

  const filteredList = useMemo(() => {
    return personnelList.filter((p) => {
      const matchType = filterType === 'ALL' || p.personnelType === filterType;
      const matchStation = filterStation === 'ALL' || p.schoolStation === filterStation;
      const term = searchTerm.toLowerCase();
      const matchSearch =
        searchTerm === '' ||
        p.lastName.toLowerCase().includes(term) ||
        p.firstName.toLowerCase().includes(term) ||
        p.id.toLowerCase().includes(term) ||
        p.positionTitle.toLowerCase().includes(term) ||
        p.plantillaItemNo.toLowerCase().includes(term);

      return matchType && matchStation && matchSearch;
    });
  }, [personnelList, filterType, filterStation, searchTerm]);

  const handleOpenAdd = () => {
    const generatedId = `DEPED-ZC-${Math.floor(100000 + Math.random() * 900000)}`;
    setEditingPersonnel(null);
    setFormData({
      id: generatedId,
      lastName: '',
      firstName: '',
      middleName: '',
      extensionName: '',
      positionTitle: 'Teacher I',
      plantillaItemNo: '',
      tin: '',
      dob: '1992-05-15',
      pob: '',
      schoolStation: schoolProfile?.schoolName || stations[0] || '',
      schoolId: schoolProfile?.schoolId || '',
      gsisBPNo: '',
      personnelType: 'Teaching',
      employmentStatus: 'Permanent',
      workSchedule: 'Teaching',
      stepIncrement: 1,
      salaryGrade: 11,
      lastPromotionDate: '2023-01-01',
      lastStepIncrementDate: '2023-01-01',
      continuousServiceStart: '2023-01-01',
      serviceCredits: 0,
      vacationLeaveCredits: 0,
      sickLeaveCredits: 0,
      lwopDays: 0,
      maternityLeaveDays: 0,
    });
    setIsModalOpen(true);
  };

  const handleOpenEdit = (p: Personnel) => {
    setEditingPersonnel(p);
    setFormData({ ...p });
    setIsModalOpen(true);
  };

  const handleDelete = async (p: Personnel) => {
    if (
      !window.confirm(
        `Are you sure you want to delete ${p.lastName}, ${p.firstName} (${p.id})? This cannot be undone.`
      )
    ) {
      return;
    }

    await onDeletePersonnel(p.id);
    await addAuditLog(
      currentUser.username,
      currentUser.role,
      'SECURITY',
      'PERSONNEL_DELETE',
      `Deleted personnel profile ${p.lastName}, ${p.firstName} (${p.id})`
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const pType = formData.personnelType || 'Teaching';
    const sched = pType === 'Teaching' ? 'Teaching' : 'Non-Teaching';

    const stName = formData.schoolStation || schoolProfile?.schoolName || stations[0] || '';
    const matchedSchool = schools?.find((s) => s.name === stName);
    const sId = formData.schoolId || matchedSchool?.id || schoolProfile?.schoolId || '';

    const fullRecord: Personnel = {
      id: formData.id || `DEPED-${Date.now().toString(36).toUpperCase()}`,
      lastName: formData.lastName || '',
      firstName: formData.firstName || '',
      middleName: formData.middleName || '',
      extensionName: formData.extensionName || '',
      positionTitle: formData.positionTitle || 'Teacher I',
      plantillaItemNo: formData.plantillaItemNo || '',
      tin: formData.tin || '',
      dob: formData.dob || '1990-01-01',
      pob: formData.pob || '',
      schoolId: sId,
      schoolStation: stName,
      gsisBPNo: formData.gsisBPNo || '',
      personnelType: pType as PersonnelType,
      employmentStatus: (formData.employmentStatus || 'Permanent') as EmploymentStatus,
      workSchedule: sched as WorkScheduleType,
      stepIncrement: Number(formData.stepIncrement) || 1,
      salaryGrade: Number(formData.salaryGrade) || 11,
      lastPromotionDate: formData.lastPromotionDate || '2023-01-01',
      lastStepIncrementDate: formData.lastStepIncrementDate || '2023-01-01',
      continuousServiceStart: formData.continuousServiceStart || '2023-01-01',
      serviceCredits: formData.serviceCredits ?? (pType === 'Teaching' ? 5 : 0),
      vacationLeaveCredits: formData.vacationLeaveCredits ?? (pType === 'Non-Teaching' ? 5 : 0),
      sickLeaveCredits: formData.sickLeaveCredits ?? (pType === 'Non-Teaching' ? 5 : 0),
      leaveLedger: editingPersonnel?.leaveLedger || [],
      serviceRecordBlocks: editingPersonnel?.serviceRecordBlocks || [],
      dtrLogs: editingPersonnel?.dtrLogs || {},
      lwopDays: Number(formData.lwopDays) || 0,
      maternityLeaveDays: Number(formData.maternityLeaveDays) || 0,
      updatedAt: Date.now(),
    };

    if (editingPersonnel) {
      await onUpdatePersonnel(fullRecord);
      await addAuditLog(
        currentUser.username,
        currentUser.role,
        'SECURITY',
        'PERSONNEL_UPDATE',
        `Updated PIMS profile for ${fullRecord.lastName}, ${fullRecord.firstName}`
      );
    } else {
      await onAddPersonnel(fullRecord);
      await addAuditLog(
        currentUser.username,
        currentUser.role,
        'SECURITY',
        'PERSONNEL_CREATE',
        `Created new personnel profile for ${fullRecord.lastName}, ${fullRecord.firstName} (${fullRecord.id})`
      );
    }

    setIsModalOpen(false);
  };

  return (
    <div className="space-y-6">
      {/* Header Controls */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Users className="w-6 h-6 text-blue-900" />
              <h2 className="text-lg font-bold text-slate-900">
                Personnel Information Management System (PIMS)
              </h2>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Official school-level DepEd Zamboanga Division personnel records, plantilla, and civil service profiles.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleOpenAdd}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-blue-900 hover:bg-blue-800 text-white rounded-lg text-xs font-bold shadow-sm transition"
            >
              <Plus className="w-4 h-4 text-amber-300" />
              <span>Add Personnel</span>
            </button>
          </div>
        </div>

        {/* Filter Bar */}
        <div className="mt-4 pt-4 border-t border-slate-100 flex flex-wrap items-center gap-3">
          {/* Search Input */}
          <div className="relative flex-1 min-w-[220px]">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search by name, ID, position, plantilla..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs focus:ring-1 focus:ring-blue-600 focus:outline-none text-slate-900"
            />
          </div>

          {/* Type Filter */}
          <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg border border-slate-200 text-xs">
            {(['ALL', 'Teaching', 'Non-Teaching'] as const).map((type) => (
              <button
                key={type}
                onClick={() => setFilterType(type)}
                className={`px-3 py-1 rounded-md transition ${
                  filterType === type
                    ? 'bg-white text-blue-900 font-bold shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {type}
              </button>
            ))}
          </div>

          {/* Station Filter */}
          <div className="flex items-center gap-1.5">
            <Building2 className="w-4 h-4 text-slate-400" />
            <select
              aria-label="Filter by School Station"
              value={filterStation}
              onChange={(e) => setFilterStation(e.target.value)}
              className="bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 font-medium focus:ring-1 focus:ring-blue-600 focus:outline-none"
            >
              <option value="ALL">All Stations ({stations.length})</option>
              {stations.map((st) => (
                <option key={st} value={st}>
                  {st}
                </option>
              ))}
            </select>
          </div>

          <span className="text-xs text-slate-500 ml-auto">
            Showing <strong>{filteredList.length}</strong> of {personnelList.length} records
          </span>
        </div>
      </div>

      {/* Personnel Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200">
                <th className="p-3">Employee ID &amp; Name</th>
                <th className="p-3">Position Title</th>
                <th className="p-3">Type &amp; Station</th>
                <th className="p-3">Salary Grade</th>
                <th className="p-3">Gov Identifiers</th>
                <th className="p-3">Continuous Start</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-900">
              {filteredList.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-slate-400">
                    No matching personnel found for current search/filters.
                  </td>
                </tr>
              ) : (
                filteredList.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="p-3">
                      <div className="font-bold text-slate-900">
                        {p.lastName}, {p.firstName} {p.middleName ? p.middleName[0] + '.' : ''} {p.extensionName || ''}
                      </div>
                      <div className="text-[11px] text-slate-400 font-mono">{p.id}</div>
                    </td>
                    <td className="p-3">
                      <span className="font-semibold text-slate-800">{p.positionTitle}</span>
                      <div className="text-[10.5px] text-slate-500">{p.employmentStatus}</div>
                    </td>
                    <td className="p-3">
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-[10px] font-semibold mb-0.5 ${
                          p.personnelType === 'Teaching'
                            ? 'bg-blue-100 text-blue-800'
                            : 'bg-purple-100 text-purple-800'
                        }`}
                      >
                        {p.personnelType}
                      </span>
                      <div className="text-[11px] text-slate-600 truncate max-w-[180px]">
                        {p.schoolStation}
                      </div>
                    </td>
                    <td className="p-3">
                      <div className="font-mono font-bold text-slate-900">
                        SG {p.salaryGrade} Step {p.stepIncrement}
                      </div>
                      <div className="text-[11px] text-emerald-700 font-mono">
                        {formatPHP(getSalary(p.salaryGrade, p.stepIncrement))}
                      </div>
                    </td>
                    <td className="p-3 text-[11px] font-mono text-slate-600">
                      <div>TIN: {p.tin}</div>
                      <div>BP: {p.gsisBPNo}</div>
                    </td>
                    <td className="p-3 font-mono text-[11px] text-slate-700">
                      {p.continuousServiceStart}
                    </td>
                    <td className="p-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => setViewingPersonnel(p)}
                          className="p-1.5 rounded hover:bg-slate-100 text-slate-600 hover:text-slate-900"
                          title="View Profile Details"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleOpenEdit(p)}
                          className="p-1.5 rounded hover:bg-blue-50 text-blue-600 hover:text-blue-900"
                          title="Edit Personnel Record"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDelete(p)}
                          className="p-1.5 rounded hover:bg-rose-50 text-rose-600 hover:text-rose-900"
                          title="Delete Personnel"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* View Profile Modal Drawer */}
      {viewingPersonnel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-lg bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden text-slate-900">
            <div className="bg-slate-900 text-white p-4 flex items-center justify-between">
              <h3 className="text-sm font-bold flex items-center gap-2">
                <UserCheck className="w-4 h-4 text-amber-400" />
                DepEd Personnel Profile — {viewingPersonnel.lastName}, {viewingPersonnel.firstName}
              </h3>
              <button
                onClick={() => setViewingPersonnel(null)}
                className="text-slate-400 hover:text-white font-bold"
              >
                &times;
              </button>
            </div>

            <div className="p-6 space-y-4 text-xs">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div>
                  <h4 className="text-base font-bold text-slate-900">
                    {viewingPersonnel.lastName}, {viewingPersonnel.firstName} {viewingPersonnel.middleName || ''} {viewingPersonnel.extensionName || ''}
                  </h4>
                  <p className="text-slate-500">{viewingPersonnel.positionTitle} &bull; {viewingPersonnel.schoolStation}</p>
                </div>
                <span className="px-2.5 py-1 rounded-full bg-blue-100 text-blue-900 font-bold font-mono">
                  {viewingPersonnel.id}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3 bg-slate-50 p-3 rounded-lg border border-slate-200">
                <div>
                  <span className="text-[11px] text-slate-500 block">Salary Grade &amp; Step</span>
                  <span className="font-bold text-slate-900">
                    SG {viewingPersonnel.salaryGrade} Step {viewingPersonnel.stepIncrement} (
                    {formatPHP(getSalary(viewingPersonnel.salaryGrade, viewingPersonnel.stepIncrement))})
                  </span>
                </div>
                <div>
                  <span className="text-[11px] text-slate-500 block">Work Schedule</span>
                  <span className="font-bold text-slate-900">
                    {viewingPersonnel.workSchedule} (
                    {viewingPersonnel.personnelType === 'Teaching' ? '7:30-11:30 / 12:30-4:30' : '8:00-12:00 / 1:00-5:00'})
                  </span>
                </div>
                <div>
                  <span className="text-[11px] text-slate-500 block">Plantilla Item Number</span>
                  <span className="font-mono text-slate-800">{viewingPersonnel.plantillaItemNo}</span>
                </div>
                <div>
                  <span className="text-[11px] text-slate-500 block">Employment Status</span>
                  <span className="font-semibold text-slate-800">{viewingPersonnel.employmentStatus}</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <span className="text-slate-500 block">TIN:</span>
                  <span className="font-mono font-bold text-slate-800">{viewingPersonnel.tin}</span>
                </div>
                <div>
                  <span className="text-slate-500 block">GSIS BP No:</span>
                  <span className="font-mono font-bold text-slate-800">{viewingPersonnel.gsisBPNo}</span>
                </div>
                <div>
                  <span className="text-slate-500 block">Birth Date &amp; Place:</span>
                  <span className="text-slate-800">{viewingPersonnel.dob} ({viewingPersonnel.pob})</span>
                </div>
                <div>
                  <span className="text-slate-500 block">Continuous Service Start:</span>
                  <span className="font-mono text-slate-800">{viewingPersonnel.continuousServiceStart}</span>
                </div>
              </div>

              <div className="p-3 bg-blue-50/70 rounded-lg border border-blue-200 text-[11px] text-blue-950">
                <strong>Leave Balances:</strong>{' '}
                {viewingPersonnel.personnelType === 'Teaching'
                  ? `Service Credits: ${viewingPersonnel.serviceCredits || 0} days`
                  : `VL: ${viewingPersonnel.vacationLeaveCredits || 0} days | SL: ${viewingPersonnel.sickLeaveCredits || 0} days`}
              </div>

              <div className="flex justify-end pt-2">
                <button
                  onClick={() => setViewingPersonnel(null)}
                  className="px-4 py-1.5 bg-slate-900 text-white font-semibold rounded-lg"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add / Edit Personnel Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 overflow-y-auto">
          <div className="w-full max-w-2xl bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden text-slate-900 my-8">
            <div className="bg-slate-900 text-white p-4 flex items-center justify-between">
              <h3 className="text-sm font-bold flex items-center gap-2">
                <Users className="w-4 h-4 text-amber-400" />
                {editingPersonnel ? 'Edit Personnel Record' : 'Register New DepEd Personnel'}
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-white font-bold"
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs">
              {/* Biographical Details */}
              <div>
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-2">
                  1. Biographical Details
                </span>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-0.5">
                      Last Name *
                    </label>
                    <input
                      type="text"
                      value={formData.lastName || ''}
                      onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                      className="w-full bg-slate-50 border border-slate-300 rounded px-2.5 py-1.5 text-xs font-semibold"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-0.5">
                      First Name *
                    </label>
                    <input
                      type="text"
                      value={formData.firstName || ''}
                      onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                      className="w-full bg-slate-50 border border-slate-300 rounded px-2.5 py-1.5 text-xs font-semibold"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-0.5">
                      Middle Name
                    </label>
                    <input
                      type="text"
                      value={formData.middleName || ''}
                      onChange={(e) => setFormData({ ...formData, middleName: e.target.value })}
                      className="w-full bg-slate-50 border border-slate-300 rounded px-2.5 py-1.5 text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-0.5">
                      Ext. (Jr., III)
                    </label>
                    <input
                      type="text"
                      value={formData.extensionName || ''}
                      onChange={(e) => setFormData({ ...formData, extensionName: e.target.value })}
                      className="w-full bg-slate-50 border border-slate-300 rounded px-2.5 py-1.5 text-xs"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 mt-2">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-0.5">
                      Date of Birth
                    </label>
                    <input
                      type="date"
                      value={formData.dob || '1992-05-15'}
                      onChange={(e) => setFormData({ ...formData, dob: e.target.value })}
                      className="w-full bg-slate-50 border border-slate-300 rounded px-2.5 py-1.5 text-xs font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-0.5">
                      Place of Birth
                    </label>
                    <input
                      type="text"
                      value={formData.pob || 'Zamboanga City'}
                      onChange={(e) => setFormData({ ...formData, pob: e.target.value })}
                      className="w-full bg-slate-50 border border-slate-300 rounded px-2.5 py-1.5 text-xs"
                    />
                  </div>
                </div>
              </div>

              {/* Station, Position, & Appointment */}
              <div className="pt-2 border-t border-slate-200">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-2">
                  2. Position, Station, &amp; Plantilla Item
                </span>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-0.5">
                      Position Title *
                    </label>
                    <input
                      type="text"
                      value={formData.positionTitle || ''}
                      onChange={(e) => setFormData({ ...formData, positionTitle: e.target.value })}
                      className="w-full bg-slate-50 border border-slate-300 rounded px-2.5 py-1.5 text-xs font-semibold"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-0.5">
                      School Station *
                    </label>
                    <select
                      value={formData.schoolStation}
                      onChange={(e) => setFormData({ ...formData, schoolStation: e.target.value })}
                      className="w-full bg-slate-50 border border-slate-300 rounded px-2.5 py-1.5 text-xs"
                    >
                      {stations.map((st) => (
                        <option key={st} value={st}>
                          {st}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-0.5">
                      Personnel Type
                    </label>
                    <select
                      value={formData.personnelType}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          personnelType: e.target.value as PersonnelType,
                          workSchedule: e.target.value === 'Teaching' ? 'Teaching' : 'Non-Teaching',
                        })
                      }
                      className="w-full bg-slate-50 border border-slate-300 rounded px-2.5 py-1.5 text-xs font-semibold"
                    >
                      <option value="Teaching">Teaching</option>
                      <option value="Non-Teaching">Non-Teaching</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-2">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-0.5">
                      Plantilla Item No.
                    </label>
                    <input
                      type="text"
                      value={formData.plantillaItemNo || ''}
                      onChange={(e) => setFormData({ ...formData, plantillaItemNo: e.target.value })}
                      className="w-full bg-slate-50 border border-slate-300 rounded px-2.5 py-1.5 text-xs font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-0.5">
                      Employment Status
                    </label>
                    <select
                      value={formData.employmentStatus}
                      onChange={(e) =>
                        setFormData({ ...formData, employmentStatus: e.target.value as EmploymentStatus })
                      }
                      className="w-full bg-slate-50 border border-slate-300 rounded px-2.5 py-1.5 text-xs"
                    >
                      <option value="Permanent">Permanent</option>
                      <option value="Provisional">Provisional</option>
                      <option value="Substitute">Substitute</option>
                      <option value="ContractOfService">Contract of Service / JO</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-0.5">
                      Work Schedule
                    </label>
                    <select
                      value={formData.workSchedule}
                      onChange={(e) =>
                        setFormData({ ...formData, workSchedule: e.target.value as WorkScheduleType })
                      }
                      className="w-full bg-slate-50 border border-slate-300 rounded px-2.5 py-1.5 text-xs"
                    >
                      <option value="Teaching">Teaching (7:30-11:30 / 12:30-4:30)</option>
                      <option value="Non-Teaching">Non-Teaching (8:00-12:00 / 1:00-5:00)</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Salary Grade & Statutory Service Dates */}
              <div className="pt-2 border-t border-slate-200">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-2">
                  3. Compensation &amp; Continuous Service Timers
                </span>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-0.5">
                      Salary Grade (1-33)
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={33}
                      value={formData.salaryGrade || 11}
                      onChange={(e) => setFormData({ ...formData, salaryGrade: Number(e.target.value) })}
                      className="w-full bg-slate-50 border border-slate-300 rounded px-2.5 py-1.5 text-xs font-mono font-bold"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-0.5">
                      Step Increment (1-8)
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={8}
                      value={formData.stepIncrement || 1}
                      onChange={(e) => setFormData({ ...formData, stepIncrement: Number(e.target.value) })}
                      className="w-full bg-slate-50 border border-slate-300 rounded px-2.5 py-1.5 text-xs font-mono font-bold"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-0.5">
                      Continuous Start
                    </label>
                    <input
                      type="date"
                      value={formData.continuousServiceStart || '2023-01-01'}
                      onChange={(e) => setFormData({ ...formData, continuousServiceStart: e.target.value })}
                      className="w-full bg-slate-50 border border-slate-300 rounded px-2.5 py-1.5 text-xs font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-0.5">
                      Last Step Increment
                    </label>
                    <input
                      type="date"
                      value={formData.lastStepIncrementDate || '2023-01-01'}
                      onChange={(e) => setFormData({ ...formData, lastStepIncrementDate: e.target.value })}
                      className="w-full bg-slate-50 border border-slate-300 rounded px-2.5 py-1.5 text-xs font-mono"
                    />
                  </div>
                </div>
              </div>

              {/* Identifiers */}
              <div className="pt-2 border-t border-slate-200">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-2">
                  4. Government Numbers
                </span>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-0.5">
                      TIN (Tax Identification Number)
                    </label>
                    <input
                      type="text"
                      value={formData.tin || ''}
                      onChange={(e) => setFormData({ ...formData, tin: e.target.value })}
                      className="w-full bg-slate-50 border border-slate-300 rounded px-2.5 py-1.5 text-xs font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-0.5">
                      GSIS BP Number
                    </label>
                    <input
                      type="text"
                      value={formData.gsisBPNo || ''}
                      onChange={(e) => setFormData({ ...formData, gsisBPNo: e.target.value })}
                      className="w-full bg-slate-50 border border-slate-300 rounded px-2.5 py-1.5 text-xs font-mono"
                    />
                  </div>
                </div>
              </div>

              {/* Submit Buttons */}
              <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-3.5 py-1.5 rounded-lg text-slate-600 hover:bg-slate-100 font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-lg bg-blue-900 hover:bg-blue-800 text-white font-bold transition shadow-sm flex items-center gap-1.5"
                >
                  <CheckCircle2 className="w-4 h-4 text-amber-300" />
                  <span>{editingPersonnel ? 'Save Changes' : 'Register Personnel'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
