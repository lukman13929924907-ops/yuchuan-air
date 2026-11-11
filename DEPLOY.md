# 部署上线 / 迁移 / 回滚清单

适用于把本外贸站部署到**自己的服务器（VPS / 云主机 / 物理机）**并绑定正式域名。
项目是零依赖 Node.js 单端口服务，不需要数据库、不需要构建、不需要 `npm install`。

```
访客 ──HTTPS──> Nginx(:443) ──反代──> Node server.js(:3000, 127.0.0.1)
                                        ├── public/   前台静态页
                                        ├── admin/    后台
                                        └── data/     内容 + 上传图片（必须可写、必须持久化）
```

---

## 0. 上线前准备

- [ ] 一个域名（外贸站建议 `.com`），并完成 ICP/备案判断：服务器在中国大陆需备案；面向海外客户通常选中国香港/新加坡/美国机房，免备案
- [ ] 一台 VPS：1 核 1 GB 内存即可，Ubuntu 22.04 / 24.04 LTS
- [ ] 服务器已开放 80 / 443，SSH 可登录
- [x] 真实公司联系方式与统计已写入种子数据（2026-11-11，见 README「公司信息」）
- [ ] 修改后台密码（见第 6 步）

> 建议部署路径使用纯 ASCII，例如 `/var/www/yuchuan-air`，避免中文路径带来的编码与权限问题。

---

## 1. 安装 Node.js

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs nginx certbot python3-certbot-nginx
node -v        # 验证：v22.x 或 >= 18
```

---

## 2. 上传项目文件

在本机执行（Windows 可用 `scp`、WinSCP 或先打包成 zip 上传）：

```bash
# 打包时排除运行时产物
cd /path/to/yuchuan-air
tar -czf yuchuan-air.tar.gz --exclude=node_modules --exclude='*.tmp' .

scp yuchuan-air.tar.gz user@YOUR_SERVER_IP:/tmp/
```

在服务器执行：

```bash
sudo mkdir -p /var/www/yuchuan-air
sudo tar -xzf /tmp/yuchuan-air.tar.gz -C /var/www/yuchuan-air
sudo chown -R www-data:www-data /var/www/yuchuan-air
sudo chmod -R 755 /var/www/yuchuan-air
sudo chmod -R 775 /var/www/yuchuan-air/data /var/www/yuchuan-air/data/uploads
```

**验证**：`ls /var/www/yuchuan-air` 能看到 `server.js`、`package.json`、`public/`、`admin/`、`data/db.json`。

> `data/` 必须可写，否则后台保存内容、上传图片、接收询盘会失败（上传会返回 507）。
> 若用独立数据盘，设置 `DATA_DIR=/var/lib/yuchuan-data` 并把 `data/` 内容复制过去。

---

## 3. 配置 systemd 守护进程

创建 `/etc/systemd/system/yuchuan.service`：

```ini
[Unit]
Description=Shandong Yuchuan Export Website
After=network.target

[Service]
Type=simple
User=www-data
Group=www-data
WorkingDirectory=/var/www/yuchuan-air
Environment=NODE_ENV=production
Environment=PORT=3000
Environment=HOST=127.0.0.1
Environment=FORCE_HTTPS=1
Environment=DATA_DIR=/var/www/yuchuan-air/data
ExecStart=/usr/bin/node /var/www/yuchuan-air/server.js
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
```

启动：

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now yuchuan
sudo systemctl status yuchuan          # 应显示 active (running)
curl -I http://127.0.0.1:3000/        # 应返回 200
```

**常见失败**：`HOST=0.0.0.0` 也可以，但配合 Nginx 时绑 `127.0.0.1` 更安全；
端口冲突时改 `PORT` 并同步修改 Nginx 的 `proxy_pass`。
查看日志：`journalctl -u yuchuan -n 100 -f`。

> 备选方案（不想用 systemd）：`npm i -g pm2 && pm2 start server.js --name yuchuan && pm2 save && pm2 startup`。

---

## 4. Nginx 反向代理

创建 `/etc/nginx/sites-available/yuchuan`：

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name yourdomain.com www.yourdomain.com;

    # 后台上传的图片经 base64 传输，6 MB 图片约产生 8 MB 请求体
    client_max_body_size 12m;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 60s;
    }

    location /uploads/ {
        proxy_pass http://127.0.0.1:3000;
        expires 7d;
        add_header Cache-Control "public";
    }
}
```

启用：

```bash
sudo ln -s /etc/nginx/sites-available/yuchuan /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

**常见失败**：`nginx -t` 报错多为漏分号或重复 `default_server`；502 通常是 Node 未启动或 `proxy_pass` 端口不一致。

---

## 5. 域名解析与 HTTPS

1. 在域名注册商添加 `A` 记录：`@` → 服务器公网 IP；`www` → 同一 IP（或用 CNAME 指向 `@`）。
2. 等解析生效：`dig +short yourdomain.com` 或 `nslookup yourdomain.com`。
3. 申请证书并自动改写 Nginx：

```bash
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com
sudo systemctl reload nginx
```

