import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  ShieldAlert,
  Search,
  Activity,
  UserCheck,
  UserX,
  Users,
  ArrowRightLeft,
  AlertTriangle,
  Info,
  Laptop,
  Building2,
  Cloud,
  RefreshCw,
  CheckCircle2,
  Download,
  Filter,
  UserMinus,
  Trash2,
  Clock,
  Globe,
  AlertCircle,
  FileText,
  UserCheck2,
  Sparkles,
  Megaphone,
  Send,
  ToggleLeft,
  ToggleRight,
  TrendingUp,
  Database,
  Flame,
  CheckSquare,
  Square,
  Layers,
  ShieldCheck,
} from 'lucide-react';
import {
  getAuditLogs,
  getAnnouncements,
  createAnnouncement,
  deleteAnnouncement,
  toggleAnnouncementActive,
  db,
} from '../db/dexie';
import {
  Announcement,
  AnnouncementPriority,
  AnnouncementTargetRole,
  AuditLog,
  AuditSeverity,
  User,
  UserAccountStatus,
  UserRole,
  UserSession,
  School,
} from '../types';
import {
  pullAllCloudData,
  publishAllLocalToCloud,
  fetchCloudMetrics,
  fetchCloudCollectionRecords,
  deleteCloudDocument,
  deleteMultipleCloudDocuments,
  purgeCloudCollection,
  purgeEntireCloudDatabase,
  CloudCollectionType,
  CloudRecordSummary,
  CloudCollectionMetrics,
} from '../services/cloudSyncService';
import {
  getAllRegisteredUsers,
  approveUserAccount,
  rejectUserAccount,
  suspendUserAccount,
  reactivateUserAccount,
  deleteUserAccount,
  updateUserRoleAndStation,
  transferAccountData,
} from '../services/authService';

interface SuperadminSessionMonitorProps {
  currentUser: UserSession;
  allStations: string[];
  schools?: School[];
  onRefreshSchools?: () => Promise<void>;
  onRefreshRoster?: () => Promise<void>;
}

type SuperadminSubTab =
  | 'APPROVALS_USERS'
  | 'DATA_TRANSFER'
  | 'ANNOUNCEMENTS'
  | 'AUDIT_LOGS'
  | 'SESSIONS_CLOUD'
  | 'CLOUD_DATABASE';

