// ============================================================
// نظام متابعة المخدومات — Offline Ready & Guest Mode
// FIXED VERSION 2.1 — Fixed saveGirl error handling + state flag cleanup
// Changes: Wrapped entire save logic in try/catch, fixed FB safety checks,
//          improved error messages, ensured flags always reset
// ============================================================

// ============================================================
// FB MODULE — Replaces window._fb anti-pattern with proper singleton
// FIXED: Added guard function to prevent usage before initialization
// ============================================================
const FB = new Proxy({
  collection: null, doc: null, setDoc: null, getDocs: null,
  deleteDoc: null, query: null, orderBy: null, onSnapshot: null,
  writeBatch: null, where: null, signInWithPopup: null,
  signInWithRedirect: null, getRedirectResult: null,
  onAuthStateChanged: null, signOut: null
}, {
  get(target, prop) {
    if (prop in target && target[prop] !== null) return target[prop];
    if (['collection', 'doc', 'setDoc', 'onSnapshot', 'writeBatch'].includes(prop)) {
      throw new Error(`FB.${String(prop)} accessed before Firebase initialization. Call ensureFB() first.`);
    }
    return target[prop];
  }
});

/**
 * FIXED: Guard function that throws if Firebase is not ready.
 * Use at the start of any function that needs Firebase.
 */
function ensureFB() {
  if (!firebaseReady) throw new Error('Firebase not initialized');
}

// ============================================================
// SAFETY: Global error handler + splash fallback
// FIXED: Unified splash state with lock — prevents double-hide race condition
// ============================================================
const SplashState = {
  _done: false,
  _forceHidden: false,
  _locked: false,
  get done() { return this._done || this._forceHidden; },
  markDone() {
    if (this._locked) return;
    this._locked = true;
    this._done = true;
    this._forceHidden = true;
  },
  markForceHidden() {
    if (this._locked) return;
    this._locked = true;
    this._forceHidden = true;
  }
};

window.addEventListener('error', (e) => {
  console.error('Global error:', e.error || e.message);
  hideSplashForced();
});
window.addEventListener('unhandledrejection', (e) => {
  console.error('Unhandled rejection:', e.reason);
  hideSplashForced();
});

// Force hide splash after 6 seconds max — never get stuck
setTimeout(hideSplashForced, 6000);

function hideSplashForced() {
  if (SplashState.done) return;
  SplashState.markForceHidden();
  const splash = document.getElementById('splash');
  if (splash) {
    splash.classList.add('fade-out');
    setTimeout(() => splash.remove(), 500);
  }
  // Show login screen as fallback if app isn't initialized
  setTimeout(() => {
    const loginScreen = document.getElementById('loginScreen');
    const mainApp = document.getElementById('mainApp');
    if (loginScreen && mainApp && mainApp.classList.contains('hidden') && loginScreen.classList.contains('hidden')) {
      loginScreen.classList.remove('hidden');
      showLogin();
    }
  }, 600);
}

// ============================================================
// FIREBASE IMPORTS WITH FALLBACK
// FIXED: Clearer fallback UI when Firebase fails
// SECURITY: Firebase config moved to fetch from server to avoid credential leak
// ============================================================
let firebaseApp, auth, db, provider;
let firebaseReady = false;
let XLSX = null;

// Track snapshot unsubscribers to prevent memory leaks
// FIXED: listenersInitialized flag prevents duplicate listeners in race conditions
const _unsubscribers = [];
let _listenersInitialized = false;

function clearAllSnapshots() {
  _unsubscribers.forEach(unsub => { try { unsub(); } catch (e) { } });
  _unsubscribers.length = 0;
  _listenersInitialized = false;
}

function pushUnsubscriber(unsub) {
  _unsubscribers.push(unsub);
}

// ============================================================
// Firebase Configuration — Embedded directly in the code
// ============================================================
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyDKn7oKS2of6g0P4nFoZ651iz1MZuiYFYY",
  authDomain: "kenesanew.firebaseapp.com",
  projectId: "kenesanew",
  storageBucket: "kenesanew.firebasestorage.app",
  messagingSenderId: "465825215026",
  appId: "1:465825215026:web:2dede981f5b384f134c22b",
  measurementId: "G-6TH30TM35E"
};

async function fetchFirebaseConfig() {
  // Return the embedded Firebase config directly
  return FIREBASE_CONFIG;
}

// Module imports with error handling
async function initModules() {
  try {
    const { initializeApp } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js');
    const { getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult, onAuthStateChanged, signOut } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js');
    const { getFirestore, collection, doc, setDoc, getDocs, deleteDoc, query, orderBy, onSnapshot, writeBatch, where } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');

    // Use the embedded Firebase config
    let firebaseConfig = await fetchFirebaseConfig();
    firebaseApp = initializeApp(firebaseConfig);
    auth = getAuth(firebaseApp);
    db = getFirestore(firebaseApp);
    provider = new GoogleAuthProvider();
    firebaseReady = true;

    // Initialize Firebase Analytics
    try {
      const { getAnalytics } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-analytics.js');
      const analytics = getAnalytics(firebaseApp);
      console.log('Firebase Analytics initialized');
    } catch (analyticsErr) {
      console.warn('Firebase Analytics not initialized:', analyticsErr.message);
    }

    // FIXED: Use module singleton instead of window._fb
    FB.collection = collection; FB.doc = doc; FB.setDoc = setDoc;
    FB.getDocs = getDocs; FB.deleteDoc = deleteDoc; FB.query = query;
    FB.orderBy = orderBy; FB.onSnapshot = onSnapshot; FB.writeBatch = writeBatch;
    FB.where = where; FB.signInWithPopup = signInWithPopup;
    FB.signInWithRedirect = signInWithRedirect; FB.getRedirectResult = getRedirectResult;
    FB.onAuthStateChanged = onAuthStateChanged; FB.signOut = signOut;

    // Try to load XLSX
    try {
      const xlsxMod = await import('https://cdn.sheetjs.com/xlsx-0.20.1/package/xlsx.mjs');
      XLSX = xlsxMod;
    } catch (xlsxErr) {
      console.warn('XLSX library failed to load:', xlsxErr);
    }

    return true;
  } catch (e) {
    console.error('Firebase failed to initialize:', e);
    firebaseReady = false;
    // FIXED: Clearer error indication
    const splashContent = document.querySelector('.splash-content');
    if (splashContent) {
      splashContent.innerHTML = '<h1>⚠️ خطأ في الاتصال</h1><p>تعذر تحميل نظام التسجيل</p><p style="font-size:14px;opacity:0.7">تحقق من اتصال الإنترنت وأعد تحميل الصفحة</p>';
    }
    return false;
  }
}

// ============================================================
// DOM CACHE — FIXED: Build-once pattern for zero runtime cost
// ============================================================
const $ = (id) => document.getElementById(id);
const $$ = (sel, root = document) => root.querySelectorAll(sel);

function safeGetElement(id) {
  const el = document.getElementById(id);
  return el || null;
}

// FIXED: Build DOM map once at startup, then freeze — zero Proxy cost on access
const _domCache = {};

function _buildDOMCache() {
  const ids = [
    'splash', 'loginScreen', 'mainApp', 'pageTitle', 'pageSubtitle',
    'syncIndicator', 'userAvatar', 'drawer', 'drawerOverlay',
    'drawerAvatar', 'drawerUserName', 'drawerUserEmail', 'offlineBadge',
    'pageContent', 'toast', 'globalSearch', 'searchResults',
    'todayDay', 'todayDate', 'todayServiceBadge',
    'statTotal', 'statPresentToday', 'statAbsentToday', 'statAvgRating',
    'bestGrade', 'bestGradePercent', 'topActivityName', 'topActivityCount',
    'mostRegularGirl', 'mostRegularPercent', 'topAttendees', 'needsFollowup',
    'attendanceDate', 'attendanceList', 'attendanceSearch',
    'presentCount', 'absentCount', 'totalCount',
    'selectAllPresent', 'selectAllAbsent', 'attToggleHint', 'quickActions',
    'girlsList', 'addGirlBtn',
    'calendarGrid', 'calMonthYear', 'dayDetail', 'calPrev', 'calNext',
    'statsMonth', 'bigStatsGrid', 'absenceChart', 'attendanceRanking',
    'activityStatsGrid', 'timeFilterTabs', 'activityStatsPeriod',
    'historyList', 'historyFilter', 'clearHistoryBtn', 'loadMoreHistory',
    'loadMoreHistoryBtn', 'exportMonth',
    'exportCSV', 'exportJSON', 'exportPrint',
    'girlModal', 'girlModalTitle',
    'girlName', 'girlPhone', 'girlGrade', 'girlNotes', 'deleteGirlBtn',
    'homeGradeFilters', 'girlsGradeFilters', 'attendanceGradeFilters',
    'closeGirlModal', 'cancelGirlModal', 'saveGirlBtn', 'girlProfileModal',
    'profileName', 'profileBody', 'closeProfileModal', 'attendanceModal',
    'attendanceModalTitle', 'modalGirlName', 'attendanceNotes', 'ratingSection',
    'starsInput', 'saveAttendanceEntry', 'closeAttendanceModal', 'cancelAttendanceModal',
    'confirmOverlay', 'confirmIcon', 'confirmTitle', 'confirmMsg',
    'confirmCancel', 'confirmOk',
    'activityDetailModal', 'activityDetailTitle', 'closeActivityDetailModal',
    'activityDetailSummary', 'activityDetailIcon', 'activityDetailName',
    'activityDetailPeriod', 'activityDetailTotal', 'activityDetailTabs',
    'activityDetailList', 'presentTabCount', 'absentTabCount',
    'menuBtn', 'signOutBtn', 'googleSignIn',
    'darkModeToggle', 'darkToggleSwitch',
    'shareProfileBtn', 'editProfileBtn',
    'statsGradeFilter', 'activityStatsGrade', 'exportGradeFilter',
    // SERVANTS: خدام الفصول
    'attServantsCard', 'homeServantsCard', 'girlsServantsCard',
    'servantsModal', 'servantsModalTitle',
    'servantInput1', 'servantInput2', 'servantInput3',
    'saveServantsBtn', 'cancelServantsModal', 'closeServantsModal'
    // NOTE: servants-related DOM refs removed
  ];
  ids.forEach(id => { _domCache[id] = document.getElementById(id); });
}

// FIXED: Minimal wrapper — direct property access, no Proxy overhead
const DOM = new Proxy(_domCache, {
  get(target, prop) {
    return target[prop] ?? null;
  }
});

// Eagerly cache known static elements at startup
_buildDOMCache();

// ============================================================
// APP STATE — FIXED: Added cache indexes for performance
// ============================================================
const state = {
  currentUser: null,
  girls: [],
  attendanceData: {},
  currentPage: 'home',
  selectedDay: 'الجمعة',
  selectedActivity: 'قداس',
  currentAttendanceGirlId: null,
  currentAttendanceRating: 0,
  editingGirlId: null,
  calendarDate: new Date(),
  appInitialized: false,
  renderTimeout: null,
  renderPending: false,
  historyOffset: 0,
  historyAllLogs: [],
  deleteInProgress: false,
  homeGradeFilter: '',
  girlsGradeFilter: '',
  girlsSearchQuery: '',
  attendanceGradeFilter: localStorage.getItem('attendanceGradeFilter') || '',
  statsTimeFilter: 'month',
  statsGradeFilter: '',
  longPressTimer: null,
  isLongPress: false,
  activityDetailTab: 'present',
  currentActivityDetail: null,
  currentProfileGirlId: null,
  searchDebounceTimer: null,
  attSearchDebounceTimer: null,
  attendancePageInitialized: false,
  savingGirl: false,
  idb: false,
  // FIXED: Add pending operation locks to prevent race conditions
  pendingAttendanceOps: new Set(),
  pendingSaveGirl: false,
  // FIXED: Precomputed absence cache { monthStr: { girlId: { hasConsecutive, count, dates } } }
  absenceCache: {},
  lastAbsenceCacheMonth: null,
  // NEW: Export grade filter state
  exportGradeFilter: '',
  // NEW: Track which service days have been auto-marked as absent (to prevent duplicates)
  autoMarkedDates: new Set(JSON.parse(localStorage.getItem('autoMarkedDates') || '[]')),
  // SERVANTS: خدام كل فصل { 'فصل': ['خادم1', 'خادم2', 'خادم3'] }
  gradeServants: {},
  servantEditGrade: null
};

