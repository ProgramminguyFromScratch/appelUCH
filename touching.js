/* touching.js
 *
 * Spike-touch detection for the web UI. This uses the same precomputed
 * (playerDir, spikeDir, shape, costume) -> pixel-grid correlation table
 * approach as the C port (spikes.h/spikes.c), built by build_spike_table.py
 * from spikes.txt. Each stored grid already encodes, for one specific
 * player-direction/costume/spike-shape/spike-rotation combo, whether the
 * player's hitbox overlaps the spike at every (dx, dy) offset -- so a
 * lookup is a direct answer, not a per-pixel geometry test.
 *
 * The old per-pixel scan (is_pixel_on_spike / is_pixel_on_player /
 * is_player_touching_spike's brute-force loop) and the old per-level
 * bakeForLevel() bitmap have been removed: they were a separate, buggy
 * implementation of the same idea. This is the only spike-touch path now.
 */
class Touching {
    constructor() {
        this._corr = null; // { W, H, dxOrigin, dyOrigin, table: Map<"pi|si|shi|ci", Uint8Array> }
        this._corrReady = false;
        this.ready = false; // kept for compatibility with external `.ready` checks

        this.loadPromise = this.loadCorrelationTable()
            .then(() => { this.ready = true; })
            .catch(error => console.error('Error loading or decoding spikes:', error));
    }

    // ---- correlation-table axes (must match build_spike_table.py / spikes.h) ----
    static SB_NUM_PDIR = 48;  // player direction: multiples of 7.5 deg, -172.5..180
    static SB_NUM_SDIR = 4;   // spike rotation: {-90, 0, 90, 180}
    static SB_SHAPES   = [7, 9, 74, 77, 78, 83];
    static SB_W = 130;
    static SB_H = 129;

    static _pdirToIndex(deg) {
        let idx = Math.round((deg + 172.5) / 7.5);
        if (idx < 0) idx = 0;
        if (idx >= Touching.SB_NUM_PDIR) idx = Touching.SB_NUM_PDIR - 1;
        return idx;
    }

    static _sdirDegToTableIdx(deg) {
        switch (deg) {
            case -90: return 0;
            case   0: return 1;
            case  90: return 2;
            case 180: return 3;
            default:  return -1;
        }
    }

    // CONFIRMED: spike-direction degrees = 90 * MAP_R's rot id, wrapped into
    // the table's {-90, 0, 90, 180} axis (rot 3 -> 270 deg == -90 deg).
    // Matches maprot_to_table_idx() in spikes.c 1:1.
    static _maprotToTableIdx(rot) {
        if (!Number.isInteger(rot)) return -1; // correlation table only covers the 4 discrete rotations
        let deg = (90 * rot) % 360;
        if (deg > 180) deg -= 360;
        return Touching._sdirDegToTableIdx(deg);
    }

    static _shapeToIndex(tileId) {
        return Touching.SB_SHAPES.indexOf(tileId);
    }

    // costume: 0 = Stand, 1 = Crouch, 2 = Wall Crouch.
    // Wall Crouch = crouching (player_state === 2) while touching a wall
    // (player_wall !== null) -- same condition physics uses (see
    // simplephysics.js's set_flipped) to pick the narrow (7px) vs normal
    // (17px) hitbox.
    static _costumeIndex(playerState) {
        if (playerState.player_state !== 2) return 0;
        return playerState.player_wall !== null ? 2 : 1;
    }

    decodeBinaryRLE(encodedString) {
        if (!encodedString) return new Uint8Array(0);

        const [startBitStr, countsStr] = encodedString.split('|');
        let currentBit = parseInt(startBitStr, 10);
        const counts = countsStr.split(' ').map(Number);

        let totalLen = 0;
        for (let i = 0; i < counts.length; i++) totalLen += counts[i];
        const decodedData = new Uint8Array(totalLen);

        let pos = 0;
        for (let i = 0; i < counts.length; i++) {
            const count = counts[i];
            if (currentBit === 1) {
                decodedData.fill(1, pos, pos + count);
            }
            pos += count;
            currentBit ^= 1;
        }
        return decodedData;
    }

