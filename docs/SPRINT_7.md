# Sprint 7: Ideas and voting

Sprint 7 implements MVP-07. The Ideas section on a project page lets members propose an approach and vote for proposals they support. Ideas appear newest first, with the author's name and posting time. Pagination shows 25 ideas per page and preserves the selected Discussion page.

## Proposals

An idea needs a title of 2–120 characters and a plain-text description of 1–4,000 characters. Input is trimmed, line breaks are preserved, and HTML is displayed as text. Failed requests keep the draft. Posting from an older page returns to the newest ideas.

Posted ideas cannot be edited, so their wording stays consistent after people vote. The author or project owner can delete an idea after confirming that its votes will also be removed. Project owners cannot rewrite other members' proposals.

## Voting and access

Each current member can vote once per idea, including their own, and remove their vote later. Posting does not automatically cast a vote. The server receives an explicit desired vote state, making repeated requests safe. A database primary key prevents duplicate votes, while a lock on the idea serializes voting and deletion. Totals come from stored votes rather than browser counters. Responses show the total and the caller's vote state without exposing a list of voters.

Every request checks active project membership. Administrator status alone does not bypass that check. Removed teammates lose access, and their votes are deleted with their membership. Rejoining does not restore old votes. Disabling an account blocks later requests but keeps its existing votes while its membership remains.

Ideas remain when their author leaves. Permanently deleting the account removes its memberships and votes, while preserving its proposals under “Former user.” Project deletion removes its ideas and votes. Idea descriptions are not copied into deletion history.

## Storage and verification

The additive add_project_ideas migration adds Idea and IdeaVote. Composite foreign keys keep each vote attached to an idea and membership in the same project. Apply it with npm.cmd run db:deploy; it preserves existing work and requires no new dependencies.

All 140 unit/UI tests and 73 PostgreSQL tests passed. New cases cover concurrent duplicate votes, vote removal, permissions, project isolation, former authors, pagination, and cascade cleanup. The production build and HTTP checks passed, including the existing discussion and administrator flows. Type, lint, and changed-file formatting checks passed.

Local visual and keyboard review remain pending. Refresh to see another member's changes. Ranked results, anonymous ballots, voting deadlines, and proposal editing are outside this increment. MVP-08 weekly check-ins remain next.
