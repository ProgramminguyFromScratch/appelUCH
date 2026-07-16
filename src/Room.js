const {
    PHASE,
    TOTAL_ROUNDS,
    getPartyBoxSlotCount,
    STAGE_VOTE_STAND_SECONDS,
    PARTY_TIME_LIMIT,
    BUILD_TIME_LIMIT,
    RACE_TIME_LIMIT,
    MIN_PLAYERS_TO_START,
    MAX_PLAYERS,
    FINISH_TICK_TOLERANCE,
    LOADING_BARRIER_TIMEOUT_MS,
    ROUND_END_DELAY_MS,
    CHAT_MESSAGE_MAX_LENGTH,
    DEFAULT_SETTINGS,
    SETTINGS_LIMITS,
    PIECE_CHANCE_LIMITS,
    ADMIN_PASSWORD,
    LOGIN_MAX_ATTEMPTS,
    LOGIN_ATTEMPT_WINDOW_MS
} = require('./protocol');
const { decodeLevelCode, encodeLevelCode } = require('./levelCode');
const { PIECE_POOL, getPieceById, getPieceFootprintCells, pickWeightedPieces } = require('../pieces');
const { LEVEL_POOL } = require('./levels');

const HUE_MIN = 0;
const HUE_MAX = 199;
const DEFAULT_HUE_STEP = 34; 
const SEAT_RECONNECT_GRACE_MS = 2 * 60 * 1000;

let nextPlayerId = 1;
function generatePlayerId() {
    return `p${nextPlayerId++}_${Math.random().toString(36).slice(2, 8)}`;
}

class Room {
    constructor(roomCode) {
        this.roomCode = roomCode;
        this.seats = new Map();
        this.hostSeatIndex = 0;
        this.nextSeatIndex = 0;
        this.phase = PHASE.LOBBY;

        this.settings = { ...DEFAULT_SETTINGS, pieceChances: { ...DEFAULT_SETTINGS.pieceChances } };

        this.currentRound = 1;
        this.totalRounds = this.settings.totalRounds;

        this.stageCandidates = [];
        this.stageVotes = new Map();
        this.levelCode = null;
        this.map = null;
        this.levelMeta = null;
        this.startCell = { col: 0, row: 0 };

        this.partySlots = [];
        this.lastRoundDeaths = { anyEliminated: false, allEliminated: false };
        this.locks = { stagePicked: false, continueAdvanced: false };
        this.continueConfirmations = new Set();

        this.timers = {};

        this.race = null;

        this.createdAt = Date.now();
        this.emptiedAt = this.isEmpty() ? this.createdAt : null;
    }

    get connectedSeats() {
        return [...this.seats.values()].filter(s => s.connected);
    }
    updateEmptiedAt() {
        if (this.isEmpty()) {
            if (this.emptiedAt === null) this.emptiedAt = Date.now();
        } else {
            this.emptiedAt = null;
        }
    }
    static sanitizeDisplayName(raw, fallback) {
        const stripped = String(raw || '').replace(/[^\x20-\x7E]/g, '').trim();
        return stripped.length > 0 ? stripped.slice(0, 20) : fallback;
    }

    isNameTaken(displayName) {
        const normalized = (displayName || '').trim().toLowerCase();
        if (!normalized) return false;
        return this.connectedSeats.some(s => s.name.trim().toLowerCase() === normalized);
    }

    allocateSeatIndex() {
        for (let i = 0; i < MAX_PLAYERS; i++) {
            if (!this.seats.has(i)) return i;
        }
        return this.nextSeatIndex++;
    }

    addSeat(ws, displayName) {
        if (this.seats.size >= MAX_PLAYERS) return null;

        const seatIndex = this.allocateSeatIndex();
        const hue = (seatIndex * DEFAULT_HUE_STEP) % (HUE_MAX + 1);
        const seat = {
            seatIndex,
            playerId: generatePlayerId(),
            name: Room.sanitizeDisplayName(displayName, `P${seatIndex + 1}`),
            ws,
            connected: true,
            isBot: false,
            hue,
            ready: false,
            stageCursor: -1,
            partyCursor: 0,
            piece: null,
            buildCursor: { col: 0, row: 0 },
            buildRotation: 0,
            buildPlaced: false,
            lastBuildCursorMove: null,
            score: 0,
            hasFinished: false,
            finishTick: null,
            eliminated: false,
            dnf: false,
            livesRemaining: this.settings.lives,
            finishedPostmortem: false
        };
        this.seats.set(seatIndex, seat);
        ws.seatIndex = seatIndex;
        ws.roomCode = this.roomCode;
        this.updateEmptiedAt();

        return seat;
    }

    seatFor(ws) {
        if (ws.roomCode !== this.roomCode || ws.seatIndex === undefined) return null;
        return this.seats.get(ws.seatIndex) || null;
    }

    send(seat, message) {
        if (!seat || !seat.connected || !seat.ws || seat.ws.readyState !== 1) return;
        try {
            seat.ws.send(JSON.stringify(message));
        } catch (err) {
            console.error(`[room ${this.roomCode}] send failed for seat ${seat.seatIndex}:`, err.message);
        }
    }

    broadcast(message, exceptSeatIndex = null) {
        for (const seat of this.seats.values()) {
            if (exceptSeatIndex !== null && seat.seatIndex === exceptSeatIndex) continue;
            this.send(seat, message);
        }
    }

    roomStatePayload() {
        return {
            roomCode: this.roomCode,
            hostSeatIndex: this.hostSeatIndex,
            settings: this.settings,
            seats: [...this.seats.values()].map(s => ({
                seatIndex: s.seatIndex,
                playerId: s.playerId,
                name: s.name,
                connected: s.connected,
                isBot: s.isBot,
                hue: s.hue
            }))
        };
    }

