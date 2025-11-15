# Simple Browser Fingerprinting Service

---
**[中文版本 (Switch to Chinese Version)](README.md)**
---

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A full-stack web application for academic research and educational purposes, designed to provide an in-depth demonstration of the techniques, challenges, and countermeasures of modern browser fingerprinting.

## 🚨 Important Warning: For Academic and Educational Use Only

**This project was created for academic discussion, technical research, and to raise public awareness about the boundaries of online privacy. Its purpose is to reveal how browser fingerprinting technology works and how anti-tracking techniques (such as noise injection) can affect it.**

**It is Strictly Prohibited** to use this project or any part of it for the following purposes:

* Any form of commercial product or service.
* Tracking website visitors without their explicit consent.
* Any activity that violates personal privacy or local laws and regulations.

The authors and contributors of this project **are not responsible** for any consequences arising from the abuse, improper use, or illegal use of this project's code. Before downloading, copying, or using any part of this project, please ensure that you have fully understood and agreed to this statement.

## ✨ Core Features

* **Multi-Dimensional Fingerprint Collection**: Gathers information from dozens of feature points, including Canvas, AudioContext, WebGL, fonts, hardware information, and network status, to construct a high-entropy user fingerprint.
* **Stable vs. Unstable Feature Separation**: On the client-side, fingerprint features are categorized as "stable" (e.g., User Agent, WebGL renderer) and "unstable" (e.g., battery status, network latency), providing a more reliable basis for backend comparison.
* **Anti-Fingerprinting Noise Detection**: By performing rapid, multiple samples of key APIs like Canvas and Audio on the client-side, the system can detect random noise injected by browser extensions (e.g., CanvasBlocker) and record this "behavior" itself.
* **Weighted Similarity-Matching Algorithm**: The server-side employs a weighted scoring model that assigns different weights to features of varying stability, resulting in more accurate comparisons.
* **Intelligent Noise-Ignoring Mechanism**: During fingerprint comparison, if historical records in the database indicate that a feature (like Canvas) is "noisy," the matching algorithm will intelligently ignore that feature to prevent anti-tracking tools from interfering with identification accuracy.
* **Cross-Session Visitor Identification**: Through server-side matching and cookie rewriting, visitors have a high probability of being re-identified even if they clear local storage or use incognito mode (provided cookies are not completely blocked).
* **Clear Results Visualization**: The front-end interface clearly displays the visitor ID, match status, similarity score, and a detailed comparison of each feature point.



## 🏛️ Technical Architecture

This project uses a classic front-end/back-end separated architecture:

* **Front-End (Client-Side)**:
  
  * **HTML (`Fingerprint.html`)**: Defines the page structure.
  * **CSS (`style.css`)**: Provides modern page styling.
  * **JavaScript (`main.js`)**: The core logic, responsible for:
    1. Executing all fingerprinting tasks (synchronous and asynchronous).
    2. Performing noise analysis.
    3. Packaging the collected data.
    4. Sending data to the back-end API.
    5. Receiving and rendering the analysis results from the back-end.

* **Back-End (Server-Side)**:
  
  * **Python 3**: The primary development language.
  * **Flask**: A lightweight web framework for handling HTTP requests and providing APIs.
  * **SQLite**: A lightweight, file-based database for storing the historical fingerprint records of all visitors.

## 🔧 Installation and Setup

Please ensure you have **Python 3** and **pip** installed in your environment.

1. **Clone the Project**
   
   ```bash
   git clone https://github.com/YOUR_USERNAME/your-fingerprint-project.git
   cd your-fingerprint-project
   ```

2. **Install Dependencies**
   This project only depends on Flask.
   
   ```bash
   pip install Flask
   ```

3. **Initialize the Database**
   Before the first run, you need to create the `fingerprints.db` database file and its required tables.
   
   ```bash
   python start_database.py
   ```
   
   You should see the message "Database initialized successfully."

4. **Start the Back-End Server**
   
   ```bash
   python server.py
   ```
   
   The server will run on port `5001` by default.

