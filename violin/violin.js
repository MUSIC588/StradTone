// violin.js - 完整且修正後的版本

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
// 表單模式：'add' / 'edit'（只用來決定按鈕字樣）
let formMode = "add";

// 送出防連點
let isSubmitting = false;

// [JS-MOD] 新增：網頁處理中狀態 (第 3 點, 第 7 點)
let isProcessing = false;

// 編輯狀態：按下「編輯」後才會啟動
let editState = {
  active: false,
  id: null,
  nickname: "",
  originalText: "",
  waitForSelect: false,
};

// 錄音 / 錄影 blob（預留）
window.recordedAudioBlob = null;
window.recordedVideoBlob = null;

// 左側「錄音」面板用的錄音控制
let audioRecStream = null;
let audioRecRecorder = null;
let audioRecChunks = [];
let audioRecActive = false;
let audioRecPaused = false;
let audioRecTimerId = null;
let audioRecStartTime = 0;
let audioRecAccumulated = 0;
let audioRecCancelling = false;

// 項目輪播（自動播放）用
let carouselActive = false;
let carouselTimerId = null;
// [JS-MOD] 輪播停止狀態：只有在**進行互動**後才停止 (第 2 點)
let isInteracting = false; 
let carouselIds = [];
let carouselIndex = 0;
const CAROUSEL_INTERVAL_MS = 15000; // 每 15 秒換下一筆

// ===== [JS-1] 小工具 =====

// 統一處理名稱字串（去掉零寬字元、前後空白）
function normalizeName(name) {
  return String(name || "").replace(/\u200B/g, "").trim();
}

// 遮蔽名稱
function maskName(name) {
  const s = normalizeName(name);
  if (!s) return "匿名";
  if (s.length <= 2) return s[0] + "*";
  const first = s[0];
  const last = s[s.length - 1];
  const middle = "*".repeat(s.length - 2);
  return first + middle + last;
}

// 名稱需 5～12 字 & 禁止特殊符號（允許純數字、英文、中文字）
function validateNameLength(name) {
  const s = normalizeName(name);
  if (s.length < 5 || s.length > 12) return false;
  if (!/^[A-Za-z0-9\u4E00-\u9FFF]+$/.test(s)) return false;
  return true;
}

// 時間字串 → 秒數
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
    return (
      {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      }[c] || c
    );
  });
}

// YouTube ID
function extractYoutubeId(url) {
  if (!url) return "";
  const m1 = url.match(/youtu\.be\/([^?]+)/);
  if (m1) return m1[1];
  const m2 = url.match(/[?&]v=([^&]+)/);
  if (m2) return m2[1];
  return "";
}

// YouTube embed
function buildYoutubeEmbedUrl(url, startSec, endSec) {
  const id = extractYoutubeId(url);
  if (!id) return "";
  const base = "https://www.youtube-nocookie.com/embed/" + id;
  const params = [];

  // [JS-MOD] YouTube 影片播放時不再預設 autoplay，交由輪播邏輯處理 (第 1 點)
  // params.push("autoplay=1"); 
  params.push("rel=0", "modestbranding=1", "playsinline=1");

  if (startSec !== "" && !isNaN(startSec)) {
    params.push("start=" + startSec);
  }
  if (endSec !== "" && !isNaN(endSec)) {
    params.push("end=" + endSec);
  }

  return params.length ? base + "?" + params.join("&") : base;
}

// Google Drive embed（影片）
function buildDriveEmbedUrl(fid) {
  return fid ? "https://drive.google.com/file/d/" + fid + "/preview" : "";
}

// Google Drive 直連（音訊）
function buildDriveDownloadUrl(fid) {
  return fid ? "https://drive.google.com/uc?export=download&id=" + fid : "";
}

// [JS-MOD] 卷軸回到頁面頂端（Header 處） (第 8 點, 第 10 點)
function scrollToVideoTop() {
  const header = document.getElementById("site-header");
  if (header) {
      header.scrollIntoView({
          behavior: "smooth",
          block: "start", // 捲動到元素頂部
      });
  } else {
      window.scrollTo({
          top: 0,
          behavior: "smooth",
      });
  }
}

// Base64
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

// 停止右上角影片 & 音訊播放 (第 4 點)
function stopAllPlayback() {
  const iframe = document.getElementById("video-iframe");
  const audio = document.getElementById("audio-player");
  const ph = document.getElementById("video-placeholder");

  // [JS-MOD] 停止播放 (第 4 點)
  if (iframe) {
    // 讓 YouTube 影片停止播放，清空 src 是最有效的方式
    iframe.src = "";
  }
  if (audio) {
    try {
      audio.pause();
      // [JS-MOD] 影片或錄音都需要重置時間到 0，下次才可從頭開始 (第 4 點)
      audio.currentTime = 0; 
    } catch (e) {}
    audio.removeAttribute("src");
    audio.load();
    audio.style.display = "none";
  }
  if (ph) {
    ph.style.display = "flex";
  }
}

// 錄音時間格式化（mm:ss）
function formatDuration(sec) {
  const s = Math.max(0, sec | 0);
  const m = (s / 60) | 0;
  const r = s % 60;
  const mm = m < 10 ? "0" + m : "" + m;
  const ss = r < 10 ? "0" + r : "" + r;
  return mm + ":" + ss;
}

function clearAudioRecTimer() {
  if (audioRecTimerId) {
    clearInterval(audioRecTimerId);
    audioRecTimerId = null;
  }
}

// [JS-MOD] 設定「處理中」狀態 (第 3 點, 第 7 點)
function setProcessing(state, message) {
    isProcessing = !!state;
    const body = document.body;
    const submitBtn = document.getElementById("submit-btn");
    
    // 透過 data 屬性控制 CSS 鎖定 (第 7 點)
    body.setAttribute("data-processing", isProcessing ? "true" : "false");

    if (submitBtn) {
        submitBtn.disabled = isProcessing;
    }

    if (message) {
        if (isProcessing) {
            // [JS-MOD] 顯示「處理中...」，但按鈕文字不變 (第 3 點)
            // 這裡我們只改變按鈕的 disabled 狀態，不改變文字，因為您提到這是不得已的狀態
            console.log(`[處理中] 網站正在處理: ${message}`);
        }
    }
}


// ===== [JS-2] 載入與表格列表 ======

