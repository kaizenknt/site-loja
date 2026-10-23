# Site D’Lu Empório e VKS Condimentos — resumo para continuar o trabalho

Site-catálogo de duas lojas de temperos do mesmo dono, no Brás (São Paulo). O cliente monta o pedido no site e envia pelo WhatsApp da loja escolhida. O próximo passo combinado é **enviar o pedido direto para o Balcão PDV** (repositório `kaizenknt/balcao-pdv`).

> **Atenção:** os arquivos em `design-original/` foram feitos no editor de design do Claude (formato `.dc.html`). Eles **não abrem sozinhos no navegador**: dependem de um runtime próprio do editor. Servem como **referência exata** de layout, textos, cores e lógica. Para colocar no ar, o site precisa ser reescrito numa tecnologia comum (HTML/JS puro, React, Next.js etc.), reaproveitando `dados/` e `imagens/` sem alteração.

---

## 1. Organização dos arquivos

```
site-loja/
├── RESUMO.md                     ← este arquivo
├── dados/
│   ├── produtos.json             ← catálogo completo (97 produtos), com loja, categoria, venda, tamanhos e fotos
│   ├── lojas.json                ← dados das duas lojas (endereço, horário, WhatsApp, texto de atacado)
│   └── exemplo-pedido.json       ← formato sugerido para enviar o pedido ao Balcão PDV
├── imagens/
│   ├── logo-dlu.png              ← logo da D’Lu (print; pedir o arquivo original em alta)
│   ├── dlu/                      ← fotos só da D’Lu (11, fotos reais das misturas na bandeja)
│   └── vks/                      ← fotos só da VKS (41: frascos recortados com fundo transparente + fotos de textura)
└── design-original/
    ├── Main.dc.html              ← página inteira: topo, banner, catálogo, sacola, conta, lojas, rodapé + toda a lógica
    └── Cartao.dc.html            ← cartão de produto (foto/desenho, ardência, opções de quantidade, botão Adicionar)
```

No `Main.dc.html`, a lógica fica no `<script type="text/x-dc">` no fim do arquivo (classe `Component`, método `renderVals()`). O HTML acima dele é o template (`{{campo}}` = valor vindo de `renderVals()`, `<sc-for>` = repetição, `<sc-if>` = condição).

---

## 2. Onde ficam o catálogo e o carrinho

### Catálogo
- **Fonte de verdade:** `dados/produtos.json`. É o mesmo conteúdo do array `const base = [...]` dentro de `Main.dc.html`, já organizado.
- Campos de cada produto:
  - `id`: código provisório do site (`P001`…). **Deve ser trocado/ligado ao código do produto no Balcão PDV.**
  - `lojas`: `["dlu"]`, `["vks"]` ou as duas.
  - `venda`:
    - `granel`: pesado na hora. Opções no site: 250 g, 500 g, 1 kg e fardo fechado (10 kg na D’Lu, 25 kg na VKS, ou saco de 25 kg quando o produto tem esse selo).
    - `embalado`: pote/garrafa/vidro. Opções = `tamanhos`.
    - `unidade`: caixa/pacote fechado (ex.: alho roxo em caixa de 10 kg, alho descascado em pacote de 1 kg).
  - `ardencia`: 0 a 5 (escala de pimentinhas). `ardenciaTexto` substitui o rótulo padrão quando existe (ex.: "Não arde", "Picante, sem ardência").
  - `fotos`: por loja. `tipo: "recorte"` = PNG/WebP com fundo transparente (mostrar com `object-fit: contain` sobre fundo claro e sombra); `tipo: "foto"` = foto de textura que ocupa o cartão inteiro (`object-fit: cover`). Produto sem foto mostra um **desenho** (montinho granulado, pote ou garrafa) na `corDesenho`.

### Carrinho ("sacola")
- Fica no estado do componente (`carrinhos: { dlu: [], vks: [] }`). **Cada loja tem a sua sacola.**
- Salvo no navegador do cliente em `localStorage['dlu-sacola']`.
- Item da sacola: `{ nome, marca, r (opção escolhida), g (gramas por unidade, se granel), un, fechado, n (quantidade) }`.
- Ao enviar, monta uma mensagem de texto e abre `https://wa.me/<número da loja>?text=...`. Exemplo da mensagem:
  ```
  Olá, D’Lu Empório! Gostaria de fazer um pedido:

  Cominho – 1 kg
  Páprica defumada (2 fardos fechados) – 20 kg
  Pimenta malagueta Nativa 90 g – 2 un

  Entrega por Lalamove ou Uber
  Endereço: Rua X, 10 – Mooca
  Nota fiscal: sim, no CNPJ 11.222.333/0001-81 (Restaurante Bom Sabor)
  Nome: Marta Silva
  Telefone: 11 99999-0000
  ```
  Esse texto é lido sem erro pelo app "Ficha de Pesagem" (Windows) que já está em uso na loja.

