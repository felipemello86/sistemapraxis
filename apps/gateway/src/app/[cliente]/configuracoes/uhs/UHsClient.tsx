"use client";

import { useEffect, useState, type CSSProperties } from "react";

type Property = {
  id: string;
  nome: string;
  latitude: number | null;
  longitude: number | null;
  _count: { uhs: number };
};
type UH = {
  id: string;
  numero: string;
  tipo: string;
  ordem: number;
  ativo: boolean;
  propertyId: string;
  property: { nome: string } | null;
};

const cardStyle: CSSProperties = {
  background: "#fff",
  borderRadius: 16,
  padding: 20,
  marginBottom: 16,
  boxShadow: "0 1px 2px rgba(0,0,0,0.06)",
};

const inputStyle: CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid #d2d2d7",
  fontSize: 15,
};

const labelStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 4,
  fontSize: 13,
  color: "#6e6e73",
};

function btnStyle(primary: boolean, disabled = false): CSSProperties {
  return {
    padding: "10px 16px",
    borderRadius: 10,
    border: primary ? "none" : "1px solid #d2d2d7",
    background: disabled ? "#a1a1a6" : primary ? "#1d1d1f" : "#fff",
    color: primary ? "#fff" : "#1d1d1f",
    fontWeight: 600,
    fontSize: 14,
    cursor: disabled ? "default" : "pointer",
  };
}

