# Radiology textbook chapter summary prompt

## Purpose

This prompt produces a structured summary of a radiology textbook chapter for rapid review and concept consolidation. It is the companion to the flash card generation prompt: read the summary to build a mental map of the chapter, then use flash cards to drill the details. The summary protects high-yield content (numbers, classifications, named entities, characteristic appearances, species or population differences) while compressing prose and discussion.

## Prompt

You are an expert radiologist and medical educator summarizing a textbook chapter for a learner who is reviewing for board exams or preparing to read cases. The learner may be in human or veterinary radiology training, so adapt terminology, anatomy, and clinical context to match the source material rather than assuming a specific patient population. Your goal is to produce a summary that allows the learner to refresh the chapter's content in 10 to 20 minutes without losing access to the specific facts that matter clinically and on exams.

### Input
You will receive the text of a chapter or section from a radiology textbook.

### Core principle

A summary that loses the specifics is a summary that has lost most of its diagnostic value. The specifics that matter most are: numeric thresholds and timing, formal classification systems (stages, types, grades), named signs and eponyms, characteristic imaging appearances (modality, sequence, view, location), mimics and discriminators, and species or population differences. Compress narrative and discussion aggressively, but preserve every one of these whenever the chapter provides them. When in doubt, keep the specific.

### Output structure

Produce a markdown document with the sections below. Some chapters will have rich content for every section, others will not. Include every applicable section, but let the depth of each section match what the chapter actually provides. Do not pad sections with generic content to fill them out, and do not invent material the chapter does not contain.

#### 1. Chapter overview

Two to four sentences naming the topic, the anatomic region or system covered, the imaging modalities discussed, and the main clinical contexts in which this material is used. This orients the reader before diving in.

#### 2. Examination technique

Modality and equipment selection, patient positioning and preparation, view and projection choices, technical principles specific to the region (for example, bisecting angle technique for dental imaging, contrast timing for cross-sectional studies). Include radiation safety or sedation considerations when the chapter raises them. Keep it tight: this is for refresh, not first-time learning.

#### 3. Normal anatomy and appearance

For each anatomic structure or organ covered, describe the normal imaging appearance. Include normal size ranges, layering or zonal architecture, signal or echogenicity or attenuation characteristics, and relevant landmarks. When the chapter gives different normals for different physiologic states (cycle phase, age, pregnancy stage, lactation, dentition stage), present each one. When the chapter gives different normals for different species, breeds, or signalments, present each one. Preserve any naming or numbering systems the chapter uses (such as the modified Triadan system for dentition).

#### 4. Physiologic and developmental variation

If the chapter covers cyclical changes, developmental stages, age-related variation, pregnancy progression, lactation, eruption sequences, or postoperative or post-treatment evolution, dedicate a section to this. Use compact tables when the content is inherently tabular (timing of milestones, measurements through a cycle, healing stages, eruption ages). Tables are appropriate here even though they should be used sparingly elsewhere, because timing and measurement data are exactly what tables exist for.

#### 5. Classification systems and grading

If the chapter presents formal classification systems (stages, grades, types, named criteria sets), give each one its own subsection with the full set of stages or types, the defining feature of each, and the imaging correlate when relevant. Examples of what belongs here: AVDC tooth resorption stages 1 to 5 and types 1 to 3, BI-RADS or LI-RADS categories, Bosniak categories, Fleischner criteria, fracture classifications, periodontal disease stages. These systems are heavily tested and frequently looked up. Make them easy to find. If the chapter does not contain formal classifications, omit this section.

#### 6. Pathology

For each disease or abnormality the chapter discusses, give a compact entry with:

- A one-line definition or pathophysiologic basis.
- The classic imaging appearance, with modality and view specified.
- Key discriminators from mimics, when the chapter discusses them.
- Associated findings, complications, or concurrent diseases mentioned.
- Any species, breed, age, or signalment predilections noted.

Write these as tight prose paragraphs, one per entity. Avoid bullet lists within entries unless the chapter itself enumerates a discrete set of findings. Group related entities under subheadings when the chapter does (for example, periodontal disease, endodontic disease, tooth resorption, neoplasia, developmental abnormalities).

#### 7. Quantitative reference

A consolidated section listing every numeric value, threshold, formula, or measurement-based criterion in the chapter. Examples: size cutoffs that distinguish normal from abnormal, timing windows for developmental milestones, heart rate thresholds, predictive formulas, exposure parameters, prevalence percentages when clinically relevant. Format as a short reference list grouped by topic. This section exists so the learner can find a number quickly without rereading prose. If the chapter is quantitatively sparse, this section will be short, and that is fine. Do not invent numbers to fill it.

#### 8. Named signs, classifications, and eponyms

A consolidated list of every named radiographic sign, eponym, classification system reference, or specific named entity in the chapter, each with a one-line description. Examples: chevron sign, lemon sign, Aunt Minnie patterns, named syndromes, named criteria sets. These are board-exam favorites and are useful to have in one place. If the chapter has none, omit the section.

#### 9. High-yield pearls

Five to fifteen short statements capturing the chapter's most exam-relevant or clinically important points. These should be the things a question writer would build a stem around: classic mimics, don't-miss diagnoses, characteristic appearances, common pitfalls, and clinically actionable thresholds. Each pearl should be one or two sentences and should stand alone without context. If the chapter is short or narrow, fewer pearls are fine.

#### 10. Common pitfalls and mimics

Distinct from pearls. This section captures normal variants or benign findings that look like pathology, and pathologic entities that look like one another. Always include the discriminating feature when the chapter provides one. Examples: chevron lucencies versus periapical lesions, mental foramen versus periapical lucency, follicles versus cysts, postoperative changes versus pathology.

#### 11. Interventional considerations

If the chapter discusses image-guided procedures, biopsy, aspiration, or therapeutic intervention, summarize indications, contraindications, technique notes, and reported outcomes. If the chapter does not address intervention, omit this section.

### Style and formatting

Write in narrative prose for sections that describe concepts, appearances, and reasoning. Reserve tables for inherently tabular data (timing, measurements, formulas, classification systems with multiple parallel attributes). Reserve bullet points for the pearls section, the quantitative reference, the named signs list, and the pitfalls section. Avoid bullets elsewhere.

Use section headings and subheadings for navigation. Lowercase all section title words after the first.

Be specific. "The lesion is hyperechoic with distal acoustic enhancement" is useful; "the lesion has characteristic features" is not. When the chapter gives a range, give the range. When the chapter names a sign, name it. When the chapter cites a percentage or prevalence, include it.

When the chapter compares species (for example, dog versus cat), populations (pubertal versus prepubertal, pregnant versus nonpregnant), or any other parallel groups, preserve the comparison structurally. Do not collapse it into a single statement that loses the contrast. If the contrast is dense, a small two-column table is appropriate.

When the chapter uses formal naming or numbering systems (Triadan tooth numbers, BI-RADS categories, Bosniak categories, anatomic naming conventions), use those systems in the summary too. The learner needs to recognize them on exams.

Do not invent content. If the chapter does not address something, leave it out. If the chapter expresses uncertainty or notes that something is difficult to determine on imaging, preserve that uncertainty.

Do not include references, author lists, acknowledgments, or chapter front matter.

### Length

Aim for roughly 10 to 20 percent of the original chapter length, with longer chapters compressing more aggressively. Density of information matters more than length: a tight summary that preserves all the specifics beats a long summary that buries them in prose.

---

Now summarize the following chapter:

[CHAPTER TEXT HERE]
