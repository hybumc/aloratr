# ALORA — Proje Kütüphanesi

Yetkililerin proje yüklediği, herkesin görüntüleyip indirdiği proje platformu.
Sunucu yok: site doğrudan Supabase ile konuşur, GitHub Pages üzerinde 7/24 yayındadır.

## Nasıl çalışır

```
Tarayıcı (index.html)
      │
      ▼
Cloudflare Worker  ← secret key burada (tarayıcıya hiç inmez)
      │
      ▼
Supabase (Postgres + Auth + Storage)
```

- `index.html` — tek dosya: HTML + CSS + JS. İçinde sadece bir paylaşım anahtarı var.
- Secret key ve Supabase URL'si Cloudflare'de `wrangler secret` ile şifreli tutulur.
- Veritabanı şeması: `supabase/schema.sql` (Supabase → SQL Editor → Run).

## Yetkili girişi

Kullanıcı adı **veya** e-posta ile giriş yapılır (kullanıcı adı otomatik
`<kullanıcıadı>@alora.app` adresine çevrilir).

Yeni yetkili eklemek: Supabase → **Authentication → Users → Add user**.
Profil kaydı (`profiles`) otomatik oluşur; her profili olan kişi proje ekleyebilir.

## Proje dosyaları

Dosyalar Supabase Storage'daki `proje-dosyalari` kovasında, proje kimliğine göre
klasörlenmiş olarak durur:

```
proje-dosyalari/
  1/
    1732620000000-uygulama.exe
  2/
    1732620000000-uygulama.apk
```

Herkes okur, sadece giriş yapmış yetkili yükler/siler (Storage RLS politikaları).

## Güvenlik

- Row Level Security açık: okuma herkese, yazma/silme sadece yetkililere.
- Secret key hiçbir zaman depoya veya tarayıcıya girmez.
- Anahtar sızarsa Supabase → Settings → API Keys → **rotate**.
