// ============================================================
// UI — All Render Functions, Modals, Stats Calculations
// ============================================================

// ============================================================
// SPLASH & TOAST
// ============================================================
let splashDone = false;
let splashForceHidden = false;
let toastTimeout;

function hideSplashForced() {
  if (splashForceHidden) return;
  splashForceHidden = true;
  const splash = document.getElementById('splash');
  if (splash) {
    splash.classList.add('fade-out');
    setTimeout(() => splash.remove(), 500);
  }
  setTimeout(() => {
    try {
      const loginScreen = document.getElementById('loginScreen');
      const mainApp = document.getElementById('mainApp');
      if (loginScreen && mainApp && mainApp.classList.contains('hidden') && loginScreen.classList.contains('hidden')) {
        loginScreen.classList.remove('hidden');
        showLogin();
      }
    } catch (e) { console.error('Fallback error:', e); }
  }, 600);
}

function hideSplash() {
  if (splashDone) return;
  splashDone = true;
  splashForceHidden = true;
  if (DOM.splash) {
    DOM.splash.classList.add('fade-out');
    setTimeout(() => { if (DOM.splash) DOM.splash.remove(); }, 500);
  }
}

function showToast(msg, type = 'info') {
  clearTimeout(toastTimeout);
  if (!DOM.toast) return;
  DOM.toast.textContent = msg;
  DOM.toast.className = `toast show ${type}`;
  toastTimeout = setTimeout(() => { if (DOM.toast) DOM.toast.className = 'toast hidden'; }, 3000);
}

// ============================================================
// DARK MODE
// ============================================================
function initDarkMode() {
  const saved = localStorage.getItem('darkMode');
  if (saved === 'true') {
    document.documentElement.setAttribute('data-theme', 'dark');
    if (DOM.darkToggleSwitch) DOM.darkToggleSwitch.classList.add('on');
  }
}

// ============================================================
// RENDER ENGINE
// ============================================================
function scheduleRender() {
  cancelAnimationFrame(state.renderTimeout);
  state.renderTimeout = requestAnimationFrame(() => renderPage());
}

let _pendingRender = null;
function renderPage() {
  cancelAnimationFrame(_pendingRender);
  _pendingRender = requestAnimationFrame(() => {
    _pendingRender = null;
    switch (state.currentPage) {
      case 'home': renderHome(); break;
      case 'attendance': renderAttendancePage(); break;
      case 'girls': renderGirlsList(); break;
      case 'calendar': renderCalendar(); break;
      case 'stats': renderStats(); break;
      case 'history': renderHistory(false); break;
      case 'export': renderExport(); break;
    }
  });
}

// ============================================================
// NAVIGATION
// ============================================================
function navigateTo(page) {
  const pageEl = document.getElementById(`page-${page}`);
  if (!pageEl) {
    console.warn(`Page element not found: page-${page}`);
    return;
  }

  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  pageEl.classList.add('active');
  document.querySelectorAll('.nav-btn').forEach(b => {
    const isActive = b.dataset.page === page;
    b.classList.toggle('active', isActive);
    b.setAttribute('aria-pressed', isActive);
  });
  document.querySelectorAll('.menu-item[data-page]').forEach(b => b.classList.toggle('active', b.dataset.page === page));
  const [title, sub] = PAGE_TITLES[page] || [page, ''];
  if (DOM.pageTitle) DOM.pageTitle.textContent = title;
  if (DOM.pageSubtitle) DOM.pageSubtitle.textContent = sub;
  state.currentPage = page;

  if (page === 'attendance') {
    state.attendancePageInitialized = false;
  }
  if (page !== 'calendar') {
    hideDayDetail();
  }

  renderPage();
  closeDrawer();
}

function openDrawer() {
  if (DOM.drawer) DOM.drawer.classList.add('open');
  if (DOM.drawerOverlay) DOM.drawerOverlay.classList.add('show');
}
function closeDrawer() {
  if (DOM.drawer) DOM.drawer.classList.remove('open');
  if (DOM.drawerOverlay) DOM.drawerOverlay.classList.remove('show');
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
  if (DOM.confirmIcon) DOM.confirmIcon.innerHTML = icon;
  if (DOM.confirmTitle) DOM.confirmTitle.textContent = title;
  if (DOM.confirmMsg) DOM.confirmMsg.textContent = msg;
  const okBtn = DOM.confirmOk;
  if (okBtn) {
    okBtn.textContent = okLabel;
    okBtn.className = 'confirm-ok';
    if (okClass) okBtn.classList.add(...okClass.split(' ').filter(Boolean));
  }
  confirmResolve = null;
  confirmResolve = onOk;
  if (DOM.confirmOverlay) DOM.confirmOverlay.classList.add('show');
}

