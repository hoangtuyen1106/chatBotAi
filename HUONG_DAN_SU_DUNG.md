# Hướng Dẫn Sử Dụng — AI Chat Bot RAG

Tài liệu này mô tả cách sử dụng ứng dụng và **logic xử lý nội bộ** của từng tính năng. Đối tượng đọc: người dùng cuối + lập trình viên cần hiểu luồng hệ thống.

> Trạng thái: hoàn tất Phase 0–7 (backend + frontend + production hardening). Phase 8 (JWT cookie, Pinecone/Anthropic thật, client Dockerfile, vitest) đã hoãn lại.

---

## 1. Tổng Quan Ứng Dụng

Ứng dụng cho phép người dùng:
1. **Đăng ký / đăng nhập** tài khoản (email + mật khẩu).
2. **Tải lên tài liệu** (PDF / DOCX / CSV / TXT, ≤ 25 MB).
3. **Trò chuyện với AI** — AI trả lời dựa trên nội dung tài liệu của chính người dùng đó (RAG — Retrieval-Augmented Generation), kèm trích dẫn nguồn `[#1] [#2]`.

### Kiến trúc tổng thể

```
┌─────────────┐      ┌──────────────┐      ┌──────────────┐
│  Trình duyệt│ ───▶ │  API Express │ ───▶ │  PostgreSQL  │ (users, docs, chats, vectors)
│  (React+TS) │      │  (Node + TS) │      │  + pgvector  │
└─────────────┘      └──────────────┘      └──────────────┘
                            │
                            ├──▶ Redis (cache, hàng đợi Bull)
                            ├──▶ MinIO/S3 (file gốc)
                            └──▶ Worker (parse → chunk → embed)
                                       │
                                       └──▶ Ollama (local LLM + embedding)
                                            - qwen2.5:14b  (chat)
                                            - bge-m3       (embedding 1024 chiều)
```

---

## 2. Cách Khởi Động Ứng Dụng

### 2.1. Yêu cầu môi trường
- Docker Desktop (Windows/Mac) hoặc Docker Engine (Linux).
- Node.js 20+ (chạy frontend dev hoặc backend dev không qua Docker).
- Ollama cài trên máy host: chạy `ollama pull qwen2.5:14b` và `ollama pull bge-m3`.
- File `.env` ở thư mục gốc — copy từ `.env.example`, điền giá trị thật.

### 2.2. Khởi động hạ tầng (Postgres + Redis + MinIO + API + Worker)
```bash
docker compose up -d
```

Kiểm tra: `curl http://localhost:4000/health/ready` → `{ status: "ok", checks: { postgres: "ok" } }`.

### 2.3. Khởi động frontend
```bash
cd client
npm install
npm run dev
```
Truy cập `http://localhost:5173`.

### 2.4. Lệnh hữu ích
- `npm --prefix server run migrate` — chạy migration database.
- `npm --prefix server run typecheck` / `lint` / `build`.
- `npm --prefix client run typecheck` / `lint` / `build`.
- `docker compose logs -f api worker` — xem log real-time.

---

## 3. Hướng Dẫn Sử Dụng (Cho Người Dùng Cuối)

### 3.1. Đăng ký / Đăng nhập
1. Mở `http://localhost:5173/` → click **Đăng ký**.
2. Nhập email + mật khẩu (≥ 8 ký tự).
3. Sau khi đăng ký, hệ thống tự đăng nhập và chuyển vào giao diện chat.

### 3.2. Tải lên tài liệu
1. Vào tab **Tài liệu** (icon ở header desktop hoặc tab bar mobile).
2. Kéo-thả file vào vùng upload, hoặc click chọn file.
3. Định dạng hỗ trợ: PDF, DOCX, CSV, TXT. Giới hạn 25 MB.
4. Trạng thái tài liệu sẽ chuyển: `pending` → `processing` → `ready` (UI tự refresh mỗi 2 giây).
5. Khi `ready`, tài liệu sẵn sàng để hỏi.

### 3.3. Trò chuyện
1. Vào tab **Chat**.
2. Gõ câu hỏi (tiếng Việt khuyến nghị) → Enter để gửi (Shift+Enter xuống dòng).
3. AI sẽ stream từng từ, kèm thẻ trích dẫn `[#1] [#2]`.
4. Click vào phần "Nguồn tham khảo" để xem đoạn văn gốc được dùng.
5. Lịch sử các cuộc trò chuyện hiển thị ở sidebar trái — click để mở lại.
6. Có thể nhấn **Dừng** để hủy giữa chừng (phần đã trả lời được lưu với cờ `truncated`).