4. 验证自动续期：`sudo certbot renew --dry-run`。
5. 防火墙：

```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw enable
```

**常见失败**：解析未生效时 certbot 会报 `Challenge failed`；确认 80 端口可从公网访问，且 Cloudflare 代理若开启需设为 DNS only 或 Full 模式。

---

## 6. 上线后的后台配置（重要）

访问 `https://yourdomain.com/admin`，用 `admin` 登录（初始密码见 README.md）。

- [ ] **Backup & Security → Change admin password**：立即改掉初始密码
- [ ] **Site Settings → Canonical Site URL**：填 `https://yourdomain.com`（影响 canonical 与 sitemap.xml）
- [x] **Site Settings**：真实电话、WhatsApp、地址、工作时间、2018 成立、35+ 国家、1,900+ 台套、真实资质已填好（2026-11-11）；只需核对一遍
- [ ] **Products / Articles**：替换示例产品为真实型号，上传实拍图；不需要的示例内容可删除
- [ ] 把 `robots.txt` 中 `Disallow: /admin` 保持不动；如额外加固，可在 Nginx 层给 `/admin` 加 IP 白名单或 HTTP Basic Auth

---

## 7. 上线验收清单

| 检查项 | 验证方式 | 期望结果 |
| --- | --- | --- |
| 首页 | 浏览器打开 `https://yourdomain.com` | 首屏、产品卡、统计条、文章卡全部显示 |
| 手机端 | 手机或 DevTools 设备模拟（375px / 768px） | 汉堡菜单可用、卡片单列、无横向滚动 |
| 产品列表与筛选 | `/products`，切换分类、搜索 | 结果数量与筛选条件一致 |
| 产品详情 | 点任一产品 | 规格表、特性、应用场景、相关产品正常 |
| 文章 | `/blog` 与文章页 | 正文 HTML 渲染、SEO 标题正确 |
| 询盘表单 | `/contact` 提交一条测试消息 | 提示成功，后台 Inquiries 出现该条 |
| 后台保存 | 改一句首页文案 → 刷新前台 | 文案即时变化 |
| 图片上传 | 后台上传一张产品图 | 前台显示真实图片（替代 SVG 插画） |
| SEO 文件 | `/robots.txt`、`/sitemap.xml` | URL 为正式域名而非 localhost |
| HTTPS | 浏览器地址栏 | 证书有效、无混合内容警告 |
| 权限 | 未登录访问 `/api/admin/data` | 返回 401 |

---

## 8. 迁移到另一台有效服务器

因为无数据库、无编译产物，**整站迁移就是复制文件夹**：

```bash
# 旧服务器
sudo systemctl stop yuchuan
cd /var/www/yuchuan-air
# 也可在后台 Backup & Security 里导出 JSON 作为额外保险
tar -czf /tmp/site-backup-$(date +%F).tar.gz .

# 传到新服务器后
sudo mkdir -p /var/www/yuchuan-air
sudo tar -xzf site-backup-XXXX-XX-XX.tar.gz -C /var/www/yuchuan-air
sudo chown -R www-data:www-data /var/www/yuchuan-air
sudo chmod -R 775 /var/www/yuchuan-air/data /var/www/yuchuan-air/data/uploads
```

新服务器上按 **第 1、3、4、5 步**重新安装 Node、systemd、Nginx、证书，然后：

- [ ] 确认 `config.json` 一并复制（含管理员密码哈希，否则会用默认密码重新初始化）
- [ ] 确认 `data/db.json` 与 `data/uploads/` 完整
- [ ] 在后台把 **Canonical Site URL** 改成新域名
- [ ] 切换 DNS A 记录到新 IP，等 TTL 生效后再下线旧服务器（建议先并行运行 24 小时）
- [ ] 重跑第 7 步验收清单

> 迁移期间不要同时让两台机器的写入生效，否则后写入的数据会被覆盖；先停旧站再切新站。

---

## 9. 备份与回滚

**自动备份**：每次在后台「导入备份」前，系统会把当前数据写入 `data/db.backup.json`。

**手动定时备份**（服务器 crontab）：

```bash
sudo crontab -e
# 每天 03:00 备份内容与图片
0 3 * * * tar -czf /var/backups/yuchuan-$(date +\%F).tar.gz -C /var/www/yuchuan-air data config.json
```

**回滚到导入前的状态**：

```bash
sudo systemctl stop yuchuan
cp /var/www/yuchuan-air/data/db.backup.json /var/www/yuchuan-air/data/db.json
sudo systemctl start yuchuan
```

> 回滚只恢复文字内容；已删除的上传图片文件需从备份 tar 包里的 `data/uploads/` 一并还原。

---

## 10. 常见故障速查

