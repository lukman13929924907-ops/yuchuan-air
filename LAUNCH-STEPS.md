# 上线逐步操作手册（回合制）

> 适用对象：只负责**登录 / 授权 / 点选 / 粘贴 / 回我一句**的人。
> 所有配置、命令、脚本、文案、DNS 记录内容由我准备。

---

## 先看结论

**2026-11-12 方案变更**：Render 导入蓝图时要求**绑定信用卡**（付费 Starter 实例 + 1GB 持久磁盘）。
按你的要求，已改为 **Cloudflare Pages 静态站 + 同源 Pages Function**：
**免费、不需要信用卡、没有服务器、不会休眠、`robots.txt` 永远正常**；
SSR 正文、JSON-LD、llms.txt、在线后台、询盘邮件与 UTM 归因全部保留。

代码与部署配置已 100% 就绪，并已推送到 GitHub 仓库 `master`。现在缺的只是 **2 次平台授权**：
Cloudflare 账号登录，以及新建一个 GitHub token。做完回合 3，网站就在公网正式运行，
网址是 `xxx.pages.dev`；域名（你说最后绑定）只是最后换门牌。

| 回合 | 需要登录的平台 | 你要做的动作 | 回我一句 | 能否现在做 |
| --- | --- | --- | --- | --- |
| 0 | 无 | ~~填一张公司信息表~~ | — | ✅ 已完成 2026-11-11 |
| 1 | GitHub | ~~建仓库 + 提供地址~~ | — | ✅ 已完成 2026-11-11 |
| 2 | Resend | ~~建 API Key + 回我注册邮箱 / 方式~~ | — | ✅ 已完成，2A 定案 |
| 3 | Cloudflare + GitHub | 建 KV、建 token、建 Pages 项目并粘变量 | `回合3完成：https://xxx.pages.dev` | ✅ **现在从这里开始** |
| 4 | 阿里云 | 买域名 | 域名 | ⏸ 最后 |
| 5 | Cloudflare | 在**已有** Cloudflare 里加域名并绑到 Pages 项目 | NS 已改 | ⏸ 最后 |
| 6 | Google / Bing | 站长验证授权 | 验证完成 | ⏸ 最后 |

> ⚠️ 检测到 GitHub 仓库 `lukman13929924907-ops/yuchuan-air` 目前是 **Public**。
> 建议先到仓库 **Settings → Danger Zone → Change visibility → Make private**
> （不影响 Cloudflare 部署，只要回合 3 授权 GitHub 时勾上这个仓库）。

---

## 三条铁律

1. **敏感值只粘到平台控制台，永远不要发到聊天窗口、截图或公开仓库**：
   `ADMIN_PASSWORD`、`SESSION_SECRET`、`EMAIL_API_KEY`、GitHub token。
   除 GitHub token 需你自己在回合 3 生成外，其余都在本地 `launch/local-secrets.txt`
   （该文件已被 `.gitignore` 忽略，不会推到 GitHub）。
2. **每回合只做当前回合**，做完回我一句固定格式：`回合N完成：<值>`。
   我会做完该回合剩下的所有事，验证通过后才给你下一回合。
3. **卡住就停**，把控制台的报错文字发我（截图请先遮住 Key），不要反复重试或改配置。

---

## 回合 0｜公司真实信息 ✅ 已完成（2026-11-11）

你给的公司信息表已全部写入 `data/db.json`，并同步到首页、About、联系页、隐私页、页脚、
Organization JSON-LD、`llms.txt` 与 `llms-full.txt`。

| 字段 | 网站上的英文表述 |
| --- | --- |
| 电话 | `+86 531 8351 6866`（`tel:` 链接自动去空格） |
| WhatsApp | `+86 172 7882 7749`（`wa.me` 链接自动取数字） |
| 地址 | Environmental Protection Industrial Park, Zhangqiu District, Jinan, Shandong Province, China |
| 工作时间 | 08:00 - 21:00 Beijing Time (GMT+8) |
| 成立年份 | 2018（首页 `Since 2018`、JSON-LD `foundingDate`、`llms.txt`） |
| 海外安装案例 | 35+ Countries with Installed Projects |
| 累计装机量 | 1,900+ Systems Installed |
| 资质 | Business Licence / ISO 9001 / ISO 14001 / CE / Registered Environmental Engineer / Engineering Design Qualification |
| 询盘邮箱 | `info@hanxvonfluid.cn` |

