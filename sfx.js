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

const MUSIC_FILE = '/assets/music/p_pp.mp3';
const MUSIC_LOOP_START = 13.1; // seconds — where playback jumps back to on loop
let musicNode = null;
let musicVolume = 0.5;

function playMusic(volume = musicVolume) {
    musicVolume = Math.max(0, Math.min(1, volume));
    if (musicNode) {
        musicNode.volume = musicVolume;
        if (musicNode.paused) musicNode.play().catch(() => {});
        return;
    }
    musicNode = new Audio(MUSIC_FILE);
    musicNode.loop = false; // manual looping so we can loop back to MUSIC_LOOP_START instead of 0
    musicNode.preload = 'auto';
    musicNode.volume = musicVolume;
    musicNode.addEventListener('ended', () => {
        musicNode.currentTime = MUSIC_LOOP_START;
        musicNode.play().catch(() => {});
    });
    musicNode.play().catch(() => {});
}

function stopMusic() {
    if (!musicNode) return;
    musicNode.pause();
    musicNode.currentTime = 0;
}

function setMusicVolume(volume) {
    musicVolume = Math.max(0, Math.min(1, volume));
    if (musicNode) musicNode.volume = musicVolume;
}

function isMusicPlaying() {
    return !!musicNode && !musicNode.paused;
}

let sfxVolume = 1;

function setSfxVolume(volume) {
    sfxVolume = Math.max(0, Math.min(1, volume));
}

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
    node.volume = Math.max(0, Math.min(1, volume)) * sfxVolume;

    if (name === 'crumble') {
        ACTIVE_CRUMBLE_NODES.add(node);
        node.addEventListener('ended', () => ACTIVE_CRUMBLE_NODES.delete(node));
    }
    node.play().catch(() => {});
}