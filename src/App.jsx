import { useEffect, useState, useCallback } from 'react';
import { TituloSistema, Janela, Campo, Botao, Tabela, useToast, brl } from '@mercado/shared';
import { api, auth } from './api.js';
import Login from './Login.jsx';

const FILIAIS = { par: 'Parnamirim', mac: 'Macaíba', nat: 'Natal' };

export default function App() {
  const toast = useToast();
  const [sessao, setSessao] = useState(null);
  const [produtos, setProdutos] = useState([]);
  const [busca, setBusca] = useState('');
  const [mov, setMov] = useState({ tipo: 'entrada', produtoId: '', filial: 'par', destino: 'mac', qtd: '', obs: '' });

  const carregar = useCallback(async () => {
    try { setProdutos(await api(`/produtos?busca=${encodeURIComponent(busca)}`)); }
    catch (e) { toast(e.message); if (String(e.message).includes('Token')) setSessao(null); }
  }, [busca, toast]);

  useEffect(() => { if (sessao) carregar(); }, [sessao, carregar]);

  if (!sessao) return <Login titulo="ESTOCAAÍ — GESTÃO DE ESTOQUE" aoEntrar={setSessao} />;

  async function registrarMov(e) {
    e.preventDefault();
    try {
      const r = await api('/movimentacoes', { method: 'POST', body: { ...mov, produtoId: Number(mov.produtoId), qtd: Number(mov.qtd) } });
      toast(`<b>${mov.tipo}</b> registrada — saldo atualizado.`);
      setMov({ ...mov, qtd: '', obs: '' });
      carregar();
    } catch (err) { toast(err.message); }
  }

  return (
    <>
      <TituloSistema nome="ESTOCA" destaque="AÍ" />
      <main style={{ maxWidth: 1060, margin: '0 auto', padding: 16, display: 'grid', gap: 14 }}>
        <Janela titulo="Produtos — saldo por filial">
          <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
            <input style={{ flex: 1, padding: '9px 12px', border: '1.5px solid var(--linha)', borderRadius: 7, background: 'var(--amarelo-bg)' }}
              placeholder="Buscar (aceita % como curinga — ex.: TINTA%18L)"
              value={busca} onChange={(e) => setBusca(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && carregar()} />
            <Botao onClick={carregar}>Consultar</Botao>
          </div>
          <div style={{ overflow: 'auto', maxHeight: 380, border: '1px solid var(--linha)', borderRadius: 6 }}>
            <Tabela
              colunas={[{ chave: 'cod', rotulo: 'Código' }, { chave: 'nome', rotulo: 'Descrição' },
                ...Object.entries(FILIAIS).map(([id, nome]) => ({ chave: id, rotulo: nome, num: true })),
                { chave: 'preco', rotulo: 'Preço', num: true }]}
              dados={produtos}
              renderLinha={(p) => (
                <tr key={p.id}>
                  <td className="num">{p.cod}</td><td>{p.nome}</td>
                  {Object.keys(FILIAIS).map((f) => (
                    <td key={f} className={`num ${p.saldo[f] < p.min ? 'neg' : ''}`}>{p.saldo[f]}</td>
                  ))}
                  <td className="num">{brl(p.preco)}</td>
                </tr>
              )}
            />
          </div>
        </Janela>

        <Janela titulo="Movimentar estoque">
          <form onSubmit={registrarMov}>
            <Campo label="Tipo">
              <select value={mov.tipo} onChange={(e) => setMov({ ...mov, tipo: e.target.value })}>
                <option value="entrada">Entrada</option><option value="saida">Saída</option>
                <option value="transferencia">Transferência</option><option value="ajuste">Ajuste (balanço)</option>
              </select>
            </Campo>
            <Campo label="Produto">
              <select value={mov.produtoId} onChange={(e) => setMov({ ...mov, produtoId: e.target.value })} required>
                <option value="">— escolha —</option>
                {produtos.map((p) => <option key={p.id} value={p.id}>{p.cod} — {p.nome}</option>)}
              </select>
            </Campo>
            <Campo label={mov.tipo === 'transferencia' ? 'Da filial' : 'Filial'}>
              <select value={mov.filial} onChange={(e) => setMov({ ...mov, filial: e.target.value })}>
                {Object.entries(FILIAIS).map(([id, n]) => <option key={id} value={id}>{n}</option>)}
              </select>
            </Campo>
            {mov.tipo === 'transferencia' && (
              <Campo label="Para a filial">
                <select value={mov.destino} onChange={(e) => setMov({ ...mov, destino: e.target.value })}>
                  {Object.entries(FILIAIS).map(([id, n]) => <option key={id} value={id}>{n}</option>)}
                </select>
              </Campo>
            )}
            <Campo label={mov.tipo === 'ajuste' ? 'Saldo contado' : 'Quantidade'} type="number" min="0" step="any"
              value={mov.qtd} onChange={(e) => setMov({ ...mov, qtd: e.target.value })} required />
            <Campo label="Observação" value={mov.obs} onChange={(e) => setMov({ ...mov, obs: e.target.value })} placeholder="NF, balanço, quebra…" />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <Botao type="button" onClick={() => { auth.limpar(); setSessao(null); }}>Sair</Botao>
              <Botao primario type="submit">Registrar</Botao>
            </div>
          </form>
        </Janela>
      </main>
    </>
  );
}
