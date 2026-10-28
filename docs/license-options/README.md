# License options (decision pending)

The repository has no `LICENSE` file yet. Pick one option, then copy the files as described.
Neither option is open source, and neither is a permissive license (the owner keeps the right
to commercialise).

| | Option 1: All rights reserved | Option 2: PolyForm Noncommercial 1.0.0 |
|---|---|---|
| Files | `all-rights-reserved.LICENSE` | `PolyForm-Noncommercial-1.0.0.md` (unmodified upstream text) |
| Others may | read and evaluate | read, run, modify and share for noncommercial purposes |
| Commercial use | needs written permission | needs written permission |
| Recognised by GitHub / SPDX | no | yes (`PolyForm-Noncommercial-1.0.0`) |
| Ask-first friction for hobbyists | high | low |

## Apply option 1
```sh
cp docs/license-options/all-rights-reserved.LICENSE LICENSE
```

## Apply option 2
```sh
cp docs/license-options/PolyForm-Noncommercial-1.0.0.md LICENSE
printf '\nRequired Notice: Copyright 2026 Sodabeh Taherpanah\n' >> LICENSE
```
(The Required Notice line is the standard way to name the licensor; the license text itself stays
unchanged.)

## README text (replaces the "License" section; same for both options)
```md
## License
This is a personal project with possible commercial intent. The code is public so that it can be
read and evaluated (for example as a portfolio). It is **not open source**. Copyright (c) 2026
Sodabeh Taherpanah. Commercial use needs written permission from the copyright holder.
<!-- Option 1: All rights reserved, see LICENSE. -->
<!-- Option 2: licensed under PolyForm Noncommercial 1.0.0, see LICENSE. -->
```
After applying, delete this folder and set `"license"` in `package.json` to
`SEE LICENSE IN LICENSE` (option 1) or `PolyForm-Noncommercial-1.0.0` (option 2).

Not legal advice. Contributor note: so the owner can relicense later, all code must stay owned by
the owner (see `docs/STATUS.md`, section "Contributors").