async function loadComments() {
  const res = await fetch(API_URL + "?action=list", { cache: "no-cache" });
  const data = await res.json();
  commentsCache = data.posts || [];
  renderCommentsTable();
  startCarouselIfPossible();
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

  const html = rows
    .map((row) => {
      const nick = maskName(row.nickname);
      const full = String(row.text || "");
      const long = full.length > 30;
      const shortText = long
        ? escapeHtml(full.slice(0, 30)) + "…"
        : escapeHtml(full);

      const type = row.type || "text";

      const hasYoutube = type === "youtube" && row.youtubeUrl;
      const hasDrive = type === "upload" && row.driveFileId;
      const hasExternal = type === "upload" && (row.externalUrl || row.linkUrl);
      const hasAudio =
        type === "audio" || row.hasAudio || row.driveAudioId;

      let mediaHtml = `<span style="opacity:.5">—</span>`;
      const icons = [];

      if (hasAudio) {
        icons.push(
          `<span class="media-flag" title="錄音">🎵</span>`
        );
      }

      if (hasYoutube || hasDrive || hasExternal) {
        icons.push(
          `<span class="media-flag" title="影片 / 網頁">🎬</span>`
        );
      }

      const replyRaw = String(row.reply || "").trim();
      let hasRealReply = false;
      if (replyRaw) {
        const withoutPrefix = replyRaw.replace(REPLY_PREFIX, "").trim();
        hasRealReply = !!withoutPrefix;
      }

      if (hasRealReply) {
        icons.push(
          `<span class="media-flag" title="已有回覆">💬</span>`
        );
      }

      if (icons.length) {
        mediaHtml = `<div class="media-icons">${icons.join("")}</div>`;
      }

      const selected =
        String(row.id) === String(currentSelectedId) ? ` class="selected"` : "";

      const needEditButton = !!editState.waitForSelect;
      const editBtnHtml = needEditButton
        ? `<button type="button" class="row-edit-btn" data-id="${row.id}">✎</button>`
        : "";

      return `
        <tr data-id="${row.id}"${selected}>
          <td class="col-nick">${escapeHtml(nick)}</td>
          <td class="col-text" data-long="${long ? "1" : "0"}">
            ${editBtnHtml}${shortText}${
        long
          ? `<span class="expand-arrow" title="展開">▼</span>`
          : ""
      }
          </td>
          <td class="col-media">${mediaHtml}</td>
        </tr>
      `;
    })
    .join("");

  tbody.innerHTML = html;
}

// ===== [JS-4] 顯示影片、音訊 ======

function clearVideo() {
  stopAllPlayback();
}

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
    if (url) {
      iframe.src = url;
      iframe.style.display = "block";
      ph.style.display = "none";
      // [JS-MOD] 輪播時自動播放：這裡不處理，交由 runCarouselStep 處理
    }
    return;
  }

  if (row.type === "upload") {
    // 先看是否有一般網址（非 Drive）
    if (row.externalUrl || row.linkUrl) {
      url = row.externalUrl || row.linkUrl;
      if (url) {
        iframe.src = url;
        iframe.style.display = "block";
        ph.style.display = "none";
        return;
      }
    }

    if (row.driveFileId) {
      url = buildDriveEmbedUrl(row.driveFileId);
      if (url) {
        iframe.src = url;
        iframe.style.display = "block";
        ph.style.display = "none";
      }
      return;
    }
  }

  if (row.type === "audio") {
    if (row.driveAudioId) {
      url = buildDriveDownloadUrl(row.driveAudioId);
    } else if (row.audioUrl) {
      url = row.audioUrl;
    }

    if (url) {
      audio.src = url;
      audio.style.display = "block";
      ph.style.display = "none";
      try {
        audio.currentTime = 0;
        // [JS-MOD] 音訊自動播放 (第 1 點)
        audio.play().catch(() => {
             // 某些瀏覽器不允許自動播放
             console.log("Audio autoplay prevented.");
        }); 
      } catch (e) {}
    }
  }
}

// ===== [JS-5] 多層圓（預留） ======
function highlightLayers(layerStr) {
  const rings = document.querySelectorAll(".ring");
  rings.forEach((r) => r.classList.remove("active"));

  if (!layerStr) return;

  const parts = String(layerStr)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  rings.forEach((r) => {
    const v = r.getAttribute("data-layer");
    if (parts.includes(v)) r.classList.add("active");
  });
}

// ===== [JS-5.5] 輪播候選計算 & 控制 (第 1 點, 第 2 點) ======
function computeCarouselCandidates() {
  return commentsCache.filter((row) => {
    const type = row.type || "text";
    if (type === "youtube" && row.youtubeUrl) return true;
    if (type === "upload" && (row.driveFileId || row.externalUrl || row.linkUrl)) return true;
    return false;
  });
}

function runCarouselStep() {
  if (!carouselActive) return;

  // [JS-MOD] 如果用戶有互動，就停止輪播 (第 2 點)
  if (isInteracting) {
    stopCarousel("internal-interaction"); 
    return;
  }

  const candidates = computeCarouselCandidates();
  if (!candidates.length) {
    stopCarousel();
    return;
  }

  if (!carouselIds.length) {
    carouselIds = candidates.map((r) => r.id);
    carouselIndex = 0;
  }
  if (carouselIndex >= carouselIds.length) {
    carouselIndex = 0;
  }

  const id = carouselIds[carouselIndex++];
  const row = findRowById(id) || candidates[0];
  if (row) {
    selectRowForReply(row, false);
    
    // [JS-MOD] 模擬點擊播放動作 (第 1 點)
    const iframe = document.getElementById("video-iframe");
    if (iframe && row.type === "youtube" && iframe.src) {
      // 透過 postMessage 傳送播放指令，模擬點擊
      iframe.contentWindow.postMessage('{"event":"command","func":"playVideo"}', '*');
      console.log("Simulating YouTube play click for carousel.");
    }
  }

  if (!carouselActive) return;
  carouselTimerId = setTimeout(runCarouselStep, CAROUSEL_INTERVAL_MS);
}

function startCarouselIfPossible() {
  // [JS-MOD] 只有在 isInteracting 為 false 時才開始輪播 (第 2 點)
  if (isInteracting || carouselActive) return; 
  const candidates = computeCarouselCandidates();
  if (!candidates.length) return;

  carouselIds = candidates.map((r) => r.id);
  carouselIndex = 0;
  carouselActive = true;
  runCarouselStep();
}

// [JS-MOD] 統一停止輪播，如果是由用戶互動引起的，則永久停止 (第 2 點)
function stopCarousel(from) {
  if (carouselTimerId) {
    clearTimeout(carouselTimerId);
    carouselTimerId = null;
  }
  carouselActive = false;
  
  // 任何互動行為都會設定 isInteracting = true
  if (from === "user" || from === "internal-interaction") {
    isInteracting = true; 
  }
}

// ===== [JS-6] 查找 row ======
function findRowById(id) {
  return commentsCache.find((r) => String(r.id) === String(id));
}

// ===== [JS-7] 管理員回覆區前綴 & 自動高度 ======

function ensureReplyPrefix() {
  const box = document.getElementById("admin-reply");
  if (!box) return;
  const prefix = REPLY_PREFIX;
  let val = box.value || "";
  const oldStart = box.selectionStart || 0;

  if (!val) {
    box.value = prefix + "\n";
    try {
      box.setSelectionRange(box.value.length, box.value.length);
    } catch (e) {}
    return;
  }

  if (!val.startsWith(prefix)) {
    const withoutPrefix = val
      .replace(new RegExp(prefix, "g"), "")
      .replace(/^\s+/, "");
    box.value = prefix + "\n" + withoutPrefix;
  }

  let rest = box.value.slice(prefix.length);
  if (!rest.startsWith("\n")) {
    rest = "\n" + rest.replace(/^\s+/, "");
    box.value = prefix + rest;
  }

  const minPos = prefix.length + 1;
  let newPos = oldStart;
  if (newPos < minPos) newPos = minPos;
  try {
    box.setSelectionRange(newPos, newPos);
  } catch (e) {}
}

function autoResizeReply() {
  const box = document.getElementById("admin-reply");
  if (!box) return;
  
  // [JS-MOD] 如果正在處理中，就不要讓 textarea 響應，以防止 iOS 鍵盤跳出 (第 7 點)
  if (isProcessing) return;

  let maxH = 260;
  const fb = document.getElementById("fingerboard");
  if (fb) {
    const rect = fb.getBoundingClientRect();
    if (rect.height > 0) maxH = rect.height;
  }

  box.style.height = "auto";
  const scrollH = box.scrollHeight;
  if (scrollH <= maxH) {
    box.style.height = scrollH + "px";
    box.style.overflowY = "hidden";
    box.style.resize = "none";
  } else {
    box.style.height = maxH + "px";
    box.style.overflowY = "auto";
    box.style.resize = "vertical";
  }
}

