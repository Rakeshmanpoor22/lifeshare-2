import React, { useState, useEffect, useCallback, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMapEvents, ZoomControl } from 'react-leaflet';
import MarkerClusterGroup from 'react-leaflet-cluster';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import axios from 'axios';
import { Link } from 'react-router-dom';
import { MapPin, Droplets, Building2, ExternalLink, Loader2, Info } from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

// ─── Custom Icons ─────────────────────────────────────────────────────────────
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

const hospitalIconSVG = '<path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>'; // generic shape for now, let's use standard shapes
// Better: just use basic SVG paths for the icons inside the divIcon
const HospitalIcon = createCustomIcon('#0ea5e9', '<rect width="18" height="18" x="3" y="3" rx="2" ry="2"></rect><path d="M12 8v8"></path><path d="M8 12h8"></path>'); // Blue with Cross
const BloodBankIcon = createCustomIcon('#ef4444', '<path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z"></path>'); // Red Droplet

// ─── Map Event Listener Component ─────────────────────────────────────────────
const MapEvents = ({ onBoundsChange }) => {
  const map = useMapEvents({
    moveend: () => {
      const bounds = map.getBounds();
      onBoundsChange({
        minLat: bounds.getSouth(),
        maxLat: bounds.getNorth(),
        minLng: bounds.getWest(),
        maxLng: bounds.getEast(),
      });
    },
    zoomend: () => {
      const bounds = map.getBounds();
      onBoundsChange({
        minLat: bounds.getSouth(),
        maxLat: bounds.getNorth(),
        minLng: bounds.getWest(),
        maxLng: bounds.getEast(),
      });
    },
  });
  return null;
};