// Propriedade (agrupamento de UHs, ex: "Bnb Flex Suites") é um cadastro novo,
// exigido a partir do momento em que Avaliações passou a associar reviews a
// Property em vez de UH (o e-mail do Airbnb só identifica a propriedade, não
// a UH específica). Toda UH precisa pertencer a uma — o formulário de nova
// UH obriga escolher (ou criar uma na hora, pelo mini-formulário acima da
// lista de UHs).
export function UHsClient({ somenteLeitura }: { somenteLeitura: boolean }) {
  const [properties, setProperties] = useState<Property[]>([]);
  const [uhs, setUHs] = useState<UH[]>([]);
  const [loading, setLoading] = useState(true);
  const [editId, setEditId] = useState<string | null>(null);
  const [editNumero, setEditNumero] = useState("");
  const [editTipo, setEditTipo] = useState("");
  const [editPropertyId, setEditPropertyId] = useState("");
  const [newNumero, setNewNumero] = useState("");
  // Categoria/tipo do quarto (ex: "Standard", "Loft com Vista Frontal") —
  // até 31/07/2026 esse campo existia no schema mas nunca era exposto na
  // tela (POST/PUT sempre gravavam "Standard" fixo), por isso o Calendário
  // do módulo Recepção (que agrupa UH por categoria dentro de cada
  // property) mostrava tudo igual. Texto livre com sugestão via <datalist>
  // das categorias já usadas, em vez de um cadastro à parte — mesmo
  // raciocínio de Property, mas sem precisar de outra tabela.
  const [newTipo, setNewTipo] = useState("");
  const [newPropertyId, setNewPropertyId] = useState("");
  const [newPropertyNome, setNewPropertyNome] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [salvandoPropriedade, setSalvandoPropriedade] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [erroPropriedade, setErroPropriedade] = useState<string | null>(null);
  // Georreferenciamento — edição inline de lat/lng por propriedade (usadas
  // pelo check-in de chegada da camareira, ver POST /api/geo/checkin no
  // housekeeping). Guardadas como texto no form pra aceitar vírgula/ponto e
  // campo vazio (limpa a coordenada) sem briga de tipo a cada tecla.
  const [editGeoId, setEditGeoId] = useState<string | null>(null);
  const [editLat, setEditLat] = useState("");
  const [editLng, setEditLng] = useState("");
  const [salvandoGeo, setSalvandoGeo] = useState(false);
  const [erroGeo, setErroGeo] = useState<string | null>(null);
  const [ascending, setAscending] = useState(true);

  // Renomear propriedade — inline, mesmo padrão visual da edição de UH.
  const [editPropId, setEditPropId] = useState<string | null>(null);
  const [editPropNome, setEditPropNome] = useState("");
  const [salvandoPropNome, setSalvandoPropNome] = useState(false);
  const [erroPropNome, setErroPropNome] = useState<string | null>(null);

  // Excluir propriedade — a API bloqueia se ainda tiver UH/Review (ver
  // comentário em api/properties/route.ts), erro amarrado ao id certo pra
  // não aparecer embaixo da propriedade errada quando há mais de uma na tela.
  const [excluindoPropId, setExcluindoPropId] = useState<string | null>(null);
  const [erroExclusaoPropId, setErroExclusaoPropId] = useState<string | null>(null);
  const [erroExclusao, setErroExclusao] = useState<string | null>(null);

  // Lista expansível de categorias por propriedade (pedido do Felipe) — cada
  // categoria aqui é só um agrupamento client-side das UHs já carregadas por
  // propertyId+tipo, não um cadastro à parte (ver comentário em
  // api/categorias/route.ts). "Editar" faz um rename em lote via essa rota.
  const [expandidas, setExpandidas] = useState<Record<string, boolean>>({});
  const [editCategoria, setEditCategoria] = useState<{ propertyId: string; tipoAtual: string } | null>(null);
  const [novoNomeCategoria, setNovoNomeCategoria] = useState("");
  const [salvandoCategoria, setSalvandoCategoria] = useState(false);
  const [erroCategoria, setErroCategoria] = useState<string | null>(null);

  useEffect(() => {
    carregar();
  }, []);

  async function carregar() {
    try {
      const [uhsRes, propsRes] = await Promise.all([fetch("/api/uhs"), fetch("/api/properties")]);
      const uhsData = await uhsRes.json();
      const propsData = await propsRes.json();
      setUHs(Array.isArray(uhsData) ? uhsData : []);
      setProperties(Array.isArray(propsData) ? propsData : []);
    } catch {
      setErro("Erro ao carregar UHs");
    }
    setLoading(false);
  }

  async function adicionarPropriedade() {
    if (!newPropertyNome.trim()) return;
    setErroPropriedade(null);
    setSalvandoPropriedade(true);
    try {
      const r = await fetch("/api/properties", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome: newPropertyNome.trim() }),
      });
      const data = await r.json();
      if (!r.ok) {
        setErroPropriedade(data.error || `Erro ${r.status}`);
      } else {
        setNewPropertyNome("");
        carregar();
      }
    } catch (e: any) {
      setErroPropriedade(e.message || "Erro ao adicionar propriedade");
    }
    setSalvandoPropriedade(false);
  }

  function abrirEdicaoNomeProp(p: Property) {
    setEditPropId(p.id);
    setEditPropNome(p.nome);
    setErroPropNome(null);
  }

  async function salvarNomeProp() {
    if (!editPropId || !editPropNome.trim()) return;
    setSalvandoPropNome(true);
    setErroPropNome(null);
    try {
      const r = await fetch("/api/properties", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: editPropId, nome: editPropNome.trim() }),
      });
      const data = await r.json();
      if (!r.ok) {
        setErroPropNome(data.error || `Erro ${r.status}`);
      } else {
        setEditPropId(null);
        carregar();
      }
    } catch (e: any) {
      setErroPropNome(e.message || "Erro ao salvar");
    }
    setSalvandoPropNome(false);
  }

  async function excluirProperty(p: Property) {
    if (!confirm(`Excluir a propriedade "${p.nome}"?`)) return;
    setExcluindoPropId(p.id);
    setErroExclusao(null);
    setErroExclusaoPropId(null);
    try {
      const r = await fetch("/api/properties", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: p.id }),
      });
      const data = await r.json().catch(() => null);
      if (!r.ok) {
        setErroExclusao(data?.error || `Erro ${r.status}`);
        setErroExclusaoPropId(p.id);
      } else {
        carregar();
      }
    } catch (e: any) {
      setErroExclusao(e.message || "Erro ao excluir");
      setErroExclusaoPropId(p.id);
    }
    setExcluindoPropId(null);
  }

  function toggleExpandida(id: string) {
    setExpandidas((e) => ({ ...e, [id]: !e[id] }));
  }

  function categoriasDaProperty(propertyId: string): [string, number][] {
    const porTipo = new Map<string, number>();
    for (const u of uhs) {
      if (u.propertyId !== propertyId) continue;
      porTipo.set(u.tipo, (porTipo.get(u.tipo) ?? 0) + 1);
    }
    return Array.from(porTipo.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }

  function abrirEdicaoCategoria(propertyId: string, tipoAtual: string) {
    setEditCategoria({ propertyId, tipoAtual });
    setNovoNomeCategoria(tipoAtual);
    setErroCategoria(null);
  }

  async function salvarCategoria() {
    if (!editCategoria || !novoNomeCategoria.trim()) return;
    setSalvandoCategoria(true);
    setErroCategoria(null);
    try {
      const r = await fetch("/api/categorias", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          propertyId: editCategoria.propertyId,
          tipoAtual: editCategoria.tipoAtual,
          tipoNovo: novoNomeCategoria.trim(),
        }),
      });
      const data = await r.json();
      if (!r.ok) {
        setErroCategoria(data.error || `Erro ${r.status}`);
      } else {
        setEditCategoria(null);
        carregar();
      }
    } catch (e: any) {
      setErroCategoria(e.message || "Erro ao salvar categoria");
    }
    setSalvandoCategoria(false);
  }

  function abrirEdicaoGeo(p: Property) {
    setEditGeoId(p.id);
    setEditLat(p.latitude != null ? String(p.latitude) : "");
    setEditLng(p.longitude != null ? String(p.longitude) : "");
    setErroGeo(null);
  }

  async function salvarGeo() {
    if (!editGeoId) return;
    // Vazio = limpar coordenada (volta a desativar o check-in de geo pra
    // essa property). Parcial (só lat ou só lng preenchido) não é permitido.
    const latTxt = editLat.trim().replace(",", ".");
    const lngTxt = editLng.trim().replace(",", ".");
    if ((latTxt === "") !== (lngTxt === "")) {
      setErroGeo("Preencha latitude e longitude juntas, ou deixe as duas vazias.");
      return;
    }
    const latitude = latTxt === "" ? null : Number(latTxt);
    const longitude = lngTxt === "" ? null : Number(lngTxt);
    if ((latitude !== null && Number.isNaN(latitude)) || (longitude !== null && Number.isNaN(longitude))) {
      setErroGeo("Coordenadas inválidas.");
      return;
    }
    setErroGeo(null);
    setSalvandoGeo(true);
    try {
      const r = await fetch("/api/properties", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: editGeoId, latitude, longitude }),
      });
      const data = await r.json();
      if (!r.ok) {
        setErroGeo(data.error || `Erro ${r.status}`);
      } else {
        setEditGeoId(null);
        carregar();
      }
    } catch (e: any) {
      setErroGeo(e.message || "Erro ao salvar coordenadas");
    }
    setSalvandoGeo(false);
  }

  async function adicionar() {
    if (!newNumero || !newPropertyId) return;
    setErro(null);
    setSalvando(true);
    try {
      const r = await fetch("/api/uhs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ numero: newNumero, tipo: newTipo.trim() || "Standard", ordem: 0, propertyId: newPropertyId }),
      });
      const data = await r.json();
      if (!r.ok) {
        setErro(data.error || `Erro ${r.status}`);
      } else {
        setNewNumero("");
        setNewTipo("");
        carregar();
      }
    } catch (e: any) {
      setErro(e.message || "Erro ao adicionar");
    }
    setSalvando(false);
  }

  async function salvarEdicao() {
    if (!editId) return;
    setSalvando(true);
    await fetch("/api/uhs", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: editId, numero: editNumero, tipo: editTipo.trim() || "Standard", ordem: 0, propertyId: editPropertyId }),
    });
    setEditId(null);
    setSalvando(false);
    carregar();
  }

  async function excluir(id: string, numero: string) {
    if (!confirm(`Excluir a UH "${numero}"?`)) return;
    await fetch("/api/uhs", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    carregar();
  }

  const sorted = [...uhs].sort((a, b) =>
    ascending
      ? a.numero.localeCompare(b.numero, undefined, { numeric: true })
      : b.numero.localeCompare(a.numero, undefined, { numeric: true })
  );

  const tiposExistentes = Array.from(new Set(uhs.map((u) => u.tipo).filter(Boolean))).sort((a, b) =>
    a.localeCompare(b)
  );

  if (loading) return <p style={{ color: "#6e6e73" }}>Carregando...</p>;

  return (
    <div>
      {somenteLeitura && (
        <div style={{ ...cardStyle, background: "#f5f5f7", color: "#6e6e73", fontSize: 14 }}>
          Modo somente leitura — seu perfil não pode gerenciar UHs.
        </div>
      )}

      {!somenteLeitura && (
        <div style={cardStyle}>
          <h2 style={{ fontSize: 16, fontWeight: 700, margin: "0 0 4px" }}>Propriedades</h2>
          <p style={{ margin: "0 0 14px", color: "#6e6e73", fontSize: 13 }}>
            Agrupamento de UHs (ex: um prédio/empreendimento) — cada UH precisa pertencer a uma.
          </p>
          {properties.length > 0 && (
            <ul style={{ margin: "0 0 14px", padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 10 }}>
              {properties.map((p) => (
                <li key={p.id} style={{ fontSize: 14 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                    {editPropId === p.id ? (
                      <div style={{ display: "flex", gap: 8, alignItems: "center", flex: 1, minWidth: 160 }}>
                        <input
                          style={{ ...inputStyle, flex: 1 }}
                          value={editPropNome}
                          onChange={(e) => setEditPropNome(e.target.value)}
                          onKeyDown={(e) => e.key === "Enter" && salvarNomeProp()}
                          autoFocus
                        />
                        <button
                          onClick={salvarNomeProp}
                          disabled={salvandoPropNome || !editPropNome.trim()}
                          style={{ background: "none", border: "none", color: "#1d8a3e", fontSize: 13, fontWeight: 600, cursor: "pointer" }}
                        >
                          Salvar
                        </button>
                        <button
                          onClick={() => setEditPropId(null)}
                          style={{ background: "none", border: "none", color: "#6e6e73", fontSize: 13, fontWeight: 600, cursor: "pointer" }}
                        >
                          Cancelar
                        </button>
                      </div>
                    ) : (
                      <span>{p.nome}</span>
                    )}
                    <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                      <span style={{ color: "#6e6e73" }}>{p._count.uhs} UH(s)</span>
                      <button
                        onClick={() => toggleExpandida(p.id)}
                        style={{ background: "none", border: "none", color: "#0071e3", fontSize: 12, fontWeight: 600, cursor: "pointer" }}
                      >
                        {expandidas[p.id] ? "▾ Categorias" : "▸ Categorias"}
                      </button>
                      {editGeoId !== p.id && (
                        <button
                          onClick={() => abrirEdicaoGeo(p)}
                          style={{ background: "none", border: "none", color: "#0071e3", fontSize: 12, fontWeight: 600, cursor: "pointer" }}
                        >
                          {p.latitude != null ? "Editar coordenadas" : "Adicionar coordenadas"}
                        </button>
                      )}
                      {editPropId !== p.id && (
                        <button
                          onClick={() => abrirEdicaoNomeProp(p)}
                          style={{ background: "none", border: "none", color: "#0071e3", fontSize: 12, fontWeight: 600, cursor: "pointer" }}
                        >
                          Renomear
                        </button>
                      )}
                      <button
                        onClick={() => excluirProperty(p)}
                        disabled={excluindoPropId === p.id}
                        style={{
                          background: "none",
                          border: "none",
                          color: "#d70015",
                          fontSize: 12,
                          fontWeight: 600,
                          cursor: excluindoPropId === p.id ? "default" : "pointer",
                        }}
                      >
                        Excluir
                      </button>
                    </div>
                  </div>

                  {erroPropNome && editPropId === p.id && <p style={{ color: "#d70015", fontSize: 12, marginTop: 4 }}>{erroPropNome}</p>}
                  {erroExclusao && erroExclusaoPropId === p.id && <p style={{ color: "#d70015", fontSize: 12, marginTop: 4 }}>{erroExclusao}</p>}

                  {expandidas[p.id] && (
                    <div
                      style={{
                        marginTop: 10,
                        paddingLeft: 12,
                        borderLeft: "2px solid #e5e5e7",
                        display: "flex",
                        flexDirection: "column",
                        gap: 8,
                      }}
                    >
                      {categoriasDaProperty(p.id).length === 0 && (
                        <p style={{ color: "#6e6e73", fontSize: 12, margin: 0 }}>Nenhuma UH cadastrada ainda nessa propriedade.</p>
                      )}
                      {categoriasDaProperty(p.id).map(([tipoCategoria, count]) => (
                        <div key={tipoCategoria} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                          {editCategoria?.propertyId === p.id && editCategoria?.tipoAtual === tipoCategoria ? (
                            <div style={{ display: "flex", gap: 8, alignItems: "center", flex: 1 }}>
                              <input
                                style={{ ...inputStyle, flex: 1 }}
                                value={novoNomeCategoria}
                                onChange={(e) => setNovoNomeCategoria(e.target.value)}
                                onKeyDown={(e) => e.key === "Enter" && salvarCategoria()}
                                autoFocus
                              />
                              <button
                                onClick={salvarCategoria}
                                disabled={salvandoCategoria || !novoNomeCategoria.trim()}
                                style={{ background: "none", border: "none", color: "#1d8a3e", fontSize: 13, fontWeight: 600, cursor: "pointer" }}
                              >
                                Salvar
                              </button>
                              <button
                                onClick={() => setEditCategoria(null)}
                                style={{ background: "none", border: "none", color: "#6e6e73", fontSize: 13, fontWeight: 600, cursor: "pointer" }}
                              >
                                Cancelar
                              </button>
                            </div>
                          ) : (
                            <>
                              <span style={{ fontSize: 13 }}>
                                {tipoCategoria} <span style={{ color: "#a1a1a6" }}>({count} UH{count === 1 ? "" : "s"})</span>
                              </span>
                              <button
                                onClick={() => abrirEdicaoCategoria(p.id, tipoCategoria)}
                                style={{ background: "none", border: "none", color: "#0071e3", fontSize: 12, fontWeight: 600, cursor: "pointer" }}
                              >
                                Editar
                              </button>
                            </>
                          )}
                        </div>
                      ))}
                      {editCategoria?.propertyId === p.id && erroCategoria && (
                        <p style={{ color: "#d70015", fontSize: 12, margin: 0 }}>{erroCategoria}</p>
                      )}
                    </div>
                  )}

                  {p.latitude != null && p.longitude != null && editGeoId !== p.id && (
                    <div style={{ color: "#6e6e73", fontSize: 11, marginTop: 2 }}>
                      {p.latitude.toFixed(6)}, {p.longitude.toFixed(6)}
                    </div>
                  )}
                  {editGeoId === p.id && (
                    <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap", marginTop: 6 }}>
                      <label style={{ ...labelStyle, flex: 1, minWidth: 120 }}>
                        Latitude
                        <input
                          style={inputStyle}
                          placeholder="ex: -23.55052"
                          value={editLat}
                          onChange={(e) => setEditLat(e.target.value)}
                        />
                      </label>
                      <label style={{ ...labelStyle, flex: 1, minWidth: 120 }}>
                        Longitude
                        <input
                          style={inputStyle}
                          placeholder="ex: -46.633308"
                          value={editLng}
                          onChange={(e) => setEditLng(e.target.value)}
                        />
                      </label>
                      <button
                        onClick={salvarGeo}
                        disabled={salvandoGeo}
                        style={{ background: "none", border: "none", color: "#1d8a3e", fontSize: 13, fontWeight: 600, cursor: "pointer" }}
                      >
                        Salvar
                      </button>
                      <button
                        onClick={() => setEditGeoId(null)}
                        style={{ background: "none", border: "none", color: "#6e6e73", fontSize: 13, fontWeight: 600, cursor: "pointer" }}
                      >
                        Cancelar
                      </button>
                    </div>
                  )}
                  {editGeoId === p.id && (
                    <p style={{ color: "#6e6e73", fontSize: 11, marginTop: 4 }}>
                      Cole as coordenadas do Google Maps (clique com o botão direito no local do prédio → copia o número que aparece).
                      Deixe os dois campos vazios pra remover a coordenada.
                    </p>
                  )}
                  {editGeoId === p.id && erroGeo && <p style={{ color: "#d70015", fontSize: 12, marginTop: 4 }}>{erroGeo}</p>}
                </li>
              ))}
            </ul>
          )}
          <div style={{ display: "flex", gap: 10, alignItems: "flex-end" }}>
            <label style={{ ...labelStyle, flex: 1 }}>
              Nova propriedade
              <input
                style={inputStyle}
                placeholder="ex: Bnb Flex Suites"
                value={newPropertyNome}
                onChange={(e) => setNewPropertyNome(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && adicionarPropriedade()}
              />
            </label>
            <button
              onClick={adicionarPropriedade}
              disabled={salvandoPropriedade || !newPropertyNome.trim()}
              style={btnStyle(false, salvandoPropriedade || !newPropertyNome.trim())}
            >
              Adicionar
            </button>
          </div>
          {erroPropriedade && <p style={{ color: "#d70015", fontSize: 14, marginTop: 10 }}>{erroPropriedade}</p>}
        </div>
      )}

      {!somenteLeitura && (
        <div style={cardStyle}>
          <h2 style={{ fontSize: 16, fontWeight: 700, margin: "0 0 14px" }}>Nova UH</h2>
          <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
            <label style={{ ...labelStyle, flex: 1, minWidth: 140 }}>
              Número/Nome
              <input
                style={inputStyle}
                placeholder="ex: 101, CHALÉ A"
                value={newNumero}
                onChange={(e) => setNewNumero(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && adicionar()}
              />
            </label>
            <label style={{ ...labelStyle, flex: 1, minWidth: 160 }}>
              Propriedade
              <select style={inputStyle} value={newPropertyId} onChange={(e) => setNewPropertyId(e.target.value)}>
                <option value="">Selecione...</option>
                {properties.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nome}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ ...labelStyle, flex: 1, minWidth: 160 }}>
              Categoria
              <input
                style={inputStyle}
                list="categorias-existentes"
                placeholder="ex: Standard, Loft Vista Mar"
                value={newTipo}
                onChange={(e) => setNewTipo(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && adicionar()}
              />
            </label>
            <button onClick={adicionar} disabled={salvando || !newNumero || !newPropertyId} style={btnStyle(true, salvando || !newNumero || !newPropertyId)}>
              Adicionar
            </button>
          </div>
          <datalist id="categorias-existentes">
            {tiposExistentes.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
          <p style={{ color: "#6e6e73", fontSize: 12, marginTop: 8 }}>
            Deixe em branco pra usar "Standard". A categoria agrupa os quartos no Calendário do módulo Recepção.
          </p>
          {properties.length === 0 && (
            <p style={{ color: "#c77700", fontSize: 13, marginTop: 10 }}>
              Cadastre ao menos uma propriedade acima antes de criar UHs.
            </p>
          )}
          {erro && <p style={{ color: "#d70015", fontSize: 14, marginTop: 10 }}>{erro}</p>}
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10, padding: "0 4px" }}>
        <span style={{ fontSize: 13, color: "#6e6e73" }}>{uhs.length} UH(s)</span>
        <button
          onClick={() => setAscending(!ascending)}
          style={{ background: "none", border: "none", color: "#0071e3", fontSize: 13, fontWeight: 600, cursor: "pointer" }}
        >
          {ascending ? "A → Z" : "Z → A"}
        </button>
      </div>

      <div>
        {sorted.map((uh) => (
          <div key={uh.id} style={cardStyle}>
            {!somenteLeitura && editId === uh.id ? (
              <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                <input style={{ ...inputStyle, flex: 1, minWidth: 100 }} value={editNumero} onChange={(e) => setEditNumero(e.target.value)} />
                <select style={{ ...inputStyle, flex: 1, minWidth: 140 }} value={editPropertyId} onChange={(e) => setEditPropertyId(e.target.value)}>
                  {properties.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nome}
                    </option>
                  ))}
                </select>
                <input
                  style={{ ...inputStyle, flex: 1, minWidth: 140 }}
                  list="categorias-existentes"
                  placeholder="Categoria (ex: Standard)"
                  value={editTipo}
                  onChange={(e) => setEditTipo(e.target.value)}
                />
                <button onClick={salvarEdicao} style={{ background: "none", border: "none", color: "#1d8a3e", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                  Salvar
                </button>
                <button onClick={() => setEditId(null)} style={{ background: "none", border: "none", color: "#6e6e73", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                  Cancelar
                </button>
              </div>
            ) : (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div>
                  <span style={{ fontWeight: 700, fontSize: 15 }}>{uh.numero}</span>
                  <div style={{ color: "#6e6e73", fontSize: 12, marginTop: 2 }}>
                    {uh.property?.nome ?? "sem propriedade"} · {uh.tipo}
                  </div>
                </div>
                {!somenteLeitura && (
                  <div style={{ display: "flex", gap: 14 }}>
                    <button
                      onClick={() => {
                        setEditId(uh.id);
                        setEditNumero(uh.numero);
                        setEditTipo(uh.tipo);
                        setEditPropertyId(uh.propertyId);
                      }}
                      style={{ background: "none", border: "none", color: "#0071e3", fontSize: 13, fontWeight: 600, cursor: "pointer" }}
                    >
                      Editar
                    </button>
                    <button
                      onClick={() => excluir(uh.id, uh.numero)}
                      style={{ background: "none", border: "none", color: "#d70015", fontSize: 13, fontWeight: 600, cursor: "pointer" }}
                    >
                      Excluir
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
