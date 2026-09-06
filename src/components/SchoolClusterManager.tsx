import React, { useState, useMemo } from 'react';
import {
  Building2,
  Plus,
  Edit2,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Users,
  MapPin,
  Search,
  School as SchoolIcon,
  ShieldCheck,
  KeyRound,
  ExternalLink,
  ChevronRight,
  Sparkles,
  Save,
  Mail,
  Phone,
  User as UserIcon,
  RefreshCw,
  FileText,
} from 'lucide-react';
import { Personnel, School, SchoolProfile, User, UserSession } from '../types';
import { addAuditLog, db, queueSync } from '../db/dexie';

interface SchoolClusterManagerProps {
  schools: School[];
  personnelList: Personnel[];
  selectedStation: string;
  onSelectStation: (stationName: string) => void;
  onRefreshSchools: () => Promise<void>;
  currentUser: UserSession;
  schoolProfile: SchoolProfile;
  onUpdateSchoolProfile: (updated: SchoolProfile) => Promise<void>;
}

export const SchoolClusterManager: React.FC<SchoolClusterManagerProps> = ({
  schools,
  personnelList,
  selectedStation,
  onSelectStation,
  onRefreshSchools,
  currentUser,
  schoolProfile,
  onUpdateSchoolProfile,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [districtFilter, setDistrictFilter] = useState<string>('ALL');

  // School modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingSchool, setEditingSchool] = useState<School | null>(null);
  const [schoolIdInput, setSchoolIdInput] = useState('');
  const [schoolNameInput, setSchoolNameInput] = useState('');
  const [schoolDistrictInput, setSchoolDistrictInput] = useState('Zamboanga Central');
  const [formError, setFormError] = useState<string | null>(null);

  // School profile form state
  const [profileForm, setProfileForm] = useState<SchoolProfile>({ ...schoolProfile });
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [profileSuccess, setProfileSuccess] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);

  React.useEffect(() => {
    setProfileForm({ ...schoolProfile });
  }, [schoolProfile]);

  // Tab state (Defaults to 'PROFILE' so user directly sees and inputs their own school details)
  const [activeTab, setActiveTab] = useState<'PROFILE' | 'SCHOOLS' | 'USERS'>('PROFILE');
  const [userList, setUserList] = useState<User[]>([]);
  const [isUserModalOpen, setIsUserModalOpen] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [newFullName, setNewFullName] = useState('');
  const [newUserRole, setNewUserRole] = useState<'Superadmin' | 'AO II'>('AO II');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [userFormError, setUserFormError] = useState<string | null>(null);

  // Load users from Dexie
  React.useEffect(() => {
    async function loadUsers() {
      try {
        const list = await db.users.toArray();
        setUserList(list);
      } catch (err) {
        console.error('Failed to load users from IndexedDB:', err);
      }
    }
    loadUsers();
  }, []);

  // Compute staff count per school
  const schoolStaffCounts = useMemo(() => {
    const counts = new Map<string, number>();
    personnelList.forEach((p) => {
      // match either by p.schoolId or p.schoolStation
      let matchedSchoolId = p.schoolId;
      if (!matchedSchoolId) {
        const matched = schools.find((s) => s.name === p.schoolStation);
        if (matched) matchedSchoolId = matched.id;
      }
      if (matchedSchoolId) {
        counts.set(matchedSchoolId, (counts.get(matchedSchoolId) || 0) + 1);
      }
    });
    return counts;
  }, [personnelList, schools]);

  const uniqueDistricts = useMemo(() => {
    const set = new Set<string>();
    schools.forEach((s) => set.add(s.district));
    return Array.from(set);
  }, [schools]);

  const filteredSchools = useMemo(() => {
    return schools.filter((s) => {
      const matchSearch =
        s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        s.id.includes(searchTerm) ||
        s.district.toLowerCase().includes(searchTerm.toLowerCase());
      const matchDistrict = districtFilter === 'ALL' || s.district === districtFilter;
      return matchSearch && matchDistrict;
    });
  }, [schools, searchTerm, districtFilter]);

  const handleOpenAddModal = () => {
    setEditingSchool(null);
    setSchoolIdInput('');
    setSchoolNameInput('');
    setSchoolDistrictInput(uniqueDistricts[0] || 'Zamboanga Central');
    setFormError(null);
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (school: School) => {
    setEditingSchool(school);
    setSchoolIdInput(school.id);
    setSchoolNameInput(school.name);
    setSchoolDistrictInput(school.district);
    setFormError(null);
    setIsModalOpen(true);
  };

  const handleSaveSchool = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const trimmedId = schoolIdInput.trim();
    const trimmedName = schoolNameInput.trim();
    const trimmedDistrict = schoolDistrictInput.trim();

    if (!trimmedId || !trimmedName || !trimmedDistrict) {
      setFormError('All fields (6-digit School ID, Name, District) are required.');
      return;
    }

    // DepEd School ID validation (must be 6 numeric digits)
    if (!/^\d{6}$/.test(trimmedId)) {
      setFormError('DepEd School ID must be an official 6-digit numeric identifier (e.g. 303911).');
      return;
    }

    // Check for ID collision if new school
    if (!editingSchool) {
      const existing = await db.schools.get(trimmedId);
      if (existing) {
        setFormError(`School ID ${trimmedId} already exists in your assigned cluster.`);
        return;
      }
    }

    const schoolRecord: School = {
      id: trimmedId,
      name: trimmedName,
      district: trimmedDistrict,
    };

    try {
      await db.schools.put(schoolRecord);
      await queueSync('schools', editingSchool ? 'UPDATE' : 'INSERT', schoolRecord);
      await addAuditLog(
        currentUser.username,
        currentUser.role,
        'SCHOOL_CONFIG',
        editingSchool ? 'SCHOOL_UPDATE' : 'SCHOOL_ADD',
        `${editingSchool ? 'Updated' : 'Added'} school ${trimmedId} - ${trimmedName} (${trimmedDistrict})`
      );
      await onRefreshSchools();
      setIsModalOpen(false);
    } catch (err) {
      setFormError(`Failed to save school: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleDeleteSchool = async (school: School) => {
    const staffCount = schoolStaffCounts.get(school.id) || 0;
    if (staffCount > 0) {
      alert(`Cannot delete ${school.name}. There are ${staffCount} active personnel assigned to this school station.`);
      return;
    }

    if (!confirm(`Are you sure you want to remove school "${school.name}" (ID: ${school.id}) from this cluster?`)) {
      return;
    }

    try {
      await db.schools.delete(school.id);
      await queueSync('schools', 'DELETE', { id: school.id });
      await addAuditLog(
        currentUser.username,
        currentUser.role,
        'SCHOOL_CONFIG',
        'SCHOOL_DELETE',
        `Removed school station ${school.id} - ${school.name}`
      );
      await onRefreshSchools();
    } catch (err) {
      alert(`Failed to delete school: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  // User Account Actions
  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setUserFormError(null);

    const trimmedUsername = newUsername.trim().toLowerCase();
    const trimmedFullName = newFullName.trim();
    const trimmedPassword = newUserPassword.trim();

    if (!trimmedUsername || !trimmedFullName || !trimmedPassword) {
      setUserFormError('All fields (username, full name, password) are required.');
      return;
    }

    // Generate SHA-256 client-side hash
    let passwordHash = '';
    try {
      const msgBuffer = new TextEncoder().encode(trimmedPassword);
      const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      passwordHash = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
    } catch (err) {
      passwordHash = btoa(trimmedPassword);
    }

    const userId = `${newUserRole.toLowerCase().replace(/\s+/g, '_')}_${Date.now()}`;
    const userRecord: User = {
      id: userId,
      username: trimmedUsername,
      fullName: trimmedFullName,
      role: newUserRole,
      passwordHash,
    };

    try {
      await db.users.put(userRecord);
      await queueSync('users', 'INSERT', userRecord);
      await addAuditLog(
        currentUser.username,
        currentUser.role,
        'SECURITY',
        'USER_CREATE',
        `Created new ${newUserRole} account: ${trimmedUsername} (${trimmedFullName})`
      );
      const list = await db.users.toArray();
      setUserList(list);
      setIsUserModalOpen(false);
      setNewUsername('');
      setNewFullName('');
      setNewUserPassword('');
    } catch (err) {
      setUserFormError(`Failed to save user: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleSaveSchoolProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileError(null);

    const trimmedName = profileForm.schoolName.trim();
    const trimmedId = profileForm.schoolId.trim();
    const trimmedHead = profileForm.schoolHeadName.trim();

    if (!trimmedName) {
      setProfileError('Official School Name is required.');
      return;
    }
    if (!trimmedId) {
      setProfileError('DepEd School ID is required.');
      return;
    }
    if (!/^\d{6}$/.test(trimmedId)) {
      setProfileError('DepEd School ID must be a 6-digit numeric code (e.g. 303911).');
      return;
    }
    if (!trimmedHead) {
      setProfileError('School Head / Principal Name is required.');
      return;
    }

    setIsSavingProfile(true);
    try {
      await onUpdateSchoolProfile({
        ...profileForm,
        schoolName: trimmedName,
        schoolId: trimmedId,
        district: profileForm.district.trim() || 'Central District',
        division: profileForm.division.trim() || 'Schools Division Office',
        region: profileForm.region.trim() || 'DepEd Region',
        schoolHeadName: trimmedHead,
        schoolHeadPosition: profileForm.schoolHeadPosition.trim() || 'School Principal',
        address: profileForm.address.trim(),
        contactEmail: profileForm.contactEmail?.trim() || '',
        contactNumber: profileForm.contactNumber?.trim() || '',
      });
      setProfileSuccess(true);
      setTimeout(() => setProfileSuccess(false), 3500);
    } catch (err) {
      setProfileError(`Failed to save school details: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsSavingProfile(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Institutional DepEd Header */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-blue-900 text-amber-400 flex items-center justify-center shrink-0 shadow-md">
              <Building2 className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold text-slate-900">
                  School Profile &amp; Station Details
                </h1>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-100 text-blue-900 border border-blue-200">
                  Station ID: {schoolProfile.schoolId}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-1 max-w-2xl leading-relaxed">
                Input and maintain your official school station details, 6-digit DepEd School ID, approving Principal credentials for CSC Form 48 DTR, and assigned personnel cluster.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-start lg:self-center">
            {activeTab === 'PROFILE' ? (
              <button
                onClick={handleSaveSchoolProfile}
                disabled={isSavingProfile}
                className="flex items-center gap-2 px-4 py-2 bg-[#1e3a8a] hover:bg-blue-800 text-white rounded-lg text-xs font-bold shadow-sm transition disabled:opacity-50"
              >
                {isSavingProfile ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Saving Profile...</span>
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4 text-amber-300" />
                    <span>Save School Details</span>
                  </>
                )}
              </button>
            ) : activeTab === 'SCHOOLS' ? (
              <button
                onClick={handleOpenAddModal}
                className="flex items-center gap-2 px-4 py-2 bg-[#1e3a8a] hover:bg-blue-800 text-white rounded-lg text-xs font-bold shadow-sm transition"
              >
                <Plus className="w-4 h-4" />
                <span>Add School to Cluster</span>
              </button>
            ) : (
              <button
                onClick={() => setIsUserModalOpen(true)}
                className="flex items-center gap-2 px-4 py-2 bg-emerald-700 hover:bg-emerald-600 text-white rounded-lg text-xs font-bold shadow-sm transition"
              >
                <Plus className="w-4 h-4" />
                <span>Add Authorized User</span>
              </button>
            )}
          </div>
        </div>

        {/* Tab Toggle */}
        <div className="flex items-center gap-2 mt-6 border-b border-slate-200">
          <button
            onClick={() => setActiveTab('PROFILE')}
            className={`pb-3 px-3 text-xs font-bold border-b-2 transition flex items-center gap-2 ${
              activeTab === 'PROFILE'
                ? 'border-[#1e3a8a] text-[#1e3a8a]'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Building2 className="w-4 h-4" />
            <span>School Details &amp; Profile</span>
          </button>
          <button
            onClick={() => setActiveTab('SCHOOLS')}
            className={`pb-3 px-3 text-xs font-bold border-b-2 transition flex items-center gap-2 ${
              activeTab === 'SCHOOLS'
                ? 'border-[#1e3a8a] text-[#1e3a8a]'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <SchoolIcon className="w-4 h-4" />
            <span>Cluster Stations ({schools.length})</span>
          </button>
          <button
            onClick={() => setActiveTab('USERS')}
            className={`pb-3 px-3 text-xs font-bold border-b-2 transition flex items-center gap-2 ${
              activeTab === 'USERS'
                ? 'border-[#1e3a8a] text-[#1e3a8a]'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <ShieldCheck className="w-4 h-4" />
            <span>Authorized Users &amp; Roles ({userList.length})</span>
          </button>
        </div>
      </div>

      {/* TAB 1: School Profile & Details Configuration */}
      {activeTab === 'PROFILE' && (
        <div className="space-y-5">
          {profileError && (
            <div className="p-3.5 bg-red-50 border border-red-200 rounded-xl flex items-center gap-3 text-xs text-red-800 animate-in fade-in">
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
              <span>{profileError}</span>
            </div>
          )}

          {profileSuccess && (
            <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-3 text-xs text-emerald-800 animate-in fade-in">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>
                School station details saved successfully! All Form 48 cards, PDF exports, and personnel records are now synchronized with {profileForm.schoolName}.
              </span>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left 2 Cols: Form Fields */}
            <div className="lg:col-span-2 space-y-5">
              <form onSubmit={handleSaveSchoolProfile} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="bg-slate-50 border-b border-slate-200 px-5 py-3.5 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-[#1e3a8a]" />
                    <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                      Official School Station Identification
                    </h3>
                  </div>
                  <span className="text-[11px] text-slate-500 font-mono">
                    DepEd Form 48 &amp; PIMS Configuration
                  </span>
                </div>

                <div className="p-5 space-y-5">
                  {/* School Name & ID */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="sm:col-span-2">
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Official School Name <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        value={profileForm.schoolName}
                        onChange={(e) =>
                          setProfileForm((prev) => ({ ...prev, schoolName: e.target.value }))
                        }
                        placeholder="e.g., Zamboanga City High School (Main)"
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-semibold text-slate-900 focus:bg-white focus:ring-2 focus:ring-blue-600 focus:outline-none transition"
                      />
                      <p className="text-[10px] text-slate-400 mt-1">
                        Appears on top headers, Form 48 cards, and employee service records.
                      </p>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        DepEd School ID <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        maxLength={6}
                        value={profileForm.schoolId}
                        onChange={(e) =>
                          setProfileForm((prev) => ({ ...prev, schoolId: e.target.value }))
                        }
                        placeholder="6-digit (e.g., 303911)"
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-mono font-bold text-[#1e3a8a] focus:bg-white focus:ring-2 focus:ring-blue-600 focus:outline-none transition"
                      />
                      <p className="text-[10px] text-slate-400 mt-1">
                        Official 6-digit DepEd institutional code.
                      </p>
                    </div>
                  </div>

                  {/* District, Division, Region */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        District Assignment <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        value={profileForm.district}
                        onChange={(e) =>
                          setProfileForm((prev) => ({ ...prev, district: e.target.value }))
                        }
                        placeholder="e.g., Zamboanga Central District"
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-900 focus:bg-white focus:ring-2 focus:ring-blue-600 focus:outline-none transition"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Schools Division Office <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        value={profileForm.division}
                        onChange={(e) =>
                          setProfileForm((prev) => ({ ...prev, division: e.target.value }))
                        }
                        placeholder="e.g., Schools Division of Zamboanga City"
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-900 focus:bg-white focus:ring-2 focus:ring-blue-600 focus:outline-none transition"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Administrative Region <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        value={profileForm.region}
                        onChange={(e) =>
                          setProfileForm((prev) => ({ ...prev, region: e.target.value }))
                        }
                        placeholder="e.g., Region IX - Zamboanga Peninsula"
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-900 focus:bg-white focus:ring-2 focus:ring-blue-600 focus:outline-none transition"
                      />
                    </div>
                  </div>

                  {/* School Head / Principal Signatory */}
                  <div className="pt-4 border-t border-slate-100 space-y-3">
                    <div className="flex items-center gap-1.5">
                      <UserIcon className="w-3.5 h-3.5 text-[#1e3a8a]" />
                      <h4 className="text-xs font-bold uppercase tracking-wider text-slate-600">
                        School Head / Form 48 Approving Signatory
                      </h4>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">
                          School Head / Principal Name in Print <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="text"
                          required
                          value={profileForm.schoolHeadName}
                          onChange={(e) =>
                            setProfileForm((prev) => ({ ...prev, schoolHeadName: e.target.value }))
                          }
                          placeholder="e.g., DR. MARIA CLARA L. SANTOS"
                          className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-bold text-slate-900 focus:bg-white focus:ring-2 focus:ring-blue-600 focus:outline-none transition"
                        />
                        <p className="text-[10px] text-slate-400 mt-1">
                          Printed on Form 48 footer certification signature line.
                        </p>
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">
                          Official Designation / Position <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="text"
                          required
                          value={profileForm.schoolHeadPosition}
                          onChange={(e) =>
                            setProfileForm((prev) => ({
                              ...prev,
                              schoolHeadPosition: e.target.value,
                            }))
                          }
                          placeholder="e.g., Secondary School Principal IV"
                          className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-900 focus:bg-white focus:ring-2 focus:ring-blue-600 focus:outline-none transition"
                        />
                        <p className="text-[10px] text-slate-400 mt-1">
                          Official civil service title of school head.
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Campus Address & Contacts */}
                  <div className="pt-4 border-t border-slate-100 space-y-3">
                    <div className="flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5 text-[#1e3a8a]" />
                      <h4 className="text-xs font-bold uppercase tracking-wider text-slate-600">
                        Campus Location &amp; Contact Details
                      </h4>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Physical School Campus Address
                      </label>
                      <input
                        type="text"
                        value={profileForm.address}
                        onChange={(e) =>
                          setProfileForm((prev) => ({ ...prev, address: e.target.value }))
                        }
                        placeholder="e.g., Don Alfaro St., Tetuan, Zamboanga City"
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-900 focus:bg-white focus:ring-2 focus:ring-blue-600 focus:outline-none transition"
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">
                          Official School Email
                        </label>
                        <div className="relative">
                          <Mail className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                          <input
                            type="email"
                            value={profileForm.contactEmail || ''}
                            onChange={(e) =>
                              setProfileForm((prev) => ({
                                ...prev,
                                contactEmail: e.target.value,
                              }))
                            }
                            placeholder="e.g., school.id@deped.gov.ph"
                            className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-900 focus:bg-white focus:ring-2 focus:ring-blue-600 focus:outline-none transition"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">
                          Contact Phone / Landline
                        </label>
                        <div className="relative">
                          <Phone className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                          <input
                            type="text"
                            value={profileForm.contactNumber || ''}
                            onChange={(e) =>
                              setProfileForm((prev) => ({
                                ...prev,
                                contactNumber: e.target.value,
                              }))
                            }
                            placeholder="e.g., (062) 991-2345"
                            className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-900 focus:bg-white focus:ring-2 focus:ring-blue-600 focus:outline-none transition"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Card Footer Submit */}
                <div className="bg-slate-50 border-t border-slate-200 px-5 py-3.5 flex items-center justify-between">
                  <span className="text-[11px] text-slate-500">
                    * All changes are instantly stored in local IndexedDB.
                  </span>

                  <button
                    type="submit"
                    disabled={isSavingProfile}
                    className="flex items-center gap-2 px-5 py-2 bg-[#1e3a8a] hover:bg-blue-800 text-white rounded-lg text-xs font-bold shadow-sm transition disabled:opacity-50"
                  >
                    {isSavingProfile ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>Saving Changes...</span>
                      </>
                    ) : (
                      <>
                        <Save className="w-3.5 h-3.5 text-amber-300" />
                        <span>Save School Details</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>

            {/* Right 1 Col: Live Form 48 Signature & Identity Preview */}
            <div className="space-y-4">
              {/* Form 48 Signature Preview Card */}
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-4">
                <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
                  <FileText className="w-4 h-4 text-blue-700" />
                  <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                    Form 48 Signature Verification
                  </h4>
                </div>

                <p className="text-xs text-slate-500 leading-relaxed">
                  Below is an exact visual preview of the CSC Form 48 DTR card footer certification generated for personnel at this school:
                </p>

                {/* Mini Card Preview */}
                <div className="bg-amber-50/50 border border-amber-200/80 rounded-xl p-4 text-center font-serif text-slate-800 space-y-3">
                  <p className="text-[10px] italic text-slate-600 leading-tight">
                    "I certify on my honor that the above is a true and correct report of the hours of work performed..."
                  </p>

                  <div className="pt-2">
                    <div className="w-40 mx-auto border-b border-slate-900 mb-1" />
                    <p className="text-[11px] font-bold uppercase tracking-wide text-slate-900">
                      {profileForm.schoolHeadName || 'SCHOOL HEAD / PRINCIPAL'}
                    </p>
                    <p className="text-[10px] text-slate-600">
                      {profileForm.schoolHeadPosition || 'Position / Designation'}
                    </p>
                    <p className="text-[9px] text-slate-500 font-sans font-medium mt-0.5">
                      {profileForm.schoolName || 'Official School Name'}
                    </p>
                    <p className="text-[8px] text-slate-400 font-sans">
                      {profileForm.division || 'Schools Division Office'}
                    </p>
                  </div>
                </div>

                {/* School Summary Details */}
                <div className="pt-2 space-y-2 text-xs">
                  <div className="flex items-center justify-between py-1 border-b border-slate-100">
                    <span className="text-slate-500">DepEd Station ID:</span>
                    <span className="font-mono font-bold text-blue-900 bg-blue-50 px-2 py-0.5 rounded">
                      {profileForm.schoolId}
                    </span>
                  </div>
                  <div className="flex items-center justify-between py-1 border-b border-slate-100">
                    <span className="text-slate-500">Assigned District:</span>
                    <span className="font-medium text-slate-800">{profileForm.district}</span>
                  </div>
                  <div className="flex items-center justify-between py-1 border-b border-slate-100">
                    <span className="text-slate-500">Personnel Roster:</span>
                    <span className="font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">
                      {personnelList.length} Active Records
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'SCHOOLS' && (
        <div className="space-y-4">
          {/* Filter and Search Bar */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="relative w-full sm:w-80">
              <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search school name, 6-digit ID, or district..."
                className="w-full pl-9 pr-4 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white transition"
              />
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              <span className="text-xs text-slate-500 font-semibold whitespace-nowrap">District:</span>
              <select
                value={districtFilter}
                onChange={(e) => setDistrictFilter(e.target.value)}
                className="text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-600"
              >
                <option value="ALL">All Districts</option>
                {uniqueDistricts.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* School Cluster Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filteredSchools.map((school) => {
              const staffCount = schoolStaffCounts.get(school.id) || 0;
              const isCurrentStation = selectedStation === school.name;

              return (
                <div
                  key={school.id}
                  className={`bg-white rounded-xl border transition-all duration-200 p-5 flex flex-col justify-between ${
                    isCurrentStation
                      ? 'border-[#1e3a8a] ring-2 ring-blue-500/20 shadow-md'
                      : 'border-slate-200 hover:border-slate-300 shadow-sm'
                  }`}
                >
                  <div>
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200">
                        ID: {school.id}
                      </span>
                      {isCurrentStation ? (
                        <span className="flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
                          <CheckCircle2 className="w-3 h-3" />
                          <span>Active Station</span>
                        </span>
                      ) : (
                        <button
                          onClick={() => onSelectStation(school.name)}
                          className="text-[11px] font-semibold text-blue-700 hover:text-blue-900 transition flex items-center gap-1"
                        >
                          <span>Switch to this station</span>
                          <ChevronRight className="w-3 h-3" />
                        </button>
                      )}
                    </div>

                    <h3 className="text-base font-bold text-slate-900 leading-snug">
                      {school.name}
                    </h3>
                    <div className="flex items-center gap-1 text-xs text-slate-500 mt-1">
                      <MapPin className="w-3.5 h-3.5 text-[#d97706] shrink-0" />
                      <span>{school.district}</span>
                    </div>

                    <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                      <span className="text-slate-500">Personnel Roster:</span>
                      <span className="font-bold px-2 py-0.5 rounded bg-blue-50 text-[#1e3a8a]">
                        {staffCount} {staffCount === 1 ? 'person' : 'personnel'}
                      </span>
                    </div>
                  </div>

                  <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                    <button
                      onClick={() => handleOpenEditModal(school)}
                      className="p-1.5 text-slate-500 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition"
                      title="Edit school details"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDeleteSchool(school)}
                      className="p-1.5 text-slate-500 hover:text-red-700 hover:bg-red-50 rounded-lg transition"
                      title="Delete school station"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {filteredSchools.length === 0 && (
            <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-slate-500 text-xs">
              No school stations found matching your search or filter.
            </div>
          )}
        </div>
      )}

      {activeTab === 'USERS' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div>
              <h2 className="text-sm font-bold text-slate-900">
                Portal Security &amp; Access Roles
              </h2>
              <p className="text-xs text-slate-500">
                Authorized accounts stored locally with cryptographic password hashing for offline operation.
              </p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold uppercase tracking-wider text-[11px]">
                  <th className="p-3">Full Name</th>
                  <th className="p-3">Username</th>
                  <th className="p-3">Role</th>
                  <th className="p-3">Stored Hash (Client-Side)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {userList.map((user) => (
                  <tr key={user.id} className="hover:bg-slate-50/60">
                    <td className="p-3 font-semibold text-slate-900">{user.fullName}</td>
                    <td className="p-3 font-mono text-slate-700">@{user.username}</td>
                    <td className="p-3">
                      <span
                        className={`px-2 py-0.5 rounded-full font-bold text-[10.5px] border ${
                          user.role === 'Superadmin'
                            ? 'bg-purple-100 text-purple-900 border-purple-200'
                            : 'bg-blue-100 text-blue-900 border-blue-200'
                        }`}
                      >
                        {user.role}
                      </span>
                    </td>
                    <td className="p-3 font-mono text-slate-400 text-[10.5px] truncate max-w-xs">
                      {user.passwordHash}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Add / Edit School Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="px-6 py-4 bg-[#1e3a8a] text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Building2 className="w-5 h-5 text-amber-400" />
                <h3 className="font-bold text-sm">
                  {editingSchool ? 'Edit School Station' : 'Add New School to Cluster'}
                </h3>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-white/80 hover:text-white text-lg font-bold"
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleSaveSchool} className="p-6 space-y-4">
              {formError && (
                <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{formError}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  DepEd School ID (6 Digits)
                </label>
                <input
                  type="text"
                  maxLength={6}
                  value={schoolIdInput}
                  onChange={(e) => setSchoolIdInput(e.target.value.replace(/\D/g, ''))}
                  placeholder="e.g. 303911"
                  disabled={Boolean(editingSchool)}
                  className="w-full px-3 py-2 text-xs font-mono bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 disabled:bg-slate-100 disabled:text-slate-500"
                  required
                />
                <span className="text-[10px] text-slate-400 mt-1 block">
                  Official 6-digit DepEd identifier assigned by the Central Office.
                </span>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Official School Name
                </label>
                <input
                  type="text"
                  value={schoolNameInput}
                  onChange={(e) => setSchoolNameInput(e.target.value)}
                  placeholder="e.g. Don Pablo Lorenzo Memorial High School"
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  District Assignment
                </label>
                <input
                  type="text"
                  value={schoolDistrictInput}
                  onChange={(e) => setSchoolDistrictInput(e.target.value)}
                  placeholder="e.g. Zamboanga Central"
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                  required
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-100 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg text-xs font-bold bg-[#1e3a8a] hover:bg-blue-800 text-white shadow-sm transition"
                >
                  Save School Station
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add User Modal */}
      {isUserModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="px-6 py-4 bg-emerald-800 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-amber-400" />
                <h3 className="font-bold text-sm">Add Authorized Portal Account</h3>
              </div>
              <button
                onClick={() => setIsUserModalOpen(false)}
                className="text-white/80 hover:text-white text-lg font-bold"
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleSaveUser} className="p-6 space-y-4">
              {userFormError && (
                <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{userFormError}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Full Name
                </label>
                <input
                  type="text"
                  value={newFullName}
                  onChange={(e) => setNewFullName(e.target.value)}
                  placeholder="e.g. Maria Santos, AO II"
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Username
                </label>
                <input
                  type="text"
                  value={newUsername}
                  onChange={(e) => setNewUsername(e.target.value)}
                  placeholder="e.g. ao2_vitali"
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Portal Role
                </label>
                <select
                  value={newUserRole}
                  onChange={(e) => setNewUserRole(e.target.value as 'Superadmin' | 'AO II')}
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
                >
                  <option value="AO II">AO II (Administrative Officer II)</option>
                  <option value="Superadmin">Superadmin (Division Superintendent)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Password
                </label>
                <input
                  type="password"
                  value={newUserPassword}
                  onChange={(e) => setNewUserPassword(e.target.value)}
                  placeholder="Secure password (hashed client-side)"
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
                  required
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsUserModalOpen(false)}
                  className="px-4 py-2 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-100 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg text-xs font-bold bg-emerald-700 hover:bg-emerald-600 text-white shadow-sm transition"
                >
                  Create Account
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
