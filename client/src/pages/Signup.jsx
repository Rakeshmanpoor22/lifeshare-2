import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ShieldCheck, ArrowRight, Loader2, Mail, Lock, Building, MapPin, Phone, User, Hash } from 'lucide-react';
import toast from 'react-hot-toast';
import { motion } from 'framer-motion';

const Signup = () => {
  const { signup } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    registration_id: '',
    email: '',
    contact_number: '',
    address: '',
    city: '',
    state: '',
    country: 'India',
    organisation_size: 'Medium',
    owner_name: '',
    license_number: '',
    password: '',
    confirmPassword: ''
  });

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (formData.password !== formData.confirmPassword) {
      return toast.error('Passwords do not match');
    }

    setLoading(true);
    const result = await signup(formData);
    setLoading(false);

    if (result.success) {
      toast.success('Registration successful! Please login.');
      navigate('/login');
    } else {
      toast.error(result.error);
    }
  };

  return (
    <div className="max-w-4xl mx-auto py-12">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="card shadow-2xl overflow-hidden grid md:grid-cols-5"
      >
        {/* Left Side - Info */}
        <div className="md:col-span-2 bg-gradient-to-br from-primary-700 to-primary-900 p-10 text-white flex flex-col justify-between">
          <div>
            <ShieldCheck className="w-12 h-12 mb-6 text-primary-200" />
            <h2 className="text-3xl font-bold mb-4">Hospital Registration</h2>
            <p className="text-primary-100 leading-relaxed">
              Join the LifeShare secure network. Verified hospitals can share critical resources instantly to save lives.
            </p>
          </div>
          
          <div className="space-y-6">
            <div className="flex items-start gap-4">
              <div className="p-2 bg-white/10 rounded-lg">
                <Building className="w-5 h-5" />
              </div>
              <div>
                <p className="font-semibold">Verify Identity</p>
                <p className="text-sm text-primary-200">Registration ID & License required.</p>
              </div>
            </div>
            <div className="flex items-start gap-4">
              <div className="p-2 bg-white/10 rounded-lg">
                <Hash className="w-5 h-5" />
              </div>
              <div>
                <p className="font-semibold">Secure Data</p>
                <p className="text-sm text-primary-200">Encrypted hospital credentials.</p>
              </div>
            </div>
          </div>
        </div>

        {/* Right Side - Form */}
        <div className="md:col-span-3 p-10 bg-white">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2 space-y-2">
                <label className="text-sm font-semibold text-slate-700">Hospital Name</label>
                <div className="relative">
                  <Building className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input required name="name" onChange={handleChange} className="input-field pl-10" placeholder="Yashoda Hospital — Somajiguda" />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-700">Registration ID (Unique)</label>
                <input required name="registration_id" onChange={handleChange} className="input-field" placeholder="HOSP-12345" />
              </div>
              
              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-700">License Number</label>
                <input name="license_number" onChange={handleChange} className="input-field" placeholder="LIC-98765" />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-700">Contact Email</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input required type="email" name="email" onChange={handleChange} className="input-field pl-10" placeholder="admin@hospital.com" />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-700">Phone Number</label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input required name="contact_number" onChange={handleChange} className="input-field pl-10" placeholder="+91 9876543210" />
                </div>
              </div>

              <div className="col-span-2 space-y-2">
                <label className="text-sm font-semibold text-slate-700">Full Address</label>
                <div className="relative">
                  <MapPin className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
                  <textarea required name="address" onChange={handleChange} className="input-field pl-10 py-2.5 h-20" placeholder="123 Hospital Lane..."></textarea>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-700">City</label>
                <input required name="city" onChange={handleChange} className="input-field" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-700">State</label>
                <input required name="state" onChange={handleChange} className="input-field" />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-700">Owner/Head Name</label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input required name="owner_name" onChange={handleChange} className="input-field pl-10" placeholder="Dr. John Doe" />
                </div>
              </div>

              <div className="space-y-2">
                <select name="organisation_size" onChange={handleChange} className="input-field bg-white">
                  <option>Small ( &lt; 50 beds )</option>
                  <option>Medium ( 50-200 beds )</option>
                  <option>Large ( &gt; 200 beds )</option>
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-700">Password</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input required type="password" name="password" onChange={handleChange} className="input-field pl-10" placeholder="••••••••" />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-700">Confirm</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input required type="password" name="confirmPassword" onChange={handleChange} className="input-field pl-10" placeholder="••••••••" />
                </div>
              </div>
            </div>

            <button disabled={loading} type="submit" className="w-full btn-primary py-4 text-lg flex items-center justify-center gap-2">
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Complete Registration'}
              {!loading && <ArrowRight className="w-5 h-5" />}
            </button>
            <p className="text-center text-sm text-slate-500">
              Already registered? <Link to="/login" className="text-primary-600 font-semibold hover:underline">Log In</Link>
            </p>
          </form>
        </div>
      </motion.div>
    </div>
  );
};

export default Signup;
