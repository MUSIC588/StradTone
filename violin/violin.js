   * { box-sizing: border-box; }

    body {
      margin: 0;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, "Microsoft JhengHei", sans-serif;
      background: #222629;
      color: #f5f5f5;
    }

    /* 整個頁面的容器：桌機置中、固定寬度，避免縮放時整塊亂飄 */
    .page {
      min-height: 100vh;
      padding: 12px;
      max-width: 1100px;
      margin: 0 auto;
    }

    /* 需求 7: 處理中禁止所有動作 */
    .page.processing-locked {
      pointer-events: none;
      cursor: wait;
    }
    .page.processing-locked input, 
    .page.processing-locked textarea {
      caret-color: transparent;
    }

    header {
      margin-bottom: 10px;
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      gap: 8px;
      flex-wrap: wrap;
    }

    header h1 { font-size: 20px; margin: 0; }
    header h2 { font-size: 14px; margin: 0; opacity: 0.8; }
    header small { font-size: 12px; opacity: 0.7; }

    main.layout {
      display: flex;
      gap: 12px;
      align-items: stretch;
    }

    .panel {
      background: #2d3236;
      border-radius: 8px;
      padding: 10px;
      box-shadow: 0 0 8px rgba(0, 0, 0, 0.35);
      min-height: 220px;
    }

    /* 左 40%、右 60%（桌機） */
    .panel-left  { flex: 0 0 40%; max-width: 40%; display: flex; flex-direction: column; }
    .panel-right { flex: 0 0 60%; max-width: 60%; display: flex; flex-direction: column; }

    h2 { font-size: 16px; margin: 0 0 4px; }

    /* 「給站主看的說明」文字 → 改成跟背景一樣色，等於隱藏 */
    .hint,
    .reply-note {
      font-size: 12px;
      line-height: 1.4;
      color: #222629;  /* 和 body 背景一樣 */
    }

    .hidden { display: none !important; }

    /* placeholder 顏色再淡一點 */
    input::placeholder,
    textarea::placeholder {
      color: #999;
      opacity: 0.7;
    }
    input::-webkit-input-placeholder,
    textarea::-webkit-input-placeholder {
      color: #999;
      opacity: 0.7;
    }


/* =====================================================
 * [CSS-1] 左側：工具列 + 表單
 * ===================================================== */

.toolbar {
  display: flex;
  gap: 6px;
  margin-bottom: 6px;
  flex-wrap: wrap;
}

.toolbar button {
  padding: 4px 10px;
  border-radius: 14px;
  border: 1px solid #777;
  background: #3a3f44;
  color: #f5f5f5;
  font-size: 12px;
  cursor: pointer;
}
.toolbar button:hover { background: #4a5056; }

form#community-form {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 8px;
  padding: 6px 8px;
  border-radius: 6px;
  border: 1px solid #d1a343;        /* 邊框改成金色一點 */
  background: #141b20;               /* 底色加深，與表格區拉開 */
  box-shadow: 0 0 10px rgba(0,0,0,0.65);
}
form#community-form label {
  font-size: 13px;
  display: block;
}

form#community-form input[type="text"] {
  width: 100%;
  padding: 4px 6px;
  margin-top: 2px;
  border-radius: 4px;
  border: 1px solid #555;
  background: #1f2326;
  color: #f5f5f5;
  font-size: 13px;
}

/* 編輯 / 發表時可輸入 → 白底 */
form#community-form input[type="text"]:not(:disabled) {
  background: #ffffff;
  color: #111;
}

/* 需求 11: 驗證後暗一些的白底 */
form#community-form input[type="text"].verified-user {
  background: #d0d0d0 !important;
  pointer-events: none !important;
  user-select: none !important;
}

/* 鎖定狀態（等名稱驗證）→ 深底 */
form#community-form input[type="text"]:disabled {
  background: #1f2326;
  color: #999;
}

#record-btn {
  padding: 4px 10px;
  border-radius: 16px;
  border: 1px solid #777;
  background: #3a3f44;
  color: #f5f5f5;
  font-size: 12px;
  cursor: not-allowed; /* 預留錄音 */
  opacity: 0.6;
}

.form-row-inline {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
}

#video-file-input {
  font-size: 11px;
}

#video-file-label {
  font-size: 11px;
  opacity: 0.8;
}

#submit-btn {
  padding: 4px 14px;
  border-radius: 16px;
  border: none;
  background: #d1a343;
  color: #1d1d1d;
  font-size: 13px;
  cursor: pointer;
}
#submit-btn:hover { background: #e0b85f; }

.sub-hint {
  font-size: 11px;
  opacity: 0.8;
}

/* 三顆媒體選擇按鈕 */
.media-select-row {
  margin: 4px 0 2px;
  gap: 6px;
}