function showReplyActions() {
  const wrap = document.getElementById("reply-actions");
  if (wrap) wrap.classList.remove("hidden");
  replyDirty = true;
}

function hideReplyActions() {
  const wrap = document.getElementById("reply-actions");
  if (wrap) wrap.classList.add("hidden");
  replyDirty = false;
}

// ===== [JS-8] 選取項目（自動展開 + 自動播放 + 回覆連動） ======
function resetReplyTargetButton() {
  const btn = document.getElementById("reply-target-btn");
  if (!btn) return;
  btn.textContent = "From: —";
  btn.disabled = true;
  btn.removeAttribute("data-id");
  btn.classList.remove("linked");
}

function selectRowForReply(row, fromEditStart) {
  if (!row) return;

  // [JS-MOD] 任何選取項目的行為都視為互動 (第 2 點)
  stopCarousel("internal-interaction");

  // 切換項目前先把錄音（麥克風）關掉
  if (typeof stopAudioRecordingInternal === "function") {
    stopAudioRecordingInternal(true);
  }

  if (!fromEditStart) {
    if (editState.active) {
      resetFormToAddMode();
    } else if (isFormOpen) {
      resetFormToAddMode();
    }
  }

  currentSelectedId = row.id;

  renderCommentsTable();

  const tbody = document.getElementById("comments-tbody");
  if (tbody) {
    Array.from(tbody.querySelectorAll("tr[data-id]")).forEach((tr) => {
      tr.classList.toggle(
        "selected",
        tr.getAttribute("data-id") === String(row.id)
      );
    });

    const tr = tbody.querySelector(`tr[data-id="${row.id}"]`);
    if (tr) {
      const cell = tr.querySelector("td.col-text");
      if (cell && String(row.text || "").length > 30) {
        // [JS-MOD] 選取時，自動展開文字 (原邏輯)
        cell.innerHTML =
          escapeHtml(row.text) +
          '<span class="expand-arrow" title="收合">▲</span>';
        cell.setAttribute("data-expanded", "1");
      }
      
      // [JS-MOD] 選取後捲動到頂部 (第 8 點)
      if (!fromEditStart) { // 編輯開始時不捲動，讓用戶專注於表單
         scrollToVideoTop();
      }
    }
  }

  const btn = document.getElementById("reply-target-btn");
  if (btn) {
    btn.textContent = "From: " + maskName(row.nickname);
    btn.disabled = false;
    btn.setAttribute("data-id", String(row.id));
    btn.classList.add("linked");
  }

  const box = document.getElementById("admin-reply");
  if (box) {
    const raw = row.reply || "";
    currentReplyOriginalRaw = raw;

    if (!raw) {
      box.value = REPLY_PREFIX + "\n";
    } else if (raw.startsWith(REPLY_PREFIX)) {
      box.value = raw;
    } else {
      box.value = REPLY_PREFIX + "\n" + raw;
    }
    ensureReplyPrefix();
    autoResizeReply();
    hideReplyActions();
    
    // [JS-MOD] 綁定多層圓和指板 (第 2 點)
    highlightLayers(row.layers);
    // 指板部分需要更詳細的邏輯，這裡先預留
  }

  showVideoForRow(row);
  scrollToVideoTop();
}

// ===== [JS-9] 儲存回覆 (第 3 點, 第 7 點) ======
async function saveAdminReply() {
  if (isProcessing) return; // 再次檢查，防止連點 (第 7 點)
  
  const box = document.getElementById("admin-reply");
  if (!box || !currentSelectedId) return;

  ensureReplyPrefix();
  autoResizeReply();

  const full = String(box.value || "").trim();

  let toSend = "";
  if (full) {
    let afterPrefix = full;
    if (full.startsWith(REPLY_PREFIX)) {
      afterPrefix = full.slice(REPLY_PREFIX.length);
    }
    if (afterPrefix.trim()) {
      toSend = full;
    }
  }

  // [JS-MOD] 啟動處理中狀態 (第 3 點)
  setProcessing(true, "儲存回覆");

  try {
    const params = new URLSearchParams({
      action: "reply",
      id: String(currentSelectedId),
      reply: toSend,
    });

    const res = await fetch(API_URL + "?" + params.toString());
    const data = await res.json();

    if (!data || data.status !== "ok") {
      throw new Error(data.error || "reply 失敗");
    }

    const r = findRowById(currentSelectedId);
    if (r) r.reply = toSend;

    await loadComments();
    const row = findRowById(currentSelectedId);
    if (row) {
      selectRowForReply(row);
    }

    hideReplyActions();
    try {
      box.blur(); // 儲存後收起鍵盤，回到「只看播放」的感覺
    } catch (e) {}
    // [JS-MOD] 儲存後捲動到頂部 (第 8 點)
    scrollToVideoTop();
  } catch (err) {
    console.error(err);
    alert("儲存回覆失敗：" + err.message);
  } finally {
    // [JS-MOD] 關閉處理中狀態 (第 3 點)
    setProcessing(false);
  }
}

function cancelAdminReply() {
  const row = findRowById(currentSelectedId);
  const box = document.getElementById("admin-reply");
  if (!box) return;

  if (row) {
    const raw = row.reply || "";
    if (!raw) {
      box.value = REPLY_PREFIX + "\n";
    } else if (raw.startsWith(REPLY_PREFIX)) {
      box.value = raw;
    } else {
      box.value = REPLY_PREFIX + "\n" + raw;
    }
  } else {
    box.value = REPLY_PREFIX + "\n";
  }
  ensureReplyPrefix();
  autoResizeReply();
  hideReplyActions();
}

// ===== [JS-10] 媒體模式切換（YouTube / 影片 / 錄音 互斥） ======
function clearRecordedMediaState() {
  if (typeof stopAudioRecordingInternal === "function") {
    stopAudioRecordingInternal(true);
  } else {
    window.recordedAudioBlob = null;
    window.recordedVideoBlob = null;
    const aStatus = document.getElementById("audio-rec-status");
    const previewEl = document.getElementById("audio-rec-preview");
    if (aStatus) aStatus.textContent = "錄音預備";
    if (previewEl) {
      try {
        previewEl.pause();
      } catch (e) {}
      previewEl.removeAttribute("src");
      previewEl.load();
    }
  }
}

function setMediaMode(mode) {
  window.currentMediaMode = mode || null;

  const btnYoutube = document.getElementById("btn-media-youtube");
  const btnUpload = document.getElementById("btn-media-upload");
  const btnAudio = document.getElementById("btn-media-audio");

  const videoFields = document.getElementById("video-fields");
  const audioFields = document.getElementById("audio-fields");
  const youtubeRow = document.getElementById("youtube-row");
  const videoUploadRow = document.getElementById("video-upload-row");
  const videoLinkRow = document.getElementById("video-link-row");
  const mediaSelectRow = document.querySelector(".media-select-row"); // 用來控制 CSS

  [btnYoutube, btnUpload, btnAudio].forEach((b) => {
    if (b) b.classList.remove("active");
  });
  
  // [JS-MOD] 設定 CSS 標記，用於 YouTube 按鈕變色 (第 9 點)
  if (mediaSelectRow) {
      mediaSelectRow.classList.toggle("edit-mode", formMode === "edit");
  }

  if (videoFields) videoFields.classList.add("hidden");
  if (audioFields) audioFields.classList.add("hidden");
  if (youtubeRow) youtubeRow.style.display = "none";
  if (videoUploadRow) videoUploadRow.style.display = "none";
  if (videoLinkRow) videoLinkRow.style.display = "none";

  if (!mode) return;

  if (mode === "youtube") {
    if (btnYoutube) btnYoutube.classList.add("active");
    if (videoFields) videoFields.classList.remove("hidden");
    if (youtubeRow) youtubeRow.style.display = "flex";
  } else if (mode === "upload") {
    if (btnUpload) btnUpload.classList.add("active");
    if (videoFields) videoFields.classList.remove("hidden");
    if (videoUploadRow) videoUploadRow.style.display = "flex";
    if (videoLinkRow) videoLinkRow.style.display = "flex";
  } else if (mode === "audio") {
    if (btnAudio) btnAudio.classList.add("active");
    if (audioFields) audioFields.classList.remove("hidden");
  }
}

