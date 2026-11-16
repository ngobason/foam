# FOAM EDITOR — IMPLEMENTATION ROADMAP V3

**Ngày:** 15/11/2026
**Scope:** Obsidian-like editing, views, workspace, Foam knowledge features, quality và host-agnostic architecture.
**Nguyên tắc:** Bắt đầu đúng tại kết quả đang có, **không làm lại M0/M1.2a hoặc mã M1.2b đã được Codex báo cáo hoàn tất**. Chưa có xác nhận runtime browser cho M1.2b, vì thế điểm vào là kiểm thử T1 và hoàn thiện nghiệm thu.

Đọc cùng: [PRODUCT_PLAN.md](PRODUCT_PLAN.md), [OBSIDIAN_FEATURE_MATRIX.md](OBSIDIAN_FEATURE_MATRIX.md), [PROJECT_STATUS.md](PROJECT_STATUS.md), [QA_ACCEPTANCE.md](QA_ACCEPTANCE.md), `../AGENTS.md`.

## 0. Quy ước thực hiện và definition of done

- **Mỗi bước = một nhiệm vụ độc lập**, có mục tiêu, file dự kiến, test, manual acceptance, giới hạn thay đổi. ChatGPT lên gate/review; Copilot **Ask** khảo sát/review read-only khi cần; Codex implement/test; người dùng kiểm tra Chrome/Edge; Git chỉ commit/push sau duyệt.
- **Trạng thái:** DONE (đã nghiệm thu), CODE REVIEWED (test/review mã nhưng chưa browser/UAT), IN PROGRESS, PLANNED, BLOCKED. Không dùng “DONE” dựa vào README hoặc lời hứa.
- **GATE chung cho mỗi mục có thay đổi code:** focused tests PASS → affected suites PASS → build PASS → kiểm tra diff → browser/manual theo rủi ro → chỉ stage file đúng scope → commit/push khi được duyệt → cập nhật `PROJECT_STATUS.md`.
- **Bảo toàn:** không mất Markdown; disk baseline là bản thực sự persist; CodeMirror có thể chứa bản nháp mới hơn; không silent external overwrite; Core/Graph chỉ nhận persisted snapshots; không bao giờ stage/revert `.vscode/launch.json`; không ghi đè các thay đổi local khác.
- **Không refactor quá sớm:** ưu tiên giữ `main.ts` làm orchestration trong khi M1 đang ổn định; chỉ tách session/controller hoặc rendering khi có test và nhu cầu thật. Hợp đồng giữa CodeMirror/Core/Repository phải rõ trước nâng cấp nhiều pane.
- **Nhóm nguồn lịch sử:** 31.6/31.7 đã hoàn thành; commit M0 `f9852324`; docs V2 commit `83ceb94c`. Git thực tế phải được xác minh trước bất kỳ thao tác commit nào.

## 1. Bản đồ chặng và thứ tự ưu tiên

| Chặng  | Mục tiêu                                             | Đầu ra / gate                             | Mức ưu tiên |
| ------ | ---------------------------------------------------- | ----------------------------------------- | ----------- |
| **M0** | Real Markdown + Foam Core/Graph + navigation an toàn | **DONE — không làm lại**                  | Historical  |
| **M1** | Auto-save, chuyển note an toàn và mượt               | Browser real-file acceptance + regression | P0          |
| **M2** | Ba chế độ Live Preview, Source, Reading              | Mode contract, switch/side-by-side demo   | P0          |
| **M3** | Chất lượng Markdown Live Preview & Reading           | Syntax parity suite, caret/IME/Undo gates | P0/P1       |
| **M4** | Workspace, file lifecycle, tabs, split, search       | CRUD, tab/pane integration, reopen        | P1          |
| **M5** | Foam links, autocomplete, backlinks, graph           | Knowledge navigation UAT                  | P1          |
| **M6** | Productivity UX: commands, hotkeys, properties       | Daily workflow và keyboard UAT            | P1          |
| **M7** | Recovery, accessibility, performance, security       | Release-candidate QA                      | P0/P1       |
| **M8** | Web packaging, adapter contract, release v1          | Independent user demo/handoff             | P1          |

