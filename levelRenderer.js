class LevelRenderer {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        
        this.tilesetCache = new Map();
        this.wallCache = new Map();
        this.backgroundVariants = new Map();
        this.playerSpriteCache = new Map();
        
        this.tiles = [];
        this.wallTiles = [];
        this.background = null;
        this.assetsLoaded = false;
        this.tileSize = 60;

        this.needsHue = [..."01111110010010001101100000000001100000000111000001100000001000000001000001001111111001"]
            .flatMap((c, i) => c === "1" ? [i] : []);
    }

    static getDataFromCode(code) {
        try {
            const tokens = code.substring(7).replaceAll("C", "-").replaceAll("B", "+").split("Z");
            const size_x = parseInt(tokens[0], 10);

            let cursor = 1;
            const readSegment = () => {
                const end = tokens.indexOf("", cursor);
                if (end === -1) {
                    const seg = tokens.slice(cursor);
                    cursor = tokens.length;
                    return seg;
                }
                const seg = tokens.slice(cursor, end);
                cursor = end + 1;
                return seg;
            };

            const MAP_data = readSegment();
            const MAP_R_data = readSegment();
            const MAP_DATA = readSegment();
            const WALL_DATA = readSegment();
            const remaining = tokens.slice(cursor);

            const MAP = [];
            for (let i = 0; i < MAP_data.length; i += 2) {
                const value = parseInt(parseFloat(MAP_data[i]));
                const count = parseInt(parseFloat(MAP_data[i + 1]));
                for (let j = 0; j < count; j++) MAP.push(value);
            }

            const MAP_R = [];
            for (let i = 0; i < MAP_R_data.length; i += 2) {
                let value = MAP_R_data[i];
                const count = parseInt(parseFloat(MAP_R_data[i + 1]));
                value = (value === 'Infinity' || (typeof value === 'string' && value.includes('e'))) ? 1 : parseFloat(value);
                for (let j = 0; j < count; j++) MAP_R.push(value);
            }

            const hue = remaining[remaining.length - 2];
            const hue2 = remaining[remaining.length - 1];

            return {
                map: MAP,
                rotations: MAP_R,
                size_x,
                MAP_DATA,
                hue,
                hue2,
                wall: WALL_DATA
            };
        } catch (e) {
            console.error("[getDataFromCode] Error:", e);
            return null;
        }
    }

    async loadAssets(onProgress) {        
        const loadImage = (src) => {
            return new Promise(resolve => {
                const img = new Image();
                img.onload = () => {
                    if (onProgress) onProgress();
                    resolve(img);
                };
                img.onerror = () => {
                    console.warn(`Failed to load: ${src}`);
                    if (onProgress) onProgress();
                    resolve(null);
                };
                img.src = src;
            });
        };

        const tilePromises = [];
        for (let i = 1; i <= 172; i++) {
            tilePromises.push(loadImage(`assets/tiles/${i}.svg`));
        }
        this.tiles = await Promise.all(tilePromises);

        const wallPromises = [];
        for (let i = 1; i <= 24; i++) {
            wallPromises.push(loadImage(`assets/wall/${i}.svg`));
        }
        this.wallTiles = await Promise.all(wallPromises);

        const dynamicPromises = [];
        for (let i = 1; i <= 1; i++) {
            dynamicPromises.push(loadImage(`assets/dynamic/${i}.svg`));
        }
        this.dynamicImages = await Promise.all(dynamicPromises);

        this.playerNormal = await loadImage('assets/player/stand.png');
        this.playerCrouch = await loadImage('assets/player/crouch.png');

        await new Promise(resolve => {
            const img = new Image();
            img.onload = () => { 
                this.background = img; 
                if (onProgress) onProgress();
                resolve(); 
            };
            img.onerror = () => {
                const fallback = document.createElement('canvas');
                fallback.width = 480; fallback.height = 360;
                const fctx = fallback.getContext('2d');
                fctx.fillStyle = '#4A90E2'; 
                fctx.fillRect(0, 0, 480, 360);
                this.background = fallback;
                if (onProgress) onProgress();
                resolve();
            };
            img.src = 'assets/bg.svg';
        });

        this.assetsLoaded = true;
    }

    initializeHuedAssets(levelData) {
        const hue = this.fixHue(levelData.hue);
        const hue2 = this.fixHue(levelData.hue2);

        this.getHuedTileset(hue);
        this.getHuedWalls(hue2);
    }
    getHuedPlayerSprite(hue) {
        if (!hue) return { normal: this.playerNormal, crouch: this.playerCrouch };
        if (this.playerSpriteCache.has(hue)) return this.playerSpriteCache.get(hue);

        const sprite = {
            normal: this.applyColorEffect(this.playerNormal, hue),
            crouch: this.applyColorEffect(this.playerCrouch, hue)
        };
        this.playerSpriteCache.set(hue, sprite);
        return sprite;
    }
    renderPlayer(playerPos, camera, hue = 0, name = "", color = "#ffffff", status = null) {
        if (!this.playerNormal || !this.playerCrouch) return;

        const sprite = this.getHuedPlayerSprite(hue);

        this.ctx.save();

        this.ctx.translate(this.canvas.width / 2, this.canvas.height / 2);
        this.ctx.scale(camera.zoom, camera.zoom);
        this.ctx.translate(-camera.x, camera.y);

        this.ctx.translate(playerPos.x, -playerPos.y);
        if (name) {
            this.ctx.save();
            this.ctx.scale(1 / camera.zoom, 1 / camera.zoom);
            
            const yOffset = playerPos.crouched && !playerPos.onWall ? 15 : 25;
            const scaledY = -yOffset * camera.zoom;

            this.ctx.font = "bold 12px Arial, sans-serif";
            this.ctx.textAlign = "center";
            this.ctx.lineWidth = 3;
            this.ctx.strokeStyle = "#000000";
            this.ctx.strokeText(name, 0, scaledY);
            this.ctx.fillStyle = color;
            this.ctx.fillText(name, 0, scaledY);
            this.ctx.restore();
        }

        const angle = (playerPos.angle - 90) || 0; 
        this.ctx.rotate(angle * Math.PI / 180);

        if (playerPos.dir === -1) {
            this.ctx.scale(-1, 1);
        }

        let image, dx, dy, dw, dh;
        if (playerPos.crouched) {
            const yOffset = playerPos.onWall ? -16 : -6;
            image = sprite.crouch;
            dx = -12; dy = yOffset; dw = 24; dh = 22;
        } else {
            image = sprite.normal;
            dx = -12; dy = -16; dw = 24; dh = 32;
        }

        if (status === 'dead' || status === 'won') {
            this.ctx.globalAlpha = 0.45;
        }

        this.ctx.drawImage(image, dx, dy, dw, dh);

        if (status === 'dead' || status === 'won') {
            this.ctx.globalCompositeOperation = 'source-atop';
            this.ctx.fillStyle = status === 'dead' ? '#ff3b30' : '#ffffff';
            this.ctx.fillRect(dx, dy, dw, dh);
            this.ctx.globalCompositeOperation = 'source-over';
        }

        this.ctx.restore();
    }

    renderDynamic(OBJ, camera) {
        if (!this.dynamicImages) return;

        this.ctx.save();

        this.ctx.translate(this.canvas.width / 2, this.canvas.height / 2);
        this.ctx.scale(camera.zoom, camera.zoom);
        this.ctx.translate(-camera.x, camera.y);

        for (let item of OBJ) {

            this.ctx.save();

            this.ctx.translate(item.x, -item.y);

            const angle = item.direction + 90 || 0; 
            this.ctx.rotate(angle * Math.PI / 180);

            const image = this.dynamicImages[0];
            this.ctx.drawImage(image, -image.width/2, -image.height/2);

            this.ctx.restore(); 
        }

        this.ctx.restore();
    }
    
    parseCommands(txt) {
        let cmds = [];
        let dy = "";
        const DIGITS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "." , "-"]
        for (let dx = 0; dx < txt.length; dx++) {
            const c = txt[dx];
            if (DIGITS.includes(c)) {
                dy += c;
            } else {
                if (dy != "") {
                    cmds.push(parseFloat(dy));
                    dy = "";
                }
                cmds.push(c.toLowerCase());
            }
        }
        if (dy != "") {
            cmds.push(parseFloat(dy));
        }
        return cmds;
    }

    getGroup(txt) {
        let num = "";
        const DIGITS = ["0","1","2","3","4","5","6","7","8","9",".","-"];

        for (let i = 0; i < txt.length; i++) {
            const c = txt[i];

            if (c === "g" || c === "G") {
                i++; 

                while (i < txt.length && DIGITS.includes(txt[i])) {
                    num += txt[i];
                    i++;
                }

                return parseFloat(num);
            }
        }

        return null; 
    }

    getHuedTileset(hue) {
        if (hue === 0) return this.tiles;
        if (this.tilesetCache.has(hue)) return this.tilesetCache.get(hue);

        const huedSet = this.tiles.map((tile, i) => {
            if (!tile) return null;
            return this.needsHue.includes(i % 86) 
                ? this.applyColorEffect(tile, hue) 
                : tile;
        });

        this.tilesetCache.set(hue, huedSet);
        return huedSet;
    }

    getHuedWalls(hue) {
        if (hue === 0) return this.wallTiles;
        if (this.wallCache.has(hue)) return this.wallCache.get(hue);

        const huedWalls = this.wallTiles.map(tile => 
            tile ? this.applyColorEffect(tile, hue) : null
        );

        this.wallCache.set(hue, huedWalls);
        return huedWalls;
    }

	rgbToHsv(r, g, b) {
		r /= 255;
		g /= 255;
		b /= 255;
		const max = Math.max(r, g, b),
			min = Math.min(r, g, b),
			d = max - min;
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

	hsvToRgb(h, s, v) {
		h /= 60;
		const c = v * s;
		const x = c * (1 - Math.abs(h % 2 - 1));
		const m = v - c;
		const [r, g, b] =
		h < 1 ? [c, x, 0] :
			h < 2 ? [x, c, 0] :
			h < 3 ? [0, c, x] :
			h < 4 ? [0, x, c] :
			h < 5 ? [x, 0, c] : [c, 0, x];
		return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
	}

    applyColorEffect(source, hueShift) {
        const canvas = document.createElement('canvas');
        canvas.width = source.width || 60;
        canvas.height = source.height || 60;

        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(source, 0, 0, canvas.width, canvas.height);

        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;

        for (let i = 0; i < data.length; i += 4) {
            if (data[i + 3] === 0) continue;

            if (hueShift >= 1000) {
                const gray = data[i];
                data[i] = gray;
                data[i + 1] = gray;
                data[i + 2] = gray;
            } else {
                const [h, s, v] = this.rgbToHsv(data[i], data[i+1], data[i+2]);
                let hNorm = (h / 360 + (hueShift % 200) / 200) % 1.0;
                const [r, g, b] = this.hsvToRgb(hNorm * 360, s, v);
                data[i] = r;
                data[i+1] = g;
                data[i+2] = b;
            }
        }

        ctx.putImageData(imageData, 0, 0);
        return canvas;
    }

    fixHue(hueShift) {
        let realhue;
        const hueShiftStr = String(hueShift);
        if (hueShift === 'Infinity' || hueShiftStr.includes("e") || hueShiftStr.includes("E")) realhue = 1000;
        else if (hueShiftStr === "" || hueShiftStr === " ") realhue = 0;
        else if (hueShiftStr.includes("c") || hueShiftStr.includes("C")) realhue = parseInt(hueShiftStr.replace(/c/gi, "-"));
        else realhue = parseInt(hueShiftStr) % 200;
        return realhue;
    }

    betterModBcJsIsWeird(n, m) {
        return ((n % m) + m) % m;
    }
    drawBombGlyph(ctx, cx, cy, size) {
        const r = size * 0.36;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.strokeStyle = '#c98a3d';
        ctx.lineWidth = Math.max(2, size * 0.05);
        ctx.beginPath();
        ctx.moveTo(r * 0.35, -r * 0.95);
        ctx.quadraticCurveTo(r * 0.9, -r * 1.6, r * 1.3, -r * 1.3);
        ctx.stroke();
        ctx.fillStyle = '#ffcc55';
        ctx.beginPath();
        ctx.arc(r * 1.3, -r * 1.3, size * 0.05, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#2b2b2b';
        ctx.beginPath();
        ctx.arc(0, size * 0.05, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#000';
        ctx.lineWidth = Math.max(1, size * 0.025);
        ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,0.18)';
        ctx.beginPath();
        ctx.arc(-r * 0.35, size * 0.05 - r * 0.35, r * 0.3, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
    }

    renderTilePreviews(levelData, camera, cells, alpha = 1, piece = null) {
        if (!this.assetsLoaded) return;
        const ctx = this.ctx;

        const hue = this.fixHue(levelData.hue);
        const activeTileset = this.getHuedTileset(hue);

        ctx.save();
        ctx.translate(this.canvas.width / 2, this.canvas.height / 2);
        ctx.scale(camera.zoom, camera.zoom);
        ctx.translate(-camera.x, camera.y);
        ctx.globalAlpha = alpha;

        for (const cell of cells) {
            const tileX = cell.col * 60 + 30;
            const tileY = -cell.row * 60 - 30;
            if (piece && piece.targetsSolid) {
                this.drawBombGlyph(ctx, tileX, tileY, 60 * 0.7);
                continue;
            }

            if (!cell.tile) continue;
            const rotation = ((cell.rotation % 4) + 4) % 4;

            for (let isForeground = 0; isForeground <= 1; isForeground++) {
                const offset = isForeground * 86;
                const tileIndex = cell.tile - 1 + offset;
                const tile = activeTileset[tileIndex];
                if (!tile) continue;

                ctx.save();
                ctx.translate(tileX, tileY);
                if (rotation !== 1) {
                    ctx.rotate((rotation - 1) * Math.PI / 2);
                }
                ctx.drawImage(tile, -tile.width / 2, -tile.height / 2, tile.width, tile.height);
                ctx.restore();
            }
        }

        ctx.restore();
    }
    renderPieceIcon(levelData, piece, cx, cy, boxSize) {
        if (!this.assetsLoaded || !piece) return;
        const ctx = this.ctx;
        if (piece.targetsSolid) {
            this.drawBombGlyph(ctx, cx, cy, boxSize * 0.9);
            return;
        }

        const hue = this.fixHue(levelData ? levelData.hue : 0);
        const activeTileset = this.getHuedTileset(hue);

        const cells = getPieceFootprintCells(piece, 0);
        const { width, height } = piece.footprint;
        const footprintPxW = width * this.tileSize;
        const footprintPxH = height * this.tileSize;
        const scale = Math.min(boxSize / footprintPxW, boxSize / footprintPxH);

        ctx.save();
        ctx.translate(cx, cy);
        ctx.scale(scale, scale);

        for (const cell of cells) {
            if (!cell.tile) continue;
            const tileX = (cell.dCol - (width - 1) / 2) * this.tileSize;
            const tileY = (cell.dRow - (height - 1) / 2) * this.tileSize;

            for (let isForeground = 0; isForeground <= 1; isForeground++) {
                const offset = isForeground * 86;
                const tileIndex = cell.tile - 1 + offset;
                const tile = activeTileset[tileIndex];
                if (!tile) continue;

                ctx.drawImage(tile, tileX - tile.width / 2, tileY - tile.height / 2, tile.width, tile.height);
            }
        }

        ctx.restore();
    }

    render(levelData, camera) {
        if (!this.assetsLoaded) return;

        const { width, height } = this.canvas;
        const ctx = this.ctx;

        const hue = this.fixHue(levelData.hue);
        const hue2 = this.fixHue(levelData.hue2);

        const activeTileset = this.getHuedTileset(hue);
        const activeWalls = this.getHuedWalls(hue2 + 15);

        ctx.clearRect(0, 0, width, height);

        const minCamX = this.canvas.width/camera.zoom/2;
        if (camera.x < minCamX) camera.x = minCamX;
        const minCamY = this.canvas.height/camera.zoom/2;
        if (camera.y < minCamY) camera.y = minCamY;

        const bgKey = `bg_${hue2}`;
        if (!this.backgroundVariants.has(bgKey)) {
            this.backgroundVariants.set(bgKey, this.applyColorEffect(this.background, hue2));
        }
        const bg = this.backgroundVariants.get(bgKey);

        const bgW = 560 * camera.zoom;
        const bgH = 440 * camera.zoom;
        const bgOffsetX = this.betterModBcJsIsWeird(-camera.x * 0.5 * camera.zoom, bgW) - bgW;
        const bgOffsetY = this.betterModBcJsIsWeird(camera.y * 0.5 * camera.zoom, bgH) - bgH;

        for (let tx = bgOffsetX; tx < width; tx += bgW) {
            for (let ty = bgOffsetY; ty < height; ty += bgH) {
                ctx.drawImage(bg, tx, ty, bgW + 2, bgH + 2);
            }
        }

        ctx.save();
        ctx.translate(width / 2, height / 2);
        ctx.scale(camera.zoom, camera.zoom);
        ctx.translate(-camera.x, camera.y); 

        const viewHalfW = (width / 2) / camera.zoom;
        const viewHalfH = (height / 2) / camera.zoom;

        const wallStartX = Math.max(0, Math.floor((camera.x/2 - viewHalfW) / 60)) - 1;
        const wallEndX = Math.min(levelData.wall.length / 2, Math.ceil((camera.x + viewHalfW) / 60)) - 1;

        for (let x = wallStartX; x < wallEndX; x++) {
            const wallIdx = this.betterModBcJsIsWeird(parseInt(levelData.wall[x * 2 + 1]) + 20, 24);
            const tile = activeWalls[wallIdx];
            if (!tile) continue;

            const wallX = (x - 1) * 60 + camera.x * 0.25 - 30;
            let wallY = -(levelData.wall[x * 2]) * 30 - 151 - camera.y * 0.25 - 20;

            const tileHeight = tile.height/2;

            for (let y = wallY; y < camera.y + this.canvas.height; y += tileHeight) {
                ctx.drawImage(tile, wallX, y);
            }
        }

        const startCol = Math.floor((camera.x - viewHalfW) / 60);
        const endCol = Math.ceil((camera.x + viewHalfW) / 60);
        const startRow = Math.floor((camera.y - viewHalfH) / 60);
        const endRow = Math.ceil((camera.y + viewHalfH) / 60);

        for (let isForeground = 0; isForeground <= 1; isForeground++) {
            const offset = isForeground * 86;
            for (let row = startRow; row <= endRow; row++) {
                const rowBase = row * levelData.size_x;
                for (let col = startCol; col <= endCol; col++) {
                    const idx = rowBase + col;
                    if (idx < 0 || idx >= levelData.map.length) continue;

                    const rawTileVal = levelData.map[idx];
                    if (rawTileVal === 0) continue;

                    const tileIndex = rawTileVal - 1 + offset;
                    const tile = activeTileset[tileIndex];
                    if (!tile) continue;

                    const rotation = levelData.rotations[idx] % 4;
                    const tileX = col * 60 + 30;
                    const tileY = -row * 60 - 30;

                    ctx.save();
                    ctx.translate(tileX, tileY);
                    if (rotation !== 1) {
                        ctx.rotate((rotation - 1) * Math.PI / 2);
                    }

                    const drawW = tile.width;
                    const drawH = tile.height;

                    ctx.drawImage(
                        tile, 
                        -drawW / 2, 
                        -drawH / 2, 
                        drawW, 
                        drawH
                    );

                    ctx.restore();
                }
            }
        }
        ctx.restore();
    }
}