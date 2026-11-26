-- ============================================================
-- ALORA — Veritabanı Şeması v2
-- Üyelik sistemi, etkinlik günlüğü, oturum kaydı, yönetim paneli
-- Supabase SQL Editor'de baştan sona çalıştırın.
-- ============================================================

create extension if not exists "pgcrypto";

-- ------------------------------------------------------------
-- 1) PROFİLLER
-- ------------------------------------------------------------
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  username    text unique not null,
  full_name   text default '',
  email       text,
  avatar_url  text,
  phone       text,
  bio         text default '',
  role        text not null default 'uye',
  banned      boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- eski tablodan gelen eksik kolonlar
alter table public.profiles add column if not exists email      text;
alter table public.profiles add column if not exists avatar_url text;
alter table public.profiles add column if not exists phone      text;
alter table public.profiles add column if not exists bio        text default '';
alter table public.profiles add column if not exists banned     boolean not null default false;
alter table public.profiles add column if not exists updated_at timestamptz not null default now();

-- rol kısıtı: admin | yetkili | uye
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check check (role in ('admin','yetkili','uye'));
alter table public.profiles alter column role set default 'uye';

-- ------------------------------------------------------------
-- 2) PROJELER
-- ------------------------------------------------------------
create table if not exists public.projects (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  slug         text,
  description  text default '',
  version      text default '1.0.0',
  platform     text default 'windows',
  category     text default 'genel',
  status       text default 'yayinda',
  author       text default '',
  owner_id     uuid references auth.users(id) on delete set null,
  icon_url     text,
  screenshots  jsonb default '[]'::jsonb,
  downloads    integer not null default 0,
  size_bytes   bigint default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

alter table public.projects add column if not exists owner_id    uuid references auth.users(id) on delete set null;
alter table public.projects add column if not exists slug        text;
alter table public.projects add column if not exists icon_url    text;
alter table public.projects add column if not exists screenshots jsonb default '[]'::jsonb;
alter table public.projects add column if not exists size_bytes  bigint default 0;
alter table public.projects add column if not exists updated_at  timestamptz not null default now();

-- ------------------------------------------------------------
-- 3) DOSYALAR
-- ------------------------------------------------------------
create table if not exists public.files (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects(id) on delete cascade,
  file_name   text not null,
  file_path   text not null,
  file_type   text default 'exe',
  size_bytes  bigint default 0,
  created_at  timestamptz not null default now()
);

-- ------------------------------------------------------------
-- 4) YORUMLAR
-- ------------------------------------------------------------
create table if not exists public.comments (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects(id) on delete cascade,
  author      text not null,
  body        text not null,
  rating      integer default 5,
  user_id     uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now()
);

alter table public.comments add column if not exists user_id uuid references auth.users(id) on delete set null;

-- ------------------------------------------------------------
-- 5) ETKİNLİK GÜNLÜĞÜ
-- ------------------------------------------------------------
create table if not exists public.activity_log (
  id          bigserial primary key,
  actor       text default 'sistem',
  action      text not null,
  detail      text default '',
  user_id     uuid references auth.users(id) on delete set null,
  ip          text default '',
  user_agent  text default '',
  created_at  timestamptz not null default now()
);
create index if not exists activity_log_created_idx on public.activity_log (created_at desc);

-- ------------------------------------------------------------
-- 6) OTURUM KAYDI
-- ------------------------------------------------------------
create table if not exists public.sessions_log (
  id           bigserial primary key,
  user_id      uuid references auth.users(id) on delete cascade,
  username     text default '',
  device       text default 'bilinmiyor',
  ip           text default '',
  user_agent   text default '',
  active       boolean not null default true,
  logged_in_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);
create index if not exists sessions_log_in_idx on public.sessions_log (logged_in_at desc);

-- ------------------------------------------------------------
-- 7) SİTE AYARLARI
-- ------------------------------------------------------------
create table if not exists public.site_settings (
  key        text primary key,
  value      text,
  updated_at timestamptz not null default now()
);
insert into public.site_settings (key, value) values
  ('site_adi', 'ALORA'),
  ('bakim_modu', 'hayir'),
  ('kayit_acik', 'evet'),
  ('duyuru', '')
on conflict (key) do nothing;

-- ------------------------------------------------------------
-- 8) YARDIMCI FONKSİYONLAR
-- ------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

