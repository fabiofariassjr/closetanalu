import { sb, brl, esc, slug, soDig, waNumero, waFormat, waLink, carregarSite, freteDe } from './lib.js';

const $ = id => document.getElementById(id);
const UFS = 'AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' ');
const BANDAS = [['Até R$ 100', 0, 100], ['R$ 100 a 200', 100, 200], ['R$ 200 a 300', 200, 300], ['Acima de R$ 300', 300, 1e9]];
const COLS = ['produtos'];
let site = {}, produtos = [], looks = [], numeroWa = '';
let fav = {}, sacola = [], filtro = 'Todas', colecao = '', busca = '', tam = '', cor = '', faixa = '', ord = '';
let pecaId = null, pecaFoto = 0, zoomList = [], zoomI = 0, lookId = null, cupom = null, dica = null;
const sel = {};
const CAMPOS_VITRINE = 'id,nome,categoria,tamanhos,cor,qtd,preco,preco_de,descricao,composicao,medidas,foto_principal,fotos,colecoes,novo,no_site';

// ---------- carregamento ----------
async function carregar() {
  try { fav = JSON.parse(localStorage.getItem('fav') || '{}'); } catch (e) { fav = {}; }
  try { const c = JSON.parse(localStorage.getItem('cliente') || '{}'); if (c.nome) $('nome').value = c.nome; if (c.tel) $('tel').value = c.tel; if (c.uf) $('uf').value = c.uf; if (c.aceite) $('aceite').checked = true; } catch (e) {}
  site = await carregarSite();
  numeroWa = waNumero(site.wa);
  const [p, l] = await Promise.all([
    sb.from('produtos').select(CAMPOS_VITRINE).eq('no_site', true).order('created_at', { ascending: false }),
    sb.from('looks').select('*').order('created_at', { ascending: false }),
  ]);
  if (p.error) toast('Não foi possível carregar as peças agora. Tente atualizar a página.');
  produtos = p.data || [];
  looks = l.data || [];
  aplicarTextos();
  montarSelects();
  render();
  lerHash();
}

function aplicarTextos() {
  document.querySelectorAll('[data-k]').forEach(el => { const k = el.dataset.k; if (site[k] != null && site[k] !== '') el.textContent = site[k]; });
  document.title = site.titulo || document.title;
  const hero = $('hero');
  if (site.bannerImg) { hero.style.backgroundImage = `url("${site.bannerImg}")`; hero.classList.add('com-foto'); }
  $('linkFalar').href = waLink(numeroWa, `${site.saudacao} Vim pelo site.`);
  $('linkVip').href = waLink(numeroWa, `${site.saudacao} Quero entrar na lista VIP do Closet.`);
  $('linkWa1').href = waLink(numeroWa, `${site.saudacao} Vim pelo site.`);
  $('linkWa1').textContent = numeroWa ? `${site.waTxt}: ${waFormat(numeroWa)}` : site.waTxt;
  $('linkIg').href = site.ig ? 'https://instagram.com/' + site.ig : '#';
  $('linkIg').textContent = site.ig ? '@' + site.ig + ' no Instagram' : 'Instagram';
  $('uf').innerHTML = '<option value="">Estado para entrega</option>' + UFS.map(u => `<option>${u}</option>`).join('');
}

function colecoes() {
  const m = [];
  produtos.forEach(p => (p.colecoes || []).forEach(n => { if (!m.includes(n)) m.push(n); }));
  return m;
}
function categorias() {
  const m = [];
  produtos.forEach(p => { if (p.categoria && !m.includes(p.categoria)) m.push(p.categoria); });
  return m;
}
function montarSelects() {
  const tams = [], cores = [];
  produtos.forEach(p => { (p.tamanhos || []).forEach(t => { if (!tams.includes(t)) tams.push(t); }); if (p.cor && !cores.includes(p.cor)) cores.push(p.cor); });
  const o = (v, t) => `<option value="${esc(v)}">${esc(t)}</option>`;
  $('fTam').innerHTML = o('', 'Tamanho') + tams.map(t => o(t, t)).join('');
  $('fCor').innerHTML = o('', 'Cor') + cores.map(c => o(c, c)).join('');
  $('fCor').hidden = !cores.length;
  $('fPreco').innerHTML = o('', 'Preço') + BANDAS.map((b, i) => o(i, b[0])).join('');
  $('fOrd').innerHTML = o('', 'Ordenar') + o('novo', 'Novidades primeiro') + o('menor', 'Menor preço') + o('maior', 'Maior preço') + o('az', 'Nome (A a Z)');
}

