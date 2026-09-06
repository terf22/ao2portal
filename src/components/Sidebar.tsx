import React from 'react';
import {
  Clock,
  Award,
  TrendingUp,
  FileCheck2,
  Users,
  CalendarDays,
  UploadCloud,
  ShieldAlert,
  FolderLock,
  LayoutDashboard,
  ChevronLeft,
  ChevronRight,
  Building2,
  X,
} from 'lucide-react';
import { UserRole } from '../types';

export type ActiveTab =
  | 'DASHBOARD'
  | 'FORM48'
  | 'NOSI'
  | 'SSL2026'
  | 'SERVICE_RECORDS'
  | 'PIMS'
  | 'SCHOOL_CLUSTER'
  | 'LEAVE_LEDGER'
  | 'BIOMETRIC_UPLOAD'
  | 'SUPERADMIN_MONITOR'
  | 'PORTABLE_DATA';

interface SidebarProps {
  activeTab: ActiveTab;
  onSelectTab: (tab: ActiveTab) => void;
  userRole: UserRole;
  personnelCount: number;
  dueNosiCount: number;
  pendingLeavesCount: number;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
  isMobileOpen?: boolean;
  onCloseMobile?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  onSelectTab,
  userRole,
  personnelCount,
  dueNosiCount,
  pendingLeavesCount,
  isCollapsed = false,
  onToggleCollapse,
  isMobileOpen = false,
  onCloseMobile,
}) => {
  const navItems = [
    {
      id: 'DASHBOARD' as ActiveTab,
      label: 'Executive Overview',
      icon: LayoutDashboard,
      allowedRoles: ['Superadmin', 'AO II', 'Admin', 'DeptHead', 'Staff'],
      badge: null,
    },
    {
      id: 'FORM48' as ActiveTab,
      label: 'CSC Form 48 (DTR)',
      icon: Clock,
      allowedRoles: ['Superadmin', 'AO II', 'Admin', 'DeptHead', 'Staff'],
      badge: '3.5"×8.5"',
      badgeColor: 'bg-blue-100 text-blue-800',
    },
    {
      id: 'NOSI' as ActiveTab,
      label: 'NOSI Engine (3-Yr)',
      icon: Award,
      allowedRoles: ['Superadmin', 'AO II', 'Admin', 'DeptHead'],
      badge: dueNosiCount > 0 ? `${dueNosiCount} Due` : null,
      badgeColor: 'bg-amber-100 text-amber-800 font-semibold',
    },
    {
      id: 'SSL2026' as ActiveTab,
      label: 'Salary Tranche Matrix',
      icon: TrendingUp,
      allowedRoles: ['Superadmin', 'AO II', 'Admin', 'DeptHead', 'Staff'],
      badge: 'Template / Upload',
      badgeColor: 'bg-emerald-100 text-emerald-800 font-semibold',
    },
    {
      id: 'SERVICE_RECORDS' as ActiveTab,
      label: 'Service Records (EO 54)',
      icon: FileCheck2,
      allowedRoles: ['Superadmin', 'AO II', 'Admin', 'Staff'],
      badge: null,
    },
    {
      id: 'PIMS' as ActiveTab,
      label: 'Personnel Directory (PIMS)',
      icon: Users,
      allowedRoles: ['Superadmin', 'AO II', 'Admin', 'DeptHead'],
      badge: personnelCount > 0 ? `${personnelCount}` : null,
      badgeColor: 'bg-indigo-50 text-indigo-700',
    },
    {
      id: 'SCHOOL_CLUSTER' as ActiveTab,
      label: 'School Details & Profile',
      icon: Building2,
      allowedRoles: ['Superadmin', 'AO II', 'Admin'],
      badge: 'School ID',
      badgeColor: 'bg-amber-100 text-amber-900',
    },
    {
      id: 'LEAVE_LEDGER' as ActiveTab,
      label: 'Leave & Service Credits',
      icon: CalendarDays,
      allowedRoles: ['Superadmin', 'AO II', 'Admin', 'DeptHead'],
      badge: pendingLeavesCount > 0 ? `${pendingLeavesCount}` : null,
      badgeColor: 'bg-emerald-100 text-emerald-800',
    },
    {
      id: 'BIOMETRIC_UPLOAD' as ActiveTab,
      label: 'Biometrics & Excel Import',
      icon: UploadCloud,
      allowedRoles: ['Superadmin', 'AO II', 'Admin'],
      badge: 'Smart Merge',
      badgeColor: 'bg-purple-100 text-purple-800',
    },
    {
      id: 'PORTABLE_DATA' as ActiveTab,
      label: 'Secure Data Portal (PIN)',
      icon: FolderLock,
      allowedRoles: ['Superadmin', 'AO II', 'Admin'],
      badge: 'AES-GCM',
      badgeColor: 'bg-amber-100 text-amber-900',
    },
    {
      id: 'SUPERADMIN_MONITOR' as ActiveTab,
      label: 'Session & Audit Trail',
      icon: ShieldAlert,
      allowedRoles: ['Superadmin', 'Admin'],
      badge: null,
    },
  ];

  const visibleItems = navItems.filter((item) => item.allowedRoles.includes(userRole));

  const handleItemClick = (id: ActiveTab) => {
    onSelectTab(id);
    if (onCloseMobile) {
      onCloseMobile();
    }
  };

  const renderNavContent = (collapsed: boolean, isMobileView: boolean) => (
    <>
      {/* Brand Header */}
      <div className={`border-b border-blue-900/60 shrink-0 ${collapsed ? 'p-3 flex flex-col items-center' : 'p-4 sm:p-6'}`}>
        <div className="flex items-center justify-between gap-2 w-full">
          <div className={`flex items-center gap-3 ${collapsed ? 'justify-center w-full' : ''}`}>
            <div
              className="w-10 h-10 bg-[#d97706] rounded flex items-center justify-center font-bold text-xl text-white shadow-sm font-cinzel shrink-0 cursor-pointer"
              onClick={collapsed ? onToggleCollapse : undefined}
              title={collapsed ? 'Click to expand sidebar' : undefined}
            >
              AO
            </div>
            {!collapsed && (
              <div className="min-w-0 flex-1">
                <h1 className="text-sm font-bold leading-tight text-white tracking-tight truncate">
                  AOII PORTAL
                </h1>
                <p className="text-[10px] text-blue-200 opacity-80 truncate">DepEd Zamboanga</p>
              </div>
            )}
          </div>

          {/* Desktop persistent collapse toggle */}
          {!isMobileView && onToggleCollapse && (
            <button
              onClick={onToggleCollapse}
              aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              className={`p-1.5 rounded-lg text-blue-200 hover:text-white hover:bg-white/10 transition shrink-0 ${
                collapsed ? 'mt-2' : ''
              }`}
            >
              {collapsed ? (
                <ChevronRight className="w-4 h-4" />
              ) : (
                <ChevronLeft className="w-4 h-4" />
              )}
            </button>
          )}

          {/* Mobile drawer close button */}
          {isMobileView && onCloseMobile && (
            <button
              onClick={onCloseMobile}
              aria-label="Close navigation drawer"
              title="Close menu"
              className="p-1.5 rounded-lg text-blue-200 hover:text-white hover:bg-white/10 transition shrink-0"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>

      {/* Navigation List */}
      <nav className={`flex-1 overflow-y-auto space-y-1 ${collapsed ? 'p-2' : 'p-3 sm:p-4'}`}>
        {visibleItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => handleItemClick(item.id)}
              title={collapsed ? `${item.label}${item.badge ? ` (${item.badge})` : ''}` : undefined}
              className={`w-full flex items-center rounded-lg text-sm transition-all text-left relative group ${
                collapsed
                  ? `justify-center p-2.5 ${isActive ? 'bg-white/15 text-white font-medium shadow-sm' : 'text-slate-200 hover:bg-white/5 hover:text-white'}`
                  : `justify-between px-3 py-2.5 ${isActive ? 'bg-white/10 text-white font-medium shadow-sm' : 'text-slate-200 hover:bg-white/5 hover:text-white'}`
              }`}
            >
              <div className={`flex items-center gap-3 min-w-0 ${collapsed ? 'justify-center' : ''}`}>
                {!collapsed && (
                  isActive ? (
                    <span className="w-2 h-2 rounded-full bg-[#d97706] shrink-0" />
                  ) : (
                    <span className="w-2 h-2 shrink-0" />
                  )
                )}
                <Icon
                  className={`w-4 h-4 shrink-0 transition-transform ${
                    isActive ? 'text-amber-300 scale-110' : 'text-blue-200/80 group-hover:text-white'
                  }`}
                />
                {!collapsed && (
                  <span className="truncate text-xs tracking-tight">{item.label}</span>
                )}
              </div>

              {/* Badge for expanded view */}
              {!collapsed && item.badge && (
                <span
                  className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase shrink-0 ${
                    isActive
                      ? 'bg-blue-950 text-amber-300'
                      : 'bg-white/15 text-blue-100'
                  }`}
                >
                  {item.badge}
                </span>
              )}

              {/* Dot badge indicator for collapsed view */}
              {collapsed && item.badge && (
                <span
                  className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-[#d97706] ring-2 ring-[#1e3a8a]"
                  title={item.badge}
                />
              )}
            </button>
          );
        })}
      </nav>

      {/* System Status Footer */}
      <div className={`border-t border-blue-900/60 bg-blue-950/50 shrink-0 ${collapsed ? 'p-3 flex flex-col items-center' : 'p-4'}`}>
        <div className={`flex items-center gap-2 ${collapsed ? 'justify-center' : 'mb-1.5'}`}>
          <div className="w-2 h-2 rounded-full bg-emerald-400 shrink-0 animate-pulse" />
          {!collapsed && (
            <span className="text-[10px] uppercase tracking-wider font-bold text-white truncate">
              System Online
            </span>
          )}
        </div>
        {!collapsed ? (
          <div className="text-[10px] opacity-75 text-blue-100 font-mono truncate">
            Last Sync: {new Date().toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' })} &bull; IndexedDB Active
          </div>
        ) : (
          <div
            className="text-[9px] text-blue-200/70 font-mono mt-1 text-center"
            title="Online &bull; Dexie Cache Active"
          >
            DB✓
          </div>
        )}
      </div>
    </>
  );

  return (
    <>
      {/* Mobile Drawer Backdrop */}
      {isMobileOpen && (
        <div
          className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs z-40 lg:hidden transition-opacity duration-300"
          onClick={onCloseMobile}
          aria-hidden="true"
        />
      )}

      {/* Mobile Drawer (Slide-out Off-Canvas menu) */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-72 max-w-[85vw] bg-[#1e3a8a] text-white flex flex-col shadow-2xl transition-transform duration-300 ease-in-out lg:hidden no-print ${
          isMobileOpen ? 'translate-x-0' : '-translate-x-full pointer-events-none'
        }`}
        aria-label="Mobile Navigation"
      >
        {renderNavContent(false, true)}
      </aside>

      {/* Desktop Persistent Sidebar (Collapsible) */}
      <aside
        className={`hidden lg:flex bg-[#1e3a8a] text-white flex-col shadow-xl shrink-0 no-print transition-[width] duration-300 ease-in-out ${
          isCollapsed ? 'w-20' : 'w-64'
        }`}
        aria-label="Desktop Navigation"
      >
        {renderNavContent(isCollapsed, false)}
      </aside>
    </>
  );
};
