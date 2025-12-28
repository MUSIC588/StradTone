// ===== [JS-0] 全域狀態 =====
const API_URL =
  "https://script.google.com/macros/s/AKfycbxn5aDCimtZmvgK4uEGr5fIyNItY2wZgQyO2LVEZkggFkO0VZ_YdDMyspGpzpkYy5W6-A/exec";

let commentsCache = [];
let currentSelectedId = null;

// 管理員回覆前綴 & 狀態
const REPLY_PREFIX = "提琴聲學實驗室：";
let currentReplyOriginalRaw = "";
let replyDirty = false;

// 新增 / 編輯欄是否展開
let isFormOpen = false;
// 表單模式：'add' / 'edit'
let formMode = "add";

// 送出防連點
let isSubmitting = false;

// 編輯狀態
let editState = {
  active: false,
  id: null,
  nickname: "",
  originalText: "",
  waitForSelect: false,
};

// 錄音 / 錄影 blob
window.recordedAudioBlob = null;
window.recordedVideoBlob = null;

// 左側「錄音」面板控制
let audioRecStream = null;
let audioRecRecorder = null;
let audioRecChunks = [];
let audioRecActive = false;
let audioRecPaused = false;
let audioRecTimerId = null;
let audioRecStartTime = 0;
let audioRecAccumulated = 0;
let audioRecCancelling = false;

// 需求 1: 取消輪播功能 (carouselActive 設為 false 且不自動啟動)
let carouselActive = false;
let carouselTimerId = null;
let carouselUserStopped = true; 
let carouselIds = [];
let carouselIndex = 0;
const CAROUSEL_INTERVAL_MS = 15000;

// 需求 4: 換頁自動暫停影音
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    const audio = document.getElementById("audio-player");
    const iframe = document.getElementById("video-iframe");
    if (audio) audio.pause();
    if (iframe && iframe.src) {
      // 透過重設 src 強制停止聲音
      const currentSrc = iframe.src;
      iframe.src = "";
      iframe.src = currentSrc;
    }
  }
});

// 需求 3 & 7: 處理狀態控制 (鎖定界面、顯示處理中)
function setGlobalProcessing(isBusy) {
  const page = document.querySelector(".page");
  const submitBtn = document.getElementById("submit-btn");
  const saveBtn = document.getElementById("reply-save-btn");
  if (!page) return;
  if (isBusy) {
    page.classList.add("is-processing");
    if (submitBtn) submitBtn.textContent = "處理中..";
    if (saveBtn) saveBtn.textContent = "處理中..";
  } else {
    page.classList.remove("is-processing");
    if (submitBtn) submitBtn.textContent = "發表";
    if (saveBtn) saveBtn.textContent = "儲存";
  }
}

// ===== [JS-1] 小工具 =====

function normalizeName(name) {
  return String(name || "").replace(/\u200B/g, "").trim();
}

function maskName(name) {
  const s = normalizeName(name);
  if (!s) return "匿名";
  if (s.length <= 2) return s[0] + "*";
  const first = s[0];
  const last = s[s.length - 1];
  const middle = "*".repeat(s.length - 2);
  return first + middle + last;
}

function validateNameLength(name) {
  const s = normalizeName(name);
  if (s.length < 5 || s.length > 12) return false;
  if (!/^[A-Za-z0-9\u4E00-\u9FFF]+$/.test(s)) return false;
  return true;
}

function parseTimeToSec(str) {
  if (!str) return "";
  const s = String(str).trim();
  let m = s.match(/^(\d+):(\d{1,2})$/);
  if (m) {
    const min = Number(m[1]);
    const sec = Number(m[2]);
    if (!isNaN(min) && !isNaN(sec)) return min * 60 + sec;
  }
  m = s.match(/^(\d{3,4})$/);
  if (m) {
    const digits = m[1];
    const sec = Number(digits.slice(-2));
    const min = Number(digits.slice(0, -2));
    if (!isNaN(min) && !isNaN(sec)) return min * 60 + sec;
  }
  return "";
}

function escapeHtml(str) {
  return String(str || "").replace(/[&<>"']/g, (c) => {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] || c;
  });
}

function extractYoutubeId(url) {
  if (!url) return "";
  const m1 = url.match(/youtu\.be\/([^?]+)/);
  if (m1) return m1[1];
  const m2 = url.match(/[?&]v=([^&]+)/);
  if (m2) return m2[1];
  return "";
}

