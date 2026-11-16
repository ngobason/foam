# FOAM EDITOR — PROJECT STATUS V3

**Cập nhật định hướng:** 15/11/2026.
**Cập nhật checkpoint M1.2 + UX-01:** 16/11/2026.
**Cập nhật M1.2b-GATE:** 16/11/2026 — nghiệm thu có điều kiện, chờ Git checkpoint.
**Phiên bản tài liệu:** V3 — Obsidian-like Editing / Views / Workspace.
**Bằng chứng:** HEAD và staging đã được kiểm tra bằng Git local trong lần cập nhật này. Kết quả automated dưới đây là **Codex-reported**; browser/UI là **user-confirmed** trong phạm vi được nêu. Không chạy lại test/build hoặc browser trong lần cập nhật tài liệu này; **M1 chưa hoàn tất**.

## 1. Quyết định phạm vi mới

- **KEEP:** CodeMirror 6 Markdown editor; Live Preview; Source Mode; Reading View; tabs/panes; Foam Core Wikilinks, Navigation, Autocomplete, Backlinks, Graph, workspace; safe real-file editing and Auto-save; Web-first, Electron-ready.
- **DROP:** PDF nhiều tài liệu, OCR/AI ingestion, pháp lý/quy định, typed legal relations và các dashboard hiệu lực. Các roadmap tháng 10 chỉ còn là lịch sử tham khảo.
- **Generic Markdown YAML Properties** là UI ghi chú bình thường, vẫn được xem xét ở M5.5.
- Tài liệu chi tiết: [PRODUCT_PLAN.md](PRODUCT_PLAN.md), [IMPLEMENTATION_ROADMAP.md](IMPLEMENTATION_ROADMAP.md), [OBSIDIAN_FEATURE_MATRIX.md](OBSIDIAN_FEATURE_MATRIX.md), [QA_ACCEPTANCE.md](QA_ACCEPTANCE.md).

## 2. Git checkpoint — lịch sử và trạng thái hiện tại

| Mốc                     | Hash/nhánh                                           | Bằng chứng & lưu ý                                                                                                           |
| ----------------------- | ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| **M0 application-code** | `f9852324` / `dev/codemirror6-poc`                   | Save/Discard/Cancel + conflict + real navigation, người dùng xác nhận test/commit/push                                       |
| **M1.0 shared docs**    | `83ceb94c` / `dev/codemirror6-poc`                   | User chạy `git status` và `git log` xác nhận local/upstream cùng hash tại thời điểm báo                                      |
| **V3 documentation**    | `5ec65eec` / `dev/codemirror6-poc`                   | Checkpoint AGENTS và bộ docs V3 trước commit application code                                                                |
| **M1.2a/b + UX-01**     | `1ed65d89` / `dev/codemirror6-poc`                   | HEAD hiện tại; sáu file application code/test ở §5 đã commit cùng status, sau trạng thái staged được ghi trong báo cáo trước |
| **M1.2b FIX-01/FIX-02** | **Chưa commit tại thời điểm lập báo cáo 16/11/2026** | Thay đổi hiện tại ở `src/main.ts` và `test/real-wikilink-flow.test.ts`; chưa có commit hash mới                              |

**Lưu ý:** Last committed checkpoint là `1ed65d89`; FIX-01/FIX-02 và nghiệm thu có điều kiện dưới đây vẫn chờ Git checkpoint. Commit application code không đồng nghĩa toàn bộ M1 đã hoàn tất. Giữ nguyên mọi thay đổi local và staging; không tự reset/stash/clean. `.vscode/launch.json` được người dùng cố ý sửa local; **không chạm, không stage, không revert**. Lần cập nhật này chỉ sửa `docs/PROJECT_STATUS.md`, không stage/commit/push.

## 3. Tính năng đã hoàn tất theo bằng chứng lịch sử

- **31.6 / M0:** đọc/ghi file Markdown thật; phát hiện disk conflict bằng `expectedContent`; đồng bộ Foam Core/FoamGraph sau persistence.
- **31.7.1:** Ctrl/Cmd+Click Wikilink `[[B]]`, `[[B|Alias]]`, hover behavior, target handling; manual navigation đã được user xác nhận.
- **31.7.2 / `f9852324`:** Save/Discard/Cancel fallback với dirty source; conflict không gây mất dữ liệu; 25 tests lịch sử và build PASS theo báo cáo ở checkpoint M0.
- **M1.0 / `83ceb94c`:** shared context files, Copilot và Codex independent comprehension checks PASS; đây là checkpoint tài liệu cũ, được thay đổi scope bởi V3.

## 4. M1.2b-GATE — READY WITH DOCUMENTED LIMITATIONS, pending Git checkpoint

**Audit verdict:** **READY WITH DOCUMENTED LIMITATIONS**. Auto-save được nghiệm thu có điều kiện theo bằng chứng và giới hạn dưới đây, chờ Git checkpoint cho FIX-01/FIX-02. Đây không phải tuyên bố toàn bộ M1 DONE hoặc mọi trường hợp browser đã được chứng minh.

