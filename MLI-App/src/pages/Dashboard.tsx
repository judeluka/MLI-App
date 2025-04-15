import React, { useState, useEffect } from 'react';
import { collection, getDocs, query, doc, getDoc, setDoc, Timestamp } from 'firebase/firestore';
import { db } from '../firebase';
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

interface ScheduleEntry {
    activity: string;
    secondaryInfo: string;
}

interface DailyScheduleData {
    [dateGroupIdKey: string]: ScheduleEntry; // Key format: "YYYY-MM-DD_groupId"
}

const Dashboard: React.FC = () => {
    const [groups, setGroups] = useState<Group[]>([]);
    const [dateRange, setDateRange] = useState<Date[]>([]);
    const [scheduleData, setScheduleData] = useState<DailyScheduleData>({});
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);

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
        const fetchData = async () => {
            // Check for db using a placeholder check. Replace with your actual db check.
            if (!db) {
                setError("Firestore database instance is not available. Make sure it's configured and imported correctly.");
                setIsLoading(false);
                console.warn("Firestore 'db' instance is null or undefined. Check firebaseConfig.ts and the import path.");
                return;
            }
            setIsLoading(true);
            setError(null);
            try {
                // 1. Fetch Groups
                const groupsCollection = collection(db, 'groups');
                const groupsSnapshot = await getDocs(groupsCollection);

                // Map Firestore docs directly to the updated Group interface
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
                    setIsLoading(false);
                     // Keep the console log for debugging if needed
                     console.log("fetchData: No valid groups found after mapping and filtering.");
                    // The message "No group data found..." will be shown by the return statement later
                    return;
                }
                setGroups(fetchedGroups);

                // 2. Calculate Date Range
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

                // 3. Fetch Schedule Data (Initial fetch, might need optimization for large ranges)
                const fetchedScheduleData: DailyScheduleData = {};
                // Consider fetching in batches or using listeners for better performance/real-time updates
                const schedulePromises = [];
                for (const date of calculatedDateRange) {
                    for (const group of fetchedGroups) {
                        const dateStr = format(date, 'yyyy-MM-dd');
                        const docId = `${dateStr}_${group.id}`;
                        const docRef = doc(db, 'dailySchedule', docId);
                        // Push promise to array
                        schedulePromises.push(
                             getDoc(docRef).then(docSnap => {
                                 if (docSnap.exists()) {
                                     // Store under the key in the main object, ensure thread-safe access if needed (though useState handles batching)
                                     fetchedScheduleData[docId] = docSnap.data() as ScheduleEntry;
                                 }
                             }).catch(err => {
                                 console.error(`Failed to fetch schedule for ${docId}:`, err);
                                 // Decide how to handle partial failures
                             })
                        );
                    }
                }
                 // Wait for all fetches to complete
                 await Promise.all(schedulePromises);

                setScheduleData(fetchedScheduleData);

            } catch (err) {
                console.error("Error fetching data:", err);
                setError(`Failed to load dashboard data: ${err instanceof Error ? err.message : String(err)}`);
                // Reset state on error
                setGroups([]);
                setDateRange([]);
                setScheduleData({});
            } finally {
                setIsLoading(false);
            }
        };

        fetchData();
     }, []); // Dependency array: Add 'db' if it's passed as a prop or comes from context that might change


    const handleCellClick = (date: Date, groupId: string) => {
        const groupName = groups.find(g => g.id === groupId)?.groupName || 'Unknown Group';
        console.log(`Edit cell for Date: ${format(date, 'yyyy-MM-dd')}, Group: ${groupName} (ID: ${groupId})`);
        const dateStr = format(date, 'yyyy-MM-dd');
        const key = `${dateStr}_${groupId}`;
        const currentData = scheduleData[key] || { activity: '', secondaryInfo: '' };

        // Replace prompt with a proper modal or inline editing component
        const newActivity = prompt(`Enter Activity for ${dateStr} - ${groupName}:`, currentData.activity);
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

    const handleSave = async (date: Date, groupId: string, activity: string, secondaryInfo: string) => {
        // Check for db using a placeholder check. Replace with your actual db check.
        if (!db) {
             console.error("Firestore db instance not available for saving.");
             setError("Cannot save data: Database connection lost."); // User feedback
             return;
        }
        const dateStr = format(date, 'yyyy-MM-dd');
        const docId = `${dateStr}_${groupId}`;
        const docRef = doc(db, 'dailySchedule', docId);
        const newData: ScheduleEntry = {
             activity: activity.trim(), // Trim whitespace
             secondaryInfo: secondaryInfo.trim() // Trim whitespace
         };

        // Prevent saving if both fields are empty after trimming, unless the document already exists (to clear it)
         if (!newData.activity && !newData.secondaryInfo && !scheduleData[docId]) {
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

    // --- Styling --- (Adjusted for more compact view)
    const tableStyle: React.CSSProperties = {
        borderCollapse: 'collapse',
        width: '100%',
        minWidth: `${groups.length * 130 + 80}px`, // Adjusted min width calculation slightly
        tableLayout: 'fixed',
        fontSize: '12px', // Reduced base font size
        boxShadow: '0 2px 5px rgba(0,0,0,0.1)',
    };
    const thStyle: React.CSSProperties = {
        border: '1px solid #ddd',
        padding: '6px 8px', // Reduced padding
        textAlign: 'center',
        backgroundColor: '#f0f0f0',
        fontWeight: '600',
        position: 'sticky',
        top: 0,
        zIndex: 10,
         whiteSpace: 'nowrap',
    };
    const tdBaseStyle: React.CSSProperties = {
        border: '1px solid #ddd',
        padding: '0', // Keep padding on inner divs
        textAlign: 'left',
        height: '55px', // Reduced cell height
        verticalAlign: 'top',
         overflow: 'hidden',
    };
    const dateCellStyle: React.CSSProperties = {
        ...tdBaseStyle,
        padding: '6px', // Reduced padding
        backgroundColor: '#f8f8f8',
        fontWeight: 'bold',
        textAlign: 'center',
        verticalAlign: 'middle',
        width: '80px', // Reduced fixed width for date column
         whiteSpace: 'nowrap',
    };
     const scheduleCellStyle: React.CSSProperties = {
        ...tdBaseStyle,
        cursor: 'pointer',
         transition: 'background-color 0.2s ease',
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
         padding: '4px 6px', // Reduced padding
         boxSizing: 'border-box',
    };
     const activityStyle: React.CSSProperties = {
         flexGrow: 1,
         borderBottom: '1px dashed #eee',
         paddingBottom: '2px', // Reduced padding
         marginBottom: '2px', // Reduced margin
         overflow: 'hidden',
         textOverflow: 'ellipsis',
         whiteSpace: 'nowrap',
         fontWeight: '500',
         fontSize: '11px', // Reduced activity font size
     };
    const secondaryInfoStyle: React.CSSProperties = {
        fontSize: '10px', // Reduced secondary info font size
        color: '#666',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
         lineHeight: '1.1',
    };
    // --- End Styling ---


    return (
        <div style={{ margin: '20px' }}>
             <style>{cellHoverStyle}</style>
             <h2 style={{ marginBottom: '15px' }}>Daily Schedule</h2>
             <div style={{ maxWidth: '100%', overflowX: 'auto', border: '1px solid #ccc' }}>
                 <div style={{ maxHeight: 'calc(90vh - 100px)', overflowY: 'auto' }}>
                    <table style={tableStyle}>
                        <colgroup>
                            <col style={{ width: '80px' }} />{/* Date column fixed width - Reduced */}
                            {groups.map(group => (
                                <col key={group.id} style={{ minWidth: '130px' }} /> /* Minimum width for group columns - Reduced */
                            ))}
                        </colgroup>
                        <thead>
                            <tr>
                                <th style={thStyle}>Date</th>
                                {groups.map(group => (
                                    <th key={group.id} style={thStyle} title={group.groupName}>{group.groupName}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {dateRange.map((date, dateIndex) => {
                                const dateStr = format(date, 'yyyy-MM-dd');
                                const rowStyle = dateIndex % 2 === 0 ? { backgroundColor: '#fff' } : { backgroundColor: '#fdfdfd' };
                                return (
                                    <tr key={dateStr} style={rowStyle}>
                                        <td style={dateCellStyle}>{format(date, 'EEE, MMM d')}</td>
                                        {groups.map(group => {
                                            const key = `${dateStr}_${group.id}`;
                                            const entry = scheduleData[key];

                                            // Get formatted arrival/departure dates for the current group
                                            let arrivalDateStrForGroup = '';
                                            let departureDateStrForGroup = '';
                                            try {
                                                // Ensure dates are valid before formatting
                                                 if (group.arrivalDate?.toDate) {
                                                     arrivalDateStrForGroup = format(group.arrivalDate.toDate(), 'yyyy-MM-dd');
                                                 }
                                                 if (group.departureDate?.toDate) {
                                                    departureDateStrForGroup = format(group.departureDate.toDate(), 'yyyy-MM-dd');
                                                 }
                                            } catch (e) {
                                                console.error("Error formatting group dates:", e, group);
                                                // Handle error case if needed, maybe skip group or show error indicator
                                            }


                                            // Check if the current cell's date matches arrival or departure
                                            const isArrivalDay = dateStr === arrivalDateStrForGroup;
                                            const isDepartureDay = dateStr === departureDateStrForGroup;

                                            let cellContent;
                                            let currentCellStyle = scheduleCellStyle; // Default to editable style
                                            let clickHandler = () => handleCellClick(date, group.id); // Default to editable click
                                            let cellTitle = `Click to edit schedule for ${group.groupName} on ${dateStr}`;
                                            let cellClassName = "schedule-cell"; // Default hover class

                                            if (isArrivalDay) {
                                                // Style and content for Arrival day
                                                cellContent = <div style={{ fontWeight: 'bold', color: 'green', textAlign: 'center', padding: '5px 0' }}>Arrival</div>;
                                                currentCellStyle = { ...tdBaseStyle, backgroundColor: '#e6ffed', textAlign: 'center', verticalAlign: 'middle' }; // Arrival specific style
                                                clickHandler = () => {}; // Not clickable - Fixed linter error
                                                cellTitle = `${group.groupName} - Arrival on ${dateStr}`;
                                                cellClassName = ""; // No hover effect
                                            } else if (isDepartureDay) {
                                                // Style and content for Departure day
                                                cellContent = <div style={{ fontWeight: 'bold', color: 'red', textAlign: 'center', padding: '5px 0' }}>Departure</div>;
                                                currentCellStyle = { ...tdBaseStyle, backgroundColor: '#ffeeed', textAlign: 'center', verticalAlign: 'middle' }; // Departure specific style
                                                clickHandler = () => {}; // Not clickable - Fixed linter error
                                                cellTitle = `${group.groupName} - Departure on ${dateStr}`;
                                                 cellClassName = ""; // No hover effect
                                            } else {
                                                // Default editable cell content
                                                cellContent = (
                                                    <div style={cellContentStyle}>
                                                        <div style={activityStyle} title={entry?.activity || 'No activity set'}>
                                                            {entry?.activity || <span style={{ color: '#aaa' }}>-</span>}
                                                        </div>
                                                        <div style={secondaryInfoStyle} title={entry?.secondaryInfo || 'No info set'}>
                                                            {entry?.secondaryInfo || <span style={{ color: '#aaa' }}>-</span>}
                                                        </div>
                                                    </div>
                                                );
                                                // Keep default style, click handler, title, and class name
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
             <p style={{marginTop: '15px', fontSize: '0.9em', color: '#777'}}>
                 Displaying dates from {dateRange.length > 0 ? format(dateRange[0], 'MMM d, yyyy') : 'N/A'} to {dateRange.length > 0 ? format(dateRange[dateRange.length - 1], 'MMM d, yyyy') : 'N/A'}.
                 Click any cell to edit the Activity and Pax/Secondary Info.
             </p>
        </div>
    );
};

export default Dashboard;
