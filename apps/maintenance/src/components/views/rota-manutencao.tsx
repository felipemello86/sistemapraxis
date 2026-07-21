// Removido: "Rota de Manutenção" foi fundida em "Inspeções"
// (components/views/informacoes.tsx) — os cards Pendentes/Em dia viraram
// StatCards compactos no topo daquela tela, e o "modo rota" (seleção de UH
// mais urgente + fluxo gamificado) já era coberto pelo botão "Iniciar
// inspeção" em cada linha, agora com ordenação por coluna pra achar a UH
// mais urgente manualmente.
//
// Este arquivo não é mais importado em lugar nenhum. O sandbox não consegue
// apagar arquivos na pasta montada (só escrever) — apague-o manualmente:
//   rm apps/maintenance/src/components/views/rota-manutencao.tsx
export {}
