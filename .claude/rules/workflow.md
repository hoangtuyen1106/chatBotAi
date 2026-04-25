---
description: Change-verification workflow. Apply after every significant change.
globs: ["**/*"]
alwaysApply: true
---

# Workflow & Verification

After every significant change, re-read the feature list and confirm the change did **not** break any of:

- Registration / login (bcrypt + JWT).
- Upload → parse → chunk → embed → store pipeline.
- RAG retrieval scoped to the authenticated user.
- Streaming chat over WebSocket/SSE.
- History retrieval.
- `/health` endpoint.
- Mobile layout at 360 px width.
- Scroll animations on landing sections.

Rules:
- Prefer editing the existing scaffold over creating parallel files.
- Do not leave half-finished implementations; if a change is partial, mark it clearly and call it out to the user.
- If a change affects multiple layers (route → service → adapter → worker), walk each layer to verify consistency before reporting done.

## Token-budget checkpoint (mandatory)

After **every small task** completed inside a phase (each ticked item in the Build Plan, each subagent return, each verified end-to-end test), check the conversation's token usage.

**If usage ≥ 92% of the model's context window:**
1. **Stop** — do not start the next task.
2. Update [CLAUDE.md](../../CLAUDE.md) with:
   - **Completed:** files touched in this session, what was verified, what was NOT verified.
   - **Current state per area:** update the "🟡 Current state by area" table; mark the current phase as "🟡 In progress — partial" and list which sub-items are done vs pending.
   - **Next steps:** rewrite the "⏭ Next steps" block with the precise resumption list (file paths, function names, exact verifications still needed).
   - **Key Decisions & Rationale:** add any non-obvious choices made this session (with the *why*) so the next session doesn't re-litigate.
   - **Known follow-ups / caveats:** add any operational gotcha discovered (env var, port, restart sequence, hook failure pattern).
3. Tell the user: "Token budget reached 92% — paused to update CLAUDE.md. Start a fresh session to continue Phase X."
4. Do NOT attempt one more task "to finish it". Doing so risks losing context mid-edit.

If usage < 92%: continue to the next task.
