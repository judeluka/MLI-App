import { /*useState, useEffect*/ } from 'react';
import { Routes, Route, useLocation, Navigate } from 'react-router-dom'
import DashboardPage from './pages/Dashboard.tsx'
import ActivityManagementPage from './pages/ActivityManagementPage'
import './App.css'
import TopNavbar from './components/TopNavbar'
import GroupManagementPage from './pages/GroupManagementPage.tsx'
import GroupSchedulePage from './pages/GroupSchedulePage.tsx'
import MapTimelinePage from './pages/MapTimelinePage.tsx'


function App() {
  const location = useLocation();
  
  // Determine if the current path starts with /dashboard/
  const isDashboardRoute = location.pathname.startsWith('/dashboard/');
  // This variable might still be useful for dashboard-specific root styling
  const appClasses = isDashboardRoute ? "App dashboard-view" : "App";

  // Define Navbar height
  const topNavbarHeight = '50px';

  // Adjust content wrapper to add padding-top equal to navbar height
  const contentWrapperStyle: React.CSSProperties = {
      paddingTop: topNavbarHeight, // Add padding to prevent content overlap
      height: `calc(100vh - ${topNavbarHeight})`, // Adjust height if needed, or manage via CSS
      overflowY: 'auto', // Allow scrolling within the content area if needed
  };

  return (
    <div className={appClasses}>
      <TopNavbar />
      <div style={contentWrapperStyle} className="main-content-container">
        <Routes>
          {/* Redirect root to UCD dashboard */}
          <Route path="/" element={<Navigate to="/dashboard/ucd" replace />} />
          {/* Define parameterized route for dashboards */}
          <Route path="/dashboard/:campusId" element={<DashboardPage />} />
          
          {/* Other existing routes */}
          <Route path="/group-management" element={<GroupManagementPage />} />
          <Route path="/activity-management" element={<ActivityManagementPage />} />
          <Route path="/group/:groupId/schedule" element={<GroupSchedulePage />} />
          <Route path="/map-timeline" element={<MapTimelinePage />} />
          
          {/* Optional: Add a fallback route for unknown paths */}
          {/* <Route path="*" element={<div>Page Not Found</div>} /> */}
        </Routes>
      </div>
    </div>
  )
}

export default App
