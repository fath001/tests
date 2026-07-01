import { convertLatexToMarkup } from 'mathlive';

const tests = [
  ['native-bmatrix', String.raw`\begin{bmatrix} \placeholder{} \\ \placeholder{} \end{bmatrix}`],
  ['native-pmatrix', String.raw`\begin{pmatrix} \placeholder{} \\ \placeholder{} \end{pmatrix}`],
  ['manual-left-right-brackets', String.raw`\left[\begin{array}{c} \placeholder{} \\ \placeholder{} \end{array}\right]`],
  ['final-toolbar-bmatrix', String.raw`\class{cme-two-row-matrix-template cme-bmatrix-two-row-template}{\begin{array}{c} \placeholder{} \\[0.18em] \placeholder{} \end{array}}`],
  ['final-dynamic-bmatrix-2row-1col', String.raw`\class{cme-two-row-matrix-template cme-bmatrix-two-row-template cme-bmatrix-single-column-template}{\begin{array}{c} \placeholder{} \\[0.18em] \placeholder{} \end{array}}`],
  ['final-dynamic-bmatrix-2row-2col', String.raw`\class{cme-two-row-matrix-template cme-bmatrix-two-row-template cme-bmatrix-narrow-columns-template}{\begin{array}{cc} \placeholder{} & \placeholder{} \\[0.18em] \placeholder{} & \placeholder{} \end{array}}`],
  ['final-dynamic-bmatrix-3row-2col', String.raw`\class{cme-bmatrix-three-row-template cme-bmatrix-narrow-columns-template}{\begin{array}{cc} \placeholder{} & \placeholder{} \\[0.18em] \placeholder{} & \placeholder{} \\[0.18em] \placeholder{} & \placeholder{} \end{array}}`],
  ['final-dynamic-bmatrix-3row-1col', String.raw`\class{cme-bmatrix-three-row-template cme-bmatrix-single-column-template}{\begin{array}{c} \placeholder{} \\[0.18em] \placeholder{} \\[0.18em] \placeholder{} \end{array}}`],
  ['final-toolbar-pmatrix', String.raw`\class{cme-two-row-matrix-template cme-pmatrix-two-row-template}{\begin{array}{c} \placeholder{} \\[0.18em] \placeholder{} \end{array}}`],
  ['final-toolbar-vmatrix-2row', String.raw`\class{cme-vmatrix-template cme-vmatrix-two-row-template}{\begin{array}{c} \placeholder{} \\[0.18em] \placeholder{} \end{array}}`],
  ['final-toolbar-vmatrix-3row', String.raw`\class{cme-vmatrix-template cme-vmatrix-three-row-template}{\begin{array}{c} \placeholder{} \\[0.18em] \placeholder{} \\[0.18em] \placeholder{} \end{array}}`],
];

for (const [name, latex] of tests) {
  const html = convertLatexToMarkup(latex);
  const metrics = {
    hasCustomClass: html.includes('cme-two-row-matrix-template') || html.includes('cme-bmatrix-three-row-template') || html.includes('cme-bmatrix-single-column-template') || html.includes('cme-bmatrix-narrow-columns-template') || html.includes('cme-vmatrix-template'),
    hasArray: html.includes('mtable') || html.includes('array'),
    hasParseError: html.includes('ML__latex-error') || html.includes('error'),
    length: html.length,
  };
  console.log('--- ' + name);
  console.log('latex:', latex);
  console.log(metrics);
  console.log(html.replace(/\s+/g, ' ').slice(0, 1000));
}
