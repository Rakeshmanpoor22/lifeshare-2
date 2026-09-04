import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { SocketProvider } from './context/SocketContext';
import Navbar from './components/Navbar';
import Home from './pages/Home';
import Login from './pages/Login';
import Signup from './pages/Signup';
import Dashboard from './pages/Dashboard';
import RequestResource from './pages/RequestResource';
import PostResource from './pages/PostResource';
import PolicyGuide from './pages/PolicyGuide';
import MatchDetails from './pages/MatchDetails';
import EquipmentDetails from './pages/EquipmentDetails';
import ActivityLog from './pages/ActivityLog';
import BloodBank from './pages/BloodBank';
import HospitalDirectory from './pages/HospitalDirectory';
import HospitalDetail from './pages/HospitalDetail';
import BloodBankDirectory from './pages/BloodBankDirectory';
import BloodBankDetail from './pages/BloodBankDetail';
import MapDirectory from './pages/MapDirectory';
import { Toaster } from 'react-hot-toast';

const ProtectedRoute = ({ children }) => {
  const { user, loading } = useAuth();
  if (loading) return <div>Loading...</div>;
  if (!user) return <Navigate to="/login" />;
  return children;
};

function App() {
  return (
    <Router>
      <AuthProvider>
        <SocketProvider>
          <div className="min-h-screen bg-slate-50">
            <Navbar />
            <main className="container mx-auto px-4 py-8">
              <Routes>
                <Route path="/" element={<Home />} />
                <Route path="/login" element={<Login />} />
                <Route path="/signup" element={<Signup />} />
                <Route path="/dashboard" element={
                  <ProtectedRoute>
                    <Dashboard />
                  </ProtectedRoute>
                } />
                <Route path="/request" element={
                  <ProtectedRoute>
                    <RequestResource />
                  </ProtectedRoute>
                } />
                <Route path="/post-resource" element={
                  <ProtectedRoute>
                    <PostResource />
                  </ProtectedRoute>
                } />
                <Route path="/match/:id" element={
                  <ProtectedRoute>
                    <MatchDetails />
                  </ProtectedRoute>
                } />
                <Route path="/equipment/:id" element={
                  <ProtectedRoute>
                    <EquipmentDetails />
                  </ProtectedRoute>
                } />
                <Route path="/activity" element={
                  <ProtectedRoute>
                    <ActivityLog />
                  </ProtectedRoute>
                } />
                <Route path="/blood-bank" element={
                  <ProtectedRoute>
                    <BloodBank />
                  </ProtectedRoute>
                } />
                {/* Public hospital directory routes — no auth required */}
                <Route path="/hospitals" element={<HospitalDirectory />} />
                <Route path="/hospitals/:id" element={<HospitalDetail />} />
                {/* Public blood bank directory routes — no auth required */}
                <Route path="/blood-banks" element={<BloodBankDirectory />} />
                <Route path="/blood-banks/:id" element={<BloodBankDetail />} />
                {/* Public map route */}
                <Route path="/map" element={<MapDirectory />} />
                <Route path="/policy" element={<PolicyGuide />} />
              </Routes>
            </main>
            <Toaster position="bottom-right" />
          </div>
        </SocketProvider>
      </AuthProvider>
    </Router>
  );
}

export default App;
