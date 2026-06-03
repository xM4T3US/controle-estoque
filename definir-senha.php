<?php
/* =============================================================
   definir-senha.php — Página de configuração da senha de acesso.

   USE UMA VEZ para criar (ou trocar) a senha do Controle de Estoque
   e DEPOIS APAGUE este arquivo do servidor.

   - Na primeira vez não pede senha atual.
   - Se já existir senha, exige a senha atual para trocar.
   ============================================================= */

declare(strict_types=1);
require __DIR__ . '/api/services/AuthService.php';

$auth = new AuthService();
$jaConfig = $auth->isConfigured();

$msg = null;
$erro = null;

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'POST') {
    $nova  = (string) ($_POST['nova'] ?? '');
    $conf  = (string) ($_POST['confirma'] ?? '');
    $atual = isset($_POST['atual']) ? (string) $_POST['atual'] : null;

    if ($nova !== $conf) {
        $erro = 'A confirmação não confere com a nova senha.';
    } else {
        try {
            $auth->setPassword($nova, $atual);
            $msg = 'Senha definida com sucesso! Agora APAGUE este arquivo (definir-senha.php) do servidor e acesse o app normalmente.';
            $jaConfig = true;
        } catch (Throwable $e) {
            $erro = $e->getMessage();
        }
    }
}
?>
<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Definir senha — Controle de Estoque</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body {
    margin: 0; min-height: 100vh; display: grid; place-items: center;
    background: #161b22; color: #e6edf3;
    font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
    padding: 20px;
  }
  .card {
    width: 100%; max-width: 420px; background: #1c2230;
    border: 1px solid #2b3447; border-radius: 16px; padding: 26px;
    box-shadow: 0 12px 40px rgba(0,0,0,.4);
  }
  h1 { font-size: 1.2rem; margin: 0 0 4px; }
  p.sub { margin: 0 0 18px; color: #93a1b5; font-size: .9rem; }
  label { display: block; font-size: .85rem; margin: 14px 0 6px; color: #c4d0df; }
  input {
    width: 100%; padding: 12px 14px; border-radius: 10px;
    border: 1px solid #2b3447; background: #11151d; color: #e6edf3;
    font-size: 1rem;
  }
  button {
    width: 100%; margin-top: 20px; padding: 13px; border: 0;
    border-radius: 10px; background: #2f81f7; color: #fff;
    font-size: 1rem; font-weight: 600; cursor: pointer;
  }
  button:hover { background: #1f6feb; }
  .msg { background: #10331f; border: 1px solid #1f7a44; color: #7ee2a8;
         padding: 12px 14px; border-radius: 10px; margin-bottom: 16px; font-size: .9rem; }
  .erro { background: #3a1418; border: 1px solid #a23b45; color: #ff9aa2;
          padding: 12px 14px; border-radius: 10px; margin-bottom: 16px; font-size: .9rem; }
  .warn { margin-top: 18px; font-size: .8rem; color: #d6a23b; line-height: 1.4; }
</style>
</head>
<body>
  <div class="card">
    <h1>🔒 Definir senha de acesso</h1>
    <p class="sub">Controle de Estoque — MJ Tech</p>

    <?php if ($msg): ?>
      <div class="msg"><?= htmlspecialchars($msg) ?></div>
    <?php endif; ?>
    <?php if ($erro): ?>
      <div class="erro"><?= htmlspecialchars($erro) ?></div>
    <?php endif; ?>

    <form method="post" autocomplete="off">
      <?php if ($jaConfig && !$msg): ?>
        <label for="atual">Senha atual</label>
        <input type="password" id="atual" name="atual" required>
      <?php endif; ?>

      <label for="nova">Nova senha</label>
      <input type="password" id="nova" name="nova" minlength="4" required>

      <label for="confirma">Confirmar nova senha</label>
      <input type="password" id="confirma" name="confirma" minlength="4" required>

      <button type="submit"><?= $jaConfig && !$msg ? 'Trocar senha' : 'Definir senha' ?></button>
    </form>

    <p class="warn">⚠️ Por segurança, <strong>apague este arquivo</strong> do servidor depois de definir a senha.</p>
  </div>
</body>
</html>
