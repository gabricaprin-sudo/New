// ============================================
// app-core.js - Core Application Logic v8
// Enterprise-grade + Mobile-optimized for 200+ students
// ============================================

const DAYS = ["السبت", "الإثنين", "الأربعاء"];
const ACTIVITIES = [
    { id: "alhan", name: "الحان", icon: "🎵", cls: "icon-music" },
    { id: "dirasi", name: "الدراسي", icon: "📚", cls: "icon-study" },
    { id: "aibti", name: "الأقباطي", icon: "⛪", cls: "icon-copt" },
    { id: "taranim", name: "الترانيم", icon: "🎤", cls: "icon-mem" }
];

const DATA_VERSION = 2;
const SAVE_DEBOUNCE_MS = 500;
const AUTO_SAVE_MS = 2000;
const MAX_SYNC_RETRIES = 3;
const PAGE_SIZE = 50;
const MAX_IMPORT_SIZE = 5000;
const MAX_NOTE_LENGTH = 5000;
const PENDING_SYNC_CLEANUP_MS = 30000;

// ========== STATE ==========
let allStudents = [];
let currentStudent = null;
let localData = {};
let studentsMap = new Map();
let idToIndex = new Map();
let attendanceDateIndex = new Set();
let searchIndex = new Map();
let saveQueue = new Map();
let pendingSyncQueue = new Map();
let modalControllers = new Map();
let autoSaveTimer = null;
let currentPage = 0;
let currentFilter = { year: "", sort: "name", search: "" };
let hasUnsavedChanges = false;
let statsCache = null;
let statsCacheTime = 0;
const STATS_CACHE_TTL = 30000; // 30 seconds

