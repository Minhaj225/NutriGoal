# Student ownership rollout

The student API now treats the authenticated account ID as the owner of a profile. Deploy the backend and frontend together. Older email-only clients will receive `401` for profile and recommendation requests; they should update and sign in.

New students register at `/student/login`, then create a profile at `/profile`. The email in a URL or request body cannot select a different profile. Existing profiles without `userId` stay unclaimed. Registration with a matching legacy email returns `409 profile_claim_required`; do not link that profile merely because someone supplied its email.

Before a production release, back up the `users` and `students` collections and review canonical email collisions, including case and surrounding whitespace. Resolve collisions with an explicit, reviewed identity decision. Create the partial unique indexes for `users.email` and `students.userId` after that review. A trusted administrator must verify ownership through an out-of-band process before assigning a legacy `student.userId`; record who approved each link. Do not bulk-link profiles by email alone. Task 12 covers the migration tooling and reconciliation.

Rollout checks: register a fresh student; sign in; create, read, update, and delete that student's profile; verify another student's token gets `403` on the compatibility email routes; verify a legacy email gets `profile_claim_required`; verify admin listing and deletion still work. Use disposable or staging data for these checks. If production indexes cannot be created or identity collisions remain unresolved, hold the ownership rollout until they are reviewed.
