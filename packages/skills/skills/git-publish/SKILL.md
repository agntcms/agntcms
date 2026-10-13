---
name: agntcms-git-publish
user-invocable: true
description: Commit and deploy content changes only within the user's authorization; runtime publishing changes files only.
---

# agntcms Git and Publishing

Load `agntcms-structure` first.

Publishing through the dev-only API saves the published page, records history, and
removes its draft. It never commits, pushes, or deploys. A local publish is not a
production deployment.

Before committing, verify the published content and review `git status` and the
diff. Commit only when the user requested it or an established automation policy
authorizes it. A request to edit a draft alone does not authorize publication.

Stage exact paths belonging to this operation: the published page, its new history
snapshot, its draft deletion if tracked, and newly referenced assets. Include a
derived blog index only if the project uses one. Preserve unrelated staged and
unstaged changes; never use `git add .`, `git add -A`, or broadly stage `content/`.
Do not mix unrelated code or secrets into a content commit.

Use a meaningful message, for example `Publish article on content versioning`.
A git commit is not shown in the CMS snapshot history; those are separate histories.

Push or create a pull request only within the user's authorization or saved policy.
Report local publication, commit, push/PR, and deployment as separate outcomes.
If a git step fails, content remains changed on disk: report the failure and the
actual file state. Do not claim production success without deployment evidence.
Never configure the user's git identity automatically.
