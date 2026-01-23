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

// ✅ FIXED: Get best English voice - moved to top level
function getBestVoice() {
    const voices = synth.getVoices();
    
    // Priority: 1. Samantha (iOS) | 2. Google US | 3. Any enhanced en-US | 4. Any en-US | 5. Any English
    return voices.find(v => v.name.includes('Samantha')) || 
           voices.find(v => v.name.includes('Google US English')) ||
           voices.find(v => v.lang === 'en-US' && v.name.includes('Enhanced')) ||
           voices.find(v => v.lang.startsWith('en-US')) ||
           voices.find(v => v.lang.startsWith('en-')) ||
           voices[0];
}

// Load data from CSV
async function Data() {
    try {
        const response = await fetch('n400_data.csv?t=' + Date.now());
        const data = await response.text();
        const lines = data.split(/\r?\n/).filter(line => line.trim() !== "");

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
        console.log("N400 題庫載入成功，單詞數量:", glossaryData.length);
    } catch (e) {
        console.error("載入 CSV 失敗:", e);
    }
}

// ✅ FIXED: Added delay for iOS voice loading
window.addEventListener('DOMContentLoaded', async () => {
    await Data();
    
    // Give iOS/iPad time to load voices
    setTimeout(() => {
        window.speechSynthesis.getVoices();
    }, 100);
    
    window.speechSynthesis.onvoiceschanged = () => {
        window.speechSynthesis.getVoices();
    };
});

// Jump to Xiaohongshu
function goToXiaohongshu() {
    const myRedBookUrl = "https://www.xiaohongshu.com/user/profile/631f3bfd00000000230254b1";
    
    if (window.innerWidth > 1024) {
        window.open(myRedBookUrl, "_blank");
    } else {
        window.location.href = myRedBookUrl;
    }
}

// Shuffle array
function shuffleArray(array) {
    let curId = array.length;
    while (0 !== curId) {
        let randId = Math.floor(Math.random() * curId);
        curId -= 1;
        [array[curId], array[randId]] = [array[randId], array[curId]]; 
    }
    return array;
}

// Glossary menu navigation
function showGlossaryMenu() {
    homeScreen.classList.add('hidden');
    glossaryMenuScreen.classList.remove('hidden');
}
function exitGlossaryMenu() {
    glossaryMenuScreen.classList.add('hidden');
    homeScreen.classList.remove('hidden');
}

// Start practice session
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

// Restart session
function restartSession() {
    clearAudio();
    if (currentMode === 'glossary') {
        startSession(currentMode, glossaryCategory);
    } else {
        startSession(currentMode);
    }
}

// Exit practice
function exitPractice() {
    clearAudio();
    isSessionStarted = false;
    const mainBtn = document.getElementById('main-btn');
    if (mainBtn) mainBtn.classList.add('colorful');
    
    practiceScreen.classList.add('hidden');
    if (currentMode === 'glossary') {
        glossaryMenuScreen.classList.remove('hidden');
    } else {
        homeScreen.classList.remove('hidden');
    }
}

// Clear audio and timeouts
function clearAudio() {
    synth.cancel();
    if (audioTimeout) clearTimeout(audioTimeout);
    audioSequenceTimeouts.forEach(t => clearTimeout(t));
    audioSequenceTimeouts = [];
    setAnimation(false);
}

// Update main button text
function updateMainButtonText() {
    mainBtn.innerHTML = isSessionStarted ? "我回答<br>完了" : "開始<br>面試";
}

// Main button action
function handleMainAction() {
    clearAudio();
    if (!isSessionStarted) {
        isSessionStarted = true;
        mainBtn.classList.remove('colorful');
        updateMainButtonText();
        audioTimeout = setTimeout(() => playCurrentAudio(), 500);
    } else {
        nextQuestion();
    }
}

// Get current item
function getCurrentItem() {
    return questionQueue[currentIndex];
}

// Get string identifier
function getQString(item) {
    return typeof item === 'string' ? item : item.word;
}

// Load question
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

// Toggle question card visibility
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

// Next question
function nextQuestion() {
    currentIndex++;
    loadQuestion(true);
}

// Play current audio
function playCurrentAudio() {
    const item = getCurrentItem();
    if (currentMode === 'glossary') {
        speakGlossaryPhrase(item.word);
    } else {
        speakText(item, true);
    }
}

// Replay audio
function replayAudio() {
    clearAudio();
    playCurrentAudio();
}

// Animation control
function setAnimation(isActive) {
    audioAnim.classList.toggle('playing', isActive);
}

// ✅ FIXED: Text-to-speech with proper voice assignment
function speakText(text, showAnim = false) {
    synth.cancel();

    // Extract English part only
    const englishText = text.split(/[\u4e00-\u9fa5]/)[0].trim();
    const segments = englishText.split('|');
    let currentSegment = 0;

    function playNext() {
        if (currentSegment < segments.length) {
            const utterance = new SpeechSynthesisUtterance(segments[currentSegment].trim());
            utterance.lang = 'en-US';
            utterance.rate = 0.9;
            
            // ✅ KEY FIX: Actually assign the English voice!
            utterance.voice = getBestVoice();

            if (showAnim) {
                utterance.onstart = () => setAnimation(true);
            }

            utterance.onend = () => {
                currentSegment++;
                if (currentSegment < segments.length) {
                    if (showAnim) setAnimation(false);
                    setTimeout(playNext, 2000);
                } else {
                    if (showAnim) setAnimation(false);
                }
            };

            utterance.onerror = () => {
                if (showAnim) setAnimation(false);
            };

            synth.speak(utterance);
        }
    }

    playNext();
}

// ✅ FIXED: Glossary phrase speech with proper voice assignment
function speakGlossaryPhrase(word) {
    clearAudio();
    setAnimation(true);

    const rate = 0.85;
    const bestVoice = getBestVoice(); // Get voice once
    
    const u1 = new SpeechSynthesisUtterance("What does");
    u1.lang = 'en-US';
    u1.rate = rate;
    u1.voice = bestVoice; // ✅ Assign voice

    const u2 = new SpeechSynthesisUtterance(word);
    u2.lang = 'en-US';
    u2.rate = 0.75;
    u2.voice = bestVoice; // ✅ Assign voice

    const u3 = new SpeechSynthesisUtterance("mean?");
    u3.lang = 'en-US';
    u3.rate = rate;
    u3.voice = bestVoice; // ✅ Assign voice

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

// Bookmark screen
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