| 现象 | 原因 | 处理 |
| --- | --- | --- |
| 502 Bad Gateway | Node 未运行 / 端口不一致 | `systemctl status yuchuan`、核对 `proxy_pass` 与 `PORT` |
| 后台反复要求登录 | HTTPS 下 Cookie 被拒 | Nginx 传 `X-Forwarded-Proto $scheme`，并设 `FORCE_HTTPS=1`；或先不设该变量 |
| 图片上传返回 507 | `data/uploads/` 无写权限 | `chown -R www-data` + `chmod 775` |
| 图片上传返回 413 | Nginx 请求体限制 | `client_max_body_size 12m;` |
| 保存后重启又变回旧内容 | 只读文件系统 / `DATA_DIR` 指向临时卷 | 检查磁盘挂载与写权限 |
| sitemap 里是 localhost | 未配置站点域名 | Site Settings → Canonical Site URL |
| 前台显示 "Unable to load site data" | `/api/site` 失败 | 看 `journalctl -u yuchuan`，多为 `db.json` 损坏或权限问题 |
| 页面样式丢失 | 静态资源被缓存/CDN 拦截 | 强制刷新、检查 `/css/style.css` 是否 200 |

---

## 11. 安全加固建议

1. **立即修改管理员密码**，不要复用初始密码；`config.json` 不要提交到公开 Git 仓库。
2. 用 Nginx 给 `/admin` 与 `/api/admin/` 加一层 IP 白名单或 HTTP Basic Auth（双保险）。
3. 只开放 80/443/SSH；SSH 禁用密码登录、改用密钥。
4. 定期 `apt update && apt upgrade` 与 Node 版本更新。
5. 定期备份 `data/`，并把备份放到另一台机器或对象存储。
6. 询盘含个人信息，按目标市场（如欧盟 GDPR）制定保留与删除策略。
7. 文章正文支持 HTML，仅授予可信管理员后台账号。

---

## 12. 关于在线预览链接

本次交付的**在线预览链接**（已验证可访问）：

- 前台：https://yuchuan-air-export.app.workbuddy.host/?sharecode=IBOWCWOKU6
- 后台：https://yuchuan-air-export.app.workbuddy.host/admin?sharecode=IBOWCWOKU6

预览沙箱只暴露一个 HTTP 端口、可能不提供可写持久卷，因此：

- 浏览、筛选、详情页、响应式布局可完整体验；
- 预览站同样**服务端渲染**完整 HTML，可直接用 `curl -s "<预览链接>/products/<slug>" | grep '<h1>'` 验证「不执行 JS 也能读到正文」，以及 `/llms.txt`、`/robots.txt`、`/sitemap.xml`；
- 因 `siteUrl` 为空，预览站的 canonical / sitemap / llms.txt 会指向预览域名，这是正常的，**绑正式域名后需在后台填 `siteUrl`**；
- 后台**文本修改**在当前进程内即时生效，但沙箱重启后不保证保留；
- **图片持久化与正式上线，请以本文件的 VPS 部署方案为准**。

正式生产环境请按第 1–7 步部署，并把域名指向自己的服务器。

---

## 13. 绑定自定义域名（正式上线）

### 13.1 先明确一件事

**在线预览链接是平台分配的域名，不能绑定你自己的域名。** 平台预览只用于看效果、验收和临时分享。要让 `https://yourdomain.com` 生效，必须把项目部署到**你自己可控的服务器**（VPS / 云主机 / 物理机），再把 DNS 指过去。这也是「可迁移到有效服务器」的意义：本项目的 `data/`、图片、后台、前台全部在一个文件夹里，复制过去就能跑。

如果你还没有域名和服务器，需要准备：

| 项目 | 建议 |
| --- | --- |
| 域名 | `.com` 优先，短、易拼写、含品类或品牌词；避免纯拼音缩写、多个连字符；一次注册 3 年以上 |
| 注册商 | 可放在 Cloudflare / Namesilo / 阿里云国际等；外贸站建议 DNS 托管在 Cloudflare（免费、解析快） |
| 服务器 | 海外买家的目标市场就近选（欧美客户建议德国/荷兰/美国东部）；1 vCPU / 1 GB 内存足够起步 |
| 企业邮箱 | `sales@yourdomain.com`（不要再用免费邮箱），用于 GSC、目录注册与客户回复 |
| 后续 | 域名备案不是海外部署的前提；若服务器在中国大陆则必须备案 |

### 13.2 DNS 解析

在 DNS 管理页添加（把 IP 换成你的服务器公网 IP）：

| 类型 | 名称 | 值 | 说明 |
| --- | --- | --- | --- |
| A | `@` | `203.0.113.10` | 主域名 |
| A | `www` | `203.0.113.10` | 或用 CNAME 指向 `@` |
| TXT | `@` | GSC 给出的验证串 | Google Search Console 域名验证 |
| MX | `@` | 企业邮箱服务商提供 | 收询盘邮件 |

```bash
dig +short yourdomain.com
dig +short www.yourdomain.com
curl -I http://203.0.113.10        # 应能看到 Nginx 响应
```

> 若用 Cloudflare 代理（橙色云朵），证书申请阶段先设为 **DNS only**，申请完再切回 **Full (strict)** 代理。

### 13.3 Nginx 绑定域名并统一 www / 非 www

在第 4 节配置基础上，把 `server_name` 改成真实域名，并单独加一个 301 跳转，避免出现两个可访问版本导致权重分散：

