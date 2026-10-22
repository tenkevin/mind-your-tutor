# Interactive Mind Map Designer

_Started 2026-10-22 17:04 UTC_

---

## User

We want to design a very basic UIUX for the relations of ideas for educational purposes. Let's say that we need to represent ideas (through the ingestion of a CSV or spreadsheet or postgre database) in a mind map journey format. When the users click through it, it will only show a partial mind map, blurring out the rest of the ideas. Clicking on the idea will allow it to zoom into the concepts and see the immediate relations with another. Clicking into the same concept will take the user to the page itself. Any questions?

## Assistant



## Assistant

_[tool: ask_user]_

I've put up a short form. It asks who the learners are, what your data looks like, what stays visible as people explore, what goes on each idea's page, and which device matters most. You can skip any question and I'll decide. Once you've answered, I'll wireframe the journey for you.

## User

Answered — audience: K-12 students; data_shape: Idea A → Idea B + relation type (graph), Ideas have categories / subjects; reveal: Current neighbours + faint preview of 2nd degree; relation_labels: On hover/focus; page: Explanation text, Media (images/video), Quiz / check understanding, Progress / next suggested idea; ingestion: No, map + page only; device: Desktop; variations: 4

## Assistant

_[tool: grep]_

_[tool: dc_write]_

_[tool: ready_for_verification]_

I've made four map layouts as wireframes, using a sample water-cycle topic for K-12 science:

- **1a – Radial focus:** the current idea sits in the centre with its direct links around it. Ideas two steps away are blurred, and everything further is hidden. This is the only clickable one. Click an idea to move to it, hover to see how it's related, and click the centre idea again to open its page. The page has the explanation, a media placeholder, a quiz, your progress and a suggested next idea.
- **1b – Journey path:** your path so far runs left to right and the next choices branch off ahead.
- **1c – Category lanes:** each category gets its own row, so you can see which kind of idea each link leads to.
- **1d – Focus panel and minimap:** links are written as sentences next to a small map that's blurred outside a spotlight.

1b, 1c and 1d are still pictures for now. I haven't designed the idea page as separate options yet; it only exists inside 1a.

## User

Found issues — fixing…

## Assistant

_[tool: dc_html_str_replace]_

_[tool: ready_for_verification]_

I fixed the background below the first screen. It was showing light cream there, which made the captions for 1b, 1c and 1d and the suggestions line underneath hard to read. The whole page is now dark.

## User

Good, but when hovering over these horizontal links, they have a label that gets blocked by the main concept, so I only see the prescribed relationships partially

## Assistant

_[tool: dc_html_str_replace]_

_[tool: dc_html_str_replace]_

_[tool: dc_js_str_replace]_

_[tool: ready_for_verification]_

In 1a, the relation label now appears next to the idea you're hovering over instead of halfway along the line. It sits just above ideas in the top half of the map and just below ones in the bottom half, and it's always drawn on top, so the centre idea can no longer cover it.

## User

The links are not connected to the main idea, creating a visual disconnect

## Assistant

_[tool: dc_html_str_replace]_

_[tool: ready_for_verification]_

In 1b, all three links now start from the right edge of "Condensation" and fan out towards Clouds, Water vapour and Water cycle. I fixed the size of the Condensation box so the start point stays in place. I haven't checked the far ends closely, so a line might stop a few pixels short of its box. If you see a gap, tell me and I'll adjust it.

## User

1a is amazing, loving it so far! I think one that we can benefit from is allowing students to zoom in and out of the graph to see the big picture. Some concepts are locked behind mastery levels or metrics; they are also locked if there are no connecting nodes for the concept being explored by the students.

## Assistant

_[tool: update_todos]_

_[tool: dc_html_str_replace]_

_[tool: dc_html_str_replace]_

_[tool: dc_js_str_replace]_

_[tool: dc_js_str_replace]_

_[tool: update_todos]_

_[tool: ready_for_verification]_

I've added 2a at the top of the page, building on 1a. I haven't tried it in the preview myself yet, and a background check is still running.

