import { useState, useCallback, useRef, useEffect } from 'react';
import { api } from './api.js';

// ─── Paleta ──────────────────────────────────────────────────────────────────
const CORES = ['#E4572E', '#F28F3B', '#C8452C', '#B36A5E', '#E89005', '#A4243B'];
const INK = '#14213D', GREEN = '#1E8E3E';

// ─── Catálogo de impostos/custos ─────────────────────────────────────────────
const CATALOGO = [
  { id: 'ipi',       nome: 'IPI',                    tipo: 'compra', aliquota: 10,   destaque: true,  desc: 'Sobre produtos industrializados — alíquota depende do NCM (tabela TIPI)' },
  { id: 'icms',      nome: 'ICMS',                   tipo: 'compra', aliquota: 18,   desc: 'Imposto estadual sobre circulação de mercadorias' },
  { id: 'icmsst',    nome: 'ICMS-ST',                tipo: 'compra', aliquota: 7,    desc: 'Substituição tributária — recolhido antecipadamente na compra' },
  { id: 'pis',       nome: 'PIS',                    tipo: 'venda',  aliquota: 0.65, desc: 'Programa de Integração Social' },
  { id: 'cofins',    nome: 'COFINS',                  tipo: 'venda',  aliquota: 3,    desc: 'Financiamento da Seguridade Social' },
  { id: 'simples',   nome: 'Simples Nacional',        tipo: 'venda',  aliquota: 6,    desc: 'Guia única (DAS) — % sobre o faturamento' },
  { id: 'iss',       nome: 'ISS',                     tipo: 'venda',  aliquota: 5,    desc: 'Imposto municipal sobre serviços' },
  { id: 'ii',        nome: 'Imposto de Importação',  tipo: 'compra', aliquota: 60,   desc: 'Para produtos importados' },
  { id: 'frete',     nome: 'Frete',                   tipo: 'compra', aliquota: 5,    desc: 'Custo de transporte sobre o valor da compra' },
  { id: 'maq',       nome: 'Taxa da maquininha',      tipo: 'venda',  aliquota: 3.5,  desc: 'Taxa do cartão sobre o valor da venda' },
  { id: 'embalagem', nome: 'Embalagem',               tipo: 'venda',  aliquota: 1.5,  desc: 'Custo de sacola/embalagem por venda' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
let _seq = 1;
const uid = () => 't' + (_seq++);
const fmt = v => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const pc  = v => v.toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + '%';

function roundNice(p, mode) {
  if (!isFinite(p) || p <= 0) return 0;
  const cents = Math.ceil(p * 100) / 100, int = Math.floor(cents);
  const up = f => { let b = int + f; if (b < cents - 1e-9) b = int + 1 + f; return b; };
  if (mode === 'exato') return cents;
  if (mode === '00') return cents === int ? int : int + 1;
  if (mode === '90') return up(0.9);
  if (mode === '50') return up(0.5);
  return Math.min(up(0.9), cents === int ? int : int + 1);
}

function mkTax(cat, aliquota) {
  return { uid: uid(), nome: cat.nome, aliquota: aliquota ?? cat.aliquota, tipo: cat.tipo, destaque: !!cat.destaque };
}

function newScen(nome, base) {
  return {
    key: 's' + (_seq++), nome,
    taxes: base ? base.taxes.map(t => ({ ...t, uid: uid() })) : [mkTax(CATALOGO[0]), mkTax(CATALOGO[4])],
    modo: base?.modo ?? 'margem',
    margem: base?.margem ?? 50,
    precoManual: base?.precoManual ?? 0,
    term: base?.term ?? 'auto',
  };
}

function calcScen(sc, custo) {
  const compra   = sc.taxes.filter(t => t.tipo === 'compra').map(t => ({ ...t, valor: custo * t.aliquota / 100 }));
  const custoReal = custo + compra.reduce((s, t) => s + t.valor, 0);
  const taxaV    = sc.taxes.filter(t => t.tipo === 'venda').reduce((s, t) => s + t.aliquota, 0) / 100;
  let preco, teorico = null;
  if (sc.modo === 'margem') { teorico = custoReal * (1 + sc.margem / 100) / (1 - taxaV); preco = roundNice(teorico, sc.term); }
  else preco = sc.precoManual || 0;
  const venda = sc.taxes.filter(t => t.tipo === 'venda').map(t => ({ ...t, valor: preco * t.aliquota / 100 }));
  const lucro = preco - custoReal - venda.reduce((s, t) => s + t.valor, 0);
  return { compra, venda, custoReal, preco, teorico, lucro,
    mCusto: custoReal > 0 ? lucro / custoReal * 100 : 0,
    mVenda: preco > 0 ? lucro / preco * 100 : 0 };
}

// ─── Donut SVG ────────────────────────────────────────────────────────────────
function arcPath(cx, cy, rO, rI, a0, a1) {
  const P = (r, a) => [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  const large = (a1 - a0) > Math.PI ? 1 : 0;
  const [x0, y0] = P(rO, a0), [x1, y1] = P(rO, a1), [x2, y2] = P(rI, a1), [x3, y3] = P(rI, a0);
  return `M${x0} ${y0} A${rO} ${rO} 0 ${large} 1 ${x1} ${y1} L${x2} ${y2} A${rI} ${rI} 0 ${large} 0 ${x3} ${y3} Z`;
}

function Donut({ slices }) {
  const total = slices.reduce((s, x) => s + x.value, 0);
  if (total <= 0) return <svg width="88" height="88" />;
  let a = -Math.PI / 2, paths = [];
  for (const s of slices) {
    const frac = s.value / total, a1 = a + frac * 2 * Math.PI;
    const gap = slices.length > 1 ? 0.03 : 0;
    if (frac >= 0.9999) paths.push(<circle key={s.name} cx="44" cy="44" r="32" fill="none" stroke={s.color} strokeWidth="20" />);
    else paths.push(<path key={s.name} d={arcPath(44, 44, 42, 22, a + gap / 2, Math.max(a1 - gap / 2, a + gap / 2 + 0.001))} fill={s.color} />);
    a = a1;
  }
  return <svg width="88" height="88" viewBox="0 0 88 88">{paths}</svg>;
}

// ─── Componente principal ────────────────────────────────────────────────────
export default function Precificar({ sessao }) {
  const [produtos, setProdutos] = useState([]);
  const [produto, setProduto]   = useState(null);
  const [custo, setCusto]       = useState(0);
  const [busca, setBusca]       = useState('');
  const [dropVis, setDropVis]   = useState(false);
  const [scens, setScens]       = useState([newScen('Simulação 1')]);
  const [picker, setPicker]     = useState(null); // key do cenário ou null
  const [pickTab, setPickTab]   = useState('lista');
  const [pickQ, setPickQ]       = useState('');
  const [saveSel, setSaveSel]   = useState('');
  const [confirm, setConfirm]   = useState(false);
  const [toast, setToast]       = useState('');
  const [customForm, setCustomForm] = useState({ nome: '', aliquota: '', tipo: 'venda' });
  const toastTimer = useRef(null);
  const dropRef = useRef(null);

  // Carregar produtos do backend
  useEffect(() => {
    api('/produtos?busca=').then(setProdutos).catch(() => {});
  }, []);

  // Fechar dropdown ao clicar fora
  useEffect(() => {
    const fn = e => { if (!dropRef.current?.contains(e.target)) setDropVis(false); };
    document.addEventListener('mousedown', fn);
    return () => document.removeEventListener('mousedown', fn);
  }, []);

  function showToast(msg) {
    setToast(msg); clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 4000);
  }

  // Filtro do dropdown de produtos
  const prodsFiltrados = busca.trim()
    ? produtos.filter(p => p.nome.toLowerCase().includes(busca.toLowerCase()) || p.cod?.includes(busca))
    : produtos.slice(0, 12);

  function selecionarProduto(p) {
    setProduto(p); setCusto(p.custo || 0);
    setBusca(p.nome); setDropVis(false);
  }

  // Cenários
  const updateScen = (key, fn) => setScens(ss => ss.map(s => s.key === key ? { ...s, ...fn(s) } : s));
  const melhorKey  = () => {
    const com = scens.map(s => ({ key: s.key, l: calcScen(s, custo).lucro })).filter(x => x.l > 0);
    if (com.length < 2) return null;
    return com.reduce((a, b) => a.l >= b.l ? a : b).key;
  };
  const mk = melhorKey();

  // Salvar preço no backend
  async function salvarPreco() {
    const sc = scens.find(s => s.key === saveSel); if (!sc || !produto) return;
    const r = calcScen(sc, custo);
    try {
      await api(`/produtos/${produto.id}`, { method: 'PUT', body: { preco: r.preco, precoMin: r.preco * 0.9 } });
      showToast(`${produto.nome} salvo por ${fmt(r.preco)}`);
      setConfirm(false);
    } catch { showToast('Erro ao salvar — verifique a conexão'); }
  }

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ fontFamily: "'Archivo', -apple-system, 'Segoe UI', sans-serif", color: INK }}>

      {/* Busca de produto */}
      <div ref={dropRef} style={{ position: 'relative', marginBottom: 10 }}>
        <input
          value={busca}
          onChange={e => { setBusca(e.target.value); setDropVis(true); }}
          onFocus={() => setDropVis(true)}
          placeholder="🔍  Buscar produto por nome ou código…"
          style={S.inp}
        />
        {dropVis && (
          <div style={S.drop}>
            {prodsFiltrados.length === 0
              ? <div style={{ padding: 14, fontSize: 13, opacity: 0.6 }}>Nenhum produto encontrado.</div>
              : prodsFiltrados.map(p => (
                <button key={p.id} onClick={() => selecionarProduto(p)} style={S.droprow}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{p.nome}</div>
                    <div style={{ fontSize: 11, opacity: 0.55 }}>cód. {p.cod}</div>
                  </div>
                  <b style={{ fontSize: 13 }}>{fmt(p.custo || 0)}</b>
                </button>
              ))
            }
          </div>
        )}
      </div>

      {/* Card do produto selecionado */}
      {produto && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', background: '#fff', border: '2px solid #E4E2D8', borderRadius: 12, padding: '10px 14px', marginBottom: 10 }}>
          <div style={{ flex: 1, minWidth: 160 }}>
            <div style={{ fontWeight: 700 }}>{produto.nome}</div>
            <div style={{ fontSize: 11, opacity: 0.55 }}>cód. {produto.cod}</div>
          </div>
          <label style={{ fontSize: 12, fontWeight: 700, opacity: 0.7 }}>Custo de compra</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <b>R$</b>
            <input type="number" min="0" step="0.01" value={custo}
              onChange={e => setCusto(parseFloat(e.target.value) || 0)}
              style={{ ...S.inp, width: 90, fontWeight: 700, textAlign: 'right' }} />
          </div>
        </div>
      )}

      {!produto && (
        <div style={{ textAlign: 'center', padding: '32px 0', opacity: 0.45, fontSize: 14 }}>
          Busque um produto acima para começar a simulação de preço.
        </div>
      )}

      {/* Rail de cenários */}
      {produto && (
        <>
          <div style={{ fontSize: 12, opacity: 0.6, margin: '0 2px 8px' }}>
            Monte simulações lado a lado e compare — deslize para o lado →
          </div>
          <div style={{ display: 'flex', gap: 14, overflowX: 'auto', paddingBottom: 80, scrollSnapType: 'x mandatory' }}>
            {scens.map(sc => <Cenario key={sc.key} sc={sc} custo={custo} isMelhor={sc.key === mk}
              onUpdate={fn => updateScen(sc.key, fn)}
              onDup={() => setScens(ss => [...ss, newScen(sc.nome + ' (cópia)', sc)])}
              onRemove={scens.length > 1 ? () => setScens(ss => ss.filter(s => s.key !== sc.key)) : null}
              onAddTax={() => { setPicker(sc.key); setPickTab('lista'); setPickQ(''); }} />)}
            <div style={{ scrollSnapAlign: 'start', flexShrink: 0, width: 260, display: 'flex' }}>
              <button onClick={() => setScens(ss => [...ss, newScen('Simulação ' + (ss.length + 1))])}
                style={{ width: '100%', minHeight: 220, border: '2px dashed ' + INK, borderRadius: 16, background: 'transparent', fontWeight: 700, fontSize: 15, cursor: 'pointer' }}>
                + Nova simulação
              </button>
            </div>
          </div>

          {/* Barra de salvar */}
          <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 40, background: '#fff', borderTop: '2px solid ' + INK, padding: '10px 16px' }}>
            <div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', gap: 10, alignItems: 'center' }}>
              <select value={saveSel} onChange={e => setSaveSel(e.target.value)}
                style={{ ...S.inp, flex: 1, padding: '11px 10px', fontWeight: 700, fontSize: 14 }}>
                <option value="">Escolha a simulação…</option>
                {scens.map(sc => {
                  const r = calcScen(sc, custo);
                  return <option key={sc.key} value={sc.key}>{sc.nome} → {fmt(r.preco)}{sc.key === mk ? ' ★' : ''}</option>;
                })}
              </select>
              <button disabled={!saveSel} onClick={() => setConfirm(true)}
                style={{ border: 'none', borderRadius: 10, padding: '12px 18px', fontSize: 14, fontWeight: 700, flexShrink: 0,
                  background: saveSel ? GREEN : '#C9C7BF', color: '#fff', cursor: saveSel ? 'pointer' : 'not-allowed' }}>
                Salvar produto
              </button>
            </div>
          </div>
        </>
      )}

      {/* Modal picker de impostos */}
      {picker && (
        <div style={S.overlay} onClick={e => e.target === e.currentTarget && setPicker(null)}>
          <div style={S.sheet} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 10 }}>
              <b style={{ flex: 1, fontSize: 16 }}>Adicionar imposto ou custo</b>
              <button onClick={() => setPicker(null)} style={S.mini}>✕</button>
            </div>
            <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
              {[['lista', 'Lista'], ['custom', 'Criar novo']].map(([v, l]) => (
                <button key={v} onClick={() => setPickTab(v)}
                  style={{ ...S.tabBtn, background: pickTab === v ? INK : 'transparent', color: pickTab === v ? '#fff' : INK }}>
                  {l}
                </button>
              ))}
            </div>
            {pickTab === 'lista' && (
              <>
                <input value={pickQ} onChange={e => setPickQ(e.target.value)} placeholder="Buscar imposto…" style={{ ...S.inp, width: '100%', marginBottom: 10 }} />
                <div style={{ overflowY: 'auto', flex: 1 }}>
                  {CATALOGO.filter(c => !pickQ || c.nome.toLowerCase().includes(pickQ.toLowerCase())).map(c => (
                    <button key={c.id} onClick={() => {
                      updateScen(picker, s => ({ taxes: [...s.taxes, mkTax(c)] }));
                      setPicker(null);
                    }} style={S.pickrow}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 700, fontSize: 14 }}>{c.nome}
                          <span style={{ fontSize: 9, fontWeight: 700, marginLeft: 6, padding: '2px 6px', borderRadius: 99, background: c.tipo === 'compra' ? '#E3ECF7' : '#FDE8D7' }}>
                            {c.tipo === 'compra' ? 'NA COMPRA' : 'NA VENDA'}
                          </span>
                        </div>
                        <div style={{ fontSize: 11, opacity: 0.6 }}>{c.desc}</div>
                      </div>
                      <b style={{ fontSize: 13 }}>{c.aliquota}%</b>
                    </button>
                  ))}
                </div>
              </>
            )}
            {pickTab === 'custom' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <input value={customForm.nome} onChange={e => setCustomForm(f => ({ ...f, nome: e.target.value }))}
                  placeholder="Nome (ex: Comissão do vendedor)" style={{ ...S.inp, width: '100%' }} />
                <div style={{ display: 'flex', gap: 8 }}>
                  <input type="number" min="0" value={customForm.aliquota}
                    onChange={e => setCustomForm(f => ({ ...f, aliquota: e.target.value }))}
                    placeholder="Alíquota %" style={{ ...S.inp, width: 110 }} />
                  <select value={customForm.tipo} onChange={e => setCustomForm(f => ({ ...f, tipo: e.target.value }))}
                    style={{ ...S.inp, flex: 1 }}>
                    <option value="venda">incide na venda</option>
                    <option value="compra">incide na compra</option>
                  </select>
                </div>
                <button onClick={() => {
                  const a = parseFloat(customForm.aliquota);
                  if (!customForm.nome || !isFinite(a) || a <= 0) return;
                  updateScen(picker, s => ({ taxes: [...s.taxes, { uid: uid(), nome: customForm.nome, aliquota: a, tipo: customForm.tipo, destaque: false }] }));
                  setCustomForm({ nome: '', aliquota: '', tipo: 'venda' });
                  setPicker(null);
                }} style={{ border: 'none', background: INK, color: '#fff', fontWeight: 700, borderRadius: 8, padding: '11px 14px', cursor: 'pointer', fontSize: 14 }}>
                  Adicionar à simulação
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal confirmar salvamento */}
      {confirm && (() => {
        const sc = scens.find(s => s.key === saveSel);
        const r = sc ? calcScen(sc, custo) : null;
        return r && (
          <div style={{ ...S.overlay, alignItems: 'center', padding: 16 }} onClick={e => e.target === e.currentTarget && setConfirm(false)}>
            <div style={{ background: '#fff', borderRadius: 16, padding: 20, width: '100%', maxWidth: 400, border: '2px solid ' + INK }}>
              <div style={{ fontWeight: 900, fontSize: 18, marginBottom: 4 }}>Confirmar cadastro?</div>
              <div style={{ fontSize: 13, opacity: 0.7, marginBottom: 14 }}>O preço abaixo será salvo no produto.</div>
              <div style={{ background: '#F6F5EF', borderRadius: 12, padding: '12px 14px', marginBottom: 14 }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{produto?.nome}</div>
                <div style={{ fontSize: 11, opacity: 0.55, marginBottom: 8 }}>simulação: <b>{sc.nome}</b></div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ background: '#FFD60A', borderRadius: 8, padding: '6px 12px', fontWeight: 900, fontSize: 22 }}>{fmt(r.preco)}</div>
                  <div style={{ fontSize: 12 }}>
                    <div>Lucro: <b style={{ color: r.lucro >= 0 ? GREEN : '#C8452C' }}>{fmt(r.lucro)}</b> / un.</div>
                    <div style={{ opacity: 0.65 }}>{pc(r.mCusto)} sobre o custo</div>
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => setConfirm(false)}
                  style={{ flex: 1, padding: '12px 8px', borderRadius: 10, cursor: 'pointer', border: '2px solid ' + INK, background: 'transparent', fontWeight: 700, fontSize: 14 }}>
                  Cancelar
                </button>
                <button onClick={salvarPreco}
                  style={{ flex: 1, padding: '12px 8px', borderRadius: 10, cursor: 'pointer', border: 'none', background: GREEN, color: '#fff', fontWeight: 700, fontSize: 14 }}>
                  Confirmar
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Toast */}
      {toast && (
        <div style={{ position: 'fixed', bottom: 76, left: '50%', transform: 'translateX(-50%)', zIndex: 70,
          background: INK, color: '#fff', borderRadius: 10, padding: '10px 16px', fontSize: 13, fontWeight: 700,
          boxShadow: '0 6px 20px rgba(20,33,61,.35)', maxWidth: '90vw', whiteSpace: 'nowrap' }}>
          ✓ {toast}
        </div>
      )}
    </div>
  );
}

