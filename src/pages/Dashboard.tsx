import React, { useState, useEffect, useMemo } from 'react';
import { collection, getDocs, query, doc, setDoc, Timestamp, where, writeBatch, QueryConstraint } from 'firebase/firestore';
import { db } from '../firebase';
import { useNavigate, Link, useParams } from 'react-router-dom';
import Modal from 'react-modal';

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

// ScheduleEntry interface updated for Classes/Activity structure
interface ScheduleEntry {
    classStatus?: "Morning" | "Afternoon" | "Double" | "None" | "Error"; // REMOVED ""
    activity?: string; // Existing field, repurposed for non-class activities/details
    secondaryInfo?: string; // Kept for now
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
    [dateGroupIdKey: string]: ScheduleEntry; // Key format: "YYYY-MM-DD_groupId"
}

// Type for the painted cells data structure
// --- REVISED: Store type of update --- 
interface PaintedUpdateValue {
    type: 'class' | 'activity';
    value: ScheduleEntry['classStatus'] | string; // classStatus or activity name
}
interface PaintedUpdates { // Renamed from PaintedCells
    [dateGroupIdKey: string]: PaintedUpdateValue;
}

// --- Toolbar Component --- MODIFIED
interface ScheduleToolbarProps { // Renamed for generality
    paintStatus: ScheduleEntry['classStatus'];
    onPaintStatusChange: (status: ScheduleEntry['classStatus']) => void;
    campusId: string | undefined;
    currentView: 'classes' | 'activities'; // Added
    onViewChange: (view: 'classes' | 'activities') => void; // Added
    // --- ADDED props for Activity Painting ---
    activitiesList: Activity[];
    paintActivityName: string;
    onPaintActivityNameChange: (name: string) => void;
    // ---
    onAutoScheduleClick: () => void; // Added callback
    isAutoScheduling: boolean; // Added loading state prop
    // --- ADDED for Orientation ---
    onAssignOrientationClick: () => void;
    isAssigningOrientations: boolean;
}

const ScheduleToolbar: React.FC<ScheduleToolbarProps> = ({ // Renamed
    paintStatus,
    onPaintStatusChange,
    campusId,
    currentView, // Added
    onViewChange, // Added
    // --- ADDED props for Activity Painting ---
    activitiesList,
    paintActivityName,
    onPaintActivityNameChange,
    onAutoScheduleClick, // Added
    isAutoScheduling, // Added
    // --- ADDED for Orientation ---
    onAssignOrientationClick,
    isAssigningOrientations
}) => {
    const navigate = useNavigate();
    const availableCampuses = ["UCD", "ATU", "DCU"];

    // Define App-level navbar height for positioning
    const topNavbarHeight = '50px';

    const toolbarStyle: React.CSSProperties = {
        position: 'fixed',
        top: topNavbarHeight, // Position below the main TopNavbar
        left: 0,
        width: '100%',
        backgroundColor: '#f8f9fa',
        padding: '10px 20px',
        boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
        zIndex: 990, // Below TopNavbar (1000)
        display: 'flex',
        alignItems: 'center',
        gap: '15px',
        boxSizing: 'border-box',
        height: '60px',
    };
    const baseButtonStyle: React.CSSProperties = {
         padding: '8px 12px',
         cursor: 'pointer',
         backgroundColor: '#0d6efd',
         color: 'white',
         border: 'none',
         borderRadius: '4px'
    };
    const titleStyle: React.CSSProperties = { margin: 0, fontSize: '1.2em', marginRight: '20px' };
     const campusSelectContainerStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: '5px', marginRight: 'auto' }; // Adjusted layout
     const campusSelectStyle: React.CSSProperties = { padding: '5px', borderRadius: '4px', fontSize: '1em', marginLeft: '5px' }; // Added marginLeft
    const viewSelectContainerStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: '5px', marginRight: '15px' };
    const viewSelectStyle: React.CSSProperties = { padding: '5px', borderRadius: '4px', fontSize: '1em' };
    const paintSelectContainerStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: '5px', marginLeft: 'auto' }; // Use same container style
    const paintSelectStyle: React.CSSProperties = { padding: '5px', borderRadius: '4px', minWidth: '120px' }; // Use same select style, maybe adjust width

    const handleNavigateBack = () => {
        navigate('/group-management');
    };

    // Handle campus change in dropdown
    const handleCampusChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
        const newCampusId = event.target.value.toLowerCase(); // Navigate to lowercase route
        navigate(`/dashboard/${newCampusId}`);
    };

    const handleViewChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
        onViewChange(event.target.value as 'classes' | 'activities');
    };

    const autoScheduleButtonStyle: React.CSSProperties = {
         ...baseButtonStyle,
         backgroundColor: '#ffc107', // Warning color
         color: '#000',
         marginLeft: '15px' // Add some spacing
    };

    // --- ADDED Style for Orientation Button ---
     const orientationButtonStyle: React.CSSProperties = {
         ...baseButtonStyle,
         backgroundColor: '#17a2b8', // Info color
         marginLeft: '15px' 
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
             {/* Remove Class Schedule title? Redundant with App Navbar */}
             {/* <h2 style={titleStyle}>Class Schedule</h2> */}

            {/* Campus Selection Dropdown */}
            <div style={campusSelectContainerStyle}>
                 <label htmlFor="campusSelect" style={{ fontWeight: 'bold' }}>Campus:</label>
                 <select
                     id="campusSelect"
                     value={campusId?.toUpperCase() || ''} // Display uppercase, use current campusId
                     onChange={handleCampusChange}
                     style={campusSelectStyle}
                 >
                      <option value="" disabled>Select Campus</option> {/* Optional placeholder */}
                      {availableCampuses.map(campus => (
                          <option key={campus} value={campus}>{campus}</option>
                      ))}
                 </select>
             </div>

            {/* View Selection Dropdown */}
            <div style={viewSelectContainerStyle}>
                 <label htmlFor="viewSelect" style={{ fontWeight: 'bold' }}>View:</label>
                 <select
                     id="viewSelect"
                     value={currentView}
                     onChange={handleViewChange}
                     style={viewSelectStyle}
                 >
                      <option value="classes">Classes</option>
                      <option value="activities">Activities</option>
                 </select>
            </div>

            {/* Paint Status Dropdown (Conditional for Classes View) */}
            {currentView === 'classes' && (
                <div style={paintSelectContainerStyle}>
                     <label htmlFor="paintStatusSelect" style={{ fontWeight: 'bold' }}>Paint with:</label>
                     <select
                         id="paintStatusSelect"
                         value={paintStatus || 'None'}
                         onChange={(e) => onPaintStatusChange(e.target.value as ScheduleEntry['classStatus'])}
                         style={paintSelectStyle}
                     >
                          <option value="Morning">Morning</option>
                          <option value="Afternoon">Afternoon</option>
                          <option value="Double">Double</option>
                          <option value="None">None</option>
                     </select>
                 </div>
            )}

            {/* --- ADDED: Paint Activity Dropdown (Conditional for Activities View) --- */}
            {currentView === 'activities' && (
                <div style={paintSelectContainerStyle}>
                     <label htmlFor="paintActivitySelect" style={{ fontWeight: 'bold' }}>Paint Activity:</label>
                     <select
                         id="paintActivitySelect"
                         value={paintActivityName}
                         onChange={(e) => onPaintActivityNameChange(e.target.value)}
                         style={paintSelectStyle}
                     >
                          <option value="">-- None --</option> {/* Option to clear/paint no activity */}
                          {activitiesList.map(act => (
                              <option key={act.id} value={act.name}>
                                  {act.name} ({act.type})
                              </option>
                          ))}
                     </select>
                 </div>
            )}
            {/* --- End Added Dropdown --- */}

            {/* --- ADDED: Auto Schedule Button --- */}
             {/* Show only when Classes view is selected */} 
             {currentView === 'classes' && (
                <button 
                     onClick={onAutoScheduleClick}
                     style={autoScheduleButtonStyle}
                     disabled={isAutoScheduling} // Disable while running
                     title="Automatically generate class schedule based on constraints"
                 >
                     {isAutoScheduling ? 'Scheduling...' : 'Auto Schedule Classes'}
                </button>
             )}
             {/* --- End Auto Schedule Button --- */}

            {/* --- ADDED: Assign Orientations Button --- */}
            {currentView === 'activities' && (
                <button 
                     onClick={onAssignOrientationClick}
                     style={orientationButtonStyle}
                     disabled={isAssigningOrientations}
                     title="Assign 'Orientation' activity to each group's first valid weekday"
                 >
                     {isAssigningOrientations ? 'Assigning...' : 'Assign Orientations'}
                </button>
             )}
             {/* --- End Assign Orientations Button --- */}
        </div>
    );
};
// --- End Toolbar Component ---

