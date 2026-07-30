// Som de feedback ao marcar um lead como ganho (30/07/2026, pedido do
// Felipe: "som satisfatório" no clique do ✅). Sintetizado via Web Audio API
// em vez de carregar um arquivo .mp3/.wav — evita adicionar um asset novo
// pro repo e funciona 100% client-side, sem rede. É um pequeno arpejo
// ascendente (tipo "cha-ching" de moeda/conquista), curto o suficiente pra
// não incomodar em cliques repetidos.
export function tocarSomGanho() {
  if (typeof window === "undefined") return;
  try {
    const AudioCtxClass = window.AudioContext ?? (window as any).webkitAudioContext;
    if (!AudioCtxClass) return;
    const ctx = new AudioCtxClass();

    const notas = [660, 880, 1320]; // Mi5 → Lá5 → Mi6, arpejo maior curto
    notas.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;

      const inicio = ctx.currentTime + i * 0.09;
      gain.gain.setValueAtTime(0, inicio);
      gain.gain.linearRampToValueAtTime(0.25, inicio + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, inicio + 0.18);

      osc.connect(gain).connect(ctx.destination);
      osc.start(inicio);
      osc.stop(inicio + 0.2);
    });

    setTimeout(() => ctx.close(), 500);
  } catch {
    // Som é só um "nice to have" — nunca deve quebrar a ação de marcar ganho.
  }
}
