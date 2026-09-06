const fs = require('fs');
const path = require('path');

const LEVELS = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'levels.json'), 'utf8'));
const LEVEL_POOL = LEVELS.map(level => level.code);
const LEVEL_NAMES = LEVELS.map(level => level.name);

module.exports = { LEVEL_POOL, LEVEL_NAMES, LEVELS };