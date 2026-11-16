# FOAM EDITOR — QA & ACCEPTANCE PLAYBOOK V3

**Ngày:** 15/11/2026.
**Mục tiêu:** Kiểm chứng Obsidian-like editor bằng workflow thật, không dựa vào số lượng unit test đơn lẻ.
**Phạm vi:** Markdown, views/modes, navigation, workspace, Foam Core và local-first safety. Không có test tách PDF/pháp lý.

## 1. Nguyên tắc nghiệm thu

- **Reported:** Codex/Copilot mô tả kết quả; chưa tự chạy trong cuộc thử hiện tại.
- **Verified automated:** có command, output, Node version, branch/hash và ngày chạy.
- **User-confirmed manual:** người dùng thử Chrome/Edge trên workspace disposable và xác nhận rõ hành vi/disk contents.
- **DONE:** đúng gate của step, không P0 lỗi còn mở, evidence đủ; một suite mock pass không tự thay thế browser File System Access test.
- **Fail safe:** không tắt error để test xanh, không `force overwrite` dữ liệu khác; nếu lỗi cần lưu log, bảo vệ draft rồi mới sửa.

**Bug severity:** `P0` mất dữ liệu, ghi đè file ngoài, wrong-file save, session corruption hoặc source Markdown tự hỏng; `P1` mode view sai chức năng, navigation sai, mất caret/IME thường xuyên; `P2` lỗi thẩm mỹ, animation, minor shortcut.

## 2. Workspace test chuẩn (không đụng vault thật)

**Thư mục đề nghị:** `D:\Projects\foam-autosave-test` (Windows). Có thể đặt tên khác nếu người dùng muốn; chỉ chỉnh lệnh theo đường dẫn thật. Dùng folder khác repo và khác tài liệu quan trọng.

**A.md**

```markdown
# Ghi chú A

Đây là nội dung để thử Auto-save, Live Preview và Source mode.

## Công việc

- [ ] Task A1
- [x] Task A2
- Mục thường **in đậm** và _in nghiêng_

> Một đoạn blockquote.

[[B|Đến ghi chú B]]
```

**B.md**

```markdown
# Ghi chú B

Ghi chú đích để thử điều hướng và Backlinks.

[[A]]
```

**Nội dung mở rộng chỉ dùng ở bước M3:** `syntax-sample.md` có table, fenced JS code, nested list, callout, link/ảnh local; ảnh đặt `assets/test.png` khi repository hỗ trợ. Không thêm file/folder nested trước khi tính năng đó được triển khai; tránh nhầm lỗi chưa support với regression.

**PowerShell kiểm tra disk (sau khi tạo folder):**

```powershell
Get-Content 'D:\Projects\foam-autosave-test\A.md' -Raw
Get-FileHash 'D:\Projects\foam-autosave-test\A.md' -Algorithm SHA256
```

**Khởi động PoC** (nếu môi trường vẫn tương ứng):

```powershell
cd D:\Projects\foam-custom\experiments\codemirror6-poc
npm.cmd run dev
```

Không tự nhận cổng 5173 nếu Vite thông báo cổng khác. Không yêu cầu `npm install` khi dependencies đã có; không xóa cache/node_modules vô cớ.

## 3. M1.2b-T1 — Kịch bản kiểm thử đầu tiên, từng bước

| ID        | Thao tác                                                                      | Kết quả PASS                                                | Bằng chứng          |
| --------- | ----------------------------------------------------------------------------- | ----------------------------------------------------------- | ------------------- |
| **AS-01** | Chọn folder thử, mở `A.md`, bấm Edit Real File, cấp quyền nếu browser yêu cầu | UI cho sửa, không error                                     | Ảnh trạng thái Edit |
| **AS-02** | Thêm dòng `AUTOSAVE_TEST_01`, ngừng gõ 2–3 giây, **không bấm Save**           | UI hiển thị Saving rồi Saved; không cần Save thủ công       | Ảnh status/timing   |
| **AS-03** | Mở PowerShell riêng kiểm tra `A.md`                                           | Marker có mặt trên disk, các dòng cũ còn nguyên             | `Get-Content -Raw`  |
| **AS-04** | Reload trang, cấp quyền folder lại nếu cần, mở `A.md`                         | Marker vẫn còn, không bị source transformation ngoài ý muốn | Ảnh reopened editor |

**Điểm dừng:** Nếu AS-01/02/03/04 FAIL, không chuyển sang M1.3 hoặc mode features; đưa log/screenshots về ChatGPT để xác định bug và sửa focused.

## 4. M1.2b-T2 — Concurrency, error & lifecycle

