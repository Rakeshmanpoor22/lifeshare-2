import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  Droplets, Search, MapPin, Phone, Filter, ChevronLeft, ChevronRight,
  AlertCircle, Loader2, X, Clock, Globe, Mail, Building2, Info
} from 'lucide-react';
import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

// ── Helpers ───────────────────────────────────────────────────────────────────
const categoryColor = (cat) => {
  if (!cat) return 'bg-slate-100 text-slate-500';
  const lc = cat.toLowerCase();
  if (lc.includes('private'))   return 'bg-blue-50 text-blue-700';
  if (lc.includes('government') || lc.includes('public')) return 'bg-emerald-50 text-emerald-700';
  if (lc.includes('ngo'))       return 'bg-purple-50 text-purple-700';
  return 'bg-slate-100 text-slate-600';
};

// ── Blood Bank Card ───────────────────────────────────────────────────────────
const BloodBankCard = ({ bank }) => (
  <Link
    to={`/blood-banks/${bank.id}`}
    className="card hover:shadow-md transition-all duration-200 hover:-translate-y-0.5 block group"
  >
    <div className="p-5">
      {/* Red top accent */}
      <div className="w-8 h-1 bg-red-500 rounded-full mb-3 group-hover:w-12 transition-all duration-300" />

      {/* Header */}
      <div className="flex items-start justify-between gap-2 mb-3">
        <h3 className="font-semibold text-slate-900 text-sm leading-snug group-hover:text-red-600 transition-colors line-clamp-2 flex-1">
          {bank.blood_bank_name}
        </h3>
        {bank.category && (
          <span className={`flex-shrink-0 text-xs px-2 py-0.5 rounded-full font-medium ${categoryColor(bank.category)}`}>
            {bank.category}
          </span>
        )}
      </div>

      {/* Location */}
      <div className="flex items-start gap-1.5 text-xs text-slate-500 mb-2">
        <MapPin className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-slate-400" />
        <span className="line-clamp-2">
          {[bank.address, bank.city, bank.district, bank.state].filter(Boolean).join(', ')}
          {bank.pincode ? ` — ${bank.pincode}` : ''}
        </span>
      </div>

      {/* Contact */}
      {bank.contact && (
        <div className="flex items-center gap-1.5 text-xs text-slate-500 mb-2">
          <Phone className="w-3.5 h-3.5 flex-shrink-0 text-slate-400" />
          <span className="truncate">{bank.contact}</span>
        </div>
      )}

      {/* Footer */}
      <div className="mt-3 pt-3 border-t border-slate-100 flex items-center gap-3">
        {bank.service_time && (
          <span className="flex items-center gap-1 text-xs text-slate-400">
            <Clock className="w-3 h-3" /> {bank.service_time}
          </span>
        )}
        {bank.blood_groups_ref && (
          <span className="text-xs text-red-500 font-medium truncate">{bank.blood_groups_ref}</span>
        )}
        {!bank.service_time && !bank.blood_groups_ref && (
          <span className="text-xs text-slate-300 italic">Reference data only</span>
        )}
      </div>
    </div>
  </Link>
);

