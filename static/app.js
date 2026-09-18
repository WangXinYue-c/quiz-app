// ========== 首页逻辑 ==========

let selectedFile = null;

// DOM元素
const uploadArea = document.getElementById('uploadArea');
const fileInput = document.getElementById('fileInput');
const uploadOptions = document.getElementById('uploadOptions');
const selectedFileName = document.getElementById('selectedFileName');
const changeFileBtn = document.getElementById('changeFileBtn');
const uploadBtn = document.getElementById('uploadBtn');
const uploadBtnText = document.getElementById('uploadBtnText');
const quizTitleInput = document.getElementById('quizTitle');
const progressContainer = document.getElementById('progressContainer');
const progressText = document.getElementById('progressText');
const aiWarning = document.getElementById('aiWarning');
const quizList = document.getElementById('quizList');
const quizCount = document.getElementById('quizCount');
const fileList = document.getElementById('fileList');
const refreshBtn = document.getElementById('refreshBtn');
const settingsBtn = document.getElementById('settingsBtn');
const settingsModal = document.getElementById('settingsModal');
const closeSettingsBtn = document.getElementById('closeSettingsBtn');
const settingsApiKey = document.getElementById('settingsApiKey');
const settingsBaseUrl = document.getElementById('settingsBaseUrl');
const settingsModel = document.getElementById('settingsModel');
const settingsKeyHint = document.getElementById('settingsKeyHint');
const saveSettingsBtn = document.getElementById('saveSettingsBtn');

// 预设配置
const PRESETS = {
    deepseek: { base_url: 'https://api.deepseek.com/v1', model: 'deepseek-chat' },
    openai: { base_url: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
    qwen: { base_url: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen-plus' },
    kimi: { base_url: 'https://api.moonshot.cn/v1', model: 'moonshot-v1-8k' }
};

// 初始化
document.addEventListener('DOMContentLoaded', () => {
    checkAIConfig();
    loadQuizzes();
    loadFiles();
    initUpload();
    initSettings();
});

// 检查AI配置
function checkAIConfig() {
    fetch('/api/ai_config')
        .then(res => res.json())
        .then(data => {
            if (!data.configured) {
                aiWarning.style.display = 'block';
            } else {
                aiWarning.style.display = 'none';
            }
        })
        .catch(() => {});
}

// 初始化设置弹窗
function initSettings() {
    settingsBtn.addEventListener('click', openSettings);
    closeSettingsBtn.addEventListener('click', closeSettings);
    saveSettingsBtn.addEventListener('click', saveSettings);

    // 点击遮罩关闭
    settingsModal.addEventListener('click', (e) => {
        if (e.target === settingsModal) closeSettings();
    });

    // 预设按钮
    document.querySelectorAll('.btn-preset').forEach(btn => {
        btn.addEventListener('click', () => {
            const preset = PRESETS[btn.dataset.preset];
            if (preset) {
                settingsBaseUrl.value = preset.base_url;
                settingsModel.value = preset.model;
            }
        });
    });
}

// 打开设置
function openSettings() {
    // 加载当前配置
    fetch('/api/ai_config')
        .then(res => res.json())
        .then(data => {
            settingsApiKey.value = '';
            settingsKeyHint.textContent = '';
            settingsBaseUrl.value = data.base_url || 'https://api.deepseek.com/v1';
            settingsModel.value = data.model || 'deepseek-chat';
            if (data.configured) {
                settingsKeyHint.textContent = '当前已配置: ' + data.api_key_masked + '（留空则不修改）';
            }
            settingsModal.style.display = 'flex';
        })
        .catch(() => {
            settingsModal.style.display = 'flex';
        });
}

// 关闭设置
function closeSettings() {
    settingsModal.style.display = 'none';
}

// 保存设置
function saveSettings() {
    const payload = {
        base_url: settingsBaseUrl.value.trim(),
        model: settingsModel.value.trim()
    };
    // API Key 留空表示不修改
    if (settingsApiKey.value.trim()) {
        payload.api_key = settingsApiKey.value.trim();
    }

    saveSettingsBtn.disabled = true;
    saveSettingsBtn.textContent = '保存中...';

    fetch('/api/ai_config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            closeSettings();
            checkAIConfig();
            alert('配置保存成功！');
        } else {
            throw new Error(data.error || '保存失败');
        }
    })
    .catch(err => {
        alert('保存失败: ' + err.message);
    })
    .finally(() => {
        saveSettingsBtn.disabled = false;
        saveSettingsBtn.textContent = '保存配置';
    });
}