**Zoom:**
- Every idea now has a fixed place on one big map, so the view can glide smoothly between ideas.
- You can scroll or drag to zoom and move around. There are also +/− buttons and three set views: Idea, Area and Whole map.
- Zooming out shows the outline of the whole map. Ideas you haven't reached stay blurred or shrink to dots, so the big picture doesn't give away their names.

**Locks:**
- **Needs mastery:** these ideas have a dashed border with a lock and a note of what's required, such as "Master Condensation". Clicking one shows the requirement and a button that takes you to the idea you need to master. Passing an idea's quiz masters it and unlocks anything that depended on it, with a short message saying what opened up.
- **Not connected yet:** these show as small lock dots with no name until you explore an idea next to them.

To see an unlock: go from Evaporation to Water vapour, then Condensation. Clouds will show as locked. Open Condensation's page and pass its quiz, and Clouds unlocks.

The set of locked ideas is made up for the demo. In the real version, the locks would come from your data, for example a "requires" or mastery-threshold column.

## User

A few rules of mindmap design organization before we move on:
The main concepts (with the most connections to them) will get put in the center, while concepts with the least connections will be in the outer space. 2. Concepts should only have less than four relations outwards and than 4 relationships inwards. So this means evaluating and prioritizing the most important relationships ONLY. 3. Furthermore, when clicking on the links, it should take the student to a video or piece of media explaining the relationship of the two concepts, or if there's a lack of media, it should be an AI agent instructor prompted to explain the relationship to the student.

## Assistant

_[tool: read_skill_prompt]_

_[tool: dc_write]_

_[tool: dc_html_str_replace]_

_[tool: ready_for_verification]_

I've added 3a at the top of the page, following your three rules. A background check is still running, and I haven't tried the AI instructor myself yet.

1. **Layout:** the map now arranges itself. Each idea's position comes from how many links it keeps, so the most connected ideas sit in the centre and the least connected sit on the outside. Faint rings show this when you zoom out. The map opens on the most central idea.
2. **Link limits:** each idea keeps at most 3 links going out and 3 coming in, chosen by an importance score from 1 to 5. In the sample data, 31 possible links come down to 25. The header shows how many weaker links were hidden.
3. **Clickable links:** each link to a nearby idea has a small badge and an arrow showing its direction.
   - A play badge opens a video placeholder, with an "Ask the AI instructor" button for students who are still unsure.
   - A sparkle badge means there's no video. It opens an AI instructor that explains the link for K-12 students and answers follow-up questions, with a few suggested questions to tap.

There are two settings you can change: the link limit (3 by default) and an option to show the hidden links as dotted lines, so you can compare.

The importance scores and which links have videos are made up for the demo. In practice they would come from columns in your data.

## User

A few more suggestions, and let's discuss if you have any questions:

1. AI chatbot: 2 personas. The virtual peer student and a friendly, warm AI tutor personality

2. Lesson Objectives: Shown on the screen, customized lesson objectives for the whole map, area, and individual lessons.

3. Quiz (acting as a formative assessment), mastery needed >70% to move on to the next concept. I also need a locked animation. Summative assess is the place where the educator will either record a video, screencast, or explain in chat to the virtual peer to "teach" them the concepts, then checking their understanding for gaps (redirect them to the concept if needed).

4. Reward mechanism discussion needed. Hint: intense, novel, and size for motivation.

## Assistant



## Assistant

_[tool: ask_user]_

I have a few questions before building, so I've put up a short form. The main ones are:

- Who teaches the virtual peer in the final assessment: the student or the educator?
- When does that assessment unlock?
- What counts as an "area" for lesson objectives?
- Where should each AI persona appear?
- How do you want the rewards to feel?

You can skip any question and I'll decide.

## User

Answered — who_teaches: The student (learning by teaching); summative_when: After mastering every idea in an area; area_def: A teacher-defined unit or group of ideas; persona_use: Tutor on idea pages + links; peer in the summative and as a study buddy on the map; quiz_len: 8; quiz_fail: Tutor explains the missed questions, then retry; record: UI mock only; rewards: Collectible idea cards, Streaks & combo multipliers; reward_tone: Game-like; layout_choice: Extend 3a into one full prototype

## Assistant

_[tool: update_todos]_

_[tool: dc_write]_

_[tool: dc_write]_

