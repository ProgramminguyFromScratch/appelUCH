const GameState = {
    MENU: 'MENU',
    LOBBY: 'LOBBY',
    LOADING: 'LOADING',
    STAGE_SELECT: 'STAGE_SELECT',
    PARTY_BOX: 'PARTY_BOX',
    BUILD: 'BUILD',
    RACE: 'RACE',
    ROUND_RESULTS: 'ROUND_RESULTS',
    FINAL_RESULTS: 'FINAL_RESULTS'
};
const MIN_PLAYERS = 1;
const MAX_PLAYERS = 6;
const LOCAL_PLAYER_CONTROLS = {
    left: ['KeyA', 'KeyJ', 'ArrowLeft'],
    right: ['KeyD', 'KeyL', 'ArrowRight'],
    up: ['KeyW', 'KeyI', 'ArrowUp', 'Space', 'KeyZ'],
    down: ['KeyS', 'KeyK', 'ArrowDown', 'KeyX'],
    rotateCCW: ['KeyQ'],
    rotateCW: ['KeyE'],
    confirm: ['ShiftLeft', 'ShiftRight', 'Enter', 'NumpadEnter']
};
const THEME = {
    bg: '#0b0d13',
    panel: 'rgba(255, 255, 255, 0.05)',
    panelBorder: 'rgba(255, 255, 255, 0.14)',
    panelBorderActive: '#3aa0ff',
    text: '#f4f6fb',
    textMuted: '#8891a3',
    accent: '#3aa0ff',
    playerColors: ['#3aa0ff', '#ff5470', '#4ade80', '#fbbf24', '#a78bfa', '#38bdf8'],
    playerHues: [0, 34, 67, 100, 133, 167],
    success: '#4ade80',
    warning: '#ffb454',
    danger: '#ff5470',
    font: 'Arial, sans-serif',
    pointColors: {
        goal: '#4ade80',       
        firstPlace: '#ffdd57', 
        comeback: '#a78bfa',   
        solo: '#ff8c42'        
    },
    pointLabels: {
        goal: 'Goal',
        firstPlace: 'First Place',
        comeback: 'Comeback',
        solo: 'Solo Finish'
    }
};
// Turns a sprite hue-shift value (0-199, see LevelRenderer.applyColorEffect)
// into a representative hex color for UI use (name tags, lobby swatches).
// This is a stylistic approximation for UI only — the actual in-game look is
// whatever applyColorEffect produces on the real sprite pixels.
// Important: hueShift is a *rotation* applied on top of the sprite's native
// color, and the source art (assets/player/stand.png) is yellow (#ffff00,
// ~60deg) at hueShift 0 — not red (0deg). That base offset has to be added
// here or this approximation drifts from the real sprite color.
const PLAYER_BASE_HUE_DEG = 60;
function hueShiftToHex(hueShift) {
    const degrees = (PLAYER_BASE_HUE_DEG + ((hueShift % 200) / 200) * 360) % 360;
    const h = degrees / 60;
    const s = 0.65, l = 0.55;
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs(h % 2 - 1));
    const m = l - c / 2;
    const [r, g, b] =
        h < 1 ? [c, x, 0] :
        h < 2 ? [x, c, 0] :
        h < 3 ? [0, c, x] :
        h < 4 ? [0, x, c] :
        h < 5 ? [x, 0, c] : [c, 0, x];
    const toHex = v => Math.round((v + m) * 255).toString(16).padStart(2, '0');
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

const STAGE_SELECT_BOX_WIDTH = 255;
const STAGE_PREVIEW_ASPECT = 10 / 15; 
let LEVEL_POOL = [];
let LEVEL_NAMES = [];
fetch('levels.json')
    .then(res => res.json())
    .then(levels => {
        LEVEL_POOL = levels.map(level => level.code);
        LEVEL_NAMES = levels.map(level => level.name);
    })
    .catch(err => console.error('[levels] failed to load levels.json:', err));

class Game {
    constructor(canvasId, playerCount = 2, network = null) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
        
        this.canvas.width = 960;
        this.canvas.height = 540;

        this.renderer = new LevelRenderer(this.canvas);
        this.levelData = null;
        this.physics = null;
        this.mapSnapshot = null;
        this.mapRotationSnapshot = null;
        this.lastBuiltLevelCode = null;
        this.onLevelCodeSaved = null;
        this.onFinalResults = null;
        this.onFinalResultsHidden = null;
        this.onHostChanged = null; // (hostSeatIndex, isHost) - fired outside of ROOM_STATE, e.g. when the host's tab closes mid-match
        this.playerCount = Math.max(MIN_PLAYERS, Math.min(MAX_PLAYERS, Math.floor(playerCount) || 2));
        this.localSeatIndex = 0;
        this.players = this.createPlayers(this.playerCount, this.localSeatIndex);

        this.camera = { x: 0, y: 0, zoom: 1.25};
        this.cameraLookahead = { x: 0, y: 0 }; // eased "push" offset ahead of travel direction, see updateCameraLookahead()
        this.cameraMode = 0; // 0 = follow active players (default), 1 = fit start & finish, 2 = center on local player
        this.showDebugMenu = false;
        this._fpsFrameTimes = [];
        this._fps = 0;
        this.ping = null;
        this.lastPingSentAt = null;
        this.keys = {};
        this.tick = 0;
        this.gameState = GameState.MENU;
        this.network = network;
        this.roomCode = null;
        this.isHost = false;
        this.remotePositions = new Map();
        this.remoteSfxState = new Map();

        if (this.network) {
            this.bindNetwork();
        }
        this.roundEndFrames = 0;
        this.ROUND_END_DELAY_FRAMES = 30;
        this.RACE_TIME_LIMIT = 60; 
        this.raceTimeRemaining = this.RACE_TIME_LIMIT;

        this.assetsLoadedCount = 0;
        this.totalAssets = 201; 
        this.totalRounds = 10;
        this.POINTS_TO_WIN = 15;
        this.currentRound = 1;
        this.MAX_POSSIBLE_SCORE = this.totalRounds * 3;
        this.roundResultsAnimFrames = 0;
        this.ROUND_RESULTS_ANIM_FRAMES = 15;
        this.stageCandidates = [];
        this.stageThumbnails = new Map();
        this.PARTY_BOX_SLOT_COUNT = Math.ceil(1.5 * this.playerCount);
        this.PARTY_TIME_LIMIT = 12; 
        this.partySlots = [];
        this.partyTimeRemaining = this.PARTY_TIME_LIMIT;
        this.lastRoundDeaths = { anyEliminated: false, allEliminated: false };
        this.BUILD_TIME_LIMIT = 20; 
        this.buildTimeRemaining = this.BUILD_TIME_LIMIT;
        this.giveUpHoldFrames = 0;
        this.GIVE_UP_HOLD_FRAMES = 90;
        // Ignore give-up input for the first stretch of a race. Without this,
        // players who mash/hold confirm to place their last build piece (or
        // are still holding it down as the race loads in) can end up
        // accidentally starting a give-up hold the instant they spawn.
        this.GIVE_UP_LOCKOUT_SECONDS = 1;

        if (typeof replayCode !== 'undefined' && replayCode) {
            this.decodedReplayCode = decodeReplayCode(replayCode);
        }

