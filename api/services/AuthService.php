<?php
/* =============================================================
   api/services/AuthService.php
   Autenticação simples de UM usuário (somente senha) via sessão PHP.

   - A senha é guardada como HASH bcrypt em database/auth.json
     (pasta bloqueada para a web; ninguém baixa o arquivo).
   - As sessões ficam em database/sessions/ (isoladas de outros
     projetos do mesmo domínio e persistentes).
   - Login "lembrado" por padrão: cookie de sessão com validade longa.
   ============================================================= */

declare(strict_types=1);

final class AuthService
{
    /** Caminho da pasta database (um nível acima de /api). */
    private string $dbDir;
    private string $authFile;
    private string $sessDir;

    /** Validade do login, em segundos (30 dias). */
    private const COOKIE_LIFETIME = 60 * 60 * 24 * 30;

    public function __construct()
    {
        $this->dbDir    = dirname(__DIR__, 2) . '/database';
        $this->authFile = $this->dbDir . '/auth.json';
        $this->sessDir  = $this->dbDir . '/sessions';
    }

    /* ---------------- Sessão ---------------- */

    /** Inicia a sessão com cookie isolado para a subpasta do app. */
    public function startSession(): void
    {
        if (session_status() === PHP_SESSION_ACTIVE) {
            return;
        }

        // Guarda os arquivos de sessão dentro de database/sessions
        if (!is_dir($this->sessDir)) {
            @mkdir($this->sessDir, 0775, true);
        }
        if (is_dir($this->sessDir) && is_writable($this->sessDir)) {
            session_save_path($this->sessDir);
        }

        // Caminho do cookie = pasta do app (ex.: /SaaS/controle-estoque-php/)
        $scriptDir = str_replace('\\', '/', dirname($_SERVER['SCRIPT_NAME'] ?? '/'));
        $appPath   = preg_replace('#/api$#', '', $scriptDir);
        if ($appPath === '' || $appPath === null) {
            $appPath = '/';
        }
        if (substr($appPath, -1) !== '/') {
            $appPath .= '/';
        }

        $https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
            || (($_SERVER['SERVER_PORT'] ?? '') == 443)
            || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');

        session_name('CE_SESSION');
        session_set_cookie_params([
            'lifetime' => self::COOKIE_LIFETIME,
            'path'     => $appPath,
            'httponly' => true,
            'secure'   => $https,
            'samesite' => 'Lax',
        ]);
        // Garante que o garbage collector do host não derrube cedo demais
        @ini_set('session.gc_maxlifetime', (string) self::COOKIE_LIFETIME);

        session_start();
    }

    /* ---------------- Configuração da senha ---------------- */

    /** Já existe uma senha cadastrada? */
    public function isConfigured(): bool
    {
        if (!is_file($this->authFile)) {
            return false;
        }
        $data = json_decode((string) file_get_contents($this->authFile), true);
        return is_array($data) && !empty($data['hash']);
    }

    /**
     * Define ou troca a senha.
     * Se já houver senha, exige a senha atual correta.
     * @throws RuntimeException em caso de erro de validação/escrita.
     */
    public function setPassword(string $nova, ?string $atual = null): void
    {
        $nova = trim($nova);
        if (strlen($nova) < 4) {
            throw new RuntimeException('A senha deve ter pelo menos 4 caracteres.');
        }

        if ($this->isConfigured()) {
            if ($atual === null || !$this->verify($atual)) {
                throw new RuntimeException('Senha atual incorreta.');
            }
        }

        if (!is_dir($this->dbDir)) {
            @mkdir($this->dbDir, 0775, true);
        }

        $payload = [
            'hash'      => password_hash($nova, PASSWORD_BCRYPT),
            'updatedAt' => date('c'),
        ];

        $tmp = $this->authFile . '.tmp';
        $ok  = file_put_contents(
            $tmp,
            json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT),
            LOCK_EX
        );
        if ($ok === false || !@rename($tmp, $this->authFile)) {
            @unlink($tmp);
            throw new RuntimeException('Não foi possível gravar a senha (permissão da pasta database?).');
        }
        @chmod($this->authFile, 0640);
    }

    /** Confere a senha contra o hash salvo. */
    public function verify(string $senha): bool
    {
        if (!$this->isConfigured()) {
            return false;
        }
        $data = json_decode((string) file_get_contents($this->authFile), true);
        $hash = $data['hash'] ?? '';
        return is_string($hash) && $hash !== '' && password_verify($senha, $hash);
    }

    /* ---------------- Login / Logout / Estado ---------------- */

    /** Tenta logar; em sucesso marca a sessão como autenticada. */
    public function login(string $senha): bool
    {
        if ($this->verify($senha)) {
            session_regenerate_id(true);   // evita fixation
            $_SESSION['auth'] = true;
            $_SESSION['ts']   = time();
            return true;
        }
        // pequeno atraso para dificultar força bruta
        usleep(400000); // 0,4s
        return false;
    }

    public function logout(): void
    {
        $_SESSION = [];
        if (ini_get('session.use_cookies')) {
            $p = session_get_cookie_params();
            setcookie(session_name(), '', [
                'expires'  => time() - 42000,
                'path'     => $p['path'],
                'httponly' => true,
                'secure'   => $p['secure'] ?? false,
                'samesite' => 'Lax',
            ]);
        }
        session_destroy();
    }

    public function isLoggedIn(): bool
    {
        return !empty($_SESSION['auth']);
    }

    /** Encerra a requisição com 401 se não estiver logado. */
    public function requireAuth(): void
    {
        if (!$this->isLoggedIn()) {
            http_response_code(401);
            echo json_encode(
                ['ok' => false, 'erro' => 'Não autenticado.', 'auth' => false],
                JSON_UNESCAPED_UNICODE
            );
            exit;
        }
    }
}
