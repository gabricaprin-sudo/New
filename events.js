// ============================================================
// EVENTS — All Event Listeners, Delegation, Interactions
// ============================================================

// ============================================================
// GLOBAL ERROR HANDLERS
// ============================================================
window.addEventListener('error', (e) => {
  console.error('Global error:', e.error || e.message);
  try { hideSplashForced(); } catch (_) {}
});
window.addEventListener('unhandledrejection', (e) => {
  console.error('Unhandled rejection:', e.reason);
  try { hideSplashForced(); } catch (_) {}
});

// Force hide splash after 6 seconds max
setTimeout(hideSplashForced, 6000);

// ============================================================
// NAVIGATION EVENTS
// ============================================================
document.querySelectorAll('.nav-btn').forEach(btn =>
  btn.addEventListener('click', () => navigateTo(btn.dataset.page))
);

document.querySelectorAll('.menu-item[data-page]').forEach(item =>
  item.addEventListener('click', e => {
    e.preventDefault();
    navigateTo(item.dataset.page);
  })
);

if (DOM.menuBtn) DOM.menuBtn.addEventListener('click', openDrawer);
if (DOM.drawerOverlay) DOM.drawerOverlay.addEventListener('click', closeDrawer);

// ============================================================
// DARK MODE
// ============================================================
if (DOM.darkModeToggle) {
  DOM.darkModeToggle.addEventListener('click', () => {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    if (isDark) {
      document.documentElement.removeAttribute('data-theme');
      if (DOM.darkToggleSwitch) DOM.darkToggleSwitch.classList.remove('on');
      localStorage.setItem('darkMode', 'false');
    } else {
      document.documentElement.setAttribute('data-theme', 'dark');
      if (DOM.darkToggleSwitch) DOM.darkToggleSwitch.classList.add('on');
      localStorage.setItem('darkMode', 'true');
    }
  });
}

// ============================================================
// AUTH EVENTS
// ============================================================
if (DOM.googleSignIn) {
  DOM.googleSignIn.addEventListener('click', async () => {
    if (!firebaseReady || !window._fb) {
      showToast('الإنترنت غير متاح - استخدم وضع عدم الاتصال', 'warning');
      return;
    }
    DOM.googleSignIn.classList.add('is-loading');
    try {
      const { signInWithPopup } = window._fb;
      await signInWithPopup(auth, provider);
    } catch (e) {
      DOM.googleSignIn.classList.remove('is-loading');
      if (['auth/popup-blocked', 'auth/popup-closed-by-user', 'auth/cancelled-popup-request'].includes(e.code)) {
        try {
          const { signInWithRedirect } = window._fb;
          await signInWithRedirect(auth, provider);
        } catch (e2) { showToast('فشل تسجيل الدخول: ' + e2.message, 'error'); }
      } else {
        showToast('فشل تسجيل الدخول: ' + e.message, 'error');
      }
    }
  });
}

if (DOM.signOutBtn) {
  DOM.signOutBtn.addEventListener('click', async () => {
    if (!firebaseReady || !window._fb) {
      state.currentUser = null;
      state.appInitialized = false;
      showLogin();
      return;
    }
    const { signOut } = window._fb;
    await signOut(auth);
  });
}

// ============================================================
// SEARCH
// ============================================================
const debouncedSearch = debounce(doGlobalSearch, 250);
if (DOM.globalSearch) DOM.globalSearch.addEventListener('input', debouncedSearch);

// ============================================================
// GIRLS PAGE EVENTS
// ============================================================
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