// ---------- vitrine ----------
function okFiltro(p) {
  if (filtro === 'Todas') return true;
  if (filtro === 'Novidades') return p.novo;
  if (filtro === 'Favoritos') return !!fav[p.id];
  if (filtro.startsWith('col:')) return (p.colecoes || []).includes(filtro.slice(4));
  return p.categoria === filtro;
}
function filtrados() {
  const q = busca.toLowerCase();
  let l = produtos.filter(p => okFiltro(p)
    && (!q || p.nome.toLowerCase().includes(q))
    && (!tam || (p.tamanhos || []).includes(tam))
    && (!cor || p.cor === cor)
    && (faixa === '' || (p.preco >= BANDAS[+faixa][1] && p.preco < BANDAS[+faixa][2])));
  if (ord === 'menor') l.sort((a, b) => a.preco - b.preco);
  else if (ord === 'maior') l.sort((a, b) => b.preco - a.preco);
  else if (ord === 'az') l.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  else if (ord === 'novo') l.sort((a, b) => (b.novo ? 1 : 0) - (a.novo ? 1 : 0));
  return l;
}
function fotosDe(p) { return [...new Set([p.foto_principal, ...(p.fotos || [])].filter(Boolean))]; }
function fundo(url, cor) { return url ? `background-image:url("${url}")` : `background:${cor}`; }
const CORES = ['#EBD3D0', '#EADBC4', '#F0D9D6', '#E8D8C8', '#EBD5CF', '#E3C7C9', '#F2DEDC'];
const corDe = p => CORES[(Number(p.id.replace(/\D/g, '').slice(-3)) || 0) % CORES.length];
const descPct = p => (p.preco_de > p.preco ? Math.round((1 - p.preco / p.preco_de) * 100) : 0);
const precoHtml = p => `<div class="preco">${descPct(p) ? `<s>${brl(p.preco_de)}</s>` : ''}<span>${brl(p.preco)}</span></div>`;

function render() {
  const cats = ['Todas'];
  if (produtos.some(p => p.novo)) cats.push('Novidades');
  categorias().forEach(c => cats.push(c));
  cats.push('Favoritos');
  $('cats').innerHTML = cats.map(c => `<button aria-pressed="${filtro === c}" data-c="${esc(c)}">${esc(c)}</button>`).join('');
  renderTiles();
  renderColecoes();
  const l = filtrados();
  $('fCont').textContent = `${l.length} ${l.length === 1 ? 'peça' : 'peças'}`;
  $('fLimpar').hidden = !(tam || cor || faixa !== '' || ord || busca || colecao);
  $('grid').innerHTML = l.length ? l.map(cardHtml).join('') : `<p class="vazio">Nenhuma peça encontrada. Tente outra busca ou chame a Ana Lu no WhatsApp.</p>`;
  renderFav();
  renderLooks();
  renderSacola();
}
function renderTiles() {
  const seen = new Set(); let h = '';
  produtos.forEach(p => { if (seen.has(p.categoria)) return; seen.add(p.categoria);
    h += `<button class="tile" data-c="${esc(p.categoria)}" data-go="1" style="${fundo(p.foto_principal, corDe(p))}"><span>${esc(p.categoria)}</span></button>`; });
  $('tiles').innerHTML = h; $('colecoesSec').hidden = !h;
}
function renderColecoes() {
  const c = colecoes();
  $('colecoesBtns').innerHTML = c.map(n => `<button data-col="${esc(n)}" aria-pressed="${filtro === 'col:' + n}">${esc(n)}</button>`).join('');
  $('colecoesBtns').hidden = !c.length;
}
function cardHtml(p) {
  const tags = [p.novo ? 'Novidade' : '', descPct(p) ? `-${descPct(p)}%` : '', p.qtd > 0 && p.qtd <= 2 ? 'Últimas unidades' : ''].filter(Boolean);
  const dis = p.qtd === 0;
  return `<article class="card">
    <div class="foto" data-open="${p.id}" style="${fundo(p.foto_principal, corDe(p))}">
      ${p.foto_principal ? '' : esc(p.nome.charAt(0))}
      <div class="tags">${tags.map(t => `<span class="tag">${esc(t)}</span>`).join('')}</div>
      <button class="coracao" data-heart="${p.id}" aria-pressed="${!!fav[p.id]}" aria-label="Favoritar">${fav[p.id] ? '♥' : '♡'}</button>
    </div>
    <h3 data-open="${p.id}">${esc(p.nome)}</h3>
    ${precoHtml(p)}
    <div class="tams" role="group" aria-label="Tamanho">${(p.tamanhos || []).map(t => `<button data-pid="${p.id}" data-t="${esc(t)}" aria-pressed="${sel[p.id] === t}">${esc(t)}</button>`).join('')}</div>
    <div class="dica">${dica === p.id ? 'Escolha o tamanho' : ''}</div>
    <button class="addb" data-add="${p.id}" ${dis ? 'disabled' : ''}>${dis ? 'Esgotado' : 'Adicionar à sacola'}</button>
  </article>`;
}
function renderFav() {
  const l = produtos.filter(p => fav[p.id]);
  $('favBar').hidden = !l.length;
  if (!l.length) return;
  $('favTxt').textContent = `${l.length} ${l.length === 1 ? 'peça na sua lista' : 'peças na sua lista'}`;
  const nome = $('nome').value.trim();
  const msg = `${site.saudacao}${nome ? ` Meu nome é ${nome}.` : ''} Quero ver estas peças:\n` +
    l.map(p => `• ${p.nome} - ${brl(p.preco)}\n  ${linkLoja()}#peca-${p.id}`).join('\n') + '\n\nPode me ajudar a escolher o tamanho?';
  $('favWa').href = waLink(numeroWa, msg);
}
function linkLoja() { return location.origin + location.pathname.replace(/index\.html$/, ''); }

