// ============================================================
// CONSOLIDATED APP — All modules merged into single file
// ============================================================

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import { getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult, onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';
import { getFirestore, collection, query, orderBy, onSnapshot, getDocs, doc, setDoc, deleteDoc, where, writeBatch } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import * as XLSX from 'https://cdn.sheetjs.com/xlsx-0.20.1/package/xlsx.mjs';



// ============================================================
// CORE: Firebase Config, State, Utils, IDB
// ============================================================

// ============================================================
// CORE: Firebase Config, State, Utils, IDB
// ============================================================


// Firebase Config
const firebaseConfig = {
  apiKey: "AIzaSyB2cycBTKMjVg8S_fBYN8C-hwUk5FUF81Q",
  authDomain: "kenesa-e5efd.firebaseapp.com",
  projectId: "kenesa-e5efd",
  storageBucket: "kenesa-e5efd.firebasestorage.app",
  messagingSenderId: "227273753184",
  appId: "1:227273753184:web:ecdf258142ad55ed5cf905",
  measurementId: "G-6HS8KNW1GZ"
};

const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);
const db = getFirestore(firebaseApp);

// ============================================================
// APP STATE
// ============================================================
const state = {
  currentUser: null,
  girls: [],
  attendanceData: {},
  attendanceArray: [], // cached array for performance
  currentPage: 'home',
  selectedDay: 'السبت',
  selectedActivity: 'دراسي',
  currentAttendanceGirlId: null,
  currentAttendanceRating: 0,
  editingGirlId: null,
  calendarDate: new Date(),
  isOnline: navigator.onLine,
  idb: null,
  appInitialized: false,
  unsubGirls: null,
  unsubAtt: null,
  renderTimeout: null,
  historyOffset: 0,
  historyAllLogs: [],
  deleteInProgress: false,
  savingGirl: false,
  homeGradeFilter: '',
  girlsGradeFilter: '',
  statsTimeFilter: 'month',
  statsGradeFilter: '',
  longPressTimer: null,
  isLongPress: false,
  longPressOpened: false,
  activityDetailTab: 'present',
  currentActivityDetail: null,
  currentProfileGirlId: null,
  searchDebounceTimer: null,
  attSearchDebounceTimer: null,
  delegationInitialized: false,
  statsCache: null,
  lastStatsMonth: null
};

// ============================================================
// CONSTANTS
// ============================================================
const HISTORY_PAGE_SIZE = 30;
const SERVICE_DAYS = { 'السبت': true, 'الاثنين': true, 'الاربعاء': true };
const DAY_NAMES = ['الأحد','الاثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'];
const ACTIVITIES = ['دراسي', 'محفوظات', 'قبطي', 'ألحان'];
const ACTIVITY_ICONS = { 'دراسي': '&#128216;', 'ألحان': '&#127925;', 'قبطي': '&#9961;', 'محفوظات': '&#128221;' };
const PERIOD_LABELS = { today: 'اليوم', month: 'هذا الشهر', year: 'هذه السنة', all: 'كل الفترات' };
const BATCH_SIZE = 400; // Firestore batch limit

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
// DATE UTILITIES
// ============================================================
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
  normalize(d) {
    return {
      'الأحد': 'الاحد', 'الاثنين': 'الاثنين', 'الثلاثاء': 'الثلاثاء',
      'الأربعاء': 'الاربعاء', 'الخميس': 'الخميس', 'الجمعة': 'الجمعة', 'السبت': 'السبت'
    }[d] || d;
  },
  // FIXED: parse date string to Date object for proper comparison
  parseDate(str) {
    if (!str) return null;
    const [y, m, d] = str.split('-').map(Number);
    return new Date(y, m - 1, d);
  },
  compareDates(a, b) {
    const da = this.parseDate(a);
    const db = this.parseDate(b);
    if (!da || !db) return 0;
    return da - db;
  }
};

// ============================================================
// ARABIC TEXT NORMALIZATION — FIXED: also removes spaces
// ============================================================
function normalizeArabic(str) {
  if (!str) return '';
  return str
    .replace(/[\u064B-\u065F\u0670\u0640]/g, '')
    .replace(/[إأآا]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/\s+/g, '') // FIXED: remove all spaces for unified search
    .toLowerCase();
}

// For display purposes (keep spaces, just normalize letters)
function normalizeArabicLetters(str) {
  if (!str) return '';
  return str
    .replace(/[\u064B-\u065F\u0670\u0640]/g, '')
    .replace(/[إأآا]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/ة/g, 'ه')
    .toLowerCase();
}

// ============================================================
// NAME NORMALIZATION (for duplicate detection)
// ============================================================
function normalizeName(name) {
  return name
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .toLowerCase();
}

// FIXED: Grade normalization before save
function normalizeGrade(grade) {
  if (!grade) return '';
  return normalizeArabicLetters(grade.trim());
}

// ============================================================
// CSV ESCAPE
// ============================================================
function csvEscape(v) {
  return `"${String(v ?? '').replace(/"/g, '""')}"`;
}

// ============================================================
// INDEXEDDB — FIXED: UUID-based IDs + cleanup support
// ============================================================
const IDB = {
  async open() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open('MakhdomatDB', 3); // bumped version for migration
      req.onupgradeneeded = e => {
        const d = e.target.result;
        ['girls', 'attendance', 'history', 'pending'].forEach(store => {
          if (!d.objectStoreNames.contains(store)) d.createObjectStore(store, { keyPath: 'id' });
        });
      };
      req.onsuccess = e => { state.idb = e.target.result; resolve(state.idb); };
      req.onerror = () => reject(req.error);
    });
  },
  async put(store, data) {
    return new Promise((res, rej) => {
      const tx = state.idb.transaction(store, 'readwrite');
      tx.objectStore(store).put(data);
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
    });
  },
  async getAll(store) {
    return new Promise((res, rej) => {
      const tx = state.idb.transaction(store, 'readonly');
      const req = tx.objectStore(store).getAll();
      req.onsuccess = () => res(req.result);
      req.onerror = () => rej(req.error);
    });
  },
  async get(store, id) {
    return new Promise((res, rej) => {
      const tx = state.idb.transaction(store, 'readonly');
      const req = tx.objectStore(store).get(id);
      req.onsuccess = () => res(req.result);
      req.onerror = () => rej(req.error);
    });
  },
  async delete(store, id) {
    return new Promise((res, rej) => {
      const tx = state.idb.transaction(store, 'readwrite');
      tx.objectStore(store).delete(id);
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
    });
  },
  async clear(store) {
    return new Promise((res, rej) => {
      const tx = state.idb.transaction(store, 'readwrite');
      tx.objectStore(store).clear();
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
    });
  }
};

// FIXED: Generate UUID for pending IDs to avoid collision
function generateId(prefix = 'id') {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

// ============================================================
// DOM SHORTCUTS
// ============================================================
const $ = (id) => document.getElementById(id);
const $$ = (sel, root = document) => root.querySelectorAll(sel);

// DOM Cache
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
  saveAttendanceBtn: $('saveAttendanceBtn'),
  girlsList: $('girlsList'), addGirlBtn: $('addGirlBtn'),
  calendarGrid: $('calendarGrid'), calMonthYear: $('calMonthYear'),
  dayDetail: $('dayDetail'), calPrev: $('calPrev'), calNext: $('calNext'),
  statsMonth: $('statsMonth'), bigStatsGrid: $('bigStatsGrid'),
  absenceChart: $('absenceChart'), attendanceRanking: $('attendanceRanking'),
  activityStatsGrid: $('activityStatsGrid'), timeFilterTabs: $('timeFilterTabs'),
  activityStatsPeriod: $('activityStatsPeriod'),
  historyList: $('historyList'), historyFilter: $('historyFilter'),
  clearHistoryBtn: $('clearHistoryBtn'), loadMoreHistory: $('loadMoreHistory'),
  loadMoreHistoryBtn: $('loadMoreHistoryBtn'), exportMonth: $('exportMonth'),
  exportCSV: $('exportCSV'), exportJSON: $('exportJSON'), exportPrint: $('exportPrint'),
  girlModal: $('girlModal'), girlModalTitle: $('girlModalTitle'),
  girlName: $('girlName'), girlPhone: $('girlPhone'), girlGrade: $('girlGrade'),
  girlNotes: $('girlNotes'), deleteGirlBtn: $('deleteGirlBtn'),
  homeGradeFilters: $('homeGradeFilters'), girlsGradeFilters: $('girlsGradeFilters'),
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
  activityDetailTotal: $('activityDetailTotal'),
  activityDetailTabs: $('activityDetailTabs'),
  activityDetailList: $('activityDetailList'),
  presentTabCount: $('presentTabCount'),
  absentTabCount: $('absentTabCount'),
  menuBtn: $('menuBtn'), signOutBtn: $('signOutBtn'), googleSignIn: $('googleSignIn'),
  darkModeToggle: $('darkModeToggle'), darkToggleSwitch: $('darkToggleSwitch'),
  shareProfileBtn: $('shareProfileBtn'), editProfileBtn: $('editProfileBtn'),
  statsGradeFilter: $('statsGradeFilter'),
  activityStatsGrade: $('activityStatsGrade')
};

// ============================================================
// TOAST
// ============================================================
let toastTimeout;
function showToast(msg, type = 'info') {
  clearTimeout(toastTimeout);
  DOM.toast.textContent = msg;
  DOM.toast.className = `toast show ${type}`;
  toastTimeout = setTimeout(() => { DOM.toast.className = 'toast hidden'; }, 3000);
}

// ============================================================
// SPLASH
// ============================================================
let splashDone = false;
function hideSplash() {
  if (splashDone) return;
  splashDone = true;
  DOM.splash.classList.add('fade-out');
  setTimeout(() => { if (DOM.splash) DOM.splash.remove(); }, 500);
}

// ضمان إخفاء splash بعد 5 ثوانٍ كحد أقصى
// حتى لو لم يستجب Firebase
setTimeout(() => hideSplash(), 5000);

// ============================================================
// GRADE MAP for normalization
// ============================================================
const GRADE_ALIASES = {
  'اولي اعدادي': 'أولى إعدادي',
  'أولى اعدادي': 'أولى إعدادي',
  'أولى': 'أولى إعدادي',
  'اولى': 'أولى إعدادي',
  '1 اعدادي': 'أولى إعدادي',
  '١ اعدادي': 'أولى إعدادي',
  'تانيه اعدادي': 'تانية إعدادي',
  'تانية اعدادي': 'تانية إعدادي',
  'تانيه': 'تانية إعدادي',
  'تانية': 'تانية إعدادي',
  '٢ اعدادي': 'تانية إعدادي',
  '2 اعدادي': 'تانية إعدادي',
  'تالته اعدادي': 'تالتة إعدادي',
  'تالتة اعدادي': 'تالتة إعدادي',
  'تالته': 'تالتة إعدادي',
  'تالتة': 'تالتة إعدادي',
  '٣ اعدادي': 'تالتة إعدادي',
  '3 اعدادي': 'تالتة إعدادي',
};

function standardizeGrade(grade) {
  if (!grade) return '';
  const normalized = normalizeArabicLetters(grade.trim());
  return GRADE_ALIASES[normalized] || grade.trim();
}


// ============================================================
// HISTORY: Logging
// ============================================================

// ============================================================
// HISTORY PAGE — FIXED: log toggleAttendanceStatus calls
// ============================================================


