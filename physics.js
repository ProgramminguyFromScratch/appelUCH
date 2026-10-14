class AppelPhysics {
    constructor(mapData, mapRotations, MAP_DATA, LSX, sharedTouching = null) {
        this.MAP = Array.isArray(mapData) ? mapData : Array.from(mapData);
        this.MAP_R = Array.isArray(mapRotations) ? mapRotations : Array.from(mapRotations);
        this.MAP_DATA = MAP_DATA;

        // Reuse a shared Touching instance (and its already-decoded
        // ~58MB correlation table) across rounds instead of rebuilding
        // it from scratch every time a level loads.
        this.touching = sharedTouching || (typeof Touching !== 'undefined' ? new Touching() : null);

        let maskStrings = [
            '          ', '          ', '5555   1h', '5555   1h',
            '5005   1h', '5000   1h', '5050   xh', '5..5   3h',
            '       2 ', '.00.   3 ', '5555   1h', '    02 4 ',
            '111100 2 ', '5055   1h', '5000   1 ', '****   5 ',
            '100100 2 ', '5555   1h', '5555   1h', '    04 4 ',
            '5555   1h', '5555   1h', '    00 2 ', '    80 6 ',
            '    81 6 ', '       5 ', '       5 ', '          ',
            '          ', '          ', '          ', '    06 4 ',
            '    82 4h', '5555   1h', '0660   6 ', '0660     ',
            '0660     ', '0660     ', '0660     ', '0660     ',
            '          ', '          ', '5665   6h', '5555    h',
            '5555   6h', '    08 4 ', '0600   6 ', '0600     ',
            '0600     ', '0600     ', '5775   6h', '5775   6h',
            '         ', '         ', '         ', '         ',
            '         ', '         ', '    09 4 ', '    84 4 ',
            '    60 7 ', '    10 4 ', '    11 4 ', '       5 ',
            '         ', '         ', '         ', '         ',
            '5555   1h', '    12 5 ', '    00 5 ', '    00 2 ',
            '6600   6 ', '100181 6 ', '....   3h', '    13 4 ',
            '    00 5 ', '.      3h', '   .   3h', '1111   2h',
            '1111   5h', '5115   2h', '5111   2h', '.00.   3h',
            '111100 2 ', '****00 5 ', '5555   1h'
        ];

        maskStrings = maskStrings.map(item => {
        return item.replaceAll(".", "2"); 
        });

        this.MASK = maskStrings.map(mask =>
            [...mask.slice(0, 4)].map(c =>
                c >= '0' && c <= '9' ? parseInt(c) : 0
            )
        );

        this.PSZ = [0, 17, 13, 17, 13];
        this.LSX = LSX;
        // World Y below which players die. Starts at the level's original
        // void boundary and is raised by the game loop over the race
        // timer, like the water level rising in a flooding room.
        this.lavaLevel = -30;
        // True only once the actual rising lava has started climbing.
        // Before that, `lavaLevel` still marks the level's original void
        // boundary, and falling past it should be an ordinary death that
        // costs a life like any other, not an instant all-lives kill.
        this.lavaActive = false;
        this.toverlap = 0;
        this.mask_char = 0;
        this.overlap = 0;
        this.collide = false;
        this.RESOLVE = [0, 0, 1, 0, -1, -1, 0, 1, 0, -1, -1, 1, -1, -1, 1, 1, 1];
        this._temp_coords = [0, 0];
        this.key_index = this.MAP.indexOf(70);
        // Height of the level in px; only non-null while a gravity-flipped player is mid-step.
        this._mirrorH = null;
        this.worldActiveIdx = [];
        this.worldActiveTyp = [];
        this.worldActiveFrame = [];
        this.worldActiveSpawn = [];
        this.tileUpdates = [];
        // Visual-only hook: called as onParticle(typ, x, y, srcIdx) for every crumble chunk that
        // breaks off (the Scratch game's `particle` block appending to its PARTICLE list; srcIdx is
        // the tile it came from, which the debris ignores while it falls out of it). Left null
        // for headless sims (speedrun.js) so nothing is spawned there.
        this.onParticle = null;
    }

    // The Scratch game's `crumble` list: 3 items per animation frame -- (costume, x, y) of the
    // 15px chunk that breaks off on that frame. costume 1 = crumble1 (dark), 2 = crumble2 (light).
    // x / y are chunk-grid coordinates 0..3 inside the tile (y counts up); `tick crumble` turns
    // them into pixel offsets with (v - 1.5) * 15. Read as item (frame*3 + offset - 2 .. - 0) of the
    // 1-based Scratch list, so the big block (8 frames) uses offset 0 and the mini block (4 frames)
    // offset 24. Derived from the chunk each tile costume (34-41 / 46-49) loses on that frame.
    static CRUMBLE = [
        2, 2, 2,  2, 0, 2,  1, 3, 2,  1, 1, 2,  2, 1, 3,  2, 3, 3,  1, 0, 3,  1, 2, 3,
        2, 0, 2,  1, 1, 2,  1, 0, 3,  2, 1, 3
    ];

    // `particle typ x y dx dy dir`: queue a particle at (x, y) displaced by (dx, dy), where the
    // displacement is rotated by the tile's rotation (dir: 1 = as drawn, 2 = right, 3 = down, 0 = left).
    particle(typ, x, y, dx, dy, dir, src) {
        if (!this.onParticle) return;
        let px, py;
        if (dir < 2) {
            if (dir === 0) { px = x - dy; py = y + dx; }
            else           { px = x + dx; py = y + dy; }
        } else if (dir === 2) { px = x + dy; py = y - dx; }
        else                  { px = x - dx; py = y - dy; }
        this.onParticle(typ, px, py, src);
    }

    // The particle part of `tick crumble`, run on every frame where the tile costume advances.
    crumbleParticle(idx, frame, offset) {
        if (!this.onParticle) return;
        const list = AppelPhysics.CRUMBLE;
        const icrum = frame * 3 + offset;        // 1-based, like the Scratch list
        const typ = list[icrum - 3];
        const tx = (list[icrum - 2] - 1.5) * 15;
        const ty = (list[icrum - 1] - 1.5) * 15;
        const nx = ((idx % this.LSX + this.LSX) % this.LSX) * 60 + 30;
        const ny = Math.floor(idx / this.LSX) * 60 + 30;
        const rot = this.MAP_R[idx];
        const td = Number.isInteger(rot) ? ((rot % 4) + 4) % 4 : 1;
        this.particle(typ, nx, ny - 7.5, tx, ty, td, idx);
    }

    // Map-only version of isSolidAt: how far (px) the point (x, y) is inside solid tile
    // geometry, measured for a push-out in direction `dir`; 0 if it isn't inside anything.
    tileOverlapAt(x, y, dir) {
        if (this.get_block_at(x, y) <= 4) return 0;
        if (dir === 1) return ((x % 30) + 30) % 30;
        if (dir > 0) return 30 - ((y % 30) + 30) % 30;
        if (dir === -1) return 30 - ((x % 30) + 30) % 30;
        return ((y % 30) + 30) % 30;
    }
    isPlaceableCell(idx) {
        if (idx < 0 || idx >= this.MAP.length) return false;
        const tile = this.MAP[idx];
        return tile === 0 || tile === 1;
    }
    isDeletableCell(idx) {
        if (idx < 0 || idx >= this.MAP.length) return false;
        const tile = this.MAP[idx];
        if (tile === 0 || tile === 1) return false;
        if (tile === 76 || tile === 63) return false;
        return true;
    }

    get_block_at(x, y) {
        // While a gravity-flipped player is being simulated, the whole step runs in a
        // vertically mirrored copy of the world (see enterMirror). Sampling the mirrored
        // point of the real map makes every collision rule work unchanged.
        if (this._mirrorH !== null) y = this._mirrorH - y - 1e-7;
        if(y < 0) return 0;
        const sx = (x / 60) | 0;
        const sy = (y / 60) | 0;
        const idx = sx + sy * this.LSX;

        const tile = this.MAP[idx];
        const mask = this.MASK[tile] ?? this.MASK[0];

        const rx = x - sx * 60;
        const ry = y - sy * 60;

        const mid = (rx < 30)
            ? (ry < 30 ? 1 : 2)
            : (ry < 30 ? 0 : 3);

        const rot = (mid - this.MAP_R[idx]) & 3;
        return mask[rot] ?? 0;
    }
    
    isSolidAt(x, y, dir, playerState) {
        this.mask_char = this.get_block_at(x, y);

        if (this.mask_char > 4) {
            let temp;

            if (dir === 1) {
                temp = ((x % 30) + 30) % 30;
            } else if (dir > 0) {
                temp = 30 - ((y % 30) + 30) % 30;
            } else if (dir === -1) {
                temp = 30 - ((x % 30) + 30) % 30;
            } else {
                temp = ((y % 30) + 30) % 30;
            }

            if (temp > this.overlap) {
                this.overlap = temp;
            }
        }

        for (const object of playerState.OBJ) {
            if (Math.abs(x - object.x) < object.width){
                if (Math.abs(y - object.y) < object.height) {
                    let temp;
                    if (dir > 0) {
                        if (dir === 1) {
                            temp = x - (object.x - object.width);
                        } else {
                            temp = (object.ny + object.height) - y;
                            playerState.friction_dx = object.frictionx;
                            playerState.friction_dy = object.frictiony;
                        }
                    } else {
                        if (dir === -1) {
                            temp = (object.x + object.width) - x;
                        } else {
                            temp = y - (object.y - object.height);
                            playerState.friction_dx = object.frictionx;
                            playerState.friction_dy = object.frictiony;
                        }
                    }
                    if (temp > this.overlap) {
                        this.overlap = temp;
                    }
                }
            }
        }
    }

    
    touching_wall_dx(playerState, dir) {
        if (playerState.player_state === 1 || playerState.is_falling < 3) {
            return;
        }

        this.overlap = 0;
        this.isSolidAt(playerState.PLAYER_X + dir * -30, playerState.PLAYER_Y + 8, dir, playerState);
        this.isSolidAt(playerState.PLAYER_X + dir * -30, playerState.PLAYER_Y - 8, dir, playerState);

        if (this.overlap === 0) {
            this.isSolidAt(playerState.PLAYER_X + dir * 4, playerState.PLAYER_Y + 4, dir, playerState);
            if (this.overlap > 0) {

                this.overlap = 0;
                this.isSolidAt(playerState.PLAYER_X + dir * 4, playerState.PLAYER_Y - 4, dir, playerState);

                if (this.overlap > 0 && Math.abs(playerState.PLAYER_SX) > 3) {

                    if ((dir !== playerState.flipped) || playerState.player_state === 3) {
                        playerState.player_state = 1;
                        this.set_flipped(playerState, dir);
                    }

                    playerState.player_wall = dir;
                }
            }
        }
    }

    full_overlap(x, y, dir, dxy2, playerState) {
        let tx = x;
        let ty = y;
        this.toverlap = 0;

        for (let i = 0; i < 4; i++) {
            this.overlap = 0;

            this.isSolidAt(tx, ty, dir, playerState);
            if (dir & 1) {
                this.isSolidAt(tx, ty + dxy2, dir, playerState);
            } else {
                this.isSolidAt(tx + dxy2, ty, dir, playerState);
            }

            if (this.overlap === 0) {
                return;
            }

            this.overlap += 0.01;
            this.toverlap += this.overlap;

            if (dir > 0) {
                if (dir === 1) {
                    tx -= this.overlap;
                } else {
                    ty += this.overlap;
                }
            } else {
                if (dir === -1) {
                    tx += this.overlap;
                } else {
                    ty -= this.overlap;
                }
            }
        }
    }

    set_flipped_safe(playerState, dir) {
        this.set_flipped(playerState, dir);

        let safe = null;
        let safed = 64;

        this.full_overlap(playerState.PLAYER_X - playerState.PSZ[4], playerState.PLAYER_Y + playerState.PSZ[1], 0, playerState.PSZ[4] + playerState.PSZ[2], playerState);

        if (this.toverlap > 0 && this.toverlap < safed) {
            safe = 0;
            safed = this.toverlap;
        }        

        this.full_overlap(playerState.PLAYER_X - playerState.PSZ[4], playerState.PLAYER_Y - playerState.PSZ[3], 2, playerState.PSZ[4] + playerState.PSZ[2], playerState);

        if (this.toverlap > 0 && this.toverlap < safed) {
            safe = 2;
            safed = this.toverlap;
        }

        this.full_overlap(playerState.PLAYER_X - playerState.PSZ[4], playerState.PLAYER_Y - playerState.PSZ[3], -1, playerState.PSZ[1] + playerState.PSZ[3], playerState);

        if (this.toverlap > 0 && this.toverlap < safed) {
            safe = -1;
            safed = this.toverlap;
        } 

        this.full_overlap(playerState.PLAYER_X + playerState.PSZ[2], playerState.PLAYER_Y - playerState.PSZ[3], 1, playerState.PSZ[1] + playerState.PSZ[3], playerState);

        if (this.toverlap > 0 && this.toverlap < safed) {
            safe = 1;
            safed = this.toverlap;
        } 

        if (safe !== null) {
            if (safe > 0) {
                if (safe > 1) {
                    playerState.PLAYER_Y += safed;
                } else {
                    playerState.PLAYER_X -= safed;
                }
            } else {
                if (safe > -1) {
                    playerState.PLAYER_Y -= safed;
                } else {
                    playerState.PLAYER_X += safed;
                }
            }

            this.resolve_collisions(true, playerState);
        }
    }

    
    make_upright(playerState) {
        if (playerState.flipped === 0) {
            return;
        }

        playerState.player_state = 1;
        this.set_flipped_safe(playerState, 0);
        this.overlap = 0;
    }


    check_square(x, y, playerState) {
        const left_x = x - playerState.PSZ[4];
        const right_x = x + playerState.PSZ[2];
        const top_y = y - playerState.PSZ[3];
        const bottom_y = y + playerState.PSZ[1];

        this.mask_char = 9;

        if (this.get_block_at(left_x, top_y) >= 5 || 
            this.get_block_at(right_x, top_y) >= 5) return;

        this.overlap = 0;
        this.isSolidAt(left_x, bottom_y, 0, playerState);
        if (this.overlap !== 0) return;

        this.isSolidAt(right_x, bottom_y, 0, playerState);
        if (this.overlap !== 0) return;

        if (this.get_block_at(left_x, y) >= 5 || this.get_block_at(right_x, y) >= 5) return;

        this.mask_char = -1;
    }

    
    resolve(x, y, deep, playerState) {
        const resolve = this.RESOLVE;

        for (let i2 = 1; i2 <= deep; i2++) {
            for (let i3 = 1; i3 < 16; i3 += 2) {
                playerState.PLAYER_X = x + resolve[i3] * i2;
                playerState.PLAYER_Y = y + resolve[i3 + 1] * i2;

                this.check_square(playerState.PLAYER_X, playerState.PLAYER_Y, playerState);
                if (this.mask_char < 5) {
                    return;
                }
            }
        }

        playerState.PLAYER_X = x;
        playerState.PLAYER_Y = y;
        playerState.PLAYER_DEATH = true;
    }

    resolve_collisions(deep, playerState) {
        this.check_square(playerState.PLAYER_X, playerState.PLAYER_Y, playerState);
        if (this.mask_char < 5) {
            return;
        }

        this.resolve(
            playerState.PLAYER_X,
            playerState.PLAYER_Y,
            deep ? 10 : 4,
            playerState
        );
    }

    movePlayerX(playerState) {
        const rem_x = playerState.PLAYER_X;

        const dir = playerState.PLAYER_SX > 0 ? 1 : -1;

        if (playerState.PLAYER_SX > 0) {
            playerState.PLAYER_X += playerState.PLAYER_SX + playerState.PSZ[2];
        } else {
            playerState.PLAYER_X += playerState.PLAYER_SX - playerState.PSZ[4];
        }

        this.overlap = 0;
        this.isSolidAt(playerState.PLAYER_X, playerState.PLAYER_Y + playerState.PSZ[1], dir, playerState);
        this.activeBlock(dir, playerState.PLAYER_X, playerState.PLAYER_Y + playerState.PSZ[1], playerState);
        this.isSolidAt(playerState.PLAYER_X, playerState.PLAYER_Y, dir, playerState);
        this.isSolidAt(playerState.PLAYER_X, playerState.PLAYER_Y - playerState.PSZ[3], dir, playerState);
        this.activeBlock(dir, playerState.PLAYER_X, playerState.PLAYER_Y - playerState.PSZ[3], playerState);

        if (this.overlap > 0) {
            if (this.overlap > Math.abs(playerState.PLAYER_SX) + 4) {
                const temp = playerState.PLAYER_X;
                playerState.PLAYER_X = rem_x + playerState.PLAYER_SX;
                this.resolve_collisions(false, playerState);

                if (playerState.PLAYER_DEATH) {
                    playerState.PLAYER_X = temp;
                } else {
                    return;
                }
            }

            if (playerState.PLAYER_SX > 0) {
                playerState.PLAYER_X -= 0.01 + this.overlap;
                this.touching_wall_dx(playerState, 1);
            } else {
                playerState.PLAYER_X += 0.01 + this.overlap;
                this.touching_wall_dx(playerState, -1);
            }

            this.overlap = 0;
            this.isSolidAt(playerState.PLAYER_X, playerState.PLAYER_Y + playerState.PSZ[1], dir, playerState);
            this.isSolidAt(playerState.PLAYER_X, playerState.PLAYER_Y, dir, playerState);
            this.isSolidAt(playerState.PLAYER_X, playerState.PLAYER_Y - playerState.PSZ[3], dir, playerState);

            if (this.overlap > 0) {
                playerState.PLAYER_DEATH = true;
            }

            playerState.PLAYER_SX *= 0.5;
        }

        playerState.PLAYER_X += playerState.PLAYER_SX > 0 ? -playerState.PSZ[2] : playerState.PSZ[4];

        if (playerState.PLAYER_X < 14) {
            playerState.PLAYER_X = 14;
            playerState.PLAYER_SX = 0;
        }

        if (playerState.PLAYER_X > this.LSX*60 - 14) {
            playerState.PLAYER_X = this.LSX*60 - 14;
            playerState.PLAYER_SX = 0;
        }
    }

    touching_wall_dy(playerState, dy) {
        playerState.PLAYER_SY = 0;

        if (dy === 1 && playerState.KEY_UP > 0) {
            playerState.PLAYER_SY = 4;
            if (playerState.friction_dy > 0) {
                playerState.PLAYER_SY += playerState.friction_dy;
            }
            playerState.is_falling = 0;
            playerState.player_wall = 0;
            this.set_flipped(playerState, 0);
        } else {
            if (dy === -1 && playerState.friction_dy < 0) {
                playerState.PLAYER_SY += playerState.friction_dy;
            }
        }
    }

    movePlayerY(playerState) {
        const saved_dy = playerState.PLAYER_SY;
        const dir = playerState.PLAYER_SY > 0 ? 0 : 2;

        if (playerState.PLAYER_SY > 0) {
            playerState.PLAYER_Y += playerState.PLAYER_SY + playerState.PSZ[1];
        } else {
            playerState.PLAYER_Y += playerState.PLAYER_SY - playerState.PSZ[3];
        }

        this.overlap = 0;
        playerState.friction = 0;
        playerState.friction_dx = 0;
        playerState.friction_dy = 0;
        this.isSolidAt(playerState.PLAYER_X + playerState.PSZ[2], playerState.PLAYER_Y, dir, playerState);
        this.activeBlock(dir, playerState.PLAYER_X + playerState.PSZ[2], playerState.PLAYER_Y, playerState);
        this.isSolidAt(playerState.PLAYER_X - playerState.PSZ[4], playerState.PLAYER_Y, dir, playerState);
        this.activeBlock(dir, playerState.PLAYER_X - playerState.PSZ[4], playerState.PLAYER_Y, playerState);

        if (this.overlap > 0) {
            const shouldPlayLandSfx = Math.abs(saved_dy) > 6 && playerState.is_falling > 4;

            if (saved_dy > 0) {
                playerState.PLAYER_Y -= 0.01 + this.overlap;
                this.touching_wall_dy(playerState, 1);

                if (shouldPlayLandSfx && typeof playSfx === 'function') playSfx('land');

                if (playerState.player_state === 1 || playerState.player_state === 3) {
                    playerState.player_state = 0;
                }
            } else {
                playerState.PLAYER_Y += 0.01 + this.overlap;
                this.touching_wall_dy(playerState, -1);

                if (shouldPlayLandSfx && typeof playSfx === 'function') playSfx('land');

                playerState.is_falling = 0;
                playerState.is_jumping = 0;

                playerState.player_wall = null; 

                if (playerState.player_state === 3) {
                    playerState.player_state = 0;
                }
            }
        }

        playerState.PLAYER_Y += saved_dy > 0 ? -playerState.PSZ[1] : playerState.PSZ[3];
    }

    
    set_flipped(playerState, flipped) {
        let temp = (flipped & 3) + 1;

        const isCrouch = playerState.player_state === 2;
        const isOnWall = playerState.player_wall !== null;

        playerState.PSZ[temp] = (playerState.player_wall === null && isCrouch) ? 7 : 17;
        temp = (temp & 3) + 1;
        playerState.PSZ[temp] = 13;
        temp = (temp & 3) + 1;
        playerState.PSZ[temp] = (isOnWall && isCrouch) ? 7 : 17;
        temp = (temp & 3) + 1;
        playerState.PSZ[temp] = 13;

        playerState.flipped = flipped;
    }

    can_get_up(playerState) {
        this.overlap = 0;
        const px = playerState.PLAYER_X;
        const py = playerState.PLAYER_Y;

        if (playerState.flipped === 0) {
            if (playerState.player_wall === 0) {
                let checkY = (py - playerState.PSZ[3]) - 8;
                this.isSolidAt(px - playerState.PSZ[4], checkY, 0, playerState);
                this.isSolidAt(px + playerState.PSZ[2], checkY, 0, playerState);
            } else {
                let checkY = py + playerState.PSZ[1] + 8;
                this.isSolidAt(px - playerState.PSZ[4], checkY, 0, playerState);
                this.isSolidAt(px + playerState.PSZ[2], checkY, 0, playerState);
            }
        } else if (playerState.flipped === 1) {
            let checkX = px - playerState.PSZ[4] - 8;
            this.isSolidAt(checkX, py + playerState.PSZ[1], 1, playerState);
            this.isSolidAt(checkX, py - playerState.PSZ[3], 1, playerState);
        } else if (playerState.flipped === -1) {
            let checkX = px + playerState.PSZ[2] + 8;
            this.isSolidAt(checkX, py + playerState.PSZ[1], -1, playerState);
            this.isSolidAt(checkX, py - playerState.PSZ[3], -1, playerState);
        }
    }


    positionNow(playerState) {
        if (playerState.player_state === 3) {
            playerState.direction += 22.5 * playerState.flipped;
            playerState.direction = ((playerState.direction % 360) + 360) % 360;
            if (playerState.direction > 180) playerState.direction -= 360;
            return;
        }

        if (playerState.player_state === 1) {
            let temp = (((((playerState.flipped + 1) * 90 - playerState.direction) + 180) % 360) - 180);

            if (Math.abs(temp) < 22.5) {
                playerState.direction = playerState.flipped + 90;
                playerState.player_state = 0;
            } else {
                if ((temp < 0) && !((temp = -180) && playerState.direction === 0)) {
                    playerState.direction -= 30;
                } else {
                    playerState.direction += 30;
                }
                return;
            }
        }

        playerState.direction = (playerState.flipped + 1) * 90;
        if (playerState.direction > 180) playerState.direction -= 360;
    }


    confirm_still_touching_wall(playerState) {
        const px = playerState.PLAYER_X;
        const py = playerState.PLAYER_Y;
        const wall = playerState.player_wall;

        this.overlap = 0;

        if (wall === 0) {
            this.isSolidAt(px, py + playerState.PSZ[1] + 1, 0, playerState);
        } else if (wall === 1) {
            const checkX = px + playerState.PSZ[2] + 1;
            this.isSolidAt(checkX, py, 0, playerState);
            this.activeBlock(wall, checkX, py, playerState);
            this.isSolidAt(checkX, py - playerState.PSZ[3], 0, playerState);
            this.activeBlock(wall, checkX, py - playerState.PSZ[3], playerState);
        } else if (wall === -1) {
            this.isSolidAt(px - playerState.PSZ[4] - 1, py, 0, playerState);
            this.activeBlock(wall, px - playerState.PSZ[4] - 1, py, playerState);
        }

        if (this.overlap === 0) {
            if (playerState.player_state === 2) {
                if (wall === 1) {
                    playerState.PLAYER_X += 10;
                } else if (wall === -1) {
                    playerState.PLAYER_X -= 10;
                } else if (wall === 0) {
                    playerState.PLAYER_Y += 10;
                }
            }
            playerState.player_wall = null;
            this.set_flipped(playerState, playerState.flipped);
        }
        
    }

    handle_player_left_right(playerState) {
        let maxSpeed = playerState.player_state === 2 ? 1.2 : 2.5;

        if (playerState.PLAYER_NO_SLOW > 0) {
            playerState.PLAYER_NO_SLOW -= 1;
            if (playerState.is_falling < 1) {
                playerState.PLAYER_SX *= 0.95;
            }
        } else {
            if (!(playerState.player_state === 3 && playerState.is_falling < 25)) {

                if (playerState.player_state === 3 && playerState.is_falling < 35) {
                    maxSpeed *= (playerState.is_falling - 25) * 0.1;
                }

                const playerWall = playerState.player_wall;
                if (playerWall !== null) {
                    if (playerWall !== 0) {
                        if (playerState.KEY_LEFT === 1) {
                            playerState.PLAYER_SX -= maxSpeed;
                            playerState.PLAYER_DIR = -1;
                            playerState.KEY_LEFT = 2;
                        }
                        if (playerState.KEY_RIGHT === 1) {
                            playerState.PLAYER_SX += maxSpeed;
                            playerState.PLAYER_DIR = 1;
                            playerState.KEY_RIGHT = 2;
                        }
                    }
                } else {
                    if (playerState.KEY_LEFT > 0) {
                        playerState.PLAYER_SX -= maxSpeed;
                        playerState.PLAYER_DIR = -1;
                        playerState.KEY_LEFT = 2;
                    }
                    if (playerState.KEY_RIGHT > 0) {
                        playerState.PLAYER_SX += maxSpeed;
                        playerState.PLAYER_DIR = 1;
                        playerState.KEY_RIGHT = 2;
                    }
                }

                if (playerState.player_state === 3 && playerState.is_falling < 30) {
                    playerState.PLAYER_SX += playerState.friction_dx - playerState.PLAYER_SX * 0.02 * (playerState.is_falling - 20);
                } else {
                    const absSx = Math.abs(playerState.friction_dx - playerState.PLAYER_SX);
                    if (absSx < 1) {
                        playerState.PLAYER_SX = playerState.friction_dx;
                    } else {
                        if (absSx > 2 || playerState.KEY_RIGHT > 0 || playerState.KEY_LEFT > 0) {
                            playerState.PLAYER_SX += (playerState.friction_dx - playerState.PLAYER_SX) * 0.2
                        } else {
                            playerState.PLAYER_SX = playerState.friction_dx
                        }
                    }
                }
            }
        }

        this.movePlayerX(playerState);
    }

    // Movement/death events for achievements. The game drains this list for
    // the local player only; capped so remote players' lists can't grow.
    emitEvent(playerState, kind) {
        if (!playerState.pendingEvents) playerState.pendingEvents = [];
        if (playerState.pendingEvents.length < 16) playerState.pendingEvents.push(kind);
    }

    start_wall_jump(playerState) {
        if (typeof playSfx === 'function') playSfx('wall_jump');
        this.emitEvent(playerState, 'walljump');

        playerState.is_jumping = 101;
        playerState.player_state = 3;

        const playerWall = playerState.player_wall;

        this.set_flipped(playerState, -playerWall);

        playerState.PLAYER_SY = 20;
        playerState.PLAYER_SX = -10 * playerWall;
        playerState.player_wall = null;
        playerState.is_falling = 10;
        playerState.KEY_UP = 2;
    }


    process_jump(playerState) {
        const KEY_UP = playerState.KEY_UP;

        if (KEY_UP === 1) {
            const playerWall = playerState.player_wall;

            if (playerWall !== null && (playerWall === 1 || playerWall === -1)) {
                this.start_wall_jump(playerState);
            } else {
                let is_jumping = playerState.is_jumping;
                if (is_jumping !== 100) {
                    const is_falling = playerState.is_falling;
                    const flipped = playerState.flipped;

                    if (is_falling < 3 || (flipped === 1 && is_falling < 5)) {
                        this.overlap = 0;
                        const px = playerState.PLAYER_X;
                        const py = playerState.PLAYER_Y;
                        const check_y = py + 15;

                        this.isSolidAt(px - playerState.PSZ[4], check_y, -99, playerState);
                        this.isSolidAt(px + playerState.PSZ[2], check_y, -99, playerState);

                        if (this.overlap === 0 && playerState.PLAYER_SY < 16) {
                            if (typeof playSfx === 'function') {
                                playSfx(is_jumping > 100 ? 'sidejump' : 'jump');
                            }
                            if (is_jumping > 100) {
                                this.emitEvent(playerState, 'sidejump');
                                // Two sidejumps within 3 frames of each other.
                                if (playerState.sjRecent > 0) this.emitEvent(playerState, 'double_sidejump');
                                playerState.sjRecent = 4;
                            } else {
                                this.emitEvent(playerState, 'jump');
                            }
                            playerState.KEY_UP = 2;
                            playerState.is_jumping = is_jumping + 1;
                            playerState.PLAYER_SY = 16;
                        }
                    }
                }
            }
        }

        let is_jumping = playerState.is_jumping;
        if (is_jumping > 0 && is_jumping < 5) {
            if (playerState.PLAYER_SY < 16) {
                playerState.PLAYER_SY = 16;
            }
            playerState.is_jumping = is_jumping + 1;
            playerState.KEY_UP = 2;
        }
    }


    
    handle_player_up_down(playerState) {
        playerState.PLAYER_SY -= 1.7;
        if (playerState.PLAYER_SY < -30) {
            playerState.PLAYER_SY = -30;
        }

        const playerWall = playerState.player_wall;
        if ((playerWall === 1 || playerWall === -1) && (playerState.PLAYER_SY < 0 || playerState.friction != 0)) {
            if (playerState.friction != 0) {
                playerState.PLAYER_SY += 1.7
            }
            playerState.PLAYER_SY += (playerState.friction_dy - playerState.PLAYER_SY) * 0.3;
        }

        if (playerState.KEY_UP > 0) {
            this.process_jump(playerState);
        } else {
            const is_jumping = playerState.is_jumping;
            if (is_jumping > 0 && is_jumping < 100) {
                playerState.is_jumping = 100;
            }
            if (playerState.PLAYER_SY > 0 ) {
                if (playerState.is_falling > 1 && playerState.player_state === 0) {
                    playerState.PLAYER_SY = playerState.PLAYER_SY - 1;
                } 
            } else {
                if (playerState.player_state === 4) {
                    playerState.player_state = 0;
                }
            }
        }

        const playerStateVal = playerState.player_state;
        if (playerState.KEY_DOWN > 0) {
            if (playerStateVal !== 1 && playerStateVal !== 3) {
                playerState.player_state = 2;
                this.set_flipped(playerState, playerState.flipped);
                this.resolve_collisions(false, playerState);
            }
        } else if (playerStateVal === 2) {
            this.can_get_up(playerState);
            if (this.overlap === 0) {
                playerState.player_state = 0;
                this.set_flipped(playerState, playerState.flipped);
                this.resolve_collisions(false, playerState);
            }
        }

        playerState.is_falling += 1;
        this.movePlayerY(playerState);
    }

    check_dangers(playerState) {
        if (playerState.PLAYER_Y < this.lavaLevel) {
            playerState.PLAYER_DEATH = true;
            // Only treat this as a lava death (which skips the lives system
            // and eliminates immediately) once the lava has actually started
            // rising. Simply falling below the map before then is a normal
            // death and should just cost a life like spikes do.
            if (this.lavaActive) {
                playerState.PLAYER_DEATH_LAVA = true;
            } else {
                playerState.PLAYER_DEATH_VOID = true;
            }
            return;
        }
        // With gravity flipped there is no floor to fall off, so the void is above the level:
        // dying once the player is 10 blocks higher than the highest solid tile.
        if (playerState.gravityFlipped) {
            const topSolid = this._getTopSolidY();
            const limit = topSolid >= 0 ? topSolid + AppelPhysics.FLIPPED_VOID_BLOCKS * 60
                                        : (this.MAP.length / this.LSX) * 60 + 120;
            if (playerState.PLAYER_Y > limit) {
                playerState.PLAYER_DEATH = true;
                playerState.PLAYER_DEATH_VOID = true;
                return;
            }
        }
        if (!this.touching){console.error("spikes not loaded")}

        const isInSpikeTile = 
        this.get_block_at(playerState.PLAYER_X + playerState.PSZ[2] - 1, playerState.PLAYER_Y) === 2 
        || this.get_block_at(playerState.PLAYER_X - (playerState.PSZ[4] - 1), playerState.PLAYER_Y) === 2 
        || this.get_block_at(playerState.PLAYER_X, playerState.PLAYER_Y + playerState.PSZ[1] - 1) === 2
        || this.get_block_at(playerState.PLAYER_X, playerState.PLAYER_Y - (playerState.PSZ[3] - 1)) === 2;

        if (playerState.wasInSpikeTileLastFrame) {
            if (this.touching.is_player_touching_spike(playerState, this)) {
                playerState.PLAYER_DEATH = true;
            }
        }
        playerState.wasInSpikeTileLastFrame = isInSpikeTile;
    }

    activeBlock(dir, tileX, tileY, playerState) {
        // In a gravity-flipped step the coordinates / directions we are handed are mirrored;
        // translate them back so the tile lookup and conveyor rules see the real world.
        const mirrored = this._mirrorH !== null;
        if (mirrored) {
            tileY = this._mirrorH - tileY - 1e-7;
            if (dir === 0) dir = 2; else if (dir === 2) dir = 0;
        }
        const tileIdx = Math.floor(tileX / 60) + Math.floor(tileY / 60) * this.LSX;
        if (this.mask_char === 6 && !playerState.activeIdxSpawn.includes(tileIdx)) {
            playerState.activeIdxSpawn.push(tileIdx);
        }
        if (this.mask_char === 7) {
            if ((((this.MAP_R[tileIdx] + 1) % 4) + 4) % 4 === ((dir % 4) + 4) % 4) {
                let temp;
                if (this.MAP[tileIdx] === 50) {
                    temp = 5;
                } else {
                    temp = -5; 
                }
                if (dir === 2) {
                    playerState.friction_dx = temp;
                    return
                }
                if (dir === 1) {
                    playerState.friction_dy = mirrored ? -temp : temp;
                    playerState.friction = 1;
                    return
                }
                if (dir === 0) {
                    playerState.friction_dx = -temp;
                    return
                }  
                if (dir === -1) {
                    playerState.friction_dy = mirrored ? temp : -temp;
                    playerState.friction = 1;
                    return
                }                
            }
        }
    }

    tickActive(playerState) {
        for (const activeTile of playerState.activeIdxSpawn) {
            const tile = this.MAP[activeTile];
            if (tile === 42){
                playerState.activeIdx.push(activeTile);
                playerState.activeTyp.push("spring");
                playerState.activeFrame.push(0);
            } else if (tile === 34 || tile === 46){
                if (!this.worldActiveIdx.includes(activeTile) && !this.worldActiveSpawn.includes(activeTile)) {
                    this.worldActiveSpawn.push(activeTile);
                }
            } else if (tile === 72){
                this.touchingDoor(playerState, activeTile);
            }
        }
        playerState.activeIdxSpawn.length = 0;
        for (let i = 0; i < playerState.activeIdx.length; i++) {
            if (playerState.activeTyp[i] === "spring") {
                this.tick_spring(playerState, playerState.activeIdx[i], playerState.activeFrame[i], this.MAP_R[playerState.activeIdx[i]], i);
            }
        }
    }
    checkWorldTileTriggers(playerState) {
        const points = [
            [playerState.PLAYER_X + playerState.PSZ[2] - 1, playerState.PLAYER_Y],
            [playerState.PLAYER_X - (playerState.PSZ[4] - 1), playerState.PLAYER_Y],
            [playerState.PLAYER_X, playerState.PLAYER_Y + playerState.PSZ[1] - 1],
            [playerState.PLAYER_X, playerState.PLAYER_Y - (playerState.PSZ[3] - 1)]
        ];
        for (const [px, py] of points) {
            if (this.get_block_at(px, py) !== 6) continue;
            const tileIdx = Math.floor(px / 60) + Math.floor(py / 60) * this.LSX;
            const tile = this.MAP[tileIdx];
            if (tile !== 34 && tile !== 46) continue;
            if (this.worldActiveIdx.includes(tileIdx) || this.worldActiveSpawn.includes(tileIdx)) continue;
            this.worldActiveSpawn.push(tileIdx);
        }
    }
    tickWorldActive(allPlayerStates, triggerPlayerStates) {
        for (const ps of triggerPlayerStates) {
            if (ps) this.checkWorldTileTriggers(ps);
        }

        for (const tileIdx of this.worldActiveSpawn) {
            const tile = this.MAP[tileIdx];
            if (tile === 34) {
                if (typeof playSfx === 'function') playSfx('crumble');
                this.worldActiveIdx.push(tileIdx);
                this.worldActiveTyp.push("crumble");
                this.worldActiveFrame.push(0.5);
            } else if (tile === 46) {
                if (typeof playSfx === 'function') playSfx('crumble');
                this.worldActiveIdx.push(tileIdx);
                this.worldActiveTyp.push("crumble2");
                this.worldActiveFrame.push(0.5);
            }
        }
        this.worldActiveSpawn.length = 0;

        for (let i = 0; i < this.worldActiveIdx.length; i++) {
            if (this.worldActiveTyp[i] === "crumble") {
                this.tickCrumbleWorld(this.worldActiveIdx[i], i, 8, 34, 0, 0.5, allPlayerStates);
            } else {
                this.tickCrumbleWorld(this.worldActiveIdx[i], i, 4, 46, 24, 0.25, allPlayerStates);
            }
        }
    }

    touchingDoor(playerState, idx) {
        if (!playerState.has_key) return;
        this.MAP[idx] = 1;
        playerState.PLAYER_SX = 0;
    }

    tickCrumble(playerState, idx, a, max, costume, inc){
        if (playerState.activeFrame[a] > max && playerState.activeFrame[a] <= 80) {
            if (playerState.activeFrame[a] + 0.5 > 81) {
                const nx = ((idx % this.LSX + this.LSX) % this.LSX) * 60 + 30
                const ny = Math.floor(idx / this.LSX) * 60 + 30
                if (Math.abs(playerState.PLAYER_X - nx) < 45 && Math.abs(playerState.PLAYER_Y - ny) < 45) {
                    return;
                }
            }
        }
        playerState.activeFrame[a] += inc;
        if (playerState.activeFrame[a] <= max) {
            if (playerState.activeFrame[a] % 1 < inc) {
                if (playerState.activeFrame[a] < max) {
                    this.MAP[idx] = costume + playerState.activeFrame[a];
                } else {
                    this.MAP[idx] = 1;
                }
            }
        } else {
            playerState.activeFrame[a] += 0.5 - inc;
            if (playerState.activeFrame[a] > 80) {
                if (playerState.activeFrame[a] > 80 + max) {
                    this.MAP[idx] = costume;
                    playerState.activeIdx.splice(a, 1);
                    playerState.activeTyp.splice(a, 1);
                    playerState.activeFrame.splice(a, 1);
                    return;
                } else {
                    if (playerState.activeFrame[a] % 1 === 0) {
                    this.MAP[idx] = (costume + max) + (80 - playerState.activeFrame[a]);
                    }
                }
            }
        }
    }
    tickCrumbleWorld(idx, a, max, costume, offset, inc, playerStates) {
        if (this.worldActiveFrame[a] > max && this.worldActiveFrame[a] <= 80) {
            if (this.worldActiveFrame[a] + 0.5 > 80) {
                const nx = ((idx % this.LSX + this.LSX) % this.LSX) * 60 + 30
                const ny = Math.floor(idx / this.LSX) * 60 + 30
                const someoneStanding = playerStates.some(ps => ps &&
                    Math.abs(ps.PLAYER_X - nx) < 45 && Math.abs(ps.PLAYER_Y - ny) < 45);
                if (someoneStanding) {
                    return;
                }
            }
        }
        this.worldActiveFrame[a] += inc;
        if (this.worldActiveFrame[a] <= max) {
            if (this.worldActiveFrame[a] % 1 < inc) {
                if (this.worldActiveFrame[a] < max) {
                    this.MAP[idx] = costume + this.worldActiveFrame[a];
                    this.tileUpdates.push({ idx, tile: this.MAP[idx] });
                } else {
                    this.MAP[idx] = 1;
                    this.tileUpdates.push({ idx, tile: this.MAP[idx] });
                }
                this.crumbleParticle(idx, this.worldActiveFrame[a], offset);
            }
        } else {
            this.worldActiveFrame[a] += 0.5 - inc;
            if (this.worldActiveFrame[a] > 80) {
                if (this.worldActiveFrame[a] > 80 + max) {
                    this.MAP[idx] = costume;
                    this.tileUpdates.push({ idx, tile: this.MAP[idx] });
                    this.worldActiveIdx.splice(a, 1);
                    this.worldActiveTyp.splice(a, 1);
                    this.worldActiveFrame.splice(a, 1);
                    return;
                } else {
                    if (this.worldActiveFrame[a] % 1 === 0) {
                        this.MAP[idx] = (costume + max) + (80 - this.worldActiveFrame[a]);
                        this.tileUpdates.push({ idx, tile: this.MAP[idx] });
                    }
                }
            }
        }
    }

    tick_spring(playerState, idx, frame, dir, a){
        if (frame === 0) {
            const nx = ((idx % this.LSX + this.LSX) % this.LSX) * 60 + 30
            const ny = Math.floor(idx / this.LSX) * 60 + 30

            if (((dir % 2) + 2) % 2 === 1) {
                if (Math.abs(playerState.PLAYER_X - nx) > 30) {
                    playerState.activeIdx.splice(a, 1);
                    playerState.activeTyp.splice(a, 1);
                    playerState.activeFrame.splice(a, 1);
                    return;
                } 
            } else {
                if (Math.abs(playerState.PLAYER_Y - ny) > 30) {
                    playerState.activeIdx.splice(a, 1);
                    playerState.activeTyp.splice(a, 1);
                    playerState.activeFrame.splice(a, 1);
                    return;
                }
                playerState.PLAYER_NO_SLOW = 15;
            }
            if (typeof playSfx === 'function') playSfx('spring');
            this.MAP[idx] = 43;
            this.tileUpdates.push({ idx, tile: 43 });

            let [ux, uy] = this.getUXY((((dir % 4) + 4) % 4) - 1, 30);
            if (ux === 0) {
                playerState.PLAYER_SY = uy;
            } else {
                playerState.PLAYER_SX = ux;
            }
            const commandsIdx = this.MAP_DATA.indexOf("+" + String(idx + 1));

            if (commandsIdx != -1) {
                const cmds = this.parseCommands(this.MAP_DATA[commandsIdx + 1]);

                const dx = cmds.map(c => String(c).toLowerCase()).indexOf("x");
                if (dx != -1) {
                    playerState.PLAYER_SX = parseFloat(cmds[dx + 1]);
                    playerState.PLAYER_NO_SLOW = 15;
                    ux = playerState.PLAYER_SX;
                    uy = 0;
                }

                const dy = cmds.map(c => String(c).toLowerCase()).indexOf("y");
                if (dy != -1) {
                    playerState.PLAYER_SY = parseFloat(cmds[dy + 1]);
                }
            }
            playerState.player_state = 4;
            if (uy === 0) {
                // PLAYER_DIR is the *render* facing, which is inverted while gravity is flipped.
                playerState.PLAYER_DIR = (playerState.gravityFlipped ? -1 : 1) * (ux / Math.abs(ux));
            }
        }
        playerState.activeFrame[a] += 1;
        if (frame === 26) {
            this.MAP[idx] = 42;
            this.tileUpdates.push({ idx, tile: 42 });
            playerState.activeIdx.splice(a, 1);
            playerState.activeTyp.splice(a, 1);
            playerState.activeFrame.splice(a, 1);
        }
    }

    getUXY(dir, mul) {
        switch (dir) {
            case 1:  return [mul, 0];
            case -1: return [-mul, 0];
            case 2:  return [0, -mul];
            case 0: return [0, mul];
        }
    }

    spawnOBJ(levelData){
        let OBJ = [];
        for (let idx = 0; idx <= levelData.map.length; idx++) {
            if (levelData.map[idx] === 23 || levelData.map[idx] === 24) {
                
                const x = (idx % levelData.size_x) * 60 + 30 - 15 * (levelData.rotations[idx] % 2 === 0) + 30 * (levelData.rotations[idx] === 2);
                const y = Math.floor(idx / levelData.size_x) * 60 + 30 - 15 * (levelData.rotations[idx] % 2 === 1) + 30 * (levelData.rotations[idx] === 1);

                let dir = levelData.rotations[idx] % 2 === 1 ? -1 : 0;
                if (levelData.map[idx] === 24) {
                    dir = (dir + 2) % 4 - 1
                }

                const commandsIdx = this.MAP_DATA.indexOf("+" + String(idx + 1));
                const cmds = this.parseCommands(this.MAP_DATA[commandsIdx + 1]).map(c => String(c).toLowerCase());

                const getVal = (arr, char, defaultVal) => {
                    let index = arr.indexOf(char);
                    if (index === -1 || index + 1 >= arr.length) return defaultVal;
                    let val = parseFloat(arr[index + 1]);
                    return Number.isNaN(val) ? defaultVal : val;
                };

                OBJ.push(
                    {
                        typ: "lift",
                        x: x,
                        y: y,
                        height: levelData.rotations[idx] % 2 === 1 ? 15 : 30,
                        width: levelData.rotations[idx] % 2 === 1 ? 30 : 15,
                        acc: getVal(cmds, "a", 15) / 100,
                        frame: getVal(cmds, "h", 0),
                        dir: dir,
                        direction: levelData.rotations[idx] * 90,
                        speed: getVal(cmds, "s", 4),
                        reach: 0,
                        dx: 0,
                        dy: 0,
                        nx: x,
                        ny: y,
                        frictionx: 0,
                        frictiony: 0,
                        delay: getVal(cmds, "d", 5),
                        group: getVal(cmds, "g", null)
                    }
                )
            }
        }
        return OBJ;
    }
    tickObj(OBJ) {
        for (let object of OBJ) {
            object.frictionx = object.nx - object.x;
            object.frictiony = object.ny - object.y;

            object.x = object.nx;
            object.y = object.ny;

            object.frame -= 1;
            if (object.frame > 0) continue;

            this.overlap = null;
            this.collide = false;
            if (object.dir < 2) {
                if (object.dir === 0) {
                    this.accelerateDy(object, 1);
                } else {
                    this.accelerateDx(object, 1);
                }
            } else {
                if (object.dir === 2) {
                    this.accelerateDy(object, -1);
                } else {
                    this.accelerateDx(object, -1);
                }
            }
            object.nx += Math.round(object.dx);
            object.ny += Math.round(object.dy);

            if (this.overlap != null) {
                if (this.collide) {
                    object.dx = 0;
                    object.dy = 0;
                    object.frame = object.delay;

                    object.nx = Math.round(object.nx / 15) * 15
                    object.ny = Math.round(object.ny / 15) * 15
                } else {
                    object.dir = (object.dir + 2) % 4
                }
            }
        }
    }
    applyObjPush(playerState) {
        for (let object of playerState.OBJ) {
            if ((playerState.PLAYER_X + this.PSZ[2] > object.nx - object.width) && (playerState.PLAYER_X - this.PSZ[4] < object.nx + object.width)) {
                if ((playerState.PLAYER_Y + this.PSZ[1] > object.ny - object.height) && (playerState.PLAYER_Y - this.PSZ[3] < object.ny + object.height)) {
                    playerState.PLAYER_X += object.nx - object.x;
                    playerState.PLAYER_Y += object.ny - object.y;
                }
            }
        }
    }

    accelerateDx(object, mul) {
        if ((object.dx * mul) < object.speed) {
            object.dx += object.acc * mul;
            if (object.dx * mul > object.speed) {
                object.dx = object.speed * mul;
            }
            object.reach = mul * (((object.dx * object.dx) / (2 * object.acc)) + object.width)
        }
        if (mul * object.dx < 0) {
            this.overlap = null;
            this.isSolidAtOBJ((object.x - (mul * object.width)) + object.dx, object.y, -mul, 0, true);
            if (this.overlap != null) {
                object.dx += mul * this.overlap;
            }
            this.collide = true;
        } else {
            this.isSolidAtOBJ(object.x + object.reach, object.y, 0, 0, true);
        }
    }

    accelerateDy(object, mul) {
        if ((object.dy * mul) < object.speed) {
            object.dy += object.acc * mul;
            if (object.dy * mul > object.speed) {
                object.dy = object.speed * mul;
            }
            object.reach = mul * (((object.dy * object.dy) / (2 * object.acc)) + object.height)
        }
        if (mul * object.dy < 0) {
            this.overlap = null;
            this.isSolidAtOBJ(object.x, (object.y - (mul * object.height)) + object.dy, mul + 1, 0, true);
            if (this.overlap != null) {
                object.dy += mul * this.overlap;
            }
            this.collide = true;
        } else {
            this.isSolidAtOBJ(object.x, object.y + object.reach, 0, 0, true);
        }
    }

    isSolidAtOBJ(x, y, dir, schk, spikeIsSolid) {
        let c = this.get_block_at(x, y, dir)

        if (spikeIsSolid && c === 2) {c = 9;} else { if (!spikeIsSolid && c === 2) c = 0;};

        if (c > schk) {
            let temp;
            if (dir > 0) {
                if (dir === 1) {
                    temp = ((x % 30) + 30) % 30;
                } else {
                    temp = 30 - ((y % 30) + 30) % 30;
                }
            } else {
                if (dir === -1) {
                    temp = 30 - ((x % 30) + 30) % 30;
                } else {
                    temp = ((y % 30) + 30) % 30;
                }
            }
            if (temp >= 0) {
                this.overlap = temp;
            }
        }
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
                cmds.push(c);
            }
        }
        if (dy != "") {
            cmds.push(dy);
        }
        return cmds;
    }

    isFlagAt(x, y) {
        const ix = Math.floor(x);
        const iy = Math.floor(y);

        const tx = Math.floor(ix / 60);
        const ty = Math.floor(iy / 60);

        const idx = tx + ty * this.LSX;
        return this.MAP[idx] === 63;
    }

    // ---- Gravity pads --------------------------------------------------------------
    // Tile 69 is a non-solid pad. Touching it flips the player's gravity; it stays flipped
    // until the next pad is touched. Gravity is per player (a flag on the player state).
    //
    // Flipped gravity is simulated by running the normal player step inside a vertically
    // mirrored copy of the world (enterMirror/exitMirror). Every collision, crouch, wall-jump
    // and conveyor rule then works unchanged, just upside down. All of the transforms below
    // are their own inverse, so entering and exiting use the same code.
    static GRAVITY_PAD_TILE = 69;
    static GRAVITY_PAD_ZONE = 30;   // px of the cell (measured from the pad's base) that triggers it
    static FLIPPED_VOID_BLOCKS = 10; // flipped players die this many blocks above the highest solid tile

    // World-space top edge of the highest tile that has any collision (-1 if none). Cached
    // briefly because pieces can be placed/removed mid-round.
    _getTopSolidY() {
        if (this._topSolidY !== undefined && this._topSolidCountdown > 0) {
            this._topSolidCountdown--;
            return this._topSolidY;
        }
        const rows = this.MAP.length / this.LSX;
        let top = -1;
        outer:
        for (let r = rows - 1; r >= 0; r--) {
            for (let c = 0; c < this.LSX; c++) {
                const m = this.MASK[this.MAP[c + r * this.LSX]];
                if (m && (m[0] > 0 || m[1] > 0 || m[2] > 0 || m[3] > 0)) { top = (r + 1) * 60; break outer; }
            }
        }
        this._topSolidY = top;
        this._topSolidCountdown = 30;
        return top;
    }

    static mirrorAngle(a) {
        let r = (((-a) % 360) + 360) % 360;
        if (r > 180) r -= 360;
        return r;
    }

    _mirrorTransform(ps, H) {
        ps.PLAYER_Y = H - ps.PLAYER_Y;
        ps.PLAYER_SY = -ps.PLAYER_SY;
        ps.friction_dy = -ps.friction_dy;
        ps.direction = AppelPhysics.mirrorAngle(ps.direction);
        ps.PLAYER_DIR = -ps.PLAYER_DIR;
        const t = ps.PSZ[1]; ps.PSZ[1] = ps.PSZ[3]; ps.PSZ[3] = t;
        if (ps.OBJ) {
            for (const o of ps.OBJ) {
                o.y = H - o.y;
                o.ny = H - o.ny;
                o.frictiony = -o.frictiony;
            }
        }
    }

    enterMirror(ps) {
        const H = (this.MAP.length / this.LSX) * 60;
        this._mirrorTransform(ps, H);
        this._mirrorH = H;
    }

    exitMirror(ps) {
        const H = this._mirrorH;
        this._mirrorH = null;
        this._mirrorTransform(ps, H);
    }

    flipGravity(ps) {
        ps.gravityFlipped = !ps.gravityFlipped;

        // The render facing is inverted while flipped (see _mirrorTransform).
        ps.PLAYER_DIR = -ps.PLAYER_DIR;

        // Hitbox is stored in real-world form between ticks, so swap head/feet extents too.
        const t = ps.PSZ[1]; ps.PSZ[1] = ps.PSZ[3]; ps.PSZ[3] = t;

        // No bounce: velocity is left alone, so the player keeps their momentum and just
        // starts accelerating the other way.

        // is_falling / is_jumping are left alone. Let go of a floor/ceiling cling though
        // (which would now be the wrong surface).
        if (ps.player_wall === 0) {
            ps.player_wall = null;
            this.set_flipped(ps, ps.flipped);
        }
        // Spin the sprite around (player_state 1 = turning to its target orientation).
        if (ps.player_state === 0) ps.player_state = 1;
    }

    // ---- Cannons --------------------------------------------------------------------
    // Tile 31 is a non-solid barrel cannon. Touching its middle captures the player: they are
    // held inside (invulnerable to everything except lava / the void) for a moment, then fired
    // the way the barrel points, diagonally. Rotation: 1 = up-right as drawn, 2 = down-right,
    // 3 = down-left, 0 = up-left. Cannons are simulated client-side like the rest of the player.
    static CANNON_TILE = 31;
    static CANNON_DELAY = 18;     // ticks spent inside before firing
    static CANNON_SPEED = 34;     // launch speed in px/tick (total, split across both axes)
    static CANNON_NO_SLOW = 20;   // ticks of horizontal momentum kept after a sideways shot
    static CANNON_COOLDOWN = 30;  // ticks before the cannon you just left can catch you again
    static CANNON_CAPTURE = 24;   // px from the cannon's centre that grabs the player

    _cannonDirection(rot) {
        return [45, 135, -135, -45][rot];   // sprite angle that lines up with the barrel
    }

    _cannonRot(idx) {
        const r = this.MAP_R[idx];
        return Number.isInteger(r) ? (((r % 4) + 4) % 4) : 1;
    }

    // Returns true while the player is held inside a cannon (the normal step is skipped).
    tickCannon(ps) {
        if (ps.cannonCooldown > 0) ps.cannonCooldown--;
        if (ps.cannonIdx == null || ps.cannonIdx < 0) return false;

        const idx = ps.cannonIdx;
        if (this.MAP[idx] !== AppelPhysics.CANNON_TILE) { ps.cannonIdx = -1; return false; }

        const cx = (((idx % this.LSX) + this.LSX) % this.LSX) * 60 + 30;
        const cy = Math.floor(idx / this.LSX) * 60 + 30;
        const rot = this._cannonRot(idx);

        ps.PLAYER_X = cx;
        ps.PLAYER_Y = cy;
        ps.PLAYER_SX = 0;
        ps.PLAYER_SY = 0;
        ps.friction_dx = 0;
        ps.friction_dy = 0;
        ps.player_wall = null;
        ps.direction = this._cannonDirection(rot);   // whatever state the player was in, line up with the barrel
        ps.cannonTimer++;

        if (ps.cannonTimer < AppelPhysics.CANNON_DELAY) {
            this.check_dangers(ps);   // lava / void can still get you in there
            if (ps.PLAYER_DEATH) ps.cannonIdx = -1;
            return true;
        }

        // Fire.
        const comp = AppelPhysics.CANNON_SPEED * Math.SQRT1_2;
        const ux = [-comp, comp, comp, -comp][rot];   // real-world +Y is up
        const uy = [comp, comp, -comp, -comp][rot];
        ps.PLAYER_SX = ux;
        ps.PLAYER_SY = uy;
        ps.PLAYER_NO_SLOW = AppelPhysics.CANNON_NO_SLOW;
        ps.PLAYER_DIR = (ps.gravityFlipped ? -1 : 1) * (ux / Math.abs(ux));
        if (ps.player_state === 0) ps.player_state = 4;
        ps.cannonIdx = -1;
        ps.cannonLastIdx = idx;
        ps.cannonCooldown = AppelPhysics.CANNON_COOLDOWN;
        if (typeof playSfx === 'function') playSfx('cannon');
        return false;
    }

    tickCannonEnter(ps) {
        if (ps.PLAYER_DEATH || (ps.cannonIdx != null && ps.cannonIdx >= 0)) return;
        const rows = this.MAP.length / this.LSX;
        const col = Math.floor(ps.PLAYER_X / 60), row = Math.floor(ps.PLAYER_Y / 60);
        if (col < 0 || col >= this.LSX || row < 0 || row >= rows) return;
        const idx = col + row * this.LSX;
        if (this.MAP[idx] !== AppelPhysics.CANNON_TILE) return;
        if (idx === ps.cannonLastIdx && ps.cannonCooldown > 0) return;
        const R = AppelPhysics.CANNON_CAPTURE;
        if (Math.abs(ps.PLAYER_X - (col * 60 + 30)) > R || Math.abs(ps.PLAYER_Y - (row * 60 + 30)) > R) return;

        ps.cannonIdx = idx;
        ps.cannonTimer = 0;
        ps.PLAYER_X = col * 60 + 30;
        ps.PLAYER_Y = row * 60 + 30;
        ps.PLAYER_SX = 0;
        ps.PLAYER_SY = 0;
        ps.direction = this._cannonDirection(this._cannonRot(idx));
    }

    tickGravityPads(ps) {
        const left = ps.PLAYER_X - ps.PSZ[4];
        const right = ps.PLAYER_X + ps.PSZ[2];
        const bottom = ps.PLAYER_Y - ps.PSZ[3];
        const top = ps.PLAYER_Y + ps.PSZ[1];
        const rows = this.MAP.length / this.LSX;
        const c0 = Math.max(0, Math.floor(left / 60)), c1 = Math.min(this.LSX - 1, Math.floor(right / 60));
        const r0 = Math.max(0, Math.floor(bottom / 60)), r1 = Math.min(rows - 1, Math.floor(top / 60));
        const Z = AppelPhysics.GRAVITY_PAD_ZONE;

        let touching = false;
        for (let r = r0; r <= r1 && !touching; r++) {
            for (let c = c0; c <= c1; c++) {
                const idx = c + r * this.LSX;
                if (this.MAP[idx] !== AppelPhysics.GRAVITY_PAD_TILE) continue;

                // The pad sits on the "bottom" of its cell as drawn; rotation moves it to
                // another edge (1 = as drawn, 2 = left edge, 3 = top edge, 0 = right edge).
                const rot = Number.isInteger(this.MAP_R[idx]) ? (((this.MAP_R[idx] % 4) + 4) % 4) : 1;
                let x0 = c * 60, x1 = x0 + 60, y0 = r * 60, y1 = y0 + 60;
                if (rot === 1) y1 = y0 + Z;
                else if (rot === 3) y0 = y1 - Z;
                else if (rot === 2) x1 = x0 + Z;
                else x0 = x1 - Z;

                if (right > x0 && left < x1 && top > y0 && bottom < y1) { touching = true; break; }
            }
        }

        if (touching) {
            if (!ps.gravPadLatch) {
                ps.gravPadLatch = true;
                this.flipGravity(ps);
            }
        } else {
            ps.gravPadLatch = false;
        }
    }

    handleKey(playerState) {
        if (this.key_index > 0) {
            const y = Math.floor(this.key_index / this.LSX) * 60 + 30;
            const x = (this.key_index % this.LSX) * 60 + 30;
            if (Math.abs(x - playerState.PLAYER_X) < 26 && Math.abs(y - playerState.PLAYER_Y) < 26) {
                playerState.has_key = true;
                this.MAP[this.key_index] = 1;
            }
        }
    }

    tick(playerState, inputKeys) {

        const keys = keyCode(inputKeys)

        if (keys & 8) {
            if (playerState.KEY_UP < 1){
                playerState.KEY_UP = 1;
            }
        } else {
            playerState.KEY_UP = 0;
        }

        playerState.KEY_DOWN = (keys & 4) ? 1 : 0;       
        if (playerState.sjRecent > 0) playerState.sjRecent--;

        if (keys & 2) {
            if (playerState.KEY_LEFT < 1){
                playerState.KEY_LEFT = 1;
            }
        } else {
            playerState.KEY_LEFT = 0;
        }

        if (keys & 1) {
            if (playerState.KEY_RIGHT < 1){
                playerState.KEY_RIGHT = 1;
            }
        } else {
            playerState.KEY_RIGHT = 0;
        }

        if (this.tickCannon(playerState)) return playerState;

        this.tickActive(playerState);

        this.applyObjPush(playerState);

        // Gravity-flipped players are stepped inside the mirrored world (see enterMirror).
        // Spike / lava / void checks and the key pickup stay in real-world space.
        const mirror = !!playerState.gravityFlipped;

        if (mirror) this.enterMirror(playerState);
        this.resolve_collisions(false, playerState);
        if (mirror) this.exitMirror(playerState);

        this.check_dangers(playerState);

        if (mirror) this.enterMirror(playerState);

        this.handle_player_up_down(playerState);
        this.handle_player_left_right(playerState);

        const playerWall = playerState.player_wall;
        if (playerWall !== null) {
            if (playerWall === 0) {
                playerState.is_falling = 10;
            } else {
                playerState.is_falling = 0;
            }
            this.confirm_still_touching_wall(playerState);
        }

        if (playerState.player_state !== 1 && playerState.player_state !== 3) {
            if (playerState.flipped !== 0 && playerState.player_wall === null) {
                this.make_upright(playerState);
            }
        }

        this.positionNow(playerState);

        if (mirror) this.exitMirror(playerState);

        this.tickGravityPads(playerState);
        this.tickCannonEnter(playerState);

        this.handleKey(playerState);

        return playerState;
    }

    createDefaultGameState(obj, x = 128.0, y = 280.0) {
        const spawnIDX = this.MAP.indexOf(76);
        let newX, newY
        if (spawnIDX > 0) {
            newX = (((spawnIDX) % this.LSX) * 60) + 30;
            newY = Math.floor((spawnIDX) / this.LSX) * 60 + 17;
        } else {
            newY = y;
            newX = x
            while (this.get_block_at(x, newY - 30) > 4) {
                newY += 30;
            }
        }

        return {
            PLAYER_X: newX,
            PLAYER_Y: newY,
            PLAYER_SX: 0.0,
            PLAYER_SY: 0.0,
            PLAYER_DEATH: false,
            PLAYER_DEATH_LAVA: false,
            PLAYER_DEATH_VOID: false,
            pendingEvents: [],
            sjRecent: 0,
            PSZ: [0, 17, 13, 17, 13],
            is_jumping: 0,
            is_falling: 999,
            flipped: 0,
            player_state: 0,  
            player_wall: null,  
            direction: 90,
            PLAYER_DIR: 1,
            wasInSpikeTileLastFrame: false,
            friction_dx: 0,
            friction_dy: 0,
            friction: 0,
            PLAYER_NO_SLOW: 0,
            KEY_LEFT: 0,
            KEY_RIGHT: 0,
            KEY_DOWN: 0,
            KEY_UP: 0,
            activeIdxSpawn: [],
            activeIdx: [],
            activeTyp: [],
            activeFrame: [],
            has_key: false,
            gravityFlipped: false,
            gravPadLatch: false,
            cannonIdx: -1,
            cannonTimer: 0,
            cannonCooldown: 0,
            cannonLastIdx: -1,
            OBJ: obj
        }

    }

}

