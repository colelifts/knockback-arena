import { ROOM_CODE_ALPHABET } from './constants.js';
import { SeededRandom } from './seededRandom.js';

export const generateRoomCode = (seed = Math.floor(Math.random() * 0xffffffff)): string => {
  const random = new SeededRandom(seed);
  return Array.from(
    { length: 5 },
    () => ROOM_CODE_ALPHABET[random.integer(0, ROOM_CODE_ALPHABET.length)],
  ).join('');
};
