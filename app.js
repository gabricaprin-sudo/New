import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged, signOut, updateProfile, setPersistence, browserLocalPersistence } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc, collection, addDoc, query, where, orderBy, limit, getDocs, deleteDoc, Timestamp, serverTimestamp, onSnapshot, documentId } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyB2cycBTKMjVg8S_fBYN8C-hwUk5FUF81Q",
    authDomain: "kenesa-e5efd.firebaseapp.com",
    projectId: "kenesa-e5efd",
    storageBucket: "kenesa-e5efd.firebasestorage.app",
    messagingSenderId: "227273753184",
    appId: "1:227273753184:web:ecdf258142ad55ed5cf905",
    measurementId: "G-6HS8KNW1GZ"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

async function initFirebaseAuth() {
    try {
        await setPersistence(auth, browserLocalPersistence);
        console.log("Firebase Auth Ready");
    } catch (error) {
        console.error("Persistence Error:", error);
    }
}

initFirebaseAuth();

const CONFIG = {
    saveDebounceMs: 600,
    searchDebounceMs: 350,
    maxRecords: 500,
    maxLogEntries: 200,
    monthsToShow: 6
};

let currentServer = null;
let currentStudentId = null;
const ratings = {};
const attendance = {};
let records = [];
let saveTimeout = null;
let searchTimeout = null;
let lastKnownUpdatedAt = null;
let isAlreadyAddedToday = false;
let isSaving = false;
let searchAbortController = null;
let isRegisterMode = false;
let isAutoSaveEnabled = true;

const DAYS = ["السبت","الإثنين","الأربعاء"];
const ACTS = ["دراسي","محفوظات","قبطي","الحان"];
const ACT_ICONS = { "دراسي": "&#128216;", "محفوظات": "&#128221;", "قبطي": "&#9961;&#65039;", "الحان": "&#127925;" };
const ACT_CLASSES = { "دراسي": "icon-study", "محفوظات": "icon-mem", "قبطي": "icon-copt", "الحان": "icon-music" };
const DAY_HEADERS = { "السبت": "sat", "الإثنين": "mon", "الأربعاء": "wed" };
const DAY_ICONS = { "السبت": "&#128214;", "الإثنين": "&#127775;", "الأربعاء": "&#127919;" };

const els = {
    name: document.getElementById("studentName"),
    year: document.getElementById("studentYear"),
    studentDocId: document.getElementById("studentDocId"),
    studentSelect: document.getElementById("studentSelect"),
    saveStatus: document.getElementById("saveStatus"),
    serverDisplay: document.getElementById("serverDisplay"),
    loginOverlay: document.getElementById("loginOverlay"),
    mainApp: document.getElementById("mainApp"),
    loginError: document.getElementById("loginError"),
    loginSuccess: document.getElementById("loginSuccess"),
    loginBtn: document.getElementById("loginBtn"),
    logModal: document.getElementById("logModal"),
    logTableBody: document.getElementById("logTableBody"),
    logAggregatedView: document.getElementById("logAggregatedView"),
    logDetailedTable: document.getElementById("logDetailedTable"),
    presentCount: document.getElementById("presentCount"),
    absentCount: document.getElementById("absentCount"),
    ratedActivities: document.getElementById("ratedActivities"),
    avgRating: document.getElementById("avgRating"),
    attendanceRate: document.getElementById("attendanceRate"),
    logCount: document.getElementById("logCount"),
    conflictBanner: document.getElementById("conflictBanner"),
    dupNameError: document.getElementById("dupNameError"),
    addedTodayBanner: document.getElementById("addedTodayBanner"),
    todayDateBadge: document.getElementById("todayDateBadge"),
    absentAlertBanner: document.getElementById("absentAlertBanner"),
    absentAlertText: document.getElementById("absentAlertText"),
    offlineBanner: document.getElementById("offlineBanner"),
    cardsGrid: document.getElementById("cardsGrid"),
    statsModal: document.getElementById("statsModal"),
    monthlyModal: document.getElementById("monthlyModal"),
    monthCalendar: document.getElementById("monthCalendar"),
    monthDetails: document.getElementById("monthDetails"),
    monthDetailTitle: document.getElementById("monthDetailTitle"),
    monthDetailContent: document.getElementById("monthDetailContent"),
    monthSelector: document.getElementById("monthSelector"),
    searchResults: document.getElementById("searchResults"),
    logLoadingOverlay: document.getElementById("logLoadingOverlay"),
    statsLoadingOverlay: document.getElementById("statsLoadingOverlay"),
    shortcutsHelp: document.getElementById("shortcutsHelp"),
    saveBtn: document.getElementById("saveBtn"),
    toastContainer: document.getElementById("toastContainer"),
    loginForm: document.getElementById("loginForm"),
    registerForm: document.getElementById("registerForm"),
    authToggleText: document.getElementById("authToggleText"),
    authToggleBtn: document.getElementById("authToggleBtn"),
    authSubtitle: document.getElementById("authSubtitle"),
    todayAttendanceModal: document.getElementById("todayAttendanceModal"),
    todayAttLoadingOverlay: document.getElementById("todayAttLoadingOverlay"),
    duplicateBanner: document.getElementById("duplicateBanner"),
    duplicateText: document.getElementById("duplicateText"),
    profileModal: document.getElementById("profileModal"),
    profileLoadingOverlay: document.getElementById("profileLoadingOverlay"),
    profileStudentName: document.getElementById("profileStudentName"),
    profileStudentYear: document.getElementById("profileStudentYear"),
    profileTotalPresent: document.getElementById("profileTotalPresent"),
    profileTotalAbsent: document.getElementById("profileTotalAbsent"),
    profileAvgRating: document.getElementById("profileAvgRating"),
    profileTimeline: document.getElementById("profileTimeline"),
    allStudentsGrid: document.getElementById("allStudentsGrid"),
    allStudentsCount: document.getElementById("allStudentsCount")
};

function escapeHtml(text) {
    if (!text) return "";
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
}

function showToast(message, type = "info", duration = 3000) {
    const toast = document.createElement("div");
    toast.className = `toast ${type}`;
    const icons = { success: "&#9989;", error: "&#10060;", info: "&#128161;", warning: "&#9888;&#65039;" };
    toast.innerHTML = `<span>${icons[type] || "&#128161;"}</span><span>${escapeHtml(message)}</span>`;
    els.toastContainer.appendChild(toast);
    setTimeout(() => {
        toast.classList.add("hiding");
        setTimeout(() => toast.remove(), 300);
    }, duration);
}

function setSaveStatus(status) {
    const el = els.saveStatus;
    const states = {
        saving: { html: "&#9203; جاري الحفظ...", className: "save-status saving" },
        saved: { html: "&#9989; تم الحفظ", className: "save-status saved" },
        online: { html: "&#127760; متصل", className: "save-status online" },
        offline: { html: "&#128268; غير متصل", className: "save-status offline" },
        error: { html: "&#10060; خطأ", className: "save-status offline" }
    };
    const state = states[status] || states.online;
    el.innerHTML = state.html;
    el.className = state.className;
    if (status === "saved") setTimeout(() => setSaveStatus("online"), 2000);
}

function updateTodayBadge() {
    const today = new Date();
    const dateStr = today.toLocaleDateString("ar-EG", { year: "numeric", month: "long", day: "numeric", weekday: "long" });
    els.todayDateBadge.innerHTML = "&#128197; " + dateStr;
}

function getTodayDate() {
    return new Date().toISOString().slice(0, 10);
}

function getStudentDocId() {
    const hiddenId = els.studentDocId.value.trim();
    if (hiddenId) return hiddenId;
    const name = els.name.value.trim();
    const year = els.year.value.trim();
    if (!name || !year) return null;
    const safeName = name.replace(/\\s+/g, "_").replace(/[^\\u0621-\\u064Aa-zA-Z0-9_]/g, "");
    const safeYear = year.replace(/\\s+/g, "_").replace(/[^\\u0621-\\u064Aa-zA-Z0-9_]/g, "");
    return safeName + "_" + safeYear;
}

function getLocalStorageKey() {
    const docId = getStudentDocId();
    return docId ? "khadem_data_" + docId : null;
}

function generateCards() {
    els.cardsGrid.innerHTML = "";
    DAYS.forEach(day => {
        const card = document.createElement("div");
        card.className = "track-card";
        card.dataset.day = day;
        card.innerHTML = `
            <div class="status-strip neutral" id="status-${day}"></div>
            <div class="card-header ${DAY_HEADERS[day]}">
                <span>${day}</span>
                <span class="day-icon">${DAY_ICONS[day]}</span>
            </div>
            <div class="card-body">
                ${ACTS.map(act => `
                    <div class="activity-row" data-day="${day}" data-act="${act}">
                        <div class="activity-left">
                            <div class="activity-name">
                                <div class="activity-icon ${ACT_CLASSES[act]}">${ACT_ICONS[act]}</div>
                                <span>${act}</span>
                            </div>
                        </div>
                        <div style="display:flex;align-items:center;gap:12px;">
                            <div class="toggle-group">
                                <span>حضور</span>
                                <label class="toggle-switch" title="تسجيل الحضور">
                                    <input type="checkbox" aria-label="حضور ${act} يوم ${day}">
                                    <span class="toggle-slider"></span>
                                </label>
                            </div>
                            <div class="rating disabled" data-day="${day}" data-act="${act}">
                                ${[1,2,3,4,5].map(i => `<span class="star" title="${i} نجمة" role="button" tabindex="0">&#9733;</span>`).join("")}
                            </div>
                            <span class="absent-label">غائبة &#10060;</span>
                        </div>
                    </div>
                `).join("")}
                <textarea class="note-input" id="note-${day}" placeholder="ملاحظات يوم ${day}..." aria-label="ملاحظات ${day}"></textarea>
            </div>
        `;
        els.cardsGrid.appendChild(card);
    });
    
    document.querySelectorAll('.toggle-switch input').forEach(cb => {
        cb.addEventListener('change', function() { toggleAttendance(this); });
    });
    document.querySelectorAll('.star').forEach(star => {
        star.addEventListener('click', function() {
            const val = Array.from(this.parentElement.querySelectorAll('.star')).indexOf(this) + 1;
            rate(this, val);
        });
        star.addEventListener('keydown', function(e) {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                const val = Array.from(this.parentElement.querySelectorAll('.star')).indexOf(this) + 1;
                rate(this, val);
            }
        });
    });
}