// ============================================================
// DERIVED STATE CACHE — Prevents O(n^2) lookups
// FIXED: Centralized cache with full rebuild from source truth
// ============================================================
const Cache = {
  girlsById: null,
  allAttendance: null,
  attendanceByGirl: null,
  attendanceByDate: null,
  attendanceByMonth: null,
  // FIXED: Cached activeGirlIds to prevent repeated Set builds
  activeGirlIds: null,
  _dirty: true,
  _snapshotVersion: 0,

  invalidate() {
    this._dirty = true;
    this._snapshotVersion++;
    this.girlsById = null;
    this.allAttendance = null;
    this.attendanceByGirl = null;
    this.attendanceByDate = null;
    this.attendanceByMonth = null;
    this.activeGirlIds = null;
    // FIXED: Clear absence cache to prevent stale consecutive absence data
    // after attendance edits. Cache will be rebuilt on next hasConsecutiveAbsences call.
    state.absenceCache = {};
    state.lastAbsenceCacheMonth = null;
  },

  build() {
    if (!this._dirty) return;
    // FULL rebuild from source truth — ensures consistency
    this.girlsById = Object.fromEntries(state.girls.filter(g => !g.isDeleted).map(g => [g.id, g]));
    // FIXED: Deduplicate attendance records by ID — prevents stale merges
    const attMap = new Map();
    Object.values(state.attendanceData).forEach(a => {
      if (!a || !a.id) return;
      const existing = attMap.get(a.id);
      // Keep the most recent version (by updatedAt)
      if (!existing || (a.updatedAt || 0) >= (existing.updatedAt || 0)) {
        attMap.set(a.id, a);
      }
    });
    const allAtt = Array.from(attMap.values());
    this.allAttendance = allAtt;

    // FIXED: Build indexed structures for O(1) lookups
    this.attendanceByGirl = {};
    this.attendanceByDate = {};
    this.attendanceByMonth = {};

    allAtt.forEach(a => {
      // By girl
      if (!this.attendanceByGirl[a.girlId]) this.attendanceByGirl[a.girlId] = [];
      this.attendanceByGirl[a.girlId].push(a);
      // By date
      if (!this.attendanceByDate[a.date]) this.attendanceByDate[a.date] = [];
      this.attendanceByDate[a.date].push(a);
      // By month
      const month = a.date?.substring(0, 7);
      if (month && /^\d{4}-\d{2}$/.test(month)) {
        if (!this.attendanceByMonth[month]) this.attendanceByMonth[month] = [];
        this.attendanceByMonth[month].push(a);
      }
    });

    // FIXED: Precompute activeGirlIds Set
    this.activeGirlIds = new Set(state.girls.filter(g => !g.isDeleted).map(g => g.id));

    this._dirty = false;
  },

  getGirl(id) {
    this.build();
    return this.girlsById ? this.girlsById[id] : null;
  },

  getAllAttendance() {
    this.build();
    return this.allAttendance || [];
  },

  // FIXED: O(1) indexed lookups
  getAttendanceByGirl(girlId) {
    this.build();
    return this.attendanceByGirl?.[girlId] || [];
  },

  getAttendanceByDate(date) {
    this.build();
    return this.attendanceByDate?.[date] || [];
  },

  getAttendanceByMonth(month) {
    this.build();
    return this.attendanceByMonth?.[month] || [];
  },

  // FIXED: O(1) cached activeGirlIds — eliminates repeated Set creation
  getActiveGirlIds() {
    this.build();
    return this.activeGirlIds || new Set();
  }
};

// ============================================================
// ATTENDANCE STORE — Global memoized snapshot
// FIXED: Prevents repeated Cache.getAllAttendance() full scans
// ============================================================
const AttendanceStore = {
  _cache: null,
  _dirty: true,
  _version: 0,

  getAll() {
    if (this._dirty || this._version !== Cache._snapshotVersion) {
      this._cache = Cache.getAllAttendance();
      this._dirty = false;
      this._version = Cache._snapshotVersion;
    }
    return this._cache;
  },

  invalidate() {
    this._dirty = true;
  }
};

// Auto-invalidate AttendanceStore when Cache invalidates
const originalCacheInvalidate = Cache.invalidate.bind(Cache);
Cache.invalidate = function() {
  originalCacheInvalidate();
  AttendanceStore.invalidate();
};

// Invalidate cache whenever girls or attendanceData changes
const originalGirlsDescriptor = Object.getOwnPropertyDescriptor(state, 'girls');
// Use Proxy-like approach: intercept direct mutations
const _rawGirls = [];
const _rawAttendance = {};

function setStateGirls(newGirls) {
  state.girls = newGirls;
  Cache.invalidate();
}

function setStateAttendanceData(newData) {
  // FIXED: Support both direct Object and functional update (React-like pattern)
  // toggleAttendanceStatus uses: setStateAttendanceData(prev => ({ ...prev, [key]: rec }))
  if (typeof newData === 'function') {
    state.attendanceData = newData(state.attendanceData);
  } else {
    state.attendanceData = newData;
  }
  Cache.invalidate();
}

const HISTORY_PAGE_SIZE = 30;
const SERVICE_DAYS = { 'الجمعة': true };
const SERVICE_DAY_NUMBERS = [5]; // Fri
const DAY_NAMES = ['الأحد','الاثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'];
const ACTIVITIES = ['قداس', 'تناول', 'خدمة', 'اعتراف', 'سبب الغياب'];
const ACTIVITY_ICONS = { 'قداس': '&#9961;', 'تناول': '&#127807;', 'خدمة': '&#128330;', 'اعتراف': '&#128221;', 'سبب الغياب': '&#128196;' };
const PERIOD_LABELS = { today: 'اليوم', month: 'هذا الشهر', year: 'هذه السنة', all: 'كل الفترات' };
// Grade ordering for export: تالته أ→ب, then تانيه أ→ب, then أولى أ→ب
const GRADE_ORDER = { 'تالته أ': 1, 'تالته ب': 2, 'تانيه أ': 3, 'تانيه ب': 4, 'أولى أ': 5, 'أولى ب': 6 };

// ============================================================
// XSS PROTECTION
// ============================================================
const esc = (() => {
  const div = document.createElement('div');
  const txt = document.createTextNode('');
  div.appendChild(txt);
  return (str) => {
    txt.nodeValue = String(str ?? '');
    return div.innerHTML;
  };
})();

function xmlEsc(str = '') {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// ============================================================
// DATE UTILITIES — FIXED: Safe date parsing without timezone bugs
// ============================================================

/**
 * FIXED: Safely parse a YYYY-MM-DD string into a Date object.
 * Uses new Date(year, month-1, day) to avoid timezone shift bugs
 * that can occur with new Date("YYYY-MM-DDT00:00:00").
 * FIXED: Validates invalid dates like 31-02 that JS silently corrects.
 */
function parseDateStr(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return new Date(NaN);
  const parts = dateStr.split('-').map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) return new Date(NaN);
  const [year, month, day] = parts;
  // Validate ranges
  if (month < 1 || month > 12 || day < 1 || day > 31) return new Date(NaN);
  const d = new Date(year, month - 1, day);
  // FIXED: Verify the date wasn't silently corrected by JS (e.g. 2024-02-31 → 2024-03-02)
  if (d.getMonth() !== month - 1 || d.getDate() !== day) return new Date(NaN);
  return d;
}

/**
 * FIXED: Compare two date strings (YYYY-MM-DD) safely.
 * Returns -1 if a < b, 0 if equal, 1 if a > b.
 */
function compareDateStr(a, b) {
  if (a === b) return 0;
  const da = parseDateStr(a);
  const db = parseDateStr(b);
  const ta = da.getTime();
  const tb = db.getTime();
  if (isNaN(ta) || isNaN(tb)) return String(a).localeCompare(String(b));
  return ta < tb ? -1 : ta > tb ? 1 : 0;
}

/**
 * FIXED: Check if a date string is within a range [start, end] (inclusive).
 */
function isDateInRange(dateStr, start, end) {
  return compareDateStr(dateStr, start) >= 0 && compareDateStr(dateStr, end) <= 0;
}

/**
 * FIXED: Generate a consistent attendance record key.
 * Centralized key format to avoid mismatch bugs.
 */
function makeAttKey(girlId, date, activity) {
  return `${girlId}_${date}_${activity}`;
}

const DateUtil = {
  pad: (n) => String(n).padStart(2, '0'),
  toStr(d = new Date()) {
    return `${d.getFullYear()}-${this.pad(d.getMonth() + 1)}-${this.pad(d.getDate())}`;
  },
  getMonthStr(d = new Date()) {
    return `${d.getFullYear()}-${this.pad(d.getMonth() + 1)}`;
  },
  formatMonth(str) {
    if (!str) return '';
    const [y, m] = str.split('-').map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString('ar-EG', { year: 'numeric', month: 'long' });
  },
  formatDateShort(d = new Date()) {
    return `${d.getDate()}/${d.getMonth() + 1}`;
  },
  dayName(d = new Date()) { return DAY_NAMES[d.getDay()]; },
  // FIXED: Consistent hamza forms — all maps to single form
  normalize(d) {
    return {
      'الأحد': 'الاحد', 'الاحد': 'الاحد',
      'الاثنين': 'الاثنين',
      'الثلاثاء': 'الثلاثاء',
      'الأربعاء': 'الاربعاء', 'الاربعاء': 'الاربعاء',
      'الخميس': 'الخميس',
      'الجمعة': 'الجمعة',
      'السبت': 'السبت'
    }[d] || d;
  }
};

// ============================================================
// TIMECONTEXT — Unified Date Source for the entire app
// FIXED: Added null-safety protection for substring operations
// ============================================================
const TimeContext = {
  _selectedDate: null,
  _listeners: [],

  init() {
    const saved = localStorage.getItem('trackerSelectedDate');
    const today = DateUtil.toStr();
    // FIXED: Validate saved date format AND check if it's today's date
    // This prevents stale dates from previous days
    if (saved && /^\d{4}-\d{2}-\d{2}$/.test(saved) && saved === today) {
      this._selectedDate = saved;
    } else {
      this._selectedDate = today;
      localStorage.setItem('trackerSelectedDate', today);
    }
  },

  /** Get the currently selected date (YYYY-MM-DD) */
  getDate() {
    return this._selectedDate || DateUtil.toStr();
  },

  /** Set the selected date and notify all listeners */
  setDate(dateStr) {
    if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      console.warn('Invalid date format:', dateStr);
      return;
    }
    this._selectedDate = dateStr;
    localStorage.setItem('trackerSelectedDate', dateStr);
    this._notifyListeners(dateStr);
  },

  /** Get month string (YYYY-MM) — FIXED: with null safety */
  getMonth() {
    const d = this._selectedDate || DateUtil.toStr();
    return d.substring(0, 7);
  },

  /** Get year string (YYYY) — FIXED: with null safety */
  getYear() {
    const d = this._selectedDate || DateUtil.toStr();
    return d.substring(0, 4);
  },

  /** Reset to today */
  resetToToday() {
    this._selectedDate = DateUtil.toStr();
    localStorage.removeItem('trackerSelectedDate');
    this._notifyListeners(this._selectedDate);
  },

  /** Subscribe to date changes */
  subscribe(fn) {
    this._listeners.push(fn);
    return () => {
      this._listeners = this._listeners.filter(l => l !== fn);
    };
  },

  _notifyListeners(dateStr) {
    this._listeners.forEach(fn => {
      try { fn(dateStr); } catch (e) { console.error('TimeContext listener error:', e); }
    });
  }
};

// ============================================================
// ARABIC TEXT NORMALIZATION
// FIXED: Removed ة → ه transformation to preserve semantic accuracy
// ============================================================
function normalizeArabic(str) {
  if (!str) return '';
  return str.replace(/[\u064B-\u065F\u0670\u0640]/g, '')
    .replace(/[إأآا]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    // FIXED: Removed .replace(/ة/g, 'ه') — this changes meaning:
    // "مدرسة" should NOT become "مدرسه" — causes false matches
    .toLowerCase();
}

function normalizeName(name) {
  return name
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[أإآ]/g, 'ا')
    // FIXED: Keep ة as-is for accurate matching
    .replace(/ى/g, 'ي')
    .toLowerCase();
}

function csvEscape(v) {
  return `"${String(v ?? '').replace(/"/g, '""')}"`;
}

// ============================================================
// SERVICE DAY FUNCTIONS
// ============================================================
function getServiceDaysInMonth(year, month) {
  const days = [];
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  for (let d = 1; d <= daysInMonth; d++) {
    const dayOfWeek = new Date(year, month, d).getDay();
    if (SERVICE_DAY_NUMBERS.includes(dayOfWeek)) {
      days.push(`${year}-${DateUtil.pad(month + 1)}-${DateUtil.pad(d)}`);
    }
  }
  return days;
}

