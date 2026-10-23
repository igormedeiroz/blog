# Starter: estatísticas de treino com Cloudflare Workers + D1

## Aviso importante sobre acesso público
A versão pedida não tem login. **Qualquer pessoa que descubra o URL da API pode criar, editar e apagar os registos.** CORS não é autenticação. Usa esta versão apenas para testes/dados não sensíveis; antes de registar dados reais, protege a API com Cloudflare Access ou autenticação e considera limites de pedidos.

## 1. Criar D1
Instala o Wrangler e autentica:
```bash
npm install -g wrangler
wrangler login
cd worker
wrangler d1 create treino-db
```
Copia o `database_id` para `wrangler.toml`, substituindo `SUBSTITUIR_PELO_ID_DA_D1`.
Aplica o esquema:
```bash
wrangler d1 execute treino-db --remote --file=./schema.sql
```

## 2. Deploy da API
Na pasta `worker`:
```bash
wrangler deploy
```
Testa `https://TEU-WORKER.workers.dev/api/health`.

## 3. Integrar o frontend
Abre `frontend/treino-widget.html` e substitui `https://SUBSTITUIR-PELO-TEU-WORKER.workers.dev` pelo URL real do Worker. Integra o HTML, CSS e JS na página do teu site. Alguns CMS bloqueiam scripts inline; nesse caso, aloja o JavaScript num ficheiro `.js` e inclui-o através de `<script src="..."></script>`.

O botão “Carregar plano” consulta `https://gym.igormedeiroz.workers.dev/api/treinos`. O código tenta reconhecer campos comuns como `Exercício`, `exercicio`, `exercise` ou `name`; se a resposta real tiver outro formato, adapta esse mapeamento.

## Endpoints
- `GET /api/health`
- `GET /api/sessoes?from=YYYY-MM-DD&to=YYYY-MM-DD&type=dança&limit=100`
- `GET /api/sessoes/:id`
- `POST /api/sessoes`
- `PUT /api/sessoes/:id`
- `DELETE /api/sessoes/:id`
- `GET /api/estatisticas?from=YYYY-MM-DD&to=YYYY-MM-DD`

Exemplo de `POST /api/sessoes`:
```json
{
  "activity_type":"ginásio",
  "session_date":"2026-10-14",
  "start_time":"18:00",
  "end_time":"19:15",
  "duration_minutes":75,
  "intensity":"moderada",
  "distance_km":null,
  "notes":"Peito e tríceps",
  "exercises":[{"name":"Supino reto","sets":3,"reps":"8","weight_kg":60,"effort_rir":2}]
}
```

## Notas
- A duração é guardada em minutos. Início/fim preenchem a duração automaticamente no frontend.
- Estatísticas agregam duração, número de sessões e dias ativos, incluindo o tempo de descanso dentro da sessão.
- As operações de escrita e leitura não são transacionais nesta versão inicial.
- `ALLOWED_ORIGIN = "*"` facilita testes. Depois define o domínio exato do site, mas lembra que CORS não impede chamadas fora do browser.
