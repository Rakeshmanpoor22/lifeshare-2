import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Heart, Activity, Bell, LogOut, Menu, X } from 'lucide-react';
import io from 'socket.io-client';
import toast from 'react-hot-toast';

const Navbar = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);

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

  return (
    <nav className="bg-white border-b border-slate-200 sticky top-0 z-50">
      <div className="container mx-auto px-4">
        <div className="flex justify-between items-center h-16">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-3 group">
            <img 
              src="/logo.jpg" 
              alt="LifeShare Logo" 
              className="h-14 w-auto group-hover:scale-105 transition-transform object-contain"
            />
            <span className="text-2xl font-extrabold bg-clip-text text-transparent bg-gradient-to-r from-primary-600 to-blue-800 tracking-tight">
              LifeShare
            </span>
          </Link>

          {/* Desktop Nav */}
          <div className="hidden md:flex items-center gap-8">
            {user ? (
              <>
                <Link to="/dashboard" className="text-slate-600 hover:text-primary-600 font-medium transition-colors">Dashboard</Link>
                <Link to="/activity" className="text-slate-600 hover:text-primary-600 font-medium transition-colors">Activity History</Link>
                <Link to="/blood-bank" className="text-slate-600 hover:text-primary-600 font-bold transition-colors">Blood Bank</Link>
                <Link to="/map" className="text-slate-600 hover:text-indigo-600 font-medium transition-colors">Map</Link>
                <Link to="/post-resource" className="text-slate-600 hover:text-emerald-600 font-medium transition-colors">List Resource</Link>
                <Link to="/request" className="text-emerald-600 hover:text-emerald-700 font-bold transition-colors">Request</Link>
                <div className="relative group">
                  <button className="p-2 text-slate-500 hover:bg-slate-50 rounded-full transition-colors relative">
                    <Bell className="w-5 h-5" />
                    {notifications.length > 0 && (
                      <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full border-2 border-white"></span>
                    )}
                  </button>
                  {/* Notification Dropdown (Simple) */}
                  <div className="absolute right-0 top-full mt-2 w-72 bg-white rounded-xl shadow-lg border border-slate-100 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all py-2">
                    <div className="px-4 py-2 border-b border-slate-50 text-sm font-semibold text-slate-500">Notifications</div>
                    <div className="max-h-64 overflow-y-auto">
                      {notifications.length === 0 ? (
                        <div className="px-4 py-6 text-center text-slate-400 text-sm">No new alerts</div>
                      ) : (
                        notifications.map((n, i) => (
                          <div key={i} className="px-4 py-3 hover:bg-slate-50 text-sm border-b border-slate-50 last:border-0">
                            {n.message}
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3 pl-4 border-l border-slate-200">
                  <div className="text-right">
                    <p className="text-sm font-semibold text-slate-900">{user.name}</p>
                    <p className="text-xs text-slate-500 capitalize">{user.city}</p>
                  </div>
                  <button onClick={handleLogout} className="p-2 text-slate-500 hover:text-red-600 transition-colors">
                    <LogOut className="w-5 h-5" />
                  </button>
                </div>
              </>
            ) : (
              <>
                <Link to="/login" className="text-slate-600 font-medium">Login</Link>
                <Link to="/signup" className="btn-primary">Get Started</Link>
              </>
            )}
          </div>

          {/* Mobile Toggle */}
          <button className="md:hidden" onClick={() => setIsOpen(!isOpen)}>
            {isOpen ? <X /> : <Menu />}
          </button>
        </div>
      </div>

      {/* Mobile Menu */}
      {isOpen && (
        <div className="md:hidden bg-white border-t border-slate-100 px-4 py-4 space-y-3">
          {user ? (
            <>
              <Link to="/dashboard" onClick={() => setIsOpen(false)} className="block py-2 text-slate-600 font-medium">Dashboard</Link>
              <Link to="/activity" onClick={() => setIsOpen(false)} className="block py-2 text-slate-600 font-medium">Activity</Link>
              <Link to="/blood-bank" onClick={() => setIsOpen(false)} className="block py-2 text-slate-600 font-bold">Blood Bank (Live)</Link>
              <Link to="/map" onClick={() => setIsOpen(false)} className="block py-2 text-indigo-600 font-medium">Map</Link>
              <Link to="/post-resource" onClick={() => setIsOpen(false)} className="block py-2 text-slate-600 font-medium">List Resource</Link>
              <Link to="/request" onClick={() => setIsOpen(false)} className="block py-2 text-emerald-600 font-bold">Request</Link>
              <button onClick={handleLogout} className="flex items-center gap-2 py-2 text-red-600 font-medium">
                <LogOut className="w-4 h-4" /> Logout
              </button>
            </>
          ) : (
            <>
              <Link to="/login" onClick={() => setIsOpen(false)} className="block py-2 text-slate-600 font-medium">Login</Link>
              <Link to="/signup" onClick={() => setIsOpen(false)} className="block py-2 btn-primary text-center">Get Started</Link>
            </>
          )}
        </div>
      )}
    </nav>
  );
};

export default Navbar;