// ===== [JS-11] 從「新增/編輯」復原成初始狀態 (已移動至此，確保 setMediaMode 可用) ======
function resetFormToAddMode() {
  const form = document.getElementById("community-form");
  const btnNew = document.getElementById("btn-new");
  const nickEl = document.getElementById("nickname-input");
  const textEl = document.getElementById("text-input");
  const ytEl = document.getElementById("youtube-url-input");
  const startEl = document.getElementById("start-input");
  const endEl = document.getElementById("end-input");
  const videoFile = document.getElementById("video-file-input");
  const videoLabel = document.getElementById("video-file-label");
  const audioFile = document.getElementById("audio-file-input");
  const audioLabel = document.getElementById("audio-file-label");
  const videoLinkEl = document.getElementById("video-link-input");
  const submitBtn = document.getElementById("submit-btn");

  if (nickEl) {
    nickEl.value = "";
    nickEl.placeholder = "Mr,s 09….";
    nickEl.disabled = false;
  }
  if (textEl) {
    textEl.value = "";
    textEl.disabled = false;
    textEl.style.opacity = "1";
  }
  if (ytEl) ytEl.value = "";
  if (startEl) startEl.value = "";
  if (endEl) endEl.value = "";
  if (videoLinkEl) videoLinkEl.value = "";

  if (videoFile) {
    videoFile.disabled = false;
    videoFile.value = "";
  }
  if (videoLabel) videoLabel.textContent = "";

  if (audioFile) {
    audioFile.disabled = false;
    audioFile.value = "";
  }
  if (audioLabel) audioLabel.textContent = "";

  const btnYoutube = document.getElementById("btn-media-youtube");
  const btnUpload = document.getElementById("btn-media-upload");
  const btnAudio = document.getElementById("btn-media-audio");
  [btnYoutube, btnUpload, btnAudio].forEach((b) => {
    if (b) b.disabled = false;
  });

  setMediaMode(null);
  clearRecordedMediaState();

  if (form) {
    form.classList.add("hidden");
    form.style.display = "none";
  }
  if (btnNew) {
    btnNew.textContent = "新增";
  }

  if (submitBtn) {
    submitBtn.disabled = false;
    submitBtn.textContent = "發表"; // 不再顯示「處理中」
  }
  isSubmitting = false;
  isFormOpen = false;
  formMode = "add";

  editState.active = false;
  editState.id = null;
  editState.nickname = "";
  editState.originalText = "";
  editState.waitForSelect = false;
  
  // [JS-MOD] 重置 YouTube 按鈕的外觀狀態 (第 9 點)
  const mediaSelectRow = document.querySelector(".media-select-row"); 
  if (mediaSelectRow) {
      mediaSelectRow.classList.remove("edit-mode");
  }

  resetReplyTargetButton();
}

// ===== [JS-12] 編輯流程：按「編輯」→ 選列 → 輸入原 username ======
function startEditForRow(row) {
  if (!row) return;

  // [JS-MOD] 任何編輯行為都視為互動 (第 2 點)
  stopCarousel("user"); 

  editState.active = true;
  editState.id = row.id;
  editState.nickname = normalizeName(row.nickname);
  editState.originalText = row.text || "";

  const form = document.getElementById("community-form");
  const btnNew = document.getElementById("btn-new");
  const nickEl = document.getElementById("nickname-input");
  const textEl = document.getElementById("text-input");
  const mediaSelectRow = document.querySelector(".media-select-row");

  if (form) {
    form.classList.remove("hidden");
    form.style.display = "block";
  }
  if (btnNew) {
    btnNew.textContent = "取消編輯";
  }
  isFormOpen = true;
  formMode = "edit";
  
  // [JS-MOD] 設定 CSS 標記，用於 YouTube 按鈕變色 (第 9 點)
  if (mediaSelectRow) {
      mediaSelectRow.classList.add("edit-mode");
  }

  if (nickEl) {
    nickEl.disabled = false;
    nickEl.value = "";
    nickEl.placeholder = "請輸入原本 username 以進行編輯";
  }

  if (textEl) {
    textEl.value = editState.originalText;
    textEl.disabled = true;
    textEl.style.opacity = "0.6";
  }

  const btnYoutube = document.getElementById("btn-media-youtube");
  const btnUpload = document.getElementById("btn-media-upload");
  const btnAudio = document.getElementById("btn-media-audio");
  [btnYoutube, btnUpload, btnAudio].forEach((b) => {
    // [JS-MOD] 媒體按鈕在編輯模式下全部禁用 (第 6 點)
    if (b) b.disabled = true; 
  });

  // [JS-MOD] 編輯模式不顯示媒體輸入欄位 (第 6 點)
  setMediaMode(null); 
}

// ===== [JS-12-1] 表頭「編輯」按鈕 ======
function setupEditHeaderButton() {
  const btn = document.getElementById("btn-edit");
  if (!btn) return;

  btn.addEventListener("click", () => {
    // [JS-MOD] 任何編輯行為都視為互動 (第 2 點)
    stopCarousel("user"); 
    
    const willEnter = !editState.waitForSelect;
    resetFormToAddMode();
    editState.waitForSelect = willEnter;
    renderCommentsTable();
    
    // [JS-MOD] 跳轉到表頭 (第 8 點)
    if (willEnter) {
        scrollToVideoTop();
    }
  });
}

// ===== [JS-13] 表格點擊：選取 / 進入編輯 / 展開收合 ======
function setupTableClicks() {
  const tbody = document.getElementById("comments-tbody");
  if (!tbody) return;

  tbody.addEventListener("click", (e) => {
    // [JS-MOD] 任何表格點擊都視為互動 (第 2 點)
    stopCarousel("user"); 
    
    const tr = e.target.closest("tr[data-id]");
    if (!tr) return;

    const id = tr.getAttribute("data-id");
    const row = findRowById(id);
    if (!row) return;

    const editBtn = e.target.closest("button.row-edit-btn");

    if (e.target.classList.contains("expand-arrow")) {
      const cell = e.target.closest("td.col-text");
      if (cell && cell.getAttribute("data-expanded") === "1") {
        renderCommentsTable();
        const tbody2 = document.getElementById("comments-tbody");
        if (tbody2) {
          const tr2 = tbody2.querySelector(`tr[data-id="${id}"]`);
          if (tr2) tr2.classList.add("selected");
        }
        return;
      }
    }

    if (editState.waitForSelect) {
      if (editBtn) {
        editState.waitForSelect = false;
        selectRowForReply(row, true);
        startEditForRow(row);
      } else {
        editState.waitForSelect = false;
        renderCommentsTable();
        selectRowForReply(row);
      }
      return;
    }

    selectRowForReply(row);
  });
}

