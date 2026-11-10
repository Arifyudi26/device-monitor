# Device Monitor

Aplikasi React Native (Expo) untuk tracking aktivitas device secara realtime dan mengirim event ke backend API.

## Fitur yang sudah berjalan

- **Baterai** — level, state (charging/unplugged/full), low power mode
- **Network** — tipe koneksi, SSID WiFi, IP address, internet reachable
- **Lokasi GPS** — koordinat + link Google Maps, update tiap 5 menit atau 100m
- **App lifecycle** — app_open, app_background, app_foreground
- **Pengiriman realtime** — setiap event langsung kirim ke backend via HTTP POST, retry otomatis tiap 30 detik kalau gagal

## Cara menjalankan

### Prasyarat

- Node.js v22+ ([nodejs.org](https://nodejs.org))
- Expo Go di HP Android ([Play Store](https://play.google.com/store/apps/details?id=host.exp.exponent))
- HP dan laptop terhubung ke WiFi yang sama

### Setup

```bash
# Install dependencies
npm install

# Isi API URL di file .env
# EXPO_PUBLIC_API_URL=https://your-backend.com

# Jalankan
npx expo start
```

Scan QR code yang muncul di terminal menggunakan kamera HP → app langsung jalan di Expo Go.

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

## Fitur lanjutan: Track App Usage (App apa yang dibuka user)

> Fitur ini **tidak bisa berjalan di Expo Go**. Butuh build APK sendiri dan HP fisik.

### Kenapa tidak bisa di Expo Go?

Android punya sistem sandbox — setiap app berjalan terisolasi, tidak bisa melihat aktivitas app lain. Untuk mengakses data usage app, dibutuhkan:

1. API `UsageStatsManager` (Android native)
2. Permission khusus `PACKAGE_USAGE_STATS`
3. Native module Kotlin/Java custom
4. Build APK sendiri (bukan lewat Expo Go)

### Alur lengkap implementasi

---

#### Step 1 — Install Android Studio

Download dan install dari [developer.android.com/studio](https://developer.android.com/studio).

Android Studio otomatis menginstall:
- Android SDK
- ADB (Android Debug Bridge)
- Build tools

---

#### Step 2 — Set environment variable ADB

Buka terminal sebagai **Administrator**, jalankan:

```bash
setx ANDROID_HOME "%LOCALAPPDATA%\Android\Sdk"
setx PATH "%PATH%;%LOCALAPPDATA%\Android\Sdk\platform-tools"
```

Restart terminal, verifikasi:

```bash
adb version
```

---

#### Step 3 — Enable USB Debugging di HP

1. **Settings → About Phone** → ketuk **Build Number** sebanyak 7x → muncul notif "Developer options enabled"
2. **Settings → Developer Options** → aktifkan **USB Debugging**

---

#### Step 4 — Connect HP ke laptop via kabel USB

```bash
adb devices
```

Harus muncul device ID. Kalau muncul `unauthorized`, ada popup di HP → tap **Allow**.

---

#### Step 5 — Generate native folders via Expo prebuild

```bash
npx expo prebuild
```

Ini membuat folder `/android` dan `/ios` yang berisi native project. Jangan edit manual — semua konfigurasi tetap lewat `app.json` dan config plugins.

---

#### Step 6 — Tambah permission di app.json

```json
{
  "expo": {
    "android": {
      "permissions": [
        "android.permission.PACKAGE_USAGE_STATS"
      ]
    }
  }
}
```

> Permission ini tidak muncul sebagai dialog biasa — user harus approve manual di **Settings → Special App Access → Usage Access → [nama app] → Allow**.

---

#### Step 7 — Buat native module Kotlin

Buat file `android/app/src/main/java/com/devicemonitor/UsageStatsModule.kt`:

```kotlin
package com.devicemonitor

import android.app.usage.UsageStatsManager
import android.content.Context
import android.content.Intent
import android.provider.Settings
import com.facebook.react.bridge.*
import java.util.concurrent.TimeUnit

class UsageStatsModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName() = "UsageStats"

    // Cek apakah permission sudah diberikan
    @ReactMethod
    fun hasPermission(promise: Promise) {
        val usm = reactApplicationContext
            .getSystemService(Context.USAGE_STATS_SERVICE) as UsageStatsManager
        val now = System.currentTimeMillis()
        val stats = usm.queryUsageStats(
            UsageStatsManager.INTERVAL_DAILY, now - 1000, now
        )
        promise.resolve(stats != null && stats.isNotEmpty())
    }

    // Buka halaman Settings untuk minta permission
    @ReactMethod
    fun requestPermission() {
        val intent = Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS)
        intent.flags = Intent.FLAG_ACTIVITY_NEW_TASK
        reactApplicationContext.startActivity(intent)
    }

    // Ambil app usage dalam rentang waktu (ms)
    @ReactMethod
    fun getUsageStats(startTime: Double, endTime: Double, promise: Promise) {
        try {
            val usm = reactApplicationContext
                .getSystemService(Context.USAGE_STATS_SERVICE) as UsageStatsManager
            val stats = usm.queryUsageStats(
                UsageStatsManager.INTERVAL_BEST,
                startTime.toLong(),
                endTime.toLong()
            )

            val result = WritableNativeArray()
            stats?.forEach { stat ->
                if (stat.totalTimeInForeground > 0) {
                    val map = WritableNativeMap()
                    map.putString("packageName", stat.packageName)
                    map.putDouble("totalTimeMs", stat.totalTimeInForeground.toDouble())
                    map.putDouble("lastTimeUsed", stat.lastTimeUsed.toDouble())
                    result.pushMap(map)
                }
            }
            promise.resolve(result)
        } catch (e: Exception) {
            promise.reject("ERR_USAGE_STATS", e.message)
        }
    }
}
```

---

#### Step 8 — Daftarkan module ke React Native

Buat file `android/app/src/main/java/com/devicemonitor/UsageStatsPackage.kt`:

```kotlin
package com.devicemonitor

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

class UsageStatsPackage : ReactPackage {
    override fun createNativeModules(ctx: ReactApplicationContext) =
        listOf(UsageStatsModule(ctx))

    override fun createViewManagers(ctx: ReactApplicationContext) =
        emptyList<ViewManager<*, *>>()
}
```

Tambahkan package di `android/app/src/main/java/com/devicemonitor/MainApplication.kt`:

```kotlin
override fun getPackages() = PackageList(this).packages.apply {
    add(UsageStatsPackage())  // tambah baris ini
}
```

---

#### Step 9 — Panggil dari JavaScript/TypeScript

Buat file `src/lib/usage-stats.ts`:

```typescript
import { NativeModules, Platform } from 'react-native';

const { UsageStats } = NativeModules;

export async function hasUsagePermission(): Promise<boolean> {
  if (Platform.OS !== 'android') return false;
  return UsageStats.hasPermission();
}

export async function requestUsagePermission(): Promise<void> {
  if (Platform.OS !== 'android') return;
  UsageStats.requestPermission();
}

export async function getAppUsage(sinceMs = 60 * 60 * 1000) {
  if (Platform.OS !== 'android') return [];
  const now = Date.now();
  return UsageStats.getUsageStats(now - sinceMs, now);
}
```

---

#### Step 10 — Build dan install APK ke HP

```bash
# Build debug APK langsung ke HP yang terhubung via USB
npx expo run:android

# Atau build APK file via EAS (cloud build, tidak butuh Android Studio penuh)
npx eas-cli@latest build --platform android --profile development
```

---

### Catatan penting

- Permission `PACKAGE_USAGE_STATS` **tidak muncul sebagai dialog** — user harus buka **Settings → Special App Access → Usage Access** dan aktifkan manual.
- Data yang tersedia: nama package app (misal `com.whatsapp`), total waktu di foreground, waktu terakhir digunakan.
- **Nama app yang tampil** (misal "WhatsApp") bisa di-resolve dari package name menggunakan `PackageManager` di sisi Android.
- Fitur ini **hanya untuk Android**. iOS tidak mengizinkan akses usage stats app lain sama sekali.
