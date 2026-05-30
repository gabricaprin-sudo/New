// ============================================
// app-auth.js - Firebase + LocalStorage Auth
// Production-ready with all fixes
// ============================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
    getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword,
    onAuthStateChanged, signOut, updateProfile, setPersistence, browserLocalPersistence
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import {
    getFirestore, doc, setDoc, getDoc, collection, addDoc, query,
    where, orderBy, limit, getDocs, deleteDoc, Timestamp, serverTimestamp,
    onSnapshot, documentId
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyB2cycBTKMjVg8S_fBYN8C-hwUk5FUF81Q",
    authDomain: "kenesa-e5efd.firebaseapp.com",
    projectId: "kenesa-e5efd",
    storageBucket: "kenesa-e5efd.firebasestorage.app",
    messagingSenderId: "227273753184",
    appId: "1:227273753184:web:ecdf258142ad55ed5cf905",
    measurementId: "G-6HS8KNW1GZ"
};

let app, db, auth;
let firebaseReady = false;
let authInitialized = false;

try {
    app = initializeApp(firebaseConfig);
    db = getFirestore(app);
    auth = getAuth(app);
    firebaseReady = true;
    console.log("Firebase initialized successfully");
} catch (e) {
    console.warn("Firebase init failed, using localStorage mode:", e);
}

// Export for app-core.js
export { db, auth };

// Expose to window for cross-module access
window.db = db;
window.auth = auth;
window.firebaseReady = firebaseReady;

// Expose Firestore functions to window (avoids dynamic import issues on file://)
window.firestoreFns = {
    doc, setDoc, getDoc, collection, addDoc, query,
    where, orderBy, limit, getDocs, deleteDoc, Timestamp, serverTimestamp,
    onSnapshot, documentId
};

const LS_USERS_KEY = "kenesa_users";
const LS_CURRENT_USER_KEY = "kenesa_current_user";

