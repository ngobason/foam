# FOAM EDITOR — PRODUCT PLAN V3.1

**Ngày điều chỉnh:** 15/11/2026
**Cập nhật V3.1:** 16/11/2026 — ưu tiên editor trên Web và tái sử dụng tối thiểu.
**Chủ đề:** Trình soạn thảo Markdown và ứng dụng ghi chú ngày càng gần trải nghiệm Obsidian.
**Trạng thái:** Định hướng mới được người dùng yêu cầu. Mốc triển khai vẫn phải được kiểm chứng theo `PROJECT_STATUS.md`.

> **Quyết định sản phẩm có hiệu lực từ bản V3:** Ưu tiên tối đa các chế độ soạn thảo, chế độ xem, Live Preview và workflow ghi chú giống Obsidian. **Loại khỏi roadmap**: tách/trích xuất nhiều tài liệu từ PDF; pipeline OCR/AI cho PDF; mô hình, hiệu lực và dashboard văn bản pháp luật/quy định; quan hệ pháp lý chuyên biệt. Không lấy các mục đó làm tiêu chí nghiệm thu. Hai roadmap tháng 10/2026 chỉ là tài liệu lịch sử để tái sử dụng các hạng mục editor/core còn phù hợp.

## 1. Mục tiêu sản phẩm và nguyên tắc thành công

Foam Editor là **Markdown Editor local-first giống Obsidian**, sử dụng **CodeMirror 6** cho editing và **Foam Core** cho workspace, Wikilinks, liên kết và Graph. **Web là nền tảng phát triển và nghiệm thu chính**. Ưu tiên Live Preview, Source Mode, Reading View, Markdown fidelity, Wikilinks, Backlinks, Graph và editor UX. Electron chỉ là đích tích hợp tương lai, không phải yêu cầu implementation hoặc gate hiện tại. Đích không phải sao chép toàn bộ Obsidian hoặc chuyển nguyên source/plugin của Obsidian; đích là **trải nghiệm tương đương ở các hành vi quan trọng**, được kiểm thử bằng những kịch bản ghi chú thật.

**Năm trụ cột sản phẩm đã thay đổi:**

1. **Editing Modes & Views:** có ba trạng thái rõ ràng _Live Preview_, _Source mode_, _Reading view_, đổi chế độ nhanh, cùng một nguồn Markdown, giữ trạng thái chỉnh sửa và bố cục ổn định.
2. **Live Preview fidelity:** khi đọc thấy nội dung định dạng; khi sửa chọn đúng cú pháp Markdown. Chú trọng caret/selection, Undo/Redo, clipboard, task, list, heading, quote, links, image, code, table/callout, tiếng Việt IME và tài liệu dài.
3. **Workspace UX:** file explorer, note create/open/rename/move/delete an toàn; tab/split-pane; tìm kiếm/quick switch; history/back-forward; trạng thái Save dễ hiểu, navigation mượt.
4. **Foam knowledge navigation:** dùng lại Foam Core cho Wikilink, alias, autocomplete, Backlinks, Outgoing links, Outline, Tags và global/local Graph. Không dựng thêm graph/index trùng khi Core đã có.
5. **Chất lượng, khả năng tái sử dụng:** local-first, Auto-save an toàn, phục hồi dữ liệu, accessibility, performance và test automation trên Web; chỉ giữ editor modularity, host boundary và API tối thiểu cần cho reuse. Nhóm khác có thể phụ trách tích hợp ứng dụng cuối; không xây SDK lớn hoặc nhiều adapter theo framework.

### 1.1. Khi nào có thể nói “gần Obsidian”?

So sánh theo **hành vi cụ thể**, không chỉ màu sắc hoặc ảnh chụp. Một tính năng đạt chất lượng khi: thao tác chính tương đương, không hỏng Markdown gốc, xử lý lỗi rõ ràng, ổn định với keyboard/IME, và có test + kiểm thử trong trình duyệt. Mức độ được mô tả ở `OBSIDIAN_FEATURE_MATRIX.md`: E0 đến E4; **E4** là mức đáp ứng hành vi tham chiếu đã kiểm tra chứ không có nghĩa bằng Obsidian ở mọi trường hợp.

