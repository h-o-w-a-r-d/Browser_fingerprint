import sqlite3

def init_db():
    """
    初始化資料庫，創建或更新 fingerprints 表格。
    """
    print("正在初始化資料庫...")
    conn = None
    try:
        conn = sqlite3.connect('fingerprints.db')
        cursor = conn.cursor()

        # ==========================================================
        # 步驟 1: 首先，確保主表格一定存在
        # CREATE TABLE IF NOT EXISTS 是安全的，如果表格已存在，它不會做任何事。
        # ==========================================================
        cursor.execute('''
        CREATE TABLE IF NOT EXISTS fingerprints (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL,
            stable_fingerprint TEXT NOT NULL,
            unstable_metrics TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
        ''')

        # ==========================================================
        # 步驟 2: 現在表格肯定存在了，再檢查是否需要新增欄位
        # ==========================================================
        cursor.execute("PRAGMA table_info(fingerprints)")
        columns = [row[1] for row in cursor.fetchall()]
        
        if 'noise_report' not in columns:
            print("表格 'fingerprints' 缺少 'noise_report' 欄位，正在新增...")
            # 使用 ALTER TABLE 新增欄位
            cursor.execute('''
            ALTER TABLE fingerprints
            ADD COLUMN noise_report TEXT DEFAULT '{}'
            ''')
            print("欄位 'noise_report' 新增成功。")
        else:
            print("欄位 'noise_report' 已存在，無需修改。")

        # ==========================================================
        # 步驟 3: 確保索引也存在
        # ==========================================================
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_user_id ON fingerprints(user_id)')
        
        conn.commit()
        print("資料庫初始化完成。")

    except sqlite3.Error as e:
        print(f"資料庫錯誤: {e}")
    finally:
        if conn:
            conn.close()

if __name__ == '__main__':
    init_db()