// ─── Main Component ───────────────────────────────────────────────────────────
const MapDirectory = () => {
  const [hospitals, setHospitals] = useState([]);
  const [bloodBanks, setBloodBanks] = useState([]);
  
  const [showHospitals, setShowHospitals] = useState(true);
  const [showBloodBanks, setShowBloodBanks] = useState(true);
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  
  const [bounds, setBounds] = useState(null);
  const fetchTimeout = useRef(null);

  // Initial center: India
  const center = [20.5937, 78.9629];
  const zoom = 5;

  const fetchMarkers = useCallback(async (currentBounds) => {
    if (!currentBounds) return;
    
    // Check if bounds are too large (limit is 10x10 degrees in backend)
    const latDiff = currentBounds.maxLat - currentBounds.minLat;
    const lngDiff = currentBounds.maxLng - currentBounds.minLng;
    
    if (latDiff > 10 || lngDiff > 10) {
      setError('Please zoom in to view markers.');
      setHospitals([]);
      setBloodBanks([]);
      return;
    }
    
    setError(null);
    setLoading(true);

    try {
      const params = {
        minLat: currentBounds.minLat,
        maxLat: currentBounds.maxLat,
        minLng: currentBounds.minLng,
        maxLng: currentBounds.maxLng,
      };

      const promises = [];
      if (showHospitals) {
        promises.push(axios.get(`${API_BASE}/hospitals/nearby`, { params }).then(r => r.data.data));
      } else {
        promises.push(Promise.resolve([]));
      }

      if (showBloodBanks) {
        promises.push(axios.get(`${API_BASE}/blood-banks/nearby`, { params }).then(r => r.data.data));
      } else {
        promises.push(Promise.resolve([]));
      }

      const [hospData, bbData] = await Promise.all(promises);
      
      setHospitals(hospData || []);
      setBloodBanks(bbData || []);
    } catch (err) {
      console.error('Map fetch error:', err);
      if (err.response && err.response.data && err.response.data.error) {
        setError(err.response.data.error);
      } else {
        setError('Failed to fetch location data.');
      }
    } finally {
      setLoading(false);
    }
  }, [showHospitals, showBloodBanks]);

  // Debounce the bounds change
  const handleBoundsChange = useCallback((newBounds) => {
    setBounds(newBounds);
    if (fetchTimeout.current) clearTimeout(fetchTimeout.current);
    fetchTimeout.current = setTimeout(() => {
      fetchMarkers(newBounds);
    }, 500);
  }, [fetchMarkers]);

  // Re-fetch when toggles change, if we have bounds
  useEffect(() => {
    if (bounds) {
      fetchMarkers(bounds);
    }
  }, [showHospitals, showBloodBanks, bounds, fetchMarkers]);

  // Cleanup timeout
  useEffect(() => {
    return () => {
      if (fetchTimeout.current) clearTimeout(fetchTimeout.current);
    };
  }, []);

  return (
    <div className="flex flex-col h-[calc(100vh-80px)] -mt-4 -mx-4 mb-[-2rem]">
      {/* Top Control Bar */}
      <div className="bg-white border-b border-slate-200 px-6 py-3 flex flex-wrap items-center justify-between gap-4 z-10 shadow-sm relative">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-slate-100 rounded-lg">
            <MapPin className="w-5 h-5 text-slate-700" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-900 leading-tight">Geographic Directory</h1>
            <p className="text-xs text-slate-500">Explore static reference locations on the map.</p>
          </div>
        </div>

        <div className="flex items-center gap-6">
          {/* Toggles */}
          <label className="flex items-center gap-2 cursor-pointer group">
            <input 
              type="checkbox" 
              className="w-4 h-4 rounded border-slate-300 text-sky-600 focus:ring-sky-600"
              checked={showHospitals}
              onChange={(e) => setShowHospitals(e.target.checked)}
            />
            <div className="flex items-center gap-1.5 text-sm font-medium text-slate-700 group-hover:text-slate-900">
              <span className="w-3 h-3 rounded-full bg-sky-500 block"></span>
              Hospitals
            </div>
          </label>

          <label className="flex items-center gap-2 cursor-pointer group">
            <input 
              type="checkbox" 
              className="w-4 h-4 rounded border-slate-300 text-red-600 focus:ring-red-600"
              checked={showBloodBanks}
              onChange={(e) => setShowBloodBanks(e.target.checked)}
            />
            <div className="flex items-center gap-1.5 text-sm font-medium text-slate-700 group-hover:text-slate-900">
              <span className="w-3 h-3 rounded-full bg-red-500 block"></span>
              Blood Banks
            </div>
          </label>
        </div>
      </div>

      {/* Map Area */}
      <div className="flex-1 relative bg-slate-100">
        
        {/* Loading Overlay */}
        {loading && (
          <div className="absolute top-4 right-4 z-[1000] bg-white px-3 py-2 rounded-lg shadow-md border border-slate-100 flex items-center gap-2">
            <Loader2 className="w-4 h-4 text-primary-600 animate-spin" />
            <span className="text-sm font-medium text-slate-600">Loading area...</span>
          </div>
        )}

        {/* Error / Warning Overlay */}
        {error && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[1000] bg-amber-50 px-4 py-2.5 rounded-lg shadow-md border border-amber-200 flex items-center gap-2 max-w-md w-full justify-center">
            <Info className="w-4 h-4 text-amber-600 flex-shrink-0" />
            <span className="text-sm font-medium text-amber-800 text-center">{error}</span>
          </div>
        )}

        {/* Info Overlay Bottom Left */}
        <div className="absolute bottom-6 left-4 z-[1000] bg-white/90 backdrop-blur-sm p-3 rounded-xl shadow-lg border border-slate-200 text-xs text-slate-600 max-w-xs pointer-events-none">
          <p className="font-semibold mb-1 flex items-center gap-1.5 text-slate-800">
            <Info className="w-3.5 h-3.5" /> Static Data Only
          </p>
          <p>This map shows government directory locations. It does <strong className="text-red-600">not</strong> display real-time blood inventory or live hospital status.</p>
        </div>

        <MapContainer 
          center={center} 
          zoom={zoom} 
          scrollWheelZoom={true}
          zoomControl={false}
          className="w-full h-full z-0"
          style={{ height: '100%', width: '100%' }}
        >
          <ZoomControl position="bottomright" />
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <MapEvents onBoundsChange={handleBoundsChange} />

          <MarkerClusterGroup
            chunkedLoading
            maxClusterRadius={50}
            showCoverageOnHover={false}
          >
            {/* Render Hospitals */}
            {hospitals.map(hospital => (
              <Marker 
                key={`h-${hospital.id}`} 
                position={[hospital.latitude, hospital.longitude]}
                icon={HospitalIcon}
              >
                <Popup className="custom-popup">
                  <div className="min-w-[200px]">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="p-1.5 bg-sky-100 rounded-lg text-sky-600">
                        <Building2 className="w-4 h-4" />
                      </div>
                      <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Hospital</span>
                    </div>
                    <h3 className="font-bold text-slate-900 mb-1 leading-snug">{hospital.hospital_name}</h3>
                    <p className="text-xs text-slate-600 mb-3">
                      {[hospital.city, hospital.district, hospital.state].filter(Boolean).join(', ')}
                    </p>
                    <Link 
                      to={`/hospitals/${hospital.id}`}
                      className="flex items-center justify-center gap-1.5 w-full py-1.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-medium rounded-lg transition-colors"
                    >
                      View Details <ExternalLink className="w-3 h-3" />
                    </Link>
                  </div>
                </Popup>
              </Marker>
            ))}

            {/* Render Blood Banks */}
            {bloodBanks.map(bank => (
              <Marker 
                key={`b-${bank.id}`} 
                position={[bank.latitude, bank.longitude]}
                icon={BloodBankIcon}
              >
                <Popup className="custom-popup">
                  <div className="min-w-[200px]">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="p-1.5 bg-red-100 rounded-lg text-red-600">
                        <Droplets className="w-4 h-4" />
                      </div>
                      <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Blood Bank</span>
                    </div>
                    <h3 className="font-bold text-slate-900 mb-1 leading-snug">{bank.blood_bank_name}</h3>
                    <p className="text-xs text-slate-600 mb-3">
                      {[bank.city, bank.district, bank.state].filter(Boolean).join(', ')}
                    </p>
                    <Link 
                      to={`/blood-banks/${bank.id}`}
                      className="flex items-center justify-center gap-1.5 w-full py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-medium rounded-lg transition-colors"
                    >
                      View Details <ExternalLink className="w-3 h-3" />
                    </Link>
                  </div>
                </Popup>
              </Marker>
            ))}
          </MarkerClusterGroup>
        </MapContainer>
      </div>
      
      {/* Internal CSS overrides for leaflet popups to look modern */}
      <style dangerouslySetInnerHTML={{__html: `
        .custom-popup .leaflet-popup-content-wrapper {
          border-radius: 12px;
          box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1);
          padding: 4px;
        }
        .custom-popup .leaflet-popup-content {
          margin: 12px;
        }
        .leaflet-container {
          font-family: inherit;
        }
        .marker-cluster {
          background-clip: padding-box;
          border-radius: 20px;
        }
        .marker-cluster div {
          width: 30px;
          height: 30px;
          margin-left: 5px;
          margin-top: 5px;
          text-align: center;
          border-radius: 15px;
          font-family: 'Inter', sans-serif;
          font-weight: 600;
          font-size: 12px;
          color: #334155;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .marker-cluster-small {
          background-color: rgba(226, 232, 240, 0.6);
        }
        .marker-cluster-small div {
          background-color: rgba(241, 245, 249, 0.8);
          border: 2px solid #cbd5e1;
        }
        .marker-cluster-medium {
          background-color: rgba(203, 213, 225, 0.6);
        }
        .marker-cluster-medium div {
          background-color: rgba(226, 232, 240, 0.8);
          border: 2px solid #94a3b8;
        }
        .marker-cluster-large {
          background-color: rgba(148, 163, 184, 0.6);
        }
        .marker-cluster-large div {
          background-color: rgba(203, 213, 225, 0.8);
          border: 2px solid #64748b;
        }
      `}} />
    </div>
  );
};

export default MapDirectory;
