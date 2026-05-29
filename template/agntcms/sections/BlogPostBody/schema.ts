export const schema = {
  // The full article body. Headings (##, ###), paragraphs, lists,
  // blockquotes, inline code, and code blocks are all supported.
  body: {
    kind: 'richText' as const,
    default:
      '## A heading\n\nWrite the article body here. Use `##` and `###` for sub-headings, ' +
      'plain paragraphs for prose, and `> ` for pull quotes.\n',
  },
}
