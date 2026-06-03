<?php
/* =============================================================
   api/index.php — Roteador REST (PHP) do controle de estoque
   Mapeia HTTP -> JsonService (camada de dados isolada).

   Rotas (via .htaccess, tudo cai aqui):
     POST   /api/estoque
     GET    /api/estoque
     GET    /api/estoque/rua/{rua}
     GET    /api/estoque/periodo?inicio=..&fim=..
     PUT    /api/estoque/{id}
     DELETE /api/estoque/{id}
     GET    /api/health
   ============================================================= */

declare(strict_types=1);

require __DIR__ . '/services/JsonService.php';
require __DIR__ . '/services/AuthService.php';

header('Content-Type: application/json; charset=utf-8');
// Para sessão funcionar, a origem não pode ser "*" com credenciais.
// Como o app é servido do MESMO domínio, não precisamos de CORS aberto.
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if ($origin !== '') {
    header('Access-Control-Allow-Origin: ' . $origin);
    header('Access-Control-Allow-Credentials: true');
}
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
if ($method === 'OPTIONS') {
    http_response_code(204);
    exit;
}

$auth = new AuthService();
$auth->startSession();

/* ---- resolve o "path" da rota ----
   Aceita ?route=... (via .htaccess) ou deriva de REQUEST_URI. */
$route = $_GET['route'] ?? '';
if ($route === '') {
    $uri = parse_url($_SERVER['REQUEST_URI'] ?? '', PHP_URL_PATH) ?? '';
    // remove tudo até /api/
    if (preg_match('#/api/(.*)$#', $uri, $m)) {
        $route = $m[1];
    }
}
$route = trim($route, '/');                 // ex.: "estoque/rua/L07"
$parts = $route === '' ? [] : explode('/', $route);

function body(): array
{
    $raw = file_get_contents('php://input') ?: '';
    $data = json_decode($raw, true);
    return is_array($data) ? $data : [];
}
function send($data, int $code = 200): void
{
    http_response_code($code);
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

/* ---- healthcheck (público) ---- */
if (($parts[0] ?? '') === 'health') {
    send([
        'ok'         => true,
        'ts'         => date('c'),
        'configurado'=> $auth->isConfigured(),
        'auth'       => $auth->isLoggedIn(),
    ]);
}

/* ---- estado de autenticação (público) ---- */
if (($parts[0] ?? '') === 'me') {
    send([
        'ok'          => true,
        'auth'        => $auth->isLoggedIn(),
        'configurado' => $auth->isConfigured(),
    ]);
}

/* ---- login (público) ---- */
if (($parts[0] ?? '') === 'login') {
    if ($method !== 'POST') {
        send(['ok' => false, 'erro' => 'Use POST.'], 405);
    }
    if (!$auth->isConfigured()) {
        send(['ok' => false, 'erro' => 'Senha ainda não configurada no servidor.', 'configurado' => false], 409);
    }
    $b = body();
    $senha = (string) ($b['senha'] ?? '');
    if ($auth->login($senha)) {
        send(['ok' => true, 'auth' => true]);
    }
    send(['ok' => false, 'erro' => 'Senha incorreta.', 'auth' => false], 401);
}

/* ---- logout (público; só encerra a sessão) ---- */
if (($parts[0] ?? '') === 'logout') {
    $auth->logout();
    send(['ok' => true, 'auth' => false]);
}

/* ---- somente /estoque a partir daqui ---- */
if (($parts[0] ?? '') !== 'estoque') {
    send(['ok' => false, 'erro' => 'Rota não encontrada.'], 404);
}

/* ===== PROTEÇÃO: tudo abaixo exige login =====
   Sem sessão válida, responde 401 e os dados NÃO são expostos. */
$auth->requireAuth();

try {
    $db = new JsonService();
    $sub = $parts[1] ?? null;   // null | "rua" | "periodo" | "{id}"
    $arg = $parts[2] ?? null;   // valor da rua, quando aplicável

    switch ($method) {
        case 'POST':
            $b = body();
            if (empty($b['rua']) || empty($b['produto']) || !isset($b['operador'])) {
                send(['ok' => false, 'erro' => 'Campos obrigatórios: rua, produto, operador.'], 400);
            }
            if (!isset($b['quantidadeSistema']) || !isset($b['quantidadeFisica'])) {
                send(['ok' => false, 'erro' => 'Quantidades sistema e física são obrigatórias.'], 400);
            }
            send(['ok' => true, 'registro' => $db->salvar($b)], 201);
            break;

        case 'GET':
            if ($sub === 'rua' && $arg !== null) {
                $regs = $db->buscarPorRua(urldecode($arg));
                send(['ok' => true, 'rua' => strtoupper(urldecode($arg)), 'total' => count($regs), 'registros' => $regs]);
            }
            if ($sub === 'periodo') {
                $regs = $db->buscarPorPeriodo($_GET['inicio'] ?? null, $_GET['fim'] ?? null);
                send(['ok' => true, 'total' => count($regs), 'registros' => $regs]);
            }
            // GET /estoque  -> lista tudo
            $regs = $db->listar();
            send(['ok' => true, 'total' => count($regs), 'registros' => $regs]);
            break;

        case 'PUT':
            if (!$sub) send(['ok' => false, 'erro' => 'ID obrigatório.'], 400);
            $reg = $db->editar($sub, body());
            if (!$reg) send(['ok' => false, 'erro' => 'Registro não encontrado.'], 404);
            send(['ok' => true, 'registro' => $reg]);
            break;

        case 'DELETE':
            if (!$sub) send(['ok' => false, 'erro' => 'ID obrigatório.'], 400);
            $ok = $db->excluir($sub);
            if (!$ok) send(['ok' => false, 'erro' => 'Registro não encontrado.'], 404);
            send(['ok' => true]);
            break;

        default:
            send(['ok' => false, 'erro' => 'Método não suportado.'], 405);
    }
} catch (Throwable $e) {
    error_log('[API] ' . $e->getMessage());
    send(['ok' => false, 'erro' => 'Erro interno do servidor.'], 500);
}
