const { WebSocketServer } = require('ws');
const { RoomManager } = require('./src/RoomManager');
const { PHASE, CLIENT_MESSAGE_PHASES } = require('./src/protocol');

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 8080;

const roomManager = new RoomManager();
const wss = new WebSocketServer({ port: PORT });

function send(ws, message) {
    if (ws.readyState !== 1) return;
    try {
        ws.send(JSON.stringify(message));
    } catch (err) {
        console.error('[ws] send failed:', err.message);
    }
}

function handleJoinRoom(ws, payload = {}) {
    const room = roomManager.getOrCreateRoom(payload.roomCode);

    if (payload.playerId) {
        const existing = [...room.seats.values()].find(s => s.playerId === payload.playerId && !s.connected);
        if (existing) {
            room.handleReconnect(existing, ws);
            send(ws, { type: 'SEAT_ASSIGNED', phase: PHASE.LOBBY, payload: { seatIndex: existing.seatIndex, playerId: existing.playerId } });
            return;
        }
    }

    if (room.phase !== PHASE.LOBBY) {
        send(ws, { type: 'JOIN_REJECTED', phase: PHASE.LOBBY, payload: { reason: 'match_in_progress' } });
        return;
    }

    if (room.isNameTaken(payload.displayName)) {
        send(ws, { type: 'JOIN_REJECTED', phase: PHASE.LOBBY, payload: { reason: 'name_taken' } });
        return;
    }

    const seat = room.addSeat(ws, payload.displayName);
    if (!seat) {
        send(ws, { type: 'JOIN_REJECTED', phase: PHASE.LOBBY, payload: { reason: 'room_full' } });
        return;
    }

    send(ws, { type: 'SEAT_ASSIGNED', phase: PHASE.LOBBY, payload: { seatIndex: seat.seatIndex, playerId: seat.playerId } });
    room.broadcastRoomState();
    console.log(`[room ${room.roomCode}] seat ${seat.seatIndex} joined as "${seat.name}"`);
}

const HANDLERS = {
    START_MATCH_REQUEST: (room, seat) => room.handleStartMatchRequest(seat),
    CLIENT_READY: (room, seat) => room.handleClientReady(seat),
    STAGE_CURSOR_MOVE: (room, seat, payload) => room.handleStageCursorMove(seat, payload),
    STAGE_PICK_REQUEST: (room, seat, payload) => room.handleStagePickRequest(seat, payload),
    PARTY_CURSOR_MOVE: (room, seat, payload) => room.handlePartyCursorMove(seat, payload),
    PARTY_PICK_REQUEST: (room, seat, payload) => room.handlePartyPickRequest(seat, payload),
    BUILD_CURSOR_MOVE: (room, seat, payload) => room.handleBuildCursorMove(seat, payload),
    PLACE_PIECE_REQUEST: (room, seat, payload) => room.handlePlacePieceRequest(seat, payload),
    INPUT_FRAME: (room, seat, payload) => room.handleInputFrame(seat, payload),
    POSITION_SNAPSHOT: (room, seat, payload) => room.handlePositionSnapshot(seat, payload),
    TILE_UPDATE: (room, seat, payload) => room.handleTileUpdate(seat, payload),
    FINISH_OBSERVED: (room, seat, payload) => room.handleFinishObserved(seat, payload),
    ELIMINATION_OBSERVED: (room, seat, payload) => room.handleEliminationObserved(seat, payload),
    CONTINUE_REQUEST: (room, seat) => room.handleContinueRequest(seat),
    PLAY_AGAIN_REQUEST: (room, seat) => room.handlePlayAgainRequest(seat)
};

function handleMessage(ws, raw) {
    let msg;
    try {
        msg = JSON.parse(raw);
    } catch (err) {
        return;
    }

    const { type, payload } = msg || {};
    if (!type) return;

    if (type === 'JOIN_ROOM') {
        handleJoinRoom(ws, payload);
        return;
    }

    const room = ws.roomCode ? roomManager.getRoom(ws.roomCode) : null;
    if (!room) return;
    const seat = room.seatFor(ws);
    if (!seat) return;

    const allowedPhases = CLIENT_MESSAGE_PHASES[type];
    const handler = HANDLERS[type];
    if (!allowedPhases || !handler) return;
    if (!allowedPhases.includes(room.phase)) return;

    handler(room, seat, payload || {});
}

wss.on('connection', ws => {
    ws.on('message', raw => handleMessage(ws, raw));

    ws.on('close', () => {
        if (!ws.roomCode) return;
        const room = roomManager.getRoom(ws.roomCode);
        if (!room) return;
        const seat = room.seatFor(ws);
        if (!seat) return;
        room.handleDisconnect(seat);
        console.log(`[room ${room.roomCode}] seat ${seat.seatIndex} disconnected`);
    });

    ws.on('error', err => {
        console.error('[ws] socket error:', err.message);
    });
});

console.log(`Appel multiplayer server listening on ws://localhost:${PORT}`);