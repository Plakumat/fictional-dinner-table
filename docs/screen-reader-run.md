# Screen-reader run: rows 4–5

Status: **not run yet.** The "Heard" column is filled in from a real run, by
listening. Nothing in it is written from the code.

## Setup

- macOS VoiceOver (`Cmd+F5`) with Safari, or NVDA with Firefox or Chrome.
- `npm start` in the repository root, `npm run dev` in `client/`.
- `npm run reset`, then open `http://localhost:5173/?user=u_ok`.

## What is implemented

- The first Tab lands on a skip link, "Skip to the message box".
- The transcript is not a live region. Streaming text is not announced token
  by token.
- When a response settles, one sentence is placed in a polite live region
  (`client/src/ui/chat/announce.ts`). A gate is announced as "Blocked. …
  Nothing was executed." and a prompt as "Confirmation needed. …".
- The checkout card is a labelled region, named by its heading ("Place this
  order?"). Its status line has `role="status"`. The countdown is not a live
  region.
- The Confirm button is described by the prompt's summary
  (`aria-describedby`).
- The wallet in the account rail is a polite live region.

## Steps

| # | Do | Expected | Heard |
|---|---|---|---|
| 1 | Press Tab, then Enter on the skip link | "Skip to the message box, link", then "Message to the assistant, edit text" | |
| 2 | Type `Order 2 cheeseburgers from Burger Stop`, press Enter | Nothing while the text streams | |
| 3 | Wait for the answer to finish | Once: the assumption text, "Cart, total ₺390.", "Confirmation needed. Place an order at Burger Stop: 2 × Cheeseburger. Total 390 TL …" | |
| 4 | Press Enter in the message box again | Nothing is confirmed, nothing is announced | |
| 5 | Shift+Tab to the Place order button | "Place order, button", then the summary as its description | |
| 6 | Is the countdown read out every second? | No | |
| 7 | Press Enter on the button | "Sending your confirmation…", then "Done. The result is shown below." | |
| 8 | Wait | Once: "Your order from Burger Stop is placed. … Order u_ok_o101, received." | |
| 9 | Is the wallet change announced? | "₺410" | |

## Notes

- Screen reader and browser, with versions:
- Anything announced twice, too late, or not at all:
- Changes made after the run:
