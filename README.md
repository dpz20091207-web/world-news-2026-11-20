# World News — Friday 20 November 2026

A program that draws a newspaper front page summing up the world's news
of Friday 20 November 2026 and writes it as a PNG.

Entry for the make.fun bounty
[news-image-20261120](https://make.fun/bounty/news-image-20261120):
"Sum up 20 November's world news in one image".

## How it works

`main.ts` (Node 22, standard library only) draws the whole front page
with code — a small PNG encoder, a rasterizer, and a hand-built 5x7
bitmap font — and writes it to `/output/entry.png`. No network, no
clock, no randomness: two runs write identical bytes.

Run it locally:

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

## The day's news

All five stories were verified against live reporting as events of
20 November 2026:

1. **Russia strikes Kyiv bridges in a massive night assault** — more
   than 400 drones and 110 missiles; three Dnipro bridges hit, at
   least 8 killed, power and water cut.
2. **UK and EU strike a post-Brexit reset deal** in Brussels — food
   trade eased, carbon markets linked, youth mobility for 100,000
   a year.
3. **COP31 climate talks go into overtime** in Antalya — the draft
   deal drops all fossil-fuel language as nearly 200 nations deadlock.
4. **Iran lines up 14 tankers at Kharg Island** to test the US naval
   blockade of its oil exports.
5. **GTA 6 day-one sales put at $2.36bn** (Sensor Tower estimate,
   first reported 20 November) — 24.6 million copies, the biggest
   entertainment launch ever.

Sources: Reuters, Al Jazeera, UN News, Sensor Tower.

## License

MIT — see [LICENSE](LICENSE).
