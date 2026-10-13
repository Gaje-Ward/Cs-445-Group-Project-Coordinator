# Dependency Review — October 8, 2026

## Results

The dependency review found eight high-severity npm audit entries from two underlying advisories. The production-only audit reported three high entries. There were no critical, moderate, or low entries in the full audit at that time. Several entries are parent packages reporting the same dependency issue, so the count does not mean eight separate application vulnerabilities.

No new dependency changes were made during this review. The package manifest, lockfile, and existing mysql2 3.24.5 override were retained. The available fixes either required a major change or did not yet exist.

The versions and results below are from October 8, 2026.

## Affected packages

All rows have high severity. A and B identify the underlying advisory; parent-package entries inherit the issue rather than adding separate advisories.

| Package                  | Installed | Direct?                             | Top-level source        | Advisory | Where it is used                          |
| ------------------------ | --------- | ----------------------------------- | ----------------------- | -------- | ----------------------------------------- |
| eslint-config-next       | 16.4.0    | Yes, dev                            | eslint-config-next      | A        | Lint tooling                              |
| @next/eslint-plugin-next | 16.4.0    | No                                  | eslint-config-next      | A        | Lint tooling                              |
| fast-glob                | 3.3.1     | No                                  | eslint-config-next      | A        | Lint glob processing                      |
| micromatch               | 4.0.8     | No                                  | eslint-config-next      | A        | Lint pattern processing                   |
| braces                   | 3.0.3     | No                                  | eslint-config-next      | A        | Brace pattern parsing                     |
| prisma                   | 7.10.0    | Yes, dev; also optional client peer | prisma / @prisma/client | B        | CLI configuration, generation, migrations |
| @prisma/config           | 7.10.0    | No                                  | prisma / @prisma/client | B        | Prisma CLI configuration                  |
| deepmerge-ts             | 7.1.5     | No                                  | prisma / @prisma/client | B        | Configuration merging                     |

A: [GHSA-vfj7-8cjw-p6xm / CVE-2026-93687](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm).
B: [GHSA-ggr8-5vv4-36mx / CVE-2026-40345](https://github.com/advisories/GHSA-ggr8-5vv4-36mx).

Dependency paths confirmed with npm ls:

- eslint-config-next -> @next/eslint-plugin-next -> fast-glob -> micromatch -> braces.
- prisma -> @prisma/config -> deepmerge-ts. @prisma/client has an optional prisma peer, so these packages are marked devOptional and still appear in npm audit --omit=dev.

## braces: lint tooling

The advisory covers versions through 3.0.3, and no patched version was listed during the review. The registry also reported 3.0.3 as the latest release.

Next.js uses braces through its ESLint plugin and fast-glob. The relevant code is in @next/eslint-plugin-next/dist/utils/get-root-dirs.js. This project does not set custom settings.next.rootDir patterns or pass user requests to those libraries. The code review did not find a route from an application request to the affected parser; the lint dependency still needs a fix.

Linting can still process untrusted code or configuration. Any CI job that does this should have limited permissions and no access to secrets.

The fix is waiting on a patched braces release or a compatible tooling update. npm suggested eslint-config-next 14.2.35, but that would replace the Next.js 16 lint tools with version 14 tools. That downgrade was not applied.

## deepmerge-ts: Prisma configuration

The advisory covers versions below 8.0.0. Version 8.0.0 is patched, and the registry reported 8.0.2 as the latest version during the review. The issue involves objects that refer back to themselves. Plain JSON cannot represent those references.

Prisma uses deepmerge-ts when loading configuration in @prisma/config/dist/index.js. The project's prisma.config.ts contains schema, migration, and connection settings; it does not merge user input or objects that refer to themselves. Application requests use the generated client and PostgreSQL adapter in src/lib/db.ts. The review did not find an application request that reaches the affected configuration code.

The packages still appear in the production audit because of Prisma's optional peer relationship with @prisma/client. They are also used during generation and migrations, so the configuration needs to stay trusted and reviewed. The production dependency audit is not clean.

The review deferred an override to deepmerge-ts 8.0.2. Prisma config 7.10.0 pins 7.1.5, and 7.10.0 was the latest listed Prisma 7 release at the time. An override would force Prisma to use a major version outside its required range. It needs compatibility testing before use. A supported upstream release using deepmerge-ts 8 or later would be preferable. npm's proposed downgrade to Prisma 6.12.0 was also rejected.

If an override is tried later, update package.json, package-lock.json, and this report. Then check Prisma configuration, client generation, migrations, and database tests, along with types, lint, unit tests, build, HTTP checks, and the audit.

## Other maintenance notes

The outdated-package check listed major alternatives for jest-dom, Node types, dotenv, ESLint, jsdom, Prisma, and TypeScript. Prisma's alternative was a release candidate. Those upgrades did not provide a compatible fix for the two dependency issues, so they were left for later.

ESLint 9.39.5 produced a deprecation warning. Before moving to ESLint 10, recheck the Next.js plugin peer ranges. Deprecation alone is not another npm advisory. The existing mysql2 3.24.5 override was installed and had no audit entry in this review.

npm ci warned that four installation scripts were not covered by npm allowScripts: @prisma/engines, esbuild, prisma, and unrs-resolver. The allowScripts configuration was left unchanged. Installation and build still completed, and the warning remains recorded here.

## Checks run during the review

| Check                                    | Result on October 8                                                            |
| ---------------------------------------- | ------------------------------------------------------------------------------ |
| Lockfile installation: npm.cmd ci        | Passed after stopping this project's dev server                                |
| TypeScript: npm.cmd run typecheck        | Passed after reinstall                                                         |
| ESLint: npm.cmd run lint                 | Passed after reinstall                                                         |
| Formatting: npm.cmd run format:check     | Passed after the review documentation updates                                  |
| Unit/UI: npm.cmd test                    | 25 passed, 5 files, after reinstall                                            |
| PostgreSQL: npm.cmd run test:integration | 2 passed, 1 file; dedicated gpc_test only                                      |
| Production: npm.cmd run build            | Passed; Prisma client generated and Next.js production build completed         |
| HTTP: npm.cmd run test:http              | Passed; real registration/login/logout/session/dashboard/validation/404 checks |
| Full audit after installation            | Eight high entries remain; zero resolved by this review                        |
| Production-only audit                    | Three high entries remain                                                      |

The first npm ci attempt failed with EPERM because the dev server was using a lightningcss file. Stopping this project's server allowed installation to finish. The HTTP test started and stopped its own server on port 3001.

The existing PostgreSQL containers were reused without resetting data or changing migrations. Database and HTTP tests removed only their own test records. This review did not include another browser walkthrough or an accessibility audit.

## File review

The file review covered the application, configuration, tests, documentation, and lockfile. .env.example contained placeholders only. Checks for local secret values and common private-key or token patterns found no matches. These checks cover the patterns tested, rather than every possible secret format.

Git ignore checks confirmed that .env, node_modules, .next, src/generated, and tsconfig.tsbuildinfo were excluded. The reviewed files did not include real environment files, database dumps, or build output.

The Discord plans need clarification: the backlog describes a project webhook, while another plan describes account linking. That decision is still open.