// ============================================================
// RENDER HISTORY
// ============================================================
async function renderHistory(append = false) {
  const el = DOM.historyList;
  const filter = DOM.historyFilter?.value || '';

  if (!append) {
    el.innerHTML = '<div class="empty-state">جارٍ التحميل...</div>';
    state.historyOffset = 0;
    if (state.idb) {
      const logs = await IDB.getAll('history');
      logs.sort((a, b) => b.timestamp - a.timestamp);
      state.historyAllLogs = filter ? logs.filter(l => l.action.includes(filter)) : logs;
    } else {
      state.historyAllLogs = [];
    }
  }

  if (!state.historyAllLogs.length) {
    el.innerHTML = '<div class="empty-state">لا توجد سجلات تاريخية</div>';
    DOM.loadMoreHistory.classList.add('hidden');
    return;
  }

  const slice = state.historyAllLogs.slice(state.historyOffset, state.historyOffset + HISTORY_PAGE_SIZE);
  state.historyOffset += slice.length;

  const html = slice.map(log => `
    <div class="history-item">
      <div class="history-icon">${getHistoryIcon(log.action)}</div>
      <div class="history-info">
        <span class="history-action">${esc(log.action)}</span>
        <span class="history-detail">${esc(log.detail)}</span>
        <span class="history-meta">${esc(log.by)} &middot; ${new Date(log.timestamp).toLocaleString('ar-EG')}</span>
      </div>
    </div>`).join('');

  if (!append) el.innerHTML = html;
  else el.insertAdjacentHTML('beforeend', html);

  DOM.loadMoreHistory.classList.toggle('hidden', state.historyOffset >= state.historyAllLogs.length);
}

// ============================================================
// LOG HISTORY — FIXED: UUID-based IDs
// ============================================================
async function logHistory(action, detail) {
  const log = {
    id: generateId('log'),
    action, detail,
    by: state.currentUser?.displayName || 'خادم',
    byEmail: state.currentUser?.email || '',
    timestamp: Date.now()
  };
  if (state.idb) await IDB.put('history', log);
  if (state.isOnline) {
    try { await setDoc(doc(db, 'history', log.id), log); } catch (e) { }
  }
}

// ============================================================
// CLEAR HISTORY
// ============================================================
function setupHistoryListeners() {
  DOM.clearHistoryBtn.addEventListener('click', () => {
    showConfirm({
      icon: '&#9888;', title: 'مسح السجل التاريخي',
      msg: 'هل أنت متأكد؟ سيتم مسح كل السجلات نهائياً ولا يمكن التراجع.',
      okLabel: 'مسح الكل',
      onOk: async () => {
        if (state.idb) await IDB.clear('history');
        state.historyAllLogs = [];
        if (state.isOnline) {
          try {
            const snap = await getDocs(collection(db, 'history'));
            if (snap.docs.length) {
              for (let i = 0; i < snap.docs.length; i += 400) {
                const batch = writeBatch(db);
                snap.docs.slice(i, i + 400).forEach(d => batch.delete(d.ref));
                await batch.commit();
              }
            }
          } catch (e) { console.error('Firestore clear history error:', e); }
        }
        showToast('تم مسح السجل التاريخي', 'success');
        renderHistory(false);
      }
    });
  });
}

function getHistoryIcon(action) {
  if (action.includes('إضافة')) return '&#10133;';
  if (action.includes('تعديل')) return '&#9999;';
  if (action.includes('حذف')) return '&#10060;';
  if (action.includes('حضور')) return '&#128203;';
  return '&#128221;';
}



// ============================================================
// SYNC: Online/Offline, Pending Queue
// ============================================================

// ============================================================
// SYNC: Online/Offline, Pending Queue, Batch Operations
// ============================================================


// ============================================================
// ONLINE / OFFLINE
// ============================================================
function updateSyncUI() {
  const { syncIndicator, offlineBadge } = state;
  // Use DOM references from state or fallback
  const si = syncIndicator || document.getElementById('syncIndicator');
  const ob = offlineBadge || document.getElementById('offlineBadge');
  if (!si || !ob) return;

  if (state.isOnline) {
    si.classList.remove('offline');
    si.classList.add('online');
    ob.classList.remove('show');
  } else {
    si.classList.remove('online');
    si.classList.add('offline');
    ob.classList.add('show');
  }
}

function setupConnectivityListeners() {
  window.addEventListener('online', () => {
    state.isOnline = true;
    updateSyncUI();
    syncPending();
    showToast('تم الاتصال بالإنترنت - جارٍ المزامنة', 'success');
  }, { passive: true });

  window.addEventListener('offline', () => {
    state.isOnline = false;
    updateSyncUI();
    showToast('أنت في وضع عدم الاتصال - سيتم الحفظ محلياً', 'warning');
  }, { passive: true });
}

// ============================================================
// PENDING QUEUE — FIXED: UUID + cleanup after sync
// ============================================================
async function addPending(type, data) {
  if (!state.idb) return;
  await IDB.put('pending', { id: generateId('pending'), type, data });
}

// FIXED: Add pending delete for offline support
async function addPendingDelete(collectionName, docId) {
  if (!state.idb) return;
  await IDB.put('pending', {
    id: generateId('pending'),
    type: 'delete',
    collection: collectionName,
    docId: docId
  });
}

// FIXED: Sync pending with cleanup, dedup, and delete support
async function syncPending() {
  if (!state.idb || !state.isOnline) return;
  try {
    const pending = await IDB.getAll('pending');
    if (!pending.length) return;

    // Deduplicate by type+id to avoid double-sync
    const seen = new Set();
    const unique = [];
    for (const item of pending) {
      const dedupKey = item.type === 'delete'
        ? `delete_${item.collection}_${item.docId}`
        : `${item.type}_${item.data?.id || item.id}`;
      if (!seen.has(dedupKey)) {
        seen.add(dedupKey);
        unique.push(item);
      }
    }

    let count = 0;
    for (const item of unique) {
      try {
        if (item.type === 'girl') {
          await setDoc(doc(db, 'girls', item.data.id), item.data);
        } else if (item.type === 'attendance') {
          await setDoc(doc(db, 'attendance', item.data.id), item.data);
        } else if (item.type === 'delete') {
          // FIXED: Handle offline deletes
          await deleteDoc(doc(db, item.collection, item.docId));
        } else if (item.type === 'delete_girl') {
          await setDoc(doc(db, 'girls', item.data.id), item.data.update, { merge: true });
          const attQuery = query(collection(db, 'attendance'), where('girlId', '==', item.data.id));
          const attSnap = await getDocs(attQuery);
          if (attSnap.docs.length) {
            for (let i = 0; i < attSnap.docs.length; i += BATCH_SIZE) {
              const batch = writeBatch(db);
              attSnap.docs.slice(i, i + BATCH_SIZE).forEach(d => batch.delete(d.ref));
              await batch.commit();
            }
          }
        }
        // FIXED: Delete from pending after successful sync
        await IDB.delete('pending', item.id);
        count++;
      } catch (e) { console.error('Sync item error:', e); }
    }
    if (count > 0) showToast(`تمت مزامنة ${count} سجل`, 'success');
  } catch (e) { console.error('Sync error:', e); }
}

// ============================================================
// BATCH OPERATIONS — FIXED: chunked batches (400 limit)
// ============================================================
async function batchSaveAttendance(records) {
  if (!records.length) return;

  // Save to state and IDB first
  for (const rec of records) {
    state.attendanceData[rec.id] = rec;
    if (state.idb) await IDB.put('attendance', rec);
  }

  // Sync to Firestore in chunks
  if (state.isOnline && records.length > 0) {
    try {
      for (let i = 0; i < records.length; i += BATCH_SIZE) {
        const batch = writeBatch(db);
        const chunk = records.slice(i, i + BATCH_SIZE);
        for (const rec of chunk) {
          batch.set(doc(db, 'attendance', rec.id), rec);
        }
        await batch.commit();
      }
    } catch (e) {
      for (const rec of records) {
        await addPending('attendance', rec);
      }
    }
  } else if (records.length > 0) {
    for (const rec of records) {
      await addPending('attendance', rec);
    }
  }
}

// Throttle utility for button clicks
function throttle(fn, delay) {
  let last = 0;
  return function(...args) {
    const now = Date.now();
    if (now - last < delay) return;
    last = now;
    return fn.apply(this, args);
  };
}


// ============================================================
// DATA: Firestore Listeners, Loading
// ============================================================

// ============================================================
// DATA: Firestore Listeners, Loading, State Management
// ============================================================


// ============================================================
// FIREBASE LISTENERS LIFECYCLE
// ============================================================
function stopListeners() {
  if (state.unsubGirls) { state.unsubGirls(); state.unsubGirls = null; }
  if (state.unsubAtt) { state.unsubAtt(); state.unsubAtt = null; }
}

// ============================================================
// LOAD DATA — WhatsApp-like real-time sync
// ============================================================
async function loadData() {
  try {
    // Load from IndexedDB first for instant render
    if (state.idb) {
      const localGirls = await IDB.getAll('girls');
      if (localGirls.length) {
        state.girls = localGirls.filter(g => !g.isDeleted);
        renderPage();
      }
      const localAtt = await IDB.getAll('attendance');
      localAtt.forEach(a => { state.attendanceData[a.id] = a; });
      updateAttendanceArray();
      renderPage();
    }
    if (!state.isOnline) return;

    // History once
    try {
      const histSnap = await getDocs(query(collection(db, 'history'), orderBy('timestamp', 'desc')));
      for (const d of histSnap.docs) await IDB.put('history', { id: d.id, ...d.data() });
    } catch (e) { console.error('History sync error:', e); }

    // Live girls — real-time
    state.unsubGirls = onSnapshot(query(collection(db, 'girls'), orderBy('name')), async snap => {
      let changed = false;
      for (const change of snap.docChanges()) {
        const g = { id: change.doc.id, ...change.doc.data() };
        if (change.type === 'removed' || g.isDeleted) {
          state.girls = state.girls.filter(x => x.id !== g.id);
          if (state.idb) await IDB.delete('girls', g.id);
          changed = true;
        } else {
          if (state.idb) await IDB.put('girls', g);
          const idx = state.girls.findIndex(x => x.id === g.id);
          idx >= 0 ? (state.girls[idx] = g) : state.girls.push(g);
          changed = true;
        }
      }
      state.girls.sort((a, b) => a.name.localeCompare(b.name, 'ar'));
      if (changed) scheduleRender();
    });

    // Live attendance — real-time
    state.unsubAtt = onSnapshot(query(collection(db, 'attendance'), orderBy('date', 'desc')), async snap => {
      let changed = false;
      for (const change of snap.docChanges()) {
        const a = { id: change.doc.id, ...change.doc.data() };
        if (change.type === 'removed') {
          delete state.attendanceData[a.id];
          if (state.idb) await IDB.delete('attendance', a.id);
          changed = true;
        } else {
          state.attendanceData[a.id] = a;
          if (state.idb) await IDB.put('attendance', a);
          changed = true;
        }
      }
      if (changed) {
        updateAttendanceArray();
        scheduleRender();
      }
    });
  } catch (e) { console.error('Load error:', e); }
}

// ============================================================
// ATTENDANCE ARRAY CACHE — FIXED: update only on add/remove
// ============================================================
function updateAttendanceArray() {
  state.attendanceArray = Object.values(state.attendanceData);
}

// ============================================================
// RENDER ENGINE (debounced)
// ============================================================
function scheduleRender() {
  clearTimeout(state.renderTimeout);
  state.renderTimeout = setTimeout(() => renderPage(), 60);
}

// ============================================================
// SAVE GIRL — with grade normalization
// ============================================================

