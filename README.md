# NIU-Life 網站

NIU-Life 的官網：功能介紹、iOS／Android 下載入口、常見問題與 Android 隱私權政策。純靜態 HTML／CSS，沒有建置步驟，任何靜態主機都能放（GitHub Pages、Cloudflare Pages 等）。

## 本機預覽

```bash
python3 -m http.server 8090
# 打開 http://localhost:8090/
```

## 檔案

| 檔案 | 用途 |
|---|---|
| `index.html` | 首頁 |
| `privacy.html` | 隱私權政策，**由腳本產生，不要直接改** |
| `privacy.template.html` | 隱私權政策的頁面外框 |
| `build_privacy.py` | 把 Android repo 的 `docs/android-privacy-policy.md` 轉成 `privacy.html` |
| `styles.css` | 全部樣式，淺色／深色配色在 `:root` |
| `main.js` | 捲動敘事：每個固定段落（`data-pin`）依捲動進度設 `--p`；開場的貼紙飛進手機、功能區依進度切換 01～06 與手機畫面、右下角頁碼；系統開「減少動態效果」時全部改成靜態版面。另外依裝置把對應的商店按鈕排第一 |
| `assets/` | App 圖示 |
| `assets/screens/` | 功能區的 App 畫面：用商店截圖模式（`--dart-define=NIU_STORE_SCREENSHOTS=true`，不顯示示範模式提示）在模擬器拍，時間設在週一 08:30 讓首頁有「上課中」，540×1200 WebP |

## 部署

推到 `main` 後，GitHub Actions（`.github/workflows/pages.yml`）會部署到 GitHub Pages：**https://niu-life.app/**（`www` 會轉到主網域）。

- 網域 DNS 在 Cloudflare，紀錄要維持「僅 DNS」（灰色雲朵）：A 指向 GitHub 的 185.199.108–111.153，AAAA 指向 2606:50c0:8000–8003::153，`www` CNAME 指向 `windlessme.github.io`。開代理（橘色雲朵）會讓 GitHub 無法續簽憑證。
- HTTPS 憑證由 GitHub 自動向 Let's Encrypt 申請與續約，Pages 設定已開「強制 HTTPS」。

## 隱私權政策

政策以 `windlessme/niu-app-android` 的 `docs/android-privacy-policy.md` 為準。部署時會下載最新版重新產生 `privacy.html`，每天也會自動部署一次，所以 App 那邊改了政策，網站最晚隔天跟上；要立刻更新就到 Actions 手動執行 Deploy site。

本機預覽想看最新政策時：

```bash
python3 build_privacy.py ../niu-app-android/docs/android-privacy-policy.md
```

## 商店連結

- App Store（iOS 版，qian403 維護）：https://apps.apple.com/tw/app/niu-life/id6813616626
- Google Play（Android 版）：https://play.google.com/store/apps/details?id=me.windless.niulife
