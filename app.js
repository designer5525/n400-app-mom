// --- STATE ---
let personalQuestions = [];
let part9Questions = [];
let glossaryData = [];

let currentMode = '';
let glossaryCategory = 0;
let questionQueue = [];
let currentIndex = 0;
let isRevealed = false;
let isSessionStarted = false;
let bookmarks = JSON.parse(localStorage.getItem('n400_bookmarks_v2')) || { personal: [], part9: [], glossary: [] };
let currentTab = 'personal';
let synth = window.speechSynthesis;
let currentVoice = null;
let audioTimeout = null;
let audioSequenceTimeouts = [];

// --- DOM ELEMENTS ---
const homeScreen = document.getElementById('home-screen');
const glossaryMenuScreen = document.getElementById('glossary-menu-screen');
const practiceScreen = document.getElementById('practice-screen');
const bookmarkScreen = document.getElementById('bookmark-screen');
const audioAnim = document.getElementById('audio-anim');
const qBox = document.getElementById('q-box');
const qHidden = document.getElementById('q-hidden');
const qText = document.getElementById('q-text');
const qCounter = document.getElementById('q-current');
const qTotal = document.getElementById('q-total');
const starBtn = document.getElementById('btn-star');
const mainBtn = document.getElementById('main-btn');
// --- FUNCTIONS ---

// --- 新增：從 CSV 載入資料並關聯 ---
// --- 修改後的資料載入函數 ---
async function Data() {
    try {
        const response = await fetch('n400_data.csv?t=' + Date.now());
        const data = await response.text();
        const lines = data.split(/\r?\n/).filter(line => line.trim() !== "");

        // 重置數組
        personalQuestions = [];
        part9Questions = [];
        glossaryData = [];

        for (let i = 1; i < lines.length; i++) {
            const matches = lines[i].match(/(".*?"|[^,]+)/g);
            if (!matches) continue;

            const type = matches[0].trim().toLowerCase();
            const content = matches[1] ? matches[1].replace(/^"|"$/g, '').trim() : "";
            const trans = matches[2] ? matches[2].replace(/^"|"$/g, '').trim() : "";
            const extra = matches[3] ? matches[3].replace(/^"|"$/g, '').trim() : "";
            
            // 讀取第五欄位並轉為數字
            const catVal = matches[4] ? parseInt(matches[4].replace(/^"|"$/g, '').trim()) : 0;

            if (type === 'personal') {
                personalQuestions.push(`${content} ${trans}`);
            } else if (type === 'part9') {
                part9Questions.push(`${content} ${trans}`);
            } else if (type === 'glossary') {
                glossaryData.push({
                    word: content,
                    chinese: trans,
                    def: extra,
                    phonetic: "", 
                    cat: catVal
                });
            }
        }
        console.log("N400 題庫載入成功，名詞數量:", glossaryData.length);
    } catch (e) {
        console.error("載入 CSV 失敗:", e);
    }
}

// 確保執行時名稱一致
window.addEventListener('DOMContentLoaded', async () => {
    await Data(); 
    window.speechSynthesis.onvoiceschanged = () => {
        window.speechSynthesis.getVoices();
    };
});

// 小紅書跳轉
function goToXiaohongshu() {
    // 請將下方的網址替換為你複製的小紅書主頁連結
    const myRedBookUrl = "https://www.xiaohongshu.com/user/profile/631f3bfd00000000230254b1";
    
   // 判斷是否為電腦端 (如果寬度大於 1024px 通常是電腦)
    if (window.innerWidth > 1024) {
        // 電腦端：強制開啟新分頁，避免被原頁面攔截
        window.open(myRedBookUrl, "_blank");
    } else {
        // 手機端：保持現有的跳轉方式，這能呼起小紅書 App
        window.location.href = myRedBookUrl;
    }
}

// 洗牌
function shuffleArray(array) {
    let curId = array.length;
    while (0 !== curId) {
        let randId = Math.floor(Math.random() * curId);
        curId -= 1;
        [array[curId], array[randId]] = [array[randId], array[curId]]; 
    }
    return array;
}