// ===== [JS-14] Back 鍵：回到初始畫面 (第 8 點, 第 10 點) ======
function setupBackButton() {
  const btn = document.getElementById("back-button");
  if (!btn) return;
  btn.addEventListener("click", () => {
    // [JS-MOD] 任何 Back 行為都視為互動 (第 2 點)
    stopCarousel("user"); 
    
    resetFormToAddMode();
    currentSelectedId = null;
    renderCommentsTable();
    resetReplyTargetButton();
    cancelAdminReply();
    stopAllPlayback();
    
    // [JS-MOD] 跳轉到網頁頭部 (第 8 點, 第 10 點)
    scrollToVideoTop(); 
    
    // [JS-MOD] 移除重新整理功能 (第 10 點)
  });
}

// ===== [JS-15] 管理員回覆區 (第 2 點, 第 7 點) ======
function setupAdminReply() {
  const box = document.getElementById("admin-reply");
  if (!box) return;

  ensureReplyPrefix();
  autoResizeReply();
  hideReplyActions();

  box.addEventListener("focus", () => {
    // [JS-MOD] 任何回覆區互動都視為互動 (第 2 點)
    stopCarousel("user"); 
    ensureReplyPrefix();
    autoResizeReply();
  });

  box.addEventListener("input", () => {
    // [JS-MOD] 任何回覆區互動都視為互動 (第 2 點)
    stopCarousel("user"); 
    ensureReplyPrefix();
    autoResizeReply();

    const val = box.value || "";
    let contentPart = val;
    if (val.startsWith(REPLY_PREFIX)) {
      contentPart = val.slice(REPLY_PREFIX.length);
    }
    if (contentPart.trim()) {
      showReplyActions();
    } else {
      hideReplyActions();
    }
  });

  box.addEventListener("keydown", (ev) => {
    const prefixLen = REPLY_PREFIX.length;
    const pos = box.selectionStart || 0;

    if (pos <= prefixLen) {
      const blockedKeys = [
        "Backspace",
        "Delete",
        "ArrowLeft",
      ];
      const allowKeys = [
        "ArrowRight",
        "ArrowDown",
        "ArrowUp",
        "Tab",
      ];
      if (ev.ctrlKey || ev.metaKey || allowKeys.includes(ev.key)) {
        return;
      }
      if (blockedKeys.includes(ev.key) || ev.key.length === 1) {
        ev.preventDefault();
        const safePos = prefixLen + 1;
        try {
          box.setSelectionRange(safePos, safePos);
        } catch (e) {}
      }
    }
  });

  const btnSave = document.getElementById("reply-save-btn");
  const btnCancel = document.getElementById("reply-cancel-btn");
  if (btnSave) {
    btnSave.addEventListener("click", () => {
      // [JS-MOD] 任何回覆區互動都視為互動 (第 2 點)
      stopCarousel("user"); 
      saveAdminReply();
    });
  }
  if (btnCancel) {
    btnCancel.addEventListener("click", () => {
      // [JS-MOD] 任何回覆區互動都視為互動 (第 2 點)
      stopCarousel("user"); 
      cancelAdminReply();
      try {
        box.blur();
      } catch (e) {}
    });
  }
}

// ===== [JS-16] From: 按鈕 → 回到該列並展開文字 ======
function setupReplyTargetButton() {
  const btn = document.getElementById("reply-target-btn");
  if (!btn) return;

  btn.addEventListener("click", () => {
    // [JS-MOD] 任何回覆區互動都視為互動 (第 2 點)
    stopCarousel("user"); 
    
    const id = btn.getAttribute("data-id");
    if (!id) return;

    const tbody = document.getElementById("comments-tbody");
    if (!tbody) return;

    const tr = tbody.querySelector(`tr[data-id="${id}"]`);
    if (!tr) return;

    const row = findRowById(id);
    if (!row) return;

    tr.scrollIntoView({ behavior: "smooth", block: "center" });
    tr.classList.add("row-flash");
    setTimeout(() => tr.classList.remove("row-flash"), 800);

    const cell = tr.querySelector("td.col-text");
    if (cell && String(row.text || "").length > 30) {
      cell.innerHTML =
        escapeHtml(row.text) +
        '<span class="expand-arrow" title="收合">▲</span>';
      cell.setAttribute("data-expanded", "1");
    }
  });
}

// ===== [JS-17] username 注音保護 + Enter 防送出 (第 2 點) ======
let isComposingName = false;

function tryUnlockEditByName() {
  if (!editState.active) return;
  if (isComposingName) return;

  // [JS-MOD] 任何表單互動都視為互動 (第 2 點)
  stopCarousel("user"); 
  
  const nickEl = document.getElementById("nickname-input");
  const textEl = document.getElementById("text-input");
  if (!nickEl || !textEl) return;

  const typedRaw = String(nickEl.value || "");
  const typed = normalizeName(typedRaw);
  const target = normalizeName(editState.nickname);
  if (!typed || !target) return;

  if (!validateNameLength(typed)) return;
  if (typed !== target) return;

  nickEl.disabled = true;
  textEl.disabled = false;
  textEl.style.opacity = "1";
  textEl.focus();
  const len = textEl.value.length;
  try {
    textEl.setSelectionRange(len, len);
  } catch (e) {}
}

function setupEditNameGuard() {
  const nickEl = document.getElementById("nickname-input");
  if (!nickEl) return;

  nickEl.addEventListener("compositionstart", () => {
    isComposingName = true;
  });
  nickEl.addEventListener("compositionend", () => {
    isComposingName = false;
    tryUnlockEditByName();
  });
  nickEl.addEventListener("input", tryUnlockEditByName);
  nickEl.addEventListener("change", tryUnlockEditByName);
  nickEl.addEventListener("blur", tryUnlockEditByName);

  nickEl.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter") {
      ev.preventDefault();
      tryUnlockEditByName();
    }
  });
}

// 項目欄位 Enter 防誤送出
function setupTextInputEnterGuard() {
  const textEl = document.getElementById("text-input");
  if (!textEl) return;

  textEl.addEventListener("input", () => {
      // [JS-MOD] 任何表單輸入都視為互動 (第 2 點)
      stopCarousel("user"); 
  });
  
  textEl.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter") {
      ev.preventDefault();
    }
  });
}

