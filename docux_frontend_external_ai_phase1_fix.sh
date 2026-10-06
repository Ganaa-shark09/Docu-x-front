#!/usr/bin/env bash
set -euo pipefail

MODEL="src/app/features/ai-chat/models/ai-chat.model.ts"
COMPONENT="src/app/features/ai-chat/pages/external-ai-chat-page/external-ai-chat-page.component.ts"

for path in "$MODEL" "$COMPONENT"; do
  if [[ ! -f "$path" ]]; then
    echo "ERROR: $path not found. Run this script from the Docu_X-front repository root." >&2
    exit 1
  fi
done

STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP_DIR=".docux-backups/external-ai-phase1-$STAMP"
mkdir -p "$BACKUP_DIR/$(dirname "$MODEL")" "$BACKUP_DIR/$(dirname "$COMPONENT")"
cp "$MODEL" "$BACKUP_DIR/$MODEL"
cp "$COMPONENT" "$BACKUP_DIR/$COMPONENT"
echo "Backup created at: $BACKUP_DIR"

python - <<'PY'
from pathlib import Path

MODEL = Path("src/app/features/ai-chat/models/ai-chat.model.ts")
COMPONENT = Path("src/app/features/ai-chat/pages/external-ai-chat-page/external-ai-chat-page.component.ts")


def read(path: Path):
    raw = path.read_bytes()
    newline = "\r\n" if b"\r\n" in raw else "\n"
    return raw.decode("utf-8").replace("\r\n", "\n"), newline


def write(path: Path, text: str, newline: str):
    text = text.replace("\r\n", "\n")
    if newline == "\r\n":
        text = text.replace("\n", "\r\n")
    path.write_bytes(text.encode("utf-8"))


def replace_once(text: str, old: str, new: str, label: str):
    if old not in text:
        raise SystemExit(f"Patch anchor not found: {label}")
    return text.replace(old, new, 1)

# ---------------------------------------------------------------------
# 1) Request contract: explicitly tell backend whether docs were selected.
# ---------------------------------------------------------------------
s, nl = read(MODEL)
if "document_scope_mode?: 'selected' | 'conversation';" not in s:
    old = """export interface ExternalAiChatRequest {\n  message: string;\n  conversation_uuid?: string;\n  use_web: boolean;\n  top_k?: number;\n  document_uuids?: string[];\n}\n"""
    new = """export interface ExternalAiChatRequest {\n  message: string;\n  conversation_uuid?: string;\n  use_web: boolean;\n  top_k?: number;\n  document_uuids?: string[];\n  document_scope_mode?: 'selected' | 'conversation';\n}\n"""
    s = replace_once(s, old, new, "ExternalAiChatRequest")
write(MODEL, s, nl)

# ---------------------------------------------------------------------
# 2) External AI component fixes.
# ---------------------------------------------------------------------
s, nl = read(COMPONENT)

# Preserve the scope mode while waiting for document processing.
if "scopeMode: 'selected' | 'conversation';" not in s:
    old = """  private pendingRealtimeSend: {\n    message: string;\n    scopeUuids: string[];\n    waitUuids: string[];\n  } | null = null;\n"""
    new = """  private pendingRealtimeSend: {\n    message: string;\n    scopeUuids: string[];\n    waitUuids: string[];\n    scopeMode: 'selected' | 'conversation';\n  } | null = null;\n"""
    s = replace_once(s, old, new, "pendingRealtimeSend type")

# Current-message uploads are explicit attachments. Do not silently widen the
# query to every old document in the conversation.
old = """          const queryDocumentUuids =\n            this.resolveExternalDocumentUuids(\n              uploadedDocumentUuids,\n            );\n"""
new = """          const selectedExistingDocumentUuids =\n            this.normalizeExternalDocumentUuids(\n              Array.from(this.selectedExternalDocumentUuids),\n            );\n\n          const queryDocumentUuids =\n            this.normalizeExternalDocumentUuids([\n              ...selectedExistingDocumentUuids,\n              ...uploadedDocumentUuids,\n            ]);\n\n          // Files attached to the current prompt are an explicit document scope.\n          const queryDocumentScopeMode: 'selected' = 'selected';\n"""
if "const queryDocumentScopeMode: 'selected' = 'selected';" not in s:
    s = replace_once(s, old, new, "upload query document scope")

