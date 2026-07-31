/* ============================================================
   精読トレーナー — script.js
   依存: questions.js, storage.js (先読み必須)
   ============================================================ */

// ───────────────────────────────────────────────
// 定数
// ───────────────────────────────────────────────
const SESSION_KEYS  = ['8','9','10','11','12','13a','13b'];
const SESSION_LABEL = {
  '8' :'第八回','9':'第九回','10':'第十回',
  '11':'第十一回','12':'第十二回',
  '13a':'13A SpaceX','13b':'13B 目標株価'
};

// ───────────────────────────────────────────────
// アプリ状態
// ───────────────────────────────────────────────
let st = {
  mode       : 'read',   // 'read' | 'vocab'
  sessKey    : '8',      // SESSION_KEYS のいずれか
  levelFilter: 'priority', // 'priority' | 'all'
  reviewMode : false,
  shuffle    : false,

  order      : [],       // 表示順インデックス配列
  pos        : 0,        // order 内の現在位置

  // read 専用
  readPhase  : 'read',   // 'read' | 'quiz' | 'final'
  finalIdx   : 0,        // FINAL_QUIZ 内のインデックス
  showJp     : false,
  showSum    : false,
  quizDone   : false,    // 段落クイズ回答済み

  // vocab 専用
  vocabPhase : 'front',  // 'front' | 'back'
  choices    : [],       // 現在の4択
  choicePicked: -1,

  // スコア
  score  : 0,
  streak : 0,
  best   : 0,
};

// ───────────────────────────────────────────────
// 初期化
// ───────────────────────────────────────────────
function init() {
  const prog = getProgress();            // storage.js
  st.mode     = prog.mode || 'read';
  st.sessKey  = String(prog.session || '8');
  st.score    = 0;
  st.streak   = 0;
  st.best     = Number(localStorage.getItem('__best__') || 0);

  // モードセグのリスナー
  document.getElementById('modeSeg').addEventListener('click', e => {
    const btn = e.target.closest('button[data-mode]');
    if (!btn) return;
    st.mode = btn.dataset.mode;
    st.reviewMode = false;
    resetPos();
    render();
  });

  render();
}

// ───────────────────────────────────────────────
// データ取得ユーティリティ
// ───────────────────────────────────────────────

/** セッションキーに属する PARAS インデックス配列を返す */
function getParaIndices(sessKey) {
  return PARAS.reduce((acc, p, i) => {
    if (p.artKey === sessKey || (p.s === Number(sessKey) && !['13a','13b'].includes(sessKey))) acc.push(i);
    return acc;
  }, []);
}

/** セッションキーに属する VOCAB インデックス配列を返す */
function getVocabIndices(sessKey) {
  const s = sessKey === '13a' || sessKey === '13b' ? 13 : Number(sessKey);
  return VOCAB.reduce((acc, v, i) => {
    if (v.s === s) acc.push(i);
    return acc;
  }, []);
}

/** 復習リストを order インデックスに変換 */
function reviewIndices(sessKey, mode) {
  const wrongs = getWrongList();
  if (mode === 'vocab') {
    return getVocabIndices(sessKey).filter(i => {
      const id = makeID('vocab', sessKey, i);
      return wrongs.includes(id);
    });
  } else {
    return getParaIndices(sessKey).filter(i => {
      const id = makeID('read', sessKey, i);
      return wrongs.includes(id);
    });
  }
}

/** 現在の para オブジェクト */
function currentPara() { return PARAS[currentRawIdx()]; }
/** 現在の vocab オブジェクト */
function currentVocab() { return VOCAB[currentRawIdx()]; }
/** order から生のインデックスを取得 */
function currentRawIdx() { return st.order[st.pos] ?? 0; }

