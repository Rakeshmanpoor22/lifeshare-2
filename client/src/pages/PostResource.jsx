import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api';
import { 
  Heart, Package, PlusCircle, Loader2, ArrowLeft, 
  Info, CheckCircle2, FlaskConical, Activity, Droplets
} from 'lucide-react';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';

const PostResource = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [resourceType, setResourceType] = useState('organ');
  const [equipmentCatalog, setEquipmentCatalog] = useState([]);
  const [organCatalog, setOrganCatalog] = useState([]);
  const [formData, setFormData] = useState({
    type: '',
    blood_group: 'A+',
    model: '',
    units: 1,
    condition: 'good'
  });

  React.useEffect(() => {
    const fetchCatalogs = async () => {
      try {
        const [eqRes, orgRes] = await Promise.all([
          api.get('/resources/equipment/catalog'),
          api.get('/resources/organs/catalog')
        ]);
        setEquipmentCatalog(eqRes.data);
        setOrganCatalog(orgRes.data);
      } catch (err) {
        toast.error('Failed to load catalogs');
      }
    };
    fetchCatalogs();
  }, []);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.type) {
      return toast.error('Please specify the type of resource.');
    }

    setLoading(true);
    try {
      let endpoint = '/resources/organs';
      if (resourceType === 'equipment') endpoint = '/resources/equipment';
      if (resourceType === 'blood') endpoint = '/resources/blood';
      
      await api.post(endpoint, formData);
      toast.success(`${resourceType.toUpperCase()} listed successfully!`);
      navigate('/dashboard');
    } catch (err) {
      toast.error('Failed to list resource. Please try again.');
    } finally {
      setLoading(false);
    }
  };

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
        <div className="bg-gradient-to-r from-emerald-600 to-emerald-800 p-8 text-white">
          <h1 className="text-3xl font-bold flex items-center gap-3">
            <PlusCircle className="w-8 h-8" />
            List New Resource
          </h1>
          <p className="text-emerald-100 mt-2">Share critical resources with the hospital network.</p>
        </div>

        <form onSubmit={handleSubmit} className="p-8 space-y-8">
          {/* Resource Type Selection */}
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-slate-400 uppercase tracking-widest">1. Resource Category</h3>
            <div className="grid grid-cols-3 gap-4">
              <button 
                type="button"
                onClick={() => setResourceType('organ')}
                className={`p-4 rounded-2xl border-2 flex flex-col items-center gap-2 transition-all ${
                  resourceType === 'organ' 
                    ? 'border-red-500 bg-red-50 text-red-700' 
                    : 'border-slate-100 bg-slate-50 text-slate-600'
                }`}
              >
                <Heart className={`w-6 h-6 ${resourceType === 'organ' ? 'fill-current' : ''}`} />
                <span className="font-bold text-xs">Human Organ</span>
              </button>
              <button 
                type="button"
                onClick={() => setResourceType('blood')}
                className={`p-4 rounded-2xl border-2 flex flex-col items-center gap-2 transition-all ${
                  resourceType === 'blood' 
                    ? 'border-red-600 bg-red-100/50 text-red-800' 
                    : 'border-slate-100 bg-slate-50 text-slate-600'
                }`}
              >
                <Droplets className={`w-6 h-6 ${resourceType === 'blood' ? 'fill-current' : ''}`} />
                <span className="font-bold text-xs">Blood Units</span>
              </button>
              <button 
                type="button"
                onClick={() => setResourceType('equipment')}
                className={`p-4 rounded-2xl border-2 flex flex-col items-center gap-2 transition-all ${
                  resourceType === 'equipment' 
                    ? 'border-blue-500 bg-blue-50 text-blue-700' 
                    : 'border-slate-100 bg-slate-50 text-slate-600'
                }`}
              >
                <Package className="w-6 h-6" />
                <span className="font-bold text-xs">Equipment</span>
              </button>
            </div>
          </div>

          {/* Form Fields */}
          <div className="space-y-6">
            <h3 className="text-sm font-bold text-slate-400 uppercase tracking-widest">2. Resource Details</h3>
            <div className="grid md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-700">
                  {resourceType === 'organ' ? 'Organ Type' : (resourceType === 'blood' ? 'Registration Note' : 'Equipment Type')}
                </label>
                <div className="relative">
                  <Activity className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  {resourceType === 'equipment' ? (
                    <select 
                      required 
                      name="type" 
                      value={formData.type}
                      onChange={handleChange} 
                      className="input-field pl-10 bg-white"
                    >
                      <option value="" disabled>Select Equipment Type</option>
                      {Array.from(new Set(equipmentCatalog.map(c => c.category))).map(cat => (
                        <optgroup key={cat} label={cat}>
                          {equipmentCatalog.filter(c => c.category === cat).map(c => (
                            <option key={c.type} value={c.type}>{c.type}</option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                  ) : resourceType === 'organ' ? (
                    <select 
                      required 
                      name="type" 
                      value={formData.type}
                      onChange={handleChange} 
                      className="input-field pl-10 bg-white"
                    >
                      <option value="" disabled>Select Organ Type</option>
                      {Array.from(new Set(organCatalog.map(c => c.category))).map(cat => (
                        <optgroup key={cat} label={cat}>
                          {organCatalog.filter(c => c.category === cat).map(c => (
                            <option key={c.type} value={c.type}>{c.type}</option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                  ) : (
                    <input 
                      required={resourceType !== 'blood'} 
                      name="type" 
                      value={formData.type}
                      onChange={handleChange} 
                      className="input-field pl-10" 
                      placeholder={resourceType === 'blood' ? 'Optional description' : 'e.g., Kidney'} 
                    />
                  )}
                </div>
              </div>

              {(resourceType === 'organ' || resourceType === 'blood') ? (
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-slate-700">Blood Group</label>
                  <select 
                    name="blood_group" 
                    value={formData.blood_group}
                    onChange={handleChange} 
                    className="input-field bg-white"
                  >
                    {['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map(bg => (
                      <option key={bg} value={bg}>{bg}</option>
                    ))}
                  </select>
                </div>
              ) : (
                <>
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-slate-700">Model/Serial No.</label>
                    <input 
                      name="model" 
                      value={formData.model}
                      onChange={handleChange} 
                      className="input-field" 
                      placeholder="e.g., V-2000, Philips G3" 
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-slate-700">Condition</label>
                    <select 
                      name="condition" 
                      value={formData.condition}
                      onChange={handleChange} 
                      className="input-field bg-white"
                    >
                      <option value="excellent">Excellent</option>
                      <option value="good">Good</option>
                      <option value="fair">Fair</option>
                    </select>
                  </div>
                </>
              )}

              {resourceType === 'blood' && (
                <div className="space-y-2 md:col-span-2">
                  <label className="text-sm font-semibold text-slate-700">Units Available</label>
                  <input 
                    type="number"
                    name="units" 
                    value={formData.units}
                    onChange={handleChange} 
                    className="input-field" 
                    min="1"
                  />
                </div>
              )}
            </div>
          </div>

          <div className="bg-slate-50 p-6 rounded-2xl flex items-start gap-4">
            <Info className="w-6 h-6 text-emerald-600 shrink-0" />
            <p className="text-sm text-slate-600 leading-relaxed">
              By listing this resource, you confirm it is available for sharing. Other hospitals in the network will see this and can request a match. Immediate notification will be logged in the audit trail.
            </p>
          </div>

          <button 
            disabled={loading || !formData.type}
            type="submit" 
            className="w-full btn-primary py-5 text-xl flex items-center justify-center gap-3 shadow-lg shadow-emerald-200 !bg-emerald-600 hover:!bg-emerald-700"
          >
            {loading ? <Loader2 className="w-6 h-6 animate-spin" /> : <><CheckCircle2 className="w-6 h-6" /> List Resource Now</>}
          </button>
        </form>
      </motion.div>
    </div>
  );
};

export default PostResource;
