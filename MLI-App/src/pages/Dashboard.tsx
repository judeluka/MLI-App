import React, { useState, useEffect, useMemo } from 'react';
import { collection, getDocs, query, doc, getDoc, setDoc, Timestamp, where } from 'firebase/firestore';
import { db } from '../firebase';
import { useNavigate, Link, useParams } from 'react-router-dom';
// Assuming a date library like date-fns: import { format, addDays, subDays, eachDayOfInterval, min, max } from 'date-fns';

// Updated Group interface to match GroupDocument from GroupManagementPage and Firestore structure
interface Group {
    id: string;
    groupName: string;
    Client: string;
    studentCount: number;
    leaderCount: number;
    arrivalDate: Timestamp;
    departureDate: Timestamp;
    arrivalAirport?: string;
    departureAirport?: string;
    campusId?: string;
    arrivalFlightNumber?: string;
    departureFlightNumber?: string;
    needsArrivalTransfer?: boolean;
    notes?: string;
}

// Interface for the daily schedule data
interface ScheduleEntry {
    activityId?: string;
    secondaryInfo: string;
}

// Interface for Activity data (ensure this matches ActivityManagementPage)
interface Activity {
  id: string; // Ensure ID is not optional here, as we need it for referencing
  name: string;
  location?: string; 
  type: 'half-day' | 'full-day';
}

// Interface to hold fetched schedule data, keyed by date string
interface DailyScheduleData {
    [dateGroupIdKey: string]: ScheduleEntry;
}

// --- Toolbar Component ---
interface DashboardToolbarProps {
    sortByArrival: boolean;
    onSortToggle: () => void;
}

const DashboardToolbar: React.FC<DashboardToolbarProps> = ({ 
    sortByArrival, 
    onSortToggle, 
}) => {
    const navigate = useNavigate();

    const toolbarStyle: React.CSSProperties = {
        position: 'fixed', // Or 'sticky' if preferred
        top: 0,
        left: 0,
        width: '100%',
        backgroundColor: '#f8f9fa', // Light background
        padding: '10px 20px',
        boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
        zIndex: 100, // Ensure it's above the table
        display: 'flex',
        alignItems: 'center',
        gap: '15px',
        boxSizing: 'border-box',
        height: '60px', // Define a fixed height
    };

    const titleStyle: React.CSSProperties = { 
        margin: 0, 
        fontSize: '1.2em', 
        marginRight: 'auto'
    };

    const baseButtonStyle: React.CSSProperties = {
         padding: '8px 12px',
         cursor: 'pointer',
         backgroundColor: '#0d6efd',
         color: 'white',
         border: 'none',
         borderRadius: '4px'
    };

    const handleNavigateBack = () => {
        navigate('/group-management');
    };

    return (
        <div style={toolbarStyle}>
            <button
                onClick={handleNavigateBack}
                style={baseButtonStyle}
                title="Go to Group Management"
            >
                &lt; Back to Groups
            </button>
            <h2 style={titleStyle}>Daily Schedule</h2>
            <button
                 onClick={onSortToggle}
                 style={baseButtonStyle}
                 title={sortByArrival ? "Click to remove sorting by arrival date" : "Click to sort groups by arrival date (earliest first)"}
             >
                 {sortByArrival ? 'Clear Sorting' : 'Sort by Arrival Date'}
             </button>
        </div>
    );
};
// --- End Toolbar Component ---


