// ---------------- FIREBASE IMPORTS ----------------
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getFirestore, collection, addDoc, query, orderBy, onSnapshot,
  updateDoc, doc, deleteDoc, getDoc
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { initializeAppCheck, ReCaptchaV3Provider } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app-check.js";

// ---------------- FIREBASE CONFIG ----------------
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



const appCheck = initializeAppCheck(app, {
  provider: new ReCaptchaV3Provider('6LcItMgrAAAAANWhC3KA1C1AG6yFFB-GovQtCLi1'), 
  isTokenAutoRefreshEnabled: true
});

// ---------------- DOM ELEMENTS ----------------
const feed = document.getElementById('confessionFeed');
const input = document.getElementById('confessionInput');
const sendBtn = document.getElementById('sendBtn');

// ---------------- LOCALSTORAGE HELPERS ----------------
function setLS(key, value) { localStorage.setItem(key, JSON.stringify(value)); }
function getLS(key) { const val = localStorage.getItem(key); return val ? JSON.parse(val) : null; }
function addToLSArray(key, value) { let arr = getLS(key) || []; if (!arr.includes(value)) { arr.push(value); setLS(key, arr); } }
function removeFromLSArray(key, value) { let arr = getLS(key) || []; arr = arr.filter(item => item !== value); setLS(key, arr); }
function lsHas(key, value) { let arr = getLS(key) || []; return arr.includes(value); }

function getOrCreateUserId() {
  let userId = localStorage.getItem('userId');
  if (!userId) {
    userId = crypto.randomUUID();
    localStorage.setItem('userId', userId);
  }
  return userId;
}
const currentUserId = getOrCreateUserId();

// ---------------- MODERATION ----------------
const MODERATION_API_URL = "https://twelve-ai.vercel.app/api/moderate";
async function moderateText(text) {
  try {
    const response = await fetch(MODERATION_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    const data = await response.json();
    return data.verdict === "BLOCK";
  } catch (err) {
    console.error("❌ Moderation error:", err);
    return false;
  }
}

// ---------------- MODAL ----------------
function showModal(message) {
  const modal = document.getElementById('modal');
  const modalMessage = document.getElementById('modalMessage');
  if (!modal || !modalMessage) return;
  modalMessage.textContent = message;
  modal.style.display = 'block';
  clearTimeout(showModal.hideTimeout);
  showModal.hideTimeout = setTimeout(() => { modal.style.display = 'none'; }, 5500);
}

// ---------------- CONFESSION ACTIONS ----------------
window.likePost = async function(id) {
  const ref = doc(db, 'newconfessions', id);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  const data = snap.data();
  let newLikes = data.likes || 0;
  if (lsHas('likedPosts', id)) { newLikes--; removeFromLSArray('likedPosts', id); } 
  else { newLikes++; addToLSArray('likedPosts', id); }
  await updateDoc(ref, { likes: newLikes });
};

window.deletePost = async function(id) {
  const ref = doc(db, 'newconfessions', id);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;

  const data = snap.data();
  if (data.userId !== currentUserId) {
    showModal("❌ You can't delete someone else's post!");
    return;
  }

  if (!confirm("Delete your confession? This can't be undone.")) return;

  await deleteDoc(ref);
  removeFromLSArray('userPosts', id);
  showModal("✅ Deleted!");
};

window.reportPost = async function(id) {
  if (!confirm("Are you sure you want to report this confession?")) return;
  const ref = doc(db, 'newconfessions', id);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  const data = snap.data();
  const reports = (data.reports || 0) + 1;
  await updateDoc(ref, { reports });
  showModal("✅ Thanks for reporting. We'll check this out.");
};

window.goToReply = function(id) {
  window.location.href = `reply.html?id=${id}`;
};

// ---------------- RENDER CONFESSION ----------------
function renderConfession(docId, data) {
  const isMine = data.userId === currentUserId;
  const liked = lsHas('likedPosts', docId);

  const card = document.createElement('div');
  card.className = 'confession-box';
  card.style.position = 'relative';
  card.onclick = () => { window.location.href = `reply.html?id=${docId}`; };

  const replyCount = data.replies ? data.replies.length : 0;

  card.innerHTML = `
    <div class="confession-text">${data.text}</div>
    <div class="click-to-reply">${replyCount} ${replyCount === 1 ? 'reply' : 'replies'}</div>
    <div class="like-reply-bar">
      <button onclick="event.stopPropagation(); likePost('${docId}')">${liked ? '❤️' : '🤍'} ${data.likes || 0}</button>
      ${isMine 
        ? `<button onclick="event.stopPropagation(); deletePost('${docId}')">🗑️ Delete</button>` 
        : `<button onclick="event.stopPropagation(); reportPost('${docId}')">🚩 Report</button>`}
    </div>
  `;

  feed.appendChild(card);
}

// ---------------- FIRESTORE LISTENER ----------------
const q = query(collection(db, 'newconfessions'), orderBy('createdAt', 'desc'));
onSnapshot(q, snapshot => {
  feed.innerHTML = '';
  snapshot.forEach(docSnap => {
    renderConfession(docSnap.id, docSnap.data());
  });
});

// ---------------- SEND CONFESSION ----------------
const sendSound = new Audio('send.mp3');

async function attemptToSendConfession() {
  const text = input.value.trim();
  if (!text) return;

  sendBtn.disabled = true;
  showModal("⏳ AI Checking...");

  try {
    const isBlocked = await moderateText(text);
    if (isBlocked) {
      showModal("🛑 Confessions cannot be harassing or spreading secrets.");
      sendBtn.disabled = false;
      return;
    }

    const docRef = await addDoc(collection(db, 'newconfessions'), {
      text,
      likes: 0,
      replies: [],
      reports: 0,
      createdAt: Date.now(),
      userId: currentUserId,
      deviceInfo: {
        userAgent: navigator.userAgent,
        platform: navigator.platform,
        language: navigator.language,
      },
    });

    addToLSArray('userPosts', docRef.id);

    input.value = '';
    sendSound.play();
    showModal("✅ Posted!");
  } catch (e) {
    console.error("Error:", e);
    showModal("⚠️ Server down, try again.");
  } finally {
    sendBtn.disabled = false;
  }
}

sendBtn.addEventListener('click', attemptToSendConfession);
input.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); attemptToSendConfession(); } });
input.addEventListener('input', () => { sendBtn.disabled = input.value.trim().length === 0; });