function toggleAuthMode() {
    isRegisterMode = !isRegisterMode;
    if (isRegisterMode) {
        els.loginForm.style.display = "none";
        els.registerForm.style.display = "block";
        els.authToggleText.textContent = "لديك حساب بالفعل؟";
        els.authToggleBtn.textContent = "تسجيل الدخول";
        els.authSubtitle.textContent = "أنشئي حساب جديد كخادم";
    } else {
        els.loginForm.style.display = "block";
        els.registerForm.style.display = "none";
        els.authToggleText.textContent = "ليس لديك حساب؟";
        els.authToggleBtn.textContent = "إنشاء حساب جديد";
        els.authSubtitle.textContent = "أدخل بياناتك للوصول إلى نظام المتابعة";
    }
    els.loginError.classList.remove("active");
    els.loginSuccess.classList.remove("active");
}

async function handleRegister() {
    const name = document.getElementById("regName").value.trim();
    const email = document.getElementById("regEmail").value.trim();
    const password = document.getElementById("regPassword").value;
    const passwordConfirm = document.getElementById("regPasswordConfirm").value;
    const btn = document.getElementById("registerBtn");
    
    btn.disabled = true;
    btn.innerHTML = '<div class="spinner"></div> جاري الإنشاء...';
    els.loginError.classList.remove("active");
    els.loginSuccess.classList.remove("active");

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
        els.loginSuccess.innerHTML = "&#9989; تم إنشاء الحساب بنجاح! جاري الدخول...";
        els.loginSuccess.classList.add("active");
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

function resetRegisterBtn() {
    const btn = document.getElementById("registerBtn");
    btn.disabled = false;
    btn.innerHTML = "&#128221; إنشاء حساب";
}

async function handleLogin() {
    const btn = els.loginBtn;
    btn.disabled = true;
    btn.innerHTML = '<div class="spinner"></div> جاري الدخول...';
    els.loginError.classList.remove("active");
    els.loginSuccess.classList.remove("active");

    const email = document.getElementById("loginEmail").value.trim();
    const password = document.getElementById("loginPassword").value;

    if (!email || !password) {
        showAuthError("&#10060; يرجى إدخال البريد الإلكتروني وكلمة المرور");
        resetLoginBtn();
        return;
    }

    try {
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        completeLogin(userCredential.user);
    } catch (error) {
        let msg = "&#10060; خطأ في تسجيل الدخول";
        if (error.code === "auth/user-not-found") msg = "&#10060; لا يوجد حساب بهذا البريد";
        else if (error.code === "auth/wrong-password") msg = "&#10060; كلمة المرور غير صحيحة";
        else if (error.code === "auth/invalid-email") msg = "&#10060; بريد إلكتروني غير صالح";
        else if (error.code === "auth/too-many-requests") msg = "&#10060; تم حظر المحاولات مؤقتاً، حاولي لاحقاً";
        showAuthError(msg);
        resetLoginBtn();
    }
}

function showAuthError(msg) {
    els.loginError.innerHTML = msg;
    els.loginError.classList.add("active");
}

function resetLoginBtn() {
    els.loginBtn.disabled = false;
    els.loginBtn.innerHTML = "&#10132; دخول";
}

async function completeLogin(user) {
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
    els.loginOverlay.classList.add("hidden");
    els.mainApp.style.display = "block";
    els.serverDisplay.textContent = userData.name + " (" + userData.email + ")";

    setSaveStatus(db ? "online" : "offline");
    if (!db) {
        els.offlineBanner.classList.add("active");
        showToast("وضع عدم الاتصال - البيانات هتحفظ محلياً", "warning", 5000);
    }

    generateCards();
    await loadAllStudentsData();
    generateMonthSelector();
    setupKeyboardShortcuts();
    console.log("Login successful:", userData);
}

function logout() {
    if (!confirm("تأكيد تسجيل الخروج؟")) return;
    signOut(auth).catch(() => {});
    currentServer = null;
    location.reload();
}

async function loadAllStudentsData() {
    if (!db) return;
    try {
        const snap = await getDocs(collection(db, "students"));
        const students = [];
        snap.forEach(d => students.push({ id: d.id, ...d.data() }));
        students.sort((a, b) => (a.name || "").localeCompare(b.name || "", "ar"));
        
        const today = getTodayDate();
        const dailyPromises = students.map(s => getDoc(doc(db, "students", s.id, "daily", today)));
        const dailySnaps = await Promise.all(dailyPromises);
        
        students.forEach((s, i) => {
            if (dailySnaps[i].exists()) {
                s.todayData = dailySnaps[i].data();
            }
        });
        
        renderAllStudents(students);
        updateStudentSelect(students);
    } catch(e) {
        console.error("Failed to load all students:", e);
        showToast("خطأ في تحميل بيانات الطالبات", "error");
    }
}

function renderAllStudents(students) {
    const grid = els.allStudentsGrid;
    const countEl = els.allStudentsCount;
    countEl.textContent = `(${students.length} طالبة)`;
    
    if (students.length === 0) {
        grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:30px;color:var(--text-light);">لا توجد طالبات مسجلة</div>';
        return;
    }
    
    grid.innerHTML = "";
    students.forEach(s => {
        const card = document.createElement("div");
        card.className = "student-mini-card";
        
        let statusClass = "not-recorded";
        let statusText = "غير مسجلة";
        let presentCount = 0, absentCount = 0, ratingSum = 0, ratingCount = 0;
        
        if (s.todayData && s.todayData.followups) {
            Object.values(s.todayData.followups).forEach(dayData => {
                ACTS.forEach(act => {
                    const actData = dayData[act];
                    if (actData) {
                        if (actData.attendance === true) presentCount++;
                        else if (actData.attendance === false) absentCount++;
                        if (actData.rating) { ratingSum += actData.rating; ratingCount++; }
                    }
                });
            });
            if (presentCount > 0) { statusClass = "present"; statusText = "حاضرة"; }
            else if (absentCount > 0) { statusClass = "absent"; statusText = "غائبة"; }
        }
        
        const avgRating = ratingCount > 0 ? (ratingSum / ratingCount).toFixed(1) : "0.0";
        const totalActs = presentCount + absentCount;
        const attRate = totalActs > 0 ? Math.round((presentCount / totalActs) * 100) : 0;
        
        let stripClass = "neutral";
        if (totalActs > 0) {
            if (attRate >= 75 && avgRating >= 3.5) stripClass = "excellent";
            else if (attRate >= 50 && avgRating >= 2.5) stripClass = "good";
            else stripClass = "bad";
        }
        
        card.innerHTML = `
            <div class="mini-status-strip ${stripClass}"></div>
            <div class="mini-name">${escapeHtml(s.name || "بدون اسم")}</div>
            <div class="mini-year">${escapeHtml(s.year || "-")}</div>
            <div class="mini-stats">
                <span class="mini-stat ${statusClass}">${statusText}</span>
                <span class="mini-stat rating">&#11088; ${avgRating}</span>
                <span class="mini-stat present">${attRate}%</span>
            </div>
        `;
        
        card.onclick = () => {
            els.name.value = s.name || "";
            els.year.value = s.year || "";
            els.studentDocId.value = s.id;
            els.studentSelect.value = [s.name, s.year, s.id].join("|");
            loadStudent();
            document.querySelector(".info-card").scrollIntoView({ behavior: "smooth" });
        };
        
        grid.appendChild(card);
    });
}

function updateStudentSelect(students) {
    const sel = els.studentSelect;
    sel.innerHTML = '<option value="">-- اختيار طالبة من القائمة --</option>';
    students.forEach(s => {
        const opt = document.createElement("option");
        opt.value = [s.name, s.year, s.id].join("|");
        opt.textContent = (s.name || "بدون اسم") + " - " + (s.year || "بدون سنة");
        sel.appendChild(opt);
    });
}

function onStudentSelectChange() {
    const val = els.studentSelect.value;
    if (!val) return;
    const parts = val.split("|");
    if (parts.length < 3) return;
    els.name.value = parts[0];
    els.year.value = parts[1];
    els.studentDocId.value = parts[2];
    loadStudent();
}

function newStudent() {
    els.studentSelect.value = "";
    els.name.value = "";
    els.year.value = "";
    els.studentDocId.value = "";
    resetUI(true, true);
    isAlreadyAddedToday = false;
    els.name.focus();
}

async function checkDuplicateAndLoad() {
    const name = els.name.value.trim();
    const year = els.year.value.trim();
    els.dupNameError.classList.remove("active");
    els.duplicateBanner.classList.remove("active");
    if (!name || !year) {
        showToast("يرجى إدخال اسم الطالبة والسنة الدراسية", "warning");
        return;
    }
    if (db) {
        try {
            const q = query(collection(db, "students"), where("name", "==", name));
            const snap = await getDocs(q);
            let foundDifferent = false, matchedDoc = null;
            snap.forEach(d => {
                const data = d.data();
                if (data.year === year) matchedDoc = d.id;
                else foundDifferent = true;
            });
            if (matchedDoc) {
                els.duplicateBanner.classList.add("active");
                els.duplicateText.textContent = `الطالبة "${name}" مسجلة بالفعل في ${year}! تم تحميل بياناتها.`;
                els.studentDocId.value = matchedDoc;
                showToast(`الطالبة مسجلة بالفعل! جاري تحميل البيانات...`, "info", 3000);
                loadStudent();
                return;
            }
            if (foundDifferent && !matchedDoc) {
                els.dupNameError.innerHTML = "&#10060; اسم الطالبة \"" + escapeHtml(name) + "\" مسجل بسنة مختلفة!";
                els.dupNameError.classList.add("active");
                return;
            }
        } catch(e) { console.error("Duplicate check error:", e); }
    }
    loadStudent();
}

async function loadStudent() {
    const docId = getStudentDocId();
    if (!docId) return;
    currentStudentId = docId;
    resetUI(false, false);
    hideAddedToday();
    const today = getTodayDate();
    let firebaseRecords = [];
    let localRecords = [];

    if (db) {
        try {
            const baseSnap = await getDoc(doc(db, "students", docId));
            if (baseSnap.exists()) {
                const baseData = baseSnap.data();
                if (baseData.name) els.name.value = baseData.name;
                if (baseData.year) els.year.value = baseData.year;
            }
            const dailySnap = await getDoc(doc(db, "students", docId, "daily", today));
            if (dailySnap.exists()) {
                const data = dailySnap.data();
                lastKnownUpdatedAt = data.updatedAt || null;
                isAlreadyAddedToday = true;
                showAddedToday();
                applyDailyData(data);
            }
            const logsQuery = query(
                collection(db, "logs"),
                where("studentName", "==", els.name.value.trim()),
                orderBy("timestamp", "desc"),
                limit(CONFIG.maxLogEntries)
            );
            const logsSnap = await getDocs(logsQuery);
            logsSnap.forEach(d => firebaseRecords.push(d.data()));
        } catch(e) {
            console.error("Load error:", e);
            showToast("خطأ في التحميل من السحابة", "error");
        }
    }

    localRecords = loadLocalDataOnly();
    records = mergeRecords(firebaseRecords, localRecords);
    updateSummary();
    showToast("تم تحميل بيانات الطالبة", "success");
}

function loadLocalDataOnly() {
    const key = getLocalStorageKey();
    if (!key) return [];
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    try {
        const data = JSON.parse(raw);
        if (data.attendance) Object.keys(data.attendance).forEach(k => { attendance[k] = data.attendance[k]; });
        if (data.ratings) Object.keys(data.ratings).forEach(k => { ratings[k] = data.ratings[k]; });
        if (data.lastKnownUpdatedAt) lastKnownUpdatedAt = data.lastKnownUpdatedAt;
        if (data.isAlreadyAddedToday) { isAlreadyAddedToday = true; showAddedToday(); }
        if (data.followups) {
            Object.keys(data.followups).forEach(day => {
                const noteEl = document.getElementById("note-" + day);
                if (noteEl && data.followups[day].note) noteEl.value = data.followups[day].note;
            });
        }
        applyUIState();
        updateSummary();
        checkConsecutiveAbsences();
        updateStatusColors();
        return data.records || [];
    } catch(e) {
        console.error("Local data parse error:", e);
        return [];
    }
}

function mergeRecords(firebaseRecs, localRecs) {
    const map = new Map();
    firebaseRecs.forEach(r => { if (r.timestamp) map.set(r.timestamp, r); });
    localRecs.forEach(r => { if (r.timestamp) map.set(r.timestamp, r); });
    const merged = Array.from(map.values());
    merged.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    return merged.slice(0, CONFIG.maxRecords);
}

function applyDailyData(data) {
    if (data.followups) {
        Object.keys(data.followups).forEach(day => {
            const dayData = data.followups[day];
            const noteEl = document.getElementById("note-" + day);
            if (noteEl && dayData.note) noteEl.value = dayData.note;
            ACTS.forEach(act => {
                const actData = dayData[act];
                const key = day + "|" + act;
                if (actData) {
                    if (actData.attendance === true) attendance[key] = true;
                    else if (actData.attendance === false) attendance[key] = false;
                    if (actData.rating) ratings[key] = actData.rating;
                }
            });
        });
    }
    applyUIState();
    updateSummary();
    checkConsecutiveAbsences();
    updateStatusColors();
}

function applyUIState() {
    document.querySelectorAll(".activity-row").forEach(row => {
        const day = row.dataset.day, act = row.dataset.act, key = day + "|" + act;
        const cb = row.querySelector(".toggle-switch input");
        const ratingDiv = row.querySelector(".rating");
        const absentLabel = row.querySelector(".absent-label");
        if (attendance[key] === true) {
            cb.checked = true; ratingDiv.classList.remove("disabled"); absentLabel.style.display = "none";
        } else if (attendance[key] === false) {
            cb.checked = false; ratingDiv.classList.add("disabled"); absentLabel.style.display = "inline";
        } else {
            cb.checked = false; ratingDiv.classList.add("disabled"); absentLabel.style.display = "none";
        }
        ratingDiv.querySelectorAll(".star").forEach((s, i) => {
            s.classList.toggle("active", ratings[key] && i < ratings[key]);
        });
    });
}

function resetUI(clearNames, clearRecords = false) {
    if (clearNames) {
        els.name.value = ""; els.year.value = ""; els.studentDocId.value = "";
        lastKnownUpdatedAt = null; isAlreadyAddedToday = false;
        els.studentSelect.value = "";
    }
    document.querySelectorAll(".toggle-switch input").forEach(t => {
        t.checked = false;
        const row = t.closest(".activity-row");
        row.querySelector(".rating").classList.add("disabled");
        row.querySelector(".absent-label").style.display = "none";
    });
    document.querySelectorAll(".star").forEach(s => s.classList.remove("active"));
    document.querySelectorAll(".note-input").forEach(n => n.value = "");
    for (let k in ratings) delete ratings[k];
    for (let k in attendance) delete attendance[k];
    if (clearRecords) records = [];
    els.conflictBanner.classList.remove("active");
    els.duplicateBanner.classList.remove("active");
    els.absentAlertBanner.classList.remove("active");
    hideAddedToday();
    updateSummary();
    updateStatusColors();
}

function updateSummary() {
    let present = 0, absent = 0;
    Object.values(attendance).forEach(v => {
        if (v === true) present++;
        else if (v === false) absent++;
    });
    const total = Object.keys(attendance).length;
    const rateValues = Object.values(ratings);
    const rated = rateValues.length;
    const sum = rateValues.reduce((a, b) => a + b, 0);
    const avg = rated > 0 ? (sum / rated).toFixed(1) : "0.0";
    const attRate = total > 0 ? Math.round((present / total) * 100) : 0;
    els.presentCount.textContent = present;
    els.absentCount.textContent = absent;
    els.ratedActivities.textContent = rated;
    els.avgRating.textContent = avg;
    els.attendanceRate.textContent = attRate + "%";
    els.logCount.textContent = records.length;
}

function showConflict(serverName) {
    els.conflictBanner.classList.add("active");
    els.conflictText.textContent = "الخادم " + serverName + " عدل على البيانات وأنتِ شغالة! حدّثي الصفحة.";
    setSaveStatus("offline");
    showToast("تعارض في البيانات! حدّثي الصفحة", "error", 6000);
}

function showAddedToday() { els.addedTodayBanner.classList.add("active"); }
function hideAddedToday() { els.addedTodayBanner.classList.remove("active"); }

function checkConsecutiveAbsences() {
    let totalAbs = 0;
    Object.values(attendance).forEach(v => { if (v === false) totalAbs++; });
    if (totalAbs >= 3) {
        els.absentAlertBanner.classList.add("active");
        els.absentAlertText.innerHTML = "&#9888;&#65039; تحتاج متابعة - " + totalAbs + " غيابات مسجلة";
    } else {
        els.absentAlertBanner.classList.remove("active");
    }
}

function updateStatusColors() {
    DAYS.forEach(day => {
        let present = 0, absent = 0, rated = 0, sum = 0;
        ACTS.forEach(act => {
            const key = day + "|" + act;
            if (attendance[key] === true) present++;
            else if (attendance[key] === false) absent++;
            if (ratings[key]) { rated++; sum += ratings[key]; }
        });
        const total = present + absent;
        const attRate = total > 0 ? present / total : 0;
        const avg = rated > 0 ? sum / rated : 0;
        const strip = document.getElementById("status-" + day);
        if (!strip) return;
        if (total === 0) strip.className = "status-strip neutral";
        else if (attRate >= 0.75 && avg >= 3.5) strip.className = "status-strip excellent";
        else if (attRate >= 0.5 && avg >= 2.5) strip.className = "status-strip good";
        else strip.className = "status-strip bad";
    });
}

function requestChangeReason(changeInfo) {
    if (!currentServer) {
        showToast("لازم تسجيل دخول أولاً", "warning");
        return false;
    }
    const studentName = els.name.value.trim();
    const studentYear = els.year.value.trim();
    if (!studentName || !studentYear) {
        changeInfo.reason = "تسجيل أولي";
    } else {
        changeInfo.reason = "";
    }
    changeInfo.execute();
    return true;
}

function toggleAttendance(checkbox) {
    const row = checkbox.closest(".activity-row");
    const ratingDiv = row.querySelector(".rating");
    const absentLabel = row.querySelector(".absent-label");
    const day = row.dataset.day, act = row.dataset.act, key = day + "|" + act;
    const oldVal = attendance[key] === true ? "حاضرة" : (attendance[key] === false ? "غائبة" : "غير محدد");
    const newVal = checkbox.checked ? "حاضرة" : "غائبة";
    if ((checkbox.checked && attendance[key] === true) || (!checkbox.checked && attendance[key] === false)) return;
    const revert = () => { checkbox.checked = !checkbox.checked; };
    requestChangeReason({
        type: "attendance", day: day, activity: act, oldVal: oldVal, newVal: newVal, revert: revert,
        execute: function() {
            if (checkbox.checked) {
                attendance[key] = true; ratingDiv.classList.remove("disabled"); absentLabel.style.display = "none";
            } else {
                attendance[key] = false; ratingDiv.classList.add("disabled"); absentLabel.style.display = "inline";
                delete ratings[key]; ratingDiv.querySelectorAll(".star").forEach(s => s.classList.remove("active"));
            }
            addRecord({ type: "attendance", day: day, activity: act, oldValue: oldVal, newValue: newVal, reason: this.reason });
            queueSave(); updateSummary(); checkConsecutiveAbsences(); updateStatusColors();
        }
    });
}

function rate(star, value) {
    const container = star.parentElement;
    if (container.classList.contains("disabled")) return;
    const day = container.dataset.day, act = container.dataset.act, key = day + "|" + act;
    const oldVal = ratings[key] ? (ratings[key] + " نجوم") : "غير مقيم";
    if (ratings[key] === value) return;
    const revert = () => { applyUIState(); };
    requestChangeReason({
        type: "rating", day: day, activity: act, oldVal: oldVal, newVal: value + " نجوم", revert: revert,
        execute: function() {
            ratings[key] = value;
            container.querySelectorAll(".star").forEach((s, i) => { s.classList.toggle("active", i < value); });
            addRecord({ type: "rating", day: day, activity: act, oldValue: oldVal, newValue: value + " نجوم", reason: this.reason });
            queueSave(); updateSummary(); updateStatusColors();
        }
    });
}

function addRecord(rec) {
    if (!currentServer) return;
    const student = els.name.value.trim() || "غير_محدد";
    const fullRec = {
        timestamp: new Date().toISOString(),
        serverId: currentServer.uid, serverName: currentServer.name, serverEmail: currentServer.email,
        studentName: student, studentYear: els.year.value.trim(), followDate: getTodayDate(),
        day: rec.day, activity: rec.activity, type: rec.type,
        oldValue: rec.oldValue || null, newValue: rec.newValue || rec.value, reason: rec.reason || null
    };
    records.unshift(fullRec);
    if (records.length > CONFIG.maxRecords) records = records.slice(0, CONFIG.maxRecords);
    updateSummary();
    saveLocalOnly();
    try {
        addDoc(collection(db, "logs"), fullRec).catch(e => console.error("Log error:", e));
        const archiveRef = collection(db, "audit_archive", student + "_" + getTodayDate(), "changes");
        addDoc(archiveRef, fullRec).catch(() => {});
    } catch(e) { console.error("Firebase log error:", e); }
}

function queueSave() {
    if (!isAutoSaveEnabled) return;
    if (saveTimeout) clearTimeout(saveTimeout);
    setSaveStatus("saving");
    saveTimeout = setTimeout(() => forceSave(), CONFIG.saveDebounceMs);
}

async function forceSave() {
    if (isSaving) return;
    isSaving = true;
    els.saveBtn.disabled = true;
    if (!db) {
        setSaveStatus("offline"); saveLocalOnly();
        els.saveBtn.disabled = false; isSaving = false; return;
    }
    const docId = getStudentDocId();
    if (!docId) { isSaving = false; els.saveBtn.disabled = false; return; }
    const today = getTodayDate();
    
    try {
        const name = els.name.value.trim();
        const year = els.year.value.trim();
        if (name && year) {
            const q = query(collection(db, "students"), where("name", "==", name));
            const snap = await getDocs(q);
            let existingDoc = null;
            snap.forEach(d => {
                const data = d.data();
                if (data.year === year) existingDoc = d.id;
            });
            if (existingDoc && existingDoc !== docId) {
                els.duplicateBanner.classList.add("active");
                els.duplicateText.textContent = `الطالبة "${name}" مسجلة بالفعل في ${year}! لا يمكن تسجيلها مرة أخرى.`;
                showToast(`الطالبة مسجلة بالفعل!`, "error", 4000);
                els.saveBtn.disabled = false; isSaving = false; return;
            }
        }
    } catch(e) { console.warn("Duplicate pre-check failed:", e); }

    try {
        const dailyRef = doc(db, "students", docId, "daily", today);
        const dailySnap = await getDoc(dailyRef);
        if (dailySnap.exists()) {
            const rData = dailySnap.data();
            const remoteUpdatedAt = rData.updatedAt || null;
            const remoteServer = rData.updatedBy || {};
            if (lastKnownUpdatedAt && remoteUpdatedAt && remoteUpdatedAt > lastKnownUpdatedAt && remoteServer.uid !== (currentServer && currentServer.uid)) {
                showConflict(remoteServer.name || "خادم آخر");
                els.saveBtn.disabled = false; isSaving = false; return;
            }
        }
    } catch(e) { console.warn("Conflict check failed:", e); }

    const basePayload = { name: els.name.value.trim(), year: els.year.value.trim(), lastUpdated: new Date().toISOString() };
    try { await setDoc(doc(db, "students", docId), basePayload, { merge: true }); } catch(e) { console.error("Base save error:", e); }

    const dailyPayload = { followups: {}, updatedAt: new Date().toISOString(), updatedBy: currentServer ? { uid: currentServer.uid, name: currentServer.name, email: currentServer.email } : null };
    DAYS.forEach(day => {
        dailyPayload.followups[day] = {};
        ACTS.forEach(act => {
            const key = day + "|" + act;
            dailyPayload.followups[day][act] = {
                attendance: attendance[key] === true ? true : (attendance[key] === false ? false : null),
                rating: ratings[key] || null
            };
        });
        dailyPayload.followups[day].note = document.getElementById("note-" + day)?.value || "";
    });

    try {
        await setDoc(doc(db, "students", docId, "daily", today), dailyPayload, { merge: true });
        lastKnownUpdatedAt = dailyPayload.updatedAt;
        isAlreadyAddedToday = true; showAddedToday();
        setSaveStatus("saved"); saveLocalOnly();
        showToast("تم الحفظ في السحابة", "success");
        await loadAllStudentsData();
    } catch(e) {
        console.error("Daily save error:", e);
        setSaveStatus("error"); saveLocalOnly();
        showToast("فشل الحفظ - محفوظ محلياً", "error");
    } finally {
        els.saveBtn.disabled = false; isSaving = false;
    }
}

function saveLocalOnly() {
    const docId = getStudentDocId();
    if (!docId) return;
    const followups = {};
    DAYS.forEach(day => { followups[day] = { note: document.getElementById("note-" + day)?.value || "" }; });
    const payload = {
        name: els.name.value.trim(), year: els.year.value.trim(),
        attendance: {...attendance}, ratings: {...ratings}, followups: followups,
        records: records.slice(0, CONFIG.maxRecords),
        lastKnownUpdatedAt: lastKnownUpdatedAt, isAlreadyAddedToday: isAlreadyAddedToday,
        savedAt: new Date().toISOString()
    };
    try {
        localStorage.setItem("khadem_data_" + docId, JSON.stringify(payload));
    } catch(e) {
        console.error("Local save error:", e);
        if (e.name === "QuotaExceededError") showToast("ذاكرة التخزين ممتلئة! صدّري البيانات", "error", 5000);
    }
}

function debouncedSearch() {
    if (searchTimeout) clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => doQuickSearch(), CONFIG.searchDebounceMs);
}

