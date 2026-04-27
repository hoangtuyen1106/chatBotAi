# Hướng Dẫn Deploy AI Chat Bot Lên VPS

Tài liệu này hướng dẫn deploy ứng dụng lên một **VPS Ubuntu 22.04** sạch, dùng **cloud LLM (OpenAI)** + **Caddy auto-SSL**. Cuối tài liệu có phụ lục cho self-host Ollama và troubleshooting.

> Trạng thái mã: Phase 0–8 code-complete (commit `cc0714e`).

---

## 1. Tổng Quan Kiến Trúc Deploy

```
                        Internet
                            │ HTTPS (443)
                            ▼
                ┌──────────────────────┐
                │   Caddy (host)       │  ← Let's Encrypt auto-SSL
                │   listens :80/:443   │
                └──────────┬───────────┘
                           │ HTTP :8080
                           ▼
        ┌──────────────────────────────────────┐
        │  Docker network "chatbotai_default"  │
        │                                       │
        │   client (nginx) ──/api/*──▶  api    │
        │       :8080→:80               :4000  │
        │                                  │   │
        │                          ┌───────┴─┐ │
        │                          ▼         ▼ │
        │                  postgres     redis  │
        │                  pgvector            │
        │                                       │
        │           worker ───▶ minio (S3)      │
        │                                       │
        └──────────────────────────────────────┘
```

**Vì sao kiến trúc này:**
- Caddy đứng ngoài Docker → tự động xin/renew Let's Encrypt cert.
- Tất cả request từ trình duyệt đều cùng origin (`https://yourdomain.com`) → cookie `SameSite=Lax` chạy đúng, không cần cấu hình CORS phức tạp.
- Postgres / Redis / MinIO **không expose ra Internet** — chỉ chạy trong Docker network.

---

## 2. Yêu Cầu

### VPS
- **CPU/RAM tối thiểu:** 2 vCPU, 4 GB RAM, 40 GB SSD.
- **Khuyến nghị:** 4 vCPU, 8 GB RAM nếu có nhiều user upload tài liệu lớn.
- **Hệ điều hành:** Ubuntu 22.04 LTS (các bước dưới dùng Ubuntu — Debian 12 / Ubuntu 24.04 cũng OK, đổi tên gói nếu cần).

### Domain
- Một domain (hoặc subdomain) đã trỏ A-record về IP VPS, ví dụ `chatbot.yourdomain.com`.
- Thay tất cả `yourdomain.com` trong tài liệu này bằng domain thật của bạn.

### LLM API key
- **OpenAI** (mặc định): tài khoản tại https://platform.openai.com → tạo API key.
- Hoặc **Anthropic**: https://console.anthropic.com (xem caveat tại Bước 2.4).

---

## 3. Bước 1 — Chuẩn Bị VPS

### 3.1. SSH vào VPS với root, tạo user thường

```bash
adduser deploy
usermod -aG sudo deploy
mkdir -p /home/deploy/.ssh
cp ~/.ssh/authorized_keys /home/deploy/.ssh/
chown -R deploy:deploy /home/deploy/.ssh
chmod 700 /home/deploy/.ssh
chmod 600 /home/deploy/.ssh/authorized_keys
```

Logout, SSH lại bằng user `deploy`. Các bước còn lại chạy với user này (`sudo` khi cần).

### 3.2. Cập nhật hệ thống + cài tiện ích

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y curl git ufw
```

### 3.3. Cài Docker Engine + Compose plugin

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
newgrp docker
docker --version          # kỳ vọng: Docker version 27.x
docker compose version    # kỳ vọng: Docker Compose version v2.x
```

