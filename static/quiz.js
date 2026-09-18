// ========== 刷题页面逻辑 ==========

let quizData = null;
let currentIndex = 0;
let userAnswers = []; // 记录用户答案
let answered = []; // 记录哪些题已作答

// DOM元素
const quizTitleEl = document.getElementById('quizTitle');
const currentNumEl = document.getElementById('currentNum');
const totalNumEl = document.getElementById('totalNum');
const progressFill = document.getElementById('progressFill');
const questionTypeEl = document.getElementById('questionType');
const questionNumberEl = document.getElementById('questionNumber');
const questionStemEl = document.getElementById('questionStem');
const optionsListEl = document.getElementById('optionsList');
const resultFeedback = document.getElementById('resultFeedback');
const resultIcon = document.getElementById('resultIcon');
const resultText = document.getElementById('resultText');
const explanationSection = document.getElementById('explanationSection');
const explanationContent = document.getElementById('explanationContent');
const genExplanationBtn = document.getElementById('genExplanationBtn');
const prevBtn = document.getElementById('prevBtn');
const nextBtn = document.getElementById('nextBtn');
const completeModal = document.getElementById('completeModal');
const scoreNum = document.getElementById('scoreNum');
const totalQuestionsEl = document.getElementById('totalQuestions');
const correctCountEl = document.getElementById('correctCount');
const wrongCountEl = document.getElementById('wrongCount');
const restartBtn = document.getElementById('restartBtn');

// 初始化
document.addEventListener('DOMContentLoaded', () => {
    loadQuiz();
    
    prevBtn.addEventListener('click', prevQuestion);
    nextBtn.addEventListener('click', nextQuestion);
    restartBtn.addEventListener('click', restartQuiz);
    genExplanationBtn.addEventListener('click', generateExplanation);
});

// 加载试卷
function loadQuiz() {
    fetch(`/api/quiz/${window.QUIZ_ID}`)
        .then(res => res.json())
        .then(data => {
            if (data.error) {
                alert(data.error);
                window.location.href = '/';
                return;
            }
            
            quizData = data;
            userAnswers = new Array(data.questions.length).fill(null);
            answered = new Array(data.questions.length).fill(false);
            
            quizTitleEl.textContent = data.title;
            totalNumEl.textContent = data.questions.length;
            
            renderQuestion(0);
        })
        .catch(err => {
            console.error('加载试卷失败:', err);
            alert('加载试卷失败，请稍后重试');
        });
}

// 渲染题目
function renderQuestion(index) {
    if (!quizData || !quizData.questions[index]) return;
    
    currentIndex = index;
    const q = quizData.questions[index];
    
    // 更新进度
    currentNumEl.textContent = index + 1;
    const progress = ((index + 1) / quizData.questions.length) * 100;
    progressFill.style.width = progress + '%';
    
    // 题型标签
    const typeMap = {
        'single': '单选题',
        'multiple': '多选题',
        'truefalse': '判断题'
    };
    questionTypeEl.textContent = typeMap[q.type] || '选择题';
    questionNumberEl.textContent = `第 ${index + 1} 题`;
    
    // 题干
    questionStemEl.textContent = q.stem;
    
    // 渲染选项
    renderOptions(q);
    
    // 如果已经答过，显示结果
    if (answered[index]) {
        showResult(q, userAnswers[index]);
    } else {
        hideResult();
    }
    
    // 更新按钮状态
    prevBtn.disabled = index === 0;
    nextBtn.disabled = false;
    
    if (index === quizData.questions.length - 1 && answered[index]) {
        nextBtn.textContent = '查看成绩';
    } else if (index === quizData.questions.length - 1) {
        nextBtn.textContent = '提交答卷';
    } else {
        nextBtn.textContent = '下一题';
    }
}

