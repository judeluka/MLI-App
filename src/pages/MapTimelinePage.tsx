// --- Map Component Implementation ---
interface IrelandMapProps { /* ... */ }

const IrelandMap: React.FC<IrelandMapProps> = ({ activities }) => {
    const initialCenter: LatLngExpression = [53.4, -7.8]; // Central Ireland
    const initialZoom = 7;

    return (
        // Use height: 100% to fill parent
        <MapContainer center={initialCenter} zoom={initialZoom} style={{ height: '100%', width: '100%' }} scrollWheelZoom={true}>
            <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            
            {/* Markers for Campuses */} {/* ... */}
            {/* Markers for Activities */} {/* ... */}
        </MapContainer>
    );
};
// --- End Map Component ---

// Placeholder Timeline Component
const TimelineComponentPlaceholder: React.FC = () => { /* ... */ return <div>Timeline Placeholder</div>; }; // Return explicit JSX

// --- Main Page Component (Restored) ---
const MapTimelinePage: React.FC = () => {
    // ... state ...
    // ... date utils ...
    // ... useEffect ...

    // Restore content determination logic
    let content;
    if (isLoading) { /* ... */ }
    else if (error) { /* ... */ }
    else if (groups.length === 0) { /* ... */ }
    else {
        content = (
            // Use flexbox to manage layout
            <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                {/* Map container takes most space */}
                <div style={{ flex: '1 1 auto', minHeight: '300px' }}> {/* Allow shrinking but prefer growing */} 
                    <IrelandMap activities={activities} /> 
                </div>
                {/* Timeline container */}
                <div style={{ flex: '0 0 auto', height: '200px', overflowY: 'auto', borderTop: '1px solid #ccc' }}> {/* Fixed height for now */} 
                     <TimelineComponentPlaceholder />
                </div>
            </div>
        );
    }

    // Adjust main page container style for flex
    const navbarHeight = '50px'; 
    const pageContainerStyle: React.CSSProperties = {
         paddingTop: navbarHeight, 
         height: '100vh', // Full viewport height
         display: 'flex',
         flexDirection: 'column',
         boxSizing: 'border-box'
     };
    const contentAreaStyle: React.CSSProperties = {
        flex: '1 1 auto', // Allow content area to grow and shrink
        overflow: 'hidden', // Prevent body scroll, handle scrolling inside if needed
        padding: '0 20px 20px 20px' // Keep horizontal/bottom padding
    };

    return (
        <div style={pageContainerStyle}>
            {/* Keep H1 outside the scrollable/flex content area? Or inside? Inside for now. */}
            <div style={contentAreaStyle}>
                <h1 style={{ flex: '0 0 auto' }}>Group Map & Timeline</h1>
                {content}
            </div>
        </div>
    );
};
// --- End Main Page Component ---

export default MapTimelinePage;