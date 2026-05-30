// app-config.js - minimal DOM refs
window.$ = id => document.getElementById(id);
window.els = {};
window.isRegisterMode = false;
window.currentServer = null;
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
if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initEls);
} else { initEls(); }
