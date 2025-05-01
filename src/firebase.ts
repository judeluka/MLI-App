import { initializeApp, FirebaseApp } from "firebase/app";
import { getFirestore, Firestore, connectFirestoreEmulator } from "firebase/firestore";
// import { getAuth, Auth } from "firebase/auth"; // Uncomment if you need Authentication

// Your web app's Firebase configuration loaded from environment variables
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID // Optional: remove if not using Analytics
};

// Validate that environment variables are loaded (optional but recommended)
for (const [key, value] of Object.entries(firebaseConfig)) {
  if (value === undefined) {
    // In development, Vite loads .env variables differently than in production build.
    // This check might primarily catch issues in production builds if .env isn't processed correctly.
    // For local dev, ensure the .env.local file is present and the dev server was restarted.
    console.warn(`Firebase config key "${key}" is missing. Check your .env.local file and ensure Vite prefixes (VITE_) are correct.`);
  }
}


// Initialize Firebase
const app: FirebaseApp = initializeApp(firebaseConfig);

// Initialize Cloud Firestore and get a reference to the service
const db: Firestore = getFirestore(app);

// Initialize Firebase Authentication and get a reference to the service (Uncomment if needed)
// const auth: Auth = getAuth(app);

// Connect to Emulators in Development
if (import.meta.env.DEV) {
    try {
        console.log("Connecting to Firestore Emulator...");
        connectFirestoreEmulator(db, 'localhost', 8080); // Default Firestore port
        // For Auth Emulator (uncomment and adjust port if needed):
        // import { connectAuthEmulator } from "firebase/auth";
        // connectAuthEmulator(auth, 'http://localhost:9099');
        console.log("Firestore Emulator connected.");
    } catch (error) {
        console.error("Error connecting to Firebase Emulators:", error);
    }
}

// Export the instances for use in other parts of the app
export { app, db /*, auth */ }; // Export 'app' if needed elsewhere, export db and auth 