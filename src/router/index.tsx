import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import ProtectedRoute from '../components/ProtectedRoute';
import Layout from '../components/Layout';
import Login from '../pages/Login';
import Home from '../pages/Home';
import DataManagement from '../pages/DataManagement';
import PCAAnalysis from '../pages/PCAAnalysis';
import ICAAnalysis from '../pages/ICAAnalysis';
import AEAnalysis from '../pages/AEAnalysis';
import DLAnalysis from '../pages/DLAnalysis';
import SPCAnalysis from '../pages/SPCAnalysis';
import UserManagement from '../pages/UserManagement';
import Results from '../pages/Results';

const AppRouter: React.FC = () => {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/*"
        element={
          <ProtectedRoute>
            <Layout>
              <Routes>
                <Route path="/" element={<Navigate to="/home" replace />} />
                <Route path="/home" element={<Home />} />
                <Route path="/data" element={<DataManagement />} />
                <Route path="/analysis/pca" element={<PCAAnalysis />} />
                <Route path="/analysis/ica" element={<ICAAnalysis />} />
                <Route path="/analysis/ae" element={<AEAnalysis />} />
                <Route path="/analysis/dl" element={<DLAnalysis />} />
                <Route path="/analysis/spc" element={<SPCAnalysis />} />
                <Route path="/results" element={<Results />} />
                <Route path="/users" element={<UserManagement />} />
              </Routes>
            </Layout>
          </ProtectedRoute>
        }
      />
    </Routes>
  );
};

export default AppRouter;