```nginx
# /etc/nginx/sites-available/yuchuan
server {
    listen 80;
    server_name yourdomain.com www.yourdomain.com;
    client_max_body_size 12m;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Host $host;
    }
}
```

决定主版本（推荐不带 www），用 `certbot --nginx` 时它会自动生成 301 跳转；若手工配置：

```nginx
server {
    listen 443 ssl;
    server_name www.yourdomain.com;
    # ssl_certificate ... 同主域名
    return 301 https://yourdomain.com$request_uri;
}
```

```bash
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com
sudo certbot renew --dry-run
```

> `X-Forwarded-Host` 与 `X-Forwarded-Proto` 必须传，否则站点在未填 `siteUrl` 时会把 canonical 写成 `http://127.0.0.1:3000`。

### 13.4 在后台填正式域名（关键一步）

登录 `https://yourdomain.com/admin` → **Site Settings → Canonical Site URL** → 填 `https://yourdomain.com`（无尾斜杠）→ 保存。

这一步一次性修正：canonical、hreflang、所有 JSON-LD 里的 URL、OG/Twitter、`robots.txt` 的 Sitemap 行、`sitemap.xml` 的 loc、`llms.txt` / `llms-full.txt` 里的链接。**不重启、不改代码**，保存即时生效。

### 13.5 上线验收命令

```bash
D=https://yourdomain.com

# 页面与跳转
curl -sI "$D/" | head -5
curl -sI "$D/products.html" | grep -i '^location'      # 应 301 到 /products
curl -sI "$D/www" >/dev/null

# SSR：不执行 JS 也能看到真实产品名与规格
curl -s "$D/products/hydroguard-wdc12000-wet-dust-collector" | grep -o '<h1>[^<]*</h1>'
curl -s "$D/" | grep -o 'application/ld+json'

# 域名是否写进所有机器可读文件
curl -s "$D/" | grep -o '<link rel="canonical"[^>]*>'
curl -s "$D/robots.txt" | grep 'Sitemap:'
curl -s "$D/sitemap.xml" | head -6
curl -s "$D/llms.txt" | head -4

# AI 爬虫是否被放行（应返回 200，不是 403）
curl -s -o /dev/null -w "GPTBot %{http_code}\n" -A "GPTBot" "$D/"
curl -s -o /dev/null -w "ClaudeBot %{http_code}\n" -A "ClaudeBot" "$D/"
curl -s -o /dev/null -w "PerplexityBot %{http_code}\n" -A "PerplexityBot" "$D/"

# 压缩、后台隔离、权限
curl -sI -H "Accept-Encoding: br" "$D/" | grep -i 'content-encoding\|etag'
curl -s "$D/admin" | grep -o 'name="robots"[^>]*>'
curl -s -o /dev/null -w "admin api %{http_code}\n" "$D/api/admin/data"   # 应为 401
```

**CDN / WAF 特别注意**：Cloudflare 的 Bot Fight Mode、Super Bot Fight Mode 和部分 WAF 规则会拦截 GPTBot / ClaudeBot / PerplexityBot，即使 `robots.txt` 已允许也会返回 403，等于把自己从 AI 答案里移除。若启用 CDN，务必在 WAF 中为这些 UA 建 Allow 规则，或关闭 Bot Fight Mode，然后用上面的命令逐条验证。

### 13.6 提交搜索引擎

1. Google Search Console → 添加资源 → 提交 `https://yourdomain.com/sitemap.xml` → 对首页、1 个分类页、1 个产品页、1 篇文章用「网址检查 → 请求编入索引」。
2. Bing Webmaster Tools → 从 GSC 导入 → 提交同一 sitemap。
3. 详细运营动作见 `SEO-GEO.md` 第 5 节。

---

## 14. 上线后的 SEO / GEO 与询盘配置速查

全部在 `/admin → Site Settings` 完成，无需改代码：

| 分组 | 必填 | 作用 |
| --- | --- | --- |
| SEO & Domain | `siteUrl`、`ogImage`、`logoUrl` | 绝对 canonical / 社交分享图 / Organization schema |
| Search Console & GEO | GSC + Bing 验证码、`aiCrawlersAllow` 保持开启 | 站长验证与 AI 爬虫放行 |
| Social profiles | LinkedIn / YouTube / Facebook / X | `sameAs` 实体信任信号 |
| Analytics | GA4 / GTM / Ads / Meta / LinkedIn ID | 询盘转化归因 |
| Lead notifications | `inquiryWebhook` | 新询盘秒级推送到企业微信 / 飞书 / Slack / CRM |
| FAQ / GEO 面板 | 20+ 条真实问答 | 可见 FAQ + FAQPage 结构化数据，AI 引用主力 |

新增能力自检：

