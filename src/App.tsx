import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  db,
  initializeDatabaseWithSamples,
  queueSync,
  addAuditLog,
} from './db/dexie';
import { calculateNOSIEligibility } from './utils/nosiEngine';
import { Header } from './components/Header';
import { Sidebar, ActiveTab } from './components/Sidebar';
import { ExecutiveDashboard } from './components/ExecutiveDashboard';
import { Form48DTR } from './components/Form48DTR';
import { NOSIEngine } from './components/NOSIEngine';
import { SSLMatrixExplorer } from './components/SSLMatrixExplorer';
import { ServiceRecordView } from './components/ServiceRecordView';
import { PIMSManager } from './components/PIMSManager';
import { SchoolClusterManager } from './components/SchoolClusterManager';
import { LeaveLedgerManager } from './components/LeaveLedgerManager';
import { BiometricUploader } from './components/BiometricUploader';
import { DataPortabilityPortal } from './components/DataPortabilityPortal';
import { SuperadminSessionMonitor } from './components/SuperadminSessionMonitor';
import { SchoolDetailsModal } from './components/SchoolDetailsModal';
import { AuthGateway } from './components/AuthGateway';
import { GoogleDriveBackupModal } from './components/GoogleDriveBackupModal';
import {
  getStoredSchoolProfile,
  hasConfiguredSchoolProfile,
  loadPersistedSchoolProfile,
  saveStoredSchoolProfile,
} from './utils/schoolProfile';
import {
  getStoredSession,
  clearStoredSession,
} from './services/authService';
import {
  Personnel,
  PrintPaperSize,
  School,
  SchoolProfile,
  UserRole,
  UserSession,
} from './types';

