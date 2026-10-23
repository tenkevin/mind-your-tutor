# OneRoster 1.1 sample

A small, fake roster for the F5 roster import: `users.csv`, `classes.csv` and
`enrollments.csv`. Names are made up and emails use `example.org`.

- 2 teachers, 3 students, in 2 classes (`c-1` Science 6A, `c-2` Science 6B).
- Columns the app must not keep (COPPA, ARCHITECTURE.md §10): `sms`, `phone`, `grades`,
  `password`, `middleName`, `agentSourcedIds`. The importer keeps only names, email and
  `sourcedId`.
- Rows the importer skips on purpose: a `parent` user (`p-1`), a `tobedeleted` student
  (`s-299`), a `guardian` enrollment (`e-6`) and an enrollment in an unknown class (`e-7`).
- `t-101`'s email is mixed case and is stored lower-case. `s-201` has no email.
