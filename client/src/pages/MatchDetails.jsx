import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, Popup, Polyline } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import api from '../api';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import {
  Heart, Package, Clock, ShieldCheck, Mail, Phone, MapPin,
  ArrowLeft, Loader2, CheckCircle2, AlertTriangle, Activity,
  Droplets, Navigation, Truck, Radio, RadioTower, XCircle,
  Wifi, WifiOff, Play, Flag, Star, Building2
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';

// ── Leaflet Icon Setup ──────────────────────────────────────────────────────
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

const sourceHospitalIcon = L.divIcon({
  html: `<div style="background:#10b981;width:36px;height:36px;border-radius:50%;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(16,185,129,0.4);border:3px solid white;">
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
      <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>
    </svg>
  </div>`,
  className: '',
  iconSize: [36, 36],
  iconAnchor: [18, 18],
});

const currentLocationIcon = L.divIcon({
  html: `<div style="background:#ef4444;width:34px;height:34px;border-radius:50%;display:flex;align-items:center;justify-content:center;box-shadow:0 0 0 8px rgba(239,68,68,0.3);border:3px solid white;">
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
      <polygon points="3 11 22 2 13 21 11 13 3 11"/>
    </svg>
  </div>`,
  className: '',
  iconSize: [34, 34],
  iconAnchor: [17, 17],
});

const destinationIcon = L.divIcon({
  html: `<div style="background:#0284c7;width:36px;height:36px;border-radius:50%;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(2,132,199,0.4);border:3px solid white;">
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

// Distance calculation (Haversine formula in km)
function calculateDistance(lat1, lon1, lat2, lon2) {
  if (!lat1 || !lon1 || !lat2 || !lon2) return null;
  const R = 6371; // Radius of Earth in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; // Distance in km
}

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
  const [trackingSession, setTrackingSession] = useState(null);   // null = loading; false = 404
  const [trackingLoading, setTrackingLoading] = useState(true);

  // GPS
  const [liveLocation, setLiveLocation]         = useState(null);   // {lat, lng, timestamp}
  const [locationPermission, setLocationPermission] = useState('idle');
  const gpsWatchIdRef   = useRef(null);
  const lastGpsSentRef  = useRef(0);
  const activeSessionRef = useRef(null);

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
      .catch(() => {});
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
        if (err.response?.status === 404 || err.response?.status === 403) {
          setTrackingSession(false);
        }
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
    if (gpsWatchIdRef.current !== null) return;

    setLocationPermission('requesting');

    const watchId = navigator.geolocation.watchPosition(
      async (position) => {
        setLocationPermission('granted');
        const { latitude, longitude } = position.coords;
        setLiveLocation({ lat: latitude, lng: longitude, timestamp: new Date().toISOString() });

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

  // ── Start Transfer action (Donor hospital only) ───────────────────────────
  const handleStartTransfer = async () => {
    setIsStartingTransfer(true);
    try {
      const { data } = await api.post('/tracking/start', {
        reference_type: 'organ_transfer',
        reference_id: parseInt(id, 10),
      });
      setTrackingSession(data);
      activeSessionRef.current = data;
      toast.success('Transfer started! Requesting real browser GPS permission...');
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

  const handleResumeGPS = () => {
    if (!trackingSession) return;
    startGPS(trackingSession);
  };

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
  const isDonorUser = request.is_donor || (user && transaction && String(user.id) === String(transaction.donor_hospital_id));

  // Determine Source and Destination details
  const sourceHospital = transaction?.source_hospital || request.donor_hospital || {
    name: request.donor_hospital?.name || 'Yashoda Hospital — Somajiguda',
    address: 'Somajiguda',
    city: 'Hyderabad',
    state: 'Telangana',
    latitude: 17.4234,
    longitude: 78.4593
  };

  const destinationHospital = transaction?.destination_hospital || {
    name: request.requester_name || 'Kamineni Hospital — L.B. Nagar',
    address: request.requester_address || 'L.B. Nagar',
    city: request.city || 'Hyderabad',
    state: request.state || 'Telangana',
    latitude: request.requester_latitude || 17.3850,
    longitude: request.requester_longitude || 78.4867
  };

  // Coordinates for Leaflet
  const sourceCoords = sourceHospital.latitude && sourceHospital.longitude ? [parseFloat(sourceHospital.latitude), parseFloat(sourceHospital.longitude)] : [17.4234, 78.4593];
  const destCoords = destinationHospital.latitude && destinationHospital.longitude ? [parseFloat(destinationHospital.latitude), parseFloat(destinationHospital.longitude)] : [17.3850, 78.4867];
  const currentCoords = liveLocation ? [liveLocation.lat, liveLocation.lng] : null;

  // Map center
  const mapCenter = currentCoords || sourceCoords;

  // Distance check
  const distToDest = currentCoords ? calculateDistance(currentCoords[0], currentCoords[1], destCoords[0], destCoords[1]) : null;
  const isNearDestination = distToDest !== null && distToDest <= 0.5; // Within 500m

  return (
    <div className="max-w-5xl mx-auto py-10 space-y-8">
      {/* Back Button */}
      <button
        onClick={() => navigate(-1)}
        className="flex items-center gap-2 text-slate-500 hover:text-primary-600 transition-colors font-medium"
      >
        <ArrowLeft className="w-5 h-5" /> Back to Dashboard
      </button>

      {/* ── Header Card ── */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="card shadow-2xl overflow-hidden"
      >
        {/* Hero bar */}
        <div className={`p-8 text-white ${isMatched ? 'bg-gradient-to-r from-emerald-600 to-teal-800' : 'bg-gradient-to-r from-primary-600 to-primary-800'}`}>
          <div className="flex flex-wrap justify-between items-start gap-4">
            <div className="space-y-1">
              <span className="px-3 py-1 bg-white/20 rounded-full text-xs font-extrabold uppercase tracking-widest border border-white/30">
                Case #{request.id.toString().padStart(5, '0')}
              </span>
              <h1 className="text-3xl font-black">
                {isOrgan ? '🫀 Controlled Organ Transfer Network' : '📦 Resource Request'}
              </h1>
            </div>
            <div className="text-right space-y-1">
              <span className={`inline-block px-4 py-1.5 rounded-full text-xs font-black uppercase border-2 border-white/50 ${isMatched ? 'bg-emerald-500' : 'bg-primary-500'}`}>
                STATUS: {request.status.toUpperCase()} {isMatched && '✓'}
              </span>
              <p className="text-white/70 text-xs font-mono">
                {formatTs(request.created_at)}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-5 gap-6 mt-6 pt-6 border-t border-white/20">
            <div>
              <p className="text-xs uppercase font-black opacity-50 mb-1">Resource Type</p>
              <p className="font-bold text-lg capitalize">{request.resource_type}</p>
            </div>
            <div>
              <p className="text-xs uppercase font-black opacity-50 mb-1">Requested Organ</p>
              <p className="font-bold text-lg capitalize">{request.requested_resource?.item_type || request.requested_item_type || 'Heart'}</p>
            </div>
            <div>
              <p className="text-xs uppercase font-black opacity-50 mb-1">Blood Group</p>
              <p className="font-bold text-lg uppercase bg-white/20 px-2 py-0.5 rounded inline-block">
                {request.requested_resource?.blood_group || request.requested_blood_group || 'AB+'}
              </p>
            </div>
            <div>
              <p className="text-xs uppercase font-black opacity-50 mb-1">Urgency</p>
              <p className={`font-bold text-lg capitalize ${request.urgency === 'critical' ? 'text-red-200' : ''}`}>
                {request.urgency === 'critical' && <AlertTriangle className="inline w-4 h-4 mr-1 animate-pulse" />}
                {request.urgency}
              </p>
            </div>
            <div>
              <p className="text-xs uppercase font-black opacity-50 mb-1">Destination Hospital</p>
              <p className="font-bold text-sm">{destinationHospital.name}</p>
              <p className="text-xs opacity-70">{destinationHospital.city}, Telangana</p>
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

          {/* ── DONOR ACCEPTANCE ACTION (For pending request) ── */}
          {request.status === 'pending' && isDonorUser && (
            <motion.div 
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              className="p-6 bg-gradient-to-r from-amber-50 to-orange-50 border-2 border-amber-300 rounded-2xl space-y-4"
            >
              <div className="flex items-center gap-3">
                <AlertTriangle className="w-6 h-6 text-amber-600 flex-shrink-0" />
                <div>
                  <h3 className="font-bold text-amber-900 text-lg">Incoming Organ Request</h3>
                  <p className="text-sm text-amber-700">Hospital {destinationHospital.name} has requested this {request.requested_item_type || 'Heart AB+'} organ.</p>
                </div>
              </div>
              <button
                onClick={async () => {
                  try {
                    await api.post(`/requests/${id}/accept`);
                    toast.success('Request accepted! Source hospital notified immediately.');
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
                <CheckCircle2 className="w-6 h-6" /> Accept Request & Reserve Organ
              </button>
            </motion.div>
          )}

          {/* ── MATCHED / ACCEPTED NETWORK DETAILS ── */}
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
                      ✓ Organ Request Accepted
                    </h3>
                    <p className="text-xs text-emerald-700">
                      Match verified on Hyderabad Controlled Network: {sourceHospital.name} ↔ {destinationHospital.name}
                    </p>
                  </div>
                </div>
                {transaction?.accepted_at && (
                  <span className="text-xs font-mono text-emerald-800 bg-white/80 px-3 py-1 rounded-full border border-emerald-200 font-bold">
                    {formatTs(transaction.accepted_at)}
                  </span>
                )}
              </div>

              {/* Source & Destination Hospital Cards */}
              <div className="grid md:grid-cols-2 gap-6">
                {/* Source Hospital (Donor) */}
                <div className="p-6 rounded-2xl bg-emerald-50/60 border border-emerald-200 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] uppercase font-black text-emerald-700 tracking-widest bg-emerald-100 px-2 py-0.5 rounded">SOURCE HOSPITAL</span>
                    <span className="text-xs text-emerald-600 font-mono">ID #{sourceHospital.id}</span>
                  </div>
                  <h3 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                    <Building2 className="w-5 h-5 text-emerald-600" />
                    {sourceHospital.name}
                  </h3>
                  <p className="text-xs text-slate-600 flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5 text-emerald-600" /> {sourceHospital.address || 'Somajiguda'}, {sourceHospital.city || 'Hyderabad'}
                  </p>
                  <div className="p-3 bg-white/80 rounded-xl text-xs font-mono text-slate-700 border border-emerald-100">
                    📍 Lat: {sourceCoords[0]}, Lng: {sourceCoords[1]}
                  </div>
                </div>

                {/* Destination Hospital (Recipient) */}
                <div className="p-6 rounded-2xl bg-sky-50/60 border border-sky-200 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] uppercase font-black text-sky-700 tracking-widest bg-sky-100 px-2 py-0.5 rounded">DESTINATION HOSPITAL</span>
                    <span className="text-xs text-sky-600 font-mono">ID #{destinationHospital.id}</span>
                  </div>
                  <h3 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                    <Building2 className="w-5 h-5 text-sky-600" />
                    {destinationHospital.name}
                  </h3>
                  <p className="text-xs text-slate-600 flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5 text-sky-600" /> {destinationHospital.address || 'L.B. Nagar'}, {destinationHospital.city || 'Hyderabad'}
                  </p>
                  <div className="p-3 bg-white/80 rounded-xl text-xs font-mono text-slate-700 border border-sky-100">
                    📍 Lat: {destCoords[0]}, Lng: {destCoords[1]}
                  </div>
                </div>
              </div>

              {/* Transfer Status Banner */}
              <div className="p-5 rounded-2xl bg-slate-900 text-white flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-lg">
                <div className="space-y-1">
                  <div className="flex items-center gap-3">
                    <span className={`px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider ${
                      trackingSession?.status === 'in_transit' ? 'bg-blue-500 text-white animate-pulse' :
                      trackingSession?.status === 'arrived' ? 'bg-emerald-500 text-white' :
                      trackingSession?.status === 'completed' ? 'bg-slate-700 text-white' :
                      'bg-amber-500 text-amber-950'
                    }`}>
                      TRANSFER STATUS: {trackingSession ? (STATUS_LABELS[trackingSession.status]?.label?.toUpperCase() || trackingSession.status.toUpperCase()) : 'NOT STARTED'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400">
                    {trackingSession 
                      ? 'Live GPS tracking session active.'
                      : 'Acceptance completed. Physical transfer not started. Waiting for source hospital.'}
                  </p>
                </div>
              </div>
            </motion.section>
          )}

          {/* ── ORGAN TRACKING PANEL ── */}
          {isMatched && isOrgan && (
            <OrganTrackingPanel
              requestId={id}
              request={request}
              transaction={transaction}
              isDonorUser={isDonorUser}
              sourceHospital={sourceHospital}
              destinationHospital={destinationHospital}
              sourceCoords={sourceCoords}
              destCoords={destCoords}
              currentCoords={currentCoords}
              trackingSession={trackingSession}
              trackingLoading={trackingLoading}
              liveLocation={liveLocation}
              locationPermission={locationPermission}
              isStartingTransfer={isStartingTransfer}
              isUpdatingStatus={isUpdatingStatus}
              socketJoined={socketJoined}
              mapCenter={mapCenter}
              distToDest={distToDest}
              isNearDestination={isNearDestination}
              onStartTransfer={handleStartTransfer}
              onStatusChange={handleStatusChange}
              onResumeGPS={handleResumeGPS}
            />
          )}
        </div>
      </motion.div>
    </div>
  );
};

// ── Organ Tracking Panel Sub-component ──────────────────────────────────────
const OrganTrackingPanel = ({
  requestId, request, transaction, isDonorUser,
  sourceHospital, destinationHospital,
  sourceCoords, destCoords, currentCoords,
  trackingSession, trackingLoading,
  liveLocation, locationPermission,
  isStartingTransfer, isUpdatingStatus,
  socketJoined, mapCenter, distToDest, isNearDestination,
  onStartTransfer, onStatusChange, onResumeGPS,
}) => {
  const trackStatus = trackingSession?.status;
  const isTerminal = trackStatus === 'completed' || trackStatus === 'cancelled';
  const stepIndex = STATUS_STEPS.indexOf(trackStatus);

  if (trackingLoading) {
    return (
      <div className="flex items-center gap-3 p-6 bg-slate-50 rounded-2xl border border-slate-200">
        <Loader2 className="animate-spin w-5 h-5 text-primary-600" />
        <span className="text-slate-600 font-medium">Checking transfer session...</span>
      </div>
    );
  }

  // ── No tracking session yet → handle START TRANSFER state ──
  if (trackingSession === false) {
    return (
      <motion.section
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="p-8 bg-gradient-to-br from-slate-50 to-emerald-50/50 rounded-2xl border border-slate-200 space-y-6"
      >
        <div className="flex items-center gap-3">
          <div className="p-3 bg-emerald-100 rounded-xl text-emerald-700">
            <Truck className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-900">Organ Transport Control</h2>
            <p className="text-sm text-slate-500">Source: {sourceHospital.name} ➔ Destination: {destinationHospital.name}</p>
          </div>
        </div>

        {/* Check authorization: Only Source Hospital can press START TRANSFER */}
        {isDonorUser ? (
          <div className="space-y-4">
            <div className="p-4 bg-white rounded-xl border border-slate-200 text-sm text-slate-600 space-y-1">
              <p className="font-semibold text-slate-800">Authorized Action (Source Hospital):</p>
              <ul className="list-disc list-inside space-y-0.5 text-slate-500">
                <li>Clicking <strong>START TRANSFER</strong> initializes live transport monitoring.</li>
                <li>Your browser will request real GPS permission (<code>navigator.geolocation.watchPosition</code>).</li>
                <li>Real-time coordinates stream directly to {destinationHospital.name} over Socket.io.</li>
              </ul>
            </div>

            <button
              id="start-transfer-btn"
              onClick={onStartTransfer}
              disabled={isStartingTransfer}
              className="w-full py-4 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white font-black text-lg rounded-xl flex items-center justify-center gap-3 transition-colors shadow-lg shadow-emerald-200"
            >
              {isStartingTransfer ? (
                <><Loader2 className="animate-spin w-5 h-5" /> Initializing Live GPS Stream...</>
              ) : (
                <><Play className="w-5 h-5" /> START TRANSFER</>
              )}
            </button>
          </div>
        ) : (
          <div className="p-6 bg-amber-50 border border-amber-200 rounded-2xl space-y-2 text-center">
            <Clock className="w-8 h-8 text-amber-600 mx-auto animate-pulse" />
            <h3 className="font-bold text-amber-900 text-base">Transfer Status: NOT STARTED</h3>
            <p className="text-xs text-amber-700 max-w-md mx-auto">
              Request accepted! Physical transport must be authorized and started by source hospital (<strong>{sourceHospital.name}</strong>). Live GPS tracking will begin as soon as transfer starts.
            </p>
          </div>
        )}
      </motion.section>
    );
  }

  if (!trackingSession) return null;

  return (
    <motion.section
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      {/* Status Pipeline */}
      <div>
        <h2 className="text-sm font-black text-slate-400 uppercase tracking-widest flex items-center gap-2 mb-4">
          <Activity className="w-4 h-4 text-emerald-600" /> Real-Time Transfer Pipeline
          {socketJoined && (
            <span className="ml-auto flex items-center gap-1 text-emerald-600 font-semibold text-[10px] bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
              <Radio className="w-3 h-3 animate-pulse" /> SOCKET.IO LIVE
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
                <div className={`flex-1 flex flex-col items-center gap-1 p-3 rounded-xl border transition-all ${isCurrent ? cfg.bg + ' border-2 shadow-sm' : (isDone ? 'bg-emerald-50 border-emerald-100' : 'bg-slate-50 border-slate-100')}`}>
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

      {/* GPS / Location Info */}
      <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
        <div className="flex items-center justify-between">
          <p className="font-bold text-slate-800 flex items-center gap-2">
            <Navigation className="w-4 h-4 text-red-500" /> Live GPS Coordinates
          </p>
          <GPSStatusBadge permission={locationPermission} watchActive={trackingSession && !isTerminal} />
        </div>

        {isDonorUser && !isTerminal && locationPermission !== 'granted' && (
          <button
            onClick={onResumeGPS}
            className="w-full py-2.5 border-2 border-dashed border-emerald-400 rounded-xl text-emerald-700 font-bold text-sm hover:bg-emerald-50 transition-colors"
          >
            {locationPermission === 'denied'
              ? '⚠️ Location permission denied — click to retry'
              : locationPermission === 'unavailable'
              ? '⚠️ GPS unavailable'
              : '📍 Enable Real Browser GPS Stream'}
          </button>
        )}

        {liveLocation ? (
          <div className="text-sm text-slate-600 space-y-1">
            <p><span className="font-semibold">Coordinates:</span> {liveLocation.lat.toFixed(6)}, {liveLocation.lng.toFixed(6)}</p>
            <p><span className="font-semibold">Last Socket Update:</span> {formatTs(liveLocation.timestamp)}</p>
            {distToDest !== null && (
              <p className="text-xs text-sky-700 font-semibold mt-1">
                📏 Distance to {destinationHospital.name}: {distToDest.toFixed(2)} km
                {isNearDestination && <span className="ml-2 bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded font-bold animate-pulse">ARRIVED AT DESTINATION</span>}
              </p>
            )}
          </div>
        ) : (
          <p className="text-sm text-slate-400 italic">Waiting for real GPS coordinates stream...</p>
        )}
      </div>

      {/* Interactive Leaflet Map */}
      <div className="rounded-2xl overflow-hidden border border-slate-200 shadow-md" style={{ height: '380px' }}>
        <MapContainer
          center={mapCenter}
          zoom={12}
          scrollWheelZoom={false}
          style={{ height: '100%', width: '100%' }}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          {/* Source Hospital Marker */}
          <Marker position={sourceCoords} icon={sourceHospitalIcon}>
            <Popup>
              <div className="text-sm font-bold text-emerald-800">🏥 {sourceHospital.name}</div>
              <div className="text-xs text-slate-500">Source Hospital (Somajiguda)</div>
              <div className="text-xs font-mono mt-1">Lat: {sourceCoords[0]}, Lng: {sourceCoords[1]}</div>
            </Popup>
          </Marker>

          {/* Destination Hospital Marker */}
          <Marker position={destCoords} icon={destinationIcon}>
            <Popup>
              <div className="text-sm font-bold text-sky-800">🏥 {destinationHospital.name}</div>
              <div className="text-xs text-slate-500">Destination Hospital (L.B. Nagar)</div>
              <div className="text-xs font-mono mt-1">Lat: {destCoords[0]}, Lng: {destCoords[1]}</div>
            </Popup>
          </Marker>

          {/* Live Organ Transport Position Marker */}
          {currentCoords && (
            <Marker position={currentCoords} icon={currentLocationIcon}>
              <Popup>
                <div className="text-sm font-bold text-red-600">🫀 Live Organ Transport</div>
                <div className="text-xs font-mono mt-1">Lat: {currentCoords[0].toFixed(5)}, Lng: {currentCoords[1].toFixed(5)}</div>
                <div className="text-[10px] text-slate-400 mt-0.5">{formatTs(liveLocation?.timestamp)}</div>
              </Popup>
            </Marker>
          )}

          {/* Route line */}
          {currentCoords ? (
            <Polyline
              positions={[sourceCoords, currentCoords, destCoords]}
              color="#ef4444"
              weight={4}
              dashArray="6, 8"
            />
          ) : (
            <Polyline
              positions={[sourceCoords, destCoords]}
              color="#0284c7"
              weight={3}
              dashArray="4, 6"
            />
          )}
        </MapContainer>
      </div>

      {/* Action Buttons for Status Updates */}
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
            <p className="text-emerald-600 text-sm">Real-time GPS tracking stream closed via <code>clearWatch()</code>. Organ transfer audit recorded.</p>
          </div>
        </div>
      )}
    </motion.section>
  );
};

// ── Small helpers ───────────────────────────────────────────────────────────
const GPSStatusBadge = ({ permission, watchActive }) => {
  const cfg = {
    idle:       { label: 'GPS Idle',      cls: 'bg-slate-100 text-slate-500',   icon: <WifiOff className="w-3 h-3" /> },
    requesting: { label: 'Requesting...',  cls: 'bg-amber-100 text-amber-600',   icon: <Loader2 className="w-3 h-3 animate-spin" /> },
    granted:    { label: 'GPS Streaming', cls: 'bg-emerald-100 text-emerald-700',icon: <Wifi className="w-3 h-3" /> },
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