// 渲染选项
function renderOptions(q) {
    const isAnswered = answered[currentIndex];
    const userAnswer = userAnswers[currentIndex] || '';
    const correctAnswer = q.answer;
    
    let optionsHtml = '';
    
    q.options.forEach((opt, idx) => {
        // 提取选项标签（A/B/C/D 或 正确/错误）
        let label = '';
        let text = opt;
        
        if (q.type === 'truefalse') {
            label = ['√', '×'][idx] || (idx === 0 ? '√' : '×');
            text = opt;
        } else {
            // 尝试匹配 A. xxx 格式
            const match = opt.match(/^([A-ZＡ-Ｚ])[\.．、\s]+(.+)$/);
            if (match) {
                label = match[1];
                text = match[2];
            } else {
                label = String.fromCharCode(65 + idx); // A, B, C, D...
            }
        }
        
        let classes = 'option-item';
        
        if (isAnswered) {
            classes += ' disabled';
            
            // 判断是否是正确答案
            const isCorrectOpt = isCorrectOption(label, correctAnswer, q.type);
            const isUserOpt = isUserSelected(label, userAnswer, q.type);
            
            if (isCorrectOpt) {
                classes += ' correct';
            } else if (isUserOpt && !isCorrectOpt) {
                classes += ' wrong';
            }
        } else if (isUserSelected(label, userAnswer, q.type)) {
            classes += ' selected';
        }
        
        optionsHtml += `
            <div class="${classes}" data-label="${label}" onclick="selectOption('${label}')">
                <span class="option-label">${label}.</span>
                <span class="option-text">${escapeHtml(text)}</span>
            </div>
        `;
    });
    
    optionsListEl.innerHTML = optionsHtml;
}

// 判断选项是否是正确答案
function isCorrectOption(label, answer, type) {
    if (type === 'truefalse') {
        // 判断题：answer是"正确"或"错误"
        if (label === '√') return answer === '正确' || answer === '对' || answer === '√';
        if (label === '×') return answer === '错误' || answer === '错' || answer === '×';
        return false;
    }
    // 单选/多选
    return answer && answer.toUpperCase().includes(label.toUpperCase());
}

// 判断用户是否选择了该选项
function isUserSelected(label, userAnswer, type) {
    if (!userAnswer) return false;
    
    if (type === 'truefalse') {
        if (label === '√') return userAnswer === '正确' || userAnswer === '对' || userAnswer === '√';
        if (label === '×') return userAnswer === '错误' || userAnswer === '错' || userAnswer === '×';
        return false;
    }
    
    return userAnswer.toUpperCase().includes(label.toUpperCase());
}

// 选择选项
function selectOption(label) {
    if (answered[currentIndex]) return; // 已答过的不能再改
    
    const q = quizData.questions[currentIndex];
    
    if (q.type === 'multiple') {
        // 多选题：切换选中状态
        let current = userAnswers[currentIndex] || '';
        if (current.includes(label)) {
            current = current.replace(label, '');
        } else {
            current += label;
            // 排序
            current = current.split('').sort().join('');
        }
        userAnswers[currentIndex] = current;
    } else {
        // 单选/判断：直接选中并提交答案
        userAnswers[currentIndex] = label;
        submitAnswer(label);
        return;
    }
    
    renderOptions(q);
    
    // 多选有选择后启用提交（这里简化为选择后自动判断是否要提交按钮）
    // 对于多选题，我们需要一个提交按钮，或者在下一题时自动提交
    // 简化处理：选择后自动提交
    if (userAnswers[currentIndex] && userAnswers[currentIndex].length > 0) {
        // 延迟一下，让用户看到选中效果
        setTimeout(() => {
            submitAnswer(userAnswers[currentIndex]);
        }, 300);
    }
}

// 提交答案
function submitAnswer(userAnswer) {
    if (answered[currentIndex]) return;
    
    const q = quizData.questions[currentIndex];
    answered[currentIndex] = true;
    
    // 判断是否正确
    const isCorrect = checkAnswer(userAnswer, q.answer, q.type);
    
    // 记录答题结果
    fetch('/api/answer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            quiz_id: window.QUIZ_ID,
            question_id: q.id,
            user_answer: userAnswer,
            is_correct: isCorrect
        })
    }).catch(err => console.error('记录答题失败:', err));
    
    // 显示结果
    showResult(q, userAnswer);
    renderOptions(q);
}

