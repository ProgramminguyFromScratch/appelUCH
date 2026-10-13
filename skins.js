// Client side of player skins. The list comes from skins.json:
//   { id, name, stand, crouch, unlock, hint }
// `unlock` is the achievement id that unlocks the skin (null = everyone has it).
// The server (worker/src/skins.js) is what actually enforces unlocks.
const AppelSkins = (() => {
    const DEFAULT_ID = '1';
    let list = [{ id: DEFAULT_ID, name: 'Appel', stand: 'stand.png', crouch: 'crouch.png', unlock: null }];
    let loaded = false;
    const listeners = [];

    // skins.json is retried a few times (flaky/mobile networks) so one failed request
    // doesn't leave the session with only the default skin.
    async function fetchList() {
        const delays = [0, 500, 1500, 3000];
        for (const d of delays) {
            if (d) await new Promise(r => setTimeout(r, d));
            try {
                const r = await fetch('skins.json', { cache: 'no-cache' });
                if (!r.ok) throw new Error('HTTP ' + r.status);
                const j = await r.json();
                if (Array.isArray(j) && j.length) { list = j; loaded = true; return true; }
            } catch (err) {
                console.warn('[skins] could not load skins.json:', err);
            }
        }
        return false;
    }

    // Resolves once the list is loaded (or all retries failed). If it failed, keeps trying
    // in the background and notifies onChange listeners when it eventually succeeds.
    const ready = fetchList().then(ok => {
        if (!ok) {
            const again = async () => {
                if (await fetchList()) listeners.forEach(fn => { try { fn(); } catch (e) { console.warn(e); } });
                else setTimeout(again, 10000);
            };
            setTimeout(again, 10000);
        }
    });

    return {
        DEFAULT_ID,
        ready,
        get loaded() { return loaded; },
        get list() { return list; },
        onChange(fn) { listeners.push(fn); },
        get(id) { return list.find(s => s.id === String(id)) || list.find(s => s.id === DEFAULT_ID) || list[0]; },
        has(id) { return list.some(s => s.id === String(id)); },
        standPath(id) { return 'assets/player/' + this.get(id).stand; },
        crouchPath(id) { return 'assets/player/' + this.get(id).crouch; }
    };
})();
