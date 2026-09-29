# Student experience — vision

Status: draft for review
Companion documents: 

---

## 0. The fact everything follows from

A fourteen-year-old opening a maths product at eight in the evening is not a neutral user. They have a history with this subject and it is frequently a history of being found wanting — in front of people whose opinion matters to them. They are not arriving curious. They are arriving braced.

Almost every design decision below is downstream of taking that seriously.

The corollary matters just as much: the answer to arriving-braced is not cheerfulness. Cheerfulness aimed at a defensive adolescent reads as either condescension or as a sales technique, and they are extremely good at spotting both. The answer is *calm*. Low temperature, plain language, obvious competence, and no visible attempt to make them feel a particular way.

---

## 1. Getting in

**What I don't want:** account creation, email, password rules, a welcome carousel, permission requests, a mascot, a choice of avatar, an onboarding quiz.

**What I want:** a code, or a link. The student types six characters their teacher gave them, or taps a link. They are in. First screen, under three seconds.

Three reasons this matters and only one of them is convenience. Account theatre signals *this is a Product and you are a User*, which invites all the defences a teenager has built against products. It also harvests data we committed not to collect. And every step before the maths is a step at which a reluctant student can decide not to bother — and reluctance is the modal state we are designing for.

There is no profile to complete. There is nothing to customise. The system is going to learn who they are from what they do, which is the only way it was ever going to work anyway.

---

## 2. The first session — cold start without a placement test

Here is the design problem: a mastery-tracking system with no data on this student. The obvious move is a placement test. The obvious move is wrong.

A forty-question diagnostic, for a student with real gaps, is forty consecutive experiences of not knowing, administered before they have any reason to trust us. It is an extremely efficient way of confirming to a child what they already suspect about themselves. And it's slow, and it feels like an exam, and it front-loads all the pain into the moment of least commitment.

**My proposal: no placement test. Placement by descent.**

The student starts on the thing they actually came for — the homework topic, or what the teacher assigned. When they hit a wall, the system checks whether the wall is the topic or something underneath it. If it's underneath, it says so and goes down one level. And again if necessary.

This costs a little accuracy early on. It buys three things. The student begins on something legitimate rather than on a test. Every descent has a *reason* the student can see, which makes going backwards feel like diagnosis rather than demotion. And the cold-start prior is doing exactly what the KC graph is for.

### What it looks like

**Maya, 14, first time. Her teacher gave her a code. It's Tuesday, 7:40pm.**

> **Screen:** One line at the top. *Two-step equations.* Below it, one problem.
>
> `3x + 7 = 22`
>
> A box to type in. Nothing else on the screen. No timer, no progress bar, no points, no streak counter, no menu.

*Maya's read:* Okay. It just wants the thing. Fine.

That emptiness is deliberate and it is the single most important screen in the product. Every element I could put there — progress ring, points, "Lesson 3 of 12", a friendly greeting — is an element that says *this is going to be a whole thing.* One problem says *this will take a minute.* She is far more likely to attempt one problem than to begin a Journey.

She types `5`.

> **Tutor:** That's it. Next one's a bit different — the number in front of x isn't so friendly.
>
> `4x - 9 = 3`

*Maya:* Fine, whatever.

She types `3`.

> **Tutor:** Yep. Try this one.
>
> `-2x + 5 = 11`

She types `3` again. Wrong; the answer is `-3`.

**This is the moment the product is actually about.** Everything else is scaffolding around how we handle this.

> **Tutor:** Not quite — check the sign. What do you get if you put -3 in for x?

Notice what did not happen. It did not say "Incorrect." It did not say "Good try!" It did not immediately explain the sign rule. It handed her back a way to find out for herself, which costs her ten seconds and preserves the possibility that she just slipped.

She works it out. Types `-3`.

> **Tutor:** There it is. Sign errors with negatives are the single most common thing to go wrong here, so let's check that's solid before we carry on.
>
> `-5x - 3 = 12`

She stalls. Types `-1.8`. Wrong — it's `-3`. Then tries `1.8`. Wrong again.

Two failures on the same underlying thing. The system descends.

> **Tutor:** I think the equation isn't the problem — it's the negatives underneath it. Quick check, no working needed:
>
> `-12 ÷ -4 = ?`

*Maya, and this is the thought I care most about:* **Oh. It's not that I'm bad at this. It's that one bit.**

That reframe is the entire product. A student who believes they are bad at algebra is unreachable. A student who believes they have a specific broken part is a student who can fix a specific broken part. The descent is not a demotion, it is a *diagnosis*, and it has to be delivered in a way that makes the difference obvious.

She gets the division question wrong. The system spends the next six minutes on signed number operations — not on a lecture, on short items with immediate adjudication — then walks her back up to `-5x - 3 = 12` and she gets it.

> **Tutor:** That's the one you couldn't do fifteen minutes ago. Same problem, and you didn't need me for it.

Session ends there. Roughly eleven minutes.

### Why it ends there

