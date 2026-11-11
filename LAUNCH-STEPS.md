# 上线逐步操作手册（回合制）

> 适用对象：只负责**登录 / 授权 / 点选 / 粘贴 / 回我一句**的人。
> 所有配置、命令、脚本、文案、DNS 记录内容由我准备。

---

## 先看结论

网站**代码与部署配置已经 100% 就绪**，本地 git 仓库已建好并已推送到 GitHub 私有仓库
（39 个文件）。现在缺的不是开发，而是最后 **1 次平台登录授权（Render）**。

**做完回合 3，网站就已经在公网正式运行、能收询盘邮件了** —— 只是网址还是
`xxx.onrender.com`。域名（你说的"最后绑定"）只是最后换门牌，不需要重做网站，
`Canonical Site URL` 在后台改一次，全站 canonical / sitemap / llms.txt / JSON-LD 会自动跟着变。

| 回合 | 需要登录的平台 | 你要做的动作 | 回我一句 | 能否现在做 |
| --- | --- | --- | --- | --- |
| 0 | 无 | 填一张公司信息表 | ~~见下方模板~~ | ✅ 已完成 2026-11-11 |
| 1 | GitHub | 建**私有**仓库 + 提供地址 | ~~仓库地址~~ | ✅ 已完成 2026-11-11 |
| 2 | Resend | ~~建 API Key + 回我注册邮箱 / 方式~~ | — | ✅ 已完成 2026-11-11 |
| 3 | Render | 导入蓝图 + 粘贴 3 个值 | 源站地址 | ✅ **现在从这里开始** |
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

**验证结果**：端到端 152 项 + 邮件 14 项 + 持久卷 5 项 = **171 项全通过**；
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

**完成标志已达成**：私有仓库根目录能看到 `render.yaml`，39 个文件齐全。

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

> 另一个已查明的优先级陷阱：`lib/mailer.js` 的 `recipient()` 里，
> **后台 `Site Settings → Inquiry notification recipient` 会覆盖 `render.yaml` 的 `EMAIL_TO`**。
> 种子值是 `info@hanxvonfluid.cn`，所以只改 Render 变量没用，2A 阶段这个后台字段也必须改成
> Gmail —— **回合 3 上线后我用管理员接口代改，不用你动手。**

### 切 2B（想让询盘直达企业邮箱时随时可切，不用等新域名）

1. Resend → **Domains → Add Domain** → 填 `hanxvonfluid.cn`
   （这把 Key 仅发信权限、读不了域名接口，需要你在控制台点一下，把页面给出的 TXT 值发我）
2. 我逐条给你 TXT 精确值 → 你在管理 `hanxvonfluid.cn` 解析的平台加记录
   （**只加 TXT，绝对不动 MX**，不影响现有企业邮箱收发）
3. Resend 显示 `Verified` 后我改 2 处：`EMAIL_FROM` → `Yuchuan Air <noreply@hanxvonfluid.cn>`、
   后台通知收件人 → `info@hanxvonfluid.cn`；`render.yaml` 的 `EMAIL_TO` 本来就是企业邮箱，不用动
4. 提交测试询盘，确认日志 `[mailer] inquiry email sent to info@hanxvonfluid.cn`

TXT 细节见 `launch/deploy-values.md` B 段（含「SPF 只能有一条、必须合并」的坑）。

**完成标志已达成**：发件人确定为 `onboarding@resend.dev`，Key 安全落地且发信链路实测成功。

---

## 回合 3｜Render 部署（约 8 分钟）← **现在从这里开始，做完网站就上线了**

**你要做的**：

1. 登录 Render → **New** → **Blueprint** → 连接 GitHub 并**授权** → 选 `yuchuan-air`
2. 页面会自动读根目录 `render.yaml`：一个 Web Service + 1 GB 持久盘（挂 `/var/lib/yuchuan`）
3. 出现 3 个 `sync: false` 变量框，从本地 `launch/local-secrets.txt` 复制粘贴：

   | 变量 | 精确值（可直接照抄） |
   | --- | --- |
   | `ADMIN_PASSWORD` | `launch/local-secrets.txt` 里的 19 位强密码（也是正式站后台登录密码） |
   | `EMAIL_API_KEY` | `launch/local-secrets.txt` 里的 `re_...`（已实测可用） |
   | `EMAIL_FROM` | `onboarding@resend.dev` ← 方式 2A 的最终确定值 |

   其余 `EMAIL_PROVIDER`、`EMAIL_TO`、`DATA_DIR`、`FORCE_HTTPS`、`NODE_VERSION`
   已写在 `render.yaml` 里，不用填。
   > ⚠️ 若你已切 2B，把 `EMAIL_FROM` 换成 `Yuchuan Air <noreply@hanxvonfluid.cn>` 即可。
4. 点 **Apply / Deploy**，等状态变 `Live`

**回我一句**：`回合3完成：https://xxx.onrender.com`

**我接着做**（远程验证，不用你动手）：

- 跑 `launch/acceptance.sh` 源站版：15 产品 / 6 文章 / 14 FAQ、SSR、canonical、robots、llms.txt
- 确认日志出现 `[store] seeded empty data volume from bundled db.json`（空持久卷自动带出完整目录）
- **把后台 `Inquiry notification recipient` 从 `info@hanxvonfluid.cn` 改成 `lukman13929924907@gmail.com`**
  （2A 必需；它的优先级高于 `EMAIL_TO`，不改的话发信会被 Resend 403 拒绝）
- 打开 `/admin` → `Site Settings` 顶部确认绿色 `Inquiry email is ACTIVE`
- 提交一条测试询盘，确认 `lukman13929924907@gmail.com` 收到邮件（含 UTM / 来源归因、`Reply-To`=买家邮箱）
- 删掉测试询盘，交付一份验收结果

**完成标志**：**网站已在公网运行、后台能改产品文章、询盘邮件能收到**（2A 到 Gmail，切 2B 后到企业邮箱）。
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

**我接着做**：把 **`launch/deploy-values.md`** 里的 `YOUR_DOMAIN` / `ORIGIN_HOST` 全部换成你的真实值再给你。该文件已预置好完整记录表（@ / www CNAME、Resend DKIM/SPF/DMARC TXT、GSC/Bing 验证 TXT）、WAF 放行表达式、SSL 设置与验收命令，你照抄即可。

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

- `launch/deploy-values.md`：**可复制的 DNS / WAF / SSL / 发件域 / 站长验证配置包**，回合 4–6 用
- `DEPLOY.md` 第 16 节：Cloudflare / Resend / 域名 / 英语区完整命令与故障速查
- `README.md`：后台各面板、环境变量、邮件通知说明
- `SEO-GEO.md`：关键词地图、AI 引用监测、内容计划
- `render.yaml`：托管部署蓝图；`Dockerfile`：换平台时用
- `tests/`：152 项端到端 + 14 项邮件 + 5 项持久卷回归测试（共 171 项）
- 已内置的英语区合规：`/privacy` 隐私政策页、Cookie 同意横幅、Consent Mode v2、安全响应头（见 `launch/deploy-values.md` H 段）
