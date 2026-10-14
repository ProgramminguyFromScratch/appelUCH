// Community level (client side).
//
//   Hub:   /edit       place one piece, then beat your edited level to publish it (rolling cooldown)
//          /community  just play it (no edit, no limit)
//
// It reuses the speedrun machinery: the community level is a solo run on its own
// physics instance (sr.community is set), and a finished run is submitted to
// /api/community/clear instead of the leaderboard. /edit opens straight into
// piece-placement mode (sr.edit); confirming sends /api/community/edit, which
// keeps the edit pending on the server. The run screen then reloads the EDITED
// level, and beating it publishes the edit (the server proves it is possible).
//
// Server rules (worker/src/community.js): one edit per cooldown, counted from your
// last edit; nothing goes live until you beat it; same placement rules as the
// multiplayer build phase (so the start and goal can't be overwritten).

function formatCommunityWait(ms) {
    const mins = Math.max(1, Math.ceil(ms / 60000));
    const h = Math.floor(mins / 60), m = mins % 60;
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

Object.assign(Game.prototype, {
    // --------------------------------------------------------- hub station ----
    // The community level has a pad in the hub (this.COMMUNITY_PAD). Stand on it:
    // R = /edit, Enter / Shift = /community. It shows the current version and a thumbnail.
    isOnCommunityPad() {
        const p = this.players[this.localSeatIndex], z = this.COMMUNITY_PAD;
        if (!p || !p.physicsState || !z || this.gameState !== GameState.STAGE_SELECT) return false;
        return Math.abs(p.physicsState.PLAYER_X - z.x) <= STAGE_VOTE_ZONE_WIDTH / 2 &&
               Math.abs(p.physicsState.PLAYER_Y - z.y) <= STAGE_VOTE_ZONE_DEPTH / 2;
    },

    async _refreshCommunityHub() {
        const st = this._communityHub || (this._communityHub = { info: null, fetchedAt: 0, fetching: false });
        const api = this._speedrunApi();
        if (!api || st.fetching || (st.info && performance.now() - st.fetchedAt < 20000)) return;
        st.fetching = true;
        st.fetchedAt = performance.now(); // also throttles retries after a failure
        try {
            const res = await api.api('/api/community');
            if (res.ok && res.data && res.data.code) st.info = res.data;
        } finally {
            st.fetching = false;
        }
    },

    drawCommunityPad() {
        const z = this.COMMUNITY_PAD;
        if (!z || this.gameState !== GameState.STAGE_SELECT) return;
        this._refreshCommunityHub();
        const info = this._communityHub && this._communityHub.info;
        const ctx = this.ctx, zoom = this.camera.zoom;
        const screen = this.worldToScreen(z.x, z.y);
        const boxWidth = 200 * zoom;
        const thumbH = boxWidth * STAGE_PREVIEW_ASPECT;
        const thumbX = screen.x - boxWidth / 2;
        const thumbY = screen.y - thumbH + 14 * zoom;

        ctx.save();
        const title = this.getStageTitleCanvas('Community Level');
        const titleW = title.width * zoom, titleH = title.height * zoom;
        const titleBaselineY = thumbY - 8 * zoom;
        // Version + last editor, in the same spot the speedrun record sits on stages.
        const sub = info ? `v${info.version}${info.editedBy ? '  ·  ' + info.editedBy : ''}` : 'Everyone edits this one';
        ctx.font = `bold ${Math.max(10, 15 * zoom)}px ${THEME.font}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'alphabetic';
        ctx.lineJoin = 'round';
        ctx.lineWidth = Math.max(2, 3.5 * zoom);
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.85)';
        const subY = titleBaselineY - titleH - 2 * zoom;
        ctx.strokeText(sub, screen.x, subY);
        ctx.fillStyle = '#ffd24a';
        ctx.fillText(sub, screen.x, subY);
        ctx.drawImage(title, screen.x - titleW / 2, titleBaselineY - titleH, titleW, titleH);

        if (info) {
            const thumb = this.generateStageThumbnail(info.code, boxWidth, thumbH);
            if (thumb) ctx.drawImage(thumb, thumbX, thumbY, boxWidth, thumbH);
        } else {
            ctx.fillStyle = 'rgba(8, 10, 16, 0.55)';
            ctx.fillRect(thumbX, thumbY, boxWidth, thumbH);
        }
        // Highlight while you're standing on it.
        if (this.isOnCommunityPad()) {
            ctx.strokeStyle = THEME.accent;
            ctx.lineWidth = Math.max(2, 3 * zoom);
            ctx.strokeRect(thumbX, thumbY, boxWidth, thumbH);
        }
        ctx.restore();
    },

    // ------------------------------------------------------------ start ----
    // playOnly = true: practice run only, no session, nothing is submitted.
    async startCommunity(playOnly) {
        if (this._communityBusy) return;
        const cmd = playOnly ? '/community' : '/edit';
        if (this.gameState !== GameState.STAGE_SELECT) {
            this.pushSystemMessage(this.speedrun
                ? `Leave this run first (/exit), then use ${cmd} in the hub.`
                : `${cmd} only works in the hub.`);
            return;
        }
        const api = this._speedrunApi();
        if (!api) { this.pushSystemMessage('The community level needs the server.'); return; }
        if (!playOnly && !api.isLoggedIn) {
            this.pushSystemMessage('Log in to edit the community level. (/community lets anyone play it.)');
            return;
        }

        this._communityBusy = true;
        try {
            let data;
            if (playOnly) {
                const res = await api.api('/api/community');
                if (!res.ok) { this.pushSystemMessage((res.data && res.data.error) || 'Could not load the community level.'); return; }
                data = res.data;
            } else {
                const res = await api.api('/api/community/attempt', { method: 'POST', body: {} });
                if (!res.ok) {
                    if (res.status === 429 && res.data.nextEditAt) {
                        this.pushSystemMessage(`You edited the community level recently. Next edit in ${formatCommunityWait(res.data.nextEditAt - Date.now())}. (/community to play it.)`);
                    } else {
                        this.pushSystemMessage((res.data && res.data.error) || 'Could not start an edit.');
                    }
                    return;
                }
                data = res.data;
            }
            // The hub may have moved on (match starting etc.) while we were waiting.
            if (this.gameState !== GameState.STAGE_SELECT) return;
            const community = { attemptId: playOnly ? null : data.attemptId, version: data.version, playOnly: !!playOnly, cleared: false, done: false, edited: false };
            if (!this._enterSpeedrun(`Community Level v${data.version}`, data.code, { community })) {
                this.pushSystemMessage('Could not load the community level.');
                return;
            }
            if (playOnly) {
                this.pushSystemMessage(`Community level v${data.version}: practice run. Use /edit to change it.`);
            } else {
                this._communityBeginEdit(this.speedrun);
                this.pushSystemMessage(`Community level v${data.version}: place one piece, then beat your edited level to publish it.`);
            }
        } finally {
            this._communityBusy = false;
        }
    },

    // ------------------------------------------------------------ clear ----
    async submitCommunityClear(sr) {
        const c = sr.community;
        if (c.playOnly) { sr.result = { practice: true }; return; }
        const api = this._speedrunApi();
        sr.submitting = true;
        const res = await api.api('/api/community/clear', {
            method: 'POST',
            body: { attemptId: c.attemptId, ticks: sr.ticks, replay: encodeSpeedrunReplay(sr.inputs) }
        });
        sr.submitting = false;
        if (this.speedrun !== sr) return;
        if (!res.ok) {
            c.cleared = false;
            const d = res.data || {};
            sr.result = { error: d.error || 'Could not verify your clear.', stale: !!d.stale || res.status === 409 || res.status === 410 || res.status === 429 };
            return;
        }
        // The server accepted the clear and published the edit.
        const lvl = res.data.level;
        c.cleared = true;
        c.done = true;
        c.playOnly = true;
        c.version = lvl.version;
        sr.result = { cleared: true, published: true, version: lvl.version };
        if (this._communityHub) this._communityHub.fetchedAt = 0; // hub pad refreshes on return
        this.pushSystemMessage(`Your edit is live! The community level is now v${lvl.version}.`);
    },

    // ------------------------------------------------------------- edit ----
    _communityBeginEdit(sr) {
        const me = this.players[this.localSeatIndex];
        // Start the cursor where you finished (nearest buildable cell).
        let start = this.getSpawnCell();
        if (me && me.physicsState) {
            start = { col: Math.floor(me.physicsState.PLAYER_X / TILE_SIZE), row: Math.floor(me.physicsState.PLAYER_Y / TILE_SIZE) };
        }
        sr.edit = {
            pieceIdx: 0, rotation: 0, cursor: this.findPlaceableCellNear(start),
            submitting: false, error: null
        };
        if (typeof playSfx === 'function') playSfx('select');
    },

    _communityPiece() {
        const e = this.speedrun && this.speedrun.edit;
        return e ? PIECE_POOL[e.pieceIdx] : null;
    },

    _communityCells() {
        const e = this.speedrun.edit;
        return getPieceFootprintCells(this._communityPiece(), e.rotation).map(o => ({
            col: e.cursor.col + o.dCol, row: e.cursor.row + o.dRow, tile: o.tile, rotation: e.rotation
        }));
    },

    // Mirrors the server's applyEdit so players get instant feedback.
    _communityCheck() {
        const piece = this._communityPiece();
        const cols = this.levelData.size_x, rows = Math.floor(this.physics.MAP.length / cols);
        const cells = this._communityCells();
        for (const c of cells) {
            if (c.col < 0 || c.col >= cols || c.row < 0 || c.row >= rows) return { ok: false, reason: 'Doesn\'t fit there.' };
            const idx = c.col + c.row * cols;
            if (!piece.targetsSolid && !this.physics.isPlaceableCell(idx)) return { ok: false, reason: 'Doesn\'t fit there.' };
        }
        if (piece.targetsSolid && !cells.some(c => this.physics.isDeletableCell(c.col + c.row * cols))) {
            return { ok: false, reason: 'Nothing to blow up there.' };
        }
        return { ok: true };
    },

    async submitCommunityEdit() {
        const sr = this.speedrun, e = sr.edit, c = sr.community;
        if (!e || e.submitting) return;
        const check = this._communityCheck();
        if (!check.ok) { e.error = check.reason; if (typeof playSfx === 'function') playSfx('boom'); return; }
        e.submitting = true;
        e.error = null;
        const piece = this._communityPiece();
        const api = this._speedrunApi();
        const res = await api.api('/api/community/edit', {
            method: 'POST',
            body: { attemptId: c.attemptId, pieceId: piece.id, col: e.cursor.col, row: e.cursor.row, rotation: e.rotation }
        });
        if (this.speedrun !== sr) return;
        e.submitting = false;
        if (res.ok) {
            // The edit is pending on the server. Load the edited level: beating it publishes the edit.
            c.edited = true;
            sr.edit = null;
            sr.code = res.data.code;
            sr.levelName = `Community Level v${c.version} + your edit`;
            this.resetSpeedrun(false);
            sr.result = null;
            if (typeof playSfx === 'function') playSfx('select');
            this.pushSystemMessage('Now beat your edited level to publish it. (R resets; /exit cancels.)');
            return;
        }
        const err = (res.data && res.data.error) || 'Could not save your edit.';
        if (res.status === 409 || res.status === 404 || res.status === 410 || res.status === 429) {
            // The permit is gone (someone else edited first, expired, or limit hit): nothing more to try here.
            sr.edit = null;
            sr.result = { error: err, stale: true };
            return;
        }
        e.error = err; // a bad placement: pick another spot
    },

    updateCommunityEdit() {
        const e = this.speedrun.edit;
        const t = this.buildCellToWorld(e.cursor);
        this.camera.x += (t.x - this.camera.x) * 0.25;
        this.camera.y += (t.y - this.camera.y) * 0.25;
        this.camera.zoom += (0.9 - this.camera.zoom) * 0.1;
    },

    // -------------------------------------------------------- input hook ----
    // Called first by handleSpeedrunKey. Returns true if the key was consumed.
    communityHandleKey(e) {
        const sr = this.speedrun;
        if (this.gameState !== GameState.SPEEDRUN || !sr || !sr.community) return false;

        // The speedrun leaderboards don't apply to this level.
        if (isHotkey('leaderboard', e.code)) { e.preventDefault(); return true; }

        const ed = sr.edit;
        if (!ed) return false;
        const c = LOCAL_PLAYER_CONTROLS;
        // R must not reset the run while you're choosing your edit.
        if (isHotkey('speedrun', e.code)) { e.preventDefault(); return true; }
        if (ed.submitting) { e.preventDefault(); return true; }

        const move = (dc, dr) => {
            const cols = this.levelData.size_x, rows = Math.floor(this.physics.MAP.length / cols);
            ed.cursor.col = Math.max(0, Math.min(cols - 1, ed.cursor.col + dc));
            ed.cursor.row = Math.max(0, Math.min(rows - 1, ed.cursor.row + dr));
            ed.error = null;
        };
        if (c.left.includes(e.code)) { e.preventDefault(); move(-1, 0); return true; }
        if (c.right.includes(e.code)) { e.preventDefault(); move(1, 0); return true; }
        if (c.up.includes(e.code)) { e.preventDefault(); move(0, 1); return true; }
        if (c.down.includes(e.code)) { e.preventDefault(); move(0, -1); return true; }
        if (c.rotateCCW.includes(e.code)) { e.preventDefault(); ed.rotation = (ed.rotation + 3) % 4; ed.error = null; return true; }
        if (c.rotateCW.includes(e.code)) { e.preventDefault(); ed.rotation = (ed.rotation + 1) % 4; ed.error = null; return true; }
        // Piece picker: Tab / ] = next, [ = previous.
        if (e.code === 'Tab' || e.code === 'BracketRight' || e.code === 'BracketLeft') {
            e.preventDefault();
            if (!e.repeat) {
                const n = PIECE_POOL.length;
                ed.pieceIdx = (ed.pieceIdx + (e.code === 'BracketLeft' ? n - 1 : 1)) % n;
                ed.error = null;
                if (typeof playSfx === 'function') playSfx('hover');
            }
            return true;
        }
        // Any confirm key places the piece. It's safe: nothing goes live until you beat the edited level.
        if (c.confirm.includes(e.code)) {
            e.preventDefault();
            if (!e.repeat) this.submitCommunityEdit();
            return true;
        }
        return false;
    },

    // ----------------------------------------------------------- drawing ----
    drawCommunityHud() {
        const sr = this.speedrun, c = sr.community, ed = sr.edit;
        const ctx = this.ctx;
        const cx = this.canvas.width / 2, H = this.canvas.height;
        ctx.save();
        ctx.textBaseline = 'alphabetic';

        this._srText(sr.levelName, cx, 26, `bold 16px ${THEME.font}`, '#ffffff');

        if (ed) {
            this._drawCommunityEdit(ed);
            ctx.restore();
            return;
        }

        const timerColor = sr.finished ? THEME.success : (sr.dead ? THEME.danger : '#ffffff');
        this._srText(sr.dead ? 'DEAD' : formatSpeedrunTicks(sr.ticks), cx, 66, `bold 40px ${THEME.font}`, timerColor);
        if (!sr.dead) this._srText(`${sr.ticks} ticks`, cx, 84, `12px ${THEME.font}`, '#c7d1e6');
        if (c.done) this._srText('Your edit is live. Play it, or /exit to go back.', cx, 104, `bold 12px ${THEME.font}`, '#ffd24a');
        else if (!c.playOnly) this._srText('Beat your edited level to publish it', cx, 104, `bold 12px ${THEME.font}`, '#ffd24a');

        if (!sr.started && !sr.finished && !sr.dead) {
            this._srText('Press a movement key to start the clock', cx, H / 2 - 30, `bold 20px ${THEME.font}`, '#ffffff');
        }

        if (sr.finished) {
            const r = sr.result;
            const lines = [`Cleared in ${formatSpeedrunTicks(sr.ticks)}  (${sr.ticks} ticks)`];
            let color = THEME.success;
            if (!r || sr.submitting) lines.push('Verifying...');
            else if (r.practice) lines.push('Practice run - /edit to change the level');
            else if (r.error) { lines.push(r.error); lines.push(r.stale ? 'Use /edit to start over.' : 'R: try again'); color = THEME.warning; }
            else if (r.published) lines.push(`Published! The community level is now v${r.version}.`);
            const boxW = 480, boxH = 36 + lines.length * 28;
            const bx = cx - boxW / 2, by = H / 2 - boxH / 2 - 20;
            ctx.fillStyle = 'rgba(8, 10, 16, 0.78)';
            ctx.fillRect(bx, by, boxW, boxH);
            ctx.strokeStyle = color;
            ctx.lineWidth = 2;
            ctx.strokeRect(bx, by, boxW, boxH);
            lines.forEach((t, i) => {
                ctx.font = (i === 0 ? 'bold 22px ' : 'bold 16px ') + THEME.font;
                ctx.textAlign = 'center';
                ctx.fillStyle = i === 0 ? '#ffffff' : color;
                ctx.fillText(t, cx, by + 34 + i * 28);
            });
        }

        if (!this.chatOpen && !this.helpMenuOpen && !this.userSettingsOpen) {
            ctx.font = `11px ${THEME.font}`;
            ctx.textAlign = 'center';
            ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
            ctx.fillText((sr.finished && !(sr.result && sr.result.error && !sr.result.stale) ? 'Enter: Back to hub   |   ' : '') +
                `${hintKey('speedrun')}: Reset   |   /exit: Back to hub`, cx, H - 10);
        }
        ctx.restore();
    },

    _drawCommunityEdit(ed) {
        const ctx = this.ctx;
        const cx = this.canvas.width / 2, H = this.canvas.height;
        const piece = this._communityPiece();
        const check = this._communityCheck();
        const half = (this.camera.zoom * TILE_SIZE) / 2;

        // The piece ghost.
        const cells = this._communityCells();
        this.renderer.renderTilePreviews(this.levelData, this.camera, cells, 0.6, piece);
        ctx.strokeStyle = check.ok ? THEME.success : THEME.danger;
        ctx.lineWidth = 3;
        for (const cell of cells) {
            const s = this.buildCellToScreen(cell);
            ctx.strokeRect(s.x - half, s.y - half, half * 2, half * 2);
        }

        // Header.
        this._srText('Place your edit (you must beat it to publish)', cx, 56, `bold 22px ${THEME.font}`, THEME.success);
        const status = ed.submitting ? 'Placing...' : (ed.error || (check.ok ? '' : check.reason));
        if (status) this._srText(status, cx, 80, `bold 14px ${THEME.font}`, ed.submitting ? '#ffffff' : THEME.warning);

        // Piece strip (a window of the pool around the selected piece).
        const box = 52, gap = 8, visible = 9;
        const n = PIECE_POOL.length;
        const y = H - 92;
        for (let k = -Math.floor(visible / 2); k <= Math.floor(visible / 2); k++) {
            const i = ((ed.pieceIdx + k) % n + n) % n;
            const x = cx + k * (box + gap);
            ctx.fillStyle = k === 0 ? 'rgba(58, 160, 255, 0.28)' : 'rgba(8, 10, 16, 0.6)';
            ctx.fillRect(x - box / 2, y - box / 2, box, box);
            ctx.strokeStyle = k === 0 ? THEME.accent : 'rgba(255, 255, 255, 0.18)';
            ctx.lineWidth = k === 0 ? 2.5 : 1;
            ctx.strokeRect(x - box / 2, y - box / 2, box, box);
            ctx.globalAlpha = k === 0 ? 1 : 0.6;
            this.renderer.renderPieceIcon(this.levelData, PIECE_POOL[i], x, y, box - 12);
            ctx.globalAlpha = 1;
        }
        this._srText(piece.name, cx, y + box / 2 + 18, `bold 14px ${THEME.font}`, '#ffffff');

        if (!this.chatOpen && !this.helpMenuOpen && !this.userSettingsOpen) {
            ctx.font = `11px ${THEME.font}`;
            ctx.textAlign = 'center';
            ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
            ctx.fillText(`Move: ${hintKey('left')}/${hintKey('right')}/${hintKey('up')}/${hintKey('down')}   |   ${hintKey('rotateCCW')}/${hintKey('rotateCW')}: Rotate   |   Tab / [ ]: Change piece   |   Enter / Shift: Place it   |   /exit: Cancel`, cx, H - 10);
        }
    }
});
