# 上线逐步操作手册（回合制）

> 适用对象：只负责**登录 / 授权 / 点选 / 粘贴 / 回我一句**的人。
> 所有配置、命令、脚本、文案、DNS 记录内容由我准备。

---

## 先看结论

网站**代码与部署配置已经 100% 就绪**，本地 git 仓库也已建好（34 个文件，首次提交完成）。
现在缺的不是开发，而是 3 次平台登录授权。

**做完回合 1–3，网站就已经在公网正式运行、能收询盘邮件了** —— 只是网址还是
`xxx.onrender.com`。域名（你说的"最后绑定"）只是最后换门牌，不需要重做网站，
`Canonical Site URL` 在后台改一次，全站 canonical / sitemap / llms.txt / JSON-LD 会自动跟着变。

| 回合 | 需要登录的平台 | 你要做的动作 | 回我一句 | 能否现在做 |
| --- | --- | --- | --- | --- |
| 0 | 无 | 填一张公司信息表 | 见下方模板 | ✅ 立刻 |
| 1 | GitHub | 建**私有**仓库 + 浏览器授权一次 | 仓库地址 | ✅ 立刻 |
| 2 | Resend | 建一个 API Key（Key 不用发我） | 注册邮箱 + 发件方式 | ✅ 立刻 |
| 3 | Render | 导入蓝图 + 粘贴 3 个值 | 源站地址 | ✅ 立刻 |
| 4 | 阿里云 | 买域名 | 域名 | ⏸ 最后 |
| 5 | Cloudflare | 改 NS + 加我给的记录 | NS 已改 | ⏸ 最后 |
| 6 | Google / Bing | 站长验证授权 | 验证完成 | ⏸ 最后 |

---

## 三条铁律

1. **敏感值只粘到平台控制台，永远不要发到聊天窗口、截图或公开仓库**：
   `ADMIN_PASSWORD`、`EMAIL_API_KEY`、GitHub token。它们已写在本地
   `launch/local-secrets.txt`（该文件已被 `.gitignore` 忽略，不会推到 GitHub）。
2. **每回合只做当前回合**，做完回我一句固定格式：`回合N完成：<值>`。
   我会做完该回合剩下的所有事，验证通过后才给你下一回合。
3. **卡住就停**，把控制台的报错文字发我（截图请先遮住 Key），不要反复重试或改配置。

---

## 回合 0｜公司真实信息（无需登录，约 5 分钟）

现在的电话 `+86 531 8899 0666`、WhatsApp、地址、`12+ 年` / `60+ 国家` / `2,000+ 系统`
全是占位示例。GEO 引擎会交叉验证事实，编造数字会显著降低被 AI 引用概率。

**你要做的**：把下面这张表填好发我（不确定就写「保持现状」，我会保留英文示例并标注待补）：

```
回合0完成：
电话（含国家码）：
WhatsApp：
地址（英文，用于页脚与联系页）：
工作时间（英文，建议写回复承诺而不是 GMT+8）：
成立年份 / 工程年限：
出口国家数：
累计装机量：
真实资质（ISO / CE 编号；没有就写「删除」）：
公司一句话英文简介（可选）：
主推 3–5 款产品型号（可选）：
主推产品实拍图（可选，直接把图片文件放进 data/uploads/ 并告诉我文件名）：
```

顺手打开预览站看一眼：https://yuchuan-air-export.app.workbuddy.host/?sharecode=IBOWCWOKU6
版式、产品分类、文章哪里不对，一句话一起告诉我。

**我接着做**：写进 `data/db.json` → 跑 121 项回归测试 → 重新发布预览 → 再提交一次 git。
**完成标志**：预览站显示你的真实信息，测试全绿。

---

## 回合 1｜GitHub 私有仓库（约 3 分钟）

**你要做的**：

1. 登录 GitHub → 右上角 `+` → **New repository**
2. 仓库名填 `yuchuan-air`，选 **Private**（重要：`config.json` 含管理密码哈希，不要公开）
3. **不要**勾选 README / .gitignore / license 任何初始化选项 → 点 **Create repository**
4. 复制页面上的仓库地址（`https://github.com/<你的账号>/yuchuan-air.git`）

