import json
import uuid
import re # 匯入正規表示式模組
import sqlite3
from flask import Flask, render_template, request, jsonify, make_response, send_from_directory

# --- 配置與常數 ---
DATABASE = 'fingerprints.db'
MATCH_THRESHOLD = 90.0 # 相似度超過 90% 即視為同一個人

# 權重應只包含穩定特徵
FINGERPRINT_WEIGHTS = {
    'IP 位址': 20,
    'HTTP 標頭': 10,
    '音訊指紋': 15,
    'Canvas 指紋': 10,
    '語音合成引擎數量': 10,
    'User Agent': 8,
    '螢幕解析度': 8,
    '色彩深度': 7,
    '媒體裝置': 7,
    '時區 (IANA)': 5,
    '多語言支援': 5,
    'Intl API 指紋': 8,
    'Three.js WebGL Render': 15,
    'ClientRects 指紋': 8,
    'WebGPU 適配器資訊': 15,
    '字體指紋': 15,
    'WebGL 詳細參數': 12,
    'User-Agent Client Hints': 10,
    '權限狀態': 6,
    'WebRTC 本地 IP': 8,
    # 新增一個基礎權重，雖然很小，但它的存在是為了被不一致性檢測標記
    'WebDriver 標記': 1, 
}

# 定義哪些鍵值屬於不穩定的 (無變更)
UNSTABLE_KEYS = [
    '電池 API', '廣告攔截器 (進階)', '主題更改擴充功能',
    'CPU 性能計時 (ms)', 'GPU 基準性能 (FPS)', '有效網路類型',
    '估計下載速度 (Mbps)', '估計延遲 (ms)', '地理位置 API',
]

HEADERS_TO_INCLUDE = [
    'Accept', 'Accept-Encoding', 'Accept-Language', 'User-Agent',
    'Upgrade-Insecure-Requests', 'Sec-Ch-Ua', 'Sec-Ch-Ua-Mobile', 'Sec-Ch-Ua-Platform',
]

# ==========================================================
# SECTION: 不一致性檢測邏輯 (Inconsistency Detection Logic)
# ==========================================================

# 定義不同作業系統的特有字體
WINDOWS_FONTS = ['microsoft yahei', 'segoe ui', 'tahoma', 'calibri']
MACOS_FONTS = ['helvetica neue', 'lucida grande', 'san francisco', 'pingfang tc']
LINUX_FONTS = ['ubuntu', 'dejavu sans', 'liberation sans']

def check_platform_hardware_mismatch(fp):
    """
    檢查平台聲明與硬體參數之間的矛盾。
    例子: iPhone User-Agent 但有 4K 螢幕。
    """
    adjustments = {}
    ua = fp.get('User Agent', '').lower()
    resolution = fp.get('螢幕解析度', '')

    # 檢查行動裝置聲明與桌面級解析度
    if any(p in ua for p in ['iphone', 'android', 'mobile']):
        try:
            width, height = map(int, resolution.split('x'))
            # 如果行動裝置回報的寬度或高度大於 2000px，這很可疑
            if width > 2000 or height > 2000:
                # 降低 User Agent 和螢幕解析度的可信度
                adjustments['User Agent'] = -FINGERPRINT_WEIGHTS.get('User Agent', 8) # 大幅降低權重
                adjustments['螢幕解析度'] = -FINGERPRINT_WEIGHTS.get('螢幕解析度', 8)
        except ValueError:
            pass # 解析度格式不正確，忽略
    return adjustments

def check_os_font_mismatch(fp):
    """
    檢查作業系統聲明與回報的字體列表是否匹配。
    例子: 聲稱是 macOS，但回報了大量 Windows 字體。
    """
    adjustments = {}
    ua = fp.get('User Agent', '').lower()
    fonts = fp.get('字體指紋', '').lower()
    
    detected_os = None
    if 'windows' in ua:
        detected_os = 'windows'
    elif 'macintosh' in ua or 'mac os' in ua:
        detected_os = 'macos'
    elif 'linux' in ua and 'android' not in ua:
        detected_os = 'linux'

    if detected_os == 'macos':
        # 如果是 macOS，但不包含任何 macOS 核心字體，卻包含 Windows 字體
        if not any(f in fonts for f in MACOS_FONTS) and any(f in fonts for f in WINDOWS_FONTS):
            adjustments['字體指紋'] = -FINGERPRINT_WEIGHTS.get('字體指紋', 15)
            adjustments['User Agent'] = -5 # 同時降低 UA 的可信度
    
    if detected_os == 'windows':
        # 如果是 Windows，但不包含任何 Windows 核心字體，卻包含 macOS 字體
        if not any(f in fonts for f in WINDOWS_FONTS) and any(f in fonts for f in MACOS_FONTS):
            adjustments['字體指紋'] = -FINGERPRINT_WEIGHTS.get('字體指紋', 15)
            adjustments['User Agent'] = -5

    return adjustments

