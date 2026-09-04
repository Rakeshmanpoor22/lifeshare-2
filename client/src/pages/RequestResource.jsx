import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import api from '../api';
import { 
  Heart, Package, AlertTriangle, Send, Loader2, ArrowLeft, 
  MapPin, CheckCircle2, Info, Droplets
} from 'lucide-react';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';

const RequestResource = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [loading, setLoading] = useState(false);
  const [availableResources, setAvailableResources] = useState({ organs: [], equipment: [], blood: [] });
  const [formData, setFormData] = useState({
    resource_type: location.state?.resource_type || 'organ',
    target_resource_id: location.state?.id || '',
    urgency: location.state?.urgency || 'medium',
    notes: '',
    waitlist_item: ''
  });

  useEffect(() => {
    const fetchResources = async () => {
      try {
        const [orgRes, equipRes, bloodRes] = await Promise.all([
          api.get('/resources/organs'),
          api.get('/resources/equipment'),
          api.get('/resources/blood')
        ]);
        setAvailableResources({ 
          organs: orgRes.data, 
          equipment: equipRes.data, 
          blood: bloodRes.data 
        });
      } catch (err) {
        toast.error('Failed to load available resources.');
      }
    };
    fetchResources();
  }, []);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.target_resource_id) {
      return toast.error('Please select a specific item or join the waitlist.');
    }
    if (formData.target_resource_id === 'waitlist' && !formData.waitlist_item) {
      return toast.error(`Please enter the specific ${formData.resource_type} you want to waitlist for.`);
    }

    setLoading(true);
    try {
      const submissionData = { ...formData };
      if (submissionData.target_resource_id === 'waitlist') {
        submissionData.target_resource_id = null;
        submissionData.requested_item_type = formData.waitlist_item;
        submissionData.requested_blood_group = null;
        submissionData.notes = `[WAITLIST FOR: ${submissionData.waitlist_item}] ` + submissionData.notes;
      } else {
        const selectedItem = currentSelectionList.find(i => String(i.id) === String(formData.target_resource_id));
        if (selectedItem) {
          submissionData.requested_item_type = selectedItem.type || (formData.resource_type === 'blood' ? 'Blood Unit' : null);
          submissionData.requested_blood_group = selectedItem.blood_group || selectedItem.model || null;
        }
      }

      await api.post('/requests', submissionData);
      
      if (formData.target_resource_id === 'waitlist') {
         toast.success('Added to Waitlist! You will be notified when this becomes available.');
      } else {
         toast.success('Request sent successfully! The donor hospital has been notified.');
      }
      navigate('/dashboard');
    } catch (err) {
      toast.error('Failed to send request. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const currentSelectionList = 
    formData.resource_type === 'organ' ? availableResources.organs :
    formData.resource_type === 'equipment' ? availableResources.equipment :
    availableResources.blood;

  return (
    <div className="max-w-3xl mx-auto py-10 space-y-8">
      <button 
        onClick={() => navigate(-1)}
        className="flex items-center gap-2 text-slate-500 hover:text-primary-600 transition-colors font-medium mb-4"
      >
        <ArrowLeft className="w-5 h-5" /> Back to Dashboard
      </button>

      <motion.div 
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        className="card shadow-xl overflow-hidden"
      >
        <div className="bg-gradient-to-r from-primary-600 to-primary-800 p-8 text-white">
          <h1 className="text-3xl font-bold flex items-center gap-3">
            <Send className="w-8 h-8" />
            Request Essential Resource
          </h1>
          <p className="text-primary-100 mt-2">Specify the organ or equipment you need urgently.</p>
        </div>

        <form onSubmit={handleSubmit} className="p-8 space-y-8">
          {/* Step 1: Resource Type */}
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-slate-400 uppercase tracking-widest">1. Select Category</h3>
            <div className="grid grid-cols-3 gap-4">
              <button 
                type="button"
                onClick={() => setFormData({ ...formData, resource_type: 'organ', target_resource_id: '' })}
                className={`p-4 rounded-2xl border-2 flex flex-col items-center gap-2 transition-all ${
                  formData.resource_type === 'organ' 
                    ? 'border-red-500 bg-red-50 text-red-700' 
                    : 'border-slate-100 bg-slate-50 text-slate-600'
                }`}
              >
                <Heart className={`w-6 h-6 ${formData.resource_type === 'organ' ? 'fill-current' : ''}`} />
                <span className="font-bold text-xs">Human Organ</span>
              </button>
              <button 
                type="button"
                onClick={() => setFormData({ ...formData, resource_type: 'blood', target_resource_id: '' })}
                className={`p-4 rounded-2xl border-2 flex flex-col items-center gap-2 transition-all ${
                  formData.resource_type === 'blood' 
                    ? 'border-red-600 bg-red-100/50 text-red-800' 
                    : 'border-slate-100 bg-slate-50 text-slate-600'
                }`}
              >
                <Droplets className={`w-6 h-6 ${formData.resource_type === 'blood' ? 'fill-current' : ''}`} />
                <span className="font-bold text-xs">Blood Units</span>
              </button>
              <button 
                type="button"
                onClick={() => setFormData({ ...formData, resource_type: 'equipment', target_resource_id: '' })}
                className={`p-4 rounded-2xl border-2 flex flex-col items-center gap-2 transition-all ${
                  formData.resource_type === 'equipment' 
                    ? 'border-blue-500 bg-blue-50 text-blue-700' 
                    : 'border-slate-100 bg-slate-50 text-slate-600'
                }`}
              >
                <Package className="w-6 h-6" />
                <span className="font-bold text-xs">Equipment</span>
              </button>
            </div>
          </div>

          {/* Step 2: Specific Selection */}
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-slate-400 uppercase tracking-widest">2. Choose Items</h3>
            <div className="space-y-3 max-h-60 overflow-y-auto pr-2 custom-scrollbar">
              {currentSelectionList.length === 0 ? (
                <div className="p-10 text-center bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                  <p className="text-slate-400">No {formData.resource_type}s currently available in the network.</p>
                </div>
              ) : currentSelectionList.map(item => (
                <label 
                  key={item.id} 
                  className={`flex items-center justify-between p-4 rounded-xl border-2 cursor-pointer transition-all ${
                    formData.target_resource_id == item.id 
                      ? 'border-primary-500 bg-primary-50' 
                      : 'border-slate-100 hover:border-slate-200'
                  }`}
                >
                  <div className="flex items-center gap-4">
                    <input 
                      type="radio" 
                      name="target_resource_id" 
                      value={item.id} 
                      onChange={handleChange}
                      checked={formData.target_resource_id == item.id}
                      className="w-5 h-5 text-primary-600 accent-primary-600"
                    />
                    <div>
                      <p className="font-bold text-slate-900">{item.type} {item.blood_group ? `(${item.blood_group})` : ''}</p>
                      <p className="text-xs text-slate-500 flex items-center gap-1"><MapPin className="w-3 h-3" /> {item.hospital_name}, {item.city}</p>
                    </div>
                  </div>
                  {formData.target_resource_id == item.id && <CheckCircle2 className="w-6 h-6 text-primary-600" />}
                </label>
              ))}

              {/* Waitlist Option */}
              <label className={`flex items-center justify-between p-4 rounded-xl border-2 cursor-pointer transition-all ${
                formData.target_resource_id === 'waitlist'
                  ? 'border-orange-500 bg-orange-50'
                  : 'border-slate-100 hover:border-slate-200'
              }`}>
                <div className="flex flex-col gap-2 w-full">
                  <div className="flex items-center gap-4">
                    <input 
                      type="radio" 
                      name="target_resource_id" 
                      value="waitlist" 
                      onChange={handleChange}
                      checked={formData.target_resource_id === 'waitlist'}
                      className="w-5 h-5 text-orange-600 accent-orange-600"
                    />
                    <div>
                      <p className="font-bold text-slate-900 border-b border-orange-200 pb-1 inline-block">Not available? Join Waitlist</p>
                      <p className="text-xs text-slate-600 mt-1">Get an alert when a matching {formData.resource_type} enters the network.</p>
                    </div>
                  </div>
                  {formData.target_resource_id === 'waitlist' && (
                    <input 
                      type="text"
                      name="waitlist_item"
                      placeholder={`Enter specific ${formData.resource_type} (e.g. O- Liver)`}
                      value={formData.waitlist_item || ''}
                      onChange={handleChange}
                      className="mt-2 text-sm p-3 border border-orange-300 rounded-lg outline-none focus:ring-2 focus:ring-orange-500 w-[calc(100%-2.5rem)] ml-10 transition-shadow bg-white"
                      required
                    />
                  )}
                </div>
              </label>
            </div>
          </div>

          {/* Step 3: Details */}
          <div className="grid md:grid-cols-2 gap-8">
            <div className="space-y-4">
              <h3 className="text-sm font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" /> Urgency Level
              </h3>
              <div className="space-y-2">
                {['low', 'medium', 'high', 'critical'].map(lvl => (
                  <label key={lvl} className="flex items-center gap-3 cursor-pointer group">
                    <input 
                      type="radio" 
                      name="urgency" 
                      value={lvl} 
                      onChange={handleChange}
                      checked={formData.urgency === lvl}
                      className="w-4 h-4 text-primary-600 accent-primary-600"
                    />
                    <span className={`capitalize font-medium ${formData.urgency === lvl ? 'text-primary-700' : 'text-slate-500'}`}>
                      {lvl} {lvl === 'critical' && '🚨'}
                    </span>
                  </label>
                ))}
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="text-sm font-bold text-slate-400 uppercase tracking-widest">Additional Notes</h3>
              <textarea 
                name="notes"
                onChange={handleChange}
                className="input-field h-32 py-3" 
                placeholder="Briefly explain the medical case or emergency..."
              ></textarea>
            </div>
          </div>

          <div className="bg-slate-50 p-6 rounded-2xl flex items-start gap-4">
            <Info className="w-6 h-6 text-primary-600 shrink-0" />
            <p className="text-sm text-slate-600 leading-relaxed">
              By submitting this request, you agree to follow the hospital sharing protocols. An instant notification will be sent to the donor hospital. 
              Only verified medical staff should manage this portal.
            </p>
          </div>

          <button 
            disabled={loading || !formData.target_resource_id}
            type="submit" 
            className="w-full btn-primary py-5 text-xl flex items-center justify-center gap-3 shadow-lg shadow-primary-200"
          >
            {loading ? <Loader2 className="w-6 h-6 animate-spin" /> : <><Send className="w-6 h-6" /> Send Request Now</>}
          </button>
        </form>
      </motion.div>
    </div>
  );
};

export default RequestResource;