// ========== HELPERS ==========
const ESCAPE_MAP = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
function escapeHtml(str) { return str === null || str === undefined ? "" : String(str).replace(/[&<>"']/g, m => ESCAPE_MAP[m]); }
function escapeCsv(value) { let str = String(value ?? ""); if (/^[=+\-@]/.test(str)) str = "'" + str; if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")) return '"' + str.replace(/"/g, '""') + '"'; return str; }
function normalizeArabic(str) { if (!str) return ""; return str.normalize("NFKD").replace(/[\u064B-\u065F\u0670\u0640]/g, "").replace(/[أإآ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي").replace(/ؤ/g, "و").replace(/ئ/g, "ي").replace(/[\u200E\u200F]/g, "").toLowerCase().trim(); }
function getTodayName() { const d = new Date(); const day = d.getDay(); if (day === 6) return "السبت"; if (day === 1) return "الإثنين"; if (day === 3) return "الأربعاء"; return ""; }
function getTodayDateStr() { const d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
function getLocalISOString() { const d = new Date(); const offset = d.getTimezoneOffset(); const local = new Date(d.getTime() - offset * 60000); return local.toISOString(); }
function getArabicDate() { return new Date().toLocaleDateString('ar-EG', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }); }
function generateId() { if (typeof crypto !== "undefined" && crypto.randomUUID) return "stu_" + crypto.randomUUID(); if (typeof crypto !== "undefined" && crypto.getRandomValues) { const arr = new Uint8Array(16); crypto.getRandomValues(arr); const hex = Array.from(arr, b => b.toString(16).padStart(2, "0")).join(""); return "stu_" + hex; } return "stu_" + Date.now() + "_" + Math.random().toString(36).substr(2, 9); }
function parseAttendanceKey(key) { const parts = key.split("_"); if (parts.length >= 3) return { date: parts[0], day: parts[1], actId: parts[2] }; return null; }
function buildAttendanceKey(date, day, actId) { return date + "_" + day + "_" + actId; }

// ========== MIGRATION ==========
function migrateStudentData(data) {
    if (!data || typeof data !== "object") return data;
    if (data._version === DATA_VERSION) return data;

    if (data.attendance && typeof data.attendance === "object") {
        const firstKey = Object.keys(data.attendance)[0];
        if (firstKey && firstKey.includes("_")) {
            const oldAttendance = data.attendance;
            const oldRatings = data.ratings || {};
            const newAttendance = {};
            const newRatings = {};

            Object.keys(oldAttendance).forEach(key => {
                const parsed = parseAttendanceKey(key);
                if (parsed) {
                    if (!newAttendance[parsed.date]) newAttendance[parsed.date] = {};
                    if (!newAttendance[parsed.date][parsed.day]) newAttendance[parsed.date][parsed.day] = {};
                    newAttendance[parsed.date][parsed.day][parsed.actId] = oldAttendance[key];

                    if (oldRatings[key]) {
                        if (!newRatings[parsed.date]) newRatings[parsed.date] = {};
                        if (!newRatings[parsed.date][parsed.day]) newRatings[parsed.date][parsed.day] = {};
                        newRatings[parsed.date][parsed.day][parsed.actId] = oldRatings[key];
                    }
                }
            });

            data.attendance = newAttendance;
            data.ratings = newRatings;
        }
    }

    data._version = DATA_VERSION;
    return data;
}

// ========== INDEXEDDB ==========
const DB_NAME = "kenesa_db";
const DB_VERSION = 2;
let idb = null;

function initIndexedDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => { idb = request.result; resolve(idb); };
        request.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains("students")) db.createObjectStore("students", { keyPath: "id" });
            if (!db.objectStoreNames.contains("logs")) db.createObjectStore("logs", { keyPath: "id", autoIncrement: true });
            if (!db.objectStoreNames.contains("backups")) db.createObjectStore("backups", { keyPath: "id" });
            if (!db.objectStoreNames.contains("pendingSync")) db.createObjectStore("pendingSync", { keyPath: "id" });
            if (!db.objectStoreNames.contains("snapshots")) db.createObjectStore("snapshots", { keyPath: "id", autoIncrement: true });
        };
    });
}

async function saveToIndexedDB(id, data) {
    if (!idb) await initIndexedDB();
    return new Promise((resolve, reject) => {
        const tx = idb.transaction(["students"], "readwrite");
        const store = tx.objectStore("students");
        const req = store.put({ id, ...data });
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
    });
}

async function loadFromIndexedDB() {
    if (!idb) await initIndexedDB();
    return new Promise((resolve, reject) => {
        const tx = idb.transaction(["students"], "readonly");
        const store = tx.objectStore("students");
        const req = store.getAll();
        req.onsuccess = () => {
            const result = {};
            req.result.forEach(item => {
                const { id, ...data } = item;
                result[id] = migrateStudentData(data);
            });
            resolve(result);
        };
        req.onerror = () => reject(req.error);
    });
}

async function clearIndexedDB() {
    if (!idb) await initIndexedDB();
    return new Promise((resolve, reject) => {
        const tx = idb.transaction(["students", "pendingSync", "backups", "snapshots"], "readwrite");
        tx.objectStore("students").clear();
        tx.objectStore("pendingSync").clear();
        tx.objectStore("backups").clear();
        tx.objectStore("snapshots").clear();
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}

async function saveBackup(id, data) {
    if (!idb) await initIndexedDB();
    return new Promise((resolve, reject) => {
        const tx = idb.transaction(["backups"], "readwrite");
        const store = tx.objectStore("backups");
        const req = store.put({ id, data, timestamp: Date.now() });
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
    });
}

async function deleteBackup(id) {
    if (!idb) await initIndexedDB();
    return new Promise((resolve, reject) => {
        const tx = idb.transaction(["backups"], "readwrite");
        const store = tx.objectStore("backups");
        const req = store.delete(id);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
    });
}

async function savePendingSync(id, data) {
    if (!idb) await initIndexedDB();
    return new Promise((resolve, reject) => {
        const tx = idb.transaction(["pendingSync"], "readwrite");
        const store = tx.objectStore("pendingSync");
        const req = store.put({ id, data, retries: 0, lastAttempt: Date.now() });
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
    });
}

async function loadPendingSyncs() {
    if (!idb) await initIndexedDB();
    return new Promise((resolve, reject) => {
        const tx = idb.transaction(["pendingSync"], "readonly");
        const store = tx.objectStore("pendingSync");
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
    });
}

async function removePendingSync(id) {
    if (!idb) await initIndexedDB();
    return new Promise((resolve, reject) => {
        const tx = idb.transaction(["pendingSync"], "readwrite");
        const store = tx.objectStore("pendingSync");
        const req = store.delete(id);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
    });
}

async function saveSnapshot() {
    if (!idb) await initIndexedDB();
    return new Promise((resolve, reject) => {
        const tx = idb.transaction(["snapshots"], "readwrite");
        const store = tx.objectStore("snapshots");
        const snapshot = {
            data: JSON.parse(JSON.stringify(localData)),
            timestamp: Date.now(),
            date: getTodayDateStr()
        };
        const req = store.add(snapshot);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
    });
}

async function checkCrashRecovery() {
    try {
        const backups = await new Promise((resolve, reject) => {
            if (!idb) { resolve([]); return; }
            const tx = idb.transaction(["backups"], "readonly");
            const store = tx.objectStore("backups");
            const req = store.getAll();
            req.onsuccess = () => resolve(req.result || []);
            req.onerror = () => reject(req.error);
        });

        if (backups.length > 0) {
            const recovered = backups.length;
            for (const backup of backups) {
                if (backup.data) {
                    localData[backup.id] = backup.data;
                    studentsMap.set(backup.id, backup.data);
                }
            }
            rebuildIndex();
            showToast("🔄 تم استعادة " + recovered + " سجل بعد crash", "warning", 4000);
        }
    } catch (e) {
        console.warn("Crash recovery check failed:", e);
    }
}

// ========== LOCALSTORAGE (SETTINGS ONLY) ==========
function loadSettings() {
    try {
        const server = localStorage.getItem("kenesa_current_server");
        if (server) window.currentServer = JSON.parse(server);
    } catch (e) { console.warn("Settings load failed:", e); }
}

function saveSettings() {
    try {
        if (window.currentServer) {
            localStorage.setItem("kenesa_current_server", JSON.stringify(window.currentServer));
        }
    } catch (e) { console.warn("Settings save failed:", e); }
}

// ========== STORAGE INITIALIZATION ==========
async function initializeStorage() {
    try {
        await initIndexedDB();
        const idbData = await loadFromIndexedDB();
        if (Object.keys(idbData).length > 0) {
            localData = idbData;
        }
    } catch (e) {
        console.warn("IndexedDB init failed:", e);
    }
    rebuildIndex();
    loadSettings();
}

// ========== INDEX MANAGEMENT ==========
function rebuildIndex() {
    studentsMap.clear();
    idToIndex.clear();
    attendanceDateIndex.clear();
    searchIndex.clear();

    Object.keys(localData).forEach((id, idx) => {
        const data = localData[id];
        studentsMap.set(id, data);
        idToIndex.set(id, idx);
        updateAttendanceIndex(data);
        updateSearchIndex(id, data.name);
    });
}

function updateAttendanceIndex(data) {
    const att = data.attendance || {};
    Object.keys(att).forEach(date => {
        if (typeof att[date] === "object") {
            attendanceDateIndex.add(date);
        }
    });
}

function updateSearchIndex(id, name) {
    if (!name) return;
    const normalized = normalizeArabic(name);
    if (!searchIndex.has(normalized)) {
        searchIndex.set(normalized, new Set());
    }
    searchIndex.get(normalized).add(id);

    const words = normalized.split(/\s+/);
    words.forEach(word => {
        if (word.length < 2) return;
        if (!searchIndex.has(word)) {
            searchIndex.set(word, new Set());
        }
        searchIndex.get(word).add(id);
    });
}

function removeFromSearchIndex(id, oldName) {
    if (!oldName) return;
    const normalized = normalizeArabic(oldName);
    const set = searchIndex.get(normalized);
    if (set) {
        set.delete(id);
        if (set.size === 0) searchIndex.delete(normalized);
    }
    const words = normalized.split(/\s+/);
    words.forEach(word => {
        if (word.length < 2) return;
        const wordSet = searchIndex.get(word);
        if (wordSet) {
            wordSet.delete(id);
            if (wordSet.size === 0) searchIndex.delete(word);
        }
    });
}

// ========== STUDENT LOCAL ==========
function getStudentLocal(id) {
    return studentsMap.get(id) || { name: "", year: "", attendance: {}, ratings: {}, notes: {}, presentCount: 0, absentCount: 0, totalRating: 0, ratingCount: 0, _version: DATA_VERSION };
}

function setStudentLocal(id, data) {
    const oldData = studentsMap.get(id);
    const oldName = oldData ? oldData.name : null;

    localData[id] = data;
    studentsMap.set(id, data);

    updateAttendanceIndex(data);
    if (oldName) removeFromSearchIndex(id, oldName);
    updateSearchIndex(id, data.name);

    queueIndexedSave(id, data);
}

// ========== SAVE THROTTLING ==========
let indexedSaveQueue = new Map();

function queueIndexedSave(id, data) {
    if (indexedSaveQueue.has(id)) {
        clearTimeout(indexedSaveQueue.get(id));
    }
    const timeout = setTimeout(() => {
        saveToIndexedDB(id, data).catch(e => console.warn("IndexedDB save failed:", e));
        indexedSaveQueue.delete(id);
    }, 300);
    indexedSaveQueue.set(id, timeout);
}

function queueSave(id, data) {
    if (saveQueue.has(id)) {
        clearTimeout(saveQueue.get(id));
    }
    const timeout = setTimeout(async () => {
        await performSave(id, data);
        saveQueue.delete(id);
    }, SAVE_DEBOUNCE_MS);
    saveQueue.set(id, timeout);
}

async function performSave(id, data) {
    await saveBackup(id, data).catch(e => console.warn("Backup failed:", e));

    const existingIdx = idToIndex.get(id);
    if (existingIdx === undefined) {
        allStudents.push({ id, ...data });
        idToIndex.set(id, allStudents.length - 1);
    } else {
        allStudents[existingIdx] = { id, ...data };
    }

    updateStudentCard(id);
    updateStudentSelectOption(id);
    hasUnsavedChanges = true;

    await deleteBackup(id).catch(() => {});
}

// ========== AUTO SAVE ==========
function setupAutoSave() {
    const inputs = document.querySelectorAll(".att-toggle, .star, .note-input");
    inputs.forEach(input => {
        input.addEventListener("change", triggerAutoSave);
        input.addEventListener("input", triggerAutoSave);
    });
}

function triggerAutoSave() {
    if (autoSaveTimer) clearTimeout(autoSaveTimer);
    const indicator = document.getElementById("autoSaveIndicator");
    if (indicator) {
        indicator.textContent = "جارٍ الحفظ...";
        indicator.className = "auto-save-indicator pending";
    }
    hasUnsavedChanges = true;

    autoSaveTimer = setTimeout(() => {
        const docIdEl = document.getElementById("studentDocId");
        const nameEl = document.getElementById("studentName");
        if (docIdEl && docIdEl.value && nameEl && nameEl.value.trim()) {
            handleSave();
        }
        if (indicator) {
            indicator.textContent = "تم الحفظ";
            indicator.className = "auto-save-indicator saved";
            setTimeout(() => { indicator.textContent = ""; }, 3000);
        }
    }, AUTO_SAVE_MS);
}

// ========== FIREBASE ==========
function getDb() { return window.db || null; }
function getFirestoreFns() { return window.firestoreFns || {}; }
function isFirebaseReady() { return window.firebaseReady || false; }

async function syncToFirebase(id, data) {
    const db = getDb();
    const firebaseReady = isFirebaseReady();
    const fns = getFirestoreFns();

    if (!firebaseReady || !db || !window.currentServer || !fns.doc) {
        return false;
    }

    try {
        const { doc, setDoc, collection, addDoc, serverTimestamp } = fns;
        await setDoc(doc(db, "students", id), data);
        await addDoc(collection(db, "logs"), {
            serverId: window.currentServer.uid,
            serverName: window.currentServer.name,
            studentId: id,
            studentName: data.name,
            type: "save",
            timestamp: serverTimestamp()
        });
        return true;
    } catch (e) {
        console.warn("Firebase sync failed:", e);
        return false;
    }
}

async function retryPendingSyncs() {
    const pending = await loadPendingSyncs().catch(() => []);
    if (!pending.length) return;

    for (const item of pending) {
        const success = await syncToFirebase(item.id, item.data);
        if (success) {
            await removePendingSync(item.id);
            pendingSyncQueue.delete(item.id);
        } else {
            item.retries++;
            item.lastAttempt = Date.now();
            if (item.retries >= MAX_SYNC_RETRIES) {
                console.warn("Max retries reached for", item.id);
                await removePendingSync(item.id);
                pendingSyncQueue.delete(item.id);
            } else {
                await savePendingSync(item.id, item.data).catch(() => {});
            }
        }
    }
}

function cleanupPendingSync(id) {
    setTimeout(() => {
        pendingSyncQueue.delete(id);
    }, PENDING_SYNC_CLEANUP_MS);
}

window.addEventListener("online", () => {
    showToast("🌐 تم استعادة الاتصال - جاري المزامنة", "info", 3000);
    retryPendingSyncs();
});

// ========== CARDS GENERATION ==========
window.generateCards = function() {
    const grid = document.getElementById("cardsGrid");
    if (!grid) return;
    if (grid.dataset.eventsBound === "1") {
        regenerateCardsHTML(grid);
        return;
    }
    regenerateCardsHTML(grid);

    grid.addEventListener("change", function(e) {
        if (e.target.classList.contains("att-toggle")) {
            const day = e.target.dataset.day;
            const act = e.target.dataset.act;
            const ratingEl = document.getElementById("rating-" + day + "-" + act);
            const absentLabel = document.getElementById("absent-" + day + "-" + act);
            if (e.target.checked) {
                if (ratingEl) { ratingEl.classList.remove("disabled"); ratingEl.setAttribute("aria-disabled", "false"); }
                if (absentLabel) absentLabel.style.display = "none";
            } else {
                if (ratingEl) { ratingEl.classList.add("disabled"); ratingEl.setAttribute("aria-disabled", "true"); }
                if (absentLabel) absentLabel.style.display = "inline";
            }
            updateSummary();
            triggerAutoSave();
        }
    });

    grid.addEventListener("click", function(e) {
        if (e.target.classList.contains("star")) {
            const parent = e.target.parentElement;
            if (parent.classList.contains("disabled")) return;
            const val = parseInt(e.target.dataset.val);
            parent.querySelectorAll(".star").forEach((s, i) => {
                s.classList.toggle("active", i < val);
                s.setAttribute("aria-checked", i < val ? "true" : "false");
            });
            parent.dataset.value = val;
            updateSummary();
            triggerAutoSave();
        }
    });

    grid.addEventListener("keydown", function(e) {
        if (e.target.classList.contains("star")) {
            const parent = e.target.parentElement;
            if (parent.classList.contains("disabled")) return;
            const stars = parent.querySelectorAll(".star");
            const currentIdx = Array.from(stars).indexOf(e.target);
            let newIdx = currentIdx;
            if (e.key === "ArrowRight" || e.key === "ArrowUp") {
                e.preventDefault();
                newIdx = Math.min(currentIdx + 1, stars.length - 1);
            } else if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
                e.preventDefault();
                newIdx = Math.max(currentIdx - 1, 0);
            } else if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                e.target.click();
                return;
            }
            if (newIdx !== currentIdx) stars[newIdx].focus();
        }
    });

    grid.dataset.eventsBound = "1";
};

function regenerateCardsHTML(grid) {
    const today = getTodayName();
    if (!today) {
        grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:40px;color:var(--text-light);">🔴 اليوم مش يوم خدمة (الخدمة أيام: السبت، الإثنين، الأربعاء)</div>';
        return;
    }
    const dayIndex = DAYS.indexOf(today);
    const dayColors = ["sat", "mon", "wed"];
    const dayEmojis = ["🎵", "📚", "⛪"];

    let html = "";
    DAYS.forEach((day, idx) => {
        const isToday = day === today;
        html += '<div class="track-card" id="card-' + day + '">' +
            '<div class="status-strip neutral" id="strip-' + day + '"></div>' +
            '<div class="card-header ' + dayColors[idx] + '">' +
                '<span>' + dayEmojis[idx] + ' ' + day + '</span>' +
                '<span class="day-icon">' + (isToday ? "★" : "") + '</span>' +
            '</div>' +
            '<div class="card-body" id="body-' + day + '">';
        ACTIVITIES.forEach(act => {
            html += '<div class="activity-row" data-act="' + act.id + '" data-day="' + day + '">' +
                '<div class="activity-name">' +
                    '<div class="activity-icon ' + act.cls + '">' + act.icon + '</div>' +
                    '<span>' + act.name + '</span>' +
                '</div>' +
                '<div class="toggle-group">' +
                    '<span>غائبة</span>' +
                    '<label class="toggle-switch">' +
                        '<input type="checkbox" class="att-toggle" data-act="' + act.id + '" data-day="' + day + '" aria-label="حضور ' + act.name + ' يوم ' + day + '">' +
                        '<span class="toggle-slider"></span>' +
                    '</label>' +
                    '<span>حاضرة</span>' +
                '</div>' +
                '<div class="rating disabled" id="rating-' + day + '-' + act.id + '" role="radiogroup" aria-label="تقييم ' + act.name + '" aria-disabled="true">' +
                    [1,2,3,4,5].map(i => '<span class="star" data-val="' + i + '" tabindex="0" role="radio" aria-label="' + i + ' نجوم" aria-checked="false">★</span>').join("") +
                '</div>' +
                '<span class="absent-label" id="absent-' + day + '-' + act.id + '">غائبة</span>' +
            '</div>';
        });
        html += '<textarea class="note-input" id="note-' + day + '" placeholder="ملاحظات عن ' + day + '..."></textarea>' +
            '</div></div>';
    });
    grid.innerHTML = html;
    updateSummary();
    setupAutoSave();
}

// ========== SUMMARY ==========
function updateSummary() {
    let present = 0, absent = 0, rated = 0, totalRating = 0, ratingCount = 0;
    DAYS.forEach(day => {
        ACTIVITIES.forEach(act => {
            const toggle = document.querySelector('.att-toggle[data-day="' + day + '"][data-act="' + act.id + '"]');
            if (toggle && toggle.checked) {
                present++;
                const ratingEl = document.getElementById("rating-" + day + "-" + act.id);
                if (ratingEl && ratingEl.dataset.value) {
                    rated++;
                    totalRating += parseInt(ratingEl.dataset.value);
                    ratingCount++;
                }
            } else {
                absent++;
            }
        });
    });
    const presentEl = document.getElementById("presentCount");
    const absentEl = document.getElementById("absentCount");
    const ratedEl = document.getElementById("ratedActivities");
    const avgEl = document.getElementById("avgRating");
    const rateEl = document.getElementById("attendanceRate");
    if (presentEl) presentEl.textContent = present;
    if (absentEl) absentEl.textContent = absent;
    if (ratedEl) ratedEl.textContent = rated;
    if (avgEl) avgEl.textContent = ratingCount ? (totalRating / ratingCount).toFixed(1) : "0.0";
    const total = present + absent;
    if (rateEl) rateEl.textContent = total ? Math.round((present / total) * 100) + "%" : "0%";
}

// ========== LOAD STUDENT TO CARDS (v2 structure) ==========
function loadStudentToCards(studentId) {
    const data = getStudentLocal(studentId);
    const today = getTodayDateStr();

    document.querySelectorAll(".att-toggle").forEach(t => t.checked = false);
    document.querySelectorAll(".star").forEach(s => { s.classList.remove("active"); s.setAttribute("aria-checked", "false"); });
    document.querySelectorAll(".rating").forEach(r => { r.dataset.value = ""; r.classList.add("disabled"); r.setAttribute("aria-disabled", "true"); });
    document.querySelectorAll(".absent-label").forEach(l => l.style.display = "none");
    document.querySelectorAll(".note-input").forEach(n => n.value = "");

    DAYS.forEach(day => {
        ACTIVITIES.forEach(act => {
            const todayAtt = data.attendance && data.attendance[today] && data.attendance[today][day];
            const hasRecord = todayAtt && Object.prototype.hasOwnProperty.call(todayAtt, act.id);

            if (hasRecord) {
                const isPresent = todayAtt[act.id] === true;
                const toggle = document.querySelector('.att-toggle[data-day="' + day + '"][data-act="' + act.id + '"]');
                if (toggle) toggle.checked = isPresent;
                const ratingEl = document.getElementById("rating-" + day + "-" + act.id);
                if (ratingEl) {
                    ratingEl.classList.toggle("disabled", !isPresent);
                    ratingEl.setAttribute("aria-disabled", !isPresent ? "true" : "false");
                    if (isPresent) {
                        const todayRatings = data.ratings && data.ratings[today] && data.ratings[today][day];
                        const val = todayRatings ? todayRatings[act.id] : 0;
                        if (val) {
                            ratingEl.dataset.value = val;
                            ratingEl.querySelectorAll(".star").forEach((s, i) => {
                                s.classList.toggle("active", i < val);
                                s.setAttribute("aria-checked", i < val ? "true" : "false");
                            });
                        }
                    }
                }
                const absentLabel = document.getElementById("absent-" + day + "-" + act.id);
                if (absentLabel) absentLabel.style.display = isPresent ? "none" : "inline";
            } else {
                const ratingEl = document.getElementById("rating-" + day + "-" + act.id);
                if (ratingEl) { ratingEl.classList.add("disabled"); ratingEl.setAttribute("aria-disabled", "true"); }
                const absentLabel = document.getElementById("absent-" + day + "-" + act.id);
                if (absentLabel) absentLabel.style.display = "inline";
            }
        });
        const noteEl = document.getElementById("note-" + day);
        if (noteEl && data.notes) noteEl.value = data.notes[day] || "";
    });
    updateSummary();
}

// ========== SAVE FROM CARDS (v2 structure) ==========
function saveFromCards(studentId) {
    const data = getStudentLocal(studentId);
    const today = getTodayDateStr();

    if (!data.attendance) data.attendance = {};
    if (!data.attendance[today]) data.attendance[today] = {};
    if (!data.ratings) data.ratings = {};
    if (!data.ratings[today]) data.ratings[today] = {};

    DAYS.forEach(day => {
        if (!data.attendance[today][day]) data.attendance[today][day] = {};
        if (!data.ratings[today][day]) data.ratings[today][day] = {};

        ACTIVITIES.forEach(act => {
            const toggle = document.querySelector('.att-toggle[data-day="' + day + '"][data-act="' + act.id + '"]');
            if (toggle) {
                if (toggle.checked) {
                    data.attendance[today][day][act.id] = true;
                    const ratingEl = document.getElementById("rating-" + day + "-" + act.id);
                    if (ratingEl && ratingEl.dataset.value) {
                        data.ratings[today][day][act.id] = parseInt(ratingEl.dataset.value);
                    }
                } else {
                    data.attendance[today][day][act.id] = false;
                    delete data.ratings[today][day][act.id];
                }
            }
        });
        const noteEl = document.getElementById("note-" + day);
        if (!data.notes) data.notes = {};
        if (noteEl) {
            const noteVal = noteEl.value.trim();
            if (noteVal.length > MAX_NOTE_LENGTH) {
                showToast("⚠️ الملاحظة طويلة جدًا (تم اقتطاعها)", "warning", 3000);
                data.notes[day] = noteVal.substring(0, MAX_NOTE_LENGTH);
            } else {
                data.notes[day] = noteVal;
            }
        }
    });

    let present = 0, absent = 0, totalRating = 0, ratingCount = 0;
    Object.keys(data.attendance || {}).forEach(date => {
        Object.keys(data.attendance[date]).forEach(day => {
            Object.keys(data.attendance[date][day]).forEach(actId => {
                if (data.attendance[date][day][actId] === true) {
                    present++;
                    const r = data.ratings && data.ratings[date] && data.ratings[date][day] && data.ratings[date][day][actId];
                    if (r) {
                        totalRating += r;
                        ratingCount++;
                    }
                } else if (data.attendance[date][day][actId] === false) {
                    absent++;
                }
            });
        });
    });

    data.presentCount = present;
    data.absentCount = absent;
    data.totalRating = totalRating;
    data.ratingCount = ratingCount;
    data._version = DATA_VERSION;
    return data;
}

// ========== ALL STUDENTS GRID ==========
window.loadAllStudentsData = async function() {
    await initializeStorage();
    await checkCrashRecovery();
    const grid = document.getElementById("allStudentsGrid");
    const countEl = document.getElementById("allStudentsCount");
    if (!grid) return;

    const db = getDb();
    const firebaseReady = isFirebaseReady();
    const fns = getFirestoreFns();

    if (firebaseReady && db && window.currentServer && fns.collection) {
        try {
            const { collection, query, orderBy, getDocs } = fns;
            const q = query(collection(db, "students"), orderBy("name"));
            const snap = await getDocs(q);
            allStudents = [];
            idToIndex.clear();
            snap.forEach(d => {
                const s = { id: d.id, ...migrateStudentData(d.data()) };
                allStudents.push(s);
                idToIndex.set(s.id, allStudents.length - 1);
            });
        } catch (e) {
            console.warn("Firebase load failed, using local:", e);
            allStudents = Array.from(studentsMap.entries()).map(([id, data]) => ({ id, ...data }));
            allStudents.forEach((s, i) => idToIndex.set(s.id, i));
        }
    } else {
        allStudents = Array.from(studentsMap.entries()).map(([id, data]) => ({ id, ...data }));
        allStudents.forEach((s, i) => idToIndex.set(s.id, i));
    }

    if (typeof requestIdleCallback !== "undefined") {
        requestIdleCallback(() => renderAllStudents());
    } else {
        renderAllStudents();
    }
    updateStudentSelect();
    if (countEl) countEl.textContent = "(" + allStudents.length + " طالبة)";
};

function getStudentTodayStatus(s) {
    const today = getTodayDateStr();
    const data = getStudentLocal(s.id);

    const todayAtt = data.attendance && data.attendance[today];
    if (!todayAtt) return { status: "not-recorded", text: "لم يُسجّل" };

    let hasRecord = false;
    let isPresent = false;

    DAYS.forEach(day => {
        const dayAtt = todayAtt[day];
        if (dayAtt && typeof dayAtt === "object") {
            ACTIVITIES.forEach(act => {
                if (Object.prototype.hasOwnProperty.call(dayAtt, act.id)) {
                    hasRecord = true;
                    if (dayAtt[act.id] === true) isPresent = true;
                }
            });
        }
    });

    if (!hasRecord) return { status: "not-recorded", text: "لم يُسجّل" };
    return isPresent ? { status: "present", text: "حاضرة" } : { status: "absent", text: "غائبة" };
}

function getFilteredStudents() {
    let filtered = [...allStudents];

    if (currentFilter.year) {
        filtered = filtered.filter(s => s.year === currentFilter.year);
    }

    if (currentFilter.search) {
        const term = normalizeArabic(currentFilter.search);
        const ids = searchIndex.get(term);
        if (ids && ids.size > 0) {
            filtered = filtered.filter(s => ids.has(s.id));
        } else {
            filtered = filtered.filter(s => s.name && normalizeArabic(s.name).includes(term));
        }
    }

    filtered.sort((a, b) => {
        if (currentFilter.sort === "name") return (a.name || "").localeCompare(b.name || "", "ar");
        if (currentFilter.sort === "attendance") return (b.presentCount || 0) - (a.presentCount || 0);
        if (currentFilter.sort === "recent") return (b.updatedAt || 0) - (a.updatedAt || 0);
        return 0;
    });

    return filtered;
}

function renderAllStudents() {
    const grid = document.getElementById("allStudentsGrid");
    if (!grid) return;

    const filtered = getFilteredStudents();

    if (!filtered.length) {
        grid.innerHTML = '<div class="empty-state"><div class="empty-state-icon">👥</div><p>لا يوجد طالبات مسجلات</p><span>اضغطي على "جديدة" لإضافة طالبة</span></div>';
        return;
    }

    const start = currentPage * PAGE_SIZE;
    const end = Math.min(start + PAGE_SIZE, filtered.length);
    const pageStudents = filtered.slice(start, end);

    const fragment = document.createDocumentFragment();
    pageStudents.forEach(s => {
        const card = createStudentCard(s);
        fragment.appendChild(card);
    });

    grid.innerHTML = "";
    grid.appendChild(fragment);

    renderPagination(filtered.length);

    grid.onclick = function(e) {
        const card = e.target.closest(".student-mini-card");
        if (card && card.dataset.id) {
            selectStudentById(card.dataset.id);
        }
    };
}

function renderPagination(total) {
    const container = document.getElementById("paginationContainer");
    if (!container) return;
    const totalPages = Math.ceil(total / PAGE_SIZE);
    if (totalPages <= 1) {
        container.innerHTML = "";
        return;
    }
    let html = '<div class="pagination">';
    for (let i = 0; i < totalPages; i++) {
        html += '<button type="button" class="page-btn ' + (i === currentPage ? 'active' : '') + '" onclick="changePage(' + i + ')">' + (i + 1) + '</button>';
    }
    html += '</div>';
    container.innerHTML = html;
}

window.changePage = function(page) {
    currentPage = page;
    renderAllStudents();
    document.getElementById("allStudentsGrid")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
};

function createStudentCard(s) {
    const todayStatus = getStudentTodayStatus(s);
    const card = document.createElement("div");
    card.className = "student-mini-card";
    card.dataset.id = s.id;
    card.id = "student-card-" + s.id;
    card.setAttribute("role", "button");
    card.setAttribute("tabindex", "0");
    card.setAttribute("aria-label", "طالبة: " + (s.name || "بدون اسم"));
    card.innerHTML = 
        '<div class="mini-status-strip" style="background:' + (s.year === 'أولى إعدادي' ? '#6c5ce7' : s.year === 'تانية إعدادي' ? '#00b894' : '#e17055') + '"></div>' +
        '<div class="mini-name">' + escapeHtml(s.name || 'بدون اسم') + '</div>' +
        '<div class="mini-year">' + escapeHtml(s.year || '') + '</div>' +
        '<div class="mini-stats">' +
            '<span class="mini-stat present">حاضر: ' + (s.presentCount || 0) + '</span>' +
            '<span class="mini-stat absent">غائب: ' + (s.absentCount || 0) + '</span>' +
            '<span class="mini-stat ' + todayStatus.status + '">' + todayStatus.text + '</span>' +
        '</div>';
    return card;
}

function updateStudentCard(id) {
    const oldCard = document.getElementById("student-card-" + id);
    if (!oldCard) return;

    const idx = idToIndex.get(id);
    if (idx === undefined) return;
    const s = allStudents[idx];
    if (!s) return;

    const newCard = createStudentCard(s);
    oldCard.replaceWith(newCard);
}

function updateStudentSelectOption(id) {
    const sel = document.getElementById("studentSelect");
    if (!sel) return;
    const idx = idToIndex.get(id);
    if (idx === undefined) return;
    const s = allStudents[idx];
    if (!s) return;

    const option = sel.querySelector('option[value="' + id + '"]');
    if (option) {
        option.textContent = escapeHtml(s.name) + ' (' + escapeHtml(s.year || '') + ')';
    }
}

function updateStudentSelect() {
    const sel = document.getElementById("studentSelect");
    if (!sel) return;
    sel.innerHTML = '<option value="">-- اختيار طالبة من القائمة --</option>' +
        allStudents.map(s => '<option value="' + s.id + '">' + escapeHtml(s.name) + ' (' + escapeHtml(s.year || '') + ')</option>').join("");
}

window.selectStudentById = function(id) {
    const idx = idToIndex.get(id);
    if (idx === undefined) return;
    const s = allStudents[idx];
    if (!s) return;

    currentStudent = s;
    const nameEl = document.getElementById("studentName");
    const yearEl = document.getElementById("studentYear");
    const docIdEl = document.getElementById("studentDocId");
    const sel = document.getElementById("studentSelect");
    if (nameEl) nameEl.value = s.name || "";
    if (yearEl) yearEl.value = s.year || "";
    if (docIdEl) docIdEl.value = s.id || "";
    if (sel) sel.value = s.id || "";
    loadStudentToCards(s.id);
    showToast("تم تحميل بيانات: " + escapeHtml(s.name || ""), "info", 2000);
};

// ========== NEW / LOAD STUDENT ==========
function handleNewStudent() {
    const nameEl = document.getElementById("studentName");
    const yearEl = document.getElementById("studentYear");
    const docIdEl = document.getElementById("studentDocId");
    const sel = document.getElementById("studentSelect");
    if (nameEl) nameEl.value = "";
    if (yearEl) yearEl.value = "";
    if (docIdEl) docIdEl.value = "";
    if (sel) sel.value = "";
    currentStudent = null;
    generateCards();
    showToast("سجل بيانات طالبة جديدة", "info", 2000);
}

function handleLoadStudent() {
    const sel = document.getElementById("studentSelect");
    if (sel && sel.value) {
        selectStudentById(sel.value);
    } else {
        const name = document.getElementById("studentName")?.value.trim();
        if (!name) { showToast("اكتبي اسم الطالبة أو اختاري من القائمة", "warning", 3000); return; }
        const searchTerm = normalizeArabic(name);
        const found = allStudents.find(s => s.name && normalizeArabic(s.name).includes(searchTerm));
        if (found) {
            selectStudentById(found.id);
        } else {
            showToast("لا يوجد طالبة بهذا الاسم", "error", 3000);
        }
    }
}

// ========== SAVE ==========
async function handleSave() {
    const nameEl = document.getElementById("studentName");
    const yearEl = document.getElementById("studentYear");
    const docIdEl = document.getElementById("studentDocId");
    const name = nameEl ? nameEl.value.trim() : "";
    const year = yearEl ? yearEl.value : "";

    if (!name) { showToast("❌ يرجى إدخال اسم الطالبة", "error", 3000); return; }
    if (name.length > 100) { showToast("❌ الاسم طويل جدًا (حد أقصى 100 حرف)", "error", 3000); return; }
    if (!year) { showToast("❌ يرجى اختيار السنة الدراسية", "error", 3000); return; }

    let id = docIdEl ? docIdEl.value : "";
    if (!id) {
        id = generateId();
        if (docIdEl) docIdEl.value = id;
    }

    const setStatus = document.getElementById("saveStatus");
    if (setStatus) {
        setStatus.className = "save-status saving";
        setStatus.innerHTML = '<div class="spinner"></div> جاري الحفظ...';
    }

    const data = saveFromCards(id);
    data.name = name;
    data.year = year;
    data.serverId = window.currentServer ? window.currentServer.uid : "unknown";
    data.serverName = window.currentServer ? window.currentServer.name : "unknown";
    data.updatedAt = getLocalISOString();

    queueSave(id, data);

    const success = await syncToFirebase(id, data);
    if (!success) {
        await savePendingSync(id, data);
        pendingSyncQueue.set(id, { data, retries: 0, lastAttempt: Date.now() });
        cleanupPendingSync(id);
        showToast("⚠️ حفظ محلي فقط - سيتم المزامنة لاحقًا", "warning", 4000);
    }

    if (setStatus) {
        setStatus.className = "save-status saved";
        setStatus.innerHTML = "✅ تم الحفظ";
        setTimeout(() => {
            if (isFirebaseReady()) {
                setStatus.className = "save-status online";
                setStatus.innerHTML = "🟢 متصل";
            }
        }, 2000);
    }
    hasUnsavedChanges = false;
    showToast("✅ تم حفظ بيانات " + escapeHtml(name) + " بنجاح", "success", 3000);
}

// ========== EXPORT / PRINT / RESET / IMPORT ==========
function handleExportJson() {
    const data = JSON.stringify(localData, null, 2);
    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "kenesa_data_" + getTodayDateStr() + ".json";
    a.click();
    URL.revokeObjectURL(url);
    showToast("✅ تم تصدير JSON", "success", 3000);
}

function handleExportCsv() {
    let csv = "id,name,year,present,absent,avg_rating\n";
    Object.keys(localData).forEach(id => {
        const s = localData[id];
        const avg = s.ratingCount ? (s.totalRating / s.ratingCount).toFixed(1) : "0";
        csv += escapeCsv(id) + "," + escapeCsv(s.name) + "," + escapeCsv(s.year) + "," + 
               escapeCsv(s.presentCount || 0) + "," + escapeCsv(s.absentCount || 0) + "," + escapeCsv(avg) + "\n";
    });
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "kenesa_data_" + getTodayDateStr() + ".csv";
    a.click();
    URL.revokeObjectURL(url);
    showToast("✅ تم تصدير CSV", "success", 3000);
}

function validateStudentData(data) {
    if (!data || typeof data !== "object") return false;
    if (typeof data.name !== "string") return false;
    if (typeof data.year !== "string") return false;
    if (data.attendance && typeof data.attendance !== "object") return false;
    if (data.ratings && typeof data.ratings !== "object") return false;
    if (data.notes && typeof data.notes !== "object") return false;
    return true;
}

function handleImportJson() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = async function(e) {
        const file = e.target.files[0];
        if (!file) return;
        if (file.size > 50 * 1024 * 1024) {
            showToast("❌ الملف كبير جدًا (حد أقصى 50MB)", "error", 3000);
            return;
        }
        try {
            const text = await file.text();
            const imported = JSON.parse(text);

            const keys = Object.keys(imported);
            if (keys.length > MAX_IMPORT_SIZE) {
                showToast("❌ عدد الطالبات كبير جدًا (حد أقصى " + MAX_IMPORT_SIZE + ")", "error", 3000);
                return;
            }

            let validCount = 0;
            let invalidCount = 0;
            keys.forEach(id => {
                if (validateStudentData(imported[id])) {
                    validCount++;
                } else {
                    invalidCount++;
                    delete imported[id];
                }
            });

            if (invalidCount > 0) console.warn("Skipped " + invalidCount + " invalid records");

            const mode = confirm("اضغط OK للدمج مع البيانات الحالية، Cancel للاستبدال الكامل");
            if (mode) {
                keys.forEach(id => {
                    if (imported[id]) setStudentLocal(id, migrateStudentData(imported[id]));
                });
            } else {
                localData = {};
                studentsMap.clear();
                idToIndex.clear();
                attendanceDateIndex.clear();
                searchIndex.clear();
                keys.forEach(id => {
                    if (imported[id]) setStudentLocal(id, migrateStudentData(imported[id]));
                });
            }
            await loadAllStudentsData();
            showToast("✅ تم استيراد " + validCount + " طالبة بنجاح", "success", 3000);
        } catch (err) {
            showToast("❌ خطأ في استيراد الملف", "error", 3000);
            console.error(err);
        }
    };
    input.click();
}

function handlePrint() {
    window.print();
}

function handleReset() {
    if (!confirm("⚠️ هتمسح كل البيانات المحلية و IndexedDB. متأكدة؟")) return;
    localStorage.removeItem("kenesa_students_data");
    localData = {};
    studentsMap.clear();
    idToIndex.clear();
    attendanceDateIndex.clear();
    searchIndex.clear();
    allStudents = [];
    currentPage = 0;
    hasUnsavedChanges = false;
    clearIndexedDB().catch(e => console.warn("IndexedDB clear failed:", e));
    renderAllStudents();
    updateStudentSelect();
    generateCards();
    showToast("✅ تم مسح البيانات", "success", 3000);
}

// ========== SEARCH (with indexed search + DocumentFragment) ==========
let searchTimeout = null;
function debouncedSearch() {
    if (searchTimeout) clearTimeout(searchTimeout);
    searchTimeout = setTimeout(handleQuickSearch, 200);
}

function handleQuickSearch() {
    const input = document.getElementById("quickSearch");
    const results = document.getElementById("searchResults");
    if (!input || !results) return;
    const term = normalizeArabic(input.value);
    if (!term) { results.classList.remove("active"); return; }

    let foundIds = new Set();
    const ids = searchIndex.get(term);
    if (ids && ids.size > 0) {
        ids.forEach(id => foundIds.add(id));
    } else {
        const words = term.split(/\s+/);
        words.forEach(word => {
            if (word.length < 2) return;
            searchIndex.forEach((idSet, key) => {
                if (key.includes(word)) {
                    idSet.forEach(id => foundIds.add(id));
                }
            });
        });
    }

    let found = Array.from(foundIds).map(id => studentsMap.get(id)).filter(Boolean).slice(0, 20);

    if (!found.length) {
        results.innerHTML = '<div class="search-result-empty">لا توجد نتائج</div>';
    } else {
        const fragment = document.createDocumentFragment();
        found.forEach(s => {
            const div = document.createElement("div");
            div.className = "search-result-item";
            div.dataset.id = s.id;
            div.innerHTML = '<div>' + escapeHtml(s.name) + '</div><div class="result-year">' + escapeHtml(s.year || '') + '</div>';
            fragment.appendChild(div);
        });
        results.innerHTML = "";
        results.appendChild(fragment);
    }
    results.classList.add("active");
}

// ========== STATS MODAL (with caching) ==========
function openStats() {
    const modal = document.getElementById("statsModal");
    if (modal) modal.classList.add("active");

    const renderStats = () => {
        // Use cached stats if available and fresh
        const now = Date.now();
        if (statsCache && (now - statsCacheTime) < STATS_CACHE_TTL) {
            applyStatsCache();
            return;
        }

        const total = allStudents.length;
        let topPresent = "-", leastPresent = "-", avgRating = 0, totalRating = 0, totalCount = 0, monthlyAbsents = 0, needFollow = 0;
        let maxP = -1, minP = 9999;

        allStudents.forEach(s => {
            const p = s.presentCount || 0;
            const a = s.absentCount || 0;
            if (p > maxP) { maxP = p; topPresent = s.name; }
            if (total > 0 && p < minP) { minP = p; leastPresent = s.name; }
            if (s.totalRating && s.ratingCount) {
                totalRating += s.totalRating;
                totalCount += s.ratingCount;
            }
            if (a > 5) needFollow++;
            monthlyAbsents += a;
        });
        avgRating = totalCount ? (totalRating / totalCount).toFixed(1) : "0.0";

        const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
        set("statTotalStudents", total);
        set("statTopPresent", escapeHtml(topPresent));
        set("statLeastPresent", escapeHtml(leastPresent));
        set("statAvgRating", avgRating);
        set("statMonthlyAbsents", monthlyAbsents);
        set("statNeedFollow", needFollow);

        const dist = document.getElementById("statusDistribution");
        let excellent = 0, good = 0, bad = 0;
        allStudents.forEach(s => {
            if (s.ratingCount && (s.totalRating / s.ratingCount) >= 4) excellent++;
            else if (s.ratingCount && (s.totalRating / s.ratingCount) >= 3) good++;
            else bad++;
        });

        if (dist) {
            dist.innerHTML = 
                '<div style="display:flex;align-items:center;gap:10px;"><div class="progress-bar-container"><div class="progress-bar-fill" style="width:' + (total ? (excellent/total*100) : 0) + '%;background:var(--status-excellent)"></div></div><span>ممتاز: ' + excellent + '</span></div>' +
                '<div style="display:flex;align-items:center;gap:10px;"><div class="progress-bar-container"><div class="progress-bar-fill" style="width:' + (total ? (good/total*100) : 0) + '%;background:var(--status-good)"></div></div><span>جيد: ' + good + '</span></div>' +
                '<div style="display:flex;align-items:center;gap:10px;"><div class="progress-bar-container"><div class="progress-bar-fill" style="width:' + (total ? (bad/total*100) : 0) + '%;background:var(--status-bad)"></div></div><span>يحتاج متابعة: ' + bad + '</span></div>';
        }

        // Cache the results
        statsCache = { total, topPresent, leastPresent, avgRating, monthlyAbsents, needFollow, excellent, good, bad };
        statsCacheTime = now;
    };

    if (typeof requestIdleCallback !== "undefined") {
        requestIdleCallback(renderStats);
    } else {
        renderStats();
    }
}

function applyStatsCache() {
    if (!statsCache) return;
    const c = statsCache;
    const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    set("statTotalStudents", c.total);
    set("statTopPresent", escapeHtml(c.topPresent));
    set("statLeastPresent", escapeHtml(c.leastPresent));
    set("statAvgRating", c.avgRating);
    set("statMonthlyAbsents", c.monthlyAbsents);
    set("statNeedFollow", c.needFollow);

    const dist = document.getElementById("statusDistribution");
    const total = allStudents.length;
    if (dist) {
        dist.innerHTML = 
            '<div style="display:flex;align-items:center;gap:10px;"><div class="progress-bar-container"><div class="progress-bar-fill" style="width:' + (total ? (c.excellent/total*100) : 0) + '%;background:var(--status-excellent)"></div></div><span>ممتاز: ' + c.excellent + '</span></div>' +
            '<div style="display:flex;align-items:center;gap:10px;"><div class="progress-bar-container"><div class="progress-bar-fill" style="width:' + (total ? (c.good/total*100) : 0) + '%;background:var(--status-good)"></div></div><span>جيد: ' + c.good + '</span></div>' +
            '<div style="display:flex;align-items:center;gap:10px;"><div class="progress-bar-container"><div class="progress-bar-fill" style="width:' + (total ? (c.bad/total*100) : 0) + '%;background:var(--status-bad)"></div></div><span>يحتاج متابعة: ' + c.bad + '</span></div>';
    }
}

// Invalidate stats cache on save
function invalidateStatsCache() {
    statsCache = null;
    statsCacheTime = 0;
}

// ========== LOG MODAL (lazy + cleanup) ==========
async function openLog() {
    const modal = document.getElementById("logModal");
    if (!modal) return;
    modal.classList.add("active");

    const oldController = modalControllers.get("log");
    if (oldController) oldController.abort();

    const controller = new AbortController();
    modalControllers.set("log", controller);

    const loading = document.getElementById("logLoadingOverlay");
    if (loading) loading.classList.add("active");

    const aggView = document.getElementById("logAggregatedView");
    const detTable = document.getElementById("logDetailedTable");
    const tbody = document.getElementById("logTableBody");

    const db = getDb();
    const firebaseReady = isFirebaseReady();
    const fns = getFirestoreFns();

    if (firebaseReady && db && fns.collection) {
        try {
            const { collection, query, orderBy, limit, getDocs } = fns;
            const q = query(collection(db, "logs"), orderBy("timestamp", "desc"), limit(100));
            const snap = await getDocs(q);
            if (controller.signal.aborted) return;
            const logs = [];
            snap.forEach(d => logs.push(d.data()));
            renderLogs(logs, aggView, detTable, tbody);
        } catch (e) {
            console.warn("Firebase logs failed:", e);
            if (!controller.signal.aborted) renderLogs([], aggView, detTable, tbody);
        }
    } else {
        renderLogs([], aggView, detTable, tbody);
    }
    if (loading) loading.classList.remove("active");
}

function renderLogs(logs, aggView, detTable, tbody) {
    const mode = document.getElementById("filterViewMode")?.value || "aggregated";
    const dayFilter = document.getElementById("filterDay")?.value || "";
    const typeFilter = document.getElementById("filterType")?.value || "";

    let filtered = logs;
    if (dayFilter) filtered = filtered.filter(l => l.day === dayFilter);
    if (typeFilter) filtered = filtered.filter(l => l.type === typeFilter);

    if (mode === "aggregated") {
        if (detTable) detTable.style.display = "none";
        if (aggView) {
            aggView.style.display = "block";
            if (!filtered.length) {
                aggView.innerHTML = "<p style='text-align:center;color:var(--text-light);padding:30px;'>لا يوجد سجل</p>";
                return;
            }
            const grouped = {};
            filtered.forEach(l => {
                const date = l.timestamp ? (l.timestamp.toDate ? l.timestamp.toDate().toISOString().split("T")[0] : l.timestamp.split("T")[0]) : "unknown";
                if (!grouped[date]) grouped[date] = [];
                grouped[date].push(l);
            });
            aggView.innerHTML = Object.keys(grouped).sort().reverse().map(date => 
                '<div class="agg-day-header">' + escapeHtml(date) + '</div>' +
                '<div class="agg-activities-grid">' +
                    grouped[date].map(l => 
                        '<div class="agg-activity-box">' +
                            '<div class="act-name">' + escapeHtml(l.studentName || '-') + ' (' + escapeHtml(l.type || '-') + ')</div>' +
                            '<div class="act-detail">الخادم: ' + escapeHtml(l.serverName || '-') + '</div>' +
                            '<div class="act-detail">الوقت: ' + escapeHtml(l.timestamp ? (l.timestamp.toDate ? l.timestamp.toDate().toLocaleTimeString('ar-EG', {hour:'2-digit', minute:'2-digit'}) : l.timestamp.split('T')[1].slice(0,5)) : '-') + '</div>' +
                        '</div>'
                    ).join("") +
                '</div>'
            ).join("");
        }
    } else {
        if (aggView) aggView.style.display = "none";
        if (detTable) detTable.style.display = "table";
        if (tbody) {
            tbody.innerHTML = filtered.map(l => 
                '<tr>' +
                    '<td>' + escapeHtml(l.timestamp ? (l.timestamp.toDate ? l.timestamp.toDate().toLocaleString('ar-EG') : l.timestamp.replace('T', ' ').slice(0,16)) : '-') + '</td>' +
                    '<td>' + escapeHtml(l.serverName || '-') + '</td>' +
                    '<td>' + escapeHtml(l.studentName || '-') + '</td>' +
                    '<td>' + escapeHtml(l.day || '-') + ' / ' + escapeHtml(l.type || '-') + '</td>' +
                    '<td>' + escapeHtml(l.change || '-') + '</td>' +
                    '<td>' + escapeHtml(l.reason || '-') + '</td>' +
                '</tr>'
            ).join("");
        }
    }
}

// ========== MONTHLY CALENDAR ==========
window.generateMonthSelector = function() {
    const sel = document.getElementById("monthSelector");
    if (!sel) return;
    const months = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];
    const now = new Date();
    sel.innerHTML = months.map((m, i) => 
        '<button type="button" class="month-btn ' + (i === now.getMonth() ? 'active' : '') + '" onclick="showMonth(' + i + ')">' + m + '</button>'
    ).join("");
    showMonth(now.getMonth());
};