_[tool: dc_html_str_replace]_

_[tool: update_todos]_

_[tool: ready_for_verification]_

I've built 4a, a full working version that grows out of 3a. It's at the top of the wireframes page and also opens on its own as "Idea Map Explorer v2". A background check is still running, and I haven't played through the quiz or teach-back flows myself yet.

- **Two AI personas:** Ms. Ivy, the warm tutor, answers on idea pages and on links that have no video, and goes over quizzes students don't pass. Milo, the virtual classmate, is a study buddy in the bottom-right of the map and the "student" in the final assessment.
- **Objectives:** a panel on the map shows the goal for the whole map, the current unit and the current idea. The highlighted row follows the zoom level. Each idea page shows its own objective, written as an "I can…" statement.
- **Quizzes:** each idea has 8 questions, built automatically from its links. A student needs more than 70% (6 of 8) to master an idea, and only then do the next ideas open.
- **Below 70%:** Ms. Ivy explains what was missed. The student then does a hands-on review, matching each missed link to the idea that completes it. They can open any link's video or tutor from there, and the retry only unlocks once every link is rebuilt.
- **Lock and unlock animations:** clicking a locked idea makes it shake and wiggles its lock. Newly opened ideas pop with a glow and an open-lock icon when the student returns to the map.
- **Rewards:**
  - Every correct answer earns XP, and answers in a row build a combo that multiplies it, up to ×4.
  - Mastering an idea flips over a collectible card. Rarity depends on how central the idea is, and a perfect 8/8 gives a shiny version.
  - Finishing a unit gives a bigger unit card. Teaching Milo successfully gives the biggest reward, a trophy.
  - There's also a day streak in the header and a collection page showing every card.
- **Final assessment (teach Milo):** this opens once every idea in a unit is mastered. The student can explain in chat, or record a video or screencast (these are mock screens for now). Milo then checks for gaps, and each gap has a "Review" button that takes the student back to that idea.

Some things to know:

- Mastering every unit-1 idea at 8 questions each takes a while. There's a setting to jump straight to "almost done" or "unit done" so you can try the final assessment quickly. You can also change the quiz length and the pass mark.
- After a recorded video or screencast, Milo's check is fake demo feedback, because recordings aren't analysed in this mock. The check after a chat explanation is real.
- The units, objectives and videos are sample content. In the real app they'd come from the teacher's data.

## User

Found issues — fixing…

## Assistant

_[tool: dc_js_str_replace]_

_[tool: dc_js_str_replace]_

_[tool: dc_js_str_replace]_

_[tool: dc_js_str_replace]_

_[tool: dc_js_str_replace]_

_[tool: dc_js_str_replace]_

_[tool: dc_js_str_replace]_

_[tool: ready_for_verification]_

In 4a, the opening view now fits the current idea and all its neighbours on screen. Before, "The Sun" sat above the visible area and the objectives panel covered "Temperature". The same fit happens when a student moves to an idea, clicks "Idea", returns from a reward, or loads a demo starting point. It keeps the right-hand strip clear for the objectives panel and Milo. I haven't checked the new positions myself; a background check is running.

Two related changes:
- The faint map outline, rings and unit labels now appear only in the Unit and Whole map views or when zoomed well out. Before, they showed up in the normal focused view too.
- Collapsing the objectives panel doesn't re-centre the map on its own. Click "Idea" to get the wider fit.

## User

Can you also put something like a to-do or a mission for the students? For example, if there's an assessment coming up, clicking on the to-do would take you straight to the assessments

## Assistant

_[tool: dc_html_str_replace]_

_[tool: dc_js_str_replace]_

_[tool: dc_js_str_replace]_

_[tool: dc_js_str_replace]_

_[tool: dc_js_str_replace]_

_[tool: ready_for_verification]_

There's now a **Missions** button at the top right of 4a, with a count of open missions. It works from any screen and opens a to-do list where each item takes the student straight to that task:

