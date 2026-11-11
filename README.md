# Shandong Yuchuan — 外贸网站 + 后台管理系统

面向海外客户的响应式英文外贸站，复刻参考站的**工业空气过滤/除尘设备**产品思路，公司名称为
**Shandong Yuchuan Environmental Protection and Energy Saving Technology Co., Ltd.**

> **准备正式上线？按 [LAUNCH-STEPS.md](./LAUNCH-STEPS.md) 一回合一步操作**（只需登录 / 授权 / 粘贴，其余配置与脚本已备好）。
> 一键验收：`bash launch/acceptance.sh https://你的域名`。技术参考再看 [DEPLOY.md](./DEPLOY.md) 第 16 节。

## 为什么这样设计

| 需求 | 实现方式 |
| --- | --- |
| 能上线 | 标准单端口 HTTP 服务，`PORT` + `0.0.0.0`，可发布到平台或任意 VPS |
| 手机响应式 | 纯 CSS Grid/Flex，断点 1100 / 980 / 640px，移动端抽屉导航，视口用 `100dvh` |
| 能迁移到有效服务器 | **零第三方依赖**，只用 Node 内置模块；复制整个文件夹即可运行，无需 `npm install` |
| 能改后台参数 | 内置 `/admin` 后台：产品、文章、分类、应用方案、FAQ、询盘、站点参数、图片上传、备份导入导出 |
| 内容与参考站一致 | 10 个产品分类、15 款设备、6 个应用方案、6 篇技术文章，覆盖除尘器/焊烟净化/湿式除尘/下吸台/油雾 VOC 等 |
| 能被 Google 和 AI 搜到 | **服务端渲染**完整 HTML + JSON-LD + 绝对 canonical + `robots.txt` 放行 AI 爬虫 + `llms.txt` / `llms-full.txt` + 增强 sitemap + Brotli/ETag |
| 能追踪询盘来源 | 询盘记录 UTM / gclid / fbclid / referrer / 首次落地页 / 渠道分类，Webhook 即时通知、CSV 导出、GA4/Ads/Meta 转化事件 |

**没有数据库、没有 Redis、没有外部 CDN、没有外部字体**：内容存于 `data/db.json`，
上传图片存于 `data/uploads/`。这既是"可迁移"的关键，也是能直接发布到单端口沙箱的前提。

## 快速开始

```bash
cd yuchuan-air
node server.js
# 打开 http://localhost:3000
# 后台  http://localhost:3000/admin
```

指定端口：`PORT=8080 node server.js`（Windows PowerShell 用 `$env:PORT=8080; node server.js`）。
要求 Node.js >= 18（已在 Node v22 验证）。

## 管理员账号

| 项 | 值 |
| --- | --- |
| 后台地址 | `/admin` |
| 用户名 | `admin` |
| 初始密码 | `Ycefddc22af0!` |

> **上线第一件事：进入 后台 → Backup & Security → Change admin password 修改密码。**
> 密码以 scrypt 加盐哈希存在 `config.json`，不会以明文保存。
> 若把 `config.json` 里的 `passwordHash` 和 `salt` 清空，下次启动会重新初始化：
> 可用环境变量 `ADMIN_PASSWORD` 指定初始密码，否则回退到默认 `Yuchuan@2026`。

## 后台能改什么

