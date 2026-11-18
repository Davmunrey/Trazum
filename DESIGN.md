# Trazum design system

**Status: approved.** The user selected acid neobrutalism after comparing complete visual directions. The rejected geometric logo must not return.

## Direction: restrained acid neobrutalism

Warm paper, dark ink, structural borders, emphatic grotesk typography, and acid yellow used for active navigation, primary actions, and select focal information. The surface stays rigorous and readable. No playful stickers, decorative geometry, gradients, nested cards, or colored noise.

## Surface modes

- Application: Operate. Persistent navigation, generous task heading, explicit input and report boundaries. The bill remains the default entry.
- Landing: Persuade. Large editorial headline, the product told by scroll on a drawn laptop ("Landing: the story told by scrolling"), strong horizontal rules and distinct calls to action.
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

## Terminal

What the CLI prints on a terminal follows the same rules, drawn by one module, `packages/cli/src/style.ts` (#758). The commands hand it sentences and rows; it decides colour, width and order.

- **One hierarchy.** The question as a heading ruled out to the width, and the figure that answers it on the line under it; then the breakdown; then the notes and what to do next. A reader who stops after three lines has the answer.
- **Ink and paper are the reader's.** A terminal's foreground and ground are its owner's and the CLI cannot see which, so it never paints a foreground that reads on only one of them.
- **The mark.** The answering figure is set in ink (#20231e) on the acid ground (#dce94d), bold, once per report. It reads on a light terminal and a dark one alike. Nothing else is acid.
- **The accent** (#70831b) is what points: the filled cells of a share bar and a lever's arrow. It is not the page's accent text. The page knows its ground and changes the accent with it (#526014 on paper, the acid on the dark canvas); a terminal cannot tell its own ground, so its accent is one colour that has to hold on both. #70831b is the brand's olive, same hue and saturation as #526014, at the lightness that keeps 3.5:1 or more on paper, white and the dark grounds, where #526014 fell to about 2.4:1.
- **States** keep the terminal's own green, yellow and red at every depth, because its theme tunes those to its ground. Meaning is never carried by colour alone: every state is also a word or a mark (`!` caution, `?` assumption, `→` lever, `OK`, `OVER`), and a caveat paints its mark, not its sentence.
- **Depth.** True colour where `COLORTERM` says so; the nearest of the fixed 256 (cube and greys, 16 to 255, by distance in RGB: acid 185, ink 234, accent 64) where `TERM` says 256; the 16 otherwise, where the mark is black on yellow (`30;43`) and the accent cyan, the one colour of the 16 no state uses; nothing for `NO_COLOR`, `TERM=dumb`, a pipe or a file. `FORCE_COLOR` names a depth: 1, 2, 3, or 0 for none.
- **Width.** With a window, or `COLUMNS`, between 60 and 76 columns. Paragraphs reflow and a figure is held to the word after it; a table narrows its bars (ten cells, five, none) and then cuts its name with `…`; a figure is never cut and a row never wraps. With no window the layout is the one a pipe always had.
- **No decoration.** No banner, no logo art, no animation, nothing that would not survive being pasted into an issue. The rules and the bars are content and print in a pipe too.
- **The pictures.** `scripts/terminal-picture.mjs` draws the mark in the acid, bold, as the dark theme draws accent text; the landing's screen draws it as the CLI does, ink on the acid ground.

## Site shell

- Addresses: `/` is the landing, `/app` the application. `/?tab=` and `/landing` redirect (308) and are never linked. Entries live in `apps/web/lib/site.ts`; a page that does not exist yet links its GitHub copy.
- Header: one 72px bar with a 2px rule under it. Full wordmark home, then the entries, then language, appearance, GitHub and the one primary action into the dashboard, in that order. Below 1280px: wordmark, GitHub mark and a Menu button opening a disclosure panel in the page flow, not a dialog; Escape closes it.
- GitHub button: the mark drawn inline (no request to GitHub), 2px border on paper, never acid; its name says GitHub and that it opens a new tab. Mark alone only where the word cannot fit. The same component in the header, the footer, the landing and the rail.
- Primary action: acid fill, 2px ink border, 3px hard offset, an arrow. One per region.
- Footer: paper, 2px rule above, wordmark, one line, the GitHub button, and two link groups (product, project).
- Sections: full-width bands separated by 2px rules, alternating paper and layer. On the light public pages there is no full-width ink band: ink is for type, rules and the laptop's screen. No card inside a band except the one figure the band is about.
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

## Using the brand

For somebody who writes about Trazum, lists it, or builds something beside it. `/brand` draws this section and reads its values from the files that hold them.

### Voice

Clear: say what the thing does in plain words, and put the answer before the reason. Precise: name the file, the command or the figure, and say when a figure is an estimate. Direct: a number is measured or it is not written, and what could not be measured is said to be unknown.

### What not to do

- Do not add a symbol. The full name leads, the plain T appears only where the name cannot fit, and there is no standalone abstract mark. The rejected geometric logo does not return.
- Do not set the acid yellow as text on paper. It is a fill, and the accent text colour is the one for text.
- Do not set the wordmark in another typeface, or tighten its tracking below -0.04em. Use the files.
- Do not use gradients, rounded cards, nested cards, stickers, decorative geometry or coloured noise.
- Do not put the hard offset shadow on passive content. It belongs to actions.
- Do not invent a colour. The palette is the token table above and the semantic colours for success, caution and error.

## Brand page (Read mode)

- Surface: `/brand`, linked from the footer and not from the header. Read, not Persuade: somebody needs an asset or a rule and leaves.
- Order: the wordmark large on paper and on the dark canvas, with the downloads under it; the plain T; the colours; the typeface; the voice; what not to do. One band each, rules between, no cards.
- Downloads: the wordmark and the plain T, light and dark, as SVG and PNG, eight files written by `scripts/draw-icon.mjs` into `apps/web/public/brand`. The wordmark is outlines of Space Grotesk at weight 700 with no ground; the T keeps its acid fill and ink T on either ground and its border follows the theme's ink. A button says the format and the ground.
- Colours: one swatch per row of the token table, with its role, its custom property and its value in the mono stack with tabular figures, light and dark side by side, and a copy button that writes to the clipboard and sends nothing.
- The page states no trademark policy and makes no legal claim: it points at `docs/licensing.md`, which says there is none yet.

## Layout and controls

Desktop rail: 252px, collapsible to 72px. Below 1024px: existing accessible drawer and compact brand bar. Task headings range from 38px to 56px. Strong 2px borders identify working regions; thinner rules separate data rows. No rounded card language. Cards inside cards reduce to section rules and transparent backgrounds.

Primary buttons and active navigation may carry a 3px hard offset shadow. Passive content does not. Native focus indicators remain obvious. Import areas have clear hover and focus states. Application and marketing preserve all reviewed locales and real product claims.

## Appearance preference

The rail offers Light, Dark and System (localized in English and Spanish). System is the application's default. Explicit choice persists under `trazum:theme`; a nonce-authorized bootstrap applies it before paint. Blocked storage falls back safely to the system theme. Native controls and Tailwind dark variants follow the resolved `data-theme` value.

The public site is paper first, by the owner's decision of 2026-11-18 (#744): with no choice stored, a visitor whose system is dark still gets the light page, and the header's control shows Light, until they choose Dark (or System). The middleware marks each address as `site` or `app` (`surfaceOf` in `apps/web/lib/site.ts`) and the layout stamps it on `<html data-surface>`; the bootstrap and the stylesheet's system-dark rule read it, so the site stays light with storage blocked and without JavaScript. The application keeps System as its default. The explicit Dark theme of the site uses the dark tokens above and no others.

## Motion and states

The landing's authored motion is its story, told by scrolling (below); it replaces the ledger-fill, at the owner's request of 2026-11-18. Elsewhere: short color transitions and a one-pixel press on primary actions. Reduced motion, loading, empty, error, session, locale and report states remain functional.

## Landing: the story told by scrolling

Asked for by the owner on 2026-11-18 (#744): less dark, a page that tells the product as you scroll, a laptop whose lid closes, the CLI in motion. The identity is unchanged; what changed is the landing's motion and its lightness.

- **The arc.** The hero (headline, command, the two actions) holds the first screen at 1440x900 and 390x844, with the laptop already rising below it. Then one pinned stage: the laptop arrives; the camera pushes into its screen until the terminal fills the window; three commands run inside it (`bill`, `check` and its exit status, `optimize`), each scrolling the terminal on rather than cutting to a slide, each with its heading and sentence on a paper plate; the camera pulls back out; what never leaves the machine settles onto the screen and the lid closes over it about its hinge, the screen's light going out, ending on the closed machine with the wordmark and what does leave beside it. A quiet marker with the acid fill says which of the four scenes is playing. "Why the number holds up" and the closing (the command, the dashboard, GitHub) follow on paper.
- **The laptop.** Drawn in CSS and inline SVG in the light tokens on either theme: an ink bezel with a rule-grey rim, a paper deck with keys and a trackpad, a hinge, real proportions (a 16:10 screen, a deck as deep as the lid is tall), in perspective, with the brand's hard offset shadow and no gradient. The lid's back carries the full wordmark. The screen uses the dark terminal tokens, as the Playground and the README's pictures do.
- **The screen is the CLI's.** Every character on it is what the built CLI printed, written by `scripts/draw-landing-terminal.mjs` and compared by the web suite. The text is in the DOM once; typing is a clip over constant text. A product part with no runnable example in the repository has no scene.
- **Scroll drives it, nothing else.** Each moving element runs keyframes of `transform`, `opacity` and `clip-path`, written from the timeline by `apps/web/lib/story-motion.ts`, on the section's CSS scroll timeline; where the browser has none, a passive, frame-throttled script that runs only while the section is on screen holds them paused at the scroll position. No wheel or touch listener, no `preventDefault`, no scroll-snap, no animation on a clock: scrolling back plays it back. Nothing else changes with scroll, and no custom property is animated: an animated custom property restyles everything beneath it, which measured 50 to 180 ms a frame at 4x CPU throttle. The terminal is laid out at its final size and reaches a scale of exactly 1 inside the screen, so its text is never scaled up. The budget, measured on a full scroll at 4x CPU throttle: no long task over 50 ms while scrolling, and a layout shift of 0.02 at most.
- **Never hidden.** With reduced motion, without JavaScript, and before the first frame, every scene is ordinary content in reading order and the laptop is drawn still with what never leaves on its screen. The pinned stage holds no control, so keyboard focus never lands behind it. The phone gets the same story with the laptop at the viewport's width, a shorter scroll, and nothing sideways.
- **Light first.** No full-width ink band on the light page; acid as a fill with more confidence (the cursor, the bars, the marker, the numbers, the primary action, the command chips); the paper tones for depth. The terminal fills the window only between paper: the hero, the closing scene and everything after are light.

## Process and evidence

The optional Impeccable engine could not initialize in the sandbox. No engine-generated selection or detector results are claimed. User explicitly approved the acid neobrutalist direction from the standalone comparison. Root performs browser verification across desktop and mobile before delivery.
