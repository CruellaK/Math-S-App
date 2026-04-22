/* ═══════════════════════════════════════════════════
   STORAGE ENGINE — IndexedDB + localStorage fallback
   Exact same persistence model as original BacBooster
   ═══════════════════════════════════════════════════ */

const DB_NAME = 'bacbooster_db';
const STORE = 'app_data';
const KEY = 'bacbooster_v2';
const BACKUP = 'bacbooster_backup';
const BACKUP_FULL = 'bacbooster_backup_full';
const LEGACY = 'bacbooster_data';
const META_VERSION = 4;

class IDBAdapter {
  constructor() { this.db = null; this._p = null; }
  async init() {
    if (this.db) return;
    if (this._p) return this._p;
    this._p = new Promise((res, rej) => {
      const r = indexedDB.open(DB_NAME, 1);
      r.onerror = () => rej(r.error);
      r.onupgradeneeded = e => { const db = e.target.result; if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE); };
      r.onsuccess = () => { this.db = r.result; res(); };
    });
    return this._p;
  }
  async get(k) { await this.init(); return new Promise((res, rej) => { const r = this.db.transaction(STORE, 'readonly').objectStore(STORE).get(k); r.onsuccess = () => res(r.result ?? null); r.onerror = () => rej(r.error); }); }
  async set(k, v) { await this.init(); return new Promise((res, rej) => { const r = this.db.transaction(STORE, 'readwrite').objectStore(STORE).put(v, k); r.onsuccess = () => res(); r.onerror = () => rej(r.error); }); }
  async remove(k) { await this.init(); return new Promise((res, rej) => { const r = this.db.transaction(STORE, 'readwrite').objectStore(STORE).delete(k); r.onsuccess = () => res(); r.onerror = () => rej(r.error); }); }
}

class LSAdapter {
  async get(k) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch { return null; } }
  async set(k, v) { localStorage.setItem(k, JSON.stringify(v)); }
  async remove(k) { localStorage.removeItem(k); }
}

function checksum(data) {
  const s = JSON.stringify(data); let h = 0;
  for (let i = 0; i < s.length; i++) { h = (h << 5) - h + s.charCodeAt(i); h |= 0; }
  return Math.abs(h).toString(16);
}

class StorageEngine {
  constructor() {
    this.adapterType = typeof indexedDB !== 'undefined' ? 'indexeddb' : 'localstorage';
    this.adapter = this.adapterType === 'indexeddb' ? new IDBAdapter() : new LSAdapter();
    this._writeChain = Promise.resolve();
  }

  async load() {
    try {
      let d = await this.adapter.get(KEY);
      if (!d) d = await this._migrateLegacy();
      if (!d) d = this.getLocalBackup();
      if (d && (!d._meta || d._meta.version < META_VERSION)) {
        d = this._migrate(d);
        await this.save(d);
      }
      return d;
    } catch (e) { console.error('StorageEngine load error:', e); return null; }
  }

  async save(data) {
    const payload = this._createPayload(data);
    return this._enqueueCommit(payload);
  }

  async forceSave(data) {
    const payload = this._createPayload(data);
    return this._enqueueCommit(payload);
  }

  async reset() {
    await this.adapter.remove(KEY);
    localStorage.removeItem(BACKUP);
    localStorage.removeItem(BACKUP_FULL);
    localStorage.removeItem(LEGACY);
  }

  exportJSON(data) {
    return JSON.stringify(this.buildExportPayload(data), null, 2);
  }

  async importJSON(raw) {
    const d = this.parseImportJSON(raw);
    await this.forceSave(d);
    return d;
  }

