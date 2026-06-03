<?php
/* =============================================================
   JsonService.php — Camada de persistência (arquivos JSON)

   Porte fiel do jsonService.js (Node) para PHP 8.2. TODA a lógica
   de acesso a dados fica isolada aqui. Para migrar futuramente para
   PostgreSQL / MySQL / MongoDB, basta criar outra classe com os
   MESMOS métodos públicos — as rotas e o frontend não mudam:

     salvar(array $dados): array
     listar(): array
     buscarPorRua(string $rua): array
     buscarPorPeriodo(?string $ini, ?string $fim): array
     editar(string $id, array $dados): ?array
     excluir(string $id): bool

   Organização em disco:
     /database/AAAA/MM/AAAA-MM-DD_TURNO.json
     /database/backups/backup_AAAA-MM-DD_HHmmss.json
     /database/logs/auditoria.json
   ============================================================= */

declare(strict_types=1);

class JsonService
{
    private string $dbDir;
    private string $backupDir;
    private string $logDir;
    private string $auditFile;

    public function __construct(?string $baseDir = null)
    {
        // /api/services -> raiz do projeto -> /database
        $root = $baseDir ?? dirname(__DIR__, 2);
        $this->dbDir     = $root . '/database';
        $this->backupDir = $this->dbDir . '/backups';
        $this->logDir    = $this->dbDir . '/logs';
        $this->auditFile = $this->logDir . '/auditoria.json';
        $this->init();
    }

    /* ---------------- infraestrutura ---------------- */
    private function init(): void
    {
        foreach ([$this->dbDir, $this->backupDir, $this->logDir] as $d) {
            if (!is_dir($d)) {
                @mkdir($d, 0775, true);
            }
        }
        if (!file_exists($this->auditFile)) {
            $this->writeJsonAtomic($this->auditFile, []);
        }
    }

    /* ---------------- utilitários de data/turno ---------------- */
    private function isoDate(?int $ts = null): string
    {
        return date('Y-m-d', $ts ?? time());
    }
    private function isoDateTime(?int $ts = null): string
    {
        return date('Y-m-d\TH:i:s', $ts ?? time());
    }
    public function getTurno(?int $ts = null): string
    {
        $h = (int) date('G', $ts ?? time());
        if ($h >= 6 && $h < 14) return 'MANHA';
        if ($h >= 14 && $h < 22) return 'TARDE';
        return 'NOITE';
    }

    /* caminho do arquivo: /database/AAAA/MM/AAAA-MM-DD_TURNO.json */
    private function arquivoDoTurno(string $dataISO, string $turno): string
    {
        [$ano, $mes] = explode('-', $dataISO);
        return $this->dbDir . "/$ano/$mes/{$dataISO}_{$turno}.json";
    }

    /* ---------------- escrita atômica + lock ---------------- */
    private function writeJsonAtomic(string $filePath, mixed $data): void
    {
        $dir = dirname($filePath);
        if (!is_dir($dir)) {
            @mkdir($dir, 0775, true);
        }
        $tmp = $filePath . '.' . getmypid() . '.' . uniqid('', true) . '.tmp';
        $json = json_encode(
            $data,
            JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES
        );
        file_put_contents($tmp, $json, LOCK_EX);
        rename($tmp, $filePath); // rename é atômico no mesmo filesystem
    }

    /* executa $task com lock exclusivo do arquivo (evita escrita concorrente) */
    private function withLock(string $filePath, callable $task): mixed
    {
        $dir = dirname($filePath);
        if (!is_dir($dir)) {
            @mkdir($dir, 0775, true);
        }
        $lockPath = $filePath . '.lock';
        $fp = fopen($lockPath, 'c');
        if ($fp === false) {
            // sem lock disponível: executa mesmo assim
            return $task();
        }
        try {
            flock($fp, LOCK_EX);
            return $task();
        } finally {
            flock($fp, LOCK_UN);
            fclose($fp);
            @unlink($lockPath);
        }
    }

    private function lerArquivo(string $filePath): ?array
    {
        if (!file_exists($filePath)) return null;
        $txt = file_get_contents($filePath);
        if ($txt === false || $txt === '') return null;
        $data = json_decode($txt, true);
        return is_array($data) ? $data : null;
    }