// 切換 Glossary 菜單
function showGlossaryMenu() {
    homeScreen.classList.add('hidden');
    glossaryMenuScreen.classList.remove('hidden');
}
function exitGlossaryMenu() {
    glossaryMenuScreen.classList.add('hidden');
    homeScreen.classList.remove('hidden');
}

// 啟動練習
function startSession(mode, catId = 0) {
  if (personalQuestions.length === 0) {
        console.log("數據尚未就緒，嘗試重新載入...");
        return; 
    }
    currentMode = mode;
    glossaryCategory = catId;
    let pool = [];

    if (mode === 'personal') {
        pool = [...personalQuestions];
        questionQueue = shuffleArray(pool);
    } else if (mode === 'part9') {
        pool = [...part9Questions];
        questionQueue = shuffleArray(pool);
    } else if (mode === 'glossary') {
        pool = glossaryData.filter(item => item.cat === catId);
        if (pool.length === 0 && glossaryData.length > 0) {
            console.warn(`分類 ID ${catId} 中沒有資料，請檢查 CSV`);
            // 備選方案：如果分類找不到，顯示全部名詞
            pool = [...glossaryData]; 
        }
        questionQueue = shuffleArray(pool);
    }

    if (questionQueue.length === 0) {
        alert("目前清單是空的喔！");
        return;
    }
    currentIndex = 0;
    isSessionStarted = false;

    homeScreen.classList.add('hidden');
    glossaryMenuScreen.classList.add('hidden');
    practiceScreen.classList.remove('hidden');

    updateMainButtonText();
    loadQuestion(false);
}

// 重新開始
function restartSession() {
    clearAudio();
    if (currentMode === 'glossary') {
        startSession(currentMode, glossaryCategory);
    } else {
        startSession(currentMode);
    }
}

// 退出練習
function exitPractice() {
    clearAudio();
  // 1. 重置狀態變數，讓下次進入時能判定為「尚未開始」
    isSessionStarted = false;
  // 2. 恢復按鈕的藍色樣式類名
    const mainBtn = document.getElementById('main-btn');
    if (mainBtn) mainBtn.classList.add('colorful');
    
  practiceScreen.classList.add('hidden');
    if (currentMode === 'glossary') {
        glossaryMenuScreen.classList.remove('hidden');
    } else {
        homeScreen.classList.remove('hidden');
    }
}

// 清除語音動畫與時間軸
function clearAudio() {
    synth.cancel();
    if (audioTimeout) clearTimeout(audioTimeout);
    audioSequenceTimeouts.forEach(t => clearTimeout(t));
    audioSequenceTimeouts = [];
    setAnimation(false);
}

// 更新主按鈕文字
function updateMainButtonText() {
    mainBtn.innerHTML = isSessionStarted ? "我回答<br>完了" : "開始<br>面試";
}

// 主按鈕行為
function handleMainAction() {
    clearAudio();
    if (!isSessionStarted) {
        isSessionStarted = true;
        // --- 點擊後移除藍色類名 ---
        mainBtn.classList.remove('colorful');
      
        updateMainButtonText();
        audioTimeout = setTimeout(() => playCurrentAudio(), 500);
    } else {
        nextQuestion();
    }
}

// 取得當前題目
function getCurrentItem() {
    return questionQueue[currentIndex];
}

// 取得字串識別
function getQString(item) {
    return typeof item === 'string' ? item : item.word;
}

// 載入題目
function loadQuestion(autoPlay) {
    if (currentIndex >= questionQueue.length) {
        alert("練習完成！即將返回主頁。");
        exitPractice();
        return;
    }

    isRevealed = false;
    qHidden.classList.remove('hidden');
    qText.classList.add('hidden');
    qText.innerHTML = "";

    qCounter.innerText = currentIndex + 1;
    qTotal.innerText = questionQueue.length;

    updateBookmarkButtonState();

    if (autoPlay) audioTimeout = setTimeout(() => playCurrentAudio(), 500);
}

