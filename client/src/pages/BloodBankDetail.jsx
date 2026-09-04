import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, MapPin, Phone, Mail, Globe, Clock, Droplets,
  AlertCircle, Loader2, Info, Hash, Building2, ExternalLink,
  Navigation, CheckCircle2, Play, Radio, Wifi, WifiOff, XCircle, RotateCcw
} from 'lucide-react';
import axios from 'axios';
import { MapContainer, TileLayer, Marker, Popup, Polyline } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useSocket } from '../context/SocketContext';
import toast from 'react-hot-toast';

// ── Custom Leaflet Icons ──────────────────────────────────────────────────────
const createCustomIcon = (color, IconComponent) => {
  const html = `
    <div style="background-color: ${color}; width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center; box-shadow: 0 2px 5px rgba(0,0,0,0.3); border: 2px solid white;">
      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        ${IconComponent}
      </svg>
    </div>
  `;
  return L.divIcon({
    html,
    className: 'custom-leaflet-icon',
    iconSize: [32, 32],
    iconAnchor: [16, 32],
    popupAnchor: [0, -32],
  });
};

const BloodBankIcon = createCustomIcon('#ef4444', '<path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z"></path>');

const userLocationIcon = L.divIcon({
  html: `<div style="background:#2563eb;width:30px;height:30px;border-radius:50%;display:flex;align-items:center;justify-content:center;box-shadow:0 0 0 6px rgba(37,99,235,0.25);border:3px solid white;">
    <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
      <polygon points="3 11 22 2 13 21 11 13 3 11"/>
    </svg>
  </div>`,
  className: '',
  iconSize: [30, 30],
  iconAnchor: [15, 15],
});

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

