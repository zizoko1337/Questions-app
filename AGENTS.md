# Questions App

## Project Overview

- Stack: React + Vite.
- No backend.
- Main source of truth for questions: `src/data/questions.json`.
- The app is a frontend interview knowledge base in Polish.
- Production build output goes to `dist/`.

## Core Data Model

Each question object should use this shape:

```json
{
  "id": "stable-question-id",
  "name": "Question title",
  "description": "Markdown answer/explanation",
  "categories": ["React", "JavaScript"],
  "images": [
    {
      "src": "/images/example.webp",
      "alt": "Optional description"
    }
  ],
  "links": [
    {
      "label": "MDN docs",
      "href": "https://developer.mozilla.org/..."
    }
  ]
}
```

Notes:

- `id`, `name`, `description`, `categories` are the main required fields.
- `images` and `links` are optional.
- `description` is markdown and is rendered with `react-markdown` + `remark-gfm`.
- `images` may be normalized from strings, but prefer the object form above in JSON.
- `links` may be normalized from strings, but prefer `{ label, href }`.
- Allowed categories only:
- `html`
- `css`
- `javascript`
- `typescript`
- `vue`
- `react`
- `architecture`
  - `other`

## Assets

- Local images should be placed in `public/images/`.
- In JSON, reference them with root-relative paths like `/images/event-loop-diagram.svg`.
- Images are intentionally rendered only after expanding question details.
- Images also use `loading="lazy"` and `decoding="async"`.

## Current UI Behavior

### List View

- Only question title and categories are visible by default.
- Clicking the chevron expands details.
- Expanded details show:
  - markdown description
  - images
  - links
- Images in the expanded question are displayed one below another for readability.
- Each question also has a `Dopytaj AI` button.

### Image Viewer

- Clicking an image opens a fullscreen-style overlay viewer.
- Viewer currently uses the images from the selected question only.
- Navigation between images is possible with:
  - on-screen previous/next buttons
  - keyboard arrows `Left` and `Right`
- Closing works with:
  - `Zamknij`
  - clicking the backdrop
  - `Esc`
- Viewer is styled to occupy roughly `90vw` by `90vh`.

### Flashcards View

- Uses the same question data as the list view.
- Front side: `name`.
- Back side: `description`.
- When the answer is revealed, flashcards also show:
  - images
  - links
- The `Losuj` button:
  - respects current filters
  - does not repeat the currently visible flashcard when more than one card is available

### Add Question View

- Form creates a question object in session state only.
- The real long-term source of truth is still `src/data/questions.json`.
- The form supports:
  - `name`
  - `categories`
  - `description`
  - `images`
  - `links`
- `images` input format:
  - one line per image
  - `path | alt`
- `links` input format:
  - one line per link
  - `label | href`
- The form can copy the generated JSON snippet.

## AI Integration

- AI follow-up lives in a modal opened by `Dopytaj AI`.
- It sends a direct frontend request to Gemini with `fetch(...)`.
- Env variable used by Vite:
  - `VITE_GEMINI_API_KEY`
- Local env file:
  - `.env.local`
- Example template:
  - `.env.example`

Important:

- This is a frontend-only prototype approach.
- The Gemini key is exposed to the frontend bundle if used this way.
- This is acceptable for local/private testing, but not a secure production architecture.

## Important Files

- `src/App.jsx`:
  main UI, state, flashcards, AI modal, image viewer, resource rendering
- `src/styles.css`:
  all styling
- `src/data/questions.json`:
  question dataset
- `public/images/`:
  local static images for questions
- `.env.local`:
  local Gemini API key for dev use

## Existing Example Data

- `event-loop-browser` already contains:
  - 2 example local images
  - external documentation links
- It is the best sample question to test:
  - expanded question resources
  - image viewer
  - flashcard resources

## Working Assumptions

- Keep the app frontend-only unless explicitly asked to add backend infrastructure.
- Prefer extending the JSON model rather than introducing a database.
- Preserve Polish UI copy unless the user asks otherwise.
- Reuse existing components and data flow instead of creating parallel versions of the same feature.
