// ------------------- DOM ELEMENTS -------------------
const feed = document.getElementById('confessionFeed');
const input = document.getElementById('confessionInput');
const sendBtn = document.getElementById('sendBtn');

// ------------------- LOCALSTORAGE HELPERS -------------------
function setLS(key, value) { localStorage.setItem(key, JSON.stringify(value)); }
function getLS(key) { const val = localStorage.getItem(key); return val ? JSON.parse(val) : null; }
function addToLSArray(key, value) { let arr = getLS(key) || []; if (!arr.includes(value)) { arr.push(value); setLS(key, arr); } }
function removeFromLSArray(key, value) { let arr = getLS(key) || []; arr = arr.filter(item => item !== value); setLS(key, arr); }
function lsHas(key, value) { let arr = getLS(key) || []; return arr.includes(value); }

// ------------------- USER ID -------------------
function getOrCreateUserId() {
  let userId = localStorage.getItem('userId');
  if (!userId) {
    userId = crypto.randomUUID();
    localStorage.setItem('userId', userId);
  }
  return userId;
}
const currentUserId = getOrCreateUserId();

// ------------------- MODAL -------------------
function showModal(message) {
  const modal = document.getElementById('modal');
  const modalMessage = document.getElementById('modalMessage');
  if (!modal || !modalMessage) return;
  modalMessage.textContent = message;
  modal.style.display = 'block';
  clearTimeout(showModal.hideTimeout);
  showModal.hideTimeout = setTimeout(() => { modal.style.display = 'none'; }, 5500);
}

// ------------------- API CONFIG -------------------
const API_URL = 'https://iestea-backend.vercel.app/api/confess';

const ORIGIN_SECRET = "f1b2c3d4e5f67890123456789abcdef0123456789abcdef0123456789abcdef";

// ------------------- API HELPERS -------------------
async function apiFetch(method = "GET", body) {
  const options = {
    method,
    headers: {
      "Content-Type": "application/json",
      "x-origin-secret": ORIGIN_SECRET
    },
  };
  if (body) options.body = JSON.stringify(body);

  try {
    const res = await fetch(API_URL, options);
    if (!res.ok) throw new Error(`Server error ${res.status}`);
    return await res.json();
  } catch (err) {
    console.error(`API ${method} error:`, err);
    showModal(`⚠️ ${method} failed`);
    return method === "GET" ? { confessions: [] } : { ok: false };
  }
}

// Convenience wrappers
const apiGet = () => apiFetch("GET");
const apiPost = (body) => apiFetch("POST", body);
const apiPatch = (body) => apiFetch("PATCH", body);
const apiDelete = (body) => apiFetch("DELETE", body);

// ------------------- RENDER CONFESSIONS -------------------
function renderConfession(doc) {
  const data = doc.data;
  const docId = doc.id;
  const liked = lsHas('likedPosts', docId);
  const isMine = data.userId === currentUserId;

  const card = document.createElement('div');
  card.className = 'confession-box';
  card.style.position = 'relative';
  card.innerHTML = `
    <div class="confession-text">${data.text}</div>
    <div class="like-reply-bar">
      <button onclick="event.stopPropagation(); likePost('${docId}')">${liked ? '❤️' : '🤍'} ${data.likes || 0}</button>
      ${isMine
        ? `<button onclick="event.stopPropagation(); deletePost('${docId}')">🗑️ Delete</button>`
        : `<button onclick="event.stopPropagation(); reportPost('${docId}')">🚩 Report</button>`}
    </div>
  `;
  feed.appendChild(card);
}

// ------------------- FEED -------------------
async function fetchFeed() {
  const data = await apiGet();
  feed.innerHTML = '';
  if (data.confessions) {
    data.confessions.sort((a,b) => b.data.createdAt - a.data.createdAt);
    data.confessions.forEach(renderConfession);
  }
}