async function doQuickSearch() {
    const queryText = document.getElementById("quickSearch").value.trim();
    const resultsBox = els.searchResults;
    resultsBox.innerHTML = "";
    if (!queryText || queryText.length < 2) { resultsBox.classList.remove("active"); return; }
    if (searchAbortController) searchAbortController.abort();
    searchAbortController = new AbortController();
    let found = [];
    try {
        const q = query(
            collection(db, "students"),
            where("name", ">=", queryText),
            where("name", "<=", queryText + "\\uf8ff"),
            limit(10)
        );
        const snap = await getDocs(q);
        snap.forEach(d => {
            const data = d.data();
            found.push({ name: data.name, year: data.year, id: d.id });
        });
    } catch(e) { if (e.name !== "AbortError") console.error("Search error:", e); }
    if (found.length === 0) {
        resultsBox.innerHTML = '<div class="search-result-empty">لا توجد نتائج</div>';
    } else {
        found.forEach(s => {
            const div = document.createElement("div");
            div.className = "search-result-item";
            div.innerHTML = `<b>${escapeHtml(s.name)}</b> <span class="result-year">- ${escapeHtml(s.year)}</span>`;
            div.onclick = () => {
                els.name.value = s.name; els.year.value = s.year; els.studentDocId.value = s.id;
                document.getElementById("quickSearch").value = ""; resultsBox.classList.remove("active");
                loadStudent();
            };
            resultsBox.appendChild(div);
        });
    }
    resultsBox.classList.add("active");
}

