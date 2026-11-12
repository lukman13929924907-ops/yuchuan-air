# SEO / GEO 与海外询盘作战手册

> 适用站点：Shandong Yuchuan Environmental Protection and Energy Saving Technology Co., Ltd. 外贸站
> 配套文档：`DEPLOY.md`（服务器、域名、HTTPS、迁移）、`README.md`（后台使用）
> 本手册回答三个问题：**怎么被 Google 找到 → 怎么被 AI 推荐 → 怎么把流量变成询盘**

---

## 0. 一句话结论

搜索引擎优化（SEO）决定「客户搜得到你」，生成式引擎优化（GEO）决定「客户问 ChatGPT / Perplexity / Gemini 时，答案里出现的是你」，而询盘转化决定「找到你之后会不会发邮件」。**顺序不能反**：先把页面做成机器能读懂的完整 HTML，再谈内容和投放。

本项目已经把技术地基做完（见第 1 节），你接下来要做的 80% 是**内容真实性 + 域名上线 + 渠道运营**，而不是继续改代码。

---

## 1. 本次已经修好的技术地基（无需重复做）

| 之前的隐患 | 现在的状态 |
| --- | --- |
| 所有产品/文章由浏览器 JS 渲染，AI 爬虫只看到 `Loading product…` | **服务端渲染（SSR）**：每个 URL 直接返回完整 HTML，含产品名、描述、规格表、FAQ、导航、公司信息 |
| 无结构化数据 | **JSON-LD @graph**：Organization、WebSite、BreadcrumbList、Product、BlogPosting、FAQPage、CollectionPage、ContactPage |
| canonical 是相对路径 `/`，OG 标签残缺 | 绝对 canonical、hreflang、OG/Twitter 全套、`og:image`、站长验证 meta |
| robots.txt 只有一行 | 显式放行 GPTBot / OAI-SearchBot / ChatGPT-User / ClaudeBot / PerplexityBot / Google-Extended / CCBot 等 16 个 AI 爬虫 |
| 无 llms.txt | `/llms.txt`（站点摘要 + 关键页面）与 `/llms-full.txt`（产品与文章全文） |
| sitemap 无日期、含参数 URL | 含 lastmod / priority / 图片节点 / 分类落地页，无重复参数页 |
| 分类只能靠 `?category=` 筛选，无法被索引 | 新增 `/collections/<slug>` 分类落地页，带 CollectionPage + ItemList |
| 无压缩、无缓存校验 | Brotli / gzip、ETag + 304、静态资源缓存、`.html` 与旧 `/post` 301 归一化 |
| 询盘只有姓名邮箱，不知道客户从哪来 | UTM / gclid / fbclid / referrer / 首次落地页 / 语言 / 渠道分类、honeypot 反垃圾、Webhook 即时通知、CSV 导出、GA4/Ads/Meta 转化事件 |
| FAQ 无处维护 | 后台新增「FAQ / GEO」面板，12 条种子问答，改动即时进入 SSR 与 FAQPage schema |

> 验证方式：启动站点后运行 `ADMIN_PASSWORD=<后台密码> TEST_PORT=3211 node tests/e2e.js`，116 项回归测试覆盖上述全部能力。

---

## 2. 上线前必须完成的 12 项配置（后台 /admin → Site Settings）

按优先级排序，前 5 项不做就不要提交搜索引擎。

