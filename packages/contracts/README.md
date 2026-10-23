# Contracts package

The pack parser trims text cells at their edges before validation. A blank-only
optional text value becomes `null`; interior whitespace and line breaks remain.

`Course.pass_mark` is a percentage from 0 to 100, not a fraction from 0 to 1.
The importer warns when a value below 1 is supplied because it is commonly an
accidental fraction (for example, `0.7` instead of `70`).

Date fields are calendar dates in UTC, written as `YYYY-MM-DD`. They do not
represent a local time or a timestamp.