    /* lista todos os AAAA-MM-DD_TURNO.json sob /database/AAAA/MM */
    private function listarArquivosDeDados(): array
    {
        $out = [];
        if (!is_dir($this->dbDir)) return $out;
        foreach (scandir($this->dbDir) ?: [] as $ano) {
            if (!preg_match('/^\d{4}$/', $ano)) continue;
            $anoDir = "{$this->dbDir}/$ano";
            if (!is_dir($anoDir)) continue;
            foreach (scandir($anoDir) ?: [] as $mes) {
                if (!preg_match('/^\d{2}$/', $mes)) continue;
                $mesDir = "$anoDir/$mes";
                if (!is_dir($mesDir)) continue;
                foreach (scandir($mesDir) ?: [] as $f) {
                    if (str_ends_with($f, '.json')) {
                        $out[] = "$mesDir/$f";
                    }
                }
            }
        }
        return $out;
    }

    /* ---------------- backup + auditoria ---------------- */
    private function backupArquivo(mixed $data): void
    {
        $stamp = date('Y-m-d_His');
        $this->writeJsonAtomic("{$this->backupDir}/backup_{$stamp}.json", $data);
    }

    private function registrarAuditoria(string $acao, string $registroId, ?string $operador): void
    {
        $this->withLock($this->auditFile, function () use ($acao, $registroId, $operador) {
            $log = $this->lerArquivo($this->auditFile) ?? [];
            $log[] = [
                'dataHora'   => $this->isoDateTime(),
                'acao'       => $acao, // CRIAR | EDITAR | EXCLUIR
                'registroId' => $registroId,
                'operador'   => $operador,
            ];
            $this->writeJsonAtomic($this->auditFile, $log);
        });
    }

