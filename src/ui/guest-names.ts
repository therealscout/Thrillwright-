/** Friendly, made-up names for guests, chosen from their id so they never change. */
const FIRST = [
  'Ada', 'Ben', 'Cleo', 'Dev', 'Ella', 'Finn', 'Gia', 'Hugo', 'Iris', 'Jay', 'Kai', 'Lena', 'Milo', 'Nina', 'Omar', 'Pia',
  'Quinn', 'Rosa', 'Sam', 'Tess', 'Uma', 'Vik', 'Wren', 'Xavi', 'Yara', 'Zed', 'Alma', 'Bo', 'Cy', 'Dina', 'Eli', 'Faye',
];
const LETTERS = 'ABCDEFGHJKLMNOPRSTVWY';

export function guestName(id: number): string {
  const first = FIRST[id % FIRST.length] as string;
  const initial = LETTERS[Math.floor(id / FIRST.length) % LETTERS.length] as string;
  return `${first} ${initial}.`;
}
