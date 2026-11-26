/* ============================================================
   ALORA — ana sayfa kullanıcı menüsü (v2)
   Giriş yapıldıysa "Giriş / Üye Ol" yerine isim + rol çipi,
   yetkili ise "Panel" düğmesi, herkese "Ayarlar" düğmesi.
   ============================================================ */
(function () {
  'use strict';

  var KEY = 'alora.session.v2';
  var PROXY = 'https://alora-bridge.bold-yew-bb8.workers.dev';
  var PTOKEN = '41ca9eb5f3a5747a2a6a5c7c9c9a46ddc205eca7274db5ae';

  function session() {
    try { return JSON.parse(localStorage.getItem(KEY) || sessionStorage.getItem(KEY) || 'null'); } catch (e) { return null; }
  }

  async function fetchMe() {
    var s = session();
    if (!s || !s.access_token) return null;
    try {
      var r = await fetch(PROXY + '/auth/user', {
        headers: { 'x-alora-key': PTOKEN, 'x-alora-token': s.access_token },
        cache: 'no-store'
      });
      if (!r.ok) return null;
      var d = await r.json();
      if (!d || !d.user) return null;
      return { user: d.user, profile: d.profile || null };
    } catch (e) { return null; }
  }

  function initials(name) {
    var p = String(name || '?').trim().split(/\s+/);
    if (p.length === 1) return p[0].slice(0, 2).toUpperCase();
    return (p[0][0] + p[1][0]).toUpperCase();
  }

  var ROLE = { admin: 'yönetici', yetkili: 'yetkili', uye: 'üye' };

  function buildHTML(me) {
    var p = me.profile || {};
    var name = p.full_name || p.username || (me.user.email || '').split('@')[0];
    var role = p.role || 'uye';
    var staff = role === 'admin' || role === 'yetkili';

    var html = '';
    if (staff) {
      html += '<a class="um-btn um-panel" href="panel.html" title="Kontrol paneli">' +
        '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/></svg>' +
        '<span class="hide-sm">Panel</span></a>';
    }
    html += '<button class="um-btn um-menu-btn" type="button" id="umToggle" aria-haspopup="true" aria-expanded="false">' +
      '<span class="um-av">' + initials(name) + '</span>' +
      '<span class="um-txt">' +
        '<strong>' + escapeHtml(name) + '</strong>' +
        '<small class="um-role ' + role + '">' + (ROLE[role] || 'üye') + '</small>' +
      '</span>' +
      '<svg class="um-caret" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>' +
    '</button>';

    html += '<div class="um-drop" id="umDrop" role="menu">' +
      '<div class="um-drop-head">' +
        '<span class="um-av lg">' + initials(name) + '</span>' +
        '<span><strong>' + escapeHtml(name) + '</strong><small>@' + escapeHtml(p.username || '') + '</small></span>' +
      '</div>' +
      (staff ? '<a class="um-item" href="panel.html"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/></svg>Kontrol paneli</a>' : '') +
      '<a class="um-item" href="hesabim.html"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="8" r="3.6"/><path d="M4.5 20a7.5 7.5 0 0 1 15 0"/></svg>Hesabım</a>' +
      '<a class="um-item" href="ayarlar.html"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1Z"/></svg>Ayarlar</a>' +
      '<div class="um-sep"></div>' +
      '<button class="um-item um-out" type="button" id="umLogout"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/></svg>Çıkış yap</button>' +
    '</div>';
    return html;
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function mount(me) {
    var nav = document.querySelector('.nav-links');
    if (!nav) return;
    // eski düğmeleri gizle
    var oldLogin = document.getElementById('loginBtn');
    var oldSignup = document.getElementById('signupBtn');
    if (oldLogin) oldLogin.classList.add('is-hidden');
    if (oldSignup) oldSignup.classList.add('is-hidden');
    var oldChip = document.getElementById('userChip');
    if (oldChip) oldChip.classList.add('is-hidden');

    var holder = document.getElementById('umWrap');
    if (!holder) {
      holder = document.createElement('div');
      holder.id = 'umWrap';
      holder.className = 'um-wrap';
      nav.appendChild(holder);
    }
    holder.innerHTML = buildHTML(me);

    // .nav-links içindeki doğrudan bağlantılar (Giriş / Üye Ol) gizlenir
    Array.prototype.forEach.call(nav.children, function (ch) {
      if (ch === holder) return;
      var a = ch.tagName === 'A' ? ch : ch.querySelector && ch.querySelector('a');
      if (a && /giris\.html|kayit\.html/.test(a.getAttribute('href') || '')) ch.style.display = 'none';
    });

    var toggle = document.getElementById('umToggle');
    var drop = document.getElementById('umDrop');
    toggle.addEventListener('click', function (e) {
      e.stopPropagation();
      var open = holder.classList.toggle('open');
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    document.addEventListener('click', function (e) {
      if (!holder.contains(e.target)) {
        holder.classList.remove('open');
        toggle.setAttribute('aria-expanded', 'false');
      }
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { holder.classList.remove('open'); toggle.setAttribute('aria-expanded', 'false'); }
    });
    var out = document.getElementById('umLogout');
    if (out) out.addEventListener('click', async function () {
      try { localStorage.removeItem(KEY); sessionStorage.removeItem(KEY); } catch (e) {}
      location.reload();
    });
  }

  async function boot() {
    var me = await fetchMe();
    if (!me) return;              // giriş yok: Giriş / Üye Ol düğmeleri kalsın

    // site kodunun beklediği oturum nesnesi
    var p = me.profile || {};
    window.__aloraUser = {
      id: me.user.id,
      email: me.user.email,
      username: p.username || (me.user.email || '').split('@')[0],
      full_name: p.full_name || '',
      role: p.role || 'uye'
    };
    // "Yetkili girişi" modali yerine doğrudan panel akışı
    window.__aloraStaff = (p.role === 'admin' || p.role === 'yetkili');

    mount(me);
    // yetkili için proje ekleme düğmeleri
    var staff = me.profile && (me.profile.role === 'admin' || me.profile.role === 'yetkili');
    if (staff) {
      ['addProjectBtn', 'heroAddBtn'].forEach(function (id) {
        var b = document.getElementById(id);
        if (b) b.classList.remove('is-hidden');
      });
      var e = document.getElementById('emptyLoginBtn');
      if (e) { e.textContent = 'Yeni Proje Ekle'; e.setAttribute('data-open-add', ''); e.removeAttribute('data-open-login'); }
      // eski "Yetkili Girişi" düğmeleri de proje ekleme modalini açsın
      document.querySelectorAll('[data-open-login]').forEach(function (btn) {
        if (btn.id === 'loginBtn' || btn.id === 'signupBtn') return;
        btn.setAttribute('data-open-add', '');
        btn.removeAttribute('data-open-login');
        if (/Yetkili/i.test(btn.textContent)) btn.textContent = 'Yeni Proje Ekle';
      });
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
