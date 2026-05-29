import { describe, it, expect } from 'vitest'
import { renderMarkdown } from './renderMarkdown'

describe('renderMarkdown', () => {
  // -------------------------------------------------------------------------
  // Headings (existing supported markup — must not regress)
  // -------------------------------------------------------------------------

  it('converts # to h1', () => {
    expect(renderMarkdown('# heading')).toBe('<h1 id="heading">heading</h1>')
  })

  it('converts ## to h2', () => {
    expect(renderMarkdown('## heading')).toBe('<h2 id="heading">heading</h2>')
  })

  it('converts ### to h3', () => {
    expect(renderMarkdown('### heading')).toBe('<h3 id="heading">heading</h3>')
  })

  it('converts heading with bold inside', () => {
    expect(renderMarkdown('# heading with **bold**')).toBe(
      '<h1 id="heading-with-bold">heading with <strong>bold</strong></h1>',
    )
  })

  it('converts heading followed by body text', () => {
    expect(renderMarkdown('# Title\nSome text')).toBe(
      '<h1 id="title">Title</h1><br />Some text',
    )
  })

  it('does not convert # without a space after hashes', () => {
    expect(renderMarkdown('#no space')).toBe('#no space')
  })

  // -------------------------------------------------------------------------
  // Inline transforms (existing supported markup — must not regress)
  // -------------------------------------------------------------------------

  it('converts bold text', () => {
    expect(renderMarkdown('**hello**')).toBe('<strong>hello</strong>')
  })

  it('converts italic text', () => {
    expect(renderMarkdown('*hello*')).toBe('<em>hello</em>')
  })

  it('converts bold before italic so ** is not misread as nested *', () => {
    expect(renderMarkdown('**bold** and *italic*')).toBe(
      '<strong>bold</strong> and <em>italic</em>',
    )
  })

  it('handles bold containing italic when properly closed: **bold *italic* end**', () => {
    // After bold pass: <strong>bold *italic* end</strong>
    // After italic pass: <strong>bold <em>italic</em> end</strong>
    expect(renderMarkdown('**bold *italic* end**')).toBe(
      '<strong>bold <em>italic</em> end</strong>',
    )
  })

  it('converts links', () => {
    expect(renderMarkdown('[click](https://example.com)')).toBe(
      '<a href="https://example.com" target="_blank" rel="noopener noreferrer">click</a>',
    )
  })

  it('converts newlines to <br />', () => {
    expect(renderMarkdown('line1\nline2')).toBe('line1<br />line2')
  })

  it('handles mixed content', () => {
    const input = '**Bold** and *italic* with a [link](https://x.com)\nNew line'
    const expected =
      '<strong>Bold</strong> and <em>italic</em> with a ' +
      '<a href="https://x.com" target="_blank" rel="noopener noreferrer">link</a>' +
      '<br />New line'
    expect(renderMarkdown(input)).toBe(expected)
  })

  it('returns empty string for empty input', () => {
    expect(renderMarkdown('')).toBe('')
  })

  it('returns empty string for undefined input', () => {
    expect(renderMarkdown(undefined)).toBe('')
  })

  it('returns empty string for null input', () => {
    expect(renderMarkdown(null)).toBe('')
  })

  it('passes through plain text unchanged', () => {
    expect(renderMarkdown('no markdown here')).toBe('no markdown here')
  })

  it('handles multiple bold segments', () => {
    expect(renderMarkdown('**a** and **b**')).toBe(
      '<strong>a</strong> and <strong>b</strong>',
    )
  })

  it('handles multiple italic segments', () => {
    expect(renderMarkdown('*a* and *b*')).toBe('<em>a</em> and <em>b</em>')
  })

  it('handles link with bold text inside', () => {
    // Link pass first captures `**text**` verbatim; bold pass then
    // operates on the rendered anchor body. The output is identical to
    // the previous (link-after-bold) ordering — we reordered to keep
    // the link-text escape from neutralising `<strong>` markers.
    expect(renderMarkdown('[**text**](https://x.com)')).toBe(
      '<a href="https://x.com" target="_blank" rel="noopener noreferrer"><strong>text</strong></a>',
    )
  })

  // -------------------------------------------------------------------------
  // HTML escaping — security-critical: anything user-typed must render as
  // text, not be interpreted as HTML by the consumer's
  // dangerouslySetInnerHTML.
  // -------------------------------------------------------------------------

  it('escapes raw <script> tags as literal text', () => {
    expect(renderMarkdown('<script>alert(1)</script>')).toBe(
      '&lt;script&gt;alert(1)&lt;/script&gt;',
    )
  })

  it('escapes ampersands', () => {
    expect(renderMarkdown('A & B')).toBe('A &amp; B')
  })

  it('escapes double-quotes', () => {
    expect(renderMarkdown('say "hi"')).toBe('say &quot;hi&quot;')
  })

  it('escapes ampersands inside link URLs (still a valid href)', () => {
    expect(renderMarkdown('[x](http://e.com?a=1&b=2)')).toBe(
      '<a href="http://e.com?a=1&amp;b=2" target="_blank" rel="noopener noreferrer">x</a>',
    )
  })

  it('escapes < > inside text but still emits whitelisted tags around it', () => {
    expect(renderMarkdown('**a<b>c**')).toBe('<strong>a&lt;b&gt;c</strong>')
  })

  // -------------------------------------------------------------------------
  // Inline code
  // -------------------------------------------------------------------------

  it('renders inline code', () => {
    expect(renderMarkdown('use `foo` here')).toBe('use <code>foo</code> here')
  })

  it('escapes HTML inside inline code', () => {
    expect(renderMarkdown('see `<div>`')).toBe('see <code>&lt;div&gt;</code>')
  })

  it('does not apply bold/italic/link inside inline code', () => {
    expect(renderMarkdown('try `**not bold** *not italic* [no](link)`')).toBe(
      'try <code>**not bold** *not italic* [no](link)</code>',
    )
  })

  it('handles inline code mixed with bold around it', () => {
    expect(renderMarkdown('**bold** and `code` and *italic*')).toBe(
      '<strong>bold</strong> and <code>code</code> and <em>italic</em>',
    )
  })

  // -------------------------------------------------------------------------
  // Fenced code blocks
  // -------------------------------------------------------------------------

  it('renders a fenced code block without language', () => {
    expect(renderMarkdown('```\nfoo\nbar\n```')).toBe(
      '<pre><code>foo\nbar</code></pre>',
    )
  })

  it('renders a fenced code block with language tag', () => {
    expect(renderMarkdown('```js\nconst x = 1\n```')).toBe(
      '<pre><code class="language-js">const x = 1</code></pre>',
    )
  })

  it('escapes HTML inside fenced code blocks', () => {
    expect(renderMarkdown('```\n<script>alert(1)</script>\n```')).toBe(
      '<pre><code>&lt;script&gt;alert(1)&lt;/script&gt;</code></pre>',
    )
  })

  it('does not apply markdown rules inside fenced code blocks', () => {
    expect(renderMarkdown('```\n# not a heading\n**not bold**\n- not a list\n```')).toBe(
      '<pre><code># not a heading\n**not bold**\n- not a list</code></pre>',
    )
  })

  it('renders fenced code with surrounding plain text', () => {
    // The newline boundaries between block and plain text become <br /> —
    // harmless since <pre> is block-level. Documenting current behavior.
    expect(renderMarkdown('before\n```\nfoo\n```\nafter')).toBe(
      'before<br /><pre><code>foo</code></pre><br />after',
    )
  })

  // -------------------------------------------------------------------------
  // Unordered lists
  // -------------------------------------------------------------------------

  it('renders an unordered list with `-` markers', () => {
    expect(renderMarkdown('- a\n- b')).toBe('<ul><li>a</li><li>b</li></ul>')
  })

  it('renders an unordered list with `*` markers', () => {
    expect(renderMarkdown('* a\n* b')).toBe('<ul><li>a</li><li>b</li></ul>')
  })

  it('applies inline transforms inside list items', () => {
    expect(renderMarkdown('- **bold**\n- *italic*\n- [link](https://x.com)')).toBe(
      '<ul>' +
        '<li><strong>bold</strong></li>' +
        '<li><em>italic</em></li>' +
        '<li><a href="https://x.com" target="_blank" rel="noopener noreferrer">link</a></li>' +
        '</ul>',
    )
  })

  it('escapes HTML inside list items', () => {
    // Two-item list is required under the ≥2-consecutive-matching-lines
    // rule. The point of this test is to verify HTML escaping inside
    // <li>, not the list-grouping rule itself.
    expect(renderMarkdown('- <b>x</b>\n- <i>y</i>')).toBe(
      '<ul><li>&lt;b&gt;x&lt;/b&gt;</li><li>&lt;i&gt;y&lt;/i&gt;</li></ul>',
    )
  })

  it('breaks the list on a non-list line', () => {
    // Under the ≥2-consecutive-matching-lines rule, neither `- a` nor
    // `- b` qualifies as a list (each is alone in its run), so both
    // fall through to plain rendering. This protects pre-existing
    // content that happens to start a line with `- ` from suddenly
    // becoming a list item after the renderer learned about lists.
    expect(renderMarkdown('- a\nplain\n- b')).toBe('- a<br />plain<br />- b')
  })

  it('renders a single `- ` line as plain text (≥2 rule)', () => {
    expect(renderMarkdown('- text')).toBe('- text')
  })

  it('renders a single `* ` line as plain text (≥2 rule)', () => {
    expect(renderMarkdown('* text')).toBe('* text')
  })

  // -------------------------------------------------------------------------
  // Ordered lists
  // -------------------------------------------------------------------------

  it('renders an ordered list', () => {
    expect(renderMarkdown('1. a\n2. b\n3. c')).toBe(
      '<ol><li>a</li><li>b</li><li>c</li></ol>',
    )
  })

  it('renders an ordered list with non-incrementing markers (per spec)', () => {
    // Markdown allows ordered lists where every item starts with `1.` —
    // browsers handle the numbering. We do not renumber.
    expect(renderMarkdown('1. a\n1. b')).toBe('<ol><li>a</li><li>b</li></ol>')
  })

  it('applies inline transforms inside ordered list items', () => {
    expect(renderMarkdown('1. **bold**\n2. plain')).toBe(
      '<ol><li><strong>bold</strong></li><li>plain</li></ol>',
    )
  })

  it('renders a single `1. ` line as plain text (≥2 rule)', () => {
    // Regression guard: pre-existing content sometimes uses literal
    // `1. ` as a numbered note rather than as the start of a list.
    // Single-line ordered markers must NOT be eaten into <ol>.
    expect(renderMarkdown('1. text')).toBe('1. text')
  })

  it('still groups two `1.` lines into an ordered list', () => {
    // Sanity check: the ≥2 rule fires on the second matching line, so
    // a real two-item ordered list still renders correctly even when
    // both items use the same `1.` marker.
    expect(renderMarkdown('1. a\n1. b')).toBe('<ol><li>a</li><li>b</li></ol>')
  })

  it('renders a multi-paragraph selection prefixed with 1. as a real list', () => {
    // Simulates what the editor's prefixLines should produce after the
    // fix: two paragraphs collapsed into consecutive list items (no
    // orphan blank-line marker between them).
    const source = '1. paragraph one\n1. paragraph two'
    expect(renderMarkdown(source)).toBe(
      '<ol><li>paragraph one</li><li>paragraph two</li></ol>',
    )
  })

  it('renders a multi-paragraph selection with sequential markers as the same <ol>', () => {
    // The toolbar now emits incrementing numbers for source readability.
    // Both forms must render identically: the renderer does not renumber.
    const source = '1. paragraph one\n2. paragraph two'
    expect(renderMarkdown(source)).toBe(
      '<ol><li>paragraph one</li><li>paragraph two</li></ol>',
    )
  })

  // -------------------------------------------------------------------------
  // Blockquote
  // -------------------------------------------------------------------------

  it('renders a single-line blockquote', () => {
    expect(renderMarkdown('> quoted')).toBe('<blockquote>quoted</blockquote>')
  })

  it('joins consecutive blockquote lines with a space', () => {
    expect(renderMarkdown('> line one\n> line two')).toBe(
      '<blockquote>line one line two</blockquote>',
    )
  })

  it('applies inline transforms inside blockquotes', () => {
    expect(renderMarkdown('> **bold** and `code`')).toBe(
      '<blockquote><strong>bold</strong> and <code>code</code></blockquote>',
    )
  })

  it('escapes HTML inside blockquotes', () => {
    expect(renderMarkdown('> <b>x</b>')).toBe(
      '<blockquote>&lt;b&gt;x&lt;/b&gt;</blockquote>',
    )
  })

  // -------------------------------------------------------------------------
  // URL scheme allowlist — security-critical: the link href is emitted into
  // dangerouslySetInnerHTML, so dangerous schemes (javascript:, data:,
  // vbscript:, ...) must not produce a clickable <a>.
  // -------------------------------------------------------------------------

  describe('URL scheme allowlist', () => {
    it('rejects javascript: scheme and renders as literal text', () => {
      // No raw `[` `]` `(` `)` are escaped by htmlEscape, so the literal
      // fallback is byte-identical to the input.
      expect(renderMarkdown('[click](javascript:alert(1))')).toBe(
        '[click](javascript:alert(1))',
      )
    })

    it('rejects data: scheme', () => {
      expect(renderMarkdown('[x](data:text/html,<script>alert(1)</script>)')).toBe(
        // The label and URL go through htmlEscape first, so `<` `>` inside
        // become `&lt;` `&gt;` in the literal-text fallback.
        '[x](data:text/html,&lt;script&gt;alert(1)&lt;/script&gt;)',
      )
    })

    it('rejects vbscript: scheme', () => {
      expect(renderMarkdown('[x](vbscript:msgbox)')).toBe('[x](vbscript:msgbox)')
    })

    it('rejects javascript: scheme regardless of casing', () => {
      expect(renderMarkdown('[click](JAVASCRIPT:alert(1))')).toBe(
        '[click](JAVASCRIPT:alert(1))',
      )
    })

    it('rejects javascript: scheme with leading whitespace', () => {
      // Trimming before the scheme check matters — a leading space would
      // otherwise let `  javascript:...` slip through as "schemeless".
      expect(renderMarkdown('[click](  javascript:alert(1))')).toBe(
        '[click](  javascript:alert(1))',
      )
    })

    it('allows https://', () => {
      expect(renderMarkdown('[x](https://example.com)')).toBe(
        '<a href="https://example.com" target="_blank" rel="noopener noreferrer">x</a>',
      )
    })

    it('allows http://', () => {
      expect(renderMarkdown('[x](http://example.com)')).toBe(
        '<a href="http://example.com" target="_blank" rel="noopener noreferrer">x</a>',
      )
    })

    it('allows mailto:', () => {
      expect(renderMarkdown('[x](mailto:a@b.com)')).toBe(
        '<a href="mailto:a@b.com" target="_blank" rel="noopener noreferrer">x</a>',
      )
    })

    it('allows root-relative paths', () => {
      expect(renderMarkdown('[x](/relative/path)')).toBe(
        '<a href="/relative/path" target="_blank" rel="noopener noreferrer">x</a>',
      )
    })

    it('allows anchor-only hrefs and omits target/rel so the current tab scrolls', () => {
      // Anchor-only links must stay in the current tab — a new tab cannot
      // scroll to a fragment in the originating page. target/rel are
      // intentionally omitted.
      expect(renderMarkdown('[x](#anchor)')).toBe('<a href="#anchor">x</a>')
    })

    it('allows query-only hrefs', () => {
      expect(renderMarkdown('[x](?query=1)')).toBe(
        '<a href="?query=1" target="_blank" rel="noopener noreferrer">x</a>',
      )
    })

    it('allows relative paths with no colon (./relative)', () => {
      expect(renderMarkdown('[x](./relative)')).toBe(
        '<a href="./relative" target="_blank" rel="noopener noreferrer">x</a>',
      )
    })
  })

  // -------------------------------------------------------------------------
  // Sentinel control characters — defense against placeholder collision
  // when `\x00` or `\x01` arrive via paste or programmatic input.
  // -------------------------------------------------------------------------

  it('strips sentinel control chars (\\x00, \\x01) from input', () => {
    const out = renderMarkdown('hel\x00lo\x01 world')
    expect(out).not.toContain('\x00')
    expect(out).not.toContain('\x01')
    expect(out).toBe('hello world')
  })

  // -------------------------------------------------------------------------
  // Mixed-content end-to-end
  // -------------------------------------------------------------------------

  it('renders a document mixing headings, lists, quote, code', () => {
    const input = [
      '# Title',
      'Intro **bold**.',
      '- one',
      '- two',
      '> a quote',
      '```js',
      'const x = 1',
      '```',
      'after',
    ].join('\n')
    const expected =
      '<h1 id="title">Title</h1>' +
      '<br />' +
      'Intro <strong>bold</strong>.' +
      '<ul><li>one</li><li>two</li></ul>' +
      '<blockquote>a quote</blockquote>' +
      '<pre><code class="language-js">const x = 1</code></pre>' +
      '<br />' +
      'after'
    expect(renderMarkdown(input)).toBe(expected)
  })

  // -------------------------------------------------------------------------
  // Inline images
  // -------------------------------------------------------------------------

  describe('inline images', () => {
    it('renders a basic image', () => {
      expect(renderMarkdown('![alt](https://example.com/x.png)')).toBe(
        '<img src="https://example.com/x.png" alt="alt" />',
      )
    })

    it('allows empty alt for decorative images', () => {
      expect(renderMarkdown('![](https://example.com/x.png)')).toBe(
        '<img src="https://example.com/x.png" alt="" />',
      )
    })

    it('rejects javascript: scheme in image src and falls back to literal', () => {
      // Same allowlist as link: dangerous schemes round-trip as text.
      expect(renderMarkdown('![](javascript:foo)')).toBe('![](javascript:foo)')
    })

    it('rejects data: scheme in image src', () => {
      expect(renderMarkdown('![x](data:image/png;base64,abc)')).toBe(
        '![x](data:image/png;base64,abc)',
      )
    })

    it('escapes HTML inside image alt text', () => {
      // htmlEscape runs on the whole line before the image regex, so
      // the captured alt is already `&lt;script&gt;`.
      expect(renderMarkdown('![<script>](https://e.com/x.png)')).toBe(
        '<img src="https://e.com/x.png" alt="&lt;script&gt;" />',
      )
    })

    it('runs image before link so ![x](u) is not eaten by the link regex', () => {
      // If link ran first it would consume `[x](u)` and leave a stray `!`.
      expect(renderMarkdown('![x](https://e.com/y.png)')).toBe(
        '<img src="https://e.com/y.png" alt="x" />',
      )
    })

    it('leaves a lone `!` literal when not followed by [..](..)', () => {
      expect(renderMarkdown('hello!')).toBe('hello!')
      expect(renderMarkdown('!world')).toBe('!world')
    })

    it('allows root-relative image src', () => {
      expect(renderMarkdown('![x](/assets/y.png)')).toBe(
        '<img src="/assets/y.png" alt="x" />',
      )
    })

    it('does not interpret images inside inline code', () => {
      expect(renderMarkdown('`![x](u)`')).toBe('<code>![x](u)</code>')
    })
  })

  // -------------------------------------------------------------------------
  // Strikethrough (GFM ~~text~~ → <del>)
  // -------------------------------------------------------------------------

  describe('strikethrough', () => {
    it('renders basic strikethrough', () => {
      expect(renderMarkdown('~~gone~~')).toBe('<del>gone</del>')
    })

    it('combines with bold', () => {
      // Bold runs first, leaving `~~strike~~` inside the <strong> tag.
      expect(renderMarkdown('**bold ~~strike~~**')).toBe(
        '<strong>bold <del>strike</del></strong>',
      )
    })

    it('combines with italic', () => {
      // Strike runs before italic, so the `*` markers remain to match.
      expect(renderMarkdown('~~strike *and* italic~~')).toBe(
        '<del>strike <em>and</em> italic</del>',
      )
    })

    it('does not apply inside inline code', () => {
      expect(renderMarkdown('`~~not strike~~`')).toBe(
        '<code>~~not strike~~</code>',
      )
    })

    it('leaves an unclosed ~~ literal', () => {
      expect(renderMarkdown('~~hello')).toBe('~~hello')
    })

    it('handles multiple strike segments on one line', () => {
      expect(renderMarkdown('~~a~~ and ~~b~~')).toBe(
        '<del>a</del> and <del>b</del>',
      )
    })
  })

  // -------------------------------------------------------------------------
  // Underscore emphasis (CommonMark _italic_ / __bold__ with intraword guard)
  // -------------------------------------------------------------------------

  describe('underscore emphasis', () => {
    it('renders _text_ as italic', () => {
      expect(renderMarkdown('_hello_')).toBe('<em>hello</em>')
    })

    it('renders __text__ as bold', () => {
      expect(renderMarkdown('__hello__')).toBe('<strong>hello</strong>')
    })

    it('keeps intraword underscores literal (snake_case_word)', () => {
      expect(renderMarkdown('snake_case_word')).toBe('snake_case_word')
    })

    it('keeps intraword __ literal mid-word (foo__bar__baz)', () => {
      expect(renderMarkdown('foo__bar__baz')).toBe('foo__bar__baz')
    })

    it('keeps `_ italic _` literal — whitespace inside markers is rejected', () => {
      // The (?=\S) / (?<=\S) lookarounds enforce CommonMark's
      // left/right-flanking delimiter rule (simplified): no space
      // immediately inside the markers.
      expect(renderMarkdown('_ italic _')).toBe('_ italic _')
    })

    it('does not crash on ___boldItalic___ (nested mixed not supported)', () => {
      // Bold-with-trailing-italic is out of scope. Just verify it
      // produces a deterministic (and HTML-safe) string.
      const result = renderMarkdown('___boldItalic___')
      expect(typeof result).toBe('string')
      expect(result).not.toContain('<script')
    })

    it('runs __ before _ so paired underscores are consumed first', () => {
      expect(renderMarkdown('__bold__ and _italic_')).toBe(
        '<strong>bold</strong> and <em>italic</em>',
      )
    })

    it('allows underscore emphasis next to punctuation', () => {
      expect(renderMarkdown('say _hi_!')).toBe('say <em>hi</em>!')
    })

    it('does not apply underscore emphasis inside inline code', () => {
      expect(renderMarkdown('`_not italic_`')).toBe(
        '<code>_not italic_</code>',
      )
    })
  })

  // -------------------------------------------------------------------------
  // Horizontal rule
  // -------------------------------------------------------------------------

  describe('horizontal rule', () => {
    it('renders --- on its own line as <hr />', () => {
      expect(renderMarkdown('---')).toBe('<hr />')
    })

    it('renders *** on its own line as <hr />', () => {
      expect(renderMarkdown('***')).toBe('<hr />')
    })

    it('renders ___ on its own line as <hr />', () => {
      expect(renderMarkdown('___')).toBe('<hr />')
    })

    it('renders longer runs of dashes as <hr />', () => {
      expect(renderMarkdown('----------')).toBe('<hr />')
    })

    it('keeps `--` (only two) as plain text', () => {
      expect(renderMarkdown('--')).toBe('--')
    })

    it('keeps `--- text` (with trailing content) as plain text', () => {
      expect(renderMarkdown('--- text')).toBe('--- text')
    })

    it('renders <hr /> between two paragraphs (no surrounding <br />)', () => {
      // HR is a true block element (detected at the line level, like
      // lists/blockquotes), so the `\n` boundaries are consumed during
      // block grouping rather than surviving to the `\n→<br />` pass.
      // Same behavior as `blockquote between paragraphs` etc. — distinct
      // from fenced code blocks, which extract via placeholder and DO
      // gain surrounding <br />.
      expect(renderMarkdown('before\n---\nafter')).toBe(
        'before<hr />after',
      )
    })
  })

  // -------------------------------------------------------------------------
  // Backslash escapes
  // -------------------------------------------------------------------------

  describe('backslash escapes', () => {
    it('keeps \\* literal so `*` is not consumed by italic', () => {
      expect(renderMarkdown('\\*not bold\\*')).toBe('*not bold*')
    })

    it('keeps \\# literal so a heading is not produced', () => {
      expect(renderMarkdown('\\# foo')).toBe('# foo')
    })

    it('renders \\\\ as a single backslash', () => {
      expect(renderMarkdown('\\\\')).toBe('\\')
    })

    it('does not process escapes inside fenced code blocks', () => {
      // Fenced extraction happens BEFORE escape extraction, so `\*`
      // inside the fence is opaque to ESCAPABLE_RE.
      expect(renderMarkdown('```\n\\*literal\\*\n```')).toBe(
        '<pre><code>\\*literal\\*</code></pre>',
      )
    })

    it('does not process escapes inside inline code', () => {
      expect(renderMarkdown('`\\*literal\\*`')).toBe(
        '<code>\\*literal\\*</code>',
      )
    })

    it('leaves `\\a` (non-escapable char) as the literal two characters', () => {
      // `a` is not in ESCAPABLE_RE so the backslash stays.
      expect(renderMarkdown('\\a')).toBe('\\a')
    })

    it('escapes link brackets so [text](url) renders as literal', () => {
      expect(renderMarkdown('\\[click\\](url)')).toBe('[click](url)')
    })

    it('escapes ! so an image is not produced', () => {
      // `\!` consumes only the `!`, leaving `[alt](u)` as a regular link.
      expect(renderMarkdown('\\![alt](https://e.com)')).toBe(
        '!<a href="https://e.com" target="_blank" rel="noopener noreferrer">alt</a>',
      )
    })

    it('escapes ~ so strikethrough is not triggered', () => {
      expect(renderMarkdown('\\~\\~not strike\\~\\~')).toBe('~~not strike~~')
    })

    it('escapes _ so underscore italic is not triggered', () => {
      expect(renderMarkdown('\\_not italic\\_')).toBe('_not italic_')
    })
  })

  // -------------------------------------------------------------------------
  // Block-marker escaping — covers the renderBlocks branch that handles
  // `\>`, `\-`, `\1.` (markers NOT in ESCAPABLE_RE, so the inline escape
  // pass never sees them — this branch is their only line of defense).
  // -------------------------------------------------------------------------

  describe('block-marker escaping', () => {
    it('renders `\\> foo` as plain text (no <blockquote>)', () => {
      expect(renderMarkdown('\\> foo')).toBe('&gt; foo')
    })

    it('renders two `\\- ` lines as plain text (no <ul>)', () => {
      expect(renderMarkdown('\\- foo\n\\- bar')).toBe('- foo<br />- bar')
    })

    it('renders two `\\1. ` lines as plain text (no <ol>)', () => {
      expect(renderMarkdown('\\1. foo\n\\1. bar')).toBe('1. foo<br />1. bar')
    })

    it('still groups `> ` lines into <blockquote> when not escaped', () => {
      // Negative control: proves the escape branch isn't over-triggering on
      // unescaped block markers.
      expect(renderMarkdown('> foo\n> bar')).toBe(
        '<blockquote>foo bar</blockquote>',
      )
    })

    it('still groups `- ` lines into <ul> when not escaped', () => {
      // Negative control mirroring the one above for unordered lists.
      expect(renderMarkdown('- foo\n- bar')).toBe(
        '<ul><li>foo</li><li>bar</li></ul>',
      )
    })
  })

  // -------------------------------------------------------------------------
  // Mixed end-to-end with all five new features
  // -------------------------------------------------------------------------

  it('renders a document combining image, strike, underscore emphasis, HR, and escape', () => {
    const input = [
      '# Title',
      '_intro_ with __emphasis__ and ~~strike~~.',
      '---',
      '![pic](https://e.com/x.png)',
      'literal \\*star\\* and \\#hash.',
    ].join('\n')
    const expected =
      '<h1 id="title">Title</h1>' +
      '<br />' +
      '<em>intro</em> with <strong>emphasis</strong> and <del>strike</del>.' +
      '<hr />' +
      '<img src="https://e.com/x.png" alt="pic" />' +
      '<br />' +
      'literal *star* and #hash.'
    expect(renderMarkdown(input)).toBe(expected)
  })

  // Preserve tel: scheme support added on the feature branch — main's
  // isSafeUrl was extended to include it.
  it('allows tel: links', () => {
    expect(renderMarkdown('[call](tel:+15551234567)')).toBe(
      '<a href="tel:+15551234567" target="_blank" rel="noopener noreferrer">call</a>',
    )
  })

  // -------------------------------------------------------------------------
  // Heading anchor support — id slugs + anchor-only links staying in tab.
  // The two pieces are co-designed so `[x](#slug)` actually scrolls.
  // -------------------------------------------------------------------------

  describe('heading anchors', () => {
    it('slugifies a multi-word heading into an id', () => {
      expect(renderMarkdown('# Hello World')).toBe(
        '<h1 id="hello-world">Hello World</h1>',
      )
    })

    it('round-trips a heading slug with an anchor-only link', () => {
      // The two features are interdependent: heading ids are useless
      // without scroll-in-tab anchor links, and vice versa. The combined
      // output proves both pieces fit.
      expect(renderMarkdown('# Hello World\n\n[go](#hello-world)')).toBe(
        '<h1 id="hello-world">Hello World</h1>' +
          '<br /><br />' +
          '<a href="#hello-world">go</a>',
      )
    })

    it('slugifies heading text after stripping markdown emphasis', () => {
      // The slug must reflect what the reader sees, not the markup. So
      // `# **Bold** title` slugs as `bold-title`, not `-bold--title-`.
      expect(renderMarkdown('# **Bold** title')).toBe(
        '<h1 id="bold-title"><strong>Bold</strong> title</h1>',
      )
    })

    it('omits the id attribute when the slug reduces to empty', () => {
      // `# !!!` has no alphanumerics — the slug collapses to "". Emitting
      // `id=""` would be a useless (and arguably malformed) attribute.
      expect(renderMarkdown('# !!!')).toBe('<h1>!!!</h1>')
    })

    it('does not leak inline-code sentinel placeholder into heading id', () => {
      // Inline code in the heading runs through the I-sentinel pool
      // BEFORE renderPlainLine sees the text. If slugifyHeading doesn't
      // strip those placeholders, the slug ends up something like
      // `foo-i0-bar` (the `I` and digit leak through; control chars
      // collapse to `-`). The slug must instead drop the placeholder
      // entirely so the result is deterministic.
      const out = renderMarkdown('# foo `code` bar')
      expect(out).toBe(
        '<h1 id="foo-bar">foo <code>code</code> bar</h1>',
      )
    })

    it('does not leak backslash-escape sentinel placeholder into heading id', () => {
      // `\*` is captured by the E-sentinel pool before renderPlainLine
      // runs. Same risk as inline code: the `E<idx>` tag would otherwise
      // leak into the slug. Body must still honour the escape and emit
      // a literal `*`.
      const out = renderMarkdown('# foo \\* bar')
      expect(out).toBe('<h1 id="foo-bar">foo * bar</h1>')
    })

    it('slug is stable regardless of earlier inline-code spans in the document', () => {
      // The placeholder index for inline code is monotonic across the
      // document, so an earlier `` `a` `` span would shift the heading's
      // own placeholder from I0 → I1 if the slug were derived from the
      // sentinel content. Stripping placeholders makes the slug depend
      // only on the heading text, which is what external `#anchor` links
      // rely on for stability across edits.
      expect(renderMarkdown('# Title')).toContain('id="title"')
      expect(renderMarkdown('`a` foo\n\n# Title')).toContain('id="title"')
    })

    it('suffixes duplicate heading slugs (-2, -3, ...) within one document', () => {
      // Multiple headings with identical text must produce distinct ids
      // — two `<h1 id="hello">` is invalid HTML and browsers only jump
      // to the first match. GitHub-style numbering: first occurrence
      // keeps the bare slug, subsequent ones get `-2`, `-3`, ….
      expect(renderMarkdown('# Hello\n\n# Hello\n\n# Hello')).toBe(
        '<h1 id="hello">Hello</h1>' +
          '<br /><br />' +
          '<h1 id="hello-2">Hello</h1>' +
          '<br /><br />' +
          '<h1 id="hello-3">Hello</h1>',
      )
    })

    it('dedup state is per-renderMarkdown call, not module-level', () => {
      // Two independent calls must each see a fresh counter. A
      // module-level Map would otherwise leak heading ids across
      // unrelated documents (and across React renders).
      expect(renderMarkdown('# Hello')).toBe('<h1 id="hello">Hello</h1>')
      expect(renderMarkdown('# Hello')).toBe('<h1 id="hello">Hello</h1>')
    })

    it('does not count empty-slug headings toward dedup', () => {
      // `# !!!` slugs to "" and emits no id. The empty slug must not
      // enter the dedup map; otherwise the second `# !!!` would get
      // `id="-2"` (or similar) instead of also being id-less.
      expect(renderMarkdown('# !!!\n\n# !!!')).toBe(
        '<h1>!!!</h1><br /><br /><h1>!!!</h1>',
      )
    })
  })
})