    broadcastRoomState() {
        this.broadcast({ type: 'ROOM_STATE', phase: this.phase, payload: this.roomStatePayload() });
    }
    sendJoinCatchUp(seat) {
        if (this.phase === PHASE.LOBBY) return;
        this.send(seat, {
            type: 'MATCH_STARTING',
            phase: PHASE.LOADING,
            payload: { playerCount: this.seats.size, totalRounds: this.totalRounds, settings: this.settings }
        });

        if (this.levelCode) {
            this.send(seat, {
                type: 'STAGE_LOCKED',
                phase: this.phase,
                payload: { winningSeatIndex: null, levelCode: this.levelCode }
            });
            if (this.map) {
                const mapPatch = this.map.MAP
                    .map((tile, idx) => ({ idx, tile, rot: this.map.MAP_R[idx] }))
                    .filter(p => p.tile !== 0 && p.tile !== 1);
                if (mapPatch.length > 0) {
                    this.send(seat, {
                        type: 'BUILD_COMPLETE',
                        phase: this.phase,
                        payload: { mapPatch, levelCode: this.levelCode }
                    });
                }
            }
        }

        switch (this.phase) {
            case PHASE.LOADING:
                break;
            case PHASE.STAGE_SELECT:
                this.updateStageCountdown();
                this.send(seat, {
                    type: 'STAGE_SELECT_START',
                    phase: PHASE.STAGE_SELECT,
                    payload: { candidates: this.stageCandidates }
                });
                break;
            case PHASE.PARTY_BOX:
                this.send(seat, {
                    type: 'PARTY_BOX_START',
                    phase: PHASE.PARTY_BOX,
                    payload: {
                        slots: this.partySlots.map((s, slotIndex) => (s ? { slotIndex, pieceId: s.pieceId } : null)),
                        timeLimit: PARTY_TIME_LIMIT
                    }
                });
                break;
            case PHASE.BUILD:
                this.send(seat, {
                    type: 'BUILD_START',
                    phase: PHASE.BUILD,
                    payload: {
                        startCells: [{ seatIndex: seat.seatIndex, col: this.startCell.col, row: this.startCell.row }],
                        timeLimit: BUILD_TIME_LIMIT
                    }
                });
                break;
            case PHASE.RACE:
                this.send(seat, {
                    type: 'RACE_START',
                    phase: PHASE.RACE,
                    payload: {
                        tick: 0,
                        timeLimit: this.settings.raceTimeLimit,
                        lives: this.settings.lives,
                        spawns: [{ seatIndex: seat.seatIndex, x: null, y: null }]
                    }
                });
                break;
            case PHASE.ROUND_RESULTS:
                if (this.lastRoundEndPayload) {
                    this.send(seat, { type: 'ROUND_END', phase: PHASE.RACE, payload: this.lastRoundEndPayload });
                }
                this.send(seat, {
                    type: 'CONTINUE_PROGRESS',
                    phase: PHASE.ROUND_RESULTS,
                    payload: {
                        seatIndex: null,
                        confirmedSeats: [...this.continueConfirmations],
                        totalConnected: this.connectedSeats.length
                    }
                });
                break;
            default:
                break;
        }
    }

    announceJoin(seat) {
        this.broadcast({
            type: 'CHAT_BROADCAST',
            phase: this.phase,
            payload: { seatIndex: -1, name: 'System', hue: 0, text: `${seat.name} joined the game` }
        });
    }

    announceLeave(seat, reason) {
        const text = reason === 'kicked' ? `${seat.name} was kicked` : `${seat.name} left the game`;
        this.broadcast({
            type: 'CHAT_BROADCAST',
            phase: this.phase,
            payload: { seatIndex: -1, name: 'System', hue: 0, text }
        });
    }

    handleSetColorRequest(seat, payload = {}) {
        const hue = Math.round(Number(payload.hue));
        if (!Number.isFinite(hue) || hue < HUE_MIN || hue > HUE_MAX) return;

        seat.hue = hue;
        if (this.phase === PHASE.LOBBY) {
            this.broadcastRoomState();
        } else {
            this.broadcast({
                type: 'COLOR_UPDATED',
                phase: this.phase,
                payload: { seatIndex: seat.seatIndex, hue }
            });
        }
    }

    clampSetting(key, value) {
        const limits = SETTINGS_LIMITS[key];
        if (!limits) return null;
        const n = Math.round(Number(value));
        if (!Number.isFinite(n)) return null;
        return Math.max(limits.min, Math.min(limits.max, n));
    }
    clampPieceChance(value) {
        const n = Math.round(Number(value));
        if (!Number.isFinite(n)) return null;
        return Math.max(PIECE_CHANCE_LIMITS.min, Math.min(PIECE_CHANCE_LIMITS.max, n));
    }
    isPrivileged(seat) {
        return !!seat && (seat.seatIndex === this.hostSeatIndex || !!seat.isAdmin);
    }

    handleUpdateSettingsRequest(seat, payload = {}) {
        if (this.phase !== PHASE.LOBBY && this.phase !== PHASE.STAGE_SELECT) return;
        if (!this.isPrivileged(seat)) return;

        const updates = {};
        for (const key of Object.keys(DEFAULT_SETTINGS)) {
            if (key === 'pieceChances') continue;
            if (!(key in payload)) continue;
            const clamped = this.clampSetting(key, payload[key]);
            if (clamped === null) continue;
            updates[key] = clamped;
        }

        let pieceChanceUpdates = null;
        if (payload.pieceChances && typeof payload.pieceChances === 'object') {
            pieceChanceUpdates = {};
            for (const pieceId of Object.keys(payload.pieceChances)) {
                if (!getPieceById(pieceId)) continue;
                const clamped = this.clampPieceChance(payload.pieceChances[pieceId]);
                if (clamped === null) continue;
                pieceChanceUpdates[pieceId] = clamped;
            }
            if (Object.keys(pieceChanceUpdates).length === 0) pieceChanceUpdates = null;
        }

        if (Object.keys(updates).length === 0 && !pieceChanceUpdates) return;

        Object.assign(this.settings, updates);
        if (pieceChanceUpdates) {
            this.settings.pieceChances = { ...this.settings.pieceChances, ...pieceChanceUpdates };
        }
        this.totalRounds = this.settings.totalRounds;

        this.broadcast({
            type: 'SETTINGS_UPDATED',
            phase: this.phase,
            payload: { settings: this.settings }
        });
    }

    handleStartMatchRequest(seat) {
        if (this.phase !== PHASE.LOBBY) return;
        if (!this.isPrivileged(seat)) return;
        if (this.connectedSeats.length < MIN_PLAYERS_TO_START) return;

        this.totalRounds = this.settings.totalRounds;
        this.phase = PHASE.LOADING;
        this.broadcast({
            type: 'MATCH_STARTING',
            phase: PHASE.LOADING,
            payload: { playerCount: this.seats.size, totalRounds: this.totalRounds, settings: this.settings }
        });

        this.timers.loadingBarrier = setTimeout(() => this.forceAllClientsReady(), LOADING_BARRIER_TIMEOUT_MS);
    }

    handleClientReady(seat) {
        if (this.phase !== PHASE.LOADING) return;
        seat.ready = true;
        if (this.connectedSeats.every(s => s.ready)) {
            this.enterStageSelectFromLoading();
        }
    }

    forceAllClientsReady() {
        if (this.phase !== PHASE.LOADING) return;
        for (const seat of this.connectedSeats) {
            if (!seat.ready) seat.isBot = true;
        }
        this.enterStageSelectFromLoading();
    }

    enterStageSelectFromLoading() {
        clearTimeout(this.timers.loadingBarrier);
        this.broadcast({ type: 'ALL_CLIENTS_READY', phase: PHASE.LOADING, payload: {} });
        this.enterStageSelect();
    }

    pickStageCandidates() {
        return LEVEL_POOL.slice();
    }

    enterStageSelect() {
        this.stageCandidates = this.pickStageCandidates();
        this.locks.stagePicked = false;
        this.stageVotes = new Map();
        for (const seat of this.seats.values()) seat.stageCursor = -1;
        clearTimeout(this.timers.stageCountdown);
        this.timers.stageCountdown = null;
        this.phase = PHASE.STAGE_SELECT;
        this.broadcast({
            type: 'STAGE_SELECT_START',
            phase: PHASE.STAGE_SELECT,
            payload: { candidates: this.stageCandidates }
        });
    }

    handleStageCursorMove(seat, payload) {
        if (this.phase !== PHASE.STAGE_SELECT) return;
        const n = this.stageCandidates.length;
        if (n === 0) return;
        const raw = payload.cursorIndex | 0;
        const cursorIndex = raw === -1 ? -1 : Math.max(0, Math.min(n - 1, raw));
        seat.stageCursor = cursorIndex;
        this.broadcast({
            type: 'STAGE_CURSOR_MOVE',
            phase: PHASE.STAGE_SELECT,
            payload: { seatIndex: seat.seatIndex, cursorIndex }
        });
        this.updateStageCountdown();
    }

