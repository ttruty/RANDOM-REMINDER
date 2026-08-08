import { Injectable } from '@angular/core';
import { Occurrence, ReminderProfile } from './models';

/**
 * These constants are duplicated in src/sw.js (the service worker can't import
 * TypeScript app modules) — keep both in sync if you change the schema.
 */
export const DB_NAME = 'random-reminders';
export const DB_VERSION = 1;
export const STORE_PROFILES = 'profiles';
export const STORE_OCCURRENCES = 'occurrences';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_PROFILES)) {
        db.createObjectStore(STORE_PROFILES, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_OCCURRENCES)) {
        const store = db.createObjectStore(STORE_OCCURRENCES, { keyPath: 'id' });
        store.createIndex('profileId', 'profileId', { unique: false });
        store.createIndex('time', 'time', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(
  db: IDBDatabase,
  storeNames: string[],
  mode: IDBTransactionMode,
  fn: (stores: Record<string, IDBObjectStore>) => IDBRequest<T> | void
): Promise<T> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeNames, mode);
    const stores: Record<string, IDBObjectStore> = {};
    for (const name of storeNames) stores[name] = transaction.objectStore(name);
    let result: T;
    const req = fn(stores);
    if (req) {
      req.onsuccess = () => (result = req.result);
      req.onerror = () => reject(req.error);
    }
    transaction.oncomplete = () => resolve(result as T);
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

@Injectable({ providedIn: 'root' })
export class DbService {
  private dbPromise = openDb();

  private async db(): Promise<IDBDatabase> {
    return this.dbPromise;
  }

  async getAllProfiles(): Promise<ReminderProfile[]> {
    const db = await this.db();
    return tx(db, [STORE_PROFILES], 'readonly', (s) => s[STORE_PROFILES].getAll());
  }

  async getProfile(id: string): Promise<ReminderProfile | undefined> {
    const db = await this.db();
    return tx(db, [STORE_PROFILES], 'readonly', (s) => s[STORE_PROFILES].get(id));
  }

  async putProfile(profile: ReminderProfile): Promise<void> {
    const db = await this.db();
    await tx(db, [STORE_PROFILES], 'readwrite', (s) => s[STORE_PROFILES].put(profile));
  }

  async deleteProfile(id: string): Promise<void> {
    const db = await this.db();
    await tx(db, [STORE_PROFILES, STORE_OCCURRENCES], 'readwrite', (s) => {
      s[STORE_PROFILES].delete(id);
      const idx = s[STORE_OCCURRENCES].index('profileId');
      const req = idx.openCursor(IDBKeyRange.only(id));
      req.onsuccess = () => {
        const cursor = req.result;
        if (cursor) {
          cursor.delete();
          cursor.continue();
        }
      };
    });
  }

  async getOccurrencesForProfile(profileId: string): Promise<Occurrence[]> {
    const db = await this.db();
    return tx(db, [STORE_OCCURRENCES], 'readonly', (s) =>
      s[STORE_OCCURRENCES].index('profileId').getAll(IDBKeyRange.only(profileId))
    );
  }

  async replaceOccurrencesForProfile(profileId: string, occurrences: Occurrence[]): Promise<void> {
    const db = await this.db();
    await tx(db, [STORE_OCCURRENCES], 'readwrite', (s) => {
      const idx = s[STORE_OCCURRENCES].index('profileId');
      const req = idx.openCursor(IDBKeyRange.only(profileId));
      req.onsuccess = () => {
        const cursor = req.result;
        if (cursor) {
          cursor.delete();
          cursor.continue();
        } else {
          for (const occ of occurrences) s[STORE_OCCURRENCES].put(occ);
        }
      };
    });
  }

  /** Adds/overwrites the given occurrences without touching any others (additive fill of new cycles). */
  async addOccurrences(occurrences: Occurrence[]): Promise<void> {
    if (occurrences.length === 0) return;
    const db = await this.db();
    await tx(db, [STORE_OCCURRENCES], 'readwrite', (s) => {
      for (const occ of occurrences) s[STORE_OCCURRENCES].put(occ);
    });
  }

  async deleteOccurrence(id: string): Promise<void> {
    const db = await this.db();
    await tx(db, [STORE_OCCURRENCES], 'readwrite', (s) => s[STORE_OCCURRENCES].delete(id));
  }

  async getOccurrencesInRange(startMs: number, endMs: number): Promise<Occurrence[]> {
    const db = await this.db();
    return tx(db, [STORE_OCCURRENCES], 'readonly', (s) =>
      s[STORE_OCCURRENCES].index('time').getAll(IDBKeyRange.bound(startMs, endMs))
    );
  }

  /** Housekeeping: drops occurrences older than the cutoff (fired or not) — no history feature needs them. */
  async deleteOccurrencesBefore(cutoffMs: number): Promise<void> {
    const db = await this.db();
    await tx(db, [STORE_OCCURRENCES], 'readwrite', (s) => {
      const idx = s[STORE_OCCURRENCES].index('time');
      const req = idx.openCursor(IDBKeyRange.upperBound(cutoffMs, true));
      req.onsuccess = () => {
        const cursor = req.result;
        if (cursor) {
          cursor.delete();
          cursor.continue();
        }
      };
    });
  }

  async markOccurrenceFired(id: string, messageId: string): Promise<void> {
    const db = await this.db();
    await tx(db, [STORE_OCCURRENCES], 'readwrite', (s) => {
      const getReq = s[STORE_OCCURRENCES].get(id);
      getReq.onsuccess = () => {
        const occ = getReq.result as Occurrence | undefined;
        if (occ) {
          occ.fired = true;
          occ.messageId = messageId;
          s[STORE_OCCURRENCES].put(occ);
        }
      };
    });
  }

  async getAllOccurrences(): Promise<Occurrence[]> {
    const db = await this.db();
    return tx(db, [STORE_OCCURRENCES], 'readonly', (s) => s[STORE_OCCURRENCES].getAll());
  }
}