**Sắp thứ tự thực tế:** hoàn tất M1; làm M2 trước khi mở rộng nhiều chức năng khác để sớm kiểm chứng đúng mục tiêu mới; triển khai M3; sau đó M4/M5 có thể gối nhau có kiểm soát. M6/M7 có thể tích lũy QA xuyên suốt nhưng gate cuối vẫn bắt buộc. M8 không bị phụ thuộc vào dự án đồng bộ nhóm khác.

## 2. M1 — Auto-save & seamless navigation [tiếp nối đang làm]

### M1.0–M1.2a — Bằng chứng lịch sử, không làm lại

- **M0:** real disk Save, expected-content conflict, Core/Graph sync, Wikilink alias Ctrl/Cmd+Click, Save/Discard/Cancel fallback. Người dùng xác nhận trước đó; mã nguồn checkpoint `f9852324`.
- **M1.0:** đã tạo ngữ cảnh chung và commit `83ceb94c`; Copilot/Codex PASS đọc ngữ cảnh. **Lưu ý tài liệu V2 sẽ được thay bởi V3 sau khi người dùng review.**
- **M1.1:** Copilot read-only audit Save và kiến trúc Auto-save; đã đánh giá.
- **M1.2a:** Codex report coordinator debounce 750 ms, one-save, B→C persisted baseline, `flush/dispose`, 16 test lúc đầu rồi 19 test sau tích hợp. Copilot review PASS WITH MINOR ISSUES.
- **M1.2b:** Codex report đã nối `main.ts`, permission từ Edit/Save, save status và đường rời session; tổng 66 Vitest PASS, build/format PASS trên Node 24.21.0. Copilot review PASS WITH MINOR ISSUES. **CHƯA manual browser acceptance. CHƯA thấy commit/push M1.2a/b từ người dùng.**

### M1.2b-T1 — Browser smoke: lưu file Markdown thật [NEXT]

- **Chuẩn bị:** workspace disposable `D:\Projects\foam-autosave-test` với A.md và B.md, không dùng vault chính. Ghi baseline file trước test.
- **Thao tác:** chạy Vite PoC, chọn folder, mở A.md, bấm Edit Real File, cấp quyền nếu có; thêm marker `AUTOSAVE_TEST_01`; không bấm Save; đợi debounce + I/O; kiểm tra status; xác nhận nội dung trên disk bằng PowerShell; reload và mở lại A.md.
- **PASS:** marker nằm trên file vật lý, UI không báo sai “Saved”, mở lại vẫn có marker, không có prompt Save thường trực. Nếu FAIL: ghi ảnh/status/error/log rồi chỉ sửa đúng lỗi ở M1.2b.
- **Không làm:** M1.3, thêm tính năng mới, commit khi chưa nghiệm thu.

### M1.2b-T2 — Error/concurrency manual + regression [NEXT AFTER T1]

- **Happy path:** gõ nhiều lần cách nhau ngắn hơn 750ms, xác nhận không viết từng ký tự và không mất thay đổi.
- **Revision B→C:** dùng test harness/deferred write để kiểm tra in-flight B, edit C, disk B trước rồi C và Core cuối cùng C; trình duyệt thực tế nếu khó chặn I/O thì dựa vào integration test và smoke content.
- **Permissions:** từ chối/revoke quyền ghi; nội dung draft giữ nguyên, status lỗi, Save thủ công hồi phục khi có gesture.
- **External conflict:** sửa file từ PowerShell trước khi auto-save; editor không overwrite; có lỗi và đường giải quyết rõ.
- **Core sync:** mô phỏng disk success/Core failure; UI phân biệt, retry không ghi file lần hai.
- **Session/lifecycle:** Wikilink, Explorer, đổi workspace, Return to Sample, Cancel/Discard, browser reload/close; không mất source đang chỉnh.
- **PASS:** không P0 data-loss; các lỗi được hiển thị đúng; sample/localStorage vẫn riêng.

### M1.2b-GATE — Chốt tích hợp

- Review đúng diff, không stage `launch.json` hoặc docs local không thuộc scope; chạy focused, suite/ build; xác nhận browser T1/T2; user duyệt commit/push mã M1.2b; cập nhật status với hash. Nếu vẫn có lỗi nghiêm trọng, **không chuyển M1.3**.

### M1.3 — Seamless navigation và thống nhất fallback