    updateStageCountdown() {
        if (this.phase !== PHASE.STAGE_SELECT || this.locks.stagePicked) return;
        const seats = this.connectedSeats;
        const allStanding = seats.length > 0 && seats.every(s => s.stageCursor !== -1);

        if (allStanding) {
            if (!this.timers.stageCountdown) {
                const startTime = Date.now();
                this.timers.stageCountdown = setTimeout(() => this.finalizeGlobalStageVote(), STAGE_VOTE_STAND_SECONDS * 1000);
                this.broadcast({
                    type: 'STAGE_COUNTDOWN_START',
                    phase: PHASE.STAGE_SELECT,
                    payload: { startTime, duration: STAGE_VOTE_STAND_SECONDS * 1000 }
                });
            }
        } else if (this.timers.stageCountdown) {
            clearTimeout(this.timers.stageCountdown);
            this.timers.stageCountdown = null;
            this.broadcast({ type: 'STAGE_COUNTDOWN_CANCEL', phase: PHASE.STAGE_SELECT, payload: {} });
        }
    }

    finalizeGlobalStageVote() {
        this.timers.stageCountdown = null;
        if (this.phase !== PHASE.STAGE_SELECT || this.locks.stagePicked) return;

        for (const seat of this.connectedSeats) {
            if (seat.stageCursor === -1) continue;
            this.stageVotes.set(seat.seatIndex, seat.stageCursor);
            this.broadcast({
                type: 'STAGE_VOTE_CAST',
                phase: PHASE.STAGE_SELECT,
                payload: { seatIndex: seat.seatIndex, candidateIndex: seat.stageCursor, auto: true }
            });
        }

        this.finalizeStageVote();
    }

    handleStagePickRequest(seat, payload) {
        if (this.phase !== PHASE.STAGE_SELECT) return;
        if (this.locks.stagePicked) return;
        const candidateIndex = payload.candidateIndex | 0;
        if (candidateIndex < 0 || candidateIndex >= this.stageCandidates.length) return;

        this.stageVotes.set(seat.seatIndex, candidateIndex);
        this.broadcast({
            type: 'STAGE_VOTE_CAST',
            phase: PHASE.STAGE_SELECT,
            payload: { seatIndex: seat.seatIndex, candidateIndex }
        });

        this.checkStageVotesComplete();
    }

    checkStageVotesComplete() {
        if (this.phase !== PHASE.STAGE_SELECT) return;
        if (this.locks.stagePicked) return;
        const allVoted = this.connectedSeats.every(s => this.stageVotes.has(s.seatIndex));
        if (allVoted) this.finalizeStageVote();
    }
    tallyStageVotes() {
        const counts = new Array(this.stageCandidates.length).fill(0);
        for (const candidateIndex of this.stageVotes.values()) {
            if (candidateIndex >= 0 && candidateIndex < counts.length) counts[candidateIndex]++;
        }
        const maxVotes = Math.max(...counts);
        const tiedCandidates = counts
            .map((count, index) => (count === maxVotes ? index : -1))
            .filter(index => index !== -1);
        return tiedCandidates[Math.floor(Math.random() * tiedCandidates.length)];
    }

    finalizeStageVote() {
        if (this.locks.stagePicked) return;
        this.locks.stagePicked = true;

        const winningIndex = this.tallyStageVotes();
        const levelCode = this.stageCandidates[winningIndex];
        this.lockStage(null, levelCode);
    }
    handleForceStageRequest(seat, payload = {}) {
        if (this.phase !== PHASE.STAGE_SELECT || this.locks.stagePicked) return;
        if (!this.isPrivileged(seat)) return;

        const levelCode = payload && typeof payload.levelCode === 'string' ? payload.levelCode : '';
        if (!LEVEL_POOL.includes(levelCode)) return;

        clearTimeout(this.timers.stageCountdown);
        this.timers.stageCountdown = null;
        this.locks.stagePicked = true;
        this.lockStage(seat.seatIndex, levelCode);
    }

    lockStage(winningSeatIndex, levelCode) {
        this.levelCode = levelCode;
        const decoded = decodeLevelCode(levelCode);
        if (!decoded) {
            console.error(`[room ${this.roomCode}] failed to decode levelCode`);
            return;
        }
        this.map = { MAP: decoded.map.slice(), MAP_R: decoded.rotations.slice(), size_x: decoded.size_x };
        this.levelMeta = { MAP_DATA: decoded.MAP_DATA, wall: decoded.wall, hue: decoded.hue, hue2: decoded.hue2 };
        this.startCell = this.computeStartCell();

        this.broadcast({
            type: 'STAGE_LOCKED',
            phase: PHASE.STAGE_SELECT,
            payload: { winningSeatIndex, levelCode }
        });

        this.enterPartyBox();
    }

    computeStartCell() {
        if (!this.map) return { col: 0, row: 0 };
        const idx = this.map.MAP.indexOf(76);
        if (idx === -1) return { col: 0, row: 0 };
        const cols = this.map.size_x;
        return { col: idx % cols, row: Math.floor(idx / cols) };
    }
    pickPartySlots(count, allowBomb, guaranteeBomb) {
        const basePool = allowBomb ? PIECE_POOL : PIECE_POOL.filter(p => p.id !== 'bomb');
        const overrides = this.settings.pieceChances || {};
        const pool = basePool.map(piece => (
            (piece.id in overrides) ? { ...piece, chance: overrides[piece.id] } : piece
        ));

        const slots = pickWeightedPieces(pool, count).map(piece => ({ pieceId: piece.id }));

        if (guaranteeBomb && count > 0 && !slots.some(s => s.pieceId === 'bomb')) {
            const replaceIndex = Math.floor(Math.random() * slots.length);
            slots[replaceIndex] = { pieceId: 'bomb' };
        }

        return slots;
    }

    startTimeSync(phase, seconds) {
        clearInterval(this.timers.timeSync);
        const deadline = Date.now() + seconds * 1000;
        const tick = () => {
            const remaining = Math.max(0, (deadline - Date.now()) / 1000);
            this.broadcast({ type: 'TIME_SYNC', phase, payload: { remaining } });
        };
        tick();
        this.timers.timeSync = setInterval(tick, 1000);
    }

    enterPartyBox() {
        const { anyEliminated, allEliminated } = this.lastRoundDeaths;
        this.partySlots = this.pickPartySlots(getPartyBoxSlotCount(this.seats.size), anyEliminated, allEliminated);
        for (const seat of this.seats.values()) {
            seat.partyCursor = 0;
            seat.piece = null;
        }
        this.phase = PHASE.PARTY_BOX;
        this.broadcast({
            type: 'PARTY_BOX_START',
            phase: PHASE.PARTY_BOX,
            payload: {
                slots: this.partySlots.map((s, slotIndex) => (s ? { slotIndex, pieceId: s.pieceId } : null)),
                timeLimit: PARTY_TIME_LIMIT
            }
        });

        clearTimeout(this.timers.partyBox);
        this.timers.partyBox = setTimeout(() => this.expirePartyBox(), PARTY_TIME_LIMIT * 1000);
        this.startTimeSync(PHASE.PARTY_BOX, PARTY_TIME_LIMIT);
    }