| # | 配置项 | 后台字段 | 说明 |
| --- | --- | --- | --- |
| 1 | **Canonical Site URL** | `siteUrl` | 填 `https://你的域名.com`（无尾斜杠）。它一次性决定 canonical、JSON-LD、sitemap、robots、llms.txt 里的域名。忘填会全部指向预览域名或 IP |
| 2 | **改管理员密码** | Backup & Security | 见 `README.md` 里的初始密码 |
| 3 | ~~替换所有占位信息~~ ✅ 已完成 | 公司/联系方式 | 2026-11-11 已填真实电话、WhatsApp、地址、工作时间、`founded`、`certifications`、`stats`；如需改动请在后台改，并保持各页面口径一致 |
| 4 | **上传 1200×630 PNG 分享图** | `ogImage` | 内置 SVG 仅够预览；LinkedIn / WhatsApp / Facebook 对 SVG 支持不稳定 |
| 5 | **Google / Bing 站长验证码** | `googleSiteVerification`、`bingSiteVerification` | 只填验证码本身，不要整段 meta 标签 |
| 6 | 公司 Logo | `logoUrl` | 用于 Organization schema，建议 600×60 或正方形 PNG |
| 7 | 社媒主页 | `linkedinUrl` / `youtubeUrl` / `facebookUrl` / `twitterHandle` | 进入 `sameAs`，是 AI 判断「这家公司是真实实体」的重要信号，**NAP 必须与官网一致** |
| 8 | GA4 衡量 ID | `gaMeasurementId` | 形如 `G-XXXXXXXXXX`，启用 `generate_lead` 事件 |
| 9 | GTM / Ads / Meta / LinkedIn ID | 对应字段 | 投放后再填；不投也可以留空 |
| 10 | 询盘通知 Webhook | `inquiryWebhook` | 见第 6 节，强烈建议第一天就配好 |
| 11 | `aiCrawlersAllow` | 保持勾选 | 关掉等于从 ChatGPT / Perplexity 答案里消失 |
| 12 | 真实产品图与参数 | Products 面板 | 每个产品上传实拍图，替换示例型号/参数 |

### 关于「真实数字」的特别提醒

2026-11-11 已把 `12+ Years`、`60+ Countries Served`、`2,000+ Systems Installed`、`72h Quick-Ship`
等占位示例全部替换为可验证事实：`2018 年成立`、`35+ 个国家有实际安装案例`、`1,900+ 台套装机量`、
`08:00–21:00 (GMT+8)`，资质为营业执照 / ISO 9001 / ISO 14001 / CE / 环保注册师 / 设计资质。
未获确认的「72 小时发货」承诺已从 hero、产品、FAQ、文章中删除，统一改为「交期以报价确认」。

GEO 引擎会交叉比对多个来源，后续在后台改这些数字时，务必在 About、FAQ、`llms.txt`、
Organization JSON-LD 与 LinkedIn 公司页保持**完全一致的表述**；新增任何业绩数字前请先确认可举证。
另外，示例产品型号与参数仍是占位，替换时同样不要写入未经验证的性能数据。

---

## 3. SEO：关键词地图与页面分工

### 3.1 按购买意图分层

| 层级 | 关键词示例（英文） | 承接页面 | 目标 |
| --- | --- | --- | --- |
| 品类词（高流量、高竞争） | `industrial dust collector`、`welding fume extractor`、`cartridge dust collector`、`downdraft table`、`oil mist collector` | 首页 + `/products` + 分类页 | 长期排名、品牌曝光 |
| 应用/问题词（中竞争、转化好） | `dust collector for aluminum grinding`、`combustible dust collector ATEX`、`welding fume extraction for robotic cells`、`CNC oil mist collector` | `/applications` + 分类页 + 技术文章 | **最值得优先做** |
| 选型对比词（AI 引用率最高） | `cartridge vs wet dust collector`、`portable fume extractor vs ambient air cleaner`、`how to size a dust collector CFM` | 博客文章 + FAQ | GEO 与 AI Overview |
| 供应商/交易词（转化最高） | `dust collector manufacturer China`、`OEM fume extractor supplier`、`CE certified downdraft table manufacturer`、`buy wet dust collector 400V 50Hz` | `/about` + `/contact` + 产品页 | 询盘 |
| 合规/维护长尾 | `OSHA welding fume exposure limits`、`NFPA 652 combustible dust`、`filter differential pressure maintenance` | 博客 | 持续自然流量 |

### 3.2 每个页面只主攻一个主题

- **首页**：`industrial air filtration / dust collection systems + 品牌名`，不要再堆具体型号词。
- **分类页 `/collections/<slug>`**：主攻该品类词，例如 `/collections/wet-dust-collectors` → `wet dust collector / wet scrubber for combustible dust`。后台 Category 里可填 `seoTitle` / `seoDescription`（已支持），优先把描述写清楚「适合什么工况、不适合什么工况」。
- **产品页**：主攻 `型号 + 规格 + quote`，标题模板已是 `<产品名> - Specifications & Quote | Yuchuan Air`。
- **文章页**：一页一个问题，H2 用小标题切分，正文里放**具体数字、对比表、结论句**。
- 站内链接：每篇文章至少链回 1 个分类页 + 1 个产品页 + `/contact`；产品页链回分类页与应用页。SSR 导航与页脚已经自动生成这些链接。

