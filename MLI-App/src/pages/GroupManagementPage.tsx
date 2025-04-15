import React, { useState, ChangeEvent, useEffect, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom'; // Import Link and useNavigate
import Papa from 'papaparse'; // CSV Parsing library
import { collection, addDoc, Timestamp, getDocs, DocumentData, QueryDocumentSnapshot, doc, writeBatch, deleteDoc } from 'firebase/firestore';
// Make sure this path is correct for your project structure
import { db } from '../firebase'; // Import your Firestore db instance

// Define the expected structure of a CSV row after parsing
// Adjust based on your *exact* CSV column headers
interface CsvGroupRow {
    Agency: string; // Renamed from Client/New
    "Group Name": string; // Ensure exact match if space exists
    Students: string; // Keep as string for parsing
    Leaders: string; // Keep as string for parsing
    Arrival: string; // Renamed from ArrivalDate, expect YYYY-MM-DD
    Departure: string; // Renamed from DepartureDate, expect YYYY-MM-DD
    Venue: string; // Renamed/New field for Campus ID
    // Remove other optional fields unless they are brought back
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

// Helper function to parse DD/MM/YYYY dates
const parseDMYDate = (dateString: string): Date | null => {
    if (!dateString) return null;
    const parts = dateString.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (!parts) {
        console.warn(`Invalid date format for parsing: ${dateString}. Expected DD/MM/YYYY.`);
        return null; // Invalid format
    }
    // parts[1] = DD, parts[2] = MM, parts[3] = YYYY
    const day = parseInt(parts[1], 10);
    const month = parseInt(parts[2], 10);
    const year = parseInt(parts[3], 10);

    // Basic validation (months are 1-12)
    if (month < 1 || month > 12 || day < 1 || day > 31) {
        console.warn(`Invalid date values after parsing: Day=${day}, Month=${month}, Year=${year} from ${dateString}`);
        return null;
    }

    // Note: JavaScript Date months are 0-11
    const date = new Date(Date.UTC(year, month - 1, day));
    
    // Additional check: Does the created date match the input parts? (handles invalid dates like 31/02/2024)
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
        console.warn(`Date parsed (${date.toISOString()}) does not match input parts: Day=${day}, Month=${month}, Year=${year} from ${dateString}`);
        return null;
    }

    return date;
};

const GroupManagementPage: React.FC = () => {
    const [csvFile, setCsvFile] = useState<File | null>(null);
    const [isProcessing, setIsProcessing] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);
    const [groups, setGroups] = useState<GroupDocument[]>([]); // State for fetched groups
    const [isLoadingGroups, setIsLoadingGroups] = useState<boolean>(true); // Loading state for groups
    const [selectedGroupIds, setSelectedGroupIds] = useState<Set<string>>(new Set()); // State for selected IDs

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

        Papa.parse<CsvGroupRow>(csvFile!, { // Added non-null assertion assuming check passed
            header: true,
            skipEmptyLines: true,
            complete: async (results) => {
                const rows = results.data;
                const errors: string[] = [];
                const groupsToAdd: FirestoreGroupData[] = [];

                console.log("Parsed CSV Data:", rows);

                // Validate headers before processing rows
                const expectedHeaders = ["Agency", "Group Name", "Students", "Leaders", "Arrival", "Departure", "Venue"];
                const actualHeaders = results.meta.fields;
                if (!actualHeaders || !expectedHeaders.every(header => actualHeaders.includes(header))) {
                    setError(`CSV header mismatch. Expected headers: ${expectedHeaders.join(", ")}. Found: ${actualHeaders?.join(", ") || 'None'}. Please ensure the first row has the exact required headers.`);
                    setIsProcessing(false);
                    setCsvFile(null);
                    // Clear file input
                    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
                    if (fileInput) fileInput.value = '';
                    return; // Stop processing
                }


                rows.forEach((row, index) => {
                    // Use the exact headers specified
                    const {
                        Agency, "Group Name": GroupName, Students, Leaders, Arrival, Departure, Venue
                    } = row;

                    // Check if all required fields are present in the row data
                    if (!Agency || !GroupName || Students === undefined || Leaders === undefined || !Arrival || !Departure || !Venue) {
                        errors.push(`Row ${index + 2}: Missing required fields (Agency, Group Name, Students, Leaders, Arrival, Departure, Venue).`);
                        return;
                    }

                    let arrivalDateObj: Date | null;
                    let departureDateObj: Date | null;
                    try {
                        arrivalDateObj = parseDMYDate(Arrival);
                        departureDateObj = parseDMYDate(Departure);
                        if (!arrivalDateObj || !departureDateObj) { // Check if parsing failed
                            throw new Error('Invalid date format or value');
                        }
                    } catch (e) {
                        // Error message updated
                        errors.push(`Row ${index + 2}: Invalid date format or value for Arrival ('${Arrival}') or Departure ('${Departure}'). Expected DD/MM/YYYY.`);
                        return;
                    }
                    const studentsCount = parseInt(Students, 10);
                    const leadersCount = parseInt(Leaders, 10);
                    if (isNaN(studentsCount) || isNaN(leadersCount)) {
                        errors.push(`Row ${index + 2}: Invalid number format for Students ('${Students}') or Leaders ('${Leaders}').`);
                        return;
                    }

                    // Map CSV row to the FLAT Firestore structure using new headers
                    const groupData: FirestoreGroupData = {
                        groupName: GroupName.trim(),
                        Client: Agency.trim(), // Map Agency to Client
                        studentCount: studentsCount,
                        leaderCount: leadersCount,
                        arrivalDate: Timestamp.fromDate(arrivalDateObj),
                        departureDate: Timestamp.fromDate(departureDateObj),
                        campusId: Venue.trim(), // Map Venue to campusId
                        // --- Fields NOT currently populated from this specific CSV structure ---
                        // arrivalAirport: undefined,
                        // departureAirport: undefined,
                        // notes: undefined,
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

    // --- Selection Handlers ---
    const handleSelectGroup = (groupId: string) => {
        setSelectedGroupIds(prevSelected => {
            const newSelected = new Set(prevSelected);
            if (newSelected.has(groupId)) {
                newSelected.delete(groupId);
            } else {
                newSelected.add(groupId);
            }
            return newSelected;
        });
    };

    const handleSelectAll = (event: ChangeEvent<HTMLInputElement>) => {
        if (event.target.checked) {
            // Select all currently displayed (sorted) groups
            const allDisplayedIds = sortedGroups.map(g => g.id).filter(id => !!id);
            setSelectedGroupIds(new Set(allDisplayedIds));
        } else {
            // Deselect all
            setSelectedGroupIds(new Set());
        }
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

    // Basic Styling (consider moving to CSS file)
    const containerStyle: React.CSSProperties = { padding: '20px', maxWidth: '1200px', margin: '0 auto' };
    const errorStyle: React.CSSProperties = { color: 'red', whiteSpace: 'pre-wrap', marginTop: '10px', border: '1px solid red', padding: '10px', borderRadius: '4px', backgroundColor: '#ffebeb' };
    const successStyle: React.CSSProperties = { color: 'green', marginTop: '10px', border: '1px solid green', padding: '10px', borderRadius: '4px', backgroundColor: '#e6ffed' };
    const inputStyle: React.CSSProperties = { display: 'block', margin: '10px 0' };
    const buttonStyle: React.CSSProperties = { padding: '10px 15px', cursor: 'pointer' };
    const instructionsStyle: React.CSSProperties = { marginTop: '20px', padding: '15px', border: '1px solid #ccc', borderRadius: '4px', backgroundColor: '#f9f9f9', fontSize: '0.9em' };
    const tableContainerStyle: React.CSSProperties = { marginTop: '30px', overflowX: 'auto' };
    const tableStyle: React.CSSProperties = { width: '100%', borderCollapse: 'collapse' };
    const thStyle: React.CSSProperties = {
        border: '1px solid #ddd',
        padding: '8px',
        textAlign: 'left',
        backgroundColor: '#f2f2f2',
        fontWeight: 'bold',
        cursor: 'pointer',
        position: 'relative'
    };
    const tdStyle: React.CSSProperties = { border: '1px solid #ddd', padding: '8px', textAlign: 'left', verticalAlign: 'top' };
    const sortArrowStyle: React.CSSProperties = {
        position: 'absolute',
        right: '8px',
        top: '50%',
        transform: 'translateY(-50%)',
        fontSize: '0.8em'
    };

    // --- Styling (Keep existing) --- 
    // ... styles ...
    const deleteButtonStyle: React.CSSProperties = {
        ...buttonStyle, // Inherit base button style
        backgroundColor: selectedGroupIds.size > 0 ? '#dc3545' : '#6c757d', // Red when active, gray when disabled
        color: 'white',
        marginLeft: '10px', // Add some space
        cursor: selectedGroupIds.size > 0 ? 'pointer' : 'not-allowed',
    };

    // --- Delete Handler ---
    const handleDeleteSelected = async () => {
        if (selectedGroupIds.size === 0) {
            setError("No groups selected for deletion.");
            return;
        }

        const confirmed = window.confirm(
            `Are you sure you want to delete ${selectedGroupIds.size} selected group(s)? This action cannot be undone.`
        );

        if (!confirmed) {
            return;
        }

        setIsProcessing(true); // Use isProcessing for general loading state
        setError(null);
        setSuccessMessage(null);

        const idsToDelete = Array.from(selectedGroupIds);
        const deletePromises = idsToDelete.map(id => {
            const docRef = doc(db, 'groups', id);
            return deleteDoc(docRef);
        });

        try {
            // Wait for all delete operations
            await Promise.all(deletePromises);

            // Update local state: remove deleted groups
            setGroups(prevGroups => 
                prevGroups.filter(group => !selectedGroupIds.has(group.id))
            );

            // Clear selection
            setSelectedGroupIds(new Set());
            setSuccessMessage(`${idsToDelete.length} group(s) deleted successfully.`);

        } catch (err) {
            console.error("Error deleting groups:", err);
            setError(`Failed to delete groups: ${err instanceof Error ? err.message : String(err)}. Some groups might still be selected.`);
            // Optionally, re-fetch groups to ensure consistency if some deletions failed
            // await fetchGroups(); 
        } finally {
            setIsProcessing(false);
        }
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

            {/* --- Instructions Section (Updated) --- */}
            <div style={instructionsStyle}>
                 <h4>CSV Format Instructions:</h4>
                 <ul>
                     <li>The first row must be the header row containing the exact column names listed below (case-sensitive).</li>
                     <li>Ensure the file is saved with UTF-8 encoding.</li>
                     <li><strong>Required Columns (All must be present):</strong>
                         <ul>
                             <li><code>Agency</code> (Maps to: Client)</li>
                             <li><code>Group Name</code> (Maps to: Group Name)</li>
                             <li><code>Students</code> (Whole number, Maps to: Student Count)</li>
                             <li><code>Leaders</code> (Whole number, Maps to: Leader Count)</li>
                             <li><code>Arrival</code> (Format: DD/MM/YYYY, Maps to: Arrival Date)</li>
                             <li><code>Departure</code> (Format: DD/MM/YYYY, Maps to: Departure Date)</li>
                             <li><code>Venue</code> (Maps to: Campus ID)</li>
                         </ul>
                     </li>
                     <li><em>Note:</em> Other fields like Airports, Flight Numbers, Notes, etc., are not imported with this specific format and will need to be added manually if required.</li>
                 </ul>
            </div>

            {/* --- Table Section (with Sortable Headers) --- */}
            <div style={tableContainerStyle}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                    <h2>Existing Groups</h2>
                    <button
                        style={deleteButtonStyle}
                        onClick={handleDeleteSelected}
                        disabled={selectedGroupIds.size === 0 || isProcessing}
                        title={selectedGroupIds.size > 0 ? `Delete ${selectedGroupIds.size} selected group(s)` : 'Select groups to delete'}
                    >
                        {isProcessing ? 'Deleting...' : `Delete Selected (${selectedGroupIds.size})`}
                    </button>
                </div>
                {isLoadingGroups ? (
                    <p>Loading groups...</p>
                ) : groups.length === 0 && !error ? (
                    <p>No groups found in Firestore.</p>
                ) : sortedGroups.length > 0 ? (
                    <table style={tableStyle}>
                        <thead>
                            <tr>
                                <th style={thStyle}>
                                    <input
                                        type="checkbox"
                                        checked={selectedGroupIds.size > 0 && selectedGroupIds.size === sortedGroups.length}
                                        onChange={handleSelectAll}
                                        // Indeterminate state can be added for more complex scenarios
                                        title={selectedGroupIds.size > 0 ? "Deselect all" : "Select all displayed"}
                                    />
                                </th>
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
                                        <input
                                            type="checkbox"
                                            checked={selectedGroupIds.has(group.id)}
                                            onChange={() => handleSelectGroup(group.id)}
                                            disabled={!group.id}
                                        />
                                    </td>
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