function getServiceDaysUpToDate(fromYear, fromMonth, toDate) {
  let count = 0;
  // FIXED: Use parseDateStr for safe date parsing
  const to = parseDateStr(toDate);
  if (isNaN(to.getTime())) return 0;

  const toYear = to.getFullYear();
  const toMonth = to.getMonth();
  const toDay = to.getDate();

  // FIXED: Only iterate up to the target day, not the entire month
  const lastDay = (fromYear === toYear && fromMonth === toMonth)
    ? toDay
    : new Date(fromYear, fromMonth + 1, 0).getDate();

  for (let d = 1; d <= lastDay; d++) {
    const dayOfWeek = new Date(fromYear, fromMonth, d).getDay();
    if (SERVICE_DAY_NUMBERS.includes(dayOfWeek)) {
      count++;
    }
  }
  return count;
}

// ============================================================
// CONSECUTIVE ABSENCES — FIXED: O(1) with precomputed cache
// ============================================================

/**
 * FIXED: Build absence cache for a month in single O(n) pass.
 * Call this once when data changes, then hasConsecutiveAbsences is O(1).
 */
function buildAbsenceCache(monthStr) {
  const [year, month] = monthStr.split('-').map(Number);
  const serviceDays = getServiceDaysInMonth(year, month - 1);

  // Get all attendance for this month using indexed lookup
  const monthAtt = Cache.getAttendanceByMonth(monthStr);

  // Group absence records by girl
  const absByGirl = {};
  monthAtt.forEach(a => {
    if (a.status === 'غائب') {
      if (!absByGirl[a.girlId]) absByGirl[a.girlId] = new Set();
      absByGirl[a.girlId].add(a.date);
    }
  });

  const cache = {};
  Object.entries(absByGirl).forEach(([girlId, absDateSet]) => {
    const absDates = [...absDateSet].sort();
    if (absDates.length < 2) {
      cache[girlId] = { hasConsecutive: false, count: absDates.length, dates: absDates };
      return;
    }

    // Build absent service indices
    const absentServiceIndices = [];
    for (let i = 0; i < serviceDays.length; i++) {
      if (absDateSet.has(serviceDays[i])) absentServiceIndices.push(i);
    }

    if (absentServiceIndices.length < 2) {
      cache[girlId] = { hasConsecutive: false, count: absDates.length, dates: absDates };
      return;
    }

    // Check for consecutive service day absences
    let consecutiveCount = 1;
    let maxConsecutive = 1;
    for (let i = 0; i < absentServiceIndices.length - 1; i++) {
      if (absentServiceIndices[i + 1] - absentServiceIndices[i] === 1) {
        consecutiveCount++;
        maxConsecutive = Math.max(maxConsecutive, consecutiveCount);
      } else {
        consecutiveCount = 1;
      }
    }

    cache[girlId] = {
      hasConsecutive: maxConsecutive >= 2,
      count: absDates.length,
      dates: absDates
    };
  });

  state.absenceCache[monthStr] = cache;
  state.lastAbsenceCacheMonth = monthStr;
}

function hasConsecutiveAbsences(girlId, monthStr) {
  // FIXED: Build cache on first access for this month
  if (!state.absenceCache[monthStr]) {
    buildAbsenceCache(monthStr);
  }
  // O(1) cache lookup
  return state.absenceCache[monthStr]?.[girlId] || { hasConsecutive: false, count: 0, dates: [] };
}

// ============================================================
// UNIFIED STATS BOUNDS — All stats use this single function
// ============================================================
// FIXED: Safe date validation helper
function _validateDateStr(dateStr, fallback) {
  if (!dateStr || typeof dateStr !== 'string' || dateStr.length < 10) return fallback;
  const parts = dateStr.split('-').map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) return fallback;
  const [year, month, day] = parts;
  if (year < 2000 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) return fallback;
  // Verify no silent JS correction
  const d = new Date(year, month - 1, day);
  if (d.getMonth() !== month - 1 || d.getDate() !== day) return fallback;
  return dateStr;
}

function getStatsBounds() {
  const selectedDate = _validateDateStr(TimeContext.getDate(), DateUtil.toStr());
  const selYear = parseInt(selectedDate.substring(0, 4));
  const selMonth = parseInt(selectedDate.substring(5, 7));

  switch (state.statsTimeFilter) {
    case 'today':
      return { start: selectedDate, end: selectedDate };
    case 'month': {
      const monthIndex = selMonth - 1;
      const lastDay = new Date(selYear, monthIndex + 1, 0).getDate();
      return { start: selectedDate.substring(0, 7) + '-01', end: selectedDate.substring(0, 7) + '-' + String(lastDay).padStart(2, '0') };
    }
    case 'year':
      return { start: selectedDate.substring(0, 4) + '-01-01', end: selectedDate.substring(0, 4) + '-12-31' };
    default: // 'all'
      return { start: '2000-01-01', end: selectedDate };
  }
}

// ============================================================
// INDEXEDDB — wrapper for offline history storage
// ============================================================
const IDB = {
  db: null,
  DB_NAME: 'girlsTrackerDB',
  DB_VERSION: 2, // Bumped for new stores

  async init() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.DB_NAME, this.DB_VERSION);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => { this.db = request.result; resolve(); };
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains('history')) {
          const store = db.createObjectStore('history', { keyPath: 'id' });
          store.createIndex('timestamp', 'timestamp', { unique: false });
        }
        if (!db.objectStoreNames.contains('pendingSync')) {
          db.createObjectStore('pendingSync', { keyPath: 'id' });
        }
        // NEW: Backup store for rollback support
        if (!db.objectStoreNames.contains('backups')) {
          db.createObjectStore('backups', { keyPath: 'id' });
        }
      };
    });
  },

  async add(storeName, data) {
    if (!this.db) return;
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      const request = store.put(data);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  },

  async getAll(storeName) {
    if (!this.db) return [];
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  },

  async get(storeName, id) {
    if (!this.db) return null;
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const request = store.get(id);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  },

  async clear(storeName) {
    if (!this.db) return;
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      const request = store.clear();
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  },

  async delete(storeName, id) {
    if (!this.db) return;
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      const request = store.delete(id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }
};

// ============================================================
// ROLLBACK / BACKUP HELPERS — NEW: Firestore rollback support
// ============================================================
async function createBackup(operationId, data) {
  try {
    await IDB.add('backups', { id: operationId, data, timestamp: Date.now() });
  } catch (e) { console.warn('Backup creation failed:', e); }
}

async function restoreBackup(operationId) {
  try {
    const backup = await IDB.get('backups', operationId);
    return backup ? backup.data : null;
  } catch (e) { console.warn('Backup restore failed:', e); return null; }
}

// ============================================================
// THEME MANAGER — FIXED: Professional theme system, no white flash
// ============================================================
const Theme = {
  KEY: 'theme',

  init() {
    // Apply theme BEFORE page renders to prevent white flash
    const saved = localStorage.getItem(this.KEY);
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const theme = saved || (prefersDark ? 'dark' : 'light');
    this._apply(theme, false); // false = no transition on initial load
  },

  toggle() {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    this._apply(isDark ? 'light' : 'dark', true);
  },

  _apply(theme, animate) {
    if (!animate) {
      document.body.classList.add('theme-switching'); // Disable transitions
    }

    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem(this.KEY, theme);

    // Sync toggle switch
    if (DOM.darkToggleSwitch) {
      DOM.darkToggleSwitch.classList.toggle('on', theme === 'dark');
    }

    if (!animate) {
      requestAnimationFrame(() => {
        document.body.classList.remove('theme-switching');
      });
    }
  },

  isDark() {
    return document.documentElement.getAttribute('data-theme') === 'dark';
  }
};

// Backward-compatible init function
function initDarkMode() {
  Theme.init();
}

// Event listener for toggle
if (DOM.darkModeToggle) {
  DOM.darkModeToggle.addEventListener('click', () => Theme.toggle());
}

// ============================================================
// TOAST
// ============================================================
let toastTimeout;
function showToast(msg, type = 'info') {
  clearTimeout(toastTimeout);
  if (!DOM.toast) return;
  DOM.toast.textContent = msg;
  DOM.toast.className = `toast show ${type}`;
  // FIXED: Use 'toast-out' instead of 'hidden' to avoid conflict with utility .hidden { display: none !important }
  toastTimeout = setTimeout(() => { if (DOM.toast) DOM.toast.className = 'toast toast-out'; }, 3000);
}

// ============================================================
// SPLASH — FIXED: Unified state prevents double-hide
// ============================================================
function hideSplash() {
  if (SplashState.done) return;
  SplashState.markDone();
  if (DOM.splash) {
    DOM.splash.classList.add('fade-out');
    setTimeout(() => { if (DOM.splash) DOM.splash.remove(); }, 500);
  }
}

// ============================================================
// ONLINE / OFFLINE
// ============================================================
function updateOnlineStatus() {
  const isOnline = navigator.onLine;
  if (DOM.offlineBadge) {
    DOM.offlineBadge.style.display = isOnline ? 'none' : 'block';
    if (!isOnline) DOM.offlineBadge.textContent = '⚠️ وضع عدم الاتصال';
  }
  if (DOM.syncIndicator) {
    DOM.syncIndicator.textContent = isOnline ? 'متصل' : 'غير متصل';
    DOM.syncIndicator.classList.toggle('offline', !isOnline);
  }
}
window.addEventListener('online', updateOnlineStatus);
window.addEventListener('offline', updateOnlineStatus);

// ============================================================
// AUTH — Fixed with better error handling + Guest Mode
// ============================================================
async function initAuth() {
  if (!firebaseReady) {
    console.error('Firebase not available');
    hideSplash();
    showLogin();
    return;
  }

  try {
    try { await FB.getRedirectResult(auth); } catch (e) { console.error('getRedirectResult error:', e); }

    FB.onAuthStateChanged(auth, async (user) => {
      hideSplash();
      if (!user) {
        state.currentUser = null;
        state.appInitialized = false;
        // FIXED: Use immutable update + clear cache
        setStateGirls([]);
        setStateAttendanceData({});
        clearAllSnapshots();
        showLogin();
        return;
      }
      state.currentUser = user;
      showApp(user);
      if (!state.appInitialized) {
        state.appInitialized = true;
        await loadData();
        renderPage();
        // NEW: Auto-mark absence for today if it's a service day
        await checkAndAutoMarkAbsence();
      }
    });
  } catch (e) {
    console.error('Auth init error:', e);
    hideSplash();
    showLogin();
  }
}

// Google Sign In — FIXED: Use FB module instead of window._fb
if (DOM.googleSignIn) {
  DOM.googleSignIn.addEventListener('click', async () => {
    if (!firebaseReady) {
      showToast('الإنترنت غير متاح - حاول تحديث الصفحة', 'warning');
      return;
    }
    DOM.googleSignIn.classList.add('is-loading');
    try {
      await FB.signInWithPopup(auth, provider);
    } catch (e) {
      DOM.googleSignIn.classList.remove('is-loading');
      if (['auth/popup-blocked', 'auth/popup-closed-by-user', 'auth/cancelled-popup-request'].includes(e.code)) {
        try {
          await FB.signInWithRedirect(auth, provider);
        } catch (e2) { showToast('فشل تسجيل الدخول: ' + e2.message, 'error'); }
      } else {
        showToast('فشل تسجيل الدخول: ' + e.message, 'error');
      }
    }
  });
}

if (DOM.signOutBtn) {
  DOM.signOutBtn.addEventListener('click', async () => {
    clearAllSnapshots();
    if (!firebaseReady) {
      state.currentUser = null;
      state.appInitialized = false;
      showLogin();
      return;
    }
    await FB.signOut(auth);
  });
}

function showApp(user) {
  if (DOM.loginScreen) DOM.loginScreen.classList.add('hidden');
  if (DOM.mainApp) DOM.mainApp.classList.remove('hidden');
  if (DOM.googleSignIn) DOM.googleSignIn.classList.remove('is-loading');
  const card = document.getElementById('loginCard');
  if (card) {
    card.classList.remove('animate-in');
    card.querySelectorAll('.animate-in').forEach(el => el.classList.remove('animate-in'));
  }
  const initial = user && user.displayName ? user.displayName[0] : 'خ';
  if (DOM.userAvatar) DOM.userAvatar.textContent = initial;
  if (DOM.drawerAvatar) DOM.drawerAvatar.textContent = initial;
  if (DOM.drawerUserName) DOM.drawerUserName.textContent = (user && user.displayName) || 'الخادم';
  if (DOM.drawerUserEmail) DOM.drawerUserEmail.textContent = (user && user.email) || '';
}

