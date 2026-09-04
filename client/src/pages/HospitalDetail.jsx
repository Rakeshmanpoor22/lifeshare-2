import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, MapPin, Phone, Smartphone, AlertCircle, Building2,
  BedDouble, Ambulance, Stethoscope, Globe, Mail, Shield,
  Calendar, Users, Loader2, ExternalLink, Hash, Info,
  Navigation, CheckCircle2, Play, Wifi, WifiOff, XCircle, RotateCcw
} from 'lucide-react';
import axios from 'axios';
import { MapContainer, TileLayer, Marker, Popup, Polyline } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
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

const HospitalIcon = createCustomIcon('#0ea5e9', '<rect width="18" height="18" x="3" y="3" rx="2" ry="2"></rect><path d="M12 8v8"></path><path d="M8 12h8"></path>');

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
        isRoadRoute: true,
      };
    }
  } catch (e) {
    console.warn('OSRM hospital routing fetch notice:', e.message);
  }
  return null;
}

// ── Helpers ──────────────────────────────────────────────────────────────────
const InfoRow = ({ icon: Icon, label, value, isLink = false, linkHref }) => {
  if (!value) return null;
  return (
    <div className="flex items-start gap-3 py-3 border-b border-slate-100 last:border-0">
      <div className="p-1.5 bg-slate-50 rounded-lg flex-shrink-0 mt-0.5">
        <Icon className="w-3.5 h-3.5 text-slate-500" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs text-slate-400 font-medium uppercase tracking-wide mb-0.5">{label}</p>
        {isLink && linkHref ? (
          <a
            href={linkHref}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-primary-600 hover:underline flex items-center gap-1 break-all"
          >
            {value}
            <ExternalLink className="w-3 h-3 flex-shrink-0" />
          </a>
        ) : (
          <p className="text-sm text-slate-800 break-words">{value}</p>
        )}
      </div>
    </div>
  );
};

const TagList = ({ label, value }) => {
  if (!value) return null;
  const items = value.split(/[;|]/).map(s => s.trim()).filter(Boolean);
  if (items.length === 0) return null;
  return (
    <div className="mb-4">
      <p className="text-xs text-slate-400 font-medium uppercase tracking-wide mb-2">{label}</p>
      <div className="flex flex-wrap gap-2">
        {items.map((item, i) => (
          <span key={i} className="bg-primary-50 text-primary-700 text-xs px-2.5 py-1 rounded-full border border-primary-100">
            {item}
          </span>
        ))}
      </div>
    </div>
  );
};

