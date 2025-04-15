import { useState } from 'react';
import { Routes, Route, useLocation, Navigate } from 'react-router-dom'
import DashboardPage from './pages/Dashboard.tsx'
import ActivityManagementPage from './pages/ActivityManagementPage'
import './App.css'
import Navbar from './components/NavigationBar'
import GroupManagementPage from './pages/GroupManagementPage.tsx'
import GroupSchedulePage from './pages/GroupSchedulePage.tsx'


function App() {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const location = useLocation();
  
  // Determine if the current path starts with /dashboard/
  const isDashboardRoute = location.pathname.startsWith('/dashboard/');
  // Determine if any navbar should be shown (not on dashboard routes)
  const showNavbar = !isDashboardRoute;
  // Special class for dashboard routes to potentially override root styles if needed
  const appClasses = isDashboardRoute ? "App dashboard-view" : "App"; 
  // Class for the main content wrapper
  const contentWrapperClass = showNavbar 
      ? `main-content-area ${isSidebarCollapsed ? 'collapsed' : 'expanded'}` 
      : 'full-page-content'; // Use full page when navbar is hidden

  return (
    <div className={appClasses}>
      {showNavbar && (
        <Navbar isCollapsed={isSidebarCollapsed} onToggle={setIsSidebarCollapsed} />
      )}
      <div className={contentWrapperClass}>
        <Routes>
          {/* Redirect root to UCD dashboard */}
          <Route path="/" element={<Navigate to="/dashboard/ucd" replace />} /> 
          {/* Define parameterized route for dashboards */}
          <Route path="/dashboard/:campusId" element={<DashboardPage />} />
          
          {/* Other existing routes */}
          <Route path="/group-management" element={<GroupManagementPage />} />
          <Route path="/activities" element={<ActivityManagementPage />} />
          <Route path="/group/:groupId/schedule" element={<GroupSchedulePage />} />
          
          {/* Optional: Add a fallback route for unknown paths */}
          {/* <Route path="*" element={<div>Page Not Found</div>} /> */}
        </Routes>
      </div>
    </div>
  )
}

export default App