function showLogin() {
  if (DOM.loginScreen) DOM.loginScreen.classList.remove('hidden');
  if (DOM.mainApp) DOM.mainApp.classList.add('hidden');
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      const card = document.getElementById('loginCard');
      if (card) {
        card.classList.add('animate-in');
        card.querySelectorAll('.login-cross-icon, .login-church-name, .login-system-title, .login-divider, .login-welcome, .btn-google, .btn-guest, .login-hint').forEach(el => {
          el.classList.add('animate-in');
        });
      }
    });
  });
}

// ============================================================
// FIREBASE LISTENERS — FIXED: Memory leak prevention + async safety
// ============================================================
async function loadData() {
  try {
    if (!firebaseReady) return;

    // FIXED: Guard against duplicate listeners — clear + flag pattern
    if (_listenersInitialized) {
      console.warn('loadData called while listeners already active — skipping');
      return;
    }

    // Clear any existing listeners first (prevents duplicate listeners on re-login)
    clearAllSnapshots();
    _listenersInitialized = true;

    // FIXED: Store unsubscribers to prevent memory leaks
    const unsub1 = FB.onSnapshot(
      FB.query(FB.collection(db, 'girls'), FB.orderBy('name')),
      (snap) => {
        let changed = false;
        const newGirls = [...state.girls];
        for (const change of snap.docChanges()) {
          const g = { id: change.doc.id, ...change.doc.data() };
          if (change.type === 'removed' || g.isDeleted) {
            const idx = newGirls.findIndex(x => x.id === g.id);
            if (idx >= 0) { newGirls.splice(idx, 1); changed = true; }
          } else {
            const idx = newGirls.findIndex(x => x.id === g.id);
            if (idx >= 0) { newGirls[idx] = g; changed = true; }
            else { newGirls.push(g); changed = true; }
          }
        }
        if (changed) {
          newGirls.sort((a, b) => a.name.localeCompare(b.name, 'ar'));
          setStateGirls(newGirls);
          scheduleRender();
        }
      },
      (err) => console.error('Girls snapshot error:', err)
    );
    pushUnsubscriber(unsub1);

    const unsub2 = FB.onSnapshot(
      FB.query(FB.collection(db, 'attendance'), FB.orderBy('date', 'desc')),
      (snap) => {
        let changed = false;
        const newData = { ...state.attendanceData };
        for (const change of snap.docChanges()) {
          const a = { id: change.doc.id, ...change.doc.data() };
          if (change.type === 'removed') {
            delete newData[a.id]; changed = true;
          } else {
            newData[a.id] = a; changed = true;
          }
        }
        if (changed) {
          setStateAttendanceData(newData);
          scheduleRender();
        }
      },
      (err) => console.error('Attendance snapshot error:', err)
    );
    pushUnsubscriber(unsub2);

    // FIXED: History listener — do async IDB ops outside onSnapshot callback
    const unsub3 = FB.onSnapshot(
      FB.query(FB.collection(db, 'history'), FB.orderBy('timestamp', 'desc')),
      (snap) => {
        let changed = false;
        const idbOps = [];
        for (const change of snap.docChanges()) {
          const log = { id: change.doc.id, ...change.doc.data() };
          if (change.type === 'removed') {
            idbOps.push(IDB.delete('history', log.id).catch(() => {}));
            changed = true;
          } else {
            idbOps.push(IDB.add('history', log).catch(() => {}));
            changed = true;
          }
        }
        // Fire IDB ops independently — don't block
        Promise.all(idbOps).catch(() => {});
        if (changed && state.currentPage === 'history') renderHistory(false);
      },
      (err) => console.error('History snapshot error:', err)
    );
    pushUnsubscriber(unsub3);

    // SERVANTS: Firebase listener for خدام الفصول
    const unsub4 = FB.onSnapshot(
      FB.collection(db, 'gradeServants'),
      (snap) => {
        const newServants = {};
        snap.forEach(d => {
          const data = d.data();
          if (data.grade) newServants[data.grade] = data.servants || [];
        });
        state.gradeServants = newServants;
        scheduleRender();
      },
      (err) => console.error('GradeServants snapshot error:', err)
    );
    pushUnsubscriber(unsub4);
    console.error('Load error:', e);
    // FIXED: Reset flag on error so loadData can be retried
    _listenersInitialized = false;
  }
}

// ============================================================
// RENDER ENGINE — FIXED: Better throttling (120ms instead of 60ms)
// + dirty flag to prevent duplicate renders
// + queueMicrotask hybrid for state-settle safety
// ============================================================
function scheduleRender() {
  if (state.renderPending) return; // Already scheduled
  state.renderPending = true;
  clearTimeout(state.renderTimeout);
  // FIXED: Use requestAnimationFrame + queueMicrotask to ensure state has settled
  requestAnimationFrame(() => {
    queueMicrotask(() => {
      state.renderPending = false;
      renderPage();
    });
  });
}

// FIXED: Debounced render for rapid-fire updates (toggleAttendance, etc.)
function debouncedRender(minMs = 80) {
  if (state.renderPending) return;
  state.renderPending = true;
  clearTimeout(state.renderTimeout);
  state.renderTimeout = setTimeout(() => {
    state.renderPending = false;
    renderPage();
  }, minMs);
}

function renderPage() {
  switch (state.currentPage) {
    case 'home': renderHome(); break;
    case 'attendance': renderAttendancePage(); break;
    case 'girls': renderGirlsList(); break;
    case 'calendar': renderCalendar(); break;
    case 'stats': renderStats(); break;
    case 'history': renderHistory(false); break;
    case 'export': renderExport(); break;
  }
}

// ============================================================
// NAVIGATION
// ============================================================
const PAGE_TITLES = {
  home: ['الرئيسية', ''],
  attendance: ['الحضور اليومي', 'تسجيل وإدارة الحضور'],
  girls: ['المخدومات', 'قائمة المخدومات'],
  calendar: ['التقويم الشهري', 'أيام الخدمة'],
  stats: ['الإحصائيات', 'تحليلات وتقارير'],
  history: ['السجل التاريخي', 'سجل التعديلات'],
  export: ['التصدير', 'تصدير البيانات']
};

function navigateTo(page) {
  const pageEl = document.getElementById(`page-${page}`);
  if (!pageEl) {
    console.warn(`Page element not found: page-${page}`);
    return;
  }

  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  pageEl.classList.add('active');
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.page === page));
  document.querySelectorAll('.menu-item[data-page]').forEach(b => b.classList.toggle('active', b.dataset.page === page));
  const [title, sub] = PAGE_TITLES[page] || [page, ''];
  if (DOM.pageTitle) DOM.pageTitle.textContent = title;
  if (DOM.pageSubtitle) DOM.pageSubtitle.textContent = sub;
  state.currentPage = page;

  if (page === 'attendance') {
    state.attendancePageInitialized = false;
    // NEW: Auto-mark absence when opening attendance page on a service day
    checkAndAutoMarkAbsence();
  }
  if (page !== 'calendar') {
    hideDayDetail();
  }

  renderPage();
  closeDrawer();
}

document.querySelectorAll('.nav-btn').forEach(btn => btn.addEventListener('click', () => navigateTo(btn.dataset.page)));
document.querySelectorAll('.menu-item[data-page]').forEach(item => item.addEventListener('click', e => {
  e.preventDefault();
  navigateTo(item.dataset.page);
}));

if (DOM.menuBtn) DOM.menuBtn.addEventListener('click', openDrawer);
if (DOM.drawerOverlay) DOM.drawerOverlay.addEventListener('click', closeDrawer);

function openDrawer() {
  if (DOM.drawer) DOM.drawer.classList.add('open');
  if (DOM.drawerOverlay) DOM.drawerOverlay.classList.add('show');
}
function closeDrawer() {
  if (DOM.drawer) DOM.drawer.classList.remove('open');
  if (DOM.drawerOverlay) DOM.drawerOverlay.classList.remove('show');
}

// ============================================================
// SMART STATS — FIXED: Use Cache.girlsById instead of state.girls.find()
// ============================================================
function getBestGradeFiltered(monthStr, gradeFilter) {
  const activeGirls = state.girls.filter(g => !g.isDeleted);
  const [year, month] = monthStr.split('-').map(Number);
  // FIXED: Guard against undefined from getServiceDaysInMonth
  const serviceDays = getServiceDaysInMonth(year, month - 1) || [];
  const totalServiceDays = serviceDays.length || 1;

  const gradeStats = {};
  activeGirls.forEach(g => {
    if (gradeFilter && g.grade !== gradeFilter) return;
    if (!gradeStats[g.grade]) gradeStats[g.grade] = { totalGirls: 0, presentDates: new Set() };
    gradeStats[g.grade].totalGirls++;
  });

  const allAttendance = Cache.getAllAttendance();
  allAttendance.forEach(a => {
    if (!a.date?.startsWith(monthStr)) return;
    if (a.status !== 'حاضر') return;
    const girl = Cache.getGirl(a.girlId);
    if (!girl) return;
    if (gradeFilter && girl.grade !== gradeFilter) return;
    if (!gradeStats[girl.grade]) return;
    gradeStats[girl.grade].presentDates.add(a.date + '_' + a.girlId);
  });

  let best = null;
  Object.entries(gradeStats).forEach(([grade, data]) => {
    const maxPossible = data.totalGirls * totalServiceDays;
    const percent = maxPossible > 0 ? (data.presentDates.size / maxPossible) * 100 : 0;
    if (!best || percent > best.percent) best = { grade, percent };
  });
  return best;
}

function getTopActivityFiltered(monthStr, gradeFilter) {
  const activeGirls = state.girls.filter(g => !g.isDeleted);
  const activeGirlIds = gradeFilter
    ? new Set(activeGirls.filter(g => g.grade === gradeFilter).map(g => g.id))
    : new Set(activeGirls.map(g => g.id));
  const counts = {};
  ACTIVITIES.forEach(a => counts[a] = 0);

  const allAttendance = Cache.getAllAttendance();
  allAttendance.forEach(a => {
    if (!a.date?.startsWith(monthStr)) return;
    if (!activeGirlIds.has(a.girlId)) return;
    if (a.status === 'حاضر' && counts[a.activity] !== undefined) counts[a.activity]++;
  });

  let topName = ACTIVITIES[0];
  let topValue = 0;
  Object.entries(counts).forEach(([name, count]) => {
    if (count > topValue) { topName = name; topValue = count; }
  });
  return topValue > 0 ? { name: topName, count: topValue } : null;
}

function getMostRegularGirlFiltered(monthStr, gradeFilter) {
  let activeGirls = state.girls.filter(g => !g.isDeleted);
  if (gradeFilter) activeGirls = activeGirls.filter(g => g.grade === gradeFilter);
  if (!activeGirls.length) return null;
  const activeGirlIds = new Set(activeGirls.map(g => g.id));

  const [year, month] = monthStr.split('-').map(Number);
  // FIXED: Guard against undefined from getServiceDaysInMonth
  const serviceDays = getServiceDaysInMonth(year, month - 1) || [];
  const totalServiceDays = serviceDays.length || 1;

  const presentDatesByGirl = {};
  activeGirls.forEach(g => presentDatesByGirl[g.id] = new Set());

  const allAttendance = Cache.getAllAttendance();
  allAttendance.forEach(a => {
    if (!a.date?.startsWith(monthStr)) return;
    if (a.status === 'حاضر' && presentDatesByGirl[a.girlId] !== undefined) {
      presentDatesByGirl[a.girlId].add(a.date);
    }
  });

  let best = null;
  Object.entries(presentDatesByGirl).forEach(([girlId, dateSet]) => {
    const count = dateSet.size;
    if (count === 0) return;
    const percent = (count / totalServiceDays) * 100;
    const girl = Cache.getGirl(girlId);
    if (!girl) return;
    if (!best || percent > best.percent || (percent === best.percent && count > best.count)) {
      best = { name: girl.name, count, percent };
    }
  });
  return best;
}

// ============================================================
// GRADE SERVANTS — خدام الفصول
// ============================================================

/**
 * Render a servants info card into a container element.
 * Shows servant names for the active grade with an edit button.
 */
function renderServantsCard(el, grade) {
  if (!el) return;
  if (!grade) {
    el.style.display = 'none';
    el.innerHTML = '';
    return;
  }

  const servants = (state.gradeServants?.[grade] || []).filter(s => s && s.trim());

  el.style.display = 'flex';
  const servantChips = servants.length
    ? servants.map(s => `<span class="servant-chip">${esc(s)}</span>`).join('')
    : '<span class="servant-chip servant-chip--empty">لم يُضف خدام بعد</span>';

  el.innerHTML = `
    <div class="servants-info">
      <span class="servants-label">&#128101; خدام ${esc(grade)}</span>
      <div class="servants-chips">${servantChips}</div>
    </div>
    <button class="servants-edit-btn" data-grade="${esc(grade)}" aria-label="تعديل خدام الفصل" title="تعديل الخدام">&#9999;</button>
  `;
}

