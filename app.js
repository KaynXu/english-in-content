const cards = window.VOCABULARY_CARDS;

const image = document.querySelector("#image");
const word = document.querySelector("#word");
const ipa = document.querySelector("#ipa");
const progress = document.querySelector("#progress");
const statusDot = document.querySelector("#statusDot");
const card = document.querySelector("#card");
const previous = document.querySelector("#previous");
const next = document.querySelector("#next");
const sound = document.querySelector("#sound");
const definition = document.querySelector("#definition");
const sentence = document.querySelector("#sentence");
const flipFace = document.querySelector("#flip");
const zh = document.querySelector("#zh");
const sentenceZh = document.querySelector("#sentenceZh");
const cardsEmpty = document.querySelector("#cardsEmpty");

function safeDecode(value) {
  try { return decodeURIComponent(value); } catch { return ""; }
}

let index = 0;
let filter = "all";
const FILTER_ORDER = ["all", "yellow", "green"];
const CARD_POSITION_KEY = "context-english-card-pos-v1";
const deckKey = safeDecode(new URL(".", window.location.href).pathname.split("/").filter(Boolean).pop() || "");
let audio = null;
let touchStartX = null;
let suppressClickUntil = 0;
const pendingImagePreloads = new Map();

function cardPositions() {
  try {
    const value = JSON.parse(localStorage.getItem(CARD_POSITION_KEY) || "{}");
    return value && !Array.isArray(value) && typeof value === "object" ? value : {};
  } catch { return {}; }
}

function saveCardPosition(value) {
  const positions = cardPositions();
  positions[deckKey] = value;
  try { localStorage.setItem(CARD_POSITION_KEY, JSON.stringify(positions)); } catch {}
}

function getVisibleCards() {
  if (filter === "all" || !window.VocabStatus) {
    return cards;
  }
  return cards.filter((entry) => window.VocabStatus.get(entry.word) === filter);
}

function wrappedIndex(value) {
  const length = getVisibleCards().length;
  return length === 0 ? 0 : (value + length) % length;
}

function positionFromHash() {
  const visible = getVisibleCards();
  const hash = safeDecode(window.location.hash.slice(1)).toLowerCase();
  const hashMatch = hash ? visible.findIndex((entry) => entry.word.toLowerCase() === hash) : -1;
  if (hashMatch >= 0) return hashMatch;
  const saved = String(cardPositions()[deckKey] || "").toLowerCase();
  const savedMatch = visible.findIndex((entry) => entry.word.toLowerCase() === saved);
  return savedMatch >= 0 ? savedMatch : 0;
}

function preload(position) {
  const entry = getVisibleCards()[wrappedIndex(position)];
  if (!entry || pendingImagePreloads.has(entry.image)) {
    return;
  }

  const adjacentImage = new Image();
  const release = () => pendingImagePreloads.delete(entry.image);
  pendingImagePreloads.set(entry.image, adjacentImage);
  adjacentImage.addEventListener("load", release, { once: true });
  adjacentImage.addEventListener("error", release, { once: true });
  adjacentImage.src = entry.image;
}