// ---------- looks ----------
function itensLook(l) { return (l.produto_ids || []).map(id => produtos.find(p => p.id === id)).filter(Boolean); }
function renderLooks() {
  const L = looks.filter(l => itensLook(l).length >= 2);
  $('looksSec').hidden = !L.length;
  $('lookGrid').innerHTML = L.map(l => {
    const it = itensLook(l), tot = it.reduce((s, p) => s + p.preco, 0);
    return `<button class="lookc" data-look="${l.id}"><div class="mos">${it.slice(0, 3).map(p => `<div style="${fundo(p.foto_principal, corDe(p))}">${p.foto_principal ? `<img src="${esc(p.foto_principal)}" alt="">` : ''}</div>`).join('')}</div><b>${esc(l.nome)}</b><span>${it.length} peças · ${brl(tot)}</span></button>`;
  }).join('');
}
function abrirLook(id) {
  lookId = id; renderLook(); if (!$('dlgLook').open) $('dlgLook').showModal();
}
function renderLook() {
  const l = looks.find(x => x.id === lookId); if (!l) return;
  const it = itensLook(l), disp = it.filter(p => p.qtd > 0);
  const tot = disp.reduce((s, p) => s + p.preco, 0);
  $('lookCorpo').innerHTML = `<h2 style="margin-top:20px">${esc(l.nome)}</h2>` + it.map(p => `
    <div class="lki"><div class="lkp" style="${fundo(p.foto_principal, corDe(p))}">${p.foto_principal ? `<img src="${esc(p.foto_principal)}" alt="${esc(p.nome)}">` : ''}</div>
    <div><b style="font-weight:400">${esc(p.nome)}</b>${precoHtml(p)}
    ${p.qtd === 0 ? '<div class="meta">Esgotado</div>' : `<div class="tams">${(p.tamanhos || []).map(t => `<button data-lid="${p.id}" data-lt="${esc(t)}" aria-pressed="${sel[p.id] === t}">${esc(t)}</button>`).join('')}</div>`}
    </div></div>`).join('') +
    `<div class="total"><span>Total do look</span><span>${brl(tot)}</span></div><div class="hint" id="lookH"></div>
     <button class="btn" data-lookadd="1" style="width:100%">Adicionar look à sacola</button>`;
}
function addLook() {
  const l = looks.find(x => x.id === lookId); if (!l) return;
  const disp = itensLook(l).filter(p => p.qtd > 0);
  if (disp.some(p => !sel[p.id])) { $('lookH').textContent = 'Escolha o tamanho de cada peça.'; return; }
  disp.forEach(p => addSacola(p, sel[p.id], false));
  $('dlgLook').close(); abrirSacola();
}

