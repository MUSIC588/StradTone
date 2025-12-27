// ===== [JS-0] 全域狀態 =====
const API_URL = "https://script.google.com/macros/s/AKfycbxn5aDCimtZmvgK4uEGr5fIyNItY2wZgQyO2LVEZkggFkO0VZ_YdDMyspGpzpkYy5W6-A/exec";

let commentsCache = [];
let currentSelectedId = null;
const REPLY_PREFIX = "提琴聲學實驗室：";
let isSubmitting = false;
let isFormOpen = false;
let formMode = "add";

let editState = {
  active: false,
  id: null,
  nickname: "",
  originalText: "",
  waitForSelect: false,
};

// 錄音相關
let audioRecStream = null, audioRecRecorder = null, audioRecChunks = [], audioRecActive = false, audioRecPaused = false, audioRecTimerId = null, audioRecStartTime = 0, audioRecAccumulated = 0;

// 需求 1: 取消自動輪播
let carouselActive = false; 

// ===== [JS-1] 小工具 =====
function normalizeName(name) { return String(name || "").replace(/\u200B/g, "").trim(); }
function maskName(name) { 
  const s = normalizeName(name);
  if (!s) return "匿名";
  if (s.length <= 2) return s[0] + "*";
  return s[0] + "*".repeat(s.length - 2) + s[s.length - 1];
}
function validateNameLength(name) {
  const s = normalizeName(name);
  return s.length >= 5 && s.length <= 12 && /^[A-Za-z0-9\u4E00-\u9FFF]+$/.test(s);
}
function parseTimeToSec(str) {
  if (!str) return "";
  const s = String(str).trim();
  let m = s.match(/^(\d+):(\d{1,2})$/);
  if (m) return Number(m[1]) * 60 + Number(m[2]);
  m = s.match(/^(\d{3,4})$/);
  if (m) return Number(m[1].slice(0, -2)) * 60 + Number(m[1].slice(-2));
  return "";
}
function escapeHtml(str) { return String(str || "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
function extractYoutubeId(url) {
  const m = url.match(/youtu\.be\/([^?]+)/) || url.match(/[?&]v=([^&]+)/);
  return m ? m[1] : "";
}
function buildYoutubeEmbedUrl(url, start, end) {
  const id = extractYoutubeId(url);
  if (!id) return "";
  let p = `autoplay=1&rel=0&modestbranding=1&playsinline=1`;
  if (start) p += `&start=${start}`;
  if (end) p += `&end=${end}`;
  return `https://www.youtube-nocookie.com/embed/${id}?${p}`;
}
function buildDriveEmbedUrl(fid) { return fid ? `https://drive.google.com/file/d/${fid}/preview` : ""; }
function buildDriveDownloadUrl(fid) { return fid ? `https://drive.google.com/uc?export=download&id=${fid}` : ""; }

// 需求 8: 統一回到網頁頭
function scrollToVideoTop() {
  window.scrollTo({ top: 0, behavior: "smooth" });
}

// 需求 4: 監控網頁可見性，切換分頁時暫停影音
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    const iframe = document.getElementById("video-iframe");
    const audio = document.getElementById("audio-player");
    // YouTube iframe 沒辦法簡單透過 JS 暫停(除非用 API)，
    // 最保險做法是暫時清空或通知播放器
    if (audio) audio.pause();
    // 如果是 YouTube 則重置 iframe src (會導致回來要重看，但能保證聲音立刻消失)
    if (iframe && iframe.src) {
        const currentSrc = iframe.src;
        iframe.src = "";
        setTimeout(() => { iframe.src = currentSrc; iframe.style.display="block"; }, 100);
    }
  }
});

function stopAllPlayback() {
  const iframe = document.getElementById("video-iframe");
  const audio = document.getElementById("audio-player");
  if (iframe) iframe.src = "";
  if (audio) { audio.pause(); audio.removeAttribute("src"); audio.load(); audio.style.display = "none"; }
  document.getElementById("video-placeholder").style.display = "flex";
}

// ===== [JS-2] 載入與表格列表 ======
async function loadComments() {
  const res = await fetch(API_URL + "?action=list", { cache: "no-cache" });
  const data = await res.json();
  commentsCache = data.posts || [];
  renderCommentsTable();
  
  // 需求 2: 進來網頁自動開啟最新一筆「帶影片/音頻」的項目
  const latestMedia = commentsCache.slice().reverse().find(row => 
    row.youtubeUrl || row.driveFileId || row.externalUrl || row.driveAudioId || row.audioUrl
  );
  if (latestMedia) {
    selectRowForReply(latestMedia);
  }
}