- **Assessments that are ready** sit at the top with the due date, e.g. "Unit 1 assessment: teach Milo · Due Friday · ready now". Clicking opens the teach-back.
- **Assessments coming up** show how many ideas are left to master. Clicking jumps to the next idea to work on.
- **Follow-ups** appear when needed: "Review X for Milo" after he finds a gap, and "Finish the hands-on review" after a failed quiz.
- **Everyday missions:** pass the current idea's quiz, keep the streak going, and get a perfect score for a shiny card. Finished missions are crossed out at the bottom.

The due dates are placeholders; in the real app they'd come from the teacher. I haven't opened the list myself yet, and a background check is still running.

You currently have the demo set to "unit done", so the Unit 1 assessment should be at the top of the list.

## User

For the summative assessments, I'm thinking the AI acts alongside the student and uses the mic, the video, and explain in chat. But what is should also do is to give the student a question from a deterministic list of questions to ask them to explain their thinking and understanding. So, it will actually actively be probing the students (conversation or not) to see if the students understand all the concepts and aligns with the lesson objectives

## Assistant

_[tool: run_script]_

_[tool: ready_for_verification]_

I've rebuilt the Milo assessment (the summative) in 4a. I haven't tried it myself yet; a background check is running.

- **Fixed question list:** each unit has a set list of questions, one per lesson objective, always asked in the same order. Unit 1 has 7, Unit 2 has 5 and Unit 3 has 6. Each question comes with the key points a good answer should cover.
- **Milo leads the questioning:** he asks a question, and the student can answer by typing, talking, video or screencast. The method can change from one question to the next.
- **Checking each answer:** every answer is checked against that idea's objective and key points and marked understood, partly or not yet. If it isn't fully right, Milo asks one follow-up that nudges without giving the answer away, then moves on.
- **Checklist alongside:** the right side shows the unit objective and Milo's checklist, one row per objective, filling in live. Gaps get a short note on what was missing and a Review button that takes the student to that idea.
- **Re-checking:** when finished, students with gaps can re-check only the questions they missed, and earlier correct answers carry over. The missions list adds a "Re-check with Milo" mission. Passing every question awards the trophy.
- **Recording is still a mock:** talk, video and screencast have record and stop buttons with a timer, then the student types what they said, because in the real app speech would be transcribed automatically. That typed text is checked the same way as a typed answer.

To try it, keep your demo setting on "unit done" and open the Unit 1 assessment from the Missions list.

## User

Found issues — fixing…

## Assistant

_[tool: run_script]_

_[tool: ready_for_verification]_

I've made two fixes to the Milo assessment; a background check is running again.

- **Chat scrolling:** the conversation now jumps to the bottom after each new message, so Milo's current question is always visible. Before, the question could sit off-screen below your earlier answers.
- **Text wrapping:** the checklist status labels ("Asking now", "Understood", and so on) and the "I'm not sure" button now stay on one line instead of breaking onto two and running into the text below.

## User

After this we are going to move onto the motivation mechanism, 

1. we are going to work on the collection visuals; it should be satisfying to collect a card. Like it pops up with an animation on screen when the user obtains a card. And it adds elements ascendingly from animation for rare to common to legendary. The visuals should be intense, novel/exciting

2.

## Assistant

_[tool: run_script]_

_[tool: ready_for_verification]_

I've rebuilt the card reveal as a two-step moment. I haven't watched it play myself yet; a background check is running.

1. **Anticipation:** the card drops onto the screen face-down, and the student taps to open it.
2. **Reveal:** the card flips and the effects fire, then the XP counts up and the button to continue appears.

I read "rare to common to legendary" as rising intensity, Common → Rare → Legendary. Each tier adds more on top of the one before:

- **Common:** the back glows and pulses gently. On flip there's one shockwave ring, a small spark burst, a soft flash and a light shine across the card.
- **Rare:** adds a faster pulse and a hovering card before it opens. Sparks are drawn in towards the card, and the flip brings two rings, a bigger burst, a screen shake, slowly turning light rays and twinkles around the card.
- **Legendary:** adds a trembling card and heavy drawn-in sparks, then a fast triple spin and a strong flash. It also brings three rings, a second burst, a hard shake, faster rays, "LEGENDARY" slamming in behind the card and falling confetti.
- **Shiny (any tier):** a repeating shine sweep and constant twinkles.

After a reveal, the card tilts as you move the mouse over it, and the foil highlight follows the cursor.