// 顯示 / 隱藏題目卡
function toggleQuestionCard() {
    if (isRevealed) {
        isRevealed = false;
        qHidden.classList.remove('hidden');
        qText.classList.add('hidden');
    } else {
        isRevealed = true;
        qHidden.classList.add('hidden');
        qText.classList.remove('hidden');

        const item = getCurrentItem();

        if (currentMode === 'glossary') {
            qText.innerHTML = `
                <div class="gloss-content">
                    <div class="gloss-word">${item.word}</div>
                    <div class="gloss-phonetic">${item.phonetic}</div>
                    <div class="gloss-cn">${item.chinese}</div>
                    <div class="gloss-divider"></div>
                    <div class="gloss-def-container">
                        <div class="gloss-def">${item.def}</div>
                        <button class="btn audio-sm-btn" onclick="event.stopPropagation(); speakText('${item.def.replace(/'/g, "\\'")}')">🔊</button>
                    </div>
                </div>`;
        } else {
            qText.innerText = item;
        }
    }
}

// 下一題
function nextQuestion() {
    currentIndex++;
    loadQuestion(true);
}

// 播放當前題目語音
function playCurrentAudio() {
    const item = getCurrentItem();
    if (currentMode === 'glossary') {
        speakGlossaryPhrase(item.word);
    } else {
        speakText(item, true);
    }
}

// 重播
function replayAudio() {
    clearAudio();
    playCurrentAudio();
}

// 語音動畫控制
function setAnimation(isActive) {
    audioAnim.classList.toggle('playing', isActive);
}

// 語音朗讀

function speakText(text, showAnim = false) {
    // 先清理掉之前正在讀的內容
    synth.cancel();

    // 1. 只提取英文部分進行朗讀（避免語音引擎嘗試讀中文）
    const englishText = text.split(/[\u4e00-\u9fa5]/)[0].trim();

    // 2. 依照 "|" 符號拆分英文段落
    const segments = englishText.split('|');
    let currentSegment = 0;

    // 定義一個內部的播放函數來實現循環停頓
    function playNext() {
        if (currentSegment < segments.length) {
            const utterance = new SpeechSynthesisUtterance(segments[currentSegment].trim());
            utterance.lang = 'en-US';
            utterance.rate = 0.9;

            // 定義一個函數來選取最好的聲音
function getBestVoice() {
    let voices = synth.getVoices();
    
    // 優先順序：1. iPhone 的 Samantha | 2. Google 的高品質音 | 3. 任何 en-US 的聲音
    return voices.find(v => v.name.includes('Samantha')) || 
           voices.find(v => v.name.includes('Google US English')) ||
           voices.find(v => v.lang === 'en-US' && v.name.includes('Enhanced')) ||
           voices.find(v => v.lang.startsWith('en-US')) ||
           voices[0];
}

// 播放函數
function speak(text) {
    if (synth.speaking) { synth.cancel(); } // 如果正在說話，先停止

    const utterance = new SpeechSynthesisUtterance(text);
    
    // 關鍵：每次播放前重新獲取一次最好的聲音，確保手機已加載完成
    utterance.voice = getBestVoice();
    
    // 參數調整
    utterance.rate = 0.85;  // 稍慢，適合練習
    utterance.pitch = 1.0;  // 音調正常
    
    synth.speak(utterance);
}

// 解決 Chrome/Safari 的異步加載問題
if (speechSynthesis.onvoiceschanged !== undefined) {
    speechSynthesis.onvoiceschanged = getBestVoice;
}

            // 動態效果控制
            if (showAnim) {
                utterance.onstart = () => setAnimation(true);
                // 注意：這裡不直接設為 false，改在 onend 判斷
            }

            // 當這一段讀完後的處理
            utterance.onend = () => {
                currentSegment++;
                if (currentSegment < segments.length) {
                    // 關鍵：如果還沒讀完，關閉動畫並等待 2 秒再讀下一段
                    if (showAnim) setAnimation(false); 
                    setTimeout(playNext, 2000); 
                } else {
                    // 全部讀完後，確保動畫關閉
                    if (showAnim) setAnimation(false);
                }
            };

            utterance.onerror = () => {
                if (showAnim) setAnimation(false);
            };

            synth.speak(utterance);
        }
    }

    // 開始執行第一段播放
    playNext();
}