**M1.1:** Copilot đã khảo sát read-only và ChatGPT chốt kiến trúc minimal autosave (debounce 750ms, snapshot immutable, serialize writes, disk/Core distinction, external conflict guard).

**M1.2a:** Codex tạo `src/real-note-autosave.ts` và `test/real-note-autosave.test.ts`, coordinator với `request()`, `flush()`, `dispose()`; sau M1.2b thêm `suspend()`/`resume()`; B→C baseline tests. Copilot review **PASS WITH MINOR ISSUES**.

**M1.2b:** Codex báo tích hợp vào `src/main.ts` và bổ sung tests trong `test/real-wikilink-flow.test.ts`, `test/real-note-autosave.test.ts`. Chuyển Edit/Save qua cùng coordinator, quyền ghi xin trong user gesture, status lưu và session guards; sample/localStorage cô lập. Copilot independent read-only review kết luận **PASS WITH MINOR ISSUES**, đủ để thử browser trên disposable workspace.

**Kết quả Codex báo cáo, chưa độc lập chạy lại:** tại M1.2b, application flow **31/31 PASS**, coordinator **19/19 PASS**, toàn bộ experiment **66/66 Vitest PASS**. Sau UX-01 thêm regression hiển thị Save: application flow **32/32 PASS**, toàn bộ **67/67 Vitest PASS**. Sau FIX-01: **70/70 PASS**; sau FIX-02, kết quả mới nhất là **79/79 Vitest PASS**, build/Prettier/whitespace (`git diff --check`) PASS trên **Node 24.21.0**. **Node 22 chưa được xác minh.** Build còn warnings cũ về dependency `gray-matter` `eval` và bundle lớn.

**Browser basic real-file Auto-save — user-confirmed PASS:** `A.md` hiển thị `Saved`; người dùng kiểm tra bằng PowerShell xác nhận `AUTOSAVE_UI_01` đã persist vào file Markdown vật lý sau redesign. Đây là bằng chứng basic smoke, không suy diễn rằng mọi trường hợp reload/close hoặc toàn bộ AS-01–18 đã PASS.

**UX-01 — redesign và refinements hoàn tất:** UX-01b thiết kế lại shell/header/Explorer/dialog và tách filename/status; UX-01e cho panel lấp đầy workspace, cải thiện typography, ẩn Save ngoài editable real-file session; UX-01f căn trái cột Markdown gần gutter. Copilot review UX-01b **PASS WITH MINOR ISSUES**. Người dùng xác nhận **PASS** cho desktop layout, căn trái, typography, caret/selection, Undo/Redo, task checkboxes, responsive cơ bản ở **390px/720px**, Image Preview và Lightbox. Không coi đây là nghiệm thu đầy đủ Markdown parity hoặc M1.

**FIX-01 — CRLF false conflict:** CodeMirror chuẩn hóa CRLF/LF thành dòng logic; dùng `doc.toString()` tạo baseline LF khác nội dung CRLF nguyên văn trên disk. Đã sửa editor serialization và baseline handling theo separator của từng file, giữ nguyên strict expected-content conflict guard. Người dùng xác nhận browser CRLF retest và genuine external conflict retest **PASS**.

**FIX-02 — mixed line endings safety:** file mixed được chủ động giữ **read-only**, có giải thích cho người dùng và chặn Edit/Save nếu không thể round-trip nguyên văn. File đồng nhất **LF, CRLF và lone CR** vẫn editable và giữ separator gốc. Browser acceptance **user-confirmed PASS**; independent Copilot FIX-02 review **PASS WITH MINOR ISSUES**. Mixed-file editing **chưa hỗ trợ, có chủ đích để bảo vệ dữ liệu**; không âm thầm normalize toàn file hoặc nới conflict guard.

**Browser T2.1–T2.11 — user-confirmed PASS:** gồm conflict, Cancel/Discard, permissions, I/O failure, save recovery và reload warning trong các kịch bản người dùng đã thử. Không quy đổi nhãn T2 PASS thành chứng minh mọi AS case trên browser; phạm vi bằng chứng cụ thể:

- **AS-06/07/12:** concurrency B→C, Manual Save khi pending/in-flight và Core-only retry chủ yếu được kiểm tra **automated**; chưa chứng minh bằng tái hiện in-flight/Core failure thật trong browser.
- **AS-17:** reload warning + **Cancel PASS**; không bảo đảm pending write hoàn tất hoặc recovery sau forced close.
- **AS-09:** permission denial/retry **PASS**; full mid-session permission revocation chưa được xác minh riêng.
- **AS-18:** sample/localStorage isolation chủ yếu là bằng chứng **automated**.
- **Node 22:** chưa được xác minh; kết quả Node 24.21.0 không thay thế kiểm tra compatibility này.