.media-select-btn {
  padding: 3px 10px;
  border-radius: 14px;
  border: 1px solid #777;
  background: #3a3f44;
  color: #f5f5f5;
  font-size: 12px;
  cursor: pointer;
  opacity: 0.9;
}

/* 需求 6: 隱蔽按鈕字樣淺一階 */
#btn-media-upload, #btn-media-audio {
  color: #888;
}

.media-select-btn.active {
  border-color: #d1a343;
  background: #e0b85f;
  color: #1d1d1d;
  font-weight: 600;
}

.media-select-btn:disabled {
  opacity: 0.35;
  filter: grayscale(0.4);
  cursor: default;
}

/* 需求 9: YouTube 紅色加黃且粗體 */
#btn-media-youtube {
  background: #d12c2c; /* 紅色加黃元素 */
  border-color: #ff5050;
  color: #111111;
  font-weight: 800; /* 粗體 */
}
#btn-media-youtube:hover:not(:disabled) {
  background: #e00000;
}
#btn-media-youtube.active {
  background: #ff0000;
  border-color: #ff8080;
  color: #000000;
}
/* 需求 9: 選中其他兩項時變黑灰底 */
.media-select-btn.active:not(#btn-media-youtube) ~ #btn-media-youtube,
#btn-media-upload.active ~ #btn-media-youtube,
#btn-media-audio.active ~ #btn-media-youtube {
  background: #3a3f44;
  color: #f5f5f5;
  border-color: #777;
  font-weight: normal;
}



/* 表單內：錄影/錄音控制列（目前只給錄音用） */
.media-record-toolbar {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 4px;
  font-size: 11px;
}
.media-record-btn {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  border: 1px solid #777;
  background: #3a3f44;
  color: #f5f5f5;
  font-size: 14px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background-color 0.15s ease, border-color 0.15s ease, color 0.15s ease, opacity 0.15s ease;
}
.media-record-btn[disabled] {
  opacity: 0.4;
  cursor: default;
}

/* 需求 5: 暫停鍵變紅 */
#audio-rec-pause.paused-red {
  color: #ff0000;
  border-color: #ff0000;
}

/* 錄音中：白點變紅、外觀稍亮並閃爍 */
.media-record-btn.recording {
  color: #ff4b4b;
  border-color: #ff8080;
  background: #4a3a3a;
  animation: recordBlink 0.8s ease-in-out infinite;
}

/* 需求 5: 暫停時停止閃爍 */
.media-record-btn.recording.no-blink {
  animation: none;
}

@keyframes recordBlink {
  0%   { opacity: 1; }
  50%  { opacity: 0.3; }
  100% { opacity: 1; }
}
/* 右上影音區的 audio 播放器（有錄音時使用） */
#audio-player {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  width: 100%;
  background: #111315;
  display: none; /* 預設隱藏，需要時由 JS 顯示 */
}

.media-record-status {
  font-size: 11px;
  opacity: 0.8;
}

/* 錄影 / 錄音預覽區 */
.rec-preview {
  width: 100%;
  max-height: 140px;
  border-radius: 4px;
  border: 1px solid #444;
  background: #111;
}


  /* =====================================================
 * [CSS-2] 左側：留言列表表格
 * ===================================================== */

.comments-wrapper {
  flex: 1 1 auto;
  overflow-y: auto;           /* 僅縱向捲動 */
  overflow-x: hidden;         /* 不要橫向卷軸 */
  border-radius: 6px;
  border: 1px solid #444;
  background: #202427;
}
table#comments-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
  table-layout: fixed;        /* 固定欄寬，避免左右亂跑 */
}
table#comments-table thead {
  position: sticky;
  top: 0;
  background: #33383c;
  z-index: 1;
}
table#comments-table th,
table#comments-table td {
  border-bottom: 1px solid #333;
  padding: 4px 6px;
  text-align: left;
  vertical-align: top;
  word-wrap: break-word;
  word-break: break-word;     /* 依裝置寬度自動折行 */
}
table#comments-table th {
  font-weight: 600;
  font-size: 12px;
}
table#comments-table tbody tr:nth-child(even) {
  background: #252a2e;
}

.col-nick  { width: 80px; white-space: nowrap; }
.col-text  { width: 50%; position: relative; }
.col-media { width: 90px; }

.media-icons {
  display: flex;
  gap: 4px;
  align-items: center;
  flex-wrap: wrap;
  font-size: 13px;
}

.media-flag {
  font-size: 16px;   /* 圖示稍微放大 */
}

/* 每列前面的筆按鈕（進入編輯用） */
.row-edit-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  margin-right: 4px;
  border-radius: 4px;
  border: 1px solid #888;
  background: #3a3f44;
  box-shadow: 0 0 3px rgba(0,0,0,0.5);
  font-size: 12px;
  cursor: pointer;
  flex-shrink: 0;
}
.row-edit-btn:hover {
  background: #4a5056;
}

