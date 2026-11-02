# Revisão v2 das migrations (a partir de fslobo-app-backend-proposta.zip)

Nada foi aplicado em banco algum. Trabalho restrito a `supabase-app/`.

> Observação: não tive acesso ao texto da auditoria; parti dos quatro pontos do pedido
> (proteção do conteúdo publicado, comentário do teto, expiração de tentativas, limite diário)
> e fiz uma revisão própria de segurança. Se a auditoria apontou algo além disto, me envie.

## 0001
- `study_attempt_status` ganhou `expired`.
- Nova tabela `study_settings` (limites e prazo ajustáveis, chaves e faixas validadas por CHECK) e
  função interna `study__setting`.
- `REVOKE ALL` também de `service_role` antes do GRANT (tira `TRUNCATE/TRIGGER/REFERENCES`).

## 0002
- Guard da questão reescrito: bloqueia **todos** os campos de conteúdo e auditoria depois de publicada;
  INSERT só como rascunho; publicar por UPDATE direto valida 2–5 alternativas, gabarito e explicação;
  só arquiva a partir de publicada.
- Guard das alternativas/gabarito/explicação: proíbe mover entre questões e usa `FOR SHARE` na questão
  (fecha corrida com a publicação).
- `TRUNCATE` bloqueado nas tabelas de conteúdo.

## 0003
- `last_activity_at` e índice de varredura em `study_attempts`.
- Comentário do teto de pontos corrigido: `10 x Q + 20 x floor(Q/3)` (antes "30 x nº de questões").
- Respostas e livro-razão **append-only** (UPDATE/DELETE diretos e TRUNCATE bloqueados; cascata LGPD preservada).

## 0004
- Mesma regra de pontos (10 por questão na 1ª vez, bônus 20 com ≥ 3 novas; livre = 0). Lógica
  extraída para `study__complete_attempt_row` para ser usada também na expiração.
- Expiração/retomada: prazo de 7 dias; `resumable` e `expires_at` no payload; `attempt_expired`;
  conclusão automática quando tudo já estava respondido; `study_expire_stale_attempts()` (service_role).
- Limites: 20 tentativas novas/dia + 200 questões/dia (antes 30 tentativas); tentativa menor quando
  o saldo é menor; `detail` do erro; saldos em `study_my_progress`.
- Cabeçalho do arquivo reescrito (ciclo de vida, limites, teto).

## Testes
- `run-local.mjs`: 167 → 247 verificações.
- `run-concurrency.mjs`: 19 → 27 verificações (novos: limite de questões, início sobre vencida,
  varreduras simultâneas, publicar x apagar); mutação confirma que as travas são necessárias.