**回我一句**：`回合1完成：https://github.com/xxx/yuchuan-air.git`

**我接着做**：配置 remote 并执行 push。
**这时会弹出浏览器让你登录 GitHub 并点一次 Authorize —— 这一步就是你说的「授权」，点完就不用管了。**

**完成标志**：GitHub 仓库里出现 34 个文件，根目录能看到 `render.yaml`。
> 如果没弹浏览器而是报权限错，最省事的办法：装 **GitHub Desktop** 登录 →
> `File → Add Local Repository` → 选 `E:\国内\workbody\2026-11-08-09-03-25\yuchuan-air`
> → 点 `Publish repository`。全程鼠标，不用命令行。

---

## 回合 2｜Resend 发信通道（约 5 分钟）

邮箱地址 ≠ 发信通道。`info@hanxvonfluid.cn` 是**收件**地址，网站要自动发信还需要一个发件服务。

**你要做的**：

1. 登录 / 注册 Resend → 左侧 **API Keys** → **Create API Key** → 复制 `re_...`
   **这个值不要发给我**，留到回合 3 直接粘进 Render 的变量框。
2. 回我注册 Resend 时用的**邮箱**（非敏感），以及选哪种发件方式：

| 方式 | 做法 | 适合 |
| --- | --- | --- |
| **2A 最省事** | 直接用 `info@hanxvonfluid.cn` 注册 Resend。测试发件人 `onboarding@resend.dev` 只能发给注册邮箱，这样询盘邮件立刻就到企业邮箱 | 想现在就跑通 |
| **2B 推荐（不需要新域名）** | Resend → **Domains** → 添加 `hanxvonfluid.cn` → 我给你 3 条 TXT 记录内容 → 你在该域名 DNS 后台加记录（**只加 TXT，不动 MX，不影响现有企业邮箱**）→ 验证通过后发件人改成 `Yuchuan Air <noreply@hanxvonfluid.cn>` | 长期正规、发件人显示自家域名 |
| 2C | 等新域名买好再验证发件域 | 邮件可以晚点到 |

**回我一句**：`回合2完成：注册邮箱=xxx；方式=2A`（或 2B / 2C）

**我接着做**：给你回合 3 要粘的 `EMAIL_FROM` / `EMAIL_TO` 精确值；若选 2B，把 DKIM / SPF / DMARC 的 TXT 记录逐条列给你。
**完成标志**：确定发件人；Key 在你手里、从未经过对话。

---

## 回合 3｜Render 部署（约 8 分钟）— **这一步做完网站就上线了**

**你要做的**：

1. 登录 Render → **New** → **Blueprint** → 连接 GitHub 并**授权** → 选 `yuchuan-air`
2. 页面会自动读根目录 `render.yaml`：一个 Web Service + 1 GB 持久盘（挂 `/var/lib/yuchuan`）
3. 出现 3 个 `sync: false` 变量框，从本地 `launch/local-secrets.txt` 复制粘贴：

   | 变量 | 值从哪来 |
   | --- | --- |
   | `ADMIN_PASSWORD` | `launch/local-secrets.txt` 里的 19 位强密码（也是正式站后台登录密码） |
   | `EMAIL_API_KEY` | 回合 2 复制的 `re_...` |
   | `EMAIL_FROM` | 我按你选的 2A / 2B 给的确切值 |

   其余 `EMAIL_PROVIDER`、`EMAIL_TO`、`DATA_DIR`、`FORCE_HTTPS`、`NODE_VERSION`
   已写在 `render.yaml` 里，不用填。
4. 点 **Apply / Deploy**，等状态变 `Live`

**回我一句**：`回合3完成：https://xxx.onrender.com`

**我接着做**（远程验证，不用你动手）：

