import React, { useState } from 'react';
import { NavLink } from 'react-router-dom';
import './NavigationBar.css';

// Define props interface
interface NavigationBarProps {
  isCollapsed: boolean;
  onToggle: (isCollapsed: boolean) => void;
}

const NavigationBar: React.FC<NavigationBarProps> = ({ isCollapsed, onToggle }) => {
  // Remove internal state, use props instead
  // const [isCollapsed, setIsCollapsed] = useState(false);

  const toggleSidebar = () => {
    onToggle(!isCollapsed); // Call the callback prop
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
        {/* Replace single Dashboard link with multiple campus links */}
        {/* <li className="sidebar-item">
          <NavLink to="/" className="sidebar-link">
            <span className="link-icon">🏠</span>
            <span className="link-text">Dashboard</span>
          </NavLink>
        </li> */}
        <li className="sidebar-item">
          <NavLink to="/dashboard/ucd" className="sidebar-link">
            <span className="link-icon">🏫</span> {/* Placeholder UCD icon */}
            <span className="link-text">UCD Dashboard</span>
          </NavLink>
        </li>
        <li className="sidebar-item">
          <NavLink to="/dashboard/dcu" className="sidebar-link">
            <span className="link-icon">🏛️</span> {/* Placeholder DCU icon */}
            <span className="link-text">DCU Dashboard</span>
          </NavLink>
        </li>
        <li className="sidebar-item">
          <NavLink to="/dashboard/atu" className="sidebar-link">
            <span className="link-icon">🎓</span> {/* Placeholder ATU icon */}
            <span className="link-text">ATU Dashboard</span>
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