# Upload waiting path must preserve the explicit selected scope.
old = """              this.queueRealtimeSend(\n                message,\n                queryDocumentUuids,\n                pendingDocumentUuids,\n              );\n"""
new = """              this.queueRealtimeSend(\n                message,\n                queryDocumentUuids,\n                pendingDocumentUuids,\n                queryDocumentScopeMode,\n              );\n"""
if new not in s:
    s = replace_once(s, old, new, "upload queueRealtimeSend call")

old = """            this.sendExternalMessage(\n              message,\n              queryDocumentUuids,\n            );\n"""
new = """            this.sendExternalMessage(\n              message,\n              queryDocumentUuids,\n              queryDocumentScopeMode,\n            );\n"""
if new not in s:
    s = replace_once(s, old, new, "upload sendExternalMessage call")

# Extend sendExternalMessage so it always sends the selected/conversation hint.
old = """  private sendExternalMessage(\n    message: string,\n    explicitDocumentUuids?: string[],\n  ): void {\n"""
new = """  private sendExternalMessage(\n    message: string,\n    explicitDocumentUuids?: string[],\n    explicitScopeMode?: 'selected' | 'conversation',\n  ): void {\n"""
if new not in s:
    s = replace_once(s, old, new, "sendExternalMessage signature")

anchor = """    const effectiveDocumentUuids =\n      explicitDocumentUuids !== undefined\n        ? this.normalizeExternalDocumentUuids(\n            explicitDocumentUuids,\n          )\n        : this.resolveExternalDocumentUuids();\n\n    const payload: ExternalAiChatRequest = {\n"""
replacement = """    const effectiveDocumentUuids =\n      explicitDocumentUuids !== undefined\n        ? this.normalizeExternalDocumentUuids(\n            explicitDocumentUuids,\n          )\n        : this.resolveExternalDocumentUuids();\n\n    const documentScopeMode: 'selected' | 'conversation' =\n      explicitScopeMode ??\n      (this.selectedExternalDocumentUuids.size > 0\n        ? 'selected'\n        : 'conversation');\n\n    const payload: ExternalAiChatRequest = {\n"""
if "const documentScopeMode: 'selected' | 'conversation' =" not in s:
    s = replace_once(s, anchor, replacement, "documentScopeMode calculation")

old = """      document_uuids:\n        effectiveDocumentUuids,\n    };\n"""
new = """      document_uuids:\n        effectiveDocumentUuids,\n      document_scope_mode: documentScopeMode,\n    };\n"""
if "document_scope_mode: documentScopeMode" not in s:
    s = replace_once(s, old, new, "payload document_scope_mode")

old = """        document_uuids:\n          payload.document_uuids,\n        message:\n          payload.message,\n"""
new = """        document_uuids:\n          payload.document_uuids,\n        document_scope_mode:\n          payload.document_scope_mode,\n        message:\n          payload.message,\n"""
if "payload.document_scope_mode" not in s:
    s = replace_once(s, old, new, "scope debug output")

# Backend 202 path: preserve scope mode while waiting.
old = """              this.queueRealtimeSend(\n                message,\n                effectiveDocumentUuids,\n                uuidsToPoll,\n              );\n"""
new = """              this.queueRealtimeSend(\n                message,\n                effectiveDocumentUuids,\n                uuidsToPoll,\n                documentScopeMode,\n              );\n"""
if new not in s:
    s = replace_once(s, old, new, "202 queueRealtimeSend call")

# Queue stores the frozen mode too.
old = """  private queueRealtimeSend(\n    message: string,\n    scopeUuids: string[],\n    waitUuids: string[],\n  ): void {\n"""
new = """  private queueRealtimeSend(\n    message: string,\n    scopeUuids: string[],\n    waitUuids: string[],\n    scopeMode: 'selected' | 'conversation',\n  ): void {\n"""
if new not in s:
    s = replace_once(s, old, new, "queueRealtimeSend signature")

