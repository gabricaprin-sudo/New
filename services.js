// ============================================================
// SERVICES — Firebase, Auth, IndexedDB, Data Sync
// ============================================================

// ============================================================
// FIREBASE IMPORTS WITH FALLBACK
// ============================================================
let firebaseApp, auth, db, provider;
let firebaseReady = false;
let XLSX = null;

async function initModules() {
  try {
    const { initializeApp } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js');
    const { getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult, onAuthStateChanged, signOut } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js');
    const { getFirestore, collection, doc, setDoc, getDocs, deleteDoc, query, orderBy, onSnapshot, writeBatch, where, limit, startAfter } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');

    const firebaseConfig = {
      apiKey: "AIzaSyB2cycBTKMjVg8S_fBYN8C-hwUk5FUF81Q",
      authDomain: "kenesa-e5efd.firebaseapp.com",
      projectId: "kenesa-e5efd",
      storageBucket: "kenesa-e5efd.firebasestorage.app",
      messagingSenderId: "227273753184",
      appId: "1:227273753184:web:ecdf258142ad55ed5cf905",
      measurementId: "G-6HS8KNW1GZ"
    };

    firebaseApp = initializeApp(firebaseConfig);
    auth = getAuth(firebaseApp);
    db = getFirestore(firebaseApp);
    provider = new GoogleAuthProvider();
    firebaseReady = true;

    window._fb = { collection, doc, setDoc, getDocs, deleteDoc, query, orderBy, onSnapshot, writeBatch, where, limit, startAfter, signInWithPopup, signInWithRedirect, getRedirectResult, onAuthStateChanged, signOut };

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
    return false;
  }
}

// ============================================================
// INDEXEDDB — Offline storage wrapper
// ============================================================
const IDB = {
  db: null,
  DB_NAME: 'girlsTrackerDB',
  DB_VERSION: 1,

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

  async getPage(storeName, limit, offset) {
    if (!this.db) return [];
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const request = store.openCursor(null, 'prev');
      const results = [];
      let skipped = 0;
      request.onsuccess = (event) => {
        const cursor = event.target.result;
        if (!cursor) { resolve(results); return; }
        if (skipped < offset) { skipped++; cursor.continue(); return; }
        if (results.length < limit) {
          results.push(cursor.value);
          cursor.continue();
        } else {
          resolve(results);
        }
      };
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
  },

  async count(storeName) {
    if (!this.db) return 0;
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const request = store.count();
      request.onsuccess = () => resolve(request.result || 0);
      request.onerror = () => reject(request.error);
    });
  }
};

