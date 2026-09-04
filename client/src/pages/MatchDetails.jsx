import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import api from '../api';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import {
  Heart, Package, Clock, ShieldCheck, Mail, Phone, MapPin,
  ArrowLeft, Loader2, CheckCircle2, AlertTriangle, Activity,
  Droplets, Navigation, Truck, Radio, RadioTower, XCircle,
  Wifi, WifiOff, Play, Flag, Star
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';

// ── Leaflet Icon Setup ──────────────────────────────────────────────────────
// Fix Leaflet default icon loading issue in Vite
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

const currentLocationIcon = L.divIcon({
  html: `<div style="background:#ef4444;width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;box-shadow:0 0 0 6px rgba(239,68,68,0.25);border:3px solid white;">
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
      <polygon points="3 11 22 2 13 21 11 13 3 11"/>
    </svg>
  </div>`,
  className: '',
  iconSize: [32, 32],
  iconAnchor: [16, 16],
});

const destinationIcon = L.divIcon({
  html: `<div style="background:#0ea5e9;width:36px;height:36px;border-radius:50%;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,0.3);border:3px solid white;">
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
      <polyline points="9 22 9 12 15 12 15 22"/>
    </svg>
  </div>`,
  className: '',
  iconSize: [36, 36],
  iconAnchor: [18, 18],
});

// ── Status helpers ──────────────────────────────────────────────────────────
const STATUS_STEPS = ['initiated', 'in_transit', 'arrived', 'completed'];
const STATUS_LABELS = {
  initiated:  { label: 'Initiated',  color: 'text-amber-600',  bg: 'bg-amber-50  border-amber-200'  },
  in_transit: { label: 'In Transit', color: 'text-blue-600',   bg: 'bg-blue-50   border-blue-200'   },
  arrived:    { label: 'Arrived',    color: 'text-emerald-600', bg: 'bg-emerald-50 border-emerald-200' },
  completed:  { label: 'Completed',  color: 'text-slate-600',  bg: 'bg-slate-50  border-slate-200'  },
};

const formatTs = (ts) => {
  if (!ts) return '—';
  return new Date(ts).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
};

// ── GPS throttle: send at most 1 update per 20 seconds ─────────────────────
const GPS_THROTTLE_MS = 20000;

// ── Main Component ──────────────────────────────────────────────────────────
const MatchDetails = () => {
  const { id } = useParams();         // request id
  const navigate = useNavigate();
  const { user } = useAuth();
  const socket = useSocket();

  // Core data
  const [request, setRequest]           = useState(null);
  const [transaction, setTransaction]   = useState(null);
  const [loading, setLoading]           = useState(true);

  // Tracking session
  const [trackingSession, setTrackingSession] = useState(null);   // null = not checked yet; false = confirmed 404
  const [trackingLoading, setTrackingLoading] = useState(true);

  // GPS
  const [liveLocation, setLiveLocation]         = useState(null);   // {lat, lng, timestamp}
  const [locationPermission, setLocationPermission] = useState('idle'); // idle|requesting|granted|denied|unavailable
  const gpsWatchIdRef   = useRef(null);
  const lastGpsSentRef  = useRef(0);
  const activeSessionRef = useRef(null);  // keeps reference stable in GPS closure

  // Actions
  const [isStartingTransfer, setIsStartingTransfer] = useState(false);
  const [isUpdatingStatus, setIsUpdatingStatus]     = useState(false);

  // Socket
  const [socketJoined, setSocketJoined] = useState(false);

  // ── Load request ──────────────────────────────────────────────────────────
  useEffect(() => {
    const load = async () => {
      try {
        const { data } = await api.get(`/requests/${id}`);
        setRequest(data);
      } catch (err) {
        toast.error('Failed to load request details.');
        navigate('/dashboard');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [id, navigate]);

  // ── Load transaction (when request is matched) ────────────────────────────
  useEffect(() => {
    if (!request || request.status !== 'matched') return;
    api.get(`/requests/${id}/transaction`)
      .then(({ data }) => setTransaction(data))
      .catch(() => {}); // not all matched requests will have a visible transaction for this user
  }, [request, id]);

  // ── Load existing tracking session ────────────────────────────────────────
  useEffect(() => {
    if (!request || request.status !== 'matched') {
      setTrackingLoading(false);
      return;
    }
    const checkTracking = async () => {
      try {
        const { data } = await api.get(`/tracking/reference/organ_transfer/${id}`);
        setTrackingSession(data);
        activeSessionRef.current = data;
        if (data.current_latitude && data.current_longitude) {
          setLiveLocation({ lat: data.current_latitude, lng: data.current_longitude, timestamp: data.updated_at });
        }
      } catch (err) {
        if (err.response?.status === 404) {
          setTrackingSession(false); // confirmed: no session
        } else if (err.response?.status === 403) {
          setTrackingSession(false);
        }
        // 500 or network: leave as null, don't show Start Transfer yet
      } finally {
        setTrackingLoading(false);
      }
    };
    checkTracking();
  }, [request, id]);

  // ── GPS cleanup on unmount ────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (gpsWatchIdRef.current !== null) {
        navigator.geolocation.clearWatch(gpsWatchIdRef.current);
        gpsWatchIdRef.current = null;
      }
    };
  }, []);

  // ── Socket.io join tracking room ──────────────────────────────────────────
  useEffect(() => {
    if (!socket || !trackingSession || !trackingSession.id || socketJoined) return;
    if (trackingSession.status === 'completed' || trackingSession.status === 'cancelled') return;

    const token = localStorage.getItem('token');
    socket.emit('join_tracking', {
      tracking_session_id: trackingSession.id,
      token,
      type: 'hospital',
    });
    setSocketJoined(true);

    socket.on('tracking:location', (payload) => {
      if (payload.trackingSessionId !== trackingSession.id) return;
      setLiveLocation({ lat: payload.latitude, lng: payload.longitude, timestamp: payload.timestamp });
      setTrackingSession(prev => prev ? { ...prev, status: payload.status, current_latitude: payload.latitude, current_longitude: payload.longitude } : prev);
    });

    socket.on('tracking:status', (payload) => {
      if (payload.trackingSessionId !== trackingSession.id) return;
      setTrackingSession(prev => prev ? { ...prev, status: payload.status } : prev);
    });

    socket.on('tracking:completed', (payload) => {
      if (payload.trackingSessionId !== trackingSession.id) return;
      setTrackingSession(prev => prev ? { ...prev, status: payload.status } : prev);
      stopGPS();
    });

    return () => {
      socket.off('tracking:location');
      socket.off('tracking:status');
      socket.off('tracking:completed');
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket, trackingSession?.id]);

  // ── GPS helpers ───────────────────────────────────────────────────────────
  const stopGPS = useCallback(() => {
    if (gpsWatchIdRef.current !== null) {
      navigator.geolocation.clearWatch(gpsWatchIdRef.current);
      gpsWatchIdRef.current = null;
    }
  }, []);

  const startGPS = useCallback((session) => {
    if (!navigator.geolocation) {
      setLocationPermission('unavailable');
      toast.error('Geolocation is not supported by your browser.');
      return;
    }
    if (gpsWatchIdRef.current !== null) return; // already watching

    setLocationPermission('requesting');

    const watchId = navigator.geolocation.watchPosition(
      async (position) => {
        setLocationPermission('granted');
        const { latitude, longitude } = position.coords;
        setLiveLocation({ lat: latitude, lng: longitude, timestamp: new Date().toISOString() });

        // Throttle: send at most every GPS_THROTTLE_MS
        const now = Date.now();
        if (now - lastGpsSentRef.current < GPS_THROTTLE_MS) return;
        lastGpsSentRef.current = now;

        const currentSession = activeSessionRef.current || session;
        if (!currentSession?.id) return;
        if (currentSession.status === 'completed' || currentSession.status === 'cancelled') {
          stopGPS();
          return;
        }

        try {
          const { data } = await api.post(`/tracking/${currentSession.id}/location`, { latitude, longitude });
          activeSessionRef.current = { ...activeSessionRef.current, ...data };
          setTrackingSession(prev => prev ? { ...prev, ...data } : prev);
        } catch (err) {
          // Don't show toast on every failure — could be throttle or network blip
          console.warn('Location update failed:', err.response?.data?.error || err.message);
        }
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          setLocationPermission('denied');
          toast.error('Location permission denied. Enable it to track this transfer.');
        } else {
          setLocationPermission('unavailable');
          toast.error('Unable to obtain your GPS location.');
        }
      },
      { enableHighAccuracy: true, timeout: 30000, maximumAge: 10000 }
    );

    gpsWatchIdRef.current = watchId;
  }, [stopGPS]);

  // ── Start Transfer action ─────────────────────────────────────────────────
  const handleStartTransfer = async () => {
    setIsStartingTransfer(true);
    try {
      const { data } = await api.post('/tracking/start', {
        reference_type: 'organ_transfer',
        reference_id: parseInt(id, 10),
      });
      setTrackingSession(data);
      activeSessionRef.current = data;
      toast.success('Transfer started! Requesting GPS permission...');
      startGPS(data);
    } catch (err) {
      const msg = err.response?.data?.error || 'Failed to start transfer.';
      toast.error(msg);
    } finally {
      setIsStartingTransfer(false);
    }
  };

  // ── Status change action ──────────────────────────────────────────────────
  const handleStatusChange = async (newStatus) => {
    if (!trackingSession?.id) return;
    setIsUpdatingStatus(true);
    try {
      const { data } = await api.post(`/tracking/${trackingSession.id}/status`, { status: newStatus });
      setTrackingSession(prev => prev ? { ...prev, ...data } : prev);
      activeSessionRef.current = { ...activeSessionRef.current, ...data };
      toast.success(`Status updated: ${STATUS_LABELS[newStatus]?.label || newStatus}`);
      if (newStatus === 'completed' || newStatus === 'cancelled') {
        stopGPS();
      }
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to update status.');
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  // ── Resume GPS for active in-progress session ─────────────────────────────
  const handleResumeGPS = () => {
    if (!trackingSession) return;
    startGPS(trackingSession);
  };

  // ── Render helpers ────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Loader2 className="animate-spin w-8 h-8 text-primary-600" />
      </div>
    );
  }
  if (!request) return null;

  const isMatched  = request.status === 'matched';
  const isOrgan    = request.resource_type === 'organ';
  const trackStatus = trackingSession?.status;
  const isTerminal = trackStatus === 'completed' || trackStatus === 'cancelled';

  // Map center: prefer live location, else null (show waiting)
  const mapCenter = liveLocation ? [liveLocation.lat, liveLocation.lng] : null;

  return (
    <div className="max-w-5xl mx-auto py-10 space-y-8">
      {/* Back */}
      <button
        onClick={() => navigate(-1)}
        className="flex items-center gap-2 text-slate-500 hover:text-primary-600 transition-colors font-medium"
      >
        <ArrowLeft className="w-5 h-5" /> Back
      </button>

      {/* ── Header Card ── */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="card shadow-2xl overflow-hidden"
      >
        {/* Hero bar */}
        <div className={`p-8 text-white ${isMatched ? 'bg-emerald-600' : 'bg-primary-600'}`}>
          <div className="flex flex-wrap justify-between items-start gap-4">
            <div className="space-y-1">
              <span className="px-3 py-1 bg-white/20 rounded-full text-xs font-extrabold uppercase tracking-widest border border-white/30">
                Case #{request.id.toString().padStart(5, '0')}
              </span>
              <h1 className="text-3xl font-black">
                {isOrgan ? '🫀 Organ Transfer' : '📦 Resource Request'}
              </h1>
            </div>
            <div className="text-right space-y-1">
              <span className={`inline-block px-4 py-1.5 rounded-full text-xs font-black uppercase border-2 border-white/50 ${isMatched ? 'bg-emerald-500' : 'bg-primary-500'}`}>
                {request.status} {isMatched && '✓'}
              </span>
              <p className="text-white/70 text-xs font-mono">
                {formatTs(request.created_at)}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mt-6 pt-6 border-t border-white/20">
            <div>
              <p className="text-xs uppercase font-black opacity-50 mb-1">Resource</p>
              <p className="font-bold text-lg capitalize">{request.resource_type}</p>
            </div>
            <div>
              <p className="text-xs uppercase font-black opacity-50 mb-1">Urgency</p>
              <p className={`font-bold text-lg capitalize ${request.urgency === 'critical' ? 'text-red-200' : ''}`}>
                {request.urgency === 'critical' && <AlertTriangle className="inline w-4 h-4 mr-1 animate-pulse" />}
                {request.urgency}
              </p>
            </div>
            <div>
              <p className="text-xs uppercase font-black opacity-50 mb-1">Requested By</p>
              <p className="font-bold text-sm">{request.requester_name}</p>
              <p className="text-xs opacity-70">{request.city}, {request.state}</p>
            </div>
            <div>
              <p className="text-xs uppercase font-black opacity-50 mb-1">Contact</p>
              <p className="font-bold text-sm">{request.contact_number || '—'}</p>
            </div>
          </div>
        </div>

        {/* ── Body ── */}
        <div className="p-8 bg-white space-y-8">
          {/* Notes */}
          {request.notes && (
            <div className="p-5 bg-slate-50 rounded-2xl border-l-4 border-primary-500 italic text-slate-700">
              "{request.notes}"
            </div>
          )}

          {/* ── DONOR ACCEPTANCE ACTION (For pending request when user is donor) ── */}
          {request.status === 'pending' && request.is_donor && (
            <motion.div 
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              className="p-6 bg-gradient-to-r from-amber-50 to-orange-50 border-2 border-amber-300 rounded-2xl space-y-4"
            >
              <div className="flex items-center gap-3">
                <AlertTriangle className="w-6 h-6 text-amber-600 flex-shrink-0" />
                <div>
                  <h3 className="font-bold text-amber-900 text-lg">Incoming Resource Request</h3>
                  <p className="text-sm text-amber-700">Hospital {request.requester_name} has requested this {request.resource_type}.</p>
                </div>
              </div>
              <button
                onClick={async () => {
                  try {
                    await api.post(`/requests/${id}/accept`);
                    toast.success('Request accepted! Transaction logged.');
                    // Reload request & transaction
                    const { data: updatedReq } = await api.get(`/requests/${id}`);
                    setRequest(updatedReq);
                    if (updatedReq.status === 'matched') {
                      const { data: tx } = await api.get(`/requests/${id}/transaction`);
                      setTransaction(tx);
                    }
                  } catch (err) {
                    toast.error(err.response?.data?.error || 'Failed to accept request.');
                  }
                }}
                className="w-full py-4 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-lg rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-emerald-200 transition-colors"
              >
                <CheckCircle2 className="w-6 h-6" /> Accept Request & Reserve Resource
              </button>
            </motion.div>
          )}

          {/* ── TRANSACTION / ACCEPTANCE INFO ── */}
          {isMatched && (
            <motion.section
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-6"
            >
              <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="w-6 h-6 text-emerald-600 flex-shrink-0" />
                  <div>
                    <h3 className="font-bold text-emerald-900 text-base">
                      ✓ Accepted by {transaction?.donor_name || request.donor_hospital?.name || 'Donor Hospital'}
                    </h3>
                    <p className="text-xs text-emerald-700">
                      Match status is verified on server records.
                    </p>
                  </div>
                </div>
                {transaction?.accepted_at && (
                  <span className="text-xs font-mono text-emerald-800 bg-white/80 px-3 py-1 rounded-full border border-emerald-200 font-bold">
                    {formatTs(transaction.accepted_at)}
                  </span>
                )}
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                {/* Donor */}
                <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
                  <p className="text-[10px] uppercase font-black text-slate-400 tracking-widest">Donor Hospital</p>
                  <p className="text-xl font-bold text-slate-900">{transaction?.donor_name || request.donor_hospital?.name || 'Donor Hospital'}</p>
                  <p className="text-sm text-slate-500 flex items-center gap-1">
                    <MapPin className="w-3 h-3" /> {transaction?.donor_city || request.donor_hospital?.city || 'City'}, {transaction?.donor_state || request.donor_hospital?.state || 'State'}
                  </p>
                  {transaction?.accepted_at && (
                    <p className="text-xs text-slate-400 flex items-center gap-1">
                      <Clock className="w-3 h-3" /> Acceptance Time: {formatTs(transaction.accepted_at)}
                    </p>
                  )}
                </div>
                {/* Recipient */}
                <div className="p-5 rounded-2xl bg-sky-50 border border-sky-200 space-y-2">
                  <p className="text-[10px] uppercase font-black text-sky-600 tracking-widest">Destination Hospital</p>
                  <p className="text-xl font-bold text-slate-900">{transaction?.recipient_name || request.requester_name}</p>
                  <p className="text-sm text-slate-500 flex items-center gap-1">
                    <MapPin className="w-3 h-3" /> {transaction?.recipient_city || request.city}, {transaction?.recipient_state || request.state}
                  </p>
                </div>
              </div>

              {/* Explicit Transfer Status Badge (Acceptance ≠ Transfer Start) */}
              <div className="p-5 rounded-2xl bg-amber-50/70 border border-amber-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="px-3 py-1 bg-amber-200 text-amber-900 rounded-full text-xs font-black uppercase tracking-wider">
                      Transfer Status: {trackingSession ? (STATUS_LABELS[trackingSession.status]?.label || trackingSession.status) : 'NOT STARTED'}
                    </span>
                  </div>
                  <p className="text-xs text-amber-800">
                    {trackingSession 
                      ? 'Live tracking session is active.'
                      : 'Match Accepted. Physical transfer has not started yet.'}
                  </p>
                </div>
              </div>
            </motion.section>
          )}

          {/* ── TRACKING PANEL ── */}
          {isMatched && isOrgan && (
            <OrganTrackingPanel
              requestId={id}
              transaction={transaction}
              trackingSession={trackingSession}
              trackingLoading={trackingLoading}
              liveLocation={liveLocation}
              locationPermission={locationPermission}
              isStartingTransfer={isStartingTransfer}
              isUpdatingStatus={isUpdatingStatus}
              socketJoined={socketJoined}
              mapCenter={mapCenter}
              onStartTransfer={handleStartTransfer}
              onStatusChange={handleStatusChange}
              onResumeGPS={handleResumeGPS}
            />
          )}

          {/* ── Non-organ request basic timeline ── */}
          {!isOrgan && (
            <section className="space-y-4">
              <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest">Request Timeline</h3>
              <div className="space-y-4">
                {[
                  { label: 'Request Initialized', time: formatTs(request.created_at), done: true },
                  { label: 'Notification Routed', time: '—', done: true },
                  { label: 'Hospital Accepted', time: transaction ? formatTs(transaction.accepted_at) : '—', done: isMatched },
                ].map((step, idx) => (
                  <div key={idx} className="flex gap-4">
                    <div className="flex flex-col items-center">
                      <div className={`w-3 h-3 rounded-full ${step.done ? 'bg-emerald-500' : 'bg-slate-200'}`} />
                      {idx !== 2 && <div className={`w-0.5 flex-1 mt-1 ${step.done ? 'bg-emerald-200' : 'bg-slate-100'}`} />}
                    </div>
                    <div className="pb-4">
                      <p className={`text-sm font-bold ${step.done ? 'text-slate-900' : 'text-slate-400'}`}>{step.label}</p>
                      <p className="text-xs text-slate-400">{step.time}</p>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      </motion.div>
    </div>
  );
};

// ── Organ Tracking Panel Sub-component ──────────────────────────────────────
const OrganTrackingPanel = ({
  requestId, transaction,
  trackingSession, trackingLoading,
  liveLocation, locationPermission,
  isStartingTransfer, isUpdatingStatus,
  socketJoined, mapCenter,
  onStartTransfer, onStatusChange, onResumeGPS,
}) => {
  const trackStatus = trackingSession?.status;
  const isTerminal = trackStatus === 'completed' || trackStatus === 'cancelled';
  const stepIndex = STATUS_STEPS.indexOf(trackStatus);

  // ── Still checking for existing session ──
  if (trackingLoading) {
    return (
      <div className="flex items-center gap-3 p-6 bg-slate-50 rounded-2xl border border-slate-200">
        <Loader2 className="animate-spin w-5 h-5 text-primary-600" />
        <span className="text-slate-600 font-medium">Checking transfer status...</span>
      </div>
    );
  }

  // ── No tracking session yet → show Start Transfer ──
  if (trackingSession === false) {
    return (
      <motion.section
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="p-8 bg-gradient-to-br from-primary-50 to-emerald-50 rounded-2xl border border-primary-200 space-y-6"
      >
        <div className="flex items-center gap-3">
          <div className="p-3 bg-primary-100 rounded-xl">
            <Truck className="w-6 h-6 text-primary-600" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-900">Start Organ Transfer</h2>
            <p className="text-sm text-slate-500">Begin live GPS tracking for this organ transfer.</p>
          </div>
        </div>

        <div className="p-4 bg-white/70 rounded-xl border border-primary-100 text-sm text-slate-600 space-y-1">
          <p className="font-semibold text-slate-800">Before you begin:</p>
          <ul className="list-disc list-inside space-y-0.5 text-slate-500">
            <li>Your device's location will be shared with both hospitals.</li>
            <li>Location is only tracked while this page is open.</li>
            <li>GPS permission will be requested after you start.</li>
          </ul>
        </div>

        <button
          id="start-transfer-btn"
          onClick={onStartTransfer}
          disabled={isStartingTransfer}
          className="w-full py-4 bg-primary-600 hover:bg-primary-700 disabled:opacity-60 text-white font-black text-lg rounded-xl flex items-center justify-center gap-3 transition-colors shadow-lg shadow-primary-200"
        >
          {isStartingTransfer ? (
            <><Loader2 className="animate-spin w-5 h-5" /> Starting Transfer...</>
          ) : (
            <><Play className="w-5 h-5" /> Start Organ Transfer</>
          )}
        </button>
      </motion.section>
    );
  }

  // ── Tracking session exists ──
  if (!trackingSession) return null; // still null = still loading or fetch error

  return (
    <motion.section
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      {/* Status Pipeline */}
      <div>
        <h2 className="text-sm font-black text-slate-400 uppercase tracking-widest flex items-center gap-2 mb-4">
          <Activity className="w-4 h-4" /> Transfer Status
          {socketJoined && (
            <span className="ml-auto flex items-center gap-1 text-emerald-600 font-semibold text-[10px]">
              <Radio className="w-3 h-3 animate-pulse" /> LIVE
            </span>
          )}
        </h2>

        {/* Steps */}
        <div className="flex items-center gap-2">
          {STATUS_STEPS.map((s, idx) => {
            const isDone    = idx <= stepIndex;
            const isCurrent = idx === stepIndex;
            const cfg       = STATUS_LABELS[s];
            return (
              <React.Fragment key={s}>
                <div className={`flex-1 flex flex-col items-center gap-1 p-3 rounded-xl border transition-all ${isCurrent ? cfg.bg + ' border-2' : (isDone ? 'bg-emerald-50 border-emerald-100' : 'bg-slate-50 border-slate-100')}`}>
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-black ${isCurrent ? 'bg-white border-2 ' + cfg.color.replace('text', 'border') : (isDone ? 'bg-emerald-500 text-white' : 'bg-slate-200 text-slate-400')}`}>
                    {isDone && !isCurrent ? <CheckCircle2 className="w-4 h-4" /> : idx + 1}
                  </div>
                  <p className={`text-[10px] font-black uppercase tracking-wider ${isCurrent ? cfg.color : (isDone ? 'text-emerald-600' : 'text-slate-400')}`}>
                    {cfg.label}
                  </p>
                </div>
                {idx < STATUS_STEPS.length - 1 && (
                  <div className={`h-0.5 w-6 flex-shrink-0 ${idx < stepIndex ? 'bg-emerald-400' : 'bg-slate-200'}`} />
                )}
              </React.Fragment>
            );
          })}
        </div>
      </div>

      {/* GPS / Location */}
      <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
        <div className="flex items-center justify-between">
          <p className="font-bold text-slate-800 flex items-center gap-2">
            <Navigation className="w-4 h-4 text-red-500" /> Live Location
          </p>
          <GPSStatusBadge permission={locationPermission} watchActive={trackingSession && !isTerminal} />
        </div>

        {!isTerminal && locationPermission !== 'granted' && (
          <button
            onClick={onResumeGPS}
            className="w-full py-2.5 border-2 border-dashed border-primary-300 rounded-xl text-primary-600 font-bold text-sm hover:bg-primary-50 transition-colors"
          >
            {locationPermission === 'denied'
              ? '⚠️ Location permission denied — click to retry'
              : locationPermission === 'unavailable'
              ? '⚠️ GPS unavailable'
              : '📍 Enable Live Location Updates'}
          </button>
        )}

        {locationPermission === 'requesting' && (
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <Loader2 className="animate-spin w-4 h-4" />
            Waiting for location permission...
          </div>
        )}

        {liveLocation ? (
          <div className="text-sm text-slate-600 space-y-1">
            <p><span className="font-semibold">Coordinates:</span> {liveLocation.lat.toFixed(6)}, {liveLocation.lng.toFixed(6)}</p>
            <p><span className="font-semibold">Last updated:</span> {formatTs(liveLocation.timestamp)}</p>
          </div>
        ) : (
          <p className="text-sm text-slate-400 italic">Waiting for real GPS location...</p>
        )}
      </div>

      {/* Live Map */}
      {mapCenter ? (
        <div className="rounded-2xl overflow-hidden border border-slate-200 shadow-sm" style={{ height: '340px' }}>
          <MapContainer
            center={mapCenter}
            zoom={13}
            scrollWheelZoom={false}
            style={{ height: '100%', width: '100%' }}
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            {/* Current transfer location marker */}
            <Marker position={[liveLocation.lat, liveLocation.lng]} icon={currentLocationIcon}>
              <Popup>
                <div className="text-sm font-semibold">📍 Current Transfer Location</div>
                <div className="text-xs text-slate-500 mt-1">{liveLocation.lat.toFixed(5)}, {liveLocation.lng.toFixed(5)}</div>
                <div className="text-xs text-slate-400">{formatTs(liveLocation.timestamp)}</div>
              </Popup>
            </Marker>
          </MapContainer>
        </div>
      ) : (
        !isTerminal && (
          <div className="h-40 rounded-2xl border-2 border-dashed border-slate-200 flex items-center justify-center text-slate-400 text-sm gap-2">
            <MapPin className="w-5 h-5" /> Waiting for GPS location to display map...
          </div>
        )
      )}

      {/* Action Buttons */}
      {!isTerminal && (
        <div className="flex flex-col sm:flex-row gap-3">
          {trackStatus === 'initiated' && (
            <StatusButton
              label="Mark In Transit"
              icon={<Truck className="w-4 h-4" />}
              color="blue"
              loading={isUpdatingStatus}
              onClick={() => onStatusChange('in_transit')}
            />
          )}
          {(trackStatus === 'initiated' || trackStatus === 'in_transit') && (
            <StatusButton
              label="Mark Arrived"
              icon={<Flag className="w-4 h-4" />}
              color="emerald"
              loading={isUpdatingStatus}
              onClick={() => onStatusChange('arrived')}
            />
          )}
          {trackStatus === 'arrived' && (
            <StatusButton
              label="Complete Transfer"
              icon={<Star className="w-4 h-4" />}
              color="primary"
              loading={isUpdatingStatus}
              onClick={() => onStatusChange('completed')}
            />
          )}
        </div>
      )}

      {/* Completion Banner */}
      {isTerminal && (
        <div className="p-6 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center gap-4">
          <CheckCircle2 className="w-8 h-8 text-emerald-600 flex-shrink-0" />
          <div>
            <p className="font-bold text-emerald-800 text-lg">Transfer {trackStatus === 'completed' ? 'Completed' : 'Cancelled'}</p>
            <p className="text-emerald-600 text-sm">GPS tracking has been stopped. The organ transfer record is finalized.</p>
          </div>
        </div>
      )}

      {/* Transfer info summary */}
      {transaction && (
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
            <p className="text-[10px] uppercase font-black text-slate-400 mb-1">Transfer Started</p>
            <p className="font-semibold text-slate-800">{formatTs(trackingSession.started_at)}</p>
          </div>
          <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
            <p className="text-[10px] uppercase font-black text-slate-400 mb-1">Last Updated</p>
            <p className="font-semibold text-slate-800">{formatTs(trackingSession.updated_at)}</p>
          </div>
        </div>
      )}
    </motion.section>
  );
};

// ── Small helpers ───────────────────────────────────────────────────────────
const GPSStatusBadge = ({ permission, watchActive }) => {
  const cfg = {
    idle:       { label: 'GPS Off',       cls: 'bg-slate-100 text-slate-500',   icon: <WifiOff className="w-3 h-3" /> },
    requesting: { label: 'Requesting...',  cls: 'bg-amber-100 text-amber-600',   icon: <Loader2 className="w-3 h-3 animate-spin" /> },
    granted:    { label: 'GPS Active',    cls: 'bg-emerald-100 text-emerald-700',icon: <Wifi className="w-3 h-3" /> },
    denied:     { label: 'GPS Denied',    cls: 'bg-red-100 text-red-600',        icon: <XCircle className="w-3 h-3" /> },
    unavailable:{ label: 'GPS Unavailable',cls:'bg-red-100 text-red-600',        icon: <XCircle className="w-3 h-3" /> },
  }[permission] || { label: 'Unknown', cls: 'bg-slate-100 text-slate-500', icon: null };

  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black uppercase ${cfg.cls}`}>
      {cfg.icon} {cfg.label}
    </span>
  );
};

const STATUS_BTN_COLORS = {
  blue:    'bg-blue-600 hover:bg-blue-700 shadow-blue-200',
  emerald: 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-200',
  primary: 'bg-primary-600 hover:bg-primary-700 shadow-primary-200',
};

const StatusButton = ({ label, icon, color, loading, onClick }) => (
  <button
    onClick={onClick}
    disabled={loading}
    className={`flex-1 py-3 px-4 ${STATUS_BTN_COLORS[color]} disabled:opacity-60 text-white font-bold rounded-xl flex items-center justify-center gap-2 transition-colors shadow-lg`}
  >
    {loading ? <Loader2 className="animate-spin w-4 h-4" /> : icon}
    {label}
  </button>
);

export default MatchDetails;