**顺手做的三件事实一致性处理**（GEO 引擎会交叉核对，编造数字会显著降低被 AI 引用概率）：

- 首页 4 个统计从 `12+ / 60+ / 2,000+ / 72h` 全部换成可验证的 `2018 / 35+ / 1,900+ / 08:00-21:00`。
- 删掉未经验证的「Ships in 72 Hours / 72 小时发货」承诺（hero 徽标、分类、产品、FAQ、文章共 6 处），
  统一改成「交期以报价确认」，避免海外买家按无法兑现的承诺来询盘。
- 新增 2 条公司事实 FAQ（资质、装机业绩），Organization JSON-LD 补上 `foundingDate`、
  完整的 `PostalAddress`（城市/省份/国家）和 `hasCredential` 证书数组。

**验证结果**：端到端 152 项 + 邮件 14 项 + 持久卷 5 项 + 管理员密码环境变量 3 项 = **174 项全通过**；
`launch/acceptance.sh` 本地 **49 PASS / 0 FAIL / 2 SKIP**（2 项 SKIP 只在正式 https 域名下才检查）。

**仍可补、但不阻塞上线**：真实产品型号与实拍图、1200×630 PNG 分享图、证书编号/扫描件、
LinkedIn 公司主页 URL。这些随时可以在后台补，不影响回合 1。

预览站：https://yuchuan-air-export.app.workbuddy.host/?sharecode=IBOWCWOKU6
（版式、产品分类、文章哪里不对，一句话告诉我即可。）

---

## 回合 1｜GitHub 私有仓库 ✅ 已完成（2026-11-11）

- 仓库：`https://github.com/lukman13929924907-ops/yuchuan-air.git`（Private）
- 已推送 **39 个文件**、分支 `master`、提交 `d7b692d`；`git ls-remote origin HEAD` 与本地 HEAD 完全一致。
- 安全检查：`launch/local-secrets.txt`、`data/db.backup.json`、`data/uploads/*` 均未被跟踪；
  `config.json` 中的管理密码哈希只存在于私有仓库，未进公开预览。
- 小插曲：本机凭据管理器缓存的是另一个 GitHub 账号 `lukmanliu930805-netizen`，首次 push
  返回 `403 Permission ... denied`。处理方式是把凭据隔离到**本仓库的本地配置**
  （`git config --local credential.namespace yuchuan-air-github` + remote URL 带仓库所属用户名），
  重新 push 即成功；**没有删除或改动全局 GitHub 凭据**，其他仓库不受影响。
- 在线预览已按你的授权重新发布（覆盖原链接）：首页、`/llms.txt`、`/api/site` 均返回 200，
  真实电话 / WhatsApp / 地址 / 2018 / 35+ / 1,900+ / 资质全部可见，无残留占位。

**完成标志已达成**：仓库根目录能看到 `render.yaml`（旧方案存档）与 `scripts/build-static.js`、
`functions/api/[[path]].js`（当前方案）。⚠️ 2026-11-12 检测发现该仓库实际是 **Public**，
建议改为 Private（见结论段提醒）。

---

## 回合 2｜Resend 发信通道 ✅ 已完成（2026-11-11，方式 2A）

**你给的**：注册邮箱 `lukman13929924907@gmail.com`、方式 2A、一把仅发信权限的 API Key。
Key 已写入本机 `launch/local-secrets.txt`（该文件被 `.gitignore` 忽略，**不会进 GitHub、不会进预览站**）。

**我做的实测**（用真实 API 与项目自己的 `lib/mailer.js` 跑过，不是推测）：

| 验证项 | 结果 |
| --- | --- |
| `POST /emails` → 注册邮箱 | **200**，邮件 ID `01a1ca41-...`；请查收标题 `Yuchuan Air - Resend delivery test` |
| `GET /domains`、`GET /api-keys` | 401 `restricted_api_key` —— **Key 没坏**，只是仅发信权限、读不了账户信息，对本项目用途完全够 |
| 用真实 `sendInquiryEmail()` 发一封带 UTM 归因与 `Reply-To` 的模拟询盘 | **成功**，日志 `[mailer] inquiry email sent to lukman13929924907@gmail.com` |

### ⚠️ 必须知道：2A 发不到企业邮箱