### 3.4. Đổi giao diện sáng/tối
- Click icon Sun/Moon/Laptop ở header → cycle giữa: light → dark → system.

---

## 4. Logic Xử Lý Chi Tiết

### 4.1. Luồng Đăng ký / Đăng nhập

**Đăng ký** (`POST /auth/register`):
1. Client gửi `{ email, password }` qua proxy `/api/auth/register`.
2. Backend (`server/src/services/auth.ts`) validate bằng zod (email hợp lệ, password ≥ 8 ký tự).
3. Hash password bằng bcrypt với cost = 12.
4. Insert vào bảng `users` (email kiểu `citext` để không phân biệt hoa/thường, id = UUID v4 từ pgcrypto).
5. Sinh JWT (HS256, 7 ngày) chứa `{ userId, email }` → trả về client.
6. Client lưu token vào `localStorage['chatbot.token']`.

**Đăng nhập** (`POST /auth/login`):
1. Tìm user theo email trong `users`.
2. Nếu không tìm thấy: vẫn so sánh với một bcrypt hash giả (constant-time) để tránh **timing attack** lộ email tồn tại hay không.
3. Nếu tìm thấy: bcrypt.compare(password, password_hash).
4. Sai → 401. Đúng → ký JWT mới, trả về.

**Bảo vệ route**: middleware `requireAuth` ([server/src/middleware/requireAuth.ts](server/src/middleware/requireAuth.ts)) đọc header `Authorization: Bearer <token>`, verify JWT, gắn `req.userId`. Nếu sai → 401.

**Rate-limit**:
- Global: `RATE_LIMIT_MAX × 5` request / 15 phút / IP cho mọi route trừ `/health`.
- `/auth/*`: `RATE_LIMIT_MAX` (chặt hơn, chống brute-force).
- `/chat/*`, `/chats/*`: cùng mức `RATE_LIMIT_MAX`.

### 4.2. Luồng Upload + Ingestion (Parse → Chunk → Embed → Lưu vector)

**Bước 1 — HTTP upload (`POST /upload`)**:
1. Client gửi `multipart/form-data` với field `file`.
2. Multer load buffer vào RAM (giới hạn `UPLOAD_MAX_MB`, mặc định 25).
3. Sniff **magic bytes** bằng `file-type` để xác định MIME thật (chống giả mạo Content-Type). Fallback cho `text/plain` và `text/csv` (file text không có magic bytes rõ ràng).
4. Kiểm tra MIME có nằm trong allowlist `UPLOAD_ALLOWED_MIME` không. Nếu không → 415.
5. Upload buffer lên S3/MinIO theo key `users/{userId}/{uuid}{ext}` (KHÔNG giữ tên gốc làm path để chống path traversal).
6. Insert vào `documents`: `{ id, user_id, filename, mime, size_bytes, storage_key, status: 'pending' }`.
7. Enqueue job `ingest-document` lên Bull queue (Redis) với payload `{ documentId, userId, storageKey, mime }`.
8. Trả về 202 với metadata document.

**Bước 2 — Worker xử lý** (`server/src/workers/index.ts`, concurrency = 2, retry 3 lần với exponential backoff):
1. Cập nhật `documents.status = 'processing'`.
2. **Parse**: tải file từ S3 → gọi parser tương ứng MIME ([server/src/services/ingestion/parsers/](server/src/services/ingestion/parsers/)):
   - PDF: `pdf-parse` (import inner path `pdf-parse/lib/pdf-parse.js` để bypass debug block).
   - DOCX: `mammoth` (extract raw text).
   - CSV: `papaparse` (flatten thành dòng văn bản).
   - TXT: decode UTF-8 trực tiếp.
3. **Chunk** ([server/src/services/ingestion/chunker.ts](server/src/services/ingestion/chunker.ts)):
   - Cắt theo paragraph trước, sau đó cửa sổ trượt ~2000 ký tự (~570 token), overlap 200 ký tự.
   - Gộp chunk cuối nếu quá nhỏ để tránh fragment vô nghĩa.
4. **Embed**: gọi `bge-m3` qua Ollama (OpenAI-compat endpoint `/v1/embeddings`) cho từng chunk → vector 1024 chiều.
5. **Upsert vector** ([server/src/adapters/vector-store/pgvector.ts](server/src/adapters/vector-store/pgvector.ts)):
   ```
   INSERT INTO document_chunks (id, document_id, user_id, chunk_index, content, embedding)
   ```
   Cột `embedding` kiểu `vector(1024)`, có HNSW index với `vector_cosine_ops`.
   `user_id` được denormalize vào chunks để filter scope nhanh, không phải JOIN.
6. Cập nhật `documents.status = 'ready'`. Nếu lỗi → `status = 'failed'` + lưu error message.