### 1.2. Luật ưu tiên

- **P0 / phải có trước khi mở rộng:** không mất dữ liệu; real note open/edit/auto-save/reopen; ba chế độ xem; chuyển mode an toàn; tương tác Live Preview quan trọng; điều hướng cơ bản.
- **P1 / mục tiêu v1:** UI workspace đủ dùng với tabs/split, file CRUD, search, quick switch, Foam Backlinks/Graph, code/table/callout/attachments, phím tắt, accessibility và regression.
- **P2 / cân nhắc sau v1:** Canvas tương đương Obsidian, mobile hoàn chỉnh, multi-window nâng cao, themes sâu và collaboration; không tự mở rộng scope hiện tại.

**Không nằm trong phạm vi V3.1:** PDF extraction/import/OCR; quản lý quy định pháp luật, auto-expire hoặc business workflows pháp lý; cloud sync và đồng bộ Git đa thiết bị của nhóm khác; code-server; SDK lớn, plugin ecosystem/marketplace, nhiều framework-specific adapters hoặc clone 100% Obsidian. **Generic YAML frontmatter / Properties** vẫn trong phạm vi Markdown thông thường, không có schema pháp lý. Các đề xuất plugin/cloud trong V3 cũ không còn là cam kết roadmap V3.1.

## 2. Mô hình mode/view phải triển khai đúng

| Khái niệm                       | Vai trò                                                                                 | Điều kiện nghiệm thu                                                                          |
| ------------------------------- | --------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| **Editing View — Live Preview** | Một editor có Markdown được render trực tiếp; syntax chỉ lộ phù hợp tại caret/selection | Con trỏ vào Heading/Bold/List/Task đúng vị trí, không nhảy; gõ/sửa/undo vẫn là Markdown thuần |
| **Editing View — Source mode**  | Hiển thị toàn bộ cú pháp Markdown gốc trong vùng edit                                   | Có thể sửa raw Markdown trực tiếp; không rớt dấu `#`, `*`, `[[ ]]`, backticks hoặc YAML       |
| **Reading View**                | Render tài liệu để đọc, không thể sửa trực tiếp text                                    | Heading/List/Task/Link/Image/Code/Table cùng ý nghĩa với Markdown; link/outline dùng được     |
| **View switch**                 | Chuyển giữa Editing ↔ Reading; chọn Live ↔ Source trong Editing                         | Không tạo bản copy file, không mất draft, không reset baseline, giữ note và vị trí đọc hợp lý |
| **Split / linked pane**         | Hiển thị hai ghi chú hoặc cùng một ghi chú theo view khác nhau                          | Không tạo hai owner của trạng thái Save; thay đổi phải nhất quán hoặc hạn chế được ghi rõ     |