// --- Helper Function for Color Generation ---
const stringToHslColor = (str: string, s: number, l: number): string => {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    const h = hash % 360; // Hue range: 0-359
    return `hsl(${h}, ${s}%, ${l}%)`;
};
// ---

// Add interface for activity editing info
interface EditingActivityCellInfo {
    key: string; // dateStr_groupId
    date: Date;
    groupId: string;
    groupName: string;
    currentActivity: string; // Current activity name
}

// --- State for Total Hours ---
interface GroupTotalHours {
    [groupId: string]: number;
}

const Dashboard: React.FC = () => {
    const { campusId } = useParams<{ campusId: string }>();
    
    const [groups, setGroups] = useState<Group[]>([]);
    const [dateRange, setDateRange] = useState<Date[]>([]);
    const [scheduleData, setScheduleData] = useState<DailyScheduleData>({});
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);

    // --- Painting State --- 
    const [isPainting, setIsPainting] = useState<boolean>(false);
    const [paintStatus, setPaintStatus] = useState<ScheduleEntry['classStatus']>('Morning'); // For classes
    const [paintActivityName, setPaintActivityName] = useState<string>(''); // ADDED: For activities
    const [paintedUpdates, setPaintedUpdates] = useState<PaintedUpdates>({}); // REVISED: From paintedCells to paintedUpdates

    // --- ADDED State for Group Total Hours ---
    const [groupTotalHours, setGroupTotalHours] = useState<GroupTotalHours>({});

    // --- ADDED State for Auto Scheduling ---
    const [isAutoScheduling, setIsAutoScheduling] = useState<boolean>(false);

    // --- ADDED State for Orientation Assignment ---
    const [isAssigningOrientations, setIsAssigningOrientations] = useState<boolean>(false);

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

    const [currentView, setCurrentView] = useState<'classes' | 'activities'>('classes');
    const [activities, setActivities] = useState<Activity[]>([]);

    // --- Data Fetching --- //
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
            setDateRange([]);
            setScheduleData({});

            try {
                // 1. Fetch Groups filtered by campusId
                const groupsCollection = collection(db, 'groups');
                const qGroups = query(groupsCollection, where("campusId", "==", campusId.toUpperCase()));
                const groupsSnapshot = await getDocs(qGroups);
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
                    const groupIds = fetchedGroups.map(g => g.id);

                    // 2. Calculate Date Range
                     const arrivalDates = fetchedGroups.map(g => g.arrivalDate.toDate());
                     const departureDates = fetchedGroups.map(g => g.departureDate.toDate());

                     const validArrivalDates = arrivalDates.filter(d => d instanceof Date && !isNaN(d.getTime()));
                     const validDepartureDates = departureDates.filter(d => d instanceof Date && !isNaN(d.getTime()));

                     if (validArrivalDates.length === 0 || validDepartureDates.length === 0) {
                         // No valid dates found, maybe log groups for inspection
                         console.warn("No valid arrival or departure dates found in fetched groups:", fetchedGroups);
                        throw new Error("Could not determine date range: No valid arrival/departure dates found in group data.");
                     }

                     const earliestArrival = min(validArrivalDates);
                     const latestDeparture = max(validDepartureDates);

                     // Ensure min/max returned valid dates
                     if (!(earliestArrival instanceof Date) || isNaN(earliestArrival.getTime()) || 
                         !(latestDeparture instanceof Date) || isNaN(latestDeparture.getTime())) {
                         console.error("Invalid date calculation from min/max:", { earliestArrival, latestDeparture });
                         throw new Error("Could not determine date range due to invalid min/max date calculation.");
                     }

                     // Isolate range calculation
                     let calculatedDateRange: Date[] = [];
                     try {
                         const startDate = subDays(earliestArrival, 7);
                         const endDate = addDays(latestDeparture, 7);
                         
                         // Validate calculated start/end dates
                         if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
                            throw new Error("Invalid start/end date generated for range calculation.");
                         }

                         calculatedDateRange = eachDayOfInterval({ start: startDate, end: endDate });
                         setDateRange(calculatedDateRange);
                     } catch (dateCalcError) {
                         console.error("Error during date range calculation:", dateCalcError);
                         throw new Error(`Failed during date range interval generation: ${dateCalcError instanceof Error ? dateCalcError.message : String(dateCalcError)}`);
                     }
                    
                     // Ensure calculatedDateRange has dates before proceeding
                     if (calculatedDateRange.length === 0) {
                        console.warn("Date range calculation resulted in zero dates.", { earliestArrival, latestDeparture });
                        // Decide: treat as error or just show no schedule?
                        // throw new Error("Date range calculation resulted in zero dates."); 
                     }

                    // --- Ensure Activities are Fetched --- 
                    const activitiesCollection = collection(db, 'activities');
                    const activitySnapshot = await getDocs(activitiesCollection);
                     const fetchedActivities: Activity[] = activitySnapshot.docs.map(docSnap => ({
                         id: docSnap.id,
                         name: docSnap.data().name || 'Unnamed Activity',
                         location: docSnap.data().location,
                         type: docSnap.data().type === 'full-day' ? 'full-day' : 'half-day',
                     }));
                     setActivities(fetchedActivities); // Make sure state is updated
                     // ---

                    // 3. Fetch Schedule Data OPTIMIZED
                    const fetchedScheduleData: DailyScheduleData = {};
                    if (groupIds.length > 0 && calculatedDateRange.length > 0) {
                        const scheduleCollection = collection(db, 'dailySchedule');
                        const MAX_IN_QUERIES = 30; // Firestore 'in' query limit
                        const schedulePromises = [];

                        // Batch group IDs for 'in' queries
                        for (let i = 0; i < groupIds.length; i += MAX_IN_QUERIES) {
                            const groupIdsBatch = groupIds.slice(i, i + MAX_IN_QUERIES);
                            
                            // Query for schedules matching the batch of group IDs
                            // We fetch ALL schedules for these groups, filtering by date later
                            const qSchedule = query(scheduleCollection, where('groupId', 'in', groupIdsBatch));
                            schedulePromises.push(getDocs(qSchedule));
                        }

                        const scheduleSnapshots = await Promise.all(schedulePromises);

                        // Process all fetched schedule documents
                        for (const snapshot of scheduleSnapshots) {
                            snapshot.forEach(docSnap => {
                                        const data = docSnap.data();
                                // Ensure data has groupId and date, and date is a Timestamp
                                if (data.groupId && data.date instanceof Timestamp) {
                                    try {
                                        const scheduleDate = data.date.toDate();
                                        scheduleDate.setHours(0,0,0,0); // Normalize date for comparison
                                        const dateStr = format(scheduleDate, 'yyyy-MM-dd');
                                        const key = `${dateStr}_${data.groupId}`;

                                        // OPTIONAL: Further filter to only include dates within the calculatedDateRange
                                        // This check might be redundant if the range calculation is reliable,
                                        // but adds safety if schedules exist outside the group's primary stay.
                                        // const isWithinRange = calculatedDateRange.some(rangeDate => format(rangeDate, 'yyyy-MM-dd') === dateStr);
                                        // if (isWithinRange) {
                                             fetchedScheduleData[key] = {
                                            classStatus: data.classStatus || "None",
                                            activity: data.activity || "",
                                            secondaryInfo: data.secondaryInfo || ""
                                        };
                                        // }

                                    } catch(e) {
                                         console.error("Error processing schedule document date:", e, data);
                                    }
                                    } else {
                                     console.warn("Skipping schedule doc due to missing groupId or invalid date format:", docSnap.id, data);
                                }
                            });
                        }
                         // Fill missing days within range with default entries
                         if (calculatedDateRange.length > 0) {
                             calculatedDateRange.forEach(date => {
                                 const dateStr = format(date, 'yyyy-MM-dd');
                                 groupIds.forEach(groupId => {
                                     const key = `${dateStr}_${groupId}`;
                                     if (!fetchedScheduleData[key]) {
                                          // Check if this date is within the specific group's stay before adding default
                                          const group = fetchedGroups.find(g => g.id === groupId);
                                          if (group?.arrivalDate && group?.departureDate) {
                                              const arrival = group.arrivalDate.toDate();
                                              const departure = group.departureDate.toDate();
                                              arrival.setHours(0,0,0,0);
                                              departure.setHours(0,0,0,0);
                                              const currentDate = new Date(date);
                                              currentDate.setHours(0,0,0,0);
                                              if (currentDate >= arrival && currentDate <= departure) {
                                                   fetchedScheduleData[key] = { classStatus: "None", activity: "", secondaryInfo: "" };
                                              }
                                          }
                                     }
                                 });
                             });
                         }
                    }
                    setScheduleData(fetchedScheduleData);
                }

            } catch (err) {
                console.error("Error fetching data:", err);
                // Refined error setting
                const errorMessage = err instanceof Error ? err.message : String(err);
                setError(`Failed to load dashboard data: ${errorMessage}`);
                // Reset state on error
                setGroups([]);
                setDateRange([]);
                setScheduleData({});
            } finally {
                setIsLoading(false);
            }
        };

        fetchData();
    }, [campusId]); // Keep dependency array minimal

    // --- ADDED Effect for Calculating Total Hours --- //
    useEffect(() => {
        if (groups.length === 0 || Object.keys(scheduleData).length === 0) {
            setGroupTotalHours({}); // Reset if no groups or schedule data
            return;
        }

        const totals: GroupTotalHours = {};

        groups.forEach(group => {
            let hours = 0;
            if (!group.arrivalDate || !group.departureDate) {
                totals[group.id] = 0; // Cannot calculate without dates
                return; 
            }

            try {
                const arrival = group.arrivalDate.toDate();
                const departure = group.departureDate.toDate();
                arrival.setHours(0, 0, 0, 0);
                departure.setHours(0, 0, 0, 0);
                
                // Iterate only through the dates the group is actually present
                const groupStayDates = eachDayOfInterval({ start: arrival, end: departure });

                groupStayDates.forEach(date => {
                    const currentDateObj = new Date(date); // Use a new object to avoid mutation issues
                    currentDateObj.setHours(0, 0, 0, 0);
                    
                    // Skip arrival and departure days for hour calculation
                    if (currentDateObj.getTime() === arrival.getTime() || currentDateObj.getTime() === departure.getTime()) {
                        return;
                    }
                    
                    const dayOfWeek = currentDateObj.getDay();
                    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

                    if (!isWeekend) {
                        const dateStr = format(currentDateObj, 'yyyy-MM-dd');
                        const key = `${dateStr}_${group.id}`;
                        const entry = scheduleData[key];
                        const status = entry?.classStatus || 'None';

                        switch (status) {
                            case 'Morning':
                            case 'Afternoon':
                                hours += 3;
                                break;
                            case 'Double':
                                hours += 6;
                                break;
                            default: // None, Error, or undefined
                                break;
                        }
                    }
                });
                totals[group.id] = hours;
            } catch (e) {
                console.error(`Error calculating hours for group ${group.id}:`, e);
                totals[group.id] = 0; // Set to 0 on error
            }
        });

        setGroupTotalHours(totals);

    }, [groups, scheduleData]); // Recalculate when groups or schedule changes
    // --- End Total Hours Calculation Effect ---

    // Function to update schedule state locally for painting (ADDED Weekday Conflict Check)
    const updateLocalScheduleForPaint = (key: string, update: PaintedUpdateValue) => {
        setScheduleData(prev => {
            const existingEntry = prev[key] || { classStatus: "None", activity: "", secondaryInfo: "" };
            let updatedEntry: ScheduleEntry = { ...existingEntry };

            if (update.type === 'class') {
                updatedEntry.classStatus = update.value as ScheduleEntry['classStatus'];
            } else { // type === 'activity'
                const newActivityName = update.value as string;
                const [dateStr] = key.split('_'); 
                const dateObj = new Date(dateStr); 
                const dayOfWeek = dateObj.getDay();
                const isTargetWeekend = dayOfWeek === 0 || dayOfWeek === 6;
                
                let allowUpdate = true;
                const activityDetails = activities.find(act => act.name === newActivityName);

                if (isTargetWeekend) {
                    // --- Weekend Check --- 
                    if (newActivityName && (!activityDetails || activityDetails.type !== 'full-day')) {
                        allowUpdate = false;
                        console.warn(`Skipping local update: Cannot paint non-full-day activity '${newActivityName}' on weekend ${dateStr}`);
                    }
                } else {
                    // --- Weekday Check --- 
                    const currentStatus = existingEntry.classStatus;
                    if (activityDetails && activityDetails.type === 'full-day' && 
                        (currentStatus === 'Morning' || currentStatus === 'Afternoon')) 
                    {
                        allowUpdate = false;
                        console.warn(`Skipping local update: Cannot paint full-day activity '${newActivityName}' when class is '${currentStatus}' on ${dateStr}`);
                    }
                }

                if (allowUpdate) {
                    updatedEntry.activity = newActivityName;
                }
            }
            
            if (JSON.stringify(updatedEntry) !== JSON.stringify(existingEntry)) {
                 return { ...prev, [key]: updatedEntry };
            }
            return prev; 
        });
    };

    // --- Painting Event Handlers (Restored) ---
    const handleMouseDownOnCell = (date: Date, groupId: string) => {
        const key = `${format(date, 'yyyy-MM-dd')}_${groupId}`;
        let updateValue: PaintedUpdateValue | null = null;

        if (currentView === 'classes') {
            updateValue = { type: 'class', value: paintStatus };
        } else { // currentView === 'activities'
            updateValue = { type: 'activity', value: paintActivityName };
        }
        
        if (updateValue) {
             setIsPainting(true);
             setPaintedUpdates({ [key]: updateValue }); // Start new batch
             updateLocalScheduleForPaint(key, updateValue);
        }
    };

    const handleMouseEnterOnCell = (date: Date, groupId: string) => {
        if (!isPainting) return;
        const key = `${format(date, 'yyyy-MM-dd')}_${groupId}`;
        let updateValue: PaintedUpdateValue | null = null;

        if (currentView === 'classes') {
            updateValue = { type: 'class', value: paintStatus };
        } else { // currentView === 'activities'
            updateValue = { type: 'activity', value: paintActivityName };
        }

        // Only update if the value is different or cell not yet painted in this batch
        if (updateValue && (!paintedUpdates[key] || JSON.stringify(paintedUpdates[key]) !== JSON.stringify(updateValue))) {
             setPaintedUpdates(prev => ({ ...prev, [key]: updateValue as PaintedUpdateValue })); // Add to batch
             updateLocalScheduleForPaint(key, updateValue);
        }
    };

    const handleMouseUp = () => {
        if (!isPainting) return;
        setIsPainting(false);
        handleBatchSave(); // Trigger save
    };

    // Prevent default drag behavior on the table to avoid text selection interfering with painting
    const preventDefaultDrag = (e: React.MouseEvent) => {
        e.preventDefault();
    };
    // ---

    // --- Batch Save for Painting (ADDED Weekday Conflict Check) ---
    const handleBatchSave = async () => {
        // ... (initial checks for paintedUpdates, db connection) ...
        if (Object.keys(paintedUpdates).length === 0 || !db) {
            setPaintedUpdates({}); 
            setIsPainting(false);
            if (!db) setError("Database not connected for batch save.");
            return;
         }

        console.log("Starting batch save with Weekend & Weekday constraints:", paintedUpdates);
        const batch = writeBatch(db);
        let count = 0;

        // Use a stable copy of scheduleData for checks within the loop
        const scheduleDataAtSaveStart = { ...scheduleData }; 

        for (const key in paintedUpdates) {
             try {
                 const update = paintedUpdates[key];
                 const [dateStr, groupId] = key.split('_');
                 // ... (key validation) ...
                 const dateParts = dateStr.split('-').map(Number);
                 if (dateParts.length !== 3 || dateParts.some(isNaN) || !groupId) {
                     console.warn(`Skipping invalid key: ${key}`); continue; 
                 }
                 const dateObj = new Date(Date.UTC(dateParts[0], dateParts[1] - 1, dateParts[2]));
                 if (isNaN(dateObj.getTime())) {
                      console.warn(`Skipping invalid date: ${dateStr}`); continue; 
                 }
                const dayOfWeek = dateObj.getUTCDay(); 
                const isTargetWeekend = dayOfWeek === 0 || dayOfWeek === 6;

                 const docRef = doc(db, 'dailySchedule', key);
                 let dataToSave: Partial<ScheduleEntry & { groupId: string; date: Timestamp }> = {
                     groupId: groupId,
                     date: Timestamp.fromDate(dateObj)
                 };

                 if (update.type === 'class') {
                     dataToSave.classStatus = update.value as ScheduleEntry['classStatus'];
                 } else { // type === 'activity'
                     const activityNameToSave = update.value as string;
                     const activityDetails = activities.find(act => act.name === activityNameToSave);
                     let allowSave = true;

                     if (isTargetWeekend) {
                         // --- Weekend Constraint Check --- 
                         if (activityNameToSave && (!activityDetails || activityDetails.type !== 'full-day')) {
                             allowSave = false;
                             console.warn(`Save Check: Skipping non-full-day activity '${activityNameToSave}' on weekend ${dateStr}`);
                         }
                     } else {
                         // --- Weekday Constraint Check ---
                         const currentStatus = scheduleDataAtSaveStart[key]?.classStatus || 'None'; // Use state at save start
                         if (activityDetails && activityDetails.type === 'full-day' && 
                             (currentStatus === 'Morning' || currentStatus === 'Afternoon')) 
                         {
                             allowSave = false;
                             console.warn(`Save Check: Skipping full-day activity '${activityNameToSave}' when class is '${currentStatus}' on ${dateStr}`);
                         }
                     }
                     // --- End Checks ---

                     if (allowSave) {
                        dataToSave.activity = activityNameToSave;
                     } else {
                         continue; // Skip adding this update to the batch
                     }
                 }

                 batch.set(docRef, dataToSave, { merge: true });
                 count++;
             } catch (parseError) {
                  console.error(`Error processing key ${key} during batch save:`, parseError);
             }
        }

        // ... (commit batch and final error/state handling) ...
         if (count === 0) {
             console.log("No valid cells to save in batch after key processing.");
             setPaintedUpdates({});
             setIsPainting(false);
             return;
         }
         try {
             await batch.commit();
             console.log(`Batch save successful for ${count} cells.`);
             if (error && error.includes("batch save")) setError(null);
         } catch (err) {
             console.error("Error committing batch save:", err);
             setError(`Failed during batch save: ${err instanceof Error ? err.message : String(err)}`);
         } finally {
             setPaintedUpdates({});
             setIsPainting(false);
          }
    };
    // ---

    // Calculate sorted groups - always sorted by arrival date
    const sortedGroups = useMemo(() => {
        // Apply sorting directly
        return [...groups].sort((a, b) => {
             // Add checks for valid dates before sorting
            const timeA = a.arrivalDate?.toDate()?.getTime();
            const timeB = b.arrivalDate?.toDate()?.getTime();
            if (timeA == null && timeB == null) return 0; // Both invalid/missing, treat as equal
            if (timeA == null) return 1; // Put nulls/invalid dates last
            if (timeB == null) return -1; // Put nulls/invalid dates last
            return timeA - timeB;
        });
    }, [groups]); // Dependency is only groups now

    // --- Auto Schedule Helper: Get ISO Week Number --- 
    const getISOWeek = (date: Date): number => {
        const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
        const dayNum = d.getUTCDay() || 7; // Make Sunday 7
        d.setUTCDate(d.getUTCDate() + 4 - dayNum);
        const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
        // Calculate full weeks to nearest Thursday
        return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
    };

    // --- Auto Schedule Core Function (REVISED w/ 60/40 Balance) --- 
    const generateAutoSchedule = (): DailyScheduleData => {
        console.log("generateAutoSchedule called with weekly focus & 60/40 balance");
        const newSchedule: DailyScheduleData = { ...scheduleData }; 
        const weeklyFocus: { [groupId: string]: { [weekNum: number]: 'AM' | 'PM' } } = {};

        if (groups.length === 0 || dateRange.length === 0) {
            console.warn("Auto Schedule: No groups or date range available.");
            return {}; // Return empty if no data to process
        }

        // --- 1. Assign Weekly Focus (Simple Alternation) ---
        groups.forEach(group => {
            if (!group.arrivalDate || !group.departureDate) return;
            weeklyFocus[group.id] = {};
            const arrival = group.arrivalDate.toDate();
            const departure = group.departureDate.toDate();
            const groupStayDates = eachDayOfInterval({ start: arrival, end: departure });
            let firstWeekNum = -1;
            let weekParity = 0; 
            groupStayDates.forEach(date => {
                const weekNum = getISOWeek(date);
                if (!(weekNum in weeklyFocus[group.id])) {
                    if (firstWeekNum === -1) {
                         firstWeekNum = weekNum;
                         weeklyFocus[group.id][weekNum] = (weekParity % 2 === 0) ? 'AM' : 'PM';
                    } else {
                        weekParity++; 
                         weeklyFocus[group.id][weekNum] = (weekParity % 2 === 0) ? 'AM' : 'PM';
                    }
                }
            });
        });
        // console.log("Assigned Weekly Focus:", weeklyFocus);

        // --- 2. Daily Assignment Iterating DAY BY DAY --- 
        // TODO: Implement target hours calculation

        dateRange.forEach(date => {
            const dateStr = format(date, 'yyyy-MM-dd');
            const dayOfWeek = date.getDay();
            const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

            if (isWeekend) return; // Skip weekends

            // --- Daily Setup ---
            let dailyAmStudents = 0;
            let dailyPmStudents = 0;
            let totalStudentsToday = 0;
            const groupsPresentToday: Group[] = [];

            groups.forEach(group => {
                if (!group.arrivalDate || !group.departureDate) return;
                const arrival = group.arrivalDate.toDate();
                const departure = group.departureDate.toDate();
                arrival.setHours(0,0,0,0);
                departure.setHours(0,0,0,0);
                const currentDate = new Date(date); // Use copy
                currentDate.setHours(0,0,0,0);

                // Check if group is present and it's not arrival/departure day
                if (currentDate > arrival && currentDate < departure) {
                     groupsPresentToday.push(group);
                     totalStudentsToday += group.studentCount || 0;
                 }
            });

            if (groupsPresentToday.length === 0) return; // Skip day if no groups are schedulable

            const maxStudentsPerSession = Math.floor(totalStudentsToday * 0.6);
             // console.log(`${dateStr}: Total Students=${totalStudentsToday}, Max per session=${maxStudentsPerSession}`);

            // --- Assign Groups for the Day ---
            // TODO: Potentially sort groupsPresentToday (e.g., by how far behind target hours they are)
            groupsPresentToday.forEach(group => {
                const key = `${dateStr}_${group.id}`;
                const weekNum = getISOWeek(date);
                const focus = weeklyFocus[group.id]?.[weekNum] || 'AM'; // Default to AM
                const studentCount = group.studentCount || 0;
                let assignedStatus: ScheduleEntry['classStatus'] = "None";
                
                if (focus === 'AM') {
                    if (dailyAmStudents + studentCount <= maxStudentsPerSession) {
                        assignedStatus = 'Morning';
                        dailyAmStudents += studentCount;
                    } else {
                        // Cannot assign AM due to balance
                        // TODO: Could potentially try PM if target hours are low?
                    }
                } else { // focus === 'PM'
                    if (dailyPmStudents + studentCount <= maxStudentsPerSession) {
                        assignedStatus = 'Afternoon';
                        dailyPmStudents += studentCount;
                    } else {
                         // Cannot assign PM due to balance
                         // TODO: Could potentially try AM if target hours are low?
                    }
                }

                // TODO: Add target hours check here. Potentially upgrade to "Double" if BOTH sides have space?
                // If assignedStatus is still "None" after checks, maybe force assignment if way behind target?

                // Update the newSchedule object, preserving activity
                newSchedule[key] = {
                    ...(newSchedule[key] || { activity: "" }), // Keep existing activity
                    classStatus: assignedStatus
                };
            });
             // console.log(`${dateStr}: Final AM=${dailyAmStudents}, PM=${dailyPmStudents}`);
        });

        console.log("Generated schedule with weekly focus & 60/40 balance:", newSchedule);
        return newSchedule;
    };

    // --- Auto Schedule Click Handler (No changes needed here) --- 
    const handleAutoScheduleClick = async () => {
        if (isAutoScheduling) return;
        setIsAutoScheduling(true);
        setError(null); // Clear previous errors
        console.log("Auto Schedule Clicked");

        try {
            // 1. Generate the new schedule (using placeholder for now)
            const newScheduleData = generateAutoSchedule();
            
            if (Object.keys(newScheduleData).length === 0) {
                throw new Error("Auto-schedule generation resulted in an empty schedule.");
            }

            // 2. Prepare Batch Write for Firestore
            if (!db) {
                throw new Error("Database connection is not available.");
            }
            const batch = writeBatch(db);
            let saveCount = 0;

            for (const key in newScheduleData) {
                const entry = newScheduleData[key];
                const [dateStr, groupId] = key.split('_');
                if (!dateStr || !groupId) continue;

                 // Basic validation and date object creation (like in handleBatchSave)
                const dateParts = dateStr.split('-').map(Number);
                 if (dateParts.length !== 3 || dateParts.some(isNaN)) { continue; }
                 const dateObj = new Date(Date.UTC(dateParts[0], dateParts[1] - 1, dateParts[2]));
                 if (isNaN(dateObj.getTime())) { continue; }

                const docRef = doc(db, 'dailySchedule', key);
                // IMPORTANT: Only merge classStatus, preserve other fields (like activity)
                 const dataToSave = {
                     classStatus: entry.classStatus || "None", // Ensure we save None if undefined
                     groupId: groupId,
                     date: Timestamp.fromDate(dateObj)
                 };
                batch.set(docRef, dataToSave, { merge: true }); 
                saveCount++;
            }

            if (saveCount === 0) {
                 console.log("No valid schedule entries generated to save.");
             } else {
                console.log(`Attempting to save ${saveCount} auto-scheduled entries...`);
                await batch.commit();
                console.log("Auto Schedule batch save successful!");
             }

            // 3. Update Local State AFTER successful save (or immediately for feedback)
            // Let's update immediately for feedback
            setScheduleData(prev => ({ ...prev, ...newScheduleData })); // Merge generated schedule into existing
            
            // Optional: Show success message to user

        } catch (err) {
            console.error("Error during Auto Schedule:", err);
            setError(`Auto Schedule failed: ${err instanceof Error ? err.message : String(err)}`);
            // Optional: Revert local state if needed? Depends on desired behavior.
        } finally {
            setIsAutoScheduling(false);
            console.log("Auto Schedule Finished.");
        }
    };
    // ---

    // --- Orientation Assignment Logic --- 
    const findOrientationSlots = (): { [key: string]: { activity: string } } => {
        const updates: { [key: string]: { activity: string } } = {};
        console.log("Finding orientation slots...");

        groups.forEach(group => {
            if (!group.arrivalDate || !group.departureDate) {
                console.warn(`Skipping group ${group.id}: Missing arrival/departure date.`);
                return;
            }
            
            try {
                let currentDate = group.arrivalDate.toDate();
                const departure = group.departureDate.toDate();
                currentDate.setHours(0,0,0,0);
                departure.setHours(0,0,0,0);

                // Start checking from the day AFTER arrival
                currentDate = addDays(currentDate, 1); 

                while (currentDate <= departure) {
                    const dayOfWeek = currentDate.getDay();
                    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
                    
                    if (!isWeekend) {
                        // Found the first valid weekday
                        const dateStr = format(currentDate, 'yyyy-MM-dd');
                        const key = `${dateStr}_${group.id}`;
                        console.log(`Assigning Orientation to ${group.groupName} (${group.id}) on ${dateStr}`);
                        updates[key] = { activity: "Orientation" };
                        break; // Stop searching for this group
                    }
                    // Move to the next day
                    currentDate = addDays(currentDate, 1);
                }
            } catch (e) {
                 console.error(`Error finding orientation slot for group ${group.id}:`, e);
             }
        });
        console.log("Orientation slots found:", updates);
        return updates;
    };

    const handleAssignOrientationClick = async () => {
        if (isAssigningOrientations) return;
        setIsAssigningOrientations(true);
        setError(null);
        console.log("Assign Orientations Clicked");

        try {
            const updatesToSave = findOrientationSlots();

            if (Object.keys(updatesToSave).length === 0) {
                console.log("No valid orientation slots found to update.");
                 // Maybe show a message to the user?
                 setIsAssigningOrientations(false);
                return;
            }

            if (!db) throw new Error("Database connection not available.");

            const batch = writeBatch(db);
            let saveCount = 0;
            const localUpdates: DailyScheduleData = {}; // For updating local state

            for (const key in updatesToSave) {
                const updateData = updatesToSave[key];
                const [dateStr, groupId] = key.split('_');
                if (!dateStr || !groupId) continue;

                const dateParts = dateStr.split('-').map(Number);
                 if (dateParts.length !== 3 || dateParts.some(isNaN)) { continue; }
                 const dateObj = new Date(Date.UTC(dateParts[0], dateParts[1] - 1, dateParts[2]));
                 if (isNaN(dateObj.getTime())) { continue; }

                const docRef = doc(db, 'dailySchedule', key);
                const dataToSave = {
                    groupId: groupId,
                    date: Timestamp.fromDate(dateObj),
                    activity: updateData.activity // Set/overwrite activity
                };
                batch.set(docRef, dataToSave, { merge: true });
                saveCount++;
                
                // Prepare local state update (preserve existing classStatus)
                localUpdates[key] = {
                     ...(scheduleData[key] || { classStatus: "None" }), // Keep existing status or default
                     activity: updateData.activity
                 };
            }

            if (saveCount > 0) {
                 console.log(`Attempting to save ${saveCount} orientation assignments...`);
                await batch.commit();
                console.log("Orientation assignment batch save successful!");

                // Update local state
                setScheduleData(prev => ({ ...prev, ...localUpdates }));
             } else {
                 console.log("No valid orientation entries generated to save.");
             }

        } catch (err) {
            console.error("Error during Orientation Assignment:", err);
            setError(`Orientation Assignment failed: ${err instanceof Error ? err.message : String(err)}`);
        } finally {
            setIsAssigningOrientations(false);
            console.log("Orientation Assignment Finished.");
        }
    };
    // ---

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

    // --- Styling moved back to Dashboard component scope ---
    const studentCountColWidth = '50px';
    const dateColWidth = '60px';
    // Calculate explicit offsets for clarity
    const leftOffset1 = dateColWidth;
    const leftOffset2 = `calc(${dateColWidth} + ${studentCountColWidth})`;
    const leftOffset3 = `calc(${dateColWidth} + 2 * ${studentCountColWidth})`;

    const tdBaseStyle: React.CSSProperties = {
        border: '1px solid #ddd',
        padding: '0',
        textAlign: 'center',
        height: '38px',
        verticalAlign: 'top',
         overflow: 'hidden',
    };
    const outsideRangeStyle: React.CSSProperties = { ...tdBaseStyle, backgroundColor: '#eeeeee', cursor: 'not-allowed' };
    const classStatusColors: { [key: string]: string } = {
        "Morning": '#fffacd', // LemonChiffon
        "Afternoon": '#add8e6', // LightBlue
        "Double": '#ffb6c1', // LightPink
        "None": '#ffffff', // White (or transparent)
        "Error": '#ffcccb', // Light Red for errors
        "Default": '#ffffff' // Fallback
    };
    const classOnlyCellStyle: React.CSSProperties = {
        ...tdBaseStyle,
        fontWeight: 'bold',
        fontSize: '12px',
        userSelect: 'none',
        verticalAlign: 'middle'
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
     const clientHeaderHeight = '25px'; // Define height for the client row

    // Define Header Row Heights
    const groupHeaderHeight = '30px'; // Give group name slightly more space
    const totalHoursHeaderHeight = '25px'; 

    // Base style for TH
    const thStyleBase: React.CSSProperties = {
        border: '1px solid #ddd',
        padding: '2px 4px',
        textAlign: 'center',
        backgroundColor: '#f0f0f0',
        fontWeight: '600',
        position: 'sticky',
        zIndex: 10,
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
    };

    // --- REVISED Order & Positioning ---
    // Total Hours Row Headers (NEW TOP ROW: top: 0)
    const thTotalHoursStyle: React.CSSProperties = {
        ...thStyleBase,
        top: `0px`, // NEW Position: Very top
        height: totalHoursHeaderHeight,
        backgroundColor: '#e0e0e0', 
        fontSize: '11px', 
        fontWeight: 'normal',
    };
    const thTotalHoursRowSpannedStyle: React.CSSProperties = { 
        ...thTotalHoursStyle,
        left: 0,
        zIndex: 16,
    };

    // Client Row Headers (NEW MIDDLE ROW: top: totalHoursHeaderHeight)
    const thClientStyle: React.CSSProperties = {
        ...thStyleBase,
        top: totalHoursHeaderHeight, // NEW Position: Below total hours
        height: clientHeaderHeight,
        fontStyle: 'italic',
        fontWeight: 'normal',
        // backgroundColor applied dynamically
    };
    const thTopLeftSpannedStyle: React.CSSProperties = { // Spanned cell for Client Row
        ...thStyleBase,
        top: totalHoursHeaderHeight, // NEW Position: Below total hours
        height: clientHeaderHeight,
        left: 0,
        zIndex: 16, 
        backgroundColor: '#f0f0f0', 
    };
    
    // Group Row Headers (NEW BOTTOM ROW: top: calc(totalHours + client) )
    const thGroupStyle: React.CSSProperties = {
        ...thStyleBase,
        top: `calc(${totalHoursHeaderHeight} + ${clientHeaderHeight})`, // NEW Position: Below client row
        height: groupHeaderHeight, 
    };
    const dateHeaderStyle: React.CSSProperties = {
       ...thStyleBase,
       top: `calc(${totalHoursHeaderHeight} + ${clientHeaderHeight})`, // NEW Position: Below client row
       height: groupHeaderHeight,
       width: dateColWidth,
       left: '0px',
       zIndex: 15, 
    };
    const thStudentCountStyle: React.CSSProperties = {
        ...thStyleBase,
        top: `calc(${totalHoursHeaderHeight} + ${clientHeaderHeight})`, // NEW Position: Below client row
        height: groupHeaderHeight, 
        width: studentCountColWidth,
        backgroundColor: '#e9ecef',
        zIndex: 14, 
    };
    // --- End REVISED Positioning ---
    
    // --- Other Styles (Restoring definitions) ---
    const dateCellStyle: React.CSSProperties = {
         ...tdBaseStyle,
         width: dateColWidth,
         padding: '2px',
         backgroundColor: '#f8f8f8',
         fontWeight: 'bold',
         textAlign: 'center',
         verticalAlign: 'middle',
         whiteSpace: 'nowrap',
         position: 'sticky',
         left: '0px',
         zIndex: 5
     };
     const tdStudentCountStyle: React.CSSProperties = { // For table body cells
          ...tdBaseStyle,
          width: studentCountColWidth,
          backgroundColor: '#f8f8f8',
          textAlign: 'center',
          verticalAlign: 'middle',
          fontWeight: 'bold',
          position: 'sticky',
          zIndex: 4
     };
    const headerLinkStyle: React.CSSProperties = {
        textDecoration: 'none',
        color: 'inherit',
        display: 'block',
        height: '100%',
        width: '100%'
    };
       const tableStyle: React.CSSProperties = {
           borderCollapse: 'collapse',
           width: '100%',
           tableLayout: 'fixed',
           fontSize: '10px',
       };
    // --- End Other Styles ---

    // --- Main Render --- //
    return (
        <div>
            <ScheduleToolbar
                campusId={campusId}
                paintStatus={paintStatus}
                onPaintStatusChange={setPaintStatus}
                currentView={currentView}
                onViewChange={setCurrentView}
                activitiesList={activities}
                paintActivityName={paintActivityName}
                onPaintActivityNameChange={setPaintActivityName}
                onAutoScheduleClick={handleAutoScheduleClick}
                isAutoScheduling={isAutoScheduling}
                onAssignOrientationClick={handleAssignOrientationClick}
                isAssigningOrientations={isAssigningOrientations}
            />
            <div style={{
                 width: '100%',
                 marginTop: '60px', // Account for both navbars
                 // Set height for the scrollable area
                 height: `calc(100vh - 60px)`,
                 display: 'flex',
                 flexDirection: 'column'
             }}>
                {!isLoading && !error && sortedGroups.length > 0 && dateRange.length > 0 && (
                    <div
                        style={{ height: '100%', overflowX: 'auto', overflowY: 'auto' }}
                        onMouseUp={handleMouseUp}
                        onMouseLeave={handleMouseUp}
                        onDragStart={preventDefaultDrag}
                    >
                         <table style={tableStyle}>
                             <colgroup>
                                <col style={{ width: dateColWidth }} />
                                <col style={{ width: studentCountColWidth }} />
                                <col style={{ width: studentCountColWidth }} />
                                <col style={{ width: studentCountColWidth }} />
                                {sortedGroups.map(group => ( <col key={group.id} style={{ minWidth: '100px' }} /> ))}
                             </colgroup>
                             <thead>
                                {/* --- Total Hours Row (MOVED TO TOP) --- */}
                                <tr>
                                    <th colSpan={4} style={thTotalHoursRowSpannedStyle}>Total Class Hours</th> 
                                    {sortedGroups.map(group => (
                                        <th key={`${group.id}-hours`} style={thTotalHoursStyle}>
                                            {groupTotalHours[group.id] ?? 'N/A'} hrs
                                        </th>
                                    ))}
                                </tr>
                                {/* --- Client Row (NOW MIDDLE) --- */}
                                <tr>
                                    <th colSpan={4} style={thTopLeftSpannedStyle}>&nbsp;</th> 
                                    {sortedGroups.map(group => (
                                         <th 
                                            key={`${group.id}-client`}
                                            style={{ ...thClientStyle, backgroundColor: stringToHslColor(group.Client || 'Unknown', 75, 85) }}
                                            title={group.Client}
                                        >
                                            {group.Client}
                                        </th>
                                    ))}
                                </tr>
                                {/* --- Group Name Row (NOW BOTTOM) --- */}
                                <tr>
                                    {/* Keep individual Date/AM/PM/Unassigned headers using their styles */}
                                     <th style={dateHeaderStyle}>Date</th>
                                    <th style={{ ...thStudentCountStyle, left: leftOffset1 }}>AM</th>
                                    <th style={{ ...thStudentCountStyle, left: leftOffset2 }}>PM</th>
                                    <th style={{ ...thStudentCountStyle, left: leftOffset3 }}>Unassigned</th>
                                     {sortedGroups.map(group => (
                                        <th key={group.id} style={thGroupStyle} title={`Go to schedule for ${group.groupName}`}>
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
                                     const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
                                    const currentDateObj = new Date(date); currentDateObj.setHours(0,0,0,0);

                                    // --- Calculate Student Counts for this Date --- 
                                    let amStudents = 0;
                                    let pmStudents = 0;
                                    let unassignedStudents = 0;

                                    sortedGroups.forEach(group => {
                                        // Check if group is present on this date
                                        let arrivalDateObj: Date | null = null; let departureDateObj: Date | null = null;
                                        let isDateValid = false;
                                        try {
                                            if (group.arrivalDate?.toDate) { arrivalDateObj = group.arrivalDate.toDate(); arrivalDateObj.setHours(0,0,0,0); }
                                            if (group.departureDate?.toDate) { departureDateObj = group.departureDate.toDate(); departureDateObj.setHours(0,0,0,0); }
                                            isDateValid = arrivalDateObj instanceof Date && !isNaN(arrivalDateObj.getTime()) && departureDateObj instanceof Date && !isNaN(departureDateObj.getTime());
                                        } catch (e) { console.error("Err dates calc:", e, group); }
                                        const isOutsideRange = !isDateValid || currentDateObj < (arrivalDateObj as Date) || currentDateObj > (departureDateObj as Date);

                                        if (!isOutsideRange) {
                                            const key = `${dateStr}_${group.id}`;
                                            const entry = scheduleData[key];
                                            const studentCount = group.studentCount || 0;
                                            const status = entry?.classStatus || 'None';

                                            switch(status) {
                                                case 'Morning':
                                                    amStudents += studentCount;
                                                    break;
                                                case 'Afternoon':
                                                    pmStudents += studentCount;
                                                    break;
                                                case 'Double':
                                                    amStudents += studentCount;
                                                    pmStudents += studentCount;
                                                    break;
                                                case 'None':
                                                default: // Catches None, Error, undefined
                                                    unassignedStudents += studentCount;
                                                    break;
                                            }
                                        }
                                    });
                                    // --- End Calculation ---

                                     return (
                                         <tr key={dateStr} style={rowStyle}>
                                           <td style={dateCellStyle}>{String(date.getDate()).padStart(2, '0')}-{monthNames[date.getMonth()]}</td>
                                           <td style={{ ...tdStudentCountStyle, left: leftOffset1 }}>{amStudents}</td>
                                           <td style={{ ...tdStudentCountStyle, left: leftOffset2 }}>{pmStudents}</td>
                                           <td style={{ ...tdStudentCountStyle, left: leftOffset3 }}>{unassignedStudents}</td>
                                             {sortedGroups.map(group => {
                                                 const key = `${dateStr}_${group.id}`;
                                                 const entry = scheduleData[key];
                                               let arrivalDateStrForGroup = ''; let departureDateStrForGroup = '';
                                               let arrivalDateObj: Date | null = null; let departureDateObj: Date | null = null;
                                                 let isDateValid = false;
                                                 try {
                                                   if (group.arrivalDate?.toDate) { arrivalDateObj = group.arrivalDate.toDate(); arrivalDateObj.setHours(0,0,0,0); arrivalDateStrForGroup = format(arrivalDateObj, 'yyyy-MM-dd'); }
                                                   if (group.departureDate?.toDate) { departureDateObj = group.departureDate.toDate(); departureDateObj.setHours(0,0,0,0); departureDateStrForGroup = format(departureDateObj, 'yyyy-MM-dd'); }
                                                   isDateValid = arrivalDateObj instanceof Date && !isNaN(arrivalDateObj.getTime()) && departureDateObj instanceof Date && !isNaN(departureDateObj.getTime());
                                               } catch (e) { console.error("Err dates:", e, group); }
                                                 const isArrivalDay = isDateValid && dateStr === arrivalDateStrForGroup;
                                                 const isDepartureDay = isDateValid && dateStr === departureDateStrForGroup;
                                                 const isOutsideRange = !isDateValid || currentDateObj < (arrivalDateObj as Date) || currentDateObj > (departureDateObj as Date);
                                               const dayOfWeek = currentDateObj.getDay();
                                                 const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

                                               let cellContent: React.ReactNode;
                                                 let currentCellStyle = scheduleCellStyle;
                                               let cellTitle = '';
                                                 let cellClassName = "schedule-cell";
                                               let canPaint = false; // Default to false

                                                 if (isArrivalDay) {
                                                     cellContent = <div style={{ fontWeight: 'bold', color: 'green' }}>Arrival</div>;
                                                   currentCellStyle = { ...tdBaseStyle, backgroundColor: '#e6ffed', cursor: 'default', verticalAlign: 'middle' };
                                                   cellClassName = ""; cellTitle = `${group.groupName} - Arrival`;
                                                   canPaint = false; // Cannot paint on arrival/departure
                                                 } else if (isDepartureDay) {
                                                     cellContent = <div style={{ fontWeight: 'bold', color: 'red' }}>Departure</div>;
                                                   currentCellStyle = { ...tdBaseStyle, backgroundColor: '#ffeeed', cursor: 'default', verticalAlign: 'middle' };
                                                   cellClassName = ""; cellTitle = `${group.groupName} - Departure`;
                                                   canPaint = false; // Cannot paint on arrival/departure
                                               } else if (isOutsideRange) {
                                                   cellContent = <div style={{ color: '#bbb' }}>-</div>;
                                                   currentCellStyle = { ...outsideRangeStyle, cursor: 'default', verticalAlign: 'middle' };
                                                   cellClassName = ""; cellTitle = "Outside group stay";
                                                   canPaint = false;
                                               } else if (isWeekend) {
                                                   const activity = entry?.activity || '-'; // Get activity for display
                                                   // Weekend logic: display activity, allow painting only in activity view
                                                     if (currentView === 'activities') {
                                                       canPaint = true; // Enable painting on weekends in Activities view
                                                       cellContent = activity === '-' ? <div style={{ fontStyle: 'italic', color: '#888' }}>Weekend</div> : <div>{activity}</div>;
                                                       currentCellStyle = { ...tdBaseStyle, backgroundColor: '#f8f8f8', cursor: 'pointer', verticalAlign: 'middle' }; // Light gray, centered, paintable
                                                       cellTitle = `Weekend. Activity: ${activity}. Click and drag to paint FULL DAY activity.`;
                                                       cellClassName = "schedule-cell";
                                                     } else {
                                                       // Weekend display in Class view (not paintable)
                                                            cellContent = <div style={{ fontStyle: 'italic', color: '#888' }}>Weekend</div>;
                                                       currentCellStyle = { ...outsideRangeStyle, cursor: 'default', verticalAlign: 'middle' }; // Use non-paintable style
                                                            cellClassName = "";
                                                            cellTitle = "No classes on weekend";
                                                   }
                                                         } else {
                                                   // --- Weekday within range ---
                                                   canPaint = true; // Enable painting for weekdays in either view
                                                             const status = entry?.classStatus || 'None';
                                                   const activity = entry?.activity || '-'; 

                                                   if (currentView === 'classes') {
                                                       // Class view rendering 
                                                             const displayText = status === "None" ? '-' : status;
                                                       cellContent = displayText;
                                                             currentCellStyle = { ...classOnlyCellStyle, backgroundColor: classStatusColors[status || 'Default'] };
                                                       cellTitle = `Class: ${status}. Click and drag to paint.`;

                                                   } else { // currentView === 'activities'
                                                       // --- Activities View ---
                                                       // NOTE: status and activity are already defined above

                                                       // --- Special case for Double Class ---
                                                       if (status === "Double") {
                                                           cellContent = "Double Class";
                                                           currentCellStyle = { 
                                                               ...classOnlyCellStyle, 
                                                               backgroundColor: classStatusColors["Double"], 
                                                               verticalAlign: 'middle'
                                                           }; 
                                                           cellTitle = `Class: Double. Activity: ${activity}. Click and drag to paint activity.`; 
                                                       } else {
                                                           // --- Original two-pane display (with Afternoon swap) ---
                                                           
                                                           // Define the Class Status Div (with color & centering)
                                                           const classStatusDiv = (
                                                               <div style={{
                                                                   fontSize: '10px', fontWeight: 'bold', color: '#333', 
                                                                   borderBottom: status !== 'Afternoon' ? '1px dotted #ccc' : 'none', 
                                                                   borderTop: status === 'Afternoon' ? '1px dotted #ccc' : 'none', 
                                                                   padding: '2px 4px', 
                                                                   overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                                                   backgroundColor: classStatusColors[status || 'Default'],
                                                                   display: 'flex', 
                                                                   alignItems: 'center', 
                                                                   justifyContent: 'center',
                                                                   flexGrow: 1
                                                               }} title={`Class: ${status}`}>{status !== "None" ? `Class: ${status}` : <span style={{ color: '#bbb' }}>-</span>}</div>
                                                           );

                                                           // Define the Activity Div (with centering)
                                                           const activityDiv = (
                                                               <div style={{
                                                                   fontSize: '11px', color: '#555', overflow: 'hidden', textOverflow: 'ellipsis',
                                                                   whiteSpace: 'nowrap', flexGrow: 1, padding: '2px 4px',
                                                                   display: 'flex', 
                                                                   alignItems: 'center', 
                                                                   justifyContent: 'center'
                                                               }} title={`Activity: ${activity === '-' ? 'None' : activity}. Click and drag to paint activity.`}>{activity}</div>
                                                           );

                                                           // Conditionally order the divs
                                                           cellContent = (
                                                               <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', height: '100%', padding: '0', boxSizing: 'border-box', textAlign: 'center' }}>
                                                                   {status === "Afternoon" ? (
                                                                       <>
                                                                           {activityDiv}
                                                                           {classStatusDiv}
                                                                       </>
                                                                   ) : (
                                                                       <>
                                                                           {classStatusDiv}
                                                                           {activityDiv}
                                                                       </>
                                                                   )}
                                                               </div>
                                                           );
                                                           currentCellStyle = { ...scheduleCellStyle, backgroundColor: '#ffffff', padding: '0' };
                                                           cellTitle = `Class: ${status}, Activity: ${activity}. Click and drag to paint activity.`;
                                                       }
                                                   } // End of else for currentView === 'activities'
                                               } // End of else for Weekday

                                               // --- Render the cell --- 
                                                 return (
                                                   <td
                                                       key={key}
                                                       style={currentCellStyle}
                                                       className={canPaint ? cellClassName : ""}
                                                       title={cellTitle}
                                                       onMouseDown={canPaint ? () => handleMouseDownOnCell(date, group.id) : undefined}
                                                       onMouseEnter={canPaint ? () => handleMouseEnterOnCell(date, group.id) : undefined}
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
                 )}
             </div>
        </div>
    );
};

export default Dashboard;
