import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { LogIn, Mail, Lock, Loader2, ArrowRight } from 'lucide-react';
import toast from 'react-hot-toast';
import { motion } from 'framer-motion';

const Login = () => {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    const result = await login(email, password);
    setLoading(false);

    if (result.success) {
      toast.success('Welcome back!');
      navigate('/dashboard');
    } else {
      toast.error(result.error);
    }
  };

  return (
    <div className="max-w-md mx-auto py-20">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="card p-10 shadow-2xl space-y-8"
      >
        <div className="text-center space-y-2">
          <div className="inline-flex p-3 bg-primary-100 rounded-2xl text-primary-600 mb-2">
            <LogIn className="w-8 h-8" />
          </div>
          <h1 className="text-3xl font-bold text-slate-900">Hospital Login</h1>
          <p className="text-slate-500">Secure access for verified medical centers</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <label className="text-sm font-semibold text-slate-700">Hospital Email</label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
              <input 
                required 
                type="email" 
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input-field pl-11" 
                placeholder="yashoda@lifeshare.demo" 
              />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <label className="text-sm font-semibold text-slate-700">Password</label>
              <Link to="#" className="text-xs text-primary-600 hover:underline">Forgot password?</Link>
            </div>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
              <input 
                required 
                type="password" 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input-field pl-11" 
                placeholder="••••••••" 
              />
            </div>
          </div>

          <button 
            disabled={loading}
            type="submit" 
            className="w-full btn-primary py-4 text-lg flex items-center justify-center gap-2 group"
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Enter LifeShare'}
            {!loading && <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />}
          </button>
        </form>

        <div className="text-center pt-4 border-t border-slate-100">
          <p className="text-sm text-slate-500">
            Internal tool for registered hospitals only. <br />
            <Link to="/signup" className="text-primary-600 font-bold hover:underline">Register New Center</Link>
          </p>
        </div>
      </motion.div>
    </div>
  );
};

export default Login;

