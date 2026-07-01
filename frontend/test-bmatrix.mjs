import { convertLatexToMarkup } from 'mathlive';

const tests = [
  '\\begin{bmatrix} \\placeholder{} \\\\ \\placeholder{} \\end{bmatrix}',
  '\\begin{bmatrix} #? \\\\ #? \\end{bmatrix}',
  '\\begin{matrix} \\placeholder{} \\\\ \\placeholder{} \\end{matrix}',
  '\\left[\\begin{matrix} \\placeholder{} \\\\ \\placeholder{} \\end{matrix}\\right]',
  '\\left[\\begin{array}{c} \\placeholder{} \\\\ \\placeholder{} \\end{array}\\right]',
];

for (const t of tests) {
  console.log('INPUT:', t);
  console.log('OUTPUT:', convertLatexToMarkup(t));
  console.log('---');
}
