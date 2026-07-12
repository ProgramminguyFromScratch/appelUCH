const { Room } = require('./Room');

const ROOM_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; 
const EMPTY_ROOM_SWEEP_MS = 5 * 60 * 1000; 

class RoomManager {
    constructor() {
        this.rooms = new Map(); 

        this.sweepInterval = setInterval(() => this.sweepEmptyRooms(), 60 * 1000);
    }

    generateRoomCode() {
        let code;
        do {
            code = Array.from({ length: 5 }, () => ROOM_CODE_CHARS[Math.floor(Math.random() * ROOM_CODE_CHARS.length)]).join('');
        } while (this.rooms.has(code));
        return code;
    }

    getOrCreateRoom(requestedCode) {
        if (requestedCode && this.rooms.has(requestedCode)) {
            return this.rooms.get(requestedCode);
        }
        const code = requestedCode && requestedCode.length > 0 ? requestedCode : this.generateRoomCode();
        const room = new Room(code);
        this.rooms.set(code, room);
        console.log(`[RoomManager] created room ${code}`);
        return room;
    }

    getRoom(code) {
        return this.rooms.get(code) || null;
    }

    removeRoom(code) {
        const room = this.rooms.get(code);
        if (room) {
            room.destroy();
            this.rooms.delete(code);
            console.log(`[RoomManager] removed room ${code}`);
        }
    }

    sweepEmptyRooms() {
        for (const [code, room] of this.rooms.entries()) {
            const emptyLongEnough = room.isEmpty() && (Date.now() - room.createdAt) > EMPTY_ROOM_SWEEP_MS;
            if (room.isEmpty() && emptyLongEnough) {
                this.removeRoom(code);
            }
        }
    }
}

module.exports = { RoomManager };
