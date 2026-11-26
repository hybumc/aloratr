/* ============================================================
   ALORA — kontrol paneli uygulaması (v2)
   Özet, analiz (grafik), üyeler, oturumlar, etkinlik, projeler
   ============================================================ */
(function () {
  'use strict';

  var API = window.AloraAuth;
  var state = { me: null, profile: null, tab: 'ozet', data: {} };
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function fmtDate(d) {
    if (!d) return '—';
    var x = new Date(d);
    return x.toLocaleDateString('tr-TR', { day: '2-digit', month: 'short' }) + ' ' +
           x.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
  }
  function ago(d) {
    if (!d) return '';
    var s = Math.floor((Date.now() - new Date(d).getTime()) / 1000);
    if (s < 60) return 'az önce';
    if (s < 3600) return Math.floor(s / 60) + ' dk önce';
    if (s < 86400) return Math.floor(s / 3600) + ' sa önce';
    return Math.floor(s / 86400) + ' gün önce';
  }
  function rolePill(role) {
    var cls = role === 'admin' ? 'pill-admin' : role === 'yetkili' ? 'pill-staff' : 'pill-user';
    return '<span class="pill ' + cls + '">' + esc(API.roleLabel(role)) + '</span>';
  }
  function initials(name) {
    var p = String(name || '?').trim().split(/\s+/);
    return p.length === 1 ? p[0].slice(0, 2).toUpperCase() : (p[0][0] + p[1][0]).toUpperCase();
  }
  function skeleton(rows) {
    var h = '';
    for (var i = 0; i < (rows || 3); i++) h += '<div class="skel skel-line" style="width:' + (90 - i * 12) + '%"></div>';
    return '<div class="box"><div class="box-body">' + h + '</div></div>';
  }

  /* ---------------- giriş kontrolü ---------------- */
  async function guard() {
    var s = await API.me().catch(function () { return null; });
    if (!s || !s.user || !s.profile || !API.isStaff(s.profile)) return false;
    state.me = s.user; state.profile = s.profile;
    return true;
  }

  /* ---------------- sekmeler ---------------- */
  var TITLES = {
    ozet: ['Özet', 'Platformun anlık durumu'],
    analiz: ['Analiz', 'İndirme, üyelik ve etkileşim grafikleri'],
    uyeler: ['Üyeler', 'Kayıtlı kullanıcılar ve rolleri'],
    oturumlar: ['Oturumlar', 'Kim, ne zaman, hangi cihazdan giriş yaptı'],
    etkinlik: ['Etkinlik', 'Son yapılan işlemler'],
    projeler: ['Projeler', 'Yayınlanan projeler ve indirme sayıları'],
    yorumlar: ['Yorumlar', 'Kullanıcı yorumları ve puanlar']
  };

  function setTab(tab) {
    if (!TITLES[tab]) tab = 'ozet';
    state.tab = tab;
    $$('.side .nav[data-tab]').forEach(function (a) {
      a.classList.toggle('on', a.getAttribute('data-tab') === tab);
    });
    var t = TITLES[tab];
    $('#pageTitle').textContent = t[0];
    $('#pageSub').textContent = t[1];
    if (window.innerWidth <= 900) $('#sideNav').classList.remove('open');
    render();
  }

  /* ---------------- veri ---------------- */
  async function loadSummary() {
    try { state.data.summary = await API.call('/admin/summary'); }
    catch (e) { state.data.summary = null; }
  }
  async function loadMembers() {
    try {
      var r = await API.call('/admin/members');
      state.data.members = Array.isArray(r) ? r : [];
    } catch (e) { state.data.members = []; }
  }
  async function loadList(key, path, fallback) {
    try {
      var r = await API.call(path);
      state.data[key] = Array.isArray(r) ? r : [];
    } catch (e) { state.data[key] = fallback || []; }
  }

  /* ---------------- grafikler ---------------- */
  function barChart(items, alt) {
    if (!items.length) return '<div class="chart-empty">Henüz veri yok — ilk proje eklendiğinde grafik dolmaya başlar.</div>';
    var max = Math.max.apply(null, items.map(function (i) { return i.value; }).concat([1]));
    var h = '<div class="chart">';
    items.forEach(function (it, idx) {
      var pct = Math.max(3, Math.round((it.value / max) * 100));
      h += '<div class="bar-wrap" title="' + esc(it.label) + ': ' + it.value + '">' +
        '<div class="bar' + (alt ? ' alt' : '') + '" style="height:' + pct + '%;animation-delay:' + (idx * 0.06) + 's"></div>' +
        '<span class="bar-lbl">' + esc(it.label) + '</span>' +
      '</div>';
    });
    return h + '</div>';
  }

  function donut(items, total, center) {
    var R = 52, C = 2 * Math.PI * R;
    var colors = ['#0fb8c9', '#7c3aed', '#f5a623', '#17b26a', '#e5484d'];
    var segs = '', off = 0;
    items.forEach(function (it, i) {
      var frac = total ? it.value / total : 0;
      var len = C * frac;
      segs += '<circle class="val" cx="66" cy="66" r="' + R + '" stroke="' + colors[i % colors.length] + '" ' +
        'stroke-dasharray="' + len + ' ' + (C - len) + '" stroke-dashoffset="' + (-off) + '" ' +
        'style="animation-delay:' + (i * 0.15) + 's"></circle>';
      off += len;
    });
    if (!segs) segs = '<circle class="val" cx="66" cy="66" r="' + R + '" stroke="#e4ebf3" stroke-dasharray="0 ' + C + '"></circle>';

    var legend = items.map(function (it, i) {
      return '<div><i style="background:' + colors[i % colors.length] + '"></i>' + esc(it.label) +
        '<b>' + it.value + '</b></div>';
    }).join('');

    return '<div class="donut-wrap">' +
      '<div class="donut-center">' +
        '<svg class="donut" viewBox="0 0 132 132">' +
          '<defs><linearGradient id="dgrad" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0fb8c9"/><stop offset="1" stop-color="#7c3aed"/></linearGradient></defs>' +
          '<circle class="trk" cx="66" cy="66" r="' + R + '"></circle>' + segs +
        '</svg>' +
        '<span class="donut-num">' + esc(center) + '</span>' +
      '</div>' +
      '<div class="legend">' + legend + '</div>' +
    '</div>';
  }

  /* ---------------- görünümler ---------------- */
  function viewOzet() {
    var s = state.data.summary;
    if (!s) {
      return '<div class="box"><div class="box-body" style="color:var(--muted);font-size:13.5px">' +
        'Özet yüklenemedi. Oturumu kapatıp tekrar giriş yapmayı deneyin.</div></div>';
    }
    var cards = [
      ['Projeler', s.projeler, 'yayında'],
      ['Kullanıcılar', s.kullanicilar, (s.yetkililer || 0) + ' yetkili'],
      ['Yorumlar', s.yorumlar, 'geri bildirim'],
      ['İndirmeler', s.indirmeler, 'toplam'],
      ['Aktif oturum', s.aktif_oturum, 'son 30 dk'],
      ['Bugün giriş', s.bugun_giris, 'kişi'],
      ['Depolama', (s.depolama_mb || 0) + ' MB', (s.dosyalar || 0) + ' dosya']
    ];
    var html = '<div class="stats">' + cards.map(function (c) {
      return '<div class="stat"><small>' + esc(c[0]) + '</small><b>' + esc(c[1]) + '</b><span>' + esc(c[2]) + '</span></div>';
    }).join('') + '</div>';

    var roles = s.rol_dagilimi || {};
    var roleItems = [
      { label: 'Üyeler', value: roles.uye || 0 },
      { label: 'Yetkililer', value: roles.yetkili || 0 },
      { label: 'Yöneticiler', value: roles.admin || 0 }
    ].filter(function (x) { return x.value > 0; });

    html += '<div class="grid2">';
    html += '<div class="box"><div class="box-head"><h3>Son etkinlik</h3><span class="cnt">' +
      ((s.son_etkinlik || []).length) + ' kayıt</span></div>' + feedHtml(s.son_etkinlik) + '</div>';
    html += '<div class="box"><div class="box-head"><h3>Rol dağılımı</h3><span class="cnt">' +
      (s.kullanicilar || 0) + ' kişi</span></div><div class="box-body">' +
      donut(roleItems, s.kullanicilar || 0, s.kullanicilar || 0) + '</div></div>';
    html += '</div>';

    html += '<div class="box"><div class="box-head"><h3>Son kayıtlar</h3><span class="cnt">' +
      ((s.son_kayitlar || []).length) + ' kişi</span></div>' + usersFeed(s.son_kayitlar) + '</div>';
    return html;
  }

  function feedHtml(list) {
    var items = list || [];
    if (!items.length) return '<div class="box-body" style="color:var(--muted);font-size:13px">Henüz etkinlik yok.</div>';
    return '<div class="feed">' + items.map(function (a, i) {
      return '<div class="feed-i" style="animation-delay:' + (i * 0.04) + 's">' +
        '<span class="feed-av">' + esc(initials(a.actor)) + '</span>' +
        '<span class="feed-t"><b>' + esc(a.actor) + '</b> — ' + esc(a.action) +
          (a.detail ? ' <span style="color:var(--muted)">' + esc(a.detail) + '</span>' : '') +
          '<small>' + ago(a.created_at) + ' · ' + fmtDate(a.created_at) + '</small></span>' +
        '</div>';
    }).join('') + '</div>';
  }

  function usersFeed(list) {
    var items = list || [];
    if (!items.length) return '<div class="box-body" style="color:var(--muted);font-size:13px">Henüz üye yok.</div>';
    return '<div class="feed">' + items.map(function (u, i) {
      return '<div class="feed-i" style="animation-delay:' + (i * 0.04) + 's">' +
        '<span class="feed-av">' + esc(initials(u.full_name || u.username)) + '</span>' +
        '<span class="feed-t"><b>' + esc(u.full_name || u.username) + '</b> ' + rolePill(u.role) +
          '<small>@' + esc(u.username) + ' · ' + fmtDate(u.created_at) + '</small></span>' +
        '</div>';
    }).join('') + '</div>';
  }

  function viewAnaliz() {
    var s = state.data.summary || {};
    var members = state.data.members || [];
    var projects = state.data.projects || [];

    // aylık kayıt grafiği (son 6 ay)
    var months = [];
    var now = new Date();
    for (var i = 5; i >= 0; i--) {
      var d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({
        label: d.toLocaleDateString('tr-TR', { month: 'short' }),
        key: d.getFullYear() + '-' + d.getMonth(),
        value: 0
      });
    }
    members.forEach(function (m) {
      var c = new Date(m.created_at);
      var k = c.getFullYear() + '-' + c.getMonth();
      months.forEach(function (mo) { if (mo.key === k) mo.value++; });
    });

    // proje platform dağılımı
    var plat = {};
    projects.forEach(function (p) {
      var k = (p.platforms && p.platforms.length ? p.platforms[0] : p.platform) || 'diğer';
      plat[k] = (plat[k] || 0) + 1;
    });
    var platItems = Object.keys(plat).map(function (k) { return { label: k, value: plat[k] }; });

    var html = '<div class="stats">' +
      '<div class="stat"><small>Toplam indirme</small><b>' + (s.indirmeler || 0) + '</b><span>tüm projeler</span></div>' +
      '<div class="stat"><small>Ortalama yorum</small><b>' + (s.projeler ? (s.yorumlar / s.projeler).toFixed(1) : '0') + '</b><span>proje başına</span></div>' +
      '<div class="stat"><small>Aktif oturum</small><b>' + (s.aktif_oturum || 0) + '</b><span>son 30 dk</span></div>' +
      '<div class="stat"><small>Depolama</small><b>' + (s.depolama_mb || 0) + '</b><span>MB kullanım</span></div>' +
    '</div>';

    html += '<div class="box"><div class="box-head"><h3>Aylık yeni üye</h3><span class="cnt">son 6 ay</span></div>' +
      '<div class="box-body">' + barChart(months, false) + '</div></div>';

    html += '<div class="grid2">';
    html += '<div class="box"><div class="box-head"><h3>Platform dağılımı</h3><span class="cnt">' +
      projects.length + ' proje</span></div><div class="box-body">' +
      (platItems.length ? donut(platItems, projects.length, projects.length)
        : '<div class="chart-empty">Henüz proje yok.</div>') + '</div></div>';
    html += '<div class="box"><div class="box-head"><h3>En çok indirilen</h3><span class="cnt">ilk 5</span></div>' +
      topProjects(projects) + '</div>';
    html += '</div>';
    return html;
  }

  function topProjects(list) {
    if (!list.length) return '<div class="box-body" style="color:var(--muted);font-size:13px">Henüz proje yok.</div>';
    var top = list.slice().sort(function (a, b) { return (b.downloads || 0) - (a.downloads || 0); }).slice(0, 5);
    var max = Math.max.apply(null, top.map(function (p) { return p.downloads || 0; }).concat([1]));
    return '<div class="box-body">' + top.map(function (p, i) {
      var pct = Math.round(((p.downloads || 0) / max) * 100);
      return '<div style="margin-bottom:13px">' +
        '<div style="display:flex;justify-content:space-between;font-size:12.5px;margin-bottom:5px">' +
          '<span style="color:var(--ink);font-weight:600">' + esc(p.name) + '</span>' +
          '<span style="color:var(--muted);font-variant-numeric:tabular-nums">' + (p.downloads || 0) + '</span>' +
        '</div>' +
        '<div style="height:7px;border-radius:5px;background:var(--line);overflow:hidden">' +
          '<div style="height:100%;width:' + pct + '%;border-radius:5px;background:linear-gradient(90deg,var(--brand),var(--brand-2));' +
            'animation:grow .8s cubic-bezier(.22,1,.36,1) both;transform-origin:left"></div>' +
        '</div>' +
      '</div>';
    }).join('') + '</div>';
  }

  function viewMembers() {
    var list = state.data.members || [];
    var h = '<div class="box"><div class="box-head"><h3>Üyeler</h3><span class="cnt">' + list.length + ' kullanıcı</span></div>';
    if (!list.length) return h + '<div class="box-body" style="color:var(--muted);font-size:13px">Üye bulunamadı.</div></div>';
    var isAdmin = API.isAdmin(state.profile);
    h += '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Kullanıcı</th><th>E-posta</th><th>Rol</th><th>Proje</th><th>Yorum</th><th>Kayıt</th><th></th></tr></thead><tbody>';
    list.forEach(function (u) {
      h += '<tr>' +
        '<td><div style="display:flex;align-items:center;gap:9px"><span class="feed-av" style="width:28px;height:28px;font-size:10.5px">' +
          esc(initials(u.full_name || u.username)) + '</span><span><b style="color:var(--ink)">' + esc(u.full_name || u.username) +
          '</b><br><small style="color:var(--muted)">@' + esc(u.username) + '</small></span></div></td>' +
        '<td>' + esc(u.email || '—') + '</td>' +
        '<td>' + rolePill(u.role) + (u.banned ? ' <span class="pill pill-ban">askıda</span>' : '') + '</td>' +
        '<td>' + (u.proje_sayisi || 0) + '</td><td>' + (u.yorum_sayisi || 0) + '</td>' +
        '<td style="white-space:nowrap">' + fmtDate(u.created_at) + '</td>' +
        '<td style="white-space:nowrap">' + (isAdmin ?
          '<select class="sel" data-role="' + u.id + '">' + ['uye', 'yetkili', 'admin'].map(function (r) {
            return '<option value="' + r + '"' + (u.role === r ? ' selected' : '') + '>' + API.roleLabel(r) + '</option>';
          }).join('') + '</select> ' +
          '<button class="btn-sm ' + (u.banned ? '' : 'btn-danger') + '" data-ban="' + u.id + '" data-banned="' + (u.banned ? '1' : '0') + '">' +
          (u.banned ? 'Aç' : 'Askıya al') + '</button>'
          : '<span style="color:var(--muted);font-size:11.5px">sadece yönetici</span>') + '</td>' +
      '</tr>';
    });
    return h + '</tbody></table></div></div>';
  }

  function viewSessions() {
    var list = state.data.sessions || [];
    var h = '<div class="box"><div class="box-head"><h3>Giriş oturumları</h3><span class="cnt">' + list.length + ' kayıt</span></div>';
    if (!list.length) return h + '<div class="box-body" style="color:var(--muted);font-size:13px">Henüz oturum kaydı yok.</div></div>';
    h += '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Kullanıcı</th><th>Cihaz</th><th>Giriş</th><th>Son görülme</th><th>IP</th><th>Durum</th></tr></thead><tbody>';
    list.forEach(function (s) {
      var active = s.active && (Date.now() - new Date(s.last_seen_at).getTime()) < 30 * 60000;
      h += '<tr>' +
        '<td><b style="color:var(--ink)">' + esc(s.username) + '</b></td>' +
        '<td>' + esc(s.device) + '</td>' +
        '<td style="white-space:nowrap">' + fmtDate(s.logged_in_at) + '</td>' +
        '<td style="white-space:nowrap">' + ago(s.last_seen_at) + '</td>' +
        '<td><small style="color:var(--muted)">' + esc((s.ip || '—').slice(0, 24)) + '</small></td>' +
        '<td>' + (active ? '<span class="pill pill-ok">aktif</span>' : '<span class="pill pill-user">kapalı</span>') + '</td>' +
      '</tr>';
    });
    return h + '</tbody></table></div></div>';
  }

  function viewProjects() {
    var list = state.data.projects || [];
    var h = '<div class="box"><div class="box-head"><h3>Projeler</h3><span class="cnt">' + list.length + ' proje</span></div>';
    if (!list.length) return h + '<div class="box-body" style="color:var(--muted);font-size:13px">Henüz proje yok. Ana sayfadan yeni proje ekleyin.</div></div>';
    h += '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Proje</th><th>Sürüm</th><th>Durum</th><th>İndirme</th><th>Tarih</th><th></th></tr></thead><tbody>';
    list.forEach(function (p) {
      var st = p.status === 'yayinda' ? '<span class="pill pill-ok">yayında</span>' :
               p.status === 'bakimda' ? '<span class="pill pill-staff">bakımda</span>' :
               '<span class="pill pill-user">arşiv</span>';
      h += '<tr>' +
        '<td><b style="color:var(--ink)">' + esc(p.name) + '</b><br><small style="color:var(--muted)">' + esc(p.author || '') + '</small></td>' +
        '<td>' + esc(p.version || '—') + '</td><td>' + st + '</td>' +
        '<td>' + (p.downloads || 0) + '</td>' +
        '<td style="white-space:nowrap">' + fmtDate(p.created_at) + '</td>' +
        '<td><button class="btn-sm btn-danger" data-delproj="' + p.id + '">Sil</button></td>' +
      '</tr>';
    });
    return h + '</tbody></table></div></div>';
  }

  function viewComments() {
    var list = state.data.comments || [];
    var h = '<div class="box"><div class="box-head"><h3>Yorumlar</h3><span class="cnt">' + list.length + ' yorum</span></div>';
    if (!list.length) return h + '<div class="box-body" style="color:var(--muted);font-size:13px">Henüz yorum yok.</div></div>';
    h += '<div class="feed">' + list.map(function (c, i) {
      var stars = c.rating ? '★'.repeat(c.rating) : '';
      return '<div class="feed-i" style="animation-delay:' + (i * 0.04) + 's">' +
        '<span class="feed-av">' + esc(initials(c.author)) + '</span>' +
        '<span class="feed-t"><b>' + esc(c.author) + '</b> ' +
          (stars ? '<span style="color:#f5a623">' + stars + '</span>' : '') +
          '<div style="color:var(--ink-2);margin:4px 0">' + esc(c.body) + '</div>' +
          '<small>' + ago(c.created_at) + '</small></span>' +
        '</div>';
    }).join('') + '</div></div>';
    return h;
  }

  /* ---------------- çiz ---------------- */
  async function render() {
    var box = $('#tabContent');
    box.innerHTML = skeleton(3);

    if (state.tab === 'ozet') { await loadSummary(); box.innerHTML = viewOzet(); }
    else if (state.tab === 'analiz') {
      await loadSummary(); await loadMembers();
      await loadList('projects', '/rest/projects?select=*&order=created_at.desc&limit=200');
      box.innerHTML = viewAnaliz();
    }
    else if (state.tab === 'uyeler') { await loadMembers(); box.innerHTML = viewMembers(); }
    else if (state.tab === 'oturumlar') { await loadList('sessions', '/rest/sessions_log?select=*&order=logged_in_at.desc&limit=100'); box.innerHTML = viewSessions(); }
    else if (state.tab === 'etkinlik') { await loadSummary(); box.innerHTML = '<div class="box"><div class="box-head"><h3>Son etkinlik</h3></div>' + feedHtml((state.data.summary || {}).son_etkinlik) + '</div>'; }
    else if (state.tab === 'projeler') { await loadList('projects', '/rest/projects?select=*&order=created_at.desc&limit=100'); box.innerHTML = viewProjects(); }
    else if (state.tab === 'yorumlar') { await loadList('comments', '/rest/comments?select=*&order=created_at.desc&limit=100'); box.innerHTML = viewComments(); }

    bind();
  }

  function bind() {
    $$('[data-role]').forEach(function (sel) {
      sel.addEventListener('change', async function () {
        if (!confirm('Rolü "' + API.roleLabel(sel.value) + '" olarak değiştirmek istiyor musunuz?')) { render(); return; }
        try { await API.call('/admin/role', { method: 'POST', body: { user_id: sel.getAttribute('data-role'), role: sel.value } }); }
        catch (e) { alert(e.message); }
        render();
      });
    });
    $$('[data-ban]').forEach(function (b) {
      b.addEventListener('click', async function () {
        var banned = b.getAttribute('data-banned') === '1';
        if (!confirm(banned ? 'Bu üyenin erişimini açmak istiyor musunuz?' : 'Bu üyeyi askıya almak istiyor musunuz?')) return;
        try { await API.call('/admin/ban', { method: 'POST', body: { user_id: b.getAttribute('data-ban'), banned: !banned } }); }
        catch (e) { alert(e.message); }
        render();
      });
    });
    $$('[data-delproj]').forEach(function (b) {
      b.addEventListener('click', async function () {
        if (!confirm('Bu proje kalıcı olarak silinsin mi?')) return;
        try { await API.call('/rest/projects?id=eq.' + b.getAttribute('data-delproj'), { method: 'DELETE' }); }
        catch (e) { alert(e.message); }
        render();
      });
    });
  }

  /* ---------------- başlat ---------------- */
  (async function boot() {
    var ok = await guard();
    if (!ok) { $('#lockScreen').style.display = 'block'; $('#panelBody').hidden = true; return; }
    $('#lockScreen').style.display = 'none';
    $('#panelBody').hidden = false;

    var p = state.profile || {};
    var name = p.full_name || p.username || 'B';
    $('#meAv').textContent = initials(name);
    $('#meRole').textContent = API.roleLabel(p.role);

    $$('.side .nav[data-tab]').forEach(function (a) {
      a.addEventListener('click', function (e) { e.preventDefault(); location.hash = a.getAttribute('data-tab'); });
    });
    window.addEventListener('hashchange', function () { setTab((location.hash || '#ozet').slice(1)); });

    $('#refreshBtn').addEventListener('click', render);
    var mb = $('#menuBtn');
    if (mb) mb.addEventListener('click', function () { $('#sideNav').classList.toggle('open'); });

    var lo = $('[data-logout]');
    if (lo) lo.addEventListener('click', async function () { await API.signOut(); location.replace('index.html'); });

    setTab((location.hash || '#ozet').slice(1) || 'ozet');

    // canlı yenileme (60 sn)
    setInterval(function () {
      if (document.hidden) return;
      if (state.tab === 'ozet' || state.tab === 'analiz') render();
    }, 60000);
  })();
})();