| ID        | Kịch bản                                                         | Expected behavior                                                              | Cách thực hiện                               |
| --------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------ | -------------------------------------------- |
| **AS-05** | Gõ 5–10 chỉnh sửa nhanh                                          | Sau debounce lưu nội dung cuối; không ghi từng phím                            | Browser + disk read                          |
| **AS-06** | Snapshot B đang ghi, editor gõ C                                 | Baseline ghi B, C dirty, sau đó disk C; expectedContent B                      | Deferred Promise integration + browser smoke |
| **AS-07** | Click Save khi auto-save pending/in-flight                       | Không double-write, kết quả nhất quán                                          | Spy test + browser                           |
| **AS-08** | Quyền bị từ chối trước auto-save                                 | Không mất draft, báo Permission required, Save click có thể xin lại            | Chrome/Edge permission UI                    |
| **AS-09** | Permission bị revoke giữa hai lần save                           | Không retry vô hạn, draft còn, manual retry                                    | Permission UI + disk check                   |
| **AS-10** | File bên ngoài thay đổi trước auto-save                          | Conflict, disk external version nguyên, editor draft nguyên                    | Sửa A.md bằng PowerShell/editor ngoài        |
| **AS-11** | Disk write thất bại                                              | Không báo Saved, cho retry; không ảnh hưởng note khác                          | Repository mock/fault injection              |
| **AS-12** | Disk OK, Core sync fail                                          | Status phân biệt `Disk saved; Core sync failed`; retry Core không ghi lại disk | Integration fault injection                  |
| **AS-13** | Click Wikilink khi editor dirty & saving                         | Không mất draft, không stale navigation                                        | Browser A→B                                  |
| **AS-14** | Explorer / workspace switch / Return to Sample trong lúc pending | Không silent discard, suspend/resume/flush và fallback đúng                    | Browser + mocked delays                      |
| **AS-15** | Cancel trong fallback rồi tiếp tục gõ                            | Draft còn, Auto-save resume hợp lệ                                             | Browser                                      |
| **AS-16** | Discard trong fallback                                           | Chỉ bỏ draft khi đã chọn, không hủy write đang diễn ra                         | Browser + integration                        |
| **AS-17** | Reload/close khi dirty/pending                                   | Cảnh báo khi hỗ trợ; không hứa async write hoàn tất                            | Browser, có log                              |
| **AS-18** | Sample/localStorage editing                                      | Không bị coordinator real-file ghi sang disk                                   | Integration + browser                        |

**Giới hạn test:** Để chủ động giữ Save đang pending nhiều giây hoặc Core sync fail, cần mock/fault injection hoặc test harness. Đừng cố phá file thật, revoke bừa quyền folder chính hoặc dựa vào tốc độ I/O nhanh để khẳng định AS-06/12 đã được kiểm thử.

## 5. M2 — Mode/view acceptance matrix

| ID        | Kịch bản                                                  | Pass criteria                                                       |
| --------- | --------------------------------------------------------- | ------------------------------------------------------------------- |
| **MV-01** | Live Preview gõ Heading/Bold/List; caret vào và ra syntax | Markers reveal có kiểm soát, không nhảy text/caret                  |
| **MV-02** | Source mode của cùng note                                 | Thấy đủ Markdown gốc, có thể sửa raw không làm mất ký tự            |
| **MV-03** | Reading view                                              | Định dạng đúng, gõ keyboard không âm thầm sửa source                |
| **MV-04** | Live → Source → Reading → Live khi dirty                  | Content không mất, baseline không reset, Undo/Redo vẫn đúng         |
| **MV-05** | Toggle mode khi Auto-save in-flight                       | Không tạo Save thứ hai, không ghi nhầm note                         |
| **MV-06** | Giữ scroll/focus ở tài liệu dài                           | Không nhảy về đầu vô cớ; caret trở lại vị trí chấp nhận được        |
| **MV-07** | Same note ở Edit pane và Reading pane                     | Không double-write hoặc stale-render; trạng thái synced theo policy |
| **MV-08** | Default mode và shortcut                                  | Toolbar/status rõ; shortcuts không conflict với editing             |

## 6. M3 — Markdown và editor mechanics

| ID        | Fixture                                              | Pass criteria                                                                 |
| --------- | ---------------------------------------------------- | ----------------------------------------------------------------------------- |
| **MD-01** | H1–H6, inline formatting, nested styling             | Syntax khi caret edit, hierarchy khi đọc, raw source intact                   |
| **MD-02** | Nested ordered/unordered mixed lists                 | Indent/bullet ổn, Enter/Backspace/Undo đúng                                   |
| **MD-03** | Task `[ ]/[x]`                                       | Click đổi raw syntax, Undo/Redo hoàn nguyên, không làm lộ marker ngoài ý muốn |
| **MD-04** | Multi-line blockquote/code fence                     | Không phá block, caret đúng dòng                                              |
| **MD-05** | Wikilink alias + normal Markdown link                | Editing click convention và Reading navigation consistent                     |
| **MD-06** | Local/remote/broken image, alt text                  | Preview hợp lệ, fallback rõ, path sửa được                                    |
| **MD-07** | Table, callout, code block, math/footnote (nếu ở v1) | Live/Source/Reading preserve data, phần không hỗ trợ được công bố             |
| **MD-08** | Vietnamese IME, paste 100 dòng, select + undo        | Không mất/nhân đôi ký tự, editor không kẹt focus                              |
| **MD-09** | Markdown raw diff trước/sau view-only switches       | Không có thay đổi source ngoài chủ đích                                       |
| **MD-10** | Large document + many widgets                        | Scroll và typing chấp nhận được, có số đo ghi nhận                            |