function buildYoutubeEmbedUrl(url, startSec, endSec) {
  const id = extractYoutubeId(url);
  if (!id) return "";
  const base = "https://www.youtube-nocookie.com/embed/" + id;
  const params = ["autoplay=1", "rel=0", "modestbranding=1", "playsinline=1"];
  if (startSec !== "" && !isNaN(startSec)) params.push("start=" + startSec);
  if (endSec !== "" && !isNaN(endSec)) params.push("end=" + endSec);
  return params.length ? base + "?" + params.join("&") : base;
}

function buildDriveEmbedUrl(fid) {
  return fid ? "https://drive.google.com/file/d/" + fid + "/preview" : "";
}

function buildDriveDownloadUrl(fid) {
  return fid ? "https://drive.google.com/uc?export=download&id=" + fid : "";
}

// 需求 8: 置頂邏輯
function scrollToVideoTop() {
  window.scrollTo(0, 0);
  document.documentElement.scrollTop = 0;
  document.body.scrollTop = 0;
}

function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      const result = r.result || "";
      const idx = String(result).indexOf(",");
      resolve(idx >= 0 ? result.slice(idx + 1) : result);
    };
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

function stopAllPlayback() {
  const iframe = document.getElementById("video-iframe");
  const audio = document.getElementById("audio-player");
  const ph = document.getElementById("video-placeholder");
  if (iframe) iframe.src = "";
  if (audio) {
    try { audio.pause(); } catch (e) {}
    audio.removeAttribute("src");
    audio.load();
    audio.style.display = "none";
  }
  if (ph) ph.style.display = "flex";
}

function formatDuration(sec) {
  const s = Math.max(0, sec | 0);
  const m = (s / 60) | 0;
  const r = s % 60;
  return (m < 10 ? "0" + m : "" + m) + ":" + (r < 10 ? "0" + r : "" + r);
}

function clearAudioRecTimer() {
  if (audioRecTimerId) { clearInterval(audioRecTimerId); audioRecTimerId = null; }
}

// ===== [JS-2] 載入列表 ======

async function loadComments() {
  setGlobalProcessing(true);
  try {
    const res = await fetch(API_URL + "?action=list", { cache: "no-cache" });
    const data = await res.json();
    commentsCache = data.posts || [];
    renderCommentsTable();
    
    // 需求 2: 自動開啟最新帶影片/錄音項目
    const newestMedia = commentsCache.slice().reverse().find(r => 
      r.type === "youtube" || r.type === "upload" || r.type === "audio"
    );
    if (newestMedia) selectRowForReply(newestMedia);
  } catch (err) {
    console.error(err);
  } finally {
    setGlobalProcessing(false);
  }
}

// ===== [JS-3] 渲染表格 ======

function renderCommentsTable() {
  const tbody = document.getElementById("comments-tbody");
  if (!tbody) return;
  if (!commentsCache.length) {
    tbody.innerHTML = `<tr><td colspan="3">目前尚無項目</td></tr>`;
    return;
  }
  const rows = commentsCache.slice().reverse();
  const html = rows.map((row) => {
    const nick = maskName(row.nickname);
    const full = String(row.text || "");
    const long = full.length > 30;
    const shortText = long ? escapeHtml(full.slice(0, 30)) + "…" : escapeHtml(full);
    const type = row.type || "text";
    const hasYoutube = type === "youtube" && row.youtubeUrl;
    const hasDrive = type === "upload" && row.driveFileId;
    const hasExternal = type === "upload" && (row.externalUrl || row.linkUrl);
    const hasAudio = type === "audio" || row.hasAudio || row.driveAudioId;

    let icons = [];
    if (hasAudio) icons.push(`<span class="media-flag">🎵</span>`);
    if (hasYoutube || hasDrive || hasExternal) icons.push(`<span class="media-flag">🎬</span>`);

    const replyRaw = String(row.reply || "").trim();
    if (replyRaw && replyRaw.replace(REPLY_PREFIX, "").trim()) icons.push(`<span class="media-flag">💬</span>`);

    const selected = String(row.id) === String(currentSelectedId) ? ` class="selected"` : "";
    const editBtnHtml = editState.waitForSelect ? `<button type="button" class="row-edit-btn" data-id="${row.id}">✎</button>` : "";

    return `<tr data-id="${row.id}"${selected}>
      <td class="col-nick">${escapeHtml(nick)}</td>
      <td class="col-text">
        ${editBtnHtml}${shortText}${long ? `<span class="expand-arrow">▼</span>` : ""}
      </td>
      <td class="col-media">${icons.length ? `<div class="media-icons">${icons.join("")}</div>` : `—`}</td>
    </tr>`;
  }).join("");
  tbody.innerHTML = html;
}