window.showMonth = function(monthIndex) {
    const cal = document.getElementById("monthCalendar");
    if (!cal) return;
    const year = new Date().getFullYear();
    const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
    const firstDayOfWeek = new Date(year, monthIndex, 1).getDay();

    const weekdayNames = ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
    let html = weekdayNames.map(d => '<div class="cal-header">' + d + '</div>').join("");

    for (let i = 0; i < firstDayOfWeek; i++) {
        html += '<div class="cal-day empty"></div>';
    }

    for (let d = 1; d <= daysInMonth; d++) {
        const date = new Date(year, monthIndex, d);
        const dayNum = date.getDay();
        const isService = (dayNum === 6 || dayNum === 1 || dayNum === 3);
        const dateStr = year + "-" + String(monthIndex + 1).padStart(2, "0") + "-" + String(d).padStart(2, "0");
        const hasData = attendanceDateIndex.has(dateStr);
        const isToday = dateStr === getTodayDateStr();
        const serviceClass = isService ? 'service-day' : '';
        if (isService) {
            html += '<div class="cal-day ' + serviceClass + ' ' + (hasData ? 'has-data' : '') + ' ' + (isToday ? 'today' : '') + '" onclick="showDayDetails(\'' + dateStr + '\')">' + d + (hasData ? '<div class="cal-dot"></div>' : '') + '</div>';
        } else {
            html += '<div class="cal-day ' + serviceClass + ' ' + (isToday ? 'today' : '') + '">' + d + '</div>';
        }
    }
    cal.innerHTML = html;
};

