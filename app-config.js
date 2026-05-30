// ============================================
// app-config.js - DOM refs & shared state
// ============================================

window.$ = id => document.getElementById(id);

window.isRegisterMode = false;
window.currentServer = null;

window.els = {};

function initEls() {
    const ids = [
        "loginOverlay","loginForm","registerForm","loginBtn","registerBtn",
        "authToggleBtn","authToggleText","authSubtitle","loginError","loginSuccess",
        "mainApp","serverDisplay","offlineBanner","toastContainer","saveStatus",
        "studentSelect","studentName","studentYear","studentDocId","cardsGrid",
        "allStudentsGrid","allStudentsCount","presentCount","absentCount",
        "ratedActivities","avgRating","attendanceRate","logCount",
        "saveBtn","btnPrint","btnExportJson","btnExportCsv","btnReset",
        "btnToday","btnProfile","btnStats","btnLog","btnMonthly","btnLogout",
        "btnNewStudent","btnLoadStudent","btnRefreshAll","quickSearch","searchResults",
        "todayDateBadge","dupNameError","duplicateBanner","conflictBanner",
        "addedTodayBanner","absentAlertBanner","absentAlertText",
        "logModal","closeLog","logTableBody","logAggregatedView","logDetailedTable",
        "filterDay","filterType","filterViewMode","logLoadingOverlay",
        "statsModal","closeStats","statsGrid","statsLoadingOverlay",
        "monthlyModal","closeMonthly","monthSelector","monthCalendar",
        "monthDetails","monthDetailTitle","monthDetailContent",
        "todayAttendanceModal","closeToday","todayAttLoadingOverlay",
        "todayPresentCount","todayAbsentCount","todayNotRecorded","todayTotalStudents",
        "topAttendeesList","absentTodayList",
        "profileModal","closeProfile","profileLoadingOverlay",
        "profileStudentName","profileStudentYear","profileTotalPresent",
        "profileTotalAbsent","profileAvgRating","profileTimeline",
        "shortcutToggle","shortcutsHelp"
    ];
    ids.forEach(id => { els[id] = $(id); });
}

window.showToast = function(msg, type = "info", duration = 3000) {
    const container = els.toastContainer;
    if (!container) return;
    const toast = document.createElement("div");
    toast.className = `toast ${type}`;
    const icon = type === "success" ? "&#9989;" : type === "error" ? "&#10060;" : type === "warning" ? "&#9888;&#65039;" : "&#128161;";
    toast.innerHTML = `<span>${icon}</span><span>${msg}</span>`;
    container.appendChild(toast);
    setTimeout(() => {
        toast.classList.add("hiding");
        setTimeout(() => toast.remove(), 300);
    }, duration);
};

window.setSaveStatus = function(status) {
    const el = els.saveStatus;
    if (!el) return;
    el.className = `save-status ${status}`;
    if (status === "online") el.innerHTML = "&#128308; متصل";
    else if (status === "offline") el.innerHTML = "&#128268; جاري الاتصال...";
    else if (status === "saving") el.innerHTML = '<div class="spinner"></div> جاري الحفظ...';
    else if (status === "saved") el.innerHTML = "&#9989; تم الحفظ";
};

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initEls);
} else {
    initEls();
}
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
