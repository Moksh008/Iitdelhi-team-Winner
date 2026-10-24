# Alert-wording study (assumption A4)

**Status: designed, not yet run.** The deck's assumption A4 is "people act on a specific question". This is a 15-minute study you can run with 5 to 10 volunteers to test it before the finale. Results go in `docs/metrics/wording-study.csv` and are summarised by `node tools/eval/wording-study.mjs`.

## What we compare

Each volunteer sees both alerts, in random order, over two different scripted calls (so they never see the same scam twice).

**A. Satark (specific)**
> **Pause before you pay**
> This follows a call that sounds like a digital arrest scam. Police never arrest anyone over a video call.
> **Did the caller ask you to move money to a "safe" account?**
> [Yes, help me report] [No, I know this person] [Wait 60 s]

**B. Generic (what banks show today)**
> **Be careful**
> Never share your PIN or OTP with anyone. Beware of fraudsters.
> [Continue] [Cancel]

Use the Satark app's Payment check tab for A (pick "CBI Digital Arrest" or "Distressed Relative"), and a screenshot or paper card for B.

## Volunteers

- 5 to 10 adults. Try to include at least 2 people over 55 and at least 2 who prefer Hindi.
- Get verbal consent first: "We're testing warning messages for a student project. No personal data is recorded. You can stop any time."
- Never use a real phone number, real money or a volunteer's own UPI app.

## Steps (per volunteer, about 15 min)

1. Read the scenario aloud (one paragraph from `src/engine/scenarios.js`, in their language). Tell them: "Imagine you are on this call and the caller is pressuring you."
2. Hand them the phone at the payment screen. Start a stopwatch when the alert appears.
3. Record what they do: **stopped** (cancelled, reported, or said they would call family) or **continued**, and the seconds until they chose.
4. Ask three questions, each 1 to 5:
   - Q1 "How clear was it why the warning appeared?"
   - Q2 "How likely would you be to stop and check?"
   - Q3 "How much did it feel like it was accusing you?" (lower is better)
5. Repeat with the other alert and the other scenario.
6. Ask: "Which warning would make you stop?" (A, B or neither) and note any comment.

Alternate which alert comes first: odd-numbered volunteers see A first, even-numbered see B first.

## Recording sheet

One row per volunteer per alert in `docs/metrics/wording-study.csv`:

```csv
volunteer,age_band,language,order,alert,scenario,stopped,seconds_to_decide,q1_clarity,q2_would_check,q3_accusing,preferred,comment
1,55+,hi,A-first,A,digital_arrest_cbi,yes,9,5,5,1,A,"liked the question"
1,55+,hi,A-first,B,distressed_relative,no,3,2,2,1,A,
```

`age_band` is one of `18-34`, `35-54`, `55+`. `stopped` is `yes`/`no`. `preferred` is `A`, `B` or `neither` (same value on both rows).

## What to report

Run `node tools/eval/wording-study.mjs`. It prints, for A and B: share who stopped, median seconds to decide, mean Q1 to Q3, and how many preferred each. Report it as **"n = X volunteers, indicative only"**. With fewer than 10 people this is not statistically meaningful, and the deck should say so.

If A does not beat B on "stopped" and Q2, assumption A4 is not supported. Say that plainly rather than leaving the claim in the deck.
