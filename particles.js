// Tile particles: short-lived sprites drawn between the background and foreground
// layers of the tiles. They are purely visual (no physics, no network).
//
// To add one: drop its SVG in assets/particles/ and add an entry to PARTICLE_TYPES.
//   file       sprite to draw (hue-shifted with the level's tile hue, like the tiles)
//   triggerTile map value that spawns it. The renderer starts one when it first sees that
//              tile at a cell, and removes it as soon as the cell changes to something else.
//   originX/Y  point of the sprite (in sprite px) that sits on the tile centre
//   offset(age, rotation)  distance (px) the sprite is pushed out of the tile along the
//              tile's "up" axis, `age` ticks after the trigger. Rotation is the tile
//              rotation (1 = up, 2 = right, 3 = down, 0 = left, same as tiles).
//
// SPRING is a port of the Scratch game's "spring" clone script. When a spring is hit the
// tile turns into its base-only version (43), so without this the plate would vanish in one
// frame. The Scratch clone, per frame:
//   frame 1-2   move by its launch velocity (the plate pops out)
//   frame 3-4   stand still
//   frame 5-29  accelerate back toward the tile (0.7 sideways, 0.5 vertically), and once it
//               is within 6px of its resting place it is done.
// LAUNCH_SPEED isn't in the script that was shared; 15px x 2 frames = 30px, which is exactly
// how far the sprite's spring can stretch before showing a gap above the base. Tune it here.
const SPRING_PARTICLE = {
    LAUNCH_SPEED: 15,
    LAUNCH_FRAMES: 3,   // moves while frame < 3
    HOLD_FRAMES: 5,     // velocity is zeroed while frame < 5
    END_FRAME: 30,      // acceleration stops at frame 30
    ACCEL_SIDEWAYS: 0.7,
    ACCEL_VERTICAL: 0.5,
    DONE_DISTANCE: 6
};

function springOffset(age, rotation) {
    const S = SPRING_PARTICLE;
    const accel = rotation % 2 === 0 ? S.ACCEL_SIDEWAYS : S.ACCEL_VERTICAL;
    let dist = 0, vel = 0;
    for (let frame = 1; frame <= age; frame++) {
        if (frame < S.LAUNCH_FRAMES) {
            dist += S.LAUNCH_SPEED;
        } else if (frame < S.HOLD_FRAMES) {
            vel = 0;
        } else if (frame < S.END_FRAME) {
            vel -= accel;
            dist += vel;
            if (Math.abs(dist) < S.DONE_DISTANCE) return 0;
        } else {
            return 0;
        }
    }
    return dist;
}

const PARTICLE_TYPES = {
    spring: {
        file: 'assets/particles/spring.svg',
        triggerTile: 43,
        originX: 29,
        originY: 32,
        offset: springOffset
    }
};

// triggerTile -> particle type id
const PARTICLE_TRIGGERS = {};
for (const id of Object.keys(PARTICLE_TYPES)) PARTICLE_TRIGGERS[PARTICLE_TYPES[id].triggerTile] = id;

// ---------------------------------------------------------------------------------------------
// Crumble debris: port of the Scratch game's `Particle` clone script.
//
// When a crumble block advances a frame, physics.js (`tick crumble` -> `particle`) hands over
// one 15px chunk (crumble1 = dark, crumble2 = light) at its spot in the tile. Each chunk is
// then a small physics body, per frame (30 fps, same as the Scratch game):
//   dx *= 0.95;  dy = (dy - 0.9) * 0.99;  dy >= -30        drag + gravity + terminal speed
//   x += dx, then a horizontal tile check; y += dy, then a vertical tile check (bounces)
//   frame += 1;  from frame 61 the ghost effect goes up by 10 a frame (fade-out);  gone after 70
// World space is the physics one: y points up, and a particle's (x, y) is the bottom-centre of
// its sprite (the costume's rotation centre is 8.5, 16.5).
//
// The Scratch script's collision call is `is solid at x (y - size) dir d`; here that is
// physics.tileOverlapAt(x, y - DEBRIS.SIZE, d). Things the shared script doesn't show, so they
// are tuned here: SIZE and COLLIDE_SOURCE (see step).
const DEBRIS = {
    SIZE: 0,
    // Spawn values from the Scratch `Particle` clone setup: dx = pick random -1 to 1,
    // dy = pick random -1 to 0, frame = 55 (so the chunk only lives ~15 ticks: the fade
    // starts after frame 60 and it is deleted after frame 70).
    INITIAL_DX_MIN: -1,
    INITIAL_DX_MAX: 1,
    INITIAL_DY_MIN: -1,
    INITIAL_DY_MAX: 0,
    INITIAL_FRAME: 55,
    // The Scratch script sets `collided` to 9 on spawn, and both collision blocks in `Particle` are
    // wrapped in `if collided = (blank)`, so they never run: chunks pass through tiles. Set this to
    // 0 (the blank) to turn the bounce/collision code below back on.
    INITIAL_COLLIDED: 9,
    DRAG: 0.95,
    GRAVITY: 0.9,
    FALL_DRAG: 0.99,
    MAX_FALL: -30,
    FADE_START: 60,    // ghost effect rises while frame > this
    FADE_STEP: 10,     // ghost units per frame (100 = invisible)
    LIFETIME: 70,      // clone deleted once frame > this
    MAX_PARTICLES: 600,
    // false: a chunk ignores the tile it broke off from. That tile stays solid until its last
    // frame, so without this every chunk would be shoved back out of it onto the platform.
    COLLIDE_SOURCE: false,
    ORIGIN_X: 8.5,
    ORIGIN_Y: 16.5
};

