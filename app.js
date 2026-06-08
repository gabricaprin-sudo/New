// ============================================================
// APP — Main Entry Point: State, DOM Cache, Bootstrap
// ============================================================

// ============================================================
// DOM CACHE
// ============================================================
const $ = (id) => document.getElementById(id);
const $$ = (sel, root = document) => root.querySelectorAll(sel);

const DOM = {
  splash: $('splash'), loginScreen: $('loginScreen'), mainApp: $('mainApp'),
  pageTitle: $('pageTitle'), pageSubtitle: $('pageSubtitle'),
  syncIndicator: $('syncIndicator'), userAvatar: $('userAvatar'),
  drawer: $('drawer'), drawerOverlay: $('drawerOverlay'),
  drawerAvatar: $('drawerAvatar'), drawerUserName: $('drawerUserName'),
  drawerUserEmail: $('drawerUserEmail'), offlineBadge: $('offlineBadge'),
  pageContent: $('pageContent'), toast: $('toast'),
  globalSearch: $('globalSearch'), searchResults: $('searchResults'),
  todayDay: $('todayDay'), todayDate: $('todayDate'), todayServiceBadge: $('todayServiceBadge'),
  statTotal: $('statTotal'), statPresentToday: $('statPresentToday'),
  statAbsentToday: $('statAbsentToday'), statAvgRating: $('statAvgRating'),
  bestGrade: $('bestGrade'), bestGradePercent: $('bestGradePercent'),
  topActivityName: $('topActivityName'), topActivityCount: $('topActivityCount'),
  mostRegularGirl: $('mostRegularGirl'), mostRegularPercent: $('mostRegularPercent'),
  topAttendees: $('topAttendees'), needsFollowup: $('needsFollowup'),
  attendanceDate: $('attendanceDate'), attendanceList: $('attendanceList'),
  attendanceSearch: $('attendanceSearch'),
  presentCount: $('presentCount'), absentCount: $('absentCount'), totalCount: $('totalCount'),
  selectAllPresent: $('selectAllPresent'), selectAllAbsent: $('selectAllAbsent'),
  attToggleHint: $('attToggleHint'), quickActions: $('quickActions'),
  girlsList: $('girlsList'), addGirlBtn: $('addGirlBtn'),
  calendarGrid: $('calendarGrid'), calMonthYear: $('calMonthYear'),
  dayDetail: $('dayDetail'), calPrev: $('calPrev'), calNext: $('calNext'),
  statsMonth: $('statsMonth'), bigStatsGrid: $('bigStatsGrid'),
  absenceChart: $('absenceChart'), attendanceRanking: $('attendanceRanking'),
  activityStatsGrid: $('activityStatsGrid'), timeFilterTabs: $('timeFilterTabs'), activityStatsPeriod: $('activityStatsPeriod'),
  historyList: $('historyList'), historyFilter: $('historyFilter'),
  clearHistoryBtn: $('clearHistoryBtn'), loadMoreHistory: $('loadMoreHistory'),
  loadMoreHistoryBtn: $('loadMoreHistoryBtn'), exportMonth: $('exportMonth'),
  exportExcel: $('exportCSV'), exportJSON: $('exportJSON'), exportPrint: $('exportPrint'),
  girlModal: $('girlModal'), girlModalTitle: $('girlModalTitle'),
  girlName: $('girlName'), girlPhone: $('girlPhone'), girlGrade: $('girlGrade'),
  girlNotes: $('girlNotes'), deleteGirlBtn: $('deleteGirlBtn'),
  homeGradeFilters: $('homeGradeFilters'), girlsGradeFilters: $('girlsGradeFilters'),
  attendanceGradeFilters: $('attendanceGradeFilters'),
  closeGirlModal: $('closeGirlModal'), cancelGirlModal: $('cancelGirlModal'),
  saveGirlBtn: $('saveGirlBtn'), girlProfileModal: $('girlProfileModal'),
  profileName: $('profileName'), profileBody: $('profileBody'),
  closeProfileModal: $('closeProfileModal'), attendanceModal: $('attendanceModal'),
  attendanceModalTitle: $('attendanceModalTitle'), modalGirlName: $('modalGirlName'),
  attendanceNotes: $('attendanceNotes'), ratingSection: $('ratingSection'),
  starsInput: $('starsInput'), saveAttendanceEntry: $('saveAttendanceEntry'),
  closeAttendanceModal: $('closeAttendanceModal'), cancelAttendanceModal: $('cancelAttendanceModal'),
  confirmOverlay: $('confirmOverlay'), confirmIcon: $('confirmIcon'),
  confirmTitle: $('confirmTitle'), confirmMsg: $('confirmMsg'),
  confirmCancel: $('confirmCancel'), confirmOk: $('confirmOk'),
  activityDetailModal: $('activityDetailModal'),
  activityDetailTitle: $('activityDetailTitle'),
  closeActivityDetailModal: $('closeActivityDetailModal'),
  activityDetailSummary: $('activityDetailSummary'),
  activityDetailIcon: $('activityDetailIcon'),
  activityDetailName: $('activityDetailName'),
  activityDetailPeriod: $('activityDetailPeriod'),
  activityDetailTabs: $('activityDetailTabs'),
  activityDetailList: $('activityDetailList'),
  presentTabCount: $('presentTabCount'),
  absentTabCount: $('absentTabCount'),
  menuBtn: $('menuBtn'), signOutBtn: $('signOutBtn'), googleSignIn: $('googleSignIn'),
  darkModeToggle: $('darkModeToggle'), darkToggleSwitch: $('darkToggleSwitch'),
  shareProfileBtn: $('shareProfileBtn'), editProfileBtn: $('editProfileBtn'),
  statsGradeFilter: $('statsGradeFilter'),
  activityStatsGrade: $('activityStatsGrade'),
  exportPreview: $('exportPreview')
};

