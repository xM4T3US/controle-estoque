# Controle de Estoque — PWA + API REST (PHP) + persistência JSON

Sistema **mobile-first** para digitalizar a conferência física de armazém
(substitui a planilha de papel). Funciona **offline** (PWA com IndexedDB) e
sincroniza com o servidor via **API REST em PHP**, com persistência
**exclusivamente em arquivos JSON** (sem MySQL/PostgreSQL/Mongo/Firebase).

Feito para rodar na **Hostinger (Single Web Hosting / hospedagem compartilhada)**,
que suporta PHP nativamente e **não** suporta Node.js.

> Desenvolvido por Mateus Junior — https://github.com/xM4T3US

---

## ⚙️ Personalização: nomes de operadores e do líder

Esta versão pública vem com nomes **genéricos**:

- Operadores: `operador-1`, `operador-2`, `operador-3`
- Líder: `lider/supervisor`

Antes de usar em produção, substitua pelos nomes reais da sua equipe. Os nomes
aparecem em **5 arquivos**. Abaixo, cada ponto com o **trecho exato** e a **linha
aproximada** (pode variar 1–2 linhas conforme edições futuras).

> Dica: faça uma busca global por `operador-1`, `operador-2`, `operador-3` e
> `lider/supervisor` no projeto — assim você acha todos os pontos rapidamente.

### 1) `index.html` — lista de operadores do formulário (≈ linha 134)

```html
<option value="operador-1">operador-1</option>
<option value="operador-2">operador-2</option>
<option value="operador-3">operador-3</option>
```
Troque os `value` **e** o texto pelos nomes reais. Ex.:
```html
<option value="João">João</option>
<option value="Maria">Maria</option>
<option value="Carlos">Carlos</option>
```
Se tiver mais (ou menos) operadores, adicione/remova linhas `<option>`.

### 2) `index.html` — nome do líder no formulário (≈ linha 141)

```html
<input type="text" id="f-lider" value="lider/supervisor" readonly />
```
Troque o `value` pelo nome do líder/supervisor real.

### 3) `index.html` — mesma lista de operadores no filtro de Pesquisa (≈ linha 219)

```html
<option value="operador-1">operador-1</option>
<option value="operador-2">operador-2</option>
<option value="operador-3">operador-3</option>
```
**Importante:** mantenha esta lista **igual** à do item 1 (mesmos nomes).

### 4) `index.html` — líder exibido no menu lateral (≈ linha 94)

```html
<span><i class="bi bi-person-badge"></i> Líder: <strong>lider/supervisor</strong></span>
```

### 5) `js/app.js` — valor padrão do líder no formulário (≈ linha 185)

```js
this.setVal("f-lider", "lider/supervisor");
```

### 6) `js/app.js` — líder gravado ao salvar um registro (≈ linha 381)

```js
lider: "lider/supervisor",
```

### 7) `js/storage.js` — líder padrão ao normalizar registros (≈ linha 269)

```js
lider: Utils.sanitize(r.lider) || "lider/supervisor",
```

### 8) `js/reports.js` — líder nas exportações (≈ linhas 21, 62, 125 e 202)

```js
lider: r.lider || "lider/supervisor",     // ≈ 21  (agrupamento JSON)
lider: "lider/supervisor",                // ≈ 62  (cabeçalho do relatório)
// ... Líder: lider/supervisor ...        // ≈ 125 (rodapé do PDF)
// ... Líder: lider/supervisor ...        // ≈ 202 (rodapé do HTML/print)
```
Troque **todas** as ocorrências de `lider/supervisor` neste arquivo.

### 9) `api/services/JsonService.php` — líder padrão no backend (≈ linha 205)

```php
$lider   = $dados['lider'] ?? 'lider/supervisor';
```
Esse é o valor usado quando um registro chega sem o campo `lider`. Troque pelo
nome real do líder/supervisor.

> **Resumo dos nomes a procurar e substituir:**
> `operador-1`, `operador-2`, `operador-3` (em `index.html`, itens 1 e 3) e
> `lider/supervisor` (em `index.html`, `js/app.js`, `js/storage.js`,
> `js/reports.js` e `api/services/JsonService.php`).

---

## 🔒 Acesso (login)

O sistema tem **login simples de um usuário** (somente senha) que protege a API
no servidor — sem login, as rotas de dados retornam **401** e os JSONs não ficam
expostos publicamente.

**Definir a senha (primeira vez):**

1. Publique os arquivos no servidor.
2. Acesse no navegador: `https://SEU-DOMINIO/CAMINHO/definir-senha.php`
3. Defina a senha desejada.
4. **Apague o arquivo `definir-senha.php`** do servidor por segurança.

Detalhes técnicos:
- A senha é guardada como **hash bcrypt** em `database/auth.json` (pasta bloqueada
  para a web).
- A sessão fica em `database/sessions/` e dura **30 dias** (login "lembrado").
- Para **trocar a senha**, suba de novo o `definir-senha.php` — ele exige a senha
  atual antes de alterar — e apague-o ao terminar.
- O `definir-senha.php` está incluído apenas como ferramenta de configuração;
  **não o deixe publicado** em produção.