- 跑 `launch/acceptance.sh` 源站版：15 产品 / 6 文章 / 12 FAQ、SSR、canonical、robots、llms.txt
- 确认日志出现 `[store] seeded empty data volume from bundled db.json`（空持久卷自动带出完整目录）
- 打开 `/admin` → `Site Settings` 顶部确认绿色 `Inquiry email is ACTIVE`
- 提交一条测试询盘，确认 `info@hanxvonfluid.cn` 收到邮件（含 UTM / 来源归因、`Reply-To`=买家邮箱）
- 删掉测试询盘，交付一份验收结果

**完成标志**：**网站已在公网运行、后台能改产品文章、询盘能发到你企业邮箱。**
此时可以先开始投内容、跑小额广告；域名只是最后换网址。

> 技术约束（已替你处理）：Cloudflare 的 DNS/SSL/WAF 只是边缘反代，不跑 Node、不存文件，
> 所以必须有一个带持久磁盘的 Node 容器回源。持久卷挂在项目外的 `/var/lib/yuchuan`，
> **绝不能挂到 `/app/data`** —— 卷会遮住镜像内自带的种子 `db.json`，导致上线是空站。

---

## 回合 4｜阿里云买域名（你说最后做，现在才开始）

**你要做的**：登录阿里云 → 域名注册 → 买下域名。

**回我一句**：`回合4完成：域名=xxx.com`

**我接着做**：给你命名建议、Cloudflare DNS 记录清单、以及 www 301 / Canonical 的最终值。
命名原则：`.com` 优先、尽量短、含 `air` / `dust` / `fume` / `yuchuan` 之一、不用连字符、
避免与已有品牌近似。**只买域名、此刻先不要改任何解析。**

---

## 回合 5｜Cloudflare 接入（约 10 分钟）

**你要做的**：

1. 登录 Cloudflare → **Add a site** → 输入域名 → 选 **Free** 计划
2. Cloudflare 给出两个 nameserver（如 `xxx.ns.cloudflare.com`）
3. 到阿里云域名控制台 → **修改 DNS 服务器** → 填这两个 NS → 保存
4. 回 Cloudflare 点 **Done, check nameservers**（生效可能要几分钟到几小时）

**回我一句**：`回合5完成：NS 已改`

**我接着做**：给你一张可直接照抄的记录表（@ / www CNAME 指向源站、Resend 的 DKIM/SPF/DMARC TXT）。

**你要做的（续）**：

- 在 Cloudflare DNS 里按表加记录，`@` 和 `www` 都开**橙云代理**
- **SSL/TLS → Overview → 选 `Full (strict)`**（选 Flexible 会重定向循环 + 明文回源）
- 开启 **Always Use HTTPS**，把 www 301 到主域
- ⚠️ **关闭 Bot Fight Mode / 取消「Block AI Scrapers」**，并按我给的 WAF 规则放行
  `GPTBot`、`OAI-SearchBot`、`ClaudeBot`、`PerplexityBot`、`Google-Extended`、`CCBot`

**为什么这一步最致命**：Cloudflare 默认会让上述 AI 爬虫全部返回 **403**，
`robots.txt` 里写了 Allow 也没用 —— 前面做的 SSR、`/llms.txt`、FAQ 结构化数据会全部白费。
我会用 `curl -A "GPTBot" -I` 逐条验证必须全部 200。

---

## 回合 6｜收尾与验收（我为主，你只需一次站长验证授权）

**我接着做**：

- 后台 `Site Settings → Canonical Site URL` 填 `https://你的域名`（一次改完全站 canonical / sitemap / llms.txt / JSON-LD）
- Render 后台添加自定义域名；Resend 若选 2C 此时验证发件域并切换 `EMAIL_FROM`
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

- `DEPLOY.md` 第 16 节：Cloudflare / Resend / 域名 / 英语区完整命令与故障速查
- `README.md`：后台各面板、环境变量、邮件通知说明
- `SEO-GEO.md`：关键词地图、AI 引用监测、内容计划
- `render.yaml`：托管部署蓝图；`Dockerfile`：换平台时用
- `tests/`：121 项端到端 + 14 项邮件 + 5 项持久卷回归测试
