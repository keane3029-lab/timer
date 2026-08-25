import { initializeApp } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js";
import { 
  getAuth, 
  GoogleAuthProvider, 
  signInWithPopup, 
  signOut, 
  onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js";
import { 
  getFirestore, 
  collection, 
  addDoc, 
  query, 
  where, 
  onSnapshot, 
  doc, 
  updateDoc, 
  deleteDoc, 
  serverTimestamp 
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyA8HTe3qW-GLe8vxTkBxkw9x27kYCsNJmY",
  authDomain: "timer-3f065.firebaseapp.com",
  projectId: "timer-3f065",
  storageBucket: "timer-3f065.firebasestorage.app",
  messagingSenderId: "98237580008",
  appId: "1:98237580008:web:2c946605b8644874a47f5d"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const provider = new GoogleAuthProvider();

const BASE_URL = window.location.origin + window.location.pathname.replace(/\/[^/]*$/, "");

let currentUser = null;
let unsubscribeCapsules = null;

const authArea = document.getElementById("authArea");
const loginBtn = document.getElementById("signInBtn") || document.getElementById("heroSignInBtn") || document.getElementById("loginBtn");
const capsuleForm = document.getElementById("capsuleForm");
const capsuleList = document.getElementById("capsuleList");
const toastEl = document.getElementById("toast");

function toast(msg) {
  if (!toastEl) return;
  toastEl.textContent = msg;
  toastEl.className = "show";
  setTimeout(() => {
    toastEl.className = "";
  }, 3000);
}

if (loginBtn) {
  loginBtn.addEventListener("click", async () => {
    try {
      await signInWithPopup(auth, provider);
    } catch (e) {
      console.error(e);
      toast("login failed: " + e.message);
    }
  });
}

onAuthStateChanged(auth, async (user) => {
  currentUser = user;
  const isWelcomePage = window.location.pathname.includes("welcome.html");
  const isIndexPage = window.location.pathname.includes("index.html") || window.location.pathname.endsWith("/timer") || window.location.pathname.endsWith("/");

  if (!user) {
    if (isWelcomePage) {
      window.location.href = "./index.html";
    }
    if (unsubscribeCapsules) {
      unsubscribeCapsules();
      unsubscribeCapsules = null;
    }
    return;
  }

  if (user && isIndexPage) {
    window.location.href = "./welcome.html";
    return;
  }

  if (isWelcomePage) {
    renderSignedInUser(user);
    watchCapsules(user.uid);
  }
});

function renderSignedInUser(user) {
  if (!authArea) return;
  authArea.innerHTML = `
    <div class="user-chip">
      <img src="${user.photoURL || ''}" alt="">
      <span>${user.displayName || user.email}</span>
      <span class="tier-badge free">free</span>
    </div>
    <button id="signOutBtn" class="btn btn-ghost">sign out</button>
  `;

  const signOutBtn = document.getElementById("signOutBtn");
  if (signOutBtn) {
    signOutBtn.addEventListener("click", async () => {
      await signOut(auth);
      window.location.href = "./index.html";
    });
  }
}

if (capsuleForm) {
  capsuleForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!currentUser) return;

    const titleEl = document.getElementById("capsuleTitle");
    const messageEl = document.getElementById("capsuleMessage");
    const unlockDateEl = document.getElementById("unlockDate");
    const visibilitySelectEl = document.getElementById("visibilitySelect");

    if (!titleEl || !messageEl || !unlockDateEl || !visibilitySelectEl) return;

    const title = titleEl.value.trim();
    const message = messageEl.value.trim();
    const unlockDateStr = unlockDateEl.value;
    const visibility = visibilitySelectEl.value;

    if (!title || !message || !unlockDateStr) {
      toast("fill out all fields king");
      return;
    }

    const unlockAt = new Date(unlockDateStr).getTime();
    if (unlockAt <= Date.now()) {
      toast("unlock date must be in the future");
      return;
    }

    try {
      await addDoc(collection(db, "capsules"), {
        uid: currentUser.uid,
        title,
        message,
        unlockAt,
        visibility,
        createdAt: serverTimestamp()
      });
      capsuleForm.reset();
      toast("capsule sealed in the void");
    } catch (e) {
      console.error(e);
      toast("error creating capsule: " + e.message);
    }
  });
}

function watchCapsules(uid) {
  if (!capsuleList) return;
  const q = query(collection(db, "capsules"), where("uid", "==", uid));
  
  unsubscribeCapsules = onSnapshot(q, (snapshot) => {
    const capsules = [];
    snapshot.forEach((docSnap) => {
      capsules.push({ id: docSnap.id, ...docSnap.data() });
    });
    renderCapsules(capsules);
  });
}

function renderCapsules(capsules) {
  if (!capsuleList) return;
  if (capsules.length === 0) {
    capsuleList.innerHTML = `<div class="sub">no capsules found. create your first one above.</div>`;
    return;
  }

  capsuleList.innerHTML = capsules.map(c => {
    const dateStr = new Date(c.unlockAt).toLocaleString();
    return `
      <div class="capsule-card" data-id="${c.id}">
        <h3>${escapeHtml(c.title)}</h3>
        <div class="sub">unlocks: ${dateStr}</div>
        <div class="sub">visibility: <strong>${c.visibility}</strong></div>
        <div style="margin-top:12px; display:flex; gap:8px; flex-wrap:wrap;">
          <button class="btn btn-ghost" data-action="copy">copy link</button>
          <button class="btn btn-ghost" data-action="toggle">toggle public/private</button>
          <button class="btn btn-danger" data-action="delete">delete</button>
        </div>
      </div>
    `;
  }).join("");
}

document.addEventListener("click", async (e) => {
  const btn = e.target.closest("button");
  if (!btn) return;
  
  const card = btn.closest(".capsule-card");
  if (!card) return;
  
  const id = card.dataset.id;
  const action = btn.dataset.action;
  if (!id || !action) return;
  
  if (action === "copy") {
    navigator.clipboard.writeText(`${BASE_URL}/vault.html?id=${id}`);
    toast("vault link copied");
  }
  
  if (action === "toggle") {
    const currentVisEl = card.querySelector("strong");
    if (!currentVisEl) return;
    const currentVis = currentVisEl.textContent.trim();
    const newVis = currentVis === "public" ? "private" : "public";
    await updateDoc(doc(db, "capsules", id), { visibility: newVis });
    toast("visibility updated");
  }
  
  if (action === "delete") {
    if (confirm("permanently delete this capsule?")) {
      await deleteDoc(doc(db, "capsules", id));
      toast("capsule deleted");
    }
  }
});

function escapeHtml(s) {
  const d = document.createElement("div");
  d.textContent = s || "";
  return d.innerHTML;
}
