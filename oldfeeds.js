import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
  import {
    getFirestore, collection, addDoc, query, orderBy, onSnapshot,
    updateDoc, doc, deleteDoc, getDoc
  } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

  // Load names from JSON file (put real_names_list.json in your project folder)
  let nameList = [];
  fetch('real_names_list.json')
    .then(res => res.json())
    .then(data => nameList = data.map(n => n.toLowerCase()));

  function escapeHTML(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  function detectNames(text) {
    const lowerText = text.toLowerCase();
    return nameList.filter(name => lowerText.includes(name));
  }

  function censorNamesWithHighlight(text) {
    let escapedText = escapeHTML(text);
    detectNames(text).forEach(name => {
      const regex = new RegExp(`\\b${name}\\b`, 'gi');
      escapedText = escapedText.replace(regex, '<span style="color:red">(someone)</span>');
    });
    return escapedText;
  }

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

  const feed = document.getElementById('confessionFeed');
  const input = document.getElementById('confessionInput');
  const sendBtn = document.getElementById('sendBtn');

  function setCookie(name, value, days = 30) {
    const expires = new Date(Date.now() + days * 864e5).toUTCString();
    document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=/`;
  }
  function getCookie(name) {
    return document.cookie.split('; ').reduce((r, v) => {
      const parts = v.split('=');
      return parts[0] === name ? decodeURIComponent(parts[1]) : r
    }, '');
  }
  function addToCookieArray(name, value) {
    let arr = JSON.parse(getCookie(name) || '[]');
    if (!arr.includes(value)) {
      arr.push(value);
      setCookie(name, JSON.stringify(arr));
    }
  }
  function removeFromCookieArray(name, value) {
    let arr = JSON.parse(getCookie(name) || '[]');
    arr = arr.filter(item => item !== value);
    setCookie(name, JSON.stringify(arr));
  }
  function cookieHas(name, value) {
    let arr = JSON.parse(getCookie(name) || '[]');
    return arr.includes(value);
  }

  function getOrCreateUserId() {
    let userId = getCookie('userId');
    if (!userId) {
      userId = crypto.randomUUID();
      setCookie('userId', userId, 365);
    }
    return userId;
  }
  const currentUserId = getOrCreateUserId();

const MODERATION_API_URL = "https://twelve-ai.vercel.app/api/moderate";

async function moderateText(text) {
  try {
    const response = await fetch(MODERATION_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    console.log("🧠 Gemini verdict:", data);

    return data.verdict === "BLOCK";
  } catch (err) {
    console.error("❌ Moderation error:", err);
    return false;
  }
}


  function showModal(message) {
    const modal = document.getElementById('modal');
    const modalMessage = document.getElementById('modalMessage');
    if (!modal || !modalMessage) return;
    modalMessage.textContent = message;
    modal.style.display = 'block';
    clearTimeout(showModal.hideTimeout);
    showModal.hideTimeout = setTimeout(() => {
      modal.style.display = 'none';
    }, 5500);
  }

  window.likePost = async function(id) {
    const ref = doc(db, 'confessions', id);
    const snap = await getDoc(ref);
    if (!snap.exists()) return;
    const data = snap.data();
    let newLikes = data.likes || 0;
    if (cookieHas('likedPosts', id)) {
      newLikes--;
      removeFromCookieArray('likedPosts', id);
    } else {
      newLikes++;
      addToCookieArray('likedPosts', id);
    }
    await updateDoc(ref, { likes: newLikes });
  };

  window.deletePost = async function(id) {
    if (!confirm("Delete your confession? This can't be undone.")) return;
    await deleteDoc(doc(db, 'confessions', id));
    removeFromCookieArray('userPosts', id);
  };

  window.reportPost = async function(id) {
    if (!confirm("Are you sure you want to report this confession?")) return;
    const ref = doc(db, 'confessions', id);
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

  function renderConfession(docId, data) {
    const isMine = data.userId === currentUserId;
    const liked = cookieHas('likedPosts', docId);
    const card = document.createElement('div');
    card.className = 'confession-box';
    card.onclick = () => goToReply(docId);
    card.innerHTML = `
      <div class="confession-text">${censorNamesWithHighlight(data.text)}</div>
      <div class="like-reply-bar">
        <button onclick="event.stopPropagation(); likePost('${docId}')">${liked ? '❤️' : '🤍'} ${data.likes || 0}</button>
        ${isMine 
          ? `<button onclick="event.stopPropagation(); deletePost('${docId}')">🗑️ Delete</button>` 
          : `<button onclick="event.stopPropagation(); reportPost('${docId}')">🚩 Report</button>`}
      </div>
    `;
    feed.appendChild(card);
  }

  const q = query(collection(db, 'confessions'), orderBy('createdAt', 'desc'));
  onSnapshot(q, snapshot => {
    feed.innerHTML = '';
    snapshot.forEach(docSnap => {
      renderConfession(docSnap.id, docSnap.data());
    });
  });

  const sendSound = new Audio('send.mp3');

  function disableSendButtonCooldown(duration = 60) {
    const endTime = Date.now() + duration * 1000;
    localStorage.setItem('sendCooldownEnd', endTime.toString());
    updateCooldownTimer();
  }

  let cooldownInterval;
  function updateCooldownTimer() {
    clearInterval(cooldownInterval);
    cooldownInterval = setInterval(() => {
      const now = Date.now();
      const endTime = parseInt(localStorage.getItem('sendCooldownEnd'), 10);
      if (!endTime || now >= endTime) {
        sendBtn.textContent = 'Send';
        sendBtn.disabled = input.value.trim().length === 0;
        localStorage.removeItem('sendCooldownEnd');
        clearInterval(cooldownInterval);
        return;
      }
      const secondsLeft = Math.ceil((endTime - now) / 1000);
      sendBtn.textContent = `Wait ${secondsLeft}s`;
      sendBtn.disabled = true;
    }, 1000);
  }

  async function attemptToSendConfession() {
  const cooldownEnd = parseInt(localStorage.getItem('sendCooldownEnd'), 10);
  const now = Date.now();

  // 🚫 Check if still in cooldown
  if (cooldownEnd && now < cooldownEnd) {
    const secondsLeft = Math.ceil((cooldownEnd - now) / 1000);
    showModal(`⏳ Please wait ${secondsLeft}s before sending again.`);
    return;
  }

  const text = input.value.trim();
  if (!text) return;

  sendBtn.disabled = true;
  showModal("⏳ AI Checking...");

  try {
    const isBlocked = await moderateText(text);

    if (isBlocked) {
      showModal("🛑 This message isn't safe to post. Please keep it kind, anonymous and respectful.");
      sendBtn.disabled = false;
      return;
    }

    await addDoc(collection(db, 'confessions'), {
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

    input.value = '';
    sendSound.play();
    disableSendButtonCooldown(60);
    showModal("✅ Posted!");

  } catch (e) {
    console.error("Error:", e);
    showModal("⚠️ SERVER DOWN! Try again.");
  } finally {
    sendBtn.disabled = false;
  }
}


  sendBtn.addEventListener('click', attemptToSendConfession);

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      attemptToSendConfession();
    }
  });

  input.addEventListener('input', () => {
    sendBtn.disabled = input.value.trim().length === 0;
  });

  window.addEventListener('load', () => {
    const endTime = localStorage.getItem('sendCooldownEnd');
    if (endTime && Date.now() < parseInt(endTime, 10)) {
      updateCooldownTimer();
    } else {
      sendBtn.textContent = 'Send';
      sendBtn.disabled = input.value.trim().length === 0;
    }
  });
