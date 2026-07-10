class Touching {
    constructor() {
        this.spikes = null;
        this.ready = false;

        this.loadPromise = fetch('spikeHitboxes.json')
            .then(response => response.json())
            .then(data => {
                this.spikes = {};
                
                for (const key in data) {
                    const rleString = data[key]; 
                    this.spikes[key] = this.decodeBinaryRLE(rleString);
                }
                
                this.ready = true;
            })
            .catch(error => console.error('Error loading or decoding spikes:', error));


        this._bakedMap = null;
        this._bakedW   = 0;
        this._bakedH   = 0;
        this._hitboxCache = new Map();
    }

    decodeBinaryRLE(encodedString) {
        if (!encodedString) return [];

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

    is_pixel_on_spike(x, y, physics) {
        if (!this.ready) return false;

        const worldX = x;
        const worldY = y < 0 ? -y : y; 
        const tx = (worldX / 60) | 0;
        const ty = (worldY / 60) | 0;

        const localX = worldX % 60;
        const localY = worldY % 60;
        const offX = localX < 30 ? -1 : 1;
        const offY = localY < 30 ? -1 : 1;

        for (let i = 0; i < 4; i++) {
            let currTx, currTy;
            if      (i === 0) { currTx = tx;        currTy = ty; }
            else if (i === 1) { currTx = tx + offX; currTy = ty; }
            else if (i === 2) { currTx = tx;        currTy = ty + offY; }
            else              { currTx = tx + offX; currTy = ty + offY; }

            if (currTx < 0 || currTx >= physics.LSX || currTy < 0 || currTy >= (physics.MAP.length / physics.LSX)) continue;

            const idx  = currTx + currTy * physics.LSX;
            const tile = physics.MAP[idx];
            
            if (!physics.MASK[tile].includes(2)) continue;

            const spikeData = this.spikes[tile];
            if (!spikeData) continue;

            const dx = worldX - (currTx * 60 + 30);
            const dy = (currTy * 60 + 30) - worldY;

            if (dx < -50 || dx > 50 || dy < -50 || dy > 50) continue;

            const rot = physics.MAP_R[idx];
            let ix, iy;

            if (Number.isInteger(rot)) {
                if      (rot === 0) { ix = (-dy * 2) + 100; iy = (dx  * 2) + 100; }
                else if (rot === 1) { ix = (dx  * 2) + 100; iy = (dy  * 2) + 100; }
                else if (rot === 2) { ix = (dy  * 2) + 100; iy = (-dx * 2) + 100; }
                else               { ix = (-dx * 2) + 100; iy = (-dy * 2) + 100; }
            } else {
                const radians = (rot * 90 - 90) * Math.PI / 180;
                const cos = Math.cos(radians);
                const sin = Math.sin(radians);
                ix = (dx * cos + dy * sin) * 2 + 100;
                iy = (-dx * sin + dy * cos) * 2 + 100;
            }

            const fix = ix | 0;
            const fiy = iy | 0;

            if (fix >= 0 && fix < 200 && fiy >= 0 && fiy < 200) {
                const charIndex = (40000 - ((fiy + 1) * 200)) + fix;
                if (spikeData[charIndex] === 1) return true;
            }
        }

        return false;
    }

    is_pixel_on_player(px, py, playerState) {
        const spikes = this.spikes;
        if (!spikes) return false;

        const HITBOX_RES = 70;
        const HALF = HITBOX_RES / 2;
        const SCALE = 2;

        const dx = px - playerState.PLAYER_X;
        const dy = py + playerState.PLAYER_Y;

        const radians = playerState.direction * 0.017453292519943295;
        const cos = Math.cos(radians);
        const sin = Math.sin(radians);

        const srcX = (dx * cos + dy * sin) * SCALE + HALF;
        const srcY = (-dx * sin + dy * cos) * SCALE + HALF;

        const ix = srcX | 0;
        const iy = srcY | 0;

        if (ix < 0 || ix >= HITBOX_RES || iy < 0 || iy >= HITBOX_RES) return false;

        const base = spikes.player.length - HITBOX_RES;
        const charIndex = base - iy * HITBOX_RES + ix;

        if (charIndex < 0) return false;

        let source;
        if (playerState.player_state === 2) {
            source = playerState.player_wall == null ? spikes.crouched : spikes.wallcrouched;
        } else {
            source = spikes.player;
        }

        return source[charIndex] === 1;
    }

    is_player_touching_spike(playerState, physics) {
        if (this._bakedMap !== null) {
            return this._is_player_touching_spike_fast(playerState);
        }

        if (!this.ready || !this.spikes) return false;

        const px      = playerState.PLAYER_X;
        const py      = playerState.PLAYER_Y;
        const pLeft   = (px - playerState.PSZ[4]) | 0;
        const pRight  = (px + playerState.PSZ[2]) | 0;
        const pTop    = (py - playerState.PSZ[3]) | 0;
        const pBottom = (py + playerState.PSZ[1]) | 0;

        for (let y = pTop; y <= pBottom; y += 2) {
            for (let x = pLeft; x <= pRight; x += 2) {
                if (this.is_pixel_on_player(x, -y, playerState)) { 
                    if (this.is_pixel_on_spike(x, -y, physics)) {
                        return true;
                    }
                }
            }
        }

        return false;
    }

    bakeForLevel(physics) {
        if (!this.ready) {
            throw new Error('Touching: spike data not loaded yet — await loadPromise first');
        }

        const W = physics.LSX * 60;
        const H = (physics.MAP.length / physics.LSX) * 60;
        const map = new Uint8Array(W * H);

        for (let ty = 0; ty < (physics.MAP.length / physics.LSX); ty++) {
            for (let tx = 0; tx < physics.LSX; tx++) {
                const idx  = tx + ty * physics.LSX;
                const tile = physics.MAP[idx];

                // Only process spike tiles
                if (!physics.MASK[tile] || !physics.MASK[tile].includes(2)) continue;

                const spikeData = this.spikes[tile];
                if (!spikeData) continue;

                const rot      = physics.MAP_R[idx];
                const centerX  = tx * 60 + 30;
                const centerY  = ty * 60 + 30;
                const isIntRot = Number.isInteger(rot);
                let cosR = 0, sinR = 0;
                if (!isIntRot) {
                    const radians = (rot * 90 - 90) * Math.PI / 180;
                    cosR = Math.cos(radians);
                    sinR = Math.sin(radians);
                }

                for (let dy = -50; dy <= 50; dy++) {
                    const wy = centerY - dy;
                    if (wy < 0 || wy >= H) continue;
                    const wyRow = wy * W;

                    for (let dx = -50; dx <= 50; dx++) {
                        const wx = centerX + dx;
                        if (wx < 0 || wx >= W) continue;

                        let ix, iy;
                        if (isIntRot) {
                            if      (rot === 0) { ix = (-dy * 2) + 100; iy = (dx  * 2) + 100; }
                            else if (rot === 1) { ix = (dx  * 2) + 100; iy = (dy  * 2) + 100; }
                            else if (rot === 2) { ix = (dy  * 2) + 100; iy = (-dx * 2) + 100; }
                            else               { ix = (-dx * 2) + 100; iy = (-dy * 2) + 100; }
                        } else {
                            ix = (dx * cosR + dy * sinR) * 2 + 100;
                            iy = (-dx * sinR + dy * cosR) * 2 + 100;
                        }

                        const fix = ix | 0;
                        const fiy = iy | 0;
                        if (fix < 0 || fix >= 200 || fiy < 0 || fiy >= 200) continue;

                        const charIndex = (40000 - ((fiy + 1) * 200)) + fix;
                        if (spikeData[charIndex] === 1) map[wx + wyRow] = 1;
                    }
                }
            }
        }

        this._bakedMap = map;
        this._bakedW   = W;
        this._bakedH   = H;
        this._hitboxCache.clear();
    }
    unbake() {
        this._bakedMap = null;
        this._bakedW   = 0;
        this._bakedH   = 0;
        this._hitboxCache.clear();
    }

    _getHitboxOffsets(playerState) {
        const psz = playerState.PSZ;
        const key = `${playerState.direction}|${playerState.player_state}|${playerState.player_wall == null ? 0 : 1}|${psz[1]},${psz[2]},${psz[3]},${psz[4]}`;

        const cached = this._hitboxCache.get(key);
        if (cached) return cached;

        const dummy = {
            PLAYER_X:     0,
            PLAYER_Y:     0,
            direction:    playerState.direction,
            player_state: playerState.player_state,
            player_wall:  playerState.player_wall,
            PSZ:          psz,
        };

        const offsets = [];
        const pLeft   = -(psz[4] | 0);
        const pRight  =  (psz[2] | 0);
        const pTop    = -(psz[3] | 0);
        const pBottom =  (psz[1] | 0);

        for (let deltaY = pTop; deltaY <= pBottom; deltaY += 2) {
            for (let deltaX = pLeft; deltaX <= pRight; deltaX += 2) {
                if (this.is_pixel_on_player(deltaX, -deltaY, dummy)) {
                    offsets.push(deltaX, deltaY);
                }
            }
        }

        const result = new Int16Array(offsets);
        this._hitboxCache.set(key, result);
        return result;
    }
    
    _is_player_touching_spike_fast(playerState) {
        const offsets = this._getHitboxOffsets(playerState);
        const map = this._bakedMap;
        const W   = this._bakedW;
        const H   = this._bakedH;
        const px  = playerState.PLAYER_X | 0;
        const py  = playerState.PLAYER_Y | 0;
        const len = offsets.length;

        for (let i = 0; i < len; i += 2) {
            const wx = px + offsets[i];
            const wy = py + offsets[i + 1];
            if (wx >= 0 && wx < W && wy >= 0 && wy < H && map[wx + wy * W]) return true;
        }
        return false;
    }
}


// use this to encode binary for spikes:
// const encodeBinaryRLE = (data) => {
//     if (!data || data.length === 0) return "";

//     let result = [];
//     let currentVal = data[0];
//     let currentCount = 0;

//     for (let i = 0; i < data.length; i++) {
//         if (data[i] === currentVal) {
//             currentCount++;
//         } else {
//             result.push(currentCount);
//             currentVal = data[i];
//             currentCount = 1;
//         }
//     }
//     result.push(currentCount);

//     return `${data[0]}|${result.join(' ')}`; 
// };