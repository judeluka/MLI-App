import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { doc, getDoc, collection, query, where, getDocs, Timestamp } from 'firebase/firestore';
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

// Interface for the daily schedule data
interface ScheduleEntry {
    activity: string;
    secondaryInfo: string;
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

                // 3. Fetch Daily Schedules for the date range
                if (datesToFetch.length > 0) {
                    const fetchedScheduleData: GroupScheduleMap = {};
                    // Consider batching reads for very long stays if needed
                    const schedulePromises = datesToFetch.map(date => {
                        const dateStr = format(date, 'yyyy-MM-dd');
                         if (dateStr === 'Invalid Date') {
                            console.error("Generated invalid date string in fetch loop:", date);
                            return Promise.resolve(); // Skip invalid date
                         }
                        const scheduleDocId = `${dateStr}_${groupId}`;
                        const scheduleRef = doc(db, 'dailySchedule', scheduleDocId);
                        return getDoc(scheduleRef).then(docSnap => {
                            if (docSnap.exists()) {
                                const scheduleEntryData = docSnap.data();
                                // Basic validation of schedule entry data
                                fetchedScheduleData[dateStr] = {
                                     activity: typeof scheduleEntryData.activity === 'string' ? scheduleEntryData.activity : '',
                                     secondaryInfo: typeof scheduleEntryData.secondaryInfo === 'string' ? scheduleEntryData.secondaryInfo : ''
                                };
                            } else {
                                // Store an empty entry if no schedule exists for that day
                                fetchedScheduleData[dateStr] = { activity: '', secondaryInfo: '' };
                            }
                        }).catch(err => {
                            // Log error but potentially continue fetching others
                            console.error(`Failed to fetch schedule for ${scheduleDocId}:`, err);
                            fetchedScheduleData[dateStr] = { activity: 'Error loading', secondaryInfo: '' }; // Indicate error in UI?
                        });
                    });

                    await Promise.all(schedulePromises);
                    setSchedule(fetchedScheduleData);
                } else {
                    setSchedule({}); // No dates, so no schedule
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

    // --- Rendering Logic ---
    if (isLoading) return <div style={{ padding: '20px' }}>Loading group schedule...</div>;
    if (error) return <div style={{ padding: '20px', color: 'red' }}>Error: {error}</div>;
    // Check if group fetch succeeded but resulted in null
    if (!group) return <div style={{ padding: '20px' }}>Group data could not be loaded or group not found.</div>;

    // Define the columns for the simplified schedule view
    const scheduleColumns = [
        'Breakfast', 
        'Morning Activity', 
        'Lunch', 
        'Afternoon Activity', 
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

    return (
        <div style={{ padding: '20px' }}>
            {/* Use optional chaining for safety during initial render phases */}
            <h2>Schedule Overview for {group?.groupName ?? 'Loading...'}</h2>
            <p>Client: {group?.Client ?? '...'}</p>
            {/* Check if dates exist before formatting */}
            <p>
                Arrival: {group?.arrivalDate?.toDate()?.toLocaleDateString() ?? '...'} |
                Departure: {group?.departureDate?.toDate()?.toLocaleDateString() ?? '...'}
            </p>
            {/* Add more group details if needed */}

             {/* Check if dateRange is populated before rendering table */}
             {dateRange.length === 0 && !isLoading && <p>No date range calculated for this group.</p>}

             {dateRange.length > 0 && (
                 // Removed the outer div with fixed height/scroll, allow natural page scroll
                 <table style={tableStyle}>
                     <thead>
                         <tr>
                             <th style={dateThStyle}>Date</th>
                             {scheduleColumns.map(colName => (
                                 <th key={colName} style={thStyle}>{colName}</th>
                             ))}
                         </tr>
                     </thead>
                     <tbody>
                         {dateRange.map(date => {
                             const dateStr = format(date, 'yyyy-MM-dd');
                             const dailyEntry = schedule[dateStr];
                             const activityText = dailyEntry?.activity || '-';
                             const activityTitle = dailyEntry?.activity || 'No activity scheduled';
                             const dayOfWeek = date.getDay(); // 0 = Sunday, 6 = Saturday
                             const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

                             return (
                                 <tr key={dateStr}>
                                     <td style={dateThStyle}>
                                         {date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
                                     </td>
                                     {/* Render cells differently based on weekend status */}
                                     {isWeekend ? (
                                        <>
                                            {/* Weekend: Breakfast */}
                                            <td style={mealTdStyle} title="Breakfast Time">Breakfast</td>
                                            {/* Weekend: Merged Activity Cell (spans 3 columns) */}
                                            <td 
                                                style={weekendActivityTdStyle} 
                                                title={activityTitle} 
                                                colSpan={3} // Merge Morning Activity, Lunch, Afternoon Activity
                                            >
                                                {activityText}
                                            </td>
                                            {/* Weekend: Dinner */}
                                            <td style={mealTdStyle} title="Dinner Time">Dinner</td>
                                            {/* Weekend: Evening Activity */}
                                            <td style={weekendActivityTdStyle} title={activityTitle}>{activityText}</td>
                                        </>
                                     ) : (
                                        <>
                                            {/* Weekday: Breakfast */}
                                            <td style={mealTdStyle} title="Breakfast Time">Breakfast</td>
                                            {/* Weekday: Morning Activity */}
                                            <td style={activityTdStyle} title={activityTitle}>{activityText}</td>
                                            {/* Weekday: Lunch */}
                                            <td style={mealTdStyle} title="Lunch Time">Lunch</td>
                                            {/* Weekday: Afternoon Activity */}
                                            <td style={activityTdStyle} title={activityTitle}>{activityText}</td>
                                            {/* Weekday: Dinner */}
                                            <td style={mealTdStyle} title="Dinner Time">Dinner</td>
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
    );
};

export default GroupSchedulePage; 