// ------------------- LIKE -------------------
async function likePost(id) {
  const liked = lsHas('likedPosts', id);
  const res = await apiPatch({ id, userId: currentUserId, action: liked ? "unlike" : "like" });
  if (res.ok) {
    liked ? removeFromLSArray('likedPosts', id) : addToLSArray('likedPosts', id);
    fetchFeed();
  }
}

// ------------------- DELETE -------------------
async function deletePost(id) {
  if (!confirm("Delete your confession? This can't be undone.")) return;
  const res = await apiDelete({ id, userId: currentUserId });
  if (res.ok) fetchFeed();
}

// ------------------- REPORT -------------------
async function reportPost(id) {
  if (!confirm("Report this confession?")) return;
  const res = await apiPatch({ id, action: "report" });
  if (res.ok) showModal("✅ Reported successfully");
}

// ------------------- COOLDOWN -------------------
const COOLDOWN_KEY = "sendCooldownEnd";
const COOLDOWN_DURATION = 60 * 1000;
let cooldownInterval;

function startCooldown() {
  const endTime = Date.now() + COOLDOWN_DURATION;
  localStorage.setItem(COOLDOWN_KEY, endTime.toString());
  updateCooldown();
  cooldownInterval = setInterval(updateCooldown, 1000);
}

function updateCooldown() {
  const endTime = parseInt(localStorage.getItem(COOLDOWN_KEY), 10);
  const now = Date.now();

  if (!endTime || now >= endTime) {
    sendBtn.textContent = "Send";
    sendBtn.disabled = input.value.trim().length === 0;
    localStorage.removeItem(COOLDOWN_KEY);
    clearInterval(cooldownInterval);
    return;
  }

  const secondsLeft = Math.ceil((endTime - now) / 1000);
  sendBtn.textContent = `Wait ${secondsLeft}s`;
  sendBtn.disabled = true;
}

// Resume cooldown on load
window.addEventListener("load", () => {
  if (localStorage.getItem(COOLDOWN_KEY)) {
    updateCooldown();
    cooldownInterval = setInterval(updateCooldown, 1000);
  } else {
    sendBtn.textContent = "Send";
    sendBtn.disabled = input.value.trim().length === 0;
  }
});

// ------------------- SEND CONFESSION -------------------
async function sendConfession() {
  const text = input.value.trim();
  if (!text) return;

  const endTime = parseInt(localStorage.getItem(COOLDOWN_KEY), 10);
  if (endTime && Date.now() < endTime) {
    const secondsLeft = Math.ceil((endTime - Date.now()) / 1000);
    return showModal(`⏳ Please wait ${secondsLeft}s before sending again`);
  }

  sendBtn.disabled = true;
  showModal("⏳ AI checking...");

  try {
    // --- moderation ---
    const MODERATION_API_URL = "https://twelve-ai.vercel.app/api/moderate";
    let modData = { verdict: "ALLOW" };
    try {
      const modRes = await fetch(MODERATION_API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text })
      });
      if (modRes.ok) modData = await modRes.json();
    } catch(e){ console.warn("Moderation skipped"); }

    if (modData.verdict === "BLOCK") {
      showModal("🛑 This message isn't safe to post.");
      sendBtn.disabled = false;
      return;
    }

    // --- post confession ---
    const deviceInfo = {
      platform: navigator.platform,
      userAgent: navigator.userAgent,
      language: navigator.language
    };
    const res = await apiPost({ text, userId: currentUserId, deviceInfo });
    if (res.ok) {
      input.value = '';
      showModal("✅ Posted!");
      fetchFeed();
      startCooldown();
    } else showModal("⚠️ Failed to post");

  } catch (e) {
    console.error(e);
    showModal("⚠️ Server error");
  } finally {
    sendBtn.disabled = false;
  }
}

// ------------------- EVENT LISTENERS -------------------
sendBtn.addEventListener('click', sendConfession);
input.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendConfession();
  }
});

// ------------------- INITIAL LOAD -------------------
fetchFeed();

// Make functions global for inline onclick in buttons
window.likePost = likePost;
window.deletePost = deletePost;
window.reportPost = reportPost;
window.sendConfession = sendConfession;
