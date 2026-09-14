(function () {
  "use strict";

  var article = window.ARTICLE;
  var body = document.getElementById("articleBody");
  var popup = document.getElementById("readerPopup");
  var explanation = document.getElementById("readerExplanation");
  var closeButton = document.getElementById("readerClose");
  var saveNotice = document.getElementById("readerSaveNotice");
  var needsSave = false;
  var cards = Object.create(null);
  var active = null;
  var activeEntry = null;
  var pinned = false;
  var hideTimer = null;
  var audio = null;
  var saveTimer = null;
  var positionKey = "context-english-article-pos-v1:" + article.id;

  (window.VOCABULARY_CARDS || []).forEach(function (card) {
    cards[card.word.toLowerCase()] = card;
  });

  document.title = article.title;
  document.getElementById("articleTitle").textContent = article.title;
  document.getElementById("articleByline").textContent = article.author + " / " + article.date;
  document.getElementById("articleSource").href = article.source;
  document.getElementById("articleWords").href = "../../library.html?deck=" + encodeURIComponent(article.title);
  document.getElementById("readerEnableSave").hidden = !window.VocabStatus.canAutosave;

  function updateSaveNotice() {
    saveNotice.hidden = !needsSave || !pinned || !active || !active.dataset.word;
    if (!popup.hidden) positionPopup();
  }

  window.addEventListener("focus", function () {
    if (!needsSave) return;
    window.VocabStatus.restoreAutosave().then(function (saved) {
      if (saved) needsSave = false;
      updateSaveNotice();
    });
  });

  function textElement(tag, className, text) {
    var element = document.createElement(tag);
    element.className = className;
    element.textContent = text;
    return element;
  }

  var list = null;
  article.blocks.forEach(function (block) {
    var element = document.createElement(["h2", "h3", "blockquote", "li"].indexOf(block.type) >= 0 ? block.type : "p");
    element.id = block.id;
    element.dataset.readingBlock = "";
    block.content.forEach(function (part) {
      if (typeof part === "string") {
        element.appendChild(document.createTextNode(part));
        return;
      }
      var word = String(part.word || "").toLowerCase();
      var card = cards[word];
      if (!card && !part.note) {
        if (part.href) {
          var link = textElement("a", "reader-source-link", part.text);
          link.href = part.href;
          if (part.role === "doc-backlink") link.setAttribute("role", part.role);
          if (part.href.charAt(0) !== "#") { link.target = "_blank"; link.rel = "noopener noreferrer"; }
          element.appendChild(link);
        } else element.appendChild(document.createTextNode(part.text));
        return;
      }
      var trigger = textElement("button", "reader-term", part.text);
      trigger.type = "button";
      trigger.setAttribute("aria-controls", "readerPopup");
      trigger.setAttribute("aria-expanded", "false");
      trigger.setAttribute("aria-haspopup", "dialog");
      if (card) {
        trigger.dataset.word = word;
        trigger.dataset.status = window.VocabStatus.get(word);
      }
      if (part.note) trigger.classList.add("has-note");
      trigger.addEventListener("pointerenter", function (event) {
        if (event.pointerType === "mouse" && (card || part.preview) && !pinned) show(trigger, part, card, false);
      });
      trigger.addEventListener("pointerleave", scheduleHide);
      trigger.addEventListener("click", function () {
        if (active === trigger && pinned) close(true);
        else show(trigger, part, card, true);
      });
      element.appendChild(trigger);
    });
    if (block.type === "li") {
      if (!list || list.tagName.toLowerCase() !== block.list) {
        list = document.createElement(block.list === "ol" ? "ol" : "ul");
        body.appendChild(list);
      }
      list.appendChild(element);
    } else {
      list = null;
      body.appendChild(element);
    }
  });

  function stopAudio() {
    if (audio) { audio.pause(); audio = null; }
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
  }

  function playAudio(card) {
    stopAudio();
    if (!card.audio) {
      speakWithBrowser(card.word);
      return;
    }
    var player = new Audio(card.audio);
    audio = player;
    function fallback() {
      if (audio !== player) return;
      audio = null;
      speakWithBrowser(card.word);
    }
    player.addEventListener("error", fallback, { once: true });
    player.play().catch(fallback);
  }

  function speakWithBrowser(word) {
    if (!("speechSynthesis" in window) || !("SpeechSynthesisUtterance" in window)) return;
    var utterance = new SpeechSynthesisUtterance(word);
    utterance.lang = "en-US";
    utterance.voice = window.speechSynthesis.getVoices().find(function (voice) {
      return voice.lang === "en-US";
    }) || null;
    utterance.rate = 0.85;
    window.speechSynthesis.speak(utterance);
  }

  function markWord(card, status) {
    window.VocabStatus.set(card.word, status).then(function (saved) {
      return saved || window.VocabStatus.restoreAutosave();
    }).then(function (saved) {
      needsSave = !saved;
      updateSaveNotice();
    });
    refreshStatus(card.word);
  }

  function positionPopup() {
    if (!active) return;
    var rect = active.getBoundingClientRect();
    var margin = 12;
    var width = popup.offsetWidth;
    var height = popup.offsetHeight;
    var left = Math.max(margin, Math.min(rect.left, window.innerWidth - width - margin));
    var top = rect.bottom + 8;
    if (top + height > window.innerHeight - margin) top = rect.top - height - 8;
    popup.style.left = left + "px";
    popup.style.top = Math.max(margin, top) + "px";
  }

  function show(trigger, part, card, pin) {
    clearTimeout(hideTimer);
    stopAudio();
    if (active) {
      active.setAttribute("aria-expanded", "false");
      active.removeAttribute("aria-describedby");
    }
    active = trigger;
    activeEntry = card || part.preview || null;
    pinned = pin;
    active.setAttribute("aria-expanded", String(pin));
    if (!pin) active.setAttribute("aria-describedby", "readerPopup");
    explanation.replaceChildren();
    closeButton.hidden = !pin;
    popup.setAttribute("role", pin ? "dialog" : "tooltip");
    var entry = pin ? card : activeEntry;
    popup.setAttribute("aria-label", entry ? entry.word : "Note: " + part.text);
    if (entry) {
      explanation.appendChild(textElement("h2", "reader-popup-word", entry.word));
      var pronunciation = textElement("div", "reader-pronunciation", "");
      pronunciation.appendChild(textElement("span", "reader-ipa", entry.ipa));
      if (pin) {
        var sound = textElement("button", "sound-button reader-sound", "");
        sound.type = "button";
        sound.setAttribute("aria-label", "Play American pronunciation of " + card.word);
        sound.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path class="speaker" d="M4 9v6h4l5 4V5L8 9H4Z" /><path class="sound-wave" d="M16 9.25a4 4 0 0 1 0 5.5M18.75 6.5a7.75 7.75 0 0 1 0 11" /></svg>';
        sound.addEventListener("click", function () { playAudio(card); });
        pronunciation.appendChild(sound);
      }
      explanation.appendChild(pronunciation);
      explanation.appendChild(textElement("p", "reader-definition", part.definition || entry.definition));
      if (pin) {
        var zh = textElement("p", "reader-zh", part.zh || card.zh);
        zh.lang = "zh-CN";
        explanation.appendChild(zh);
        var statuses = textElement("div", "reader-statuses", "");
        ["yellow", "green"].forEach(function (status) {
          var button = textElement("button", "vocab-dot vocab-dot--" + status, "");
          button.type = "button";
          button.dataset.status = status;
          button.setAttribute("aria-label", "Mark " + card.word + " " + status);
          button.addEventListener("click", function () {
            markWord(card, status);
          });
          statuses.appendChild(button);
        });
        explanation.appendChild(statuses);
        refreshStatus(card.word);
      }
    } else {
      explanation.appendChild(textElement("h2", "reader-note-title", part.text));
    }
    if (pin && part.note) {
      var note = textElement("p", "reader-note-text", part.note);
      note.lang = "zh-CN";
      explanation.appendChild(note);
    }
    if (pin && part.href) {
      var reference = textElement("a", "reader-reference", "Reference");
      reference.href = part.href;
      if (part.href.charAt(0) !== "#") { reference.target = "_blank"; reference.rel = "noopener noreferrer"; }
      explanation.appendChild(reference);
    }
    popup.hidden = false;
    updateSaveNotice();
    if (pin) closeButton.focus({ preventScroll: true });
  }

  function refreshStatus(word) {
    var status = window.VocabStatus.get(word);
    body.querySelectorAll("[data-word]").forEach(function (term) {
      if (term.dataset.word === word) term.dataset.status = status;
    });
    explanation.querySelectorAll(".reader-statuses button").forEach(function (button) {
      button.classList.toggle("is-on", button.dataset.status === status);
      button.setAttribute("aria-pressed", String(button.dataset.status === status));
    });
  }

  function close(restoreFocus) {
    clearTimeout(hideTimer);
    stopAudio();
    var previous = active;
    if (active) {
      active.setAttribute("aria-expanded", "false");
      active.removeAttribute("aria-describedby");
    }
    active = null;
    activeEntry = null;
    pinned = false;
    popup.hidden = true;
    if (restoreFocus && previous) previous.focus({ preventScroll: true });
  }

  function scheduleHide() {
    if (!pinned) hideTimer = setTimeout(function () { close(false); }, 180);
  }

  closeButton.addEventListener("click", function () { close(true); });
  popup.addEventListener("pointerenter", function () { clearTimeout(hideTimer); });
  popup.addEventListener("pointerleave", scheduleHide);
  document.addEventListener("pointerdown", function (event) {
    if (active && !popup.contains(event.target) && !active.contains(event.target)) close(false);
  });
  document.addEventListener("keydown", function (event) {
    if (event.defaultPrevented || event.isComposing || event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.key === "Escape" && active) {
      event.preventDefault();
      close(true);
      return;
    }
    if (popup.hidden || !activeEntry) return;
    var target = event.target;
    if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return;
    var key = event.key.toLowerCase();
    var card = cards[active.dataset.word];
    if (key !== " " && !(card && (key === "g" || key === "y"))) return;
    event.preventDefault();
    if (event.repeat) return;
    if (key === " ") playAudio(activeEntry);
    else markWord(card, key === "g" ? "green" : "yellow");
  });
  document.addEventListener("focusin", function (event) {
    if (pinned && !popup.contains(event.target) && event.target !== active) close(false);
  });
  window.addEventListener("resize", positionPopup);

  function savePosition() {
    clearTimeout(saveTimer);
    var blocks = body.querySelectorAll("[data-reading-block]");
    var current = blocks[0];
    blocks.forEach(function (block) {
      if (block.getBoundingClientRect().top <= 120) current = block;
    });
    if (!current) return;
    try {
      localStorage.setItem(positionKey, JSON.stringify({ id: current.id, top: current.getBoundingClientRect().top }));
    } catch (error) {}
  }

  window.addEventListener("scroll", function () {
    if (active) {
      var rect = active.getBoundingClientRect();
      if (rect.bottom < 0 || rect.top > window.innerHeight) close(false);
      else positionPopup();
    }
    clearTimeout(saveTimer);
    saveTimer = setTimeout(savePosition, 150);
  }, { passive: true });
  window.addEventListener("pagehide", function () { savePosition(); stopAudio(); });
  if (!window.location.hash) {
    try {
      var saved = JSON.parse(localStorage.getItem(positionKey));
      var block = saved && document.getElementById(saved.id);
      if (block && body.contains(block) && Number.isFinite(saved.top)) {
        requestAnimationFrame(function () {
          window.scrollTo(0, window.scrollY + block.getBoundingClientRect().top - saved.top);
        });
      }
    } catch (error) {}
  }
})();
