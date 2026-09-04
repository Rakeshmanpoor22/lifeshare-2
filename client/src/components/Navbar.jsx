import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  Heart, Activity, Bell, LogOut, Menu, X,
  ChevronDown, PlusCircle, MapPin, Droplets,
  Building2, Package, ClipboardList, User
} from 'lucide-react';
import io from 'socket.io-client';
import toast from 'react-hot-toast';

const Navbar = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [resourcesOpen, setResourcesOpen] = useState(false);
  const [mobileResourcesOpen, setMobileResourcesOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const resourcesRef = useRef(null);

  // Close Resources dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (resourcesRef.current && !resourcesRef.current.contains(e.target)) {
        setResourcesOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Close mobile menu on route change
  useEffect(() => {
    setMobileOpen(false);
    setResourcesOpen(false);
  }, [location.pathname]);

  // Socket.io notifications
  useEffect(() => {
    if (user) {
      const socketUrl = (import.meta.env.VITE_API_URL || 'http://localhost:5000/api').replace('/api', '');
      const socket = io(socketUrl);
      socket.emit('join', user.id);

      socket.on('new_notification', (data) => {
        toast.success(data.message, { duration: 5000 });
        setNotifications((prev) => [data, ...prev]);
      });

      return () => socket.disconnect();
    }
  }, [user]);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const isActive = (path) => location.pathname === path;
  const isActiveGroup = (paths) => paths.some(p => location.pathname === p);

  const navLinkClass = (path) =>
    `relative px-1 py-1 text-sm font-medium transition-colors whitespace-nowrap ${
      isActive(path)
        ? 'text-primary-600'
        : 'text-slate-600 hover:text-primary-600'
    }`;

  const activeBar = (path) =>
    isActive(path)
      ? 'absolute -bottom-[19px] left-0 right-0 h-[2px] bg-primary-600 rounded-full'
      : '';

  return (
    <nav className="bg-white border-b border-slate-200 sticky top-0 z-50">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-16">

          {/* ── Logo ── */}
          <Link to="/" className="flex items-center gap-2 flex-shrink-0 group">
            <img
              src="/logo.jpg"
              alt="LifeShare Logo"
              className="h-10 w-auto group-hover:scale-105 transition-transform object-contain rounded-md"
            />
            <span className="text-xl font-extrabold bg-clip-text text-transparent bg-gradient-to-r from-primary-600 to-blue-800 tracking-tight hidden sm:inline">
              LifeShare
            </span>
          </Link>

          {/* ── Desktop Navigation ── */}
          <div className="hidden lg:flex items-center gap-5 flex-1 justify-center">
            {user ? (
              <>
                {/* Primary Links */}
                <Link to="/dashboard" className={navLinkClass('/dashboard')}>
                  Dashboard
                  <span className={activeBar('/dashboard')} />
                </Link>

                <Link to="/hospitals" className={navLinkClass('/hospitals')}>
                  Hospitals
                  <span className={activeBar('/hospitals')} />
                </Link>

                <Link to="/blood-banks" className={navLinkClass('/blood-banks')}>
                  Blood Banks
                  <span className={activeBar('/blood-banks')} />
                </Link>

                {/* Resources Dropdown */}
                <div className="relative" ref={resourcesRef}>
                  <button
                    onClick={() => setResourcesOpen(!resourcesOpen)}
                    className={`flex items-center gap-1 px-1 py-1 text-sm font-medium transition-colors whitespace-nowrap ${
                      isActiveGroup(['/activity', '/blood-bank', '/post-resource'])
                        ? 'text-primary-600'
                        : 'text-slate-600 hover:text-primary-600'
                    }`}
                    aria-expanded={resourcesOpen}
                    aria-haspopup="true"
                  >
                    Resources
                    <ChevronDown className={`w-3.5 h-3.5 transition-transform ${resourcesOpen ? 'rotate-180' : ''}`} />
                    {isActiveGroup(['/activity', '/blood-bank', '/post-resource']) && (
                      <span className="absolute -bottom-[19px] left-0 right-0 h-[2px] bg-primary-600 rounded-full" />
                    )}
                  </button>

                  {resourcesOpen && (
                    <div className="absolute left-0 top-full mt-[19px] w-52 bg-white rounded-lg shadow-xl border border-slate-100 py-1.5 z-50 animate-in fade-in slide-in-from-top-1 duration-150">
                      <Link
                        to="/activity"
                        onClick={() => setResourcesOpen(false)}
                        className={`flex items-center gap-2.5 px-4 py-2.5 text-sm transition-colors ${
                          isActive('/activity') ? 'text-primary-600 bg-primary-50' : 'text-slate-700 hover:bg-slate-50 hover:text-primary-600'
                        }`}
                      >
                        <ClipboardList className="w-4 h-4 opacity-60" />
                        Activity History
                      </Link>
                      <Link
                        to="/blood-bank"
                        onClick={() => setResourcesOpen(false)}
                        className={`flex items-center gap-2.5 px-4 py-2.5 text-sm transition-colors ${
                          isActive('/blood-bank') ? 'text-primary-600 bg-primary-50' : 'text-slate-700 hover:bg-slate-50 hover:text-primary-600'
                        }`}
                      >
                        <Droplets className="w-4 h-4 opacity-60" />
                        Live Blood
                      </Link>
                      <Link
                        to="/post-resource"
                        onClick={() => setResourcesOpen(false)}
                        className={`flex items-center gap-2.5 px-4 py-2.5 text-sm transition-colors ${
                          isActive('/post-resource') ? 'text-primary-600 bg-primary-50' : 'text-slate-700 hover:bg-slate-50 hover:text-primary-600'
                        }`}
                      >
                        <Package className="w-4 h-4 opacity-60" />
                        List Resource
                      </Link>
                    </div>
                  )}
                </div>

                <Link to="/map" className={navLinkClass('/map')}>
                  Map
                  <span className={activeBar('/map')} />
                </Link>
              </>
            ) : (
              <>
                <Link to="/hospitals" className={navLinkClass('/hospitals')}>
                  Hospitals
                  <span className={activeBar('/hospitals')} />
                </Link>
                <Link to="/blood-banks" className={navLinkClass('/blood-banks')}>
                  Blood Banks
                  <span className={activeBar('/blood-banks')} />
                </Link>
                <Link to="/map" className={navLinkClass('/map')}>
                  Map
                  <span className={activeBar('/map')} />
                </Link>
              </>
            )}
          </div>

          {/* ── Right Actions (Desktop) ── */}
          <div className="hidden lg:flex items-center gap-3 flex-shrink-0">
            {user ? (
              <>
                {/* Request Button */}
                <Link
                  to="/request"
                  className="flex items-center gap-1.5 px-3.5 py-1.5 bg-primary-600 hover:bg-primary-700 text-white text-sm font-semibold rounded-lg transition-colors shadow-sm"
                >
                  <PlusCircle className="w-4 h-4" />
                  Request
                </Link>

                {/* Notification Bell */}
                <div className="relative group">
                  <button
                    className="relative w-9 h-9 flex items-center justify-center text-slate-500 hover:text-primary-600 hover:bg-slate-100 rounded-lg transition-colors"
                    aria-label="Notifications"
                  >
                    <Bell className="w-[18px] h-[18px]" />
                    {notifications.length > 0 && (
                      <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full ring-2 ring-white" />
                    )}
                  </button>
                  {/* Notification dropdown on hover */}
                  <div className="absolute right-0 top-full mt-1.5 w-72 bg-white rounded-xl shadow-xl border border-slate-100 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 py-1 z-50">
                    <div className="px-4 py-2.5 border-b border-slate-100 text-xs font-bold text-slate-400 uppercase tracking-wider">
                      Notifications
                    </div>
                    <div className="max-h-64 overflow-y-auto">
                      {notifications.length === 0 ? (
                        <div className="px-4 py-8 text-center text-slate-400 text-sm">No new alerts</div>
                      ) : (
                        notifications.map((n, i) => (
                          <div key={i} className="px-4 py-3 hover:bg-slate-50 text-sm text-slate-700 border-b border-slate-50 last:border-0">
                            {n.message}
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>

                {/* Divider */}
                <div className="w-px h-7 bg-slate-200 mx-1" />

                {/* Profile */}
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                    {user.name?.charAt(0)?.toUpperCase() || 'H'}
                  </div>
                  <div className="text-right max-w-[120px]">
                    <p className="text-sm font-semibold text-slate-900 truncate leading-tight">{user.name}</p>
                    <p className="text-[11px] text-slate-400 capitalize leading-tight">{user.city}</p>
                  </div>
                  <button
                    onClick={handleLogout}
                    className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    aria-label="Logout"
                    title="Logout"
                  >
                    <LogOut className="w-4 h-4" />
                  </button>
                </div>
              </>
            ) : (
              <div className="flex items-center gap-3">
                <Link to="/login" className="text-sm text-slate-600 font-medium hover:text-primary-600 transition-colors">Login</Link>
                <Link to="/signup" className="btn-primary text-sm">Get Started</Link>
              </div>
            )}
          </div>

          {/* ── Mobile Hamburger ── */}
          <button
            className="lg:hidden w-10 h-10 flex items-center justify-center text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
          >
            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* ── Mobile Menu ── */}
      {mobileOpen && (
        <div className="lg:hidden bg-white border-t border-slate-100 shadow-lg">
          <div className="container mx-auto px-4 py-3">
            {user ? (
              <div className="space-y-1">
                {/* Profile header */}
                <div className="flex items-center gap-3 px-3 py-3 mb-2 bg-slate-50 rounded-xl">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
                    {user.name?.charAt(0)?.toUpperCase() || 'H'}
                  </div>
                  <div>
                    <p className="font-semibold text-slate-900 text-sm">{user.name}</p>
                    <p className="text-xs text-slate-400 capitalize">{user.city}</p>
                  </div>
                </div>

                {/* Primary nav */}
                <MobileLink to="/dashboard" icon={<Activity className="w-4 h-4" />} active={isActive('/dashboard')}>Dashboard</MobileLink>
                <MobileLink to="/hospitals" icon={<Building2 className="w-4 h-4" />} active={isActive('/hospitals')}>Hospitals</MobileLink>
                <MobileLink to="/blood-banks" icon={<Droplets className="w-4 h-4" />} active={isActive('/blood-banks')}>Blood Banks</MobileLink>
                <MobileLink to="/map" icon={<MapPin className="w-4 h-4" />} active={isActive('/map')}>Map</MobileLink>
                <MobileLink to="/request" icon={<PlusCircle className="w-4 h-4" />} active={isActive('/request')} highlight>Request Resource</MobileLink>

                {/* Resources section */}
                <div className="pt-2 mt-2 border-t border-slate-100">
                  <button
                    onClick={() => setMobileResourcesOpen(!mobileResourcesOpen)}
                    className="flex items-center justify-between w-full px-3 py-2.5 text-sm font-medium text-slate-500 uppercase tracking-wider"
                  >
                    Resources
                    <ChevronDown className={`w-4 h-4 transition-transform ${mobileResourcesOpen ? 'rotate-180' : ''}`} />
                  </button>
                  {mobileResourcesOpen && (
                    <div className="ml-3 space-y-0.5">
                      <MobileLink to="/activity" icon={<ClipboardList className="w-4 h-4" />} active={isActive('/activity')}>Activity History</MobileLink>
                      <MobileLink to="/blood-bank" icon={<Heart className="w-4 h-4" />} active={isActive('/blood-bank')}>Live Blood</MobileLink>
                      <MobileLink to="/post-resource" icon={<Package className="w-4 h-4" />} active={isActive('/post-resource')}>List Resource</MobileLink>
                    </div>
                  )}
                </div>

                {/* Bottom actions */}
                <div className="pt-2 mt-2 border-t border-slate-100">
                  <button
                    onClick={handleLogout}
                    className="flex items-center gap-3 w-full px-3 py-2.5 text-sm font-medium text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                  >
                    <LogOut className="w-4 h-4" />
                    Logout
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-2 py-2">
                <Link to="/hospitals" onClick={() => setMobileOpen(false)} className="block px-3 py-2.5 text-sm text-slate-700 font-medium hover:bg-slate-50 rounded-lg">Hospitals</Link>
                <Link to="/blood-banks" onClick={() => setMobileOpen(false)} className="block px-3 py-2.5 text-sm text-slate-700 font-medium hover:bg-slate-50 rounded-lg">Blood Banks</Link>
                <Link to="/map" onClick={() => setMobileOpen(false)} className="block px-3 py-2.5 text-sm text-slate-700 font-medium hover:bg-slate-50 rounded-lg">Map</Link>
                <hr className="border-slate-100" />
                <Link to="/login" onClick={() => setMobileOpen(false)} className="block px-3 py-2.5 text-sm text-slate-700 font-medium hover:bg-slate-50 rounded-lg">Login</Link>
                <Link to="/signup" onClick={() => setMobileOpen(false)} className="block px-3 py-2.5 text-sm text-center btn-primary">Get Started</Link>
              </div>
            )}
          </div>
        </div>
      )}
    </nav>
  );
};

// ── Mobile Link Component ───────────────────────────────────────────────────
const MobileLink = ({ to, icon, active, highlight, children }) => {
  const location = useLocation();
  return (
    <Link
      to={to}
      className={`flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-lg transition-colors ${
        active
          ? 'text-primary-600 bg-primary-50'
          : highlight
            ? 'text-primary-600 hover:bg-primary-50'
            : 'text-slate-700 hover:bg-slate-50'
      }`}
    >
      <span className={active ? 'text-primary-500' : 'text-slate-400'}>{icon}</span>
      {children}
    </Link>
  );
};

export default Navbar;
