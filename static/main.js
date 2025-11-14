document.addEventListener('DOMContentLoaded', async function () {
    // =================================================================
    // SECTION 0: CONFIGURATION
    // =================================================================
    const fingerprintData = {};
    const noiseReport = {};

    const UNSTABLE_KEYS = [
        '電池 API', '廣告攔截器 (進階)', '主題更改擴充功能',
        'CPU 性能計時 (ms)', 'GPU 基準性能 (FPS)', '有效網路類型',
        '估計下載速度 (Mbps)', '估計延遲 (ms)', '地理位置 API',
    ];

    // 为异步操作设定一个全局超时，防止无限等待
    const ASYNC_TIMEOUT = 3000; // 3 秒

    // =================================================================
    // SECTION 0.5: UTILITY FUNCTIONS
    // =================================================================

    /**
     * 为任何 Promise 添加超时功能
     * @param {Promise} promise - The promise to wrap.
     * @param {number} ms - The timeout in milliseconds.
     * @param {any} timeoutValue - The value to resolve with on timeout.
     * @returns {Promise}
     */
    function withTimeout(promise, ms, timeoutValue) {
        let timeoutId;
        const timeoutPromise = new Promise((resolve) => {
            timeoutId = setTimeout(() => resolve(timeoutValue), ms);
        });

        return Promise.race([promise, timeoutPromise]).finally(() => {
            clearTimeout(timeoutId);
        });
    }

    // =================================================================
    // SECTION 1: "PURE" FINGERPRINT VALUE GETTERS FOR NOISE DETECTION
    // =================================================================

    // 1.1 Canvas (Async)
    function getPureCanvasValue() {
        return new Promise((resolve) => {
            try {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                const txt = 'BrowserLeaks.com <canvas> 1.0';
                ctx.textBaseline = "top";
                ctx.font = "14px 'Arial'";
                ctx.textBaseline = "alphabetic";
                ctx.fillStyle = "#f60";
                ctx.fillRect(125, 1, 62, 20);
                ctx.fillStyle = "#069";
                ctx.fillText(txt, 2, 15);
                ctx.fillStyle = "rgba(102, 204, 0, 0.7)";
                ctx.fillText(txt, 4, 17);
                resolve(canvas.toDataURL());
            } catch (e) {
                resolve('無法獲取');
            }
        });
    }

    // 1.2 Audio (Async)
    function getPureAudioValue() {
        const promise = new Promise((resolve) => {
            try {
                const audioCtx = new (window.OfflineAudioContext || window.webkitOfflineAudioContext)(1, 44100, 44100);
                if (!audioCtx) {
                    return resolve('不支援 AudioContext');
                }
                const oscillator = audioCtx.createOscillator();
                oscillator.type = "triangle";
                oscillator.frequency.setValueAtTime(10000, audioCtx.currentTime);
                const compressor = audioCtx.createDynamicsCompressor();
                oscillator.connect(compressor);
                compressor.connect(audioCtx.destination);
                oscillator.start(0);
                
                audioCtx.startRendering().then(buffer => {
                    let fingerprint = 0;
                    const data = buffer.getChannelData(0);
                    for (let i = 0; i < data.length; i++) fingerprint += Math.abs(data[i]);
                    resolve(fingerprint);
                }).catch(() => {
                    resolve('渲染失敗');
                });
            } catch (e) {
                resolve('無法獲取');
            }
        });
        return withTimeout(promise, ASYNC_TIMEOUT, '音訊渲染超時');
    }

    // 1.3 ClientRects (Sync)
    function getPureClientRectsValue() {
        try {
            const container = document.createElement('div');
            container.style.position = 'absolute';
            container.style.left = '-9999px';
            container.style.fontSize = '72px';
            container.style.fontFamily = 'monospace';
            container.innerHTML = 'mwmwmwmwlliilliil';
            document.body.appendChild(container);
            const rect = container.getBoundingClientRect();
            document.body.removeChild(container);
            return `${rect.width}x${rect.height}`;
        } catch (e) {
            return '無法獲取';
        }
    }
    
    // =================================================================
    // SECTION 2: SAMPLING AND ANALYSIS FUNCTIONS
    // =================================================================

    async function sampleAndAnalyze(samplerFunc, sampleCount = 3) {
        const results = [];
        for (let i = 0; i < sampleCount; i++) {
            results.push(await samplerFunc());
        }
        const firstResult = results[0];
        const uniqueResults = new Set(results);
        const isNoisy = uniqueResults.size > 1;
        return { value: firstResult, noisy: isNoisy };
    }

    async function analyzeCanvasFingerprint() {
        const result = await sampleAndAnalyze(getPureCanvasValue);
        fingerprintData['Canvas 指紋'] = result.value;
        noiseReport['Canvas'] = result.noisy;
    }

    async function analyzeAudioFingerprint() {
        const result = await sampleAndAnalyze(getPureAudioValue);
        fingerprintData['音訊指紋'] = result.value;
        noiseReport['Audio'] = result.noisy;
    }

    function analyzeClientRectsFingerprint() {
        const results = [getPureClientRectsValue(), getPureClientRectsValue(), getPureClientRectsValue()];
        const firstResult = results[0];
        const uniqueResults = new Set(results);
        const isNoisy = uniqueResults.size > 1;
        fingerprintData['ClientRects 指紋'] = firstResult;
        noiseReport['ClientRects'] = isNoisy;
    }

    // =================================================================
    // SECTION 3: STANDARD FINGERPRINTING FUNCTIONS
    // =================================================================

    // 3.1: Basic Browser & OS Info
    function getBasicFingerprint() {
        fingerprintData['User Agent'] = navigator.userAgent;
        try {
            fingerprintData['時區 (IANA)'] = Intl.DateTimeFormat().resolvedOptions().timeZone;
        } catch (e) {
            fingerprintData['時區 (IANA)'] = '無法獲取';
        }
        fingerprintData['時區偏移 (分鐘)'] = new Date().getTimezoneOffset();
        fingerprintData['語言'] = navigator.language || navigator.userLanguage;
        fingerprintData['多語言支援'] = navigator.languages ? navigator.languages.join(', ') : 'N/A';
        fingerprintData['螢幕解析度'] = `${screen.width}x${screen.height}`;
        fingerprintData['可用螢幕大小'] = `${screen.availWidth}x${screen.availHeight}`;
        fingerprintData['色彩深度'] = screen.colorDepth;
        fingerprintData['是否啟用 Cookie'] = navigator.cookieEnabled;
    }

    // 3.2: Hardware Info
    function getHardwareInfo() {
        fingerprintData['處理器核心數'] = navigator.hardwareConcurrency || 'N/A';
        fingerprintData['最大觸控點數量'] = navigator.maxTouchPoints || 0;
        fingerprintData['裝置記憶體 (GB)'] = navigator.deviceMemory || 'N/A';
        fingerprintData['藍牙 API'] = navigator.bluetooth ? '可用' : '不可用';
    }
    
    // 3.3: Network Info
    function getNetworkInfo() {
        const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
        if (connection) {
            fingerprintData['有效網路類型'] = connection.effectiveType || 'N/A';
            fingerprintData['估計下載速度 (Mbps)'] = connection.downlink || 'N/A';
            fingerprintData['估計延遲 (ms)'] = connection.rtt || 'N/A';
        } else {
            fingerprintData['網路資訊 API'] = '不支援';
        }
    }

    // 3.4: DNT (Do Not Track) Header
    function getDoNotTrack() {
        let dnt = navigator.doNotTrack || window.doNotTrack || navigator.msDoNotTrack;
        let status = '未設定';
        if (dnt === '1' || dnt === 'yes') status = '已啟用';
        else if (dnt === '0' || dnt === 'no') status = '已停用';
        fingerprintData['Do Not Track 標頭'] = status;
    }

    // 3.5: Math Precision
    function getMathPrecision() {
        const results = [];
        const functions = ['acos', 'asin', 'atan', 'cos', 'sin', 'tan'];
        functions.forEach(f => results.push(Math[f](0.5)));
        fingerprintData['Math 函數精度'] = results.join(',');
    }

    // 3.6: Advanced WebGL Fingerprint
    function getAdvancedWebGLFingerprint() {
        try {
            const canvas = document.createElement('canvas');
            const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
            if (!gl) {
                fingerprintData['WebGL 渲染器'] = '不支援';
                return;
            }
            const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
            if (debugInfo) {
                fingerprintData['WebGL 渲染器'] = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
            } else {
                fingerprintData['WebGL 渲染器'] = '無法獲取除錯資訊';
            }
        } catch (e) {
            fingerprintData['WebGL 渲染器'] = '獲取失敗';
        }
    }

    // 3.7: Geolocation API
    function getGeolocationFingerprint() {
        return new Promise((resolve) => {
            if (!navigator.geolocation) {
                fingerprintData['地理位置 API'] = '瀏覽器不支援';
                return resolve();
            }
            const options = { timeout: 4000, enableHighAccuracy: false };
            const timeoutId = setTimeout(() => {
                fingerprintData['地理位置 API'] = '超時或使用者忽略提示';
                resolve();
            }, 5000);

            navigator.geolocation.getCurrentPosition(
                () => {
                    clearTimeout(timeoutId);
                    fingerprintData['地理位置 API'] = '已授權';
                    resolve();
                },
                (error) => {
                    clearTimeout(timeoutId);
                    fingerprintData['地理位置 API'] = `未授權 (${error.code})`;
                    resolve();
                },
                options
            );
        });
    }

    // 3.8: Ad Blocker Detection
    function detectAdBlockerAdvanced() {
        return new Promise(async (resolve) => {
            // 注意：為了在本地測試，你已經將 URL 改為本地路徑，這是正確的。
            // 對於線上部署，你需要確保這些資源可以被跨域存取。
            const filterListUrls = [
                'https://easylist.to/easylist/easylist.txt',
                'https://easylist.to/easylist/easyprivacy.txt',
                'https://easylist.to/easylist/fanboy-annoyance.txt',
                'https://secure.fanboy.co.nz/fanboy-cookiemonster.txt',
                'https://easylist-downloads.adblockplus.org/easylistchina.txt',
                'https://raw.githubusercontent.com/xinggsf/Adblock-Plus-Rule/master/rule.txt',
                'https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/filters/filters.txt',
                'https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/filters/privacy.txt'
                // 你可以繼續加入你本地的其他列表檔案
            ];
            
            const processTimeout = 5000; // 為整個過程設定一個 5 秒的超時
            let isResolved = false;

            const timeoutId = setTimeout(() => {
                if (!isResolved) {
                    isResolved = true;
                    console.warn('AdBlocker detection timed out.');
                    fingerprintData['廣告攔截器 (進階)'] = '偵測超時';
                    resolve();
                }
            }, processTimeout);

            console.log('AdBlocker Detection: Starting...');
            
            const fetchPromises = filterListUrls.map(url => 
                fetch(url).then(res => res.ok ? res.text() : "").catch(() => "")
            );
            
            const allFiltersText = (await Promise.all(fetchPromises)).join('\n');
            
            if (isResolved) return;

            if (!allFiltersText || allFiltersText.trim().length === 0) {
                isResolved = true;
                clearTimeout(timeoutId);
                console.error('AdBlocker Detection: Failed to fetch filter lists or lists are empty.');
                fingerprintData['廣告攔截器 (進階)'] = '無法獲取過濾清單';
                return resolve();
            }
            console.log(`AdBlocker Detection: Fetched ${allFiltersText.length} characters from filter lists.`);

            const domSelectors = [];
            const lines = allFiltersText.split('\n');
            const ruleRegex = /^##(.+)/; 
            
            lines.forEach(line => {
                const match = line.trim().match(ruleRegex);
                if (match && match[1]) {
                    const selector = match[1];
                    if (!selector.includes(':') && !selector.includes('>') && !selector.includes('*') && !selector.includes('+')) {
                        domSelectors.push(selector);
                    }
                }
            });

            if (domSelectors.length === 0) {
                isResolved = true;
                clearTimeout(timeoutId);
                console.warn('AdBlocker Detection: No usable DOM rules found in lists.');
                fingerprintData['廣告攔截器 (進階)'] = '未找到可用的 DOM 規則';
                return resolve();
            }
            console.log(`AdBlocker Detection: Parsed ${domSelectors.length} usable DOM selectors.`);

            const baits = [];
            const baitCount = domSelectors.length;
            const baitHouse = document.createElement('div');
            baitHouse.style.position = 'absolute';
            baitHouse.style.left = '-9999px';
            
            for (let i = 0; i < baitCount && i < domSelectors.length; i++) {
                const randomSelector = domSelectors[Math.floor(Math.random() * domSelectors.length)];
                const bait = document.createElement('div');
                try {
                    const classes = (randomSelector.match(/\.([a-zA-Z0-9_-]+)/g) || []).map(c => c.substring(1));
                    if (classes.length > 0) bait.className = classes.join(' ');
                    
                    const ids = (randomSelector.match(/#([a-zA-Z0-9_-]+)/g) || []).map(id => id.substring(1));
                    if (ids.length > 0) bait.id = ids[0];
                    
                    const attrs = (randomSelector.match(/\[(.*?)\]/g) || []);
                    attrs.forEach(attr => {
                        const parts = attr.slice(1, -1).split('=');
                        bait.setAttribute(parts[0], parts[1] ? parts[1].replace(/"/g, '') : '');
                    });

                    bait.innerHTML = '&nbsp;';
                    baits.push(bait);
                    baitHouse.appendChild(bait);
                } catch (e) {}
            }
            
            document.body.appendChild(baitHouse);
            console.log(`AdBlocker Detection: Created and appended ${baits.length} bait elements.`);

            // *** THE FIX IS HERE ***
            // 使用 setTimeout 替代 requestAnimationFrame，給予擴充功能更長的反應時間
            setTimeout(() => {
                if (isResolved) {
                    if (document.body.contains(baitHouse)) document.body.removeChild(baitHouse);
                    return;
                }
                isResolved = true;
                clearTimeout(timeoutId);

                let blockedCount = 0;
                baits.forEach(bait => {
                    if (bait.offsetHeight === 0 || window.getComputedStyle(bait).display === 'none' || window.getComputedStyle(bait).visibility === 'hidden') {
                        blockedCount++;
                    }
                });
                
                console.log(`AdBlocker Detection: ${blockedCount} out of ${baits.length} baits were blocked.`);

                if (blockedCount > 0) {
                    fingerprintData['廣告攔截器 (進階)'] = `已啟用 (${blockedCount}/${baits.length} 規則觸發)`;
                } else {
                    fingerprintData['廣告攔截器 (進階)'] = '未偵測到';
                }
                
                if (document.body.contains(baitHouse)) document.body.removeChild(baitHouse);
                resolve();
            }, 100); // 延遲 100 毫秒，這對絕大多數擴充功能來說都足夠了
        });
    }

    

    // 3.9: Theme Changer Detection
    function detectThemeChanger() {
        return new Promise((resolve) => {
            const probe = document.createElement('div');
            const expectedBgColor = 'rgb(1, 2, 3)';
            probe.style.backgroundColor = expectedBgColor;
            probe.style.position = 'absolute';
            probe.style.left = '-9999px';
            document.body.appendChild(probe);
            requestAnimationFrame(() => {
                const actualBgColor = window.getComputedStyle(probe).backgroundColor;
                fingerprintData['主題更改擴充功能'] = actualBgColor !== expectedBgColor ? `已偵測到` : '未偵測到';
                if(document.body.contains(probe)) document.body.removeChild(probe);
                resolve();
            });
        });
    }

    // 3.10: Battery API
    function getBatteryInfo() {
        return new Promise((resolve) => {
            if (navigator.getBattery) {
                navigator.getBattery().then(battery => {
                    fingerprintData['電池 API'] = `可用 (充電中: ${battery.charging})`;
                    resolve();
                }).catch(() => {
                    fingerprintData['電池 API'] = '獲取失敗';
                    resolve();
                });
            } else {
                fingerprintData['電池 API'] = '不支援';
                resolve();
            }
        });
    }

    // 3.11: Media Devices
    function getMediaDevices() {
        return new Promise((resolve) => {
            if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
                navigator.mediaDevices.enumerateDevices().then(devices => {
                    const counts = { audioinput: 0, audiooutput: 0, videoinput: 0 };
                    devices.forEach(d => { if (d.kind in counts) counts[d.kind]++; });
                    fingerprintData['媒體裝置'] = `麥克風: ${counts.audioinput}, 喇叭: ${counts.audiooutput}, 攝影機: ${counts.videoinput}`;
                    resolve();
                }).catch(() => {
                    fingerprintData['媒體裝置'] = '獲取失敗';
                    resolve();
                });
            } else {
                fingerprintData['媒體裝置'] = '不支援';
                resolve();
            }
        });
    }

    // 3.12: Speech Synthesis Voices
    function getSpeechVoices() {
        return new Promise((resolve) => {
            if ('speechSynthesis' in window) {
                setTimeout(() => {
                    try {
                        fingerprintData['語音合成引擎數量'] = window.speechSynthesis.getVoices().length;
                    } catch (e) {
                        fingerprintData['語音合成引擎數量'] = '獲取失敗';
                    }
                    resolve();
                }, 100);
            } else {
                fingerprintData['語音合成引擎數量'] = '不支援';
                resolve();
            }
        });
    }

    // 3.13: Timing Attack
    function getTimingAttackFingerprint() {
        return new Promise((resolve) => {
            const startTime = performance.now();
            let result = 0;
            for (let i = 0; i < 2000000; i++) result += Math.sqrt(Math.sin(i));
            const duration = performance.now() - startTime;
            fingerprintData['CPU 性能計時 (ms)'] = duration.toFixed(2);
            resolve();
        });
    }
    
    // 3.14: Three.js Deep WebGL Render Test
    function getThreeJsFingerprint() {
        return new Promise((resolve) => {
            const script = document.createElement('script');
            script.src = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';
            
            const cleanupAndResolve = (value) => {
                if(document.head.contains(script)) document.head.removeChild(script);
                fingerprintData['Three.js WebGL Render'] = value;
                resolve();
            };
            
            const timeoutId = setTimeout(() => cleanupAndResolve('函式庫載入超時'), 10000);

            script.onload = () => {
                clearTimeout(timeoutId);
                try {
                    const renderer = new THREE.WebGLRenderer();
                    const scene = new THREE.Scene();
                    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
                    camera.position.z = 1;
                    const material = new THREE.MeshPhongMaterial({ color: 0xff4422 });
                    const geometry = new THREE.PlaneGeometry(1, 1);
                    const square = new THREE.Mesh(geometry, material);
                    scene.add(square);
                    renderer.render(scene, camera);
                    const gl = renderer.getContext();
                    const pixelData = new Uint8Array(4);
                    gl.readPixels(4, 4, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixelData);
                    cleanupAndResolve(`[${pixelData.join(',')}]`);
                    geometry.dispose(); material.dispose(); renderer.dispose();
                } catch (e) {
                    cleanupAndResolve('渲染失敗');
                }
            };
            script.onerror = () => {
                clearTimeout(timeoutId);
                cleanupAndResolve('無法載入函式庫');
            };
            document.head.appendChild(script);
        });
    }

    // 3.15: WebGPU Adapter Information
    function getWebGPUFingerprint() {
        return new Promise(async (resolve) => {
            try {
                if (!navigator.gpu) {
                    fingerprintData['WebGPU 適配器資訊'] = '不支援';
                    return resolve();
                }
                const adapter = await withTimeout(navigator.gpu.requestAdapter(), ASYNC_TIMEOUT, null);
                if (!adapter) {
                    fingerprintData['WebGPU 適配器資訊'] = '無可用適配器或請求超時';
                    return resolve();
                }
                if ('requestAdapterInfo' in adapter && typeof adapter.requestAdapterInfo === 'function') {
                    const info = await withTimeout(adapter.requestAdapterInfo(), ASYNC_TIMEOUT, null);
                    if (!info) {
                        fingerprintData['WebGPU 適配器資訊'] = '獲取詳細資訊超時';
                        return resolve();
                    }
                    const fingerprint = [info.vendor, info.architecture, info.device, info.description].filter(Boolean).join(' | ');
                    fingerprintData['WebGPU 適配器資訊'] = fingerprint || '資訊為空';
                } else {
                    fingerprintData['WebGPU 適配器資訊'] = '可用但無法獲取詳細資訊';
                }
            } catch (e) {
                fingerprintData['WebGPU 適配器資訊'] = '獲取失敗';
            }
            resolve();
        });
    }


    // =================================================================
    // SECTION 4: ORCHESTRATION AND DISPLAY
    // =================================================================

    function renderAnalysisResult(data) {
        const summaryDiv = document.getElementById('identity-summary');
        const detailsContainer = document.getElementById('fingerprint-details-container');
        const detailsTbody = document.querySelector('#fingerprint-details tbody');
        const noiseAlertDiv = document.getElementById('noise-alert');
    
        let summaryHTML = `<p>您的訪客 ID: <span class="uuid">${data.your_uuid}</span></p>`;
    
        if (data.match_status === 'NEW_USER') {
            summaryHTML += `<div class="match-status status-new-user">分析結果：新訪客</div>`;
            summaryHTML += `<p>您的瀏覽器指紋是獨一無二的，已存入資料庫作為新紀錄。</p>`;
            detailsContainer.style.display = 'none';
        } else if (data.match_status === 'MATCH_FOUND') {
            const details = data.match_details;
            summaryHTML += `<div class="match-status status-match-found">分析結果：身分已識別</div>`;
            summaryHTML += `<p>系統認為您與訪客 <span class="uuid">${details.matched_uuid}</span> 是同一個人。</p>`;
            summaryHTML += `<p>相似度高達 <strong>${details.score.toFixed(2)}%</strong>。</p>`;
            detailsTbody.innerHTML = '';
            details.comparison_table.forEach(item => {
                const row = document.createElement('tr');
                const statusClass = item.match ? 'status-match' : 'status-mismatch';
                const statusText = item.match ? '匹配' : '不匹配';
                const currentValDisplay = String(item.currentValue || 'N/A').substring(0, 150);
                row.innerHTML = `<td>${item.key}</td><td>${currentValDisplay}</td><td class="${statusClass}">${statusText}</td>`;
                detailsTbody.appendChild(row);
            });
            detailsContainer.style.display = 'block';
        }
        summaryDiv.innerHTML = summaryHTML;
    
        const noiseReportData = data.noise_report || {};
        const noisyFeatures = Object.keys(noiseReportData).filter(key => noiseReportData[key]);
    
        if (noisyFeatures.length > 0) {
            let alertHTML = `<div class="alert-title">⚠️ 偵測到行為異常</div>`;
            alertHTML += `<p>系統發現以下指紋特徵在短時間內返回了不一致的結果，這極有可能是由反指紋追蹤擴充功能（如 CanvasBlocker, AudioContext Fingerprint Defender 等）造成的噪音干擾。</p>`;
            alertHTML += '<ul>';
            noisyFeatures.forEach(feature => {
                alertHTML += `<li><strong>${feature} 指紋</strong></li>`;
            });
            alertHTML += '</ul>';
            noiseAlertDiv.innerHTML = alertHTML;
            noiseAlertDiv.style.display = 'block';
        } else {
            noiseAlertDiv.style.display = 'none';
        }
    }

    async function analyzeFingerprintOnServer() {
        console.log('1. [DEBUG] Starting fingerprint collection...');

        // 1. 採集所有數據
        getBasicFingerprint();
        getHardwareInfo();
        getNetworkInfo();
        getDoNotTrack();
        getMathPrecision();
        getAdvancedWebGLFingerprint();
        analyzeClientRectsFingerprint();

        console.log('2. [DEBUG] Sync functions complete. Starting async collection...');

        await Promise.allSettled([
            analyzeCanvasFingerprint(),
            analyzeAudioFingerprint(),
            getGeolocationFingerprint(),
            detectAdBlockerAdvanced(),
            detectThemeChanger(),
            getBatteryInfo(),
            getMediaDevices(),
            getSpeechVoices(),
            getTimingAttackFingerprint(),
            getThreeJsFingerprint(),
            getWebGPUFingerprint()
        ]);

        console.log('3. [DEBUG] Async collection complete. Preparing to send to server...');

        // 2. 分離穩定與不穩定數據
        const stableFingerprint = {};
        const unstableMetrics = {};
        for (const key in fingerprintData) {
            if (UNSTABLE_KEYS.includes(key)) {
                unstableMetrics[key] = fingerprintData[key];
            } else {
                stableFingerprint[key] = fingerprintData[key];
            }
        }
        
        // 3. 發送到後端
        try {
            console.log('4. [DEBUG] Sending data to /analyze...');
            const response = await fetch('/analyze', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    stable: stableFingerprint,
                    unstable: unstableMetrics,
                    noise: noiseReport
                }),
            });
            
            if (!response.ok) throw new Error(`伺服器錯誤: ${response.statusText}`);

            const data = await response.json();
            console.log('5. [DEBUG] Server response received:', data);
            renderAnalysisResult(data);

        } catch (error) {
            console.error('分析指紋時發生錯誤:', error);
            const summaryDiv = document.getElementById('identity-summary');
            summaryDiv.innerHTML = `<div class="result-message" style="color: red;">與伺服器通訊失敗，請檢查後端服務是否運行。</div>`;
        }
    }

    // 按鈕功能
    document.getElementById('reset-fingerprint').addEventListener('click', () => {
        alert('您的身分識別紀錄儲存在伺服器端。若要重設，請清除本站的 Cookie 後重新整理頁面，系統將會把您視為一位全新的訪客。');
    });

    // 啟動整個流程
    analyzeFingerprintOnServer();
});