# FOAM EDITOR — OBSIDIAN FEATURE PARITY MATRIX V3.1

**Mục đích:** Dùng để so sánh **hành vi thực tế**, chấm chất lượng từng chức năng và quyết định thứ tự cải thiện Foam Editor.
**Ngày lập:** 15/11/2026.
**Cập nhật V3.1:** 16/11/2026.
**Nguồn tham chiếu:** Obsidian Help chính thức, tài liệu dự án cũ và báo cáo M0–M1.2b do người dùng cung cấp. Trạng thái “hiện có” là **bằng chứng lịch sử/reported**, không thay kiểm tra repository và browser mới.

**Baseline đã xác nhận:** `829d2569` — M1.2b accepted with documented limitations tại `bd0e6e71`; M1.3-T1 committed, B1–B5 user-confirmed PASS, Codex-reported 99/99 Vitest PASS trên Node 24.21.0; Node 22 chưa độc lập xác minh. T2.1 design audit hoàn tất read-only; **M1.3-T2a NEXT / NOT IMPLEMENTED tại baseline**. Mã T2a local chưa commit/chưa được nghiệm thu được phân biệt trong [PROJECT_STATUS.md](PROJECT_STATUS.md). Không nâng điểm parity chỉ từ audit hoặc số test; overall M1/M1.3 chưa DONE.

## 1. Thang mức độ tương đương và cách chấm

| Mức    | Ý nghĩa                                      | Bằng chứng tối thiểu                                                |
| ------ | -------------------------------------------- | ------------------------------------------------------------------- |
| **E0** | Chưa có hoặc chưa chứng minh được            | Không có source/test hoặc chưa kiểm chứng                           |
| **E1** | Prototype hiển thị/chạy giới hạn             | Demo một trường hợp; lỗi còn nhiều                                  |
| **E2** | Có workflow cơ bản, nhưng còn gap rõ         | Focused tests + manual happy path                                   |
| **E3** | Tương đối tốt trong phạm vi đã công bố       | Integration+browser+error cases+UX test                             |
| **E4** | Gần Obsidian cho fixture/behavior đã so sánh | Reference comparison + regression + accessibility/IME khi liên quan |

**Quy tắc:** E4 không đồng nghĩa đạt 100% Obsidian; một feature chỉ lên mức mới sau khi có evidence và người dùng xác nhận. Không cộng điểm bằng số lượng test đơn thuần. Chỉ báo tổng quát (nếu muốn) có thể đếm _P0 at E3+_, _P1 at E3+_, không lấy điểm trung bình để che lỗi P0.

## 2. Ma trận các chế độ soạn thảo và xem — ưu tiên hàng đầu

| ID      | Hành vi Obsidian tham chiếu / mục tiêu Foam                            | Trạng thái Foam từ thông tin đã có                               | Đích     | Bước       |
| ------- | ---------------------------------------------------------------------- | ---------------------------------------------------------------- | -------- | ---------- |
| **V01** | **Live Preview** format inline khi edit; caret reveal syntax đúng vùng | Có một phần heading/inline/list/task/link/image; chưa benchmark  | E4 / P0  | M2, M3     |
| **V02** | **Source mode** toàn bộ dấu Markdown raw và editable                   | Chưa xác minh mode độc lập                                       | E3+ / P0 | M2.3       |
| **V03** | **Reading view** render Markdown clean, không edit trực tiếp           | Preview/read-only hiện có nhưng chưa xác minh semantics Obsidian | E3+ / P0 | M2.4       |
| **V04** | Toggle Reading ↔ Editing rõ ràng                                       | Có nút Edit Real File khác mục tiêu modes                        | E4 / P0  | M2.2, M2.5 |
| **V05** | Toggle Live Preview ↔ Source (trong Editing)                           | Chưa xác minh                                                    | E4 / P0  | M2.2, M2.5 |
| **V06** | Chuyển mode giữ Markdown, dirty state, caret/scroll phù hợp            | Chưa xác minh                                                    | E4 / P0  | M2.5       |
| **V07** | Edit + Reading song song cho cùng note, đồng bộ không double-write     | Chưa có bằng chứng triển khai                                    | E3 / P1  | M2.6, M4.5 |
| **V08** | Default mode cho tab mới, status/view switcher                         | Chưa có bằng chứng                                               | E3 / P1  | M2.5, M6.4 |