async function saveGirlToFirebase(girlData) {
  if (state.isOnline) {
    try { await setDoc(doc(db, 'girls', girlData.id), girlData); }
    catch (e) { await addPending('girl', girlData); }
  } else {
    await addPending('girl', girlData);
  }
}

function validateGirl(name, grade) {
  if (!name || !name.trim()) return 'الرجاء إدخال اسم المخدومة';
  if (!grade) return 'الرجاء اختيار السنة الدراسية';
  if (name.trim().length < 2) return 'الاسم قصير جداً';
  return null;
}

function checkDuplicateGirl(name, excludeId) {
  const normalizedName = normalizeName(name);
  return state.girls.find(g =>
    normalizeName(g.name) === normalizedName && g.id !== excludeId && !g.isDeleted
  );
}

function createGirlData({ name, phone, grade, notes, editingId }) {
  const id = editingId || generateId('girl');
  const now = Date.now();
  return {
    id,
    name: name.trim(),
    phone: phone || '',
    grade: standardizeGrade(grade), // FIXED: normalize grade
    notes: notes || '',
    createdAt: editingId ? (state.girls.find(g => g.id === editingId)?.createdAt || now) : now,
    updatedAt: now,
    updatedBy: state.currentUser?.displayName || 'خادم',
    updatedByEmail: state.currentUser?.email || '',
    isDeleted: false
  };
}


// ============================================================
// EXPORT: Export functionality
// ============================================================

// ============================================================
// EXPORT PAGE — FIXED: include all girls, iframe print
// ============================================================


function renderExport() {
  if (!DOM.exportMonth.value) DOM.exportMonth.value = DateUtil.getMonthStr();
}

function setupExportListeners() {
  DOM.exportCSV.addEventListener('click', exportCSV);
  DOM.exportJSON.addEventListener('click', exportJSON);
  DOM.exportPrint.addEventListener('click', exportPrint);
}

