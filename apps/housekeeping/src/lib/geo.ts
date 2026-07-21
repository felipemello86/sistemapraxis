// Georreferenciamento (Governança) — utilitário de distância. Usado pelo
// endpoint de check-in (api/geo/checkin) pra decidir se a camareira está
// fisicamente na Property antes de liberar a contagem de tempo pontuado.
//
// Raio de tolerância: 100m, combinado com o Felipe — GPS de celular tem erro
// típico de 5-20m a céu aberto e pode piorar bastante perto/dentro de
// prédios; 100m dá folga suficiente sem deixar o check-in disparar pra
// propriedades vizinhas muito próximas.
export const HAVERSINE_RAIO_METROS = 100;

const RAIO_TERRA_METROS = 6371000;

export function distanciaMetros(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return RAIO_TERRA_METROS * c;
}