if (DOM.deleteGirlBtn) {
  DOM.deleteGirlBtn.addEventListener('click', async () => {
    if (!state.editingGirlId || state.deleteInProgress) return;
    const g = getGirl(state.editingGirlId);
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
          state.girls = state.girls.filter(x => x.id !== id);
          state._girlMapDirty = true;
          const attKeys = Object.keys(state.attendanceData).filter(k => state.attendanceData[k].girlId === id);
          attKeys.forEach(k => delete state.attendanceData[k]);

          try {
            const { setDoc, doc, collection, query, where, getDocs, writeBatch } = window._fb;
            await setDoc(doc(db, 'girls', id), {
              isDeleted: true, deletedAt: Date.now(),
              deletedBy: state.currentUser?.email || '',
              name: g.name, grade: g.grade
            }, { merge: true });

            const attQuery = query(collection(db, 'attendance'), where('girlId', '==', id));
            const attSnap = await getDocs(attQuery);
            if (!attSnap.empty) {
              const docs = attSnap.docs;
              for (let i = 0; i < docs.length; i += 500) {
                const batch = writeBatch(db);
                docs.slice(i, i + 500).forEach(d => batch.delete(d.ref));
                await batch.commit();
              }
            }
          } catch (e) {
            console.error('Delete girl Firestore error:', e);
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
// SAVE GIRL
// ============================================================
if (DOM.saveGirlBtn) {
  DOM.saveGirlBtn.addEventListener('click', async () => {
    if (state.savingGirl) return;
    state.savingGirl = true;
    try {
      const name = DOM.girlName ? DOM.girlName.value.trim() : '';
      const phone = DOM.girlPhone ? DOM.girlPhone.value.trim() : '';
      const grade = DOM.girlGrade ? DOM.girlGrade.value : '';
      const notes = DOM.girlNotes ? DOM.girlNotes.value.trim() : '';

      if (!name) { showToast('الرجاء إدخال اسم المخدومة', 'error'); return; }
      if (!grade) { showToast('الرجاء اختيار السنة الدراسية', 'error'); return; }

      const normalizedName = normalizeName(name);
      const existingGirl = state.girls.find(g =>
        normalizeName(g.name) === normalizedName && g.id !== state.editingGirlId && !g.isDeleted
      );
      if (existingGirl) { showToast('هذه المخدومة موجودة بالفعل', 'error'); return; }

      const id = state.editingGirlId || 'girl_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
      const now = Date.now();
      const girlData = {
        id, name, phone, grade, notes,
        createdAt: state.editingGirlId ? (state.girls.find(g => g.id === state.editingGirlId)?.createdAt || now) : now,
        updatedAt: now,
        updatedBy: state.currentUser?.displayName || 'خادم',
        updatedByEmail: state.currentUser?.email || '',
        isDeleted: false
      };

      if (state.editingGirlId) {
        state.girls = state.girls.map(g => g.id === id ? girlData : g);
      } else {
        state.girls.push(girlData);
      }
      state._girlMapDirty = true;

      await logHistory(state.editingGirlId ? 'تعديل مخدومة' : 'إضافة مخدومة', `${name} - ${grade}`);

      const isNewGirl = !state.editingGirlId;

      if (firebaseReady && window._fb) {
        try { await window._fb.setDoc(window._fb.doc(db, 'girls', id), girlData); }
        catch (e) { console.error('Save girl Firestore error:', e); }
      }

      if (isNewGirl) {
        const todayStr = DateUtil.toStr();
        if (isServiceDayDate(todayStr)) {
          await autoMarkAbsentForNewGirl(id, todayStr);
        }
      }

      closeModal('girlModal');
      showToast(state.editingGirlId ? 'تم تعديل البيانات' : 'تمت إضافة المخدومة', 'success');
      state.editingGirlId = null;
      renderPage();
    } finally {
      state.savingGirl = false;
    }
  });
}

// ============================================================
// GIRL PROFILE EVENTS
// ============================================================
if (DOM.closeProfileModal) DOM.closeProfileModal.addEventListener('click', () => closeModal('girlProfileModal'));
if (DOM.editProfileBtn) {
  DOM.editProfileBtn.addEventListener('click', () => {
    closeModal('girlProfileModal');
    if (state.currentProfileGirlId) editGirl(state.currentProfileGirlId);
  });
}

if (DOM.shareProfileBtn) {
  DOM.shareProfileBtn.addEventListener('click', async () => {
    const id = state.currentProfileGirlId;
    if (!id) return;
    const g = getGirl(id);
    if (!g) return;

    const girlAtt = Object.values(state.attendanceData).filter(a => a.girlId === id);
    const presentCount = girlAtt.filter(a => a.status === 'حاضر').length;
    const absentCount = girlAtt.filter(a => a.status === 'غائب').length;
    const attendanceRate = girlAtt.length > 0 ? Math.round((presentCount / girlAtt.length) * 100) : 0;

    const shareText = `👧 ${g.name}
📚 ${g.grade}
✅ حضور: ${presentCount}
❌ غياب: ${absentCount}
📊 نسبة: ${attendanceRate}%`.trim();

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
// ATTENDANCE PAGE EVENTS
// ============================================================
document.querySelectorAll('.day-btn').forEach(b => b.addEventListener('click', () => {
  setActiveDay(b.dataset.day);
  state.attendancePageInitialized = false;
  renderAttendancePage();
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

const debouncedAttSearch = debounce(renderAttendanceList, 250);
if (DOM.attendanceSearch) DOM.attendanceSearch.addEventListener('input', debouncedAttSearch);

// ============================================================
// ATTENDANCE MODAL EVENTS
// ============================================================
document.querySelectorAll('.attend-btn').forEach(b => {
  b.addEventListener('click', () => {
    document.querySelectorAll('.attend-btn').forEach(x => x.classList.remove('selected'));
    b.classList.add('selected');
    if (DOM.ratingSection) DOM.ratingSection.classList.toggle('hidden', b.dataset.status !== 'حاضر');
  });
});

document.querySelectorAll('.star').forEach(s => s.addEventListener('click', () => setRating(parseInt(s.dataset.val))));

if (DOM.saveAttendanceEntry) {
  DOM.saveAttendanceEntry.addEventListener('click', async () => {
    if (!DOM.attendanceDate) return;
    const date = DOM.attendanceDate.value;
    const statusBtn = document.querySelector('.attend-btn.selected');
    if (!statusBtn) { showToast('الرجاء تحديد الحضور أو الغياب', 'error'); return; }

    const key = `${state.currentAttendanceGirlId}_${date}_${state.selectedActivity}`;
    const safeRating = Math.max(0, Math.min(5, state.currentAttendanceRating));
    const rec = {
      id: key,
      girlId: state.currentAttendanceGirlId,
      date,
      day: state.selectedDay,
      activity: state.selectedActivity,
      status: statusBtn.dataset.status,
      rating: statusBtn.dataset.status === 'حاضر' ? safeRating : 0,
      notes: DOM.attendanceNotes ? DOM.attendanceNotes.value.trim() : '',
      updatedAt: Date.now(),
      updatedBy: state.currentUser?.displayName || 'خادم',
      updatedByEmail: state.currentUser?.email || ''
    };

    state.attendanceData[key] = rec;

    if (firebaseReady && window._fb) {
      try { await window._fb.setDoc(window._fb.doc(db, 'attendance', key), rec); }
      catch (e) { console.error('Save attendance Firestore error:', e); }
    }

    const gName = getGirl(state.currentAttendanceGirlId)?.name || '';
    await logHistory('تسجيل حضور', `${gName} - ${state.selectedActivity} - ${date} - ${rec.status}`);
    closeModal('attendanceModal');
    showToast('تم الحفظ', 'success');
    renderAttendanceList();

    if (state.currentPage === 'home') renderHome();
    if (state.currentPage === 'stats') renderStats();
    if (state.currentPage === 'calendar') renderCalendar();
  });
}

// ============================================================
// CALENDAR EVENTS
// ============================================================
if (DOM.calPrev) {
  DOM.calPrev.addEventListener('click', () => {
    hideDayDetail();
    state.calendarDate.setMonth(state.calendarDate.getMonth() - 1);
    const y = state.calendarDate.getFullYear();
    const m = state.calendarDate.getMonth() + 1;
    const d = parseInt(TimeContext.getDate().split('-')[2]) || 1;
    TimeContext.setDate(`${y}-${String(m).padStart(2, '0')}-${String(Math.min(d, 28)).padStart(2, '0')}`);
    renderCalendar();
  });
}
if (DOM.calNext) {
  DOM.calNext.addEventListener('click', () => {
    hideDayDetail();
    state.calendarDate.setMonth(state.calendarDate.getMonth() + 1);
    const y = state.calendarDate.getFullYear();
    const m = state.calendarDate.getMonth() + 1;
    const d = parseInt(TimeContext.getDate().split('-')[2]) || 1;
    TimeContext.setDate(`${y}-${String(m).padStart(2, '0')}-${String(Math.min(d, 28)).padStart(2, '0')}`);
    renderCalendar();
  });
}

// ============================================================
// STATS PAGE EVENTS
// ============================================================
if (DOM.statsMonth) {
  DOM.statsMonth.addEventListener('change', () => {
    TimeContext.setDate(DOM.statsMonth.value);
    renderStats();
  });
}

if (DOM.timeFilterTabs) {
  DOM.timeFilterTabs.addEventListener('click', e => {
    const btn = e.target.closest('.time-filter-tab');
    if (!btn) return;
    state.statsTimeFilter = btn.dataset.period;
    renderStats();
  });
}

if (DOM.statsGradeFilter) {
  DOM.statsGradeFilter.addEventListener('click', e => {
    const btn = e.target.closest('.stats-grade-btn');
    if (!btn) return;
    state.statsGradeFilter = btn.dataset.grade;
    renderStats();
  });
}

// ============================================================
// ACTIVITY STATS & DETAIL EVENTS
// ============================================================
if (DOM.activityStatsGrid) {
  DOM.activityStatsGrid.addEventListener('click', e => {
    const card = e.target.closest('.activity-stat-card');
    if (!card || !card.dataset.activity) return;
    const selectedDate = DOM.statsMonth && DOM.statsMonth.value ? DOM.statsMonth.value : DateUtil.toStr();
    openActivityDetailModal(card.dataset.activity, state.statsTimeFilter, state.statsGradeFilter, selectedDate);
  });
}

if (DOM.activityDetailTabs) {
  DOM.activityDetailTabs.addEventListener('click', e => {
    const tab = e.target.closest('.activity-detail-tab');
    if (!tab) return;
    state.activityDetailTab = tab.dataset.tab;
    renderActivityDetailTab();
  });
}

if (DOM.activityDetailList) {
  DOM.activityDetailList.addEventListener('click', e => {
    const item = e.target.closest('.detail-girl-item');
    if (item && item.dataset.girlId) {
      closeModal('activityDetailModal');
      showGirlProfile(item.dataset.girlId);
    }
  });
}

if (DOM.closeActivityDetailModal) {
  DOM.closeActivityDetailModal.addEventListener('click', () => closeModal('activityDetailModal'));
}

// ============================================================
// HISTORY PAGE EVENTS
// ============================================================
if (DOM.historyFilter) DOM.historyFilter.addEventListener('change', () => renderHistory(false));
if (DOM.loadMoreHistoryBtn) DOM.loadMoreHistoryBtn.addEventListener('click', () => renderHistory(true));

if (DOM.clearHistoryBtn) {
  DOM.clearHistoryBtn.addEventListener('click', () => {
    showConfirm({
      icon: '&#9888;', title: 'مسح السجل التاريخي',
      msg: 'هل أنت متأكد؟ سيتم مسح كل السجلات نهائياً ولا يمكن التراجع. ملاحظة: مع كثرة السجلات يُفضل استخدام أداة إدارية أو Cloud Function.',
      okLabel: 'مسح الكل',
      onOk: async () => {
        if (state.idb) await IDB.clear('history');

        if (firebaseReady && window._fb) {
          try {
            const { collection, query, orderBy, limit, getDocs, writeBatch } = window._fb;
            let deleted = 0;
            let hasMore = true;

            while (hasMore && deleted < 5000) {
              const q = query(collection(db, 'history'), orderBy('timestamp', 'desc'), limit(500));
              const snap = await getDocs(q);
              if (snap.empty) { hasMore = false; break; }

              const batch = writeBatch(db);
              snap.docs.forEach(d => batch.delete(d.ref));
              await batch.commit();
              deleted += snap.docs.length;

              if (snap.docs.length < 500) hasMore = false;
            }

            if (deleted >= 5000) {
              showToast('تم مسح أول 5000 سجل. يُفضل استخدام Cloud Function للمسح الجماعي.', 'warning');
              return;
            }
          } catch (e) { console.error('Firestore clear history error:', e); }
        }

        state.historyLastDoc = null;
        state.historyHasMore = true;
        state.historyOffset = 0;

        showToast('تم مسح السجل التاريخي', 'success');
        renderHistory(false);
      }
    });
  });
}

// ============================================================
// EXPORT PAGE EVENTS
// ============================================================
if (DOM.exportMonth) {
  DOM.exportMonth.addEventListener('change', () => {
    if (DOM.exportMonth?.value) {
      TimeContext.setDate(DOM.exportMonth.value);
      updateExportPreview();
    }
  });
}

document.querySelectorAll('input[name="exportMode"]').forEach(radio => {
  radio.addEventListener('change', () => {
    document.querySelectorAll('.export-mode-option').forEach(opt => {
      const input = opt.querySelector('input[type="radio"]');
      opt.classList.toggle('checked', input && input.checked);
    });
    updateExportPreview();
  });
});

document.querySelectorAll('.export-mode-option').forEach(opt => {
  const input = opt.querySelector('input[type="radio"]');
  if (input && input.checked) opt.classList.add('checked');
});

// Excel export
if (DOM.exportExcel) {
  DOM.exportExcel.addEventListener('click', () => {
    if (!XLSX) { showToast('مكتبة Excel غير محملة، حاول تحديث الصفحة', 'error'); return; }

    const exportMode = document.querySelector('input[name="exportMode"]:checked')?.value || 'day';
    if (!DOM.exportMonth) return;
    const exportDate = (DOM.exportMonth?.value) || TimeContext.getDate();

    let exportStart, exportEnd, reportTitle;
    const activeGirls = getActiveGirls();
    const activeGirlIds = new Set(activeGirls.map(g => g.id));

    if (exportMode === 'month') {
      const [year, month] = exportDate.substring(0, 7).split('-').map(Number);
      const daysInMonth = new Date(year, month, 0).getDate();
      exportStart = exportDate.substring(0, 7) + '-01';
      exportEnd = exportDate.substring(0, 7) + '-' + String(daysInMonth).padStart(2, '0');
      reportTitle = 'تقرير حضور شهر ' + DateUtil.formatMonth(exportDate.substring(0, 7));
    } else {
      exportStart = exportDate;
      exportEnd = exportDate;
      const dayName = safeDayName(exportDate);
      reportTitle = 'تقرير حضور يوم ' + exportDate + ' (' + dayName + ')';
    }

    const exportAtt = getAttendanceEntries().filter(a =>
      a.date >= exportStart && a.date <= exportEnd && activeGirlIds.has(a.girlId) && isServiceDayDate(a.date)
    );

    const wb = XLSX.utils.book_new();

    if (exportMode === 'month') {
      const monthName = DateUtil.formatMonth(exportDate.substring(0, 7));

      const girlStats = {};
      activeGirls.forEach(g => {
        girlStats[g.id] = {
          name: g.name, grade: g.grade,
          ...Object.fromEntries(ACTIVITIES.map(a => [a, { present: 0, absent: 0 }])),
          totalPresent: 0, totalAbsent: 0
        };
      });

      exportAtt.forEach(a => {
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

      const wsData = [];
      wsData.push(['تقرير حضور شهر ' + monthName]);
      wsData.push([]);
      wsData.push(['عدد المخدومات', activeGirlIds.size]);
      wsData.push([]);

      const headerRow = ['الاسم', 'السنة'];
      ACTIVITIES.forEach(a => {
        headerRow.push(esc(a) + ' (حضور)');
        headerRow.push(esc(a) + ' (غياب)');
      });
      headerRow.push('إجمالي الحضور', 'إجمالي الغياب');
      wsData.push(headerRow);

      sortedGirls.forEach(r => {
        const row = [r.name, r.grade];
        ACTIVITIES.forEach(a => {
          row.push(r[a].present);
          row.push(r[a].absent);
        });
        row.push(r.totalPresent, r.totalAbsent);
        wsData.push(row);
      });

      const ws = XLSX.utils.aoa_to_sheet(wsData);
      const colWidths = [{ wch: 28 }, { wch: 14 }];
      ACTIVITIES.forEach(() => { colWidths.push({ wch: 12 }, { wch: 12 }); });
      colWidths.push({ wch: 14 }, { wch: 14 });
      ws['!cols'] = colWidths;
      ws['!dir'] = 'rtl';
      XLSX.utils.book_append_sheet(wb, ws, 'ملخص الشهر');

      exportAtt.sort((a, b) => {
        if (a.date !== b.date) return a.date.localeCompare(b.date);
        return (a.activity || '').localeCompare(b.activity || '', 'ar');
      });

      const detailData = [];
      detailData.push(['تقرير تفصيلي — ' + monthName]);
      detailData.push([]);
      detailData.push(['التاريخ', 'اليوم', 'المخدومة', 'السنة', 'النشاط', 'الحالة', 'التقييم', 'ملاحظات']);

      exportAtt.forEach(a => {
        const g = getGirl(a.girlId);
        const dayName = safeDayName(a.date);
        const safeRating = Math.max(0, Math.min(5, a.rating || 0));
        const stars = safeRating ? '★'.repeat(safeRating) + '☆'.repeat(5 - safeRating) : '';
        detailData.push([a.date, dayName, g?.name || '', g?.grade || '', a.activity || '', a.status === 'حاضر' ? '✓' : '✗', stars, a.notes || '']);
      });

      const wsDetail = XLSX.utils.aoa_to_sheet(detailData);
      wsDetail['!cols'] = [{ wch: 14 }, { wch: 10 }, { wch: 24 }, { wch: 14 }, { wch: 10 }, { wch: 8 }, { wch: 12 }, { wch: 24 }];
      wsDetail['!dir'] = 'rtl';
      XLSX.utils.book_append_sheet(wb, wsDetail, 'تفاصيل يومية');

    } else {
      const wsData = [];
      wsData.push([reportTitle]);
      wsData.push([]);
      const headerRow = ['الاسم', 'السنة'];
      ACTIVITIES.forEach(a => headerRow.push(a));
      wsData.push(headerRow);

      const sortedGirls = [...activeGirls].sort((a, b) => a.name.localeCompare(b.name, 'ar'));
      sortedGirls.forEach(g => {
        const row = [g.name, g.grade];
        ACTIVITIES.forEach(act => {
          const key = `${g.id}_${exportDate}_${act}`;
          const rec = state.attendanceData[key];
          if (rec) {
            row.push(rec.status === 'حاضر' ? '✓' : '✗');
          } else {
            row.push('—');
          }
        });
        wsData.push(row);
      });

      const totalPresent = exportAtt.filter(a => a.status === 'حاضر').length;
      const totalAbsent = exportAtt.filter(a => a.status === 'غائب').length;
      wsData.push([]);
      wsData.push(['', '', 'حاضر: ' + totalPresent, '', 'غائب: ' + totalAbsent, '']);

      const ws = XLSX.utils.aoa_to_sheet(wsData);
      const colWidths = [{ wch: 28 }, { wch: 14 }];
      ACTIVITIES.forEach(() => colWidths.push({ wch: 10 }));
      ws['!cols'] = colWidths;
      ws['!dir'] = 'rtl';
      XLSX.utils.book_append_sheet(wb, ws, 'يوم ' + exportDate);
    }

    const xlsxBlob = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([xlsxBlob], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `حضور_${exportDate}${exportMode === 'month' ? '_شهر' : '_يوم'}.xlsx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast(exportMode === 'month' ? 'تم تصدير ملف Excel للشهر' : 'تم تصدير ملف Excel لليوم', 'success');
  });
}

// JSON export
if (DOM.exportJSON) {
  DOM.exportJSON.addEventListener('click', () => {
    const exportDate = (DOM.exportMonth?.value) || TimeContext.getDate();
    const exportStart = exportDate.substring(0, 7) + '-01';
    const [exportYear, exportMonthNum] = exportDate.substring(0, 7).split('-').map(Number);
    const daysInExportMonth = new Date(exportYear, exportMonthNum, 0).getDate();
    const exportEnd = exportDate.substring(0, 7) + '-' + String(daysInExportMonth).padStart(2, '0');
    const activeGirlIds = getActiveGirlIds();

    const exportAtt = getAttendanceEntries().filter(a =>
      a.date >= exportStart && a.date <= exportEnd && activeGirlIds.has(a.girlId) && isServiceDayDate(a.date)
    );

    const payload = {
      dateRange: { start: exportStart, end: exportEnd },
      girls: getActiveGirls(),
      attendance: exportAtt,
      exportedAt: new Date().toISOString()
    };
    downloadFile(`بيانات_${exportDate}.json`, JSON.stringify(payload, null, 2), 'application/json');
    showToast('تم تصدير JSON', 'success');
  });
}

// Print export
if (DOM.exportPrint) {
  DOM.exportPrint.addEventListener('click', () => {
    const exportMode = document.querySelector('input[name="exportMode"]:checked')?.value || 'day';
    if (!DOM.exportMonth) return;
    const exportDate = (DOM.exportMonth?.value) || TimeContext.getDate();

    let exportStart, exportEnd;
    if (exportMode === 'month') {
      const [year, month] = exportDate.substring(0, 7).split('-').map(Number);
      const daysInMonth = new Date(year, month, 0).getDate();
      exportStart = exportDate.substring(0, 7) + '-01';
      exportEnd = exportDate.substring(0, 7) + '-' + String(daysInMonth).padStart(2, '0');
    } else {
      exportStart = exportDate;
      exportEnd = exportDate;
    }

    const activeGirls = getActiveGirls();
    const activeGirlIds = new Set(activeGirls.map(g => g.id));

    const exportAtt = getAttendanceEntries().filter(a =>
      a.date >= exportStart && a.date <= exportEnd && activeGirlIds.has(a.girlId) && isServiceDayDate(a.date)
    );

    const totalPresent = exportAtt.filter(a => a.status === 'حاضر').length;
    const totalAbsent = exportAtt.filter(a => a.status === 'غائب').length;

    let html;

    if (exportMode === 'month') {
      const monthName = DateUtil.formatMonth(exportDate.substring(0, 7));

      const girlStats = {};
      activeGirls.forEach(g => {
        girlStats[g.id] = {
          name: g.name, grade: g.grade,
          ...Object.fromEntries(ACTIVITIES.map(a => [a, { present: 0, absent: 0 }])),
          totalPresent: 0, totalAbsent: 0
        };
      });

      exportAtt.forEach(a => {
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
      const activityHeaders = ACTIVITIES.map(a => `<th>${esc(a)}</th>`).join('');

      const rows = sortedGirls.map((r, i) => {
        const activityCells = ACTIVITIES.map(a =>
          `<td>${r[a].present} <span style="color:#e74c3c;font-size:11px">(${r[a].absent})</span></td>`
        ).join('');
        return `<tr>
          <td>${i + 1}</td>
          <td>${esc(r.name)}</td>
          <td>${esc(r.grade)}</td>
          ${activityCells}
          <td style="color:green;font-weight:700">${r.totalPresent}</td>
          <td style="color:red;font-weight:700">${r.totalAbsent}</td>
        </tr>`;
      }).join('');

      html = `<!DOCTYPE html><html lang="ar" dir="rtl">
        <head><meta charset="UTF-8"><title>تقرير شهر ${monthName}</title>
        <link href="https://fonts.googleapis.com/css2?family=Tajawal:wght@400;700&display=swap" rel="stylesheet">
        <style>body{font-family:Tajawal,sans-serif;direction:rtl;padding:20px}
        h1{color:#1a2744;border-bottom:2px solid #1a2744;padding-bottom:10px}
        .summary{display:flex;gap:20px;margin:15px 0;flex-wrap:wrap}
        .sum-box{background:#f0f2f8;border-radius:10px;padding:12px 20px;text-align:center}
        .sum-box b{font-size:24px;color:#1a2744}
        .sum-box span{font-size:13px;color:#6b7a99}
        table{width:100%;border-collapse:collapse;margin-top:20px}
        th,td{border:1px solid #ddd;padding:8px;text-align:center;font-size:13px}
        th{background:#1a2744;color:white}
        .footer{margin-top:20px;font-size:12px;color:#6b7a99;border-top:1px solid #e2e8f0;padding-top:10px}
        @media print{body{padding:10px}}
        </style></head><body>
        <h1>تقرير حضور شهر ${monthName}</h1>
        <p style="color:#6b7a99;font-size:14px">الفترة: من ${exportStart} إلى ${exportEnd}</p>
        <div class="summary">
          <div class="sum-box"><b>${activeGirls.length}</b><br><span>عدد المخدومات</span></div>
          <div class="sum-box"><b>${totalPresent}</b><br><span>إجمالي الحضور</span></div>
          <div class="sum-box"><b>${totalAbsent}</b><br><span>إجمالي الغياب</span></div>
          <div class="sum-box"><b>${sortedGirls.filter(g => g.totalPresent > 0).length}</b><br><span>مخدومات مشاركة</span></div>
        </div>
        <table>
          <tr><th>#</th><th>الاسم</th><th>السنة</th>${activityHeaders}<th>إجمالي الحضور</th><th>إجمالي الغياب</th></tr>
          ${rows}
        </table>
        <div class="footer">تاريخ التصدير: ${new Date().toLocaleDateString('ar-EG')} | نظام متابعة المخدومات</div>
        </body></html>`;

    } else {
      const dayName = safeDayName(exportDate);
      const sortedGirls = [...activeGirls].sort((a, b) => a.name.localeCompare(b.name, 'ar'));
      const activityHeaders = ACTIVITIES.map(a => `<th>${esc(a)}</th>`).join('');

      const rows = sortedGirls.map((g, i) => {
        const cells = [];
        ACTIVITIES.forEach(act => {
          const key = `${g.id}_${exportDate}_${act}`;
          const rec = state.attendanceData[key];
          if (rec) {
            cells.push(rec.status === 'حاضر'
              ? '<td style="color:green;font-weight:700;font-size:16px">&#10003;</td>'
              : '<td style="color:red;font-weight:700;font-size:16px">&#10007;</td>');
          } else {
            cells.push('<td style="color:#ccc">—</td>');
          }
        });
        return `<tr>
          <td>${i + 1}</td>
          <td>${esc(g.name)}</td>
          <td>${esc(g.grade)}</td>
          ${cells.join('')}
        </tr>`;
      }).join('');

      html = `<!DOCTYPE html><html lang="ar" dir="rtl">
        <head><meta charset="UTF-8"><title>تقرير يوم ${exportDate}</title>
        <link href="https://fonts.googleapis.com/css2?family=Tajawal:wght@400;700&display=swap" rel="stylesheet">
        <style>body{font-family:Tajawal,sans-serif;direction:rtl;padding:20px}
        h1{color:#1a2744;border-bottom:2px solid #1a2744;padding-bottom:10px}
        .summary{display:flex;gap:20px;margin:15px 0;flex-wrap:wrap}
        .sum-box{background:#f0f2f8;border-radius:10px;padding:12px 20px;text-align:center}
        .sum-box b{font-size:24px;color:#1a2744}
        .sum-box span{font-size:13px;color:#6b7a99}
        table{width:100%;border-collapse:collapse;margin-top:20px}
        th,td{border:1px solid #ddd;padding:10px;text-align:center;font-size:14px}
        th{background:#1a2744;color:white}
        .footer{margin-top:20px;font-size:12px;color:#6b7a99;border-top:1px solid #e2e8f0;padding-top:10px}
        @media print{body{padding:10px}}
        </style></head><body>
        <h1>تقرير حضور يوم ${exportDate}</h1>
        <p style="color:#6b7a99;font-size:14px">اليوم: ${dayName}</p>
        <div class="summary">
          <div class="sum-box"><b>${activeGirls.length}</b><br><span>عدد المخدومات</span></div>
          <div class="sum-box"><b>${totalPresent}</b><br><span>حاضر</span></div>
          <div class="sum-box"><b>${totalAbsent}</b><br><span>غائب</span></div>
        </div>
        <table>
          <tr><th>#</th><th>الاسم</th><th>السنة</th>${activityHeaders}</tr>
          ${rows}
        </table>
        <div class="footer">تاريخ التصدير: ${new Date().toLocaleDateString('ar-EG')} | نظام متابعة المخدومات</div>
        </body></html>`;
    }

    const printBlob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const printUrl = URL.createObjectURL(printBlob);
    const w = window.open(printUrl, '_blank');
    if (!w) {
      URL.revokeObjectURL(printUrl);
      showToast('تم حجب النافذة من المتصفح', 'error');
      return;
    }
    const cleanupPrintUrl = () => { URL.revokeObjectURL(printUrl); };

    w.onload = () => {
      w._printed = true;
      cleanupPrintUrl();
      w.print();
    };
    setTimeout(() => {
      if (!w._printed) {
        w._printed = true;
        cleanupPrintUrl();
        w.print();
      }
    }, 500);
  });
}

// ============================================================
// MODAL CLOSE EVENTS
// ============================================================
if (DOM.closeGirlModal) DOM.closeGirlModal.addEventListener('click', () => closeModal('girlModal'));
if (DOM.cancelGirlModal) DOM.cancelGirlModal.addEventListener('click', () => closeModal('girlModal'));
if (DOM.closeAttendanceModal) DOM.closeAttendanceModal.addEventListener('click', () => closeModal('attendanceModal'));
if (DOM.cancelAttendanceModal) DOM.cancelAttendanceModal.addEventListener('click', () => closeModal('attendanceModal'));

document.querySelectorAll('.modal-overlay').forEach(overlay => overlay.addEventListener('click', e => {
  if (e.target === overlay) closeModal(overlay.id);
}));

// ============================================================
// CONFIRM MODAL EVENTS
// ============================================================
if (DOM.confirmOk) {
  DOM.confirmOk.addEventListener('click', async () => {
    if (DOM.confirmOverlay) DOM.confirmOverlay.classList.remove('show');
    if (confirmResolve) {
      const fn = confirmResolve;
      confirmResolve = null;
      try { await fn(); } catch (e) { console.error('Confirm ok error:', e); }
    }
  });
}

if (DOM.confirmCancel) {
  DOM.confirmCancel.addEventListener('click', () => {
    if (DOM.confirmOverlay) DOM.confirmOverlay.classList.remove('show');
    confirmResolve = null;
  });
}

if (DOM.confirmOverlay) {
  DOM.confirmOverlay.addEventListener('click', e => {
    if (e.target === DOM.confirmOverlay) {
      DOM.confirmOverlay.classList.remove('show');
      confirmResolve = null;
    }
  });
}

// ============================================================
// EVENT DELEGATION
// ============================================================
function setupDelegation() {
  if (setupDelegation._done) return;
  setupDelegation._done = true;

  if (DOM.needsFollowup) {
    DOM.needsFollowup.addEventListener('click', e => {
      const item = e.target.closest('.followup-item');
      if (item) showGirlProfile(item.dataset.girlId);
    });
  }

  if (DOM.girlsList) {
    DOM.girlsList.addEventListener('click', e => {
      const editBtn = e.target.closest('.edit-btn');
      if (editBtn) { e.stopPropagation(); editGirl(editBtn.dataset.girlId); return; }
      const card = e.target.closest('.girl-card');
      if (card) showGirlProfile(card.dataset.girlId);
    });
  }

  if (DOM.searchResults) {
    DOM.searchResults.addEventListener('click', e => {
      const item = e.target.closest('.search-item');
      if (item && item.dataset.girlId) showGirlProfile(item.dataset.girlId);
    });
  }

  if (DOM.attendanceList) {
    const LP_STATE = new WeakMap();

    DOM.attendanceList.addEventListener('click', e => {
      const star = e.target.closest('.att-inline-star');
      if (star) {
        e.stopPropagation();
        e.preventDefault();
        const ratingWrap = star.closest('.att-inline-rating');
        if (ratingWrap) {
          saveInlineRating(ratingWrap.dataset.attKey, parseInt(star.dataset.val));
        }
        return;
      }
      const item = e.target.closest('.att-item');
      if (!item) return;
      if (LP_STATE.get(item) === 'long-pressed') {
        LP_STATE.set(item, null);
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      const g = getGirl(item.dataset.girlId);
      if (g && DOM.attendanceDate) toggleAttendanceStatus(g.id, g.name, DOM.attendanceDate.value);
    });

    DOM.attendanceList.addEventListener('mousedown', e => {
      const item = e.target.closest('.att-item');
      if (!item) return;
      LP_STATE.set(item, 'pending');
      const timer = setTimeout(() => {
        LP_STATE.set(item, 'long-pressed');
        const g = getGirl(item.dataset.girlId);
        if (g && DOM.attendanceDate) openAttendanceEntry(g.id, g.name, DOM.attendanceDate.value);
      }, 500);
      item._lpTimer = timer;
    });
    DOM.attendanceList.addEventListener('mouseup', e => {
      const item = e.target.closest('.att-item');
      if (item && item._lpTimer) { clearTimeout(item._lpTimer); item._lpTimer = null; }
    });
    DOM.attendanceList.addEventListener('mouseleave', e => {
      const item = e.target.closest('.att-item');
      if (item) {
        if (item._lpTimer) { clearTimeout(item._lpTimer); item._lpTimer = null; }
        if (LP_STATE.get(item) === 'pending') LP_STATE.set(item, null);
      }
    });

    DOM.attendanceList.addEventListener('touchstart', e => {
      const item = e.target.closest('.att-item');
      if (!item) return;
      LP_STATE.set(item, 'pending');
      const timer = setTimeout(() => {
        LP_STATE.set(item, 'long-pressed');
        const g = getGirl(item.dataset.girlId);
        if (g && DOM.attendanceDate) openAttendanceEntry(g.id, g.name, DOM.attendanceDate.value);
      }, 500);
      item._lpTimer = timer;
    }, { passive: true });
    DOM.attendanceList.addEventListener('touchend', e => {
      const item = e.target.closest('.att-item');
      if (item && item._lpTimer) { clearTimeout(item._lpTimer); item._lpTimer = null; }
      setTimeout(() => { if (LP_STATE.get(item) === 'pending') LP_STATE.set(item, null); }, 50);
    });
    DOM.attendanceList.addEventListener('touchcancel', e => {
      const item = e.target.closest('.att-item');
      if (item && item._lpTimer) { clearTimeout(item._lpTimer); item._lpTimer = null; }
      LP_STATE.set(item, null);
    });
  }

  if (DOM.calendarGrid) {
    DOM.calendarGrid.addEventListener('click', e => {
      const day = e.target.closest('.cal-day');
      if (day && !day.classList.contains('empty')) showDayDetail(day.dataset.date);
    });
  }
}

// ============================================================
// GRADE FILTERS & GIRLS SEARCH
// ============================================================
setupGradeFilter(DOM.homeGradeFilters, 'homeGrade', renderHome);
setupGradeFilter(DOM.girlsGradeFilters, 'girlsGrade', renderGirlsList);
setupGradeFilter(DOM.attendanceGradeFilters, 'attendanceGrade', renderAttendanceList, 'attendanceGradeFilter');

const girlsSearchInput = document.getElementById('girlsSearch');
if (girlsSearchInput) {
  const girlsSearchDebounced = debounce(() => {
    state.girlsSearchQuery = girlsSearchInput.value;
    renderGirlsList();
  }, 250);
  girlsSearchInput.addEventListener('input', girlsSearchDebounced);
}

setupDelegation();
