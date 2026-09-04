import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  Search, MapPin, Phone, Building2, Filter, ChevronLeft,
  ChevronRight, AlertCircle, Loader2, X, Stethoscope, BedDouble,
  Ambulance, Globe2
} from 'lucide-react';
import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

// ── Helpers ──────────────────────────────────────────────────────────────────
const categoryColor = (cat) => {
  if (!cat) return 'bg-slate-100 text-slate-600';
  if (cat.toLowerCase().includes('private')) return 'bg-blue-50 text-blue-700';
  if (cat.toLowerCase().includes('public') || cat.toLowerCase().includes('government'))
    return 'bg-emerald-50 text-emerald-700';
  return 'bg-slate-100 text-slate-600';
};

const categoryLabel = (cat) => cat || 'Unspecified';

// ── Hospital Card ─────────────────────────────────────────────────────────────
const HospitalCard = ({ hospital }) => {
  const hasCoordsDisplay = hospital.latitude && hospital.longitude;

  return (
    <Link
      to={`/hospitals/${hospital.id}`}
      className="card hover:shadow-md transition-all duration-200 hover:-translate-y-0.5 block group"
    >
      <div className="p-5">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-slate-900 text-sm leading-snug group-hover:text-primary-600 transition-colors line-clamp-2">
              {hospital.hospital_name}
            </h3>
          </div>
          <span className={`flex-shrink-0 text-xs px-2 py-0.5 rounded-full font-medium ${categoryColor(hospital.hospital_category)}`}>
            {categoryLabel(hospital.hospital_category)}
          </span>
        </div>

        {/* Location */}
        <div className="flex items-start gap-1.5 text-xs text-slate-500 mb-2">
          <MapPin className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-slate-400" />
          <span className="line-clamp-2">
            {[hospital.address, hospital.district, hospital.state].filter(Boolean).join(', ')}
            {hospital.pincode ? ` — ${hospital.pincode}` : ''}
          </span>
        </div>

        {/* Care Type / Medical System */}
        {(hospital.hospital_care_type || hospital.medical_system) && (
          <div className="flex items-center gap-1.5 text-xs text-slate-500 mb-2">
            <Stethoscope className="w-3.5 h-3.5 flex-shrink-0 text-slate-400" />
            <span className="line-clamp-1">
              {[hospital.hospital_care_type, hospital.medical_system].filter(Boolean).join(' · ')}
            </span>
          </div>
        )}

        {/* Footer row */}
        <div className="mt-3 pt-3 border-t border-slate-100 flex items-center gap-3 flex-wrap">
          {hospital.total_beds > 0 && (
            <span className="flex items-center gap-1 text-xs text-slate-500">
              <BedDouble className="w-3.5 h-3.5 text-slate-400" />
              {hospital.total_beds} beds
            </span>
          )}
          {hospital.emergency_phone && (
            <span className="flex items-center gap-1 text-xs text-emerald-600 font-medium">
              <Ambulance className="w-3.5 h-3.5" />
              Emergency
            </span>
          )}
          {hospital.telephone && (
            <span className="flex items-center gap-1 text-xs text-slate-500">
              <Phone className="w-3.5 h-3.5 text-slate-400" />
              {hospital.telephone}
            </span>
          )}
          {hasCoordsDisplay && (
            <span className="ml-auto flex items-center gap-1 text-xs text-primary-500">
              <Globe2 className="w-3.5 h-3.5" />
              Map
            </span>
          )}
        </div>
      </div>
    </Link>
  );
};

