// renderMarkdown — minimal markdown-to-HTML renderer for the editor preview pane.
//
// Pure function, no React, no external dependencies. Hand-rolled and
// deterministic. Not CommonMark-complete; the supported subset is just
// large enough to cover what RichText fields need today.
//
// Pipeline:
//   1. Extract fenced code blocks (```) into placeholders — their content
//      is HTML-escaped at extraction time and emitted as
//      <pre><code>...</code></pre>. No further markdown processing
//      happens inside.
//   2. Extract inline code (`...`) into placeholders. Same isolation:
//      bold/italic/link/strikethrough must not run inside code.
//   3. Extract backslash escapes (`\X` for the small set of meaningful
//      markdown chars) into a third placeholder pool. After every
//      inline transform has run, the placeholders are restored as the
//      literal character — so `\*` survives the bold/italic passes
//      without being consumed. Backslash escapes inside fenced or
//      inline code are NOT processed because those segments were
//      already extracted in steps 1 and 2.
//   4. Walk lines and group block constructs (headings, lists,
//      blockquotes, horizontal rules). Block markers (`>`, `-`, `*`,
//      `1.`, `#`, `---`) must be detected on the RAW text — escaping
//      `>` to `&gt;` first would break blockquote detection. Each
//      block's inner content is then HTML-escaped, after which inline
//      transforms run.
//   5. For lines that aren't part of any block, escape and run inline
//      transforms.
//   6. Reassemble: blocks have no surrounding `\n` (so the block's
//      internals never gain a stray <br />); plain lines stay
//      `\n`-separated so step 7 can convert them.
//   7. Convert remaining `\n` to `<br />`.
//   8. Restore inline-code, fenced-code, and backslash-escape
//      placeholders.
//
// Escaping is security-critical: the result is fed into
// dangerouslySetInnerHTML by callers. Anything user-typed (e.g.
// `<script>`) must render as literal text. Escaping happens BEFORE the
// markdown markers are turned into the small whitelist of HTML tags
// this renderer emits.
//
// Out of scope (intentionally, to keep the parser tractable):
//   - Nested lists, nested blockquotes.
//   - Tables.
//   - Setext-style headings (`===`, `---` directly under a heading).
//   - Reference-style links.
//   - Nested emphasis with mixed delimiters (e.g. `___both___`).
//
// IMPORT CONSTRAINTS:
//   - No React, no external dependencies. Pure string → string.

// Sentinels for the extract/restore round-trip. Control chars (NUL +
// U+0001) survive htmlEscape unchanged and are easy to make collision-
// proof: we strip these from input upfront (see renderMarkdown), so
// collision is impossible regardless of how the source got into the
// system (keystroke, paste, programmatic). fromCharCode keeps the source
// printable.
const SENTINEL_OPEN = String.fromCharCode(0)
const SENTINEL_CLOSE = String.fromCharCode(1)
const SENTINEL_STRIP_RE = /[\x00\x01]/g
const FENCED_RESTORE_RE = new RegExp(`${SENTINEL_OPEN}F(\\d+)${SENTINEL_CLOSE}`, 'g')
const INLINE_RESTORE_RE = new RegExp(`${SENTINEL_OPEN}I(\\d+)${SENTINEL_CLOSE}`, 'g')
const ESCAPE_RESTORE_RE = new RegExp(`${SENTINEL_OPEN}E(\\d+)${SENTINEL_CLOSE}`, 'g')

