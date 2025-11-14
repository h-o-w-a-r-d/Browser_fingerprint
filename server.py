import json
import uuid
import sqlite3
from flask import Flask, render_template, request, jsonify, make_response, send_from_directory

# --- 配置與常數 ---
DATABASE = 'fingerprints.db'
MATCH_THRESHOLD = 90.0 # 相似度超過 90% 即視為同一個人

# 權重應只包含穩定特徵
FINGERPRINT_WEIGHTS = {
    # 原有權重
    '音訊指紋': 15,
    'WebGL 渲染器': 15,
    'Canvas 指紋': 10,
    '語音合成引擎數量': 10,
    'User Agent': 8,
    '螢幕解析度': 8,
    '色彩深度': 7,
    '媒體裝置': 7,
    '時區 (IANA)': 5,
    '多語言支援': 5,
    'Intl API 指紋': 8, # <--- 權重從 4 提升到 8 (策略三)
    'Three.js WebGL Render': 15,
    
    # --- 新增的權重 ---
    'ClientRects 指紋': 8,
    'WebGPU 適配器資訊': 15,
}

# 定義哪些鍵值屬於不穩定的
UNSTABLE_KEYS = [
    '電池 API', '廣告攔截器 (進階)', '主題更改擴充功能',
    'CPU 性能計時 (ms)', 'GPU 基準性能 (FPS)', '有效網路類型',
    '估計下載速度 (Mbps)', '估計延遲 (ms)', '地理位置 API',
]

app = Flask(__name__, template_folder='templates', static_folder='static')

def get_db_connection():
    conn = sqlite3.connect(DATABASE)
    conn.row_factory = sqlite3.Row
    return conn

# 映射 noise_report 的鍵到 stable_fingerprint 的鍵
NOISE_KEY_MAPPING = {
    'Canvas': 'Canvas 指紋',
    'Audio': '音訊指紋',
    'ClientRects': 'ClientRects 指紋',
}

def compare_fingerprints(current_stable, stored_stable, stored_noise_report={}):
    """
    僅比較穩定指紋並返回分數和詳細資訊，同時考慮已儲存的噪音報告 (策略二)。
    """
    achieved_score = 0
    total_possible_score = 0
    comparison_details = []

    all_stable_keys = set(current_stable.keys()) | set(stored_stable.keys())
    for key in all_stable_keys:
        weight = FINGERPRINT_WEIGHTS.get(key, 1)
        
        # 1. 檢查這個特徵是否在歷史紀錄中就被標記為噪音 (策略二)
        is_historically_noisy = False
        # 遍歷映射，檢查當前特徵鍵是否對應到任一噪音報告鍵
        for noise_key, fp_key in NOISE_KEY_MAPPING.items():
            if fp_key == key and stored_noise_report.get(noise_key, False):
                is_historically_noisy = True
                break

        if is_historically_noisy:
            # 如果特徵在歷史上就是噪音，則直接忽略該特徵的權重
            continue 
        
        # 正常計算權重
        total_possible_score += weight
        
        current_value = current_stable.get(key)
        stored_value = stored_stable.get(key)
        
        match = (current_value == stored_value)
        
        if match:
            achieved_score += weight
            
        comparison_details.append({
            'key': key,
            'currentValue': current_value,
            'storedValue': stored_value, 
            'match': match,
        })

    final_score = (achieved_score / total_possible_score) * 100 if total_possible_score > 0 else 0
    comparison_details.sort(key=lambda x: x['match'])
    
    return {"score": final_score, "details": comparison_details}

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
    current_noise_report = data.get('noise', {}) # <--- 接收來自前端的 noise 報告 (策略一)
    
    # 無論如何，先為當前訪客（或從 cookie 中讀取）設定一個 ID
    visitor_id = request.cookies.get('fingerprint_user_id', str(uuid.uuid4()))
    
    conn = get_db_connection()
    cursor = conn.cursor()

    # 獲取資料庫中每個用戶的最新一筆指紋記錄 (包含 noise_report)
    cursor.execute('''
        SELECT user_id, stable_fingerprint, noise_report
        FROM fingerprints
        WHERE id IN (SELECT MAX(id) FROM fingerprints GROUP BY user_id)
    ''')
    all_users_latest_fingerprints = cursor.fetchall()
    
    best_match_score = -1
    best_match_uuid = None
    best_match_details = None

    # 與資料庫中所有指紋進行比對
    if all_users_latest_fingerprints:
        for user_record in all_users_latest_fingerprints:
            stored_stable = json.loads(user_record['stable_fingerprint'])
            stored_noise_report = json.loads(user_record['noise_report']) # <--- 獲取歷史噪音報告 (策略二)

            # 傳遞歷史噪音報告給比對函式
            result = compare_fingerprints(current_stable, stored_stable, stored_noise_report)
            
            if result['score'] > best_match_score:
                best_match_score = result['score']
                best_match_uuid = user_record['user_id']
                best_match_details = result['details']

    response_data = {}
    final_user_id = visitor_id # 預設最終 ID 為當前訪客 ID

    if best_match_score >= MATCH_THRESHOLD:
        # 找到了匹配項，認為是同一個人
        final_user_id = best_match_uuid # 身分被合併到已存在的用戶
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
        # 沒有找到高相似度匹配，視為新用戶
        response_data = {
            'your_uuid': visitor_id,
            'match_status': 'NEW_USER',
        }

    # 將本次指紋存入資料庫，包含 noise_report (策略一)
    conn.execute(
        'INSERT INTO fingerprints (user_id, stable_fingerprint, unstable_metrics, noise_report) VALUES (?, ?, ?, ?)',
        (final_user_id, 
         json.dumps(current_stable), 
         json.dumps(current_unstable),
         json.dumps(current_noise_report)) # <--- 儲存 noise_report
    )
    conn.commit()
    conn.close()

    # 確保 response_data 中包含雜訊報告，以便前端渲染警報 (策略一)
    response_data['noise_report'] = current_noise_report

    response = make_response(jsonify(response_data))
    # 將最終確定的 user_id 寫回 cookie，實現跨會話追蹤
    response.set_cookie('fingerprint_user_id', final_user_id, max_age=365*24*60*60, httponly=True, samesite='Lax')
        
    return response

if __name__ == '__main__':
    # 確保資料庫已初始化
    from start_database import init_db
    init_db()
    app.run(debug=True, port=5001)