    handlePartyCursorMove(seat, payload) {
        if (this.phase !== PHASE.PARTY_BOX) return;
        const n = this.partySlots.length;
        if (n === 0) return;
        const cursorIndex = Math.max(0, Math.min(n - 1, payload.cursorIndex | 0));
        seat.partyCursor = cursorIndex;
        this.broadcast({
            type: 'PARTY_CURSOR_MOVE',
            phase: PHASE.PARTY_BOX,
            payload: { seatIndex: seat.seatIndex, cursorIndex }
        });
    }

    handlePartyPickRequest(seat, payload) {
        if (this.phase !== PHASE.PARTY_BOX) return;
        const slotIndex = payload.slotIndex | 0;
        const slot = this.partySlots[slotIndex];
        const accepted = !!slot && !seat.piece;
        let pieceId = null;
        if (accepted) {
            pieceId = slot.pieceId;
            this.partySlots[slotIndex] = null;
            seat.piece = pieceId;
        }

        this.broadcast({
            type: 'PARTY_PICK_RESULT',
            phase: PHASE.PARTY_BOX,
            payload: { seatIndex: seat.seatIndex, slotIndex, pieceId, accepted }
        });

        this.checkPartyBoxComplete();
    }

    expirePartyBox() {
        if (this.phase !== PHASE.PARTY_BOX) return;
        this.broadcast({ type: 'PARTY_BOX_TIMER_EXPIRED', phase: PHASE.PARTY_BOX, payload: {} });
        this.autoAssignRemainingPartyPicks();
        this.completePartyBox();
    }

    autoAssignRemainingPartyPicks() {
        const assignments = [];
        for (const seat of this.seats.values()) {
            if (seat.piece) continue;
            const availableIndices = this.partySlots
                .map((s, i) => (s ? i : -1))
                .filter(i => i !== -1);
            if (availableIndices.length === 0) continue;
            const slotIndex = availableIndices[Math.floor(Math.random() * availableIndices.length)];
            const pieceId = this.partySlots[slotIndex].pieceId;
            this.partySlots[slotIndex] = null;
            seat.piece = pieceId;
            assignments.push({ seatIndex: seat.seatIndex, slotIndex, pieceId });
        }
        if (assignments.length > 0) {
            this.broadcast({ type: 'PARTY_AUTO_ASSIGN', phase: PHASE.PARTY_BOX, payload: { assignments } });
        }
    }

    checkPartyBoxComplete() {
        if (this.phase !== PHASE.PARTY_BOX) return;
        const allHavePieces = this.connectedSeats.every(s => !!s.piece);
        if (allHavePieces) this.completePartyBox();
    }

    completePartyBox() {
        if (this.phase !== PHASE.PARTY_BOX) return;
        clearTimeout(this.timers.partyBox);
        this.broadcast({ type: 'PARTY_BOX_COMPLETE', phase: PHASE.PARTY_BOX, payload: {} });
        this.enterBuild();
    }

    enterBuild() {
        for (const seat of this.seats.values()) {
            seat.buildCursor = { ...this.startCell };
            seat.buildRotation = 0;
            seat.buildPlaced = false;
            seat.lastBuildCursorMove = null;
        }
        this.phase = PHASE.BUILD;
        this.broadcast({
            type: 'BUILD_START',
            phase: PHASE.BUILD,
            payload: {
                startCells: [...this.seats.values()].map(s => ({
                    seatIndex: s.seatIndex,
                    col: this.startCell.col,
                    row: this.startCell.row
                })),
                timeLimit: BUILD_TIME_LIMIT
            }
        });

        clearTimeout(this.timers.build);
        this.timers.build = setTimeout(() => this.expireBuild(), BUILD_TIME_LIMIT * 1000);
        this.startTimeSync(PHASE.BUILD, BUILD_TIME_LIMIT);
    }

    handleBuildCursorMove(seat, payload) {
        if (this.phase !== PHASE.BUILD) return;
        const col = payload.col | 0;
        const row = payload.row | 0;
        const rotation = ((payload.rotation | 0) % 4 + 4) % 4;
        seat.buildCursor = { col, row };
        seat.buildRotation = rotation;
        seat.lastBuildCursorMove = { col, row, rotation };

        this.broadcast({
            type: 'BUILD_CURSOR_MOVE',
            phase: PHASE.BUILD,
            payload: { seatIndex: seat.seatIndex, col, row, rotation }
        });
    }
    footprintFits(piece, rotation, col, row) {
        if (!this.map) return { fits: false, cells: [] };
        const cols = this.map.size_x;
        const rows = Math.floor(this.map.MAP.length / cols);
        const cells = getPieceFootprintCells(piece, rotation).map(off => ({
            col: col + off.dCol,
            row: row + off.dRow,
            tile: off.tile
        }));

        const fits = cells.every(cell => {
            if (cell.col < 0 || cell.col >= cols || cell.row < 0 || cell.row >= rows) return false;
            if (!piece.targetsSolid) {
                const idx = cell.row * cols + cell.col;
                const tile = this.map.MAP[idx];
                if (!(tile === 0 || tile === 1)) return false;
            }
            return true;
        });

        return { fits, cells };
    }
    placePieceOnMap(cells, rotation, piece = null) {
        const cols = this.map.size_x;
        const mapPatch = [];
        const isDeletableCell = (tile) => tile !== 0 && tile !== 1 && tile !== 76 && tile !== 63;
        for (const cell of cells) {
            const idx = cell.row * cols + cell.col;
            if (piece && piece.targetsSolid && !isDeletableCell(this.map.MAP[idx])) continue;
            this.map.MAP[idx] = cell.tile;
            this.map.MAP_R[idx] = rotation;
            mapPatch.push({ idx, tile: cell.tile, rot: rotation });
        }
        return mapPatch;
    }

    handlePlacePieceRequest(seat, payload) {
        if (this.phase !== PHASE.BUILD) return;
        if (seat.buildPlaced) return;
        if (!seat.piece || seat.piece !== payload.pieceId) {
            this.send(seat, {
                type: 'PLACE_PIECE_RESULT',
                phase: PHASE.BUILD,
                payload: { seatIndex: seat.seatIndex, accepted: false, col: payload.col, row: payload.row, rotation: payload.rotation, mapPatch: [] }
            });
            return;
        }

        const piece = getPieceById(seat.piece);
        const rotation = ((payload.rotation | 0) % 4 + 4) % 4;
        const { fits, cells } = this.footprintFits(piece, rotation, payload.col | 0, payload.row | 0);

        if (!fits) {
            this.broadcast({
                type: 'PLACE_PIECE_RESULT',
                phase: PHASE.BUILD,
                payload: { seatIndex: seat.seatIndex, accepted: false, col: payload.col, row: payload.row, rotation, mapPatch: [] }
            });
            return;
        }

        const mapPatch = this.placePieceOnMap(cells, rotation, piece);
        seat.buildPlaced = true;

        this.broadcast({
            type: 'PLACE_PIECE_RESULT',
            phase: PHASE.BUILD,
            payload: { seatIndex: seat.seatIndex, accepted: true, col: payload.col, row: payload.row, rotation, mapPatch }
        });

        this.checkBuildComplete();
    }

