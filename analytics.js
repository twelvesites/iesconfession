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
