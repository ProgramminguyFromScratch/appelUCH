// Client side of accounts: login/sign-up, profile screen, achievement toasts.
// Guests keep working exactly as before; a logged-in player's token is sent
// with JOIN_ROOM and the server forces their account name.

function initAccounts(serverUrl, network) {
    const TOKEN_KEY = 'appel_auth_token';
    const NAME_KEY = 'appel_auth_username';
    const apiBase = serverUrl.replace(/^ws/i, 'http').replace(/\/+$/, '');

    const $ = id => document.getElementById(id);
    const nameScreen = $('nameScreen');
    const authScreen = $('authScreen');
    const profileScreen = $('profileScreen');
    const playersScreen = $('playersScreen');
    const displayNameInput = $('displayNameInput');
    const joinLobbyNameInput = $('joinLobbyNameInput');

    let token = null;
    let username = null;
    let mode = 'login';
    try {
        token = localStorage.getItem(TOKEN_KEY);
        username = localStorage.getItem(NAME_KEY);
    } catch (e) {}
    if (!token || !username) { token = null; username = null; }

    function save() {
        try {
            if (token) {
                localStorage.setItem(TOKEN_KEY, token);
                localStorage.setItem(NAME_KEY, username);
            } else {
                localStorage.removeItem(TOKEN_KEY);
                localStorage.removeItem(NAME_KEY);
            }
        } catch (e) {}
    }

    async function api(path, { method = 'GET', body } = {}) {
        const headers = {};
        if (body) headers['Content-Type'] = 'application/json';
        if (token) headers['Authorization'] = 'Bearer ' + token;
        let res;
        try {
            res = await fetch(apiBase + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
        } catch (e) {
            return { ok: false, status: 0, data: { error: 'Could not reach the server.' } };
        }
        const data = await res.json().catch(() => ({}));
        return { ok: res.ok, status: res.status, data };
    }

    // ---- logged-in / guest UI state ----
    function render() {
        const status = $('accountStatus');
        status.textContent = '';
        if (username) {
            status.append('Logged in as ');
            const strong = document.createElement('strong');
            strong.textContent = username;
            status.append(strong);
        } else {
            status.textContent = 'Playing as guest';
        }
        $('btnAccountLogin').style.display = username ? 'none' : '';
        $('btnAccountProfile').style.display = username ? '' : 'none';
        $('btnAccountLogout').style.display = username ? '' : 'none';

        network.authToken = token;
        for (const input of [displayNameInput, joinLobbyNameInput]) {
            if (!input) continue;
            input.readOnly = !!username;
            if (username) input.value = username;
        }
    }

    function clearSession() {
        token = null;
        username = null;
        save();
        render();
    }

    // ---- auth modal ----
    function setMode(m) {
        mode = m;
        const signup = m === 'signup';
        $('authTitle').textContent = signup ? 'Sign up' : 'Log in';
        $('btnAuthSubmit').textContent = signup ? 'Create account' : 'Log in';
        $('btnAuthSwitch').textContent = signup ? 'Have an account? Log in' : 'Need an account? Sign up';
        $('authPassword2').style.display = signup ? '' : 'none';
        $('authHint').style.display = signup ? '' : 'none';
        $('authPassword').autocomplete = signup ? 'new-password' : 'current-password';
        $('authError').textContent = '';
    }
    function openAuth() {
        setMode('login');
        $('authPassword').value = '';
        $('authPassword2').value = '';
        nameScreen.style.display = 'none';
        authScreen.style.display = 'flex';
        $('authUsername').focus();
    }
    function closeAuth() {
        authScreen.style.display = 'none';
        nameScreen.style.display = 'flex';
    }
    async function submitAuth() {
        const u = $('authUsername').value.trim();
        const p = $('authPassword').value;
        const err = $('authError');
        if (mode === 'signup' && p !== $('authPassword2').value) {
            err.textContent = 'Passwords do not match.';
            return;
        }
        $('btnAuthSubmit').disabled = true;
        err.textContent = '';
        const res = await api(mode === 'signup' ? '/api/register' : '/api/login', { method: 'POST', body: { username: u, password: p } });
        $('btnAuthSubmit').disabled = false;
        if (!res.ok) {
            err.textContent = (res.data && res.data.error) || 'Something went wrong.';
            return;
        }
        token = res.data.token;
        username = res.data.username;
        save();
        $('authPassword').value = '';
        $('authPassword2').value = '';
        render();
        closeAuth();
    }

    // ---- profile ----
    function formatDuration(ms) {
        const mins = Math.floor((ms || 0) / 60000);
        if (mins < 60) return mins + 'm';
        return Math.floor(mins / 60) + 'h ' + (mins % 60) + 'm';
    }
    function formatLastSeen(ts, online) {
        if (online) return 'Online now';
        if (!ts) return 'Last online: unknown';
        const diff = Date.now() - ts;
        const mins = Math.floor(diff / 60000);
        if (mins < 1) return 'Last online: just now';
        if (mins < 60) return `Last online: ${mins}m ago`;
        const hrs = Math.floor(mins / 60);
        if (hrs < 24) return `Last online: ${hrs}h ago`;
        const days = Math.floor(hrs / 24);
        if (days < 30) return `Last online: ${days}d ago`;
        return 'Last online: ' + new Date(ts).toLocaleDateString();
    }
    const fmtDate = ts => new Date(ts).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });

    // The detail list under the three headline numbers.
    const DETAIL_ROWS = [
        ['Time played', st => formatDuration(st.playtime_ms)],
        ['Matches played', st => st.matches_played],
        ['Matches lost', st => st.matches_lost],
        ['Matches tied', st => st.matches_tied],
        ['Goals reached', st => st.rounds_finished],
        ['First places', st => st.first_places],
        ['Points scored', st => st.points_total],
        ['Maps played', st => `${st.maps_played}/${st.maps_total}`],
        ['Lava deaths', st => st.lava_deaths],
        ['Other deaths', st => st.deaths]
    ];

    // The appel character (same sprite as the lobby color preview), tinted with
    // the player's saved top/bottom hues. Same recoloring as the lobby preview:
    // pixels that start out greenish follow `hue`, the rest follow `hue2`.
    function rgbToHsv(r, g, b) {
        r /= 255; g /= 255; b /= 255;
        const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
        let h = 0;
        if (d !== 0) {
            if (max === r) h = ((g - b) / d) % 6;
            else if (max === g) h = (b - r) / d + 2;
            else h = (r - g) / d + 4;
        }
        return [((h * 60) + 360) % 360, max === 0 ? 0 : d / max, max];
    }
    function hsvToRgb(h, s, v) {
        h /= 60;
        const c = v * s, x = c * (1 - Math.abs(h % 2 - 1)), m = v - c;
        const [r, g, b] =
            h < 1 ? [c, x, 0] : h < 2 ? [x, c, 0] : h < 3 ? [0, c, x] :
            h < 4 ? [0, x, c] : h < 5 ? [x, 0, c] : [c, 0, x];
        return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
    }
    // Base sprites are loaded per skin and cached.
    const skinSprites = new Map();
    function withSkinSprite(skin, cb) {
        const id = AppelSkins.get(skin).id;
        const have = skinSprites.get(id);
        if (have) { cb(have); return; }
        const img = new Image();
        img.onload = () => { skinSprites.set(id, img); cb(img); };
        // One retry on a failed load so a transient error doesn't leave the avatar blank.
        let retried = false;
        img.onerror = () => { if (!retried) { retried = true; setTimeout(() => { img.src = AppelSkins.standPath(id) + '?r=1'; }, 500); } };
        img.src = AppelSkins.standPath(id);
    }

    let avatarToken = 0;
    function renderAvatar(hue, hue2, skin) {
        const el = $('profileAvatar');
        const top = Number.isInteger(hue) ? hue : 0;
        const bottom = Number.isInteger(hue2) ? hue2 : top;
        const token = ++avatarToken; // only the latest profile may draw
        AppelSkins.ready.then(() => withSkinSprite(skin, sprite => {
            if (token !== avatarToken) return;
            const w = sprite.naturalWidth || sprite.width;
            const h = sprite.naturalHeight || sprite.height;
            const src = document.createElement('canvas');
            src.width = w; src.height = h;
            const sctx = src.getContext('2d');
            sctx.drawImage(sprite, 0, 0);
            const img = sctx.getImageData(0, 0, w, h);
            const d = img.data;
            for (let i = 0; i < d.length; i += 4) {
                if (d[i + 3] === 0) continue;
                const [ph, ps, pv] = rgbToHsv(d[i], d[i + 1], d[i + 2]);
                const shift = ph >= 100 ? top : bottom;
                const [r, g, b] = hsvToRgb(((ph / 360 + (shift % 200) / 200) % 1) * 360, ps, pv);
                d[i] = r; d[i + 1] = g; d[i + 2] = b;
            }
            sctx.putImageData(img, 0, 0);
            el.width = w; el.height = h;
            const ctx = el.getContext('2d');
            ctx.imageSmoothingEnabled = false;
            ctx.clearRect(0, 0, w, h);
            ctx.drawImage(src, 0, 0);
        }));
    }

    let shownProfile = null;
    let achFilter = 'unlocked';
    function renderAchievements() {
        const p = shownProfile;
        const list = $('profileAchievements');
        list.textContent = '';
        if (!p) return;
        let items = p.achievements.slice();
        if (achFilter === 'unlocked') items = items.filter(a => a.unlocked);
        else if (achFilter === 'locked') items = items.filter(a => !a.unlocked);
        // Unlocked first (most recent on top); locked keep their usual order.
        items.sort((a, b) => (b.unlocked - a.unlocked) || (b.unlocked ? b.unlockedAt - a.unlockedAt : 0));
        for (const a of items) {
            const li = document.createElement('li');
            if (a.unlocked) li.className = 'unlocked';
            const body = document.createElement('div');
            const b = document.createElement('b');
            b.textContent = a.name;
            const span = document.createElement('span');
            span.textContent = a.desc;
            body.append(b, span);
            if (a.unlocked && a.unlockedAt) {
                const small = document.createElement('small');
                small.textContent = 'Unlocked ' + fmtDate(a.unlockedAt);
                body.append(small);
            }
            li.append(body);
            list.append(li);
        }
        const empty = $('profileAchEmpty');
        empty.style.display = items.length ? 'none' : 'block';
        empty.textContent = achFilter === 'unlocked' ? 'No achievements unlocked yet.'
            : achFilter === 'locked' ? 'Everything is unlocked.' : '';
        for (const btn of document.querySelectorAll('#profileAchFilter button')) {
            btn.classList.toggle('on', btn.dataset.filter === achFilter);
        }
    }

    function showProfileData(p) {
        shownProfile = p;
        achFilter = 'unlocked';
        const st = p.stats;

        const nameEl = $('profileName');
        nameEl.textContent = p.username;
        if (username && p.username.toLowerCase() === username.toLowerCase()) {
            const tag = document.createElement('span');
            tag.className = 'youTag';
            tag.textContent = 'You';
            nameEl.append(tag);
        }
        renderAvatar(p.hue, p.hue2, p.skin);
        const lo = $('profileLastOnline');
        lo.textContent = formatLastSeen(p.lastSeen, p.online);
        lo.className = p.online ? 'online' : '';
        $('profileSince').textContent = 'Joined ' + fmtDate(p.createdAt);

        // Three headline numbers.
        const decided = (st.matches_won || 0) + (st.matches_lost || 0) + (st.matches_tied || 0);
        const winRate = decided ? Math.round(100 * (st.matches_won || 0) / decided) + '%' : '-';
        const hero = $('profileHero');
        hero.textContent = '';
        for (const [value, label] of [[st.matches_won || 0, 'Matches won'], [winRate, 'Win rate'], [st.best_streak || 0, 'Best win streak']]) {
            const box = document.createElement('div');
            const b = document.createElement('b');
            b.textContent = String(value);
            const span = document.createElement('span');
            span.textContent = label;
            box.append(b, span);
            hero.append(box);
        }

        const dl = $('profileStats');
        dl.textContent = '';
        for (const [label, fn] of DETAIL_ROWS) {
            const row = document.createElement('div');
            const dt = document.createElement('dt');
            dt.textContent = label;
            const dd = document.createElement('dd');
            dd.textContent = String(fn(st) || 0);
            row.append(dt, dd);
            dl.append(row);
        }

        const done = p.achievements.filter(a => a.unlocked).length;
        $('profileAchHeader').textContent = `Achievements ${done}/${p.achievements.length}`;
        const bar = $('profileAchBar');
        const fill = bar.firstElementChild;
        bar.setAttribute('aria-valuemin', '0');
        bar.setAttribute('aria-valuemax', String(p.achievements.length));
        bar.setAttribute('aria-valuenow', String(done));
        fill.style.width = '0%';
        requestAnimationFrame(() => requestAnimationFrame(() => {
            fill.style.width = (p.achievements.length ? (100 * done / p.achievements.length) : 0) + '%';
        }));
        renderAchievements();
        $('profileCard').scrollTop = 0;
    }
    let profileReturn = 'name'; // which screen the Back button goes to
    async function openProfile(name, from) {
        if (from) profileReturn = from;
        $('profileError').textContent = '';
        const res = name
            ? await api('/api/profile?name=' + encodeURIComponent(name))
            : await api('/api/me');
        if (res.status === 401) { clearSession(); closeProfile(); return; }
        if (!res.ok) {
            $('profileError').textContent = (res.data && res.data.error) || 'Could not load profile.';
            if (profileScreen.style.display === 'none') return;
        } else {
            showProfileData(res.data);
        }
        nameScreen.style.display = 'none';
        playersScreen.style.display = 'none';
        profileScreen.style.display = 'flex';
    }
    function closeProfile() {
        profileScreen.style.display = 'none';
        if (profileReturn === 'players') playersScreen.style.display = 'flex';
        else nameScreen.style.display = 'flex';
        profileReturn = 'name';
    }

    // ---- players directory ----
    let playersQuery = '';
    let playersOffset = 0;
    async function loadPlayers(reset) {
        if (reset) {
            playersOffset = 0;
            $('playersList').textContent = '';
            $('playersEmpty').style.display = 'none';
        }
        $('playersError').textContent = '';
        const res = await api(`/api/users?q=${encodeURIComponent(playersQuery)}&offset=${playersOffset}&limit=50`);
        if (!res.ok) {
            $('playersError').textContent = (res.data && res.data.error) || 'Could not load players.';
            return;
        }
        const list = $('playersList');
        for (const u of res.data.users) {
            const li = document.createElement('li');
            const info = document.createElement('div');
            info.className = 'pInfo';
            const name = document.createElement('span');
            name.className = 'pName';
            if (u.online) {
                const dot = document.createElement('span');
                dot.className = 'dot';
                name.append(dot);
            }
            name.append(document.createTextNode(u.username));
            const seen = document.createElement('span');
            seen.className = 'lastSeen' + (u.online ? ' online' : '');
            seen.textContent = formatLastSeen(u.lastSeen, u.online).replace('Last online: ', 'Last online ');
            info.append(name, seen);
            const wins = document.createElement('span');
            wins.className = 'pWins';
            wins.textContent = `${u.matchesWon} win${u.matchesWon === 1 ? '' : 's'}`;
            li.append(info, wins);
            li.addEventListener('click', () => openProfile(u.username, 'players'));
            list.append(li);
        }
        playersOffset += res.data.users.length;
        $('btnPlayersMore').style.display = res.data.hasMore ? '' : 'none';
        $('playersEmpty').style.display = list.children.length ? 'none' : 'block';
    }
    function openPlayers() {
        nameScreen.style.display = 'none';
        playersScreen.style.display = 'flex';
        playersQuery = $('playersSearch').value.trim();
        loadPlayers(true);
    }
    function closePlayers() {
        playersScreen.style.display = 'none';
        nameScreen.style.display = 'flex';
    }

    // ---- toasts ----
    function toast(title, text) {
        const el = document.createElement('div');
        el.className = 'toast';
        const b = document.createElement('b');
        b.textContent = title;
        el.append(b, document.createTextNode(text));
        $('toastHost').append(el);
        setTimeout(() => el.remove(), 6000);
    }
    network.onAchievementUnlocked = (payload) => {
        for (const a of (payload && payload.achievements) || []) {
            toast('Achievement unlocked', `${a.name} - ${a.desc}`);
            if (typeof playSfx === 'function') { try { playSfx('select'); } catch (e) {} }
        }
    };

    // ---- wiring ----
    $('btnAccountLogin').addEventListener('click', openAuth);
    $('btnAccountLogout').addEventListener('click', async () => {
        const old = token;
        clearSession();
        displayNameInput.readOnly = false;
        if (old) fetch(apiBase + '/api/logout', { method: 'POST', headers: { Authorization: 'Bearer ' + old } }).catch(() => {});
    });
    $('btnAccountProfile').addEventListener('click', () => openProfile(null, 'name'));
    $('btnPlayers').addEventListener('click', openPlayers);
    $('btnPlayersClose').addEventListener('click', closePlayers);
    $('btnPlayersRefresh').addEventListener('click', () => { playersQuery = $('playersSearch').value.trim(); loadPlayers(true); });
    $('btnPlayersMore').addEventListener('click', () => loadPlayers(false));
    const playersSearch = () => { playersQuery = $('playersSearch').value.trim(); loadPlayers(true); };
    $('btnPlayersSearch').addEventListener('click', playersSearch);
    $('playersSearch').addEventListener('keydown', e => { if (e.key === 'Enter') playersSearch(); });
    $('btnAuthCancel').addEventListener('click', closeAuth);
    $('btnAuthSwitch').addEventListener('click', () => setMode(mode === 'login' ? 'signup' : 'login'));
    $('btnAuthSubmit').addEventListener('click', submitAuth);
    for (const id of ['authUsername', 'authPassword', 'authPassword2']) {
        $(id).addEventListener('keydown', e => { if (e.key === 'Enter') submitAuth(); });
    }
    $('btnProfileClose').addEventListener('click', closeProfile);
    $('profileAchFilter').addEventListener('click', e => {
        const btn = e.target.closest('button[data-filter]');
        if (!btn) return;
        achFilter = btn.dataset.filter;
        renderAchievements();
    });
    const search = () => {
        const v = $('profileSearch').value.trim();
        if (v) openProfile(v, profileReturn);
    };
    $('btnProfileSearch').addEventListener('click', search);
    $('profileSearch').addEventListener('keydown', e => { if (e.key === 'Enter') search(); });

    render();

    // Quietly drop a stale saved session so the UI doesn't claim a login that
    // the server would reject on join.
    if (token) {
        api('/api/me').then(res => { if (res.status === 401) clearSession(); });
    }

    return { clearSession, api, get isLoggedIn() { return !!token; }, get username() { return username; } };
}
