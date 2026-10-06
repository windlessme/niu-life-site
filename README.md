# NIU-Life 網站

[NIU-Life](https://niu-life.app/) 是國立宜蘭大學學生的非官方校園助手 App，有 iOS 與 Android 版。這個 repo 是它的官網：捲動敘事的首頁、下載入口、常見問題、許願池、關於我們，以及 App 與網站共用的隱私權政策。

> NIU-Life 為個人開發的非官方工具，與國立宜蘭大學並無隸屬、合作或授權關係。

- 網站：https://niu-life.app/
- iOS App：[App Store](https://apps.apple.com/tw/app/niu-life/id6813616626)・原始碼 [qian403/NIU-app](https://github.com/qian403/NIU-app)
- Android App：[Google Play](https://play.google.com/store/apps/details?id=me.windless.niulife)・原始碼 [windlessme/niu-app-android](https://github.com/windlessme/niu-app-android)

## 技術

- [Astro](https://astro.build/) 產生純靜態網站，TypeScript 撰寫
- [GSAP ScrollTrigger](https://gsap.com/docs/v3/Plugins/ScrollTrigger/) 製作捲動動畫
- 部署在 GitHub Pages

## 本機開發

需要 Node 22.12 以上（見 `.nvmrc`）：

```bash
npm install
npm run dev       # http://localhost:4321
npm run build     # 型別檢查（astro check）後輸出到 dist/
npm run preview   # 預覽建置結果
```

## 專案結構

```
src/
├── pages/            # 每個檔案是一個網址
│   ├── index.astro         首頁，組合 components/ 的各段落
│   ├── about.astro         /about 關於我們
│   ├── privacy.astro       /privacy 隱私權政策
│   ├── download.astro      /download 依裝置前往商店
│   ├── open/[feature].astro  /open/<功能> 沒裝 App 時的說明頁
│   ├── sitemap.xml.ts
│   └── 404.astro
├── components/       # 首頁段落（Hero、About、Features、Privacy、Faq、Wish、Download）與商店按鈕
├── content/privacy.md  # 隱私權政策內文
├── layouts/Base.astro  # <head>、頁首、頁尾
├── scripts/story.ts    # 首頁的捲動動畫
├── styles/global.css   # 配色（淺色／深色）與共用樣式
└── site.ts             # 商店網址、分析工具 ID、要被搜尋引擎收錄的頁面
public/
├── assets/           # 圖示、分享預覽圖、App 畫面、開發者頭像
└── .well-known/      # Android App Links 與 iOS Universal Links 設定
```

## 常見修改

- **隱私權政策**：iOS 版、Android 版與網站共用 `src/content/privacy.md` 這一份。修改後請更新 frontmatter 的 `updated` 日期。
- **App 畫面**：`public/assets/screens/` 每張畫面有兩種尺寸，540×1200 的 `<名稱>.webp` 和給手機用的 360 寬 `<名稱>-360.webp`，換圖時兩份都要換。
- **新增頁面**：在 `src/pages/` 加檔案；要讓搜尋引擎收錄的話，把路徑加進 `src/site.ts` 的 `INDEXED_PAGES`，`sitemap.xml` 會自動列出。
- **頁面標題與分享預覽**：由各頁傳給 `Base.astro` 的 `title` 與 `description` 產生；首頁的結構化資料（JSON-LD）在 `src/pages/index.astro`。

## 下載連結與 App 連結

**`https://niu-life.app/download`** 是對外宣傳用的單一下載連結：iPhone／iPad 前往 App Store，Android 前往 Google Play，電腦則顯示商店按鈕與 QR Code。可以加 `utm_*` 參數標示來源，例如 `?utm_source=poster&utm_medium=qr`。

已安裝 App 的手機開啟下列網址時會直接進入 App：

| 網址 | 開啟 |
|---|---|
| `/download` | App 首頁 |
| `/open/schedule` | 課表 |
| `/open/attendance` | 快速點名 |
| `/open/library` | 圖書館入館碼 |
| `/open/mail` | 校園信箱 |
| `/open/moodle` | M 園區 |
| `/open/calendar` | 行事曆 |

驗證設定在 `public/.well-known/`（Android 的 `assetlinks.json`、iOS 的 `apple-app-site-association`）。新增 `/open/<功能>` 時，網站的 `src/pages/open/[feature].astro` 與 App 端都要一起修改。

## 分析工具

網站使用 Google Analytics（已關閉 Google 信號與廣告個人化）與 Microsoft Clarity，兩者都等頁面載入完成後才載入，不影響首次顯示。App 本身不使用這兩項服務。詳見[隱私權政策](https://niu-life.app/privacy)。

## 部署

推送到 `main` 後，GitHub Actions（`.github/workflows/pages.yml`）會建置並部署到 GitHub Pages。

## 聯絡與回報

- 信箱：hi@niu-life.app
- 問題回報與功能許願：https://forms.gle/2ok6fydShrfe6PHr5

## 授權

網站原始碼以 [MIT 授權](LICENSE)公開。iOS 與 Android App 的授權請見各自的 repo。