// ── Distance & OSRM Routing Helpers ──────────────────────────────────────────
function getHaversineDistanceKm(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

async function fetchOsrmRoute(userLat, userLng, destLat, destLng) {
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${userLng},${userLat};${destLng},${destLat}?overview=full&geometries=geojson`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    if (data.code === 'Ok' && data.routes && data.routes.length > 0) {
      const route = data.routes[0];
      const coords = route.geometry.coordinates.map(([lng, lat]) => [lat, lng]);
      return {
        coordinates: coords,
        distanceKm: (route.distance / 1000).toFixed(2),
        durationMins: Math.round(route.duration / 60),
      };
    }
  } catch (e) {
    console.warn('OSRM route fetch notice:', e.message);
  }
  return null;
}

// ── General Component Helpers ────────────────────────────────────────────────
const InfoRow = ({ icon: Icon, label, value, isLink, href }) => {
  if (!value) return null;
  return (
    <div className="flex items-start gap-3 py-3 border-b border-slate-100 last:border-0">
      <div className="p-1.5 bg-slate-50 rounded-lg flex-shrink-0 mt-0.5">
        <Icon className="w-3.5 h-3.5 text-slate-500" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs text-slate-400 font-medium uppercase tracking-wide mb-0.5">{label}</p>
        {isLink && href ? (
          <a href={href} target="_blank" rel="noopener noreferrer"
            className="text-sm text-red-600 hover:underline flex items-center gap-1 break-all">
            {value} <ExternalLink className="w-3 h-3 flex-shrink-0" />
          </a>
        ) : (
          <p className="text-sm text-slate-800 break-words">{value}</p>
        )}
      </div>
    </div>
  );
};

// ── Main Page ─────────────────────────────────────────────────────────────────
const BloodBankDetail = () => {
  const { id }   = useParams();
  const navigate = useNavigate();
  const socket   = useSocket();

  const [bank, setBank]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');
  
  // Booking State
  const [showBooking, setShowBooking] = useState(false);
  const [bookingForm, setBookingForm] = useState({
    patient_name: '',
    patient_phone: '',
    patient_blood_group: 'A+',
    appointment_date: ''
  });
  const [bookingStatus, setBookingStatus] = useState(null);
  const [confirmedAppt, setConfirmedAppt] = useState(null);

  // Navigation / Tracking State (Phase 9 Step 3B)
  const [navState, setNavState]           = useState('idle'); // idle | requesting | granted | denied | unavailable | arrived
  const [userCoords, setUserCoords]       = useState(null);   // { lat, lng }
  const [routeData, setRouteData]         = useState(null);   // { coordinates, distanceKm, durationMins }
  const [trackingSession, setTrackingSession] = useState(null);
  const [isStartingNav, setIsStartingNav] = useState(false);

  const gpsWatchIdRef     = useRef(null);
  const lastRouteFetchRef = useRef(0);
  const lastGpsSentRef    = useRef(0);
  const activeSessionRef  = useRef(null);

  useEffect(() => {
    axios.get(`${API_BASE}/blood-banks/${id}`)
      .then(r => setBank(r.data.data))
      .catch(() => setError('Blood bank not found or server error.'))
      .finally(() => setLoading(false));
  }, [id]);

  // Clean GPS watch on unmount
  useEffect(() => {
    return () => {
      if (gpsWatchIdRef.current !== null) {
        navigator.geolocation.clearWatch(gpsWatchIdRef.current);
        gpsWatchIdRef.current = null;
      }
    };
  }, []);

  // Submit Appointment Booking
  const handleBookSubmit = async (e) => {
    e.preventDefault();
    setBookingStatus('submitting');
    try {
      const res = await axios.post(`${API_BASE}/appointments`, {
        blood_bank_directory_id: parseInt(id, 10),
        ...bookingForm
      });
      const appt = res.data.appointment;
      setConfirmedAppt(appt);
      localStorage.setItem('lifeshare_patient_session', appt.session_token);
      setBookingStatus('success');
      toast.success('Appointment booked successfully!');
    } catch (err) {
      setBookingStatus('error');
      toast.error(err.response?.data?.error || 'Failed to book appointment.');
    }
  };

  // Stop GPS watching
  const stopGPS = useCallback(() => {
    if (gpsWatchIdRef.current !== null) {
      navigator.geolocation.clearWatch(gpsWatchIdRef.current);
      gpsWatchIdRef.current = null;
    }
  }, []);

  // Update Route geometry & distance
  const updateRoute = useCallback(async (uLat, uLng, dLat, dLng) => {
    const osrm = await fetchOsrmRoute(uLat, uLng, dLat, dLng);
    if (osrm) {
      setRouteData(osrm);
    } else {
      // Fallback: Haversine straight line
      const dist = getHaversineDistanceKm(uLat, uLng, dLat, dLng);
      setRouteData({
        coordinates: [[uLat, uLng], [dLat, dLng]],
        distanceKm: dist.toFixed(2),
        durationMins: Math.round(dist * 2.5), // crude estimate
      });
    }
  }, []);

  // Start Real Navigation (Explicit User Action)
  const startNavigation = useCallback(async () => {
    if (!bank || !bank.latitude || !bank.longitude) {
      toast.error('This blood bank does not have valid coordinates for navigation.');
      return;
    }
    if (!navigator.geolocation) {
      setNavState('unavailable');
      toast.error('Geolocation is not supported by your browser.');
      return;
    }

    setIsStartingNav(true);
    setNavState('requesting');

    const sessionToken = confirmedAppt?.session_token || localStorage.getItem('lifeshare_patient_session');
    const apptId = confirmedAppt?.id;

    // Create or load tracking session on backend if appointment ID is known
    let currentSession = trackingSession;
    if (apptId && sessionToken) {
      try {
        const startRes = await axios.post(`${API_BASE}/tracking/start`, {
          reference_type: 'blood_appointment',
          reference_id: apptId,
        }, {
          headers: { Authorization: `Session ${sessionToken}` }
        });
        currentSession = startRes.data;
        setTrackingSession(currentSession);
        activeSessionRef.current = currentSession;

        // Join socket room
        if (socket && socket.connected) {
          socket.emit('join_tracking', {
            tracking_session_id: currentSession.id,
            token: sessionToken,
            type: 'patient',
          });
        }
      } catch (err) {
        console.warn('Backend tracking start notice:', err.response?.data?.error || err.message);
      }
    }

    const destLat = parseFloat(bank.latitude);
    const destLng = parseFloat(bank.longitude);

    // Request Real Browser GPS
    const watchId = navigator.geolocation.watchPosition(
      async (pos) => {
        setIsStartingNav(false);
        setNavState('granted');

        const uLat = pos.coords.latitude;
        const uLng = pos.coords.longitude;
        setUserCoords({ lat: uLat, lng: uLng });

        const now = Date.now();

        // 1. Throttle route updating (re-route every 25s or when moved significantly)
        if (now - lastRouteFetchRef.current > 25000) {
          lastRouteFetchRef.current = now;
          updateRoute(uLat, uLng, destLat, destLng);
        }

        // 2. Calculate distance to destination
        const distKm = getHaversineDistanceKm(uLat, uLng, destLat, destLng);

        // 3. Arrival detection threshold: <= 100 meters (0.1 km)
        if (distKm <= 0.1 && navState !== 'arrived') {
          setNavState('arrived');
          toast.success('✓ You have arrived at the selected blood bank!', { duration: 8000 });
          stopGPS();

          // Update tracking status to arrived on server
          if (activeSessionRef.current?.id && sessionToken) {
            try {
              await axios.post(`${API_BASE}/tracking/${activeSessionRef.current.id}/status`, { status: 'arrived' }, {
                headers: { Authorization: `Session ${sessionToken}` }
              });
            } catch (e) {}
          }
          return;
        }

        // 4. Send GPS location to server (throttled every 20s)
        if (activeSessionRef.current?.id && sessionToken && (now - lastGpsSentRef.current > 20000)) {
          lastGpsSentRef.current = now;
          try {
            await axios.post(`${API_BASE}/tracking/${activeSessionRef.current.id}/location`, {
              latitude: uLat,
              longitude: uLng,
            }, {
              headers: { Authorization: `Session ${sessionToken}` }
            });
          } catch (e) {}
        }
      },
      (err) => {
        setIsStartingNav(false);
        if (err.code === err.PERMISSION_DENIED) {
          setNavState('denied');
          toast.error('Location permission denied. Please allow location access in your browser.');
        } else {
          setNavState('unavailable');
          toast.error('Unable to determine your current location.');
        }
      },
      { enableHighAccuracy: true, timeout: 30000, maximumAge: 5000 }
    );

    gpsWatchIdRef.current = watchId;
  }, [bank, confirmedAppt, trackingSession, socket, updateRoute, stopGPS, navState]);

  if (loading) return (
    <div className="flex items-center justify-center py-32">
      <div className="text-center">
        <Loader2 className="w-8 h-8 animate-spin text-red-500 mx-auto mb-3" />
        <p className="text-sm text-slate-500">Loading blood bank details…</p>
      </div>
    </div>
  );

  if (error || !bank) return (
    <div className="max-w-xl mx-auto py-24 text-center">
      <AlertCircle className="w-10 h-10 text-red-400 mx-auto mb-4" />
      <p className="text-slate-700 font-medium">{error || 'Blood bank not found.'}</p>
      <button onClick={() => navigate(-1)} className="mt-4 btn-secondary flex items-center gap-2 mx-auto">
        <ArrowLeft className="w-4 h-4" /> Go Back
      </button>
    </div>
  );

  const websiteHref = bank.website && !bank.website.startsWith('http')
    ? `https://${bank.website}` : bank.website;
  const fullAddress = [bank.address, bank.city, bank.district, bank.state, bank.pincode]
    .filter(Boolean).join(', ');

  const googleMapsUrl = bank.latitude && bank.longitude
    ? `https://www.google.com/maps/dir/?api=1&destination=${bank.latitude},${bank.longitude}`
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(bank.blood_bank_name + ', ' + fullAddress)}`;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Back */}
      <button onClick={() => navigate(-1)}
        className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-800 transition-colors group">
        <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
        Back to Blood Bank Directory
      </button>

      {/* Header Card */}
      <div className="card">
        <div className="bg-gradient-to-r from-red-600 to-red-800 px-6 py-5 rounded-t-xl flex justify-between items-center">
          <div className="flex items-start gap-4">
            <div className="p-3 bg-white/10 rounded-xl flex-shrink-0">
              <Droplets className="w-7 h-7 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-xl font-bold text-white leading-tight mb-2">
                {bank.blood_bank_name}
              </h1>
              <div className="flex flex-wrap gap-2">
                {bank.category && (
                  <span className="text-xs px-2.5 py-1 rounded-full bg-white/10 text-white border border-white/20 font-medium">
                    {bank.category}
                  </span>
                )}
                {bank.service_time && (
                  <span className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-full bg-white/10 text-white border border-white/20 font-medium">
                    <Clock className="w-3 h-3" /> {bank.service_time}
                  </span>
                )}
              </div>
            </div>
          </div>
          
          <button 
            onClick={() => setShowBooking(!showBooking)}
            className="bg-white text-red-700 px-4 py-2 rounded-lg font-bold text-sm hover:bg-red-50 transition-colors whitespace-nowrap shadow-sm"
          >
            {showBooking ? 'Cancel Booking' : 'Book Appointment'}
          </button>
        </div>

        {/* Location quick strip */}
        {(bank.city || bank.state) && (
          <div className="flex items-center gap-2 px-6 py-3 bg-red-50 border-t border-red-100">
            <MapPin className="w-4 h-4 text-red-500 flex-shrink-0" />
            <p className="text-sm text-red-700 font-medium">
              {[bank.city, bank.district, bank.state].filter(Boolean).join(' · ')}
            </p>
          </div>
        )}
      </div>

      {/* Booking Form & Navigation Card */}
      {showBooking && (
        <div className="card p-6 border-t-4 border-t-red-600 bg-red-50/30 space-y-6">
          <h2 className="text-lg font-bold text-slate-800">Request Donation Appointment</h2>
          
          {bookingStatus === 'success' ? (
            <div className="bg-emerald-50 text-emerald-800 p-6 rounded-xl border border-emerald-200 space-y-5">
              <div className="flex items-center gap-3 border-b border-emerald-200/60 pb-3">
                <div className="p-2 bg-emerald-500 rounded-full text-white">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-bold text-lg text-emerald-900">✓ Appointment Confirmed</h3>
                  <p className="text-xs text-emerald-700">Your appointment has been logged successfully.</p>
                </div>
              </div>

              {/* Confirmed Details Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-[10px] font-black uppercase text-emerald-700">Selected Blood Bank</p>
                  <p className="font-bold text-emerald-950">{bank.blood_bank_name}</p>
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase text-emerald-700">Appointment Date</p>
                  <p className="font-bold text-emerald-950">
                    {bookingForm.appointment_date ? new Date(bookingForm.appointment_date).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '—'}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase text-emerald-700">Address</p>
                  <p className="font-medium text-emerald-900">{fullAddress}</p>
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase text-emerald-700">Patient Details</p>
                  <p className="font-medium text-emerald-900">{bookingForm.patient_name} ({bookingForm.patient_blood_group})</p>
                </div>
              </div>

              {/* ── PHASE 9 STEP 3B: LIVE NAVIGATION PANEL ── */}
              <div className="p-5 bg-white rounded-xl border border-emerald-200 space-y-4 shadow-sm">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Navigation className="w-5 h-5 text-blue-600 animate-pulse" />
                    <h4 className="font-black text-slate-900 text-base">Live Navigation to Selected Blood Bank</h4>
                  </div>
                  {/* GPS Badge */}
                  <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black uppercase ${
                    navState === 'granted' ? 'bg-emerald-100 text-emerald-700 border border-emerald-200' :
                    navState === 'requesting' ? 'bg-amber-100 text-amber-700 border border-amber-200' :
                    navState === 'arrived' ? 'bg-blue-100 text-blue-700 border border-blue-200' :
                    navState === 'denied' || navState === 'unavailable' ? 'bg-red-100 text-red-600 border border-red-200' :
                    'bg-slate-100 text-slate-600'
                  }`}>
                    {navState === 'granted' && <Wifi className="w-3.5 h-3.5" />}
                    {navState === 'requesting' && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                    {navState === 'arrived' && <CheckCircle2 className="w-3.5 h-3.5" />}
                    {(navState === 'denied' || navState === 'unavailable') && <XCircle className="w-3.5 h-3.5" />}
                    {navState === 'idle' && <WifiOff className="w-3.5 h-3.5" />}
                    {navState === 'granted' ? 'GPS: Active' : navState === 'requesting' ? 'Requesting Location...' : navState === 'arrived' ? 'Arrived' : navState === 'denied' ? 'GPS Denied' : navState === 'unavailable' ? 'GPS Unavailable' : 'GPS Off'}
                  </span>
                </div>

                {/* Consent & Start Navigation Trigger */}
                {navState === 'idle' && (
                  <div className="space-y-3 p-4 bg-slate-50 rounded-xl border border-slate-200">
                    <p className="text-xs text-slate-600">
                      <strong>Location Permission Consent:</strong> Your current location is required to provide live route navigation to the selected blood bank. Allow location access in your browser to continue.
                    </p>
                    <button
                      id="start-navigation-btn"
                      onClick={startNavigation}
                      disabled={isStartingNav}
                      className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl flex items-center justify-center gap-2 transition-colors shadow-md shadow-blue-200 text-sm"
                    >
                      {isStartingNav ? <Loader2 className="animate-spin w-4 h-4" /> : <Play className="w-4 h-4" />}
                      Start Navigation
                    </button>
                  </div>
                )}

                {/* Error Banner for Denied / Unavailable */}
                {(navState === 'denied' || navState === 'unavailable') && (
                  <div className="p-4 bg-red-50 border border-red-200 rounded-xl space-y-2 text-sm text-red-700">
                    <p className="font-semibold flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 text-red-500" />
                      {navState === 'denied'
                        ? 'Location permission denied. Please allow location access in your browser and try again.'
                        : 'Unable to determine your current location. Please check your device/browser location settings.'}
                    </p>
                    <button
                      onClick={startNavigation}
                      className="px-4 py-2 bg-red-600 text-white text-xs font-bold rounded-lg hover:bg-red-700 transition-colors flex items-center gap-1"
                    >
                      <RotateCcw className="w-3.5 h-3.5" /> Retry Location Access
                    </button>
                  </div>
                )}

                {/* Arrival State Banner */}
                {navState === 'arrived' && (
                  <div className="p-4 bg-emerald-50 border-2 border-emerald-300 rounded-xl flex items-center gap-3">
                    <CheckCircle2 className="w-8 h-8 text-emerald-600 flex-shrink-0" />
                    <div>
                      <p className="font-bold text-emerald-900 text-base">✓ You have arrived at the selected blood bank.</p>
                      <p className="text-xs text-emerald-700">Your live GPS tracking has been stopped. Please present your booking details at the reception.</p>
                    </div>
                  </div>
                )}

                {/* Navigation Details Bar (Active GPS) */}
                {(navState === 'granted' || userCoords) && (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 p-3 bg-blue-50/60 rounded-xl border border-blue-100 text-xs">
                    <div>
                      <p className="text-[10px] font-black uppercase text-blue-600">Destination</p>
                      <p className="font-bold text-slate-800 truncate">{bank.blood_bank_name}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-black uppercase text-blue-600">Distance</p>
                      <p className="font-bold text-slate-800">{routeData ? `${routeData.distanceKm} km` : 'Calculating...'}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-black uppercase text-blue-600">Estimated Travel Time</p>
                      <p className="font-bold text-slate-800">{routeData?.durationMins ? `~${routeData.durationMins} mins` : '—'}</p>
                    </div>
                  </div>
                )}

                {/* Live Navigation Map */}
                {bank.latitude && bank.longitude && (userCoords || navState === 'granted') && (
                  <div className="h-72 w-full rounded-xl overflow-hidden border border-slate-200 shadow-inner">
                    <MapContainer
                      center={userCoords ? [userCoords.lat, userCoords.lng] : [bank.latitude, bank.longitude]}
                      zoom={13}
                      scrollWheelZoom={false}
                      className="h-full w-full"
                      style={{ height: '100%', width: '100%' }}
                    >
                      <TileLayer
                        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                      />
                      {/* Destination Marker */}
                      <Marker position={[bank.latitude, bank.longitude]} icon={BloodBankIcon}>
                        <Popup>
                          <div className="text-xs font-bold">{bank.blood_bank_name}</div>
                          <div className="text-[10px] text-slate-500">{fullAddress}</div>
                        </Popup>
                      </Marker>

                      {/* User Location Marker */}
                      {userCoords && (
                        <Marker position={[userCoords.lat, userCoords.lng]} icon={userLocationIcon}>
                          <Popup>
                            <div className="text-xs font-bold">📍 Your Current GPS Location</div>
                            <div className="text-[10px] text-slate-500">{userCoords.lat.toFixed(5)}, {userCoords.lng.toFixed(5)}</div>
                          </Popup>
                        </Marker>
                      )}

                      {/* Route Polyline */}
                      {routeData?.coordinates && (
                        <Polyline
                          positions={routeData.coordinates}
                          color="#2563eb"
                          weight={5}
                          opacity={0.85}
                          dashArray="8 4"
                        />
                      )}
                    </MapContainer>
                  </div>
                )}

                {/* External Navigation Link */}
                <div className="pt-2 border-t border-slate-100 flex justify-between items-center text-xs">
                  <span className="text-slate-500 font-medium">External Navigation Option:</span>
                  <a
                    href={googleMapsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:underline font-bold flex items-center gap-1"
                  >
                    Open in Google Maps <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              </div>
            </div>
          ) : (
            <form onSubmit={handleBookSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">Full Name</label>
                  <input type="text" required value={bookingForm.patient_name} onChange={e => setBookingForm({...bookingForm, patient_name: e.target.value})} className="input-field" placeholder="John Doe" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">Phone Number</label>
                  <input type="text" required value={bookingForm.patient_phone} onChange={e => setBookingForm({...bookingForm, patient_phone: e.target.value})} className="input-field" placeholder="+91 XXXXX XXXXX" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">Blood Group</label>
                  <select value={bookingForm.patient_blood_group} onChange={e => setBookingForm({...bookingForm, patient_blood_group: e.target.value})} className="input-field">
                    <option>A+</option><option>A-</option><option>B+</option><option>B-</option>
                    <option>O+</option><option>O-</option><option>AB+</option><option>AB-</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">Appointment Date & Time</label>
                  <input type="datetime-local" required value={bookingForm.appointment_date} onChange={e => setBookingForm({...bookingForm, appointment_date: e.target.value})} className="input-field" />
                </div>
              </div>
              <button disabled={bookingStatus === 'submitting'} type="submit" className="w-full btn-primary !bg-red-600 hover:!bg-red-700">
                {bookingStatus === 'submitting' ? 'Confirming...' : 'Confirm Appointment'}
              </button>
            </form>
          )}
        </div>
      )}

      {/* Distinction Banner */}
      <div className="grid sm:grid-cols-2 gap-3">
        <div className="flex items-start gap-2.5 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
          <Info className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
          <p className="text-xs text-amber-800">
            <span className="font-semibold">Static Reference Data.</span> This is directory information only. Contact the blood bank directly for current stock.
          </p>
        </div>
        <Link to="/blood-bank"
          className="flex items-start gap-2.5 bg-red-50 border border-red-200 rounded-lg px-4 py-3 hover:bg-red-100 transition-colors">
          <Droplets className="w-4 h-4 text-red-600 mt-0.5 flex-shrink-0" />
          <p className="text-xs text-red-700">
            <span className="font-semibold">Live Blood Availability →</span> View real-time blood units from verified LifeShare hospitals.
          </p>
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Location */}
        <div className="card p-5">
          <h2 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
            <MapPin className="w-4 h-4 text-red-500" /> Location
          </h2>
          <InfoRow icon={MapPin}   label="Full Address" value={fullAddress} />
          <InfoRow icon={Hash}     label="State"        value={bank.state} />
          <InfoRow icon={MapPin}   label="District"     value={bank.district} />
          <InfoRow icon={Building2}label="City"         value={bank.city} />
          <InfoRow icon={Hash}     label="Pincode"      value={bank.pincode} />
          {bank.latitude && bank.longitude && (
            <div className="mt-3 pt-3 border-t border-slate-100">
              <p className="text-xs text-slate-400 font-medium uppercase tracking-wide mb-1">Coordinates</p>
              <p className="text-sm text-slate-600 font-mono">
                {parseFloat(bank.latitude).toFixed(6)}, {parseFloat(bank.longitude).toFixed(6)}
              </p>
              <div className="h-48 w-full mt-2 rounded-lg overflow-hidden border border-slate-200">
                <MapContainer center={[bank.latitude, bank.longitude]} zoom={14} scrollWheelZoom={false} className="h-full w-full" style={{ height: '100%', width: '100%' }}>
                  <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  />
                  <Marker position={[bank.latitude, bank.longitude]} icon={BloodBankIcon}>
                    <Popup>{bank.blood_bank_name}</Popup>
                  </Marker>
                </MapContainer>
              </div>
              <a href={googleMapsUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 mt-2 inline-flex items-center gap-1 hover:underline font-medium">
                Open in External Navigation →
              </a>
            </div>
          )}
        </div>

        {/* Contact */}
        <div className="card p-5">
          <h2 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
            <Phone className="w-4 h-4 text-red-500" /> Contact
          </h2>
          <InfoRow icon={Phone}  label="Contact Number" value={bank.contact} />
          <InfoRow icon={Mail}   label="Email"   value={bank.email}
                   isLink={!!bank.email} href={bank.email ? `mailto:${bank.email}` : null} />
          <InfoRow icon={Globe}  label="Website" value={bank.website}
                   isLink={!!bank.website} href={websiteHref} />
        </div>

        {/* Blood Info */}
        {(bank.blood_component || bank.blood_groups_ref || bank.service_time) && (
          <div className="card p-5 md:col-span-2">
            <h2 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
              <Droplets className="w-4 h-4 text-red-500" /> Blood Bank Information
            </h2>
            <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-3">
              <p className="text-xs text-amber-800">
                ⚠️ The component and blood group information below is <strong>static reference metadata</strong> from the government dataset. It does <strong>not</strong> reflect current availability.
              </p>
            </div>
            <InfoRow icon={Droplets} label="Blood Components"      value={bank.blood_component} />
            <InfoRow icon={Droplets} label="Blood Groups (Ref)"    value={bank.blood_groups_ref} />
            <InfoRow icon={Clock}    label="Service Hours"         value={bank.service_time} />
          </div>
        )}
      </div>

      {/* Data Source Footer */}
      <div className="mt-6 text-center">
        <p className="text-xs text-slate-400">
          Source: National Health Portal Blood Bank Directory · Dataset ID #{bank.source_record_id}
        </p>
        <Link to="/blood-banks" className="mt-2 inline-flex items-center gap-1.5 text-xs text-red-600 hover:underline">
          <ArrowLeft className="w-3.5 h-3.5" /> Back to Blood Bank Directory
        </Link>
      </div>
    </div>
  );
};

export default BloodBankDetail;