因为**注册邮箱是 Gmail，不是 `info@hanxvonfluid.cn`**，Resend 的测试发件人
`onboarding@resend.dev` 只能发给注册邮箱。实测发往企业邮箱被拒：

```text
403 validation_error
You can only send testing emails to your own email address
(lukman13929924907@gmail.com). To send emails to other recipients,
please verify a domain at resend.com/domains ...
```

所以 **2A 阶段询盘发到 `lukman13929924907@gmail.com`** —— 仍是你自己的邮箱、一条不丢
（同时存进后台 `Inquiries`），只是暂时不在企业邮箱。要直达 `info@hanxvonfluid.cn` 必须切 **2B**。

> **旧 Node 版的优先级陷阱（静态版已消除）**：`lib/mailer.js` 的 `recipient()` 里，
> 后台 `Inquiry notification recipient` 会覆盖 `EMAIL_TO`。新的 Cloudflare Pages Function
> 直接读服务端 `EMAIL_TO` 变量，后台那个字段仅作文档用途，**不需要再代改，也不会踩 403**。

### 切 2B（想让询盘直达企业邮箱时随时可切，不用等新域名）

1. Resend → **Domains → Add Domain** → 填 `hanxvonfluid.cn`
   （这把 Key 仅发信权限、读不了域名接口，需要你在控制台点一下，把页面给出的 TXT 值发我）
2. 我逐条给你 TXT 精确值 → 你在管理 `hanxvonfluid.cn` 解析的平台加记录
   （**只加 TXT，绝对不动 MX**，不影响现有企业邮箱收发）
3. Resend 显示 `Verified` 后改 Cloudflare 的 2 个变量：
   `EMAIL_FROM` → `Yuchuan Air <noreply@hanxvonfluid.cn>`、
   `EMAIL_TO` → `info@hanxvonfluid.cn`（静态版不再需要改后台字段），然后重新部署
4. 提交一条测试询盘，确认企业邮箱收到

TXT 细节见 `launch/deploy-values.md` B 段（含「SPF 只能有一条、必须合并」的坑）。

**完成标志已达成**：发件人确定为 `onboarding@resend.dev`，Key 安全落地且发信链路实测成功。

> ✅ **用户已确认（2026-11-11）：按 2A 继续，不再切换 2B。**
> `info@hanxvonfluid.cn` 保持为前端客户看到的联系邮箱（页脚 / 联系页 / 结构化数据都不变），
> 询盘通知邮件投递到 `lukman13929924907@gmail.com`。上面 2B 步骤仅作为将来可选的升级路径保留。

---

## 回合 3｜Cloudflare Pages 部署（约 10 分钟）← **现在从这里开始，做完网站就上线了**

**为什么换**：Render 蓝图要求绑定信用卡（付费 Starter + 持久磁盘）。
新方案是静态站 + 同源边缘函数：静态页面请求**免费且无限**，只有 `/api/*` 走 Functions
（免费额度每天 10 万次）。后台保存 → 写入 GitHub → Cloudflare 自动重建发布。

### 3-1 创建 GitHub token（约 2 分钟）

1. GitHub → 头像 → **Settings → Developer settings → Personal access tokens →
   Fine-grained tokens → Generate new token**
2. Token name `yuchuan-pages`；Expiration 选 `No expiration` 或 90 天
3. **Repository access → Only select repositories** → 勾 `lukman13929924907-ops/yuchuan-air`
4. **Permissions → Repository permissions → Contents: Read and Write**
   （Metadata: Read-only 会自动带上）
5. Generate → 复制 `github_pat_...`
   ⚠️ **只粘到 Cloudflare 的 `GITHUB_TOKEN` 变量框，不要发我、不要发聊天窗口。**

### 3-2 创建 KV 命名空间（约 1 分钟）

登录 **https://dash.cloudflare.com**（免费账号只需邮箱，**不需要信用卡**）
→ 左侧 **Workers & Pages → KV → Create a namespace**
→ 名称填 `yuchuan-inquiries` → Add。

> KV 用来存询盘（买家信息不进代码仓库）。不接也能收到询盘邮件，
> 但后台 Inquiries 列表不会保存记录，所以这一步别漏。

### 3-3 创建 Pages 项目（约 5 分钟）