```bash
# 后台已填写 GA4 时，SSR 页面里应出现衡量 ID
curl -s "$D/" | grep -o 'G-[A-Z0-9]*' | head -1

# 分类落地页应可索引
curl -s -o /dev/null -w "collection %{http_code}\n" "$D/collections/wet-dust-collectors"

# 询盘归因：提交后在后台 Inquiries 应看到 Channel 与 UTM
curl -s -X POST -H "Content-Type: application/json" \
  -d '{"name":"Deployment Check","email":"check@example.com","message":"Testing attribution","utm_source":"google","utm_campaign":"launch-check","landing_page":"/products"}' \
  "$D/api/inquiries"
```

回归测试（本地或服务器上，需要管理员密码）：

```bash
ADMIN_PASSWORD='<后台密码>' TEST_PORT=3211 node tests/e2e.js
# 期望：RESULT pass=116 fail=0
```

> 测试会创建并清理临时数据；请勿在正在接单的生产环境高峰时段运行。

---

## 15. 完整交付清单

| 文件 | 用途 |
| --- | --- |
| `DEPLOY.md` | 本文件：VPS、systemd、Nginx、HTTPS、域名、迁移、备份、验收 |
| `SEO-GEO.md` | 关键词地图、GEO 内容规范、AI 引用监测、渠道投放、30/60/90 天执行表 |
| `README.md` | 后台操作说明、管理员账号、目录结构 |
| `tests/e2e.js` | 116 项端到端回归测试（SSR、schema、爬虫文件、压缩、归因、CRUD、鉴权） |
| `data/db.json` | 全部内容、设置、FAQ、询盘 |
| `data/uploads/` | 后台上传的图片 |
| `config.json` | 站点端口与管理员密码哈希（**不要公开**） |

**上线顺序**：第 1–5 步部署 → 第 13 步绑域名 → 后台填 `siteUrl` 与真实信息 → 第 13.5 步验收 → `SEO-GEO.md` 第 2 节 12 项配置 → GSC/Bing 提交 → 按 30/60/90 天表运营。

---

## 16. 本项目实际方案：阿里云域名 + Cloudflare + 企业邮箱 + 英语区

> 与第 13 节的关系：第 13 节是「VPS + Nginx + certbot 自签证书」路径，本节是「Cloudflare 代管 DNS/SSL」路径。**二选一，不要两套同时做**；用 Cloudflare 时证书由 Cloudflare 签发，源站不需要 certbot。

### 16.0 先说清楚架构约束（最重要）

本站是 **Node 全栈应用**：服务端渲染、后台 `/admin`、`data/db.json`（产品/文章/FAQ/询盘）、`data/uploads/`（后台上传图片）。它需要一个能运行 `node server.js` 且**有持久磁盘**的进程。

- Cloudflare 的 **DNS / Universal SSL / WAF / CDN** 是边缘反向代理层：只做解析、证书、缓存和转发，**不执行 Node、不提供文件系统**，请求最终必须「回源」到一个能跑 Node 的地方。
- Cloudflare **Workers** 确实是没有传统服务器的边缘计算，但它跑在 V8 隔离环境里，**没有 `fs`、`http` 模块，也没有本地磁盘**。要走 Workers，必须把 `db.json` 换成 D1 数据库、图片换成 R2 对象存储，是一次数据层重构。

所以「不需要单独部署服务器」的真正代价不是换个平台，而是**把数据从本地文件搬进托管数据库 + 对象存储**。三条路径对比：

| 路径 | 运行环境 | 数据持久化 | 改造量 | 后台能力 | 月成本 |
| --- | --- | --- | --- | --- | --- |
| A. Cloudflare 边缘 + 托管 Node 容器 | 托管容器 + 持久卷 | 本地文件不变 | 几乎为零 | 全部保留 | 约 $5–10 |
| B. Workers + D1 + R2 | 真·无服务器 | 云数据库 + 对象存储 | 大（存储层重写） | 全部保留 | 免费额度内 |
| C. 静态导出到 Cloudflare Pages | 无服务器 | 构建期固化 | 中 | **失去动态后台** | 免费 |

### 16.1 阿里云域名采购建议

- 英语区买家对 `.com` 的信任度显著高于 `.cn`。建议单独注册一个品牌 `.com`，例如 `yuchuanair.com` / `yuchuan-air.com` / `yuchuanfilter.com`，注册前先查重、查商标、查是否有历史搜索惩罚。
- **不要直接用 `hanxvonfluid.cn` 做外贸主站**：该域名继续专用于企业邮箱，避免品牌混淆，也避免 `.cn` 在英语区的信任折损。
- 阿里云流程：注册 → 企业实名认证 → 开启域名隐私保护 → 修改 NS（见 16.2）。
- **不要购买阿里云 SSL 证书**：Cloudflare Universal SSL 免费且自动续期，够用。

### 16.2 Cloudflare 接入步骤（域名买好后执行）

1. Cloudflare 添加站点，Free 计划即可。
2. 在阿里云控制台把 NS 改成 Cloudflare 分配的两个 nameserver，生效约 10 分钟–24 小时：
   ```bash
   dig NS yourdomain.com +short
   ```