// ---------- peça ----------
function abrirPeca(id) {
  pecaId = id; pecaFoto = 0; renderPeca();
  if (!$('dlgPeca').open) $('dlgPeca').showModal();
}
function renderPeca() {
  const p = produtos.find(x => x.id === pecaId); if (!p) return;
  const fotos = fotosDe(p), f = fotos[pecaFoto] || fotos[0];
  const det = (t, v) => v ? `<details><summary>${t}</summary><p>${esc(v)}</p></details>` : '';
  const dis = p.qtd === 0;
  $('pecaCorpo').innerHTML = `<div class="pp">
    <div>
      <div class="ppm" data-zoom="1" style="${fundo(f, corDe(p))}">${f ? `<img src="${esc(f)}" alt="${esc(p.nome)}">` : esc(p.nome.charAt(0))}</div>
      ${fotos.length > 1 ? `<div class="ppt">${fotos.map((u, i) => `<button data-foto="${i}" aria-pressed="${i === pecaFoto}" aria-label="Foto ${i + 1}"><img src="${esc(u)}" alt=""></button>`).join('')}</div>` : ''}
    </div>
    <div class="ppi">
      <h2>${esc(p.nome)}</h2>${precoHtml(p)}
      ${p.cor ? `<div class="meta">${esc(p.cor)}</div>` : ''}
      <div class="tams" role="group" aria-label="Tamanho">${(p.tamanhos || []).map(t => `<button data-pid="${p.id}" data-t="${esc(t)}" aria-pressed="${sel[p.id] === t}">${esc(t)}</button>`).join('')}</div>
      <div class="dica">${dica === p.id ? 'Escolha o tamanho' : ''}</div>
      <button class="btn" data-add="${p.id}" style="width:100%" ${dis ? 'disabled' : ''}>${dis ? 'Esgotado' : 'Adicionar à sacola'}</button>
      ${!dis && p.qtd <= 2 ? '<p class="meta">Restam poucas unidades.</p>' : ''}
      <div style="margin-top:18px">
        ${det('Descrição', p.descricao)}${det('Composição', p.composicao)}
        ${det('Medidas', p.medidas || 'Consulte a tabela de medidas em Dúvidas frequentes ou chame a Ana Lu no WhatsApp.')}
        ${det('Envio e trocas', site.f3a)}
      </div>
      <div style="margin-top:14px">
        <button class="tl" data-heart="${p.id}">${fav[p.id] ? '♥ Na minha lista' : '♡ Salvar na minha lista'}</button>
        <a class="tl" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent(p.nome + ' no Closet Ana Lu: ' + linkLoja() + '#peca-' + p.id)}">Enviar para uma amiga</a>
        <a class="tl" target="_blank" rel="noopener" href="${waLink(numeroWa, `${site.saudacao} Tenho uma dúvida sobre: ${p.nome}`)}">Tirar dúvida no WhatsApp</a>
      </div>
    </div></div>`;
}
function abrirZoom() {
  const p = produtos.find(x => x.id === pecaId); if (!p) return;
  zoomList = fotosDe(p); if (!zoomList.length) return; zoomI = Math.min(pecaFoto, zoomList.length - 1);
  mostrarZoom(); $('dlgZoom').showModal();
}
function mostrarZoom() { $('zoomImg').src = zoomList[zoomI]; $('zoomP').hidden = $('zoomN').hidden = zoomList.length < 2; }