const Dashboard: React.FC = () => {
    const { campusId } = useParams<{ campusId: string }>();
    
    const [groups, setGroups] = useState<Group[]>([]);
    const [dateRange, setDateRange] = useState<Date[]>([]);
    const [scheduleData, setScheduleData] = useState<DailyScheduleData>({});
    const [activities, setActivities] = useState<Activity[]>([]);
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);
    const [sortByArrival, setSortByArrival] = useState<boolean>(false);

    // TODO: Replace with actual date-fns functions or alternative
    const format = (date: Date, fmt: string) => date.toISOString().split('T')[0]; // Basic placeholder
    const addDays = (date: Date, amount: number) => new Date(new Date(date).setDate(date.getDate() + amount)); // Fixed placeholder
    const subDays = (date: Date, amount: number) => new Date(new Date(date).setDate(date.getDate() - amount)); // Fixed placeholder
    const eachDayOfInterval = (interval: { start: Date, end: Date }) => { // Basic placeholder
        const dates = [];
        let currentDate = new Date(interval.start);
        const finalDate = new Date(interval.end) // Ensure comparison works correctly

        // Ensure start date is not mutated
        currentDate.setHours(0, 0, 0, 0);
        finalDate.setHours(0, 0, 0, 0);


        while (currentDate <= finalDate) {
            dates.push(new Date(currentDate));
             // Ensure we increment correctly without mutating the original date object reference in the loop
            currentDate = new Date(currentDate.setDate(currentDate.getDate() + 1));
             currentDate.setHours(0, 0, 0, 0);
        }
        return dates;
    };
     const min = (dates: Date[]) => dates.length ? new Date(Math.min.apply(null, dates.map(d => d.getTime()))) : new Date(); // Handle empty array
     const max = (dates: Date[]) => dates.length ? new Date(Math.max.apply(null, dates.map(d => d.getTime()))) : new Date(); // Handle empty array


    useEffect(() => {
        // Validate campusId? Optional, depends on expected values
        if (!campusId) {
            setError("No campus specified in the URL.");
            setIsLoading(false);
            return;
        }

        const fetchData = async () => {
            if (!db) {
                setError("Firestore database instance is not available. Make sure it's configured and imported correctly.");
                setIsLoading(false);
                console.warn("Firestore 'db' instance is null or undefined. Check firebaseConfig.ts and the import path.");
                return;
            }
            setIsLoading(true);
            setError(null);
            // Reset state for the specific campus
            setGroups([]);
            setActivities([]);
            setDateRange([]);
            setScheduleData({});

            try {
                // Fetch Groups filtered by campusId
                const groupsCollection = collection(db, 'groups');
                const q = query(groupsCollection, where("campusId", "==", campusId.toUpperCase())); // Filter by campusId
                const groupsSnapshot = await getDocs(q);
                const fetchedGroups: Group[] = groupsSnapshot.docs.map(doc => {
                     const data = doc.data();

                     // Validate essential fields (Timestamps)
                     if (!(data.arrivalDate instanceof Timestamp) || !(data.departureDate instanceof Timestamp)) {
                         console.warn(`Group document ${doc.id} is missing arrivalDate or departureDate Timestamp.`);
                         return null; // Skip invalid group data
                     }
                     if (!data.groupName) {
                         console.warn(`Group document ${doc.id} is missing groupName.`);
                         // Assign a default or skip, depending on requirements
                         // return null;
                     }

                     // Directly map fields, providing defaults for optional ones
                     return {
                         id: doc.id,
                         groupName: data.groupName || 'Unnamed Group',
                         Client: data.Client || 'Unknown',
                         studentCount: data.studentCount || 0,
                         leaderCount: data.leaderCount || 0,
                         arrivalDate: data.arrivalDate, // Keep as Timestamp
                         departureDate: data.departureDate, // Keep as Timestamp
                         arrivalAirport: data.arrivalAirport || '',
                         departureAirport: data.departureAirport || '',
                         campusId: data.campusId || '',
                         arrivalFlightNumber: data.arrivalFlightNumber || '',
                         departureFlightNumber: data.departureFlightNumber || '',
                         needsArrivalTransfer: data.needsArrivalTransfer === true,
                         notes: data.notes || '',
                     } as Group;
                 }).filter((group): group is Group => group !== null);

                if (fetchedGroups.length === 0) {
                    setGroups([]);
                    setDateRange([]);
                    setScheduleData({});
                    // Set activities even if no groups
                    // setIsLoading(false); // Move finally block down
                    console.log("fetchData: No valid groups found.");
                    // return; // Don't return yet, fetch schedule
                } else {
                    setGroups(fetchedGroups);
                    // Calculate Date Range
                     const arrivalDates = fetchedGroups.map(g => g.arrivalDate.toDate());
                     const departureDates = fetchedGroups.map(g => g.departureDate.toDate());

                     // Ensure dates are valid before using min/max
                     const validArrivalDates = arrivalDates.filter(d => !isNaN(d.getTime()));
                     const validDepartureDates = departureDates.filter(d => !isNaN(d.getTime()));

                     if (validArrivalDates.length === 0 || validDepartureDates.length === 0) {
                        setError("Could not determine date range due to invalid dates in group data.");
                        setIsLoading(false);
                        return;
                     }


                     const earliestArrival = min(validArrivalDates);
                     const latestDeparture = max(validDepartureDates);

                     const startDate = subDays(earliestArrival, 7);
                     const endDate = addDays(latestDeparture, 7);


                    const calculatedDateRange = eachDayOfInterval({ start: startDate, end: endDate });
                    setDateRange(calculatedDateRange);
                }

                // Fetch Activities
                const activitiesCollection = collection(db, 'activities');
                const activitySnapshot = await getDocs(activitiesCollection);
                const fetchedActivities: Activity[] = activitySnapshot.docs.map(doc => ({
                    id: doc.id,
                    name: doc.data().name || 'Unnamed Activity',
                    location: doc.data().location,
                    type: doc.data().type === 'full-day' ? 'full-day' : 'half-day',
                }));
                setActivities(fetchedActivities);

                // Fetch Schedule Data (only if groups and date range exist)
                const fetchedScheduleData: DailyScheduleData = {};
                if (calculatedDateRange.length > 0 && fetchedGroups.length > 0) { 
                    const schedulePromises = [];
                    for (const date of calculatedDateRange) {
                        for (const group of fetchedGroups) { 
                            const dateStr = format(date, 'yyyy-MM-dd');
                            const docId = `${dateStr}_${group.id}`;
                            const docRef = doc(db, 'dailySchedule', docId);
                            schedulePromises.push(
                                 getDoc(docRef).then(docSnap => {
                                     if (docSnap.exists()) {
                                         const data = docSnap.data();
                                         // Adapt to new structure { activityId, secondaryInfo }
                                         fetchedScheduleData[docId] = {
                                             activityId: data.activityId, // Expecting activityId now
                                             secondaryInfo: data.secondaryInfo || ''
                                         };
                                     } else {
                                        // Store empty if not found
                                        fetchedScheduleData[docId] = { secondaryInfo: '' }; 
                                     }
                                 }).catch(err => {
                                     console.error(`Failed to fetch schedule for ${docId}:`, err);
                                     // Handle error display? Mark cell as errored?
                                     fetchedScheduleData[docId] = { secondaryInfo: 'Error' }; 
                                 })
                            );
                        }
                    }
                    await Promise.all(schedulePromises);
                } // else schedule remains empty
                setScheduleData(fetchedScheduleData);

            } catch (err) {
                console.error(`Error fetching data for campus ${campusId}:`, err);
                setError(`Failed to load dashboard data for ${campusId}: ${err instanceof Error ? err.message : String(err)}`);
                // Reset state on error
                setGroups([]);
                setActivities([]);
                setDateRange([]);
                setScheduleData({});
            } finally {
                setIsLoading(false); 
            }
        };

        fetchData();
     }, [campusId]);


    const handleCellClick = (date: Date, groupId: string) => {
        const groupName = groups.find(g => g.id === groupId)?.groupName || 'Unknown Group';
        console.log(`Edit cell for Date: ${format(date, 'yyyy-MM-dd')}, Group: ${groupName} (ID: ${groupId})`);
        const dateStr = format(date, 'yyyy-MM-dd');
        const key = `${dateStr}_${groupId}`;
        const currentData = scheduleData[key] || { activityId: '', secondaryInfo: '' };

        // Replace prompt with a proper modal or inline editing component
        const newActivity = prompt(`Enter Activity for ${dateStr} - ${groupName}:`, currentData.activityId);
        // Only prompt for secondary info if activity was not cancelled
        let newSecondaryInfo = currentData.secondaryInfo;
        if (newActivity !== null) {
            newSecondaryInfo = prompt(`Enter Pax/Info for ${dateStr} - ${groupName}:`, currentData.secondaryInfo) ?? currentData.secondaryInfo; // Keep old value if cancelled
        }


        // Save only if the first prompt (activity) was not cancelled
        if (newActivity !== null) {
            handleSave(date, groupId, newActivity, newSecondaryInfo);
        } else {
             console.log("Edit cancelled.");
        }
    };

    const handleSave = async (date: Date, groupId: string, activityId: string | undefined, secondaryInfo: string) => {
        // Check for db using a placeholder check. Replace with your actual db check.
        if (!db) {
             console.error("Firestore db instance not available for saving.");
             setError("Cannot save data: Database connection lost."); // User feedback
             return;
        }
        const dateStr = format(date, 'yyyy-MM-dd');
        const docId = `${dateStr}_${groupId}`;
        const docRef = doc(db, 'dailySchedule', docId);
        // Create data conforming to the updated ScheduleEntry interface
        const newData: ScheduleEntry = {
             activityId: activityId ? activityId.trim() : undefined,
             secondaryInfo: secondaryInfo.trim()
         };

        // Prevent saving if both fields are empty/undefined after trimming
         if (!newData.activityId && !newData.secondaryInfo && !scheduleData[docId]) {
             console.log("Skipping save for empty entry.");
             return;
         }


        try {
            await setDoc(docRef, newData); // Overwrite document with new data (or create if new)
            setScheduleData(prev => ({
                ...prev,
                [docId]: newData
            }));
            console.log(`Saved data for ${docId}`);
             if (error === "Cannot save data: Database connection lost.") {
                 setError(null); // Clear specific save error on successful save
             }
        } catch (err) {
            console.error("Error saving data:", err);
            setError(`Failed to save update for ${dateStr}: ${err instanceof Error ? err.message : String(err)}`); // More specific error
        }
    };

     // Calculate sorted groups based on the state
     const sortedGroups = useMemo(() => {
        let tempGroups = groups;

        // Apply sorting if enabled
        if (sortByArrival) {
            return [...tempGroups].sort((a, b) => a.arrivalDate.toDate().getTime() - b.arrivalDate.toDate().getTime());
        }
        
        return tempGroups; // Return filtered (and potentially original order) groups
    }, [groups, sortByArrival]);

     // --- Toggle Sort Handler ---
    const handleSortToggle = () => {
        setSortByArrival(prev => !prev);
    };

    if (isLoading) {
        // Consider a more visually appealing loader (e.g., spinner component)
        return <div style={{ padding: '20px', textAlign: 'center' }}>Loading schedule...</div>;
    }

    if (error) {
        // Improve error display, maybe allow retry?
        return <div style={{ color: 'red', padding: '20px', border: '1px solid red', margin: '10px' }}>Error: {error}</div>;
    }

     // Show message if groups exist but date range couldn't be calculated (e.g., invalid dates)
     if (groups.length > 0 && dateRange.length === 0 && !isLoading) {
        return <div style={{ padding: '20px' }}>Could not determine the date range from group data. Please check group arrival/departure dates.</div>;
     }


     // Initial state before groups are loaded or if groups array is empty after fetch
     if (groups.length === 0 && !isLoading) {
        return <div style={{ padding: '20px' }}>No group data found. Add groups via the Groups page to see the schedule.</div>;
    }

    // --- Styling --- (Adjusted for more compact view and Toolbar)
    const toolbarHeight = '60px'; // Match toolbar height

    const tableStyle: React.CSSProperties = {
        borderCollapse: 'collapse',
        width: '100%',
        tableLayout: 'fixed',
        fontSize: '10px', // Reduced base font size further
    };
    const thStyle: React.CSSProperties = {
        border: '1px solid #ddd',
        padding: '2px 4px', // Further reduced padding
        textAlign: 'center',
        backgroundColor: '#f0f0f0',
        fontWeight: '600',
        position: 'sticky',
        top: 0, // Relative to scrolling container
        zIndex: 10,
         whiteSpace: 'nowrap',
         overflow: 'hidden',
         textOverflow: 'ellipsis',
    };
    const tdBaseStyle: React.CSSProperties = {
        border: '1px solid #ddd',
        padding: '0', // Keep padding on inner divs
        textAlign: 'left',
        height: '38px', // Further reduced cell height
        verticalAlign: 'top',
         overflow: 'hidden',
    };
    const dateCellStyle: React.CSSProperties = {
        ...tdBaseStyle,
        padding: '2px', // Further reduced padding
        backgroundColor: '#f8f8f8',
        fontWeight: 'bold',
        textAlign: 'center',
        verticalAlign: 'middle',
        width: '60px', // Reduced fixed width for date column
         whiteSpace: 'nowrap',
         position: 'sticky', // Make date column sticky
         left: 0, // Stick to the left
         zIndex: 5 // Lower z-index than header but above regular cells
    };
     const scheduleCellStyle: React.CSSProperties = {
         ...tdBaseStyle,
         cursor: 'pointer',
         transition: 'background-color 0.2s ease',
         // Removed padding/boxSizing from here, handled by inner divs
     };
     const cellHoverStyle: string = `
        .schedule-cell:hover {
            background-color: #e9f5ff !important;
        }
    `;

    const cellContentStyle: React.CSSProperties = {
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
         padding: '2px 3px', // Further reduced padding
         boxSizing: 'border-box',
    };
     const activityStyle: React.CSSProperties = {
         flexGrow: 1,
         borderBottom: '1px dashed #eee',
         paddingBottom: '1px',
         marginBottom: '1px',
         overflow: 'hidden',
         textOverflow: 'ellipsis',
         whiteSpace: 'nowrap',
         fontWeight: '500',
         fontSize: '9px', // Reduced activity font size
     };
    const secondaryInfoStyle: React.CSSProperties = {
        fontSize: '8px', // Reduced secondary info font size
        color: '#666',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
         lineHeight: '1.1',
    };

    // Style for the top-left Date header cell
    const dateHeaderStyle: React.CSSProperties = {
        ...thStyle, // Inherit base header styles (sticky top, background, etc.)
        left: 0, // Make it sticky to the left
        zIndex: 15, // Highest z-index to stay above other sticky elements
    };
    // --- End Styling ---

    const headerLinkStyle: React.CSSProperties = {
        textDecoration: 'none',
        color: 'inherit', // Inherit color from the header cell
        display: 'block', // Make link fill the cell for easier clicking
        height: '100%',
        width: '100%'
    };

    // Update title in Toolbar or add a header here?
    const campusName = campusId ? campusId.toUpperCase() : 'Unknown Campus';

    return (
        <div style={{ height: '100vh', width: '100%', display: 'flex', flexDirection: 'column' }}>
             <DashboardToolbar 
                 sortByArrival={sortByArrival} 
                 onSortToggle={handleSortToggle} 
             />
             <style>{cellHoverStyle}</style>
             {/* Add a clear header for the current campus */}
             <h3 style={{ textAlign:'center', margin: '5px 0', position: 'fixed', top: '65px', left: '50%', transform: 'translateX(-50%)', zIndex: 99 }}>{campusName} Schedule</h3> 
             <div style={{ flexGrow: 1, width: '100%', borderTop: '1px solid #ccc', marginTop: toolbarHeight + 30 }}> {/* Adjusted margin for new H3 */}
                 <div style={{ height: '100%', width: '100%', overflow: 'auto' }}>
                    <table style={tableStyle}>
                        <colgroup>
                            <col style={{ width: '60px' }} />
                            {sortedGroups.map(group => (
                                <col key={group.id} style={{ minWidth: '100px' }} />
                            ))}
                        </colgroup>
                        <thead>
                            <tr>
                                <th style={dateHeaderStyle}>Date</th>
                                {sortedGroups.map(group => (
                                    <th key={group.id} style={thStyle} title={`Go to schedule for ${group.groupName}`}>
                                        <Link to={`/group/${group.id}/schedule`} style={headerLinkStyle}>
                                            {group.groupName}
                                        </Link>
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {dateRange.map((date, dateIndex) => {
                                const dateStr = format(date, 'yyyy-MM-dd');
                                const rowStyle = dateIndex % 2 === 0 ? { backgroundColor: '#fff' } : { backgroundColor: '#fdfdfd' };
                                // Define month names for formatting
                                const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
                                                  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
                                return (
                                    <tr key={dateStr} style={rowStyle}>
                                        <td style={dateCellStyle}>
                                            {/* Format date as DD-MMM */}
                                            {String(date.getDate()).padStart(2, '0')}-{
                                             monthNames[date.getMonth()] // Get month abbreviation
                                            }
                                        </td>
                                        {sortedGroups.map(group => {
                                            const key = `${dateStr}_${group.id}`;
                                            const entry = scheduleData[key];

                                            // Get formatted arrival/departure dates for the current group
                                            let arrivalDate: Date | null = null;
                                            let departureDate: Date | null = null;
                                            try {
                                                if (group.arrivalDate?.toDate) {
                                                    arrivalDate = group.arrivalDate.toDate();
                                                    arrivalDate.setHours(0, 0, 0, 0); // Normalize time
                                                }
                                                if (group.departureDate?.toDate) {
                                                    departureDate = group.departureDate.toDate();
                                                    departureDate.setHours(0, 0, 0, 0); // Normalize time
                                                }
                                            } catch (e) {
                                                console.error("Error processing group dates:", e, group);
                                            }

                                            const currentDate = new Date(date);
                                            currentDate.setHours(0, 0, 0, 0); // Normalize current cell date

                                            // Check if the current cell's date matches arrival or departure or is outside the stay
                                            const isArrivalDay = arrivalDate && currentDate.getTime() === arrivalDate.getTime();
                                            const isDepartureDay = departureDate && currentDate.getTime() === departureDate.getTime();
                                            const isOutsideStay = (!arrivalDate || currentDate < arrivalDate) || (!departureDate || currentDate > departureDate);

                                            let cellContent = null; // Default to blank
                                            let currentCellStyle = { ...tdBaseStyle }; // Start with base style
                                            let clickHandler = () => {}; // Default to no action
                                            let cellTitle = ''; // Default title
                                            let cellClassName = ''; // Default no hover class

                                            if (isArrivalDay) {
                                                // Style and content for Arrival day
                                                cellContent = <div style={{ fontWeight: 'bold', color: 'green', textAlign: 'center', padding: '5px 0' }}>Arrival</div>;
                                                currentCellStyle = { ...tdBaseStyle, backgroundColor: '#e6ffed', textAlign: 'center', verticalAlign: 'middle' };
                                                cellTitle = `${group.groupName} - Arrival on ${dateStr}`;
                                            } else if (isDepartureDay) {
                                                // Style and content for Departure day
                                                cellContent = <div style={{ fontWeight: 'bold', color: 'red', textAlign: 'center', padding: '5px 0' }}>Departure</div>;
                                                currentCellStyle = { ...tdBaseStyle, backgroundColor: '#ffeeed', textAlign: 'center', verticalAlign: 'middle' };
                                                cellTitle = `${group.groupName} - Departure on ${dateStr}`;
                                            } else if (isOutsideStay) {
                                                // Style and content for days outside the group's stay
                                                cellContent = <div style={{ height: '100%' }}></div>; // Blank content
                                                currentCellStyle = { ...tdBaseStyle, backgroundColor: '#f5f5f5' }; // Subtle gray background
                                                cellTitle = `${group.groupName} is not present on ${dateStr}`;
                                                // clickHandler remains () => {} (no action)
                                                // cellClassName remains '' (no hover)
                                            } else {
                                                // Default editable cell content (during the stay)
                                                cellContent = (
                                                    <div style={cellContentStyle}>
                                                        <div style={activityStyle} title={entry?.activityId || 'No activity set'}>
                                                            {entry?.activityId || <span style={{ color: '#aaa' }}>-</span>}
                                                        </div>
                                                        <div style={secondaryInfoStyle} title={entry?.secondaryInfo || 'No info set'}>
                                                            {entry?.secondaryInfo || <span style={{ color: '#aaa' }}>-</span>}
                                                        </div>
                                                    </div>
                                                );
                                                currentCellStyle = { ...scheduleCellStyle }; // Use interactive style
                                                clickHandler = () => handleCellClick(date, group.id);
                                                cellTitle = `Click to edit schedule for ${group.groupName} on ${dateStr}`;
                                                cellClassName = "schedule-cell"; // Add hover effect
                                            }

                                            return (
                                                <td
                                                    key={key}
                                                    style={currentCellStyle}
                                                    className={cellClassName}
                                                    onClick={clickHandler}
                                                    title={cellTitle}
                                                >
                                                    {cellContent}
                                                </td>
                                            );
                                        })}
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                 </div>
             </div>
        </div>
    );
};

export default Dashboard;
