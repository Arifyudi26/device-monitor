/**
 * settings.tsx — Settings Screen
 * Checklist permission HP + info device.
 */

import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import * as Device from 'expo-device';
import * as Location from 'expo-location';
import * as Network from 'expo-network';
import { useCallback, useEffect, useState } from 'react';
import { Linking, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, Spacing } from '@/constants/theme';
import { getDeviceId } from '@/lib/tracker';

type PermStatus = 'granted' | 'denied' | 'unknown';

interface PermItem {
  key: string;
  label: string;
  desc: string;
  status: PermStatus;
  onRequest: () => Promise<void>;
}

export default function SettingsScreen() {
  const [deviceId, setDeviceId] = useState('');
  const [locationStatus, setLocationStatus] = useState<PermStatus>('unknown');
  const [networkOk, setNetworkOk] = useState<PermStatus>('unknown');

  const checkPermissions = useCallback(async () => {
    // Lokasi
    const { status } = await Location.getForegroundPermissionsAsync();
    setLocationStatus(status === 'granted' ? 'granted' : 'denied');

    // Network — cek apakah bisa ambil state
    try {
      const net = await Network.getNetworkStateAsync();
      setNetworkOk(net.type !== undefined ? 'granted' : 'denied');
    } catch {
      setNetworkOk('denied');
    }
  }, []);

  const loadData = useCallback(() => {
    const check = () => {
      const id = getDeviceId();
      if (id) setDeviceId(id);
      else setTimeout(check, 200);
    };
    check();
  }, []);

  useEffect(() => {
    loadData();
    checkPermissions();
  }, [loadData, checkPermissions]);

  const permissions: PermItem[] = [
    {
      key: 'location',
      label: 'Location (GPS)',
      desc: 'Required for GPS coordinate tracking and WiFi SSID detection.',
      status: locationStatus,
      onRequest: async () => {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          await Linking.openSettings();
        }
        await checkPermissions();
      },
    },
    {
      key: 'network',
      label: 'Network Access',
      desc: 'Required for WiFi detection, connection type, and sending events to backend.',
      status: networkOk,
      onRequest: async () => {
        await Linking.openSettings();
        await checkPermissions();
      },
    },
    {
      key: 'battery',
      label: 'Battery Info',
      desc: 'No special permission needed — available by default on Android.',
      status: 'granted',
      onRequest: async () => {},
    },
  ];

  const allGranted = permissions.every((p) => p.status === 'granted');

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <ThemedText type="subtitle" style={styles.title}>Settings</ThemedText>

          {/* ── Status Keseluruhan ───────────────────────────────────── */}
          <ThemedView
            type="backgroundElement"
            style={[styles.statusBanner, { borderColor: allGranted ? '#34C75940' : '#FF950040' }]}
          >
            <MaterialIcons
              name={allGranted ? 'check-circle' : 'warning'}
              size={20}
              color={allGranted ? '#34C759' : '#FF9500'}
            />
            <ThemedText type="small" style={{ color: allGranted ? '#34C759' : '#FF9500' }}>
              {allGranted
                ? ' All permissions granted — app is ready'
                : ' Some permissions are not yet enabled'}
            </ThemedText>
          </ThemedView>

          {/* ── Permission Checklist ─────────────────────────────────── */}
          <View style={styles.sectionHeader}>
            <MaterialIcons name="security" size={16} color="#208AEF" />
            <ThemedText type="smallBold"> Required Permissions</ThemedText>
          </View>

          <ThemedView type="backgroundElement" style={styles.card}>
            {permissions.map((perm, i) => (
              <View
                key={perm.key}
                style={[styles.permRow, i < permissions.length - 1 && styles.permBorder]}
              >
                <View style={styles.permLeft}>
                  <MaterialIcons
                    name={perm.status === 'granted' ? 'check-circle' : 'cancel'}
                    size={18}
                    color={perm.status === 'granted' ? '#34C759' : '#FF3B30'}
                  />
                  <View style={styles.permInfo}>
                    <ThemedText type="smallBold">{perm.label}</ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">
                      {perm.desc}
                    </ThemedText>
                  </View>
                </View>

                {perm.status !== 'granted' && (
                  <Pressable
                    style={({ pressed }) => [styles.fixBtn, pressed && styles.pressed]}
                    onPress={perm.onRequest}
                  >
                    <MaterialIcons name="settings" size={13} color="#fff" />
                    <ThemedText type="small" style={styles.fixBtnText}> Enable</ThemedText>
                  </Pressable>
                )}
              </View>
            ))}
          </ThemedView>

          <Pressable
            style={({ pressed }) => [styles.refreshBtn, pressed && styles.pressed]}
            onPress={checkPermissions}
          >
            <MaterialIcons name="refresh" size={15} color="#208AEF" />
            <ThemedText type="small" style={styles.refreshText}> Re-check permissions</ThemedText>
          </Pressable>

          {/* ── Info Device ──────────────────────────────────────────── */}
          <View style={[styles.sectionHeader, styles.sectionGap]}>
            <MaterialIcons name="smartphone" size={16} color="#208AEF" />
            <ThemedText type="smallBold"> Device Info</ThemedText>
          </View>

          <ThemedView type="backgroundElement" style={styles.card}>
            <Row label="Device ID" value={deviceId || '—'} mono />
            <Row label="Nama"  value={Device.deviceName ?? 'N/A'} />
            <Row label="Brand" value={Device.brand ?? 'N/A'} />
            <Row label="Model" value={Device.modelName ?? 'N/A'} />
            <Row label="OS"    value={`${Platform.OS} ${Device.osVersion ?? ''}`} />
            <Row label="Type"  value={Device.isDevice ? 'Physical Device' : 'Emulator/Simulator'} />
          </ThemedView>

        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

function Row({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <View style={styles.row}>
      <ThemedText type="small" themeColor="textSecondary" style={styles.label}>{label}</ThemedText>
      <ThemedText type={mono ? 'code' : 'small'} style={styles.value}>{value}</ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1 },
  scrollContent: {
    padding: Spacing.three,
    paddingBottom: BottomTabInset + Spacing.four,
    gap: Spacing.two,
  },
  title: { marginTop: Spacing.two, marginBottom: Spacing.one },
  statusBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.three,
    borderRadius: Spacing.two,
    borderWidth: 1,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: Spacing.one,
  },
  sectionGap: { marginTop: Spacing.four },
  card: { padding: Spacing.three, borderRadius: Spacing.two, gap: Spacing.two },
  permRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: Spacing.two,
    paddingVertical: Spacing.one,
  },
  permBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#60646C40',
    paddingBottom: Spacing.two,
  },
  permLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.two,
  },
  permInfo: { flex: 1, gap: 2 },
  fixBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#208AEF',
    paddingVertical: 4,
    paddingHorizontal: Spacing.two,
    borderRadius: Spacing.one,
  },
  fixBtnText: { color: '#fff', fontSize: 12 },
  refreshBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.one,
  },
  refreshText: { color: '#208AEF' },
  pressed: { opacity: 0.7 },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.two },
  label: { width: 80, flexShrink: 0 },
  value: { flex: 1, flexWrap: 'wrap', fontSize: 13 },
});
