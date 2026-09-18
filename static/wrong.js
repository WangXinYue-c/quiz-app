// ========== 错题集逻辑 ==========

document.addEventListener('DOMContentLoaded', loadWrongQuestions);

function loadWrongQuestions() {
    fetch('/api/wrong_questions')
        .then(res => res.json())
        .then(data => {
            const wrongCountEl = document.getElementById('wrongCount');
            const listEl = document.getElementById('wrongList');

            wrongCountEl.textContent = data.length;

            if (data.length === 0) {
                listEl.innerHTML = `
                    <div class="empty-state" style="padding:60px 20px;">
                        <p style="font-size:48px;margin-bottom:16px;">🎉</p>
                        <p>还没有错题，继续加油！</p>
                    </div>
                `;
                return;
            }

            const typeMap = {
                'single': '单选题',
                'multiple': '多选题',
                'truefalse': '判断题'
            };

            listEl.innerHTML = data.map((q, idx) => {
                let optionsHtml = '';
                q.options.forEach((opt, i) => {
                    let label = '';
                    let text = opt;

                    if (q.type === 'truefalse') {
                        label = ['√', '×'][i] || (i === 0 ? '√' : '×');
                    } else {
                        const match = opt.match(/^([A-ZＡ-Ｚ])[\.．、\s]+(.+)$/);
                        if (match) {
                            label = match[1];
                            text = match[2];
                        } else {
                            label = String.fromCharCode(65 + i);
                        }
                    }

                    const isCorrect = q.answer && q.answer.toUpperCase().includes(label.toUpperCase());
                    const isUser = q.user_answer && q.user_answer.toUpperCase().includes(label.toUpperCase());

                    let cls = 'option-item disabled';
                    if (isCorrect) cls += ' correct';
                    else if (isUser) cls += ' wrong';

                    optionsHtml += `
                        <div class="${cls}">
                            <span class="option-label">${label}.</span>
                            <span class="option-text">${escapeHtml(text)}</span>
                        </div>
                    `;
                }).join('');

                let explanationHtml = '';
                if (q.explanation && q.explanation.trim()) {
                    explanationHtml = `
                        <div class="explanation-section" style="display:block;">
                            <div class="explanation-header"><span>解析</span></div>
                            <div class="explanation-content">${escapeHtml(q.explanation)}</div>
                        </div>
                    `;
                }

                return `
                    <div class="card question-card" style="margin-bottom:16px;">
                        <div class="question-meta">
                            <span class="question-type">${typeMap[q.type] || '选择题'}</span>
                            <span class="question-number">第 ${q.question_index + 1} 题 · ${escapeHtml(q.quiz_title)}</span>
                        </div>
                        <div class="question-stem">${escapeHtml(q.stem)}</div>
                        <div class="options-list">${optionsHtml}</div>
                        <div class="result-feedback wrong" style="display:flex;margin-top:16px;">
                            <div class="result-icon">✗</div>
                            <div class="result-text">你的答案：${escapeHtml(q.user_answer || '未作答')} | 正确答案：${escapeHtml(q.answer)}</div>
                        </div>
                        ${explanationHtml}
                    </div>
                `;
            }).join('');
        })
        .catch(err => {
            console.error('加载错题失败:', err);
        });
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