| ID         | Công việc                                                                                                       | Tiêu chí nghiệm thu                                            |
| ---------- | --------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| **M1.3.1** | Gom cùng policy `await flush()` cho Wikilink, Explorer, workspace switch, Return to Sample, tab switch về sau   | Chuyển note sạch/saved không hỏi dialog; không bỏ pending save |
| **M1.3.2** | Giữ Save/Discard/Cancel khi conflict/permission/core error; Explorer dùng same fallback thay `window.confirm()` | Cả 3 lựa chọn có cùng semantic; Cancel giữ draft và resume     |
| **M1.3.3** | Navigation token/guard cho click nhanh và session đổi sau `await`                                               | Không nhảy sai note, stale callbacks không mutate current      |
| **M1.3.4** | Scroll, focus, back/forward cho note navigation căn bản                                                         | Quay về note đúng, không phá caret/scroll bất thường           |
| **M1.3.5** | Hồi quy + browser gate + checkpoint                                                                             | P0 errors = 0, test/build/pass, commit khi duyệt               |

### M1.4 — Recovery & conflict hardening

- Phân biệt rõ `Unsaved`, `Saving`, `Saved to disk`, `Disk saved; Core sync failed`, `Permission required`, `External conflict`, `Write failed`.
- `beforeunload` chỉ là cảnh báo, không coi async flush được đảm bảo khi trang đóng. **Đánh giá** draft recovery local có cơ chế đồng ý, scope chính xác và không tự ghi đè file; tối thiểu tài liệu rõ giới hạn.
- Có test: permission revoke sau granted; sync fail với B rồi editor C; onError khi dispose; race liên tiếp; target missing. Không bỏ error thành no-op.
- Gate: manual fault-injection, failed save giữ content, retry phục hồi.

### M1.5 — M1 stabilization checkpoint

- Chạy regression đầy đủ experiment và focused Core/Graph affected; build và Git diff; smoke Chrome/Edge trên disposable workspace; ghi số tests, Node version, browser, commit; hoàn thành M1 trước M2.

## 3. M2 — Chế độ soạn thảo và chế độ xem [mới, ưu tiên cao]

**Định nghĩa:** Reading là _view_; Live Preview và Source là _editing modes_. Không đưa “Edit Real File button” và “Preview” hiện có thành tương đương mode Obsidian nếu hành vi chưa đạt. Cần xem lại UI hiện tại trước khi sửa.

| ID       | Công việc cụ thể                                                                                                                             | Test/acceptance, giới hạn                                                                    |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| **M2.1** | Copilot audit trạng thái CodeMirror (real/sample), current Preview/Edit, styling, session ownership và mode switching; ghi gap theo Obsidian | Bảng hiện có/chưa có, file refs; read-only, không làm lại tính năng hoạt động                |
| **M2.2** | Định nghĩa `viewMode` = `editing`/`reading`; `editingMode` = `live`/`source`; default/settings; API state đơn giản                           | Chuyển không tạo baseline mới hoặc sai active note; tests state transitions                  |
| **M2.3** | Source mode: show raw Markdown, không ẩn markers; keymaps, highlight cú pháp đúng; giữ selection/undo                                        | Gõ liên tục, undo, Unicode/IME, raw YAML/codes; test Markdown unchanged                      |
| **M2.4** | Reading view: renderer Markdown tương thích, link/task/asset policies rõ; không phát sinh edit ngoài thao tác tương tác hợp lệ               | Rich content đọc ổn; không chạm Save; không XSS unsafe HTML                                  |
| **M2.5** | Mode/view switch UI: shortcut/toggle/status; preserve selection/scroll gần vị trí cũ; pending save không mất                                 | Live→Source→Reading→Live, file vẫn nguyên, cursor phù hợp, tests và browser                  |
| **M2.6** | Side-by-side Edit/Reading tối thiểu, chỉ khi single note session/persistence owner đã rõ                                                     | Split 2 panes cùng source note không double-write; nếu khó, gắn sang M4 nhưng giữ yêu cầu v1 |
| **M2.7** | Gói fixture/reference Obsidian, screenshot/video acceptance theo từng mode                                                                   | Gate: P0 mode matrix xanh, user chốt trải nghiệm                                             |

**Quyết định thiết kế bắt buộc:** không tự tạo 3 bản sao Markdown để thể hiện 3 mode; Reading renderer không tạo một repository/baseline thứ hai. Mode switching độc lập với disk Save.