function showTodayAttendance() {
    els.todayAttendanceModal.classList.add("active");
    els.todayAttLoadingOverlay.classList.add("active");
    renderTodayAttendance();
}

function closeTodayAttendance() {
    els.todayAttendanceModal.classList.remove("active");
}

async function renderTodayAttendance() {
    const today = getTodayDate();
    const currentMonthPrefix = today.slice(0, 7);
    
    try {
        const studentsSnap = await getDocs(collection(db, "students"));
        const students = [];
        studentsSnap.forEach(d => {
            const data = d.data();
            students.push({ id: d.id, name: data.name || "بدون اسم", year: data.year || "-" });
        });
        
        const totalStudents = students.length;
        let todayPresent = 0;
        let todayAbsent = 0;
        let todayNotRecorded = 0;
        const absentList = [];
        const monthlyStats = [];

        const studentPromises = students.map(async (student) => {
            const dailyRef = doc(db, "students", student.id, "daily", today);
            const dailySnap = await getDoc(dailyRef);
            
            let isPresentToday = false;
            let isRecordedToday = false;
            
            if (dailySnap.exists()) {
                const dData = dailySnap.data();
                isRecordedToday = true;
                if (dData.followups) {
                    Object.values(dData.followups).forEach(dayData => {
                        ACTS.forEach(act => {
                            const actData = dayData[act];
                            if (actData && actData.attendance === true) {
                                isPresentToday = true;
                            }
                        });
                    });
                }
            }
            
            if (isPresentToday) todayPresent++;
            else if (isRecordedToday) { todayAbsent++; absentList.push(student); }
            else { todayNotRecorded++; absentList.push(student); }
            
            let monthPresentCount = 0;
            try {
                const monthQuery = query(
                    collection(db, "students", student.id, "daily"),
                    where(documentId(), ">=", currentMonthPrefix + "-01"),
                    where(documentId(), "<=", currentMonthPrefix + "-31")
                );
                const monthSnap = await getDocs(monthQuery);
                monthSnap.forEach(d => {
                    const mData = d.data();
                    if (mData.followups) {
                        Object.values(mData.followups).forEach(dayData => {
                            ACTS.forEach(act => {
                                const actData = dayData[act];
                                if (actData && actData.attendance === true) monthPresentCount++;
                            });
                        });
                    }
                });
            } catch(e) { /* skip */ }
            
            monthlyStats.push({ ...student, monthPresentCount });
        });

        await Promise.all(studentPromises);

        document.getElementById("todayPresentCount").textContent = todayPresent;
        document.getElementById("todayAbsentCount").textContent = todayAbsent;
        document.getElementById("todayNotRecorded").textContent = todayNotRecorded;
        document.getElementById("todayTotalStudents").textContent = totalStudents;

        monthlyStats.sort((a, b) => b.monthPresentCount - a.monthPresentCount);
        const topList = document.getElementById("topAttendeesList");
        topList.innerHTML = "";
        
        if (monthlyStats.length === 0 || monthlyStats[0].monthPresentCount === 0) {
            topList.innerHTML = '<p style="color:var(--text-light);text-align:center;padding:10px;">لا توجد بيانات حضور كافية</p>';
        } else {
            monthlyStats.slice(0, 5).forEach((s, idx) => {
                const div = document.createElement("div");
                div.style.cssText = "display:flex;align-items:center;gap:12px;padding:12px;background:var(--bg);border-radius:10px;transition:var(--transition);";
                div.innerHTML = `
                    <div style="width:32px;height:32px;border-radius:50%;background:linear-gradient(135deg,var(--primary),var(--primary-light));color:white;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:0.9rem;">${idx + 1}</div>
                    <div style="flex:1;">
                        <div style="font-weight:700;font-size:0.95rem;">${escapeHtml(s.name)}</div>
                        <div style="font-size:0.8rem;color:var(--text-light);">${escapeHtml(s.year)}</div>
                    </div>
                    <div style="font-weight:800;color:var(--accent1);font-size:1.1rem;">${s.monthPresentCount} <span style="font-size:0.75rem;color:var(--text-light);font-weight:500;">حضور</span></div>
                `;
                topList.appendChild(div);
            });
        }

        const absentContainer = document.getElementById("absentTodayList");
        absentContainer.innerHTML = "";
        
        if (absentList.length === 0) {
            absentContainer.innerHTML = '<p style="color:var(--accent1);text-align:center;padding:20px;font-weight:700;">&#127881; كل الطالبات حاضرات أو مُسجلات!</p>';
        } else {
            absentList.sort((a, b) => (a.name || "").localeCompare(b.name || "", "ar"));
            
            absentList.forEach(s => {
                const div = document.createElement("div");
                div.className = "attendance-row";
                div.innerHTML = `
                    <div class="student-info">
                        <div class="student-name">${escapeHtml(s.name)}</div>
                        <div class="student-year">${escapeHtml(s.year)}</div>
                    </div>
                    <button class="btn btn-sm" style="background:var(--danger);color:white;border:none;padding:6px 14px;border-radius:20px;font-family:'Tajawal';font-weight:700;font-size:0.8rem;cursor:pointer;">
                        تسجيل &#9998;
                    </button>
                `;
                div.querySelector("button").onclick = () => quickLoadStudent(s.id, s.name, s.year);
                absentContainer.appendChild(div);
            });
        }

    } catch (error) {
        console.error("Today attendance error:", error);
        showToast("خطأ في تحميل بيانات الحضور", "error");
    } finally {
        els.todayAttLoadingOverlay.classList.remove("active");
    }
}

