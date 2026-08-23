import { initializeApp } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js";
import {
  getAuth, GoogleAuthProvider,
  signInWithPopup, signOut, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js";
import {
  getFirestore, doc, getDoc, setDoc, updateDoc, deleteDoc,
  collection, query, where, onSnapshot, serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyA8HTe3qW-GLe8vxTkBxkw9x27kYCsNJmY",
  authDomain: "timer-3f065.firebaseapp.com",
  projectId: "timer-3f065",
  storageBucket: "timer-3f065.firebasestorage.app",
  messagingSenderId: "98237580008",
  appId: "1:98237580008:web:2c946605b8644874a47f5d"
};

// Initialize Firebase SDKs
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const googleProvider = new GoogleAuthProvider();

/* ============================================================
   CONSTANTS
============================================================ */
const BASE_URL = "https://keane3029-lab.github.io/timer";

let currentUser = null;
let currentTier = "premium";
let capsules = [];
let unsubCapsules = null;

/* ============================================================
   UTIL
============================================================ */
function toast(msg, ms = 2600) {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.remove("show"), ms);
}

function generateCapsuleId() {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map(b => b.toString(36).padStart(2, "0")).join("").slice(0, 9);
}

function computeUnlockAt(amount, unit) {
  const now = Date.now();
  const MS = {
    minute: 60_000,
    hour: 3_600_000,
    day: 86_400_000,
    year: 31_557_600_000
  };
  return now + amount * MS[unit];
}

function fmtRemaining(ms) {
  if (ms <= 0) return "unlocked";
  const s = Math.floor(ms / 1000);
  const y = Math.floor(s / 31557600);
  const d = Math.floor((s % 31557600) / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (y > 0) return `${y}y ${d}d`;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m ${s % 60}s`;
}

/* ============================================================
   AUTH
============================================================ */
document.getElementById("signInBtn").addEventListener("click", async () => {
  try {
    await signInWithPopup(auth, googleProvider);
  } catch (e) {
    toast("Sign-in failed: " + e.message);
  }
});

onAuthStateChanged(auth, async (user) => {
  currentUser = user;
  if (unsubCapsules) { unsubCapsules(); unsubCapsules = null; }

  if (!user) {
    renderSignedOut();
    return;
  }

  const uRef = doc(db, "users", user.uid);
  const uSnap = await getDoc(uRef);
  if (!uSnap.exists()) {
    await setDoc(uRef, {
      email: user.email,
      displayName: user.displayName,
      tier: "premium",
      createdAt: serverTimestamp()
    });
  }

  renderSignedIn(user);
  watchCapsules(user.uid);
});

function renderSignedOut() {
  document.getElementById("authArea").innerHTML = `
    <button id="signInBtn2" class="btn btn-primary">Sign in with Google</button>
  `;
  document.getElementById("signInBtn2").addEventListener("click", () =>
    signInWithPopup(auth, googleProvider).catch(e => toast(e.message))
  );
  document.getElementById("dashboard").style.display = "none";
  document.getElementById("signedOutHero").style.display = "block";
}

function renderSignedIn(user) {
  document.getElementById("signedOutHero").style.display = "none";
  document.getElementById("dashboard").style.display = "block";
  document.getElementById("authArea").innerHTML = `
    <div class="user-chip">
      <img src="${user.photoURL || ''}" alt="">
      <span>${user.displayName || user.email}</span>
      <span class="tier-badge premium">premium</span>
    </div>
    <button id="signOutBtn2" class="btn btn-ghost">Sign out</button>
  `;
  document.getElementById("signOutBtn2").addEventListener("click", () => signOut(auth));
}

/* ============================================================
   CAPSULES
============================================================ */
function watchCapsules(uid) {
  const q = query(collection(db, "capsules"), where("ownerUid", "==", uid));
  unsubCapsules = onSnapshot(q, (snap) => {
    capsules = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderCapsules();
  }, (err) => toast("Sync error: " + err.message));
}

function renderCapsules() {
  const list = document.getElementById("capsuleList");
  if (capsules.length === 0) {
    list.innerHTML = `<div class="empty">No capsules sealed yet. Create one above — it'll show up here.</div>`;
    return;
  }
  list.innerHTML = capsules
    .sort((a, b) => (a.unlockAt || 0) - (b.unlockAt || 0))
    .map(c => {
      const remaining = (c.unlockAt || 0) - Date.now();
      const status = remaining <= 0 ? "OPENED" : fmtRemaining(remaining);
      return `
        <div class="capsule-card" data-id="${c.id}">
          <div class="capsule-info">
            <div class="capsule-title">${escapeHtml(c.title || "Untitled capsule")}</div>
            <div class="capsule-meta">
              <span>${status}</span>
              <span>·</span>
              <span>${c.visibility}</span>
            </div>
          </div>
          <div class="capsule-actions">
            <button class="icon-btn" data-action="copy" title="Copy link">🔗</button>
            <button class="icon-btn" data-action="toggle" title="Toggle visibility">${c.visibility === "public" ? "🌐" : "🔒"}</button>
            <button class="icon-btn" data-action="delete" title="Delete">🗑️</button>
          </div>
        </div>
      `;
    }).join("");

  list.querySelectorAll(".capsule-card").forEach(card => {
    const id = card.dataset.id;
    const c = capsules.find(x => x.id === id);
    card.querySelector('[data-action="copy"]').addEventListener("click", () => {
      navigator.clipboard.writeText(`${BASE_URL}/${id}`);
      toast("Vault link copied");
    });
    card.querySelector('[data-action="toggle"]').addEventListener("click", async () => {
      await updateDoc(doc(db, "capsules", id), {
        visibility: c.visibility === "public" ? "private" : "public"
      });
    });
    card.querySelector('[data-action="delete"]').addEventListener("click", async () => {
      if (confirm("Permanently delete this capsule?")) {
        await deleteDoc(doc(db, "capsules", id));
        toast("Capsule deleted");
      }
    });
  });
}

