// Shared piece pool for the party box.
//
// This is ONE pool, not per-player hands: each round a handful of slots
// are revealed from PIECE_POOL (see the future party-box screen), and
// both players pick from those same revealed slots — there's no
// separate P1/P2 inventory.
//
// Every entry only covers what the engine can already place/simulate
// today (see physics.js's tickActive()/MASK table):
//   - platform_basic : a plain solid tile (mask '5555', solid on every
//                       side — tile value 2)
//   - spring          : the launch/bounce tile physics.js already
//                       recognizes via tickActive() (tile value 42)
//   - crumble_platform: the crumbling-floor tile physics.js already
//                       recognizes via tickCrumble() (tile value 34;
//                       46 is the thinner "crumble2" variant and can be
//                       added as its own entry later if it needs to be
//                       pickable separately)
//   - bomb            : NOT a placeable tile like the others — it's a
//                       "delete an existing tile" action instead of an
//                       "add a new tile" one. `targetsSolid: true` flips
//                       BUILD-phase validity checking to require an
//                       already-solid/functional cell (see physics.js's
//                       isDeletableCell()) rather than the usual open-
//                       air requirement every other piece uses (see
//                       isPlaceableCell()). Its `tiles` value is 1 (the
//                       engine's standard open-air tile, same value
//                       crumble platforms settle to once fully broken)
//                       so placing it just overwrites whatever was
//                       there with empty space, reusing the same
//                       generic "write piece.tiles into the map" path
//                       every other piece already goes through.
//
// TODO (Phase 5): once moving lifts exist as placeable pieces (rather
// than only level-authored/spawned objects), add:
//   - moving_lift : id 'moving_lift', tile value(s) TBD
//
// footprint is in tiles, at the engine's fixed TILE_SIZE (60px/tile —
// see levelRenderer.js's this.tileSize). Most pieces are 1x1; multi-tile
// pieces (see platform_triple below) list one tile value per footprint
// cell in row-major order (left-to-right, top-to-bottom) *at rotation
// 0* — see getPieceFootprintCells() for how that's rotated at BUILD time.
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
        id: 'platform_triple',
        name: 'Triple Platform',
        // Three plain platform tiles (tile value 2, same as
        // platform_basic) in a straight line. Unrotated, the line runs
        // horizontally (footprint width 3, height 1) — see
        // getPieceFootprintCells() for how rotation turns this into a
        // vertical line instead.
        tiles: [2, 2, 2],
        footprint: { width: 3, height: 1 }
    },
    {
        id: 'bomb',
        name: 'Bomb',
        // See the pool comment above: this deletes whatever tile is at
        // the target cell rather than placing a new one. targetsSolid
        // tells BUILD-phase validation (game.js/Room.js's
        // footprintFits()) to require a solid/functional target cell
        // instead of the usual open one.
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