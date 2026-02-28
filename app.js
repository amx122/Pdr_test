document.addEventListener('DOMContentLoaded', () => {
    let allQuestions = [];
    let allChapters = [];
    let testQuestions = [];
    
    let currentQuestionIndex = 0;
    let correctCount = 0;
    let mistakeCount = 0;
    let MAX_MISTAKES = 2;
    
    let timeRemaining = 0;
    let totalTimeSeconds = 0;
    let timerInterval = null;
    const setupScreen = document.getElementById('setup-screen');
    const testInterface = document.getElementById('test-interface');
    const resultModal = document.getElementById('result-modal');
    
    const btnStart = document.getElementById('btn-start-test');
    const inputQCount = document.getElementById('q-count');
    const inputMistakes = document.getElementById('mistakes-limit');
    const inputTime = document.getElementById('time-limit');
    const systemMessage = document.getElementById('system-message');
    const categorySelect = document.getElementById('category-select');

    const btnOpenChapters = document.getElementById('btn-open-chapters');
    const chaptersModal = document.getElementById('chapters-modal');
    const chaptersList = document.getElementById('chapters-list');
    const btnSaveChapters = document.getElementById('btn-save-chapters');

    const questionText = document.getElementById('question-text');
    const questionMedia = document.getElementById('question-media');
    const questionImg = document.getElementById('question-img');
    const answersList = document.getElementById('answers-list');
    const paginationList = document.getElementById('pagination-list');
    const qCounter = document.getElementById('question-counter');
    const timerDisplay = document.getElementById('timer-display');

    loadData();

    async function loadData() {
        try {
            btnStart.disabled = true;
            btnStart.innerText = "Завантаження бази...";

            const [chaptersRes, questionsRes] = await Promise.all([
                fetch('./chapters.json').catch(() => null),
                fetch('./official.json').catch(() => null)
            ]);

            if (!chaptersRes || !questionsRes) throw new Error("Файли не знайдені.");

            const chaptersData = await chaptersRes.json();
            const questionsData = await questionsRes.json();

            allChapters = [];
            let parsedChapters = chaptersData.data || chaptersData;
            
            if (!Array.isArray(parsedChapters)) {
                for (let key in parsedChapters) {
                    if (typeof parsedChapters[key] === 'string') {
                        allChapters.push({ id: key, name: parsedChapters[key] });
                    } else if (typeof parsedChapters[key] === 'object') {
                        let item = parsedChapters[key];
                        item._gen_id = key;
                        allChapters.push(item);
                    }
                }
            } else {
                allChapters = parsedChapters;
            }
            allQuestions = Array.isArray(questionsData) ? questionsData : (questionsData.data || questionsData.questions || Object.values(questionsData));

            renderChaptersList();

            btnStart.disabled = false;
            btnStart.innerText = "Почати тестування";
        } catch (error) {
            console.error("Помилка:", error);
            systemMessage.innerText = "Помилка завантаження бази. Перевірте локальний сервер.";
            btnStart.innerText = "Помилка";
        }
    }

    function renderChaptersList() {
        chaptersList.innerHTML = '';
        allChapters.forEach((chapter, index) => {
            const label = document.createElement('label');
            label.className = 'checkbox-item';
            
            const id = chapter.id || chapter.num || chapter.chapter || chapter._gen_id || String(index);
            
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.value = id;
            checkbox.checked = true; 

            let chapterName = "";
            if (typeof chapter === 'string') {
                chapterName = chapter; 
            } else if (typeof chapter === 'object') {
                chapterName = chapter.name || chapter.title || chapter.text || chapter.ua || chapter.description;
                
                if (!chapterName) {
                    const strings = Object.values(chapter).filter(v => typeof v === 'string' && isNaN(v) && v.length > 5);
                    if (strings.length > 0) {
                        chapterName = strings[0]; 
                    }
                }
            }
            
            if (!chapterName) {
                chapterName = `Розділ ${index + 1}`;
            }

            const span = document.createElement('span');
            span.className = 'checkbox-label';
            span.innerText = chapterName;

            label.appendChild(checkbox);
            label.appendChild(span);
            chaptersList.appendChild(label);
        });
    }

    btnOpenChapters.addEventListener('click', () => chaptersModal.style.display = 'flex');
    btnSaveChapters.addEventListener('click', () => chaptersModal.style.display = 'none');
    document.getElementById('btn-select-all').addEventListener('click', () => {
        document.querySelectorAll('.checkbox-item input').forEach(cb => cb.checked = true);
    });
    document.getElementById('btn-deselect-all').addEventListener('click', () => {
        document.querySelectorAll('.checkbox-item input').forEach(cb => cb.checked = false);
    });

    btnStart.addEventListener('click', () => {
        const selectedIds = Array.from(document.querySelectorAll('.checkbox-item input:checked')).map(cb => String(cb.value));
        const selectedCategory = categorySelect.value;
        
        if (selectedIds.length === 0) {
            systemMessage.innerText = "Оберіть хоча б один розділ ПДР!";
            return;
        }

        MAX_MISTAKES = parseInt(inputMistakes.value) || 0; 
        totalTimeSeconds = (parseInt(inputTime.value) || 20) * 60;
        timeRemaining = totalTimeSeconds;
        const requestedCount = parseInt(inputQCount.value) || 20;
        let filteredQuestions = allQuestions.filter(q => {
            const qThemeId = String(q.chapter || q.chapter_id || q.theme_id);
            const matchesChapter = selectedIds.includes(qThemeId);
            let matchesCategory = true;
            if (selectedCategory !== 'all') {
                const qCat = q.category || q.categories || q.cat || q.type;
                if (qCat !== undefined) {
                    matchesCategory = String(qCat).toUpperCase().includes(selectedCategory);
                }
            }
            return matchesChapter && matchesCategory;
        });

        if (filteredQuestions.length === 0) {
            console.warn("Фільтр не знайшов питань. Беремо випадкові.");
            filteredQuestions = allQuestions;
        }

        let shuffled = filteredQuestions.sort(() => 0.5 - Math.random());
        testQuestions = shuffled.slice(0, Math.min(requestedCount, filteredQuestions.length)).map(q => ({
            ...q, userAnswered: false, selectedIndex: null, isCorrect: null
        }));

        correctCount = 0; mistakeCount = 0; currentQuestionIndex = 0;

        setupScreen.style.display = 'none';
        testInterface.style.display = 'block';
        systemMessage.innerText = '';

        renderPagination();
        loadQuestion(0);
        startTimer();
    });
    function loadQuestion(index) {
        currentQuestionIndex = index;
        const q = testQuestions[index];
        
        qCounter.innerText = `Питання: ${index + 1} / ${testQuestions.length}`;
        questionText.innerText = q.question || q.text || "Текст питання відсутній";
        let imagePath = "";
        if (q.imgs && Array.isArray(q.imgs) && q.imgs.length > 0) {
            imagePath = q.imgs[0];
        }

        if (imagePath && imagePath.trim() !== "") {
            imagePath = imagePath.replace(/^\//, ''); 
            let url = imagePath.startsWith('http') ? imagePath : `https://test2.avtoshkolaantares.ua/${imagePath}`;
            
            questionImg.src = url;
            questionMedia.style.display = 'block';
        } else {
            questionMedia.style.display = 'none';
        }
        answersList.innerHTML = '';
        const answers = Array.isArray(q.answers) ? q.answers : [];
        
        answers.forEach((ansText, i) => {
            const btn = document.createElement('button');
            btn.className = 'answer-btn';
            btn.innerHTML = `<span class="answer-num">${i + 1}</span> ${ansText}`;

            if (q.userAnswered) {
                btn.disabled = true;
                const isRightAnswer = checkIsRight(q, i);
                if (isRightAnswer) btn.classList.add('is-correct');
                if (q.selectedIndex === i && !isRightAnswer) btn.classList.add('is-wrong');
            } else {
                btn.onclick = () => handleAnswer(i, btn, answers, q);
            }
            answersList.appendChild(btn);
        });

        document.getElementById('btn-prev').disabled = index === 0;
        document.getElementById('btn-next').disabled = index === testQuestions.length - 1;
        updatePaginationActiveState();
    }

    function checkIsRight(q, answerIndex) {
        if (q.ica !== undefined && q.ica !== null) {
            if (String(q.ica) === String(answerIndex)) {
                return true;
            }
        }
        return false;
    }
    function handleAnswer(selectedIndex, btnElement, allCurrentAnswers, q) {
        q.userAnswered = true;
        q.selectedIndex = selectedIndex;
        
        const isCorrectAnswer = checkIsRight(q, selectedIndex);
        q.isCorrect = isCorrectAnswer;
        Array.from(answersList.children).forEach(btn => btn.disabled = true);

        if (isCorrectAnswer) {
            btnElement.classList.add('is-correct');
            correctCount++;
        } else {
            btnElement.classList.add('is-wrong');
            mistakeCount++;
            const correctIndex = allCurrentAnswers.findIndex((a, idx) => checkIsRight(q, idx));
            if(correctIndex !== -1 && answersList.children[correctIndex]) {
                answersList.children[correctIndex].classList.add('is-correct');
            }
        }

        updatePaginationColor(currentQuestionIndex, isCorrectAnswer);

        const answeredCount = testQuestions.filter(item => item.userAnswered).length;
        if (mistakeCount > MAX_MISTAKES || answeredCount === testQuestions.length) {
            setTimeout(() => finishTest(), 1500);
            return;
        }
        setTimeout(() => {
            let nextUnanswered = testQuestions.findIndex(item => !item.userAnswered);
            if (nextUnanswered !== -1) loadQuestion(nextUnanswered);
        }, 1500);
    }
    function renderPagination() {
        paginationList.innerHTML = '';
        testQuestions.forEach((_, i) => {
            const btn = document.createElement('div');
            btn.className = 'page-item';
            btn.innerText = i + 1;
            btn.onclick = () => loadQuestion(i);
            paginationList.appendChild(btn);
        });
    }

    function updatePaginationActiveState() {
        Array.from(paginationList.children).forEach((btn, i) => {
            btn.classList.toggle('active', i === currentQuestionIndex);
            if (i === currentQuestionIndex) {
                btn.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
            }
        });
    }

    function updatePaginationColor(index, isCorrect) {
        paginationList.children[index].classList.add(isCorrect ? 'correct' : 'wrong');
    }

    document.getElementById('btn-prev').addEventListener('click', () => {
        if (currentQuestionIndex > 0) loadQuestion(currentQuestionIndex - 1);
    });
    document.getElementById('btn-next').addEventListener('click', () => {
        if (currentQuestionIndex < testQuestions.length - 1) loadQuestion(currentQuestionIndex + 1);
    });

    function startTimer() {
        timerInterval = setInterval(() => {
            timeRemaining--;
            let m = Math.floor(timeRemaining / 60);
            let s = timeRemaining % 60;
            timerDisplay.innerText = `${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
            if (timeRemaining <= 0) {
                clearInterval(timerInterval);
                finishTest(); 
            }
        }, 1000);
    }
    function finishTest() {
        clearInterval(timerInterval);
        const timeSpent = totalTimeSeconds - timeRemaining;
        const m = Math.floor(timeSpent / 60);
        const s = timeSpent % 60;
        const isSuccess = mistakeCount <= MAX_MISTAKES && timeRemaining > 0;

        document.getElementById('res-total').innerText = testQuestions.length;
        document.getElementById('res-correct').innerText = correctCount;
        document.getElementById('res-mistakes').innerText = mistakeCount;
        document.getElementById('res-time').innerText = `${m < 10 ? '0':''}${m}:${s < 10 ? '0':''}${s}`;

        const modalTitle = document.getElementById('modal-title');
        if (isSuccess) {
            modalTitle.innerText = 'Іспит складено! 🎉';
            modalTitle.style.color = 'var(--success)';
        } else {
            modalTitle.innerText = 'Іспит не складено 😔';
            modalTitle.style.color = 'var(--danger)';
        }
        resultModal.style.display = 'flex';
    }

    document.getElementById('btn-restart').addEventListener('click', () => location.reload());
});