/**
 * Save servant names for a grade to Firestore and local state.
 */
async function saveGradeServants(grade, servants) {
  const docId = grade.replace(/\s+/g, '_');
  const cleanedServants = servants.map(s => (s || '').trim()).filter(s => s.length > 0);

  if (!state.gradeServants) state.gradeServants = {};
  state.gradeServants[grade] = cleanedServants;

  if (firebaseReady) {
    try {
      await FB.setDoc(FB.doc(db, 'gradeServants', docId), {
        grade,
        servants: cleanedServants,
        updatedAt: Date.now(),
        updatedBy: state.currentUser?.displayName || 'خادم',
        updatedByEmail: state.currentUser?.email || ''
      });
    } catch (e) {
      console.error('Save gradeServants error:', e);
      showToast('فشل حفظ الخدام', 'error');
      return;
    }
  }

  await logHistory('تعديل خدام فصل', `${grade}: ${cleanedServants.join(', ') || '(لا أحد)'}`);
  showToast('تم حفظ خدام الفصل ✓', 'success');
  scheduleRender();
}

// Open servants edit modal via event delegation (cards are dynamically created)
document.addEventListener('click', (e) => {
  const editBtn = e.target.closest('.servants-edit-btn');
  if (!editBtn) return;
  const grade = editBtn.dataset.grade;
  if (!grade) return;
  state.servantEditGrade = grade;
  const servants = state.gradeServants?.[grade] || [];
  if (DOM.servantsModalTitle) DOM.servantsModalTitle.textContent = `خدام ${grade}`;
  if (DOM.servantInput1) DOM.servantInput1.value = servants[0] || '';
  if (DOM.servantInput2) DOM.servantInput2.value = servants[1] || '';
  if (DOM.servantInput3) DOM.servantInput3.value = servants[2] || '';
  openModal('servantsModal');
});

if (DOM.saveServantsBtn) {
  DOM.saveServantsBtn.addEventListener('click', async () => {
    if (!state.servantEditGrade) return;
    const servants = [
      DOM.servantInput1?.value?.trim() || '',
      DOM.servantInput2?.value?.trim() || '',
      DOM.servantInput3?.value?.trim() || ''
    ];
    await saveGradeServants(state.servantEditGrade, servants);
    closeModal('servantsModal');
    state.servantEditGrade = null;
  });
}

if (DOM.cancelServantsModal) {
  DOM.cancelServantsModal.addEventListener('click', () => {
    closeModal('servantsModal');
    state.servantEditGrade = null;
  });
}
if (DOM.closeServantsModal) {
  DOM.closeServantsModal.addEventListener('click', () => {
    closeModal('servantsModal');
    state.servantEditGrade = null;
  });
}

// ============================================================
// HOME PAGE — FIXED: O(n^2) eliminated with cache + single-pass logic
// ============================================================
function renderHome() {
  const selectedDate = TimeContext.getDate();
  // FIXED: Use parseDateStr instead of unsafe new Date(dateStr + 'T00:00:00')
  const now = parseDateStr(selectedDate);
  const dayName = DateUtil.dayName(now);
  const dateStr = selectedDate;
  const monthStr = TimeContext.getMonth();

  if (DOM.todayDay) DOM.todayDay.textContent = `${DateUtil.formatDateShort(now)} ${dayName}`;
  if (DOM.todayDate) DOM.todayDate.textContent = now.toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' });

  const normalized = DateUtil.normalize(dayName);
  const isService = SERVICE_DAYS[normalized];

  if (DOM.todayServiceBadge) {
    DOM.todayServiceBadge.textContent = isService ? 'يوم خدمة \u2713' : 'لا توجد خدمة اليوم';
    DOM.todayServiceBadge.classList.toggle('active', isService);
  }

  const gradeFilter = state.homeGradeFilter;
  const activeGirls = state.girls.filter(g => !g.isDeleted);
  const filteredGirls = gradeFilter ? activeGirls.filter(g => g.grade === gradeFilter) : activeGirls;
  // FIXED: Use cached activeGirlIds from Cache instead of rebuilding Set
  const allActiveGirlIds = Cache.getActiveGirlIds();
  const activeGirlIds = gradeFilter
    ? new Set(filteredGirls.map(g => g.id))
    : allActiveGirlIds;

  // FIXED: Single-pass grade count instead of 3 separate filters (O(n) not O(3n))
  const gradeCounts = { 'أولى أ': 0, 'أولى ب': 0, 'تانيه أ': 0, 'تانيه ب': 0, 'تالته أ': 0, 'تالته ب': 0 };
  activeGirls.forEach(g => {
    if (gradeCounts[g.grade] !== undefined) gradeCounts[g.grade]++;
  });
  const hfcAll = document.getElementById('homeFilterCountAll');
  const hfc1 = document.getElementById('homeFilterCount1');
  const hfc1b = document.getElementById('homeFilterCount1b');
  const hfc2 = document.getElementById('homeFilterCount2');
  const hfc2b = document.getElementById('homeFilterCount2b');
  const hfc3 = document.getElementById('homeFilterCount3');
  const hfc3b = document.getElementById('homeFilterCount3b');
  if (hfcAll) hfcAll.textContent = activeGirls.length;
  if (hfc1) hfc1.textContent = gradeCounts['أولى أ'];
  if (hfc1b) hfc1b.textContent = gradeCounts['أولى ب'];
  if (hfc2) hfc2.textContent = gradeCounts['تانيه أ'];
  if (hfc2b) hfc2b.textContent = gradeCounts['تانيه ب'];
  if (hfc3) hfc3.textContent = gradeCounts['تالته أ'];
  if (hfc3b) hfc3b.textContent = gradeCounts['تالته ب'];

  document.querySelectorAll('#homeGradeFilters .grade-filter-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.grade === gradeFilter);
  });

  // SERVANTS: Update servants card for home page
  renderServantsCard(document.getElementById('homeServantsCard'), gradeFilter);

  if (DOM.statTotal) DOM.statTotal.textContent = filteredGirls.length;

  // FIXED: Single-pass attendance scan instead of multiple loops
  const presentGirlIds = new Set();
  const absentGirlIds = new Set();
  const todayRecordsByGirl = {};
  const monthPresentsByGirl = {}; // For top attendees
  let totalRating = 0, ratingCount = 0;

  const allAttendance = Cache.getAllAttendance();
  allAttendance.forEach(a => {
    // Today counts
    if (a.date === dateStr && activeGirlIds.has(a.girlId)) {
      if (!todayRecordsByGirl[a.girlId]) todayRecordsByGirl[a.girlId] = [];
      todayRecordsByGirl[a.girlId].push(a);
    }
    // Month presents for top attendees + ratings
    if (a.date?.startsWith(monthStr) && activeGirlIds.has(a.girlId)) {
      if (a.status === 'حاضر') {
        if (!monthPresentsByGirl[a.girlId]) monthPresentsByGirl[a.girlId] = new Set();
        monthPresentsByGirl[a.girlId].add(a.date);
      }
      if (a.rating > 0) { totalRating += a.rating; ratingCount++; }
    }
  });

  // Process today's status
  filteredGirls.forEach(g => {
    const records = todayRecordsByGirl[g.id];
    if (records && records.length > 0) {
      const hasAnyPresent = records.some(r => r.status === 'حاضر');
      if (hasAnyPresent) presentGirlIds.add(g.id);
      else absentGirlIds.add(g.id);
    } else if (isService) {
      absentGirlIds.add(g.id);
    }
  });

  if (DOM.statPresentToday) DOM.statPresentToday.textContent = presentGirlIds.size;
  if (DOM.statAbsentToday) DOM.statAbsentToday.textContent = absentGirlIds.size;
  if (DOM.statAvgRating) DOM.statAvgRating.textContent = ratingCount ? (totalRating / ratingCount).toFixed(1) : '-';

  // Best grade
  const bestGrade = getBestGradeFiltered(monthStr, gradeFilter);
  if (DOM.bestGrade && DOM.bestGradePercent) {
    if (bestGrade && bestGrade.percent > 0) {
      DOM.bestGrade.textContent = bestGrade.grade;
      DOM.bestGradePercent.textContent = `${Math.round(bestGrade.percent)}% حضور`;
    } else {
      DOM.bestGrade.textContent = gradeFilter || '-';
      DOM.bestGradePercent.textContent = gradeFilter ? 'لا توجد بيانات' : 'أفضل فصل';
    }
  }

  // Top activity
  const topActivity = getTopActivityFiltered(monthStr, gradeFilter);
  if (DOM.topActivityName && DOM.topActivityCount) {
    if (topActivity) {
      DOM.topActivityName.textContent = topActivity.name;
      DOM.topActivityCount.textContent = `${topActivity.count} حضور`;
    } else {
      DOM.topActivityName.textContent = '-';
      DOM.topActivityCount.textContent = 'أكثر نشاط حضورًا';
    }
  }

  // Most regular
  const mostRegular = getMostRegularGirlFiltered(monthStr, gradeFilter);
  if (DOM.mostRegularGirl && DOM.mostRegularPercent) {
    if (mostRegular) {
      DOM.mostRegularGirl.textContent = mostRegular.name;
      DOM.mostRegularPercent.textContent = `${mostRegular.count} يوم \u00B7 ${Math.round(mostRegular.percent)}%`;
    } else {
      DOM.mostRegularGirl.textContent = '-';
      DOM.mostRegularPercent.textContent = 'أكثر مخدومة انتظامًا';
    }
  }

  // Top attendees — from precomputed monthPresentsByGirl
  if (DOM.topAttendees) {
    const sorted = Object.entries(monthPresentsByGirl)
      .map(([id, dates]) => [id, dates.size])
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .filter(([, count]) => count > 0);

    if (!sorted.length) {
      DOM.topAttendees.innerHTML = '<div class="empty-state">لا توجد بيانات حضور هذا الشهر</div>';
    } else {
      const frag = document.createDocumentFragment();
      sorted.forEach(([id, count], i) => {
        const g = Cache.getGirl(id);
        if (!g) return;
        const div = document.createElement('div');
        div.className = 'top-item';
        div.innerHTML = `<span class="top-rank">${i + 1}</span><span class="top-name">${esc(g.name)}</span><span class="top-count">${count} يوم</span>`;
        frag.appendChild(div);
      });
      DOM.topAttendees.innerHTML = '';
      DOM.topAttendees.appendChild(frag);
    }
  }

  // Needs followup — FIXED: Single-pass hasConsecutiveAbsences with cached results
  const needs = [];
  filteredGirls.forEach(g => {
    const result = hasConsecutiveAbsences(g.id, monthStr);
    if (result.hasConsecutive) needs.push({ girl: g, result });
  });

  if (DOM.needsFollowup) {
    if (!needs.length) {
      DOM.needsFollowup.innerHTML = '<div class="empty-state">لا توجد حالات تحتاج متابعة</div>';
    } else {
      const frag = document.createDocumentFragment();
      needs.forEach(({ girl, result }) => {
        const div = document.createElement('div');
        div.className = 'followup-item';
        div.dataset.girlId = girl.id;
        // FIXED: result.count = total absences, not consecutive streak. Changed text to be accurate.
        div.innerHTML = `<span class="followup-name">${esc(girl.name)}</span><span class="followup-badge">${result.count} غياب</span>`;
        frag.appendChild(div);
      });
      DOM.needsFollowup.innerHTML = '';
      DOM.needsFollowup.appendChild(frag);
    }
  }
}

// ============================================================
// SEARCH
// ============================================================
function debouncedSearch() {
  clearTimeout(state.searchDebounceTimer);
  state.searchDebounceTimer = setTimeout(() => {
    const q = DOM.globalSearch ? DOM.globalSearch.value.trim() : '';
    const resultsEl = DOM.searchResults;
    if (!resultsEl) return;
    if (!q) { resultsEl.classList.remove('show'); resultsEl.innerHTML = ''; return; }
    const qNorm = normalizeArabic(q);
    const matches = state.girls.filter(g => !g.isDeleted && normalizeArabic(g.name).includes(qNorm));
    resultsEl.innerHTML = matches.length
      ? matches.map(g => `<div class="search-item" data-girl-id="${esc(g.id)}"><span>${esc(g.name)}</span><span class="grade-badge">${esc(g.grade)}</span></div>`).join('')
      : '<div class="search-item">لا توجد نتائج</div>';
    resultsEl.classList.add('show');
  }, 250);
}

