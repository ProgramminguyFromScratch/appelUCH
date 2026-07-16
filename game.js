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
        solo: '#ff8c42',
        postmortem: '#808080'
    },
    pointLabels: {
        goal: 'Goal',
        firstPlace: 'First Place',
        comeback: 'Comeback',
        solo: 'Solo Finish',
        postmortem: 'Postmortem'
    }
};
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
const STAGE_VOTE_ARENA_LEVEL_CODE = "1236887196Z86Z2Z2Z1Z86Z4Z10Z2Z86Z2Z10Z2Z68Z1Z86Z1Z10Z2Z68Z1Z10Z5Z2Z1Z10Z2Z86Z1Z10Z3Z20Z1Z18Z1Z17Z1Z79Z51Z2Z112Z10Z1Z86Z1Z10Z1Z1Z3Z13Z1Z10Z3Z2Z1Z10Z1Z2Z1Z86Z1Z2Z1Z86Z1Z2Z1Z10Z1Z86Z1Z10Z1Z86Z1Z2Z1Z68Z1Z86Z1Z10Z1Z2Z1Z68Z1Z20Z3Z18Z1Z17Z1Z79Z52Z2Z112Z10Z1Z68Z1Z5Z1Z1Z4Z4Z1Z68Z1Z10Z2Z86Z1Z10Z1Z20Z1Z86Z1Z20Z1Z10Z1Z86Z1Z2Z1Z86Z1Z68Z1Z10Z1Z86Z1Z10Z1Z20Z3Z18Z3Z17Z1Z79Z53Z2Z112Z4Z1Z1Z11Z76Z1Z1Z1Z86Z1Z1Z5Z20Z4Z18Z3Z17Z3Z79Z54Z1Z112Z4Z1Z1Z13Z86Z1Z5Z1Z1Z4Z20Z1Z18Z4Z17Z2Z79Z57Z1Z112Z4Z1Z1Z10Z5Z1Z1Z2Z86Z1Z8Z1Z1Z2Z5Z1Z1Z1Z20Z1Z18Z1Z17Z4Z79Z58Z1Z112Z10Z1Z1Z5Z5Z1Z20Z1Z18Z1Z20Z1Z5Z1Z1Z2Z8Z1Z86Z1Z5Z1Z1Z4Z20Z1Z18Z1Z17Z1Z79Z61Z1Z112Z86Z1Z4Z1Z1Z11Z5Z1Z86Z1Z8Z1Z1Z4Z20Z1Z18Z1Z17Z1Z79Z61Z1Z112Z10Z1Z86Z1Z10Z1Z1Z2Z5Z1Z1Z7Z8Z1Z68Z1Z8Z1Z13Z1Z68Z2Z5Z1Z20Z1Z18Z1Z17Z1Z79Z61Z1Z112Z86Z2Z10Z1Z13Z1Z1Z7Z4Z1Z21Z1Z8Z4Z1Z3Z20Z1Z18Z1Z17Z1Z79Z61Z1Z121Z13Z1Z21Z2Z5Z1Z8Z4Z1Z3Z20Z1Z18Z1Z17Z1Z79Z61Z1Z124Z8Z5Z1Z3Z20Z1Z18Z1Z17Z1Z79Z61Z1Z118Z5Z1Z1Z6Z8Z3Z1Z4Z20Z1Z18Z1Z17Z1Z79Z61Z1Z132Z20Z1Z18Z1Z17Z1Z79Z61Z1Z116Z5Z1Z1Z4Z4Z1Z1Z10Z20Z1Z18Z1Z17Z1Z79Z61Z1Z120Z10Z1Z86Z1Z10Z1Z1Z9Z20Z1Z18Z1Z17Z1Z79Z61Z1Z119Z10Z1Z86Z3Z10Z1Z1Z7Z4Z1Z20Z1Z18Z1Z17Z1Z79Z61Z1Z131Z4Z1Z20Z1Z18Z1Z17Z4Z79Z58Z1Z131Z20Z2Z18Z4Z17Z1Z79Z58Z1Z131Z20Z5Z18Z1Z17Z1Z79Z58Z1Z135Z20Z1Z18Z1Z17Z1Z79Z58Z1Z135Z20Z1Z18Z1Z17Z1Z79Z58Z1Z135Z20Z1Z18Z1Z17Z1Z79Z58Z1Z130Z20Z6Z18Z1Z17Z1Z79Z58Z1Z130Z20Z1Z18Z6Z17Z1Z79Z58Z1Z130Z20Z1Z18Z1Z17Z6Z79Z58Z1Z130Z20Z1Z18Z1Z17Z1Z79Z63Z1Z130Z20Z1Z18Z1Z17Z1Z79Z63Z1Z130Z20Z1Z18Z1Z17Z1Z79Z63Z1Z130Z20Z1Z18Z1Z17Z1Z79Z63Z1Z130Z20Z1Z18Z1Z17Z1Z79Z63Z1Z130Z20Z1Z18Z1Z17Z1Z79Z63Z1Z130Z20Z1Z18Z1Z17Z1Z79Z63Z1Z130Z20Z1Z18Z1Z17Z1Z79Z63Z1Z130Z20Z1Z18Z1Z17Z64Z1Z130Z20Z1Z18Z65Z1Z130Z20Z66Z1Z31276ZZ1Z7Z3Z1Z0Z1Z1Z2Z3Z1Z0Z1Z3Z1Z0Z1Z1Z1Z3Z1Z0Z2Z3Z1Z1Z1Z3Z1Z1Z2Z3Z1Z0Z1Z1Z1Z2Z1Z1Z1Z2Z1Z1Z166Z0Z1Z1Z1Z2Z1Z1Z5Z2Z1Z0Z1Z1Z1Z2Z1Z1Z1Z3Z1Z1Z1Z3Z1Z1Z1Z2Z2Z1Z3Z3Z1Z2Z1Z1Z2Z3Z1Z1Z170Z3Z1Z1Z7Z2Z1Z1Z2Z2Z1Z1Z1Z2Z1Z1Z5Z3Z1Z1Z2Z2Z1Z1Z172Z2Z1Z1Z13Z2Z1Z1Z181Z2Z1Z1Z13Z2Z2Z1Z180Z2Z1Z1Z13Z2Z1Z1Z3Z2Z1Z1Z177Z3Z1Z1Z5Z3Z1Z1Z3Z2Z1Z1Z3Z2Z2Z1Z180Z2Z2Z1Z11Z0Z1Z2Z1Z1Z183Z3Z1Z1Z11Z2Z1Z1Z1Z0Z1Z1Z1Z3Z1Z2Z1Z1Z178Z2Z1Z3Z1Z1Z7Z3Z1Z1Z193Z0Z1Z1Z388Z2Z1Z1Z389Z2Z1Z1Z4Z3Z1Z1Z194Z0Z1Z1Z1Z3Z1Z1Z192Z0Z1Z1Z3Z3Z1Z1Z7Z0Z1Z1Z195Z0Z1Z1Z35064ZZZ13Z0Z11Z3Z10Z1Z8Z2Z8Z1Z6Z1Z4Z2Z3Z1Z3Z2Z5Z2Z8Z2Z12Z3Z14Z2Z29Z0Z37Z1Z42Z0Z46Z0Z53Z1Z56Z3Z59Z2Z57Z1Z57Z2Z55Z1Z52Z3Z49Z2Z46Z2Z41Z3Z35Z0Z27Z1Z22Z2Z16Z0Z14Z3Z11Z0Z9Z0Z6Z1Z2Z0Z0Z0ZC1Z0ZC1Z3ZC1Z1ZZ180Z180";
const STAGE_VOTE_STAND_SECONDS = 3;
const STAGE_VOTE_ZONE_WIDTH = 200;
const STAGE_VOTE_ZONE_DEPTH = 30;
const STAGE_VOTE_MOVE_TOLERANCE = 0.6; 
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

        this._initHiDPICanvas();
        this._setupFullscreen();

        this.renderer = new LevelRenderer(this.canvas);
        this.levelData = null;
        this.physics = null;
        this.mapSnapshot = null;
        this.mapRotationSnapshot = null;
        this.lastBuiltLevelCode = null;
        this.onLevelCodeSaved = null;
        this.onFinalResults = null;
        this.onFinalResultsHidden = null;
        this.onHostChanged = null; 
        this.playerCount = Math.max(MIN_PLAYERS, Math.min(MAX_PLAYERS, Math.floor(playerCount) || 2));
        this.localSeatIndex = 0;
        this.players = this.createPlayers(this.playerCount, this.localSeatIndex);

        this.camera = { x: 0, y: 0, zoom: 1.25};
        this.cameraLookahead = { x: 0, y: 0 }; 
        this.cameraMode = 0; 
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
        this.isAdmin = false; 
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
        this._deferredAssetCallbacks = [];
        this.totalAssets = 201; 
        this.totalRounds = 10;
        this.POINTS_TO_WIN = 15;
        this.settings = {
            lives: 1,
            pointsToWin: 15,
            comebackPoints: 2,
            firstPlacePoints: 1,
            totalRounds: 10,
            raceTimeLimit: 60,
            pieceChances: {}
        };
        this.onSettingsUpdated = null; 

        this.settingsMenuOpen = false;
        this.settingsMenuIndex = 0;
        this.settingsMenuTab = 'match'; // 'match' | 'pieces'
        this.colorPickerOpen = false;
        this.helpMenuOpen = false;
        this.RESPAWN_DELAY_FRAMES = 30; 
        this.SETTINGS_META = [
            { key: 'lives', label: 'Lives per attempt', min: 1, max: 10, step: 1 },
            { key: 'pointsToWin', label: 'Points to win', min: 3, max: 100, step: 1 },
            { key: 'comebackPoints', label: 'Comeback points', min: 0, max: 10, step: 1 },
            { key: 'firstPlacePoints', label: 'First place points', min: 0, max: 10, step: 1 },
            { key: 'totalRounds', label: 'Rounds', min: 1, max: 30, step: 1 },
            { key: 'raceTimeLimit', label: 'Race time limit (s)', min: 15, max: 180, step: 5 }
        ];
        // Piece chance settings are built from pieces.js so it stays in sync with the actual piece pool.
        this.PIECE_CHANCE_META = (typeof PIECE_POOL !== 'undefined' ? PIECE_POOL : []).map(piece => ({
            pieceId: piece.id,
            label: piece.name,
            min: 0,
            max: 20,
            step: 1,
            defaultChance: piece.chance || 1
        }));
        this.currentRound = 1;
        this.MAX_POSSIBLE_SCORE = this.totalRounds * 3;
        this.roundResultsAnimFrames = 0;
        this.ROUND_RESULTS_ANIM_FRAMES = 15;
        this.stageCandidates = [];
        this.stageThumbnails = new Map();
        this.stageVoteZones = []; 
        this.stageCountdownActive = false;
        this.stageCountdownStart = null;
        this.stageCountdownDuration = STAGE_VOTE_STAND_SECONDS * 1000;
        this.STAGE_VOTE_ZONES = [
            { x: 270,  y: 77 },
            { x: 630, y: 677 },
            { x: 510, y: 437 },
            { x: 1050, y: 197 },
            { x: 120, y: 617 },
            { x: 1080, y: 557 },
            { x: 570, y: 1037 },
            { x: 1260, y: 1217 }
        ];
        this.PARTY_BOX_SLOT_COUNT = Math.ceil(1.5 * this.playerCount);
        this.PARTY_TIME_LIMIT = 12; 
        this.partySlots = [];
        this.partyTimeRemaining = this.PARTY_TIME_LIMIT;
        this.lastRoundDeaths = { anyEliminated: false, allEliminated: false };
        this.BUILD_TIME_LIMIT = 20; 
        this.buildTimeRemaining = this.BUILD_TIME_LIMIT;
        this.giveUpHoldFrames = 0;
        this.GIVE_UP_HOLD_FRAMES = 90;
        this.GIVE_UP_LOCKOUT_SECONDS = 1;
        this.chatOpen = false;
        this.chatInputText = '';
        this.chatMessages = []; 
        this.CHAT_MAX_LENGTH = 140;
        this.CHAT_MESSAGE_DURATION_MS = 6000;
        this.CHAT_MAX_VISIBLE = 6;
        this.CHAT_MAX_HISTORY = 300; 
        this.chatScrollOffset = 0;   
        this.chatSentHistory = [];   
        this.chatHistoryIndex = -1;  
        this.chatHistoryDraft = '';  
        this.chatCursorPos = 0;          
        this.chatSelectionAnchor = null; 
        this._chatInputBox = null;       
        this._chatMouseSelecting = false;
        this._chatCaretActivityAt = 0;   
        this._chatAutocompleteCycle = null;

        if (typeof replayCode !== 'undefined' && replayCode) {
            this.decodedReplayCode = decodeReplayCode(replayCode);
        }

        window.addEventListener('keydown', e => {
            if (this.chatOpen) {
                this.handleChatKeydown(e);
                return;
            }
            if (this.settingsMenuOpen) {
                this.handleSettingsMenuKeydown(e);
                return;
            }
            if (this.colorPickerOpen) {
                this.handleColorPickerKeydown(e);
                return;
            }
            if (this.helpMenuOpen) {
                this.handleHelpMenuKeydown(e);
                return;
            }

            this.keys[e.code] = true;

            if (e.code === 'KeyT' && !e.repeat && this.gameState !== GameState.MENU) {
                e.preventDefault();
                this.openChat();
                return;
            }

            if (e.code === 'KeyH' && !e.repeat && this.gameState !== GameState.MENU) {
                e.preventDefault();
                this.helpMenuOpen = true;
                this.keys = {};
                return;
            }

            if (e.code === 'KeyM' && !e.repeat && this.gameState === GameState.STAGE_SELECT) {
                e.preventDefault();
                this.settingsMenuOpen = true;
                this.keys = {};
                return;
            }

            if (e.code === 'KeyC' && !e.repeat && this.gameState === GameState.STAGE_SELECT) {
                e.preventDefault();
                this.colorPickerOpen = true;
                this.keys = {};
                return;
            }

            if (e.code === 'KeyF' && !e.repeat) {
                e.preventDefault();
                this.toggleFullscreen();
            }

            if (e.code === 'Digit2' && !e.repeat) {
                this.showDebugMenu = !this.showDebugMenu;
                if (this.showDebugMenu && this.network && this.network.isConnected) this.network.sendPing();
                console.log(`[debug] menu ${this.showDebugMenu ? 'ON' : 'OFF'}`);
            }

            if (this.gameState === GameState.PARTY_BOX) {
                this.handlePartyBoxInput(e.code);
            } else if (this.gameState === GameState.BUILD) {
                this.handleBuildInput(e.code);
            }
            if (e.code === 'Digit1' && !e.repeat && (this.gameState === GameState.RACE || this.gameState === GameState.STAGE_SELECT)) {
                this.cameraMode = (this.cameraMode + 1) % 3;
            }
            if (e.code === 'Enter' || e.code === 'NumpadEnter' || e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
                this.advanceFromPlaceholder();
            }
        });
        window.addEventListener('keyup', e => {
            this.keys[e.code] = false;
        });
        window.addEventListener('wheel', e => {
            if (!this.chatOpen) return;
            e.preventDefault();
            const maxOffset = Math.max(0, this.chatMessages.length - 1);
            const delta = e.deltaY > 0 ? -1 : 1; 
            this.chatScrollOffset = Math.max(0, Math.min(maxOffset, this.chatScrollOffset + delta));
        }, { passive: false });

        this.canvas.addEventListener('mousedown', e => {
            if (!this.chatOpen || !this._chatInputBox) return;
            const pos = this._chatCharIndexFromClientX(e.clientX);
            if (pos === null) return;
            e.preventDefault();
            this._chatMouseSelecting = true;
            this._chatCaretActivityAt = performance.now();
            this.chatCursorPos = pos;
            this.chatSelectionAnchor = pos;
        });
        window.addEventListener('mousemove', e => {
            if (!this._chatMouseSelecting) return;
            const pos = this._chatCharIndexFromClientX(e.clientX, true);
            if (pos === null) return;
            this._chatCaretActivityAt = performance.now();
            this.chatCursorPos = pos;
        });
        window.addEventListener('mouseup', () => {
            if (!this._chatMouseSelecting) return;
            this._chatMouseSelecting = false;
            if (this.chatSelectionAnchor === this.chatCursorPos) this.chatSelectionAnchor = null;
        });
    }

    // Decouples the canvas's *logical* width/height (960x540 — what all the game/render
    // code reads and positions things against) from its actual backing-store pixel size.
    // this.canvas.width / this.canvas.height keep reporting 960 / 540 forever, so none of
    // the existing drawing code needs to change, but the real pixel buffer can be scaled
    // up (e.g. to native screen resolution in fullscreen) for crisp, non-blurry rendering.
    _initHiDPICanvas() {
        const canvas = this.canvas;
        const widthDesc = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, 'width');
        const heightDesc = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, 'height');

        let logicalW = widthDesc.get.call(canvas);
        let logicalH = heightDesc.get.call(canvas);
        this._renderScale = 1;

        const applyBackingSize = () => {
            widthDesc.set.call(canvas, Math.max(1, Math.round(logicalW * this._renderScale)));
            heightDesc.set.call(canvas, Math.max(1, Math.round(logicalH * this._renderScale)));
            // Resizing the backing store resets the context state, so re-apply the scale
            // transform: every draw call in the codebase is written in 960x540 logical
            // coordinates, and this maps them onto the (possibly larger) real pixel buffer.
            this.ctx.setTransform(this._renderScale, 0, 0, this._renderScale, 0, 0);
        };

        Object.defineProperty(canvas, 'width', {
            configurable: true,
            get: () => logicalW,
            set: (v) => { logicalW = v; applyBackingSize(); }
        });
        Object.defineProperty(canvas, 'height', {
            configurable: true,
            get: () => logicalH,
            set: (v) => { logicalH = v; applyBackingSize(); }
        });

        this._applyBackingSize = applyBackingSize;
        this._logicalCanvasSize = () => ({ w: logicalW, h: logicalH });
        applyBackingSize();
    }

    _setupFullscreen() {
        const target = document.documentElement;
        this._fullscreenTarget = target;

        const fitCanvasToViewport = () => {
            const isFs = document.fullscreenElement === target;
            if (!isFs) {
                this.canvas.style.width = '';
                this.canvas.style.height = '';
                this._renderScale = 1;
                this._applyBackingSize();
                return;
            }

            const { w: logicalW, h: logicalH } = this._logicalCanvasSize();
            const aspect = logicalW / logicalH;
            const vw = window.innerWidth;
            const vh = window.innerHeight;

            let dispW = vw;
            let dispH = vw / aspect;
            if (dispH > vh) {
                dispH = vh;
                dispW = vh * aspect;
            }

            this.canvas.style.width = Math.round(dispW) + 'px';
            this.canvas.style.height = Math.round(dispH) + 'px';

            const dpr = window.devicePixelRatio || 1;
            // Render at the real on-screen pixel density (capped so huge 8K/high-dpr
            // displays don't blow the canvas resolution — and thus memory/GPU cost — out
            // of proportion).
            this._renderScale = Math.min(4, Math.max(1, (dispW * dpr) / logicalW));
            this._applyBackingSize();
        };

        this._fitCanvasToViewport = fitCanvasToViewport;
        document.addEventListener('fullscreenchange', fitCanvasToViewport);
        window.addEventListener('resize', () => {
            if (document.fullscreenElement === target) fitCanvasToViewport();
        });
    }

    toggleFullscreen() {
        const target = this._fullscreenTarget || document.documentElement;
        if (!document.fullscreenElement) {
            const req = target.requestFullscreen || target.webkitRequestFullscreen;
            if (req) req.call(target).catch(err => console.error('[fullscreen] request failed:', err));
        } else {
            const exit = document.exitFullscreen || document.webkitExitFullscreen;
            if (exit) exit.call(document);
        }
    }

    _chatCharIndexFromClientX(clientX, clamp = false) {
        const box = this._chatInputBox;
        if (!box) return null;
        const rect = this.canvas.getBoundingClientRect();
        const scaleX = this.canvas.width / rect.width;
        const x = (clientX - rect.left) * scaleX;
        if (!clamp && (x < box.x || x > box.x + box.width)) return null;
        const ctx = this.ctx;
        ctx.save();
        ctx.font = box.font;
        const text = this.chatInputText;
        let best = 0;
        let bestDist = Infinity;
        for (let i = 0; i <= text.length; i++) {
            const w = ctx.measureText(text.slice(0, i)).width;
            const charX = box.textStartX + w;
            const dist = Math.abs(charX - x);
            if (dist < bestDist) {
                bestDist = dist;
                best = i;
            }
        }
        ctx.restore();
        return best;
    }

    openChat() {
        this.chatOpen = true;
        this.chatInputText = '';
        this.chatScrollOffset = 0;
        this.chatHistoryIndex = -1;
        this.chatHistoryDraft = '';
        this.chatCursorPos = 0;
        this.chatSelectionAnchor = null;
        this._chatCaretActivityAt = performance.now();
        this.keys = {}; 
    }
    getActiveSettingsMeta() {
        return this.settingsMenuTab === 'pieces' ? this.PIECE_CHANCE_META : this.SETTINGS_META;
    }

    getSettingsMenuValue(meta) {
        if (meta.pieceId) {
            const overrides = (this.settings && this.settings.pieceChances) || {};
            return (typeof overrides[meta.pieceId] === 'number') ? overrides[meta.pieceId] : meta.defaultChance;
        }
        return (this.settings && typeof this.settings[meta.key] === 'number') ? this.settings[meta.key] : meta.min;
    }

    setSettingsMenuValue(meta, value) {
        if (meta.pieceId) {
            if (!this.settings.pieceChances) this.settings.pieceChances = {};
            this.settings.pieceChances = { ...this.settings.pieceChances, [meta.pieceId]: value };
            this.requestUpdateSettings({ pieceChances: { [meta.pieceId]: value } });
        } else {
            this.settings[meta.key] = value;
            this.requestUpdateSettings({ [meta.key]: value });
        }
    }

    handleSettingsMenuKeydown(e) {
        const closeKeys = ['KeyM', 'Escape', 'Enter', 'NumpadEnter', 'ShiftLeft', 'ShiftRight'];
        if (closeKeys.includes(e.code)) {
            if (!e.repeat) {
                e.preventDefault();
                this.settingsMenuOpen = false;
            }
            return;
        }
        if (e.repeat) return;

        if (LOCAL_PLAYER_CONTROLS.rotateCCW.includes(e.code) || LOCAL_PLAYER_CONTROLS.rotateCW.includes(e.code)) {
            e.preventDefault();
            this.settingsMenuTab = this.settingsMenuTab === 'match' ? 'pieces' : 'match';
            this.settingsMenuIndex = 0;
            if (typeof playSfx === 'function') playSfx('select');
            return;
        }

        const meta_list = this.getActiveSettingsMeta();
        if (meta_list.length === 0) return;

        if (LOCAL_PLAYER_CONTROLS.up.includes(e.code)) {
            e.preventDefault();
            this.settingsMenuIndex = (this.settingsMenuIndex - 1 + meta_list.length) % meta_list.length;
            if (typeof playSfx === 'function') playSfx('select');
            return;
        }
        if (LOCAL_PLAYER_CONTROLS.down.includes(e.code)) {
            e.preventDefault();
            this.settingsMenuIndex = (this.settingsMenuIndex + 1) % meta_list.length;
            if (typeof playSfx === 'function') playSfx('select');
            return;
        }

        if (!this.isHost && !this.isAdmin) return; 

        const goingRight = LOCAL_PLAYER_CONTROLS.right.includes(e.code);
        const goingLeft = LOCAL_PLAYER_CONTROLS.left.includes(e.code);
        if (!goingRight && !goingLeft) return;
        e.preventDefault();

        const meta = meta_list[this.settingsMenuIndex];
        const current = this.getSettingsMenuValue(meta);
        const dir = goingRight ? 1 : -1;
        const next = Math.max(meta.min, Math.min(meta.max, current + dir * meta.step));
        if (next === current) return;

        if (typeof playSfx === 'function') playSfx('select');
        this.setSettingsMenuValue(meta, next);
    }

    drawSettingsMenu() {
        if (!this.settingsMenuOpen) return;
        const ctx = this.ctx;
        const rowHeight = 26;
        const paddingX = 20;
        const paddingY = 16;
        const titleHeight = 26;
        const tabHeight = 24;
        const footerHeight = 22;
        const width = 320;
        const metaList = this.getActiveSettingsMeta();
        const maxVisibleRows = 15;
        const visibleCount = Math.min(metaList.length, maxVisibleRows);
        const height = paddingY * 2 + titleHeight + tabHeight + rowHeight * visibleCount + footerHeight;
        const x = (this.canvas.width - width) / 2;
        const y = (this.canvas.height - height) / 2;

        // Keep the selected row scrolled into view.
        let scrollOffset = 0;
        if (metaList.length > maxVisibleRows) {
            scrollOffset = Math.max(0, Math.min(this.settingsMenuIndex - maxVisibleRows + 1, metaList.length - maxVisibleRows));
            if (this.settingsMenuIndex < scrollOffset) scrollOffset = this.settingsMenuIndex;
        }

        ctx.save();
        ctx.fillStyle = 'rgba(0, 0, 0, 0.82)';
        ctx.fillRect(x, y, width, height);
        ctx.strokeStyle = THEME.panelBorderActive;
        ctx.lineWidth = 1.5;
        ctx.strokeRect(x, y, width, height);

        ctx.textAlign = 'center';
        ctx.fillStyle = THEME.text;
        ctx.font = 'bold 16px ' + THEME.font;
        ctx.fillText('Match Settings', x + width / 2, y + paddingY + 12);

        // Tab row
        const tabY = y + paddingY + titleHeight;
        const tabs = [{ id: 'match', label: 'Match' }, { id: 'pieces', label: 'Piece Chances' }];
        const tabWidth = width / tabs.length;
        ctx.font = '12px ' + THEME.font;
        tabs.forEach((tab, i) => {
            const active = this.settingsMenuTab === tab.id;
            const tabX = x + i * tabWidth;
            if (active) {
                ctx.fillStyle = 'rgba(58, 160, 255, 0.18)';
                ctx.fillRect(tabX + 4, tabY, tabWidth - 8, tabHeight - 4);
            }
            ctx.fillStyle = active ? THEME.accent : THEME.textMuted;
            ctx.fillText(tab.label, tabX + tabWidth / 2, tabY + tabHeight / 2 + 3);
        });

        ctx.font = '13px ' + THEME.font;
        metaList.slice(scrollOffset, scrollOffset + visibleCount).forEach((meta, visibleI) => {
            const i = scrollOffset + visibleI;
            const rowY = y + paddingY + titleHeight + tabHeight + visibleI * rowHeight;
            const selected = i === this.settingsMenuIndex;
            if (selected) {
                ctx.fillStyle = 'rgba(58, 160, 255, 0.18)';
                ctx.fillRect(x + 8, rowY, width - 16, rowHeight - 4);
            }
            ctx.textAlign = 'left';
            ctx.fillStyle = selected ? THEME.accent : THEME.text;
            ctx.fillText(meta.label, x + paddingX, rowY + rowHeight / 2 - 3);

            ctx.textAlign = 'right';
            const value = this.getSettingsMenuValue(meta);
            ctx.fillStyle = selected ? THEME.accent : THEME.textMuted;
            ctx.fillText(String(value), x + width - paddingX, rowY + rowHeight / 2 - 3);
        });

        ctx.textAlign = 'center';
        ctx.font = '11px ' + THEME.font;
        ctx.fillStyle = THEME.textMuted;
        const hint = (this.isHost || this.isAdmin)
            ? 'W/S select   A/D change   Q/E switch tab   Enter/Shift/M close'
            : 'Only the host (or an admin) can change settings   Enter/Shift/M close';
        ctx.fillText(hint, x + width / 2, y + height - 8);
        ctx.restore();
    }
    handleColorPickerKeydown(e) {
        const closeKeys = ['KeyC', 'Escape', 'Enter', 'NumpadEnter', 'ShiftLeft', 'ShiftRight'];
        if (closeKeys.includes(e.code)) {
            if (!e.repeat) {
                e.preventDefault();
                this.colorPickerOpen = false;
            }
            return;
        }
        if (e.repeat) return;

        const goingRight = LOCAL_PLAYER_CONTROLS.right.includes(e.code);
        const goingLeft = LOCAL_PLAYER_CONTROLS.left.includes(e.code);
        if (!goingRight && !goingLeft) return;
        e.preventDefault();

        const HUE_STEP = 8;
        const HUE_MAX = 199;
        const player = this.players[this.localSeatIndex];
        const current = player ? (player.hue || 0) : 0;
        const dir = goingRight ? 1 : -1;
        let next = (current + dir * HUE_STEP) % (HUE_MAX + 1);
        if (next < 0) next += HUE_MAX + 1;
        this.requestSetColor(next);
        if (typeof playSfx === 'function') playSfx('select');
    }

    drawColorPicker() {
        if (!this.colorPickerOpen) return;
        const ctx = this.ctx;
        const width = 260;
        const height = 90;
        const x = (this.canvas.width - width) / 2;
        const y = (this.canvas.height - height) / 2;
        const player = this.players[this.localSeatIndex];
        const hue = player ? (player.hue || 0) : 0;

        ctx.save();
        ctx.fillStyle = 'rgba(0, 0, 0, 0.82)';
        ctx.fillRect(x, y, width, height);
        ctx.strokeStyle = THEME.panelBorderActive;
        ctx.lineWidth = 1.5;
        ctx.strokeRect(x, y, width, height);

        ctx.textAlign = 'center';
        ctx.fillStyle = THEME.text;
        ctx.font = 'bold 15px ' + THEME.font;
        ctx.fillText('Your Color', x + width / 2, y + 24);

        ctx.fillStyle = hueShiftToHex(hue);
        ctx.beginPath();
        ctx.arc(x + width / 2, y + 48, 14, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.4)';
        ctx.lineWidth = 1;
        ctx.stroke();

        ctx.font = '11px ' + THEME.font;
        ctx.fillStyle = THEME.textMuted;
        ctx.fillText('A/D to change   Enter/Shift/C close', x + width / 2, y + height - 10);
        ctx.restore();
    }

    drawHubMenuHints() {
        if (this.gameState !== GameState.STAGE_SELECT) return;
        if (this.settingsMenuOpen || this.colorPickerOpen || this.chatOpen || this.helpMenuOpen) return;
        const ctx = this.ctx;
        ctx.save();
        ctx.font = '11px ' + THEME.font;
        ctx.textAlign = 'center';
        ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
        ctx.fillText('M: Settings   C: Color   H: Controls', this.canvas.width / 2, this.canvas.height - 10);
        ctx.restore();
    }

    drawGlobalHints() {
        if (this.gameState === GameState.MENU) return;
        if (this.gameState === GameState.STAGE_SELECT) return; // drawHubMenuHints already covers this state
        if (this.settingsMenuOpen || this.colorPickerOpen || this.chatOpen || this.helpMenuOpen) return;
        const ctx = this.ctx;
        ctx.save();
        ctx.font = '11px ' + THEME.font;
        ctx.textAlign = 'center';
        ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
        ctx.fillText('H: Controls', this.canvas.width / 2, this.canvas.height - 10);
        ctx.restore();
    }

    // All of the key bindings shown in the controls (H) overlay, grouped for display.
    // Keeping this as data makes it easy to keep in sync if bindings ever change.
    get CONTROLS_HELP_SECTIONS() {
        return [
            {
                title: 'Movement (Race / Build)',
                rows: [
                    ['Move left / right', 'A/D, arrows, or J/L'],
                    ['Jump', 'W, Up, Space, or Z'],
                    ['Crouch', 'S, Down, or X']
                ]
            },
            {
                title: 'Race',
                rows: [
                    ['Hold to give up', 'Shift or Enter (hold)'],
                    ['Cycle camera mode', '1']
                ]
            },
            {
                title: 'Build phase',
                rows: [
                    ['Rotate piece', 'Q / E'],
                    ['Place piece', 'Shift or Enter']
                ]
            },
            {
                title: 'Party box',
                rows: [
                    ['Move cursor', 'A/D, arrows, or J/L'],
                    ['Grab piece', 'Shift or Enter']
                ]
            },
            {
                title: 'Menus',
                rows: [
                    ['Match settings (stage select)', 'M'],
                    ['Change color (stage select)', 'C'],
                    ['Open chat', 'T'],
                    ['This controls list', 'H'],
                    ['Close a menu', 'Enter or Shift']
                ]
            }
        ];
    }

    handleHelpMenuKeydown(e) {
        const closeKeys = ['KeyH', 'Escape', 'Enter', 'NumpadEnter', 'ShiftLeft', 'ShiftRight'];
        if (closeKeys.includes(e.code) && !e.repeat) {
            e.preventDefault();
            this.helpMenuOpen = false;
        }
    }

    drawHelpMenu() {
        if (!this.helpMenuOpen) return;
        const ctx = this.ctx;
        const sections = this.CONTROLS_HELP_SECTIONS;

        const paddingX = 24;
        const paddingY = 18;
        const titleHeight = 26;
        const sectionGap = 10;
        const sectionTitleHeight = 18;
        const rowHeight = 20;
        const footerHeight = 22;
        const width = 420;

        let height = paddingY * 2 + titleHeight + footerHeight;
        sections.forEach(section => {
            height += sectionTitleHeight + section.rows.length * rowHeight + sectionGap;
        });

        const x = (this.canvas.width - width) / 2;
        const y = Math.max(10, (this.canvas.height - height) / 2);

        ctx.save();
        ctx.fillStyle = 'rgba(0, 0, 0, 0.86)';
        ctx.fillRect(x, y, width, height);
        ctx.strokeStyle = THEME.panelBorderActive;
        ctx.lineWidth = 1.5;
        ctx.strokeRect(x, y, width, height);

        ctx.textAlign = 'center';
        ctx.fillStyle = THEME.text;
        ctx.font = 'bold 16px ' + THEME.font;
        ctx.fillText('Controls', x + width / 2, y + paddingY + 12);

        let rowY = y + paddingY + titleHeight;
        sections.forEach(section => {
            ctx.textAlign = 'left';
            ctx.font = 'bold 12px ' + THEME.font;
            ctx.fillStyle = THEME.accent;
            ctx.fillText(section.title.toUpperCase(), x + paddingX, rowY + sectionTitleHeight - 5);
            rowY += sectionTitleHeight;

            ctx.font = '13px ' + THEME.font;
            section.rows.forEach(([label, keys]) => {
                ctx.textAlign = 'left';
                ctx.fillStyle = THEME.text;
                ctx.fillText(label, x + paddingX, rowY + rowHeight / 2 + 4);

                ctx.textAlign = 'right';
                ctx.fillStyle = THEME.textMuted;
                ctx.fillText(keys, x + width - paddingX, rowY + rowHeight / 2 + 4);
                rowY += rowHeight;
            });
            rowY += sectionGap;
        });

        ctx.textAlign = 'center';
        ctx.font = '11px ' + THEME.font;
        ctx.fillStyle = THEME.textMuted;
        ctx.fillText('Esc/Enter/Shift/H to close', x + width / 2, y + height - 8);
        ctx.restore();
    }

    closeChat() {
        this.chatOpen = false;
        this.chatInputText = '';
        this.chatScrollOffset = 0;
        this.chatHistoryIndex = -1;
        this.chatHistoryDraft = '';
        this.chatCursorPos = 0;
        this.chatSelectionAnchor = null;
        this._chatMouseSelecting = false;
    }
    _chatPrevWordBoundary(text, pos) {
        let i = pos;
        while (i > 0 && /\s/.test(text[i - 1])) i--;
        while (i > 0 && !/\s/.test(text[i - 1])) i--;
        return i;
    }
    _chatNextWordBoundary(text, pos) {
        let i = pos;
        const len = text.length;
        while (i < len && /\s/.test(text[i])) i++;
        while (i < len && !/\s/.test(text[i])) i++;
        return i;
    }
    _chatAutocompleteMatch() {
        const text = this.chatInputText;
        const canPrivileged = this.isHost || this.isAdmin;

        let m = /^\/kick(?:\s+(\S*))?\s*$/i.exec(text);
        if (m) {
            if (!canPrivileged) return null;
            return this._chatPlayerNameMatch('/kick ', m[1] || '');
        }

        m = /^\/forcestage(?:\s+(.*))?$/i.exec(text);
        if (m) {
            if (!canPrivileged) return null;
            return this._chatStageNameMatch('/forcestage ', m[1] || '');
        }

        m = /^\/give\s+(lives|points)\s+(-?\d+)\s+(\S*)$/i.exec(text);
        if (m) {
            if (!this.isAdmin) return null;
            return this._chatPlayerNameMatch(`/give ${m[1]} ${m[2]} `, m[3] || '');
        }

        m = /^\/set\s+(lives|points)\s+(\d+)\s+(\S*)$/i.exec(text);
        if (m) {
            if (!this.isAdmin) return null;
            return this._chatPlayerNameMatch(`/set ${m[1]} ${m[2]} `, m[3] || '');
        }

        m = /^\/host(?:\s+(\S*))?\s*$/i.exec(text);
        if (m) {
            if (!this.isAdmin) return null;
            return this._chatPlayerNameMatch('/host ', m[1] || '');
        }

        m = /^\/kill(?:\s+(\S*))?\s*$/i.exec(text);
        if (m) {
            if (!this.isAdmin) return null;
            return this._chatPlayerNameMatch('/kill ', m[1] || '');
        }

        return null;
    }

    _chatPlayerNameMatch(prefix, queryRaw) {
        const query = queryRaw.toLowerCase();
        const names = (this.players || [])
            .filter(p => p && p.name && p.seatIndex !== this.localSeatIndex)
            .map(p => p.name);
        let matches = query ? names.filter(n => n.toLowerCase().startsWith(query)) : names;
        if (query && matches.length === 0) matches = names.filter(n => n.toLowerCase().includes(query));
        return { prefix, query: queryRaw, matches };
    }

    _chatStageNameMatch(prefix, queryRaw) {
        const query = queryRaw.toLowerCase();
        const names = (typeof LEVEL_NAMES !== 'undefined' ? LEVEL_NAMES : []).filter(Boolean);
        let matches = query ? names.filter(n => n.toLowerCase().startsWith(query)) : names;
        if (query && matches.length === 0) matches = names.filter(n => n.toLowerCase().includes(query));
        return { prefix, query: queryRaw, matches };
    }

    _chatApplyAutocomplete() {
        const info = this._chatAutocompleteMatch();
        if (!info || info.matches.length === 0) return;

        const cycleKey = info.prefix + '\u0000' + info.query;
        if (!this._chatAutocompleteCycle || this._chatAutocompleteCycle.key !== cycleKey) {
            this._chatAutocompleteCycle = { key: cycleKey, prefix: info.prefix, matches: info.matches, index: 0 };
        } else {
            this._chatAutocompleteCycle.index = (this._chatAutocompleteCycle.index + 1) % this._chatAutocompleteCycle.matches.length;
        }

        const cyc = this._chatAutocompleteCycle;
        const chosen = cyc.matches[cyc.index];
        this.chatInputText = cyc.prefix + chosen;
        this.chatCursorPos = this.chatInputText.length;
        this.chatSelectionAnchor = null;
    }

    handleChatKeydown(e) {
        this._chatCaretActivityAt = performance.now();
        if (e.code !== 'Tab') this._chatAutocompleteCycle = null;

        const text = this.chatInputText;
        const hasSelection = this.chatSelectionAnchor !== null && this.chatSelectionAnchor !== this.chatCursorPos;
        const selStart = hasSelection ? Math.min(this.chatSelectionAnchor, this.chatCursorPos) : this.chatCursorPos;
        const selEnd = hasSelection ? Math.max(this.chatSelectionAnchor, this.chatCursorPos) : this.chatCursorPos;
        const isMac = navigator.platform && navigator.platform.toUpperCase().includes('MAC');
        const ctrlKey = isMac ? e.metaKey : e.ctrlKey;
        const repeatable = ['Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'];
        if (e.repeat && !repeatable.includes(e.code)) return;

        if (e.code === 'Escape') {
            e.preventDefault();
            this.closeChat();
            return;
        }
        if (e.code === 'Enter' || e.code === 'NumpadEnter') {
            e.preventDefault();
            const trimmed = this.chatInputText.trim();
            this.closeChat();
            if (trimmed) this.sendChatMessage(trimmed);
            return;
        }
        if (ctrlKey && e.code === 'KeyA') {
            e.preventDefault();
            this.chatSelectionAnchor = 0;
            this.chatCursorPos = text.length;
            return;
        }
        if (ctrlKey && e.code === 'KeyC') {
            e.preventDefault();
            if (hasSelection && navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(text.slice(selStart, selEnd)).catch(() => {});
            }
            return;
        }
        if (ctrlKey && e.code === 'KeyX') {
            e.preventDefault();
            if (hasSelection) {
                if (navigator.clipboard && navigator.clipboard.writeText) {
                    navigator.clipboard.writeText(text.slice(selStart, selEnd)).catch(() => {});
                }
                this.chatInputText = text.slice(0, selStart) + text.slice(selEnd);
                this.chatCursorPos = selStart;
                this.chatSelectionAnchor = null;
            }
            return;
        }
        if (ctrlKey && e.code === 'KeyV') {
            e.preventDefault();
            if (navigator.clipboard && navigator.clipboard.readText) {
                navigator.clipboard.readText().then(pasted => {
                    if (!pasted) return;
                    const clean = pasted.replace(/[\r\n]+/g, ' ');
                    const curText = this.chatInputText;
                    const curHasSel = this.chatSelectionAnchor !== null && this.chatSelectionAnchor !== this.chatCursorPos;
                    const curStart = curHasSel ? Math.min(this.chatSelectionAnchor, this.chatCursorPos) : this.chatCursorPos;
                    const curEnd = curHasSel ? Math.max(this.chatSelectionAnchor, this.chatCursorPos) : this.chatCursorPos;
                    let combined = curText.slice(0, curStart) + clean + curText.slice(curEnd);
                    if (combined.length > this.CHAT_MAX_LENGTH) combined = combined.slice(0, this.CHAT_MAX_LENGTH);
                    this.chatInputText = combined;
                    this.chatCursorPos = Math.min(curStart + clean.length, this.CHAT_MAX_LENGTH);
                    this.chatSelectionAnchor = null;
                }).catch(() => {});
            }
            return;
        }
        if (e.code === 'Backspace') {
            e.preventDefault();
            if (hasSelection) {
                this.chatInputText = text.slice(0, selStart) + text.slice(selEnd);
                this.chatCursorPos = selStart;
            } else if (this.chatCursorPos > 0) {
                const deleteFrom = ctrlKey ? this._chatPrevWordBoundary(text, this.chatCursorPos) : this.chatCursorPos - 1;
                this.chatInputText = text.slice(0, deleteFrom) + text.slice(this.chatCursorPos);
                this.chatCursorPos = deleteFrom;
            }
            this.chatSelectionAnchor = null;
            return;
        }
        if (e.code === 'Delete') {
            e.preventDefault();
            if (hasSelection) {
                this.chatInputText = text.slice(0, selStart) + text.slice(selEnd);
                this.chatCursorPos = selStart;
            } else if (this.chatCursorPos < text.length) {
                const deleteTo = ctrlKey ? this._chatNextWordBoundary(text, this.chatCursorPos) : this.chatCursorPos + 1;
                this.chatInputText = text.slice(0, this.chatCursorPos) + text.slice(deleteTo);
            }
            this.chatSelectionAnchor = null;
            return;
        }
        if (e.code === 'ArrowLeft') {
            e.preventDefault();
            const newPos = ctrlKey ? this._chatPrevWordBoundary(text, this.chatCursorPos) : Math.max(0, this.chatCursorPos - 1);
            if (e.shiftKey) {
                if (this.chatSelectionAnchor === null) this.chatSelectionAnchor = this.chatCursorPos;
                this.chatCursorPos = newPos;
            } else {
                this.chatCursorPos = hasSelection ? selStart : newPos;
                this.chatSelectionAnchor = null;
            }
            return;
        }
        if (e.code === 'ArrowRight') {
            e.preventDefault();
            if (!hasSelection && !e.shiftKey && this.chatCursorPos === text.length) {
                const info = this._chatAutocompleteMatch();
                if (info && info.matches.length > 0) {
                    this.chatInputText = info.prefix + info.matches[0];
                    this.chatCursorPos = this.chatInputText.length;
                    this.chatSelectionAnchor = null;
                    return;
                }
            }
            const newPos = ctrlKey ? this._chatNextWordBoundary(text, this.chatCursorPos) : Math.min(text.length, this.chatCursorPos + 1);
            if (e.shiftKey) {
                if (this.chatSelectionAnchor === null) this.chatSelectionAnchor = this.chatCursorPos;
                this.chatCursorPos = newPos;
            } else {
                this.chatCursorPos = hasSelection ? selEnd : newPos;
                this.chatSelectionAnchor = null;
            }
            return;
        }
        if (e.code === 'Home') {
            e.preventDefault();
            if (e.shiftKey) {
                if (this.chatSelectionAnchor === null) this.chatSelectionAnchor = this.chatCursorPos;
            } else {
                this.chatSelectionAnchor = null;
            }
            this.chatCursorPos = 0;
            return;
        }
        if (e.code === 'End') {
            e.preventDefault();
            if (e.shiftKey) {
                if (this.chatSelectionAnchor === null) this.chatSelectionAnchor = this.chatCursorPos;
            } else {
                this.chatSelectionAnchor = null;
            }
            this.chatCursorPos = text.length;
            return;
        }
        if (e.code === 'Tab') {
            e.preventDefault();
            this._chatApplyAutocomplete();
            return;
        }
        if (e.code === 'ArrowUp') {
            e.preventDefault();
            if (this.chatSentHistory.length === 0) return;
            if (this.chatHistoryIndex === -1) {
                this.chatHistoryDraft = this.chatInputText; 
                this.chatHistoryIndex = this.chatSentHistory.length - 1;
            } else if (this.chatHistoryIndex > 0) {
                this.chatHistoryIndex--;
            }
            this.chatInputText = this.chatSentHistory[this.chatHistoryIndex];
            this.chatCursorPos = this.chatInputText.length;
            this.chatSelectionAnchor = null;
            return;
        }
        if (e.code === 'ArrowDown') {
            e.preventDefault();
            if (this.chatHistoryIndex === -1) return;
            if (this.chatHistoryIndex < this.chatSentHistory.length - 1) {
                this.chatHistoryIndex++;
                this.chatInputText = this.chatSentHistory[this.chatHistoryIndex];
            } else {
                this.chatHistoryIndex = -1;
                this.chatInputText = this.chatHistoryDraft;
            }
            this.chatCursorPos = this.chatInputText.length;
            this.chatSelectionAnchor = null;
            return;
        }
        if (e.key && e.key.length === 1 && !ctrlKey && !e.altKey) {
            e.preventDefault();
            if (hasSelection) {
                const newText = text.slice(0, selStart) + e.key + text.slice(selEnd);
                if (newText.length <= this.CHAT_MAX_LENGTH) {
                    this.chatInputText = newText;
                    this.chatCursorPos = selStart + 1;
                }
            } else if (text.length < this.CHAT_MAX_LENGTH) {
                this.chatInputText = text.slice(0, this.chatCursorPos) + e.key + text.slice(this.chatCursorPos);
                this.chatCursorPos++;
            }
            this.chatSelectionAnchor = null;
        }
    }

    sendChatMessage(text) {
        const trimmed = text.trim().slice(0, this.CHAT_MAX_LENGTH);
        if (!trimmed) return;
        if (this.chatSentHistory[this.chatSentHistory.length - 1] !== trimmed) {
            this.chatSentHistory.push(trimmed);
            if (this.chatSentHistory.length > 50) this.chatSentHistory.shift();
        }

        if (trimmed.startsWith('/')) {
            this.handleChatCommand(trimmed);
            return;
        }

        if (this.network && this.network.isConnected) {
            this.network.sendChatMessage(trimmed);
            return;
        }
        const localPlayer = this.players[this.localSeatIndex];
        this.handleChatMessage({
            seatIndex: this.localSeatIndex,
            name: localPlayer ? localPlayer.name : 'You',
            hue: localPlayer ? localPlayer.hue : 0,
            text: trimmed
        });
    }
    handleChatCommand(raw) {
        const spaceIdx = raw.indexOf(' ');
        const cmd = (spaceIdx === -1 ? raw : raw.slice(0, spaceIdx)).toLowerCase();
        const arg = spaceIdx === -1 ? '' : raw.slice(spaceIdx + 1).trim();

        if (cmd === '/kick') {
            if (!this.isHost && !this.isAdmin) {
                this.pushSystemMessage('Only the host (or an admin) can kick players.');
                return;
            }
            if (!arg) {
                this.pushSystemMessage('Usage: /kick <username> (Tab to autocomplete)');
                return;
            }
            if (this.network && this.network.isConnected) {
                this.network.sendKickRequest(arg);
            } else {
                this.pushSystemMessage('Not connected to a server.');
            }
            return;
        }

        if (cmd === '/color') {
            const hue = Math.round(Number(arg));
            if (!arg || !Number.isFinite(hue) || hue < 0 || hue > 199) {
                this.pushSystemMessage('Usage: /color <0-199>');
                return;
            }
            if (this.network && this.network.isConnected) {
                this.network.sendSetColorRequest(hue);
            } else {
                const localPlayer = this.players[this.localSeatIndex];
                if (localPlayer) {
                    localPlayer.hue = hue;
                    localPlayer.color = hueShiftToHex(hue);
                }
            }
            return;
        }

        if (cmd === '/forcestage') {
            if (!this.isHost && !this.isAdmin) {
                this.pushSystemMessage('Only the host (or an admin) can force a stage.');
                return;
            }
            if (!arg) {
                this.pushSystemMessage('Usage: /forcestage <stage name> (Tab to autocomplete)');
                return;
            }
            if (this.gameState !== GameState.STAGE_SELECT) {
                this.pushSystemMessage('Can only force a stage during stage select.');
                return;
            }
            const levelCode = this._resolveStageNameToCode(arg);
            if (!levelCode) {
                this.pushSystemMessage(`No stage matching "${arg}".`);
                return;
            }
            if (this.network && this.network.isConnected) {
                this.network.sendForceStageRequest(levelCode);
            } else {
                this.pushSystemMessage('Not connected to a server.');
            }
            return;
        }

        if (cmd === '/login') {
            if (!arg) {
                this.pushSystemMessage('Usage: /login <password>');
                return;
            }
            if (this.network && this.network.isConnected) {
                this.network.sendLoginRequest(arg);
            } else {
                this.pushSystemMessage('Not connected to a server.');
            }
            return;
        }

        if (cmd === '/give') {
            if (!this.isAdmin) {
                this.pushSystemMessage('Only an admin can use /give. Try /login <password> first.');
                return;
            }
            const parts = arg.split(/\s+/).filter(Boolean);
            const kind = (parts[0] || '').toLowerCase();
            const amount = Math.round(Number(parts[1]));
            const targetName = parts.slice(2).join(' ');
            const validKind = kind === 'lives' || kind === 'points';
            if (!validKind || !Number.isFinite(amount) || amount === 0 || !targetName) {
                this.pushSystemMessage('Usage: /give <lives|points> <amount> <username> (Tab to autocomplete name)');
                return;
            }
            if (this.network && this.network.isConnected) {
                this.network.sendGiveRequest(kind, amount, targetName);
            } else {
                this.pushSystemMessage('Not connected to a server.');
            }
            return;
        }

        if (cmd === '/set') {
            if (!this.isAdmin) {
                this.pushSystemMessage('Only an admin can use /set. Try /login <password> first.');
                return;
            }
            const parts = arg.split(/\s+/).filter(Boolean);
            const kind = (parts[0] || '').toLowerCase();
            const amount = Math.round(Number(parts[1]));
            const targetName = parts.slice(2).join(' ');
            const validKind = kind === 'lives' || kind === 'points';
            if (!validKind || !Number.isFinite(amount) || amount < 0 || !targetName) {
                this.pushSystemMessage('Usage: /set <lives|points> <value> <username> (Tab to autocomplete name)');
                return;
            }
            if (this.network && this.network.isConnected) {
                this.network.sendSetRequest(kind, amount, targetName);
            } else {
                this.pushSystemMessage('Not connected to a server.');
            }
            return;
        }

        if (cmd === '/host') {
            if (!this.isAdmin) {
                this.pushSystemMessage('Only an admin can use /host. Try /login <password> first.');
                return;
            }
            if (this.network && this.network.isConnected) {
                this.network.sendHostRequest(arg);
            } else {
                this.pushSystemMessage('Not connected to a server.');
            }
            return;
        }

        if (cmd === '/kill') {
            if (!this.isAdmin) {
                this.pushSystemMessage('Only an admin can use /kill. Try /login <password> first.');
                return;
            }
            if (!arg) {
                this.pushSystemMessage('Usage: /kill <username> (Tab to autocomplete)');
                return;
            }
            if (this.network && this.network.isConnected) {
                this.network.sendKillRequest(arg);
            } else {
                this.pushSystemMessage('Not connected to a server.');
            }
            return;
        }

        if (cmd === '/next') {
            if (!this.isAdmin) {
                this.pushSystemMessage('Only an admin can use /next. Try /login <password> first.');
                return;
            }
            if (this.network && this.network.isConnected) {
                this.network.sendNextRequest();
            } else {
                this.pushSystemMessage('Not connected to a server.');
            }
            return;
        }

        if (cmd === '/help') {
            const lines = ['Available commands:'];
            lines.push('/color <0-199> - change your color');

            if (this.isHost || this.isAdmin) {
                lines.push('/kick <username> - remove a player from the room');
                lines.push('/forcestage <stage name> - force the stage during stage select');
            }

            if (this.isAdmin) {
                lines.push('/give <lives|points> <amount> <username> - add/remove lives or points');
                lines.push('/set <lives|points> <value> <username> - set lives or points to a value');
                lines.push('/host [username] - become host, or hand host to a player');
                lines.push('/kill <username> - force-eliminate a player mid-race');
                lines.push('/next - skip waiting for everyone on the round-results screen');
            }

            lines.push('/help - show this list');
            for (const line of lines) this.pushSystemMessage(line);
            return;
        }

        this.pushSystemMessage(`Unknown command "${cmd}".`);
    }
    _resolveStageNameToCode(query) {
        const needle = query.trim().toLowerCase();
        if (!needle) return null;
        const names = typeof LEVEL_NAMES !== 'undefined' ? LEVEL_NAMES : [];
        let idx = names.findIndex(n => n && n.toLowerCase() === needle);
        if (idx === -1) idx = names.findIndex(n => n && n.toLowerCase().startsWith(needle));
        if (idx === -1) idx = names.findIndex(n => n && n.toLowerCase().includes(needle));
        return idx !== -1 ? LEVEL_POOL[idx] : null;
    }

    pushSystemMessage(text) {
        this.chatMessages.push({
            seatIndex: -1,
            name: 'System',
            color: THEME.accent,
            text,
            expiresAt: performance.now() + this.CHAT_MESSAGE_DURATION_MS
        });
        if (this.chatMessages.length > this.CHAT_MAX_HISTORY) {
            this.chatMessages.splice(0, this.chatMessages.length - this.CHAT_MAX_HISTORY);
        }
    }

    handleColorUpdated(payload) {
        if (!payload) return;
        const player = this.players[payload.seatIndex];
        if (!player) return;
        const hue = Math.round(Number(payload.hue));
        if (!Number.isFinite(hue)) return;
        player.hue = hue;
        player.color = hueShiftToHex(hue);
    }

    handleLoginResult(payload) {
        const success = !!(payload && payload.success);
        this.isAdmin = success;
        if (success) {
            this.pushSystemMessage('Logged in as admin.');
        } else if (payload && payload.reason === 'too_many_attempts') {
            this.pushSystemMessage('Too many login attempts - try again later.');
        } else {
            this.pushSystemMessage('Incorrect password.');
        }
        if (success && this.onAdminChanged) this.onAdminChanged(this.isAdmin);
    }

    handleScoreAdjusted(payload) {
        if (!payload) return;
        const player = this.players[payload.seatIndex];
        if (!player) return;
        if (typeof payload.totalScore === 'number') {
            player.score = payload.totalScore;
        } else if (typeof payload.delta === 'number') {
            player.score = Math.max(0, (player.score || 0) + payload.delta);
        }
    }

    handleLivesAdjusted(payload) {
        if (!payload) return;
        const player = this.players[payload.seatIndex];
        if (!player) return;
        if (typeof payload.totalLives === 'number') {
            player.livesRemaining = payload.totalLives;
        } else if (typeof payload.delta === 'number') {
            player.livesRemaining = Math.max(0, (player.livesRemaining || 0) + payload.delta);
        }
    }

    handleChatMessage(payload) {
        if (!payload) return;
        const player = this.players[payload.seatIndex];
        const color = (player && player.color) || hueShiftToHex(payload.hue || 0);
        this.chatMessages.push({
            seatIndex: payload.seatIndex,
            name: payload.name || (player ? player.name : '???'),
            color,
            text: payload.text || '',
            expiresAt: performance.now() + this.CHAT_MESSAGE_DURATION_MS
        });
        if (this.chatMessages.length > this.CHAT_MAX_HISTORY) {
            this.chatMessages.splice(0, this.chatMessages.length - this.CHAT_MAX_HISTORY);
        }
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
                stageCursor: -1, 
                stageVoteLocked: false,
                stageStandStartTime: null,
                partyCursor: 0,
                piece: null,
                buildCursor: { col: 0, row: 0 },
                buildRotation: 0,
                buildPlaced: false,
                score: 0,
                scoreBeforeRound: 0,
                lastRoundPoints: 0,
                lastRoundBreakdown: { goal: 0, firstPlace: 0, comeback: 0, solo: 0, postmortem: 0 },
                scoreBreakdown: { goal: 0, firstPlace: 0, comeback: 0, solo: 0, postmortem: 0 },
                breakdownBeforeRound: { goal: 0, firstPlace: 0, comeback: 0, solo: 0, postmortem: 0 },
                pointHistory: [],
                historyBeforeRound: [],
                lastRoundEntries: [],
                eliminated: false,
                hasFinished: false,
                finishedPostmortem: false,
                dnf: false,
                finishTick: null,
                reportedFinish: false,
                reportedElimination: false,
                livesRemaining: this.settings ? this.settings.lives : 1
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
        const thumbPad = 12;
        const thumbW = boxWidth - thumbPad * 2;
        const thumbH = thumbW * STAGE_PREVIEW_ASPECT;
        const titleGap = 24; 
        const bottomMargin = 20; 
        return thumbPad + thumbH + titleGap + bottomMargin;
    }
    enterStageSelect() {
        this.stageCandidates = this.pickStageCandidates();
        this.gameState = GameState.STAGE_SELECT;
        this.setupStageSelectArena();
    }
    generateStageVoteZones() {
        const spots = this.STAGE_VOTE_ZONES;
        this.stageVoteZones = this.stageCandidates.map((code, i) => spots[i % spots.length]);
    }
    setupStageSelectArena() {
        this.loadLevel(STAGE_VOTE_ARENA_LEVEL_CODE);
        this.generateStageVoteZones();

        const spawnWorld = this.buildCellToWorld(this.getSpawnCell());
        this.players.forEach((p, i) => {
            p.stageCursor = -1;
            p.stageVoteLocked = false;
            p.stageStandStartTime = null;
            if (p.physicsState) {
                p.physicsState.PLAYER_X = spawnWorld.x + (i - (this.players.length - 1) / 2) * 24;
                p.physicsState.PLAYER_Y = spawnWorld.y;
            }
        });
        this.stageCountdownActive = false;
        this.stageCountdownStart = null;
        this.stageCountdownDuration = STAGE_VOTE_STAND_SECONDS * 1000;

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
    getStageSelectInputKeysFor(player) {
        if (!player.controls) return "";
        let keys = '';
        if (player.controls.right.some(k => this.keys[k])) keys += 'D';
        if (player.controls.left.some(k => this.keys[k])) keys += 'A';
        if (player.controls.down.some(k => this.keys[k])) keys += 'S';
        if (player.controls.up.some(k => this.keys[k])) keys += 'W';
        return keys;
    }
    updateStageSelectPhysics() {
        const firstPlayer = this.players[0];
        if (!this.physics || !firstPlayer || !firstPlayer.physicsState) return;
        this.physics.tickObj(firstPlayer.physicsState.OBJ);

        this.players.forEach(player => {
            if (!player.physicsState) return;
            const isRemoteNetworked = this.network && !player.controls;

            if (isRemoteNetworked) {
                const pos = this.remotePositions.get(player.seatIndex);
                if (pos) {
                    player.physicsState.PLAYER_X = pos.x;
                    player.physicsState.PLAYER_Y = pos.y;
                    player.physicsState.PLAYER_SX = pos.sx;
                    player.physicsState.PLAYER_SY = pos.sy;
                    if (pos.direction !== undefined) player.physicsState.direction = pos.direction;
                    if (pos.dir !== undefined) player.physicsState.PLAYER_DIR = pos.dir;
                    player.physicsState.player_state = pos.crouched ? 2 : 0;
                    player.physicsState.player_wall = pos.onWall ? 1 : null;
                }
                return;
            }

            const keys = this.getStageSelectInputKeysFor(player);
            player.physicsState = this.physics.tick(player.physicsState, keys);

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
        });

        this.physics.tickWorldActive(this.players.map(p => p.physicsState), this.players.map(p => p.physicsState));
        this.physics.tileUpdates.length = 0; 

        this.updateStageVoteProgress();
        this.updateRaceCamera();
        this.tick += 1;
    }
    updateStageVoteProgress() {
        const zones = this.stageVoteZones || [];
        this.players.forEach(player => {
            if (!player.controls || !player.physicsState) return;

            const px = player.physicsState.PLAYER_X;
            const py = player.physicsState.PLAYER_Y;
            let zoneIndex = -1;
            for (let i = 0; i < zones.length; i++) {
                const dx = Math.abs(px - zones[i].x);
                const dy = Math.abs(py - zones[i].y);
                if (dx <= STAGE_VOTE_ZONE_WIDTH / 2 && dy <= STAGE_VOTE_ZONE_DEPTH / 2) { zoneIndex = i; break; }
            }

            const isMoving = Math.abs(player.physicsState.PLAYER_SX || 0) > STAGE_VOTE_MOVE_TOLERANCE;
            if (isMoving) zoneIndex = -1;

            if (zoneIndex !== player.stageCursor) {
                player.stageCursor = zoneIndex;
                player.stageStandStartTime = zoneIndex === -1 ? null : performance.now();
                if (this.network) this.network.sendStageCursorMove(zoneIndex);
            }
        });
        if (!this.network) this.updateOfflineStageCountdown();
    }
    updateOfflineStageCountdown() {
        const controlledPlayers = this.players.filter(p => p.controls);
        const allStanding = controlledPlayers.length > 0 && controlledPlayers.every(p => p.stageCursor !== -1);

        if (allStanding) {
            if (!this.stageCountdownActive) {
                this.stageCountdownActive = true;
                this.stageCountdownStart = performance.now();
            }
            const elapsed = performance.now() - this.stageCountdownStart;
            if (elapsed >= this.stageCountdownDuration) {
                this.stageCountdownActive = false;
                if (typeof playSfx === 'function') playSfx('select');
                const localPlayer = this.players[this.localSeatIndex];
                this.confirmStageSelection(localPlayer ? localPlayer.stageCursor : 0);
            }
        } else if (this.stageCountdownActive) {
            this.stageCountdownActive = false;
            this.stageCountdownStart = null;
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
        
        const slots = pickWeightedPieces(pool, count);

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
        return ((fromIndex + direction) % n + n) % n;
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
            p.finishedPostmortem = false;
            p.dnf = false;
            p.finishTick = null;
            p.reportedFinish = false;
            p.reportedElimination = false;
            p.livesRemaining = this.settings.lives;
            p.respawnPendingFrames = 0;
            if (p.physicsState) {
                p.physicsState = this.physics.createDefaultGameState(sharedOBJ);
            }
        });

        this.remotePositions.clear();
        this.remoteSfxState.clear();
    }
    respawnPlayer(player) {
        if (!player || !player.physicsState || !this.physics) return;
        const sharedOBJ = player.physicsState.OBJ;
        const oldState = player.physicsState;
        if (oldState.activeIdx && oldState.activeTyp) {
            for (let i = 0; i < oldState.activeIdx.length; i++) {
                if (oldState.activeTyp[i] !== 'spring') continue;
                const idx = oldState.activeIdx[i];

                const stillAnimatedElsewhere = this.players.some(p => {
                    if (p === player || !p.physicsState || p.physicsState === oldState) return false;
                    const ps = p.physicsState;
                    return ps.activeIdx && ps.activeIdx.some((otherIdx, j) => otherIdx === idx && ps.activeTyp[j] === 'spring');
                });

                if (!stillAnimatedElsewhere) {
                    this.physics.MAP[idx] = 42;
                    this.physics.tileUpdates.push({ idx, tile: 42 });
                }
            }
        }

        player.physicsState = this.physics.createDefaultGameState(sharedOBJ);
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
            p.lastRoundBreakdown = { goal: 0, firstPlace: 0, comeback: 0, solo: 0, postmortem: 0 };
            p.scoreBreakdown = { goal: 0, firstPlace: 0, comeback: 0, solo: 0, postmortem: 0 };
            p.breakdownBeforeRound = { goal: 0, firstPlace: 0, comeback: 0, solo: 0, postmortem: 0 };
            p.pointHistory = [];
            p.historyBeforeRound = [];
            p.lastRoundEntries = [];
            p.physicsState = null;
            p.eliminated = false;
            p.hasFinished = false;
            p.finishedPostmortem = false;
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
    _runWhenAssetsReady(fn) {
        if (this.assetsLoadedCount >= this.totalAssets) {
            fn();
        } else {
            this._deferredAssetCallbacks.push(fn);
        }
    }

    checkLoadStatus() {
        if (this.assetsLoadedCount < this.totalAssets) return;

        if (this._deferredAssetCallbacks.length) {
            const callbacks = this._deferredAssetCallbacks;
            this._deferredAssetCallbacks = [];
            callbacks.forEach(cb => cb());
        }

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
    getInputKeysFor(player) {
        if (this.gameState !== GameState.RACE) return "";
        if (player.hasFinished || player.eliminated) return ""; 
        if (!player.controls) return ""; 
        if (player.respawnPendingFrames > 0) return "";

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
            if (player.respawnPendingFrames > 0) {
                player.respawnPendingFrames -= 1;
                if (player.respawnPendingFrames <= 0 && !player.hasFinished) {
                    this.respawnPlayer(player);
                }
            }
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
                if (localPlayer.physicsState.PLAYER_DEATH && !localPlayer.hasFinished && !localPlayer.eliminated && !localPlayer.reportedElimination && !(localPlayer.respawnPendingFrames > 0)) {
                    if ((localPlayer.livesRemaining || 1) > 1) {
                        localPlayer.livesRemaining -= 1;
                        localPlayer.respawnPendingFrames = this.RESPAWN_DELAY_FRAMES;
                        if (typeof playSfx === 'function') playSfx('boom');
                        this.network.sendRespawnObserved(this.tick);
                    } else {
                        localPlayer.reportedElimination = true;
                        this.network.sendEliminationObserved(this.localSeatIndex, this.tick, 'death');
                    }
                }
            }
            for (const player of this.players) {
                if (!player.hasFinished && !player.reportedFinish && player.physicsState &&
                    this.physics.isFlagAt(player.physicsState.PLAYER_X, player.physicsState.PLAYER_Y)) {
                    const postmortem = player.respawnPendingFrames > 0;
                    player.reportedFinish = true;
                    player.respawnPendingFrames = 0;
                    this.network.sendFinishObserved(player.seatIndex, this.tick, postmortem);
                }
            }
            return;
        }
        for (const player of this.players) {
            if (player.physicsState.PLAYER_DEATH && !player.hasFinished && !player.eliminated && !(player.respawnPendingFrames > 0)) {
                if ((player.livesRemaining || 1) > 1) {
                    player.livesRemaining -= 1;
                    player.respawnPendingFrames = this.RESPAWN_DELAY_FRAMES;
                    if (typeof playSfx === 'function') playSfx('boom');
                } else {
                    console.log(`${player.name} died!`);
                    if (typeof playSfx === 'function') playSfx('boom');
                    player.eliminated = true;
                }
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
                player.finishedPostmortem = player.respawnPendingFrames > 0;
                player.respawnPendingFrames = 0;
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

        let active = this.players.filter(p => p && p.connected !== false && !p.eliminated && !p.hasFinished && p.physicsState);
        const roundWrappingUp = active.length === 0;
        if (roundWrappingUp) active = this.players.filter(p => p && p.connected !== false && p.physicsState);
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
        const PADDING_X = 160; 
        const PADDING_Y = 80;  
        
        const boxW = Math.max(maxX - minX, 1);
        const boxH = Math.max(maxY - minY, 1);
        
        const zoomToFitX = Math.max(0, this.canvas.width - PADDING_X * 2) / boxW;
        const zoomToFitY = Math.max(0, this.canvas.height - PADDING_Y * 2) / boxH;
        const fitZoom = Math.min(zoomToFitX, zoomToFitY);

        const MAX_ZOOM = 1;
        const ZOOM_EPSILON = 0.05;
        const targetZoom = Math.max(ZOOM_EPSILON, Math.min(MAX_ZOOM, fitZoom));
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
        const WITHIN_ROUND_ORDER = ['goal', 'firstPlace', 'solo', 'comeback', 'postmortem'];
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
        const allFinishers = this.players
            .filter(p => p.hasFinished)
            .sort((a, b) => a.finishTick - b.finishTick);
        const finishers = allFinishers.filter(p => !p.eliminated && !p.finishedPostmortem);
        const postmortemFinishers = allFinishers.filter(p => p.eliminated || p.finishedPostmortem);
        const POSTMORTEM_POINTS = 2;

        const totalPlayers = this.players.filter(p => p !== null).length;
        const tooEasy = totalPlayers > 0 && finishers.length === totalPlayers;
        const tooHard = finishers.length === 0;

        const COMEBACK_SCORE_GAP = 5;
        const leaderScore = Math.max(0, ...this.players.filter(p => p !== null).map(p => p.score));

        this.players.forEach(p => {
            if (!p) return;
            p.lastRoundPoints = 0;
            p.lastRoundBreakdown = { goal: 0, firstPlace: 0, comeback: 0, solo: 0, postmortem: 0 };
            p.historyBeforeRound = [...p.pointHistory];
            p.lastRoundEntries = [];
        });

        if (!tooHard) {
            finishers.forEach((player, i) => {
                const breakdown = { goal: 0, firstPlace: 0, comeback: 0, solo: 0, postmortem: 0 };

                if (!tooEasy) {
                    breakdown.goal = 3;

                    if (finishers.length === 1) breakdown.solo = 2;
                    else if (i === 0) breakdown.firstPlace = 1;

                    const behindBy = leaderScore - player.score;
                    if (behindBy >= COMEBACK_SCORE_GAP) breakdown.comeback = 2;
                } else if (i === 0 && finishers.length > 1) {
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

        postmortemFinishers.forEach(player => {
            const breakdown = { goal: 0, firstPlace: 0, comeback: 0, solo: 0, postmortem: POSTMORTEM_POINTS };
            player.lastRoundBreakdown = breakdown;
            player.lastRoundPoints = POSTMORTEM_POINTS;
            player.scoreBreakdown.postmortem = (player.scoreBreakdown.postmortem || 0) + POSTMORTEM_POINTS;
            this.pushPointHistoryEntries(player, breakdown);
        });

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
            if (player.connected === false) continue;

            const playerPos = {
                x: player.physicsState.PLAYER_X,
                y: player.physicsState.PLAYER_Y,
                angle: player.physicsState.direction,
                crouched: player.physicsState.player_state === 2,
                onWall: player.physicsState.player_wall != null,
                dir: player.physicsState.PLAYER_DIR
            };

            const isRespawning = player.respawnPendingFrames > 0;
            const status = player.eliminated ? 'dead' : (player.hasFinished ? 'won' : (isRespawning ? 'respawning' : null));
            this.renderer.renderPlayer(playerPos, this.camera, player.hue, player.name, player.color, status);
        }

        this.renderer.renderDynamic(firstPlayer.physicsState.OBJ, this.camera);
    }
    _wrapChatMessage(ctx, nameWidth, bodyText, maxWidth) {
        const words = bodyText.split(' ');
        const lines = [];
        let current = '';
        let isFirst = true;

        const pushLine = () => {
            lines.push({ text: current, isFirst });
            current = '';
            isFirst = false;
        };

        for (const word of words) {
            let remainingWord = word;
            while (remainingWord.length > 0) {
                const limit = isFirst ? Math.max(20, maxWidth - nameWidth) : maxWidth;
                const test = current ? `${current} ${remainingWord}` : remainingWord;
                if (ctx.measureText(test).width <= limit) {
                    current = test;
                    remainingWord = '';
                    break;
                }
                if (!current) {
                    let cut = remainingWord.length;
                    while (cut > 1 && ctx.measureText(remainingWord.slice(0, cut)).width > limit) {
                        cut -= 1;
                    }
                    current = remainingWord.slice(0, cut);
                    remainingWord = remainingWord.slice(cut);
                    pushLine();
                } else {
                    pushLine();
                }
            }
        }
        lines.push({ text: current, isFirst });
        return lines;
    }

    drawChat() {
        const ctx = this.ctx;
        const now = performance.now();

        const padX = 20;
        const lineHeight = 22;
        const fadeWindow = 1000; 
        const inputBoxHeight = lineHeight + 6;
        const inputBoxGap = 13; 
        const maxLineWidth = Math.max(120, this.canvas.width - padX * 2 - 16);

        ctx.save();
        ctx.font = `bold 15px ${THEME.font}`;
        ctx.textBaseline = 'alphabetic';
        ctx.textAlign = 'left'; 
        let y = this.canvas.height - 20 - (this.chatOpen ? inputBoxHeight + inputBoxGap : 0);
        let visible;
        if (this.chatOpen) {
            const maxOffset = Math.max(0, this.chatMessages.length - 1);
            this.chatScrollOffset = Math.max(0, Math.min(maxOffset, this.chatScrollOffset));
            const endIdx = this.chatMessages.length - this.chatScrollOffset;
            visible = this.chatMessages.slice(0, endIdx);
        } else {
            visible = this.chatMessages.filter(m => m.expiresAt > now).slice(-this.CHAT_MAX_VISIBLE);
        }

        for (let i = visible.length - 1; i >= 0; i--) {
            const msg = visible[i];
            const remaining = msg.expiresAt - now;
            const alpha = this.chatOpen ? 1 : Math.max(0, Math.min(1, remaining / fadeWindow));
            if (alpha <= 0) continue;

            ctx.globalAlpha = alpha;
            const nameText = `${msg.name}: `;
            const nameWidth = ctx.measureText(nameText).width;
            const wrapped = this._wrapChatMessage(ctx, nameWidth, msg.text, maxLineWidth);

            for (let li = wrapped.length - 1; li >= 0; li--) {
                const line = wrapped[li];
                const lineX = padX + (line.isFirst ? nameWidth : 0);
                const lineWidth = ctx.measureText(line.text).width;
                const boxWidth = (line.isFirst ? nameWidth : 0) + lineWidth + padX;
                const boxX = padX - 8;

                ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
                ctx.fillRect(boxX, y - lineHeight + 5, boxWidth, lineHeight);

                if (line.isFirst) {
                    ctx.fillStyle = msg.color || THEME.text;
                    ctx.fillText(nameText, padX, y);
                }
                ctx.fillStyle = THEME.text;
                ctx.fillText(line.text, lineX, y);

                y -= lineHeight;
            }
            if (y < 20) break; 
        }
        ctx.globalAlpha = 1;

        if (!this.chatOpen) {
            ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
            ctx.font = `12px ${THEME.font}`;
            ctx.fillText('Press T to chat', padX, this.canvas.height - 6);
            ctx.font = `bold 15px ${THEME.font}`;
        }

        if (this.chatOpen && this.chatScrollOffset > 0) {
            ctx.fillStyle = THEME.accent;
            ctx.font = `12px ${THEME.font}`;
            ctx.fillText(`▲ scrolled up ${this.chatScrollOffset} - scroll down to catch up`, padX, y - 4);
            ctx.font = `bold 15px ${THEME.font}`;
        }

        if (this.chatOpen) {
            const boxY = this.canvas.height - 20 - lineHeight + 5;
            const label = 'Chat: ';
            const inputFont = `bold 15px ${THEME.font}`;
            ctx.font = inputFont;
            const labelWidth = ctx.measureText(label).width;
            const textStartX = padX + labelWidth;
            const fullText = label + this.chatInputText;
            const boxWidth = Math.max(160, ctx.measureText(fullText).width + padX + 6);

            ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
            ctx.fillRect(padX - 8, boxY - lineHeight + 5, boxWidth, inputBoxHeight);
            ctx.strokeStyle = THEME.panelBorderActive;
            ctx.lineWidth = 1.5;
            ctx.strokeRect(padX - 8, boxY - lineHeight + 5, boxWidth, inputBoxHeight);
            this._chatInputBox = {
                x: padX - 8,
                width: boxWidth,
                textStartX,
                font: inputFont
            };
            const hasSelection = this.chatSelectionAnchor !== null && this.chatSelectionAnchor !== this.chatCursorPos;
            if (hasSelection) {
                const selStart = Math.min(this.chatSelectionAnchor, this.chatCursorPos);
                const selEnd = Math.max(this.chatSelectionAnchor, this.chatCursorPos);
                const startX = textStartX + ctx.measureText(this.chatInputText.slice(0, selStart)).width;
                const endX = textStartX + ctx.measureText(this.chatInputText.slice(0, selEnd)).width;
                ctx.fillStyle = 'rgba(90, 160, 255, 0.4)';
                ctx.fillRect(startX, boxY - lineHeight + 6, Math.max(1, endX - startX), lineHeight - 2);
            }

            ctx.textAlign = 'left';
            ctx.fillStyle = THEME.accent;
            ctx.fillText(label, padX, boxY);
            ctx.fillStyle = THEME.text;
            ctx.fillText(this.chatInputText, textStartX, boxY);
            const typedWidth = ctx.measureText(this.chatInputText).width;
            if (this.chatCursorPos === this.chatInputText.length) {
                const info = this._chatAutocompleteMatch();
                if (info && info.matches.length > 0) {
                    const top = info.matches[0];
                    const ghost = top.slice(info.query.length);
                    if (ghost) {
                        ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
                        ctx.fillText(ghost, textStartX + typedWidth, boxY);
                    }
                    ctx.font = `11px ${THEME.font}`;
                    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
                    const hint = info.matches.length > 1
                        ? `Tab to complete (${info.matches.length} matches)`
                        : 'Tab to complete';
                    ctx.fillText(hint, padX, boxY + 15);
                    ctx.font = inputFont;
                }
            }
            const idleFor = now - this._chatCaretActivityAt;
            const blinkOn = idleFor < 500 || (Math.floor((idleFor - 500) / 500) % 2 === 0);
            if (blinkOn) {
                const caretX = textStartX + ctx.measureText(this.chatInputText.slice(0, this.chatCursorPos)).width;
                ctx.strokeStyle = THEME.text;
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(caretX, boxY - lineHeight + 7);
                ctx.lineTo(caretX, boxY + 3);
                ctx.stroke();
            }
        } else {
            this._chatInputBox = null;
        }
        ctx.restore();
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
                ctx.lineJoin = 'round';
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
        if (this.gameState !== GameState.STAGE_SELECT && (this.settingsMenuOpen || this.colorPickerOpen)) {
            this.settingsMenuOpen = false;
            this.colorPickerOpen = false;
        }
        switch (this.gameState) {
            case GameState.RACE:
                this.raceLoop();
                break;

            case GameState.STAGE_SELECT:
                this.stageSelectLoop();
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

        this.drawChat();
        this.drawGlobalHints();
        this.drawHelpMenu();
    }

    raceLoop() {
        if (this.gameState === GameState.RACE) {
            this.raceTimeRemaining = Math.max(0, this.raceTimeRemaining - (1 / 30));
        }

        this.update();
        this.updateGiveUpHold();

        if (this.levelData) {
            this.renderer.render(this.levelData, this.camera, this.tick);
        }

        this.drawEntities();
        this.drawOffscreenIndicators();

        this.drawRaceTimer();
        this.drawLivesIndicator();
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
        player.livesRemaining = 0; 
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
    drawLivesIndicator() {
        if (this.gameState !== GameState.RACE) return;
        if ((this.settings.lives || 1) <= 1) return;
        const player = this.players.find(p => p && p.controls);
        if (!player || !this.renderer) return;

        const sprite = this.renderer.getHuedPlayerSprite(player.hue);
        if (!sprite || !sprite.normal) return;

        const extraLives = Math.max(0, (player.livesRemaining || 0) - 1);
        if (extraLives <= 0) return;

        const iconHeight = 24;
        const aspect = (sprite.normal.width && sprite.normal.height)
            ? sprite.normal.width / sprite.normal.height
            : (24 / 32);
        const iconWidth = iconHeight * aspect;
        const spacing = iconWidth + 6;
        const x = 24;
        const y = 24;

        this.ctx.save();
        for (let i = 0; i < extraLives; i++) {
            this.ctx.drawImage(sprite.normal, x + i * spacing, y, iconWidth, iconHeight);
        }
        this.ctx.restore();
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
            this.renderer.render(this.levelData, this.camera, this.tick);
        }
        this.drawBuildScreen();
    }

    updateBuildCamera() {
        const activePlayers = this.players.filter(p => p && p.connected !== false);
        const source = activePlayers.length ? activePlayers : this.players;
        const worlds = source.map(p => this.buildCellToWorld(p.buildCursor));
        const xs = worlds.map(w => w.x);
        const ys = worlds.map(w => w.y);

        const targetX = xs.reduce((a, b) => a + b, 0) / xs.length;
        const targetY = ys.reduce((a, b) => a + b, 0) / ys.length;

        const minX = Math.min(...xs), maxX = Math.max(...xs);
        const minY = Math.min(...ys), maxY = Math.max(...ys);
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
    worldToScreen(x, y) {
        return {
            x: this.canvas.width / 2 + this.camera.zoom * (x - this.camera.x),
            y: this.canvas.height / 2 + this.camera.zoom * (this.camera.y - y)
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
        this.drawCountdownRing(this.buildTimeRemaining, this.BUILD_TIME_LIMIT, "#000000");

        for (const player of this.players) {
            if (player.connected !== false && player.piece) {
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
    drawSelectionOutlines(x, y, width, height, radius, playersHere, lockedField) {
        const RING_GAP = 4;
        playersHere.forEach((player, i) => {
            const locked = lockedField ? !!player[lockedField] : false;
            const inset = i * RING_GAP;
            this.roundRectPath(x - inset, y - inset, width + inset * 2, height + inset * 2, radius + inset);
            this.ctx.strokeStyle = locked ? THEME.textMuted : player.color;
            this.ctx.lineWidth = locked ? 1.5 : 2.5;
            this.ctx.globalAlpha = locked ? 0.6 : 1;
            this.ctx.stroke();
            this.ctx.globalAlpha = 1;
        });
    }
    drawCursorChips(cursorField, itemIndex, cx, boxY, lockedField = null) {
        const here = this.players.filter(p => p && p.connected !== false && p[cursorField] === itemIndex);
        if (here.length === 0) return;

        const chipHeight = 15;
        const gap = 2;
        const startY = boxY - 10 - here.length * (chipHeight + gap);

        this.ctx.font = "bold 11px " + THEME.font;
        here.forEach((player, i) => {
            const y = startY + i * (chipHeight + gap);
            const locked = lockedField && player[lockedField];
            this.ctx.fillStyle = locked ? THEME.textMuted : player.color;
            this.ctx.fillText(locked ? `${player.name} ✓` : `${player.name} ▲`, cx, y);
        });
    }
    drawPartyStatusList(baseY) {
        const activePlayers = this.players.filter(p => p && p.connected !== false);
        const columns = activePlayers.length > 3 ? 2 : 1;
        const rowHeight = 20;
        const colWidth = 240;
        const startX = this.canvas.width / 2 - (columns * colWidth) / 2 + colWidth / 2;

        this.ctx.font = "14px " + THEME.font;
        activePlayers.forEach((player, i) => {
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
        const y = 60; 

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
            const playersHere = this.players.filter(p => p && p.connected !== false && p.partyCursor === i);

            this.roundRectPath(cx - boxWidth / 2, boxY, boxWidth, boxHeight, 10);
            this.ctx.fillStyle = piece ? THEME.panel : 'rgba(255,255,255,0.02)';
            this.ctx.fill();
            this.ctx.strokeStyle = THEME.panelBorder;
            this.ctx.lineWidth = 1.5;
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

            this.drawSelectionOutlines(cx - boxWidth / 2, boxY, boxWidth, boxHeight, 10, playersHere, 'piece');

            this.drawCursorChips('partyCursor', i, cx, boxY, 'piece');
        });

        this.drawPartyStatusList(boxY + boxHeight + 45);
    }
    stageSelectLoop() {
        this.updateStageSelectPhysics();

        if (this.levelData) {
            this.renderer.render(this.levelData, this.camera, this.tick);
        }
        this.drawStageVoteZones();
        this.drawEntities();
        this.drawStageSelectHud();
        this.drawStageVoteTimer();
        this.drawHubMenuHints();
        this.drawSettingsMenu();
        this.drawColorPicker();
    }
    drawStageSelectHud() {
        this.ctx.textAlign = "center";
        this.ctx.font = "bold 26px " + THEME.font;
        this.ctx.lineWidth = 4;
        this.ctx.lineJoin = 'round';
        this.ctx.strokeStyle = 'rgba(0, 0, 0, 0.75)';
        this.ctx.strokeText('Stand on the stage you want!', this.canvas.width / 2, 44);
        this.ctx.fillStyle = THEME.text;
        this.ctx.fillText('Stand on the stage you want!', this.canvas.width / 2, 44);

        this.ctx.font = "13px " + THEME.font;
        this.ctx.textAlign = 'center';
        const subtitle = `Everyone must stand still on a stage. The countdown starts once all players are ready.`;
        this.ctx.lineWidth = 3;
        this.ctx.lineJoin = 'round';
        this.ctx.strokeStyle = 'rgba(0, 0, 0, 0.75)';
        this.ctx.strokeText(subtitle, this.canvas.width / 2, 66);
        this.ctx.fillStyle = THEME.textMuted;
        this.ctx.fillText(subtitle, this.canvas.width / 2, 66);
    }
    drawStageVoteZones() {
        const zones = this.stageVoteZones || [];
        const candidates = this.stageCandidates || [];
        const ctx = this.ctx;

        ctx.save();
        zones.forEach((zone, i) => {
            const code = candidates[i];
            if (!code) return;
            const screen = this.worldToScreen(zone.x, zone.y);

            const boxWidth = 200 * this.camera.zoom;
            const thumbH = boxWidth * STAGE_PREVIEW_ASPECT;
            const thumbX = screen.x - boxWidth / 2;
            const thumbY = screen.y - thumbH + 18;

            const levelIndex = LEVEL_POOL.indexOf(code);
            const levelTitle = (levelIndex !== -1 && LEVEL_NAMES[levelIndex]) ? LEVEL_NAMES[levelIndex] : `Stage ${i + 1}`;
            ctx.fillStyle = '#000000';
            ctx.font = `${13 * this.camera.zoom}px ` + THEME.font;
            ctx.textAlign = 'center';
            ctx.fillText(levelTitle, screen.x, thumbY - 8 * this.camera.zoom);

            const thumb = this.generateStageThumbnail(code, boxWidth, thumbH);
            ctx.save();
            ctx.imageSmoothingEnabled = true;
            this.roundRectPath(thumbX, thumbY, boxWidth, thumbH, Math.min(8 * this.camera.zoom, boxWidth / 2, thumbH / 2));
            ctx.clip();
            ctx.drawImage(thumb, thumbX, thumbY, boxWidth, thumbH);
            ctx.restore();

        });
        ctx.restore();
    }
    drawStageVoteTimer() {
        if (!this.stageCountdownActive || this.stageCountdownStart == null) return;

        const elapsed = performance.now() - this.stageCountdownStart;
        const remaining = Math.max(0, (this.stageCountdownDuration - elapsed) / 1000);
        const remainingLabel = String(Math.ceil(remaining));

        const localPlayer = this.players[this.localSeatIndex];
        const levelIndex = localPlayer && localPlayer.stageCursor !== -1
            ? LEVEL_POOL.indexOf(this.stageCandidates[localPlayer.stageCursor])
            : -1;
        const levelTitle = (levelIndex !== -1 && LEVEL_NAMES[levelIndex]) ? LEVEL_NAMES[levelIndex] : null;

        const ctx = this.ctx;
        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        ctx.font = `bold 96px ${THEME.font}`;
        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.fillText(remainingLabel, this.canvas.width / 2 + 4, this.canvas.height / 2 + 4);
        ctx.fillStyle = THEME.accent;
        ctx.fillText(remainingLabel, this.canvas.width / 2, this.canvas.height / 2);

        ctx.font = `18px ${THEME.font}`;
        ctx.fillStyle = 'rgb(0, 0, 0)';
        const captionText = levelTitle ? `Voting for ${levelTitle}` : 'Everyone is ready - locking in a stage';
        ctx.fillText(captionText, this.canvas.width / 2, this.canvas.height / 2 + 70);
        ctx.restore();
    }
    easeOutCubic(t) {
        const clamped = Math.max(0, Math.min(1, t));
        return 1 - Math.pow(1 - clamped, 3);
    }
    getRoundResultLabel(player) {
        if (!player) return { text: '-', color: THEME.textMuted };
        if (player.hasFinished && (player.eliminated || player.finishedPostmortem)) return { text: 'Postmortem', color: THEME.pointColors.postmortem };
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

        const allPlayersForCheck = this.players.filter(p => p !== null && p.connected !== false);
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

        const activePlayers = this.players.filter(p => p !== null && p.connected !== false);
        const n = Math.max(activePlayers.length, 1);
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

        const POINT_SOURCE_ORDER = ['goal', 'firstPlace', 'solo', 'comeback', 'postmortem'];
        const FALLBACK_COLORS = ['#ff4757', '#2ed573', '#ffa502', '#1e90ff', '#ff6b81', '#00d2d3', '#a4b0be', '#3742fa'];
        let currentY = chartTop;
        
        this.players.forEach((player, index) => {
            if (!player || player.connected === false) return;

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

            const totalCleared = activePlayers.filter(p => p.hasFinished && !p.eliminated && !p.finishedPostmortem).length;
            const anyPostmortem = activePlayers.some(p => p.hasFinished && (p.eliminated || p.finishedPostmortem));

            if (totalCleared === 0 && !anyPostmortem) {
                globalSplashText = "NO POINTS - TOO HARD!";
            } else if (totalCleared === activePlayers.length) {
                globalSplashText = (totalCleared > 1)
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
        net.onColorUpdated = (payload) => this.handleColorUpdated(payload);
        net.onLoginResult = (payload) => this.handleLoginResult(payload);
        net.onScoreAdjusted = (payload) => this.handleScoreAdjusted(payload);
        net.onLivesAdjusted = (payload) => this.handleLivesAdjusted(payload);
        net.onJoinRejected = (payload) => {
            console.warn('[network] join rejected:', payload.reason);
            if (this.onJoinRejected) this.onJoinRejected(payload); 
        };

        net.onMatchStarting = (payload) => {
            this.gameState = GameState.LOADING;
            if (payload && payload.settings) {
                this.settings = { ...this.settings, ...payload.settings };
            }
            this.totalRounds = this.settings.totalRounds;
            this.POINTS_TO_WIN = this.settings.pointsToWin;
            this.RACE_TIME_LIMIT = this.settings.raceTimeLimit;
            this.MAX_POSSIBLE_SCORE = this.totalRounds * 3;
        };
        net.onAllClientsReady = () => {
        };
        net.onSettingsUpdated = (payload) => {
            if (payload && payload.settings) {
                this.settings = { ...this.settings, ...payload.settings };
            }
            this.totalRounds = this.settings.totalRounds;
            this.POINTS_TO_WIN = this.settings.pointsToWin;
            this.RACE_TIME_LIMIT = this.settings.raceTimeLimit;
            this.MAX_POSSIBLE_SCORE = this.totalRounds * 3;
            if (this.onSettingsUpdated) this.onSettingsUpdated(this.settings, this.isHost || this.isAdmin);
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
        net.onRespawnSync = (payload) => this.handleRespawnSync(payload);

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
            if (this.gameState === GameState.ROUND_RESULTS) {
                this.continueTotalConnected = this.players.filter(p => p && p.connected !== false).length;
            }
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
        net.onChatMessage = (payload) => this.handleChatMessage(payload);
        net.onKickRejected = (payload) => {
            const name = payload && payload.name ? payload.name : 'that player';
            this.pushSystemMessage(`Can't kick ${name} - admins are protected from being kicked.`);
        };
        net.onHostUpdated = (payload) => {
            if (payload && typeof payload.hostSeatIndex === 'number') this.applyHostSeatIndex(payload.hostSeatIndex);
        };
    }

    requestSetColor(hue) {
        if (this.network && this.network.isConnected) {
            this.network.sendSetColorRequest(hue);
        }
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
        if (payload.settings) {
            this.settings = { ...this.settings, ...payload.settings };
            this.totalRounds = this.settings.totalRounds;
            this.POINTS_TO_WIN = this.settings.pointsToWin;
            this.RACE_TIME_LIMIT = this.settings.raceTimeLimit;
            this.MAX_POSSIBLE_SCORE = this.totalRounds * 3;
        }

        const seats = payload.seats || [];
        const previousByIndex = new Map(this.players.map(p => [p.seatIndex, p]));
        const maxSeatIndex = seats.reduce((max, s) => Math.max(max, s.seatIndex), -1);
        this.playerCount = Math.max(MIN_PLAYERS, Math.min(MAX_PLAYERS, maxSeatIndex + 1));
        const rebuilt = this.createPlayers(this.playerCount, this.localSeatIndex);
        const presentSeatIndexes = new Set(seats.map(s => s.seatIndex));
        for (const player of rebuilt) {
            if (!presentSeatIndexes.has(player.seatIndex)) player.connected = false;
        }

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
                player.finishedPostmortem = previous.finishedPostmortem;
                player.eliminated = previous.eliminated;
                player.dnf = previous.dnf;
                player.finishTick = previous.finishTick;
                player.reportedFinish = previous.reportedFinish;
                player.reportedElimination = previous.reportedElimination;
                player.livesRemaining = previous.livesRemaining;
                player.respawnPendingFrames = previous.respawnPendingFrames;
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
        this.ensurePlayerPhysicsStates();
        if (this.onLobbyUpdate) this.onLobbyUpdate(payload, this.isHost || this.isAdmin);
        this.syncGameStateToPhase(phase);
    }
    ensurePlayerPhysicsStates() {
        if (!this.physics) return;
        const anyExisting = this.players.find(p => p && p.physicsState);
        if (!anyExisting) return;
        const sharedOBJ = anyExisting.physicsState.OBJ;
        for (const p of this.players) {
            if (p && !p.physicsState) {
                p.physicsState = this.physics.createDefaultGameState(sharedOBJ);
            }
        }
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

    requestUpdateSettings(partialSettings) {
        if (!this.network || !this.network.isConnected) return;
        this.network.sendUpdateSettingsRequest(partialSettings);
    }

    handleStageNetworkEvent(payload, type) {
        switch (type) {
            case 'STAGE_SELECT_START':
                this._runWhenAssetsReady(() => {
                    this.stageCandidates = payload.candidates || [];
                    this.gameState = GameState.STAGE_SELECT;
                    this.setupStageSelectArena();
                });
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
                    if (!payload.auto && typeof playSfx === 'function') playSfx('select');
                }
                break;
            }
            case 'STAGE_COUNTDOWN_START': {
                this.stageCountdownActive = true;
                this.stageCountdownStart = performance.now();
                this.stageCountdownDuration = payload.duration || (STAGE_VOTE_STAND_SECONDS * 1000);
                break;
            }
            case 'STAGE_COUNTDOWN_CANCEL': {
                this.stageCountdownActive = false;
                this.stageCountdownStart = null;
                break;
            }
            case 'STAGE_LOCKED': {
                if (typeof playSfx === 'function') playSfx('select');
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
                if (typeof payload.timeLimit === 'number') this.RACE_TIME_LIMIT = payload.timeLimit;
                if (typeof payload.lives === 'number') this.settings.lives = payload.lives;
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
        player.respawnPendingFrames = 0;
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
    handleRespawnSync(payload) {
        const player = this.players[payload && payload.seatIndex];
        if (!player || player.hasFinished || player.eliminated) return;
        if (player.controls) return; 
        player.respawnPendingFrames = this.RESPAWN_DELAY_FRAMES;
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
            player.lastRoundBreakdown = result.pointBreakdown || { goal: 0, firstPlace: 0, comeback: 0, solo: 0, postmortem: 0 };
            player.finishedPostmortem = (player.lastRoundBreakdown.postmortem || 0) > 0;
            player.scoreBreakdown.goal += player.lastRoundBreakdown.goal || 0;
            player.scoreBreakdown.firstPlace += player.lastRoundBreakdown.firstPlace || 0;
            player.scoreBreakdown.comeback += player.lastRoundBreakdown.comeback || 0;
            player.scoreBreakdown.solo += player.lastRoundBreakdown.solo || 0;
            player.scoreBreakdown.postmortem = (player.scoreBreakdown.postmortem || 0) + (player.lastRoundBreakdown.postmortem || 0);
            player.score = result.totalScore;
            this.pushPointHistoryEntries(player, player.lastRoundBreakdown);
        }
        this.currentRound = payload.round;
        this.roundResultsAnimFrames = 0;
        this.gameState = GameState.ROUND_RESULTS;
        this.localContinueConfirmed = false;
        this.continueConfirmedSeats = [];
        this.continueTotalConnected = this.players.filter(p => p && p.connected !== false).length;

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
            p.lastRoundBreakdown = { goal: 0, firstPlace: 0, comeback: 0, solo: 0, postmortem: 0 };
            p.scoreBreakdown = { goal: 0, firstPlace: 0, comeback: 0, solo: 0, postmortem: 0 };
            p.breakdownBeforeRound = { goal: 0, firstPlace: 0, comeback: 0, solo: 0, postmortem: 0 };
            p.pointHistory = [];
            p.historyBeforeRound = [];
            p.lastRoundEntries = [];
            p.eliminated = false;
            p.hasFinished = false;
            p.finishedPostmortem = false;
            p.dnf = false;
            p.finishTick = null;
            p.piece = null;
            p.buildPlaced = false;
        });
        this.currentRound = 1;
        if (this.onFinalResultsHidden) this.onFinalResultsHidden();
    }
}