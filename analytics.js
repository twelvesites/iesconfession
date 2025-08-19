import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getFirestore,
  doc,
  setDoc,
  updateDoc,
  getDoc,
  collection,
  addDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// --- Firebase Config ---
const firebaseConfig = {
  apiKey: "AIzaSyDob9nbpu0Y9ebCmxwHBTCyFFCzSjgNFLs",
  authDomain: "confession-ies.firebaseapp.com",
  projectId: "confession-ies",
  storageBucket: "confession-ies.firebasestorage.app",
  messagingSenderId: "705171117795",
  appId: "1:705171117795:web:4aa165b3b071a0d6b197d6",
  measurementId: "G-9347YMJ01Z"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// --- Visitor ID ---
async function getOrCreateVisitorId() {
  let visitorId = localStorage.getItem("visitorId");
  if (!visitorId) {
    visitorId = crypto.randomUUID();
    localStorage.setItem("visitorId", visitorId);
  }

  const visitorRef = doc(db, "visitors", visitorId);
  const docSnap = await getDoc(visitorRef);

  // If Firebase doc is missing, create it
  if (!docSnap.exists()) {
    await setDoc(visitorRef, {
      firstVisitAt: serverTimestamp(),
      lastVisitAt: serverTimestamp(),
      visitCount: 1,
      deviceInfo: getDeviceInfo()
    });
  }

  return visitorId;
}

// --- Device Info ---
function getDeviceInfo() {
  const ua = navigator.userAgent;
  return {
    deviceType: /Mobi|Android/i.test(ua) ? "Mobile" : "Desktop",
    os: navigator.platform || "Unknown",
    browser: ua.match(/(Chrome|Firefox|Safari|Edge|Opera)/)?.[0] || "Unknown",
    screenResolution: `${window.screen.width}x${window.screen.height}`,
    language: navigator.language || "Unknown",
    userAgent: ua
  };
}

// --- Log Visit ---
async function logVisit() {
  const visitorId = await getOrCreateVisitorId();
  const visitorRef = doc(db, "visitors", visitorId);
  const docSnap = await getDoc(visitorRef);
  const deviceInfo = getDeviceInfo();

  if (docSnap.exists()) {
    // Update last visit & increment count
    await updateDoc(visitorRef, {
      lastVisitAt: serverTimestamp(),
      visitCount: (docSnap.data().visitCount || 1) + 1,
      deviceInfo
    });
  }

  // Add a new session for this page visit
  await addDoc(collection(visitorRef, "sessions"), {
    visitedAt: serverTimestamp(),
    page: window.location.pathname,
    duration: null // Optional: you can calculate later
  });
}

// --- Run it ---
logVisit();