### 3.3 内容节奏

- 每月 2–4 篇技术文章，先从「选型对比」和「应用工况」两类写起，这两类同时服务 SEO 与 GEO。
- 每次改动产品/文章，服务端会自动更新 `dateModified` 与 sitemap 的 `lastmod`，无需手工维护。
- **反面清单**：关键词堆砌、批量 AI 生成的空洞段落、买卖链接、隐藏文本、复制竞争对手文案、虚假案例与假认证。

---

## 4. GEO：让 AI 答案里出现你

### 4.1 为什么现在能被读到

多数 AI 爬虫不执行 JavaScript。现在服务器直接吐出完整 HTML，且包含：
- 每个产品页开头的 **answer-first 段落**（`geo-answer`）：一句话说明「这是什么、谁造的、用在什么工况、关键参数」；
- 可见的 **FAQ 折叠区块** + 对应的 `FAQPage` JSON-LD（AI 引用率最高的内容形态）；
- **规格表**、**对比型答案**、明确的成立时间/地点/认证/交期；
- `/llms.txt` 与 `/llms-full.txt`。

### 4.2 内容写法（写给 AI，也写给人）

1. **先给结论，再给理由**：每段开头就是可被直接引用的完整句，避免「我们致力于……」这类无信息量表述。
2. **用数字替代形容词**：`Up to 12,000 CFM / 20,400 m³/h`、`1,900+ systems installed in 35+ countries` 远优于 `high performance`、`rich experience`。只写有据可查的数字，未确认的交期不要写具体小时数。
3. **一段只讲一件事**，脱离上下文也能读懂（AI 是按片段检索，不是按整页）。
4. **多写对比表和「什么时候不该用」**，这类判断性内容最容易被引用。
5. **全站口径一致**：同一型号的电压、风量、认证在 llms.txt、FAQ、产品页、LinkedIn 上必须一致，矛盾信息会让模型回避引用。

### 4.3 第三方背书（GEO 最大权重，纯靠自己站点不够）

按投入产出排序：
1. **LinkedIn 公司页**（完整信息 + 定期发产品/案例），并填进 `sameAs`；
2. **B2B 行业目录**：ThomasNet、Kompass、Europages、DirectIndustry、Made-in-China、Alibaba 店铺（信息必须与官网 NAP 一致）；
3. **YouTube 产品实拍/安装视频**，描述里链回产品页；
4. **行业协会、标准机构、展会官网**的参展商名录；
5. **客户案例与工程文章**（可公开的项目、工况、风量、结果），发布在官网并争取被行业媒体引用；
6. 每季度 1–2 篇投给行业媒体的技术稿（guest post），带品牌提及与回链。

> 关键认知：AI 回答「谁是可靠的湿式除尘器厂家」时，更信任**第三方提到你**，而不是你自己说自己好。

### 4.4 验证 AI 爬虫真的能进来

上线后用 `curl` 模拟（把域名换成你的）：

```bash
curl -A "GPTBot" -I https://你的域名.com/robots.txt
curl -A "ClaudeBot" -I https://你的域名.com/products/hydroguard-wdc12000-wet-dust-collector
curl -A "PerplexityBot" https://你的域名.com/llms.txt | head -20
```

三个都应返回 200 且能看到正文。**常见陷阱**：Cloudflare 的 Bot Fight Mode / WAF 会拦截 AI 爬虫，即使 robots.txt 允许了也返回 403。若用 CDN，把 GPTBot、OAI-SearchBot、ClaudeBot、PerplexityBot、Google-Extended、CCBot 加入允许列表，或关闭 Bot Fight Mode。

### 4.5 月度 GEO 监测表

