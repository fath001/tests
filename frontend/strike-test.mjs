import { convertLatexToMarkup } from "mathlive/ssr";
const samples = [
  "\\htmlStyle{text-decoration:line-through;}{\\placeholder{}}",
  "\\enclose{horizontalstrike}{\\placeholder{}}",
  "\\htmlStyle{text-decoration:line-through;display:inline-block;min-width:0.8em;}{\\placeholder{}}"
];
for (const s of samples) {
  const out = convertLatexToMarkup(s);
  console.log('---' + s);
  console.log(out.slice(0, 900).replace(/\s+/g, ' '));
}
