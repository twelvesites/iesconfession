// Firebase init
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getFirestore, doc, getDoc, updateDoc, onSnapshot
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

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

// Modal handler
const modal = document.getElementById('modal');
function showModal(msg, duration = 5500) {
  modal.textContent = msg;
  modal.style.display = 'block';
  clearTimeout(modal._timeout);
  modal._timeout = setTimeout(() => { modal.style.display = 'none'; }, duration);
}

// Sound
const sendSound = new Audio('send.mp3');

// LocalStorage helpers
function setLocal(name, value) {
  localStorage.setItem(name, JSON.stringify(value));
}
function getLocal(name) {
  const val = localStorage.getItem(name);
  if (!val) return null;
  try {
    return JSON.parse(val);
  } catch (e) {
    console.warn(`⚠️ Corrupted localStorage for ${name}, resetting.`, e);
    localStorage.removeItem(name);
    return null;
  }
}
function getOrCreateUserId() {
  let userId = getLocal('userId');
  if (!userId) {
    userId = crypto.randomUUID();
    setLocal('userId', userId);
  }
  return userId;
}
const currentUserId = getOrCreateUserId();
let likedReplies = getLocal('likedReplies') || [];

// Moderation API
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
    console.log("🧠 Gemini verdict:", data);
    return data.verdict === "BLOCK";
  } catch (err) {
    console.error("❌ Moderation error:", err);
    return false;
  }
}

// Elements
const urlParams = new URLSearchParams(window.location.search);
const postId = urlParams.get('id');
const postBox = document.getElementById("post");
const repliesBox = document.getElementById("replies");
const replyInput = document.getElementById("replyInput");
const sendBtn = document.getElementById("sendReply");

if (!postId) {
  postBox.innerHTML = "<p>Error: Confession ID not found.</p>";
  repliesBox.innerHTML = "";
  sendBtn.disabled = true;
}

let currentReplies = [];

