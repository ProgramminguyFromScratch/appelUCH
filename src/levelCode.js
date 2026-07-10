// Port of levelRenderer.js's `LevelRenderer.getDataFromCode(code)`.
//
// Only the string-parsing half is reproduced here — the original method
// is a `static` on a class whose *other* methods touch `document`/`Image`
// for rendering, so requiring the real file in Node isn't safe. This is
// a byte-for-byte port of the parsing logic only (see levelRenderer.js
// lines ~25-80 in the client bundle), kept here as the single source of
// truth for how the server decodes a `levelCode` into the same
// `{ map, rotations, size_x }` shape the client's `AppelPhysics` is
// constructed from — the server needs this to build its own
// authoritative map copy for BUILD placement legality checks (§6 of the
// protocol).
//
// If the client-side decoder in levelRenderer.js ever changes, this
// needs to change with it.
function decodeLevelCode(code) {
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
        console.error("[decodeLevelCode] Error:", e);
        return null;
    }
}

// Inverse of decodeLevelCode() above — takes the same
// `{ map, rotations, size_x, MAP_DATA, wall, hue, hue2 }` shape it
// returns and re-serializes it into a levelCode string in the exact
// format the hardcoded LEVEL_POOL entries use (and that
// decodeLevelCode()/LevelRenderer.getDataFromCode() can read back).
// This is what lets a level built up over several BUILD phases (or a
// stage that's had pieces placed into it) get handed back to players
// as a code they can reuse, exactly like the ones in levels.js.
//
// `prefix` is the 7-char header decodeLevelCode() unconditionally
// strips off the front and never inspects — the hardcoded pool's codes
// all start "1234" + a 3-digit number that doesn't appear to encode
// anything decodeLevelCode() reads back out, so any 7-char string works
// here. Defaults to a fixed placeholder; callers that care about
// uniqueness (e.g. logging/dedup) can pass their own.
//
// Run-length-encodes `values` into the same [value, count, value,
// count, ...] token pairs MAP_data/MAP_R_data are parsed out of.
function runLengthEncode(values) {
    const tokens = [];
    let i = 0;
    while (i < values.length) {
        const value = values[i];
        let count = 1;
        while (i + count < values.length && values[i + count] === value) count++;
        tokens.push(String(value), String(count));
        i += count;
    }
    return tokens;
}

// The 7-char header decodeLevelCode() unconditionally strips off the
// front (code.substring(7)) and never inspects the content of. Real
// LEVEL_POOL codes all follow the same "1234" + 3-digit number shape,
// and that number is always the character length of everything after
// the header (the `body` below) — NOT a fixed placeholder. Re-deriving
// it from the actual body keeps freshly-encoded codes indistinguishable
// from the hardcoded pool's, and (since decodeLevelCode() only ever
// strips exactly 7 chars regardless of what's in them) any body length
// up to 999 chars round-trips fine as a zero-padded 3-digit count.
function buildPrefix(body) {
    return String(1234567 + body.length);
}

function encodeLevelCode(levelState) {
    try {
        const { map, rotations, size_x, MAP_DATA = [], wall = [], hue, hue2 } = levelState;

        // Mirrors decodeLevelCode()'s four Z-terminated segments (map,
        // rotations, MAP_DATA, wall) followed by the two trailing hue
        // tokens — see its readSegment()/remaining logic. An empty
        // segment still needs its own '' terminator token, same as a
        // non-empty one, which is why MAP_DATA/wall each get their own
        // '' even when they're []; readSegment() advances the cursor
        // past exactly one terminator per segment regardless of length.
        const tokens = [
            String(size_x),
            ...runLengthEncode(map), '',
            ...runLengthEncode(rotations), '',
            ...MAP_DATA, '',
            ...wall, '',
            String(hue), String(hue2)
        ];

        // Inverse of decodeLevelCode()'s leading
        // .replaceAll("C","-").replaceAll("B","+") — put the stand-in
        // letters back before the "Z" join, so the result round-trips
        // through decodeLevelCode() unchanged. Order doesn't matter
        // since '-'/'+' and 'C'/'B' are disjoint character sets.
        const body = tokens.join("Z").replaceAll("-", "C").replaceAll("+", "B");

        return buildPrefix(body) + body;
    } catch (e) {
        console.error("[encodeLevelCode] Error:", e);
        return null;
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { decodeLevelCode, encodeLevelCode };
}