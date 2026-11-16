# Tovi: the complete brief for the next agent

**Read this first, then `CLAUDE.md` (product decisions, design tokens, PRD links), then `CHECKLIST.md` (every feature idea with the founder's decision).**
Last updated: 2026-11-16.

---

## 1. What Tovi is

Tovi lets designers and founders edit their team's **real, running React + Tailwind app** the way they'd edit in Figma. They can select anything and change its colour, type, spacing, layout, size, images or structure, or ask AI to do it. Tovi writes each change into the source code the way a careful developer would: AST edits of Tailwind classes on the exact JSX element, never find-and-replace. **All the changes go to developers as one GitHub pull request**, with before/after pictures.

- **Who it's for:** product designers on React + Tailwind teams, and founders or builders without design training. The second group gets guardrails: values snap to the design scale, and contrast warnings appear.
- **Goal:** a public launch, after a private beta with 20–50 invited users.
- **Naming:** renamed from "Kerf" in October 2026. Everything people see says Tovi. Internal names keep "kerf" on purpose: `data-kerf`, `/__kerf/`, `.kerf/`, `~/Kerf/`, `kerf/…` branches, `kerf-*.mjs`, `createKerf`. Don't rename them; that would break saved sessions.
- **Repo:** `squarepegng/tovi` (public), local at `/Users/mac/Documents/kerf`. Planned domains: usetovi.com and tovi.design.

## 2. Who you're working with (read carefully)

- **Tobi, the founder, is a designer, not an engineer, with very high taste.** Explain briefly in plain language and do the work directly. Don't re-ask for permission already given. "Speak designer, not developer."
- **Push back.** When an idea is weak, give an honest verdict and a better option before building. Don't just agree.
- **"Learn from X"** means: report a short list plus a recommendation, then wait. Don't rebuild Tovi to look like X.
- **Don't treat ambiguous words as a go-ahead.** A typo is not an approval.
- **They watch credits.** Prefer the CLI over long browser-clicking loops. Keep replies short. Real AI calls cost them money, so keep AI tests few.
- **Security:**
  - Never ask them to paste tokens or passwords. Sign-ins happen on the service's own pages.
  - Never read, print or repeat API keys. Keys live in `engine/.env` (git-ignored) and are set from Tovi's Settings page.
  - Don't sign in, create accounts or accept terms for them.
- **Git:**
  - Work on branches with pull requests.
  - **Merge to `main` only when Tobi explicitly says so.**
  - Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. PR bodies end with `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
  - Big pushes may need `git -c http.postBuffer=524288000 push`.
- **Never run `git checkout`, `reset` or `clean` in `~/Kerf/projects/*`.** Those are Tovi's copies of real projects and hold the user's unsent edits. Test on throwaway copies in your scratchpad. To undo, use Tovi's own `.kerf` history.
- **Never push to, or make a PR against, the real Stratemark repo.**

## 3. Where everything is

| What | Where |
|---|---|
| Tovi repo | `/Users/mac/Documents/kerf` → `squarepegng/tovi` |
| The real product (engine + editor + start page) | `engine/` |
| Marketing website | `website/` (static: `index.html`, `site.js`, `fonts/`, `img/`) |
| Website copy | `docs/landing-page-copy.md` |
| Original single-file prototype (demo only) | `index.html` at the repo root, deployed by Vercel from `main` |
| Product decisions, design tokens | `CLAUDE.md` |
| Every feature idea + the founder's decision | `CHECKLIST.md` |
| Tobi's full design language (UI rules, learned the hard way) | `~/.claude/skills/ui-craft/SKILL.md` (copy: `~/Documents/Tobi-design-language.md`). **Load it before any UI work.** |
| Tovi's data on the Mac | `~/Kerf/`: `projects/` (cloned repos), `recent.json`, `prefs.json` (theme), `person.json` (name), `cards.json` (renamed or hidden project cards) |
| Test repos | `squarepegng/northfold-demo` (sample shop; copy in `~/Kerf/projects/squarepegng-northfold-demo`), `aster-demo` (local only), `~/Documents/northfold` |
| Tobi's real app: Stratemark | `/Users/mac/Documents/STRATEMARK-app` (Vite + React + Tailwind v3). Tovi's copy is `~/Kerf/projects/squarepegng-stratemark-app`, **with ~63 unsent edits in `apps/web/.kerf/session.json`. Do not touch.** |
| PRD / design system / editor designs / old prototype | Links in `CLAUDE.md` |

## 4. How to run it

```bash
cd ~/Documents/kerf/engine && npm install      # once
node bin/kerf-home.mjs                         # start page → http://localhost:4100
```

- **Start page** (port 4100):
  - Paste a GitHub link or a folder path. Tovi clones the repo into `~/Kerf/projects/`, finds the React + Tailwind app (monorepos too), installs it with the repo's own package manager, starts it with Tovi attached, and opens the editor at `http://localhost:<port>/__kerf/`.
  - Settings has four tabs: Account, AI, Appearance, About.
- **Open one app directly:** `node bin/kerf.mjs /path/to/app`. It picks Vite or Next.js automatically.
- **If ports are busy:** `lsof -t -iTCP:4100 -sTCP:LISTEN | xargs kill` (same for 5173…).
- **Website locally:** `cd website && python3 -m http.server 4300` → http://localhost:4300
- **Tests:** `cd engine && npm test` → **55 tests, all passing**.
- **End-to-end edit check against a running app:** `node scripts/live-check.mjs http://localhost:5173`
- **After any engine change:** restart Tovi so Tobi gets the new code. Kill 4100 and the app port, then rerun `kerf-home.mjs`. Tobi often runs it in a Claude terminal tab.

## 5. How the engine works

**Core loop:**
1. **Tag.** Before the framework compiles the app, the tagger stamps every JSX element with `data-kerf="file.tsx:line:col"`, and every component usage with `data-kerf-use` + `data-kerf-n`. Vite uses a plugin; Next.js uses a webpack pre-loader.
2. **Show.** The editor (`/__kerf/`) runs the app in a same-origin iframe at `/`. Clicking an element maps it back to its exact place in the source.
3. **Edit.** Each panel change becomes an operation such as `{prop:'padding', value:16}`.
   - `tailwind.mjs` turns the operation into the right Tailwind class for the project's theme.
   - `edit.mjs` rewrites that one JSX node with Babel + magic-string.
   - If the style really lives elsewhere (a style table, constant, cva variant or `@apply` class), `sources.mjs` finds it and edits it there.
4. **Remember.** Every edit stores the file contents before and after. Undo, versions, "show before" and restore all come from this history, which is saved in `<app>/.kerf/session.json` (git-ignored via `.git/info/exclude`), along with versions and chat.
5. **Hand off.** `session.mjs` makes the pull request:
   - Branch `kerf/…`, never `main`.
   - Build check and parse check first.
   - Takes before/after pictures of up to 3 changed pages with a hidden Chrome.
   - Pushes the pictures to a separate `tovi-screenshots/<name>` branch, so the code diff stays clean.
   - Pushes the code and opens the PR with `gh`. The body is plain language with the code details folded away and a Before | After picture table.
   - A second hand-off updates the same PR and adds a comment.

**Supported today:**
- React with **Vite**, or **Next.js 13+** (webpack dev server, not Turbopack)
- **Tailwind v3** (JS or TS config)

Anything else gets a plain explanation: CRA, Remix, Astro, Gatsby, Tailwind v4, no Tailwind, Next 12.

### Engine files (`engine/`)

| File | Job |
|---|---|
| `bin/kerf-home.mjs` | Start page and Settings (port 4100). APIs: `/api/open`, `recent`, `card` (rename, remove, show in Finder), `job`, `key`, `key-status`, `ai-key`, `ai-provider`, `models`, `unsplash-key`, `prefs`, `me`, `about`, `thumb` |
| `bin/kerf.mjs` | Runner: loads the app's own `vite.config` with Tovi's plugin first, or hands off to the Next runner |
| `bin/kerf-next.mjs` | Next.js runner: own HTTP server, `/__kerf/*` → Tovi, the rest → Next. Hooks Next's config loader, so the user's `next.config` is never touched |
| `src/next-loader.cjs` | Webpack pre-loader that tags JSX for Next |
| `src/plugin.mjs` | `createKerf(webRoot)`: tagging plus every `/__kerf` API route (list below). Default export = Vite plugin |
| `src/project.mjs` | Clone or find the project, find apps in monorepos, `appProblem()` plain reasons, install, start |
| `src/ast.mjs` | `tagSource`, `parseCode`, `walk` |
| `src/edit.mjs` | `editElement` (classes, text, props, cva), `applyResponsive` (per-size edits with `md:`/`lg:`), `createEditor` (history, undo, current page), `parseLoc` (only the app's own files) |
| `src/tailwind.mjs` | Reads the theme; maps each design property ↔ Tailwind class, including background images (`bgImg`, `bgSize`, `bgPos`) |
| `src/sources.mjs` | Finds where a style really lives (style tables, constants, branches, class objects, `@apply` CSS) and follows imports |
| `src/cva.mjs` | shadcn-style variant components: base, one variant, or a compound variant |
| `src/tokens.mjs` | Colour tokens (CSS variables per light/dark, or config hex): read and write in their own format |
| `src/structure.mjs` | Delete, duplicate, move, swap, insert, replace, group/ungroup, images |
| `src/props.mjs` | Component properties (icon weight, button variant…) |
| `src/library.mjs` | Icons (lucide, phosphor), project components, uploads to `public/kerf/` |
| `src/fonts.mjs` | Adds a Google Font the way a developer would (link + `fontFamily` in the config) as one undoable edit |
| `src/images.mjs` | Unsplash photos, and SVG illustrations drawn by Claude |
| `src/ai.mjs` | All AI calls (see section 7) |
| `src/labels.mjs` | Plain-language names for elements and changes ("Title 'Stratemark'", "Padding 12 → 16") |
| `src/session.mjs` | Saved history, versions and chat; repo info; `pullRequest()` with build check and pictures |
| `src/shots.mjs` | Real screenshots via the installed Chrome (puppeteer-core, no download); full-page with a height cap |
| `src/prshots.mjs` | PR pictures: which pages changed, push the images to the `tovi-screenshots/` side branch, build the Before/After markdown |
| `src/person.mjs`, `prefs.mjs`, `recent.mjs` | The designer's name, theme preference and recent projects, kept in `~/Kerf/` |
| `editor/index.html`, `editor.js` (~4,600 lines, plain-JS IIFE, state in `S`), `editor.css` (~1,700 lines; later override blocks are appended at the end) | The entire editor UI |
| `test/engine.test.mjs` | 55 engine tests |
| `scripts/live-check.mjs` | Real edits through the API against a running app |

**Editor API routes** (`/__kerf/…`):
- **Editing:** `edit`, `undo`, `restore`, `peek`, `unpeek`, `inspect`, `structure`, `tokens`, `token`, `theme`, `fonts`, `icons`, `icons/suggest`, `components`, `upload`, `uploads`, `images/photos`, `images/photo-used`, `images/illustrate`
- **History and hand-off:** `changes`, `versions`, `version`, `shots`, `thumb`, `pr`
- **AI:** `ai`, `ai/apply`, `ai-config`, `chat`, `diagnose`, `direction`, `keys`
- **Project and account:** `project`, `rename`, `prefs`, `person`, `accounts` (GitHub logins via `gh`, tokens never returned), `account` (switches only between accounts already signed in)

Every POST from the editor also carries `_page`, so each edit remembers which page it was made on. The PR pictures use this.

## 6. What the editor does today (all built and working)

**Layout:**
- No top bar (Paper-style). The left panel header holds the Tovi menu, project and page. The right panel header holds the avatar (with a menu to switch GitHub account), history, zoom and **Hand off** (pink).
- Screen sizes and Present float at the top centre of the canvas.
- One minimal bottom toolbar holds the Preview/Edit switch, tools in flyouts, and a pending-changes dot on the history icon.
- A hidden panel shrinks to a small floating pill.
- Light and dark themes; dark is the default.

**Selection and canvas:**
- Select anything, including disabled buttons. Designer names show everywhere.
- Shift-click to multi-select.
- Padding and size handles (snap 4px, Shift for 1px). Alt to measure. Drag to reorder.
- Zoom, fit and pinch. Desktop, tablet and mobile frames. Present mode.

**Design panel** (Paper-style controls, Figma vocabulary):
- **Type:** size, weight, line height, spacing, align, decoration, case.
- **Colour:** text colour; fill (solid, gradient, gradient text, **image fill**); stroke; radius, including per corner; opacity; shadow; hide; clip.
- **Layout:** auto layout (direction, wrap, 3×3 align, gap, space between, padding); Hug / Fill / Fixed; margin.
- **Components:** component properties; cva variants ("Only this one / All ghost / Every Button").
- **Images:** a dedicated image panel (fit, find a photo, upload, link). Fonts from Google Fonts.
- **Per screen size:** the "where" choice ("All sizes / Mobile only") appears only when it matters.
- **Nothing selected:** a compact colour palette, grouped by role with light/dark split swatches, which edits the design tokens.

**Structure:** delete, duplicate, move, swap icons and components, insert, replace, group/ungroup, add and replace images.

**Edit anywhere:** styles in style tables, constants, branches and CSS classes are changed at their source, with a reach choice.

**AI:** one chat on the left (⌘K).
- It works on the selection, or on the whole screen.
- **Newest:** the context chip has an × to switch to "Whole screen", and "+ Selection" brings it back. This is on branch `kerf/chat-context`, not merged; see section 9.
- Proposals show in amber with Apply / Discard. Every AI change is an undoable version.
- Image attachments (paste, drop or button), and mic dictation (Web Speech API).
- When unsure, the AI offers "Try instead" or "Choose: a | b | c".

**Notes:**
- Pin, box, circle or arrow on the screen, typed or by voice.
- Markers are a dot plus a small dark tag; tags stack so they don't overlap.
- "Apply all" runs them; results come back per note (Done / Partly / Not here).

**Diagnose:** Tovi reviews like a design lead and leaves notes on exact spots.
- Scopes: This page, This selection, or Whole product (follows links, up to 10 pages, Stop any time).
- "Check my product" runs on open (on by default).

**History:** undo; saved versions (automatic when going back to Preview, plus "Save as a version"); show before; restore. The designer's name is on their versions.

**Hand off:** see section 5. It was verified for real on `squarepegng/northfold-demo` PR #2 (25-second hand-off; the pictures are visibly different; only the changed file was in the diff).

**Saved sessions:** history, versions and chat survive restarts.

## 7. AI details (lessons that cost time)

- **Providers:** Claude (default, `claude-opus-5-5`), OpenAI and Gemini are wired in. Tobi chose Claude in Settings.
  - Gemini returned 400 errors and isn't verified.
  - Decision: Claude only for the private beta; verify OpenAI + Gemini before the public launch.
- **Structured output:** proposals use the Anthropic SDK's `betaZodOutputFormat` with a Zod `Proposal` schema. **Provider limits:**
  - At most **16 nullable/union fields** in the schema.
  - The compiled grammar must not get "too large".
  - We hit both. The fix was to pack fields into small objects (`group {with, className}`, `image {src, alt}`, unpacked at the start of the edits loop) and to drop the `ask`/`alt` fields.
  - The model now writes a last line, `Try instead: <label> => <request>` or `Choose: a | b | c`, which code parses back into `p.alt` / `p.ask`.
  - **Before adding a schema field, test that the call still succeeds** (a cheap Haiku probe is fine).
- **Behaviour rules:** the AI is visual/layout only (no behaviour, data or backend). It says its approach and reach in one sentence first. It can change tokens, or make a last-resort code edit (diff shown, auto-undo if the page breaks).

## 8. The website (`website/`)

Static and dark, with no build step. It isn't deployed yet.

**Type and grid:** Geist Serif for headings (`fonts/GeistSerifVF.woff2`, OFL) and Geist for body. A ruled grid with "+" marks at the intersections. No gradient glows (Tobi: gradients look cheap). Neutral textures per cell.

**Hero:**
- H1 "Designers, fix the *real* thing." at up to 72px. The lede is two lines at most.
- A wide stage plays **real screenshots** of Tovi (`img/real/*.webp`) with one cursor and a shimmering rim around the AI chat box. No tilt and no fade.

**#design section** (5 cells):
- connect GitHub (New project dialog)
- edit by hand (properties panel scrubbing a card)
- AI edits (Tovi's chat plus a phone booking app that turns premium)
- notes
- Diagnose / audit (full width)

**#ship section** (2 cells): code changes (before/after element beside its diff), and Hand off to the PR. The Version history card was removed on request.

**Then:** a logo marquee, a values band, an FAQ, an invite form (it only confirms on the page; there's no backend), and the footer.

**Animation:**
- The `scene()` helper in `site.js` plays each animation only while it's on screen.
- Cursors are an orange "You" dart, used only in the hero and one or two cells. Everything else uses a tap dot with a double ripple.
- Features are animated components, not pasted screenshots, and they aren't numbered or lumped together.

## 9. Branches and PRs right now

- **`main`** has everything up to the merge of PR #10 (`16c840d`): one workspace, design-tool UI, edit styles where they live, AI, before/after pictures. PRs #1–#5 and #10 are merged; #7 was absorbed and #8 closed. **There are no open PRs.**
- **`kerf/chat-context`** (`459ca11`) is pushed but has no PR yet. It's the "talk to Tovi without a selection" chat chip. Open a PR when Tobi says so.
- Old branches (`kerf/design-ui`, `kerf/edit-anywhere`, `kerf/one-workspace`, `site/landing`) are contained in main. Don't build on them.
- **Untracked files in the repo root** are Tobi's (`Tuvi Avatar.png`, `files.zip`, `.DS_Store`). Don't commit or delete them.

## 10. How to test safely

- **Always work on a copy.** For example:

  ```bash
  cp -R ~/Kerf/projects/squarepegng-northfold-demo $SCRATCH/nf
  ```

  Or use a `git worktree add --detach` of Stratemark, with `node_modules` symlinked. Then run `node bin/kerf.mjs $SCRATCH/nf`.
- **Drive it** with puppeteer-core and the installed Chrome, or with the built-in browser. `javascript_tool` reads state inside the iframe.
- **Test PRs** go to `squarepegng/northfold-demo` only, and only with Tobi's OK.
- Stratemark screens past the access code need a sign-in Tovi can't do yet. Never copy sign-in data across.

## 11. What's left: the decided build order

Tobi accepted all recommendations on 9 Nov 2026 (see `CHECKLIST.md`). **Build in this order. Each needs a go-ahead before starting.**

1. **1.1 One-step install.** One download or command that checks and sets up Node, git and the GitHub login. Today a developer has to do this, and it's the biggest blocker for beta testers.
2. **1.7 Tailwind v4 support.** Most new projects use v4, which is CSS-first (`@theme` in CSS, no config file). Needs a new theme reader and class mapping.
3. **1.2 Sign in to the tester's app.** A clear "sign in here once" step, so the preview, Diagnose and the PR pictures can reach screens behind a login.
4. **1.4 Report a problem.** Opt-in error reporting plus a one-click report, so Tobi sees what failed.
5. **2.1 Match to Figma.** Paste a Figma frame link; Tovi marks every difference from the live screen and fixes them as a PR. The top differentiator.
6. **2.3 States and real content.** Edit hover, focus, disabled, loading, empty and error states; test with long names, empty lists and big numbers.

**Before the public launch:** 1.8 verified OpenAI + Gemini, and 2.10 "start from a website link" (parked until after the beta).

**Later:**
- 2.4 "Used in N places"
- 2.5 live preview of AI changes
- 2.6 type scale and radius in the design system (colours are done)
- 2.8 share a link (needs cloud mode)
- 2.9 first-edit onboarding
- 3.4 one combined Changes list

**Decided, don't revisit:**
- Notes stay their own mode (3.3).
- Margin stays visible.
- Code stays hidden by default.
- **Never free positioning:** auto layout is the backbone.
- Skip Claude-subscription sign-in (1.9).

**Bigger phases after that (from `CLAUDE.md`):**
- **Cloud mode:** the repo copied into Tovi's cloud, with Vercel preview deployments per PR.
- Website launch and deploy, the beta invite backend, a light-theme pass, billing (free with your own key, paid with Tovi's AI).

**Known gaps:**
- Next.js has only been tested on a sample app; Turbopack isn't supported.
- Font size changes can also change line height, because Tailwind size classes carry one.
- Fit has a 50% minimum in very narrow windows.
- Double-click-to-retype text wasn't verified with a real double-click.
- Diagnose: near-duplicate notes across pages aren't merged yet.

**Open questions for Tobi:** free-plan preview hosting (local vs cloud), beta user sourcing, success targets, whether hover and hidden states are in scope at launch.

## 12. Design rules in one breath

Full rules are in the `ui-craft` skill and `CLAUDE.md`.

- **Colour:** neutral greys only (equal R, G and B). **Tovi pink is the primary colour**: #FCBDDD in dark, #C2508A in light. Pink buttons are 3D: Hand off and the active tool. Blue #2B66D9 means "what you're touching" on the canvas.
- **Type and icons:** the Mac system font in the app; Geist Mono for code; Lucide icons at 1.25px.
- **Controls and spacing:** Paper's control style (24px, 6px corners, flat 5% track, raised chosen item). Spacing 4/8/12/16; radii 4/6/10.
- **Feel:** Framer finish with Figma structure.
- **Don't:** heavy shadows, gradients as decoration, tinted greys, developer words in the UI, or empty placeholder panels.