3. DNS 记录：根域与 `www` 指向源站（A/AAAA 或 CNAME），开启橙云代理；用 Cloudflare Rules 把 `www` 做 301 跳到主域。
4. **SSL/TLS → Overview 选 `Full (strict)`**。Universal SSL 自动签发（免费，90 天自动续）。若源站也需要证书，用免费的 Cloudflare Origin Certificate 贴在源站上。
   - 不要选 `Flexible`：会导致重定向循环且回源是明文。
5. 开启 `Always Use HTTPS`；HSTS 等确认全站无混合内容后再启用（开错了回滚很麻烦）。
6. 验证：
   ```bash
   curl -I https://yourdomain.com                 # 200
   curl -I https://www.yourdomain.com             # 301 → 主域
   curl -I https://yourdomain.com/api/site        # 200
   ```
7. 后台 **Site Settings → Canonical Site URL** 填 `https://yourdomain.com`，一次性修正 canonical、JSON-LD、sitemap.xml、robots.txt、llms.txt 里的全部域名。

### 16.3 致命坑：Cloudflare 默认会挡住 AI 爬虫

Cloudflare 的 **Bot Fight Mode / Super Bot Fight Mode /「Block AI Scrapers and Crawlers」** 会把 GPTBot、OAI-SearchBot、ClaudeBot、PerplexityBot、Google-Extended 直接返回 403。**即使 `/robots.txt` 里放行了也没用**——上一轮做的 SSR、`/llms.txt`、FAQ schema 会全部白费，站点在 ChatGPT / Perplexity 里依然等于不存在。

处理：Security → WAF → 自定义规则，对这些 UA 放行（Allow / Skip），至少放行 `/robots.txt`、`/llms*.txt`、`/sitemap.xml`、`/products/*`、`/blog/*`。然后**逐条验证，不要只看 robots.txt**：

```bash
for ua in GPTBot OAI-SearchBot ClaudeBot PerplexityBot Googlebot bingbot; do
  printf "%-18s " "$ua"
  curl -s -o /dev/null -w "%{http_code}\n" -A "$ua" \
    https://yourdomain.com/products/hydroguard-wdc12000-wet-dust-collector
done
```

全部应为 `200`；出现 `403` 就是 WAF 在挡。另外**不要对 `/api/site`、`/admin/*` 开 Cache Everything**，否则后台改动不生效，甚至可能缓存串号。

### 16.4 企业邮箱 `info@hanxvonfluid.cn`

- 已写入 `data/db.json` 的 `settings.email`；页脚、联系页、Organization / ContactPoint JSON-LD、`/llms.txt` 会自动使用该地址。
- 这是**收件地址**。网站要自动发通知邮件，还需要一个独立的**发信通道**——只有邮箱地址是发不出信的。两种方式：
  - **HTTP 邮件 API**（Resend / Postmark，推荐）：拿 API Key，放服务端私有配置或环境变量，Cloudflare 边缘环境也能用，免费额度足够。
  - **企业邮箱 SMTP**：需要 SMTP 主机、端口（通常 465/587）、账号与**授权码**（不是登录密码），仅完整 Node 环境可用。
- **凭据绝不能写进 `data/db.json`**：`/api/site` 会原样返回 `settings` 对象，写进去等于公开泄露。只能放 `config.json` 私有段或环境变量。
- 发信域名 `hanxvonfluid.cn` 需配齐 SPF / DKIM / DMARC，否则通知邮件进垃圾箱：
  ```bash
  dig TXT hanxvonfluid.cn +short                      # 应含 v=spf1
  dig TXT selector._domainkey.hanxvonfluid.cn +short
  dig TXT _dmarc.hanxvonfluid.cn +short
  ```
- 建议邮件主题带 `[Inquiry] 客户名 - 产品 - 国家`，`Reply-To` 设为客户邮箱，销售可直接回复。

### 16.5 英语区适配

- Cloudflare 全球边缘节点自动就近服务，无需单独选区；但**源站位置**决定缓存未命中时的延迟，英语区建议源站放美西 / 欧洲 / 新加坡，而不是国内机房。
- 内容：全站英文、公制/英制双单位、CE / ISO / OSHA / ATEX 等英语区买家关注的合规表述（**必须是真实持有的资质**）。
- 工作时间为真实的 `08:00 - 21:00 Beijing Time (GMT+8)`，即 `00:00–13:00 UTC`。单独写北京时间会让欧美买家犹豫，可在联系页补充 UTC 换算；若要额外写「Reply within 12 hours」等响应承诺，先确认团队能稳定做到。
- 合规：GA4 / Google Ads / Meta Pixel / LinkedIn Insight 面向欧盟与英国访客需要 Cookie 同意与 Google Consent Mode v2；联系表单旁要有隐私政策链接（GDPR / UK GDPR）。
- 事实一致性：GEO 引擎会交叉核对。公司级数字已换成 `2018 / 35+ / 1,900+` 可验证事实，未确认的「72 小时发货」已删除；后续补真实产品型号时不要写入未经验证的性能值、交期或资质。

### 16.6 依赖顺序（域名到位后才能做的）

