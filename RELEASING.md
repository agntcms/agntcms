# Publishing a prepared release

All three npm packages and the bundled private template share one version.
For the prepared 0.5.10 update, keep every release unit at 0.5.10. Do not run
`pnpm release patch`: that legacy command would bump them again to 0.5.11.

## Prepare

Use Node.js 22.11 or later and the repository's pnpm version:

Commit the version and source changes before preparation. The script rejects
a dirty source tree so its checksum manifest identifies the exact source commit.

```sh
npx --yes pnpm@10.33.2 install --frozen-lockfile
npx --yes pnpm@10.33.2 typecheck
npx --yes pnpm@10.33.2 test
npx --yes pnpm@10.33.2 release:prepare
```

Preparation builds the packages and writes three tarballs and a checksum
manifest to `.release/v0.5.10/`. It does not change versions, create a Git tag,
or publish. The CLI archive includes the template. Scaffolded projects pin
`@agntcms/next` and `@agntcms/skills` to the exact CLI version.

Inspect the archives before publishing: the skills archive must include all
17 skills without test output; the CLI must include its executable, template,
Claude settings, and the `_gitignore` placeholder. The packaged CLI dependency
on `@agntcms/skills` must be 0.5.10, without a `workspace:` protocol. The inner
template keeps workspace markers deliberately: the CLI replaces them at
scaffold time, including in local-development mode.

## Publish

Publishing is a separate authorized step. Use the account that can publish
all three packages. If needed, run `npm login` outside the repository so its
project-level token configuration does not interfere with your user login.
Publish the inspected archives from that directory, in dependency order:

```sh
npx --yes pnpm@10.33.2 publish /absolute/path/to/agntcms-skills-0.5.10.tgz --access public --tag latest --no-git-checks
npx --yes pnpm@10.33.2 publish /absolute/path/to/agntcms-next-0.5.10.tgz --access public --tag latest --no-git-checks
npx --yes pnpm@10.33.2 publish /absolute/path/to/create-agntcms-app-0.5.10.tgz --access public --tag latest --no-git-checks
```

If only part of the release succeeds, do not bump again or rebuild archives.
Verify each registry version and integrity, then publish only the missing
archives. After publication, confirm that all three `latest` tags point to
0.5.10, record the release date in CHANGELOG.md, and tag the matching source
commit as `v0.5.10`.

## Try a new project

After all three packages are published, the normal flow is:

```sh
npx create-agntcms-app@latest my-site
cd my-site
pnpm dev
```

For a reproducible check of this particular release, use
`npx create-agntcms-app@0.5.10 my-site`. Open the resulting project in Claude
Desktop and test the editing flow there.
