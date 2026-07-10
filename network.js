// NetworkClient — thin transport + protocol layer for the browser client.
//
// This file knows nothing about canvas, rendering, or GameState. It only:
//   1. Owns the WebSocket connection to the Phase 3 server.
//   2. Sends the C->S messages defined in protocol.js as plain method calls.
//   3. Turns every S->C message the server sends into a callback invocation
//      on `this` (onRoomState, onStageState, onPartyState, onBuildState,
//      onInputFrame, onRoundResult, ...), so game.js can just assign
//      functions to those properties and never touch a raw WS message.
//
// Consumers (game.js / game.html) are expected to do:
//   const net = new NetworkClient('ws://localhost:8080');
//   net.onRoomState = (payload) => { ... };
//   net.onBuildState = (payload, type) => { ... };
//   net.connect();
//   ...
//   net.joinRoom('ABCDE', 'Alice');
//
// Every `onXxx` callback is called as `callback(payload, type)` — `type`
// is the raw message type string (e.g. 'BUILD_START', 'FORCE_PLACE') for
// the handful of grouped callbacks (onStageState/onPartyState/onBuildState/
// onRaceState) that fan in several related server messages, so the
// consumer can still branch on the exact event if it cares.
class NetworkClient {
    constructor(url) {
        this.url = url;
        this.ws = null;

        // Filled in once the server responds to JOIN_ROOM.
        this.seatIndex = null;
        this.playerId = null;
        this.roomCode = null;

        // ---- connection lifecycle callbacks ----
        this.onOpen = null;
        this.onClose = null;
        this.onError = null;

        // ---- lobby ----
        this.onSeatAssigned = null;      // (payload: {seatIndex, playerId})
        this.onJoinRejected = null;      // (payload: {reason})
        this.onRoomState = null;         // (payload: {roomCode, hostSeatIndex, seats[]})
        this.onMatchStarting = null;     // (payload: {playerCount, totalRounds})

        // ---- loading ----
        this.onAllClientsReady = null;   // (payload: {})

        // ---- stage select / party box / build (grouped) ----
        // Called for every STAGE_SELECT_START / STAGE_CURSOR_MOVE /
        // STAGE_VOTE_CAST / STAGE_LOCKED. Stage selection is a vote: every
        // connected seat's STAGE_PICK_REQUEST casts (or changes) a vote via
        // STAGE_VOTE_CAST, and STAGE_LOCKED only arrives once all seats have
        // voted (or the vote timer expires) and the winning candidate
        // (ties broken randomly) has been tallied server-side.
        this.onStageState = null;        // (payload, type)
        // Called for every PARTY_BOX_START / PARTY_CURSOR_MOVE / PARTY_PICK_RESULT /
        // PARTY_AUTO_ASSIGN / PARTY_BOX_TIMER_EXPIRED / PARTY_BOX_COMPLETE
        this.onPartyState = null;        // (payload, type)
        // Called for every BUILD_START / BUILD_CURSOR_MOVE / PLACE_PIECE_RESULT /
        // FORCE_PLACE / BUILD_TIMER_EXPIRED / BUILD_COMPLETE
        this.onBuildState = null;        // (payload, type)

        // ---- race ----
        // Called for RACE_START / RACE_TIMER_EXPIRED
        this.onRaceState = null;         // (payload, type)
        this.onInputFrame = null;        // (payload: {seatIndex, tick, keys})  <- INPUT_RELAY
        this.onPositionSync = null;      // (payload: {seatIndex, tick, x, y, sx, sy})
        this.onFinishConfirmed = null;   // (payload: {seatIndex, finishTick})
        this.onEliminationConfirmed = null; // (payload: {seatIndex, cause})

        // ---- results ----
        this.onRoundResult = null;       // (payload: {round, results[]})  <- ROUND_END
        this.onNextRoundStart = null;    // (payload: {round})
        this.onMatchEnd = null;          // (payload: {finalStandings[]})
        this.onRematchStarting = null;   // (payload: {})

        // ---- presence ----
        this.onPlayerLeft = null;        // (payload: {seatIndex, reason})
        this.onPlayerDisconnected = null;// (payload: {seatIndex})
        this.onPlayerReconnected = null; // (payload: {seatIndex, mapPatch?})

        // type -> which grouped callback fires (for the fan-in events above).
        // Anything not listed here maps 1:1 to an onXxx of the same shape
        // via _DIRECT_MAP below.
        this._GROUPED_MAP = {
            STAGE_SELECT_START: 'onStageState',
            STAGE_CURSOR_MOVE: 'onStageState',
            STAGE_VOTE_CAST: 'onStageState',
            STAGE_LOCKED: 'onStageState',

            PARTY_BOX_START: 'onPartyState',
            PARTY_CURSOR_MOVE: 'onPartyState',
            PARTY_PICK_RESULT: 'onPartyState',
            PARTY_AUTO_ASSIGN: 'onPartyState',
            PARTY_BOX_TIMER_EXPIRED: 'onPartyState',
            PARTY_BOX_COMPLETE: 'onPartyState',

            BUILD_START: 'onBuildState',
            BUILD_CURSOR_MOVE: 'onBuildState',
            PLACE_PIECE_RESULT: 'onBuildState',
            FORCE_PLACE: 'onBuildState',
            BUILD_TIMER_EXPIRED: 'onBuildState',
            BUILD_COMPLETE: 'onBuildState',

            RACE_START: 'onRaceState',
            RACE_TIMER_EXPIRED: 'onRaceState'
        };

        this._DIRECT_MAP = {
            SEAT_ASSIGNED: 'onSeatAssigned',
            JOIN_REJECTED: 'onJoinRejected',
            ROOM_STATE: 'onRoomState',
            MATCH_STARTING: 'onMatchStarting',
            ALL_CLIENTS_READY: 'onAllClientsReady',
            INPUT_RELAY: 'onInputFrame',
            POSITION_SYNC: 'onPositionSync',
            FINISH_CONFIRMED: 'onFinishConfirmed',
            ELIMINATION_CONFIRMED: 'onEliminationConfirmed',
            ROUND_END: 'onRoundResult',
            NEXT_ROUND_START: 'onNextRoundStart',
            MATCH_END: 'onMatchEnd',
            REMATCH_STARTING: 'onRematchStarting',
            PLAYER_LEFT: 'onPlayerLeft',
            PLAYER_DISCONNECTED: 'onPlayerDisconnected',
            PLAYER_RECONNECTED: 'onPlayerReconnected'
        };
    }