def check_automation_tool_signatures(fp):
    """
    檢查是否存在已知的自動化工具標記。
    例子: navigator.webdriver === true
    """
    adjustments = {}
    # 來自前端的 navigator.webdriver 值
    if fp.get('WebDriver 標記') == True:
        # 這是一個極其強烈的機器人信號，大幅降低所有主要特徵的權重
        # 因為機器人可以輕易偽造任何東西
        print(f"[警告] 檢測到 WebDriver 標記，可能為自動化工具。")
        adjustments['Canvas 指紋'] = -10
        adjustments['音訊指紋'] = -10
        adjustments['字體指紋'] = -10
        adjustments['User Agent'] = -8
        adjustments['WebGL 詳細參數'] = -10
    return adjustments


def run_inconsistency_checks(fingerprint):
    """
    運行所有不一致性檢測，並匯總權重調整。
    返回一個字典，鍵是特徵名稱，值是權重的調整量 (負數表示降低)。
    """
    total_adjustments = {}
    
    checks = [
        check_platform_hardware_mismatch,
        check_os_font_mismatch,
        check_automation_tool_signatures,
    ]
    
    for check_func in checks:
        adjustments = check_func(fingerprint)
        for key, value in adjustments.items():
            total_adjustments[key] = total_adjustments.get(key, 0) + value
            
    if total_adjustments:
        print(f"[不一致性檢測] 發現潛在偽造，權重調整: {total_adjustments}")
        
    return total_adjustments

# ==========================================================
# END SECTION: 不一致性檢測邏輯
# ==========================================================


app = Flask(__name__, template_folder='templates', static_folder='static')

def get_db_connection():
    conn = sqlite3.connect(DATABASE)
    conn.row_factory = sqlite3.Row
    return conn

NOISE_KEY_MAPPING = {
    'Canvas': 'Canvas 指紋',
    'Audio': '音訊指紋',
    'ClientRects': 'ClientRects 指紋',
}

def compare_fingerprints(current_stable, stored_stable, stored_noise_report={}, weight_adjustments={}):
    """
    比較穩定指紋，但這次會考慮動態權重調整。
    """
    achieved_score = 0
    total_possible_score = 0
    comparison_details = []

    all_stable_keys = set(current_stable.keys()) | set(stored_stable.keys())
    for key in all_stable_keys:
        base_weight = FINGERPRINT_WEIGHTS.get(key, 1)
        adjustment = weight_adjustments.get(key, 0)
        
        # 應用權重調整，確保權重不為負
        effective_weight = max(0, base_weight + adjustment)

        is_historically_noisy = False
        for noise_key, fp_key in NOISE_KEY_MAPPING.items():
            if fp_key == key and stored_noise_report.get(noise_key, False):
                is_historically_noisy = True
                break

        if is_historically_noisy:
            continue
        
        total_possible_score += effective_weight
        
        current_value = current_stable.get(key)
        stored_value = stored_stable.get(key)
        
        match = (current_value == stored_value)
        
        if match:
            achieved_score += effective_weight
            
        comparison_details.append({
            'key': key,
            'currentValue': current_value,
            'storedValue': stored_value, 
            'match': match,
        })

    final_score = (achieved_score / total_possible_score) * 100 if total_possible_score > 0 else 0
    comparison_details.sort(key=lambda x: x['match'])
    
    return {"score": final_score, "details": comparison_details}