| 步骤 | 前置条件 | 验证方式 |
| --- | --- | --- |
| 改 NS 到 Cloudflare | 域名已注册且实名认证通过 | `dig NS` 返回 Cloudflare NS |
| Universal SSL 签发 | NS 已生效 | `curl -I https://` 返回 200 |
| 填 Canonical Site URL | 正式域名可访问 | `curl -s /robots.txt` 域名正确 |
| WAF 放行 AI 爬虫 | 站点已上线 | 16.3 的 UA 循环全部 200 |
| 发信域名验证 / SPF-DKIM-DMARC | 选定发信通道 | 发一封测试邮件并检查收件箱 |
| GSC / Bing 验证 + 提交 sitemap | canonical 已固定 | Search Console 显示已编入索引 |

### 16.7 已落地的代码能力（方案 A）

| 能力 | 位置 |
| --- | --- |
| 询盘邮件通知（Resend / Postmark / 自定义 HTTP，全局 `fetch`，零依赖） | `lib/mailer.js` |
| 私有邮件凭据模板（**不进数据库**） | `config.json` 的 `email` 段 + `EMAIL_*` 环境变量 |
| 后台可改收件人 | `Site Settings → Lead notifications → Inquiry notification recipient` |
| 发信通道自检（不泄露 Key） | 后台 `Site Settings` 顶部状态条 / `GET /api/admin/email-status` |
| 持久卷首次为空时自动带入完整目录 | `lib/store.js` 的 `seedIfEmpty()`，由 `getDb()` 调用 |
| 导入备份 `faqs` 数组校验 | `lib/store.js` |
| Render 一键部署蓝图 | `render.yaml` |
| 通用容器构建（Railway / Fly.io / VPS） | `Dockerfile` + `.dockerignore` |
| 回归测试 | `tests/e2e.js`、`tests/mailer.test.js`、`tests/store.test.js` |

### 16.8 方案 A 完整部署步骤（选定路径）

#### 16.8.1 准备

阿里云域名（最后绑）、Cloudflare 账号、Render 账号（或任意支持持久卷的容器平台）、Resend 账号、企业邮箱 `info@hanxvonfluid.cn`。

#### 16.8.2 部署 Node 服务（Render 为例）

1. 把项目推到 GitHub / GitLab，根目录已包含 `render.yaml`。
2. Render → New → Blueprint → 选仓库。会自动创建一个 Web Service 和一块 1 GB 持久盘，挂载到 `/var/lib/yuchuan`。
3. 在 Render 控制台填好三个标了 `sync: false` 的变量（**不要写进仓库**）：
   - `ADMIN_PASSWORD`：强随机密码，仅首次启动生效
   - `EMAIL_API_KEY`：Resend 的 `re_...`
   - `EMAIL_FROM`：测试期用 `onboarding@resend.dev`，正式域名验证后换成 `Yuchuan Air <noreply@yourdomain.com>`
4. `region` 建议 `oregon`（英语区美西）或 `frankfurt`（欧洲）；`render.yaml` 默认 `oregon`。
5. 验证首次启动：
   ```bash
   curl -s https://<service>.onrender.com/api/site | head -c 200
   ```
   日志应出现 `[store] seeded empty data volume from bundled db.json`，返回的 `counts.products` 应为 15。
6. 记下源站域名（如 `<service>.onrender.com`），稍后在 Render 后台**也添加自定义域名**，避免 Host 头不匹配。

> **备选平台**：`Dockerfile` 可用于 Railway / Fly.io / 任意容器平台。规则相同：持久卷挂 `/var/lib/yuchuan`、设 `DATA_DIR=/var/lib/yuchuan`。**绝不要挂到 `/app/data`**——卷会遮住项目自带的种子 `db.json`，导致上线后是空站。

#### 16.8.3 Cloudflare 回源与证书

- DNS：`@` CNAME → 源站域名（Cloudflare 有 CNAME Flattening），`www` CNAME → 源站，均开启橙云代理。
- 源站已有平台签发的有效证书，所以 SSL/TLS 选 **`Full (strict)`** 即可，**不需要** Cloudflare Origin Certificate，也不需要 certbot。
- 开启 `Always Use HTTPS`，把 `www` 做 301 到主域。
- 后台 `Site Settings → Canonical Site URL` 填 `https://yourdomain.com`。

#### 16.8.4 配置询盘邮件（Resend）

1. Resend → API Keys → 创建，把值填到 `EMAIL_API_KEY`。
2. **测试期**：`EMAIL_FROM=onboarding@resend.dev`，`EMAIL_TO` 临时填你注册 Resend 的邮箱（该测试发件人只能发给注册邮箱）。
3. **正式**：Resend → Domains 添加 `yourdomain.com` → 按提示在 **Cloudflare DNS** 里加 DKIM / SPF 的 TXT 记录 → 验证通过后设 `EMAIL_FROM=Yuchuan Air <noreply@yourdomain.com>`、`EMAIL_TO=info@hanxvonfluid.cn`。
4. 先在后台 `Site Settings` 顶部确认出现绿色的 `Inquiry email is ACTIVE`（若为红色说明 `EMAIL_PROVIDER` / `EMAIL_API_KEY` / `EMAIL_FROM` 有缺项，不必提交询盘盲测）。再提交一条测试询盘，确认服务端日志 `[mailer] inquiry email sent to info@hanxvonfluid.cn`，并检查收件箱与垃圾箱。
5. 按 16.4 检查 `hanxvonfluid.cn` 的 SPF / DKIM / DMARC——这决定销售「直接回复」时能否送达买家。
6. 邮件 `Reply-To` 已自动设为客户邮箱；正文含渠道、UTM、gclid / fbclid、referrer、落地页归因。

