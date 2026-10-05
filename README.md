# NIU-Life 網站

NIU-Life 的官網 **https://niu-life.app/**：捲動敘事的首頁、iOS／Android 下載入口、常見問題、許願池與 Android 隱私權政策。

用 [Astro](https://astro.build/) 產生純靜態網站，捲動動畫用 [GSAP ScrollTrigger](https://gsap.com/docs/v3/Plugins/ScrollTrigger/)，TypeScript 撰寫。

## 開發

使用 `.nvmrc` 指定的 Node 22 以上：

```bash
npm install
npm run dev       # http://localhost:4321
npm run build     # 同步隱私權政策 → astro check → dist/
npm run preview   # 預覽建置結果
```

## 結構

| 位置 | 用途 |
|---|---|
| `src/pages/index.astro` | 首頁，依序組合 7 個段落 |
| `src/pages/privacy.astro` | 隱私權政策（`/privacy.html`，Play Console 連到這裡） |
| `src/components/` | 各段落：`Hero` 開場、`About`、`Features` 功能、`Privacy`、`Faq`、`Wish` 許願池、`Download` |
| `src/scripts/story.ts` | 捲動敘事：開場貼紙飛進手機、功能區固定並切換 01～06、段落淡入、右下角頁碼 |
| `src/layouts/Base.astro` | `<head>`、頁首、頁尾 |
| `src/styles/global.css` | 配色 tokens（淺色／深色）、貼紙風格的按鈕與卡片、手機外框 |
| `scripts/sync-policy.mjs` | 把 App repo 的隱私權政策寫成 `src/content/privacy.md`（不進版控） |
| `public/assets/` | App 圖示 |
| `public/assets/screens/` | 功能區的 App 畫面 |

### 動畫與「減少動態效果」

`story.ts` 用 `gsap.matchMedia()` 分兩種：一般情況貼紙飛入、手機放大、畫面滑入；系統開了「減少動態效果」（Android 的移除動畫、iOS 的減少動態效果）時，故事照樣跟著捲動走，但只淡入淡出，不位移、不縮放，也沒有自動播放的動畫。

### App 畫面

`public/assets/screens/` 的截圖用 App 的商店截圖模式（`flutter build apk --debug --dart-define=NIU_STORE_SCREENSHOTS=true`，不顯示示範模式提示）在模擬器上拍，時間設在週一 08:30 讓首頁有「上課中」，轉成 540×1200 WebP。

## 部署

推到 `main` 後，GitHub Actions（`.github/workflows/pages.yml`）建置並部署到 GitHub Pages，`www` 會轉到主網域。

- 網域 DNS 在 Cloudflare，紀錄要維持「僅 DNS」（灰色雲朵）：A 指向 GitHub 的 185.199.108–111.153，AAAA 指向 2606:50c0:8000–8003::153，`www` CNAME 指向 `windlessme.github.io`。開代理（橘色雲朵）會讓 GitHub 無法續簽憑證。
- HTTPS 憑證由 GitHub 自動向 Let's Encrypt 申請與續約，Pages 設定已開「強制 HTTPS」。

## 隱私權政策

政策以 `windlessme/niu-app-android` 的 `docs/android-privacy-policy.md` 為準。`npm run build` 會先同步：本機有 `../niu-app-android` 就讀它，CI 一律從 GitHub 下載。每天也會自動部署一次，所以 App 那邊改了政策，網站最晚隔天跟上；要立刻更新就到 Actions 手動執行 Deploy site。

## 商店連結

- App Store（iOS 版，qian403 維護）：https://apps.apple.com/tw/app/niu-life/id6813616626
- Google Play（Android 版）：https://play.google.com/store/apps/details?id=me.windless.niulife