window.showDayDetails = function(dateStr) {
    const details = document.getElementById("monthDetails");
    const title = document.getElementById("monthDetailTitle");
    const content = document.getElementById("monthDetailContent");
    if (title) title.textContent = "تفاصيل: " + dateStr;
    let html = "";
    Object.keys(localData).forEach(id => {
        const s = localData[id];
        if (!s.attendance || !s.attendance[dateStr]) return;
        const acts = [];
        Object.keys(s.attendance[dateStr]).forEach(day => {
            Object.keys(s.attendance[dateStr][day]).forEach(actId => {
                if (s.attendance[dateStr][day][actId] === true) {
                    const act = ACTIVITIES.find(a => a.id === actId);
                    if (act) acts.push(act.name);
                }
            });
        });
        if (acts.length) html += '<div style="padding:6px 0;border-bottom:1px solid #f0f0f0;"><strong>' + escapeHtml(s.name) + '</strong>: ' + escapeHtml(acts.join("، ")) + '</div>';
    });
    if (content) content.innerHTML = html || "<p style='color:var(--text-light)'>لا يوجد بيانات</p>";
    if (details) details.style.display = "block";
};

// ========== TODAY ATTENDANCE (lazy) ==========
async function openTodayAttendance() {
    const modal = document.getElementById("todayAttendanceModal");
    if (!modal) return;
    modal.classList.add("active");

    const oldController = modalControllers.get("today");
    if (oldController) oldController.abort();
    const controller = new AbortController();
    modalControllers.set("today", controller);

    const loading = document.getElementById("todayAttLoadingOverlay");
    if (loading) loading.classList.add("active");

    const today = getTodayDateStr();
    let present = 0, absent = 0, notRecorded = 0;
    const absentList = [];

    allStudents.forEach(s => {
        const todayStatus = getStudentTodayStatus(s);
        if (todayStatus.status === "present") { present++; }
        else if (todayStatus.status === "absent") { absent++; absentList.push(s); }
        else { notRecorded++; }
    });

    const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    set("todayPresentCount", present);
    set("todayAbsentCount", absent);
    set("todayNotRecorded", notRecorded);
    set("todayTotalStudents", allStudents.length);

    const topList = document.getElementById("topAttendeesList");
    if (topList) {
        const sorted = [...allStudents].sort((a, b) => (b.presentCount || 0) - (a.presentCount || 0)).slice(0, 5);
        topList.innerHTML = sorted.length ? sorted.map((s, i) => 
            '<div style="display:flex;justify-content:space-between;padding:8px;background:var(--bg);border-radius:8px;">' +
                '<span><strong>#' + (i+1) + '</strong> ' + escapeHtml(s.name) + '</span>' +
                '<span style="color:var(--accent1);font-weight:700;">' + (s.presentCount || 0) + ' حضور</span>' +
            '</div>'
        ).join("") : "<p style='color:var(--text-light);text-align:center;'>لا يوجد بيانات</p>";
    }

    const absList = document.getElementById("absentTodayList");
    if (absList) {
        absList.innerHTML = absentList.length ? absentList.map(s => 
            '<div class="attendance-row">' +
                '<div class="student-info">' +
                    '<div class="student-name">' + escapeHtml(s.name) + '</div>' +
                    '<div class="student-year">' + escapeHtml(s.year || '') + '</div>' +
                '</div>' +
                '<span class="status-badge absent">غائبة</span>' +
            '</div>'
        ).join("") : "<p style='color:var(--text-light);text-align:center;padding:20px;'>لا يوجد غائبات اليوم 🎉</p>";
    }

    if (loading) loading.classList.remove("active");
}

