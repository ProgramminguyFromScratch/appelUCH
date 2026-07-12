const readline = require('readline');
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
    SET_COLOR_REQUEST: (room, seat, payload) => room.handleSetColorRequest(seat, payload),
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
    CONTINUE_REQUEST: (room, seat) => room.handleContinueRequest(seat)
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

    if (type === 'PING') {
        send(ws, { type: 'PONG', payload: { t: payload && payload.t, serverTime: Date.now() } });
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

// --- Console admin commands ---------------------------------------------
// Type "help" in the server console for a list of commands.

function printPlayerList() {
    const players = roomManager.listPlayers();
    if (players.length === 0) {
        console.log('No players connected.');
        return;
    }
    console.log('Players:');
    for (const p of players) {
        const status = p.connected ? '' : ' (disconnected)';
        console.log(`  [${p.roomCode}#${p.seatIndex}] ${p.name}${status}`);
    }
}

function kickByQuery(query) {
    if (!query) {
        console.log('Usage: kick <name or ROOMCODE#seatIndex>');
        return;
    }
    const result = roomManager.findSeat(query);
    if (!result) {
        console.log(`No player found matching "${query}".`);
        return;
    }
    if (result.matches) {
        console.log(`Multiple players match "${query}":`);
        for (const m of result.matches) {
            console.log(`  [${m.room.roomCode}#${m.seat.seatIndex}] ${m.seat.name}`);
        }
        console.log('Be more specific, or use ROOMCODE#seatIndex.');
        return;
    }
    const { room, seat } = result;
    const name = seat.name;
    const roomCode = room.roomCode;
    const seatIndex = seat.seatIndex;
    room.kickSeat(seat, 'kicked_by_admin');
    console.log(`Kicked "${name}" from room ${roomCode} (seat ${seatIndex}).`);
}

function pointsByQuery(query) {
    if (!query) {
        console.log('Usage: points <name or ROOMCODE#seatIndex> <delta>');
        return;
    }
    const lastSpace = query.lastIndexOf(' ');
    if (lastSpace === -1) {
        console.log('Usage: points <name or ROOMCODE#seatIndex> <delta>');
        return;
    }
    const target = query.slice(0, lastSpace).trim();
    const deltaStr = query.slice(lastSpace + 1).trim();
    const delta = parseInt(deltaStr, 10);
    if (!Number.isFinite(delta)) {
        console.log(`"${deltaStr}" is not a valid number. Usage: points <name or ROOMCODE#seatIndex> <delta>`);
        return;
    }

    const result = roomManager.findSeat(target);
    if (!result) {
        console.log(`No player found matching "${target}".`);
        return;
    }
    if (result.matches) {
        console.log(`Multiple players match "${target}":`);
        for (const m of result.matches) {
            console.log(`  [${m.room.roomCode}#${m.seat.seatIndex}] ${m.seat.name}`);
        }
        console.log('Be more specific, or use ROOMCODE#seatIndex.');
        return;
    }
    const { room, seat } = result;
    room.adjustScore(seat, delta);
    console.log(`${delta >= 0 ? 'Gave' : 'Removed'} ${Math.abs(delta)} point(s) ${delta >= 0 ? 'to' : 'from'} "${seat.name}" [${room.roomCode}#${seat.seatIndex}]. New score: ${seat.score}`);
}

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
rl.on('line', line => {
    const trimmed = line.trim();
    if (!trimmed) return;

    const spaceIdx = trimmed.indexOf(' ');
    const cmd = (spaceIdx === -1 ? trimmed : trimmed.slice(0, spaceIdx)).toLowerCase();
    const arg = spaceIdx === -1 ? '' : trimmed.slice(spaceIdx + 1).trim();

    switch (cmd) {
        case 'kick':
            kickByQuery(arg);
            break;
        case 'points':
            pointsByQuery(arg);
            break;
        case 'players':
        case 'list':
            printPlayerList();
            break;
        case 'rooms':
            if (roomManager.rooms.size === 0) {
                console.log('No active rooms.');
            } else {
                for (const room of roomManager.rooms.values()) {
                    console.log(`  ${room.roomCode}  phase=${room.phase}  players=${room.seats.size}`);
                }
            }
            break;
        case 'help':
            console.log([
                'Commands:',
                '  players | list          - list all connected/known players',
                '  rooms                   - list active rooms and their phase',
                '  kick <name>             - kick a player by name (or partial name match)',
                '  kick <ROOMCODE#seat>    - kick a player by exact room code + seat index',
                '  points <name> <delta>   - add/remove points for a player, e.g. "points Alice -3"',
                '  points <ROOMCODE#seat> <delta> - same, targeting an exact seat',
                '  help                    - show this message'
            ].join('\n'));
            break;
        default:
            console.log(`Unknown command "${cmd}". Type "help" for a list of commands.`);
    }
});