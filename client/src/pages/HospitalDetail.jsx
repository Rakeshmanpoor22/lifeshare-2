import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, MapPin, Phone, Smartphone, AlertCircle, Building2,
  BedDouble, Ambulance, Stethoscope, Globe, Mail, Shield,
  Calendar, Users, Loader2, ExternalLink, Hash, Info
} from 'lucide-react';
import axios from 'axios';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// ── Custom Icon ──
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


const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

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
  // Try to split on semicolons or pipe or comma
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

const categoryColor = (cat) => {
  if (!cat) return 'bg-slate-100 text-slate-600';
  if (cat.toLowerCase().includes('private')) return 'bg-blue-50 text-blue-700 border-blue-100';
  if (cat.toLowerCase().includes('public') || cat.toLowerCase().includes('government'))
    return 'bg-emerald-50 text-emerald-700 border-emerald-100';
  return 'bg-slate-100 text-slate-600 border-slate-200';
};

// ── Main Page ─────────────────────────────────────────────────────────────────
const HospitalDetail = () => {
  const { id }       = useParams();
  const navigate     = useNavigate();
  const [hospital, setHospital] = useState(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState('');

  useEffect(() => {
    setLoading(true);
    axios.get(`${API_BASE}/hospitals/${id}`)
      .then(r => setHospital(r.data.data))
      .catch(() => setError('Hospital not found or server error.'))
      .finally(() => setLoading(false));
  }, [id]);

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

  return (
    <div className="max-w-4xl mx-auto">
      {/* Back Button */}
      <button
        onClick={() => navigate(-1)}
        className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-800 mb-5 transition-colors group"
      >
        <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
        Back to Directory
      </button>

      {/* Header Card */}
      <div className="card mb-5">
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
                  <span className={`text-xs px-2.5 py-1 rounded-full border font-medium bg-white/10 text-white border-white/20`}>
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
      <div className="flex items-start gap-2.5 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 mb-5">
        <Info className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
        <p className="text-xs text-amber-800">
          <span className="font-semibold">Static Reference Data.</span> This information is from the government hospital directory and may not reflect current availability of beds, blood, or equipment. Real-time resource data is managed by verified LifeShare hospital accounts.
        </p>
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
          {hospital.latitude && hospital.longitude && (
            <div className="mt-3 pt-3 border-t border-slate-100">
              <p className="text-xs text-slate-400 font-medium uppercase tracking-wide mb-1">Coordinates</p>
              <p className="text-sm text-slate-600 font-mono">
                {parseFloat(hospital.latitude).toFixed(6)}, {parseFloat(hospital.longitude).toFixed(6)}
              </p>
              <div className="h-48 w-full mt-2 rounded-lg overflow-hidden border border-slate-200">
                <MapContainer center={[hospital.latitude, hospital.longitude]} zoom={14} scrollWheelZoom={false} className="h-full w-full" style={{ height: '100%', width: '100%' }}>
                  <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  />
                  <Marker position={[hospital.latitude, hospital.longitude]} icon={HospitalIcon}>
                    <Popup>{hospital.hospital_name}</Popup>
                  </Marker>
                </MapContainer>
              </div>
              <Link to={`/map?lat=${hospital.latitude}&lng=${hospital.longitude}&zoom=14`} className="text-xs text-primary-600 mt-2 block hover:underline">
                View in Geographic Directory →
              </Link>
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
          Source: Government Hospital Directory · Dataset ID #{hospital.source_record_id} · Data as of last import
        </p>
        <Link to="/hospitals" className="mt-2 inline-flex items-center gap-1.5 text-xs text-primary-600 hover:underline">
          <ArrowLeft className="w-3.5 h-3.5" /> Back to Hospital Directory
        </Link>
      </div>
    </div>
  );
};

export default HospitalDetail;