function quickLoadStudent(id, name, year) {
    closeTodayAttendance();
    els.studentSelect.value = "";
    els.name.value = name;
    els.year.value = year;
    els.studentDocId.value = id;
    loadStudent();
    showToast("جاري فتح بطاقة: " + name, "info");
}

function showStudentProfile() {
    els.profileModal.classList.add("active");
    els.profileLoadingOverlay.classList.add("active");
    renderStudentProfile();
    els.profileLoadingOverlay.classList.remove("active");
}

function closeStudentProfile() {
    els.profileModal.classList.remove("active");
}

async function renderStudentProfile() {
    const name = els.name.value.trim();
    const year = els.year.value.trim();
    const docId = els.studentDocId.value.trim();
    
    if (!name || !year || !docId) {
        els.profileStudentName.textContent = "-";
        els.profileStudentYear.textContent = "اختر طالبة أولاً";
        els.profileTimeline.innerHTML = '<div class="profile-empty">&#128221; اختار طالبة من القائمة واضغط "ملف الطالبة" لعرض سجلها الكامل</div>';
        els.profileTotalPresent.textContent = "حاضر: 0";
        els.profileTotalAbsent.textContent = "غائب: 0";
        els.profileAvgRating.textContent = "متوسط: 0.0";
        return;
    }

    els.profileStudentName.textContent = name;
    els.profileStudentYear.textContent = year;
    els.profileTimeline.innerHTML = '<div class="profile-empty">&#9203; جاري تحميل البيانات...</div>';

    try {
        const dailySnap = await getDocs(collection(db, "students", docId, "daily"));
        const allRecords = [];
        let totalPresent = 0, totalAbsent = 0, totalRatingSum = 0, totalRatingCount = 0;
        
        dailySnap.forEach(d => {
            const data = d.data();
            const dateStr = d.id;
            if (data.followups) {
                Object.keys(data.followups).forEach(day => {
                    const dayData = data.followups[day];
                    const dayRecord = {
                        date: dateStr,
                        day: day,
                        activities: [],
                        note: dayData.note || ""
                    };
                    
                    ACTS.forEach(act => {
                        const actData = dayData[act];
                        if (actData) {
                            const actRec = {
                                name: act,
                                attendance: actData.attendance,
                                rating: actData.rating || 0
                            };
                            dayRecord.activities.push(actRec);
                            
                            if (actData.attendance === true) totalPresent++;
                            else if (actData.attendance === false) totalAbsent++;
                            if (actData.rating) {
                                totalRatingSum += actData.rating;
                                totalRatingCount++;
                            }
                        }
                    });
                    
                    if (dayRecord.activities.length > 0) {
                        allRecords.push(dayRecord);
                    }
                });
            }
        });

        allRecords.sort((a, b) => b.date.localeCompare(a.date));

        els.profileTotalPresent.textContent = "حاضر: " + totalPresent;
        els.profileTotalAbsent.textContent = "غائب: " + totalAbsent;
        const avgRating = totalRatingCount > 0 ? (totalRatingSum / totalRatingCount).toFixed(1) : "0.0";
        els.profileAvgRating.textContent = "متوسط: " + avgRating;

        const groupedByMonth = {};
        allRecords.forEach(rec => {
            const monthKey = rec.date.slice(0, 7);
            if (!groupedByMonth[monthKey]) groupedByMonth[monthKey] = [];
            groupedByMonth[monthKey].push(rec);
        });

        const timeline = els.profileTimeline;
        timeline.innerHTML = "";

        if (allRecords.length === 0) {
            timeline.innerHTML = '<div class="profile-empty">&#128221; لا توجد بيانات مسجلة لهذه الطالبة بعد</div>';
            return;
        }

        const sortedMonths = Object.keys(groupedByMonth).sort((a, b) => b.localeCompare(a));
        
        sortedMonths.forEach(monthKey => {
            const monthRecords = groupedByMonth[monthKey];
            const [yearNum, monthNum] = monthKey.split("-");
            const monthDate = new Date(parseInt(yearNum), parseInt(monthNum) - 1, 1);
            const monthLabel = monthDate.toLocaleDateString("ar-EG", { year: "numeric", month: "long" });

            const monthSection = document.createElement("div");
            monthSection.className = "profile-month-section";
            
            let monthHtml = `<div class="profile-month-title">&#128197; ${monthLabel} (${monthRecords.length} يوم)</div>`;
            
            monthRecords.forEach(rec => {
                const dateObj = new Date(rec.date + "T12:00:00");
                
                let actsHtml = "";
                rec.activities.forEach(act => {
                    const attIcon = act.attendance === true ? "&#9989;" : (act.attendance === false ? "&#10060;" : "&#9898;");
                    const stars = act.rating > 0 ? "&#11088;".repeat(act.rating) : "<span style='color:#ccc;font-size:0.8rem;'>غير مقيم</span>";
                    actsHtml += `
                        <div class="profile-activity-item">
                            <span><b>${act.name}</b> ${attIcon}</span>
                            <span>${stars}</span>
                        </div>
                    `;
                });

                const noteHtml = rec.note ? `<div class="profile-note">&#128172; ${escapeHtml(rec.note)}</div>` : "";

                monthHtml += `
                    <div class="profile-day-card">
                        <div class="profile-day-title">
                            <span class="day-name">${rec.day}</span>
                            <span style="color:var(--text-light);font-size:0.85rem;">${rec.date}</span>
                        </div>
                        ${actsHtml}
                        ${noteHtml}
                    </div>
                `;
            });

            monthSection.innerHTML = monthHtml;
            timeline.appendChild(monthSection);
        });

    } catch (error) {
        console.error("Profile load error:", error);
        els.profileTimeline.innerHTML = '<div class="profile-empty">&#10060; خطأ في تحميل البيانات</div>';
        showToast("خطأ في تحميل ملف الطالبة", "error");
    }
}