// ───────────────────────────────────────────────
// 順序構築
// ───────────────────────────────────────────────
function buildOrder() {
  let indices;
  if (st.reviewMode) {
    indices = reviewIndices(st.sessKey, st.mode);
  } else if (st.mode === 'vocab') {
    indices = getVocabIndices(st.sessKey);
    if (st.levelFilter === 'priority') indices = indices.filter(i => VOCAB[i].p === 1);
  } else {
    indices = getParaIndices(st.sessKey);
  }
  if (indices.length === 0) indices = [0];
  st.order = st.shuffle ? shuffle([...indices]) : [...indices];
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** セッション・モード変更時のリセット */
function resetPos() {
  st.pos = 0;
  st.readPhase  = 'read';
  st.finalIdx   = 0;
  st.showJp     = false;
  st.showSum    = false;
  st.quizDone   = false;
  st.vocabPhase = 'front';
  st.choices    = [];
  st.choicePicked = -1;
  buildOrder();
  // 前回位置を復元（reviewMode でなければ）
  if (!st.reviewMode) {
    const prog = getProgress();
    if (prog.mode === st.mode && String(prog.session) === st.sessKey) {
      const idx = prog.index || 0;
      const pos = st.order.indexOf(idx);
      if (pos >= 0) st.pos = pos;
    }
  }
}

// ───────────────────────────────────────────────
// 4択生成（vocab）
// ───────────────────────────────────────────────
function buildVocabChoices(correctIdx) {
  const correct = VOCAB[correctIdx];
  const pool = VOCAB.filter((v, i) => i !== correctIdx && v.m !== correct.m);
  const wrongs = shuffle([...pool]).slice(0, 3).map(v => v.m);
  const all = shuffle([correct.m, ...wrongs]);
  st.choices = all;
  return all;
}

// ───────────────────────────────────────────────
// スコア処理
// ───────────────────────────────────────────────
function handleAnswer(correct, mode, rawIdx) {
  saveAnswer(mode, st.sessKey, rawIdx, correct);
  if (correct) {
    const bonus = Math.min(st.streak * 2, 20);
    st.score  += 10 + bonus;
    st.streak += 1;
    if (st.score > st.best) {
      st.best = st.score;
      localStorage.setItem('__best__', st.best);
    }
    showFx('✓', 'ok');
    showToast(`+${10 + bonus}pt${bonus ? '　🔥×' + st.streak : ''}`, 'ok');
  } else {
    st.streak = 0;
    showFx('✗', 'ng');
    showToast('不正解', 'ng');
  }
  renderTape();
}

// ───────────────────────────────────────────────
// エフェクト・トースト
// ───────────────────────────────────────────────
function showFx(text, type) {
  const el = document.getElementById('fx');
  el.textContent = text;
  el.className = 'fx ' + type;
  el.style.animation = 'none';
  void el.offsetWidth;
  el.style.animation = '';
}

let toastTimer;
function showToast(msg, type) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = 'toast ' + type + ' show';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 1800);
}

// ───────────────────────────────────────────────
// ナビゲーション
// ───────────────────────────────────────────────
function goNext() {
  if (st.mode === 'read') {
    if (st.readPhase === 'read') {
      // クイズフェーズへ
      st.readPhase = 'quiz';
      st.quizDone  = false;
    } else if (st.readPhase === 'quiz') {
      // 次の段落 or FINAL_QUIZ
      if (st.pos >= st.order.length - 1) {
        if (FINAL_QUIZ[st.sessKey]) {
          st.readPhase = 'final';
          st.finalIdx  = 0;
          st.quizDone  = false;
        }
      } else {
        st.pos++;
        st.readPhase = 'read';
        st.showJp   = false;
        st.showSum  = false;
        st.quizDone = false;
        saveProgress(st.mode, st.sessKey, currentRawIdx());
      }
    } else if (st.readPhase === 'final') {
      if (st.finalIdx < FINAL_QUIZ[st.sessKey].length - 1) {
        st.finalIdx++;
        st.quizDone = false;
      } else {
        showToast('🎉 全問完了！', 'ok');
        st.readPhase = 'read';
        st.pos = 0;
        st.finalIdx = 0;
      }
    }
  } else {
    // vocab
    if (st.vocabPhase === 'back') {
      if (st.pos < st.order.length - 1) {
        st.pos++;
        st.vocabPhase   = 'front';
        st.choicePicked = -1;
        buildVocabChoices(currentRawIdx());
        saveProgress(st.mode, st.sessKey, currentRawIdx());
      } else {
        showToast('🎉 セッション完了！', 'ok');
      }
    }
  }
  render();
}

