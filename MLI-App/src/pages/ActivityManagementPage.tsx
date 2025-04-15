import React, { useState, useEffect, ChangeEvent, FormEvent } from 'react';
import { collection, addDoc, getDocs, Timestamp, QueryDocumentSnapshot, DocumentData } from 'firebase/firestore';
import { db } from '../firebase'; // Ensure this path is correct

// Interface for Activity data
interface Activity {
  id?: string; // Firestore document ID (optional when creating)
  name: string;
  location?: string; // Reverted location back to string, NOW OPTIONAL
  type: 'half-day' | 'full-day'; // Type restricted to specific values
}

const ActivityManagementPage: React.FC = () => {
    // Form state
    const [activityName, setActivityName] = useState<string>('');
    const [activityLocation, setActivityLocation] = useState<string>(''); // Reverted to single location string state
    const [activityType, setActivityType] = useState<'half-day' | 'full-day'>('half-day');

    // List state
    const [activities, setActivities] = useState<Activity[]>([]);
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

    // Fetch existing activities
    useEffect(() => {
        const fetchActivities = async () => {
            if (!db) {
                setError("Firestore is not initialized.");
                setIsLoading(false);
                return;
            }
            setIsLoading(true);
            try {
                const activitiesCollection = collection(db, 'activities');
                const activitySnapshot = await getDocs(activitiesCollection);
                const activitiesList = activitySnapshot.docs.map((doc: QueryDocumentSnapshot<DocumentData>) => {
                    const data = doc.data();
                    return {
                        id: doc.id,
                        name: data.name || 'Unnamed Activity',
                        location: data.location || 'Unknown Location', // Read location as string
                        type: data.type === 'full-day' ? 'full-day' : 'half-day',
                    } as Activity;
                });
                setActivities(activitiesList);
            } catch (err) {
                console.error("Error fetching activities:", err);
                setError(`Failed to fetch activities: ${err instanceof Error ? err.message : String(err)}`);
            } finally {
                setIsLoading(false);
            }
        };

        fetchActivities();
    }, []);

    // Handle form submission
    const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        
        // Validation (Only name is strictly required now)
        if (!activityName) { 
            setError('Please fill in the Activity Name.');
            return;
        }
        if (!db) {
            setError("Firestore is not initialized. Cannot save activity.");
            return;
        }

        setIsSubmitting(true);
        setError(null);

        const newActivity: Omit<Activity, 'id'> = {
            name: activityName.trim(),
            location: activityLocation.trim() || undefined, // Save undefined if empty string
            type: activityType,
        };

        try {
            const activitiesCollection = collection(db, 'activities');
            const docRef = await addDoc(activitiesCollection, newActivity);
            
            setActivities(prevActivities => [...prevActivities, { ...newActivity, id: docRef.id }]);
            
            // Reset form
            setActivityName('');
            setActivityLocation(''); // Reset location string
            setActivityType('half-day');
            console.log("Activity added with ID:", docRef.id);

        } catch (err) {
            console.error("Error adding activity:", err);
            setError(`Failed to save activity: ${err instanceof Error ? err.message : String(err)}`);
        } finally {
            setIsSubmitting(false);
        }
    };

    // --- Basic Styling (Consider moving to CSS) ---
    const pageStyle: React.CSSProperties = { padding: '20px' };
    const formStyle: React.CSSProperties = { marginBottom: '30px', padding: '20px', border: '1px solid #ccc', borderRadius: '5px', backgroundColor: '#f9f9f9' };
    const inputGroupStyle: React.CSSProperties = { marginBottom: '15px' };
    const labelStyle: React.CSSProperties = { display: 'block', marginBottom: '5px', fontWeight: 'bold' };
    const inputStyle: React.CSSProperties = { width: '100%', padding: '8px', boxSizing: 'border-box' };
    const selectStyle: React.CSSProperties = { width: '100%', padding: '8px', boxSizing: 'border-box' };
    const buttonStyle: React.CSSProperties = { padding: '10px 15px', cursor: 'pointer' };
    const errorStyle: React.CSSProperties = { color: 'red', marginTop: '10px' };
    const listStyle: React.CSSProperties = { listStyle: 'none', padding: 0 };
    const listItemStyle: React.CSSProperties = { marginBottom: '10px', padding: '10px', border: '1px solid #eee', borderRadius: '4px' };

    return (
        <div style={pageStyle}>
            <h1>Activity Management</h1>

            {/* Add New Activity Form */}
            <form onSubmit={handleSubmit} style={formStyle}>
                <h2>Add New Activity</h2>
                <div style={inputGroupStyle}>
                    <label htmlFor="activityName" style={labelStyle}>Activity Name:</label>
                    <input
                        type="text"
                        id="activityName"
                        value={activityName}
                        onChange={(e: ChangeEvent<HTMLInputElement>) => setActivityName(e.target.value)}
                        style={inputStyle}
                        required
                    />
                </div>
                <div style={inputGroupStyle}>
                    <label htmlFor="activityLocation" style={labelStyle}>Location (Address - Optional):</label>
                    <input
                        type="text"
                        id="activityLocation"
                        value={activityLocation}
                        onChange={(e: ChangeEvent<HTMLInputElement>) => setActivityLocation(e.target.value)}
                        placeholder="e.g., 123 Main St, Dublin"
                        style={inputStyle}
                    />
                </div>
                <div style={inputGroupStyle}>
                    <label htmlFor="activityType" style={labelStyle}>Type:</label>
                    <select
                        id="activityType"
                        value={activityType}
                        onChange={(e: ChangeEvent<HTMLSelectElement>) => setActivityType(e.target.value as 'half-day' | 'full-day')}
                        style={selectStyle}
                    >
                        <option value="half-day">Half-day</option>
                        <option value="full-day">Full-day</option>
                    </select>
                </div>
                <button type="submit" style={buttonStyle} disabled={isSubmitting}>
                    {isSubmitting ? 'Adding...' : 'Add Activity'}
                </button>
                {error && <p style={errorStyle}>{error}</p>} {/* Display form-specific errors here */}
            </form>

            {/* List Existing Activities */}
            <div>
                <h2>Existing Activities</h2>
                {isLoading ? (
                    <p>Loading activities...</p>
                ) : error && activities.length === 0 ? (
                     <p style={errorStyle}>{error}</p> // Show fetch error if list is empty
                ) : activities.length === 0 ? (
                    <p>No activities found.</p>
                ) : (
                    <ul style={listStyle}>
                        {activities.map(activity => (
                            <li key={activity.id} style={listItemStyle}>
                                <strong>{activity.name}</strong> ({activity.type}) - 
                                {/* Display location string or fallback */}
                                {activity.location || 'N/A'}
                                {/* TODO: Add Edit/Delete buttons here */} 
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </div>
    );
};

export default ActivityManagementPage; 