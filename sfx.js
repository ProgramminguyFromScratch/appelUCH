const SFX_FILES = {
    jump: '/assets/sfx/jump.wav',
    wall_jump: '/assets/sfx/wall_jump.wav',
    sidejump: '/assets/sfx/sidejump.wav',
    land: '/assets/sfx/land.wav',
    boom: '/assets/sfx/boom.wav',
    spring: '/assets/sfx/spring.wav',
    crumble: '/assets/sfx/crumble.wav',
    select: '/assets/sfx/select.wav',
    hover: '/assets/sfx/hover.wav',
    finish: '/assets/sfx/finish.wav'
};

const SFX_CACHE = {};
for (const [name, path] of Object.entries(SFX_FILES)) {
    const audio = new Audio(path);
    audio.preload = 'auto';
    SFX_CACHE[name] = audio;
}
const ACTIVE_CRUMBLE_NODES = new Set();

function playSfx(name, volume = 1) {
    const base = SFX_CACHE[name];
    if (!base) {
        console.warn(`[sfx] unknown sound: ${name}`);
        return;
    }

    if (name === 'crumble') {
        for (const node of ACTIVE_CRUMBLE_NODES) {
            node.pause();
            node.currentTime = 0;
        }
        ACTIVE_CRUMBLE_NODES.clear();
    }

    const node = base.cloneNode();
    node.volume = Math.max(0, Math.min(1, volume));

    if (name === 'crumble') {
        ACTIVE_CRUMBLE_NODES.add(node);
        node.addEventListener('ended', () => ACTIVE_CRUMBLE_NODES.delete(node));
    }
    node.play().catch(() => {});
}