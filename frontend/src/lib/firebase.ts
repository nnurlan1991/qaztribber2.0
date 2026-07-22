/**
 * Firebase initialization for the desktop app.
 *
 * API key is intentionally public — Firebase keys are designed to be exposed
 * in client code. Security comes from Firestore rules (users can only read
 * their own doc, cannot write approved/admin fields), NOT from key secrecy.
 */

import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyBIztJV9xay0LS6t4lfaJJ1Vo5sTRimHt0",
  authDomain: "qaztribber.firebaseapp.com",
  projectId: "qaztribber",
  storageBucket: "qaztribber.firebasestorage.app",
  messagingSenderId: "1097631477599",
  appId: "1:1097631477599:web:689f2092e111e5cd6850ea",
  measurementId: "G-DYCG2J9W7P",
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
