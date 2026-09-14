/* 词汇状态: 黄(yellow)=见过未掌握(默认), 绿(green)=已掌握.
   卡片页(app.js), 词汇库页和 Quiz 共用 window.VOCABULARY 单一账本,
   状态与练习记录经 File System Access API 写回 vocabulary.js. */
(function () {
  "use strict";

  var DATA = window.VOCABULARY || {};
  var STATUSES = ["yellow", "green"];
  var DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
  var PRACTICE_WRITE_MS = 2000;
  var WRITE_LOCK = "context-english-vocabulary-write";
  var canAutosave = !!(window.showOpenFilePicker && window.navigator && window.navigator.locks);
  var fileHandle = null;
  var pendingChanges = {};
  var legacyStore = null;
  var legacyMigrationPending = false;
  var filter = null;
  var deckFilter = new URLSearchParams(window.location.search).get("deck");
  var DB_NAME = "context-english-autosave";
  var DB_STORE = "handles";

  function openDb() {
    return new Promise(function (resolve, reject) {
      var req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = function () {
        if (!req.result.objectStoreNames.contains(DB_STORE)) {
          req.result.createObjectStore(DB_STORE);
        }
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
  }

  function saveHandle(handle) {
    openDb().then(function (db) {
      var tx = db.transaction(DB_STORE, "readwrite");
      tx.objectStore(DB_STORE).put(handle, "vocabulary");
    }).catch(function () {});
  }

  function loadHandle() {
    return openDb().then(function (db) {
      return new Promise(function (resolve) {
        var tx = db.transaction(DB_STORE, "readonly");
        var req = tx.objectStore(DB_STORE).get("vocabulary");
        req.onsuccess = function () { resolve(req.result || null); };
        req.onerror = function () { resolve(null); };
      });
    }).catch(function () { return null; });
  }

  function setAutosaveOn() {
    var authBtn = document.getElementById("vocabAuth");
    if (authBtn) { authBtn.textContent = "Autosave on"; authBtn.disabled = true; }
    var dl = document.getElementById("vocabDownload");
    if (dl) dl.hidden = true;
  }

  function setAutosaveOff() {
    var authBtn = document.getElementById("vocabAuth");
    if (authBtn) { authBtn.textContent = "Enable autosave"; authBtn.disabled = false; }
  }

  function sanitize(status) {
    return STATUSES.indexOf(status) >= 0 ? status : "yellow";
  }

  /* 练习记录: 清洗掉非法 lastSeen / miss, 返回只含有效字段的对象 (可能为空). */
  function sanitizePractice(p) {
    var out = {};
    if (!p || typeof p !== "object") return out;
    if (typeof p.lastSeen === "string" && DATE_RE.test(p.lastSeen)) out.lastSeen = p.lastSeen;
    if (typeof p.miss === "number" && isFinite(p.miss) && Math.floor(p.miss) === p.miss && p.miss > 0) {
      out.miss = p.miss;
    }
    return out;
  }

  /* 省略的字段保持不变, null 明确删除字段. 内存和文件使用同一套修改规则. */
  function applyPatch(entry, patch) {
    Object.keys(patch).forEach(function (field) {
      if (patch[field] === null) delete entry[field];
      else entry[field] = patch[field];
    });
  }

  function updateWord(word, patch) {
    var key = String(word).toLowerCase();
    if (!DATA[key]) DATA[key] = { status: "yellow", decks: [] };
    applyPatch(DATA[key], patch);
    pendingChanges[key] = Object.assign({}, pendingChanges[key], patch);
  }

  /* 一次性合并旧缓存. 只合并文件中仍存在的词, 成功写盘后才删除旧 key. */
  function migrateLegacy() {
    var store = null;
    try { store = window["local" + "Storage"]; } catch (e) {}
    if (!store) return;
    var statusRaw = null;
    var practiceRaw = null;
    var statuses = {};
    var practice = {};
    try {
      statusRaw = store.getItem("context-english-status-v1");
      if (statusRaw) statuses = JSON.parse(statusRaw) || {};
    } catch (e) { statuses = {}; }
    try {
      practiceRaw = store.getItem("context-english-practice-v1");
      if (practiceRaw) practice = JSON.parse(practiceRaw) || {};
    } catch (e) { practice = {}; }
    legacyStore = store;
    legacyMigrationPending = statusRaw !== null || practiceRaw !== null;
    if (!statuses || typeof statuses !== "object" || Array.isArray(statuses)) statuses = {};
    if (!practice || typeof practice !== "object" || Array.isArray(practice)) practice = {};
    Object.keys(statuses).forEach(function (word) {
      var key = String(word).toLowerCase();
      if (!DATA[key]) return;
      var current = sanitize(DATA[key].status);
      var legacy = sanitize(statuses[word]);
      updateWord(key, { status: current !== "yellow" ? current : legacy });
    });
    Object.keys(practice).forEach(function (word) {
      var key = String(word).toLowerCase();
      var legacy = practice[word];
      if (!DATA[key] || !legacy || typeof legacy !== "object") return;
      var patch = {};
      if (typeof legacy.lastSeen === "string" && DATE_RE.test(legacy.lastSeen)) {
        patch.lastSeen = legacy.lastSeen;
      }
      if (typeof legacy.miss === "number" && isFinite(legacy.miss) && Math.floor(legacy.miss) === legacy.miss && legacy.miss >= 0) {
        patch.miss = legacy.miss || null;
      }
      if (Object.keys(patch).length) updateWord(key, patch);
    });
  }

  function clearLegacy() {
    if (!legacyMigrationPending || !legacyStore) return;
    try {
      legacyStore.removeItem("context-english-status-v1");
      legacyStore.removeItem("context-english-practice-v1");
      legacyMigrationPending = false;
    } catch (e) {}
  }

  function serialize(data, decksSection) {
    data = data || DATA;
    var out = {};
    Object.keys(data).sort().forEach(function (w) {
      var entry = { status: sanitize(data[w].status), decks: data[w].decks || [] };
      var p = sanitizePractice(data[w]);
      if (p.lastSeen) entry.lastSeen = p.lastSeen;
      if (p.miss > 0) entry.miss = p.miss;
      out[w] = entry;
    });
    var vocabularySection = "window.VOCABULARY = " + JSON.stringify(out, null, 2) + ";\n\n";
    if (typeof decksSection === "string") return vocabularySection + decksSection;
    /* DECKS 是内容标题->目录路径索引, quiz 页靠它加载, 必须原样保留 (键排序) */
    var decksOut = {};
    var decks = window.DECKS || {};
    Object.keys(decks).sort().forEach(function (k) {
      decksOut[k] = decks[k];
    });
    return vocabularySection + "window.DECKS = " + JSON.stringify(decksOut, null, 2) + ";\n";
  }

  function parseFile(text) {
    var vocabStart = text.indexOf("window.VOCABULARY");
    var equals = vocabStart >= 0 ? text.indexOf("=", vocabStart) : -1;
    var rest = equals >= 0 ? text.slice(equals + 1) : "";
    var decksMatch = /\r?\n\s*window\.DECKS\s*=/.exec(rest);
    if (equals < 0 || !decksMatch) throw new Error("Invalid vocabulary.js");
    var decksStart = text.indexOf("window.DECKS", equals + 1 + decksMatch.index);
    var jsonText = text.slice(equals + 1, equals + 1 + decksMatch.index).trim();
    if (jsonText.charAt(jsonText.length - 1) === ";") jsonText = jsonText.slice(0, -1);
    var data = JSON.parse(jsonText);
    if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("Invalid vocabulary data");
    return { data: data, decksSection: text.slice(decksStart) };
  }

  function writeFile() {
    if (!fileHandle) return Promise.resolve(false);
    var handle = fileHandle;
    /* 所有页面的完整读写共用一把锁. 批次取走后, 新修改进入下一批, 不重放已保存的字段. */
    return window.navigator.locks.request(WRITE_LOCK, async function () {
      var changes = pendingChanges;
      pendingChanges = {};
      var writable = null;
      try {
        var file = await handle.getFile();
        var parsed = parseFile(await file.text());
        Object.keys(changes).forEach(function (key) {
          var entry = parsed.data[key];
          if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
            entry = parsed.data[key] = { status: "yellow", decks: DATA[key].decks || [] };
          }
          applyPatch(entry, changes[key]);
        });
        writable = await handle.createWritable();
        await writable.write(serialize(parsed.data, parsed.decksSection));
        await writable.close();
      } catch (error) {
        Object.keys(changes).forEach(function (key) {
          pendingChanges[key] = Object.assign({}, changes[key], pendingChanges[key]);
        });
        if (writable) {
          try { await writable.abort(); } catch (e) {}
        }
        throw error;
      }
      setAutosaveOn();
      clearLegacy();
      return true;
    }).catch(function () {
      setAutosaveOff();
      return false;
    });
  }

  function setStatus(word, status) {
    updateWord(word, { status: sanitize(status) });
    render();
    return writeFile();
  }

  function getStatus(word) {
    var key = String(word).toLowerCase();
    return sanitize((DATA[key] || {}).status);
  }

  /* setPractice: 合并进 DATA -> 防抖写回 vocabulary.js.
     最后一次改动约 2s 后写, 页面隐藏或离开时立即 flush. */
  var practiceWriteTimer = null;

  function flushPracticeWrite() {
    if (practiceWriteTimer) {
      clearTimeout(practiceWriteTimer);
      practiceWriteTimer = null;
    }
    return writeFile();
  }

  function schedulePracticeWrite() {
    if (practiceWriteTimer) clearTimeout(practiceWriteTimer);
    practiceWriteTimer = setTimeout(flushPracticeWrite, PRACTICE_WRITE_MS);
  }

  function getPractice(word) {
    var key = String(word).toLowerCase();
    var p = sanitizePractice(DATA[key]);
    return { lastSeen: p.lastSeen || null, miss: p.miss || 0 };
  }

  function setPractice(word, patch) {
    var next = sanitizePractice(patch);
    var changes = {};
    if (patch && patch.lastSeen !== undefined) changes.lastSeen = next.lastSeen || null;
    if (patch && patch.miss !== undefined) changes.miss = next.miss || null;
    if (!Object.keys(changes).length) return;
    updateWord(word, changes);
    schedulePracticeWrite();
  }

  if (typeof document !== "undefined" && document.addEventListener) {
    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "hidden") flushPracticeWrite();
    });
  }
  if (typeof window !== "undefined" && window.addEventListener) {
    window.addEventListener("pagehide", flushPracticeWrite);
  }

  migrateLegacy();

  /* 对外 API: 卡片页 G/Y 用; getPractice/setPractice/flushPractice 供 quiz 页练习记录用 */
  window.VocabStatus = {
    get: getStatus,
    set: setStatus,
    getPractice: getPractice,
    setPractice: setPractice,
    flushPractice: flushPracticeWrite,
    canAutosave: canAutosave,
    restoreAutosave: restoreAutosave,
  };

  function restoreAutosave() {
    if (!canAutosave) return Promise.resolve(false);
    var authBtn = document.getElementById("vocabAuth");
    return loadHandle().then(function (handle) {
      handle = handle || fileHandle;
      if (!handle) return false;
      return handle.queryPermission({ mode: "readwrite" }).then(function (perm) {
        if (perm === "granted") {
          fileHandle = handle;
          return writeFile();
        }
        fileHandle = null;
        if (perm === "prompt" && authBtn) {
          setAutosaveOff();
          authBtn.onclick = function () {
            handle.requestPermission({ mode: "readwrite" }).then(function (permission) {
              if (permission === "granted") {
                fileHandle = handle;
                writeFile();
              }
            }).catch(function () {});
          };
        }
        return false;
      });
    }).catch(function () { return false; });
  }

  function authorize() {
    showOpenFilePicker({ types: [{ description: "vocabulary.js", accept: { "text/javascript": [".js"] } }] })
      .then(function (handles) {
        if (!handles.length) return;
        fileHandle = handles[0];
        saveHandle(fileHandle);
        writeFile();
      })
      .catch(function () {});
  }

  function render() {
    var container = document.getElementById("vocabGroups");
    if (!container) return;
    var searchEl = document.getElementById("vocabSearch");
    var query = searchEl ? searchEl.value.trim().toLowerCase() : "";
    var groups = {};
    Object.keys(DATA).forEach(function (w) {
      if (query && w.indexOf(query) === -1) return;
      if (filter && getStatus(w) !== filter) return;
      DATA[w].decks.forEach(function (d) {
        if (deckFilter && d !== deckFilter) return;
        (groups[d] = groups[d] || []).push(w);
      });
    });
    container.innerHTML = "";
    var titles = Object.keys(groups).sort();
    if (!titles.length) {
      container.textContent = "No matches.";
      return;
    }
    titles.forEach(function (t, deckIndex) {
      var deck = document.createElement("section");
      deck.className = "vocab-deck";
      var h = document.createElement("h3");
      h.className = "vocab-group-title";
      var toggle = document.createElement("button");
      toggle.type = "button";
      toggle.className = "vocab-group-toggle";
      var label = document.createElement("span");
      label.textContent = t;
      var count = document.createElement("span");
      count.className = "vocab-group-count";
      count.textContent = String(groups[t].length);
      toggle.appendChild(label);
      toggle.appendChild(count);
      h.appendChild(toggle);
      deck.appendChild(h);
      var list = document.createElement("div");
      list.className = "vocab-words";
      list.id = "vocabDeck-" + deckIndex;
      list.hidden = !query && !deckFilter;
      toggle.setAttribute("aria-controls", list.id);
      toggle.setAttribute("aria-expanded", String(!list.hidden));
      toggle.addEventListener("click", function () {
        list.hidden = !list.hidden;
        toggle.setAttribute("aria-expanded", String(!list.hidden));
      });
      groups[t].sort().forEach(function (w) {
        list.appendChild(wordRow(w, getStatus(w)));
      });
      deck.appendChild(list);
      container.appendChild(deck);
    });
    updateStats();
  }

  function wordRow(w, status) {
    var row = document.createElement("div");
    row.className = "vocab-word";
    var name = document.createElement("span");
    name.className = "vocab-word-name";
    name.textContent = w;
    name.title = w;
    row.appendChild(name);
    var dots = document.createElement("span");
    dots.className = "vocab-dots";
    STATUSES.forEach(function (s) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "vocab-dot vocab-dot--" + s + (status === s ? " is-on" : "");
      b.setAttribute("aria-label", w + " mark " + s);
      b.addEventListener("click", function () { setStatus(w, s); });
      dots.appendChild(b);
    });
    row.appendChild(dots);
    return row;
  }

  function updateStats() {
    var green = 0, total = 0;
    Object.keys(DATA).forEach(function (w) {
      if (deckFilter && DATA[w].decks.indexOf(deckFilter) === -1) return;
      total++;
      if (getStatus(w) === "green") green++;
    });
    var el = document.getElementById("vocabStats");
    if (el) el.textContent = total + " words · " + green + " mastered";
  }

  document.addEventListener("DOMContentLoaded", function () {
    var allWords = document.getElementById("vocabAll");
    if (allWords) allWords.hidden = !deckFilter;
    var search = document.getElementById("vocabSearch");
    if (search) search.addEventListener("input", render);
    var authBtn = document.getElementById("vocabAuth");
    var dl = document.getElementById("vocabDownload");
    if (dl) dl.addEventListener("click", function () {
      dl.href = URL.createObjectURL(new Blob([serialize()], { type: "text/javascript" }));
    });
    var filterYellow = document.getElementById("filterYellow");
    var filterGreen = document.getElementById("filterGreen");
    function bindFilter(btn, status) {
      if (!btn) return;
      btn.addEventListener("click", function () {
        filter = filter === status ? null : status;
        if (filterYellow) filterYellow.classList.toggle("is-on", filter === "yellow");
        if (filterGreen) filterGreen.classList.toggle("is-on", filter === "green");
        render();
      });
    }
    bindFilter(filterYellow, "yellow");
    bindFilter(filterGreen, "green");
    if (canAutosave) {
      if (authBtn) { authBtn.hidden = false; authBtn.onclick = authorize; }
      restoreAutosave();
    } else if (dl) {
      dl.hidden = false;
    }
    render();
  });
})();