function goPrev() {
  if (st.mode === 'read') {
    if (st.readPhase === 'quiz') {
      st.readPhase = 'read';
    } else if (st.readPhase === 'final') {
      if (st.finalIdx > 0) { st.finalIdx--; st.quizDone = false; }
      else { st.readPhase = 'quiz'; }
    } else if (st.pos > 0) {
      st.pos--;
      st.readPhase = 'read';
      st.showJp = false; st.showSum = false; st.quizDone = false;
      saveProgress(st.mode, st.sessKey, currentRawIdx());
    }
  } else {
    if (st.vocabPhase === 'front' && st.pos > 0) {
      st.pos--;
      st.vocabPhase   = 'back';
      st.choicePicked = -1;
      saveProgress(st.mode, st.sessKey, currentRawIdx());
    } else if (st.vocabPhase === 'back') {
      st.vocabPhase   = 'front';
      st.choicePicked = -1;
      buildVocabChoices(currentRawIdx());
    }
  }
  render();
}

// ───────────────────────────────────────────────
// メインレンダリング
// ───────────────────────────────────────────────
function render() {
  renderTape();
  renderControls();
  if (st.order.length === 0) buildOrder();
  if (st.mode === 'vocab' && st.vocabPhase === 'front' && st.choices.length === 0) {
    buildVocabChoices(currentRawIdx());
  }
  renderStage();
  renderActions();
}

// ─── テープ（正答率/連続/スコア/ベスト）───
function renderTape() {
  const stats = getStatistics();
  document.getElementById('acc').textContent    = stats.total ? stats.rate + '%' : '—';
  document.getElementById('streak').textContent = st.streak;
  document.getElementById('score').textContent  = st.score;
  document.getElementById('best').textContent   = st.best;
}

// ─── コントロール（モード/セッション/レベル）───
function renderControls() {
  // モードセグ
  document.querySelectorAll('#modeSeg button').forEach(btn => {
    btn.classList.toggle('on', btn.dataset.mode === st.mode);
  });

  // セッションチップス
  const sessEl = document.getElementById('sessChips');
  sessEl.innerHTML = SESSION_KEYS.map(k =>
    `<button class="chip${st.sessKey === k ? ' on' : ''}" data-sess="${k}">${SESSION_LABEL[k]}</button>`
  ).join('');
  sessEl.querySelectorAll('[data-sess]').forEach(btn => {
    btn.addEventListener('click', () => {
      st.sessKey = btn.dataset.sess;
      st.reviewMode = false;
      resetPos();
      render();
    });
  });

  // レベルチップス（単語モードのみ）
  const lvlEl = document.getElementById('lvlChips');
  if (st.mode === 'vocab') {
    lvlEl.innerHTML = `
      <button class="chip${st.levelFilter === 'priority' ? ' on' : ''}" data-lv="priority">重要語</button>
      <button class="chip${st.levelFilter === 'all' ? ' on' : ''}" data-lv="all">全語</button>
      <button class="chip${st.reviewMode ? ' on warn' : ''}" data-lv="review">復習</button>
    `;
    lvlEl.querySelectorAll('[data-lv]').forEach(btn => {
      btn.addEventListener('click', () => {
        if (btn.dataset.lv === 'review') {
          st.reviewMode = !st.reviewMode;
        } else {
          st.levelFilter = btn.dataset.lv;
          st.reviewMode  = false;
        }
        resetPos();
        render();
      });
    });
  } else {
    // 精読モードのレベルチップス：復習のみ
    lvlEl.innerHTML = `<button class="chip${st.reviewMode ? ' on warn' : ''}" data-lv="review">復習モード</button>`;
    lvlEl.querySelectorAll('[data-lv]').forEach(btn => {
      btn.addEventListener('click', () => {
        st.reviewMode = !st.reviewMode;
        resetPos();
        render();
      });
    });
  }

  // レベルサマリーバッジ
  const sumEl = document.getElementById('lvlSummary');
  sumEl.innerHTML = renderLvlSummary();

  // ストレージ警告
  const warnEl = document.getElementById('storageWarn');
  if (st.reviewMode && st.order.length === 0) {
    warnEl.style.display = 'block';
    warnEl.textContent   = '復習リストが空です。まず問題を解いてください。';
  } else {
    warnEl.style.display = 'none';
  }
}

