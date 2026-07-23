import { useEffect, useState } from 'react';

/*
 * Relatórios só-leitura: Reposição (F4) e Estoque por Filial (F5), em React.
 *
 * Migrados pela segurança: o nome do produto vai para a grade e antes ia por
 * innerHTML. No JSX é escapado. Recebem tudo em `ctx`; clicar numa linha abre o
 * produto (o main.js segue dono do estado, via ctx.onAbrirProduto).
 */
const brl = (v) => Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function useLista(carregar, toast, onClose) {
  const [linhas, setLinhas] = useState(null);
  useEffect(() => {
    carregar().then(setLinhas).catch((e) => { toast(e.message); setLinhas([]); });
  }, []); // eslint-disable-line
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  return linhas;
}

export function ReposicaoModal({ ctx, onClose }) {
  const { apiFetch, toast, nomeFil, onAbrirProduto } = ctx;
  const itens = useLista(() => apiFetch('/movimentacoes/reposicao'), toast, onClose);

  return (
    <div className="janela" style={{ maxWidth: 860 }}>
      <div className="janela-cab">
        <div className="dobra" />
        <div className="tit">Ponto de Reposição — Itens Abaixo do Mínimo</div>
        <button className="fechar" onClick={onClose} aria-label="Fechar">✕</button>
      </div>
      <div className="janela-corpo">
        <div className="moldura-grid" style={{ maxHeight: 340 }}>
          <table className="tabela">
            <thead><tr>
              <th>Código</th><th>Descrição</th><th>Filial</th>
              <th className="num">Saldo</th><th className="num">Mínimo</th><th className="num">Repor</th>
            </tr></thead>
            <tbody>
              {itens === null ? (
                <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--cinza)', padding: 18 }}>Carregando…</td></tr>
              ) : itens.length === 0 ? (
                <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--verde)', padding: 18, fontWeight: 700 }}>Nenhum item abaixo do mínimo ✓</td></tr>
              ) : itens.map((r, i) => (
                <tr key={r.produtoId || i} style={{ cursor: 'pointer' }} onClick={() => onAbrirProduto(r.produtoId)}>
                  <td className="num">{r.cod}</td>
                  <td>{r.nome}</td>
                  <td>{nomeFil(r.filial) || r.filial}</td>
                  <td className="num neg">{r.saldo}</td>
                  <td className="num">{r.min}</td>
                  <td className="num" style={{ fontWeight: 900, color: 'var(--vermelho)' }}>+{r.repor ?? (r.min - r.saldo)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="rodape-form">
          <button className="btn-acao" onClick={() => toast('No sistema final: gera Pedido de Compra agrupado por fornecedor')}>Gerar Pedido de Compra</button>
          <button className="btn-acao primario" onClick={onClose}>(ESC) Fechar</button>
        </div>
      </div>
    </div>
  );
}

export function RelEstoqueModal({ ctx, onClose }) {
  const { apiFetch, toast, filiais, saldoTotal, onAbrirProduto } = ctx;
  const prods = useLista(() => apiFetch('/produtos'), toast, onClose);
  const nCols = 3 + filiais.length;

  return (
    <div className="janela" style={{ maxWidth: 900 }}>
      <div className="janela-cab">
        <div className="dobra" />
        <div className="tit">Estoque Atual por Filial</div>
        <button className="fechar" onClick={onClose} aria-label="Fechar">✕</button>
      </div>
      <div className="janela-corpo">
        <div className="moldura-grid" style={{ maxHeight: 380 }}>
          <table className="tabela">
            <thead><tr>
              <th>Código</th><th>Descrição</th>
              {filiais.map((f) => <th key={f.id} className="num">{f.nome}</th>)}
              <th className="num">Total</th>
            </tr></thead>
            <tbody>
              {prods === null ? (
                <tr><td colSpan={nCols} style={{ textAlign: 'center', color: 'var(--cinza)', padding: 18 }}>Carregando…</td></tr>
              ) : prods.length === 0 ? (
                <tr><td colSpan={nCols} style={{ textAlign: 'center', color: 'var(--cinza)', padding: 18 }}>Nenhum produto.</td></tr>
              ) : prods.map((p) => (
                <tr key={p.id} style={{ cursor: 'pointer' }} onClick={() => onAbrirProduto(p.id)}>
                  <td className="num">{p.cod}</td>
                  <td>{p.nome}</td>
                  {filiais.map((f) => {
                    const s = (p.saldo ?? {})[f.id] || 0;
                    return <td key={f.id} className={`num ${s < (p.min || 0) ? 'neg' : ''}`}>{s}</td>;
                  })}
                  <td className="num" style={{ fontWeight: 900 }}>{saldoTotal(p)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="rodape-form"><button className="btn-acao primario" onClick={onClose}>(ESC) Fechar</button></div>
      </div>
    </div>
  );
}