// ============================================================
// AUTH
// ============================================================
async function initAuth() {
  if (!firebaseReady || !window._fb) {
    console.error('Firebase not available');
    hideSplash();
    showLogin();
    return;
  }

  try {
    const { getRedirectResult, onAuthStateChanged } = window._fb;
    try { await getRedirectResult(auth); } catch (e) { console.error('getRedirectResult error:', e); }

    onAuthStateChanged(auth, async (user) => {
      hideSplash();
      if (!user) {
        state.currentUser = null;
        state.appInitialized = false;
        state.girls = [];
        state.attendanceData = {};
        showLogin();
        return;
      }
      state.currentUser = user;
      showApp(user);
      if (!state.appInitialized) {
        state.appInitialized = true;
        await loadData();
        renderPage();
      }
    });
  } catch (e) {
    console.error('Auth init error:', e);
    hideSplash();
    showLogin();
  }
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
// FIREBASE DATA LISTENERS
// ============================================================
async function loadData() {
  try {
    if (!firebaseReady || !window._fb) return;

    const { onSnapshot: _onSnapshot, query: _query, collection: _collection, orderBy: _orderBy, getDocs: _getDocs, doc: _doc, setDoc: _setDoc, writeBatch: _writeBatch, deleteDoc: _deleteDoc, limit: _limit } = window._fb;

    _onSnapshot(_query(_collection(db, 'girls'), _orderBy('name')), snap => {
      let changed = false;
      for (const change of snap.docChanges()) {
        const g = { id: change.doc.id, ...change.doc.data() };
        if (change.type === 'removed' || g.isDeleted) {
          state.girls = state.girls.filter(x => x.id !== g.id);
          changed = true;
        } else {
          const idx = state.girls.findIndex(x => x.id === g.id);
          idx >= 0 ? (state.girls[idx] = g) : state.girls.push(g);
          changed = true;
        }
      }
      state.girls.sort((a, b) => a.name.localeCompare(b.name, 'ar'));
      if (changed) {
        state._girlMapDirty = true;
        scheduleRender();
      }
    });

    _onSnapshot(_query(_collection(db, 'attendance'), _orderBy('date', 'desc')), snap => {
      let changed = false;
      for (const change of snap.docChanges()) {
        const a = { id: change.doc.id, ...change.doc.data() };
        if (change.type === 'removed') {
          delete state.attendanceData[a.id];
          changed = true;
        } else {
          state.attendanceData[a.id] = a;
          changed = true;
        }
      }
      if (changed) {
        invalidateAttendanceCache();
        scheduleRender();
      }
    });

    _onSnapshot(_query(_collection(db, 'history'), _orderBy('timestamp', 'desc'), _limit(1)), async snap => {
      for (const change of snap.docChanges()) {
        const log = { id: change.doc.id, ...change.doc.data() };
        if (change.type === 'removed') {
          try { await IDB.delete('history', log.id); } catch (e) { }
        } else {
          try { await IDB.add('history', log); } catch (e) { }
        }
      }
    });
  } catch (e) { console.error('Load error:', e); }
}

// ============================================================
// HISTORY LOGGING
// ============================================================
function getHistoryIcon(action) {
  const safeAction = String(action || '');
  if (safeAction.includes('إضافة')) return '&#10133;';
  if (safeAction.includes('تعديل')) return '&#9999;';
  if (safeAction.includes('حذف')) return '&#10060;';
  if (safeAction.includes('حضور')) return '&#128203;';
  if (safeAction.includes('تقييم')) return '&#11088;';
  return '&#128221;';
}

async function logHistory(action, detail) {
  const log = {
    id: 'log_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
    action, detail,
    by: state.currentUser?.displayName || 'خادم',
    byEmail: state.currentUser?.email || '',
    timestamp: Date.now()
  };
  try { await IDB.add('history', log); } catch (e) { console.warn('IDB history save failed:', e); }
  if (firebaseReady && window._fb) {
    try { await window._fb.setDoc(window._fb.doc(db, 'history', log.id), log); } catch (e) { }
  }
}

// ============================================================
// AUTO-MARK ABSENT HELPERS
// ============================================================
async function autoMarkAbsentForNewGirl(girlId, date) {
  if (!isServiceDayDate(date)) return;

  const dayName = DateUtil.dayName(new Date(date + 'T00:00:00'));
  const batchRecords = [];

  for (const activity of ACTIVITIES) {
    const key = `${girlId}_${date}_${activity}`;
    if (!state.attendanceData[key]) {
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
    }
  }

  for (const rec of batchRecords) {
    state.attendanceData[rec.id] = rec;
  }

  if (firebaseReady && window._fb && batchRecords.length > 0) {
    try {
      const batch = window._fb.writeBatch(db);
      for (const rec of batchRecords) {
        batch.set(window._fb.doc(db, 'attendance', rec.id), rec);
      }
      await batch.commit();
    } catch (e) {
      console.error('Auto-absent batch save error:', e);
    }
  }
}

// ============================================================
// BOOTSTRAP HELPER
// ============================================================
function withTimeout(promise, ms, fallback) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      console.warn(`Timeout after ${ms}ms, using fallback`);
      resolve(fallback);
    }, ms);
    promise.then((val) => { clearTimeout(timer); resolve(val); })
           .catch((err) => { clearTimeout(timer); console.warn('Promise rejected:', err); resolve(fallback); });
  });
}
