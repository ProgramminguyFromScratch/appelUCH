class NetworkClient {
    constructor(url) {
        this.url = url;
        this.ws = null;
        this.seatIndex = null;
        this.playerId = null;
        this.roomCode = null;
        this.onOpen = null;
        this.onClose = null;
        this.onError = null;
        this.onSeatAssigned = null;      
        this.onJoinRejected = null;      
        this.onRoomState = null;         
        this.onMatchStarting = null;     
        this.onAllClientsReady = null;   
        this.onStageState = null;        
        this.onPartyState = null;        
        this.onBuildState = null;        
        this.onRaceState = null;         
        this.onInputFrame = null;        
        this.onPositionSync = null;      
        this.onTileUpdate = null;        
        this.onFinishConfirmed = null;   
        this.onEliminationConfirmed = null; 
        this.onRespawnSync = null;       
        this.onRoundResult = null;       
        this.onNextRoundStart = null;    
        this.onMatchEnd = null;          
        this.onRematchStarting = null;   
        this.onContinueProgress = null;  
        this.onPlayerLeft = null;        
        this.onPlayerDisconnected = null;
        this.onPlayerReconnected = null; 
        this.onTimeSync = null;          
        this.onKicked = null;            
        this.onPong = null;              
        this.onScoreAdjusted = null;     
        this.onChatMessage = null;       
        this.onSettingsUpdated = null;   
        this.onColorUpdated = null;      
        this.onLoginResult = null;       
        this.onLivesAdjusted = null;     
        this.onKickRejected = null;      
        this.onHostUpdated = null;      
        this.onLobbyList = null;          
        this._GROUPED_MAP = {
            STAGE_SELECT_START: 'onStageState',
            STAGE_CURSOR_MOVE: 'onStageState',
            STAGE_VOTE_CAST: 'onStageState',
            STAGE_LOCKED: 'onStageState',
            STAGE_COUNTDOWN_START: 'onStageState',
            STAGE_COUNTDOWN_CANCEL: 'onStageState',

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
            TILE_UPDATE: 'onTileUpdate',
            FINISH_CONFIRMED: 'onFinishConfirmed',
            ELIMINATION_CONFIRMED: 'onEliminationConfirmed',
            RESPAWN_SYNC: 'onRespawnSync',
            ROUND_END: 'onRoundResult',
            NEXT_ROUND_START: 'onNextRoundStart',
            MATCH_END: 'onMatchEnd',
            REMATCH_STARTING: 'onRematchStarting',
            CONTINUE_PROGRESS: 'onContinueProgress',
            PLAYER_LEFT: 'onPlayerLeft',
            PLAYER_DISCONNECTED: 'onPlayerDisconnected',
            PLAYER_RECONNECTED: 'onPlayerReconnected'
        };
        this._DIRECT_MAP.TIME_SYNC = 'onTimeSync';
        this._DIRECT_MAP.KICKED = 'onKicked';
        this._DIRECT_MAP.PONG = 'onPong';
        this._DIRECT_MAP.SCORE_ADJUSTED = 'onScoreAdjusted';
        this._DIRECT_MAP.CHAT_BROADCAST = 'onChatMessage';
        this._DIRECT_MAP.SETTINGS_UPDATED = 'onSettingsUpdated';
        this._DIRECT_MAP.COLOR_UPDATED = 'onColorUpdated';
        this._DIRECT_MAP.LOGIN_RESULT = 'onLoginResult';
        this._DIRECT_MAP.LIVES_ADJUSTED = 'onLivesAdjusted';
        this._DIRECT_MAP.KICK_REJECTED = 'onKickRejected';
        this._DIRECT_MAP.HOST_UPDATED = 'onHostUpdated';
        this._DIRECT_MAP.LOBBY_LIST = 'onLobbyList';
    }

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

        const { type, payload, phase } = msg || {};
        if (!type) return;
        if (type === 'SEAT_ASSIGNED') {
            this.seatIndex = payload.seatIndex;
            this.playerId = payload.playerId;
        }
        if (type === 'ROOM_STATE' && payload && payload.roomCode) {
            this.roomCode = payload.roomCode;
        }

        const directCb = this._DIRECT_MAP[type];
        if (directCb && this[directCb]) {
            this[directCb](payload || {}, type, phase);
            return;
        }

        const groupedCb = this._GROUPED_MAP[type];
        if (groupedCb && this[groupedCb]) {
            this[groupedCb](payload || {}, type, phase);
            return;
        }
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

    joinRoom(roomCode, displayName, playerId = null, openLobby = true) {
        this._send('JOIN_ROOM', { roomCode: roomCode || '', displayName, playerId, openLobby: !!openLobby });
    }

    requestLobbyList() {
        this._send('LIST_LOBBIES_REQUEST', {});
    }

    sendSetColorRequest(hue) {
        this._send('SET_COLOR_REQUEST', { hue });
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

    sendPositionSnapshot(tick, x, y, sx, sy, direction, dir, crouched, onWall) {
        // Compact wire format: no key names, every field rounded to an integer.
        // x/y -> whole pixels. sx/sy -> tenths (velocity needs a bit more than
        // whole-number precision or movement gets jittery). direction -> a
        // radian angle, kept to 2 decimal places (hundredths).
        // crouched/onWall are packed into a single flags bitmask.
        const flags = (crouched ? 1 : 0) | (onWall ? 2 : 0);
        this._send('POSITION_SNAPSHOT', [
            tick,
            Math.round(x),
            Math.round(y),
            Math.round(sx * 10),
            Math.round(sy * 10),
            Math.round(direction * 100),
            dir,
            flags
        ]);
    }

    sendTileUpdate(idx, tile, rot) {
        this._send('TILE_UPDATE', { idx, tile, rot });
    }

    sendFinishObserved(finishedSeatIndex, tick, postmortem = false) {
        this._send('FINISH_OBSERVED', { finishedSeatIndex, tick, postmortem: !!postmortem });
    }

    sendEliminationObserved(eliminatedSeatIndex, tick, cause = 'death') {
        this._send('ELIMINATION_OBSERVED', { eliminatedSeatIndex, tick, cause });
    }

    sendRespawnObserved(tick) {
        this._send('RESPAWN_OBSERVED', { tick });
    }

    sendContinueRequest() {
        this._send('CONTINUE_REQUEST', {});
    }

    sendChatMessage(text) {
        this._send('CHAT_MESSAGE', { text });
    }

    sendUpdateSettingsRequest(settings) {
        this._send('UPDATE_SETTINGS_REQUEST', settings || {});
    }

    sendKickRequest(name) {
        this._send('KICK_REQUEST', { name });
    }

    sendForceStageRequest(levelCode) {
        this._send('FORCE_STAGE_REQUEST', { levelCode });
    }

    sendLoginRequest(password) {
        this._send('LOGIN_REQUEST', { password });
    }

    sendGiveRequest(kind, amount, targetName) {
        this._send('GIVE_REQUEST', { kind, amount, targetName });
    }

    sendSetRequest(kind, amount, targetName) {
        this._send('SET_REQUEST', { kind, amount, targetName });
    }

    sendHostRequest(name = '') {
        this._send('HOST_REQUEST', { name });
    }

    sendKillRequest(name) {
        this._send('KILL_REQUEST', { name });
    }

    sendNextRequest() {
        this._send('NEXT_REQUEST', {});
    }

    sendPing() {
        this._send('PING', { t: performance.now() });
    }
}
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { NetworkClient };
}