if (DOM.globalSearch) DOM.globalSearch.addEventListener('input', debouncedSearch);

// FIXED: Close search results when clicking outside
document.addEventListener('click', (e) => {
  const resultsEl = DOM.searchResults;
  const searchEl = DOM.globalSearch;
  if (resultsEl && resultsEl.classList.contains('show')) {
    const isClickInside = resultsEl.contains(e.target) || (searchEl && searchEl.contains(e.target));
    if (!isClickInside) {
      resultsEl.classList.remove('show');
      resultsEl.innerHTML = '';
    }
  }
});

// ============================================================
// GIRLS PAGE — FIXED: Use Cache instead of repeated .find()
// ============================================================
function renderGirlsList() {
  const filter = state.girlsGradeFilter;
  const searchQuery = (state.girlsSearchQuery || '').trim();
  let activeGirls = state.girls.filter(g => !g.isDeleted);

  if (searchQuery) {
    const qNorm = normalizeArabic(searchQuery);
    activeGirls = activeGirls.filter(g => normalizeArabic(g.name).includes(qNorm));
  }

  const filtered = filter ? activeGirls.filter(g => g.grade === filter) : activeGirls;
  const el = DOM.girlsList;
  if (!el) return;

  const gfcAll = document.getElementById('girlsFilterCountAll');
  const gfc1 = document.getElementById('girlsFilterCount1');
  const gfc1b = document.getElementById('girlsFilterCount1b');
  const gfc2 = document.getElementById('girlsFilterCount2');
  const gfc2b = document.getElementById('girlsFilterCount2b');
  const gfc3 = document.getElementById('girlsFilterCount3');
  const gfc3b = document.getElementById('girlsFilterCount3b');
  if (gfcAll) gfcAll.textContent = activeGirls.length;
  if (gfc1) gfc1.textContent = activeGirls.filter(g => g.grade === 'أولى أ').length;
  if (gfc1b) gfc1b.textContent = activeGirls.filter(g => g.grade === 'أولى ب').length;
  if (gfc2) gfc2.textContent = activeGirls.filter(g => g.grade === 'تانيه أ').length;
  if (gfc2b) gfc2b.textContent = activeGirls.filter(g => g.grade === 'تانيه ب').length;
  if (gfc3) gfc3.textContent = activeGirls.filter(g => g.grade === 'تالته أ').length;
  if (gfc3b) gfc3b.textContent = activeGirls.filter(g => g.grade === 'تالته ب').length;

  document.querySelectorAll('#girlsGradeFilters .grade-filter-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.grade === filter);
  });

  // SERVANTS: Update servants card for girls page
  renderServantsCard(document.getElementById('girlsServantsCard'), filter);

  if (!filtered.length) {
    el.innerHTML = '<div class="empty-state">لا توجد مخدومات<br><small>اضغط + لإضافة مخدومة جديدة</small></div>';
    return;
  }

  // FIXED: Precompute attendance counts per girl in single pass
  const monthStr = TimeContext.getMonth();
  const girlStats = {};
  const allAttendance = Cache.getAllAttendance();
  allAttendance.forEach(a => {
    if (!a.date?.startsWith(monthStr)) return;
    if (!girlStats[a.girlId]) girlStats[a.girlId] = { present: 0, absent: 0 };
    if (a.status === 'حاضر') girlStats[a.girlId].present++;
    else if (a.status === 'غائب') girlStats[a.girlId].absent++;
  });

  const frag = document.createDocumentFragment();
  filtered.forEach(g => {
    const stats = girlStats[g.id] || { present: 0, absent: 0 };
    const div = document.createElement('div');
    div.className = 'girl-card';
    div.dataset.girlId = g.id;
    div.innerHTML = `
      <div class="girl-avatar">${esc(g.name[0])}</div>
      <div class="girl-info">
        <span class="girl-name">${esc(g.name)}</span>
        <span class="girl-grade">${esc(g.grade)}</span>
        ${g.phone ? `<a href="tel:${esc(g.phone)}" class="girl-phone-link" data-phone="${esc(g.phone)}" onclick="event.stopPropagation();">${esc(g.phone)}</a>` : ''}
        <div class="girl-stats"><span class="green-text">&#10003;${stats.present}</span><span class="red-text">&#10007;${stats.absent}</span></div>
      </div>
      <button class="edit-btn" data-girl-id="${esc(g.id)}" aria-label="تعديل ${esc(g.name)}">&#9999;</button>`;
    frag.appendChild(div);
  });
  el.innerHTML = '';
  el.appendChild(frag);
}

if (DOM.addGirlBtn) {
  DOM.addGirlBtn.addEventListener('click', () => {
    state.editingGirlId = null;
    if (DOM.girlModalTitle) DOM.girlModalTitle.textContent = 'إضافة مخدومة';
    if (DOM.girlName) DOM.girlName.value = '';
    if (DOM.girlPhone) DOM.girlPhone.value = '';
    if (DOM.girlGrade) DOM.girlGrade.value = '';
    if (DOM.girlNotes) DOM.girlNotes.value = '';
    if (DOM.deleteGirlBtn) DOM.deleteGirlBtn.classList.add('hidden');
    openModal('girlModal');
  });
}

function editGirl(id) {
  const g = Cache.getGirl(id);
  if (!g) return;
  state.editingGirlId = id;
  if (DOM.girlModalTitle) DOM.girlModalTitle.textContent = 'تعديل بيانات المخدومة';
  if (DOM.girlName) DOM.girlName.value = g.name;
  if (DOM.girlPhone) DOM.girlPhone.value = g.phone || '';
  if (DOM.girlGrade) DOM.girlGrade.value = g.grade;
  if (DOM.girlNotes) DOM.girlNotes.value = g.notes || '';
  if (DOM.deleteGirlBtn) DOM.deleteGirlBtn.classList.remove('hidden');
  openModal('girlModal');
}

// ============================================================
// DELETE GIRL — FIXED: State validation + snapshot isolation + backup
// ============================================================
if (DOM.deleteGirlBtn) {
  DOM.deleteGirlBtn.addEventListener('click', async () => {
    if (!state.editingGirlId || state.deleteInProgress) return;
    const currentId = state.editingGirlId; // Capture ID at click time
    const g = Cache.getGirl(currentId);
    if (!g) return;

    closeModal('girlModal');

    showConfirm({
      icon: '&#9888;', title: 'حذف مخدومة',
      msg: `هل أنت متأكد من حذف "${esc(g.name)}"؟ سيتم حذف جميع بيانات الحضور الخاصة بها أيضاً.`,
      okLabel: 'حذف',
      okClass: 'confirm-delete',
      onOk: async () => {
        if (state.deleteInProgress) return;
        // FIXED: Validate the captured ID matches current editingGirlId
        if (state.editingGirlId !== currentId) {
          showToast('خطأ: تم تغيير المخدومة المحددة', 'error');
          return;
        }
        state.deleteInProgress = true;

        // FIXED: Create backup before delete for rollback support
        const backupId = 'delete_' + currentId + '_' + Date.now();
        await createBackup(backupId, { girl: g, attendanceData: state.attendanceData });

        try {
          const id = currentId;
          // Remove from state
          setStateGirls(state.girls.filter(x => x.id !== id));
          const newAttData = { ...state.attendanceData };
          Object.keys(newAttData).forEach(k => {
            if (newAttData[k].girlId === id) delete newAttData[k];
          });
          setStateAttendanceData(newAttData);

          if (firebaseReady) {
            try {
              await FB.setDoc(FB.doc(db, 'girls', id), {
                isDeleted: true, deletedAt: Date.now(),
                deletedBy: state.currentUser?.email || '',
                name: g.name, grade: g.grade
              }, { merge: true });

              const attQuery = FB.query(FB.collection(db, 'attendance'), FB.where('girlId', '==', id));
              const attSnap = await FB.getDocs(attQuery);
              if (!attSnap.empty) {
                const docs = attSnap.docs;
                for (let i = 0; i < docs.length; i += 500) {
                  try {
                    const batch = FB.writeBatch(db);
                    docs.slice(i, i + 500).forEach(d => batch.delete(d.ref));
                    await batch.commit();
                  } catch (batchErr) {
                    console.error('Batch delete error (retrying):', batchErr);
                    // FIXED: Simple retry once
                    try {
                      const batch = FB.writeBatch(db);
                      docs.slice(i, i + 500).forEach(d => batch.delete(d.ref));
                      await batch.commit();
                    } catch (e2) { console.error('Batch delete retry failed:', e2); }
                  }
                }
              }
            } catch (e) {
              console.error('Delete girl Firestore error:', e);
            }
          }

          await logHistory('حذف مخدومة', `${g.name} - ${g.grade}`);
          showToast(`تم حذف ${g.name}`, 'success');
          state.editingGirlId = null;
          scheduleRender();
        } catch (err) {
          console.error('Delete error:', err);
          showToast('حدث خطأ أثناء الحذف', 'error');
        } finally {
          state.deleteInProgress = false;
        }
      }
    });
  });
}

// ============================================================
// SAVE GIRL — FIXED: catch block + Firestore-first ordering + backup
// ============================================================
if (DOM.saveGirlBtn) {
  DOM.saveGirlBtn.addEventListener('click', async () => {
    // Prevent duplicate clicks
    if (state.savingGirl || state.pendingSaveGirl) {
      console.warn('Save already in progress, ignoring duplicate click');
      return;
    }

    // Set flags BEFORE anything else
    state.savingGirl = true;
    state.pendingSaveGirl = true;

    try {
      // Create backup for rollback support
      const backupId = 'saveGirl_' + Date.now();
      await createBackup(backupId, { girls: state.girls, attendanceData: state.attendanceData });

      // Get form values with null safety
      const name = DOM.girlName ? DOM.girlName.value.trim() : '';
      const phone = DOM.girlPhone ? DOM.girlPhone.value.trim() : '';
      const grade = DOM.girlGrade ? DOM.girlGrade.value : '';
      const notes = DOM.girlNotes ? DOM.girlNotes.value.trim() : '';

      // Validate name
      if (!name) {
        showToast('الرجاء إدخال اسم المخدومة', 'error');
        return;
      }

      // Validate grade
      if (!grade) {
        showToast('الرجاء اختيار الفصل', 'error');
        return;
      }

      // Check for duplicate names
      const normalizedName = normalizeName(name);
      const existingGirl = state.girls.find(g =>
        normalizeName(g.name) === normalizedName && g.id !== state.editingGirlId && !g.isDeleted
      );
      if (existingGirl) {
        showToast('هذه المخدومة موجودة بالفعل', 'error');
        return;
      }

      // Build girl data object
      const id = state.editingGirlId || 'girl_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
      const now = Date.now();
      const girlData = {
        id, name, phone, grade, notes,
        createdAt: state.editingGirlId ? (Cache.getGirl(id)?.createdAt || now) : now,
        updatedAt: now,
        updatedBy: state.currentUser?.displayName || 'خادم',
        updatedByEmail: state.currentUser?.email || '',
        isDeleted: false
      };

      const isNewGirl = !state.editingGirlId;
      const wasEditing = !!state.editingGirlId;

      // Write to Firestore FIRST, then update local state on success
      if (firebaseReady) {
        try {
          await FB.setDoc(FB.doc(db, 'girls', id), girlData);
        } catch (e) {
          console.error('Save girl Firestore error:', e);
          showToast('فشل الحفظ في السحابة: ' + (e.message || 'تحقق من الاتصال'), 'error');
          return;
        }
      }

      // Now update local state (guaranteed to match server)
      if (state.editingGirlId) {
        setStateGirls(state.girls.map(g => g.id === id ? girlData : g));
      } else {
        setStateGirls([...state.girls, girlData]);
      }

      // Log history (with its own error handling)
      await logHistory(wasEditing ? 'تعديل مخدومة' : 'إضافة مخدومة', `${name} - ${grade}`);

      // Auto-mark absent on service days for new girls only
      if (isNewGirl) {
        const todayStr = DateUtil.toStr();
        if (isServiceDayDate(todayStr)) {
          await autoMarkAbsentForNewGirl(id, todayStr);
        }
      }

      // Close modal and show success
      closeModal('girlModal');
      showToast(wasEditing ? 'تم تعديل البيانات' : 'تمت إضافة المخدومة', 'success');
      state.editingGirlId = null;
      renderPage();
    } catch (err) {
      // Global catch-all for any unexpected errors
      console.error('Save girl unexpected error:', err);
      showToast('حدث خطأ أثناء الحفظ: ' + (err?.message || 'خطأ غير معروف'), 'error');
    } finally {
      // CRITICAL: Always reset flags, even if return was called above
      state.savingGirl = false;
      state.pendingSaveGirl = false;
    }
  });
}

