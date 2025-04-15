import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import './NavigationBar.css';

const NavigationBar: React.FC = () => {
  const [isCollapsed, setIsCollapsed] = useState(false);

  const toggleSidebar = () => {
    setIsCollapsed(!isCollapsed);
  };

  return (
    <nav className={`sidebar ${isCollapsed ? 'collapsed' : ''}`}>
      <div className="sidebar-header">
        <button onClick={toggleSidebar} className="toggle-btn">
          {isCollapsed ? '☰' : '✕'} {/* Basic icons for toggle */}
        </button>
        {/* Optionally add a logo or title here */} 
      </div>
      <ul className="sidebar-list">
        <li className="sidebar-item">
          <NavLink to="/" className="sidebar-link">
            <span className="link-icon">🏠</span> {/* Placeholder icon */}
            <span className="link-text">Dashboard</span>
          </NavLink>
        </li>
        <li className="sidebar-item">
          <NavLink to="/group-management" className="sidebar-link">
            <span className="link-icon">👥</span> {/* Placeholder icon */}
            <span className="link-text">Group Management</span>
          </NavLink>
        </li>
        <li className="sidebar-item">
          <NavLink to="/activities" className="sidebar-link">
            <span className="link-icon">🎉</span> {/* Placeholder icon */}
            <span className="link-text">Activities</span>
          </NavLink>
        </li>
      </ul>
    </nav>
  );
};

export default NavigationBar; 