// Client side of player skins. The list comes from skins.json:
//   { id, name, stand, crouch, unlock, hint }
// `unlock` is the achievement id that unlocks the skin (null = everyone has it).
// The server (worker/src/skins.js) is what actually enforces unlocks.
const AppelSkins = (() => {
    const DEFAULT_ID = '1';
    let list = [{ id: DEFAULT_ID, name: 'Appel', stand: 'stand.png', crouch: 'crouch.png', unlock: null }];
    const ready = fetch('skins.json')
        .then(r => r.json())
        .then(j => { if (Array.isArray(j) && j.length) list = j; })
        .catch(err => console.warn('[skins] could not load skins.json:', err));
    return {
        DEFAULT_ID,
        ready,
        get list() { return list; },
        get(id) { return list.find(s => s.id === String(id)) || list.find(s => s.id === DEFAULT_ID) || list[0]; },
        standPath(id) { return 'assets/player/' + this.get(id).stand; },
        crouchPath(id) { return 'assets/player/' + this.get(id).crouch; }
    };
})();
