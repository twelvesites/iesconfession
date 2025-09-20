// ------------------- FIREBASE -------------------
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getFirestore, collection, addDoc, getDocs,
  doc, deleteDoc, updateDoc, query, orderBy
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { initializeAppCheck, ReCaptchaV3Provider } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app-check.js";

// ------------------- FIREBASE CONFIG -------------------
const firebaseConfig = {
  apiKey: "AIzaSyC6-5zaMpXdnof9XOatdQvGB2oPMwbPnHQ",
  authDomain: "iestea-app.firebaseapp.com",
  projectId: "iestea-app",
  storageBucket: "iestea-app.firebasestorage.app",
  messagingSenderId: "1081881696843",
  appId: "1:1081881696843:web:09afe29309ea5372f28bce",
  measurementId: "G-26RGJDN6EV"
};
const app = initializeApp(firebaseConfig);

// ------------------- APP CHECK -------------------
initializeAppCheck(app, {
  provider: new ReCaptchaV3Provider('6LfRac8rAAAAANkfnEQe02zwvcZzdbM8y6Vsa8-J'),
  isTokenAutoRefreshEnabled: true
});

// ------------------- AUTH -------------------
const auth = getAuth(app);
let currentUserId = null;
signInAnonymously(auth)
  .then(() => console.log("Signed in anonymously"))
  .catch(err => console.error("Auth error:", err));

onAuthStateChanged(auth, user => {
  if(user) {
    currentUserId = user.uid;
    console.log("Auth ready:", currentUserId);
  }
});

// ------------------- FIRESTORE -------------------
const db = getFirestore(app);
const confessionCol = collection(db, "confession");

// ------------------- SUPABASE -------------------
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';
const SUPABASE_URL = 'https://hvqjilehxoctkmygzwtw.supabase.co';
const SUPABASE_KEY = 'sb_publishable_hHfzJPmWvWyMPKAS7IcCGA_zW2xnBzW';
const supabaseClient = createClient(SUPABASE_URL, SUPABASE_KEY);

// ------------------- DOM ELEMENTS -------------------
const feed = document.getElementById('confessionFeed');
const input = document.getElementById('confessionInput');
const sendBtn = document.getElementById('sendBtn');
const openModalBtn = document.getElementById('openUploadModal');
const uploadModal = document.getElementById('uploadModal');
const closeModalBtn = document.getElementById('closeUploadModal');
const modalFileInput = document.getElementById('modalFileInput');
const modalUploadBtn = document.getElementById('modalUploadBtn');
const previewContainer = document.getElementById('previewContainer');
const imagePreview = document.getElementById('imagePreview');

// ------------------- LOCALSTORAGE HELPERS -------------------
function setLS(key, value) { localStorage.setItem(key, JSON.stringify(value)); }
function getLS(key) { const val = localStorage.getItem(key); return val ? JSON.parse(val) : null; }
function addToLSArray(key, value) { let arr = getLS(key) || []; if (!arr.includes(value)) { arr.push(value); setLS(key, arr); } }
function removeFromLSArray(key, value) { let arr = getLS(key) || []; arr = arr.filter(i => i !== value); setLS(key, arr); }
function lsHas(key, value) { return (getLS(key) || []).includes(value); }

// ------------------- UTILS -------------------
function showModal(message) {
  const modal = document.getElementById('modal');
  const modalMessage = document.getElementById('modalMessage');
  if (!modal || !modalMessage) return;
  modalMessage.textContent = message;
  modal.style.display = 'block';
  clearTimeout(showModal.hideTimeout);
  showModal.hideTimeout = setTimeout(() => { modal.style.display = 'none'; }, 3500);
}