        window.addEventListener('keydown', e => {
            this.keys[e.code] = true;
            if (e.code === 'Digit2' && !e.repeat) {
                this.showDebugMenu = !this.showDebugMenu;
                if (this.showDebugMenu && this.network && this.network.isConnected) this.network.sendPing();
                console.log(`[debug] menu ${this.showDebugMenu ? 'ON' : 'OFF'}`);
            }

            if (this.gameState === GameState.STAGE_SELECT) {
                this.handleStageSelectInput(e.code);
            } else if (this.gameState === GameState.PARTY_BOX) {
                this.handlePartyBoxInput(e.code);
            } else if (this.gameState === GameState.BUILD) {
                this.handleBuildInput(e.code);
            }
            if (e.code === 'Digit1' && !e.repeat && this.gameState === GameState.RACE) {
                this.cameraMode = (this.cameraMode + 1) % 3;
            }
            if (e.code === 'Enter' || e.code === 'NumpadEnter' || e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
                this.advanceFromPlaceholder();
            }
        });
        window.addEventListener('keyup', e => {
            this.keys[e.code] = false;
        });
    }
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
                physicsState: null,
                stageCursor: 0,
                stageVoteLocked: false,
                partyCursor: 0,
                piece: null,
                buildCursor: { col: 0, row: 0 },
                buildRotation: 0,
                buildPlaced: false,
                score: 0,
                scoreBeforeRound: 0,
                lastRoundPoints: 0,
                lastRoundBreakdown: { goal: 0, firstPlace: 0, comeback: 0, solo: 0 },
                scoreBreakdown: { goal: 0, firstPlace: 0, comeback: 0, solo: 0 },
                breakdownBeforeRound: { goal: 0, firstPlace: 0, comeback: 0, solo: 0 },
                pointHistory: [],
                historyBeforeRound: [],
                lastRoundEntries: [],
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
    getStageBoxWidth(candidateCount) {
        const margin = 40;
        const gap = 24;
        const n = Math.max(1, candidateCount);
        const available = (this.canvas.width - margin * 2 - gap * (n - 1)) / n;
        return Math.max(90, Math.min(STAGE_SELECT_BOX_WIDTH, available));
    }
    getStageBoxHeight(boxWidth) {
        // Derived from the actual thumbnail + title layout below (thumbPad,
        // STAGE_PREVIEW_ASPECT, and the thumb-to-title gap) instead of a
        // fixed width/height ratio. The title text is a fixed pixel size
        // and doesn't shrink along with the box, so tying the box height to
        // the thumbnail's own height (plus fixed padding for the label)
        // keeps the label from leaking out the bottom when more candidates
        // make the boxes narrower/shorter.
        const thumbPad = 12;
        const thumbW = boxWidth - thumbPad * 2;
        const thumbH = thumbW * STAGE_PREVIEW_ASPECT;
        const titleGap = 24; // gap from bottom of thumb to title baseline
        const bottomMargin = 20; // room below the title baseline for descenders
        return thumbPad + thumbH + titleGap + bottomMargin;
    }
    enterStageSelect() {
        this.stageCandidates = this.pickStageCandidates();
        this.players.forEach(p => { p.stageCursor = 0; p.stageVoteLocked = false; });
        this.gameState = GameState.STAGE_SELECT;
        const boxWidth = this.getStageBoxWidth(this.stageCandidates.length);
        const thumbW = boxWidth - 24;
        const thumbH = thumbW * STAGE_PREVIEW_ASPECT;
        this.stageCandidates.forEach(code => this.generateStageThumbnail(code, thumbW, thumbH));
    }
    generateStageThumbnail(levelCode, width = 150, height = 74) {
        if (this.stageThumbnails.has(levelCode)) return this.stageThumbnails.get(levelCode);
        if (!this.renderer.assetsLoaded) return null;

        const levelData = LevelRenderer.getDataFromCode(levelCode);
        if (!levelData) return null;

        const cols = levelData.size_x;
        const rows = Math.floor(levelData.map.length / cols);
        const hue = this.renderer.fixHue(levelData.hue);
        const activeTileset = this.renderer.getHuedTileset(hue);
        const renderScale = Math.min(3, Math.max(2, window.devicePixelRatio || 1));
        const canvasWidth = Math.round(width * renderScale);
        const canvasHeight = Math.round(height * renderScale);

        const thumbCanvas = document.createElement('canvas');
        thumbCanvas.width = canvasWidth;
        thumbCanvas.height = canvasHeight;
        const ctx = thumbCanvas.getContext('2d');
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';

        ctx.fillStyle = THEME.bg;
        ctx.fillRect(0, 0, canvasWidth, canvasHeight);

        // Anchor the "camera" on the start/finish span, mirroring the
        // in-race "fit start & finish" camera mode - but then render every
        // tile that actually falls within the resulting viewport, not just
        // the tiles inside a tightly-padded box around those two points.
        // Otherwise tiles that are on-screen (because the box was widened
        // to match the canvas aspect ratio) never get drawn and the level
        // looks cut off.
        const REGION_PAD = 2;
        const spawnIdx = levelData.map.indexOf(76);
        const finishIdx = levelData.map.indexOf(63);
        let centerCol = cols / 2;
        let centerRow = rows / 2;
        let boxCols = Math.min(15, cols);
        let boxRows = Math.min(10, rows);
        if (spawnIdx >= 0 && finishIdx >= 0) {
            const spawnCol = spawnIdx % cols, spawnRow = Math.floor(spawnIdx / cols);
            const finishCol = finishIdx % cols, finishRow = Math.floor(finishIdx / cols);
            centerCol = (spawnCol + finishCol) / 2 + 0.5;
            centerRow = (spawnRow + finishRow) / 2 + 0.5;
            boxCols = Math.abs(finishCol - spawnCol) + REGION_PAD * 2;
            boxRows = Math.abs(finishRow - spawnRow) + REGION_PAD * 2;
        }
        boxCols = Math.max(1, boxCols);
        boxRows = Math.max(1, boxRows);

        const MARGIN = 0.9;
        const tile = Math.min(canvasWidth / boxCols, canvasHeight / boxRows) * MARGIN;

        // Continuous viewport bounds in tile units (row grows upward, like
        // the in-game world, so "top" corresponds to the largest row).
        const visibleCols = canvasWidth / tile;
        const visibleRows = canvasHeight / tile;
        const leftCol = centerCol - visibleCols / 2;
        const topRow = centerRow + visibleRows / 2;

        const firstCol = Math.max(0, Math.floor(leftCol));
        const lastCol = Math.min(cols - 1, Math.ceil(leftCol + visibleCols) - 1);
        const lastRow = Math.min(rows - 1, Math.ceil(topRow) - 1);
        const firstRow = Math.max(0, Math.floor(topRow - visibleRows));

        for (let row = firstRow; row <= lastRow; row++) {
            const rowBase = row * cols;
            const tileY = (topRow - (row + 0.5)) * tile;
            for (let col = firstCol; col <= lastCol; col++) {
                const rawTileVal = levelData.map[rowBase + col];
                if (!rawTileVal) continue;

                const rotation = levelData.rotations[rowBase + col] % 4;
                const tileX = (col + 0.5 - leftCol) * tile;
                for (let isForeground = 0; isForeground <= 1; isForeground++) {
                    const offset = isForeground * 86;
                    const tileImg = activeTileset[rawTileVal - 1 + offset];
                    if (!tileImg) continue;
                    ctx.save();
                    ctx.translate(tileX, tileY);
                    if (rotation !== 1) {
                        ctx.rotate((rotation - 1) * Math.PI / 2);
                    }
                    ctx.drawImage(tileImg, -tile / 2, -tile / 2, tile, tile);
                    ctx.restore();
                }
            }
        }

        this.stageThumbnails.set(levelCode, thumbCanvas);
        return thumbCanvas;
    }
    pickStageCandidates() {
        return LEVEL_POOL.slice();
    }
    handleStageSelectInput(code) {
        const numCandidates = this.stageCandidates.length;
        if (numCandidates === 0) return;

        for (const player of this.players) {
            if (!player.controls) continue; 

            if (player.controls.left.includes(code)) {
                if (player.stageVoteLocked) continue;
                player.stageCursor = (player.stageCursor - 1 + numCandidates) % numCandidates;
                playSfx('hover');
                if (this.network) this.network.sendStageCursorMove(player.stageCursor);
            } else if (player.controls.right.includes(code)) {
                if (player.stageVoteLocked) continue;
                player.stageCursor = (player.stageCursor + 1) % numCandidates;
                playSfx('hover');
                if (this.network) this.network.sendStageCursorMove(player.stageCursor);
            } else if (player.controls.confirm.includes(code)) {
                if (player.stageVoteLocked) {
                    player.stageVoteLocked = false;
                    continue;
                }
                player.stageVoteLocked = true;
                if (this.network) {
                    this.network.sendStagePickRequest(player.stageCursor);
                } else {
                    playSfx('select');
                    this.confirmStageSelection(player.stageCursor);
                }
            }
        }
    }
    confirmStageSelection(index) {
        if (this.gameState !== GameState.STAGE_SELECT) return;
        const chosenCode = this.stageCandidates[index];
        this.loadLevel(chosenCode);
        this.enterPartyBox();
    }
    enterPartyBox() {
        const { anyEliminated, allEliminated } = this.lastRoundDeaths;
        this.partySlots = this.pickPartySlots(this.PARTY_BOX_SLOT_COUNT, anyEliminated, allEliminated);
        this.players.forEach(p => {
            p.partyCursor = 0;
            p.piece = null;
        });
        this.partyTimeRemaining = this.PARTY_TIME_LIMIT;
        this.gameState = GameState.PARTY_BOX;
    }
    pickPartySlots(count, allowBomb, guaranteeBomb) {
        const pool = allowBomb ? PIECE_POOL : PIECE_POOL.filter(p => p.id !== 'bomb');
        const slots = [];
        for (let i = 0; i < count; i++) {
            const piece = pool[Math.floor(Math.random() * pool.length)];
            slots.push(piece);
        }
        if (guaranteeBomb && count > 0 && !slots.some(p => p.id === 'bomb')) {
            slots[Math.floor(Math.random() * count)] = getPieceById('bomb');
        }
        return slots;
    }
    handlePartyBoxInput(code) {
        if (this.partySlots.length === 0) return;

        for (const player of this.players) {
            if (!player.controls) continue;
            if (player.piece) continue;

            if (player.controls.left.includes(code)) {
                player.partyCursor = this.findNextPartySlot(player.partyCursor, -1);
                playSfx('hover');
                if (this.network) this.network.sendPartyCursorMove(player.partyCursor);

            } else if (player.controls.right.includes(code)) {
                player.partyCursor = this.findNextPartySlot(player.partyCursor, 1);
                playSfx('hover');
                if (this.network) this.network.sendPartyCursorMove(player.partyCursor);

            } else if (player.controls.confirm.includes(code)) {
                if (this.network) {
                    this.network.sendPartyPickRequest(player.partyCursor);
                } else {
                    playSfx('select');
                    this.confirmPartyPick(player);
                }
            }
        }
    }
    findNextPartySlot(fromIndex, direction) {
        const n = this.partySlots.length;
        for (let step = 1; step <= n; step++) {
            const idx = ((fromIndex + direction * step) % n + n) % n;
            if (this.partySlots[idx]) return idx;
        }
        return fromIndex;
    }
    confirmPartyPick(player) {
        const slot = this.partySlots[player.partyCursor];
        if (!slot) return; 
        if (player.piece) return; 

        player.piece = slot;
        console.log(`${player.name} grabbed ${slot.name}`);

        this.partySlots[player.partyCursor] = null;
        this.checkPartyBoxComplete();
    }
    checkPartyBoxComplete() {
        if (this.players.every(p => p.piece)) {
            this.enterBuild();
        }
    }
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
        if (remainingIndices.length === 0) return; 

        const pick = remainingIndices[Math.floor(Math.random() * remainingIndices.length)];
        const slot = this.partySlots[pick];

        player.piece = slot;
        this.partySlots[pick] = null;
    }
    enterBuild() {
        this.buildTimeRemaining = this.BUILD_TIME_LIMIT;
        if (this.physics && this.mapSnapshot) {
            for (let i = 0; i < this.mapSnapshot.length; i++) {
                this.physics.MAP[i] = this.mapSnapshot[i];
                this.physics.MAP_R[i] = this.mapRotationSnapshot[i];
            }
            this.physics.worldActiveIdx.length = 0;
            this.physics.worldActiveTyp.length = 0;
            this.physics.worldActiveFrame.length = 0;
            this.physics.worldActiveSpawn.length = 0;
            this.physics.tileUpdates.length = 0;
        }

        const startCell = this.findPlaceableCellNear(this.getSpawnCell());
        this.players.forEach(p => {
            p.buildRotation = 0;
            p.buildPlaced = false;
            p.buildCursor = { ...startCell };
            p.buildMoveHold = { up: 0, down: 0, left: 0, right: 0 };
        });

        this.gameState = GameState.BUILD;
    }
    getSpawnCell() {
        const cols = this.levelData.size_x;
        const spawnIdx = this.physics.MAP.indexOf(76);
        if (spawnIdx >= 0) {
            return { col: spawnIdx % cols, row: Math.floor(spawnIdx / cols) };
        }
        const rows = Math.floor(this.physics.MAP.length / cols);
        return { col: Math.floor(cols / 2), row: Math.floor(rows / 2) };
    }
    getFinishCell() {
        const cols = this.levelData.size_x;
        const finishIdx = this.physics.MAP.indexOf(63);
        if (finishIdx >= 0) {
            return { col: finishIdx % cols, row: Math.floor(finishIdx / cols) };
        }
        return this.getSpawnCell();
    }
    buildCellIndex(cell) {
        return cell.col + cell.row * this.levelData.size_x;
    }
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
    handleBuildInput(code) {
        for (const player of this.players) {
            if (!player.controls) continue;
            if (!player.piece || player.buildPlaced) continue;

            const c = player.controls;
            let moved = false;
            if (c.rotateCCW.includes(code)) { this.rotateBuildPiece(player, -1); moved = true; playSfx('hover'); }
            else if (c.rotateCW.includes(code)) { this.rotateBuildPiece(player, 1); moved = true; playSfx('hover'); }
            else if (c.confirm.includes(code)) {
                if (this.network) {
                    this.network.sendPlacePieceRequest(
                        player.piece.id, player.buildCursor.col, player.buildCursor.row, player.buildRotation
                    );
                } else {
                    playSfx('select');
                    this.confirmBuildPlacement(player);
                }
            }

            if (moved && this.network) {
                this.network.sendBuildCursorMove(player.buildCursor.col, player.buildCursor.row, player.buildRotation);
            }
        }
    }
    updateBuildCursorMovement() {
        const DIRS = [
            ['up', 0, 1],
            ['down', 0, -1],
            ['left', -1, 0],
            ['right', 1, 0]
        ];
        const INITIAL_DELAY_FRAMES = 10;  
        const REPEAT_INTERVAL_FRAMES = 4; 

        for (const player of this.players) {
            if (!player.controls) continue;
            if (!player.piece || player.buildPlaced) continue;
            if (!player.buildMoveHold) player.buildMoveHold = { up: 0, down: 0, left: 0, right: 0 };

            const c = player.controls;
            let moved = false;

            for (const [dir, dCol, dRow] of DIRS) {
                const held = c[dir].some(code => this.keys[code]);
                if (!held) {
                    player.buildMoveHold[dir] = 0;
                    continue;
                }

                player.buildMoveHold[dir]++;
                const frames = player.buildMoveHold[dir];
                const shouldMove =
                    frames === 1 ||
                    (frames > INITIAL_DELAY_FRAMES &&
                        (frames - INITIAL_DELAY_FRAMES) % REPEAT_INTERVAL_FRAMES === 0);

                if (shouldMove) {
                    this.moveBuildCursor(player, dCol, dRow);
                    moved = true;
                }
            }

            if (moved && this.network) {
                this.network.sendBuildCursorMove(player.buildCursor.col, player.buildCursor.row, player.buildRotation);
            }
        }
    }
    moveBuildCursor(player, dCol, dRow) {
        const cols = this.levelData.size_x;
        const rows = Math.floor(this.physics.MAP.length / cols);
        const cursor = player.buildCursor;
        const nextCol = cursor.col + dCol;
        const nextRow = cursor.row + dRow;
        if (nextCol < 0 || nextCol >= cols || nextRow < 0 || nextRow >= rows) return;
        cursor.col = nextCol;
        cursor.row = nextRow;
    }
    rotateBuildPiece(player, delta) {
        player.buildRotation = ((player.buildRotation + delta) % 4 + 4) % 4;
    }
    getPieceWorldCells(piece, rotation, anchorCell) {
        return getPieceFootprintCells(piece, rotation).map(cellOffset => ({
            col: anchorCell.col + cellOffset.dCol,
            row: anchorCell.row + cellOffset.dRow,
            tile: cellOffset.tile
        }));
    }
    footprintFits(cells, piece = null) {
        const cols = this.levelData.size_x;
        const rows = Math.floor(this.physics.MAP.length / cols);
        const cellOk = (idx) => (piece && piece.targetsSolid)
            ? true
            : this.physics.isPlaceableCell(idx);
        return cells.every(cell => {
            if (cell.col < 0 || cell.col >= cols || cell.row < 0 || cell.row >= rows) return false;
            return cellOk(this.buildCellIndex(cell));
        });
    }
    confirmBuildPlacement(player) {
        if (player.buildPlaced) return;
        const placed = this.placeBuildPiece(player);
        if (!placed) return; 
        player.buildPlaced = true;
        this.checkBuildComplete();
    }
    placeBuildPiece(player) {
        const piece = player.piece;
        const cursor = player.buildCursor;
        const rotation = player.buildRotation;
        if (!piece) return false;

        const cells = this.getPieceWorldCells(piece, rotation, cursor);
        if (!this.footprintFits(cells, piece)) return false;

        const cellOk = (idx) => piece.targetsSolid
            ? this.physics.isDeletableCell(idx)
            : this.physics.isPlaceableCell(idx);
        for (const cell of cells) {
            if (!cellOk(this.buildCellIndex(cell))) continue;
            const idx = this.buildCellIndex(cell);
            this.physics.MAP[idx] = cell.tile;
            this.physics.MAP_R[idx] = rotation;
        }

        console.log(`${player.name} placed ${piece.name} at (${cursor.col}, ${cursor.row}) rot ${rotation}`);
        return true;
    }
    checkBuildComplete() {
        const allDone = this.players.every(p => !p.piece || p.buildPlaced);
        if (allDone) {
            this.snapshotBuiltMap();
            this.recordBuiltLevelCode();
            this.gameState = GameState.RACE;
            this.resetRoundState();
        }
    }
    recordBuiltLevelCode() {
        if (typeof encodeLevelCode !== 'function' || !this.physics || !this.levelData) return;
        const code = encodeLevelCode({
            map: this.physics.MAP,
            rotations: this.physics.MAP_R,
            size_x: this.levelData.size_x,
            MAP_DATA: this.levelData.MAP_DATA,
            wall: this.levelData.wall,
            hue: this.levelData.hue,
            hue2: this.levelData.hue2
        });
        this.lastBuiltLevelCode = code;
        console.log('[levelCode] built level saved:', code);
        if (this.onLevelCodeSaved) this.onLevelCodeSaved(code);
    }
    snapshotBuiltMap() {
        if (!this.physics) return;
        this.mapSnapshot = this.physics.MAP.slice();
        this.mapRotationSnapshot = this.physics.MAP_R.slice();
    }
    resetRoundState() {
        this.roundEndFrames = 0;
        this.raceTimeRemaining = this.RACE_TIME_LIMIT;
        if (this.physics && this.mapSnapshot) {
            for (let i = 0; i < this.mapSnapshot.length; i++) {
                this.physics.MAP[i] = this.mapSnapshot[i];
                this.physics.MAP_R[i] = this.mapRotationSnapshot[i];
            }
            this.physics.worldActiveIdx.length = 0;
            this.physics.worldActiveTyp.length = 0;
            this.physics.worldActiveFrame.length = 0;
            this.physics.worldActiveSpawn.length = 0;
        }
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
        this.remoteSfxState.clear();
    }
    advanceFromPlaceholder() {
        if (this.network) {
            if (this.gameState === GameState.ROUND_RESULTS) {
                if (this.localContinueConfirmed) return;
                this.localContinueConfirmed = true;
                playSfx('select');
                this.network.sendContinueRequest();
            }
            return;
        }
        if (this.gameState === GameState.ROUND_RESULTS) {
            playSfx('select');
        }
        switch (this.gameState) {
            case GameState.ROUND_RESULTS: {
                const someoneWon = this.players.some(p => p && p.score >= this.POINTS_TO_WIN);
                if (someoneWon || this.currentRound >= this.totalRounds) {
                    this.playAgain();
                } else {
                    this.currentRound += 1;
                    this.enterPartyBox();
                }
                break;
            }
            default:
                break;
        }
    }
    playAgain() {
        this.players.forEach(p => {
            p.score = 0;
            p.scoreBeforeRound = 0;
            p.lastRoundPoints = 0;
            p.lastRoundBreakdown = { goal: 0, firstPlace: 0, comeback: 0, solo: 0 };
            p.scoreBreakdown = { goal: 0, firstPlace: 0, comeback: 0, solo: 0 };
            p.breakdownBeforeRound = { goal: 0, firstPlace: 0, comeback: 0, solo: 0 };
            p.pointHistory = [];
            p.historyBeforeRound = [];
            p.lastRoundEntries = [];
            p.physicsState = null;
            p.eliminated = false;
            p.hasFinished = false;
            p.dnf = false;
            p.finishTick = null;
            p.piece = null;
            p.buildPlaced = false;
        });
        this.currentRound = 1;
        this.lastRoundDeaths = { anyEliminated: false, allEliminated: false };
        this.gameState = GameState.MENU;
        if (this.onFinalResultsHidden) this.onFinalResultsHidden();

        const startScreen = document.getElementById('startScreen');
        if (startScreen) {
            startScreen.style.display = 'flex';
        }
    }
    startGame(levelCode) {
        this.gameState = GameState.LOADING;
        this.init(levelCode);
    }
    startGameNetworked() {
        this.gameState = GameState.LOADING;
        this.init(null);
    }
    loadLevel(levelCode) {
        this.currentLevelCode = levelCode;
        this.levelData = LevelRenderer.getDataFromCode(levelCode);

        this.physics = new AppelPhysics(
            this.levelData.map,
            this.levelData.rotations,
            this.levelData.MAP_DATA,
            this.levelData.size_x
        );
        this.mapSnapshot = null;
        this.mapRotationSnapshot = null;
        const sharedOBJ = this.physics.spawnOBJ(this.levelData);
        this.players.forEach(p => {
            p.physicsState = this.physics.createDefaultGameState(sharedOBJ);
        });
    }
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
            this.assetsLoadedCount++;
        }

        this.renderer.loadAssets(() => {
            this.assetsLoadedCount++;
        });
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
                this.recordFrame(now);

                if (this.gameState === GameState.LOADING) {
                    this.checkLoadStatus();
                    this.drawLoadingScreen();
                } else {
                    this.gameLoop();
                }

                if (this.showDebugMenu) this.drawDebugMenu();
            }
        }, 1);

        if (this.network) {
            this.network.sendPing();
            setInterval(() => {
                if (this.network.isConnected) this.network.sendPing();
            }, 2000);
        }
    }
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
    fillBackground() {
        this.ctx.fillStyle = THEME.bg;
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }
    drawScreenTitle(text) {
        this.ctx.textAlign = "center";
        this.ctx.font = "bold 26px " + THEME.font;
        this.ctx.fillStyle = THEME.text;
        this.ctx.fillText(text, this.canvas.width / 2, 44);
    }
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
    drawCountdownRing(remaining, limit, textColor = null) {
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
        this.ctx.fillStyle = textColor || (urgent ? THEME.danger : THEME.text);
        this.ctx.fillText(`${Math.ceil(remaining)}`, cx, cy + 5);
    }
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
        this.ctx.fillStyle = THEME.accent;
        this.ctx.fill();

        this.ctx.restore();

        this.ctx.fillStyle = THEME.textMuted;
        this.ctx.font = "12px " + THEME.font;
        this.ctx.fillText(`Stage ${index + 1}`, cx, cy + size / 3 + 20);
    }
    getInputKeysFor(player) {
        if (this.gameState !== GameState.RACE) return "";
        if (player.hasFinished || player.eliminated) return ""; 
        if (!player.controls) return ""; 

        let keys = '';
        if (this.decodedReplayCode) {
            keys = this.decodedReplayCode[this.tick];
        }

        if (player.controls.right.some(k => this.keys[k])) keys += 'D';
        if (player.controls.left.some(k => this.keys[k])) keys += 'A';
        if (player.controls.down.some(k => this.keys[k])) keys += 'S';
        if (player.controls.up.some(k => this.keys[k])) keys += 'W';

        return keys;
    }
    handleRemotePositionSync(payload) {
        if (payload.seatIndex === this.localSeatIndex) return; 

        const sy = payload.sy;
        const onWall = !!payload.onWall;
        const prev = this.remoteSfxState.get(payload.seatIndex);

        if (prev && typeof playSfx === 'function') {
            const jumpImpulse = prev.sy <= 4 && sy >= 14;
            if (jumpImpulse && prev.onWall) {
                playSfx('wall_jump');
            } else if (jumpImpulse) {
                playSfx('jump');
            } else if (prev.sy < -4 && sy >= -1 && sy <= 4 && !onWall) {
                playSfx('land');
            }
        }
        this.remoteSfxState.set(payload.seatIndex, { sy, onWall });

        this.remotePositions.set(payload.seatIndex, {
            x: payload.x, y: payload.y, sx: payload.sx, sy: payload.sy, tick: payload.tick,
            direction: payload.direction, dir: payload.dir,
            crouched: !!payload.crouched, onWall: !!payload.onWall
        });
    }

    update() {
        const firstPlayer = this.players[0];
        if (!this.physics || !firstPlayer || !firstPlayer.physicsState) return;
        this.physics.tickObj(firstPlayer.physicsState.OBJ);
        const locallySimulatedStates = [];

        this.players.forEach((player) => {
            const isRemoteNetworked = this.network && !player.controls;

            if (isRemoteNetworked) {
                const pos = this.remotePositions.get(player.seatIndex);
                if (pos && player.physicsState) {
                    player.physicsState.PLAYER_X = pos.x;
                    player.physicsState.PLAYER_Y = pos.y;
                    player.physicsState.PLAYER_SX = pos.sx;
                    player.physicsState.PLAYER_SY = pos.sy;
                    if (pos.direction !== undefined) player.physicsState.direction = pos.direction;
                    if (pos.dir !== undefined) player.physicsState.PLAYER_DIR = pos.dir;
                    player.physicsState.player_state = pos.crouched ? 2 : 0;
                    player.physicsState.player_wall = pos.onWall ? 1 : null;
                }
            } else {
                const keys = this.getInputKeysFor(player);
                player.physicsState = this.physics.tick(player.physicsState, keys);
                locallySimulatedStates.push(player.physicsState);

                if (player.controls && this.network) {
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
        this.physics.tickWorldActive(this.players.map(p => p.physicsState), this.players.map(p => p.physicsState));
        if (this.physics.tileUpdates.length) {
            if (this.network) {
                for (const upd of this.physics.tileUpdates) {
                    this.network.sendTileUpdate(upd.idx, upd.tile, this.physics.MAP_R[upd.idx]);
                }
            }
            this.physics.tileUpdates.length = 0;
        }

        this.updateRaceCamera();

        if (this.network) {
            const localPlayer = this.players[this.localSeatIndex];
            if (localPlayer && localPlayer.physicsState) {
                if (localPlayer.physicsState.PLAYER_DEATH && !localPlayer.hasFinished && !localPlayer.eliminated && !localPlayer.reportedElimination) {
                    localPlayer.reportedElimination = true;
                    this.network.sendEliminationObserved(this.localSeatIndex, this.tick, 'death');
                }
            }
            for (const player of this.players) {
                if (!player.hasFinished && !player.reportedFinish && player.physicsState &&
                    this.physics.isFlagAt(player.physicsState.PLAYER_X, player.physicsState.PLAYER_Y)) {
                    player.reportedFinish = true;
                    this.network.sendFinishObserved(player.seatIndex, this.tick);
                }
            }
            return;
        }
        for (const player of this.players) {
            if (player.physicsState.PLAYER_DEATH && !player.hasFinished && !player.eliminated) {
                console.log(`${player.name} died!`);
                if (typeof playSfx === 'function') playSfx('boom');
                player.eliminated = true;
            }
        }
        if (this.raceTimeRemaining <= 0) {
            for (const player of this.players) {
                if (!player.hasFinished && !player.eliminated) {
                    console.log(`${player.name} ran out of time!`);
                    player.eliminated = true;
                    player.dnf = true;
                }
            }
        }
        for (const player of this.players) {
            if (!player.hasFinished &&
                this.physics.isFlagAt(player.physicsState.PLAYER_X, player.physicsState.PLAYER_Y)) {
                player.hasFinished = true;
                player.finishTick = this.tick;
                playSfx('finish');
                console.log(`${player.name} finished!`);
            }
        }
        const allPlayersFinished = this.players.every(p => p.hasFinished || p.eliminated);

        if (allPlayersFinished) {
            this.roundEndFrames += 1;
            if (this.roundEndFrames >= this.ROUND_END_DELAY_FRAMES) {
                this.players.forEach(p => { p.scoreBeforeRound = p.score; p.breakdownBeforeRound = { ...p.scoreBreakdown }; });
                this.awardRoundPoints();
                this.roundResultsAnimFrames = 0;
                this.gameState = GameState.ROUND_RESULTS;
                this.lastRoundDeaths = {
                    anyEliminated: this.players.some(p => p.eliminated),
                    allEliminated: this.players.length > 0 && this.players.every(p => p.eliminated)
                };
                const someoneWon = this.players.some(p => p && p.score >= this.POINTS_TO_WIN);
                if ((someoneWon || this.currentRound >= this.totalRounds) && this.onFinalResults) {
                    this.onFinalResults(this.lastBuiltLevelCode);
                }
            }
        } else {
            this.roundEndFrames = 0;
        }
    }

    // Computes a "camera push" offset that leans the view in the direction of
    // travel, scaled by speed and capped so it settles into a consistent
    // lookahead gap rather than growing unbounded at high speed. It's eased
    // on its own (slower than the camera's position tracking) so the push
    // builds in smoothly instead of snapping frame-to-frame with raw velocity
    // noise (bumps, wall-jump impulses, etc).
    updateCameraLookahead(vx, vy) {
        const LOOKAHEAD_PER_SPEED_X = 16;
        const LOOKAHEAD_PER_SPEED_Y = 16;
        const LOOKAHEAD_MAX_X = 260;
        const LOOKAHEAD_MAX_Y = 130;
        const LOOKAHEAD_EASE = 0.08;

        const targetX = Math.max(-LOOKAHEAD_MAX_X, Math.min(LOOKAHEAD_MAX_X, vx * LOOKAHEAD_PER_SPEED_X));
        const targetY = Math.max(-LOOKAHEAD_MAX_Y, Math.min(LOOKAHEAD_MAX_Y, vy * LOOKAHEAD_PER_SPEED_Y));

        this.cameraLookahead.x += (targetX - this.cameraLookahead.x) * LOOKAHEAD_EASE;
        this.cameraLookahead.y += (targetY - this.cameraLookahead.y) * LOOKAHEAD_EASE;
        return this.cameraLookahead;
    }

    updateRaceCamera() {
        if (this.cameraMode === 1) {
            this.updateRaceCameraFitStartFinish();
            return;
        }
        if (this.cameraMode === 2) {
            this.updateRaceCameraFollowLocalPlayer();
            return;
        }

        let active = this.players.filter(p => !p.eliminated && !p.hasFinished);
        const roundWrappingUp = active.length === 0;
        if (roundWrappingUp) active = this.players;
        if (active.length === 0) return; 

        const xs = active.map(p => p.physicsState.PLAYER_X);
        const ys = active.map(p => p.physicsState.PLAYER_Y);
        const vxs = active.map(p => p.physicsState.PLAYER_SX || 0);
        const vys = active.map(p => p.physicsState.PLAYER_SY || 0);

        const avgX = xs.reduce((a, b) => a + b, 0) / xs.length;
        const avgY = ys.reduce((a, b) => a + b, 0) / ys.length;
        const avgVX = vxs.reduce((a, b) => a + b, 0) / vxs.length;
        const avgVY = vys.reduce((a, b) => a + b, 0) / vys.length;
        const lookahead = this.updateCameraLookahead(avgVX, avgVY);

        const targetCameraX = avgX + lookahead.x;
        const targetCameraY = avgY + lookahead.y;

        const minX = Math.min(...xs), maxX = Math.max(...xs);
        const minY = Math.min(...ys), maxY = Math.max(...ys);
        
        // Define separate padding for X and Y to account for the widescreen aspect ratio
        const PADDING_X = 160; 
        const PADDING_Y = 80;  
        
        const boxW = Math.max(maxX - minX, 1);
        const boxH = Math.max(maxY - minY, 1);
        
        const zoomToFitX = Math.max(0, this.canvas.width - PADDING_X * 2) / boxW;
        const zoomToFitY = Math.max(0, this.canvas.height - PADDING_Y * 2) / boxH;
        const fitZoom = Math.min(zoomToFitX, zoomToFitY);

        const MAX_ZOOM = 1.25;
        const ZOOM_EPSILON = 0.05;
        const targetZoom = Math.max(ZOOM_EPSILON, Math.min(MAX_ZOOM, fitZoom));

        // Increased tracking interpolation (from 0.1 to 0.15) to prevent players outrunning the camera horizontally
        this.camera.x += (targetCameraX - this.camera.x) * 0.15;
        this.camera.y += ((targetCameraY - this.camera.y) + 8) * 0.15;
        
        const ZOOM_OUT_EASE = 0.6;
        const ZOOM_IN_EASE = 0.1;
        const ZOOM_REVEAL_EASE = 0.06;
        const zoomEase = roundWrappingUp
            ? ZOOM_REVEAL_EASE
            : (targetZoom < this.camera.zoom ? ZOOM_OUT_EASE : ZOOM_IN_EASE);
        this.camera.zoom += (targetZoom - this.camera.zoom) * zoomEase;
    }

    updateRaceCameraFitStartFinish() {
        const startWorld = this.buildCellToWorld(this.getSpawnCell());
        const finishWorld = this.buildCellToWorld(this.getFinishCell());

        const targetCameraX = (startWorld.x + finishWorld.x) / 2;
        const targetCameraY = (startWorld.y + finishWorld.y) / 2;

        const PADDING_X = 160;
        const PADDING_Y = 80;
        const boxW = Math.max(Math.abs(finishWorld.x - startWorld.x), 1);
        const boxH = Math.max(Math.abs(finishWorld.y - startWorld.y), 1);

        const zoomToFitX = Math.max(0, this.canvas.width - PADDING_X * 2) / boxW;
        const zoomToFitY = Math.max(0, this.canvas.height - PADDING_Y * 2) / boxH;
        const fitZoom = Math.min(zoomToFitX, zoomToFitY);

        const MAX_ZOOM = 1.25;
        const ZOOM_EPSILON = 0.05;
        const targetZoom = Math.max(ZOOM_EPSILON, Math.min(MAX_ZOOM, fitZoom));

        this.camera.x += (targetCameraX - this.camera.x) * 0.1;
        this.camera.y += (targetCameraY - this.camera.y) * 0.1;
        this.camera.zoom += (targetZoom - this.camera.zoom) * 0.1;
    }

    updateRaceCameraFollowLocalPlayer() {
        const localPlayer = this.players[this.localSeatIndex] || this.players[0];
        if (!localPlayer || !localPlayer.physicsState) return;

        const lookahead = this.updateCameraLookahead(
            localPlayer.physicsState.PLAYER_SX || 0,
            localPlayer.physicsState.PLAYER_SY || 0
        );
        const targetCameraX = localPlayer.physicsState.PLAYER_X + lookahead.x;
        const targetCameraY = localPlayer.physicsState.PLAYER_Y + lookahead.y;
        const targetZoom = 1.25;

        this.camera.x += (targetCameraX - this.camera.x) * 0.15;
        this.camera.y += ((targetCameraY - this.camera.y) + 8) * 0.15;
        this.camera.zoom += (targetZoom - this.camera.zoom) * 0.1;
    }

    pushPointHistoryEntries(player, breakdown) {
        const WITHIN_ROUND_ORDER = ['goal', 'firstPlace', 'solo', 'comeback'];
        const entries = [];
        for (const source of WITHIN_ROUND_ORDER) {
            const value = breakdown[source] || 0;
            if (value <= 0) continue;
            const entry = { source, value };
            entries.push(entry);
            player.pointHistory.push(entry);
        }
        player.lastRoundEntries = entries;
        return entries;
    }
    
    awardRoundPoints() {
        const finishers = this.players
            .filter(p => p.hasFinished)
            .sort((a, b) => a.finishTick - b.finishTick);

        const totalPlayers = this.players.filter(p => p !== null).length;
        const tooEasy = totalPlayers > 0 && finishers.length === totalPlayers;
        const tooHard = finishers.length === 0;

        const COMEBACK_SCORE_GAP = 5;
        const leaderScore = Math.max(0, ...this.players.filter(p => p !== null).map(p => p.score));

        this.players.forEach(p => {
            if (!p) return;
            p.lastRoundPoints = 0;
            p.lastRoundBreakdown = { goal: 0, firstPlace: 0, comeback: 0, solo: 0 };
            p.historyBeforeRound = [...p.pointHistory];
            p.lastRoundEntries = [];
        });

        if (!tooHard) {
            finishers.forEach((player, i) => {
                const breakdown = { goal: 0, firstPlace: 0, comeback: 0, solo: 0 };

                if (!tooEasy) {
                    breakdown.goal = 3;

                    if (finishers.length === 1) breakdown.solo = 2;
                    else if (i === 0) breakdown.firstPlace = 1;

                    const behindBy = leaderScore - player.score;
                    if (behindBy >= COMEBACK_SCORE_GAP) breakdown.comeback = 2;
                } else if (i === 0 && totalPlayers > 2 && finishers.length > 1) {
                    // Everyone cleared the level, so no goal/comeback points, but the
                    // first player across the line still earns their placement point —
                    // unless this was a two-player match or a solo finish.
                    breakdown.firstPlace = 1;
                }

                player.lastRoundBreakdown = breakdown;
                player.lastRoundPoints = breakdown.goal + breakdown.firstPlace + breakdown.comeback + breakdown.solo;
                player.scoreBreakdown.goal += breakdown.goal;
                player.scoreBreakdown.firstPlace += breakdown.firstPlace;
                player.scoreBreakdown.comeback += breakdown.comeback;
                player.scoreBreakdown.solo += breakdown.solo;
                this.pushPointHistoryEntries(player, breakdown);
            });
        }

        this.players.forEach(p => { if (p) p.score += p.lastRoundPoints; });

        const summary = this.players
            .filter(p => p !== null)
            .map(p => `${p.name}: +${p.lastRoundPoints} (total ${p.score})`)
            .join(', ');
    }

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

            const status = player.eliminated ? 'dead' : (player.hasFinished ? 'won' : null);
            this.renderer.renderPlayer(playerPos, this.camera, player.hue, player.name, player.color, status);
        }

        this.renderer.renderDynamic(firstPlayer.physicsState.OBJ, this.camera);
    }

    drawOffscreenIndicators() {
        const ctx = this.ctx;
        const localPlayer = this.players[this.localSeatIndex] || this.players[0];
        if (!localPlayer) return;

        const w = this.canvas.width;
        const h = this.canvas.height;
        const margin = 28;
        const cx = w / 2;
        const cy = h / 2;
        const halfW = w / 2 - margin;
        const halfH = h / 2 - margin;

        for (const player of this.players) {
            if (player === localPlayer || !player.physicsState) continue;
            if (player.eliminated || player.hasFinished) continue;

            const worldX = player.physicsState.PLAYER_X;
            const worldY = player.physicsState.PLAYER_Y;
            const screenX = cx + this.camera.zoom * (worldX - this.camera.x);
            const screenY = cy + this.camera.zoom * (this.camera.y - worldY);

            const offscreen = screenX < margin || screenX > w - margin || screenY < margin || screenY > h - margin;
            if (!offscreen) continue;

            const dx = screenX - cx;
            const dy = screenY - cy;
            const angle = Math.atan2(dy, dx);

            const scale = Math.min(
                dx !== 0 ? Math.abs(halfW / dx) : Infinity,
                dy !== 0 ? Math.abs(halfH / dy) : Infinity
            );
            const arrowX = cx + dx * scale;
            const arrowY = cy + dy * scale;

            ctx.save();
            ctx.translate(arrowX, arrowY);
            ctx.rotate(angle);
            ctx.beginPath();
            ctx.moveTo(11, 0);
            ctx.lineTo(-7, -8);
            ctx.lineTo(-7, 8);
            ctx.closePath();
            ctx.fillStyle = player.color || '#ffffff';
            ctx.strokeStyle = 'rgba(0, 0, 0, 0.65)';
            ctx.lineWidth = 2;
            ctx.fill();
            ctx.stroke();
            ctx.restore();

            if (player.name) {
                const labelX = arrowX - Math.cos(angle) * 18;
                const labelY = arrowY - Math.sin(angle) * 18;
                ctx.save();
                ctx.font = 'bold 11px Arial, sans-serif';
                ctx.textAlign = 'center';
                ctx.lineWidth = 3;
                ctx.strokeStyle = '#000000';
                ctx.strokeText(player.name, labelX, labelY);
                ctx.fillStyle = player.color || '#ffffff';
                ctx.fillText(player.name, labelX, labelY);
                ctx.restore();
            }
        }
    }

    recordFrame(now) {
        const times = this._fpsFrameTimes;
        times.push(now);
        const cutoff = now - 1000;
        while (times.length && times[0] < cutoff) times.shift();
        this._fps = times.length;
    }

    drawDebugMenu() {
        const ctx = this.ctx;
        const localPlayer = this.players[this.localSeatIndex];
        const connectedCount = this.players.filter(p => p.connected !== false).length;

        const lines = [
            `FPS: ${this._fps}`,
            `Ping: ${this.ping !== null ? this.ping + ' ms' : 'n/a'}`,
            `Game state: ${this.gameState}`,
            `Tick: ${this.tick}`,
            `Round: ${this.currentRound}/${this.totalRounds}`,
            `Room: ${this.roomCode || 'offline'}`,
            `Seat: ${this.localSeatIndex} ${this.isHost ? '(host)' : ''}`,
            `Players: ${this.players.length} (${connectedCount} connected)`,
            `Camera mode: ${this.cameraMode}  zoom: ${this.camera.zoom.toFixed(2)}`,
            `Camera pos: ${this.camera.x.toFixed(0)}, ${this.camera.y.toFixed(0)}`
        ];

        if (localPlayer && localPlayer.physicsState) {
            const s = localPlayer.physicsState;
            lines.push(`Local pos: ${(s.PLAYER_X | 0)}, ${(s.PLAYER_Y | 0)}`);
        }

        ctx.save();
        ctx.font = '12px monospace';
        const paddingX = 10;
        const paddingY = 8;
        const lineHeight = 16;
        const boxWidth = 220;
        const boxHeight = paddingY * 2 + lineHeight * lines.length;
        const boxX = this.canvas.width - boxWidth - 10;
        const boxY = 10;

        ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
        ctx.fillRect(boxX, boxY, boxWidth, boxHeight);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
        ctx.lineWidth = 1;
        ctx.strokeRect(boxX, boxY, boxWidth, boxHeight);

        ctx.textAlign = 'left';
        ctx.fillStyle = '#4ade80';
        lines.forEach((line, i) => {
            ctx.fillText(line, boxX + paddingX, boxY + paddingY + lineHeight * (i + 1) - 4);
        });
        ctx.restore();
    }


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
                this.drawRoundResultsScreen(this.ctx);
                break;

            case GameState.MENU:
            default:
                break;
        }
    }

    raceLoop() {
        if (this.gameState === GameState.RACE) {
            this.raceTimeRemaining = Math.max(0, this.raceTimeRemaining - (1 / 30));
        }

        this.update();
        this.updateGiveUpHold();

        if (this.levelData) {
            this.renderer.render(this.levelData, this.camera);
        }

        this.drawEntities();
        this.drawOffscreenIndicators();

        this.drawRaceTimer();
        this.drawGiveUpHint();
        this.drawGiveUpRing();

        this.tick += 1;
    }
    
    updateGiveUpHold() {
        if (this.gameState !== GameState.RACE) {
            this.giveUpHoldFrames = 0;
            return;
        }
        const player = this.players.find(p => p && p.controls);
        if (!player || player.hasFinished || player.eliminated) {
            this.giveUpHoldFrames = 0;
            return;
        }
        const raceElapsedSeconds = this.RACE_TIME_LIMIT - this.raceTimeRemaining;
        if (raceElapsedSeconds < this.GIVE_UP_LOCKOUT_SECONDS) {
            // Still in the post-spawn grace period - don't let a held confirm
            // key (e.g. from placing the last build piece) count toward giving up.
            this.giveUpHoldFrames = 0;
            return;
        }
        const held = player.controls.confirm.some(code => this.keys[code]);
        if (held) {
            this.giveUpHoldFrames += 1;
            if (this.giveUpHoldFrames >= this.GIVE_UP_HOLD_FRAMES) {
                this.triggerGiveUp(player);
                this.giveUpHoldFrames = 0;
            }
        } else {
            this.giveUpHoldFrames = 0;
        }
    }

    triggerGiveUp(player) {
        if (!player || player.hasFinished || player.eliminated) return;
        console.log(`${player.name} gave up!`);
        player.eliminated = true;
        if (this.network) {
            if (!player.reportedElimination) {
                player.reportedElimination = true;
                this.network.sendEliminationObserved(this.localSeatIndex, this.tick, 'death');
            }
        } else if (typeof playSfx === 'function') {
            playSfx('boom');
        }
    }

    // A quiet, always-there hint so players can discover the give-up hold
    // without needing to already be pressing it. Hidden while the ring is
    // active (holding) and during the post-spawn lockout, so it doesn't
    // flicker on right as the race starts.
    drawGiveUpHint() {
        if (this.gameState !== GameState.RACE) return;
        if (this.giveUpHoldFrames > 0) return;

        const player = this.players.find(p => p && p.controls);
        if (!player || player.hasFinished || player.eliminated) return;

        const raceElapsedSeconds = this.RACE_TIME_LIMIT - this.raceTimeRemaining;
        if (raceElapsedSeconds < this.GIVE_UP_LOCKOUT_SECONDS) return;

        const ctx = this.ctx;
        ctx.save();
        ctx.font = '12px ' + THEME.font;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
        ctx.fillText('Hold SHIFT to give up', this.canvas.width / 2, this.canvas.height - 10);
        ctx.restore();
    }

    drawGiveUpRing() {
        if (this.giveUpHoldFrames <= 0) return;
        const cx = this.canvas.width / 2;
        const cy = this.canvas.height / 2;
        const radius = 36;
        const fraction = Math.min(1, this.giveUpHoldFrames / this.GIVE_UP_HOLD_FRAMES);

        const ctx = this.ctx;
        ctx.save();

        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
        ctx.fill();
        ctx.lineWidth = 5;
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, radius, -Math.PI / 2, -Math.PI / 2 + fraction * Math.PI * 2);
        ctx.closePath();
        ctx.fillStyle = THEME.danger || '#ff4757';
        ctx.fill();

        ctx.lineWidth = 2;
        ctx.strokeStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.stroke();

        ctx.fillStyle = '#000000';
        ctx.font = 'bold 12px ' + THEME.font;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('GIVE UP', cx, cy + radius + 18);

        ctx.restore();
    }

    drawRaceTimer() {
        this.drawCountdownRing(this.raceTimeRemaining, this.RACE_TIME_LIMIT, "#000000");
    }

    buildLoop() {
        this.buildTimeRemaining = Math.max(0, this.buildTimeRemaining - (1 / 30));
        if (this.buildTimeRemaining <= 0 && !this.network) {
            for (const player of this.players) {
                if (player.piece && !player.buildPlaced) {
                    this.confirmBuildPlacement(player);
                }
            }
        }

        this.updateBuildCursorMovement();
        this.updateBuildCamera();

        if (this.levelData) {
            this.renderer.render(this.levelData, this.camera);
        }
        this.drawBuildScreen();
    }

    updateBuildCamera() {
        const worlds = this.players.map(p => this.buildCellToWorld(p.buildCursor));
        const xs = worlds.map(w => w.x);
        const ys = worlds.map(w => w.y);

        const targetX = xs.reduce((a, b) => a + b, 0) / xs.length;
        const targetY = ys.reduce((a, b) => a + b, 0) / ys.length;

        const minX = Math.min(...xs), maxX = Math.max(...xs);
        const minY = Math.min(...ys), maxY = Math.max(...ys);

        // Match the same dynamic padding setup used in the race camera
        const PADDING_X = 160;
        const PADDING_Y = 80;
        
        const boxW = Math.max(maxX - minX, 1);
        const boxH = Math.max(maxY - minY, 1);
        
        const zoomToFitX = Math.max(0, this.canvas.width - PADDING_X * 2) / boxW;
        const zoomToFitY = Math.max(0, this.canvas.height - PADDING_Y * 2) / boxH;
        const fitZoom = Math.min(zoomToFitX, zoomToFitY);

        const MAX_ZOOM = 1.25;
        const ZOOM_EPSILON = 0.05;
        const targetZoom = Math.max(ZOOM_EPSILON, Math.min(MAX_ZOOM, fitZoom));

        this.camera.x += (targetX - this.camera.x) * 0.2;
        this.camera.y += (targetY - this.camera.y) * 0.2;

        const ZOOM_OUT_EASE = 0.6;
        const ZOOM_IN_EASE = 0.1;
        const zoomEase = targetZoom < this.camera.zoom ? ZOOM_OUT_EASE : ZOOM_IN_EASE;
        this.camera.zoom += (targetZoom - this.camera.zoom) * zoomEase;
    }

    buildCellToWorld(cell) {
        return {
            x: cell.col * TILE_SIZE + TILE_SIZE / 2,
            y: cell.row * TILE_SIZE + TILE_SIZE / 2
        };
    }
    buildCellToScreen(cell) {
        const world = this.buildCellToWorld(cell);
        const tileY = -world.y;
        return {
            x: this.canvas.width / 2 + this.camera.zoom * (world.x - this.camera.x),
            y: this.canvas.height / 2 + this.camera.zoom * (this.camera.y + tileY)
        };
    }
    drawBuildScreen() {
        this.drawScreenTitle('Build!');

        this.ctx.font = "13px " + THEME.font;
        this.ctx.fillStyle = THEME.textMuted;
        this.ctx.fillText(
            'Arrow keys to move, Q/E rotate, Enter/Shift to place.',
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
    drawBuildCursor(cursor, rotation, piece, placed, color, label) {
        const half = (this.camera.zoom * TILE_SIZE) / 2;
        const alpha = placed ? 0.3 : 0.55;

        const cells = getPieceFootprintCells(piece, rotation).map(cellOffset => ({
            col: cursor.col + cellOffset.dCol,
            row: cursor.row + cellOffset.dRow,
            tile: cellOffset.tile,
            rotation
        }));

        this.renderer.renderTilePreviews(this.levelData, this.camera, cells, alpha, piece);

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
    partyBoxLoop() {
        this.partyTimeRemaining = Math.max(0, this.partyTimeRemaining - (1 / 30));

        if (this.partyTimeRemaining <= 0 && !this.players.every(p => p.piece)) {
            this.autoAssignRemainingPartyPicks();
        }

        this.drawPartyBoxScreen();
    }
    drawCursorChips(cursorField, itemIndex, cx, boxY, lockedField = null) {
        const here = this.players.filter(p => p[cursorField] === itemIndex);
        if (here.length === 0) return;

        const chipHeight = 15;
        const gap = 2;
        const startY = boxY - 10 - here.length * (chipHeight + gap);

        this.ctx.font = "bold 11px " + THEME.font;
        here.forEach((player, i) => {
            const y = startY + i * (chipHeight + gap);
            const locked = lockedField && player[lockedField];
            this.ctx.fillStyle = locked ? THEME.success : player.color;
            this.ctx.fillText(locked ? `${player.name} ✓` : `${player.name} ▲`, cx, y);
        });
    }
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
    drawChosenLevelThumbnail() {
        const levelCode = this.currentLevelCode;
        if (!levelCode) return;

        const width = 110;
        const height = width * STAGE_PREVIEW_ASPECT;
        const x = this.canvas.width - 20 - width;
        const y = 60; // below the countdown ring (ring bottom edge is ~50px)

        const thumb = this.generateStageThumbnail(levelCode, width, height) || this.stageThumbnails.get(levelCode);

        this.ctx.save();
        this.roundRectPath(x, y, width, height, 8);
        this.ctx.fillStyle = THEME.panel;
        this.ctx.fill();
        this.ctx.strokeStyle = THEME.panelBorder;
        this.ctx.lineWidth = 1.5;
        this.ctx.stroke();

        if (thumb) {
            this.ctx.save();
            this.roundRectPath(x, y, width, height, 8);
            this.ctx.clip();
            this.ctx.drawImage(thumb, x, y, width, height);
            this.ctx.restore();
        }
        this.ctx.restore();
    }
    drawPartyBoxScreen() {
        this.fillBackground();
        this.drawScreenTitle('Party Box');
        this.drawRoundBadge();
        this.drawCountdownRing(this.partyTimeRemaining, this.PARTY_TIME_LIMIT);
        this.drawChosenLevelThumbnail();

        this.ctx.font = "14px " + THEME.font;
        this.ctx.fillStyle = THEME.textMuted;
        this.ctx.fillText(
            'Arrow keys to move, Enter/Shift to grab',
            this.canvas.width / 2, 78
        );

        const slots = this.partySlots;
        if (!slots || slots.length === 0) return;
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
    drawStageSelectScreen() {
        this.fillBackground();
        this.drawScreenTitle('Stage Select');
        this.drawRoundBadge();

        this.ctx.font = "14px " + THEME.font;
        this.ctx.fillStyle = THEME.textMuted;
        this.ctx.fillText(
            'Arrow keys to move, Enter/Shift to grab',
            this.canvas.width / 2, 82
        );

        const candidates = this.stageCandidates;
        if (!candidates || candidates.length === 0) return;

        const boxWidth = this.getStageBoxWidth(candidates.length);
        const boxHeight = this.getStageBoxHeight(boxWidth);
        const boxY = this.canvas.height / 2 - boxHeight / 2;
        const boxGap = 24;
        const totalWidth = candidates.length * boxWidth + (candidates.length - 1) * boxGap;
        const startCx = (this.canvas.width - totalWidth) / 2 + boxWidth / 2;

        candidates.forEach((code, i) => {
            const cx = startCx + i * (boxWidth + boxGap);
            const hasCursorHere = this.players.some(p => p.stageCursor === i);
            const hasLockedVoteHere = this.players.some(p => p.stageCursor === i && p.stageVoteLocked);

            this.ctx.save();

            this.roundRectPath(cx - boxWidth / 2, boxY, boxWidth, boxHeight, 10);
            this.ctx.fillStyle = THEME.panel;
            this.ctx.fill();

            this.ctx.strokeStyle = hasLockedVoteHere ? THEME.success : (hasCursorHere ? THEME.panelBorderActive : THEME.panelBorder);
            this.ctx.lineWidth = hasLockedVoteHere || hasCursorHere ? 2.5 : 1.5;
            this.ctx.stroke();

            const thumbPad = 12;
            const thumbW = boxWidth - thumbPad * 2;
            const thumbH = thumbW * STAGE_PREVIEW_ASPECT;
            const thumbX = cx - thumbW / 2;
            const thumbY = boxY + thumbPad;
            const thumb = this.generateStageThumbnail(code, thumbW, thumbH);
            if (thumb) {
                this.ctx.save();
                this.ctx.imageSmoothingEnabled = true;
                this.ctx.imageSmoothingQuality = 'high';
                this.roundRectPath(thumbX, thumbY, thumbW, thumbH, 9);
                this.ctx.clip();
                this.ctx.drawImage(thumb, thumbX, thumbY, thumbW, thumbH);
                this.ctx.restore();
            } else {
                this.drawLevelIcon(cx, boxY + boxHeight / 2 - 21, 69, i);
            }

            const levelIndex = LEVEL_POOL.indexOf(code);
            const levelTitle = (levelIndex !== -1 && LEVEL_NAMES[levelIndex]) ? LEVEL_NAMES[levelIndex] : 'Untitled Level';
            this.ctx.fillStyle = THEME.text;
            this.ctx.font = "19px " + THEME.font;
            this.ctx.fillText(levelTitle, cx, thumbY + thumbH + 24);

            this.drawCursorChips('stageCursor', i, cx, boxY, 'stageVoteLocked');

            this.ctx.restore();
        });
    }
    easeOutCubic(t) {
        const clamped = Math.max(0, Math.min(1, t));
        return 1 - Math.pow(1 - clamped, 3);
    }
    getRoundResultLabel(player) {
        if (!player) return { text: '-', color: THEME.textMuted };
        if (player.hasFinished) return { text: 'Finished', color: THEME.success };
        if (player.dnf) return { text: 'DNF', color: THEME.warning };
        if (player.eliminated) return { text: 'Eliminated', color: THEME.danger };
        return { text: '-', color: THEME.textMuted };
    }

    drawRoundResultsScreen() {
        const ctx = this.ctx; 
        if (!this.resultsAnimationStart) {
            this.resultsAnimationStart = Date.now();
        }
        const animDuration = 1500; 
        const elapsed = Date.now() - this.resultsAnimationStart;
        const rawProgress = Math.min(elapsed / animDuration, 1);
        const progress = 1 - Math.pow(1 - rawProgress, 3);
        ctx.fillStyle = '#1a1a2e';
        ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        const allPlayersForCheck = this.players.filter(p => p !== null);
        const someoneWon = allPlayersForCheck.some(p => (p.score || 0) >= this.POINTS_TO_WIN);
        const isLastRound = someoneWon || this.currentRound >= this.totalRounds;

        if (this.gameState === GameState.ROUND_RESULTS) {
            this.drawScreenTitle(isLastRound ? 'Final Results' : 'Round Results');

            if (isLastRound) {
                const maxScore = allPlayersForCheck.length ? Math.max(...allPlayersForCheck.map(p => p.score || 0)) : 0;
                const winners = allPlayersForCheck.filter(p => (p.score || 0) === maxScore);
                let announcement = '';
                if (winners.length === 1) {
                    announcement = `${winners[0].name} wins with ${maxScore} pts!`;
                } else if (winners.length > 1) {
                    announcement = `${winners.map(p => p.name).join(' & ')} tie at ${maxScore} pts!`;
                }
                ctx.font = 'bold 18px ' + THEME.font;
                ctx.fillStyle = '#ffdd57';
                ctx.textAlign = 'center';
                ctx.fillText(announcement, this.canvas.width / 2, 68);
            }

            const promptY = isLastRound ? 90 : 66;
            ctx.font = "13px " + THEME.font;
            ctx.fillStyle = THEME.textMuted;
            ctx.textAlign = 'center';
            if (this.network) {
                const confirmedCount = (this.continueConfirmedSeats || []).length;
                const totalCount = this.continueTotalConnected || 0;
                const confirmedSet = new Set(this.continueConfirmedSeats || []);
                const pendingPlayers = this.players
                    .map((p, seatIndex) => (p && p.connected !== false && !confirmedSet.has(seatIndex)) ? p : null)
                    .filter(p => p !== null);

                const statusLine = pendingPlayers.length === 1
                    ? `Waiting on ${pendingPlayers[0].name}... (${confirmedCount}/${totalCount})`
                    : `${confirmedCount}/${totalCount} ready`;

                if (this.localContinueConfirmed) {
                    ctx.fillText(statusLine, this.canvas.width / 2, promptY);
                } else {
                    ctx.fillText(
                        isLastRound ? 'Press Enter/Shift to play again.' : 'Press Enter/Shift to continue.',
                        this.canvas.width / 2, promptY
                    );
                    ctx.fillText(statusLine, this.canvas.width / 2, promptY + 16);
                }
            } else {
                ctx.fillText(
                    isLastRound ? 'Press Enter/Shift to play again.' : 'Press Enter/Shift to continue.',
                    this.canvas.width / 2, promptY
                );
            }
        }
        this.drawRoundBadge();
        const POINTS_TO_WIN = this.POINTS_TO_WIN;
        
        const chartWidth = 600;
        const chartLeft = (this.canvas.width - chartWidth) / 2;
        
        const chartTop = 160;

        const activePlayers = this.players.filter(p => p !== null);
        const n = Math.max(activePlayers.length, 1);

        // Budget matches the space 4 players used at the original fixed size
        // (4 * 60 + 3 * 30 = 330px). Scale bar height/spacing down to fit
        // more players in the same budget instead of overflowing the canvas.
        const CHART_HEIGHT_BUDGET = 330;
        const BASE_BAR_HEIGHT = 60;
        const BASE_BAR_SPACING = 30;
        let barHeight = BASE_BAR_HEIGHT;
        let barSpacing = BASE_BAR_SPACING;
        if (n > 4) {
            barHeight = Math.max(26, (2 * CHART_HEIGHT_BUDGET) / (3 * n - 1));
            barSpacing = barHeight / 2;
        }
        const fontScale = Math.min(1, barHeight / BASE_BAR_HEIGHT);

        const chartBottom = chartTop + n * (barHeight + barSpacing) - barSpacing;
        ctx.lineWidth = 2;
        for (let p = 3; p <= POINTS_TO_WIN; p += 3) {
            const x = chartLeft + (p / POINTS_TO_WIN) * chartWidth;
            
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
            ctx.beginPath();
            ctx.moveTo(x, chartTop - 15);
            ctx.lineTo(x, chartBottom + 15);
            ctx.stroke();

            ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
            ctx.font = 'bold 14px ' + THEME.font;
            ctx.textAlign = 'center';
            ctx.fillText(`${p} pts`, x, chartTop - 25);
        }
        const winLineX = chartLeft + chartWidth;
        ctx.strokeStyle = '#ffdd57'; 
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(winLineX, chartTop - 35);
        ctx.lineTo(winLineX, chartBottom + 25);
        ctx.stroke();

        ctx.fillStyle = '#ffdd57';
        ctx.font = 'bold 14px ' + THEME.font;
        ctx.textAlign = 'center';
        ctx.fillText(`GOAL: ${POINTS_TO_WIN} TO WIN`, winLineX, chartTop - 45);

        const POINT_SOURCE_ORDER = ['goal', 'firstPlace', 'solo', 'comeback'];
        const FALLBACK_COLORS = ['#ff4757', '#2ed573', '#ffa502', '#1e90ff', '#ff6b81', '#00d2d3', '#a4b0be', '#3742fa'];
        let currentY = chartTop;
        
        this.players.forEach((player, index) => {
            if (!player) return;

            const roundPoints = player.lastRoundPoints || 0;
            const scoreBefore = player.scoreBeforeRound ?? player.score;
            const displayedScore = scoreBefore + Math.floor(roundPoints * progress);
            ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
            ctx.fillRect(chartLeft, currentY, chartWidth, barHeight);
            const preRoundRatio = Math.min(scoreBefore / POINTS_TO_WIN, 1);
            const preRoundWidthTarget = preRoundRatio * chartWidth;
            const historyBefore = player.historyBeforeRound || [];
            let preSegmentX = chartLeft;
            let beforeTotal = 0;
            for (const entry of historyBefore) {
                const value = entry.value || 0;
                if (value <= 0) continue;
                beforeTotal += value;
                const segmentWidth = (value / POINTS_TO_WIN) * chartWidth;
                ctx.fillStyle = THEME.pointColors[entry.source] || '#ffdd57';
                ctx.fillRect(preSegmentX, currentY, segmentWidth, barHeight);
                preSegmentX += segmentWidth;
            }
            const untrackedBefore = Math.max(0, scoreBefore - beforeTotal);
            if (untrackedBefore > 0) {
                const segmentWidth = (untrackedBefore / POINTS_TO_WIN) * chartWidth;
                ctx.fillStyle = player.color || FALLBACK_COLORS[index % FALLBACK_COLORS.length];
                ctx.fillRect(preSegmentX, currentY, segmentWidth, barHeight);
                preSegmentX += segmentWidth;
            }
            const preRoundWidth = Math.max(preSegmentX - chartLeft, scoreBefore > 0 ? Math.min(2, preRoundWidthTarget) : 0);
            let roundEntries = player.lastRoundEntries && player.lastRoundEntries.length
                ? player.lastRoundEntries
                : (roundPoints > 0 ? [{ source: 'goal', value: roundPoints }] : []);
            let segmentX = chartLeft + preRoundWidth;
            for (const entry of roundEntries) {
                const value = entry.value || 0;
                if (value <= 0) continue;
                
                const segmentWidth = (value / POINTS_TO_WIN) * chartWidth * progress;
                ctx.fillStyle = THEME.pointColors[entry.source] || '#ffdd57';
                ctx.fillRect(segmentX, currentY, segmentWidth, barHeight);
                segmentX += segmentWidth;
            }
            if (roundPoints > 0) {
                ctx.strokeStyle = 'rgba(0, 0, 0, 0.35)';
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(chartLeft + preRoundWidth, currentY);
                ctx.lineTo(chartLeft + preRoundWidth, currentY + barHeight);
                ctx.stroke();
            }
            ctx.fillStyle = '#ffffff';
            ctx.font = `bold ${Math.round(18 * fontScale)}px ` + THEME.font;
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            
            const textX = chartLeft + 15;
            const textY = currentY + barHeight / 2;
            
            ctx.fillText(`${player.name} - ${displayedScore} Pts`, textX, textY);
            if (roundPoints > 0) {
                ctx.globalAlpha = progress; 
                ctx.font = `bold ${Math.round(13 * fontScale)}px ` + THEME.font;
                let labelX = chartLeft + 15;
                const labelY = currentY - 8 * fontScale;
                for (const entry of roundEntries) {
                    const value = entry.value || 0;
                    if (value <= 0) continue;
                    
                    const labelText = THEME.pointLabels[entry.source] || 'Points';
                    const label = `+${value} ${labelText}`;
                    ctx.fillStyle = THEME.pointColors[entry.source] || '#ffdd57';
                    ctx.fillText(label, labelX, labelY);
                    labelX += ctx.measureText(label).width + 16;
                }
                ctx.globalAlpha = 1.0; 
            }

            currentY += barHeight + barSpacing;
        });
        const legendY = chartBottom + 45;
        ctx.font = 'bold 13px ' + THEME.font;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        const legendSwatch = 14;
        const legendGap = 22;
        let legendX = chartLeft;
        for (const source of POINT_SOURCE_ORDER) {
            const label = THEME.pointLabels[source];
            ctx.fillStyle = THEME.pointColors[source];
            ctx.fillRect(legendX, legendY - legendSwatch / 2, legendSwatch, legendSwatch);
            ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
            ctx.fillText(label, legendX + legendSwatch + 6, legendY);
            legendX += legendSwatch + 6 + ctx.measureText(label).width + legendGap;
        }
        
        ctx.textBaseline = 'alphabetic';
        
        if (progress >= 1.0 && activePlayers.length > 0 && !isLastRound) {
            let globalSplashText = "";

            const totalCleared = activePlayers.filter(p => p.hasFinished).length;

            if (totalCleared === 0) {
                globalSplashText = "NO POINTS - TOO HARD!";
            } else if (totalCleared === activePlayers.length) {
                // Matches the scoring exclusions in awardRoundPoints()/Room.endRound():
                // a first-place point still goes out here unless it's a two-player
                // game or everyone-clears-with-one-player (solo) situation.
                globalSplashText = (activePlayers.length > 2 && totalCleared > 1)
                    ? "TOO EASY - FIRST PLACE ONLY!"
                    : "NO POINTS - TOO EASY!";
            }

            if (globalSplashText) {
                ctx.save();
                ctx.translate(this.canvas.width / 2, this.canvas.height / 2);
                ctx.rotate(-Math.PI / 12);

                ctx.fillStyle = '#ff4757'; 
                ctx.font = 'bold 54px ' + THEME.font;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                
                ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
                ctx.shadowBlur = 12;
                ctx.shadowOffsetX = 4;
                ctx.shadowOffsetY = 4;
                
                ctx.fillText(globalSplashText, 0, 0);
                ctx.shadowColor = 'transparent';
                ctx.shadowBlur = 0;
                ctx.shadowOffsetX = 0;
                ctx.shadowOffsetY = 0;

                ctx.restore();
            }
        }
    }

    bindNetwork() {
        const net = this.network;

        net.onOpen = () => {
            this.gameState = GameState.LOBBY;
        };

        net.onSeatAssigned = (payload) => this.handleSeatAssigned(payload);
        net.onRoomState = (payload, type, phase) => this.handleRoomState(payload, phase);
        net.onJoinRejected = (payload) => {
            console.warn('[network] join rejected:', payload.reason);
            if (this.onJoinRejected) this.onJoinRejected(payload); 
        };

        net.onMatchStarting = () => {
            this.gameState = GameState.LOADING;
        };
        net.onAllClientsReady = () => {
        };

        net.onStageState = (payload, type) => this.handleStageNetworkEvent(payload, type);
        net.onPartyState = (payload, type) => this.handlePartyNetworkEvent(payload, type);
        net.onBuildState = (payload, type) => this.handleBuildNetworkEvent(payload, type);
        net.onRaceState = (payload, type) => this.handleRaceNetworkEvent(payload, type);

        net.onPositionSync = (payload) => this.handleRemotePositionSync(payload);
        net.onTileUpdate = (payload) => {
            if (payload.seatIndex === this.localSeatIndex) return; 
            if (payload.tile === 43 && typeof playSfx === 'function') playSfx('spring');
            this.applyMapPatch([{ idx: payload.idx, tile: payload.tile, rot: payload.rot }]);
        };
        net.onFinishConfirmed = (payload) => this.handleFinishConfirmed(payload);
        net.onEliminationConfirmed = (payload) => this.handleEliminationConfirmed(payload);

        net.onRoundResult = (payload) => this.handleRoundResult(payload);
        net.onNextRoundStart = () => {  };
        net.onContinueProgress = (payload) => {
            this.continueConfirmedSeats = payload.confirmedSeats || [];
            this.continueTotalConnected = payload.totalConnected || 0;
            if (payload.seatIndex !== this.localSeatIndex && typeof playSfx === 'function') {
                playSfx('select');
            }
        };
        net.onMatchEnd = (payload) => this.handleMatchEnd(payload);
        net.onRematchStarting = () => this.resetForRematch();

        net.onPlayerLeft = (payload) => {
            this.markSeatDisconnected(payload.seatIndex);
            this.applyHostSeatIndex(payload.hostSeatIndex);
        };
        net.onPlayerDisconnected = (payload) => this.markSeatDisconnected(payload.seatIndex);
        net.onPlayerReconnected = (payload, type, phase) => {
            this.markSeatReconnected(payload.seatIndex);
            if (payload.seatIndex === this.localSeatIndex) this.syncGameStateToPhase(phase);
        };
        net.onTimeSync = (payload, type, phase) => {
            const remaining = payload && typeof payload.remaining === 'number' ? payload.remaining : null;
            if (remaining === null) return;
            if (phase === GameState.PARTY_BOX) this.partyTimeRemaining = remaining;
            else if (phase === GameState.BUILD) this.buildTimeRemaining = remaining;
            else if (phase === GameState.RACE) this.raceTimeRemaining = remaining;
        };
        net.onPong = (payload) => {
            if (payload && typeof payload.t === 'number') {
                this.ping = Math.max(0, Math.round(performance.now() - payload.t));
            }
        };
    }

    requestSetColor(hue) {
        if (this.network && this.network.isConnected) {
            this.network.sendSetColorRequest(hue);
            return;
        }
        // Offline/local play: apply immediately since there's no server to confirm it.
        const player = this.players[this.localSeatIndex];
        if (!player) return;
        player.hue = hue;
        player.color = hueShiftToHex(hue);
    }

    handleSeatAssigned(payload) {
        this.localSeatIndex = payload.seatIndex;
        this.roomCode = this.network.roomCode;
        this.players = this.createPlayers(this.playerCount, this.localSeatIndex);
    }
    handleRoomState(payload, phase) {
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
            if (typeof seatInfo.hue === 'number') {
                player.hue = seatInfo.hue;
                player.color = hueShiftToHex(seatInfo.hue);
            }

            const previous = previousByIndex.get(seatInfo.seatIndex);
            if (previous) {
                player.score = previous.score;
                player.piece = previous.piece;
                player.stageCursor = previous.stageCursor;
                player.stageVoteLocked = previous.stageVoteLocked;
                player.partyCursor = previous.partyCursor;
                player.buildCursor = previous.buildCursor;
                player.buildRotation = previous.buildRotation;
                player.buildPlaced = previous.buildPlaced;
                player.physicsState = previous.physicsState;
                player.hasFinished = previous.hasFinished;
                player.eliminated = previous.eliminated;
                player.dnf = previous.dnf;
                player.finishTick = previous.finishTick;
                player.reportedFinish = previous.reportedFinish;
                player.reportedElimination = previous.reportedElimination;
                player.scoreBeforeRound = previous.scoreBeforeRound;
                player.lastRoundPoints = previous.lastRoundPoints;
                player.lastRoundBreakdown = previous.lastRoundBreakdown;
                player.scoreBreakdown = previous.scoreBreakdown;
                player.breakdownBeforeRound = previous.breakdownBeforeRound;
                player.pointHistory = previous.pointHistory;
                player.historyBeforeRound = previous.historyBeforeRound;
                player.lastRoundEntries = previous.lastRoundEntries;
            }
        }

        this.players = rebuilt;
        if (this.onLobbyUpdate) this.onLobbyUpdate(payload, this.isHost);
        this.syncGameStateToPhase(phase);
    }
    syncGameStateToPhase(phase) {
        if (!phase || phase === this.gameState) return;

        const RESYNCABLE_PHASES = new Set([
            GameState.LOBBY,
            GameState.RACE,
            GameState.ROUND_RESULTS,
            GameState.FINAL_RESULTS
        ]);
        if (!RESYNCABLE_PHASES.has(phase)) return;
        if (phase === GameState.RACE && !this.physics) return;

        console.log(`[game] resyncing gameState ${this.gameState} -> ${phase} (reconnect)`);
        this.gameState = phase;
    }

    markSeatDisconnected(seatIndex) {
        const player = this.players[seatIndex];
        if (player) player.connected = false;
    }

    markSeatReconnected(seatIndex) {
        const player = this.players[seatIndex];
        if (player) player.connected = true;
    }

    // Keeps this.isHost correct any time the server tells us who the host is,
    // not just from ROOM_STATE (which is only rebroadcast while in the lobby).
    // Without this, a host handoff mid-match wouldn't show up client-side
    // until/unless the room happened to pass back through the lobby.
    applyHostSeatIndex(hostSeatIndex) {
        if (typeof hostSeatIndex !== 'number') return;
        const wasHost = this.isHost;
        this.isHost = hostSeatIndex === this.localSeatIndex;
        if (this.isHost !== wasHost && this.onHostChanged) {
            this.onHostChanged(hostSeatIndex, this.isHost);
        }
    }

    requestStartMatch() {
        if (!this.network) return;
        this.network.requestStartMatch();
    }

    handleStageNetworkEvent(payload, type) {
        switch (type) {
            case 'STAGE_SELECT_START':
                this.stageCandidates = payload.candidates || [];
                this.players.forEach(p => { p.stageCursor = 0; p.stageVoteLocked = false; });
                this.gameState = GameState.STAGE_SELECT;
                {
                    const boxWidth = this.getStageBoxWidth(this.stageCandidates.length);
                    const thumbW = boxWidth - 24;
                    const thumbH = thumbW * STAGE_PREVIEW_ASPECT;
                    this.stageCandidates.forEach(code => this.generateStageThumbnail(code, thumbW, thumbH));
                }
                break;
            case 'STAGE_CURSOR_MOVE': {
                const player = this.players[payload.seatIndex];
                if (player) player.stageCursor = payload.cursorIndex;
                break;
            }
            case 'STAGE_VOTE_CAST': {
                const player = this.players[payload.seatIndex];
                if (player) {
                    player.stageCursor = payload.candidateIndex;
                    player.stageVoteLocked = true;
                    if (typeof playSfx === 'function') playSfx('select');
                }
                break;
            }
            case 'STAGE_LOCKED': {
                this.loadLevel(payload.levelCode);
                break;
            }
        }
    }

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
                if (typeof playSfx === 'function') playSfx('select');
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
                break;
        }
    }

    handleBuildNetworkEvent(payload, type) {
        switch (type) {
            case 'BUILD_START': {
                this.buildTimeRemaining = payload.timeLimit || this.BUILD_TIME_LIMIT;
                if (this.physics && this.mapSnapshot) {
                    for (let i = 0; i < this.mapSnapshot.length; i++) {
                        this.physics.MAP[i] = this.mapSnapshot[i];
                        this.physics.MAP_R[i] = this.mapRotationSnapshot[i];
                    }
                    this.physics.worldActiveIdx.length = 0;
                    this.physics.worldActiveTyp.length = 0;
                    this.physics.worldActiveFrame.length = 0;
                    this.physics.worldActiveSpawn.length = 0;
                    this.physics.tileUpdates.length = 0;
                }

                const startCells = payload.startCells || [];
                for (const sc of startCells) {
                    const player = this.players[sc.seatIndex];
                    if (!player) continue;
                    player.buildRotation = 0;
                    player.buildPlaced = false;
                    player.buildCursor = { col: sc.col, row: sc.row };
                    player.buildMoveHold = { up: 0, down: 0, left: 0, right: 0 };
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
                    else if (type === 'FORCE_PLACE') player.buildPlaced = true; 
                    if (player.buildPlaced && typeof playSfx === 'function') playSfx('select');
                }
                this.applyMapPatch(payload.mapPatch);
                break;
            }
            case 'BUILD_COMPLETE':
                this.applyMapPatch(payload.mapPatch);
                this.snapshotBuiltMap();
                if (payload.levelCode) {
                    this.lastBuiltLevelCode = payload.levelCode;
                    console.log('[levelCode] built level saved:', payload.levelCode);
                    if (this.onLevelCodeSaved) this.onLevelCodeSaved(payload.levelCode);
                }
                break;
        }
    }
    applyMapPatch(mapPatch) {
        if (!mapPatch || !this.physics) return;
        for (const patch of mapPatch) {
            this.physics.MAP[patch.idx] = patch.tile;
            this.physics.MAP_R[patch.idx] = patch.rot;
        }
    }

    handleRaceNetworkEvent(payload, type) {
        switch (type) {
            case 'RACE_START':
                this.tick = payload.tick || 0;
                this.remotePositions.clear();
                this.gameState = GameState.RACE;
                this.resetRoundState();
                this.cameraLookahead.x = 0;
                this.cameraLookahead.y = 0;
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
        playSfx('finish');
    }

    handleEliminationConfirmed(payload) {
        const player = this.players[payload.seatIndex];
        if (!player) return;
        player.eliminated = true;
        player.dnf = payload.cause === 'dnf';
        if (typeof playSfx === 'function') playSfx('boom');
    }

    handleRoundResult(payload) {
        this.players.forEach(p => { p.scoreBeforeRound = p.score; p.breakdownBeforeRound = { ...p.scoreBreakdown }; p.historyBeforeRound = [...p.pointHistory]; p.lastRoundEntries = []; });
        for (const result of (payload.results || [])) {
            const player = this.players[result.seatIndex];
            if (!player) continue;
            player.hasFinished = result.hasFinished;
            player.dnf = result.dnf;
            player.eliminated = result.eliminated;
            player.finishTick = result.finishTick;
            player.lastRoundPoints = result.roundPoints;
            player.lastRoundBreakdown = result.pointBreakdown || { goal: 0, firstPlace: 0, comeback: 0, solo: 0 };
            player.scoreBreakdown.goal += player.lastRoundBreakdown.goal || 0;
            player.scoreBreakdown.firstPlace += player.lastRoundBreakdown.firstPlace || 0;
            player.scoreBreakdown.comeback += player.lastRoundBreakdown.comeback || 0;
            player.scoreBreakdown.solo += player.lastRoundBreakdown.solo || 0;
            player.score = result.totalScore;
            this.pushPointHistoryEntries(player, player.lastRoundBreakdown);
        }
        this.currentRound = payload.round;
        this.roundResultsAnimFrames = 0;
        this.gameState = GameState.ROUND_RESULTS;
        this.localContinueConfirmed = false;
        this.continueConfirmedSeats = [];
        this.continueTotalConnected = 0;

        const someoneWon = this.players.some(p => p && p.score >= this.POINTS_TO_WIN);
        if ((someoneWon || this.currentRound >= this.totalRounds) && this.onFinalResults) {
            this.onFinalResults(this.lastBuiltLevelCode);
        }
    }

    handleMatchEnd(payload) {
        for (const standing of (payload.finalStandings || [])) {
            const player = this.players[standing.seatIndex];
            if (player) player.score = standing.totalScore;
        }
    }
    resetForRematch() {
        this.players.forEach(p => {
            p.score = 0;
            p.scoreBeforeRound = 0;
            p.lastRoundPoints = 0;
            p.lastRoundBreakdown = { goal: 0, firstPlace: 0, comeback: 0, solo: 0 };
            p.scoreBreakdown = { goal: 0, firstPlace: 0, comeback: 0, solo: 0 };
            p.breakdownBeforeRound = { goal: 0, firstPlace: 0, comeback: 0, solo: 0 };
            p.pointHistory = [];
            p.historyBeforeRound = [];
            p.lastRoundEntries = [];
            p.eliminated = false;
            p.hasFinished = false;
            p.dnf = false;
            p.finishTick = null;
            p.piece = null;
            p.buildPlaced = false;
        });
        this.currentRound = 1;
        if (this.onFinalResultsHidden) this.onFinalResultsHidden();
    }
}