    private function uuid(): string
    {
        $d = random_bytes(16);
        $d[6] = chr((ord($d[6]) & 0x0f) | 0x40); // versão 4
        $d[8] = chr((ord($d[8]) & 0x3f) | 0x80); // variante
        return vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex($d), 4));
    }

    private function normalizarRegistro(array $r): array
    {
        $sistema = (int) ($r['quantidadeSistema'] ?? 0);
        $fisico  = (int) ($r['quantidadeFisica'] ?? 0);
        $diff = $fisico - $sistema;
        $obs = trim((string) ($r['observacao'] ?? ''));
        return [
            'id'                => $r['id'] ?? $this->uuid(),
            'rua'               => strtoupper(trim((string) ($r['rua'] ?? ''))),
            'produto'           => trim((string) ($r['produto'] ?? '')),
            'quantidadeSistema' => $sistema,
            'quantidadeFisica'  => $fisico,
            'diferenca'         => $diff,
            'operador'          => trim((string) ($r['operador'] ?? '')),
            'observacao'        => $diff !== 0 ? $obs : '',
            'dataHora'          => $r['dataHora'] ?? $this->isoDateTime(),
        ];
    }

    /* ---------------- API pública ---------------- */

    public function salvar(array $dados): array
    {
        $dataISO = $dados['data']  ?? $this->isoDate();
        $turno   = $dados['turno'] ?? $this->getTurno();
        $lider   = $dados['lider'] ?? 'lider/supervisor';
        $filePath = $this->arquivoDoTurno($dataISO, $turno);
        $registro = $this->normalizarRegistro($dados);

        $this->withLock($filePath, function () use ($filePath, $dataISO, $turno, $lider, $registro) {
            $arquivo = $this->lerArquivo($filePath);
            if ($arquivo === null) {
                $arquivo = [
                    'data' => $dataISO, 'turno' => $turno, 'lider' => $lider,
                    'ultimaAtualizacao' => '', 'registros' => [],
                ];
            }
            $arquivo['registros'][] = $registro;
            $arquivo['ultimaAtualizacao'] = $this->isoDateTime();
            $arquivo['lider'] = $lider;
            $this->writeJsonAtomic($filePath, $arquivo);
            $this->backupArquivo($arquivo);
        });

        $this->registrarAuditoria('CRIAR', $registro['id'], $registro['operador']);
        return array_merge($registro, ['data' => $dataISO, 'turno' => $turno, 'lider' => $lider]);
    }

    public function listar(): array
    {
        $todos = [];
        foreach ($this->listarArquivosDeDados() as $fp) {
            $arq = $this->lerArquivo($fp);
            if ($arq && !empty($arq['registros'])) {
                foreach ($arq['registros'] as $r) {
                    $todos[] = array_merge($r, [
                        'data' => $arq['data'] ?? null,
                        'turno' => $arq['turno'] ?? null,
                        'lider' => $arq['lider'] ?? null,
                    ]);
                }
            }
        }
        usort($todos, fn($a, $b) => strcmp($b['dataHora'] ?? '', $a['dataHora'] ?? ''));
        return $todos;
    }

    public function buscarPorRua(string $rua): array
    {
        $alvo = strtoupper(trim($rua));
        return array_values(array_filter($this->listar(), fn($r) => ($r['rua'] ?? '') === $alvo));
    }

    public function buscarPorPeriodo(?string $inicio, ?string $fim): array
    {
        return array_values(array_filter($this->listar(), function ($r) use ($inicio, $fim) {
            $d = $r['data'] ?? '';
            if ($inicio && $d < $inicio) return false;
            if ($fim && $d > $fim) return false;
            return true;
        }));
    }

    private function localizar(string $id): ?array
    {
        foreach ($this->listarArquivosDeDados() as $fp) {
            $arq = $this->lerArquivo($fp);
            if ($arq && !empty($arq['registros'])) {
                foreach ($arq['registros'] as $i => $r) {
                    if (($r['id'] ?? null) === $id) {
                        return ['filePath' => $fp, 'arquivo' => $arq, 'idx' => $i];
                    }
                }
            }
        }
        return null;
    }

    public function editar(string $id, array $dados): ?array
    {
        $loc = $this->localizar($id);
        if ($loc === null) return null;

        $salvo = null;
        $this->withLock($loc['filePath'], function () use (&$salvo, $loc, $id, $dados) {
            $arq = $this->lerArquivo($loc['filePath']) ?? $loc['arquivo'];
            $idx = null;
            foreach ($arq['registros'] as $i => $r) {
                if (($r['id'] ?? null) === $id) { $idx = $i; break; }
            }
            if ($idx === null) return;
            $atual = $arq['registros'][$idx];
            $merged = $this->normalizarRegistro(array_merge($atual, $dados, [
                'id' => $id,                       // id imutável
                'dataHora' => $atual['dataHora'],  // preserva criação
            ]));
            $arq['registros'][$idx] = $merged;
            $arq['ultimaAtualizacao'] = $this->isoDateTime();
            $this->writeJsonAtomic($loc['filePath'], $arq);
            $this->backupArquivo($arq);
            $salvo = array_merge($merged, [
                'data' => $arq['data'] ?? null,
                'turno' => $arq['turno'] ?? null,
                'lider' => $arq['lider'] ?? null,
            ]);
        });

        if ($salvo) $this->registrarAuditoria('EDITAR', $id, $salvo['operador'] ?? null);
        return $salvo;
    }

    public function excluir(string $id): bool
    {
        $loc = $this->localizar($id);
        if ($loc === null) return false;

        $ok = false;
        $operador = null;
        $this->withLock($loc['filePath'], function () use (&$ok, &$operador, $loc, $id) {
            $arq = $this->lerArquivo($loc['filePath']) ?? $loc['arquivo'];
            $idx = null;
            foreach ($arq['registros'] as $i => $r) {
                if (($r['id'] ?? null) === $id) { $idx = $i; break; }
            }
            if ($idx === null) return;
            $operador = $arq['registros'][$idx]['operador'] ?? null;
            array_splice($arq['registros'], $idx, 1);
            $arq['ultimaAtualizacao'] = $this->isoDateTime();
            $this->writeJsonAtomic($loc['filePath'], $arq);
            $this->backupArquivo($arq);
            $ok = true;
        });

        if ($ok) $this->registrarAuditoria('EXCLUIR', $id, $operador);
        return $ok;
    }
}