function renderLvlSummary() {
  const stats = getStatistics();
  if (!stats.total) return '';
  return `<span class="badge">試行 ${stats.total}</span><span class="badge ok">正解 ${stats.correct}</span><span class="badge ng">誤答 ${stats.wrong}</span>`;
}

// ─── ステージ ───
function renderStage() {
  const el = document.getElementById('stage');
  if (st.order.length === 0) {
    el.innerHTML = '<p class="empty">このセッションにデータがありません。</p>';
    return;
  }
  if (st.mode === 'read') {
    el.innerHTML = renderRead();
  } else {
    el.innerHTML = renderVocab();
  }
  attachStageListeners();
}

// ─── 精読モード ステージ ───
function renderRead() {
  if (st.readPhase === 'final') return renderFinalQuiz();

  const para     = currentPara();
  if (!para) return '<p class="empty">データなし</p>';
  const rawIdx   = currentRawIdx();
  const pdEntry  = PARA_DATA[rawIdx];
  const artLabel = ART_LABEL[para.artKey] || ('第' + para.s + '回');
  const bm       = isBookmarked('read', st.sessKey, rawIdx);
  const progress = `${st.pos + 1} / ${st.order.length}`;
  const ans      = getAnswer('read', st.sessKey, rawIdx);

  let html = `<div class="card read-card">`;
  html += `<div class="card-meta">
    <span class="badge">${artLabel}</span>
    <span class="badge">${progress}</span>
    ${bm ? '<span class="badge bm">🔖</span>' : ''}
    ${ans.try ? `<span class="badge ${ans.correct > 0 ? 'ok' : 'ng'}">${ans.correct}/${ans.try}</span>` : ''}
  </div>`;

  if (st.readPhase === 'read') {
    // 英文表示
    html += `<div class="en-text" id="enText">${renderEnText(para)}</div>`;

    // 和訳トグル
    html += `<button class="toggle-btn" id="btnJp">${st.showJp ? '▲ 和訳を隠す' : '▼ 和訳を見る'}</button>`;
    if (st.showJp) {
      html += `<div class="jp-text">${escHtml(para.jp)}</div>`;
    }

    // サマリートグル
    if (pdEntry) {
      html += `<button class="toggle-btn" id="btnSum">${st.showSum ? '▲ 要旨を隠す' : '▼ 要旨を見る'}</button>`;
      if (st.showSum) {
        html += `<div class="summary-box">${escHtml(pdEntry.sum)}</div>`;
      }
    }

    // HARD_WORDS ヒント
    const hw = findHardWords(para.en);
    if (hw.length) {
      html += `<div class="hw-bar">${hw.map(h => `<span class="hw-chip"><b>${escHtml(h.w)}</b>：${escHtml(h.m)}</span>`).join('')}</div>`;
    }

  } else if (st.readPhase === 'quiz') {
    if (!pdEntry) {
      html += '<p class="empty">この段落の問題データがありません。</p>';
    } else {
      html += renderParaQuiz(pdEntry, rawIdx);
    }
  }

  html += '</div>';
  return html;
}

function renderEnText(para) {
  // 文ごとに分けて表示
  if (para.sentences && para.sentences.length > 1) {
    return para.sentences.map((s, i) =>
      `<p class="en-sent" data-sidx="${i}">${renderBold(s.en)}</p>`
    ).join('');
  }
  return `<p class="en-sent">${renderBold(para.en)}</p>`;
}

function renderParaQuiz(pd, rawIdx) {
  let html = `<div class="quiz-box">`;
  html += `<p class="quiz-q">${escHtml(pd.q)}</p>`;
  html += `<div class="choices">`;
  pd.o.forEach((opt, i) => {
    let cls = 'choice';
    if (st.quizDone) {
      if (i === pd.c)  cls += ' correct';
      else             cls += ' wrong';
    }
    html += `<button class="choice-btn ${cls}" data-qi="${i}">${escHtml(opt)}</button>`;
  });
  html += `</div>`;
  if (st.quizDone && pd.e) {
    html += `<div class="explanation"><span class="ex-label">解説</span>${renderBold(pd.e)}</div>`;
  }
  html += '</div>';
  return html;
}

