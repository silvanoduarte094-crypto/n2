import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { ExportBundle, Memory, Session, Settings, UsageRecord } from '../types';
import { DB_NAME, DEFAULT_SETTINGS, SCHEMA_VERSION } from '../config';

interface N2DB extends DBSchema {
  sessions: {
    key: string;
    value: Session;
    indexes: { 'by-updated': number };
  };
  memories: {
    key: string;
    value: Memory;
    indexes: { 'by-updated': number };
  };
  usage: {
    key: string;
    value: UsageRecord;
    indexes: { 'by-at': number };
  };
  kv: {
    key: string;
    value: { key: string; value: unknown };
  };
}

const MAX_USAGE_ROWS = 5000;

let dbPromise: Promise<IDBPDatabase<N2DB>> | null = null;

function getDB() {
  if (!dbPromise) {
    dbPromise = openDB<N2DB>(DB_NAME, SCHEMA_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('sessions')) {
          const store = db.createObjectStore('sessions', { keyPath: 'id' });
          store.createIndex('by-updated', 'updatedAt');
        }
        if (!db.objectStoreNames.contains('memories')) {
          const store = db.createObjectStore('memories', { keyPath: 'id' });
          store.createIndex('by-updated', 'updatedAt');
        }
        if (!db.objectStoreNames.contains('usage')) {
          const store = db.createObjectStore('usage', { keyPath: 'id' });
          store.createIndex('by-at', 'at');
        }
        if (!db.objectStoreNames.contains('kv')) {
          db.createObjectStore('kv', { keyPath: 'key' });
        }
      },
    });
  }
  return dbPromise;
}

export async function loadSessions(): Promise<Session[]> {
  const db = await getDB();
  const sessions = await db.getAllFromIndex('sessions', 'by-updated');
  return sessions.sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt - a.updatedAt);
}

export async function saveSession(session: Session): Promise<void> {
  const db = await getDB();
  await db.put('sessions', session);
}

export async function deleteSessionRecord(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('sessions', id);
}

export async function loadMemories(): Promise<Memory[]> {
  const db = await getDB();
  const memories = await db.getAllFromIndex('memories', 'by-updated');
  return memories.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function saveMemoryRecord(memory: Memory): Promise<void> {
  const db = await getDB();
  await db.put('memories', memory);
}

export async function deleteMemoryRecord(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('memories', id);
}

export async function loadUsage(): Promise<UsageRecord[]> {
  const db = await getDB();
  const rows = await db.getAllFromIndex('usage', 'by-at');
  return rows.sort((a, b) => b.at - a.at);
}

export async function saveUsageRecord(record: UsageRecord): Promise<void> {
  const db = await getDB();
  await db.put('usage', record);
  const count = await db.count('usage');
  if (count > MAX_USAGE_ROWS) {
    const tx = db.transaction('usage', 'readwrite');
    const index = tx.store.index('by-at');
    let cursor = await index.openCursor();
    let remaining = count - MAX_USAGE_ROWS;
    while (cursor && remaining > 0) {
      await cursor.delete();
      remaining -= 1;
      cursor = await cursor.continue();
    }
    await tx.done;
  }
}

export async function clearUsage(): Promise<void> {
  const db = await getDB();
  await db.clear('usage');
}

export async function loadSettings(): Promise<Settings> {
  const db = await getDB();
  const row = await db.get('kv', 'settings');
  if (!row?.value) return structuredClone(DEFAULT_SETTINGS);
  const stored = row.value as Partial<Settings>;
  return {
    ...structuredClone(DEFAULT_SETTINGS),
    ...stored,
    providers: mergeProviders(stored.providers),
    connectors: Array.isArray(stored.connectors)
      ? stored.connectors
      : DEFAULT_SETTINGS.connectors,
    fallbackProviderIds: Array.isArray(stored.fallbackProviderIds)
      ? stored.fallbackProviderIds.filter((id) => typeof id === 'string')
      : [],
    routines: Array.isArray(stored.routines) ? stored.routines : [],
    ragEnabled: !!stored.ragEnabled,
    embeddingsProviderId: stored.embeddingsProviderId || 'ollama',
    embeddingsModel: stored.embeddingsModel || 'nomic-embed-text',
    schemaVersion: SCHEMA_VERSION,
  };
}

function mergeProviders(stored?: Settings['providers']): Settings['providers'] {
  if (!stored?.length) return structuredClone(DEFAULT_SETTINGS.providers);
  return DEFAULT_SETTINGS.providers.map((base) => {
    const match = stored.find((p) => p.id === base.id);
    return match ? { ...base, ...match } : base;
  }).concat(stored.filter((p) => !DEFAULT_SETTINGS.providers.some((base) => base.id === p.id)));
}

export async function saveSettings(settings: Settings): Promise<void> {
  const db = await getDB();
  await db.put('kv', { key: 'settings', value: settings });
}

export async function clearAllData(): Promise<void> {
  const db = await getDB();
  await Promise.all([
    db.clear('sessions'),
    db.clear('memories'),
    db.clear('usage'),
    db.clear('kv'),
  ]);
}

export async function exportBundle(
  sessions: Session[],
  memories: Memory[],
  settings: Settings,
  usage: UsageRecord[] = [],
): Promise<ExportBundle> {
  return {
    app: 'n2',
    version: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    sessions,
    memories,
    settings,
    usage,
  };
}

export async function importBundle(bundle: ExportBundle): Promise<{
  sessions: Session[];
  memories: Memory[];
  settings: Settings;
  usage: UsageRecord[];
}> {
  if (bundle.app !== 'n2') throw new Error('Arquivo não é um backup válido do N2.');
  const db = await getDB();
  const sessions = Array.isArray(bundle.sessions) ? bundle.sessions : [];
  const memories = Array.isArray(bundle.memories) ? bundle.memories : [];
  const usage = Array.isArray(bundle.usage) ? bundle.usage : [];
  const tx = db.transaction(['sessions', 'memories', 'usage', 'kv'], 'readwrite');
  // Requests are queued in call order: clear first, then insert the backup.
  tx.objectStore('sessions').clear();
  tx.objectStore('memories').clear();
  tx.objectStore('usage').clear();
  for (const session of sessions) tx.objectStore('sessions').put(session);
  for (const memory of memories) tx.objectStore('memories').put(memory);
  for (const record of usage) tx.objectStore('usage').put(record);
  tx.objectStore('kv').put({ key: 'settings', value: bundle.settings });
  await tx.done;
  return {
    sessions,
    memories,
    settings: { ...structuredClone(DEFAULT_SETTINGS), ...bundle.settings },
    usage,
  };
}

export async function requestPersistentStorage(): Promise<boolean> {
  if (!navigator.storage?.persist) return false;
  if (await navigator.storage.persisted()) return true;
  return navigator.storage.persist();
}