### 4.3. Luồng RAG Chat (`POST /chat/stream`)

Khi user gửi câu hỏi, backend orchestrator ([server/src/services/chat/index.ts](server/src/services/chat/index.ts)) chạy song song:

**Nhánh A — Retrieval** ([server/src/services/retrieval.ts](server/src/services/retrieval.ts)):
1. Embed câu hỏi bằng `bge-m3` → vector 1024 chiều.
2. Query top-K=6 chunks gần nhất (cosine similarity) từ `document_chunks`, **filter `WHERE user_id = $userId`** (cô lập tuyệt đối giữa các user).
3. Optional: filter thêm `document_id` nếu user chỉ định một tài liệu cụ thể.
4. Trả về chunks + citation preview (trim 240 ký tự đầu).

**Nhánh B — History**:
1. Đọc 20 message gần nhất của chat từ Redis (`chat:{chatId}:messages`, TTL 24h sliding).
2. Cache miss → đọc từ Postgres `messages` order by `created_at DESC limit 20`, fill cache.

**Bước 3 — Build prompt** ([server/src/services/chat/prompt.ts](server/src/services/chat/prompt.ts)):
```
[System prompt tiếng Việt + contract trích dẫn [#n]]

Nguồn tham khảo:
[#1] (tài liệu A, đoạn 0): ...
[#2] (tài liệu B, đoạn 5): ...
...

Lịch sử trò chuyện:
User: ...
Assistant: ...

Câu hỏi: <câu hỏi mới>
```

**Bước 4 — Stream LLM**:
1. Gọi `LLMClient.stream({ messages, signal })` ([server/src/adapters/llm/openai-compat.ts](server/src/adapters/llm/openai-compat.ts)).
2. OpenAI SDK trỏ về Ollama (`OPENAI_BASE_URL=http://host.docker.internal:11434/v1`).
3. Model `qwen2.5:14b` stream từng token → async iterable.
4. Backend phát SSE event:
   - `event: start\ndata: {"messageId":..., "citations":[...]}`
   - `event: delta\ndata: {"delta":"..."}` (mỗi token hoặc batch)
   - `event: done\ndata: {"messageId":..., "truncated":false}`
   - `event: error\ndata: {"message":"..."}`
   - `: ping` mỗi 15s (heartbeat giữ kết nối).
5. Express middleware `compression` được **bypass** cho path `/chat/stream` để token flush ngay lập tức.
6. Nếu client disconnect (close tab, click Stop) → `AbortSignal` hủy LLM stream → lưu phần đã có với `truncated = true`.

**Bước 5 — Persistence** ([server/src/services/chat/persistence.ts](server/src/services/chat/persistence.ts)):
- Khi stream kết thúc (hoặc bị truncate), trong **một transaction**:
  1. Insert message của user (role='user').
  2. Insert message của assistant (role='assistant', `citations` = JSONB array, `truncated` flag).
  3. Update `chats.updated_at = NOW()`.
  4. Append cả 2 message vào Redis cache.

→ Nếu LLM lỗi trước token đầu tiên: KHÔNG insert gì cả (tránh user message mồ côi).

### 4.4. Cô lập dữ liệu giữa user (multi-tenancy)

Mọi query phải scope theo `userId`:
- `documents WHERE user_id = $1` — list tài liệu.
- `document_chunks WHERE user_id = $1` — vector search.
- `chats WHERE user_id = $1` — history.
- `messages` — JOIN qua `chats`, hoặc filter trực tiếp `messages.user_id`.

→ **Đã verify**: user `bob` không thấy tài liệu/chunks/chats của `alice` ở mọi endpoint.

### 4.5. Frontend SSE (`client/src/lib/chatStream.ts`)

Native `EventSource` chỉ hỗ trợ GET, nên dùng `fetch` + `ReadableStream`:
1. POST body chứa `{ chatId?, message }` → giữ payload trong body, không lộ ra URL.
2. Đọc stream từng chunk bytes → decode UTF-8 → buffer.
3. Split buffer theo `\n\n` → mỗi event là 1 cụm `event: <name>\ndata: <json>`.
4. Bỏ qua dòng `: ping`.
5. Dispatch handler theo event name (`open` / `start` / `delta` / `done` / `error`).
6. `AbortController.abort()` để hủy giữa chừng (khi user click Stop hoặc unmount component).

---

## 5. Bảo Mật Đã Áp Dụng