create or replace function public.is_staff()
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('admin','yetkili') and banned = false
  );
$$;

create or replace function public.is_admin()
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin' and banned = false
  );
$$;

create or replace function public.is_member()
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and banned = false
  );
$$;

-- indirme sayacı
create or replace function public.bump_download(p_project uuid)
returns void language sql security definer as $$
  update public.projects set downloads = downloads + 1 where id = p_project;
$$;

-- etkinlik yaz
create or replace function public.log_activity(p_action text, p_detail text default '', p_actor text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_actor text;
begin
  if p_actor is not null then
    v_actor := p_actor;
  else
    select coalesce(full_name, username, 'sistem') into v_actor
    from public.profiles where id = auth.uid();
    v_actor := coalesce(v_actor, 'sistem');
  end if;
  insert into public.activity_log (actor, action, detail, user_id)
  values (v_actor, p_action, p_detail, auth.uid());
end $$;

-- yeni kullanıcı -> profil
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_username text;
  v_full     text;
begin
  v_username := coalesce(
    nullif(new.raw_user_meta_data->>'username', ''),
    split_part(new.email, '@', 1)
  );
  v_full := coalesce(nullif(new.raw_user_meta_data->>'full_name', ''), v_username);

  -- kullanıcı adı çakışırsa sonuna sayı ekle
  if exists (select 1 from public.profiles where username = v_username) then
    v_username := v_username || '_' || substr(new.id::text, 1, 4);
  end if;

  insert into public.profiles (id, username, full_name, email, role)
  values (new.id, v_username, v_full, new.email, 'uye')
  on conflict (id) do update
    set email = excluded.email,
        username = coalesce(nullif(public.profiles.username, ''), excluded.username);

  insert into public.activity_log (actor, action, detail, user_id)
  values (v_full, 'kayit', 'yeni üye kaydı', new.id);

  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

drop trigger if exists projects_touch on public.projects;
create trigger projects_touch before update on public.projects
  for each row execute function public.touch_updated_at();

-- ------------------------------------------------------------
-- 9) YÖNETİM FONKSİYONLARI
-- ------------------------------------------------------------
create or replace function public.admin_summary()
returns jsonb language plpgsql security definer set search_path = public as $$
declare r jsonb;
begin
  if not public.is_staff() then
    raise exception 'yetkiniz yok';
  end if;
  select jsonb_build_object(
    'projeler',      (select count(*) from public.projects),
    'dosyalar',      (select count(*) from public.files),
    'kullanicilar',  (select count(*) from public.profiles),
    'yetkililer',    (select count(*) from public.profiles where role in ('admin','yetkili')),
    'yorumlar',      (select count(*) from public.comments),
    'indirmeler',    (select coalesce(sum(downloads),0) from public.projects),
    'aktif_oturum',  (select count(*) from public.sessions_log where active and last_seen_at > now() - interval '30 minutes'),
    'bugun_giris',   (select count(distinct user_id) from public.sessions_log where logged_in_at > now() - interval '24 hours'),
    'depolama_mb',   (select round(coalesce(sum(size_bytes),0)/1048576.0, 1) from public.files),
    'son_etkinlik',  (select coalesce(jsonb_agg(t), '[]'::jsonb) from (
                        select actor, action, detail, created_at
                        from public.activity_log order by created_at desc limit 12
                      ) t),
    'son_kayitlar',  (select coalesce(jsonb_agg(t), '[]'::jsonb) from (
                        select username, full_name, role, created_at
                        from public.profiles order by created_at desc limit 8
                      ) t),
    'rol_dagilimi',  (select coalesce(jsonb_object_agg(role, c), '{}'::jsonb) from (
                        select role, count(*) c from public.profiles group by role
                      ) t)
  ) into r;
  return r;
end $$;

create or replace function public.admin_members()
returns jsonb language plpgsql security definer set search_path = public as $$
declare r jsonb;
begin
  if not public.is_staff() then
    raise exception 'yetkiniz yok';
  end if;
  select coalesce(jsonb_agg(t order by t.created_at desc), '[]'::jsonb) into r from (
    select p.id, p.username, p.full_name, p.email, p.role, p.banned, p.created_at,
           (select count(*) from public.projects pr where pr.owner_id = p.id) as proje_sayisi,
           (select count(*) from public.comments c where c.user_id = p.id) as yorum_sayisi
    from public.profiles p
  ) t;
  return r;
