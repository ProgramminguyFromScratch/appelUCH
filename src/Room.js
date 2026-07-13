const {
    PHASE,
    TOTAL_ROUNDS,
    getPartyBoxSlotCount,
    PARTY_TIME_LIMIT,
    BUILD_TIME_LIMIT,
    RACE_TIME_LIMIT,
    MIN_PLAYERS_TO_START,
    MAX_PLAYERS,
    FINISH_TICK_TOLERANCE,
    LOADING_BARRIER_TIMEOUT_MS,
    ROUND_END_DELAY_MS,
    CHAT_MESSAGE_MAX_LENGTH
} = require('./protocol');
const { decodeLevelCode, encodeLevelCode } = require('./levelCode');
const { PIECE_POOL, getPieceById, getPieceFootprintCells } = require('./pieces');
const { LEVEL_POOL } = require('./levels');

const POINTS_TO_WIN = 15;

// Sprite tinting on the client shifts hue on a 0-199 scale (see
// LevelRenderer.applyColorEffect's `hueShift % 200`), so seats store their
// chosen color as a hue in that same range.
const HUE_MIN = 0;
const HUE_MAX = 199;
const DEFAULT_HUE_STEP = 34; // roughly spaces out default hues for new seats

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

        this.currentRound = 1;
        this.totalRounds = TOTAL_ROUNDS;

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
    isNameTaken(displayName) {
        const normalized = (displayName || '').trim().toLowerCase();
        if (!normalized) return false;
        return this.connectedSeats.some(s => s.name.trim().toLowerCase() === normalized);
    }

    addSeat(ws, displayName) {
        if (this.seats.size >= MAX_PLAYERS) return null;
        if (this.phase !== PHASE.LOBBY) return null;

        const seatIndex = this.nextSeatIndex++;
        const hue = (seatIndex * DEFAULT_HUE_STEP) % (HUE_MAX + 1);
        const seat = {
            seatIndex,
            playerId: generatePlayerId(),
            name: (displayName || `P${seatIndex + 1}`).slice(0, 24),
            ws,
            connected: true,
            isBot: false,
            hue,
            ready: false,
            stageCursor: 0,
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
            dnf: false
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
        this.broadcast({ type: 'ROOM_STATE', phase: PHASE.LOBBY, payload: this.roomStatePayload() });
    }

    handleSetColorRequest(seat, payload = {}) {
        if (this.phase !== PHASE.LOBBY) return;
        const hue = Math.round(Number(payload.hue));
        if (!Number.isFinite(hue) || hue < HUE_MIN || hue > HUE_MAX) return;

        seat.hue = hue;
        this.broadcastRoomState();
    }

    handleStartMatchRequest(seat) {
        if (this.phase !== PHASE.LOBBY) return;
        if (seat.seatIndex !== this.hostSeatIndex) return;
        if (this.connectedSeats.length < MIN_PLAYERS_TO_START) return;

        this.phase = PHASE.LOADING;
        this.broadcast({
            type: 'MATCH_STARTING',
            phase: PHASE.LOADING,
            payload: { playerCount: this.seats.size, totalRounds: this.totalRounds }
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
        for (const seat of this.seats.values()) seat.stageCursor = 0;
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
        const cursorIndex = Math.max(0, Math.min(n - 1, payload.cursorIndex | 0));
        seat.stageCursor = cursorIndex;
        this.broadcast({
            type: 'STAGE_CURSOR_MOVE',
            phase: PHASE.STAGE_SELECT,
            payload: { seatIndex: seat.seatIndex, cursorIndex }
        });
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
        let pool = allowBomb
            ? [...PIECE_POOL]
            : PIECE_POOL.filter(p => p.id !== 'bomb');
        for (let i = pool.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [pool[i], pool[j]] = [pool[j], pool[i]];
        }

        const slots = pool
            .slice(0, Math.min(count, pool.length))
            .map(piece => ({ pieceId: piece.id }));

        if (guaranteeBomb && !slots.some(s => s.pieceId === 'bomb')) {
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
        const allHavePieces = [...this.seats.values()].every(s => !!s.piece);
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
        const allDone = [...this.seats.values()].every(s => !s.piece || s.buildPlaced);
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
        for (const seat of this.seats.values()) {
            seat.hasFinished = false;
            seat.finishTick = null;
            seat.eliminated = false;
            seat.dnf = false;
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
                timeLimit: RACE_TIME_LIMIT,
                spawns: [...this.seats.values()].map(s => ({ seatIndex: s.seatIndex, x: null, y: null }))
            }
        });

        clearTimeout(this.timers.race);
        this.timers.race = setTimeout(() => this.expireRace(), RACE_TIME_LIMIT * 1000);
        this.startTimeSync(PHASE.RACE, RACE_TIME_LIMIT);
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
        if (this.phase !== PHASE.RACE) return;
        this.broadcast({
            type: 'POSITION_SYNC',
            phase: PHASE.RACE,
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
            this.confirmFinish(finishedSeatIndex, tick);
            return;
        }
    }

    confirmFinish(seatIndex, finishTick) {
        this.race.finishConfirmed.set(seatIndex, finishTick);
        const seat = this.seats.get(seatIndex);
        if (seat) {
            seat.hasFinished = true;
            seat.finishTick = finishTick;
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
        const allResolved = [...this.seats.values()].every(
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
            .map(([seatIndex, finishTick]) => ({ seatIndex, finishTick, eliminated: this.seats.get(seatIndex)?.eliminated === true }))
            .sort((a, b) => a.finishTick - b.finishTick);

        // A seat can end up both "finished" and "eliminated" if it died but its
        // momentum/others' observations still carried it across the goal. That
        // doesn't count as legitimately beating the level, so it's excluded from
        // normal scoring and instead earns a flat Postmortem award below.
        const finishers = allFinishers.filter(f => !f.eliminated);
        const postmortemFinishers = allFinishers.filter(f => f.eliminated);
        const POSTMORTEM_POINTS = 2;

        const totalSeats = this.seats.size;
        const tooEasy = totalSeats > 0 && finishers.length === totalSeats;
        const tooHard = finishers.length === 0;
        const COMEBACK_SCORE_GAP = 10;
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
                    else if (i === 0 && finishers.length > 1) breakdown.firstPlace = 1;

                    const behindBy = leaderScore - (preRoundScores.get(seatIndex) || 0);
                    if (behindBy >= COMEBACK_SCORE_GAP) breakdown.comeback = 2;
                } else if (i === 0 && finishers.length > 1) {
                    // Everyone cleared the level, so no goal/comeback points, but the
                    // first player across the line still earns their placement point —
                    // unless this was a solo finish.
                    breakdown.firstPlace = 1;
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
        this.broadcast({ type: 'ROUND_END', phase: PHASE.RACE, payload: { round: this.currentRound, results } });
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

    advanceRound() {
        if (this.locks.continueAdvanced) return;
        this.locks.continueAdvanced = true;

        const someoneWon = [...this.seats.values()].some(s => s.score >= POINTS_TO_WIN);
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

            // The players already confirmed via the continue vote above — roll straight
            // into a fresh match instead of parking on a separate "final results" screen
            // that would require a second vote.
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

        // Resolve them out of the current race before removing the seat so
        // finish/elimination bookkeeping (and any pending quorum) stays consistent.
        if (this.phase === PHASE.RACE && this.race) {
            if (!this.race.finishConfirmed.has(seat.seatIndex) && !this.race.eliminationConfirmed.has(seat.seatIndex)) {
                this.confirmElimination(seat.seatIndex, 'dnf');
            }
        }

        this.seats.delete(seat.seatIndex);
        this.updateEmptiedAt();

        // Hand the host badge to whoever's left, so the room isn't stuck without one.
        // Prefer a connected human seat over a disconnected or bot-controlled one,
        // falling back to whatever's left if nothing better is available.
        if (wasHost && this.seats.size > 0) {
            const remaining = [...this.seats.values()];
            const successor = remaining.find(s => s.connected && !s.isBot) || remaining.find(s => s.connected) || remaining[0];
            this.hostSeatIndex = successor.seatIndex;
        }

        // hostSeatIndex is included here (not just in ROOM_STATE) because a host
        // handoff can happen mid-match, long before the room is back in the LOBBY
        // phase where ROOM_STATE gets rebroadcast — clients need this to keep their
        // local "am I host" flag correct in the meantime.
        this.broadcast({ type: 'PLAYER_LEFT', phase: this.phase, payload: { seatIndex: seat.seatIndex, reason, hostSeatIndex: this.hostSeatIndex } });

        switch (this.phase) {
            case PHASE.LOBBY:
                this.broadcastRoomState();
                break;
            case PHASE.STAGE_SELECT:
                this.checkStageVotesComplete();
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
            // RACE is already resolved above via confirmElimination(), which
            // internally calls checkRoundEnd() for us.
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

        // Simple flood guard: at most 5 messages per seat per 5 seconds.
        const now = Date.now();
        seat.chatTimestamps = (seat.chatTimestamps || []).filter(t => now - t < 5000);
        if (seat.chatTimestamps.length >= 5) return;
        seat.chatTimestamps.push(now);

        this.broadcast({
            type: 'CHAT_BROADCAST',
            phase: this.phase,
            payload: { seatIndex: seat.seatIndex, name: seat.name, hue: seat.hue, text }
        });
    }

    kickSeat(seat, reason = 'kicked') {
        if (!seat) return false;
        this.send(seat, { type: 'KICKED', phase: this.phase, payload: { reason } });
        if (seat.connected && seat.ws) {
            try { seat.ws.close(); } catch (err) { /* ignore */ }
        }
        // handleDisconnect() does all the real bookkeeping (race resolution,
        // host handoff, phase-specific quorum checks, broadcasting PLAYER_LEFT).
        // The socket's 'close' event will also fire and call handleDisconnect
        // again, but by then the seat will already be removed from this.seats,
        // so seatFor() will return null and it'll be a no-op.
        this.handleDisconnect(seat, 'kicked');
        return true;
    }

    handleReconnect(seat, ws) {
        seat.ws = ws;
        seat.connected = true;
        seat.isBot = false;
        ws.seatIndex = seat.seatIndex;
        ws.roomCode = this.roomCode;
        this.updateEmptiedAt();

        this.broadcast({ type: 'PLAYER_RECONNECTED', phase: this.phase, payload: { seatIndex: seat.seatIndex } });
        const mapPatch = this.map
            ? this.map.MAP.map((tile, idx) => ({ idx, tile, rot: this.map.MAP_R[idx] })).filter(p => p.tile !== 0 && p.tile !== 1)
            : [];
        this.send(seat, { type: 'ROOM_STATE', phase: this.phase, payload: this.roomStatePayload() });
        this.send(seat, { type: 'PLAYER_RECONNECTED', phase: this.phase, payload: { seatIndex: seat.seatIndex, mapPatch } });
    }

    isEmpty() {
        return this.connectedSeats.length === 0;
    }

    destroy() {
        clearTimeout(this.timers.loadingBarrier);
        clearTimeout(this.timers.partyBox);
        clearTimeout(this.timers.build);
        clearTimeout(this.timers.race);
        clearTimeout(this.timers.roundEndDelay);
        clearInterval(this.timers.raceIdleHeartbeat);
        clearInterval(this.timers.timeSync);
    }
}

module.exports = { Room };