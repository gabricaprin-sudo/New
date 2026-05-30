// ============================================
// app-auth.js - STANDALONE Local Authentication
// No Firebase needed. Works immediately with localStorage.
// ============================================

const LS_USERS_KEY = "kenesa_users";
const LS_CURRENT_USER_KEY = "kenesa_current_user";

function getEl(id) {
    return document.getElementById(id);
}

function getStoredUsers() {
    try {
        var data = localStorage.getItem(LS_USERS_KEY);
        return data ? JSON.parse(data) : {};
    } catch (e) {
        return {};
    }
}

function saveUsers(users) {
    localStorage.setItem(LS_USERS_KEY, JSON.stringify(users));
}

function getCurrentUser() {
    try {
        var data = localStorage.getItem(LS_CURRENT_USER_KEY);
        return data ? JSON.parse(data) : null;
    } catch (e) {
        return null;
    }
}

function setCurrentUser(user) {
    if (user) {
        localStorage.setItem(LS_CURRENT_USER_KEY, JSON.stringify(user));
    } else {
        localStorage.removeItem(LS_CURRENT_USER_KEY);
    }
}

function showToast(msg, type, duration) {
    type = type || "info";
    duration = duration || 3000;
    var container = getEl("toastContainer");
    if (!container) return;
    var toast = document.createElement("div");
    toast.className = "toast " + type;
    var icon = "&#128161;";
    if (type === "success") icon = "&#9989;";
    else if (type === "error") icon = "&#10060;";
    else if (type === "warning") icon = "&#9888;&#65039;";
    toast.innerHTML = "<span>" + icon + "</span><span>" + msg + "</span>";
    container.appendChild(toast);
    setTimeout(function() {
        toast.classList.add("hiding");
        setTimeout(function() { toast.remove(); }, 300);
    }, duration);
}

function showAuthError(msg) {
    var el = getEl("loginError");
    if (!el) return;
    el.innerHTML = msg;
    el.classList.add("active");
}

function hideAuthError() {
    var el = getEl("loginError");
    if (el) el.classList.remove("active");
}

function showAuthSuccess(msg) {
    var el = getEl("loginSuccess");
    if (!el) return;
    el.innerHTML = msg;
    el.classList.add("active");
}

function resetLoginBtn() {
    var btn = getEl("loginBtn");
    if (btn) {
        btn.disabled = false;
        btn.innerHTML = "&#10132; دخول";
    }
}

function resetRegisterBtn() {
    var btn = getEl("registerBtn");
    if (btn) {
        btn.disabled = false;
        btn.innerHTML = "&#128221; إنشاء حساب";
    }
}

var isRegisterMode = false;

function toggleAuthMode() {
    isRegisterMode = !isRegisterMode;
    var loginForm = getEl("loginForm");
    var registerForm = getEl("registerForm");
    if (!loginForm || !registerForm) return;
    hideAuthError();
    var successEl = getEl("loginSuccess");
    if (successEl) successEl.classList.remove("active");
    if (isRegisterMode) {
        loginForm.style.display = "none";
        registerForm.style.display = "block";
        var t = getEl("authToggleText");
        if (t) t.textContent = "لديك حساب بالفعل؟";
        var b = getEl("authToggleBtn");
        if (b) b.textContent = "تسجيل الدخول";
        var s = getEl("authSubtitle");
        if (s) s.textContent = "أنشئي حساب جديد كخادم";
    } else {
        loginForm.style.display = "block";
        registerForm.style.display = "none";
        var t2 = getEl("authToggleText");
        if (t2) t2.textContent = "ليس لديك حساب؟";
        var b2 = getEl("authToggleBtn");
        if (b2) b2.textContent = "إنشاء حساب جديد";
        var s2 = getEl("authSubtitle");
        if (s2) s2.textContent = "أدخل بياناتك للوصول إلى نظام المتابعة";
    }
}

function handleRegister() {
    var nameEl = getEl("regName");
    var emailEl = getEl("regEmail");
    var passEl = getEl("regPassword");
    var confirmEl = getEl("regPasswordConfirm");
    var btn = getEl("registerBtn");
    var name = nameEl ? nameEl.value.trim() : "";
    var email = emailEl ? emailEl.value.trim().toLowerCase() : "";
    var password = passEl ? passEl.value : "";
    var passwordConfirm = confirmEl ? confirmEl.value : "";
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<div class="spinner" style="width:16px;height:16px;border-width:2px;display:inline-block;vertical-align:middle;margin-left:6px;"></div> جاري الإنشاء...';
    }
    hideAuthError();
    if (!name || !email || !password) {
        showAuthError("&#10060; يرجى ملء جميع الحقول");
        resetRegisterBtn();
        return;
    }
    if (password.length < 6) {
        showAuthError("&#10060; كلمة المرور يجب أن تكون 6 أحرف على الأقل");
        resetRegisterBtn();
        return;
    }
    if (password !== passwordConfirm) {
        showAuthError("&#10060; كلمتا المرور غير متطابقتين");
        resetRegisterBtn();
        return;
    }
    var users = getStoredUsers();
    if (users[email]) {
        showAuthError("&#10060; البريد الإلكتروني مستخدم بالفعل");
        resetRegisterBtn();
        return;
    }
    var user = {
        uid: "user_" + Date.now() + "_" + Math.random().toString(36).substr(2, 9),
        name: name,
        email: email,
        password: password,
        role: "khadem",
        createdAt: new Date().toISOString()
    };
    users[email] = user;
    saveUsers(users);
    showAuthSuccess("&#9989; تم إنشاء الحساب بنجاح! جاري الدخول...");
    setTimeout(function() {
        completeLogin(user);
    }, 800);
}