## 7. M4–M6 — Workspace, knowledge UI, productivity

| ID        | Workflow test                                 | Expected                                                    |
| --------- | --------------------------------------------- | ----------------------------------------------------------- |
| **WS-01** | Create A/B, edit, save, reopen                | Không mất file/text                                         |
| **WS-02** | Rename/move nested note; resolve old/new link | Không overwrite/collision silent; graph refresh theo policy |
| **WS-03** | Delete note có confirmation                   | Không xóa sai note hoặc ra ngoài workspace                  |
| **WS-04** | Multiple tabs và rapid switching              | No wrong-file save; correct active tab                      |
| **WS-05** | Split Edit A / Read A; Edit B in other pane   | Chỉ một write owner per note, no stale content              |
| **WS-06** | Search filename/content, quick switch         | Kết quả đúng sau Save, rename, delete                       |
| **FO-01** | `[[` autocomplete alias/paths                 | Select đúng target, Unicode, escape/keyboard                |
| **FO-02** | Backlinks/outgoing links sau Save             | Core/Graph chỉ phản ánh persisted Markdown                  |
| **FO-03** | Local/global Graph node click, pan/zoom       | Link graph đúng, không lag/hỏng navigation                  |
| **FO-04** | Outline, Tags, generic YAML Properties        | Điều hướng đúng; unknown YAML preserved                     |
| **UX-01** | Command palette, hotkeys, tab order           | Keyboard-only chính yếu chạy được                           |
| **UX-02** | Settings default mode, theme, readable width  | Không làm thay đổi note source hoặc Save baseline           |

## 8. Regression và gate theo release

| Gate     | Bắt buộc                                                           | Bằng chứng                            |
| -------- | ------------------------------------------------------------------ | ------------------------------------- |
| **M1**   | AS-01–04; relevant AS-05–18; old Wikilink tests; disk/Graph safety | Test log + browser/screenshots + hash |
| **M2**   | MV-01–08 + AS regressions; no unexpected Markdown diff             | Before/after/source + browser         |
| **M3**   | MD-01–10 relevant, mode consistency; IME/Undo                      | Fixture outputs, test/build           |
| **M4**   | WS-01–06 và M1 safeguards                                          | Browser workspace walkthrough         |
| **M5**   | FO-01–04, graph persisted-only                                     | Test data/graph screenshots           |
| **M6**   | UX-01–02 và mode toggles                                           | Keyboard walkthrough                  |
| **M7**   | Recovery/a11y/performance/security checklists                      | Measured baselines and issue list     |
| **V1.0** | Người khác tự chạy theo README, U1–U5 đều PASS, không P0           | Signed-off user acceptance record     |

## 9. Mẫu báo cáo sau mỗi test / checkpoint

```text
Step ID:
Ngày thực hiện:
Git branch / HEAD:
Tình trạng worktree đáng chú ý:
Node / browser / OS:
Test tự động: (lệnh, passed/failed, reported hay trực tiếp)
Manual scenario IDs: (PASS/FAIL/NOT RUN)
File disk trước/sau (nếu có):
Ảnh/log evidence:
Bugs (P0/P1/P2):
Giới hạn/điểm chưa thử:
Kết luận: GO / NO-GO
Bước kế tiếp:
Commit/push: (chỉ khi đã được phê duyệt)
```

## 10. An toàn Git, môi trường và dữ liệu

- Không thay đổi `.vscode/launch.json`; không tự reset/stash/clean; chỉ stage đúng file scope khi người dùng cho phép.
- Dev trên `dev/codemirror6-poc`, xác minh `git status -sb`, `git log -1 --oneline` trước checkpoint.
- Lệnh test của PoC cần đối chiếu `package.json` tại thời điểm chạy; Codex đã báo dùng Node 24.21.0 trong khi AGENTS yêu cầu Node 22, phải phân biệt kết quả.
- Không sử dụng dữ liệu PDF hoặc regulatory files làm required fixtures trong roadmap mới.
- Đừng gán việc kéo thả, đa pane hay Canvas là DONE chỉ vì Obsidian có; phải có code và bằng chứng Foam tương ứng.
- Khi manual browser test thất bại, ưu tiên sao lưu draft và ghi log trước khi sửa code/hủy session.

## 11. Tham chiếu chính thức Obsidian (behavior, không phải nguồn mã)

- [Views and editing modes](https://obsidian.md/help/edit-and-read)
- [Editor settings](https://obsidian.md/help/settings)
- [Tabs and linked views](https://obsidian.md/help/tabs)
- [Workspace](https://obsidian.md/help/workspace)
- [Core plugins](https://obsidian.md/help/Plugins/Core%2Bplugins)
- [Graph view](https://obsidian.md/help/plugins/graph)
- [File recovery](https://obsidian.md/help/plugins/file-recovery)

Lưu ý: các tính năng Obsidian có thể đổi theo version; ưu tiên hành vi tham chiếu và ghi ngày thực tế đã so sánh trong test record. Không tái sử dụng source/proprietary assets của Obsidian.
