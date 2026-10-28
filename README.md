\## 🚀 Setup 5 Menit



\### 1. Buat Project Supabase

\- Buka https://supabase.com → New Project

\- Nama: `parfumku-pos`

\- Region: Singapore (terdekat)

\- Tunggu \~2 menit sampai selesai



\### 2. RUN Schema SQL

\- Supabase Dashboard → \*\*SQL Editor\*\* → \*\*New Query\*\*

\- Copy seluruh isi `schema.sql` → Paste → \*\*RUN\*\*

\- Harus muncul: \*\*Success. No rows returned\*\*

\- Kalau ada error, kirim screenshot ke developer



\### 3. Buat User Owner

\- \*\*Authentication\*\* → \*\*Users\*\* → \*\*Add User\*\* → \*\*Create User\*\*

\- Email: `admin@gmail.com`

\- Password: `111111` (atau ubah policy dulu kalau mau `1111`)

\- \*\*Auto Confirm User:\*\* ✅ ON

\- Klik \*\*Create User\*\*

\- User ini otomatis jadi \*\*OWNER\*\* karena trigger



\### 4. Verifikasi Owner

\- \*\*SQL Editor\*\* → query:

```sql

select username, nama, role from profiles;