## 4. M3 — Live Preview và Reading fidelity [đối chiếu Obsidian]

Đánh giá trước tính năng đang có: các thành phần Heading/Inline formatting/List/Task/Blockquote/Wikilink/Image được báo có một phần. Mỗi tiểu bước phải ghi cả _caret behavior_ và _rendered behavior_.

| ID       | Nhóm                  | Công việc/fixture                                                                                                          | Gate                                                             |
| -------- | --------------------- | -------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| **M3.1** | Typography            | Heading H1–H6, bold/italic, inline code, horizontal rule; reveal syntax khi caret vào, style rõ cấp                        | Không nhảy caret, markdown raw preserved                         |
| **M3.2** | Lists/tasks/quotes    | Ordered/unordered/nested/mixed lists, task `[ ]/[x]`, click/Undo, blockquote nested/fold                                   | List indent ổn, checkbox click không lộ marker vô cớ             |
| **M3.3** | Links/transclusions   | Markdown links, Wikilink aliases, relative paths, links missing, images local/remote, image size/fallback, embeds đơn giản | Click behavior theo mode; source editable; asset lỗi không crash |
| **M3.4** | Advanced Markdown     | Fenced code blocks/language label/copy (nếu phù hợp), GFM tables, callouts, footnotes, math; chọn subset phù hợp v1        | Source/Live/Reading cùng ý nghĩa; không phá raw syntax           |
| **M3.5** | Editor mechanics      | Paste nhiều dòng, cut/copy, multi-cursor nếu dùng, select-all, Undo/Redo, IME tiếng Việt, large blocks                     | Không mất ký tự, không đứng editor, keyboard tests               |
| **M3.6** | Render consistency    | Golden fixtures cho 3 mode, snapshot/DOM tests và browser visual comparison với Obsidian                                   | Parity matrix updated; không nhận E4 chỉ từ snapshot             |
| **M3.7** | Regression checkpoint | Review diff, performance smoke, build, tests, user acceptance                                                              | Không hồi quy M1/M2, checkpoint khi duyệt                        |

**Ưu tiên:** hoàn thiện các cú pháp có trước và tương tác ổn định; code/table/callout P1; hình ảnh workspace thật P0/P1. Không tự nhúng một renderer có khả năng thực thi HTML/script không kiểm soát.

## 5. M4 — Workspace, tabs, split panes và search

| ID       | Nội dung triển khai                                                                                          | Acceptance                                                                    |
| -------- | ------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------- |
| **M4.1** | Audit hiện trạng file list, repo browser, note lifecycle; phân biệt sample/real                              | Không lặp chức năng đã có, gap list được xác nhận                             |
| **M4.2** | CRUD ghi chú/file: create/rename/move/delete theo quyền host; kiểm tra collision/invalid names; confirmation | Tạo→sửa→lưu→đổi tên→reopen; không overwrite/xóa nhầm                          |
| **M4.3** | Nested folder tree, file explorer selection, context menu, drag nếu có thời gian                             | Nested paths/Unicode/Windows separators đúng; không vô tình mở sample         |
| **M4.4** | Tabs: open/switch/close/pin cơ bản; history back/forward; session per note được quản lý                      | Dirty tab không mất dữ liệu; cùng note mở hai tab không double owner          |
| **M4.5** | Split 2 panes, drag resize, Edit/Reading linked views (hạn chế write rõ)                                     | Mở A/B song song; cùng A Edit+Reading sync an toàn                            |
| **M4.6** | Search filename/content, filters cơ bản, quick note open; debounce search                                    | Kết quả đúng sau Save/rename; không duplicate index khi Foam Core có thể dùng |
| **M4.7** | Status bar, toolbar, navigation affordances, persistence layout tối thiểu                                    | Không làm rối vùng gõ, reopen giữ layout nếu tính năng hỗ trợ                 |
| **M4.8** | Browser/workspace E2E và checkpoint                                                                          | P0 data loss = 0, regression Core/Graph không hỏng                            |

Trước M4.5 phải có contract rõ khi hai pane nhìn cùng note: **một nguồn document và một write owner**, hoặc pane Reading chỉ subscribe persisted/working preview theo policy đã chọn.

## 6. M5 — Dùng lại Foam Core để có trải nghiệm ghi chú liên kết

