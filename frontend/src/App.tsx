import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './store/authStore';

// Layouts
import { AuthLayout } from './components/layouts/AuthLayout';
import { DashboardLayout } from './components/layouts/DashboardLayout';

// Auth Pages
import { LoginPage } from './pages/auth/LoginPage';

// Dashboard Pages
import { RHDashboard } from './pages/dashboards/RHDashboard';
import { RHEmployeesPage } from './pages/rh/RHEmployeesPage';
import { QualityDashboard } from './pages/rh/QualityDashboard';
import { SuccessionPage } from './pages/rh/SuccessionPage';
import { ComparisonPage } from './pages/rh/ComparisonPage';
import { RHValidationsPage } from './pages/rh/RHValidationsPage';
import { EmployeeFeedbackPage } from './pages/rh/EmployeeFeedbackPage';
import { DirectorDashboard } from './pages/dashboards/DirectorDashboard';
import { SupervisorDashboard } from './pages/dashboards/SupervisorDashboard';
import { EmployeeDashboard } from './pages/dashboards/EmployeeDashboard';

// Other Pages
import { ProfilePage } from './pages/profile/ProfilePage';
import TeamTreePage from './pages/team/TeamTreePage';
import { TeamSelectionPage } from './pages/evaluations/TeamSelectionPage';

import { FicheCadresMaitrises } from './pages/evaluations/FicheCadresMaitrises';
import { FicheExecutions } from './pages/evaluations/FicheExecutions';
import { FeedbackFormPage } from './pages/feedback/FeedbackFormPage';
import { MyFeedbacksPage } from './pages/feedback/MyFeedbacksPage';
import { HistoryPage } from './pages/history/HistoryPage';
import { SettingsPage } from './pages/settings/SettingsPage';
import { ReportsPage } from './pages/reports/ReportsPage';
import { SuperAdminDashboard } from './pages/admin/SuperAdminDashboard';
import { OrgChartPage } from './pages/orgchart/OrgChartPage';
import { FichesPostePage } from './pages/rh/FichesPostePage';
import { FichePosteFormPage } from './pages/rh/FichePosteFormPage';
import { FichePostePrintPage } from './pages/rh/FichePostePrintPage';
import { FichesPosteEquipePage } from './pages/rh/FichesPosteEquipePage';

// Route the user to the correct dashboard based on their role
const RoleBasedRedirect: React.FC = () => {
  const { user } = useAuthStore();
  if (!user) return <Navigate to="/login" replace />;

  switch (user.role) {
    case 'SuperAdmin':  return <Navigate to="/admin" replace />;
    case 'RH':          return <Navigate to="/dashboard/rh" replace />;
    case 'Directeur':
    case 'Manager':     return <Navigate to="/dashboard/director" replace />;
    case 'Superviseur': return <Navigate to="/dashboard/supervisor" replace />;
    case 'Responsable':
    case 'Gestionnaire':
    case 'Employe':
    default:            return <Navigate to="/dashboard/employee" replace />;
  }
};

function App() {
  const { isAuthenticated, user } = useAuthStore();

  return (
    <Router future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Routes>
        {/* Auth */}
        <Route element={<AuthLayout />}>
          <Route path="/login" element={
            isAuthenticated ? <Navigate to="/dashboard" replace /> : <LoginPage />
          } />
        </Route>

        {/* Dashboard */}
        <Route path="/dashboard" element={<DashboardLayout />}>
          <Route index element={<RoleBasedRedirect />} />
          
          {/* Dashboards */}
          <Route path="director" element={<DirectorDashboard />} />
          <Route path="rh"           element={<RHDashboard />} />
          <Route path="rh/employees" element={<RHEmployeesPage />} />
          <Route path="rh/qualite"      element={<QualityDashboard />} />
          <Route path="rh/succession"  element={<SuccessionPage />} />
          <Route path="rh/comparison" element={<ComparisonPage />} />
          <Route path="rh/validations" element={<RHValidationsPage />} />
          <Route path="rh/delegations" element={<TeamTreePage />} />
          <Route path="rh/retour-employe" element={<EmployeeFeedbackPage />} />
          <Route path="supervisor" element={<SupervisorDashboard />} />
          <Route path="employee"   element={<EmployeeDashboard />} />
          
          {/* Shared Pages */}
          <Route path="profile"    element={<ProfilePage />} />
          <Route path="team"       element={<Navigate to="/dashboard/team-tree" replace />} />
          <Route path="team-tree"  element={<TeamTreePage />} />
          <Route path="evaluations/executions" element={<TeamSelectionPage formId="form_executions" />} />
          <Route path="evaluations/executions/form/:userId" element={<FicheExecutions />} />
          <Route path="evaluations/cadres" element={<TeamSelectionPage formId="form_cadres" />} />
          <Route path="evaluations/cadres/form/:userId" element={<FicheCadresMaitrises />} />
          <Route path="feedback/:requestId" element={<FeedbackFormPage />} />
          <Route path="my-feedbacks" element={<MyFeedbacksPage />} />
          <Route path="rh/fiches-poste" element={<FichesPostePage />} />
          <Route path="rh/fiches-poste/new" element={<FichePosteFormPage />} />
          <Route path="rh/fiches-poste/:id/edit" element={<FichePosteFormPage />} />
          <Route path="rh/fiches-poste/:id/print" element={<FichePostePrintPage />} />
          <Route path="fiches-poste-equipe" element={<FichesPosteEquipePage />} />
          <Route path="history"    element={<HistoryPage />} />
          <Route path="settings"   element={<SettingsPage />} />
          <Route path="reports"    element={<ReportsPage />} />
          <Route path="orgchart"   element={<OrgChartPage />} />
        </Route>

        {/* Super Admin — standalone, no DashboardLayout */}
        <Route path="/admin" element={
          isAuthenticated && user?.role === 'SuperAdmin'
            ? <SuperAdminDashboard />
            : isAuthenticated
              ? <Navigate to="/dashboard" replace />
              : <Navigate to="/login" replace />
        } />

        {/* Fallbacks */}
        <Route path="/"  element={<Navigate to="/dashboard" replace />} />
        <Route path="*"  element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </Router>
  );
}

export default App;
