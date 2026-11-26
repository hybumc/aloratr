/* ============================================================
   ALORA — kimlik doğrulama (üye ol, giriş, profil)
   Sunucu köprüsü üzerinden çalışır; secret key tarayıcıya girmez.
   ============================================================ */
(function () {
  'use strict';

  const BASE = (window.AloraAPI && window.AloraAPI.PROXY_URL) || 'https://alora-bridge.bold-yew-bb8.workers.dev';
  const KEY = (window.AloraAPI && window.AloraAPI.PUBLIC_TOKEN) || '';
  const SKEY = 'alora.session.v2';
  const RKEY = 'alora.remember';

  function read() {
    try {
      return JSON.parse(localStorage.getItem(SKEY) || sessionStorage.getItem(SKEY) || 'null');
    } catch (e) { return null; }
  }

  function write(sess, remember) {
    const store = remember ? localStorage : sessionStorage;
    try {
      if (sess) {
        store.setItem(SKEY, JSON.stringify(sess));
        (remember ? sessionStorage : localStorage).removeItem(SKEY);
      } else {
        localStorage.removeItem(SKEY);
        sessionStorage.removeItem(SKEY);
      }
    } catch (e) {}
  }

  function deviceName() {
    const ua = navigator.userAgent || '';
    if (/iPad|Tablet/i.test(ua)) return 'tablet';
    if (/Mobi|Android|iPhone/i.test(ua)) return 'telefon';
    return 'bilgisayar';
  }

  async function call(path, opts) {
    const o = opts || {};
    const sess = read();
    const headers = Object.assign({ 'x-alora-key': KEY }, o.headers || {});
    if (sess && sess.access_token && !o.noAuth) headers['x-alora-token'] = sess.access_token;
    if (o.body) headers['Content-Type'] = 'application/json';
    const res = await fetch(BASE + path, {
      method: o.method || (o.body ? 'POST' : 'GET'),
      headers,
      body: o.body ? JSON.stringify(o.body) : undefined,
      cache: 'no-store'
    });
    const txt = await res.text();
    let data = {};
    try { data = txt ? JSON.parse(txt) : {}; } catch (e) { data = { raw: txt }; }
    if (!res.ok) {
      const msg = data.error_description || data.msg || data.error || data.message || ('Hata ' + res.status);
      const err = new Error(tr(msg));
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  }

  function tr(m) {
    const map = {
      'Invalid login credentials': 'Kullanıcı adı veya şifre hatalı',
      'Email not confirmed': 'E-posta adresi doğrulanmamış',
      'User already registered': 'Bu e-posta ile bir hesap zaten var',
      'Password should be at least 6 characters': 'Şifre en az 6 karakter olmalı',
      'Unable to validate email address: invalid format': 'Geçersiz e-posta adresi',
      'Email rate limit exceeded': 'Çok fazla deneme. Lütfen biraz bekleyin',
      'For security purposes, you can only request this after 60 seconds.': 'Güvenlik nedeniyle 60 saniye bekleyin'
    };
    return map[m] || m;
  }

  async function signIn(identifier, password, remember) {
    const id = (identifier || '').trim();
    const data = await call('/auth/token', { body: { email: id, password } });
    const sess = {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      user: data.user,
      expires_at: Date.now() + (data.expires_in || 3600) * 1000
    };
    write(sess, remember !== false);
    try {
      await call('/session/start', { body: { device: deviceName() } });
    } catch (e) {}
    return sess;
  }

  async function signUp(email, password, username, fullName) {
    const data = await call('/auth/signup', {
      body: { email: (email || '').trim(), password, username: (username || '').trim(), full_name: (fullName || '').trim() }
    });
    if (data.access_token) {
      const sess = {
        access_token: data.access_token,
        refresh_token: data.refresh_token,
        user: data.user,
        expires_at: Date.now() + (data.expires_in || 3600) * 1000
      };
      write(sess, true);
      return { session: sess, needConfirm: false };
    }
    return { session: null, needConfirm: true, user: data.user || null };
  }

  async function signOut() {
    const sess = read();
    try { if (sess) await call('/auth/logout', { method: 'POST' }); } catch (e) {}
    write(null);
  }

  async function me() {
    const sess = read();
    if (!sess || !sess.access_token) return null;
    try {
      const data = await call('/auth/user');
      return { session: sess, user: data.user, profile: data.profile };
    } catch (e) {
      if (e.status === 401 && sess.refresh_token) {
        try {
          const r = await call('/auth/refresh', { noAuth: true, body: { refresh_token: sess.refresh_token } });
          const next = Object.assign({}, sess, {
            access_token: r.access_token,
            refresh_token: r.refresh_token || sess.refresh_token,
            user: r.user || sess.user,
            expires_at: Date.now() + (r.expires_in || 3600) * 1000
          });
          write(next, !!localStorage.getItem(SKEY));
          return { session: next, user: next.user, profile: null };
        } catch (e2) { write(null); return null; }
      }
      return null;
    }
  }

  async function updateProfile(fields) {
    return call('/auth/profile', { method: 'POST', body: fields });
  }

  async function resetPassword(email) {
    return call('/auth/reset', { body: { email: (email || '').trim() } });
  }

  function roleLabel(role) {
    return role === 'admin' ? 'yönetici' : role === 'yetkili' ? 'yetkili' : 'üye';
  }

  function isStaff(p) { return !!p && (p.role === 'admin' || p.role === 'yetkili') && !p.banned; }
  function isAdmin(p) { return !!p && p.role === 'admin' && !p.banned; }

  window.AloraAuth = {
    signIn, signUp, signOut, me, updateProfile, resetPassword,
    session: read, roleLabel, isStaff, isAdmin, deviceName, call
  };
})();
