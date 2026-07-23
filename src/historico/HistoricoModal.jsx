import { useEffect, useState } from 'react';

/*
 * Janela de Movimentações de Estoque (só leitura), em React.
 *
 * Migrada pela segurança: a observação (m.obs) e o nome do produto são digitados
 * pelo usuário e antes iam para innerHTML. No JSX {valor} é escapado. Recebe em
 * `ctx`: apiFetch, toast, produtos, filialAtual, nomeFil.
 */
export default function HistoricoModal({ ctx, onClose }) {
  const { apiFetch, toast, produtos, filialAtual, nomeFil } = ctx;

  const [movs, setMovs] = useState([]);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const params = filialAtual !== 'todas' ? `?filial=${filialAtual}` : '';
        setMovs(await apiFetch(`/movimentacoes${params}`));
      } catch (e) {
        toast(e.message);
      } finally {
        setCarregando(false);
      }
    })();
  }, []); // eslint-disable-line

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const nomeProduto = (m) => {
    const p = produtos.find((x) => x.id === m.produtoId);
    return p ? `${p.cod} — ${p.nome}` : (m.produtoId || '—');
  };

  return (
    <div className="janela" style={{ maxWidth: 900 }}>
      <div className="janela-cab">
        <div className="dobra" />
        <div className="tit">Movimentações de Estoque</div>
        <button className="fechar" onClick={onClose} aria-label="Fechar">✕</button>
      </div>

      <div className="janela-corpo">
        <div className="moldura-grid" style={{ maxHeight: 380 }}>
          <table className="tabela">
            <thead><tr>
              <th>Tipo</th><th>Produto</th><th>Filial</th><th className="num">Qtd</th><th>Obs</th><th>Quando</th>
            </tr></thead>
            <tbody>
              {carregando ? (
                <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--cinza)', padding: 18 }}>Carregando…</td></tr>
              ) : movs.length === 0 ? (
                <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--cinza)', padding: 18 }}>Sem movimentações.</td></tr>
              ) : movs.map((m, i) => (
                <tr key={m.id || i}>
                  <td><b>{(m.tipo || '').toUpperCase()}</b></td>
                  <td>{nomeProduto(m)}</td>
                  <td>{nomeFil(m.filial)}{m.destino ? ` → ${nomeFil(m.destino)}` : ''}</td>
                  <td className="num">{m.qtd}</td>
                  <td>{m.obs || ''}</td>
                  <td style={{ fontSize: 11 }}>{m.em ? new Date(m.em).toLocaleString('pt-BR') : '—'}</td>
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