// ========== PROFILE MODAL (lazy + cached timeline) ==========
async function openProfile() {
    const modal = document.getElementById("profileModal");
    if (!modal) return;
    modal.classList.add("active");

    const oldController = modalControllers.get("profile");
    if (oldController) oldController.abort();
    const controller = new AbortController();
    modalControllers.set("profile", controller);

    const sel = document.getElementById("studentSelect");
    const id = sel ? sel.value : "";
    if (!id) {
        const timeline = document.getElementById("profileTimeline");
        if (timeline) timeline.innerHTML = '<div class="profile-empty">اختر طالبة أولاً</div>';
        return;
    }
    const loading = document.getElementById("profileLoadingOverlay");
    if (loading) loading.classList.add("active");

    const s = getStudentLocal(id);
    const nameEl = document.getElementById("profileStudentName");
    const yearEl = document.getElementById("profileStudentYear");
    const presEl = document.getElementById("profileTotalPresent");
    const absEl = document.getElementById("profileTotalAbsent");
    const avgEl = document.getElementById("profileAvgRating");
    const timeline = document.getElementById("profileTimeline");

    if (nameEl) nameEl.textContent = s.name || "-";
    if (yearEl) yearEl.textContent = s.year || "-";
    if (presEl) presEl.textContent = "حاضر: " + (s.presentCount || 0);
    if (absEl) absEl.textContent = "غائب: " + (s.absentCount || 0);
    const avg = s.ratingCount ? (s.totalRating / s.ratingCount).toFixed(1) : "0.0";
    if (avgEl) avgEl.textContent = "متوسط: " + avg;

    if (timeline) {
        let html = s.cachedTimeline || "";
        if (!html) {
            const dateGroups = {};
            Object.keys(s.attendance || {}).forEach(date => {
                Object.keys(s.attendance[date]).forEach(day => {
                    Object.keys(s.attendance[date][day]).forEach(actId => {
                        if (s.attendance[date][day][actId] === true) {
                            if (!dateGroups[date]) dateGroups[date] = { day, activities: [] };
                            const act = ACTIVITIES.find(a => a.id === actId);
                            if (act) {
                                const rating = s.ratings && s.ratings[date] && s.ratings[date][day] && s.ratings[date][day][actId] ? s.ratings[date][day][actId] : 0;
                                dateGroups[date].activities.push({ name: act.name, rating });
                            }
                        }
                    });
                });
            });

            html = "";
            Object.keys(dateGroups).sort().reverse().forEach(date => {
                const group = dateGroups[date];
                const acts = group.activities.map(a => 
                    '<div class="profile-activity-item">' +
                        '<span>' + escapeHtml(a.name) + '</span>' +
                        '<span>' + (a.rating ? '⭐'.repeat(a.rating) : '✅') + '</span>' +
                    '</div>'
                ).join("");
                html += 
                    '<div class="profile-day-card">' +
                        '<div class="profile-day-title">' +
                            '<span class="day-name">' + group.day + '</span>' +
                            '<span style="color:var(--text-light);font-size:0.8rem;">' + date + '</span>' +
                        '</div>' +
                        acts +
                    '</div>';
            });
            html = html || '<div class="profile-empty">لا يوجد سجل لهذه الطالبة</div>';
            s.cachedTimeline = html;
        }
        timeline.innerHTML = html;
    }

    if (loading) loading.classList.remove("active");
}

