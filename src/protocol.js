// Mirrors appel-multiplayer-protocol.md. Kept as plain string constants
// (not an enum library) so message JSON on the wire is just the string,
// same as the doc's examples.

const PHASE = {
    LOBBY: 'LOBBY', // pre-MENU: JOIN_ROOM / ROOM_STATE / START_MATCH_REQUEST
    LOADING: 'LOADING',
    STAGE_SELECT: 'STAGE_SELECT',
    PARTY_BOX: 'PARTY_BOX',
    BUILD: 'BUILD',
    RACE: 'RACE',
    ROUND_RESULTS: 'ROUND_RESULTS',
    FINAL_RESULTS: 'FINAL_RESULTS'
};

// type -> the phase(s) the server accepts that C->S message in. A message
// whose `type` isn't in this table, or whose declared `phase` field
// doesn't match one of these, is dropped (see §1: "server drops/ignores
// messages sent in the wrong phase").
const CLIENT_MESSAGE_PHASES = {
    JOIN_ROOM: [PHASE.LOBBY],
    START_MATCH_REQUEST: [PHASE.LOBBY],
    CLIENT_READY: [PHASE.LOADING],
    STAGE_CURSOR_MOVE: [PHASE.STAGE_SELECT],
    STAGE_PICK_REQUEST: [PHASE.STAGE_SELECT],
    PARTY_CURSOR_MOVE: [PHASE.PARTY_BOX],
    PARTY_PICK_REQUEST: [PHASE.PARTY_BOX],
    BUILD_CURSOR_MOVE: [PHASE.BUILD],
    PLACE_PIECE_REQUEST: [PHASE.BUILD],
    INPUT_FRAME: [PHASE.RACE],
    POSITION_SNAPSHOT: [PHASE.RACE],
    FINISH_OBSERVED: [PHASE.RACE],
    ELIMINATION_OBSERVED: [PHASE.RACE],
    CONTINUE_REQUEST: [PHASE.ROUND_RESULTS],
    PLAY_AGAIN_REQUEST: [PHASE.FINAL_RESULTS]
};

const TOTAL_ROUNDS = 11;
const PARTY_BOX_SLOT_COUNT = 8;
const PARTY_TIME_LIMIT = 12;
const BUILD_TIME_LIMIT = 20;
const RACE_TIME_LIMIT = 60;
const MIN_PLAYERS_TO_START = 1;
const MAX_PLAYERS = 6;

// Finish/elimination corroboration tuning (see protocol §7.4 / §11 —
// flagged there as needing real-network tuning; these are reasonable
// starting defaults).
const FINISH_TICK_TOLERANCE = 2;
const LOADING_BARRIER_TIMEOUT_MS = 15000;

module.exports = {
    PHASE,
    CLIENT_MESSAGE_PHASES,
    TOTAL_ROUNDS,
    PARTY_BOX_SLOT_COUNT,
    PARTY_TIME_LIMIT,
    BUILD_TIME_LIMIT,
    RACE_TIME_LIMIT,
    MIN_PLAYERS_TO_START,
    MAX_PLAYERS,
    FINISH_TICK_TOLERANCE,
    LOADING_BARRIER_TIMEOUT_MS
};
