class AppelPhysics {
    constructor(mapData, mapRotations, MAP_DATA, LSX) {
        this.MAP = Array.isArray(mapData) ? mapData : Array.from(mapData);
        this.MAP_R = Array.isArray(mapRotations) ? mapRotations : Array.from(mapRotations);
        this.MAP_DATA = MAP_DATA;

        this.touching = (typeof Touching !== 'undefined') ? new Touching() : null;

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
        return item.replaceAll(".", "2"); // Replace all occurrences of "." with "2" so that it can still convert to an int
        });

        this.MASK = maskStrings.map(mask =>
            [...mask.slice(0, 4)].map(c =>
                c >= '0' && c <= '9' ? parseInt(c) : 0
            )
        );

        this.PSZ = [0, 17, 13, 17, 13];
        this.LSX = LSX;
        this.toverlap = 0;
        this.mask_char = 0;
        this.overlap = 0;
        this.collide = false;
        this.RESOLVE = [0, 0, 1, 0, -1, -1, 0, 1, 0, -1, -1, 1, -1, -1, 1, 1, 1];
        this._temp_coords = [0, 0];
        this.key_index = this.MAP.indexOf(70);

        // Crumbling platforms (tile 34/46) are WORLD state, not player
        // state: the tile itself has to look/behave the same for every
        // player, no matter who stepped on it. So — unlike springs,
        // which only ever affect the one player bouncing on them —
        // their active/spawn/frame bookkeeping lives on the engine
        // itself instead of on a per-player `playerState.activeIdx*`
        // array. This also means it works for remote seats, which
        // never get physics.tick() called on them locally (see
        // game.js's update() — remote players are just repositioned
        // from network snapshots, so a per-playerState-only trigger
        // never fired for them and the tile never crumbled on your
        // screen even though the opponent was standing on it).
        this.worldActiveIdx = [];
        this.worldActiveTyp = [];
        this.worldActiveFrame = [];
        this.worldActiveSpawn = [];
    }

    // Whether a map cell is open ground for the BUILD phase to place a
    // player-grabbed piece on. Tile value 0 is truly empty (out-of-level/
    // never drawn), and tile value 1 is this format's standard open-air
    // tile — the background gap tile that fills most of a level, and
    // what tickCrumble()/tickActive() reset a broken tile back to once
    // it's fully gone. Both count as buildable open space. Every other
    // value is either solid or a functional marker (spawn 76, flag 63,
    // spring 42/43, crumble 34/46, lift spawner 23/24, key/door 70/72,
    // etc.) — several of those have an entirely non-solid MASK entry
    // too, so checking MASK alone isn't enough to tell them apart from
    // plain empty air; the tile value itself is what's reserved.
    isPlaceableCell(idx) {
        if (idx < 0 || idx >= this.MAP.length) return false;
        const tile = this.MAP[idx];
        return tile === 0 || tile === 1;
    }

    // Whether a map cell is a legal BUILD-phase target for a "targets
    // solid ground" piece (currently just `bomb` — see pieces.js). The
    // inverse of isPlaceableCell(): a bomb needs an existing tile to
    // remove, not open air to build on, so 0/1 (already-open cells) are
    // rejected here. Tiles 76 (spawn) and 63 (flag) are excluded too —
    // deleting either would break the round (no start point / no finish
    // line), so they're carved out as permanent regardless of what a
    // player places on top of everything else.
    isDeletableCell(idx) {
        if (idx < 0 || idx >= this.MAP.length) return false;
        const tile = this.MAP[idx];
        if (tile === 0 || tile === 1) return false;
        if (tile === 76 || tile === 63) return false;
        return true;
    }

    get_block_at(x, y) {
        if(y < 0) return 0;
        const sx = (x / 60) | 0;
        const sy = (y / 60) | 0;
        const idx = sx + sy * this.LSX;

        const tile = this.MAP[idx];
        const mask = this.MASK[tile];

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

            console.log(this.overlap, playerState.PLAYER_X)

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
            if (saved_dy > 0) {
                playerState.PLAYER_Y -= 0.01 + this.overlap;
                this.touching_wall_dy(playerState, 1);

                if (playerState.player_state === 1 || playerState.player_state === 3) {
                    playerState.player_state = 0;
                }
            } else {
                playerState.PLAYER_Y += 0.01 + this.overlap;
                this.touching_wall_dy(playerState, -1);

                playerState.is_falling = 0;
                playerState.is_jumping = 0;

                playerState.player_wall = null; // Player wall never is 2, I think this is from when you could bounce on your head from the ground.

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

    start_wall_jump(playerState) {
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
                    playerState.friction_dy = temp;
                    playerState.friction = 1;
                    return
                }
                if (dir === 0) {
                    playerState.friction_dx = -temp;
                    return
                }  
                if (dir === -1) {
                    playerState.friction_dy = -temp;
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
                // Crumble tiles are handled once per frame for every
                // player (local or remote) by tickWorldActive() below,
                // not per-playerState here — queue it into the shared
                // spawn list instead (deduped against anything already
                // crumbling or already queued this frame).
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

    // Detects crumble-tile (34/46) contact for a player using the same
    // 4-edge sample points check_dangers() already uses for spikes.
    // Runs for EVERY player each frame — local (already collision-
    // resolved this tick) and remote (whose x/y just came off the
    // network, see game.js's update()) alike — so an opponent standing
    // on a crumbling platform starts it decaying on your client too,
    // not just theirs.
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

    // Call once per frame (not per-player) with every player's current
    // physicsState (local players post-tick, remote players post-sync)
    // — see game.js's update(). Advances every crumbling tile exactly
    // once regardless of player count, so two players hitting the same
    // tile can't fight over independent frame counters, and a tile
    // crumbles identically on every client watching it.
    tickWorldActive(playerStates) {
        for (const ps of playerStates) {
            if (ps) this.checkWorldTileTriggers(ps);
        }

        for (const tileIdx of this.worldActiveSpawn) {
            const tile = this.MAP[tileIdx];
            if (tile === 34) {
                this.worldActiveIdx.push(tileIdx);
                this.worldActiveTyp.push("crumble");
                this.worldActiveFrame.push(0.5);
            } else if (tile === 46) {
                this.worldActiveIdx.push(tileIdx);
                this.worldActiveTyp.push("crumble2");
                this.worldActiveFrame.push(0.5);
            }
        }
        this.worldActiveSpawn.length = 0;

        for (let i = 0; i < this.worldActiveIdx.length; i++) {
            if (this.worldActiveTyp[i] === "crumble") {
                this.tickCrumbleWorld(this.worldActiveIdx[i], i, 8, 34, 0.5, playerStates);
            } else {
                this.tickCrumbleWorld(this.worldActiveIdx[i], i, 4, 46, 0.25, playerStates);
            }
        }
    }

    touchingDoor(playerState, idx) {
        if (!playerState.has_key) return;
        this.MAP[idx] = 1;
        playerState.PLAYER_SX = 0;
    }

    tickCrumble(playerState, idx, a, max, costume, inc){
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
                if (Math.round(playerState.activeFrame[a] * 100) === 8050) {
                    const nx = ((idx % this.LSX + this.LSX) % this.LSX) * 60 + 30
                    const ny = Math.floor(idx / this.LSX) * 60 + 30
                    if (Math.abs(playerState.PLAYER_X - nx) < 45 && Math.abs(playerState.PLAYER_Y - ny) < 45) {
                        playerState.activeFrame[a] -= inc;
                        return;
                    }
                }
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
    
    // World-shared twin of tickCrumble() above — identical state
    // machine, but reading/writing this.worldActiveIdx/Typ/Frame
    // instead of a single playerState's arrays, and checking ALL
    // players (not just one) for the "someone's still standing here,
    // hold off on respawning the tile" case.
    tickCrumbleWorld(idx, a, max, costume, inc, playerStates) {
        this.worldActiveFrame[a] += inc;
        if (this.worldActiveFrame[a] <= max) {
            if (this.worldActiveFrame[a] % 1 < inc) {
                if (this.worldActiveFrame[a] < max) {
                    this.MAP[idx] = costume + this.worldActiveFrame[a];
                } else {
                    this.MAP[idx] = 1;
                }
            }
        } else {
            this.worldActiveFrame[a] += 0.5 - inc;
            if (this.worldActiveFrame[a] > 80) {
                if (Math.round(this.worldActiveFrame[a] * 100) === 8050) {
                    const nx = ((idx % this.LSX + this.LSX) % this.LSX) * 60 + 30
                    const ny = Math.floor(idx / this.LSX) * 60 + 30
                    const someoneStanding = playerStates.some(ps => ps &&
                        Math.abs(ps.PLAYER_X - nx) < 45 && Math.abs(ps.PLAYER_Y - ny) < 45);
                    if (someoneStanding) {
                        this.worldActiveFrame[a] -= inc;
                        return;
                    }
                }
                if (this.worldActiveFrame[a] > 80 + max) {
                    this.MAP[idx] = costume;
                    this.worldActiveIdx.splice(a, 1);
                    this.worldActiveTyp.splice(a, 1);
                    this.worldActiveFrame.splice(a, 1);
                    return;
                } else {
                    if (this.worldActiveFrame[a] % 1 === 0) {
                        this.MAP[idx] = (costume + max) + (80 - this.worldActiveFrame[a]);
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
            this.MAP[idx] = 43;

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
                playerState.PLAYER_DIR = ux / Math.abs(ux);
            }
        }
        playerState.activeFrame[a] += 1;
        if (frame === 26) {
            this.MAP[idx] = 42;
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

    // Moves lift/dynamic objects forward one frame. This must run exactly
    // once per frame on the shared OBJ array, regardless of player count.
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

    // Pushes a specific player if they're standing on/inside a lift object.
    // Called once per player per frame (unlike tickObj above).
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

        this.tickActive(playerState);

        this.applyObjPush(playerState);

        this.resolve_collisions(false, playerState);

        this.check_dangers(playerState);

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
            PSZ: [0, 17, 13, 17, 13],
            is_jumping: 0,
            is_falling: 999,
            flipped: 0,
            player_state: 0,  // 0=normal, 1=spin, 2=crouch, 3=wall spin, 4=BOING
            player_wall: null,  // null=no wall, 1=right wall, -1=left wall, 0=ceiling
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