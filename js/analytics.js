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

// 1. Firebase Config
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

// 2. Get or Set visitorId
let visitorId = localStorage.getItem("visitorId");
if (!visitorId) {
  visitorId = crypto.randomUUID(); // Unique ID
  localStorage.setItem("visitorId", visitorId);
}

// 3. Get device info
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

// 4. Log or update visitor info
async function logVisit() {
  const visitorRef = doc(db, "visitors", visitorId);
  const docSnap = await getDoc(visitorRef);
  const deviceInfo = getDeviceInfo();

  if (!docSnap.exists()) {
    // New visitor
    await setDoc(visitorRef, {
      firstVisitAt: serverTimestamp(),
      lastVisitAt: serverTimestamp(),
      visitCount: 1,
      deviceInfo
    });
  } else {
    // Returning visitor
    await updateDoc(visitorRef, {
      lastVisitAt: serverTimestamp(),
      visitCount: (docSnap.data().visitCount || 1) + 1
    });
  }

  // Add session
  await addDoc(collection(visitorRef, "sessions"), {
    sessionStartAt: serverTimestamp(),
    pagesVisited: [window.location.pathname],
    duration: null // Add later if needed
  });
}

// 5. Call it
logVisit();