function showStats() {
    els.statsModal.classList.add("active");
    els.statsLoadingOverlay.classList.add("active");
    renderStats();
    els.statsLoadingOverlay.classList.remove("active");
}

async function renderStats() {
    try {
        const studentsSnap = await getDocs(collection(db, "students"));
        let total = 0, studentStats = [], monthlyAbsents = 0, needFollow = 0;
        const currentMonth = new Date().toISOString().slice(0, 7);
        const studentIds = [];
        studentsSnap.forEach(d => studentIds.push({ id: d.id, data: d.data() }));
        total = studentIds.length;
        const dailyPromises = studentIds.map(s => getDocs(collection(db, "students", s.id, "daily")));
        const dailySnaps = await Promise.all(dailyPromises);

        studentIds.forEach((s, idx) => {
            const sName = s.data.name || "غير معروف";
            let presentCount = 0, absentCount = 0, ratingSum = 0, ratingCount = 0, monthAbsentCount = 0;
            dailySnaps[idx].forEach(d => {
                const dData = d.data(), date = d.id;
                if (dData.followups) {
                    Object.values(dData.followups).forEach(dayData => {
                        ACTS.forEach(act => {
                            const actData = dayData[act];
                            if (actData) {
                                if (actData.attendance === true) presentCount++;
                                else if (actData.attendance === false) { absentCount++; if (date.startsWith(currentMonth)) monthAbsentCount++; }
                                if (actData.rating) { ratingSum += actData.rating; ratingCount++; }
                            }
                        });
                    });
                }
            });
            const totalActs = presentCount + absentCount;
            const attRate = totalActs > 0 ? presentCount / totalActs : 0;
            const avgRate = ratingCount > 0 ? ratingSum / ratingCount : 0;
            studentStats.push({ name: sName, present: presentCount, absent: absentCount, attRate, avgRate, monthAbsent: monthAbsentCount });
            monthlyAbsents += monthAbsentCount;
            if (attRate < 0.5 || avgRate < 2.5) needFollow++;
        });

        const sortedByPresent = [...studentStats].sort((a, b) => b.present - a.present);
        const topPresent = sortedByPresent[0], leastPresent = sortedByPresent[sortedByPresent.length - 1];
        const overallAvg = studentStats.length > 0 ? (studentStats.reduce((s, st) => s + (st.avgRate || 0), 0) / studentStats.length).toFixed(1) : "0.0";

        document.getElementById("statTotalStudents").textContent = total;
        document.getElementById("statTopPresent").textContent = topPresent ? topPresent.name + " (" + topPresent.present + ")" : "-";
        document.getElementById("statLeastPresent").textContent = leastPresent ? leastPresent.name + " (" + leastPresent.present + ")" : "-";
        document.getElementById("statAvgRating").textContent = overallAvg;
        document.getElementById("statMonthlyAbsents").textContent = monthlyAbsents;
        document.getElementById("statNeedFollow").textContent = needFollow;

        let excellent = 0, good = 0, bad = 0;
        studentStats.forEach(st => {
            if (st.attRate >= 0.75 && st.avgRate >= 3.5) excellent++;
            else if (st.attRate >= 0.5 && st.avgRate >= 2.5) good++;
            else bad++;
        });
        const totalSafe = total || 1;
        const distDiv = document.getElementById("statusDistribution");
        distDiv.innerHTML = `
            <div style="display:flex;align-items:center;gap:12px;">
                <div style="width:20px;height:20px;border-radius:50%;background:var(--status-excellent);flex-shrink:0;"></div>
                <span style="flex:1;font-size:0.9rem;">&#127942; ممتاز (${excellent})</span>
                <div class="progress-bar-container"><div class="progress-bar-fill" style="width:${(excellent/totalSafe*100)}%;background:var(--status-excellent);"></div></div>
            </div>
            <div style="display:flex;align-items:center;gap:12px;">
                <div style="width:20px;height:20px;border-radius:50%;background:var(--status-good);flex-shrink:0;"></div>
                <span style="flex:1;font-size:0.9rem;">&#127941; جيد (${good})</span>
                <div class="progress-bar-container"><div class="progress-bar-fill" style="width:${(good/totalSafe*100)}%;background:var(--status-good);"></div></div>
            </div>
            <div style="display:flex;align-items:center;gap:12px;">
                <div style="width:20px;height:20px;border-radius:50%;background:var(--status-bad);flex-shrink:0;"></div>
                <span style="flex:1;font-size:0.9rem;">&#128308; يحتاج متابعة (${bad})</span>
                <div class="progress-bar-container"><div class="progress-bar-fill" style="width:${(bad/totalSafe*100)}%;background:var(--status-bad);"></div></div>
            </div>
        `;
    } catch(e) {
        console.error("Stats error:", e);
        showToast("خطأ في تحميل الإحصائيات", "error");
    }
}

function closeStats() { els.statsModal.classList.remove("active"); }

function generateMonthSelector() {
    const container = els.monthSelector;
    container.innerHTML = "";
    const now = new Date();
    for (let i = 0; i < CONFIG.monthsToShow; i++) {
        const d = new Date(now.getFullYear(), now.getMonth() - 2 + i, 1);
        const btn = document.createElement("button");
        btn.className = "month-btn" + (i === 2 ? " active" : "");
        btn.textContent = d.toLocaleDateString("ar-EG", { year: "numeric", month: "long" });
        btn.onclick = () => selectMonth(d.getFullYear(), d.getMonth());
        container.appendChild(btn);
    }
}

function showMonthlyLog() {
    els.monthlyModal.classList.add("active");
    const now = new Date();
    selectMonth(now.getFullYear(), now.getMonth());
}

function closeMonthlyLog() { els.monthlyModal.classList.remove("active"); }

function selectMonth(year, month) {
    const buttons = els.monthSelector.querySelectorAll(".month-btn");
    const now = new Date();
    buttons.forEach((btn, idx) => {
        const btnMonth = new Date(now.getFullYear(), now.getMonth() - 2 + idx, 1);
        btn.classList.toggle("active", btnMonth.getFullYear() === year && btnMonth.getMonth() === month);
    });

    const firstDay = new Date(year, month, 1);
    const lastDay   = new Date(year, month + 1, 0);

    const calendar = els.monthCalendar;
    calendar.innerHTML = "";
    calendar.style.gridTemplateColumns = "repeat(3, 1fr)";

    ["السبت", "الإثنين", "الأربعاء"].forEach(d => {
        const h = document.createElement("div");
        h.className = "cal-header";
        h.textContent = d;
        calendar.appendChild(h);
    });

    let saturday = new Date(firstDay);
    while (saturday.getDay() !== 6) {
        saturday.setDate(saturday.getDate() - 1);
    }

    const todayStr = getTodayDate();
    const offsets  = [0, 2, 4];

    for (let week = 0; week < 6; week++) {
        let weekHasCurrentMonth = false;

        for (const offset of offsets) {
            const cellDate = new Date(saturday);
            cellDate.setDate(saturday.getDate() + offset);

            const isCurrentMonth = cellDate.getMonth() === month && cellDate.getFullYear() === year;

            const cell = document.createElement("div");

            if (!isCurrentMonth) {
                cell.className = "cal-day empty";
                calendar.appendChild(cell);
                continue;
            }

            weekHasCurrentMonth = true;
            const d = cellDate.getDate();
            const dayStr = cellDate.toISOString().slice(0, 10);

            cell.className = "cal-day";
            cell.textContent = d;
            cell.setAttribute("role", "button");
            cell.setAttribute("tabindex", "0");
            cell.setAttribute("aria-label", "يوم " + d);

            if (dayStr === todayStr) {
                cell.classList.add("today");
                if (isAlreadyAddedToday) {
                    cell.classList.add("has-data");
                    cell.innerHTML += '<div class="cal-dot"></div>';
                }
            }

            cell.onclick = () => loadMonthDay(dayStr);
            cell.onkeydown = (e) => { if (e.key === "Enter" || e.key === " ") loadMonthDay(dayStr); };
            calendar.appendChild(cell);
        }

        if (!weekHasCurrentMonth && saturday > lastDay) break;
        saturday.setDate(saturday.getDate() + 7);
    }

    els.monthDetails.style.display = "none";
}

