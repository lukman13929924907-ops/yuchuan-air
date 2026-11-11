# 可直接复制的部署配置包

> 用途：回合 4–6（域名 / Cloudflare / 站长验证）时照抄。
> 现在只需占位，等域名与源站地址确定后，我会把 `YOUR_DOMAIN` / `ORIGIN_HOST` 全部替换成真实值再给你。
>
> - `YOUR_DOMAIN` = 你在阿里云买的域名，例如 `yuchuanair.com`
> - `ORIGIN_HOST` = Render 给你的源站地址，例如 `yuchuan-air.onrender.com`
> - `SALES_MAILBOX` = `info@hanxvonfluid.cn`（已全站生效）

---

## A. Cloudflare DNS 记录（回合 5 用）

进入 Cloudflare → 选域名 → **DNS → Records → Add record**。

| # | Type | Name | Content | Proxy status | 说明 |
| --- | --- | --- | --- | --- | --- |
| 1 | CNAME | `@` | `ORIGIN_HOST` | **Proxied（橙云）** | Cloudflare 会自动做 CNAME Flattening，根域名可用 |
| 2 | CNAME | `www` | `ORIGIN_HOST` | **Proxied（橙云）** | 之后用 Page Rule / Redirect Rule 把 www 301 到主域 |
| 3 | TXT | `@` | `google-site-verification=XXXXXXXX` | DNS only | 值来自 Google Search Console，回合 6 |
| 4 | TXT | `@` | `Bing 给的验证值` | DNS only | 值来自 Bing Webmaster，回合 6 |
| 5 | TXT | `resend._domainkey` | `Resend 提供的 DKIM 值` | DNS only | 仅发件方式 2B 需要（见 B） |
| 6 | TXT | `_dmarc` | `v=DMARC1; p=none; rua=mailto:SALES_MAILBOX` | DNS only | 建议在域名接入稳定后再加 |

**不要在 Cloudflare 里加 A 记录指向 IP**：Render 的源站 IP 会变，用 CNAME 指向主机名才稳。

---

## B. Resend 发件域验证（推荐方式 2B，不需要等新域名）

用**已有的企业邮箱域名** `hanxvonfluid.cn` 做发件域，邮件可以立刻正规地发到
`info@hanxvonfluid.cn`，完全不必等新域名买好。

1. Resend → **Domains → Add Domain** → 填 `hanxvonfluid.cn`
2. 把 Resend 给出的 DKIM / SPF TXT 记录，加到**管理 `hanxvonfluid.cn` 解析的那个平台**
   （可能是阿里云云解析、腾讯 DNSPod 或邮箱服务商后台，取决于你们企业邮箱托管在哪）
3. **只加 TXT，绝对不要改 MX 记录** —— 否则现有企业邮箱会收不到信
4. 等 Resend 显示 `Verified`，然后把 Render 环境变量改成：
   ```
   EMAIL_FROM = Yuchuan Air <noreply@hanxvonfluid.cn>
   EMAIL_TO   = info@hanxvonfluid.cn
   ```
5. 提交一条测试询盘，看服务端日志 `[mailer] inquiry email sent to info@hanxvonfluid.cn`

> ⚠️ **SPF 常见错误**：一个域名只能有**一条** SPF TXT 记录。如果 `hanxvonfluid.cn`
> 已有 `v=spf1 ...`，要把 `include:resend.com` **合并进现有那条**，
> 而不是新建第二条 —— 两条并存会导致 SPF permerror，邮件进垃圾箱。

若买好新域名后想改用新域名发件，在 Resend 再 Add Domain `YOUR_DOMAIN`，
把 TXT 加到 **Cloudflare DNS**（上表第 5 行），再把 `EMAIL_FROM` 换成
`Yuchuan Air <noreply@YOUR_DOMAIN>` 即可，代码不用动。

---

## C. Cloudflare SSL / 重定向设置（回合 5 用）

| 位置 | 设置 |
| --- | --- |
| SSL/TLS → Overview | **Full (strict)**（源站有 Render 签发的有效证书） |
| SSL/TLS → Edge Certificates → Always Use HTTPS | **On** |
| SSL/TLS → Edge Certificates → HSTS | **保持 Off** —— 源站已发 HSTS 头，重复开启会出现两个同名头 |
| SSL/TLS → Origin Server | 不需要 Origin Certificate / 不需要 certbot |
| Rules → Redirect Rules | `www.YOUR_DOMAIN` → 301 → `https://YOUR_DOMAIN/$1` |
| Render → Settings → Custom Domains | 也把 `YOUR_DOMAIN` 和 `www.YOUR_DOMAIN` 加进去，否则 Host 头不匹配 |

**证书不用买、不用手动续期**：Cloudflare Universal SSL 免费且自动续期。

---

## D. 最关键：放行 AI 爬虫（不做会让前面所有 GEO 工作白费）

Cloudflare 默认会把 `GPTBot` / `ClaudeBot` / `PerplexityBot` 等返回 **403**，
即使 `robots.txt` 写了 Allow 也没用。按下面顺序检查：

### D.1 先关掉一键式拦截

- **Security → Bots → Bot Fight Mode**：**Off**
- **Security → Bots → "Block AI Scrapers and Crawlers"**（若你的账号有这项）：**Off**
  （或配置为 Allow，不要 Block）
- **Security → WAF → 检查是否有 `Block` 规则命中了这些 UA**

### D.2 加一条 WAF 自定义规则做兜底

