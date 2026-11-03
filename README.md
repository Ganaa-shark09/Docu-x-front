# DOCU-X Platform AI Administration — V3

**Purpose:** Remove the operational need for Django Admin to configure AI provider credentials and company model access. Platform superusers can do it within DOCU-X. Company administrators still manage their default model on the existing Company AI Models page; end users still choose granted models in Internal AI.

## Install backend first

Copy `DOCUX-Platform-AI-Administration-V3.zip` into `Docu_X-back`, then:

```bash
python -m zipfile -e DOCUX-Platform-AI-Administration-V3.zip .
python install-docux-platform-ai-v3.py --target backend --diff
python install-docux-platform-ai-v3.py --target backend --apply
python install-docux-platform-ai-v3.py --target backend --verify
docker compose -f docker-compose.local.yml exec -T django python manage.py check
docker compose -f docker-compose.local.yml exec -T django python manage.py makemigrations --check --dry-run
docker compose -f docker-compose.local.yml exec -T django python -m pytest -q apps/ai_engine/tests/test_platform_ai_administration.py
```

No new migration is required: V3 uses `LLMProviderConfig`, `CompanyModelGrant`, and `Company` from the installed backend V2 migration. All new endpoints require an authenticated **active Django superuser**. They do not depend on `request.user.company` and never return the encrypted key or plaintext key. Configured secrets are encrypted via `LLMProviderConfig.set_api_key`.

## Install frontend second

Copy the **same ZIP** into `Docu_X-front`, then:

```bash
python -m zipfile -e DOCUX-Platform-AI-Administration-V3.zip .
python install-docux-platform-ai-v3.py --target frontend --diff
python install-docux-platform-ai-v3.py --target frontend --apply
python install-docux-platform-ai-v3.py --target frontend --verify
npx ng build
```

Route: **`/administration/platform/ai-models`** (visible in Administration only to Django superusers). Existing `/administration/company/ai-models` remains the company default / member catalog page.

## API endpoints (superuser only)

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/ai/platform/companies/` | Paginated company listing with routing flags |
| PATCH | `/api/ai/platform/companies/{uuid}/` | Allow cloud/local AI for company |
| GET | `/api/ai/platform/providers/?company={uuid}` | Company-owned provider configurations; only `has_api_key`, never key material |
| POST | `/api/ai/platform/providers/` | Create provider config and encrypt supplied `api_key` |
| PATCH | `/api/ai/platform/providers/{uuid}/` | Update provider, rotate key, disable connection |
| GET | `/api/ai/company-models/?company={uuid}` | Existing superuser grant catalog |
| POST/PATCH | `/api/ai/company-models/` | Existing superuser grant / enable / disable APIs |

Provider type and owner are immutable after creation. API keys are write-only; leaving the field blank when editing preserves the previous key. The optional `DOCUX_OLLAMA_ALLOWED_HOSTS` environment variable controls the allowlist of server-side Ollama endpoints (default `ollama,localhost,127.0.0.1`). Groq, Gemini, Anthropic, and OpenAI use fixed official endpoints rather than user-supplied destination URLs. Azure requires HTTPS + deployment identifier. All cloud providers require credentials before activation.

## Suggested first use

1. Login to DOCU-X as a **platform superuser** and open **Administration → Platform AI governance**.
2. Select a company. Set cloud/local AI routing policy and save.
3. Add a Groq provider named `Groq production`, model `openai/gpt-oss-120b`, and paste its API key (write-only password field).
4. Create a model grant for that company by selecting the Groq connection, model ID `openai/gpt-oss-120b`, and display name `GPT OSS 120B`.
5. Login as that company's administrator to select its default under **Administration → AI models**. Company users can select the same model in **Internal AI**.
6. Verify an actual response with an authorized non-sensitive test prompt. The DOCU-X data firewall still determines whether documents can be sent to cloud AI.

## Scope & validation

- Frontend: Angular TS/strict template and Sass compilers passed in reconstructed fixture. Full build on the current branch remains a local verification step.
- Backend: Python syntax compilation passed; integration tests are bundled but need Docker to run (Django is not installed in this artifact environment).
- No database migration and no credential values packaged.
- Changes are guarded by exact V2 backend + V2.1 frontend source hashes. If any current source differs, installer aborts instead of overwriting it. A `--diff` preview is required before applying. Installer backups go to the system temp folder outside Git.
- Existing specialized HR Q&A, external chat, and workflow model routes are **not** changed by this patch. Only the existing Internal AI governance pathway is used for response selection.
- For a production rollout, verify network egress policy, configured encryption keys, actual provider availability, and persistent audit event integration. Current code emits key-free structured server log entries for provider/policy changes; it does not yet create dedicated persistent audit-event rows.
