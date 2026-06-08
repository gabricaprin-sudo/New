// ============================================================
// UTILS — Constants, Date Utilities, Text Helpers, Caching
// ============================================================

// ============================================================
// CONSTANTS
// ============================================================
const HISTORY_PAGE_SIZE = 30;
const SERVICE_DAYS = { 'السبت': true, 'الاثنين': true, 'الاربعاء': true };
const SERVICE_DAY_NUMBERS = [1, 3, 6]; // Mon, Wed, Sat
const DAY_NAMES = ['الأحد','الاثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'];

const ACTIVITIES = ['دراسي', 'محفوظات', 'قبطي', 'ألحان'];
const ACTIVITY_ICONS = { 'دراسي': '&#128216;', 'ألحان': '&#127925;', 'قبطي': '&#9961;', 'محفوظات': '&#128221;' };
const PERIOD_LABELS = { today: 'اليوم', month: 'هذا الشهر', year: 'هذه السنة', all: 'كل الفترات' };

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
  dayName(d = new Date()) {
    const idx = d.getDay();
    return DAY_NAMES[idx] || '';
  },
  normalize(d) {
    return {
      'الأحد': 'الاحد', 'الاثنين': 'الاثنين', 'الثلاثاء': 'الثلاثاء',
      'الأربعاء': 'الاربعاء', 'الخميس': 'الخميس', 'الجمعة': 'الجمعة', 'السبت': 'السبت'
    }[d] || d;
  }
};

// ============================================================
// TIMECONTEXT — Unified Date Source
// ============================================================
const TimeContext = {
  _selectedDate: null,
  _listeners: [],

  init() {
    const saved = localStorage.getItem('trackerSelectedDate');
    this._selectedDate = saved || DateUtil.toStr();
  },

  getDate() {
    return this._selectedDate || DateUtil.toStr();
  },

  setDate(dateStr) {
    if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      console.warn('Invalid date format:', dateStr);
      return;
    }
    this._selectedDate = dateStr;
    localStorage.setItem('trackerSelectedDate', dateStr);
    this._notifyListeners(dateStr);
  },

  getMonth() {
    return this._selectedDate.substring(0, 7);
  },

  getYear() {
    return this._selectedDate.substring(0, 4);
  },

  resetToToday() {
    this._selectedDate = DateUtil.toStr();
    localStorage.removeItem('trackerSelectedDate');
    this._notifyListeners(this._selectedDate);
  },

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
// DATE PARSING HELPERS
// ============================================================
function parseDate(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr + 'T00:00:00');
  return isNaN(d.getTime()) ? null : d;
}

function parseDateDay(dateStr) {
  const d = parseDate(dateStr);
  return d ? d.getDay() : -1;
}

function safeDayName(dateStr) {
  const d = parseDate(dateStr);
  return d ? (DAY_NAMES[d.getDay()] || '') : '';
}

// ============================================================
// ATTENDANCE CACHE
// ============================================================
let _cachedAttendanceEntries = null;
let _cachedAttendanceTimestamp = 0;

function getAttendanceEntries() {
  const currentKeys = Object.keys(state.attendanceData).length;
  if (_cachedAttendanceEntries && _cachedAttendanceTimestamp === currentKeys) {
    return _cachedAttendanceEntries;
  }
  _cachedAttendanceEntries = Object.values(state.attendanceData);
  _cachedAttendanceTimestamp = currentKeys;
  return _cachedAttendanceEntries;
}

function invalidateAttendanceCache() {
  _cachedAttendanceEntries = null;
  _cachedAttendanceTimestamp = 0;
}

