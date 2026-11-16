# Live import tests

These four files answer questions nobody has tested yet. Import each one into Schoology by hand, tick the boxes, and send the results back. A "no" is just as useful as a "yes": it tells us what to change.

Import them into **Resources**, not straight into a course, so nothing reaches students. Delete the test folders from Resources when you are done.

For the three `.imscc` files the import steps are the same:

1. Open **Resources**.
2. Choose **Import**, then **Common Cartridge**.
3. Pick the file and wait for the import to finish.
4. Open the new folder in Resources.

Each `.imscc` has a matching `_After_Import.html` checklist next to it. You only need Test A's, for question A5.

---

## Test A: assignment with a rubric table

File: `Test_A_assignment_with_rubric_table.imscc`

Question: do the title and points survive in this newer cartridge version (1.2), and does a rubric table show up in the description?

What is in it: one folder, **Test A**, with one assignment, **Test A: Truss analysis**, worth 20 points. Its description ends with a rubric table: 3 criteria (Free body diagrams, Member forces, Check), 4 levels each.

- [ ] A1. The folder **Test A** is there, with the assignment inside it.
- [ ] A2. The assignment is named **Test A: Truss analysis**.
- [ ] A3. It is worth **20** points (not 100).
- [ ] A4. The title does **not** appear a second time at the top of the description.
- [ ] A5. The description ends with a table headed "Rubric: Test A rubric (20 points)". Write down what it looks like:
  - [ ] It shows as a table with borders, 3 criteria rows.
  - [ ] It shows, but as plain text or with no borders.
  - [ ] It is missing.
- [ ] A6. Add the assignment to a test course, open it, and check the table still looks the same there.
- [ ] A7. (Optional) Using the Test A checklist, type the rubric into Schoology (Resources, Add Resources, Add Rubric). Was the entry sheet easy to follow? Note anything confusing.

---

## Test B: every item type, three folders deep

File: `Test_B_all_item_types.imscc`

Question: do pages, links, discussions, and files import into the right folders when folders go three levels deep?

What is in it:

```
Test B level 1
  Test B page at level 1                (Page)
  Level 2
    Test B link at level 2              (Link)
    Level 3
      Test B discussion at level 3      (Discussion)
      Test B file at level 3            (File, a small PDF)
      Test B control assignment         (Assignment, 5 points)
```

- [ ] B1. The three folders are there, nested as shown.
- [ ] B2. **Page** at level 1: it is a page (not an assignment), and it says "This page should sit directly inside **Test B level 1**" with "Test B level 1" in bold.
- [ ] B3. **Link** at level 2: clicking it opens the Wikipedia "Truss" page. Check the address ends with `?test=b&level=2` (this tests that the `&` survives).
- [ ] B4. **Discussion** at level 3: it is a discussion, and its text says "This discussion should sit inside **Level 3**" and "Reply with one word."
- [ ] B5. **File** at level 3: it opens a one-page PDF titled "Test B handout".
- [ ] B6. **Control assignment** at level 3 is worth 5 points. (This type already works. If it fails here, the problem is the folder depth.)
- [ ] B7. Nothing landed in **Unused Resources**.

---

## Test C: quiz question types

File: `Test_C_quiz_types.imscc`

Question: do short-answer and essay questions import alongside the three types that already work?

What is in it: one folder, **Test C**, with one quiz, **Test C: five question types**.

| # | Type | Correct answer |
| --- | --- | --- |
| 1 | Multiple choice (already works) | Tension |
| 2 | Select all (already works) | meter, kilogram |
| 3 | True/False (already works) | True |
| 4 | Short answer (new) | newton, newtons, or N |
| 5 | Essay (new) | none, graded by hand |

- [ ] C1. The quiz has all **5** questions, in that order.
- [ ] C2. Questions 1 to 3 have the right answers marked.
- [ ] C3. Question 4 imported as a short answer or fill-in-the-blank question.
- [ ] C4. Question 4 lists all three accepted answers: newton, newtons, N. (If only one or two are there, write down which.)
- [ ] C5. Question 5 imported as an essay or open-ended question.
- [ ] C6. Every question is worth 1 point. (Expected: Schoology always does this. Just confirm.)

---

## Test D: matching question through QTI 2.1

File: `Test_D_qti21_matching.zip` (do **not** unzip it)

Question: Common Cartridge has no matching question type. Does Schoology's other quiz import, QTI 2.1, accept one?

This one imports differently:

1. Open **Resources**.
2. Choose **Import**, then **QTI v2.1** (it may be listed as "QTI 2.1").
3. Pick the zip file.

What is in it: two questions.

- **Control** (multiple choice): "A member that is being pulled apart is in:" Answer: Tension.
- **Matching**: "Match each term to its meaning." Tension goes with Pulling apart, Compression with Pushing together, Shear with Sliding past.

- [ ] D1. The import finished without an error. If it failed, copy the error message.
- [ ] D2. Where did the questions go? (A question bank, a new assessment, somewhere else?) Write it down.
- [ ] D3. The control multiple-choice question is there with Tension marked correct.
- [ ] D4. The matching question is there **as a matching question**, with all three pairs matched correctly.
- [ ] D5. If the matching question is missing or became another type, write down what you see.

---

## Sending the results back

Copy the checkboxes above with your ticks, plus any notes or error messages, into a message to Claude. Screenshots of the Test A table and the Test D matching question help.