    expireBuild() {
        if (this.phase !== PHASE.BUILD) return;
        this.broadcast({ type: 'BUILD_TIMER_EXPIRED', phase: PHASE.BUILD, payload: {} });

        for (const seat of this.seats.values()) {
            if (!seat.piece || seat.buildPlaced) continue;
            const piece = getPieceById(seat.piece);
            const fallback = seat.lastBuildCursorMove || { col: seat.buildCursor.col, row: seat.buildCursor.row, rotation: seat.buildRotation };
            const { fits, cells } = this.footprintFits(piece, fallback.rotation, fallback.col, fallback.row);
            seat.buildPlaced = true;
            const mapPatch = fits ? this.placePieceOnMap(cells, fallback.rotation, piece) : [];
            this.broadcast({
                type: 'FORCE_PLACE',
                phase: PHASE.BUILD,
                payload: { seatIndex: seat.seatIndex, accepted: fits, col: fallback.col, row: fallback.row, rotation: fallback.rotation, mapPatch }
            });
        }

        this.completeBuild();
    }

    checkBuildComplete() {
        if (this.phase !== PHASE.BUILD) return;
        const allDone = this.connectedSeats.every(s => !s.piece || s.buildPlaced);
        if (allDone) this.completeBuild();
    }

    completeBuild() {
        if (this.phase !== PHASE.BUILD) return;
        clearTimeout(this.timers.build);
        const levelCode = (this.map && this.levelMeta)
            ? encodeLevelCode({
                map: this.map.MAP,
                rotations: this.map.MAP_R,
                size_x: this.map.size_x,
                ...this.levelMeta
            })
            : null;

        this.broadcast({ type: 'BUILD_COMPLETE', phase: PHASE.BUILD, payload: { mapPatch: [], levelCode } });
        this.enterRace();
    }

    enterRace() {
        const raceTimeLimit = this.settings.raceTimeLimit;
        for (const seat of this.seats.values()) {
            seat.hasFinished = false;
            seat.finishTick = null;
            seat.eliminated = false;
            seat.dnf = false;
            seat.livesRemaining = this.settings.lives;
            seat.finishedPostmortem = false;
        }

        this.race = {
            eliminationObserved: new Map(),
            finishConfirmed: new Map(),
            eliminationConfirmed: new Map(),
            startedAt: Date.now()
        };

        this.phase = PHASE.RACE;
        this.broadcast({
            type: 'RACE_START',
            phase: PHASE.RACE,
            payload: {
                tick: 0,
                timeLimit: raceTimeLimit,
                lives: this.settings.lives,
                spawns: [...this.seats.values()].map(s => ({ seatIndex: s.seatIndex, x: null, y: null }))
            }
        });

        clearTimeout(this.timers.race);
        this.timers.race = setTimeout(() => this.expireRace(), raceTimeLimit * 1000);
        this.startTimeSync(PHASE.RACE, raceTimeLimit);
        clearTimeout(this.timers.roundEndDelay);
        this.timers.roundEndDelay = null;
        clearInterval(this.timers.raceIdleHeartbeat);
        this.timers.raceIdleHeartbeat = setInterval(() => {
            if (this.phase !== PHASE.RACE) return;
            for (const seat of this.seats.values()) {
                if (!seat.connected || seat.isBot) {
                    this.broadcast({ type: 'INPUT_RELAY', phase: PHASE.RACE, payload: { seatIndex: seat.seatIndex, tick: null, keys: '' } });
                }
            }
        }, 1000);
    }

    handleInputFrame(seat, payload) {
        if (this.phase !== PHASE.RACE) return;
        this.broadcast({
            type: 'INPUT_RELAY',
            phase: PHASE.RACE,
            payload: { seatIndex: seat.seatIndex, tick: payload.tick, keys: String(payload.keys || '') }
        });
    }

    handlePositionSnapshot(seat, payload) {
        if (this.phase !== PHASE.RACE && this.phase !== PHASE.STAGE_SELECT) return;
        this.broadcast({
            type: 'POSITION_SYNC',
            phase: this.phase,
            payload: {
                seatIndex: seat.seatIndex,
                tick: payload.tick,
                x: payload.x,
                y: payload.y,
                sx: payload.sx,
                sy: payload.sy,
                direction: payload.direction,
                dir: payload.dir,
                crouched: !!payload.crouched,
                onWall: !!payload.onWall
            }
        });
    }
    handleRespawnObserved(seat, payload = {}) {
        if (this.phase !== PHASE.RACE) return;
        if (this.race.finishConfirmed.has(seat.seatIndex)) return;
        if (this.race.eliminationConfirmed.has(seat.seatIndex)) return;
        this.broadcast({
            type: 'RESPAWN_SYNC',
            phase: PHASE.RACE,
            payload: { seatIndex: seat.seatIndex, tick: payload.tick | 0 }
        });
    }
    handleTileUpdate(seat, payload) {
        if (this.phase !== PHASE.RACE) return;
        this.broadcast({
            type: 'TILE_UPDATE',
            phase: PHASE.RACE,
            payload: { seatIndex: seat.seatIndex, idx: payload.idx | 0, tile: payload.tile, rot: payload.rot }
        });
    }

    requiredQuorum(excludeSeatIndex) {
        const others = this.connectedSeats.filter(s => s.seatIndex !== excludeSeatIndex);
        if (others.length === 0) return 0;
        return Math.ceil(others.length / 2);
    }

    handleFinishObserved(seat, payload) {
        if (this.phase !== PHASE.RACE) return;
        const finishedSeatIndex = payload.finishedSeatIndex | 0;
        if (!this.seats.has(finishedSeatIndex)) return;
        if (this.race.finishConfirmed.has(finishedSeatIndex)) return;

        const tick = payload.tick | 0;
        if (seat.seatIndex === finishedSeatIndex) {
            this.confirmFinish(finishedSeatIndex, tick, !!payload.postmortem);
            return;
        }
    }

    confirmFinish(seatIndex, finishTick, postmortem = false) {
        this.race.finishConfirmed.set(seatIndex, finishTick);
        const seat = this.seats.get(seatIndex);
        if (seat) {
            seat.hasFinished = true;
            seat.finishTick = finishTick;
            seat.finishedPostmortem = postmortem;
        }
        this.broadcast({ type: 'FINISH_CONFIRMED', phase: PHASE.RACE, payload: { seatIndex, finishTick } });
        this.checkRoundEnd();
    }

