/** Ranking ILUSTRATIVO. Pontuações fixas e sem nomes: não são dados da plataforma. */
export const ILLUSTRATIVE_SCORES = [
  940, 880, 810, 760, 690, 610, 540, 490, 430, 390, 350, 300, 270, 240, 210, 180, 150, 120, 90,
];

export function rankFor(points: number): number {
  return 1 + ILLUSTRATIVE_SCORES.filter((s) => s > points).length;
}