### Conta do cliente
- Dados (nome, WhatsApp, CPF/CNPJ, razão social, endereço) e histórico dos últimos 20 pedidos ficam em `localStorage['dlu-conta']`, **só no aparelho do cliente**. Não existe servidor ainda.
- CPF e CNPJ são validados pelos dígitos verificadores antes de enviar.

---

## 3. O que já funciona (no design)
- Troca entre as lojas D’Lu e VKS no topo: muda logo, endereço, horário, WhatsApp, catálogo, fotos, textos de atacado e banner.
- **Aberto agora / Fechado**, calculado no fuso de São Paulo (seg. a sáb.; D’Lu 5h30–16h, VKS 6h–16h; "fecha em X min" na última hora).
- Busca por nome, categoria ou marca; filtro por categoria (menu, botões e círculos).
- Banner com 3 destaques que trocam sozinhos; fita animada com nomes dos produtos; galeria de fotos das misturas (só aparece com 5+ fotos da loja).
- Cartões com escolha de quantidade/tamanho, escala de ardência, selo de marca ("Marca Nativa", "Marca Aroma D’Minas", "Marca Muniz", "Marca Jomil") e selos "Da casa", "Saco 25 kg", "Caixa 10 kg", "Pacote 1 kg".
- Sacola lateral, aviso "Na sacola", contador no topo e botão flutuante "Ver meu pedido".
- Retirar na loja × Entrega (Lalamove ou Uber), com endereço obrigatório na entrega.
- Pergunta de nota fiscal com CPF/CNPJ validado.
- Minha conta: meus dados + meus pedidos com "Pedir de novo".
- Animações (entrada do banner, revelar ao rolar, topo que encolhe), respeitando "reduzir movimento".
- Layout responsivo (no celular o topo não fica fixo; o atalho é o botão do WhatsApp flutuante).

## 4. O que falta
1. **Reescrever o site em tecnologia comum e publicar** num domínio próprio (ex.: `dluemporio.com.br`).
2. **Integração com o Balcão PDV:** o site deve mandar o pedido no formato de `dados/exemplo-pedido.json` (ou o que o PDV definir). Pontos a decidir no PDV:
   - onde ele roda (só no computador da loja ou na nuvem) — se for só local, precisa de um intermediário na nuvem;
   - **códigos de produto**: ligar o `id` do site ao código do PDV;
   - cadastro do cliente com CPF/CNPJ para emitir a nota;
   - o pedido deve entrar como **pendente de conferência** (a loja confere e pesa antes de faturar).
3. Conta do cliente de verdade (login, histórico no servidor) só depois que houver backend — cuidado com LGPD (CPF/CNPJ, endereço).
4. Conteúdo pendente:
   - história das duas lojas (hoje há texto entre colchetes);
   - **logo da VKS** (hoje aparece "VKS / Condimentos" escrito);
   - logo da D’Lu em alta resolução (a atual é print);
   - nomes das fotos 5, 13, 14 e de um vídeo de mistura (ainda não identificados);
   - fotos da D’Lu para os produtos que ainda usam desenho;
   - tamanhos dos molhos que ainda mostram "Consulte os tamanhos".
5. **Fotos tiradas da internet** (hibisco, canela, cravo, erva-doce, alecrim, camomila, pimenta do reino, calabresa, louro): trocar aos poucos por fotos próprias antes de publicar. A do cominho em grão tinha marca d’água de outra empresa e **não foi usada**.
6. **Nomes "Tempero Ana Maria", "Edu Guedes", "Master Chef"**: são nomes de pessoas famosas/programa de TV. Avaliar trocar por nomes da casa no site público (ex.: "Tempero da Casa nº 1 (tipo Ana Maria)").

## 4.1 Integração com o Balcão PDV (feita)
O pedido agora vai **direto para a loja**, sem depender do WhatsApp (que continua como alternativa).

- **Ponte na nuvem**: pasta `functions/` (Cloudflare Pages Functions) + um armazenamento KV chamado `LOJA`.
  - `GET /api/catalogo?loja=dlu`: preços e produtos em falta que o Balcão publicou. Se a loja ainda não publicou, o site usa `precos.json` (exemplo).
  - `POST /api/pedido`: o site envia a sacola. Volta um **código** curto (ex.: `7GZCM`) que o cliente usa para acompanhar.
  - `GET /api/status?loja=dlu&codigo=7GZCM`: situação do pedido (recebido, separando, pronto…).
  - `/api/painel/publicar`, `/api/painel/pedidos`, `/api/painel/status`: usados **só pelo Balcão**, com o token da loja (`Authorization: Bearer …`). Os tokens ficam na variável `PAINEL_TOKENS` da Cloudflare (`{"dlu":"…","vks":"…"}`).