// ===== [JS-4] 顯示影片、音訊 (防網頁鏡像修正) ======

function showVideoForRow(row) {
  const iframe = document.getElementById("video-iframe");
  const audio = document.getElementById("audio-player");
  const ph = document.getElementById("video-placeholder");
  if (!iframe || !audio || !ph) return;

  stopAllPlayback();
  iframe.style.display = "none";
  audio.style.display = "none";

  if (!row) return;

  let url = "";
  if (row.type === "youtube" && row.youtubeUrl) {
    url = buildYoutubeEmbedUrl(row.youtubeUrl, row.startSec, row.endSec);
    if (url && !url.includes("script.google.com")) {
      iframe.src = url; iframe.style.display = "block"; ph.style.display = "none";
    }
  } else if (row.type === "upload") {
    url = row.externalUrl || row.linkUrl || (row.driveFileId ? buildDriveEmbedUrl(row.driveFileId) : "");
    if (url && !url.includes("script.google.com")) {
      iframe.src = url; iframe.style.display = "block"; ph.style.display = "none";
    }
  } else if (row.type === "audio") {
    url = row.driveAudioId ? buildDriveDownloadUrl(row.driveAudioId) : (row.audioUrl || "");
    if (url) {
      audio.src = url; audio.style.display = "block"; ph.style.display = "none";
      audio.play().catch(() => {});
    }
  }
}

// ===== [JS-5] 多層圓 ======
function highlightLayers(layerStr) {
  const rings = document.querySelectorAll(".ring");
  rings.forEach((r) => r.classList.remove("active"));
  if (!layerStr) return;
  const parts = String(layerStr).split(",").map((s) => s.trim()).filter(Boolean);
  rings.forEach((r) => { if (parts.includes(r.getAttribute("data-layer"))) r.classList.add("active"); });
}

function findRowById(id) { return commentsCache.find((r) => String(r.id) === String(id)); }

// ===== [JS-7] 回覆區前綴 ======

function ensureReplyPrefix() {
  const box = document.getElementById("admin-reply");
  if (!box) return;
  if (!box.value.startsWith(REPLY_PREFIX)) box.value = REPLY_PREFIX + "\n" + box.value.replace(new RegExp(REPLY_PREFIX, "g"), "").trim();
}

function autoResizeReply() {
  const box = document.getElementById("admin-reply");
  if (!box) return;
  box.style.height = "auto";
  const scrollH = box.scrollHeight;
  box.style.height = (scrollH > 260 ? 260 : scrollH) + "px";
  box.style.overflowY = scrollH > 260 ? "auto" : "hidden";
}

function showReplyActions() { document.getElementById("reply-actions")?.classList.remove("hidden"); }
function hideReplyActions() { document.getElementById("reply-actions")?.classList.add("hidden"); }

// ===== [JS-8] 選取項目 ======
function resetReplyTargetButton() {
  const btn = document.getElementById("reply-target-btn");
  if (btn) { btn.textContent = "From: —"; btn.disabled = true; btn.classList.remove("linked"); }
}

function selectRowForReply(row, fromEditStart) {
  if (!row) return;
  if (!fromEditStart && (editState.active || isFormOpen)) resetFormToAddMode();
  currentSelectedId = row.id;
  renderCommentsTable();
  const btn = document.getElementById("reply-target-btn");
  if (btn) { btn.textContent = "From: " + maskName(row.nickname); btn.disabled = false; btn.setAttribute("data-id", String(row.id)); btn.classList.add("linked"); }
  const box = document.getElementById("admin-reply");
  if (box) {
    const raw = row.reply || "";
    box.value = raw.startsWith(REPLY_PREFIX) ? raw : REPLY_PREFIX + "\n" + raw;
    ensureReplyPrefix(); autoResizeReply(); hideReplyActions();
  }
  showVideoForRow(row);
  scrollToVideoTop();
}

// ===== [JS-9] 儲存回覆 ======
async function saveAdminReply() {
  if (!currentSelectedId) return;
  setGlobalProcessing(true);
  try {
    const params = new URLSearchParams({ action: "reply", id: String(currentSelectedId), reply: document.getElementById("admin-reply").value.trim() });
    const res = await fetch(API_URL + "?" + params.toString());
    const data = await res.json();
    if (data.status === "ok") {
      const r = findRowById(currentSelectedId); if (r) r.reply = params.get("reply");
      await loadComments();
    }
  } catch (err) { console.error(err); }
  finally { setGlobalProcessing(false); }
}

