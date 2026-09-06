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
function buildPrefix(body) {
    return String(1234567 + body.length);
}

function encodeLevelCode(levelState) {
    try {
        const { map, rotations, size_x, MAP_DATA = [], wall = [], hue, hue2 } = levelState;
        const tokens = [
            String(size_x),
            ...runLengthEncode(map), '',
            ...runLengthEncode(rotations), '',
            ...MAP_DATA, '',
            ...wall, '',
            String(hue), String(hue2)
        ];
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