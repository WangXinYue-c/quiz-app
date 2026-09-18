// ========== 刷题页面逻辑 ==========

let quizData = null;
let currentIndex = 0;
let userAnswers = [];
let answered = [];
let marked = []; // 标注的题目
let quizMode = 'quiz'; // quiz=模拟模式, study=背题模式
let progressLoaded = false;

// DOM
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
const studyAnswerSection = document.getElementById('studyAnswerSection');
const studyAnswerText = document.getElementById('studyAnswerText');
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
const gridBtn = document.getElementById('gridBtn');
const gridModal = document.getElementById('gridModal');
const closeGridBtn = document.getElementById('closeGridBtn');
const questionGrid = document.getElementById('questionGrid');
const markBtn = document.getElementById('markBtn');
const modeQuizBtn = document.getElementById('modeQuizBtn');
const modeStudyBtn = document.getElementById('modeStudyBtn');

document.addEventListener('DOMContentLoaded', () => {
    loadQuiz();
    prevBtn.addEventListener('click', prevQuestion);
    nextBtn.addEventListener('click', nextQuestion);
    restartBtn.addEventListener('click', restartQuiz);
    genExplanationBtn.addEventListener('click', generateExplanation);
    gridBtn.addEventListener('click', () => { renderGrid(); gridModal.style.display = 'flex'; });
    closeGridBtn.addEventListener('click', () => gridModal.style.display = 'none');
    gridModal.addEventListener('click', e => { if (e.target === gridModal) gridModal.style.display = 'none'; });
    markBtn.addEventListener('click', toggleMark);
    modeQuizBtn.addEventListener('click', () => switchMode('quiz'));
    modeStudyBtn.addEventListener('click', () => switchMode('study'));
    window.addEventListener('beforeunload', saveProgress);
});

function saveProgress() {
    if (!quizData) return;
    fetch('/api/progress/' + window.QUIZ_ID, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            current_index: currentIndex,
            answered: answered,
            user_answers: userAnswers,
            marked: marked
        })
    }).catch(() => {});
}

function loadQuiz() {
    fetch(`/api/quiz/${window.QUIZ_ID}`)
        .then(res => res.json())
        .then(data => {
            if (data.error) { alert(data.error); window.location.href = '/'; return; }
            quizData = data;
            userAnswers = new Array(data.questions.length).fill(null);
            answered = new Array(data.questions.length).fill(false);
            marked = new Array(data.questions.length).fill(false);
            quizTitleEl.textContent = data.title;
            totalNumEl.textContent = data.questions.length;

            fetch('/api/progress/' + window.QUIZ_ID)
                .then(res => res.json())
                .then(progress => {
                    if (progress.answered && progress.answered.length > 0) {
                        const answeredCount = progress.answered.filter(a => a).length;
                        if (answeredCount > 0) {
                            answered = progress.answered.concat(new Array(data.questions.length - progress.answered.length).fill(false));
                            userAnswers = (progress.user_answers || []).concat(new Array(data.questions.length - (progress.user_answers||[]).length).fill(null));
                            marked = (progress.marked || []).concat(new Array(data.questions.length - (progress.marked||[]).length).fill(false));
                            const resumeIndex = Math.min(progress.current_index || 0, data.questions.length - 1);
                            renderQuestion(resumeIndex);
                            showResumeToast(answeredCount);
                            progressLoaded = true;
                            return;
                        }
                    }
                    renderQuestion(0);
                    progressLoaded = true;
                })
                .catch(() => { renderQuestion(0); progressLoaded = true; });
        })
        .catch(err => { console.error('加载试卷失败:', err); alert('加载试卷失败，请稍后重试'); });
}