// `typ` from the crumble list (1, 2) -> sprite. Loaded and hue-shifted like the tile particles.
const DEBRIS_TYPES = {
    1: { id: 'crumble1', file: 'assets/particles/crumble1.svg' },
    2: { id: 'crumble2', file: 'assets/particles/crumble2.svg' }
};

class TileDebris {
    constructor(levelData) {
        this.levelData = levelData || null; // the renderer only draws debris for this level
        this.list = [];
    }

    // The part of the `particle` define that creates the clone.
    spawn(typ, x, y, src) {
        if (!DEBRIS_TYPES[typ]) return;
        if (this.list.length >= DEBRIS.MAX_PARTICLES) this.list.shift();
        this.list.push({
            typ, x, y, src,
            dx: DEBRIS.INITIAL_DX_MIN + Math.random() * (DEBRIS.INITIAL_DX_MAX - DEBRIS.INITIAL_DX_MIN),
            dy: DEBRIS.INITIAL_DY_MIN + Math.random() * (DEBRIS.INITIAL_DY_MAX - DEBRIS.INITIAL_DY_MIN),
            frame: DEBRIS.INITIAL_FRAME, collided: DEBRIS.INITIAL_COLLIDED, ghost: 0
        });
    }

    // One tick of `define Particle` for every live particle.
    step(physics) {
        const list = this.list;
        let keep = 0;
        for (let i = 0; i < list.length; i++) {
            const p = list[i];
            if (this._stepOne(p, physics)) list[keep++] = p;
        }
        list.length = keep;
    }

    // Returns false once the clone deletes itself.
    _stepOne(p, physics) {
        const D = DEBRIS;
        p.dx *= D.DRAG;
        p.dy = (p.dy - D.GRAVITY) * D.FALL_DRAG;
        if (p.dy < D.MAX_FALL) p.dy = D.MAX_FALL;

        const check = p.collided === 0;
        p.x += p.dx;
        let overlap = check ? this._overlap(p, physics, p.dx > 0 ? 1 : -1) : 0;
        if (p.dx > 0) {
            if (overlap > 0) {
                p.x += -0.01 - overlap;
                p.dx = -0.8 * Math.abs(p.dx);
            }
        } else if (overlap > 0) {
            p.x += 0.01 + overlap;
            p.dx = Math.abs(p.dx);
        }

        p.y += p.dy;
        if (!check) {
            // collided != blank: no vertical tile check either
        } else if (p.dy > 0) {
            overlap = this._overlap(p, physics, 0);
            if (overlap > 0) {
                p.y += -0.01 - overlap;
                p.dy = -0.5 * Math.abs(p.dy);
            }
        } else {
            overlap = this._overlap(p, physics, 2);
            if (overlap > 0) {
                p.y += 0.01 + overlap;
                p.dy = 0.5 * Math.abs(p.dy);
                p.dx *= 0.75;
                if (p.dy > 1) p.dx += Math.abs(p.dy) * (Math.random() - 0.5);
            }
        }

        p.frame += 1;
        if (p.frame > D.FADE_START) {
            p.ghost += D.FADE_STEP;
            if (p.frame > D.LIFETIME) return false;
        }
        return true;
    }

    _overlap(p, physics, dir) {
        const ty = p.y - DEBRIS.SIZE;
        if (!DEBRIS.COLLIDE_SOURCE && p.src !== undefined && this._cellIdx(physics, p.x, ty) === p.src) return 0;
        return physics.tileOverlapAt(p.x, ty, dir);
    }

    _cellIdx(physics, x, y) {
        return Math.floor(x / 60) + Math.floor(y / 60) * physics.LSX;
    }
}