  download(data, filename) {
    const blob = new Blob([this.exportJSON(data)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = filename || `bacbooster_backup_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
  }

  buildExportPayload(data) {
    return {
      ...this._stripMeta(data),
      _export: { version: META_VERSION, exportedAt: new Date().toISOString(), app: 'BacBooster v2.0' },
    };
  }

  parseImportJSON(raw) {
    const d = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!d || typeof d !== 'object') throw new Error('Invalid data structure');
    if (!d.profiles && (!d.user || (!d.subjects && !d.classContent))) throw new Error('Invalid data structure');
    const next = { ...d };
    delete next._export;
    delete next._meta;
    return next;
  }

  getLocalBackup() {
    try {
      const full = localStorage.getItem(BACKUP_FULL);
      if (full) return JSON.parse(full);
    } catch {}

    try {
      const partial = localStorage.getItem(BACKUP);
      return partial ? JSON.parse(partial) : null;
    } catch {
      return null;
    }
  }

  getPersistenceProfile() {
    return {
      localProvider: this.adapterType,
      backupProvider: 'localstorage',
      exportFormat: 'json',
      cloudReady: true,
      supportedCloudProviders: ['supabase', 'firebase'],
    };
  }

  _backupLS(data) {
    const clean = this._stripMeta(data);

    try {
      localStorage.setItem(BACKUP_FULL, JSON.stringify(clean));
    } catch {}

    try {
      localStorage.setItem(BACKUP, JSON.stringify({
        activeProfileId: clean.activeProfileId,
        profileOrder: clean.profileOrder,
        profiles: clean.profiles,
        user: clean.user,
        settings: clean.settings,
        subjects: clean.subjects,
        classContent: clean.classContent,
        _meta: data._meta,
      }));
    } catch {}
  }

  async _migrateLegacy() {
    const raw = localStorage.getItem(LEGACY);
    if (!raw) return null;
    try { return { ...JSON.parse(raw), _meta: { version: 1, timestamp: Date.now() } }; } catch { return null; }
  }

  _migrate(data) {
    const v = data._meta?.version || 1;
    const d = { ...data };
    if (v < 2) {
      d.settings = { ...d.settings, enableWordBankAnimation: false, uiSoundEnabled: d.settings?.uiSoundEnabled ?? true, uiSound: d.settings?.uiSound || 'bubble' };
      d.subjects = (d.subjects || []).map(s => ({ ...s, chapters: (s.chapters || []).map(c => ({ ...c, exercises: c.exercises || [], sections: c.sections || [] })) }));
    }
    if (v < 3) {
      d.classContent = d.classContent || null;
    }
    if (v < 4) {
      d.activeProfileId = d.activeProfileId || null;
      d.profileOrder = Array.isArray(d.profileOrder) ? d.profileOrder : null;
      d.profiles = d.profiles || null;
    }
    d._meta = { version: META_VERSION, timestamp: Date.now(), checksum: checksum(d) };
    return d;
  }

  _stripMeta(data) {
    if (!data || typeof data !== 'object') return data;
    const clean = { ...data };
    delete clean._meta;
    delete clean._export;
    return clean;
  }

  _createPayload(data) {
    const clean = this._stripMeta(data);
    return {
      ...clean,
      _meta: { version: META_VERSION, timestamp: Date.now(), checksum: checksum(clean) },
    };
  }

  _enqueueCommit(payload) {
    this._writeChain = this._writeChain
      .catch(() => null)
      .then(() => this._commit(payload));
    return this._writeChain;
  }

  async _commit(payload) {
    try {
      await this.adapter.set(KEY, payload);
      this._backupLS(payload);
    } catch (e) {
      console.error('StorageEngine save error:', e);
      throw e;
    }
  }
}

export const storage = new StorageEngine();

/* ── Admin password helper ── */
const ADMIN_PW_KEY = 'bacbooster_admin_password';
export function getAdminPassword() { return localStorage.getItem(ADMIN_PW_KEY) || '8765'; }
export function setAdminPassword(pw) { localStorage.setItem(ADMIN_PW_KEY, pw); }

/* ── Profile meta helper ── */
const PROFILE_KEY = 'bacbooster_profile_meta';
export function getProfileMeta() {
  try { return JSON.parse(localStorage.getItem(PROFILE_KEY)) || {}; } catch { return {}; }
}
export function setProfileMeta(meta) {
  localStorage.setItem(PROFILE_KEY, JSON.stringify({ ...getProfileMeta(), ...meta, updatedAt: Date.now() }));
}