export default function App() {
  const [personnelList, setPersonnelList] = useState<Personnel[]>([]);
  const [schools, setSchools] = useState<School[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<ActiveTab>('DASHBOARD');
  const [paperSize, setPaperSize] = useState<PrintPaperSize>('Cardstock_3.5x8.5');
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState(false);
  const [isGoogleDriveModalOpen, setIsGoogleDriveModalOpen] = useState(false);

  // Active School Station Profile (User-editable)
  const [schoolProfile, setSchoolProfile] = useState<SchoolProfile>(getStoredSchoolProfile);
  // Auto-open modal on first launch if school details are not yet configured
  const [isSchoolModalOpen, setIsSchoolModalOpen] = useState<boolean>(() => {
    return !hasConfiguredSchoolProfile(getStoredSchoolProfile());
  });

  // DepEd School Stations List dynamically derived from configured school and Dexie schools
  const stations = useMemo(() => {
    const list: string[] = [];
    if (schoolProfile.schoolName?.trim()) {
      list.push(schoolProfile.schoolName.trim());
    }
    for (const s of schools) {
      if (s.name?.trim() && !list.includes(s.name.trim())) {
        list.push(s.name.trim());
      }
    }
    return list;
  }, [schools, schoolProfile.schoolName]);

  const [selectedStation, setSelectedStation] = useState<string>(() => {
    const profile = getStoredSchoolProfile();
    return profile.schoolName || '';
  });

  // Active Authenticated User Session (null when user needs to log in)
  const [currentUser, setCurrentUser] = useState<UserSession | null>(() => {
    return getStoredSession();
  });

  const handleSignOut = async () => {
    const confirmed = window.confirm('Are you sure you want to sign out from the portal?');
    if (confirmed) {
      await clearStoredSession(currentUser?.fullName || currentUser?.username || 'User');
      setCurrentUser(null);
    }
  };

  const reloadSchools = useCallback(async () => {
    try {
      const records = await db.schools.toArray();
      setSchools(records);
    } catch (err) {
      console.error('Failed to load schools from IndexedDB:', err);
    }
  }, []);

  // Load Database and personnel on first boot
  const reloadRoster = useCallback(async () => {
    try {
      await initializeDatabaseWithSamples();
      const records = await db.personnel.toArray();
      setPersonnelList(records);
      await reloadSchools();

      // Ensure school profile is reliably recovered from localStorage or IndexedDB
      const persistedProfile = await loadPersistedSchoolProfile();
      if (hasConfiguredSchoolProfile(persistedProfile)) {
        setSchoolProfile(persistedProfile);
        setIsSchoolModalOpen(false);
        setSelectedStation((prev) => prev || persistedProfile.schoolName);
        setCurrentUser((prev) => (prev ? {
          ...prev,
          schoolLocation: prev.schoolLocation === 'Station Not Configured' ? persistedProfile.schoolName : prev.schoolLocation,
        } : null));
      } else if (records.length > 0) {
        // If there are existing personnel in IndexedDB, do not interrupt user with modal
        setIsSchoolModalOpen(false);
      }
    } catch (err) {
      console.error('Failed to load personnel roster from IndexedDB:', err);
    } finally {
      setIsLoading(false);
    }
  }, [reloadSchools]);

  useEffect(() => {
    reloadRoster();
  }, [reloadRoster]);

  // Role Switcher Handler
  const handleRoleChange = (newRole: UserRole) => {
    setCurrentUser((prev) => (prev ? {
      ...prev,
      role: newRole,
    } : null));
  };

  // Station Switcher Handler
  const handleStationChange = (newStation: string) => {
    setSelectedStation(newStation);
    setCurrentUser((prev) => (prev ? {
      ...prev,
      schoolLocation: newStation,
    } : null));
  };

  // School Profile Update Handler
  const handleUpdateSchoolProfile = async (updated: SchoolProfile) => {
    await saveStoredSchoolProfile(updated, currentUser?.username || 'AO II');
    setSchoolProfile(updated);
    setSelectedStation(updated.schoolName);
    setCurrentUser((prev) => (prev ? {
      ...prev,
      schoolLocation: updated.schoolName,
    } : null));
    await reloadSchools();
  };

  // Personnel DB Actions
  const handleAddPersonnel = async (personnel: Personnel) => {
    await db.personnel.add(personnel);
    await queueSync('personnel', 'INSERT', personnel);
    await reloadRoster();
  };

  const handleUpdatePersonnel = async (personnel: Personnel) => {
    await db.personnel.put(personnel);
    await queueSync('personnel', 'UPDATE', personnel);
    await reloadRoster();
  };

  const handleDeletePersonnel = async (id: string) => {
    await db.personnel.delete(id);
    await queueSync('personnel', 'DELETE', { id });
    await reloadRoster();
  };

  // Biometric & Excel Import Batch Handler
  const handleApplyImport = async (
    updatedPersonnel: Personnel[],
    newPersonnel: Personnel[]
  ) => {
    for (const p of updatedPersonnel) {
      await db.personnel.put(p);
      await queueSync('personnel', 'UPDATE', p);
    }
    for (const p of newPersonnel) {
      await db.personnel.add(p);
      await queueSync('personnel', 'INSERT', p);
    }
    await reloadRoster();
  };

  // Counts for Sidebar Badges
  const dueNosiCount = useMemo(() => {
    return personnelList.filter((p) => calculateNOSIEligibility(p).isEligibleNow).length;
  }, [personnelList]);

  const pendingLeavesCount = useMemo(() => {
    return personnelList.filter((p) => (p.leaveLedger?.length || 0) > 0).length;
  }, [personnelList]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center text-white">
        <div className="w-12 h-12 border-4 border-amber-400 border-t-transparent rounded-full animate-spin mb-4" />
        <h2 className="text-base font-bold tracking-wide">
          Department of Education &bull; Division of Zamboanga City
        </h2>
        <p className="text-xs text-slate-400 mt-1">
          Mounting IndexedDB Personnel Records &amp; 2026 SSL Tranche...
        </p>
      </div>
    );
  }

  // If no user is logged in, show the DepEd Login & Account Creation Gateway
  if (!currentUser) {
    return (
      <AuthGateway
        schools={schools}
        defaultSchoolName={schoolProfile.schoolName}
        onLoginSuccess={(session) => {
          setCurrentUser(session);
        }}
      />
    );
  }

  return (
    <div className="flex h-screen w-full bg-slate-50 text-slate-800 font-sans overflow-hidden">
      {/* Sidebar Navigation (Left Panel) */}
      <Sidebar
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        userRole={currentUser.role}
        personnelCount={personnelList.length}
        dueNosiCount={dueNosiCount}
        pendingLeavesCount={pendingLeavesCount}
        isCollapsed={isSidebarCollapsed}
        onToggleCollapse={() => setIsSidebarCollapsed((prev) => !prev)}
        isMobileOpen={isMobileDrawerOpen}
        onCloseMobile={() => setIsMobileDrawerOpen(false)}
      />

      {/* Main App Container (Right Panel) */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        {/* Global Division Header */}
        <Header
          currentUser={currentUser}
          onRoleChange={handleRoleChange}
          paperSize={paperSize}
          onPaperSizeChange={setPaperSize}
          onToggleMobileMenu={() => setIsMobileDrawerOpen((prev) => !prev)}
          schoolProfile={schoolProfile}
          onOpenSchoolModal={() => setIsSchoolModalOpen(true)}
          onOpenGoogleDriveModal={() => setIsGoogleDriveModalOpen(true)}
          onSignOut={handleSignOut}
        />

        {/* Main Content Area */}
        <main className="flex-1 overflow-y-auto p-3 sm:p-6 lg:p-8 bg-slate-50 min-w-0">
          <div className="max-w-7xl mx-auto space-y-6">
            {activeTab === 'DASHBOARD' && (
              <ExecutiveDashboard
                personnelList={personnelList}
                currentUser={currentUser}
                selectedStation={selectedStation}
                schoolProfile={schoolProfile}
                onOpenSchoolModal={() => setIsSchoolModalOpen(true)}
                onNavigate={setActiveTab}
              />
            )}

            {activeTab === 'FORM48' && (
              <Form48DTR
                personnelList={personnelList}
                currentUser={currentUser}
                paperSize={paperSize}
                onUpdatePersonnel={handleUpdatePersonnel}
                schoolProfile={schoolProfile}
              />
            )}

            {activeTab === 'NOSI' && (
              <NOSIEngine
                personnelList={personnelList}
                currentUser={currentUser}
                onUpdatePersonnel={handleUpdatePersonnel}
              />
            )}

            {activeTab === 'SSL2026' && (
              <SSLMatrixExplorer personnelList={personnelList} currentUser={currentUser} />
            )}

            {activeTab === 'SERVICE_RECORDS' && (
              <ServiceRecordView
                personnelList={personnelList}
                currentUser={currentUser}
                onUpdatePersonnel={handleUpdatePersonnel}
              />
            )}

            {activeTab === 'PIMS' && (
              <PIMSManager
                personnelList={personnelList}
                currentUser={currentUser}
                stations={stations}
                schools={schools}
                schoolProfile={schoolProfile}
                onAddPersonnel={handleAddPersonnel}
                onUpdatePersonnel={handleUpdatePersonnel}
                onDeletePersonnel={handleDeletePersonnel}
              />
            )}

            {activeTab === 'SCHOOL_CLUSTER' && (
              <SchoolClusterManager
                schools={schools}
                personnelList={personnelList}
                selectedStation={selectedStation}
                onSelectStation={handleStationChange}
                onRefreshSchools={reloadSchools}
                currentUser={currentUser}
                schoolProfile={schoolProfile}
                onUpdateSchoolProfile={handleUpdateSchoolProfile}
              />
            )}

            {activeTab === 'LEAVE_LEDGER' && (
              <LeaveLedgerManager
                personnelList={personnelList}
                currentUser={currentUser}
                onUpdatePersonnel={handleUpdatePersonnel}
              />
            )}

            {activeTab === 'BIOMETRIC_UPLOAD' && (
              <BiometricUploader
                existingRoster={personnelList}
                currentUser={currentUser}
                schoolProfile={schoolProfile}
                onApplyImport={handleApplyImport}
              />
            )}

            {activeTab === 'PORTABLE_DATA' && (
              <DataPortabilityPortal
                personnelList={personnelList}
                currentUser={currentUser}
                onRefreshRoster={reloadRoster}
                onOpenGoogleDriveModal={() => setIsGoogleDriveModalOpen(true)}
              />
            )}

            {activeTab === 'SUPERADMIN_MONITOR' && (
              <SuperadminSessionMonitor
                currentUser={currentUser}
                allStations={stations}
              />
            )}
          </div>
        </main>
      </div>

      {/* Persistent School Details Modal */}
      <SchoolDetailsModal
        isOpen={isSchoolModalOpen}
        onClose={() => setIsSchoolModalOpen(false)}
        currentProfile={schoolProfile}
        onSave={handleUpdateSchoolProfile}
      />

      {/* Google Drive Cloud Backup & Restore Modal */}
      {isGoogleDriveModalOpen && (
        <GoogleDriveBackupModal
          isOpen={isGoogleDriveModalOpen}
          onClose={() => setIsGoogleDriveModalOpen(false)}
          currentUser={currentUser}
          schoolProfile={schoolProfile}
          onRestoreComplete={async () => {
            await reloadRoster();
          }}
        />
      )}
    </div>
  );
}