// 检查答案是否正确
function checkAnswer(userAnswer, correctAnswer, type) {
    if (!userAnswer || !correctAnswer) return false;
    
    if (type === 'truefalse') {
        // 判断题
        const userIsTrue = userAnswer === '正确' || userAnswer === '对' || userAnswer === '√';
        const correctIsTrue = correctAnswer === '正确' || correctAnswer === '对' || correctAnswer === '√' || correctAnswer === 'T' || correctAnswer === 'True';
        return userIsTrue === correctIsTrue;
    }
    
    // 单选/多选：比较字母
    const userSet = new Set(userAnswer.toUpperCase().replace(/[^A-Z]/g, '').split(''));
    const correctSet = new Set(correctAnswer.toUpperCase().replace(/[^A-Z]/g, '').split(''));
    
    if (userSet.size !== correctSet.size) return false;
    for (const item of userSet) {
        if (!correctSet.has(item)) return false;
    }
    return true;
}

// 显示结果
function showResult(q, userAnswer) {
    const isCorrect = checkAnswer(userAnswer, q.answer, q.type);
    
    resultFeedback.style.display = 'flex';
    resultFeedback.className = 'result-feedback ' + (isCorrect ? 'correct' : 'wrong');
    resultIcon.textContent = isCorrect ? '✓' : '✗';
    
    if (isCorrect) {
        resultText.textContent = '回答正确！';
    } else {
        resultText.textContent = `回答错误，正确答案是：${q.answer}`;
    }
    
    // 显示解析
    if (q.explanation && q.explanation.trim()) {
        explanationSection.style.display = 'block';
        explanationContent.textContent = q.explanation;
        genExplanationBtn.style.display = 'none';
    } else {
        explanationSection.style.display = 'block';
        explanationContent.textContent = '暂无解析，点击按钮AI生成';
        genExplanationBtn.style.display = 'inline-block';
        genExplanationBtn.dataset.questionId = q.id;
    }
}

// 隐藏结果
function hideResult() {
    resultFeedback.style.display = 'none';
    explanationSection.style.display = 'none';
}

// AI生成解析
function generateExplanation() {
    const questionId = genExplanationBtn.dataset.questionId;
    if (!questionId) return;
    
    genExplanationBtn.disabled = true;
    genExplanationBtn.textContent = '生成中...';
    explanationContent.textContent = 'AI正在生成解析，请稍候...';
    
    fetch('/api/generate_explanation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question_id: questionId })
    })
    .then(res => res.json())
    .then(data => {
        if (data.explanation) {
            explanationContent.textContent = data.explanation;
            genExplanationBtn.style.display = 'none';
            
            // 更新本地数据
            quizData.questions[currentIndex].explanation = data.explanation;
        } else {
            throw new Error(data.error || '生成失败');
        }
    })
    .catch(err => {
        explanationContent.textContent = '生成失败：' + err.message;
        genExplanationBtn.disabled = false;
        genExplanationBtn.textContent = 'AI生成解析';
    });
}

// 上一题
function prevQuestion() {
    if (currentIndex > 0) {
        renderQuestion(currentIndex - 1);
    }
}

// 下一题
function nextQuestion() {
    if (currentIndex < quizData.questions.length - 1) {
        renderQuestion(currentIndex + 1);
    } else {
        // 最后一题，显示成绩
        showScore();
    }
}

// 显示成绩
function showScore() {
    const total = quizData.questions.length;
    let correct = 0;
    
    for (let i = 0; i < total; i++) {
        if (answered[i]) {
            const q = quizData.questions[i];
            if (checkAnswer(userAnswers[i], q.answer, q.type)) {
                correct++;
            }
        }
    }
    
    const score = Math.round((correct / total) * 100);
    const wrong = total - correct;
    
    scoreNum.textContent = score;
    totalQuestionsEl.textContent = total;
    correctCountEl.textContent = correct;
    wrongCountEl.textContent = wrong;
    
    completeModal.style.display = 'flex';
}

// 重新答题
function restartQuiz() {
    userAnswers = new Array(quizData.questions.length).fill(null);
    answered = new Array(quizData.questions.length).fill(false);
    completeModal.style.display = 'none';
    renderQuestion(0);
}

// HTML转义
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
