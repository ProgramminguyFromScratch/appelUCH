const TILE_SIZE = 60;

const PIECE_POOL = [
    {
        id: 'platform_basic',
        name: 'Platform',
        tiles: [2],
        footprint: { width: 1, height: 1 }
    },
    {
        id: 'spring',
        name: 'Spring',
        tiles: [42],
        footprint: { width: 1, height: 1 }
    },
    {
        id: 'crumble_platform',
        name: 'Crumbling Platform',
        tiles: [34],
        footprint: { width: 1, height: 1 }
    },
    {
        id: 'mini_crumble',
        name: 'Mini Crumbling Platform',
        tiles: [46],
        footprint: { width: 1, height: 1 }
    },
    {
        id: 'platform_triple',
        name: 'Triple Platform',
        tiles: [2, 2, 2],
        footprint: { width: 3, height: 1 }
    },
    {
        id: 'spike',
        name: 'Spike',
        tiles: [9],
        footprint: { width: 1, height: 1 }
    },
    {
        id: 'spikeball',
        name: 'Spike Ball',
        tiles: [74],
        footprint: { width: 1, height: 1 }
    },
    {
        id: 'leftspike',
        name: 'Left Spike',
        tiles: [77],
        footprint: { width: 1, height: 1 }
    },
    {
        id: 'rightspike',
        name: 'Right Spike',
        tiles: [78],
        footprint: { width: 1, height: 1 }
    },
    {
        id: 'slab',
        name: 'Slab',
        tiles: [4],
        footprint: { width: 1, height: 1 }
    },
    {
        id: 'quartertile',
        name: 'Quarter Tile',
        tiles: [5],
        footprint: { width: 1, height: 1 }
    },
    {
        id: 'bomb',
        name: 'Bomb',
        targetsSolid: true,
        tiles: [1],
        footprint: { width: 1, height: 1 }
    }
];

// Convenience lookup so callers don't have to Array.find() by hand.
function getPieceById(id) {
    return PIECE_POOL.find(piece => piece.id === id) || null;
}

// Returns a piece's footprint cells as {dCol, dRow, tile} offsets from
// its anchor (the BUILD cursor's cell), rotated by `rotation`
// quarter-turns (0-3). Shared by BUILD placement (game.js's
// placeBuildPiece() and friends) and the BUILD cursor preview (game.js's
// drawBuildCursor()) so the ghost preview and the tiles actually written
// into the map always agree on which cells a piece covers.
//
// The anchor is the footprint's top-left cell (col 0, row 0) *before*
// rotation, so single-tile pieces are always just [{dCol:0, dRow:0}]
// regardless of rotation — only multi-tile footprints actually change
// shape. Rotation pivots around that anchor cell (not the footprint's
// center), which keeps the math simple and means the cell under a
// player's cursor never moves out from under them when they rotate;
// only the rest of the piece swings around it.
function getPieceFootprintCells(piece, rotation) {
    const { width, height } = piece.footprint;
    const normalizedRotation = ((rotation % 4) + 4) % 4;

    const cells = [];
    for (let row = 0; row < height; row++) {
        for (let col = 0; col < width; col++) {
            const tile = piece.tiles[row * width + col] ?? piece.tiles[0];
            let dCol = col;
            let dRow = row;
            for (let i = 0; i < normalizedRotation; i++) {
                const rotatedCol = -dRow;
                const rotatedRow = dCol;
                dCol = rotatedCol;
                dRow = rotatedRow;
            }
            cells.push({ dCol, dRow, tile });
        }
    }
    return cells;
}
// Node/server export. Guarded so this same file still works dropped
// into the browser bundle unmodified (game.html loads it as a plain
// <script>, where `module` doesn't exist).
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { PIECE_POOL, getPieceById, getPieceFootprintCells, TILE_SIZE };
}