// Glossary 專用朗讀
function speakGlossaryPhrase(word) {
    clearAudio();
    setAnimation(true);

    const rate = 0.85;
    const u1 = new SpeechSynthesisUtterance("What does");
    u1.lang = 'en-US'; u1.rate = rate;
    const u2 = new SpeechSynthesisUtterance(word);
    u2.lang = 'en-US'; u2.rate = 0.75;
    const u3 = new SpeechSynthesisUtterance("mean?");
    u3.lang = 'en-US'; u3.rate = rate;

    u1.onend = () => audioSequenceTimeouts.push(setTimeout(() => synth.speak(u2), 200));
    u2.onend = () => audioSequenceTimeouts.push(setTimeout(() => synth.speak(u3), 200));
    u3.onend = () => setAnimation(false);
    u1.onerror = u2.onerror = u3.onerror = () => setAnimation(false);

    synth.speak(u1);
}

// --- BOOKMARKS ---
function updateBookmarkButtonState() {
    const item = getCurrentItem();
    const val = getQString(item);
    const listKey = currentMode === 'glossary' ? 'glossary' : currentMode;
    const list = bookmarks[listKey];

    if (list.includes(val)) {
        starBtn.innerText = "★";
        starBtn.classList.add('bookmarked');
    } else {
        starBtn.innerText = "☆";
        starBtn.classList.remove('bookmarked');
    }
}

function toggleBookmark() {
    const item = getCurrentItem();
    const val = getQString(item);
    const listKey = currentMode === 'glossary' ? 'glossary' : currentMode;
    const list = bookmarks[listKey];
    const idx = list.indexOf(val);

    if (idx > -1) list.splice(idx, 1);
    else list.push(val);

    saveBookmarks();
    updateBookmarkButtonState();
}

function saveBookmarks() {
    localStorage.setItem('n400_bookmarks_v2', JSON.stringify(bookmarks));
}

// 書籤頁面
function showBookmarks() {
    homeScreen.classList.add('hidden');
    bookmarkScreen.classList.remove('hidden');
    switchTab('personal');
}
function exitBookmarks() {
    clearAudio();
    bookmarkScreen.classList.add('hidden');
    homeScreen.classList.remove('hidden');
}

function switchTab(tab) {
    currentTab = tab;
    document.getElementById('tab-personal').classList.toggle('active', tab === 'personal');
    document.getElementById('tab-part9').classList.toggle('active', tab === 'part9');
    document.getElementById('tab-glossary').classList.toggle('active', tab === 'glossary');
    renderBookmarkList();
}

function renderBookmarkList() {
    const container = document.getElementById('bookmark-list');
    container.innerHTML = "";

    const list = bookmarks[currentTab];
    if (!list || list.length === 0) {
        container.innerHTML = `<div style="text-align:center; color:#999; margin-top:50px;">暫無收藏</div>`;
        return;
    }

    list.forEach(val => {
        const item = document.createElement('div');
        item.className = 'list-item';
        const safeVal = val.replace(/'/g, "\\'");
        let displayText = val;
        let audioAction = `speakText('${safeVal}', false)`;

        if (currentTab === 'glossary') {
            const found = glossaryData.find(g => g.word === val);
            audioAction = `speakGlossaryPhrase('${safeVal}')`;
            if (found) displayText = `<b>${found.word}</b><br><span style="font-size:14px;color:#666">${found.chinese}</span>`;
        }

        item.innerHTML = `
            <button class="btn list-audio-btn" onclick="${audioAction}">🔊</button>
            <div class="list-text">${displayText}</div>
            <div class="list-remove" onclick="removeBookmarkFromList('${safeVal}')">🗑️</div>
        `;
        container.appendChild(item);
    });
}

function removeBookmarkFromList(val) {
    const list = bookmarks[currentTab];
    const idx = list.indexOf(val);
    if (idx > -1) {
        list.splice(idx, 1);
        saveBookmarks();
        renderBookmarkList();
    }
}