// CommonMark backslash-escapable punctuation, restricted to the chars
// that this renderer actually treats as markup. Anything outside this
// set leaves the backslash literal — `\a` stays as `\a`. The class
// includes the brackets/parens needed to suppress link/image parsing
// and the inline markers (`*` `_` `~` `` ` `` `#`) plus `\` itself.
const ESCAPABLE_RE = /\\([\\*_~`#\[\]()!])/g

/**
 * Converts a small subset of markdown to HTML for the editor preview pane.
 *
 * Supported syntax:
 * - `# text` through `###### text` → `<h1>text</h1>` through `<h6>text</h6>`
 * - `**text**` / `__text__` → `<strong>text</strong>`
 * - `*text*` / `_text_` → `<em>text</em>`
 * - `~~text~~` → `<del>text</del>`
 * - `[text](url)` → `<a href="url" ...>text</a>`
 * - `![alt](url)` → `<img src="url" alt="alt" />`
 * - `` `text` `` → `<code>text</code>` (inline)
 * - ` ```lang\n...\n``` ` → `<pre><code class="language-lang">...</code></pre>` (fenced; lang optional)
 * - `- item` or `* item` → `<ul><li>item</li></ul>` (requires ≥2 consecutive matching lines)
 * - `1. item` → `<ol><li>item</li></ol>` (requires ≥2 consecutive matching lines)
 * - `> quoted` → `<blockquote>quoted</blockquote>`
 * - `---` / `***` / `___` on its own line → `<hr />`
 * - `\X` (where X is one of `\\ * _ ~ \` # [ ] ( ) !`) → literal X
 * - `\n` → `<br />` (only outside block constructs and code)
 *
 * All user-provided text is HTML-escaped before any tag is emitted, so
 * raw HTML the user types renders as literal text.
 *
 * Accepts `null` / `undefined` and returns `''`. This boundary lives at the
 * seam between framework and user code: a section component passing
 * `undefined` for an optional field would otherwise crash SSR with a
 * `Cannot read properties of undefined (reading 'replace')`. Treating
 * nullish as empty string is the cheap, locally-safe fix.
 */
export function renderMarkdown(source: string | null | undefined): string {
  if (source == null) return ''
  // 0. Strip the sentinel control chars from the input. They cannot
  //    arrive via a normal keystroke but CAN arrive via paste or a
  //    programmatic value, and a literal sentinel in `source` would
  //    collide with the placeholders we inject below. Stripping is
  //    safer than trying to escape them.
  source = source.replace(SENTINEL_STRIP_RE, '')

  // 1. Fenced code blocks first. Capture optional language tag, then
  //    everything up to the closing fence (non-greedy across newlines).
  const fencedBlocks: string[] = []
  let work = source.replace(
    /```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g,
    (_match, lang: string, content: string) => {
      // Strip exactly one trailing newline if present — that's the
      // newline immediately before the closing ``` on its own line;
      // keeping it would render as a blank trailing line in <pre>.
      const body = content.endsWith('\n') ? content.slice(0, -1) : content
      const escaped = htmlEscape(body)
      const langClass = lang.length > 0 ? ` class="language-${lang}"` : ''
      fencedBlocks.push(`<pre><code${langClass}>${escaped}</code></pre>`)
      return `${SENTINEL_OPEN}F${fencedBlocks.length - 1}${SENTINEL_CLOSE}`
    },
  )

  // 2. Inline code spans. `[^`\n]+` keeps spans single-line: matches
  //    CommonMark's restriction for backtick-1 spans and avoids
  //    accidentally swallowing huge chunks of text on unbalanced
  //    backticks.
  const inlineCodes: string[] = []
  work = work.replace(/`([^`\n]+)`/g, (_match, content: string) => {
    inlineCodes.push(`<code>${htmlEscape(content)}</code>`)
    return `${SENTINEL_OPEN}I${inlineCodes.length - 1}${SENTINEL_CLOSE}`
  })

  // 3. Backslash escapes. Run AFTER fenced/inline code extraction so
  //    `\*` inside `` `code` `` or a fenced block stays literal —
  //    those segments are now opaque placeholders and cannot match
  //    ESCAPABLE_RE. We push the literal char (unescaped here; the
  //    block/inline pipelines will htmlEscape the surrounding text but
  //    won't see the placeholder until restore). On restore we run the
  //    char through htmlEscape so `\<` (not in our set, stays `\<`)
  //    versus `\&` (not in set) versus actually-escapable chars are
  //    handled identically — but since our ESCAPABLE_RE only matches
  //    chars that are already HTML-safe (`\\ * _ ~ \` # [ ] ( ) !`) the
  //    htmlEscape on restore is a no-op in practice. We still run it
  //    for defense in depth in case the set is widened later.
  const escapedChars: string[] = []
  work = work.replace(ESCAPABLE_RE, (_match, ch: string) => {
    escapedChars.push(ch)
    return `${SENTINEL_OPEN}E${escapedChars.length - 1}${SENTINEL_CLOSE}`
  })

  // 4. Block grouping + inline rendering. Operates on the (mostly) RAW
  //    string so block markers like `>` and `<` are distinguishable.
  //    The string at this point still contains literal `\` sequences
  //    that did NOT match ESCAPABLE_RE (e.g. `\a`) plus the three
  //    placeholder pools. Each block's inner content gets escaped
  //    inside `renderBlocks` before inline transforms run.
  //
  //    The slugCounts map is created here (per renderMarkdown call) and
  //    threaded down to renderPlainLine so heading-id dedup is
  //    document-scoped. A module-level Map would leak state across
  //    calls and across React renders.
  const slugCounts = new Map<string, number>()
  work = renderBlocks(work, slugCounts)

  // 5. Remaining newlines (those between plain lines) become <br />.
  //    Block elements emitted in step 4 contain no internal `\n`, so
  //    this pass cannot leak <br /> into a list / blockquote / pre.
  work = work.replace(/\n/g, '<br />')

  // 6. Restore placeholders. All three pools coexist in `work` and the
  //    sentinels carry distinct kind tags (F / I / E). Restore order
  //    among them does not matter — none can produce another
  //    placeholder.
  work = work.replace(INLINE_RESTORE_RE, (_m, idx: string) => {
    const code = inlineCodes[Number(idx)]
    return code ?? ''
  })
  work = work.replace(FENCED_RESTORE_RE, (_m, idx: string) => {
    const block = fencedBlocks[Number(idx)]
    return block ?? ''
  })
  work = work.replace(ESCAPE_RESTORE_RE, (_m, idx: string) => {
    const ch = escapedChars[Number(idx)]
    if (ch === undefined) return ''
    // htmlEscape is defense-in-depth: every char currently in
    // ESCAPABLE_RE is HTML-safe, but if the set ever grows to include
    // `<`, `>`, `&`, or `"`, this keeps the output safe automatically.
    return htmlEscape(ch)
  })

  return work
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