const _KEY_LOOKUP = {'D': 1, 'A': 2, 'S': 4, 'W': 8};

function keyCode(keys) {
    if (typeof keys === 'string') {
        let sum = 0;
        for (const k of keys) {
            sum += _KEY_LOOKUP[k] || 0;
        }
        return sum;
    } else {
        return keys;
    }
}

function decodeReplayCode(replayCode) {
    try {        
        const data = replayCode.slice(8).split('Ǉ').slice(4);

        let maxIndex = 0;
        for (let i = 0; i < data.length; i += 2) {
            const val = parseInt(data[i]);
            if (!isNaN(val)) maxIndex = Math.max(maxIndex, val);
        }
        if (data.length % 2 !== 0) {
            const finalVal = parseInt(data[data.length - 1]);
            if (!isNaN(finalVal)) maxIndex = Math.max(maxIndex, finalVal);
        }

        const inputs = new Array(maxIndex).fill("");
        
        const keyCombos = {};
        const keyMap = [
            ["D", 1], ["A", 2], ["S", 4], ["W", 8]
        ];

        for (let i = 0; i < 16; i++) {
            let keys = "";
            for (const [char, bit] of keyMap) {
                if (i & bit) keys += char;
            }
            keyCombos[i] = keys;
        }
        
        for (let i = 0; i < data.length - 1; i += 2) {
            const start = parseInt(data[i]) - 1;
            const keyValue = parseInt(data[i + 1]);

            if (isNaN(start) || isNaN(keyValue)) continue;

            const keys = keyCombos[keyValue] || "";

            let nextStart = NaN;
            if (i + 3 < data.length) { 
                nextStart = parseInt(data[i + 2]) - 1;
            }

            const end = isNaN(nextStart)
                ? inputs.length
                : Math.min(nextStart, inputs.length);

            for (let j = start; j < end; j++) {
                inputs[j] = keys;
            }
        }
        
        return inputs;
    } catch (error) {
        return "Error decoding replay";
    }
}