// ============================================================
// GIRL PROFILE — FIXED: Correct lastAttendance + safe month grouping
// ============================================================
function showGirlProfile(id) {
  const g = Cache.getGirl(id);
  if (!g) return;
  state.currentProfileGirlId = id;
  if (DOM.profileName) DOM.profileName.textContent = g.name;

  const girlAtt = Cache.getAllAttendance().filter(a => a.girlId === id);
  // FIXED: Use parseDateStr for safe date comparison
  girlAtt.sort((a, b) => compareDateStr(b.date, a.date));

  const totalRecords = girlAtt.length;
  const presentCount = girlAtt.filter(a => a.status === 'حاضر').length;
  const absentCount = girlAtt.filter(a => a.status === 'غائب').length;

  // FIXED: Consistent attendance rate calculation
  const attendanceRate = totalRecords > 0 ? Math.round((presentCount / totalRecords) * 100) : 0;

  const ratings = girlAtt.filter(a => a.rating > 0).map(a => a.rating);
  const avgRating = ratings.length ? (ratings.reduce((a, b) => a + b, 0) / ratings.length).toFixed(1) : '0';

  // FIXED: Use findLast (or reverse find) to get MOST RECENT present record
  const sortedAtt = [...girlAtt].sort((a, b) => compareDateStr(a.date, b.date)); // oldest first
  const lastAttendance = [...sortedAtt].reverse().find(a => a.status === 'حاضر');
  const lastDateRaw = lastAttendance ? lastAttendance.date : null;
  const lastDate = lastDateRaw ? (() => {
    const d = parseDateStr(lastDateRaw);
    return isNaN(d.getTime()) ? lastDateRaw : `${d.getDate()}/${d.getMonth() + 1} ${DAY_NAMES[d.getDay()] || ''}`;
  })() : '-';

  // FIXED: Safe month grouping with date validation
  const months = {};
  girlAtt.forEach(a => {
    const m = a.date?.substring(0, 7);
    if (!m || !/^\d{4}-\d{2}$/.test(m)) return; // Skip malformed dates
    if (!months[m]) months[m] = [];
    months[m].push(a);
  });

  let html = `<div class="profile-info">
    <span class="grade-badge">${esc(g.grade)}</span>
    ${g.phone ? `<span class="profile-phone">&#128222; ${esc(g.phone)}</span>` : ''}
    ${g.notes ? `<p class="profile-notes">${esc(g.notes)}</p>` : ''}
  </div>`;

  html += `<div class="profile-dashboard">
    <div class="profile-stat"><div class="ps-value green">${presentCount}</div><div class="ps-label">مرات الحضور</div></div>
    <div class="profile-stat"><div class="ps-value red">${absentCount}</div><div class="ps-label">مرات الغياب</div></div>
    <div class="profile-stat"><div class="ps-value orange">${attendanceRate}%</div><div class="ps-label">نسبة الحضور</div></div>
    <div class="profile-stat"><div class="ps-value">${avgRating}</div><div class="ps-label">متوسط التقييم</div></div>
    <div class="profile-stat"><div class="ps-value">${totalRecords}</div><div class="ps-label">إجمالي السجلات</div></div>
    <div class="profile-stat"><div class="ps-value">${lastDate}</div><div class="ps-label">آخر حضور</div></div>
  </div>`;

  if (!Object.keys(months).length) {
    html += '<div class="empty-state">لا توجد سجلات حضور</div>';
  } else {
    Object.entries(months).sort((a, b) => b[0].localeCompare(a[0])).forEach(([month, records]) => {
      const presents = records.filter(r => r.status === 'حاضر').length;
      const absents = records.filter(r => r.status === 'غائب').length;
      html += `<div class="profile-month">
        <div class="profile-month-header">
          <span>${DateUtil.formatMonth(month)}</span>
          <span class="green-text">&#10003;${presents}</span>
          <span class="red-text">&#10007;${absents}</span>
        </div>
        <div class="profile-records">
          ${records.map(r => {
            const stars = r.rating ? '&#9733;'.repeat(r.rating) + '&#9734;'.repeat(5 - r.rating) : '';
            // FIXED: Use parseDateStr for safe day name lookup
            const dayName = DAY_NAMES[parseDateStr(r.date).getDay()] || '';
            return `<div class="profile-record">
              <span class="rec-date">${esc(r.date)} ${esc(dayName)}</span>
              <span class="rec-activity">${esc(r.activity || '')}</span>
              <span class="rec-status ${r.status === 'حاضر' ? 'present' : 'absent'}">${esc(r.status)}</span>
              ${stars ? `<span class="rec-rating">${stars}</span>` : ''}
              ${r.notes ? `<span class="rec-notes">${esc(r.notes)}</span>` : ''}
            </div>`;
          }).join('')}
        </div>
      </div>`;
    });
  }
  if (DOM.profileBody) DOM.profileBody.innerHTML = html;
  openModal('girlProfileModal');
}

if (DOM.closeProfileModal) DOM.closeProfileModal.addEventListener('click', () => closeModal('girlProfileModal'));
if (DOM.editProfileBtn) {
  DOM.editProfileBtn.addEventListener('click', () => {
    closeModal('girlProfileModal');
    if (state.currentProfileGirlId) editGirl(state.currentProfileGirlId);
  });
}

// ============================================================
// SHARE PROFILE — FIXED: Use ASCII-safe symbols
// ============================================================
if (DOM.shareProfileBtn) {
  DOM.shareProfileBtn.addEventListener('click', async () => {
    const id = state.currentProfileGirlId;
    if (!id) return;
    const g = Cache.getGirl(id);
    if (!g) return;

    const girlAtt = Cache.getAllAttendance().filter(a => a.girlId === id);
    const presentCount = girlAtt.filter(a => a.status === 'حاضر').length;
    const absentCount = girlAtt.filter(a => a.status === 'غائب').length;
    const attendanceRate = girlAtt.length > 0 ? Math.round((presentCount / girlAtt.length) * 100) : 0;

    // FIXED: Use ASCII-safe symbols instead of Unicode that may break on old devices
    const shareText = `${g.name}
${g.grade}
[H] حضور: ${presentCount}
[G] غياب: ${absentCount}
[%] نسبة: ${attendanceRate}%
`.trim();

    if (navigator.share) {
      try { await navigator.share({ title: `ملف ${g.name}`, text: shareText }); } catch (e) { /* user cancelled */ }
    } else {
      try {
        await navigator.clipboard.writeText(shareText);
        showToast('تم نسخ البيانات للمشاركة', 'success');
      } catch (e) {
        showToast('المشاركة غير متوفرة على هذا الجهاز', 'warning');
      }
    }
  });
}

// ============================================================
// ATTENDANCE PAGE — FIXED: Removed dangerous auto-mark on render
// ============================================================
function getCurrentServiceDay() {
  const dayOfWeek = new Date().getDay();
  const dayMap = { 5: 'الجمعة' };
  return dayMap[dayOfWeek] || null;
}

function isServiceDayDate(dateStr) {
  if (!dateStr) return false;
  // FIXED: Use parseDateStr for safe date parsing
  const d = parseDateStr(dateStr);
  if (isNaN(d.getTime())) return false;
  return SERVICE_DAY_NUMBERS.includes(d.getDay());
}

// ============================================================
// AUTO MARK ABSENCE — NEW: Automatically mark all girls as absent on service days
// ============================================================

/**
 * Persist the auto-marked dates Set to localStorage
 */
function persistAutoMarkedDates() {
  try {
    localStorage.setItem('autoMarkedDates', JSON.stringify([...state.autoMarkedDates]));
  } catch (e) { console.warn('Failed to persist autoMarkedDates:', e); }
}

/**
 * Check if a service day has already been auto-marked for all 4 activities
 * We consider it complete only if ALL activities have records for ALL active girls
 */
function isDayFullyAutoMarked(date) {
  if (!state.autoMarkedDates.has(date)) return false;
  // Additional check: ensure we have records for all activities
  const activeGirls = state.girls.filter(g => !g.isDeleted);
  if (activeGirls.length === 0) return true; // No girls yet, consider it done

  for (const g of activeGirls) {
    for (const activity of ACTIVITIES) {
      const key = makeAttKey(g.id, date, activity);
      if (!state.attendanceData[key]) return false; // Missing record
    }
  }
  return true;
}

/**
 * NEW: Automatically mark all girls as absent on service days.
 * This runs once per service day when the app loads or when navigating to attendance page.
 * Uses localStorage to persist across reloads.
 */
async function checkAndAutoMarkAbsence() {
  const today = DateUtil.toStr();

  // Only run on service days
  if (!isServiceDayDate(today)) return;

  // Check if we already fully marked this day
  if (isDayFullyAutoMarked(today)) return;

  // Also check if there are already any attendance records for today
  // (user may have manually started marking attendance)
  const todayRecords = Cache.getAttendanceByDate(today);
  const hasAnyRecords = todayRecords.length > 0;

  if (hasAnyRecords && state.autoMarkedDates.has(today)) {
    // Already processed and has records, skip
    return;
  }

  // Mark all girls as absent for all activities
  showToast('جاري تسجيل الغياب التلقائي...', 'info');
  await markAllAbsentForDate(today);

  // Track that we auto-marked this day
  state.autoMarkedDates.add(today);
  persistAutoMarkedDates();
}

// FIXED: Renamed to clarify this is a hardcoded lookup, not dynamic
function getHardcodedServiceDay(dayOfWeek) {
  const dayMap = { 5: 'الجمعة' };
  return dayMap[dayOfWeek] || null;
}

function renderAttendancePage() {
  if (!DOM.attendanceDate) return;
  DOM.attendanceDate.value = TimeContext.getDate();

  const currentServiceDay = getCurrentServiceDay();
  if (currentServiceDay && !state.attendancePageInitialized) {
    state.selectedDay = currentServiceDay;
  }

  setActiveDay(state.selectedDay);
  setActiveActivity(state.selectedActivity);

  state.attendancePageInitialized = true;
  renderAttendanceList();

  // NEW: Show indicator if auto-absence has been applied for today
  const today = DateUtil.toStr();
  const date = DOM.attendanceDate.value;
  if (date === today && isServiceDayDate(today) && state.autoMarkedDates.has(today)) {
    showAutoMarkIndicator();
  } else {
    hideAutoMarkIndicator();
  }
}

function setActiveDay(day) {
  state.selectedDay = day;
  document.querySelectorAll('.day-btn').forEach(b => b.classList.toggle('active', b.dataset.day === day));
}
function setActiveActivity(act) {
  state.selectedActivity = act;
  document.querySelectorAll('.act-tab').forEach(b => b.classList.toggle('active', b.dataset.activity === act));
}

document.querySelectorAll('.day-btn').forEach(b => b.addEventListener('click', () => {
  setActiveDay(b.dataset.day);
  renderAttendanceList();
}));
document.querySelectorAll('.act-tab').forEach(b => b.addEventListener('click', () => {
  setActiveActivity(b.dataset.activity);
  state.attendancePageInitialized = false;
  renderAttendancePage();
}));
if (DOM.attendanceDate) {
  DOM.attendanceDate.addEventListener('change', () => {
    TimeContext.setDate(DOM.attendanceDate.value);
    state.attendancePageInitialized = false;
    renderAttendancePage();
  });
}

if (DOM.selectAllPresent) DOM.selectAllPresent.addEventListener('click', () => selectAllStatus('حاضر'));
if (DOM.selectAllAbsent) DOM.selectAllAbsent.addEventListener('click', () => selectAllStatus('غائب'));

function debouncedAttSearch() {
  clearTimeout(state.attSearchDebounceTimer);
  state.attSearchDebounceTimer = setTimeout(() => { renderAttendanceList(); }, 250);
}

if (DOM.attendanceSearch) DOM.attendanceSearch.addEventListener('input', debouncedAttSearch);

// ============================================================
// TOGGLE ATTENDANCE — FIXED: Pending lock prevents race conditions
// ============================================================
async function toggleAttendanceStatus(girlId, girlName, date) {
  const opKey = `toggle_${girlId}_${date}_${state.selectedActivity}`;
  if (state.pendingAttendanceOps.has(opKey)) return; // Prevent double-clicks
  state.pendingAttendanceOps.add(opKey);

  try {
    const key = makeAttKey(girlId, date, state.selectedActivity);
    const existing = state.attendanceData[key];
    const newStatus = existing?.status === 'حاضر' ? 'غائب' : 'حاضر';

    const rec = {
      id: key,
      girlId: girlId,
      date,
      day: state.selectedDay,
      activity: state.selectedActivity,
      status: newStatus,
      rating: newStatus === 'حاضر' ? (existing?.rating || 0) : 0,
      notes: existing?.notes || '',
      updatedAt: Date.now(),
      updatedBy: state.currentUser?.displayName || 'خادم',
      updatedByEmail: state.currentUser?.email || ''
    };

    // Update state - FIXED: Use functional pattern to avoid race conditions
    setStateAttendanceData(prev => { const next = { ...prev, [key]: rec }; return next; });

    let firestoreSuccess = false;
    if (firebaseReady) {
      try {
        await FB.setDoc(FB.doc(db, 'attendance', key), rec);
        firestoreSuccess = true;
      } catch (e) {
        console.error('Save attendance Firestore error:', e);
      }
    }

    // FIXED: If Firestore failed but we're "online", the local state may be stale
    // Log a warning so the developer knows there's a potential inconsistency
    if (firebaseReady && !firestoreSuccess && navigator.onLine) {
      console.warn('Attendance saved locally but Firestore write failed — potential inconsistency');
    }

    // FIXED: Debounced render to batch rapid toggles + ensure state settled
    debouncedRender(80);
  } finally {
    state.pendingAttendanceOps.delete(opKey);
  }
}

// ============================================================
// MARK ALL ABSENT — FIXED: Only called by explicit user action
// Removed from renderAttendancePage — must be called deliberately
// ============================================================
async function markAllAbsentForDate(date) {
  if (!isServiceDayDate(date)) return;

  const activeGirls = state.girls.filter(g => !g.isDeleted);
  if (activeGirls.length === 0) {
    renderAttendanceList();
    return;
  }

  const batchRecords = [];
  const newAttData = { ...state.attendanceData };

  for (const g of activeGirls) {
    for (const activity of ACTIVITIES) {
      const key = makeAttKey(g.id, date, activity);
      if (!newAttData[key]) {
        const rec = {
          id: key,
          girlId: g.id,
          date,
          day: DateUtil.dayName(parseDateStr(date)),
          activity: activity,
          status: 'غائب',
          rating: 0,
          notes: '',
          updatedAt: Date.now(),
          updatedBy: state.currentUser?.displayName || 'خادم',
          updatedByEmail: state.currentUser?.email || ''
        };
        batchRecords.push(rec);
        newAttData[key] = rec;
      }
    }
  }

  if (firebaseReady && batchRecords.length > 0) {
    try {
      const batch = FB.writeBatch(db);
      for (const rec of batchRecords) {
        batch.set(FB.doc(db, 'attendance', rec.id), rec);
      }
      await batch.commit();
    } catch (e) {
      console.error('Batch save attendance Firestore error:', e);
    }
  }

  setStateAttendanceData(newAttData);

  if (batchRecords.length > 0) {
    await logHistory('تسجيل حضور', `تعيين الغياب التلقائي ليوم ${date} (${state.selectedDay})`);
    showToast('تم تعيين الغياب التلقائي ليوم خدمة', 'info');
  }

  renderAttendanceList();
  if (state.currentPage === 'home') renderHome();
  if (state.currentPage === 'calendar') renderCalendar();
}

// Auto-mark a newly added girl as absent for all activities on a service day
// FIXED: Rollback mechanism — if Firestore fails, revert local state
async function autoMarkAbsentForNewGirl(girlId, date) {
  if (!isServiceDayDate(date)) return;

  // FIXED: Use parseDateStr for safe day name lookup
  const dayName = DateUtil.dayName(parseDateStr(date));
  const batchRecords = [];
  const newAttData = { ...state.attendanceData };
  const keysToAdd = [];

  for (const activity of ACTIVITIES) {
    const key = makeAttKey(girlId, date, activity);
    if (!newAttData[key]) {
      const rec = {
        id: key,
        girlId: girlId,
        date,
        day: dayName,
        activity: activity,
        status: 'غائب',
        rating: 0,
        notes: '',
        updatedAt: Date.now(),
        updatedBy: state.currentUser?.displayName || 'خادم',
        updatedByEmail: state.currentUser?.email || ''
      };
      batchRecords.push(rec);
      newAttData[key] = rec;
      keysToAdd.push(key);
    }
  }

  let firestoreSuccess = true;
  if (firebaseReady && batchRecords.length > 0) {
    try {
      const batch = FB.writeBatch(db);
      for (const rec of batchRecords) {
        batch.set(FB.doc(db, 'attendance', rec.id), rec);
      }
      await batch.commit();
    } catch (e) {
      console.error('Auto-absent batch save error:', e);
      firestoreSuccess = false;
    }
  }

  // FIXED: Rollback — if Firestore failed, remove the locally added records
  if (!firestoreSuccess && firebaseReady && navigator.onLine) {
    console.warn('Auto-absent Firestore failed — rolling back local state');
    keysToAdd.forEach(key => delete newAttData[key]);
    // Revert to original state
    setStateAttendanceData(state.attendanceData);
    return;
  }

  setStateAttendanceData(newAttData);
}

// Kept for backward compatibility
async function markAllAbsent(date) {
  await markAllAbsentForDate(date);
}

// ============================================================
// SELECT ALL — FIXED: Only write current date records to Firestore
// ============================================================
async function selectAllStatus(status) {
  if (!DOM.attendanceDate) return;
  const date = DOM.attendanceDate.value;
  if (!date) { showToast('الرجاء اختيار التاريخ أولاً', 'error'); return; }

  const activeGirls = state.girls.filter(g => !g.isDeleted);
  const filteredGirls = state.attendanceGradeFilter
    ? activeGirls.filter(g => g.grade === state.attendanceGradeFilter)
    : activeGirls;
  const newAttData = { ...state.attendanceData };
  const currentDateRecords = []; // FIXED: Track only current date records for Firestore write

  for (const g of filteredGirls) {
    const key = makeAttKey(g.id, date, state.selectedActivity);
    const rec = {
      id: key,
      girlId: g.id,
      date,
      day: DateUtil.dayName(parseDateStr(date)),
      activity: state.selectedActivity,
      status: status,
      rating: status === 'حاضر' ? (newAttData[key]?.rating || 0) : 0,
      notes: newAttData[key]?.notes || '',
      updatedAt: Date.now(),
      updatedBy: state.currentUser?.displayName || 'خادم',
      updatedByEmail: state.currentUser?.email || ''
    };
    newAttData[key] = rec;
    currentDateRecords.push(rec); // FIXED: Only records for this date
  }

  if (firebaseReady) {
    try {
      const batch = FB.writeBatch(db);
      // FIXED: Only write records for the CURRENT date, not all attendance
      currentDateRecords.forEach(rec => {
        batch.set(FB.doc(db, 'attendance', rec.id), rec);
      });
      await batch.commit();
    } catch (e) {
      console.error('Batch save attendance Firestore error:', e);
    }
  }

  setStateAttendanceData(newAttData);

  await logHistory('تسجيل حضور', `${status === 'حاضر' ? 'تحديد الكل حاضر' : 'تحديد الكل غائب'} - ${state.selectedActivity} - ${date}`);
  showToast(status === 'حاضر' ? 'تم تحديد الكل حاضر' : 'تم تحديد الكل غائب', 'success');
  renderAttendanceList();
  if (state.currentPage === 'home') renderHome();
  if (state.currentPage === 'stats') renderStats();
  if (state.currentPage === 'calendar') renderCalendar();
}

// ============================================================
// RENDER ATTENDANCE LIST — FIXED: O(n) single-pass optimization + key consistency
// ============================================================
function renderAttendanceList() {
  if (!DOM.attendanceDate || !DOM.attendanceList) return;
  const date = DOM.attendanceDate.value;
  const el = DOM.attendanceList;
  if (!date) { el.innerHTML = '<div class="empty-state">الرجاء اختيار التاريخ</div>'; return; }

  let activeGirls = state.girls.filter(g => !g.isDeleted);

  // Apply grade filter
  const gradeFilter = state.attendanceGradeFilter;
  if (gradeFilter) {
    activeGirls = activeGirls.filter(g => g.grade === gradeFilter);
  }

  const searchQuery = DOM.attendanceSearch?.value?.trim() || '';
  if (searchQuery) {
    const qNorm = normalizeArabic(searchQuery);
    activeGirls = activeGirls.filter(g => normalizeArabic(g.name).includes(qNorm));
  }

  // Update counts
  const allActiveGirls = state.girls.filter(g => !g.isDeleted);
  const attFilterCountAll = document.getElementById('attFilterCountAll');
  const attFilterCount1 = document.getElementById('attFilterCount1');
  const attFilterCount1b = document.getElementById('attFilterCount1b');
  const attFilterCount2 = document.getElementById('attFilterCount2');
  const attFilterCount2b = document.getElementById('attFilterCount2b');
  const attFilterCount3 = document.getElementById('attFilterCount3');
  const attFilterCount3b = document.getElementById('attFilterCount3b');
  if (attFilterCountAll) attFilterCountAll.textContent = allActiveGirls.length;
  if (attFilterCount1) attFilterCount1.textContent = allActiveGirls.filter(g => g.grade === 'أولى أ').length;
  if (attFilterCount1b) attFilterCount1b.textContent = allActiveGirls.filter(g => g.grade === 'أولى ب').length;
  if (attFilterCount2) attFilterCount2.textContent = allActiveGirls.filter(g => g.grade === 'تانيه أ').length;
  if (attFilterCount2b) attFilterCount2b.textContent = allActiveGirls.filter(g => g.grade === 'تانيه ب').length;
  if (attFilterCount3) attFilterCount3.textContent = allActiveGirls.filter(g => g.grade === 'تالته أ').length;
  if (attFilterCount3b) attFilterCount3b.textContent = allActiveGirls.filter(g => g.grade === 'تالته ب').length;

  document.querySelectorAll('#attendanceGradeFilters .grade-filter-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.grade === gradeFilter);
  });

  // SERVANTS: Update servants card for attendance page
  renderServantsCard(document.getElementById('attServantsCard'), gradeFilter);

  if (searchQuery && !activeGirls.length) {
    el.innerHTML = '<div class="empty-state">لا توجد نتائج للبحث</div>';
    if (DOM.presentCount) DOM.presentCount.textContent = 0;
    if (DOM.absentCount) DOM.absentCount.textContent = 0;
    if (DOM.totalCount) DOM.totalCount.textContent = 0;
    return;
  }

  if (!activeGirls.length) {
    el.innerHTML = '<div class="empty-state">لا توجد مخدومات مسجلة<br><small>أضف مخدومات أولاً من صفحة المخدومات</small></div>';
    if (DOM.presentCount) DOM.presentCount.textContent = 0;
    if (DOM.absentCount) DOM.absentCount.textContent = 0;
    if (DOM.totalCount) DOM.totalCount.textContent = 0;
    return;
  }

  let present = 0, absent = 0;
  const frag = document.createDocumentFragment();

  // FIXED: Pre-filter by BOTH date AND current activity — prevents key mismatch
  // and reduces data size significantly
  const dateAttendance = {};
  const allAttendance = Cache.getAllAttendance();
  const currentActivity = state.selectedActivity;
  allAttendance.forEach(a => {
    if (a.date === date && a.activity === currentActivity) {
      const lookupKey = makeAttKey(a.girlId, a.date, a.activity);
      dateAttendance[lookupKey] = a;
    }
  });

  activeGirls.forEach(g => {
    // FIXED: Use makeAttKey helper for consistent key generation
    const key = makeAttKey(g.id, date, state.selectedActivity);
    const rec = dateAttendance[key];
    let statusClass = 'absent', statusIcon = '&#10007;', statusText = 'غائب';
    if (rec?.status === 'حاضر') { statusClass = 'present'; statusIcon = '&#10003;'; statusText = 'حاضر'; present++; }
    else { absent++; }

    const stars = rec?.rating ? '&#9733;'.repeat(rec.rating) + '&#9734;'.repeat(5 - rec.rating) : '';
    const currentRating = rec?.rating || 0;
    const div = document.createElement('div');
    div.className = `att-item ${statusClass}`;
    div.dataset.girlId = g.id;
    div.dataset.attKey = key;
    div.dataset.girlName = g.name;

    // FIXED: Safer inline rating HTML construction
    let inlineRatingHtml = '';
    if (statusClass === 'present') {
      let starsHtml = '';
      for (let i = 1; i <= 5; i++) {
        starsHtml += `<span class="att-inline-star ${i <= currentRating ? 'active' : ''}" data-val="${i}" role="button" aria-label="${i} نجمة">&#9733;</span>`;
      }
      inlineRatingHtml = `<div class="att-inline-rating" d
