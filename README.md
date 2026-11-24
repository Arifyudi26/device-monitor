# Device Monitor

Aplikasi React Native (Expo) untuk tracking aktivitas device secara realtime dan mengirim event ke backend API.

## Fitur yang sudah berjalan

- **Baterai** — level, state (charging/unplugged/full), low power mode
- **Network** — tipe koneksi, SSID WiFi, IP address, internet reachable
- **Lokasi GPS** — koordinat + link Google Maps, update tiap 5 menit atau 100m
- **App lifecycle** — app_open, app_background, app_foreground
- **Pengiriman realtime** — setiap event langsung kirim ke backend via HTTP POST, retry otomatis tiap 30 detik kalau gagal

## Cara menjalankan

> **Catatan**: proyek ini sudah punya native module kustom (`modules/contact-accounts/`) dan package native (`expo-background-task`, `expo-dev-client`, dll). Akibatnya app **tidak bisa dijalankan di Expo Go** — wajib pakai development build. Lihat [Cara build ulang APK setiap ada perubahan/update](#cara-build-ulang-apk-setiap-ada-perubahanupdate) di bawah untuk build pertama kali.

### Prasyarat

- Node.js v22+ ([nodejs.org](https://nodejs.org))
- HP Android fisik dengan development build proyek ini sudah terpasang (lihat section build di bawah)
- HP dan laptop terhubung ke WiFi yang sama

### Setup

```bash
# Install dependencies
npm install

# Isi API URL di file .env
# EXPO_PUBLIC_API_URL=https://your-backend.com

# Jalankan Metro dev server
npx expo start --clear
```

Buka app dari development build yang sudah terpasang di HP (bukan Expo Go) — app otomatis connect ke Metro dan reload saat ada perubahan kode JS/TS.

## Format event yang dikirim ke backend

Semua event dikirim via `POST {EXPO_PUBLIC_API_URL}/api/events` dengan body:

```json
{
  "events": [
    {
      "id": "1234567890-abc123",
      "type": "location_update",
      "timestamp": "2026-11-09T10:00:00.000Z",
      "deviceId": "device-xxx",
      "sent": false,
      "data": {
        "latitude": -6.123456,
        "longitude": 106.123456,
        "accuracy": 15,
        "mapsUrl": "https://www.google.com/maps?q=-6.123456,106.123456"
      }
    }
  ]
}
```

Tipe event: `app_open`, `app_close`, `app_background`, `app_foreground`, `battery_level`, `battery_state`, `network_change`, `location_update`, `custom`

---

## Cara build ulang APK setiap ada perubahan/update

Panduan ini berlaku untuk **development build** (bukan Expo Go) — dipakai begitu proyek punya native module kustom (seperti `modules/contact-accounts/`) atau package yang butuh native code (`expo-background-task`, dll).

### Langkah 0 — Kenali jenis perubahan yang kamu buat

Tidak semua perubahan butuh build ulang APK. Cek dulu termasuk kategori mana:

| Jenis perubahan | Contoh | Perlu build ulang APK? |
|---|---|---|
| Kode JS/TS biasa | ubah `src/app/index.tsx`, `src/hooks/*.ts`, logic apa pun yang bukan native | **Tidak** — cukup reload Metro (`r` di terminal `expo start`, atau shake HP → Reload) |
| Native module baru/berubah | tambah/edit file `.kt`/`.java` di `modules/*/android/`, ubah `expo-module.config.json` | **Ya** — wajib build ulang |
| Tambah package via `npx expo install` yang punya native code | `expo-battery`, `expo-background-task`, library pihak ketiga dengan kode native | **Ya** — wajib build ulang |
| Ubah `app.json` (permission, plugin, config native) | tambah permission Android, tambah/ubah entry di `plugins` | **Ya** — wajib build ulang |
| Ubah `.env` (`EXPO_PUBLIC_API_URL`, dst) | ganti IP backend | **Ya** — variabel `EXPO_PUBLIC_*` di-bake saat build, reload JS saja tidak cukup |

Kalau ragu, aman untuk selalu build ulang — cuma makan waktu lebih lama, tidak merusak apa pun.

### Jalur A — Build lokal (`npx expo run:android`)

Pakai ini kalau laptop sudah siap Android Studio + JDK + ADB, dan HP terhubung USB.

```bash
# 1. Pastikan device terdeteksi
adb devices

# 2. Build & install langsung ke HP yang terhubung
npx expo run:android
```

Ini otomatis: generate ulang folder `android/` kalau perlu (CNG), compile native code, install APK ke HP, dan start Metro.

**Kalau sebelumnya pernah `prebuild` manual dan sekarang nambah/ubah native module**, jalankan prebuild dulu sebelum run supaya autolinking mendeteksi module baru:

```bash
npx expo prebuild --platform android --clean
npx expo run:android
```

**Known issue di Windows**: build native (CMake/Ninja) bisa gagal dengan error `Filename longer than 260 characters` atau `ninja: error: mkdir(...)`. Ini karena path proyek + path source C++ gabungan melebihi batas 260 karakter Windows (`MAX_PATH`). Solusi (lihat [docs.expo.dev/troubleshooting/windows-long-paths](https://docs.expo.dev/troubleshooting/windows-long-paths)):

1. Aktifkan Windows long path (PowerShell **as Administrator**, lalu **restart komputer**):
   ```powershell
   New-ItemProperty -Path "HKLM:\SYSTEM\CurrentControlSet\Control\FileSystem" -Name "LongPathsEnabled" -Value 1 -PropertyType DWORD -Force
   ```
2. Install CMake versi baru (bawa Ninja yang support long path) lewat Android Studio → **Settings → Languages & Frameworks → Android SDK → SDK Tools** → centang "Show Package Details" → install **CMake 3.31.6** (atau versi terbaru).
3. Set versi CMake itu di `%USERPROFILE%\.gradle\gradle.properties`:
   ```properties
   android.cmakeVersion=3.31.6
   ```
4. Hapus cache build lama lalu build ulang:
   ```bash
   rm -rf android/app/.cxx android/app/build android/build
   npx expo run:android
   ```

Kalau masih bermasalah atau Android Studio/JDK belum terpasang, pakai Jalur B di bawah — tidak kena limitasi Windows ini karena compile dilakukan di server Linux.

### Jalur B — Build cloud (EAS Build), hasil APK untuk dikirim manual

Pakai ini kalau tidak mau install Android Studio, laptop bermasalah, atau mau kirim file APK langsung ke HP tanpa kabel USB/ADB.

```bash
# Sekali saja — install CLI dan login (skip kalau sudah pernah)
npx eas-cli login

# Sekali saja per proyek — hubungkan ke project EAS (skip kalau eas.json & project ID sudah ada)
npx eas-cli init --account <nama-akun-expo-kamu>

# Build APK (profile "development" = development client, bisa reload JS tanpa build ulang untuk perubahan JS)
npx eas-cli build --profile development --platform android
```

Tunggu sampai selesai (biasanya 10–20 menit, lebih lama saat antrian ramai). Progress bisa dipantau lewat link yang muncul di terminal, formatnya:
```
https://expo.dev/accounts/<akun>/projects/device-monitor/builds/<build-id>
```

Setelah selesai, CLI menampilkan link download APK, atau buka halaman build di atas dan klik **Download**. Kirim file `.apk` itu ke HP (WhatsApp ke diri sendiri, Google Drive, kabel data biasa, dll), lalu install manual:

1. Buka file `.apk` di HP.
2. Kalau muncul peringatan "Install blocked" / "Unknown apps", buka **Settings** dan izinkan install dari sumber itu (Chrome/Files, sesuai dari mana file dibuka).
3. Tap **Install**.

> Profile `development` di `eas.json` sudah diset `"buildType": "apk"` (bukan `.aab`), supaya hasilnya file APK yang bisa diinstall manual langsung, bukan format yang cuma bisa lewat Play Store.

### Setelah APK terpasang — update berikutnya

- **Perubahan JS/TS saja**: jalankan `npx expo start`, buka app dari development build yang sudah terpasang di HP (bukan install ulang), app otomatis connect ke Metro dan reload.
- **Perubahan native/package baru/app.json**: ulangi Jalur A atau Jalur B dari awal untuk generate APK baru, install ulang (menimpa yang lama, data app tidak hilang selama `versionCode`/signing key sama).

---

## Fitur lanjutan: Sumber Akun Kontak (Google / SIM / WhatsApp / dll)

> Fitur ini **tidak bisa berjalan di Expo Go**. Butuh development build dan HP fisik.

### Kenapa tidak bisa di Expo Go?

`expo-contacts` tidak mengekspos akun sumber kontak di Android — fitur `Container` (yang merepresentasikan akun seperti Google/iCloud/Exchange) hanya tersedia di **iOS**. Kolom `ACCOUNT_TYPE` dan `ACCOUNT_NAME` ada di level `ContentProvider` Android (`ContactsContract.RawContacts`), jadi harus diambil lewat native module kustom. Native module baru tidak bisa dijalankan di Expo Go karena APK Expo Go sudah fix berisi native module tertentu dan tidak bisa disisipi kode native tambahan — harus development build (APK sendiri).

Modul ini sudah dibuat di `modules/contact-accounts/` (local Expo module, Android-only) dan dipanggil otomatis saat command `fetch_contacts` dijalankan (lihat `handleFetchContacts` di `src/hooks/use-device-monitor.ts`).

### Langkah testing

#### 1. Generate project Android (Continuous Native Generation)

```bash
npx expo prebuild --platform android --clean
```

Ini membuat folder `android/` dan otomatis mendeteksi local module di `modules/contact-accounts` lewat Expo autolinking — tidak perlu konfigurasi tambahan.

#### 2. Build & install ke HP

Pastikan HP terhubung lewat USB dengan USB Debugging aktif (lihat [Cara build ulang APK](#cara-build-ulang-apk-setiap-ada-perubahanupdate) di atas kalau belum pernah setup ADB/Android Studio), cek dengan:

```bash
adb devices
```

Lalu build & install:

```bash
npx expo run:android
```

Ini compile APK development build dan install langsung ke HP yang terhubung, serta otomatis start Metro.

Alternatif tanpa Android Studio di laptop (cloud build, lihat [Jalur B](#jalur-b--build-cloud-eas-build-hasil-apk-untuk-dikirim-manual) di atas untuk detail lengkap):

```bash
npx eas-cli build --profile development --platform android
```

lalu download & install APK hasilnya manual ke HP.

#### 3. Jalankan & tes

1. Buka app di HP lewat ikon development build (bukan Expo Go).
2. Pastikan `.env` (`EXPO_PUBLIC_API_URL`) menunjuk IP laptop yang benar dan HP + laptop ada di WiFi yang sama.
3. Dari dashboard web (`device-monitor-web`), buka halaman **Contacts** lalu klik **Sync Kontak**.
4. Tunggu status command jadi `executed` (polling tiap 5 detik di HP).
5. Lihat daftar kontak di web — tiap kontak sekarang menampilkan baris kecil `🏷 Google` / `🏷 SIM Card` / `🏷 WhatsApp` / dll di bawah nomor telepon, sesuai akun sumber aslinya di Android.

### Catatan penting

- Setelah development build terpasang, app **tidak bisa lagi dibuka lewat Expo Go** untuk proyek ini — konsekuensi permanen begitu ada native module kustom. Reload JS biasa (`r` di Metro) tetap berfungsi untuk perubahan kode TypeScript; perubahan kode Kotlin butuh `npx expo run:android` ulang.
- Modul mengembalikan label mentah (`com.xiaomi.account`, dst) sebagai fallback kalau belum ada mapping di `labelForAccountType` (`modules/contact-accounts/android/.../ContactAccountsModule.kt`). Tambahkan mapping baru di sana kalau ketemu account type lain yang perlu label lebih jelas.
- Kalau native module belum terpasang (misal masih testing di Expo Go tanpa sengaja) atau platform bukan Android, `getAccountsForContacts` gagal diam-diam dan `sources` akan kosong — sync kontak tetap jalan normal, cuma tanpa info sumber akun.
- Satu kontak gabungan (yang dilihat lewat `expo-contacts`) bisa berasal dari lebih dari satu `RawContact` (misal tersimpan di Google **dan** SIM sekaligus lalu digabung Android Contacts Provider) — dalam kasus itu field `sources` akan berisi lebih dari satu label.