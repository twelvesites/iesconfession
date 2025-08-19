import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getFirestore, collection, query, orderBy, onSnapshot,
  doc, deleteDoc, getDocs
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// --- Firebase Config ---
const firebaseConfig = {
  apiKey: "AIzaSyDob9nbpu0Y9ebCmxwHBTCyFFCzSjgNFLs",
  authDomain: "confession-ies.firebaseapp.com",
  projectId: "confession-ies",
  storageBucket: "confession-ies.appspot.com",
  messagingSenderId: "705171117795",
  appId: "1:705171117795:web:4aa165b3b071a0d6b197d6",
  measurementId: "G-9347YMJ01Z"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// --- DOM Elements ---
const adminFeed = document.getElementById('adminFeed');
const adminVisitorsContainer = document.getElementById('adminVisitors');
const totalVisitorsEl = document.getElementById('totalVisitors');
const avgVisitorsEl = document.getElementById('avgVisitors');
const recentVisitorEl = document.getElementById('recentVisitor');

// --- Helpers ---
function escapeHTML(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function formatTimestamp(ts) {
  if (!ts) return "Unknown";
  if (ts.toDate) return ts.toDate().toLocaleString();
  return new Date(ts).toLocaleString();
}

// --- Confessions Section ---
function renderAdminCard(docId, data) {
  const { text, createdAt, userId, reports, language, platform, userAgent, likes, replies, deviceInfo = {} } = data;
  const date = formatTimestamp(createdAt);

  const box = document.createElement('div');
  box.className = 'confession-box';
  box.innerHTML = `
    <div class="confession-text">${escapeHTML(text || "[No Text]")}</div>
    <div class="meta"><strong>📅 Submitted:</strong> ${date}</div>
    <div class="meta"><strong>🧑 User ID:</strong> ${userId || "N/A"}</div>
    <div class="meta"><strong>⚠️ Reports:</strong> ${reports || 0}</div>
    <div class="meta"><strong>❤️ Likes:</strong> ${likes || 0}</div>
    <div class="meta"><strong>💬 Replies:</strong> ${replies?.length || 0}</div>
    <div class="meta-section">
      <div class="meta"><strong>🌐 Language:</strong> ${language || "N/A"}</div>
      <div class="meta"><strong>💻 Platform:</strong> ${platform || "N/A"}</div>
      <div class="meta"><strong>🕵️ User Agent:</strong> ${userAgent || "N/A"}</div>
    </div>
    <div class="meta-section">
      <div class="meta"><strong>📱 Device Info:</strong></div>
      <pre style="font-size:13px;background:#f1f1f1;padding:8px;border-radius:5px;overflow-x:auto;">
${escapeHTML(JSON.stringify(deviceInfo, null, 2))}
      </pre>
    </div>
    <div class="meta">
      <button onclick="deleteConfession('${docId}')">🗑️ Delete Confession</button>
    </div>
  `;
  adminFeed.appendChild(box);
}

window.deleteConfession = async function(id) {
  if (!confirm("Are you sure you want to delete this confession?")) return;
  await deleteDoc(doc(db, 'newconfessions', id));
};

// Listen for confessions
const confessionsQuery = query(collection(db, 'newconfessions'), orderBy('createdAt', 'desc'));
onSnapshot(confessionsQuery, snapshot => {
  adminFeed.innerHTML = '';
  snapshot.forEach(docSnap => renderAdminCard(docSnap.id, docSnap.data()));
});

// --- Visitors Section ---
async function fetchVisitors() {
  const snapshot = await getDocs(collection(db, "visitors"));
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

async function renderVisitors() {
  const visitors = await fetchVisitors();
  adminVisitorsContainer.innerHTML = '';

  visitors.sort((a,b)=> {
    const aTime = a.lastVisitAt?.toDate ? a.lastVisitAt.toDate().getTime() : 0;
    const bTime = b.lastVisitAt?.toDate ? b.lastVisitAt.toDate().getTime() : 0;
    return bTime - aTime;
  });

  for (const v of visitors) {
    const box = document.createElement('div');
    box.className = 'visitor-box';
    let sessions = await getDocs(collection(db, "visitors", v.id, "sessions"));
    sessions = sessions.docs.map(snap => snap.data());

    const sessionHtml = sessions.map(s => `
      <div class="session-item">
        <p>Visited At: ${formatTimestamp(s.visitedAt)}</p>
        <p>Page: ${escapeHTML(s.page)}</p>
      </div>
    `).join('');

    box.innerHTML = `
      <h3>Visitor ID: ${escapeHTML(v.id)}</h3>
      <p>First Visit: ${formatTimestamp(v.firstVisitAt)}</p>
      <p>Last Visit: ${formatTimestamp(v.lastVisitAt)}</p>
      <p>Total Visits: ${v.visitCount || 0}</p>
      <p>Device: ${v.deviceInfo?.deviceType || 'Unknown'}</p>
      <p>OS: ${v.deviceInfo?.os || 'Unknown'}</p>
      <p>Browser: ${v.deviceInfo?.browser || 'Unknown'}</p>
      <p>Screen: ${v.deviceInfo?.screenResolution || 'Unknown'}</p>
      <p>Language: ${v.deviceInfo?.language || 'Unknown'}</p>
      <button onclick="this.nextElementSibling.style.display=this.nextElementSibling.style.display==='none'?'block':'none'">
        Toggle Sessions (${sessions.length})
      </button>
      <div class="sessions-container" style="display:none">${sessionHtml}</div>
    `;
    adminVisitorsContainer.appendChild(box);
  }

  // Stats
  totalVisitorsEl.textContent = visitors.length;
  if (visitors.length) {
    const first = visitors.reduce((earliest,v)=> {
      const t = v.firstVisitAt?.toDate ? v.firstVisitAt.toDate() : new Date();
      return !earliest||t<earliest?t:earliest;
    }, null);
    const last = visitors.reduce((latest,v)=> {
      const t = v.lastVisitAt?.toDate ? v.lastVisitAt.toDate() : new Date();
      return !latest||t>latest?t:latest;
    }, null);
    const days = Math.max((last-first)/(1000*60*60*24),1);
    avgVisitorsEl.textContent = (visitors.length/days).toFixed(1);
    recentVisitorEl.textContent = visitors[0]?.id || "N/A";
  }
}

renderVisitors();
