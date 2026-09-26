// Tiny IndexedDB key-value store for things too big for localStorage (uploaded photos).
// Every call fails soft: private windows and blocked storage just mean nothing is remembered.
const DB = 'atmos';
const STORE = 'kv';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T | undefined> {
  try {
    const db = await open();
    return await new Promise<T | undefined>((resolve, reject) => {
      const req = fn(db.transaction(STORE, mode).objectStore(STORE));
      req.onsuccess = () => resolve(req.result as T);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return undefined;
  }
}

export const idbGet = <T,>(key: string) => run<T>('readonly', (s) => s.get(key));
export const idbSet = (key: string, value: unknown) => run('readwrite', (s) => s.put(value, key));
export const idbDel = (key: string) => run('readwrite', (s) => s.delete(key));