**Nguồn đối chiếu:** [Obsidian Views and editing mode](https://obsidian.md/help/edit-and-read) và [Settings](https://obsidian.md/help/settings). Một số hành vi shortcut/toolbar của Obsidian có thể khác theo version, nên dựa trên hành vi nhiều hơn sao chép đúng phím tắt mặc định.

### 2.1. Acceptance card — Live Preview

- Đặt caret **ngoài** heading/bold/link/list: preview gọn, không lộ marker dư hoặc thay vị trí dòng.
- Đặt caret **vào** cú pháp: user nhìn và sửa được đúng dấu Markdown gốc, không tạo ghost text; selection trên nhiều đoạn vẫn đọc/gõ đúng.
- Task `[ ]/[x]` click và keyboard đều đổi source; `Ctrl+Z` hoàn nguyên; lỗi mất focus được coi là fail.
- Paste Markdown nhiều dòng, kéo selection qua widget và gõ tiếng Việt IME vẫn giữ văn bản.
- Sau Save/reopen, nội dung nguồn giữ đúng (trừ edit chủ ý), không tự normalize hoặc xóa dấu.

### 2.2. Acceptance card — Source mode

- Raw syntax hiển thị đầy đủ, kể cả YAML frontmatter, triple backticks, Wikilink, GFM table, task markers.
- Chỉnh sửa trực tiếp source; syntax highlighting không can thiệp vào text.
- Mode switch không tạo history entry bất thường làm sai Undo/Redo hoặc reset baseline.
- Document dài vẫn scroll/focus ổn; dùng được IME tiếng Việt và bàn phím.

### 2.3. Acceptance card — Reading view

- Render heading/list/nested list/task/links/images/code/table/callout theo source đã nhập.
- Link mở đúng theo navigation policy; ảnh lỗi có fallback; không chạy script HTML không tin cậy.
- View không trực tiếp thay đổi source bằng gõ. Nếu task tương tác trong Reading được hỗ trợ, có test cập nhật note và Save rõ ràng; nếu chưa, hiển thị disabled nhất quán.
- Quay lại Editing không mất caret/scroll quá mức; cùng Markdown và phiên bản Save.

## 3. Ma trận Markdown rendering / editing

| ID      | Tính năng                                               | Trạng thái báo cáo                                                                    | Ưu tiên / đích | Bước              |
| ------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------- | -------------- | ----------------- |
| **R01** | Heading H1–H6 có cấp typography và caret behavior       | Có một phần trong CodeMirror                                                          | P0 / E4        | M3.1              |
| **R02** | Bold/Italic/Strikethrough/Inline code                   | Có bold/italic/inline; strikethrough chưa xác minh                                    | P0 / E4        | M3.1              |
| **R03** | Bullet/numbered/nested/mixed lists                      | Có phần cơ bản; chưa đo parity                                                        | P0 / E4        | M3.2              |
| **R04** | Click Task và Undo/Redo                                 | UX-01 basic browser PASS; completed-task styling còn gap M2/M3                        | P0 / E4        | M3.2              |
| **R05** | Blockquote nested, cursor movement                      | Có phần cơ bản                                                                        | P0 / E3+       | M3.2              |
| **R06** | Wikilink `[[B]]`, aliases, Ctrl/Cmd+Click               | M0 đã test và user xác nhận                                                           | P0 / E4        | M5.2/3 regression |
| **R07** | Markdown link, fragment, external URL                   | Có link parsing; đầy đủ fragment chưa chứng minh                                      | P1 / E3        | M3.3, M5.3        |
| **R08** | Inline image local/remote, fallback, alt                | UX-01 Image Preview/Lightbox browser PASS; real asset resolver còn gap                | P0/P1 / E3     | M3.3              |
| **R09** | Fenced code blocks, copy, language                      | UX-02a audit: thiếu fenced-code Live Preview và language highlighting; chưa implement | P1 / E3        | M3.4              |
| **R10** | GFM table create/edit/Reading                           | Chưa xác minh                                                                         | P1 / E3        | M3.4              |
| **R11** | Callouts kiểu Obsidian                                  | Chưa xác minh                                                                         | P1 / E3        | M3.4              |
| **R12** | Footnotes, Math/LaTeX                                   | Chưa xác minh                                                                         | P1 / E2–E3     | M3.4              |
| **R13** | Embeds / transclusions                                  | Chưa xác minh                                                                         | P1 / E2–E3     | M3.3              |
| **R14** | YAML Properties/frontmatter chung                       | Chưa có UI tương ứng; không còn scope pháp lý                                         | P1 / E3        | M5.5              |
| **R15** | IME tiếng Việt, undo/redo, paste, selection, long notes | Cần browser test hệ thống                                                             | P0 / E4        | M3.5, M7          |

## 4. Ma trận workspace và điều hướng

| ID      | Feature Obsidian tham chiếu                        | Trạng thái hiện tại theo báo cáo                                                                                     | Ưu tiên / đích | Bước       |
| ------- | -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | -------------- | ---------- |
| **W01** | Disk real-file open/edit/Save                      | M0 DONE; M1.2b accepted tại bd0e6e71 với giới hạn đã ghi nhận                                                        | P0 / E4        | M1         |
| **W02** | Auto-save và Saved/error status                    | M1.2b basic + T2.1–T2.11 browser PASS theo phạm vi; 79/79 reported tại gate; concurrency/Core-only chủ yếu automated | P0 / E4        | M1.2b      |
| **W03** | Seamless navigation (normal path không Save modal) | T1 fallback DONE tại 829d2569, B1–B5 PASS; T2.1 audit read-only DONE; T2a NEXT tại baseline, seamless chưa DONE      | P0 / E4        | M1.3       |
| **W04** | New/rename/move/delete note                        | Chưa triển khai đầy đủ real workspace                                                                                | P1 / E3        | M4.2       |
| **W05** | Nested folder tree/file explorer                   | Real workspace hiện nonrecursive                                                                                     | P1 / E3        | M4.3       |
| **W06** | Multiple tabs, tab close/pin                       | Chưa có bằng chứng                                                                                                   | P1 / E3        | M4.4       |
| **W07** | Split right/down, adjustable panes                 | Chưa có bằng chứng                                                                                                   | P1 / E3        | M4.5       |
| **W08** | Back/forward history, focus/scroll                 | Chưa chứng minh đầy đủ                                                                                               | P1 / E3        | M1.3, M4.4 |
| **W09** | Filename/content search                            | Chưa có UI hoàn chỉnh                                                                                                | P1 / E3        | M4.6       |
| **W10** | Quick switcher / recent notes                      | Chưa có bằng chứng                                                                                                   | P1 / E3        | M6.2       |
| **W11** | Command palette / hotkeys                          | Chưa có bằng chứng đầy đủ                                                                                            | P1 / E3        | M6.1/3     |
| **W12** | Workspaces/layout persistence                      | Chưa có bằng chứng                                                                                                   | P2 / E2        | M4.7+      |

**Nguồn đối chiếu:** [Tabs](https://obsidian.md/help/tabs), [Workspace](https://obsidian.md/help/workspace), [Obsidian Core plugins](https://obsidian.md/help/Plugins/Core%2Bplugins).

## 5. Ma trận Foam knowledge features

| ID      | Hành vi                                       | Trạng thái Foam                                   | Ưu tiên / đích | Bước     |
| ------- | --------------------------------------------- | ------------------------------------------------- | -------------- | -------- |
| **K01** | Wikilink autocomplete + alias insert          | Foam Core support nền; CodeMirror UI chưa đầy đủ  | P1 / E3        | M5.2     |
| **K02** | Link missing, relative path, duplicate title  | Một phần links đã có; advanced cases chưa rõ      | P1 / E3        | M5.3     |
| **K03** | Backlinks pane (linked / unlinked khi hỗ trợ) | Core có graph data; UI chưa đầy đủ                | P1 / E3        | M5.4     |
| **K04** | Outgoing links pane                           | Core data có thể tái sử dụng, UI chưa có xác nhận | P1 / E3        | M5.4     |
| **K05** | Outline / heading navigation                  | Chưa có xác nhận UI                               | P1 / E3        | M5.5     |
| **K06** | Tags/Properties view generic                  | Chưa có xác nhận UI                               | P1 / E3        | M5.5     |
| **K07** | Local Graph focus + click + pan/zoom          | Graph data đã sync; UI chưa tích hợp hoàn chỉnh   | P1 / E3        | M5.6     |
| **K08** | Global Graph search/filter                    | Graph data nền, UI/scale chưa chứng minh          | P1 / E3        | M5.6     |
| **K09** | Graph chỉ phản ánh persisted notes            | Cơ chế M0/M1 có chủ đích; cần hồi quy             | P0 / E4        | M1, M5.7 |

**Nguồn đối chiếu:** [Graph view](https://obsidian.md/help/plugins/graph) và [Core plugins](https://obsidian.md/help/Plugins/Core%2Bplugins).

## 6. Safety, quality, delivery và những thứ cố ý không làm

| ID      | Hành vi                                  | Tình trạng                                                                                                | Yêu cầu                                                      |
| ------- | ---------------------------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| **Q01** | Expected-content conflict guard          | FIX-01/FIX-02 accepted: uniform LF/CRLF/lone CR preserved; mixed read-only; genuine conflict browser PASS | Không overwrite external changes                             |
| **Q02** | Save B while editor C; serialized writes | Automated regressions; browser in-flight race chưa độc lập tái hiện                                       | Persist B baseline, C dirty, later Save C expected B         |
| **Q03** | Permission/IO failure recovery           | Denial/retry, I/O failure/recovery browser PASS; full mid-session revocation chưa xác minh riêng          | Draft preserved; explicit retry; no silent loops             |
| **Q04** | `beforeunload` / unsaved draft           | Reload warning + Cancel browser PASS; pending-write completion/forced-close recovery không bảo đảm        | User-visible limitation, consider recovery snapshots         |
| **Q05** | Browser File System Access support       | Chrome/Edge target; cross-browser not validated                                                           | No false claims Firefox/Safari parity                        |
| **Q06** | Security: Markdown HTML, URL, file path  | Future hardening                                                                                          | No script injection/path traversal                           |
| **Q07** | Test suite + Node runtime                | 99/99 Codex-reported tại T1, Node 24.21.0; Node 22 chưa độc lập xác minh                                  | Record exact environment; rerun at checkpoint                |
| **Q08** | Obsidian-style snapshot recovery         | Not implemented                                                                                           | Evaluate safe opt-in recovery, never silently overwrite disk |

**Cố ý ngoài scope V3.1:** PDF multi-document extraction/OCR; legal metadata/status/expiry; legal dashboards; cloud sync; code-server; SDK lớn, plugin ecosystem và nhiều framework-specific adapters; Canvas và marketplace; external plugin APIs; mobile app; tất cả tính năng Obsidian khác chưa nằm trong matrix. Web là nền tảng phát triển/nghiệm thu chính; Electron chỉ là integration target tương lai, không phải yêu cầu implementation hiện tại. Chỉ giữ editor modularity/host API tối thiểu để reuse, qua Architecture Gate sau M1.5 trước M2. Phần File Recovery của Obsidian là tham chiếu thiết kế, không phải tuyên bố Foam đã có [File recovery](https://obsidian.md/help/plugins/file-recovery).

## 7. Quy trình chấm và cập nhật sau mỗi checkpoint

Mỗi feature nên có một bản ghi gồm: **ID | evidence ref | current E-level | target | defects | gate owner | verified date | commit**. Mốc P0 chỉ được chuyển sang DONE khi các kiểm thử quan trọng và manual browser đều đạt.

**Ví dụ điền trạng thái không suy diễn:**

- `W02 Auto-save`: `ACCEPTED WITH DOCUMENTED LIMITATIONS` tại `bd0e6e71`, browser basic/T2 PASS trong phạm vi ở PROJECT_STATUS; 79/79 reported tại gate, 99/99 reported tại T1 `829d2569`, Copilot PASS WITH MINOR ISSUES. AS-06/07/12/18 chủ yếu automated; không tự nâng E-level hoặc coi full M1 DONE.
- `V02 Source mode`: `PLANNED / E0 not verified` cho tới M2.1 audit; không chắc “không có” nếu code chưa đọc.
- `R06 Wikilink`: `M0 confirmed` với 31.7.1/31.7.2 evidence; regression ở M1+M5 để duy trì mức.

Chỉ cập nhật điểm sau khi người dùng gửi báo cáo/log/browser test tương ứng; mọi “gần Obsidian” phải có fixture so sánh và nêu rõ version/môi trường so sánh.
