const BG_KEY = '__LDS_BG_HISTORY__';
const MAX_ENTRIES = 50;

export class BackgroundSessionStore {
    push(entry) {
        try {
            const all = this.load();
            all.push({
                ...entry,
                id: entry.id ?? `bg-${Date.now()}-${Math.random().toString(36).slice(2)}`,
            });
            if (all.length > MAX_ENTRIES) all.splice(0, all.length - MAX_ENTRIES);
            localStorage.setItem(BG_KEY, JSON.stringify(all));
        } catch (_) { /* quota exceeded or localStorage unavailable */ }
    }

    load() {
        try {
            const raw = localStorage.getItem(BG_KEY);
            return raw ? JSON.parse(raw) : [];
        } catch (_) { return []; }
    }

    clear() {
        try { localStorage.removeItem(BG_KEY); } catch (_) {}
    }

    size() { return this.load().length; }
}