// ============================================================
// SERVICE DAY HELPERS
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
  const to = parseDate(toDate);
  const daysInMonth = new Date(fromYear, fromMonth + 1, 0).getDate();
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${fromYear}-${DateUtil.pad(fromMonth + 1)}-${DateUtil.pad(d)}`;
    const current = parseDate(dateStr);
    if (!current || current > to) break;
    const dayOfWeek = current.getDay();
    if (SERVICE_DAY_NUMBERS.includes(dayOfWeek)) {
      count++;
    }
  }
  return count;
}

function isServiceDayDate(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return false;
  const d = parseDate(dateStr);
  if (!d || isNaN(d.getTime())) return false;
  return SERVICE_DAY_NUMBERS.includes(d.getDay());
}

function isServiceDayInMonth(dateStr, year, month) {
  const serviceDays = getServiceDaysInMonth(year, month);
  return serviceDays.includes(dateStr);
}

function filterServiceDayRecords(records) {
  return records.filter(a => isServiceDayDate(a.date));
}

// ============================================================
// CONSECUTIVE ABSENCES
// ============================================================
function hasConsecutiveAbsences(girlId, monthStr) {
  const absRecords = getAttendanceEntries()
    .filter(a =>
      a.girlId === girlId &&
      a.date?.startsWith(monthStr) &&
      a.status === 'غائب' &&
      isServiceDayDate(a.date)
    );

  if (absRecords.length < 2) return { hasConsecutive: false, count: absRecords.length, dates: [] };

  const absDates = [...new Set(absRecords.map(a => a.date))].sort();

  for (let i = 0; i < absDates.length - 1; i++) {
    const d1 = parseDate(absDates[i]);
    const d2 = parseDate(absDates[i + 1]);
    const diffDays = (d2 - d1) / (1000 * 60 * 60 * 24);
    if (diffDays <= 3) {
      return { hasConsecutive: true, count: absDates.length, dates: absDates };
    }
  }
  return { hasConsecutive: false, count: absDates.length, dates: absDates };
}

// ============================================================
// STATS BOUNDS
// ============================================================
function getStatsBounds() {
  const selectedDate = TimeContext.getDate();
  const selYear = parseInt(selectedDate.substring(0, 4));
  const selMonth = parseInt(selectedDate.substring(5, 7));

  switch (state.statsTimeFilter) {
    case 'today':
      return { start: selectedDate, end: selectedDate };
    case 'month': {
      const lastDay = new Date(selYear, selMonth, 0).getDate();
      return { start: selectedDate.substring(0, 7) + '-01', end: selectedDate.substring(0, 7) + '-' + String(lastDay).padStart(2, '0') };
    }
    case 'year':
      return { start: selectedDate.substring(0, 4) + '-01-01', end: selectedDate.substring(0, 4) + '-12-31' };
    default:
      return { start: '2000-01-01', end: selectedDate };
  }
}

function getPeriodBounds(period, customDate) {
  const selectedDate = customDate || TimeContext.getDate();
  const selYear = parseInt(selectedDate.substring(0, 4));
  const selMonth = parseInt(selectedDate.substring(5, 7));
  switch (period) {
    case 'today': return { start: selectedDate, end: selectedDate };
    case 'month': {
      const lastDay = new Date(selYear, selMonth, 0).getDate();
      return { start: selectedDate.substring(0, 7) + '-01', end: selectedDate.substring(0, 7) + '-' + String(lastDay).padStart(2, '0') };
    }
    case 'year': return { start: selectedDate.substring(0, 4) + '-01-01', end: selectedDate.substring(0, 4) + '-12-31' };
    case 'all': default: return { start: '2000-01-01', end: selectedDate };
  }
}

// ============================================================
// ARABIC TEXT NORMALIZATION
// ============================================================
function normalizeArabic(str) {
  if (!str) return '';
  return str.replace(/[\u064B-\u065F\u0670\u0640]/g, '')
    .replace(/[إأآا]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/ة/g, 'ه')
    .toLowerCase();
}

function normalizeName(name) {
  return name
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .toLowerCase();
}

function csvEscape(v) {
  return `"${String(v ?? '').replace(/"/g, '""')}"`;
}

// ============================================================
// GIRL LOOKUP — O(1) via cached Map
// ============================================================
function buildGirlMap() {
  state._girlMap = new Map();
  state.girls.forEach(g => {
    if (!g.isDeleted) state._girlMap.set(g.id, g);
  });
  state._girlMapDirty = false;
}

function getGirl(girlId) {
  if (!girlId) return null;
  if (state._girlMapDirty || !state._girlMap) buildGirlMap();
  return state._girlMap.get(girlId) || null;
}

function safeGirlName(girlId) {
  const g = getGirl(girlId);
  return g ? g.name : '';
}

function getActiveGirls() {
  return state.girls.filter(g => !g.isDeleted);
}

function getActiveGirlIds() {
  const ids = new Set();
  state.girls.forEach(g => { if (!g.isDeleted) ids.add(g.id); });
  return ids;
}

// ============================================================
// DEBOUNCE
// ============================================================
function debounce(fn, delay) {
  let timer;
  return function(...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}

// ============================================================
// DOWNLOAD HELPER
// ============================================================
function downloadFile(filename, content, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ============================================================
// GRADE FILTER SETUP (was missing — FIX)
// ============================================================
function setupGradeFilter(containerEl, stateKey, renderFn, stateAccessor) {
  if (!containerEl) return;
  containerEl.addEventListener('click', e => {
    const btn = e.target.closest('.grade-filter-btn');
    if (!btn) return;
    const grade = btn.dataset.grade || '';
    if (stateAccessor) {
      state[stateAccessor] = grade;
      localStorage.setItem('attendanceGradeFilter', grade);
    } else {
      state.filters[stateKey] = grade;
    }
    renderFn();
  });
}
