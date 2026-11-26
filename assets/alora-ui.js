/* ============================================================
   ALORA — ortak arayüz betiği
   Tema, parola göster/gizle, üst bar kullanıcı çipi
   ============================================================ */
(function () {
  'use strict';

  /* ---- tema ---- */
  var THEME_KEY = 'alora.theme';
  function applyTheme(t) {
    if (t === 'dark') document.documentElement.setAttribute('data-theme', 'dark');
    else document.documentElement.removeAttribute('data-theme');
  }
  function currentTheme() {
    return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
  }
  try { applyTheme(localStorage.getItem(THEME_KEY) || 'light'); } catch (e) {}

  window.AloraUI = {
    theme: currentTheme,
    toggleTheme: function () {
      var next = currentTheme() === 'dark' ? 'light' : 'dark';
      applyTheme(next);
      try { localStorage.setItem(THEME_KEY, next); } catch (e) {}
      document.querySelectorAll('[data-theme-toggle]').forEach(function (b) {
        b.setAttribute('aria-label', next === 'dark' ? 'Açık temaya geç' : 'Karanlık temaya geç');
      });
    }
  };

  document.addEventListener('click', function (e) {
    var t = e.target.closest('[data-theme-toggle]');
    if (t) { e.preventDefault(); window.AloraUI.toggleTheme(); }
  });

  /* ---- parola göster/gizle ---- */
  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-pw]');
    if (!b) return;
    e.preventDefault();
    var input = document.getElementById(b.getAttribute('data-pw'));
    if (!input) return;
    var show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    b.setAttribute('aria-label', show ? 'Şifreyi gizle' : 'Şifreyi göster');
  });

  /* ---- parola gücü ---- */
  window.AloraUI.strength = function (pw) {
    var s = 0;
    if (pw.length >= 6) s++;
    if (pw.length >= 10) s++;
    if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) s++;
    if (/[0-9]/.test(pw)) s++;
    if (/[^A-Za-z0-9]/.test(pw)) s++;
    return Math.min(s, 4); // 0..4
  };

  /* ---- oturum çipi (üst bar) ---- */
  function renderUserChip() {
    var slot = document.querySelector('[data-user-slot]');
    if (!slot || !window.AloraAuth) return;
    AloraAuth.me().then(function (s) {
      if (!s || !s.user) {
        slot.innerHTML =
          '<a class="btn btn-ghost btn-sm" href="giris.html">Giriş</a>' +
          '<a class="btn btn-primary btn-sm" href="kayit.html">Üye ol</a>';
        return;
      }
      var p = s.profile || {};
      var name = p.full_name || p.username || (s.user.email || '').split('@')[0];
      var initial = (name || '?').charAt(0).toUpperCase();
      var role = window.AloraAuth.roleLabel(p.role);
      var isStaff = window.AloraAuth.isStaff(p);
      slot.innerHTML =
        '<a class="btn btn-ghost btn-sm hide-sm" href="' + (isStaff ? 'panel.html' : 'hesabim.html') + '">' +
          '<span style="width:22px;height:22px;border-radius:50%;background:linear-gradient(135deg,var(--brand),var(--brand-2));color:#fff;display:inline-grid;place-items:center;font-size:11px;font-weight:700">' + initial + '</span>' +
          '<span>' + name + '</span>' +
        '</a>' +
        '<button class="btn btn-secondary btn-sm" data-logout>Çıkış</button>';

      slot.querySelector('[data-logout]').addEventListener('click', async function () {
        await AloraAuth.signOut();
        location.reload();
      });
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', renderUserChip);
  else renderUserChip();
})();