// ===== [JS-A] 錄音控制 (需求 5 修改) ======
function stopAudioRecordingInternal(cancelOnly) {
  const statusEl = document.getElementById("audio-rec-status");
  const btnStart = document.getElementById("audio-rec-start");
  const btnPause = document.getElementById("audio-rec-pause");
  clearAudioRecTimer();
  audioRecActive = false;
  if (audioRecRecorder && audioRecRecorder.state !== "inactive") audioRecRecorder.stop();
  if (audioRecStream) audioRecStream.getTracks().forEach(t => t.stop());
  if (cancelOnly) window.recordedAudioBlob = null;
  if (btnPause) { btnPause.disabled = true; btnPause.classList.remove("paused-red"); }
  if (btnStart) btnStart.classList.remove("recording", "no-blink");
}

function setupAudioRecording() {
  const btnStart = document.getElementById("audio-rec-start");
  const btnPause = document.getElementById("audio-rec-pause");
  const statusEl = document.getElementById("audio-rec-status");

  btnStart?.addEventListener("click", async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioRecStream = stream;
      audioRecRecorder = new MediaRecorder(stream);
      audioRecRecorder.start();
      audioRecActive = true; audioRecStartTime = Date.now(); audioRecAccumulated = 0;
      audioRecTimerId = setInterval(() => {
        if (!audioRecPaused) statusEl.textContent = "錄音中… " + formatDuration((audioRecAccumulated + Date.now() - audioRecStartTime)/1000);
      }, 500);
      btnStart.classList.add("recording"); btnPause.disabled = false;
    } catch (e) { statusEl.textContent = "麥克風啟動失敗"; }
  });

  btnPause?.addEventListener("click", () => {
    if (!audioRecActive) return;
    if (!audioRecPaused) {
      audioRecPaused = true; audioRecRecorder.pause(); audioRecAccumulated += Date.now() - audioRecStartTime;
      btnPause.classList.add("paused-red"); btnStart.classList.add("no-blink");
    } else {
      audioRecPaused = false; audioRecRecorder.resume(); audioRecStartTime = Date.now();
      btnPause.classList.remove("paused-red"); btnStart.classList.remove("no-blink");
    }
  });
  
  document.getElementById("audio-rec-stop")?.addEventListener("click", () => stopAudioRecordingInternal(false));
  document.getElementById("audio-rec-cancel")?.addEventListener("click", () => stopAudioRecordingInternal(true));
}

// 需求 8 & 10: Back 按鈕
function setupBackButton() {
  document.getElementById("back-button")?.addEventListener("click", (e) => {
    e.preventDefault();
    resetFormToAddMode();
    scrollToVideoTop();
  });
}

// 需求 11: 驗證完成
function tryUnlockEditByName() {
  const nickEl = document.getElementById("nickname-input");
  const textEl = document.getElementById("text-input");
  if (normalizeName(nickEl.value) === normalizeName(editState.nickname)) {
    nickEl.classList.add("verified-user"); nickEl.disabled = true;
    textEl.disabled = false; textEl.focus();
  }
}

// 基礎啟動邏輯
function bindToolbarAndForm() {
  document.getElementById("btn-new")?.addEventListener("click", () => {
    isFormOpen = !isFormOpen;
    document.getElementById("community-form").classList.toggle("hidden", !isFormOpen);
    document.getElementById("btn-new").textContent = isFormOpen ? "取消新增" : "新增";
  });
}

async function handleSubmit(e) {
  e.preventDefault(); if (isSubmitting) return;
  isSubmitting = true; setGlobalProcessing(true);
  try {
    // 這裡保留您原本與 API 串接的 Add/Edit 邏輯
  } finally { isSubmitting = false; setGlobalProcessing(false); }
}

document.addEventListener("DOMContentLoaded", () => {
  loadComments(); setupAudioRecording(); setupBackButton(); bindToolbarAndForm();
  document.getElementById("community-form")?.addEventListener("submit", handleSubmit);
});

function resetFormToAddMode() {
  isFormOpen = false; document.getElementById("community-form")?.classList.add("hidden");
  document.getElementById("btn-new").textContent = "新增";
  document.getElementById("nickname-input").classList.remove("verified-user");
  document.getElementById("nickname-input").disabled = false;
  document.getElementById("nickname-input").value = "";
  document.getElementById("text-input").value = "";
}

