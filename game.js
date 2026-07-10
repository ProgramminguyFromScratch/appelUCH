// Game state machine states:
//   MENU           - start screen is showing (HTML overlay); nothing on canvas yet
//   LOADING        - assets are being fetched; loading bar is drawn
//   STAGE_SELECT   - picking the stage/level for the whole match (real
//                    screen: each player cursors over 3 candidates and
//                    confirms independently). Only happens once, right
//                    after LOADING — not revisited between rounds.
//   PARTY_BOX      - pre-round item/loadout selection (real screen: each
//                    player cursors over revealed piece slots and grabs
//                    one; auto-assigned on a countdown if they're too slow)
//   BUILD          - build phase (real screen: each player positions the
//                    single piece they grabbed in PARTY_BOX on a
//                    grid-snapped cursor and places it, manually or via
//                    the build countdown expiring). Pieces placed here
//                    stay on the map for the rest of the match — they
//                    accumulate round over round rather than resetting.
//   RACE           - actual gameplay (the old "PLAY" state)
//   ROUND_RESULTS  - end-of-round results screen: each player's outcome
//                    (finished/eliminated/DNF), points earned this round,
//                    and an animated running-total bar per player
//   FINAL_RESULTS  - end-of-match screen: final totals, the winner (or a
//                    tie), and a "play again" action
//
// The full loop is:
//   STAGE_SELECT -> PARTY_BOX -> BUILD -> RACE -> ROUND_RESULTS ->
//   (loop back to PARTY_BOX for the next round, or FINAL_RESULTS after
//   the last round)
// STAGE_SELECT only happens once, before the first round of a match —
// every later round reuses the same stage/map (with whatever's been
// built onto it so far), going straight from ROUND_RESULTS into the
// next round's PARTY_BOX. A new STAGE_SELECT only happens again when a
// brand new match starts (see playAgain()).
//
// ROUND_RESULTS and FINAL_RESULTS are still advanced with the Enter key
// (continue / play again) rather than a dedicated confirm control.
const GameState = {
    MENU: 'MENU',
    // NETWORK REFACTOR: sits between MENU and LOADING. Covers name entry
    // (handled by the HTML overlay, same pattern as the old startScreen),
    // create/join-by-code, and the lobby screen (connected players + a
    // host-only Start button) once a room is joined. Only reachable when
    // a NetworkClient was actually passed into the Game constructor —
    // an offline `new Game('gameCanvas', n)` with no network arg skips
    // straight from MENU to LOADING exactly like before.
    LOBBY: 'LOBBY',
    LOADING: 'LOADING',
    STAGE_SELECT: 'STAGE_SELECT',
    PARTY_BOX: 'PARTY_BOX',
    BUILD: 'BUILD',
    RACE: 'RACE',
    ROUND_RESULTS: 'ROUND_RESULTS',
    FINAL_RESULTS: 'FINAL_RESULTS'
};

// N-PLAYER REFACTOR: player-count bounds. 1 supports a solo
// practice/testing run, 6 is the ceiling everything below (party box
// slot count, hue/color tables, etc) is sized against.
const MIN_PLAYERS = 1;
const MAX_PLAYERS = 6;

// N-PLAYER REFACTOR: this is the only seat driven by the local keyboard
// in this pass. Every other seat (index 1..MAX_PLAYERS-1) gets
// `controls: null` and is an idle stand-in / simple bot purely so the
// N-player code paths (party box, build, race, scoring, camera) get
// exercised without real input. This is intentionally the seam where
// networking plugs in later: a remote player gets its own input source
// instead of `controls`, or a second local player could reuse a
// different key map here for couch co-op again (see the callout in the
// accompanying notes about this being a real behavior change from the
// old always-2-local-players setup).
const LOCAL_PLAYER_CONTROLS = {
    left: 'KeyA',
    right: 'KeyD',
    up: 'KeyW',
    down: 'KeyS',
    rotateCCW: 'KeyQ',
    rotateCW: 'KeyE',
    confirm: 'ShiftLeft'
};

// Shared visual theme. Every screen (loading, stage select, party box,
// build, race HUD, results) pulls its colors/fonts from here so the
// game reads as one consistent product instead of a pile of
// independently-styled placeholder screens.
const THEME = {
    bg: '#0b0d13',
    panel: 'rgba(255, 255, 255, 0.05)',
    panelBorder: 'rgba(255, 255, 255, 0.14)',
    panelBorderActive: '#3aa0ff',
    text: '#f4f6fb',
    textMuted: '#8891a3',
    accent: '#3aa0ff',
    // N-PLAYER REFACTOR: THEME.p1/p2 and THEME.p1Hue/p2Hue are gone —
    // every screen that used to reach for those two fixed names now
    // indexes into these two parallel 6-entry arrays by seatIndex
    // instead (playerColors[seatIndex] for UI/labels/sprites-that-don't-
    // hue-shift, playerHues[seatIndex] fed into LevelRenderer's
    // hue-shift, still 0-200 mapping to a full 360° rotation — see
    // levelRenderer.js). Index 0 is unchanged from the old p1/p1Hue
    // (native palette, no shift) and index 1 is unchanged from the old
    // p2/p2Hue, so a 2-player match still looks exactly like before.
    playerColors: ['#3aa0ff', '#ff5470', '#4ade80', '#fbbf24', '#a78bfa', '#38bdf8'],
    playerHues: [0, 34, 67, 100, 133, 167],
    success: '#4ade80',
    warning: '#ffb454',
    danger: '#ff5470',
    font: 'Arial, sans-serif'
};

// Size of each stage card on the STAGE_SELECT screen, shared between
// drawStageSelectScreen() (which lays out the cards) and
// enterStageSelect() (which pre-renders thumbnails to fit inside them).
const STAGE_SELECT_BOX_WIDTH = 170;
const STAGE_SELECT_BOX_HEIGHT = 100;

// Pool of level codes STAGE_SELECT draws its 3 candidates from. Short
// pool for now — grow this as more levels get built.
const LEVEL_POOL = [
    "1234713196Z2Z591Z1Z4Z9Z2Z1Z1Z2Z3Z1Z183Z2Z3Z1Z7Z2Z3Z1Z183Z2Z3Z1Z7Z2Z3Z1Z183Z2Z3Z1Z7Z2Z3Z1Z184Z76Z1Z1Z9Z63Z1Z1Z36836ZZ1Z38416ZZZZ62Z67.67",
    "1234741196Z2Z588Z1Z5Z76Z1Z1Z194Z4Z1Z1Z394Z4Z1Z1Z386Z4Z1Z1Z7Z4Z1Z1Z386Z4Z1Z1Z585Z4Z1Z1Z394Z63Z1Z1Z35469ZZ1Z788Z3Z1Z1Z394Z3Z1Z1Z386Z3Z1Z1Z7Z3Z1Z1Z386Z3Z1Z1Z585Z3Z1Z1Z35864ZZZZ62Z67.67",
    "1234797196Z2Z588Z1Z1Z76Z1Z1Z1Z9Z1Z1Z2Z2Z1Z1Z193Z9Z1Z1Z1Z2Z1Z1Z189Z2Z4Z1Z195Z9Z1Z1Z192Z5Z1Z2Z1Z1Z195Z2Z1Z9Z1Z1Z194Z2Z5Z1Z194Z9Z1Z1Z195Z2Z1Z1Z391Z2Z1Z1Z391Z2Z1Z1Z195Z63Z1Z1Z35275ZZ1Z788Z3Z1Z1Z583Z2Z1Z1Z197Z2Z1Z1Z393Z3Z1Z1Z36451ZZZZ62Z67.67"
];

class Game {
    // N-PLAYER REFACTOR: new `playerCount` param, clamped to
    // [MIN_PLAYERS, MAX_PLAYERS] and defaulting to 2 so an unmodified
    // `new Game('gameCanvas')` call behaves exactly like the old
    // always-2-player game.
    //
    // NETWORK REFACTOR: new optional `network` param — a NetworkClient
    // instance (see network.js). When present, the game is played over
    // the wire: STAGE_SELECT/PARTY_BOX/BUILD state for every seat other
    // than `this.localSeatIndex` is driven entirely by server events
    // (bindNetwork() below), and playerCount/this.players gets rebuilt
    // from the server's ROOM_STATE once the lobby is joined rather than
    // trusted from this constructor arg. When `network` is omitted, the
    // game behaves exactly as before (fully local/offline, seat 0 is
    // always the local keyboard player).
    constructor(canvasId, playerCount = 2, network = null) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
        
        this.canvas.width = 960;
        this.canvas.height = 540;

        this.renderer = new LevelRenderer(this.canvas);
        this.levelData = null;
        this.physics = null;
        // Frozen copy of the map exactly as BUILD left it each round —
        // see snapshotBuiltMap()/resetRoundState().
        this.mapSnapshot = null;
        this.mapRotationSnapshot = null;

        // N-PLAYER REFACTOR: this.playerState / this.playerState2 and
        // every other parallel P1/P2 field (scores, cursors, build
        // state, pieces, ...) collapse into this single array. See
        // createPlayers() for the shape of each entry.
        this.playerCount = Math.max(MIN_PLAYERS, Math.min(MAX_PLAYERS, Math.floor(playerCount) || 2));

        // NETWORK REFACTOR: which index into this.players is driven by
        // this browser's own keyboard. Defaults to 0 (matches the old
        // always-local-seat-0 behavior). In networked play this gets
        // overwritten once the server responds to JOIN_ROOM with
        // SEAT_ASSIGNED (see bindNetwork()/handleSeatAssigned()).
        this.localSeatIndex = 0;
        this.players = this.createPlayers(this.playerCount, this.localSeatIndex);

        this.camera = { x: 0, y: 0, zoom: 1.25};
        this.keys = {};
        this.tick = 0;
        // Starts in MENU since the HTML start screen is up and startGame()
        // hasn't been called yet. See the GameState enum above the class
        // for the full list of states.
        this.gameState = GameState.MENU;

        // NETWORK REFACTOR: NetworkClient instance (network.js), or null
        // for fully offline/local play. All wiring lives in bindNetwork()
        // so the rest of the class only has to check `if (this.network)`
        // at the handful of places behavior actually forks.
        this.network = network;
        this.roomCode = null;
        this.isHost = false;

        // NETWORK REFACTOR: remote seats are no longer resimulated
        // locally from relayed keys (that required every client to
        // reproduce every other client's physics frame-for-frame off a
        // lossy keys relay, and a single dropped/late frame permanently
        // desynced that seat vs. everyone else's view of it — which is
        // also why finish/death corroboration kept failing and rounds
        // only ever ended by timeout). Instead each client just sends
        // its own authoritative position every tick (sendPositionSnapshot)
        // and every other client paints that seat exactly where it says
        // it is. seatIndex -> {x, y, sx, sy, tick}.
        this.remotePositions = new Map();

        if (this.network) {
            this.bindNetwork();
        }

        this.profiler = new PerformanceMonitor();

        // Tracks how many consecutive frames all active players have been
        // finished, so we can wait ~1 second (at the 30fps tick rate)
        // before moving on to ROUND_RESULTS.
        this.roundEndFrames = 0;
        this.ROUND_END_DELAY_FRAMES = 30;

        // Per-round countdown. Reset to RACE_TIME_LIMIT whenever a round
        // enters RACE (see resetRoundState()), and ticked down once per
        // frame in raceLoop() while gameState === RACE. Any player who
        // hasn't finished by the time it hits 0 is eliminated (DNF).
        this.RACE_TIME_LIMIT = 60; // seconds
        this.raceTimeRemaining = this.RACE_TIME_LIMIT;

        this.assetsLoadedCount = 0;
        this.totalAssets = 201; // 172 tiles + 2 player + 1 bg + 1 json + 24 wall + 1 dynamic

        // Total rounds in a full match (1 + 10 more, matching the real
        // game), plus the round we're currently on. currentRound is what
        // lets the temporary ROUND_RESULTS -> STAGE_SELECT/FINAL_RESULTS
        // transition below decide whether the match is over.
        this.totalRounds = 11;
        this.currentRound = 1;

        // Upper bound the running-total bars scale against, so the bar
        // fill is stable frame-to-frame rather than rescaling every
        // round. 3 points is the max a single round can award (see
        // awardRoundPoints()). Running match score, this-round points,
        // and the pre-round snapshot used to animate the bars all now
        // live per-player on this.players (score / lastRoundPoints /
        // scoreBeforeRound) instead of the old this.scores /
        // this.scoresBeforeThisRound / this.lastRoundPoints P1/P2 objects.
        this.MAX_POSSIBLE_SCORE = this.totalRounds * 3;

        // ROUND_RESULTS display state.
        this.roundResultsAnimFrames = 0;
        this.ROUND_RESULTS_ANIM_FRAMES = 15;

        // STAGE_SELECT state: the 3 candidate level codes drawn from
        // LEVEL_POOL for the current selection. Each player's cursor into
        // that array now lives on the player object (stageCursor).
        // Populated by enterStageSelect().
        this.stageCandidates = [];
        // levelCode -> offscreen <canvas> thumbnail, rendered once per
        // code the first time it's needed (see generateStageThumbnail())
        // and reused for the rest of the session instead of re-rendering
        // every frame.
        this.stageThumbnails = new Map();