function renderFinalQuiz() {
  const fqs = FINAL_QUIZ[st.sessKey];
  if (!fqs || fqs.length === 0) return '<p class="empty">仕上げ問題がありません。</p>';
  const fq = fqs[st.finalIdx];
  let html = `<div class="card read-card">`;
  html += `<div class="card-meta"><span class="badge warn">仕上げ問題</span><span class="badge">${st.finalIdx + 1} / ${fqs.length}</span></div>`;
  html += `<p class="quiz-q final-q">${escHtml(fq.q)}</p>`;
  html += `<div class="choices">`;
  fq.o.forEach((opt, i) => {
    let cls = 'choice';
    if (st.quizDone) {
      cls += i === fq.c ? ' correct' : ' wrong';
    }
    html += `<button class="choice-btn ${cls}" data-fqi="${i}">${escHtml(opt)}</button>`;
  });
  html += `</div>`;
  if (st.quizDone && fq.e) {
    html += `<div class="explanation"><span class="ex-label">解説</span>${renderBold(fq.e)}</div>`;
  }
  html += '</div>';
  return html;
}

// ─── 単語モード ステージ ───
function renderVocab() {
  const v      = currentVocab();
  if (!v) return '<p class="empty">データなし</p>';
  const rawIdx = currentRawIdx();
  const bm     = isBookmarked('vocab', st.sessKey, rawIdx);
  const ans    = getAnswer('vocab', st.sessKey, rawIdx);
  const prog   = `${st.pos + 1} / ${st.order.length}`;

  let html = `<div class="card vocab-card">`;
  html += `<div class="card-meta">
    <span class="badge">${SESSION_LABEL[st.sessKey]}</span>
    <span class="badge">${prog}</span>
    ${v.p ? '<span class="badge hot">重要</span>' : ''}
    ${bm ? '<span class="badge bm">🔖</span>' : ''}
    ${ans.try ? `<span class="badge ${ans.correct > 0 ? 'ok' : 'ng'}">${ans.correct}/${ans.try}</span>` : ''}
  </div>`;

  // 表面：英単語 + 4択
  html += `<div class="vocab-term">${renderBold(v.t)}</div>`;

  if (st.vocabPhase === 'front') {
    html += `<div class="choices vocab-choices">`;
    st.choices.forEach((c, i) => {
      let cls = 'choice-btn';
      if (st.choicePicked >= 0) {
        if (i === st.choices.indexOf(v.m)) cls += ' correct';
        else if (i === st.choicePicked)     cls += ' wrong';
        else                                 cls += ' disabled';
      }
      html += `<button class="${cls}" data-ci="${i}">${escHtml(c)}</button>`;
    });
    html += '</div>';
  } else {
    // 裏面：意味＋文脈解説
    html += `<div class="vocab-meaning">${escHtml(v.m)}</div>`;
    if (v.c) {
      html += `<div class="explanation"><span class="ex-label">文脈</span>${renderBold(v.c)}</div>`;
    }
    // HARD_WORDS ヒント（単語の語根など）
    const hw = findHardWords(v.t + ' ' + (v.m || ''));
    if (hw.length) {
      html += `<div class="hw-bar">${hw.map(h => `<span class="hw-chip"><b>${escHtml(h.w)}</b>：${escHtml(h.m)}</span>`).join('')}</div>`;
    }
  }

  html += '</div>';
  return html;
}