| Lớp | Cơ chế |
|-----|--------|
| Mật khẩu | bcrypt cost 12 |
| Token | JWT HS256, 7 ngày, secret từ env |
| Rate-limit | global + auth + chat (express-rate-limit) |
| Header | helmet (CSP, HSTS, no-sniff, frame-deny...) |
| CORS | allowlist từ `CLIENT_ORIGIN` |
| Upload | MIME allowlist + magic-byte sniff + size cap |
| Filename | UUID, không dùng tên gốc làm path |
| Multi-tenancy | `WHERE user_id = $1` ở mọi query |
| Email enumeration | bcrypt giả constant-time khi user không tồn tại |
| Log | Pino redact: `authorization`, `cookie`, `password`, `token`, `set-cookie`, `*.password_hash`, `*.apiKey` |
| Body limit | 1 MB JSON / 25 MB upload |

**Rủi ro còn tồn tại** (sẽ giải quyết ở Phase 8 nếu deploy public):
- JWT lưu trong `localStorage` → vulnerable XSS. Cần migrate sang httpOnly cookie + refresh token.

---

## 6. Sơ Đồ Luồng (tóm tắt)

### Upload tài liệu
```
User ──upload──▶ API ──save──▶ MinIO
                  │
                  ├──insert──▶ Postgres (status: pending)
                  └──enqueue─▶ Redis (Bull queue)
                                     │
                                     ▼
                                  Worker
                                     │
                              parse → chunk → embed (Ollama bge-m3)
                                     │
                                     └──upsert──▶ Postgres (pgvector + HNSW)
                                                   status: ready
```

### Hỏi đáp RAG
```
User ──question──▶ API
                    │
                    ├──embed (bge-m3)──▶ vector search top-6 (filter user_id)
                    │                              │
                    │                              ▼
                    │                       chunks + citations
                    ├──Redis───get history──▶ 20 messages gần nhất
                    │                              │
                    │                              ▼
                    └──build prompt──▶ Ollama qwen2.5:14b ──stream──▶
                                                                       │
                                                              SSE event ▼
                                                                    Frontend
                                                                       │
                                                              hiển thị token
                                                              + citations [#n]
                    ┌──save (transaction)──┐
                    ▼                      ▼
            Postgres                    Redis cache
        (user msg + assistant msg)    (append last 20)
```

---

## 7. Xử Lý Sự Cố Thường Gặp

| Triệu chứng | Nguyên nhân | Cách xử lý |
|-------------|-------------|-----------|
| `/health/ready` trả 503 | Postgres chưa lên | `docker compose ps`, đợi healthy, hoặc xem log `docker compose logs postgres` |
| Chat trả về "Connection error" | Ollama không chạy | Mở terminal khác chạy `ollama serve`, hoặc khởi động Ollama Desktop |
| Document mãi `processing` | Worker chết hoặc Ollama chậm | `docker compose logs worker`, kiểm tra GPU memory cho `bge-m3` |
| Upload thất bại "unsupported MIME" | File giả định dạng | Đảm bảo đúng PDF/DOCX/CSV/TXT thật |
| `qwen2.5:14b` báo CUDA out of memory | GPU không đủ ~9GB VRAM | Đóng app khác, hoặc đổi sang `qwen2.5:7b` trong `.env` (`OPENAI_CHAT_MODEL`) |
| Sau `npm install` ở `server/` deps không tìm thấy | Volume Docker stale | `docker compose build api worker && docker compose stop api worker && docker compose rm -fv api worker && docker compose up -d api worker` |
| Frontend `/api/*` lỗi CORS | Vite proxy chưa hoạt động | Kiểm tra `vite.config.ts` proxy `/api` → `http://localhost:4000` |

---

## 8. Mở Rộng (cho lập trình viên)

- **Thêm định dạng file mới**: tạo parser trong [server/src/services/ingestion/parsers/](server/src/services/ingestion/parsers/), đăng ký vào registry, thêm MIME vào `UPLOAD_ALLOWED_MIME`.
- **Đổi LLM provider**: chỉ sửa adapter trong [server/src/adapters/llm/](server/src/adapters/llm/), service code không đổi. Đặt `LLM_PROVIDER=anthropic` (cần implement adapter Anthropic — hiện đang stub).
- **Đổi vector store**: implement [server/src/adapters/vector-store/pinecone.ts](server/src/adapters/vector-store/pinecone.ts), đặt `VECTOR_STORE=pinecone` + `PINECONE_API_KEY` + `PINECONE_INDEX`.
- **Đổi model embedding**: nhớ vector dim phải khớp cột `embedding vector(1024)`. Đổi dim → migration mới + re-embed toàn bộ.

---

*Tài liệu cập nhật: 2026-04-27, kết thúc Phase 7. Phase 8 (JWT cookie, Pinecone/Anthropic thật, client Dockerfile, vitest) đang hoãn lại — sẽ làm khi cần deploy public.*