        // PARTY_BOX state: the revealed piece slots (drawn from
        // PIECE_POOL, see pieces.js) and the pick countdown. Each
        // player's cursor/grabbed piece now live on the player object
        // (partyCursor / piece). Populated by enterPartyBox().
        // N-PLAYER REFACTOR: bumped 5 -> 8 so 6 players always have real
        // distinct choices (5 slots for 6 players meant somebody's last
        // pick couldn't possibly be a free choice).
        this.PARTY_BOX_SLOT_COUNT = 8;
        this.PARTY_TIME_LIMIT = 12; // seconds (10–15s window)
        this.partySlots = [];
        this.partyTimeRemaining = this.PARTY_TIME_LIMIT;

        // BUILD state: the build countdown. Each player's grid-snapped
        // cursor, rotation, and placed flag now live on the player
        // object (buildCursor / buildRotation / buildPlaced). Populated
        // by enterBuild(), which runs once every player holds a piece
        // (see checkPartyBoxComplete() / autoAssignRemainingPartyPicks()).
        this.BUILD_TIME_LIMIT = 20; // seconds
        this.buildTimeRemaining = this.BUILD_TIME_LIMIT;

        if (typeof replayCode !== 'undefined' && replayCode) {
            this.decodedReplayCode = decodeReplayCode(replayCode);
        }