---

## Estrutura

```
controle-estoque/
├── index.html  css/  js/  vendor/  icons/  manifest.json  sw.js   (PWA)
├── definir-senha.php            Ferramenta p/ definir a senha (apagar após uso)
├── .htaccess                    Protege /database e faz fallback do PWA
├── api/
│   ├── index.php                Roteador REST + sessão/login
│   ├── .htaccess                Reescreve /api/* -> index.php
│   └── services/
│       ├── JsonService.php      ⭐ Camada de dados isolada (trocável por SQL)
│       └── AuthService.php      Autenticação (sessão PHP)
└── database/                    Criado/escrito em execução (NÃO versionar dados)
    ├── .htaccess                Bloqueia acesso web aos dados
    ├── auth.json                Hash da senha (gerado pelo definir-senha.php)
    ├── sessions/                Sessões de login
    ├── AAAA/MM/AAAA-MM-DD_TURNO.json
    ├── backups/backup_AAAA-MM-DD_HHmmss.json
    └── logs/auditoria.json
```

---

## Implantação na Hostinger (hPanel)

1. No **Gerenciador de Arquivos**, envie o conteúdo desta pasta para
   `public_html/` (ou uma subpasta, ex.: `public_html/estoque/`).
2. O **mod_rewrite** já vem ativo na Hostinger; os `.htaccess` cuidam do roteamento.
   O frontend também chama a API diretamente via `api/index.php?route=...`, então
   funciona mesmo que outro projeto no domínio tenha `.htaccess` próprio.
3. A pasta `database/` precisa de **permissão de escrita** (`755`/`775`).
4. Defina a senha em `definir-senha.php` (veja a seção **Acesso**) e apague o arquivo.
5. Acesse o domínio/subpasta. O PWA é instalável no Android via Chrome → **Instalar app**.

> Para apontar o frontend a uma API em outro domínio, defina `window.CE_API_BASE`
> antes de `js/api.js` (cuidado: sessão por cookie exige mesmo domínio).

### Teste local (opcional)
```bash
php -S localhost:8000
```

---

## API REST

| Método | Rota | Descrição | Requer login |
|--------|------|-----------|:---:|
| POST   | `/api/login`  | Faz login (body `{"senha":"..."}`) | — |
| POST   | `/api/logout` | Encerra a sessão | — |
| GET    | `/api/me`     | Estado de autenticação | — |
| GET    | `/api/health` | Verificação | — |
| POST   | `/api/estoque` | Salva um registro | ✅ |
| GET    | `/api/estoque` | Lista todos | ✅ |
| GET    | `/api/estoque/rua/{rua}` | Busca por rua (varre meses/anos) | ✅ |
| GET    | `/api/estoque/periodo?inicio=AAAA-MM-DD&fim=AAAA-MM-DD` | Busca por período | ✅ |
| PUT    | `/api/estoque/{id}` | Edita | ✅ |
| DELETE | `/api/estoque/{id}` | Exclui | ✅ |

Exemplo (após login, reaproveitando o cookie de sessão):
```bash
# 1) login (guarda o cookie em cookies.txt)
curl -c cookies.txt -X POST "https://SEU-DOMINIO/CAMINHO/api/index.php?route=login" \
  -H "Content-Type: application/json" -d '{"senha":"SUA_SENHA"}'

# 2) cria um registro usando a sessão
curl -b cookies.txt -X POST "https://SEU-DOMINIO/CAMINHO/api/index.php?route=estoque" \
  -H "Content-Type: application/json" \
  -d '{"rua":"L07","produto":"Carrara PT-2","quantidadeSistema":33,"quantidadeFisica":35,"operador":"operador-1"}'
```

---

## Persistência

Ao salvar: identifica data/turno → monta `database/AAAA/MM/AAAA-MM-DD_TURNO.json`
→ cria pastas/arquivo se faltarem → adiciona registro com **UUID** → grava → gera
**backup** → registra na **auditoria** (CRIAR/EDITAR/EXCLUIR).

**Proteção contra corrupção:** gravação com `flock` (lock exclusivo) e **escrita
atômica** (`.tmp` + `rename`). **Segurança:** `database/` é bloqueada para a web
por `.htaccess`, então os JSONs (e o `auth.json`) não podem ser baixados pela URL.

---

## Migração futura (sem mexer em rotas/frontend)

A lógica de dados está isolada em `api/services/JsonService.php`
(`salvar / listar / buscarPorRua / buscarPorPeriodo / editar / excluir`). Para
migrar para um banco SQL, crie outra classe com os mesmos métodos e troque a
instanciação em `api/index.php`. O frontend permanece idêntico.

---

## Frontend (offline-first)

O PWA usa a API quando o servidor responde; sem rede, opera localmente pelo
IndexedDB (`js/storage.js`) e sincroniza ao reconectar. O Service Worker
pré-cacheia o app e **nunca** cacheia `/api/` nem `/database/`.

Diferença automática: **físico − sistema** (cinza = 0, verde = sobra,
vermelho = falta). Turno automático por horário: MANHÃ 06–14h, TARDE 14–22h,
NOITE 22–06h.
