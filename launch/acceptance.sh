#!/usr/bin/env bash
# Yuchuan Air - one-shot launch acceptance check.
# Usage:
#   bash launch/acceptance.sh https://yourdomain.com
#   bash launch/acceptance.sh http://127.0.0.1:3211
# No jq / no third-party tools: only curl, grep and node.

D="${1:-http://127.0.0.1:3211}"
D="${D%/}"
PASS=0
FAIL=0
SKIP=0

ck() {
  if [ "$2" = "1" ]; then
    printf 'PASS  %s\n' "$1"; PASS=$((PASS + 1))
  else
    printf 'FAIL  %s\n' "$1"; FAIL=$((FAIL + 1))
  fi
}
sk() { printf 'SKIP  %s\n' "$1"; SKIP=$((SKIP + 1)); }
code() { curl -s -o /dev/null -w "%{http_code}" --max-time 20 "$1" 2>/dev/null; }
ua_code() { curl -s -o /dev/null -w "%{http_code}" -A "$2" --max-time 20 "$1" 2>/dev/null; }

printf '============================================================\n'
printf ' Yuchuan Air launch acceptance\n Target: %s\n' "$D"
printf '============================================================\n\n'

echo '--- 1. Pages ---'
for p in "/" "/products" "/applications" "/about" "/blog" "/contact" "/admin"; do
  c=$(code "$D$p"); [ "$c" = "200" ] && ck "page $p ($c)" 1 || ck "page $p ($c)" 0
done

echo
echo '--- 2. Detail routes (server-rendered) ---'
PRODUCT="$D/products/hydroguard-wdc12000-wet-dust-collector"
COLLECTION="$D/collections/wet-dust-collectors"
POST="$D/blog/voc-filtration-systems-types-technologies-applications"
for pair in "product|$PRODUCT" "collection|$COLLECTION" "post|$POST"; do
  name=${pair%%|*}; url=${pair#*|}
  c=$(code "$url"); [ "$c" = "200" ] && ck "$name detail ($c)" 1 || ck "$name detail ($c)" 0
done

echo
echo '--- 3. Machine-readable / GEO files ---'
for p in "/robots.txt" "/sitemap.xml" "/llms.txt" "/llms-full.txt"; do
  c=$(code "$D$p"); [ "$c" = "200" ] && ck "file $p ($c)" 1 || ck "file $p ($c)" 0
done
ROBOTS=$(curl -s --max-time 20 "$D/robots.txt")
case "$ROBOTS" in *GPTBot*) ck 'robots.txt allows GPTBot' 1;; *) ck 'robots.txt allows GPTBot' 0;; esac
SITEMAP=$(curl -s --max-time 20 "$D/sitemap.xml")
case "$SITEMAP" in *"/products/hydroguard"*) ck 'sitemap.xml lists products' 1;; *) ck 'sitemap.xml lists products' 0;; esac

echo
echo '--- 4. SSR: content visible WITHOUT JavaScript ---'
HTML=$(curl -s --max-time 20 "$PRODUCT")
case "$HTML" in *'data-ssr="1"'*) ck 'SSR marker present' 1;; *) ck 'SSR marker present' 0;; esac
case "$HTML" in *'<h1>HydroGuard'*) ck 'product H1 in raw HTML' 1;; *) ck 'product H1 in raw HTML' 0;; esac
case "$HTML" in *'application/ld+json'*) ck 'JSON-LD in raw HTML' 1;; *) ck 'JSON-LD in raw HTML' 0;; esac
case "$HTML" in *'info@hanxvonfluid.cn'*) ck 'real company email in raw HTML' 1;; *) ck 'real company email in raw HTML' 0;; esac
case "$HTML" in *'Loading product'*) ck 'no loading placeholder' 0;; *) ck 'no loading placeholder' 1;; esac

