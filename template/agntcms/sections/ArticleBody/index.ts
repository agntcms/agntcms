import { defineSection } from '@agntcms/next'
import { schema } from './schema'
import { ArticleBodyComponent } from './component'

export const ArticleBody = defineSection({
  name: 'ArticleBody',
  category: 'Blog',
  schema,
  component: ArticleBodyComponent,
  // Representative body lifted from the article-editor demo page. The previewData
  // doubles as the insertion seed so a freshly inserted ArticleBody carries readable
  // prose rather than the bare "Start writing here..." placeholder.
  previewData: {
    body: "Building a booking form is a long exercise in restraint. There is a default version of every feature that nobody actually likes — and yet every platform ships it.\n\n## The list\n\n- A required 'comment' field with a 500-character minimum.\n- A 'submit' button that looks like a 'save draft' button.\n- A modal asking the user to subscribe to the newsletter, two seconds after page load.\n- A preview mode that renders the layout differently than the live page.\n- An autosave indicator that lies — it says 'saved' before the network round-trip finishes.\n- A 'last edited by' timestamp with no diff link.\n- Drag-handles that appear on hover and vanish on click.\n- A right-click menu that overrides the browser's.\n- A help icon that opens a chatbot wired to an overseas contractor.\n- A keyboard shortcut for everything except the one thing you wanted.\n- A breadcrumb that doesn't reflect URL structure.\n- A 'schedule publish' feature with no timezone control.\n\nWe built the inverse of each one. The editor is quiet. It does not cover the canvas. It does not lie about saves. The publish button publishes, the save button saves, and the keyboard shortcuts are in a single panel you can read end-to-end in a minute.\n\n> The best compliment we got: 'I forgot I was using a CMS.'",
  },
})