To try every tier quickly, open the Cards page. It has a demo row with buttons for Common, Rare, Legendary and Shiny legendary, and clicking any card you've collected replays its reveal.

Your second point came through empty. What did you want to cover there?

## User

Found issues — fixing…

## Assistant

_[tool: run_script]_

_[tool: ready_for_verification]_

I've fixed a bug where the card reveal froze after the tap. The animations never started and the button to continue never appeared, so students were stuck behind the overlay. A background check is running on the fix; I haven't played a reveal myself yet.

- **Animations:** the reveal now tracks its own steps instead of relying on information the page wasn't passing it.
- **Safety net:** the XP counter and continue button now always appear within about 1.7 seconds of opening a card, even if an animation fails.

Your second point is still empty. What did you want to cover there?

## User

Found issues — fixing…

## Assistant

_[tool: run_script]_

_[tool: ready_for_verification]_

The card reveal could land below the visible area on tall screens like the Cards page or after a quiz, so the student had to scroll to see it and to close it. I've fixed that: the card, effects and Close button now sit in a fixed area at the top of the app, about one map-screen tall, and the page scrolls up to it when a card is earned. A background check is running on the fix; I haven't played a reveal myself yet.

Your second point under motivation is still empty. What did you want to add there?

## User

2. I want to cover the peer and buddy system. Where the peer is more than an icon. But an evolving artifact with different questions or comments or motivation (like, " Oh, I get it), with a moving character.

## Assistant

_[tool: dc_write]_

_[tool: run_script]_

_[tool: ready_for_verification]_

Milo is now an animated character instead of an icon, and he grows as the student learns. A background check is running; I haven't watched him play through the app myself yet.

- **Character:** a simple shape-built placeholder, so you can swap in real character art later. He blinks, bobs gently and his eyes follow the cursor.
- **Moods:** idle, happy, curious, confused, "aha", excited, thinking and sleepy. Each has its own face and movement, for example a squash-and-jump with a lightbulb for "aha", or a wobble with a question mark for confused.
- **Evolution in 4 stages:** Curious newbie, Getting it, Thinker, then Scholar. Each stage adds something visible: a sprout, then glasses, then a graduation cap, with a stronger glow each time. He grows when the student masters ideas (1 point each) and teaches him a unit (3 points). Levelling up plays a spin-and-sparkle animation and a thank-you line.
- **Where he appears:**
  - **Map corner:** the student's study buddy, with a speech bubble.
  - **Buddy panel:** his profile, current stage and progress to the next one.
  - **Quiz:** he stands beside the question and reacts to every answer.
  - **Final assessment:** he sits above the chat, reacting to each answer and showing a "thinking" face while answers are checked.
- **What he says:** comes from fixed lists for each moment:
  - On arrival he asks about a link ("Wait, how does Sun power Evaporation?").
  - On a locked idea he gets excited about what's behind it.
  - In quizzes he cheers combos, says "Oh, I get it!" on right answers and sympathises on wrong ones.
  - After 30 seconds of no activity he falls asleep and nudges the student.

You can open Milo on his own and use the settings to preview each mood and stage.

## User

Now we will do an audit on whether this can be a switch and slot for different curriculums. What can be easily swapped based on different curriculums and subject areas, and what couldn't?

## Assistant

I went back through how the prototype is built. Most of the learning content already comes from data tables, so a different curriculum can slot in. The parts that would hold back a subject switch are a few hard-coded assumptions about science and the quiz design.

**Swaps easily (already data-driven)**
- **Ideas:** title, category, explanation and "I can…" objective.
- **Links:** from → to, the relation wording, an importance score from 1 to 5, and an optional video. The top-3-in and top-3-out rule, the centre-to-outside layout and the card rarity are all worked out from these, so new data rearranges itself.
- **Units:** name, objective and which ideas belong to each.
- **Settings:** the whole-map objective, the pass mark (70%), quiz length (8) and link limit.
- **Quizzes:** generated automatically from the links, so a new map gets quizzes with no extra writing.
- **Milo:** his evolution stages, the missions logic and the rewards don't depend on the subject.

**Needs a setting added (small change)**
- **Subject title:** the header still says "Science · The water cycle" as fixed text.
- **Categories:** Process / Force / Thing are fixed in the "What kind of idea is it?" quiz question and the card icons. They need a category table with name and icon.
- **AI prompts:** Ms. Ivy is written as a "science tutor for ages 8 to 14", and Milo is 11. Subject and grade level should become settings so the same personas work for Grade 2 or Grade 11.
- **Prerequisites:** an idea currently unlocks when you master a neighbour. Many curricula have explicit prerequisite chains, which would need a "requires" column.
- **Due dates:** the ones in missions are placeholders. They need a teacher-set date per unit.
- **Standards codes:** official curriculum codes (e.g. NGSS, Common Core) have nowhere to go. Objectives would need a code column for alignment and reporting.

**Needs content authored per curriculum**
- **Final-assessment questions:** Milo's question list and key points are written by hand for each unit. This is the main content cost. AI could draft them for teachers to approve.
- **Media:** a video for each link, and the idea-page media, which is still a placeholder.
- **Relation wording:** this has to read as a short verb phrase ("powers", "flows into"), because the quizzes and Milo's lines turn links into sentences.

**Doesn't fit without new work**
- **Subjects that aren't about connected ideas:**
  - **Maths:** worked problems and typed answers.
  - **Languages:** vocabulary, listening and speaking.
  - **Arts and PE:** hands-on performance.

  The quiz only tests links, so these need a pluggable question bank for each idea with other question types.
- **Large maps:** the layout fits about 20 ideas in two rings, with 6 slots in the inner ring. A curriculum with 50–200 ideas needs more rings, grouping by unit and hiding of faraway ideas.
- **Symmetric relations:** the link limits assume a direction (A → B). A relation like "compare with" doesn't have one.
- **Age range:** Grade K–2 needs read-aloud audio and bigger tap targets, and older students may find Milo's style too young. Both need separate visual and voice modes.
- **Other languages:** all interface text is in English, written straight into the screens, and right-to-left scripts aren't handled.

The cleanest next step is a single "curriculum pack" made of spreadsheet tabs or JSON: subject info, categories, ideas, links, units, final-assessment questions, a question bank, media and persona settings. The app would read everything from it. Should I do that refactor and load a second, very different sample, such as fractions in maths or a history unit, to prove the swap works?

## User

Alright, write a settings page with teacher-facing content and logistics of Subject title: the header still says "Science · The water cycle" as fixed text.
Categories: Process / Force / Thing are fixed in the "What kind of idea is it?" quiz question and the card icons. They need a category table with name and icon.
AI prompts: Ms. Ivy is written as a "science tutor for ages 8 to 14", and Milo is 11. Subject and grade level should become settings so the same personas work for Grade 2 or Grade 11.
Prerequisites: an idea currently unlocks when you master a neighbour. Many curricula have explicit prerequisite chains, which would need a "requires" column.
Due dates: the ones in missions are placeholders. They need a teacher-set date per unit.
Standards codes: official curriculum codes (e.g. NGSS, Common Core) have nowhere to go. Objectives would need a code column for alignment and reporting. (This can be changed, swapped, and customized)

## Assistant

_[tool: write_file]_

_[tool: run_script]_

## User

Actually, to correct some of the missed concepts, we can have teachers classify cards, write subject titles, modify AI prompts (more work on this later so make it flexible), modify due dates, . But more importantly, prerequisites, categories, and standard codes would require pulling from the spreadsheet. We will also need a space for the logistics agent that comes with the application so that it serves as the backbone of creating the mind map by taking account of the shared resources like RAG, curriculum itself, and a teacher-facing agent. (So in this case, when on teacher-specific pages like the one we talked about, it will be there to answer any questions regarding to the application). The "Needs content authored per curriculum" has good calls on Final-assessment questions, and the media will be either included in the CSV/Postgre data or if empty it will stay as a placeholder.

## User

Found issues — fixing…

## User

Found issues — fixing…

## Assistant

_[tool: run_script]_

_[tool: ready_for_verification]_

## Assistant

_[tool: run_script]_

_[tool: update_todos]_

_[tool: ready_for_verification]_