| ID       | Công việc                                                                                                     | Acceptance                                                          |
| -------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| **M5.1** | Audit Foam Core data/services hiện có; đối chiếu adapter `foam-core-adapter.ts`                               | Bảng API reused vs missing; không viết lại graph/index tùy tiện     |
| **M5.2** | Wikilink autocomplete theo tên/path/alias, insert đúng range; create-on-missing là thao tác riêng có xác nhận | Gõ `[[` gợi ý, chọn alias, ESC, keyboard, duplicate names           |
| **M5.3** | Markdown links, fragment heading navigation và relative link behavior                                         | Không mở sai khi note cùng tên/nested; unsupported transparent      |
| **M5.4** | Backlinks/Outgoing links pane, cập nhật theo persisted revision                                               | B trỏ A rồi sửa/xóa link, pane đổi sau Save; click hoạt động        |
| **M5.5** | Outline/headings, Tags, generic YAML Properties viewing/editing (không schema luật)                           | Click heading scroll đúng, property sửa không xóa field lạ          |
| **M5.6** | Local Graph trước, global Graph sau; zoom/pan/click/filter căn bản                                            | Graph dùng Foam graph data, không hiển thị unsaved conflict version |
| **M5.7** | Knowledge-navigation UAT + checkpoint                                                                         | 10–30 note fixtures liên kết chéo; full regression pass             |

## 7. M6 — Ergonomics, commands và cài đặt

- **M6.1:** Command palette (tìm lệnh/focus, mở note, change mode, toggle panel, save/retry), có keyboard.
- **M6.2:** Quick switcher, recent files, simple history, link hover/page preview (không gõ chồng lên editor).
- **M6.3:** Hotkey map, conflict checking, Ctrl/Cmd semantics; shortcut help overlay; keyboard-only smoke.
- **M6.4:** Settings: default view/editing mode, appearance fonts/theme light/dark, readable width, line numbers, word wrap, indentation guides; không biến thành công cụ theme phức tạp.
- **M6.5:** Generic Templates / Daily Notes có thể thử sau core UX, chỉ nếu scope vẫn cân đối; bookmark/outline ưu tiên cao hơn plugin ecosystem.
- **M6.6:** UX polishing: drag resize, focus, empty states, notifications không ồn, tooltips, screen-reader labels; viewport laptop 16-inch/1080p.
- **M6.7:** Daily workflow UAT & checkpoint; nếu P0/P1 còn lỗi, không thêm P2.

## 8. M7 — Độ bền, an toàn và khả dụng

- **M7.1 Data recovery:** explicit Save fallback, pre-unload warning, draft recovery policy, không “restore” đè bản đĩa không hỏi; kiểm tra external changes và retry.
- **M7.2 Accessibility:** keyboard tab order, focus indicators, ARIA labels cho mode/panel/task, readable contrast, optional reduced motion.
- **M7.3 Performance:** benchmark note 10KB/100KB/1MB, workspace 100/1000 note _nếu máy đủ_, numerous links/tasks, time-to-open, input latency; chỉ tối ưu theo số đo.
- **M7.4 Security:** safe Markdown/HTML rendering, URL sanitize, no script execution, file path traversal checks, extension/media handling, permission policy.
- **M7.5 Compatibility:** Chrome/Edge desktop trước; Firefox/Safari nếu File System Access unavailable phải thông báo giới hạn/adapter khác, không tuyên bố hỗ trợ chung.
- **M7.6 Regression CI/local commands:** unit + integration + browser checks + documentation current limitations; Node 22 compatibility cần thử vì Codex báo dùng Node 24.21.0.
- **M7.7 Release candidate gate:** không P0, P1 có test hoặc workaround được chấp thuận; không thêm feature mới khi RC đang khóa.

## 9. M8 — Web integration, đóng gói và release v1

- **M8.1:** Inventory module/contract: `EditorController`, `NoteRepository`, `LinkNavigator`, `AssetResolver`, `WorkspaceService`; tên chỉ là **đề xuất**, đối chiếu code trước khi tạo interface.
- **M8.2:** Web demo package: khởi động độc lập, chọn folder, mở note, Live/Source/Reading, Tabs/Split, Graph/Backlinks; không cần nhóm sync.
- **M8.3:** Host adapter smoke: lưu và đọc thông qua interface có thể thay host. Electron PoC chỉ làm nếu có nhu cầu/host xác định, không làm rộng trước khi product UX ổn.
- **M8.4:** Windows setup guide, screenshots/UAT checklist, hotkey reference, architecture diagram, known limitations và cách thử lại.
- **M8.5:** Một người khác chạy từ README, hoàn thành U1–U5, tạo changelog/release tag **chỉ sau phê duyệt**.