// ─── Cenário individual ───────────────────────────────────────────────────────
function Cenario({ sc, custo, isMelhor, onUpdate, onDup, onRemove, onAddTax }) {
  const r = calcScen(sc, custo);
  const pie = [
    { name: 'Custo', value: Math.max(custo, 0), color: INK },
    ...r.compra.map((t, i) => ({ name: t.nome + ' (compra)', value: Math.max(t.valor, 0), color: CORES[i % CORES.length] })),
    ...r.venda.map((t, i) => ({ name: t.nome + ' (venda)', value: Math.max(t.valor, 0), color: CORES[(i + r.compra.length) % CORES.length] })),
    r.lucro > 0 ? { name: 'Lucro', value: r.lucro, color: GREEN } : null,
  ].filter(Boolean).filter(s => s.value > 0.005);

  const int = Math.floor(r.preco), cent = String(Math.round((r.preco % 1) * 100)).padStart(2, '0');

  const TERMS = [['auto', ',90/,00'], ['90', ',90'], ['00', ',00'], ['50', ',50'], ['exato', 'exato']];

  return (
    <div style={{ scrollSnapAlign: 'start', flexShrink: 0, width: 300, background: '#fff',
      border: '2px solid ' + (isMelhor ? GREEN : '#E4E2D8'), borderRadius: 16, padding: 14, position: 'relative' }}>
      {isMelhor && (
        <div style={{ position: 'absolute', top: -11, right: 12, background: GREEN, color: '#fff',
          fontSize: 10, fontWeight: 700, letterSpacing: 1, padding: '3px 8px', borderRadius: 99 }}>
          ★ MAIOR LUCRO
        </div>
      )}

      {/* Nome + ações */}
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 10 }}>
        <input value={sc.nome} onChange={e => onUpdate(() => ({ nome: e.target.value }))}
          style={{ ...S.inp, border: '2px dashed #D8D6CE', flex: 1, fontWeight: 700 }} />
        <button onClick={onDup} style={S.mini} title="Duplicar">⧉</button>
        {onRemove && <button onClick={onRemove} style={{ ...S.mini, color: '#C8452C', borderColor: '#C8452C' }}>✕</button>}
      </div>

      {/* Impostos */}
      {sc.taxes.length === 0 && <div style={{ fontSize: 12, opacity: 0.55, padding: '6px 2px', marginBottom: 5 }}>Nenhum imposto adicionado.</div>}
      {sc.taxes.map(t => (
        <div key={t.uid} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 8px', borderRadius: 8,
          background: t.destaque ? '#FFF3BF' : '#F6F5EF', border: '1.5px solid ' + INK, marginBottom: 5 }}>
          <span style={{ flex: 1, fontSize: 12, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.nome}</span>
          <input type="number" min="0" step="0.5" value={t.aliquota}
            onChange={e => onUpdate(s => ({ taxes: s.taxes.map(x => x.uid === t.uid ? { ...x, aliquota: parseFloat(e.target.value) || 0 } : x) }))}
            style={{ ...S.inp, width: 50, padding: '3px 5px', fontSize: 12, textAlign: 'right', fontWeight: 700 }} />
          <span style={{ fontSize: 11, fontWeight: 700 }}>%</span>
          <button onClick={() => onUpdate(s => ({ taxes: s.taxes.map(x => x.uid === t.uid ? { ...x, tipo: x.tipo === 'compra' ? 'venda' : 'compra' } : x) }))}
            style={{ ...S.mini, fontSize: 9, padding: '3px 5px' }}>
            {t.tipo === 'compra' ? 'COMPRA' : 'VENDA'}
          </button>
          <button onClick={() => onUpdate(s => ({ taxes: s.taxes.filter(x => x.uid !== t.uid) }))}
            style={{ ...S.mini, color: '#C8452C', borderColor: '#C8452C', padding: '3px 6px' }}>✕</button>
        </div>
      ))}
      <button onClick={onAddTax}
        style={{ border: '2px dashed ' + INK, background: 'transparent', fontWeight: 700, borderRadius: 8, padding: '7px 10px', cursor: 'pointer', fontSize: 12, width: '100%', marginBottom: 10 }}>
        + Adicionar imposto ou custo
      </button>

      {/* Modo */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
        {[['margem', 'Lucro %'], ['preco', 'Preço fixo']].map(([v, l]) => (
          <button key={v} onClick={() => onUpdate(() => ({ modo: v }))}
            style={{ flex: 1, padding: '7px 4px', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 700,
              border: '2px solid ' + INK, background: sc.modo === v ? INK : 'transparent', color: sc.modo === v ? '#fff' : INK }}>
            {l}
          </button>
        ))}
      </div>

      {sc.modo === 'margem' ? (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <input type="range" min="5" max="200" step="5" value={sc.margem}
              onChange={e => onUpdate(() => ({ margem: parseFloat(e.target.value) }))}
              style={{ flex: 1, accentColor: GREEN }} />
            <input type="number" value={sc.margem}
              onChange={e => onUpdate(() => ({ margem: parseFloat(e.target.value) || 0 }))}
              style={{ ...S.inp, width: 52, padding: '3px 5px', textAlign: 'right', fontWeight: 700 }} />
            <b style={{ fontSize: 12 }}>%</b>
          </div>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 10 }}>
            {TERMS.map(([v, l]) => (
              <button key={v} onClick={() => onUpdate(() => ({ term: v }))}
                style={{ padding: '3px 8px', borderRadius: 99, fontSize: 10, fontWeight: 700, cursor: 'pointer',
                  border: '1.5px solid ' + INK, background: sc.term === v ? '#FFD60A' : 'transparent' }}>
                {l}
              </button>
            ))}
          </div>
        </>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
          <b>R$</b>
          <input type="number" min="0" step="0.1" value={sc.precoManual}
            onChange={e => onUpdate(() => ({ precoManual: parseFloat(e.target.value) || 0 }))}
            style={{ ...S.inp, width: 100, fontWeight: 700, fontSize: 16 }} />
        </div>
      )}

      {/* Resultado */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ background: '#FFD60A', borderRadius: 10, padding: '8px 12px', textAlign: 'center', transform: 'rotate(-2deg)', boxShadow: '2px 3px 0 rgba(20,33,61,.22)', flexShrink: 0 }}>
          <div style={{ fontSize: 8, fontWeight: 700, letterSpacing: 1 }}>PREÇO</div>
          <div style={{ fontWeight: 900, lineHeight: 1 }}>
            <span style={{ fontSize: 10, verticalAlign: 'top' }}>R$</span>
            <span style={{ fontSize: 28 }}>{int}</span>
            <span style={{ fontSize: 13, verticalAlign: 'top' }}>,{cent}</span>
          </div>
        </div>
        <Donut slices={pie} />
      </div>

      {/* Legenda */}
      <div style={{ marginTop: 8 }}>
        {pie.map(s => (
          <div key={s.name} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}>
            <span style={{ width: 9, height: 9, borderRadius: 2, flexShrink: 0, background: s.color }} />
            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</span>
            <b>{fmt(s.value)}</b>
          </div>
        ))}
      </div>

      {/* Lucro */}
      <div style={{ marginTop: 10, padding: '8px 10px', borderRadius: 8, fontSize: 12,
        background: r.lucro >= 0 ? '#E8F5E9' : '#FDECEA',
        border: '1.5px solid ' + (r.lucro >= 0 ? GREEN : '#C8452C') }}>
        {r.lucro >= 0
          ? <><b>Sobra {fmt(r.lucro)}</b><span style={{ opacity: 0.7 }}> · {pc(r.mCusto)} s/ custo · {pc(r.mVenda)} da venda</span></>
          : <b style={{ color: '#C8452C' }}>Prejuízo de {fmt(-r.lucro)} por unidade</b>
        }
      </div>
    </div>
  );
}

