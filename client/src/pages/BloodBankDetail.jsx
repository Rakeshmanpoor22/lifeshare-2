import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, MapPin, Phone, Mail, Globe, Clock, Droplets,
  AlertCircle, Loader2, Info, Hash, Building2, ExternalLink
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
const BloodBankIcon = createCustomIcon('#ef4444', '<path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z"></path>');


const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

// ── Helpers ───────────────────────────────────────────────────────────────────
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

const categoryColor = (cat) => {
  if (!cat) return 'bg-slate-100 text-slate-600';
  const lc = cat.toLowerCase();
  if (lc.includes('private'))   return 'bg-blue-50 text-blue-700 border-blue-100';
  if (lc.includes('government') || lc.includes('public')) return 'bg-emerald-50 text-emerald-700 border-emerald-100';
  if (lc.includes('ngo'))       return 'bg-purple-50 text-purple-700 border-purple-100';
  return 'bg-slate-100 text-slate-600 border-slate-200';
};

// ── Main Page ─────────────────────────────────────────────────────────────────
const BloodBankDetail = () => {
  const { id }   = useParams();
  const navigate = useNavigate();
  const [bank, setBank]     = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState('');
  
  // Phase 9.1 Booking State
  const [showBooking, setShowBooking] = useState(false);
  const [bookingForm, setBookingForm] = useState({
    patient_name: '',
    patient_phone: '',
    patient_blood_group: 'A+',
    appointment_date: ''
  });
  const [bookingStatus, setBookingStatus] = useState(null);

  useEffect(() => {
    axios.get(`${API_BASE}/blood-banks/${id}`)
      .then(r => setBank(r.data.data))
      .catch(() => setError('Blood bank not found or server error.'))
      .finally(() => setLoading(false));
  }, [id]);

  const handleBookSubmit = async (e) => {
    e.preventDefault();
    setBookingStatus('submitting');
    try {
      const res = await axios.post(`${API_BASE}/appointments`, {
        blood_bank_directory_id: id,
        ...bookingForm
      });
      // Save session token for retrieving appointments later
      const sessionToken = res.data.appointment.session_token;
      localStorage.setItem('lifeshare_patient_session', sessionToken);
      setBookingStatus('success');
    } catch (err) {
      setBookingStatus('error');
      console.error(err);
      alert(err.response?.data?.error || 'Failed to book appointment.');
    }
  };

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

  return (
    <div className="max-w-3xl mx-auto">
      {/* Back */}
      <button onClick={() => navigate(-1)}
        className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-800 mb-5 transition-colors group">
        <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
        Back to Blood Bank Directory
      </button>

      {/* Header */}
      <div className="card mb-5">
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

      {/* Booking Form Overlay */}
      {showBooking && (
        <div className="card p-6 mb-5 border-t-4 border-t-red-600 bg-red-50/30">
          <h2 className="text-lg font-bold text-slate-800 mb-4">Request Donation Appointment</h2>
          
          {bookingStatus === 'success' ? (
            <div className="bg-emerald-50 text-emerald-800 p-4 rounded-lg border border-emerald-200">
              <h3 className="font-bold flex items-center gap-2 mb-1">
                <AlertCircle className="w-5 h-5 text-emerald-600" />
                Booking Request Confirmed
              </h3>
              <p className="text-sm">Your appointment has been securely logged. This is an operational booking request; slot availability is not guaranteed in real-time.</p>
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
      <div className="grid sm:grid-cols-2 gap-3 mb-5">
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
              <Link to={`/map?lat=${bank.latitude}&lng=${bank.longitude}&zoom=14`} className="text-xs text-primary-600 mt-2 block hover:underline">
                View in Geographic Directory →
              </Link>
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

        {/* Blood Info — only shown if data exists */}
        {(bank.blood_component || bank.blood_groups_ref || bank.service_time) && (
          <div className="card p-5 md:col-span-2">
            <h2 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
              <Droplets className="w-4 h-4 text-red-500" /> Blood Bank Information
            </h2>
            <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-3">
              <p className="text-xs text-amber-800">
                ⚠️ The component and blood group information below is <strong>static reference metadata</strong> from the 2015 government dataset. It does <strong>not</strong> reflect current availability.
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
          Source: National Health Portal Blood Bank Directory · Dataset ID #{bank.source_record_id} · Data as of Sep 2015
        </p>
        <Link to="/blood-banks" className="mt-2 inline-flex items-center gap-1.5 text-xs text-red-600 hover:underline">
          <ArrowLeft className="w-3.5 h-3.5" /> Back to Blood Bank Directory
        </Link>
      </div>
    </div>
  );
};

export default BloodBankDetail;