// ========== KEYBOARD SHORTCUTS ==========
window.setupKeyboardShortcuts = function() {
    document.addEventListener("keydown", (e) => {
        // Don't trigger shortcuts when typing in inputs
        if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA" || e.target.tagName === "SELECT") return;
        
        if (e.ctrlKey && e.key === "p") { e.preventDefault(); handlePrint(); }
        if (e.ctrlKey && e.key === "s") { e.preventDefault(); handleSave(); }
        if (e.ctrlKey && e.key === "f") { e.preventDefault(); document.getElementById("quickSearch")?.focus(); }
        if (e.ctrlKey && e.key === "h") { e.preventDefault(); openLog(); }
        if (e.ctrlKey && e.key === "i") { e.preventDefault(); openStats(); }
        if (e.ctrlKey && e.key === "m") { e.preventDefault(); openProfile(); }
        if (e.ctrlKey && e.key === "n") { e.preventDefault(); handleNewStudent(); }
        if (e.key === "Escape") {
            document.getElementById("searchResults")?.classList.remove("active");
            document.querySelectorAll(".modal-overlay").forEach(m => m.classList.remove("active"));
            modalControllers.forEach((ctrl, id) => { ctrl.abort(); });
            modalControllers.clear();
        }
    });

    const toggle = document.getElementById("shortcutToggle");
    const help = document.getElementById("shortcutsHelp");
    if (toggle && help) {
        toggle.addEventListener("click", () => help.classList.toggle("active"));
    }
};

