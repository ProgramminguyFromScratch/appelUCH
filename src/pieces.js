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
        name: 'Mini Crumble',
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
function getPieceById(id) {
    return PIECE_POOL.find(piece => piece.id === id) || null;
}
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
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { PIECE_POOL, getPieceById, getPieceFootprintCells, TILE_SIZE };
}