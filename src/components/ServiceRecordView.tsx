import React, { useState, useMemo } from 'react';
import {
  FileCheck2,
  Printer,
  Plus,
  Trash2,
  Edit2,
  CheckCircle2,
  Calendar,
  Building,
  DollarSign,
  Download,
  LayoutList,
  Table as TableIcon,
  Smartphone,
} from 'lucide-react';
import { formatPHP } from '../data/ssl2026Tranche';
import { addAuditLog } from '../db/dexie';
import { Personnel, ServiceRecordBlock, UserSession } from '../types';

interface ServiceRecordViewProps {
  personnelList: Personnel[];
  currentUser: UserSession;
  onUpdatePersonnel: (updated: Personnel) => Promise<void>;
}

export const ServiceRecordView: React.FC<ServiceRecordViewProps> = ({
  personnelList,
  currentUser,
  onUpdatePersonnel,
}) => {
  const [selectedPersonnelId, setSelectedPersonnelId] = useState<string>(
    personnelList[0]?.id || ''
  );
  const [viewLayout, setViewLayout] = useState<'TABLE' | 'CARDS'>('TABLE');

  // Add/Edit Record Block Modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingBlockIndex, setEditingBlockIndex] = useState<number | null>(null);

  // Form states
  const [dateFrom, setDateFrom] = useState('2023-01-01');
  const [dateTo, setDateTo] = useState('PRESENT');
  const [designation, setDesignation] = useState('Teacher I');
  const [status, setStatus] = useState('Permanent');
  const [salaryRate, setSalaryRate] = useState('30,024');
  const [station, setStation] = useState('Zamboanga City High School - Main');
  const [branch, setBranch] = useState('National');
  const [lwop, setLwop] = useState('NONE');
  const [separationCause, setSeparationCause] = useState('N/A');

  const activePersonnel = useMemo(() => {
    return (
      personnelList.find((p) => p.id === selectedPersonnelId) ||
      personnelList[0] ||
      null
    );
  }, [personnelList, selectedPersonnelId]);

  const blocks: ServiceRecordBlock[] = activePersonnel?.serviceRecordBlocks || [];

  const handleOpenAddModal = () => {
    setEditingBlockIndex(null);
    setDateFrom('2023-01-01');
    setDateTo('PRESENT');
    setDesignation(activePersonnel?.positionTitle || 'Teacher I');
    setStatus('Permanent');
    setSalaryRate('30,024');
    setStation(activePersonnel?.schoolStation || 'Zamboanga City High School - Main');
    setBranch('National');
    setLwop('NONE');
    setSeparationCause('N/A');
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (block: ServiceRecordBlock, index: number) => {
    setEditingBlockIndex(index);
    setDateFrom(block.dateFrom || block.from || '2023-01-01');
    setDateTo(block.dateTo || block.to || 'PRESENT');
    setDesignation(block.designation);
    setStatus(block.status);
    setSalaryRate(String(block.salaryRate ?? block.monthlySalary ?? 30227));
    setStation(block.placeOfAssignment || block.station || '');
    setBranch(block.branch);
    setLwop(block.lwop || 'NONE');
    setSeparationCause(block.separationCause || block.separationDateCause || 'N/A');
    setIsModalOpen(true);
  };

  const handleDeleteBlock = async (index: number) => {
    if (!activePersonnel) return;
    if (!window.confirm('Delete this service history block?')) return;

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
      `Deleted service history block for ${activePersonnel.lastName}`
    );
  };

  const handleSaveBlock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activePersonnel) return;

    const newBlock: ServiceRecordBlock = {
      id: `SR-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      from: dateFrom,
      to: dateTo,
      dateFrom,
      dateTo,
      designation,
      status,
      monthlySalary: Number(salaryRate.replace(/[^0-9.]/g, '')) || 30024,
      salaryRate: Number(salaryRate.replace(/[^0-9.]/g, '')) || 30024,
      station,
      placeOfAssignment: station,
      branch,
      lwop,
      separationDateCause: separationCause,
      separationCause,
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

  if (!activePersonnel) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-12 text-center max-w-xl mx-auto my-8 shadow-sm space-y-3">
        <FileCheck2 className="w-10 h-10 text-slate-300 mx-auto" />
        <h3 className="text-base font-bold text-slate-800">No Personnel Records in Database</h3>
        <p className="text-xs text-slate-500 leading-relaxed">
          There are no personnel records available to display service history. Add personnel records in the <strong>Personnel Manager (PIMS)</strong> to record appointment histories and print official DepEd Service Records.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Control Header */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm no-print">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <FileCheck2 className="w-6 h-6 text-blue-900" />
              <h2 className="text-lg font-bold text-slate-900">
                Official DepEd Service Records (Executive Order No. 54)
              </h2>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Civil service appointment history, station transfers, promotion milestones, and separation records.
            </p>
          </div>

          <div className="flex items-center gap-2">
            {/* Personnel Switcher */}
            <select
              aria-label="Select Personnel for Service Record"
              value={selectedPersonnelId}
              onChange={(e) => setSelectedPersonnelId(e.target.value)}
              className="bg-slate-50 border border-slate-300 rounded-lg px-3 py-1.5 text-xs text-slate-900 font-semibold focus:ring-1 focus:ring-blue-600 focus:outline-none"
            >
              {personnelList.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.lastName}, {p.firstName} - {p.schoolStation}
                </option>
              ))}
            </select>

            {/* View Layout Switcher */}
            <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-300 text-xs">
              <button
                type="button"
                onClick={() => setViewLayout('TABLE')}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-md transition ${
                  viewLayout === 'TABLE'
                    ? 'bg-white text-blue-900 font-bold shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
                title="View full 11-column table"
              >
                <TableIcon className="w-3 h-3 text-blue-700" />
                <span>Table</span>
              </button>
              <button
                type="button"
                onClick={() => setViewLayout('CARDS')}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-md transition ${
                  viewLayout === 'CARDS'
                    ? 'bg-white text-blue-900 font-bold shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
                title="View responsive mobile card list"
              >
                <Smartphone className="w-3 h-3 text-amber-600" />
                <span>Cards</span>
              </button>
            </div>

            <button
              onClick={handleOpenAddModal}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-900 hover:bg-blue-800 text-white rounded-lg text-xs font-semibold shadow-sm"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Block</span>
            </button>

            <button
              onClick={() => window.print()}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-lg text-xs font-bold shadow-sm"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print</span>
            </button>
          </div>
        </div>
      </div>

      {/* Official DepEd Executive Order No. 54 Form Layout */}
      <div className="bg-white p-8 rounded-xl border border-slate-300 shadow-md font-serif text-slate-900 printable-area max-w-5xl mx-auto">
        {/* Government Letterhead */}
        <div className="text-center leading-tight">
          <p className="text-xs uppercase">Republic of the Philippines</p>
          <p className="text-sm font-bold uppercase mt-0.5">Department of Education</p>
          <p className="text-xs">Region IX, Zamboanga Peninsula</p>
          <p className="text-xs font-bold">SCHOOLS DIVISION OF ZAMBOANGA CITY</p>
          <p className="text-[11px] italic mt-1">Division Administrative &amp; Personnel Section</p>
          <div className="border-b-2 border-slate-900 my-4" />
        </div>

        <h3 className="text-center font-bold text-base uppercase tracking-widest my-2">
          SERVICE RECORD
        </h3>
        <p className="text-center text-[10px] italic text-slate-600 mb-6">
          (Given in compliance with Executive Order No. 54, dated August 10, 1954 and in accordance with Circular No. 58, dated August 10, 1954 of the System)
        </p>

        {/* Biographical Header Table */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-y-2 gap-x-4 text-xs font-sans mb-6 p-4 bg-slate-50/80 rounded border border-slate-200">
          <div>
            <span className="text-slate-500 text-[10.5px] block">NAME:</span>
            <span className="font-bold text-slate-900 uppercase">
              {activePersonnel.lastName}, {activePersonnel.firstName} {activePersonnel.middleName || ''}
            </span>
          </div>
          <div>
            <span className="text-slate-500 text-[10.5px] block">BIRTH DATE &amp; PLACE:</span>
            <span className="font-bold text-slate-900">
              {activePersonnel.dob} / {activePersonnel.pob}
            </span>
          </div>
          <div>
            <span className="text-slate-500 text-[10.5px] block">GSIS BP NUMBER:</span>
            <span className="font-mono font-bold text-slate-900">{activePersonnel.gsisBPNo}</span>
          </div>
          <div>
            <span className="text-slate-500 text-[10.5px] block">TIN / PLANTILLA:</span>
            <span className="font-mono font-bold text-slate-900 text-[11px]">
              {activePersonnel.tin} / {activePersonnel.plantillaItemNo}
            </span>
          </div>
        </div>

        {/* Mobile Swipe Hint */}
        {viewLayout === 'TABLE' && (
          <div className="no-print md:hidden flex items-center justify-between bg-blue-50 border border-blue-200 text-blue-900 text-[11px] px-3 py-2 rounded-lg mb-3">
            <span>👉 Swipe horizontally to view all 11 columns</span>
            <button
              type="button"
              onClick={() => setViewLayout('CARDS')}
              className="font-bold underline text-blue-700 ml-2 shrink-0"
            >
              Switch to Cards
            </button>
          </div>
        )}

        {/* Responsive Card-Based Layout List (Mobile Friendly View) */}
        {viewLayout === 'CARDS' && (
          <div className="no-print space-y-3 mb-6 font-sans">
            <div className="flex items-center justify-between pb-1">
              <span className="text-xs font-bold text-slate-700 uppercase tracking-wide">
                Service History Blocks ({blocks.length})
              </span>
              <button
                type="button"
                onClick={() => setViewLayout('TABLE')}
                className="text-xs text-blue-700 hover:text-blue-900 font-medium"
              >
                View 11-Column Table
              </button>
            </div>

            {blocks.length === 0 ? (
              <div className="p-6 bg-slate-50 border border-dashed border-slate-300 rounded-xl text-center text-slate-400 text-xs italic">
                No service record blocks recorded yet. Click "Add Block" to insert initial appointment history.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {blocks.map((block, idx) => (
                  <div
                    key={idx}
                    className="p-3.5 bg-slate-50/90 hover:bg-white rounded-xl border border-slate-200 hover:border-blue-400 transition shadow-xs text-slate-900 space-y-2"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h4 className="font-bold text-sm text-slate-900 leading-tight">
                          {block.designation}
                        </h4>
                        <span className="text-[11px] font-mono text-blue-700 font-semibold">
                          {block.dateFrom || block.from} &rarr; {block.dateTo || block.to}
                        </span>
                      </div>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 shrink-0 uppercase">
                        {block.status}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-[11px] pt-2 border-t border-slate-200/80">
                      <div>
                        <span className="text-[10px] text-slate-400 block uppercase">Station &amp; Branch</span>
                        <span className="font-medium text-slate-800">
                          {block.placeOfAssignment || block.station} ({block.branch})
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 block uppercase">Monthly Salary</span>
                        <span className="font-mono font-bold text-emerald-700">
                          {formatPHP(block.salaryRate ?? block.monthlySalary ?? 0)}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-slate-200/80 text-[11px] text-slate-500">
                      <div>
                        <span>LWoP: </span>
                        <strong className="text-slate-700 font-mono">{block.lwop || 'NONE'}</strong>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => handleOpenEditModal(block, idx)}
                          className="p-1 text-slate-500 hover:text-blue-700 rounded hover:bg-slate-200 transition"
                          title="Edit Block"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDeleteBlock(idx)}
                          className="p-1 text-slate-500 hover:text-rose-700 rounded hover:bg-slate-200 transition"
                          title="Delete Block"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Service Record Table (Horizontally Scrollable Container) */}
        <div className={`overflow-x-auto w-full scrollbar-thin rounded border border-slate-900 ${
          viewLayout === 'CARDS' ? 'hidden print:block' : 'block'
        }`}>
          <table className="w-full border-collapse border border-slate-900 text-[11px] font-sans">
            <thead>
              <tr className="bg-slate-100 text-center font-bold">
                <th colSpan={2} className="border border-slate-900 py-1.5 px-2">SERVICE (Inclusive Dates)</th>
                <th colSpan={3} className="border border-slate-900 py-1.5 px-2">RECORD OF APPOINTMENT</th>
                <th colSpan={2} className="border border-slate-900 py-1.5 px-2">OFFICE / STATION</th>
                <th rowSpan={2} className="border border-slate-900 py-1.5 px-2">LWoP</th>
                <th colSpan={2} className="border border-slate-900 py-1.5 px-2">SEPARATION</th>
                <th rowSpan={2} className="border border-slate-900 py-1.5 px-2 no-print w-16">Action</th>
              </tr>
              <tr className="bg-slate-50 text-[10px] text-center font-semibold">
                <th className="border border-slate-900 py-1 px-1.5 w-20">From</th>
                <th className="border border-slate-900 py-1 px-1.5 w-20">To</th>
                <th className="border border-slate-900 py-1 px-2">Designation</th>
                <th className="border border-slate-900 py-1 px-1.5 w-20">Status</th>
                <th className="border border-slate-900 py-1 px-1.5 w-24">Salary</th>
                <th className="border border-slate-900 py-1 px-2">Station</th>
                <th className="border border-slate-900 py-1 px-1.5 w-16">Branch</th>
                <th className="border border-slate-900 py-1 px-1.5 w-20">Date</th>
                <th className="border border-slate-900 py-1 px-2">Cause</th>
              </tr>
            </thead>
            <tbody className="text-slate-900">
              {blocks.length === 0 ? (
                <tr>
                  <td colSpan={11} className="p-6 text-center text-slate-400 italic font-serif">
                    No service record blocks recorded yet. Click "Add History Block" above to insert initial appointment history.
                  </td>
                </tr>
              ) : (
                blocks.map((block, idx) => (
                  <tr key={idx} className="hover:bg-slate-50/60">
                    <td className="border border-slate-900 p-1.5 font-mono text-center">{block.dateFrom || block.from}</td>
                    <td className="border border-slate-900 p-1.5 font-mono text-center">{block.dateTo || block.to}</td>
                    <td className="border border-slate-900 p-1.5 font-semibold">{block.designation}</td>
                    <td className="border border-slate-900 p-1.5 text-center">{block.status}</td>
                    <td className="border border-slate-900 p-1.5 text-right font-mono">{formatPHP(block.salaryRate ?? block.monthlySalary ?? 0)}</td>
                    <td className="border border-slate-900 p-1.5">{block.placeOfAssignment || block.station}</td>
                    <td className="border border-slate-900 p-1.5 text-center">{block.branch}</td>
                    <td className="border border-slate-900 p-1.5 text-center font-mono">{block.lwop || 'NONE'}</td>
                    <td className="border border-slate-900 p-1.5 text-center">{block.separationDate || '—'}</td>
                    <td className="border border-slate-900 p-1.5 text-center">{block.separationCause || block.separationDateCause || 'N/A'}</td>
                    <td className="border border-slate-900 p-1 text-center no-print">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => handleOpenEditModal(block, idx)}
                          className="p-1 hover:text-blue-700"
                          title="Edit"
                        >
                          <Edit2 className="w-3 h-3" />
                        </button>
                        <button
                          onClick={() => handleDeleteBlock(idx)}
                          className="p-1 hover:text-rose-700"
                          title="Delete"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* DepEd Executive Order Certification Footer */}
        <div className="mt-8 pt-4 border-t border-slate-900 text-xs font-serif leading-relaxed">
          <p className="text-justify italic">
            Issued in compliance with Executive Order No. 54 dated August 10, 1954 and in accordance with Circular No. 58 dated August 10, 1954 of the System. I HEREBY CERTIFY that the employees named herein has rendered services in this Office as stated above.
          </p>

          <div className="mt-8 flex justify-between items-end font-sans">
            <div className="text-center">
              <p className="text-xs text-slate-500 mb-6">Prepared by:</p>
              <div className="w-48 border-b border-slate-900 mx-auto" />
              <p className="font-bold text-xs mt-1 uppercase">{currentUser.username}</p>
              <p className="text-[10px] text-slate-600">Administrative Officer II / Personnel In-Charge</p>
            </div>

            <div className="text-center">
              <p className="text-xs text-slate-500 mb-6">Certified Correct by:</p>
              <div className="w-56 border-b border-slate-900 mx-auto" />
              <p className="font-bold text-xs mt-1 uppercase">ROY C. TUBALLA, EMD, JD, CESO VI</p>
              <p className="text-[10px] text-slate-600">Schools Division Superintendent</p>
              <p className="text-[9px] text-slate-500">DepEd Division of Zamboanga City</p>
            </div>
          </div>
        </div>
      </div>

      {/* Add / Edit Block Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 no-print">
          <div className="w-full max-w-lg bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden text-slate-900">
            <div className="bg-slate-900 text-white p-4 flex items-center justify-between">
              <h3 className="text-sm font-bold flex items-center gap-2">
                <FileCheck2 className="w-4 h-4 text-amber-400" />
                {editingBlockIndex !== null ? 'Edit Service History Block' : 'Add New Service History Block'}
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-white font-bold"
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleSaveBlock} className="p-5 space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">From Date (YYYY-MM-DD)</label>
                  <input
                    type="text"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded px-2.5 py-1.5 text-xs font-mono"
                    required
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">To Date (or 'PRESENT')</label>
                  <input
                    type="text"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded px-2.5 py-1.5 text-xs font-mono"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Designation / Position</label>
                  <input
                    type="text"
                    value={designation}
                    onChange={(e) => setDesignation(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded px-2.5 py-1.5 text-xs"
                    required
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Status of Appointment</label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded px-2.5 py-1.5 text-xs"
                  >
                    <option value="Permanent">Permanent</option>
                    <option value="Provisional">Provisional</option>
                    <option value="Substitute">Substitute</option>
                    <option value="Contractual">Contractual</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Monthly Salary Rate (PHP)</label>
                  <input
                    type="text"
                    value={salaryRate}
                    onChange={(e) => setSalaryRate(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded px-2.5 py-1.5 text-xs font-mono"
                    required
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Branch</label>
                  <input
                    type="text"
                    value={branch}
                    onChange={(e) => setBranch(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded px-2.5 py-1.5 text-xs"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Place of Assignment / Station</label>
                <input
                  type="text"
                  value={station}
                  onChange={(e) => setStation(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded px-2.5 py-1.5 text-xs"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">LWoP (Leave Without Pay)</label>
                  <input
                    type="text"
                    value={lwop}
                    onChange={(e) => setLwop(e.target.value)}
                    placeholder="NONE or 5 days"
                    className="w-full bg-slate-50 border border-slate-300 rounded px-2.5 py-1.5 text-xs"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Separation Cause</label>
                  <input
                    type="text"
                    value={separationCause}
                    onChange={(e) => setSeparationCause(e.target.value)}
                    placeholder="N/A or Transfer to Region"
                    className="w-full bg-slate-50 border border-slate-300 rounded px-2.5 py-1.5 text-xs"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-3 py-1.5 rounded-lg text-slate-600 hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-lg bg-blue-900 hover:bg-blue-800 text-white font-semibold flex items-center gap-1"
                >
                  <CheckCircle2 className="w-3.5 h-3.5 text-amber-300" />
                  <span>Save Record Block</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
