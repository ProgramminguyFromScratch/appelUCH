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

module.exports = { decodeLevelCode };
