import { convertLatexToMarkup } from 'mathlive';

const samples = [
  ['manual-left-array', String.raw`\left\{\begin{array}{c}\placeholder{} \\ \placeholder{}\end{array}\right.`],
  ['manual-left-array-strut', String.raw`\left\{\begin{array}{c}\mathstrut \placeholder{} \\ \mathstrut \placeholder{}\end{array}\right.`],
  ['native-cases-1col', String.raw`\begin{cases} \placeholder{} \\ \placeholder{} \end{cases}`],
  ['native-rcases-1col', String.raw`\begin{rcases} \placeholder{} \\ \placeholder{} \end{rcases}`],
  ['native-cases-2x2', String.raw`\begin{cases} \placeholder{} & \placeholder{} \\ \placeholder{} & \placeholder{} \end{cases}`],
  ['custom-left-css', String.raw`\class{cme-cases-left-template}{\begin{array}{c}\placeholder{} \\ \placeholder{}\end{array}}`],
  ['custom-right-css', String.raw`\class{cme-cases-right-template}{\begin{array}{c}\placeholder{} \\ \placeholder{}\end{array}}`],
  ['custom-left-2x2-css', String.raw`\class{cme-cases-left-template cme-cases-2x2-template}{\begin{array}{cc}\placeholder{} & \placeholder{} \\ \placeholder{} & \placeholder{}\end{array}}`],
  ['final-toolbar-cases', String.raw`\class{cme-cases-left-template}{\begin{array}{c} \placeholder{} \\[0.18em] \placeholder{} \end{array}}`],
  ['final-toolbar-rcases', String.raw`\class{cme-cases-right-template}{\begin{array}{c} \placeholder{} \\[0.18em] \placeholder{} \end{array}}`],
  ['final-toolbar-cases-2x2', String.raw`\class{cme-cases-left-template cme-cases-2x2-template}{\begin{array}{cc} \placeholder{} & \placeholder{} \\[0.18em] \placeholder{} & \placeholder{} \end{array}}`],
];

for (const [name, latex] of samples) {
  const html = convertLatexToMarkup(latex);
  const metrics = {
    hasCustomClass: html.includes('cme-cases-'),
    hasArray: html.includes('mtable') || html.includes('array'),
    hasParseError: html.includes('ML__latex-error') || html.includes('error'),
    length: html.length,
  };
  console.log('--- ' + name);
  console.log('latex:', latex);
  console.log(metrics);
  console.log(html.replace(/\s+/g, ' ').slice(0, 1000));
}