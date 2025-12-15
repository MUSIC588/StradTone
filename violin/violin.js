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
let carouselUserStopped = false;
let carouselIds = [];
let carouselIndex = 0;
const CAROUSEL_INTERVAL_MS = 15000; // 每 15 秒換下一筆

// ===== [JS-0.5] 全站互動偵測（用來「只有真的互動才停輪播」） =====
let hasUserInteracted = false;
function markUserInteracted(reason) {
  if (hasUserInteracted) return;
  hasUserInteracted = true;
  stopCarousel("user");
}


// ===== [JS-0.6] Busy 鎖定（處理中時禁止其他操作，避免狂按/亂點） =====
let busyLockCount = 0;

function setBusy(isBusy) {
  busyLockCount += isBusy ? 1 : -1;
  if (busyLockCount < 0) busyLockCount = 0;

  const on = busyLockCount > 0;
  document.body.classList.toggle("is-busy", on);

  // 需求(7)：處理中時，連輸入游標都不要出現
  const replyBox = document.getElementById("admin-reply");
  const form = document.getElementById("community-form");

  // 讓已經 focus 的元件直接失焦（避免 iOS 鍵盤彈出）
  if (on) {
    try {
      const ae = document.activeElement;
      if (ae && typeof ae.blur === "function") ae.blur();
    } catch (e) {}
  }

  // 禁用回覆 textarea
  if (replyBox) replyBox.disabled = on;

  // 禁用表單內所有 input / button / textarea / file
  if (form) {
    const els = form.querySelectorAll("input, button, textarea, select");
    els.forEach((el) => {
      // 送出按鈕你本來就有 isSubmitting 控制；這裡是全域鎖定用
      el.disabled = on || el.disabled;
    });
  }

  // 禁用回覆區按鈕（儲存/取消）
  const replySave = document.getElementById("reply-save-btn");
  const replyCancel = document.getElementById("reply-cancel-btn");
  if (replySave) replySave.disabled = on || replySave.disabled;
  if (replyCancel) replyCancel.disabled = on || replyCancel.disabled;

  // 禁用 Back / 新增 / 表頭編輯
  const backBtn = document.getElementById("back-button");
  const newBtn = document.getElementById("btn-new");
  const editHeaderBtn = document.getElementById("btn-edit");
  if (backBtn) backBtn.disabled = on || backBtn.disabled;
  if (newBtn) newBtn.disabled = on || newBtn.disabled;
  if (editHeaderBtn) editHeaderBtn.disabled = on || editHeaderBtn.disabled;
}
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

  params.push("autoplay=1");
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