// ===== [JS-18] 工具列 / 表單 + 送出處理 (第 3 點, 第 7 點) ======
async function handleSubmit(e) {
  e.preventDefault();

  if (isSubmitting) return;
  isSubmitting = true;
  
  // [JS-MOD] 啟動處理中狀態 (第 3 點, 第 7 點)
  setProcessing(true, "送出表單"); 

  stopCarousel("user");

  const nickEl = document.getElementById("nickname-input");
  const textEl = document.getElementById("text-input");
  const ytEl = document.getElementById("youtube-url-input");
  const startEl = document.getElementById("start-input");
  const endEl = document.getElementById("end-input");
  const videoFile = document.getElementById("video-file-input");
  const audioFile = document.getElementById("audio-file-input");
  const videoLinkEl = document.getElementById("video-link-input");

  const nicknameInput = nickEl ? nickEl.value : "";
  const nickname = normalizeName(nicknameInput);
  const text = (textEl?.value || "").trim();
  const youtubeUrl = (ytEl?.value || "").trim();
  const startSec = parseTimeToSec(startEl?.value);
  const endSec = parseTimeToSec(endEl?.value);
  const vFile = videoFile && videoFile.files[0];
  const aFile = audioFile && audioFile.files[0];
  const videoLink = (videoLinkEl?.value || "").trim();

  const isEditing = editState.active && editState.id;

  try {
    if (!validateNameLength(nickname)) {
      alert("username 請使用 5–12 個中英文或數字（不含空白與符號）。");
      if (nickEl) nickEl.focus();
      return;
    }

    if (isEditing) {
      const target = normalizeName(editState.nickname);
      if (nickname !== target) {
        alert("請輸入當初填寫的 username（需與原始紀錄完全一致）。");
        if (nickEl) nickEl.focus();
        return;
      }
    }

    if (!text) {
      alert("請先輸入「項目」說明（100 字內）。");
      if (textEl) textEl.focus();
      return;
    }

    if (text.length > 100) {
      alert("說明請控制在 100 字以內。");
      if (textEl) textEl.focus();
      return;
    }

    // 媒體互斥
    if (youtubeUrl) {
      if (vFile || aFile || window.recordedAudioBlob || videoLink) {
        alert("YouTube 連結不可同時搭配影片檔 / 錄音 / 一般網址，請擇一種媒體來源。");
        return;
      }
    }

    if (videoLink && (vFile || aFile || window.recordedAudioBlob)) {
      alert("一般網址與檔案 / 錄音請擇一。");
      return;
    }

    if (aFile && window.recordedAudioBlob) {
      alert("音檔上傳與錄音請擇一。");
      return;
    }

    // ===== 編輯模式：只改文字 =====
    if (isEditing) {
      const editingId = editState.id;

      let textToSend = text;
      if (/^[0-9]+$/.test(text)) {
        textToSend = "\u200B" + text;
      }

      const params = new URLSearchParams({
        action: "edit",
        id: String(editingId),
        text: textToSend,
      });

      const res = await fetch(API_URL + "?" + params.toString());
      const data = await res.json();

      if (!data || data.status !== "ok") {
        throw new Error(data && data.error ? data.error : "edit 失敗");
      }

      resetFormToAddMode();
      await loadComments();

      const row = findRowById(editingId);
      if (row) {
        selectRowForReply(row);
      }
      return;
    }

    // ===== 新增模式 =====
    let type = "text";

    let nicknameToSend = nickname;
    if (/^[0-9]+$/.test(nickname)) {
      nicknameToSend = "\u200B" + nickname;
    }

    let textToSend = text;
    if (/^[0-9]+$/.test(text)) {
      textToSend = "\u200B" + text;
    }

    const payload = {
      action: "add",
      nickname: nicknameToSend,
      text: textToSend,
      startSec: startSec === "" ? "" : String(startSec),
      endSec: endSec === "" ? "" : String(endSec),
    };

    if (youtubeUrl) {
      type = "youtube";
      payload.type = type;
      payload.youtubeUrl = youtubeUrl;
    } else if (videoLink) {
      type = "upload";
      payload.type = type;
      payload.externalUrl = videoLink;
    } else if (vFile) {
      type = "upload";
      payload.type = type;

      const base64 = await readFileAsBase64(vFile);
      const mimeType = vFile.type || "application/octet-stream";
      const fileName = vFile.name || "video_" + Date.now();

      payload.videoBase64 = base64;
      payload.mimeType = mimeType;
      payload.fileName = fileName;
    } else if (aFile || window.recordedAudioBlob) {
      type = "audio";
      payload.type = type;

      let blobToUse = null;
      let mimeType = "audio/webm";
      let fileName = "audio_" + Date.now() + ".webm";

      if (aFile) {
        blobToUse = aFile;
        mimeType = aFile.type || mimeType;
        fileName = aFile.name || fileName;
      } else if (window.recordedAudioBlob) {
        blobToUse = window.recordedAudioBlob;
        mimeType = window.recordedAudioBlob.type || mimeType;
      }

      if (blobToUse) {
        const base64 = await readFileAsBase64(blobToUse);
        payload.audioBase64 = base64;
        payload.audioMimeType = mimeType;
        payload.audioFileName = fileName;
      }
    } else {
      payload.type = "text";
    }

    const res = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(payload),
    });

    let data;
    try {
      data = await res.json();
    } catch (err) {
      // 這是前端最容易抓到 Apps Script 權限或部署錯誤的地方
      throw new Error("無法解析伺服器回應（可能是 Apps Script 權限不足、部署錯誤或 CORS 設定不正確）"); 
    }

    if (!data || data.status !== "ok") {
      throw new Error(data && data.error ? data.error : "add 失敗");
    }

    resetFormToAddMode();
    await loadComments();

    if (commentsCache.length) {
      const newest = commentsCache[commentsCache.length - 1];
      if (newest) {
        selectRowForReply(newest);
      }
    }
  } catch (err) {
    console.error(err);
    alert(
      (isEditing ? "儲存文字修改失敗：" : "送出留言失敗：") + err.message
    );
  } finally {
    isSubmitting = false;
    // [JS-MOD] 關閉處理中狀態 (第 3 點)
    setProcessing(false); 
  }
}

// ===== [JS-18-1] 工具列 & 表單綁定 (第 2 點) ======
function bindToolbarAndForm() {
  const form = document.getElementById("community-form");
  const btnNew = document.getElementById("btn-new");
  const btnYoutube = document.getElementById("btn-media-youtube");
  const btnUpload = document.getElementById("btn-media-upload");
  const btnAudio = document.getElementById("btn-media-audio");
  const videoFile = document.getElementById("video-file-input");
  const videoLabel = document.getElementById("video-file-label");
  const audioFile = document.getElementById("audio-file-input");
  const audioLabel = document.getElementById("audio-file-label");
  const ytEl = document.getElementById("youtube-url-input");
  const startEl = document.getElementById("start-input");
  const endEl = document.getElementById("end-input");
  const videoLinkEl = document.getElementById("video-link-input");

  if (!form) return;

  form.classList.add("hidden");
  form.style.display = "none";
  setMediaMode(null); // <-- 這裡現在可以找到 setMediaMode 了
  isFormOpen = false;

  if (btnNew) {
    btnNew.addEventListener("click", () => {
      // [JS-MOD] 任何新增/取消行為都視為互動 (第 2 點)
      stopCarousel("user"); 

      if (!isFormOpen) {
        editState.active = false;
        editState.id = null;
        editState.nickname = "";
        editState.originalText = "";
        editState.waitForSelect = false;

        form.classList.remove("hidden");
        form.style.display = "block";
        btnNew.textContent = "取消新增";
        isFormOpen = true;
        formMode = "add";

        setMediaMode(null);
        clearRecordedMediaState();
      } else {
        resetFormToAddMode();
      }
    });
  }

  function bindMediaButton(btn, modeName) {
    if (!btn) return;
    btn.addEventListener("click", () => {
      // [JS-MOD] 任何媒體按鈕點擊都視為互動 (第 2 點)
      stopCarousel("user"); 
      
      if (editState.active) return;
      if (btn.disabled) return;

      if (window.currentMediaMode === modeName) {
        setMediaMode(null);
      } else {
        setMediaMode(modeName);
      }
      clearRecordedMediaState();

      if (modeName === "youtube") {
        if (videoFile) videoFile.value = "";
        if (videoLabel) videoLabel.textContent = "";
        if (audioFile) audioFile.value = "";
        if (audioLabel) audioLabel.textContent = "";
        if (videoLinkEl) videoLinkEl.value = "";
      } else if (modeName === "upload") {
        if (ytEl) ytEl.value = "";
        if (startEl) startEl.value = "";
        if (endEl) endEl.value = "";
        if (audioFile) audioFile.value = "";
        if (audioLabel) audioLabel.textContent = "";
      } else if (modeName === "audio") {
        if (ytEl) ytEl.value = "";
        if (startEl) startEl.value = "";
        if (endEl) endEl.value = "";
        if (videoFile) videoFile.value = "";
        if (videoLabel) videoLabel.textContent = "";
        if (videoLinkEl) videoLinkEl.value = "";
      }
    });
  }

  bindMediaButton(btnYoutube, "youtube");
  bindMediaButton(btnUpload, "upload");
  bindMediaButton(btnAudio, "audio");
  
  // [JS-MOD] 綁定其他輸入欄位的互動停止輪播 (第 2 點)
  const allInputs = [ytEl, startEl, endEl, videoLinkEl];
  allInputs.forEach(input => {
      if (input) {
          input.addEventListener("focus", () => stopCarousel("user"));
          input.addEventListener("input", () => stopCarousel("user"));
      }
  });

  if (videoFile && videoLabel) {
    videoFile.addEventListener("change", () => {
      // [JS-MOD] 任何檔案選擇都視為互動 (第 2 點)
      stopCarousel("user"); 
      if (videoFile.files && videoFile.files[0]) {
        videoLabel.textContent = "已選擇：" + videoFile.files[0].name;
      } else {
        videoLabel.textContent = "";
      }
    });
  }

  if (audioFile && audioLabel) {
    audioFile.addEventListener("change", () => {
      // [JS-MOD] 任何檔案選擇都視為互動 (第 2 點)
      stopCarousel("user"); 
      if (audioFile.files && audioFile.files[0]) {
        audioLabel.textContent = "已選擇：" + audioFile.files[0].name;
      } else {
        audioLabel.textContent = "";
      }
    });
  }

  form.addEventListener("submit", handleSubmit); // <-- 新增按鈕的送出邏輯現在可以正確綁定
}