function stopAudio() {
  if (audio) {
    audio.pause();
    audio.currentTime = 0;
    audio = null;
  }
  window.speechSynthesis?.cancel();
  sound.classList.remove("is-playing");
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function flipCard() {
  card.classList.toggle("is-flipped");
  const flipped = card.classList.contains("is-flipped");
  flipFace.hidden = !flipped;
  card.setAttribute("aria-pressed", String(flipped));
}

function render(position, updateHash = true) {
  const visible = getVisibleCards();
  stopAudio();

  if (visible.length === 0) {
    index = 0;
    card.hidden = true;
    cardsEmpty.hidden = false;
    cardsEmpty.textContent = filter === "green" ? "No green words yet." : "All mastered.";
    progress.textContent = "0/0";
    progress.setAttribute("aria-label", "No cards match this filter");
    if (statusDot) {
      statusDot.dataset.status = filter;
    }
    return;
  }

  card.hidden = false;
  cardsEmpty.hidden = true;
  index = wrappedIndex(position);
  const entry = visible[index];
  saveCardPosition(entry.word);

  card.classList.remove("is-flipped");
  flipFace.hidden = true;
  card.setAttribute("aria-pressed", "false");

  image.classList.remove("is-ready");
  image.alt = entry.imageAlt;
  image.onload = () => image.classList.add("is-ready");
  image.src = entry.image;
  if (image.complete) {
    image.classList.add("is-ready");
  }

  word.textContent = entry.word;
  ipa.textContent = entry.ipa;
  progress.textContent = `${index + 1}/${visible.length}`;
  progress.setAttribute("aria-label", `Card ${index + 1} of ${visible.length}`);
  if (statusDot && window.VocabStatus) {
    statusDot.dataset.status = filter === "all" ? window.VocabStatus.get(entry.word) : filter;
  }
  sound.setAttribute("aria-label", `Play American pronunciation of ${entry.word}`);

  definition.textContent = entry.definition || "";
  if (entry.sentence) {
    const text = entry.sentence;
    const match = entry.match || entry.word;
    const pos = text.toLowerCase().indexOf(match.toLowerCase());
    if (pos >= 0) {
      sentence.innerHTML =
        escapeHtml(text.slice(0, pos)) +
        `<strong>${escapeHtml(text.slice(pos, pos + match.length))}</strong>` +
        escapeHtml(text.slice(pos + match.length));
    } else {
      sentence.textContent = text;
    }
  } else {
    sentence.textContent = "";
  }
  zh.textContent = entry.zh || "";
  sentenceZh.textContent = entry.sentenceZh || "";

  if (updateHash) {
    history.replaceState(null, "", `#${encodeURIComponent(entry.word)}`);
  }

  preload(index - 1);
  preload(index + 1);
}

function speakWithBrowser(text) {
  if (!("speechSynthesis" in window)) {
    sound.classList.remove("is-playing");
    return;
  }

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "en-US";
  const voices = window.speechSynthesis.getVoices();
  utterance.voice =
    voices.find((voice) => voice.lang === "en-US" && /samantha|ava|allison|alex/i.test(voice.name)) ||
    voices.find((voice) => voice.lang === "en-US") ||
    null;
  utterance.rate = 0.82;
  utterance.onend = () => sound.classList.remove("is-playing");
  utterance.onerror = () => sound.classList.remove("is-playing");
  window.speechSynthesis.speak(utterance);
}

function playPronunciation() {
  stopAudio();
  const entry = getVisibleCards()[index];
  if (!entry) {
    return;
  }
  sound.classList.add("is-playing");
  audio = new Audio(entry.audio);
  audio.addEventListener("ended", () => sound.classList.remove("is-playing"), { once: true });
  audio.addEventListener(
    "error",
    () => {
      audio = null;
      speakWithBrowser(entry.word);
    },
    { once: true },
  );
  audio.play().catch(() => speakWithBrowser(entry.word));
}

previous.addEventListener("click", () => render(index - 1));
next.addEventListener("click", () => render(index + 1));
sound.addEventListener("click", (event) => {
  event.stopPropagation();
  playPronunciation();
});
card.addEventListener("click", (event) => {
  if (Date.now() < suppressClickUntil) {
    suppressClickUntil = 0;
    event.preventDefault();
    return;
  }
  flipCard();
});

function markWord(status) {
  if (!window.VocabStatus) return;
  const entry = getVisibleCards()[index];
  if (!entry) return;
  window.VocabStatus.set(entry.word, status);
  if (filter === "all") {
    if (statusDot) {
      statusDot.dataset.status = status;
    }
    return;
  }
  if (status !== filter) {
    // 词离开当前筛选列表, 渲染同一位置即自动跳到下一张 (列表空则显示 All mastered.)
    render(index);
  }
}

function cycleFilter() {
  const currentWord = getVisibleCards()[index]?.word;
  filter = FILTER_ORDER[(FILTER_ORDER.indexOf(filter) + 1) % FILTER_ORDER.length];
  if (statusDot) {
    statusDot.setAttribute("aria-label", `Filter: ${filter}`);
  }
  const position = getVisibleCards().findIndex((entry) => entry.word === currentWord);
  render(position >= 0 ? position : positionFromHash());
}

statusDot.addEventListener("click", cycleFilter);
statusDot.addEventListener("keydown", (event) => {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    cycleFilter();
  }
});

document.addEventListener("keydown", (event) => {
  const typing =
    document.activeElement &&
    (document.activeElement.tagName === "INPUT" || document.activeElement.tagName === "TEXTAREA");
  if (event.key === "ArrowLeft") {
    render(index - 1);
  } else if (event.key === "ArrowRight") {
    render(index + 1);
  } else if (event.key === " ") {
    if (document.activeElement === card || document.activeElement === document.body) {
      event.preventDefault();
      flipCard();
    }
  } else if (event.key === "Enter") {
    if (document.activeElement === sound || document.activeElement === document.body) {
      event.preventDefault();
      playPronunciation();
    }
  } else if (!typing && (event.key === "g" || event.key === "G")) {
    markWord("green");
  } else if (!typing && (event.key === "y" || event.key === "Y")) {
    markWord("yellow");
  }
});

card.addEventListener(
  "touchstart",
  (event) => {
    touchStartX = event.changedTouches[0].clientX;
  },
  { passive: true },
);

card.addEventListener(
  "touchend",
  (event) => {
    if (touchStartX === null) {
      return;
    }
    const distance = event.changedTouches[0].clientX - touchStartX;
    touchStartX = null;
    suppressClickUntil = Date.now() + 700;
    if (Math.abs(distance) < 48) {
      flipCard();
      return;
    }
    render(index + (distance < 0 ? 1 : -1));
  },
  { passive: true },
);

window.addEventListener("hashchange", () => render(positionFromHash(), false));
render(positionFromHash(), false);