// 卷軸回到頁面頂端（讓手機不會跳到回覆欄）
function scrollToVideoTop(forceInstant) {
  window.scrollTo({
    top: 0,
    behavior: forceInstant ? "auto" : "smooth",
  });
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

// 停止右上角影片 & 音訊播放
function stopAllPlayback() {
  const iframe = document.getElementById("video-iframe");
  const audio = document.getElementById("audio-player");
  const ph = document.getElementById("video-placeholder");
  if (iframe) iframe.src = "";
  if (audio) {
    try {
      audio.pause();
    } catch (e) {}
    audio.removeAttribute("src");
    audio.load();
    audio.style.display = "none";
  }
  if (ph) {
    ph.style.display = "flex";
  }
}

// ===== [JS-1.5] 分頁/切頁時自動暫停（影片/音訊） =====
function pausePlaybackKeepTime() {
  // iframe 內的 YouTube/Drive 無法可靠讀取時間點（跨網域），只能「停在畫面當下或停止載入」
  // 音訊 <audio> 可以保留 currentTime
  const audio = document.getElementById("audio-player");
  if (audio && !audio.paused) {
    try {
      audio.pause();
    } catch (e) {}
  }
  const preview = document.getElementById("audio-rec-preview");
  if (preview && !preview.paused) {
    try {
      preview.pause();
    } catch (e) {}
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

// ===== [JS-2] 載入與表格列表 ======

async function loadComments() {
  setBusy(true);

  try {
    const res = await fetch(API_URL + "?action=list", { cache: "no-cache" });

    // 讓錯誤更明確（避免 res.json() 直接炸掉）
    if (!res.ok) {
      throw new Error("載入失敗（HTTP " + res.status + "）");
    }

    const data = await res.json();
    commentsCache = (data && data.posts) ? data.posts : [];

    renderCommentsTable();
    startCarouselIfPossible();
  } catch (err) {
    console.error(err);
    // 不用 alert 打爆使用者（尤其 iOS），但至少表格顯示錯誤
    const tbody = document.getElementById("comments-tbody");
    if (tbody) {
      tbody.innerHTML = `<tr><td colspan="3">載入失敗：${escapeHtml(err.message || String(err))}</td></tr>`;
    }
  } finally {
    setBusy(false);
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
      const hasAudio = type === "audio" || row.hasAudio || row.driveAudioId;

      let mediaHtml = `<span style="opacity:.5">—</span>`;
      const icons = [];

      if (hasAudio) {
        icons.push(`<span class="media-flag" title="錄音">🎵</span>`);
      }

      if (hasYoutube || hasDrive || hasExternal) {
        icons.push(`<span class="media-flag" title="影片 / 網頁">🎬</span>`);
      }

      const replyRaw = String(row.reply || "").trim();
      let hasRealReply = false;
      if (replyRaw) {
        const withoutPrefix = replyRaw.replace(REPLY_PREFIX, "").trim();
        hasRealReply = !!withoutPrefix;
      }

      if (hasRealReply) {
        icons.push(`<span class="media-flag" title="已有回覆">💬</span>`);
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
        long ? `<span class="expand-arrow" title="展開">▼</span>` : ""
      }
          </td>
          <td class="col-media">${mediaHtml}</td>
        </tr>
      `;
    })
    .join("");

  tbody.innerHTML = html;
}

// ===== [JS-4] 顯示影片、音訊（安全切換版） ======

function clearVideo() {
  stopAllPlayback();
}

/**
 * 在切換項目前，溫和暫停目前播放（保留時間點）
 * - audio / audio preview：pause()
 * - iframe：不動 src（避免 iOS 重新載入卡死）
 */
function pauseCurrentPlaybackSafely() {
  try {
    pausePlaybackKeepTime();
  } catch (e) {}
}

function showVideoForRow(row) {
  const iframe = document.getElementById("video-iframe");
  const audio = document.getElementById("audio-player");
  const ph = document.getElementById("video-placeholder");
  if (!iframe || !audio || !ph) return;

  // ✅ JS-4.x：切換前先安全暫停（避免疊音 / 卡死）
  pauseCurrentPlaybackSafely();

  // 視覺先清乾淨
  iframe.style.display = "none";
  audio.style.display = "none";
  ph.style.display = "flex";

  if (!row) return;

  let url = "";

  // ===== YouTube =====
  if (row.type === "youtube" && row.youtubeUrl) {
    url = buildYoutubeEmbedUrl(row.youtubeUrl, row.startSec, row.endSec);
    if (url) {
      // iframe 換 src 前再停一次，保險
      pauseCurrentPlaybackSafely();

      iframe.src = url;
      iframe.style.display = "block";
      ph.style.display = "none";
    }
    return;
  }

  // ===== 上傳影片 / 外部連結 =====
  if (row.type === "upload") {
    if (row.externalUrl || row.linkUrl) {
      url = row.externalUrl || row.linkUrl;
      if (url) {
        pauseCurrentPlaybackSafely();

        iframe.src = url;
        iframe.style.display = "block";
        ph.style.display = "none";
        return;
      }
    }

    if (row.driveFileId) {
      url = buildDriveEmbedUrl(row.driveFileId);
      if (url) {
        pauseCurrentPlaybackSafely();

        iframe.src = url;
        iframe.style.display = "block";
        ph.style.display = "none";
      }
      return;
    }
  }

  // ===== 錄音 =====
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
        audio.play().catch(() => {});
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

// ===== [JS-5.5] 輪播候選計算 & 控制（明確區分「自動 / 使用者」） ======

// 系統內部旗標：目前是否由輪播驅動（使用者永遠看不到）
let carouselSystemRunning = false;

function computeCarouselCandidates() {
  return commentsCache.filter((row) => {
    const type = row.type || "text";
    if (type === "youtube" && row.youtubeUrl) return true;
    if (type === "upload" && (row.driveFileId || row.externalUrl || row.linkUrl))
      return true;
    return false;
  });
}

function runCarouselStep() {
  if (!carouselActive) return;

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
    // ===== 核心：標記「這次是系統輪播，不是使用者互動」 =====
    carouselSystemRunning = true;
    try {
      selectRowForReply(row, false);
    } finally {
      carouselSystemRunning = false;
    }
  }

  if (!carouselActive) return;
  carouselTimerId = setTimeout(runCarouselStep, CAROUSEL_INTERVAL_MS);
}

function startCarouselIfPossible() {
  if (carouselUserStopped || carouselActive) return;

  const candidates = computeCarouselCandidates();
  if (!candidates.length) return;

  carouselIds = candidates.map((r) => r.id);
  carouselIndex = 0;
  carouselActive = true;

  runCarouselStep();
}

function stopCarousel(fromUser) {
  if (carouselTimerId) {
    clearTimeout(carouselTimerId);
    carouselTimerId = null;
  }
  carouselActive = false;

  // 只有「真・使用者互動」才永久停止輪播
  if (fromUser === "user") {
    carouselUserStopped = true;
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

  // ✅ 只要是「真的互動」造成的選取，就停止輪播
  // fromEditStart 也算互動（進入編輯）
  if (!carouselActive) {
    // no-op
  } else {
    // 不是輪播自動 step 時才停；輪播 step 會傳 fromEditStart=false 但也不是 user 行為
    // 我們用 hasUserInteracted 旗標來判斷：只有真正互動事件才 markUserInteracted()
  }

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
        cell.innerHTML =
          escapeHtml(row.text) +
          '<span class="expand-arrow" title="收合">▲</span>';
        cell.setAttribute("data-expanded", "1");
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
  }

  showVideoForRow(row);

  // ✅ 需求(8)(10)：任何情況回到頂端（iOS Chrome back/點表格都別跳到回覆）
  scrollToVideoTop(true);
}

// ===== [JS-9] 儲存回覆 ======
async function saveAdminReply() {
  const box = document.getElementById("admin-reply");
  if (!box || !currentSelectedId) return;

  markUserInteracted("reply-save");

  const btnSave = document.getElementById("reply-save-btn");
  const btnCancel = document.getElementById("reply-cancel-btn");

  const oldSaveText = btnSave ? btnSave.textContent : "";
  if (btnSave) {
    btnSave.disabled = true;
    btnSave.textContent = "儲存中…";
  }
  if (btnCancel) btnCancel.disabled = true;

  setBusy(true);

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

  try {
    const params = new URLSearchParams({
      action: "reply",
      id: String(currentSelectedId),
      reply: toSend,
    });

    const res = await fetch(API_URL + "?" + params.toString());
    if (!res.ok) {
      throw new Error("reply 失敗（HTTP " + res.status + "）");
    }

    const data = await res.json();
    if (!data || data.status !== "ok") {
      throw new Error(data && data.error ? data.error : "reply 失敗");
    }

    const r = findRowById(currentSelectedId);
    if (r) r.reply = toSend;

    await loadComments();

    const row = findRowById(currentSelectedId);
    if (row) selectRowForReply(row);

    hideReplyActions();
    try { box.blur(); } catch (e) {}
    scrollToVideoTop(true);
  } catch (err) {
    console.error(err);
    alert("儲存回覆失敗：" + (err.message || String(err)));
  } finally {
    setBusy(false);

    if (btnSave) {
      btnSave.disabled = false;
      btnSave.textContent = oldSaveText || "儲存";
    }
    if (btnCancel) btnCancel.disabled = false;
  }
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

// ===== [JS-A] 左側表單：錄音面板控制（MediaRecorder） ======
function stopAudioRecordingInternal(cancelOnly) {
  const statusEl = document.getElementById("audio-rec-status");
  const previewEl = document.getElementById("audio-rec-preview");
  const btnStart = document.getElementById("audio-rec-start");
  const btnStop = document.getElementById("audio-rec-stop");
  const btnPause = document.getElementById("audio-rec-pause");
  const btnCancel = document.getElementById("audio-rec-cancel");

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

  // ✅ 需求(5)：暫停鍵永遠顯示 ⏸，暫停時只是變紅、不閃；錄音中才閃
  if (btnPause) {
    btnPause.disabled = true;
    btnPause.classList.remove("recording");
    btnPause.classList.remove("paused");
    btnPause.textContent = "⏸";
  }

  const btnStart2 = document.getElementById("audio-rec-start");
  if (btnStart2) {
    btnStart2.classList.remove("recording");
    btnStart2.classList.remove("paused");
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

  btnStart.addEventListener("click", async () => {
    markUserInteracted("audio-rec-start");

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
          btnPause.classList.remove("recording", "paused");
          btnPause.textContent = "⏸";
          btnCancel.disabled = false;
          btnStart.classList.remove("recording", "paused");
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
        btnPause.classList.remove("recording", "paused");
        btnPause.textContent = "⏸";
        btnCancel.disabled = false;

        btnStart.classList.remove("recording", "paused");
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

      // 錄音中：紅點閃
      btnStart.classList.add("recording");
      btnStop.disabled = false;
      btnPause.disabled = false;
      btnCancel.disabled = false;

      btnPause.textContent = "⏸";
      btnPause.classList.remove("paused");
      btnPause.classList.add("recording");

      recorder.start();
    } catch (err) {
      console.error(err);
      statusEl.textContent = "無法啟用麥克風（可能被拒絕或裝置不支援）。";
      btnStart.disabled = false;
      btnStop.disabled = true;
      btnPause.disabled = true;
      btnCancel.disabled = false;
      btnStart.classList.remove("recording", "paused");
      btnPause.classList.remove("recording", "paused");
      btnPause.textContent = "⏸";
    }
  });

  btnStop.addEventListener("click", () => {
    markUserInteracted("audio-rec-stop");

    if (!audioRecActive || !audioRecRecorder) return;
    audioRecPaused = false;
    audioRecAccumulated = 0;
    clearAudioRecTimer();
    statusEl.textContent = "處理錄音中…";
    btnStop.disabled = true;

    btnPause.disabled = true;
    btnPause.classList.remove("recording", "paused");
    btnPause.textContent = "⏸";

    audioRecRecorder.stop();
  });

  btnPause.addEventListener("click", () => {
    markUserInteracted("audio-rec-pause");

    if (!audioRecRecorder || !audioRecActive) return;

    if (
      typeof audioRecRecorder.pause !== "function" ||
      typeof audioRecRecorder.resume !== "function"
    ) {
      statusEl.textContent = "此瀏覽器不支援暫停功能。";
      btnPause.disabled = true;
      return;
    }

    if (!audioRecPaused) {
      // 進入暫停
      audioRecPaused = true;
      audioRecAccumulated += (Date.now() - audioRecStartTime) / 1000;
      clearAudioRecTimer();
      audioRecRecorder.pause();
      statusEl.textContent = "錄音已暫停 " + formatDuration(audioRecAccumulated);

      // ✅ 暫停鍵保持 ⏸，變紅、不閃（用 class paused）
      btnPause.textContent = "⏸";
      btnPause.classList.remove("recording");
      btnPause.classList.add("paused");

      // ✅ 錄音圓點維持紅色、不閃
      btnStart.classList.remove("recording");
      btnStart.classList.add("paused");
    } else {
      // 恢復錄音
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

      btnPause.textContent = "⏸";
      btnPause.classList.remove("paused");
      btnPause.classList.add("recording");

      btnStart.classList.remove("paused");
      btnStart.classList.add("recording");
    }
  });

  btnCancel.addEventListener("click", () => {
    markUserInteracted("audio-rec-cancel");
    stopAudioRecordingInternal(true);
  });
}

function setMediaMode(mode) {
  markUserInteracted("media-mode");

  window.currentMediaMode = mode || null;

  const btnYoutube = document.getElementById("btn-media-youtube");
  const btnUpload = document.getElementById("btn-media-upload");
  const btnAudio = document.getElementById("btn-media-audio");

  const videoFields = document.getElementById("video-fields");
  const audioFields = document.getElementById("audio-fields");
  const youtubeRow = document.getElementById("youtube-row");
  const videoUploadRow = document.getElementById("video-upload-row");
  const videoLinkRow = document.getElementById("video-link-row");

  [btnYoutube, btnUpload, btnAudio].forEach((b) => {
    if (b) b.classList.remove("active");
  });

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

// ===== [JS-11] 從「新增/編輯」復原成初始狀態 ======
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
    submitBtn.textContent = "發表";
  }
  isSubmitting = false;
  isFormOpen = false;
  formMode = "add";

  editState.active = false;
  editState.id = null;
  editState.nickname = "";
  editState.originalText = "";
  editState.waitForSelect = false;

  resetReplyTargetButton();
}

// ===== [JS-12] 編輯流程：按「編輯」→ 選列 → 輸入原 username ======
function startEditForRow(row) {
  if (!row) return;

  markUserInteracted("edit-start");
  stopCarousel("user");

  editState.active = true;
  editState.id = row.id;
  editState.nickname = normalizeName(row.nickname);
  editState.originalText = row.text || "";

  const form = document.getElementById("community-form");
  const btnNew = document.getElementById("btn-new");
  const nickEl = document.getElementById("nickname-input");
  const textEl = document.getElementById("text-input");

  if (form) {
    form.classList.remove("hidden");
    form.style.display = "block";
  }
  if (btnNew) {
    btnNew.textContent = "取消編輯";
  }
  isFormOpen = true;
  formMode = "edit";

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
    if (b) b.disabled = true;
  });

  setMediaMode(null);
}

// ===== [JS-12-1] 表頭「編輯」按鈕 ======
function setupEditHeaderButton() {
  const btn = document.getElementById("btn-edit");
  if (!btn) return;

  btn.addEventListener("click", () => {
    markUserInteracted("edit-header");

    const willEnter = !editState.waitForSelect;
    resetFormToAddMode();
    editState.waitForSelect = willEnter;
    renderCommentsTable();
  });
}

// ===== [JS-13] 表格點擊：選取 / 進入編輯 / 展開收合 ======
function setupTableClicks() {
  const tbody = document.getElementById("comments-tbody");
  if (!tbody) return;

  tbody.addEventListener("click", (e) => {
    markUserInteracted("table-click");

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
        scrollToVideoTop(true);
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

// ===== [JS-14] Back 鍵：只回到頁首（不重整、不取消進行中） =====
function setupBackButton() {
  const btn = document.getElementById("back-button");
  if (!btn) return;

  btn.addEventListener("click", () => {
    markUserInteracted("back-btn");

    // ✅ 需求(10)：取消「重新整理網頁」的功能，只做回到頁首
    scrollToVideoTop(true);
  });
}

// ===== [JS-15] 管理員回覆區 ======
function setupAdminReply() {
  const box = document.getElementById("admin-reply");
  if (!box) return;

  ensureReplyPrefix();
  autoResizeReply();
  hideReplyActions();

  box.addEventListener("focus", () => {
    markUserInteracted("reply-focus");
    ensureReplyPrefix();
    autoResizeReply();
  });

  box.addEventListener("input", () => {
    markUserInteracted("reply-input");
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
      const blockedKeys = ["Backspace", "Delete", "ArrowLeft"];
      const allowKeys = ["ArrowRight", "ArrowDown", "ArrowUp", "Tab"];
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
      saveAdminReply();
    });
  }
  if (btnCancel) {
    btnCancel.addEventListener("click", () => {
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
    markUserInteracted("reply-target");

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
        escapeHtml(row.text) + '<span class="expand-arrow" title="收合">▲</span>';
      cell.setAttribute("data-expanded", "1");
    }

    // ✅ iOS Chrome：點完也回頂端（避免跳到回覆區）
    scrollToVideoTop(true);
  });
}

// ===== [JS-17] username 注音保護 + Enter 防送出 ======
let isComposingName = false;

function tryUnlockEditByName() {
  if (!editState.active) return;
  if (isComposingName) return;

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

  // ✅ 需求(11) 的「白底再暗一些 + 禁止選取變藍」要改 CSS/HTML，我這裡先不動
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

  textEl.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter") {
      ev.preventDefault();
    }
  });
}

// ===== [JS-18] 工具列 / 表單 + 送出處理 ======

// [JS-18-0] 忙碌鎖定：配合 CSS 的 body.is-busy（會讓整站暫時不能點）
function setBusy(flag) {
  try {
    if (flag) document.body.classList.add("is-busy");
    else document.body.classList.remove("is-busy");
  } catch (e) {}
}

async function handleSubmit(e) {
  e.preventDefault();

  markUserInteracted("submit");

  if (isSubmitting) return;
  isSubmitting = true;

  setBusy(true);

  const submitBtn = document.getElementById("submit-btn");
  const oldBtnText = submitBtn ? submitBtn.textContent : "";
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = "處理中…";
  }

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
      if (row) selectRowForReply(row);
      return;
    }

    // ===== 新增模式 =====
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
      payload.type = "youtube";
      payload.youtubeUrl = youtubeUrl;
    } else if (videoLink) {
      payload.type = "upload";
      payload.externalUrl = videoLink;
    } else if (vFile) {
      payload.type = "upload";

      const base64 = await readFileAsBase64(vFile);
      const mimeType = vFile.type || "application/octet-stream";
      const fileName = vFile.name || "video_" + Date.now();

      payload.videoBase64 = base64;
      payload.mimeType = mimeType;
      payload.fileName = fileName;
    } else if (aFile || window.recordedAudioBlob) {
      payload.type = "audio";

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
      throw new Error("無法解析伺服器回應（可能是權限或 CORS 問題）");
    }

    if (!data || data.status !== "ok") {
      throw new Error(data && data.error ? data.error : "add 失敗");
    }

    resetFormToAddMode();
    await loadComments();

    if (commentsCache.length) {
      const newest = commentsCache[commentsCache.length - 1];
      if (newest) selectRowForReply(newest);
    }
  } catch (err) {
    console.error(err);
    alert((isEditing ? "儲存文字修改失敗：" : "送出留言失敗：") + err.message);
  } finally {
    isSubmitting = false;

    const submitBtn2 = document.getElementById("submit-btn");
    if (submitBtn2) {
      submitBtn2.disabled = false;
      submitBtn2.textContent = oldBtnText || "發表";
    }

    setBusy(false);
  }
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

  clearVideo();

  // ✅ 需求(2)：取消「觸碰任何地方就停止輪播」
  // 改成：只有真的互動（表格點擊、按鈕、輸入、送出、回覆等）才會 markUserInteracted() → stopCarousel("user")

  // ✅ 需求(4)：切到別頁/背景時，自動暫停音訊（保留時間點）
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      pausePlaybackKeepTime();
    }
  });
  window.addEventListener("pagehide", () => {
    pausePlaybackKeepTime();
  });

  // ✅ 需求(8)：iOS Chrome back/表格後跳到回覆區的問題：強制進場也拉到最上
  // （你已經在 selectRowForReply / Back / 各互動點加了 scrollToVideoTop(true)）
  scrollToVideoTop(true);

  loadComments().catch((err) => {
    console.error(err);
    alert("載入列表失敗：" + err.message);
  });
});