The temptation is to keep going while she's succeeding. Resist it. Ending on a clean, unassisted success, early, does three things: it makes the next session more likely, it leaves the last memory of the session as competence, and it respects that eleven minutes of genuine cognitive effort is a real amount for a fourteen-year-old on a school night. A product that always wants one more problem is a product that teaches students to dread opening it.

---

## 3. The failure session — the one everything else is judged by

**Thursday. Maya has been stuck for twelve minutes. Four attempts at rearranging a formula. All wrong.**

This is where ed-tech reliably fails, in one of two directions. Either it becomes relentlessly upbeat, which to a struggling adolescent reads as *this thing does not understand that I am having a bad time* — or it becomes clinical and just keeps serving problems, which reads as a machine watching you drown.

What I want instead: the system notices, says so plainly, and changes what it's doing.

> **Tutor:** We've been going at this one a while and it isn't landing. That's on the explanation, not on you. Let me show you a whole one worked through, then you do the next.

Then a fully worked example. Every step. Then a near-identical problem with the last step removed for her to finish.

The line "that's on the explanation, not on you" is doing specific work and it is not a comfort blanket. It is a causal attribution, and it is *true* — twelve minutes of failure genuinely does mean the instruction was miscalibrated. Attributing the failure to a fixable external cause is one of the better-supported moves in the literature on academic resilience, and it costs nothing.

What must not happen: the tutor must not just give her the answer because she is upset. That is the kind thing to do in the moment and the cruel thing to do over a term. The escalation ladder exists so that the response to struggle is *more support*, not *less problem*.

And if she wants to stop, she stops. There is no "are you sure?", no attempt to salvage the session, no guilt.

> **Maya:** i'm done
>
> **Tutor:** Fair enough. You did the negative-number stuff well on Tuesday, that hasn't gone anywhere. See you when you're back.

---

## 4. The Tuesday-evening ping — the review channel

Nine days later. 7:15pm. Maya's phone.

> Two questions, about 90 seconds. `-12 ÷ -4 = ?`

She answers from the lock screen. Gets it. Second question comes. Gets that too.

> Both right — and that's nine days since you last saw it, so it's stuck. Done for tonight.

That's the whole interaction. Ninety seconds.

**Design constraints on this channel, all of which I'd defend hard:**

It must be genuinely short. Two or three items, then it *ends*. The moment a review ping can turn into a session, students stop opening review pings.

It must be dismissable without cost. No streak to break. No "you missed one." If she ignores it, the scheduler simply reschedules and says nothing about it. The instant we introduce guilt as a motivator, we have built something that people eventually delete.

There is no scaffolding. If she can't retrieve it, that's the finding — the item goes back into the acquisition pile and gets handled properly in a real session. Assisted retrieval is not retrieval, and the evidence would be mislabelled.

And the message should tell her *why*: "nine days since you last saw it." The spacing is not arbitrary and she is old enough to be told that the system is working from an actual model of forgetting. Being treated as someone who can understand the mechanism is, in itself, respectful.

---

## 5. What she never sees

A progress map showing everything she hasn't mastered. For a student with gaps this is a wall of red, and it is a daily reminder of deficit. If she wants to know where she stands she can ask, and she gets a sentence, not a heat map.

Points, badges, streaks, leagues, avatars. These work — briefly — for behaviours with no intrinsic reward. Applied to learning, they reliably shift attention from the thing to the token, and when the tokens stop, so does the behaviour. We also committed to not designing for dependency, and streaks are the purest expression of designing for dependency.

Her raw mastery numbers. `acquisition: 0.72` means nothing to a fourteen-year-old and invites comparison with peers.

Comparison with anyone else. Ever.

A character. No mascot, no name, no backstory, no personality that asks to be related to. It is a tutor. It is good at maths and it is patient. That is the whole personality, and it is enough.

---

## 6. What the tutor sounds like

Short sentences. Contractions. No exclamation marks except where something genuinely surprising happened. Correctness acknowledged briefly and moved past — "yep," "that's it," "there it is" — because ceremony around an easy item is condescension.

It never comments on her as a person. Not "you're really good at this" and not "you're struggling with this." It comments on what happened and what's next. "You did that one without the hint" is a fact. "You're smart" is a claim about her that she will test against the next thing she gets wrong.

It is allowed to be dry. A fourteen-year-old will forgive dryness a great deal faster than they'll forgive enthusiasm they didn't ask for.

---

## 7. Design claims in here that need sign-off

1. **No placement test; placement by descent.** Affects the scheduler's cold-start policy and the `session-open` skill. This is the biggest one.
2. **Sessions end on success, deliberately early.** Affects `session-close` and any notion of a session length target.
3. **One problem on screen at a time, no surrounding chrome.** Affects the WebChat surface design.
4. **No progress map, no gamification, no numeric mastery shown to the student.** Follows from the brief but is stated here as an interface commitment.
5. **Review pings are dismissable with zero consequence and no guilt language.** Affects the scheduler's outbound policy.
6. **Plain-text maths input, normalised by the checker.** She types `x=5`, `-3`, `3/4`. She never learns notation to talk to us. The system echoes back what it understood, rendered, so she can see it read her correctly.
