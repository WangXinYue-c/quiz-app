"""
刷题神器 - 后端主程序
功能：文件上传解析 + AI题目结构化 + 刷题接口 + 记录管理
"""

import os
import json
import sqlite3
import uuid
import time
from datetime import datetime
from flask import Flask, render_template, request, jsonify, send_from_directory
from werkzeug.utils import secure_filename

# ========== 配置 ==========
app = Flask(__name__)
app.config['UPLOAD_FOLDER'] = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'uploads')
app.config['MAX_CONTENT_LENGTH'] = 50 * 1024 * 1024  # 50MB
app.config['SECRET_KEY'] = 'quiz-app-secret-key'

ALLOWED_EXTENSIONS = {'pdf', 'docx', 'doc', 'txt'}

# AI配置 - 从数据库读取，环境变量作为后备
ENV_AI_API_KEY = os.environ.get('AI_API_KEY', '')
ENV_AI_BASE_URL = os.environ.get('AI_BASE_URL', 'https://api.deepseek.com/v1')
ENV_AI_MODEL = os.environ.get('AI_MODEL', 'deepseek-chat')

# ========== 数据库 ==========
DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'quiz.db')

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db()
    c = conn.cursor()
    
    # 文件表：记录上传的原始文件
    c.execute('''CREATE TABLE IF NOT EXISTS files (
        id TEXT PRIMARY KEY,
        filename TEXT NOT NULL,
        file_type TEXT,
        file_size INTEGER,
        upload_time TEXT NOT NULL,
        status TEXT DEFAULT 'pending',
        error_msg TEXT,
        quiz_id TEXT
    )''')
    
    # 试卷表：解析后的试卷
    c.execute('''CREATE TABLE IF NOT EXISTS quizzes (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        file_id TEXT,
        question_count INTEGER DEFAULT 0,
        create_time TEXT NOT NULL,
        description TEXT
    )''')
    
    # 题目表
    c.execute('''CREATE TABLE IF NOT EXISTS questions (
        id TEXT PRIMARY KEY,
        quiz_id TEXT NOT NULL,
        question_index INTEGER NOT NULL,
        question_type TEXT NOT NULL,
        stem TEXT NOT NULL,
        options TEXT NOT NULL,
        answer TEXT NOT NULL,
        explanation TEXT,
        create_time TEXT NOT NULL
    )''')
    
    # 答题记录表
    c.execute('''CREATE TABLE IF NOT EXISTS answer_records (
        id TEXT PRIMARY KEY,
        quiz_id TEXT NOT NULL,
        question_id TEXT NOT NULL,
        user_answer TEXT,
        is_correct INTEGER,
        answer_time TEXT NOT NULL
    )''')

    # 答题进度表：记录每份试卷做到第几题
    c.execute('''CREATE TABLE IF NOT EXISTS quiz_progress (
        id TEXT PRIMARY KEY,
        quiz_id TEXT NOT NULL UNIQUE,
        current_index INTEGER DEFAULT 0,
        answered_json TEXT DEFAULT '[]',
        answers_json TEXT DEFAULT '[]',
        marked_json TEXT DEFAULT '[]',
        updated_time TEXT NOT NULL
    )''')

    # 配置表
    c.execute('''CREATE TABLE IF NOT EXISTS config (
        key TEXT PRIMARY KEY,
        value TEXT
    )''')

    conn.commit()
    conn.close()

def get_config(key, default=''):
    """从数据库读取配置，数据库没有则用环境变量"""
    conn = get_db()
    row = conn.execute('SELECT value FROM config WHERE key = ?', (key,)).fetchone()
    conn.close()
    if row:
        return row['value']
    env_map = {
        'ai_api_key': ENV_AI_API_KEY,
        'ai_base_url': ENV_AI_BASE_URL,
        'ai_model': ENV_AI_MODEL,
    }
    return env_map.get(key, default)

def save_config(key, value):
    """保存配置到数据库"""
    conn = get_db()
    conn.execute('''INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)''',
                 (key, value))
    conn.commit()
    conn.close()

