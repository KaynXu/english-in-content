/* 听写模式: 弹窗选范围 (Daily 词数 / 卡组 All-Yellow-Green) -> 听写 -> 超时词按原顺序重滚 -> Done 3s 自动返回.
   规则: 进入自动播, Enter/喇叭重播; 错字母暗红留在格子里, Backspace 清除重打;
   首字母 5s 未对淡灰提示 (重练轮 3s); 超时 10s (重练轮 7s) 灰显拼写 3s 进队列;
   全对整排暗绿, 下一个词. */
(function () {
  "use strict";

  var DECKS = window.DECKS || {};
  var deckView = document.getElementById("quizDeckView");
  var playView = document.getElementById("quizPlayView");
  var doneView = document.getElementById("quizDoneView");
  var deckList = document.getElementById("quizDeckList");
  var dailyBtn = document.getElementById("quizDaily");
  var dailyCount = document.getElementById("quizDailyCount");
  var progressEl = document.getElementById("quizProgress");
  var slotsEl = document.getElementById("quizSlots");
  var imageEl = document.getElementById("quizImage");
  var revealEl = document.getElementById("quizReveal");
  var soundBtn = document.getElementById("quizSound");
  var dialogRoot = document.getElementById("quizDialogRoot") || document.body;

  var state = null;
  var LETTERS = /^[a-zA-Z]$/;
  var FIRST_HINT_MS = 5000;
  var TIMEOUT_MS = 10000;
  var RETRY_HINT_MS = 3000;
  var RETRY_TIMEOUT_MS = 7000;
  var REVEAL_MS = 3000;
  var DONE_MS = 3000;
  var DAILY_SIZES = [10, 25, 50];
  var DECK_SCOPES = [
    { label: "All", value: "all" },
    { label: "Yellow", value: "yellow" },
    { label: "Green", value: "green" },
  ];

  /* ---------- 弹窗组件 ---------- */
  function createDialog(onDismiss) {
    var overlay = document.createElement("div");
    overlay.className = "dialog-overlay";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-label", "Dialog");
    var box = document.createElement("div");
    box.className = "dialog";
    overlay.appendChild(box);
    var opener = document.activeElement;
    var closed = false;
    function close() {
      if (closed) return;
      closed = true;
      document.removeEventListener("keydown", onKey, true);
      overlay.remove();
      if (opener && opener.focus) opener.focus();
    }
    function dismiss() {
      if (closed) return;
      close();
      if (onDismiss) onDismiss();
    }
    function onKey(event) {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        dismiss();
      }
    }
    overlay.addEventListener("click", function (event) {
      if (event.target === overlay) dismiss();
    });
    document.addEventListener("keydown", onKey, true);
    dialogRoot.appendChild(overlay);
    return { box: box, close: close };
  }

  function renderDialogRow(row, options, onPick) {
    row.innerHTML = "";
    options.forEach(function (opt) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "dialog-option";
      btn.textContent = opt.label;
      if (opt.disabled) btn.disabled = true;
      btn.addEventListener("click", function () {
        if (!opt.disabled) onPick(opt.value, btn);
      });
      row.appendChild(btn);
    });
  }

  function addDialogRow(dialog, options, onPick) {
    var row = document.createElement("div");
    row.className = "dialog-row";
    renderDialogRow(row, options, onPick);
    dialog.box.appendChild(row);
    return row;
  }

  function focusFirstOption(row) {
    var first = row.querySelector(".dialog-option:not(:disabled)");
    if (first) first.focus();
  }

  function openDialog(options, onPick) {
    var dialog = createDialog();
    var row = addDialogRow(dialog, options, function (value) {
      dialog.close();
      onPick(value);
    });
    focusFirstOption(row);
  }

  function showView(view) {
    deckView.hidden = view !== "deck";
    playView.hidden = view !== "play";
    doneView.hidden = view !== "done";
  }

  /* ---------- 选卡组 ---------- */
  /* 统计某卡组 total/yellow/green 词数, 供列表计数 (green/total) 和范围弹窗禁用用. */
  function deckCounts(title) {
    var data = window.VOCABULARY || {};
    var c = { total: 0, yellow: 0, green: 0 };
    Object.keys(data).forEach(function (w) {
      var entry = data[w];
      if (!entry.decks || entry.decks.indexOf(title) === -1) return;
      c.total++;
      var st = window.VocabStatus ? window.VocabStatus.get(w) : entry.status;
      if (st === "green") c.green++;
      else if (st === "yellow") c.yellow++;
    });
    return c;
  }

  function sizeOptions(count) {
    return DAILY_SIZES.map(function (size) {
      return { label: String(size), value: size, disabled: count < size };
    });
  }

  function scopeCount(counts, scope) {
    if (scope === "all") return counts.total;
    return scope === "green" ? counts.green : counts.yellow;
  }

  function openDeckDialog(title, counts, scopes) {
    var selectedScope = null;
    var dialog = createDialog(function () {
      if (selectedScope) startDeck(title, selectedScope);
    });
    var scopeRow = addDialogRow(dialog, scopes, function (scope, btn) {
      selectedScope = scope;
      scopeRow.querySelectorAll(".dialog-option").forEach(function (option) {
        option.classList.remove("is-selected");
      });
      btn.classList.add("is-selected");
      var count = scopeCount(counts, scope);
      if (count <= DAILY_SIZES[DAILY_SIZES.length - 1]) {
        dialog.close();
        startDeck(title, scope);
        return;
      }
      renderDialogRow(sizeRow, sizeOptions(count), function (size) {
        dialog.close();
        startDeck(title, selectedScope, size);
      });
      focusFirstOption(sizeRow);
    });
    var sizeRow = addDialogRow(dialog, sizeOptions(0), function () {});
    focusFirstOption(scopeRow);
  }

  function buildDeckList() {
    updateDaily();
    deckList.innerHTML = "";
    Object.keys(DECKS).forEach(function (t) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "quiz-deck";
      var name = document.createElement("span");
      name.className = "quiz-deck-name";
      name.textContent = t;
      var count = document.createElement("span");
      count.className = "quiz-deck-count";
      var c = deckCounts(t);
      count.textContent = c.green + "/" + c.total;
      var chevron = document.createElement("span");
      chevron.className = "quiz-deck-chevron";
      chevron.setAttribute("aria-hidden", "true");
      chevron.textContent = "\u203A";
      btn.appendChild(name);
      btn.appendChild(count);
      btn.appendChild(chevron);
      btn.addEventListener("click", function () {
        /* 空范围禁用: 0 绿词禁 Green, 0 黄词禁 Yellow, All 永远可用 */
        var counts = deckCounts(t);
        var scopes = DECK_SCOPES.map(function (opt) {
          var disabled = false;
          if (opt.value === "green") disabled = counts.green === 0;
          else if (opt.value === "yellow") disabled = counts.yellow === 0;
          return { label: opt.label, value: opt.value, disabled: disabled };
        });
        openDeckDialog(t, counts, scopes);
      });
      deckList.appendChild(btn);
    });
  }

  /* ---------- 每日挑战 ---------- */
  function greenWords() {
    var data = window.VOCABULARY || {};
    return Object.keys(data).filter(function (w) {
      var st = window.VocabStatus ? window.VocabStatus.get(w) : data[w].status;
      return st === "green";
    });
  }

  function updateDaily() {
    var n = greenWords().length;
    if (n >= DAILY_SIZES[0]) {
      dailyBtn.disabled = false;
      dailyCount.hidden = true;
    } else {
      dailyBtn.disabled = true;
      dailyCount.textContent = n + " / " + DAILY_SIZES[0] + " mastered";
      dailyCount.hidden = false;
    }
  }

  function shuffle(arr) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = arr[i];
      arr[i] = arr[j];
      arr[j] = t;
    }
    return arr;
  }

  /* 本地日期 YYYY-MM-DD (练习记录 lastSeen 用). */
  function todayStr() {
    var d = new Date();
    var m = "0" + (d.getMonth() + 1);
    var day = "0" + d.getDate();
    return d.getFullYear() + "-" + m.slice(-2) + "-" + day.slice(-2);
  }

  /* Daily 选词排序: 欠账分 = 距上次练习天数 + 失败次数 x 7; 从未练过记 9999;
     分高者先出, 出场顺序仍由后续洗牌打乱. */
  function daysSince(seen) { if (!seen) return 9999; var d = new Date(seen + "T00:00:00"); var n = new Date(); var today = new Date(n.getFullYear(), n.getMonth(), n.getDate()); return Math.round((today - d) / 86400000); }
  function practiceScore(w) { var p = window.VocabStatus && window.VocabStatus.getPractice ? window.VocabStatus.getPractice(w) : { lastSeen: null, miss: 0 }; return daysSince(p.lastSeen) + (p.miss || 0) * 7; }
  function byMostDue(a, b, scores) {
    var ak = String(a).toLowerCase();
    var bk = String(b).toLowerCase();
    var sa = scores ? scores[ak] : practiceScore(ak);
    var sb = scores ? scores[bk] : practiceScore(bk);
    if (sa !== sb) return sb - sa;
    return ak < bk ? -1 : ak > bk ? 1 : 0;
  }

  function pickDueCards(cards, size) {
    var scores = {};
    cards.forEach(function (card) {
      var key = card.word.toLowerCase();
      scores[key] = practiceScore(key);
    });
    var ranked = cards.slice().sort(function (a, b) {
      return byMostDue(a.word, b.word, scores);
    });
    return shuffle(ranked.slice(0, Math.min(size, ranked.length)));
  }

  /* 多卡组加载: 按 window.DECKS 顺序逐个动态加载 cards.js, 每加载完一个
     立即按 deckPath 归档 window.VOCABULARY_CARDS (下一个卡组会覆盖该全局),
     汇总成 deckPath -> word -> card (带 deckPath 前缀) 映射, 全部加载完回调. */
  function loadAllDeckCards(done) {
    var titles = Object.keys(DECKS);
    var byDeck = {};
    var i = 0;
    function next() {
      if (i >= titles.length) { done(byDeck); return; }
      var deckPath = DECKS[titles[i++]];
      var script = document.createElement("script");
      script.src = deckPath + "/cards.js";
      script.onload = function () {
        var cards = window.VOCABULARY_CARDS || [];
        var bucket = byDeck[deckPath] = byDeck[deckPath] || {};
        cards.forEach(function (c) {
          bucket[c.word.toLowerCase()] = {
            word: c.word,
            deckPath: deckPath,
            image: c.image,
            imageAlt: c.imageAlt,
            audio: c.audio,
          };
        });
        next();
      };
      script.onerror = function () { next(); };
      document.body.appendChild(script);
    }
    next();
  }

  /* n = 弹窗选定的词数 (10/25/50), 实际取 min(n, 绿词数).
     选词按 byMostDue (欠账分最高的优先), 取出 N 个后再洗牌作为出场顺序. */
  function startDaily(n) {
    var data = window.VOCABULARY || {};
    var greens = greenWords();
    if (!greens.length) return;
    n = Math.min(n, greens.length);
    dailyBtn.disabled = true;
    var picked = greens.slice().sort(byMostDue).slice(0, n);
    loadAllDeckCards(function (byDeck) {
      var cards = [];
      picked.forEach(function (w) {
        var key = String(w).toLowerCase();
        var entry = data[key] || {};
        var deckPath = DECKS[(entry.decks || [])[0]];
        var c = (deckPath && byDeck[deckPath] && byDeck[deckPath][key]) || null;
        if (!c) {
          Object.keys(byDeck).some(function (p) {
            if (byDeck[p][key]) { c = byDeck[p][key]; return true; }
            return false;
          });
        }
        if (c) cards.push(c);
      });
      if (!cards.length) { updateDaily(); return; }
      shuffle(cards);
      state = {
        deckPath: null,
        cards: cards,
        order: cards.map(function (_, i) { return i; }),
        pos: 0,
        queue: [],
        fails: {},
        seen: {},
        flushed: {},
        retry: false,
        slots: [],
        timer: null,
        audio: null,
        backTimer: null,
      };
      showView("play");
      loadWord();
    });
  }

  dailyBtn.addEventListener("click", function () {
    var n = greenWords().length;
    openDialog(sizeOptions(n), function (size) { startDaily(size); });
  });

  /* Decks 按钮: 停计时/音频, 再回到卡组列表. */
  var decksBtn = document.getElementById("quizDecks");
  if (decksBtn) {
    decksBtn.addEventListener("click", function () {
      if (state) {
        stopTimer();
        stopAudio();
        if (state.backTimer) {
          window.clearTimeout(state.backTimer);
          state.backTimer = null;
        }
        state = null;
      }
      decksBtn.classList.add("is-active");
      dailyBtn.classList.remove("is-active");
      showView("deck");
      buildDeckList();
    });
  }

  /* scope = 弹窗选定的范围: all / yellow / green, 不再默认只出黄词. */
  function startDeck(title, scope, size) {
    var deckPath = DECKS[title];
    var script = document.createElement("script");
    script.src = deckPath + "/cards.js";
    script.onload = function () {
      var all = window.VOCABULARY_CARDS || [];
      var cards = all.filter(function (c) {
        if (scope === "all") return true;
        var st = window.VocabStatus ? window.VocabStatus.get(c.word) : "yellow";
        return st === scope;
      });
      if (!cards.length) {
        deckList.innerHTML = "";
        var empty = document.createElement("p");
        empty.className = "quiz-hint";
        empty.textContent = scope === "green" ? "No green words yet." : "No words in this selection.";
        deckList.appendChild(empty);
        return;
      }
      if (typeof size === "number") cards = pickDueCards(cards, size);
      state = {
        deckPath: deckPath,
        cards: cards,
        order: cards.map(function (_, i) { return i; }),
        pos: 0,
        queue: [],
        fails: {},
        seen: {},
        flushed: {},
        retry: false,
        slots: [],
        timer: null,
        audio: null,
        backTimer: null,
      };
      showView("play");
      loadWord();
    };
    script.onerror = function () { deckList.textContent = "Failed to load cards."; };
    document.body.appendChild(script);
  }

  /* ---------- 单词加载 ---------- */
  function loadWord() {
    var card = state.cards[state.order[state.pos]];
    stopTimer();
    stopAudio();
    revealEl.textContent = "";
    state.slots = card.word.toLowerCase().split("").filter(function (ch) {
      return /[a-z]/.test(ch);
    }).map(function () { return { char: "", ok: false }; });
    state.hintUsed = false;
    state.roundFailed = false;
    state.locked = false;
    state.startedAt = Date.now();
    renderSlots();
    var hintMs = state.retry ? RETRY_HINT_MS : FIRST_HINT_MS;
    var timeoutMs = state.retry ? RETRY_TIMEOUT_MS : TIMEOUT_MS;
    state.timer = window.setInterval(function () {
      var elapsed = Date.now() - state.startedAt;
      if (!state.hintUsed && elapsed >= hintMs && state.slots[0] && !state.slots[0].ok) {
        state.hintUsed = true;
        var hint = card.word.match(/[a-z]/i);
        if (hint) {
          failRound(state.order[state.pos]);
          state.slots[0] = { char: hint[0].toLowerCase(), ok: true, hint: true };
          renderSlots();
          if (allCorrect()) finishWord();
        }
      }
      if (elapsed >= timeoutMs) timeOut();
    }, 250);
    imageEl.classList.remove("is-ready");
    imageEl.parentElement.hidden = !card.image;
    if (card.image) {
      imageEl.onload = function () { imageEl.classList.add("is-ready"); };
      imageEl.src = (card.deckPath || state.deckPath) + "/" + card.image;
      imageEl.alt = card.imageAlt || "";
      if (imageEl.complete) imageEl.classList.add("is-ready");
    } else {
      imageEl.removeAttribute("src");
      imageEl.alt = "";
    }
    playAudio(card);
    progressEl.textContent = (state.pos + 1) + "/" + state.order.length;
    state.seen[state.order[state.pos]] = true;
  }

  function playAudio(card) {
    stopAudio();
    var player = new Audio((card.deckPath || state.deckPath) + "/" + card.audio);
    state.audio = player;
    function fallback() {
      if (!state || state.audio !== player) return;
      state.audio = null;
      speakWithBrowser(card.word);
    }
    player.addEventListener("error", fallback, { once: true });
    player.play().catch(function () {
      if (!state || state.audio !== player) return;
      state.audio = null;
      speakWithBrowser(card.word);
    });
  }

  function speakWithBrowser(text) {
    if (!("speechSynthesis" in window) || !("SpeechSynthesisUtterance" in window)) return;
    var utterance = new SpeechSynthesisUtterance(text);
    var voices = window.speechSynthesis.getVoices();
    utterance.lang = "en-US";
    utterance.voice = voices.find(function (voice) {
      return voice.lang === "en-US" && /samantha|ava|allison|alex/i.test(voice.name);
    }) || voices.find(function (voice) { return voice.lang === "en-US"; }) || null;
    utterance.rate = 0.82;
    window.speechSynthesis.speak(utterance);
  }

  function stopAudio() {
    if (state && state.audio) {
      state.audio.pause();
      state.audio = null;
    }
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
  }

  function stopTimer() {
    if (state && state.timer) {
      window.clearInterval(state.timer);
      state.timer = null;
    }
  }

  /* ---------- 字母格 ---------- */
  function renderSlots() {
    var card = state.cards[state.order[state.pos]];
    var letters = card.word.toLowerCase().split("");
    slotsEl.innerHTML = "";
    var activeLi = state.slots.findIndex(function (s) { return !s.ok; });
    var li = 0;
    letters.forEach(function (ch) {
      if (/[a-z]/.test(ch)) {
        var slot = document.createElement("span");
        slot.className = "quiz-slot";
        var s = state.slots[li];
        if (li === activeLi) slot.classList.add("is-active");
        if (s.ok) {
          slot.textContent = s.char;
          if (s.hint) slot.classList.add("is-hint");
        } else if (s.char) {
          slot.textContent = s.char;
          slot.classList.add("is-wrong");
        }
        slotsEl.appendChild(slot);
        li++;
      } else {
        var gap = document.createElement("span");
        gap.className = "quiz-gap";
        gap.textContent = ch === " " ? "\u00A0" : ch;
        slotsEl.appendChild(gap);
      }
    });
  }

  function allCorrect() {
    return state.slots.every(function (s) { return s.ok; });
  }

  /* ---------- 判定 ---------- */
  /* 练习记录: 每词完成时写入. miss = 失败轮数 (每轮提示或超时最多 +1) 累加进总 miss;
     干净首过 (0 失败) 把 miss 重置为 0; lastSeen 一律刷成今天.
     写完清掉该词的 fails/seen, 避免 flushSeen 重复记账. */
  function recordPractice(idx) {
    if (!window.VocabStatus || !window.VocabStatus.setPractice) return;
    var word = state.cards[idx].word;
    var fails = state.fails[idx] || 0;
    var wasFlushed = Object.prototype.hasOwnProperty.call(state.flushed, idx);
    var patch = { lastSeen: todayStr() };
    if (!wasFlushed && fails === 0) {
      patch.miss = 0;
    } else if (fails > 0) {
      var cur = window.VocabStatus.getPractice ? window.VocabStatus.getPractice(word) : { miss: 0 };
      patch.miss = (cur.miss || 0) + fails;
    }
    window.VocabStatus.setPractice(word, patch);
    delete state.fails[idx];
    delete state.seen[idx];
    delete state.flushed[idx];
  }

  /* 中途退出兜底: 已展示但未完成的词补写 lastSeen (本轮有失败的连失败数一起累加进 miss),
     写完清掉 seen/fails, 再同步 flush 一次写盘, 保证 pagehide 时防抖写盘不丢词. */
  function flushSeen() {
    if (!state || !window.VocabStatus || !window.VocabStatus.setPractice) return;
    Object.keys(state.seen).forEach(function (k) {
      var idx = Number(k);
      var word = state.cards[idx].word;
      var fails = state.fails[idx] || 0;
      var patch = { lastSeen: todayStr() };
      if (fails > 0) {
        var cur = window.VocabStatus.getPractice ? window.VocabStatus.getPractice(word) : { miss: 0 };
        patch.miss = (cur.miss || 0) + fails;
      }
      window.VocabStatus.setPractice(word, patch);
      state.flushed[idx] = fails;
    });
    state.seen = {};
    state.fails = {};
    if (window.VocabStatus.flushPractice) window.VocabStatus.flushPractice();
  }

  window.addEventListener("pagehide", flushSeen);
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "hidden") flushSeen();
  });

  function finishWord() {
    stopTimer();
    stopAudio();
    state.locked = true;
    var idx = state.order[state.pos];
    recordPractice(idx);
    slotsEl.querySelectorAll(".quiz-slot").forEach(function (s) { s.classList.add("is-correct"); });
    window.setTimeout(advance, 450);
  }

  function failRound(idx) {
    if (state.roundFailed) return;
    state.roundFailed = true;
    state.fails[idx] = (state.fails[idx] || 0) + 1;
  }

  function timeOut() {
    stopTimer();
    stopAudio();
    state.locked = true;
    var idx = state.order[state.pos];
    failRound(idx);
    if (state.queue.indexOf(idx) === -1) state.queue.push(idx);
    revealEl.textContent = state.cards[idx].word;
    window.setTimeout(advance, REVEAL_MS);
  }

  function advance() {
    if (state.pos + 1 < state.order.length) {
      state.pos++;
      loadWord();
      return;
    }
    if (state.queue.length) {
      state.retry = true;
      state.order = state.queue.slice().sort(function (a, b) { return a - b; });
      state.queue = [];
      state.pos = 0;
      loadWord();
      return;
    }
    finishQuiz();
  }

  function finishQuiz() {
    stopTimer();
    stopAudio();
    showView("done");
    state.backTimer = window.setTimeout(function () {
      showView("deck");
      buildDeckList();
    }, DONE_MS);
  }

  /* ---------- 输入 ---------- */
  document.addEventListener("keydown", function (event) {
    if (!playView.hidden) {
      handlePlayKey(event);
      return;
    }
    if (event.key === "Enter" && !doneView.hidden) {
      window.clearTimeout(state.backTimer);
      showView("deck");
      buildDeckList();
    }
  });

  function handlePlayKey(event) {
    var card = state.cards[state.order[state.pos]];
    if (event.key === "Enter") {
      event.preventDefault();
      playAudio(card);
      return;
    }
    if (event.key === "Backspace") {
      event.preventDefault();
      if (state.locked) return;
      for (var i = state.slots.length - 1; i >= 0; i--) {
        if (state.slots[i].char && !state.slots[i].ok) {
          state.slots[i] = { char: "", ok: false };
          break;
        }
      }
      renderSlots();
      return;
    }
    if (state.locked) return;
    if (!LETTERS.test(event.key)) return;
    var ch = event.key.toLowerCase();
    var idx = state.slots.findIndex(function (s) { return !s.ok; });
    if (idx === -1) return;
    var letters = card.word.toLowerCase().split("").filter(function (x) { return /[a-z]/.test(x); });
    if (ch === letters[idx]) {
      state.slots[idx] = { char: ch, ok: true };
      renderSlots();
      if (allCorrect()) finishWord();
    } else {
      state.slots[idx] = { char: ch, ok: false };
      renderSlots();
    }
  }

  soundBtn.addEventListener("click", function () {
    if (!playView.hidden && state) playAudio(state.cards[state.order[state.pos]]);
  });

  buildDeckList();
  showView("deck");
})();
