import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import seedQuestions from "./data/questions.json";

const geminiApiKey = import.meta.env.VITE_GEMINI_API_KEY;
const questionFlagsStorageKey = "questions-app-question-flags";
const allowedCategories = [
  "html",
  "css",
  "javascript",
  "typescript",
  "vue",
  "react",
  "architecture",
  "other",
];

const views = [
  { id: "list", label: "Lista pytan" },
  { id: "flashcards", label: "Fiszki" },
  { id: "prompts", label: "Prompty AI" },
  { id: "add", label: "Dodaj pytanie" },
];

const initialForm = {
  name: "",
  description:
    "## Glowna odpowiedz\n\n- najwazniejsza zasada\n- typowy blad na rozmowie\n\n```js\n// przyklad\n```",
  categories: "",
  images: "",
  links: "",
};

const neutralQuestionBorder =
  "linear-gradient(135deg, rgba(255, 255, 255, 0.08), rgba(255, 255, 255, 0.12))";
const questionStatusBorderColors = {
  important: "rgba(244, 179, 93, 0.95)",
  hard: "rgba(255, 107, 107, 0.95)",
  learned: "rgba(100, 214, 154, 0.95)",
};

function buildAiCoachPrompt(areaName, scope) {
  return [
    `Chce przeprowadzic z Toba techniczna rozmowe cwiczeniowa z zakresu ${areaName}.`,
    "",
    "Twoja rola:",
    "- jestes trenerem technicznym pomagajacym mi utrwalac wiedze",
    `- zadajesz pytania tylko z zakresu ${areaName}`,
    "- Twoim celem jest sprawdzanie, poprawianie i utrwalanie mojej wiedzy",
    "- rozmawiasz po polsku",
    "",
    "Zakres pytan:",
    ...scope.map((item) => `- ${item}`),
    "",
    "Zasady rozmowy:",
    "- zadaj jedno pytanie na raz",
    "- zacznij od poziomu mid frontend developera, ale jesli odpowiadam dobrze, dopytuj glebiej",
    "- po kazdej mojej odpowiedzi odpowiedz w 3 krokach:",
    "  1. krotko wskaz, co bylo trafne",
    "  2. dopowiedz, czego zabraklo albo co bylo nieprecyzyjne",
    "  3. podaj lepsza, zwiezla odpowiedz w 3-6 zdaniach, zebym mogl ja zapamietac",
    "- jesli warto, zadaj jedno pytanie poglebiajace",
    "- nie zdradzaj pelnej odpowiedzi przed moja proba, chyba ze poprosze o podpowiedz",
    "- pilnuj scope i nie uciekaj poza temat",
    "- po kazdych 5 pytaniach zrob krotkie podsumowanie: co juz umiem, co warto dopracowac i co powtorzyc",
    "",
    "Zacznij od pierwszego pytania.",
  ].join("\n");
}

function buildQuestionScopedPromptEntry({
  id,
  label,
  emptyLabel,
  areaName,
  questions,
}) {
  const scope = questions.map(
    (question) => `${question.name} [${question.categories.join(", ")}]`,
  );

  if (!scope.length) {
    return {
      id,
      label,
      description: `Na razie nie ma pytan oznaczonych jako ${emptyLabel}.`,
      scope: [
        `Oznacz pytania jako ${emptyLabel} w widoku listy, a ten prompt zbuduje sie automatycznie.`,
      ],
      prompt: `Najpierw oznacz w aplikacji pytania jako ${emptyLabel}, a potem skopiuj ten prompt.`,
      isAvailable: false,
    };
  }

  return {
    id,
    label,
    description: `Generowane automatycznie z ${questions.length} pytan oznaczonych jako ${emptyLabel}. Agent pyta tylko z tej puli.`,
    scope,
    prompt: buildAiCoachPrompt(areaName, scope),
    isAvailable: true,
  };
}

const staticAiCoachPrompts = [
  {
    id: "html-css",
    label: "HTML + CSS",
    description:
      "Semantyka, formularze, accessibility, layout, cascade, responsive design i wydajnosc CSS.",
    scope: [
      "semantic HTML, button vs link vs div, formularze, label, fieldset i legend",
      "ARIA, alt text, accessibility, focus i podstawy uzytecznosci",
      "cascade, specificity, inheritance, box model, normal flow",
      "display, position, stacking context, flexbox, grid",
      "responsive images, media queries, container queries i responsive layout",
      "reflow, repaint, compositing, transitions i animacje",
    ],
  },
  {
    id: "javascript",
    label: "JavaScript",
    description:
      "Core language, async, event loop, scope, closures, this, prototypy i praktyczne puapki rekrutacyjne.",
    scope: [
      "execution context, call stack, hoisting, scope i lexical scope",
      "closures, this, call/apply/bind, prototype chain",
      "Promise, async/await, event loop, microtaski i macrotaski",
      "type coercion, shallow vs deep copy, immutability",
      "AbortController, debounce vs throttle, event delegation",
      "ESM, dynamic import, tree shaking, memory leaks",
    ],
  },
  {
    id: "vue",
    label: "Vue",
    description:
      "Reaktywnosc, Composition API, komunikacja komponentow, routing, store i Nuxt basics.",
    scope: [
      "system reaktywnosci Vue, ref vs reactive, computed vs watch, watchEffect",
      "composables, script setup, defineProps, defineEmits, defineExpose",
      "props, emits, sloty, provide/inject, lifecycle hooks",
      "v-model, nextTick, async components, keep-alive",
      "Vue Router, navigation guards, Pinia",
      "Nuxt basics i hydration mismatch",
    ],
  },
  {
    id: "architecture",
    label: "Architecture",
    description:
      "Rendering strategies, performance, networking, API communication, state i frontendowe decyzje architektoniczne.",
    scope: [
      "browser rendering pipeline, DOM, CSSOM, layout, paint i composite",
      "CSR vs SSR vs SSG vs ISR, code splitting, lazy loading, Core Web Vitals",
      "HTTP caching, CDN, DNS, TLS handshake i zrodla opoznien",
      "feature-based architecture, design system, component library",
      "server state vs client state, optimistic UI, retries i fallbacki",
      "REST vs GraphQL vs RPC, reverse proxy i load balancer",
    ],
  },
].map((entry) => ({
  ...entry,
  prompt: buildAiCoachPrompt(
    entry.promptAreaName ?? entry.label,
    entry.scope,
  ),
}));