    // Load spike_correlation_table.json (as built by build_spike_table.py) and
    // index it into this._corr for is_player_touching_spike().
    async loadCorrelationTable(jsonPath = 'spike_correlation_table.json') {
        const data = await fetch(jsonPath).then(r => r.json());

        const corr = {
            W: data.width,
            H: data.height,
            // These are optional in the JSON (older table builds omit them).
            // Default matches spikes.c's spike_baked_load() default centering.
            dxOrigin: data.dx_origin !== undefined ? data.dx_origin : 65,
            dyOrigin: data.dy_origin !== undefined ? data.dy_origin : 64,
            table: new Map(),
        };

        for (const key in data.table) {
            // key = "<pdir>|<sdir>|<sid>|<costume>"
            const parts = key.split('|');
            if (parts.length !== 4) continue;
            const pdir = parseFloat(parts[0]);
            const sdir = parseInt(parts[1], 10);
            const sid  = parseInt(parts[2], 10);
            const costume = parts[3];

            const pi  = Touching._pdirToIndex(pdir);
            const si  = Touching._sdirDegToTableIdx(sdir);
            const shi = Touching._shapeToIndex(sid);
            const ci  = costume === 'Wall Crouch' ? 2 : (costume === 'Crouch' ? 1 : 0);
            if (si < 0 || shi < 0) continue;

            corr.table.set(`${pi}|${si}|${shi}|${ci}`, this.decodeBinaryRLE(data.table[key]));
        }

        this._corr = corr;
        this._corrReady = true;
        return corr;
    }

    unloadCorrelationTable() {
        this._corr = null;
        this._corrReady = false;
        this.ready = false;
    }

    // Checks one candidate tile against the given player position/dir/costume.
    // Mirrors check_tile() in spikes.c 1:1.
    _checkTile(playerState, physics, tx, ty, px, py) {
        const rowsCount = physics.MAP.length / physics.LSX;
        if (tx < 0 || tx >= physics.LSX || ty < 0 || ty >= rowsCount) return false;

        const idx  = tx + ty * physics.LSX;
        const tile = physics.MAP[idx];
        if (tile == null || !physics.MASK[tile] || !physics.MASK[tile].includes(2)) return false;

        const shi = Touching._shapeToIndex(tile);
        if (shi < 0) return false;

        const si = Touching._maprotToTableIdx(physics.MAP_R[idx]);
        if (si < 0) return false;

        const pi = Touching._pdirToIndex(playerState.direction);
        const ci = Touching._costumeIndex(playerState);

        const grid = this._corr.table.get(`${pi}|${si}|${shi}|${ci}`);
        if (!grid) return false;

        const centerX = tx * 60 + 30;
        const centerY = ty * 60 + 30;
        const dx = px - centerX;
        const dy = py - centerY; // matches build_spike_table.py's row convention (verified against real data)

        const col = dx + this._corr.dxOrigin;
        const row = dy + this._corr.dyOrigin;
        if (col < 0 || col >= this._corr.W || row < 0 || row >= this._corr.H) return false;

        return grid[row * this._corr.W + col] === 1;
    }

    // O(<=N) correlation-table lookup for an arbitrary player-center position.
    // Checks EVERY tile the player's actual hitbox (per PSZ) overlaps, not just
    // a heuristic guess of tiles near a single point -- otherwise a player
    // straddling a tile boundary can miss a spike they're genuinely touching.
    // Lets callers (e.g. debug overlays) ask "would the player be touching a
    // spike if centered at (px, py)" without needing a real PlayerState.PLAYER_X/Y.
    is_player_touching_spike_at(px, py, playerState, physics) {
        if (!this._corrReady) return false;

        px = Math.round(px);
        py = Math.round(py);

        // Player's actual pixel-space bounding box, same extents used by the
        // old per-pixel scan's pTop/pBottom/pLeft/pRight -- padded by the
        // correlation table's own reach (dxOrigin/dyOrigin), not just the
        // player's PSZ hitbox. A spike's precomputed touch window can extend
        // well beyond the tile the player's box overlaps (e.g. a tall/pointed
        // spike reaching into a neighboring tile), so restricting candidates
        // to PSZ alone can miss real, pixel-confirmed touches. This padding
        // is intentionally generous.
        const psz = playerState.PSZ;
        const padX = this._corr.dxOrigin;
        const padY = this._corr.dyOrigin;
        const pLeft   = (psz ? px - psz[4] : px) - padX;
        const pRight  = (psz ? px + psz[2] : px) + padX;
        const pTop    = (psz ? py - psz[3] : py) - padY;
        const pBottom = (psz ? py + psz[1] : py) + padY;

        const txMin = Math.floor(Math.min(pLeft, pRight) / 60);
        const txMax = Math.floor(Math.max(pLeft, pRight) / 60);
        const tyMin = Math.floor(Math.min(pTop, pBottom) / 60);
        const tyMax = Math.floor(Math.max(pTop, pBottom) / 60);

        for (let ty = tyMin; ty <= tyMax; ty++) {
            for (let tx = txMin; tx <= txMax; tx++) {
                if (this._checkTile(playerState, physics, tx, ty, px, py)) return true;
            }
        }
        return false;
    }

    // Main entry point used by physics.js/simplephysics.js: is the player
    // (at their current PLAYER_X/PLAYER_Y) touching a spike right now?
    // Rounds PLAYER_X/PLAYER_Y to the nearest integer before lookup.
    is_player_touching_spike(playerState, physics) {
        return this.is_player_touching_spike_at(
            playerState.PLAYER_X, playerState.PLAYER_Y, playerState, physics
        );
    }
}