| 面板 | 功能 |
| --- | --- |
| Dashboard | 内容数量统计、最新询盘、快捷入口 |
| **Products** | 新增/编辑/删除产品，含名称、URL slug、分类、系列、简介、详情、**图片上传**、特性列表、规格表、应用场景、发布/首页推荐、排序 |
| Categories | 产品分类（导航下拉与筛选依赖它）；仍被产品引用的分类禁止删除 |
| **Articles** | 新增/编辑/删除文章，含标题、分类、作者、日期、封面图、摘要、**HTML 正文**、SEO 标题与描述 |
| Applications | 应用/解决方案卡片 |
| **FAQ / GEO** | 买家常见问题与答案（可见 FAQ 区块 + FAQPage 结构化数据，AI 引用率最高的内容形态）；按 `general / products / company / resources` 分配到不同页面 |
| Inquiries | 查看客户询盘（含**流量渠道**与 UTM 归因）、标记已读、删除、**导出 CSV**（询盘永不公开显示） |
| **Site Settings** | 公司全称、品牌名、标语、联系方式、首页文案与数字统计、SEO 三要素、**Canonical 站点域名**、OG 分享图、Logo、社媒主页、GSC/Bing 验证码、AI 爬虫开关、GA4/GTM/Ads/Meta/LinkedIn ID、**询盘通知 Webhook** |
| Backup & Security | 导出全站 JSON、导入备份、修改管理员密码、迁移提示 |

**上传产品图片**：产品编辑框 → Product Image → 点 `Upload` 选择 JPG/PNG/WEBP/GIF（≤6 MB），
上传后可预览，再点 `Save Changes`。留空则使用内置 SVG 设备插画（无需任何图片文件即可上线）。
文章封面同理。

> 文章正文允许 HTML，仅管理员可编辑，前台用 `innerHTML` 渲染。不要开放后台账号给不可信人员。

## 上线前必须替换的占位信息

种子数据里的以下字段是**示例值**，请在 后台 → Site Settings 改成真实信息：
`sales@yuchuan-air.com`、电话、WhatsApp、地址、工作时间、成立年份、认证描述、首页统计数字。
同时把 **Canonical Site URL** 填成正式域名（例如 `https://yourdomain.com`，不带尾斜杠），
它决定 canonical 标签、JSON-LD、OG、`robots.txt`、`sitemap.xml` 与 `llms.txt` 里的绝对地址。

> 首页统计数字（`12+ 年`、`60+ 国家`、`2,000+ 套`）和认证描述同样是占位值。
> GEO 引擎会交叉验证事实，编造或前后不一致的数字会显著降低被 AI 引用的概率，请逐项改成可验证的真实信息。
>
> 完整的 SEO / GEO 与获客执行表见 **[SEO-GEO.md](./SEO-GEO.md)**，域名绑定步骤见 **[DEPLOY.md 第 13 节](./DEPLOY.md)**。

## 目录结构

```
yuchuan-air/
├── server.js            # 单端口 HTTP 服务 + API + 鉴权 + SSR 注入 + 压缩 + 询盘通知
├── config.json          # 端口、会话时长、上传上限、管理员密码哈希（迁移时保留）
├── package.json         # 无 dependencies
├── README.md            # 本文件：后台使用说明
├── DEPLOY.md            # 部署、域名绑定、HTTPS、迁移、备份、验收
├── SEO-GEO.md           # SEO / GEO 与海外询盘作战手册
├── data/
│   ├── db.json          # 全部站点内容 / FAQ / 询盘（后台可编辑）
│   ├── db.backup.json   # 导入前自动生成的回滚副本
│   └── uploads/         # 后台上传的图片
├── lib/
│   ├── store.js         # JSON 数据层（原子写入、自动备份）
│   ├── render.js        # 服务端渲染：导航、页脚、产品、文章、FAQ、卡片
│   └── seo.js           # head 注入、JSON-LD、robots / llms / sitemap
├── public/              # 前台：8 个页面 + style.css + main.js + favicon / OG 图
├── admin/               # 后台：index.html + css + js
└── tests/e2e.js         # 121 项端到端回归测试
```

## SEO / GEO 与回归测试

站点默认**服务端渲染**，不需要执行 JavaScript 就能读到完整正文，这是被 AI 搜索引擎引用的前提。
机器可读入口：`/robots.txt`、`/sitemap.xml`、`/llms.txt`、`/llms-full.txt`，
分类落地页 `/collections/<slug>`，每个页面含 JSON-LD 与绝对 canonical。