// ---------- sacola ----------
function addSacola(p, t, avisar = true) {
  if (!t && (p.tamanhos || []).length) { dica = p.id; render(); if (avisar) toast('Escolha o tamanho.'); return; }
  const ja = sacola.find(i => i.produto_id === p.id && i.tam === (t || ''));
  const qtdNaSacola = sacola.filter(i => i.produto_id === p.id).reduce((s, i) => s + i.qtd, 0);
  if (qtdNaSacola >= p.qtd) { toast(`Só temos ${p.qtd} unidade(s) de ${p.nome}.`); return; }
  if (ja) ja.qtd++; else sacola.push({ produto_id: p.id, nome: p.nome, tam: t || '', preco: p.preco, qtd: 1 });
  salvarSacola(); render(); if (avisar) abrirSacola();
}
function salvarSacola() { try { localStorage.setItem('sacola', JSON.stringify(sacola)); } catch (e) {} }
function carregarSacola() { try { sacola = JSON.parse(localStorage.getItem('sacola') || '[]'); } catch (e) { sacola = []; } }
function subtotal() { return sacola.reduce((s, i) => s + i.preco * i.qtd, 0); }
function descontoDe(sub) {
  if (!cupom) return 0;
  if (sub < cupom.minimo) return 0;
  const d = cupom.tipo === '%' ? Math.round(sub * cupom.valor) / 100 : cupom.valor;
  return Math.max(0, Math.min(d, sub));
}
function renderSacola() {
  const qtd = sacola.reduce((s, i) => s + i.qtd, 0);
  $('qtdSacola').textContent = qtd;
  $('itens').innerHTML = sacola.length ? sacola.map((i, n) => `<div class="item"><span>${esc(i.nome)}${i.tam ? ` <span class="meta">(tam. ${esc(i.tam)})</span>` : ''}${i.qtd > 1 ? ` × ${i.qtd}` : ''}<br>${brl(i.preco * i.qtd)}</span><button data-rm="${n}">Remover</button></div>`).join('')
    : '<p class="meta">Sua sacola está vazia. Escolha um tamanho e toque em Adicionar à sacola.</p>';
  const sub = subtotal(), d = descontoDe(sub), total = sub - d;
  $('subtotal').textContent = brl(sub);
  $('linhaDesc').hidden = !d;
  $('descTxt').textContent = cupom ? `Cupom ${cupom.codigo}` : 'Desconto';
  $('descVal').textContent = '-' + brl(d);
  const uf = $('uf').value;
  const fr = uf ? freteDe(site.freteTab, uf) : null;
  const gratis = Number(site.freteGratis) > 0 && total >= Number(site.freteGratis);
  $('freteTxt').textContent = !sacola.length ? '' : !uf ? 'Escolha o estado para ver o frete estimado.' : fr ? `Frete estimado: ${gratis ? 'grátis' : brl(fr.v)}${fr.prazo ? ' · ' + fr.prazo : ''}` : gratis ? 'Frete grátis para o seu pedido.' : 'Calculamos o frete no atendimento.';
  const okCli = $('nome').value.trim().length >= 2 && soDig($('tel').value).length >= 10 && $('aceite').checked;
  $('finalizar').disabled = !sacola.length || !okCli;
  $('sacolaH').textContent = sacola.length && !okCli ? 'Informe nome, WhatsApp e aceite a política de privacidade para finalizar.' : '';
  try { localStorage.setItem('cliente', JSON.stringify({ nome: $('nome').value, tel: $('tel').value, uf, aceite: $('aceite').checked })); } catch (e) {}
}
function abrirSacola() { renderSacola(); $('drawer').classList.add('open'); }

async function aplicarCupom() {
  const cod = $('cupomIn').value.trim().toUpperCase();
  if (!cod) { cupom = null; $('cupomH').textContent = ''; renderSacola(); return; }
  const { data, error } = await sb.rpc('validar_cupom', { p_codigo: cod });
  if (error || !data || !data.valido) { cupom = null; $('cupomH').textContent = 'Cupom inválido ou vencido.'; renderSacola(); return; }
  cupom = data;
  const d = descontoDe(subtotal());
  $('cupomH').textContent = d ? `Cupom aplicado: -${brl(d)}` : `Este cupom vale a partir de ${brl(data.minimo)}.`;
  renderSacola();
}

