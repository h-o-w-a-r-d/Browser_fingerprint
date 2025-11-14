# 進階瀏覽器指紋識別服務 (Advanced Browser Fingerprinting Service)

---
**[English Version Available (點此查看英文版)](README.en.md)**
---

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

一份用於學術研究與教育目的的全端 Web 應用程式，旨在深入展示現代瀏覽器指紋識別的技術、挑戰與應對策略。

## 🚨 重要警告：僅供學術與教育用途

**本專案的建立是為了學術探討、技術研究以及提升大眾對於網路隱私邊界的認知。其目的在於揭示瀏覽器指紋技術如何運作，以及反追蹤技術（例如噪音注入）如何對其產生影響。**

**嚴禁 (Strictly Prohibited)** 將此專案或其任何部分用於以下目的：
*   任何形式的商業產品或服務。
*   未經使用者明確同意的網站訪客追蹤。
*   任何侵犯個人隱私或違反地區法律法規的行為。

專案的作者與貢獻者對於任何濫用、不當使用或違法使用此專案程式碼所造成的後果，**概不負責**。在下載、複製或使用本專案的任何部分之前，請確保您已充分理解並同意此聲明。

## ✨ 核心特色

*   **多維度指紋採集**：從數十個特徵點採集資訊，包含 Canvas、AudioContext、WebGL、字型、硬體資訊、網路狀態等，建構高精度的使用者指紋。
*   **穩定與非穩定特徵分離**：在客戶端將指紋特徵分為「穩定」（如 User Agent、WebGL 渲染器）與「非穩定」（如電池狀態、網路延遲）兩類，為後端比對提供更可靠的基礎。
*   **反指紋噪音偵測**：透過在客戶端對 Canvas、Audio 等關鍵 API 進行快速、多次的採樣，能夠偵測到因瀏覽器擴充功能（如 CanvasBlocker）注入的隨機噪音，並將此「行為」本身記錄下來。
*   **權重化相似度比對演算法**：伺服器端採用加權計分模型，為不同穩定性的特徵賦予不同權重，使得比對結果更加精準。
*   **智慧型噪音忽略機制**：在進行指紋比對時，如果資料庫中儲存的歷史紀錄表明某個特徵（如 Canvas）是「有噪音的」，比對演算法將會智慧地忽略該特徵，以防止反追蹤工具干擾身分識別的準確性。
*   **跨會話訪客識別**：透過伺服器端比對與 Cookie 回寫，即使訪客清空本機儲存或使用無痕模式（在 Cookie 未被完全阻擋的情況下），仍有高機率被再次識別。
*   **清晰的結果視覺化**：前端介面清晰地展示了訪客 ID、匹配狀態、相似度分數，以及每一個特徵點的詳細比對結果。

## 🏛️ 技術架構

本專案採用經典的前後端分離架構：

*   **前端 (Client-Side)**:
    *   **HTML (`Fingerprint.html`)**: 負責頁面結構。
    *   **CSS (`style.css`)**: 提供現代化的頁面樣式。
    *   **JavaScript (`main.js`)**: 核心邏輯所在，負責：
        1.  執行所有指紋採集任務（同步與非同步）。
        2.  進行噪音分析。
        3.  將採集到的數據打包。
        4.  發送至後端 API。
        5.  接收後端分析結果並渲染至頁面。

*   **後端 (Server-Side)**:
    *   **Python 3**: 主要開發語言。
    *   **Flask**: 輕量級的 Web 框架，用於處理 HTTP 請求與提供 API。
    *   **SQLite**: 一個輕便的檔案型資料庫，用於儲存所有訪客的歷史指紋紀錄。

## 🔧 安裝與啟動

請確保您的環境已安裝 **Python 3** 與 **pip**。

1.  **複製專案**
    ```bash
    git clone https://github.com/YOUR_USERNAME/your-fingerprint-project.git
    cd your-fingerprint-project
    ```

2.  **安裝依賴**
    本專案僅依賴 Flask。
    ```bash
    pip install Flask
    ```

3.  **初始化資料庫**
    首次執行前，需要建立 `fingerprints.db` 資料庫檔案與其所需的資料表。
    ```bash
    python start_database.py
    ```
    您應該會看到 "資料庫初始化完成" 的訊息。

4.  **啟動後端伺服器**
    ```bash
    python server.py
    ```
    伺服器預設會在 `5001` 連接埠上運行。