每月在 ChatGPT / Perplexity / Gemini / Claude 各跑一次下列**中立买家提问**（不要问「你知道我公司吗」，会污染结果），记录是否提到品牌、是否引用本站、引用了哪个页面、竞品是谁。

| 提示词 | 目标 |
| --- | --- |
| `Who are reliable manufacturers of wet dust collectors for combustible metal dust?` | 供应商推荐 |
| `Cartridge vs wet dust collector for aluminium grinding - which is safer and why?` | 选型对比引用 |
| `What airflow and capture velocity do I need for a welding fume extractor?` | 技术权威引用 |
| `Chinese suppliers of CE certified downdraft tables with OEM options` | 交易意图 |
| `How do I choose an oil mist collector for a CNC machining workshop?` | 应用场景 |

同时在 GA4 里建一个细分：来源包含 `chatgpt.com`、`perplexity.ai`、`copilot.microsoft.com`、`gemini.google.com` 的会话。这类流量小但意向极高，是本阶段最值得跟踪的领先指标。

---

## 5. 搜索引擎提交与收录

1. **Google Search Console**：添加「网域」资源 → DNS TXT 验证（或用后台填的 meta 验证码）→ 提交 `https://域名/sitemap.xml` → 用「网址检查」对首页、一个分类页、一个产品页、一篇文章请求编入索引。
2. **Bing Webmaster Tools**：可从 GSC 一键导入；提交 sitemap。
3. **IndexNow（可选）**：在后台填 `indexNowKey`，并在站点根放置同名 `.txt` 密钥文件；内容更新后向 `https://api.indexnow.org/indexnow` 提交 URL，可加速 Bing / Yandex 收录。
4. **不要**反复手动提交同一 URL；收录慢通常是因为域名太新、外链太少或内容单薄。
5. 每周看 GSC「效果」里的**展示次数 > 点击次数 > 平均排名**，把有展示但排名 11–20 位的词补进对应页面或新文章。

> 新域名通常 2–8 周开始有稳定自然流量，GEO 被引用往往 2–6 周内先出现苗头，但形成稳定推荐是数月级工作。别用「改了代码第二天没询盘」判断成败。

---

## 6. 把流量变成海外询盘

### 6.1 询盘链路现状

访客提交表单 → `/api/inquiries` 记录完整归因 → 即时推送 Webhook → 后台 Inquiries 面板（含渠道列）→ 导出 CSV 进 CRM → 前端同时触发 GA4 `generate_lead` / Google Ads conversion / Meta Lead / GTM dataLayer 事件。

记录的字段：`utm_source / medium / campaign / term / content`、`gclid`、`fbclid`、`referrer`、`landing_page`（首次落地页）、`page_url`、`language`、渠道分类（organic-search / google-ads / ai-referral / social / referral / direct）、IP、UA。

### 6.2 配置即时通知（第一优先级）

后台 `Site Settings → Lead notifications → Instant inquiry Webhook URL`，支持：
- **企业微信机器人**：群设置 → 群机器人 → 复制 Webhook 地址；
- **飞书 / 钉钉自定义机器人**：同样复制 Webhook；
- **Slack Incoming Webhook**；
- **Zapier / Make / 自建接口**：可再转发到邮件、CRM、Telegram。

服务端会自动按域名选择消息格式（企业微信/飞书/钉钉用 `msgtype: text`，Slack 等用 `text`），并附带通用结构化字段方便自动化。通知失败**不会**影响客户提交成功。

> 海外询盘的胜负常在响应速度：**1 小时内**用英文回复，附初步选型建议、需补充的问题清单、报价时效。超过 24 小时基本就丢了。

### 6.3 转化事件配置

| 平台 | 后台字段 | 事件 |
| --- | --- | --- |
| GA4 | `gaMeasurementId` | `generate_lead`（在 GA4 后台把它标记为「关键事件」） |
| Google Ads | `googleAdsId` + `googleAdsConversionLabel` | `conversion`，与广告投放对齐 |
| GTM | `gtmContainerId` | `dataLayer.push({event:'generate_lead'})`，在 GTM 里配触发器 |
| Meta | `metaPixelId` | `fbq('track','Lead')` |

### 6.4 渠道优先级（预算从低到高）