async function finalizar() {
  const btn = $('finalizar'); btn.disabled = true; btn.textContent = 'Enviando...';
  const itens = sacola.map(i => ({ produto_id: i.produto_id, tamanho: i.tam || null, qtd: i.qtd }));
  const { data, error } = await sb.rpc('criar_pedido', {
    p_nome: $('nome').value.trim(), p_whatsapp: $('tel').value, p_pagamento: $('pag').value,
    p_uf: $('uf').value || null, p_itens: itens, p_cupom: cupom ? cupom.codigo : null, p_aceite: $('aceite').checked,
  });
  btn.textContent = 'Finalizar pedido';
  if (error) {
    const msg = (error.message || '').replace(/^.*?: /, '');
    $('sacolaH').textContent = msg.includes('Estoque') || msg.includes('disponível') || msg.includes('Tamanho') ? msg : 'Não foi possível registrar o pedido agora. Tente de novo ou fale com a Ana Lu no WhatsApp.';
    await carregar(); btn.disabled = false; return;
  }
  const sub = data.subtotal, d = data.desconto, total = data.total;
  const linhas = sacola.map(i => `• ${i.qtd}x ${i.nome}${i.tam ? ` (tam. ${i.tam})` : ''} - ${brl(i.preco * i.qtd)}`).join('\n');
  const msg = `${site.saudacao} Pedido nº ${data.numero} feito pelo site.\nNome: ${$('nome').value.trim()}\nWhatsApp: ${waFormat($('tel').value)}\n${linhas}\nSubtotal: ${brl(sub)}${d ? `\nCupom ${cupom.codigo}: -${brl(d)}` : ''}\nTotal das peças: ${brl(total)}\nPagamento: ${$('pag').value}${$('uf').value ? `\nEstado: ${$('uf').value}` : ''}\nPode me confirmar o frete e o pagamento?`;
  sacola = []; cupom = null; salvarSacola(); $('cupomIn').value = ''; $('cupomH').textContent = '';
  $('okTxt').textContent = `Seu pedido nº ${data.numero} foi registrado. Para confirmar frete e pagamento, toque em Falar com a Ana Lu.`;
  $('okWa').href = waLink(numeroWa, msg);
  $('drawer').classList.remove('open');
  if (!$('dlgOk').open) $('dlgOk').showModal();
  render();
}

// ---------- políticas ----------
const LEG = [['priv', 'Privacidade (LGPD)', 'pol_priv'], ['troca', 'Trocas e devoluções', 'pol_troca'], ['envio', 'Envio e entrega', 'pol_envio'], ['pag', 'Pagamento', 'pol_pag'], ['termos', 'Termos de uso', 'pol_termos']];
function fmtPol(t) {
  t = String(t || '').replace(/\{\{empresa\}\}/g, site.empresa || 'a loja').replace(/\{\{cnpj\}\}/g, site.cnpj || 'documento não informado').replace(/\{\{email\}\}/g, site.email || 'o WhatsApp da loja');
  let h = '', ul = false;
  t.split('\n').forEach(l => {
    l = esc(l);
    if (l.startsWith('- ')) { if (!ul) { h += '<ul>'; ul = true; } h += `<li>${l.slice(2)}</li>`; return; }
    if (ul) { h += '</ul>'; ul = false; }
    if (l.startsWith('## ')) h += `<h3>${l.slice(3)}</h3>`; else if (l.trim()) h += `<p>${l}</p>`;
  });
  return h + (ul ? '</ul>' : '');
}
function abrirLeg(k) {
  const cur = LEG.find(x => x[0] === k) || LEG[0];
  $('legTop').innerHTML = LEG.map(x => `<button data-leg="${x[0]}" aria-pressed="${x[0] === cur[0]}">${x[1]}</button>`).join('');
  $('legCorpo').innerHTML = `<h2>${cur[1]}</h2>${fmtPol(site[cur[2]])}<p class="meta">Última atualização: ${esc(site.polData || '')}</p>`;
  if (!$('dlgLeg').open) $('dlgLeg').showModal(); $('dlgLeg').scrollTop = 0;
}

// ---------- rotas e eventos ----------
function lerHash() {
  const h = decodeURIComponent((location.hash || '').slice(1));
  if (h.startsWith('colecao-')) {
    const c = colecoes().find(n => slug(n) === h.slice(8));
    if (c) { filtro = 'col:' + c; render(); $('produtos').scrollIntoView(); }
  } else if (h.startsWith('look-')) {
    if (looks.some(l => l.id === h.slice(5))) abrirLook(h.slice(5));
  } else if (h.startsWith('peca-')) {
    if (produtos.some(p => p.id === h.slice(5))) abrirPeca(h.slice(5));
  }
}
function toggleFav(id) { fav[id] = !fav[id]; if (!fav[id]) delete fav[id]; try { localStorage.setItem('fav', JSON.stringify(fav)); } catch (e) {} render(); if (pecaId) renderPeca(); }
function toast(m) { const t = $('toast'); t.textContent = m; t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => (t.hidden = true), 4000); }

