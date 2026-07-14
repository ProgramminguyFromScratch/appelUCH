const TILE_SIZE = 60;

const PIECE_POOL = [
    {
        id: 'platform_basic',
        name: 'Platform',
        tiles: [2],
        footprint: { width: 1, height: 1 },
        chance: 7
    },
    {
        id: 'spring',
        name: 'Spring',
        tiles: [42],
        footprint: { width: 1, height: 1 },
        chance: 10
    },
    {
        id: 'crumble_platform',
        name: 'Crumbling Platform',
        tiles: [34],
        footprint: { width: 1, height: 1 },
        chance: 5
    },
    {
        id: 'mini_crumble',
        name: 'Mini Crumble',
        tiles: [46],
        footprint: { width: 1, height: 1 },
        chance: 5
    },
    {
        id: 'platform_triple',
        name: 'Triple Platform',
        tiles: [2, 2, 2],
        footprint: { width: 3, height: 1 },
        chance: 7
    },
    {
        id: 'spike',
        name: 'Spike',
        tiles: [9],
        footprint: { width: 1, height: 1 },
        chance: 10
    },
    {
        id: 'spikeball',
        name: 'Spike Ball',
        tiles: [74],
        footprint: { width: 1, height: 1 },
        chance: 10
    },
    {
        id: 'leftspike',
        name: 'Left Spike',
        tiles: [77],
        footprint: { width: 1, height: 1 },
        chance: 3
    },
    {
        id: 'rightspike',
        name: 'Right Spike',
        tiles: [78],
        footprint: { width: 1, height: 1 },
        chance: 3
    },
    {
        id: 'slab',
        name: 'Slab',
        tiles: [4],
        footprint: { width: 1, height: 1 },
        chance: 10
    },
    {
        id: 'quartertile',
        name: 'Quarter Tile',
        tiles: [5],
        footprint: { width: 1, height: 1 },
        chance: 7
    },
    {
        id: 'banana',
        name: 'Banana Block',
        tiles: [7],
        footprint: { width: 1, height: 1 },
        chance: 7
    },
    {
        id: 'stair',
        name: 'Stair',
        tiles: [13],
        footprint: { width: 1, height: 1 },
        chance: 5
    },
    {
        id: 'conveyor1',
        name: 'Conveyor',
        tiles: [50],
        footprint: { width: 1, height: 1 },
        chance: 4
    },
    {
        id: 'conveyor2',
        name: 'Conveyor',
        tiles: [51],
        footprint: { width: 1, height: 1 },
        chance: 4
    },
    {
        id: 'bomb',
        name: 'Bomb',
        targetsSolid: true,
        tiles: [1],
        footprint: { width: 1, height: 1 },
        chance: 10
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

// NEW: Helper function to grab weighted random pieces based on their `chance` variable
function pickWeightedPieces(pool, count) {
    const slots = [];
    // Sum up the total chance of all items in the current pool
    const totalChance = pool.reduce((sum, piece) => sum + (piece.chance || 1), 0);

    for (let i = 0; i < count; i++) {
        let randomVal = Math.random() * totalChance;
        let currentSum = 0;
        let selectedPiece = pool[0]; // Fallback

        for (const piece of pool) {
            currentSum += (piece.chance || 1);
            if (randomVal <= currentSum) {
                selectedPiece = piece;
                break;
            }
        }
        slots.push(selectedPiece);
    }
    return slots;
}

// Works on the Node.js server without breaking the browser script
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { 
        PIECE_POOL, 
        getPieceById, 
        getPieceFootprintCells, 
        TILE_SIZE, 
        pickWeightedPieces 
    };
}