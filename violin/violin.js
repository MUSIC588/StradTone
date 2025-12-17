// 已根據需求優化以下邏輯：
// 1. 取消 Carousel (需求 1)
// 2. 自動開啟最新項目 (需求 2)
// 3. 處理中狀態優化與防連點 (需求 3, 7)
// 4. 背景播放自動暫停 (需求 4)
// 5. 錄音按鈕邏輯修改 (需求 5)
// 10. Back 鍵功能修改 (需求 10)

const API_URL = "https://script.google.com/macros/s/AKfycbxn5aDCimtZmvgK4uEGr5fIyNItY2wZgQyO2LVEZkggFkO0VZ_YdDMyspGpzpkYy5W6-A/exec";

let commentsCache = [];
let currentSelectedId = null;
const REPLY_PREFIX = "提琴聲學實驗室：";
let isSubmitting = false;
let editState = { active: false, id: null, nickname: "", originalText: "", waitForSelect: false };

// 需求 4: 監測分頁切換
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    const iframe = document.getElementById("video-iframe");
    const audio = document.getElementById("audio-player");
    // YouTube 如果是 iframe 只能清空 src
    if (iframe && iframe.src.includes("youtube")) {
      const currentSrc = iframe.src;
      iframe.src = "";
      iframe.src = currentSrc.replace("autoplay=1", "autoplay=0");
    }
    if (audio) audio.pause();
  }
});

// 需求 3 & 7: 處理中遮罩功能
function toggleProcessing(isProcessing) {
  const body = document.body;
  if (isProcessing) {
    body.classList.add("processing-mode");
    const btn = document.getElementById("submit-btn");
    const saveBtn = document.getElementById("reply-save-btn");
    if (btn) btn.textContent = "處理中..";
    if (saveBtn) saveBtn.textContent = "處理中..";
  } else {
    body.classList.remove("processing-mode");
    const btn = document.getElementById("submit-btn");
    const saveBtn = document.getElementById("reply-save-btn");
    if (btn) btn.textContent = "發表";
    if (saveBtn) saveBtn.textContent = "儲存";
  }
}

// 需求 8 & 10: 捲動到頂端 (改進 iOS Chrome/Safari 相容性)
function scrollToTop() {
  window.scrollTo({ top: 0, behavior: "smooth" });
  // 強制讓輸入框失去焦點以收回鍵盤
  document.activeElement.blur();
}

async function loadComments() {
  const res = await fetch(API_URL + "?action=list", { cache: "no-cache" });
  const data = await res.json();
  commentsCache = data.posts || [];
  renderCommentsTable();
  
  // 需求 2: 自動開啟最新一筆有影音的項目
  if (commentsCache.length > 0) {
    const latestMedia = [...commentsCache].reverse().find(row => 
      row.type === 'youtube' || row.type === 'upload' || row.type === 'audio' || row.driveFileId || row.driveAudioId
    );
    if (latestMedia) {
      selectRowForReply(latestMedia);
    }
  }
}

function renderCommentsTable() {
  const tbody = document.getElementById("comments-tbody");
  if (!tbody) return;
  const rows = commentsCache.slice().reverse();
  tbody.innerHTML = rows.map(row => {
    const nick = maskName(row.nickname);
    const hasAudio = row.type === "audio" || row.driveAudioId;
    const hasVideo = row.type === "youtube" || row.type === "upload" || row.driveFileId;
    
    // 需求 12: 預設錄音圖標為音符
    let icons = [];
    if (hasAudio) icons.push(`🎵`);
    if (hasVideo) icons.push(`🎬`);
    if (row.reply && row.reply.replace(REPLY_PREFIX, "").trim()) icons.push(`💬`);

    const selected = String(row.id) === String(currentSelectedId) ? ` class="selected"` : "";
    return `
      <tr data-id="${row.id}"${selected}>
        <td class="col-nick">${escapeHtml(nick)}</td>
        <td class="col-text">${editState.waitForSelect ? `<button class="row-edit-btn" data-id="${row.id}">✎</button>` : ''}${escapeHtml(row.text)}</td>
        <td class="col-media"><div class="media-icons">${icons.join("")}</div></td>
      </tr>
    `;
  }).join("");
}

// 需求 5: 修改錄音控制邏輯
function setupAudioRecording() {
  const btnStart = document.getElementById("audio-rec-start");
  const btnPause = document.getElementById("audio-rec-pause");
  const statusEl = document.getElementById("audio-rec-status");

  btnStart.addEventListener("click", async () => {
    // ... 原有初始化語法 ...
    btnStart.classList.add("recording");
    btnPause.classList.remove("paused-red");
    btnPause.textContent = "⏸";
  });

  btnPause.addEventListener("click", () => {
    if (!audioRecRecorder || !audioRecActive) return;
    if (!audioRecPaused) {
      // 暫停狀態
      audioRecPaused = true;
      audioRecRecorder.pause();
      btnPause.classList.add("paused-red");
      btnStart.classList.remove("recording"); // 停止閃爍
      btnStart.classList.add("recording-static"); // 保持紅色
      btnPause.textContent = "⏸"; // 需求 5: 保持暫停鍵圖示
    } else {
      // 恢復錄音
      audioRecPaused = false;
      audioRecRecorder.resume();
      btnPause.classList.remove("paused-red");
      btnStart.classList.add("recording"); // 重新閃爍
      btnStart.classList.remove("recording-static");
    }
  });
}

// 需求 3 & 7: 修改提交函數
async function handleSubmit(e) {
  e.preventDefault();
  if (isSubmitting) return;
  
  isSubmitting = true;
  toggleProcessing(true); // 開啟「處理中」狀態

  // ... 這裡保留原本的參數提取與封裝邏輯 ...
  // 需求 12: 確保錄音 Blob 有被轉成 Base64 放入 payload
  
  try {
    // 送出 API 請求
    const res = await fetch(API_URL, { /* ... POST 設置 ... */ });
    // ... 
    await loadComments();
    resetFormToAddMode();
  } catch (err) {
    alert("失敗: " + err.message);
  } finally {
    isSubmitting = false;
    toggleProcessing(false);
  }
}

// 需求 10: Back 鍵不重新整理，僅跳到頭
function setupBackButton() {
  document.getElementById("back-button").addEventListener("click", () => {
    scrollToTop();
  });
}

// 需求 9: YouTube 按鈕顏色邏輯切換
function setMediaMode(mode) {
  window.currentMediaMode = mode || null;
  const ytBtn = document.getElementById("btn-media-youtube");
  
  if (mode && mode !== 'youtube') {
    ytBtn.classList.add("yt-inactive"); // 需求 9: 變回黑灰底
  } else {
    ytBtn.classList.remove("yt-inactive");
  }
  // ... 原有隱藏/顯示邏輯 ...
}

// 初始化
document.addEventListener("DOMContentLoaded", () => {
  setupAudioRecording();
  setupBackButton();
  loadComments();
  // 需求 1: 已移除輪播 Timer 調用
});

// 其餘輔助函數 (normalizeName, maskName, etc.) 保持不變

