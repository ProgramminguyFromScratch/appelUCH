// Not a formal test suite — just a scripted client that plays a full
// solo (1-player) match against a live server instance to sanity-check
// the phase machine end-to-end. Run with the server already listening
// (see README).
const WebSocket = require('ws');
const { getPieceFootprintCells } = require('../src/pieces');

const PORT = process.env.PORT || 8080;
const ws = new WebSocket(`ws://localhost:${PORT}`);

let seatIndex = null;
let piece = null;
let stageCandidates = [];
let round = 0;

function send(type, payload = {}) {
    ws.send(JSON.stringify({ type, phase: 'n/a', payload }));
}

ws.on('open', () => {
    console.log('connected, joining room...');
    send('JOIN_ROOM', { roomCode: 'SMOKE1', displayName: 'Solo' });
});

ws.on('message', raw => {
    const msg = JSON.parse(raw);
    console.log('<-', msg.type, JSON.stringify(msg.payload).slice(0, 200));

    switch (msg.type) {
        case 'SEAT_ASSIGNED':
            seatIndex = msg.payload.seatIndex;
            send('START_MATCH_REQUEST');
            break;
        case 'MATCH_STARTING':
            send('CLIENT_READY', { seatIndex });
            break;
        case 'STAGE_SELECT_START':
            stageCandidates = msg.payload.candidates;
            send('STAGE_PICK_REQUEST', { seatIndex, candidateIndex: 0 });
            break;
        case 'PARTY_BOX_START': {
            const slotIndex = msg.payload.slots.findIndex(s => s !== null);
            send('PARTY_PICK_REQUEST', { seatIndex, slotIndex });
            break;
        }
        case 'PARTY_PICK_RESULT':
            if (msg.payload.seatIndex === seatIndex) piece = msg.payload.pieceId;
            break;
        case 'BUILD_START': {
            const start = msg.payload.startCells.find(c => c.seatIndex === seatIndex);
            // shift the placement further away each round so it never
            // collides with a tile a previous round already placed
            send('PLACE_PIECE_REQUEST', {
                seatIndex,
                pieceId: piece,
                col: start.col + 2 + round * 4,
                row: start.row,
                rotation: 0
            });
            break;
        }
        case 'PLACE_PIECE_RESULT':
            console.log('   accepted:', msg.payload.accepted, 'mapPatch len:', msg.payload.mapPatch.length);
            break;
        case 'RACE_START':
            round += 1;
            // fabricate a finish: send FINISH_OBSERVED about our own seat
            // (quorum-of-1 case since we're solo — matches §7.4's callout
            // that 2-player/solo degenerates to trusting the one client).
            send('FINISH_OBSERVED', { observerSeatIndex: seatIndex, finishedSeatIndex: seatIndex, tick: 42 });
            break;
        case 'FINISH_CONFIRMED':
            console.log(`   round ${round} finish confirmed at tick`, msg.payload.finishTick);
            break;
        case 'ROUND_END':
            send('CONTINUE_REQUEST', { seatIndex });
            break;
        case 'MATCH_END':
            console.log('MATCH COMPLETE:', msg.payload.finalStandings);
            ws.close();
            process.exit(0);
            break;
        case 'JOIN_REJECTED':
            console.error('join rejected:', msg.payload);
            process.exit(1);
            break;
    }
});

ws.on('error', err => {
    console.error('ws error:', err.message);
    process.exit(1);
});

setTimeout(() => {
    console.error('TIMEOUT: smoke test did not complete in time');
    process.exit(1);
}, 20000);