// SHA-256 hash for password storage
async function hashPassword(password) {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

function getStoredUsers() {
    try { return JSON.parse(localStorage.getItem(LS_USERS_KEY)) || {}; }
    catch { return {}; }
}
function saveUsers(users) { localStorage.setItem(LS_USERS_KEY, JSON.stringify(users)); }
function getLocalUser() {
    try { return JSON.parse(localStorage.getItem(LS_CURRENT_USER_KEY)); }
    catch { return null; }
}
function setLocalUser(user) {
    if (user) localStorage.setItem(LS_CURRENT_USER_KEY, JSON.stringify(user));
    else localStorage.removeItem(LS_CURRENT_USER_KEY);
}

function showAuthError(msg) {
    const el = document.getElementById("loginError");
    if (!el) return;
    el.innerHTML = msg;
    el.classList.add("active");
}
function hideAuthError() {
    const el = document.getElementById("loginError");
    if (el) el.classList.remove("active");
}
function showAuthSuccess(msg) {
    const el = document.getElementById("loginSuccess");
    if (!el) return;
    el.innerHTML = msg;
    el.classList.add("active");
}
function resetLoginBtn() {
    const btn = document.getElementById("loginBtn");
    if (btn) { btn.disabled = false; btn.innerHTML = "&#10132; دخول"; }
}
function resetRegisterBtn() {
    const btn = document.getElementById("registerBtn");
    if (btn) { btn.disabled = false; btn.innerHTML = "&#128221; إنشاء حساب"; }
}

let isRegisterMode = false;
function toggleAuthMode() {
    isRegisterMode = !isRegisterMode;
    const loginForm = document.getElementById("loginForm");
    const registerForm = document.getElementById("registerForm");
    if (!loginForm || !registerForm) return;
    hideAuthError();
    const successEl = document.getElementById("loginSuccess");
    if (successEl) successEl.classList.remove("active");
    if (isRegisterMode) {
        loginForm.style.display = "none";
        registerForm.style.display = "block";
        const t = document.getElementById("authToggleText");
        if (t) t.textContent = "لديك حساب بالفعل؟";
        const b = document.getElementById("authToggleBtn");
        if (b) b.textContent = "تسجيل الدخول";
        const s = document.getElementById("authSubtitle");
        if (s) s.textContent = "أنشئي حساب جديد كخادم";
    } else {
        loginForm.style.display = "block";
        registerForm.style.display = "none";
        const t = document.getElementById("authToggleText");
        if (t) t.textContent = "ليس لديك حساب؟";
        const b = document.getElementById("authToggleBtn");
        if (b) b.textContent = "إنشاء حساب جديد";
        const s = document.getElementById("authSubtitle");
        if (s) s.textContent = "أدخل بياناتك للوصول إلى نظام المتابعة";
    }
}

async function handleRegister() {
    const name = document.getElementById("regName")?.value.trim();
    const email = document.getElementById("regEmail")?.value.trim().toLowerCase();
    const password = document.getElementById("regPassword")?.value;
    const passwordConfirm = document.getElementById("regPasswordConfirm")?.value;
    const btn = document.getElementById("registerBtn");
    if (btn) { btn.disabled = true; btn.innerHTML = \'<div class="spinner" style="width:16px;height:16px;border-width:2px;display:inline-block;vertical-align:middle;margin-left:6px;"></div> جاري الإنشاء...\'; }
    hideAuthError();
    if (!name || !email || !password) { showAuthError("&#10060; يرجى ملء جميع الحقول"); resetRegisterBtn(); return; }
    if (password.length < 6) { showAuthError("&#10060; كلمة المرور يجب أن تكون 6 أحرف على الأقل"); resetRegisterBtn(); return; }
    if (password !== passwordConfirm) { showAuthError("&#10060; كلمتا المرور غير متطابقتين"); resetRegisterBtn(); return; }

    if (firebaseReady && auth) {
        try {
            const cred = await createUserWithEmailAndPassword(auth, email, password);
            const user = cred.user;
            await updateProfile(user, { displayName: name });
            await setDoc(doc(db, "users", user.uid), { name, email, role: "khadem", createdAt: new Date().toISOString(), uid: user.uid });
            showAuthSuccess("&#9989; تم إنشاء الحساب بنجاح! جاري الدخول...");
            setTimeout(() => completeLogin({ uid: user.uid, name, email, role: "khadem" }), 800);
            return;
        } catch (err) {
            if (err.code === "auth/email-already-in-use") { showAuthError("&#10060; البريد الإلكتروني مستخدم بالفعل"); resetRegisterBtn(); return; }
            console.warn("Firebase register failed, falling back to localStorage:", err);
        }
    }

    // LocalStorage fallback with hashed password
    const users = getStoredUsers();
    if (users[email]) { showAuthError("&#10060; البريد الإلكتروني مستخدم بالفعل"); resetRegisterBtn(); return; }
    const hashedPassword = await hashPassword(password);
    const user = { uid: "local_" + Date.now(), name, email, passwordHash: hashedPassword, role: "khadem", createdAt: new Date().toISOString() };
    users[email] = user;
    saveUsers(users);
    showAuthSuccess("&#9989; تم إنشاء الحساب بنجاح! جاري الدخول...");
    setTimeout(() => completeLogin(user), 800);
}

async function handleLogin() {
    const btn = document.getElementById("loginBtn");
    const email = document.getElementById("loginEmail")?.value.trim().toLowerCase();
    const password = document.getElementById("loginPassword")?.value;
    if (btn) { btn.disabled = true; btn.innerHTML = \'<div class="spinner" style="width:16px;height:16px;border-width:2px;display:inline-block;vertical-align:middle;margin-left:6px;"></div> جاري الدخول...\'; }
    hideAuthError();
    if (!email || !password) { showAuthError("&#10060; يرجى إدخال البريد الإلكتروني وكلمة المرور"); resetLoginBtn(); return; }

    if (firebaseReady && auth) {
        try {
            const cred = await signInWithEmailAndPassword(auth, email, password);
            const userDoc = await getDoc(doc(db, "users", cred.user.uid));
            const userData = userDoc.exists() ? userDoc.data() : { name: cred.user.displayName || "خادم", email: cred.user.email, role: "khadem" };
            await completeLogin({ uid: cred.user.uid, ...userData });
            return;
        } catch (err) {
            console.warn("Firebase login failed, falling back to localStorage:", err);
        }
    }

    // LocalStorage fallback with hash verification
    const users = getStoredUsers();
    const user = users[email];
    if (!user) { showAuthError("&#10060; لا يوجد حساب بهذا البريد"); resetLoginBtn(); return; }
    const hashedInput = await hashPassword(password);
    if (user.passwordHash !== hashedInput) { showAuthError("&#10060; كلمة المرور غير صحيحة"); resetLoginBtn(); return; }
    completeLogin(user);
}

async function completeLogin(user) {
    try {
        window.currentServer = user;
        setLocalUser(user);
        const loginOverlay = document.getElementById("loginOverlay");
        const mainApp = document.getElementById("mainApp");
        const serverDisplay = document.getElementById("serverDisplay");
        const saveStatus = document.getElementById("saveStatus");
        if (loginOverlay) loginOverlay.classList.add("hidden");
        if (mainApp) mainApp.style.display = "block";
        if (serverDisplay) serverDisplay.textContent = user.name + " (" + user.email + ")";
        if (saveStatus) {
            saveStatus.className = firebaseReady ? "save-status online" : "save-status offline";
            saveStatus.innerHTML = firebaseReady ? "&#128308; متصل" : "&#128268; وضع محلي";
        }

        if (!firebaseReady) {
            const offlineBanner = document.getElementById("offlineBanner");
            if (offlineBanner) offlineBanner.classList.add("active");
            showToast("وضع عدم الاتصال - البيانات هتحفظ محلياً", "warning", 5000);
        }

        if (typeof generateCards === "function") generateCards();
        if (typeof loadAllStudentsData === "function") await loadAllStudentsData();
        if (typeof generateMonthSelector === "function") generateMonthSelector();
        if (typeof setupKeyboardShortcuts === "function") setupKeyboardShortcuts();
        showToast("&#9989; مرحباً " + user.name + "! تم تسجيل الدخول بنجاح", "success", 4000);
    } catch (err) {
        console.error("completeLogin error:", err);
        showAuthError("&#10060; خطأ في تهيئة التطبيق");
        resetLoginBtn();
    }
}

function logout() {
    if (!confirm("تأكيد تسجيل الخروج؟")) return;
    setLocalUser(null);
    if (auth) signOut(auth).catch(() => {});
    window.currentServer = null;
    location.reload();
}

// Setup persistence BEFORE auth state listener
async function setupPersistence() {
    if (!firebaseReady || !auth) return;
    try {
        await setPersistence(auth, browserLocalPersistence);
        console.log("Firebase Auth persistence enabled");
    } catch (e) {
        console.error("Persistence failed:", e);
    }
}

function initAuth() {
    // Guard against duplicate initialization (hot reload, script injection)
    if (window.__authInitialized) return;
    window.__authInitialized = true;

    const authToggleBtn = document.getElementById("authToggleBtn");
    const loginBtn = document.getElementById("loginBtn");
    const registerBtn = document.getElementById("registerBtn");
    const btnLogout = document.getElementById("btnLogout");
    if (authToggleBtn) authToggleBtn.addEventListener("click", toggleAuthMode);
    if (loginBtn) loginBtn.addEventListener("click", handleLogin);
    if (registerBtn) registerBtn.addEventListener("click", handleRegister);
    if (btnLogout) btnLogout.addEventListener("click", logout);

    const loginEmail = document.getElementById("loginEmail");
    const loginPassword = document.getElementById("loginPassword");
    if (loginEmail) loginEmail.addEventListener("keydown", (e) => { if (e.key === "Enter") handleLogin(); });
    if (loginPassword) loginPassword.addEventListener("keydown", (e) => { if (e.key === "Enter") handleLogin(); });
    const regPasswordConfirm = document.getElementById("regPasswordConfirm");
    if (regPasswordConfirm) regPasswordConfirm.addEventListener("keydown", (e) => { if (e.key === "Enter") handleRegister(); });

    // Check auto-login
    const localUser = getLocalUser();
    if (localUser) {
        if (firebaseReady && auth) {
            // Let Firebase onAuthStateChanged handle it after persistence is set
        } else {
            completeLogin(localUser);
            return;
        }
    }

    // Setup Firebase auth state listener
    if (firebaseReady && auth) {
        setupPersistence().then(() => {
            onAuthStateChanged(auth, async (user) => {
                if (authInitialized) return; // Prevent loops
                authInitialized = true;
                if (user) {
                    const userDoc = await getDoc(doc(db, "users", user.uid));
                    const userData = userDoc.exists() ? userDoc.data() : { name: user.displayName || "خادم", email: user.email, role: "khadem" };
                    await completeLogin({ uid: user.uid, ...userData });
                } else {
                    const loginOverlay = document.getElementById("loginOverlay");
                    const mainApp = document.getElementById("mainApp");
                    if (loginOverlay) loginOverlay.style.display = "flex";
                    if (mainApp) mainApp.style.display = "none";
                }
            });
        });
    } else {
        const loginOverlay = document.getElementById("loginOverlay");
        const mainApp = document.getElementById("mainApp");
        if (loginOverlay) loginOverlay.style.display = "flex";
        if (mainApp) mainApp.style.display = "none";
    }
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initAuth);
} else {
    initAuth();
}

// Expose globally
window.toggleAuthMode = toggleAuthMode;
window.handleRegister = handleRegister;
window.handleLogin = handleLogin;
window.logout = logout;
window.completeLogin = completeLogin;
