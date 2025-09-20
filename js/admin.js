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

const db = getFirestore(app);
const auth = getAuth(app);
const confessionCol = collection(db, "confession");

// ------------------- DOM -------------------
const adminFeed = document.getElementById("adminFeed");

// ------------------- MODAL -------------------
function showModal(message) {
  const modal = document.getElementById("modal");
  const modalMessage = document.getElementById("modalMessage");
  if (!modal || !modalMessage) return;
  modalMessage.textContent = message;
  modal.style.display = "block";
  clearTimeout(showModal.hideTimeout);
  showModal.hideTimeout = setTimeout(() => (modal.style.display = "none"), 3000);
}

// ------------------- RENDER CONFESSIONS -------------------
function renderConfession(docSnap) {
  const data = docSnap.data();
  const docId = docSnap.id;

  const card = document.createElement("div");
  card.className = "admin-confession";

  let html = `
    <div><strong>ID:</strong> ${docId}</div>
    <div><strong>User:</strong> ${data.userId}</div>
    <div><strong>Likes:</strong> ${data.likes || 0}</div>
    <div><strong>Created:</strong> ${new Date(data.createdAt).toLocaleString()}</div>
  `;

  if (data.imageURL) {
    html += `<div><img src="${data.imageURL}" class="admin-image"></div>`;
    if (data.status === "pending") {
      html += `<button onclick="approveImage('${docId}')" class="approve-btn">✅ Approve Image</button>`;
    }
  }

  card.innerHTML = html;
  adminFeed.appendChild(card);
}

// ------------------- APPROVE IMAGE -------------------
window.approveImage = async function (docId) {
  const docRef = doc(db, "confession", docId);
  try {
    await updateDoc(docRef, { status: "approved" });
    showModal("✅ Image approved!");
    fetchAdminFeed();
  } catch (e) {
    console.error(e);
    showModal("⚠️ Failed to approve image");
  }
};

// ------------------- FETCH ALL CONFESSIONS -------------------
async function fetchAdminFeed() {
  try {
    const q = query(confessionCol, orderBy("createdAt", "desc"));
    const snapshot = await getDocs(q);
    adminFeed.innerHTML = "";
    snapshot.forEach(renderConfession);
  } catch (e) {
    console.error(e);
    showModal("⚠️ Failed to load feed");
  }
}

// ------------------- AUTH + INIT -------------------
onAuthStateChanged(auth, async (user) => {
  if (user) {
    console.log("✅ Admin signed in:", user.uid);
    fetchAdminFeed();
  }
});

signInAnonymously(auth).catch((e) => console.error("Auth error", e));