function showResumeToast(answeredCount) {
    const toast = document.createElement('div');
    toast.style.cssText = 'position:fixed;top:20px;left:50%;transform:translateX(-50%);background:#4a90d9;color:white;padding:10px 20px;border-radius:8px;font-size:14px;z-index:9999;box-shadow:0 2px 12px rgba(0,0,0,0.2);';
    toast.textContent = `已恢复上次进度（已完成 ${answeredCount} 题）`;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

function switchMode(mode) {
    quizMode = mode;
    if (mode === 'quiz') {
        modeQuizBtn.classList.add('active', 'btn-primary');
        modeQuizBtn.classList.remove('btn-secondary');
        modeStudyBtn.classList.remove('active', 'btn-primary');
        modeStudyBtn.classList.add('btn-secondary');
    } else {
        modeStudyBtn.classList.add('active', 'btn-primary');
        modeStudyBtn.classList.remove('btn-secondary');
        modeQuizBtn.classList.remove('active', 'btn-primary');
        modeQuizBtn.classList.add('btn-secondary');
    }
    renderQuestion(currentIndex);
}

function renderQuestion(index) {
    if (!quizData || !quizData.questions[index]) return;
    currentIndex = index;
    const q = quizData.questions[index];

    currentNumEl.textContent = index + 1;
    const progress = ((index + 1) / quizData.questions.length) * 100;
    progressFill.style.width = progress + '%';

    const typeMap = { 'single': '单选题', 'multiple': '多选题', 'truefalse': '判断题' };
    questionTypeEl.textContent = typeMap[q.type] || '选择题';
    questionNumberEl.textContent = `第 ${index + 1} 题 / 共 ${quizData.questions.length} 题`;
    questionStemEl.textContent = q.stem;

    // 标注按钮状态
    markBtn.textContent = marked[index] ? '🟡' : '⚪';
    markBtn.title = marked[index] ? '取消标注' : '标记此题';

    // 背题模式：直接显示答案，选项不可点击
    if (quizMode === 'study') {
        renderOptionsStudy(q);
        studyAnswerSection.style.display = 'flex';
        studyAnswerText.textContent = `正确答案：${q.answer}`;
        resultFeedback.style.display = 'none';
        showExplanation(q);
    } else {
        studyAnswerSection.style.display = 'none';
        renderOptions(q);
        if (answered[index]) {
            showResult(q, userAnswers[index]);
        } else {
            hideResult();
        }
    }

    prevBtn.disabled = index === 0;
    nextBtn.disabled = false;
    if (index === quizData.questions.length - 1 && (answered[index] || quizMode === 'study')) {
        nextBtn.textContent = '查看成绩';
    } else if (index === quizData.questions.length - 1) {
        nextBtn.textContent = '提交答卷';
    } else {
        nextBtn.textContent = '下一题';
    }

    if (progressLoaded) saveProgress();
}

function renderOptions(q) {
    const isAnswered = answered[currentIndex];
    const userAnswer = userAnswers[currentIndex] || '';
    const correctAnswer = q.answer;
    let optionsHtml = '';
    q.options.forEach((opt, idx) => {
        let label = '', text = opt;
        if (q.type === 'truefalse') {
            label = ['√', '×'][idx] || (idx === 0 ? '√' : '×');
        } else {
            const match = opt.match(/^([A-ZＡ-Ｚ])[\.．、\s]+(.+)$/);
            if (match) { label = match[1]; text = match[2]; }
            else { label = String.fromCharCode(65 + idx); }
        }
        let classes = 'option-item';
        if (isAnswered) {
            classes += ' disabled';
            if (isCorrectOption(label, correctAnswer, q.type)) classes += ' correct';
            else if (isUserSelected(label, userAnswer, q.type)) classes += ' wrong';
        } else if (isUserSelected(label, userAnswer, q.type)) {
            classes += ' selected';
        }
        optionsHtml += `<div class="${classes}" data-label="${label}" onclick="selectOption('${label}')"><span class="option-label">${label}.</span><span class="option-text">${escapeHtml(text)}</span></div>`;
    });
    optionsListEl.innerHTML = optionsHtml;
}

function renderOptionsStudy(q) {
    let optionsHtml = '';
    q.options.forEach((opt, idx) => {
        let label = '', text = opt;
        if (q.type === 'truefalse') {
            label = ['√', '×'][idx] || (idx === 0 ? '√' : '×');
        } else {
            const match = opt.match(/^([A-ZＡ-Ｚ])[\.．、\s]+(.+)$/);
            if (match) { label = match[1]; text = match[2]; }
            else { label = String.fromCharCode(65 + idx); }
        }
        let classes = 'option-item disabled';
        if (isCorrectOption(label, q.answer, q.type)) classes += ' correct';
        optionsHtml += `<div class="${classes}"><span class="option-label">${label}.</span><span class="option-text">${escapeHtml(text)}</span></div>`;
    });
    optionsListEl.innerHTML = optionsHtml;
}

function isCorrectOption(label, answer, type) {
    if (type === 'truefalse') {
        if (label === '√') return answer === '正确' || answer === '对' || answer === '√';
        if (label === '×') return answer === '错误' || answer === '错' || answer === '×';
        return false;
    }
    return answer && answer.toUpperCase().includes(label.toUpperCase());
}

function isUserSelected(label, userAnswer, type) {
    if (!userAnswer) return false;
    if (type === 'truefalse') {
        if (label === '√') return userAnswer === '正确' || userAnswer === '对' || userAnswer === '√';
        if (label === '×') return userAnswer === '错误' || userAnswer === '错' || userAnswer === '×';
        return false;
    }
    return userAnswer.toUpperCase().includes(label.toUpperCase());
}

function selectOption(label) {
    if (answered[currentIndex] || quizMode === 'study') return;
    const q = quizData.questions[currentIndex];
    if (q.type === 'multiple') {
        let current = userAnswers[currentIndex] || '';
        if (current.includes(label)) { current = current.replace(label, ''); }
        else { current += label; current = current.split('').sort().join(''); }
        userAnswers[currentIndex] = current;
    } else {
        userAnswers[currentIndex] = label;
        submitAnswer(label);
        return;
    }
    renderOptions(q);
    if (userAnswers[currentIndex] && userAnswers[currentIndex].length > 0) {
        setTimeout(() => submitAnswer(userAnswers[currentIndex]), 300);
    }
}

function submitAnswer(userAnswer) {
    if (answered[currentIndex]) return;
    const q = quizData.questions[currentIndex];
    answered[currentIndex] = true;
    const isCorrect = checkAnswer(userAnswer, q.answer, q.type);
    fetch('/api/answer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quiz_id: window.QUIZ_ID, question_id: q.id, user_answer: userAnswer, is_correct: isCorrect })
    }).catch(err => console.error('记录答题失败:', err));
    saveProgress();
    showResult(q, userAnswer);
    renderOptions(q);
}

