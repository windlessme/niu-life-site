# NIU-Life 網站

NIU-Life 的官網 **https://niu-life.app/**：捲動敘事的首頁、iOS／Android 下載入口、常見問題、許願池與 Android 隱私權政策。

用 [Astro](https://astro.build/) 產生純靜態網站，捲動動畫用 [GSAP ScrollTrigger](https://gsap.com/docs/v3/Plugins/ScrollTrigger/)，TypeScript 撰寫。

## 開發

使用 `.nvmrc` 指定的 Node 22 以上：

```bash
npm install
npm run dev       # http://localhost:4321
npm run build     # astro check → dist/
npm run preview   # 預覽建置結果
```

## 結構

| 位置 | 用途 |
|---|---|
| `src/pages/index.astro` | 首頁，依序組合 7 個段落 |
| `src/pages/privacy.astro` | 隱私權政策頁，網址 `/privacy`（`/privacy.html` 也可以） |
| `src/content/privacy.md` | **iOS 版、Android 版與網站共用的隱私權政策**，唯一來源 |
| `src/pages/about.astro` | 關於我們 `/about`：兩位開發者（頭像在 `public/assets/team/`，從 GitHub 下載的 256×256 WebP；換頭像就換檔案） |
| `src/pages/download.astro` | 下載連結 `/download`：手機自動前往 App Store／Google Play，電腦顯示兩個按鈕與 QR Code |
| `src/components/StoreButtons.astro` | 商店按鈕（新分頁開啟，點擊記到 GA 的 `store_click`） |
| `src/site.ts` | GA 評估 ID |
| `src/components/` | 各段落：`Hero` 開場、`About`、`Features` 功能、`Privacy`、`Faq`、`Wish` 許願池、`Download` |
| `src/scripts/story.ts` | 捲動敘事：開場貼紙飛進手機、功能區固定並切換 01～06、段落淡入、右下角頁碼 |
| `src/layouts/Base.astro` | `<head>`、頁首、頁尾 |
| `src/styles/global.css` | 配色 tokens（淺色／深色）、貼紙風格的按鈕與卡片、手機外框 |
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

## App Links 與 Universal Links（/download、/open/…）

`public/.well-known/assetlinks.json` 是 Play Console 產生的 Digital Asset Links，證明 niu-life.app 屬於 `me.windless.niulife`（憑證是 Google 保管的 App 簽署金鑰，所以只有從 Play 安裝的 App 會通過驗證）。

`public/.well-known/apple-app-site-association` 是 iOS 的 Universal Links 設定，指定 `G4LXL97NF9.dev.chienniuapp` 接管 `/download` 與 `/open/*`。iOS App 還要在 entitlements 加上 `applinks:niu-life.app`，並處理開進來的網址（iOS 維護者負責）。GitHub Pages 會把這個沒有副檔名的檔案以 `application/octet-stream` 送出，Apple 的 CDN 仍可讀取；確認方式：`https://app-site-association.cdn-apple.com/a/v1/niu-life.app`（Apple 會快取，更新後可能要一兩天才反映）。

Android App（1.0.16 起）接管同樣兩種網址，裝了 App 的手機點了會直接開 App：

- `https://niu-life.app/download`：開 App；沒裝的人照常前往商店。
- `https://niu-life.app/open/<功能>`：開 App 裡的功能，`<功能>` 是 `schedule`（課表）、`attendance`（快速點名）、`library`（入館碼）、`mail`（校園信箱）、`moodle`（M 園區）、`calendar`（行事曆）。沒裝 App 或用 iPhone 的人會看到 `src/pages/open/[feature].astro` 的說明頁與下載按鈕。新增功能時，這裡和 App 的 `lib/app/deep_links.dart` 要一起改。

驗證：`https://digitalassetlinks.googleapis.com/v1/statements:list?source.web.site=https://niu-life.app&relation=delegate_permission/common.handle_all_urls`。

## Google Analytics

評估 ID `G-TQSN4NFDVD`（資料串流 16044768167），在 `src/layouts/Base.astro` 載入，已關閉 Google 信號與廣告個人化。

- 頁面瀏覽：每頁自動記錄；`/download` 的瀏覽次數就是透過下載連結前往商店的次數（跳轉前會等頁面瀏覽送出，最多 1.5 秒）。
- `store_click`：點了哪個商店按鈕（`store` = ios／android）。
- GA 會把自訂事件暫存約 5 秒再批次送出，頁面在那之前離開就會遺失，所以商店按鈕都開新分頁，`/download` 不另送事件。

## 部署

推到 `main` 後，GitHub Actions（`.github/workflows/pages.yml`）建置並部署到 GitHub Pages，`www` 會轉到主網域。

- 網域 DNS 在 Cloudflare，紀錄要維持「僅 DNS」（灰色雲朵）：A 指向 GitHub 的 185.199.108–111.153，AAAA 指向 2606:50c0:8000–8003::153，`www` CNAME 指向 `windlessme.github.io`。開代理（橘色雲朵）會讓 GitHub 無法續簽憑證。
- HTTPS 憑證由 GitHub 自動向 Let's Encrypt 申請與續約，Pages 設定已開「強制 HTTPS」。

## 隱私權政策與聯絡窗口

- **隱私權政策**：iOS 版、Android 版與網站共用一份，唯一來源是 `src/content/privacy.md`，公開網址 **https://niu-life.app/privacy**。採一般 App 的概括寫法（收集哪些資料、如何使用、第三方服務、權限、保存與安全、你的選擇、變更、聯絡），不逐項列功能細節（使用者 2026-10-05 決定）；但資料流向必須正確，新增會送出資料的功能時要確認仍涵蓋。修改後更新 frontmatter 的 `updated`，推到 `main` 就會部署。Android App 內的隱私權畫面是摘要，政策有實質變動時一起改（niu-app-android 的 `lib/features/settings/privacy_screen.dart`）；iOS 版的對應內容由 iOS 維護者處理。
- **聯絡信箱**：兩個平台共用 **hi@niu-life.app**（Cloudflare Email Routing）。
- **問題回報表單**：https://forms.gle/2ok6fydShrfe6PHr5（網站許願池與 Android App 的「回報問題」共用）。

## 商店連結

- App Store（iOS 版，qian403 維護）：https://apps.apple.com/tw/app/niu-life/id6813616626
- Google Play（Android 版）：https://play.google.com/store/apps/details?id=me.windless.niulife

## 授權

網站原始碼以 [MIT 授權](LICENSE)公開。iOS 與 Android App 各自的授權見 [qian403/NIU-app](https://github.com/qian403/NIU-app/blob/main/LICENSE) 與 [windlessme/niu-app-android](https://github.com/windlessme/niu-app-android/blob/main/LICENSE)。
