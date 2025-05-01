import React, { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { doc, getDoc, collection, query, where, getDocs, Timestamp } from 'firebase/firestore';
import { useReactToPrint } from 'react-to-print';
import { db } from '../firebase';

// Interface matching Firestore structure (ensure consistency with other pages)
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

// Interface for the daily schedule data - UPDATED
interface ScheduleEntry {
    activity?: string; // Make optional if not always present
    secondaryInfo?: string; // Make optional
    classStatus?: "Morning" | "Afternoon" | "Double" | "None" | "Error"; // Added from Dashboard
}

// Interface to hold fetched schedule data, keyed by date string
interface GroupScheduleMap {
    [dateString: string]: ScheduleEntry; // Key: "YYYY-MM-DD"
}

// Helper function (placeholder, replace with actual date-fns if available)
const format = (date: Date, fmt: string): string => {
    if (!date || isNaN(date.getTime())) return 'Invalid Date'; // Basic validation
    // Basic ISO date string (YYYY-MM-DD)
    if (fmt === 'yyyy-MM-dd') {
        return date.toISOString().split('T')[0];
    }
    // Add other formats if needed
    return date.toLocaleDateString(); // Default
};

// Helper function to get all dates in a range
const eachDayOfInterval = (interval: { start: Date, end: Date }): Date[] => {
    if (!interval || !interval.start || !interval.end || isNaN(interval.start.getTime()) || isNaN(interval.end.getTime())) {
        return []; // Return empty array if interval is invalid
    }
    const dates = [];
    let currentDate = new Date(interval.start);
    const finalDate = new Date(interval.end);
    currentDate.setHours(0, 0, 0, 0);
    finalDate.setHours(0, 0, 0, 0);
    // Ensure loop doesn't run indefinitely if dates are invalid
    let safeguard = 0;
    const maxIterations = 365 * 2; // Limit loop iterations

    while (currentDate <= finalDate && safeguard < maxIterations) {
        dates.push(new Date(currentDate));
        currentDate = new Date(currentDate.setDate(currentDate.getDate() + 1));
        currentDate.setHours(0, 0, 0, 0);
        safeguard++;
    }
     if (safeguard >= maxIterations) {
        console.error("eachDayOfInterval exceeded max iterations, potential date issue.");
    }
    return dates;
};


const GroupSchedulePage: React.FC = () => {
    const { groupId } = useParams<{ groupId: string }>();
    const [group, setGroup] = useState<Group | null>(null);
    const [schedule, setSchedule] = useState<GroupScheduleMap>({});
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);
    const [dateRange, setDateRange] = useState<Date[]>([]);

    // Ref for the printable content area - Update type to HTMLTableElement
    const componentRef = useRef<HTMLTableElement>(null);

    useEffect(() => {
        if (!groupId) {
            setError("No group ID provided.");
            setIsLoading(false);
            return;
        }

        const fetchGroupAndSchedule = async () => {
            setIsLoading(true);
            setError(null);
            setGroup(null); // Reset group state on new fetch
            setSchedule({});
            setDateRange([]);

            // Validate db instance
            if (!db) {
                 setError("Firestore DB instance is not available.");
                 setIsLoading(false);
                 return;
            }

            try {
                // 1. Fetch Group Details
                const groupRef = doc(db, 'groups', groupId);
                const groupSnap = await getDoc(groupRef);

                if (!groupSnap.exists()) {
                    throw new Error(`Group with ID ${groupId} not found.`);
                }

                // It's safer to explicitly cast and check fields than assume structure matches Omit<Group, 'id'>
                const groupData = groupSnap.data();
                 if (!groupData) {
                      throw new Error(`Group data for ${groupId} is empty.`);
                 }

                 // Validate essential fields from Firestore
                 if (!(groupData.arrivalDate instanceof Timestamp) || !(groupData.departureDate instanceof Timestamp)) {
                    throw new Error(`Group ${groupId} has invalid or missing arrival/departure dates (Timestamps expected).`);
                 }
                  if (typeof groupData.groupName !== 'string' || !groupData.groupName) {
                    console.warn(`Group ${groupId} has missing or invalid groupName.`);
                    // Decide: throw error or use default? Using default for robustness.
                    // throw new Error(`Group ${groupId} has missing or invalid groupName.`);
                 }


                 // Construct the group object safely
                 const fetchedGroup: Group = {
                     id: groupSnap.id,
                     groupName: groupData.groupName || 'Unnamed Group',
                     Client: groupData.Client || 'Unknown',
                     studentCount: typeof groupData.studentCount === 'number' ? groupData.studentCount : 0,
                     leaderCount: typeof groupData.leaderCount === 'number' ? groupData.leaderCount : 0,
                     arrivalDate: groupData.arrivalDate,
                     departureDate: groupData.departureDate,
                     arrivalAirport: groupData.arrivalAirport || '',
                     departureAirport: groupData.departureAirport || '',
                     campusId: groupData.campusId || '',
                     arrivalFlightNumber: groupData.arrivalFlightNumber || '',
                     departureFlightNumber: groupData.departureFlightNumber || '',
                     needsArrivalTransfer: groupData.needsArrivalTransfer === true,
                     notes: groupData.notes || '',
                 };
                 setGroup(fetchedGroup);


                // 2. Determine Date Range for Schedule Fetch
                const arrival = fetchedGroup.arrivalDate.toDate();
                const departure = fetchedGroup.departureDate.toDate();

                // Add validation for date validity after conversion
                if (isNaN(arrival.getTime()) || isNaN(departure.getTime())) {
                    throw new Error(`Could not parse valid dates from group ${groupId} Timestamps.`);
                }

                arrival.setHours(0,0,0,0);
                departure.setHours(0,0,0,0);

                // Ensure departure is not before arrival
                 if (departure < arrival) {
                     console.warn(`Group ${groupId} departure date is before arrival date.`);
                     // Handle this case, e.g., set date range to just arrival day or throw error
                     // setDateRange([arrival]); // Option 1: Just show arrival day
                     throw new Error(`Group ${groupId} departure date is before arrival date.`); // Option 2: Treat as error
                 }

                const datesToFetch = eachDayOfInterval({ start: arrival, end: departure });
                setDateRange(datesToFetch); // Store dates for rendering rows

                // 3. Fetch Daily Schedules - UPDATED to include classStatus
                if (datesToFetch.length > 0) {
                    const fetchedScheduleData: GroupScheduleMap = {};
                    const schedulePromises = datesToFetch.map(date => {
                        const dateStr = format(date, 'yyyy-MM-dd');
                        if (dateStr === 'Invalid Date') return Promise.resolve();
                        const scheduleDocId = `${dateStr}_${groupId}`;
                        const scheduleRef = doc(db, 'dailySchedule', scheduleDocId);
                        return getDoc(scheduleRef).then(docSnap => {
                            if (docSnap.exists()) {
                                const data = docSnap.data();
                                // Extract classStatus along with others
                                fetchedScheduleData[dateStr] = {
                                     activity: data.activity || '',
                                     secondaryInfo: data.secondaryInfo || '',
                                     classStatus: data.classStatus || 'None' // Default to None if missing
                                };
                            } else {
                                // Store default entry including classStatus
                                fetchedScheduleData[dateStr] = { activity: '', secondaryInfo: '', classStatus: 'None' };
                            }
                        }).catch(err => {
                            // Log error and set default entry
                            console.error(`Failed to fetch schedule for ${scheduleDocId}:`, err);
                            fetchedScheduleData[dateStr] = { activity: 'Error loading', secondaryInfo: '', classStatus: 'Error' };
                        });
                    });
                    await Promise.all(schedulePromises);
                    setSchedule(fetchedScheduleData);
                } else {
                    setSchedule({});
                }


            } catch (err) {
                console.error("Error fetching group schedule:", err);
                setError(err instanceof Error ? err.message : "An unknown error occurred loading schedule data.");
                setGroup(null); // Clear potentially partial data
                setSchedule({});
                setDateRange([]);
            } finally {
                setIsLoading(false);
            }
        };

        fetchGroupAndSchedule();
    }, [groupId]); // Re-run if groupId changes

    // --- Print Handler ---
    const triggerPrint: () => void = useReactToPrint({
        content: () => componentRef.current, // Ensure content points to the ref
        documentTitle: `${group?.groupName || 'Group'} Schedule - ${new Date().toLocaleDateString()}`,
        // Add other options as needed
    } as any); // Keep assertion if types are incorrect

    // Wrapper function to check ref before printing
    const handleTriggerPrint = () => {
        if (componentRef.current) {
            triggerPrint(); // Call the function returned by the hook
        } else {
            console.error("Print Error: Reference to printable content is not available.");
            // Optionally, inform the user with a state update or alert
            setError("Could not initiate print: Content reference not found.");
        }
    };

    // --- Rendering Logic ---
    if (isLoading) return <div style={{ padding: '20px' }}>Loading group schedule...</div>;
    if (error) return <div style={{ padding: '20px', color: 'red' }}>Error: {error}</div>;
    // Check if group fetch succeeded but resulted in null
    if (!group) return <div style={{ padding: '20px' }}>Group data could not be loaded or group not found.</div>;

    // Define the columns - RESTORED to original
    const scheduleColumns = [
        'Breakfast',
        'Morning Activity', // Restored
        'Lunch',
        'Afternoon Activity', // Restored
        'Dinner',
        'Evening Activity'
    ];

    // Basic styling for the table
    const tableStyle: React.CSSProperties = { borderCollapse: 'collapse', width: '100%', marginTop: '20px', fontSize: '13px' }; // Adjusted font size
    const thStyle: React.CSSProperties = { border: '1px solid #ccc', padding: '8px 10px', textAlign: 'center', backgroundColor: '#f0f0f0', fontWeight: 'bold', whiteSpace: 'nowrap' }; // Adjusted padding
    const tdStyle: React.CSSProperties = { border: '1px solid #ccc', padding: '8px 10px', height: '45px', textAlign: 'center', verticalAlign: 'middle' }; // Adjusted padding/height
    const dateThStyle: React.CSSProperties = { ...thStyle, position: 'sticky', left: 0, zIndex: 1, minWidth: '120px', textAlign: 'left', backgroundColor: '#e8e8e8' };
    const activityTdStyle: React.CSSProperties = { ...tdStyle, backgroundColor: '#f9f9f9' };
    const mealTdStyle: React.CSSProperties = { ...tdStyle, fontWeight: 'bold' };
    // Added styles for weekend variations
    const weekendLunchTdStyle: React.CSSProperties = { ...tdStyle, fontStyle: 'italic', color: '#777' };
    const weekendActivityTdStyle: React.CSSProperties = { ...activityTdStyle, backgroundColor: '#f0f8ff' }; // Light blue background for weekend activities

    const printButtonStyle: React.CSSProperties = {
        position: 'absolute',
        top: '20px',
        right: '20px',
        padding: '8px 15px',
        cursor: 'pointer',
        backgroundColor: '#198754', // Green color
        color: 'white',
        border: 'none',
        borderRadius: '4px',
        zIndex: 50, // Ensure it's visible
    };

    return (
        <div style={{ padding: '20px', position: 'relative' }}>
            {/* Print Button - Calls the wrapper function */}
            <button 
                onClick={handleTriggerPrint} // Use the wrapper function
                style={printButtonStyle} 
                className="print-button"
            >
                 Export to PDF
            </button>

            {/* Ref applied to the main content div - NO, move to table */}
            <div className="printable-content"> {/* Keep this div for structure if needed, but ref moves */}
                {/* Use optional chaining for safety during initial render phases */}
                <h2 style={{ textAlign: 'center' }}>Schedule Overview for {group?.groupName ?? 'Loading...'}</h2>
                <p style={{ textAlign: 'center' }}>Client: {group?.Client ?? '...'}</p>
                {/* Check if dates exist before formatting */}
                <p style={{ textAlign: 'center' }}>
                    Arrival: {group?.arrivalDate?.toDate()?.toLocaleDateString() ?? '...'} |
                    Departure: {group?.departureDate?.toDate()?.toLocaleDateString() ?? '...'}
                </p>
                {/* Add more group details if needed */}

                 {/* Check if dateRange is populated before rendering table */}
                 {dateRange.length === 0 && !isLoading && <p>No date range calculated.</p>}

                 {dateRange.length > 0 && (
                     <table ref={componentRef} style={tableStyle}> {/* Apply ref directly to the table */}
                         <thead>
                             <tr>
                                 <th style={dateThStyle}>Date</th>
                                 {/* Use RESTORED column names */}
                                 {scheduleColumns.map(colName => (
                                     <th key={colName} style={thStyle}>{colName}</th>
                                 ))}
                             </tr>
                         </thead>
                         <tbody>
                             {dateRange.map(date => {
                                 const dateStr = format(date, 'yyyy-MM-dd');
                                 const dailyEntry = schedule[dateStr];
                                 const classStatus = dailyEntry?.classStatus || 'None';
                                 // Use activity for non-class slots or as fallback
                                 const activityText = dailyEntry?.activity || '-'; 
                                 const activityTitle = dailyEntry?.activity || 'No activity scheduled'; 
                                 const dayOfWeek = date.getDay();
                                 const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

                                 // Determine content based on classStatus
                                 const morningContent = (classStatus === 'Morning' || classStatus === 'Double') ? "Classes" : activityText;
                                 const afternoonContent = (classStatus === 'Afternoon' || classStatus === 'Double') ? "Classes" : activityText;
                                 // Determine title based on content
                                 const morningTitle = (classStatus === 'Morning' || classStatus === 'Double') ? `Class Status: ${classStatus}` : activityTitle;
                                 const afternoonTitle = (classStatus === 'Afternoon' || classStatus === 'Double') ? `Class Status: ${classStatus}` : activityTitle;

                                 return (
                                     <tr key={dateStr}>
                                         <td style={dateThStyle}>
                                             {date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
                                         </td>
                                         {isWeekend ? (
                                            <>
                                                {/* Weekend: Breakfast */}
                                                <td style={mealTdStyle}>Breakfast</td>
                                                {/* Weekend: Morning Activity - Show activityText */}
                                                <td style={weekendActivityTdStyle} title={activityTitle}>{activityText}</td> 
                                                {/* Weekend: Lunch */}
                                                <td style={weekendLunchTdStyle}>Lunch</td> 
                                                {/* Weekend: Afternoon Activity - Show activityText */} 
                                                <td style={weekendActivityTdStyle} title={activityTitle}>{activityText}</td>
                                                {/* Weekend: Dinner */}
                                                <td style={mealTdStyle}>Dinner</td>
                                                {/* Weekend: Evening Activity - Show activityText */} 
                                                <td style={weekendActivityTdStyle} title={activityTitle}>{activityText}</td>
                                            </>
                                         ) : (
                                            <>
                                                {/* Weekday: Breakfast */}
                                                <td style={mealTdStyle}>Breakfast</td>
                                                {/* Weekday: Morning Activity - Conditional Content */}
                                                <td style={activityTdStyle} title={morningTitle}>{morningContent}</td>
                                                {/* Weekday: Lunch */}
                                                <td style={mealTdStyle}>Lunch</td>
                                                {/* Weekday: Afternoon Activity - Conditional Content */}
                                                <td style={activityTdStyle} title={afternoonTitle}>{afternoonContent}</td>
                                                {/* Weekday: Dinner */}
                                                <td style={mealTdStyle}>Dinner</td>
                                                {/* Weekday: Evening Activity */}
                                                <td style={activityTdStyle} title={activityTitle}>{activityText}</td>
                                            </>
                                         )}
                                     </tr>
                                 );
                             })}
                         </tbody>
                     </table>
                 )}
            </div>

            {/* Add print-specific styles */}
            <style type="text/css" media="print">
                {`
                    @page {
                        size: landscape; /* Make PDF landscape */
                        margin: 15mm; /* Adjust margins */
                    }
                    body {
                        -webkit-print-color-adjust: exact; /* Ensures backgrounds print in Chrome/Safari */
                        print-color-adjust: exact; /* Standard */
                    }
                    .print-button {
                        display: none; /* Hide the print button in the PDF */
                    }
                    /* Add any other print-specific style adjustments */
                    .printable-content {
                         padding: 0; /* Remove screen padding for print */
                         margin: 0;
                    }
                    h2, p {
                        text-align: center;
                    }
                 `}
            </style>
        </div>
    );
};

export default GroupSchedulePage; 