function escapeHTML(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function renderReplies(replies) {
  if (!replies.length) {
    repliesBox.innerHTML = "<p>No replies yet. Be the first!</p>";
    return;
  }
  repliesBox.innerHTML = '';
  replies
    .slice()
    .sort((a, b) => b.createdAt - a.createdAt)
    .forEach(reply => {
      const liked = likedReplies.includes(reply.id);
      const isMine = reply.userId === currentUserId;
      const replyDiv = document.createElement('div');
      replyDiv.className = 'reply-box';
      replyDiv.innerHTML = `
        <p>${escapeHTML(reply.text)}</p>
        <div class="reply-actions">
          <button onclick="event.stopPropagation(); likeReply('${reply.id}')">${liked ? '❤️' : '🤍'} ${reply.likes || 0}</button>
          ${isMine ? `<button onclick=\"event.stopPropagation(); replyDelete('${reply.id}')\">🗑️ Delete</button>` : ''}
        </div>
      `;
      repliesBox.appendChild(replyDiv);
    });
}

async function loadPost() {
  document.getElementById('loading').style.display = 'block';
  postBox.style.display = 'none';
  repliesBox.style.display = 'none';

  const docRef = doc(db, "newconfessions", postId);
  const docSnap = await getDoc(docRef);

  document.getElementById('loading').style.display = 'none';
  postBox.style.display = 'block';
  repliesBox.style.display = 'block';

  if (!docSnap.exists()) {
    postBox.innerHTML = "<p>Confession not found.</p>";
    repliesBox.innerHTML = "";
    sendBtn.disabled = true;
    return;
  }

  const data = docSnap.data();
  postBox.innerHTML = `
    <div class="confession-box">
      <p>${escapeHTML(data.text)}</p>
      <p>${data.likes || 0} likes</p>
    </div>
  `;
  currentReplies = data.replies || [];
  renderReplies(currentReplies);
}

window.likeReply = async function(id) {
  const docRef = doc(db, "newconfessions", postId);
  const idx = currentReplies.findIndex(r => r.id === id);
  if (idx === -1) return;
  const reply = { ...currentReplies[idx] };
  let newLikes = reply.likes || 0;
  const isLiked = likedReplies.includes(id);
  if (isLiked) {
    newLikes = Math.max(0, newLikes - 1);
    likedReplies = likedReplies.filter(x => x !== id);
  } else {
    newLikes++;
    likedReplies.push(id);
  }
  currentReplies[idx] = { ...reply, likes: newLikes };
  try {
    await updateDoc(docRef, { replies: currentReplies });
    setLocal('likedReplies', likedReplies);
    renderReplies(currentReplies);
  } catch (err) {
    console.error("❌ Failed to like:", err);
    showModal("Failed to update like. Try again.");
  }
};

window.replyDelete = async function(id) {
  if (!confirm("Delete your reply? This action cannot be undone.")) return;
  const docRef = doc(db, "newconfessions", postId);
  const idx = currentReplies.findIndex(r => r.id === id);
  const reply = currentReplies[idx];
  if (!reply) return;
  if (reply.userId !== currentUserId) {
    showModal("🚫 You can only delete your own replies.");
    return;
  }
  currentReplies = currentReplies.filter(r => r.id !== id);
  await updateDoc(docRef, { replies: currentReplies });
  let userReplies = getLocal('userReplies') || [];
  userReplies = userReplies.filter(x => x !== id);
  setLocal('userReplies', userReplies);
};

function disableSendButtonCooldown(duration = 60) {
  const endTime = Date.now() + duration * 1000;
  localStorage.setItem('replyCooldownEnd', endTime.toString());
  updateCooldownTimer();
}

let cooldownInterval;
function updateCooldownTimer() {
  clearInterval(cooldownInterval);
  cooldownInterval = setInterval(() => {
    const now = Date.now();
    const endTime = parseInt(localStorage.getItem('replyCooldownEnd'), 10);
    if (!endTime || now >= endTime) {
      sendBtn.textContent = 'Send';
      sendBtn.disabled = replyInput.value.trim().length === 0;
      localStorage.removeItem('replyCooldownEnd');
      clearInterval(cooldownInterval);
      return;
    }
    const secondsLeft = Math.ceil((endTime - now) / 1000);
    sendBtn.textContent = `Wait ${secondsLeft}s`;
    sendBtn.disabled = true;
  }, 1000);
}

sendBtn.addEventListener('click', async () => {
  const text = replyInput.value.trim();
  if (!text) return;
  const cooldownEnd = parseInt(localStorage.getItem('replyCooldownEnd'), 10);
  const now = Date.now();
  if (cooldownEnd && now < cooldownEnd) {
    const secondsLeft = Math.ceil((cooldownEnd - now) / 1000);
    showModal(`⏳ Please wait ${secondsLeft}s before replying again.`);
    return;
  }
  sendBtn.disabled = true;
  showModal("⏳ AI Checking...");
  try {
    const isBlocked = await moderateText(text);
    if (isBlocked) {
      showModal("🛑 This reply isn't safe to post. Please keep it kind and respectful.");
      sendBtn.disabled = false;
      return;
    }
  } catch (e) {
    console.error("❌ Moderation error:", e);
    showModal("⚠️ Could not verify reply safety. Try again later.");
    sendBtn.disabled = false;
    return;
  }
  try {
    const docRef = doc(db, "newconfessions", postId);
    const docSnap = await getDoc(docRef);
    if (!docSnap.exists()) {
      showModal("Error: Confession not found.");
      sendBtn.disabled = false;
      return;
    }
    let replies = docSnap.data().replies || [];
    const newReply = {
      id: `reply_${Date.now()}_${crypto.randomUUID()}`,
      text,
      userId: currentUserId,
      likes: 0,
      createdAt: Date.now()
    };
    replies.push(newReply);
    await updateDoc(docRef, { replies });
    replyInput.value = '';
    sendSound.play();
    disableSendButtonCooldown(60);
    showModal("✅ Reply posted!");
  } catch (e) {
    console.error("Firebase error:", e);
    showModal("❌ Failed to post reply. Try again later.");
  } finally {
    sendBtn.disabled = false;
  }
});

window.addEventListener('load', () => {
  const endTime = localStorage.getItem('replyCooldownEnd');
  if (endTime && Date.now() < parseInt(endTime, 10)) {
    updateCooldownTimer();
  } else {
    sendBtn.textContent = 'Send';
    sendBtn.disabled = replyInput.value.trim().length === 0;
  }
});

replyInput.addEventListener('input', () => {
  sendBtn.disabled = replyInput.value.trim().length === 0;
});

replyInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendBtn.click();
  }
});

onSnapshot(doc(db, "newconfessions", postId), (docSnap) => {
  if (docSnap.exists()) {
    currentReplies = docSnap.data().replies || [];
    renderReplies(currentReplies);
  }
});

loadPost();