function handleLogin() {
    var btn = getEl("loginBtn");
    var emailEl = getEl("loginEmail");
    var passEl = getEl("loginPassword");
    var email = emailEl ? emailEl.value.trim().toLowerCase() : "";
    var password = passEl ? passEl.value : "";
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<div class="spinner" style="width:16px;height:16px;border-width:2px;display:inline-block;vertical-align:middle;margin-left:6px;"></div> جاري الدخول...';
    }
    hideAuthError();
    if (!email || !password) {
        showAuthError("&#10060; يرجى إدخال البريد الإلكتروني وكلمة المرور");
        resetLoginBtn();
        return;
    }
    var users = getStoredUsers();
    var user = users[email];
    if (!user) {
        showAuthError("&#10060; لا يوجد حساب بهذا البريد. أنشئي حساب جديد.");
        resetLoginBtn();
        return;
    }
    if (user.password !== password) {
        showAuthError("&#10060; كلمة المرور غير صحيحة");
        resetLoginBtn();
        return;
    }
    completeLogin(user);
}

function completeLogin(user) {
    try {
        setCurrentUser(user);
        var loginOverlay = getEl("loginOverlay");
        var mainApp = getEl("mainApp");
        var serverDisplay = getEl("serverDisplay");
        var saveStatus = getEl("saveStatus");
        if (loginOverlay) loginOverlay.classList.add("hidden");
        if (mainApp) mainApp.style.display = "block";
        if (serverDisplay) serverDisplay.textContent = user.name + " (" + user.email + ")";
        if (saveStatus) {
            saveStatus.className = "save-status online";
            saveStatus.innerHTML = "&#128308; متصل";
        }
        if (typeof generateCards === "function") generateCards();
        if (typeof loadAllStudentsData === "function") loadAllStudentsData();
        if (typeof generateMonthSelector === "function") generateMonthSelector();
        if (typeof setupKeyboardShortcuts === "function") setupKeyboardShortcuts();
        showToast("&#9989; مرحباً " + user.name + "! تم تسجيل الدخول بنجاح", "success", 4000);
        console.log("Login successful:", user);
    } catch (err) {
        console.error("completeLogin error:", err);
        showAuthError("&#10060; خطأ في تهيئة التطبيق");
        resetLoginBtn();
    }
}

function logout() {
    if (!confirm("تأكيد تسجيل الخروج؟")) return;
    setCurrentUser(null);
    location.reload();
}

function checkAutoLogin() {
    var user = getCurrentUser();
    if (user) {
        var users = getStoredUsers();
        if (users[user.email]) {
            completeLogin(user);
            return;
        }
        setCurrentUser(null);
    }
    var loginOverlay = getEl("loginOverlay");
    var mainApp = getEl("mainApp");
    if (loginOverlay) loginOverlay.style.display = "flex";
    if (mainApp) mainApp.style.display = "none";
}

function initAuth() {
    var authToggleBtn = getEl("authToggleBtn");
    var loginBtn = getEl("loginBtn");
    var registerBtn = getEl("registerBtn");
    var btnLogout = getEl("btnLogout");
    if (authToggleBtn) authToggleBtn.addEventListener("click", toggleAuthMode);
    if (loginBtn) loginBtn.addEventListener("click", handleLogin);
    if (registerBtn) registerBtn.addEventListener("click", handleRegister);
    if (btnLogout) btnLogout.addEventListener("click", logout);
    var loginEmail = getEl("loginEmail");
    var loginPassword = getEl("loginPassword");
    if (loginEmail) {
        loginEmail.addEventListener("keydown", function(e) {
            if (e.key === "Enter") handleLogin();
        });
    }
    if (loginPassword) {
        loginPassword.addEventListener("keydown", function(e) {
            if (e.key === "Enter") handleLogin();
        });
    }
    var regPasswordConfirm = getEl("regPasswordConfirm");
    if (regPasswordConfirm) {
        regPasswordConfirm.addEventListener("keydown", function(e) {
            if (e.key === "Enter") handleRegister();
        });
    }
    checkAutoLogin();
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initAuth);
} else {
    initAuth();
}

window.toggleAuthMode = toggleAuthMode;
window.handleRegister = handleRegister;
window.handleLogin = handleLogin;
window.logout = logout;
window.completeLogin = completeLogin;
window.showToast = showToast;