end $$;

create or replace function public.set_member_role(target uuid, new_role text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'yetkiniz yok';
  end if;
  if new_role not in ('admin','yetkili','uye') then
    raise exception 'gecersiz rol';
  end if;
  update public.profiles set role = new_role where id = target;
  insert into public.activity_log (actor, action, detail, user_id)
  select coalesce(full_name, username), 'rol degisikligi', new_role, auth.uid()
  from public.profiles where id = auth.uid();
end $$;

create or replace function public.set_member_ban(target uuid, banned boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'yetkiniz yok';
  end if;
  update public.profiles set banned = set_member_ban.banned where id = target;
  insert into public.activity_log (actor, action, detail, user_id)
  select coalesce(full_name, username), case when set_member_ban.banned then 'uye askiya alindi' else 'uye geri acildi' end, '', auth.uid()
  from public.profiles where id = auth.uid();
end $$;

-- ------------------------------------------------------------
-- 10) RLS
-- ------------------------------------------------------------
alter table public.profiles       enable row level security;
alter table public.projects       enable row level security;
alter table public.files          enable row level security;
alter table public.comments       enable row level security;
alter table public.activity_log   enable row level security;
alter table public.sessions_log   enable row level security;
alter table public.site_settings  enable row level security;

-- profiles
drop policy if exists "profiles_public_read"  on public.profiles;
drop policy if exists "profiles_self_update"  on public.profiles;
drop policy if exists "profiles_staff_all"    on public.profiles;
create policy "profiles_public_read" on public.profiles for select using (true);
create policy "profiles_self_update" on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);
create policy "profiles_staff_all"   on public.profiles for all using (public.is_admin()) with check (public.is_admin());

-- projects
drop policy if exists "projects_read"   on public.projects;
drop policy if exists "projects_staff"  on public.projects;
create policy "projects_read"  on public.projects for select using (true);
create policy "projects_staff" on public.projects for all using (public.is_staff()) with check (public.is_staff());

-- files
drop policy if exists "files_read"  on public.files;
drop policy if exists "files_staff" on public.files;
create policy "files_read"  on public.files for select using (true);
create policy "files_staff" on public.files for all using (public.is_staff()) with check (public.is_staff());

-- comments
drop policy if exists "comments_read"   on public.comments;
drop policy if exists "comments_insert" on public.comments;
drop policy if exists "comments_staff"  on public.comments;
create policy "comments_read"   on public.comments for select using (true);
create policy "comments_insert" on public.comments for insert with check (public.is_member());
create policy "comments_staff"  on public.comments for all using (public.is_staff()) with check (public.is_staff());

-- activity_log
drop policy if exists "activity_staff_read" on public.activity_log;
drop policy if exists "activity_insert"     on public.activity_log;
create policy "activity_staff_read" on public.activity_log for select using (public.is_staff());
create policy "activity_insert"     on public.activity_log for insert with check (auth.uid() is not null);

-- sessions_log
drop policy if exists "sessions_staff_read" on public.sessions_log;
drop policy if exists "sessions_self"       on public.sessions_log;
create policy "sessions_staff_read" on public.sessions_log for select using (public.is_staff());
create policy "sessions_self"       on public.sessions_log for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- site_settings
drop policy if exists "settings_read"  on public.site_settings;
drop policy if exists "settings_admin" on public.site_settings;
create policy "settings_read"  on public.site_settings for select using (true);
create policy "settings_admin" on public.site_settings for all using (public.is_admin()) with check (public.is_admin());

-- ------------------------------------------------------------
-- 11) STORAGE BUCKET
-- ------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('proje-dosyalari', 'proje-dosyalari', true)
on conflict (id) do nothing;

drop policy if exists "storage_read"  on storage.objects;
drop policy if exists "storage_write" on storage.objects;
create policy "storage_read"  on storage.objects for select using (bucket_id = 'proje-dosyalari');
create policy "storage_write" on storage.objects for all using (bucket_id = 'proje-dosyalari' and public.is_staff()) with check (bucket_id = 'proje-dosyalari' and public.is_staff());

-- ------------------------------------------------------------
-- 12) MEVCUT ADMIN'İ KORU
-- ------------------------------------------------------------
update public.profiles set role = 'admin' where username = 'aloratr';

-- ============================================================
-- BİTTİ
-- ============================================================