- **Preços por loja**: cada loja publica os seus; a chave de cada produto é `slug(nome)` ou `slug(nome)|slug(marca)` (ver `chavePreco` no `app.js`).
- **Sacola**: pede nome e WhatsApp (obrigatórios), mostra "Em falta no momento" e desativa o botão quando o Balcão marca o produto como indisponível. Depois de enviar, mostra o código e a situação; "Minhas compras" também mostra a situação.
- Proteções: só aceita pedido vindo do próprio site, limite de 8 pedidos por IP a cada 10 min, campo-isca contra robôs, tamanho limitado.
- Para testar localmente: `npx wrangler pages dev . --kv LOJA --binding 'PAINEL_TOKENS={"dlu":"teste"}'`.

## 5. Regras de negócio que devem ser mantidas
- **Mínimo de 250 g** por produto a granel (o app de pesagem arredonda para 250 g).
- **Fardos:** D’Lu = **10 kg**; VKS = **25 kg**; as duas pesam quantidades menores. Caldo de galinha e colorau caseiro (D’Lu) também vêm em saco de 25 kg.
- **Alho roxo nacional (VKS):** caixa fechada de 10 kg, **entrega somente por Lalamove, Uber ou retirada na loja**.
- **Fotos da VKS são só da VKS e fotos da D’Lu são só da D’Lu. Nunca misturar.** Produto que existe nas duas lojas mostra, em cada aba, apenas a foto daquela loja (ou o desenho).
- **Jataí do Nordeste** é xarope sabor mel (xarope de glicose + aroma de mel), **não é mel**. Não descrever como mel de abelha.
- **Açafrão puro** não é cúrcuma (não usar a palavra cúrcuma).
- Escala de ardência (0–5): biquinho/de bico 0 ("Não arde"); caipira 1 ("Picante, sem ardência"); mista, de bode, pequi 2; mata sogra, mata genro, espanta visita 3 ("Média-forte"); malagueta, cumari, habanero 4; Carolina Reaper e Scorpion 5.

## 6. Decisões de design (manter)
**Conceito:** "feira de temperos do Brás" — azul-marinho da logo como base, amarelo de destaque, vermelho-páprica para calor, verde só para WhatsApp.

| Uso | Cor |
|---|---|
| Azul-marinho principal (textos, fundos escuros, rodapé) | `#1d2240` |
| Azul da marca (menu de categorias, títulos) | `#23336b` / variação `#2c3d78` |
| Amarelo de destaque (botões principais, selos, filtro ativo) | `#f2b31b` |
| Vermelho-páprica (eyebrows, faixa de atacado, selo "Da casa") | `#b8321e` |
| Verde WhatsApp (todos os botões de pedido) | `#1b7a4b` (hover `#155f3b`) |
| Fundo creme das seções | `#f8f3ea` |
| Linhas e bordas | `#ece5d6` / `#e2d9c6` |
| Texto secundário | `#5a5f78` |

**Tipografia (Google Fonts):**
- Títulos: **Archivo**, peso 900, **condensada** (`font-stretch: 72–75%`), **MAIÚSCULAS**.
- Texto: **Figtree** (400–800).
- Pequenos rótulos acima dos títulos ("eyebrow"): 13px, peso 800, maiúsculas, espaçamento .14em, com tracinho antes.

**Elementos:**
- Botões arredondados (pílula).
- Cartões com cantos de 20px e sombra leve.
- Ondas separando as seções escuras.
- Etiquetas de atacado com furinho, levemente tortas.
- Selo amarelo girado "250 g pesado na hora" no banner.
- Fotos com zoom leve ao passar o mouse.

**Textos-chave:**
- "Tempero pesado na hora" / "Temperos a granel do jeito que você precisa".
- "Varejo e atacado: pedidos a partir de 250 g ou em fardos de 10 kg (D’Lu) / 25 kg (VKS)".
- "Compra para o seu negócio? A gente abastece."
- "Direto da bandeja para a sua cozinha".
- "Tem tempero pra tudo".

## 7. Dados das lojas
- **D’Lu Empório** — Rua Santa Rosa, 244, Brás, São Paulo/SP — seg. a sáb., 5h30 às 16h — WhatsApp (11) 3313-6697.
- **VKS Condimentos** — Avenida Mercúrio, 330, Brás, São Paulo/SP — seg. a sáb., 6h às 16h — WhatsApp (11) 3311-7153.
