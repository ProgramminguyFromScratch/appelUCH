(function restoreGithubPagesRedirect() {
    const saved = sessionStorage.getItem('appel_redirect_path');
    if (saved) {
        sessionStorage.removeItem('appel_redirect_path');
        if (saved !== window.location.pathname + window.location.search) {
            window.history.replaceState({}, '', saved);
        }
    }
})();

const params = new URLSearchParams(window.location.search);

const playersParam = parseInt(params.get("players"), 10);
const playerCount = Number.isFinite(playersParam) ? playersParam : 2;

const nameScreen = document.getElementById('nameScreen');
const lobbyScreen = document.getElementById('lobbyScreen');
const displayNameInput = document.getElementById('displayNameInput');
const roomCodeInput = document.getElementById('roomCodeInput');
const btnCreateOrJoin = document.getElementById('btnCreateOrJoin');
const errorText = document.getElementById('errorText');
const wakingText = document.getElementById('wakingText');
const roomCodeValue = document.getElementById('roomCodeValue');
const btnCopyInvite = document.getElementById('btnCopyInvite');
const playerList = document.getElementById('playerList');
const btnStartMatch = document.getElementById('btnStartMatch');
const waitingForHost = document.getElementById('waitingForHost');

const lobbyBrowserScreen = document.getElementById('lobbyBrowserScreen');
const openLobbyList = document.getElementById('openLobbyList');
const noLobbiesText = document.getElementById('noLobbiesText');
const btnBrowseLobbies = document.getElementById('btnBrowseLobbies');
const btnRefreshLobbies = document.getElementById('btnRefreshLobbies');
const btnBackFromBrowser = document.getElementById('btnBackFromBrowser');
const joinLobbyModal = document.getElementById('joinLobbyModal');
const joinLobbyCode = document.getElementById('joinLobbyCode');
const joinLobbyNameInput = document.getElementById('joinLobbyNameInput');
const joinLobbyError = document.getElementById('joinLobbyError');
const btnConfirmJoinLobby = document.getElementById('btnConfirmJoinLobby');
const btnCancelJoinLobby = document.getElementById('btnCancelJoinLobby');
const openLobbyRow = document.getElementById('openLobbyRow');
const openLobbyCheckbox = document.getElementById('openLobbyCheckbox');
const openLobbyStatus = document.getElementById('openLobbyStatus');
const createOpenLobbyCheckbox = document.getElementById('createOpenLobbyCheckbox');

const copyLevelCodeBtn = document.getElementById('copyLevelCodeBtn');
function wireCopyLevelCodeButton(game) {
    game.onFinalResults = (levelCode) => {
        copyLevelCodeBtn.style.display = levelCode ? 'block' : 'none';
        copyLevelCodeBtn.classList.remove('copied');
        copyLevelCodeBtn.textContent = 'Copy Level Code';
        copyLevelCodeBtn.dataset.levelCode = levelCode || '';
    };
    game.onFinalResultsHidden = () => {
        copyLevelCodeBtn.style.display = 'none';
    };
}
copyLevelCodeBtn.addEventListener('click', async () => {
    const levelCode = copyLevelCodeBtn.dataset.levelCode;
    if (!levelCode) return;
    try {
        await navigator.clipboard.writeText(levelCode);
    } catch (err) {
        const ta = document.createElement('textarea');
        ta.value = levelCode;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        try { document.execCommand('copy'); } catch (e2) {}
        document.body.removeChild(ta);
    }
    copyLevelCodeBtn.classList.add('copied');
    copyLevelCodeBtn.textContent = 'Copied!';
    setTimeout(() => {
        copyLevelCodeBtn.classList.remove('copied');
        copyLevelCodeBtn.textContent = 'Copy Level Code';
    }, 1500);
});

const creditsScreen = document.getElementById('creditsScreen');
const btnShowCredits = document.getElementById('btnShowCredits');
const btnCloseCredits = document.getElementById('btnCloseCredits');
btnShowCredits.addEventListener('click', () => {
    nameScreen.style.display = 'none';
    creditsScreen.style.display = 'flex';
});
btnCloseCredits.addEventListener('click', () => {
    creditsScreen.style.display = 'none';
    nameScreen.style.display = 'flex';
});

const fullscreenBtn = document.getElementById('fullscreenBtn');
fullscreenBtn.addEventListener('click', () => game.toggleFullscreen());
document.addEventListener('fullscreenchange', () => {
    fullscreenBtn.style.display = document.fullscreenElement ? 'none' : 'block';
});