#### 16.8.5 上线验收（复制即用）

```bash
D=https://yourdomain.com
curl -s -o /dev/null -w "home       %{http_code}\n" "$D/"
curl -s -o /dev/null -w "admin      %{http_code}\n" "$D/admin"
curl -s -o /dev/null -w "product    %{http_code}\n" "$D/products/hydroguard-wdc12000-wet-dust-collector"
curl -s -o /dev/null -w "llms.txt   %{http_code}\n" "$D/llms.txt"
curl -s "$D/api/site" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const j=JSON.parse(s);console.log('company:',j.settings.companyName,'| products:',j.counts.products,'| email:',j.settings.email)})"
for ua in GPTBot OAI-SearchBot ClaudeBot PerplexityBot Googlebot bingbot; do
  printf "%-18s " "$ua"
  curl -s -o /dev/null -w "%{http_code}\n" -A "$ua" "$D/products/hydroguard-wdc12000-wet-dust-collector"
done
curl -s "$D/robots.txt" | grep -iE "GPTBot|Sitemap"
```

首页 / 后台 / 产品页 / llms.txt 应为 `200`，六个爬虫 UA **必须全部 200**（403 = WAF 在挡，见 16.3）。

#### 16.8.6 回滚与备份

- **内容回滚**：把卷里的 `db.backup.json` 复制成 `db.json` 后重启；或在后台导入之前导出的 JSON。
- **代码回滚**：PaaS 控制台一键回到上一个成功部署。
- **定期备份**：后台 `Backup & Security → Download Backup (JSON)`，另把卷里的 `uploads/` 一起打包（图片不在 JSON 里）。

#### 16.8.7 常见失败

| 现象 | 原因与处理 |
| --- | --- |
| 上线后站点没有产品 | 持久卷挂到了 `/app/data`，遮住种子；改挂 `/var/lib/yuchuan` 并设 `DATA_DIR` |
| 后台改的内容重启就没了 | 卷没挂或 `DATA_DIR` 指向了临时目录；Render 看 `disk.mountPath` |
| 后台登录总是掉线 | 未设 `FORCE_HTTPS=1`，或代理没传 `X-Forwarded-Proto: https` |
| Cloudflare 报 521 / 522 | 源站没起来或端口不对；检查服务日志与 `PORT` |
| 重定向循环 | SSL/TLS 模式选了 `Flexible`，改成 `Full (strict)` |
| Resend 返回 422 | `EMAIL_FROM` 的域名未验证；改用 `onboarding@resend.dev` 或完成域名验证 |
| 通知邮件进垃圾箱 | 发件域名缺 DKIM/SPF，或 `hanxvonfluid.cn` 缺 DMARC |
| AI 爬虫 403 | Bot Fight Mode / WAF，见 16.3 |
| 加了第二条 SPF TXT 后邮件全进垃圾箱 | 一个域名只能有一条 SPF；把 `include:resend.com` 合并进现有那条 |
| 出现两个 HSTS 头 | Cloudflare 与源站同时开启；关掉 Cloudflare 的 HSTS，保留源站的 |

### 16.9 可复制配置包与英语区隐私合规

- **`launch/deploy-values.md`**：Cloudflare DNS 记录表、Resend 发件域验证、WAF 放行 AI 爬虫的表达式、SSL 设置、GSC / Bing 验证与后台最终字段清单。域名定了把 `YOUR_DOMAIN` / `ORIGIN_HOST` 替换即可。
- **`launch/acceptance.sh`**：一键验收（含 6 个 AI 爬虫 UA、SSR 正文、canonical、隐私页、安全头）。
- **隐私合规已内置**：`/privacy` 服务端渲染的隐私政策页、Cookie 同意横幅、Google Consent Mode v2（默认 `denied`）、Meta / LinkedIn 标签同意后才注入、页脚可随时撤回同意、联系表单隐私告知。后台 `Site Settings → Privacy & compliance` 可开关，`privacyUpdatedAt` 可改政策日期。
- **上线前请让法务复核 `/privacy`**：页面里是通用模板（含 HTML 注释提示），保留期、跨境传输、监管机构等表述需按实际业务与目标市场确认。
- **安全头**：`X-Content-Type-Options` / `Referrer-Policy` / `X-Frame-Options` / `Permissions-Policy`，HTTPS 下额外 `Strict-Transport-Security`。未启用 CSP（站点用内联 JSON-LD 与初始化脚本，需 nonce 改造；如需上，先用 Report-Only 观察）。

