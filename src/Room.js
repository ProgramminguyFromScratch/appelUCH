const {
    PHASE,
    TOTAL_ROUNDS,
    getPartyBoxSlotCount,
    STAGE_TIME_LIMIT,
    PARTY_TIME_LIMIT,
    BUILD_TIME_LIMIT,
    RACE_TIME_LIMIT,
    MIN_PLAYERS_TO_START,
    MAX_PLAYERS,
    FINISH_TICK_TOLERANCE,
    LOADING_BARRIER_TIMEOUT_MS,
    ROUND_END_DELAY_MS
} = require('./protocol');
const { decodeLevelCode, encodeLevelCode } = require('./levelCode');
const { PIECE_POOL, getPieceById, getPieceFootprintCells } = require('./pieces');
const { LEVEL_POOL } = require('./levels');

let nextPlayerId = 1;
function generatePlayerId() {
    return `p${nextPlayerId++}_${Math.random().toString(36).slice(2, 8)}`;
}

class Room {
    constructor(roomCode) {
        this.roomCode = roomCode;
        this.seats = new Map(); // seatIndex -> seat
        this.hostSeatIndex = 0;
        this.nextSeatIndex = 0;
        this.phase = PHASE.LOBBY;

        this.currentRound = 1;
        this.totalRounds = TOTAL_ROUNDS;

        this.stageCandidates = [];
        this.stageVotes = new Map(); // seatIndex -> candidateIndex, cleared each enterStageSelect()
        this.levelCode = null;
        this.map = null; // { MAP: number[], MAP_R: number[], size_x } — authoritative, persists round-to-round
        // The rest of what decodeLevelCode() returns besides map/rotations/
        // size_x — command strings, wall data, hue — needed alongside
        // this.map to re-serialize a levelCode via encodeLevelCode() (see
        // BUILD_COMPLETE below). Set once in lockStage() and never
        // touched again; it's static per-stage, unlike this.map.
        this.levelMeta = null; // { MAP_DATA, wall, hue, hue2 }
        this.startCell = { col: 0, row: 0 };

        this.partySlots = []; // Array<{ slotIndex, pieceId } | null>

        // Whether the round that just finished had anyone eliminated —
        // drives whether the bomb can appear in the next party box (see
        // pickPartySlots()). No round has finished yet, so no bomb in
        // round 1's box.
        this.lastRoundDeaths = { anyEliminated: false, allEliminated: false };
        this.locks = { stagePicked: false, continueAdvanced: false, playAgainAdvanced: false };

        this.timers = {}; // name -> Timeout/Interval handle

        this.race = null; // set up fresh each round by enterRace()

        this.createdAt = Date.now();
        // Timestamp the room most recently became empty (0 connected
        // seats), or null while it currently has someone connected.
        // RoomManager.sweepEmptyRooms() reaps a room 5 min after *this*,
        // not 5 min after createdAt — see updateEmptiedAt().
        this.emptiedAt = this.isEmpty() ? this.createdAt : null;
    }

    // ---------- seat / connection management ----------

    get connectedSeats() {
        return [...this.seats.values()].filter(s => s.connected);
    }

    // Call after anything that can change connectedSeats.length (a seat
    // joining, disconnecting, or reconnecting) so this.emptiedAt always
    // reflects the most recent moment the room actually had zero
    // connected seats — RoomManager.sweepEmptyRooms() reaps 5 min after
    // that, not 5 min after this.createdAt.
    updateEmptiedAt() {
        if (this.isEmpty()) {
            if (this.emptiedAt === null) this.emptiedAt = Date.now();
        } else {
            this.emptiedAt = null;
        }
    }

    // Case-insensitive, trimmed comparison against every currently
    // connected seat's name — a disconnected seat's old name doesn't
    // block a new join, since that seat isn't "present" anymore (and a
    // genuine reconnect matches on playerId in index.js, not name, so
    // it never even reaches this check).
    isNameTaken(displayName) {
        const normalized = (displayName || '').trim().toLowerCase();
        if (!normalized) return false;
        return this.connectedSeats.some(s => s.name.trim().toLowerCase() === normalized);
    }