// ── Pagination ────────────────────────────────────────────────────────────────
const Pagination = ({ pagination, onPageChange }) => {
  if (!pagination || pagination.totalPages <= 1) return null;
  const { page, totalPages, total, limit } = pagination;
  const start = (page - 1) * limit + 1;
  const end   = Math.min(page * limit, total);

  const pages = [];
  const range = 2;
  for (let p = Math.max(1, page - range); p <= Math.min(totalPages, page + range); p++) {
    pages.push(p);
  }

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mt-8 pt-6 border-t border-slate-200">
      <p className="text-sm text-slate-500">
        Showing <span className="font-medium text-slate-700">{start.toLocaleString()}–{end.toLocaleString()}</span> of <span className="font-medium text-slate-700">{total.toLocaleString()}</span> hospitals
      </p>
      <div className="flex items-center gap-1">
        <button
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          className="p-2 rounded-lg hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <ChevronLeft className="w-4 h-4 text-slate-600" />
        </button>
        {pages[0] > 1 && (
          <>
            <button onClick={() => onPageChange(1)} className="px-3 py-1.5 rounded-lg text-sm hover:bg-slate-100 transition-colors text-slate-600">1</button>
            {pages[0] > 2 && <span className="px-1 text-slate-400">…</span>}
          </>
        )}
        {pages.map(p => (
          <button
            key={p}
            onClick={() => onPageChange(p)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              p === page
                ? 'bg-primary-600 text-white shadow-sm'
                : 'hover:bg-slate-100 text-slate-600'
            }`}
          >
            {p}
          </button>
        ))}
        {pages[pages.length - 1] < totalPages && (
          <>
            {pages[pages.length - 1] < totalPages - 1 && <span className="px-1 text-slate-400">…</span>}
            <button onClick={() => onPageChange(totalPages)} className="px-3 py-1.5 rounded-lg text-sm hover:bg-slate-100 transition-colors text-slate-600">{totalPages}</button>
          </>
        )}
        <button
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
          className="p-2 rounded-lg hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <ChevronRight className="w-4 h-4 text-slate-600" />
        </button>
      </div>
    </div>
  );
};

// ── Main Page ─────────────────────────────────────────────────────────────────
const HospitalDirectory = () => {
  const [hospitals, setHospitals]     = useState([]);
  const [pagination, setPagination]   = useState(null);
  const [states, setStates]           = useState([]);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState('');
  const [showFilters, setShowFilters] = useState(false);

  // Filters & search
  const [searchQ,    setSearchQ]    = useState('');
  const [state,      setState]      = useState('');
  const [category,   setCategory]   = useState('');
  const [emergency,  setEmergency]  = useState('');
  const [page,       setPage]       = useState(1);

  // Debounced search input
  const [debouncedQ, setDebouncedQ] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(searchQ), 350);
    return () => clearTimeout(t);
  }, [searchQ]);

  // Reset page when filters change
  useEffect(() => { setPage(1); }, [debouncedQ, state, category, emergency]);

  // Load states once
  useEffect(() => {
    axios.get(`${API_BASE}/hospitals/states`)
      .then(r => setStates(r.data.data || []))
      .catch(() => {});
  }, []);

  // Load hospitals
  const fetchHospitals = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = { page, limit: 20 };
      if (debouncedQ) params.q        = debouncedQ;
      if (state)      params.state    = state;
      if (category)   params.category = category;
      if (emergency)  params.emergency = emergency;

      const r = await axios.get(`${API_BASE}/hospitals`, { params });
      setHospitals(r.data.data || []);
      setPagination(r.data.pagination || null);
    } catch (err) {
      setError('Failed to load hospitals. Please check the server is running.');
    } finally {
      setLoading(false);
    }
  }, [page, debouncedQ, state, category, emergency]);

  useEffect(() => { fetchHospitals(); }, [fetchHospitals]);

  const clearFilters = () => {
    setSearchQ('');
    setState('');
    setCategory('');
    setEmergency('');
    setPage(1);
  };

  const hasActiveFilters = searchQ || state || category || emergency;

  return (
    <div className="max-w-7xl mx-auto">
      {/* Page Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 bg-primary-100 rounded-lg">
            <Building2 className="w-5 h-5 text-primary-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Hospital Directory</h1>
            <p className="text-sm text-slate-500">
              {pagination
                ? `${pagination.total.toLocaleString()} verified hospitals across India`
                : 'Government hospital reference database'}
            </p>
          </div>
        </div>

        {/* Data Disclaimer */}
        <div className="mt-4 flex items-start gap-2.5 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
          <AlertCircle className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
          <p className="text-xs text-amber-800 leading-relaxed">
            <span className="font-semibold">Static Reference Data.</span> This directory is sourced from the government hospital dataset and represents directory information only. It does not reflect real-time bed availability, blood stock, organ availability, or emergency capacity. Real-time resource data is managed by verified hospital accounts on LifeShare.
          </p>
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
              placeholder="Search by hospital name, district, state, or pincode…"
              className="input-field pl-9 text-sm"
            />
            {searchQ && (
              <button
                onClick={() => setSearchQ('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium transition-colors ${
              hasActiveFilters
                ? 'border-primary-300 bg-primary-50 text-primary-700'
                : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
            }`}
          >
            <Filter className="w-4 h-4" />
            Filters
            {hasActiveFilters && (
              <span className="bg-primary-600 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center">
                {[state, category, emergency].filter(Boolean).length}
              </span>
            )}
          </button>
        </div>

        {/* Expanded Filters */}
        {showFilters && (
          <div className="mt-4 pt-4 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* State Filter */}
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">State</label>
              <select
                value={state}
                onChange={e => setState(e.target.value)}
                className="input-field text-sm"
              >
                <option value="">All States</option>
                {states.map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>

            {/* Category Filter */}
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Category</label>
              <select
                value={category}
                onChange={e => setCategory(e.target.value)}
                className="input-field text-sm"
              >
                <option value="">All Categories</option>
                <option value="Private">Private</option>
                <option value="Public/Government">Public / Government</option>
              </select>
            </div>

            {/* Emergency Filter */}
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Emergency Services</label>
              <select
                value={emergency}
                onChange={e => setEmergency(e.target.value)}
                className="input-field text-sm"
              >
                <option value="">All</option>
                <option value="yes">Has Emergency Number</option>
              </select>
            </div>

            {/* Clear button */}
            {hasActiveFilters && (
              <div className="sm:col-span-3 flex justify-end">
                <button
                  onClick={clearFilters}
                  className="text-xs text-slate-500 hover:text-red-600 flex items-center gap-1 transition-colors"
                >
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
            <Loader2 className="w-8 h-8 animate-spin text-primary-500 mx-auto mb-3" />
            <p className="text-sm text-slate-500">Loading hospitals…</p>
          </div>
        </div>
      ) : hospitals.length === 0 ? (
        <div className="text-center py-20">
          <Building2 className="w-12 h-12 text-slate-300 mx-auto mb-4" />
          <p className="text-slate-500 font-medium">No hospitals found</p>
          <p className="text-slate-400 text-sm mt-1">Try adjusting your search or filters</p>
          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="mt-4 text-primary-600 text-sm hover:underline"
            >
              Clear all filters
            </button>
          )}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {hospitals.map(h => (
              <HospitalCard key={h.id} hospital={h} />
            ))}
          </div>
          <Pagination pagination={pagination} onPageChange={setPage} />
        </>
      )}
    </div>
  );
};

export default HospitalDirectory;
