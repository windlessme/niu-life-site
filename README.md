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
| `main.js` | 依裝置把對應的商店按鈕排第一並加強調（iPhone → App Store，Android → Google Play） |
| `assets/` | App 圖示（從 Play 商店取得）與兩張截圖（Play 商店截圖裁出手機部分） |

## 部署

推到 `main` 後，GitHub Actions（`.github/workflows/pages.yml`）會部署到 GitHub Pages。網址：https://niu-life.app/（DNS 設定好之前是 https://windlessme.github.io/niu-life-site/）。

## 隱私權政策

政策以 `windlessme/niu-app-android` 的 `docs/android-privacy-policy.md` 為準。部署時會下載最新版重新產生 `privacy.html`，每天也會自動部署一次，所以 App 那邊改了政策，網站最晚隔天跟上；要立刻更新就到 Actions 手動執行 Deploy site。

本機預覽想看最新政策時：

```bash
python3 build_privacy.py ../niu-app-android/docs/android-privacy-policy.md
```

## 商店連結

- App Store（iOS 版，qian403 維護）：https://apps.apple.com/tw/app/niu-life/id6813616626
- Google Play（Android 版）：https://play.google.com/store/apps/details?id=me.windless.niulife
