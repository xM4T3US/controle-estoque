# Controle de Estoque — PWA

Aplicação web responsiva (PWA) para digitalizar a conferência física de estoque,
substituindo o formulário em papel. Funciona **offline**, é **instalável** no
celular e guarda tudo localmente (IndexedDB + backup em LocalStorage).

> Stack: HTML5 · CSS3 · JavaScript  · Bootstrap  · IndexedDB · Service Worker

---

## Estrutura de arquivos

```
controle-estoque/
├── index.html               Estrutura / shell da aplicação
├── manifest.json            Manifesto PWA (instalação)
├── sw.js                    Service Worker (cache offline)
├── css/
│   └── styles.css           Tema industrial (claro + escuro)
├── js/
│   ├── utils.js             Helpers: data, turno, diferença, segurança
│   ├── storage.js           Camada de dados (IndexedDB + LocalStorage)
│   ├── reports.js           Exportação JSON / CSV / PDF
│   └── app.js               Controlador da interface
├── icons/                   Ícones do app (192 / 512 / maskable)
├── vendor/                  Bibliotecas e fontes locais (offline, sem CDN)
│   ├── bootstrap/           Bootstrap 5 (CSS + JS)
│   ├── bootstrap-icons/     Ícones (CSS + fontes)
│   ├── jspdf/               jsPDF + autotable (exportação PDF)
│   └── fonts/               Barlow / IBM Plex (woff2 + fonts.css)
└── exemplo_2026-05-30_TARDE.json   Arquivo de exemplo p/ importar
```

---

## Como rodar

### Local (rápido)
A aplicação principal abre direto pelo `index.html`. Porém, **Service Worker e
instalação PWA exigem um servidor HTTP** (não funcionam via `file://`). Para o
modo completo:

```bash
# Python
python3 -m http.server 8080
# ou Node
npx serve .
```
Depois acesse `http://localhost:8080`.

### Em produção (Hostinger)
Basta enviar a pasta inteira para o diretório público (ex.: `public_html/estoque/`).
O `manifest.json` e o `sw.js` usam caminhos relativos, então funciona em
subpasta. Como é servido por HTTPS, a instalação “Adicionar à tela inicial”
fica disponível automaticamente.

> **100% offline desde o 1º acesso:** Bootstrap, ícones, fontes e jsPDF estão
> **embutidos** em `vendor/` (nada de CDN). O Service Worker pré-cacheia todo o
> app na instalação, então depois ele abre e funciona sem qualquer internet.

---

## Instalar no Android (offline)

### Opção 1 — PWA (recomendada, sem ferramentas)
1. Hospede a pasta em HTTPS (ex.: `https://mjtech.net.br/estoque/`).
2. No celular, abra o endereço no **Chrome**.
3. Menu (⋮) → **Instalar app** / **Adicionar à tela inicial**.
4. O ícone fica na tela inicial e abre em tela cheia, **funcionando offline**
   (sem barra do navegador). Os dados ficam no aparelho (IndexedDB).

### Opção 2 — Gerar um APK (instalável por arquivo)
Para distribuir como aplicativo `.apk`:

- **PWABuilder (mais fácil, sem instalar nada):** acesse
  `https://www.pwabuilder.com`, informe a URL HTTPS do app, e baixe o pacote
  **Android (TWA)**. Gera um APK/AAB que abre o PWA em tela cheia.
- **Capacitor (100% embarcado, roda sem servidor):** empacota os arquivos
  *dentro* do APK — não depende de hospedagem:
  ```bash
  npm i -g @capacitor/cli
  npm init -y && npm i @capacitor/core @capacitor/android
  npx cap init "Controle de Estoque" net.br.mjtech.estoque --web-dir=.
  npx cap add android
  npx cap copy
  npx cap open android   # gera o APK no Android Studio
  ```

> Em todos os casos os dados continuam **locais no aparelho**.

---

## Funcionalidades

- **Novo registro** com cálculo automático da diferença (Físico − Sistema) e
  indicação visual: cinza (=0), verde (positivo), vermelho (negativo).
- **Data, hora e turno automáticos** (Manhã 06–14h · Tarde 14–22h · Noite 22–06h).
  Líder fixo: **Mateus**. Operadores: André, Valdemir, Felipe.
- **Tabela dinâmica** com busca global em tempo real, editar e excluir.
- **Histórico** agrupado em arquivos `AAAA-MM-DD_TURNO.json` (visualizar / exportar / excluir).
- **Pesquisar Rua**: filtros (rua, período, operador), resumo, histórico de
  divergências e **timeline de auditoria** (mais recente primeiro).
- **Dashboard** com indicadores do dia e resumo geral.
- **Importar / Exportar** JSON · Exportar CSV e PDF.
- **Tema escuro** com preferência salva.
- **Offline-first** e **instalável** (PWA).

---

## Importar dados

No menu lateral → **Importar JSON**. Aceita:
- arquivo exportado pelo próprio app (consolidado);
- arquivo único `AAAA-MM-DD_TURNO.json` (formato do exemplo incluído);
- um array simples de registros.

Registros duplicados (mesma rua/produto/operador/quantidades no mesmo dia/turno)
são ignorados automaticamente.

---

## Preparado para backend futuro

Todo o acesso a dados está isolado em **`js/storage.js`**. A interface é baseada
em Promises (`create`, `update`, `remove`, `getAll`, `query`, `bulkImport`…).
Para integrar com **Spring Boot / PostgreSQL / Supabase / Firebase**, basta
reimplementar esses métodos para chamar a API REST — **o restante do frontend
não precisa ser alterado**.

Arquitetura já pensada para evoluções: login, permissões, múltiplos líderes,
sincronização em nuvem, leitura de QR Code / código de barras e auditoria
completa de alterações.

---

## Observações de implementação

- **PDF**: gerado com jsPDF (carregado por CDN e cacheado pelo Service Worker
  para uso offline). Se a biblioteca não estiver disponível, há um fallback
  automático via janela de impressão (Salvar como PDF).
- **Bibliotecas e fontes**: Bootstrap, Bootstrap Icons, jsPDF e as fontes
  (Barlow Semi Condensed, IBM Plex Sans, IBM Plex Mono) estão **embutidas** na
  pasta `vendor/`. Não há nenhuma chamada a CDN — o app é totalmente
  autocontido e funciona offline desde o primeiro acesso.
- “Pesquisar Rua” foi implementada como uma **tela dedicada** (em vez de modal),
  por conter resumo, divergências e auditoria — melhor experiência no celular.
