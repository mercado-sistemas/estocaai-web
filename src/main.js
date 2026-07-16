// ─── Config ───────────────────────────────────────────────────────────────────
const BFF = import.meta.env.VITE_BFF_URL;

// ─── Auth ─────────────────────────────────────────────────────────────────────
let _token = localStorage.getItem('ea_token') || null;
const auth = {
  set(t) { _token = t; localStorage.setItem('ea_token', t); },
  clear() { _token = null; localStorage.removeItem('ea_token'); },
};

async function apiFetch(path, { method = 'GET', body } = {}) {
  const r = await fetch(`${BFF}/api${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(_token ? { authorization: `Bearer ${_token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.erro || `Erro ${r.status}`);
  return data;
}

// ─── Estado ───────────────────────────────────────────────────────────────────
let FILIAIS = [
  { id: 'par', nome: 'Parnamirim' },
  { id: 'mac', nome: 'Macaíba' },
  { id: 'nat', nome: 'Natal' },
];
let PRODUTOS = [];
let filialAtual = 'todas';
let prodSel = null;
let consCampo = 'nome';
let exibirSemEstoque = true;
let sessao = null;
let _searchTimer = null;

// ─── Helpers ──────────────────────────────────────────────────────────────────
const $ = s => document.querySelector(s);
const brl = v => Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const nomeFil = id => id === 'todas' ? 'Todas' : (FILIAIS.find(f => f.id === id)?.nome || id);
const saldoTotal = p => FILIAIS.reduce((s, f) => s + ((p.saldo ?? {})[f.id] || 0), 0);
const saldoVisto = p => filialAtual === 'todas' ? saldoTotal(p) : ((p.saldo ?? {})[filialAtual] || 0);

function toast(m) {
  const t = $('#toast');
  t.innerHTML = m;
  t.classList.add('mostra');
  clearTimeout(t._x);
  t._x = setTimeout(() => t.classList.remove('mostra'), 2800);
}

function stub(nome) {
  abrirJanela(nome, `
    <div style="padding:26px 10px; text-align:center; color:var(--cinza)">
      <div style="font-size:34px; margin-bottom:10px">🚧</div>
      <b style="color:var(--azul); font-size:15px">${nome}</b><br>
      Este módulo existe no menu para manter o mapa completo,<br>mas ainda não faz parte do escopo atual.
    </div>
    <div class="rodape-form"><button class="btn-acao" onclick="fecharJanela()">(ESC) Fechar</button></div>`);
}

// ─── Janelas ──────────────────────────────────────────────────────────────────
function abrirJanela(titulo, html, larg) {
  fecharJanela();
  const j = document.createElement('div');
  j.className = 'janela'; j.id = 'janela-ativa';
  if (larg) j.style.maxWidth = larg + 'px';
  j.innerHTML = `<div class="janela-cab"><div class="dobra"></div><div class="tit">${titulo}</div>
    <button class="fechar" onclick="fecharJanela()" aria-label="Fechar">✕</button></div>
    <div class="janela-corpo">${html}</div>`;
  $('#mesa').appendChild(j);
}
function fecharJanela() { $('#janela-ativa')?.remove(); }

// ─── Login ────────────────────────────────────────────────────────────────────
async function entrar() {
  const loginVal = $('#lg-usr').value.trim();
  const senhaVal = $('#lg-sen').value.trim();
  if (!loginVal) return toast('Informe o usuário ou e-mail.');
  if (!senhaVal) return toast('Informe a senha.');

  const btn = $('#btn-entrar');
  btn.disabled = true; btn.textContent = 'Verificando…';

  try {
    const r = await fetch(`${BFF}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ login: loginVal, senha: senhaVal }),
    });
    const dados = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(dados.erro || dados.message || `Erro ${r.status}`);

    auth.set(dados.token);
    sessao = dados;

    if (dados.lojas && dados.lojas.length > 0) {
      FILIAIS = dados.lojas;
      atualizarSelectFiliais();
    }

    filialAtual = $('#lg-emp').value || 'todas';
    $('#veu-login').classList.add('hide');
    $('#st-usuario').textContent = dados.nome || loginVal.toUpperCase();
    $('#st-filial').textContent = nomeFil(filialAtual);
    toast(`Bem-vindo(a), <b>${dados.nome || loginVal}</b>! Tecle <b>F7</b> para abrir Produtos.`);
  } catch (e) {
    toast(e.message);
  } finally {
    btn.disabled = false; btn.textContent = 'Ok';
  }
}

function atualizarSelectFiliais() {
  const sel = $('#lg-emp');
  if (!sel) return;
  sel.innerHTML = '<option value="todas">Todas as filiais</option>' +
    FILIAIS.map((f, i) => `<option value="${f.id}">${i + 1} — ${f.nome}</option>`).join('');
}

// ─── Opções auxiliares ────────────────────────────────────────────────────────
const optsProd = sel => PRODUTOS.map(p =>
  `<option value="${p.id}" ${p.id === sel ? 'selected' : ''}>${p.cod} — ${p.nome}</option>`
).join('');

const optsFil = sel => FILIAIS.map(f =>
  `<option value="${f.id}" ${f.id === (sel || filialAtual === 'todas' ? FILIAIS[0]?.id : filialAtual) ? 'selected' : ''}>${f.nome}</option>`
).join('');

// ─── F7 Produtos ──────────────────────────────────────────────────────────────
function janelaProdutos() {
  abrirJanela('Produtos', `
    <div class="moldura-grid"><table class="tabela" id="grid-prod">
      <thead><tr>
        <th>Código</th><th>Cód. Fábrica</th><th>Descrição do Produto</th>
        <th class="num">Quantia</th><th class="num">Preço Venda</th>
      </tr></thead>
      <tbody><tr><td colspan="5" style="text-align:center;color:var(--cinza);padding:18px">Carregando…</td></tr></tbody>
    </table></div>

    <div class="painel-det" id="det-prod"></div>

    <div class="grade-botoes">
      <button class="btn-acao" onclick="abrirNovoProduto()">Incluir</button>
      <button class="btn-acao" onclick="abrirEditarProduto()">Alterar</button>
      <button class="btn-acao" onclick="stub('Ativar/Desativar')">Ativar/Desativar</button>
      <button class="btn-acao" onclick="detalhesEstoque()"><kbd>7</kbd>-Detalhes de Estoque</button>
      <button class="btn-acao" onclick="produtoSimilar()"><kbd>9</kbd>-Produto Similar</button>
      <button class="btn-acao" onclick="totaliza()">Totaliza</button>
      <button class="btn-acao" onclick="analisaProduto()">Analisa Produto</button>
      <button class="btn-acao" onclick="toast('Integração com PrecificaAí — em breve')"><kbd>L</kbd>-Formação do Preço de Venda</button>
      <button class="btn-acao" onclick="stub('Duplicar Produto')"><kbd>M</kbd>-Duplicar Produto</button>
      <button class="btn-acao" onclick="stub('Imagens do Produto')"><kbd>6</kbd>-Imagens</button>
      <button class="btn-acao" onclick="stub('Detalhes do Custo')"><kbd>0</kbd>-Detalhes do Custo</button>
      <button class="btn-acao primario" onclick="detalhesEstoque()">Estoque das Filiais</button>
    </div>

    <div class="consulta">
      <div class="radios"><b>Cons:</b>
        <label><input type="radio" name="cons" onchange="consCampo='cod'; buscarProdutos()"> Código</label>
        <label><input type="radio" name="cons" onchange="consCampo='nome'; buscarProdutos()" checked> Descrição</label>
        <label><input type="radio" name="cons" onchange="consCampo='barras'; buscarProdutos()"> Cód de Barras</label>
        <label style="margin-left:auto">
          <input type="checkbox" checked onchange="exibirSemEstoque=this.checked; renderGridProd()">
          Exibir sem estoque
        </label>
      </div>
      <div class="linha-consulta">
        <input type="text" id="in-cons" placeholder="Digite e tecle Enter para consultar… (use % como curinga)" autocomplete="off">
        <button class="btn-acao" onclick="fecharJanela()">(ESC) Fechar</button>
      </div>
    </div>`, 980);

  $('#in-cons').addEventListener('input', () => {
    clearTimeout(_searchTimer);
    _searchTimer = setTimeout(buscarProdutos, 400);
  });
  $('#in-cons').addEventListener('keydown', e => {
    if (e.key === 'Enter') { clearTimeout(_searchTimer); buscarProdutos(); }
  });

  buscarProdutos();
  setTimeout(() => $('#in-cons')?.focus(), 60);
}

async function buscarProdutos() {
  const q = ($('#in-cons')?.value || '').trim();
  const tb = document.querySelector('#grid-prod tbody');
  if (!tb) return;

  tb.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--cinza);padding:18px">Carregando…</td></tr>';
  try {
    PRODUTOS = await apiFetch(`/produtos${q ? '?busca=' + encodeURIComponent(q) : ''}`);
    if (!prodSel && PRODUTOS.length > 0) prodSel = PRODUTOS[0].id;
    renderGridProd();
  } catch (e) {
    tb.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--vermelho);padding:18px">${e.message}</td></tr>`;
  }
}

function renderGridProd() {
  const q = ($('#in-cons')?.value || '').trim().toLowerCase();
  const tb = document.querySelector('#grid-prod tbody');
  if (!tb) return;

  const lista = PRODUTOS.filter(p => {
    if (!exibirSemEstoque && saldoVisto(p) === 0) return false;
    if (!q) return true;
    const campo = consCampo === 'cod' ? p.cod : (consCampo === 'barras' ? (p.barras || '') : p.nome);
    return String(campo || '').toLowerCase().includes(q);
  });

  tb.innerHTML = lista.map(p => `
    <tr class="${p.id === prodSel ? 'sel' : ''}" onclick="prodSel='${p.id}'; renderGridProd()">
      <td class="num">${p.cod}</td>
      <td>${p.fab || ''}</td>
      <td>${p.nome}</td>
      <td class="num ${saldoVisto(p) === 0 ? 'neg' : ''}">${saldoVisto(p).toFixed(2).replace('.', ',')}</td>
      <td class="num">${brl(p.preco)}</td>
    </tr>`).join('') ||
    `<tr><td colspan="5" style="text-align:center;color:var(--cinza);padding:18px">Nenhum produto encontrado.</td></tr>`;

  renderDetProd();
}

function renderDetProd() {
  const p = PRODUTOS.find(x => x.id === prodSel);
  const c = $('#det-prod');
  if (!c || !p) return;
  c.innerHTML = `
    <div class="bloco-det" style="grid-column:1/-1">
      <div class="lin"><span>Descrição…:</span><b style="color:var(--azul)">${p.nome}</b></div>
    </div>
    <div class="bloco-det"><div class="bloco-tit">Custo e Preços de Venda</div>
      <div class="lin"><span>C. Aquisição..:</span><b>${brl(p.custo)}</b></div>
      <div class="lin"><span>Markup……..:</span><b>${p.markup ? p.markup.toFixed(4).replace('.', ',') : '—'}</b></div>
      <div class="lin"><span>Preço de Venda:</span><b>${brl(p.preco)}</b></div>
      <div class="lin"><span>Preço Mínimo..:</span><b>${brl(p.precoMin)}</b></div>
      <div class="lin"><span>% IPI / Sit.Trib:</span><b>${p.ipi != null ? p.ipi.toFixed(2) : '—'} / ${p.sit != null ? p.sit.toFixed(2) : '—'}</b></div>
    </div>
    <div class="bloco-det"><div class="bloco-tit">Datas e Localização</div>
      <div class="lin"><span>Dt.Últ.Alt…:</span><b>${p.dtAlt || '—'}</b></div>
      <div class="lin"><span>Data Cadastro:</span><b>${p.dtCad || '—'}</b></div>
      <div class="lin"><span>Local:</span><b>—</b></div>
    </div>
    <div class="bloco-det"><div class="bloco-tit">Qtdes e Departamento</div>
      <div class="lin"><span>Estoque Mínimo:</span><b>${(p.min || 0).toFixed(3).replace('.', ',')}</b></div>
      <div class="lin"><span>Estoque Máximo:</span><b>${(p.max || 0).toFixed(3).replace('.', ',')}</b></div>
      <div class="lin"><span>Grupo / Dpto:</span><b>${p.grupo || '—'}</b></div>
    </div>
    <div class="bloco-det"><div class="bloco-tit">Outras</div>
      <div class="lin"><span>Unidade..:</span><b>${p.un || '—'}</b></div>
      <div class="lin"><span>NCM……….:</span><b>${p.ncm || '—'}</b></div>
      <div class="lin"><span>Cod.Barra:</span><b>${p.barras || '—'}</b></div>
      <div class="lin"><span>CST/CSOSN:</span><b>${p.cst || '—'}</b></div>
      <div class="lin"><span>CEST……:</span><b>${p.cest || '—'}</b></div>
    </div>`;
}

// ─── Incluir / Alterar Produto ────────────────────────────────────────────────
function abrirNovoProduto() {
  _formProduto(null);
}
function abrirEditarProduto() {
  const p = PRODUTOS.find(x => x.id === prodSel);
  if (!p) return toast('Selecione um produto para alterar.');
  _formProduto(p);
}
function _formProduto(p) {
  const titulo = p ? `Alterar Produto — ${p.cod}` : 'Incluir Produto';
  abrirJanela(titulo, `
    <form onsubmit="salvarProduto(event,'${p?.id || ''}')">
      <div class="form-linha"><label>Código *</label><input id="fp-cod" value="${p?.cod || ''}" required></div>
      <div class="form-linha"><label>Descrição *</label><input id="fp-nome" value="${p?.nome || ''}" required></div>
      <div class="form-linha"><label>UN</label><input id="fp-un" value="${p?.un || 'UN'}"></div>
      <div class="form-linha"><label>Grupo</label><input id="fp-grupo" value="${p?.grupo || ''}"></div>
      <div class="form-linha"><label>Est. Mínimo</label><input id="fp-min" type="number" min="0" value="${p?.min || 0}"></div>
      <div class="form-linha"><label>Custo (R$)</label><input id="fp-custo" type="number" step="any" min="0" value="${p?.custo || ''}"></div>
      <div class="form-linha"><label>Preço Venda *</label><input id="fp-preco" type="number" step="any" min="0.01" value="${p?.preco || ''}" required></div>
      <div class="form-linha"><label>Preço Mínimo</label><input id="fp-precoMin" type="number" step="any" min="0" value="${p?.precoMin || ''}"></div>
      <div class="rodape-form">
        <button class="btn-acao" type="button" onclick="janelaProdutos()">(ESC) Voltar</button>
        <button class="btn-acao primario" type="submit" id="btn-salvar-prod">Gravar</button>
      </div>
    </form>`, 620);
  setTimeout(() => $('#fp-cod')?.focus(), 60);
}

async function salvarProduto(e, id) {
  e.preventDefault();
  const cod = $('#fp-cod').value.trim();
  const nome = $('#fp-nome').value.trim();
  const preco = Number($('#fp-preco').value);
  if (!cod) return toast('Código é obrigatório.');
  if (!nome || nome.length < 2) return toast('Descrição deve ter ao menos 2 caracteres.');
  if (!preco || preco <= 0) return toast('Preço de venda deve ser maior que zero.');

  const body = {
    cod, nome,
    un: $('#fp-un').value.trim() || 'UN',
    grupo: $('#fp-grupo').value.trim(),
    min: Number($('#fp-min').value || 0),
    custo: Number($('#fp-custo').value || 0),
    preco,
    precoMin: Number($('#fp-precoMin').value || preco),
  };

  const btn = $('#btn-salvar-prod');
  btn.disabled = true; btn.textContent = 'Gravando…';
  try {
    if (id) {
      await apiFetch(`/produtos/${id}`, { method: 'PUT', body });
      toast('Produto atualizado com sucesso.');
    } else {
      await apiFetch('/produtos', { method: 'POST', body });
      toast('Produto criado com sucesso.');
    }
    janelaProdutos();
  } catch (err) {
    toast(err.message);
    btn.disabled = false; btn.textContent = 'Gravar';
  }
}

// ─── Detalhes de Estoque ──────────────────────────────────────────────────────
function detalhesEstoque() {
  const p = PRODUTOS.find(x => x.id === prodSel);
  if (!p) return toast('Selecione um produto primeiro (F7).');
  abrirJanela('Estoque das Filiais — ' + p.nome, `
    <div class="moldura-grid" style="max-height:none"><table class="tabela">
      <thead><tr><th>Filial</th><th class="num">Saldo</th><th class="num">Mínimo</th><th>Situação</th></tr></thead>
      <tbody>${FILIAIS.map(f => {
        const s = (p.saldo ?? {})[f.id] || 0;
        const ok = s >= (p.min || 0);
        return `<tr>
          <td>${f.nome}</td>
          <td class="num" style="font-weight:900">${s}</td>
          <td class="num">${p.min || 0}</td>
          <td><b style="color:${ok ? 'var(--verde)' : 'var(--vermelho)'}">${ok ? 'OK' : 'REPOR — faltam ' + ((p.min || 0) - s)}</b></td>
        </tr>`;
      }).join('')}
      <tr><td style="font-weight:800">TOTAL</td><td class="num" style="font-weight:900">${saldoTotal(p)}</td><td></td><td></td></tr>
      </tbody></table></div>
    <div class="rodape-form">
      <button class="btn-acao" onclick="janelaTransferencia('${p.id}')">Transferir entre Filiais</button>
      <button class="btn-acao" onclick="janelaEntradaSaida('${p.id}')">Entrada/Saída Manual</button>
      <button class="btn-acao primario" onclick="janelaProdutos()">Voltar aos Produtos</button>
    </div>`, 720);
}

function produtoSimilar() {
  const p = PRODUTOS.find(x => x.id === prodSel);
  if (!p) return toast('Selecione um produto primeiro.');
  const similares = PRODUTOS.filter(x => x.grupo === p.grupo && x.id !== p.id);
  abrirJanela('Produto Similar — ' + p.grupo, `
    <div class="moldura-grid" style="max-height:none"><table class="tabela">
      <thead><tr><th>Código</th><th>Descrição</th><th class="num">Saldo</th><th class="num">Preço</th></tr></thead>
      <tbody>${similares.map(s => `
        <tr onclick="prodSel='${s.id}'; janelaProdutos()">
          <td class="num">${s.cod}</td><td>${s.nome}</td>
          <td class="num ${saldoVisto(s) === 0 ? 'neg' : ''}">${saldoVisto(s)}</td>
          <td class="num">${brl(s.preco)}</td>
        </tr>`).join('') || '<tr><td colspan="4" style="text-align:center;color:var(--cinza);padding:14px">Sem similares no grupo.</td></tr>'}
      </tbody></table></div>
    <div class="rodape-form"><button class="btn-acao primario" onclick="janelaProdutos()">Voltar</button></div>`, 720);
}

async function totaliza() {
  try {
    const prods = PRODUTOS.length > 0 ? PRODUTOS : await apiFetch('/produtos');
    const valorCusto = prods.reduce((s, p) => s + saldoVisto(p) * (p.custo || 0), 0);
    const valorVenda = prods.reduce((s, p) => s + saldoVisto(p) * (p.preco || 0), 0);
    toast(`Filial <b>${nomeFil(filialAtual)}</b>: ${prods.length} itens · custo <b>R$ ${brl(valorCusto)}</b> · venda <b>R$ ${brl(valorVenda)}</b>`);
  } catch (e) { toast(e.message); }
}

async function analisaProduto() {
  const p = PRODUTOS.find(x => x.id === prodSel);
  if (!p) return toast('Selecione um produto primeiro.');
  abrirJanela('Analisa Produto — ' + p.nome, `
    <div class="moldura-grid" style="max-height:none"><table class="tabela">
      <thead><tr><th>Tipo</th><th>Filial</th><th class="num">Qtd</th><th>Obs</th><th>Quando</th></tr></thead>
      <tbody><tr><td colspan="5" style="text-align:center;color:var(--cinza);padding:18px">Carregando…</td></tr></tbody>
    </table></div>
    <div class="rodape-form"><button class="btn-acao primario" onclick="janelaProdutos()">Voltar</button></div>`, 760);
  try {
    const movs = await apiFetch('/movimentacoes');
    const meusMov = movs.filter(m => m.produtoId === p.id);
    const tb = document.querySelector('#janela-ativa .tabela tbody');
    if (!tb) return;
    tb.innerHTML = meusMov.map(m => `<tr>
      <td><b>${(m.tipo || '').toUpperCase()}</b></td>
      <td>${nomeFil(m.filial)}${m.destino ? ' → ' + nomeFil(m.destino) : ''}</td>
      <td class="num">${m.qtd}</td>
      <td>${m.obs || ''}</td>
      <td style="font-size:11px">${m.em ? new Date(m.em).toLocaleString('pt-BR') : '—'}</td>
    </tr>`).join('') || '<tr><td colspan="5" style="text-align:center;color:var(--cinza);padding:14px">Sem movimentações.</td></tr>';
  } catch (e) { toast(e.message); }
}

// ─── Entrada e Saída Manual ───────────────────────────────────────────────────
function janelaEntradaSaida(pid) {
  if (PRODUTOS.length === 0) return toast('Abra os Produtos (F7) antes de movimentar.');
  const defPid = pid || prodSel || PRODUTOS[0]?.id;
  const defFil = filialAtual !== 'todas' ? filialAtual : (FILIAIS[0]?.id || 'par');
  abrirJanela('Entrada e Saída Manual de Estoque', `
    <div class="form-linha"><label>Tipo</label>
      <select id="es-tipo">
        <option value="entrada">1 — Entrada</option>
        <option value="saida">2 — Saída</option>
      </select>
    </div>
    <div class="form-linha"><label>Produto</label><select id="es-prod">${optsProd(defPid)}</select></div>
    <div class="form-linha"><label>Filial</label><select id="es-fil">${optsFil(defFil)}</select></div>
    <div class="form-linha"><label>Quantidade</label><input id="es-qtd" type="number" min="1" inputmode="numeric" placeholder="0"></div>
    <div class="form-linha"><label>Documento/Obs</label><input id="es-obs" placeholder="NF 4521, quebra, uso interno…"></div>
    <div class="rodape-form">
      <button class="btn-acao" onclick="fecharJanela()">(ESC) Fechar</button>
      <button class="btn-acao primario" id="btn-es" onclick="gravarES()"><u>G</u>ravar</button>
    </div>`, 620);
}

async function gravarES() {
  const tipo = $('#es-tipo').value;
  const pid = $('#es-prod').value;
  const p = PRODUTOS.find(x => x.id === pid);
  const f = $('#es-fil').value;
  const q = parseFloat($('#es-qtd').value);
  const obs = $('#es-obs').value.trim();

  if (!q || q <= 0) return toast('Informe uma quantidade válida.');
  if (tipo === 'saida' && p && ((p.saldo ?? {})[f] || 0) < q)
    return toast(`Saldo insuficiente em <b>${nomeFil(f)}</b>: só ${(p.saldo ?? {})[f] || 0}.`);

  const btn = $('#btn-es');
  btn.disabled = true; btn.textContent = 'Gravando…';
  try {
    await apiFetch('/movimentacoes', { method: 'POST', body: { tipo, produtoId: pid, filial: f, qtd: q, obs } });
    toast(`<b>${tipo === 'entrada' ? 'Entrada' : 'Saída'}</b> de ${q} × ${p?.cod || pid} gravada em ${nomeFil(f)}.`);
    fecharJanela();
  } catch (e) {
    toast(e.message);
    btn.disabled = false; btn.textContent = 'Gravar';
  }
}

// ─── Transferência entre Filiais ──────────────────────────────────────────────
function janelaTransferencia(pid) {
  if (PRODUTOS.length === 0) return toast('Abra os Produtos (F7) antes de transferir.');
  const defPid = pid || prodSel || PRODUTOS[0]?.id;
  abrirJanela('Operações com Filiais — Transferência', `
    <div class="form-linha"><label>Produto</label><select id="tr-prod">${optsProd(defPid)}</select></div>
    <div class="form-linha"><label>Filial de Origem</label>
      <select id="tr-ori">${FILIAIS.map(f => `<option value="${f.id}">${f.nome}</option>`).join('')}</select>
    </div>
    <div class="form-linha"><label>Filial de Destino</label>
      <select id="tr-des">${FILIAIS.map((f, i) => `<option value="${f.id}" ${i === 1 ? 'selected' : ''}>${f.nome}</option>`).join('')}</select>
    </div>
    <div class="form-linha"><label>Quantidade</label><input id="tr-qtd" type="number" min="1" inputmode="numeric" placeholder="0"></div>
    <div class="form-linha"><label>Obs</label><input id="tr-obs" placeholder="Pedido da filial, remanejamento…"></div>
    <div class="rodape-form">
      <button class="btn-acao" onclick="fecharJanela()">(ESC) Fechar</button>
      <button class="btn-acao primario" id="btn-tr" onclick="gravarTransf()"><u>G</u>ravar Transferência</button>
    </div>`, 620);
}

async function gravarTransf() {
  const pid = $('#tr-prod').value;
  const p = PRODUTOS.find(x => x.id === pid);
  const o = $('#tr-ori').value;
  const d = $('#tr-des').value;
  const q = parseFloat($('#tr-qtd').value);
  const obs = $('#tr-obs').value.trim();

  if (o === d) return toast('Origem e destino precisam ser filiais diferentes.');
  if (!q || q <= 0) return toast('Informe uma quantidade válida.');
  if (p && ((p.saldo ?? {})[o] || 0) < q)
    return toast(`Saldo insuficiente em <b>${nomeFil(o)}</b>: só ${(p.saldo ?? {})[o] || 0}.`);

  const btn = $('#btn-tr');
  btn.disabled = true; btn.textContent = 'Gravando…';
  try {
    await apiFetch('/movimentacoes', { method: 'POST', body: { tipo: 'transferencia', produtoId: pid, filial: o, destino: d, qtd: q, obs } });
    toast(`Transferidos <b>${q} × ${p?.cod || pid}</b>: ${nomeFil(o)} → ${nomeFil(d)}.`);
    fecharJanela();
  } catch (e) {
    toast(e.message);
    btn.disabled = false; btn.textContent = 'Gravar Transferência';
  }
}

// ─── Conferências e Ajustes ───────────────────────────────────────────────────
function janelaAjuste() {
  if (PRODUTOS.length === 0) return toast('Abra os Produtos (F7) antes de ajustar.');
  const defPid = prodSel || PRODUTOS[0]?.id;
  const defFil = filialAtual !== 'todas' ? filialAtual : (FILIAIS[0]?.id || 'par');
  abrirJanela('Conferências e Ajustes de Estoque', `
    <div class="form-linha"><label>Produto</label>
      <select id="aj-prod" onchange="mostraSaldoAj()">${optsProd(defPid)}</select>
    </div>
    <div class="form-linha"><label>Filial</label>
      <select id="aj-fil" onchange="mostraSaldoAj()">${optsFil(defFil)}</select>
    </div>
    <div class="form-linha"><label>Saldo no Sistema</label><input id="aj-sis" disabled></div>
    <div class="form-linha"><label>Saldo Contado</label><input id="aj-cont" type="number" min="0" inputmode="numeric" placeholder="0"></div>
    <div class="form-linha"><label>Obs</label><input id="aj-obs" placeholder="Balanço mensal, item avariado…"></div>
    <div class="rodape-form">
      <button class="btn-acao" onclick="fecharJanela()">(ESC) Fechar</button>
      <button class="btn-acao primario" id="btn-aj" onclick="gravarAjuste()"><u>G</u>ravar Ajuste</button>
    </div>`, 620);
  mostraSaldoAj();
}

function mostraSaldoAj() {
  const pid = $('#aj-prod')?.value;
  const f = $('#aj-fil')?.value;
  const p = PRODUTOS.find(x => x.id === pid);
  if ($('#aj-sis')) $('#aj-sis').value = p ? ((p.saldo ?? {})[f] || 0) : '';
}

async function gravarAjuste() {
  const pid = $('#aj-prod').value;
  const p = PRODUTOS.find(x => x.id === pid);
  const f = $('#aj-fil').value;
  const q = parseInt($('#aj-cont').value);
  const obs = $('#aj-obs').value.trim();

  if (isNaN(q) || q < 0) return toast('Informe o saldo contado.');

  const btn = $('#btn-aj');
  btn.disabled = true; btn.textContent = 'Gravando…';
  try {
    await apiFetch('/movimentacoes', { method: 'POST', body: { tipo: 'ajuste', produtoId: pid, filial: f, qtd: q, obs: obs || `ajuste para ${q}` } });
    toast(`Ajuste gravado: <b>${p?.cod || pid}</b> em ${nomeFil(f)} → <b>${q}</b>.`);
    fecharJanela();
  } catch (e) {
    toast(e.message);
    btn.disabled = false; btn.textContent = 'Gravar Ajuste';
  }
}

// ─── Ponto de Reposição ───────────────────────────────────────────────────────
async function janelaReposicao() {
  abrirJanela('Ponto de Reposição — Itens Abaixo do Mínimo', `
    <div class="moldura-grid" style="max-height:340px"><table class="tabela">
      <thead><tr>
        <th>Código</th><th>Descrição</th><th>Filial</th>
        <th class="num">Saldo</th><th class="num">Mínimo</th><th class="num">Repor</th>
      </tr></thead>
      <tbody><tr><td colspan="6" style="text-align:center;color:var(--cinza);padding:18px">Carregando…</td></tr></tbody>
    </table></div>
    <div class="rodape-form">
      <button class="btn-acao" onclick="toast('No sistema final: gera Pedido de Compra agrupado por fornecedor')">Gerar Pedido de Compra</button>
      <button class="btn-acao primario" onclick="fecharJanela()">(ESC) Fechar</button>
    </div>`, 860);
  try {
    const rep = await apiFetch('/movimentacoes/reposicao');
    const tb = document.querySelector('#janela-ativa .tabela tbody');
    if (!tb) return;
    tb.innerHTML = rep.map(r => `
      <tr onclick="prodSel='${r.produtoId || ''}'; janelaProdutos()">
        <td class="num">${r.cod}</td><td>${r.nome}</td>
        <td>${nomeFil(r.filial) || r.filial}</td>
        <td class="num neg">${r.saldo}</td>
        <td class="num">${r.min}</td>
        <td class="num" style="font-weight:900; color:var(--vermelho)">+${r.repor ?? (r.min - r.saldo)}</td>
      </tr>`).join('') ||
      '<tr><td colspan="6" style="text-align:center;color:var(--verde);padding:18px;font-weight:700">Nenhum item abaixo do mínimo ✓</td></tr>';
  } catch (e) { toast(e.message); }
}

// ─── Entrada por NF-e ─────────────────────────────────────────────────────────
function janelaEntradaNF() {
  const defFil = filialAtual !== 'todas' ? filialAtual : (FILIAIS[0]?.id || 'par');
  abrirJanela('Lançar Notas de Compras — Importar NF-e', `
    <div class="form-linha"><label>Filial de Entrada</label>
      <select id="nf-fil">${optsFil(defFil)}</select>
    </div>
    <div class="form-linha"><label style="align-self:flex-start;margin-top:6px">XML da NF-e</label>
      <textarea id="nf-xml" rows="8" placeholder="<nfeProc>…</nfeProc>" style="width:100%;font-family:monospace;font-size:11px;padding:8px;border:1.5px solid var(--linha);border-radius:7px;background:#FAFBFC;resize:vertical"></textarea>
    </div>
    <div style="background:var(--amarelo-bg); border:1px solid var(--amarelo-2); border-radius:7px; padding:11px 13px; font-size:12.5px; margin:4px 0 2px">
      Cole o XML da NF-e aqui — o sistema lerá os itens, localizará no cadastro e dará entrada automática no estoque.
    </div>
    <div class="rodape-form">
      <button class="btn-acao" onclick="fecharJanela()">(ESC) Fechar</button>
      <button class="btn-acao primario" id="btn-nfe" onclick="importarNfe()"><u>I</u>mportar XML</button>
    </div>`, 660);
}

async function importarNfe() {
  const xmlNfe = $('#nf-xml').value.trim();
  const filial = $('#nf-fil').value;
  if (!xmlNfe) return toast('Cole o XML da NF-e primeiro.');
  const btn = $('#btn-nfe');
  btn.disabled = true; btn.textContent = 'Importando…';
  try {
    const r = await apiFetch('/nfe/entrada', { method: 'POST', body: { xmlNfe, filial } });
    toast(`NF-e importada: <b>${r.itens?.length || 0}</b> item(ns) | não encontrados: ${r.naoEncontrados?.length || 0}`);
    fecharJanela();
  } catch (e) {
    toast(e.message);
    btn.disabled = false; btn.textContent = 'Importar XML';
  }
}

// ─── Busca Preço ──────────────────────────────────────────────────────────────
function janelaBuscaPreco() {
  abrirJanela('Busca Preço', `
    <div class="linha-consulta" style="margin-bottom:12px">
      <input type="text" id="bp-in" placeholder="Descrição, código ou código de barras…" autocomplete="off">
    </div>
    <div id="bp-res" style="text-align:center; color:var(--cinza); padding:16px">Digite para consultar o preço.</div>
    <div class="rodape-form"><button class="btn-acao" onclick="fecharJanela()">(ESC) Fechar</button></div>`, 560);

  let _bpTimer = null;
  $('#bp-in').addEventListener('input', () => {
    clearTimeout(_bpTimer);
    _bpTimer = setTimeout(async () => {
      const q = $('#bp-in')?.value.trim();
      if (!q) { $('#bp-res').innerHTML = '<span style="color:var(--cinza)">Digite para consultar o preço.</span>'; return; }
      try {
        const prods = await apiFetch(`/produtos?busca=${encodeURIComponent(q)}`);
        const p = prods[0];
        if (!p) {
          $('#bp-res').innerHTML = '<span style="color:var(--vermelho); font-weight:700">Produto não encontrado.</span>';
        } else {
          $('#bp-res').innerHTML = `
            <div style="font-weight:800; color:var(--azul); margin-bottom:4px">${p.nome}</div>
            <div style="font-size:40px; font-weight:900; color:var(--azul)">R$ ${brl(p.preco)}</div>
            <div style="font-size:12.5px; color:var(--cinza); margin-top:4px">
              mínimo R$ ${brl(p.precoMin)} · saldo ${nomeFil(filialAtual)}: <b>${saldoVisto(p)}</b>
            </div>`;
        }
      } catch (e) {
        if ($('#bp-res')) $('#bp-res').innerHTML = `<span style="color:var(--vermelho)">${e.message}</span>`;
      }
    }, 350);
  });
  setTimeout(() => $('#bp-in')?.focus(), 60);
}

// ─── Relatórios ───────────────────────────────────────────────────────────────
async function janelaRelEstoque() {
  abrirJanela('Estoque Atual por Filial', `
    <div class="moldura-grid" style="max-height:380px"><table class="tabela">
      <thead><tr>
        <th>Código</th><th>Descrição</th>
        ${FILIAIS.map(f => `<th class="num">${f.nome}</th>`).join('')}
        <th class="num">Total</th>
      </tr></thead>
      <tbody><tr><td colspan="${3 + FILIAIS.length}" style="text-align:center;color:var(--cinza);padding:18px">Carregando…</td></tr></tbody>
    </table></div>
    <div class="rodape-form"><button class="btn-acao primario" onclick="fecharJanela()">(ESC) Fechar</button></div>`, 900);
  try {
    const prods = await apiFetch('/produtos');
    const tb = document.querySelector('#janela-ativa .tabela tbody');
    if (!tb) return;
    tb.innerHTML = prods.map(p => `
      <tr onclick="prodSel='${p.id}'; fecharJanela(); janelaProdutos()">
        <td class="num">${p.cod}</td><td>${p.nome}</td>
        ${FILIAIS.map(f => `<td class="num ${((p.saldo ?? {})[f.id] || 0) < (p.min || 0) ? 'neg' : ''}">${(p.saldo ?? {})[f.id] || 0}</td>`).join('')}
        <td class="num" style="font-weight:900">${saldoTotal(p)}</td>
      </tr>`).join('') || '<tr><td colspan="5" style="text-align:center;color:var(--cinza);padding:18px">Nenhum produto.</td></tr>';
  } catch (e) { toast(e.message); }
}

async function janelaHistorico() {
  abrirJanela('Movimentações de Estoque', `
    <div class="moldura-grid" style="max-height:380px"><table class="tabela">
      <thead><tr><th>Tipo</th><th>Produto</th><th>Filial</th><th class="num">Qtd</th><th>Obs</th><th>Quando</th></tr></thead>
      <tbody><tr><td colspan="6" style="text-align:center;color:var(--cinza);padding:18px">Carregando…</td></tr></tbody>
    </table></div>
    <div class="rodape-form"><button class="btn-acao primario" onclick="fecharJanela()">(ESC) Fechar</button></div>`, 900);
  try {
    const params = filialAtual !== 'todas' ? `?filial=${filialAtual}` : '';
    const movs = await apiFetch(`/movimentacoes${params}`);
    const tb = document.querySelector('#janela-ativa .tabela tbody');
    if (!tb) return;
    tb.innerHTML = movs.map(m => {
      const p = PRODUTOS.find(x => x.id === m.produtoId);
      return `<tr>
        <td><b>${(m.tipo || '').toUpperCase()}</b></td>
        <td>${p ? `${p.cod} — ${p.nome}` : (m.produtoId || '—')}</td>
        <td>${nomeFil(m.filial)}${m.destino ? ' → ' + nomeFil(m.destino) : ''}</td>
        <td class="num">${m.qtd}</td>
        <td>${m.obs || ''}</td>
        <td style="font-size:11px">${m.em ? new Date(m.em).toLocaleString('pt-BR') : '—'}</td>
      </tr>`;
    }).join('') || '<tr><td colspan="6" style="text-align:center;color:var(--cinza);padding:18px">Sem movimentações.</td></tr>';
  } catch (e) { toast(e.message); }
}

async function janelaFiliais() {
  abrirJanela('Filiais', `
    <div class="moldura-grid" style="max-height:none"><table class="tabela">
      <thead><tr><th>Cód</th><th>Filial</th><th class="num">Itens abaixo do mínimo</th><th class="num">Valor de estoque (custo)</th></tr></thead>
      <tbody><tr><td colspan="4" style="text-align:center;color:var(--cinza);padding:18px">Carregando…</td></tr></tbody>
    </table></div>
    <div class="rodape-form"><button class="btn-acao primario" onclick="fecharJanela()">(ESC) Fechar</button></div>`, 720);
  try {
    const prods = await apiFetch('/produtos');
    const tb = document.querySelector('#janela-ativa .tabela tbody');
    if (!tb) return;
    tb.innerHTML = FILIAIS.map((f, i) => {
      const abaixo = prods.filter(p => ((p.saldo ?? {})[f.id] || 0) < (p.min || 0)).length;
      const valor = prods.reduce((s, p) => s + ((p.saldo ?? {})[f.id] || 0) * (p.custo || 0), 0);
      return `<tr>
        <td class="num">${i + 1}</td><td>${f.nome}</td>
        <td class="num ${abaixo ? 'neg' : ''}">${abaixo}</td>
        <td class="num">R$ ${brl(valor)}</td>
      </tr>`;
    }).join('');
  } catch (e) { toast(e.message); }
}

function trocarFilial() {
  abrirJanela('Trocar Filial', `
    <div class="form-linha"><label>Filial</label>
      <select id="tf-sel">
        <option value="todas">Todas as filiais</option>
        ${FILIAIS.map(f => `<option value="${f.id}" ${f.id === filialAtual ? 'selected' : ''}>${f.nome}</option>`).join('')}
      </select>
    </div>
    <div class="rodape-form">
      <button class="btn-acao" onclick="fecharJanela()">(ESC) Fechar</button>
      <button class="btn-acao primario" onclick="
        filialAtual=document.getElementById('tf-sel').value;
        document.getElementById('st-filial').textContent=nomeFil(filialAtual);
        fecharJanela();
        toast('Filial ativa: <b>'+nomeFil(filialAtual)+'</b>')">Ok</button>
    </div>`, 480);
}

// ─── Menus ────────────────────────────────────────────────────────────────────
const MENUS = [
  { rot: 'Cadastros', itens: [
    { rot: '3 - Produtos', sub: [
      { rot: '1 - Produtos…', tecla: 'F7', ac: janelaProdutos },
      { rot: 'B - Formação de Preço Padrão…', ac: () => toast('Integração com <b>PrecificaAí</b> — em breve') },
    ]},
    { rot: '5 - Fornecedores…', tecla: 'F3', ac: () => stub('Fornecedores') },
    { rot: 'A - Filiais…', ac: janelaFiliais },
  ]},
  { rot: 'Manutenção', itens: [
    { rot: '5 - Compras', sub: [
      { rot: '1 - Lançar Notas de Compras…', tecla: 'Ctrl+F6', ac: janelaEntradaNF },
      { rot: '4 - Pedido de Compra…', tecla: 'Ctrl+F9', ac: () => stub('Pedido de Compra') },
    ]},
    { rot: '7 - Manutenção de Estoque', sub: [
      { rot: '1 - Entrada e Saída Manual…', ac: () => janelaEntradaSaida() },
      { rot: '2 - Ponto de Reposição…', ac: janelaReposicao },
      { rot: '3 - Conferências e ajustes', ac: janelaAjuste },
    ]},
    { rot: '8 - Manutenção de Preços', ac: () => toast('Integração com <b>PrecificaAí</b> — em breve') },
    { rot: '9 - Operações com Filiais', sub: [
      { rot: '1 - Transferência entre Filiais…', ac: () => janelaTransferencia() },
    ]},
  ]},
  { rot: 'Relatórios', itens: [
    { rot: '1 - Estoque Atual por Filial…', ac: janelaRelEstoque },
    { rot: '2 - Itens Abaixo do Mínimo…', ac: janelaReposicao },
    { rot: '3 - Movimentações de Estoque…', ac: janelaHistorico },
  ]},
  { rot: 'Utilitários', itens: [
    { rot: '1 - Importar XML de NF-e…', ac: janelaEntradaNF },
    { rot: '2 - Trocar Filial…', ac: trocarFilial },
  ]},
  { rot: 'Ajuda', itens: [
    { rot: '1 - Sobre o Estocaaí…', ac: () => toast('<b>Estocaaí</b> — Sistema de Gestão de Estoque Multi-Lojas') },
  ]},
  { rot: 'Sair', itens: [
    { rot: '1 - Trocar Usuário…', ac: () => { auth.clear(); location.reload(); } },
  ]},
];

function montarMenus() {
  const bar = $('#menubar'); bar.innerHTML = '';
  MENUS.forEach(m => {
    const raiz = document.createElement('div'); raiz.className = 'menu-raiz';
    const b = document.createElement('button');
    b.innerHTML = `<u>${m.rot[0]}</u>${m.rot.slice(1)}`;
    b.onclick = e => { e.stopPropagation(); fecharMenus(raiz); raiz.classList.toggle('aberto'); render1oNivel(raiz, m); };
    raiz.appendChild(b); bar.appendChild(raiz);
  });
  document.addEventListener('click', () => fecharMenus());
}

function fecharMenus(exceto) {
  document.querySelectorAll('.menu-raiz').forEach(r => {
    if (r !== exceto) { r.classList.remove('aberto'); r.querySelectorAll('.submenu').forEach(s => s.remove()); }
  });
  if (exceto) exceto.querySelectorAll('.submenu').forEach(s => s.remove());
}

function render1oNivel(raiz, m) {
  if (!raiz.classList.contains('aberto')) return;
  raiz.appendChild(criarSubmenu(m.itens));
}

function criarSubmenu(itens) {
  const sm = document.createElement('div'); sm.className = 'submenu';
  itens.forEach(it => {
    const b = document.createElement('button'); b.className = 'item';
    b.innerHTML = `<span>${it.rot}</span>` + (it.sub ? `<span class="seta">▶</span>` : (it.tecla ? `<kbd class="tecla">${it.tecla}</kbd>` : ''));
    if (it.sub) {
      b.onclick = e => {
        e.stopPropagation();
        sm.querySelectorAll(':scope > .submenu').forEach(s => s.remove());
        const filho = criarSubmenu(it.sub);
        filho.style.top = (b.offsetTop - 4) + 'px';
        sm.appendChild(filho);
      };
    } else {
      b.onclick = e => { e.stopPropagation(); fecharMenus(); (it.ac || (() => stub(it.rot.replace(/^.{0,4}- /, '').replace('…', ''))))(); };
    }
    sm.appendChild(b);
  });
  return sm;
}

// ─── Toolbar ──────────────────────────────────────────────────────────────────
const FERRAMENTAS = [
  { ico: '📦', atalho: 'F7', rot: 'Produtos', ac: janelaProdutos },
  { ico: '🏷️', atalho: 'Ctrl+F7', rot: 'Busca Preço', ac: janelaBuscaPreco },
  { ico: '🧺', atalho: 'Ctrl+F6', rot: 'Compras', ac: janelaEntradaNF },
  { ico: '↔️', atalho: 'Ctrl+T', rot: 'Transferir', ac: () => janelaTransferencia() },
  { ico: '📊', atalho: 'F5', rot: 'Rel.Estoque', ac: janelaRelEstoque },
  { ico: '⚠️', atalho: 'F4', rot: 'Reposição', ac: janelaReposicao },
  { ico: '📋', atalho: 'F3', rot: 'Histórico', ac: janelaHistorico },
];

function montarToolbar() {
  $('#toolbar').innerHTML = '';
  FERRAMENTAS.forEach(f => {
    const b = document.createElement('button'); b.className = 'ferramenta';
    b.innerHTML = `<span class="ico">${f.ico}</span><span class="atalho">${f.atalho}</span><span class="rot">${f.rot}</span>`;
    b.onclick = f.ac;
    $('#toolbar').appendChild(b);
  });
}

// ─── Atalhos de Teclado ───────────────────────────────────────────────────────
document.addEventListener('keydown', e => {
  const combo = (e.ctrlKey ? 'Ctrl+' : '') + e.key.toUpperCase();
  const mapa = {
    'F7': janelaProdutos, 'CTRL+F7': janelaBuscaPreco,
    'CTRL+F6': janelaEntradaNF, 'CTRL+T': () => janelaTransferencia(),
    'F4': janelaReposicao, 'F5': janelaRelEstoque, 'F3': janelaHistorico,
  };
  const fn = mapa[combo];
  if (fn) { e.preventDefault(); fn(); }
  if (e.key === 'Escape') { fecharMenus(); fecharJanela(); }
});

// ─── Relógio e Init ───────────────────────────────────────────────────────────
function relogio() {
  const d = new Date();
  $('#st-relogio').textContent = d.toLocaleDateString('pt-BR') + ' - ' + d.toLocaleTimeString('pt-BR');
}
setInterval(relogio, 1000); relogio();
montarMenus(); montarToolbar();
$('#lg-sen').addEventListener('keydown', e => { if (e.key === 'Enter') entrar(); });

// ─── Expor funções ao escopo global (chamadas por onclick no HTML) ─────────────
Object.assign(window, {
  entrar, fecharJanela, fecharMenus, stub,
  janelaProdutos, janelaBuscaPreco, janelaEntradaNF,
  janelaEntradaSaida, janelaTransferencia, janelaAjuste,
  janelaReposicao, janelaRelEstoque, janelaHistorico, janelaFiliais,
  trocarFilial, detalhesEstoque, produtoSimilar, totaliza, analisaProduto,
  buscarProdutos, renderGridProd, mostraSaldoAj,
  gravarES, gravarTransf, gravarAjuste, importarNfe,
  abrirNovoProduto, abrirEditarProduto, salvarProduto,
  nomeFil,
});