echo
echo '--- 5. AI crawler user agents must all be 200 ---'
for ua in GPTBot OAI-SearchBot ClaudeBot PerplexityBot Googlebot bingbot; do
  c=$(ua_code "$PRODUCT" "$ua")
  [ "$c" = "200" ] && ck "UA $ua ($c)" 1 || ck "UA $ua ($c)  <- 403 means Cloudflare WAF is blocking AI crawlers" 0
done

echo
echo '--- 6. Public API ---'
API=$(curl -s --max-time 20 "$D/api/site")
API_OK=$(printf '%s' "$API" | node -e '
let s=""; process.stdin.on("data",d=>s+=d).on("end",()=>{
  try {
    const j=JSON.parse(s), t=j.settings||{};
    const secrets=Object.keys(t).filter(k=>/apikey|secret|password|token/i.test(k));
    const out={
      company:String(t.companyName||"").indexOf("Shandong Yuchuan")===0,
      products:(j.counts&&j.counts.products)===15,
      email:t.email==="info@hanxvonfluid.cn",
      phone:String(t.phone||"").replace(/\s/g,"")==="+8653183516866",
      whatsapp:String(t.whatsapp||"").replace(/\s/g,"")==="+8617278827749",
      founded:String(t.founded||"")==="2018",
      verifiedFacts:/35\+/.test(JSON.stringify(t.stats||{}))&&/1,900\+/.test(JSON.stringify(t.stats||{})),
      credentials:/ISO 9001/.test(String(t.certifications||""))&&/Registered Environmental Engineer/.test(String(t.certifications||"")),
      noSecrets:secrets.length===0
    };
    console.log(JSON.stringify(out));
  } catch(e) { console.log("{}"); }
});')
for key in company products email phone whatsapp founded verifiedFacts credentials noSecrets; do
  case "$API_OK" in *"\"$key\":true"*) ck "api/site: $key" 1;; *) ck "api/site: $key" 0;; esac
done

echo
echo '--- 7. Canonical domain ---'
case "$D" in
  https://*)
    HOME_HTML=$(curl -s --max-time 20 "$D/")
    case "$HOME_HTML" in *"rel=\"canonical\" href=\"$D/\""*) ck "canonical points to $D" 1;;
      *) ck "canonical points to $D (set Site Settings -> Canonical Site URL)" 0;; esac
    ;;
  *) sk "canonical domain check (only for the live https domain)";;
esac

echo
echo '--- 8. Privacy, consent & security headers ---'
PRIV=$(curl -s --max-time 20 "$D/privacy")
case "$PRIV" in *'data-ssr="1"'*) ck 'privacy page server-rendered' 1;; *) ck 'privacy page server-rendered' 0;; esac
case "$PRIV" in *'<h1>Privacy Policy</h1>'*) ck 'privacy page H1 in raw HTML' 1;; *) ck 'privacy page H1 in raw HTML' 0;; esac
case "$PRIV" in *'info@hanxvonfluid.cn'*) ck 'privacy page uses real mailbox' 1;; *) ck 'privacy page uses real mailbox' 0;; esac
case "$PRIV" in *'data-yc-consent'*) ck 'footer cookie settings link' 1;; *) ck 'footer cookie settings link' 0;; esac
case "$(curl -s --max-time 20 "$D/contact")" in *'href="/privacy"'*) ck 'contact form privacy notice' 1;; *) ck 'contact form privacy notice' 0;; esac
c=$(code "$D/js/consent.js"); [ "$c" = "200" ] && ck "consent.js served ($c)" 1 || ck "consent.js served ($c)" 0
HDRS=$(curl -s -D - -o /dev/null --max-time 20 "$D/")
if printf '%s' "$HDRS" | grep -qi 'permissions-policy:.*camera=()'; then
  ck 'Permissions-Policy header' 1
else
  ck 'Permissions-Policy header' 0
fi
case "$D" in
  https://*)
    if printf '%s' "$HDRS" | grep -qi 'strict-transport-security:'; then
      ck 'HSTS header over HTTPS' 1
    else
      ck 'HSTS header over HTTPS (check FORCE_HTTPS / X-Forwarded-Proto)' 0
    fi
    ;;
  *) sk 'HSTS check (only for the live https domain)';;