    handleEliminationObserved(seat, payload) {
        if (this.phase !== PHASE.RACE) return;
        const eliminatedSeatIndex = payload.eliminatedSeatIndex | 0;
        if (!this.seats.has(eliminatedSeatIndex)) return;
        if (this.race.eliminationConfirmed.has(eliminatedSeatIndex)) return;
        if (this.race.finishConfirmed.has(eliminatedSeatIndex)) return;
        if (seat.seatIndex === eliminatedSeatIndex) {
            this.confirmElimination(eliminatedSeatIndex, payload.cause === 'death' ? 'death' : 'death');
            return;
        }

        const tick = payload.tick | 0;
        const cause = payload.cause === 'death' ? 'death' : 'death';
        if (!this.race.eliminationObserved.has(eliminatedSeatIndex)) this.race.eliminationObserved.set(eliminatedSeatIndex, []);
        const reports = this.race.eliminationObserved.get(eliminatedSeatIndex);

        const existingIdx = reports.findIndex(r => r.observerSeatIndex === seat.seatIndex);
        const report = { tick, observerSeatIndex: seat.seatIndex, cause };
        if (existingIdx !== -1) reports[existingIdx] = report;
        else reports.push(report);

        const buckets = new Map();
        for (const r of reports) {
            let bucketTick = [...buckets.keys()].find(t => Math.abs(t - r.tick) <= FINISH_TICK_TOLERANCE);
            if (bucketTick === undefined) bucketTick = r.tick;
            if (!buckets.has(bucketTick)) buckets.set(bucketTick, new Set());
            buckets.get(bucketTick).add(r.observerSeatIndex);
        }

        const quorumNeeded = this.requiredQuorum(eliminatedSeatIndex);
        for (const observers of buckets.values()) {
            const independentObservers = [...observers].filter(o => o !== eliminatedSeatIndex);
            if (independentObservers.length >= quorumNeeded) {
                this.confirmElimination(eliminatedSeatIndex, 'death');
                return;
            }
        }
    }

    confirmElimination(seatIndex, cause) {
        this.race.eliminationConfirmed.set(seatIndex, cause);
        const seat = this.seats.get(seatIndex);
        if (seat) {
            seat.eliminated = true;
            seat.dnf = cause === 'dnf';
        }
        this.broadcast({ type: 'ELIMINATION_CONFIRMED', phase: PHASE.RACE, payload: { seatIndex, cause } });
        this.checkRoundEnd();
    }

    expireRace() {
        if (this.phase !== PHASE.RACE) return;
        for (const seat of this.seats.values()) {
            if (this.race.finishConfirmed.has(seat.seatIndex)) continue;
            if (this.race.eliminationConfirmed.has(seat.seatIndex)) continue;
            this.race.eliminationConfirmed.set(seat.seatIndex, 'dnf');
            seat.eliminated = true;
            seat.dnf = true;
            this.broadcast({ type: 'ELIMINATION_CONFIRMED', phase: PHASE.RACE, payload: { seatIndex: seat.seatIndex, cause: 'dnf' } });
        }

        this.broadcast({ type: 'RACE_TIMER_EXPIRED', phase: PHASE.RACE, payload: {} });
        this.endRound();
    }
    checkRoundEnd() {
        if (this.phase !== PHASE.RACE) return;
        const allResolved = this.connectedSeats.every(
            s => this.race.finishConfirmed.has(s.seatIndex) || this.race.eliminationConfirmed.has(s.seatIndex)
        );
        if (allResolved) {
            clearTimeout(this.timers.race);
            this.scheduleRoundEnd();
        }
    }
    scheduleRoundEnd() {
        if (this.timers.roundEndDelay) return;
        this.timers.roundEndDelay = setTimeout(() => {
            this.timers.roundEndDelay = null;
            this.endRound();
        }, ROUND_END_DELAY_MS);
    }

    endRound() {
        clearTimeout(this.timers.race);
        clearTimeout(this.timers.roundEndDelay);
        this.timers.roundEndDelay = null;
        clearInterval(this.timers.raceIdleHeartbeat);
        clearInterval(this.timers.timeSync);
        const allFinishers = [...this.race.finishConfirmed.entries()]
            .map(([seatIndex, finishTick]) => {
                const seat = this.seats.get(seatIndex);
                return {
                    seatIndex,
                    finishTick,
                    eliminated: seat?.eliminated === true,
                    postmortem: seat?.eliminated === true || seat?.finishedPostmortem === true
                };
            })
            .sort((a, b) => a.finishTick - b.finishTick);
        const finishers = allFinishers.filter(f => !f.postmortem);
        const postmortemFinishers = allFinishers.filter(f => f.postmortem);
        const POSTMORTEM_POINTS = 2;

        const totalSeats = this.connectedSeats.length;
        const tooEasy = totalSeats > 0 && finishers.length === totalSeats;
        const tooHard = finishers.length === 0;
        const COMEBACK_SCORE_GAP = 10;
        const firstPlacePoints = this.settings.firstPlacePoints;
        const comebackPoints = this.settings.comebackPoints;
        const preRoundScores = new Map([...this.seats.values()].map(s => [s.seatIndex, s.score]));
        const leaderScore = Math.max(0, ...preRoundScores.values());
        const roundPoints = new Map();
        const roundBreakdown = new Map();
        if (!tooHard) {
            for (let i = 0; i < finishers.length; i++) {
                const { seatIndex } = finishers[i];
                const breakdown = { goal: 0, firstPlace: 0, comeback: 0, solo: 0, postmortem: 0 };

                if (!tooEasy) {
                    breakdown.goal = 3;

                    if (totalSeats > 2 && finishers.length === 1) breakdown.solo = 2;
                    else if (i === 0 && finishers.length > 1) breakdown.firstPlace = firstPlacePoints;

                    const behindBy = leaderScore - (preRoundScores.get(seatIndex) || 0);
                    if (behindBy >= COMEBACK_SCORE_GAP) breakdown.comeback = comebackPoints;
                } else if (i === 0 && finishers.length > 1) {
                    breakdown.firstPlace = firstPlacePoints;
                }

                const points = breakdown.goal + breakdown.firstPlace + breakdown.comeback + breakdown.solo;
                roundPoints.set(seatIndex, points);
                roundBreakdown.set(seatIndex, breakdown);
            }
        }

        for (const { seatIndex } of postmortemFinishers) {
            const breakdown = { goal: 0, firstPlace: 0, comeback: 0, solo: 0, postmortem: POSTMORTEM_POINTS };
            roundPoints.set(seatIndex, POSTMORTEM_POINTS);
            roundBreakdown.set(seatIndex, breakdown);
        }

        const results = [];
        for (const seat of this.seats.values()) {
            const points = roundPoints.get(seat.seatIndex) || 0;
            const breakdown = roundBreakdown.get(seat.seatIndex) || { goal: 0, firstPlace: 0, comeback: 0, solo: 0, postmortem: 0 };
            seat.score += points;
            results.push({
                seatIndex: seat.seatIndex,
                hasFinished: seat.hasFinished,
                dnf: seat.dnf,
                eliminated: seat.eliminated,
                finishTick: seat.finishTick,
                roundPoints: points,
                pointBreakdown: breakdown,
                totalScore: seat.score
            });
        }

        this.phase = PHASE.ROUND_RESULTS;
        this.locks.continueAdvanced = false;
        this.continueConfirmations = new Set();
        this.lastRoundEndPayload = { round: this.currentRound, results };
        this.broadcast({ type: 'ROUND_END', phase: PHASE.RACE, payload: this.lastRoundEndPayload });
        const seatList = [...this.seats.values()];
        this.lastRoundDeaths = {
            anyEliminated: seatList.some(s => s.eliminated),
            allEliminated: seatList.length > 0 && seatList.every(s => s.eliminated)
        };
    }

