import React from 'react';
import { Link } from 'react-router-dom';

const Navbar: React.FC = () => {
    const navStyle: React.CSSProperties = {
        backgroundColor: '#333', // Dark background
        padding: '10px 20px',
        color: 'white',
        display: 'flex',
        alignItems: 'center',
        gap: '20px', // Space between title and links
    };

    const titleStyle: React.CSSProperties = {
        margin: 0,
        fontSize: '1.5em',
        fontWeight: 'bold',
        color: 'white',
        textDecoration: 'none', // Remove underline from link
    };

    const linkStyle: React.CSSProperties = {
        color: '#eee', // Lighter text for links
        textDecoration: 'none',
        fontSize: '1em',
        padding: '5px 10px',
        borderRadius: '4px',
        transition: 'background-color 0.3s ease',
    };
    
    // Basic hover effect (can be done via CSS classes for more complex styles)
    const handleMouseEnter = (e: React.MouseEvent<HTMLAnchorElement>) => {
      e.currentTarget.style.backgroundColor = '#555';
    };
    const handleMouseLeave = (e: React.MouseEvent<HTMLAnchorElement>) => {
       e.currentTarget.style.backgroundColor = 'transparent';
    };


    return (
        <nav style={navStyle}>
            <Link to="/group-management" style={titleStyle}>MLI App</Link>
            <div> {/* Container for navigation links */}
                <Link 
                    to="/group-management" 
                    style={linkStyle}
                    onMouseEnter={handleMouseEnter}
                    onMouseLeave={handleMouseLeave}
                >
                    Group Management
                </Link>
                <Link 
                    to="/activity-management" 
                    style={linkStyle}
                    onMouseEnter={handleMouseEnter}
                    onMouseLeave={handleMouseLeave}
                >
                    Activity Management
                </Link>
                {/* Add other links here as needed */}
            </div>
        </nav>
    );
};

export default Navbar; 