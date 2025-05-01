import React from 'react';
import { Link, NavLink } from 'react-router-dom'; // Assuming NavLink for active styling

const TopNavbar: React.FC = () => {
    const navbarStyle: React.CSSProperties = {
        position: 'fixed', // Make navbar fixed
        top: 0,
        left: 0,
        width: '100%',
        height: '50px', // Define height
        backgroundColor: '#343a40', // Dark background
        padding: '0 20px',
        display: 'flex',
        alignItems: 'center',
        zIndex: 1000, // Ensure it's above other content
        boxSizing: 'border-box',
    };

    const navLinkStyle = ({ isActive }: { isActive: boolean }): React.CSSProperties => ({
        color: isActive ? '#ffffff' : '#adb5bd', // White when active, gray otherwise
        textDecoration: 'none',
        padding: '10px 15px',
        margin: '0 5px',
        fontWeight: isActive ? 'bold' : 'normal',
        borderBottom: isActive ? '3px solid #0d6efd' : 'none', // Highlight active link
    });

    const brandStyle: React.CSSProperties = {
        color: '#ffffff',
        fontSize: '1.4em',
        textDecoration: 'none',
        marginRight: 'auto', // Push other links to the right
    };

    return (
        <nav style={navbarStyle}>
            <Link to="/" style={brandStyle}>MLI App</Link>
            <div> {/* Container for right-aligned links */}
                <NavLink to="/group-management" style={navLinkStyle}>Groups</NavLink>
                <NavLink to="/dashboard" style={navLinkStyle}>Schedule</NavLink> 
                <NavLink to="/activity-management" style={navLinkStyle}>Activities</NavLink>
                {/* --- ADDED Link to Map/Timeline Page --- */}
                <NavLink to="/map-timeline" style={navLinkStyle}>Map & Timeline</NavLink>
            </div>
        </nav>
    );
};

export default TopNavbar; 