function slugify(value) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function parseCategories(value) {
  return value
    .split(",")
    .map((category) => category.trim())
    .filter(Boolean)
    .map((category) => category.toLowerCase())
    .map((category) =>
      allowedCategories.includes(category) ? category : "other",
    )
    .filter((category, index, array) => array.indexOf(category) === index);
}

function splitResourceLine(value) {
  const separatorIndex = value.indexOf("|");

  if (separatorIndex === -1) {
    return [value.trim(), ""];
  }

  return [
    value.slice(0, separatorIndex).trim(),
    value.slice(separatorIndex + 1).trim(),
  ];
}

function parseImages(value) {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      const [src, alt] = splitResourceLine(line);

      if (!src) {
        return null;
      }

      return {
        src,
        alt: alt || `Ilustracja ${index + 1}`,
      };
    })
    .filter(Boolean);
}

function parseLinks(value) {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [label, hrefCandidate] = splitResourceLine(line);
      const href = hrefCandidate || label;

      if (!href) {
        return null;
      }

      return {
        label: label || href,
        href,
      };
    })
    .filter(Boolean);
}

function normalizeImage(image, index) {
  if (typeof image === "string") {
    return {
      src: image,
      alt: `Ilustracja ${index + 1}`,
    };
  }

  if (!image?.src) {
    return null;
  }

  return {
    src: image.src,
    alt: image.alt?.trim() || `Ilustracja ${index + 1}`,
  };
}

function normalizeLink(link) {
  if (typeof link === "string") {
    return {
      label: link,
      href: link,
    };
  }

  const href = link?.href?.trim() || link?.url?.trim() || "";

  if (!href) {
    return null;
  }

  return {
    label: link?.label?.trim() || href,
    href,
  };
}

function normalizeQuestion(question) {
  return {
    ...question,
    isImportant: Boolean(question.isImportant),
    isHard: Boolean(question.isHard),
    isLearned: Boolean(question.isLearned),
    images: (question.images ?? [])
      .map((image, index) => normalizeImage(image, index))
      .filter(Boolean),
    links: (question.links ?? []).map(normalizeLink).filter(Boolean),
  };
}

function loadStoredQuestionFlags() {
  if (typeof window === "undefined") {
    return {};
  }

  try {
    const rawFlags = window.localStorage.getItem(questionFlagsStorageKey);

    if (!rawFlags) {
      return {};
    }

    const parsedFlags = JSON.parse(rawFlags);
    return parsedFlags && typeof parsedFlags === "object" ? parsedFlags : {};
  } catch {
    return {};
  }
}

function loadInitialQuestions() {
  const storedFlags = loadStoredQuestionFlags();

  return seedQuestions.map((question) => {
    const normalizedQuestion = normalizeQuestion(question);
    const storedQuestionFlags = storedFlags[normalizedQuestion.id];

    if (!storedQuestionFlags) {
      return normalizedQuestion;
    }

    return {
      ...normalizedQuestion,
      isImportant: Boolean(storedQuestionFlags.isImportant),
      isHard: Boolean(storedQuestionFlags.isHard),
      isLearned: Boolean(storedQuestionFlags.isLearned),
    };
  });
}

function buildQuestionObject(formState) {
  const normalizedName = formState.name.trim();
  const categories = parseCategories(formState.categories);
  const images = parseImages(formState.images);
  const links = parseLinks(formState.links);

  return {
    id: slugify(normalizedName || "nowe-pytanie"),
    name: normalizedName,
    description: formState.description.trim(),
    categories,
    ...(images.length ? { images } : {}),
    ...(links.length ? { links } : {}),
  };
}

function getQuestionStatusBorderStyle(question) {
  const colors = [];

  if (question.isImportant) {
    colors.push(questionStatusBorderColors.important);
  }

  if (question.isHard) {
    colors.push(questionStatusBorderColors.hard);
  }

  if (question.isLearned) {
    colors.push(questionStatusBorderColors.learned);
  }

  const borderGradient = colors.length
    ? `linear-gradient(135deg, ${colors.join(", ")})`
    : neutralQuestionBorder;

  return {
    "--status-border": borderGradient,
  };
}