// ============================================================
// CSV/Excel EXPORT — FIXED: include ALL girls even with no attendance
// ============================================================
function exportCSV() {
  const month = DOM.exportMonth.value;
  const activeGirls = state.girls.filter(g => !g.isDeleted);
  const activeGirlIds = new Set(activeGirls.map(g => g.id));
  let monthAtt = state.attendanceArray.filter(a =>
    a.date?.startsWith(month) && activeGirlIds.has(a.girlId)
  );

  const monthName = DateUtil.formatMonth(month);
  monthAtt.sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    return (a.activity || '').localeCompare(b.activity || '', 'ar');
  });

  const totalPresent = monthAtt.filter(a => a.status === 'حاضر').length;
  const totalAbsent = monthAtt.filter(a => a.status === 'غائب').length;

  // FIXED: Start with ALL girls, not just those with attendance
  const grouped = {};
  activeGirls.forEach(g => {
    grouped[g.id] = {
      name: g.name,
      grade: g.grade,
      'دراسي': { present: 0, absent: 0 },
      'قبطي': { present: 0, absent: 0 },
      'محفوظات': { present: 0, absent: 0 },
      'ألحان': { present: 0, absent: 0 },
      totalPresent: 0,
      totalAbsent: 0
    };
  });

  monthAtt.forEach(a => {
    if (!grouped[a.girlId]) return;
    if (a.status === 'حاضر') {
      if (grouped[a.girlId][a.activity]) grouped[a.girlId][a.activity].present++;
      grouped[a.girlId].totalPresent++;
    } else {
      if (grouped[a.girlId][a.activity]) grouped[a.girlId][a.activity].absent++;
      grouped[a.girlId].totalAbsent++;
    }
  });

  const fmtAtt = (act) => {
    const total = act.present + act.absent;
    if (total === 0) return '—';
    if (act.present === total) return '✔';
    if (act.present === 0) return '✘';
    return act.present + '/' + total;
  };

  const wsData = [];
  wsData.push(['تقرير حضور ' + monthName]);
  wsData.push([]);
  wsData.push(['عدد المخدومات', activeGirls.length]);
  wsData.push(['إجمالي الحضور', totalPresent]);
  wsData.push(['إجمالي الغياب', totalAbsent]);
  wsData.push([]);
  wsData.push(['الاسم', 'السنة', 'دراسي', 'قبطي', 'محفوظات', 'ألحان', 'إجمالي الحضور', 'إجمالي الغياب', 'النسبة']);

  Object.values(grouped).forEach(r => {
    const total = r.totalPresent + r.totalAbsent;
    const rate = total > 0 ? Math.round((r.totalPresent / total) * 100) + '%' : '0%';
    wsData.push([r.name, r.grade, fmtAtt(r['دراسي']), fmtAtt(r['قبطي']), fmtAtt(r['محفوظات']), fmtAtt(r['ألحان']), r.totalPresent, r.totalAbsent, rate]);
  });

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(wsData);
  ws['!cols'] = [{ wch: 28 }, { wch: 14 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 14 }, { wch: 12 }, { wch: 10 }];
  ws['!dir'] = 'rtl';
  XLSX.utils.book_append_sheet(wb, ws, monthName);

  const xlsxBlob = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([xlsxBlob], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `حضور_${month}.xlsx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  showToast('تم تصدير Excel', 'success');
}

// ============================================================
// JSON EXPORT
// ============================================================
function exportJSON() {
  const month = DOM.exportMonth.value;
  const activeGirlIds = new Set(state.girls.filter(g => !g.isDeleted).map(g => g.id));
  const monthAtt = state.attendanceArray.filter(a =>
    a.date?.startsWith(month) && activeGirlIds.has(a.girlId)
  );
  const payload = {
    month,
    girls: state.girls.filter(g => !g.isDeleted),
    attendance: monthAtt,
    exportedAt: new Date().toISOString()
  };
  downloadFile(`بيانات_${month}.json`, JSON.stringify(payload, null, 2), 'application/json');
  showToast('تم تصدير JSON', 'success');
}

// ============================================================
// PRINT EXPORT — FIXED: use iframe instead of window.open
// ============================================================
function exportPrint() {
  const month = DOM.exportMonth.value;
  const activeGirls = state.girls.filter(g => !g.isDeleted);
  const activeGirlIds = new Set(activeGirls.map(g => g.id));
  let monthAtt = state.attendanceArray.filter(a =>
    a.date?.startsWith(month) && activeGirlIds.has(a.girlId)
  );

  const presents = monthAtt.filter(a => a.status === 'حاضر').length;
  const absents = monthAtt.filter(a => a.status === 'غائب').length;

  // FIXED: Include all girls
  const grouped = {};
  activeGirls.forEach(g => {
    grouped[g.id] = {
      name: g.name,
      grade: g.grade,
      'دراسي': { present: 0, absent: 0 },
      'قبطي': { present: 0, absent: 0 },
      'محفوظات': { present: 0, absent: 0 },
      'ألحان': { present: 0, absent: 0 },
      totalPresent: 0,
      totalAbsent: 0
    };
  });

  monthAtt.forEach(a => {
    if (!grouped[a.girlId]) return;
    if (a.status === 'حاضر') {
      if (grouped[a.girlId][a.activity]) grouped[a.girlId][a.activity].present++;
      grouped[a.girlId].totalPresent++;
    } else {
      if (grouped[a.girlId][a.activity]) grouped[a.girlId][a.activity].absent++;
      grouped[a.girlId].totalAbsent++;
    }
  });

  const fmtAttPrint = (act) => {
    const total = act.present + act.absent;
    if (total === 0) return '<span style="color:#999">—</span>';
    if (act.present === total) return '<span style="color:#2ecc71;font-weight:700">✔</span>';
    if (act.present === 0) return '<span style="color:#e74c3c;font-weight:700">✘</span>';
    return act.present + '/' + total;
  };

  const htmlRows = Object.values(grouped).map((r, i) => {
    const total = r.totalPresent + r.totalAbsent;
    const rate = total > 0 ? Math.round((r.totalPresent / total) * 100) + '%' : '0%';
    return `<tr>
      <td>${i + 1}</td>
      <td>${esc(r.name)}</td>
      <td>${esc(r.grade)}</td>
      <td>${fmtAttPrint(r['دراسي'])}</td>
      <td>${fmtAttPrint(r['قبطي'])}</td>
      <td>${fmtAttPrint(r['محفوظات'])}</td>
      <td>${fmtAttPrint(r['ألحان'])}</td>
      <td>${r.totalPresent}</td>
      <td>${r.totalAbsent}</td>
      <td>${rate}</td>
    </tr>`;
  }).join('');

  const html = `<!DOCTYPE html><html lang="ar" dir="rtl">
    <head><meta charset="UTF-8"><title>تقرير ${month}</title>
    <link href="https://fonts.googleapis.com/css2?family=Tajawal:wght@400;700&display=swap" rel="stylesheet">
    <style>body{font-family:Tajawal,sans-serif;direction:rtl;padding:20px}
    h1{color:#1a2744;border-bottom:2px solid #1a2744;padding-bottom:10px}
    .summary{display:flex;gap:20px;margin:15px 0;flex-wrap:wrap}
    .sum-box{background:#f0f2f8;border-radius:10px;padding:12px 20px;text-align:center}
    .sum-box b{font-size:24px;color:#1a2744}
    .sum-box span{font-size:13px;color:#6b7a99}
    table{width:100%;border-collapse:collapse;margin-top:20px}
    th,td{border:1px solid #ddd;padding:8px;text-align:right;font-size:13px}
    th{background:#1a2744;color:white}
    .present{color:green}.absent{color:red}
    .footer{margin-top:20px;font-size:12px;color:#6b7a99;border-top:1px solid #e2e8f0;padding-top:10px}
    @media print{body{padding:10px}}
    </style></head><body>
    <h1>تقرير متابعة المخدومات - ${DateUtil.formatMonth(month)}</h1>
    <div class="summary">
      <div class="sum-box"><b>${activeGirls.length}</b><br><span>عدد المخدومات</span></div>
      <div class="sum-box"><b>${presents}</b><br><span>حالات الحضور</span></div>
      <div class="sum-box"><b>${absents}</b><br><span>حالات الغياب</span></div>
      <div class="sum-box"><b>${Object.values(grouped).filter(r => r.totalPresent + r.totalAbsent > 0).length}</b><br><span>مخدومات مشاركة</span></div>
    </div>
    <table>
      <tr><th>#</th><th>الاسم</th><th>السنة</th><th>دراسي</th><th>قبطي</th><th>محفوظات</th><th>ألحان</th><th>الحضور</th><th>الغياب</th><th>النسبة</th></tr>
      ${htmlRows}
    </table>
    <div class="footer">تاريخ التصدير: ${new Date().toLocaleDateString('ar-EG')} | نظام متابعة المخدومات</div>
    </body></html>`;

  // FIXED: Use iframe for print instead of window.open
  let iframe = document.getElementById('printIframe');
  if (!iframe) {
    iframe = document.createElement('iframe');
    iframe.id = 'printIframe';
    iframe.className = 'print-iframe';
    document.body.appendChild(iframe);
  }
  iframe.contentDocument.open();
  iframe.contentDocument.write(html);
  iframe.contentDocument.close();
  iframe.onload = () => {
    iframe.contentWindow.print();
  };
  // Fallback if onload doesn't fire
  setTimeout(() => {
    if (iframe.contentWindow) iframe.contentWindow.print();
  }, 500);
}

function downloadFile(filename, content, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}


// ============================================================
// GIRLS: CRUD, Profile
// ============================================================

// ============================================================
// GIRLS PAGE — CRUD, Profile, Grade Normalization
// ============================================================


// ============================================================
// RENDER GIRLS LIST
// ============================================================
function renderGirlsList() {
  const filter = state.girlsGradeFilter;
  const activeGirls = state.girls.filter(g => !g.isDeleted);
  const filtered = filter ? activeGirls.filter(g => g.grade === filter) : activeGirls;
  const el = DOM.girlsList;

  document.getElementById('girlsFilterCountAll').textContent = activeGirls.length;
  document.getElementById('girlsFilterCount1').textContent = activeGirls.filter(g => g.grade === 'أولى إعدادي').length;
  document.getElementById('girlsFilterCount2').textContent = activeGirls.filter(g => g.grade === 'تانية إعدادي').length;
  document.getElementById('girlsFilterCount3').textContent = activeGirls.filter(g => g.grade === 'تالتة إعدادي').length;

  $$('#girlsGradeFilters .grade-filter-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.grade === filter);
  });

  if (!filtered.length) {
    el.innerHTML = '<div class="empty-state">لا توجد مخدومات<br><small>اضغط + لإضافة مخدومة جديدة</small></div>';
    return;
  }

  const monthStr = DateUtil.getMonthStr(new Date());
  const frag = document.createDocumentFragment();

  filtered.forEach(g => {
    const presents = state.attendanceArray.filter(a =>
      a.girlId === g.id && a.date?.startsWith(monthStr) && a.status === 'حاضر'
    ).length;
    const absents = state.attendanceArray.filter(a =>
      a.girlId === g.id && a.date?.startsWith(monthStr) && a.status === 'غائب'
    ).length;

    const div = document.createElement('div');
    div.className = 'girl-card';
    div.dataset.girlId = g.id;
    div.innerHTML = `
      <div class="girl-avatar">${esc(g.name[0])}</div>
      <div class="girl-info">
        <span class="girl-name">${esc(g.name)}</span>
        <span class="girl-grade">${esc(g.grade)}</span>
        <div class="girl-stats"><span class="green-text">&#10003;${presents}</span><span class="red-text">&#10007;${absents}</span></div>
      </div>
      <button class="edit-btn" data-girl-id="${esc(g.id)}" aria-label="تعديل ${esc(g.name)}">&#9999;</button>`;
    frag.appendChild(div);
  });

  el.innerHTML = '';
  el.appendChild(frag);
}

// ============================================================
// ADD/EDIT GIRL — FIXED: grade normalization
// ============================================================
function setupGirlsListeners() {
  DOM.addGirlBtn.addEventListener('click', () => {
    state.editingGirlId = null;
    DOM.girlModalTitle.textContent = 'إضافة مخدومة';
    DOM.girlName.value = '';
    DOM.girlPhone.value = '';
    DOM.girlGrade.value = '';
    DOM.girlNotes.value = '';
    DOM.deleteGirlBtn.classList.add('hidden');
    openModal('girlModal');
  });

  DOM.saveGirlBtn.addEventListener('click', saveGirl);
  DOM.deleteGirlBtn.addEventListener('click', deleteGirl);
  DOM.shareProfileBtn.addEventListener('click', shareProfile);
  DOM.editProfileBtn.addEventListener('click', () => {
    closeModal('girlProfileModal');
    if (state.currentProfileGirlId) editGirl(state.currentProfileGirlId);
  });
}

async function saveGirl() {
  if (state.savingGirl) return;
  state.savingGirl = true;
  try {
    const name = DOM.girlName.value.trim();
    const phone = DOM.girlPhone.value.trim();
    const grade = DOM.girlGrade.value;
    const notes = DOM.girlNotes.value.trim();

    if (!name) { showToast('الرجاء إدخال اسم المخدومة', 'error'); return; }
    if (!grade) { showToast('الرجاء اختيار السنة الدراسية', 'error'); return; }

    const normalizedName = normalizeName(name);
    const existingGirl = state.girls.find(g =>
      normalizeName(g.name) === normalizedName && g.id !== state.editingGirlId && !g.isDeleted
    );
    if (existingGirl) {
      showToast('هذه المخدومة موجودة بالفعل', 'error'); return;
    }

    // FIXED: normalize grade before saving
    const id = state.editingGirlId || generateId('girl');
    const now = Date.now();
    const girlData = {
      id, name, phone, grade: standardizeGrade(grade), notes,
      createdAt: state.editingGirlId ? (state.girls.find(g => g.id === state.editingGirlId)?.createdAt || now) : now,
      updatedAt: now,
      updatedBy: state.currentUser?.displayName || 'خادم',
      updatedByEmail: state.currentUser?.email || '',
      isDeleted: false
    };

    if (state.idb) await IDB.put('girls', girlData);
    if (state.editingGirlId) {
      state.girls = state.girls.map(g => g.id === id ? girlData : g);
    } else {
      state.girls.push(girlData);
    }

    await logHistory(state.editingGirlId ? 'تعديل مخدومة' : 'إضافة مخدومة', `${name} - ${girlData.grade}`);

    if (state.isOnline) {
      try { await setDoc(doc(db, 'girls', id), girlData); }
      catch (e) { await addPending('girl', girlData); }
    } else {
      await addPending('girl', girlData);
    }

    closeModal('girlModal');
    showToast(state.editingGirlId ? 'تم تعديل البيانات' : 'تمت إضافة المخدومة', 'success');
    state.editingGirlId = null;
    renderGirlsList();
  } finally {
    state.savingGirl = false;
  }
}

function editGirl(id) {
  const g = state.girls.find(x => x.id === id);
  if (!g || g.isDeleted) return;
  state.editingGirlId = id;
  DOM.girlModalTitle.textContent = 'تعديل بيانات المخدومة';
  DOM.girlName.value = g.name;
  DOM.girlPhone.value = g.phone || '';
  DOM.girlGrade.value = g.grade;
  DOM.girlNotes.value = g.notes || '';
  DOM.deleteGirlBtn.classList.remove('hidden');
  openModal('girlModal');
}

// ============================================================
// DELETE GIRL — with batch chunking for attendance cleanup
// ============================================================
async function deleteGirl() {
  if (!state.editingGirlId || state.deleteInProgress) return;
  const g = state.girls.find(x => x.id === state.editingGirlId);
  if (!g) return;

  closeModal('girlModal');

  showConfirm({
    icon: '&#9888;', title: 'حذف مخدومة',
    msg: `هل أنت متأكد من حذف "${esc(g.name)}"؟ سيتم حذف جميع بيانات الحضور الخاصة بها أيضاً.`,
    okLabel: 'حذف',
    okClass: 'confirm-delete',
    onOk: async () => {
      if (state.deleteInProgress) return;
      state.deleteInProgress = true;
      try {
        const id = state.editingGirlId;

        // 1. Remove from state
        state.girls = state.girls.filter(x => x.id !== id);

        // 2. Remove attendance records
        const attKeys = Object.keys(state.attendanceData).filter(k => state.attendanceData[k].girlId === id);
        attKeys.forEach(k => delete state.attendanceData[k]);
        updateAttendanceArray();

        // 3. Update IndexedDB
        if (state.idb) {
          await IDB.put('girls', { ...g, isDeleted: true, deletedAt: Date.now(), deletedBy: state.currentUser?.email || '' });
          const allAtt = await IDB.getAll('attendance');
          const toDelete = allAtt.filter(a => a.girlId === id);
          await Promise.all(toDelete.map(a => IDB.delete('attendance', a.id)));
        }

        // 4. Sync to Firebase
        if (state.isOnline) {
          try {
            await setDoc(doc(db, 'girls', id), {
              isDeleted: true, deletedAt: Date.now(),
              deletedBy: state.currentUser?.email || '',
              name: g.name, grade: g.grade
            }, { merge: true });

            const attQuery = query(collection(db, 'attendance'), where('girlId', '==', id));
            const attSnap = await getDocs(attQuery);
            if (!attSnap.empty) {
              const docs = attSnap.docs;
              for (let i = 0; i < docs.length; i += 400) {
                const batch = writeBatch(db);
                docs.slice(i, i + 400).forEach(d => batch.delete(d.ref));
                await batch.commit();
              }
            }
          } catch (e) {
            console.error('Delete girl Firestore error:', e);
            await addPending('delete_girl', { id, update: { isDeleted: true, deletedAt: Date.now(), deletedBy: state.currentUser?.email || '' } });
          }
        } else {
          await addPending('delete_girl', { id, update: { isDeleted: true, deletedAt: Date.now(), deletedBy: state.currentUser?.email || '' } });
        }

        await logHistory('حذف مخدومة', `${g.name} - ${g.grade}`);
        showToast(`تم حذف ${g.name}`, 'success');
        state.editingGirlId = null;
        renderGirlsList();
      } catch (err) {
        console.error('Delete error:', err);
        showToast('حدث خطأ أثناء الحذف', 'error');
      } finally {
        state.deleteInProgress = false;
      }
    }
  });
}

// ============================================================
// GIRL PROFILE
// ============================================================
function showGirlProfile(id) {
  const g = state.girls.find(x => x.id === id);
  if (!g || g.isDeleted) return;
  state.currentProfileGirlId = id;
  DOM.profileName.textContent = g.name;

  const girlAtt = state.attendanceArray.filter(a => a.girlId === id);
  girlAtt.sort((a, b) => DateUtil.compareDates(b.date, a.date));

  const totalRecords = girlAtt.length;
  const presentCount = girlAtt.filter(a => a.status === 'حاضر').length;
  const absentCount = girlAtt.filter(a => a.status === 'غائب').length;

  // FIXED: attendance rate = present / totalRecords
  const attendanceRate = totalRecords > 0 ? Math.round((presentCount / totalRecords) * 100) : 0;

  const ratings = girlAtt.filter(a => a.rating > 0).map(a => a.rating);
  const avgRating = ratings.length ? (ratings.reduce((a, b) => a + b, 0) / ratings.length).toFixed(1) : '0';
  const lastAttendance = girlAtt.find(a => a.status === 'حاضر');
  const lastDate = lastAttendance ? lastAttendance.date : '-';

  const months = {};
  girlAtt.forEach(a => {
    const m = a.date?.substring(0, 7);
    if (!m) return;
    (months[m] ||= []).push(a);
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
            const dayName = r.date ? DAY_NAMES[new Date(r.date + 'T00:00:00').getDay()] || '' : '';
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

  DOM.profileBody.innerHTML = html;
  openModal('girlProfileModal');
}

// ============================================================
// SHARE PROFILE
// ============================================================
async function shareProfile() {
  const id = state.currentProfileGirlId;
  if (!id) return;
  const g = state.girls.find(x => x.id === id);
  if (!g) return;

  const girlAtt = state.attendanceArray.filter(a => a.girlId === id);
  const presentCount = girlAtt.filter(a => a.status === 'حاضر').length;
  const absentCount = girlAtt.filter(a => a.status === 'غائب').length;
  const attendanceRate = girlAtt.length > 0 ? Math.round((presentCount / girlAtt.length) * 100) : 0;

  const shareText = `👧 ${g.name}
📚 ${g.grade}
✅ حضور: ${presentCount}
❌ غياب: ${absentCount}
📊 نسبة: ${attendanceRate}%`.trim();

  if (navigator.share) {
    try { await navigator.share({ title: `ملف ${g.name}`, text: shareText }); }
    catch (e) { /* user cancelled */ }
  } else {
    try {
      await navigator.clipboard.writeText(shareText);
      showToast('تم نسخ البيانات للمشاركة', 'success');
    } catch (e) {
      showToast('المشاركة غير متوفرة على هذا الجهاز', 'warning');
    }
  }
}


// ============================================================
// CALENDAR: Calendar rendering
// ============================================================

// ============================================================
// CALENDAR PAGE — FIXED: pre-built Set for performance
// ============================================================


let attendanceDatesSet = new Set();

// ============================================================
// RENDER CALENDAR — FIXED: use pre-built Set
// ============================================================
function renderCalendar() {
  const year = state.calendarDate.getFullYear();
  const month = state.calendarDate.getMonth();
  DOM.calMonthYear.textContent = state.calendarDate.toLocaleDateString('ar-EG', { year: 'numeric', month: 'long' });

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const todayStr = DateUtil.toStr();

  // FIXED: Pre-build Set of attendance dates for this month
  const activeGirlIds = new Set(state.girls.filter(g => !g.isDeleted).map(g => g.id));
  attendanceDatesSet.clear();
  state.attendanceArray.forEach(a => {
    if (a.date?.startsWith(`${year}-${DateUtil.pad(month + 1)}`) && activeGirlIds.has(a.girlId)) {
      attendanceDatesSet.add(a.date);
    }
  });

  let html = '<div class="cal-weekdays">';
  ['أح', 'إث', 'ثل', 'أر', 'خم', 'جم', 'سب'].forEach(d => html += `<div class="cal-wday">${d}</div>`);
  html += '</div><div class="cal-days">';

  for (let i = 0; i < firstDay; i++) html += '<div class="cal-day empty"></div>';

  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${DateUtil.pad(month + 1)}-${DateUtil.pad(d)}`;
    const dayOfWeek = new Date(year, month, d).getDay();
    const isService = [1, 3, 6].includes(dayOfWeek);
    const hasData = attendanceDatesSet.has(dateStr);
    const isToday = dateStr === todayStr;
    html += `<div class="cal-day ${isService ? 'service-day' : ''} ${hasData ? 'has-data' : ''} ${isToday ? 'today' : ''}" data-date="${dateStr}">
      <span>${d}</span>${isService ? '<div class="service-dot"></div>' : ''}
    </div>`;
  }
  html += '</div>';
  DOM.calendarGrid.innerHTML = html;

  // Refresh day detail if open
  const dayDetail = document.getElementById('dayDetail');
  if (dayDetail && dayDetail.classList.contains('show')) {
    // refresh handled by caller
  }
}

function setupCalendarListeners() {
  DOM.calPrev.addEventListener('click', () => {
    hideDayDetail();
    state.calendarDate.setMonth(state.calendarDate.getMonth() - 1);
    renderCalendar();
  });
  DOM.calNext.addEventListener('click', () => {
    hideDayDetail();
    state.calendarDate.setMonth(state.calendarDate.getMonth() + 1);
    renderCalendar();
  });
}


// ============================================================
// STATS: Statistics, Activity Detail
// ============================================================

// ============================================================
// STATS PAGE — FIXED: cached array, date_activity sessions
// ============================================================


// ============================================================
// RENDER STATS
// ============================================================
function renderStats() {
  const month = DOM.statsMonth.value || DateUtil.getMonthStr();
  if (!DOM.statsMonth.value) DOM.statsMonth.value = month;

  // Time filter tabs
  $$('#timeFilterTabs .time-filter-tab').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.period === state.statsTimeFilter);
  });

  // Grade filter
  const gradeFilter = state.statsGradeFilter;
  $$('#statsGradeFilter .stats-grade-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.grade === gradeFilter);
  });

  let activeGirls = state.girls.filter(g => !g.isDeleted);
  if (gradeFilter) activeGirls = activeGirls.filter(g => g.grade === gradeFilter);
  const activeGirlIds = new Set(activeGirls.map(g => g.id));

  // Use cached attendanceArray for performance
  const monthAtt = state.attendanceArray.filter(a =>
    a.date?.startsWith(month) && activeGirlIds.has(a.girlId)
  );

  // FIXED: Pre-compute present/absent records once
  const presentRecords = monthAtt.filter(a => a.status === 'حاضر');
  const absentRecords = monthAtt.filter(a => a.status === 'غائب');

  // FIXED: totalSessions = unique date_activity combinations
  const totalSessions = new Set(monthAtt.map(a => `${a.date}_${a.activity}`)).size;
  const presents = presentRecords.length;
  const absents = absentRecords.length;

  const ratings = monthAtt.filter(a => a.rating > 0).map(a => a.rating);
  const avgRating = ratings.length ? (ratings.reduce((a, b) => a + b, 0) / ratings.length).toFixed(1) : '-';

  const followupCount = activeGirls.filter(g =>
    absentRecords.filter(a => a.girlId === g.id).length >= 2
  ).length;

  DOM.bigStatsGrid.innerHTML = `
    <div class="big-stat-card"><div class="big-num">${activeGirls.length}</div><div>المخدومات</div></div>
    <div class="big-stat-card"><div class="big-num">${totalSessions}</div><div>جلسات مسجلة</div></div>
    <div class="big-stat-card green-card"><div class="big-num">${presents}</div><div>إجمالي الحضور</div></div>
    <div class="big-stat-card red-card"><div class="big-num">${absents}</div><div>إجمالي الغياب</div></div>
    <div class="big-stat-card"><div class="big-num">${avgRating}</div><div>متوسط التقييم</div></div>
    <div class="big-stat-card orange-card"><div class="big-num">${followupCount}</div><div>تحتاج متابعة</div></div>`;

  renderActivityStats(state.statsTimeFilter, gradeFilter);

  const gradeLabel = gradeFilter ? `· ${gradeFilter}` : '';
  if (DOM.activityStatsGrade) DOM.activityStatsGrade.textContent = gradeLabel;

  // Absence chart
  const absenceByGirl = {};
  activeGirls.forEach(g => absenceByGirl[g.id] = 0);
  absentRecords.forEach(a => {
    if (absenceByGirl[a.girlId] !== undefined) absenceByGirl[a.girlId]++;
  });
  const maxAbs = Math.max(...Object.values(absenceByGirl), 1);
  const sortedAbs = Object.entries(absenceByGirl).filter(([, c]) => c > 0).sort((a, b) => b[1] - a[1]).slice(0, 10);

  DOM.absenceChart.innerHTML = sortedAbs.length
    ? sortedAbs.map(([id, count]) => {
      const g = state.girls.find(x => x.id === id);
      if (!g) return '';
      const pct = Math.round((count / maxAbs) * 100);
      return `<div class="chart-row">
        <span class="chart-name">${esc(g.name)}</span>
        <div class="chart-bar-wrap"><div class="chart-bar" style="width:${pct}%"></div></div>
        <span class="chart-val">${count}</span>
      </div>`;
    }).join('')
    : '<div class="empty-state">لا توجد غيابات هذا الشهر &#127881;</div>';

  // Attendance ranking
  const presentsByGirl = {};
  activeGirls.forEach(g => presentsByGirl[g.id] = 0);
  presentRecords.forEach(a => {
    if (presentsByGirl[a.girlId] !== undefined) presentsByGirl[a.girlId]++;
  });

  const sortedPresents = Object.entries(presentsByGirl)
    .filter(([, c]) => c > 0)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));

  DOM.attendanceRanking.innerHTML = sortedPresents.length
    ? sortedPresents.map(([id, count], i) => {
      const g = state.girls.find(x => x.id === id);
      if (!g) return '';
      return `<div class="rank-item">
        <span class="rank-num">${i + 1}</span>
        <span class="rank-name">${esc(g.name)}</span>
        <span class="rank-grade">${esc(g.grade)}</span>
        <span class="rank-count">${count} يوم</span>
      </div>`;
    }).join('')
    : '<div class="empty-state">لا توجد بيانات حضور هذا الشهر</div>';
}

// ============================================================
// ACTIVITY STATS
// ============================================================
function getPeriodBounds(period) {
  const now = new Date();
  const todayStr = DateUtil.toStr(now);
  switch (period) {
    case 'today': return { start: todayStr, end: todayStr };
    case 'month': return { start: DateUtil.getMonthStr(now) + '-01', end: todayStr };
    case 'year': return { start: String(now.getFullYear()) + '-01-01', end: todayStr };
    case 'all': default: return { start: '2000-01-01', end: todayStr };
  }
}

function getActivityStats(period, gradeFilter = '') {
  let activeGirls = state.girls.filter(g => !g.isDeleted);
  const activeGirlIds = gradeFilter
    ? new Set(activeGirls.filter(g => g.grade === gradeFilter).map(g => g.id))
    : new Set(activeGirls.map(g => g.id));
  const { start, end } = getPeriodBounds(period);

  // Dynamic stats object that works with any activities
  const stats = {};
  ACTIVITIES.forEach(a => stats[a] = 0);

  state.attendanceArray.forEach(a => {
    if (a.status !== 'حاضر') return;
    if (!activeGirlIds.has(a.girlId)) return;
    if (a.date < start || a.date > end) return;
    if (stats.hasOwnProperty(a.activity)) {
      stats[a.activity]++;
    }
  });

  return Object.entries(stats)
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1]);
}

function renderActivityStats(period, gradeFilter = '') {
  const stats = getActivityStats(period, gradeFilter);
  const el = DOM.activityStatsGrid;

  if (!stats.length) {
    el.innerHTML = '<div class="empty-state" style="grid-column:1/-1;">لا توجد بيانات حضور للفترة المحددة</div>';
    return;
  }

  const medals = ['&#129351;', '&#129352;', '&#129353;', '4'];

  el.innerHTML = stats.map(([activity, count], i) => `
    <div class="activity-stat-card" data-activity="${esc(activity)}" role="button" tabindex="0" aria-label="تفاصيل ${esc(activity)}">
      <div class="activity-stat-rank">${medals[i] || (i + 1)}</div>
      <div class="activity-stat-icon">${ACTIVITY_ICONS[activity] || '&#128202;'}</div>
      <div class="activity-stat-num">${count}</div>
      <div class="activity-stat-label">${activity}</div>
    </div>
  `).join('');

  const periodLabels = { today: '(اليوم)', month: '(هذا الشهر)', year: '(هذه السنة)', all: '(الكل)' };
  DOM.activityStatsPeriod.textContent = periodLabels[period] || '';
}

// ============================================================
// ACTIVITY DETAIL MODAL
// ============================================================
function openActivityDetailModal(activity, period, gradeFilter = '') {
  const { start, end } = getPeriodBounds(period);
  let activeGirls = state.girls.filter(g => !g.isDeleted);
  if (gradeFilter) activeGirls = activeGirls.filter(g => g.grade === gradeFilter);
  const activeGirlIds = new Set(activeGirls.map(g => g.id));
  const periodLabel = PERIOD_LABELS[period] || '';

  const records = state.attendanceArray.filter(a => {
    if (a.activity !== activity) return false;
    if (!activeGirlIds.has(a.girlId)) return false;
    if (a.date < start || a.date > end) return false;
    return true;
  });

  const byGirl = {};
  records.forEach(a => {
    if (!byGirl[a.girlId]) byGirl[a.girlId] = [];
    byGirl[a.girlId].push(a);
  });

  const presentGirls = [];
  const absentGirls = [];

  Object.entries(byGirl).forEach(([girlId, girlRecords]) => {
    girlRecords.sort((a, b) => DateUtil.compareDates(b.date, a.date));
    const girl = activeGirls.find(g => g.id === girlId);
    if (!girl) return;

    const pCount = girlRecords.filter(r => r.status === 'حاضر').length;
    const aCount = girlRecords.filter(r => r.status === 'غائب').length;
    const total = girlRecords.length;
    const rate = total > 0 ? Math.round((pCount / total) * 100) : 0;

    const entry = {
      girl, presentCount: pCount, absentCount: aCount,
      totalRecords: total, attendanceRate: rate, latestRecord: girlRecords[0]
    };

    if (pCount >= aCount) presentGirls.push(entry);
    else absentGirls.push(entry);
  });

  presentGirls.sort((a, b) => b.attendanceRate - a.attendanceRate || a.girl.name.localeCompare(b.girl.name, 'ar'));
  absentGirls.sort((a, b) => b.attendanceRate - a.attendanceRate || a.girl.name.localeCompare(b.girl.name, 'ar'));

  state.currentActivityDetail = { activity, period, presentGirls, absentGirls };
  state.activityDetailTab = 'present';

  DOM.activityDetailTitle.textContent = `تفاصيل ${activity}`;
  DOM.activityDetailIcon.innerHTML = ACTIVITY_ICONS[activity] || '&#128202;';
  DOM.activityDetailName.textContent = activity;
  DOM.activityDetailPeriod.textContent = periodLabel;
  DOM.activityDetailTotal.textContent = presentGirls.length + absentGirls.length;
  DOM.presentTabCount.textContent = presentGirls.length;
  DOM.absentTabCount.textContent = absentGirls.length;

  renderActivityDetailTab();
  openModal('activityDetailModal');
}

function renderActivityDetailTab() {
  const { presentGirls, absentGirls } = state.currentActivityDetail;
  const isPresentTab = state.activityDetailTab === 'present';
  const list = isPresentTab ? presentGirls : absentGirls;

  $$('#activityDetailTabs .activity-detail-tab').forEach(tab => {
    tab.classList.toggle('active', tab.dataset.tab === state.activityDetailTab);
  });

  const el = DOM.activityDetailList;
  if (!list.length) {
    const msg = isPresentTab ? 'لا يوجد حاضرون للفترة المحددة' : 'لا يوجد غائبون للفترة المحددة';
    el.innerHTML = `<div class="empty-state">${msg}</div>`;
    return;
  }

  const frag = document.createDocumentFragment();
  list.forEach(({ girl, presentCount, absentCount, totalRecords, attendanceRate, latestRecord }) => {
    const div = document.createElement('div');
    div.className = 'detail-girl-item';
    div.dataset.girlId = girl.id;
    div.innerHTML = `
      <div class="detail-girl-avatar">${esc(girl.name[0])}</div>
      <div class="detail-girl-info">
        <div class="detail-girl-name">${esc(girl.name)}</div>
        <div class="detail-girl-grade">${esc(girl.grade)} · ${presentCount} حضور · ${absentCount} غياب · ${attendanceRate}% نسبة · آخر: ${esc(latestRecord.date)}</div>
      </div>
      <div class="detail-status-icon ${isPresentTab ? 'present' : 'absent'}">
        ${isPresentTab ? '&#10003;' : '&#10007;'}
      </div>`;
    frag.appendChild(div);
  });

  el.innerHTML = '';
  el.appendChild(frag);
}

// Activity detail event delegation
function setupStatsListeners() {
  DOM.activityStatsGrid.addEventListener('click', e => {
    const card = e.target.closest('.activity-stat-card');
    if (!card || !card.dataset.activity) return;
    openActivityDetailModal(card.dataset.activity, state.statsTimeFilter, state.statsGradeFilter);
  });

  DOM.activityDetailTabs.addEventListener('click', e => {
    const tab = e.target.closest('.activity-detail-tab');
    if (!tab) return;
    state.activityDetailTab = tab.dataset.tab;
    renderActivityDetailTab();
  });

  DOM.activityDetailList.addEventListener('click', e => {
    const item = e.target.closest('.detail-girl-item');
    if (item && item.dataset.girlId) {
      closeModal('activityDetailModal');
      showGirlProfile(item.dataset.girlId);
    }
  });
}


// ============================================================
// HOME: Home page, Search
// ============================================================

// ============================================================
// HOME PAGE — FIXED: search by name+grade, debounce 150ms
// ============================================================


// ============================================================
// RENDER HOME
// ============================================================
function renderHome() {
  const now = new Date();
  const dayName = DateUtil.dayName(now);
  const dateStr = DateUtil.toStr(now);
  const monthStr = DateUtil.getMonthStr(now);

  DOM.todayDay.textContent = `${DateUtil.formatDateShort(now)} ${dayName}`;
  DOM.todayDate.textContent = now.toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' });

  const normalized = DateUtil.normalize(dayName);
  const isService = SERVICE_DAYS[normalized];

  DOM.todayServiceBadge.textContent = isService ? 'يوم خدمة \u2713' : 'لا توجد خدمة اليوم';
  DOM.todayServiceBadge.classList.toggle('active', isService);

  const gradeFilter = state.homeGradeFilter;
  let activeGirls = state.girls.filter(g => !g.isDeleted);
  if (gradeFilter) activeGirls = activeGirls.filter(g => g.grade === gradeFilter);
  const activeGirlIds = new Set(activeGirls.map(g => g.id));

  // Update filter button counts
  const allActive = state.girls.filter(g => !g.isDeleted);
  document.getElementById('homeFilterCountAll').textContent = allActive.length;
  document.getElementById('homeFilterCount1').textContent = allActive.filter(g => g.grade === 'أولى إعدادي').length;
  document.getElementById('homeFilterCount2').textContent = allActive.filter(g => g.grade === 'تانية إعدادي').length;
  document.getElementById('homeFilterCount3').textContent = allActive.filter(g => g.grade === 'تالتة إعدادي').length;

  $$('#homeGradeFilters .grade-filter-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.grade === gradeFilter);
  });

  DOM.statTotal.textContent = activeGirls.length;

  let presentToday = 0, absentToday = 0;
  // FIXED: use cached attendanceArray
  state.attendanceArray.forEach(a => {
    if (a.date !== dateStr) return;
    if (!activeGirlIds.has(a.girlId)) return;
    if (a.status === 'حاضر') presentToday++;
    else if (a.status === 'غائب') absentToday++;
  });
  DOM.statPresentToday.textContent = presentToday;
  DOM.statAbsentToday.textContent = absentToday;

  let totalRating = 0, ratingCount = 0;
  state.attendanceArray.forEach(a => {
    if (a.date?.startsWith(monthStr) && a.rating > 0 && activeGirlIds.has(a.girlId)) {
      totalRating += a.rating; ratingCount++;
    }
  });
  DOM.statAvgRating.textContent = ratingCount ? (totalRating / ratingCount).toFixed(1) : '-';

  const bestGrade = getBestGradeFiltered(monthStr, gradeFilter);
  if (bestGrade && bestGrade.percent > 0) {
    DOM.bestGrade.textContent = bestGrade.grade;
    DOM.bestGradePercent.textContent = `${Math.round(bestGrade.percent)}% حضور`;
  } else {
    DOM.bestGrade.textContent = gradeFilter || '-';
    DOM.bestGradePercent.textContent = gradeFilter ? 'لا توجد بيانات' : 'أفضل سنة دراسية';
  }

  const topActivity = getTopActivityFiltered(monthStr, gradeFilter);
  if (topActivity) {
    DOM.topActivityName.textContent = topActivity.name;
    DOM.topActivityCount.textContent = `${topActivity.count} حضور`;
  } else {
    DOM.topActivityName.textContent = '-';
    DOM.topActivityCount.textContent = 'أكثر نشاط حضورًا';
  }

  const mostRegular = getMostRegularGirlFiltered(monthStr, gradeFilter);
  if (mostRegular) {
    DOM.mostRegularGirl.textContent = mostRegular.name;
    DOM.mostRegularPercent.textContent = `${mostRegular.count} يوم \u00B7 ${Math.round(mostRegular.percent)}%`;
  } else {
    DOM.mostRegularGirl.textContent = '-';
    DOM.mostRegularPercent.textContent = 'أكثر مخدومة انتظامًا';
  }

  // Top attendees
  const counts = {};
  activeGirls.forEach(g => counts[g.id] = 0);
  state.attendanceArray.forEach(a => {
    if (a.date?.startsWith(monthStr) && a.status === 'حاضر' && counts[a.girlId] !== undefined) {
      counts[a.girlId]++;
    }
  });
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const topEl = DOM.topAttendees;

  if (!sorted.length || !sorted[0][1]) {
    topEl.innerHTML = '<div class="empty-state">لا توجد بيانات حضور هذا الشهر</div>';
  } else {
    const frag = document.createDocumentFragment();
    sorted.forEach(([id, count], i) => {
      if (!count) return;
      const g = state.girls.find(x => x.id === id);
      if (!g) return;
      const div = document.createElement('div');
      div.className = 'top-item';
      div.innerHTML = `<span class="top-rank">${i + 1}</span><span class="top-name">${esc(g.name)}</span><span class="top-count">${count} يوم</span>`;
      frag.appendChild(div);
    });
    topEl.innerHTML = '';
    topEl.appendChild(frag);
  }

  // Needs followup
  const needs = activeGirls.filter(g => {
    const absDates = new Set(
      state.attendanceArray
        .filter(a => a.girlId === g.id && a.date?.startsWith(monthStr) && a.status === 'غائب')
        .map(a => a.date)
    );
    return absDates.size >= 2;
  });
  const needsEl = DOM.needsFollowup;
  if (!needs.length) {
    needsEl.innerHTML = '<div class="empty-state">لا توجد حالات تحتاج متابعة</div>';
  } else {
    const frag = document.createDocumentFragment();
    needs.forEach(g => {
      const abs = new Set(
        state.attendanceArray
          .filter(a => a.girlId === g.id && a.date?.startsWith(monthStr) && a.status === 'غائب')
          .map(a => a.date)
      ).size;
      const div = document.createElement('div');
      div.className = 'followup-item';
      div.dataset.girlId = g.id;
      div.innerHTML = `<span class="followup-name">${esc(g.name)}</span><span class="followup-badge">${abs} غياب</span>`;
      frag.appendChild(div);
    });
    needsEl.innerHTML = '';
    needsEl.appendChild(frag);
  }
}

// ============================================================
// SEARCH — FIXED: search by name + grade, debounce 150ms, startsWith priority
// ============================================================
function debouncedSearch() {
  clearTimeout(state.searchDebounceTimer);
  state.searchDebounceTimer = setTimeout(() => {
    const q = DOM.globalSearch.value.trim().replace(/\s+/g, ' ');
    const resultsEl = DOM.searchResults;
    if (!q) { resultsEl.classList.remove('show'); resultsEl.innerHTML = ''; return; }

    const qNorm = normalizeArabic(q);
    const activeGirls = state.girls.filter(g => !g.isDeleted);

    // FIXED: search by name + grade combined
    let matches = activeGirls.filter(g => {
      const searchField = normalizeArabic(g.name + ' ' + g.grade);
      return searchField.includes(qNorm);
    });

    // FIXED: startsWith first, then includes
    const startsWith = matches.filter(g => normalizeArabic(g.name).startsWith(qNorm));
    const includesOnly = matches.filter(g => !normalizeArabic(g.name).startsWith(qNorm));
    matches = [...startsWith, ...includesOnly];

    resultsEl.innerHTML = matches.length
      ? matches.map(g => `<div class="search-item" data-girl-id="${esc(g.id)}"><span>${esc(g.name)}</span><span class="grade-badge">${esc(g.grade)}</span></div>`).join('')
      : '<div class="search-item">لا توجد نتائج</div>';
    resultsEl.classList.add('show');
  }, 150); // FIXED: 150ms instead of 250ms
}


// ============================================================
// ATTENDANCE: Attendance page
// ============================================================

// ============================================================
// ATTENDANCE PAGE — All Critical Fixes Applied
// ============================================================


let attendancePageInitialized = false;

// ============================================================
// RENDER ATTENDANCE PAGE — FIXED: no auto-mark-all-absent
// ============================================================
function renderAttendancePage() {
  if (!DOM.attendanceDate.value) DOM.attendanceDate.value = DateUtil.toStr();
  setActiveDay(state.selectedDay);
  setActiveActivity(state.selectedActivity);

  // FIXED: Removed auto-mark-all-absent logic
  // Just render the list directly
  attendancePageInitialized = true;
  renderAttendanceList();
}

function setActiveDay(day) {
  state.selectedDay = day;
  $$('.day-btn').forEach(b => b.classList.toggle('active', b.dataset.day === day));
}

function setActiveActivity(act) {
  state.selectedActivity = act;
  $$('.act-tab').forEach(b => b.classList.toggle('active', b.dataset.activity === act));
}

// Day/activity/change handlers
function setupAttendanceListeners() {
  $$('.day-btn').forEach(b => b.addEventListener('click', () => {
    setActiveDay(b.dataset.day);
    attendancePageInitialized = false;
    renderAttendancePage();
  }));

  $$('.act-tab').forEach(b => b.addEventListener('click', () => {
    setActiveActivity(b.dataset.activity);
    attendancePageInitialized = false;
    renderAttendancePage();
  }));

  DOM.attendanceDate.addEventListener('change', () => {
    attendancePageInitialized = false;
    renderAttendancePage();
  });

  DOM.selectAllPresent.addEventListener('click', () => selectAllStatus('حاضر'));
  DOM.selectAllAbsent.addEventListener('click', () => selectAllStatus('غائب'));

  if (DOM.attendanceSearch) {
    DOM.attendanceSearch.addEventListener('input', debouncedAttSearch);
  }

  // FIXED: Hide the fake save button
  if (DOM.saveAttendanceBtn) {
    DOM.saveAttendanceBtn.classList.add('hidden');
  }

  // Attendance entry modal buttons
  $$('.attend-btn').forEach(b => {
    b.addEventListener('click', () => {
      $$('.attend-btn').forEach(x => x.classList.remove('selected'));
      b.classList.add('selected');
      DOM.ratingSection.classList.toggle('hidden', b.dataset.status !== 'حاضر');
    });
  });

  $$('.star').forEach(s => s.addEventListener('click', () => setRating(parseInt(s.dataset.val))));

  DOM.saveAttendanceEntry.addEventListener('click', saveAttendanceEntry);
}

function debouncedAttSearch() {
  clearTimeout(state.attSearchDebounceTimer);
  state.attSearchDebounceTimer = setTimeout(() => {
    renderAttendanceList();
  }, 150);
}

// ============================================================
// TOGGLE ATTENDANCE — FIXED: preserve rating, log history
// ============================================================
async function toggleAttendanceStatus(girlId, girlName, date) {
  const key = `${girlId}_${date}_${state.selectedActivity}`;
  const existing = state.attendanceData[key];
  const newStatus = existing?.status === 'حاضر' ? 'غائب' : 'حاضر';

  // FIXED: preserve old rating
  const oldRating = existing?.rating || 0;

  const rec = {
    id: key,
    girlId: girlId,
    date,
    day: state.selectedDay,
    activity: state.selectedActivity,
    status: newStatus,
    // FIXED: keep old rating when toggling to حاضر, preserve it
    rating: newStatus === 'حاضر' ? oldRating : 0,
    notes: existing?.notes || '',
    updatedAt: Date.now(),
    updatedBy: state.currentUser?.displayName || 'خادم',
    updatedByEmail: state.currentUser?.email || ''
  };

  if (state.idb) await IDB.put('attendance', rec);
  state.attendanceData[key] = rec;
  updateAttendanceArray();

  if (state.isOnline) {
    try { await setDoc(doc(db, 'attendance', key), rec); }
    catch (e) { await addPending('attendance', rec); }
  } else {
    await addPending('attendance', rec);
  }

  // FIXED: log history for toggle
  await logHistory('تسجيل حضور', `${girlName} - ${state.selectedActivity} - ${date} - ${newStatus}`);

  renderAttendanceList();
  if (state.currentPage === 'home') renderHome();
  if (state.currentPage === 'stats') renderStats();
  if (state.currentPage === 'calendar') renderCalendar();
}

// ============================================================
// MARK ALL ABSENT — FIXED: with confirmation dialog + chunked batches
// ============================================================
async function markAllAbsent(date) {
  // FIXED: Show confirmation before marking all absent
  const confirmed = await new Promise(resolve => {
    showConfirm({
        icon: '&#9888;', title: 'تأكيد',
        msg: 'هل تريد إنشاء سجل غياب تلقائي لجميع المخدومات؟',
        okLabel: 'نعم',
        onOk: () => resolve(true)
      });
    });

  if (!confirmed) return;

  const activeGirls = state.girls.filter(g => !g.isDeleted);
  const records = [];

  for (const g of activeGirls) {
    const key = `${g.id}_${date}_${state.selectedActivity}`;
    if (!state.attendanceData[key]) {
      records.push({
        id: key,
        girlId: g.id,
        date,
        day: state.selectedDay,
        activity: state.selectedActivity,
        status: 'غائب',
        rating: 0,
        notes: '',
        updatedAt: Date.now(),
        updatedBy: state.currentUser?.displayName || 'خادم',
        updatedByEmail: state.currentUser?.email || ''
      });
    }
  }

  // FIXED: Use batchSaveAttendance which handles chunking
  await batchSaveAttendance(records);
  updateAttendanceArray();

  if (records.length > 0) {
    await logHistory('تسجيل حضور', `تحديد الكل غائب - ${state.selectedActivity} - ${date}`);
    renderAttendanceList();
    if (state.currentPage === 'home') renderHome();
    if (state.currentPage === 'calendar') renderCalendar();
  }
}

// ============================================================
// SELECT ALL STATUS — FIXED: chunked batches (400 limit)
// ============================================================
async function selectAllStatus(status) {
  const date = DOM.attendanceDate.value;
  if (!date) { showToast('الرجاء اختيار التاريخ أولاً', 'error'); return; }

  const activeGirls = state.girls.filter(g => !g.isDeleted);
  const records = [];

  for (const g of activeGirls) {
    const key = `${g.id}_${date}_${state.selectedActivity}`;
    const existing = state.attendanceData[key];
    const rec = {
      id: key,
      girlId: g.id,
      date,
      day: state.selectedDay,
      activity: state.selectedActivity,
      status,
      rating: status === 'حاضر' ? (existing?.rating || 0) : 0,
      notes: existing?.notes || '',
      updatedAt: Date.now(),
      updatedBy: state.currentUser?.displayName || 'خادم',
      updatedByEmail: state.currentUser?.email || ''
    };
    records.push(rec);
    state.attendanceData[key] = rec;
    if (state.idb) await IDB.put('attendance', rec);
  }

  // FIXED: chunked Firestore batches
  if (state.isOnline && records.length > 0) {
    try {
      for (let i = 0; i < records.length; i += BATCH_SIZE) {
        const batch = writeBatch(db);
        const chunk = records.slice(i, i + BATCH_SIZE);
        for (const rec of chunk) {
          batch.set(doc(db, 'attendance', rec.id), rec);
        }
        await batch.commit();
      }
    } catch (e) {
      for (const rec of records) await addPending('attendance', rec);
    }
  } else if (records.length > 0) {
    for (const rec of records) await addPending('attendance', rec);
  }

  updateAttendanceArray();
  await logHistory('تسجيل حضور', `${status === 'حاضر' ? 'تحديد الكل حاضر' : 'تحديد الكل غائب'} - ${state.selectedActivity} - ${date}`);
  showToast(status === 'حاضر' ? 'تم تحديد الكل حاضر' : 'تم تحديد الكل غائب', 'success');
  renderAttendanceList();
  if (state.currentPage === 'home') renderHome();
  if (state.currentPage === 'stats') renderStats();
  if (state.currentPage === 'calendar') renderCalendar();
}

// ============================================================
// RENDER ATTENDANCE LIST — FIXED: search by name+grade
// ============================================================
function renderAttendanceList() {
  const date = DOM.attendanceDate.value;
  const el = DOM.attendanceList;
  if (!date) { el.innerHTML = '<div class="empty-state">الرجاء اختيار التاريخ</div>'; return; }

  let activeGirls = state.girls.filter(g => !g.isDeleted);

  // FIXED: Search filter with name + grade
  const searchQuery = DOM.attendanceSearch?.value?.trim() || '';
  if (searchQuery) {
    const qNorm = normalizeArabic(searchQuery);
    activeGirls = activeGirls.filter(g => {
      const searchField = normalizeArabic(g.name + ' ' + g.grade);
      return searchField.includes(qNorm);
    });
  }

  let present = 0, absent = 0;
  const frag = document.createDocumentFragment();

  if (searchQuery && !activeGirls.length) {
    el.innerHTML = '<div class="empty-state">لا توجد نتائج للبحث</div>';
    DOM.presentCount.textContent = 0;
    DOM.absentCount.textContent = 0;
    DOM.totalCount.textContent = 0;
    return;
  }

  if (!activeGirls.length) {
    el.innerHTML = '<div class="empty-state">لا توجد مخدومات مسجلة<br><small>أضف مخدومات أولاً من صفحة المخدومات</small></div>';
    DOM.presentCount.textContent = 0;
    DOM.absentCount.textContent = 0;
    DOM.totalCount.textContent = 0;
    return;
  }

  activeGirls.forEach(g => {
    const key = `${g.id}_${date}_${state.selectedActivity}`;
    const rec = state.attendanceData[key];
    let statusClass = 'absent', statusIcon = '&#10007;', statusText = 'غائب';
    if (rec?.status === 'حاضر') { statusClass = 'present'; statusIcon = '&#10003;'; statusText = 'حاضر'; present++; }
    else { absent++; }

    const stars = rec?.rating ? '&#9733;'.repeat(rec.rating) + '&#9734;'.repeat(5 - rec.rating) : '';
    const div = document.createElement('div');
    div.className = `att-item ${statusClass}`;
    div.dataset.girlId = g.id;
    div.dataset.attKey = key;
    div.dataset.girlName = g.name;

    div.innerHTML = `
      <div class="att-icon">${statusIcon}</div>
      <div class="att-info">
        <span class="att-name">${esc(g.name)}</span>
        <span class="att-grade">${esc(g.grade)}</span>
        ${stars ? `<span class="att-stars">${stars}</span>` : ''}
        ${rec?.notes ? `<span class="att-note">${esc(rec.notes)}</span>` : ''}
      </div>
      <span class="att-status-text ${statusClass}">${statusText}</span>
      <button class="att-delete-btn" data-att-key="${esc(key)}" title="حذف السجل" aria-label="حذف سجل الحضور">&#10060;</button>`;
    frag.appendChild(div);
  });

  el.innerHTML = '';
  el.appendChild(frag);
  DOM.presentCount.textContent = present;
  DOM.absentCount.textContent = absent;
  DOM.totalCount.textContent = activeGirls.length;
}

// ============================================================
// DELETE ATTENDANCE — FIXED: offline pending delete
// ============================================================
async function deleteAttendanceRecord(key) {
  const rec = state.attendanceData[key];
  if (!rec) return;

  const g = state.girls.find(x => x.id === rec.girlId);
  const gName = g ? g.name : 'مخدومة';

    showConfirm({
    icon: '&#9888;', title: 'حذف سجل الحضور',
    msg: `هل أنت متأكد من حذف سجل ${esc(gName)} ليوم ${esc(rec.date)}؟`,
    okLabel: 'حذف',
    onOk: async () => {
      try {
        // FIXED: Add pending delete for offline
        if (!state.isOnline) {
          await addPendingDelete('attendance', key);
        }

        delete state.attendanceData[key];
        updateAttendanceArray();
        if (state.idb) await IDB.delete('attendance', key);
        if (state.isOnline) {
          try { await deleteDoc(doc(db, 'attendance', key)); }
          catch (e) { console.error('Delete attendance Firestore error:', e); }
        }

        await logHistory('حذف سجل حضور', `${gName} - ${rec.date} - ${rec.activity} - ${rec.status}`);
        showToast('تم حذف سجل الحضور', 'success');
        renderAttendanceList();
        if (state.currentPage === 'stats') renderStats();
        if (state.currentPage === 'home') renderHome();
        if (state.currentPage === 'calendar') renderCalendar();
      } catch (err) {
        console.error('Delete attendance error:', err);
        showToast('حدث خطأ أثناء الحذف', 'error');
      }
    }
  });
}

// ============================================================
// ATTENDANCE ENTRY MODAL
// ============================================================
function openAttendanceEntry(girlId, girlName, date) {
  state.currentAttendanceGirlId = girlId;
  state.currentAttendanceRating = 0;
  DOM.attendanceModalTitle.textContent = `${state.selectedActivity} - ${date}`;
  DOM.modalGirlName.textContent = girlName;
  DOM.attendanceNotes.value = '';

  const key = `${girlId}_${date}_${state.selectedActivity}`;
  const existing = state.attendanceData[key];
  if (existing) {
    $$('.attend-btn').forEach(b => b.classList.toggle('selected', b.dataset.status === existing.status));
    setRating(existing.rating || 0);
    DOM.attendanceNotes.value = existing.notes || '';
    DOM.ratingSection.classList.toggle('hidden', existing.status !== 'حاضر');
  } else {
    $$('.attend-btn').forEach(b => b.classList.remove('selected'));
    setRating(0);
    DOM.ratingSection.classList.add('hidden');
  }

    openModal('attendanceModal');
}

function setRating(val) {
  state.currentAttendanceRating = val;
  $$('.star').forEach(s => s.classList.toggle('active', parseInt(s.dataset.val) <= val));
}

// ============================================================
// SAVE ATTENDANCE ENTRY
// ============================================================
async function saveAttendanceEntry() {
  const date = DOM.attendanceDate.value;
  const statusBtn = document.querySelector('.attend-btn.selected');
  if (!statusBtn) { showToast('الرجاء تحديد الحضور أو الغياب', 'error'); return; }

  const key = `${state.currentAttendanceGirlId}_${date}_${state.selectedActivity}`;
  const existing = state.attendanceData[key];

  const rec = {
    id: key,
    girlId: state.currentAttendanceGirlId,
    date,
    day: state.selectedDay,
    activity: state.selectedActivity,
    status: statusBtn.dataset.status,
    rating: statusBtn.dataset.status === 'حاضر' ? state.currentAttendanceRating : 0,
    notes: DOM.attendanceNotes.value.trim(),
    updatedAt: Date.now(),
    updatedBy: state.currentUser?.displayName || 'خادم',
    updatedByEmail: state.currentUser?.email || ''
  };

  if (state.idb) await IDB.put('attendance', rec);
  state.attendanceData[key] = rec;
  updateAttendanceArray();

  if (state.isOnline) {
    try { await setDoc(doc(db, 'attendance', key), rec); }
    catch (e) { await addPending('attendance', rec); }
  } else {
    await addPending('attendance', rec);
  }

  const gName = state.girls.find(g => g.id === state.currentAttendanceGirlId)?.name || '';
  await logHistory('تسجيل حضور', `${gName} - ${state.selectedActivity} - ${date} - ${rec.status}`);

    closeModal('attendanceModal');
  showToast('تم الحفظ', 'success');
  renderAttendanceList();
  if (state.currentPage === 'home') renderHome();
  if (state.currentPage === 'stats') renderStats();
  if (state.currentPage === 'calendar') renderCalendar();
}


// ============================================================
// UI: Navigation, Modals, Delegation
// ============================================================

// ============================================================
// UI: Rendering, Navigation, Modals, Event Delegation
// ============================================================


// ============================================================
// PAGE TITLES
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

// ============================================================
// NAVIGATION
// ============================================================
function navigateTo(page) {
  $$('.page').forEach(p => p.classList.remove('active'));
  $(`page-${page}`).classList.add('active');
  $$('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.page === page));
  $$('.menu-item[data-page]').forEach(b => b.classList.toggle('active', b.dataset.page === page));
  const [title, sub] = PAGE_TITLES[page] || [page, ''];
  DOM.pageTitle.textContent = title;
  DOM.pageSubtitle.textContent = sub;
  state.currentPage = page;

  if (page === 'attendance') {
    // Reset attendance page init flag
    window.attendancePageInitialized = false;
  }
  if (page !== 'calendar') {
    hideDayDetail();
  }

  renderPage();
  closeDrawer();
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
// DRAWER
// ============================================================
function openDrawer() {
  DOM.drawer.classList.add('open');
  DOM.drawerOverlay.classList.add('show');
}
function closeDrawer() {
  DOM.drawer.classList.remove('open');
  DOM.drawerOverlay.classList.remove('show');
}

// ============================================================
// MODAL HELPERS
// ============================================================
function openModal(id) {
  if (!DOM[id]) return;
  DOM[id].classList.add('show');
  document.body.style.overflow = 'hidden';
}
function closeModal(id) {
  if (!DOM[id]) return;
  DOM[id].classList.remove('show');
  const anyOpen = document.querySelector('.modal-overlay.show');
  if (!anyOpen) document.body.style.overflow = '';
}

// ============================================================
// CONFIRM MODAL
// ============================================================
let confirmResolve = null;

function showConfirm({ icon = '&#9888;', title, msg, okLabel = 'تأكيد', okClass = '', onOk }) {
  DOM.confirmIcon.innerHTML = icon;
  DOM.confirmTitle.textContent = title;
  DOM.confirmMsg.textContent = msg;
  const okBtn = DOM.confirmOk;
  okBtn.textContent = okLabel;
  okBtn.className = 'confirm-ok';
  if (okClass) okBtn.classList.add(...okClass.split(' ').filter(Boolean));
  confirmResolve = onOk;
  DOM.confirmOverlay.classList.add('show');
}

function setupConfirmListeners() {
  DOM.confirmOk.addEventListener('click', async () => {
    DOM.confirmOverlay.classList.remove('show');
    if (confirmResolve) {
      const fn = confirmResolve;
      confirmResolve = null;
      try { await fn(); } catch (e) { console.error('Confirm ok error:', e); }
    }
  });

  DOM.confirmCancel.addEventListener('click', () => {
    DOM.confirmOverlay.classList.remove('show');
    confirmResolve = null;
  });

  DOM.confirmOverlay.addEventListener('click', e => {
    if (e.target === DOM.confirmOverlay) {
      DOM.confirmOverlay.classList.remove('show');
      confirmResolve = null;
    }
  });
}

// ============================================================
// DAY DETAIL (Calendar)
// ============================================================
let currentDayDetailDate = null;

function showDayDetail(dateStr) {
  currentDayDetailDate = dateStr;
  refreshDayDetail();
}

function hideDayDetail() {
  currentDayDetailDate = null;
  DOM.dayDetail.classList.remove('show');
}

function refreshDayDetail() {
  if (!currentDayDetailDate) return;
  const dateStr = currentDayDetailDate;
  const records = Object.values(state.attendanceData).filter(a => a.date === dateStr);
  const el = DOM.dayDetail;

  const activeGirlIds = new Set(state.girls.filter(g => !g.isDeleted).map(g => g.id));
  const filteredRecords = records.filter(r => activeGirlIds.has(r.girlId));

  if (!filteredRecords.length) {
    el.innerHTML = `<div class="day-detail-header">${dateStr}</div><div class="empty-state">لا توجد سجلات لهذا اليوم</div>`;
  } else {
    const grouped = {};
    filteredRecords.forEach(r => { (grouped[r.activity || 'عام'] ||= []).push(r); });
    let html = `<div class="day-detail-header">${dateStr}</div>`;
    Object.entries(grouped).forEach(([act, recs]) => {
      const presentCount = recs.filter(r => r.status === 'حاضر').length;
      const absentCount = recs.filter(r => r.status === 'غائب').length;
      html += `<div class="day-activity"><b>${esc(act)}</b>: <span class="green-text">${presentCount} حاضر</span> · <span class="red-text">${absentCount} غائب</span> من ${recs.length}</div>`;
    });
    el.innerHTML = html;
  }
  el.classList.add('show');
}

// ============================================================
// EVENT DELEGATION — FIXED: flag to prevent double init
// ============================================================
// Dynamic imports to avoid circular dependencies:
// ui.js -> pages/girls.js -> ui.js (girls.js needs openModal/closeModal from ui.js)
// We import page modules dynamically in event handlers

function setupDelegation() {
  if (state.delegationInitialized) return;
  state.delegationInitialized = true;

  // Navigation
  $$('.nav-btn').forEach(btn => btn.addEventListener('click', () => navigateTo(btn.dataset.page)));
  $$('.menu-item[data-page]').forEach(item => item.addEventListener('click', e => {
    e.preventDefault();
    navigateTo(item.dataset.page);
  }));

  DOM.menuBtn.addEventListener('click', openDrawer);
  DOM.drawerOverlay.addEventListener('click', closeDrawer);

  // Modal close handlers
  DOM.closeGirlModal.addEventListener('click', () => closeModal('girlModal'));
  DOM.cancelGirlModal.addEventListener('click', () => closeModal('girlModal'));
  DOM.closeAttendanceModal.addEventListener('click', () => closeModal('attendanceModal'));
  DOM.cancelAttendanceModal.addEventListener('click', () => closeModal('attendanceModal'));
  DOM.closeProfileModal.addEventListener('click', () => closeModal('girlProfileModal'));
  DOM.closeActivityDetailModal.addEventListener('click', () => closeModal('activityDetailModal'));

  $$('.modal-overlay').forEach(overlay => overlay.addEventListener('click', e => {
    if (e.target === overlay) closeModal(overlay.id);
  }));

  // Needs followup click
  DOM.needsFollowup.addEventListener('click', e => {
    const item = e.target.closest('.followup-item');
    if (item) showGirlProfile(item.dataset.girlId);
  });

  // Girls list click — dynamic import to avoid circular dep
  DOM.girlsList.addEventListener('click', async e => {
    const editBtn = e.target.closest('.edit-btn');
    if (editBtn) {
      e.stopPropagation();
            editGirl(editBtn.dataset.girlId);
      return;
    }
    const card = e.target.closest('.girl-card');
    if (card) {
            showGirlProfile(card.dataset.girlId);
    }
  });

  // Search results click
  DOM.searchResults.addEventListener('click', e => {
    const item = e.target.closest('.search-item');
    if (item && item.dataset.girlId) showGirlProfile(item.dataset.girlId);
  });

  // Attendance list — FIXED: long press with longPressOpened
  DOM.attendanceList.addEventListener('click', async e => {
    const delBtn = e.target.closest('.att-delete-btn');
    if (delBtn) {
      e.stopPropagation();
      e.preventDefault();
            deleteAttendanceRecord(delBtn.dataset.attKey);
      return;
    }
    // FIXED: use longPressOpened instead of isLongPress
    if (state.longPressOpened) {
      state.longPressOpened = false;
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    const item = e.target.closest('.att-item');
    if (item) {
      const g = state.girls.find(x => x.id === item.dataset.girlId);
      if (g) {
        