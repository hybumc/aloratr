/* ============================================================
   ALORA — Supabase istemcisi
   Güvenlik: bu dosya tarayıcıya gönderilmez. index.html içine
   sadece PROXY_URL ve PUBLIC_TOKEN gömülür; secret key burada kalır.
   ============================================================ */
(function () {
  'use strict';

  /* ---- derleme sırasında doldurulur ---- */
  const PROXY_URL = 'https://alora-bridge.bold-yew-bb8.workers.dev';
  const PUBLIC_TOKEN = '41ca9eb5f3a5747a2a6a5c7c9c9a46ddc205eca7274db5ae';
  const BUCKET = 'proje-dosyalari';
  const SESSION_KEY = 'alora.session';

  const SESSION_KEY_V2 = 'alora.session.v2';
  function readSession() {
    try {
      var v2 = localStorage.getItem(SESSION_KEY_V2) || sessionStorage.getItem(SESSION_KEY_V2);
      if (v2) {
        var s2 = JSON.parse(v2);
        // expires_at ms cinsinden; süresi geçmişse token yine denenir (worker 401 verirse refresh)
        if (s2 && s2.access_token) return s2;
      }
      var old = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
      if (old && old.access_token) return old;
      return null;
    } catch (e) { return null; }
  }

  // token'ı doğrudan Worker'dan al (alora-auth hiç çalışmadıysa kurtarma)
  async function recoverToken() {
    try {
      var v2 = localStorage.getItem(SESSION_KEY_V2) || sessionStorage.getItem(SESSION_KEY_V2);
      return !!v2;
    } catch (e) { return false; }
  }
  function writeSession(s) {
    try {
      if (s) localStorage.setItem(SESSION_KEY, JSON.stringify(s));
      else localStorage.removeItem(SESSION_KEY);
    } catch (e) {}
  }

  let session = readSession();
  if (session && session.expires_at && session.expires_at * 1000 < Date.now()) session = null;

  function qs(obj) {
    const p = [];
    Object.keys(obj || {}).forEach((k) => {
      const v = obj[k];
      if (v === undefined || v === null) return;
      p.push(encodeURIComponent(k) + '=' + encodeURIComponent(v));
    });
    return p.length ? '?' + p.join('&') : '';
  }

  /* ---- proxy üzerinden REST ---- */
  async function rest(path, opts) {
    const o = opts || {};
    session = readSession();
    const headers = Object.assign({
      'x-alora-key': PUBLIC_TOKEN,
      ...(session && session.access_token ? { 'x-alora-token': session.access_token } : {})
    }, o.headers || {});
    if (o.json !== undefined) {
      headers['Content-Type'] = 'application/json';
      headers['Prefer'] = o.prefer || 'return=representation';
    }
    const res = await fetch(PROXY_URL + '/rest/' + path, {
      method: o.method || (o.json !== undefined ? 'POST' : 'GET'),
      headers,
      body: o.json !== undefined ? JSON.stringify(o.json) : o.body
    });
    const txt = await res.text();
    let data = null;
    try { data = txt ? JSON.parse(txt) : null; } catch (e) { data = null; }
    if (!res.ok) {
      const msg = (data && (data.message || data.error_description || data.hint)) || ('İstek başarısız (' + res.status + ')');
      throw new Error(msg);
    }
    return data;
  }

  /* ---- auth ---- */
  async function signIn(email, password) {
    const res = await fetch(PROXY_URL + '/auth/token', {
      method: 'POST',
      headers: { 'x-alora-key': PUBLIC_TOKEN, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error((data && (data.error_description || data.msg || data.message || data.error)) || 'Giriş başarısız');
    session = {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: Math.floor(Date.now() / 1000) + (data.expires_in || 3600),
      user: data.user
    };
    writeSession(session);
    return session.user;
  }

  async function refresh() {
    if (!session || !session.refresh_token) return null;
    const res = await fetch(PROXY_URL + '/auth/refresh', {
      method: 'POST',
      headers: { 'x-alora-key': PUBLIC_TOKEN, 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: session.refresh_token })
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) { session = null; writeSession(null); return null; }
    session.access_token = data.access_token;
    session.refresh_token = data.refresh_token;
    session.expires_at = Math.floor(Date.now() / 1000) + (data.expires_in || 3600);
    session.user = data.user || session.user;
    writeSession(session);
    return session;
  }

  async function currentUser() {
    if (!session) return null;
    if (session.expires_at && session.expires_at * 1000 < Date.now() + 30000) {
      if (!(await refresh())) return null;
    }
    const res = await fetch(PROXY_URL + '/auth/user', {
      headers: { 'x-alora-key': PUBLIC_TOKEN, 'x-alora-token': session.access_token }
    });
    if (!res.ok) { session = null; writeSession(null); return null; }
    return res.json();
  }

  async function signOut() {
    if (session) {
      try {
        await fetch(PROXY_URL + '/auth/logout', {
          method: 'POST',
          headers: { 'x-alora-key': PUBLIC_TOKEN, 'x-alora-token': session.access_token }
        });
      } catch (e) {}
    }
    session = null;
    writeSession(null);
  }

  async function profile(userId) {
    const rows = await rest('profiles?id=eq.' + userId + '&select=*');
    return (rows && rows[0]) || null;
  }

  /* ---- storage (proxy üzerinden) ---- */
  const SUPABASE_URL = 'https://mwmeqcdjeyuflkobezby.supabase.co';

  // Indirme: dogrudan Supabase public storage (anahtar gerekmez, herkese acik)
  function publicUrl(path, parts) {
    if (parts && parts > 1) {
      var name = path.split('/').pop().split('-').slice(1).join('-') || path.split('/').pop();
      return PROXY_URL + '/filechunks/' + path.split('/').map(encodeURIComponent).join('/') + '?parts=' + parts + '&name=' + encodeURIComponent(name);
    }
    return PROXY_URL + '/file/' + path.split('/').map(encodeURIComponent).join('/');
  }

  var CHUNK = 40 * 1024 * 1024; // 40 MB parça (Supabase 50 MB sınırının altında)

  function putChunk(urlPath, blob, onProgress) {
    session = readSession();
    if (!session || !session.access_token) {
      return Promise.reject(new Error('Oturum bulunamadı. Lütfen tekrar giriş yapın.'));
    }
    return new Promise(function (resolve, reject) {
      var xhr = new XMLHttpRequest();
      xhr.open('PUT', PROXY_URL + urlPath, true);
      xhr.setRequestHeader('x-alora-key', PUBLIC_TOKEN);
      xhr.setRequestHeader('x-alora-token', session.access_token);
      xhr.setRequestHeader('Content-Type', 'application/octet-stream');
      if (typeof onProgress === 'function') {
        xhr.upload.onprogress = function (ev) {
          if (ev.lengthComputable) onProgress(ev.loaded, ev.total);
        };
      }
      xhr.onload = function () {
        if (xhr.status >= 200 && xhr.status < 300) { resolve(true); return; }
        var msg = 'Parça yüklenemedi (' + xhr.status + ')';
        try { var jj = JSON.parse(xhr.responseText); msg = jj.error || jj.message || msg; } catch (e) {}
        reject(new Error(msg));
      };
      xhr.onerror = function () { reject(new Error('Bağlantı hatası — parça yüklenemedi.')); };
      xhr.send(blob);
    });
  }

  // Büyük dosyayı parçalara bölerek yükler. onProgress(yuklenenBayt, toplamBayt)
  async function uploadParts(path, file, onProgress) {
    var parts = Math.ceil(file.size / CHUNK);
    if (parts <= 1) {
      return upload(path, file, onProgress);
    }
    var sentBase = 0;
    for (var i = 1; i <= parts; i++) {
      var start = (i - 1) * CHUNK;
      var end = Math.min(file.size, start + CHUNK);
      var blob = file.slice(start, end);
      var base = sentBase;
      await putChunk('/upload/' + path.split('/').map(encodeURIComponent).join('/') + '.part' + i,
        blob, function (loaded) {
          if (onProgress) onProgress(base + loaded, file.size);
        });
      sentBase += blob.size;
      if (onProgress) onProgress(sentBase, file.size);
    }
    return { parts: parts, storagePath: path };
  }

  function upload(path, file, onProgress) {
    session = readSession();
    if (!session || !session.access_token) {
      return Promise.reject(new Error('Oturum bulunamadı. Lütfen tekrar giriş yapın.'));
    }
    return new Promise(function (resolve, reject) {
      var url = PROXY_URL + '/upload/' + path.split('/').map(encodeURIComponent).join('/');
      var xhr = new XMLHttpRequest();
      xhr.open('POST', url, true);
      xhr.setRequestHeader('x-alora-key', PUBLIC_TOKEN);
      xhr.setRequestHeader('x-alora-token', session.access_token);
      xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
      xhr.upload.onprogress = function (ev) {
        if (onProgress && ev.lengthComputable) onProgress(ev.loaded, ev.total);
      };
      xhr.onload = function () {
        if (xhr.status >= 200 && xhr.status < 300) { resolve(path); return; }
        var msg = 'Dosya yüklenemedi (' + xhr.status + ')';
        try { var jj = JSON.parse(xhr.responseText); msg = jj.error || jj.message || msg; } catch (e) {}
        reject(new Error(msg));
      };
      xhr.onerror = function () { reject(new Error('Bağlantı hatası — dosya yüklenemedi.')); };
      xhr.ontimeout = function () { reject(new Error('Yükleme zaman aşımına uğradı.')); };
      xhr.upload.onprogress = xhr.upload.onprogress;
      xhr.send(file);
    });
  }

  async function remove(path) {
    try {
      await fetch(PROXY_URL + '/remove/' + path.split('/').map(encodeURIComponent).join('/'), {
        method: 'DELETE',
        headers: { 'x-alora-key': PUBLIC_TOKEN, 'x-alora-token': session ? session.access_token : '' }
      });
    } catch (e) {}
  }

  async function bump(fileId) {
    try {
      await fetch(PROXY_URL + '/bump', {
        method: 'POST',
        headers: {
          'x-alora-key': PUBLIC_TOKEN,
          'x-alora-token': session ? session.access_token : '',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ file_id: fileId })
      });
    } catch (e) {}
  }

  window.AloraAPI = {
    PROXY_URL, BUCKET,
    rest, signIn, signOut, currentUser, profile,
    upload, uploadParts, remove, publicUrl, bump,
    hasSession: () => !!session,
    sessionUser: () => (session ? session.user : null)
  };
})();
