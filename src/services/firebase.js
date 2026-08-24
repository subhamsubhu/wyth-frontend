import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getDatabase } from 'firebase/database';
import { getStorage } from 'firebase/storage';

const firebaseConfig = {
  apiKey: "AIzaSyCgkNmm4o_dG4bNmg0_AgnpgYwjs6ZV53Q",
  authDomain: "subhwatchparty.firebaseapp.com",
  projectId: "subhwatchparty",
  storageBucket: "subhwatchparty.firebasestorage.app",
  messagingSenderId: "179857366806",
  appId: "1:179857366806:web:c220caf2d807975a5a7a37",
  databaseURL: "https://subhwatchparty-default-rtdb.asia-southeast1.firebasedatabase.app"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize services
export const auth = getAuth(app);
export const db = getFirestore(app);
export const realtimeDb = getDatabase(app);
export const storage = getStorage(app);

export default app;