function checkAnswer(userAnswer, correctAnswer, type) {
    if (!userAnswer || !correctAnswer) return false;
    if (type === 'truefalse') {
        const userIsTrue = userAnswer === '正确' || userAnswer === '对' || userAnswer === '√';
        const correctIsTrue = correctAnswer === '正确' || correctAnswer === '对' || correctAnswer === '√' || correctAnswer === 'T' || correctAnswer === 'True';
        return userIsTrue === correctIsTrue;
    }
    const userSet = new Set(userAnswer.toUpperCase().replace(/[^A-Z]/g, '').split(''));
    const correctSet = new Set(correctAnswer.toUpperCase().replace(/[^A-Z]/g, '').split(''));
    if (userSet.size !== correctSet.size) return false;
    for (const item of userSet) { if (!correctSet.has(item)) return false; }
    return true;
}

function showResult(q, userAnswer) {
    const isCorrect = checkAnswer(userAnswer, q.answer, q.type);
    resultFeedback.style.display = 'flex';
    resultFeedback.className = 'result-feedback ' + (isCorrect ? 'correct' : 'wrong');
    resultIcon.textContent = isCorrect ? '✓' : '✗';
    resultText.textContent = isCorrect ? '回答正确！' : `回答错误，正确答案是：${q.answer}`;
    showExplanation(q);
}

function showExplanation(q) {
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

function hideResult() {
    resultFeedback.style.display = 'none';
    explanationSection.style.display = 'none';
}

function toggleMark() {
    marked[currentIndex] = !marked[currentIndex];
    markBtn.textContent = marked[currentIndex] ? '🟡' : '⚪';
    markBtn.title = marked[currentIndex] ? '取消标注' : '标记此题';
    saveProgress();
}

function renderGrid() {
    if (!quizData) return;
    let html = '';
    for (let i = 0; i < quizData.questions.length; i++) {
        let cls = 'grid-cell';
        if (answered[i]) {
            const q = quizData.questions[i];
            const isCorrect = checkAnswer(userAnswers[i], q.answer, q.type);
            cls += isCorrect ? ' correct' : ' wrong';
        } else {
            cls += ' unanswered';
        }
        if (marked[i]) cls += ' marked';
        html += `<div class="${cls}" onclick="gridJump(${i})">${i + 1}</div>`;
    }
    questionGrid.innerHTML = html;
}

function gridJump(index) {
    gridModal.style.display = 'none';
    renderQuestion(index);
}

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
            quizData.questions[currentIndex].explanation = data.explanation;
        } else { throw new Error(data.error || '生成失败'); }
    })
    .catch(err => {
        explanationContent.textContent = '生成失败：' + err.message;
        genExplanationBtn.disabled = false;
        genExplanationBtn.textContent = 'AI生成解析';
    });
}

function prevQuestion() { if (currentIndex > 0) renderQuestion(currentIndex - 1); }
function nextQuestion() {
    if (currentIndex < quizData.questions.length - 1) renderQuestion(currentIndex + 1);
    else showScore();
}

function showScore() {
    const total = quizData.questions.length;
    let correct = 0;
    for (let i = 0; i < total; i++) {
        if (answered[i]) {
            const q = quizData.questions[i];
            if (checkAnswer(userAnswers[i], q.answer, q.type)) correct++;
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

function restartQuiz() {
    userAnswers = new Array(quizData.questions.length).fill(null);
    answered = new Array(quizData.questions.length).fill(false);
    marked = new Array(quizData.questions.length).fill(false);
    completeModal.style.display = 'none';
    renderQuestion(0);
    saveProgress();
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