// ===== [JS-A] 左側表單：錄音面板控制（MediaRecorder） (第 5 點) ======
function stopAudioRecordingInternal(cancelOnly) {
  const statusEl = document.getElementById("audio-rec-status");
  const previewEl = document.getElementById("audio-rec-preview");
  const btnStart = document.getElementById("audio-rec-start");
  const btnStop = document.getElementById("audio-rec-stop");
  const btnPause = document.getElementById("audio-rec-pause");
  const btnCancel = document.getElementById("audio-rec-cancel");
  
  // [JS-MOD] 清除暫停狀態 class (第 5 點)
  if (btnStart) btnStart.classList.remove("paused-rec");
  if (btnPause) btnPause.classList.remove("paused-rec");


  clearAudioRecTimer();
  audioRecActive = false;
  audioRecPaused = false;
  audioRecAccumulated = 0;

  if (audioRecRecorder && audioRecRecorder.state !== "inactive") {
    if (cancelOnly) {
      audioRecCancelling = true;
    }
    try {
      audioRecRecorder.stop();
    } catch (e) {}
  }
  audioRecRecorder = null;

  if (audioRecStream) {
    audioRecStream.getTracks().forEach((t) => t.stop());
  }
  audioRecStream = null;

  if (cancelOnly) {
    audioRecChunks = [];
    window.recordedAudioBlob = null;
    if (previewEl) {
      previewEl.removeAttribute("src");
      previewEl.load();
    }
    if (statusEl) statusEl.textContent = "錄音預備";
  }

  if (btnStart) btnStart.disabled = false;
  if (btnStop) btnStop.disabled = true;
  if (btnCancel) btnCancel.disabled = false;
  if (btnPause) {
    btnPause.disabled = true;
    btnPause.classList.remove("recording");
    // [JS-MOD] 暫停鍵永遠顯示 ⏸ (第 5 點)
    btnPause.textContent = "⏸"; 
  }

  const btnStart2 = document.getElementById("audio-rec-start");
  if (btnStart2) {
    btnStart2.classList.remove("recording");
  }
}

