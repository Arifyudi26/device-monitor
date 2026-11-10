/**
 * use-device-monitor.ts
 * Hook utama yang memantau semua aktivitas device:
 * - Baterai (level + state) — native only
 * - Network (type + koneksi + SSID WiFi)
 * - Lokasi (koordinat GPS)
 * - App lifecycle (foreground/background)
 * - Info device
 */

import NetInfo, { NetInfoState } from '@react-native-community/netinfo';
import * as Battery from 'expo-battery';
import * as Device from 'expo-device';
import * as Location from 'expo-location';
import * as Network from 'expo-network';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, AppStateStatus, Platform } from 'react-native';

import { trackEvent } from '@/lib/tracker';

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
    ssid: string | null;    // nama WiFi, null kalau bukan WiFi atau tidak tersedia
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
  // expo-battery event listeners hanya tersedia di native (Android/iOS)

  const setupBatteryTracking = useCallback(() => {
    if (Platform.OS === 'web') return () => {};

    const levelSub = Battery.addBatteryLevelListener(async ({ batteryLevel }) => {
      setStatus((prev) => ({
        ...prev,
        battery: { ...prev.battery, level: batteryLevel },
        lastUpdated: new Date(),
      }));
      await trackEvent('battery_level', { level: batteryLevel });
    });

    const stateSub = Battery.addBatteryStateListener(async ({ batteryState }) => {
      setStatus((prev) => ({
        ...prev,
        battery: { ...prev.battery, state: batteryState },
        lastUpdated: new Date(),
      }));
      await trackEvent('battery_state', {
        state: batteryState,
        stateLabel: getBatteryStateLabel(batteryState),
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
      // Map NetInfo type ke expo-network NetworkStateType
      const typeMap: Record<string, Network.NetworkStateType> = {
        wifi: Network.NetworkStateType.WIFI,
        cellular: Network.NetworkStateType.CELLULAR,
        ethernet: Network.NetworkStateType.ETHERNET,
        bluetooth: Network.NetworkStateType.BLUETOOTH,
        vpn: Network.NetworkStateType.VPN,
        none: Network.NetworkStateType.NONE,
      };
      const mappedType = typeMap[state.type] ?? Network.NetworkStateType.UNKNOWN;

      // SSID hanya tersedia saat tipe wifi, dan butuh location permission di Android
      const ssid =
        state.type === 'wifi' && state.details
          ? (state.details as { ssid?: string | null }).ssid ?? null
          : null;

      // IP address
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
    // Cek status izin saat ini dulu sebelum minta
    const { status: existing } = await Location.getForegroundPermissionsAsync();

    // Kalau sudah ditolak permanen, arahkan ke Settings HP
    if (existing === 'denied') {
      await Location.requestForegroundPermissionsAsync(); // Android: bisa minta lagi
    }

    // Minta izin — dialog muncul otomatis kalau belum pernah diminta
    const { status: permStatus, canAskAgain } =
      await Location.requestForegroundPermissionsAsync();

    if (permStatus !== 'granted') {
      setStatus((prev) => ({
        ...prev,
        location: { ...prev.location, permissionGranted: false },
      }));

      // Kalau tidak bisa minta lagi (ditolak permanen), buka Settings HP
      if (!canAskAgain) {
        await Location.enableNetworkProviderAsync().catch(() => null);
      }

      return () => {};
    }

    setStatus((prev) => ({
      ...prev,
      location: { ...prev.location, permissionGranted: true },
    }));

    // Pastikan GPS provider aktif (Android) — muncul dialog "Nyalakan Lokasi?"
    if (Platform.OS === 'android') {
      await Location.enableNetworkProviderAsync().catch(() => null);
    }

    // Ambil posisi awal
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

    // Subscribe perubahan lokasi (tiap 5 menit atau 100m)
    locationSub.current = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.Balanced,
        distanceInterval: 100,   // meter
        timeInterval: 300_000,   // 5 menit dalam ms
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

  const setupLifecycleTracking = useCallback(() => {
    const sub = AppState.addEventListener('change', async (nextState: AppStateStatus) => {
      if (appState.current === 'active' && nextState === 'background') {
        await trackEvent('app_background', { previousState: appState.current });
      } else if (appState.current === 'background' && nextState === 'active') {
        await trackEvent('app_foreground', { previousState: appState.current });
      }
      appState.current = nextState;
    });

    return () => sub.remove();
  }, []);

  // ─── Initial Load ──────────────────────────────────────────────────────────

  const loadInitialStatus = useCallback(async () => {
    // Battery APIs hanya tersedia di native
    const batteryData =
      Platform.OS !== 'web'
        ? await Promise.all([
            Battery.getBatteryLevelAsync(),
            Battery.getBatteryStateAsync(),
            Battery.isLowPowerModeEnabledAsync(),
          ])
        : ([-1, Battery.BatteryState.UNKNOWN, false] as const);

    // Ambil network state lengkap (termasuk SSID) via NetInfo
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

    setStatus((prev) => ({
      ...prev,
      battery: {
        level: batteryData[0] as number,
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

    return () => {
      cleanupBattery();
      cleanupNetwork();
      cleanupLifecycle();
      cleanupLocation();
    };
  }, [
    loadInitialStatus,
    setupBatteryTracking,
    setupNetworkTracking,
    setupLifecycleTracking,
    setupLocationTracking,
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
