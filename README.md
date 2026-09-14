# Context English

Context English is an open source local vocabulary reader for English learning. It uses real YouTube videos and articles to teach English vocabulary, American pronunciation, sentence context, and short notes.

## Start

1. Download this repository.
2. Unzip it.
3. Open `index.html`.

No install, account, or API key is needed for the included examples. The project runs in a browser and keeps the example files on your computer.

## Included examples

- The Peninsula hotel - 119 video cards
- The artificial diamond problem - 56 video cards
- The Telegram founder interview - 1171 video cards
- We Must Pace the Frontier - 277 words and 49 notes

## Reading

The page shows the English text first. Hover over a word or phrase for its American IPA and English meaning. Click it for the Chinese meaning, note, audio, and status controls.

- `Space` plays the pronunciation.
- `G` marks a word green.
- `Y` marks a word yellow.
- `Esc` closes the open explanation.

## Vocabulary library

`Library` groups words by video or article. The same word keeps one yellow or green status across the project. `Quiz` can use the words from each example.

For saved status and practice records, open `Library` and choose `Enable autosave`. Pick the `vocabulary.js` file in this project folder. The reader uses that saved choice.

## Add your own material

Place the project folder in an AI coding tool that can edit local files. Give it a YouTube or article URL and ask it to follow `AGENTS.md`. For a YouTube video, provide the transcript when the tool asks for it. The tool can build the cards, audio, notes, and library entry in the same format as the examples.

## Project files

- `index.html`: video examples
- `articles.html`: article examples
- `library.html`: shared vocabulary library
- `quiz.html`: listening quiz
- `videos/`: video cards and media
- `articles/`: article readers and media
- `vocabulary.js`: shared word status and deck index

The project has no build step. It is a static site for local English study.

[中文版 README](README.zh-CN.md) · [Content workflow](AGENTS.md)