// ========== DATE BADGE ==========
function updateDateBadge() {
    const badge = document.getElementById("todayDateBadge");
    if (badge) badge.innerHTML = "📅 " + getArabicDate();
}

// ========== DUPLICATE CHECK ==========
function checkDuplicateName() {
    const nameEl = document.getElementById("studentName");
    const dupEl = document.getElementById("dupNameError");
    const name = nameEl ? nameEl.value.trim() : "";
    if (!name || !dupEl) return;
    const normalizedName = normalizeArabic(name);
    const currentId = document.getElementById("studentDocId")?.value || "";
    
    // Search in both allStudents and localData
    let dup = allStudents.find(s => normalizeArabic(s.name) === normalizedName && s.id !== currentId);
    if (!dup) {
        const localIds = Object.keys(localData);
        const dupId = localIds.find(id => id !== currentId && normalizeArabic(localData[id].name) === normalizedName);
        if (dupId) dup = { name: localData[dupId].name, year: localData[dupId].year };
    }
    
    if (dup) {
        dupEl.innerHTML = "⚠️ يوجد طالبة بنفس الاسم: " + escapeHtml(dup.name) + " (" + escapeHtml(dup.year) + ")";
        dupEl.classList.add("active");
    } else {
        dupEl.classList.remove("active");
    }
}

