import { useEffect, useRef, useState } from 'react';

/*
 * Janela Produtos (F7) — o hub principal do estoque, em React.
 *
 * Migrada pela segurança: a grade e o painel de detalhe exibem nome/descrição de
 * produto, antes via innerHTML; no JSX é escapado.
 *
 * Os botões de ação (Detalhes de Estoque, Similar, Totaliza, Analisa, etc.)
 * continuam sendo as funções vanilla do main.js — recebidas em ctx.acoes. Como
 * elas leem PRODUTOS e prodSel do main.js, o componente espelha a lista e a
 * seleção de volta via ctx.onSync a cada mudança.
 */
const brl = (v) => Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const q3 = (n) => (Number(n) || 0).toFixed(3).replace('.', ',');
const q2v = (n) => (Number(n) || 0).toFixed(2).replace('.', ',');

export default function ProdutosHub({ ctx, onClose }) {
  const { apiFetch, toast, saldoVisto, acoes, onSync } = ctx;

  const [produtos, setProdutos] = useState([]);
  const [selId, setSelId] = useState(ctx.prodSelInicial || null);
  const [busca, setBusca] = useState('');
  const [consCampo, setConsCampo] = useState('nome'); // cod | nome | barras
  const [exibirSemEstoque, setExibirSemEstoque] = useState(true);
  const [estado, setEstado] = useState('carregando'); // carregando | ok | erro
  const [erro, setErro] = useState('');

  const buscaRef = useRef(null);
  const timer = useRef(null);

  // espelha lista + seleção para o main.js, de onde as ações vanilla leem
  useEffect(() => { onSync(produtos, selId); }, [produtos, selId]); // eslint-disable-line

  useEffect(() => { buscar(''); setTimeout(() => buscaRef.current?.focus(), 60); }, []); // eslint-disable-line
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function buscar(termo) {
    setEstado('carregando'); setErro('');
    try {
      const t = (termo ?? busca).trim();
      const lista = await apiFetch(`/produtos${t ? '?busca=' + encodeURIComponent(t) : ''}`);
      setProdutos(lista);
      setSelId((atual) => atual && lista.some((p) => p.id === atual) ? atual : (lista[0]?.id ?? null));
      setEstado('ok');
    } catch (e) {
      setErro(e.message); setEstado('erro');
    }
  }

  function onBuscaInput(e) {
    setBusca(e.target.value);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => buscar(e.target.value), 400);
  }

  // filtro local (mesma lógica do renderGridProd antigo)
  const termo = busca.trim().toLowerCase();
  const visiveis = produtos.filter((p) => {
    if (!exibirSemEstoque && saldoVisto(p) === 0) return false;
    if (!termo) return true;
    const campo = consCampo === 'cod' ? p.cod : (consCampo === 'barras' ? (p.barras || '') : p.nome);
    return String(campo || '').toLowerCase().includes(termo);
  });

  const sel = produtos.find((p) => p.id === selId) || null;

  // chama a ação vanilla depois de garantir o estado espelhado
  const acao = (fn) => () => { onSync(produtos, selId); fn(); };

  return (
    <div className="janela" style={{ maxWidth: 980 }}>
      <div className="janela-cab">
        <div className="dobra" />
        <div className="tit">Produtos</div>
        <button className="fechar" onClick={onClose} aria-label="Fechar">✕</button>
      </div>

      <div className="janela-corpo">
        <div className="moldura-grid">
          <table className="tabela">
            <thead><tr>
              <th>Código</th><th>Cód. Fábrica</th><th>Descrição do Produto</th>
              <th className="num">Quantia</th><th className="num">Preço Venda</th>
            </tr></thead>
            <tbody>
              {estado === 'carregando' ? (
                <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--cinza)', padding: 18 }}>Carregando…</td></tr>
              ) : estado === 'erro' ? (
                <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--vermelho)', padding: 18 }}>{erro}</td></tr>
              ) : visiveis.length === 0 ? (
                <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--cinza)', padding: 18 }}>Nenhum produto encontrado.</td></tr>
              ) : visiveis.map((p) => {
                const s = saldoVisto(p);
                return (
                  <tr key={p.id} className={p.id === selId ? 'sel' : ''} onClick={() => setSelId(p.id)}
                    onDoubleClick={acao(acoes.editar)} style={{ cursor: 'pointer' }}>
                    <td className="num">{p.cod}</td>
                    <td>{p.fab || ''}</td>
                    <td>{p.nome}</td>
                    <td className={`num ${s === 0 ? 'neg' : ''}`}>{q2v(s)}</td>
                    <td className="num">{brl(p.preco)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {sel && (
          <div className="painel-det">
            <div className="bloco-det" style={{ gridColumn: '1/-1' }}>
              <div className="lin"><span>Descrição…:</span><b style={{ color: 'var(--azul)' }}>{sel.nome}</b></div>
            </div>
            <div className="bloco-det"><div className="bloco-tit">Custo e Preços de Venda</div>
              <div className="lin"><span>C. Aquisição..:</span><b>{brl(sel.custo)}</b></div>
              <div className="lin"><span>Markup……..:</span><b>{sel.markup ? sel.markup.toFixed(4).replace('.', ',') : '—'}</b></div>
              <div className="lin"><span>Preço de Venda:</span><b>{brl(sel.preco)}</b></div>
              <div className="lin"><span>Preço Mínimo..:</span><b>{brl(sel.precoMin)}</b></div>
              <div className="lin"><span>% IPI / Sit.Trib:</span><b>{sel.ipi != null ? sel.ipi.toFixed(2) : '—'} / {sel.sit != null ? sel.sit.toFixed(2) : '—'}</b></div>
            </div>
            <div className="bloco-det"><div className="bloco-tit">Datas e Localização</div>
              <div className="lin"><span>Dt.Últ.Alt…:</span><b>{sel.dtAlt || '—'}</b></div>
              <div className="lin"><span>Data Cadastro:</span><b>{sel.dtCad || '—'}</b></div>
              <div className="lin"><span>Local:</span><b>—</b></div>
            </div>
            <div className="bloco-det"><div className="bloco-tit">Qtdes e Departamento</div>
              <div className="lin"><span>Estoque Mínimo:</span><b>{q3(sel.min)}</b></div>
              <div className="lin"><span>Estoque Máximo:</span><b>{q3(sel.max)}</b></div>
              <div className="lin"><span>Grupo / Dpto:</span><b>{sel.grupo || '—'}</b></div>
            </div>
            <div className="bloco-det"><div className="bloco-tit">Outras</div>
              <div className="lin"><span>Unidade..:</span><b>{sel.un || '—'}</b></div>
              <div className="lin"><span>NCM……….:</span><b>{sel.ncm || '—'}</b></div>
              <div className="lin"><span>Cod.Barra:</span><b>{sel.barras || '—'}</b></div>
              <div className="lin"><span>CST/CSOSN:</span><b>{sel.cst || '—'}</b></div>
              <div className="lin"><span>CEST……:</span><b>{sel.cest || '—'}</b></div>
            </div>
          </div>
        )}

        <div className="grade-botoes">
          <button className="btn-acao" onClick={acao(acoes.novo)}>Incluir</button>
          <button className="btn-acao" onClick={acao(acoes.editar)}>Alterar</button>
          <button className="btn-acao" onClick={() => acoes.stub('Ativar/Desativar')}>Ativar/Desativar</button>
          <button className="btn-acao" onClick={acao(acoes.detalhesEstoque)}><kbd>7</kbd>-Detalhes de Estoque</button>
          <button className="btn-acao" onClick={acao(acoes.similar)}><kbd>9</kbd>-Produto Similar</button>
          <button className="btn-acao" onClick={acao(acoes.totaliza)}>Totaliza</button>
          <button className="btn-acao" onClick={acao(acoes.analisa)}>Analisa Produto</button>
          <button className="btn-acao" onClick={acao(acoes.precificar)}><kbd>L</kbd>-Formação do Preço de Venda</button>
          <button className="btn-acao" onClick={() => acoes.stub('Duplicar Produto')}><kbd>M</kbd>-Duplicar Produto</button>
          <button className="btn-acao" onClick={() => acoes.stub('Imagens do Produto')}><kbd>6</kbd>-Imagens</button>
          <button className="btn-acao" onClick={() => acoes.stub('Detalhes do Custo')}><kbd>0</kbd>-Detalhes do Custo</button>
          <button className="btn-acao primario" onClick={acao(acoes.detalhesEstoque)}>Estoque das Filiais</button>
        </div>

        <div className="consulta">
          <div className="radios"><b>Cons:</b>
            <label><input type="radio" name="cons-r" checked={consCampo === 'cod'} onChange={() => setConsCampo('cod')} /> Código</label>
            <label><input type="radio" name="cons-r" checked={consCampo === 'nome'} onChange={() => setConsCampo('nome')} /> Descrição</label>
            <label><input type="radio" name="cons-r" checked={consCampo === 'barras'} onChange={() => setConsCampo('barras')} /> Cód de Barras</label>
            <label style={{ marginLeft: 'auto' }}>
              <input type="checkbox" checked={exibirSemEstoque} onChange={(e) => setExibirSemEstoque(e.target.checked)} /> Exibir sem estoque
            </label>
          </div>
          <div className="linha-consulta">
            <input ref={buscaRef} type="text" value={busca} autoComplete="off"
              placeholder="Digite e tecle Enter para consultar… (use % como curinga)"
              onChange={onBuscaInput}
              onKeyDown={(e) => { if (e.key === 'Enter') { clearTimeout(timer.current); buscar(); } }} />
            <button className="btn-acao" onClick={onClose}>(ESC) Fechar</button>
          </div>
        </div>
      </div>
    </div>
  );
}