def get_ai_config_full():
    """获取完整AI配置"""
    api_key = get_config('ai_api_key')
    base_url = get_config('ai_base_url', 'https://api.deepseek.com/v1')
    model = get_config('ai_model', 'deepseek-chat')
    return api_key, base_url, model

# ========== 工具函数 ==========
def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

def generate_id():
    return str(uuid.uuid4())

def now_str():
    return datetime.now().strftime('%Y-%m-%d %H:%M:%S')

# ========== 文件解析 ==========
def extract_text_from_pdf(filepath):
    """从PDF提取文字"""
    try:
        import pdfplumber
        text = ''
        with pdfplumber.open(filepath) as pdf:
            for page in pdf.pages:
                page_text = page.extract_text()
                if page_text:
                    text += page_text + '\n'
        return text
    except ImportError:
        # 备用方案：用PyPDF2
        try:
            from PyPDF2 import PdfReader
            reader = PdfReader(filepath)
            text = ''
            for page in reader.pages:
                text += page.extract_text() + '\n'
            return text
        except ImportError:
            raise Exception('未安装PDF解析库，请运行 pip install pdfplumber')

def extract_text_from_docx(filepath):
    """从Word文档提取文字"""
    try:
        from docx import Document
        doc = Document(filepath)
        text = ''
        for para in doc.paragraphs:
            text += para.text + '\n'
        # 提取表格中的文字
        for table in doc.tables:
            for row in table.rows:
                for cell in row.cells:
                    text += cell.text + '\t'
                text += '\n'
        return text
    except ImportError:
        raise Exception('未安装Word解析库，请运行 pip install python-docx')

def extract_text_from_txt(filepath):
    """从txt提取文字"""
    encodings = ['utf-8', 'gbk', 'gb2312', 'utf-16']
    for enc in encodings:
        try:
            with open(filepath, 'r', encoding=enc) as f:
                return f.read()
        except UnicodeDecodeError:
            continue
    raise Exception('无法识别文件编码')

def extract_text(filepath, file_type):
    """根据文件类型提取文字"""
    if file_type == 'pdf':
        return extract_text_from_pdf(filepath)
    elif file_type in ('docx', 'doc'):
        return extract_text_from_docx(filepath)
    elif file_type == 'txt':
        return extract_text_from_txt(filepath)
    else:
        raise Exception(f'不支持的文件类型: {file_type}')

# ========== AI题目结构化 ==========
def call_ai(messages, json_mode=True):
    """调用AI接口。json_mode=True时强制返回JSON，False时返回纯文本"""
    api_key, base_url, model = get_ai_config_full()

    if not api_key:
        raise Exception('未配置AI API Key，请点击右上角"设置"按钮配置')

    import requests

    url = f"{base_url.rstrip('/')}/chat/completions"
    headers = {
        'Content-Type': 'application/json',
        'Authorization': f'Bearer {api_key}'
    }
    data = {
        'model': model,
        'messages': messages,
        'temperature': 0.3
    }
    if json_mode:
        data['response_format'] = {'type': 'json_object'}

    response = requests.post(url, headers=headers, json=data, timeout=120)
    if response.status_code != 200:
        try:
            err_data = response.json()
            err_detail = err_data.get('error', {}).get('message', response.text)
        except:
            err_detail = response.text
        if response.status_code == 401:
            raise Exception(f'API Key无效或已过期，请在设置中检查')
        elif response.status_code == 402:
            raise Exception(f'API余额不足，请充值或更换其他AI服务')
        elif response.status_code == 429:
            raise Exception(f'API调用频率过高，请稍后重试')
        else:
            raise Exception(f'AI调用失败({response.status_code}): {err_detail}')
    
    result = response.json()
    return result['choices'][0]['message']['content']