function setupAudioRecording() {
  const btnStart = document.getElementById("audio-rec-start");
  const btnStop = document.getElementById("audio-rec-stop");
  const btnPause = document.getElementById("audio-rec-pause");
  const btnCancel = document.getElementById("audio-rec-cancel");
  const statusEl = document.getElementById("audio-rec-status");
  const previewEl = document.getElementById("audio-rec-preview");

  if (!btnStart || !btnStop || !btnCancel || !statusEl || !previewEl || !btnPause) {
    return;
  }

  btnStart.disabled = false;
  btnStop.disabled = true;
  btnPause.disabled = true;
  btnCancel.disabled = true;
  
  // [JS-MOD] 確保初始狀態 (第 5 點)
  btnStart.classList.remove("paused-rec");
  btnPause.classList.remove("paused-rec");
  btnPause.textContent = "⏸";

  btnStart.addEventListener("click", async () => {
    // [JS-MOD] 任何錄音行為都視為互動 (第 2 點)
    stopCarousel("user"); 
    
    if (audioRecActive) return;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      statusEl.textContent = "此瀏覽器不支援麥克風錄音。";
      return;
    }

    try {
      stopAudioRecordingInternal(true);

      btnStart.disabled = true;
      btnStop.disabled = true;
      btnPause.disabled = true;
      btnCancel.disabled = true;
      statusEl.textContent = "正在啟用麥克風…";

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioRecStream = stream;
      audioRecChunks = [];
      window.recordedAudioBlob = null;

      const mimeType =
        MediaRecorder.isTypeSupported &&
        MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
          ? "audio/webm;codecs=opus"
          : "audio/webm";

      const recorder = new MediaRecorder(stream, { mimeType });
      audioRecRecorder = recorder;
      audioRecActive = true;
      audioRecPaused = false;
      audioRecAccumulated = 0;
      audioRecCancelling = false;
      
      // [JS-MOD] 清除暫停狀態 class (第 5 點)
      btnStart.classList.remove("paused-rec");
      btnPause.classList.remove("paused-rec");


      recorder.addEventListener("dataavailable", (ev) => {
        if (ev.data && ev.data.size > 0) {
          audioRecChunks.push(ev.data);
        }
      });

      recorder.addEventListener("stop", () => {
        clearAudioRecTimer();
        audioRecActive = false;

        if (audioRecStream) {
          audioRecStream.getTracks().forEach((t) => t.stop());
        }
        audioRecStream = null;

        if (audioRecCancelling) {
          audioRecCancelling = false;
          audioRecChunks = [];
          window.recordedAudioBlob = null;
          if (previewEl) {
            previewEl.removeAttribute("src");
            previewEl.load();
          }
          if (statusEl) statusEl.textContent = "錄音已取消。";
          btnStart.disabled = false;
          btnStop.disabled = true;
          btnPause.disabled = true;
          // [JS-MOD] 暫停鍵永遠顯示 ⏸ (第 5 點)
          btnPause.textContent = "⏸";
          btnCancel.disabled = false;
          btnStart.classList.remove("recording");
          btnStart.classList.remove("paused-rec"); // [JS-MOD] 確保清除
          btnPause.classList.remove("paused-rec"); // [JS-MOD] 確保清除
          return;
        }

        if (!audioRecChunks.length) return;

        const blob = new Blob(audioRecChunks, { type: mimeType });
        window.recordedAudioBlob = blob;

        const url = URL.createObjectURL(blob);
        previewEl.src = url;
        previewEl.play().catch(() => {});

        statusEl.textContent = "錄音完成，可按「發表」儲存。";

        btnStart.disabled = false;
        btnStop.disabled = true;
        btnPause.disabled = true;
        // [JS-MOD] 暫停鍵永遠顯示 ⏸ (第 5 點)
        btnPause.textContent = "⏸"; 
        btnCancel.disabled = false;

        btnStart.classList.remove("recording");
        btnStart.classList.remove("paused-rec"); // [JS-MOD] 確保清除
        btnPause.classList.remove("paused-rec"); // [JS-MOD] 確保清除
      });

      audioRecStartTime = Date.now();
      clearAudioRecTimer();
      statusEl.textContent = "錄音中… 00:00";
      audioRecTimerId = setInterval(() => {
        if (!audioRecActive || audioRecPaused) return;
        const elapsedSec =
          audioRecAccumulated + (Date.now() - audioRecStartTime) / 1000;
        statusEl.textContent = "錄音中… " + formatDuration(elapsedSec);
      }, 500);

      btnStart.classList.add("recording");
      btnStop.disabled = false;
      btnPause.disabled = false;
      btnCancel.disabled = false;

      recorder.start();
    } catch (err) {
      console.error(err);
      statusEl.textContent = "無法啟用麥克風（可能被拒絕或裝置不支援）。";
      btnStart.disabled = false;
      btnStop.disabled = true;
      btnPause.disabled = true;
      btnCancel.disabled = false;
      btnStart.classList.remove("recording");
    }
  });

  btnStop.addEventListener("click", () => {
    // [JS-MOD] 任何錄音行為都視為互動 (第 2 點)
    stopCarousel("user"); 
    
    if (!audioRecActive || !audioRecRecorder) return;
    audioRecPaused = false;
    audioRecAccumulated = 0;
    clearAudioRecTimer();
    statusEl.textContent = "處理錄音中…";
    btnStop.disabled = true;
    if (btnPause) {
      btnPause.disabled = true;
      btnPause.classList.remove("recording");
      // [JS-MOD] 暫停鍵永遠顯示 ⏸ (第 5 點)
      btnPause.textContent = "⏸";
    }
    // [JS-MOD] 清除暫停狀態 class (第 5 點)
    btnStart.classList.remove("paused-rec");
    btnPause.classList.remove("paused-rec");
    
    audioRecRecorder.stop();
  });

  btnPause.addEventListener("click", () => {
    // [JS-MOD] 任何錄音行為都視為互動 (第 2 點)
    stopCarousel("user"); 
    
    if (!audioRecRecorder || !audioRecActive) return;

    if (typeof audioRecRecorder.pause !== "function" ||
        typeof audioRecRecorder.resume !== "function") {
      statusEl.textContent = "此瀏覽器不支援暫停功能。";
      btnPause.disabled = true;
      return;
    }

    if (!audioRecPaused) {
      // 暫停
      audioRecPaused = true;
      audioRecAccumulated += (Date.now() - audioRecStartTime) / 1000;
      clearAudioRecTimer();
      audioRecRecorder.pause();
      statusEl.textContent = "錄音已暫停 " + formatDuration(audioRecAccumulated);
      
      // [JS-MOD] 暫停鍵保持 ⏸ 符號，但進入紅色暫停狀態 (第 5 點)
      btnPause.classList.add("paused-rec");
      btnStart.classList.add("paused-rec");
      btnStart.classList.remove("recording"); // 停止閃爍
    } else {
      // 繼續
      audioRecPaused = false;
      audioRecStartTime = Date.now();
      audioRecRecorder.resume();
      statusEl.textContent = "錄音中… " + formatDuration(audioRecAccumulated);
      clearAudioRecTimer();
      audioRecTimerId = setInterval(() => {
        if (!audioRecActive || audioRecPaused) return;
        const elapsedSec =
          audioRecAccumulated + (Date.now() - audioRecStartTime) / 1000;
        statusEl.textContent = "錄音中… " + formatDuration(elapsedSec);
      }, 500);
      
      // [JS-MOD] 繼續錄音，移除暫停狀態，紅點閃爍 (第 5 點)
      btnPause.classList.remove("paused-rec");
      btnStart.classList.remove("paused-rec");
      btnStart.classList.add("recording");
    }
  });

  btnCancel.addEventListener("click", () => {
    // [JS-MOD] 任何錄音行為都視為互動 (第 2 點)
    stopCarousel("user"); 
    
    if (audioRecActive && audioRecRecorder) {
      stopAudioRecordingInternal(true);
    } else {
      stopAudioRecordingInternal(true);
    }
  });
}

// [JS-MOD] 綁定多層圓/指板區的互動停止輪播 (第 2 點)
function setupVisualInteractions() {
    const circleArea = document.getElementById("circle-stack");
    const fingerboard = document.getElementById("fingerboard");
    const replyTarget = document.getElementById("reply-target");
    
    // 多層圓、指板、回覆目標按鈕的點擊都算互動
    [circleArea, fingerboard, replyTarget].forEach(el => {
        if (el) {
            el.addEventListener("click", () => stopCarousel("user"));
            el.addEventListener("pointerdown", () => stopCarousel("user"));
        }
    });
}

// [JS-MOD] 影片/音訊播放區的點擊也算互動 (第 2 點)
function setupPlaybackInteractions() {
    const videoWrap = document.querySelector(".video-frame-wrap");
    if (videoWrap) {
        // 點擊影片區（不論有無 iframe）都停止輪播
        videoWrap.addEventListener("pointerdown", () => stopCarousel("user"));
    }
    
    const audioPlayer = document.getElementById("audio-player");
    if (audioPlayer) {
         // 點擊音訊控制欄也停止輪播
         audioPlayer.addEventListener("pointerdown", () => stopCarousel("user"));
         
         // [JS-MOD] 影片和錄音停止播放時，重置時間到 0 (第 4 點)
         audioPlayer.addEventListener("pause", () => {
             audioPlayer.currentTime = 0;
         });
    }
}

// [JS-MOD] 頁面背景化時，暫停播放 (第 4 點)
function setupVisibilityListener() {
    document.addEventListener("visibilitychange", () => {
        if (document.hidden) {
            // 頁面切到背景
            stopAllPlayback();
        } 
        // 頁面切回前景時，讓用戶自己重新點擊播放，確保體驗一致性
    });
}


// ===== [JS-19] DOMContentLoaded：全部啟動 ======
document.addEventListener("DOMContentLoaded", () => {
  window.currentMediaMode = null;

  bindToolbarAndForm();
  setupTableClicks();
  setupBackButton();
  setupAdminReply();
  setupEditHeaderButton();
  setupReplyTargetButton();
  setupAudioRecording();
  setupEditNameGuard();
  setupTextInputEnterGuard();
  setupVisualInteractions(); // [JS-MOD] 新增：綁定多層圓/指板互動 (第 2 點)
  setupPlaybackInteractions(); // [JS-MOD] 新增：綁定播放區互動 (第 2 點)
  setupVisibilityListener(); // [JS-MOD] 新增：綁定頁面背景化暫停 (第 4 點)

  clearVideo();

  // [JS-MOD] 取消監聽 document.addEventListener("pointerdown")，改為只在實際互動時呼叫 stopCarousel("user") (第 2 點)

  loadComments().catch((err) => {
    console.error(err);
    alert("載入列表失敗：" + err.message);
  });
});