// ========== MODAL CLEANUP ==========
function cleanupModal(modalId) {
    const controller = modalControllers.get(modalId);
    if (controller) {
        controller.abort();
        modalControllers.delete(modalId);
    }
}

// ========== BACKUP SCHEDULER ==========
function setupBackupScheduler() {
    const lastSnapshot = localStorage.getItem("kenesa_last_snapshot");
    const today = getTodayDateStr();
    if (lastSnapshot !== today) {
        saveSnapshot().then(() => {
            localStorage.setItem("kenesa_last_snapshot", today);
            console.log("📸 Daily snapshot saved");
        }).catch(e => console.warn("Snapshot failed:", e));
    }
}

// ========== UNSAVED CHANGES WARNING ==========
window.addEventListener("beforeunload", (e) => {
    if (hasUnsavedChanges) {
        e.preventDefault();
        e.returnValue = "لديك بيانات غير محفوظة. هل تريد المغادرة؟";
        return e.returnValue;
    }
});

// ========== DOM READY ==========
document.addEventListener("DOMContentLoaded", async () => {
    updateDateBadge();
    await initializeStorage();
    await checkCrashRecovery();
    setupBackupScheduler();

    const saveBtn = document.getElementById("saveBtn");
    const btnPrint = document.getElementById("btnPrint");
    const btnExportJson = document.getElementById("btnExportJson");
    const btnExportCsv = document.getElementById("btnExportCsv");
    const btnImportJson = document.getElementById("btnImportJson");
    const btnReset = document.getElementById("btnReset");
    const btnNewStudent = document.getElementById("btnNewStudent");
    const btnLoadStudent = document.getElementById("btnLoadStudent");
    const btnRefreshAll = document.getElementById("btnRefreshAll");
    const btnToday = document.getElementById("btnToday");
    const btnProfile = document.getElementById("btnProfile");
    const btnStats = document.getElementById("btnStats");
    const btnLog = document.getElementById("btnLog");
    const btnMonthly = document.getElementById("btnMonthly");

    if (saveBtn) saveBtn.addEventListener("click", handleSave);
    if (btnPrint) btnPrint.addEventListener("click", handlePrint);
    if (btnExportJson) btnExportJson.addEventListener("click", handleExportJson);
    if (btnExportCsv) btnExportCsv.addEventListener("click", handleExportCsv);
    if (btnImportJson) btnImportJson.addEventListener("click", handleImportJson);
    if (btnReset) btnReset.addEventListener("click", handleReset);
    if (btnNewStudent) btnNewStudent.addEventListener("click", handleNewStudent);
    if (btnLoadStudent) btnLoadStudent.addEventListener("click", handleLoadStudent);
    if (btnRefreshAll) btnRefreshAll.addEventListener("click", loadAllStudentsData);
    if (btnToday) btnToday.addEventListener("click", openTodayAttendance);
    if (btnProfile) btnProfile.addEventListener("click", openProfile);
    if (btnStats) btnStats.addEventListener("click", openStats);
    if (btnLog) btnLog.addEventListener("click", openLog);
    if (btnMonthly) btnMonthly.addEventListener("click", () => {
        const m = document.getElementById("monthlyModal");
        if (m) m.classList.add("active");
    });

    const quickSearch = document.getElementById("quickSearch");
    if (quickSearch) {
        quickSearch.addEventListener("input", debouncedSearch);
        quickSearch.addEventListener("focus", debouncedSearch);
    }

    const studentName = document.getElementById("studentName");
    if (studentName) studentName.addEventListener("input", checkDuplicateName);

    const studentSelect = document.getElementById("studentSelect");
    if (studentSelect) studentSelect.addEventListener("change", () => {
        if (studentSelect.value) selectStudentById(studentSelect.value);
    });

    // Filter & Sort UI
    const yearFilter = document.getElementById("yearFilter");
    const sortFilter = document.getElementById("sortFilter");
    if (yearFilter) {
        yearFilter.addEventListener("change", () => {
            currentFilter.year = yearFilter.value;
            currentPage = 0;
            renderAllStudents();
        });
    }
    if (sortFilter) {
        sortFilter.addEventListener("change", () => {
            currentFilter.sort = sortFilter.value;
            currentPage = 0;
            renderAllStudents();
        });
    }

    const closeLog = document.getElementById("closeLog");
    const closeStats = document.getElementById("closeStats");
    const closeMonthly = document.getElementById("closeMonthly");
    const closeToday = document.getElementById("closeToday");
    const closeProfile = document.getElementById("closeProfile");

    if (closeLog) closeLog.addEventListener("click", () => {
        document.getElementById("logModal")?.classList.remove("active");
        cleanupModal("log");
    });
    if (closeStats) closeStats.addEventListener("click", () => {
        document.getElementById("statsModal")?.classList.remove("active");
        cleanupModal("stats");
    });
    if (closeMonthly) closeMonthly.addEventListener("click", () => {
        document.getElementById("monthlyModal")?.classList.remove("active");
    });
    if (closeToday) closeToday.addEventListener("click", () => {
        document.getElementById("todayAttendanceModal")?.classList.remove("active");
        cleanupModal("today");
    });
    if (closeProfile) closeProfile.addEventListener("click", () => {
        document.getElementById("profileModal")?.classList.remove("active");
        cleanupModal("profile");
    });

    const filterDay = document.getElementById("filterDay");
    const filterType = document.getElementById("filterType");
    const filterViewMode = document.getElementById("filterViewMode");
    if (filterDay) filterDay.addEventListener("change", openLog);
    if (filterType) filterType.addEventListener("change", openLog);
    if (filterViewMode) filterViewMode.addEventListener("change", openLog);

    document.querySelectorAll(".modal-overlay").forEach(overlay => {
        overlay.addEventListener("click", (e) => {
            if (e.target === overlay) {
                overlay.classList.remove("active");
                modalControllers.forEach(ctrl => ctrl.abort());
                modalControllers.clear();
            }
        });
    });
});

// ========== EXPOSE FUNCTIONS TO WINDOW ==========
window.handleSave = handleSave;
window.handleNewStudent = handleNewStudent;
window.handleLoadStudent = handleLoadStudent;
window.handlePrint = handlePrint;
window.handleExportJson = handleExportJson;
window.handleExportCsv = handleExportCsv;
window.handleImportJson = handleImportJson;
window.handleReset = handleReset;
window.openLog = openLog;
window.openStats = openStats;
window.openProfile = openProfile;
window.openTodayAttendance = openTodayAttendance;
window.selectStudentById = selectStudentById;
window.generateMonthSelector = generateMonthSelector;
window.showMonth = showMonth;
window.showDayDetails = showDayDetails;
window.changePage = changePage;
window.setupKeyboardShortcuts = setupKeyboardShortcuts;
window.loadAllStudentsData = loadAllStudentsData;
window.generateCards = generateCards;