1. **Workers & Pages → Create → Pages → Connect to Git**
2. 选 **GitHub** → 点授权，账号选 `lukman13929924907-ops`，仓库勾 `yuchuan-air`
   （私有仓库必须显式勾选，否则列表里看不到）→ 确认
3. 选中 `yuchuan-air` → **Begin setup**，逐项填：

   | 字段 | 值 |
   | --- | --- |
   | Project name | `yuchuan-air`（决定 `https://yuchuan-air.pages.dev`） |
   | Production branch | `master` |
   | Framework preset | `None` |
   | Build command | `node scripts/build-static.js` |
   | Build output directory | `dist` |
   | Root directory | `/` |

4. 展开 **Environment variables**，逐个 Add（精确值在 `launch/local-secrets.txt`）：

   | 变量 | 值 |
   | --- | --- |
   | `ADMIN_PASSWORD` | 文件里的 19 位强密码（正式站后台登录密码） |
   | `SESSION_SECRET` | 文件里 2026-11-12 新增的会话签名串 |
   | `GITHUB_TOKEN` | 3-1 生成的 `github_pat_...` |
   | `GITHUB_REPO` | `lukman13929924907-ops/yuchuan-air` |
   | `GITHUB_BRANCH` | `master` |
   | `EMAIL_API_KEY` | 文件里的 `re_...` |
   | `EMAIL_FROM` | `onboarding@resend.dev` |
   | `EMAIL_TO` | `lukman13929924907@gmail.com` |
   | `SITE_URL` | `https://yuchuan-air.pages.dev`（项目名不同就换成实际地址） |
   | `NODE_VERSION` | `22` |

5. 点 **Save and Deploy**，等第一次构建状态变 `Live`
6. 部署完成后：项目 → **Settings → Functions → KV namespace bindings → Add binding**
   → Variable name 填 `INQUIRIES` → 选 `yuchuan-inquiries` → Save
   → 回 **Deployments** 对最近一次部署点 **Retry deployment**，让绑定生效。

**回我一句**：`回合3完成：https://xxx.pages.dev`

**我接着做**（远程验证，不用你动手）：

- 跑 `launch/acceptance.sh`：SSR 正文、canonical、robots 放行 AI 爬虫、sitemap、
  llms.txt、隐私页、安全头、真实公司信息、6 个爬虫 UA
- 额外验收静态版特有项：`/_routes.json` 只放行 `/api/*`、`/_data/site.json` 与 `/api/site` 同版本、
  `no-store` 生效、同源 `/api/site` 可读、未登录 `/api/admin/data` 返回 401、后台登录与内容读取正常
- 提交一条测试询盘 → 确认 Gmail 收到（含 UTM 来源归因、`Reply-To` = 买家邮箱）→ 后台删掉测试记录
- 交付一份验收结果

**完成标志**：网站已在公网运行，后台能改产品/文章，询盘邮件能收到，
**全程零费用、零信用卡、零休眠**。此时可以先投内容、跑小额广告；域名只是最后换网址。

### 回合 3 之后的行为变化（请记住）

- 后台保存后**数据立刻写入 GitHub**，公开页面由 Cloudflare 自动重建，约 **1 分钟**后刷新；
  后台面板里立刻能看到新内容。
- 图片上传上限 **900 KB**（GitHub 接口限制），建议先压成 JPG / WEBP。
- 改管理员密码请改 Cloudflare 的 `ADMIN_PASSWORD` 变量并重新部署，后台面板里改不了。
- `info@hanxvonfluid.cn` 仍是前端客户看到的联系邮箱；询盘通知按 2A 发到 Gmail。

---

## 回合 4｜阿里云买域名（你说最后做，现在才开始）

**你要做的**：登录阿里云 → 域名注册 → 买下域名。

**回我一句**：`回合4完成：域名=xxx.com`

**我接着做**：给你命名建议、Cloudflare DNS 记录清单、以及 www 301 / Canonical 的最终值。
命名原则：`.com` 优先、尽量短、含 `air` / `dust` / `fume` / `yuchuan` 之一、不用连字符、
避免与已有品牌近似。**只买域名、此刻先不要改任何解析。**

---

## 回合 5｜绑定自定义域名（约 10 分钟）

> 前提：域名已在阿里云买好（回合 4），Cloudflare 账号已在回合 3 建好。
> **静态 Pages 不需要「回源」**：不用 CNAME 指向任何服务器、不用配 `Full (strict)`、
> 不用买证书，Cloudflare 在边缘直接托管页面并自动签发 HTTPS 证书。