// ============================================================
// APP STATE
// ============================================================
const state = {
  currentUser: null,
  girls: [],
  attendanceData: {},
  currentPage: 'home',
  selectedDay: 'السبت',
  selectedActivity: 'دراسي',
  currentAttendanceGirlId: null,
  currentAttendanceRating: 0,
  editingGirlId: null,
  calendarDate: new Date(),
  appInitialized: false,
  renderTimeout: null,
  historyLastDoc: null,
  historyHasMore: true,
  historyCurrentFilter: '',
  historyLoadedPages: 0,
  historyOffset: 0,        // FIX: Added missing property
  deleteInProgress: false,
  filters: {
    homeGrade: '',
    girlsGrade: '',
    girlsSearch: '',
    attendanceGrade: localStorage.getItem('attendanceGradeFilter') || '',
    statsTime: 'month',
    statsGrade: '',
  },
  // Legacy aliases for backward compatibility
  get homeGradeFilter() { return this.filters.homeGrade; },
  set homeGradeFilter(v) { this.filters.homeGrade = v; },
  get girlsGradeFilter() { return this.filters.girlsGrade; },
  set girlsGradeFilter(v) { this.filters.girlsGrade = v; },
  get girlsSearchQuery() { return this.filters.girlsSearch; },
  set girlsSearchQuery(v) { this.filters.girlsSearch = v; },
  get attendanceGradeFilter() { return this.filters.attendanceGrade; },
  set attendanceGradeFilter(v) { this.filters.attendanceGrade = v; },
  get statsTimeFilter() { return this.filters.statsTime; },
  set statsTimeFilter(v) { this.filters.statsTime = v; },
  get statsGradeFilter() { return this.filters.statsGrade; },
  set statsGradeFilter(v) { this.filters.statsGrade = v; },

  activityDetailTab: 'present',
  currentActivityDetail: null,
  currentProfileGirlId: null,
  searchDebounceTimer: null,
  attSearchDebounceTimer: null,
  attendancePageInitialized: false,
  savingGirl: false,
  idb: false,
  _girlMap: null,
  _girlMapDirty: true,
};

// ============================================================
// TIME CONTEXT SUBSCRIPTION
// ============================================================
const _timeUnsub = TimeContext.subscribe(() => {
  if (state.currentPage === 'home') renderHome();
  if (state.currentPage === 'girls') renderGirlsList();
  if (state.currentPage === 'stats') renderStats();
  if (state.currentPage === 'export') renderExport();
});
window._timeUnsub = _timeUnsub;

// ============================================================
// BOOTSTRAP
// ============================================================
async function bootstrap() {
  console.log('BOOT START');
  initDarkMode();
  TimeContext.init();
  console.log('BOOT: TimeContext OK');

  try {
    await withTimeout(IDB.init(), 3000, null);
    state.idb = true;
    console.log('BOOT: IDB OK');
  } catch (e) {
    console.warn('IndexedDB init failed:', e);
    state.idb = false;
  }

  const modulesReady = await withTimeout(initModules(), 8000, false);
  console.log('BOOT: modulesReady =', modulesReady);

  if (modulesReady) {
    try {
      await withTimeout(initAuth(), 10000, null);
      console.log('BOOT: Auth OK');
    } catch (e) {
      console.error('Auth init error:', e);
      hideSplash();
      showLogin();
    }
  } else {
    console.error('Firebase failed to load — entering offline mode');
    hideSplash();
    showLogin();
  }
}

bootstrap();