## 10. Ước lượng công sức và cơ chế điều chỉnh

Đây là **dải ước lượng kỹ thuật sơ bộ**, không phải lịch cam kết. M1 đã có phần lớn mã nên thời gian còn lại khác các chặng chưa bắt đầu. Tùy mức “gần Obsidian” được yêu cầu, mỗi gate có thể điều chỉnh scope.

| Chặng | Dải công sức sơ bộ còn lại | Biến số lớn nhất                               |
| ----- | -------------------------- | ---------------------------------------------- |
| M1    | 8–20 giờ                   | Browser FSA, navigation error paths            |
| M2    | 20–40 giờ                  | Reading renderer & mode state                  |
| M3    | 35–70 giờ                  | Caret/IME, advanced syntax, visual consistency |
| M4    | 35–65 giờ                  | Tabs/split ownership và File System API        |
| M5    | 30–60 giờ                  | Foam Core reuse vs UI integration              |
| M6    | 20–40 giờ                  | UI shell/productivity quality                  |
| M7    | 25–50 giờ                  | Security/performance/recovery testing          |
| M8    | 15–35 giờ                  | Host contract & documentation                  |

Các ước lượng được tạo để xếp thứ tự, **chưa dựa trên code audit đầy đủ của các chặng tương lai**. Không xem đây là deadline hoặc khẳng định tiến độ người dùng.

## 11. Quy trình giao việc và quản lý Git

1. ChatGPT xác định **duy nhất một Step ID** và gate; bảo vệ dữ liệu, đừng gọi Codex để khảo sát đơn giản có thể giao Copilot Ask.
2. Copilot Ask đọc repository thực tế, báo file/hàm và gaps; **read-only**.
3. ChatGPT duyệt phương án và phạm vi; Codex viết test trước, sửa code liên quan tối thiểu, chạy checks; **không commit/push tự động**.
4. Người dùng chạy browser test trên disposable workspace; đưa output/screenshots/log khi có lỗi.
5. Review diff mới, không trộn các thay đổi local cũ; chỉ stage chính xác file liên quan; `git diff --cached --check`; commit/push sau khi người dùng đồng ý.
6. Cập nhật `PROJECT_STATUS.md`: trạng thái, test (reported/verified/manual), commit và Step ID tiếp theo. Nếu đổi scope, cập nhật Product Plan + Matrix + Roadmap cùng lúc.
7. Đảm bảo source docs không nói vẫn phải làm PDF/pháp lý: `PRODUCT_PLAN.md` bản V3 là quyết định ưu tiên mới. `AGENTS.md` chỉ nên tham chiếu file hiện hành, giữ các quy tắc repo upstream.

### 11.1. Những điều tuyệt đối không tự động làm

- Không sửa, stage, xóa, revert `.vscode/launch.json`.
- Không tự reset/clean/stash worktree khi có source hoặc docs đang sửa.
- Không đưa PDF/legal domain work vào prompt Codex.
- Không ghi file thật để test lỗi; chỉ dùng workspace disposable và backup khi cần.
- Không gắn nhãn DONE cho Copilot read-only review hoặc test mocks nếu thiếu browser gate yêu cầu.
- Không bắt đầu feature phase mới khi gate P0 trước chưa qua.

## 12. Checklist mở phiên làm việc tiếp theo

1. Đọc `AGENTS.md`, năm docs V3 và `git status -sb`, `git log -1 --oneline` (chỉ đọc).
2. Kiểm tra source hiện tại của `real-note-autosave.ts`, `main.ts` và tests M1.2b còn như báo cáo Codex không; giữ các thay đổi local.
3. **Bắt đầu M1.2b-T1** với A/B markdown disposable. Đây là công việc đang chờ, **không** giao lại Codex implement từ đầu.
4. Nếu T1 PASS, sang T2; nếu T1 FAIL, sửa lỗi với focused test trước.
5. M1.2b-GATE đủ bằng chứng rồi mới M1.3; sau M1 ổn định mới M2.
