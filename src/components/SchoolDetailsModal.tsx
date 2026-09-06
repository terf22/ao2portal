import React, { useState } from 'react';
import {
  Building2,
  X,
  CheckCircle2,
  AlertCircle,
  Save,
  MapPin,
  User,
  Shield,
  Phone,
  Mail,
  RefreshCw,
} from 'lucide-react';
import { SchoolProfile } from '../types';

interface SchoolDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentProfile: SchoolProfile;
  onSave: (updated: SchoolProfile) => Promise<void>;
}

export const SchoolDetailsModal: React.FC<SchoolDetailsModalProps> = ({
  isOpen,
  onClose,
  currentProfile,
  onSave,
}) => {
  const [formData, setFormData] = useState<SchoolProfile>({ ...currentProfile });
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Sync formData whenever modal is opened
  React.useEffect(() => {
    if (isOpen) {
      setFormData({ ...currentProfile });
      setErrorMessage(null);
      setSaveSuccess(false);
    }
  }, [isOpen, currentProfile]);

  if (!isOpen) return null;

  const isFirstTime = !currentProfile.schoolName?.trim() || !currentProfile.schoolId?.trim();

  const handleChange = (field: keyof SchoolProfile, value: string) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const trimmedName = formData.schoolName.trim();
    const trimmedId = formData.schoolId.trim();
    const trimmedHead = formData.schoolHeadName.trim();

    if (!trimmedName) {
      setErrorMessage('Official School Name is required.');
      return;
    }
    if (!trimmedId) {
      setErrorMessage('DepEd School ID is required.');
      return;
    }
    if (!/^\d{6}$/.test(trimmedId)) {
      setErrorMessage('DepEd School ID must be an official 6-digit numeric identifier (e.g., 301234, 125601).');
      return;
    }
    if (!trimmedHead) {
      setErrorMessage('School Head / Principal Name is required (used for Form 48 signatures).');
      return;
    }

    setIsSaving(true);
    try {
      await onSave({
        ...formData,
        schoolName: trimmedName,
        schoolId: trimmedId,
        district: formData.district.trim() || 'Central District',
        division: formData.division.trim() || 'Schools Division Office',
        region: formData.region.trim() || 'DepEd Region',
        schoolHeadName: trimmedHead,
        schoolHeadPosition: formData.schoolHeadPosition.trim() || 'School Principal',
        address: formData.address.trim(),
        contactEmail: formData.contactEmail?.trim() || '',
        contactNumber: formData.contactNumber?.trim() || '',
      });
      setSaveSuccess(true);
      setTimeout(() => {
        setIsSaving(false);
        onClose();
      }, 700);
    } catch (err) {
      setIsSaving(false);
      setErrorMessage(`Failed to save school details: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200 my-8">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-900 to-blue-800 text-white px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-blue-700/60 rounded-lg">
              <Building2 className="w-5 h-5 text-amber-300" />
            </div>
            <div>
              <h3 className="text-base font-bold leading-tight">
                {isFirstTime ? 'Setup Your School Station Details' : 'Configure School Details'}
              </h3>
              <p className="text-xs text-blue-200 mt-0.5">
                {isFirstTime
                  ? 'First-time setup: Enter your official DepEd school ID, name, and approving principal'
                  : 'Official station profile, DepEd School ID, and approving principal credentials'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-blue-200 hover:text-white hover:bg-blue-700/50 transition"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {isFirstTime && (
            <div className="p-3.5 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-900 flex items-start gap-2.5">
              <Building2 className="w-4 h-4 text-blue-700 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold">Welcome! Please initialize your school details.</p>
                <p className="text-blue-700 mt-0.5 leading-relaxed">
                  Default sample data has been cleared. Enter your school station details below to automatically configure your portal, personnel records, and official Civil Service Form 48 Daily Time Records.
                </p>
              </div>
            </div>
          )}

          {errorMessage && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-xs text-red-800">
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {saveSuccess && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center gap-2 text-xs text-emerald-800">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>School details updated successfully! Initializing station records...</span>
            </div>
          )}

          {/* Section 1: Official School Identity */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
              <Building2 className="w-3.5 h-3.5 text-blue-600" />
              <span>School Identity &amp; Government Codes</span>
            </h4>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="md:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Official School Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formData.schoolName}
                  onChange={(e) => handleChange('schoolName', e.target.value)}
                  placeholder="e.g., Central Elementary School / National High School"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-medium text-slate-900 focus:bg-white focus:ring-2 focus:ring-blue-600 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  DepEd School ID <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  maxLength={6}
                  value={formData.schoolId}
                  onChange={(e) => handleChange('schoolId', e.target.value)}
                  placeholder="6-digit ID (e.g., 301234)"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-mono font-bold text-blue-900 focus:bg-white focus:ring-2 focus:ring-blue-600 focus:outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  District Assignment <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formData.district}
                  onChange={(e) => handleChange('district', e.target.value)}
                  placeholder="e.g., Central District"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-900 focus:bg-white focus:ring-2 focus:ring-blue-600 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Schools Division Office <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formData.division}
                  onChange={(e) => handleChange('division', e.target.value)}
                  placeholder="e.g., Schools Division of..."
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-900 focus:bg-white focus:ring-2 focus:ring-blue-600 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Administrative Region <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formData.region}
                  onChange={(e) => handleChange('region', e.target.value)}
                  placeholder="e.g., Region IX - Zamboanga Peninsula"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-900 focus:bg-white focus:ring-2 focus:ring-blue-600 focus:outline-none"
                />
              </div>
            </div>
          </div>

          {/* Section 2: School Head / Principal Information */}
          <div className="space-y-3 pt-2 border-t border-slate-100">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
              <User className="w-3.5 h-3.5 text-blue-600" />
              <span>School Head / Approving Official (For Form 48 Signature)</span>
            </h4>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  School Head / Principal Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formData.schoolHeadName}
                  onChange={(e) => handleChange('schoolHeadName', e.target.value)}
                  placeholder="e.g., DR. JUAN DELA CRUZ, CESO VI"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-bold text-slate-900 focus:bg-white focus:ring-2 focus:ring-blue-600 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Official Position / Designation <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formData.schoolHeadPosition}
                  onChange={(e) => handleChange('schoolHeadPosition', e.target.value)}
                  placeholder="e.g., Secondary School Principal IV / Teacher-in-Charge"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-900 focus:bg-white focus:ring-2 focus:ring-blue-600 focus:outline-none"
                />
              </div>
            </div>
          </div>

          {/* Section 3: Physical Location & Contact */}
          <div className="space-y-3 pt-2 border-t border-slate-100">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-blue-600" />
              <span>Physical Station Address &amp; Contact</span>
            </h4>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Official Campus Address
              </label>
              <input
                type="text"
                value={formData.address}
                onChange={(e) => handleChange('address', e.target.value)}
                placeholder="e.g., Don Alfaro St., Tetuan, Zamboanga City"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-900 focus:bg-white focus:ring-2 focus:ring-blue-600 focus:outline-none"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Official Email Address
                </label>
                <div className="relative">
                  <Mail className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                  <input
                    type="email"
                    value={formData.contactEmail || ''}
                    onChange={(e) => handleChange('contactEmail', e.target.value)}
                    placeholder="e.g., school.id@deped.gov.ph"
                    className="w-full pl-8 pr-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-900 focus:bg-white focus:ring-2 focus:ring-blue-600 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Contact Phone / Landline
                </label>
                <div className="relative">
                  <Phone className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                  <input
                    type="text"
                    value={formData.contactNumber || ''}
                    onChange={(e) => handleChange('contactNumber', e.target.value)}
                    placeholder="e.g., (062) 991-2345"
                    className="w-full pl-8 pr-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-900 focus:bg-white focus:ring-2 focus:ring-blue-600 focus:outline-none"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Footer Buttons */}
          <div className="pt-4 border-t border-slate-200 flex items-center justify-between">
            <p className="text-[11px] text-slate-500">
              * Saved settings automatically apply across Form 48 DTR cards, PDF printouts, and reports.
            </p>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition"
              >
                Cancel
              </button>

              <button
                type="submit"
                disabled={isSaving}
                className="px-5 py-2 text-xs font-bold text-white bg-blue-900 hover:bg-blue-800 rounded-lg shadow-sm transition flex items-center gap-1.5 disabled:opacity-50"
              >
                {isSaving ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <>
                    <Save className="w-3.5 h-3.5 text-amber-300" />
                    <span>Save School Details</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
