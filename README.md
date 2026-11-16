# Closet Ana Lu: site e painel

Site estático (HTML, CSS e JavaScript puros) com banco de dados no Supabase.
Não precisa de build nem de servidor: basta publicar a pasta no Vercel.

## Estrutura
- `index.html`: a loja para as clientes.
- `admin.html`: o painel da Ana Lu (login por link no e-mail).
- `assets/lib.js`: conexão com o Supabase, Pix, fotos e planilhas.
- `assets/shop.js`: lógica da loja (vitrine, sacola, cupom, frete, pedido).
- `assets/admin.js`: lógica do painel (estoque, pedidos, clientes, financeiro, looks, cupons, conteúdo, backup).
- `assets/defaults.js`: textos padrão e lista de campos da aba Conteúdo.
- `assets/style.css`: visual.

## Acessos
- Administradoras: closet.analu@gmail.com e fabiofarias.job@gmail.com. Entram pelo `admin.html` com o link enviado por e-mail.
- Para dar acesso a outra pessoa: no painel do Supabase, adicione o e-mail à lista de autorizados (migração 004 da função `tornar_admin_se_autorizado`) ou insira o usuário na tabela `admins`.

## Manutenção do dia a dia (feita pela Ana Lu no painel)
- Estoque, fotos, looks, cupons, pedidos, cobranças, clientes e despesas.
- Aba **Conteúdo**: todos os textos, políticas, frete por estado, Pix e foto do banner.
- Cada alteração aparece na loja na hora.

## Banco de dados (Supabase)
- Projeto: `closet-ana-lu` (região São Paulo).
- A chave pública no `lib.js` pode ficar no código. Nunca coloque a chave `service_role` nem senhas nos arquivos do site.
- As regras de acesso ficam no próprio banco (RLS). O custo das peças só é lido por administradoras.
- Pedidos são criados pela função `criar_pedido`, que confere preço, estoque, cupom e aceite de privacidade no servidor.
- Backup: use a aba Backup do painel toda semana. O plano gratuito não faz backup automático do banco.

## Publicação
1. Suba estes arquivos para um repositório no GitHub.
2. No Vercel, crie um projeto a partir desse repositório. Não há etapa de build (deixe o comando vazio e a pasta de saída como a raiz).
3. A cada `git push` o site é atualizado sozinho.

## Limites conhecidos
- Pix: a confirmação de pagamento é manual (a Ana Lu marca como pago).
- Campanhas de WhatsApp: uma mensagem por vez, pelo link de cada cliente.
- Plano gratuito: o projeto Supabase pausa após cerca de uma semana sem acesso.
- Vercel Hobby: uso pessoal. Para vendas em escala, o plano Pro é necessário.