async function loadMonthDay(dateStr) {
    els.monthDetailTitle.textContent = "بيانات يوم " + dateStr;
    const content = els.monthDetailContent;
    content.innerHTML = "<p style=\\"text-align:center;color:var(--text-light);padding:20px;\\">&#9203; جاري التحميل...</p>";
    els.monthDetails.style.display = "block";
    if (!currentStudentId || !db) {
        content.innerHTML = "<p style=\\"color:var(--text-light)\\">لا يوجد بيانات - اختاري طالبة أولاً</p>";
        return;
    }
    try {
        const snap = await getDoc(doc(db, "students", currentStudentId, "daily", dateStr));
        if (snap.exists()) {
            const data = snap.data(); let html = "";
            if (data.followups) {
                DAYS.forEach(day => {
                    const dayData = data.followups[day];
                    if (dayData) {
                        html += '<div style="margin-bottom:12px;padding:14px;background:white;border-radius:10px;box-shadow:0 2px 8px rgba(0,0,0,0.04);">';
                        html += '<b style="color:var(--primary);display:block;margin-bottom:8px;">' + day + '</b>';
                        ACTS.forEach(act => {
                            const actData = dayData[act];
                            if (actData) {
                                const att = actData.attendance === true ? "&#9989; حاضرة" : (actData.attendance === false ? "&#10060; غائبة" : "➖");
                                const rat = actData.rating ? "&#11088;".repeat(actData.rating) : "غير مقيم";
                                html += '<div style="padding:4px 0;font-size:0.9rem;"><b>' + act + '</b>: ' + att + ' | ' + rat + '</div>';
                            }
                        });
                        if (dayData.note) html += '<div style="margin-top:8px;padding:8px;background:var(--bg);border-radius:6px;font-size:0.85rem;color:var(--text-light);">&#128172; ' + escapeHtml(dayData.note) + '</div>';
                        html += "</div>";
                    }
                });
            }
            if (data.updatedBy) html += '<div style="margin-top:12px;font-size:0.8rem;color:var(--text-light);">&#128100; سُجلت بواسطة: ' + escapeHtml(data.updatedBy.name) + ' (' + data.updatedBy.email + ')</div>';
            content.innerHTML = html || "<p style=\\"color:var(--text-light)\\">لا توجد أنشطة مسجلة</p>";
        } else {
            content.innerHTML = "<p style=\\"color:var(--text-light)\\">لا توجد بيانات لهذا اليوم</p>";
        }
    } catch(e) { content.innerHTML = "<p style=\\"color:var(--danger)\\">&#10060; خطأ في التحميل</p>"; }
}

function showLog() {
    els.logModal.classList.add("active");
    els.logLoadingOverlay.classList.add("active");
    renderLogTable();
    els.logLoadingOverlay.classList.remove("active");
}

async function renderLogTable() {
    const viewMode = document.getElementById("filterViewMode").value;
    const fDay = document.getElementById("filterDay").value;
    const fType = document.getElementById("filterType").value;

    if (viewMode === "aggregated") {
        els.logAggregatedView.style.display = "block";
        els.logDetailedTable.style.display = "none";
    } else {
        els.logAggregatedView.style.display = "none";
        els.logDetailedTable.style.display = "table";
    }

    if (db && els.name.value.trim()) {
        try {
            const logsQuery = query(
                collection(db, "logs"),
                where("studentName", "==", els.name.value.trim()),
                orderBy("timestamp", "desc"),
                limit(CONFIG.maxLogEntries)
            );
            const logsSnap = await getDocs(logsQuery);
            const freshRecords = [];
            logsSnap.forEach(d => freshRecords.push(d.data()));
            records = mergeRecords(freshRecords, records);
            updateSummary();
        } catch(e) { console.warn("Could not refresh logs:", e); }
    }

    let displayRecords = records.slice(0, CONFIG.maxLogEntries).filter(r => {
        if (fDay && r.day !== fDay) return false;
        if (fType && r.type !== fType) return false;
        return true;
    });

    if (viewMode === "aggregated") {
        const aggContainer = els.logAggregatedView;
        aggContainer.innerHTML = "";
        
        if (displayRecords.length === 0) {
            aggContainer.innerHTML = '<p style="text-align:center;color:var(--text-light);padding:30px;">لا يوجد سجلات مطابقة</p>';
            return;
        }

        const groupedByDate = {};
        displayRecords.forEach(rec => {
            const dateKey = rec.followDate || rec.timestamp?.slice(0, 10) || "unknown";
            if (!groupedByDate[dateKey]) groupedByDate[dateKey] = [];
            groupedByDate[dateKey].push(rec);
        });

        const sortedDates = Object.keys(groupedByDate).sort((a, b) => b.localeCompare(a));

        sortedDates.forEach(dateKey => {
            const dateRecords = groupedByDate[dateKey];
            const dateObj = new Date(dateKey + "T12:00:00");
            const dateLabel = dateObj.toLocaleDateString("ar-EG", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
            
            const servers = [...new Set(dateRecords.map(r => r.serverName).filter(Boolean))];
            const serverStr = servers.join(", ");

            const actsByDayAct = {};
            dateRecords.forEach(rec => {
                const key = (rec.day || "عام") + "|" + (rec.activity || "عام");
                if (!actsByDayAct[key]) actsByDayAct[key] = [];
                actsByDayAct[key].push(rec);
            });

            let activitiesHtml = '<div class="agg-activities-grid">';
            Object.keys(actsByDayAct).forEach(key => {
                const [day, act] = key.split("|");
                const recs = actsByDayAct[key];
                const lastRec = recs[0];
                
                let attHtml = "";
                const attRec = recs.find(r => r.type === "attendance");
                if (attRec) {
                    const isPresent = attRec.newValue === "حاضرة";
                    attHtml = `<div class="act-detail">${isPresent ? "&#9989; حاضرة" : "&#10060; غائبة"}</div>`;
                }
                
                let ratHtml = "";
                const ratRec = recs.find(r => r.type === "rating");
                if (ratRec && ratRec.newValue) {
                    const stars = parseInt(ratRec.newValue);
                    if (!isNaN(stars)) ratHtml = `<div class="act-detail">${"&#11088;".repeat(stars)}</div>`;
                }

                let reasonHtml = "";
                const reason = lastRec.reason;
                if (reason) reasonHtml = `<span class="reason-tag">&#128172; ${escapeHtml(reason)}</span>`;

                activitiesHtml += `
                    <div class="agg-activity-box">
                        <div class="act-name">${escapeHtml(day)} - ${escapeHtml(act)}</div>
                        ${attHtml}
                        ${ratHtml}
                        ${reasonHtml}
                    </div>
                `;
            });
            activitiesHtml += '</div>';

            const dayHeader = document.createElement("div");
            dayHeader.innerHTML = `
                <div class="agg-day-header">
                    <span>${dateLabel}</span>
                    <span style="font-size:0.85rem;opacity:0.9;">${escapeHtml(serverStr)}</span>
                </div>
                ${activitiesHtml}
            `;
            aggContainer.appendChild(dayHeader);
        });
        return;
    }

    const tbody = els.logTableBody;
    tbody.innerHTML = "";

    if (displayRecords.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--text-light);padding:30px;">لا يوجد سجلات مطابقة</td></tr>';
        return;
    }
    const fragment = document.createDocumentFragment();
    displayRecords.forEach(rec => {
        const date = new Date(rec.timestamp);
        const timeStr = date.toLocaleString("ar-EG", { hour12: false });
        let changeHtml = "";
        if (rec.oldValue && rec.newValue) changeHtml = '<span class="old-val">' + escapeHtml(String(rec.oldValue)) + '</span> &#10132; <span class="new-val">' + escapeHtml(String(rec.newValue)) + '</span>';
        else changeHtml = '<span class="new-val">' + escapeHtml(String(rec.newValue || rec.value || "-")) + '</span>';
        let tagClass = "tag-present";
        if (rec.type === "attendance" && rec.newValue === "غائبة") tagClass = "tag-absent";
        else if (rec.type === "rating") tagClass = "tag-rating";
        else if (rec.type === "note") tagClass = "tag-change";
        const reasonHtml = rec.reason ? '<span class="reason-tag">&#128172; ' + escapeHtml(rec.reason) + '</span>' : "";
        const typeLabel = rec.type === "attendance" ? "حضور" : (rec.type === "rating" ? "تقييم" : rec.type);
        const tr = document.createElement("tr");
        tr.innerHTML = "<td><b>" + timeStr + "</b></td>" +
            "<td><b>" + escapeHtml(rec.serverName || "-") + "</b><br><small style=\"color:#999\">" + escapeHtml(rec.serverEmail || "-") + "</small></td>" +
            "<td>" + escapeHtml(rec.studentName || "-") + "</td>" +
            "<td>" + escapeHtml(rec.day || "-") + "<br><small>" + escapeHtml(rec.activity || "-") + "</small></td>" +
            "<td><span class=\"tag " + tagClass + "\">" + typeLabel + "</span><br>" + changeHtml + "</td>" +
            "<td>" + reasonHtml + "</td>";
        fragment.appendChild(tr);
    });
    tbody.appendChild(fragment);
}

