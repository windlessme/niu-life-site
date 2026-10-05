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
| `src/pages/privacy.astro` | 隱私權政策，網址 `/privacy`（`/privacy.html` 也可以）；最後一節是網站本身的 GA 說明 |
| `src/pages/download.astro` | 下載連結 `/download`：手機自動前往 App Store／Google Play，電腦顯示兩個按鈕與 QR Code |
| `src/components/StoreButtons.astro` | 商店按鈕（新分頁開啟，點擊記到 GA 的 `store_click`） |
| `src/site.ts` | GA 評估 ID |
| `src/components/` | 各段落：`Hero` 開場、`About`、`Features` 功能、`Privacy`、`Faq`、`Wish` 許願池、`Download` |
| `src/scripts/story.ts` | 捲動敘事：開場貼紙飛進手機、功能區固定並切換 01～06、段落淡入、右下角頁碼 |
| `src/layouts/Base.astro` | `<head>`、頁首、頁尾 |
| `src/styles/global.css` | 配色 tokens（淺色／深色）、貼紙風格的按鈕與卡片、手機外框 |
| `scripts/sync-policy.mjs` | 把 App repo 的隱私權政策寫成 `src/content/privacy.md`（不進版控） |
| `public/assets/` | App 圖示 |
| `public/assets/screens/` | 功能區的 App 畫面 |

### 動畫

`story.ts` 對所有人都播放完整動畫，**不參考系統的「減少動態效果」設定**（網站擁有者 2026-10-05 的決定：電腦常因 Windows 動畫效果關閉或遠端桌面而回報減少動態，導致看不到開場動畫）。

### App 畫面

`public/assets/screens/` 的截圖用 App 的商店截圖模式（`flutter build apk --debug --dart-define=NIU_STORE_SCREENSHOTS=true`，不顯示示範模式提示）在模擬器上拍，時間設在週一 08:30 讓首頁有「上課中」，轉成 540×1200 WebP。

## 下載連結 /download

海報、傳單、社群貼文都用 **https://niu-life.app/download**，類似 Firebase Dynamic Links：

- iPhone／iPad 直接前往 App Store，Android 直接前往 Google Play，電腦顯示按鈕與這個網址的 QR Code。
- 可以加 `utm_*` 參數區分來源，例如 `https://niu-life.app/download?utm_source=poster&utm_medium=qr&utm_campaign=freshman`。GA 會依參數歸類這次瀏覽；Android 的參數也會帶進 Google Play 的安裝來源（Play Console → 使用者取得）。App Store 不支援這種參數。

## Google Analytics

評估 ID `G-TQSN4NFDVD`（資料串流 16044768167），在 `src/layouts/Base.astro` 載入，已關閉 Google 信號與廣告個人化。

- 頁面瀏覽：每頁自動記錄；`/download` 的瀏覽次數就是透過下載連結前往商店的次數（跳轉前會等頁面瀏覽送出，最多 1.5 秒）。
- `store_click`：點了哪個商店按鈕（`store` = ios／android）。
- GA 會把自訂事件暫存約 5 秒再批次送出，頁面在那之前離開就會遺失，所以商店按鈕都開新分頁，`/download` 不另送事件。

## 部署

推到 `main` 後，GitHub Actions（`.github/workflows/pages.yml`）建置並部署到 GitHub Pages，`www` 會轉到主網域。

- 網域 DNS 在 Cloudflare，紀錄要維持「僅 DNS」（灰色雲朵）：A 指向 GitHub 的 185.199.108–111.153，AAAA 指向 2606:50c0:8000–8003::153，`www` CNAME 指向 `windlessme.github.io`。開代理（橘色雲朵）會讓 GitHub 無法續簽憑證。
- HTTPS 憑證由 GitHub 自動向 Let's Encrypt 申請與續約，Pages 設定已開「強制 HTTPS」。

## 隱私權政策

政策以 `windlessme/niu-app-android` 的 `docs/android-privacy-policy.md` 為準。`npm run build` 會先同步：本機有 `../niu-app-android` 就讀它，CI 一律從 GitHub 下載。每天也會自動部署一次，所以 App 那邊改了政策，網站最晚隔天跟上；要立刻更新就到 Actions 手動執行 Deploy site。

## 商店連結

- App Store（iOS 版，qian403 維護）：https://apps.apple.com/tw/app/niu-life/id6813616626
- Google Play（Android 版）：https://play.google.com/store/apps/details?id=me.windless.niulife
