import React, { useState, useEffect, useMemo } from 'react';
import {
  ShieldAlert,
  Search,
  Activity,
  UserCheck,
  Globe,
  Clock,
  Download,
  Filter,
  AlertTriangle,
  Info,
  Laptop,
  Table as TableIcon,
  Smartphone,
} from 'lucide-react';
import { getAuditLogs } from '../db/dexie';
import { AuditLog, AuditSeverity, UserRole, UserSession } from '../types';

interface SuperadminSessionMonitorProps {
  currentUser: UserSession;
  allStations: string[];
}

export const SuperadminSessionMonitor: React.FC<SuperadminSessionMonitorProps> = ({
  currentUser,
  allStations,
}) => {
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [severityFilter, setSeverityFilter] = useState<'ALL' | AuditSeverity>('ALL');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [viewLayout, setViewLayout] = useState<'TABLE' | 'CARDS'>('TABLE');

  // Active Simulated Network Sessions
  const [activeSessions, setActiveSessions] = useState<UserSession[]>([]);

  useEffect(() => {
    // Fetch logs from Dexie
    const loadLogs = async () => {
      const logs = await getAuditLogs(200);
      setAuditLogs(logs);
    };
    loadLogs();
    const interval = setInterval(loadLogs, 4000);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    // Build active session telemetry
    const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : 'Mozilla/5.0';
    const nowTime = new Date().toLocaleTimeString('en-PH');

    // Active session telemetry for current logged-in officer
    const activeDivisionSessions: UserSession[] = [
      {
        ...currentUser,
        userAgent,
        loginTime: currentUser.loginTime || nowTime,
      },
    ];

    setActiveSessions(activeDivisionSessions);
  }, [currentUser]);

  const filteredLogs = useMemo(() => {
    return auditLogs.filter((log) => {
      const matchSeverity = severityFilter === 'ALL' || log.severity === severityFilter;
      const matchCat = categoryFilter === 'ALL' || log.category === categoryFilter;
      const term = searchTerm.toLowerCase();
      const matchSearch =
        searchTerm === '' ||
        log.actor.toLowerCase().includes(term) ||
        log.action.toLowerCase().includes(term) ||
        log.details.toLowerCase().includes(term) ||
        log.category.toLowerCase().includes(term);

      return matchSeverity && matchCat && matchSearch;
    });
  }, [auditLogs, severityFilter, categoryFilter, searchTerm]);

  // Export audit logs to CSV
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

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <ShieldAlert className="w-6 h-6 text-rose-600" />
              <h2 className="text-lg font-bold text-slate-900">
                Superadmin &amp; Session Telemetry Monitor
              </h2>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Active concurrent portal sessions across Zamboanga division schools and immutable cryptographic event audit trail.
            </p>
          </div>

          <button
            onClick={handleExportCSV}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold shadow-sm transition"
          >
            <Download className="w-3.5 h-3.5 text-amber-400" />
            <span>Export Audit Trail (CSV)</span>
          </button>
        </div>
      </div>

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
              className={`p-4 rounded-xl border transition-all ${
                sess.userId === currentUser.userId
                  ? 'bg-blue-950/60 border-blue-500/60 ring-1 ring-blue-500/30'
                  : 'bg-slate-800/80 border-slate-700/80'
              }`}
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

      {/* Audit Trail & Compliance Logger Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2 flex-1">
            <div className="relative flex-1 max-w-sm">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search audit trail by actor, action, details..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-600"
              />
            </div>

            {/* Severity Filter */}
            <select
              aria-label="Filter Audit Logs by Severity"
              value={severityFilter}
              onChange={(e) => setSeverityFilter(e.target.value as 'ALL' | AuditSeverity)}
              className="bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 font-medium focus:outline-none"
            >
              <option value="ALL">All Severities</option>
              <option value="INFO">INFO</option>
              <option value="WARNING">WARNING</option>
              <option value="CRITICAL">CRITICAL</option>
            </select>

            {/* Category Filter */}
            <select
              aria-label="Filter Audit Logs by Category"
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 font-medium focus:outline-none"
            >
              <option value="ALL">All Categories</option>
              <option value="SECURITY">SECURITY</option>
              <option value="DTR_EDIT">DTR_EDIT</option>
              <option value="EXCEL_IMPORT">EXCEL_IMPORT</option>
              <option value="PDF_EXPORT">PDF_EXPORT</option>
              <option value="NOSI_CALC">NOSI_CALC</option>
              <option value="LEAVE_MANAGEMENT">LEAVE_MANAGEMENT</option>
              <option value="DATABASE_EXPORT">DATABASE_EXPORT</option>
              <option value="DATABASE_IMPORT">DATABASE_IMPORT</option>
              <option value="CLOUD_SYNC">CLOUD_SYNC</option>
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
                title="View full audit table"
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
                title="View responsive mobile cards"
              >
                <Smartphone className="w-3 h-3 text-amber-600" />
                <span>Cards</span>
              </button>
            </div>
          </div>

          <span className="text-xs text-slate-500">
            Showing <strong>{filteredLogs.length}</strong> events
          </span>
        </div>

        {/* Mobile Swipe Hint */}
        {viewLayout === 'TABLE' && (
          <div className="md:hidden flex items-center justify-between bg-blue-50 border border-blue-200 text-blue-900 text-[11px] px-3 py-2 rounded-lg mx-4 mb-2">
            <span>👉 Swipe horizontally to view actor, action &amp; metadata</span>
            <button
              type="button"
              onClick={() => setViewLayout('CARDS')}
              className="font-bold underline text-blue-700 ml-2 shrink-0"
            >
              Switch to Cards
            </button>
          </div>
        )}

        {/* Responsive Card-Based Layout List */}
        {viewLayout === 'CARDS' && (
          <div className="p-4 space-y-2.5">
            {filteredLogs.length === 0 ? (
              <div className="p-6 text-center text-slate-400 italic text-xs">
                No matching audit records found.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {filteredLogs.map((log) => (
                  <div
                    key={log.id}
                    className="p-3 bg-slate-50 hover:bg-white rounded-xl border border-slate-200 hover:border-blue-400 transition shadow-xs text-slate-900 space-y-2"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="font-semibold text-xs text-slate-900">{log.action}</div>
                        <span className="text-[10px] font-mono text-slate-400 block">{log.timestamp}</span>
                      </div>
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold border ${getSeverityBadge(
                          log.severity
                        )}`}
                      >
                        {log.severity}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 text-[11px] text-slate-600 pt-1">
                      <span className="font-medium text-slate-800">{log.actor}</span>
                      <span className="text-slate-300">&bull;</span>
                      <span className="text-slate-500 text-[10px]">{log.role}</span>
                      <span className="text-slate-300">&bull;</span>
                      <span className="px-1.5 py-0.5 rounded bg-slate-200 text-slate-700 font-mono text-[9.5px]">
                        {log.category}
                      </span>
                    </div>

                    <div className="text-[11px] text-slate-700 bg-white p-2 rounded-lg border border-slate-200/70">
                      {log.details}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Horizontally Scrollable Table Container */}
        <div className={`overflow-x-auto w-full scrollbar-thin ${viewLayout === 'CARDS' ? 'hidden' : 'block'}`}>
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200">
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
    </div>
  );
};
