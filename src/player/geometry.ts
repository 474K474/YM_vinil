/**
 * Геометрия проигрывателя в «дизайн-координатах» деки (DECK_W × DECK_H).
 * Компонент масштабирует всю деку целиком, поэтому числа здесь фиксированные.
 */

export const DECK_W = 740;
export const DECK_H = 580;

/** Центр пластинки и её радиус. */
export const CENTER = { x: 318, y: 290 };
export const RECORD_R = 262;
/** Радиус яблока (лейбла). */
export const LABEL_R = 88;
/** Начало записи (вводная канавка) и конец (перед выводной). */
export const GROOVE_OUTER_R = 250;
export const GROOVE_INNER_R = 112;
/** Выводная канавка — сюда уходит игла в конце стороны. */
export const RUNOUT_R = 100;

/** Шарнир тонарма и расстояние от шарнира до иглы. */
export const PIVOT = { x: 642, y: 84 };
export const ARM_LENGTH = 372;
/** Угол тонарма на стойке (0° — рычаг смотрит строго вниз). */
export const ARM_REST_DEG = 0;

const rad = (deg: number) => (deg * Math.PI) / 180;

/** Где окажется игла при повороте тонарма на `deg` (по часовой). */
export function stylusAt(deg: number) {
  return {
    x: PIVOT.x - ARM_LENGTH * Math.sin(rad(deg)),
    y: PIVOT.y + ARM_LENGTH * Math.cos(rad(deg)),
  };
}

const distToCenter = (p: { x: number; y: number }) => Math.hypot(p.x - CENTER.x, p.y - CENTER.y);

/** Угол тонарма, при котором игла стоит на радиусе `r` пластинки. */
export function armAngleForRadius(r: number): number {
  // Расстояние до центра монотонно убывает с ростом угла на рабочем участке.
  let lo = 0;
  let hi = 80;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (distToCenter(stylusAt(mid)) > r) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/** Радиус бороздки для доли `f` (0…1) пройденной стороны. */
export const grooveRadius = (f: number) =>
  GROOVE_OUTER_R - Math.min(1, Math.max(0, f)) * (GROOVE_OUTER_R - GROOVE_INNER_R);

/** Обратное: какая доля стороны соответствует радиусу (для клика по бороздке). */
export const fractionForRadius = (r: number) =>
  Math.min(1, Math.max(0, (GROOVE_OUTER_R - r) / (GROOVE_OUTER_R - GROOVE_INNER_R)));