.play-video-btn {
  padding: 2px 6px;
  border-radius: 12px;
  border: 1px solid #888;
  background: #3a3f44;
  color: #f5f5f5;
  font-size: 11px;
  cursor: pointer;
  margin-top: 2px;
}

/* 表頭的「編輯」小鈕 */
.edit-header-btn {
  margin-left: 6px;
  padding: 1px 6px;
  border-radius: 10px;
  border: 1px solid #666;
  background: #2f3438;
  color: #d0d0d0;
  font-size: 10px;
  cursor: pointer;
  opacity: 0.8;
}
.edit-header-btn:hover {
  opacity: 1;
  background: #4a5056;
}

.expand-arrow {
  font-size: 10px;
  opacity: 0.7;
  float: right;
  margin-left: 4px;
  cursor: pointer;
}

#comments-tbody tr.selected {
  background: #4f7a3b !important; /* 比原本再亮一點 */
}

/* 選到的列閃一下（給回覆區名稱按鈕用） */
.row-flash {
  animation: rowFlash 0.8s ease-out;
}
@keyframes rowFlash {
  0%   { background-color: #7fbf4f; }
  100% { background-color: inherit; }
}

/* 左側 Back 按鈕（移到表格底下） */
#back-button {
  margin-top: 6px;
  align-self: flex-start;
  padding: 4px 10px;
  border-radius: 14px;
  border: 1px solid #777;
  background: #3a3f44;
  color: #f5f5f5;
  font-size: 12px;
  cursor: pointer;
}


    /* =====================================================
     * [CSS-3] 右側：視覺區框架
     * ===================================================== */

    .visual-wrapper {
      display: flex;
      flex-direction: column;
      gap: 8px;
      height: 100%;
    }
    .visual-header {
      font-size: 13px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 8px;
    }
    .current-point { font-size: 12px; opacity: 0.9; }

    /* 右上角「尚未選取留言 / 播放中…」暫時不顯示 */
    .current-point {
      display: none;
    }

    .visual-body {
      flex: 1 1 auto;
      display: flex;
      flex-direction: column;
      gap: 8px;
      min-height: 260px;
    }

    .top-row {
      display: flex;
      gap: 8px;
      min-height: 170px;
    }

    /* 左：影片／錄音格子 */
    .video-frame-wrap {
      flex: 1 1 60%;
      background: #111315;
      border-radius: 6px;
      overflow: hidden;
      border: 1px solid #555;
      position: relative;
      min-height: 150px;
    }
    .video-frame-wrap iframe {
      width: 100%;
      height: 100%;
      border: none;
    }
    .video-placeholder {
      position: absolute;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 12px;
      color: #999;
      text-align: center;
      padding: 8px;
    }

    /* =====================================================
     * [CSS-4] 右側：多層圓
     * ===================================================== */

    .circle-area {
      flex: 1 1 40%;
      display: flex;
      justify-content: center;
      align-items: center;
    }

    .circle-stack {
      position: relative;
      width: 160px;
      height: 160px;
      border-radius: 50%;
      --ring-main-color: #5c7a5c;
      --ring-boundary-color: #9ad09a;
      --ring-highlight-color: #70ff70;
      --ring-outer-fog: rgba(112, 255, 112, 0.35);
      background: radial-gradient(circle at 20% 20%, #555, #111);
    }

    .ring {
      position: absolute;
      border-radius: 50%;
      transition: border-color 0.12s ease, box-shadow 0.12s ease, opacity 0.12s ease;
    }

    .ring-main {
      border: 3px solid var(--ring-main-color);
      opacity: 0.8;
    }
    .ring-boundary {
      border: 1.2px solid var(--ring-boundary-color);
      opacity: 0.7;
    }
    .ring-b45 {
      border: 1px solid transparent;
      box-shadow: 0 0 16px var(--ring-outer-fog);
      opacity: 0.9;
    }

    .ring-b45 { inset: 4%;  } /* 4.5 */
    .ring-4   { inset: 10%; } /* 4   */
    .ring-b35 { inset: 20%; } /* 3.5 */
    .ring-3   { inset: 26%; } /* 3   */
    .ring-b25 { inset: 36%; } /* 2.5 */
    .ring-2   { inset: 42%; } /* 2   */
    .ring-b15 { inset: 52%; } /* 1.5 */
    .ring-1   { inset: 60%; } /* 1   */

    .ring.active {
      border-color: var(--ring-highlight-color);
      opacity: 1;
      box-shadow: 0 0 10px rgba(140, 255, 140, 0.9);
    }

    .layer-label {
      position: absolute;
      bottom: 6px;
      right: 8px;
      font-size: 11px;
      color: #cfe9cf;
      text-shadow: 0 0 3px #000;
    }

    /* 暫時隱藏層級文字 */
    .layer-label {
      display: none;
    }

    /* =====================================================
     * [CSS-5] 右側下半：回覆區 + 指板
     * ===================================================== */

    .bottom-row {
      display: flex;
      gap: 8px;
      align-items: stretch;
    }

    /* 回覆區寬度改成和影片同樣比例（約 6:4） */
    .reply-area {
      flex: 1 1 60%;
    }

    .reply-area-header {
      font-size: 13px;
      margin: 0 0 4px;
    }

    .reply-target {
      font-size: 12px;
      margin-bottom: 4px;
      opacity: 0.85;
    }

/* 回覆區下方的「儲存 / 取消」 */
.reply-actions {
  margin-top: 4px;
  display: flex;
  gap: 6px;
}
.reply-actions.hidden {
  display: none;
}
.reply-action-btn {
  padding: 3px 10px;
  border-radius: 14px;
  border: 1px solid #bbb;
  background: #f5f5f5;
  color: #222629;
  font-size: 12px;
  cursor: pointer;
}
.reply-action-btn.reply-cancel-btn {
  background: #3a3f44;
  color: #f5f5f5;
  border-color: #777;
}

    .reply-target-btn {
      padding: 3px 10px;
      border-radius: 14px;
      border: 1px solid #bbb;
      background: #f5f5f5;
      color: #222629;
      font-size: 12px;
      cursor: pointer;
      transition: background-color 0.15s ease, border-color 0.15s ease, color 0.15s ease;
    }
    .reply-target-btn:disabled {
      opacity: 0.6;
      cursor: default;
    }

    /* 被項目連動時，顏色跟 .selected row 一致 */
    .reply-target-btn.linked {
      background: #4f7a3b;
      border-color: #4f7a3b;
      color: #f5f5f5;
    }

    .reply-note {
      font-size: 11px;
      opacity: 0.75;
      margin-bottom: 4px;
    }

    #admin-reply {
      width: 100%;
      background: #1f2326;
      border: 1px solid #555;
      color: #f5f5f5;
      font-size: 12px;
      border-radius: 4px;
      min-height: 80px;
      resize: none;           /* 先由 JS 控制拖拉 */
      overflow: hidden;       /* 由 JS 控制是否出現卷軸 */
      line-height: 1.4;
    }

    .fingerboard-row {
      flex: 1 1 40%;
      display: flex;
      justify-content: center;
      align-items: center;
    }

    .fingerboard {
      position: relative;
      width: 120px;
      max-width: 140px;
      height: 260px;
      background: linear-gradient(180deg, #181a1d, #34383d);
      border-radius: 14px;
      overflow: hidden;
      border: 2px solid #676f78;
      box-shadow: 0 0 10px rgba(0, 0, 0, 0.55);
    }

    .fb-string {
      position: absolute;
      top: 6%;
      bottom: 6%;
      width: 2px;
      background: linear-gradient(180deg, #cfcfcf, #888);
      opacity: 0.9;
    }
    .fb-s1 { left: 20%; transform: skewX(-3deg); }
    .fb-s2 { left: 40%; transform: skewX(-1.5deg); }
    .fb-s3 { left: 62%; transform: skewX( 1.5deg); }
    .fb-s4 { left: 80%; transform: skewX( 3deg); }

    .fingerboard-note {
      position: absolute;
      font-size: 10px;
      color: #fdf5c5;
      opacity: 0.95;
      text-shadow: 0 0 2px #000;
      pointer-events: none;
    }

    /* =====================================================
     * [CSS-6] 手機版
     * ===================================================== */

    @media (max-width: 820px) {
      .page {
        padding: 0;         /* 手機版滿版 */
        max-width: 100%;
      }

      main.layout {
        flex-direction: column;
      }

      /* 手機版：順序改成 右（影片+多層圓+回覆+指板）在上，左（表格）在下 */
      #visual-panel {
        order: 1;
      }
      #comments-section {
        order: 2;
      }

      .panel-left,
      .panel-right {
        max-width: 100%;
        width: 100%;
        border-radius: 0;
      }

      .panel-right .visual-body {
        min-height: 420px;
      }

      /* 手機版：上層只要影片，影片高度固定 */
      .top-row {
        flex-direction: column;
        min-height: 0;
      }

      .video-frame-wrap {
        width: 100%;
        height: 160px !important;
        min-height: 160px;
      }

      .circle-area {
        justify-content: center;
        margin-top: 6px;
      }

      .circle-stack {
        width: 160px;
        height: 160px;
      }

      .fingerboard {
        height: 220px;
      }

      /* 手機版：中層 回覆區 + 指板 左右並排 */
      .bottom-row {
        flex-direction: row;
      }

      .reply-area {
        flex: 1 1 60%;
      }

      .fingerboard-row {
        flex: 1 1 40%;
      }
    }