Security → WAF → Custom rules → **Create rule** → 表达式用下面这段：

```
(http.user_agent contains "GPTBot")
or (http.user_agent contains "OAI-SearchBot")
or (http.user_agent contains "ChatGPT-User")
or (http.user_agent contains "ClaudeBot")
or (http.user_agent contains "anthropic-ai")
or (http.user_agent contains "PerplexityBot")
or (http.user_agent contains "Google-Extended")
or (http.user_agent contains "Googlebot")
or (http.user_agent contains "bingbot")
or (http.user_agent contains "CCBot")
or (http.user_agent contains "Applebot")
or (http.user_agent contains "meta-externalagent")
```

Action 选 **Skip**（跳过后续 WAF / 速率限制检查），并勾选可跳过的组件
（不同套餐 UI 措辞略有差异，选 "All remaining custom rules" + "Managed rules" 之类）。

### D.3 逐条验证（必须全部 200）

```bash
D=https://YOUR_DOMAIN
PAGE=/products/hydroguard-wdc12000-wet-dust-collector
for ua in GPTBot OAI-SearchBot ChatGPT-User ClaudeBot PerplexityBot Google-Extended Googlebot bingbot CCBot; do
  printf "%-20s " "$ua"
  curl -s -o /dev/null -w "%{http_code}\n" -A "$ua" "$D$PAGE"
done
curl -s "$D/robots.txt" | grep -iE "GPTBot|Sitemap"
```

> 任何一个返回 403 / 503，就回到 D.1 检查 Bot Fight Mode。
> 也可用 `launch/acceptance.sh https://YOUR_DOMAIN` 一次跑完（含这 6 个 UA）。

---

## E. 站长工具与索引提交（回合 6）

| 平台 | 地址 | 要做什么 |
| --- | --- | --- |
| Google Search Console | https://search.google.com/search-console | 加资源（建议「网域」方式）→ 用 A 表第 3 行 TXT 验证 → **Sitemaps** 提交 `https://YOUR_DOMAIN/sitemap.xml` |
| Bing Webmaster | https://www.bing.com/webmasters | 可从 GSC 一键导入 → 用 A 表第 4 行 TXT 验证 → 提交同一 sitemap |
| IndexNow | 后台 `Site Settings → IndexNow key` | 可选；生成随机 key 后放在站点根目录 `<key>.txt`，用于 Bing / Yandex 即时提交 |
| Perplexity / OpenAI 爬虫 | 无需提交 | 只要 D 段放行 + robots.txt 允许 + `/llms.txt` 可访问，爬虫会自行发现 |

提交后不用反复「请求编入索引」。新域名通常需要几周建立信任，
这期间按 `SEO-GEO.md` 的 30/60/90 天表补真实案例与第三方背书更有效。

---

## F. 后台最后要填的字段（回合 6，我可代填）

| 面板 → 字段 | 值 |
| --- | --- |
| Site Settings → SEO & Domain → **Canonical Site URL** | `https://YOUR_DOMAIN` |
| Site Settings → Search Console → Google / Bing verification | A 表第 3、4 行的 TXT 值 |
| Site Settings → Social profiles | LinkedIn 公司页等真实 URL（GEO 实体对齐） |
| Site Settings → Analytics | GA4 / GTM / Ads / Meta / LinkedIn ID（**填了才会触发 Cookie 同意机制**） |
| Site Settings → Privacy & compliance | `cookieConsentEnabled` 保持 ON；`privacyUpdatedAt` 改政策时同步更新 |
| Site Settings → Lead notifications | `inquiryEmail = info@hanxvonfluid.cn` |

改完 `Canonical Site URL` 后，全站 canonical、JSON-LD、robots.txt、sitemap.xml、
llms.txt 会**立即**用新域名，无需重启、无需改代码。

---

## G. 上线后一键验收

```bash
cd yuchuan-air
bash launch/acceptance.sh https://YOUR_DOMAIN
```

脚本覆盖：页面 / 详情页 / robots / sitemap / llms / 无 JS 也能读到的 SSR 正文 /
canonical 域名 / 6 个 AI 爬虫 UA / 公开 API 的公司名与产品数 / 密钥泄露检查 /
隐私政策页 / Cookie 同意脚本 / 安全响应头。

---

## H. 隐私合规说明（已内置，无需额外配置）

- `/privacy` 隐私政策页：服务端渲染、可索引、公司邮箱与地址由后台设置自动注入。
  页内顶部有 HTML 注释提醒：**这是通用模板，正式上线前请让法务按目标市场复核**。
- Cookie 同意：Google Consent Mode v2 默认 `denied`，GA4 / Ads / GTM 在同意前保持
  cookieless；Meta Pixel 与 LinkedIn Insight **在同意前完全不加载**（它们不支持 Consent Mode）。
  访客可随时通过页脚 **Cookie settings** 撤回同意。
- 联系表单下方有隐私告知与政策链接，不设强制勾选（B2B 询盘基于合同前措施/合法利益，
  强制勾选会无谓降低转化）。
- 安全响应头：`X-Content-Type-Options`、`Referrer-Policy`、`X-Frame-Options`、
  `Permissions-Policy`，HTTPS 下额外发 `Strict-Transport-Security`。
  **未启用 CSP**：站点使用内联 JSON-LD 与初始化脚本，加严格 CSP 需要逐处 nonce 改造；
  若后续要上，建议先在 `Content-Security-Policy-Report-Only` 观察。