5.  **開始測試**
    打開您的網頁瀏覽器，訪問 [http://127.0.0.1:5001](http://127.0.0.1:5001)。頁面將會自動開始採集指紋並顯示分析結果。

## 💡 核心程式碼解析

### 噪音偵測 (`main.js`)

在 `main.js` 中，`sampleAndAnalyze` 函式是噪音偵測的核心。它會多次執行一個採樣函式（如 `getPureCanvasValue`），並檢查結果是否完全一致。

```javascript
async function sampleAndAnalyze(samplerFunc, sampleCount = 3) {
    const results = [];
    for (let i = 0; i < sampleCount; i++) {
        results.push(await samplerFunc());
    }
    const uniqueResults = new Set(results);
    const isNoisy = uniqueResults.size > 1; // 如果多次採樣結果不唯一，則存在噪音
    return { value: results[0], noisy: isNoisy };
}
```
這個 `noisy` 標記會被送到後端，成為識別過程中的一個重要依據。

### 智慧型比對演算法 (`server.py`)

在 `server.py` 中，`compare_fingerprints` 函式實現了加權與噪音忽略的邏輯。

```python
def compare_fingerprints(current_stable, stored_stable, stored_noise_report={}):
    # ...
    for key in all_stable_keys:
        weight = FINGERPRINT_WEIGHTS.get(key, 1)
        
        # 策略二：檢查這個特徵在歷史紀錄中是否被標記為噪音
        is_historically_noisy = False
        for noise_key, fp_key in NOISE_KEY_MAPPING.items():
            if fp_key == key and stored_noise_report.get(noise_key, False):
                is_historically_noisy = True
                break

        if is_historically_noisy:
            # 如果歷史上有噪音，則本次比對直接忽略該特徵，不計入總分
            continue 
        
        total_possible_score += weight
        # ... 後續比對邏輯
```
這段程式碼展示了演算法的智慧之處：它信任並利用了歷史紀錄中的噪音報告，從而能更準確地識別那些試圖透過噪音來隱藏身分的用戶。

## 🧩 第三方資源與授權 (Third-Party Components & Licenses)

本專案的運作依賴於以下優秀的開源函式庫與社群維護的資料清單。我們對這些專案的貢獻者表示誠摯的感謝。

### Three.js

*   **用途**: 用於執行進階的 WebGL 渲染測試，以獲取更深層次的 GPU 指紋。
*   **官網**: [https://threejs.org/](https://threejs.org/)
*   **授權**: MIT License
*   **版權**: Copyright © 2010-2024 three.js authors.

### 廣告攔截過濾清單 (Ad-Blocking Filter Lists)

*   **用途**: 前端 `main.js` 中的進階廣告攔截器偵測功能會從以下公開的 URL 動態拉取過濾規則，以生成 DOM "誘餌" 元素進行測試。本專案**不儲存或重新分發**這些清單，僅在客戶端執行時進行即時引用。
*   **來源與授權**:
    *   **EasyList**: 由社群維護，主要採用 [Creative Commons Attribution-ShareAlike 3.0](https://creativecommons.org/licenses/by-sa/3.0/) 和部分 GPLv3 授權。
        *   `https://easylist.to/easylist/easylist.txt`
        *   `https://easylist.to/easylist/easyprivacy.txt`
        *   `https://easylist-downloads.adblockplus.org/easylistchina.txt`
    *   **Fanboy's Lists**: 由社群維護，授權方式與 EasyList 相似。
        *   `https://easylist.to/easylist/fanboy-annoyance.txt`
        *   `https://secure.fanboy.co.nz/fanboy-cookiemonster.txt`
    *   **uBlock Origin Assets**: 該專案的過濾清單主要採用 [GPLv3 License](https://github.com/uBlockOrigin/uAssets/blob/master/LICENSE.txt) 授權。
        *   `https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/filters/filters.txt`
        *   `https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/filters/privacy.txt`
    *   **Xinggsf's Adblock Plus Rule**: 該專案採用 [GPLv3 License](https://github.com/xinggsf/Adblock-Plus-Rule/blob/master/LICENSE) 授權。
        *   `https://raw.githubusercontent.com/xinggsf/Adblock-Plus-Rule/master/rule.txt`

我們尊重所有過濾清單維護者的辛勤工作，並嚴格遵守其授權條款。本專案對這些清單的使用方式僅限於學術性的偵測研究。

## 📜 授權條款 (License)

本專案採用 [MIT License](https://opensource.org/licenses/MIT) 授權。這意味著您可以自由地使用、複製、修改、合併、發布、散佈、再授權及/或銷售本軟體的副本，但前提是必須包含原始的版權聲明和此授權聲明。

再次強調，請在遵守法律法規與道德準則的前提下使用本專案。