def get_client_ip(request):
    """
    獲取真實的客戶端 IP 位址，考慮到代理伺服器。
    """
    # 檢查 X-Forwarded-For 標頭，通常由代理伺服器設置
    if request.headers.getlist("X-Forwarded-For"):
        # X-Forwarded-For 可以是一個列表，取第一個 IP
        ip = request.headers.getlist("X-Forwarded-For")[0].split(',')[0].strip()
    # 檢查 X-Real-IP 標頭，一些代理伺服器（如 Nginx）會使用
    elif request.headers.get("X-Real-IP"):
        ip = request.headers.get("X-Real-IP")
    # 如果沒有代理標頭，則使用標準的 remote_addr
    else:
        ip = request.remote_addr
    return ip

def create_header_fingerprint(request):
    """
    從請求中提取指定的標頭來創建一個穩定的指紋字串。
    """
    header_parts = []
    # 排序以確保每次生成的順序一致
    for header_name in sorted(HEADERS_TO_INCLUDE):
        value = request.headers.get(header_name, '') # 如果標頭不存在，使用空字串
        header_parts.append(f"{header_name}:{value}")
    
    return " | ".join(header_parts)

@app.route('/')
def index():
    return render_template('Fingerprint.html')

@app.route('/static/<path:filename>')
def serve_static(filename):
    return send_from_directory('static', filename)

@app.route('/analyze', methods=['POST'])
def analyze_fingerprint():
    data = request.json
    current_stable = data.get('stable', {})
    current_unstable = data.get('unstable', {})
    current_noise_report = data.get('noise', {})
    
    client_ip = get_client_ip(request)
    header_fingerprint = create_header_fingerprint(request)
    
    current_stable['IP 位址'] = client_ip
    current_stable['HTTP 標頭'] = header_fingerprint
    
    # --- 核心變更：在比對前運行不一致性檢測 ---
    weight_adjustments = run_inconsistency_checks(current_stable)
    # ---------------------------------------------
    
    visitor_id = request.cookies.get('fingerprint_user_id', str(uuid.uuid4()))
    
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute('''
        SELECT user_id, stable_fingerprint, noise_report
        FROM fingerprints
        WHERE id IN (SELECT MAX(id) FROM fingerprints GROUP BY user_id)
    ''')
    all_users_latest_fingerprints = cursor.fetchall()
    
    best_match_score = -1
    best_match_uuid = None
    best_match_details = None

    if all_users_latest_fingerprints:
        for user_record in all_users_latest_fingerprints:
            stored_stable = json.loads(user_record['stable_fingerprint'])
            stored_noise_report = json.loads(user_record['noise_report'])

            # --- 核心變更：將權重調整傳遞給比對函式 ---
            result = compare_fingerprints(current_stable, stored_stable, stored_noise_report, weight_adjustments)
            # ---------------------------------------------
            
            if result['score'] > best_match_score:
                best_match_score = result['score']
                best_match_uuid = user_record['user_id']
                best_match_details = result['details']

    response_data = {}
    final_user_id = visitor_id

    if best_match_score >= MATCH_THRESHOLD:
        final_user_id = best_match_uuid
        response_data = {
            'your_uuid': visitor_id,
            'match_status': 'MATCH_FOUND',
            'match_details': {
                'matched_uuid': best_match_uuid,
                'score': best_match_score,
                'comparison_table': best_match_details
            }
        }
    else:
        response_data = {
            'your_uuid': visitor_id,
            'match_status': 'NEW_USER',
        }
    
    # 可以在回應中加入一個可信度標記
    response_data['tampering_detected'] = bool(weight_adjustments)
    response_data['trust_adjustments'] = weight_adjustments

    conn.execute(
        'INSERT INTO fingerprints (user_id, stable_fingerprint, unstable_metrics, noise_report) VALUES (?, ?, ?, ?)',
        (final_user_id, json.dumps(current_stable), json.dumps(current_unstable), json.dumps(current_noise_report))
    )
    conn.commit()
    conn.close()

    response_data['noise_report'] = current_noise_report
    response = make_response(jsonify(response_data))
    response.set_cookie('fingerprint_user_id', final_user_id, max_age=365*24*60*60, httponly=True, samesite='Lax')
        
    return response

if __name__ == '__main__':
    from start_database import init_db
    init_db()
    app.run(debug=True, port=5001)