// ------------------- CONFESSIONS -------------------
function renderConfession(docSnap) {
  const data = docSnap.data();
  const docId = docSnap.id;
  const liked = lsHas('likedPosts', docId);
  const isMine = data.userId === currentUserId;
  const showImage = !!data.imageURL;
  if (!data.text && !showImage) return;
  if (showImage && data.status !== "approved" && !isMine) return;

  const card = document.createElement('div');
  card.className = 'confession-box';
  let html = `<div class="confession-text">${data.text || ''}</div>`;
if (showImage && (data.status === "approved" || isMine))
  html += `<img src="${data.imageURL}" class="confession-image">`;
html += `
  <div class="like-reply-bar">
    ${isMine
      ? `<button onclick="event.stopPropagation(); deletePost('${docId}')">🗑️ Delete</button>`
      : `<button onclick="event.stopPropagation(); reportPost('${docId}')">🚩 Report</button>`}
  </div>`;

  card.innerHTML = html;
  feed.appendChild(card);
}

async function fetchFeed() {
  const loader = document.getElementById('feedLoader');
  feed.innerHTML = '';
  if(loader) loader.style.display = 'flex';

  try {
    const q = query(confessionCol, orderBy("createdAt", "desc"));
    const snapshot = await getDocs(q);
    feed.innerHTML = '';
    snapshot.forEach(renderConfession);
  } catch (e) {
    console.error(e);
    showModal("⚠️ Failed to load feed");
  } finally {
    if(loader) loader.style.display = 'none';
  }
}

// ------------------- POST / LIKE / DELETE / REPORT -------------------
async function likePost(id) {
  const liked = lsHas('likedPosts', id);
  const docRef = doc(db, "confession", id);
  const snap = await getDocs(docRef);
  const likes = snap.data().likes || 0;
  await updateDoc(docRef, { likes: liked ? likes - 1 : likes + 1 });
  liked ? removeFromLSArray('likedPosts', id) : addToLSArray('likedPosts', id);
  fetchFeed();
}

async function deletePost(id) {
  if (!confirm("Delete your confession?")) return;
  await deleteDoc(doc(db, "confession", id));
  fetchFeed();
}

async function reportPost(id) {
  if (!confirm("Report this confession?")) return;
  await updateDoc(doc(db, "confession", id), { reported: true });
  showModal("✅ Reported");
}

// ------------------- COOLDOWN -------------------
const COOLDOWN_KEY = "sendCooldownEnd";
const COOLDOWN_DURATION = 60000;
let cooldownInterval;

function refreshSendBtn() {
  const text = input.value.trim();
  const end = parseInt(localStorage.getItem(COOLDOWN_KEY), 10);
  const inCd = end && Date.now() < end;
  sendBtn.disabled = !text || inCd;
}

function updateCooldown() {
  const end = parseInt(localStorage.getItem(COOLDOWN_KEY), 10);
  const now = Date.now();
  if (!end || now >= end) {
    clearInterval(cooldownInterval);
    sendBtn.textContent = "Send";
    localStorage.removeItem(COOLDOWN_KEY);
    refreshSendBtn();
    return;
  }
  const sec = Math.ceil((end - now) / 1000);
  sendBtn.textContent = `Wait ${sec}s`;
}

function startCooldown() {
  const end = Date.now() + COOLDOWN_DURATION;
  localStorage.setItem(COOLDOWN_KEY, end);
  updateCooldown();
  cooldownInterval = setInterval(updateCooldown, 1000);
}