    handleContinueRequest(seat) {
        if (this.phase !== PHASE.ROUND_RESULTS) return;
        if (this.locks.continueAdvanced) return;
        if (!this.continueConfirmations) this.continueConfirmations = new Set();
        if (this.continueConfirmations.has(seat.seatIndex)) return;

        this.continueConfirmations.add(seat.seatIndex);
        this.broadcast({
            type: 'CONTINUE_PROGRESS',
            phase: PHASE.ROUND_RESULTS,
            payload: {
                seatIndex: seat.seatIndex,
                confirmedSeats: [...this.continueConfirmations],
                totalConnected: this.connectedSeats.length
            }
        });

        this.checkContinueVotesComplete();
    }

    checkContinueVotesComplete() {
        if (this.phase !== PHASE.ROUND_RESULTS) return;
        if (this.locks.continueAdvanced) return;
        const allConfirmed = this.connectedSeats.length > 0 &&
            this.connectedSeats.every(s => this.continueConfirmations.has(s.seatIndex));
        if (allConfirmed) this.advanceRound();
    }
    handleNextRequest(seat) {
        if (!seat || !seat.isAdmin) return;
        if (this.phase !== PHASE.ROUND_RESULTS) return;
        if (this.locks.continueAdvanced) return;
        console.log(`[room ${this.roomCode}] admin "${seat.name}" skipped round-results wait`);
        this.advanceRound();
    }

    advanceRound() {
        if (this.locks.continueAdvanced) return;
        this.locks.continueAdvanced = true;
        for (const seat of this.connectedSeats) this.continueConfirmations.add(seat.seatIndex);

        const someoneWon = [...this.seats.values()].some(s => s.score >= this.settings.pointsToWin);
        if (someoneWon || this.currentRound >= this.totalRounds) {
            let rank = 0, lastScore = null;
            const finalStandings = [...this.seats.values()]
                .map(s => ({ seatIndex: s.seatIndex, totalScore: s.score }))
                .sort((a, b) => b.totalScore - a.totalScore)
                .map((entry, i) => {
                    if (entry.totalScore !== lastScore) { rank = i + 1; lastScore = entry.totalScore; }
                    return { ...entry, rank };
                });

            const finalLevelCode = (this.map && this.levelMeta)
                ? encodeLevelCode({
                    map: this.map.MAP,
                    rotations: this.map.MAP_R,
                    size_x: this.map.size_x,
                    ...this.levelMeta
                })
                : null;

            this.broadcast({ type: 'MATCH_END', phase: PHASE.ROUND_RESULTS, payload: { finalStandings, levelCode: finalLevelCode } });
            const winners = finalStandings.filter(s => s.rank === 1).map(s => this.seats.get(s.seatIndex)?.name);
            console.log(`[room ${this.roomCode}] MATCH_END levelCode=${finalLevelCode}`);
            console.log(`[room ${this.roomCode}] final standings:`, finalStandings.map(s => `${this.seats.get(s.seatIndex)?.name} (${s.totalScore} pts, rank ${s.rank})`));
            console.log(`[room ${this.roomCode}] winner(s): ${winners.join(', ')}`);
            for (const s of this.seats.values()) {
                s.score = 0;
                s.piece = null;
                s.buildPlaced = false;
                s.hasFinished = false;
                s.finishTick = null;
                s.eliminated = false;
                s.dnf = false;
            }
            this.currentRound = 1;
            this.lastRoundDeaths = { anyEliminated: false, allEliminated: false };
            this.map = null;
            this.levelMeta = null;
            this.stageVotes = new Map();
            this.continueConfirmations = new Set();
            this.locks.stagePicked = false;
            this.locks.continueAdvanced = false;

            this.broadcast({ type: 'REMATCH_STARTING', phase: PHASE.ROUND_RESULTS, payload: {} });
            this.enterStageSelect();
        } else {
            this.currentRound += 1;
            this.broadcast({ type: 'NEXT_ROUND_START', phase: PHASE.ROUND_RESULTS, payload: { round: this.currentRound } });
            this.enterPartyBox();
        }
    }

    handleDisconnect(seat, reason = 'disconnected') {
        const wasHost = seat.seatIndex === this.hostSeatIndex;
        if (this.phase === PHASE.RACE && this.race) {
            if (!this.race.finishConfirmed.has(seat.seatIndex) && !this.race.eliminationConfirmed.has(seat.seatIndex)) {
                this.confirmElimination(seat.seatIndex, 'dnf');
            }
        }

        seat.connected = false;
        seat.ws = null;
        this.updateEmptiedAt();
        if (wasHost) {
            const successor = this.connectedSeats.find(s => !s.isBot) || this.connectedSeats[0];
            if (successor) this.hostSeatIndex = successor.seatIndex;
        }
        this.broadcast({ type: 'PLAYER_LEFT', phase: this.phase, payload: { seatIndex: seat.seatIndex, reason, hostSeatIndex: this.hostSeatIndex } });
        this.announceLeave(seat, reason);

        switch (this.phase) {
            case PHASE.LOBBY:
                this.broadcastRoomState();
                break;
            case PHASE.STAGE_SELECT:
                this.checkStageVotesComplete();
                this.updateStageCountdown();
                break;
            case PHASE.PARTY_BOX:
                this.checkPartyBoxComplete();
                break;
            case PHASE.BUILD:
                this.checkBuildComplete();
                break;
            case PHASE.ROUND_RESULTS:
                this.checkContinueVotesComplete();
                break;
        }
        if (reason === 'kicked') {
            this.seats.delete(seat.seatIndex);
            return;
        }
        clearTimeout(seat.disconnectCleanupTimer);
        seat.disconnectCleanupTimer = setTimeout(() => {
            if (!seat.connected) this.seats.delete(seat.seatIndex);
        }, SEAT_RECONNECT_GRACE_MS);
    }

    handleLoginRequest(seat, payload = {}) {
        if (!seat) return;
        const now = Date.now();
        seat.loginAttempts = (seat.loginAttempts || []).filter(t => now - t < LOGIN_ATTEMPT_WINDOW_MS);
        if (seat.loginAttempts.length >= LOGIN_MAX_ATTEMPTS) {
            this.send(seat, { type: 'LOGIN_RESULT', phase: this.phase, payload: { success: false, reason: 'too_many_attempts' } });
            return;
        }
        seat.loginAttempts.push(now);

        const password = payload && typeof payload.password === 'string' ? payload.password : '';
        const success = password.length > 0 && password === ADMIN_PASSWORD;
        if (success) {
            seat.isAdmin = true;
            seat.loginAttempts = [];
            console.log(`[room ${this.roomCode}] seat #${seat.seatIndex} "${seat.name}" logged in as admin`);
        } else {
            console.log(`[room ${this.roomCode}] seat #${seat.seatIndex} "${seat.name}" failed admin login`);
        }
        this.send(seat, { type: 'LOGIN_RESULT', phase: this.phase, payload: { success } });
    }
    handleGiveRequest(seat, payload = {}) {
        if (!seat || !seat.isAdmin) return;

        const kind = payload && typeof payload.kind === 'string' ? payload.kind.toLowerCase() : '';
        const amount = Math.round(Number(payload && payload.amount));
        if (!Number.isFinite(amount) || amount === 0) return;
        const targetName = payload && typeof payload.targetName === 'string' ? payload.targetName : '';
        const target = this.findSeatByName(targetName);
        if (!target) return;

        if (kind === 'points') {
            this.adjustScore(target, amount);
            return;
        }

        if (kind === 'lives') {
            if (this.phase !== PHASE.RACE) return;
            target.livesRemaining = Math.max(0, (target.livesRemaining || 0) + amount);
            this.broadcast({
                type: 'LIVES_ADJUSTED',
                phase: this.phase,
                payload: { seatIndex: target.seatIndex, delta: amount, totalLives: target.livesRemaining }
            });
        }
    }