def parse_questions_with_ai(text, title=''):
    """用AI将文本解析成结构化题目"""
    
    system_prompt = '''你是一个专业的题库解析助手。请从用户提供的文本中提取所有选择题和判断题，并转换成结构化的JSON格式。

要求：
1. 只输出JSON，不要任何解释性文字
2. JSON格式为：{"questions": [{"type": "single/multiple/truefalse", "stem": "题干", "options": ["A.xxx", "B.xxx", ...], "answer": "正确答案字母", "explanation": "解析，如果原文没有则留空"}]}
3. type字段：single=单选题，multiple=多选题，truefalse=判断题
4. 判断题的options为["正确", "错误"]，answer为"正确"或"错误"
5. 选项要完整保留原始内容
6. 如果原文有答案解析，填入explanation字段；没有则留空字符串
7. 仔细识别答案位置，可能在题干后括号中、题目末尾、或单独的答案区
8. 确保每道题的答案准确无误
9. 忽略纯文本说明、目录、页眉页脚等非题目内容'''
    
    # 文本太长的话分段处理（每次约5000字）
    chunk_size = 5000
    chunks = []
    for i in range(0, len(text), chunk_size):
        chunk = text[i:i+chunk_size]
        chunks.append(chunk)
    
    all_questions = []
    errors = []

    for i, chunk in enumerate(chunks):
        print(f'正在解析第 {i+1}/{len(chunks)} 段...')

        user_prompt = f'''请解析以下题库文本，提取所有选择题和判断题。

{chunk}

请输出JSON格式的解析结果。'''

        try:
            result_str = call_ai([
                {'role': 'system', 'content': system_prompt},
                {'role': 'user', 'content': user_prompt}
            ])
            result = json.loads(result_str)
            if 'questions' in result:
                all_questions.extend(result['questions'])
        except Exception as e:
            err_msg = str(e)
            print(f'第{i+1}段解析出错: {err_msg}')
            errors.append(f'第{i+1}段: {err_msg}')
            continue

        time.sleep(0.5)

    # 如果全部段落都失败了，抛出真实错误
    if len(all_questions) == 0 and errors:
        raise Exception(f'AI解析全部失败: {errors[0]}')

    return all_questions

# ========== 路由 ==========

@app.route('/')
def index():
    """首页"""
    return render_template('index.html')

@app.route('/quiz/<quiz_id>')
def quiz_page(quiz_id):
    """刷题页面"""
    return render_template('quiz.html', quiz_id=quiz_id)

@app.route('/wrong')
def wrong_page():
    """错题集页面"""
    return render_template('wrong.html')

@app.route('/api/upload', methods=['POST'])
def upload_file():
    """上传文件并解析"""
    if 'file' not in request.files:
        return jsonify({'error': '没有选择文件'}), 400
    
    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': '没有选择文件'}), 400
    
    if not allowed_file(file.filename):
        return jsonify({'error': '不支持的文件格式，仅支持 PDF、Word、TXT'}), 400
    
    # 保存文件
    file_id = generate_id()
    filename = secure_filename(file.filename)
    ext = filename.rsplit('.', 1)[1].lower()
    save_filename = f"{file_id}.{ext}"
    save_path = os.path.join(app.config['UPLOAD_FOLDER'], save_filename)
    file.save(save_path)
    
    file_size = os.path.getsize(save_path)
    
    # 记录文件
    conn = get_db()
    conn.execute('INSERT INTO files (id, filename, file_type, file_size, upload_time, status) VALUES (?, ?, ?, ?, ?, ?)',
                 (file_id, filename, ext, file_size, now_str(), 'parsing'))
    conn.commit()
    
    try:
        # 1. 提取文字
        print(f'开始解析文件: {filename}')
        text = extract_text(save_path, ext)
        print(f'提取文字完成，共 {len(text)} 字符')
        
        if len(text) < 50:
            raise Exception('提取的文字内容太少，可能是扫描版PDF（暂不支持）或文件内容为空')
        
        # 2. AI解析题目
        print('开始AI解析题目...')
        questions = parse_questions_with_ai(text, filename)
        print(f'解析完成，共 {len(questions)} 道题')
        
        if len(questions) == 0:
            raise Exception('未能识别出任何题目，请检查文件内容是否包含选择题/判断题')
        
        # 3. 创建试卷
        quiz_id = generate_id()
        quiz_title = request.form.get('title') or filename.rsplit('.', 1)[0]
        
        conn.execute('INSERT INTO quizzes (id, title, file_id, question_count, create_time) VALUES (?, ?, ?, ?, ?)',
                     (quiz_id, quiz_title, file_id, len(questions), now_str()))
        
        # 4. 保存题目
        for idx, q in enumerate(questions):
            q_id = generate_id()
            conn.execute('''INSERT INTO questions 
                (id, quiz_id, question_index, question_type, stem, options, answer, explanation, create_time)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)''',
                (q_id, quiz_id, idx, q.get('type', 'single'), 
                 q.get('stem', ''), 
                 json.dumps(q.get('options', []), ensure_ascii=False),
                 q.get('answer', ''),
                 q.get('explanation', ''),
                 now_str()))
        
        # 5. 更新文件状态
        conn.execute('UPDATE files SET status = ?, quiz_id = ? WHERE id = ?',
                     ('done', quiz_id, file_id))
        conn.commit()
        
        return jsonify({
            'success': True,
            'quiz_id': quiz_id,
            'title': quiz_title,
            'question_count': len(questions)
        })
        
    except Exception as e:
        print(f'解析出错: {e}')
        conn.execute('UPDATE files SET status = ?, error_msg = ? WHERE id = ?',
                     ('error', str(e), file_id))
        conn.commit()
        return jsonify({'error': str(e)}), 500
    finally:
        conn.close()