// ── Main Page ─────────────────────────────────────────────────────────────────
const HospitalDetail = () => {
  const { id }       = useParams();
  const navigate     = useNavigate();
  const [hospital, setHospital] = useState(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState('');

  // Live Navigation State (Phase 9 Step 4B)
  const [navState, setNavState]       = useState('idle'); // idle | requesting | granted | denied | unavailable | arrived
  const [userCoords, setUserCoords]   = useState(null);   // { lat, lng }
  const [routeData, setRouteData]     = useState(null);   // { coordinates, distanceKm, durationMins, isRoadRoute }
  const [isStartingNav, setIsStartingNav] = useState(false);

  const gpsWatchIdRef     = useRef(null);
  const lastRouteFetchRef = useRef(0);

  useEffect(() => {
    setLoading(true);
    axios.get(`${API_BASE}/hospitals/${id}`)
      .then(r => setHospital(r.data.data))
      .catch(() => setError('Hospital not found or server error.'))
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

  const stopGPS = useCallback(() => {
    if (gpsWatchIdRef.current !== null) {
      navigator.geolocation.clearWatch(gpsWatchIdRef.current);
      gpsWatchIdRef.current = null;
    }
  }, []);

  const updateRoute = useCallback(async (uLat, uLng, dLat, dLng) => {
    const osrm = await fetchOsrmRoute(uLat, uLng, dLat, dLng);
    if (osrm) {
      setRouteData(osrm);
    } else {
      // Fallback: Direct Line Polyline
      const dist = getHaversineDistanceKm(uLat, uLng, dLat, dLng);
      setRouteData({
        coordinates: [[uLat, uLng], [dLat, dLng]],
        distanceKm: dist.toFixed(2),
        durationMins: Math.round(dist * 2.5),
        isRoadRoute: false,
      });
    }
  }, []);

  // Explicit User Action to Start Navigation
  const startNavigation = useCallback(() => {
    if (!hospital || !hospital.latitude || !hospital.longitude) {
      toast.error('Navigation unavailable: This hospital does not have valid location coordinates.');
      return;
    }
    if (!navigator.geolocation) {
      setNavState('unavailable');
      toast.error('Geolocation is not supported by your browser.');
      return;
    }

    setIsStartingNav(true);
    setNavState('requesting');

    const destLat = parseFloat(hospital.latitude);
    const destLng = parseFloat(hospital.longitude);

    const watchId = navigator.geolocation.watchPosition(
      async (pos) => {
        setIsStartingNav(false);
        setNavState('granted');

        const uLat = pos.coords.latitude;
        const uLng = pos.coords.longitude;
        setUserCoords({ lat: uLat, lng: uLng });

        const now = Date.now();

        // Throttle route updating (every 25s)
        if (now - lastRouteFetchRef.current > 25000) {
          lastRouteFetchRef.current = now;
          updateRoute(uLat, uLng, destLat, destLng);
        }

        // Distance & arrival check (<= 100 meters / 0.1 km)
        const distKm = getHaversineDistanceKm(uLat, uLng, destLat, destLng);
        if (distKm <= 0.1 && navState !== 'arrived') {
          setNavState('arrived');
          toast.success(`✓ You have arrived at ${hospital.hospital_name}!`, { duration: 8000 });
          stopGPS();
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
  }, [hospital, updateRoute, stopGPS, navState]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary-500 mx-auto mb-3" />
          <p className="text-sm text-slate-500">Loading hospital details…</p>
        </div>
      </div>
    );
  }

  if (error || !hospital) {
    return (
      <div className="max-w-xl mx-auto py-24 text-center">
        <AlertCircle className="w-10 h-10 text-red-400 mx-auto mb-4" />
        <p className="text-slate-700 font-medium">{error || 'Hospital not found.'}</p>
        <button onClick={() => navigate(-1)} className="mt-4 btn-secondary flex items-center gap-2 mx-auto">
          <ArrowLeft className="w-4 h-4" /> Go Back
        </button>
      </div>
    );
  }

  const fullAddress = [hospital.address, hospital.location_desc, hospital.town, hospital.subdistrict, hospital.district, hospital.state, hospital.pincode]
    .filter(Boolean).join(', ');

  const websiteHref = hospital.website && !hospital.website.startsWith('http')
    ? `https://${hospital.website}`
    : hospital.website;

  const hasValidCoords = hospital.latitude !== null && hospital.longitude !== null &&
    !isNaN(parseFloat(hospital.latitude)) && !isNaN(parseFloat(hospital.longitude));

  const googleMapsUrl = hasValidCoords
    ? `https://www.google.com/maps/dir/?api=1&destination=${hospital.latitude},${hospital.longitude}`
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(hospital.hospital_name + ', ' + fullAddress)}`;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Back Button */}
      <button
        onClick={() => navigate(-1)}
        className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-800 transition-colors group"
      >
        <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
        Back to Directory
      </button>

      {/* Header Card */}
      <div className="card">
        <div className="bg-gradient-to-r from-primary-600 to-primary-800 px-6 py-5 rounded-t-xl">
          <div className="flex items-start gap-4">
            <div className="p-3 bg-white/10 rounded-xl flex-shrink-0">
              <Building2 className="w-7 h-7 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-xl font-bold text-white leading-tight mb-1">
                {hospital.hospital_name}
              </h1>
              <div className="flex flex-wrap gap-2 mt-2">
                {hospital.hospital_category && (
                  <span className="text-xs px-2.5 py-1 rounded-full border font-medium bg-white/10 text-white border-white/20">
                    {hospital.hospital_category}
                  </span>
                )}
                {hospital.hospital_care_type && (
                  <span className="text-xs px-2.5 py-1 rounded-full bg-white/10 text-white border border-white/20 font-medium">
                    {hospital.hospital_care_type}
                  </span>
                )}
                {hospital.medical_system && (
                  <span className="text-xs px-2.5 py-1 rounded-full bg-white/10 text-white border border-white/20 font-medium">
                    {hospital.medical_system}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Quick Stats Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-y sm:divide-y-0 divide-slate-100 border-t border-slate-100">
          {hospital.total_beds > 0 && (
            <div className="flex items-center gap-2.5 px-5 py-4">
              <BedDouble className="w-4 h-4 text-primary-500 flex-shrink-0" />
              <div>
                <p className="text-xs text-slate-400">Total Beds</p>
                <p className="text-sm font-semibold text-slate-800">{hospital.total_beds.toLocaleString()}</p>
              </div>
            </div>
          )}
          {hospital.number_doctors > 0 && (
            <div className="flex items-center gap-2.5 px-5 py-4">
              <Users className="w-4 h-4 text-emerald-500 flex-shrink-0" />
              <div>
                <p className="text-xs text-slate-400">Doctors</p>
                <p className="text-sm font-semibold text-slate-800">{hospital.number_doctors}</p>
              </div>
            </div>
          )}
          {hospital.established_year && (
            <div className="flex items-center gap-2.5 px-5 py-4">
              <Calendar className="w-4 h-4 text-amber-500 flex-shrink-0" />
              <div>
                <p className="text-xs text-slate-400">Established</p>
                <p className="text-sm font-semibold text-slate-800">{hospital.established_year}</p>
              </div>
            </div>
          )}
          {hospital.emergency_phone && (
            <div className="flex items-center gap-2.5 px-5 py-4">
              <Ambulance className="w-4 h-4 text-red-500 flex-shrink-0" />
              <div>
                <p className="text-xs text-slate-400">Emergency</p>
                <p className="text-sm font-semibold text-red-600">{hospital.emergency_phone}</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Static Data Disclaimer */}
      <div className="flex items-start gap-2.5 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
        <Info className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
        <p className="text-xs text-amber-800">
          <span className="font-semibold">Static Reference Data.</span> Sourced from official government hospital directory dataset #{hospital.source_record_id}. Does not reflect real-time emergency room capacity or bed availability.
        </p>
      </div>

      {/* ── PHASE 9 STEP 4B: LIVE HOSPITAL NAVIGATION PANEL ── */}
      <div className="card p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Navigation className="w-5 h-5 text-primary-600 animate-pulse" />
            <h2 className="font-black text-slate-900 text-base">Live Hospital Navigation</h2>
          </div>
          {/* GPS Status Badge */}
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
            {navState === 'granted' ? 'GPS: Active' : navState === 'requesting' ? 'GPS: Requesting...' : navState === 'arrived' ? 'Arrived' : navState === 'denied' ? 'GPS: Permission denied' : navState === 'unavailable' ? 'GPS: Unavailable' : 'GPS: Not started'}
          </span>
        </div>

        {/* Valid Coordinates Flow vs Missing Coordinates Flow */}
        {hasValidCoords ? (
          <>
            {/* Start Navigation Consent Prompt */}
            {navState === 'idle' && (
              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
                <p className="text-xs text-slate-600">
                  <strong>Location Permission Consent:</strong> Your current location is required to provide live navigation. Allow location access in your browser to continue.
                </p>
                <button
                  id="start-navigation-btn"
                  onClick={startNavigation}
                  disabled={isStartingNav}
                  className="w-full py-3 bg-primary-600 hover:bg-primary-700 text-white font-bold rounded-xl flex items-center justify-center gap-2 transition-colors shadow-md shadow-primary-200 text-sm"
                >
                  {isStartingNav ? <Loader2 className="animate-spin w-4 h-4" /> : <Play className="w-4 h-4" />}
                  Start Navigation
                </button>
              </div>
            )}

            {/* Error Banners */}
            {(navState === 'denied' || navState === 'unavailable') && (
              <div className="p-4 bg-red-50 border border-red-200 rounded-xl space-y-2 text-sm text-red-700">
                <p className="font-semibold flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-red-500" />
                  {navState === 'denied'
                    ? 'GPS: Permission denied. Please allow location access in your browser and try again.'
                    : 'GPS: Unavailable. Unable to determine your current location. Please check your device/browser location settings.'}
                </p>
                <button
                  onClick={startNavigation}
                  className="px-4 py-2 bg-red-600 text-white text-xs font-bold rounded-lg hover:bg-red-700 transition-colors flex items-center gap-1"
                >
                  <RotateCcw className="w-3.5 h-3.5" /> Retry Location Access
                </button>
              </div>
            )}

            {/* Arrival Banner */}
            {navState === 'arrived' && (
              <div className="p-4 bg-emerald-50 border-2 border-emerald-300 rounded-xl flex items-center gap-3">
                <CheckCircle2 className="w-8 h-8 text-emerald-600 flex-shrink-0" />
                <div>
                  <p className="font-bold text-emerald-900 text-base">✓ You have arrived at the selected hospital.</p>
                  <p className="text-xs text-emerald-700">Your live GPS watch has completed. You have reached {hospital.hospital_name}.</p>
                </div>
              </div>
            )}

            {/* Active Navigation Info Card */}
            {(navState === 'granted' || userCoords) && (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 p-3 bg-primary-50/60 rounded-xl border border-primary-100 text-xs">
                <div>
                  <p className="text-[10px] font-black uppercase text-primary-600">Navigating to</p>
                  <p className="font-bold text-slate-800 truncate">{hospital.hospital_name}</p>
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase text-primary-600">Distance</p>
                  <p className="font-bold text-slate-800">{routeData ? `${routeData.distanceKm} km` : 'Calculating...'}</p>
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase text-primary-600">Estimated Travel Time</p>
                  <p className="font-bold text-slate-800">{routeData?.durationMins ? `~${routeData.durationMins} mins` : '—'}</p>
                </div>
              </div>
            )}

            {/* Map display */}
            {(userCoords || navState === 'granted') && (
              <div className="h-72 w-full rounded-xl overflow-hidden border border-slate-200 shadow-inner">
                <MapContainer
                  center={userCoords ? [userCoords.lat, userCoords.lng] : [parseFloat(hospital.latitude), parseFloat(hospital.longitude)]}
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
                  <Marker position={[parseFloat(hospital.latitude), parseFloat(hospital.longitude)]} icon={HospitalIcon}>
                    <Popup>
                      <div className="text-xs font-bold">{hospital.hospital_name}</div>
                      <div className="text-[10px] text-slate-500">{fullAddress}</div>
                    </Popup>
                  </Marker>

                  {/* User Location Marker */}
                  {userCoords && (
                    <Marker position={[userCoords.lat, userCoords.lng]} icon={userLocationIcon}>
                      <Popup>
                        <div className="text-xs font-bold">📍 Your Current Location</div>
                        <div className="text-[10px] text-slate-500">{userCoords.lat.toFixed(5)}, {userCoords.lng.toFixed(5)}</div>
                      </Popup>
                    </Marker>
                  )}

                  {/* Route Polyline */}
                  {routeData?.coordinates && (
                    <Polyline
                      positions={routeData.coordinates}
                      color="#0ea5e9"
                      weight={5}
                      opacity={0.85}
                      dashArray={routeData.isRoadRoute ? undefined : '8 4'}
                    />
                  )}
                </MapContainer>
              </div>
            )}
          </>
        ) : (
          /* Missing Coordinates Handling */
          <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />
            <div>
              <p className="font-bold text-amber-900 text-sm">Navigation unavailable</p>
              <p className="text-xs text-amber-700 mt-0.5">
                This hospital does not have valid location coordinates in the government reference directory. Full address information and contact numbers remain available below.
              </p>
            </div>
          </div>
        )}

        {/* External Google Maps Option */}
        <div className="pt-2 border-t border-slate-100 flex justify-between items-center text-xs">
          <span className="text-slate-500 font-medium">External Navigation Option:</span>
          <a
            href={googleMapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary-600 hover:underline font-bold flex items-center gap-1"
          >
            Open in Google Maps <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Location */}
        <div className="card p-5">
          <h2 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
            <MapPin className="w-4 h-4 text-primary-500" /> Location & Address
          </h2>
          <InfoRow icon={MapPin}  label="Full Address" value={fullAddress} />
          <InfoRow icon={Hash}    label="State"        value={hospital.state} />
          <InfoRow icon={MapPin}  label="District"     value={hospital.district} />
          <InfoRow icon={MapPin}  label="Pincode"      value={hospital.pincode} />
          {hasValidCoords && (
            <div className="mt-3 pt-3 border-t border-slate-100">
              <p className="text-xs text-slate-400 font-medium uppercase tracking-wide mb-1">Coordinates</p>
              <p className="text-sm text-slate-600 font-mono">
                {parseFloat(hospital.latitude).toFixed(6)}, {parseFloat(hospital.longitude).toFixed(6)}
              </p>
            </div>
          )}
        </div>

        {/* Contact Information */}
        <div className="card p-5">
          <h2 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
            <Phone className="w-4 h-4 text-primary-500" /> Contact Information
          </h2>
          <InfoRow icon={Phone}      label="Telephone"       value={hospital.telephone} />
          <InfoRow icon={Smartphone} label="Mobile"          value={hospital.mobile} />
          <InfoRow icon={Ambulance}  label="Emergency"       value={hospital.emergency_phone} />
          <InfoRow icon={Ambulance}  label="Ambulance"       value={hospital.ambulance_phone} />
          <InfoRow icon={Phone}      label="Blood Bank"      value={hospital.bloodbank_phone} />
          <InfoRow icon={Mail}       label="Email"           value={hospital.email}
                   isLink={!!hospital.email}
                   linkHref={hospital.email ? `mailto:${hospital.email}` : null} />
          <InfoRow icon={Globe}      label="Website"         value={hospital.website}
                   isLink={!!hospital.website} linkHref={websiteHref} />
        </div>

        {/* Specialties & Facilities */}
        {(hospital.specialties || hospital.facilities) && (
          <div className="card p-5 md:col-span-2">
            <h2 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2">
              <Stethoscope className="w-4 h-4 text-primary-500" /> Specialties & Facilities
            </h2>
            <TagList label="Specialties" value={hospital.specialties} />
            <TagList label="Facilities"  value={hospital.facilities} />
          </div>
        )}

        {/* Administrative Details */}
        {(hospital.accreditation || hospital.hospital_reg_number || hospital.emergency_services) && (
          <div className="card p-5 md:col-span-2">
            <h2 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
              <Shield className="w-4 h-4 text-primary-500" /> Administrative Details
            </h2>
            <InfoRow icon={Shield}    label="Accreditation"         value={hospital.accreditation} />
            <InfoRow icon={Hash}      label="Registration Number"   value={hospital.hospital_reg_number} />
            <InfoRow icon={AlertCircle} label="Emergency Services"  value={hospital.emergency_services} />
          </div>
        )}
      </div>

      {/* Data Source Footer */}
      <div className="mt-6 text-center">
        <p className="text-xs text-slate-400">
          Source: Government Hospital Directory · Dataset ID #{hospital.source_record_id}
        </p>
        <Link to="/hospitals" className="mt-2 inline-flex items-center gap-1.5 text-xs text-primary-600 hover:underline">
          <ArrowLeft className="w-3.5 h-3.5" /> Back to Hospital Directory
        </Link>
      </div>
    </div>
  );
};

export default HospitalDetail;