    adjustScore(seat, delta) {
        if (!seat) return false;
        seat.score = Math.max(0, seat.score + delta);
        this.broadcast({
            type: 'SCORE_ADJUSTED',
            phase: this.phase,
            payload: { seatIndex: seat.seatIndex, delta, totalScore: seat.score }
        });
        return true;
    }

    handleChatMessage(seat, payload) {
        if (!seat) return;
        const raw = payload && typeof payload.text === 'string' ? payload.text : '';
        const text = raw.replace(/\s+/g, ' ').trim().slice(0, CHAT_MESSAGE_MAX_LENGTH);
        if (!text) return;
        const now = Date.now();
        seat.chatTimestamps = (seat.chatTimestamps || []).filter(t => now - t < 5000);
        if (seat.chatTimestamps.length >= 5) return;
        seat.chatTimestamps.push(now);

        console.log(`[room ${this.roomCode}] chat #${seat.seatIndex} ${seat.name}: ${text}`);

        this.broadcast({
            type: 'CHAT_BROADCAST',
            phase: this.phase,
            payload: { seatIndex: seat.seatIndex, name: seat.name, hue: seat.hue, text }
        });
    }
    findSeatByName(query) {
        if (!query) return null;
        const needle = query.trim().toLowerCase();
        if (!needle) return null;

        const candidates = this.connectedSeats;
        for (const seat of candidates) {
            if (seat.name.toLowerCase() === needle) return seat;
        }
        for (const seat of candidates) {
            if (seat.name.toLowerCase().startsWith(needle)) return seat;
        }
        for (const seat of candidates) {
            if (seat.name.toLowerCase().includes(needle)) return seat;
        }
        return null;
    }

    handleKickRequest(seat, payload = {}) {
        if (!this.isPrivileged(seat)) return;
        const query = payload && typeof payload.name === 'string' ? payload.name : '';
        const target = this.findSeatByName(query);
        if (!target) return;
        if (target.isAdmin) {
            this.send(seat, { type: 'KICK_REJECTED', phase: this.phase, payload: { name: target.name, reason: 'target_is_admin' } });
            return;
        }

        console.log(`[room ${this.roomCode}] host kicked "${target.name}" (seat ${target.seatIndex})`);
        this.kickSeat(target, 'kicked_by_host');
    }
    handleHostRequest(seat, payload = {}) {
        if (!seat || !seat.isAdmin) return;
        const targetName = payload && typeof payload.name === 'string' ? payload.name.trim() : '';
        const target = targetName ? this.findSeatByName(targetName) : seat;
        if (!target) return;

        this.hostSeatIndex = target.seatIndex;
        console.log(`[room ${this.roomCode}] host set to "${target.name}" (seat ${target.seatIndex}) by admin "${seat.name}"`);

        if (this.phase === PHASE.LOBBY) {
            this.broadcastRoomState();
        } else {
            this.broadcast({
                type: 'HOST_UPDATED',
                phase: this.phase,
                payload: { hostSeatIndex: this.hostSeatIndex }
            });
        }
    }
    handleSetRequest(seat, payload = {}) {
        if (!seat || !seat.isAdmin) return;

        const kind = payload && typeof payload.kind === 'string' ? payload.kind.toLowerCase() : '';
        const value = Math.round(Number(payload && payload.amount));
        if (!Number.isFinite(value) || value < 0) return;
        const targetName = payload && typeof payload.targetName === 'string' ? payload.targetName : '';
        const target = this.findSeatByName(targetName);
        if (!target) return;

        if (kind === 'points') {
            this.adjustScore(target, value - target.score);
            return;
        }

        if (kind === 'lives') {
            if (this.phase !== PHASE.RACE) return;
            const delta = value - (target.livesRemaining || 0);
            target.livesRemaining = value;
            this.broadcast({
                type: 'LIVES_ADJUSTED',
                phase: this.phase,
                payload: { seatIndex: target.seatIndex, delta, totalLives: target.livesRemaining }
            });
        }
    }
    handleKillRequest(seat, payload = {}) {
        if (!seat || !seat.isAdmin) return;
        if (this.phase !== PHASE.RACE || !this.race) return;

        const targetName = payload && typeof payload.name === 'string' ? payload.name : '';
        const target = this.findSeatByName(targetName);
        if (!target) return;
        if (this.race.finishConfirmed.has(target.seatIndex)) return;
        if (this.race.eliminationConfirmed.has(target.seatIndex)) return;

        console.log(`[room ${this.roomCode}] admin "${seat.name}" killed "${target.name}" (seat ${target.seatIndex})`);
        this.confirmElimination(target.seatIndex, 'death');
    }

    kickSeat(seat, reason = 'kicked') {
        if (!seat) return false;
        this.send(seat, { type: 'KICKED', phase: this.phase, payload: { reason } });
        if (seat.connected && seat.ws) {
            try { seat.ws.close(); } catch (err) {  }
        }
        this.handleDisconnect(seat, 'kicked');
        return true;
    }

    handleReconnect(seat, ws, displayName) {
        clearTimeout(seat.disconnectCleanupTimer);
        seat.ws = ws;
        seat.connected = true;
        seat.isBot = false;
        ws.seatIndex = seat.seatIndex;
        ws.roomCode = this.roomCode;
        this.updateEmptiedAt();

        const cleanName = Room.sanitizeDisplayName(displayName, null);
        if (cleanName && cleanName.toLowerCase() !== seat.name.toLowerCase() && !this.isNameTaken(cleanName)) {
            seat.name = cleanName;
        }

        this.broadcast({ type: 'PLAYER_RECONNECTED', phase: this.phase, payload: { seatIndex: seat.seatIndex } });
        if (this.phase === PHASE.STAGE_SELECT) this.updateStageCountdown();
        const mapPatch = this.map
            ? this.map.MAP.map((tile, idx) => ({ idx, tile, rot: this.map.MAP_R[idx] })).filter(p => p.tile !== 0 && p.tile !== 1)
            : [];
        this.broadcastRoomState();
        this.send(seat, { type: 'PLAYER_RECONNECTED', phase: this.phase, payload: { seatIndex: seat.seatIndex, mapPatch } });
        this.sendJoinCatchUp(seat);
    }

    isEmpty() {
        return this.connectedSeats.length === 0;
    }

    destroy() {
        clearTimeout(this.timers.loadingBarrier);
        clearTimeout(this.timers.stageCountdown);
        clearTimeout(this.timers.partyBox);
        clearTimeout(this.timers.build);
        clearTimeout(this.timers.race);
        clearTimeout(this.timers.roundEndDelay);
        clearInterval(this.timers.raceIdleHeartbeat);
        clearInterval(this.timers.timeSync);
        for (const seat of this.seats.values()) clearTimeout(seat.disconnectCleanupTimer);
    }
}

module.exports = { Room };