@app.route('/api/quizzes')
def get_quizzes():
    """获取所有试卷列表"""
    conn = get_db()
    quizzes = conn.execute('''
        SELECT q.*, f.filename 
        FROM quizzes q 
        LEFT JOIN files f ON q.file_id = f.id 
        ORDER BY q.create_time DESC
    ''').fetchall()
    conn.close()
    
    result = []
    for q in quizzes:
        result.append({
            'id': q['id'],
            'title': q['title'],
            'question_count': q['question_count'],
            'create_time': q['create_time'],
            'filename': q['filename']
        })
    return jsonify(result)

@app.route('/api/quiz/<quiz_id>')
def get_quiz(quiz_id):
    """获取试卷详情（所有题目）"""
    conn = get_db()
    quiz = conn.execute('SELECT * FROM quizzes WHERE id = ?', (quiz_id,)).fetchone()
    if not quiz:
        conn.close()
        return jsonify({'error': '试卷不存在'}), 404
    
    questions = conn.execute('''
        SELECT * FROM questions 
        WHERE quiz_id = ? 
        ORDER BY question_index ASC
    ''', (quiz_id,)).fetchall()
    conn.close()
    
    result = {
        'id': quiz['id'],
        'title': quiz['title'],
        'question_count': quiz['question_count'],
        'create_time': quiz['create_time'],
        'questions': []
    }
    
    for q in questions:
        result['questions'].append({
            'id': q['id'],
            'index': q['question_index'],
            'type': q['question_type'],
            'stem': q['stem'],
            'options': json.loads(q['options']),
            'answer': q['answer'],
            'explanation': q['explanation']
        })
    
    return jsonify(result)

@app.route('/api/files')
def get_files():
    """获取上传文件列表"""
    conn = get_db()
    files = conn.execute('SELECT * FROM files ORDER BY upload_time DESC').fetchall()
    conn.close()
    
    result = []
    for f in files:
        result.append({
            'id': f['id'],
            'filename': f['filename'],
            'file_type': f['file_type'],
            'file_size': f['file_size'],
            'upload_time': f['upload_time'],
            'status': f['status'],
            'quiz_id': f['quiz_id'],
            'error_msg': f['error_msg']
        })
    return jsonify(result)