    addSeat(ws, displayName) {
        if (this.seats.size >= MAX_PLAYERS) return null;
        if (this.phase !== PHASE.LOBBY) return null; // no late joins mid-match in this pass

        const seatIndex = this.nextSeatIndex++;
        const seat = {
            seatIndex,
            playerId: generatePlayerId(),
            name: (displayName || `P${seatIndex + 1}`).slice(0, 24),
            ws,
            connected: true,
            isBot: false,
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

    // ---------- send helpers ----------

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
                isBot: s.isBot
            }))
        };
    }

    broadcastRoomState() {
        this.broadcast({ type: 'ROOM_STATE', phase: PHASE.LOBBY, payload: this.roomStatePayload() });
    }

    // ---------- 2. Lobby ----------

    handleStartMatchRequest(seat) {
        if (this.phase !== PHASE.LOBBY) return;
        if (seat.seatIndex !== this.hostSeatIndex) return; // cheat flag: non-host rejected server-side
        if (this.connectedSeats.length < MIN_PLAYERS_TO_START) return;

        this.phase = PHASE.LOADING;
        this.broadcast({
            type: 'MATCH_STARTING',
            phase: PHASE.LOADING,
            payload: { playerCount: this.seats.size, totalRounds: this.totalRounds }
        });

        this.timers.loadingBarrier = setTimeout(() => this.forceAllClientsReady(), LOADING_BARRIER_TIMEOUT_MS);
    }

    // ---------- 3. Loading ----------

    handleClientReady(seat) {
        if (this.phase !== PHASE.LOADING) return;
        seat.ready = true;
        if (this.connectedSeats.every(s => s.ready)) {
            this.enterStageSelectFromLoading();
        }
    }

    forceAllClientsReady() {
        if (this.phase !== PHASE.LOADING) return;
        // Stragglers get treated as bot-controlled until they catch up
        // (they'll still send CLIENT_READY late; that's a no-op once
        // we've already left LOADING).
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

    // ---------- 4. Stage select ----------

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

    enterStageSelect() {
        this.stageCandidates = this.pickStageCandidates(3);
        this.locks.stagePicked = false;
        this.stageVotes = new Map();
        for (const seat of this.seats.values()) seat.stageCursor = 0;
        this.phase = PHASE.STAGE_SELECT;
        this.broadcast({
            type: 'STAGE_SELECT_START',
            phase: PHASE.STAGE_SELECT,
            payload: { candidates: this.stageCandidates, timeLimit: STAGE_TIME_LIMIT }
        });

        clearTimeout(this.timers.stageSelect);
        this.timers.stageSelect = setTimeout(() => this.expireStageSelect(), STAGE_TIME_LIMIT * 1000);
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

    // Stage selection is a vote, not a race to pick first: every
    // connected seat casts (or changes) a vote for one of the 3
    // candidates, and the level only locks in once every connected seat
    // has voted (or the STAGE_TIME_LIMIT timer runs out — see
    // expireStageSelect()). A seat can change its vote freely right up
    // until the tally happens.
    handleStagePickRequest(seat, payload) {
        if (this.phase !== PHASE.STAGE_SELECT) return;
        if (this.locks.stagePicked) return; // server already left STAGE_SELECT logically
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

    // Timer ran out before every connected seat voted — anyone who
    // hasn't voted gets a random vote among the candidates so the tally
    // (and any resulting tiebreak) still treats them fairly rather than
    // just excluding them.
    expireStageSelect() {
        if (this.phase !== PHASE.STAGE_SELECT) return;
        if (this.locks.stagePicked) return;
        for (const seat of this.connectedSeats) {
            if (!this.stageVotes.has(seat.seatIndex)) {
                this.stageVotes.set(seat.seatIndex, Math.floor(Math.random() * this.stageCandidates.length));
            }
        }
        this.finalizeStageVote();
    }

    // Tallies this.stageVotes into per-candidate counts and returns the
    // winning candidate index. Ties (including the "nobody voted"
    // degenerate case, where every count is 0) are broken uniformly at
    // random among the tied candidates.
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
        this.locks.stagePicked = true; // first finalize wins
        clearTimeout(this.timers.stageSelect);

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
        // Shared starting cell every seat's BUILD cursor begins at each
        // round (see pieces.js's placeBuildPiece() comment: players can
        // share a starting cell before they move off it). Tile 76 is the
        // level's spawn marker (see physics.js's `this.MAP.indexOf(76)`);
        // fall back to (0,0) if a level has none.
        if (!this.map) return { col: 0, row: 0 };
        const idx = this.map.MAP.indexOf(76);
        if (idx === -1) return { col: 0, row: 0 };
        const cols = this.map.size_x;
        return { col: idx % cols, row: Math.floor(idx / cols) };
    }

    // ---------- 5. Party box ----------

    // `allowBomb`/`guaranteeBomb` come from this.lastRoundDeaths (see
    // endRound()): no one revealed dies in the box unless at least one
    // player died last round, and if the whole seat died, one of the
    // revealed slots is forced to be a bomb.
    pickPartySlots(count, allowBomb, guaranteeBomb) {
        let pool = allowBomb
            ? [...PIECE_POOL]
            : PIECE_POOL.filter(p => p.id !== 'bomb');

        // Shuffle the pool (Fisher-Yates)
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

    enterPartyBox() {
        // Reveal count scales with room size — ceil(1.5 * playerCount) —
        // instead of a flat constant, so small rooms aren't stuck sorting
        // through slots sized for a full 6-player room. Uses this.seats.size
        // (all seated players, matching the playerCount already broadcast in
        // MATCH_STARTING) rather than connectedSeats, so a mid-match
        // disconnect doesn't shrink the box out from under the players still
        // playing.
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

        // Literal server-side reimplementation of confirmPartyPick()'s
        // two guard clauses: `if (!slot) return;` / `if (player.piece) return;`
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

    // ---------- 6. Build ----------

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

    // Bounds-check + overlap-check a piece's rotated footprint against
    // the room's authoritative map — the server-side twin of game.js's
    // footprintFits()/isPlaceableCell(), reusing pieces.js's
    // getPieceFootprintCells() as instructed. Pieces with
    // targetsSolid: true (currently just `bomb`, see pieces.js) aren't
    // required to land on a solid/functional tile to be *accepted* —
    // bounds are all that matter here, so a player is free to drop a
    // bomb on open air. Whether that actually deletes anything is
    // decided separately at write time (see placePieceOnMap()'s caller,
    // which gates each cell write on isDeletableCell()) — landing on
    // air just wastes the bomb instead of getting rejected.
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
                if (!(tile === 0 || tile === 1)) return false; // isPlaceableCell()
            }
            return true;
        });

        return { fits, cells };
    }

    // Writes `cells` into the authoritative map. For targetsSolid pieces
    // (bomb), only cells that are actually solid/functional get cleared
    // (isDeletableCell()) — a cell that was already open air is left
    // untouched, so a bomb dropped on air simply does nothing.
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
        if (seat.buildPlaced) return; // already placed this round
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

            // Timeout just means "place wherever the cursor currently
            // is" — same rules as a manual placement request. If it
            // doesn't fit there, the turn is wasted with no tiles
            // written rather than snapping to some other cell.
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

        // Hand players back a levelCode for exactly what BUILD just
        // produced (spawn tile + every piece placed this round and every
        // round before it) in the same format as the hardcoded
        // LEVEL_POOL entries, so it can be pasted into ?level= or shared
        // like any other stage. Built from this.map (kept up to date by
        // placePieceOnMap()) plus the static per-stage fields stashed in
        // this.levelMeta back in lockStage(). Falls back to null if
        // either is somehow missing rather than throwing.
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

    // ---------- 7. Race ----------

    enterRace() {
        for (const seat of this.seats.values()) {
            seat.hasFinished = false;
            seat.finishTick = null;
            seat.eliminated = false;
            seat.dnf = false;
        }

        this.race = {
            finishObserved: new Map(), // finishedSeatIndex -> Array<{ tick, observerSeatIndex }>
            eliminationObserved: new Map(), // eliminatedSeatIndex -> Array<{ tick, observerSeatIndex, cause }>
            finishConfirmed: new Map(), // seatIndex -> finishTick
            eliminationConfirmed: new Map(), // seatIndex -> cause
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
                // x/y left null: the server doesn't run physics and
                // doesn't know the level's real spawn pixel coords —
                // clients already derive spawn position locally from
                // physics.spawnOBJ()/the level's spawn tile the same
                // way single-player does today.
            }
        });

        clearTimeout(this.timers.race);
        this.timers.race = setTimeout(() => this.expireRace(), RACE_TIME_LIMIT * 1000);

        // Stray leftover from a previous round shouldn't be possible
        // (endRound() clears it before ever flipping the phase away from
        // RACE), but clear it defensively so a fresh race never inherits
        // a pending delayed-end from the round before it.
        clearTimeout(this.timers.roundEndDelay);
        this.timers.roundEndDelay = null;

        // Heartbeat so disconnected/bot seats keep producing idle
        // INPUT_RELAY frames instead of just going silent (§9).
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
        // Cheat flag: seatIndex is bound to the authenticated socket,
        // never taken from the payload.
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

    // Plain relay, same shape as handleInputFrame()/handlePositionSnapshot()
    // above — the sending client already fully resolved the tile write
    // locally (see the client's physics.js's tileUpdates), this just
    // forwards it to every other seat so their map matches exactly. Not
    // folded into this.map (the BUILD-time authoritative map used for
    // reconnect resync) since these are transient RACE-only tile states
    // that get thrown away every round anyway (see game.js's
    // snapshotBuiltMap()/resetRoundState()).
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
        if (others.length === 0) return 0; // solo/dev testing: nothing to corroborate against, so trust the lone client
        return Math.floor(others.length / 2) + 1; // strict majority of the *other* connected clients
    }

    handleFinishObserved(seat, payload) {
        if (this.phase !== PHASE.RACE) return;
        const finishedSeatIndex = payload.finishedSeatIndex | 0;
        if (!this.seats.has(finishedSeatIndex)) return;
        if (this.race.finishConfirmed.has(finishedSeatIndex)) return; // already confirmed

        const tick = payload.tick | 0;
        if (!this.race.finishObserved.has(finishedSeatIndex)) this.race.finishObserved.set(finishedSeatIndex, []);
        const reports = this.race.finishObserved.get(finishedSeatIndex);

        // De-dupe: one report per observer seat, keep latest.
        const existingIdx = reports.findIndex(r => r.observerSeatIndex === seat.seatIndex);
        const report = { tick, observerSeatIndex: seat.seatIndex };
        if (existingIdx !== -1) reports[existingIdx] = report;
        else reports.push(report);

        // Bucket reports by tick within tolerance and look for a bucket
        // (excluding the finishing seat's own report) that reaches quorum.
        const buckets = new Map(); // representative tick -> Set(observerSeatIndex)
        for (const r of reports) {
            let bucketTick = [...buckets.keys()].find(t => Math.abs(t - r.tick) <= FINISH_TICK_TOLERANCE);
            if (bucketTick === undefined) bucketTick = r.tick;
            if (!buckets.has(bucketTick)) buckets.set(bucketTick, new Set());
            buckets.get(bucketTick).add(r.observerSeatIndex);
        }

        const quorumNeeded = this.requiredQuorum(finishedSeatIndex);
        for (const [bucketTick, observers] of buckets.entries()) {
            const independentObservers = [...observers].filter(o => o !== finishedSeatIndex);
            if (independentObservers.length >= quorumNeeded) {
                this.confirmFinish(finishedSeatIndex, bucketTick);
                return;
            }
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
        if (this.race.finishConfirmed.has(eliminatedSeatIndex)) return; // already finished, can't also die

        // Clients each simulate only their own physics now (see
        // network.js's sendPositionSnapshot()/game.js's update()) — a
        // hazard death is something only the player it happened to can
        // actually witness, unlike a finish (which every client can see
        // independently via everyone's synced position). So trust a
        // seat's own report of its own death immediately instead of
        // requiring corroboration nobody else is in a position to give.
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

        // Purely server-clock-driven: no corroboration needed. Anyone
        // not already FINISH_CONFIRMED/ELIMINATION_CONFIRMED becomes DNF.
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

    // Falls back to a majority vote among whatever reports arrived, once
    // every seat has *some* resolution — used as a last resort if a
    // quorum-worthy bucket never quite formed but the race timer forces
    // things anyway (expireRace already resolves any stragglers, so this
    // is mainly here for the case where every seat resolved itself
    // before the timer, letting the round end early).
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

    // Everyone's resolved (finished/eliminated/DNF), but don't cut to
    // ROUND_RESULTS immediately — wait ROUND_END_DELAY_MS so the last
    // finish/death is actually visible and the RACE camera has time to
    // zoom out and show the whole field before the screen changes.
    // Re-entrant-safe (a stray extra call while already pending is a
    // no-op) since finish/elimination confirmations can still trickle in
    // right up to the last one that makes allResolved true.
    scheduleRoundEnd() {
        if (this.timers.roundEndDelay) return;
        this.timers.roundEndDelay = setTimeout(() => {
            this.timers.roundEndDelay = null;
            this.endRound();
        }, ROUND_END_DELAY_MS);
    }

    // ---------- 7.5 / 8. Round end + results ----------

    endRound() {
        clearTimeout(this.timers.race);
        clearTimeout(this.timers.roundEndDelay);
        this.timers.roundEndDelay = null;
        clearInterval(this.timers.raceIdleHeartbeat);

        // Server-side reimplementation of awardRoundPoints(), run only
        // over this.race.finishConfirmed — never a client-supplied score.
        const finishers = [...this.race.finishConfirmed.entries()]
            .map(([seatIndex, finishTick]) => ({ seatIndex, finishTick }))
            .sort((a, b) => a.finishTick - b.finishTick);

        // No points at all unless someone actually died (or DNF'd) this
        // round — if the whole room clears the level clean, nobody gets
        // rewarded for merely finishing (see this.race.eliminationConfirmed,
        // populated by confirmElimination()/expireRace()). This also
        // covers "everyone beats it" automatically: if every seat
        // finished, nobody was eliminated, so anyDied is false.
        const anyDied = this.race.eliminationConfirmed.size > 0;

        const roundPoints = new Map();
        if (anyDied && finishers.length === 1) {
            // Solo clear while at least one other player died: base 3,
            // plus a +2 "no help" bonus once the room is big enough
            // (3+) that finishing alone actually means something.
            const soloBonus = this.seats.size >= 3 ? 2 : 0;
            roundPoints.set(finishers[0].seatIndex, 3 + soloBonus);
        } else if (anyDied && finishers.length >= 2) {
            roundPoints.set(finishers[0].seatIndex, 1);
        }

        const results = [];
        for (const seat of this.seats.values()) {
            const points = roundPoints.get(seat.seatIndex) || 0;
            seat.score += points;
            results.push({
                seatIndex: seat.seatIndex,
                hasFinished: seat.hasFinished,
                dnf: seat.dnf,
                eliminated: seat.eliminated,
                finishTick: seat.finishTick,
                roundPoints: points,
                totalScore: seat.score
            });
        }

        this.phase = PHASE.ROUND_RESULTS;
        this.locks.continueAdvanced = false;
        this.broadcast({ type: 'ROUND_END', phase: PHASE.RACE, payload: { round: this.currentRound, results } });

        // Drives bomb availability in the next party box (see
        // pickPartySlots()): no bomb at all unless someone died this
        // round, guaranteed bomb if everyone died.
        const seatList = [...this.seats.values()];
        this.lastRoundDeaths = {
            anyEliminated: seatList.some(s => s.eliminated),
            allEliminated: seatList.length > 0 && seatList.every(s => s.eliminated)
        };
    }

    handleContinueRequest(seat) {
        if (this.phase !== PHASE.ROUND_RESULTS) return;
        if (this.locks.continueAdvanced) return; // first receive wins
        this.locks.continueAdvanced = true;

        if (this.currentRound >= this.totalRounds) {
            this.phase = PHASE.FINAL_RESULTS;

            // Dense ranking: ties share a rank (e.g. scores [5,5,3] -> ranks [1,1,3]).
            let rank = 0, lastScore = null;
            const finalStandings = [...this.seats.values()]
                .map(s => ({ seatIndex: s.seatIndex, totalScore: s.score }))
                .sort((a, b) => b.totalScore - a.totalScore)
                .map((entry, i) => {
                    if (entry.totalScore !== lastScore) { rank = i + 1; lastScore = entry.totalScore; }
                    return { ...entry, rank };
                });

            this.broadcast({ type: 'MATCH_END', phase: PHASE.FINAL_RESULTS, payload: { finalStandings } });

            // Server-side record of how the match ended: the level code
            // for whatever got built up over the match (same encoding
            // completeBuild() hands back in BUILD_COMPLETE, built from
            // this.map + this.levelMeta), every seat's final score, and
            // who won (supports a tie at the top rank).
            const finalLevelCode = (this.map && this.levelMeta)
                ? encodeLevelCode({
                    map: this.map.MAP,
                    rotations: this.map.MAP_R,
                    size_x: this.map.size_x,
                    ...this.levelMeta
                })
                : null;
            const winners = finalStandings.filter(s => s.rank === 1).map(s => this.seats.get(s.seatIndex)?.name);
            console.log(`[room ${this.roomCode}] MATCH_END levelCode=${finalLevelCode}`);
            console.log(`[room ${this.roomCode}] final standings:`, finalStandings.map(s => `${this.seats.get(s.seatIndex)?.name} (${s.totalScore} pts, rank ${s.rank})`));
            console.log(`[room ${this.roomCode}] winner(s): ${winners.join(', ')}`);
        } else {
            this.currentRound += 1;
            this.broadcast({ type: 'NEXT_ROUND_START', phase: PHASE.ROUND_RESULTS, payload: { round: this.currentRound } });
            this.enterPartyBox(); // same accumulated map — see enterPartyBox()/this.map
        }
    }

    handlePlayAgainRequest(seat) {
        if (this.phase !== PHASE.FINAL_RESULTS) return;
        if (this.locks.playAgainAdvanced) return;
        this.locks.playAgainAdvanced = true;

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
        this.locks.stagePicked = false;
        this.locks.continueAdvanced = false;
        this.locks.playAgainAdvanced = false;

        this.broadcast({ type: 'REMATCH_STARTING', phase: PHASE.FINAL_RESULTS, payload: {} });
        this.enterStageSelect();
    }

    // ---------- 9. Disconnects ----------

    handleDisconnect(seat) {
        seat.connected = false;
        seat.isBot = true;
        this.updateEmptiedAt();

        this.broadcast({ type: 'PLAYER_LEFT', phase: this.phase, payload: { seatIndex: seat.seatIndex, reason: 'disconnected' } });
        this.broadcast({ type: 'PLAYER_DISCONNECTED', phase: this.phase, payload: { seatIndex: seat.seatIndex } });

        if (this.phase === PHASE.RACE && this.race) {
            if (!this.race.finishConfirmed.has(seat.seatIndex) && !this.race.eliminationConfirmed.has(seat.seatIndex)) {
                this.confirmElimination(seat.seatIndex, 'dnf');
            }
        } else if (this.phase === PHASE.LOBBY) {
            this.broadcastRoomState();
        }

        // A departed host doesn't auto-transfer here — per spec, the
        // room stays alive as long as at least one player remains, and
        // it's on the host to explicitly close it (see README/CLOSE_ROOM).
    }

    handleReconnect(seat, ws) {
        seat.ws = ws;
        seat.connected = true;
        seat.isBot = false;
        ws.seatIndex = seat.seatIndex;
        ws.roomCode = this.roomCode;
        this.updateEmptiedAt();

        this.broadcast({ type: 'PLAYER_RECONNECTED', phase: this.phase, payload: { seatIndex: seat.seatIndex } });

        // Full resync so the rejoining client can rebuild state instead
        // of replaying match history: every seat's last-known finish
        // status doubles as a lightweight position/state summary here
        // since the server doesn't hold live physics positions itself;
        // the map patch is the authoritative piece placements so far.
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
        clearTimeout(this.timers.stageSelect);
        clearTimeout(this.timers.partyBox);
        clearTimeout(this.timers.build);
        clearTimeout(this.timers.race);
        clearTimeout(this.timers.roundEndDelay);
        clearInterval(this.timers.raceIdleHeartbeat);
    }
}

module.exports = { Room };