document.addEventListener('click', e => {
  const t = e.target, c = t.closest('button, a, [data-open], [data-look], [data-go]');
  if (t.closest('[data-leg]')) { e.preventDefault(); abrirLeg(t.closest('[data-leg]').dataset.leg); return; }
  if (t.closest('[data-c]')) { const b = t.closest('[data-c]'); filtro = b.dataset.c; colecao = ''; render(); if (b.dataset.go) $('produtos').scrollIntoView({ behavior: 'smooth' }); return; }
  if (t.closest('[data-col]')) { const n = t.closest('[data-col]').dataset.col; filtro = filtro === 'col:' + n ? 'Todas' : 'col:' + n; render(); return; }
  if (t.dataset.heart) { toggleFav(t.dataset.heart); return; }
  if (t.closest('[data-heart]')) { toggleFav(t.closest('[data-heart]').dataset.heart); return; }
  if (t.closest('[data-open]')) { abrirPeca(t.closest('[data-open]').dataset.open); return; }
  if (t.closest('[data-look]')) { abrirLook(t.closest('[data-look]').dataset.look); return; }
  if (t.closest('[data-pid]')) { const b = t.closest('[data-pid]'); sel[b.dataset.pid] = b.dataset.t; dica = null; render(); if (pecaId) renderPeca(); if (lookId) renderLook(); return; }
  if (t.closest('[data-lid]')) { const b = t.closest('[data-lid]'); sel[b.dataset.lid] = b.dataset.lt; renderLook(); return; }
  if (t.closest('[data-add]')) { const p = produtos.find(x => x.id === t.closest('[data-add]').dataset.add); if (p) addSacola(p, sel[p.id] || ''); return; }
  if (t.closest('[data-rm]')) { sacola.splice(+t.closest('[data-rm]').dataset.rm, 1); salvarSacola(); render(); return; }
  if (t.closest('[data-foto]')) { pecaFoto = +t.closest('[data-foto]').dataset.foto; renderPeca(); return; }
  if (t.closest('[data-zoom]')) { abrirZoom(); return; }
  if (t.closest('[data-lookadd]')) { addLook(); return; }
});
$('q').oninput = e => { busca = e.target.value; render(); };
$('fTam').onchange = e => { tam = e.target.value; render(); };
$('fCor').onchange = e => { cor = e.target.value; render(); };
$('fPreco').onchange = e => { faixa = e.target.value; render(); };
$('fOrd').onchange = e => { ord = e.target.value; render(); };
$('fLimpar').onclick = () => { tam = cor = faixa = ord = busca = colecao = ''; filtro = 'Todas'; $('q').value = ''; ['fTam', 'fCor', 'fPreco', 'fOrd'].forEach(i => $(i).value = ''); render(); };
$('verFav').onclick = () => { filtro = 'Favoritos'; render(); $('produtos').scrollIntoView({ behavior: 'smooth' }); };
$('btnBusca').onclick = () => { $('q').scrollIntoView({ behavior: 'smooth', block: 'center' }); $('q').focus(); };
$('btnSacola').onclick = () => { renderSacola(); $('drawer').classList.add('open'); };
$('fecharSacola').onclick = () => $('drawer').classList.remove('open');
$('fecharPeca').onclick = () => $('dlgPeca').close();
$('fecharLook').onclick = () => $('dlgLook').close();
$('fecharLeg').onclick = () => $('dlgLeg').close();
$('okFechar').onclick = () => $('dlgOk').close();
$('zoomX').onclick = () => $('dlgZoom').close();
$('zoomImg').onclick = () => $('dlgZoom').close();
$('zoomP').onclick = () => { zoomI = (zoomI - 1 + zoomList.length) % zoomList.length; mostrarZoom(); };
$('zoomN').onclick = () => { zoomI = (zoomI + 1) % zoomList.length; mostrarZoom(); };
$('cupomOk').onclick = aplicarCupom;
$('cupomIn').onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); aplicarCupom(); } };
$('finalizar').onclick = finalizar;
['nome', 'tel', 'uf', 'pag', 'aceite'].forEach(id => $(id).addEventListener(id === 'aceite' || id === 'uf' || id === 'pag' ? 'change' : 'input', renderSacola));
window.addEventListener('hashchange', lerHash);
$('drawer').addEventListener('keydown', e => { if (e.key === 'Escape') $('drawer').classList.remove('open'); });

carregarSacola();
carregar().then(() => renderSacola());
