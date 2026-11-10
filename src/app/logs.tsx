/**
 * logs.tsx — Log History Screen
 * Tampilan read-only semua event yang sudah dicatat.
 * Tap event untuk lihat detail data.
 */

import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useCallback, useEffect, useState } from 'react';
import {
    ActivityIndicator,
    FlatList,
    Pressable,
    RefreshControl,
    StyleSheet,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, Spacing } from '@/constants/theme';
import { getLocalLogs, type TrackEvent } from '@/lib/tracker';

const EVENT_ICONS: Record<TrackEvent['type'], React.ComponentProps<typeof MaterialIcons>['name']> = {
  app_open:        'rocket-launch',
  app_close:       'close',
  app_background:  'pause',
  app_foreground:  'play-arrow',
  battery_level:   'battery-full',
  battery_state:   'bolt',
  network_change:  'wifi',
  location_update: 'location-on',
  custom:          'edit',
};

function EventItem({ event }: { event: TrackEvent }) {
  const [expanded, setExpanded] = useState(false);
  const iconName = EVENT_ICONS[event.type] ?? 'circle';
  const time = new Date(event.timestamp).toLocaleString();

  return (
    <Pressable onPress={() => setExpanded((v) => !v)}>
      <ThemedView type="backgroundElement" style={styles.item}>
        <View style={styles.itemHeader}>
          <View style={styles.itemLeft}>
            <MaterialIcons name={iconName} size={20} color="#208AEF" />
            <View>
              <ThemedText type="smallBold">{event.type}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">{time}</ThemedText>
            </View>
          </View>
          <View style={[styles.sentBadge, { backgroundColor: event.sent ? '#34C75920' : '#FF950020' }]}>
            <ThemedText type="small" style={{ color: event.sent ? '#34C759' : '#FF9500', fontSize: 11 }}>
              {event.sent ? 'sent' : 'pending'}
            </ThemedText>
          </View>
        </View>

        {expanded && (
          <ThemedView type="background" style={styles.dataBox}>
            <ThemedText type="code" style={styles.dataText}>
              {JSON.stringify(event.data, null, 2)}
            </ThemedText>
          </ThemedView>
        )}
      </ThemedView>
    </Pressable>
  );
}

export default function LogsScreen() {
  const [logs, setLogs] = useState<TrackEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadLogs = useCallback(async () => {
    const data = await getLocalLogs();
    setLogs(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadLogs();
    setRefreshing(false);
  };

  const sentCount    = logs.filter((e) => e.sent).length;
  const pendingCount = logs.filter((e) => !e.sent).length;

  if (loading) {
    return (
      <ThemedView style={styles.centered}>
        <ActivityIndicator size="large" />
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <ThemedText type="subtitle">Event Logs</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">{logs.length} event</ThemedText>
        </View>

        {logs.length > 0 && (
          <View style={styles.statsRow}>
            <ThemedView type="backgroundElement" style={styles.statCard}>
              <ThemedText type="smallBold" style={styles.statNum}>{logs.length}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">Total</ThemedText>
            </ThemedView>
            <ThemedView type="backgroundElement" style={styles.statCard}>
              <ThemedText type="smallBold" style={[styles.statNum, { color: '#34C759' }]}>{sentCount}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">Terkirim</ThemedText>
            </ThemedView>
            <ThemedView type="backgroundElement" style={styles.statCard}>
              <ThemedText type="smallBold" style={[styles.statNum, { color: '#FF9500' }]}>{pendingCount}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">Pending</ThemedText>
            </ThemedView>
          </View>
        )}

        <ThemedText type="small" themeColor="textSecondary" style={styles.hint}>
          Tap event untuk lihat detail · Pull untuk refresh
        </ThemedText>

        {logs.length === 0 ? (
          <ThemedView style={styles.empty}>
            <MaterialIcons name="inbox" size={48} color="#60646C" />
            <ThemedText type="small" themeColor="textSecondary">Belum ada event</ThemedText>
          </ThemedView>
        ) : (
          <FlatList
            data={logs}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => <EventItem event={item} />}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
            contentContainerStyle={styles.listContent}
            ItemSeparatorComponent={() => <View style={{ height: Spacing.one }} />}
          />
        )}
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1, paddingHorizontal: Spacing.three },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: Spacing.three,
    marginBottom: Spacing.two,
  },
  statsRow: { flexDirection: 'row', gap: Spacing.two, marginBottom: Spacing.two },
  statCard: { flex: 1, padding: Spacing.two, borderRadius: Spacing.two, alignItems: 'center', gap: 2 },
  statNum: { fontSize: 20, lineHeight: 24 },
  hint: { marginBottom: Spacing.two },
  listContent: { paddingBottom: BottomTabInset + Spacing.four },
  item: { padding: Spacing.two, borderRadius: Spacing.two, gap: Spacing.one },
  itemHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  itemLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  sentBadge: { paddingHorizontal: Spacing.one, paddingVertical: 2, borderRadius: Spacing.one },
  dataBox: { padding: Spacing.two, borderRadius: Spacing.one, marginTop: Spacing.one },
  dataText: { fontSize: 11, lineHeight: 16 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.two },
});
