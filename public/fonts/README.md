# Courier Prime

The script pages ask for **Courier Prime** first and fall back to Courier New.
Courier New's stems are lighter, so without these files the type looks grey
next to a script set in Courier Prime — which is what Final Draft, WriterDuet
and most production offices use.

Courier Prime is free (SIL Open Font Licence). To make the pages match exactly,
download it from <https://quoteunquoteapps.com/courierprime/> and drop these
four files into this folder, keeping the names:

    CourierPrime-Regular.ttf
    CourierPrime-Bold.ttf
    CourierPrime-Italic.ttf
    CourierPrime-BoldItalic.ttf

Then rebuild. The `@font-face` rules in `src/styles/app.css` already point
here, and the service worker precaches anything in `public/`, so the font
travels with the installed app and keeps working offline.

Nothing breaks if the files are absent: a face the browser cannot fetch is
skipped and the stack falls through to Courier New.