// ------------------- SEND CONFESSION (with AI moderation) -------------------
async function sendConfession() {
  const text = input.value.trim();
  if (!text) return;

  // cooldown check
  const end = parseInt(localStorage.getItem(COOLDOWN_KEY), 10);
  if (end && Date.now() < end) {
    const sec = Math.ceil((end - Date.now()) / 1000);
    return showModal(`⏳ Wait ${sec}s`);
  }

  sendBtn.disabled = true;
  showModal("⏳ AI checking...");

  try {
    // 1️⃣ call moderation API
    const MODERATION_API_URL = "https://twelve-ai.vercel.app/api/moderate";
    let modData = { verdict: "ALLOW" };
    try {
      const modRes = await fetch(MODERATION_API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text })
      });
      if (modRes.ok) modData = await modRes.json();
    } catch (e) {
      console.warn("Moderation call failed, skipping:", e);
    }

    // 2️⃣ block if verdict is BLOCK
    if (modData.verdict === "BLOCK") {
      showModal("🛑 This message isn’t safe to post");
      refreshSendBtn();
      return;
    }

    // 3️⃣ post to Firestore
    await addDoc(confessionCol, {
      text,
      userId: currentUserId,
      likes: 0,
      createdAt: Date.now(),
      imageURL: '',
      status: '',
      posted: false,
      replies: [],
      reports: 0,
      deviceInfo: {
        platform: navigator.platform,
        userAgent: navigator.userAgent,
        language: navigator.language
      }
    });

    input.value = '';
    showModal("✅ Posted");
    fetchFeed();
    startCooldown();
  } catch (e) {
    console.error(e);
    showModal("⚠️ Failed to post");
  } finally {
    refreshSendBtn();
  }
}


// ------------------- IMAGE UPLOAD MODAL -------------------
function resetUploadModal() {
  modalFileInput.value = '';
  previewContainer.style.display = 'none';
  imagePreview.src = '';
  modalUploadBtn.style.display = 'none';
}

openModalBtn.addEventListener('click', () => {
  uploadModal.style.display = 'block';
  resetUploadModal();
});
closeModalBtn.addEventListener('click', () => uploadModal.style.display = 'none');
window.addEventListener('click', e => { if (e.target === uploadModal) uploadModal.style.display = 'none'; });

// preview logic
modalFileInput.addEventListener('change', () => {
  const file = modalFileInput.files[0];
  if (file) {
    const reader = new FileReader();
    reader.onload = e => {
      imagePreview.src = e.target.result;
      previewContainer.style.display = 'block';
      modalUploadBtn.style.display = 'inline-block';
    };
    reader.readAsDataURL(file);
  } else resetUploadModal();
});

// upload to supabase
modalUploadBtn.addEventListener('click', async () => {
  const file = modalFileInput.files[0];
  if (!file) return showModal("⚠️ Select an image");
  modalUploadBtn.textContent = "Uploading...";
  modalUploadBtn.disabled = true;

  const fileName = `${Date.now()}_${file.name}`;
  const path = `images/${fileName}`;
  const { error } = await supabaseClient.storage.from('confessions').upload(path, file);
  if (error) {
    showModal(`⚠️ Upload failed: ${error.message}`);
    modalUploadBtn.textContent = "Upload";
    modalUploadBtn.disabled = false;
    return;
  }
  const url = `${SUPABASE_URL}/storage/v1/object/public/confessions/${path}`;
  try {
    await addDoc(confessionCol, {
      text: '',
      userId: currentUserId,
      imageURL: url,
      likes: 0,
      createdAt: Date.now(),
      status: 'pending',
      posted: false,
      replies: [],
      reports: 0
    });
    showModal("✅ Image uploaded (pending)");
    uploadModal.style.display = 'none';
    fetchFeed();
  } catch (e) {
    console.error(e);
    showModal("⚠️ Could not save to Firestore");
  } finally {
    modalUploadBtn.textContent = "Upload";
    modalUploadBtn.disabled = false;
    resetUploadModal();
  }
});

// ------------------- INIT -------------------
sendBtn.addEventListener('click', sendConfession);
input.addEventListener('input', refreshSendBtn);
input.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendConfession();
  }
});
window.addEventListener('load', () => {
  if (localStorage.getItem(COOLDOWN_KEY)) {
    updateCooldown();
    cooldownInterval = setInterval(updateCooldown, 1000);
  }
  refreshSendBtn();

  // wait for auth to be ready
  const waitAuth = () => {
    if (currentUserId) {
      fetchFeed();
    } else {
      setTimeout(waitAuth, 100); // check every 100ms
    }
  };
  waitAuth();
});


// expose globally
window.likePost = likePost;
window.deletePost = deletePost;
window.reportPost = reportPost;
window.sendConfession = sendConfession;