### 3.4. Cấu hình firewall UFW

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 22/tcp        # SSH
sudo ufw allow 80/tcp        # HTTP (Caddy redirect → HTTPS)
sudo ufw allow 443/tcp       # HTTPS
sudo ufw enable
sudo ufw status              # kỳ vọng: chỉ thấy 22/80/443
```

> **Quan trọng:** KHÔNG mở `5432, 6379, 9000, 9001` ra Internet. Postgres/Redis/MinIO chỉ phục vụ trong Docker network.

---

## 4. Bước 2 — Clone Repo & Cấu Hình `.env`

### 4.1. Clone

```bash
cd ~
git clone <URL_REPO_CỦA_BẠN> chatbotai
cd chatbotai
```

### 4.2. Tạo `.env`

```bash
cp .env.example .env
nano .env
```

### 4.3. Các biến **BẮT BUỘC ĐỔI** cho prod

| Biến | Giá trị | Vì sao |
|------|---------|--------|
| `NODE_ENV` | `production` | Bật cờ `secure` trên cookie. **Nếu vẫn để `development` cookie sẽ không gửi qua HTTPS thật** → đăng nhập fail im lặng. |
| `CLIENT_ORIGIN` | `https://chatbot.yourdomain.com` | CORS allowlist + cookie domain. **Phải khớp 100%** với URL trình duyệt gõ. |
| `JWT_SECRET` | Chuỗi random ≥ 64 ký tự | Sinh bằng `openssl rand -hex 32` |
| `DATABASE_URL` | `postgres://chatbot:<MẬT_KHẨU_MỚI>@postgres:5432/chatbot` | Đổi mật khẩu (xem Bước 3 cũng phải đổi `POSTGRES_PASSWORD`). Host là `postgres` (tên service trong Docker network), KHÔNG phải `localhost`. |
| `REDIS_URL` | `redis://redis:6379` | Host là `redis`, không phải `localhost`. |
| `S3_ENDPOINT` | `http://minio:9000` | Host là `minio`. |
| `S3_ACCESS_KEY` | Khác `minioadmin` | Đặt một chuỗi random — bạn cũng sẽ đặt cho `MINIO_ROOT_USER` ở Bước 3. |
| `S3_SECRET_KEY` | Khác `minioadmin` | Tương tự với `MINIO_ROOT_PASSWORD`. |

### 4.4. Cấu hình LLM

#### Phương án A — OpenAI cloud (mặc định, đơn giản nhất)

```env
LLM_PROVIDER=openai
OPENAI_API_KEY=sk-proj-...
OPENAI_BASE_URL=
OPENAI_CHAT_MODEL=gpt-4o-mini
OPENAI_EMBEDDING_MODEL=text-embedding-3-small
ANTHROPIC_API_KEY=
```

> Để trống `OPENAI_BASE_URL` để gọi cloud OpenAI. Dùng `gpt-4o-mini` cho rẻ + nhanh; nâng lên `gpt-4o` nếu cần.

#### Phương án B — Anthropic (chỉ chat, embedding vẫn cần OpenAI)

```env
LLM_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-...
ANTHROPIC_CHAT_MODEL=claude-sonnet-4-6
# Embedding vẫn phải là OpenAI vì Anthropic không có embedding API:
OPENAI_API_KEY=sk-proj-...
OPENAI_EMBEDDING_MODEL=text-embedding-3-small
OPENAI_BASE_URL=
```

> **Caveat:** ứng dụng dùng riêng `EmbeddingClient` (OpenAI-compat) cho ingest. Khi chọn Anthropic làm chat, vẫn phải có `OPENAI_API_KEY` để embedding hoạt động. Nếu không muốn dùng OpenAI cho embedding → chọn Phụ lục A (Ollama + bge-m3).

#### Phương án C — Self-host Ollama trên VPS

