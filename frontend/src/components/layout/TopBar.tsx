import React, { useState, useRef, useEffect } from 'react';
import { PanelLeft, Bell, Search, User, LogOut, ChevronDown, X, Code2, Sun, Moon, CalendarCheck, Users, UserCheck, Plus, CheckCheck, AlertTriangle, ShieldAlert, Info, Calendar } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { api } from '../../lib/api';
import { StudentProfile, BroadcastNotification } from '../../types';
import { BroadcastComposeModal } from '../common/BroadcastComposeModal';

interface TopBarProps {
  onMenuToggle: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({ onMenuToggle }) => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchResults, setSearchResults] = useState<{
    students: StudentProfile[];
    pages: { name: string; path: string; category: string }[];
  }>({ students: [], pages: [] });
  const [searching, setSearching] = useState(false);

  // Day / Night Mode state (persisted in localStorage)
  const [isDarkMode, setIsDarkMode] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('theme');
      if (saved) return saved === 'dark';
      return window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    return false;
  });

  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  }, [isDarkMode]);

  const queryClient = useQueryClient();
  const profileRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLDivElement>(null);
  const notifRef = useRef<HTMLDivElement>(null);

  const [isNotifOpen, setIsNotifOpen] = useState(false);
  const [isComposeOpen, setIsComposeOpen] = useState(false);
  const [selectedNotif, setSelectedNotif] = useState<BroadcastNotification | null>(null);

  const canBroadcast = ['hod', 'faculty', 'coordinator', 'admin', 'principal', 'director', 'management', 'program_chair'].includes(user?.role || '');

  const { data: notifications = [] } = useQuery({
    queryKey: ['myNotifications'],
    queryFn: () => api.getBroadcastNotifications().catch(() => []),
    staleTime: 30000,
    refetchInterval: 60000,
  });

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  const handleMarkAllRead = async () => {
    try {
      await api.markAllNotificationsRead();
      queryClient.invalidateQueries({ queryKey: ['myNotifications'] });
    } catch (e) {
      console.warn('Failed to mark notifications read:', e);
    }
  };

  const handleSelectNotif = async (notif: BroadcastNotification) => {
    setSelectedNotif(notif);
    if (!notif.is_read) {
      try {
        await api.markNotificationRead(notif.id);
        queryClient.invalidateQueries({ queryKey: ['myNotifications'] });
      } catch (e) {
        console.warn('Failed to mark notification read:', e);
      }
    }
  };

  const rawDisplayName = user?.name || (user?.email ? user.email.split('@')[0] : 'User');
  const displayName = rawDisplayName.replace(/\s*\(HOD.*$/i, '').replace(/\s*\(.*$/, '').trim();

  const avatarText = user?.role === 'hod'
    ? 'HOD'
    : displayName
        .split(' ')
        .filter(Boolean)
        .map((n) => n[0])
        .join('')
        .toUpperCase() || 'U';

  const roleLabel = user?.role === 'hod'
    ? `HOD (${user.department || 'Department'})`
    : (user?.role?.toUpperCase() || 'STUDENT');

  // Check student or faculty profile from cache for photo
  const { data: studentProfile } = useQuery({
    queryKey: ['studentProfileForPhoto', user?.rollNumber],
    queryFn: () => (user?.rollNumber ? api.getStudentProfile(user.rollNumber) : Promise.resolve(null)),
    enabled: Boolean(user?.role === 'student' && user?.rollNumber),
    staleTime: 5 * 60 * 1000,
  });

  const { data: facultyProfile } = useQuery({
    queryKey: ['facultyProfileForPhoto', user?.email],
    queryFn: () => (user?.email ? api.getFacultyFullProfile(user.email) : Promise.resolve(null)),
    enabled: Boolean(user?.role !== 'student' && user?.email),
    staleTime: 5 * 60 * 1000,
  });

  const photoUrl = user?.role === 'student'
    ? studentProfile?.photo_url
    : facultyProfile?.personal?.photo_url;

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(event.target as Node)) {
        setIsProfileOpen(false);
      }
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setIsSearchOpen(false);
      }
      if (notifRef.current && !notifRef.current.contains(event.target as Node)) {
        setIsNotifOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const SYSTEM_PAGES = [
    { name: 'My Profile & Demographics', path: '/profile', category: 'Page' },
    { name: 'Student Directory', path: '/directory', category: 'Page' },
    { name: 'Coding Profiles & Live Stats', path: '/coding', category: 'Page' },
    { name: 'Placement Analytics', path: '/analytics', category: 'Page' },
    { name: 'System Admin Dashboard', path: '/admin', category: 'Page' },
  ];

  useEffect(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) {
      setSearchResults({ students: [], pages: [] });
      setIsSearchOpen(false);
      return;
    }

    setIsSearchOpen(true);
    setSearching(true);

    const guard = { cancelled: false };

    const debounceTimer = setTimeout(() => {
      const matchedPages = SYSTEM_PAGES.filter(p => p.name.toLowerCase().includes(query));

      api.getAllStudents({ search: query })
        .then((students) => {
          if (!guard.cancelled) {
            setSearchResults({
              students: students.slice(0, 5),
              pages: matchedPages,
            });
          }
        })
        .catch(() => {
          if (!guard.cancelled) {
            setSearchResults({ students: [], pages: matchedPages });
          }
        })
        .finally(() => {
          if (!guard.cancelled) setSearching(false);
        });
    }, 300);

    return () => {
      guard.cancelled = true;
      clearTimeout(debounceTimer);
    };
  }, [searchQuery]);

  const handleLogout = () => {
    logout();
    setIsProfileOpen(false);
    navigate('/');
  };

  const searchInputRef = useRef<HTMLInputElement>(null);

  // Global ⌘K or Ctrl+K shortcut listener to focus search input
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
        setIsSearchOpen(true);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <header className="h-16 bg-surface border-b border-borderLine px-4 md:px-6 flex items-center justify-between sticky top-0 z-30 shadow-xs">
      {/* Left — sidebar toggle */}
      <div className="flex items-center gap-3">
        <button
          onClick={onMenuToggle}
          className="p-2 rounded-xl text-textSecondary hover:bg-surface-2 hover:text-brand-primary transition-all focus:outline-none"
          aria-label="Toggle Navigation Menu"
          title="Toggle Navigation Menu"
        >
          <PanelLeft className="w-5 h-5" />
        </button>
      </div>

      {/* Right */}
      <div className="flex items-center gap-2 md:gap-3">

        {/* Search — hidden for students */}
        {user?.role !== 'student' && (
          <div ref={searchRef} className="relative hidden md:block">
            <div className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-surface-2 border border-borderLine text-xs text-textPrimary w-64 lg:w-80 focus-within:border-brand-primary focus-within:ring-2 focus-within:ring-brand-primary/15 transition-all">
              <Search className="w-3.5 h-3.5 text-textMuted shrink-0" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onFocus={() => searchQuery.trim() && setIsSearchOpen(true)}
                placeholder="Search students, pages..."
                className="bg-transparent border-none outline-none text-xs w-full text-textPrimary placeholder:text-textMuted"
              />
              {!searchQuery && (
                <kbd className="hidden lg:inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-mono font-bold text-textMuted bg-surface border border-borderLine shadow-2xs">
                  ⌘K
                </kbd>
              )}
              {searchQuery && (
                <button
                  onClick={() => { setSearchQuery(''); setIsSearchOpen(false); }}
                  className="text-textMuted hover:text-textPrimary p-0.5 rounded-md"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>

            {/* Search dropdown */}
            {isSearchOpen && (
              <div className="absolute left-0 mt-2 w-96 bg-surface border border-borderLine rounded-2xl shadow-xl z-50 overflow-hidden text-xs max-h-96 overflow-y-auto">
                {searching ? (
                  <div className="p-4 text-center text-textSecondary">Searching...</div>
                ) : searchResults.students.length === 0 && searchResults.pages.length === 0 ? (
                  <div className="p-4 text-center text-textSecondary">No results for "{searchQuery}"</div>
                ) : (
                  <div className="divide-y divide-borderLine">
                    {searchResults.pages.length > 0 && (
                      <div className="p-2">
                        <p className="text-[10px] font-bold text-textMuted uppercase tracking-widest px-2 py-1.5">Pages</p>
                        {searchResults.pages.map((p) => (
                          <button
                            key={p.path}
                            onClick={() => { navigate(p.path); setIsSearchOpen(false); setSearchQuery(''); }}
                            className="w-full text-left px-3 py-2.5 rounded-xl hover:bg-surface-2 flex items-center justify-between transition-colors"
                          >
                            <span className="font-semibold text-textPrimary">{p.name}</span>
                            <span className="text-[10px] bg-brand-soft text-brand-primary font-bold px-2 py-0.5 rounded-lg">{p.category}</span>
                          </button>
                        ))}
                      </div>
                    )}
                    {searchResults.students.length > 0 && (
                      <div className="p-2">
                        <p className="text-[10px] font-bold text-textMuted uppercase tracking-widest px-2 py-1.5">Students</p>
                        {searchResults.students.map((s) => (
                          <button
                            key={s.roll_number}
                            onClick={() => { navigate(`/profile?id=${s.roll_number}`); setIsSearchOpen(false); setSearchQuery(''); }}
                            className="w-full text-left px-3 py-2.5 rounded-xl hover:bg-surface-2 flex items-center justify-between transition-colors"
                          >
                            <div>
                              <p className="font-bold text-textPrimary">{s.name}</p>
                              <p className="text-[10px] text-textMuted mt-0.5">
                                {s.roll_number} • {s.department || 'N/A'}
                              </p>
                            </div>
                            <span className="text-[10px] font-semibold text-success bg-success-soft px-2 py-0.5 rounded-lg">
                              View 360°
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Day / Night toggle pill */}
        <button
          onClick={() => setIsDarkMode(!isDarkMode)}
          title={isDarkMode ? 'Switch to Day Mode' : 'Switch to Night Mode'}
          aria-label={isDarkMode ? 'Switch to Day Mode' : 'Switch to Night Mode'}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-borderLine bg-surface-2 text-xs font-semibold text-textSecondary hover:border-brand-primary hover:text-brand-primary transition-all"
        >
          {isDarkMode ? (
            <><Sun className="w-3.5 h-3.5 text-amber-400" /><span className="hidden sm:inline">Day</span></>
          ) : (
            <><Moon className="w-3.5 h-3.5 text-indigo-400" /><span className="hidden sm:inline">Night</span></>
          )}
        </button>

        {/* Notification bell & dropdown */}
        <div ref={notifRef} className="relative">
          <button
            onClick={() => setIsNotifOpen(!isNotifOpen)}
            className="relative p-2 rounded-xl text-textSecondary hover:bg-surface-2 hover:text-textPrimary transition-colors focus:outline-none"
            aria-label="View notifications"
          >
            <Bell className="w-4.5 h-4.5" />
            {unreadCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center ring-2 ring-surface shadow-xs animate-in zoom-in-75">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>

          {isNotifOpen && (
            <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-surface rounded-2xl shadow-2xl border border-borderLine z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
              {/* Header */}
              <div className="px-4 py-3 border-b border-borderLine bg-surface-2/60 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Bell className="w-4 h-4 text-brand-primary" />
                  <span className="text-xs font-bold text-textPrimary">Announcements</span>
                  {unreadCount > 0 && (
                    <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-brand-primary/10 text-brand-primary">
                      {unreadCount} new
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {unreadCount > 0 && (
                    <button
                      onClick={handleMarkAllRead}
                      className="text-[11px] font-semibold text-brand-primary hover:underline flex items-center gap-1"
                    >
                      <CheckCheck className="w-3.5 h-3.5" />
                      Mark read
                    </button>
                  )}
                  {canBroadcast && (
                    <button
                      onClick={() => {
                        setIsNotifOpen(false);
                        setIsComposeOpen(true);
                      }}
                      className="px-2 py-1 rounded-lg bg-brand-primary text-white text-[11px] font-semibold hover:bg-brand-primary/90 transition-all flex items-center gap-1 shadow-xs"
                    >
                      <Plus className="w-3 h-3" />
                      Broadcast
                    </button>
                  )}
                </div>
              </div>

              {/* Notifications List */}
              <div className="max-h-80 overflow-y-auto divide-y divide-borderLine/50">
                {notifications.length === 0 ? (
                  <div className="py-10 px-4 text-center">
                    <Bell className="w-8 h-8 text-textSecondary/40 mx-auto mb-2" />
                    <p className="text-xs font-semibold text-textPrimary">No announcements yet</p>
                    <p className="text-[11px] text-textSecondary mt-0.5">
                      Messages from HOD, Principal, or Mentors will show up here.
                    </p>
                  </div>
                ) : (
                  notifications.map((n) => (
                    <div
                      key={n.id}
                      onClick={() => handleSelectNotif(n)}
                      className={`p-3.5 hover:bg-surface-2 transition-colors cursor-pointer text-left relative ${
                        !n.is_read ? 'bg-brand-primary/5' : ''
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-surface-3 text-textPrimary border border-borderLine">
                              {n.sender_name}
                            </span>
                            <span className="text-[10px] text-textSecondary">
                              ({n.sender_role?.toUpperCase()}{n.sender_department ? ` • ${n.sender_department}` : ''})
                            </span>
                            {n.priority === 'urgent' && (
                              <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-amber-500/15 text-amber-600 border border-amber-500/30">
                                URGENT
                              </span>
                            )}
                          </div>
                          <h4 className={`text-xs mt-1 truncate ${!n.is_read ? 'font-bold text-textPrimary' : 'font-medium text-textSecondary'}`}>
                            {n.title}
                          </h4>
                          <p className="text-[11px] text-textSecondary line-clamp-2 mt-0.5 leading-snug">
                            {n.message}
                          </p>
                          <span className="text-[10px] text-textSecondary/80 mt-1 block">
                            {new Date(n.created_at).toLocaleDateString('en-IN', {
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                        </div>
                        {!n.is_read && (
                          <span className="w-2 h-2 rounded-full bg-brand-primary shrink-0 mt-1.5" />
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* Profile dropdown */}
        <div ref={profileRef} className="relative border-l border-borderLine pl-3 md:pl-4">
          <button
            onClick={() => setIsProfileOpen(!isProfileOpen)}
            className="flex items-center gap-2.5 p-1.5 rounded-xl hover:bg-surface-2 transition-all focus:outline-none"
          >
            <div className="w-8 h-8 rounded-full overflow-hidden bg-brand-primary text-white font-bold flex items-center justify-center text-xs shadow-xs ring-2 ring-brand-soft">
              {photoUrl ? (
                <img src={photoUrl} alt={displayName} className="w-full h-full object-cover" />
              ) : (
                avatarText
              )}
            </div>
            <div className="hidden sm:block text-left">
              <div className="flex items-center gap-1">
                <p className="text-xs font-bold text-textPrimary leading-tight">{displayName}</p>
                <ChevronDown className={`w-3 h-3 text-textMuted transition-transform ${isProfileOpen ? 'rotate-180' : ''}`} />
              </div>
              <p className="text-[10px] text-brand-primary font-bold tracking-wider">{roleLabel}</p>
            </div>
          </button>

          {/* Dropdown menu */}
          {isProfileOpen && (
            <div className="absolute right-0 mt-2 w-64 bg-surface border border-borderLine rounded-2xl shadow-xl z-50 overflow-hidden">
              {/* Profile header */}
              <div className="p-4 border-b border-borderLine" style={{ background: 'linear-gradient(135deg, var(--color-brand-subtle), var(--color-surface-2))' }}>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full overflow-hidden bg-brand-primary text-white font-bold flex items-center justify-center text-sm shadow-xs shrink-0 ring-2 ring-brand-soft">
                    {photoUrl ? (
                      <img src={photoUrl} alt={displayName} className="w-full h-full object-cover" />
                    ) : (
                      avatarText
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold text-textPrimary truncate">{displayName}</p>
                    <p className="text-[10px] text-textMuted truncate mt-0.5">{user?.email}</p>
                    <span className="inline-block mt-1.5 text-[9px] font-extrabold uppercase px-2 py-0.5 rounded-lg bg-brand-soft text-brand-primary border border-brand-primary/20">
                      {roleLabel}
                    </span>
                  </div>
                </div>
              </div>

              <div className="p-2 space-y-0.5">
                {user?.role === 'hod' ? (
                  <>
                    <button
                      onClick={() => { setIsProfileOpen(false); navigate('/hod/dashboard'); }}
                      className="w-full px-3 py-2.5 rounded-xl text-xs font-semibold text-textPrimary hover:bg-surface-2 flex items-center gap-2.5 transition-colors"
                    >
                      <User className="w-3.5 h-3.5 text-brand-primary" />
                      <span>HOD Executive Dashboard</span>
                    </button>
                    <button
                      onClick={() => { setIsProfileOpen(false); navigate('/hod/dashboard?tab=attendance'); }}
                      className="w-full px-3 py-2.5 rounded-xl text-xs font-semibold text-textPrimary hover:bg-surface-2 flex items-center gap-2.5 transition-colors"
                    >
                      <CalendarCheck className="w-3.5 h-3.5 text-brand-primary" />
                      <span>Attendance Tracker</span>
                    </button>
                  </>
                ) : user?.role === 'admin' ? (
                  <>
                    <button
                      onClick={() => { setIsProfileOpen(false); navigate('/admin/dashboard'); }}
                      className="w-full px-3 py-2.5 rounded-xl text-xs font-semibold text-textPrimary hover:bg-surface-2 flex items-center gap-2.5 transition-colors"
                    >
                      <User className="w-3.5 h-3.5 text-brand-primary" />
                      <span>Admin Dashboard</span>
                    </button>
                    <button
                      onClick={() => { setIsProfileOpen(false); navigate('/admin/faculty'); }}
                      className="w-full px-3 py-2.5 rounded-xl text-xs font-semibold text-textPrimary hover:bg-surface-2 flex items-center gap-2.5 transition-colors"
                    >
                      <Users className="w-3.5 h-3.5 text-brand-primary" />
                      <span>Faculty Management</span>
                    </button>
                  </>
                ) : user?.role === 'faculty' ? (
                  <>
                    <button
                      onClick={() => { setIsProfileOpen(false); navigate('/faculty/dashboard'); }}
                      className="w-full px-3 py-2.5 rounded-xl text-xs font-semibold text-textPrimary hover:bg-surface-2 flex items-center gap-2.5 transition-colors"
                    >
                      <User className="w-3.5 h-3.5 text-brand-primary" />
                      <span>Faculty Dashboard</span>
                    </button>
                    <button
                      onClick={() => { setIsProfileOpen(false); navigate('/faculty/dashboard?tab=profile'); }}
                      className="w-full px-3 py-2.5 rounded-xl text-xs font-semibold text-textPrimary hover:bg-surface-2 flex items-center gap-2.5 transition-colors"
                    >
                      <UserCheck className="w-3.5 h-3.5 text-brand-primary" />
                      <span>My Faculty Profile</span>
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={() => { setIsProfileOpen(false); navigate('/profile'); }}
                      className="w-full px-3 py-2.5 rounded-xl text-xs font-semibold text-textPrimary hover:bg-surface-2 flex items-center gap-2.5 transition-colors"
                    >
                      <User className="w-3.5 h-3.5 text-brand-primary" />
                      <span>My Profile & Demographics</span>
                    </button>
                    <button
                      onClick={() => { setIsProfileOpen(false); navigate('/profile?tab=coding-profiles'); }}
                      className="w-full px-3 py-2.5 rounded-xl text-xs font-semibold text-textPrimary hover:bg-surface-2 flex items-center gap-2.5 transition-colors"
                    >
                      <Code2 className="w-3.5 h-3.5 text-brand-primary" />
                      <span>Coding Profiles & Stats</span>
                    </button>
                  </>
                )}
              </div>

              <div className="p-2 border-t border-borderLine">
                <button
                  onClick={handleLogout}
                  className="w-full px-3 py-2.5 rounded-xl text-xs font-bold text-alert hover:bg-alert-soft flex items-center gap-2.5 transition-colors"
                >
                  <LogOut className="w-3.5 h-3.5 text-alert" />
                  <span>Sign Out / Logout</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Compose Broadcast Modal */}
      {isComposeOpen && (
        <BroadcastComposeModal
          isOpen={isComposeOpen}
          onClose={() => setIsComposeOpen(false)}
        />
      )}

      {/* Selected Notice Detail Modal */}
      {selectedNotif && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="relative w-full max-w-lg bg-surface rounded-2xl shadow-2xl border border-borderLine p-6 flex flex-col max-h-[85vh] overflow-hidden">
            <div className="flex items-start justify-between pb-4 border-b border-borderLine">
              <div>
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-brand-primary/10 text-brand-primary border border-brand-primary/20 uppercase">
                    {selectedNotif.sender_role}
                  </span>
                  <span className="text-xs text-textSecondary">
                    From {selectedNotif.sender_name} {selectedNotif.sender_department ? `(${selectedNotif.sender_department})` : ''}
                  </span>
                </div>
                <h3 className="text-base font-bold text-textPrimary mt-1.5">{selectedNotif.title}</h3>
                <span className="text-[11px] text-textSecondary mt-0.5 block">
                  {new Date(selectedNotif.created_at).toLocaleDateString('en-IN', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              </div>
              <button
                onClick={() => setSelectedNotif(null)}
                className="p-1 rounded-lg text-textSecondary hover:text-textPrimary hover:bg-surface-2 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="py-4 text-xs sm:text-sm text-textPrimary whitespace-pre-wrap leading-relaxed overflow-y-auto flex-1">
              {selectedNotif.message}
            </div>
            <div className="pt-3 border-t border-borderLine flex justify-end">
              <button
                onClick={() => setSelectedNotif(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-brand-primary text-white hover:bg-brand-primary/90 transition-all"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
};