// ── Pagination ────────────────────────────────────────────────────────────────
const Pagination = ({ pagination, onPageChange }) => {
  if (!pagination || pagination.totalPages <= 1) return null;
  const { page, totalPages, total, limit } = pagination;
  const start = (page - 1) * limit + 1;
  const end   = Math.min(page * limit, total);
  const range = 2;
  const pages = [];
  for (let p = Math.max(1, page - range); p <= Math.min(totalPages, page + range); p++) pages.push(p);

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mt-8 pt-6 border-t border-slate-200">
      <p className="text-sm text-slate-500">
        Showing <span className="font-medium text-slate-700">{start.toLocaleString()}–{end.toLocaleString()}</span> of <span className="font-medium text-slate-700">{total.toLocaleString()}</span> blood banks
      </p>
      <div className="flex items-center gap-1">
        <button onClick={() => onPageChange(page - 1)} disabled={page <= 1}
          className="p-2 rounded-lg hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
          <ChevronLeft className="w-4 h-4 text-slate-600" />
        </button>
        {pages[0] > 1 && <><button onClick={() => onPageChange(1)} className="px-3 py-1.5 rounded-lg text-sm hover:bg-slate-100 text-slate-600">1</button>{pages[0] > 2 && <span className="px-1 text-slate-400">…</span>}</>}
        {pages.map(p => (
          <button key={p} onClick={() => onPageChange(p)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${p === page ? 'bg-red-600 text-white shadow-sm' : 'hover:bg-slate-100 text-slate-600'}`}>
            {p}
          </button>
        ))}
        {pages[pages.length - 1] < totalPages && <>{pages[pages.length - 1] < totalPages - 1 && <span className="px-1 text-slate-400">…</span>}<button onClick={() => onPageChange(totalPages)} className="px-3 py-1.5 rounded-lg text-sm hover:bg-slate-100 text-slate-600">{totalPages}</button></>}
        <button onClick={() => onPageChange(page + 1)} disabled={page >= totalPages}
          className="p-2 rounded-lg hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
          <ChevronRight className="w-4 h-4 text-slate-600" />
        </button>
      </div>
    </div>
  );
};

// ── Main Page ─────────────────────────────────────────────────────────────────
const BloodBankDirectory = () => {
  const [banks, setBanks]           = useState([]);
  const [pagination, setPagination] = useState(null);
  const [states, setStates]         = useState([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState('');
  const [showFilters, setShowFilters] = useState(false);

  const [searchQ,   setSearchQ]   = useState('');
  const [state,     setState]     = useState('');
  const [district,  setDistrict]  = useState('');
  const [city,      setCity]      = useState('');
  const [category,  setCategory]  = useState('');
  const [page,      setPage]      = useState(1);
  const [debouncedQ, setDebouncedQ] = useState('');

  useEffect(() => { const t = setTimeout(() => setDebouncedQ(searchQ), 350); return () => clearTimeout(t); }, [searchQ]);
  useEffect(() => { setPage(1); }, [debouncedQ, state, district, city, category]);

  useEffect(() => {
    axios.get(`${API_BASE}/blood-banks/states`)
      .then(r => setStates(r.data.data || []))
      .catch(() => {});
  }, []);

  const fetchBanks = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = { page, limit: 20 };
      if (debouncedQ) params.q        = debouncedQ;
      if (state)      params.state    = state;
      if (district)   params.district = district;
      if (city)       params.city     = city;
      if (category)   params.category = category;

      const r = await axios.get(`${API_BASE}/blood-banks`, { params });
      setBanks(r.data.data || []);
      setPagination(r.data.pagination || null);
    } catch {
      setError('Failed to load blood bank directory. Please check the server is running.');
    } finally {
      setLoading(false);
    }
  }, [page, debouncedQ, state, district, city, category]);

  useEffect(() => { fetchBanks(); }, [fetchBanks]);

  const clearFilters = () => { setSearchQ(''); setState(''); setDistrict(''); setCity(''); setCategory(''); setPage(1); };
  const hasActiveFilters = searchQ || state || district || city || category;

  return (
    <div className="max-w-7xl mx-auto">
      {/* Page Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 bg-red-100 rounded-lg">
            <Droplets className="w-5 h-5 text-red-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Blood Bank Directory</h1>
            <p className="text-sm text-slate-500">
              {pagination
                ? `${pagination.total.toLocaleString()} blood banks across India`
                : 'Government blood bank reference database'}
            </p>
          </div>
        </div>

        {/* Two-Panel Distinction Banner */}
        <div className="mt-4 grid sm:grid-cols-2 gap-3">
          {/* Directory panel */}
          <div className="flex items-start gap-2.5 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
            <Info className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-xs font-semibold text-amber-800 mb-0.5">📋 Blood Bank Directory (This Page)</p>
              <p className="text-xs text-amber-700">Static reference data from the National Health Portal. Shows locations, contacts, and addresses. Does <strong>NOT</strong> show current blood unit availability.</p>
            </div>
          </div>
          {/* Live inventory panel */}
          <Link to="/blood-bank" className="flex items-start gap-2.5 bg-red-50 border border-red-200 rounded-lg px-4 py-3 hover:bg-red-100 transition-colors group">
            <Droplets className="w-4 h-4 text-red-600 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-xs font-semibold text-red-700 mb-0.5">🩸 Live Blood Availability →</p>
              <p className="text-xs text-red-600">Real-time blood unit inventory managed by verified LifeShare hospital accounts. Click to view live availability.</p>
            </div>
          </Link>
        </div>
      </div>

      {/* Search + Filter Bar */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 mb-5">
        <div className="flex gap-3">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            <input
              type="text"
              value={searchQ}
              onChange={e => setSearchQ(e.target.value)}
              placeholder="Search by blood bank name, city, district, state, or pincode…"
              className="input-field pl-9 text-sm"
            />
            {searchQ && (
              <button onClick={() => setSearchQ('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium transition-colors ${
              hasActiveFilters ? 'border-red-300 bg-red-50 text-red-700' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
            }`}
          >
            <Filter className="w-4 h-4" />
            Filters
            {hasActiveFilters && (
              <span className="bg-red-600 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center">
                {[state, district, city, category].filter(Boolean).length}
              </span>
            )}
          </button>
        </div>

        {showFilters && (
          <div className="mt-4 pt-4 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">State</label>
              <select value={state} onChange={e => { setState(e.target.value); setDistrict(''); }} className="input-field text-sm">
                <option value="">All States</option>
                {states.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">District</label>
              <input type="text" value={district} onChange={e => setDistrict(e.target.value)}
                placeholder="e.g. Hyderabad" className="input-field text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">City</label>
              <input type="text" value={city} onChange={e => setCity(e.target.value)}
                placeholder="e.g. Mumbai" className="input-field text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Type</label>
              <select value={category} onChange={e => setCategory(e.target.value)} className="input-field text-sm">
                <option value="">All Types</option>
                <option value="Private">Private</option>
                <option value="Public/Government">Public / Government</option>
                <option value="NGO">NGO</option>
              </select>
            </div>
            {hasActiveFilters && (
              <div className="sm:col-span-2 lg:col-span-4 flex justify-end">
                <button onClick={clearFilters} className="text-xs text-slate-500 hover:text-red-600 flex items-center gap-1 transition-colors">
                  <X className="w-3.5 h-3.5" /> Clear all filters
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Results */}
      {error ? (
        <div className="text-center py-16 text-red-600">
          <AlertCircle className="w-10 h-10 mx-auto mb-3" />
          <p className="font-medium">{error}</p>
        </div>
      ) : loading ? (
        <div className="flex items-center justify-center py-24">
          <div className="text-center">
            <Loader2 className="w-8 h-8 animate-spin text-red-500 mx-auto mb-3" />
            <p className="text-sm text-slate-500">Loading blood banks…</p>
          </div>
        </div>
      ) : banks.length === 0 ? (
        <div className="text-center py-20">
          <Droplets className="w-12 h-12 text-slate-300 mx-auto mb-4" />
          <p className="text-slate-500 font-medium">No blood banks found</p>
          <p className="text-slate-400 text-sm mt-1">Try adjusting your search or filters</p>
          {hasActiveFilters && (
            <button onClick={clearFilters} className="mt-4 text-red-600 text-sm hover:underline">
              Clear all filters
            </button>
          )}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {banks.map(b => <BloodBankCard key={b.id} bank={b} />)}
          </div>
          <Pagination pagination={pagination} onPageChange={setPage} />
        </>
      )}
    </div>
  );
};

export default BloodBankDirectory;
