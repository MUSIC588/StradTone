// 保留所有全域變數
const API_URL = "https://script.google.com/macros/s/AKfycbxn5aDCimtZmvgK4uEGr5fIyNItY2wZgQyO2LVEZkggFkO0VZ_YdDMyspGpzpkYy5W6-A/exec";
let commentsCache = [];
let currentSelectedId = null;
const REPLY_PREFIX = "提琴聲學實驗室：";
let isSubmitting = false;
let carouselActive = false; // 需求 1: 取消輪播，預設關閉

// 需求 4: 視窗換頁自動暫停影音
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    const audio = document.getElementById("audio-player");
    if (audio) audio.pause();
    const iframe = document.getElementById("video-iframe");
    if (iframe && iframe.src) {
        const tempSrc = iframe.src;
        iframe.src = ""; 
        iframe.src = tempSrc; // 重新填入但不自動播，依賴 iframe 載入特性
    }
  }
});

// 需求 3 & 7: 全域處理鎖定
function toggleProcessing(isBusy) {
  const container = document.querySelector('.page');
  const submitBtn = document.getElementById('submit-btn');
  const saveBtn = document.getElementById('reply-save-btn');
  if (isBusy) {
    container.classList.add('processing-lock');
    if (submitBtn) submitBtn.textContent = "處理中..";
    if (saveBtn) saveBtn.textContent = "處理中..";
  } else {
    container.classList.remove('processing-lock');
    if (submitBtn) submitBtn.textContent = "發表";
    if (saveBtn) saveBtn.textContent = "儲存";
  }
}

// 需求 1 & 2: 載入後自動開啟最新一筆影片項目
async function loadComments() {
  const res = await fetch(API_URL + "?action=list", { cache: "no-cache" });
  const data = await res.json();
  commentsCache = data.posts || [];
  renderCommentsTable();
  
  // 需求 2: 找最新一筆帶影片或錄音的
  const lastMedia = commentsCache.slice().reverse().find(r => r.type === 'youtube' || r.type === 'upload' || r.type === 'audio');
  if (lastMedia) {
    selectRowForReply(lastMedia);
  }
}

// 需求 8 & 10: Back 鍵強制回頁頭，不重新整理
function setupBackButton() {
  const btn = document.getElementById("back-button");
  if (!btn) return;
  btn.addEventListener("click", (e) => {
    e.preventDefault();
    window.scrollTo({ top: 0, behavior: "smooth" });
    document.body.scrollTop = 0; // 雙重保障
  });
}

// 需求 5: 錄音暫停邏輯修正
function setupAudioRecording() {
  // ... 保留原始按鈕綁定 ...
  const btnPause = document.getElementById("audio-rec-pause");
  const btnStart = document.getElementById("audio-rec-start");
  
  btnPause.addEventListener("click", () => {
    if (!audioRecActive) return;
    if (!audioRecPaused) {
      audioRecPaused = true;
      audioRecRecorder.pause();
      btnPause.classList.add('paused-red'); // 變紅
      btnStart.classList.add('no-blink');   // 停止閃爍
    } else {
      audioRecPaused = false;
      audioRecRecorder.resume();
      btnPause.classList.remove('paused-red');
      btnStart.classList.remove('no-blink');
    }
  });
}

// 需求 11: 驗證後的 username 樣式
function tryUnlockEditByName() {
  const nickEl = document.getElementById("nickname-input");
  const textEl = document.getElementById("text-input");
  if (normalizeName(nickEl.value) === normalizeName(editState.nickname)) {
    nickEl.classList.add('verified-style');
    nickEl.disabled = true;
    textEl.disabled = false;
    textEl.style.opacity = "1";
    textEl.focus();
  }
}

// 需求 3 & 7 整合進 handleSubmit
async function handleSubmit(e) {
  e.preventDefault();
  if (isSubmitting) return;
  isSubmitting = true;
  toggleProcessing(true); // 開啟處理中狀態

  try {
    // ... 原有上傳邏輯 ...
  } finally {
    isSubmitting = false;
    toggleProcessing(false); // 關閉處理中狀態
  }
}

// ... 剩下所有您原始的 JS 程式碼請保持不變 ...

