// Removido: "Controle de Inspeções" foi fundida em "Informações"
// (components/views/informacoes.tsx) — eram telas redundantes, cada uma
// listando UH x última inspeção. Agora Informações já tem o botão "Iniciar
// inspeção" em cada linha e, ao expandir a UH, mostra o histórico completo
// de inspeções daquela unidade (não só a última).
//
// Este arquivo não é mais importado em lugar nenhum. O sandbox não consegue
// apagar arquivos na pasta montada (só escrever) — apague-o manualmente:
//   rm apps/maintenance/src/components/views/controle-inspecoes.tsx
export {}
