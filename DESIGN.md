# Trazum design system

**Status: approved.** The user selected acid neobrutalism after comparing complete visual directions. The rejected geometric logo must not return.

## Direction: restrained acid neobrutalism

Warm paper, dark ink, structural borders, emphatic grotesk typography, and acid yellow used for active navigation, primary actions, and select focal information. The surface stays rigorous and readable. No playful stickers, decorative geometry, gradients, nested cards, or colored noise.

## Surface modes

- Application: Operate. Persistent navigation, generous task heading, explicit input and report boundaries. The bill remains the default entry.
- Landing: Persuade. Large editorial headline, factual worked examples, strong horizontal rules and distinct calls to action.
- Playground: Operate. Dark terminal using the same wordmark, typography and acid prompt.
- Loading and metadata: the same typographic identity.

## Tokens

| Role | Light | Dark |
| --- | --- | --- |
| Canvas | #f6f4ec | #1c211b |
| Raised | #fbf9f1 | #242a21 |
| Sunken | #eeeee0 | #2c3227 |
| Text | #20231e | #f0f1e5 |
| Secondary | #555a4f | #c0c6af |
| Muted text | #5b6053 | #bac2a8 |
| Rule | #999f8a | #67715c |
| Strong rule | #20231e | #aab39a |
| Primary fill | #dce94d | #dce94d |
| Accent text | #526014 | #dce94d |
| Accent wash | #e9edce | #343c20 |

The yellow is a fill, never low-contrast text on light paper. Legacy `terracotta` utility names remain compatible aliases for accessible accent text and charts. Success, caution and error retain distinct semantic treatments.

## Typography

Self-hosted Space Grotesk Variable for wordmark, headings and interface. This replaces Fraunces because the approved direction requires a strong grotesk rather than an editorial serif. Existing monospace stack remains for code, measurements and log input. Headings use tracking no smaller than -0.04em; numerical data use tabular figures. Fonts are served locally under the existing CSP.

## Identity

The complete Trazum name leads in application, marketing, terminal and loading screen. A plain T is used only where the full wordmark cannot fit, such as the collapsed rail and favicon. No standalone abstract symbol.

## Outside the web app

The README's three pictures, the extension's icon and the web app's icon files are drawn by scripts, and all of them take their colours and the T from `scripts/brand.mjs`. That file holds no value of its own: `brand.test.js` fails when one of its colours is not in `globals.css`, when its T is not `icon.svg`'s, or when a picture carries a colour it does not name. The two terminal pictures use the dark tokens in both schemes, as the Playground does, and colour each line the way the CLI colours it; the theme maps the CLI's green, yellow and red to the dark theme's good, caution and error, and its cyan to the acid fill.

Icons: `favicon.ico` (16, 32, 48), a 180px Apple touch icon, 192px and 512px manifest icons and a 512px maskable one. The two that a device cuts to its own shape are full-bleed, with no border to slice through.

## Site shell

- Addresses: `/` is the landing, `/app` the application. `/?tab=` and `/landing` redirect (308) and are never linked. Entries live in `apps/web/lib/site.ts`; a page that does not exist yet links its GitHub copy.
- Header: one 72px bar with a 2px rule under it. Full wordmark home, then the entries, then language, appearance, GitHub and the one primary action into the dashboard, in that order. Below 1280px: wordmark, GitHub mark and a Menu button opening a disclosure panel in the page flow, not a dialog; Escape closes it.
- GitHub button: the mark drawn inline (no request to GitHub), 2px border on paper, never acid; its name says GitHub and that it opens a new tab. Mark alone only where the word cannot fit. The same component in the header, the footer, the landing and the rail.
- Primary action: acid fill, 2px ink border, 3px hard offset, an arrow. One per region.
- Footer: paper, 2px rule above, wordmark, one line, the GitHub button, and two link groups (product, project).
- Sections: full-width bands separated by 2px rules, alternating paper and layer; one ink band per page at most. No card inside a band except the one figure the band is about.
- Social card: 1200 by 630, paper and ink with the page's title, the illustrative bill in the dark tokens, the command in the acid fill; colours from `scripts/brand.mjs` only.

## Documentation (Read mode)

- Surface: `/docs` is the index and `/docs/<slug>` one document. Read, not Operate or Persuade: the document is the page and everything else steps back. Content is the repository's own file, drawn from a tree, never HTML.
- Index: ink-on-paper title at display size, one large search field, the repository's task table, then one band per reader goal, alternating paper and layer, each a rule-separated list of title and one-sentence description. The last band says what is kept out and links it on GitHub. No cards.
- Page: three columns from 1280px (documents 256px, text, contents 240px); two from 1024px, contents becoming a disclosure; one below, both lists being disclosures above the text. Sidebar and contents are sticky and scroll on their own. Active document and active heading take the acid fill; nothing else on the page is acid.
- Text: Space Grotesk at 16.5px on 1.72, measure 78ch. Headings in the display face; h2 sits on a 2px rule with 60px above it, h3 and h4 do not. The document's own `#` is the page title. A heading's `#` permalink shows on hover only.
- Code and measurements: the mono stack. A fenced block is a 2px box on the sunken ground with its language in an ink tab; it scrolls inside itself, takes keyboard focus and shows a 3px focus ring. A table wider than the column scrolls inside a box with 2px rules above and below, column heads in small mono capitals. Neither ever scrolls the page, at 390px included.
- Links: accent text, underlined; a link that leaves the site carries an arrow that is not read aloud. A badge image from another host is not loaded: it is its description, as a link.
- Disclosures from the document (`<details>`) are real ones, open when they hold the page's headings; a link to a heading inside a closed one opens it.
- Language: the shell is in every site language; the document stays English, is marked `lang="en"`, and the page says so in the reader's language.

## Layout and controls

Desktop rail: 252px, collapsible to 72px. Below 1024px: existing accessible drawer and compact brand bar. Task headings range from 38px to 56px. Strong 2px borders identify working regions; thinner rules separate data rows. No rounded card language. Cards inside cards reduce to section rules and transparent backgrounds.

Primary buttons and active navigation may carry a 3px hard offset shadow. Passive content does not. Native focus indicators remain obvious. Import areas have clear hover and focus states. Application and marketing preserve all reviewed locales and real product claims.

## Appearance preference

The rail offers Light, Dark and System (localized in English and Spanish). System is the default. Explicit choice persists under `trazum:theme`; a nonce-authorized bootstrap applies it before paint. Blocked storage falls back safely to the system theme. Native controls and Tailwind dark variants follow the resolved `data-theme` value.

## Motion and states

Existing ledger-fill remains the landing's authored motion. Short color transitions and a one-pixel press on primary actions. No invisible-on-scroll content. Reduced motion, loading, empty, error, session, locale and report states remain functional.

## Process and evidence

The optional Impeccable engine could not initialize in the sandbox. No engine-generated selection or detector results are claimed. User explicitly approved the acid neobrutalist direction from the standalone comparison. Root performs browser verification across desktop and mobile before delivery.
