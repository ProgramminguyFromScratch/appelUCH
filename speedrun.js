// Speedrun mode + leaderboards.
//
// A speedrun is a purely local, solo run of a *pristine* level from levels.json
// (nothing built on it). It runs on its own physics instance, swapped in over
// the hub's, so the room's real match state is never touched. The clock is the
// number of physics ticks (30/s) from the first input until the goal.
//
//   Hub:      stand on a stage, R = speedrun it, B = leaderboards
//   Speedrun: R = reset, B = leaderboard, Esc = back to the hub
//
// Times are only ever submitted from here, never from the multiplayer race
// (which always runs on a level players have edited), so edited levels can't
// reach the leaderboard.

const SPEEDRUN_TPS = 30;
const SPEEDRUN_DEATH_RESET_FRAMES = 24;

function formatSpeedrunTicks(ticks) {
    if (!Number.isFinite(ticks)) return '--';
    const sec = ticks / SPEEDRUN_TPS;
    const m = Math.floor(sec / 60);
    const s = sec - m * 60;
    return m > 0 ? `${m}:${s.toFixed(2).padStart(5, '0')}` : `${s.toFixed(2)}s`;
}

// ---- replays ---------------------------------------------------------------
// Physics is deterministic in single player, so a run is fully described by its
// per-tick inputs. Each tick's keys are a 4-bit mask (D=1 A=2 S=4 W=8); the log
// is run-length encoded as a letter 'a'..'p' (the mask) + how many ticks it was
// held, e.g. "b34f2". Keep this format in sync with worker/src/accounts.js.
const SR_KEY_BITS = { D: 1, A: 2, S: 4, W: 8 };
const SR_MAX_GHOSTS = 30;       // every ghost needs its own physics instance
const SR_GHOST_ALPHA = 0.45;

function srKeysToMask(keys) {
    let m = 0;
    for (const ch of keys) m |= SR_KEY_BITS[ch] || 0;
    return m;
}

// Same order as _speedrunKeysFor so the physics sees the identical string.
function srMaskToKeys(m) {
    return (m & 1 ? 'D' : '') + (m & 2 ? 'A' : '') + (m & 4 ? 'S' : '') + (m & 8 ? 'W' : '');
}

function encodeSpeedrunReplay(masks) {
    let out = '';
    for (let i = 0; i < masks.length;) {
        let j = i;
        while (j < masks.length && masks[j] === masks[i]) j++;
        out += String.fromCharCode(97 + masks[i]) + (j - i);
        i = j;
    }
    return out;
}

function decodeSpeedrunReplay(str) {
    if (typeof str !== 'string' || !/^(?:[a-p]\d+)+$/.test(str)) return null;
    const masks = [];
    for (const m of str.matchAll(/([a-p])(\d+)/g)) {
        const mask = m[1].charCodeAt(0) - 97, n = parseInt(m[2], 10);
        for (let k = 0; k < n; k++) masks.push(mask);
    }
    return masks;
}

function srHueFor(name) {
    let h = 0;
    for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
    return h % 360;
}

