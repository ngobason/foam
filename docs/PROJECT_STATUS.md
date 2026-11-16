# FOAM EDITOR — PROJECT STATUS V3

**Cập nhật định hướng:** 15/11/2026.
**Phiên bản tài liệu:** V3 — Obsidian-like Editing / Views / Workspace.
**Quan trọng:** Tài liệu status này được tổng hợp từ kết quả người dùng đã gửi trong hội thoại; **không có phiên `git status`, `git log` hoặc test mới trên máy Windows sau các báo cáo đó**. Mọi trạng thái code uncommitted dưới đây phải kiểm tra lại khi tiếp tục.

## 1. Quyết định phạm vi mới

- **KEEP:** CodeMirror 6 Markdown editor; Live Preview; Source Mode; Reading View; tabs/panes; Foam Core Wikilinks, Navigation, Autocomplete, Backlinks, Graph, workspace; safe real-file editing and Auto-save; Web-first, Electron-ready.
- **DROP:** PDF nhiều tài liệu, OCR/AI ingestion, pháp lý/quy định, typed legal relations và các dashboard hiệu lực. Các roadmap tháng 10 chỉ còn là lịch sử tham khảo.
- **Generic Markdown YAML Properties** là UI ghi chú bình thường, vẫn được xem xét ở M5.5.
- Tài liệu chi tiết: [PRODUCT_PLAN.md](PRODUCT_PLAN.md), [IMPLEMENTATION_ROADMAP.md](IMPLEMENTATION_ROADMAP.md), [OBSIDIAN_FEATURE_MATRIX.md](OBSIDIAN_FEATURE_MATRIX.md), [QA_ACCEPTANCE.md](QA_ACCEPTANCE.md).

## 2. Git checkpoint đã được người dùng xác nhận

| Mốc                     | Hash/nhánh                                     | Bằng chứng & lưu ý                                                                                            |
| ----------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| **M0 application-code** | `f9852324` / `dev/codemirror6-poc`             | Save/Discard/Cancel + conflict + real navigation, người dùng xác nhận test/commit/push                        |
| **M1.0 shared docs**    | `83ceb94c` / `dev/codemirror6-poc`             | User chạy `git status` và `git log` xác nhận local/upstream cùng hash tại thời điểm báo                       |
| **M1.2a/b**             | **chưa có hash commit đã được người dùng gửi** | Codex cho biết code thay đổi local, chưa stage/commit/push, Copilot đã review; cần xác minh worktree mới nhất |

**Lưu ý:** Sau khi người dùng thay docs V3 vào repo, Git status sẽ có thay đổi docs mới; đó không phải lý do tự reset code. `.vscode/launch.json` được người dùng cố ý sửa local; **không chạm, không stage, không revert**.

## 3. Tính năng đã hoàn tất theo bằng chứng lịch sử

- **31.6 / M0:** đọc/ghi file Markdown thật; phát hiện disk conflict bằng `expectedContent`; đồng bộ Foam Core/FoamGraph sau persistence.
- **31.7.1:** Ctrl/Cmd+Click Wikilink `[[B]]`, `[[B|Alias]]`, hover behavior, target handling; manual navigation đã được user xác nhận.
- **31.7.2 / `f9852324`:** Save/Discard/Cancel fallback với dirty source; conflict không gây mất dữ liệu; 25 tests lịch sử và build PASS theo báo cáo ở checkpoint M0.
- **M1.0 / `83ceb94c`:** shared context files, Copilot và Codex independent comprehension checks PASS; đây là checkpoint tài liệu cũ, được thay đổi scope bởi V3.

## 4. M1 hiện tại — CODEREVIEWED, chưa browser acceptance

**M1.1:** Copilot đã khảo sát read-only và ChatGPT chốt kiến trúc minimal autosave (debounce 750ms, snapshot immutable, serialize writes, disk/Core distinction, external conflict guard).

**M1.2a:** Codex tạo `src/real-note-autosave.ts` và `test/real-note-autosave.test.ts`, coordinator với `request()`, `flush()`, `dispose()`; sau M1.2b thêm `suspend()`/`resume()`; B→C baseline tests. Copilot review **PASS WITH MINOR ISSUES**.

**M1.2b:** Codex báo tích hợp vào `src/main.ts` và bổ sung tests trong `test/real-wikilink-flow.test.ts`, `test/real-note-autosave.test.ts`. Chuyển Edit/Save qua cùng coordinator, quyền ghi xin trong user gesture, status lưu và session guards; sample/localStorage cô lập. Copilot independent read-only review kết luận **PASS WITH MINOR ISSUES**, đủ để thử browser trên disposable workspace.

