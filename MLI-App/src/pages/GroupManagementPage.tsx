import React, { useState, ChangeEvent, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom'; // Import Link
import Papa from 'papaparse'; // CSV Parsing library
import { collection, addDoc, Timestamp, getDocs, DocumentData, QueryDocumentSnapshot } from 'firebase/firestore';
// Make sure this path is correct for your project structure
import { db } from '../firebase'; // Import your Firestore db instance

// Define the expected structure of a CSV row after parsing
// Adjust based on your *exact* CSV column headers
interface CsvGroupRow {
    GroupName: string;
    ArrivalDate: string; // Expect 'YYYY-MM-DD'
    DepartureDate: string; // Expect 'YYYY-MM-DD'
    Client?: string; // Added Client field
    ArrivalTime?: string; // Expect 'HH:MM' (optional)
    DepartureTime?: string; // Expect 'HH:MM' (optional)
    ArrivalLocation?: string; // (optional)
    DepartureLocation?: string; // (optional)
    Students?: string; // Expect number as string
    Leaders?: string; // Expect number as string
    Notes?: string; // (optional)
    // Add other fields from your CSV as needed
}

// Define the structure to be saved in Firestore
interface FirestoreGroupData {
    groupName: string;
    Client: string; // Note the case
    studentCount: number;
    leaderCount: number;
    arrivalDate: Timestamp;
    departureDate: Timestamp;
    arrivalAirport?: string;
    departureAirport?: string;
    campusId?: string; // Populated with default for now
    arrivalFlightNumber?: string; // Not populated by current CSV
    departureFlightNumber?: string; // Not populated by current CSV
    needsArrivalTransfer?: boolean; // Not populated by current CSV
    notes?: string; // Added based on CSV possibility
    // Add other fields from Firestore screenshot as needed
}

// Define the structure of a group fetched from Firestore (includes ID)
interface GroupDocument extends FirestoreGroupData {
    id: string; // Firestore document ID
}

// Define available sort keys (must match keys in GroupDocument)
type SortableGroupKey = keyof GroupDocument;

const GroupManagementPage: React.FC = () => {
    const [csvFile, setCsvFile] = useState<File | null>(null);
    const [isProcessing, setIsProcessing] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);
    const [groups, setGroups] = useState<GroupDocument[]>([]); // State for fetched groups
    const [isLoadingGroups, setIsLoadingGroups] = useState<boolean>(true); // Loading state for groups

    // --- Sorting State ---
    const [sortKey, setSortKey] = useState<SortableGroupKey | null>(null);
    const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

    // Function to fetch groups from Firestore
    const fetchGroups = async () => {
        if (!db) {
            setError("Firestore is not initialized.");
            setIsLoadingGroups(false);
            return;
        }
        setIsLoadingGroups(true);
        setError(null); // Clear previous errors
        try {
            const groupsCollection = collection(db, 'groups');
            const groupSnapshot = await getDocs(groupsCollection);
            const groupsList = groupSnapshot.docs.map((doc: QueryDocumentSnapshot<DocumentData>) => {
                const data = doc.data();
                // Type assertion is less safe here due to potential missing fields/wrong types
                // Safer to explicitly map and provide defaults
                return {
                    id: doc.id,
                    groupName: data.groupName || 'Unnamed Group', // Match Firestore field
                    Client: data.Client || 'Unknown', // Match Firestore field
                    studentCount: data.studentCount || 0, // Match Firestore field
                    leaderCount: data.leaderCount || 0, // Match Firestore field
                    // Ensure Timestamps are correctly handled
                    arrivalDate: data.arrivalDate instanceof Timestamp ? data.arrivalDate : Timestamp.now(),
                    departureDate: data.departureDate instanceof Timestamp ? data.departureDate : Timestamp.now(),
                    arrivalAirport: data.arrivalAirport || 'N/A',
                    departureAirport: data.departureAirport || 'N/A',
                    campusId: data.campusId || 'N/A',
                    arrivalFlightNumber: data.arrivalFlightNumber || 'N/A',
                    departureFlightNumber: data.departureFlightNumber || 'N/A',
                    needsArrivalTransfer: data.needsArrivalTransfer === true, // Ensure boolean
                    notes: data.notes || '',
                } as GroupDocument; // Cast to the correct interface
            });
            setGroups(groupsList);
            console.log("Fetched Groups:", groupsList);
        } catch (err) {
            console.error("Error fetching groups:", err);
            setError(`Failed to fetch groups: ${err instanceof Error ? err.message : String(err)}`);
            setGroups([]); // Clear groups on error
        } finally {
            setIsLoadingGroups(false);
        }
    };

    // Fetch groups when the component mounts
    useEffect(() => {
        fetchGroups();
    }, []); // Empty dependency array ensures this runs only once on mount


    const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
        setError(null);
        setSuccessMessage(null);
        if (event.target.files && event.target.files.length > 0) {
            const file = event.target.files[0];
            if (file.type === 'text/csv' || file.name.toLowerCase().endsWith('.csv')) {
                setCsvFile(file);
            } else {
                setError('Please select a valid CSV file.');
                setCsvFile(null);
            }
        } else {
            setCsvFile(null);
        }
    };

    const handleImport = () => {
        if (!csvFile) {
            setError('Please select a CSV file to import.');
            return;
        }
        if (!db) {
            setError('Firestore database connection is not available.');
            return;
        }

        setIsProcessing(true);
        setError(null);
        setSuccessMessage(null);

        Papa.parse<CsvGroupRow>(csvFile, {
            header: true,
            skipEmptyLines: true,
            complete: async (results) => {
                const rows = results.data;
                const errors: string[] = [];
                const groupsToAdd: FirestoreGroupData[] = [];

                console.log("Parsed CSV Data:", rows);

                rows.forEach((row, index) => {
                    const {
                        GroupName, ArrivalDate, DepartureDate, Client,
                        ArrivalLocation, DepartureLocation, // Note: ArrivalTime, DepartureTime ignored here
                        Students = '0', Leaders = '0', Notes = ''
                    } = row;

                    if (!GroupName || !ArrivalDate || !DepartureDate) {
                        errors.push(`Row ${index + 2}: Missing required fields (GroupName, ArrivalDate, or DepartureDate).`);
                        return;
                    }

                    let arrivalDateObj: Date;
                    let departureDateObj: Date;
                    try {
                        arrivalDateObj = new Date(ArrivalDate + 'T00:00:00Z');
                        departureDateObj = new Date(DepartureDate + 'T00:00:00Z');
                        if (isNaN(arrivalDateObj.getTime()) || isNaN(departureDateObj.getTime())) {
                            throw new Error('Invalid date format');
                        }
                    } catch (e) {
                        errors.push(`Row ${index + 2}: Invalid date format for '${ArrivalDate}' or '${DepartureDate}'. Expected YYYY-MM-DD.`);
                        return;
                    }
                    const studentsCount = parseInt(Students, 10);
                    const leadersCount = parseInt(Leaders, 10);
                    if (isNaN(studentsCount) || isNaN(leadersCount)) {
                        errors.push(`Row ${index + 2}: Invalid number format for Students ('${Students}') or Leaders ('${Leaders}').`);
                        return;
                    }

                    // Map CSV row to the FLAT Firestore structure
                    const groupData: FirestoreGroupData = {
                        groupName: GroupName.trim(),
                        Client: Client?.trim() || 'Unknown', // Match Firestore field case
                        studentCount: studentsCount,
                        leaderCount: leadersCount,
                        arrivalDate: Timestamp.fromDate(arrivalDateObj),
                        departureDate: Timestamp.fromDate(departureDateObj),
                        arrivalAirport: ArrivalLocation?.trim() || undefined,
                        departureAirport: DepartureLocation?.trim() || undefined,
                        notes: Notes?.trim() || undefined,
                        // --- Fields NOT currently populated from this CSV structure ---
                        // campusId: 'DCU', // Example default if needed
                        // arrivalFlightNumber: undefined, 
                        // departureFlightNumber: undefined,
                        // needsArrivalTransfer: false, // Example default if needed 
                    };
                    groupsToAdd.push(groupData);
                });

                if (groupsToAdd.length === 0 && errors.length === 0 && rows.length > 0) {
                     errors.push("No valid group data found in the CSV after processing. Check headers and formats.");
                }

                if (groupsToAdd.length > 0) {
                    console.log("Groups formatted for Firestore:", groupsToAdd);
                    const groupsCollection = collection(db, 'groups');
                    const addPromises = groupsToAdd.map(group => addDoc(groupsCollection, group));

                    try {
                        const results = await Promise.allSettled(addPromises);
                        const successfulUploads = results.filter(r => r.status === 'fulfilled').length;
                        const failedUploads = results.filter(r => r.status === 'rejected').length;

                        let successMsg = `Successfully imported ${successfulUploads} group(s).`;
                        if (failedUploads > 0) {
                            errors.push(`${failedUploads} group(s) failed to upload to Firestore.`);
                            results.filter(r => r.status === 'rejected').forEach((rejection: PromiseRejectedResult, i) => {
                                console.error(`Firestore upload error for group data ${i}:`, rejection.reason);
                                errors.push(`Upload Error ${i+1}: ${rejection.reason?.message || 'Unknown Firestore error'}`);
                            });
                        }
                         if (errors.length > 0) {
                             setError(`Import completed with issues:\n- ${errors.join('\n- ')}`);
                             setSuccessMessage(successfulUploads > 0 ? successMsg : null);
                         } else {
                             setSuccessMessage(successMsg);
                         }

                         if (successfulUploads > 0) {
                            fetchGroups();
                         }

                    } catch (uploadError) {
                        console.error("Error during Firestore batch add:", uploadError);
                        setError(`Failed to upload groups to Firestore. ${uploadError instanceof Error ? uploadError.message : String(uploadError)}`);
                    }
                } else {
                   if (errors.length > 0) {
                     setError(`Import failed. Issues found:\n- ${errors.join('\n- ')}`);
                   } else if (rows.length === 0 && csvFile) { 
                       setError("The selected CSV file appears to be empty or contains only header/empty rows.");
                   } 
                }

                setIsProcessing(false);
                setCsvFile(null);
                const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
                if (fileInput) fileInput.value = '';

            },
            error: (err) => {
                console.error("CSV Parsing Error:", err);
                setError(`Failed to parse CSV file: ${err.message}`);
                setIsProcessing(false);
            }
        });
    };

    // --- Sorting Logic ---
    const handleSort = (key: SortableGroupKey) => {
        if (sortKey === key) {
            // Toggle order if same key is clicked
            setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
        } else {
            // Set new key and default to ascending order
            setSortKey(key);
            setSortOrder('asc');
        }
    };

    // --- Memoized Sorted Groups ---
    const sortedGroups = useMemo(() => {
        if (!sortKey) return groups; // Return original if no sort key

        return [...groups].sort((a, b) => {
            const aValue = a[sortKey];
            const bValue = b[sortKey];

            let comparison = 0;

            // Handle different data types
            if (aValue instanceof Timestamp && bValue instanceof Timestamp) {
                comparison = aValue.toMillis() - bValue.toMillis();
            } else if (typeof aValue === 'number' && typeof bValue === 'number') {
                comparison = aValue - bValue;
            } else if (typeof aValue === 'string' && typeof bValue === 'string') {
                comparison = aValue.localeCompare(bValue);
            } else if (typeof aValue === 'boolean' && typeof bValue === 'boolean') {
                comparison = (aValue === bValue) ? 0 : aValue ? 1 : -1;
            } else {
                // Basic handling for potentially mixed or null/undefined types
                // Treat null/undefined as lowest
                if (aValue == null && bValue != null) comparison = -1;
                else if (aValue != null && bValue == null) comparison = 1;
                // If types differ significantly, string comparison is a fallback
                else comparison = String(aValue).localeCompare(String(bValue));
            }

            return sortOrder === 'asc' ? comparison : comparison * -1;
        });
    }, [groups, sortKey, sortOrder]);

    // Basic Styling (consider moving to CSS file)
    const containerStyle: React.CSSProperties = { padding: '20px', maxWidth: '1200px', margin: '0 auto' }; // Wider container
    const errorStyle: React.CSSProperties = { color: 'red', whiteSpace: 'pre-wrap', marginTop: '10px', border: '1px solid red', padding: '10px', borderRadius: '4px', backgroundColor: '#ffebeb' };
    const successStyle: React.CSSProperties = { color: 'green', marginTop: '10px', border: '1px solid green', padding: '10px', borderRadius: '4px', backgroundColor: '#e6ffed' };
    const inputStyle: React.CSSProperties = { display: 'block', margin: '10px 0' };
    const buttonStyle: React.CSSProperties = { padding: '10px 15px', cursor: 'pointer' };
    const instructionsStyle: React.CSSProperties = { marginTop: '20px', padding: '15px', border: '1px solid #ccc', borderRadius: '4px', backgroundColor: '#f9f9f9', fontSize: '0.9em' };
    // Styles for the group table
    const tableContainerStyle: React.CSSProperties = { marginTop: '30px', overflowX: 'auto' };
    const tableStyle: React.CSSProperties = { width: '100%', borderCollapse: 'collapse' };
    const thStyle: React.CSSProperties = { 
        border: '1px solid #ddd', 
        padding: '8px', 
        textAlign: 'left', 
        backgroundColor: '#f2f2f2', 
        fontWeight: 'bold', 
        cursor: 'pointer', // Make header clickable
        position: 'relative' // For positioning sort arrows
    };
    const tdStyle: React.CSSProperties = { border: '1px solid #ddd', padding: '8px', textAlign: 'left', verticalAlign: 'top' }; // Align top for better readability
    // Style for sort arrows
    const sortArrowStyle: React.CSSProperties = {
        position: 'absolute',
        right: '8px',
        top: '50%',
        transform: 'translateY(-50%)',
        fontSize: '0.8em'
    };

    // Helper to format Timestamp
    const formatTimestamp = (timestamp: Timestamp | undefined): string => {
        if (!timestamp) return 'N/A';
        try {
            return timestamp.toDate().toLocaleDateString(); // Or toLocaleString() for date+time
        } catch (e) {
            console.error("Error formatting timestamp:", e);
            return 'Invalid Date';
        }
    };

    // Helper to render sort arrows
    const renderSortArrow = (key: SortableGroupKey) => {
        if (sortKey !== key) return null;
        return <span style={sortArrowStyle}>{sortOrder === 'asc' ? '▲' : '▼'}</span>;
    };

    return (
        <div style={containerStyle}>
            <h2>Import Groups from CSV</h2>

            <p>Select a CSV file with group data to import into Firestore.</p>

            <input
                type="file"
                accept=".csv"
                onChange={handleFileChange}
                style={inputStyle}
                disabled={isProcessing}
            />

            <button
                onClick={handleImport}
                disabled={!csvFile || isProcessing}
                style={buttonStyle}
            >
                {isProcessing ? 'Processing...' : 'Import Selected CSV'}
            </button>

            {isProcessing && <p>Processing file, please wait...</p>}
            {error && <div style={errorStyle}>Error: {error}</div>}
            {successMessage && <div style={successStyle}>{successMessage}</div>}

            {/* --- Instructions Section (Updated for consistency) --- */}
            <div style={instructionsStyle}>
                 <h4>CSV Format Instructions:</h4>
                 <ul>
                     <li>The first row must be a header row containing the exact names below (case-sensitive).</li>
                     <li><strong>Required Columns:</strong>
                         <ul>
                             <li><code>GroupName</code></li>
                             <li><code>ArrivalDate</code> (Format: YYYY-MM-DD)</li>
                             <li><code>DepartureDate</code> (Format: YYYY-MM-DD)</li>
                         </ul>
                     </li>
                     <li><strong>Optional Columns:</strong>
                         <ul>
                            <li><code>Client</code></li>
                            <li><code>ArrivalLocation</code> (e.g., Airport Name, Campus) - Populates 'Arrival Airport'</li>
                            <li><code>DepartureLocation</code> (e.g., Airport Name, Campus) - Populates 'Departure Airport'</li>
                            <li><code>Students</code> (Whole number)</li>
                            <li><code>Leaders</code> (Whole number)</li>
                            <li><code>Notes</code></li>
                            {/* Add instructions for Flight Numbers, etc. if columns are added to CSV */}
                         </ul>
                     </li>
                     <li>Arrival/Departure Times from CSV are currently not imported.</li>
                     <li>Ensure the file is saved with UTF-8 encoding if using special characters.</li>
                 </ul>
            </div>

            {/* --- Table Section (with Sortable Headers) --- */}
            <div style={tableContainerStyle}>
                <h2>Existing Groups</h2>
                {isLoadingGroups ? (
                    <p>Loading groups...</p>
                ) : groups.length === 0 && !error ? (
                    <p>No groups found in Firestore.</p>
                ) : sortedGroups.length > 0 ? (
                    <table style={tableStyle}>
                        <thead>
                            <tr>
                                <th style={thStyle} onClick={() => handleSort('groupName')}>
                                    Group Name {renderSortArrow('groupName')}
                                </th>
                                <th style={thStyle} onClick={() => handleSort('Client')}>
                                    Client {renderSortArrow('Client')}
                                </th>
                                <th style={thStyle} onClick={() => handleSort('studentCount')}>
                                    Students {renderSortArrow('studentCount')}
                                </th>
                                <th style={thStyle} onClick={() => handleSort('leaderCount')}>
                                    Leaders {renderSortArrow('leaderCount')}
                                </th>
                                <th style={thStyle} onClick={() => handleSort('arrivalDate')}>
                                    Arrival Date {renderSortArrow('arrivalDate')}
                                </th>
                                <th style={thStyle} onClick={() => handleSort('arrivalAirport')}>
                                    Arrival Airport {renderSortArrow('arrivalAirport')}
                                </th>
                                <th style={thStyle} onClick={() => handleSort('arrivalFlightNumber')}>
                                    Arrival Flight # {renderSortArrow('arrivalFlightNumber')}
                                </th>
                                <th style={thStyle} onClick={() => handleSort('departureDate')}>
                                    Departure Date {renderSortArrow('departureDate')}
                                </th>
                                <th style={thStyle} onClick={() => handleSort('departureAirport')}>
                                    Departure Airport {renderSortArrow('departureAirport')}
                                </th>
                                <th style={thStyle} onClick={() => handleSort('departureFlightNumber')}>
                                    Departure Flight # {renderSortArrow('departureFlightNumber')}
                                </th>
                                <th style={thStyle} onClick={() => handleSort('campusId')}>
                                    Campus {renderSortArrow('campusId')}
                                </th>
                                <th style={thStyle} onClick={() => handleSort('needsArrivalTransfer')}>
                                    Needs Transfer {renderSortArrow('needsArrivalTransfer')}
                                </th>
                                <th style={thStyle} onClick={() => handleSort('notes')}>
                                    Notes {renderSortArrow('notes')}
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {sortedGroups.map((group) => (
                                <tr key={group.id || `invalid-${Math.random()}`}>
                                    <td style={tdStyle}>
                                        {group.id && typeof group.id === 'string' ? (
                                            <Link to={`/group/${group.id}/schedule`}>{group.groupName}</Link>
                                        ) : (
                                            <span>{group.groupName} (Invalid ID)</span>
                                        )}
                                    </td>
                                    <td style={tdStyle}>{group.Client}</td>
                                    <td style={tdStyle}>{group.studentCount}</td>
                                    <td style={tdStyle}>{group.leaderCount}</td>
                                    <td style={tdStyle}>{formatTimestamp(group.arrivalDate)}</td>
                                    <td style={tdStyle}>{group.arrivalAirport}</td>
                                    <td style={tdStyle}>{group.arrivalFlightNumber}</td>
                                    <td style={tdStyle}>{formatTimestamp(group.departureDate)}</td>
                                    <td style={tdStyle}>{group.departureAirport}</td>
                                    <td style={tdStyle}>{group.departureFlightNumber}</td>
                                    <td style={tdStyle}>{group.campusId}</td>
                                    <td style={tdStyle}>{group.needsArrivalTransfer ? 'Yes' : 'No'}</td>
                                    <td style={tdStyle}>{group.notes}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                 ) : null}
            </div>
        </div>
    );
};

export default GroupManagementPage;