// 初始化上传
function initUpload() {
    // 点击上传区域
    uploadArea.addEventListener('click', () => {
        fileInput.click();
    });

    // 选择文件
    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            handleFileSelect(e.target.files[0]);
        }
    });

    // 拖拽上传
    uploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadArea.classList.add('dragover');
    });

    uploadArea.addEventListener('dragleave', () => {
        uploadArea.classList.remove('dragover');
    });

    uploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadArea.classList.remove('dragover');
        if (e.dataTransfer.files.length > 0) {
            handleFileSelect(e.dataTransfer.files[0]);
        }
    });

    // 更换文件
    changeFileBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        fileInput.click();
    });

    // 上传按钮
    uploadBtn.addEventListener('click', uploadFile);

    // 刷新按钮
    refreshBtn.addEventListener('click', loadFiles);
}

// 处理文件选择
function handleFileSelect(file) {
    const allowedTypes = ['pdf', 'docx', 'doc', 'txt'];
    const ext = file.name.split('.').pop().toLowerCase();
    
    if (!allowedTypes.includes(ext)) {
        alert('不支持的文件格式，请上传 PDF、Word 或 TXT 文件');
        return;
    }

    selectedFile = file;
    selectedFileName.textContent = `${file.name} (${formatFileSize(file.size)})`;
    uploadArea.style.display = 'none';
    uploadOptions.style.display = 'block';
}

// 格式化文件大小
function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

// 上传文件
function uploadFile() {
    if (!selectedFile) return;

    const formData = new FormData();
    formData.append('file', selectedFile);
    formData.append('title', quizTitleInput.value.trim());

    uploadBtn.disabled = true;
    uploadBtnText.textContent = '解析中...';
    progressContainer.style.display = 'block';
    progressText.textContent = '正在上传并解析，请稍候...';

    const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('请求超时（服务器响应超过5分钟，可能是免费版资源不足）')), 300000)
    );

    Promise.race([
        fetch('/api/upload', {
            method: 'POST',
            body: formData
        }),
        timeoutPromise
    ])
    .then(res => {
        const contentType = res.headers.get('content-type') || '';
        if (!contentType.includes('application/json')) {
            return res.text().then(text => {
                throw new Error('服务器返回了非JSON响应（可能是内存不足导致崩溃），请稍后重试');
            });
        }
        return res.json();
    })
    .then(data => {
        if (data.success) {
            progressText.textContent = `解析完成！共 ${data.question_count} 道题`;
            uploadBtnText.textContent = '开始刷题';
            uploadBtn.onclick = () => {
                window.location.href = `/quiz/${data.quiz_id}`;
            };

            // 刷新列表
            loadQuizzes();
            loadFiles();
        } else {
            throw new Error(data.error || '解析失败');
        }
    })
    .catch(err => {
        progressContainer.style.display = 'none';
        uploadBtn.disabled = false;
        uploadBtnText.textContent = '开始解析';
        alert('解析失败：' + err.message);
        loadFiles(); // 刷新文件列表查看状态
    });
}

