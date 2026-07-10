// sfx.js — tiny shared sound-effect helper.
//
// Browser-only (physics.js/game.js are both <script>-included, not
// required() server-side — see index.html), so this can freely touch
// `Audio` without any Node guard. Preloads each clip once up front and
// hands back a fresh clone per play() call, so two overlapping triggers
// (e.g. two players landing on the same tick) each get their own
// playback instead of one cutting the other off by restarting a shared
// <audio> node.
const SFX_FILES = {
    jump: '/assets/sfx/jump.wav',
    wall_jump: '/assets/sfx/wall_jump.wav',
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

// Crumble tiles can trigger their sfx from several tiles/players within
// the same frame, and since playSfx() normally clones a fresh <audio>
// node per call (see header comment) those all used to overlap freely,
// turning into a wall of crumble noise. Crumble specifically gets an
// exception: track every currently-playing crumble clone here so a new
// crumble sound stops all the others first, leaving only the newest one
// audible. Other sfx (jump, spring, etc.) keep the normal overlapping
// behavior untouched.
const ACTIVE_CRUMBLE_NODES = new Set();

function playSfx(name) {
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

    if (name === 'crumble') {
        ACTIVE_CRUMBLE_NODES.add(node);
        node.addEventListener('ended', () => ACTIVE_CRUMBLE_NODES.delete(node));
    }

    // Playback can be rejected (e.g. no user gesture yet on the page) —
    // that's fine, just drop it silently rather than throwing.
    node.play().catch(() => {});
}