/**
 * Cálculo de score das camareiras. Idêntico ao v1 (lógica pura, sem
 * dependência de infra — nada a mudar na migração).
 *
 * Score de uma UH = (scoreVelocidade * 0.5) + (scoreQualidade * 0.5)
 *
 * scoreVelocidade:
 *   - 100 pontos se finalizou em exatamente o tempo alvo
 *   - +2 por minuto abaixo do alvo (máx 130)
 *   - -3 por minuto acima do alvo (mín 0)
 *
 * scoreQualidade:
 *   - 100 pontos se zero falhas
 *   - -10 por falha identificada na inspeção (mín 0)
 */

export function calcularScoreVelocidade(
  duracaoSegundos: number,
  targetMinutos: number = 25
): number {
  const duracaoMinutos = duracaoSegundos / 60;
  const diff = targetMinutos - duracaoMinutos; // positivo = mais rápido

  if (diff >= 0) {
    return Math.min(100 + diff * 2, 130); // mais rápido = bônus
  } else {
    return Math.max(100 + diff * 3, 0); // mais lento = penalidade maior
  }
}

export function calcularScoreQualidade(totalFalhas: number): number {
  return Math.max(100 - totalFalhas * 10, 0);
}

export function calcularScoreUH(
  duracaoSegundos: number,
  totalFalhas: number,
  targetMinutos: number = 25
): number {
  const vel = calcularScoreVelocidade(duracaoSegundos, targetMinutos);
  const qual = calcularScoreQualidade(totalFalhas);
  return Math.round((vel * 0.5 + qual * 0.5) * 10) / 10;
}

export function scoreLabel(score: number): { label: string; cor: string } {
  if (score >= 90) return { label: "Excelente", cor: "text-green-600" };
  if (score >= 75) return { label: "Ótimo", cor: "text-blue-600" };
  if (score >= 60) return { label: "Bom", cor: "text-yellow-600" };
  if (score >= 40) return { label: "Regular", cor: "text-orange-600" };
  return { label: "Precisa melhorar", cor: "text-red-600" };
}

export function formatarTempo(segundos: number): string {
  const m = Math.floor(segundos / 60);
  const s = segundos % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}
