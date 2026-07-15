import { useEffect, useState, useCallback } from 'react';
import { TituloSistema, Janela, Campo, Botao, Tabela, useToast, brl } from '@mercado/shared';
import { api, auth } from './api.js';
import Login from './Login.jsx';
import Registro from './Registro.jsx';
import Funcionarios from './Funcionarios.jsx';
import Precificar from './Precificar.jsx';
import { validarForm, r } from './validar.js';

const FILIAIS = { par: 'Parnamirim', mac: 'Macaíba', nat: 'Natal' };
const ABA_PRODUTOS   = 'produtos';
const ABA_MOV        = 'movimentacoes';
const ABA_VENDAS     = 'vendas';
const ABA_REPOSICAO  = 'reposicao';
const ABA_NFE        = 'nfe';
const ABA_FUNC       = 'funcionarios';
const ABA_PRECIFICAR = 'precificar';

const FORM_VAZIO = { cod: '', nome: '', un: 'UN', grupo: '', custo: '', preco: '', precoMin: '', min: '' };

export default function App() {
  const toast = useToast();
  const [sessao, setSessao] = useState(null);
  const [aba, setAba] = useState(ABA_PRODUTOS);

  const [produtos, setProdutos] = useState([]);
  const [busca, setBusca] = useState('');
  const [editando, setEditando] = useState(null);
  const [form, setForm] = useState(FORM_VAZIO);
  const [mov, setMov] = useState({ tipo: 'entrada', produtoId: '', filial: 'par', destino: 'mac', qtd: '', obs: '' });

  const [movs, setMovs] = useState([]);
  const [filtroFilial, setFiltroFilial] = useState('');
  const [vendas, setVendas] = useState([]);
  const [reposicao, setReposicao] = useState([]);
  const [registrando, setRegistrando] = useState(false);
  const [xmlNfe, setXmlNfe] = useState('');
  const [filialNfe, setFilialNfe] = useState('par');
  const [resultadoNfe, setResultadoNfe] = useState(null);

  const carregarProdutos = useCallback(async () => {
    try { setProdutos(await api(`/produtos?busca=${encodeURIComponent(busca)}`)); }
    catch (e) { toast(e.message); }
  }, [busca, toast]);

  const carregarMovs = useCallback(async () => {
    try { setMovs(await api(`/movimentacoes${filtroFilial ? '?filial=' + filtroFilial : ''}`)); }
    catch (e) { toast(e.message); }
  }, [filtroFilial, toast]);

  const carregarVendas = useCallback(async () => {
    try { setVendas(await api('/vendas')); }
    catch (e) { toast(e.message); }
  }, [toast]);

  const carregarReposicao = useCallback(async () => {
    try { setReposicao(await api('/reposicao')); }
    catch (e) { toast(e.message); }
  }, [toast]);

  useEffect(() => { if (sessao) carregarProdutos(); }, [sessao, carregarProdutos]);
  useEffect(() => { if (sessao && aba === ABA_MOV) carregarMovs(); }, [sessao, aba, carregarMovs]);
  useEffect(() => { if (sessao && aba === ABA_VENDAS) carregarVendas(); }, [sessao, aba, carregarVendas]);
  useEffect(() => { if (sessao && aba === ABA_REPOSICAO) carregarReposicao(); }, [sessao, aba, carregarReposicao]);

  async function importarNfe(e) {
    e.preventDefault();
    try {
      const r = await api('/nfe/entrada', { method: 'POST', body: { xmlNfe, filial: filialNfe } });
      setResultadoNfe(r); setXmlNfe('');
      toast(`NF-e importada: <b>${r.itens.length}</b> item(ns) | não encontrados: ${r.naoEncontrados.length}`);
      carregarProdutos();
    } catch (e) { toast(e.message); }
  }

  if (registrando) return <Registro aoRegistrar={(d) => { setSessao(d); setRegistrando(false); }} aoVoltar={() => setRegistrando(false)} />;
  if (!sessao) return <Login titulo="ESTOCAAÍ — GESTÃO DE ESTOQUE" aoEntrar={setSessao} aoRegistrar={() => setRegistrando(true)} />;

  function abrirNovo() { setForm(FORM_VAZIO); setEditando({}); }
  function abrirEditar(p) {
    setForm({ cod: p.cod, nome: p.nome, un: p.un, grupo: p.grupo || '', custo: p.custo, preco: p.preco, precoMin: p.precoMin, min: p.min });
    setEditando(p);
  }

  async function salvarProduto(e) {
    e.preventDefault();
    const falhas = validarForm(form, {
      cod:   [r.obrigatorio, r.minLen(1), r.maxLen(50)],
      nome:  [r.obrigatorio, r.minLen(2), r.maxLen(255)],
      preco: [r.obrigatorio, r.positivo],
      custo: [r.naoNegativo],
    });
    if (falhas) return toast(Object.values(falhas)[0]);

    const body = { ...form, custo: Number(form.custo), preco: Number(form.preco), precoMin: Number(form.precoMin || form.preco), min: Number(form.min || 0) };
    try {
      if (editando?.id) {
        await api(`/produtos/${editando.id}`, { method: 'PUT', body });
        toast('Produto atualizado.');
      } else {
        await api('/produtos', { method: 'POST', body });
        toast('Produto criado.');
      }
      setEditando(null);
      carregarProdutos();
    } catch (e) { toast(e.message); }
  }

  async function excluirProduto(p) {
    if (!confirm(`Excluir ${p.cod} — ${p.nome}?`)) return;
    try {
      await api(`/produtos/${p.id}`, { method: 'DELETE' });
      toast('Produto excluído.');
      carregarProdutos();
    } catch (e) { toast(e.message); }
  }

  async function registrarMov(e) {
    e.preventDefault();
    const falhasMov = validarForm(mov, {
      produtoId: [r.obrigatorio],
      qtd:       [r.obrigatorio, r.positivo],
      tipo:      [r.obrigatorio],
    });
    if (falhasMov) return toast(Object.values(falhasMov)[0]);
    try {
      await api('/movimentacoes', { method: 'POST', body: { ...mov, produtoId: Number(mov.produtoId), qtd: Number(mov.qtd) } });
      toast('Movimentação registrada.');
      setMov({ ...mov, qtd: '', obs: '' });
      carregarProdutos();
      if (aba === ABA_MOV) carregarMovs();
    } catch (e) { toast(e.message); }
  }

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const setM = (k) => (e) => setMov({ ...mov, [k]: e.target.value });

  const ABAS = [
    { id: ABA_PRODUTOS,   label: '1-Produtos' },
    { id: ABA_MOV,        label: '2-Movimentar' },
    { id: ABA_NFE,        label: '3-NF-e' },
    { id: ABA_VENDAS,     label: '4-Vendas' },
    { id: ABA_REPOSICAO,  label: '5-Reposição' },
    { id: ABA_FUNC,       label: '6-Funcionários' },
    { id: ABA_PRECIFICAR, label: '7-Precificar' },
  ];

  return (
    <>
      <TituloSistema nome="ESTOCA" destaque="AÍ" />
      <main style={{ maxWidth: 1120, margin: '0 auto', padding: 16, display: 'grid', gap: 12 }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          {ABAS.map((a) => (
            <Botao key={a.id} primario={aba === a.id} onClick={() => setAba(a.id)}>{a.label}</Botao>
          ))}
          <span style={{ marginLeft: 'auto' }}>
            <Botao onClick={() => { auth.limpar(); setSessao(null); }}>Sair</Botao>
          </span>
        </div>

        {aba === ABA_PRODUTOS && (
          <Janela titulo="Produtos — saldo por filial">
            <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
              <input style={{ flex: 1, padding: '9px 12px', border: '1.5px solid var(--linha)', borderRadius: 7, background: 'var(--amarelo-bg)' }}
                placeholder="Buscar (aceita % — ex.: TINTA%18L)" value={busca}
                onChange={(e) => setBusca(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && carregarProdutos()} />
              <Botao onClick={carregarProdutos}>Consultar</Botao>
              <Botao primario onClick={abrirNovo}>+ Novo</Botao>
            </div>
            <div style={{ overflow: 'auto', maxHeight: 420, border: '1px solid var(--linha)', borderRadius: 6 }}>
              <Tabela
                colunas={[
                  { chave: 'cod', rotulo: 'Código' }, { chave: 'nome', rotulo: 'Descrição' }, { chave: 'un', rotulo: 'UN' },
                  ...Object.entries(FILIAIS).map(([id, nome]) => ({ chave: id, rotulo: nome, num: true })),
                  { chave: 'preco', rotulo: 'Preço', num: true }, { chave: 'acoes', rotulo: '' },
                ]}
                dados={produtos}
                renderLinha={(p) => (
                  <tr key={p.id}>
                    <td className="num">{p.cod}</td>
                    <td>{p.nome}</td>
                    <td>{p.un}</td>
                    {Object.keys(FILIAIS).map((f) => (
                      <td key={f} className={`num ${p.saldo[f] < p.min ? 'neg' : ''}`}>{p.saldo[f]}</td>
                    ))}
                    <td className="num">{brl(p.preco)}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <button onClick={() => abrirEditar(p)} style={{ marginRight: 4, cursor: 'pointer', fontSize: 11, padding: '2px 6px', border: '1px solid var(--linha)', borderRadius: 4, background: 'var(--amarelo-bg)' }}>Editar</button>
                      <button onClick={() => excluirProduto(p)} style={{ cursor: 'pointer', fontSize: 11, padding: '2px 6px', border: '1px solid var(--linha)', borderRadius: 4, background: '#fee', color: '#c00' }}>Excluir</button>
                    </td>
                  </tr>
                )}
              />
            </div>
          </Janela>
        )}

        {editando !== null && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(20,33,61,.55)', display: 'grid', placeItems: 'center', padding: 14, zIndex: 100 }}
            onClick={(e) => e.target === e.currentTarget && setEditando(null)}>
            <div style={{ width: '100%', maxWidth: 560 }}>
              <Janela titulo={editando?.id ? `Editar ${editando.cod}` : 'Novo Produto'}>
                <form onSubmit={salvarProduto}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                    <Campo label="Código *" value={form.cod} onChange={set('cod')} required autoFocus />
                    <Campo label="UN" value={form.un} onChange={set('un')} />
                    <Campo label="Descrição *" style={{ gridColumn: '1/-1' }} value={form.nome} onChange={set('nome')} required />
                    <Campo label="Grupo" value={form.grupo} onChange={set('grupo')} />
                    <Campo label="Estoque mínimo" type="number" min="0" value={form.min} onChange={set('min')} />
                    <Campo label="Custo (R$)" type="number" step="any" min="0" value={form.custo} onChange={set('custo')} />
                    <Campo label="Preço venda (R$) *" type="number" step="any" min="0" value={form.preco} onChange={set('preco')} required />
                    <Campo label="Preço mínimo (R$)" type="number" step="any" min="0" value={form.precoMin} onChange={set('precoMin')} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 10 }}>
                    <Botao type="button" onClick={() => setEditando(null)}>Cancelar</Botao>
                    <Botao primario type="submit">Salvar</Botao>
                  </div>
                </form>
              </Janela>
            </div>
          </div>
        )}

        {aba === ABA_MOV && (
          <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'minmax(0,1fr) minmax(0,1.6fr)' }}>
            <Janela titulo="Registrar movimentação">
              <form onSubmit={registrarMov}>
                <Campo label="Tipo">
                  <select value={mov.tipo} onChange={setM('tipo')}>
                    <option value="entrada">Entrada</option>
                    <option value="saida">Saída</option>
                    <option value="transferencia">Transferência</option>
                    <option value="ajuste">Ajuste (balanço)</option>
                  </select>
                </Campo>
                <Campo label="Produto">
                  <select value={mov.produtoId} onChange={setM('produtoId')} required>
                    <option value="">— escolha —</option>
                    {produtos.map((p) => <option key={p.id} value={p.id}>{p.cod} — {p.nome}</option>)}
                  </select>
                </Campo>
                <Campo label={mov.tipo === 'transferencia' ? 'Da filial' : 'Filial'}>
                  <select value={mov.filial} onChange={setM('filial')}>
                    {Object.entries(FILIAIS).map(([id, n]) => <option key={id} value={id}>{n}</option>)}
                  </select>
                </Campo>
                {mov.tipo === 'transferencia' && (
                  <Campo label="Para a filial">
                    <select value={mov.destino} onChange={setM('destino')}>
                      {Object.entries(FILIAIS).map(([id, n]) => <option key={id} value={id}>{n}</option>)}
                    </select>
                  </Campo>
                )}
                <Campo label={mov.tipo === 'ajuste' ? 'Saldo contado' : 'Quantidade'} type="number" min="0" step="any" value={mov.qtd} onChange={setM('qtd')} required />
                <Campo label="Observação" value={mov.obs} onChange={setM('obs')} placeholder="NF, balanço, quebra…" />
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <Botao primario type="submit">Registrar</Botao>
                </div>
              </form>
            </Janela>

            <Janela titulo="Histórico de movimentações">
              <div style={{ display: 'flex', gap: 8, marginBottom: 10, alignItems: 'flex-end' }}>
                <Campo label="Filtrar filial">
                  <select value={filtroFilial} onChange={(e) => setFiltroFilial(e.target.value)}>
                    <option value="">Todas</option>
                    {Object.entries(FILIAIS).map(([id, n]) => <option key={id} value={id}>{n}</option>)}
                  </select>
                </Campo>
                <Botao onClick={carregarMovs}>Atualizar</Botao>
              </div>
              <div style={{ overflow: 'auto', maxHeight: 360, border: '1px solid var(--linha)', borderRadius: 6 }}>
                <Tabela
                  colunas={[
                    { chave: 'tipo', rotulo: 'Tipo' }, { chave: 'prod', rotulo: 'Produto' },
                    { chave: 'filial', rotulo: 'Filial' }, { chave: 'qtd', rotulo: 'Qtd', num: true },
                    { chave: 'por', rotulo: 'Por' }, { chave: 'em', rotulo: 'Data' },
                  ]}
                  dados={movs}
                  renderLinha={(m) => {
                    const prod = produtos.find((p) => p.id === m.produtoId);
                    return (
                      <tr key={m.id}>
                        <td style={{ textTransform: 'uppercase', fontSize: 11 }}>{m.tipo}</td>
                        <td>{prod ? `${prod.cod} ${prod.nome}` : m.produtoId}</td>
                        <td>{m.filial}{m.destino ? ` → ${m.destino}` : ''}</td>
                        <td className="num">{m.qtd}</td>
                        <td>{m.por}</td>
                        <td style={{ fontSize: 11 }}>{new Date(m.em).toLocaleString('pt-BR')}</td>
                      </tr>
                    );
                  }}
                />
              </div>
            </Janela>
          </div>
        )}

        {aba === ABA_VENDAS && (
          <Janela titulo="Vendas fechadas">
            <div style={{ marginBottom: 8 }}><Botao onClick={carregarVendas}>Atualizar</Botao></div>
            <div style={{ overflow: 'auto', maxHeight: 480, border: '1px solid var(--linha)', borderRadius: 6 }}>
              <Tabela
                colunas={[
                  { chave: 'num', rotulo: 'Nº PV', num: true }, { chave: 'filial', rotulo: 'Filial' },
                  { chave: 'vendedor', rotulo: 'Vendedor' }, { chave: 'itens', rotulo: 'Itens', num: true },
                  { chave: 'total', rotulo: 'Total', num: true }, { chave: 'nfce', rotulo: 'NFC-e' },
                  { chave: 'em', rotulo: 'Data' },
                ]}
                dados={vendas}
                renderLinha={(v) => (
                  <tr key={v.num}>
                    <td className="num">{String(v.num).padStart(10, '0')}</td>
                    <td>{FILIAIS[v.filial] || v.filial}</td>
                    <td>{v.vendedor}</td>
                    <td className="num">{v.itens?.length}</td>
                    <td className="num" style={{ fontWeight: 700 }}>R$ {brl(v.total)}</td>
                    <td style={{ fontSize: 11 }}>{v.nfce}</td>
                    <td style={{ fontSize: 11 }}>{new Date(v.emitidaEm).toLocaleString('pt-BR')}</td>
                  </tr>
                )}
              />
            </div>
          </Janela>
        )}

        {aba === ABA_NFE && (
          <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)' }}>
            <Janela titulo="Importar NF-e — entrada de estoque">
              <form onSubmit={importarNfe}>
                <Campo label="Filial de destino">
                  <select value={filialNfe} onChange={(e) => setFilialNfe(e.target.value)}>
                    {Object.entries(FILIAIS).map(([id, n]) => <option key={id} value={id}>{n}</option>)}
                  </select>
                </Campo>
                <Campo label="XML da NF-e (cole aqui)">
                  <textarea value={xmlNfe} onChange={(e) => setXmlNfe(e.target.value)} required
                    placeholder="<nfeProc>...</nfeProc>" rows={10}
                    style={{ width: '100%', fontFamily: 'monospace', fontSize: 11, padding: 8, border: '1.5px solid var(--linha)', borderRadius: 6, background: 'var(--amarelo-bg)', resize: 'vertical' }} />
                </Campo>
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                  <Botao type="button" onClick={async () => {
                    if (!xmlNfe) return toast('Cole o XML primeiro.');
                    try {
                      const r = await api('/nfe/validar', { method: 'POST', body: { xmlNfe } });
                      setResultadoNfe({ ...r, preview: true });
                    } catch (e) { toast(e.message); }
                  }}>Pré-visualizar</Botao>
                  <Botao primario type="submit">Importar e dar entrada</Botao>
                </div>
              </form>
            </Janela>

            <Janela titulo="Resultado da importação">
              {!resultadoNfe && <div style={{ color: 'var(--cinza)', textAlign: 'center', padding: 30 }}>Cole um XML e clique em Pré-visualizar ou Importar.</div>}
              {resultadoNfe && (
                <>
                  <div style={{ fontSize: 12, color: 'var(--cinza)', marginBottom: 8 }}>
                    Chave: {resultadoNfe.chave || '—'}{resultadoNfe.preview && <b style={{ color: 'var(--azul)', marginLeft: 8 }}> [PRÉ-VISUALIZAÇÃO — não gravado]</b>}
                  </div>
                  <div style={{ fontWeight: 700, marginBottom: 6 }}>Itens encontrados ({(resultadoNfe.itens || []).length}):</div>
                  {(resultadoNfe.itens || []).map((i, idx) => (
                    <div key={idx} style={{ fontSize: 12.5, padding: '4px 0', borderBottom: '1px solid var(--linha)' }}>
                      <b>{i.produto || i.cProd}</b> — {i.nome || i.xProd} · {i.qtd} {resultadoNfe.preview ? '' : `→ saldo: ${i.novoSaldo}`}
                    </div>
                  ))}
                  {(resultadoNfe.naoEncontrados || []).length > 0 && (
                    <>
                      <div style={{ fontWeight: 700, marginTop: 10, marginBottom: 6, color: 'var(--vermelho)' }}>Não encontrados no cadastro ({resultadoNfe.naoEncontrados.length}):</div>
                      {resultadoNfe.naoEncontrados.map((i, idx) => (
                        <div key={idx} style={{ fontSize: 12, padding: '3px 0', color: 'var(--vermelho)' }}>{i.cProd} — {i.xProd} ({i.qtd})</div>
                      ))}
                    </>
                  )}
                </>
              )}
            </Janela>
          </div>
        )}

        {aba === ABA_FUNC && <Funcionarios />}

        {aba === ABA_PRECIFICAR && (
          <div style={{ paddingBottom: 80 }}>
            <Precificar sessao={sessao} />
          </div>
        )}

        {aba === ABA_REPOSICAO && (
          <Janela titulo="Ponto de reposição — itens abaixo do mínimo">
            <div style={{ marginBottom: 8 }}><Botao onClick={carregarReposicao}>Atualizar</Botao></div>
            <div style={{ overflow: 'auto', maxHeight: 480, border: '1px solid var(--linha)', borderRadius: 6 }}>
              <Tabela
                colunas={[
                  { chave: 'cod', rotulo: 'Código' }, { chave: 'nome', rotulo: 'Descrição' },
                  { chave: 'filial', rotulo: 'Filial' }, { chave: 'saldo', rotulo: 'Saldo', num: true },
                  { chave: 'min', rotulo: 'Mínimo', num: true }, { chave: 'repor', rotulo: 'Repor', num: true },
                ]}
                dados={reposicao}
                renderLinha={(r, i) => (
                  <tr key={i} style={{ background: '#fff5f5' }}>
                    <td className="num">{r.cod}</td>
                    <td>{r.nome}</td>
                    <td>{FILIAIS[r.filial] || r.filial}</td>
                    <td className="num neg">{r.saldo}</td>
                    <td className="num">{r.min}</td>
                    <td className="num" style={{ fontWeight: 700, color: 'var(--vermelho)' }}>{r.repor}</td>
                  </tr>
                )}
              />
            </div>
          </Janela>
        )}
      </main>
    </>
  );
}