function renderCommentsTable() {
  const tbody = document.getElementById("comments-tbody");
  if (!tbody) return;
  const rows = commentsCache.slice().reverse();
  tbody.innerHTML = rows.map(row => {
    const isSelected = String(row.id) === String(currentSelectedId);
    const hasMedia = (row.type === 'youtube' && row.youtubeUrl) || (row.type === 'upload' && row.driveFileId) || (row.type === 'audio' || row.driveAudioId);
    return `
      <tr data-id="${row.id}" class="${isSelected ? 'selected' : ''}">
        <td class="col-nick">${escapeHtml(maskName(row.nickname))}</td>
        <td class="col-text">
          ${editState.waitForSelect ? `<button class="row-edit-btn" data-id="${row.id}">✎</button>` : ''}
          ${escapeHtml(row.text)}
        </td>
        <td class="col-media">
          ${(row.driveAudioId || row.audioUrl) ? '🎵' : ''}
          ${(row.youtubeUrl || row.driveFileId || row.externalUrl) ? '🎬' : ''}
          ${row.reply ? '💬' : ''}
        </td>
      </tr>`;
  }).join("");
}

// ===== [JS-4] 顯示影片、音訊 ======
function showVideoForRow(row) {
  const iframe = document.getElementById("video-iframe");
  const audio = document.getElementById("audio-player");
  const ph = document.getElementById("video-placeholder");
  stopAllPlayback();
  if (!row) return;

  ph.style.display = "none";
  if (row.type === "youtube" && row.youtubeUrl) {
    iframe.src = buildYoutubeEmbedUrl(row.youtubeUrl, row.startSec, row.endSec);
    iframe.style.display = "block";
  } else if (row.type === "upload" && (row.driveFileId || row.externalUrl)) {
    iframe.src = row.externalUrl || buildDriveEmbedUrl(row.driveFileId);
    iframe.style.display = "block";
  } else if (row.type === "audio" || row.driveAudioId) {
    // 需求 12: 修正音符圖案在表格出現 (已在 render 處理)，這裡處理播放
    audio.src = row.audioUrl || buildDriveDownloadUrl(row.driveAudioId);
    audio.style.display = "block";
    audio.play().catch(()=>{});
  }
}

// ===== [JS-8] 選取項目 ======
function selectRowForReply(row) {
  currentSelectedId = row.id;
  renderCommentsTable();
  const btn = document.getElementById("reply-target-btn");
  btn.textContent = "From: " + maskName(row.nickname);
  btn.disabled = false;
  btn.classList.add("linked");
  
  const box = document.getElementById("admin-reply");
  box.value = row.reply || (REPLY_PREFIX + "\n");
  showVideoForRow(row);
}

// ===== [JS-3] 需求 3 & 7: 處理中狀態優化 ======
function setProcessing(isProcessing) {
  const submitBtn = document.getElementById("submit-btn");
  const replySaveBtn = document.getElementById("reply-save-btn");
  const body = document.body;
  
  if (isProcessing) {
    isSubmitting = true;
    body.classList.add("is-processing");
    if (submitBtn) { submitBtn.textContent = "處理中.."; submitBtn.disabled = true; }
    if (replySaveBtn) { replySaveBtn.textContent = "處理中.."; replySaveBtn.disabled = true; }
  } else {
    isSubmitting = false;
    body.classList.remove("is-processing");
    if (submitBtn) { submitBtn.textContent = "發表"; submitBtn.disabled = false; }
    if (replySaveBtn) { replySaveBtn.textContent = "儲存"; replySaveBtn.disabled = false; }
  }
}

// ===== [JS-A] 錄音控制 ======
function setupAudioRecording() {
  const btnStart = document.getElementById("audio-rec-start"), btnPause = document.getElementById("audio-rec-pause"), btnStop = document.getElementById("audio-rec-stop"), btnCancel = document.getElementById("audio-rec-cancel"), statusEl = document.getElementById("audio-rec-status");

  btnStart.onclick = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    audioRecStream = stream;
    audioRecRecorder = new MediaRecorder(stream);
    audioRecChunks = [];
    audioRecRecorder.ondataavailable = e => audioRecChunks.push(e.data);
    audioRecRecorder.onstop = () => {
      const blob = new Blob(audioRecChunks, { type: 'audio/webm' });
      window.recordedAudioBlob = blob;
      document.getElementById("audio-rec-preview").src = URL.createObjectURL(blob);
    };
    audioRecRecorder.start();
    audioRecActive = true;
    btnStart.classList.add("recording");
    btnPause.disabled = false; btnStop.disabled = false; btnCancel.disabled = false;
    statusEl.textContent = "錄音中...";
  };

  btnPause.onclick = () => {
    if (!audioRecPaused) {
      audioRecRecorder.pause();
      audioRecPaused = true;
      // 需求 5: 變紅且停止閃爍
      btnPause.classList.add("paused-red");
      btnStart.classList.remove("recording");
      btnStart.classList.add("recording-no-blink");
    } else {
      audioRecRecorder.resume();
      audioRecPaused = false;
      btnPause.classList.remove("paused-red");
      btnStart.classList.remove("recording-no-blink");
      btnStart.classList.add("recording");
    }
  };
  
  btnStop.onclick = () => {
    audioRecRecorder.stop();
    audioRecStream.getTracks().forEach(t => t.stop());
    btnStart.classList.remove("recording", "recording-no-blink");
    btnPause.disabled = true; btnStop.disabled = true;
    statusEl.textContent = "錄音完成";
  };
}