// ─── アクションボタン ───
function renderActions() {
  const el = document.getElementById('actions');
  const bm = st.order.length > 0 && isBookmarked(st.mode, st.sessKey, currentRawIdx());

  // 「次へ」ラベル決定
  let nextLabel = '次へ →';
  if (st.mode === 'read') {
    if (st.readPhase === 'read') nextLabel = '問題を解く →';
    else if (st.readPhase === 'quiz' && st.pos >= st.order.length - 1 && FINAL_QUIZ[st.sessKey]) nextLabel = '仕上げ問題 →';
    else if (st.readPhase === 'final' && st.finalIdx >= (FINAL_QUIZ[st.sessKey]?.length || 1) - 1) nextLabel = '最初に戻る';
  }
  if (st.mode === 'vocab' && st.vocabPhase === 'front') nextLabel = '答えを見る';

  // 「答えを見る」機能（vocabの表面）
  const showAnsBtn = st.mode === 'vocab' && st.vocabPhase === 'front' && st.choicePicked < 0
    ? `<button class="act-btn ghost" id="btnReveal">答えを見る</button>`
    : '';

  el.innerHTML = `
    <div class="act-row">
      <button class="act-btn ghost" id="btnPrev">← 前へ</button>
      <button class="act-btn ghost${bm ? ' bm-on' : ''}" id="btnBm">🔖</button>
      <button class="act-btn ghost${st.shuffle ? ' on' : ''}" id="btnShuffle">🔀</button>
      ${showAnsBtn}
      <button class="act-btn primary" id="btnNext">${nextLabel}</button>
    </div>
  `;

  document.getElementById('btnPrev').addEventListener('click', goPrev);
  document.getElementById('btnNext').addEventListener('click', () => {
    if (st.mode === 'vocab' && st.vocabPhase === 'front' && st.choicePicked < 0) {
      // 答えを見る（自動的に正解扱いにしない）
      st.vocabPhase = 'back';
      render(); return;
    }
    goNext();
  });
  document.getElementById('btnBm').addEventListener('click', () => {
    if (!st.order.length) return;
    toggleBookmark(st.mode, st.sessKey, currentRawIdx());
    render();
  });
  document.getElementById('btnShuffle').addEventListener('click', () => {
    st.shuffle = !st.shuffle;
    buildOrder();
    st.pos = 0;
    render();
    showToast(st.shuffle ? '🔀 ランダム ON' : '順番 ON', 'ok');
  });
  const revBtn = document.getElementById('btnReveal');
  if (revBtn) {
    revBtn.addEventListener('click', () => {
      st.vocabPhase = 'back';
      render();
    });
  }
}

// ─── ステージ内イベント ───
function attachStageListeners() {
  // 和訳トグル
  const btnJp = document.getElementById('btnJp');
  if (btnJp) btnJp.addEventListener('click', () => { st.showJp = !st.showJp; render(); });

  // 要旨トグル
  const btnSum = document.getElementById('btnSum');
  if (btnSum) btnSum.addEventListener('click', () => { st.showSum = !st.showSum; render(); });

  // 段落クイズの選択肢
  document.querySelectorAll('.choice-btn[data-qi]').forEach(btn => {
    btn.addEventListener('click', () => {
      if (st.quizDone) return;
      const qi      = Number(btn.dataset.qi);
      const rawIdx  = currentRawIdx();
      const pdEntry = PARA_DATA[rawIdx];
      if (!pdEntry) return;
      const correct = qi === pdEntry.c;
      st.quizDone   = true;
      handleAnswer(correct, 'read', rawIdx);
      render();
    });
  });

  // 仕上げクイズの選択肢
  document.querySelectorAll('.choice-btn[data-fqi]').forEach(btn => {
    btn.addEventListener('click', () => {
      if (st.quizDone) return;
      const fqi    = Number(btn.dataset.fqi);
      const fqs    = FINAL_QUIZ[st.sessKey];
      const fq     = fqs[st.finalIdx];
      const correct = fqi === fq.c;
      st.quizDone  = true;
      handleAnswer(correct, 'finalquiz', st.finalIdx);
      render();
    });
  });

  // 単語4択
  document.querySelectorAll('.choice-btn[data-ci]').forEach(btn => {
    btn.addEventListener('click', () => {
      if (st.choicePicked >= 0) return;
      const ci      = Number(btn.dataset.ci);
      const v       = currentVocab();
      const rawIdx  = currentRawIdx();
      const correct = st.choices[ci] === v.m;
      st.choicePicked = ci;
      handleAnswer(correct, 'vocab', rawIdx);
      // 少し待ってから裏面へ
      setTimeout(() => {
        st.vocabPhase = 'back';
        render();
      }, 900);
      render(); // 色変えのため即レンダリング
    });
  });
}

// ───────────────────────────────────────────────
// ユーティリティ
// ───────────────────────────────────────────────