@app.route('/api/quiz/<quiz_id>/delete', methods=['POST'])
def delete_quiz(quiz_id):
    """删除试卷"""
    conn = get_db()
    quiz = conn.execute('SELECT * FROM quizzes WHERE id = ?', (quiz_id,)).fetchone()
    if not quiz:
        conn.close()
        return jsonify({'error': '试卷不存在'}), 404

    # 删除题目
    conn.execute('DELETE FROM questions WHERE quiz_id = ?', (quiz_id,))
    # 删除答题记录
    conn.execute('DELETE FROM answer_records WHERE quiz_id = ?', (quiz_id,))
    # 删除进度
    conn.execute('DELETE FROM quiz_progress WHERE quiz_id = ?', (quiz_id,))
    # 删除试卷
    conn.execute('DELETE FROM quizzes WHERE id = ?', (quiz_id,))

    # 如果有关联文件，更新文件状态
    if quiz['file_id']:
        conn.execute('UPDATE files SET quiz_id = NULL, status = ? WHERE id = ?',
                     ('done', quiz['file_id']))

    conn.commit()
    conn.close()
    return jsonify({'success': True})

@app.route('/api/file/<file_id>/delete', methods=['POST'])
def delete_file(file_id):
    """删除上传文件记录"""
    conn = get_db()
    f = conn.execute('SELECT * FROM files WHERE id = ?', (file_id,)).fetchone()
    if not f:
        conn.close()
        return jsonify({'error': '文件不存在'}), 404

    # 如果有关联试卷，也删除
    if f['quiz_id']:
        conn.execute('DELETE FROM questions WHERE quiz_id = ?', (f['quiz_id'],))
        conn.execute('DELETE FROM answer_records WHERE quiz_id = ?', (f['quiz_id'],))
        conn.execute('DELETE FROM quiz_progress WHERE quiz_id = ?', (f['quiz_id'],))
        conn.execute('DELETE FROM quizzes WHERE id = ?', (f['quiz_id'],))

    # 删除物理文件
    if f['file_type']:
        safe_name = f"{file_id}.{f['file_type']}"
        file_path = os.path.join(app.config['UPLOAD_FOLDER'], safe_name)
        if os.path.exists(file_path):
            try:
                os.remove(file_path)
            except:
                pass

    conn.execute('DELETE FROM files WHERE id = ?', (file_id,))
    conn.commit()
    conn.close()
    return jsonify({'success': True})

@app.route('/api/answer', methods=['POST'])
def record_answer():
    """记录答题结果"""
    data = request.json
    record_id = generate_id()
    
    conn = get_db()
    conn.execute('''INSERT INTO answer_records 
        (id, quiz_id, question_id, user_answer, is_correct, answer_time)
        VALUES (?, ?, ?, ?, ?, ?)''',
        (record_id, data.get('quiz_id'), data.get('question_id'),
         data.get('user_answer'), 1 if data.get('is_correct') else 0,
         now_str()))
    conn.commit()
    conn.close()
    
    return jsonify({'success': True})

@app.route('/api/progress/<quiz_id>', methods=['GET', 'POST'])
def quiz_progress(quiz_id):
    """获取或保存答题进度"""
    if request.method == 'GET':
        conn = get_db()
        row = conn.execute('SELECT * FROM quiz_progress WHERE quiz_id = ?', (quiz_id,)).fetchone()
        conn.close()
        if row:
            return jsonify({
                'current_index': row['current_index'],
                'answered': json.loads(row['answered_json']),
                'user_answers': json.loads(row['answers_json']),
                'marked': json.loads(row['marked_json']) if row['marked_json'] else [],
                'updated_time': row['updated_time']
            })
        return jsonify({'current_index': 0, 'answered': [], 'user_answers': [], 'marked': []})
    
    # POST: 保存进度
    data = request.json
    conn = get_db()
    conn.execute('''INSERT OR REPLACE INTO quiz_progress
        (id, quiz_id, current_index, answered_json, answers_json, marked_json, updated_time)
        VALUES (?, ?, ?, ?, ?, ?, ?)''',
        (generate_id(), quiz_id, data.get('current_index', 0),
         json.dumps(data.get('answered', [])),
         json.dumps(data.get('user_answers', [])),
         json.dumps(data.get('marked', [])),
         now_str()))
    conn.commit()
    conn.close()
    return jsonify({'success': True})

