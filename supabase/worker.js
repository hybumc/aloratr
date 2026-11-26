/* ============================================================
   ALORA — güvenli köprü sunucusu (Cloudflare Worker)
   Tarayıcı secret key'i hiç görmez; istekler buradan geçer.
   Gizli değerler wrangler secret ile yüklenir.
   ============================================================ */

const BUCKET = 'proje-dosyalari';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const cors = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type,x-alora-key,x-alora-token,Prefer',
      'Access-Control-Max-Age': '86400'
    };

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

    // herkese açık paylaşım anahtarı kontrolü (kötüye kullanımı azaltır)
    const givenKey = request.headers.get('x-alora-key') || url.searchParams.get('k') || '';
    const isPublicFile = url.pathname.startsWith('/file/');
    if (!isPublicFile && env.PUBLIC_TOKEN && givenKey !== env.PUBLIC_TOKEN) {
      return json({ error: 'Yetkisiz istek' }, 401, cors);
    }

    const path = url.pathname;
    const userToken = request.headers.get('x-alora-token') || '';
    // kullanıcı oturumu varsa onun tokenı, yoksa secret key (RLS anon gibi davranır)
    const bearer = userToken || env.SUPABASE_SECRET;

    const sbHeaders = (extra) => Object.assign({
      apikey: env.SUPABASE_SECRET,
      Authorization: 'Bearer ' + bearer
    }, extra || {});

    try {
      /* ---------- REST ---------- */
      if (path.startsWith('/rest/')) {
        const target = env.SUPABASE_URL + '/rest/v1/' + path.slice(6) + url.search;
        const headers = sbHeaders({ 'Content-Type': request.headers.get('Content-Type') || 'application/json' });
        const prefer = request.headers.get('Prefer');
        if (prefer) headers.Prefer = prefer;
        const body = ['GET', 'HEAD'].includes(request.method) ? undefined : await request.text();
        const res = await fetch(target, { method: request.method, headers, body });
        return new Response(await res.text(), {
          status: res.status,
          headers: Object.assign({ 'Content-Type': 'application/json' }, cors)
        });
      }

      /* ---------- AUTH ---------- */
      if (path === '/auth/token' && request.method === 'POST') {
        let { email, password } = await request.json();
        // kullanıcı adı verilmişse e-postaya çevir
        if (email && email.indexOf('@') < 0) {
          const pr = await fetch(env.SUPABASE_URL + '/rest/v1/profiles?username=ilike.' + encodeURIComponent(email) + '&select=email', { headers: sbHeaders({}) });
          const pj = await pr.json().catch(() => []);
          if (Array.isArray(pj) && pj.length && pj[0].email) email = pj[0].email;
          else email = email + '@alora.app';
        }
        const res = await fetch(env.SUPABASE_URL + '/auth/v1/token?grant_type=password', {
          method: 'POST',
          headers: { apikey: env.SUPABASE_SECRET, 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password })
        });
        return new Response(await res.text(), {
          status: res.status,
          headers: Object.assign({ 'Content-Type': 'application/json' }, cors)
        });
      }

      if (path === '/auth/refresh' && request.method === 'POST') {
        const { refresh_token } = await request.json();
        const res = await fetch(env.SUPABASE_URL + '/auth/v1/token?grant_type=refresh_token', {
          method: 'POST',
          headers: { apikey: env.SUPABASE_SECRET, 'Content-Type': 'application/json' },
          body: JSON.stringify({ refresh_token })
        });
        return new Response(await res.text(), {
          status: res.status,
          headers: Object.assign({ 'Content-Type': 'application/json' }, cors)
        });
      }

      if (path === '/auth/user') {
        if (!userToken) return json({ error: 'Oturum yok' }, 401, cors);
        const res = await fetch(env.SUPABASE_URL + '/auth/v1/user', {
          headers: { apikey: env.SUPABASE_SECRET, Authorization: 'Bearer ' + userToken }
        });
        const txt = await res.text();
        if (!res.ok) return new Response(txt, { status: res.status, headers: Object.assign({ 'Content-Type': 'application/json' }, cors) });
        let user = null;
        try { user = JSON.parse(txt); } catch (e) { user = null; }
        let profile = null;
        if (user && user.id) {
          const pr = await fetch(env.SUPABASE_URL + '/rest/v1/profiles?id=eq.' + user.id + '&select=*', {
            headers: sbHeaders({})
          });
          const pj = await pr.json().catch(() => []);
          profile = Array.isArray(pj) && pj.length ? pj[0] : null;
        }
        return json({ user, profile }, 200, cors);
      }

      if (path === '/auth/logout' && request.method === 'POST') {
        if (!userToken) return json({ ok: true }, 200, cors);
        await fetch(env.SUPABASE_URL + '/auth/v1/logout', {
          method: 'POST',
          headers: { apikey: env.SUPABASE_SECRET, Authorization: 'Bearer ' + userToken }
        });
        return json({ ok: true }, 200, cors);
      }


      if (path === '/auth/signup' && request.method === 'POST') {
        const { email, password, username, full_name } = await request.json();
        const res = await fetch(env.SUPABASE_URL + '/auth/v1/signup', {
          method: 'POST',
          headers: { apikey: env.SUPABASE_SECRET, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email,
            password,
            data: { username, full_name, role: 'uye' }
          })
        });
        return new Response(await res.text(), {
          status: res.status,
          headers: Object.assign({ 'Content-Type': 'application/json' }, cors)
        });
      }

      if (path === '/auth/reset' && request.method === 'POST') {
        const { email } = await request.json();
        const res = await fetch(env.SUPABASE_URL + '/auth/v1/recover', {
          method: 'POST',
          headers: { apikey: env.SUPABASE_SECRET, 'Content-Type': 'application/json' },
          body: JSON.stringify({ email })
        });
        return new Response(await res.text(), {
          status: res.status,
          headers: Object.assign({ 'Content-Type': 'application/json' }, cors)
        });
      }

      if (path === '/auth/profile' && request.method === 'POST') {
        if (!userToken) return json({ error: 'Oturum yok' }, 401, cors);
        const { full_name, bio, phone } = await request.json();
        const uid = await whoAmI(userToken, env);
        if (!uid) return json({ error: 'Oturum gecersiz' }, 401, cors);
        const res = await fetch(env.SUPABASE_URL + '/rest/v1/profiles?id=eq.' + uid, {
          method: 'PATCH',
          headers: sbHeaders({ 'Content-Type': 'application/json', Prefer: 'return=representation' }),
          body: JSON.stringify({ full_name, bio, phone })
        });
        return new Response(await res.text(), {
          status: res.status,
          headers: Object.assign({ 'Content-Type': 'application/json' }, cors)
        });
      }


      /* ---------- YÖNETİM (yalnızca admin) ---------- */
      if (path === '/admin/members' || path === '/admin/summary' || path === '/admin/role' || path === '/admin/ban') {
        if (!userToken) return json({ error: 'Oturum yok' }, 401, cors);
        const uid = await whoAmI(userToken, env);
        if (!uid) return json({ error: 'Oturum gecersiz' }, 401, cors);
        const meRes = await fetch(env.SUPABASE_URL + '/rest/v1/profiles?id=eq.' + uid + '&select=role,banned', { headers: sbHeaders({}) });
        const me = await meRes.json();
        const prof = Array.isArray(me) && me.length ? me[0] : null;
        if (!prof || prof.role !== 'admin' || prof.banned) return json({ error: 'Yetkiniz yok' }, 403, cors);

        if (path === '/admin/members') {
          const r = await fetch(env.SUPABASE_URL + '/rest/v1/rpc/admin_members', {
            method: 'POST',
            headers: sbHeaders({ 'Content-Type': 'application/json' }),
            body: '{}'
          });
          return new Response(await r.text(), { status: r.status, headers: Object.assign({ 'Content-Type': 'application/json' }, cors) });
        }

        if (path === '/admin/summary') {
          const r = await fetch(env.SUPABASE_URL + '/rest/v1/rpc/admin_summary', {
            method: 'POST',
            headers: sbHeaders({ 'Content-Type': 'application/json' }),
            body: '{}'
          });
          return new Response(await r.text(), { status: r.status, headers: Object.assign({ 'Content-Type': 'application/json' }, cors) });
        }

        if (path === '/admin/role' && request.method === 'POST') {
          const { user_id, role } = await request.json();
          const r = await fetch(env.SUPABASE_URL + '/rest/v1/rpc/set_member_role', {
            method: 'POST',
            headers: sbHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify({ target: user_id, new_role: role })
          });
          return new Response(await r.text(), { status: r.status, headers: Object.assign({ 'Content-Type': 'application/json' }, cors) });
        }

        if (path === '/admin/ban' && request.method === 'POST') {
          const { user_id, banned } = await request.json();
          const r = await fetch(env.SUPABASE_URL + '/rest/v1/rpc/set_member_ban', {
            method: 'POST',
            headers: sbHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify({ target: user_id, banned })
          });
          return new Response(await r.text(), { status: r.status, headers: Object.assign({ 'Content-Type': 'application/json' }, cors) });
        }
      }

      /* ---------- OTURUM KAYDI ---------- */
      if (path === '/session/start' && request.method === 'POST') {
        if (!userToken) return json({ ok: false }, 200, cors);
        const uid = await whoAmI(userToken, env);
        if (!uid) return json({ ok: false }, 200, cors);
        const info = await request.json().catch(() => ({}));
        const pr = await fetch(env.SUPABASE_URL + '/rest/v1/profiles?id=eq.' + uid + '&select=username', { headers: sbHeaders({}) });
        const pj = await pr.json().catch(() => []);
        const uname = Array.isArray(pj) && pj.length ? pj[0].username : '—';
        await fetch(env.SUPABASE_URL + '/rest/v1/sessions_log', {
          method: 'POST',
          headers: sbHeaders({ 'Content-Type': 'application/json', Prefer: 'return=minimal' }),
          body: JSON.stringify({
            user_id: uid,
            username: uname,
            device: info.device || 'bilinmiyor',
            user_agent: (request.headers.get('User-Agent') || '').slice(0, 200),
            ip: request.headers.get('CF-Connecting-IP') || ''
          })
        });
        return json({ ok: true }, 200, cors);
      }

      /* ---------- DOSYA YÜKLEME ---------- */
      if (path.startsWith('/upload/') && request.method === 'POST') {
        if (!userToken) return json({ error: 'Dosya yüklemek için yetkili girişi gerekli' }, 401, cors);
        // kullanıcının gerçekten yetkili olduğunu doğrula
        const meRes = await fetch(env.SUPABASE_URL + '/rest/v1/profiles?id=eq.' + (await whoAmI(userToken, env)) + '&select=id', {
          headers: sbHeaders({})
        });
        const me = await meRes.json();
        if (!Array.isArray(me) || !me.length) return json({ error: 'Yetkiniz yok' }, 403, cors);

        const objPath = decodeURIComponent(path.slice(8));
        const res = await fetch(env.SUPABASE_URL + '/storage/v1/object/' + BUCKET + '/' + objPath.split('/').map(encodeURIComponent).join('/'), {
          method: 'POST',
          headers: {
            apikey: env.SUPABASE_SECRET,
            Authorization: 'Bearer ' + env.SUPABASE_SECRET,
            'x-upsert': 'true',
            'Content-Type': request.headers.get('Content-Type') || 'application/octet-stream'
          },
          body: request.body
        });
        const txt = await res.text();
        return new Response(txt, {
          status: res.status,
          headers: Object.assign({ 'Content-Type': 'application/json' }, cors)
        });
      }

      /* ---------- DOSYA SİLME ---------- */
      if (path.startsWith('/remove/') && request.method === 'DELETE') {
        if (!userToken) return json({ error: 'Yetkiniz yok' }, 401, cors);
        const uid = await whoAmI(userToken, env);
        const meRes = await fetch(env.SUPABASE_URL + '/rest/v1/profiles?id=eq.' + uid + '&select=id', { headers: sbHeaders({}) });
        const me = await meRes.json();
        if (!Array.isArray(me) || !me.length) return json({ error: 'Yetkiniz yok' }, 403, cors);
        const objPath = decodeURIComponent(path.slice(8));
        const res = await fetch(env.SUPABASE_URL + '/storage/v1/object/' + BUCKET + '/' + objPath.split('/').map(encodeURIComponent).join('/'), {
          method: 'DELETE',
          headers: { apikey: env.SUPABASE_SECRET, Authorization: 'Bearer ' + env.SUPABASE_SECRET }
        });
        return new Response(await res.text(), {
          status: res.ok ? 200 : res.status,
          headers: Object.assign({ 'Content-Type': 'application/json' }, cors)
        });
      }

      /* ---------- DOSYA İNDİRME ---------- */
      if (path.startsWith('/file/')) {
        const objPath = decodeURIComponent(path.slice(6));
        const res = await fetch(env.SUPABASE_URL + '/storage/v1/object/public/' + BUCKET + '/' + objPath.split('/').map(encodeURIComponent).join('/'));
        if (!res.ok) return new Response('Dosya bulunamadı', { status: 404, headers: cors });
        const headers = Object.assign({}, cors);
        headers['Content-Type'] = res.headers.get('Content-Type') || 'application/octet-stream';
        headers['Content-Disposition'] = 'attachment; filename="' + objPath.split('/').pop().replace(/"/g, '') + '"';
        headers['Cache-Control'] = 'public, max-age=3600';
        return new Response(res.body, { status: 200, headers });
      }

      /* ---------- İNDİRME SAYACI ---------- */
      if (path === '/bump' && request.method === 'POST') {
        const { file_id } = await request.json();
        await fetch(env.SUPABASE_URL + '/rest/v1/rpc/bump_download', {
          method: 'POST',
          headers: { apikey: env.SUPABASE_SECRET, Authorization: 'Bearer ' + env.SUPABASE_SECRET, 'Content-Type': 'application/json' },
          body: JSON.stringify({ file_id })
        });
        return json({ ok: true }, 200, cors);
      }

      /* ---------- SAĞLIK ---------- */
      if (path === '/' || path === '/health') {
        return json({ ok: true, service: 'alora-bridge' }, 200, cors);
      }

      return json({ error: 'Bilinmeyen yol' }, 404, cors);
    } catch (e) {
      return json({ error: 'Sunucu hatası: ' + e.message }, 500, cors);
    }
  }
};

async function whoAmI(token, env) {
  const res = await fetch(env.SUPABASE_URL + '/auth/v1/user', {
    headers: { apikey: env.SUPABASE_SECRET, Authorization: 'Bearer ' + token }
  });
  if (!res.ok) return '';
  const u = await res.json();
  return u && u.id ? u.id : '';
}

function json(obj, status, cors) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: Object.assign({ 'Content-Type': 'application/json' }, cors || {})
  });
}