// 加载试卷列表
function loadQuizzes() {
    fetch('/api/quizzes')
        .then(res => res.json())
        .then(quizzes => {
            quizCount.textContent = `${quizzes.length} 套`;

            if (quizzes.length === 0) {
                quizList.innerHTML = `
                    <div class="empty-state">
                        <p>还没有试卷，上传一份题库开始吧！</p>
                    </div>
                `;
                return;
            }

            // 并行获取每套试卷的进度
            const progressPromises = quizzes.map(q =>
                fetch('/api/progress/' + q.id).then(res => res.json()).catch(() => null)
            );

            Promise.all(progressPromises).then(progresses => {
                quizList.innerHTML = quizzes.map((q, i) => {
                    const prog = progresses[i];
                    const answeredCount = prog && prog.answered ? prog.answered.filter(a => a).length : 0;
                    const hasProgress = answeredCount > 0 && answeredCount < q.question_count;
                    const isComplete = answeredCount >= q.question_count && answeredCount > 0;

                    let actionBtn;
                    if (hasProgress) {
                        actionBtn = `<button class="btn btn-primary btn-small" onclick="startQuiz('${q.id}')">继续答题 (${answeredCount}/${q.question_count})</button>`;
                    } else if (isComplete) {
                        actionBtn = `<button class="btn btn-primary btn-small" onclick="startQuiz('${q.id}')">重新答题</button>`;
                    } else {
                        actionBtn = `<button class="btn btn-primary btn-small" onclick="startQuiz('${q.id}')">开始答题</button>`;
                    }

                    return `
                    <div class="quiz-item">
                        <div class="quiz-item-info">
                            <div class="quiz-item-title">${escapeHtml(q.title)}</div>
                            <div class="quiz-item-meta">
                                ${q.question_count} 道题 · ${q.create_time}
                            </div>
                        </div>
                        <div class="quiz-item-actions">
                            ${actionBtn}
                            <button class="btn btn-secondary btn-small" onclick="deleteQuiz('${q.id}')">删除</button>
                        </div>
                    </div>
                    `;
                }).join('');
            });
        })
        .catch(err => {
            console.error('加载试卷列表失败:', err);
        });
}

// 加载文件列表
function loadFiles() {
    fetch('/api/files')
        .then(res => res.json())
        .then(files => {
            if (files.length === 0) {
                fileList.innerHTML = `
                    <div class="empty-state">
                        <p>暂无上传记录</p>
                    </div>
                `;
                return;
            }

            fileList.innerHTML = files.map(f => {
                const statusMap = {
                    'pending': { text: '等待中', class: 'status-pending' },
                    'parsing': { text: '解析中', class: 'status-parsing' },
                    'done': { text: '已完成', class: 'status-done' },
                    'error': { text: '失败', class: 'status-error' }
                };
                const status = statusMap[f.status] || { text: f.status, class: '' };

                let actionBtn = '';
                if (f.status === 'done' && f.quiz_id) {
                    actionBtn = `<button class="btn btn-primary btn-small" onclick="startQuiz('${f.quiz_id}')">刷题</button>`;
                }
                // 所有文件都加删除按钮
                actionBtn += `<button class="btn btn-danger btn-small" onclick="deleteFile('${f.id}')" title="删除">删除</button>`;

                return `
                    <div class="file-item">
                        <span class="file-item-name" title="${escapeHtml(f.filename)}">${escapeHtml(f.filename)}</span>
                        <span class="file-item-status ${status.class}">${status.text}</span>
                        <span class="file-item-time">${f.upload_time}</span>
                        ${actionBtn}
                    </div>
                `;
            }).join('');
        })
        .catch(err => {
            console.error('加载文件列表失败:', err);
        });
}

// 开始答题
function startQuiz(quizId) {
    window.location.href = `/quiz/${quizId}`;
}

// 删除试卷
function deleteQuiz(quizId) {
    if (!confirm('确定要删除这套试卷吗？删除后无法恢复。')) return;

    fetch(`/api/quiz/${quizId}/delete`, {
        method: 'POST'
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            loadQuizzes();
            loadFiles();
        } else {
            alert('删除失败：' + (data.error || '未知错误'));
        }
    })
    .catch(err => {
        alert('删除失败：' + err.message);
    });
}

// 删除文件
function deleteFile(fileId) {
    if (!confirm('确定要删除这个文件吗？关联的试卷也会一起删除。')) return;

    fetch(`/api/file/${fileId}/delete`, {
        method: 'POST'
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            loadQuizzes();
            loadFiles();
        } else {
            alert('删除失败：' + (data.error || '未知错误'));
        }
    })
    .catch(err => {
        alert('删除失败：' + err.message);
    });
}

// HTML转义
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
