import type { AiDetector } from "../types";
import { ncUrgenteParadaDetector } from "./manutencao-nc-urgente-parada";
import { recorrenciaItemDetector } from "./manutencao-recorrencia-item";
import { falhaGerencialPendenteDetector } from "./housekeeping-falha-gerencial-pendente";

// Registry — o único lugar que precisa mudar pra adicionar um detector novo
// (ou, no futuro, um agente especializado: mesmo contrato AiDetector, ver
// types.ts). Nem o cron nem a Central de Inteligência conhecem esta lista
// diretamente, só chamam runDetectorsForTenant (ver registry.ts).
export const detectors: AiDetector[] = [
  ncUrgenteParadaDetector,
  recorrenciaItemDetector,
  falhaGerencialPendenteDetector,
];