esac

echo
echo '--- 9. Verified company facts (no placeholder numbers) ---'
HOME_HTML=$(curl -s --max-time 20 "$D/")
ABOUT_HTML=$(curl -s --max-time 20 "$D/about")
LLMS=$(curl -s --max-time 20 "$D/llms.txt")
case "$HOME_HTML" in *'8351 6866'*) ck 'real phone rendered in header/footer' 1;; *) ck 'real phone rendered in header/footer' 0;; esac
case "$HOME_HTML" in *'Since 2018'*) ck 'homepage shows Since 2018' 1;; *) ck 'homepage shows Since 2018' 0;; esac
case "$HOME_HTML" in *'1,900+'*) case "$HOME_HTML" in *'35+'*) ck 'homepage shows verified install figures' 1;; *) ck 'homepage shows verified install figures' 0;; esac;; *) ck 'homepage shows verified install figures' 0;; esac
case "$ABOUT_HTML" in *'Registered Environmental Engineer'*) ck 'about page lists real qualifications' 1;; *) ck 'about page lists real qualifications' 0;; esac
case "$LLMS" in *'35+ Countries with Installed Projects'*) ck 'llms.txt carries verified figures' 1;; *) ck 'llms.txt carries verified figures' 0;; esac
case "$HOME_HTML$ABOUT_HTML$LLMS" in *'8899 0666'*|*'8888 0666'*|*'12+'*|*'60+'*|*'2,000+'*|*'72 hours'*|*'Ships in 72 Hours'*)
  ck 'no leftover placeholder phone / stats / delivery claim' 0;;
  *) ck 'no leftover placeholder phone / stats / delivery claim' 1;; esac
echo 'NOTE  check /admin -> Site Settings top banner shows "Inquiry email is ACTIVE"'
echo 'NOTE  submit one test inquiry, then confirm delivery to lukman13929924907@gmail.com (2A) and delete it'

echo
echo '--- 10. Cloudflare Pages static-mode checks ---'
DATA_CODE=$(code "$D/_data/site.json")
if [ "$DATA_CODE" != "200" ]; then
  sk 'static content asset checks (local Node / preview mode only)'
else
  DATA_JSON=$(curl -s --max-time 20 "$D/_data/site.json")
  DATA_OK=$(printf '%s' "$DATA_JSON" | node -e '
let s=""; process.stdin.on("data",d=>s+=d).on("end",()=>{
  try {
    const j=JSON.parse(s);
    console.log(JSON.stringify({
      noPii:Array.isArray(j.inquiries)&&j.inquiries.length===0,
      noWebhook:!(j.settings&&"inquiryWebhook" in j.settings),
      sameCompany:String(j.settings&&j.settings.companyName||"").indexOf("Shandong Yuchuan")===0,
      sameProducts:Array.isArray(j.products)&&j.products.length===15
    }));
  } catch(e) { console.log("{}"); }
});')
  for key in noPii noWebhook sameCompany sameProducts; do
    case "$DATA_OK" in *"\"$key\":true"*) ck "content asset: $key" 1;; *) ck "content asset: $key" 0;; esac
  done
  DATA_HDRS=$(curl -s -D - -o /dev/null --max-time 20 "$D/_data/site.json")
  if printf '%s' "$DATA_HDRS" | grep -qi 'cache-control:.*no-store'; then
    ck 'content asset is no-store' 1
  else
    ck 'content asset is no-store' 0
  fi
  c=$(code "$D/api/admin/data"); [ "$c" = "401" ] && ck "anonymous /api/admin/data is 401 ($c)" 1 || ck "anonymous /api/admin/data is 401 ($c)" 0
fi

printf '\n============================================================\n'
printf ' RESULT  pass=%s  fail=%s  skip=%s\n' "$PASS" "$FAIL" "$SKIP"
printf '============================================================\n'
[ "$FAIL" -eq 0 ] || exit 1
