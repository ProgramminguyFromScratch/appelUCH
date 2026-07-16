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
        name: 'Right Conveyor',
        tiles: [50],
        footprint: { width: 1, height: 1 },
        chance: 4
    },
    {
        id: 'conveyor2',
        name: 'Left Conveyor',
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

function pickWeightedPieces(pool, count) {
    const slots = [];
    const available = [...pool];

    const weight = piece => (typeof piece.chance === 'number' ? piece.chance : 1);

    for (let i = 0; i < count && available.length > 0; i++) {
        const totalChance = available.reduce((sum, piece) => sum + weight(piece), 0);

        let selectedIndex = 0;

        if (totalChance <= 0) {
            selectedIndex = Math.floor(Math.random() * available.length);
        } else {
            let randomVal = Math.random() * totalChance;
            let currentSum = 0;
            for (let j = 0; j < available.length; j++) {
                currentSum += weight(available[j]);
                if (randomVal < currentSum) {
                    selectedIndex = j;
                    break;
                }
            }
        }

        slots.push(available[selectedIndex]);
        available.splice(selectedIndex, 1);
    }
    return slots;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { 
        PIECE_POOL, 
        getPieceById, 
        getPieceFootprintCells, 
        TILE_SIZE, 
        pickWeightedPieces 
    };
}