**Chuẩn tham chiếu:** Obsidian chính thức phân biệt _Views_ (Reading/Editing) với _Editing modes_ (Live Preview/Source); khi caret đi vào nội dung đã định dạng, Live Preview lộ cú pháp cần chỉnh. Xem [Views and editing mode](https://obsidian.md/help/edit-and-read) và [Editor settings](https://obsidian.md/help/settings). Nhận định về Foam Editor là **mục tiêu thiết kế**, không phải tính năng đã nghiệm thu.

## 3. Người dùng mục tiêu và luồng sử dụng chính

**Đối tượng chính:** người dùng ghi chú Markdown cá nhân hoặc làm việc với một workspace chứa nhiều file `.md` trên máy, cần chỉnh sửa nhanh, liên kết, tổ chức và xem nội dung giống Obsidian.

**Luồng U1 — Gõ và chuyển mode:** mở A.md → Live Preview → gõ Heading/List/Task → kiểm tra chữ/marker quanh caret → chuyển Source để thấy Markdown gốc → Reading để xem kết quả → trở lại Live Preview mà không mất văn bản/con trỏ hoặc gây ghi đĩa bất thường.

**Luồng U2 — Ghi chú liên kết:** tạo A/B trong subfolder → nhập `[[B|Alias]]` → autocomplete gợi ý → Ctrl/Cmd+Click (hoặc navigation theo mode) mở B → quay lại A → Backlinks và local Graph phản ánh file đã lưu.

**Luồng U3 — Làm việc đa vùng:** mở hai tab/đôi pane A và B → Edit A, Reading B → tìm kiếm ghi chú, mở Outline, Backlinks → đổi focus, đóng tab, mở lại workspace không mất dữ liệu.

**Luồng U4 — Nội dung phong phú:** Markdown chứa image local, remote, code fence, table, callout và link; Live Preview/Reading render đúng; Source bảo toàn source; lỗi asset được giải thích và không phá document.

**Luồng U5 — Lỗi lưu:** file ngoài editor thay đổi / quyền ghi bị từ chối / ghi thành công nhưng Core sync lỗi → giữ draft, cho thử lại hoặc fallback an toàn, không báo “Saved” sai và không ghi đè file âm thầm.

## 4. Kiến trúc mục tiêu và nguyên tắc kế thừa

```text
                     WEB APP (nghiệm thu) / FUTURE HOST
                                      |
                    WORKSPACE SHELL (tabs/panes/sidebars)
                                      |
           APP + SESSION CONTROLLER (mode, dirty, save, navigation)
                |                        |                 |
         CODEMIRROR 6                FOAM CORE        REPOSITORY
       Edit/Live Preview/           Workspace/        File access,
       source selection             links/graph       assets/conflict
                |                        |                 |
          READING RENDERER       BACKLINKS/GRAPH       LOCAL .MD/ASSETS
          (same Markdown)        OUTLINE/SEARCH
```

- CodeMirror giữ editor transactions, selection, widgets/decorations; không sở hữu filesystem hoặc logic FoamGraph.
- Session controller giữ active note, mode/view, revision và Save lifecycle. Không có hai đường ghi hoặc baseline cạnh tranh.
- Foam Core xử lý link resolution, note indexing và graph; chỉ publish revision đã được lưu thành công. Core phải không import thẳng `vscode` hay DOM; adapter host ở rìa.
- Repository adapter xử lý list/read/write, permissions, `expectedContent`, rename/delete và assets; browser File System Access API có giới hạn sandbox. Chỉ giữ boundary cần thiết cho host tương lai; chưa implement Electron adapter.
- Reading renderer và Live Preview dùng cùng parse semantics/fixtures khi khả thi; không tự sửa hoặc chuẩn hóa Markdown nếu người dùng không yêu cầu.
- Mode switch là thay đổi UI/session state, **không phải** chuyển sang một hệ lưu thứ hai.

**Architecture Gate sau M1.5, trước M2:** kiểm tra Editor/Session/Foam Core/Repository/Host, thống nhất document/persistence ownership, chỉ tách module và xác định host API tối thiểu khi có nhu cầu reuse thực tế, kèm focused boundary tests. Đây là review và điều chỉnh nhỏ, không phải dự án SDK/Electron. Cleanup theo DoD của [roadmap](IMPLEMENTATION_ROADMAP.md): kiểm tra reference/regression trước khi xóa, giữ bằng chứng lịch sử, tests hữu ích và Core đang dùng.

## 5. Tiêu chí hoàn thành theo bản phát hành

| Cột mốc                                | Trải nghiệm chứng minh được                                            | Điều kiện cứng                                                   |
| -------------------------------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------------- |
| **V0.2 — Editor foundation**           | Auto-save thật + seamless navigation + Live/Source/Reading chuyển được | M1/M2 gates pass, không có P0 data loss                          |
| **V0.3 — Rich Markdown**               | Live Preview sử dụng hằng ngày, renderer Reading nhất quán             | Regression caret, IME, undo, syntax matrix pass                  |
| **V0.4 — Workspace UI**                | CRUD, explorer thư mục, tabs và split panes, search                    | Safe file lifecycle + E2E navigation pass                        |
| **V0.5 — Foam knowledge**              | Autocomplete, Backlinks, Outline, Graph thao tác được                  | Core-derived links reflect persisted notes                       |
| **V0.8 — Productivity / RC**           | Quick switch, commands, settings, recovery, performance                | Error/recovery + a11y + scale smoke pass                         |
| **V1.0 — Usable Obsidian-like Editor** | Một người khác chạy Web độc lập và hoàn thành U1–U5                    | UAT + README + stable artifact; minimal host boundary documented |

Đây là **mốc năng lực** chứ không phải nhãn version đã tạo hoặc lời hứa ngày release. Các giai đoạn có thể được điều chỉnh theo kết quả browser test và độ khó trong source thực tế.

## 6. Phạm vi khuyến nghị của v1 và phần để sau

**V1 bắt buộc:** Editing Live Preview + Source; Reading View; switch an toàn; auto-save; undo/redo/IME; Markdown cơ bản + code/table/callout/image; file lifecycle, workspace navigation, tabs/split tối thiểu; Wikilink/backlinks/graph; tìm kiếm/quick switch; basic properties/outline; error/recovery; tài liệu và demo Web có thể tự chạy.

**V1 có thể giảm cấp nếu khó:** 2 pane thay vì layout tùy ý; Graph local trước global advanced; generic Properties đọc/sửa frontmatter cơ bản, chưa cần editor dạng database; chỉ desktop browser Chrome/Edge support File System Access API trước. Chỉ tài liệu hóa host API tối thiểu; Electron packaging/tích hợp do giai đoạn hoặc nhóm khác xử lý khi được duyệt riêng.

**Sau v1:** có thể xem xét Canvas kiểu Obsidian, tabs nhiều cửa sổ, Publish, mobile và theme nâng cao khi được duyệt riêng. Electron là tích hợp tương lai; SDK/plugin ecosystem/code-server/cloud sync không nằm trong kế hoạch hiện tại. Không âm thầm đổi những hạng mục P1 thành “đã có” nếu chưa qua gate.

## 7. Nguồn, trạng thái và quản lý thay đổi

- Nguồn tham khảo từ người dùng: `Lộ trình phát triển Foam theo hướng Obsidian`, 11/10/2026 (14 trang): đặc biệt phần định nghĩa trải nghiệm (tr. 2–4), kiến trúc Core/CM6 (tr. 6), MVP/UI (tr. 7–8), kiểm thử/Git (tr. 13–14). Chỉ lấy phần còn phù hợp; không dùng mốc Bước 28/30 để kết luận trạng thái hiện tại.
- Nguồn tham khảo từ người dùng: `Lộ trình Foam Editor từ 31.7 đến V1`, 27/10/2026 (25 trang): kế thừa M0/31.6–31.7, Save conflict, Workspace, Live Preview, Foam/Core, QA và cơ chế agent. Loại hẳn các chặng Metadata pháp lý, PDF Import, Legal Visualization.
- Mô tả tính năng Obsidian được tham chiếu từ tài liệu chính thức tại thời điểm lập: [Editing modes](https://obsidian.md/help/edit-and-read), [Tabs](https://obsidian.md/help/tabs), [Workspace](https://obsidian.md/help/workspace), [Core plugins](https://obsidian.md/help/Plugins/Core%2Bplugins), [Graph](https://obsidian.md/help/plugins/graph), [File recovery](https://obsidian.md/help/plugins/file-recovery).
- **Nguồn sự thật theo nhiệm vụ:** định hướng sản phẩm tại đây; roadmap ở `IMPLEMENTATION_ROADMAP.md`; so sánh feature tại `OBSIDIAN_FEATURE_MATRIX.md`; bằng chứng thực tế tại `PROJECT_STATUS.md`; kiểm thử ở `QA_ACCEPTANCE.md`; quy tắc Git/agent giữ ở `AGENTS.md` hiện có.
- Chỉ đánh dấu **DONE** theo bằng chứng; thông tin cuối từ báo cáo Codex/Copilot là **reported**, không thay thế Git local và manual browser acceptance.