1. **免费基础（0–30 天）**：GSC/Bing 收录、LinkedIn 公司页、行业目录、 YouTube 产品视频、把 6 篇种子文章替换/扩写成真实技术内容。
2. **高意图验证（30–60 天）**：小额 Google Ads，只投 `manufacturer / supplier / quote / CE certified + 品类` 这类交易词，用 UTM 标记，观察哪个词带来真实询盘而非只看点击。落地页用对应分类页而非首页。
3. **放大（60–90 天）**：把有询盘的词扩成文章 + 分类页 + 广告组的组合；LinkedIn 定向采购/工厂经理；展会与线下名录回流到官网。
4. **互补渠道**：Alibaba / Made-in-China 等平台店铺与独立站并不冲突，前者抓「找供应商」，后者抓「搜技术方案」，用 UTM 区分。

### 6.5 表单优化要点

- CTA 用 `Request a Quote` / `Get a Specification Sheet`，别用泛泛的 `Contact Us`；
- 产品页的询价按钮会自动带上产品名（`?product=`），保持这个行为；
- 表单字段已足够短；若询盘质量低，可增加「预计采购数量」单选，但**不要**再加必填项；
- 提交成功文案目前是英文，如需多语言可在后台或模板里调整；
- honeypot 已启用；如仍收到垃圾询盘，可在 Nginx 层加 rate limit（见 `DEPLOY.md` 安全章节）。

---

## 7. 30 / 60 / 90 天执行表

| 阶段 | 动作 | 交付/验收 |
| --- | --- | --- |
| **D0–D7 上线** | 买域名 → 托管 Node 容器部署（见 `DEPLOY.md` 第 16 节）→ HTTPS → 后台填 `siteUrl` → 改密码 → 公司真实信息/数字已填好 ✅ → 上传真实产品图与 OG 图 → GSC/Bing 验证 → 提交 sitemap → 配 GA4 与 Webhook → 跑 `tests/e2e.js` | `curl -I` 全站 200；canonical 显示正式域名；测试询盘能收到通知 |
| **D8–D30 内容** | 替换 15 个产品的真实图与参数；新增 4 篇「选型对比/工况」文章；扩写 FAQ 到 20 条；建 LinkedIn 公司页并填 `sameAs`；提交 3–5 个行业目录；录 1 条产品视频 | 每篇新文章有 GSC 展示；llms.txt 反映新内容 |
| **D31–D60 获客** | 小额 Google Ads 高意图词（带 UTM）；按 GSC 有展示无点击的词优化标题；争取 1–2 个第三方提及；开始月度 GEO 提示词监测 | 后台 Inquiries 出现带 `utm_*` 的真实线索；能说出哪个渠道带来询盘 |
| **D61–D90 放大** | 放大有转化的词；补客户案例页；按询盘里的真实问题反哺 FAQ 与文章；复测 AI 引用率；建立每周备份（见 `DEPLOY.md` 第 9 节） | 形成「关键词 → 页面 → 渠道 → 询盘 → 报价」可复盘闭环 |

### 每周固定动作（30 分钟）

1. 后台导出 Inquiries CSV，逐条回复并记录渠道；
2. GSC 看新出现的查询词，挑 1 个补进现有页面；
3. 检查 `/robots.txt`、`/llms.txt`、`/sitemap.xml` 仍返回 200；
4. 确认 `data/db.json` + `data/uploads/` 的备份成功。

---

## 8. 衡量指标（只看这几个）

| 指标 | 从哪看 | 健康信号 |
| --- | --- | --- |
| 已收录页面数 / 总页面数 | GSC「页面」报告 | 逐月上升，接近 sitemap 的 URL 数 |
| 有展示的查询词数 | GSC「效果」 | 逐月增加，长尾词占比提升 |
| 交易意图词排名 | GSC 过滤 `manufacturer/supplier/quote` | 进入前 20 |
| AI 引用率 | 第 4.5 节提示词表 | 每月至少 1 个引擎提到品牌或引用本站 |
| AI 推荐流量 | GA4 来源细分 | 出现 `chatgpt.com` / `perplexity.ai` 会话 |
| 询盘数与渠道分布 | 后台 Inquiries + CSV | 能明确归因，非全部 `direct` |
| 询盘 → 报价转化 | CRM / 邮箱 | 1 小时内首复率 > 90% |