## 5. Các file liên quan đến trạng thái hiện tại

Dưới `experiments/codemirror6-poc/`:

**Sáu file thuộc checkpoint M1.2 + UX-01 `1ed65d89`:**

- `index.html` — tên trang và metadata Foam Editor.
- `src/main.ts` — M1.2b Auto-save UI integration và UX-01 presentation.
- `src/style.css` — layout, typography, controls/dialogs và căn trái Markdown.
- `src/real-note-autosave.ts` — coordinator M1.2a/b (file mới).
- `test/real-note-autosave.test.ts` — coordinator tests (file mới).
- `test/real-wikilink-flow.test.ts` — integration tests cho Auto-save/navigation và UI Save.

**FIX-01/FIX-02 tại thời điểm nghiệm thu trước Git checkpoint:** `src/main.ts` và `test/real-wikilink-flow.test.ts`; giữ nguyên các thay đổi này cho checkpoint tiếp theo.

**Module liên quan, ngoài sáu file checkpoint:**

- `src/browser-note-repository.ts` — browser directory and expected-content disk write (comment “No write operations yet” đã bị Copilot chỉ ra stale).
- `src/foam-core-adapter.ts` — Foam workspace + graph synchronization.
- `src/real-note-navigation.ts`, `src/internal-link-navigation.ts` — navigation policy.
- `src/foam-editor-sync.ts` — sample/localStorage (phải tách khỏi real workspace).

## 6. Những giới hạn đã biết hoặc chưa xác minh

- Explorer vẫn dùng `window.confirm` thay vì dialog fallback thống nhất; M1.3 sẽ cải thiện.
- `beforeunload` chỉ cảnh báo, không thể bảo đảm asynchronous save khi đóng tab.
- Browser repository theo báo cáo xử lý file `.md` sẵn có ở folder được chọn, chưa full nested traversal/CRUD.
- Live Preview có một số extension nhưng không có nghiệm thu Source Mode/Reading View đúng semantics Obsidian; việc có Preview/Edit không đồng nghĩa ba chế độ đã đạt.
- **UX-02a — Copilot read-only audit:** xác định còn thiếu fenced-code Live Preview, code syntax highlighting theo ngôn ngữ, completed-task styling và các gap Markdown parity khác. Đây là backlog **M2/M3**, **chưa implement**; font monospace và task checkbox hoạt động không đồng nghĩa các gap này đã được xử lý.
- Core/Graph data sync tồn tại; Backlinks/Graph UI/Autocomplete chưa được xác nhận tích hợp đầy đủ.
- Real asset resolver còn gap; sample/localStorage và real-file phải giữ riêng.
- Build warnings `gray-matter eval` và bundle lớn được ghi nhận, chưa tự sửa vì không phải blocker đã chứng minh.
- Không có benchmark định lượng đầy đủ hoặc mô hình đa tab/pane an toàn đã được chứng minh.

## 7. Immediate next action

**Hiện tại:** ghi nhận verdict M1.2b-GATE có điều kiện và chờ Git checkpoint cho FIX-01/FIX-02, chỉ khi người dùng cho phép stage/commit. Không tạo hoặc suy diễn commit hash mới.

**Next after M1.2b checkpoint: M1.3 — seamless navigation và thống nhất fallback.** M1.3, M1.4 (recovery/conflict hardening), M1.5 (stabilization) và M2 đều **NOT STARTED**. Tiếp tục M1.3 → M1.4 → M1.5 theo roadmap và các giới hạn ở §4; **không bắt đầu M2** trước khi M1 ổn định và được nghiệm thu. Nếu phát hiện lỗi data safety, bảo vệ draft rồi sửa focused trước khi mở rộng; UX-02a vẫn chỉ là backlog M2/M3.

## 8. Quy tắc cập nhật docs / Git tại checkpoint

1. Bộ năm docs V3 và AGENTS đã được cập nhật ở `5ec65eec`; không cần copy lại. PDF/legal ngoài scope; giữ nguyên các rule upstream và bằng chứng lịch sử.
2. Trước checkpoint tiếp theo, kiểm tra read-only HEAD, `git status -sb`, staged diff và docs diff; không ghi đè code/test đang staged hoặc thay đổi local khác.
3. Giữ các bảo vệ dữ liệu: expected-content conflict guard, persisted baseline, Core/Graph chỉ nhận persisted snapshots, draft mới hơn khi save in-flight, Save/Discard/Cancel và sample/localStorage isolation. `beforeunload` không bảo đảm async save khi đóng trang.
4. Không sửa/stage/revert `.vscode/launch.json`. Chỉ stage/commit/push khi người dùng cho phép rõ ràng; lưu evidence/commit hash tương ứng, không coi staged là committed hoặc acceptance DONE.
5. Sau mỗi gate, ghi rõ **reported vs verified vs user-confirmed**, timestamp, branch/hash, tests, remaining risks và bước tiếp theo.
