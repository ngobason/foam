# Foam Editor project status

## Current checkpoint

- **M0 COMPLETE. M1 auto-save NOT IMPLEMENTED.** Next: M1.1 read-only inspection/design, followed by M1.2 implementation only after approval.
- Branch: `dev/codemirror6-poc`; HEAD: `f9852324` (`f9852324ff0979f9d370d1ee5ba1b15d2980eda4`).
- The user reports this checkpoint was pushed and synchronized with origin. Local inspection for M1.0b confirmed HEAD equals the locally recorded upstream ref. No fetch or live remote verification was performed.
- [PRODUCT_PLAN.md](PRODUCT_PLAN.md) is the approved product direction; this file records implementation status and evidence. Repository rules remain in [AGENTS.md](../AGENTS.md).

## Completed and evidence

The following implementation checkpoints and their completion/push status were supplied by the user:

- **Step 31.6:** real Markdown workspace persisted to disk and synchronized with Foam Core/Graph, with safe conflict handling.
- **Step 31.7.1:** real-file Wikilink navigation, including aliases and cursor/hover interactions, completed and pushed.
- **Step 31.7.2:** Save/Discard/Cancel fallback navigation completed and pushed at `f9852324`.
- **Historical automated validation at M0:** 25 tests passed, build passed and `git diff --check` passed, as reported from the completed implementation. These are historical results, not fresh test execution for M1.0b.
- **User-confirmed manual validation:** Save, Cancel/Escape, Discard, external Save conflict and repeated navigation.

Source inspection for this documentation task corroborated explicit disk saving, expected-content conflict checks, Core/Graph synchronization and guarded real-note navigation. It does not replace runtime validation.

Relevant files under [`experiments/codemirror6-poc/`](../experiments/codemirror6-poc/):

- [`src/main.ts`](../experiments/codemirror6-poc/src/main.ts): editor/session wiring, save flow, Core/Graph synchronization and navigation dialog.
- [`src/browser-note-repository.ts`](../experiments/codemirror6-poc/src/browser-note-repository.ts): browser file access, explicit writes and external-content checks.
- [`src/foam-core-adapter.ts`](../experiments/codemirror6-poc/src/foam-core-adapter.ts): sample and real-file workspace adapters.
- [`src/real-note-navigation.ts`](../experiments/codemirror6-poc/src/real-note-navigation.ts), [`src/internal-link-navigation.ts`](../experiments/codemirror6-poc/src/internal-link-navigation.ts) and [`src/link-navigation.ts`](../experiments/codemirror6-poc/src/link-navigation.ts): safe note-switch preparation, Core link resolution and click/hover behavior.
- Tests: [`real-note-navigation.test.ts`](../experiments/codemirror6-poc/test/real-note-navigation.test.ts), [`internal-link-navigation.test.ts`](../experiments/codemirror6-poc/test/internal-link-navigation.test.ts), [`link-navigation.test.ts`](../experiments/codemirror6-poc/test/link-navigation.test.ts) and [`real-wikilink-flow.test.ts`](../experiments/codemirror6-poc/test/real-wikilink-flow.test.ts).

## In progress

M1.0b shared documentation has been created and reviewed. The documentation checkpoint is awaiting Git commit/push. M1.1 read-only Auto-save inspection/design and M1.2 implementation have not started. No application code changes or fresh tests/builds were performed during M1.0b.

## Known limitations/unknowns

- Real-file saving is explicit; sample/localStorage persistence must not be treated as real-file auto-save. The two modes must remain distinct.
- The browser repository relies on File System Access API support and permissions; it currently handles existing Markdown files in the selected folder, without recursive subfolder traversal or implicit note creation.
- Core/Graph synchronization is present; complete CodeMirror integration of Autocomplete, Backlinks, Graph UI and workspace browsing is not established. M2/M3 usability and integration acceptance remain ahead.
- Auto-save behavior, lifecycle handling and its design are pending M1.1. Portable Web/Electron integration, legal workflows and PDF ingestion remain product goals rather than completed capabilities.
- Historical validation does not establish current runtime behavior on every browser or host.
- `.vscode/launch.json` is intentionally modified locally. Never edit, stage or revert it automatically.

## Immediate next action

Stop after M1.0b documentation. When requested, perform **M1.1 read-only inspection/design** for safe automatic saving and seamless navigation, preserving the M0 fallback and conflict protections. Begin **M1.2 implementation only after approval**.

## Update procedure

1. Read this file, PRODUCT_PLAN.md and repository guidance before Foam Editor work; inspect branch, HEAD and local changes without disturbing them.
2. Update this status after an authorized checkpoint. Record revision, completed behavior, limitations and the next authorized action; distinguish local upstream refs from live remote verification.
3. Record automated commands/results and manual confirmations separately, including their revision and scope. Label historical evidence and never imply checks were freshly run.
4. Change PRODUCT_PLAN.md when the user approves a product-direction change. Keep planned capabilities separate from verified implementation and preserve existing evidence when updating status.
5. Preserve local-only files, especially `.vscode/launch.json`. Follow AGENTS.md and the current task's permissions; never infer authorization to implement, commit, push or open a PR from a documentation update.