        window.addEventListener('keydown', e => {
            this.keys[e.code] = true;

            if (this.gameState === GameState.STAGE_SELECT) {
                this.handleStageSelectInput(e.code);
            } else if (this.gameState === GameState.PARTY_BOX) {
                this.handlePartyBoxInput(e.code);
            } else if (this.gameState === GameState.BUILD) {
                this.handleBuildInput(e.code);
            }

            // Enter advances ROUND_RESULTS -> next round's PARTY_BOX (or
            // FINAL_RESULTS after the last round), and FINAL_RESULTS ->
            // play again (back to MENU). STAGE_SELECT, PARTY_BOX, and
            // BUILD are driven by the per-player confirm keys (and, for
            // BUILD, the countdown timer) instead — not by Enter.
            if (e.code === 'Enter') {
                this.advanceFromPlaceholder();
            }
        });
        window.addEventListener('keyup', e => {
            this.keys[e.code] = false;
        });
    }

    // N-PLAYER REFACTOR: builds the this.players array. Each entry holds
    // everything that used to be a parallel this.xxxP1/this.xxxP2 (or
    // this.scores.p1/p2, etc) field.
    //
    // NETWORK REFACTOR: `controls` now goes to whichever seatIndex equals
    // `localSeatIndex` (defaults to 0, same as the old always-seat-0
    // behavior) instead of being hardcoded to seat 0 — in networked play
    // the server can assign this client any seat. Every other seat is a
    // network-driven remote player (or, if `this.network` is null, the
    // same idle stand-in/bot it always was).
    createPlayers(count, localSeatIndex = 0) {
        const players = [];
        for (let seatIndex = 0; seatIndex < count; seatIndex++) {
            players.push({
                id: seatIndex + 1,
                seatIndex,
                name: `P${seatIndex + 1}`,
                color: THEME.playerColors[seatIndex],
                hue: THEME.playerHues[seatIndex],
                controls: seatIndex === localSeatIndex ? LOCAL_PLAYER_CONTROLS : null,
                isBot: seatIndex !== localSeatIndex,


                // RACE (physics-owned; see physics.js — AppelPhysics.tick()
                // reads/returns exactly this object and doesn't know or
                // care about any of the other fields below).
                physicsState: null,

                // STAGE_SELECT / PARTY_BOX / BUILD per-player UI state.
                stageCursor: 0,
                partyCursor: 0,
                piece: null,
                buildCursor: { col: 0, row: 0 },
                buildRotation: 0,
                buildPlaced: false,

                // Round/match outcome + scoring.
                score: 0,
                scoreBeforeRound: 0,
                lastRoundPoints: 0,
                eliminated: false,
                hasFinished: false,
                dnf: false,
                finishTick: null,
                reportedFinish: false,
                reportedElimination: false
            });
        }
        return players;
    }

    // Enters STAGE_SELECT: draws 3 candidate levels from LEVEL_POOL and
    // resets every player's cursor to the first candidate.
    enterStageSelect() {
        this.stageCandidates = this.pickStageCandidates(3);
        this.players.forEach(p => { p.stageCursor = 0; });
        this.gameState = GameState.STAGE_SELECT;

        // Pre-render each candidate's thumbnail now so the screen doesn't
        // hitch generating them on its first draw (see
        // generateStageThumbnail(), which is also called lazily from
        // drawStageSelectScreen() in case any of these misses the cache).
        // Dimensions here must match the thumbW/thumbH computed in
        // drawStageSelectScreen() (from STAGE_SELECT_BOX_WIDTH/HEIGHT)
        // since the cache key is just the level code.
        const thumbW = STAGE_SELECT_BOX_WIDTH - 16;
        const thumbH = STAGE_SELECT_BOX_HEIGHT - 30;
        this.stageCandidates.forEach(code => this.generateStageThumbnail(code, thumbW, thumbH));
    }

    // Renders a small full-level overview for STAGE_SELECT, caching the
    // result per level code in this.stageThumbnails so it's only ever
    // rendered once. Draws its own fully-zoomed-out grid rather than
    // reusing LevelRenderer.render(): that method's camera clamp (see
    // levelRenderer.js) assumes a gameplay viewport that's zoomed in and
    // never needs to look past the level's edges, which fights a
    // thumbnail that wants the *entire* level, zoomed far out, centered.
    // It does reuse the already-loaded/hued tileset images via the main
    // renderer's getHuedTileset(), so there's no duplicate asset loading.
    generateStageThumbnail(levelCode, width = 150, height = 74) {
        if (this.stageThumbnails.has(levelCode)) return this.stageThumbnails.get(levelCode);
        if (!this.renderer.assetsLoaded) return null;

        const levelData = LevelRenderer.getDataFromCode(levelCode);
        if (!levelData) return null;

        const cols = levelData.size_x;
        const rows = Math.floor(levelData.map.length / cols);
        const hue = this.renderer.fixHue(levelData.hue);
        const activeTileset = this.renderer.getHuedTileset(hue);

        const thumbCanvas = document.createElement('canvas');
        thumbCanvas.width = width;
        thumbCanvas.height = height;
        const ctx = thumbCanvas.getContext('2d');

        ctx.fillStyle = THEME.bg;
        ctx.fillRect(0, 0, width, height);

        // Fit the whole grid inside the thumbnail (uniform scale, so
        // tiles stay square), with a small margin and centered.
        const MARGIN = 0.9;
        const tile = Math.min(width / cols, height / rows) * MARGIN;
        const gridW = cols * tile;
        const gridH = rows * tile;
        const offsetX = (width - gridW) / 2;
        const offsetY = (height - gridH) / 2;

        // render()'s world space has row 0 at the *bottom* (tileY gets
        // more negative, i.e. visually higher, as row increases — see
        // levelRenderer.js), so flip vertically here to match how the
        // level actually looks in RACE rather than mirroring it.
        for (let row = 0; row < rows; row++) {
            const rowBase = row * cols;
            const screenRow = rows - 1 - row;
            for (let col = 0; col < cols; col++) {
                const rawTileVal = levelData.map[rowBase + col];
                if (!rawTileVal) continue;

                const tileImg = activeTileset[rawTileVal - 1];
                if (!tileImg) continue;

                ctx.drawImage(tileImg, offsetX + col * tile, offsetY + screenRow * tile, tile, tile);
            }
        }

        this.stageThumbnails.set(levelCode, thumbCanvas);
        return thumbCanvas;
    }

    // Picks up to `count` distinct level codes at random from LEVEL_POOL.
    pickStageCandidates(count) {
        const pool = [...LEVEL_POOL];
        const picks = [];
        const n = Math.min(count, pool.length);
        for (let i = 0; i < n; i++) {
            const idx = Math.floor(Math.random() * pool.length);
            picks.push(pool.splice(idx, 1)[0]);
        }
        return picks;
    }

    // Per-keydown handling while STAGE_SELECT is active. N-PLAYER
    // REFACTOR: loops every player with a `controls` map (today, only
    // seatIndex 0) instead of two hardcoded key branches.
    //
    // NETWORK REFACTOR: only ever loops the local player now — remote
    // seats' `controls` is always null (see createPlayers()), so they
    // were already implicitly skipped; this comment just makes that
    // explicit since it's now load-bearing rather than incidental.
    // Locally the cursor still moves immediately for responsiveness, but
    // when `this.network` is set, moves/confirms are also sent to the
    // server and the *server's* STAGE_CURSOR_MOVE/STAGE_LOCKED events
    // (routed through onStageState in bindNetwork()) are what actually
    // update every seat's displayed cursor and lock in the stage —
    // local mutation here is prediction, not authority. Without a
    // network, this function stays fully authoritative exactly as before.
    handleStageSelectInput(code) {
        const numCandidates = this.stageCandidates.length;
        if (numCandidates === 0) return;

        for (const player of this.players) {
            if (!player.controls) continue; // idle stand-in / bot seat / remote seat

            if (code === player.controls.left) {
                player.stageCursor = (player.stageCursor - 1 + numCandidates) % numCandidates;
                if (this.network) this.network.sendStageCursorMove(player.stageCursor);
            } else if (code === player.controls.right) {
                player.stageCursor = (player.stageCursor + 1) % numCandidates;
                if (this.network) this.network.sendStageCursorMove(player.stageCursor);
            } else if (code === player.controls.confirm) {
                if (this.network) {
                    this.network.sendStagePickRequest(player.stageCursor);
                } else {
                    this.confirmStageSelection(player.stageCursor);
                }
            }
        }
    }

    // Locks in the candidate at `index`, loads it, and moves on to
    // PARTY_BOX. Guarded by the gameState check so a near-simultaneous
    // confirm from another player can't double-fire once we've already
    // left STAGE_SELECT.
    confirmStageSelection(index) {
        if (this.gameState !== GameState.STAGE_SELECT) return;
        const chosenCode = this.stageCandidates[index];
        this.loadLevel(chosenCode);
        this.enterPartyBox();
    }

    // Enters PARTY_BOX: reveals PARTY_BOX_SLOT_COUNT piece slots from
    // PIECE_POOL (more slots than players, so there's real choice),
    // resets every player's cursor/pick, and starts the pick countdown.
    enterPartyBox() {
        this.partySlots = this.pickPartySlots(this.PARTY_BOX_SLOT_COUNT);
        this.players.forEach(p => {
            p.partyCursor = 0;
            p.piece = null;
        });
        this.partyTimeRemaining = this.PARTY_TIME_LIMIT;
        this.gameState = GameState.PARTY_BOX;
    }

    // Draws `count` piece slots at random from PIECE_POOL (pieces.js).
    // Sampled with replacement — a party box showing the same piece
    // type more than once is expected, unlike STAGE_SELECT's distinct
    // level candidates.
    pickPartySlots(count) {
        const slots = [];
        for (let i = 0; i < count; i++) {
            const piece = PIECE_POOL[Math.floor(Math.random() * PIECE_POOL.length)];
            slots.push(piece);
        }
        return slots;
    }

    // Per-keydown handling while PARTY_BOX is active. N-PLAYER
    // REFACTOR: same loop-over-controlled-players shape as
    // handleStageSelectInput(). Cursor movement still skips over
    // already-taken (null) slots so players can't get stuck pointing at
    // an empty one.
    //
    // NETWORK REFACTOR: same predict-locally-then-defer-to-server pattern
    // as handleStageSelectInput() — local movement/pick is optimistic,
    // the server's PARTY_CURSOR_MOVE/PARTY_PICK_RESULT (via onPartyState)
    // is authoritative once a network is attached.
    handlePartyBoxInput(code) {
        if (this.partySlots.length === 0) return;

        for (const player of this.players) {
            if (!player.controls) continue;

            if (code === player.controls.left) {
                player.partyCursor = this.findNextPartySlot(player.partyCursor, -1);
                if (this.network) this.network.sendPartyCursorMove(player.partyCursor);
            } else if (code === player.controls.right) {
                player.partyCursor = this.findNextPartySlot(player.partyCursor, 1);
                if (this.network) this.network.sendPartyCursorMove(player.partyCursor);
            } else if (code === player.controls.confirm) {
                if (this.network) {
                    this.network.sendPartyPickRequest(player.partyCursor);
                } else {
                    this.confirmPartyPick(player);
                }
            }
        }
    }

    // Walks from `fromIndex` in `direction` (+1/-1) around this.partySlots,
    // wrapping, and returns the index of the next non-null (still
    // available) slot. Falls back to `fromIndex` if every slot is taken.
    findNextPartySlot(fromIndex, direction) {
        const n = this.partySlots.length;
        for (let step = 1; step <= n; step++) {
            const idx = ((fromIndex + direction * step) % n + n) % n;
            if (this.partySlots[idx]) return idx;
        }
        return fromIndex;
    }

    // Grabs the piece under `player`'s cursor, if any and if they
    // haven't already picked one, then removes the slot so nobody else
    // can also take it.
    confirmPartyPick(player) {
        const slot = this.partySlots[player.partyCursor];
        if (!slot) return; // cursor on an already-taken slot
        if (player.piece) return; // already picked

        player.piece = slot;
        console.log(`${player.name} grabbed ${slot.name}`);

        this.partySlots[player.partyCursor] = null;
        this.checkPartyBoxComplete();
    }

    // Once every player holds exactly one piece, move on to BUILD.
    checkPartyBoxComplete() {
        if (this.players.every(p => p.piece)) {
            this.enterBuild();
        }
    }

    // Called once the pick countdown hits 0: any player who hasn't
    // grabbed a piece yet gets a random remaining slot instead. This is
    // also what makes the idle bot seats work today — they never send a
    // confirm key, so they always fall through to auto-assignment here.
    autoAssignRemainingPartyPicks() {
        for (const player of this.players) {
            if (!player.piece) {
                this.autoAssignPartyPick(player);
            }
        }
        this.checkPartyBoxComplete();
    }

    autoAssignPartyPick(player) {
        const remainingIndices = this.partySlots
            .map((slot, idx) => (slot ? idx : -1))
            .filter(idx => idx !== -1);
        if (remainingIndices.length === 0) return; // shouldn't happen — more slots than players

        const pick = remainingIndices[Math.floor(Math.random() * remainingIndices.length)];
        const slot = this.partySlots[pick];

        player.piece = slot;
        this.partySlots[pick] = null;
        console.log(`${player.name} ran out of time — auto-assigned ${slot.name}`);
    }

    // Enters BUILD: resets the countdown/placement flags, gives every
    // player's cursor a starting cell near the level's spawn point, and
    // resets their rotation. Called once every player holds a piece (see
    // checkPartyBoxComplete()).
    enterBuild() {
        this.buildTimeRemaining = this.BUILD_TIME_LIMIT;

        const startCell = this.findPlaceableCellNear(this.getSpawnCell());
        this.players.forEach(p => {
            p.buildRotation = 0;
            p.buildPlaced = false;
            p.buildCursor = { ...startCell };
        });

        this.gameState = GameState.BUILD;
    }

    // The level's spawn tile (value 76), as a {col, row} grid cell —
    // used as the anchor BUILD cursors start near. Falls back to the
    // grid's center if a level somehow has no spawn tile.
    getSpawnCell() {
        const cols = this.levelData.size_x;
        const spawnIdx = this.physics.MAP.indexOf(76);
        if (spawnIdx >= 0) {
            return { col: spawnIdx % cols, row: Math.floor(spawnIdx / cols) };
        }
        const rows = Math.floor(this.physics.MAP.length / cols);
        return { col: Math.floor(cols / 2), row: Math.floor(rows / 2) };
    }

    // Converts a {col, row} grid cell to its index into this.physics.MAP
    // (and this.levelData.map — same underlying array, see loadLevel()).
    buildCellIndex(cell) {
        return cell.col + cell.row * this.levelData.size_x;
    }

    // Finds the nearest placeable cell to `cell` (itself included),
    // searching outward ring by ring. Spawn tiles aren't placeable
    // themselves (they're not empty), so this is what turns a spawn
    // location into a valid starting cursor position in enterBuild().
    // Falls back to `cell` unchanged if nothing placeable exists anywhere
    // in the level (shouldn't happen on a real level).
    findPlaceableCellNear(cell) {
        const cols = this.levelData.size_x;
        const rows = Math.floor(this.physics.MAP.length / cols);
        const maxRadius = Math.max(cols, rows);

        for (let radius = 0; radius <= maxRadius; radius++) {
            for (let dc = -radius; dc <= radius; dc++) {
                for (let dr = -radius; dr <= radius; dr++) {
                    if (Math.max(Math.abs(dc), Math.abs(dr)) !== radius) continue;
                    const c = cell.col + dc, r = cell.row + dr;
                    if (c < 0 || c >= cols || r < 0 || r >= rows) continue;
                    if (this.physics.isPlaceableCell(this.buildCellIndex({ col: c, row: r }))) {
                        return { col: c, row: r };
                    }
                }
            }
        }
        return { ...cell };
    }

    // Per-keydown handling while BUILD is active. N-PLAYER REFACTOR:
    // same loop-over-controlled-players shape as the other two input
    // handlers, plus a rotate key per player. Each player's input is
    // ignored once they've placed.
    //
    // NETWORK REFACTOR: same predict-locally pattern. Cursor/rotation
    // moves are still applied to the local player immediately (so the
    // ghost preview doesn't lag a round trip) and mirrored to the server
    // via sendBuildCursorMove(); placement, though, is *not* applied
    // locally when networked — placeBuildPiece() writes tiles into
    // this.physics.MAP directly, and only the server's authoritative
    // PLACE_PIECE_RESULT/FORCE_PLACE mapPatch (via onBuildState) is
    // allowed to do that, so two clients' maps can't diverge.
    handleBuildInput(code) {
        for (const player of this.players) {
            if (!player.controls) continue;
            if (!player.piece || player.buildPlaced) continue;

            const c = player.controls;
            let moved = false;
            if (code === c.up) { this.moveBuildCursor(player, 0, 1); moved = true; }
            else if (code === c.down) { this.moveBuildCursor(player, 0, -1); moved = true; }
            else if (code === c.left) { this.moveBuildCursor(player, -1, 0); moved = true; }
            else if (code === c.right) { this.moveBuildCursor(player, 1, 0); moved = true; }
            else if (code === c.rotateCCW) { this.rotateBuildPiece(player, -1); moved = true; }
            else if (code === c.rotateCW) { this.rotateBuildPiece(player, 1); moved = true; }
            else if (code === c.confirm) {
                if (this.network) {
                    this.network.sendPlacePieceRequest(
                        player.piece.id, player.buildCursor.col, player.buildCursor.row, player.buildRotation
                    );
                } else {
                    this.confirmBuildPlacement(player);
                }
            }

            if (moved && this.network) {
                this.network.sendBuildCursorMove(player.buildCursor.col, player.buildCursor.row, player.buildRotation);
            }
        }
    }

    // Moves `player`'s cursor one grid-snapped step in the (dCol, dRow)
    // direction, skipping over any cell in that direction where the
    // player's whole piece (at its current rotation, not just the
    // anchor cell) wouldn't fit, until it finds one (or the level edge,
    // in which case the cursor just doesn't move — same "stay put"
    // fallback as findNextPartySlot).
    moveBuildCursor(player, dCol, dRow) {
        const cursor = player.buildCursor;
        const next = this.findNextPlaceableCell(cursor.col, cursor.row, dCol, dRow, player.piece, player.buildRotation);
        if (next) {
            cursor.col = next.col;
            cursor.row = next.row;
        }
    }

    // Walks from (col, row) in the (dCol, dRow) direction until it finds
    // a cell whose full footprint (piece + rotation, anchored at that
    // cell) is placeable. Falls back to a plain single-cell check when
    // no piece is given (mirrors the old single-tile-only behavior).
    findNextPlaceableCell(col, row, dCol, dRow, piece, rotation) {
        const cols = this.levelData.size_x;
        const rows = Math.floor(this.physics.MAP.length / cols);
        let c = col + dCol;
        let r = row + dRow;
        while (c >= 0 && c < cols && r >= 0 && r < rows) {
            const candidate = { col: c, row: r };
            const fits = piece
                ? this.footprintFits(this.getPieceWorldCells(piece, rotation, candidate))
                : this.physics.isPlaceableCell(this.buildCellIndex(candidate));
            if (fits) return candidate;
            c += dCol;
            r += dRow;
        }
        return null;
    }

    // Quarter-turns `player`'s piece rotation (0-3) by `delta` (+1/-1),
    // then — since rotating a multi-tile piece can swing part of it into
    // a wall or off the grid even though the anchor cell itself is still
    // fine — snaps the cursor to the nearest cell where the newly
    // rotated footprint fits, if the current cell no longer works.
    rotateBuildPiece(player, delta) {
        player.buildRotation = ((player.buildRotation + delta) % 4 + 4) % 4;
        this.ensureFootprintFits(player);
    }

    // Converts a piece's rotated footprint (see pieces.js's
    // getPieceFootprintCells()) into actual grid cells anchored at
    // `anchorCell`, each carrying the tile value that belongs there.
    getPieceWorldCells(piece, rotation, anchorCell) {
        return getPieceFootprintCells(piece, rotation).map(cellOffset => ({
            col: anchorCell.col + cellOffset.dCol,
            row: anchorCell.row + cellOffset.dRow,
            tile: cellOffset.tile
        }));
    }

    // Whether every cell in `cells` is in-bounds and placeable — i.e.
    // whether a piece's whole footprint (not just its anchor cell) would
    // fit there.
    footprintFits(cells) {
        const cols = this.levelData.size_x;
        const rows = Math.floor(this.physics.MAP.length / cols);
        return cells.every(cell => {
            if (cell.col < 0 || cell.col >= cols || cell.row < 0 || cell.row >= rows) return false;
            return this.physics.isPlaceableCell(this.buildCellIndex(cell));
        });
    }

    // Multi-tile counterpart to findPlaceableCellNear(): finds the
    // nearest anchor cell (searching outward ring by ring, `cell`
    // included) where the piece's whole rotated footprint fits. Returns
    // null if nothing works anywhere in the level (shouldn't happen on
    // a real level with room for the piece).
    findPlaceableFootprintNear(piece, rotation, cell) {
        const cols = this.levelData.size_x;
        const rows = Math.floor(this.physics.MAP.length / cols);
        const maxRadius = Math.max(cols, rows);

        for (let radius = 0; radius <= maxRadius; radius++) {
            for (let dc = -radius; dc <= radius; dc++) {
                for (let dr = -radius; dr <= radius; dr++) {
                    if (Math.max(Math.abs(dc), Math.abs(dr)) !== radius) continue;
                    const candidate = { col: cell.col + dc, row: cell.row + dr };
                    if (this.footprintFits(this.getPieceWorldCells(piece, rotation, candidate))) {
                        return candidate;
                    }
                }
            }
        }
        return null;
    }

    // Re-snaps `player`'s cursor to the nearest cell where their piece
    // (at its current rotation) fully fits, if it doesn't fit where the
    // cursor currently sits. Called after rotating (see
    // rotateBuildPiece()) since that can change the footprint's shape
    // without the cursor itself moving.
    ensureFootprintFits(player) {
        if (!player.piece) return;
        const cursor = player.buildCursor;
        const rotation = player.buildRotation;

        if (this.footprintFits(this.getPieceWorldCells(player.piece, rotation, cursor))) return;

        const snapped = this.findPlaceableFootprintNear(player.piece, rotation, cursor);
        if (snapped) {
            cursor.col = snapped.col;
            cursor.row = snapped.row;
        }
    }

    // Places `player`'s piece at their cursor's current position/
    // rotation, marks them as placed, and checks whether BUILD is done.
    // Called both from the confirm key and (via buildLoop()) when the
    // build timer runs out — same code path either way, since a timeout
    // just means "place it wherever it currently is" rather than
    // skipping placement.
    confirmBuildPlacement(player) {
        if (player.buildPlaced) return;
        this.placeBuildPiece(player);
        player.buildPlaced = true;
        this.checkBuildComplete();
    }

    // Writes `player`'s piece into the level's map (and rotation) array
    // at their cursor's cell, covering every cell in the piece's rotated
    // footprint (see pieces.js's getPieceFootprintCells()) — a single
    // write for 1x1 pieces, several for multi-tile ones like
    // platform_triple. If the whole footprint doesn't fit where the
    // cursor currently sits (only really possible if this player never
    // moved off their shared starting cell and another player already
    // placed there), snaps to the nearest anchor cell where it does fit
    // instead of partially overwriting whatever's already there.
    placeBuildPiece(player) {
        const piece = player.piece;
        let cursor = player.buildCursor;
        const rotation = player.buildRotation;
        if (!piece) return;

        let cells = this.getPieceWorldCells(piece, rotation, cursor);
        if (!this.footprintFits(cells)) {
            const snapped = this.findPlaceableFootprintNear(piece, rotation, cursor);
            if (snapped) {
                cursor = snapped;
                cells = this.getPieceWorldCells(piece, rotation, cursor);
            }
        }

        for (const cell of cells) {
            if (!this.physics.isPlaceableCell(this.buildCellIndex(cell))) continue;
            const idx = this.buildCellIndex(cell);
            this.physics.MAP[idx] = cell.tile;
            this.physics.MAP_R[idx] = rotation;
        }

        console.log(`${player.name} placed ${piece.name} at (${cursor.col}, ${cursor.row}) rot ${rotation}`);
    }

    // Once every active player has placed (by choice or by timeout),
    // move on to RACE.
    checkBuildComplete() {
        const allDone = this.players.every(p => !p.piece || p.buildPlaced);
        if (allDone) {
            this.snapshotBuiltMap();
            this.gameState = GameState.RACE;
            this.resetRoundState();
        }
    }

    // Freezes the map exactly as BUILD left it (spawn tile + everything
    // placed this round and every round before it), so resetRoundState()
    // has a clean copy to restore before each RACE. Without this, tiles
    // that physics.js mutates in place while racing — crumble platforms
    // decaying (tickCrumble(), tile 34/46 -> ~1) and springs toggling
    // (tickActive(), tile 42<->43) — stayed mutated on this.physics.MAP
    // forever, so a level could start its next round with crumble tiles
    // already half (or fully) broken from the previous round.
    snapshotBuiltMap() {
        if (!this.physics) return;
        this.mapSnapshot = this.physics.MAP.slice();
        this.mapRotationSnapshot = this.physics.MAP_R.slice();
    }

    // Clears per-round finish/elimination tracking so a new race starts
    // clean: nobody is marked as finished/eliminated/DNF, the round-end
    // wait timer is back at zero, the race clock is reset to the full
    // time limit, and every player is put back at the level's spawn
    // point (rather than wherever they ended the previous round).
    // N-PLAYER REFACTOR: hasFinished/eliminated/dnf/finishTick now live
    // on the player wrapper rather than on the physics state object
    // itself, so (unlike the old version, which got this "for free" by
    // replacing the whole playerState object) they need to be reset
    // explicitly here alongside physicsState.
    resetRoundState() {
        this.roundEndFrames = 0;
        this.raceTimeRemaining = this.RACE_TIME_LIMIT;

        // Undo any in-place tile mutations physics.js made while racing
        // last round (crumble decay, spring toggles, etc — see
        // snapshotBuiltMap()) before this round's physics runs. Falls
        // back to leaving the map alone if somehow no snapshot exists
        // yet (shouldn't happen past the very first BUILD).
        if (this.physics && this.mapSnapshot) {
            for (let i = 0; i < this.mapSnapshot.length; i++) {
                this.physics.MAP[i] = this.mapSnapshot[i];
                this.physics.MAP_R[i] = this.mapRotationSnapshot[i];
            }
            // Also drop any in-progress shared crumble tracking (see
            // physics.js's tickWorldActive()) — otherwise a tile that
            // was mid-crumble when the round ended would resume its old
            // frame count against the just-restored (intact) tile next
            // round instead of starting fresh, and could immediately
            // vanish again without anyone touching it.
            this.physics.worldActiveIdx.length = 0;
            this.physics.worldActiveTyp.length = 0;
            this.physics.worldActiveFrame.length = 0;
            this.physics.worldActiveSpawn.length = 0;
        }

        // Grab the shared lift/object array before we replace anyone's
        // physicsState, so the fresh states keep pointing at the same
        // OBJ reference.
        const anyExisting = this.players.find(p => p.physicsState);
        const sharedOBJ = anyExisting ? anyExisting.physicsState.OBJ : null;

        this.players.forEach(p => {
            p.eliminated = false;
            p.hasFinished = false;
            p.dnf = false;
            p.finishTick = null;
            p.reportedFinish = false;
            p.reportedElimination = false;
            if (p.physicsState) {
                p.physicsState = this.physics.createDefaultGameState(sharedOBJ);
            }
        });

        this.remotePositions.clear();
    }

    // Enter/continue handling for the two results screens. ROUND_RESULTS
    // advances to the next round's PARTY_BOX — the stage/map is picked
    // once at STAGE_SELECT (see checkLoadStatus()) and stays the same
    // for every round of the match, so continuing does NOT re-run
    // enterStageSelect()/loadLevel(): that would wipe out any pieces
    // placed in earlier rounds' BUILD phases. Anything players build
    // accumulates on the same map round over round until the match ends
    // (or FINAL_RESULTS once the last round is done); FINAL_RESULTS
    // triggers the play-again flow (see playAgain()).
    //
    // NETWORK REFACTOR: when networked, Enter only *requests* the
    // transition (CONTINUE_REQUEST / PLAY_AGAIN_REQUEST); the actual
    // state change happens in handleRoundResult()/handleMatchEnd()/
    // net.onRematchStarting once the server confirms it, same
    // predict-vs-authority split as everywhere else.
    advanceFromPlaceholder() {
        if (this.network) {
            if (this.gameState === GameState.ROUND_RESULTS) this.network.sendContinueRequest();
            else if (this.gameState === GameState.FINAL_RESULTS) this.network.sendPlayAgainRequest();
            return;
        }
        switch (this.gameState) {
            case GameState.ROUND_RESULTS:
                if (this.currentRound >= this.totalRounds) {
                    this.gameState = GameState.FINAL_RESULTS;
                } else {
                    this.currentRound += 1;
                    this.enterPartyBox();
                }
                break;
            case GameState.FINAL_RESULTS:
                this.playAgain();
                break;
            default:
                // No manual transition out of MENU, LOBBY, LOADING,
                // STAGE_SELECT, PARTY_BOX, BUILD, or RACE via Enter —
                // STAGE_SELECT, PARTY_BOX, and BUILD are driven by their
                // own per-player confirm keys (and, for BUILD, the
                // countdown timer).
                break;
        }
    }

    // Resets the match back to a clean slate and returns to MENU, where
    // the HTML title screen overlay lets the player start a new match
    // (see game.html) — same entry point as the very first launch.
    playAgain() {
        this.players.forEach(p => {
            p.score = 0;
            p.scoreBeforeRound = 0;
            p.lastRoundPoints = 0;
            p.physicsState = null;
            p.eliminated = false;
            p.hasFinished = false;
            p.dnf = false;
            p.finishTick = null;
            p.piece = null;
            p.buildPlaced = false;
        });
        this.currentRound = 1;
        this.gameState = GameState.MENU;

        const startScreen = document.getElementById('startScreen');
        if (startScreen) {
            startScreen.style.display = 'flex';
        }
    }

    // Called from the title screen once the player hits Play.
    startGame(levelCode) {
        this.gameState = GameState.LOADING;
        this.init(levelCode);
    }

    // NETWORK REFACTOR: called once MATCH_STARTING arrives (see
    // bindNetwork()'s handling — wired up from game.html once the
    // lobby's host presses Start). No level code is known yet — the
    // server only picks stage candidates once every seat is past
    // LOADING (see Room.js's enterStageSelectFromLoading()) — so this
    // just starts asset loading; loadLevel() itself doesn't run until
    // STAGE_LOCKED arrives (see handleStageNetworkEvent()).
    startGameNetworked() {
        this.gameState = GameState.LOADING;
        this.init(null);
    }

    // Loads a level by code: builds the physics world and fresh player
    // states for it. Callable on its own, per round, without redoing the
    // one-time asset loading that init() also handles on first launch.
    loadLevel(levelCode) {
        this.levelData = LevelRenderer.getDataFromCode(levelCode);

        this.physics = new AppelPhysics(
            this.levelData.map,
            this.levelData.rotations,
            this.levelData.MAP_DATA,
            this.levelData.size_x
        );

        // Cleared here (rather than just left stale from a previous
        // match) so the very first BUILD of a fresh stage snapshots the
        // real just-decoded map instead of leftover state — see
        // snapshotBuiltMap()/resetRoundState().
        this.mapSnapshot = null;
        this.mapRotationSnapshot = null;

        // Spawn the moving-lift objects once, and share that same array
        // reference across every player's physicsState so there's only
        // ever one set of lifts to advance per frame.
        const sharedOBJ = this.physics.spawnOBJ(this.levelData);
        this.players.forEach(p => {
            p.physicsState = this.physics.createDefaultGameState(sharedOBJ);
        });
    }

    // NETWORK REFACTOR: `levelCode` is now optional. When omitted (only
    // ever happens from startGameNetworked()), asset loading still runs
    // exactly the same but loadLevel() is skipped — there's no map to
    // build physics from until the server tells us which stage won
    // (STAGE_LOCKED, see handleStageNetworkEvent()).
    init(levelCode) {
        if (levelCode) {
            this.loadLevel(levelCode);

            if (this.physics.touching && this.physics.touching.loadPromise) {
                this.physics.touching.loadPromise.then(() => {
                    this.assetsLoadedCount++;
                });
            } else {
                this.assetsLoadedCount++;
            }
        } else {
            // Nothing physics-side to wait on yet — this slot of
            // totalAssets is satisfied immediately so LOADING only
            // blocks on the renderer's real asset fetches below.
            this.assetsLoadedCount++;
        }

        this.renderer.loadAssets(() => {
            this.assetsLoadedCount++;
        });

        // Guard against starting a second frame-loop interval: init() runs
        // again after playAgain() -> MENU -> startGame() for a new match,
        // but the very first interval set up below is still alive and
        // already reads whatever this.gameState currently is, so a
        // second one would just double the effective frame rate.
        if (this._loopStarted) return;
        this._loopStarted = true;

        const fps = 30;
        const frameDuration = 1000 / fps;
        let lastFrameTime = performance.now(); 

        setInterval(() => {
            const now = performance.now();
            const delta = now - lastFrameTime;
            if (delta >= frameDuration - 1) {
                lastFrameTime = now;

                if (this.gameState === GameState.LOADING) {
                    this.checkLoadStatus();
                    this.drawLoadingScreen();
                } else {
                    this.gameLoop();
                }
            }
        }, 1);
    }

    // NETWORK REFACTOR: offline play still self-transitions straight to
    // STAGE_SELECT (enterStageSelect() picks its own candidates locally,
    // unchanged). Networked play instead sends CLIENT_READY once, then
    // waits — the transition to STAGE_SELECT only happens when the
    // server's STAGE_SELECT_START arrives (handleStageNetworkEvent()).
    checkLoadStatus() {
        if (this.assetsLoadedCount < this.totalAssets) return;

        if (this.network) {
            if (!this._clientReadySent) {
                this._clientReadySent = true;
                console.log("All assets loaded. Telling server we're ready.");
                this.network.sendClientReady();
            }
        } else {
            this.enterStageSelect();
            console.log("All assets loaded. Entering stage select.");
        }
    }

    drawLoadingScreen() {
        this.ctx.fillStyle = THEME.bg;
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        this.ctx.fillStyle = THEME.text;
        this.ctx.textAlign = "center";
        this.ctx.font = "bold 28px " + THEME.font;
        this.ctx.fillText("Appel", this.canvas.width / 2, this.canvas.height / 2 - 60);

        const width = 300;
        const height = 14;
        const x = (this.canvas.width - width) / 2;
        const y = (this.canvas.height - height) / 2;

        const progress = Math.min(1, this.assetsLoadedCount / this.totalAssets);

        this.roundRectPath(x, y, width, height, 7);
        this.ctx.fillStyle = THEME.panel;
        this.ctx.fill();
        this.ctx.strokeStyle = THEME.panelBorder;
        this.ctx.lineWidth = 1.5;
        this.ctx.stroke();

        if (progress > 0) {
            this.roundRectPath(x, y, Math.max(height, width * progress), height, 7);
            this.ctx.fillStyle = THEME.accent;
            this.ctx.fill();
        }

        this.ctx.fillStyle = THEME.textMuted;
        this.ctx.font = "14px " + THEME.font;
        this.ctx.fillText(`Loading... ${Math.floor(progress * 100)}%`, this.canvas.width / 2, y - 14);
    }

    // ---- Shared UI helpers -------------------------------------------
    // Every non-RACE screen (loading, stage select, party box, build,
    // results) is built out of these so the whole game reads as one
    // consistent product rather than a pile of separately-styled screens.

    // Traces a rounded-rect path without filling/stroking it, so callers
    // can set fillStyle/strokeStyle first (mirrors the browser's native
    // roundRect, which isn't guaranteed available everywhere yet).
    roundRectPath(x, y, w, h, r) {
        const radius = Math.min(r, w / 2, h / 2);
        this.ctx.beginPath();
        this.ctx.moveTo(x + radius, y);
        this.ctx.arcTo(x + w, y, x + w, y + h, radius);
        this.ctx.arcTo(x + w, y + h, x, y + h, radius);
        this.ctx.arcTo(x, y + h, x, y, radius);
        this.ctx.arcTo(x, y, x + w, y, radius);
        this.ctx.closePath();
    }

    // Full-bleed background fill, used by every screen that isn't drawn
    // on top of the level itself (STAGE_SELECT, PARTY_BOX, results).
    fillBackground() {
        this.ctx.fillStyle = THEME.bg;
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }

    // Big centered screen title, same size/weight everywhere.
    drawScreenTitle(text) {
        this.ctx.textAlign = "center";
        this.ctx.font = "bold 26px " + THEME.font;
        this.ctx.fillStyle = THEME.text;
        this.ctx.fillText(text, this.canvas.width / 2, 44);
    }

    // Persistent "Round X of 11" pill, pinned to the top-left corner of
    // every STAGE_SELECT/PARTY_BOX/BUILD/results screen — same shape and
    // position the results screens already anchor their own round number
    // to, just factored out so it's identical everywhere instead of only
    // matching by coincidence.
    drawRoundBadge() {
        const text = `Round ${this.currentRound} of ${this.totalRounds}`;
        this.ctx.font = "bold 13px " + THEME.font;
        const textWidth = this.ctx.measureText(text).width;
        const paddingX = 12;
        const boxW = textWidth + paddingX * 2;
        const boxH = 26;
        const x = 16, y = 16;

        this.roundRectPath(x, y, boxW, boxH, boxH / 2);
        this.ctx.fillStyle = THEME.panel;
        this.ctx.fill();
        this.ctx.strokeStyle = THEME.panelBorder;
        this.ctx.lineWidth = 1;
        this.ctx.stroke();

        this.ctx.textAlign = "left";
        this.ctx.fillStyle = THEME.textMuted;
        this.ctx.fillText(text, x + paddingX, y + boxH / 2 + 4);
        this.ctx.textAlign = "center";
    }

    // Consistent circular countdown ring, pinned to the top-right corner
    // of every timed screen (PARTY_BOX, BUILD) — same style the plain
    // fillText timer used to have per-screen, now unified into one
    // widget so all three phases feel like the same game.
    drawCountdownRing(remaining, limit) {
        const cx = this.canvas.width - 40;
        const cy = 30;
        const radius = 20;
        const urgent = remaining <= 3;
        const fraction = limit > 0 ? Math.max(0, Math.min(1, remaining / limit)) : 0;

        this.ctx.save();
        this.ctx.lineWidth = 4;
        this.ctx.strokeStyle = THEME.panelBorder;
        this.ctx.beginPath();
        this.ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        this.ctx.stroke();

        this.ctx.strokeStyle = urgent ? THEME.danger : THEME.accent;
        this.ctx.lineCap = "round";
        this.ctx.beginPath();
        this.ctx.arc(cx, cy, radius, -Math.PI / 2, -Math.PI / 2 + fraction * Math.PI * 2);
        this.ctx.stroke();
        this.ctx.restore();

        this.ctx.textAlign = "center";
        this.ctx.font = "bold 15px " + THEME.font;
        this.ctx.fillStyle = urgent ? THEME.danger : THEME.text;
        this.ctx.fillText(`${Math.ceil(remaining)}`, cx, cy + 5);
    }

    // Small vector "level" icon for a STAGE_SELECT candidate — a stylized
    // peak-with-flag glyph plus a number badge, standing in for a real
    // level thumbnail until one exists.
    drawLevelIcon(cx, cy, size, index) {
        this.ctx.save();
        this.ctx.translate(cx, cy);

        this.ctx.beginPath();
        this.ctx.moveTo(-size / 2, size / 3);
        this.ctx.lineTo(0, -size / 3);
        this.ctx.lineTo(size / 2, size / 3);
        this.ctx.closePath();
        this.ctx.fillStyle = THEME.panel;
        this.ctx.fill();
        this.ctx.strokeStyle = THEME.accent;
        this.ctx.lineWidth = 2;
        this.ctx.stroke();

        this.ctx.strokeStyle = THEME.text;
        this.ctx.lineWidth = 1.5;
        this.ctx.beginPath();
        this.ctx.moveTo(0, -size / 3);
        this.ctx.lineTo(0, -size * 0.68);
        this.ctx.stroke();

        this.ctx.beginPath();
        this.ctx.moveTo(0, -size * 0.68);
        this.ctx.lineTo(size * 0.26, -size * 0.58);
        this.ctx.lineTo(0, -size * 0.48);
        this.ctx.closePath();
        // N-PLAYER REFACTOR: this used to hardcode THEME.p2 for the flag
        // glyph — it was never actually "player 2's" flag, just reusing
        // that color value. Uses THEME.accent now so it doesn't imply a
        // player-2-specific meaning that isn't there.
        this.ctx.fillStyle = THEME.accent;
        this.ctx.fill();

        this.ctx.restore();

        this.ctx.fillStyle = THEME.textMuted;
        this.ctx.font = "12px " + THEME.font;
        this.ctx.fillText(`Stage ${index + 1}`, cx, cy + size / 3 + 20);
    }

    // N-PLAYER REFACTOR: replaces getInputKeysP1()/getInputKeysP2().
    // Bot/idle-stand-in seats (player.controls === null, no network
    // attached) always return no input — physics.tick() still runs for
    // them every frame (see update()), they just never move, which is
    // exactly the "simple bots that don't move" behavior asked for in
    // that pass.
    //
    // NETWORK REFACTOR: the local seat is the *only* seat whose physics
    // this client ever simulates. It reads keys from local keyboard
    // state exactly as before. Every other seat is a remote player whose
    // position arrives pre-simulated over the wire (see
    // handleRemotePositionSync()/onPositionSync) — this client never
    // guesses at their movement from relayed keys anymore, so there's
    // nothing here for it to resimulate or desync.
    getInputKeysFor(player) {
        if (this.gameState !== GameState.RACE) return "";
        if (player.hasFinished) return "";
        if (!player.controls) return ""; // remote seat or idle bot — not simulated locally

        let keys = '';

        if (this.decodedReplayCode) {
            keys = this.decodedReplayCode[this.tick];
        }

        if (this.keys[player.controls.right]) keys += 'D';
        if (this.keys[player.controls.left]) keys += 'A';
        if (this.keys[player.controls.down]) keys += 'S';
        if (this.keys[player.controls.up]) keys += 'W';

        return keys;
    }

    // NETWORK REFACTOR: called for every POSITION_SYNC from the server
    // (another seat's sendPositionSnapshot(), relayed back out to
    // everyone). Just remembers the latest known pose for that seat —
    // position AND how they're currently oriented (rotation/facing/
    // crouch/wall-cling) — so update() can paint them exactly as their
    // own client sees them instead of just sliding a sprite around that
    // never spins or flips.
    handleRemotePositionSync(payload) {
        if (payload.seatIndex === this.localSeatIndex) return; // that's just our own echo
        this.remotePositions.set(payload.seatIndex, {
            x: payload.x, y: payload.y, sx: payload.sx, sy: payload.sy, tick: payload.tick,
            direction: payload.direction, dir: payload.dir,
            crouched: !!payload.crouched, onWall: !!payload.onWall
        });
    }

    update() {
        const firstPlayer = this.players[0];
        if (!this.physics || !firstPlayer || !firstPlayer.physicsState) return;

        // Advance the shared moving-lift objects exactly once per frame,
        // regardless of how many players are active.
        this.physics.tickObj(firstPlayer.physicsState.OBJ);

        this.players.forEach((player) => {
            const isRemoteNetworked = this.network && !player.controls;

            if (isRemoteNetworked) {
                // Don't simulate remote seats at all — just place them
                // wherever their own client last said they were, in
                // whatever pose they're in. This is what actually lets
                // you see other players moving *and* spinning/flipping
                // correctly, and it can't desync since it isn't a guess.
                const pos = this.remotePositions.get(player.seatIndex);
                if (pos && player.physicsState) {
                    player.physicsState.PLAYER_X = pos.x;
                    player.physicsState.PLAYER_Y = pos.y;
                    player.physicsState.PLAYER_SX = pos.sx;
                    player.physicsState.PLAYER_SY = pos.sy;
                    // drawEntities() reads exactly these four fields off
                    // physicsState to build the renderPlayer() pose (see
                    // its playerPos object) — direction/PLAYER_DIR drive
                    // rotation + left/right flip, player_state/player_wall
                    // drive the crouch pose and wall-cling offset.
                    if (pos.direction !== undefined) player.physicsState.direction = pos.direction;
                    if (pos.dir !== undefined) player.physicsState.PLAYER_DIR = pos.dir;
                    player.physicsState.player_state = pos.crouched ? 2 : 0;
                    player.physicsState.player_wall = pos.onWall ? 1 : null;
                }
            } else if (!player.eliminated) {
                // Local player (always), or any player at all in fully
                // offline/local play (no network attached).
                const keys = this.getInputKeysFor(player);
                player.physicsState = this.physics.tick(player.physicsState, keys);

                if (player.controls && this.network && !player.hasFinished) {
                    this.network.sendPositionSnapshot(
                        this.tick,
                        player.physicsState.PLAYER_X,
                        player.physicsState.PLAYER_Y,
                        player.physicsState.PLAYER_SX,
                        player.physicsState.PLAYER_SY,
                        player.physicsState.direction,
                        player.physicsState.PLAYER_DIR,
                        player.physicsState.player_state === 2,
                        player.physicsState.player_wall != null
                    );
                }
            }
        });

        // Crumble platforms are world state (see physics.js's
        // tickWorldActive()), so they're advanced once per frame here
        // for every player's *current* position — local players just
        // ran physics.tick() above, remote players just got repositioned
        // from their latest network snapshot — rather than only when a
        // player who happens to run physics.tick() locally touches one.
        // Without this, an opponent's client would decay the tile on
        // their own screen while yours never heard about it.
        this.physics.tickWorldActive(this.players.map(p => p.physicsState));

        this.updateRaceCamera();

        if (this.network) {
            // NETWORK REFACTOR: the server is authoritative for
            // hasFinished/eliminated/dnf (see Room.js's confirmFinish()/
            // confirmElimination()/expireRace()) — this client's job is
            // only to *observe and report* events, then wait for
            // FINISH_CONFIRMED/ELIMINATION_CONFIRMED/ROUND_END to update
            // state. Previously nothing ever called
            // sendFinishObserved()/sendEliminationObserved(), so the
            // server never heard about a finish or death from anyone
            // and every round could only ever end by hitting the full
            // RACE_TIME_LIMIT timeout — i.e. DNF for the whole lobby,
            // regardless of what actually happened on screen.
            const localPlayer = this.players[this.localSeatIndex];
            if (localPlayer && localPlayer.physicsState) {
                if (localPlayer.physicsState.PLAYER_DEATH && !localPlayer.hasFinished && !localPlayer.eliminated && !localPlayer.reportedElimination) {
                    localPlayer.reportedElimination = true;
                    this.network.sendEliminationObserved(this.localSeatIndex, this.tick, 'death');
                }
            }

            // Finish can be checked for *any* seat, local or remote,
            // since remote positions are now the real synced position
            // (not a resimulation guess) — every client independently
            // observing the same crossing is exactly the corroboration
            // Room.js's handleFinishObserved() is designed around.
            for (const player of this.players) {
                if (!player.hasFinished && !player.reportedFinish && player.physicsState &&
                    this.physics.isFlagAt(player.physicsState.PLAYER_X, player.physicsState.PLAYER_Y)) {
                    player.reportedFinish = true;
                    this.network.sendFinishObserved(player.seatIndex, this.tick);
                }
            }
            // Local round-end/awarding/gameState transition intentionally
            // NOT done here — handleRoundResult() (driven by the
            // server's ROUND_END) is what actually advances to
            // ROUND_RESULTS in networked play.
            return;
        }

        // ---- offline/local play: fully self-authoritative, as before ----

        // Once a player has crossed the finish flag they're done for the
        // round — don't let a late hit from a spike/hazard kill them.
        // Death no longer respawns the player mid-round: they're marked
        // eliminated and frozen in place (physics.tick() is skipped for
        // them above) until the next round's setup resets the flag.
        for (const player of this.players) {
            if (player.physicsState.PLAYER_DEATH && !player.hasFinished && !player.eliminated) {
                console.log(`${player.name} died!`);
                player.eliminated = true;
            }
        }

        // Round timer expired: anyone who hasn't crossed the finish flag
        // yet is DNF'd (eliminated), same as a death, so the round can
        // still end even if a player neither finishes nor dies. `dnf` is
        // tracked separately from the generic `eliminated` flag (which
        // also covers hazard deaths) purely so ROUND_RESULTS can label
        // the two outcomes differently.
        if (this.raceTimeRemaining <= 0) {
            for (const player of this.players) {
                if (!player.hasFinished && !player.eliminated) {
                    console.log(`${player.name} ran out of time!`);
                    player.eliminated = true;
                    player.dnf = true;
                }
            }
        }

        // Track each player's finish independently. Used to drive
        // round-end logic below (waiting for everyone, awarding the
        // round, etc).
        for (const player of this.players) {
            if (!player.hasFinished &&
                this.physics.isFlagAt(player.physicsState.PLAYER_X, player.physicsState.PLAYER_Y)) {
                player.hasFinished = true;
                // Stamped so awardRoundPoints() can tell who crossed
                // first if multiple players finish this round.
                player.finishTick = this.tick;
                console.log(`${player.name} finished!`);
            }
        }

        // Once every player is done with the round — either they
        // finished, they were eliminated by a hazard, or they ran out of
        // time (DNF) — wait briefly (so the last finish is visible/felt)
        // before moving on to the results screen.
        const allPlayersFinished = this.players.every(p => p.hasFinished || p.eliminated);

        if (allPlayersFinished) {
            this.roundEndFrames += 1;
            if (this.roundEndFrames >= this.ROUND_END_DELAY_FRAMES) {
                // Snapshot the running totals *before* this round's
                // points are added, so drawRoundResultsScreen() has both
                // endpoints to animate the running-total bars between.
                this.players.forEach(p => { p.scoreBeforeRound = p.score; });
                this.awardRoundPoints();
                this.roundResultsAnimFrames = 0;
                this.gameState = GameState.ROUND_RESULTS;
            }
        } else {
            this.roundEndFrames = 0;
        }
    }

    // N-PLAYER REFACTOR: replaces the old inline 2-player camera framing
    // in update(). Aims at the centroid of every non-eliminated player
    // (falls back to everyone if the whole field is eliminated, so the
    // camera doesn't do anything undefined) and zooms out based on their
    // bounding-box diagonal instead of a single pairwise distance.
    //
    // CALLOUT: MIN_ZOOM/MAX_ZOOM/SEPARATION_TO_ZOOM below are the exact
    // constants tuned for the old 2-player pairwise separation. With up
    // to 6 players the bounding-box diagonal grows much faster for a
    // spread-out field, so this curve will very likely need re-tuning
    // once real N-player races get playtested — flagging rather than
    // guessing at new numbers blind.
    updateRaceCamera() {
        let active = this.players.filter(p => !p.eliminated);
        if (active.length === 0) active = this.players; // shouldn't happen, but avoid NaN

        const xs = active.map(p => p.physicsState.PLAYER_X);
        const ys = active.map(p => p.physicsState.PLAYER_Y);

        const targetCameraX = xs.reduce((a, b) => a + b, 0) / xs.length;
        const targetCameraY = ys.reduce((a, b) => a + b, 0) / ys.length;

        const minX = Math.min(...xs), maxX = Math.max(...xs);
        const minY = Math.min(...ys), maxY = Math.max(...ys);
        const diagonal = Math.sqrt((maxX - minX) ** 2 + (maxY - minY) ** 2);

        const MIN_ZOOM = 0.6;
        const MAX_ZOOM = 1.25;
        const SEPARATION_TO_ZOOM = 600;
        const rawZoom = MAX_ZOOM - diagonal / SEPARATION_TO_ZOOM;
        const targetZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, rawZoom));

        this.camera.x += (targetCameraX - this.camera.x) * 0.2;
        this.camera.y += ((targetCameraY - this.camera.y) + 8) * 0.2;
        // Ease zoom more slowly than position so it doesn't feel jittery
        // when players bounce toward/away from each other.
        this.camera.zoom += (targetZoom - this.camera.zoom) * 0.1;
    }

    // N-PLAYER REFACTOR: replaces the old hardcoded 1-or-2-player
    // if/else. Generalizes cleanly since this rule was already binary —
    // it only ever rewarded a single "winner" per round, just with a
    // different point value depending on whether the field was
    // contested:
    //   - nobody finished             -> everyone gets 0
    //   - exactly one player finished -> they get 3, everyone else 0
    //   - 2+ players finished         -> earliest finisher gets 1,
    //                                    everyone else (including other
    //                                    finishers) gets 0
    // This reduces to exactly the original both/one/neither cases at
    // N=2. CALLOUT: worth a real design discussion for N>2 — e.g.
    // whether 2nd/3rd-place finishers among a larger field should get
    // partial credit instead of 0. Kept as a direct, literal
    // generalization of the existing rule rather than inventing new
    // scoring tiers unasked.
    awardRoundPoints() {
        const finishers = this.players
            .filter(p => p.hasFinished)
            .sort((a, b) => a.finishTick - b.finishTick);

        this.players.forEach(p => { p.lastRoundPoints = 0; });

        if (finishers.length === 1) {
            finishers[0].lastRoundPoints = 3;
        } else if (finishers.length >= 2) {
            finishers[0].lastRoundPoints = 1;
        }

        this.players.forEach(p => { p.score += p.lastRoundPoints; });

        const summary = this.players
            .map(p => `${p.name}: +${p.lastRoundPoints} (total ${p.score})`)
            .join(', ');
        console.log(`Round ${this.currentRound} points — ${summary}`);
    }

    // N-PLAYER REFACTOR: loops every player instead of a fixed
    // playerState/playerState2 pair.
    drawEntities() {
        const firstPlayer = this.players[0];
        if (!firstPlayer || !firstPlayer.physicsState) return;

        for (const player of this.players) {
            if (!player.physicsState) continue;

            const playerPos = {
                x: player.physicsState.PLAYER_X,
                y: player.physicsState.PLAYER_Y,
                angle: player.physicsState.direction,
                crouched: player.physicsState.player_state === 2,
                onWall: player.physicsState.player_wall != null,
                dir: player.physicsState.PLAYER_DIR
            };

            this.renderer.renderPlayer(playerPos, this.camera, player.hue);
        }

        this.renderer.renderDynamic(firstPlayer.physicsState.OBJ, this.camera);
    }

    // Debug-only helper (never called in the normal loop — see the
    // commented-out `this.debugKillZones()` in raceLoop()). N-PLAYER
    // REFACTOR NOTE: still only checks seat 0's physicsState against
    // is_pixel_on_player(); left that way since it's debug tooling, not
    // part of the real game loop, but flagging in case it's still in use
    // for something.
    debugKillZones() {
        const step = 2; // Increased step to 4 to prevent severe frame drops
        this.ctx.fillStyle = "rgba(255, 0, 0, 0.5)";

        const debugPlayerState = this.players[0] ? this.players[0].physicsState : null;

        for (let x = 0; x < this.canvas.width; x += step) {
            for (let y = 0; y < this.canvas.height; y += step) {
                // 1. Correctly reverse the renderer's Camera Zoom and Translation
                const worldX = (x - this.canvas.width / 2) / this.camera.zoom + this.camera.x;
                const worldY = this.camera.y - (y - this.canvas.height / 2) / this.camera.zoom;

                // 2. Calculate the 1D map array index (Appel tiles are 60x60)
                const tx = Math.floor(worldX / 60);
                const ty = Math.floor(worldY / 60);
                const idx = tx + ty * this.physics.LSX;

                // 3. Prevent checking out-of-bounds map data
                if (idx >= 0 && idx < this.physics.MAP.length) {
                    
                    // Pass the corrected world coordinates (worldY is no longer negated)
                    if (this.physics.touching.is_pixel_on_spike(worldX, worldY, this.physics) ||
                        (debugPlayerState && this.physics.touching.is_pixel_on_player(worldX, worldY, debugPlayerState))) {
                        
                        // Draw exactly at the screen pixel we are sampling
                        this.ctx.fillRect(x, y, step, step);
                    }
                }
            }
        }
    }

    // Dispatches to the right per-frame behavior for the current state.
    // LOADING is handled separately in the setInterval callback in init()
    // since it needs to run before assets (and therefore this.levelData)
    // are ready.
    gameLoop() {
        switch (this.gameState) {
            case GameState.RACE:
                this.raceLoop();
                break;

            case GameState.STAGE_SELECT:
                this.drawStageSelectScreen();
                break;

            case GameState.PARTY_BOX:
                this.partyBoxLoop();
                break;

            case GameState.BUILD:
                this.buildLoop();
                break;

            case GameState.ROUND_RESULTS:
                this.drawRoundResultsScreen();
                break;

            case GameState.FINAL_RESULTS:
                this.drawFinalResultsScreen();
                break;

            case GameState.MENU:
            default:
                // Nothing to draw on canvas — the HTML start screen
                // overlay is handling MENU for now.
                break;
        }
    }

    // The real per-frame gameplay loop: advance physics, render the level
    // and entities. This is the old gameLoop() body, now only run while
    // this.gameState === GameState.RACE.
    raceLoop() {
        this.profiler.start('Total Frame');
        this.profiler.tick();

        // Tick the race clock down once per frame. Physics/finish/DNF
        // checks inside update() read raceTimeRemaining this same frame,
        // so a player who's still racing when it crosses 0 gets DNF'd
        // immediately rather than a frame late.
        if (this.gameState === GameState.RACE) {
            this.raceTimeRemaining = Math.max(0, this.raceTimeRemaining - (1 / 30));
        }

        this.profiler.start('Physics');
        this.update();
        this.profiler.end('Physics');

        if (this.levelData) {
            this.profiler.start('Render: Level');
            this.renderer.render(this.levelData, this.camera);
            this.profiler.end('Render: Level');
        }

        this.profiler.start('Render: Player');
        this.drawEntities();
        this.profiler.end('Render: Player');

        this.drawRaceTimer();

        this.tick += 1;

        // this.debugKillZones()

        this.profiler.draw(this.ctx);

        this.profiler.end('Total Frame');
    }

    // Draws the race countdown using the same plain canvas-text approach
    // as drawLoadingScreen() — no widget, just fillText in the top-right
    // corner so it doesn't compete with the level/entities underneath.
    drawRaceTimer() {
        const seconds = Math.ceil(this.raceTimeRemaining);

        this.ctx.fillStyle = seconds <= 5 ? THEME.danger : THEME.text;
        this.ctx.font = "bold 20px " + THEME.font;
        this.ctx.textAlign = "right";
        this.ctx.fillText(`${seconds}s`, this.canvas.width - 16, 30);
    }

    // Per-frame behavior while BUILD is active: ticks the countdown down,
    // force-places anyone still undecided once it hits 0, eases the
    // camera toward the cursors, then renders the level with every
    // player's cursor/piece preview overlaid.
    buildLoop() {
        this.buildTimeRemaining = Math.max(0, this.buildTimeRemaining - (1 / 30));

        if (this.buildTimeRemaining <= 0) {
            for (const player of this.players) {
                if (player.piece && !player.buildPlaced) {
                    this.confirmBuildPlacement(player);
                }
            }
        }

        this.updateBuildCamera();

        if (this.levelData) {
            this.renderer.render(this.levelData, this.camera);
        }
        this.drawBuildScreen();
    }

    // Eases the camera toward the centroid of every player's cursor,
    // same easing feel as the RACE camera in updateRaceCamera().
    updateBuildCamera() {
        const worlds = this.players.map(p => this.buildCellToWorld(p.buildCursor));
        const targetX = worlds.reduce((sum, w) => sum + w.x, 0) / worlds.length;
        const targetY = worlds.reduce((sum, w) => sum + w.y, 0) / worlds.length;

        this.camera.x += (targetX - this.camera.x) * 0.2;
        this.camera.y += (targetY - this.camera.y) * 0.2;
    }

    // Converts a {col, row} grid cell to the same world-coordinate frame
    // the RACE camera/player positions live in (physics Y grows upward
    // on screen, matching this.camera.y — see the render()/renderPlayer()
    // transforms in levelRenderer.js).
    buildCellToWorld(cell) {
        return {
            x: cell.col * TILE_SIZE + TILE_SIZE / 2,
            y: cell.row * TILE_SIZE + TILE_SIZE / 2
        };
    }

    // Converts that same world coordinate to a canvas pixel position,
    // replicating the camera transform LevelRenderer.render() applies
    // (translate to center, scale by zoom, translate by -camera.x/+camera.y)
    // so the cursor overlay lines up with the level drawn underneath it.
    buildCellToScreen(cell) {
        const world = this.buildCellToWorld(cell);
        const tileY = -world.y;
        return {
            x: this.canvas.width / 2 + this.camera.zoom * (world.x - this.camera.x),
            y: this.canvas.height / 2 + this.camera.zoom * (this.camera.y + tileY)
        };
    }

    // Real BUILD screen: renders on top of the (already-drawn) level —
    // title/instructions/countdown HUD, plus every player's cursor
    // square and piece label.
    drawBuildScreen() {
        this.drawScreenTitle('Build!');

        this.ctx.font = "13px " + THEME.font;
        this.ctx.fillStyle = THEME.textMuted;
        this.ctx.fillText(
            // N-PLAYER REFACTOR: was "P1: ... | P2: ..." for the two
            // fixed local players; only seat 0 is real input in this
            // pass (see the LOCAL_PLAYER_CONTROLS callout up top), so
            // this now says so explicitly instead of silently going
            // quiet about the other seats.
            'You (P1): WASD move, Q/E rotate, Left Shift place — other seats are idle stand-ins for now',
            this.canvas.width / 2, 66
        );

        this.drawRoundBadge();
        this.drawCountdownRing(this.buildTimeRemaining, this.BUILD_TIME_LIMIT);

        for (const player of this.players) {
            if (player.piece) {
                this.drawBuildCursor(player.buildCursor, player.buildRotation, player.piece, player.buildPlaced, player.color, player.name);
            }
        }
    }

    // Draws one player's build cursor: the *actual* tile artwork (both
    // tileset layers, same as render() draws for real map tiles) for
    // every cell in the piece's current footprint, faded to translucent
    // so it reads as a preview, plus a thin per-player outline over each
    // cell and a name label above it.
    //
    // Using the real art (rather than a plain colored square) is what
    // actually lets players see what they're about to place and which
    // way it's rotated — the artwork itself shows facing/orientation,
    // where an abstract shape couldn't.
    drawBuildCursor(cursor, rotation, piece, placed, color, label) {
        const half = (this.camera.zoom * TILE_SIZE) / 2;
        const alpha = placed ? 0.3 : 0.55;

        const cells = getPieceFootprintCells(piece, rotation).map(cellOffset => ({
            col: cursor.col + cellOffset.dCol,
            row: cursor.row + cellOffset.dRow,
            tile: cellOffset.tile,
            rotation
        }));

        this.renderer.renderTilePreviews(this.levelData, this.camera, cells, alpha);

        this.ctx.strokeStyle = color;
        this.ctx.lineWidth = 3;
        for (const cell of cells) {
            const cellScreen = this.buildCellToScreen(cell);
            this.ctx.strokeRect(cellScreen.x - half, cellScreen.y - half, half * 2, half * 2);
        }

        const anchorScreen = this.buildCellToScreen(cursor);

        this.ctx.textAlign = "left";
        this.ctx.font = "13px " + THEME.font;
        this.ctx.fillStyle = color;
        this.ctx.fillText(`${label}${placed ? ' ✓' : ''}`, anchorScreen.x - 8, anchorScreen.y - half - 10);
        this.ctx.textAlign = "center";
    }

    // Per-frame behavior while PARTY_BOX is active: ticks the pick
    // countdown down, auto-assigns any player who's still undecided once
    // it hits 0, then draws the screen.
    partyBoxLoop() {
        this.partyTimeRemaining = Math.max(0, this.partyTimeRemaining - (1 / 30));

        if (this.partyTimeRemaining <= 0 && !this.players.every(p => p.piece)) {
            this.autoAssignRemainingPartyPicks();
        }

        this.drawPartyBoxScreen();
    }

    // N-PLAYER REFACTOR: stacked chip labels above an item (stage
    // candidate or party slot) for every player whose cursor is
    // currently on it. Replaces the old fixed "P1 above / P2 below"
    // pair — with up to 6 possible cursors landing on the same item we
    // can't dedicate one fixed screen position per seat the way the
    // 2-player version could.
    // CALLOUT: this is the simplest thing that generalizes correctly;
    // with 5-6 players all cursoring the same slot the stack can get
    // tall enough to crowd the top of the screen — worth a real visual
    // pass once there's more than one live local/remote player to
    // actually see it happen with.
    drawCursorChips(cursorField, itemIndex, cx, boxY) {
        const here = this.players.filter(p => p[cursorField] === itemIndex);
        if (here.length === 0) return;

        const chipHeight = 15;
        const gap = 2;
        const startY = boxY - 10 - here.length * (chipHeight + gap);

        this.ctx.font = "bold 11px " + THEME.font;
        here.forEach((player, i) => {
            const y = startY + i * (chipHeight + gap);
            this.ctx.fillStyle = player.color;
            this.ctx.fillText(`${player.name} ▲`, cx, y);
        });
    }

    // N-PLAYER REFACTOR: replaces the two fixed fillText calls
    // ("P1: ... ✓" / "P2: ... ✓") below the party box slots. Lays every
    // player out in 1 or 2 columns depending on player count so up to 6
    // rows still fit comfortably under the slots.
    // CALLOUT: at 6 players + long piece names this is fairly tight
    // vertically — flagging as a spot that'll want real layout/visual
    // QA once there's more than one live seat to look at.
    drawPartyStatusList(baseY) {
        const columns = this.players.length > 3 ? 2 : 1;
        const rowHeight = 20;
        const colWidth = 240;
        const startX = this.canvas.width / 2 - (columns * colWidth) / 2 + colWidth / 2;

        this.ctx.font = "14px " + THEME.font;
        this.players.forEach((player, i) => {
            const col = i % columns;
            const row = Math.floor(i / columns);
            const x = startX + col * colWidth;
            const y = baseY + row * rowHeight;
            const status = player.piece ? `${player.name}: ${player.piece.name} ✓` : `${player.name}: choosing…`;
            this.ctx.fillStyle = player.piece ? THEME.success : THEME.textMuted;
            this.ctx.fillText(status, x, y);
        });
    }

    // Real PARTY_BOX screen: shows the revealed piece slots, every
    // player's cursor over them, the pick countdown, and who's locked in.
    drawPartyBoxScreen() {
        this.fillBackground();
        this.drawScreenTitle('Party Box');
        this.drawRoundBadge();
        this.drawCountdownRing(this.partyTimeRemaining, this.PARTY_TIME_LIMIT);

        this.ctx.font = "14px " + THEME.font;
        this.ctx.fillStyle = THEME.textMuted;
        this.ctx.fillText(
            'You (P1): A/D to move, Left Shift to grab — other seats are idle stand-ins for now',
            this.canvas.width / 2, 78
        );

        const slots = this.partySlots;
        if (!slots || slots.length === 0) return;

        // N-PLAYER REFACTOR: box width used to be a flat 128px, which
        // only ever had to fit up to 5 slots (the old
        // PARTY_BOX_SLOT_COUNT). At 8 slots that would overlap on a
        // 960px-wide canvas, so it now shrinks to fit the available
        // per-slot spacing instead.
        const spacing = this.canvas.width / (slots.length + 1);
        const boxWidth = Math.min(128, spacing - 12);
        const boxHeight = 96;
        const boxY = this.canvas.height / 2 - boxHeight / 2;

        slots.forEach((piece, i) => {
            const cx = spacing * (i + 1);
            const hasCursorHere = this.players.some(p => p.partyCursor === i);

            this.roundRectPath(cx - boxWidth / 2, boxY, boxWidth, boxHeight, 10);
            this.ctx.fillStyle = piece ? THEME.panel : 'rgba(255,255,255,0.02)';
            this.ctx.fill();
            this.ctx.strokeStyle = hasCursorHere ? THEME.panelBorderActive : THEME.panelBorder;
            this.ctx.lineWidth = hasCursorHere ? 2.5 : 1.5;
            this.ctx.stroke();

            if (piece) {
                this.renderer.renderPieceIcon(this.levelData, piece, cx, boxY + boxHeight / 2 - 10, Math.min(64, boxWidth - 20));
                this.ctx.font = "12px " + THEME.font;
                this.ctx.fillStyle = THEME.text;
                this.ctx.fillText(piece.name, cx, boxY + boxHeight - 12);
            } else {
                this.ctx.font = "12px " + THEME.font;
                this.ctx.fillStyle = THEME.textMuted;
                this.ctx.fillText('taken', cx, boxY + boxHeight / 2 + 4);
            }

            this.drawCursorChips('partyCursor', i, cx, boxY);
        });

        this.drawPartyStatusList(boxY + boxHeight + 45);
    }

    // Real STAGE_SELECT screen: shows the 3 drawn candidates, each with
    // a real render of that level as its thumbnail, plus every player's
    // cursor over them.
    drawStageSelectScreen() {
        this.fillBackground();
        this.drawScreenTitle('Stage Select');
        this.drawRoundBadge();

        this.ctx.font = "14px " + THEME.font;
        this.ctx.fillStyle = THEME.textMuted;
        this.ctx.fillText(
            'You (P1): A/D to move, Left Shift to confirm — other seats are idle stand-ins for now',
            this.canvas.width / 2, 82
        );

        const candidates = this.stageCandidates;
        if (!candidates || candidates.length === 0) return;

        const boxWidth = STAGE_SELECT_BOX_WIDTH;
        const boxHeight = STAGE_SELECT_BOX_HEIGHT;
        const boxY = this.canvas.height / 2 - boxHeight / 2;
        const spacing = this.canvas.width / (candidates.length + 1);

        candidates.forEach((code, i) => {
            const cx = spacing * (i + 1);
            const hasCursorHere = this.players.some(p => p.stageCursor === i);

            this.roundRectPath(cx - boxWidth / 2, boxY, boxWidth, boxHeight, 10);
            this.ctx.fillStyle = THEME.panel;
            this.ctx.fill();
            this.ctx.strokeStyle = hasCursorHere ? THEME.panelBorderActive : THEME.panelBorder;
            this.ctx.lineWidth = hasCursorHere ? 2.5 : 1.5;
            this.ctx.stroke();

            const thumbPad = 8;
            const thumbW = boxWidth - thumbPad * 2;
            const thumbH = boxHeight - 30;
            const thumbX = cx - thumbW / 2;
            const thumbY = boxY + thumbPad;

            // Lazily (re)generate on a cache miss — generateStageThumbnail()
            // is a no-op if it's already cached, so this is normally just
            // a Map lookup.
            const thumb = this.generateStageThumbnail(code, thumbW, thumbH);
            if (thumb) {
                this.ctx.save();
                this.roundRectPath(thumbX, thumbY, thumbW, thumbH, 6);
                this.ctx.clip();
                this.ctx.drawImage(thumb, thumbX, thumbY, thumbW, thumbH);
                this.ctx.restore();
            } else {
                // Assets/thumbnail not ready yet — fall back to the vector
                // placeholder rather than drawing nothing.
                this.drawLevelIcon(cx, boxY + boxHeight / 2 - 14, 46, i);
            }

            this.ctx.fillStyle = THEME.textMuted;
            this.ctx.font = "12px " + THEME.font;
            this.ctx.fillText(`Stage ${i + 1}`, cx, boxY + boxHeight - 8);

            this.drawCursorChips('stageCursor', i, cx, boxY);
        });
    }

    // Simple ease-out cubic, used to animate the running-total bars on
    // ROUND_RESULTS so they decelerate into their final value instead of
    // moving at a constant rate.
    easeOutCubic(t) {
        const clamped = Math.max(0, Math.min(1, t));
        return 1 - Math.pow(1 - clamped, 3);
    }

    // Returns { text, color } describing how a given player's round went,
    // for ROUND_RESULTS. Order matters: hasFinished wins even though
    // eliminated may also be set on some code paths, and the dnf flag
    // (set only on round-timer expiry, see update()) distinguishes a
    // timeout from a hazard death — both of which otherwise just set the
    // generic `eliminated` flag.
    getRoundResultLabel(player) {
        if (!player) return { text: '—', color: THEME.textMuted };
        if (player.hasFinished) return { text: 'Finished', color: THEME.success };
        if (player.dnf) return { text: 'DNF', color: THEME.warning };
        if (player.eliminated) return { text: 'Eliminated', color: THEME.danger };
        return { text: '—', color: THEME.textMuted };
    }

    // Real ROUND_RESULTS screen: every player's outcome for the round
    // (finished/eliminated/DNF), the points they just earned, "Round X
    // of totalRounds", and a running-total bar per player that animates
    // from player.scoreBeforeRound to player.score over
    // ROUND_RESULTS_ANIM_FRAMES frames (~0.5s at 30fps) using an eased
    // lerp driven by this.roundResultsAnimFrames.
    // N-PLAYER REFACTOR: outcome columns are now spaced evenly across
    // the canvas width (same spacing pattern the stage/party boxes use)
    // instead of two fixed +/-180px offsets, and the score bars stack
    // vertically — one row per player — instead of two fixed rows.
    // CALLOUT: with 6 players the stacked bars get noticeably tighter
    // (smaller bar height/gap below); worth a visual pass once there's
    // an actual 5-6 player field to look at rather than guessing sizes.
    drawRoundResultsScreen() {
        this.fillBackground();
        this.drawScreenTitle('Round Results');
        this.drawRoundBadge();

        const n = this.players.length;
        const colSpacing = this.canvas.width / (n + 1);

        this.players.forEach((player, i) => {
            const x = colSpacing * (i + 1);
            const label = this.getRoundResultLabel(player);

            this.ctx.font = "bold 16px " + THEME.font;
            this.ctx.fillStyle = player.color;
            this.ctx.fillText(player.name, x, 110);

            this.ctx.font = "15px " + THEME.font;
            this.ctx.fillStyle = label.color;
            this.ctx.fillText(label.text, x, 132);

            this.ctx.fillStyle = THEME.textMuted;
            this.ctx.fillText(`+${player.lastRoundPoints} pts`, x, 152);
        });

        // Animated running-total bars.
        this.roundResultsAnimFrames = Math.min(
            this.roundResultsAnimFrames + 1,
            this.ROUND_RESULTS_ANIM_FRAMES
        );
        const eased = this.easeOutCubic(this.roundResultsAnimFrames / this.ROUND_RESULTS_ANIM_FRAMES);

        const barMaxWidth = 500;
        const barHeight = n > 4 ? 18 : 24;
        const barGap = n > 4 ? 26 : 40;
        const barX = this.canvas.width / 2 - barMaxWidth / 2;
        const firstBarY = 190;

        this.players.forEach((player, i) => {
            this.drawScoreBar(
                barX, firstBarY + i * barGap, barMaxWidth, barHeight,
                player.scoreBeforeRound, player.score, eased,
                player.color, player.name
            );
        });

        this.ctx.font = "15px " + THEME.font;
        this.ctx.fillStyle = THEME.textMuted;
        this.ctx.fillText('Press Enter to continue', this.canvas.width / 2, firstBarY + n * barGap + 20);
    }

    // Draws one running-total bar: an outlined track filled from 0 up to
    // the interpolated value between `fromScore` and `toScore` at `t`
    // (already eased by the caller), scaled against
    // this.MAX_POSSIBLE_SCORE so the track's fill fraction is meaningful
    // across the whole match rather than rescaling every round.
    drawScoreBar(x, y, width, height, fromScore, toScore, t, color, label) {
        const displayedScore = fromScore + (toScore - fromScore) * t;
        const fraction = Math.max(0, Math.min(1, displayedScore / this.MAX_POSSIBLE_SCORE));

        this.roundRectPath(x, y, width, height, height / 2);
        this.ctx.fillStyle = THEME.panel;
        this.ctx.fill();
        this.ctx.strokeStyle = THEME.panelBorder;
        this.ctx.lineWidth = 1.5;
        this.ctx.stroke();

        if (fraction > 0) {
            this.roundRectPath(x, y, Math.max(height, width * fraction), height, height / 2);
            this.ctx.fillStyle = color;
            this.ctx.fill();
        }

        this.ctx.textAlign = "left";
        this.ctx.font = "bold 14px " + THEME.font;
        this.ctx.fillStyle = THEME.text;
        this.ctx.fillText(label, x, y - 8);

        this.ctx.textAlign = "right";
        this.ctx.fillText(Math.round(displayedScore).toString(), x + width, y - 8);
        this.ctx.textAlign = "center";
    }

    // Real FINAL_RESULTS screen: shown once currentRound has reached
    // totalRounds. Declares a winner (or a tie among however many
    // players are tied for the top score) from the final per-player
    // scores and offers "play again" (Enter -> playAgain(), wired up in
    // advanceFromPlaceholder()).
    // N-PLAYER REFACTOR: replaces the fixed 2-line "Player 1: N pts" /
    // "Player 2: N pts" + 3-way if/else winner check with a ranked list
    // of every player and a tie check across however many players share
    // the top score (not just a 2-way tie).
    drawFinalResultsScreen() {
        this.fillBackground();

        this.ctx.fillStyle = THEME.text;
        this.ctx.textAlign = "center";
        this.ctx.font = "bold 32px " + THEME.font;
        this.ctx.fillText('Final Results', this.canvas.width / 2, 70);

        const ranked = [...this.players].sort((a, b) => b.score - a.score);

        this.ctx.font = "20px " + THEME.font;
        ranked.forEach((player, i) => {
            this.ctx.fillStyle = player.color;
            this.ctx.fillText(`${player.name}: ${player.score} pts`, this.canvas.width / 2, 130 + i * 32);
        });

        const topScore = ranked[0].score;
        const winners = ranked.filter(p => p.score === topScore);
        const winnerText = winners.length > 1
            ? `Tie between ${winners.map(p => p.name).join(' & ')}!`
            : `${winners[0].name} wins!`;

        this.ctx.font = "bold 26px " + THEME.font;
        this.ctx.fillStyle = THEME.success;
        this.ctx.fillText(winnerText, this.canvas.width / 2, 130 + ranked.length * 32 + 40);

        this.ctx.font = "15px " + THEME.font;
        this.ctx.fillStyle = THEME.textMuted;
        this.ctx.fillText('Press Enter to play again', this.canvas.width / 2, 130 + ranked.length * 32 + 80);
    }

    // ================= NETWORK REFACTOR =================
    //
    // Everything below wires a NetworkClient (network.js) into the game
    // state machine. None of it runs when `this.network` is null — the
    // rest of the class is untouched local/offline play.
    //
    // The general shape: local input is still read from this.keys and
    // applied to the local player's own state immediately (prediction,
    // for responsiveness), but every *authoritative* transition — a
    // stage locking in, a party pick being accepted, a piece actually
    // landing on the map, a round ending — only happens in response to
    // a server message. Two clients can never disagree about what's on
    // the map or who's in the lead because only the server's messages
    // (never local key state) drive those transitions.

    bindNetwork() {
        const net = this.network;

        net.onOpen = () => {
            this.gameState = GameState.LOBBY;
        };

        net.onSeatAssigned = (payload) => this.handleSeatAssigned(payload);
        net.onRoomState = (payload) => this.handleRoomState(payload);
        net.onJoinRejected = (payload) => {
            console.warn('[network] join rejected:', payload.reason);
            if (this.onJoinRejected) this.onJoinRejected(payload); // optional UI hook, set by game.html
        };

        net.onMatchStarting = () => {
            this.gameState = GameState.LOADING;
            // CLIENT_READY is sent once our own assets actually finish
            // loading (see checkLoadStatus()), not immediately here —
            // MATCH_STARTING just means "the host started the match",
            // not "this client is ready for it".
        };
        net.onAllClientsReady = () => {
            // Server has moved every seat past LOADING; our own
            // checkLoadStatus()/enterStageSelect() no longer runs the
            // local pickStageCandidates() path (see enterStageSelect()
            // override below) — the next state-changing message is
            // STAGE_SELECT_START via onStageState.
        };

        net.onStageState = (payload, type) => this.handleStageNetworkEvent(payload, type);
        net.onPartyState = (payload, type) => this.handlePartyNetworkEvent(payload, type);
        net.onBuildState = (payload, type) => this.handleBuildNetworkEvent(payload, type);
        net.onRaceState = (payload, type) => this.handleRaceNetworkEvent(payload, type);

        net.onPositionSync = (payload) => this.handleRemotePositionSync(payload);
        net.onFinishConfirmed = (payload) => this.handleFinishConfirmed(payload);
        net.onEliminationConfirmed = (payload) => this.handleEliminationConfirmed(payload);

        net.onRoundResult = (payload) => this.handleRoundResult(payload);
        net.onNextRoundStart = () => { /* enterPartyBox() below already reacts to PARTY_BOX_START */ };
        net.onMatchEnd = (payload) => this.handleMatchEnd(payload);
        net.onRematchStarting = () => this.resetForRematch();

        net.onPlayerLeft = (payload) => this.markSeatDisconnected(payload.seatIndex);
        net.onPlayerDisconnected = (payload) => this.markSeatDisconnected(payload.seatIndex);
        net.onPlayerReconnected = (payload) => this.markSeatReconnected(payload.seatIndex);
    }

    // ---------- lobby ----------

    handleSeatAssigned(payload) {
        this.localSeatIndex = payload.seatIndex;
        this.roomCode = this.network.roomCode;
        // Rebuild players now that we know which seat is ours — controls
        // need to move onto payload.seatIndex even if this.players was
        // already created with the old (default 0) assumption.
        this.players = this.createPlayers(this.playerCount, this.localSeatIndex);
    }

    // Rebuilds this.players to mirror the server's authoritative seat
    // list every time ROOM_STATE arrives (lobby joins/leaves, and every
    // later broadcast triggered by disconnects/reconnects). Preserves
    // per-seat match state (score, piece, cursors, ...) across a resize
    // by copying it over from the old array when a seatIndex survives.
    handleRoomState(payload) {
        this.roomCode = payload.roomCode;
        this.isHost = payload.hostSeatIndex === this.localSeatIndex;

        const seats = payload.seats || [];
        const previousByIndex = new Map(this.players.map(p => [p.seatIndex, p]));

        this.playerCount = Math.max(MIN_PLAYERS, Math.min(MAX_PLAYERS, seats.length || 1));
        const rebuilt = this.createPlayers(this.playerCount, this.localSeatIndex);

        for (const seatInfo of seats) {
            const player = rebuilt[seatInfo.seatIndex];
            if (!player) continue;
            player.name = seatInfo.name || player.name;
            player.isBot = !!seatInfo.isBot;
            player.connected = seatInfo.connected !== false;

            const previous = previousByIndex.get(seatInfo.seatIndex);
            if (previous) {
                // Carry match-in-progress state across a roster refresh
                // instead of resetting it (a ROOM_STATE broadcast during
                // the LOBBY phase is a genuine reset, but a later one —
                // e.g. after a reconnect — shouldn't wipe scores).
                player.score = previous.score;
                player.piece = previous.piece;
                player.stageCursor = previous.stageCursor;
                player.partyCursor = previous.partyCursor;
                player.buildCursor = previous.buildCursor;
                player.buildRotation = previous.buildRotation;
                player.buildPlaced = previous.buildPlaced;
                player.physicsState = previous.physicsState;
            }
        }

        this.players = rebuilt;

        // Optional UI hook for the lobby overlay in game.html — passed
        // the same payload the server sent, plus whether we're host.
        if (this.onLobbyUpdate) this.onLobbyUpdate(payload, this.isHost);
    }

    markSeatDisconnected(seatIndex) {
        const player = this.players[seatIndex];
        if (player) player.connected = false;
    }

    markSeatReconnected(seatIndex) {
        const player = this.players[seatIndex];
        if (player) player.connected = true;
    }

    // Called by game.html when the lobby's "Start" button is pressed
    // (host only — the server also enforces this, see Room.js's
    // handleStartMatchRequest()).
    requestStartMatch() {
        if (!this.network) return;
        this.network.requestStartMatch();
    }

    // ---------- stage select ----------

    handleStageNetworkEvent(payload, type) {
        switch (type) {
            case 'STAGE_SELECT_START':
                this.stageCandidates = payload.candidates || [];
                this.players.forEach(p => { p.stageCursor = 0; });
                this.gameState = GameState.STAGE_SELECT;
                {
                    const thumbW = STAGE_SELECT_BOX_WIDTH - 16;
                    const thumbH = STAGE_SELECT_BOX_HEIGHT - 30;
                    this.stageCandidates.forEach(code => this.generateStageThumbnail(code, thumbW, thumbH));
                }
                break;
            case 'STAGE_CURSOR_MOVE': {
                const player = this.players[payload.seatIndex];
                if (player) player.stageCursor = payload.cursorIndex;
                break;
            }
            case 'STAGE_LOCKED':
                this.loadLevel(payload.levelCode);
                // enterPartyBox() itself is a no-op transition here —
                // the *actual* PARTY_BOX_START message follows right
                // behind STAGE_LOCKED and is what really populates
                // this.partySlots (see handlePartyNetworkEvent()).
                break;
        }
    }

    // ---------- party box ----------

    handlePartyNetworkEvent(payload, type) {
        switch (type) {
            case 'PARTY_BOX_START':
                this.partySlots = (payload.slots || []).map(s => (s ? getPieceById(s.pieceId) : null));
                this.players.forEach(p => { p.partyCursor = 0; p.piece = null; });
                this.partyTimeRemaining = payload.timeLimit || this.PARTY_TIME_LIMIT;
                this.gameState = GameState.PARTY_BOX;
                break;
            case 'PARTY_CURSOR_MOVE': {
                const player = this.players[payload.seatIndex];
                if (player) player.partyCursor = payload.cursorIndex;
                break;
            }
            case 'PARTY_PICK_RESULT': {
                if (!payload.accepted) break;
                const player = this.players[payload.seatIndex];
                if (player) player.piece = getPieceById(payload.pieceId);
                if (this.partySlots[payload.slotIndex]) this.partySlots[payload.slotIndex] = null;
                break;
            }
            case 'PARTY_AUTO_ASSIGN': {
                for (const assignment of (payload.assignments || [])) {
                    const player = this.players[assignment.seatIndex];
                    if (player) player.piece = getPieceById(assignment.pieceId);
                    if (this.partySlots[assignment.slotIndex]) this.partySlots[assignment.slotIndex] = null;
                }
                break;
            }
            case 'PARTY_BOX_COMPLETE':
                // enterBuild() as a *transition* is server-driven (the
                // BUILD_START event does the real work below); nothing
                // to do here besides let that message arrive next.
                break;
        }
    }

    // ---------- build ----------

    handleBuildNetworkEvent(payload, type) {
        switch (type) {
            case 'BUILD_START': {
                this.buildTimeRemaining = payload.timeLimit || this.BUILD_TIME_LIMIT;
                const startCells = payload.startCells || [];
                for (const sc of startCells) {
                    const player = this.players[sc.seatIndex];
                    if (!player) continue;
                    player.buildRotation = 0;
                    player.buildPlaced = false;
                    player.buildCursor = { col: sc.col, row: sc.row };
                }
                this.gameState = GameState.BUILD;
                break;
            }
            case 'BUILD_CURSOR_MOVE': {
                const player = this.players[payload.seatIndex];
                if (player) {
                    player.buildCursor = { col: payload.col, row: payload.row };
                    player.buildRotation = payload.rotation;
                }
                break;
            }
            case 'PLACE_PIECE_RESULT':
            case 'FORCE_PLACE': {
                const player = this.players[payload.seatIndex];
                if (player) {
                    player.buildCursor = { col: payload.col, row: payload.row };
                    player.buildRotation = payload.rotation;
                    if (payload.accepted) player.buildPlaced = true;
                    else if (type === 'FORCE_PLACE') player.buildPlaced = true; // countdown forced it either way
                }
                this.applyMapPatch(payload.mapPatch);
                break;
            }
            case 'BUILD_COMPLETE':
                this.applyMapPatch(payload.mapPatch);
                this.snapshotBuiltMap();
                // RACE_START (via onRaceState) drives the actual
                // transition into GameState.RACE below.
                break;
        }
    }

    // Writes a server-provided mapPatch ([{idx, tile, rot}, ...]) into
    // the local this.physics.MAP/MAP_R — the network-authoritative
    // equivalent of the local placeBuildPiece()'s direct array writes.
    applyMapPatch(mapPatch) {
        if (!mapPatch || !this.physics) return;
        for (const patch of mapPatch) {
            this.physics.MAP[patch.idx] = patch.tile;
            this.physics.MAP_R[patch.idx] = patch.rot;
        }
    }

    // ---------- race ----------

    handleRaceNetworkEvent(payload, type) {
        switch (type) {
            case 'RACE_START':
                this.tick = payload.tick || 0;
                this.remotePositions.clear();
                this.gameState = GameState.RACE;
                this.resetRoundState();
                break;
            case 'RACE_TIMER_EXPIRED':
                this.raceTimeRemaining = 0;
                break;
        }
    }

    handleFinishConfirmed(payload) {
        const player = this.players[payload.seatIndex];
        if (!player) return;
        player.hasFinished = true;
        player.finishTick = payload.finishTick;
    }

    handleEliminationConfirmed(payload) {
        const player = this.players[payload.seatIndex];
        if (!player) return;
        player.eliminated = true;
        player.dnf = payload.cause === 'dnf';
    }

    // ---------- results ----------

    handleRoundResult(payload) {
        this.players.forEach(p => { p.scoreBeforeRound = p.score; });
        for (const result of (payload.results || [])) {
            const player = this.players[result.seatIndex];
            if (!player) continue;
            player.hasFinished = result.hasFinished;
            player.dnf = result.dnf;
            player.eliminated = result.eliminated;
            player.finishTick = result.finishTick;
            player.lastRoundPoints = result.roundPoints;
            player.score = result.totalScore;
        }
        this.currentRound = payload.round;
        this.roundResultsAnimFrames = 0;
        this.gameState = GameState.ROUND_RESULTS;
    }

    handleMatchEnd(payload) {
        for (const standing of (payload.finalStandings || [])) {
            const player = this.players[standing.seatIndex];
            if (player) player.score = standing.totalScore;
        }
        this.gameState = GameState.FINAL_RESULTS;
    }

    // NETWORK REFACTOR: the network twin of playAgain() — resets local
    // per-player match state the same way, but stays in the game (the
    // server's REMATCH_STARTING is immediately followed by a fresh
    // STAGE_SELECT_START, see Room.js's enterStageSelect()) instead of
    // dropping back to GameState.MENU/the HTML start screen.
    resetForRematch() {
        this.players.forEach(p => {
            p.score = 0;
            p.scoreBeforeRound = 0;
            p.lastRoundPoints = 0;
            p.eliminated = false;
            p.hasFinished = false;
            p.dnf = false;
            p.finishTick = null;
            p.piece = null;
            p.buildPlaced = false;
        });
        this.currentRound = 1;
    }
}