@app.route('/api/wrong_questions')
def wrong_questions():
    """获取所有错题"""
    conn = get_db()
    # 每道题取最新一条答题记录
    wrongs = conn.execute('''
        SELECT ar.*, q.stem, q.options, q.answer, q.explanation, q.question_type,
               q.question_index, qz.title as quiz_title
        FROM answer_records ar
        JOIN questions q ON ar.question_id = q.id
        JOIN quizzes qz ON ar.quiz_id = qz.id
        WHERE ar.is_correct = 0
        GROUP BY ar.question_id
        ORDER BY ar.answer_time DESC
    ''').fetchall()
    conn.close()
    
    result = []
    for w in wrongs:
        result.append({
            'question_id': w['question_id'],
            'quiz_id': w['quiz_id'],
            'quiz_title': w['quiz_title'],
            'question_index': w['question_index'],
            'type': w['question_type'],
            'stem': w['stem'],
            'options': json.loads(w['options']),
            'answer': w['answer'],
            'explanation': w['explanation'],
            'user_answer': w['user_answer'],
            'answer_time': w['answer_time']
        })
    return jsonify(result)

@app.route('/api/generate_explanation', methods=['POST'])
def generate_explanation():
    """AI生成题目解析"""
    data = request.json
    question_id = data.get('question_id')
    
    conn = get_db()
    q = conn.execute('SELECT * FROM questions WHERE id = ?', (question_id,)).fetchone()
    conn.close()
    
    if not q:
        return jsonify({'error': '题目不存在'}), 404
    
    # 如果已有解析，直接返回
    if q['explanation'] and len(q['explanation']) > 10:
        return jsonify({'explanation': q['explanation']})
    
    try:
        # AI生成解析
        options = json.loads(q['options'])
        options_text = '\n'.join(options)
        
        prompt = f'''请为以下题目生成一段简洁清晰的答案解析，说明为什么正确答案是对的，以及其他选项错在哪里。

题目：{q['stem']}
选项：
{options_text}
正确答案：{q['answer']}

请直接输出解析内容，不要加"解析："等前缀。'''
        
        result = call_ai([
            {'role': 'user', 'content': prompt}
        ], json_mode=False)
        
        # 保存解析到数据库
        conn = get_db()
        conn.execute('UPDATE questions SET explanation = ? WHERE id = ?',
                     (result, question_id))
        conn.commit()
        conn.close()
        
        return jsonify({'explanation': result})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/ai_config', methods=['GET', 'POST'])
def ai_config():
    """读取或保存AI配置"""
    if request.method == 'GET':
        api_key, base_url, model = get_ai_config_full()
        masked_key = ''
        if api_key:
            if len(api_key) <= 8:
                masked_key = '*' * len(api_key)
            else:
                masked_key = api_key[:4] + '*' * (len(api_key) - 8) + api_key[-4:]
        return jsonify({
            'configured': bool(api_key),
            'api_key_masked': masked_key,
            'base_url': base_url,
            'model': model
        })
    
    # POST: 保存配置
    data = request.json
    if 'api_key' in data and data['api_key']:
        save_config('ai_api_key', data['api_key'])
    if 'base_url' in data and data['base_url']:
        save_config('ai_base_url', data['base_url'])
    if 'model' in data and data['model']:
        save_config('ai_model', data['model'])
    
    return jsonify({'success': True})

# ========== 初始化数据库 ==========
init_db()

# ========== 启动 ==========
if __name__ == '__main__':
    api_key, _, _ = get_ai_config_full()
    print('=' * 50)
    print('  刷题神器 启动成功！')
    port = int(os.environ.get('PORT', 5000))
    print(f'  访问地址: http://localhost:{port}')
    if not api_key:
        print('  提示: 未配置AI，可在网页右上角"设置"按钮中配置')
    print('=' * 50)
    app.run(debug=True, host='0.0.0.0', port=port)