/** Escape the four HTML-significant characters before emitting any tags. */
function htmlEscape(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * Walks lines, groups list / blockquote runs into block elements, and
 * returns a string where blocks are self-contained (no internal `\n`)
 * and plain lines are still separated by `\n` so the caller's
 * `\n → <br />` pass can act on them. Each segment's inner text is
 * HTML-escaped before inline transforms run, so the final string is
 * safe for dangerouslySetInnerHTML.
 */
function renderBlocks(input: string, slugCounts: Map<string, number>): string {
  const lines = input.split('\n')
  const out: string[] = []
  let plainBuf: string[] = []

  const flushPlain = (): void => {
    if (plainBuf.length === 0) return
    // Plain lines get heading + escape + inline transforms, then are
    // rejoined with `\n` so the final pass can convert separators to
    // <br />. slugCounts is captured from the enclosing scope rather
    // than added to flushPlain's signature — the closure keeps the
    // helper's call sites tidy.
    const rendered = plainBuf.map((l) => renderPlainLine(l, slugCounts)).join('\n')
    out.push(rendered)
    plainBuf = []
  }

  let i = 0
  while (i < lines.length) {
    const line = lines[i] ?? ''

    // A literal `\` before a block marker character escapes the marker:
    // `\# foo` should render as plain `# foo`, NOT as a heading. Drop
    // the leading backslash and treat the rest of the line as plain
    // text. The set mirrors the markers we recognize: `#` (heading),
    // `>` (quote), `-` `*` (ul + hr), digits (ol), `~` (strike — only
    // matters if a line starts with `~~~`, but cheap to include),
    // `` ` `` (fenced — already extracted, but harmless), `_` (hr).
    // We only consume the backslash when it is immediately followed by
    // one of those chars; `\foo` leaves the backslash alone (handled
    // downstream as literal text since `\f` is not in ESCAPABLE_RE).
    if (line.startsWith('\\') && /^[#>\-*\d~`_]/.test(line[1] ?? '')) {
      plainBuf.push(line.slice(1))
      i++
      continue
    }

    // Horizontal rule: a line whose entire trimmed content is 3+
    // identical chars from {-, *, _}. Common shapes: `---`, `***`,
    // `___`, `----`, `* * *` is NOT supported (kept simple). Lines
    // with trailing content like `--- text` fall through to plain.
    if (/^(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      flushPlain()
      out.push('<hr />')
      i++
      continue
    }

    // Unordered list: lines starting with `- ` or `* `. Requires ≥2
    // consecutive matching lines — a single `- foo` line is treated as
    // plain text. This protects pre-existing content that uses literal
    // `- ` / `* ` prefixes (e.g. a "1. " note) from being silently
    // re-rendered as a list. Look ahead at the next line; if it doesn't
    // also match, fall through to the plain-line path.
    const ulMatch = /^[-*]\s+(.+)$/.exec(line)
    if (ulMatch) {
      const next = lines[i + 1] ?? ''
      if (/^[-*]\s+(.+)$/.test(next)) {
        flushPlain()
        const items: string[] = []
        while (i < lines.length) {
          const cur = lines[i] ?? ''
          const m = /^[-*]\s+(.+)$/.exec(cur)
          if (!m) break
          items.push(`<li>${renderInlineEscaped(m[1] ?? '')}</li>`)
          i++
        }
        out.push(`<ul>${items.join('')}</ul>`)
        continue
      }
      // Single-line case falls through to plain rendering below.
    }

    // Ordered list: lines starting with `<digits>.<space>`. Same ≥2-line
    // rule as unordered — single `1. foo` lines are plain text. This is
    // the regression fix for content authored before list support
    // existed.
    const olMatch = /^\d+\.\s+(.+)$/.exec(line)
    if (olMatch) {
      const next = lines[i + 1] ?? ''
      if (/^\d+\.\s+(.+)$/.test(next)) {
        flushPlain()
        const items: string[] = []
        while (i < lines.length) {
          const cur = lines[i] ?? ''
          const m = /^\d+\.\s+(.+)$/.exec(cur)
          if (!m) break
          items.push(`<li>${renderInlineEscaped(m[1] ?? '')}</li>`)
          i++
        }
        out.push(`<ol>${items.join('')}</ol>`)
        continue
      }
      // Single-line case falls through to plain rendering below.
    }

    // Blockquote: lines starting with `> `. Consecutive lines are joined
    // with a space — that matches how a paragraph inside a quote would
    // naturally flow. Empty `>` lines or nested quotes are not
    // supported.
    const bqMatch = /^>\s+(.+)$/.exec(line)
    if (bqMatch) {
      flushPlain()
      const parts: string[] = []
      while (i < lines.length) {
        const cur = lines[i] ?? ''
        const m = /^>\s+(.+)$/.exec(cur)
        if (!m) break
        parts.push(renderInlineEscaped(m[1] ?? ''))
        i++
      }
      out.push(`<blockquote>${parts.join(' ')}</blockquote>`)
      continue
    }

    // Plain line — buffered so consecutive plain lines can rejoin with
    // `\n` and become `<br />`-separated downstream.
    plainBuf.push(line)
    i++
  }

  flushPlain()

  // Empty input round-trips: split('\n') of '' yields [''] which the
  // loop pushes as a single empty plain line; flushPlain joins that
  // into ''. So no special case needed.
  return out.join('')
}

/**
 * Render a plain line: heading transform first (line-level), then
 * escape + inline transforms on the surviving content. The heading
 * regex runs on raw text because escaping `#` is a no-op.
 */
function renderPlainLine(line: string, slugCounts: Map<string, number>): string {
  const headingMatch = /^(#{1,6})\s+(.+)$/.exec(line)
  if (headingMatch) {
    const level = (headingMatch[1] ?? '').length
    const text = headingMatch[2] ?? ''
    // Auto-generate an `id` so in-page anchor links (`[x](#slug)`) have
    // a scroll target. Slug is computed from the plain text (markdown
    // markers stripped) BEFORE inline rendering — slugifying the rendered
    // HTML would mix tag names into the id.
    const baseSlug = slugifyHeading(text)
    let idAttr = ''
    if (baseSlug.length > 0) {
      // Dedup repeated headings within the document so we don't emit two
      // <h*> elements with the same `id` (invalid HTML; browsers only
      // jump to the first match). Convention matches GitHub: first
      // occurrence keeps the bare slug, subsequent ones get `-2`, `-3`,
      // … . Empty slugs never enter the map, so `# !!!` twice stays
      // two id-less headings rather than producing `id=""` and `-2`.
      const count = slugCounts.get(baseSlug) ?? 0
      const finalSlug = count === 0 ? baseSlug : `${baseSlug}-${count + 1}`
      slugCounts.set(baseSlug, count + 1)
      idAttr = ` id="${htmlEscape(finalSlug)}"`
    }
    return `<h${level}${idAttr}>${renderInlineEscaped(text)}</h${level}>`
  }
  return renderInlineEscaped(line)
}

/**
 * Produce a URL-fragment-safe slug from raw heading text. Strips the
 * common inline markdown markers (`**`, `__`, `*`, `_`, `~~`, backticks)
 * and reduces `[label](url)` to just the label, so the slug reflects the
 * plain text the reader sees rather than the surrounding markup. Then
 * lowercases, collapses any run of non-alphanumerics into a single `-`,
 * and trims edge dashes. Deterministic and dependency-free.
 */
function slugifyHeading(text: string): string {
  const plain = text
    // Drop sentinel placeholders FIRST so the F/I/E tag char + numeric
    // index don't leak into the slug. Inline-code text in a heading
    // won't contribute to the slug as a result — reaching back into
    // the renderMarkdown closure to recover the original content is
    // more coupling than it's worth, and dropping the span produces a
    // clean deterministic slug that doesn't depend on document order
    // (the placeholder index shifts whenever an earlier inline-code
    // span is added, which would silently break external `#anchor`
    // links). Authors who want code text in the slug can omit the
    // backticks.
    .replace(/\x00[FIE]\d+\x01/g, '')
    // Reduce `[label](url)` → `label` before any other stripping so the
    // url's chars don't leak into the slug.
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\*\*/g, '')
    .replace(/__/g, '')
    .replace(/~~/g, '')
    .replace(/[*_`]/g, '')
  return plain
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/**
 * Escape inner block/inline text first, then apply inline transforms.
 * Escaping has to happen before the markers are converted because the
 * transforms themselves emit `<` and `>` (e.g. `<strong>`), which we
 * obviously do not want re-escaped. The placeholder sentinels (control
 * chars) survive escape unchanged.
 *
 * Run order is significant:
 *   1. `**` before `*` — otherwise `**foo**` would degenerate into two
 *      empty `*` markers.
 *   2. `__` before `_` — same logic, paired delimiter must consume
 *      first.
 *   3. `~~` after the bold pairs but before single emphasis — `~~` and
 *      `*`/`_` are independent, but the single-emphasis regex is
 *      greedy enough that running strikethrough first keeps things
 *      predictable.
 *   4. Image (`!`) before link — the link regex `\[...\]\(...\)` would
 *      eat `[alt](url)` from `![alt](url)` and leave a stray `!`.
 *
 * Underscore emphasis uses word-boundary lookarounds (`(?<![A-Za-z0-9])`
 * and `(?![A-Za-z0-9])`) so intraword underscores like `snake_case_word`
 * stay literal — the CommonMark "left/right-flanking delimiter" rule
 * simplified. The `(?=\S)` / `(?<=\S)` pieces forbid whitespace right
 * inside the markers (`_ italic _` stays literal).
 */
function renderInlineEscaped(text: string): string {
  let html = htmlEscape(text)
  // Bold MUST run before italic so `**` is consumed as one unit.
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  // Underscore bold — requires non-word boundary on the outer edges
  // and non-whitespace immediately inside the delimiters. The boundary
  // class is `\w` (which includes `_`) so adjacent underscores in
  // sequences like `foo__bar__baz` correctly count as "intraword" and
  // suppress the match. Inner content cannot contain `_` so we don't
  // accidentally chain across an unrelated underscore.
  html = html.replace(
    /(?<!\w)__(?=\S)([^_\n]+?)(?<=\S)__(?!\w)/g,
    '<strong>$1</strong>',
  )
  // Strikethrough — independent of bold/italic but cheaper to run while
  // we still have the inner text in raw form.
  html = html.replace(/~~(.+?)~~/g, '<del>$1</del>')
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>')
  // Underscore italic — same word-boundary rules as underscore bold.
  html = html.replace(
    /(?<!\w)_(?=\S)([^_\n]+?)(?<=\S)_(?!\w)/g,
    '<em>$1</em>',
  )
  // Image MUST run before link so the `[alt](url)` half of `![alt](url)`
  // isn't consumed by the link regex.
  html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_match, alt: string, url: string) => {
    // URL allowlist applies to image src too — the rendered HTML is
    // fed into dangerouslySetInnerHTML, so a `javascript:` src is just
    // as dangerous as a `javascript:` href.
    if (!isSafeUrl(url)) {
      // Round-trip the unrecognized image as literal text. The captures
      // are already post-htmlEscape so simple concatenation produces
      // the correct already-escaped form.
      return `![${alt}](${url})`
    }
    // Self-closing form, consistent with `<br />`. No width/height —
    // host CSS handles sizing (see MarkdownEditorModal MODAL_STYLES
    // for the preview pane). Empty alt is allowed (decorative images).
    return `<img src="${url}" alt="${alt}" />`
  })
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_match, label: string, url: string) => {
    // URL scheme allowlist: the rendered HTML is fed into
    // dangerouslySetInnerHTML, so a `javascript:` (or `data:`,
    // `vbscript:`, ...) href is a clickable XSS sink. Reject anything
    // with a scheme other than http(s) / mailto. Schemeless URLs
    // (relative paths, anchors, queries) are allowed.
    if (!isSafeUrl(url)) {
      // Round-trip the un-recognized link as literal text. The captures
      // are already post-htmlEscape, and the literal `[`, `]`, `(`, `)`
      // are not touched by htmlEscape, so simple concatenation produces
      // the correct already-escaped form.
      return `[${label}](${url})`
    }
    // Anchor-only links target the current page — opening them in a new
    // tab would defeat the whole point (a fresh tab can't scroll to a
    // fragment in the page the reader was just on). htmlEscape leaves
    // `#` untouched, so a `startsWith('#')` check on the already-escaped
    // URL is correct.
    if (url.startsWith('#')) {
      return `<a href="${url}">${label}</a>`
    }
    return `<a href="${url}" target="_blank" rel="noopener noreferrer">${label}</a>`
  })
  return html
}

/**
 * URL safety check for markdown link hrefs and image srcs. Allows:
 *   - http:// or https:// (any case)
 *   - mailto: and tel: (native handlers, not scriptable)
 *   - root-relative (`/...`), anchors (`#...`), queries (`?...`)
 *   - relative paths with no colon-prefixed scheme (`./foo`, `foo/bar`,
 *     `foo.html`) — the regex `[^:]*$` matches strings with no `:` at
 *     all, which covers these.
 *
 * Rejects: `javascript:`, `data:`, `vbscript:`, `file:`, and any other
 * scheme. Whitespace is trimmed before the check so leading-space
 * tricks (`  javascript:...`) don't slip through.
 */
function isSafeUrl(url: string): boolean {
  const trimmed = url.trim().toLowerCase()
  return /^(https?:\/\/|mailto:|tel:|\/|#|\?|[^:]*$)/i.test(trimmed)
}