function closeLog() { els.logModal.classList.remove("active"); }

async function exportData(format) {
    const student = els.name.value.trim() || "غير_محدد";
    const payload = {
        exportDate: new Date().toISOString(), exportedBy: currentServer,
        studentName: student, studentYear: els.year.value.trim(), followDate: getTodayDate(),
        attendance: {...attendance}, ratings: {...ratings}, records: records
    };
    if (db && currentStudentId) {
        try {
            const snap = await getDoc(doc(db, "students", currentStudentId, "daily", getTodayDate()));
            if (snap.exists()) payload.firebaseData = snap.data();
        } catch(e) {}
    }
    if (format === "json") {
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url; a.download = "followup_" + student.replace(/\\s+/g, "_") + "_" + getTodayDate() + ".json";
        document.body.appendChild(a); a.click();
        setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);
        showToast("تم تصدير JSON", "success");
    } else if (format === "csv") {
        let csv = "timestamp,serverId,serverName,serverEmail,studentName,studentYear,followDate,day,activity,type,oldValue,newValue,reason\\n";
        records.forEach(r => {
            csv += (r.timestamp || "") + "," + (r.serverId || "") + "," + (r.serverName || "") + "," + (r.serverEmail || "") + "," +
                   (r.studentName || "") + "," + (r.studentYear || "") + "," + (r.followDate || "") + "," +
                   (r.day || "") + "," + (r.activity || "") + "," + (r.type || "") + "," +
                   "\\\"" + (r.oldValue || "") + "\\\"," + "\\\"" + (r.newValue || r.value || "") + "\\\"," + "\\\"" + (r.reason || "") + "\\\"\\n";
        });
        const blob = new Blob(["\\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url; a.download = "followup_audit_" + getTodayDate() + ".csv";
        document.body.appendChild(a); a.click();
        setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);
        showToast("تم تصدير CSV", "success");
    }
}

async function resetAll() {
    if (!confirm("هل تريدين مسح جميع البيانات لهذه الطالبة؟\\n\\nالسجل التاريخي في Firebase ميتحذفش.")) return;
    const docId = getStudentDocId();
    resetUI(true, true);
    if (db && docId) {
        try {
            await deleteDoc(doc(db, "students", docId, "daily", getTodayDate()));
            showToast("تم المسح من السحابة", "success");
        } catch(e) {
            console.error("Delete error:", e);
            showToast("خطأ في المسح من السحابة", "error");
        }
    }
    const key = getLocalStorageKey();
    if (key) localStorage.removeItem(key);
    await loadAllStudentsData();
}

function setupKeyboardShortcuts() {
    document.addEventListener("keydown", (e) => {
        if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA" || e.target.tagName === "SELECT") {
            if (e.key === "Escape") {
                els.searchResults.classList.remove("active");
                document.querySelectorAll(".modal-overlay.active").forEach(m => m.classList.remove("active"));
            }
            return;
        }
        if (e.ctrlKey || e.metaKey) {
            switch(e.key.toLowerCase()) {
                case "s": e.preventDefault(); forceSave(); break;
                case "p": e.preventDefault(); window.print(); break;
                case "f": e.preventDefault(); document.getElementById("quickSearch").focus(); break;
                case "n": e.preventDefault(); newStudent(); break;
                case "h": e.preventDefault(); showLog(); break;
                case "i": e.preventDefault(); showStats(); break;
                case "m": e.preventDefault(); showStudentProfile(); break;
            }
        }
        if (e.key === "Escape") {
            els.searchResults.classList.remove("active");
            document.querySelectorAll(".modal-overlay.active").forEach(m => m.classList.remove("active"));
        }
    });
    document.getElementById("loginEmail").addEventListener("keydown", (e) => { if (e.key === "Enter") document.getElementById("loginPassword").focus(); });
    document.getElementById("loginPassword").addEventListener("keydown", (e) => { if (e.key === "Enter") handleLogin(); });
    document.getElementById("regName").addEventListener("keydown", (e) => { if (e.key === "Enter") document.getElementById("regEmail").focus(); });
    document.getElementById("regEmail").addEventListener("keydown", (e) => { if (e.key === "Enter") document.getElementById("regPassword").focus(); });
    document.getElementById("regPassword").addEventListener("keydown", (e) => { if (e.key === "Enter") document.getElementById("regPasswordConfirm").focus(); });
    document.getElementById("regPasswordConfirm").addEventListener("keydown", (e) => { if (e.key === "Enter") handleRegister(); });
}

function toggleShortcuts() { els.shortcutsHelp.classList.toggle("active"); }

// Event Listeners
document.getElementById("authToggleBtn").addEventListener("click", toggleAuthMode);
document.getElementById("loginBtn").addEventListener("click", handleLogin);
document.getElementById("registerBtn").addEventListener("click", handleRegister);
document.getElementById("btnLogout").addEventListener("click", logout);
document.getElementById("btnNewStudent").addEventListener("click", newStudent);
document.getElementById("btnLoadStudent").addEventListener("click", checkDuplicateAndLoad);
document.getElementById("btnRefreshAll").addEventListener("click", loadAllStudentsData);
document.getElementById("saveBtn").addEventListener("click", forceSave);
document.getElementById("btnPrint").addEventListener("click", () => window.print());
document.getElementById("btnExportJson").addEventListener("click", () => exportData("json"));
document.getElementById("btnExportCsv").addEventListener("click", () => exportData("csv"));
document.getElementById("btnReset").addEventListener("click", resetAll);
document.getElementById("btnToday").addEventListener("click", showTodayAttendance);
document.getElementById("btnProfile").addEventListener("click", showStudentProfile);
document.getElementById("btnStats").addEventListener("click", showStats);
document.getElementById("btnLog").addEventListener("click", showLog);
document.getElementById("btnMonthly").addEventListener("click", showMonthlyLog);
document.getElementById("closeLog").addEventListener("click", closeLog);
document.getElementById("closeStats").addEventListener("click", closeStats);
document.getElementById("closeMonthly").addEventListener("click", closeMonthlyLog);
document.getElementById("closeToday").addEventListener("click", closeTodayAttendance);
document.getElementById("closeProfile").addEventListener("click", closeStudentProfile);
document.getElementById("shortcutToggle").addEventListener("click", toggleShortcuts);
document.getElementById("studentSelect").addEventListener("change", onStudentSelectChange);
document.getElementById("quickSearch").addEventListener("input", debouncedSearch);
document.getElementById("filterDay").addEventListener("change", renderLogTable);
document.getElementById("filterType").addEventListener("change", renderLogTable);
document.getElementById("filterViewMode").addEventListener("change", renderLogTable);

// Modals close on backdrop
[els.logModal, els.statsModal, els.monthlyModal, els.todayAttendanceModal, els.profileModal].forEach(modal => {
    if (!modal) return;
    modal.addEventListener("click", (e) => {
        if (e.target === modal) modal.classList.remove("active");
    });
});

// Close search when clicking outside
document.addEventListener("click", (e) => {
    if (!e.target.closest(".search-wrap")) els.searchResults.classList.remove("active");
});

// Network status
window.addEventListener("online", () => {
    setSaveStatus("online");
    els.offlineBanner.classList.remove("active");
    showToast("تم استعادة الاتصال", "success");
    if (currentServer) forceSave();
});

window.addEventListener("offline", () => {
    setSaveStatus("offline");
    els.offlineBanner.classList.add("active");
    showToast("فُقد الاتصال - الوضع المحلي مفعل", "warning", 5000);
});

// Save on hide
document.addEventListener("visibilitychange", () => {
    if (document.hidden && (saveTimeout || Object.keys(attendance).length > 0)) forceSave();
});

window.addEventListener("beforeunload", (e) => { if (saveTimeout) forceSave(); });

// Auth state listener
onAuthStateChanged(auth, async (user) => {
    if (user) {
        await completeLogin(user);
    } else {
        els.loginOverlay.style.display = "flex";
        els.mainApp.style.display = "none";
    }
});

updateTodayBadge();

// ===== Event Listeners =====

document.addEventListener("DOMContentLoaded", () => {

    // Login
    if (els.loginBtn) {
        els.loginBtn.addEventListener("click", handleLogin);
    }

    // Register
    const registerBtn = document.getElementById("registerBtn");
    if (registerBtn) {
        registerBtn.addEventListener("click", handleRegister);
    }

    // Toggle Login/Register
    if (els.authToggleBtn) {
        els.authToggleBtn.addEventListener("click", toggleAuthMode);
    }

    // Student Actions
    const btnLoadStudent = document.getElementById("btnLoadStudent");
    if (btnLoadStudent) {
        btnLoadStudent.addEventListener("click", checkDuplicateAndLoad);
    }

    const btnNewStudent = document.getElementById("btnNewStudent");
    if (btnNewStudent) {
        btnNewStudent.addEventListener("click", newStudent);
    }

    const studentSelect = document.getElementById("studentSelect");
    if (studentSelect) {
        studentSelect.addEventListener("change", onStudentSelectChange);
    }

    // Logout
    const btnLogout = document.getElementById("btnLogout");
    if (btnLogout) {
        btnLogout.addEventListener("click", logout);
    }

    console.log("All events connected successfully");