// ─── Estilos inline compartilhados ───────────────────────────────────────────
const S = {
  inp: { border: '2px solid #14213D', borderRadius: 8, padding: '7px 9px', fontSize: 13, background: '#fff', fontFamily: 'inherit', color: '#14213D', boxSizing: 'border-box' },
  drop: { position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 20, background: '#fff', border: '2px solid #14213D', borderRadius: 10, overflow: 'hidden', boxShadow: '0 8px 24px rgba(20,33,61,.18)' },
  droprow: { display: 'flex', width: '100%', alignItems: 'center', gap: 10, padding: '10px 14px', border: 'none', background: '#fff', cursor: 'pointer', textAlign: 'left', borderBottom: '1px solid #EEE', fontFamily: 'inherit' },
  overlay: { position: 'fixed', inset: 0, background: 'rgba(20,33,61,.5)', zIndex: 50, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' },
  sheet: { background: '#fff', borderRadius: '16px 16px 0 0', width: '100%', maxWidth: 560, maxHeight: '82vh', display: 'flex', flexDirection: 'column', padding: 16 },
  mini: { border: '1.5px solid #14213D', background: 'transparent', borderRadius: 7, fontSize: 12, fontWeight: 700, padding: '4px 7px', cursor: 'pointer', flexShrink: 0, fontFamily: 'inherit' },
  pickrow: { display: 'flex', width: '100%', alignItems: 'center', gap: 10, padding: '10px 8px', border: 'none', borderBottom: '1px solid #EEE', background: 'transparent', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit' },
  tabBtn: { flex: 1, padding: '8px 4px', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 700, border: '2px solid #14213D', fontFamily: 'inherit' },
};