old = """      waitUuids:\n        this.normalizeExternalDocumentUuids(\n          waitUuids,\n        ),\n    };\n"""
new = """      waitUuids:\n        this.normalizeExternalDocumentUuids(\n          waitUuids,\n        ),\n      scopeMode,\n    };\n"""
if "      scopeMode,\n    };" not in s:
    s = replace_once(s, old, new, "queue scopeMode storage")

# Realtime success must resend with the same scope mode.
old = """    const scopeUuids =\n      [...pending.scopeUuids];\n\n    this.clearPendingRealtimeSend();\n\n    /*\n     * Now send the original query with the\n     * exact frozen UUID scope.\n     */\n    this.sendExternalMessage(\n      message,\n      scopeUuids,\n    );\n"""
new = """    const scopeUuids =\n      [...pending.scopeUuids];\n\n    const scopeMode =\n      pending.scopeMode;\n\n    this.clearPendingRealtimeSend();\n\n    /*\n     * Now send the original query with the\n     * exact frozen UUID scope and scope mode.\n     */\n    this.sendExternalMessage(\n      message,\n      scopeUuids,\n      scopeMode,\n    );\n"""
if "const scopeMode =\n      pending.scopeMode;" not in s:
    s = replace_once(s, old, new, "realtime resend scope mode")

# Replace the websocket-only fallback with HTTP status recovery. This fixes the
# case where upload succeeds but the ready event is missed / websocket is stale.
old = """    this.realtimeFallbackHandle =\n      window.setTimeout(() => {\n        this.realtimeFallbackHandle = null;\n\n        const pending =\n          this.pendingRealtimeSend;\n\n        if (!pending) {\n          return;\n        }\n\n        /*\n         * Do NOT fall back to continuous HTTP status polling.\n         *\n         * Re-subscription causes the backend to send a fresh\n         * document.processing.snapshot from authoritative DB state.\n         */\n        if (this.documentRealtimeService.isConnected) {\n          console.debug(\n            '[DocuX realtime] Re-subscribing pending documents:',\n            pending.waitUuids,\n          );\n        } else {\n          console.warn(\n            '[DocuX realtime] Socket is not ready. Reconnecting:',\n            pending.waitUuids,\n          );\n        }\n\n        this.subscribeRealtimeDocuments(\n          pending.waitUuids,\n        );\n      }, 12000);\n"""
new = """    this.realtimeFallbackHandle =\n      window.setTimeout(() => {\n        this.realtimeFallbackHandle = null;\n\n        const pending =\n          this.pendingRealtimeSend;\n\n        if (!pending) {\n          return;\n        }\n\n        console.warn(\n          '[DocuX realtime] No decisive ready event received; using processing-status fallback.',\n          pending.waitUuids,\n        );\n\n        this.startDocumentPolling(\n          pending.waitUuids,\n          () => {\n            if (this.pendingRealtimeSend !== pending) {\n              return;\n            }\n\n            const message = pending.message;\n            const scopeUuids = [...pending.scopeUuids];\n            const scopeMode = pending.scopeMode;\n\n            this.clearPendingRealtimeSend();\n\n            this.sendExternalMessage(\n              message,\n              scopeUuids,\n              scopeMode,\n            );\n          },\n          1000,\n        );\n      }, 5000);\n"""
if "No decisive ready event received; using processing-status fallback." not in s:
    s = replace_once(s, old, new, "realtime HTTP fallback")

write(COMPONENT, s, nl)
PY

echo
echo "External AI frontend patch applied successfully."
echo "Changed:"
echo "  - explicit selected/conversation document scope"
echo "  - current-message uploads are treated as selected attachments"
echo "  - websocket wait now has HTTP processing-status recovery"
echo "  - frozen document scope is preserved across retries"
echo
echo "Next: run npx tsc -p tsconfig.app.json --noEmit"