// const serverUrl = params.get('server') || `ws://${window.location.hostname || 'localhost'}:8080`;
const serverUrl = params.get('server') || `wss://spacecaliber.net`;

const network = new NetworkClient(serverUrl);
const game = new Game('gameCanvas', playerCount, network);
wireCopyLevelCodeButton(game);

{

    async function copyTextToClipboard(text) {
        try {
            await navigator.clipboard.writeText(text);
        } catch (err) {
            const ta = document.createElement('textarea');
            ta.value = text;
            ta.style.position = 'fixed';
            ta.style.opacity = '0';
            document.body.appendChild(ta);
            ta.select();
            try { document.execCommand('copy'); } catch (e2) {}
            document.body.removeChild(ta);
        }
    }

    btnCopyInvite.addEventListener('click', async () => {
        const roomCode = roomCodeValue.textContent.trim();
        if (!roomCode || roomCode === '-----') return;
        const inviteUrl = `${window.location.origin}/${roomCode}`;
        await copyTextToClipboard(inviteUrl);
        btnCopyInvite.classList.add('copied');
        btnCopyInvite.textContent = 'Copied!';
        setTimeout(() => {
            btnCopyInvite.classList.remove('copied');
            btnCopyInvite.textContent = 'Copy Invite Link';
        }, 1500);
    });

    const STORAGE_KEY = 'appel_player_id';

    function getRoomCodeFromPath() {
        const segment = window.location.pathname.replace(/^\/+|\/+$/g, '');
        if (!segment) return '';

        if (!/^[A-Za-z0-9]{1,5}$/.test(segment)) return '';
        return segment.toUpperCase();
    }

    const codeFromUrl = getRoomCodeFromPath();
    if (codeFromUrl) {
        roomCodeInput.value = codeFromUrl;
        displayNameInput.focus();
    }

    function updateUrlForRoom(roomCode) {
        if (!roomCode) return;
        const newPath = `/${roomCode}`;
        if (window.location.pathname !== newPath) {
            window.history.replaceState({}, '', newPath + window.location.search);
        }
    }

    function showError(message) {
        errorText.textContent = message || '';
    }

    function sanitizeDisplayName(raw) {
        return String(raw || '').replace(/[^\x20-\x7E]/g, '').trim();
    }

    function connectAndRun(fn) {
        if (network.isConnected) {
            fn();
        } else {
            const wakingTimer = setTimeout(() => {
                wakingText.textContent = 'Waking up the server. This can take up to a minute...';
                wakingText.style.display = 'block';
            }, 2000);

            const priorOnOpen = network.onOpen;
            network.onOpen = () => {
                clearTimeout(wakingTimer);
                wakingText.textContent = '';
                wakingText.style.display = 'none';
                if (priorOnOpen) priorOnOpen();
                fn();
            };

            const priorOnError = network.onError;
            network.onError = (err) => {
                clearTimeout(wakingTimer);
                wakingText.textContent = '';
                wakingText.style.display = 'none';
                if (priorOnError) priorOnError(err);
            };

            network.connect();
        }
    }

    const OPEN_LOBBY_PREF_KEY = 'appel_open_lobby_pref';
    const savedOpenLobbyPref = localStorage.getItem(OPEN_LOBBY_PREF_KEY);
    if (savedOpenLobbyPref !== null) {
        createOpenLobbyCheckbox.checked = savedOpenLobbyPref === '1';
    }
    createOpenLobbyCheckbox.addEventListener('change', () => {
        localStorage.setItem(OPEN_LOBBY_PREF_KEY, createOpenLobbyCheckbox.checked ? '1' : '0');
    });

    function joinWithCode(roomCode) {
        const name = sanitizeDisplayName(displayNameInput.value);
        if (!name) {
            showError('Enter a name using standard keyboard characters.');
            return;
        }
        displayNameInput.value = name;
        showError('');
        btnCreateOrJoin.disabled = true;

        connectAndRun(() => {
            const savedPlayerId = sessionStorage.getItem(STORAGE_KEY);
            network.joinRoom(roomCode, name, savedPlayerId, createOpenLobbyCheckbox.checked);
        });
    }

    let pendingJoinRoomCode = null;

    function openJoinLobbyModal(roomCode) {
        pendingJoinRoomCode = roomCode;
        joinLobbyCode.textContent = roomCode;
        joinLobbyNameInput.value = sanitizeDisplayName(displayNameInput.value) || '';
        joinLobbyError.textContent = '';
        btnConfirmJoinLobby.disabled = false;
        lobbyBrowserScreen.style.display = 'none';
        joinLobbyModal.style.display = 'flex';
        joinLobbyNameInput.focus();
    }

    function closeJoinLobbyModal(backToBrowser) {
        joinLobbyModal.style.display = 'none';
        pendingJoinRoomCode = null;
        if (backToBrowser) lobbyBrowserScreen.style.display = 'flex';
    }

    function confirmJoinLobby() {
        if (!pendingJoinRoomCode) return;
        const name = sanitizeDisplayName(joinLobbyNameInput.value);
        if (!name) {
            joinLobbyError.textContent = 'Enter a name using standard keyboard characters.';
            return;
        }
        joinLobbyNameInput.value = name;
        displayNameInput.value = name;
        joinLobbyError.textContent = '';
        btnConfirmJoinLobby.disabled = true;

        const roomCode = pendingJoinRoomCode;
        connectAndRun(() => {
            const savedPlayerId = sessionStorage.getItem(STORAGE_KEY);
            network.joinRoom(roomCode, name, savedPlayerId, createOpenLobbyCheckbox.checked);
        });
    }

    btnConfirmJoinLobby.addEventListener('click', confirmJoinLobby);
    btnCancelJoinLobby.addEventListener('click', () => closeJoinLobbyModal(true));
    joinLobbyNameInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') confirmJoinLobby();
    });

    btnCreateOrJoin.addEventListener('click', () => {
        joinWithCode(roomCodeInput.value.trim().toUpperCase());
    });

    function renderLobbyList(lobbies) {
        openLobbyList.innerHTML = '';
        noLobbiesText.style.display = (lobbies.length === 0) ? 'block' : 'none';

        for (const lobby of lobbies) {
            const li = document.createElement('li');

            const info = document.createElement('div');
            info.className = 'lobbyInfo';
            const code = document.createElement('span');
            code.className = 'lobbyCode';
            code.textContent = lobby.roomCode;
            info.appendChild(code);
            const meta = document.createElement('span');
            meta.className = 'lobbyMeta';
            const hostPart = lobby.hostName ? `${lobby.hostName}'s lobby · ` : '';
            const statusPart = lobby.inProgress ? ' · match in progress' : (lobby.inHub ? ' · in hub' : '');
            meta.textContent = `${hostPart}${lobby.playerCount}/${lobby.maxPlayers} players${statusPart}`;
            info.appendChild(meta);
            li.appendChild(info);

            const joinBtn = document.createElement('button');
            joinBtn.textContent = 'Join';
            joinBtn.addEventListener('click', () => {
                openJoinLobbyModal(lobby.roomCode);
            });
            li.appendChild(joinBtn);

            openLobbyList.appendChild(li);
        }
    }

    network.onLobbyList = (payload) => {
        renderLobbyList((payload && payload.lobbies) || []);
    };

    function requestLobbyRefresh() {
        connectAndRun(() => network.requestLobbyList());
    }

    btnBrowseLobbies.addEventListener('click', () => {
        showError('');
        nameScreen.style.display = 'none';
        lobbyBrowserScreen.style.display = 'flex';
        openLobbyList.innerHTML = '';
        noLobbiesText.style.display = 'none';
        requestLobbyRefresh();
    });

    btnRefreshLobbies.addEventListener('click', requestLobbyRefresh);

    btnBackFromBrowser.addEventListener('click', () => {
        lobbyBrowserScreen.style.display = 'none';
        nameScreen.style.display = 'flex';
    });

    const priorOnSeatAssigned = network.onSeatAssigned;
    network.onSeatAssigned = (payload) => {
        if (priorOnSeatAssigned) priorOnSeatAssigned(payload);
        sessionStorage.setItem(STORAGE_KEY, payload.playerId);
        closeJoinLobbyModal(false);
        nameScreen.style.display = 'none';
        lobbyScreen.style.display = 'flex';
    };

    network.onJoinRejected = (payload) => {
        const message =
            payload.reason === 'room_full' ? 'That room is full.' :
            payload.reason === 'match_in_progress' ? 'That room is loading into a match right now - try again in a moment.' :
            payload.reason === 'name_taken' ? 'That name is already taken in this room.' :
            payload.reason === 'invalid_name' ? 'Enter a name using standard keyboard characters.' :
            'Could not join that room.';

        if (pendingJoinRoomCode) {
            btnConfirmJoinLobby.disabled = false;
            joinLobbyError.textContent = message;
            return;
        }

        btnCreateOrJoin.disabled = false;
        window.history.replaceState({}, '', '/' + window.location.search);
        showError(message);
    };

    const colorSliderTop = document.getElementById('colorSliderTop');
    const colorSliderBottom = document.getElementById('colorSliderBottom');
    const colorPreviewCanvas = document.getElementById('colorPreviewCanvas');
    const previewCtx = colorPreviewCanvas.getContext('2d');
    previewCtx.imageSmoothingEnabled = false;


    function rgbToHsv(r, g, b) {
        r /= 255; g /= 255; b /= 255;
        const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
        let h = 0;
        if (d !== 0) {
            if (max === r) h = ((g - b) / d) % 6;
            else if (max === g) h = (b - r) / d + 2;
            else h = (r - g) / d + 4;
        }
        h = ((h * 60) + 360) % 360;
        const s = max === 0 ? 0 : d / max;
        return [h, s, max];
    }
    function hsvToRgb(h, s, v) {
        h /= 60;
        const c = v * s;
        const x = c * (1 - Math.abs(h % 2 - 1));
        const m = v - c;
        const [r, g, b] =
            h < 1 ? [c, x, 0] : h < 2 ? [x, c, 0] : h < 3 ? [0, c, x] :
            h < 4 ? [0, x, c] : h < 5 ? [x, 0, c] : [c, 0, x];
        return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
    }
    // The player sprite is drawn with two base colors: a top region (greenish,
    // base hue ~140deg) and a bottom region (yellowish, base hue ~60deg). To
    // let the two be tinted independently, each pixel is routed to the top or
    // bottom hue shift based on which base color it started out as.
    const TOP_REGION_HUE_THRESHOLD = 100;
    function applyDualHueShift(sourceImg, hueTop, hueBottom) {
        const canvas = document.createElement('canvas');
        canvas.width = sourceImg.naturalWidth || sourceImg.width;
        canvas.height = sourceImg.naturalHeight || sourceImg.height;
        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(sourceImg, 0, 0);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;
        for (let i = 0; i < data.length; i += 4) {
            if (data[i + 3] === 0) continue;
            const [h, s, v] = rgbToHsv(data[i], data[i + 1], data[i + 2]);
            const shift = h >= TOP_REGION_HUE_THRESHOLD ? hueTop : hueBottom;
            const hNorm = (h / 360 + (shift % 200) / 200) % 1.0;
            const [r, g, b] = hsvToRgb(hNorm * 360, s, v);
            data[i] = r; data[i + 1] = g; data[i + 2] = b;
        }
        ctx.putImageData(imageData, 0, 0);
        return canvas;
    }

    let playerPreviewSprite = null;
    const playerPreviewImg = new Image();
    playerPreviewImg.onload = () => {
        playerPreviewSprite = playerPreviewImg;
        drawColorPreview(parseInt(colorSliderTop.value, 10), parseInt(colorSliderBottom.value, 10));
    };
    playerPreviewImg.src = 'assets/player/stand.png';

    function drawColorPreview(hueTop, hueBottom) {
        previewCtx.clearRect(0, 0, colorPreviewCanvas.width, colorPreviewCanvas.height);
        if (!playerPreviewSprite) return;
        const tinted = applyDualHueShift(playerPreviewSprite, hueTop, hueBottom);
        previewCtx.drawImage(tinted, 0, 0, colorPreviewCanvas.width, colorPreviewCanvas.height);
    }

    let draggingColorSlider = false;
    let lastSentHueTop = null;
    let lastSentHueBottom = null;
    function sendHueUpdate(hueTop, hueBottom) {
        if (hueTop === lastSentHueTop && hueBottom === lastSentHueBottom) return;
        lastSentHueTop = hueTop;
        lastSentHueBottom = hueBottom;
        game.requestSetColor(hueTop, hueBottom);
    }
    function onColorSliderInput() {
        draggingColorSlider = true;
        const hueTop = parseInt(colorSliderTop.value, 10);
        const hueBottom = parseInt(colorSliderBottom.value, 10);
        drawColorPreview(hueTop, hueBottom);
        sendHueUpdate(hueTop, hueBottom);
    }
    function onColorSliderChange() {
        draggingColorSlider = false;
        sendHueUpdate(parseInt(colorSliderTop.value, 10), parseInt(colorSliderBottom.value, 10));
    }
    colorSliderTop.addEventListener('input', onColorSliderInput);
    colorSliderTop.addEventListener('change', onColorSliderChange);
    colorSliderBottom.addEventListener('input', onColorSliderInput);
    colorSliderBottom.addEventListener('change', onColorSliderChange);

    let suppressOpenLobbyChange = false;
    function applyOpenLobbyState(settings, isHost) {
        if (!settings || typeof settings.openLobby === 'undefined') return;
        suppressOpenLobbyChange = true;
        openLobbyCheckbox.checked = !!settings.openLobby;
        suppressOpenLobbyChange = false;

        openLobbyCheckbox.disabled = !isHost;
        openLobbyRow.classList.toggle('readOnly', !isHost);
        openLobbyStatus.textContent = isHost
            ? ''
            : (settings.openLobby ? 'This lobby is lobby to other players.' : 'This lobby is closed. Invite link only.');
    }

    openLobbyCheckbox.addEventListener('change', () => {
        if (suppressOpenLobbyChange) return;
        game.requestUpdateSettings({ openLobby: openLobbyCheckbox.checked ? 1 : 0 });
    });

    game.onLobbyUpdate = (payload, isHost) => {
        roomCodeValue.textContent = payload.roomCode;
        updateUrlForRoom(payload.roomCode);
        applyOpenLobbyState(payload.settings, isHost);

        const mySeat = payload.seats.find(s => s.seatIndex === game.localSeatIndex);
        if (mySeat && typeof mySeat.hue === 'number' && !draggingColorSlider) {
            const hueBottom = typeof mySeat.hue2 === 'number' ? mySeat.hue2 : mySeat.hue;
            colorSliderTop.value = mySeat.hue;
            colorSliderBottom.value = hueBottom;
            lastSentHueTop = mySeat.hue;
            lastSentHueBottom = hueBottom;
            drawColorPreview(mySeat.hue, hueBottom);
        }

        playerList.innerHTML = '';
        for (const seat of payload.seats) {
            const li = document.createElement('li');
            const label = document.createElement('span');
            label.className = 'nameLabel';
            if (typeof seat.hue === 'number') {
                const dot = document.createElement('span');
                dot.className = 'colorDot';
                dot.style.background = hueShiftToHex(seat.hue);
                label.appendChild(dot);
            }
            const nameText = document.createElement('span');
            nameText.textContent = seat.name;
            label.appendChild(nameText);
            if (seat.seatIndex === payload.hostSeatIndex) {
                const hostTag = document.createElement('span');
                hostTag.className = 'hostTag';
                hostTag.textContent = 'HOST';
                label.appendChild(hostTag);
            }
            li.appendChild(label);
            if (!seat.connected) {
                const disc = document.createElement('span');
                disc.className = 'disconnectedTag';
                disc.textContent = 'disconnected';
                li.appendChild(disc);
            }
            playerList.appendChild(li);
        }

        btnStartMatch.style.display = isHost ? 'inline-block' : 'none';
        waitingForHost.style.display = isHost ? 'none' : 'block';
    };

    btnStartMatch.addEventListener('click', () => {
        game.requestStartMatch();
    });

    function returnToNameScreen(message) {
        lobbyScreen.style.display = 'none';
        nameScreen.style.display = 'flex';
        btnCreateOrJoin.disabled = false;
        showError(message || '');
        window.history.replaceState({}, '', '/' + window.location.search);
    }

    const priorOnMatchStarting = network.onMatchStarting;
    network.onMatchStarting = (payload, type) => {
        if (priorOnMatchStarting) priorOnMatchStarting(payload, type);
        lobbyScreen.style.display = 'none';
        creditsScreen.style.display = 'none';
        game.startGameNetworked();
    };

    network.onKicked = () => {
        returnToNameScreen('You were removed from the room by the host/admin.');
    };

    game.onHostChanged = (hostSeatIndex, isHost) => {
        console.log(`[lobby] host is now seat ${hostSeatIndex}${isHost ? ' (you)' : ''}`);
        btnStartMatch.style.display = isHost ? 'inline-block' : 'none';
        waitingForHost.style.display = isHost ? 'none' : 'block';
        applyOpenLobbyState(game.settings, isHost);
    };

    network.onClose = () => {
        if (!errorText.textContent) showError('Disconnected from server.');
    };

}
