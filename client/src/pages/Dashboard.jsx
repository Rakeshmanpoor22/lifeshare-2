import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../api';
import { useAuth } from '../context/AuthContext';
import { 
  Heart, Activity, Package, Clock, AlertTriangle, CheckCircle2, 
  Search, ArrowRight, PlusCircle, MapPin, Droplets, Info, Building2
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';

const Dashboard = () => {
  const { user } = useAuth();
  const [organs, setOrgans] = useState([]);
  const [equipment, setEquipment] = useState([]);
  const [blood, setBlood] = useState([]);
  const [incomingRequests, setIncomingRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const fetchData = async () => {
    try {
      const [orgRes, equipRes, bloodRes, reqRes] = await Promise.all([
        api.get('/resources/organs'),
        api.get('/resources/equipment'),
        api.get('/resources/blood'),
        api.get('/requests/incoming')
      ]);
      setOrgans(orgRes.data);
      setEquipment(equipRes.data);
      setBlood(bloodRes.data);
      setIncomingRequests(reqRes.data);
    } catch (err) {
      toast.error('Failed to fetch real-time data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleAcceptRequest = async (id) => {
    try {
      await api.post(`/requests/${id}/accept`);
      toast.success('Request accepted! Transaction logged.');
      fetchData(); // Refresh data
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to accept request.');
    }
  };

  const filteredOrgans = (organs || []).filter(o => 
    (o.type?.toLowerCase() || '').includes(search?.toLowerCase() || '') || 
    (o.blood_group?.toLowerCase() || '').includes(search?.toLowerCase() || '')
  );
  const filteredEquipment = (equipment || []).filter(e => 
    (e.type?.toLowerCase() || '').includes(search?.toLowerCase() || '')
  );
  const filteredBlood = (blood || []).filter(b => 
    (b.blood_group?.toLowerCase() || '').includes(search?.toLowerCase() || '')
  );

  return (
    <div className="space-y-10 py-6">
      {/* Header */}
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900 leading-tight">Welcome, {user?.name}</h1>
          <p className="text-slate-500 font-medium flex items-center gap-2">
            <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
            System Status: Healthy & Synced
          </p>
        </div>
        
        <div className="flex w-full md:w-auto gap-4">
          <div className="relative flex-1 md:w-80">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input-field pl-10" 
              placeholder="Search organs/equipment..." 
            />
          </div>
          <div className="flex gap-2">
            <Link to="/post-resource" className="btn-secondary !border-emerald-500 !text-emerald-700 hover:!bg-emerald-50 flex items-center gap-2 whitespace-nowrap">
              <PlusCircle className="w-5 h-5" />
              List Resource
            </Link>
            <Link to="/request" className="btn-primary flex items-center gap-2 whitespace-nowrap">
              <PlusCircle className="w-5 h-5" />
              Request
            </Link>
          </div>
        </div>
      </header>

      {/* Grid Layout */}
      <div className="grid lg:grid-cols-3 gap-8">
        
        {/* Real-time Inventory (Left & Center) */}
        <div className="lg:col-span-2 space-y-12">
          
          {/* Organs Section */}
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                <Heart className="w-5 h-5 text-red-500 fill-current" />
                Available Organs
              </h2>
            </div>
            
            <div className="grid md:grid-cols-2 gap-6">
              <AnimatePresence>
                {filteredOrgans.length === 0 ? (
                  <p className="text-slate-400 py-4 col-span-2 text-center border-2 border-dashed border-slate-200 rounded-xl">No organs matching your search</p>
                ) : filteredOrgans.map((organ, idx) => (
                  <motion.div 
                    layout
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    key={organ.id} 
                    className="card p-6 border-l-4 border-l-red-500 hover:shadow-md transition-shadow group"
                  >
                    <div className="flex justify-between items-start mb-4">
                      <div className="p-2 bg-red-50 rounded-lg group-hover:scale-110 transition-transform">
                        <Droplets className="w-6 h-6 text-red-600" />
                      </div>
                      <span className="px-3 py-1 bg-green-50 text-green-700 rounded-full text-xs font-bold uppercase tracking-wider">Available</span>
                    </div>
                    <div className="space-y-4">
                      <div>
                        <h3 className="text-2xl font-bold text-slate-900">{organ.type}</h3>
                        <p className="text-lg font-semibold text-red-600 bg-red-50 inline-block px-2 rounded mt-1">Blood Group: {organ.blood_group}</p>
                      </div>
                      <hr className="border-slate-100" />
                      <div className="flex items-center justify-between text-sm text-slate-500">
                        <span className="flex items-center gap-1"><MapPin className="w-4 h-4" /> {organ.hospital_name || 'N/A'}</span>
                        <span className="flex items-center gap-1 font-medium"><Clock className="w-4 h-4" /> {organ.created_at ? new Date(organ.created_at).toLocaleDateString() : 'Pending'}</span>
                      </div>
                      <Link 
                        to="/request"
                        state={{ resource_type: 'organ', id: organ.id, urgency: 'high' }}
                        className="w-full btn-secondary text-sm flex items-center justify-center gap-2 group-hover:border-primary-500"
                      >
                        Request <ArrowRight className="w-4 h-4" />
                      </Link>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </section>

          {/* Blood Inventory Section */}
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                <Droplets className="w-5 h-5 text-red-500" />
                Live Blood Inventory
              </h2>
              <Link to="/blood-bank" className="text-xs font-black text-red-600 uppercase tracking-widest hover:underline decoration-2 underline-offset-4">
                View Global Registry
              </Link>
            </div>
            
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <AnimatePresence>
                {filteredBlood.length === 0 ? (
                  <p className="text-slate-400 py-4 col-span-4 text-center border-2 border-dashed border-slate-200 rounded-xl">No blood units matching search</p>
                ) : filteredBlood.map((b, idx) => (
                  <motion.div 
                    layout
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    key={b.id} 
                    className="card p-4 border-t-4 border-t-red-600 bg-red-50/50 hover:shadow-md transition-all text-center group"
                  >
                    <p className="text-4xl font-black text-red-600 mb-1 group-hover:scale-110 transition-transform">{b.blood_group}</p>
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">{b.units} Units Available</p>
                    <p className="text-[10px] text-slate-400 mt-2 truncate">{b.hospital_name}</p>
                    <Link 
                      to="/request" 
                      state={{ resource_type: 'blood', id: b.id, urgency: 'high' }}
                      className="mt-3 block w-full py-1.5 bg-white border border-red-200 text-red-600 text-[10px] font-black uppercase rounded-lg hover:bg-red-600 hover:text-white transition-colors"
                    >
                      Request Unit
                    </Link>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </section>

          {/* Equipment Section */}
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                <Package className="w-5 h-5 text-blue-500 fill-current" />
                Medical Equipment
              </h2>
            </div>
            
            <div className="grid md:grid-cols-2 gap-6">
              <AnimatePresence>
                {filteredEquipment.length === 0 ? (
                  <p className="text-slate-400 py-4 col-span-2 text-center border-2 border-dashed border-slate-200 rounded-xl">No equipment matching your search</p>
                ) : filteredEquipment.map((eq, idx) => (
                  <motion.div 
                    layout
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    key={eq.id} 
                    className="card p-6 border-l-4 border-l-blue-500 hover:shadow-md transition-shadow group"
                  >
                    <div className="flex justify-between items-start mb-4">
                      <div className="p-2 bg-blue-50 rounded-lg group-hover:scale-110 transition-transform">
                        <Activity className="w-6 h-6 text-blue-600" />
                      </div>
                      <span className="px-3 py-1 bg-green-50 text-green-700 rounded-full text-xs font-bold uppercase tracking-wider">Ready to Ship</span>
                    </div>
                    <div className="space-y-4">
                      <div>
                        <h3 className="text-2xl font-bold text-slate-900">{eq.type}</h3>
                        <p className="text-slate-500 text-sm italic">{eq.model || 'Standard Model'}</p>
                      </div>
                      <hr className="border-slate-100" />
                      <div className="flex items-center justify-between text-sm text-slate-500">
                        <span className="flex items-center gap-1"><MapPin className="w-4 h-4" /> {eq.hospital_name || 'N/A'}</span>
                      </div>
                      <Link 
                        to={`/equipment/${eq.id}`}
                        className="w-full btn-secondary text-sm flex items-center justify-center gap-2 group-hover:border-primary-500 hover:text-primary-600 transition-colors"
                      >
                        View Detailed Specs <ArrowRight className="w-4 h-4" />
                      </Link>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </section>

          {/* Healthcare Directory Section (Moved from Navbar) */}
          <section className="space-y-4 mt-8 pt-6 border-t border-slate-100">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                <Search className="w-5 h-5 text-indigo-500" />
                Healthcare Directory
              </h2>
            </div>
            
            <div className="grid md:grid-cols-2 gap-6">
              {/* Hospital Directory Card */}
              <div className="card p-6 border-l-4 border-l-indigo-500 flex flex-col justify-between gap-6 hover:shadow-md transition-shadow bg-gradient-to-r from-indigo-50/50 to-white">
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-indigo-100 text-indigo-600 rounded-lg">
                      <Building2 className="w-5 h-5" />
                    </div>
                    <h3 className="font-bold text-slate-900 text-lg">Hospital Directory</h3>
                  </div>
                  <p className="text-slate-600">30,273 registered hospitals across India.</p>
                </div>
                <Link 
                  to="/hospitals" 
                  className="btn-secondary whitespace-nowrap !border-indigo-200 !text-indigo-600 hover:!bg-indigo-50 hover:!border-indigo-300 px-6 py-2 w-full text-center"
                >
                  Explore Hospitals
                </Link>
              </div>

              {/* Blood Bank Directory Card */}
              <div className="card p-6 border-l-4 border-l-red-500 flex flex-col justify-between gap-6 hover:shadow-md transition-shadow bg-gradient-to-r from-red-50/50 to-white">
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-red-100 text-red-600 rounded-lg">
                      <Droplets className="w-5 h-5" />
                    </div>
                    <h3 className="font-bold text-slate-900 text-lg">Blood Banks</h3>
                  </div>
                  <p className="text-slate-600">2,947 verified national blood banks.</p>
                </div>
                <Link 
                  to="/blood-banks" 
                  className="btn-secondary whitespace-nowrap !border-red-200 !text-red-600 hover:!bg-red-50 hover:!border-red-300 px-6 py-2 w-full text-center"
                >
                  Explore Blood Banks
                </Link>
              </div>
            </div>
          </section>
        </div>

        {/* Action Sidebar */}
        <aside className="space-y-8">
          
          {/* Incoming Requests */}
          <section className="card p-6 space-y-6 border-t-8 border-primary-600">
            <h2 className="text-lg font-bold text-slate-900 flex items-center justify-between">
              Incoming Requests
              <span className="bg-primary-100 text-primary-600 px-2 py-0.5 rounded-full text-xs">{incomingRequests.length}</span>
            </h2>
            
            <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
              {incomingRequests.length === 0 ? (
                <div className="text-center py-10 space-y-2 border border-dashed border-slate-100 rounded-xl">
                  <CheckCircle2 className="w-8 h-8 text-slate-200 mx-auto" />
                  <p className="text-slate-400 text-xs text-center">No pending actions.</p>
                </div>
              ) : incomingRequests.map((req, i) => (
                <motion.div 
                  initial={{ x: 20, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  key={req.id} 
                  className="bg-slate-50 rounded-xl p-4 border border-slate-100 space-y-3"
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-bold text-slate-900">{req.requester_name || 'Unknown Hospital'}</p>
                      <p className="text-xs text-slate-500 uppercase tracking-tight">{(req.resource_type || 'Item')} - {(req.urgency || 'Normal')}</p>
                    </div>
                    {req.urgency === 'critical' && <AlertTriangle className="w-4 h-4 text-red-500 animate-bounce" />}
                  </div>
                  <p className="text-sm text-slate-600 italic">"{req.notes || 'Emergency request'}"</p>
                  <div className="flex gap-2">
                    <button 
                      onClick={() => handleAcceptRequest(req.id)}
                      className="flex-1 py-2 bg-primary-600 text-white rounded-lg text-xs font-bold hover:bg-primary-700 shadow-sm"
                    >
                      Accept Share
                    </button>
                    <Link 
                      to={`/match/${req.id}`}
                      className="flex-1 py-2 bg-white text-slate-600 rounded-lg text-xs font-bold border border-slate-200 hover:bg-slate-100 flex items-center justify-center transition-colors hover:border-primary-500 hover:text-primary-600"
                    >
                      View Details
                    </Link>
                  </div>
                </motion.div>
              ))}
            </div>
          </section>

          {/* Outgoing Status (Added Section) */}
          <section className="card p-6 space-y-6 border-t-8 border-emerald-600">
             <h2 className="text-lg font-bold text-slate-900 flex items-center justify-between">
              My Resource Requests
              <Activity className="w-4 h-4 text-emerald-600" />
            </h2>
            <div className="space-y-3 text-slate-500 text-sm">
              <p>Requested resources appear here once donor hospitals accept the match. Check notifications for live updates.</p>
              <div className="p-4 bg-emerald-50 rounded-xl border border-emerald-100 text-emerald-800 flex items-center gap-2">
                <Info className="w-4 h-4" />
                <span>Matches are real-time.</span>
              </div>
            </div>
          </section>



          {/* Quick Help Card */}
          <div className="card bg-slate-900 p-6 text-white overflow-hidden relative">
            <Info className="absolute -right-4 -bottom-4 w-24 h-24 text-white/5 rotate-12" />
            <h3 className="font-bold mb-2 text-primary-400 uppercase tracking-widest text-xs">Resource Sharing Ethics</h3>
            <p className="text-slate-400 text-sm mb-2">Sharing lives is a serious responsibility. Ensure all medical protocols are followed.</p>
            <p className="text-slate-500 text-xs italic mb-4">Desingned in compilance with THOTA guidelines</p>
            <Link to="/policy" className="text-white hover:text-primary-300 text-sm font-extrabold flex items-center gap-1 group">
              Read Policy Guide <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </Link>
          </div>
        </aside>
      </div>
    </div>
  );
};

export default Dashboard;

