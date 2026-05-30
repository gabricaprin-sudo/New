// ============================================
// app-config.js  -  الإعدادات والثوابت والـ Helpers
// ============================================

const CONFIG = {
    saveDebounceMs: 600,
    searchDebounceMs: 350,
    maxRecords: 500,
    maxLogEntries: 200,
    monthsToShow: 6
};

const DAYS = ["السبت","الإثنين","الأربعاء"];
const ACTS = ["دراسي","محفوظات","قبطي","الحان"];
const ACT_ICONS = { "دراسي": "&#128216;", "محفوظات": "&#128221;", "قبطي": "&#9961;&#65039;", "الحان": "&#127925;" };
const ACT_CLASSES = { "دراسي": "icon-study", "محفوظات": "icon-mem", "قبطي": "icon-copt", "الحان": "icon-music" };
const DAY_HEADERS = { "السبت": "sat", "الإثنين": "mon", "الأربعاء": "wed" };
const DAY_ICONS = { "السبت": "&#128214;", "الإثنين": "&#127775;", "الأربعاء": "&#127919;" };

// safe element getter
function $(id) { return document.getElementById(id); }

// تهيئة عناصر DOM بأمان (null-safe)
const els = {
    name: $("studentName"),
    year: $("studentYear"),
    studentDocId: $("studentDocId"),
    studentSelect: $("studentSelect"),
    saveStatus: $("saveStatus"),
    serverDisplay: $("serverDisplay"),
    loginOverlay: $("loginOverlay"),
    mainApp: $("mainApp"),
    loginError: $("loginError"),
    loginSuccess: $("loginSuccess"),
    loginBtn: $("loginBtn"),
    logModal: $("logModal"),
    logTableBody: $("logTableBody"),
    logAggregatedView: $("logAggregatedView"),
    logDetailedTable: $("logDetailedTable"),
    presentCount: $("presentCount"),
    absentCount: $("absentCount"),
    ratedActivities: $("ratedActivities"),
    avgRating: $("avgRating"),
    attendanceRate: $("attendanceRate"),
    logCount: $("logCount"),
    conflictBanner: $("conflictBanner"),
    conflictText: $("conflictText"),           // ← كان ناقص ده!
    dupNameError: $("dupNameError"),
    addedTodayBanner: $("addedTodayBanner"),
    todayDateBadge: $("todayDateBadge"),
    absentAlertBanner: $("absentAlertBanner"),
    absentAlertText: $("absentAlertText"),
    offlineBanner: $("offlineBanner"),
    cardsGrid: $("cardsGrid"),
    statsModal: $("statsModal"),
    monthlyModal: $("monthlyModal"),
    monthCalendar: $("monthCalendar"),
    monthDetails: $("monthDetails"),
    monthDetailTitle: $("monthDetailTitle"),
    monthDetailContent: $("monthDetailContent"),
    monthSelector: $("monthSelector"),
    searchResults: $("searchResults"),
    logLoadingOverlay: $("logLoadingOverlay"),
    statsLoadingOverlay: $("statsLoadingOverlay"),
    shortcutsHelp: $("shortcutsHelp"),
    saveBtn: $("saveBtn"),
    toastContainer: $("toastContainer"),
    loginForm: $("loginForm"),
    registerForm: $("registerForm"),
    authToggleText: $("authToggleText"),
    authToggleBtn: $("authToggleBtn"),
    authSubtitle: $("authSubtitle"),
    todayAttendanceModal: $("todayAttendanceModal"),
    todayAttLoadingOverlay: $("todayAttLoadingOverlay"),
    duplicateBanner: $("duplicateBanner"),
    duplicateText: $("duplicateText"),
    profileModal: $("profileModal"),
    profileLoadingOverlay: $("profileLoadingOverlay"),
    profileStudentName: $("profileStudentName"),
    profileStudentYear: $("profileStudentYear"),
    profileTotalPresent: $("profileTotalPresent"),
    profileTotalAbsent: $("profileTotalAbsent"),
    profileAvgRating: $("profileAvgRating"),
    profileTimeline: $("profileTimeline"),
    allStudentsGrid: $("allStudentsGrid"),
    allStudentsCount: $("allStudentsCount")
};

// Helpers
function escapeHtml(text) {
    if (!text) return "";
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
}

function showToast(message, type = "info", duration = 3000) {
    if (!els.toastContainer) return;
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
    if (!el) return;
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
    if (!els.todayDateBadge) return;
    const today = new Date();
    const dateStr = today.toLocaleDateString("ar-EG", { year: "numeric", month: "long", day: "numeric", weekday: "long" });
    els.todayDateBadge.innerHTML = "&#128197; " + dateStr;
}

function getTodayDate() {
    return new Date().toISOString().slice(0, 10);
}

function getStudentDocId() {
    const hiddenId = els.studentDocId ? els.studentDocId.value.trim() : "";
    if (hiddenId) return hiddenId;
    const name = els.name ? els.name.value.trim() : "";
    const year = els.year ? els.year.value.trim() : "";
    if (!name || !year) return null;
    const safeName = name.replace(/\s+/g, "_").replace(/[^\u0621-\u064Aa-zA-Z0-9_]/g, "");
    const safeYear = year.replace(/\s+/g, "_").replace(/[^\u0621-\u064Aa-zA-Z0-9_]/g, "");
    return safeName + "_" + safeYear;
}

function getLocalStorageKey() {
    const docId = getStudentDocId();
    return docId ? "khadem_data_" + docId : null;
}

// State
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