```bash
# 本地启动
PORT=3211 node server.js

# 另一终端跑回归测试（期望 RESULT pass=121 fail=0）
ADMIN_PASSWORD='<后台密码>' TEST_PORT=3211 node tests/e2e.js

# 不依赖服务的单元 / 部署测试
node tests/mailer.test.js
node tests/store.test.js
```

> `e2e.js` 会创建并清理临时数据；请勿在正在接单的生产环境高峰时段运行。
> `store.test.js` 只操作系统临时目录，不会碰真实的 `data/db.json`。

## 询盘邮件通知（Resend / Postmark / 自定义 HTTP 接口）

询盘提交后会**同时**触发：写入后台 Inquiries、可选 Webhook、**邮件通知**。邮件用全局 `fetch` 发送，零第三方依赖，Node 与边缘运行时都可用。

**收件人**在后台 `Site Settings → Lead notifications → Inquiry notification recipient` 修改（默认 `info@hanxvonfluid.cn`）。**发信凭据不放在后台、也不放在数据库**——因为 `/api/site` 会原样返回 `settings`，写进去等于公开泄露。凭据只能放 `config.json` 的私有 `email` 段或环境变量：

| 变量 | 说明 |
| --- | --- |
| `EMAIL_PROVIDER` | `resend`（推荐）/ `postmark` / `custom`；留空则不发邮件 |
| `EMAIL_API_KEY` | 邮件 API Key（也可用 `RESEND_API_KEY`） |
| `EMAIL_FROM` | 已验证发件人，例如 `Yuchuan Air <noreply@yourdomain.com>`；测试期可用 `onboarding@resend.dev` |
| `EMAIL_TO` | 默认收件人；后台 `inquiryEmail` 会覆盖它 |
| `EMAIL_ENDPOINT` | 仅 `custom` 模式使用的 HTTPS 接口 |

邮件的 `Reply-To` 自动设为客户邮箱，销售直接点回复即可；正文含 UTM / gclid / fbclid / 来源 / 落地页归因。发信是 fire-and-forget，邮件失败**不会影响**客户提交。

**自检入口**：后台 `Site Settings` 顶部会直接显示 `Inquiry email is ACTIVE / NOT CONFIGURED`（读取 `/api/admin/email-status`，只返回启用状态、provider 与收件人，绝不返回 Key）。验证方式：提交一条测试询盘，看服务端日志 `[mailer] inquiry email sent to ...`，并检查收件箱。完整配置见 [DEPLOY.md 第 16.4 节](./DEPLOY.md)。

## 环境变量

| 变量 | 说明 | 默认 |
| --- | --- | --- |
| `PORT` | 监听端口 | `3000` |
| `HOST` | 绑定地址 | `0.0.0.0` |
| `ADMIN_USERNAME` | 管理员用户名 | `admin` |
| `ADMIN_PASSWORD` | 首次启动时使用的初始密码 | `Yuchuan@2026` |
| `DATA_DIR` | 数据目录；**托管平台务必指向项目外的持久卷**（如 `/var/lib/yuchuan`），不要挂到项目内 `data/`，否则种子文件会被卷遮蔽 | `./data` |
| `FORCE_HTTPS` | 设为 `1`，在 Cloudflare 等反向代理后给 Cookie 加 `Secure` | 关闭 |
| `EMAIL_PROVIDER` / `EMAIL_API_KEY` / `EMAIL_FROM` / `EMAIL_TO` | 询盘邮件通知，见上一节 | 关闭 |

## 数据与迁移要点

- 迁移 = 复制整个项目文件夹（含 `data/` 与 `config.json`）到新服务器，再 `node server.js`。
- 完整上线步骤、Nginx/HTTPS/systemd 配置、验收清单与故障排查见 **[DEPLOY.md](./DEPLOY.md)**。
- 每次从后台导入备份前，系统会把当前数据自动写成 `data/db.backup.json`，可随时回滚。
