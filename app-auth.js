// ============================================
// app-auth.js  -  Firebase + المصادقة
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

export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);

async function initFirebaseAuth() {
    try {
        await setPersistence(auth, browserLocalPersistence);
        console.log("Firebase Auth Ready");
    } catch (error) {
        console.error("Persistence Error:", error);
    }
}
initFirebaseAuth();

// ====== Auth UI ======
function toggleAuthMode() {
    isRegisterMode = !isRegisterMode;
    if (!els.loginForm || !els.registerForm) return;
    
    if (isRegisterMode) {
        els.loginForm.style.display = "none";
        els.registerForm.style.display = "block";
        if (els.authToggleText) els.authToggleText.textContent = "لديك حساب بالفعل؟";
        if (els.authToggleBtn) els.authToggleBtn.textContent = "تسجيل الدخول";
        if (els.authSubtitle) els.authSubtitle.textContent = "أنشئي حساب جديد كخادم";
    } else {
        els.loginForm.style.display = "block";
        els.registerForm.style.display = "none";
        if (els.authToggleText) els.authToggleText.textContent = "ليس لديك حساب؟";
        if (els.authToggleBtn) els.authToggleBtn.textContent = "إنشاء حساب جديد";
        if (els.authSubtitle) els.authSubtitle.textContent = "أدخل بياناتك للوصول إلى نظام المتابعة";
    }
    if (els.loginError) els.loginError.classList.remove("active");
    if (els.loginSuccess) els.loginSuccess.classList.remove("active");
}

function showAuthError(msg) {
    if (!els.loginError) return;
    els.loginError.innerHTML = msg;
    els.loginError.classList.add("active");
}

function resetLoginBtn() {
    if (els.loginBtn) {
        els.loginBtn.disabled = false;
        els.loginBtn.innerHTML = "&#10132; دخول";
    }
}

function resetRegisterBtn() {
    const btn = $("registerBtn");
    if (btn) {
        btn.disabled = false;
        btn.innerHTML = "&#128221; إنشاء حساب";
    }
}

async function handleRegister() {
    const name = $("regName")?.value.trim();
    const email = $("regEmail")?.value.trim();
    const password = $("regPassword")?.value;
    const passwordConfirm = $("regPasswordConfirm")?.value;
    const btn = $("registerBtn");
    
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<div class="spinner"></div> جاري الإنشاء...';
    }
    if (els.loginError) els.loginError.classList.remove("active");
    if (els.loginSuccess) els.loginSuccess.classList.remove("active");

    if (!name || !email || !password) {
        showAuthError("&#10060; يرجى ملء جميع الحقول");
        resetRegisterBtn();
        return;
    }
    if (password.length < 6) {
        showAuthError("&#10060; كلمة المرور يجب أن تكون 6 أحرف على الأقل");
        resetRegisterBtn();
        return;
    }
    if (password !== passwordConfirm) {
        showAuthError("&#10060; كلمتا المرور غير متطابقتين");
        resetRegisterBtn();
        return;
    }

    try {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;
        await updateProfile(user, { displayName: name });
        await setDoc(doc(db, "users", user.uid), {
            name: name, email: email, role: "khadem",
            createdAt: new Date().toISOString(), uid: user.uid
        });
        if (els.loginSuccess) {
            els.loginSuccess.innerHTML = "&#9989; تم إنشاء الحساب بنجاح! جاري الدخول...";
            els.loginSuccess.classList.add("active");
        }
        setTimeout(() => completeLogin(user), 1000);
    } catch (error) {
        let msg = "&#10060; خطأ في إنشاء الحساب";
        if (error.code === "auth/email-already-in-use") msg = "&#10060; البريد الإلكتروني مستخدم بالفعل";
        else if (error.code === "auth/invalid-email") msg = "&#10060; بريد إلكتروني غير صالح";
        else if (error.code === "auth/weak-password") msg = "&#10060; كلمة المرور ضعيفة جداً";
        showAuthError(msg);
        resetRegisterBtn();
    }
}

async function handleLogin() {
    const btn = els.loginBtn;
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<div class="spinner"></div> جاري الدخول...';
    }
    if (els.loginError) els.loginError.classList.remove("active");
    if (els.loginSuccess) els.loginSuccess.classList.remove("active");

    const email = $("loginEmail")?.value.trim();
    const password = $("loginPassword")?.value;

    if (!email || !password) {
        showAuthError("&#10060; يرجى إدخال البريد الإلكتروني وكلمة المرور");
        resetLoginBtn();
        return;
    }

    try {
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        await completeLogin(userCredential.user);
    } catch (error) {
        console.error("Login error:", error);
        let msg = "&#10060; خطأ في تسجيل الدخول";
        if (error.code === "auth/user-not-found") msg = "&#10060; لا يوجد حساب بهذا البريد";
        else if (error.code === "auth/wrong-password") msg = "&#10060; كلمة المرور غير صحيحة";
        else if (error.code === "auth/invalid-email") msg = "&#10060; بريد إلكتروني غير صالح";
        else if (error.code === "auth/too-many-requests") msg = "&#10060; تم حظر المحاولات مؤقتاً، حاولي لاحقاً";
        else if (error.code === "auth/invalid-credential") msg = "&#10060; البريد أو كلمة المرور غير صحيحة";
        showAuthError(msg);
        resetLoginBtn();
    }
}

async function completeLogin(user) {
    try {
        let userData = { name: user.displayName || "خادم", email: user.email, uid: user.uid };
        try {
            const userDoc = await getDoc(doc(db, "users", user.uid));
            if (userDoc.exists()) {
                const data = userDoc.data();
                userData.name = data.name || userData.name;
                userData.role = data.role || "khadem";
            }
        } catch(e) { console.warn("Could not fetch user data:", e); }

        currentServer = userData;
        
        if (els.loginOverlay) els.loginOverlay.classList.add("hidden");
        if (els.mainApp) els.mainApp.style.display = "block";
        if (els.serverDisplay) els.serverDisplay.textContent = userData.name + " (" + userData.email + ")";

        setSaveStatus(db ? "online" : "offline");
        if (!db) {
            if (els.offlineBanner) els.offlineBanner.classList.add("active");
            showToast("وضع عدم الاتصال - البيانات هتحفظ محلياً", "warning", 5000);
        }

        generateCards();
        await loadAllStudentsData();
        generateMonthSelector();
        setupKeyboardShortcuts();
        console.log("Login successful:", userData);
    } catch (err) {
        console.error("completeLogin error:", err);
        showToast("خطأ في تهيئة التطبيق بعد الدخول", "error", 5000);
        resetLoginBtn();
    }
}

function logout() {
    if (!confirm("تأكيد تسجيل الخروج؟")) return;
    signOut(auth).catch(() => {});
    currentServer = null;
    location.reload();
}

// Auth state listener
onAuthStateChanged(auth, async (user) => {
    if (user) {
        await completeLogin(user);
    } else {
        if (els.loginOverlay) els.loginOverlay.style.display = "flex";
        if (els.mainApp) els.mainApp.style.display = "none";
    }
});

// Exports for app-core.js
window.toggleAuthMode = toggleAuthMode;
window.handleRegister = handleRegister;
window.handleLogin = handleLogin;
window.logout = logout;
window.completeLogin = completeLogin;
