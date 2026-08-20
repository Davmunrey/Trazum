/**
 * The prose under one `##` heading, ending at the next one.
 *
 * Every contract parity test in this repository harvests the fields it must
 * emit out of `docs/json-output.md`, and every one of them used to bound that
 * harvest by **naming the section that came after it**:
 *
 *     const start = doc.indexOf('## The first-run document');
 *     const end = doc.indexOf('## The gateway refusal document');
 *
 * That is correct exactly until somebody inserts a section between the two, at
 * which point the harvest silently swallows the new one and the test starts
 * demanding fields of a document that has nothing to do with it. It happened
 * when the outcome report and the annual record were documented: eight
 * harvests, all bounded by a neighbour, and inserting two sections in the
 * middle of the file broke the ones that happened to sit above them.
 *
 * Bounding by the subject means bounding by *the next heading, whatever it is*.
 * A section that moves, is renamed, or gains a neighbour keeps working; a
 * section that is deleted fails loudly, which is the correct outcome.
 */
export const sectionOf = (document, heading) => {
  const start = document.indexOf(heading);
  if (start === -1) {
    throw new Error(`the section "${heading}" is not in this document any more`);
  }
  const rest = document.slice(start + heading.length);
  const end = rest.indexOf('\n## ');
  return heading + (end === -1 ? rest : rest.slice(0, end));
};
