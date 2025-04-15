import { Routes, Route } from 'react-router-dom'
import DashboardPage from './pages/Dashboard.tsx'
import ActivityManagementPage from './pages/ActivityManagementPage'
import './App.css'
import Navbar from './components/NavigationBar'
import GroupManagementPage from './pages/GroupManagementPage.tsx'
import GroupSchedulePage from './pages/GroupSchedulePage.tsx'


function App() {
  return (
    <div className="App">
      <Navbar />
      <Routes>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/group-management" element={<GroupManagementPage />} />
        <Route path="/activities" element={<ActivityManagementPage />} />
        <Route path="/group/:groupId/schedule" element={<GroupSchedulePage />} />
      </Routes>
    </div>
  )
}

export default App