function escHtml(s) {
  if (!s) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderBold(s) {
  if (!s) return '';
  // &lt;b&gt; などを実際の <b> に変換（questions.js のエスケープ済み HTML を扱う）
  return String(s)
    .replace(/&lt;b&gt;/g, '<b>').replace(/&lt;\/b&gt;/g, '</b>')
    .replace(/<b>/g, '<b>').replace(/<\/b>/g, '</b>')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>');
}

function findHardWords(text) {
  if (!text || typeof HARD_WORDS === 'undefined') return [];
  const lower = text.toLowerCase();
  return HARD_WORDS.filter(h => lower.includes(h.w.toLowerCase())).slice(0, 6);
}

// ───────────────────────────────────────────────
// エフェクト CSS（動的注入）
// ───────────────────────────────────────────────
(function injectStyles() {
  const css = `
/* ── Fx ── */
.fx { position:fixed;top:50%;left:50%;transform:translate(-50%,-50%) scale(0);
      font-size:72px;pointer-events:none;z-index:999;opacity:0;
      animation:fxPop .7s ease forwards; }
.fx.ok { color:#34d399; }
.fx.ng { color:#f87171; }
@keyframes fxPop {
  0%   { transform:translate(-50%,-50%) scale(0.3); opacity:1; }
  60%  { transform:translate(-50%,-50%) scale(1.2); opacity:1; }
  100% { transform:translate(-50%,-50%) scale(1.5); opacity:0; }
}

/* ── Toast ── */
.toast { position:fixed;bottom:80px;left:50%;transform:translateX(-50%) translateY(20px);
         padding:8px 18px;border-radius:99px;font-size:13px;font-weight:700;
         font-family:'IBM Plex Mono',monospace;opacity:0;transition:all .25s;
         pointer-events:none;z-index:900;white-space:nowrap; }
.toast.show { opacity:1;transform:translateX(-50%) translateY(0); }
.toast.ok { background:#065f46;color:#6ee7b7;border:1px solid #34d399; }
.toast.ng { background:#7f1d1d;color:#fca5a5;border:1px solid #f87171; }

/* ── Cards ── */
.card { background:var(--surface,#1a1a2e);border:1px solid var(--border,#2a2a4a);
        border-radius:16px;padding:20px;margin-bottom:12px; }
.card-meta { display:flex;flex-wrap:wrap;gap:6px;margin-bottom:14px;align-items:center; }

/* ── Badges ── */
.badge { display:inline-block;padding:3px 9px;border-radius:99px;font-size:11px;
         font-family:'IBM Plex Mono',monospace;font-weight:600;
         background:rgba(255,255,255,.08);color:var(--muted,#888); }
.badge.ok   { background:rgba(52,211,153,.12);color:#34d399; }
.badge.ng   { background:rgba(248,113,113,.12);color:#f87171; }
.badge.hot  { background:rgba(251,191,36,.12);color:#fbbf24; }
.badge.warn { background:rgba(251,191,36,.15);color:#fbbf24; }
.badge.bm   { background:rgba(139,92,246,.15);color:#a78bfa; }

/* ── English text ── */
.en-text { margin-bottom:12px; }
.en-sent { font-family:'Space Grotesk',sans-serif;font-size:17px;line-height:1.7;
           margin:0 0 8px;color:var(--fg,#e8e8f0); }

/* ── JP text ── */
.jp-text { font-size:14px;line-height:1.8;color:var(--muted,#888);
           border-left:3px solid var(--cyan,#06b6d4);padding:10px 14px;
           margin:8px 0;border-radius:4px;background:rgba(6,182,212,.05); }

/* ── Summary box ── */
.summary-box { font-size:13px;line-height:1.7;color:var(--amber,#fbbf24);
               background:rgba(251,191,36,.07);border:1px solid rgba(251,191,36,.2);
               border-radius:10px;padding:10px 14px;margin:8px 0; }

/* ── Toggle buttons ── */
.toggle-btn { background:transparent;border:1px solid var(--border,#2a2a4a);
              border-radius:8px;padding:6px 14px;font-size:12px;cursor:pointer;
              color:var(--muted,#888);margin:4px 4px 4px 0;transition:all .2s; }
.toggle-btn:hover { border-color:var(--cyan,#06b6d4);color:var(--cyan,#06b6d4); }

/* ── Quiz ── */
.quiz-box { margin-top:8px; }
.quiz-q, .final-q { font-family:'Space Grotesk',sans-serif;font-size:16px;
                     font-weight:600;line-height:1.6;margin-bottom:14px;
                     color:var(--fg,#e8e8f0); }
.final-q { font-size:17px; }
.choices { display:flex;flex-direction:column;gap:8px; }
.choice-btn { text-align:left;padding:11px 16px;border-radius:12px;
              border:1px solid var(--border,#2a2a4a);background:var(--surface2,#0f0f1e);
              color:var(--fg,#e8e8f0);font-size:14px;cursor:pointer;
              transition:all .18s;line-height:1.5; }
.choice-btn:hover:not(.correct):not(.wrong):not(.disabled) {
  border-color:var(--cyan,#06b6d4);background:rgba(6,182,212,.07); }
.choice-btn.correct { border-color:#34d399;background:rgba(52,211,153,.12);color:#34d399; }
.choice-btn.wrong   { border-color:#f87171;background:rgba(248,113,113,.08);color:#f87171; }
.choice-btn.disabled { opacity:.4;cursor:default; }

/* ── Explanation ── */
.explanation { margin-top:14px;font-size:13px;line-height:1.8;
               border-left:3px solid var(--cyan,#06b6d4);
               padding:10px 14px;border-radius:4px;color:var(--muted,#aaa);
               background:rgba(6,182,212,.05); }
.ex-label { font-family:'IBM Plex Mono',monospace;font-size:11px;font-weight:700;
            color:var(--cyan,#06b6d4);display:block;margin-bottom:4px; }

/* ── Hard Words ── */
.hw-bar { display:flex;flex-wrap:wrap;gap:6px;margin-top:10px; }
.hw-chip { font-size:11.5px;padding:4px 10px;border-radius:8px;
           background:rgba(139,92,246,.1);border:1px solid rgba(139,92,246,.2);
           color:#c4b5fd; }
.hw-chip b { color:#a78bfa; }

/* ── Vocab ── */
.vocab-card .vocab-term { font-family:'IBM Plex Mono',monospace;font-size:28px;
                           font-weight:700;letter-spacing:.04em;margin:12px 0 16px;
                           color:var(--fg,#e8e8f0);word-break:break-all; }
.vocab-meaning { font-size:20px;font-weight:600;color:#34d399;margin:8px 0 14px; }
.vocab-choices.choices { display:grid;grid-template-columns:1fr 1fr;gap:8px; }

/* ── Action row ── */
.act-row { display:flex;flex-wrap:wrap;gap:8px;align-items:center;justify-content:center;
           padding:12px 0; }
.act-btn { padding:10px 18px;border-radius:12px;font-size:14px;font-weight:600;
           cursor:pointer;border:none;transition:all .18s; }
.act-btn.ghost { background:rgba(255,255,255,.06);color:var(--muted,#888);border:1px solid var(--border,#333); }
.act-btn.ghost:hover { background:rgba(255,255,255,.12);color:var(--fg,#e8e8f0); }
.act-btn.ghost.on, .act-btn.ghost.bm-on { border-color:var(--cyan,#06b6d4);color:var(--cyan,#06b6d4); }
.act-btn.primary { background:var(--cyan,#06b6d4);color:#000;padding:10px 24px; }
.act-btn.primary:hover { filter:brightness(1.1); }

/* ── Chips ── */
.chip { padding:5px 13px;border-radius:99px;font-size:12px;font-weight:600;
        cursor:pointer;border:1px solid var(--border,#333);background:rgba(255,255,255,.04);
        color:var(--muted,#888);transition:all .15s; }
.chip.on { background:var(--cyan,#06b6d4);border-color:var(--cyan,#06b6d4);color:#000; }
.chip.warn.on { background:var(--amber,#fbbf24);border-color:var(--amber,#fbbf24);color:#000; }

/* ── Misc ── */
.empty { color:var(--muted,#888);text-align:center;padding:40px 20px;font-size:15px; }
.lvlbadgebar { display:flex;flex-wrap:wrap;gap:6px;margin-top:8px; }

/* ── Mobile ── */
@media (max-width:480px){
  .vocab-card .vocab-term { font-size:22px; }
  .vocab-choices.choices { grid-template-columns:1fr; }
  .quiz-q { font-size:15px; }
  .act-btn { padding:9px 14px;font-size:13px; }
  .en-sent { font-size:15px; }
}
`;
  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);
})();

// ───────────────────────────────────────────────
// スタート
// ───────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', init);