function escapeHtml(s) {
  const d = document.createElement("div");
  d.textContent = s;
  return d.innerHTML;
}

/* ============================================================
   CREATE CAPSULE
============================================================ */
document.getElementById("capsuleForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!currentUser) return toast("Sign in first.");

  const title = document.getElementById("capsuleTitle").value.trim() || "Untitled capsule";
  const message = document.getElementById("capsuleMessage").value.trim();
  const visibility = document.getElementById("capsuleVisibility").value;
  const id = generateCapsuleId();

  const amount = Number(document.getElementById("capsuleAmount").value);
  const unit = document.getElementById("capsuleUnit").value;
  if (!amount || amount <= 0) return toast("Enter a valid duration.");
  const unlockAt = computeUnlockAt(amount, unit);

  await setDoc(doc(db, "capsules", id), {
    ownerUid: currentUser.uid, title, message, visibility,
    unlockAt, createdAt: serverTimestamp()
  });

  document.getElementById("capsuleForm").reset();
  toast(`Capsule sealed → ${BASE_URL}/${id}`);
});

/* ============================================================
   STARFIELD
============================================================ */
(function starfield() {
  const canvas = document.getElementById("starfield");
  const ctx = canvas.getContext("2d");
  let stars = [];
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

  function resize() {
    canvas.width = innerWidth;
    canvas.height = innerHeight;
    stars = Array.from({ length: 140 }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      r: Math.random() * 1.2 + 0.2,
      a: Math.random() * 0.6 + 0.2,
      tw: Math.random() * 0.02 + 0.005
    }));
  }
  addEventListener("resize", resize);
  resize();

  function frame() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const s of stars) {
      if (!reduced) s.a += (Math.random() - 0.5) * s.tw;
      s.a = Math.max(0.1, Math.min(0.9, s.a));
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(234,231,245,${s.a})`;
      ctx.fill();
    }
    requestAnimationFrame(frame);
  }
  frame();
})();