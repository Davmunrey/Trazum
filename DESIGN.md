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

## Layout and controls

Desktop rail: 252px, collapsible to 72px. Below 1024px: existing accessible drawer and compact brand bar. Task headings range from 38px to 56px. Strong 2px borders identify working regions; thinner rules separate data rows. No rounded card language. Cards inside cards reduce to section rules and transparent backgrounds.

Primary buttons and active navigation may carry a 3px hard offset shadow. Passive content does not. Native focus indicators remain obvious. Import areas have clear hover and focus states. Application and marketing preserve all reviewed locales and real product claims.

## Appearance preference

The rail offers Light, Dark and System (localized in English and Spanish). System is the default. Explicit choice persists under `trazum:theme`; a nonce-authorized bootstrap applies it before paint. Blocked storage falls back safely to the system theme. Native controls and Tailwind dark variants follow the resolved `data-theme` value.

## Motion and states

Existing ledger-fill remains the landing's authored motion. Short color transitions and a one-pixel press on primary actions. No invisible-on-scroll content. Reduced motion, loading, empty, error, session, locale and report states remain functional.

## Process and evidence

The optional Impeccable engine could not initialize in the sandbox. No engine-generated selection or detector results are claimed. User explicitly approved the acid neobrutalist direction from the standalone comparison. Root performs browser verification across desktop and mobile before delivery.