**Kết quả Codex báo cáo, chưa độc lập chạy lại:** application flow **31/31 PASS**, coordinator **19/19 PASS**, toàn bộ experiment Vitest **66/66 PASS**, build/Prettier/`git diff --check` PASS. **Node 24.21.0**, chưa có bằng chứng Node 22 PASS. Build có warnings cũ về dependency `gray-matter` `eval` và bundle lớn.

**Chưa nghiệm thu:** File System Access browser thật, Auto-save T1/T2, permission/revoke, external disk conflict, Core sync failure trong browser, reload/close, async race ngoài mock. Không được gọi M1.2b hoàn tất end-to-end trước các kiểm thử này.

## 5. Các file liên quan đến trạng thái hiện tại

Dưới `experiments/codemirror6-poc/`:

- `src/main.ts` — CodeMirror/session/save/permission/navigation/current UI; Codex reported modified in M1.2b.
- `src/real-note-autosave.ts` — coordinator mới M1.2a/b, chưa được xác nhận commit.
- `src/browser-note-repository.ts` — browser directory and expected-content disk write (comment “No write operations yet” đã bị Copilot chỉ ra stale).
- `src/foam-core-adapter.ts` — Foam workspace + graph synchronization.
- `src/real-note-navigation.ts`, `src/internal-link-navigation.ts` — navigation policy.
- `src/foam-editor-sync.ts` — sample/localStorage (phải tách khỏi real workspace).
- `test/real-note-autosave.test.ts`, `test/real-wikilink-flow.test.ts` — unit/integration mới.

## 6. Những giới hạn đã biết hoặc chưa xác minh

- Explorer vẫn dùng `window.confirm` thay vì dialog fallback thống nhất; M1.3 sẽ cải thiện.
- `beforeunload` chỉ cảnh báo, không thể bảo đảm asynchronous save khi đóng tab.
- Browser repository theo báo cáo xử lý file `.md` sẵn có ở folder được chọn, chưa full nested traversal/CRUD.
- Live Preview có một số extension nhưng không có nghiệm thu Source Mode/Reading View đúng semantics Obsidian; việc có Preview/Edit không đồng nghĩa ba chế độ đã đạt.
- Core/Graph data sync tồn tại; Backlinks/Graph UI/Autocomplete chưa được xác nhận tích hợp đầy đủ.
- Real asset resolver còn gap; sample/localStorage và real-file phải giữ riêng.
- Build warnings `gray-matter eval` và bundle lớn được ghi nhận, chưa tự sửa vì không phải blocker đã chứng minh.
- Không có benchmark định lượng đầy đủ hoặc mô hình đa tab/pane an toàn đã được chứng minh.

## 7. Immediate next action

**M1.2b-T1 — Browser real-file Auto-save smoke test** trên disposable `D:\Projects\foam-autosave-test`, gồm `A.md`, `B.md`: mở thực tế, Edit Real File, thêm `AUTOSAVE_TEST_01`, dừng gõ 2–3 giây, không bấm Save, kiểm tra status và file vật lý qua PowerShell, reload/reopen xác nhận tồn tại.

Nếu T1 PASS → M1.2b-T2 (permission/error/concurrency/navigation); đủ regression rồi mới **M1.2b-GATE** và M1.3. Nếu T1 FAIL → chỉ sửa bug focused, không đi tiếp M1.3. Không bắt đầu mode/view M2 trước khi M1 data safety ổn định.

## 8. Cập nhật docs / Git sau khi duyệt V3

1. Người dùng xem các bản PDF trước; nếu đồng ý, copy bộ 5 `.md` V3 vào `docs/`, thay **chỉ đúng** các file docs có tên trùng, không xóa file khác và không sửa `AGENTS.md` khi chưa review.
2. Chạy `git status -sb`, `git diff -- docs`, `git log -1 --oneline`, xem tình trạng local source M1.2b và `.vscode/launch.json`.
3. Kiểm tra `AGENTS.md` hiện hành vẫn dẫn tới `docs/PRODUCT_PLAN.md`/`PROJECT_STATUS.md`; tài liệu V3 có đường dẫn tới roadmap/matrix/QA. Nếu AGENTS còn nói PDF/legal là scope, cần đề xuất diff tối thiểu và duyệt riêng, không xóa rule upstream.
4. Chưa tự ý commit/push. Tài liệu và code M1.2b có thể commit riêng theo phạm vi khi user duyệt; giữ evidence/commit hash tương ứng.
5. Sau mỗi gate, ghi rõ **reported vs verified vs user-confirmed**, timestamp, branch/hash, tests, remaining risks và bước tiếp theo.