export const SuperadminSessionMonitor: React.FC<SuperadminSessionMonitorProps> = ({
  currentUser,
  allStations,
  schools = [],
  onRefreshSchools,
  onRefreshRoster,
}) => {
  // Navigation
  const [activeSubTab, setActiveSubTab] = useState<SuperadminSubTab>('APPROVALS_USERS');

  // Registered Users State
  const [registeredUsers, setRegisteredUsers] = useState<User[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [userStatusFilter, setUserStatusFilter] = useState<'ALL' | UserAccountStatus>('ALL');
  const [userSearchTerm, setUserSearchTerm] = useState('');
  const [actionFeedback, setActionFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Reject Modal State
  const [rejectingUser, setRejectingUser] = useState<User | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  // Data Transfer Wizard State
  const [transferSourceId, setTransferSourceId] = useState<string>('');
  const [transferTargetId, setTransferTargetId] = useState<string>('');
  const [transferStation, setTransferStation] = useState(true);
  const [transferPersonnel, setTransferPersonnel] = useState(true);
  const [suspendSource, setSuspendSource] = useState(true);
  const [transferRemarks, setTransferRemarks] = useState('');
  const [isTransferring, setIsTransferring] = useState(false);
  const [transferResult, setTransferResult] = useState<{
    affected: number;
    sourceName: string;
    targetName: string;
  } | null>(null);

  // Cloud & Telemetry State
  const [isCloudSyncing, setIsCloudSyncing] = useState(false);
  const [cloudSyncMsg, setCloudSyncMsg] = useState<string | null>(null);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [logSearchTerm, setLogSearchTerm] = useState('');
  const [severityFilter, setSeverityFilter] = useState<'ALL' | AuditSeverity>('ALL');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [activeSessions, setActiveSessions] = useState<UserSession[]>([]);

  // Cloud Database Management & Deletion State
  const [cloudMetrics, setCloudMetrics] = useState<CloudCollectionMetrics>({
    personnel: 0,
    schools: 0,
    announcements: 0,
    audit_logs: 0,
  });
  const [cloudActiveColl, setCloudActiveColl] = useState<CloudCollectionType>('personnel');
  const [cloudRecords, setCloudRecords] = useState<CloudRecordSummary[]>([]);
  const [cloudRecordsLoading, setCloudRecordsLoading] = useState(false);
  const [cloudSearchTerm, setCloudSearchTerm] = useState('');
  const [cloudSchoolFilter, setCloudSchoolFilter] = useState<string>('ALL');
  const [cloudSelectedDocIds, setCloudSelectedDocIds] = useState<string[]>([]);
  const [cloudBatchDeleteModalOpen, setCloudBatchDeleteModalOpen] = useState(false);
  const [cloudBatchDeleteInput, setCloudBatchDeleteInput] = useState('');
  const [isExecutingCloudAction, setIsExecutingCloudAction] = useState(false);
  const [purgeLocalMirror, setPurgeLocalMirror] = useState(true);

  // Deletion Confirmation Modal State
  const [cloudDeleteModal, setCloudDeleteModal] = useState<{
    open: boolean;
    mode: 'SINGLE' | 'COLLECTION' | 'FULL_DATABASE';
    collection?: CloudCollectionType;
    docId?: string;
    title?: string;
    requiredPhrase: string;
  } | null>(null);
  const [cloudDeleteInput, setCloudDeleteInput] = useState('');

  // Fetch live counts from Firestore
  const loadCloudMetrics = useCallback(async () => {
    try {
      const m = await fetchCloudMetrics();
      setCloudMetrics(m);
    } catch (err) {
      console.warn('Failed to load cloud metrics:', err);
    }
  }, []);

  // Fetch live records for current collection from Firestore
  const loadCloudRecords = useCallback(async (coll: CloudCollectionType) => {
    setCloudRecordsLoading(true);
    try {
      const recs = await fetchCloudCollectionRecords(coll);
      setCloudRecords(recs);
    } catch (err) {
      console.warn(`Failed to load cloud records for ${coll}:`, err);
      setCloudRecords([]);
    } finally {
      setCloudRecordsLoading(false);
    }
  }, []);

  // Refresh cloud records when switching subtabs or active collection
  useEffect(() => {
    if (activeSubTab === 'CLOUD_DATABASE' || activeSubTab === 'SESSIONS_CLOUD') {
      loadCloudMetrics();
    }
    if (activeSubTab === 'CLOUD_DATABASE') {
      loadCloudRecords(cloudActiveColl);
    }
  }, [activeSubTab, cloudActiveColl, loadCloudMetrics, loadCloudRecords]);

  // Load registered users
  const loadUsers = useCallback(async () => {
    setUsersLoading(true);
    try {
      const list = await getAllRegisteredUsers();
      setRegisteredUsers(list);
    } catch (err) {
      console.error('Failed to load registered users:', err);
    } finally {
      setUsersLoading(false);
    }
  }, []);

  // Load audit logs
  const loadLogs = useCallback(async () => {
    const logs = await getAuditLogs(200);
    setAuditLogs(logs);
  }, []);

  // Announcements State & Handlers
  const [announcementsList, setAnnouncementsList] = useState<Announcement[]>([]);
  const [annTitle, setAnnTitle] = useState('');
  const [annContent, setAnnContent] = useState('');
  const [annTargetRole, setAnnTargetRole] = useState<AnnouncementTargetRole>('ALL');
  const [annPriority, setAnnPriority] = useState<AnnouncementPriority>('NORMAL');
  const [isPostingAnn, setIsPostingAnn] = useState(false);
  const [annFilterRole, setAnnFilterRole] = useState<'ALL' | AnnouncementTargetRole>('ALL');

  const loadAnnouncements = useCallback(async () => {
    try {
      const list = await getAnnouncements();
      setAnnouncementsList(list);
    } catch (err) {
      console.warn('Failed to load announcements:', err);
    }
  }, []);

  const handlePostAnnouncement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!annTitle.trim() || !annContent.trim()) return;
    setIsPostingAnn(true);
    try {
      await createAnnouncement({
        title: annTitle.trim(),
        content: annContent.trim(),
        targetRole: annTargetRole,
        priority: annPriority,
        author: currentUser.fullName || currentUser.username || 'Division Superadmin',
        authorRole: 'Superadmin',
        isActive: true,
      });
      setAnnTitle('');
      setAnnContent('');
      setActionFeedback({
        type: 'success',
        message: `Announcement "${annTitle.trim()}" published successfully to ${
          annTargetRole === 'ALL' ? 'all division accounts' : `${annTargetRole} roles only`
        }!`,
      });
      await loadAnnouncements();
      await loadLogs();
      setTimeout(() => setActionFeedback(null), 4000);
    } catch (err) {
      setActionFeedback({
        type: 'error',
        message: `Failed to post announcement: ${err instanceof Error ? err.message : String(err)}`,
      });
    } finally {
      setIsPostingAnn(false);
    }
  };

  const handleToggleAnn = async (id: string, currentActive: boolean) => {
    await toggleAnnouncementActive(id, !currentActive, currentUser.username);
    await loadAnnouncements();
    await loadLogs();
  };

  const handleDeleteAnn = async (id: string) => {
    if (window.confirm('Are you sure you want to delete this announcement?')) {
      await deleteAnnouncement(id, currentUser.username);
      await loadAnnouncements();
      await loadLogs();
    }
  };

  useEffect(() => {
    loadUsers();
    loadLogs();
    loadAnnouncements();

    const handleAnnEvent = () => loadAnnouncements();
    window.addEventListener('announcements-updated', handleAnnEvent);

    const interval = setInterval(() => {
      loadLogs();
      loadAnnouncements();
    }, 5000);

    return () => {
      window.removeEventListener('announcements-updated', handleAnnEvent);
      clearInterval(interval);
    };
  }, [loadUsers, loadLogs, loadAnnouncements]);

  // Telemetry session setup
  useEffect(() => {
    const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : 'Mozilla/5.0';
    const nowTime = new Date().toLocaleTimeString('en-PH');
    setActiveSessions([
      {
        ...currentUser,
        userAgent,
        loginTime: currentUser.loginTime || nowTime,
      },
    ]);
  }, [currentUser]);

  // Counts
  const pendingUsers = useMemo(() => {
    return registeredUsers.filter((u) => u.status === 'PENDING');
  }, [registeredUsers]);

  const activeUsersCount = useMemo(() => {
    return registeredUsers.filter((u) => u.status === 'ACTIVE').length;
  }, [registeredUsers]);

  const suspendedUsersCount = useMemo(() => {
    return registeredUsers.filter((u) => u.status === 'SUSPENDED').length;
  }, [registeredUsers]);

  // Filtered users for table
  const filteredUsers = useMemo(() => {
    return registeredUsers.filter((u) => {
      const matchStatus = userStatusFilter === 'ALL' || u.status === userStatusFilter;
      const term = userSearchTerm.toLowerCase();
      const matchSearch =
        userSearchTerm === '' ||
        u.fullName.toLowerCase().includes(term) ||
        u.username.toLowerCase().includes(term) ||
        (u.email && u.email.toLowerCase().includes(term)) ||
        (u.schoolStation && u.schoolStation.toLowerCase().includes(term)) ||
        u.role.toLowerCase().includes(term);

      return matchStatus && matchSearch;
    });
  }, [registeredUsers, userStatusFilter, userSearchTerm]);

  // Filtered audit logs
  const filteredLogs = useMemo(() => {
    return auditLogs.filter((log) => {
      const matchSeverity = severityFilter === 'ALL' || log.severity === severityFilter;
      const matchCat = categoryFilter === 'ALL' || log.category === categoryFilter;
      const term = logSearchTerm.toLowerCase();
      const matchSearch =
        logSearchTerm === '' ||
        log.actor.toLowerCase().includes(term) ||
        log.action.toLowerCase().includes(term) ||
        log.details.toLowerCase().includes(term) ||
        log.category.toLowerCase().includes(term);

      return matchSeverity && matchCat && matchSearch;
    });
  }, [auditLogs, severityFilter, categoryFilter, logSearchTerm]);

  // Available School Station Names for cloud personnel filter
  const cloudPersonnelSchools = useMemo(() => {
    const set = new Set<string>(allStations);
    if (schools) {
      schools.forEach((s) => {
        if (s.name) set.add(s.name);
      });
    }
    cloudRecords.forEach((r) => {
      const st = (r.raw?.schoolStation as string) || '';
      if (st) set.add(st);
    });
    return Array.from(set).filter(Boolean).sort();
  }, [allStations, schools, cloudRecords]);

  // Filtered cloud documents for inspector
  const filteredCloudRecords = useMemo(() => {
    return cloudRecords.filter((r) => {
      // School station filter when inspecting personnel collection
      if (cloudActiveColl === 'personnel' && cloudSchoolFilter !== 'ALL') {
        const rawStation = (r.raw?.schoolStation as string) || '';
        const inSubtitle = r.subtitle.toLowerCase().includes(cloudSchoolFilter.toLowerCase());
        if (rawStation !== cloudSchoolFilter && !inSubtitle) return false;
      }
      if (!cloudSearchTerm.trim()) return true;
      const term = cloudSearchTerm.toLowerCase();
      return (
        r.id.toLowerCase().includes(term) ||
        r.title.toLowerCase().includes(term) ||
        r.subtitle.toLowerCase().includes(term)
      );
    });
  }, [cloudRecords, cloudSearchTerm, cloudActiveColl, cloudSchoolFilter]);

  // Multi-selection helpers for cloud records
  const filteredCloudDocIds = useMemo(
    () => filteredCloudRecords.map((r) => r.id),
    [filteredCloudRecords]
  );

  const isAllCloudSelected = useMemo(
    () =>
      filteredCloudDocIds.length > 0 &&
      filteredCloudDocIds.every((id) => cloudSelectedDocIds.includes(id)),
    [filteredCloudDocIds, cloudSelectedDocIds]
  );

  const handleToggleCloudSelectAll = () => {
    if (isAllCloudSelected) {
      setCloudSelectedDocIds((prev) => prev.filter((id) => !filteredCloudDocIds.includes(id)));
    } else {
      setCloudSelectedDocIds((prev) => Array.from(new Set([...prev, ...filteredCloudDocIds])));
    }
  };

  const handleToggleCloudSelect = (id: string) => {
    setCloudSelectedDocIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleOpenBatchDelete = () => {
    setCloudBatchDeleteInput('');
    setCloudBatchDeleteModalOpen(true);
  };

  const handleExecuteBatchCloudDelete = async () => {
    if (cloudSelectedDocIds.length === 0) return;
    if (cloudBatchDeleteInput.trim() !== 'DELETE') {
      setActionFeedback({
        type: 'error',
        message: 'Confirmation mismatch! Please type DELETE to confirm.',
      });
      return;
    }

    setIsExecutingCloudAction(true);
    setActionFeedback(null);

    try {
      const count = await deleteMultipleCloudDocuments(
        cloudActiveColl,
        cloudSelectedDocIds,
        currentUser.fullName || currentUser.username || 'Superadmin',
        purgeLocalMirror
      );

      setActionFeedback({
        type: 'success',
        message: `Successfully deleted ${count} record(s) from collection "${cloudActiveColl}" in Firebase Firestore and local database!`,
      });
      setCloudSelectedDocIds([]);
      setCloudBatchDeleteModalOpen(false);
      setCloudBatchDeleteInput('');
      await loadCloudMetrics();
      await loadCloudRecords(cloudActiveColl);
      await loadLogs();
      if (onRefreshSchools) await onRefreshSchools();
      if (onRefreshRoster) await onRefreshRoster();
      setTimeout(() => setActionFeedback(null), 5000);
    } catch (err) {
      setActionFeedback({
        type: 'error',
        message: `Bulk deletion failed: ${err instanceof Error ? err.message : String(err)}`,
      });
    } finally {
      setIsExecutingCloudAction(false);
    }
  };

  // Cloud Deletion Handlers
  const handleOpenDeleteSingle = (coll: CloudCollectionType, docId: string, title: string) => {
    setCloudDeleteInput('');
    setCloudDeleteModal({
      open: true,
      mode: 'SINGLE',
      collection: coll,
      docId,
      title,
      requiredPhrase: 'DELETE',
    });
  };

  const handleOpenPurgeCollection = (coll: CloudCollectionType) => {
    setCloudDeleteInput('');
    setCloudDeleteModal({
      open: true,
      mode: 'COLLECTION',
      collection: coll,
      title: `All documents in "${coll}" collection`,
      requiredPhrase: `PURGE ${coll.toUpperCase()}`,
    });
  };

  const handleOpenPurgeAllDatabase = () => {
    setCloudDeleteInput('');
    setCloudDeleteModal({
      open: true,
      mode: 'FULL_DATABASE',
      title: 'Complete Division Cloud Database (All Collections)',
      requiredPhrase: 'PURGE DIVISION CLOUD',
    });
  };

  const handleExecuteCloudDeleteAction = async () => {
    if (!cloudDeleteModal) return;
    if (cloudDeleteInput.trim() !== cloudDeleteModal.requiredPhrase) {
      setActionFeedback({
        type: 'error',
        message: `Confirmation text mismatch! Please type exactly: "${cloudDeleteModal.requiredPhrase}"`,
      });
      return;
    }

    setIsExecutingCloudAction(true);
    setActionFeedback(null);

    try {
      if (cloudDeleteModal.mode === 'SINGLE' && cloudDeleteModal.collection && cloudDeleteModal.docId) {
        await deleteCloudDocument(
          cloudDeleteModal.collection,
          cloudDeleteModal.docId,
          currentUser.fullName || currentUser.username || 'Superadmin',
          purgeLocalMirror
        );
        setActionFeedback({
          type: 'success',
          message: `Successfully deleted document "${cloudDeleteModal.docId}" from Firestore (${cloudDeleteModal.collection})!`,
        });
      } else if (cloudDeleteModal.mode === 'COLLECTION' && cloudDeleteModal.collection) {
        const count = await purgeCloudCollection(
          cloudDeleteModal.collection,
          currentUser.fullName || currentUser.username || 'Superadmin',
          purgeLocalMirror
        );
        setActionFeedback({
          type: 'success',
          message: `Successfully purged ${count} document(s) from collection "${cloudDeleteModal.collection}" in Firestore!`,
        });
      } else if (cloudDeleteModal.mode === 'FULL_DATABASE') {
        const res = await purgeEntireCloudDatabase(
          currentUser.fullName || currentUser.username || 'Superadmin',
          purgeLocalMirror
        );
        setActionFeedback({
          type: 'success',
          message: `Factory reset complete! Purged ${res.personnelDeleted} personnel, ${res.schoolsDeleted} schools, ${res.announcementsDeleted} announcements, and ${res.auditLogsDeleted} logs from Firestore.`,
        });
      }

      setCloudDeleteModal(null);
      setCloudDeleteInput('');
      await loadCloudMetrics();
      if (cloudDeleteModal.collection) {
        await loadCloudRecords(cloudDeleteModal.collection);
      } else {
        await loadCloudRecords(cloudActiveColl);
      }
      await loadLogs();
      if (onRefreshSchools) await onRefreshSchools();
      if (onRefreshRoster) await onRefreshRoster();
      setTimeout(() => setActionFeedback(null), 5000);
    } catch (err) {
      setActionFeedback({
        type: 'error',
        message: `Deletion failed: ${err instanceof Error ? err.message : String(err)}`,
      });
    } finally {
      setIsExecutingCloudAction(false);
    }
  };

  // User Actions
  const handleApprove = async (user: User) => {
    try {
      await approveUserAccount(user.id, currentUser);
      setActionFeedback({
        type: 'success',
        message: `Account for ${user.fullName} (${user.username}) approved successfully! The user may now log in.`,
      });
      await loadUsers();
      await loadLogs();
      setTimeout(() => setActionFeedback(null), 4000);
    } catch (err) {
      setActionFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to approve account.',
      });
    }
  };

  const handleOpenReject = (user: User) => {
    setRejectingUser(user);
    setRejectReason('Account registration details could not be verified by Division Office.');
  };

  const handleConfirmReject = async () => {
    if (!rejectingUser) return;
    try {
      await rejectUserAccount(rejectingUser.id, rejectReason, currentUser);
      setActionFeedback({
        type: 'success',
        message: `Registration for ${rejectingUser.fullName} (${rejectingUser.username}) has been declined.`,
      });
      setRejectingUser(null);
      await loadUsers();
      await loadLogs();
      setTimeout(() => setActionFeedback(null), 4000);
    } catch (err) {
      setActionFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to reject account.',
      });
    }
  };

  const handleSuspend = async (user: User) => {
    const confirmed = window.confirm(
      `Are you sure you want to SUSPEND ${user.fullName} (${user.username})? They will be blocked from logging in immediately.`
    );
    if (!confirmed) return;

    try {
      await suspendUserAccount(user.id, currentUser, 'Suspended by Superadmin');
      setActionFeedback({
        type: 'success',
        message: `Account for ${user.fullName} has been suspended.`,
      });
      await loadUsers();
      await loadLogs();
      setTimeout(() => setActionFeedback(null), 4000);
    } catch (err) {
      setActionFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to suspend account.',
      });
    }
  };

  const handleReactivate = async (user: User) => {
    try {
      await reactivateUserAccount(user.id, currentUser);
      setActionFeedback({
        type: 'success',
        message: `Account for ${user.fullName} has been reactivated.`,
      });
      await loadUsers();
      await loadLogs();
      setTimeout(() => setActionFeedback(null), 4000);
    } catch (err) {
      setActionFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to reactivate account.',
      });
    }
  };

  const handleDeleteUser = async (user: User) => {
    const confirmed = window.confirm(
      `CRITICAL: Are you sure you want to permanently delete user account "${user.fullName}" (${user.username})? This action cannot be undone.`
    );
    if (!confirmed) return;

    try {
      await deleteUserAccount(user.id, currentUser);
      setActionFeedback({
        type: 'success',
        message: `User ${user.fullName} permanently deleted.`,
      });
      await loadUsers();
      await loadLogs();
      setTimeout(() => setActionFeedback(null), 4000);
    } catch (err) {
      setActionFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to delete user account.',
      });
    }
  };

  // Switch to Transfer tab with pre-selected source
  const handleInitiateTransfer = (user: User) => {
    setTransferSourceId(user.id);
    setActiveSubTab('DATA_TRANSFER');
    setTransferResult(null);
  };

  // Execute Account Data Handover
  const handleExecuteTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!transferSourceId || !transferTargetId) {
      setActionFeedback({
        type: 'error',
        message: 'Please select both a source account and a destination account.',
      });
      return;
    }
    if (transferSourceId === transferTargetId) {
      setActionFeedback({
        type: 'error',
        message: 'Source and destination accounts must be different.',
      });
      return;
    }

    setIsTransferring(true);
    setActionFeedback(null);
    try {
      const res = await transferAccountData(
        {
          sourceUserId: transferSourceId,
          targetUserId: transferTargetId,
          transferStation,
          transferPersonnel,
          suspendSourceUser: suspendSource,
          remarks: transferRemarks.trim() || 'Officer resignation / administrative transfer',
        },
        currentUser
      );

      setTransferResult({
        affected: res.affectedPersonnel,
        sourceName: res.sourceUser.fullName,
        targetName: res.targetUser.fullName,
      });

      setActionFeedback({
        type: 'success',
        message: `Data handover complete! Transferred station and ${res.affectedPersonnel} personnel records to ${res.targetUser.fullName}.`,
      });

      await loadUsers();
      await loadLogs();
      if (onRefreshRoster) {
        await onRefreshRoster();
      }
    } catch (err) {
      setActionFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Data transfer failed.',
      });
    } finally {
      setIsTransferring(false);
    }
  };

  // Sync Division Cloud
  const handleSyncDivisionCloud = async () => {
    setIsCloudSyncing(true);
    setCloudSyncMsg(null);
    try {
      await publishAllLocalToCloud();
      const res = await pullAllCloudData();
      if (onRefreshSchools) {
        await onRefreshSchools();
      }
      setCloudSyncMsg(`Cloud sync complete! ${res.schoolsCount} school(s) and ${res.personnelCount} personnel synchronized.`);
      setTimeout(() => setCloudSyncMsg(null), 4000);
    } catch (err) {
      setCloudSyncMsg(`Sync failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsCloudSyncing(false);
    }
  };

  // Export audit logs CSV
  const handleExportCSV = () => {
    const headers = 'ID,Timestamp,Actor,Role,Category,Action,Details,Severity\n';
    const rows = filteredLogs
      .map(
        (l) =>
          `"${l.id}","${l.timestamp}","${l.actor}","${l.role}","${l.category}","${l.action}","${l.details.replace(/"/g, '""')}","${l.severity}"`
      )
      .join('\n');

    const blob = new Blob([headers + rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `DepEd_AOII_AuditTrail_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const getStatusBadge = (status?: UserAccountStatus) => {
    switch (status) {
      case 'ACTIVE':
        return 'bg-emerald-100 text-emerald-800 border-emerald-300 font-bold';
      case 'PENDING':
        return 'bg-amber-100 text-amber-900 border-amber-300 font-bold animate-pulse';
      case 'SUSPENDED':
        return 'bg-slate-200 text-slate-800 border-slate-400 font-semibold';
      case 'REJECTED':
        return 'bg-rose-100 text-rose-800 border-rose-300 font-semibold';
      default:
        return 'bg-blue-100 text-blue-800 border-blue-200';
    }
  };

  const getSeverityBadge = (sev: AuditSeverity) => {
    switch (sev) {
      case 'CRITICAL':
        return 'bg-rose-100 text-rose-800 border-rose-300 font-bold';
      case 'WARNING':
        return 'bg-amber-100 text-amber-800 border-amber-300 font-semibold';
      default:
        return 'bg-blue-100 text-blue-800 border-blue-200';
    }
  };

  // Source user selected details for transfer preview
  const selectedSourceUser = useMemo(() => {
    return registeredUsers.find((u) => u.id === transferSourceId);
  }, [registeredUsers, transferSourceId]);

  const selectedTargetUser = useMemo(() => {
    return registeredUsers.find((u) => u.id === transferTargetId);
  }, [registeredUsers, transferTargetId]);

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <ShieldAlert className="w-6 h-6 text-[#1e3a8a]" />
              <h2 className="text-lg font-black text-slate-900">
                Superadmin Governance &amp; User Access Authority
              </h2>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Republic of the Philippines &bull; Department of Education Division Governance. Superadmin has no school assignment, oversees account approvals, manages the statutory salary tranche, broadcasts announcements, and monitors all system activities.
            </p>
          </div>

          {/* Quick Stats Pill */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="px-3 py-1.5 rounded-lg bg-amber-50 border border-amber-300 text-amber-900 text-xs font-bold flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-amber-600" />
              <span>{pendingUsers.length} Pending Approval</span>
            </div>
            <div className="px-3 py-1.5 rounded-lg bg-emerald-50 border border-emerald-300 text-emerald-800 text-xs font-bold flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              <span>{activeUsersCount} Active</span>
            </div>
            {suspendedUsersCount > 0 && (
              <div className="px-3 py-1.5 rounded-lg bg-slate-100 border border-slate-300 text-slate-700 text-xs font-medium flex items-center gap-1.5">
                <UserMinus className="w-3.5 h-3.5 text-slate-500" />
                <span>{suspendedUsersCount} Suspended</span>
              </div>
            )}
          </div>
        </div>

        {/* Global Feedback Alert */}
        {actionFeedback && (
          <div
            className={`mt-4 p-3 rounded-xl border text-xs flex items-center gap-2 animate-fadeIn ${
              actionFeedback.type === 'success'
                ? 'bg-emerald-50 border-emerald-300 text-emerald-800 font-medium'
                : 'bg-rose-50 border-rose-300 text-rose-800 font-medium'
            }`}
          >
            {actionFeedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            )}
            <span>{actionFeedback.message}</span>
          </div>
        )}

        {/* Navigation Tabs */}
        <div className="mt-5 flex border-b border-slate-200 gap-1 overflow-x-auto text-xs font-bold">
          <button
            type="button"
            onClick={() => setActiveSubTab('APPROVALS_USERS')}
            className={`pb-3 px-3.5 border-b-2 flex items-center gap-2 transition whitespace-nowrap cursor-pointer ${
              activeSubTab === 'APPROVALS_USERS'
                ? 'border-[#1e3a8a] text-[#1e3a8a]'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <UserCheck className="w-4 h-4" />
            <span>User Accounts &amp; Approvals</span>
            {pendingUsers.length > 0 && (
              <span className="px-1.5 py-0.5 rounded-full bg-amber-500 text-white text-[10px] font-bold">
                {pendingUsers.length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab('DATA_TRANSFER')}
            className={`pb-3 px-3.5 border-b-2 flex items-center gap-2 transition whitespace-nowrap cursor-pointer ${
              activeSubTab === 'DATA_TRANSFER'
                ? 'border-[#1e3a8a] text-[#1e3a8a]'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <ArrowRightLeft className="w-4 h-4 text-amber-600" />
            <span>Account Handover / Resignation Transfer</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab('ANNOUNCEMENTS')}
            className={`pb-3 px-3.5 border-b-2 flex items-center gap-2 transition whitespace-nowrap cursor-pointer ${
              activeSubTab === 'ANNOUNCEMENTS'
                ? 'border-[#1e3a8a] text-[#1e3a8a]'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Megaphone className="w-4 h-4 text-amber-600" />
            <span>Broadcast Announcements</span>
            {announcementsList.filter((a) => a.isActive).length > 0 && (
              <span className="px-1.5 py-0.5 rounded-full bg-blue-100 text-[#1e3a8a] text-[10px] font-bold">
                {announcementsList.filter((a) => a.isActive).length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab('AUDIT_LOGS')}
            className={`pb-3 px-3.5 border-b-2 flex items-center gap-2 transition whitespace-nowrap cursor-pointer ${
              activeSubTab === 'AUDIT_LOGS'
                ? 'border-[#1e3a8a] text-[#1e3a8a]'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <FileText className="w-4 h-4 text-indigo-600" />
            <span>System Activity Monitor &amp; Audit Trail</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab('SESSIONS_CLOUD')}
            className={`pb-3 px-3.5 border-b-2 flex items-center gap-2 transition whitespace-nowrap cursor-pointer ${
              activeSubTab === 'SESSIONS_CLOUD'
                ? 'border-[#1e3a8a] text-[#1e3a8a]'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Activity className="w-4 h-4 text-emerald-600" />
            <span>Live Telemetry &amp; Schools Cloud</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab('CLOUD_DATABASE')}
            className={`pb-3 px-3.5 border-b-2 flex items-center gap-2 transition whitespace-nowrap cursor-pointer ${
              activeSubTab === 'CLOUD_DATABASE'
                ? 'border-rose-600 text-rose-700'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Database className="w-4 h-4 text-rose-600" />
            <span>Cloud Database &amp; Data Purge</span>
            <span className="px-1.5 py-0.5 rounded-full bg-rose-100 text-rose-800 text-[10px] font-bold">
              Firestore
            </span>
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* SUBTAB 1: USER ACCOUNTS & APPROVALS HUB */}
      {/* ========================================================================= */}
      {activeSubTab === 'APPROVALS_USERS' && (
        <div className="space-y-6">
          {/* SECTION A: PENDING APPROVALS QUEUE */}
          {pendingUsers.length > 0 && (
            <div className="bg-gradient-to-r from-amber-50 to-orange-50 border-2 border-amber-400 rounded-xl p-5 shadow-sm space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-amber-500 text-white flex items-center justify-center shrink-0 shadow-sm">
                    <Clock className="w-5 h-5 animate-pulse" />
                  </div>
                  <div>
                    <h3 className="text-sm font-black text-amber-950 flex items-center gap-2">
                      <span>Pending Registration Approvals ({pendingUsers.length})</span>
                      <span className="text-[10px] bg-amber-200 text-amber-900 px-2 py-0.5 rounded-full uppercase font-bold">
                        Action Required
                      </span>
                    </h3>
                    <p className="text-xs text-amber-800 mt-0.5">
                      The following personnel registered their accounts and are awaiting Superadmin approval before they can sign in to the portal.
                    </p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 pt-1">
                {pendingUsers.map((pUser) => (
                  <div
                    key={pUser.id}
                    className="bg-white border border-amber-300 rounded-xl p-4 shadow-sm hover:shadow transition space-y-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="font-bold text-slate-900 text-sm">{pUser.fullName}</div>
                        <div className="text-xs text-slate-500 font-mono flex items-center gap-2 mt-0.5">
                          <span>username: <strong>{pUser.username}</strong></span>
                          {pUser.email && <span>&bull; {pUser.email}</span>}
                        </div>
                      </div>
                      <span className="px-2 py-0.5 rounded text-[10px] bg-amber-100 text-amber-900 font-bold border border-amber-300 shrink-0">
                        PENDING
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                      <div>
                        <span className="text-[10px] text-slate-400 uppercase font-semibold block">Requested Role</span>
                        <span className="font-bold text-blue-900">{pUser.role}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 uppercase font-semibold block">School Station</span>
                        <span className="font-medium text-slate-800 truncate block">
                          {pUser.schoolStation || 'Not Assigned'}
                        </span>
                      </div>
                      {pUser.createdAt && (
                        <div className="col-span-2 pt-1 border-t border-slate-200/60 text-[10px] text-slate-500 flex items-center gap-1">
                          <Clock className="w-3 h-3 text-slate-400" />
                          <span>Registered: {new Date(pUser.createdAt).toLocaleString('en-PH')}</span>
                        </div>
                      )}
                    </div>

                    {/* Approval Action Buttons */}
                    <div className="flex items-center gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => handleApprove(pUser)}
                        className="flex-1 py-2 px-3 bg-emerald-700 hover:bg-emerald-600 text-white rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-xs cursor-pointer active:scale-95"
                      >
                        <UserCheck2 className="w-4 h-4" />
                        <span>Approve Account</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleOpenReject(pUser)}
                        className="py-2 px-3 bg-rose-50 hover:bg-rose-100 border border-rose-300 text-rose-800 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1 cursor-pointer"
                      >
                        <UserX className="w-3.5 h-3.5" />
                        <span>Decline</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* SECTION B: REGISTERED USERS DIRECTORY */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-black text-slate-900 flex items-center gap-2">
                  <Users className="w-4 h-4 text-[#1e3a8a]" />
                  <span>DepEd Portal Accounts Directory ({filteredUsers.length})</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Superadmin directory of all registered Principals, Administrative Officers, Department Heads, and Staff.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={loadUsers}
                  disabled={usersLoading}
                  className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${usersLoading ? 'animate-spin' : ''}`} />
                  <span>Refresh</span>
                </button>
              </div>
            </div>

            {/* Filter Bar */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 bg-slate-50 p-3 rounded-xl border border-slate-200">
              <div className="relative flex-1">
                <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search by full name, username, station, or role..."
                  value={userSearchTerm}
                  onChange={(e) => setUserSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs outline-none focus:ring-2 focus:ring-blue-800"
                />
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-600 whitespace-nowrap">Status:</span>
                <select
                  value={userStatusFilter}
                  onChange={(e) => setUserStatusFilter(e.target.value as 'ALL' | UserAccountStatus)}
                  className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-semibold outline-none focus:ring-2 focus:ring-blue-800"
                >
                  <option value="ALL">All Statuses</option>
                  <option value="ACTIVE">Active</option>
                  <option value="PENDING">Pending Approval</option>
                  <option value="SUSPENDED">Suspended</option>
                  <option value="REJECTED">Rejected</option>
                </select>
              </div>
            </div>

            {/* Users Table */}
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-100/80 text-slate-700 font-bold border-b border-slate-200">
                  <tr>
                    <th className="p-3">User &amp; Credentials</th>
                    <th className="p-3">Official Role</th>
                    <th className="p-3">Assigned Station</th>
                    <th className="p-3">Account Status</th>
                    <th className="p-3 text-right">Superadmin Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-900">
                  {filteredUsers.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="p-6 text-center text-slate-400 italic">
                        No registered accounts found matching your filters.
                      </td>
                    </tr>
                  ) : (
                    filteredUsers.map((u) => {
                      const isSuper = u.username === 'superadmin';
                      return (
                        <tr key={u.id} className="hover:bg-blue-50/30 transition">
                          <td className="p-3">
                            <div className="font-bold text-slate-900 flex items-center gap-1.5">
                              <span>{u.fullName}</span>
                              {isSuper && (
                                <span className="px-1.5 py-0.2 rounded bg-blue-900 text-amber-300 text-[9px] font-black uppercase">
                                  Primary Root
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-500 font-mono mt-0.5">
                              @{u.username} {u.email ? `• ${u.email}` : ''}
                            </div>
                            {u.rejectionReason && (
                              <div className="text-[10px] text-rose-700 italic mt-0.5">
                                Reason: {u.rejectionReason}
                              </div>
                            )}
                          </td>

                          <td className="p-3 whitespace-nowrap">
                            <span className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-slate-100 text-slate-800 border border-slate-200">
                              {u.role}
                            </span>
                          </td>

                          <td className="p-3 text-slate-700">
                            <span className="font-medium">{u.schoolStation || 'Not Assigned'}</span>
                          </td>

                          <td className="p-3 whitespace-nowrap">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] border ${getStatusBadge(
                                u.status
                              )}`}
                            >
                              {u.status || (isSuper ? 'ACTIVE' : 'PENDING')}
                            </span>
                          </td>

                          <td className="p-3 text-right whitespace-nowrap">
                            <div className="flex items-center justify-end gap-1.5">
                              {/* Pending actions */}
                              {u.status === 'PENDING' && (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => handleApprove(u)}
                                    className="px-2.5 py-1 bg-emerald-700 hover:bg-emerald-600 text-white rounded text-[11px] font-bold transition flex items-center gap-1"
                                    title="Approve registration"
                                  >
                                    <UserCheck className="w-3 h-3" />
                                    <span>Approve</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleOpenReject(u)}
                                    className="px-2 py-1 bg-rose-100 hover:bg-rose-200 text-rose-800 rounded text-[11px] font-semibold transition"
                                    title="Reject registration"
                                  >
                                    <UserX className="w-3 h-3" />
                                  </button>
                                </>
                              )}

                              {/* Active actions */}
                              {u.status === 'ACTIVE' && !isSuper && (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => handleInitiateTransfer(u)}
                                    className="px-2.5 py-1 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 rounded text-[11px] font-semibold transition flex items-center gap-1"
                                    title="Transfer data to another account (resignation/handover)"
                                  >
                                    <ArrowRightLeft className="w-3 h-3 text-amber-700" />
                                    <span>Transfer</span>
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => handleSuspend(u)}
                                    className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-[11px] font-semibold transition"
                                    title="Suspend account"
                                  >
                                    <UserMinus className="w-3 h-3 text-slate-600" />
                                    <span className="hidden sm:inline">Suspend</span>
                                  </button>
                                </>
                              )}

                              {/* Suspended actions */}
                              {u.status === 'SUSPENDED' && (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => handleReactivate(u)}
                                    className="px-2.5 py-1 bg-blue-100 hover:bg-blue-200 text-blue-900 rounded text-[11px] font-bold transition"
                                    title="Reactivate account"
                                  >
                                    Reactivate
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleInitiateTransfer(u)}
                                    className="px-2.5 py-1 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 rounded text-[11px] font-semibold transition flex items-center gap-1"
                                    title="Transfer resigned account data"
                                  >
                                    <ArrowRightLeft className="w-3 h-3 text-amber-700" />
                                    <span>Handover</span>
                                  </button>
                                </>
                              )}

                              {/* Rejected actions */}
                              {u.status === 'REJECTED' && (
                                <button
                                  type="button"
                                  onClick={() => handleReactivate(u)}
                                  className="px-2 py-1 bg-emerald-100 hover:bg-emerald-200 text-emerald-900 rounded text-[11px] font-bold transition"
                                  title="Approve / Reactivate declined account"
                                >
                                  Re-evaluate &amp; Approve
                                </button>
                              )}

                              {/* Delete account (Superadmin only, cannot delete superadmin) */}
                              {!isSuper && (
                                <button
                                  type="button"
                                  onClick={() => handleDeleteUser(u)}
                                  className="p-1 hover:bg-rose-50 text-slate-400 hover:text-rose-600 rounded transition"
                                  title="Permanently delete account"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SUBTAB 2: ACCOUNT HANDOVER & RESIGNATION DATA TRANSFER */}
      {/* ========================================================================= */}
      {activeSubTab === 'DATA_TRANSFER' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-6">
          <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-300 text-amber-700 flex items-center justify-center shrink-0">
                <ArrowRightLeft className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-black text-slate-900">
                  Account Data Transfer &amp; Resignation Handover Tool
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Seamlessly transfer cluster station assignments, personnel rosters, and records when an Administrative Officer (AO) or Principal resigns, retires, or is reassigned to another division school.
                </p>
              </div>
            </div>
          </div>

          {/* Transfer Form */}
          <form onSubmit={handleExecuteTransfer} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* SOURCE ACCOUNT */}
              <div className="p-4 rounded-xl border-2 border-slate-200 bg-slate-50/60 space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-black text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-rose-500" />
                    <span>Source Account (Resigning / Departed Officer)</span>
                  </label>
                  <span className="text-[10px] text-slate-400 font-bold uppercase">Relinquishing</span>
                </div>

                <select
                  required
                  value={transferSourceId}
                  onChange={(e) => {
                    setTransferSourceId(e.target.value);
                    setTransferResult(null);
                  }}
                  className="w-full p-2.5 bg-white border border-slate-300 rounded-lg text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-amber-500"
                >
                  <option value="">Select originating user account...</option>
                  {registeredUsers
                    .filter((u) => u.username !== 'superadmin' && u.id !== transferTargetId)
                    .map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.fullName} ({u.role}) — Station: {u.schoolStation || 'None'} [{u.status}]
                      </option>
                    ))}
                </select>

                {selectedSourceUser && (
                  <div className="p-3 bg-white rounded-lg border border-slate-200 text-xs space-y-1.5 shadow-xs">
                    <div className="font-bold text-slate-900">{selectedSourceUser.fullName}</div>
                    <div className="text-slate-500 text-[11px]">
                      Role: <strong>{selectedSourceUser.role}</strong> &bull; Username: <strong>@{selectedSourceUser.username}</strong>
                    </div>
                    <div className="text-slate-600 text-[11px]">
                      Station: <span className="font-semibold text-blue-900">{selectedSourceUser.schoolStation || 'None'}</span>
                    </div>
                    <div className="text-[10px] text-slate-400 pt-1 border-t border-slate-100">
                      Status: <span className="font-bold uppercase text-slate-700">{selectedSourceUser.status}</span>
                    </div>
                  </div>
                )}
              </div>

              {/* TARGET ACCOUNT */}
              <div className="p-4 rounded-xl border-2 border-blue-200 bg-blue-50/30 space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-black text-blue-950 uppercase tracking-wider flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-500" />
                    <span>Destination Account (Incoming / Replacement Officer)</span>
                  </label>
                  <span className="text-[10px] text-blue-600 font-bold uppercase">Receiving</span>
                </div>

                <select
                  required
                  value={transferTargetId}
                  onChange={(e) => {
                    setTransferTargetId(e.target.value);
                    setTransferResult(null);
                  }}
                  className="w-full p-2.5 bg-white border border-blue-300 rounded-lg text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-blue-700"
                >
                  <option value="">Select receiving user account...</option>
                  {registeredUsers
                    .filter((u) => u.id !== transferSourceId)
                    .map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.fullName} ({u.role}) — Current Station: {u.schoolStation || 'None'} [{u.status}]
                      </option>
                    ))}
                </select>

                {selectedTargetUser && (
                  <div className="p-3 bg-white rounded-lg border border-blue-200 text-xs space-y-1.5 shadow-xs">
                    <div className="font-bold text-slate-900">{selectedTargetUser.fullName}</div>
                    <div className="text-slate-500 text-[11px]">
                      Role: <strong>{selectedTargetUser.role}</strong> &bull; Username: <strong>@{selectedTargetUser.username}</strong>
                    </div>
                    <div className="text-slate-600 text-[11px]">
                      Current Station: <span className="font-semibold text-blue-900">{selectedTargetUser.schoolStation || 'None'}</span>
                    </div>
                    <div className="text-[10px] text-slate-400 pt-1 border-t border-blue-50">
                      Status: <span className="font-bold uppercase text-slate-700">{selectedTargetUser.status}</span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Handover Options & Audit Remarks */}
            <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 space-y-4">
              <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                Handover Scope &amp; Administrative Actions
              </h4>

              <div className="space-y-2.5">
                <label className="flex items-center gap-2.5 text-xs text-slate-800 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={transferStation}
                    onChange={(e) => setTransferStation(e.target.checked)}
                    className="w-4 h-4 rounded text-blue-900 focus:ring-blue-800"
                  />
                  <span>
                    <strong>Transfer School Station Assignment:</strong> Reassign source officer's school station to the destination officer.
                  </span>
                </label>

                <label className="flex items-center gap-2.5 text-xs text-slate-800 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={transferPersonnel}
                    onChange={(e) => setTransferPersonnel(e.target.checked)}
                    className="w-4 h-4 rounded text-blue-900 focus:ring-blue-800"
                  />
                  <span>
                    <strong>Handover Personnel Roster:</strong> Automatically link and reassign all personnel records under the source station to the incoming officer.
                  </span>
                </label>

                <label className="flex items-center gap-2.5 text-xs text-slate-800 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={suspendSource}
                    onChange={(e) => setSuspendSource(e.target.checked)}
                    className="w-4 h-4 rounded text-blue-900 focus:ring-blue-800"
                  />
                  <span>
                    <strong>Mark Source Account as Suspended:</strong> Revoke login access for the resigning personnel while preserving their audit history.
                  </span>
                </label>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Handover Remarks / Special Order Reference
                </label>
                <input
                  type="text"
                  placeholder="e.g., Division Special Order No. 2026-14; Relinquishment due to retirement/resignation"
                  value={transferRemarks}
                  onChange={(e) => setTransferRemarks(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs outline-none focus:ring-2 focus:ring-blue-800"
                />
              </div>
            </div>

            {/* Execute Button */}
            <div className="flex items-center justify-between pt-2">
              <p className="text-xs text-slate-500">
                Every data handover event is stamped with an immutable cryptographic entry in the division audit trail.
              </p>
              <button
                type="submit"
                disabled={isTransferring || !transferSourceId || !transferTargetId}
                className="px-6 py-2.5 bg-blue-900 hover:bg-blue-800 text-white rounded-xl text-xs font-black shadow-md transition flex items-center gap-2 disabled:opacity-50 cursor-pointer"
              >
                {isTransferring ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Executing Handover...</span>
                  </>
                ) : (
                  <>
                    <ArrowRightLeft className="w-4 h-4 text-amber-400" />
                    <span>Execute Data Handover &amp; Transfer</span>
                  </>
                )}
              </button>
            </div>
          </form>

          {/* Success Summary Callout */}
          {transferResult && (
            <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-300 text-emerald-950 space-y-2 animate-fadeIn">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                <h4 className="text-xs font-black uppercase tracking-wide">
                  Account Data Transfer Succeeded
                </h4>
              </div>
              <p className="text-xs text-emerald-800">
                Official handover completed: Station and <strong>{transferResult.affected} personnel records</strong> formerly under <strong>{transferResult.sourceName}</strong> were successfully transferred to <strong>{transferResult.targetName}</strong>.
              </p>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* SUBTAB 3: DIVISION BROADCAST ANNOUNCEMENTS HUB */}
      {/* ========================================================================= */}
      {activeSubTab === 'ANNOUNCEMENTS' && (
        <div className="space-y-6">
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500 text-white flex items-center justify-center shrink-0 shadow-sm">
                <Megaphone className="w-5 h-5 text-white" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Division Announcement &amp; Broadcast Dispatcher
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Superadmin role: Post official notices, circulars, and updates. Targeted announcements are pushed directly to respective account roles or broadcast to the entire division.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="px-3 py-1 rounded-lg bg-blue-50 text-[#1e3a8a] text-xs font-bold border border-blue-200 flex items-center gap-1.5">
                <Megaphone className="w-3.5 h-3.5 text-amber-500" />
                <span>{announcementsList.filter((a) => a.isActive).length} Active Bulletins</span>
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left 1 Col: Compose Announcement Form */}
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-4">
              <div className="border-b border-slate-100 pb-3">
                <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <Send className="w-4 h-4 text-[#1e3a8a]" />
                  <span>Compose New Announcement</span>
                </h4>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Choose your target audience role and priority level.
                </p>
              </div>

              <form onSubmit={handlePostAnnouncement} className="space-y-3.5">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Announcement Headline / Title *
                  </label>
                  <input
                    type="text"
                    required
                    value={annTitle}
                    onChange={(e) => setAnnTitle(e.target.value)}
                    placeholder="e.g. 2026 SSL Salary Tranche Implementation Guidelines"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs outline-none focus:ring-2 focus:ring-blue-900 font-semibold"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Target Audience *
                    </label>
                    <select
                      value={annTargetRole}
                      onChange={(e) => setAnnTargetRole(e.target.value as AnnouncementTargetRole)}
                      className="w-full px-2.5 py-2 border border-slate-300 rounded-lg text-xs outline-none focus:ring-2 focus:ring-blue-900 font-semibold cursor-pointer"
                    >
                      <option value="ALL">Broadcast to ALL Roles</option>
                      <option value="AO II">AO II (Admins Only)</option>
                      <option value="Admin">School Principals Only</option>
                      <option value="DeptHead">Department Heads</option>
                      <option value="Staff">Staff &amp; Teachers Only</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Priority Level *
                    </label>
                    <select
                      value={annPriority}
                      onChange={(e) => setAnnPriority(e.target.value as AnnouncementPriority)}
                      className="w-full px-2.5 py-2 border border-slate-300 rounded-lg text-xs outline-none focus:ring-2 focus:ring-blue-900 font-semibold cursor-pointer"
                    >
                      <option value="NORMAL">Normal (Bulletin)</option>
                      <option value="URGENT">Urgent (Action Req.)</option>
                      <option value="CRITICAL">Critical (Mandatory)</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Announcement Body / Message *
                  </label>
                  <textarea
                    rows={4}
                    required
                    value={annContent}
                    onChange={(e) => setAnnContent(e.target.value)}
                    placeholder="Provide the detailed notification text, reference circular number, deadline, or instruction..."
                    className="w-full p-2.5 border border-slate-300 rounded-lg text-xs outline-none focus:ring-2 focus:ring-blue-900 leading-relaxed"
                  />
                </div>

                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={isPostingAnn || !annTitle.trim() || !annContent.trim()}
                    className="w-full py-2.5 bg-[#1e3a8a] hover:bg-blue-900 text-white rounded-lg text-xs font-bold shadow-sm transition flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
                  >
                    {isPostingAnn ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>Broadcasting...</span>
                      </>
                    ) : (
                      <>
                        <Megaphone className="w-3.5 h-3.5 text-amber-300" />
                        <span>Publish &amp; Broadcast Announcement</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>

            {/* Right 2 Cols: Published Bulletins Management */}
            <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h4 className="text-sm font-bold text-slate-900">
                    Published Division Bulletins ({announcementsList.length})
                  </h4>
                  <p className="text-[11px] text-slate-500">
                    Manage active broadcasts or deactivate retired circulars.
                  </p>
                </div>

                {/* Filter by target role */}
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-slate-500 font-semibold">Filter:</span>
                  <select
                    value={annFilterRole}
                    onChange={(e) => setAnnFilterRole(e.target.value as 'ALL' | AnnouncementTargetRole)}
                    className="px-2 py-1 border border-slate-200 rounded-lg text-xs font-semibold cursor-pointer"
                  >
                    <option value="ALL">All Audiences</option>
                    <option value="AO II">AO II Only</option>
                    <option value="Admin">Principals Only</option>
                    <option value="DeptHead">Dept Heads</option>
                    <option value="Staff">Staff</option>
                  </select>
                </div>
              </div>

              <div className="divide-y divide-slate-100 overflow-y-auto max-h-[500px]">
                {announcementsList.length === 0 ? (
                  <div className="p-12 text-center text-slate-400 text-xs italic">
                    No announcements published yet. Use the form on the left to broadcast an announcement.
                  </div>
                ) : (
                  announcementsList
                    .filter((a) => annFilterRole === 'ALL' || a.targetRole === annFilterRole || a.targetRole === 'ALL')
                    .map((ann) => (
                      <div
                        key={ann.id}
                        className={`p-4 transition ${ann.isActive ? 'bg-white hover:bg-slate-50' : 'bg-slate-50/60 opacity-60'}`}
                      >
                        <div className="flex items-start justify-between gap-3 flex-wrap">
                          <div className="space-y-1.5 min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${
                                  ann.priority === 'CRITICAL'
                                    ? 'bg-rose-100 text-rose-800 border border-rose-300'
                                    : ann.priority === 'URGENT'
                                    ? 'bg-amber-100 text-amber-900 border border-amber-300'
                                    : 'bg-blue-100 text-blue-800'
                                }`}
                              >
                                {ann.priority}
                              </span>

                              <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-800 font-bold text-[10px]">
                                Target: {ann.targetRole === 'ALL' ? 'Broadcast to ALL' : `${ann.targetRole} Only`}
                              </span>

                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                  ann.isActive ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600'
                                }`}
                              >
                                {ann.isActive ? 'ACTIVE IN PORTALS' : 'INACTIVE'}
                              </span>
                            </div>

                            <h4 className="text-sm font-bold text-slate-900">{ann.title}</h4>
                            <p className="text-xs text-slate-600 leading-relaxed whitespace-pre-line">
                              {ann.content}
                            </p>

                            <div className="pt-1 text-[10px] text-slate-400 font-mono">
                              By {ann.author} &bull; Posted {new Date(ann.createdAt).toLocaleString('en-PH')}
                            </div>
                          </div>

                          {/* Quick Actions: Toggle & Delete */}
                          <div className="flex items-center gap-2 shrink-0">
                            <button
                              onClick={() => handleToggleAnn(ann.id, ann.isActive)}
                              title={ann.isActive ? 'Deactivate announcement' : 'Activate announcement'}
                              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1 cursor-pointer ${
                                ann.isActive
                                  ? 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100 border border-emerald-300'
                                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200 border border-slate-300'
                              }`}
                            >
                              {ann.isActive ? (
                                <>
                                  <ToggleRight className="w-4 h-4 text-emerald-600" />
                                  <span>Active</span>
                                </>
                              ) : (
                                <>
                                  <ToggleLeft className="w-4 h-4 text-slate-400" />
                                  <span>Inactive</span>
                                </>
                              )}
                            </button>

                            <button
                              onClick={() => handleDeleteAnn(ann.id)}
                              title="Delete announcement permanently"
                              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition cursor-pointer"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SUBTAB 4: LIVE TELEMETRY & SCHOOLS CLOUD REGISTRY */}
      {/* ========================================================================= */}
      {activeSubTab === 'SESSIONS_CLOUD' && (
        <div className="space-y-6">
          {/* Real-Time Client Sessions Telemetry */}
          <div className="bg-slate-900 text-white p-6 rounded-xl border border-slate-800 shadow-lg">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Activity className="w-5 h-5 text-emerald-400 animate-pulse" />
                <h3 className="text-sm font-bold tracking-wide uppercase">
                  Active Division Sessions ({activeSessions.length})
                </h3>
              </div>
              <span className="text-[11px] text-emerald-400 font-mono flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                Live Telemetry
              </span>
            </div>

            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {activeSessions.map((sess, idx) => (
                <div
                  key={idx}
                  className="p-4 rounded-xl border bg-blue-950/60 border-blue-500/60 ring-1 ring-blue-500/30"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-white truncate max-w-[130px]">
                      {sess.username}
                    </span>
                    <span className="px-2 py-0.5 rounded text-[10px] bg-slate-700 text-amber-300 font-mono">
                      {sess.role}
                    </span>
                  </div>

                  <div className="mt-3 space-y-1 text-xs text-slate-300">
                    <div className="flex items-center gap-1.5 text-[11px] text-slate-400 truncate">
                      <Globe className="w-3 h-3 text-blue-400 shrink-0" />
                      <span className="truncate">{sess.schoolLocation}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-[11px] font-mono text-slate-400">
                      <span className="text-slate-500">IP:</span>
                      <span className="text-emerald-400">{sess.ipAddress}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-[10px] text-slate-400 truncate">
                      <Laptop className="w-3 h-3 text-slate-500 shrink-0" />
                      <span className="truncate">{sess.userAgent}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-[10px] text-slate-500 pt-1 border-t border-slate-700/50">
                      <Clock className="w-3 h-3" />
                      <span>Logged in: {sess.loginTime}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Division Schools Cloud Overview Card */}
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-blue-50 border border-blue-200 text-blue-900 flex items-center justify-center shrink-0">
                  <Building2 className="w-5 h-5 text-blue-800" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold text-slate-900">
                      Division Schools Cloud Registry ({schools.length} Schools Live)
                    </h3>
                    <span className="flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                      <Cloud className="w-3 h-3 text-emerald-600" />
                      <span>Real-Time Cloud Synced</span>
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Schools in the division synchronized with Firestore cloud database.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={handleSyncDivisionCloud}
                disabled={isCloudSyncing}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-[#1e3a8a] hover:bg-blue-900 text-white rounded-lg text-xs font-semibold shadow-xs transition disabled:opacity-50 cursor-pointer"
              >
                <Cloud className="w-3.5 h-3.5 text-amber-300" />
                <span>{isCloudSyncing ? 'Syncing...' : 'Sync Division Cloud'}</span>
              </button>
            </div>

            {cloudSyncMsg && (
              <div className="p-2.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-medium flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>{cloudSyncMsg}</span>
              </div>
            )}

            {schools.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 pt-1">
                {schools.map((sch) => (
                  <div
                    key={sch.id}
                    className="p-3 rounded-lg border border-slate-200 bg-slate-50/70 hover:bg-blue-50/40 hover:border-blue-200 transition"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-bold text-xs text-slate-900 leading-snug line-clamp-1">
                        {sch.name}
                      </span>
                      <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-blue-100 text-blue-900 shrink-0">
                        ID: {sch.id}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-500 mt-1 flex items-center justify-between">
                      <span>{sch.district || 'Central District'}</span>
                      {sch.schoolHeadName && (
                        <span className="text-[10px] text-slate-600 truncate max-w-[130px]">
                          Head: {sch.schoolHeadName}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-6 border border-dashed border-slate-200 rounded-lg text-slate-500 text-xs">
                No schools registered yet.
              </div>
            )}
            {/* Quick banner to jump to Cloud Database & Data Purge */}
            <div className="mt-4 p-4 rounded-xl bg-gradient-to-r from-slate-900 to-rose-950 border border-rose-900/40 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-rose-600/30 border border-rose-500/50 flex items-center justify-center shrink-0">
                  <Flame className="w-5 h-5 text-rose-400" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
                    <span>Firebase Cloud Data Governance &amp; Purge Control</span>
                    <span className="px-1.5 py-0.5 rounded text-[9px] bg-rose-500 text-white font-mono">Superadmin Only</span>
                  </h4>
                  <p className="text-[11px] text-slate-300 mt-0.5">
                    Delete outdated personnel, prune announcements, wipe invalid schools, or perform a complete cloud database reset.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setActiveSubTab('CLOUD_DATABASE')}
                className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-bold transition flex items-center gap-1.5 shrink-0 cursor-pointer shadow-sm"
              >
                <Database className="w-3.5 h-3.5" />
                <span>Open Cloud Data Purge Center</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SUBTAB 4: CRYPTOGRAPHIC AUDIT TRAIL */}
      {/* ========================================================================= */}
      {activeSubTab === 'AUDIT_LOGS' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <FileText className="w-4 h-4 text-[#1e3a8a]" />
                <span>Division Audit Trail &amp; Governance Events ({filteredLogs.length})</span>
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Comprehensive cryptographic transaction ledger of user approvals, logouts, data handovers, and edits.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleExportCSV}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold shadow-xs transition cursor-pointer"
              >
                <Download className="w-3.5 h-3.5 text-amber-400" />
                <span>Export Audit Trail (CSV)</span>
              </button>
            </div>
          </div>

          {/* Filters */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 bg-slate-50 p-3 rounded-xl border border-slate-200">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
              <input
                type="text"
                placeholder="Search audit trail by actor, action, details..."
                value={logSearchTerm}
                onChange={(e) => setLogSearchTerm(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs outline-none focus:ring-2 focus:ring-blue-800"
              />
            </div>

            <div className="flex items-center gap-2">
              <select
                value={severityFilter}
                onChange={(e) => setSeverityFilter(e.target.value as 'ALL' | AuditSeverity)}
                className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-semibold outline-none"
              >
                <option value="ALL">All Severities</option>
                <option value="INFO">INFO</option>
                <option value="WARNING">WARNING</option>
                <option value="CRITICAL">CRITICAL</option>
              </select>

              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-semibold outline-none"
              >
                <option value="ALL">All Categories</option>
                <option value="AUTH">AUTH</option>
                <option value="USER_MANAGEMENT">USER_MANAGEMENT</option>
                <option value="DATA_PORTABILITY">DATA_PORTABILITY</option>
                <option value="DTR_EDIT">DTR_EDIT</option>
                <option value="NOSI_CALC">NOSI_CALC</option>
                <option value="LEAVE_MANAGEMENT">LEAVE_MANAGEMENT</option>
                <option value="SECURITY">SECURITY</option>
              </select>
            </div>
          </div>

          {/* Audit Logs Table */}
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-100/80 text-slate-700 font-bold border-b border-slate-200">
                <tr>
                  <th className="p-3">Timestamp</th>
                  <th className="p-3">Actor &amp; Role</th>
                  <th className="p-3">Category</th>
                  <th className="p-3">Action</th>
                  <th className="p-3">Details / Audit Metadata</th>
                  <th className="p-3">Severity</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-900">
                {filteredLogs.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-6 text-center text-slate-400 italic">
                      No matching audit records found.
                    </td>
                  </tr>
                ) : (
                  filteredLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-slate-50">
                      <td className="p-3 font-mono text-[11px] text-slate-500 whitespace-nowrap">
                        {log.timestamp}
                      </td>
                      <td className="p-3 whitespace-nowrap">
                        <div className="font-semibold text-slate-900">{log.actor}</div>
                        <div className="text-[10px] text-slate-500">{log.role}</div>
                      </td>
                      <td className="p-3">
                        <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-mono text-[10px]">
                          {log.category}
                        </span>
                      </td>
                      <td className="p-3 font-semibold text-blue-900 whitespace-nowrap">
                        {log.action}
                      </td>
                      <td className="p-3 text-slate-700 max-w-md">{log.details}</td>
                      <td className="p-3">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] border ${getSeverityBadge(
                            log.severity
                          )}`}
                        >
                          {log.severity}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SUBTAB 6: CLOUD DATABASE & DATA PURGE HUB */}
      {/* ========================================================================= */}
      {activeSubTab === 'CLOUD_DATABASE' && (
        <div className="space-y-6 animate-fadeIn">
          {/* Top Panel */}
          <div className="bg-gradient-to-r from-slate-900 via-rose-950 to-slate-900 rounded-xl p-6 border border-rose-900/50 text-white shadow-xl">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-rose-600/30 border border-rose-500/50 flex items-center justify-center">
                    <Database className="w-4 h-4 text-rose-400" />
                  </div>
                  <h3 className="text-base font-black tracking-wide text-white flex items-center gap-2">
                    <span>Firebase Firestore Cloud Data Governance</span>
                    <span className="px-2 py-0.5 rounded text-[10px] bg-rose-600 text-white font-mono uppercase tracking-wider font-bold">
                      Superadmin Exclusive
                    </span>
                  </h3>
                </div>
                <p className="text-xs text-rose-200/80 max-w-3xl leading-relaxed">
                  Direct administrative control over Google Cloud Firestore database (<code className="font-mono text-amber-300">ai-studio-administrativeof-...</code>). Inspect cloud documents, safely delete individual invalid records, or purge entire collections with cryptographic audit verification.
                </p>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => {
                    loadCloudMetrics();
                    loadCloudRecords(cloudActiveColl);
                  }}
                  disabled={cloudRecordsLoading}
                  className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-semibold border border-slate-700 transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${cloudRecordsLoading ? 'animate-spin text-amber-400' : 'text-slate-400'}`} />
                  <span>Refresh Cloud Data</span>
                </button>

                <button
                  type="button"
                  onClick={handleOpenPurgeAllDatabase}
                  className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer shadow-md shadow-rose-950 border border-rose-500"
                >
                  <Flame className="w-4 h-4 text-amber-300 animate-pulse" />
                  <span>Factory Reset Cloud Database</span>
                </button>
              </div>
            </div>

            {/* Cloud Collection Metrics Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
              {/* Personnel */}
              <div
                onClick={() => setCloudActiveColl('personnel')}
                className={`p-4 rounded-xl border transition cursor-pointer ${
                  cloudActiveColl === 'personnel'
                    ? 'bg-rose-900/40 border-rose-500 shadow-md ring-1 ring-rose-500/50'
                    : 'bg-slate-800/60 border-slate-700 hover:border-slate-600'
                }`}
              >
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-300">Personnel Records</span>
                  <span className="text-[10px] font-mono text-slate-400">/personnel</span>
                </div>
                <div className="mt-2 text-2xl font-black text-white">
                  {cloudMetrics.personnel}
                </div>
                <div className="mt-3 flex items-center justify-between gap-2 pt-2 border-t border-slate-700/50">
                  <span className="text-[11px] text-rose-300 font-medium">Click to inspect</span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleOpenPurgeCollection('personnel');
                    }}
                    className="p-1 rounded text-rose-400 hover:text-white hover:bg-rose-600/50 transition text-[10px] font-bold flex items-center gap-1"
                  >
                    <Trash2 className="w-3 h-3" />
                    <span>Purge</span>
                  </button>
                </div>
              </div>

              {/* Schools */}
              <div
                onClick={() => setCloudActiveColl('schools')}
                className={`p-4 rounded-xl border transition cursor-pointer ${
                  cloudActiveColl === 'schools'
                    ? 'bg-rose-900/40 border-rose-500 shadow-md ring-1 ring-rose-500/50'
                    : 'bg-slate-800/60 border-slate-700 hover:border-slate-600'
                }`}
              >
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-300">School Profiles</span>
                  <span className="text-[10px] font-mono text-slate-400">/schools</span>
                </div>
                <div className="mt-2 text-2xl font-black text-white">
                  {cloudMetrics.schools}
                </div>
                <div className="mt-3 flex items-center justify-between gap-2 pt-2 border-t border-slate-700/50">
                  <span className="text-[11px] text-rose-300 font-medium">Click to inspect</span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleOpenPurgeCollection('schools');
                    }}
                    className="p-1 rounded text-rose-400 hover:text-white hover:bg-rose-600/50 transition text-[10px] font-bold flex items-center gap-1"
                  >
                    <Trash2 className="w-3 h-3" />
                    <span>Purge</span>
                  </button>
                </div>
              </div>

              {/* Announcements */}
              <div
                onClick={() => setCloudActiveColl('announcements')}
                className={`p-4 rounded-xl border transition cursor-pointer ${
                  cloudActiveColl === 'announcements'
                    ? 'bg-rose-900/40 border-rose-500 shadow-md ring-1 ring-rose-500/50'
                    : 'bg-slate-800/60 border-slate-700 hover:border-slate-600'
                }`}
              >
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-300">Announcements</span>
                  <span className="text-[10px] font-mono text-slate-400">/announcements</span>
                </div>
                <div className="mt-2 text-2xl font-black text-white">
                  {cloudMetrics.announcements}
                </div>
                <div className="mt-3 flex items-center justify-between gap-2 pt-2 border-t border-slate-700/50">
                  <span className="text-[11px] text-rose-300 font-medium">Click to inspect</span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleOpenPurgeCollection('announcements');
                    }}
                    className="p-1 rounded text-rose-400 hover:text-white hover:bg-rose-600/50 transition text-[10px] font-bold flex items-center gap-1"
                  >
                    <Trash2 className="w-3 h-3" />
                    <span>Purge</span>
                  </button>
                </div>
              </div>

              {/* Audit Logs */}
              <div
                onClick={() => setCloudActiveColl('audit_logs')}
                className={`p-4 rounded-xl border transition cursor-pointer ${
                  cloudActiveColl === 'audit_logs'
                    ? 'bg-rose-900/40 border-rose-500 shadow-md ring-1 ring-rose-500/50'
                    : 'bg-slate-800/60 border-slate-700 hover:border-slate-600'
                }`}
              >
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-300">Division Audit Logs</span>
                  <span className="text-[10px] font-mono text-slate-400">/audit_logs</span>
                </div>
                <div className="mt-2 text-2xl font-black text-white">
                  {cloudMetrics.audit_logs}
                </div>
                <div className="mt-3 flex items-center justify-between gap-2 pt-2 border-t border-slate-700/50">
                  <span className="text-[11px] text-rose-300 font-medium">Click to inspect</span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleOpenPurgeCollection('audit_logs');
                    }}
                    className="p-1 rounded text-rose-400 hover:text-white hover:bg-rose-600/50 transition text-[10px] font-bold flex items-center gap-1"
                  >
                    <Trash2 className="w-3 h-3" />
                    <span>Purge</span>
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Collection Document Explorer */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            {/* Explorer Header */}
            <div className="px-6 py-4 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <h4 className="text-sm font-bold text-slate-900">
                    Cloud Collection: <span className="font-mono text-rose-700">/{cloudActiveColl}</span>
                  </h4>
                  <span className="px-2 py-0.5 rounded text-[10px] bg-slate-100 text-slate-700 font-bold">
                    {filteredCloudRecords.length} records found
                  </span>
                </div>
                <p className="text-[11px] text-slate-500">
                  Select and delete individual records directly from Firebase Firestore.
                </p>
              </div>

              {/* Sub-Collection Filters, School Filter and Search */}
              <div className="flex items-center gap-2 flex-wrap">
                {cloudActiveColl === 'personnel' && (
                  <div className="flex items-center gap-1.5">
                    <Building2 className="w-4 h-4 text-slate-400" />
                    <select
                      aria-label="Filter cloud personnel by school station"
                      value={cloudSchoolFilter}
                      onChange={(e) => {
                        setCloudSchoolFilter(e.target.value);
                        setCloudSelectedDocIds([]);
                      }}
                      className="bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 font-medium focus:ring-1 focus:ring-rose-600 focus:outline-none"
                    >
                      <option value="ALL">All Stations / Schools ({cloudPersonnelSchools.length})</option>
                      {cloudPersonnelSchools.map((st) => (
                        <option key={st} value={st}>
                          {st}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="relative">
                  <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search cloud records..."
                    value={cloudSearchTerm}
                    onChange={(e) => setCloudSearchTerm(e.target.value)}
                    className="pl-8 pr-3 py-1.5 border border-slate-200 rounded-lg text-xs outline-none focus:ring-2 focus:ring-rose-500 w-44 sm:w-56"
                  />
                </div>

                <button
                  type="button"
                  onClick={() => handleOpenPurgeCollection(cloudActiveColl)}
                  className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-800 border border-rose-300 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                  <span>Purge Entire /{cloudActiveColl}</span>
                </button>
              </div>
            </div>

            {/* Cloud Multi-Select Action Bar */}
            <div className="px-6 py-2.5 bg-amber-50/70 border-b border-amber-200/80 flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 bg-amber-200 text-amber-900 font-bold rounded text-[11px]">
                  Batch Cloud Actions
                </span>
                <span className="text-slate-700">
                  {cloudSelectedDocIds.length > 0 ? (
                    <>
                      <strong className="text-slate-900">{cloudSelectedDocIds.length}</strong> record(s) selected
                      {cloudActiveColl === 'personnel' && cloudSchoolFilter !== 'ALL' && (
                        <span className="text-slate-500"> in {cloudSchoolFilter}</span>
                      )}
                    </>
                  ) : (
                    <span>Select records below to perform multi-record cloud deletion</span>
                  )}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleToggleCloudSelectAll}
                  className="px-2.5 py-1 bg-white hover:bg-slate-50 text-slate-700 font-semibold rounded border border-slate-300 shadow-2xs transition flex items-center gap-1.5 cursor-pointer"
                >
                  {isAllCloudSelected ? (
                    <>
                      <CheckSquare className="w-3.5 h-3.5 text-rose-700" />
                      <span>Deselect Filtered ({filteredCloudDocIds.length})</span>
                    </>
                  ) : (
                    <>
                      <Square className="w-3.5 h-3.5 text-slate-500" />
                      <span>Select All Filtered ({filteredCloudDocIds.length})</span>
                    </>
                  )}
                </button>

                {cloudSelectedDocIds.length > 0 && (
                  <>
                    <button
                      type="button"
                      onClick={() => setCloudSelectedDocIds([])}
                      className="px-2 py-1 text-slate-500 hover:text-slate-800 font-medium cursor-pointer"
                    >
                      Clear Selection
                    </button>
                    <button
                      type="button"
                      onClick={handleOpenBatchDelete}
                      className="px-3 py-1 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded shadow-xs flex items-center gap-1.5 transition cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Delete {cloudSelectedDocIds.length} from Firestore &amp; Local</span>
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Document Listing */}
            {cloudRecordsLoading ? (
              <div className="p-16 text-center text-slate-500 space-y-3">
                <RefreshCw className="w-8 h-8 text-rose-600 animate-spin mx-auto" />
                <p className="text-xs font-semibold">Querying live records from Firebase Firestore...</p>
              </div>
            ) : filteredCloudRecords.length === 0 ? (
              <div className="p-16 text-center space-y-2">
                <Database className="w-10 h-10 text-slate-300 mx-auto" />
                <p className="text-xs font-semibold text-slate-600">
                  No documents found in cloud collection <code className="font-mono text-rose-600">/{cloudActiveColl}</code>.
                </p>
                <p className="text-[11px] text-slate-400">
                  {cloudSearchTerm || cloudSchoolFilter !== 'ALL'
                    ? 'Try adjusting your school filter or search keywords.'
                    : 'The collection in Firestore is currently empty.'}
                </p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100 overflow-x-auto max-h-[600px]">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
                    <tr>
                      <th className="p-3 w-10 text-center">
                        <button
                          type="button"
                          onClick={handleToggleCloudSelectAll}
                          className="text-slate-500 hover:text-slate-900 focus:outline-none"
                          title={isAllCloudSelected ? 'Deselect all' : 'Select all'}
                        >
                          {isAllCloudSelected ? (
                            <CheckSquare className="w-4 h-4 text-rose-700 inline" />
                          ) : (
                            <Square className="w-4 h-4 inline" />
                          )}
                        </button>
                      </th>
                      <th className="p-3 w-40">Document ID</th>
                      <th className="p-3">Record Details / Summary</th>
                      <th className="p-3 w-44">Last Updated</th>
                      <th className="p-3 w-36 text-right">Cloud Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-900">
                    {filteredCloudRecords.map((rec) => {
                      const isSelected = cloudSelectedDocIds.includes(rec.id);
                      return (
                        <tr
                          key={rec.id}
                          className={`transition ${
                            isSelected ? 'bg-amber-50/70' : 'hover:bg-rose-50/30'
                          }`}
                        >
                          <td className="p-3 text-center">
                            <button
                              type="button"
                              onClick={() => handleToggleCloudSelect(rec.id)}
                              className="text-slate-500 hover:text-slate-900 focus:outline-none"
                            >
                              {isSelected ? (
                                <CheckSquare className="w-4 h-4 text-amber-700 inline" />
                              ) : (
                                <Square className="w-4 h-4 inline text-slate-400" />
                              )}
                            </button>
                          </td>
                          <td className="p-3 font-mono text-[11px] font-bold text-slate-800 whitespace-nowrap">
                            <span className="px-2 py-0.5 rounded bg-slate-100 border border-slate-200 text-slate-700">
                              {rec.id}
                            </span>
                          </td>
                          <td className="p-3">
                            <div className="font-bold text-slate-900 text-xs">{rec.title}</div>
                            <div className="text-[11px] text-slate-500 mt-0.5">{rec.subtitle}</div>
                          </td>
                          <td className="p-3 font-mono text-[11px] text-slate-500 whitespace-nowrap">
                            {rec.updatedAt ? new Date(rec.updatedAt).toLocaleString('en-PH') : 'N/A'}
                          </td>
                          <td className="p-3 text-right">
                            <button
                              type="button"
                              onClick={() => handleOpenDeleteSingle(cloudActiveColl, rec.id, rec.title)}
                              className="px-2.5 py-1 bg-white hover:bg-rose-600 text-rose-700 hover:text-white border border-rose-300 rounded-lg text-[11px] font-bold transition flex items-center gap-1.5 ml-auto cursor-pointer shadow-xs"
                            >
                              <Trash2 className="w-3 h-3" />
                              <span>Delete from Cloud</span>
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* CLOUD DATA DELETION CONFIRMATION SAFETY MODAL */}
      {cloudDeleteModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border-2 border-rose-500 space-y-4 animate-scaleUp">
            {/* Header */}
            <div className="flex items-center gap-3 text-rose-600 pb-2 border-b border-rose-100">
              <div className="w-10 h-10 rounded-xl bg-rose-100 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-6 h-6 text-rose-600" />
              </div>
              <div>
                <h3 className="text-base font-black text-slate-900">
                  {cloudDeleteModal.mode === 'SINGLE' && 'Delete Cloud Firestore Document'}
                  {cloudDeleteModal.mode === 'COLLECTION' && `Purge Firestore Collection: /${cloudDeleteModal.collection}`}
                  {cloudDeleteModal.mode === 'FULL_DATABASE' && 'CRITICAL: Factory Reset Division Cloud'}
                </h3>
                <p className="text-[11px] text-rose-700 font-semibold uppercase tracking-wider">
                  Irreversible Cloud Storage Deletion
                </p>
              </div>
            </div>

            {/* Warning details */}
            <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-950 space-y-2">
              <p>
                {cloudDeleteModal.mode === 'SINGLE' && (
                  <>
                    You are about to permanently delete document <strong>&quot;{cloudDeleteModal.docId}&quot;</strong> ({cloudDeleteModal.title}) from the Firebase Firestore collection <strong>/{cloudDeleteModal.collection}</strong>.
                  </>
                )}
                {cloudDeleteModal.mode === 'COLLECTION' && (
                  <>
                    You are about to purge <strong>ALL</strong> documents in the <strong>/{cloudDeleteModal.collection}</strong> collection from Firebase Firestore. This will immediately affect all connected devices across the Division.
                  </>
                )}
                {cloudDeleteModal.mode === 'FULL_DATABASE' && (
                  <>
                    <strong>WARNING:</strong> You are executing a complete factory wipe of the Firebase Firestore cloud database. All personnel records, school profiles, announcements, and cloud logs will be erased permanently!
                  </>
                )}
              </p>

              {/* Local Mirror Checkbox */}
              <label className="flex items-center gap-2 pt-1 font-semibold text-slate-900 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={purgeLocalMirror}
                  onChange={(e) => setPurgeLocalMirror(e.target.checked)}
                  className="rounded text-rose-600 focus:ring-rose-500 w-4 h-4 cursor-pointer"
                />
                <span>Also delete corresponding record(s) from local IndexedDB cache</span>
              </label>
            </div>

            {/* Confirmation typing requirement */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-800">
                To confirm deletion, please type exactly{' '}
                <span className="font-mono text-rose-700 bg-rose-50 px-1.5 py-0.5 rounded border border-rose-200 font-black">
                  {cloudDeleteModal.requiredPhrase}
                </span>{' '}
                below:
              </label>
              <input
                type="text"
                value={cloudDeleteInput}
                onChange={(e) => setCloudDeleteInput(e.target.value)}
                placeholder={`Type "${cloudDeleteModal.requiredPhrase}"`}
                className="w-full p-2.5 rounded-xl border border-slate-300 font-mono text-xs outline-none focus:ring-2 focus:ring-rose-600 focus:border-rose-600"
                autoFocus
              />
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                disabled={isExecutingCloudAction}
                onClick={() => {
                  setCloudDeleteModal(null);
                  setCloudDeleteInput('');
                }}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold cursor-pointer disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={
                  isExecutingCloudAction ||
                  cloudDeleteInput.trim() !== cloudDeleteModal.requiredPhrase
                }
                onClick={handleExecuteCloudDeleteAction}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold shadow-md transition flex items-center gap-2 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {isExecutingCloudAction ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Deleting from Cloud...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Confirm &amp; Execute Deletion</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* REJECTION REASON MODAL */}
      {rejectingUser && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4 animate-scaleUp">
            <div className="flex items-center gap-3 text-rose-600">
              <UserX className="w-6 h-6" />
              <h3 className="text-base font-black text-slate-900">Decline Account Registration</h3>
            </div>

            <p className="text-xs text-slate-600">
              You are declining registration for <strong>{rejectingUser.fullName}</strong> (@{rejectingUser.username}). Please state the reason for declining:
            </p>

            <textarea
              rows={3}
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="e.g., Unrecognized staff credentials or incorrect school assignment..."
              className="w-full p-2.5 rounded-xl border border-slate-300 text-xs outline-none focus:ring-2 focus:ring-rose-500"
            />

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setRejectingUser(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmReject}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold shadow-xs cursor-pointer"
              >
                Confirm Decline
              </button>
            </div>
          </div>
        </div>
      )}

      {/* BATCH CLOUD DELETION CONFIRMATION MODAL */}
      {cloudBatchDeleteModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border-2 border-rose-500 space-y-4 animate-scaleUp">
            {/* Header */}
            <div className="flex items-center gap-3 text-rose-600 pb-2 border-b border-rose-100">
              <div className="w-10 h-10 rounded-xl bg-rose-100 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-6 h-6 text-rose-600" />
              </div>
              <div>
                <h3 className="text-base font-black text-slate-900">
                  Batch Cloud Delete — {cloudSelectedDocIds.length} Document(s)
                </h3>
                <p className="text-[11px] text-rose-700 font-semibold uppercase tracking-wider">
                  Firebase Collection: /{cloudActiveColl}
                </p>
              </div>
            </div>

            {/* Warning Details */}
            <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-950 space-y-2">
              <p>
                You are about to permanently delete <strong>{cloudSelectedDocIds.length}</strong> record(s) from Firebase Cloud Firestore collection <strong>/{cloudActiveColl}</strong>.
              </p>
              <label className="flex items-center gap-2 text-[11px] text-slate-700 font-medium cursor-pointer pt-1">
                <input
                  type="checkbox"
                  checked={purgeLocalMirror}
                  onChange={(e) => setPurgeLocalMirror(e.target.checked)}
                  className="rounded text-rose-600"
                />
                <span>Also delete corresponding record(s) from local IndexedDB cache</span>
              </label>
            </div>

            {/* Selected Documents Scrollable Preview */}
            <div className="space-y-1">
              <span className="text-[11px] font-bold text-slate-700">
                Selected Documents ({cloudSelectedDocIds.length}):
              </span>
              <div className="max-h-36 overflow-y-auto rounded-lg border border-slate-200 divide-y divide-slate-100 bg-slate-50 text-xs">
                {cloudRecords
                  .filter((r) => cloudSelectedDocIds.includes(r.id))
                  .map((r) => (
                    <div key={r.id} className="p-2 flex items-center justify-between">
                      <div>
                        <span className="font-bold text-slate-900">{r.title}</span>{' '}
                        <span className="font-mono text-[10.5px] text-slate-500">({r.id})</span>
                        <div className="text-[10px] text-slate-400">{r.subtitle}</div>
                      </div>
                    </div>
                  ))}
              </div>
            </div>

            {/* Confirmation input */}
            <div className="space-y-1.5 pt-1">
              <label className="text-xs font-bold text-slate-800">
                To confirm bulk deletion, type{' '}
                <span className="font-mono text-rose-700 bg-rose-50 px-1.5 py-0.5 rounded border border-rose-200 font-black">
                  DELETE
                </span>{' '}
                below:
              </label>
              <input
                type="text"
                value={cloudBatchDeleteInput}
                onChange={(e) => setCloudBatchDeleteInput(e.target.value)}
                placeholder="Type DELETE"
                className="w-full p-2.5 rounded-xl border border-slate-300 font-mono text-xs outline-none focus:ring-2 focus:ring-rose-600"
                autoFocus
              />
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                disabled={isExecutingCloudAction}
                onClick={() => {
                  setCloudBatchDeleteModalOpen(false);
                  setCloudBatchDeleteInput('');
                }}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold cursor-pointer disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isExecutingCloudAction || cloudBatchDeleteInput.trim() !== 'DELETE'}
                onClick={handleExecuteBatchCloudDelete}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold shadow-md transition flex items-center gap-2 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {isExecutingCloudAction ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Deleting {cloudSelectedDocIds.length} from Cloud...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Confirm Batch Deletion</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