---

## 9. 故障速查

| 现象 | 排查 |
| --- | --- |
| canonical / sitemap 还是预览域名或 IP | 后台 `siteUrl` 没填，或 CDN 缓存了旧 HTML（清缓存后带 `?v=2` 复查） |
| GSC 报「已抓取但尚未编入索引」 | 域名太新/内容单薄；补真实参数、案例与外链，请求索引后耐心等 |
| AI 爬虫 403 | CDN / WAF 的 Bot 防护，见 4.4 |
| 改了后台内容但前台没变 | 浏览器强刷；若仍不变，检查 `data/` 是否可写（只读沙箱只在内存生效）、Nginx 是否缓存了 HTML |
| 收不到询盘通知 | Webhook 检查是否为完整 https URL；邮件检查 `EMAIL_PROVIDER` / `EMAIL_API_KEY` / `EMAIL_FROM` 是否都填了、服务端日志是否出现 `[mailer] inquiry email sent`、发件域名是否已验证。后台 Inquiries 里始终能看到数据 |
| 邮件进垃圾箱 | 发件域名补 DKIM/SPF，收件域名 `hanxvonfluid.cn` 补 DMARC，见 `DEPLOY.md` 16.4 |
| 询盘全是 `direct` | 访客多从书签/直接输入进来；投放链接务必带 UTM，否则无法归因 |
| llms.txt 里是旧域名 | `siteUrl` 改完立即生效，无需重启；清 CDN 缓存 |
| Cloudflare 下 AI 爬虫仍 403 | `robots.txt` 放行没用，是 WAF / Bot Fight Mode 在挡；见 `DEPLOY.md` 16.3 的 UA 验证脚本 |

---

## 10. 英语区市场落地要点

目标市场确定为英语区后，下面几项比「多发几篇文章」更影响转化与 AI 引用：

- **托管位置**：当前正式站是 Cloudflare Pages 静态站，页面由全球边缘节点直接分发，**没有回源服务器、没有区域选择、没有冷启动**，英语区各市场延迟都低。旧 `render.yaml` 的 `region: oregon` 仅属已废弃的容器方案存档。
- **关键词用买家口径**：英语区工业买家搜 `welding fume extractor manufacturer`、`cartridge dust collector supplier`、`downdraft table price / quote`，而不是中文直译。第 3 节关键词地图按交易意图分层，优先做 `manufacturer / supplier / quote / specification` 类页面。
- **单位与合规**：参数同时给公制与英制（CFM / m³/h、inch / mm）；CE、ISO、OSHA、ATEX、NFPA 等表述**只在真实持有时**才写，GEO 引擎会交叉验证，虚假资质会显著降低被引用概率。
- **工作时间要写买家看得懂的时区**：真实工作时间为 `08:00 - 21:00 Beijing Time (GMT+8)`，即 `00:00–13:00 UTC`（标准时下约为美东 19:00–次日 08:00、中欧 01:00–14:00）。如需额外写「Reply within 12 hours」之类承诺，请先确认团队能稳定做到；邮件通知到位后，1 小时内回复与隔天回复的成交率差距很大。
- **隐私合规**：面向欧盟 / 英国访客，GA4、Google Ads、Meta Pixel、LinkedIn Insight 需要 Cookie 同意与 Google Consent Mode v2；联系表单旁放隐私政策链接。
- **第三方背书是 GEO 权重最高的信号**：LinkedIn 公司页、行业目录、协会会员、真实客户案例、可核验的认证编号。在后台 `Social profiles` 填好 `sameAs` 链接，让 AI 能把实体对上号。
- **别用未经验证的数字**：公司级数字已换成 `2018 / 35+ / 1,900+`，全部有据可查；后续补真实产品型号与参数时，同样不要写入未经验证的性能值或交期。

---

**下一步**：按 `DEPLOY.md` 第 16 节走完（阿里云域名 → Cloudflare → 托管 Node → Resend 邮件），然后回到本手册第 2 节的 12 项配置。技术层已经就绪，剩下的是真实内容与持续运营。