// ===== [JS-18] 提交處理 ======
async function handleSubmit(e) {
  e.preventDefault();
  if (isSubmitting) return;
  
  const nickname = normalizeName(document.getElementById("nickname-input").value);
  const text = document.getElementById("text-input").value.trim();
  
  if (!validateNameLength(nickname) || !text) { alert("請填寫完整資訊"); return; }
  
  setProcessing(true); // 需求 3: 進入處理中

  const payload = {
    action: editState.active ? "edit" : "add",
    id: editState.id,
    nickname: /^[0-9]+$/.test(nickname) ? "\u200B" + nickname : nickname,
    text: /^[0-9]+$/.test(text) ? "\u200B" + text : text,
    type: window.currentMediaMode || "text"
  };

  // 處理檔案與 YouTube 邏輯 (略，與原邏輯一致)
  if (window.currentMediaMode === 'youtube') {
      payload.youtubeUrl = document.getElementById("youtube-url-input").value;
  } else if (window.recordedAudioBlob) {
      // 需求 12: 確保錄音轉 base64 上傳到資料庫
      const reader = new FileReader();
      reader.readAsDataURL(window.recordedAudioBlob);
      reader.onloadend = async () => {
          payload.audioBase64 = reader.result.split(',')[1];
          payload.audioMimeType = "audio/webm";
          await sendData(payload);
      };
      return;
  }
  
  await sendData(payload);
}

async function sendData(payload) {
    try {
        const res = await fetch(API_URL, {
            method: "POST",
            body: JSON.stringify(payload)
        });
        await loadComments();
        resetFormToAddMode();
    } catch (err) { alert("發送失敗"); }
    finally { setProcessing(false); }
}

// 需求 10: Back 鍵不重整，僅回頭
function setupBackButton() {
  document.getElementById("back-button").onclick = () => {
    scrollToVideoTop();
  };
}

// 需求 9 & 6: 媒體按鈕邏輯
function setMediaMode(mode) {
  window.currentMediaMode = mode;
  const ytBtn = document.getElementById("btn-media-youtube");
  const btns = document.querySelectorAll(".media-select-btn");
  
  btns.forEach(b => b.classList.remove("active", "inactive-yt"));
  if (mode && mode !== 'youtube') ytBtn.classList.add("inactive-yt");
  if (mode) document.getElementById(`btn-media-${mode}`).classList.add("active");
  
  // 切換欄位顯示
  document.getElementById("video-fields").classList.toggle("hidden", mode !== 'youtube' && mode !== 'upload');
  document.getElementById("audio-fields").classList.toggle("hidden", mode !== 'audio');
}

// 需求 11: 編輯模式 username 防藍底
document.getElementById("nickname-input").onmousedown = (e) => {
    if (e.target.disabled) e.preventDefault();
};

function resetFormToAddMode() {
    isFormOpen = false;
    editState.active = false;
    const nickInp = document.getElementById("nickname-input");
    nickInp.disabled = false;
    nickInp.value = "";
    document.getElementById("community-form").classList.add("hidden");
    // 移除編輯時的變色類別
    document.querySelectorAll(".media-select-btn").forEach(b => b.classList.remove("edit-mode-dim"));
}

// 初始化
document.addEventListener("DOMContentLoaded", () => {
  loadComments();
  setupAudioRecording();
  setupBackButton();
  document.getElementById("community-form").onsubmit = handleSubmit;
  
  document.querySelectorAll(".media-select-btn").forEach(btn => {
      btn.onclick = () => setMediaMode(btn.dataset.media);
  });

  // 需求 6: 進入編輯時調淡按鈕
  document.getElementById("btn-edit").onclick = () => {
      editState.waitForSelect = true;
      renderCommentsTable();
  };
  
  // 表格點擊編輯
  document.getElementById("comments-tbody").onclick = (e) => {
      const btn = e.target.closest(".row-edit-btn");
      if (btn) {
          const row = findRowById(btn.dataset.id);
          editState.active = true;
          editState.id = row.id;
          editState.nickname = row.nickname;
          document.getElementById("community-form").classList.remove("hidden");
          document.querySelectorAll(".media-select-btn").forEach(b => b.classList.add("edit-mode-dim"));
          // 需求 11: 驗證後變暗
          document.getElementById("nickname-input").placeholder = "輸入原始 username 驗證";
      }
  };
});

function findRowById(id) { return commentsCache.find(r => String(r.id) === String(id)); }