Xem [Phụ lục A](#phụ-lục-a--self-host-ollama-trên-vps) ở cuối tài liệu.

### 4.5. Các biến giữ mặc định (an toàn)

```env
JWT_EXPIRES_IN=15m
REFRESH_TOKEN_EXPIRES_IN_DAYS=7
BCRYPT_COST=12
VECTOR_STORE=pgvector
UPLOAD_MAX_MB=25
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX=60
LOG_LEVEL=info
```

Lưu file `.env`. Đảm bảo nó **không bị commit** (đã có sẵn trong `.gitignore`).

---

## 5. Bước 3 — Đổi Credentials Postgres / MinIO

`docker-compose.yml` đang commit kèm với credentials mặc định `chatbot/chatbot` cho Postgres và `minioadmin/minioadmin` cho MinIO. Trên VPS prod **bắt buộc đổi**.

Cách an toàn nhất là tạo một **file compose local** không commit. Copy:

```bash
cp docker-compose.yml docker-compose.prod.local.yml
nano docker-compose.prod.local.yml
```

Sửa 3 chỗ:

```yaml
  postgres:
    environment:
      POSTGRES_USER: chatbot
      POSTGRES_PASSWORD: <MẬT_KHẨU_POSTGRES_MỚI>   # khớp với DATABASE_URL trong .env
      POSTGRES_DB: chatbot

  minio:
    environment:
      MINIO_ROOT_USER: <S3_ACCESS_KEY_MỚI>          # khớp với .env
      MINIO_ROOT_PASSWORD: <S3_SECRET_KEY_MỚI>      # khớp với .env

  minio-init:
    entrypoint: >
      /bin/sh -c "
      mc alias set local http://minio:9000 <S3_ACCESS_KEY_MỚI> <S3_SECRET_KEY_MỚI> &&
      mc mb --ignore-existing local/chatbot-uploads &&
      echo 'minio bucket ready';
      "
```

Thêm file vào `.gitignore` (đã có pattern `*.local.*`, kiểm tra bằng `git status`).

---

## 6. Bước 4 — Build & Chạy Stack

### 6.1. Build + start

```bash
docker compose -f docker-compose.prod.local.yml -f docker-compose.prod.yml up -d --build
```

> Lệnh này stack 2 file: `prod.local` (đã thay credentials) + `prod` (overlay đổi target=prod, thêm service `client`).

### 6.2. Kiểm tra healthcheck

```bash
docker compose -f docker-compose.prod.local.yml -f docker-compose.prod.yml ps
```

Đợi tất cả services trạng thái `healthy` (Postgres + Redis + MinIO + api + worker + client). Mất 30–60 giây sau lần build đầu.

### 6.3. Chạy migration database

```bash
docker compose -f docker-compose.prod.local.yml -f docker-compose.prod.yml exec api npm run migrate
```

Kỳ vọng output:

```
Migrating files:
> 1714000000000_create-users
> 1714000010000_create-documents-and-chunks
> 1714000020000_create-chats-and-messages
> 1714000030000_create-refresh-tokens
Migrations complete!
```

> Nếu một số migration đã chạy rồi (ví dụ chỉ thiếu `refresh_tokens`) → vẫn OK, node-pg-migrate idempotent với bảng `pgmigrations`.

### 6.4. Test API local

```bash
curl http://localhost:8080/api/health/ready
# kỳ vọng: {"status":"ok","postgres":"ok"}
```

---

## 7. Bước 5 — Cài Caddy Làm Reverse Proxy SSL

### 7.1. Cài Caddy

```bash
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update
sudo apt install -y caddy
```

### 7.2. Cấu hình Caddyfile

```bash
sudo nano /etc/caddy/Caddyfile
```

Thay nội dung bằng:

```
chatbot.yourdomain.com {
    reverse_proxy localhost:8080

    # Tăng timeout cho SSE chat streaming
    reverse_proxy localhost:8080 {
        flush_interval -1
        transport http {
            response_header_timeout 1h
        }
    }
}
```

> Caddy mặc định KHÔNG buffer response → SSE chạy đúng. Chỉ tăng `response_header_timeout` để giữ kết nối streaming khi LLM trả lời chậm.

### 7.3. Reload Caddy

```bash
sudo systemctl reload caddy
sudo systemctl status caddy
```

Lần đầu Caddy sẽ tự động:
1. Mở challenge HTTP-01 trên port 80.
2. Lấy chứng chỉ Let's Encrypt cho domain.
3. Lưu cert vào `/var/lib/caddy/.local/share/caddy/`.
4. Bật HTTPS trên 443 và auto-redirect 80→443.

Mất ~15 giây. Check log nếu lâu hơn:

```bash
sudo journalctl -u caddy -f
```

### 7.4. Test HTTPS

```bash
curl -I https://chatbot.yourdomain.com
# kỳ vọng: HTTP/2 200, header server: Caddy
```

---

## 8. Bước 6 — Smoke Test Trên Trình Duyệt

Mở `https://chatbot.yourdomain.com` (đã có HTTPS, cờ ổ khoá xanh).

| Bước | Thao tác | Kỳ vọng |
|------|----------|---------|
| 1 | Vào `/register` → đăng ký email + mật khẩu | Redirect về `/chat`. **DevTools → Application → Cookies**: thấy `access_token` (HttpOnly, Secure), `refresh_token` (HttpOnly, Secure, path=/auth), `csrf_token` (Secure, KHÔNG HttpOnly). |
| 2 | Vào `/documents` → kéo thả 1 file PDF | Status `pending` → `processing` → `ready` trong ~5–30 giây tuỳ file size. |
| 3 | Quay lại `/chat`, hỏi 1 câu liên quan tài liệu | SSE stream từng từ. Có khối citations `[#1]`. |
| 4 | (Tuỳ chọn) Đợi 16 phút → hỏi câu mới | DevTools → Network: thấy 1 request `POST /auth/refresh` (200) chen giữa, sau đó câu hỏi vẫn thành công. Đây là silent refresh-on-401. |
| 5 | Bấm nút logout (icon góc phải) | Cookies `access_token` + `refresh_token` + `csrf_token` biến mất. Tự redirect về `/login`. `GET /auth/me` trả 401. |

Nếu cả 5 bước OK → deploy thành công.

---

## 9. Bước 7 — Vận Hành

### 9.1. Xem logs

```bash
docker compose -f docker-compose.prod.local.yml -f docker-compose.prod.yml logs -f api worker
```

### 9.2. Cập nhật code

```bash
cd ~/chatbotai
git pull
docker compose -f docker-compose.prod.local.yml -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.local.yml -f docker-compose.prod.yml exec api npm run migrate
```

### 9.3. Backup hàng ngày

Tạo file `~/chatbotai/backup.sh`:

```bash
#!/bin/bash
set -e
DATE=$(date +%F)
BACKUP_DIR=/home/deploy/backups
mkdir -p "$BACKUP_DIR"

# Postgres dump
cd /home/deploy/chatbotai
docker compose -f docker-compose.prod.local.yml -f docker-compose.prod.yml \
  exec -T postgres pg_dump -U chatbot chatbot | gzip > "$BACKUP_DIR/pg-$DATE.sql.gz"

# MinIO snapshot (tar volume)
docker run --rm -v chatbotai_minio-data:/data -v "$BACKUP_DIR":/backup alpine \
  tar czf "/backup/minio-$DATE.tar.gz" -C /data .

# Giữ 14 ngày
find "$BACKUP_DIR" -name "*.gz" -mtime +14 -delete
```

```bash
chmod +x ~/chatbotai/backup.sh
crontab -e
# Thêm dòng: chạy 02:00 mỗi ngày
0 2 * * * /home/deploy/chatbotai/backup.sh >> /home/deploy/backups/backup.log 2>&1
```

### 9.4. Cleanup refresh tokens hết hạn

`refresh_tokens` không tự xoá. Thêm vào crontab:

```bash
0 3 * * * cd /home/deploy/chatbotai && docker compose -f docker-compose.prod.local.yml -f docker-compose.prod.yml exec -T postgres psql -U chatbot chatbot -c "DELETE FROM refresh_tokens WHERE expires_at < now() - interval '7 days';" >> /home/deploy/backups/cleanup.log 2>&1
```

### 9.5. Theo dõi disk

```bash
docker system df
df -h
du -sh /var/lib/docker/volumes/*
```

MinIO data lớn dần theo upload. Nếu sắp đầy: tăng disk VPS hoặc dọn document cũ.

---

## 10. Phụ Lục A — Self-host Ollama Trên VPS

> Chỉ khả thi nếu VPS có **GPU** (RTX 4090 / A10) hoặc **≥ 16 GB RAM** (chạy CPU với model nhỏ, chậm).

### A.1. Cài Ollama trên host

```bash
curl -fsSL https://ollama.com/install.sh | sh
ollama pull qwen2.5:7b      # Q4 ~5 GB; nhỏ hơn 14b để chạy CPU được
ollama pull bge-m3          # embedding 1024d, đa ngôn ngữ
```

### A.2. Cho phép container truy cập Ollama trên host

Sửa `docker-compose.prod.local.yml`, thêm vào service `api` và `worker`:

```yaml
  api:
    extra_hosts:
      - "host.docker.internal:host-gateway"

  worker:
    extra_hosts:
      - "host.docker.internal:host-gateway"
```

> Trên Linux mặc định không có `host.docker.internal` → phải khai báo `host-gateway`. Trên Mac/Windows Docker Desktop tự có.

### A.3. Đổi `.env`

```env
LLM_PROVIDER=openai
OPENAI_BASE_URL=http://host.docker.internal:11434/v1
OPENAI_API_KEY=ollama
OPENAI_CHAT_MODEL=qwen2.5:7b
OPENAI_EMBEDDING_MODEL=bge-m3
```

### A.4. Restart

```bash
docker compose -f docker-compose.prod.local.yml -f docker-compose.prod.yml up -d --force-recreate api worker
```

---

## 11. Phụ Lục B — Troubleshooting

| Triệu chứng | Nguyên nhân thường gặp | Cách xử lý |
|-------------|------------------------|------------|
| Đăng nhập không lưu — refresh trang là logout | `NODE_ENV` chưa phải `production` (cookie không bật `Secure`), HOẶC truy cập qua `http://` thay vì `https://` | Sửa `.env` → `NODE_ENV=production`, restart api: `docker compose ... up -d api`. Luôn truy cập bằng HTTPS. |
| Browser console: "CORS error" hoặc 403 | `CLIENT_ORIGIN` không khớp với URL gõ (ví dụ thiếu/thừa `www.`) | Sửa `.env` → đặt đúng full URL có `https://`, restart api. |
| `/auth/login` trả 403 `csrf_invalid` | Trình duyệt block third-party cookie HOẶC FE và BE khác origin | Đảm bảo Caddy proxy đúng port 8080 và FE truy cập đúng domain. KHÔNG dùng `*.localhost`. |
| Chat trả lời nhưng từ ra một lúc rồi xuất hiện hết một cục | Reverse proxy buffering | Caddy mặc định OK với cấu hình ở Bước 5. Nếu dùng nginx → thêm `proxy_buffering off;` vào block `location /api/`. |
| `docker compose exec api npm run migrate` báo `relation "refresh_tokens" already exists` | Đã chạy migration trước đó | Bình thường — kiểm tra `docker compose ... exec postgres psql -U chatbot -c "select * from pgmigrations;"`. Nếu thấy đủ 4 row → OK. |
| Upload file → status mãi `pending` | Worker chưa pick job, hoặc bucket MinIO chưa tạo | `docker compose ... logs worker` xem có lỗi không. Thử `docker compose ... up minio-init` để tạo lại bucket. |
| Caddy không lấy được cert (log thấy `acme: error`) | DNS chưa trỏ về VPS, HOẶC port 80 bị chặn | `dig chatbot.yourdomain.com +short` phải trả về IP VPS. `sudo ufw status` phải có `80/tcp ALLOW`. Đợi ~5 phút sau khi thay DNS rồi `sudo systemctl reload caddy`. |
| Chat fail với lỗi `Connection error.` (Ollama mode) | Ollama không chạy trên host hoặc port 11434 không tới được container | `curl http://localhost:11434/api/tags` trên host. Kiểm `extra_hosts` trong compose. |
| Disk đầy nhanh | MinIO data + Docker logs | `docker system prune -af` (dọn image cũ). Kiểm `du -sh /var/lib/docker/volumes/chatbotai_minio-data`. |

---

## 12. Checklist Trước Khi Public

- [ ] `NODE_ENV=production` trong `.env`
- [ ] `JWT_SECRET` đã đổi (64+ ký tự random)
- [ ] `POSTGRES_PASSWORD` + `DATABASE_URL` cùng mật khẩu mới
- [ ] `MINIO_ROOT_*` + `S3_ACCESS_KEY/SECRET_KEY` cùng credentials mới
- [ ] `CLIENT_ORIGIN` khớp domain HTTPS thật
- [ ] UFW chỉ mở `22/80/443`
- [ ] HTTPS hoạt động (`curl -I https://...` trả 200, ổ khoá xanh trên trình duyệt)
- [ ] 4 migration đã chạy
- [ ] Smoke test 5 bước (Bước 6) PASS
- [ ] Cron backup + cron cleanup `refresh_tokens` đã set
- [ ] `.env` và `docker-compose.prod.local.yml` KHÔNG bị commit lên git

---

Khi cần update tài liệu này (đổi domain, đổi LLM provider, scale lên cụm), giữ format Markdown và cập nhật phần "Tổng quan kiến trúc" + checklist trước.