function withUniqueId(question, existingQuestions) {
  const existingIds = new Set(existingQuestions.map((entry) => entry.id));

  if (!existingIds.has(question.id)) {
    return question;
  }

  let counter = 2;
  let nextId = `${question.id}-${counter}`;

  while (existingIds.has(nextId)) {
    counter += 1;
    nextId = `${question.id}-${counter}`;
  }

  return { ...question, id: nextId };
}

function MarkdownBlock({ content }) {
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
  );
}

function extractAnswerText(data) {
  return (
    data.candidates?.[0]?.content?.parts
      ?.map((part) => part.text ?? "")
      .join("\n")
      .trim() ?? ""
  );
}

function QuestionResources({ images, links, onOpenImageViewer }) {
  if (!images.length && !links.length) {
    return null;
  }

  return (
    <div className="question-resources">
      {images.length > 0 && (
        <section className="resource-section">
          <p className="side-panel__label">Obrazy</p>
          <div className="image-grid">
            {images.map((image, index) => (
              <figure key={image.src} className="image-card">
                <button
                  type="button"
                  className="image-card__button"
                  onClick={() => onOpenImageViewer(index)}
                  aria-label={`Otworz obraz: ${image.alt}`}
                >
                  <img
                    src={image.src}
                    alt={image.alt}
                    loading="lazy"
                    decoding="async"
                  />
                </button>
                <figcaption>{image.alt}</figcaption>
              </figure>
            ))}
          </div>
        </section>
      )}

      {links.length > 0 && (
        <section className="resource-section">
          <p className="side-panel__label">Linki</p>
          <ul className="resource-links">
            {links.map((link) => (
              <li key={`${link.label}-${link.href}`}>
                <a href={link.href} target="_blank" rel="noreferrer noopener">
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function ImageViewer({ image, index, total, onClose, onNext, onPrevious }) {
  return (
    <div
      className="modal-backdrop modal-backdrop--viewer"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <section
        className="image-viewer"
        role="dialog"
        aria-modal="true"
        aria-label="Podglad obrazu"
      >
        <div className="image-viewer__topbar">
          <p className="image-viewer__counter">
            {index + 1} / {total}
          </p>

          <button
            type="button"
            className="ghost-button ghost-button--icon"
            onClick={onClose}
            aria-label="Zamknij viewer"
          >
            Zamknij
          </button>
        </div>

        <div className="image-viewer__content">
          {total > 1 && (
            <button
              type="button"
              className="viewer-nav viewer-nav--previous"
              onClick={onPrevious}
              aria-label="Poprzedni obraz"
            >
              ‹
            </button>
          )}

          <figure className="image-viewer__figure">
            <img src={image.src} alt={image.alt} />
            <figcaption>{image.alt}</figcaption>
          </figure>

          {total > 1 && (
            <button
              type="button"
              className="viewer-nav viewer-nav--next"
              onClick={onNext}
              aria-label="Nastepny obraz"
            >
              ›
            </button>
          )}
        </div>
      </section>
    </div>
  );
}

function PromptCard({ promptEntry, copyStatus, onCopy }) {
  const isCopyDisabled = promptEntry.isAvailable === false;

  return (
    <article className="prompt-card">
      <div className="prompt-card__header">
        <div>
          <p className="question-card__eyebrow">Prompt do rozmowy</p>
          <h3>{promptEntry.label}</h3>
        </div>

        <button
          type="button"
          className="primary-button"
          disabled={isCopyDisabled}
          onClick={() => onCopy(promptEntry.id, promptEntry.prompt)}
        >
          {isCopyDisabled
            ? "Brak pytan"
            : copyStatus === "copied"
            ? "Skopiowano"
            : copyStatus === "failed"
              ? "Sprobuj ponownie"
              : "Kopiuj prompt"}
        </button>
      </div>

      <p className="prompt-card__description">{promptEntry.description}</p>

      <div className="prompt-card__scope">
        <p className="side-panel__label">Scope pytan</p>
        <ul>
          {promptEntry.scope.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </div>

      <div className="prompt-card__prompt">
        <p className="side-panel__label">Gotowy prompt</p>
        <pre>{promptEntry.prompt}</pre>
      </div>
    </article>
  );
}

function StatusPill({ active, label, tone, onClick }) {
  const className = `status-pill status-pill--${tone} ${active ? "is-active" : ""}`;

  if (onClick) {
    return (
      <button
        type="button"
        className={className}
        onClick={onClick}
        aria-pressed={active}
      >
        {label}
      </button>
    );
  }

  return <span className={className}>{label}</span>;
}

function QuestionStatusControls({ question, onToggleFlag }) {
  return (
    <div className="status-controls" aria-label="Znaczniki pytania">
      <StatusPill
        active={question.isImportant}
        label="Wazne"
        tone="important"
        onClick={() => onToggleFlag(question.id, "isImportant")}
      />
      <StatusPill
        active={question.isHard}
        label="Trudne"
        tone="hard"
        onClick={() => onToggleFlag(question.id, "isHard")}
      />
      <StatusPill
        active={question.isLearned}
        label="Nauczone"
        tone="learned"
        onClick={() => onToggleFlag(question.id, "isLearned")}
      />
    </div>
  );
}

function QuestionStatusBadges({ question }) {
  if (!question.isImportant && !question.isHard && !question.isLearned) {
    return null;
  }

  return (
    <div className="status-badges" aria-label="Aktywne znaczniki pytania">
      {question.isImportant && (
        <StatusPill active label="Wazne" tone="important" />
      )}
      {question.isHard && <StatusPill active label="Trudne" tone="hard" />}
      {question.isLearned && (
        <StatusPill active label="Nauczone" tone="learned" />
      )}
    </div>
  );
}

function QuestionCard({
  question,
  isExpanded,
  onAskAi,
  onOpenImageViewer,
  onToggle,
  onToggleFlag,
}) {
  return (
    <article
      className={`question-card status-surface ${isExpanded ? "is-expanded" : ""}`}
      style={getQuestionStatusBorderStyle(question)}
    >
      <div className="question-card__summary">
        <div className="question-card__header">
          <p className="question-card__eyebrow">Pytanie</p>
          <h3>{question.name}</h3>

          <div className="tag-row tag-row--compact">
            {question.categories.map((category) => (
              <span key={category} className="tag-pill">
                {category}
              </span>
            ))}
          </div>

          <QuestionStatusControls
            question={question}
            onToggleFlag={onToggleFlag}
          />
        </div>

        <div className="question-card__actions">
          <button
            type="button"
            className="ghost-button"
            onClick={() => onAskAi(question)}
          >
            Dopytaj AI
          </button>

          <button
            type="button"
            className={`chevron-button ${isExpanded ? "is-expanded" : ""}`}
            onClick={() => onToggle(question.id)}
            aria-expanded={isExpanded}
            aria-controls={`question-details-${question.id}`}
            aria-label={isExpanded ? "Zwin odpowiedz" : "Rozwin odpowiedz"}
          >
            <span className="chevron-icon" aria-hidden="true" />
          </button>
        </div>
      </div>

      {isExpanded && (
        <div id={`question-details-${question.id}`} className="question-card__body">
          <div className="markdown-body">
            <MarkdownBlock content={question.description} />
          </div>

          <QuestionResources
            images={question.images}
            links={question.links}
            onOpenImageViewer={(imageIndex) =>
              onOpenImageViewer(question, imageIndex)
            }
          />
        </div>
      )}
    </article>
  );
}

export default function App() {
  const [activeView, setActiveView] = useState("list");
  const [questions, setQuestions] = useState(loadInitialQuestions);
  const [selectedCategory, setSelectedCategory] = useState("Wszystkie");
  const [search, setSearch] = useState("");
  const [flashcardIndex, setFlashcardIndex] = useState(0);
  const [flashcardFilters, setFlashcardFilters] = useState({
    importantOnly: false,
    hardOnly: false,
    skipLearned: false,
  });
  const [showAnswer, setShowAnswer] = useState(false);
  const [formState, setFormState] = useState(initialForm);
  const [copyState, setCopyState] = useState("idle");
  const [promptCopyState, setPromptCopyState] = useState({
    id: "",
    status: "idle",
  });
  const [formMessage, setFormMessage] = useState("");
  const [expandedQuestions, setExpandedQuestions] = useState(() => new Set());
  const [aiQuestion, setAiQuestion] = useState(null);
  const [aiFollowUp, setAiFollowUp] = useState("");
  const [aiAnswer, setAiAnswer] = useState("");
  const [aiError, setAiError] = useState("");
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [imageViewer, setImageViewer] = useState(null);

  const allCategories = [
    "Wszystkie",
    ...Array.from(
      new Set(questions.flatMap((question) => question.categories)),
    ).sort((left, right) => left.localeCompare(right)),
  ];

  const filteredQuestions = questions.filter((question) => {
    const matchesCategory =
      selectedCategory === "Wszystkie" ||
      question.categories.includes(selectedCategory);
    const haystack = [
      question.name,
      question.description,
      question.categories.join(" "),
      question.links.map((link) => `${link.label} ${link.href}`).join(" "),
    ]
      .join(" ")
      .toLowerCase();
    const matchesSearch = haystack.includes(search.toLowerCase().trim());

    return matchesCategory && matchesSearch;
  });

  const promptEntries = [
    buildQuestionScopedPromptEntry({
      id: "important",
      label: "Wazne",
      emptyLabel: "wazne",
      areaName: "pytan oznaczonych jako wazne w mojej aplikacji",
      questions: questions.filter((question) => question.isImportant),
    }),
    buildQuestionScopedPromptEntry({
      id: "hard",
      label: "Trudne",
      emptyLabel: "trudne",
      areaName: "pytan oznaczonych jako trudne w mojej aplikacji",
      questions: questions.filter((question) => question.isHard),
    }),
    ...staticAiCoachPrompts,
  ];

  const flashcardQuestions = filteredQuestions.filter((question) => {
    if (flashcardFilters.importantOnly && !question.isImportant) {
      return false;
    }

    if (flashcardFilters.hardOnly && !question.isHard) {
      return false;
    }

    if (flashcardFilters.skipLearned && question.isLearned) {
      return false;
    }

    return true;
  });

  const flashcard = flashcardQuestions[flashcardIndex] ?? null;
  const previewObject = withUniqueId(buildQuestionObject(formState), questions);
  const previewJson = JSON.stringify(previewObject, null, 2);
  const canSubmit =
    previewObject.name.length > 0 &&
    previewObject.description.length > 0 &&
    previewObject.categories.length > 0;

  useEffect(() => {
    if (flashcardIndex > flashcardQuestions.length - 1) {
      setFlashcardIndex(0);
    }
  }, [flashcardQuestions.length, flashcardIndex]);

  useEffect(() => {
    setShowAnswer(false);
  }, [
    activeView,
    flashcardIndex,
    selectedCategory,
    search,
    flashcardFilters.importantOnly,
    flashcardFilters.hardOnly,
    flashcardFilters.skipLearned,
  ]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const flagsByQuestionId = questions.reduce((accumulator, question) => {
      if (question.isImportant || question.isHard || question.isLearned) {
        accumulator[question.id] = {
          isImportant: question.isImportant,
          isHard: question.isHard,
          isLearned: question.isLearned,
        };
      }

      return accumulator;
    }, {});

    try {
      window.localStorage.setItem(
        questionFlagsStorageKey,
        JSON.stringify(flagsByQuestionId),
      );
    } catch {
      // Ignore local persistence errors and keep the in-memory state.
    }
  }, [questions]);

  useEffect(() => {
    if (!aiQuestion && !imageViewer) {
      return undefined;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function handleEscape(event) {
      if (event.key === "Escape" && imageViewer) {
        setImageViewer(null);
        return;
      }

      if (event.key === "Escape" && !isAiLoading && aiQuestion) {
        setAiQuestion(null);
      }

      if (!imageViewer) {
        return;
      }

      if (event.key === "ArrowRight") {
        setImageViewer((current) => {
          if (!current || current.images.length <= 1) {
            return current;
          }

          return {
            ...current,
            index: (current.index + 1) % current.images.length,
          };
        });
      }

      if (event.key === "ArrowLeft") {
        setImageViewer((current) => {
          if (!current || current.images.length <= 1) {
            return current;
          }

          return {
            ...current,
            index:
              current.index === 0
                ? current.images.length - 1
                : current.index - 1,
          };
        });
      }
    }

    window.addEventListener("keydown", handleEscape);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleEscape);
    };
  }, [aiQuestion, imageViewer, isAiLoading]);

  function updateField(event) {
    const { name, value } = event.target;
    setFormState((current) => ({ ...current, [name]: value }));
    setCopyState("idle");
    setFormMessage("");
  }

  async function copyJsonSnippet() {
    try {
      await navigator.clipboard.writeText(previewJson);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
  }

  async function copyPromptSnippet(promptId, promptText) {
    try {
      await navigator.clipboard.writeText(promptText);
      setPromptCopyState({ id: promptId, status: "copied" });
    } catch {
      setPromptCopyState({ id: promptId, status: "failed" });
    }
  }

  function addQuestionToSession() {
    if (!canSubmit) {
      setFormMessage("Uzupelnij nazwe, opis i przynajmniej jedna kategorie.");
      return;
    }

    const nextQuestion = normalizeQuestion(
      withUniqueId(buildQuestionObject(formState), questions),
    );
    setQuestions((current) => [nextQuestion, ...current]);
    setFormState(initialForm);
    setSelectedCategory("Wszystkie");
    setSearch("");
    setFlashcardIndex(0);
    setActiveView("list");
    setFormMessage(
      `Dodano "${nextQuestion.name}" do aktualnej sesji. Zrodlem prawdy nadal pozostaje plik JSON.`,
    );
    setCopyState("idle");
  }

  function showPreviousFlashcard() {
    if (!flashcardQuestions.length) {
      return;
    }

    setFlashcardIndex((current) =>
      current === 0 ? flashcardQuestions.length - 1 : current - 1,
    );
  }

  function showNextFlashcard() {
    if (!flashcardQuestions.length) {
      return;
    }

    setFlashcardIndex((current) =>
      current === flashcardQuestions.length - 1 ? 0 : current + 1,
    );
  }

  function drawRandomFlashcard() {
    if (flashcardQuestions.length <= 1) {
      return;
    }

    const randomOffset = Math.floor(
      Math.random() * (flashcardQuestions.length - 1),
    );
    const nextIndex =
      randomOffset >= flashcardIndex ? randomOffset + 1 : randomOffset;

    setFlashcardIndex(nextIndex);
  }

  function toggleFlashcardFilter(filterKey) {
    setFlashcardFilters((current) => ({
      ...current,
      [filterKey]: !current[filterKey],
    }));
    setFlashcardIndex(0);
  }

  function toggleQuestion(questionId) {
    setExpandedQuestions((current) => {
      const next = new Set(current);

      if (next.has(questionId)) {
        next.delete(questionId);
      } else {
        next.add(questionId);
      }

      return next;
    });
  }

  function toggleQuestionFlag(questionId, flagKey) {
    setQuestions((current) =>
      current.map((question) =>
        question.id === questionId
          ? { ...question, [flagKey]: !question[flagKey] }
          : question,
      ),
    );
  }

  function openAiModal(question) {
    setAiQuestion(question);
    setAiFollowUp("");
    setAiAnswer("");
    setAiError("");
    setIsAiLoading(false);
  }

  function closeAiModal() {
    if (isAiLoading) {
      return;
    }

    setAiQuestion(null);
  }

  function openImageViewer(question, imageIndex) {
    if (!question.images.length) {
      return;
    }

    setImageViewer({
      questionId: question.id,
      questionName: question.name,
      images: question.images,
      index: imageIndex,
    });
  }

  function closeImageViewer() {
    setImageViewer(null);
  }

  function showPreviousImage() {
    setImageViewer((current) => {
      if (!current || current.images.length <= 1) {
        return current;
      }

      return {
        ...current,
        index:
          current.index === 0
            ? current.images.length - 1
            : current.index - 1,
      };
    });
  }

  function showNextImage() {
    setImageViewer((current) => {
      if (!current || current.images.length <= 1) {
        return current;
      }

      return {
        ...current,
        index: (current.index + 1) % current.images.length,
      };
    });
  }

  async function askAiAboutQuestion() {
    if (!aiQuestion) {
      return;
    }

    if (!geminiApiKey) {
      setAiError(
        "Brak konfiguracji AI. Dodaj VITE_GEMINI_API_KEY w pliku .env.local, aby wlaczyc odpowiedzi Gemini.",
      );
      setAiAnswer("");
      return;
    }

    setIsAiLoading(true);
    setAiError("");
    setAiAnswer("");

    const followUp = aiFollowUp.trim() || "Rozwin ten temat prostym jezykiem.";
    const systemPrompt =
      "Jestes mentorem frontendowym. Odpowiadasz po polsku prostym, konkretnym jezykiem. Najpierw wyjasnij intuicje, potem rozwin praktyke, pokaz typowe bledy rekrutacyjne i zakoncz 2-3 pytaniami sprawdzajacymi. Korzystaj tylko z kontekstu pytania i doprecyzowania uzytkownika.";
    const userPrompt = [
      `Temat: ${aiQuestion.name}`,
      `Kategorie: ${aiQuestion.categories.join(", ")}`,
      `Material bazowy: ${aiQuestion.description}`,
      `Doprecyzowanie uzytkownika: ${followUp}`,
    ].join("\n\n");

    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiApiKey}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            systemInstruction: {
              parts: [{ text: systemPrompt }],
            },
            contents: [
              {
                parts: [{ text: userPrompt }],
              },
            ],
          }),
        },
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error?.message || "Nie udalo sie pobrac odpowiedzi.");
      }

      const text = extractAnswerText(data);

      if (!text) {
        throw new Error("Gemini nie zwrocilo tresci odpowiedzi.");
      }

      setAiAnswer(text);
    } catch (error) {
      setAiError(
        error instanceof Error
          ? error.message
          : "Wystapil nieoczekiwany blad przy pytaniu do AI.",
      );
    } finally {
      setIsAiLoading(false);
    }
  }

  return (
    <div className="page-shell">
      <div className="background-orb background-orb--left" />
      <div className="background-orb background-orb--right" />

      <div className="app-shell">
        <header className="topbar">
          <div>
            <p className="eyebrow">Frontend interview knowledge base</p>
            <h1>Questions App</h1>
          </div>

          <nav className="navbar" aria-label="Glowne sekcje">
            {views.map((view) => (
              <button
                key={view.id}
                type="button"
                className={`nav-link ${activeView === view.id ? "is-active" : ""}`}
                onClick={() => setActiveView(view.id)}
              >
                {view.label}
              </button>
            ))}
          </nav>
        </header>

        {activeView !== "prompts" && (
          <section className="toolbar">
            <label className="search-field">
              <span>Szukaj</span>
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="np. useEffect, event loop, specificity"
              />
            </label>

            <div className="filter-group">
              {allCategories.map((category) => (
                <button
                  key={category}
                  type="button"
                  className={`filter-pill ${selectedCategory === category ? "is-active" : ""}`}
                  onClick={() => setSelectedCategory(category)}
                >
                  {category}
                </button>
              ))}
            </div>
          </section>
        )}

        {activeView === "list" && (
          <section>
            <div className="question-list">
              {filteredQuestions.length ? (
                filteredQuestions.map((question) => (
                  <QuestionCard
                    key={question.id}
                    question={question}
                    isExpanded={expandedQuestions.has(question.id)}
                    onAskAi={openAiModal}
                    onOpenImageViewer={openImageViewer}
                    onToggle={toggleQuestion}
                    onToggleFlag={toggleQuestionFlag}
                  />
                ))
              ) : (
                <article className="empty-state">
                  <h3>Brak wynikow</h3>
                  <p>
                    Zmien filtr kategorii albo fraze wyszukiwania. Obecny model
                    danych zostaje bez zmian, tylko zawiezily sie wyniki.
                  </p>
                </article>
              )}
            </div>
          </section>
        )}

        {activeView === "flashcards" && (
          <section className="flashcards-layout">
            <div className="flashcard-meta">
              <p className="flashcard-meta__label">Tryb nauki</p>
              <h2>Fiszki z tych samych danych</h2>
              <p>
                Przod karty to `name`, tyl to markdown z `description`. Jeden
                obiekt danych obsluguje oba widoki.
              </p>
              <div className="flashcard-meta__actions">
                <button
                  type="button"
                  className="primary-button flashcard-meta__button"
                  onClick={drawRandomFlashcard}
                  disabled={flashcardQuestions.length <= 1}
                >
                  Losuj
                </button>
              </div>

              <div className="flashcard-meta__filters">
                <p className="side-panel__label">Filtruj pule kart</p>
                <div className="status-filter-group">
                  <StatusPill
                    active={flashcardFilters.importantOnly}
                    label="Tylko wazne"
                    tone="important"
                    onClick={() => toggleFlashcardFilter("importantOnly")}
                  />
                  <StatusPill
                    active={flashcardFilters.hardOnly}
                    label="Tylko trudne"
                    tone="hard"
                    onClick={() => toggleFlashcardFilter("hardOnly")}
                  />
                  <StatusPill
                    active={flashcardFilters.skipLearned}
                    label="Pomijaj nauczone"
                    tone="learned"
                    onClick={() => toggleFlashcardFilter("skipLearned")}
                  />
                </div>
              </div>
            </div>

            {flashcard ? (
              <article
                className={`flashcard status-surface ${showAnswer ? "is-revealed" : ""}`}
                style={getQuestionStatusBorderStyle(flashcard)}
              >
                <div className="flashcard__face">
                  <p className="flashcard__counter">
                    {flashcardIndex + 1} / {flashcardQuestions.length}
                  </p>
                  <div className="tag-row">
                    {flashcard.categories.map((category) => (
                      <span key={category} className="tag-pill">
                        {category}
                      </span>
                    ))}
                  </div>
                  <QuestionStatusBadges question={flashcard} />
                  <h3>{flashcard.name}</h3>
                  {showAnswer ? (
                    <>
                      <div className="markdown-body">
                        <MarkdownBlock content={flashcard.description} />
                      </div>

                      <QuestionResources
                        images={flashcard.images}
                        links={flashcard.links}
                        onOpenImageViewer={(imageIndex) =>
                          openImageViewer(flashcard, imageIndex)
                        }
                      />
                    </>
                  ) : (
                    <p className="flashcard__hint">
                      Sprobuj odpowiedziec samodzielnie, a potem odslon tyl
                      fiszki.
                    </p>
                  )}
                </div>

                <div className="flashcard-controls">
                  <button type="button" onClick={showPreviousFlashcard}>
                    Poprzednia
                  </button>
                  <button
                    type="button"
                    className="primary-button"
                    onClick={() => setShowAnswer((current) => !current)}
                  >
                    {showAnswer ? "Ukryj odpowiedz" : "Pokaz odpowiedz"}
                  </button>
                  <button type="button" onClick={showNextFlashcard}>
                    Nastepna
                  </button>
                </div>
              </article>
            ) : (
              <article className="empty-state">
                <h3>Nie ma kart do wyswietlenia</h3>
                <p>
                  Ten widok korzysta z aktualnych filtrow kategorii, wyszukiwania
                  oraz znacznikow `Wazne`, `Trudne` i `Nauczone`. Rozszerz filtry
                  albo oznacz wiecej pytan.
                </p>
              </article>
            )}
          </section>
        )}

        {activeView === "prompts" && (
          <section className="prompt-library">
            <article className="prompt-library__intro">
              <p className="side-panel__label">Prompty AI</p>
              <h2>Gotowe prompty do rozmowy z agentem AI</h2>
              <p>
                Wklej prompt do ChatGPT, Gemini albo innego agenta i potraktuj
                go jak rozmowe techniczna. Kazdy prompt pilnuje scope, wymaga
                poprawiania odpowiedzi i ma utrwalac wiedze, a nie tylko podawac
                definicje. Prompty `Wazne` i `Trudne` buduja sie automatycznie z
                pytan oznaczonych w aplikacji.
              </p>
            </article>

            <div className="prompt-grid">
              {promptEntries.map((promptEntry) => {
                const copyStatus =
                  promptCopyState.id === promptEntry.id
                    ? promptCopyState.status
                    : "idle";

                return (
                  <PromptCard
                    key={promptEntry.id}
                    promptEntry={promptEntry}
                    copyStatus={copyStatus}
                    onCopy={copyPromptSnippet}
                  />
                );
              })}
            </div>
          </section>
        )}

        {activeView === "add" && (
          <section className="editor-layout">
            <div className="editor-panel">
              <div className="editor-panel__header">
                <p className="side-panel__label">Dodawanie do duzego JSON-a</p>
                <h2>Formularz generuje poprawny obiekt</h2>
                <p>
                  Bez backendu najwygodniej trzymac jeden shape danych i z niego
                  skladac liste, fiszki i podglad markdowna.
                </p>
              </div>

              <label className="editor-field">
                <span>Nazwa pytania</span>
                <input
                  type="text"
                  name="name"
                  value={formState.name}
                  onChange={updateField}
                  placeholder="np. Czym rozni sie useEffect od useLayoutEffect?"
                />
              </label>

              <label className="editor-field">
                <span>Kategorie</span>
                <input
                  type="text"
                  name="categories"
                  value={formState.categories}
                  onChange={updateField}
                  placeholder="javascript, react, architecture"
                />
              </label>

              <label className="editor-field">
                <span>Opis w markdownie</span>
                <textarea
                  name="description"
                  value={formState.description}
                  onChange={updateField}
                  rows={16}
                />
              </label>

              <label className="editor-field">
                <span>Obrazy</span>
                <textarea
                  name="images"
                  value={formState.images}
                  onChange={updateField}
                  rows={4}
                  placeholder={"/images/event-loop.webp | Diagram event loop\n/images/useeffect-flow.png | Cykl zycia useEffect"}
                />
              </label>

              <label className="editor-field">
                <span>Linki</span>
                <textarea
                  name="links"
                  value={formState.links}
                  onChange={updateField}
                  rows={4}
                  placeholder={"MDN Event Loop | https://developer.mozilla.org/...\nYouTube wyjasnienie | https://www.youtube.com/watch?v=..."}
                />
              </label>

              <div className="editor-actions">
                <button
                  type="button"
                  className="primary-button"
                  onClick={addQuestionToSession}
                >
                  Dodaj do sesji
                </button>
                <button type="button" onClick={copyJsonSnippet}>
                  {copyState === "copied"
                    ? "Skopiowano JSON"
                    : "Kopiuj JSON"}
                </button>
              </div>

              <p className="editor-note">
                {formMessage ||
                  "Formularz dodaje wpis do aktualnej sesji w przegladarce. Dla obrazow wrzucaj pliki do folderu public/images i podawaj sciezki zaczynajace sie od /images/."}
              </p>
              {copyState === "failed" && (
                <p className="editor-note">
                  Nie udalo sie skopiowac do schowka. Nadal mozesz zaznaczyc
                  gotowy obiekt recznie.
                </p>
              )}
            </div>

            <div className="preview-panel">
              <div className="preview-card">
                <p className="side-panel__label">Podglad JSON</p>
                <pre>{previewJson}</pre>
              </div>

              <div className="preview-card">
                <p className="side-panel__label">Podglad markdowna</p>
                <div className="markdown-body">
                  <MarkdownBlock content={previewObject.description} />
                </div>
              </div>
            </div>
          </section>
        )}
      </div>

      {aiQuestion && (
        <div
          className="modal-backdrop"
          role="presentation"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              closeAiModal();
            }
          }}
        >
          <section
            className="ai-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="ai-modal-title"
          >
            <div className="ai-modal__header">
              <div>
                <p className="side-panel__label">Dopytaj AI</p>
                <h2 id="ai-modal-title">{aiQuestion.name}</h2>
              </div>

              <button
                type="button"
                className="ghost-button ghost-button--icon"
                onClick={closeAiModal}
                aria-label="Zamknij modal"
              >
                Zamknij
              </button>
            </div>

            <div className="tag-row tag-row--compact">
              {aiQuestion.categories.map((category) => (
                <span key={category} className="tag-pill">
                  {category}
                </span>
              ))}
            </div>

            <div className="ai-modal__context">
              <p className="side-panel__label">Baza pytania</p>
              <div className="markdown-body">
                <MarkdownBlock content={aiQuestion.description} />
              </div>
            </div>

            <label className="editor-field">
              <span>Dopisz swoje pytanie</span>
              <textarea
                value={aiFollowUp}
                onChange={(event) => setAiFollowUp(event.target.value)}
                rows={5}
                placeholder="Np. wytlumacz to na prostym przykladzie albo porownaj z useLayoutEffect."
              />
            </label>

            <div className="ai-modal__actions">
              <button
                type="button"
                className="primary-button"
                onClick={askAiAboutQuestion}
                disabled={isAiLoading}
              >
                {isAiLoading ? "Gemini odpowiada..." : "Zapytaj AI"}
              </button>

              {!geminiApiKey && (
                <p className="editor-note">
                  Aby to uruchomic, ustaw `VITE_GEMINI_API_KEY` w `.env.local`.
                </p>
              )}
            </div>

            {aiError && <p className="ai-status ai-status--error">{aiError}</p>}

            {(aiAnswer || isAiLoading) && (
              <div className="ai-answer">
                <p className="side-panel__label">Odpowiedz</p>

                {isAiLoading ? (
                  <p className="ai-status">Trwa generowanie odpowiedzi...</p>
                ) : (
                  <div className="markdown-body">
                    <MarkdownBlock content={aiAnswer} />
                  </div>
                )}
              </div>
            )}
          </section>
        </div>
      )}

      {imageViewer && (
        <ImageViewer
          image={imageViewer.images[imageViewer.index]}
          index={imageViewer.index}
          total={imageViewer.images.length}
          onClose={closeImageViewer}
          onNext={showNextImage}
          onPrevious={showPreviousImage}
        />
      )}
    </div>
  );
}