5. **Start Testing**
   Open your web browser and navigate to [http://127.0.0.1:5001](http://127.0.0.1:5001). The page will automatically begin collecting a fingerprint and display the analysis results.

## 💡 Core Code Explained

### Noise Detection (`main.js`)

In `main.js`, the `sampleAndAnalyze` function is the core of noise detection. It executes a sampling function (like `getPureCanvasValue`) multiple times and checks if the results are identical.

```javascript
async function sampleAndAnalyze(samplerFunc, sampleCount = 3) {
    const results = [];
    for (let i = 0; i < sampleCount; i++) {
        results.push(await samplerFunc());
    }
    const uniqueResults = new Set(results);
    const isNoisy = uniqueResults.size > 1; // If multiple samples are not unique, noise exists
    return { value: results, noisy: isNoisy };
}
```

This `noisy` flag is sent to the back-end and becomes a crucial piece of information in the identification process.

### Intelligent Matching Algorithm (`server.py`)

In `server.py`, the `compare_fingerprints` function implements the weighting and noise-ignoring logic.

```python
def compare_fingerprints(current_stable, stored_stable, stored_noise_report={}):
    # ...
    for key in all_stable_keys:
        weight = FINGERPRINT_WEIGHTS.get(key, 1)

        # Strategy 2: Check if this feature was flagged as noisy in historical records
        is_historically_noisy = False
        for noise_key, fp_key in NOISE_KEY_MAPPING.items():
            if fp_key == key and stored_noise_report.get(noise_key, False):
                is_historically_noisy = True
                break

        if is_historically_noisy:
            # If historically noisy, ignore this feature in the current comparison
            continue

        total_possible_score += weight
        # ... subsequent matching logic
```

This code snippet demonstrates the algorithm's intelligence: it trusts and utilizes noise reports from historical records, enabling it to more accurately identify users attempting to conceal their identity through noise injection.

## 🧩 Third-Party Components & Licenses

This project relies on the following excellent open-source libraries and community-maintained data lists. We extend our sincere gratitude to the contributors of these projects.

### Three.js

* **Purpose**: Used to perform advanced WebGL rendering tests to obtain a more detailed GPU fingerprint.
* **Website**: [https://threejs.org/](https://threejs.org/)
* **License**: MIT License
* **Copyright**: Copyright © 2010-2024 three.js authors.

### Ad-Blocking Filter Lists

* **Purpose**: The advanced ad-blocker detection feature in `main.js` dynamically fetches filter rules from the public URLs below to generate DOM "bait" elements for testing. This project **does not store or redistribute** these lists; they are referenced in real-time on the client-side during execution.
* **Sources & Licenses**:
  * **EasyList**: Community-maintained, primarily under [Creative Commons Attribution-ShareAlike 3.0](https://creativecommons.org/licenses/by-sa/3.0/) and some GPLv3 licenses.
    * `https://easylist.to/easylist/easylist.txt`
    * `https://easylist.to/easylist/easyprivacy.txt`
    * `https://easylist-downloads.adblockplus.org/easylistchina.txt`
  * **Fanboy's Lists**: Community-maintained, with licenses similar to EasyList.
    * `https://easylist.to/easylist/fanboy-annoyance.txt`
    * `https://secure.fanboy.co.nz/fanboy-cookiemonster.txt`
  * **uBlock Origin Assets**: The filter lists for this project are primarily licensed under the [GPLv3 License](https://github.com/uBlockOrigin/uAssets/blob/master/LICENSE.txt).
    * `https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/filters/filters.txt`
    * `https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/filters/privacy.txt`
  * **Xinggsf's Adblock Plus Rule**: This project is licensed under the [GPLv3 License](https://github.com/xinggsf/Adblock-Plus-Rule/blob/master/LICENSE).
    * `https://raw.githubusercontent.com/xinggsf/Adblock-Plus-Rule/master/rule.txt`

We respect the hard work of all filter list maintainers and strictly adhere to their licensing terms. The use of these lists in this project is limited to academic detection research.

## 📜 License

This project is licensed under the [MIT License](https://opensource.org/licenses/MIT). This means you are free to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the software, provided that the original copyright notice and this permission notice are included in all copies or substantial portions of the software.

Once again, please use this project in compliance with all applicable laws, regulations, and ethical guidelines.
