import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ExternalLink } from '@/components/external-link';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, Spacing } from '@/constants/theme';
import {
  getBatteryStateLabel,
  getNetworkTypeLabel,
  useDeviceMonitor,
} from '@/hooks/use-device-monitor';
import { useTheme } from '@/hooks/use-theme';
import { getDeviceId } from '@/lib/tracker';

function CardHeader({ icon, label }: { icon: React.ComponentProps<typeof MaterialIcons>['name']; label: string }) {
  const theme = useTheme();
  return (
    <View style={cardHeaderStyles.row}>
      <MaterialIcons name={icon} size={18} color={theme.textSecondary} />
      <ThemedText type="smallBold">{label}</ThemedText>
    </View>
  );
}

const cardHeaderStyles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
});

export default function DashboardScreen() {
  const { status, isTracking, refreshStatus } = useDeviceMonitor();
  const theme = useTheme();
  const [refreshing, setRefreshing] = useState(false);
  const [deviceId, setDeviceId] = useState('');

  useEffect(() => {
    const check = () => {
      const id = getDeviceId();
      if (id) setDeviceId(id);
      else setTimeout(check, 200);
    };
    check();
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await refreshStatus();
    setRefreshing(false);
  };

  const batteryPercent =
    status.battery.level >= 0
      ? `${Math.round(status.battery.level * 100)}%`
      : 'N/A';

  const batteryColor =
    status.battery.level < 0.2
      ? '#FF3B30'
      : status.battery.level < 0.5
        ? '#FF9500'
        : '#34C759';

  // Icon baterai sesuai level
  const batteryIcon: React.ComponentProps<typeof MaterialIcons>['name'] =
    status.battery.level < 0.2
      ? 'battery-alert'
      : status.battery.level < 0.5
        ? 'battery-3-bar'
        : 'battery-full';

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView
          style={styles.scroll}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          contentContainerStyle={styles.scrollContent}
        >
          {/* ── Header ─────────────────────────────────────────────────── */}
          <View style={styles.header}>
            <ThemedText type="subtitle">Device Monitor</ThemedText>
            <View style={[styles.dot, { backgroundColor: isTracking ? '#34C759' : '#FF3B30' }]} />
          </View>

          <ThemedText type="small" themeColor="textSecondary">
            ID: {deviceId || '—'}
          </ThemedText>

          {/* ── Baterai ────────────────────────────────────────────────── */}
          <ThemedView type="backgroundElement" style={styles.card}>
            <CardHeader icon={batteryIcon} label="Baterai" />
            <View style={styles.row}>
              <ThemedText type="title" style={[styles.bigValue, { color: batteryColor }]}>
                {batteryPercent}
              </ThemedText>
              <View style={{ gap: 2 }}>
                <ThemedText type="small" themeColor="textSecondary">
                  {getBatteryStateLabel(status.battery.state)}
                </ThemedText>
                {status.battery.lowPowerMode && (
                  <View style={styles.infoRow}>
                    <MaterialIcons name="bolt" size={14} color="#FF9500" />
                    <ThemedText type="small" style={styles.warnText}> Low Power Mode</ThemedText>
                  </View>
                )}
              </View>
            </View>
            {status.battery.level >= 0 && (
              <View style={styles.batteryBar}>
                <View
                  style={[
                    styles.batteryFill,
                    {
                      width: `${Math.round(status.battery.level * 100)}%` as unknown as number,
                      backgroundColor: batteryColor,
                    },
                  ]}
                />
              </View>
            )}
          </ThemedView>

          {/* ── Network ────────────────────────────────────────────────── */}
          <ThemedView type="backgroundElement" style={styles.card}>
            <CardHeader icon="wifi" label="Network" />
            <View
              style={[
                styles.badge,
                styles.badgeLeft,
                { backgroundColor: status.network.isConnected ? '#34C75920' : '#FF3B3020' },
              ]}
            >
              <ThemedText
                type="small"
                style={{ color: status.network.isConnected ? '#34C759' : '#FF3B30' }}
              >
                {status.network.isConnected ? 'Connected' : 'Disconnected'}
              </ThemedText>
            </View>
            <View style={styles.infoRow}>
              <ThemedText type="small" themeColor="textSecondary">Tipe: </ThemedText>
              <ThemedText type="small">{getNetworkTypeLabel(status.network.type)}</ThemedText>
            </View>
            {status.network.ssid && (
              <View style={styles.infoRow}>
                <ThemedText type="small" themeColor="textSecondary">WiFi: </ThemedText>
                <ThemedText type="small">{status.network.ssid}</ThemedText>
              </View>
            )}
            {status.network.ipAddress && (
              <View style={styles.infoRow}>
                <ThemedText type="small" themeColor="textSecondary">IP: </ThemedText>
                <ThemedText type="small">{status.network.ipAddress}</ThemedText>
              </View>
            )}
            <View style={styles.infoRow}>
              <MaterialIcons
                name={status.network.isInternetReachable ? 'check-circle' : 'cancel'}
                size={14}
                color={status.network.isInternetReachable ? '#34C759' : '#FF3B30'}
              />
              <ThemedText type="small" themeColor="textSecondary">
                {' '}Internet {status.network.isInternetReachable ? 'reachable' : 'not reachable'}
              </ThemedText>
            </View>
          </ThemedView>

          {/* ── Lokasi ─────────────────────────────────────────────────── */}
          <ThemedView type="backgroundElement" style={styles.card}>
            <CardHeader icon="location-on" label="Lokasi" />
            {!status.location.permissionGranted ? (
              <View style={styles.permissionBox}>
                <View style={styles.infoRow}>
                  <MaterialIcons name="location-off" size={14} color="#FF9500" />
                  <ThemedText type="small" themeColor="textSecondary">
                    {' '}Izin lokasi dibutuhkan untuk tracking GPS.
                  </ThemedText>
                </View>
                <Pressable
                  style={({ pressed }) => [styles.permBtn, pressed && styles.pressed]}
                  onPress={() => Linking.openSettings()}
                >
                  <View style={styles.infoRow}>
                    <MaterialIcons name="settings" size={14} color="#fff" />
                    <ThemedText type="smallBold" style={styles.permBtnText}>
                      {' '}Buka Settings untuk izinkan lokasi
                    </ThemedText>
                  </View>
                </Pressable>
              </View>
            ) : status.location.latitude === null ? (
              <View style={[styles.row, { marginTop: Spacing.one }]}>
                <ActivityIndicator size="small" />
                <ThemedText type="small" themeColor="textSecondary"> Mengambil lokasi...</ThemedText>
              </View>
            ) : (
              <>
                <View style={styles.infoRow}>
                  <ThemedText type="small" themeColor="textSecondary">Lat: </ThemedText>
                  <ThemedText type="small">{status.location.latitude.toFixed(6)}</ThemedText>
                </View>
                <View style={styles.infoRow}>
                  <ThemedText type="small" themeColor="textSecondary">Lon: </ThemedText>
                  <ThemedText type="small">{status.location.longitude?.toFixed(6)}</ThemedText>
                </View>
                <View style={styles.infoRow}>
                  <ThemedText type="small" themeColor="textSecondary">Akurasi: </ThemedText>
                  <ThemedText type="small">
                    {status.location.accuracy ? `±${Math.round(status.location.accuracy)}m` : 'N/A'}
                  </ThemedText>
                </View>
                <ExternalLink
                  href={`https://www.google.com/maps?q=${status.location.latitude},${status.location.longitude}`}
                  style={styles.mapsLink}
                >
                  <View style={styles.infoRow}>
                    <MaterialIcons name="map" size={14} color="#208AEF" />
                    <ThemedText type="small" style={styles.mapsLinkText}> Buka di Google Maps</ThemedText>
                  </View>
                </ExternalLink>
                <View style={[styles.infoRow, { marginTop: Spacing.one }]}>
                  <MaterialIcons name="schedule" size={12} color={theme.textSecondary} />
                  <ThemedText type="small" themeColor="textSecondary" style={styles.updateNote}>
                    {' '}Update tiap 5 menit atau setiap 100m
                  </ThemedText>
                </View>
              </>
            )}
          </ThemedView>

          {/* ── Device Info ────────────────────────────────────────────── */}
          <ThemedView type="backgroundElement" style={styles.card}>
            <CardHeader icon="smartphone" label="Device" />
            <View style={styles.infoRow}>
              <ThemedText type="small" themeColor="textSecondary">Nama: </ThemedText>
              <ThemedText type="small">{status.device.name ?? 'N/A'}</ThemedText>
            </View>
            <View style={styles.infoRow}>
              <ThemedText type="small" themeColor="textSecondary">Brand: </ThemedText>
              <ThemedText type="small">{status.device.brand ?? 'N/A'}</ThemedText>
            </View>
            <View style={styles.infoRow}>
              <ThemedText type="small" themeColor="textSecondary">OS: </ThemedText>
              <ThemedText type="small">
                {status.device.os} {status.device.osVersion}
              </ThemedText>
            </View>
            <View style={styles.infoRow}>
              <ThemedText type="small" themeColor="textSecondary">Tipe: </ThemedText>
              <ThemedText type="small">
                {status.device.isDevice ? 'Physical Device' : 'Emulator'}
              </ThemedText>
            </View>
          </ThemedView>

          {status.lastUpdated && (
            <View style={[styles.infoRow, { justifyContent: 'center', marginTop: Spacing.one }]}>
              <MaterialIcons name="update" size={12} color={theme.textSecondary} />
              <ThemedText type="small" themeColor="textSecondary">
                {' '}Diperbarui: {status.lastUpdated.toLocaleTimeString()}
              </ThemedText>
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1 },
  scroll: { flex: 1 },
  scrollContent: {
    padding: Spacing.three,
    paddingBottom: BottomTabInset + Spacing.four,
    gap: Spacing.two,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: Spacing.two,
    marginBottom: Spacing.one,
  },
  dot: { width: 10, height: 10, borderRadius: 5 },
  card: {
    padding: Spacing.three,
    borderRadius: Spacing.two,
    gap: Spacing.one,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  infoRow: { flexDirection: 'row', alignItems: 'center' },
  badge: {
    paddingHorizontal: Spacing.two,
    paddingVertical: 3,
    borderRadius: Spacing.three,
  },
  badgeLeft: { alignSelf: 'flex-start', marginTop: Spacing.one },
  bigValue: { fontSize: 40, lineHeight: 44, fontWeight: '700' },
  batteryBar: {
    height: 6,
    backgroundColor: '#E0E0E0',
    borderRadius: 3,
    marginTop: Spacing.two,
    overflow: 'hidden',
  },
  batteryFill: { height: '100%', borderRadius: 3 },
  warnText: { color: '#FF9500' },
  mapsLink: { marginTop: Spacing.two, alignSelf: 'flex-start' },
  mapsLinkText: { color: '#208AEF' },
  updateNote: { fontSize: 11 },
  permissionBox: { gap: Spacing.two, marginTop: Spacing.one },
  permBtn: {
    backgroundColor: '#208AEF',
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.two,
    alignItems: 'center',
  },
  permBtnText: { color: '#fff' },
  pressed: { opacity: 0.7 },
});