Object.assign(Game.prototype, {
    // ------------------------------------------------------------ data ----
    _speedrunApi() {
        const a = this.accounts;
        return a && a.api ? a : null;
    },

    initSpeedrunData() {
        if (this.speedrunData) return;
        this.speedrun = null;
        this._srHub = null;
        this.speedrunBoardOpen = false;
        this.speedrunData = { records: {}, mine: {}, loaded: false, fetchedAt: 0, fetching: false };
        this._srBoard = { level: null, token: 0 };
    },

    // Best time per level (for the hub labels) + your own bests.
    async refreshSpeedrunData(force) {
        this.initSpeedrunData();
        const d = this.speedrunData;
        const api = this._speedrunApi();
        if (!api || d.fetching) return;
        if (!force && performance.now() - d.fetchedAt < 15000 && d.loaded) return;
        d.fetching = true;
        try {
            const res = await api.api('/api/speedruns');
            if (res.ok && res.data && res.data.records) {
                d.records = res.data.records;
                d.mine = res.data.mine || {};
                d.loaded = true;
            }
        } finally {
            d.fetching = false;
            d.fetchedAt = performance.now();
        }
    },

    _speedrunLevelNameForCode(code) {
        const i = LEVEL_POOL.indexOf(code);
        return i !== -1 ? (LEVEL_NAMES[i] || null) : null;
    },

    // Which stage's platform is the local player standing on (any speed)?
    getHubZoneUnderLocalPlayer() {
        const p = this.players[this.localSeatIndex];
        if (!p || !p.physicsState || !this.stageVoteZones) return -1;
        const px = p.physicsState.PLAYER_X, py = p.physicsState.PLAYER_Y;
        for (let i = 0; i < this.stageVoteZones.length; i++) {
            const z = this.stageVoteZones[i];
            if (Math.abs(px - z.x) <= STAGE_VOTE_ZONE_WIDTH / 2 && Math.abs(py - z.y) <= STAGE_VOTE_ZONE_DEPTH / 2) return i;
        }
        return -1;
    },

    // ------------------------------------------------------ hub drawing ----
    // Best time + holder, drawn above a stage's title in the hub.
    drawSpeedrunRecordLabel(ctx, levelName, centerX, bottomY) {
        const d = this.speedrunData;
        if (!d || !d.loaded || !levelName) return;
        const rec = d.records[levelName];
        const z = this.camera.zoom;
        const text = rec ? `${formatSpeedrunTicks(rec.ticks)}  ·  ${rec.username}` : 'No time yet';
        ctx.save();
        ctx.font = `bold ${Math.max(10, 15 * z)}px ${THEME.font}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'alphabetic';
        ctx.lineJoin = 'round';
        ctx.lineWidth = Math.max(2, 3.5 * z);
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.85)';
        ctx.strokeText(text, centerX, bottomY);
        ctx.fillStyle = rec ? '#ffd24a' : '#aab2c5';
        ctx.fillText(text, centerX, bottomY);
        ctx.restore();
    },

    getSpeedrunHubHint() {
        const idx = this.getHubZoneUnderLocalPlayer();
        const code = idx !== -1 ? this.stageCandidates[idx] : null;
        const name = code ? this._speedrunLevelNameForCode(code) : null;
        const parts = [];
        if (name) {
            const mine = this.speedrunData && this.speedrunData.mine[name];
            parts.push(`R: Speedrun ${name}${mine ? ` (your best ${formatSpeedrunTicks(mine)})` : ''}`);
        }
        parts.push('B: Speedrun leaderboards');
        return parts.join('   |   ');
    },

    // ------------------------------------------------------- run control ----
    _buildSpeedrunWorld(code) {
        const levelData = LevelRenderer.getDataFromCode(code);
        const physics = new AppelPhysics(
            levelData.map, levelData.rotations, levelData.MAP_DATA, levelData.size_x, this._sharedTouching
        );
        const OBJ = physics.spawnOBJ(levelData);
        return { levelData, physics, state: physics.createDefaultGameState(OBJ) };
    },

    startSpeedrunFromHub() {
        this.initSpeedrunData();
        if (this.gameState !== GameState.STAGE_SELECT) return false;
        const idx = this.getHubZoneUnderLocalPlayer();
        const code = idx !== -1 ? this.stageCandidates[idx] : null;
        const name = code ? this._speedrunLevelNameForCode(code) : null;
        if (!name) return false;
        return this._enterSpeedrun(name, code, {});
    },

    // Enter (or switch level within) speedrun mode. opts.watch = { entries, follow,
    // paused } makes it a replay viewer instead of a run you play.
    _enterSpeedrun(name, code, opts) {
        this.initSpeedrunData();
        const me = this.players[this.localSeatIndex];
        if (!name || !code || !me || !me.physicsState || !this.physics) return false;

        if (!this._srHub) {
            this._srHub = {
                physics: this.physics,
                debris: this.debris,
                levelData: this.levelData,
                currentLevelCode: this.currentLevelCode,
                mapSnapshot: this.mapSnapshot,
                mapRotationSnapshot: this.mapRotationSnapshot,
                physicsState: me.physicsState,
                camera: { ...this.camera },
                lookahead: { ...this.cameraLookahead },
                tick: this.tick
            };

            // Step out of the vote: this player no longer counts toward it.
            me.stageCursor = -1;
            me.stageStandStartTime = null;
            if (this.network) {
                this.network.sendStageCursorMove(-1);
                this.network.sendSpeedrunState(true);
            }
            this.stageCountdownActive = false;
            this.stageCountdownStart = null;
        }
        this.speedrun = {
            levelName: name, code, started: false, ticks: 0, finished: false, dead: false, deadFrames: 0,
            result: null, submitting: false, world: null, inputs: [], ghosts: [], watch: (opts && opts.watch) || null
        };

        this.gameState = GameState.SPEEDRUN;
        this.resetSpeedrun(true);
        if (!this.speedrun.watch) this._srEnsureRaceEntries(name);
        return true;
    },

    // ---------------------------------------------------------- replays ----
    _srLevelCode(levelName) {
        const i = LEVEL_NAMES.indexOf(levelName);
        return i !== -1 ? LEVEL_POOL[i] : null;
    },

    async _srFetchReplay(levelName, username) {
        const api = this._speedrunApi();
        if (!api) return null;
        const res = await api.api(`/api/speedruns/replay?level=${encodeURIComponent(levelName)}` +
            (username ? `&user=${encodeURIComponent(username)}` : ''));
        return res.ok && res.data && res.data.replay ? res.data : null;
    },

    async _srFetchReplays(levelName) {
        const api = this._speedrunApi();
        if (!api) return [];
        const res = await api.api(`/api/speedruns/replays?level=${encodeURIComponent(levelName)}&limit=${SR_MAX_GHOSTS}`);
        return res.ok && res.data && Array.isArray(res.data.replays) ? res.data.replays : [];
    },

    _srRaceSpecKey(spec) {
        return spec ? (spec.kind === 'user' ? 'user:' + spec.username : spec.kind) : '';
    },

    _srRaceLabel() {
        const s = this.srRace;
        if (!s) return 'off';
        if (s.kind === 'wr') return 'world record';
        if (s.kind === 'pb') return 'your best';
        return s.username;
    },

    // Fetch the replay(s) the current race setting asks for on this level, then
    // (if the run hasn't begun yet) put the ghosts on the start line.
    async _srEnsureRaceEntries(levelName) {
        const spec = this.srRace;
        if (!spec) return;
        const key = levelName + '|' + this._srRaceSpecKey(spec);
        if (this._srRaceCache && this._srRaceCache.key === key) return;
        const api = this._speedrunApi();
        const user = spec.kind === 'pb' ? (api && api.isLoggedIn ? api.username : null)
            : (spec.kind === 'user' ? spec.username : null);
        let entry = null;
        if (spec.kind !== 'pb' || user) entry = await this._srFetchReplay(levelName, user);
        this._srRaceCache = { key, level: levelName, entries: entry ? [entry] : [] };
        const sr = this.speedrun;
        if (sr && !sr.watch && sr.levelName === levelName && !sr.started && this.srRace === spec) {
            sr.ghosts = this._srBuildGhosts(sr);
        }
    },

    _srBuildGhosts(sr) {
        let entries = [];
        if (sr.watch) entries = sr.watch.entries;
        else if (this.srRace && this._srRaceCache && this._srRaceCache.level === sr.levelName &&
                 this._srRaceCache.key === sr.levelName + '|' + this._srRaceSpecKey(this.srRace)) {
            entries = this._srRaceCache.entries;
        }
        const ghosts = [];
        for (const en of entries.slice(0, SR_MAX_GHOSTS)) {
            const masks = decodeSpeedrunReplay(en.replay);
            if (!masks || !masks.length) continue;
            const world = this._buildSpeedrunWorld(sr.code); // own physics: tile state is per-instance
            // The look the runner had when they set it; old runs fall back to a name-based color.
            const hue = Number.isFinite(en.hue) ? en.hue : srHueFor(en.username);
            const hue2 = Number.isFinite(en.hue2) ? en.hue2 : (Number.isFinite(en.hue) ? en.hue : (hue + 40) % 360);
            const color = typeof hueShiftToHex === 'function' ? hueShiftToHex(hue2) : '#ffffff';
            ghosts.push({ username: en.username, ticks: en.ticks, masks, world, state: world.state, i: 0, done: false,
                hue, hue2, color, skin: typeof en.skin === 'string' ? en.skin : '1' });
        }
        return ghosts;
    },

    _srStepGhost(g) {
        if (g.done) return;
        const ph = g.world.physics;
        ph.tickObj(g.state.OBJ);
        g.state = ph.tick(g.state, srMaskToKeys(g.masks[g.i]));
        ph.tickWorldActive([g.state], [g.state]);
        ph.tileUpdates.length = 0;
        g.i += 1;
        if (g.i >= g.masks.length) g.done = true;
    },

    _srStepGhosts(sr) {
        let any = false;
        for (const g of sr.ghosts) {
            if (!g.done) { this._srStepGhost(g); any = true; }
        }
        return any;
    },

    // Race a saved run (spec: {kind:'wr'} | {kind:'pb'} | {kind:'user', username})
    // on a level; starts a normal speedrun with the ghost alongside.
    raceSpeedrun(levelName, spec) {
        const code = this._srLevelCode(levelName);
        if (!code) return;
        this.srRace = spec;
        this._srRaceCache = null;
        this.closeSpeedrunBoard();
        if (this.gameState !== GameState.STAGE_SELECT && this.gameState !== GameState.SPEEDRUN) return;
        this._enterSpeedrun(levelName, code, {});
    },

    setSpeedrunGhostsOff() {
        this.srRace = null;
        this._srRaceCache = null;
        if (this.speedrun && !this.speedrun.watch) this.speedrun.ghosts = [];
    },

    // Watch replays: usernames = array of players, or null for the fastest PBs
    // all at once.
    async watchSpeedrun(levelName, usernames) {
        const code = this._srLevelCode(levelName);
        const status = this._srEl('srRaceStatus');
        if (!code) return;
        if (status) status.textContent = 'Loading replays...';
        let entries;
        if (usernames) {
            entries = (await Promise.all(usernames.map(u => this._srFetchReplay(levelName, u)))).filter(Boolean);
        } else {
            entries = await this._srFetchReplays(levelName);
        }
        if (!this.speedrunBoardOpen) return; // closed while loading
        if (!entries.length) {
            if (status) status.textContent = 'No replays saved for this level yet.';
            return;
        }
        this.closeSpeedrunBoard();
        if (this.gameState !== GameState.STAGE_SELECT && this.gameState !== GameState.SPEEDRUN) return;
        this._enterSpeedrun(levelName, code, { watch: { entries, follow: 0, paused: false } });
    },

    // (Re)build the level from scratch so every attempt starts from the exact
    // same state, then wait (frozen) for the first input.
    resetSpeedrun(snapCamera) {
        const sr = this.speedrun;
        const me = this.players[this.localSeatIndex];
        if (!sr || !me) return;
        const w = this._buildSpeedrunWorld(sr.code);
        sr.world = w;
        this.physics = w.physics;
        this.levelData = w.levelData;
        // Crumble chunks are visual only: the run's own physics feeds a fresh debris pool, which
        // the renderer draws. (Ghost worlds keep onParticle = null, so they never spawn any.)
        this.debris = new TileDebris(w.levelData);
        w.physics.onParticle = (typ, x, y, src) => this.debris.spawn(typ, x, y, src);
        if (this.renderer) this.renderer.debris = this.debris;
        this.currentLevelCode = sr.code;
        this.mapSnapshot = null;
        this.mapRotationSnapshot = null;
        me.physicsState = w.state;
        sr.started = false;
        sr.ticks = 0;
        sr.finished = false;
        sr.dead = false;
        sr.deadFrames = 0;
        sr.result = null;
        sr.submitting = false;
        sr.inputs = [];
        sr.ghosts = this._srBuildGhosts(sr);
        this.cameraLookahead.x = 0;
        this.cameraLookahead.y = 0;
        if (snapCamera) {
            const c = this.buildCellToWorld(this.getSpawnCell());
            this.camera.x = c.x; this.camera.y = c.y; this.camera.zoom = 1;
            for (let i = 0; i < 60; i++) this.updateRaceCamera();
        }
    },

    exitSpeedrun() {
        const sr = this.speedrun;
        const hub = this._srHub;
        if (!sr || !hub) { this.speedrun = null; this._srHub = null; return; }
        this.speedrun = null;
        this._srHub = null;

        this.physics = hub.physics;
        this.debris = hub.debris;
        if (this.renderer) this.renderer.debris = hub.debris;
        this.levelData = hub.levelData;
        this.currentLevelCode = hub.currentLevelCode;
        this.mapSnapshot = hub.mapSnapshot;
        this.mapRotationSnapshot = hub.mapRotationSnapshot;
        const hubOBJ = hub.physicsState.OBJ;
        const me = this.players[this.localSeatIndex];
        if (me) me.physicsState = hub.physicsState;
        // Anyone who got a physics state while we were away was built from the
        // run's physics; give them one from the hub's.
        for (const p of this.players) {
            if (p && p.physicsState && p.physicsState.OBJ !== hubOBJ) {
                p.physicsState = this.physics.createDefaultGameState(hubOBJ);
            }
        }
        this.camera.x = hub.camera.x; this.camera.y = hub.camera.y; this.camera.zoom = hub.camera.zoom;
        this.cameraLookahead.x = hub.lookahead.x; this.cameraLookahead.y = hub.lookahead.y;
        if (me) { me.stageCursor = -1; me.stageStandStartTime = null; }
        if (this.gameState === GameState.SPEEDRUN) this.gameState = GameState.STAGE_SELECT;
        if (this.network && this.network.isConnected) this.network.sendSpeedrunState(false);
        this.refreshSpeedrunData(true);
    },

    // Called by anything that moves the room out of the hub (stage locked,
    // new round, match end ...): the run is over, put the real state back.
    abortSpeedrunIfActive() {
        if (this.speedrunBoardOpen) this.closeSpeedrunBoard();
        if (this.speedrun) this.exitSpeedrun();
    },

    _speedrunKeysFor(player) {
        const c = player.controls || LOCAL_PLAYER_CONTROLS;
        let keys = '';
        if (c.right.some(k => this.keys[k])) keys += 'D';
        if (c.left.some(k => this.keys[k])) keys += 'A';
        if (c.down.some(k => this.keys[k])) keys += 'S';
        if (c.up.some(k => this.keys[k])) keys += 'W';
        return keys;
    },

    updateSpeedrun() {
        const sr = this.speedrun;
        const me = this.players[this.localSeatIndex];
        if (!sr || !sr.world || !me || !me.physicsState) return;
        if (sr.watch) { this.updateSpeedrunWatch(); return; }

        if (sr.dead) {
            sr.deadFrames += 1;
            if (sr.deadFrames >= SPEEDRUN_DEATH_RESET_FRAMES) this.resetSpeedrun(false);
            return;
        }
        if (sr.finished) { this._srStepGhosts(sr); return; } // let the ghosts finish too

        const keys = this._speedrunKeysFor(me);
        // The world stays frozen until the first input, so every run begins
        // from an identical state and the clock starts on that same tick.
        if (!sr.started) {
            if (!keys) { this.updateRaceCamera(); return; }
            sr.started = true;
            if (typeof playSfx === 'function') playSfx('select');
        }

        sr.inputs.push(srKeysToMask(keys));
        this.physics.tickObj(me.physicsState.OBJ);
        me.physicsState = this.physics.tick(me.physicsState, keys);
        this.drainAchievementEvents(me);
        this.physics.tickWorldActive([me.physicsState], [me.physicsState]);
        if (this.debris) this.debris.step(this.physics);
        this.physics.tileUpdates.length = 0;
        sr.ticks += 1;
        this._srStepGhosts(sr);
        this.updateRaceCamera();

        if (me.physicsState.PLAYER_DEATH) {
            sr.dead = true;
            sr.deadFrames = 0;
            if (typeof playSfx === 'function') playSfx('boom');
            return;
        }
        if (this.physics.isFlagAt(me.physicsState.PLAYER_X, me.physicsState.PLAYER_Y)) {
            sr.finished = true;
            if (typeof playSfx === 'function') playSfx('finish');
            this.submitSpeedrun(sr);
        }
    },

    // Replay viewer: no player, just the ghosts advancing in lockstep.
    updateSpeedrunWatch() {
        const sr = this.speedrun;
        const w = sr.watch;
        if (!w.paused && this._srStepGhosts(sr)) sr.ticks += 1;
        const g = sr.ghosts.length ? sr.ghosts[w.follow % sr.ghosts.length] : null;
        if (!g) return;
        const s = g.state;
        const la = this.updateCameraLookahead(s.PLAYER_SX || 0, s.PLAYER_SY || 0);
        this.camera.x += (s.PLAYER_X + la.x - this.camera.x) * 0.15;
        this.camera.y += ((s.PLAYER_Y + la.y - this.camera.y) - 70) * 0.15;
        this.camera.zoom += (1.25 - this.camera.zoom) * 0.1;
    },

    async submitSpeedrun(sr) {
        const api = this._speedrunApi();
        const ticks = sr.ticks;
        if (!api || !api.isLoggedIn) {
            sr.result = { guest: true, ticks };
            return;
        }
        sr.submitting = true;
        const res = await api.api('/api/speedruns', {
            method: 'POST',
            body: { code: sr.code, ticks, replay: encodeSpeedrunReplay(sr.inputs) }
        });
        sr.submitting = false;
        if (res.ok && res.data.improved) this._srRaceCache = null; // stored PB/WR replay changed
        if (this.speedrun !== sr) return;
        if (res.ok) {
            sr.result = { ticks, ...res.data };
            if (res.data.unlocked && res.data.unlocked.length && this.network) {
                // Same toast the room uses for achievements, then refresh owned skins.
                if (typeof this.network.onAchievementUnlocked === 'function') this.network.onAchievementUnlocked({ achievements: res.data.unlocked });
                if (this.network.isConnected) this.network.sendRefreshSkins();
            }
            if (res.data.improved) this._srEnsureRaceEntries(sr.levelName);
            this.refreshSpeedrunData(true);
        } else {
            sr.result = { ticks, error: (res.data && res.data.error) || 'Could not save your time.' };
        }
    },

    // ----------------------------------------------------------- drawing ----
    speedrunLoop() {
        if (!this.speedrun) { this.gameState = GameState.STAGE_SELECT; return; }
        this.profiler.time('physics', () => this.updateSpeedrun());
        if (this.levelData) {
            this.renderer.render(this.levelData, this.camera, this.tick);
            const t = this.renderer.lastTimings;
            if (t) {
                this.profiler.add('background', t.background || 0);
                this.profiler.add('tiles', t.tiles || 0);
            }
        }
        this.profiler.time('players', () => this.drawSpeedrunEntities());
        this.profiler.time('ui', () => {
            this.drawSpeedrunHud();
            this.drawInputDisplay();
        });
        this.tick += 1;
    },

    drawSpeedrunEntities() {
        const sr = this.speedrun;
        const me = this.players[this.localSeatIndex];
        if (!sr || !me || !me.physicsState) return;

        const followed = sr.watch && sr.ghosts.length ? sr.ghosts[sr.watch.follow % sr.ghosts.length] : null;
        for (const g of sr.ghosts) {
            const s = g.state;
            const gp = {
                x: s.PLAYER_X, y: s.PLAYER_Y, angle: s.direction,
                crouched: s.player_state === 2, onWall: s.player_wall != null, dir: s.PLAYER_DIR
            };
            const alpha = sr.watch ? (g === followed ? 1 : 0.6) : SR_GHOST_ALPHA;
            this.renderer.renderPlayer(gp, this.camera, g.hue, g.hue2, g.username, g.color, g.done ? 'won' : null, alpha, g.skin);
        }
        if (sr.watch) {
            if (followed) this.renderer.renderDynamic(followed.state.OBJ, this.camera);
            return;
        }

        const ps = me.physicsState;
        const pos = {
            x: ps.PLAYER_X, y: ps.PLAYER_Y, angle: ps.direction,
            crouched: ps.player_state === 2, onWall: ps.player_wall != null, dir: ps.PLAYER_DIR
        };
        const status = sr.dead ? 'dead' : (sr.finished ? 'won' : null);
        this.renderer.renderPlayer(pos, this.camera, me.hue, me.hue2, me.name, me.color, status, 1, me.skin);
        this.renderer.renderDynamic(ps.OBJ, this.camera);
    },

    _srText(text, x, y, font, fill, align) {
        const ctx = this.ctx;
        ctx.font = font;
        ctx.textAlign = align || 'center';
        ctx.lineWidth = 4;
        ctx.lineJoin = 'round';
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.8)';
        ctx.strokeText(text, x, y);
        ctx.fillStyle = fill;
        ctx.fillText(text, x, y);
    },

    drawSpeedrunHud() {
        const sr = this.speedrun;
        if (!sr) return;
        const ctx = this.ctx;
        const cx = this.canvas.width / 2;
        const d = this.speedrunData;
        ctx.save();
        ctx.textBaseline = 'alphabetic';

        this._srText(sr.levelName, cx, 26, `bold 16px ${THEME.font}`, '#ffffff');

        if (sr.watch) {
            const w = sr.watch;
            const g = sr.ghosts.length ? sr.ghosts[w.follow % sr.ghosts.length] : null;
            this._srText(w.paused ? `${formatSpeedrunTicks(sr.ticks)}  (paused)` : formatSpeedrunTicks(sr.ticks),
                cx, 66, `bold 40px ${THEME.font}`, '#ffffff');
            if (g) {
                const rank = (w.follow % sr.ghosts.length) + 1;
                this._srText(`Following ${g.username}  ·  ${formatSpeedrunTicks(g.ticks)}  ·  ${rank}/${sr.ghosts.length}`,
                    cx, 90, `bold 13px ${THEME.font}`, '#ffd24a');
            }
            if (!this.chatOpen && !this.helpMenuOpen && !this.userSettingsOpen) {
                ctx.font = `11px ${THEME.font}`;
                ctx.textAlign = 'center';
                ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
                ctx.fillText('Tab: Next runner   |   Space: Pause   |   R: Restart   |   B: Leaderboard   |   Enter: Back to hub', cx, this.canvas.height - 10);
            }
            ctx.restore();
            return;
        }

        if (sr.ghosts.length) {
            const g0 = sr.ghosts[0];
            const label = sr.ghosts.length === 1
                ? `Racing ${g0.username}  ·  ${formatSpeedrunTicks(g0.ticks)}`
                : `Racing ${sr.ghosts.length} runners`;
            this._srText(label, cx, 122, `bold 12px ${THEME.font}`, '#9ad0ff');
        }

        const timerColor = sr.finished ? THEME.success : (sr.dead ? THEME.danger : '#ffffff');
        const timerText = sr.dead ? 'DEAD' : formatSpeedrunTicks(sr.ticks);
        this._srText(timerText, cx, 66, `bold 40px ${THEME.font}`, timerColor);
        if (!sr.dead) this._srText(`${sr.ticks} ticks`, cx, 84, `12px ${THEME.font}`, '#c7d1e6');

        const wr = d && d.records[sr.levelName];
        const pb = d && d.mine[sr.levelName];
        const refs = [];
        if (wr) refs.push(`Record ${formatSpeedrunTicks(wr.ticks)} (${wr.username})`);
        if (pb) refs.push(`Your best ${formatSpeedrunTicks(pb)}`);
        if (refs.length) this._srText(refs.join('   |   '), cx, 104, `bold 12px ${THEME.font}`, '#ffd24a');

        if (!sr.started && !sr.finished && !sr.dead) {
            this._srText('Press a movement key to start the clock', cx, this.canvas.height / 2 - 30, `bold 20px ${THEME.font}`, '#ffffff');
        }

        if (sr.finished) {
            const r = sr.result;
            const lines = [`Finished in ${formatSpeedrunTicks(sr.ticks)}  (${sr.ticks} ticks)`];
            let color = THEME.success;
            if (!r || sr.submitting) lines.push('Saving...');
            else if (r.guest) lines.push('Log in to save your times to the leaderboard');
            else if (r.error) { lines.push(r.error); color = THEME.warning; }
            else if (r.isRecord && r.improved) lines.push('NEW RECORD!');
            else if (r.improved) lines.push(`New personal best  -  rank #${r.rank}`);
            else lines.push(`Your best is ${formatSpeedrunTicks(r.best)}  -  rank #${r.rank}`);
            const boxW = 440, boxH = 36 + lines.length * 28;
            const bx = cx - boxW / 2, by = this.canvas.height / 2 - boxH / 2 - 20;
            ctx.fillStyle = 'rgba(8, 10, 16, 0.78)';
            ctx.fillRect(bx, by, boxW, boxH);
            ctx.strokeStyle = color;
            ctx.lineWidth = 2;
            ctx.strokeRect(bx, by, boxW, boxH);
            lines.forEach((t, i) => {
                ctx.font = (i === 0 ? 'bold 22px ' : 'bold 16px ') + THEME.font;
                ctx.textAlign = 'center';
                ctx.fillStyle = i === 0 ? '#ffffff' : color;
                ctx.fillText(t, cx, by + 34 + i * 28);
            });
        }

        if (!this.chatOpen && !this.helpMenuOpen && !this.userSettingsOpen) {
            ctx.font = `11px ${THEME.font}`;
            ctx.textAlign = 'center';
            ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
            ctx.fillText((this.speedrun.finished ? 'Enter: Back to hub   |   ' : '') + 'R: Reset   |   B: Leaderboard   |   /exit: Back to hub   |   H: Controls', cx, this.canvas.height - 10);
        }
        ctx.restore();
    },

    // -------------------------------------------------------- input hooks ----
    // Returns true if the key was consumed.
    handleSpeedrunKey(e) {
        this.initSpeedrunData();
        if (this.speedrunBoardOpen) {
            this.handleSpeedrunBoardKey(e);
            return true;
        }
        const watching = this.gameState === GameState.SPEEDRUN && this.speedrun && this.speedrun.watch;
        if (watching && e.code === 'Tab') {
            e.preventDefault();
            if (!e.repeat) this.speedrun.watch.follow += 1;
            return true;
        }
        if (watching && e.code === 'Space') {
            e.preventDefault();
            if (!e.repeat) this.speedrun.watch.paused = !this.speedrun.watch.paused;
            return true;
        }
        if (e.code === 'KeyB' && !e.repeat &&
            (this.gameState === GameState.STAGE_SELECT || this.gameState === GameState.SPEEDRUN)) {
            e.preventDefault();
            const lvl = this.speedrun ? this.speedrun.levelName : this._levelNameUnderPlayer();
            this.openSpeedrunBoard(lvl);
            return true;
        }
        if (e.code === 'KeyR' && !e.repeat) {
            if (this.gameState === GameState.SPEEDRUN) {
                e.preventDefault();
                this.resetSpeedrun(false);
                return true;
            }
            if (this.gameState === GameState.STAGE_SELECT) {
                e.preventDefault();
                this.startSpeedrunFromHub();
                return true;
            }
        }
        // Enter returns to the hub once the run is finished (Esc is left alone:
        // it exits fullscreen). /exit works at any time.
        if ((e.code === 'Enter' || e.code === 'NumpadEnter') && this.gameState === GameState.SPEEDRUN &&
            this.speedrun && (this.speedrun.finished || this.speedrun.watch)) {
            e.preventDefault();
            this.exitSpeedrun();
            return true;
        }
        return false;
    },

    _levelNameUnderPlayer() {
        const idx = this.getHubZoneUnderLocalPlayer();
        const code = idx !== -1 ? this.stageCandidates[idx] : null;
        return code ? this._speedrunLevelNameForCode(code) : null;
    },

    // ------------------------------------------------------- leaderboard ----
    _srEl(id) { return document.getElementById(id); },

    openSpeedrunBoard(levelName) {
        this.initSpeedrunData();
        const root = this._srEl('speedrunBoard');
        if (!root) return;
        const select = this._srEl('srLevelSelect');
        if (!this._srBoardWired) {
            this._srBoardWired = true;
            select.innerHTML = '';
            LEVEL_NAMES.forEach(n => {
                const o = document.createElement('option');
                o.value = n; o.textContent = n;
                select.appendChild(o);
            });
            select.addEventListener('change', () => { this.loadSpeedrunBoard(select.value); select.blur(); });
            this._srEl('srPrev').addEventListener('click', () => this.stepSpeedrunBoard(-1));
            this._srEl('srNext').addEventListener('click', () => this.stepSpeedrunBoard(1));
            this._srEl('srClose').addEventListener('click', () => this.closeSpeedrunBoard());
            this._srEl('srWatchAll').addEventListener('click', () => this.watchSpeedrun(this._srBoard.level, null));
            this._srEl('srRaceWR').addEventListener('click', () => this.raceSpeedrun(this._srBoard.level, { kind: 'wr' }));
            this._srEl('srRacePB').addEventListener('click', () => {
                const api = this._speedrunApi();
                if (!api || !api.isLoggedIn) { this._srEl('srRaceStatus').textContent = 'Log in to race your own best.'; return; }
                this.raceSpeedrun(this._srBoard.level, { kind: 'pb' });
            });
            this._srEl('srGhostOff').addEventListener('click', () => {
                this.setSpeedrunGhostsOff();
                this._srUpdateRaceStatus();
            });
        }
        this._srUpdateRaceStatus();
        this.speedrunBoardOpen = true;
        this.keys = {};
        // Not voting while looking at the board: step out of the stage vote.
        if (this.gameState === GameState.STAGE_SELECT) {
            const me = this.players[this.localSeatIndex];
            if (me) { me.stageCursor = -1; me.stageStandStartTime = null; }
            this.stageCountdownActive = false;
            this.stageCountdownStart = null;
            if (this.network) {
                this.network.sendStageCursorMove(-1);
                this.network.sendSpeedrunState(true);
            }
        }
        root.style.display = 'flex';
        this.loadSpeedrunBoard(levelName && LEVEL_NAMES.includes(levelName) ? levelName : (this._srBoard.level || LEVEL_NAMES[0]));
    },

    _srUpdateRaceStatus() {
        const el = this._srEl('srRaceStatus');
        if (el) el.textContent = this.srRace ? `Ghost: ${this._srRaceLabel()}` : '';
    },

    closeSpeedrunBoard() {
        const wasOpen = this.speedrunBoardOpen;
        this.speedrunBoardOpen = false;
        this.keys = {};
        if (wasOpen && this.gameState === GameState.STAGE_SELECT && this.network) this.network.sendSpeedrunState(false);
        const root = this._srEl('speedrunBoard');
        if (root) root.style.display = 'none';
    },

    stepSpeedrunBoard(dir) {
        const i = LEVEL_NAMES.indexOf(this._srBoard.level);
        const n = LEVEL_NAMES.length;
        if (!n) return;
        this.loadSpeedrunBoard(LEVEL_NAMES[(i + dir + n) % n]);
    },

    handleSpeedrunBoardKey(e) {
        if (e.code === 'Escape' || e.code === 'KeyB' || e.code === 'Enter' || e.code === 'NumpadEnter') {
            e.preventDefault();
            this.closeSpeedrunBoard();
        } else if (e.code === 'ArrowLeft' || e.code === 'KeyA') {
            e.preventDefault();
            this.stepSpeedrunBoard(-1);
        } else if (e.code === 'ArrowRight' || e.code === 'KeyD') {
            e.preventDefault();
            this.stepSpeedrunBoard(1);
        }
    },

    async loadSpeedrunBoard(levelName) {
        const b = this._srBoard;
        b.level = levelName;
        const token = ++b.token;
        const select = this._srEl('srLevelSelect');
        select.value = levelName;
        const body = this._srEl('srBody');
        const sub = this._srEl('srSub');
        const note = this._srEl('srNote');
        const api = this._speedrunApi();
        body.innerHTML = '<tr><td colspan="6" class="srMsg">Loading...</td></tr>';
        sub.textContent = '';
        note.textContent = api && api.isLoggedIn
            ? ''
            : 'Log in from the main menu to put your times on the leaderboards.';
        if (!api) { body.innerHTML = '<tr><td colspan="6" class="srMsg">Leaderboards are unavailable.</td></tr>'; return; }

        const res = await api.api(`/api/speedruns/board?level=${encodeURIComponent(levelName)}&limit=100`);
        if (token !== b.token) return; // a newer request superseded this one
        if (!res.ok) {
            body.innerHTML = '';
            const tr = document.createElement('tr');
            const td = document.createElement('td');
            td.colSpan = 6; td.className = 'srMsg';
            td.textContent = (res.data && res.data.error) || 'Could not load the leaderboard.';
            tr.appendChild(td); body.appendChild(tr);
            return;
        }
        const data = res.data;
        // Equal times share a rank (1, 1, 3). Recomputed here from the ticks so
        // it is right regardless of how the server numbered the rows.
        let tieRank = 0, tieTicks = null;
        data.entries.forEach((en, i) => {
            if (en.ticks !== tieTicks) { tieRank = i + 1; tieTicks = en.ticks; }
            en.rank = tieRank;
        });
        if (data.me) {
            const first = data.entries.findIndex(en => en.ticks === data.me.ticks);
            if (first !== -1) data.me.rank = data.entries[first].rank;
        }
        sub.textContent = `${data.total} ${data.total === 1 ? 'runner' : 'runners'}` +
            (data.me ? `  ·  your best ${formatSpeedrunTicks(data.me.ticks)} (#${data.me.rank})` : '');
        body.innerHTML = '';
        if (!data.entries.length) {
            body.innerHTML = '<tr><td colspan="6" class="srMsg">No times yet. Be the first!</td></tr>';
            return;
        }
        const myName = api.username;
        const addRow = (rank, name, ticks, when, hasReplay) => {
            const tr = document.createElement('tr');
            if (myName && name === myName) tr.className = 'srMe';
            if (rank <= 3) tr.classList.add('srTop' + rank);
            const cells = [
                rank,
                name,
                formatSpeedrunTicks(ticks),
                ticks,
                when ? new Date(when).toLocaleDateString() : ''
            ];
            cells.forEach((c, i) => {
                const td = document.createElement('td');
                td.textContent = c; // usernames are user-controlled: never innerHTML
                if (i === 3) td.className = 'srTicks';
                tr.appendChild(td);
            });
            const acts = document.createElement('td');
            acts.className = 'srActs';
            if (hasReplay) {
                const watch = document.createElement('button');
                watch.className = 'secondary';
                watch.textContent = 'Watch';
                watch.addEventListener('click', () => this.watchSpeedrun(levelName, [name]));
                const race = document.createElement('button');
                race.className = 'secondary';
                race.textContent = 'Race';
                race.addEventListener('click', () => this.raceSpeedrun(levelName, { kind: 'user', username: name }));
                acts.appendChild(watch);
                acts.appendChild(race);
            }
            tr.appendChild(acts);
            body.appendChild(tr);
        };
        data.entries.forEach(en => addRow(en.rank, en.username, en.ticks, en.achievedAt, en.hasReplay));
        if (data.me && myName && !data.entries.some(en => en.username === myName)) {
            const gap = document.createElement('tr');
            gap.innerHTML = '<td colspan="6" class="srMsg">...</td>';
            body.appendChild(gap);
            addRow(data.me.rank, myName, data.me.ticks, null, data.me.hasReplay);
        }
    }
});
