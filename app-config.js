// ============================================
// app-config.js - DOM refs & shared helpers v8
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
        "autoSaveIndicator","studentSelect","studentName","studentYear","studentDocId","cardsGrid",
        "allStudentsGrid","allStudentsCount","presentCount","absentCount",
        "ratedActivities","avgRating","attendanceRate","logCount",
        "saveBtn","btnPrint","btnExportJson","btnExportCsv","btnImportJson","btnReset",
        "btnToday","btnProfile","btnStats","btnLog","btnMonthly","btnLogout",
        "btnNewStudent","btnLoadStudent","btnRefreshAll","quickSearch","searchResults",
        "todayDateBadge","dupNameError","duplicateBanner","conflictBanner",
        "addedTodayBanner","absentAlertBanner","absentAlertText",
        "paginationContainer","yearFilter","sortFilter",
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
    
    // Announce to screen readers
    const announcer = document.getElementById("sr-announcer");
    if (announcer) {
        announcer.textContent = msg;
        setTimeout(() => announcer.textContent = "", 1000);
    }
    
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