    // ---------------- connection ----------------

    connect() {
        this.ws = new WebSocket(this.url);

        this.ws.addEventListener('open', () => {
            if (this.onOpen) this.onOpen();
        });

        this.ws.addEventListener('close', () => {
            if (this.onClose) this.onClose();
        });

        this.ws.addEventListener('error', (err) => {
            if (this.onError) this.onError(err);
        });

        this.ws.addEventListener('message', (event) => {
            this._handleMessage(event.data);
        });
    }

    disconnect() {
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
    }

    get isConnected() {
        return !!this.ws && this.ws.readyState === WebSocket.OPEN;
    }

    _handleMessage(raw) {
        let msg;
        try {
            msg = JSON.parse(raw);
        } catch (err) {
            console.error('[NetworkClient] malformed message from server:', err);
            return;
        }

        const { type, payload } = msg || {};
        if (!type) return;

        // SEAT_ASSIGNED is the one message we peek at ourselves before
        // handing it off, so every later send() call already knows who
        // we are without the consumer having to wire that up itself.
        if (type === 'SEAT_ASSIGNED') {
            this.seatIndex = payload.seatIndex;
            this.playerId = payload.playerId;
        }
        if (type === 'ROOM_STATE' && payload && payload.roomCode) {
            this.roomCode = payload.roomCode;
        }

        const directCb = this._DIRECT_MAP[type];
        if (directCb && this[directCb]) {
            this[directCb](payload || {}, type);
            return;
        }

        const groupedCb = this._GROUPED_MAP[type];
        if (groupedCb && this[groupedCb]) {
            this[groupedCb](payload || {}, type);
            return;
        }

        // Unrecognized type — nothing to dispatch to. Not necessarily an
        // error (server may be a newer protocol version), so just log.
        console.log('[NetworkClient] unhandled message type:', type);
    }

    _send(type, payload = {}) {
        if (!this.isConnected) {
            console.warn(`[NetworkClient] dropped ${type} — not connected`);
            return;
        }
        try {
            this.ws.send(JSON.stringify({ type, payload }));
        } catch (err) {
            console.error(`[NetworkClient] send failed for ${type}:`, err.message);
        }
    }

    // ---------------- outgoing (C->S) ----------------

    joinRoom(roomCode, displayName, playerId = null) {
        this._send('JOIN_ROOM', { roomCode: roomCode || '', displayName, playerId });
    }

    requestStartMatch() {
        this._send('START_MATCH_REQUEST', {});
    }

    sendClientReady() {
        this._send('CLIENT_READY', {});
    }

    sendStageCursorMove(cursorIndex) {
        this._send('STAGE_CURSOR_MOVE', { cursorIndex });
    }

    sendStagePickRequest(candidateIndex) {
        this._send('STAGE_PICK_REQUEST', { candidateIndex });
    }

    sendPartyCursorMove(cursorIndex) {
        this._send('PARTY_CURSOR_MOVE', { cursorIndex });
    }

    sendPartyPickRequest(slotIndex) {
        this._send('PARTY_PICK_REQUEST', { slotIndex });
    }

    sendBuildCursorMove(col, row, rotation) {
        this._send('BUILD_CURSOR_MOVE', { col, row, rotation });
    }

    sendPlacePieceRequest(pieceId, col, row, rotation) {
        this._send('PLACE_PIECE_REQUEST', { pieceId, col, row, rotation });
    }

    sendInputFrame(tick, keys) {
        this._send('INPUT_FRAME', { tick, keys });
    }

    sendPositionSnapshot(tick, x, y, sx, sy, direction, dir, crouched, onWall) {
        this._send('POSITION_SNAPSHOT', { tick, x, y, sx, sy, direction, dir, crouched, onWall });
    }

    sendFinishObserved(finishedSeatIndex, tick) {
        this._send('FINISH_OBSERVED', { finishedSeatIndex, tick });
    }

    sendEliminationObserved(eliminatedSeatIndex, tick, cause = 'death') {
        this._send('ELIMINATION_OBSERVED', { eliminatedSeatIndex, tick, cause });
    }

    sendContinueRequest() {
        this._send('CONTINUE_REQUEST', {});
    }

    sendPlayAgainRequest() {
        this._send('PLAY_AGAIN_REQUEST', {});
    }
}

// Node/server export guarded exactly like pieces.js, so this same file
// can be unit-tested under Node without breaking the <script> include in
// game.html (where `module` doesn't exist).
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { NetworkClient };
}