**你要做的**：

1. 登录 Cloudflare → **Add a site** → 输入域名 → 选 **Free** 计划
2. Cloudflare 给出两个 nameserver → 到阿里云域名控制台 → **修改 DNS 服务器** → 填这两个 NS → 保存
3. 回 Cloudflare 点 **Done, check nameservers**（生效几分钟到几小时）

**回我一句**：`回合5完成：NS 已改`

**我接着做**：把 `launch/deploy-values.md` 里的 `YOUR_DOMAIN` 换成真实值给你。

**你要做的（续）**：

- 打开回合 3 建好的 **Pages 项目 → Custom domains → Add custom domain** → 填 `你的域名`
  → Cloudflare **自动创建 CNAME 并签发免费证书**，不用手动加 A/CNAME
- 再加一个 `www.你的域名` 自定义域名，用 **Redirect Rules** 把 www 301 到主域
- 两处填同一个值并重新部署：Cloudflare 环境变量 `SITE_URL` = `https://你的域名`，
  后台 `Site Settings → Canonical Site URL` 也填 `https://你的域名`
- ⚠️ **关闭 Bot Fight Mode / 取消「Block AI Scrapers」**，并按我给的 WAF 规则放行
  `GPTBot`、`OAI-SearchBot`、`ClaudeBot`、`PerplexityBot`、`Google-Extended`、`CCBot`

**为什么这一步最致命**：Cloudflare 默认会让上述 AI 爬虫全部返回 **403**，
`robots.txt` 里写了 Allow 也没用 —— 前面做的 SSR、`/llms.txt`、FAQ 结构化数据会全部白费。
我会用 `curl -A "GPTBot" -I` 逐条验证必须全部 200。

---

## 回合 6｜收尾与验收（我为主，你只需一次站长验证授权）

**我接着做**：

- 后台 `Site Settings → Canonical Site URL` 填 `https://你的域名`（一次改完全站 canonical / sitemap / llms.txt / JSON-LD）
- 核对 Pages 自定义域名与 `SITE_URL` / Canonical 完全一致；Resend 若切 2B 此时验证发件域
- 给出 GSC / Bing Webmaster 的 sitemap 提交地址与验证 TXT 记录
- 跑 `launch/acceptance.sh` 全量验收，输出逐项 PASS/FAIL 报告
- 给 30/60/90 天获客执行表（`SEO-GEO.md`）

**你要做的**：登录 Google Search Console / Bing Webmaster，用我给的 TXT 记录完成域名验证并授权；
登录后台把最后一条测试询盘删掉。

---

## 附：验收脚本（我在回合 3 / 6 会跑，你也可自己跑）

```bash
cd yuchuan-air
bash launch/acceptance.sh https://你的域名        # 正式站
bash launch/acceptance.sh http://127.0.0.1:3211  # 本地自检
```

脚本检查：首页/后台/产品页/分类页/文章页、`robots.txt`、`sitemap.xml`、
`llms.txt`、SSR 正文（不执行 JS）、canonical 域名、6 个 AI 爬虫 UA 状态、
`/api/site` 的公司名与产品数、公开设置里有没有密钥泄露。

---

## 附：技术参考（不用读，卡住时我再翻）

- `launch/deploy-values.md`：**可复制的 DNS / WAF / SSL / 发件域 / 站长验证配置包**，回合 4–6 用
- `DEPLOY.md` **第 17 节**：当前 Cloudflare Pages 静态部署方案（第 16 节为旧 Render 方案存档）
- `README.md`：两种运行模式、后台各面板、环境变量、邮件通知说明
- `SEO-GEO.md`：关键词地图、AI 引用监测、内容计划
- `scripts/build-static.js`：静态预渲染；`functions/api/[[path]].js`：同源边缘 API；
  `render.yaml` / `Dockerfile`：旧付费容器方案存档，不要导入
- `tests/`：152 项端到端 + 14 项邮件 + 5 项持久卷 + 3 项管理员密码 + 69 项边缘/静态构建（共 243 项）
- 已内置的英语区合规：`/privacy` 隐私政策页、Cookie 同意横幅、Consent Mode v2、安全响应头（见 `launch/deploy-values.md` H 段）
