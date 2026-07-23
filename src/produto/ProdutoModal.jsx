import { useEffect, useRef, useState } from 'react';
import ScannerCamera from '../scanner/ScannerCamera.jsx';

/*
 * Janela Incluir/Alterar Produto — versão React.
 *
 * Por que React aqui: esta tela exibe descrição de produto e dados de NF-e de
 * terceiro. No JSX, {valor} é escapado automaticamente, então um nome como
 * `<img src=x onerror=...>` aparece como texto, nunca executa. É o motivo de
 * ter sido a primeira tela migrada.
 *
 * O componente não conhece a API nem o estado global: recebe tudo em `ctx`,
 * montado pelo main.js, que continua dono de FILIAIS/PRODUTOS/token.
 */

const brl = (v) => Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const VAZIO = { cod: '', nome: '', un: 'UN', grupo: '', min: 0, custo: '', preco: '', precoMin: '' };

export default function ProdutoModal({ ctx, produtoInicial, onClose }) {
  const { apiFetch, toast, filiais, filialAtual } = ctx;

  const [form, setForm] = useState(VAZIO);
  const [produto, setProduto] = useState(produtoInicial || null); // produto existente carregado
  const [sugestoes, setSugestoes] = useState([]);
  const [nota, setNota] = useState(null);
  const [scannerAberto, setScannerAberto] = useState(false);
  const [xml, setXml] = useState('');
  const [qtd, setQtd] = useState(0);
  const [filial, setFilial] = useState(filialAtual !== 'todas' ? filialAtual : (filiais[0]?.id || ''));
  const [margem, setMargem] = useState(40);
  const [gravando, setGravando] = useState(false);
  const [lendoNfe, setLendoNfe] = useState(false);
  const [lancandoNota, setLancandoNota] = useState(false);
  const [lancandoEntrada, setLancandoEntrada] = useState(false);

  const codRef = useRef(null);
  const buscaTimer = useRef(null);
  const grupos = [...new Set((ctx.produtos || []).map((x) => x.grupo).filter(Boolean))].sort();

  useEffect(() => {
    if (produtoInicial) carregar(produtoInicial);
    setTimeout(() => codRef.current?.focus(), 60);
    return () => clearTimeout(buscaTimer.current);
  }, []); // eslint-disable-line

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const set = (campo) => (e) => setForm((f) => ({ ...f, [campo]: e.target.value }));
  const totalDe = (x) => filiais.reduce((s, f) => s + ((x.saldo ?? {})[f.id] || 0), 0);

  function carregar(p) {
    setProduto(p);
    setForm({
      cod: p.cod || '', nome: p.nome || '', un: p.un || 'UN', grupo: p.grupo || '',
      min: p.min ?? 0, custo: p.custo ?? '', preco: p.preco ?? '', precoMin: p.precoMin ?? '',
    });
    setSugestoes([]);
  }

  function limpar() {
    setProduto(null);
    setForm(VAZIO);
    setQtd(0);
    setSugestoes([]);
    codRef.current?.focus();
  }

  async function procurar(q) {
    try {
      const achados = await apiFetch(`/produtos?busca=${encodeURIComponent(q.trim())}`);
      const exato = achados.find((x) => (x.cod || '').toLowerCase() === q.trim().toLowerCase());
      if (exato) { carregar(exato); return; }
      if (produto) setProduto(null);
      setSugestoes(achados.slice(0, 6));
    } catch { /* busca é auxiliar: falha não trava a digitação */ }
  }

  function onCodInput(e) {
    const q = e.target.value;
    setForm((f) => ({ ...f, cod: q }));
    clearTimeout(buscaTimer.current);
    if (!q.trim()) { setProduto(null); setSugestoes([]); return; }
    buscaTimer.current = setTimeout(() => procurar(q), 250);
  }

  // código lido pela câmera: preenche o campo e busca na hora (sem debounce)
  function onScan(codigo) {
    setScannerAberto(false);
    const cod = String(codigo).trim();
    setForm((f) => ({ ...f, cod }));
    clearTimeout(buscaTimer.current);
    if (cod) procurar(cod);
    toast(`Código lido: <b>${cod}</b>`);
  }

  function onCodKey(e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (sugestoes.length) carregar(sugestoes[0]);
    }
  }

  async function gravar(e) {
    e.preventDefault();
    const cod = form.cod.trim();
    const nome = form.nome.trim();
    const preco = Number(form.preco);
    if (!cod) return toast('Código é obrigatório.');
    if (nome.length < 2) return toast('Descrição deve ter ao menos 2 caracteres.');
    if (!preco || preco <= 0) return toast('Preço de venda deve ser maior que zero.');

    const body = {
      cod, nome,
      un: form.un.trim() || 'UN',
      grupo: form.grupo.trim(),
      min: Number(form.min || 0),
      custo: Number(form.custo || 0),
      preco,
      precoMin: Number(form.precoMin || preco),
    };

    setGravando(true);
    try {
      let produtoId = produto?.id;
      if (produtoId) await apiFetch(`/produtos/${produtoId}`, { method: 'PUT', body });
      else produtoId = (await apiFetch('/produtos', { method: 'POST', body }))?.id;

      const q = Number(qtd) || 0;
      if (q > 0 && produtoId && filial) {
        try {
          await apiFetch('/movimentacoes', { method: 'POST', body: { tipo: 'entrada', produtoId, filial, qtd: q, obs: 'Entrada pelo cadastro de produto' } });
          toast(`<b>${nome}</b> gravado e <b>${q}</b> un lançadas em ${filial}.`);
        } catch (err) {
          toast(`Produto gravado, mas a entrada de estoque falhou: ${err.message}`);
        }
      } else {
        toast(`<b>${nome}</b> gravado.`);
      }
      await ctx.refreshProdutos();
      limpar();
    } catch (err) {
      toast(err.message);
    } finally {
      setGravando(false);
    }
  }

  async function soLancarEntrada() {
    if (!produto) return;
    const q = Number(qtd) || 0;
    if (q <= 0) return toast('Informe uma quantidade maior que zero.');
    setLancandoEntrada(true);
    try {
      await apiFetch('/movimentacoes', { method: 'POST', body: { tipo: 'entrada', produtoId: produto.id, filial, qtd: q, obs: 'Entrada pelo cadastro de produto' } });
      toast(`Entrada de <b>${q}</b> un em ${filial} registrada.`);
      const lista = await ctx.refreshProdutos();
      const atual = lista.find((x) => x.id === produto.id);
      if (atual) carregar(atual);
    } catch (err) {
      toast(err.message);
    } finally {
      setLancandoEntrada(false);
    }
  }

  async function lerNfe() {
    if (!xml.trim()) return toast('Cole o XML da NF-e primeiro.');
    setLendoNfe(true);
    try {
      const n = await apiFetch('/nfe/validar', { method: 'POST', body: { xmlNfe: xml.trim() } });
      n.xml = xml.trim();
      setNota(n);
      toast(`NF-e lida: <b>${(n.itens?.length || 0) + (n.novos?.length || 0)}</b> item(ns).`);
    } catch (err) {
      toast(err.message);
    } finally {
      setLendoNfe(false);
    }
  }

  function usarItemNfe(item, ehNovo) {
    const custo = Number(item.valorUnitario || 0);
    const m = Number(margem) / 100;
    if (!ehNovo) {
      const p = (ctx.produtos || []).find((x) => x.id === item.produtoId);
      if (p) carregar(p);
      if (custo) setForm((f) => ({ ...f, custo })); // numa compra o que muda é o custo, não o preço
    } else {
      setProduto(null);
      setForm({
        cod: item.codigo || '', nome: item.descricao || '', un: item.unidade || 'UN', grupo: '',
        min: 0, custo: custo || '',
        preco: custo ? (custo * (1 + m)).toFixed(2) : '',
        precoMin: custo ? (custo * 1.05).toFixed(2) : '',
      });
    }
    setQtd(item.quantidade || 0);
    setSugestoes([]);
  }

  async function lancarNotaInteira() {
    if (!nota) return;
    if (!filial) return toast('Cadastre uma filial antes de lançar a nota.');
    const m = Number(margem) / 100;
    const novos = nota.novos || [];
    const semValor = novos.find((i) => !Number(i.valorUnitario));
    if (semValor) return toast(`O item ${semValor.codigo} veio sem valor na nota — cadastre-o manualmente antes.`);

    setLancandoNota(true);
    try {
      for (const i of novos) {
        const custo = Number(i.valorUnitario);
        await apiFetch('/produtos', { method: 'POST', body: {
          cod: i.codigo, nome: i.descricao, un: i.unidade || 'UN', grupo: '',
          min: 0, custo, preco: +(custo * (1 + m)).toFixed(2), precoMin: +(custo * 1.05).toFixed(2),
        } });
      }
      const r = await apiFetch('/nfe/entrada', { method: 'POST', body: { xmlNfe: nota.xml, filial } });
      toast(`Nota lançada: <b>${novos.length}</b> produto(s) criado(s), <b>${r.itens?.length || 0}</b> com entrada em ${filial}.`);
      await ctx.refreshProdutos();
      setNota(null); setXml(''); limpar();
    } catch (err) {
      toast(err.message);
    } finally {
      setLancandoNota(false);
    }
  }

  const semFiliais = filiais.length === 0;
  const dataEmissao = nota?.emissao ? String(nota.emissao).slice(0, 10).split('-').reverse().join('/') : '';

  return (
   <>
    {scannerAberto && <ScannerCamera onDetected={onScan} onClose={() => setScannerAberto(false)} />}
    <div className="janela" style={{ maxWidth: 940 }}>
      <div className="janela-cab">
        <div className="dobra" />
        <div className="tit">{produto ? `Alterar Produto — ${produto.cod}` : 'Incluir Produto'}</div>
        <button className="fechar" onClick={onClose} aria-label="Fechar">✕</button>
      </div>

      <div className="janela-corpo">
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 300px', gap: 14, alignItems: 'start' }}>
          {/* ── formulário ── */}
          <form onSubmit={gravar}>
            <div className="form-linha">
              <label>Código *</label>
              <div style={{ position: 'relative', flex: 1 }}>
                <div style={{ display: 'flex', gap: 6 }}>
                  <input ref={codRef} value={form.cod} onChange={onCodInput} onKeyDown={onCodKey}
                    placeholder="Bipe, digite o código ou o nome…" autoComplete="off" required style={{ flex: 1 }} />
                  <button className="btn-acao primario" type="button" title="Escanear o código de barras pela câmera"
                    onClick={() => setScannerAberto(true)}>📷</button>
                </div>
                {sugestoes.length > 0 && (
                  <div style={{ position: 'absolute', zIndex: 9, width: '100%', background: '#fff', border: '1px solid var(--linha)', borderRadius: 6, boxShadow: '0 8px 20px rgba(20,33,61,.18)', overflow: 'hidden' }}>
                    {sugestoes.map((x) => (
                      <div key={x.id} onClick={() => carregar(x)}
                        style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '7px 10px', cursor: 'pointer', borderBottom: '1px solid var(--linha)', fontSize: 13 }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = '#DCE6FA')}
                        onMouseLeave={(e) => (e.currentTarget.style.background = '')}>
                        <b style={{ minWidth: 70 }}>{x.cod}</b><span style={{ flex: 1 }}>{x.nome}</span>
                        <span style={{ fontSize: 11, color: 'var(--cinza)' }}>{totalDe(x)} un</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="form-linha"><label>Descrição *</label><input value={form.nome} onChange={set('nome')} required /></div>
            <div className="form-linha"><label>UN</label>
              <input value={form.un} onChange={set('un')} list="fp-uns" />
              <datalist id="fp-uns"><option>UN</option><option>KG</option><option>CX</option><option>LT</option><option>MT</option><option>PC</option></datalist>
            </div>
            <div className="form-linha"><label>Grupo</label>
              <input value={form.grupo} onChange={set('grupo')} list="fp-grupos" />
              <datalist id="fp-grupos">{grupos.map((g) => <option key={g}>{g}</option>)}</datalist>
            </div>
            <div className="form-linha"><label>Est. Mínimo</label><input type="number" min="0" value={form.min} onChange={set('min')} /></div>
            <div className="form-linha"><label>Custo (R$)</label><input type="number" step="any" min="0" value={form.custo} onChange={set('custo')} /></div>
            <div className="form-linha"><label>Preço Venda *</label><input type="number" step="any" min="0.01" value={form.preco} onChange={set('preco')} required /></div>
            <div className="form-linha"><label>Preço Mínimo</label><input type="number" step="any" min="0" value={form.precoMin} onChange={set('precoMin')} /></div>

            {/* ── estoque ── */}
            <div style={{ marginTop: 10 }}>
              {semFiliais ? (
                <div style={{ border: '1px solid var(--linha)', borderRadius: 6, padding: 10, fontSize: 12, color: 'var(--cinza)' }}>
                  Cadastre uma filial para conseguir lançar estoque.
                </div>
              ) : (
                <div style={{ border: '1px solid var(--amarelo-2)', background: 'var(--amarelo-bg)', borderRadius: 6, padding: '10px 12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <b style={{ fontSize: 11, letterSpacing: '.5px', textTransform: 'uppercase' }}>{produto ? 'Entrada de estoque' : 'Estoque inicial'}</b>
                    {produto && (
                      <span style={{ fontSize: 12 }}>Saldo atual:{' '}
                        {filiais.map((f) => {
                          const s = (produto.saldo ?? {})[f.id] || 0;
                          const cor = s === 0 ? 'var(--vermelho)' : (s <= (produto.min || 0) ? '#9A6212' : 'var(--verde)');
                          return <span key={f.id} style={{ marginRight: 12 }}><b style={{ color: cor }}>{s}</b> <span style={{ color: 'var(--cinza)' }}>{f.id}</span></span>;
                        })}
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', marginTop: 8, flexWrap: 'wrap' }}>
                    <div>
                      <div style={{ fontSize: 11, color: 'var(--cinza)', marginBottom: 3 }}>Quantidade</div>
                      <input type="number" min="0" step="1" value={qtd} onChange={(e) => setQtd(e.target.value)} style={{ width: 110, fontSize: 16, fontWeight: 700 }} />
                    </div>
                    <div style={{ flex: 1, minWidth: 160 }}>
                      <div style={{ fontSize: 11, color: 'var(--cinza)', marginBottom: 3 }}>Filial</div>
                      <select value={filial} onChange={(e) => setFilial(e.target.value)}>
                        {filiais.map((f) => <option key={f.id} value={f.id}>{f.nome} ({f.id})</option>)}
                      </select>
                    </div>
                    {produto && (
                      <button type="button" className="btn-acao" onClick={soLancarEntrada} disabled={lancandoEntrada}>
                        {lancandoEntrada ? 'Lançando…' : 'Só lançar entrada'}
                      </button>
                    )}
                  </div>
                  <div style={{ fontSize: 11.5, color: 'var(--cinza)', marginTop: 6 }}>
                    Deixe <b>0</b> para {produto ? 'apenas salvar o cadastro' : 'cadastrar sem estoque'}. A entrada vira movimentação, com histórico.
                  </div>
                </div>
              )}
            </div>

            <div className="rodape-form">
              <button className="btn-acao" type="button" onClick={onClose}>(ESC) Voltar</button>
              <button className="btn-acao primario" type="submit" disabled={gravando}>
                {gravando ? 'Gravando…' : (produto ? 'Salvar e lançar' : 'Gravar e continuar')}
              </button>
            </div>
          </form>

          {/* ── NF-e ── */}
          <div>
            {!nota ? (
              <div style={{ border: '1px solid var(--linha)', borderRadius: 6, padding: '11px 12px' }}>
                <b style={{ fontSize: 11, letterSpacing: '.5px', textTransform: 'uppercase' }}>Nota fiscal</b>
                <div style={{ fontSize: 11.5, color: 'var(--cinza)', margin: '5px 0 8px' }}>Traga os produtos direto da NF-e do fornecedor, em vez de digitar um a um.</div>
                <textarea rows={5} placeholder="Cole aqui o XML da NF-e" spellCheck={false} value={xml} onChange={(e) => setXml(e.target.value)}
                  style={{ width: '100%', fontFamily: 'monospace', fontSize: 11, padding: 7, border: '1px solid var(--linha)', borderRadius: 5, background: '#FAFBFD', resize: 'vertical' }} />
                <button type="button" className="btn-acao primario" style={{ width: '100%', marginTop: 7 }} onClick={lerNfe} disabled={lendoNfe}>
                  {lendoNfe ? 'Lendo…' : 'Ler NF-e'}
                </button>
                <div style={{ fontSize: 11, color: 'var(--cinza)', marginTop: 6 }}>O XML costuma vir por e-mail do fornecedor.</div>
              </div>
            ) : (
              <div style={{ border: '1px solid var(--linha)', borderRadius: 6, padding: '11px 12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                  <b style={{ fontSize: 11, letterSpacing: '.5px', textTransform: 'uppercase' }}>NF-e {nota.numero || ''}</b>
                  <button type="button" className="btn-acao" style={{ padding: '2px 8px', fontSize: 11 }} onClick={() => setNota(null)}>Trocar</button>
                </div>
                {nota.fornecedor && <div style={{ fontSize: 12.5, fontWeight: 700, marginTop: 3 }}>{nota.fornecedor}</div>}
                <div style={{ fontSize: 11, color: 'var(--cinza)', margin: '2px 0 8px' }}>
                  {nota.cnpj ? `CNPJ ${nota.cnpj}` : ''}{dataEmissao ? ` · ${dataEmissao}` : ''}
                </div>
                <div style={{ fontSize: 11, color: 'var(--cinza)', fontWeight: 700, marginBottom: 4 }}>
                  {(nota.itens?.length || 0) + (nota.novos?.length || 0)} itens · {nota.novos?.length || 0} novo(s)
                </div>
                <div style={{ maxHeight: 240, overflow: 'auto' }}>
                  {(nota.itens || []).map((i, k) => <ItemNfe key={`e${k}`} item={i} ehNovo={false} onClick={() => usarItemNfe(i, false)} />)}
                  {(nota.novos || []).map((i, k) => <ItemNfe key={`n${k}`} item={i} ehNovo onClick={() => usarItemNfe(i, true)} />)}
                </div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 9 }}>
                  <span style={{ fontSize: 11, color: 'var(--cinza)' }}>Margem</span>
                  <input type="number" min="0" step="1" value={margem} onChange={(e) => setMargem(e.target.value)} style={{ width: 64, padding: '4px 6px' }} />
                  <span style={{ fontSize: 11, color: 'var(--cinza)' }}>%</span>
                  <button type="button" className="btn-acao primario" style={{ flex: 1 }} onClick={lancarNotaInteira} disabled={lancandoNota}>
                    {lancandoNota ? 'Lançando…' : 'Lançar nota inteira'}
                  </button>
                </div>
                <div style={{ fontSize: 11, color: 'var(--cinza)', marginTop: 6 }}>
                  Clique num item para carregá-lo no formulário. "Lançar nota inteira" cria os novos com preço = custo + margem e dá entrada em todos.
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
   </>
  );
}

function ItemNfe({ item, ehNovo, onClick }) {
  return (
    <div onClick={onClick} style={{ padding: '6px 4px', borderBottom: '1px solid var(--linha)', cursor: 'pointer', display: 'flex', gap: 8, alignItems: 'center' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 12.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.nome || item.descricao || ''}</div>
        <div style={{ fontSize: 11, color: 'var(--cinza)' }}>{item.cod || item.codigo || ''} · {item.quantidade ?? 0} {item.unidade || ''} · R$ {brl(item.valorUnitario)}</div>
      </div>
      <span style={{ fontSize: 10, fontWeight: 800, padding: '1px 6px', borderRadius: 99, whiteSpace: 'nowrap',
        background: ehNovo ? '#DCE6FA' : 'var(--verde-bg)', color: ehNovo ? 'var(--azul)' : 'var(--verde)' }}>{ehNovo ? 'novo' : 'existe'}</span>
    </div>
  );
}