// ============================================================
// HOME PAGE
// ============================================================
function getBestGradeFiltered(monthStr, gradeFilter) {
  let activeGirls = getActiveGirls();
  const [year, month] = monthStr.split('-').map(Number);
  const totalServiceDays = getServiceDaysInMonth(year, month - 1).length || 1;

  const gradeStats = {};
  activeGirls.forEach(g => {
    if (gradeFilter && g.grade !== gradeFilter) return;
    if (!gradeStats[g.grade]) gradeStats[g.grade] = { totalGirls: 0, presentDates: new Set() };
    gradeStats[g.grade].totalGirls++;
  });

  getAttendanceEntries().forEach(a => {
    if (!a.date?.startsWith(monthStr)) return;
    if (!isServiceDayDate(a.date)) return;
    if (a.status !== 'حاضر') return;
    const girl = getGirl(a.girlId);
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
  const activeGirlIds = gradeFilter
    ? new Set(getActiveGirls().filter(g => g.grade === gradeFilter).map(g => g.id))
    : getActiveGirlIds();
  const counts = {};
  ACTIVITIES.forEach(a => counts[a] = 0);

  getAttendanceEntries().forEach(a => {
    if (!a.date?.startsWith(monthStr)) return;
    if (!isServiceDayDate(a.date)) return;
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
  let activeGirls = getActiveGirls();
  if (gradeFilter) activeGirls = activeGirls.filter(g => g.grade === gradeFilter);
  if (!activeGirls.length) return null;

  const [year, month] = monthStr.split('-').map(Number);
  const totalServiceDays = getServiceDaysInMonth(year, month - 1).length || 1;

  const presentDatesByGirl = {};
  activeGirls.forEach(g => presentDatesByGirl[g.id] = new Set());

  getAttendanceEntries().forEach(a => {
    if (!a.date?.startsWith(monthStr)) return;
    if (!isServiceDayDate(a.date)) return;
    if (a.status === 'حاضر' && presentDatesByGirl[a.girlId] !== undefined) {
      presentDatesByGirl[a.girlId].add(a.date);
    }
  });

  let best = null;
  Object.entries(presentDatesByGirl).forEach(([girlId, dateSet]) => {
    const count = dateSet.size;
    if (count === 0) return;
    const percent = (count / totalServiceDays) * 100;
    const girl = getGirl(girlId);
    if (!girl) return;
    if (!best || percent > best.percent || (percent === best.percent && (count > best.count || girl.name.localeCompare(best.name, 'ar') < 0))) {
      best = { name: girl.name, count, percent };
    }
  });
  return best;
}

function renderHome() {
  const selectedDate = TimeContext.getDate();
  const now = new Date(selectedDate + 'T00:00:00');
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
  let activeGirls = getActiveGirls();
  if (gradeFilter) activeGirls = activeGirls.filter(g => g.grade === gradeFilter);
  const activeGirlIds = new Set(activeGirls.map(g => g.id));

  const allActive = getActiveGirls();
  const hfcAll = document.getElementById('homeFilterCountAll');
  const hfc1 = document.getElementById('homeFilterCount1');
  const hfc2 = document.getElementById('homeFilterCount2');
  const hfc3 = document.getElementById('homeFilterCount3');
  if (hfcAll) hfcAll.textContent = allActive.length;
  if (hfc1) hfc1.textContent = allActive.filter(g => g.grade === 'أولى إعدادي').length;
  if (hfc2) hfc2.textContent = allActive.filter(g => g.grade === 'تانية إعدادي').length;
  if (hfc3) hfc3.textContent = allActive.filter(g => g.grade === 'تالتة إعدادي').length;

  document.querySelectorAll('#homeGradeFilters .grade-filter-btn').forEach(btn => {
    const isActive = btn.dataset.grade === gradeFilter;
    btn.classList.toggle('active', isActive);
    btn.setAttribute('aria-selected', isActive);
  });

  if (DOM.statTotal) DOM.statTotal.textContent = activeGirls.length;

  const presentGirlIds = new Set();
  const absentGirlIds = new Set();
  const todayRecordsByGirl = {};

  getAttendanceEntries().forEach(a => {
    if (a.date !== dateStr) return;
    if (!activeGirlIds.has(a.girlId)) return;
    if (!todayRecordsByGirl[a.girlId]) todayRecordsByGirl[a.girlId] = [];
    todayRecordsByGirl[a.girlId].push(a);
  });

  activeGirls.forEach(g => {
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

  let totalRating = 0, ratingCount = 0;
  getAttendanceEntries().forEach(a => {
    if (a.date?.startsWith(monthStr) && a.rating > 0 && activeGirlIds.has(a.girlId) && isServiceDayDate(a.date)) {
      totalRating += a.rating; ratingCount++;
    }
  });
  if (DOM.statAvgRating) DOM.statAvgRating.textContent = ratingCount ? (totalRating / ratingCount).toFixed(1) : '-';

  const bestGrade = getBestGradeFiltered(monthStr, gradeFilter);
  if (DOM.bestGrade && DOM.bestGradePercent) {
    if (bestGrade && bestGrade.percent > 0) {
      DOM.bestGrade.textContent = bestGrade.grade;
      DOM.bestGradePercent.textContent = `${Math.round(bestGrade.percent)}% حضور`;
    } else {
      DOM.bestGrade.textContent = gradeFilter || '-';
      DOM.bestGradePercent.textContent = gradeFilter ? 'لا توجد بيانات' : 'أفضل سنة دراسية';
    }
  }

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

  const presentDatesByGirl = {};
  activeGirls.forEach(g => presentDatesByGirl[g.id] = new Set());
  getAttendanceEntries().forEach(a => {
    if (a.date?.startsWith(monthStr) && a.status === 'حاضر' && presentDatesByGirl[a.girlId] !== undefined && isServiceDayDate(a.date)) {
      presentDatesByGirl[a.girlId].add(a.date);
    }
  });
  const counts = {};
  Object.entries(presentDatesByGirl).forEach(([id, dateSet]) => { counts[id] = dateSet.size; });
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ar')).slice(0, 5);

  if (DOM.topAttendees) {
    if (!sorted.length || !sorted[0][1]) {
      DOM.topAttendees.innerHTML = '<div class="empty-state">لا توجد بيانات حضور هذا الشهر</div>';
    } else {
      const frag = document.createDocumentFragment();
      sorted.forEach(([id, count], i) => {
        if (!count) return;
        const g = getGirl(id);
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

  const needs = activeGirls.filter(g => {
    const result = hasConsecutiveAbsences(g.id, monthStr);
    return result.hasConsecutive;
  });

  if (DOM.needsFollowup) {
    if (!needs.length) {
      DOM.needsFollowup.innerHTML = '<div class="empty-state">لا توجد حالات تحتاج متابعة</div>';
    } else {
      const frag = document.createDocumentFragment();
      needs.forEach(g => {
        const result = hasConsecutiveAbsences(g.id, monthStr);
        const div = document.createElement('div');
        div.className = 'followup-item';
        div.dataset.girlId = g.id;
        div.innerHTML = `<span class="followup-name">${esc(g.name)}</span><span class="followup-badge">${result.count} غياب متتالي</span>`;
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
function doGlobalSearch() {
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
}

// ============================================================
// GIRLS PAGE
// ============================================================
function renderGirlsList() {
  const filter = state.girlsGradeFilter;
  const searchQuery = (state.girlsSearchQuery || '').trim();
  let activeGirls = getActiveGirls();

  if (searchQuery) {
    const qNorm = normalizeArabic(searchQuery);
    activeGirls = activeGirls.filter(g => normalizeArabic(g.name).includes(qNorm));
  }

  const filtered = filter ? activeGirls.filter(g => g.grade === filter) : activeGirls;
  const el = DOM.girlsList;
  if (!el) return;

  const gfcAll = document.getElementById('girlsFilterCountAll');
  const gfc1 = document.getElementById('girlsFilterCount1');
  const gfc2 = document.getElementById('girlsFilterCount2');
  const gfc3 = document.getElementById('girlsFilterCount3');
  if (gfcAll) gfcAll.textContent = activeGirls.length;
  if (gfc1) gfc1.textContent = activeGirls.filter(g => g.grade === 'أولى إعدادي').length;
  if (gfc2) gfc2.textContent = activeGirls.filter(g => g.grade === 'تانية إعدادي').length;
  if (gfc3) gfc3.textContent = activeGirls.filter(g => g.grade === 'تالتة إعدادي').length;

  document.querySelectorAll('#girlsGradeFilters .grade-filter-btn').forEach(btn => {
    const isActive = btn.dataset.grade === filter;
    btn.classList.toggle('active', isActive);
    btn.setAttribute('aria-selected', isActive);
  });

  if (!filtered.length) {
    el.innerHTML = '<div class="empty-state">لا توجد مخدومات<br><small>اضغط + لإضافة مخدومة جديدة</small></div>';
    return;
  }
  const monthStr = TimeContext.getMonth();
  const frag = document.createDocumentFragment();

  filtered.forEach(g => {
    let presents = 0, absents = 0;
    getAttendanceEntries().forEach(a => {
      if (a.girlId !== g.id || !a.date?.startsWith(monthStr)) return;
      if (a.status === 'حاضر') presents++;
      else if (a.status === 'غائب') absents++;
    });
    const div = document.createElement('div');
    div.className = 'girl-card';
    div.dataset.girlId = g.id;
    div.innerHTML = `
      <div class="girl-avatar">${esc(g.name[0])}</div>
      <div class="girl-info">
        <span class="girl-name">${esc(g.name)}</span>
        <span class="girl-grade">${esc(g.grade)}</span>
        ${g.phone ? `<a href="tel:${esc(g.phone)}" class="girl-phone-link" data-phone="${esc(g.phone)}" onclick="event.stopPropagation();">${esc(g.phone)}</a>` : ''}
        <div class="girl-stats"><span class="green-text">&#10003;${presents}</span><span class="red-text">&#10007;${absents}</span></div>
      </div>
      <button class="edit-btn" data-girl-id="${esc(g.id)}" aria-label="تعديل ${esc(g.name)}">&#9999;</button>`;
    frag.appendChild(div);
  });
  el.innerHTML = '';
  el.appendChild(frag);
}

function editGirl(id) {
  const g = getGirl(id);
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
// GIRL PROFILE
// ============================================================
function showGirlProfile(id) {
  const g = getGirl(id);
  if (!g) return;
  state.currentProfileGirlId = id;
  if (DOM.profileName) DOM.profileName.textContent = g.name;

  const girlAtt = Object.values(state.attendanceData).filter(a => a.girlId === id);
  girlAtt.sort((a, b) => new Date(b.date) - new Date(a.date));

  const totalRecords = girlAtt.length;
  const presentCount = girlAtt.filter(a => a.status === 'حاضر').length;
  const absentCount = girlAtt.filter(a => a.status === 'غائب').length;
  const attendanceRate = totalRecords > 0 ? Math.round((presentCount / totalRecords) * 100) : 0;
  const ratings = girlAtt.filter(a => a.rating > 0).map(a => a.rating);
  const avgRating = ratings.length ? (ratings.reduce((a, b) => a + b, 0) / ratings.length).toFixed(1) : '0';
  const lastAttendance = girlAtt.find(a => a.status === 'حاضر');
  const lastDate = lastAttendance ? lastAttendance.date : '-';

  const months = {};
  girlAtt.forEach(a => {
    const m = a.date?.substring(0, 7);
    if (!m) return;
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
            const safeRating = Math.max(0, Math.min(5, r.rating || 0));
            const stars = safeRating ? '&#9733;'.repeat(safeRating) + '&#9734;'.repeat(5 - safeRating) : '';
            return `<div class="profile-record">
              <span class="rec-date">${esc(r.date)} ${esc(DAY_NAMES[new Date(r.date + 'T00:00:00').getDay()] || '')}</span>
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

// ============================================================
// ATTENDANCE PAGE
// ============================================================
function getCurrentServiceDay() {
  const dayOfWeek = new Date().getDay();
  const dayMap = { 6: 'السبت', 1: 'الاثنين', 3: 'الاربعاء' };
  return dayMap[dayOfWeek] || null;
}

function setActiveDay(day) {
  state.selectedDay = day;
  document.querySelectorAll('.day-btn').forEach(b => {
    const isActive = b.dataset.day === day;
    b.classList.toggle('active', isActive);
    b.setAttribute('aria-selected', isActive);
  });
}

function setActiveActivity(act) {
  state.selectedActivity = act;
  document.querySelectorAll('.act-tab').forEach(b => {
    const isActive = b.dataset.activity === act;
    b.classList.toggle('active', isActive);
    b.setAttribute('aria-selected', isActive);
  });
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

  const date = DOM.attendanceDate.value;
  const activeGirls = getActiveGirls();

  const hasAnyRecordsForDate = activeGirls.some(g => {
    return ACTIVITIES.some(act => {
      const key = `${g.id}_${date}_${act}`;
      return state.attendanceData[key];
    });
  });

  if (activeGirls.length > 0 && !hasAnyRecordsForDate && isServiceDayDate(date) && !state.attendancePageInitialized) {
    state.attendancePageInitialized = true;
    markAllAbsentForDate(date);
    return;
  }

  state.attendancePageInitialized = true;
  renderAttendanceList();
}

function renderAttendanceList() {
  if (!DOM.attendanceDate || !DOM.attendanceList) return;
  const date = DOM.attendanceDate.value;
  const el = DOM.attendanceList;
  if (!date) { el.innerHTML = '<div class="empty-state">الرجاء اختيار التاريخ</div>'; return; }

  let activeGirls = getActiveGirls();

  const gradeFilter = state.attendanceGradeFilter;
  if (gradeFilter) {
    activeGirls = activeGirls.filter(g => g.grade === gradeFilter);
  }

  const searchQuery = DOM.attendanceSearch?.value?.trim() || '';
  if (searchQuery) {
    const qNorm = normalizeArabic(searchQuery);
    activeGirls = activeGirls.filter(g => normalizeArabic(g.name).includes(qNorm));
  }

  let present = 0, absent = 0;
  const frag = document.createDocumentFragment();

  if (searchQuery && !activeGirls.length) {
    el.innerHTML = '<div class="empty-state">لا توجد نتائج للبحث</div>';
    if (DOM.presentCount) DOM.presentCount.textContent = 0;
    if (DOM.absentCount) DOM.absentCount.textContent = 0;
    if (DOM.totalCount) DOM.totalCount.textContent = 0;
    return;
  }

  const allActiveGirls = getActiveGirls();
  const attFilterCountAll = document.getElementById('attFilterCountAll');
  const attFilterCount1 = document.getElementById('attFilterCount1');
  const attFilterCount2 = document.getElementById('attFilterCount2');
  const attFilterCount3 = document.getElementById('attFilterCount3');
  if (attFilterCountAll) attFilterCountAll.textContent = allActiveGirls.length;
  if (attFilterCount1) attFilterCount1.textContent = allActiveGirls.filter(g => g.grade === 'أولى إعدادي').length;
  if (attFilterCount2) attFilterCount2.textContent = allActiveGirls.filter(g => g.grade === 'تانية إعدادي').length;
  if (attFilterCount3) attFilterCount3.textContent = allActiveGirls.filter(g => g.grade === 'تالتة إعدادي').length;

  document.querySelectorAll('#attendanceGradeFilters .grade-filter-btn').forEach(btn => {
    const isActive = btn.dataset.grade === gradeFilter;
    btn.classList.toggle('active', isActive);
    btn.setAttribute('aria-selected', isActive);
  });

  if (!activeGirls.length) {
    el.innerHTML = '<div class="empty-state">لا توجد مخدومات مسجلة<br><small>أضف مخدومات أولاً من صفحة المخدومات</small></div>';
    if (DOM.presentCount) DOM.presentCount.textContent = 0;
    if (DOM.absentCount) DOM.absentCount.textContent = 0;
    if (DOM.totalCount) DOM.totalCount.textContent = 0;
    return;
  }

  activeGirls.forEach(g => {
    const key = `${g.id}_${date}_${state.selectedActivity}`;
    const rec = state.attendanceData[key];
    let statusClass = 'absent', statusIcon = '&#10007;', statusText = 'غائب';
    if (rec?.status === 'حاضر') { statusClass = 'present'; statusIcon = '&#10003;'; statusText = 'حاضر'; present++; }
    else { absent++; }

    const safeRating = Math.max(0, Math.min(5, rec?.rating || 0));
    const stars = safeRating ? '&#9733;'.repeat(safeRating) + '&#9734;'.repeat(5 - safeRating) : '';
    const currentRating = safeRating;
    const div = document.createElement('div');
    div.className = `att-item ${statusClass}`;
    div.dataset.girlId = g.id;
    div.dataset.attKey = key;
    div.dataset.girlName = g.name;

    let inlineRatingHtml = '';
    if (statusClass === 'present') {
      inlineRatingHtml = `<div class="att-inline-rating" data-att-key="${esc(key)}">
        <span class="att-inline-rating-label">التقييم:</span>
        <span class="att-inline-stars">
          ${[1,2,3,4,5].map(i => `<span class="att-inline-star ${i <= currentRating ? 'active' : ''}" data-val="${i}" role="button" aria-label="${i} نجمة">&#9733;</span>`).join('')}
        </span>
        ${currentRating > 0 ? `<span class="att-inline-rating-val">${currentRating}/5</span>` : '<span class="att-inline-rating-hint">اضغط نجمة للتقييم</span>'}
      </div>`;
    }

    div.innerHTML = `
      <div class="att-icon">${statusIcon}</div>
      <div class="att-info">
        <span class="att-name">${esc(g.name)}</span>
        <span class="att-grade">${esc(g.grade)}</span>
        ${stars ? `<span class="att-stars">${stars}</span>` : ''}
        ${inlineRatingHtml}
        ${rec?.notes ? `<span class="att-note">${esc(rec.notes)}</span>` : ''}
      </div>
      <span class="att-status-text ${statusClass}">${statusText}</span>`;
    frag.appendChild(div);
  });

  el.innerHTML = '';
  el.appendChild(frag);
  if (DOM.presentCount) DOM.presentCount.textContent = present;
  if (DOM.absentCount) DOM.absentCount.textContent = absent;
  if (DOM.totalCount) DOM.totalCount.textContent = activeGirls.length;
}

async function toggleAttendanceStatus(girlId, girlName, date) {
  const key = `${girlId}_${date}_${state.selectedActivity}`;
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

  state.attendanceData[key] = rec;
  invalidateAttendanceCache();

  if (firebaseReady && window._fb) {
    try { await window._fb.setDoc(window._fb.doc(db, 'attendance', key), rec); }
    catch (e) { console.error('Save attendance Firestore error:', e); }
  }

  renderAttendanceList();
  if (state.currentPage === 'home') renderHome();
  if (state.currentPage === 'stats') renderStats();
  if (state.currentPage === 'calendar') renderCalendar();
}

async function markAllAbsentForDate(date) {
  if (!isServiceDayDate(date)) return;

  const activeGirls = getActiveGirls();
  if (activeGirls.length === 0) {
    renderAttendanceList();
    return;
  }

  const batchRecords = [];

  for (const g of activeGirls) {
    for (const activity of ACTIVITIES) {
      const key = `${g.id}_${date}_${activity}`;
      if (!state.attendanceData[key]) {
        const rec = {
          id: key,
          girlId: g.id,
          date,
          day: state.selectedDay,
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
      console.error('Batch save attendance Firestore error:', e);
    }
  }

  if (batchRecords.length > 0) {
    await logHistory('تسجيل حضور', `تعيين الغياب التلقائي ليوم ${date} (${state.selectedDay})`);
    showToast('تم تعيين الغياب التلقائي ليوم خدمة', 'info');
  }

  renderAttendanceList();
  if (state.currentPage === 'home') renderHome();
  if (state.currentPage === 'calendar') renderCalendar();
}

async function selectAllStatus(status) {
  if (!DOM.attendanceDate) return;
  const date = DOM.attendanceDate.value;
  if (!date) { showToast('الرجاء اختيار التاريخ أولاً', 'error'); return; }

  const activeGirls = getActiveGirls();
  const batchRecords = [];

  for (const g of activeGirls) {
    const key = `${g.id}_${date}_${state.selectedActivity}`;
    const rec = {
      id: key,
      girlId: g.id,
      date,
      day: state.selectedDay,
      activity: state.selectedActivity,
      status: status,
      rating: status === 'حاضر' ? (state.attendanceData[key]?.rating || 0) : 0,
      notes: state.attendanceData[key]?.notes || '',
      updatedAt: Date.now(),
      updatedBy: state.currentUser?.displayName || 'خادم',
      updatedByEmail: state.currentUser?.email || ''
    };
    batchRecords.push(rec);
    state.attendanceData[key] = rec;
  }

  if (firebaseReady && window._fb && batchRecords.length > 0) {
    try {
      const batch = window._fb.writeBatch(db);
      for (const rec of batchRecords) {
        batch.set(window._fb.doc(db, 'attendance', rec.id), rec);
      }
      await batch.commit();
    } catch (e) {
      console.error('Batch save attendance Firestore error:', e);
    }
  }

  await logHistory('تسجيل حضور', `${status === 'حاضر' ? 'تحديد الكل حاضر' : 'تحديد الكل غائب'} - ${state.selectedActivity} - ${date}`);
  showToast(status === 'حاضر' ? 'تم تحديد الكل حاضر' : 'تم تحديد الكل غائب', 'success');
  renderAttendanceList();
  if (state.currentPage === 'home') renderHome();
  if (state.currentPage === 'stats') renderStats();
  if (state.currentPage === 'calendar') renderCalendar();
}

async function saveInlineRating(attKey, rating) {
  const safeRating = Math.max(0, Math.min(5, rating));
  const rec = state.attendanceData[attKey];
  if (!rec) return;
  if (rec.status !== 'حاضر') { showToast('التقييم متاح فقط للحاضرات', 'warning'); return; }

  const updatedRec = {
    ...rec,
    rating: safeRating,
    updatedAt: Date.now(),
    updatedBy: state.currentUser?.displayName || 'خادم',
    updatedByEmail: state.currentUser?.email || ''
  };

  state.attendanceData[attKey] = updatedRec;

  if (firebaseReady && window._fb) {
    try { await window._fb.setDoc(window._fb.doc(db, 'attendance', attKey), updatedRec); }
    catch (e) { console.error('Save inline rating Firestore error:', e); }
  }

  const g = getGirl(rec.girlId);
  await logHistory('تقييم مخدومة', `${g?.name || ''} - ${rec.activity} - ${rec.date} - ${safeRating} نجوم`);
  showToast(`تم التقييم: ${safeRating} نجوم`, 'success');

  renderAttendanceList();
  if (state.currentPage === 'home') renderHome();
  if (state.currentPage === 'stats') renderStats();
}

function openAttendanceEntry(girlId, girlName, date) {
  state.currentAttendanceGirlId = girlId;
  state.currentAttendanceRating = 0;
  if (DOM.attendanceModalTitle) DOM.attendanceModalTitle.textContent = `${state.selectedActivity} - ${date}`;
  if (DOM.modalGirlName) DOM.modalGirlName.textContent = girlName;
  if (DOM.attendanceNotes) DOM.attendanceNotes.value = '';

  const key = `${girlId}_${date}_${state.selectedActivity}`;
  const existing = state.attendanceData[key];
  if (existing) {
    document.querySelectorAll('.attend-btn').forEach(b => b.classList.toggle('selected', b.dataset.status === existing.status));
    setRating(existing.rating || 0);
    if (DOM.attendanceNotes) DOM.attendanceNotes.value = existing.notes || '';
    if (DOM.ratingSection) DOM.ratingSection.classList.toggle('hidden', existing.status !== 'حاضر');
  } else {
    document.querySelectorAll('.attend-btn').forEach(b => b.classList.remove('selected'));
    setRating(0);
    if (DOM.ratingSection) DOM.ratingSection.classList.add('hidden');
  }
  openModal('attendanceModal');
}

function setRating(val) {
  state.currentAttendanceRating = Math.max(0, Math.min(5, val));
  document.querySelectorAll('.star').forEach(s => s.classList.toggle('active', parseInt(s.dataset.val) <= state.currentAttendanceRating));
}

// ============================================================
// CALENDAR PAGE
// ============================================================
let currentDayDetailDate = null;

function renderCalendar() {
  const year = state.calendarDate.getFullYear();
  const month = state.calendarDate.getMonth();
  if (DOM.calMonthYear) DOM.calMonthYear.textContent = state.calendarDate.toLocaleDateString('ar-EG', { year: 'numeric', month: 'long' });

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const todayStr = TimeContext.getDate();

  let html = '<div class="cal-weekdays">';
  ['أح', 'إث', 'ثل', 'أر', 'خم', 'جم', 'سب'].forEach(d => html += `<div class="cal-wday">${d}</div>`);
  html += '</div><div class="cal-days">';
  for (let i = 0; i < firstDay; i++) html += '<div class="cal-day empty"></div>';

  const activeGirlIds = getActiveGirlIds();

  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${DateUtil.pad(month + 1)}-${DateUtil.pad(d)}`;
    const dayOfWeek = new Date(year, month, d).getDay();
    const isService = SERVICE_DAY_NUMBERS.includes(dayOfWeek);
    const hasData = getAttendanceEntries().some(a => a.date === dateStr && activeGirlIds.has(a.girlId));
    const isToday = dateStr === todayStr;
    html += `<div class="cal-day ${isService ? 'service-day' : ''} ${hasData ? 'has-data' : ''} ${isToday ? 'today' : ''}" data-date="${dateStr}">
      <span>${d}</span>${isService ? '<div class="service-dot"></div>' : ''}
    </div>`;
  }
  html += '</div>';
  if (DOM.calendarGrid) DOM.calendarGrid.innerHTML = html;

  const now = new Date();
  if (year === now.getFullYear() && month === now.getMonth() && !currentDayDetailDate) {
    currentDayDetailDate = todayStr;
    refreshDayDetail();
  } else if (currentDayDetailDate) {
    refreshDayDetail();
  }
}

function showDayDetail(dateStr) {
  currentDayDetailDate = dateStr;
  refreshDayDetail();
}

function refreshDayDetail() {
  if (!currentDayDetailDate || !DOM.dayDetail) return;
  const dateStr = currentDayDetailDate;
  const records = getAttendanceEntries().filter(a => a.date === dateStr);
  const el = DOM.dayDetail;

  const activeGirlIds = getActiveGirlIds();
  const filteredRecords = records.filter(r => activeGirlIds.has(r.girlId));

  if (!filteredRecords.length) {
    el.innerHTML = `<div class="day-detail-header">${dateStr}</div><div class="empty-state">لا توجد سجلات لهذا اليوم</div>`;
  } else {
    const grouped = {};
    filteredRecords.forEach(r => { if (!grouped[r.activity || 'عام']) grouped[r.activity || 'عام'] = []; grouped[r.activity || 'عام'].push(r); });
    let html = `<div class="day-detail-header">${dateStr}</div>`;
    Object.entries(grouped).forEach(([act, recs]) => {
      const presentCount = recs.filter(r => r.status === 'حاضر').length;
      const absentCount = recs.filter(r => r.status === 'غائب').length;
      html += `<div class="day-activity"><b>${esc(act)}</b>: <span class="green-text">${presentCount} حاضر</span> \u00B7 <span class="red-text">${absentCount} غائب</span> من ${recs.length}</div>`;
    });
    el.innerHTML = html;
  }
  el.classList.add('show');
}

function hideDayDetail() {
  currentDayDetailDate = null;
  if (DOM.dayDetail) DOM.dayDetail.classList.remove('show');
}

// ============================================================
// ACTIVITY STATS
// ============================================================
function getActivityStats(period, gradeFilter = '', customDate) {
  const activeGirlIds = gradeFilter
    ? new Set(getActiveGirls().filter(g => g.grade === gradeFilter).map(g => g.id))
    : getActiveGirlIds();
  const { start, end } = getPeriodBounds(period, customDate);

  const stats = {};
  ACTIVITIES.forEach(a => { stats[a] = { present: 0, absent: 0 }; });

  getAttendanceEntries().forEach(a => {
    if (!activeGirlIds.has(a.girlId)) return;
    if (a.date < start || a.date > end) return;
    if (!isServiceDayDate(a.date)) return;
    const act = a.activity || 'عام';
    if (stats.hasOwnProperty(act) && ACTIVITIES.includes(act)) {
      if (a.status === 'حاضر') stats[act].present++;
      else if (a.status === 'غائب') stats[act].absent++;
    }
  });

  return Object.entries(stats)
    .filter(([, data]) => data.present > 0 || data.absent > 0)
    .sort((a, b) => (b[1].present + b[1].absent) - (a[1].present + a[1].absent));
}

function renderActivityStats(period, gradeFilter = '') {
  const stats = getActivityStats(period, gradeFilter);
  const el = DOM.activityStatsGrid;
  if (!el) return;

  if (!stats.length) {
    el.innerHTML = '<div class="empty-state" style="grid-column:1/-1;">لا توجد بيانات حضور للفترة المحددة</div>';
    return;
  }

  const medals = ['&#129351;', '&#129352;', '&#129353;', '4', '5', '6', '7', '8'];

  el.innerHTML = stats.map(([activity, data], i) => `
    <div class="activity-stat-card" data-activity="${esc(activity)}" role="button" tabindex="0" aria-label="تفاصيل ${esc(activity)}">
      <div class="activity-stat-rank">${medals[i] || (i + 1)}</div>
      <div class="activity-stat-icon">${ACTIVITY_ICONS[activity] || '&#128202;'}</div>
      <div class="activity-stat-num">${data.present}</div>
      <div class="activity-stat-label">${esc(activity)}</div>
      <div class="activity-stat-absent">غائب: ${data.absent}</div>
    </div>
  `).join('');

  const periodLabels = { today: '(اليوم)', month: '(هذا الشهر)', year: '(هذه السنة)', all: '(الكل)' };
  if (DOM.activityStatsPeriod) DOM.activityStatsPeriod.textContent = periodLabels[period] || '';
}

// ============================================================
// ACTIVITY DETAIL MODAL
// ============================================================
function openActivityDetailModal(activity, period, gradeFilter = '', customDate) {
  const { start, end } = getPeriodBounds(period, customDate);
  let activeGirls = getActiveGirls();
  if (gradeFilter) activeGirls = activeGirls.filter(g => g.grade === gradeFilter);
  const activeGirlIds = new Set(activeGirls.map(g => g.id));
  const periodLabel = PERIOD_LABELS[period] || '';

  const records = getAttendanceEntries().filter(a => {
    if (a.activity !== activity) return false;
    if (!activeGirlIds.has(a.girlId)) return false;
    if (a.date < start || a.date > end) return false;
    return true;
  });

  const byGirl = {};
  records.forEach(a => { if (!byGirl[a.girlId]) byGirl[a.girlId] = []; byGirl[a.girlId].push(a); });

  const presentGirls = [];
  const absentGirls = [];

  Object.entries(byGirl).forEach(([girlId, girlRecords]) => {
    girlRecords.sort((a, b) => new Date(b.date) - new Date(a.date));
    const girl = getGirl(girlId);
    if (!girl) return;

    const pCount = girlRecords.filter(r => r.status === 'حاضر').length;
    const aCount = girlRecords.filter(r => r.status === 'غائب').length;
    const total = girlRecords.length;
    const rate = total > 0 ? Math.round((pCount / total) * 100) : 0;

    const entry = { girl, presentCount: pCount, absentCount: aCount, totalRecords: total, attendanceRate: rate, latestRecord: girlRecords[0] };
    if (pCount >= aCount) presentGirls.push(entry);
    else absentGirls.push(entry);
  });

  presentGirls.sort((a, b) => b.attendanceRate - a.attendanceRate || a.girl.name.localeCompare(b.girl.name, 'ar'));
  absentGirls.sort((a, b) => b.attendanceRate - a.attendanceRate || a.girl.name.localeCompare(b.girl.name, 'ar'));

  state.currentActivityDetail = { activity, period, presentGirls, absentGirls };
  state.activityDetailTab = 'present';

  if (DOM.activityDetailTitle) DOM.activityDetailTitle.textContent = `تفاصيل ${activity}`;
  if (DOM.activityDetailIcon) DOM.activityDetailIcon.innerHTML = ACTIVITY_ICONS[activity] || '&#128202;';
  if (DOM.activityDetailName) DOM.activityDetailName.textContent = activity;
  if (DOM.activityDetailPeriod) DOM.activityDetailPeriod.textContent = periodLabel;
  if (DOM.activityDetailTotal) DOM.activityDetailTotal.textContent = presentGirls.length + absentGirls.length;
  if (DOM.presentTabCount) DOM.presentTabCount.textContent = presentGirls.length;
  if (DOM.absentTabCount) DOM.absentTabCount.textContent = absentGirls.length;

  renderActivityDetailTab();
  openModal('activityDetailModal');
}

function renderActivityDetailTab() {
  if (!state.currentActivityDetail) return;
  const { presentGirls, absentGirls } = state.currentActivityDetail;
  const isPresentTab = state.activityDetailTab === 'present';
  const list = isPresentTab ? presentGirls : absentGirls;

  document.querySelectorAll('#activityDetailTabs .activity-detail-tab').forEach(tab => {
    tab.classList.toggle('active', tab.dataset.tab === state.activityDetailTab);
  });

  const el = DOM.activityDetailList;
  if (!el) return;
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
        <div class="detail-girl-grade">${esc(girl.grade)} \u00B7 ${presentCount} حضور \u00B7 ${absentCount} غياب \u00B7 ${attendanceRate}% نسبة \u00B7 آخر: ${esc(latestRecord.date)}</div>
      </div>
      <div class="detail-status-icon ${isPresentTab ? 'present' : 'absent'}">
        ${isPresentTab ? '&#10003;' : '&#10007;'}
      </div>`;
    frag.appendChild(div);
  });

  el.innerHTML = '';
  el.appendChild(frag);
}

// ============================================================
// STATS PAGE
// ============================================================
function renderStats() {
  const selectedDate = TimeContext.getDate();
  if (DOM.statsMonth) DOM.statsMonth.value = selectedDate;

  const { start, end } = getStatsBounds();

  document.querySelectorAll('#timeFilterTabs .time-filter-tab').forEach(btn => {
    const isActive = btn.dataset.period === state.statsTimeFilter;
    btn.classList.toggle('active', isActive);
    btn.setAttribute('aria-selected', isActive);
  });

  const gradeFilter = state.statsGradeFilter;
  document.querySelectorAll('#statsGradeFilter .stats-grade-btn').forEach(btn => {
    const isActive = btn.dataset.grade === gradeFilter;
    btn.classList.toggle('active', isActive);
    btn.setAttribute('aria-selected', isActive);
  });

  let activeGirls = getActiveGirls();
  if (gradeFilter) activeGirls = activeGirls.filter(g => g.grade === gradeFilter);
  const activeGirlIds = new Set(activeGirls.map(g => g.id));

  const monthAtt = getAttendanceEntries().filter(a =>
    a.date >= start && a.date <= end && activeGirlIds.has(a.girlId) && isServiceDayDate(a.date)
  );

  const totalSessions = new Set(monthAtt.map(a => a.date)).size;

  const recordsByGirlDate = {};
  monthAtt.forEach(a => {
    const key = `${a.girlId}_${a.date}`;
    if (!recordsByGirlDate[key]) recordsByGirlDate[key] = { girlId: a.girlId, date: a.date, hasPresent: false, hasAbsent: false };
    if (a.status === 'حاضر') recordsByGirlDate[key].hasPresent = true;
    if (a.status === 'غائب') recordsByGirlDate[key].hasAbsent = true;
  });

  let presents = 0;
  let absents = 0;
  Object.values(recordsByGirlDate).forEach(day => {
    if (day.hasPresent) presents++;
    else if (day.hasAbsent) absents++;
  });

  const ratings = monthAtt.filter(a => a.rating > 0).map(a => a.rating);
  const avgRating = ratings.length ? (ratings.reduce((a, b) => a + b, 0) / ratings.length).toFixed(1) : '-';

  const followupCount = activeGirls.filter(g => {
    const absDates = [...new Set(
      Object.values(state.attendanceData)
        .filter(a => a.girlId === g.id && a.date >= start && a.date <= end && a.status === 'غائب' && isServiceDayDate(a.date))
        .map(a => a.date)
    )].sort();
    if (absDates.length < 2) return false;
    for (let i = 0; i < absDates.length - 1; i++) {
      const d1 = new Date(absDates[i] + 'T00:00:00');
      const d2 = new Date(absDates[i + 1] + 'T00:00:00');
      const diffDays = (d2 - d1) / (1000 * 60 * 60 * 24);
      if (diffDays <= 3) return true;
    }
    return false;
  }).length;

  const dateLabel = new Date(selectedDate + 'T00:00:00').toLocaleDateString('ar-EG', { month: 'long', day: 'numeric' });

  if (DOM.bigStatsGrid) {
    DOM.bigStatsGrid.innerHTML = `
      <div class="big-stat-card"><div class="big-num">${activeGirls.length}</div><div>المخدومات</div></div>
      <div class="big-stat-card"><div class="big-num">${totalSessions}</div><div>أيام خدمة مسجلة</div></div>
      <div class="big-stat-card green-card"><div class="big-num">${presents}</div><div>إجمالي الحضور</div></div>
      <div class="big-stat-card red-card"><div class="big-num">${absents}</div><div>إجمالي الغياب</div></div>
      <div class="big-stat-card"><div class="big-num">${avgRating}</div><div>متوسط التقييم</div></div>
      <div class="big-stat-card orange-card"><div class="big-num">${followupCount}</div><div>تحتاج متابعة</div></div>`;
  }

  renderActivityStats(state.statsTimeFilter, gradeFilter);

  const gradeLabel = gradeFilter ? `\u00B7 ${gradeFilter}` : '';
  if (DOM.activityStatsGrade) DOM.activityStatsGrade.textContent = gradeLabel;

  const absenceByGirl = {};
  activeGirls.forEach(g => absenceByGirl[g.id] = new Set());
  monthAtt.filter(a => a.status === 'غائب').forEach(a => {
    if (absenceByGirl[a.girlId] !== undefined) absenceByGirl[a.girlId].add(a.date);
  });
  Object.keys(absenceByGirl).forEach(id => { absenceByGirl[id] = absenceByGirl[id].size; });
  const maxAbs = Math.max(...Object.values(absenceByGirl), 1);
  const sortedAbs = Object.entries(absenceByGirl).filter(([, c]) => c > 0).sort((a, b) => b[1] - a[1]).slice(0, 10);

  if (DOM.absenceChart) {
    DOM.absenceChart.innerHTML = sortedAbs.length
      ? sortedAbs.map(([id, count]) => {
        const g = getGirl(id);
        if (!g) return '';
        const pct = Math.round((count / maxAbs) * 100);
        return `<div class="chart-row">
          <span class="chart-name">${esc(g.name)}</span>
          <div class="chart-bar-wrap"><div class="chart-bar" style="width:${pct}%"></div></div>
          <span class="chart-val">${count}</span>
        </div>`;
      }).join('')
      : `<div class="empty-state">لا توجد غيابات حتى ${dateLabel} &#127881;</div>`;
  }

  const presentsByGirl = {};
  activeGirls.forEach(g => presentsByGirl[g.id] = new Set());
  monthAtt.filter(a => a.status === 'حاضر').forEach(a => {
    if (presentsByGirl[a.girlId] !== undefined) presentsByGirl[a.girlId].add(a.date);
  });
  Object.keys(presentsByGirl).forEach(id => { presentsByGirl[id] = presentsByGirl[id].size; });

  const sortedPresents = Object.entries(presentsByGirl)
    .filter(([, c]) => c > 0)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ar'));

  if (DOM.attendanceRanking) {
    DOM.attendanceRanking.innerHTML = sortedPresents.length
      ? sortedPresents.map(([id, count], i) => {
        const g = getGirl(id);
        if (!g) return '';
        return `<div class="rank-item">
          <span class="rank-num">${i + 1}</span>
          <span class="rank-name">${esc(g.name)}</span>
          <span class="rank-grade">${esc(g.grade)}</span>
          <span class="rank-count">${count} يوم</span>
        </div>`;
      }).join('')
      : `<div class="empty-state">لا توجد بيانات حضور حتى ${dateLabel}</div>`;
  }
}

// ============================================================
// HISTORY PAGE
// ============================================================
async function renderHistory(append = false) {
  const el = DOM.historyList;
  const filter = DOM.historyFilter?.value || '';
  if (!el) return;

  if (!append) {
    el.innerHTML = '<div class="empty-state">جارٍ التحميل...</div>';
    state.historyOffset = 0;
    state.historyLastDoc = null;
    state.historyHasMore = true;
    state.historyCurrentFilter = filter;
    state.historyLoadedPages = 0;
  }

  if (!state.historyHasMore) return;

  const allLogs = [];
  const seenIds = new Set();

  if (firebaseReady && window._fb) {
    try {
      const { collection, query, orderBy, limit, startAfter, getDocs } = window._fb;
      let q = query(
        collection(db, 'history'),
        orderBy('timestamp', 'desc'),
        limit(HISTORY_PAGE_SIZE)
      );
      if (state.historyLastDoc) {
        q = query(q, startAfter(state.historyLastDoc));
      }
      const snap = await getDocs(q);
      snap.docs.forEach(d => {
        const log = { id: d.id, ...d.data() };
        if (!seenIds.has(log.id)) {
          seenIds.add(log.id);
          allLogs.push(log);
        }
      });
      if (snap.docs.length > 0) {
        state.historyLastDoc = snap.docs[snap.docs.length - 1];
      }
      state.historyHasMore = snap.docs.length === HISTORY_PAGE_SIZE;
    } catch (e) { console.warn('Firestore history pagination failed:', e); }
  }

  if (allLogs.length < HISTORY_PAGE_SIZE) {
    try {
      const idbLogs = await IDB.getAll('history');
      const offset = append ? state.historyOffset : 0;
      let added = 0;
      idbLogs
        .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
        .slice(offset, offset + HISTORY_PAGE_SIZE)
        .forEach(log => {
          if (!seenIds.has(log.id) && added < HISTORY_PAGE_SIZE) {
            seenIds.add(log.id);
            allLogs.push(log);
            added++;
          }
        });
    } catch (e) { console.warn('IDB history load failed:', e); }
  }

  allLogs.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

  let filteredLogs = allLogs;
  if (filter) {
    const filterNorm = normalizeArabic(filter);
    filteredLogs = allLogs.filter(l => {
      const actionMatch = String(l.action || '').includes(filter);
      const detailMatch = String(l.detail || '').includes(filter);
      const actionNormMatch = normalizeArabic(l.action || '').includes(filterNorm);
      const detailNormMatch = normalizeArabic(l.detail || '').includes(filterNorm);
      return actionMatch || detailMatch || actionNormMatch || detailNormMatch;
    });
  }

  state.historyOffset += filteredLogs.length;
  state.historyLoadedPages++;

  if (!filteredLogs.length && !append) {
    el.innerHTML = '<div class="empty-state">لا توجد سجلات تاريخية</div>';
    if (DOM.loadMoreHistory) DOM.loadMoreHistory.classList.add('hidden');
    return;
  }

  if (!filteredLogs.length && append) {
    state.historyHasMore = false;
    if (DOM.loadMoreHistory) DOM.loadMoreHistory.classList.add('hidden');
    return;
  }

  const html = filteredLogs.map(log => `
    <div class="history-item">
      <div class="history-icon">${getHistoryIcon(log.action)}</div>
      <div class="history-info">
        <span class="history-action">${esc(log.action)}</span>
        <span class="history-detail">${esc(log.detail)}</span>
        <span class="history-meta">${esc(log.by || 'خادم')} &middot; ${new Date(log.timestamp).toLocaleString('ar-EG')}</span>
      </div>
    </div>`).join('');

  if (!append) el.innerHTML = html;
  else el.insertAdjacentHTML('beforeend', html);

  if (DOM.loadMoreHistory) DOM.loadMoreHistory.classList.toggle('hidden', !state.historyHasMore);
}

// ============================================================
// EXPORT PAGE
// ============================================================
function renderExport() {
  if (DOM.exportMonth) DOM.exportMonth.value = TimeContext.getDate();
  updateExportPreview();
}

function updateExportPreview() {
  const previewEl = DOM.exportPreview;
  if (!previewEl) return;

  const exportMode = document.querySelector('input[name="exportMode"]:checked')?.value || 'day';
  if (!DOM.exportMonth) return;
  const exportDate = (DOM.exportMonth?.value) || TimeContext.getDate();

  const activeGirls = getActiveGirls();
  const activeGirlIds = new Set(activeGirls.map(g => g.id));

  let html = '<div class="export-preview-content">';

  if (exportMode === 'month') {
    const [year, month] = exportDate.substring(0, 7).split('-').map(Number);
    const daysInMonth = new Date(year, month, 0).getDate();
    const exportStart = exportDate.substring(0, 7) + '-01';
    const exportEnd = exportDate.substring(0, 7) + '-' + String(daysInMonth).padStart(2, '0');
    const monthName = DateUtil.formatMonth(exportDate.substring(0, 7));

    const girlStats = {};
    activeGirls.forEach(g => {
      girlStats[g.id] = {
        name: g.name, grade: g.grade,
        ...Object.fromEntries(ACTIVITIES.map(a => [a, { present: 0, absent: 0 }])),
        totalPresent: 0, totalAbsent: 0
      };
    });

    getAttendanceEntries().forEach(a => {
      if (a.date < exportStart || a.date > exportEnd) return;
      if (!activeGirlIds.has(a.girlId)) return;
      if (!isServiceDayDate(a.date)) return;
      if (!girlStats[a.girlId]) return;
      if (girlStats[a.girlId][a.activity]) {
        if (a.status === 'حاضر') {
          girlStats[a.girlId][a.activity].present++;
          girlStats[a.girlId].totalPresent++;
        } else {
          girlStats[a.girlId][a.activity].absent++;
          girlStats[a.girlId].totalAbsent++;
        }
      }
    });

    const sortedGirls = [...Object.values(girlStats)].sort((a, b) => a.name.localeCompare(b.name, 'ar'));

    const uniquePresentSet = new Set();
    const uniqueAbsentSet = new Set();
    Object.values(state.attendanceData).forEach(a => {
      if (a.date < exportStart || a.date > exportEnd) return;
      if (!activeGirlIds.has(a.girlId)) return;
      if (!isServiceDayDate(a.date)) return;
      if (a.status === 'حاضر') uniquePresentSet.add(a.girlId + '_' + a.date);
      else if (a.status === 'غائب') uniqueAbsentSet.add(a.girlId + '_' + a.date);
    });
    const totalPresent = uniquePresentSet.size;
    const totalAbsent = uniqueAbsentSet.size;

    html += `<div class="preview-header">معاينة: ${monthName}</div>`;
    html += `<div class="preview-summary">${activeGirls.length} مخدومة \u00B7 ${totalPresent} حضور \u00B7 ${totalAbsent} غياب</div>`;
    html += '<div class="preview-table-wrap"><table class="preview-table">';
    html += '<tr><th>الاسم</th><th>السنة</th>' + ACTIVITIES.map(a => `<th>${esc(a)}</th>`).join('') + '<th>حضور</th><th>غياب</th></tr>';

    sortedGirls.slice(0, 20).forEach(g => {
      html += `<tr>
        <td>${esc(g.name)}</td>
        <td>${esc(g.grade)}</td>
        ${ACTIVITIES.map(a => `<td>${g[a].present} <span style="color:var(--red);font-size:11px">(${g[a].absent})</span></td>`).join('')}
        <td style="color:green;font-weight:700">${g.totalPresent}</td>
        <td style="color:red;font-weight:700">${g.totalAbsent}</td>
      </tr>`;
    });

    if (sortedGirls.length > 20) {
      html += `<tr><td colspan="${4 + ACTIVITIES.length}" style="text-align:center;color:var(--text-muted)">... و ${sortedGirls.length - 20} أخريات</td></tr>`;
    }
    html += '</table></div>';

  } else {
    const dayName = DAY_NAMES[new Date(exportDate + 'T00:00:00').getDay()] || '';
    const sortedGirls = [...activeGirls].sort((a, b) => a.name.localeCompare(b.name, 'ar'));

    html += `<div class="preview-header">معاينة: ${exportDate} (${dayName})</div>`;
    html += '<div class="preview-table-wrap"><table class="preview-table">';
    html += '<tr><th>الاسم</th><th>السنة</th>' + ACTIVITIES.map(a => `<th>${esc(a)}</th>`).join('') + '</tr>';

    sortedGirls.slice(0, 20).forEach(g => {
      html += `<tr><td>${esc(g.name)}</td><td>${esc(g.grade)}</td>`;
      ACTIVITIES.forEach(act => {
        const key = `${g.id}_${exportDate}_${act}`;
        const rec = state.attendanceData[key];
        if (rec) {
          html += rec.status === 'حاضر' ? '<td style="color:green;font-weight:700">&#10003;</td>' : '<td style="color:red;font-weight:700">&#10007;</td>';
        } else {
          html += '<td style="color:#ccc">—</td>';
        }
      });
      html += '</tr>';
    });

    if (sortedGirls.length > 20) {
      html += `<tr><td colspan="${2 + ACTIVITIES.length}" style="text-align:center;color:var(--text-muted)">... و ${sortedGirls.length - 20} أخريات</td></tr>`;
    }
    html += '</table></div>';
  }

  html += '</div>';
  previewEl.innerHTML = html;
}
