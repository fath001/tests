import { useRef, useState, useCallback, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { CKEditor } from '@ckeditor/ckeditor5-react';
import {
  ClassicEditor,
  Essentials,
  Bold,
  Italic,
  Underline,
  Paragraph,
  Heading,
  Table,
  TableToolbar,
  TableCellProperties,
  TableProperties,
  List,
  Link,
  Undo,
  Plugin,
  ButtonView,
  Widget,
  toWidget,
} from 'ckeditor5';
import 'ckeditor5/ckeditor5.css';
import 'mathlive';
import './CustomMathEditor.css';
import SpecialCharacterModal from './SpecialCharacterModal';

// Global map + handler ref for widget click → edit popup
window.__ckMathWidgets = window.__ckMathWidgets || new Map();
window.__ckMathWidgetClickHandler = null;

function findMathWidgetFromEventTarget(target) {
  if (!target) return null;

  const path = typeof target.composedPath === 'function' ? target.composedPath() : [target];
  for (const node of path) {
    if (!(node instanceof HTMLElement)) continue;
    if (node.classList?.contains('ck-math-widget')) return node;
    if (node.dataset?.mathId) return node;
    if (node.classList?.contains('ck-widget') && node.querySelector?.('.ck-math-widget-inner')) {
      return node;
    }
  }

  return target instanceof Element ? target.closest?.('.ck-math-widget, [data-math-id]') : null;
}

function getLatexFromWidgetDom(widgetEl) {
  if (!widgetEl) return '';

  const dataLatex = widgetEl.getAttribute('data-latex');
  if (dataLatex) return dataLatex;

  const mf = widgetEl.querySelector('math-field');
  if (mf) return mf.getValue ? mf.getValue() : mf.value || '';

  return '';
}

function getMathDirectionFromWidgetDom(widgetEl) {
  if (!widgetEl) return 'ltr';

  const dataDir = widgetEl.getAttribute('data-dir');
  if (dataDir === 'rtl' || dataDir === 'ltr') return dataDir;

  const mf = widgetEl.querySelector('math-field');
  const mathFieldDir = mf?.getAttribute('dir') || mf?.style?.direction;
  return mathFieldDir === 'rtl' ? 'rtl' : 'ltr';
}

function isModelElementLive(editor, modelElement) {
  if (!editor || !modelElement) return false;
  try {
    editor.model.createPositionBefore(modelElement);
    return true;
  } catch {
    return false;
  }
}

function findMathModelInDocument(editor, widgetEl) {
  if (!editor || !widgetEl) return null;

  const selected = editor.model.document.selection.getSelectedElement();
  if (selected?.name === 'mathInline') return selected;

  const widgetId = widgetEl.getAttribute('data-math-id');
  if (widgetId) {
    const mapped = window.__ckMathWidgets.get(widgetId);
    if (isModelElementLive(editor, mapped)) return mapped;
  }

  const viewElement = editor.editing.view.domConverter.mapDomToView(widgetEl);
  if (viewElement) {
    const mapped = editor.editing.mapper.toModelElement(viewElement);
    if (mapped?.name === 'mathInline') return mapped;
  }

  const latex = getLatexFromWidgetDom(widgetEl);
  if (!latex) return null;

  const root = editor.model.document.getRoot();
  for (const { item } of editor.model.createRangeIn(root)) {
    if (item.is?.('element', 'mathInline') && item.getAttribute('latex') === latex) {
      return item;
    }
  }

  return null;
}

function triggerWidgetEdit(editor, modelElement, latex, widgetEl) {
  if (!editor || editor._mathWidgetOpening) return;
  editor._mathWidgetOpening = true;
  queueMicrotask(() => {
    editor._mathWidgetOpening = false;
  });

  const resolvedModel = isModelElementLive(editor, modelElement)
    ? modelElement
    : findMathModelInDocument(editor, widgetEl);

  const resolvedLatex =
    resolvedModel?.getAttribute('latex') ||
    latex ||
    getLatexFromWidgetDom(widgetEl);
  const resolvedDirection =
    resolvedModel?.getAttribute('dir') === 'rtl' ||
    getMathDirectionFromWidgetDom(widgetEl) === 'rtl'
      ? 'rtl'
      : 'ltr';

  if (!resolvedLatex) return;

  if (resolvedModel) {
    editor.model.change((writer) => {
      writer.setSelection(resolvedModel, 'on');
    });
  }

  const handler = editor.mathWidgetClickHandler || window.__ckMathWidgetClickHandler;
  handler?.(resolvedModel, resolvedLatex, resolvedDirection);
}

function bindWidgetClickTarget(editor, container) {
  if (!container || container._ckMathClickBound) return;
  container._ckMathClickBound = true;

  const onPointerDown = (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation?.();
    triggerWidgetEdit(editor, null, getLatexFromWidgetDom(container), container);
  };

  container.addEventListener('mousedown', onPointerDown, true);
  container.addEventListener('click', onPointerDown, true);
}

/* ══════════════════════════════════════════════════════════
   Symbol groups — same as CustomMathEditor.jsx
══════════════════════════════════════════════════════════ */
const MATH_GROUPS = [
  {
    label: '√(□)', items: [
      // 1. Root & Fraction Group (3 cols)
      { label: '√', insert: '\\sqrt{#0}', title: 'Square Root' },
      { label: '√□', insert: '\\sqrt{#0}', title: 'Root with Placeholder' },
      { label: 'ⁿ√', insert: '\\sqrt[#?]{#0}', title: 'Nth Root' },
      { label: '□/□', insert: '\\frac{#0}{#?}', title: 'Fraction' },

      { type: 'sep', cols: 2 },
      // 2. Brackets & Delimiters Group (2 cols)
      { label: '()', insert: '\\left(#0\\right)', title: 'Parentheses' },
      { label: '[]', insert: '\\left[#0\\right]', title: 'Square Brackets' },
      { label: '||', insert: '\\left|#0\\right|', title: 'Absolute Value' },

      { type: 'sep', cols: 2 },
      // 3. Basic Arithmetic Operators (3 cols)
      { label: '+', insert: '+' },
      { label: '−', insert: '-' },
      { label: '×', insert: '\\times' },
      { label: '÷', insert: '\\div' },
      { label: '±', insert: '\\pm' },

      { type: 'sep', cols: 4 },
      // 4. Comparison & Relation Operators (4 cols)
      { label: '≥', insert: '\\geq' },
      { label: '≤', insert: '\\leq' },
      { label: '∩', insert: '\\cap' },
      { label: '∪', insert: '\\cup' },
      { label: '≠', insert: '\\neq' },
      { label: '∈', insert: '\\in' },
      { label: '≈', insert: '\\approx' },
      { label: '∞', insert: '\\infty' },

      { type: 'sep', cols: 2 },
      // 5. Greek Letters (2 cols)
      { label: 'α', insert: '\\alpha' },
      { label: 'β', insert: '\\beta' },
      { label: 'π', insert: '\\pi' },

      { type: 'sep', cols: 1 },
      // 6. Undo / Redo (1 col)
      { label: '↶', action: 'UNDO', title: 'Undo' },
      { label: '↷', action: 'REDO', title: 'Redo' },

      { type: 'sep', cols: 2 },
      // 7. Formatting Group (2 cols)
      { label: 'B', action: 'BOLD', cls: 'template', title: 'Bold' },
      { label: '〖Ω〗', title: 'Insert Special Character', action: 'SPECIAL_CHARS' },
      { label: '🅰️', action: 'TEXT_COLOR', title: 'Text Color' },

      { type: 'sep', cols: 1 },
      // 8. Text Style Group (1 col)
      { label: 'T₁', insert: '#0_{#?}', title: 'Subscript' },
      { label: 'T¹', insert: '#0^{#?}', title: 'Superscript' },

      { type: 'sep', cols: 1 },
      // 9. Font Controls (1 col)
      { type: 'dropdown', label: 'Font...', width: '92px' },
      { type: 'dropdown', label: 'Size', width: '86px' }
    ]
  },
  {
    label: '±×÷', items: [
      { label: '±', insert: '\\pm' }, { label: '∓', insert: '\\mp' },
      { label: '×', insert: '\\times' }, { label: '÷', insert: '\\div' },
      { label: '\\', insert: '\\backslash' }, { label: '﹨', insert: '﹨' },
      { label: '≠', insert: '\\neq' }, { label: '≤', insert: '\\leq' },
      { label: '≥', insert: '\\geq' }, { label: '≈', insert: '\\approx' },
      { label: '≅', insert: '\\cong' }, { label: '∝', insert: '\\propto' },
      { label: '≡', insert: '\\equiv' }, { label: 'sim', insert: '\\sim' },
      { label: '∞', insert: '\\infty' }, { label: '∑', insert: '\\sum' },
      { label: '∏', insert: '\\prod' },
      { label: '∫', insert: '\\int' }, { label: '∮', insert: '\\oint' },
      { label: '∂', insert: '\\partial' }, { label: '∇', insert: '\\nabla' },
      { label: '⊕', insert: '\\oplus' }, { label: '⊗', insert: '\\otimes' },
      { label: '⊙', insert: '\\odot' },
      { label: '∈', insert: '\\in' }, { label: '∉', insert: '\\notin' },
      { label: '⊂', insert: '\\subset' }, { label: '∪', insert: '\\cup' },
      { label: '∩', insert: '\\cap' }, { label: '∅', insert: '\\emptyset' },
      { label: '√', insert: '\\sqrt{#0}' }, { label: '∛', insert: '\\sqrt[3]{#0}' },
      { label: '□±□', insert: '#? \\pm #?' }, { label: '□≠□', insert: '#? \\neq #?' },
      { label: '□≈□', insert: '#? \\approx #?' },
    ]
  },
  {
    label: '□/□', isTemplate: true, items: [
      { label: 'a/b', insert: '\\frac{#0}{#?}', title: 'Fraction', icon: 'fraction-template-image' },
      { label: '□/□', insert: '{#0}/{#?}', title: 'Bevelled Fraction', cls: 'green-template' },
      { label: 'a/b', insert: '{\\scriptstyle \\frac{#0}{#?}}', title: 'Small Fraction', icon: 'fraction-template-image', cls: 'small-template' },
      { label: '□/□', insert: '{\\scriptstyle {#0}/{#?}}', title: 'Small Bevelled Fraction', cls: 'green-template small-template' },
      { type: 'sep', cols: 4 },
      { label: '√x', insert: '\\sqrt{#0}', title: 'Square Root', icon: 'sqrt-template-image' },
      { label: 'ⁿ√x', insert: '\\sqrt[#?]{#0}', title: 'Nth Root', icon: 'nth-root-template-image' },
      { label: 'xⁿ', insert: '#0^{#?}', title: 'Superscript', icon: 'superscript-template-image' },
     { label: 'ˡ□', insert: '{}^{#?}#?', cls: 'template', directInsert: true, title: 'Left Superscript', icon: 'left-sup-template-image' },
      
      { label: '□^□_□', insert: '#?^{#?}_{#?}', cls: 'template', directInsert: true, title: 'Right Superscript and Subscript', icon: 'right-sup-sub-template-image' },
      { label: 'ˡₗ□', insert: '{}^{#?}_{#?}#?', cls: 'template', directInsert: true, title: 'Left Superscript and Subscript', icon: 'left-sup-sub-template-image' },
      { label: 'xₙ', insert: '#0_{#?}', title: 'Subscript', icon: 'subscript-template-image' },
      { label: 'ₗ□', insert: '{}_{#?}#?', cls: 'template', directInsert: true, title: 'Left Subscript', icon: 'left-sub-template-image' },
      { type: 'sep', cols: 3 },
      { label: '□\n□', insert: '\\overset{#?}{#?}', cls: 'template', directInsert: true, title: 'Overset', icon: 'overset-template-image' },
      { label: '□\n□\n□', insert: '\\overset{#?}{\\underset{#?}{#?}}', cls: 'template', directInsert: true, title: 'Over and Under', icon: 'over-under-template-image' },
      { label: '□\n□', insert: '\\underset{#?}{#?}', cls: 'template', directInsert: true, title: 'Underset', icon: 'underset-template-image' },
      { type: 'sep', cols: 2 },
      { label: '□⏟□', insert: '\\underbrace{#?}_{#?}', cls: 'template', directInsert: true, title: 'Underbrace', icon: 'underbrace-template-image' },
      { label: '□⏞□', insert: '\\overbrace{#?}^{#?}', cls: 'template', directInsert: true, title: 'Overbrace', icon: 'overbrace-template-image' },
      { type: 'sep', cols: 4 },
      { label: '□\n▯\n□', insert: '\\displaystyle{\\underset{\\htmlStyle{font-size:1.1em;display:inline-block;padding-top:0.34em;line-height:1.15}{#?}}{\\overset{\\htmlStyle{font-size:1.1em;display:inline-block;padding-bottom:0.34em;line-height:1.15}{#?}}{\\htmlStyle{font-size:1.45em;line-height:1.1}{#0}}}}', cls: 'template', directInsert: true, title: 'Operator With Upper and Lower Limits', icon: 'operator-limits-both-template-image' },
      { label: '▯\n□', insert: '\\displaystyle{\\underset{\\htmlStyle{font-size:1.1em;display:inline-block;padding-top:0.34em;line-height:1.15}{#?}}{\\htmlStyle{font-size:1.45em;line-height:1.1}{#0}}}', cls: 'template', directInsert: true, title: 'Operator With Lower Limit', icon: 'operator-lower-limit-template-image' },
      { label: '▯^□_□', insert: '\\displaystyle{\\htmlStyle{font-size:1.45em;line-height:1.1}{#0}^{\\htmlStyle{font-size:1.1em;display:inline-block;padding-bottom:0.26em;line-height:1.15}{#?}}_{\\htmlStyle{font-size:1.1em;display:inline-block;padding-top:0.26em;line-height:1.15}{#?}}}', cls: 'template', directInsert: true, title: 'Operator With Right Superscript and Subscript', icon: 'operator-right-sup-sub-template-image' },
      { label: '▯_□', insert: '\\displaystyle{\\htmlStyle{font-size:1.45em;line-height:1.1}{#0}_{\\htmlStyle{font-size:1.1em;display:inline-block;padding-top:0.26em;line-height:1.15}{#?}}}', cls: 'template', directInsert: true, title: 'Operator With Right Subscript', icon: 'operator-right-sub-template-image' },
      { type: 'sep', cols: 3 },
      { label: 'hphantom', insert: '\\hphantom{0}', cls: 'template', directInsert: true, title: 'Horizontal Phantom Space', icon: 'hphantom-space-template-image' },
      { label: 'thin-space', insert: '\\,', cls: 'template', directInsert: true, title: 'Thin Space', icon: 'thin-space-template-image' },
      { label: 'negative-space', insert: '\\!', cls: 'template', directInsert: true, title: 'Negative Thin Space', icon: 'negative-thin-space-template-image' },
    ]
  },
  {
    label: 'sin/cos', items: [
      { label: 'sin', insert: '\\sin' }, { label: 'cos', insert: '\\cos' },
      { label: 'tan', insert: '\\tan' }, { label: 'cot', insert: '\\cot' },
      { label: 'sec', insert: '\\sec' }, { label: 'csc', insert: '\\csc' },
      { label: 'sin(x)', insert: '\\sin\\left(#0\\right)' },
      { label: 'cos(x)', insert: '\\cos\\left(#0\\right)' },
      { label: 'tan(x)', insert: '\\tan\\left(#0\\right)' },
      { label: 'sin⁻¹', insert: '\\sin^{-1}' }, { label: 'cos⁻¹', insert: '\\cos^{-1}' },
      { label: 'tan⁻¹', insert: '\\tan^{-1}' },
      { label: 'sin²x', insert: '\\sin^{2}\\left(#0\\right)' },
      { label: 'cos²x', insert: '\\cos^{2}\\left(#0\\right)' },
      { label: 'tan²x', insert: '\\tan^{2}\\left(#0\\right)' },
      { label: 'sinh', insert: '\\sinh' }, { label: 'cosh', insert: '\\cosh' },
      { label: 'tanh', insert: '\\tanh' },
      { label: 'log', insert: '\\log' }, { label: 'ln', insert: '\\ln' },
      { label: 'exp', insert: '\\exp' },
    ]
  },
  {
    label: '→', items: [
      { label: '→', insert: '\\rightarrow' }, { label: '←', insert: '\\leftarrow' },
      { label: '↔', insert: '\\leftrightarrow' }, { label: '⇒', insert: '\\Rightarrow' },
      { label: '⇐', insert: '\\Leftarrow' }, { label: '⇔', insert: '\\Leftrightarrow' },
      { label: '↤', insert: '\\mapsfrom' }, { label: '↦', insert: '\\mapsto' },
      { label: '|', action: 'ARROW_PICKER', title: 'More Arrows', icon: 'vertical-line-picker-template-image', cls: 'arrow-picker-tool' },
      { type: 'sep', cols: 3 },
      { label: '⋮', insert: '\\vdots', title: 'Vertical ellipsis' },
      { label: '⋰', insert: '⋰', title: 'Up-right diagonal ellipsis' },
      { label: '…', insert: '\\ldots', title: 'Horizontal ellipsis' },
      { label: '⋱', insert: '\\ddots', title: 'Down-right diagonal ellipsis' },
      { label: '⋯', insert: '\\cdots', title: 'Midline ellipsis' },
      { type: 'sep', cols: 3 },
      { label: '-', insert: '-', title: 'Short dash' },
      { label: '–', insert: '–', title: 'Dash' },
      { label: '—', insert: '—', title: 'Long dash' },

      { type: 'sep', cols: 3 },
      { label: 'A→', insert: '\\xrightarrow{#0}', title: 'Arrow with label above', icon: 'arrow-label-right-above' },
      { label: 'A←', insert: '\\xleftarrow{#0}', title: 'Left arrow with label above', icon: 'arrow-label-left-above' },
      { label: '→A', insert: '\\xrightarrow[#?]{}', title: 'Arrow with label below', icon: 'arrow-label-right-below' },
      { label: '←A', insert: '\\xleftarrow[#?]{}', title: 'Left arrow with label below', icon: 'arrow-label-left-below' },
      { label: 'A→B', insert: '\\xrightarrow[#?]{#0}', title: 'Arrow with labels above and below', icon: 'arrow-label-right-above-below' },
      { label: 'A←B', insert: '\\xleftarrow[#?]{#0}', title: 'Left arrow with labels above and below', icon: 'arrow-label-left-above-below' },
      { label: '|', action: 'ARROW_LABEL_PICKER', title: 'More Labelled Arrows', icon: 'vertical-line-picker-template-image', cls: 'arrow-picker-tool arrow-label-picker-tool' },

      { type: 'sep', cols: 2 },
      { label: 'x⇀', insert: '\\overrightharpoon{#0}', title: 'Vector accent', icon: 'accent-harpoon-right' },
      { label: 'x→', insert: '\\overrightarrow{#0}', title: 'Arrow accent', icon: 'accent-arrow-right' },
      { label: 'x↔', insert: '\\overleftrightarrow{#0}', title: 'Left-right arrow accent', icon: 'accent-arrow-both' },
      { label: 'x̄', insert: '\\overline{#0}', title: 'Bar accent', icon: 'accent-bar' },
    ]
  },
  {
    label: '∫ ∯', isTemplate: true, items: [
      { label: '∫', insert: '\\int' }, { label: '∬', insert: '\\iint' },
      { label: '∭', insert: '\\iiint' }, { label: '∮', insert: '\\oint' },
      { label: '∯', insert: '\\oiint' }, { label: '∰', insert: '\\oiiint' },
      { label: '∫dx', insert: '\\int #0 \\, d#?', icon: 'integral-with-differential' },
      { label: '∫ₐᵇ', insert: '\\int_{#?}^{#?} #0 \\, d#?', icon: 'integral-with-limits-differential' },
      { label: '∫∫dA', insert: '\\iint_{#?} #0 \\, dA', title: 'Double Integral with Area Element', icon: 'double-integral-area-template-image' },
      { label: '∮C', insert: '\\oint_{#?} #0 \\, d#?' },
      { label: '∫∫∫dV', insert: '\\iiint_{#?} #0 \\, dV' },
      { label: '∫_C', insert: '\\int_{C} #0 \\, d#?' },
      { label: '∮_C', insert: '\\oint_{C} #0 \\, d#?' },
      { label: '∫∫_D', insert: '\\iint_{D} #0 \\, dA' },
      { label: 'F(b)-F(a)', insert: '\\left[#0\\right]_{#?}^{#?}', title: 'Evaluated Expression', icon: 'evaluated-expression-template-image' },
      { label: 'u-sub', insert: '\\int #0 \\, du' },
    ]
  },
  {
    label: 'd/dx', isTemplate: true, items: [
      { label: 'd/dx', insert: '\\frac{d}{dx}' },
      { label: 'dy/dx', insert: '\\frac{dy}{dx}' },
      { label: 'df/dx', insert: '\\frac{df}{dx}' },
      { label: 'd/dt', insert: '\\frac{d}{dt}' },
      { label: 'dy/dt', insert: '\\frac{dy}{dt}' },
      { label: 'd²y/dx²', insert: '\\frac{d^{2}y}{dx^{2}}' },
      { label: 'd²y/dt²', insert: '\\frac{d^{2}y}{dt^{2}}' },
      { label: 'dⁿy/dxⁿ', insert: '\\frac{d^{#?}#0}{dx^{#?}}' },
      { label: '∂/∂x', insert: '\\frac{\\partial}{\\partial x}' },
      { label: '∂f/∂x', insert: '\\frac{\\partial #0}{\\partial x}' },
      { label: '∂²f/∂x²', insert: '\\frac{\\partial^{2} #0}{\\partial x^{2}}' },
      { label: '∂²f/∂y²', insert: '\\frac{\\partial^{2} #0}{\\partial y^{2}}' },
      { label: '∂²f/∂x∂y', insert: '\\frac{\\partial^{2} #0}{\\partial x \\partial y}' },
      { label: "f'(x)", insert: '#0^{\\prime}(#?)' },
      { label: "f''(x)", insert: '#0^{\\prime\\prime}(#?)' },
      { label: "f'''(x)", insert: '#0^{\\prime\\prime\\prime}(#?)' },
      { label: "y'", insert: 'y^{\\prime}' }, { label: "y''", insert: 'y^{\\prime\\prime}' },
      { label: 'ẋ', insert: '\\dot{#0}' }, { label: 'ẍ', insert: '\\ddot{#0}' },
      { label: '∇f', insert: '\\nabla #0' }, { label: '∇²f', insert: '\\nabla^{2} #0' },
    ]
  },
  {
    label: 'log/ln', isTemplate: true, items: [
      { label: 'log', insert: '\\log' }, { label: 'ln', insert: '\\ln' },
      { label: 'log₁₀', insert: '\\log_{10}' }, { label: 'log₂', insert: '\\log_{2}' },
      { label: 'logₐ', insert: '\\log_{#?}' },
      { label: 'logₐ(x)', insert: '\\log_{#?}\\left(#0\\right)' },
      { label: 'log₁₀(x)', insert: '\\log_{10}\\left(#0\\right)' },
      { label: 'ln(x)', insert: '\\ln\\left(#0\\right)' },
      { label: 'log|x|', insert: '\\log\\left|#0\\right|' },
      { label: 'eˣ', insert: 'e^{#0}', title: 'e to the Power', icon: 'exp-e-template-image' }, { label: 'eⁱˣ', insert: 'e^{i #0}' },
      { label: '10ˣ', insert: '10^{#0}' }, { label: '2ˣ', insert: '2^{#0}' },
      { label: 'aˣ', insert: '#?^{#0}', title: 'Base to the Power', icon: 'exp-generic-template-image' },
      { label: 'log(ab)', insert: '\\log\\left(#0 \\cdot #?\\right)' },
      { label: 'log(a/b)', insert: '\\log\\left(\\frac{#0}{#?}\\right)' },
      { label: 'log(aⁿ)', insert: '\\log\\left(#0^{#?}\\right)' },
    ]
  },
  {
    label: 'π,e', items: [
      { label: 'e', insert: 'e' }, { label: 'i', insert: 'i' },
      { label: 'π', insert: '\\pi' },
      { label: 'ℝ', insert: '\\mathbb{R}' }, { label: 'ℤ', insert: '\\mathbb{Z}' },
      { label: 'ℕ', insert: '\\mathbb{N}' }, { label: 'ℚ', insert: '\\mathbb{Q}' },
      { label: 'ℂ', insert: '\\mathbb{C}' }, { label: '∅', insert: '\\emptyset' },
      { label: 'ℵ₀', insert: '\\aleph_0' },
      { label: 'ξ', insert: '\\xi' },
      { label: 'ρ', insert: '\\rho' }, { label: 'σ', insert: '\\sigma' },
      { label: 'τ', insert: '\\tau' }, { label: 'υ', insert: '\\upsilon' },
      { label: 'φ', insert: '\\varphi' }, { label: 'χ', insert: '\\chi' },
      { label: 'ψ', insert: '\\psi' }, { label: 'ω', insert: '\\omega' },
      { label: 'Γ', insert: '\\Gamma' }, { label: 'Δ', insert: '\\Delta' },
      { label: 'Θ', insert: '\\Theta' }, { label: 'Λ', insert: '\\Lambda' },
      { label: 'Ξ', insert: '\\Xi' }, { label: 'Σ', insert: '\\Sigma' },
      { label: 'Φ', insert: '\\Phi' }, { label: 'Ψ', insert: '\\Psi' },
      { label: 'Ω', insert: '\\Omega' },
      { label: 'θᵢ', insert: '\\theta_{#?}' }, { label: 'λₙ', insert: '\\lambda_{#?}' },
      { label: 'μₓ', insert: '\\mu_{#?}' }, { label: 'σ²', insert: '\\sigma^{2}' },
      { label: 'Δx', insert: '\\Delta #?' },
    ]
  },
  {
    label: '∈∪∩', items: [
      { label: 'Ω', title: 'Insert Special Character', action: 'SPECIAL_CHARS' },
      { label: '⊆', insert: '\\subseteq' }, { label: '⊇', insert: '\\supseteq' },
      { label: '﹨', insert: '﹨' }, { label: '∩', insert: '\\cap' },
      { label: '∪', insert: '\\cup' }, { label: '∅', insert: '\\emptyset' },
      { label: '□⊂□', insert: '#? \\subset #?' }, { label: '□⊆□', insert: '#? \\subseteq #?' },
      { label: '□∈□', insert: '#? \\in #?' }, { label: '□∉□', insert: '#? \\notin #?' },
      { label: '□∪□', insert: '#? \\cup #?' }, { label: '□∩□', insert: '#? \\cap #?' },
    ]
  },
  {
    label: '∀∃', items: [
      { label: '∀', insert: '\\forall' }, { label: '∃', insert: '\\exists' },
      { label: '¬', insert: '\\neg' }, { label: '∧', insert: '\\land' },
      { label: '∨', insert: '\\lor' },
      { label: '□⇒□', insert: '#? \\Rightarrow #?' }, { label: '□⇔□', insert: '#? \\Leftrightarrow #?' },
      { label: '□∧□', insert: '#? \\land #?' }, { label: '□∨□', insert: '#? \\lor #?' },
      { label: '¬□', insert: '\\neg #?' },
    ]
  },
  {
    label: (
      <>
        ⎡□ □⎤
      </>
    ),
    isMatrix: true,
    items: [
      { label: '□', insert: 'matrix', cls: 'template' },
      { label: '[]', insert: 'bmatrix', cls: 'template' },
      { label: '||', insert: 'vmatrix', cls: 'template' },
      { label: '()', insert: 'pmatrix', cls: 'template' },
      { type: 'sep', cols: 2 },
      { label: '□ \\ □ \\ □', insert: '\\begin{matrix} #? \\\\ #? \\\\ #? \\end{matrix}', cls: 'template', directInsert: true },
      { label: '□ □ □', insert: '\\begin{matrix} #? & #? & #? \\end{matrix}', cls: 'template', directInsert: true },
      { label: '□ \\ □', insert: '\\begin{bmatrix} #? \\\\ #? \\end{bmatrix}', cls: 'template', directInsert: true },
      { label: '□ & □', insert: '\\begin{bmatrix} #? & #? \\end{bmatrix}', cls: 'template', directInsert: true },

      { type: 'sep', cols: 2 },
      { label: '□ \\ □', insert: '\\begin{pmatrix} #? \\\\ #? \\end{pmatrix}', cls: 'template', directInsert: true },
      { label: '□ & □', insert: '\\begin{pmatrix} #? & #? \\end{pmatrix}', cls: 'template', directInsert: true },
      // { label: '□ \\ □ \\ □', insert: '\\begin{bmatrix} #? \\\\ #? \\\\ #? \\end{bmatrix}', cls: 'template', directInsert: true },
      // { label: '□ \\ □ \\ □', insert: '\\begin{pmatrix} #? \\\\ #? \\\\ #? \\end{pmatrix}', cls: 'template', directInsert: true },


      { type: 'sep', cols: 2 },
      { label: 'cases', insert: '\\begin{cases} #? \\\\ #? \\end{cases}', cls: 'template', directInsert: true, icon: 'cases-template-image', title: 'Cases' },
      { label: 'rcases', insert: '\\begin{rcases} #? \\\\ #? \\end{rcases}', cls: 'template', directInsert: true, icon: 'rcases-template-image', title: 'Right Cases' },
      { label: 'cases-2x2', insert: '\\begin{cases} #? & #? \\\\ #? & #? \\end{cases}', cls: 'template', directInsert: true, icon: 'cases-two-by-two-template-image', title: 'Cases 2x2' },
      { label: 'aligned', insert: '\\begin{aligned} #? &= #? \\\\ #? &= #? \\end{aligned}', cls: 'template', directInsert: true, icon: 'aligned-equals-template-image', title: 'Aligned Equations' },
      { type: 'sep', cols: 2 },
      { label: '⋮', insert: '\\vdots', title: 'Vertical ellipsis', icon: 'vertical-ellipsis-template-image', directInsert: true },
      { label: '⋯', insert: '\\cdots', title: 'Midline ellipsis', icon: 'midline-ellipsis-template-image', directInsert: true },
      { label: '⋰', insert: '⋰', title: 'Up-right diagonal ellipsis', icon: 'upright-ellipsis-template-image', directInsert: true },
      { label: '⋱', insert: '\\ddots', title: 'Down-right diagonal ellipsis', icon: 'downright-ellipsis-template-image', directInsert: true },
      { type: 'sep', cols: 2 },
      {label: 'sum-array',insert: '\\frac{\\begin{array}{r}#?\\\\+\\,#?\\end{array}}{\\quad#?}',cls: 'template',directInsert: true,icon: 'sum-array-template-image',title: 'Column Addition'},     { label: 'diff-array', insert: '\\frac{\\begin{array}{r}#?\\\\-\\,#?\\end{array}}{\\quad#?}', directInsert: true, icon: 'difference-array-template-image', title: 'Column Subtraction' },
      { label: 'stack-line', insert: '\\frac{\\begin{array}{c}#?\\\\#?\\end{array}}{#?}', cls: 'template', directInsert: true, icon: 'stack-line-template-image', title: 'Stacked Line Layout' },
      { label: 'division', insert: '\\overset{#?}{\\overline{#?\\big)#?}}', cls: 'template', directInsert: true, icon: 'division-layout-template-image', title: 'Division Layout' },
      { label: 'product-array', insert: '\\frac{\\begin{array}{r}#?\\\\\\times\\,#?\\end{array}}{\\quad#?}', cls: 'template', directInsert: true, icon: 'product-array-template-image', title: 'Column Multiplication' },
      { label: 'mixed-fraction', insert: '\\left[\\begin{array}{c|c}#? & #?\\\\#? & #?\\end{array}\\right.', cls: 'template', directInsert: true, icon: 'mixed-fraction-template-image', title: 'Mixed Fraction' },
      { label: 'array-cc', insert: '\\left.\\begin{array}{c}#?\\\\#?\\end{array}\\right|\\begin{array}{c}#?\\\\#?\\end{array}', cls: 'template', directInsert: true, icon: 'array-cc-template-image', title: 'Split Column With Fraction' },
      { label: 'division-remainder', insert: '\\begin{array}{r} \\overset{#?}{\\overline{#?\\big)#?}} \\\\ #? \\end{array}', cls: 'template', directInsert: true, icon: 'division-remainder-template-image', title: 'Division With Remainder' },
    ]
  },
];

const RELATION_MORE_PICKERS = {
  operatorExtras: [
    { label: '\\', insert: '\\backslash', title: 'Slash', icon: 'slash-operator-template-image' },
    { label: '﹨', insert: '﹨', title: 'Reverse Solidus' },
    { label: '∓', insert: '\\mp', title: 'Minus or Plus', icon: 'minus-plus-operator-template-image' },
  ],
  primeExtras: [
    { label: '‴', insert: "'''", cls: 'prime-symbol-tool' },
    { label: '⁗', insert: "''''", cls: 'prime-symbol-tool' },
    { label: '‵', insert: '‵', cls: 'prime-symbol-tool', title: 'Reversed Prime' },
  ],
  notEqualExtras: [
    { label: '≠', insert: '\\neq', title: 'Not Equal', icon: 'not-equal-template-image' },
    { label: '≉', insert: '\\not\\approx', title: 'Not Approximately Equal', icon: 'not-approx-equal-template-image' },
    { label: '≁', insert: '\\nsim', title: 'Not Similar', icon: 'not-similar-template-image' },
    { label: '≢', insert: '\\not\\equiv', title: 'Not Identical', icon: 'not-identical-template-image' },
  ],
  comparisonExtras: [
    { label: '≫', insert: '\\gg', title: 'Much Greater Than', icon: 'much-greater-than-template-image' },
    { label: '≪', insert: '\\ll', title: 'Much Less Than', icon: 'much-less-than-template-image' },
    { label: '⪇', insert: '\\lneqq', title: 'Less Than But Not Equal' },
    { label: '≻', insert: '\\succ', title: 'Succeeds', icon: 'succeeds-template-image' },
    { label: '⪈', insert: '\\gneqq', title: 'Greater Than But Not Equal', icon: 'greater-than-not-equal-template-image' },
    { label: '∝', insert: '\\propto', title: 'Proportional To', icon: 'proportional-to-template-image' },
    { label: '⊲', insert: '\\lhd', title: 'Normal Subgroup', icon: 'normal-subgroup-template-image' },
    { label: '≺', insert: '\\prec', title: 'Precedes', icon: 'precedes-template-image' },
    { label: '▷', insert: '\\rhd', title: 'Contains Normal Subgroup', icon: 'contains-normal-subgroup-template-image' },
  ],
  setExtras: [
    { label: '∉', insert: '\\notin', title: 'Not Element Of', icon: 'not-element-of-template-image' },
    { label: '∌', insert: '\\not\\ni', title: 'Not Contains Member', icon: 'not-contains-member-template-image' },
    { label: '⊆', insert: '\\subseteq', title: 'Subset Equal', icon: 'subset-equal-template-image' },
    { label: '⊇', insert: '\\supseteq', title: 'Superset Equal', icon: 'superset-equal-template-image' },
    { label: '⊏', insert: '\\sqsubset', title: 'Square Subset', icon: 'square-subset-template-image' },
    { label: '⊐', insert: '\\sqsupset', title: 'Square Superset', icon: 'square-superset-template-image' },
    { label: '⊑', insert: '\\sqsubseteq', title: 'Square Subset Equal', icon: 'square-subset-equal-template-image' },
    { label: '⊒', insert: '\\sqsupseteq', title: 'Square Superset Equal', icon: 'square-superset-equal-template-image' },
    { label: '⊓', insert: '\\sqcap', title: 'Square Cap', icon: 'square-cap-template-image' },
    { label: '⊔', insert: '\\sqcup', title: 'Square Cup', icon: 'square-cup-template-image' },
  ],
  logicExtras: [
    { label: '∴', insert: '\\therefore', title: 'Therefore', icon: 'therefore-template-image' },
    { label: '∵', insert: '\\because', title: 'Because', icon: 'because-template-image' },
  ],
  geometryExtras: [
    { label: '∦', insert: '\\nparallel', title: 'Not Parallel', icon: 'not-parallel-template-image' },
    { label: '∡', insert: '\\measuredangle', title: 'Measured Angle', icon: 'measured-angle-template-image' },
    { label: '∢', insert: '\\sphericalangle', title: 'Spherical Angle', icon: 'spherical-angle-template-image' },
    { label: '⋄', insert: '\\diamond', title: 'Diamond', icon: 'diamond-template-image' },
  ],
  shapeExtras: [
    { label: '▭', insert: '▭', title: 'Rectangle', icon: 'rectangle-template-image' },
    { label: '▱', insert: '\\parallelogram', title: 'Parallelogram', icon: 'parallelogram-template-image' },
  ],
  circledExtras: [
    { label: '⊖', insert: '\\ominus', title: 'Circled Minus', icon: 'circled-minus-template-image' },
    { label: '⊛', insert: '\\circledast', title: 'Circled Asterisk', icon: 'circled-asterisk-template-image' },
    { label: '⊘', insert: '⨸', title: 'Circled Divide', icon: 'circled-divide-template-image' },
    { label: '•', insert: '^{\\bullet}', title: 'Raised Bullet', icon: 'raised-bullet-template-image' },
  ],
};

const makeRelationMorePicker = (picker, title = 'More Symbols') => ({
  label: '|',
  action: 'RELATION_MORE_PICKER',
  picker,
  title,
  icon: 'vertical-line-picker-template-image',
  cls: 'arrow-picker-tool relation-more-picker-tool',
});

const RELATIONS_TAB_ITEMS = [
  { label: 'cancel', insert: '\\cancel{#0}', title: 'Negate / Cross Out', icon: 'negate-template-image' },
  { type: 'sep', cols: 1 },
  { label: '+', insert: '+' },
  { label: '·', insert: '\\cdot' },
  { label: '−', insert: '-' },
  { label: '/', insert: '/' },
  { label: '×', insert: '\\times' },
  { label: '±', insert: '\\pm' },
  { label: '÷', insert: '\\div' },
  { label: '*', insert: '\\ast' },
  { label: '∘', insert: '∘' },
  makeRelationMorePicker('operatorExtras', 'More Operators'),

  { type: 'sep', cols: 5 },
  { label: 'π', insert: '\\pi' },
  { label: '∞', insert: '\\infty' },
  { label: '∂', insert: '\\partial' },
  { label: 'Δ', insert: '\\Delta' },
  { label: '°', insert: '\\degree' },
  { label: '′', insert: "'", cls: 'prime-symbol-tool' },
  { label: '∅', insert: '\\emptyset' },
  { label: '∇', insert: '\\nabla' },
  { label: '″', insert: "''", cls: 'prime-symbol-tool' },
  makeRelationMorePicker('primeExtras', 'More Prime Symbols'),
  

  { type: 'sep', cols: 3 },
  { label: '=', insert: '=' },
  { label: '≡', insert: '\\equiv' },
  { label: '~', insert: '\\sim' },
  { label: '≈', insert: '\\approx' },
  { label: '≃', insert: '\\simeq' },
  { label: '≅', insert: '\\cong' },
  makeRelationMorePicker('notEqualExtras', 'More Not Equal Relations'),

  { type: 'sep', cols: 3 },
  { label: '>', insert: '>' },
  { label: '<', insert: '<' },
  { label: '≥', insert: '\\geq' },
  { label: '≤', insert: '\\leq' },
  { label: '⩾', insert: '\\geqslant', title: 'Greater Than or Slanted Equal To' },
  { label: '⩽', insert: '\\leqslant', title: 'Less Than or Slanted Equal To' },
  makeRelationMorePicker('comparisonExtras', 'More Comparison Symbols'),

  { type: 'sep', cols: 3 },
  { label: '∈', insert: '\\in' },
  { label: '∋', insert: '\\ni' },
  { label: '∪', insert: '\\cup' },
  { label: '∩', insert: '\\cap' },
  { label: '⊂', insert: '\\subset' },
  { label: '⊃', insert: '\\supset' },
  makeRelationMorePicker('setExtras', 'More Set Symbols'),

  { type: 'sep', cols: 3 },
  { label: '∧', insert: '\\land' },
  { label: '∨', insert: '\\lor' },
  { label: '¬', insert: '\\neg' },
  { label: '∀', insert: '\\forall' },
  { label: '∃', insert: '\\exists' },
  { label: '∄', insert: '\\nexists' },
  makeRelationMorePicker('logicExtras', 'More Logic Symbols'),

  { type: 'sep', cols: 2 },
  { label: '∠', insert: '\\angle' },
  { label: '∥', insert: '\\parallel' },
  { label: '⊥', insert: '\\perp' },
  makeRelationMorePicker('geometryExtras', 'More Geometry Symbols'),

  { type: 'sep', cols: 3 },
  { label: '□', insert: '\\square' },
  { label: '△', insert: '\\triangle' },
  { label: '○', insert: '\\bigcirc' },
  makeRelationMorePicker('shapeExtras', 'More Shape Symbols'),
  { type: 'sep', cols: 3 },
  { label: '⊕', insert: '\\oplus' },
  { label: '⊗', insert: '\\otimes' },
  { label: '⊙', insert: '\\odot' },
  makeRelationMorePicker('circledExtras', 'More Circled Operators'),
];

const ARROW_PICKER_ITEMS = [
  { label: '↗', insert: '\\nearrow', title: 'North East Arrow' },
  { label: '↘', insert: '\\searrow', title: 'South East Arrow' },
  { label: '↖', insert: '\\nwarrow', title: 'North West Arrow' },
  { label: '↙', insert: '\\swarrow', title: 'South West Arrow' },
  { label: '⤡', insert: '⤡', title: 'North East and South West Arrow' },
  { label: '⤢', insert: '⤢', title: 'North West and South East Arrow' },
  { label: '↩', insert: '\\hookleftarrow', title: 'Hook Left Arrow' },
  { label: '↪', insert: '\\hookrightarrow', title: 'Hook Right Arrow' },
  { label: '↼', insert: '\\leftharpoonup', title: 'Left Harpoon Up' },
  { label: '⇀', insert: '\\rightharpoonup', title: 'Right Harpoon Up' },
  { label: '↑', insert: '\\uparrow', title: 'Up Arrow' },
  { label: '↓', insert: '\\downarrow', title: 'Down Arrow' },
  { label: '⇑', insert: '\\Uparrow', title: 'Double Up Arrow' },
  { label: '⇓', insert: '\\Downarrow', title: 'Double Down Arrow' },
  { label: '⥪', insert: '⥪', title: 'Leftwards Arrow with Hook' },
  { label: '⥭', insert: '⥭', title: 'Rightwards Arrow with Hook' },
  { label: '⇋', insert: '\\leftrightharpoons', title: 'Reverse Equilibrium Harpoons' },
  { label: '⇌', insert: '\\rightleftharpoons', title: 'Equilibrium Harpoons' },
  { label: '↽', insert: '\\leftharpoondown', title: 'Left Harpoon Down' },
  { label: '⇁', insert: '\\rightharpoondown', title: 'Right Harpoon Down' },
  { label: '⇆', insert: '⇆', title: 'Leftwards Arrow over Rightwards Arrow' },
  { label: '⇄', insert: '\\rightleftarrows', title: 'Rightwards Arrow over Leftwards Arrow' },
  { label: '⇅', insert: '⇅', title: 'Upwards Arrow Left of Downwards Arrow' },
  { label: '⇵', insert: '⇵', title: 'Downwards Arrow Left of Upwards Arrow' },
  { label: '⥮', insert: '⥮', title: 'Upwards Harpoon with Barb Left beside Downwards Harpoon with Barb Right' },
  { label: '⥯', insert: '⥯', title: 'Downwards Harpoon with Barb Left beside Upwards Harpoon with Barb Right' },
  {
    label: '⇄',
    insert: '\\rightleftarrows',
    title: 'Rightwards Arrow over Short Leftwards Arrow',
    preview: 'rightleft-short-left'
  },
  {
    label: '→\n←',
    insert: '\\overset{\\to}{\\longleftarrow}',
    title: 'Short Rightwards Arrow over Leftwards Arrow',
    preview: 'right-short-over-left-long'
  },
  { label: '↕', insert: '\\updownarrow', title: 'Up Down Arrow' },
  { label: '⇕', insert: '\\Updownarrow', title: 'Double Up Down Arrow' },
  { label: '↵', insert: '↵', title: 'Downwards Arrow with Corner Leftwards' },
];

const ARROW_LABEL_PICKER_ITEMS = [
  {
    insert: '\\xleftrightarrows{#0}',
    title: 'Right Left Arrows with Overscript',
    icon: 'right-left-arrows-over',
  },
  {
    insert: '\\xleftrightarrows[#0]{}',
    title: 'Right Left Arrows with Underscript',
    icon: 'right-left-arrows-under',
  },
  {
    insert: '\\xleftrightarrows[#?]{#0}',
    title: 'Right Left Arrows with Under and Overscript',
    icon: 'right-left-arrows-over-under',
  },
  {
    insert: '\\xleftrightarrows{#0}',
    title: 'Left Arrow over Right Arrow with Overscript',
    icon: 'left-right-arrows-over',
  },
  {
    insert: '\\xleftrightarrows[#0]{}',
    title: 'Left Arrow over Right Arrow with Underscript',
    icon: 'left-right-arrows-under',
  },
  {
    insert: '\\xleftrightarrows[#?]{#0}',
    title: 'Left Arrow over Right Arrow with Under and Overscript',
    icon: 'left-right-arrows-over-under',
  },
  {
    insert: '\\xleftrightarrows{#0}',
    title: 'Right Arrow over Left Arrow with Overscript',
    icon: 'right-left-stacked-arrows-over',
  },
  {
    insert: '\\xleftrightarrows[#0]{}',
    title: 'Right Arrow over Left Arrow with Underscript',
    icon: 'right-left-stacked-arrows-under',
  },
  {
    insert: '\\xleftrightarrows[#?]{#0}',
    title: 'Right Arrow over Left Arrow with Under and Overscript',
    icon: 'right-left-stacked-arrows-over-under',
  },
  {
    insert: '\\xleftrightharpoons{#0}',
    title: 'Left Harpoon over Right Harpoon with Overscript',
    icon: 'left-right-harpoons-over',
  },
  {
    insert: '\\xleftrightharpoons[#0]{}',
    title: 'Left Harpoon over Right Harpoon with Underscript',
    icon: 'left-right-harpoons-under',
  },
  {
    insert: '\\xleftrightharpoons[#?]{#0}',
    title: 'Left Harpoon over Right Harpoon with Under and Overscript',
    icon: 'left-right-harpoons-over-under',
  },
  {
    insert: '\\xrightleftharpoons{#0}',
    title: 'Right Harpoon over Left Harpoon with Overscript',
    icon: 'right-left-harpoons-over',
  },
  {
    insert: '\\xrightleftharpoons[#0]{}',
    title: 'Right Harpoon over Left Harpoon with Underscript',
    icon: 'right-left-harpoons-under',
  },
  {
    insert: '\\xrightleftharpoons[#?]{#0}',
    title: 'Right Harpoon over Left Harpoon with Under and Overscript',
    icon: 'right-left-harpoons-over-under',
  },
  {
    insert: '\\overset{#0}{\\rightleftarrows}',
    title: 'Rightwards Arrow over Short Leftwards Arrow with Overscript',
    icon: 'long-right-short-left-over',
  },
  {
    insert: '\\underset{#0}{\\rightleftarrows}',
    title: 'Rightwards Arrow over Short Leftwards Arrow with Underscript',
    icon: 'long-right-short-left-under',
  },
  {
    insert: '\\overset{#0}{\\underset{#?}{\\rightleftarrows}}',
    title: 'Rightwards Arrow over Short Leftwards Arrow with Under and Overscript',
    icon: 'long-right-short-left-over-under',
  },
  {
    insert: '\\overset{#0}{\\leftrightarrows}',
    title: 'Short Rightwards Arrow over Leftwards Arrow with Overscript',
    icon: 'short-right-long-left-over',
  },
  {
    insert: '\\underset{#0}{\\leftrightarrows}',
    title: 'Short Rightwards Arrow over Leftwards Arrow with Underscript',
    icon: 'short-right-long-left-under',
  },
  {
    insert: '\\overset{#0}{\\underset{#?}{\\leftrightarrows}}',
    title: 'Short Rightwards Arrow over Leftwards Arrow with Under and Overscript',
    icon: 'short-right-long-left-over-under',
  },
];

const GREEK_ITALIC_UPPERCASE_ITEMS = [
  { label: 'Α', insert: '\\mathit{Α}', title: 'Italic Alpha' },
  { label: 'Β', insert: '\\mathit{Β}', title: 'Italic Beta' },
  { label: 'Γ', insert: '\\varGamma', title: 'Italic Gamma' },
  { label: 'Δ', insert: '\\varDelta', title: 'Italic Delta' },
  { label: 'Ε', insert: '\\mathit{Ε}', title: 'Italic Epsilon' },
  { label: 'Ζ', insert: '\\mathit{Ζ}', title: 'Italic Zeta' },
  { label: 'Η', insert: '\\mathit{Η}', title: 'Italic Eta' },
  { label: 'Θ', insert: '\\varTheta', title: 'Italic Theta' },
  { label: 'Ι', insert: '\\mathit{Ι}', title: 'Italic Iota' },
  { label: 'Κ', insert: '\\mathit{Κ}', title: 'Italic Kappa' },
  { label: 'Λ', insert: '\\varLambda', title: 'Italic Lambda' },
  { label: 'Μ', insert: '\\mathit{Μ}', title: 'Italic Mu' },
  { label: 'Ν', insert: '\\mathit{Ν}', title: 'Italic Nu' },
  { label: 'Ξ', insert: '\\varXi', title: 'Italic Xi' },
  { label: 'Ο', insert: '\\mathit{Ο}', title: 'Italic Omicron' },
  { label: 'Π', insert: '\\varPi', title: 'Italic Pi' },
  { label: 'Ρ', insert: '\\mathit{Ρ}', title: 'Italic Rho' },
  { label: 'Σ', insert: '\\varSigma', title: 'Italic Sigma' },
  { label: 'Τ', insert: '\\mathit{Τ}', title: 'Italic Tau' },
  { label: 'Υ', insert: '\\varUpsilon', title: 'Italic Upsilon' },
  { label: 'Φ', insert: '\\varPhi', title: 'Italic Phi' },
  { label: 'Χ', insert: '\\mathit{Χ}', title: 'Italic Chi' },
  { label: 'Ψ', insert: '\\varPsi', title: 'Italic Psi' },
  { label: 'Ω', insert: '\\varOmega', title: 'Italic Omega' },
];

const BLACKBOARD_BOLD_LETTERS = [
  ['𝔸', 'A'], ['𝔹', 'B'], ['ℂ', 'C'], ['𝔻', 'D'], ['𝔼', 'E'], ['𝔽', 'F'],
  ['𝔾', 'G'], ['ℍ', 'H'], ['𝕀', 'I'], ['𝕁', 'J'], ['𝕂', 'K'], ['𝕃', 'L'],
  ['𝕄', 'M'], ['ℕ', 'N'], ['𝕆', 'O'], ['ℙ', 'P'], ['ℚ', 'Q'], ['ℝ', 'R'],
  ['𝕊', 'S'], ['𝕋', 'T'], ['𝕌', 'U'], ['𝕍', 'V'], ['𝕎', 'W'], ['𝕏', 'X'],
  ['𝕐', 'Y'], ['ℤ', 'Z'],
  ['𝕒', 'a'], ['𝕓', 'b'], ['𝕔', 'c'], ['𝕕', 'd'], ['𝕖', 'e'], ['𝕗', 'f'],
  ['𝕘', 'g'], ['𝕙', 'h'], ['𝕚', 'i'], ['𝕛', 'j'], ['𝕜', 'k'], ['𝕝', 'l'],
  ['𝕞', 'm'], ['𝕟', 'n'], ['𝕠', 'o'], ['𝕡', 'p'], ['𝕢', 'q'], ['𝕣', 'r'],
  ['𝕤', 's'], ['𝕥', 't'], ['𝕦', 'u'], ['𝕧', 'v'], ['𝕨', 'w'], ['𝕩', 'x'],
  ['𝕪', 'y'], ['𝕫', 'z'],
];

const BLACKBOARD_BOLD_PICKER_ITEMS = BLACKBOARD_BOLD_LETTERS.map(([label, letter]) => ({
  label,
  insert: `\\mathbb{${letter}}`,
  title: `Blackboard Bold ${letter}`,
}));

const FRAKTUR_SCRIPT_PICKER_ITEMS = [
  ['𝔄', '\\mathfrak{A}', 'Fraktur A'],
  ['𝔅', '\\mathfrak{B}', 'Fraktur B'],
  ['ℭ', '\\mathfrak{C}', 'Fraktur C'],
  ['𝔇', '\\mathfrak{D}', 'Fraktur D'],
  ['𝔈', '\\mathfrak{E}', 'Fraktur E'],
  ['𝔉', '\\mathfrak{F}', 'Fraktur F'],
  ['𝔊', '\\mathfrak{G}', 'Fraktur G'],
  ['ℌ', '\\mathfrak{H}', 'Fraktur H'],
  ['ℑ', '\\mathfrak{I}', 'Fraktur I'],
  ['𝔍', '\\mathfrak{J}', 'Fraktur J'],
  ['𝔎', '\\mathfrak{K}', 'Fraktur K'],
  ['𝔏', '\\mathfrak{L}', 'Fraktur L'],
  ['𝔐', '\\mathfrak{M}', 'Fraktur M'],
  ['𝔑', '\\mathfrak{N}', 'Fraktur N'],
  ['𝔒', '\\mathfrak{O}', 'Fraktur O'],
  ['𝔓', '\\mathfrak{P}', 'Fraktur P'],
  ['𝔔', '\\mathfrak{Q}', 'Fraktur Q'],
  ['ℜ', '\\mathfrak{R}', 'Fraktur R'],
  ['𝔖', '\\mathfrak{S}', 'Fraktur S'],
  ['𝔗', '\\mathfrak{T}', 'Fraktur T'],
  ['𝔘', '\\mathfrak{U}', 'Fraktur U'],
  ['𝔙', '\\mathfrak{V}', 'Fraktur V'],
  ['𝔚', '\\mathfrak{W}', 'Fraktur W'],
  ['𝔛', '\\mathfrak{X}', 'Fraktur X'],
  ['𝔜', '\\mathfrak{Y}', 'Fraktur Y'],
  ['ℨ', '\\mathfrak{Z}', 'Fraktur Z'],
  ['𝔞', '\\mathfrak{a}', 'Fraktur a'],
  ['𝔟', '\\mathfrak{b}', 'Fraktur b'],
  ['𝔠', '\\mathfrak{c}', 'Fraktur c'],
  ['𝔡', '\\mathfrak{d}', 'Fraktur d'],
  ['𝔢', '\\mathfrak{e}', 'Fraktur e'],
  ['𝔣', '\\mathfrak{f}', 'Fraktur f'],
  ['𝔤', '\\mathfrak{g}', 'Fraktur g'],
  ['𝔥', '\\mathfrak{h}', 'Fraktur h'],
  ['𝔦', '\\mathfrak{i}', 'Fraktur i'],
  ['𝔧', '\\mathfrak{j}', 'Fraktur j'],
  ['𝔨', '\\mathfrak{k}', 'Fraktur k'],
  ['𝔩', '\\mathfrak{l}', 'Fraktur l'],
  ['𝔪', '\\mathfrak{m}', 'Fraktur m'],
  ['𝔫', '\\mathfrak{n}', 'Fraktur n'],
  ['𝔬', '\\mathfrak{o}', 'Fraktur o'],
  ['𝔭', '\\mathfrak{p}', 'Fraktur p'],
  ['𝔮', '\\mathfrak{q}', 'Fraktur q'],
  ['𝔯', '\\mathfrak{r}', 'Fraktur r'],
  ['𝔰', '\\mathfrak{s}', 'Fraktur s'],
  ['𝔱', '\\mathfrak{t}', 'Fraktur t'],
  ['𝔲', '\\mathfrak{u}', 'Fraktur u'],
  ['𝔳', '\\mathfrak{v}', 'Fraktur v'],
  ['𝔴', '\\mathfrak{w}', 'Fraktur w'],
  ['𝔵', '\\mathfrak{x}', 'Fraktur x'],
  ['𝔶', '\\mathfrak{y}', 'Fraktur y'],
  ['𝔷', '\\mathfrak{z}', 'Fraktur z'],
  ['𝒜', '\\mathscr{A}', 'Script A'],
  ['ℬ', '\\mathscr{B}', 'Script B'],
  ['𝒞', '\\mathscr{C}', 'Script C'],
  ['𝒟', '\\mathscr{D}', 'Script D'],
  ['ℰ', '\\mathscr{E}', 'Script E'],
  ['ℱ', '\\mathscr{F}', 'Script F'],
  ['𝒢', '\\mathscr{G}', 'Script G'],
  ['ℋ', '\\mathscr{H}', 'Script H'],
  ['ℐ', '\\mathscr{I}', 'Script I'],
  ['𝒥', '\\mathscr{J}', 'Script J'],
  ['𝒦', '\\mathscr{K}', 'Script K'],
  ['ℒ', '\\mathscr{L}', 'Script L'],
  ['ℳ', '\\mathscr{M}', 'Script M'],
  ['𝒩', '\\mathscr{N}', 'Script N'],
  ['𝒪', '\\mathscr{O}', 'Script O'],
  ['𝒫', '\\mathscr{P}', 'Script P'],
  ['𝒬', '\\mathscr{Q}', 'Script Q'],
  ['ℛ', '\\mathscr{R}', 'Script R'],
  ['𝒮', '\\mathscr{S}', 'Script S'],
  ['𝒯', '\\mathscr{T}', 'Script T'],
  ['𝒰', '\\mathscr{U}', 'Script U'],
  ['𝒱', '\\mathscr{V}', 'Script V'],
  ['𝒲', '\\mathscr{W}', 'Script W'],
  ['𝒳', '\\mathscr{X}', 'Script X'],
  ['𝒴', '\\mathscr{Y}', 'Script Y'],
  ['𝒵', '\\mathscr{Z}', 'Script Z'],
  ['𝒶', '\\mathscr{a}', 'Script a'],
  ['𝒷', '\\mathscr{b}', 'Script b'],
  ['𝒸', '\\mathscr{c}', 'Script c'],
  ['𝒹', '\\mathscr{d}', 'Script d'],
  ['ℯ', '\\mathscr{e}', 'Script e'],
  ['𝒻', '\\mathscr{f}', 'Script f'],
  ['ℊ', '\\mathscr{g}', 'Script g'],
  ['𝒽', '\\mathscr{h}', 'Script h'],
  ['𝒾', '\\mathscr{i}', 'Script i'],
  ['𝒿', '\\mathscr{j}', 'Script j'],
  ['𝓀', '\\mathscr{k}', 'Script k'],
  ['𝓁', '\\mathscr{l}', 'Script l'],
  ['𝓂', '\\mathscr{m}', 'Script m'],
  ['𝓃', '\\mathscr{n}', 'Script n'],
  ['ℴ', '\\mathscr{o}', 'Script o'],
  ['𝓅', '\\mathscr{p}', 'Script p'],
  ['𝓆', '\\mathscr{q}', 'Script q'],
  ['𝓇', '\\mathscr{r}', 'Script r'],
  ['𝓈', '\\mathscr{s}', 'Script s'],
  ['𝓉', '\\mathscr{t}', 'Script t'],
  ['𝓊', '\\mathscr{u}', 'Script u'],
  ['𝓋', '\\mathscr{v}', 'Script v'],
  ['𝓌', '\\mathscr{w}', 'Script w'],
  ['𝓍', '\\mathscr{x}', 'Script x'],
  ['𝓎', '\\mathscr{y}', 'Script y'],
  ['𝓏', '\\mathscr{z}', 'Script z'],
].map(([label, insert, title]) => ({ label, insert, title }));

const HEBREW_SYMBOL_PICKER_ITEMS = [
  { label: 'ℵ', insert: '\\aleph', title: 'Aleph' },
  { label: 'ℒ', insert: '\\mathscr{L}', title: 'Script L' },
  { label: '℘', insert: '\\wp', title: 'Weierstrass p' },
  { label: '𝒵', insert: '\\mathscr{Z}', title: 'Script Z' },
  { label: 'ℱ', insert: '\\mathscr{F}', title: 'Script F' },
];

const ARABIC_INDIC_DIGITS = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
const EASTERN_ARABIC_INDIC_DIGITS = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];

function convertDigitsToNumeralSystem(value, numeralMode) {
  if (!value || numeralMode === 'western') return value;

  const digits = numeralMode === 'arabicIndic'
    ? ARABIC_INDIC_DIGITS
    : numeralMode === 'easternArabicIndic'
      ? EASTERN_ARABIC_INDIC_DIGITS
      : null;

  if (!digits) return value;

  return String(value).replace(/\d/g, (digit) => digits[Number(digit)] || digit);
}

const PERIODIC_TABLE_CELL_SIZE = 31;
const PERIODIC_TABLE_GAP = 2;
const PERIODIC_TABLE_PITCH = PERIODIC_TABLE_CELL_SIZE + PERIODIC_TABLE_GAP;
const PERIODIC_TABLE_WIDTH = (18 * PERIODIC_TABLE_CELL_SIZE) + (17 * PERIODIC_TABLE_GAP);
const PERIODIC_TABLE_HEIGHT = (9 * PERIODIC_TABLE_CELL_SIZE) + (8 * PERIODIC_TABLE_GAP);

const PERIODIC_TABLE_ROWS = [
  {
    row: 1,
    items: [
      ['H', 1, 'hydrogen'],
      ['He', 18, 'noble-gas'],
    ],
  },
  {
    row: 2,
    items: [
      ['Li', 1, 'alkali'],
      ['Be', 2, 'alkaline'],
      ['B', 13, 'nonmetal'],
      ['C', 14, 'nonmetal'],
      ['N', 15, 'nonmetal'],
      ['O', 16, 'nonmetal'],
      ['F', 17, 'nonmetal'],
      ['Ne', 18, 'noble-gas'],
    ],
  },
  {
    row: 3,
    items: [
      ['Na', 1, 'alkali'],
      ['Mg', 2, 'alkaline'],
      ['Al', 13, 'post-transition'],
      ['Si', 14, 'post-transition'],
      ['P', 15, 'nonmetal'],
      ['S', 16, 'nonmetal'],
      ['Cl', 17, 'nonmetal'],
      ['Ar', 18, 'noble-gas'],
    ],
  },
  {
    row: 4,
    items: [
      ['K', 1, 'alkali'],
      ['Ca', 2, 'alkaline'],
      ['Sc', 3, 'transition'],
      ['Ti', 4, 'transition'],
      ['V', 5, 'transition'],
      ['Cr', 6, 'transition'],
      ['Mn', 7, 'transition'],
      ['Fe', 8, 'transition'],
      ['Co', 9, 'transition'],
      ['Ni', 10, 'transition'],
      ['Cu', 11, 'transition'],
      ['Zn', 12, 'transition'],
      ['Ga', 13, 'post-transition'],
      ['Ge', 14, 'post-transition'],
      ['As', 15, 'nonmetal'],
      ['Se', 16, 'nonmetal'],
      ['Br', 17, 'nonmetal'],
      ['Kr', 18, 'noble-gas'],
    ],
  },
  {
    row: 5,
    items: [
      ['Rb', 1, 'alkali'],
      ['Sr', 2, 'alkaline'],
      ['Y', 3, 'transition'],
      ['Zr', 4, 'transition'],
      ['Nb', 5, 'transition'],
      ['Mo', 6, 'transition'],
      ['Tc', 7, 'transition'],
      ['Ru', 8, 'transition'],
      ['Rh', 9, 'transition'],
      ['Pd', 10, 'transition'],
      ['Ag', 11, 'transition'],
      ['Cd', 12, 'transition'],
      ['In', 13, 'post-transition'],
      ['Sn', 14, 'post-transition'],
      ['Sb', 15, 'nonmetal'],
      ['Te', 16, 'nonmetal'],
      ['I', 17, 'nonmetal'],
      ['Xe', 18, 'noble-gas'],
    ],
  },
  {
    row: 6,
    items: [
      ['Cs', 1, 'alkali'],
      ['Ba', 2, 'alkaline'],
      ['Hf', 4, 'transition'],
      ['Ta', 5, 'transition'],
      ['W', 6, 'transition'],
      ['Re', 7, 'transition'],
      ['Os', 8, 'transition'],
      ['Ir', 9, 'transition'],
      ['Pt', 10, 'transition'],
      ['Au', 11, 'transition'],
      ['Hg', 12, 'transition'],
      ['Tl', 13, 'post-transition'],
      ['Pb', 14, 'post-transition'],
      ['Bi', 15, 'post-transition'],
      ['Po', 16, 'post-transition'],
      ['At', 17, 'nonmetal'],
      ['Rn', 18, 'noble-gas'],
    ],
  },
  {
    row: 7,
    items: [
      ['Fr', 1, 'alkali'],
      ['Ra', 2, 'alkaline'],
      ['Rf', 4, 'transition'],
      ['Db', 5, 'transition'],
      ['Sg', 6, 'transition'],
      ['Bh', 7, 'transition'],
      ['Hs', 8, 'transition'],
      ['Mt', 9, 'transition'],
      ['Ds', 10, 'transition'],
      ['Rg', 11, 'transition'],
      ['Cn', 12, 'transition'],
      ['Nh', 13, 'post-transition'],
      ['Fl', 14, 'post-transition'],
      ['Mc', 15, 'post-transition'],
      ['Lv', 16, 'post-transition'],
      ['Ts', 17, 'placeholder'],
      ['Og', 18, 'placeholder'],
    ],
  },
  {
    row: 8,
    items: [
      ['La', 4, 'series-anchor'],
      ['Ce', 5, 'lanthanide'],
      ['Pr', 6, 'lanthanide'],
      ['Nd', 7, 'lanthanide'],
      ['Pm', 8, 'lanthanide'],
      ['Sm', 9, 'lanthanide'],
      ['Eu', 10, 'lanthanide'],
      ['Gd', 11, 'lanthanide'],
      ['Tb', 12, 'lanthanide'],
      ['Dy', 13, 'lanthanide'],
      ['Ho', 14, 'lanthanide'],
      ['Er', 15, 'lanthanide'],
      ['Tm', 16, 'lanthanide'],
      ['Yb', 17, 'lanthanide'],
      ['Lu', 18, 'lanthanide'],
    ],
  },
  {
    row: 9,
    items: [
      ['Ac', 4, 'series-anchor'],
      ['Th', 5, 'actinide'],
      ['Pa', 6, 'actinide'],
      ['U', 7, 'actinide'],
      ['Np', 8, 'actinide'],
      ['Pu', 9, 'actinide'],
      ['Am', 10, 'actinide'],
      ['Cm', 11, 'actinide'],
      ['Bk', 12, 'actinide'],
      ['Cf', 13, 'actinide'],
      ['Es', 14, 'actinide'],
      ['Fm', 15, 'actinide'],
      ['Md', 16, 'actinide'],
      ['No', 17, 'actinide'],
      ['Lr', 18, 'actinide'],
    ],
  },
];

const PERIODIC_TABLE_PICKER_ITEMS = PERIODIC_TABLE_ROWS.flatMap(({ row, items }) =>
  items.map(([label, col, tone]) => ({
    label,
    insert: label,
    row,
    col,
    tone,
    title: label,
  }))
);

const FONT_OPTIONS = [
  { label: 'Times', value: 'family:roman', style: { fontFamily: 'roman' } },
  { label: 'Helvetica', value: 'family:sans-serif', style: { fontFamily: 'sans-serif' } },
  { label: 'Courier', value: 'family:monospace', style: { fontFamily: 'monospace' } },
  { label: 'Calligraphic', value: 'variant:calligraphic', style: { variant: 'calligraphic' } },
  { label: 'Script', value: 'variant:script', style: { variant: 'script' } },
  { label: 'Fraktur', value: 'variant:fraktur', style: { variant: 'fraktur' } },
  { label: 'Blackboard', value: 'variant:double-struck', style: { variant: 'double-struck' } },
];

const DEFAULT_FONT_STYLE = { fontFamily: 'none', variant: 'main' };

const FONT_SIZE_OPTIONS = [
  { label: '8px', value: '3' },
  { label: '10px', value: '4' },
  { label: '12px', value: '5' },
  { label: '14px', value: '6' },
  { label: '16px', value: '7' },
  { label: '18px', value: '8' },
  { label: '24px', value: '10' },
  // { label: '36px', value: '12' },
  // { label: '48px', value: '14' },
  // { label: '72px', value: '18' },
];

const MOVE_TEXT_TEMPLATE_MAP = {
  up: {
    selection: '\\htmlStyle{display:inline-block;position:relative;top:-0.65em;}{#@}',
  },
  right: {
    selection: '\\htmlStyle{display:inline-block;position:relative;left:0.65em;}{#@}',
  },
  left: {
    selection: '\\htmlStyle{display:inline-block;position:relative;left:-0.65em;}{#@}',
  },
  down: {
    selection: '\\htmlStyle{display:inline-block;position:relative;top:0.65em;}{#@}',
  },
};

const ORDERED_MATH_GROUPS = [
  {
    id: 'roots-main',
    label: <RootFractionTabIcon />,
    items: [
      // GROUP 1 - Fractions & Roots (cols: 2)
      { label: '□/□', insert: '\\frac{#0}{#?}', title: 'Fraction', cls: 'green-template', icon: 'stacked-fraction' },
      { label: '□/□', insert: '{#0}/{#?}', title: 'Bevelled Fraction', cls: 'green-template' },
      { label: '√□', insert: '\\sqrt{#0}', title: 'Square Root', cls: 'green-template', icon: 'square-root-template' },
      { label: '□√□', insert: '\\sqrt[#?]{#0}', title: 'Root', cls: 'green-template', icon: 'nth-root-template' },
      { type: 'sep', cols: 2 },
      // GROUP 2a - Brackets (cols: 2)
      { label: '□^□', insert: '#0^{#?}', title: 'Superscript', cls: 'green-template', icon: 'superscript-template' },
      { label: '□_□', insert: '#0_{#?}', title: 'Subscript', cls: 'green-template', icon: 'subscript-template' },
      
      { type: 'sep', cols: 1 },
      // GROUP 2b - Super/Subscript (cols: 1)
      { label: '(□)', insert: '\\left(#0\\right)', title: 'Parentheses', cls: 'green-template' },
      { label: '|□|', insert: '\\left|#0\\right|', title: 'Absolute Value', cls: 'green-template' },
      { label: '[□]', insert: '\\left[#0\\right]', title: 'Square Brackets', cls: 'green-template' },
      { label: '{□}', insert: '\\left\\{#0\\right\\}', title: 'Curly Braces', cls: 'green-template' },
      { type: 'sep', cols: 3 },
      // GROUP 3 - Operators (cols: 3)
      { label: '+', insert: '+' },
      { label: '−', insert: '-' },
      { label: '×', insert: '\\times' },
      { label: '÷', insert: '\\div' },
      { label: '/', insert: '/' },
      { label: '±', insert: '\\pm' },
      { type: 'sep', cols: 3 },
      // GROUP 4 - Relations (cols: 4)
      { label: '≥', insert: '\\geq' },
      { label: '≤', insert: '\\leq' },
      { label: '∩', insert: '\\cap' },
      { label: '∪', insert: '\\cup' },
      { label: '=', insert: '=' },
        { label: '≠', insert: '\\neq' },
      { label: '⊂', insert: '\\subset' },
      { label: '∈', insert: '\\in' },
      { type: 'sep', cols: 4 },
      // GROUP 5 - Symbols (cols: 2)
      { label: '∅', insert: '\\emptyset' },
      { label: '∞', insert: '\\infty' },
      { label: 'π', insert: '\\pi' },
      { label: 'ℕ', insert: '\\mathbb{N}' },
      { type: 'sep', cols: 2 },
      // GROUP 6 - Clipboard (cols: 3)
      { label: '✂', action: 'CUT', title: 'Cut Formula', cls: 'soft-tool' },
      { label: '⧉', action: 'COPY', title: 'Copy Formula', cls: 'soft-tool' },
      { label: '⎘', action: 'PASTE', title: 'Paste Formula', cls: 'soft-tool' },
      { label: '↶', action: 'UNDO', title: 'Undo', cls: 'soft-tool' },
      { label: '↷', action: 'REDO', title: 'Redo', cls: 'soft-tool' },
      { label: '⌫', action: 'CLEAR', title: 'Clear Formula', cls: 'soft-tool' },
      { type: 'sep', cols: 3 },
      // GROUP 7 - Formatting (cols: 3)
      { label: 'B', action: 'BOLD', cls: 'template format-tool', title: 'Bold' },
      { label: '1b', action: 'ITALIC', cls: 'format-tool', title: 'Italic' },
      { label: 'BI', action: 'BOLD_ITALIC', cls: 'format-tool', title: 'Bold Italic' },
      { label: 'Ω', action: 'SPECIAL_CHARS', cls: 'format-tool omega-tool', title: 'Greek Letters' },
      { label: 'T', action: 'TEXT', cls: 'format-tool text-tool', title: 'Regular Text' },
      { label: 'A', action: 'TEXT_COLOR', cls: 'format-tool color-tool', title: 'Text Color' },
      { type: 'sep', cols: 1 },
      { label: 'RTL', action: 'TOGGLE_RTL', cls: 'format-tool rtl-tool', title: 'Right-to-Left Input', icon: 'rtl-input-template-image' },
      { type: 'sep', cols: 1 },
      { type: 'dropdown', label: 'Font...', width: '92px' },
      { type: 'dropdown', label: 'Size', width: '86px' },
    ],
  },
  {
    id: 'relations',
    ...MATH_GROUPS[1],
    items: RELATIONS_TAB_ITEMS,
    label: <TabIcon top="∈∞" compact />,
  },
  {
    id: 'arrows',
    ...MATH_GROUPS[4],
    label: <ArrowTabIcon />,
  },
  {
    id: 'greek',
    label: <TabIcon top="α Ω" compact />,
    items: [
      { category: 'Lowercase Greek Letters', label: 'α', insert: '\\alpha' },
      { category: 'Lowercase Greek Letters', label: 'β', insert: '\\beta' },
      { category: 'Lowercase Greek Letters', label: 'γ', insert: '\\gamma' },
      { category: 'Lowercase Greek Letters', label: 'δ', insert: '\\delta' },
      { category: 'Lowercase Greek Letters', label: 'ε', insert: '\\epsilon' },
      { category: 'Lowercase Greek Letters', label: 'ζ', insert: '\\zeta' },
      { category: 'Lowercase Greek Letters', label: 'η', insert: '\\eta' },
      { category: 'Lowercase Greek Letters', label: 'θ', insert: '\\theta' },
      { category: 'Lowercase Greek Letters', label: 'ϑ', insert: '\\vartheta' },
      { category: 'Lowercase Greek Letters', label: 'ι', insert: '\\iota' },
      { category: 'Lowercase Greek Letters', label: 'κ', insert: '\\kappa' },
      { category: 'Lowercase Greek Letters', label: 'λ', insert: '\\lambda' },
      { category: 'Lowercase Greek Letters', label: 'μ', insert: '\\mu' },
      { category: 'Lowercase Greek Letters', label: 'ν', insert: '\\nu' },
      { category: 'Lowercase Greek Letters', label: 'ξ', insert: '\\xi' },
      { category: 'Lowercase Greek Letters', label: 'ο', insert: 'ο' },
      { category: 'Lowercase Greek Letters', label: 'π', insert: '\\pi' },
      { category: 'Lowercase Greek Letters', label: 'ϖ', insert: '\\varpi' },
      { category: 'Lowercase Greek Letters', label: 'ρ', insert: '\\rho' },
      { category: 'Lowercase Greek Letters', label: 'ς', insert: '\\varsigma' },
      { category: 'Lowercase Greek Letters', label: 'σ', insert: '\\sigma' },
      { category: 'Lowercase Greek Letters', label: 'τ', insert: '\\tau' },
      { category: 'Lowercase Greek Letters', label: 'υ', insert: '\\upsilon' },
      { category: 'Lowercase Greek Letters', label: 'φ', insert: '\\phi' },
      { category: 'Lowercase Greek Letters', label: 'ϕ', insert: '\\varphi' },
      { category: 'Lowercase Greek Letters', label: 'χ', insert: '\\chi' },
      { category: 'Lowercase Greek Letters', label: 'ψ', insert: '\\psi' },
      { category: 'Lowercase Greek Letters', label: 'ω', insert: '\\omega' },
      { category: 'Lowercase Greek Letters', label: '|', action: 'GREEK_ITALIC_PICKER', title: 'Italic Uppercase Greek', icon: 'vertical-line-picker-template-image', cls: 'arrow-picker-tool greek-italic-picker-tool' },

      { category: 'Uppercase Greek Letters', label: 'ℕ', insert: '\\mathbb{N}' },
      { category: 'Uppercase Greek Letters', label: 'ℤ', insert: '\\mathbb{Z}' },
      { category: 'Uppercase Greek Letters', label: 'ℚ', insert: '\\mathbb{Q}' },
      { category: 'Uppercase Greek Letters', label: 'ℂ', insert: '\\mathbb{C}' },
      { category: 'Uppercase Greek Letters', label: 'ℝ', insert: '\\mathbb{R}' },
      { category: 'Uppercase Greek Letters', label: 'ℙ', insert: '\\mathbb{P}' },
      { category: 'Uppercase Greek Letters', label: '|', action: 'BLACKBOARD_BOLD_PICKER', title: 'More Blackboard Bold Letters', icon: 'vertical-line-picker-template-image', cls: 'arrow-picker-tool blackboard-bold-picker-tool' },

      { category: 'Fraktur / Gothic Symbols', label: '𝔄', insert: '\\mathfrak{A}' },
      { category: 'Fraktur / Gothic Symbols', label: '𝒜', insert: '\\mathscr{A}' },
      { category: 'Fraktur / Gothic Symbols', label: '𝔅', insert: '\\mathfrak{B}' },
      { category: 'Fraktur / Gothic Symbols', label: 'ℬ', insert: '\\mathscr{B}' },
      { category: 'Fraktur / Gothic Symbols', label: 'ℭ', insert: '\\mathfrak{C}' },
      { category: 'Fraktur / Gothic Symbols', label: '𝒞', insert: '\\mathscr{C}' },
      { category: 'Fraktur / Gothic Symbols', label: '|', action: 'FRAKTUR_SCRIPT_PICKER', title: 'More Fraktur and Script Letters', icon: 'vertical-line-picker-template-image', cls: 'arrow-picker-tool fraktur-script-picker-tool' },

      { category: 'Hebrew Mathematical Symbols', label: 'ℑ', insert: '\\Im' },
      { category: 'Hebrew Mathematical Symbols', label: 'ℜ', insert: '\\Re' },
      { category: 'Hebrew Mathematical Symbols', label: '𝓁', insert: '\\ell' },
      { category: 'Hebrew Mathematical Symbols', label: '|', action: 'HEBREW_SYMBOL_PICKER', title: 'More Hebrew Mathematical Symbols', icon: 'vertical-line-picker-template-image', cls: 'arrow-picker-tool hebrew-symbol-picker-tool' },

      { category: 'Arabic-Indic Numeral Systems', label: '٤٦', action: 'ARABIC_INDIC_NUMERALS', title: 'Arabic-Indic Numerals', icon: 'arabic-indic-numerals-template-image', cls: 'numeral-mode-tool' },
      { category: 'Arabic-Indic Numeral Systems', label: '۴۶', action: 'EASTERN_ARABIC_INDIC_NUMERALS', title: 'Eastern Arabic-Indic Numerals (Persian/Urdu)', icon: 'eastern-arabic-indic-numerals-template-image', cls: 'numeral-mode-tool' },

      { category: 'Blackboard Bold / Number Sets', label: 'H', insert: 'H' },
      { category: 'Blackboard Bold / Number Sets', label: 'C', insert: 'C' },
      { category: 'Blackboard Bold / Number Sets', label: 'N', insert: 'N' },
      { category: 'Blackboard Bold / Number Sets', label: 'O', insert: 'O' },
      { category: 'Blackboard Bold / Number Sets', label: 'F', insert: 'F' },
      { category: 'Blackboard Bold / Number Sets', label: 'S', insert: 'S' },
      { category: 'Blackboard Bold / Number Sets', label: '|', action: 'PERIODIC_TABLE_PICKER', title: 'Periodic Table', icon: 'vertical-line-picker-template-image', cls: 'arrow-picker-tool periodic-table-picker-tool' },
    ],
  },
  {
    id: 'matrix',
    ...MATH_GROUPS[11],
    label: <MatrixTabIcon />,
  },
  {
    id: 'power-frac',
    ...MATH_GROUPS[2],
    label: <PowerFracTabIcon />,
  },
  {
    id: 'brackets',
    label: <BracketsTabIcon />,
    items: [
      { label: '(□)', insert: '\\left(#0\\right)' },
      { label: '[□]', insert: '\\left[#0\\right]' },
      { label: '|□|', insert: '\\left|#0\\right|' },
      { label: '‖□‖', insert: '\\left\\| #0 \\right\\|' },
      { label: '⟨□⟩', insert: '\\left\\langle #0 \\right\\rangle' },
      { label: '{□}', insert: '\\left\\{#0\\right\\}' },
      { label: '⌊□⌋', insert: '\\left\\lfloor #0 \\right\\rfloor' },
      { label: '⌈□⌉', insert: '\\left\\lceil #0 \\right\\rceil' },
      { label: '⟨□|□⟩', insert: '\\left\\langle #0 \\middle| #? \\right\\rangle' },
      { type: 'sep', cols: 2 },
      { label: 'overbrace', insert: '\\overbrace{#0}', cls: 'template', directInsert: true, title: 'Overbrace', icon: 'overbrace-arc-template-image' },
      { label: 'underbrace', insert: '\\underbrace{#0}', cls: 'template', directInsert: true, title: 'Underbrace', icon: 'underbrace-arc-template-image' },
      { label: 'overparen', insert: '\\overparen{#0}', cls: 'template', directInsert: true, title: 'Overparen', icon: 'overparen-template-image' },
      { label: 'underparen', insert: '\\underparen{#0}', cls: 'template', directInsert: true, title: 'Underparen', icon: 'underparen-template-image' },
      { type: 'sep', cols: 2 },
      { label: '⃗\n▯', insert: '\\vec{#0}', cls: 'template', directInsert: true, title: 'Vector Accent', icon: 'vec-accent-template-image' },
      { label: '→\n▯', insert: '\\overrightarrow{#?}', cls: 'template', directInsert: true, title: 'Right Arrow Accent', icon: 'overrightarrow-accent-template-image' },
      { label: '↔\n▯', insert: '\\overleftrightarrow{#?}', cls: 'template', directInsert: true, title: 'Left-Right Arrow Accent', icon: 'overleftrightarrow-accent-template-image' },
      { label: '¯\n▯', insert: '\\overline{#?}', cls: 'template', directInsert: true, title: 'Overline Accent', icon: 'overline-accent-template-image' },
      { label: '^\n▯', insert: '\\hat{#?}', cls: 'template', directInsert: true, title: 'Hat Accent', icon: 'hat-accent-template-image' },
      { label: '~\n▯', insert: '\\tilde{#?}', cls: 'template', directInsert: true, title: 'Tilde Accent', icon: 'tilde-accent-template-image' },
      { label: '¨\n▯', insert: '\\ddot{#?}', cls: 'template', directInsert: true, title: 'Double Dot Accent', icon: 'ddot-accent-template-image' },
      { label: '˙\n▯', insert: '\\dot{#?}', cls: 'template', directInsert: true, title: 'Dot Accent', icon: 'dot-accent-template-image' },
      { type: 'sep', cols: 2 },
      { label: '¯\n▯', insert: '\\overline{#?}', cls: 'template', directInsert: true, title: 'Overline', icon: 'overline-frame-template-image' },
      { label: '_\n▯', insert: '\\underline{#?}', cls: 'template', directInsert: true, title: 'Underline', icon: 'underline-frame-template-image' },
      { label: '|\n▯', insert: '\\left|#?\\right.', cls: 'template', directInsert: true, title: 'Left Bar', icon: 'left-bar-template-image' },
      { label: '▯\n|', insert: '\\left.#?\\right|', cls: 'template', directInsert: true, title: 'Right Bar', icon: 'right-bar-template-image' },
      { label: '□\n▯', insert: '\\boxed{#?}', cls: 'template', directInsert: true, title: 'Boxed', icon: 'boxed-square-template-image' },
      { label: '(\n▯\n)', insert: '\\enclose{circle}{#?}', cls: 'template', directInsert: true, title: 'Rounded Enclosure', icon: 'paren-frame-template-image' },
      { label: '¯\n▯|', insert: '\\overline{\\left.#?\\right|}', cls: 'template', directInsert: true, title: 'Overline with Right Bar', icon: 'overline-right-bar-template-image' },
      { label: '▢\n▯', insert: '\\enclose{roundedbox}{#?}', cls: 'template', directInsert: true, title: 'Rounded Boxed', icon: 'boxed-rounded-template-image' },
      { type: 'sep', cols: 2 },
      { label: '╱\n▯', insert: '\\cancel{#?}', cls: 'template', directInsert: true, title: 'Cancel', icon: 'cancel-diagonal-template-image' },
      { label: '╲\n▯', insert: '\\bcancel{#?}', cls: 'template', directInsert: true, title: 'Backward Cancel', icon: 'bcancel-template-image' },
      { label: '─\n▯', insert: '\\enclose{horizontalstrike}{#?}', cls: 'template', directInsert: true, title: 'Strikeout Text', icon: 'sout-template-image' },
      { label: '╳\n▯', insert: '\\xcancel{#?}', cls: 'template', directInsert: true, title: 'Cross Cancel', icon: 'xcancel-template-image' },
      { label: '│\n▯', insert: '\\enclose{verticalstrike}{#?}', cls: 'template', directInsert: true, title: 'Vertical Strike', icon: 'vertical-strike-template-image' },
      { label: ')\n¯', insert: '\\overline{\\left)#?\\right.}', cls: 'template', directInsert: true, title: 'Overline with Curved Left Boundary', icon: 'overline-left-curve-template-image' },
      { label: '┼\n▯', insert: '\\enclose{verticalstrike horizontalstrike}{#?}', cls: 'template', directInsert: true, title: 'Vertical and Horizontal Strike', icon: 'crosshair-strike-template-image' },
    ],
  },
  {
    id: 'sets',
    label: <TabIcon top="Σ ∪" compact />,
    items: [
      { label: 'sum-limits-both', insert: '\\sum\\limits_{#?}^{#?}', cls: 'template', directInsert: true, title: 'Summation With Upper and Lower Limits', icon: 'sum-limits-both-template-image' },
      { label: 'sum-limits-lower', insert: '\\sum\\limits_{#?}', cls: 'template', directInsert: true, title: 'Summation With Lower Limit', icon: 'sum-limits-lower-template-image' },
      { label: 'sum-right-both', insert: '\\sum\\nolimits^{#?}_{#?}', cls: 'template', directInsert: true, title: 'Summation With Right Superscript and Subscript', icon: 'sum-right-both-template-image' },
      { label: 'sum-right-lower', insert: '\\sum\\nolimits_{#?}', cls: 'template', directInsert: true, title: 'Summation With Right Subscript', icon: 'sum-right-lower-template-image' },
      { label: 'prod-limits-both', insert: '\\prod\\limits^{#?}_{#?}', cls: 'template', directInsert: true, title: 'Product With Upper and Lower Limits', icon: 'prod-limits-both-template-image' },
      { label: 'prod-limits-lower', insert: '\\prod\\limits_{#?}', cls: 'template', directInsert: true, title: 'Product With Lower Limit', icon: 'prod-limits-lower-template-image' },
      { label: 'prod-right-both', insert: '\\prod\\nolimits^{#?}_{#?}', cls: 'template', directInsert: true, title: 'Product With Right Superscript and Subscript', icon: 'prod-right-both-template-image' },
      { label: 'prod-right-lower', insert: '\\prod\\nolimits_{#?}', cls: 'template', directInsert: true, title: 'Product With Right Subscript', icon: 'prod-right-lower-template-image' },
      { label: '□\n▯\n□', insert: '\\displaystyle{\\underset{\\htmlStyle{font-size:1.1em;display:inline-block;padding-top:0.34em;line-height:1.15}{#?}}{\\overset{\\htmlStyle{font-size:1.1em;display:inline-block;padding-bottom:0.34em;line-height:1.15}{#?}}{\\htmlStyle{font-size:1.45em;line-height:1.1}{#0}}}}', cls: 'template', directInsert: true, title: 'Operator With Upper and Lower Limits', icon: 'operator-limits-both-template-image' },
      { label: '▯\n□', insert: '\\displaystyle{\\underset{\\htmlStyle{font-size:1.1em;display:inline-block;padding-top:0.34em;line-height:1.15}{#?}}{\\htmlStyle{font-size:1.45em;line-height:1.1}{#0}}}', cls: 'template', directInsert: true, title: 'Operator With Lower Limit', icon: 'operator-lower-limit-template-image' },
      { label: '▯^□_□', insert: '\\displaystyle{\\htmlStyle{font-size:1.45em;line-height:1.1}{#0}^{\\htmlStyle{font-size:1.1em;display:inline-block;padding-bottom:0.26em;line-height:1.15}{#?}}_{\\htmlStyle{font-size:1.1em;display:inline-block;padding-top:0.26em;line-height:1.15}{#?}}}', cls: 'template', directInsert: true, title: 'Operator With Right Superscript and Subscript', icon: 'operator-right-sup-sub-template-image' },
      { label: '▯_□', insert: '\\displaystyle{\\htmlStyle{font-size:1.45em;line-height:1.1}{#0}_{\\htmlStyle{font-size:1.1em;display:inline-block;padding-top:0.26em;line-height:1.15}{#?}}}', cls: 'template', directInsert: true, title: 'Operator With Right Subscript', icon: 'operator-right-sub-template-image' },
      { label: '⋂', insert: '\\bigcap' },
      { label: '⋃', insert: '\\bigcup' },
      { label: '∏', insert: '\\prod' },
      { label: '∐', insert: '\\coprod' },
      { label: '⨅', insert: '\\sqcap' },
      { label: '⨆', insert: '\\sqcup' },
      { label: '∑', insert: '\\sum' },
    ],
  },
  {
    id: 'calc',
    label: <CalcTabIcon />,
    isTemplate: true,
    items: [
      { label: 'integral-both', insert: '\\int_{#?}^{#?}', cls: 'template', directInsert: true, title: 'Definite Integral', icon: 'integral-both-template-image' },
      { label: 'integral-lower', insert: '\\int_{#?}', cls: 'template', directInsert: true, title: 'Integral With Subscript', icon: 'integral-lower-template-image' },
      { label: '∫□d□', insert: '\\int_{#?}^{#?} #? \\, d#?', directInsert: true, title: 'Integral', icon: 'integral-box-differential-template-image' },
      { label: '', insert: '\\int_{#?} #? \\, d#?', cls: 'template', directInsert: true, title: 'Integral', icon: 'integral-template-image' },
      { type: 'sep', cols: 4 },
      {label: 'd', insert: 'd', cls: 'template', directInsert: true, title: 'Differential'},
      {label: '∂', insert: '∂', cls: 'template', directInsert: true, title: 'Partial Differential'},
      { label: 'first-derivative', insert: '\\frac{d#?}{d#?}', cls: 'template', directInsert: true, title: 'First Derivative', icon: 'first-derivative-template-image' },
      { label: 'partial-derivative', insert: '\\frac{\\partial#?}{\\partial#?}', cls: 'template', directInsert: true, title: 'Partial Derivative', icon: 'partial-derivative-template-image' },
      { label: 'limit-infinity', insert: '\\lim_{#?\\to\\infty}', cls: 'template', directInsert: true, title: 'Limit to Infinity', icon: 'limit-infinity-template-image' },
      { label: 'limit-generic', insert: '\\lim_{#?}', cls: 'template', directInsert: true, title: 'Limit', icon: 'limit-generic-template-image' },
      { type: 'sep', cols: 2 },
      { label: '∇×\n▯', insert: '\\nabla \\times #?', cls: 'template', directInsert: true, title: 'Curl' },
      { label: '∇·\n▯', insert: '\\nabla \\cdot #?', cls: 'template', directInsert: true, title: 'Divergence' },
      { label: '∇\n▯', insert: '\\nabla #?', cls: 'template', directInsert: true, title: 'Gradient' },
      { label: 'Δ\n▯', insert: '\\Delta #?', cls: 'template', directInsert: true, title: 'Delta Expression' },
      { type: 'sep', cols: 3 },
      { label: '∫', insert: '\\int' },
      { label: '∮', insert: '\\oint' },
      { label: '∬', insert: '\\iint' },
      { label: '∯', insert: '\\oiint' },
      { label: '∭', insert: '\\iiint' },
      { label: '∰', insert: '\\oiiint' },
      { type: 'sep', cols: 2 },
      { label: 'log(□)', insert: '\\log\\left(#0\\right)' },
      { label: 'log₍□₎(□)', insert: '\\log_{#?}\\left(#?\\right)', cls: 'template', directInsert: true, title: 'Logarithm With Base', icon: 'log-base-template-image' },
      { type: 'sep', cols: 4 },
      { label: 'sin(□)', insert: '\\sin\\left(#0\\right)' },
      { label: 'cos(□)', insert: '\\cos\\left(#0\\right)' },
      { label: 'tan(□)', insert: '\\tan\\left(#0\\right)' },
      { label: 'ln(□)', insert: '\\ln\\left(#0\\right)' },
      { label: 'sin⁻¹(□)', insert: '\\sin^{-1}\\left(#0\\right)' },
      { label: 'csc(□)', insert: '\\csc\\left(#0\\right)' },
      { label: 'cos⁻¹(□)', insert: '\\cos^{-1}\\left(#0\\right)' },
      { label: 'sec(□)', insert: '\\sec\\left(#0\\right)' },
      { label: 'tan⁻¹(□)', insert: '\\tan^{-1}\\left(#0\\right)' },
      { label: 'cot(□)', insert: '\\cot\\left(#0\\right)' },
    ],
  },
  {
    id: 'move-text',
    label: <MoveTextTabIcon />,
    isTemplate: true,
    items: [
      { label: 'Move Up', action: 'MOVE_TEXT_UP', cls: 'template', title: 'Move Up', icon: 'move-text-up-template-image' },
      { label: 'Move Right', action: 'MOVE_TEXT_RIGHT', cls: 'template', title: 'Move Right', icon: 'move-text-right-template-image' },
      { label: 'Move Left', action: 'MOVE_TEXT_LEFT', cls: 'template', title: 'Move Left', icon: 'move-text-left-template-image' },
      { label: 'Move Down', action: 'MOVE_TEXT_DOWN', cls: 'template', title: 'Move Down', icon: 'move-text-down-template-image' },
    ],
  },
];

const CHEM_GROUPS = [
  {
    label: 'H-Ne', isChem: true,
    items: ['H', 'He', 'Li', 'Be', 'B', 'C', 'N', 'O', 'F', 'Ne'].map(el => ({ label: el, insert: el, cls: 'chem-element' }))
  },
  {
    label: 'Na-Ca', isChem: true,
    items: ['Na', 'Mg', 'Al', 'Si', 'P', 'S', 'Cl', 'Ar', 'K', 'Ca'].map(el => ({ label: el, insert: el, cls: 'chem-element' }))
  },
  {
    label: 'Fe-Zn →⇌', isChem: true, items: [
      ...['Fe', 'Cu', 'Zn', 'Mn'].map(el => ({ label: el, insert: el, cls: 'chem-element' })),
      { type: 'sep', cols: 2 },
      ...['Cr', 'Ni', 'Co', 'Ag'].map(el => ({ label: el, insert: el, cls: 'chem-element' })),
      { type: 'sep', cols: 2 },
      ...['Au', 'Hg', 'Pb', 'Sn'].map(el => ({ label: el, insert: el, cls: 'chem-element' })),
      { type: 'sep', cols: 2 },
      ...['Br', 'I', 'Ba', 'Pt'].map(el => ({ label: el, insert: el, cls: 'chem-element' })),
      { type: 'sep', cols: 2 },
      { label: 'Xe', insert: 'Xe', cls: 'chem-element' },
      { type: 'sep', cols: 5 },
      { label: '→', insert: '->', cls: 'chem-arrow' }, { label: '⇌', insert: '<=>', cls: 'chem-arrow' },
      { label: '←', insert: '<-', cls: 'chem-arrow' }, { label: '⇄', insert: '<->', cls: 'chem-arrow' }, { label: '↑', insert: '^', cls: 'chem-arrow' },
      { type: 'sep', cols: 4 },
      { label: '↓', insert: 'v', cls: 'chem-arrow' }, { label: '+', insert: ' + ', cls: 'chem-arrow' },
      { label: '→(Δ)', insert: '->[\\Delta]', cls: 'chem-arrow' }, { label: '→(aq)', insert: '->[aq]', cls: 'chem-arrow' },
    ]
  },
  {
    label: '(s)(l) ⁺/⁻', isChem: true, items: [
      { label: '(s)', insert: '(s)', cls: 'chem-state' }, { label: '(l)', insert: '(l)', cls: 'chem-state' },
      { label: '(g)', insert: '(g)', cls: 'chem-state' }, { label: '(aq)', insert: '(aq)', cls: 'chem-state' },
      { type: 'sep', cols: 2 },
      { label: '(conc)', insert: '(conc)', cls: 'chem-state' },
      { label: '(dil)', insert: '(dil)', cls: 'chem-state' }, { label: '(ppt)', insert: '(ppt)', cls: 'chem-state' },
      { type: 'sep', cols: 2 },
      { label: '✚', insert: '^{+}', cls: 'chem-element' }, { label: '━', insert: '^{-}', cls: 'chem-element' },
      { label: '²⁺', insert: '^{2+}', cls: 'chem-element' }, { label: '²⁻', insert: '^{2-}', cls: 'chem-element' },
      { type: 'sep', cols: 2 },
      { label: '³⁺', insert: '^{3+}', cls: 'chem-element' }, { label: '³⁻', insert: '^{3-}', cls: 'chem-element' },
      { label: '2', insert: '2', cls: 'chem-element' }, { label: '3', insert: '3', cls: 'chem-element' },
      { type: 'sep', cols: 2 },
      { label: '4', insert: '4', cls: 'chem-element' }, { label: '5', insert: '5', cls: 'chem-element' },
      { label: '6', insert: '6', cls: 'chem-element' }, { label: '7', insert: '7', cls: 'chem-element' },
      { type: 'sep', cols: 3 },
      { label: '8', insert: '8', cls: 'chem-element' }, { label: 'x', insert: 'x', cls: 'chem-element' },
      { label: 'n', insert: 'n', cls: 'chem-element' },
    ]
  },
  {
    label: 'H₂O', isChem: true, items: [
      { label: 'H₂O', insert: 'H2O', cls: 'chem-element' }, { label: 'CO₂', insert: 'CO2', cls: 'chem-element' },
      { label: 'NH₃', insert: 'NH3', cls: 'chem-element' }, { label: 'H₂SO₄', insert: 'H2SO4', cls: 'chem-element' },
      { label: 'HCl', insert: 'HCl', cls: 'chem-element' }, { label: 'NaOH', insert: 'NaOH', cls: 'chem-element' },
      { label: 'NaCl', insert: 'NaCl', cls: 'chem-element' }, { label: 'CaCO₃', insert: 'CaCO3', cls: 'chem-element' },
      { label: 'HNO₃', insert: 'HNO3', cls: 'chem-element' }, { label: 'H₃PO₄', insert: 'H3PO4', cls: 'chem-element' },
      { label: 'CH₃COOH', insert: 'CH3COOH', cls: 'chem-element' }, { label: 'C₆H₁₂O₆', insert: 'C6H12O6', cls: 'chem-element' },
      { label: 'CH₄', insert: 'CH4', cls: 'chem-element' }, { label: 'C₂H₅OH', insert: 'C2H5OH', cls: 'chem-element' },
      { label: 'CO₃²⁻', insert: 'CO3^{2-}', cls: 'chem-element' }, { label: 'SO₄²⁻', insert: 'SO4^{2-}', cls: 'chem-element' },
      { label: 'NO₃⁻', insert: 'NO3^-', cls: 'chem-element' }, { label: 'PO₄³⁻', insert: 'PO4^{3-}', cls: 'chem-element' },
      { label: 'NH₄⁺', insert: 'NH4^+', cls: 'chem-element' }, { label: 'OH⁻', insert: 'OH^-', cls: 'chem-element' },
    ]
  },
];

function serializeChemValue(latex = '') {
  const match = String(latex).match(/^\\ce\{([\s\S]*)\}$/);
  if (match) return latex;
  const normalized = latex.replace(/\\text\{([^}]*)\}/g, '$1').replace(/\$/g, '').trim();
  return normalized ? `\\ce{${normalized}}` : '';
}

function TabIcon({ top, bottom = '', compact = false }) {

  return (
    <span className={`cme-tab-icon${compact ? ' compact' : ''}`} aria-hidden="true">
      <span className="cme-tab-icon-top">{top}</span>
      {bottom ? <span className="cme-tab-icon-bottom">{bottom}</span> : null}
    </span>
  );
}

function RootFractionTabIcon() {
  return (
    <span className="cme-tab-icon cme-tab-icon--svg" aria-hidden="true">
      <svg className="cme-tab-svg-icon" viewBox="0 0 48 24" focusable="false">
        <path
          d="M2 13 L5 13 L7 18 L10 4 L20 4"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <rect x="13" y="7" width="8" height="8" fill="none" stroke="currentColor" strokeWidth="1.2" />
        <rect x="31" y="3" width="6" height="6" fill="none" stroke="currentColor" strokeWidth="1.2" />
        <line x1="29" y1="12" x2="39" y2="12" stroke="currentColor" strokeWidth="1.2" />
        <rect x="31" y="15" width="6" height="6" fill="none" stroke="currentColor" strokeWidth="1.2" />
      </svg>
    </span>
  );
}

function MatrixTabIcon() {
  return (
    <span className="cme-tab-icon cme-tab-icon--svg" aria-hidden="true">
      <svg className="cme-tab-svg-icon" viewBox="0 0 210 110" focusable="false">
        <path d="M12 8 H4 V102 H12" fill="none" stroke="currentColor" strokeWidth="3" />
        <path d="M96 8 H104 V102 H96" fill="none" stroke="currentColor" strokeWidth="3" />
        <rect x="28" y="15" width="14" height="24" fill="none" stroke="#ffffff" strokeWidth="2.5" />
        <rect x="64" y="15" width="14" height="24" fill="none" stroke="#ffffff" strokeWidth="2.5" />
        <rect x="28" y="63" width="14" height="24" fill="none" stroke="#ffffff" strokeWidth="2.5" />
        <rect x="64" y="63" width="14" height="24" fill="none" stroke="#ffffff" strokeWidth="2.5" />
        <path
          d="M142 8 C132 8 132 18 132 28 C132 38 128 45 124 49 C128 53 132 60 132 70 C132 80 132 90 142 102"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
        />
        <rect x="154" y="15" width="14" height="24" fill="none" stroke="#ffffff" strokeWidth="2.5" />
        <rect x="154" y="63" width="14" height="24" fill="none" stroke="#ffffff" strokeWidth="2.5" />
      </svg>
    </span>
  );
}

function PowerFracTabIcon() {
  return (
    <span className="cme-tab-icon cme-tab-icon--svg" aria-hidden="true">
      <svg className="cme-tab-svg-icon" viewBox="0 0 70 50" focusable="false">
        <rect x="8" y="18" width="14" height="14" fill="none" stroke="#ffffff" strokeWidth="2.5" />
        <rect x="20" y="6" width="14" height="14" fill="none" stroke="#ffffff" strokeWidth="2.5" />
        <rect x="50" y="6" width="8" height="8" fill="none" stroke="#ffffff" strokeWidth="2.5" />
        <rect x="48" y="22" width="12" height="12" fill="none" stroke="#ffffff" strokeWidth="2.5" />
      </svg>
    </span>
  );
}

function BracketsTabIcon() {
  return (
    <span className="cme-tab-icon cme-tab-icon--svg" aria-hidden="true">
      <svg className="cme-tab-svg-icon" viewBox="0 0 120 90" focusable="false">
        <g
          fill="none"
          stroke="#ffffff"
          strokeWidth="4"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M22 15 C8 28 8 62 22 75" />
          <path d="M58 15 C72 28 72 62 58 75" />
          <rect x="30" y="22" width="20" height="36" />
          <rect x="82" y="22" width="20" height="36" />
          <path d="M80 12 Q92 2 104 12" />
        </g>
      </svg>
    </span>
  );
}

function CalcTabIcon() {
  return (
    <span className="cme-tab-icon cme-tab-icon--svg" aria-hidden="true">
      <svg className="cme-tab-svg-icon" viewBox="0 0 120 80" focusable="false">
        <g fill="none" stroke="#ffffff" strokeWidth="2.5">
          <path d="M18 68 C30 68 30 56 30 42 L30 24 C30 12 34 8 42 8" />
          <rect x="48" y="8" width="14" height="14" />
          <rect x="48" y="54" width="14" height="14" />
        </g>
        <text
          x="78"
          y="48"
          fontFamily="Times New Roman, serif"
          fontSize="28"
          fill="#ffffff"
        >
          lim
        </text>
      </svg>
    </span>
  );
}

function MoveTextTabIcon() {
  return (
    <span className="cme-tab-icon cme-tab-icon--svg" aria-hidden="true">
      <svg className="cme-tab-svg-icon" viewBox="0 0 24 24" focusable="false">
        <path
          d="M12 4V11"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
        <path
          d="M9.5 8.5L12 11L14.5 8.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M5 14 C5 18 8 20 12 20 C16 20 19 18 19 14"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
        <path
          d="M8 14 C8 16.5 9.5 18 12 18 C14.5 18 16 16.5 16 14"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.2"
          strokeLinecap="round"
        />
      </svg>
    </span>
  );
}

function ArrowTabIcon() {
  return (
    <span className="cme-tab-icon cme-tab-icon--svg" aria-hidden="true">
      <svg className="cme-tab-svg-icon" viewBox="0 0 64 24" focusable="false">
        <g fill="#ffffff">
          <path d="M4 10h20V5l12 7-12 7v-5H4z" />
          <circle cx="44" cy="18" r="2.5" />
          <circle cx="52" cy="12" r="2.5" />
          <circle cx="60" cy="6" r="2.5" />
        </g>
      </svg>
    </span>
  );
}

function ArrowTemplateIcon({ arrow, above = '', below = '' }) {
  return (
    <span className="cme-arrow-template-preview" aria-hidden="true">
      {above ? <span className="cme-arrow-template-text">{above}</span> : null}
      <span className="cme-arrow-template-arrow">{arrow}</span>
      {below ? <span className="cme-arrow-template-text">{below}</span> : null}
    </span>
  );
}

/* ══════════════════════════════════════════════════════════
   CKEditor inline widget plugin for MathLive rendering
   Uses createRawElement so CKEditor won't touch the DOM inside
══════════════════════════════════════════════════════════ */
class MathInlinePlugin extends Plugin {
  static get pluginName() {
    return 'MathInlinePlugin';
  }

  static get requires() {
    return [Widget];
  }

  init() {
    const editor = this.editor;

    // 1) Register model element — isObject: true treats it as one atomic block
    editor.model.schema.register('mathInline', {
      isInline: true,
      isObject: true,
      allowWhere: '$text',
      allowAttributes: ['latex', 'dir'],
    });

    // Allow mathInline in all text-containing elements
    editor.model.schema.addChildCheck((context, childDefinition) => {
      if (childDefinition.name === 'mathInline') {
        return true;
      }
    });

    // 2) Editing downcast — what the user SEES in the editor
    //    createRawElement lets us manage the DOM ourselves (MathLive web component)
    editor.conversion.for('editingDowncast').elementToElement({
      model: 'mathInline',
      view: (modelElement, { writer }) => {
        const latex = modelElement.getAttribute('latex') || '';
        const dir = modelElement.getAttribute('dir') === 'rtl' ? 'rtl' : 'ltr';
        const widgetId = 'math-' + Math.random().toString(36).substr(2, 9);

        // Save mapping to bypass domConverter later
        window.__ckMathWidgets.set(widgetId, modelElement);

        const container = writer.createContainerElement('span', {
          class: 'ck-math-widget ck-math-inline-word',
          contenteditable: 'false',
          'data-math-id': widgetId,
          'data-latex': latex,
          'data-dir': dir,
          dir,
        });

        const rawElement = writer.createRawElement(
          'span',
          {
            class: 'ck-math-widget-inner',
            style: 'display:inline-block;vertical-align:middle;margin:0 2px;cursor:pointer;width:auto;max-width:100%;pointer-events:none;',
          },
          (domElement) => {
            const mf = document.createElement('math-field');
            mf.setAttribute('read-only', '');
            mf.setAttribute('math-virtual-keyboard-policy', 'manual');
            mf.setAttribute('tabindex', '-1');
            mf.setAttribute('letter-shape-style', 'upright');
            mf.setAttribute('dir', dir);
            mf.style.display = 'inline-block';
            mf.style.width = 'auto';
            mf.style.maxWidth = '100%';
            mf.style.verticalAlign = 'middle';
            mf.style.border = 'none';
            mf.style.background = 'transparent';
            mf.style.outline = 'none';
            mf.style.fontSize = 'inherit';
            mf.style.minHeight = 'auto';
            mf.style.padding = '0 2px';
            mf.style.margin = '0';
            mf.style.pointerEvents = 'none';
            mf.style.direction = dir;
            mf.style.textAlign = dir === 'rtl' ? 'right' : 'left';
            mf.style.unicodeBidi = dir === 'rtl' ? 'plaintext' : 'normal';
            mf.style.color = '#ffffff';

            const setLatex = () => {
              if (mf.setValue) mf.setValue(latex, { silenceNotifications: true });
              else mf.value = latex;
            };

            if (customElements.get('math-field')) {
              requestAnimationFrame(setLatex);
            } else {
              customElements.whenDefined('math-field').then(() => requestAnimationFrame(setLatex));
            }

            domElement.appendChild(mf);

            const bindContainer = () => {
              const container = domElement.parentElement;
              if (!container) return;
              bindWidgetClickTarget(editor, container);
            };

            bindContainer();
            requestAnimationFrame(bindContainer);
          }
        );

        writer.insert(writer.createPositionAt(container, 0), rawElement);

        return toWidget(container, writer, { label: 'math formula' });
      },
    });

    const viewDocument = editor.editing.view.document;
    this.listenTo(viewDocument, 'mousedown', (evt, data) => {
      const widgetEl = findMathWidgetFromEventTarget(data.domTarget);
      if (!widgetEl) return;
      if (data.domEvent.button !== 0) return;

      evt.stop();
      data.preventDefault();
      triggerWidgetEdit(
        editor,
        null,
        getLatexFromWidgetDom(widgetEl),
        widgetEl
      );
    }, { priority: 'high' });

    // 3) Data downcast — what getData() returns (HTML output)
    editor.conversion.for('dataDowncast').elementToElement({
      model: 'mathInline',
      view: (modelElement, { writer }) => {
        const latex = modelElement.getAttribute('latex') || '';
        const dir = modelElement.getAttribute('dir') === 'rtl' ? 'rtl' : 'ltr';
        const span = writer.createContainerElement('span', {
          class: 'math-tex',
          'data-latex': latex,
          'data-dir': dir,
          dir,
          style: 'display:inline;',
        });
        writer.insert(writer.createPositionAt(span, 0), writer.createText(latex));
        return span;
      },
    });

    // 4) Upcast — recognize HTML from getData() and convert back to model
    editor.conversion.for('upcast').elementToElement({
      view: {
        name: 'span',
        classes: 'math-tex',
      },
      model: (viewElement, { writer }) => {
        const latex = viewElement.getAttribute('data-latex') || '';
        const dir =
          viewElement.getAttribute('data-dir') === 'rtl' ||
          viewElement.getAttribute('dir') === 'rtl'
            ? 'rtl'
            : 'ltr';
        return writer.createElement('mathInline', { latex, dir });
      },
    });
  }
}

/* ══════════════════════════════════════════════════════════
   Toolbar buttons plugin — Math + Chem
══════════════════════════════════════════════════════════ */
/* SVG icons for toolbar — matches the MathType / ChemType icons */
const MATH_ICON_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="20" height="20"><path d="M4 12h3l3 6l5-12h5" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';

const CHEM_ICON_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="20" height="20"><rect x="3" y="3" width="18" height="18" rx="3" fill="none" stroke="currentColor" stroke-width="2"/><text x="12" y="16" text-anchor="middle" font-size="12" font-weight="bold" fill="currentColor" font-family="system-ui, sans-serif">C</text><text x="6" y="8" font-size="4" font-weight="bold" fill="currentColor" font-family="system-ui, sans-serif">6</text></svg>';

const COLOR_SWATCHES = [
  { label: 'Black', value: '#000000' },
  { label: 'Dim Gray', value: '#696969' },
  { label: 'Gray', value: '#808080' },
  { label: 'Dark Gray', value: '#a9a9a9' },
  { label: 'Silver', value: '#c0c0c0' },
  { label: 'White', value: '#ffffff' },
  { label: 'Red', value: '#ff0000' },
  { label: 'Orange', value: '#ffa500' },
  { label: 'Yellow', value: '#ffff00' },
  { label: 'Lime', value: '#00ff00' },
  { label: 'Cyan', value: '#00ffff' },
  { label: 'Blue', value: '#0000ff' },
  { label: 'Purple', value: '#800080' },
  { label: 'Magenta', value: '#ff00ff' },
  { label: 'Pink', value: '#ffc0cb' },
  { label: 'Brown', value: '#a52a2a' },
  { label: 'Maroon', value: '#800000' },
  { label: 'Olive', value: '#808000' },
  { label: 'Green', value: '#008000' },
  { label: 'Teal', value: '#008080' },
  { label: 'Navy', value: '#000080' },
  { label: 'Indigo', value: '#4b0082' },
  { label: 'Violet', value: '#ee82ee' },
  { label: 'Gold', value: '#ffd700' },
];

function normalizeCssColor(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (raw === 'none') return 'none';
  if (typeof document === 'undefined') return raw.toLowerCase();

  const probe = document.createElement('span');
  probe.style.color = '';
  probe.style.color = raw;
  if (!probe.style.color) return '';

  probe.style.position = 'absolute';
  probe.style.opacity = '0';
  probe.style.pointerEvents = 'none';
  document.body.appendChild(probe);
  const resolved = window.getComputedStyle(probe).color;
  probe.remove();

  const rgbMatch = resolved.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
  if (!rgbMatch) return resolved.toLowerCase();

  return `#${[rgbMatch[1], rgbMatch[2], rgbMatch[3]]
    .map((part) => Number(part).toString(16).padStart(2, '0'))
    .join('')}`;
}

function makeToolbarIconImage(svg) {
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function makeArrowLabelToolbarIcon(content) {
  return makeToolbarIconImage(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
      <g fill="none" stroke="#1f252b" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        ${content}
      </g>
    </svg>
  `);
}

const TOOLBAR_ICON_IMAGES = {
  'fraction-template-image': makeToolbarIconImage(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 18 18">
      <rect x="5.1" y="1.8" width="7.8" height="4.8" rx="0.6" fill="none" stroke="#2c8a43" stroke-width="1.5"/>
      <line x1="3.2" y1="9" x2="14.8" y2="9" stroke="#2c8a43" stroke-width="1.6" stroke-linecap="square"/>
      <rect x="5.1" y="11.4" width="7.8" height="4.8" rx="0.6" fill="none" stroke="#2c8a43" stroke-width="1.5"/>
    </svg>
  `),
  'superscript-template-image': makeToolbarIconImage(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 18 18">
      <rect x="3.1" y="7.3" width="6.5" height="7.4" rx="0.6" fill="none" stroke="#2c8a43" stroke-width="1.5"/>
      <rect x="10.3" y="3.2" width="4.6" height="5.6" rx="0.6" fill="none" stroke="#2c8a43" stroke-width="1.5"/>
    </svg>
  `),
  'sqrt-template-image': makeToolbarIconImage(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 18 18">
      <path d="M1.9 10.3H3.9L5.6 14.1L8.1 4.3H15.4" fill="none" stroke="#2c8a43" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
      <rect x="9.7" y="5.1" width="4.4" height="6.6" rx="0.55" fill="none" stroke="#2c8a43" stroke-width="1.4"/>
    </svg>
  `),
  'subscript-template-image': makeToolbarIconImage(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 18 18">
      <rect x="3.1" y="3.2" width="6.5" height="7.4" rx="0.6" fill="none" stroke="#2c8a43" stroke-width="1.5"/>
      <rect x="10.3" y="9.2" width="4.6" height="5.6" rx="0.6" fill="none" stroke="#2c8a43" stroke-width="1.5"/>
    </svg>
  `),
  'nth-root-template-image': makeToolbarIconImage(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 18 18">
      <rect x="1.8" y="2.1" width="2.7" height="3.3" rx="0.35" fill="none" stroke="#2c8a43" stroke-width="1.15"/>
      <path d="M2 10.3H4L5.7 14.1L8.2 4.3H15.5" fill="none" stroke="#2c8a43" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
      <rect x="9.8" y="5.1" width="4.3" height="6.6" rx="0.55" fill="none" stroke="#2c8a43" stroke-width="1.4"/>
    </svg>
  `),
  'slash-fraction-template-image': makeToolbarIconImage(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 32" fill="none">
      <rect x="2" y="4" width="10" height="18" stroke="#008000" stroke-width="1.5"/>
      <line x1="22" y1="2" x2="14" y2="26" stroke="#000" stroke-width="2" stroke-linecap="round"/>
      <rect x="32" y="10" width="10" height="18" stroke="#008000" stroke-width="1.5"/>
    </svg>
  `),
  'right-sup-sub-template-image': makeToolbarIconImage(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" fill="none">
      <rect x="8" y="10" width="10" height="14" stroke="#008000" stroke-width="1.5"/>
      <rect x="20" y="2" width="8" height="10" stroke="#008000" stroke-width="1.5" opacity="0.5"/>
      <rect x="20" y="20" width="8" height="10" stroke="#008000" stroke-width="1.5" opacity="0.5"/>
    </svg>
  `),
  'left-sup-template-image': makeToolbarIconImage(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" fill="none">
      <rect x="4" y="2" width="8" height="10" stroke="#008000" stroke-width="1.5" opacity="0.5"/>
      <rect x="16" y="10" width="10" height="14" stroke="#008000" stroke-width="1.5"/>
    </svg>
  `),
  'left-sub-template-image': makeToolbarIconImage(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" fill="none">
      <rect x="16" y="6" width="10" height="14" stroke="#008000" stroke-width="1.5"/>
      <rect x="4" y="18" width="8" height="10" stroke="#008000" stroke-width="1.5" opacity="0.5"/>
    </svg>
  `),
  'left-sup-sub-template-image': makeToolbarIconImage(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 36" fill="none">
      <rect x="4" y="2" width="8" height="10" stroke="#008000" stroke-width="1.5" opacity="0.5"/>
      <rect x="4" y="22" width="8" height="10" stroke="#008000" stroke-width="1.5" opacity="0.5"/>
      <rect x="16" y="10" width="10" height="14" stroke="#008000" stroke-width="1.5"/>
    </svg>
  `),
  'overset-template-image': makeToolbarIconImage(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 40" fill="none">
      <rect x="10" y="2" width="10" height="10" stroke="#008000" stroke-width="1.5" opacity="0.5"/>
      <rect x="8" y="18" width="14" height="14" stroke="#008000" stroke-width="1.5"/>
    </svg>
  `),
  'underset-template-image': makeToolbarIconImage(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 40" fill="none">
      <rect x="8" y="6" width="14" height="14" stroke="#008000" stroke-width="1.5"/>
      <rect x="10" y="28" width="10" height="10" stroke="#008000" stroke-width="1.5" opacity="0.5"/>
    </svg>
  `),
  'over-under-template-image': makeToolbarIconImage(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 52" fill="none">
      <rect x="10" y="2" width="10" height="10" stroke="#008000" stroke-width="1.5" opacity="0.5"/>
      <rect x="8" y="18" width="14" height="14" stroke="#008000" stroke-width="1.5"/>
      <rect x="10" y="40" width="10" height="10" stroke="#008000" stroke-width="1.5" opacity="0.5"/>
    </svg>
  `),
  'underbrace-template-image': makeToolbarIconImage(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 64" fill="none">
      <rect x="10" y="2" width="12" height="18" stroke="#008000" stroke-width="1.5"/>
      <path d="M4 30 C8 38,14 38,16 34 C18 38,24 38,28 30" stroke="#000" stroke-width="2" fill="none"/>
      <rect x="10" y="44" width="12" height="18" stroke="#008000" stroke-width="1.5" opacity="0.6"/>
    </svg>
  `),
  'overbrace-template-image': makeToolbarIconImage(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 64" fill="none">
      <rect x="10" y="2" width="12" height="18" stroke="#008000" stroke-width="1.5" opacity="0.6"/>
      <path d="M4 34 C8 26,14 26,16 30 C18 26,24 26,28 34" stroke="#000" stroke-width="2" fill="none"/>
      <rect x="10" y="44" width="12" height="18" stroke="#008000" stroke-width="1.5"/>
    </svg>
  `),
  'overbrace-arc-template-image': makeToolbarIconImage(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40" fill="none">
      <path d="M8 10 C8 6,12 6,16 6 C20 6,20 2,20 2 C20 2,20 6,24 6 C28 6,32 6,32 10" stroke="#666" stroke-width="2"/>
      <rect x="15" y="16" width="10" height="16" stroke="#1b8f3a" stroke-width="2"/>
    </svg>
  `),
  'overparen-template-image': makeToolbarIconImage(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40" fill="none">
      <path d="M8 10 Q20 2 32 10" stroke="#666" stroke-width="2"/>
      <rect x="15" y="16" width="10" height="16" stroke="#1b8f3a" stroke-width="2"/>
    </svg>
  `),
  'underbrace-arc-template-image': makeToolbarIconImage(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40" fill="none">
      <rect x="15" y="6" width="10" height="16" stroke="#1b8f3a" stroke-width="2"/>
      <path d="M8 30 C8 34,12 34,16 34 C20 34,20 38,20 38 C20 38,20 34,24 34 C28 34,32 34,32 30" stroke="#666" stroke-width="2"/>
    </svg>
  `),
  'underparen-template-image': makeToolbarIconImage(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40" fill="none">
      <rect x="15" y="6" width="10" height="16" stroke="#1b8f3a" stroke-width="2"/>
      <path d="M8 30 Q20 38 32 30" stroke="#666" stroke-width="2"/>
    </svg>
  `),
  'vec-accent-template-image': makeToolbarIconImage(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40" fill="none">
      <path d="M10 10 H26" stroke="#666" stroke-width="2"/>
      <path d="M22 6 L30 10 L22 14" stroke="#666" stroke-width="2" fill="none"/>
      <rect x="15" y="18" width="10" height="16" stroke="#1b8f3a" stroke-width="2"/>
    </svg>
  `),
  'overrightarrow-accent-template-image': makeToolbarIconImage(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40" fill="none">
      <path d="M8 10 H30" stroke="#666" stroke-width="2"/>
      <path d="M26 6 L34 10 L26 14" stroke="#666" stroke-width="2" fill="none"/>
      <rect x="15" y="18" width="10" height="16" stroke="#1b8f3a" stroke-width="2"/>
    </svg>
  `),
  'overleftrightarrow-accent-template-image': makeToolbarIconImage(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40" fill="none">
      <path d="M8 10 H32" stroke="#666" stroke-width="2"/>
      <path d="M12 6 L4 10 L12 14" stroke="#666" stroke-width="2" fill="none"/>
      <path d="M28 6 L36 10 L28 14" stroke="#666" stroke-width="2" fill="none"/>
      <rect x="15" y="18" width="10" height="16" stroke="#1b8f3a" stroke-width="2"/>
    </svg>
  `),
  'overline-accent-template-image': makeToolbarIconImage(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40" fill="none">
      <line x1="10" y1="10" x2="30" y2="10" stroke="#666" stroke-width="2"/>
      <rect x="15" y="18" width="10" height="16" stroke="#1b8f3a" stroke-width="2"/>
    </svg>
  `),
  'hat-accent-template-image': makeToolbarIconImage(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40" fill="none">
      <path d="M12 12 L20 6 L28 12" stroke="#666" stroke-width="2" fill="none"/>
      <rect x="15" y="18" width="10" height="16" stroke="#1b8f3a" stroke-width="2"/>
    </svg>
  `),
  'tilde-accent-template-image': makeToolbarIconImage(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40" fill="none">
      <path d="M10 11 C14 6,18 16,22 11 C26 6,30 16,34 11" stroke="#666" stroke-width="2" fill="none"/>
      <rect x="15" y="18" width="10" height="16" stroke="#1b8f3a" stroke-width="2"/>
    </svg>
  `),
  'ddot-accent-template-image': makeToolbarIconImage(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40" fill="none">
      <circle cx="16" cy="10" r="2" fill="#666"/>
      <circle cx="24" cy="10" r="2" fill="#666"/>
      <rect x="15" y="18" width="10" height="16" stroke="#1b8f3a" stroke-width="2"/>
    </svg>
  `),
  'dot-accent-template-image': makeToolbarIconImage(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40" fill="none">
      <circle cx="20" cy="10" r="2" fill="#666"/>
      <rect x="15" y="18" width="10" height="16" stroke="#1b8f3a" stroke-width="2"/>
    </svg>
  `),
  'overline-frame-template-image': makeToolbarIconImage(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 40" fill="none">
      <line x1="8" y1="8" x2="40" y2="8" stroke="#666" stroke-width="2"/>
      <rect x="18" y="14" width="12" height="16" stroke="#1b8f3a" stroke-width="2"/>
    </svg>
  `),
  'left-bar-template-image': makeToolbarIconImage(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 40" fill="none">
      <line x1="12" y1="6" x2="12" y2="34" stroke="#666" stroke-width="2"/>
      <rect x="18" y="12" width="12" height="16" stroke="#1b8f3a" stroke-width="2"/>
    </svg>
  `),
  'boxed-square-template-image': makeToolbarIconImage(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 40" fill="none">
      <rect x="10" y="6" width="28" height="28" stroke="#666" stroke-width="2"/>
      <rect x="18" y="12" width="12" height="16" stroke="#1b8f3a" stroke-width="2"/>
    </svg>
  `),
  'underline-frame-template-image': makeToolbarIconImage(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 40" fill="none">
      <rect x="18" y="8" width="12" height="16" stroke="#1b8f3a" stroke-width="2"/>
      <line x1="8" y1="30" x2="40" y2="30" stroke="#666" stroke-width="2"/>
    </svg>
  `),
  'right-bar-template-image': makeToolbarIconImage(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 40" fill="none">
      <rect x="18" y="12" width="12" height="16" stroke="#1b8f3a" stroke-width="2"/>
      <line x1="36" y1="6" x2="36" y2="34" stroke="#666" stroke-width="2"/>
    </svg>
  `),
  'paren-frame-template-image': makeToolbarIconImage(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 40" fill="none">
      <ellipse cx="24" cy="20" rx="16" ry="14" stroke="#666" stroke-width="2"/>
      <rect x="18" y="12" width="12" height="16" stroke="#1b8f3a" stroke-width="2"/>
    </svg>
  `),
  'overline-right-bar-template-image': makeToolbarIconImage(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 40" fill="none">
      <line x1="10" y1="8" x2="36" y2="8" stroke="#666" stroke-width="2"/>
      <line x1="36" y1="8" x2="36" y2="32" stroke="#666" stroke-width="2"/>
      <rect x="18" y="12" width="12" height="16" stroke="#1b8f3a" stroke-width="2"/>
    </svg>
  `),
  'boxed-rounded-template-image': makeToolbarIconImage(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 40" fill="none">
      <rect x="10" y="6" width="28" height="28" rx="6" ry="6" stroke="#666" stroke-width="2"/>
      <rect x="18" y="12" width="12" height="16" stroke="#1b8f3a" stroke-width="2"/>
    </svg>
  `),
  'cancel-diagonal-template-image': makeToolbarIconImage(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 60 40" fill="none">
      <line x1="10" y1="30" x2="50" y2="10" stroke="#666" stroke-width="2"/>
      <rect x="22" y="12" width="16" height="16" stroke="#1b8f3a" stroke-width="2"/>
    </svg>
  `),
  'sout-template-image': makeToolbarIconImage(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 60 40" fill="none">
      <line x1="8" y1="20" x2="52" y2="20" stroke="#666" stroke-width="2"/>
      <rect x="22" y="12" width="16" height="16" stroke="#1b8f3a" stroke-width="2"/>
    </svg>
  `),
  'bcancel-template-image': makeToolbarIconImage(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 60 40" fill="none">
      <line x1="10" y1="10" x2="50" y2="30" stroke="#666" stroke-width="2"/>
      <rect x="22" y="12" width="16" height="16" stroke="#1b8f3a" stroke-width="2"/>
    </svg>
  `),
  'xcancel-template-image': makeToolbarIconImage(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 60 40" fill="none">
      <line x1="10" y1="10" x2="50" y2="30" stroke="#666" stroke-width="2"/>
      <line x1="10" y1="30" x2="50" y2="10" stroke="#666" stroke-width="2"/>
      <rect x="22" y="12" width="16" height="16" stroke="#1b8f3a" stroke-width="2"/>
    </svg>
  `),
  'vertical-strike-template-image': makeToolbarIconImage(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 60 40" fill="none">
      <line x1="30" y1="6" x2="30" y2="34" stroke="#666" stroke-width="2"/>
      <rect x="22" y="12" width="16" height="16" stroke="#1b8f3a" stroke-width="2"/>
    </svg>
  `),
  'overline-left-curve-template-image': makeToolbarIconImage(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 60 40" fill="none">
      <path d="M16 8 Q8 14 8 20 Q8 26 16 32" stroke="#666" stroke-width="2" fill="none"/>
      <line x1="16" y1="8" x2="52" y2="8" stroke="#666" stroke-width="2"/>
      <rect x="24" y="12" width="16" height="16" stroke="#1b8f3a" stroke-width="2"/>
    </svg>
  `),
  'crosshair-strike-template-image': makeToolbarIconImage(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 60 40" fill="none">
      <line x1="8" y1="20" x2="52" y2="20" stroke="#666" stroke-width="2"/>
      <line x1="30" y1="6" x2="30" y2="34" stroke="#666" stroke-width="2"/>
      <rect x="22" y="12" width="16" height="16" stroke="#1b8f3a" stroke-width="2"/>
    </svg>
  `),
  'operator-limits-both-template-image': makeToolbarIconImage(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 60 90" fill="none">
      <rect x="24" y="2" width="12" height="20" stroke="#5f9f5f" stroke-width="2"/>
      <rect x="10" y="30" width="40" height="40" stroke="#000" stroke-width="3"/>
      <rect x="24" y="78" width="12" height="20" stroke="#5f9f5f" stroke-width="2"/>
    </svg>
  `),
  'operator-lower-limit-template-image': makeToolbarIconImage(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 60 90" fill="none">
      <rect x="10" y="30" width="40" height="40" stroke="#000" stroke-width="3"/>
      <rect x="24" y="78" width="12" height="20" stroke="#5f9f5f" stroke-width="2"/>
    </svg>
  `),
  'operator-right-sup-sub-template-image': makeToolbarIconImage(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 90" fill="none">
      <rect x="10" y="30" width="40" height="40" stroke="#000" stroke-width="3"/>
      <rect x="55" y="8" width="12" height="20" stroke="#5f9f5f" stroke-width="2"/>
      <rect x="55" y="62" width="12" height="20" stroke="#5f9f5f" stroke-width="2"/>
    </svg>
  `),
  'operator-right-sub-template-image': makeToolbarIconImage(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 90" fill="none">
      <rect x="10" y="30" width="40" height="40" stroke="#000" stroke-width="3"/>
      <rect x="55" y="62" width="12" height="20" stroke="#5f9f5f" stroke-width="2"/>
    </svg>
  `),
  'hphantom-space-template-image': makeToolbarIconImage(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 52 32" fill="none">
      <rect x="4" y="4" width="12" height="20" stroke="#008000" stroke-width="2"/>
      <rect x="36" y="4" width="12" height="20" stroke="#008000" stroke-width="2"/>
    </svg>
  `),
  'thin-space-template-image': makeToolbarIconImage(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 32" fill="none">
      <rect x="4" y="4" width="12" height="20" stroke="#008000" stroke-width="2"/>
      <rect x="24" y="4" width="12" height="20" stroke="#008000" stroke-width="2"/>
    </svg>
  `),
  'negative-thin-space-template-image': makeToolbarIconImage(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" fill="none">
      <rect x="4" y="4" width="12" height="20" stroke="#008000" stroke-width="2"/>
      <rect x="12" y="4" width="12" height="20" stroke="#008000" stroke-width="2"/>
    </svg>
  `),
  'move-text-up-template-image': makeToolbarIconImage(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
      <rect x="5" y="2" width="14" height="20" fill="none" stroke="#2e7d32" stroke-width="2"/>
      <rect x="5" y="14" width="14" height="8" fill="#ffffff"/>
      <rect x="5" y="14" width="14" height="8" fill="none" stroke="#2e7d32" stroke-width="2" stroke-dasharray="2 2"/>
      <path d="M12 17V8" stroke="#546e7a" stroke-width="2" stroke-linecap="round"/>
      <path d="M9 11L12 8L15 11" fill="none" stroke="#546e7a" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  `),
  'move-text-right-template-image': makeToolbarIconImage(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
      <rect x="2" y="5" width="20" height="14" fill="none" stroke="#2e7d32" stroke-width="2"/>
      <rect x="2" y="5" width="8" height="14" fill="none" stroke="#2e7d32" stroke-width="2" stroke-dasharray="2 2"/>
      <path d="M7 12H16" stroke="#546e7a" stroke-width="2" stroke-linecap="round"/>
      <path d="M13 9L16 12L13 15" fill="none" stroke="#546e7a" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  `),
  'move-text-left-template-image': makeToolbarIconImage(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
      <rect x="2" y="5" width="20" height="14" fill="none" stroke="#2e7d32" stroke-width="2"/>
      <rect x="14" y="5" width="8" height="14" fill="none" stroke="#2e7d32" stroke-width="2" stroke-dasharray="2 2"/>
      <path d="M17 12H8" stroke="#546e7a" stroke-width="2" stroke-linecap="round"/>
      <path d="M11 9L8 12L11 15" fill="none" stroke="#546e7a" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  `),
  'move-text-down-template-image': makeToolbarIconImage(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
      <rect x="5" y="2" width="14" height="20" fill="none" stroke="#2e7d32" stroke-width="2"/>
      <rect x="5" y="2" width="14" height="8" fill="none" stroke="#2e7d32" stroke-width="2" stroke-dasharray="2 2"/>
      <path d="M12 7V16" stroke="#546e7a" stroke-width="2" stroke-linecap="round"/>
      <path d="M9 13L12 16L15 13" fill="none" stroke="#546e7a" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  `),
  'sum-limits-both-template-image': makeToolbarIconImage(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 60 90" fill="none">
      <rect x="24" y="2" width="12" height="20" stroke="#6aa56a" stroke-width="2"/>
      <text x="30" y="58" font-size="64" text-anchor="middle" fill="#000">∑</text>
      <rect x="24" y="72" width="12" height="20" stroke="#6aa56a" stroke-width="2"/>
    </svg>
  `),
  'sum-right-both-template-image': makeToolbarIconImage(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 72" fill="none">
      <text x="20" y="52" font-size="54" fill="#000">∑</text>
      <rect x="50" y="6" width="10" height="18" stroke="#6aa56a" stroke-width="2"/>
      <rect x="50" y="46" width="10" height="18" stroke="#6aa56a" stroke-width="2"/>
    </svg>
  `),
  'sum-limits-lower-template-image': makeToolbarIconImage(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 60 90" fill="none">
      <text x="30" y="58" font-size="64" text-anchor="middle" fill="#000">∑</text>
      <rect x="24" y="72" width="12" height="20" stroke="#6aa56a" stroke-width="2"/>
    </svg>
  `),
  'sum-right-lower-template-image': makeToolbarIconImage(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 72 90" fill="none">
      <text x="26" y="58" font-size="64" text-anchor="middle" fill="#000">∑</text>
      <rect x="50" y="58" width="12" height="20" stroke="#6aa56a" stroke-width="2"/>
    </svg>
  `),
  'prod-limits-both-template-image': makeToolbarIconImage(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 96" fill="none">
      <rect x="27" y="2" width="10" height="18" stroke="#6aa56a" stroke-width="2"/>
      <text x="12" y="62" font-size="58" font-family="Times New Roman" fill="#000">∏</text>
      <rect x="27" y="74" width="10" height="18" stroke="#6aa56a" stroke-width="2"/>
    </svg>
  `),
  'prod-limits-lower-template-image': makeToolbarIconImage(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 96" fill="none">
      <text x="12" y="62" font-size="58" font-family="Times New Roman" fill="#000">∏</text>
      <rect x="27" y="74" width="10" height="18" stroke="#6aa56a" stroke-width="2"/>
    </svg>
  `),
  'prod-right-lower-template-image': makeToolbarIconImage(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 72 72" fill="none">
      <text x="12" y="54" font-size="58" font-family="Times New Roman" fill="#000">∏</text>
      <rect x="52" y="44" width="10" height="18" stroke="#6aa56a" stroke-width="2"/>
    </svg>
  `),
  'prod-right-both-template-image': makeToolbarIconImage(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 72 72" fill="none">
      <text x="10" y="54" font-size="58" fill="#000">∏</text>
      <rect x="52" y="6" width="10" height="18" stroke="#6aa56a" stroke-width="2"/>
      <rect x="52" y="44" width="10" height="18" stroke="#6aa56a" stroke-width="2"/>
    </svg>
  `),
  'overline-template-image': makeToolbarIconImage(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 18 18">
      <line x1="4" y1="3.4" x2="14" y2="3.4" stroke="#2c8a43" stroke-width="1.6" stroke-linecap="round"/>
      <rect x="4.6" y="5.6" width="8.8" height="9.4" rx="1.1" fill="none" stroke="#56646d" stroke-width="1.2"/>
    </svg>
  `),
  'underline-template-image': makeToolbarIconImage(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 18 18">
      <rect x="4.6" y="3" width="8.8" height="9.4" rx="1.1" fill="none" stroke="#56646d" stroke-width="1.2"/>
      <line x1="4" y1="14.6" x2="14" y2="14.6" stroke="#2c8a43" stroke-width="1.6" stroke-linecap="round"/>
    </svg>
  `),
  'limit-template-image': makeToolbarIconImage(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 18 18">
      <text x="9" y="8.1" text-anchor="middle" fill="#2f3b43" font-size="6.4" font-weight="500" font-family="Cambria Math, Times New Roman, serif">lim</text>
      <rect x="6.7" y="10.1" width="4.6" height="5.2" rx="0.55" fill="none" stroke="#2c8a43" stroke-width="1.2"/>
    </svg>
  `),
  'integral-template-image': makeToolbarIconImage(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 28">
      <path d="M10 2C6 2 6 6 6 14C6 22 6 26 2 26" fill="none" stroke="#37474f" stroke-width="1.5" stroke-linecap="round"/>
      <rect x="2" y="20" width="5" height="5" fill="none" stroke="#4a5559" stroke-width="1"/>
      <rect x="16" y="8" width="6" height="6" fill="none" stroke="#4a5559" stroke-width="1"/>
      <text x="25" y="14" font-size="8" font-family="serif" fill="#37474f">d</text>
      <rect x="31" y="8" width="6" height="6" fill="none" stroke="#4a5559" stroke-width="1"/>
    </svg>
  `),
  'definite-integral-template-image': makeToolbarIconImage(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 18 18">
      <text x="0.95" y="14.05" font-size="14.2" font-family="Cambria Math, STIX Two Math, Times New Roman, serif" font-weight="700" fill="#37474f">∫</text>
      <rect x="5.1" y="1.2" width="2.55" height="2.55" rx="0.42" fill="none" stroke="#4a5559" stroke-width="1.15"/>
      <rect x="2.1" y="13.15" width="2.55" height="2.55" rx="0.42" fill="none" stroke="#4a5559" stroke-width="1.15"/>
      <rect x="8.45" y="6.15" width="3.8" height="3.8" rx="0.58" fill="none" stroke="#4a5559" stroke-width="1.2"/>
    </svg>
  `),
  'integral-with-differential-template-image': makeToolbarIconImage(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 18 18">
      <text x="0.95" y="13.85" font-size="14.6" font-family="Cambria Math, STIX Two Math, Times New Roman, serif" font-weight="700" fill="#37474f">∫</text>
      <rect x="6.55" y="6.15" width="3.05" height="3.05" rx="0.48" fill="none" stroke="#4a5559" stroke-width="1.15"/>
      <text x="10.55" y="8.95" font-size="4.95" font-family="Arial, Helvetica, sans-serif" font-weight="700" fill="#37474f">d</text>
      <rect x="13.15" y="6.15" width="3.05" height="3.05" rx="0.48" fill="none" stroke="#4a5559" stroke-width="1.15"/>
    </svg>
  `),
  'integral-box-differential-template-image': makeToolbarIconImage(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 18 18">
      <path d="M5.8 1.8C3.7 1.8 3.7 5 3.7 9C3.7 13 3.7 16.2 1.6 16.2" fill="none" stroke="#37474f" stroke-width="1.15"/>
      <rect x="2.3" y="13.4" width="2.3" height="2.3" rx="0.35" fill="none" stroke="#4a5559" stroke-width="0.9"/>
      <rect x="7.2" y="6.2" width="2.8" height="4.6" rx="0.4" fill="none" stroke="#4a5559" stroke-width="0.9"/>
      <text x="10.8" y="10.4" font-size="4.7" fill="#37474f" font-family="Arial, Helvetica, sans-serif" font-weight="700">d</text>
      <rect x="14" y="6.2" width="2.8" height="4.6" rx="0.4" fill="none" stroke="#4a5559" stroke-width="0.9"/>
    </svg>
  `),
  'integral-with-differential': makeToolbarIconImage(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 18 18">
      <text x="0.95" y="13.85" font-size="14.6" font-family="Cambria Math, STIX Two Math, Times New Roman, serif" font-weight="700" fill="#37474f">∫</text>
      <rect x="6.55" y="6.15" width="3.05" height="3.05" rx="0.48" fill="none" stroke="#4a5559" stroke-width="1.15"/>
      <text x="10.55" y="8.95" font-size="4.95" font-family="Arial, Helvetica, sans-serif" font-weight="700" fill="#37474f">d</text>
      <rect x="13.15" y="6.15" width="3.05" height="3.05" rx="0.48" fill="none" stroke="#4a5559" stroke-width="1.15"/>
    </svg>
  `),
  'integral-with-limits-differential': makeToolbarIconImage(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 60">
      <text x="10" y="42" font-size="42" font-family="Times New Roman, serif" fill="#000">∫</text>
      <rect x="34" y="2" width="8" height="18" fill="none" stroke="#2e8b57" stroke-width="2"/>
      <rect x="18" y="40" width="8" height="18" fill="none" stroke="#2e8b57" stroke-width="2"/>
      <rect x="48" y="22" width="12" height="22" fill="none" stroke="#2e8b57" stroke-width="2"/>
      <text x="64" y="39" font-size="18" font-family="Times New Roman, serif" fill="#000">d</text>
      <rect x="76" y="22" width="12" height="22" fill="none" stroke="#2e8b57" stroke-width="2"/>
    </svg>
  `),
  'integral-both-template-image': makeToolbarIconImage(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 55 70">
      <text x="8" y="48" font-size="46" font-family="Times New Roman">∫</text>
      <rect x="34" y="4" width="8" height="18" fill="none" stroke="#2e8b57" stroke-width="2"/>
      <rect x="18" y="46" width="8" height="18" fill="none" stroke="#2e8b57" stroke-width="2"/>
    </svg>
  `),
  'integral-lower-template-image': makeToolbarIconImage(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 50 60">
      <text x="8" y="42" font-size="44" font-family="Times New Roman">∫</text>
      <rect x="20" y="40" width="8" height="18" fill="none" stroke="#2e8b57" stroke-width="2"/>
    </svg>
  `),
  'first-derivative-template-image': makeToolbarIconImage(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 50 50">
      <text x="5" y="18" font-size="18">d</text>
      <rect x="18" y="4" width="8" height="16" fill="none" stroke="#2e8b57" stroke-width="2"/>
      <line x1="2" y1="25" x2="32" y2="25" stroke="#000" stroke-width="2"/>
      <text x="5" y="44" font-size="18">d</text>
      <rect x="18" y="30" width="8" height="16" fill="none" stroke="#2e8b57" stroke-width="2"/>
    </svg>
  `),
  'partial-derivative-template-image': makeToolbarIconImage(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 55 50">
      <text x="4" y="18" font-size="18">∂</text>
      <rect x="20" y="4" width="8" height="16" fill="none" stroke="#2e8b57" stroke-width="2"/>
      <line x1="2" y1="25" x2="34" y2="25" stroke="#000" stroke-width="2"/>
      <text x="4" y="44" font-size="18">∂</text>
      <rect x="20" y="30" width="8" height="16" fill="none" stroke="#2e8b57" stroke-width="2"/>
    </svg>
  `),
  'limit-infinity-template-image': makeToolbarIconImage(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 70 40">
      <text x="18" y="15" font-size="18">lim</text>
      <rect x="4" y="22" width="8" height="14" fill="none" stroke="#2e8b57" stroke-width="2"/>
      <text x="16" y="33" font-size="16">→∞</text>
    </svg>
  `),
  'limit-generic-template-image': makeToolbarIconImage(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 55 40">
      <text x="14" y="15" font-size="18">lim</text>
      <rect x="20" y="22" width="8" height="14" fill="none" stroke="#2e8b57" stroke-width="2"/>
    </svg>
  `),
  'log-base-template-image': makeToolbarIconImage(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 90 40">
      <text x="2" y="22" font-size="16" font-family="Arial, sans-serif" fill="#000">log</text>
      <rect x="36" y="24" width="8" height="10" fill="none" stroke="#2e8b57" stroke-width="2"/>
      <path d="M52 6 Q45 20 52 34" fill="none" stroke="#000" stroke-width="2"/>
      <rect x="56" y="10" width="10" height="16" fill="none" stroke="#2e8b57" stroke-width="2"/>
      <path d="M72 6 Q79 20 72 34" fill="none" stroke="#000" stroke-width="2"/>
    </svg>
  `),
  'integral-limits-template-image': makeToolbarIconImage(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 18 18">
      <path d="M6.2 15.5C5.7 10.7 7 4.7 9.1 3.1C9.9 2.5 10.8 2.6 11.2 3.4C11.55 4.05 11.45 5.05 11.05 6.15" fill="none" stroke="#2f3b43" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
      <rect x="11.7" y="2.2" width="3.2" height="3.2" rx="0.4" fill="none" stroke="#2c8a43" stroke-width="1.1"/>
      <rect x="10.2" y="12.3" width="3.2" height="3.2" rx="0.4" fill="none" stroke="#2c8a43" stroke-width="1.1"/>
    </svg>
  `),
  'vector-template-image': makeToolbarIconImage(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 18 18">
      <path d="M5.2 4.3H12.7" fill="none" stroke="#2c8a43" stroke-width="1.35" stroke-linecap="round"/>
      <path d="M10.9 2.95L12.95 4.3L10.9 5.65" fill="none" stroke="#2c8a43" stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round"/>
      <rect x="4.6" y="6.4" width="8.8" height="9" rx="1.1" fill="none" stroke="#56646d" stroke-width="1.2"/>
    </svg>
  `),
  'summation-template-image': makeToolbarIconImage(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 18 18">
      <rect x="1.9" y="2.2" width="3.1" height="3.1" rx="0.4" fill="none" stroke="#2c8a43" stroke-width="1.1"/>
      <path d="M12.9 3.1H6.55L10.25 8.85L6.45 14.8H13.1" fill="none" stroke="#2f3b43" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
      <rect x="1.9" y="12.7" width="3.1" height="3.1" rx="0.4" fill="none" stroke="#2c8a43" stroke-width="1.1"/>
    </svg>
  `),
  'paren-fraction-template-image': makeToolbarIconImage(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 18 18">
      <path d="M4.55 2.5C3.15 3.85 2.5 5.8 2.5 9C2.5 12.2 3.15 14.15 4.55 15.5" fill="none" stroke="#2f3b43" stroke-width="1.2" stroke-linecap="round"/>
      <path d="M13.45 2.5C14.85 3.85 15.5 5.8 15.5 9C15.5 12.2 14.85 14.15 13.45 15.5" fill="none" stroke="#2f3b43" stroke-width="1.2" stroke-linecap="round"/>
      <rect x="6.65" y="3.2" width="4.7" height="4.1" rx="0.5" fill="none" stroke="#2c8a43" stroke-width="1.1"/>
      <line x1="6.15" y1="9" x2="11.85" y2="9" stroke="#2c8a43" stroke-width="1.2" stroke-linecap="round"/>
      <rect x="6.65" y="10.7" width="4.7" height="4.1" rx="0.5" fill="none" stroke="#2c8a43" stroke-width="1.1"/>
    </svg>
  `),
  'brace-fraction-template-image': makeToolbarIconImage(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 18 18">
      <path d="M5.15 2.55C3.9 2.55 3.2 3.3 3.2 4.55V6.15C3.2 6.9 2.85 7.35 2.25 7.7C2.85 8.05 3.2 8.5 3.2 9.25V10.85C3.2 12.1 3.9 12.85 5.15 12.85" fill="none" stroke="#2f3b43" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M12.85 2.55C14.1 2.55 14.8 3.3 14.8 4.55V6.15C14.8 6.9 15.15 7.35 15.75 7.7C15.15 8.05 14.8 8.5 14.8 9.25V10.85C14.8 12.1 14.1 12.85 12.85 12.85" fill="none" stroke="#2f3b43" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round"/>
      <rect x="6.45" y="3.2" width="4.1" height="4.1" rx="0.5" fill="none" stroke="#2c8a43" stroke-width="1.1"/>
      <line x1="6.05" y1="9" x2="10.95" y2="9" stroke="#2c8a43" stroke-width="1.2" stroke-linecap="round"/>
      <rect x="6.45" y="10.7" width="4.1" height="4.1" rx="0.5" fill="none" stroke="#2c8a43" stroke-width="1.1"/>
    </svg>
  `),
  'bracket-fraction-template-image': makeToolbarIconImage(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 18 18">
      <path d="M4.65 2.6H2.95V15.4H4.65" fill="none" stroke="#2f3b43" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M13.35 2.6H15.05V15.4H13.35" fill="none" stroke="#2f3b43" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
      <rect x="6.55" y="3.2" width="4.9" height="4.1" rx="0.5" fill="none" stroke="#2c8a43" stroke-width="1.1"/>
      <line x1="6.05" y1="9" x2="11.95" y2="9" stroke="#2c8a43" stroke-width="1.2" stroke-linecap="round"/>
      <rect x="6.55" y="10.7" width="4.9" height="4.1" rx="0.5" fill="none" stroke="#2c8a43" stroke-width="1.1"/>
    </svg>
  `),
  'subsup-template-image': makeToolbarIconImage(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 18 18">
      <rect x="2.9" y="5.7" width="6.1" height="8.2" rx="0.75" fill="none" stroke="#56646d" stroke-width="1.2"/>
      <rect x="10.5" y="2.35" width="4.05" height="4.15" rx="0.5" fill="none" stroke="#2c8a43" stroke-width="1.1"/>
      <rect x="10.5" y="10.2" width="4.05" height="4.15" rx="0.5" fill="none" stroke="#2c8a43" stroke-width="1.1"/>
    </svg>
  `),
  'fraction-exponent-template-image': makeToolbarIconImage(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 18 18">
      <rect x="2.6" y="7.2" width="5.8" height="7.6" rx="0.75" fill="none" stroke="#56646d" stroke-width="1.2"/>
      <rect x="10.25" y="2.75" width="3.35" height="2.7" rx="0.4" fill="none" stroke="#2c8a43" stroke-width="1.05"/>
      <line x1="9.8" y1="8.05" x2="14.15" y2="8.05" stroke="#2c8a43" stroke-width="1.1" stroke-linecap="round"/>
      <rect x="10.25" y="10.1" width="3.35" height="2.7" rx="0.4" fill="none" stroke="#2c8a43" stroke-width="1.05"/>
    </svg>
  `),
  'double-integral-area-template-image': makeToolbarIconImage(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 18 18">
      <text x="0.7" y="13.55" font-size="11.1" font-family="Cambria Math, STIX Two Math, Times New Roman, serif" font-weight="700" fill="#263238">∫∫</text>
      <rect x="10.85" y="2.05" width="3.45" height="3.45" rx="0.55" fill="none" stroke="#465257" stroke-width="1.2"/>
      <rect x="8.05" y="12.05" width="3.1" height="3.1" rx="0.5" fill="none" stroke="#465257" stroke-width="1.2"/>
      <text x="10.95" y="9.75" font-size="5.45" font-family="Arial, Helvetica, sans-serif" font-weight="700" fill="#263238">dA</text>
    </svg>
  `),
  'exp-e-template-image': makeToolbarIconImage(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 18 18">
      <text x="4.95" y="12.85" fill="#2f3b43" font-size="7.6" font-weight="700" font-family="Cambria Math, Times New Roman, serif">e</text>
      <rect x="10.15" y="2.95" width="3.6" height="3.35" rx="0.42" fill="none" stroke="#2c8a43" stroke-width="1.05"/>
    </svg>
  `),
  'exp-generic-template-image': makeToolbarIconImage(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 18 18">
      <rect x="3.15" y="8.15" width="5.35" height="5.45" rx="0.55" fill="none" stroke="#56646d" stroke-width="1.15"/>
      <rect x="10.2" y="3.05" width="3.75" height="3.55" rx="0.45" fill="none" stroke="#2c8a43" stroke-width="1.05"/>
    </svg>
  `),
  'evaluated-expression-template-image': makeToolbarIconImage(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 18 18">
      <path d="M4.45 2.7H2.9V15.3H4.45" fill="none" stroke="#2f3b43" stroke-width="1.15" stroke-linecap="round" stroke-linejoin="round"/>
      <rect x="5.8" y="5.55" width="4.55" height="7.2" rx="0.6" fill="none" stroke="#56646d" stroke-width="1.1"/>
      <rect x="11.95" y="2.95" width="2.8" height="3.05" rx="0.38" fill="none" stroke="#2c8a43" stroke-width="1"/>
      <rect x="11.95" y="11.95" width="2.8" height="3.05" rx="0.38" fill="none" stroke="#2c8a43" stroke-width="1"/>
    </svg>
  `),
  'rtl-input-template-image': makeToolbarIconImage(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 18 18">
      <text x="10.9" y="8.6" text-anchor="middle" fill="#2f3b43" font-size="6.9" font-weight="700" font-family="Tahoma, Arial, sans-serif">س</text>
      <rect x="11.85" y="3.1" width="3.2" height="3.2" rx="0.45" fill="none" stroke="#2c8a43" stroke-width="1.1"/>
      <path d="M13.9 13.1H4.55M6.2 11.45L4.55 13.1L6.2 14.75" fill="none" stroke="#2c8a43" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  `),
  'negate-template-image': makeToolbarIconImage(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 18 18">
      <rect x="6.2" y="3.05" width="4.35" height="10.35" rx="0.55" fill="none" stroke="#2c8a43" stroke-width="1.15"/>
      <path d="M5.1 14.7L11.85 2.6" fill="none" stroke="#2f3b43" stroke-width="1.55" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  `),
  'slash-operator-template-image': makeToolbarIconImage(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none">
      <path d="M8 4L16 20" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>
    </svg>
  `),
  'setminus-operator-template-image': makeToolbarIconImage(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none">
      <path d="M16 4L8 20" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>
    </svg>
  `),
  'minus-plus-operator-template-image': makeToolbarIconImage(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none">
      <line x1="7" y1="8" x2="17" y2="8" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>
      <line x1="7" y1="16" x2="17" y2="16" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>
      <line x1="12" y1="11" x2="12" y2="21" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>
    </svg>
  `),
  'not-equal-template-image': makeToolbarIconImage(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none">
      <line x1="6" y1="9" x2="18" y2="9" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>
      <line x1="6" y1="15" x2="18" y2="15" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>
      <line x1="16" y1="5" x2="8" y2="19" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>
    </svg>
  `),
  'not-approx-equal-template-image': makeToolbarIconImage(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none">
      <path d="M6 8C8 6 10 10 12 8C14 6 16 10 18 8" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>
      <path d="M6 14C8 12 10 16 12 14C14 12 16 16 18 14" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>
      <line x1="16" y1="5" x2="8" y2="19" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>
    </svg>
  `),
  'not-similar-template-image': makeToolbarIconImage(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none">
      <path d="M6 12C8 10 10 14 12 12C14 10 16 14 18 12" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>
      <line x1="16" y1="5" x2="8" y2="19" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>
    </svg>
  `),
  'not-identical-template-image': makeToolbarIconImage(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none">
      <line x1="6" y1="7" x2="18" y2="7" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>
      <line x1="6" y1="12" x2="18" y2="12" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>
      <line x1="6" y1="17" x2="18" y2="17" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>
      <line x1="16" y1="4" x2="8" y2="20" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>
    </svg>
  `),
  'less-than-not-equal-template-image': makeToolbarIconImage(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
      <text x="12" y="17" text-anchor="middle" font-size="20" fill="currentColor" font-family="Cambria Math, STIX Two Math, Times New Roman">≨</text>
    </svg>
  `),
  'much-greater-than-template-image': makeToolbarIconImage(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
      <text x="12" y="17" text-anchor="middle" font-size="20" fill="currentColor">≫</text>
    </svg>
  `),
  'succeeds-template-image': makeToolbarIconImage(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
      <text x="12" y="17" text-anchor="middle" font-size="20" fill="currentColor">≻</text>
    </svg>
  `),
  'greater-than-not-equal-template-image': makeToolbarIconImage(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
      <text x="12" y="17" text-anchor="middle" font-size="20" fill="currentColor" font-family="Cambria Math, STIX Two Math, Times New Roman">≩</text>
    </svg>
  `),
  'proportional-to-template-image': makeToolbarIconImage(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
      <text x="12" y="17" text-anchor="middle" font-size="20" fill="currentColor">∝</text>
    </svg>
  `),
  'normal-subgroup-template-image': makeToolbarIconImage(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
      <text x="12" y="17" text-anchor="middle" font-size="20" fill="currentColor">⊲</text>
    </svg>
  `),
  'much-less-than-template-image': makeToolbarIconImage(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
      <text x="12" y="17" text-anchor="middle" font-size="20" fill="currentColor">≪</text>
    </svg>
  `),
  'precedes-template-image': makeToolbarIconImage(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
      <text x="12" y="17" text-anchor="middle" font-size="20" fill="currentColor">≺</text>
    </svg>
  `),
  'contains-normal-subgroup-template-image': makeToolbarIconImage(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
      <text x="12" y="17" text-anchor="middle" font-size="20" fill="currentColor">▷</text>
    </svg>
  `),
  'not-element-of-template-image': makeToolbarIconImage(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
      <text x="12" y="17" text-anchor="middle" font-size="20" fill="currentColor">∉</text>
    </svg>
  `),
  'not-contains-member-template-image': makeToolbarIconImage(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
      <text x="12" y="17" text-anchor="middle" font-size="20" fill="currentColor">∌</text>
    </svg>
  `),
  'subset-equal-template-image': makeToolbarIconImage(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
      <text x="12" y="17" text-anchor="middle" font-size="20" fill="currentColor">⊆</text>
    </svg>
  `),
  'superset-equal-template-image': makeToolbarIconImage(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
      <text x="12" y="17" text-anchor="middle" font-size="20" fill="currentColor">⊇</text>
    </svg>
  `),
  'square-subset-template-image': makeToolbarIconImage(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
      <text x="12" y="17" text-anchor="middle" font-size="20" fill="currentColor">⊏</text>
    </svg>
  `),
  'square-superset-template-image': makeToolbarIconImage(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
      <text x="12" y="17" text-anchor="middle" font-size="20" fill="currentColor">⊐</text>
    </svg>
  `),
  'square-subset-equal-template-image': makeToolbarIconImage(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
      <text x="12" y="17" text-anchor="middle" font-size="20" fill="currentColor">⊑</text>
    </svg>
  `),
  'square-superset-equal-template-image': makeToolbarIconImage(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
      <text x="12" y="17" text-anchor="middle" font-size="20" fill="currentColor">⊒</text>
    </svg>
  `),
  'square-cap-template-image': makeToolbarIconImage(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
      <text x="12" y="17" text-anchor="middle" font-size="20" fill="currentColor">⊓</text>
    </svg>
  `),
  'square-cup-template-image': makeToolbarIconImage(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
      <text x="12" y="17" text-anchor="middle" font-size="20" fill="currentColor">⊔</text>
    </svg>
  `),
  'therefore-template-image': makeToolbarIconImage(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
      <circle cx="12" cy="6" r="1.8" />
      <circle cx="7" cy="16" r="1.8" />
      <circle cx="17" cy="16" r="1.8" />
    </svg>
  `),
  'because-template-image': makeToolbarIconImage(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
      <circle cx="7" cy="8" r="1.8" />
      <circle cx="17" cy="8" r="1.8" />
      <circle cx="12" cy="18" r="1.8" />
    </svg>
  `),
  'not-parallel-template-image': makeToolbarIconImage(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none">
      <line x1="8" y1="3" x2="8" y2="21" stroke="currentColor" stroke-width="2.2" />
      <line x1="16" y1="3" x2="16" y2="21" stroke="currentColor" stroke-width="2.2" />
      <line x1="18" y1="4" x2="6" y2="20" stroke="currentColor" stroke-width="2.2" />
    </svg>
  `),
  'measured-angle-template-image': makeToolbarIconImage(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
      <text
        x="12"
        y="17"
        text-anchor="middle"
        font-size="20"
        fill="currentColor"
        font-family="Cambria Math, STIX Two Math, Times New Roman"
      >
        ∡
      </text>
    </svg>
  `),
  'spherical-angle-template-image': makeToolbarIconImage(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
      <text
        x="12"
        y="17"
        text-anchor="middle"
        font-size="20"
        fill="currentColor"
        font-family="Cambria Math, STIX Two Math, Times New Roman"
      >
        ∢
      </text>
    </svg>
  `),
  'diamond-template-image': makeToolbarIconImage(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none">
      <path d="M12 3L18 12L12 21L6 12Z" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round" />
    </svg>
  `),
  'rectangle-template-image': makeToolbarIconImage(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none">
      <rect x="4" y="7" width="16" height="10" stroke="currentColor" stroke-width="2.2" />
    </svg>
  `),
  'parallelogram-template-image': makeToolbarIconImage(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none">
      <path d="M8 5H18L16 19H6L8 5Z" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round" />
    </svg>
  `),
  'circled-minus-template-image': makeToolbarIconImage(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2.2" />
      <line x1="8" y1="12" x2="16" y2="12" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" />
    </svg>
  `),
  'circled-asterisk-template-image': makeToolbarIconImage(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2.2" />
      <line x1="12" y1="7" x2="12" y2="17" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" />
      <line x1="7" y1="12" x2="17" y2="12" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" />
      <line x1="8.5" y1="8.5" x2="15.5" y2="15.5" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" />
      <line x1="15.5" y1="8.5" x2="8.5" y2="15.5" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" />
    </svg>
  `),
  'circled-divide-template-image': makeToolbarIconImage(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2.2" />
      <rect x="10.9" y="5.8" width="2.2" height="2.2" fill="currentColor" />
      <rect x="7.2" y="10.9" width="9.6" height="2.2" fill="currentColor" />
      <rect x="10.9" y="16" width="2.2" height="2.2" fill="currentColor" />
    </svg>
  `),
  'raised-bullet-template-image': makeToolbarIconImage(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="8" r="3" fill="currentColor" />
    </svg>
  `),
  'cases-template-image': makeToolbarIconImage(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 48" fill="none">
      <path
        d="M9 2 C4 2 4 5 4 8 L4 16 C4 19 3 21 1 24 C3 27 4 29 4 32 L4 40 C4 43 4 46 9 46"
        stroke="#7e8d98"
        stroke-width="1.5"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
      <rect x="15" y="7" width="8" height="13" stroke="#008000" stroke-width="1.5"/>
      <rect x="15" y="28" width="8" height="13" stroke="#008000" stroke-width="1.5"/>
    </svg>
  `),
  'rcases-template-image': makeToolbarIconImage(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 42 72" fill="none">
      <rect x="10" y="8" width="9" height="22" stroke="#0a7a18" stroke-width="2"/>
      <rect x="10" y="42" width="9" height="22" stroke="#0a7a18" stroke-width="2"/>
      <path
        d="M30 2 C36 2,36 8,36 14 L36 28 C36 32,38 34,40 36 C38 38,36 40,36 44 L36 58 C36 64,36 70,30 70"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>
  `),
  'cases-two-by-two-template-image': makeToolbarIconImage(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 42 48" fill="none">
      <path
        d="M8 2 C4 2 4 5 4 8 L4 16 C4 18 3 20 1 24 C3 28 4 30 4 32 L4 40 C4 43 4 46 8 46"
        stroke="#000"
        stroke-width="1.5"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
      <rect x="14" y="8" width="6" height="12" stroke="#008000" stroke-width="1.5"/>
      <rect x="28" y="8" width="6" height="12" stroke="#008000" stroke-width="1.5"/>
      <rect x="14" y="28" width="6" height="12" stroke="#008000" stroke-width="1.5"/>
      <rect x="28" y="28" width="6" height="12" stroke="#008000" stroke-width="1.5"/>
    </svg>
  `),
  'aligned-equals-template-image': makeToolbarIconImage(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 42 48" fill="none">
      <rect x="6" y="6" width="8" height="12" stroke="#008000" stroke-width="1.5"/>
      <text x="21" y="16" font-size="12" text-anchor="middle" fill="#000">=</text>
      <rect x="28" y="6" width="8" height="12" stroke="#008000" stroke-width="1.5"/>
      <rect x="6" y="28" width="8" height="12" stroke="#008000" stroke-width="1.5"/>
      <text x="21" y="38" font-size="12" text-anchor="middle" fill="#000">=</text>
      <rect x="28" y="28" width="8" height="12" stroke="#008000" stroke-width="1.5"/>
    </svg>
  `),
  'vertical-ellipsis-template-image': makeToolbarIconImage(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="5.5" r="1.35" fill="#22343d" />
      <circle cx="12" cy="12" r="1.35" fill="#22343d" />
      <circle cx="12" cy="18.5" r="1.35" fill="#22343d" />
    </svg>
  `),
  'midline-ellipsis-template-image': makeToolbarIconImage(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none">
      <circle cx="5.5" cy="12" r="1.35" fill="#22343d" />
      <circle cx="12" cy="12" r="1.35" fill="#22343d" />
      <circle cx="18.5" cy="12" r="1.35" fill="#22343d" />
    </svg>
  `),
  'upright-ellipsis-template-image': makeToolbarIconImage(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none">
      <circle cx="6.2" cy="17.8" r="1.35" fill="#22343d" />
      <circle cx="12" cy="12" r="1.35" fill="#22343d" />
      <circle cx="17.8" cy="6.2" r="1.35" fill="#22343d" />
    </svg>
  `),
  'downright-ellipsis-template-image': makeToolbarIconImage(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none">
      <circle cx="6.2" cy="6.2" r="1.35" fill="#22343d" />
      <circle cx="12" cy="12" r="1.35" fill="#22343d" />
      <circle cx="17.8" cy="17.8" r="1.35" fill="#22343d" />
    </svg>
  `),
  'sum-array-template-image': makeToolbarIconImage(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 72" fill="none">
      <rect x="28" y="6" width="10" height="16" stroke="#008000" stroke-width="1.5"/>
      <text x="14" y="40" font-size="18" text-anchor="middle" fill="#000">+</text>
      <rect x="28" y="28" width="10" height="16" stroke="#008000" stroke-width="1.5"/>
      <line x1="6" y1="52" x2="42" y2="52" stroke="#000" stroke-width="1.5"/>
      <rect x="28" y="58" width="10" height="16" stroke="#008000" stroke-width="1.5"/>
    </svg>
  `),
  'difference-array-template-image': makeToolbarIconImage(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 72" fill="none">
      <rect x="28" y="6" width="10" height="16" stroke="#008000" stroke-width="1.5"/>
      <line x1="8" y1="36" x2="18" y2="36" stroke="#000" stroke-width="2"/>
      <rect x="28" y="28" width="10" height="16" stroke="#008000" stroke-width="1.5"/>
      <line x1="6" y1="52" x2="42" y2="52" stroke="#000" stroke-width="1.5"/>
      <rect x="28" y="58" width="10" height="16" stroke="#008000" stroke-width="1.5"/>
    </svg>
  `),
  'stack-line-template-image': makeToolbarIconImage(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 64" fill="none">
      <rect x="7" y="4" width="10" height="12" stroke="#008000" stroke-width="1.5"/>
      <rect x="7" y="22" width="10" height="12" stroke="#008000" stroke-width="1.5"/>
      <line x1="4" y1="42" x2="20" y2="42" stroke="#000" stroke-width="1.5"/>
      <rect x="7" y="48" width="10" height="12" stroke="#008000" stroke-width="1.5"/>
    </svg>
  `),
  'division-layout-template-image': makeToolbarIconImage(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 60 80" fill="none">
      <rect x="38" y="6" width="10" height="14" stroke="#008000" stroke-width="1.5"/>
      <line x1="28" y1="28" x2="56" y2="28" stroke="#000" stroke-width="2"/>
      <path d="M22 28 C30 35,30 45,22 54" stroke="#000" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      <rect x="6" y="34" width="10" height="14" stroke="#008000" stroke-width="1.5"/>
      <rect x="40" y="34" width="10" height="14" stroke="#008000" stroke-width="1.5"/>
    </svg>
  `),
  'product-array-template-image': makeToolbarIconImage(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 52 88" fill="none">
      <rect x="34" y="6" width="10" height="16" stroke="#008000" stroke-width="1.5"/>
      <text x="14" y="46" font-size="18" text-anchor="middle" fill="#000">×</text>
      <rect x="34" y="38" width="10" height="16" stroke="#008000" stroke-width="1.5"/>
      <line x1="4" y1="66" x2="46" y2="66" stroke="#000" stroke-width="1.5"/>
      <rect x="34" y="74" width="10" height="16" stroke="#008000" stroke-width="1.5"/>
    </svg>
  `),
  'mixed-fraction-template-image': makeToolbarIconImage(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 60 70" fill="none">
      <rect x="6" y="18" width="12" height="18" stroke="#008000" stroke-width="1.5"/>
      <line x1="28" y1="4" x2="28" y2="36" stroke="#000" stroke-width="2"/>
      <rect x="40" y="10" width="12" height="18" stroke="#008000" stroke-width="1.5"/>
      <line x1="28" y1="36" x2="58" y2="36" stroke="#000" stroke-width="2"/>
      <rect x="40" y="46" width="12" height="18" stroke="#008000" stroke-width="1.5"/>
    </svg>
  `),
  'array-cc-template-image': makeToolbarIconImage(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 60 70" fill="none">
      <rect x="8" y="12" width="12" height="18" stroke="#008000" stroke-width="1.5"/>
      <rect x="8" y="46" width="12" height="18" stroke="#008000" stroke-width="1.5"/>
      <rect x="40" y="12" width="12" height="18" stroke="#008000" stroke-width="1.5"/>
      <line x1="34" y1="36" x2="58" y2="36" stroke="#000" stroke-width="2"/>
      <rect x="40" y="46" width="12" height="18" stroke="#008000" stroke-width="1.5"/>
      <line x1="30" y1="2" x2="30" y2="36" stroke="#000" stroke-width="2"/>
    </svg>
  `),
  'division-remainder-template-image': makeToolbarIconImage(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 60 90" fill="none">
      <rect x="40" y="6" width="12" height="18" stroke="#008000" stroke-width="1.5"/>
      <line x1="28" y1="32" x2="56" y2="32" stroke="#000" stroke-width="2"/>
      <path d="M22 32 C30 40,30 52,22 60" stroke="#000" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      <rect x="6" y="40" width="12" height="18" stroke="#008000" stroke-width="1.5"/>
      <rect x="40" y="40" width="12" height="18" stroke="#008000" stroke-width="1.5"/>
      <rect x="40" y="70" width="12" height="18" stroke="#008000" stroke-width="1.5"/>
    </svg>
  `),
  'vertical-line-picker-template-image': makeToolbarIconImage(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none">
      <rect x="8.6" y="2.5" width="4.3" height="18.5" rx="1.4" fill="#89a5b6" />
      <path d="M12.8 15L17 18.1L12.8 21.2Z" fill="#ffffff" />
    </svg>
  `),
  'right-left-arrows-over': makeArrowLabelToolbarIcon(`
    <rect x="10" y="1" width="4" height="4"/>
    <line x1="4" y1="10" x2="20" y2="10"/>
    <polyline points="17,8 20,10 17,12"/>
    <line x1="20" y1="14" x2="4" y2="14"/>
    <polyline points="7,12 4,14 7,16"/>
  `),
  'right-left-arrows-under': makeArrowLabelToolbarIcon(`
    <line x1="4" y1="8" x2="20" y2="8"/>
    <polyline points="17,6 20,8 17,10"/>
    <line x1="20" y1="12" x2="4" y2="12"/>
    <polyline points="7,10 4,12 7,14"/>
    <rect x="10" y="18" width="4" height="4"/>
  `),
  'right-left-arrows-over-under': makeArrowLabelToolbarIcon(`
    <rect x="10" y="1" width="4" height="4"/>
    <line x1="4" y1="10" x2="20" y2="10"/>
    <polyline points="17,8 20,10 17,12"/>
    <line x1="20" y1="14" x2="4" y2="14"/>
    <polyline points="7,12 4,14 7,16"/>
    <rect x="10" y="19" width="4" height="4"/>
  `),
  'left-right-arrows-over': makeArrowLabelToolbarIcon(`
    <rect x="10" y="1" width="4" height="4"/>
    <line x1="20" y1="10" x2="4" y2="10"/>
    <polyline points="7,8 4,10 7,12"/>
    <line x1="4" y1="15" x2="20" y2="15"/>
    <polyline points="17,13 20,15 17,17"/>
  `),
  'left-right-arrows-under': makeArrowLabelToolbarIcon(`
    <line x1="20" y1="6" x2="4" y2="6"/>
    <polyline points="7,4 4,6 7,8"/>
    <line x1="4" y1="11" x2="20" y2="11"/>
    <polyline points="17,9 20,11 17,13"/>
    <rect x="10" y="18" width="4" height="4"/>
  `),
  'left-right-arrows-over-under': makeArrowLabelToolbarIcon(`
    <rect x="10" y="1" width="4" height="4"/>
    <line x1="20" y1="9" x2="4" y2="9"/>
    <polyline points="7,7 4,9 7,11"/>
    <line x1="4" y1="14" x2="20" y2="14"/>
    <polyline points="17,12 20,14 17,16"/>
    <rect x="10" y="19" width="4" height="4"/>
  `),
  'right-left-stacked-arrows-over': makeArrowLabelToolbarIcon(`
    <rect x="10" y="1" width="4" height="4"/>
    <line x1="4" y1="10" x2="20" y2="10"/>
    <polyline points="17,8 20,10 17,12"/>
    <line x1="20" y1="15" x2="4" y2="15"/>
    <polyline points="7,13 4,15 7,17"/>
  `),
  'right-left-stacked-arrows-under': makeArrowLabelToolbarIcon(`
    <line x1="4" y1="6" x2="20" y2="6"/>
    <polyline points="17,4 20,6 17,8"/>
    <line x1="20" y1="11" x2="4" y2="11"/>
    <polyline points="7,9 4,11 7,13"/>
    <rect x="10" y="18" width="4" height="4"/>
  `),
  'right-left-stacked-arrows-over-under': makeArrowLabelToolbarIcon(`
    <rect x="10" y="1" width="4" height="4"/>
    <line x1="4" y1="9" x2="20" y2="9"/>
    <polyline points="17,7 20,9 17,11"/>
    <line x1="20" y1="14" x2="4" y2="14"/>
    <polyline points="7,12 4,14 7,16"/>
    <rect x="10" y="19" width="4" height="4"/>
  `),
  'left-right-harpoons-over': makeArrowLabelToolbarIcon(`
    <rect x="10" y="1" width="4" height="4"/>
    <line x1="20" y1="10" x2="4" y2="10"/>
    <line x1="4" y1="10" x2="7" y2="7"/>
    <line x1="4" y1="15" x2="20" y2="15"/>
    <line x1="20" y1="15" x2="17" y2="12"/>
  `),
  'left-right-harpoons-under': makeArrowLabelToolbarIcon(`
    <line x1="20" y1="6" x2="4" y2="6"/>
    <line x1="4" y1="6" x2="7" y2="3"/>
    <line x1="4" y1="11" x2="20" y2="11"/>
    <line x1="20" y1="11" x2="17" y2="8"/>
    <rect x="10" y="18" width="4" height="4"/>
  `),
  'left-right-harpoons-over-under': makeArrowLabelToolbarIcon(`
    <rect x="10" y="1" width="4" height="4"/>
    <line x1="20" y1="9" x2="4" y2="9"/>
    <line x1="4" y1="9" x2="7" y2="6"/>
    <line x1="4" y1="14" x2="20" y2="14"/>
    <line x1="20" y1="14" x2="17" y2="11"/>
    <rect x="10" y="19" width="4" height="4"/>
  `),
  'right-left-harpoons-over': makeArrowLabelToolbarIcon(`
    <rect x="10" y="1" width="4" height="4"/>
    <line x1="4" y1="10" x2="20" y2="10"/>
    <line x1="20" y1="10" x2="17" y2="7"/>
    <line x1="20" y1="15" x2="4" y2="15"/>
    <line x1="4" y1="15" x2="7" y2="12"/>
  `),
  'right-left-harpoons-under': makeArrowLabelToolbarIcon(`
    <line x1="4" y1="6" x2="20" y2="6"/>
    <line x1="20" y1="6" x2="17" y2="3"/>
    <line x1="20" y1="11" x2="4" y2="11"/>
    <line x1="4" y1="11" x2="7" y2="8"/>
    <rect x="10" y="18" width="4" height="4"/>
  `),
  'right-left-harpoons-over-under': makeArrowLabelToolbarIcon(`
    <rect x="10" y="1" width="4" height="4"/>
    <line x1="4" y1="9" x2="20" y2="9"/>
    <line x1="20" y1="9" x2="17" y2="6"/>
    <line x1="20" y1="14" x2="4" y2="14"/>
    <line x1="4" y1="14" x2="7" y2="11"/>
    <rect x="10" y="19" width="4" height="4"/>
  `),
  'long-right-short-left-over': makeArrowLabelToolbarIcon(`
    <rect x="10" y="1" width="4" height="4"/>
    <line x1="3" y1="10" x2="20" y2="10"/>
    <polyline points="17,8 20,10 17,12"/>
    <line x1="15" y1="15" x2="8" y2="15"/>
    <polyline points="11,13 8,15 11,17"/>
  `),
  'long-right-short-left-under': makeArrowLabelToolbarIcon(`
    <line x1="3" y1="6" x2="20" y2="6"/>
    <polyline points="17,4 20,6 17,8"/>
    <line x1="15" y1="11" x2="8" y2="11"/>
    <polyline points="11,9 8,11 11,13"/>
    <rect x="10" y="18" width="4" height="4"/>
  `),
  'long-right-short-left-over-under': makeArrowLabelToolbarIcon(`
    <rect x="10" y="1" width="4" height="4"/>
    <line x1="3" y1="9" x2="20" y2="9"/>
    <polyline points="17,7 20,9 17,11"/>
    <line x1="15" y1="14" x2="8" y2="14"/>
    <polyline points="11,12 8,14 11,16"/>
    <rect x="10" y="19" width="4" height="4"/>
  `),
  'short-right-long-left-over': makeArrowLabelToolbarIcon(`
    <rect x="10" y="1" width="4" height="4"/>
    <line x1="8" y1="10" x2="15" y2="10"/>
    <polyline points="12,8 15,10 12,12"/>
    <line x1="20" y1="15" x2="3" y2="15"/>
    <polyline points="6,13 3,15 6,17"/>
  `),
  'short-right-long-left-under': makeArrowLabelToolbarIcon(`
    <line x1="8" y1="6" x2="15" y2="6"/>
    <polyline points="12,4 15,6 12,8"/>
    <line x1="20" y1="11" x2="3" y2="11"/>
    <polyline points="6,9 3,11 6,13"/>
    <rect x="10" y="18" width="4" height="4"/>
  `),
  'short-right-long-left-over-under': makeArrowLabelToolbarIcon(`
    <rect x="10" y="1" width="4" height="4"/>
    <line x1="8" y1="9" x2="15" y2="9"/>
    <polyline points="12,7 15,9 12,11"/>
    <line x1="20" y1="14" x2="3" y2="14"/>
    <polyline points="6,12 3,14 6,16"/>
    <rect x="10" y="19" width="4" height="4"/>
  `),
  'arabic-indic-numerals-template-image': makeToolbarIconImage(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48">
      <text x="4" y="36" font-family="Amiri, Noto Naskh Arabic, serif" font-size="38" fill="#000">٤٦</text>
    </svg>
  `),
  'eastern-arabic-indic-numerals-template-image': makeToolbarIconImage(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48">
      <text x="4" y="36" font-size="36" font-family="sans-serif" fill="#000">۴۶</text>
    </svg>
  `),
};

function renderToolbarItemLabel(item, context = {}) {
  if (item.cls?.includes('arrow-picker-tool')) {
    return (
      <span className="cme-toolbar-chevron-indicator" aria-hidden="true">
        ⏵
      </span>
    );
  }

  if (item.icon && TOOLBAR_ICON_IMAGES[item.icon]) {
    return (
      <span className="cme-toolbar-icon-image-wrapper" aria-hidden="true">
        <img
          className="cme-toolbar-icon-image"
          src={TOOLBAR_ICON_IMAGES[item.icon]}
          alt=""
        />
      </span>
    );
  }

  if (item.icon === 'stacked-fraction') {
    return (
      <span className="cme-fraction-icon cme-fraction-stack" aria-hidden="true">
        <svg
          className="cme-fraction-svg"
          viewBox="0 0 24 24"
          focusable="false"
          aria-hidden="true"
        >
          <rect x="7.5" y="2.5" width="9" height="6" rx="0.5" />
          <line x1="5.5" y1="12" x2="18.5" y2="12" />
          <rect x="7.5" y="15.5" width="9" height="6" rx="0.5" />
        </svg>
      </span>
    );
  }

  if (
    item.icon === 'arrow-label-right-above' ||
    item.icon === 'arrow-label-left-above' ||
    item.icon === 'arrow-label-both-above' ||
    item.icon === 'arrow-label-right-below' ||
    item.icon === 'arrow-label-left-below' ||
    item.icon === 'arrow-label-both-below' ||
    item.icon === 'arrow-label-both-above-below' ||
    item.icon === 'arrow-label-right-above-below' ||
    item.icon === 'arrow-label-left-above-below' ||
    item.icon === 'harpoon-label-right-left-above' ||
    item.icon === 'harpoon-label-right-left-below' ||
    item.icon === 'harpoon-label-right-left-above-below' ||
    item.icon === 'harpoon-label-left-right-above-below' ||
    item.icon === 'bar-harpoon-label-right-left-above-below' ||
    item.icon === 'bar-harpoon-label-right-left-above' ||
    item.icon === 'bar-harpoon-label-right-left-below' ||
    item.icon === 'bar-harpoon-label-left-right-above-below' ||
    item.icon === 'bar-arrow-label-right-left-above' ||
    item.icon === 'bar-arrow-label-right-left-above-below' ||
    item.icon === 'bar-arrow-label-left-right-above' ||
    item.icon === 'bar-arrow-label-left-right-above-below'
  ) {
    const arrowLayouts = {
      'arrow-label-right-above': {
        direction: 'right',
        arrowY: 11.25,
        topBox: { x: 6.5, y: 1.55, width: 4.8, height: 5.7 }
      },
      'arrow-label-left-above': {
        direction: 'left',
        arrowY: 11.25,
        topBox: { x: 6.5, y: 1.55, width: 4.8, height: 5.7 }
      },
      'arrow-label-both-above': {
        direction: 'both',
        arrowY: 11.25,
        topBox: { x: 6.5, y: 1.55, width: 4.8, height: 5.7 }
      },
      'arrow-label-right-below': {
        direction: 'right',
        arrowY: 6.7,
        bottomBox: { x: 6.5, y: 10.35, width: 4.8, height: 5.7 }
      },
      'arrow-label-left-below': {
        direction: 'left',
        arrowY: 6.7,
        bottomBox: { x: 6.5, y: 10.35, width: 4.8, height: 5.7 }
      },
      'arrow-label-both-below': {
        direction: 'both',
        arrowY: 6.7,
        bottomBox: { x: 6.5, y: 10.35, width: 4.8, height: 5.7 }
      },
      'arrow-label-both-above-below': {
        direction: 'both',
        arrowY: 8.55,
        topBox: { x: 6.5, y: 1.3, width: 4.8, height: 4.9 },
        bottomBox: { x: 6.5, y: 11.7, width: 4.8, height: 4.9 }
      },
      'arrow-label-right-above-below': {
        direction: 'right',
        arrowY: 8.55,
        topBox: { x: 6.5, y: 1.3, width: 4.8, height: 4.9 },
        bottomBox: { x: 6.5, y: 11.7, width: 4.8, height: 4.9 }
      },
      'arrow-label-left-above-below': {
        direction: 'left',
        arrowY: 8.55,
        topBox: { x: 6.5, y: 1.3, width: 4.8, height: 4.9 },
        bottomBox: { x: 6.5, y: 11.7, width: 4.8, height: 4.9 }
      },
      'harpoon-label-right-left-above': {
        direction: 'harpoon-rl',
        arrowY: 11.15,
        topBox: { x: 6.5, y: 1.55, width: 4.8, height: 5.7 }
      },
      'harpoon-label-right-left-below': {
        direction: 'harpoon-rl',
        arrowY: 6.6,
        bottomBox: { x: 6.5, y: 10.35, width: 4.8, height: 5.7 }
      },
      'harpoon-label-right-left-above-below': {
        direction: 'harpoon-rl',
        arrowY: 8.55,
        topBox: { x: 6.5, y: 1.3, width: 4.8, height: 4.9 },
        bottomBox: { x: 6.5, y: 11.7, width: 4.8, height: 4.9 }
      },
      'harpoon-label-left-right-above-below': {
        direction: 'harpoon-lr',
        arrowY: 8.55,
        topBox: { x: 6.5, y: 1.3, width: 4.8, height: 4.9 },
        bottomBox: { x: 6.5, y: 11.7, width: 4.8, height: 4.9 }
      },
      'bar-harpoon-label-right-left-above-below': {
        direction: 'bar-harpoon-rl',
        arrowY: 8.55,
        topBox: { x: 6.5, y: 1.3, width: 4.8, height: 4.9 },
        bottomBox: { x: 6.5, y: 11.7, width: 4.8, height: 4.9 }
      },
      'bar-harpoon-label-right-left-above': {
        direction: 'bar-harpoon-rl',
        arrowY: 11.15,
        topBox: { x: 6.5, y: 1.55, width: 4.8, height: 5.7 }
      },
      'bar-harpoon-label-right-left-below': {
        direction: 'bar-harpoon-rl',
        arrowY: 6.6,
        bottomBox: { x: 6.5, y: 10.35, width: 4.8, height: 5.7 }
      },
      'bar-harpoon-label-left-right-above-below': {
        direction: 'bar-harpoon-lr',
        arrowY: 8.55,
        topBox: { x: 6.5, y: 1.3, width: 4.8, height: 4.9 },
        bottomBox: { x: 6.5, y: 11.7, width: 4.8, height: 4.9 }
      },
      'bar-arrow-label-right-left-above': {
        direction: 'bar-arrow-rl',
        arrowY: 11.15,
        topBox: { x: 6.5, y: 1.55, width: 4.8, height: 5.7 }
      },
      'bar-arrow-label-right-left-above-below': {
        direction: 'bar-arrow-rl',
        arrowY: 8.55,
        topBox: { x: 6.5, y: 1.3, width: 4.8, height: 4.9 },
        bottomBox: { x: 6.5, y: 11.7, width: 4.8, height: 4.9 }
      },
      'bar-arrow-label-left-right-above': {
        direction: 'bar-arrow-lr',
        arrowY: 11.15,
        topBox: { x: 6.5, y: 1.55, width: 4.8, height: 5.7 }
      },
      'bar-arrow-label-left-right-above-below': {
        direction: 'bar-arrow-lr',
        arrowY: 8.55,
        topBox: { x: 6.5, y: 1.3, width: 4.8, height: 4.9 },
        bottomBox: { x: 6.5, y: 11.7, width: 4.8, height: 4.9 }
      }
    };
    const layout = arrowLayouts[item.icon];
    const { direction, arrowY, topBox, bottomBox } = layout;
    const arrowGraphic =
      direction === 'left'
        ? <path d={`M5.1 ${arrowY - 1.55}L2.55 ${arrowY}L5.1 ${arrowY + 1.55}M2.95 ${arrowY}H14.9`} />
        : direction === 'both'
          ? <path d={`M5.1 ${arrowY - 1.55}L2.55 ${arrowY}L5.1 ${arrowY + 1.55}M2.95 ${arrowY}H15.05M12.5 ${arrowY - 1.55}L15.05 ${arrowY}L12.5 ${arrowY + 1.55}`} />
          : direction === 'harpoon-rl'
            ? (
              <>
                <path d={`M3.1 ${arrowY - 1.95}H14.35M12.05 ${arrowY - 3.15}L14.55 ${arrowY - 1.95}L12.05 ${arrowY - 0.75}`} />
                <path d={`M14.45 ${arrowY + 1.65}H3.2M5.45 ${arrowY + 0.45}L2.95 ${arrowY + 1.65}L5.45 ${arrowY + 2.85}`} />
              </>
            )
            : direction === 'harpoon-lr'
              ? (
                <>
                  <path d={`M14.45 ${arrowY - 1.95}H3.2M5.45 ${arrowY - 3.15}L2.95 ${arrowY - 1.95}L5.45 ${arrowY - 0.75}`} />
                  <path d={`M3.1 ${arrowY + 1.65}H14.35M12.05 ${arrowY + 0.45}L14.55 ${arrowY + 1.65}L12.05 ${arrowY + 2.85}`} />
                </>
              )
              : direction === 'bar-harpoon-rl'
                ? (
                  <>
                    <path d={`M4.3 ${arrowY - 1.95}H14.1M11.8 ${arrowY - 3.15}L14.3 ${arrowY - 1.95}L11.8 ${arrowY - 0.75}`} />
                    <path d={`M14.2 ${arrowY + 1.65}H4.1M6.35 ${arrowY + 0.45}L3.85 ${arrowY + 1.65}L6.35 ${arrowY + 2.85}`} />
                    <line x1="2.95" y1={arrowY - 1.95} x2="4.15" y2={arrowY - 1.95} />
                    <line x1="14.2" y1={arrowY + 1.65} x2="15.3" y2={arrowY + 1.65} />
                  </>
                )
                : direction === 'bar-harpoon-lr'
                ? (
                    <>
                      <path d={`M14.2 ${arrowY - 1.95}H4.1M6.35 ${arrowY - 3.15}L3.85 ${arrowY - 1.95}L6.35 ${arrowY - 0.75}`} />
                      <path d={`M4.3 ${arrowY + 1.65}H14.1M11.8 ${arrowY + 0.45}L14.3 ${arrowY + 1.65}L11.8 ${arrowY + 2.85}`} />
                      <line x1="14.2" y1={arrowY - 1.95} x2="15.3" y2={arrowY - 1.95} />
                      <line x1="2.95" y1={arrowY + 1.65} x2="4.15" y2={arrowY + 1.65} />
                    </>
                  )
                  : direction === 'bar-arrow-rl'
                    ? (
                      <>
                        <path d={`M4.2 ${arrowY - 1.95}H14.05M11.75 ${arrowY - 3.15}L14.25 ${arrowY - 1.95}L11.75 ${arrowY - 0.75}`} />
                        <path d={`M14.15 ${arrowY + 1.65}H4.25M6.55 ${arrowY + 0.45}L4.05 ${arrowY + 1.65}L6.55 ${arrowY + 2.85}`} />
                        <line x1="4.05" y1={arrowY + 1.65} x2="14.15" y2={arrowY + 1.65} />
                      </>
                    )
                    : direction === 'bar-arrow-lr'
                      ? (
                        <>
                          <path d={`M14.15 ${arrowY - 1.95}H4.25M6.55 ${arrowY - 3.15}L4.05 ${arrowY - 1.95}L6.55 ${arrowY - 0.75}`} />
                          <path d={`M4.2 ${arrowY + 1.65}H14.05M11.75 ${arrowY + 0.45}L14.25 ${arrowY + 1.65}L11.75 ${arrowY + 2.85}`} />
                          <line x1="4.05" y1={arrowY - 1.95} x2="14.15" y2={arrowY - 1.95} />
                        </>
                      )
          : <path d={`M12.5 ${arrowY - 1.55}L15.05 ${arrowY}L12.5 ${arrowY + 1.55}M2.95 ${arrowY}H14.65`} />;

    return (
      <span className="cme-arrow-label-icon" aria-hidden="true">
        <svg
          className="cme-arrow-label-svg"
          viewBox="0 0 18 18"
          focusable="false"
          aria-hidden="true"
        >
          {topBox ? <rect {...topBox} rx="0.45" /> : null}
          {arrowGraphic}
          {bottomBox ? <rect {...bottomBox} rx="0.45" /> : null}
        </svg>
      </span>
    );
  }

  if (
    item.insert === 'matrix' ||
    item.insert === 'bmatrix' ||
    item.insert === 'pmatrix' ||
    item.insert === 'vmatrix'
  ) {
    const matrixType = item.insert;
    const cells = matrixType === 'matrix'
      ? [
          [2.3, 3.1], [7.1, 3.1], [11.9, 3.1],
          [2.3, 7.25], [7.1, 7.25], [11.9, 7.25],
          [2.3, 11.4], [7.1, 11.4], [11.9, 11.4],
        ]
      : [
          [5.3, 2.95], [10.1, 2.95],
          [5.3, 7.1], [10.1, 7.1],
          [5.3, 11.25], [10.1, 11.25],
        ];

    let frame;
    if (matrixType === 'bmatrix') {
      frame = (
        <path d="M3 1.8H1.95V15.85H3M12.95 1.8H14V15.85H12.95" />
      );
    } else if (matrixType === 'pmatrix') {
      frame = (
        <path d="M3.15 1.8C1.85 3.05 1.35 4.75 1.35 8.85C1.35 12.95 1.85 14.65 3.15 15.85M12.85 1.8C14.15 3.05 14.65 4.75 14.65 8.85C14.65 12.95 14.15 14.65 12.85 15.85" />
      );
    } else if (matrixType === 'vmatrix') {
      frame = (
        <path d="M2.6 1.9V15.75M13.4 1.9V15.75" />
      );
    }

    return (
      <span className="cme-matrix-icon" aria-hidden="true">
        <svg
          className="cme-matrix-svg"
          viewBox="0 0 16 18"
          focusable="false"
          aria-hidden="true"
        >
          {frame}
          {cells.map(([x, y], index) => (
            <rect
              key={`${matrixType}-${index}`}
              x={x}
              y={y}
              width="2.35"
              height="2.9"
              rx="0.28"
              className="cme-matrix-svg-cell"
            />
          ))}
        </svg>
      </span>
    );
  }

  const matrixTemplateLayouts = {
    '\\begin{matrix} #? & #? & #? \\end{matrix}': {
      frame: 'none',
      cells: [[2.15, 7.05], [6.85, 7.05], [11.55, 7.05]]
    },
    '\\begin{bmatrix} #? \\\\ #? \\end{bmatrix}': {
      frame: 'brackets',
      cells: [[7.05, 3.25], [7.05, 10.2]]
    },
    '\\begin{bmatrix} #? & #? \\end{bmatrix}': {
      frame: 'brackets',
      cells: [[4.85, 7.05], [9.25, 7.05]]
    },
    '\\begin{pmatrix} #? \\\\ #? \\end{pmatrix}': {
      frame: 'parentheses',
      cells: [[7.05, 3.25], [7.05, 10.2]]
    },
    '\\begin{pmatrix} #? & #? \\end{pmatrix}': {
      frame: 'parentheses',
      cells: [[4.85, 7.05], [9.25, 7.05]]
    },
    '\\begin{bmatrix} #? \\\\ #? \\\\ #? \\end{bmatrix}': {
      frame: 'brackets',
      cells: [[7.05, 1.9], [7.05, 7.05], [7.05, 12.2]]
    },
    '\\begin{pmatrix} #? \\\\ #? \\\\ #? \\end{pmatrix}': {
      frame: 'parentheses',
      cells: [[7.05, 1.9], [7.05, 7.05], [7.05, 12.2]]
    },
    '\\begin{matrix} #? \\\\ #? \\\\ #? \\end{matrix}': {
      frame: 'none',
      cells: [[7.05, 1.9], [7.05, 7.05], [7.05, 12.2]]
    }
  };
  const matrixTemplateLayout = matrixTemplateLayouts[item.insert];
  if (matrixTemplateLayout) {
    let frame;

    if (matrixTemplateLayout.frame === 'brackets') {
      frame = (
        <path d="M2.7 1.4H1.75V16.1H2.7M13.3 1.4H14.25V16.1H13.3" />
      );
    } else if (matrixTemplateLayout.frame === 'parentheses') {
      frame = (
        <path d="M3 1.4C1.95 2.7 1.55 4.65 1.55 8.75C1.55 12.85 1.95 14.8 3 16.1M13 1.4C14.05 2.7 14.45 4.65 14.45 8.75C14.45 12.85 14.05 14.8 13 16.1" />
      );
    }

    return (
      <span className="cme-matrix-template-icon" aria-hidden="true">
        <svg
          className="cme-matrix-template-svg"
          viewBox="0 0 16 18"
          focusable="false"
          aria-hidden="true"
        >
          {frame}
          {matrixTemplateLayout.cells.map(([x, y], index) => (
            <rect
              key={`matrix-template-${index}`}
              x={x}
              y={y}
              width="2.35"
              height="3"
              rx="0.28"
              className="cme-matrix-svg-cell"
            />
          ))}
        </svg>
      </span>
    );
  }

  if (item.icon === 'superscript-template' || item.icon === 'subscript-template') {
    const isSuperscript = item.icon === 'superscript-template';

    return (
      <span className="cme-script-icon" aria-hidden="true">
        <svg
          className="cme-script-svg"
          viewBox="0 0 18 18"
          focusable="false"
          aria-hidden="true"
        >
          {isSuperscript ? (
            <>
              <rect x="3" y="7" width="6" height="8" rx="0.5" />
              <rect x="10" y="3" width="5" height="7" rx="0.5" />
            </>
          ) : (
            <>
              <rect x="3" y="3" width="6" height="8" rx="0.5" />
              <rect x="10" y="8" width="5" height="7" rx="0.5" />
            </>
          )}
        </svg>
      </span>
    );
  }

  if (item.icon === 'square-root-template' || item.icon === 'nth-root-template') {
    const isNthRoot = item.icon === 'nth-root-template';

    return (
      <span className="cme-root-icon" aria-hidden="true">
        <svg
          className="cme-root-svg"
          viewBox="0 0 18 16"
          focusable="false"
          aria-hidden="true"
        >
          {isNthRoot ? (
            <rect
              x="2.1"
              y="1.8"
              width="2.6"
              height="3.4"
              rx="0.35"
              className="cme-root-svg-box cme-root-svg-box--small"
            />
          ) : null}
          <path d="M1.8 9.6H3.8L5.5 13.8L8 3.4H15.5" />
          <rect
            x="9.6"
            y="4.3"
            width="4.2"
            height="7"
            rx="0.4"
            className="cme-root-svg-box"
          />
        </svg>
      </span>
    );
  }

  if (
    item.icon === 'accent-harpoon-right' ||
    item.icon === 'accent-arrow-right' ||
    item.icon === 'accent-arrow-both' ||
    item.icon === 'accent-bar'
  ) {
    let accentGraphic;

    if (item.icon === 'accent-bar') {
      accentGraphic = <line x1="3.5" y1="4.5" x2="14.5" y2="4.5" />;
    } else if (item.icon === 'accent-arrow-both') {
      accentGraphic = <path d="M5 5.5L3.3 3.9M5 5.5L3.3 7.1M3.5 5.5H14.5M13 3.9L14.7 5.5L13 7.1" />;
    } else if (item.icon === 'accent-harpoon-right') {
      accentGraphic = <path d="M3.5 5.5H14M11.8 3.9H14.7V6.8" />;
    } else {
      accentGraphic = <path d="M3.5 5.5H14.2M11.8 3.9L14.7 5.5L11.8 7.1" />;
    }

    return (
      <span className="cme-accent-icon" aria-hidden="true">
        <svg
          className="cme-accent-svg"
          viewBox="0 0 18 18"
          focusable="false"
          aria-hidden="true"
        >
          {accentGraphic}
          <rect x="6.4" y="8.6" width="5.2" height="7" rx="0.45" className="cme-accent-svg-box" />
        </svg>
      </span>
    );
  }

  if (context.isMathMode || context.isChemMode) {
    const classNames = ['cme-toolbar-glyph'];
    const itemClassName = item.cls || '';
    const isRootsMain = context.groupId === 'roots-main';
    const isRelations = context.groupId === 'relations';
    const isGreek = context.groupId === 'greek';
    const isChemMode = Boolean(context.isChemMode);
    const labelLength = String(item.label || '').length;

    if (isChemMode) {
      const isChemScriptLabel = /^(?:[⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻⁼⁽⁾ⁿⁱ₀₁₂₃₄₅₆₇₈₉₊₋₌₍₎ₐₑₒₓᵢⱼₙ])+$/u.test(String(item.label || ''));
      classNames.push('cme-toolbar-glyph--chem');
      const isChemChargeLabel = /^(?:[+-]|[²³][⁺⁻])$/u.test(String(item.label || ''));
      if (itemClassName.includes('chem-element')) {
        classNames.push('cme-toolbar-glyph--chem-element');
      }
      if (itemClassName.includes('chem-arrow')) {
        classNames.push('cme-toolbar-glyph--chem-arrow');
      }
      if (itemClassName.includes('chem-state')) {
        classNames.push('cme-toolbar-glyph--chem-state');
      }
      if (isChemScriptLabel) {
        classNames.push('cme-toolbar-glyph--chem-script');
      }
      if (isChemChargeLabel) {
        classNames.push('cme-toolbar-glyph--chem-charge');
      }
    } else {
      if (isRootsMain) {
        classNames.push('cme-toolbar-glyph--roots-main');
      }
      if (isRelations) {
        classNames.push('cme-toolbar-glyph--relations');
      }
      if (!isRootsMain && !isRelations) {
        classNames.push('cme-toolbar-glyph--math');
      }
      if (isGreek) {
        classNames.push('cme-toolbar-glyph--greek');
      }
    }

    if (itemClassName.includes('green-template')) {
      classNames.push('cme-toolbar-glyph--template');
    }
    if (itemClassName.includes('soft-tool')) {
      classNames.push('cme-toolbar-glyph--tool');
    }
    if (itemClassName.includes('format-tool')) {
      classNames.push('cme-toolbar-glyph--format');
    }
    if (labelLength >= 4) {
      classNames.push('cme-toolbar-glyph--wide');
    }
    if (labelLength >= 8) {
      classNames.push('cme-toolbar-glyph--very-wide');
    }

    return (
      <span className={classNames.join(' ')} aria-hidden="true">
        {item.label}
      </span>
    );
  }

  return item.label;
}

function ArrowGlyphIcon({ type, size = 24 }) {
  const icons = {
    '↗': (
      <>
        <path d="M5 19L19 5" />
        <path d="M12 5H19V12" />
      </>
    ),
    '↘': (
      <>
        <path d="M5 5L19 19" />
        <path d="M12 19H19V12" />
      </>
    ),
    '↖': (
      <>
        <path d="M19 19L5 5" />
        <path d="M12 5H5V12" />
      </>
    ),
    '↙': (
      <>
        <path d="M19 5L5 19" />
        <path d="M12 19H5V12" />
      </>
    ),
    '←': (
      <>
        <path d="M20 12H6" />
        <path d="M11 7L6 12L11 17" />
      </>
    ),
    '→': (
      <>
        <path d="M4 12H18" />
        <path d="M13 7L18 12L13 17" />
      </>
    ),
    '↑': (
      <>
        <path d="M12 20V6" />
        <path d="M7 11L12 6L17 11" />
      </>
    ),
    '↓': (
      <>
        <path d="M12 4V18" />
        <path d="M7 13L12 18L17 13" />
      </>
    ),
    '↔': (
      <>
        <path d="M4 12H20" />
        <path d="M9 7L4 12L9 17" />
        <path d="M15 7L20 12L15 17" />
      </>
    ),
    '↕': (
      <>
        <path d="M12 4V20" />
        <path d="M7 9L12 4L17 9" />
        <path d="M7 15L12 20L17 15" />
      </>
    ),
    '⇐': (
      <>
        <path d="M20 10H6M20 14H6" />
        <path d="M11 6L6 12L11 18" />
      </>
    ),
    '⇒': (
      <>
        <path d="M4 10H18M4 14H18" />
        <path d="M13 6L18 12L13 18" />
      </>
    ),
    '⇑': (
      <>
        <path d="M10 20V6M14 20V6" />
        <path d="M6 11L12 5L18 11" />
      </>
    ),
    '⇓': (
      <>
        <path d="M10 4V18M14 4V18" />
        <path d="M6 13L12 19L18 13" />
      </>
    ),
    '⇔': (
      <>
        <path d="M4 10H20M4 14H20" />
        <path d="M9 6L4 12L9 18" />
        <path d="M15 6L20 12L15 18" />
      </>
    ),
    '⇕': (
      <>
        <path d="M10 4V20M14 4V20" />
        <path d="M6 9L12 3L18 9" />
        <path d="M6 15L12 21L18 15" />
      </>
    ),
    '⟵': (
      <>
        <path d="M21 12H5.5" />
        <path d="M10.8 7L5.5 12L10.8 17" />
      </>
    ),
    '⟶': (
      <>
        <path d="M3 12H18.5" />
        <path d="M13.2 7L18.5 12L13.2 17" />
      </>
    ),
    '⟷': (
      <>
        <path d="M3 12H21" />
        <path d="M8 7L3 12L8 17" />
        <path d="M16 7L21 12L16 17" />
      </>
    ),
    '⟸': (
      <>
        <path d="M21 10H5.5M21 14H5.5" />
        <path d="M10.8 6L5.5 12L10.8 18" />
      </>
    ),
    '⟹': (
      <>
        <path d="M3 10H18.5M3 14H18.5" />
        <path d="M13.2 6L18.5 12L13.2 18" />
      </>
    ),
    '⟺': (
      <>
        <path d="M3 10H21M3 14H21" />
        <path d="M8 6L3 12L8 18" />
        <path d="M16 6L21 12L16 18" />
      </>
    ),
    '↤': (
      <>
        <path d="M20 12H8" />
        <path d="M8 7L3 12L8 17" />
        <path d="M20 6V18" />
      </>
    ),
    '↦': (
      <>
        <path d="M4 12H16" />
        <path d="M16 7L21 12L16 17" />
        <path d="M4 6V18" />
      </>
    ),
  };

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {icons[type]}
    </svg>
  );
}

function ArrowPickerPopover({ position, onInsert }) {
  const left = Math.min(Math.max(position.x - 6, 8), window.innerWidth - 348);
  const top = Math.min(position.y + 2, window.innerHeight - 148);

  const renderArrowPickerItem = (item) => {
    if (item.preview === 'rightleft-short-left') {
      return (
        <svg
          width="22"
          height="18"
          viewBox="0 0 50 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <line x1="10" y1="8" x2="38" y2="8" />
          <polyline points="30,2 38,8 30,14" />
          <line x1="34" y1="16" x2="18" y2="16" />
          <polyline points="26,10 18,16 26,22" />
        </svg>
      );
    }

    if (item.preview === 'right-short-over-left-long') {
      return (
        <svg
          width="22"
          height="18"
          viewBox="0 0 50 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <line x1="14" y1="8" x2="30" y2="8" />
          <polyline points="22,2 30,8 22,14" />
          <line x1="40" y1="16" x2="12" y2="16" />
          <polyline points="20,10 12,16 20,22" />
        </svg>
      );
    }

    return (
      <span
        aria-hidden="true"
        style={{
          fontSize: '18px',
          lineHeight: 1,
          fontFamily: '"Cambria Math", "STIX Two Math", "Segoe UI Symbol", "Segoe UI", sans-serif',
          whiteSpace: 'pre-line'
        }}
      >
        {item.label}
      </span>
    );
  };

  return (
    <div
      className="cme-arrow-picker-popup"
      style={{
        position: 'fixed',
        left: `${left}px`,
        top: `${top}px`,
        zIndex: 100000,
      }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="cme-arrow-picker-grid">
        {ARROW_PICKER_ITEMS.map((item) => (
          <button
            key={`${item.insert}-${item.title || item.label}`}
            type="button"
            className="cme-arrow-picker-btn"
            title={item.title}
            onMouseDown={(e) => {
              e.preventDefault();
              onInsert(item.insert);
            }}
          >
            {renderArrowPickerItem(item)}
          </button>
        ))}
      </div>
    </div>
  );
}

function RelationMorePickerPopover({ position, items = [], onInsert }) {
  const columns = Math.max(1, Math.min(items.length, 5));
  const rows = Math.max(1, Math.ceil(items.length / columns));
  const width = (columns * 30) + ((columns - 1) * 8) + 20;
  const height = (rows * 30) + ((rows - 1) * 6) + 16;
  const left = Math.min(Math.max(position.x - 6, 8), window.innerWidth - width - 8);
  const top = Math.min(position.y + 2, window.innerHeight - height - 8);

  return (
    <div
      className="cme-arrow-picker-popup cme-relation-more-picker-popup"
      style={{
        position: 'fixed',
        left: `${left}px`,
        top: `${top}px`,
        zIndex: 100000,
      }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div
        className="cme-arrow-picker-grid"
        style={{ gridTemplateColumns: `repeat(${columns}, 30px)` }}
      >
        {items.map((item) => (
          <button
            key={`${item.insert}-${item.title || item.label}`}
            type="button"
            className={`cme-arrow-picker-btn${item.cls ? ` ${item.cls}` : ''}`}
            title={item.title || item.label}
            onMouseDown={(e) => {
              e.preventDefault();
              onInsert(item.insert);
            }}
          >
            {renderToolbarItemLabel(item, { groupId: 'relations', isMathMode: true, isChemMode: false })}
          </button>
        ))}
      </div>
    </div>
  );
}

function ArrowLabelPickerPopover({ position, onInsert }) {
  const columns = 4;
  const buttonWidth = 48;
  const buttonHeight = 34;
  const gap = 4;
  const paddingX = 16;
  const paddingY = 12;
  const rows = Math.ceil(ARROW_LABEL_PICKER_ITEMS.length / columns);
  const popupWidth = (columns * buttonWidth) + ((columns - 1) * gap) + paddingX;
  const popupHeight = (rows * buttonHeight) + ((rows - 1) * gap) + paddingY;
  const left = Math.min(
    Math.max(position.x - 8, 8),
    Math.max(8, window.innerWidth - popupWidth - 8)
  );
  const top = Math.min(
    position.y + 2,
    Math.max(8, window.innerHeight - popupHeight - 8)
  );

  return (
    <div
      className="cme-arrow-label-picker-popup"
      style={{
        position: 'fixed',
        left: `${left}px`,
        top: `${top}px`,
        zIndex: 100000,
      }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div
        className="cme-arrow-label-picker-grid"
        style={{ gridTemplateColumns: `repeat(${columns}, ${buttonWidth}px)` }}
      >
        {ARROW_LABEL_PICKER_ITEMS.map((item) => (
          <button
            key={`${item.icon}-${item.title}`}
            type="button"
            className="cme-arrow-label-picker-btn"
            title={item.title}
            onMouseDown={(e) => {
              e.preventDefault();
              onInsert(item.insert);
            }}
          >
            {renderToolbarItemLabel(item, { groupId: 'arrows', isMathMode: true, isChemMode: false })}
          </button>
        ))}
      </div>
    </div>
  );
}

function GreekItalicPickerPopover({ position, onInsert }) {
  const left = Math.min(Math.max(position.x - 8, 8), window.innerWidth - 356);
  const top = Math.min(position.y + 2, window.innerHeight - 148);

  return (
    <div
      className="cme-greek-italic-picker-popup"
      style={{
        position: 'fixed',
        left: `${left}px`,
        top: `${top}px`,
        zIndex: 100000,
      }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="cme-greek-italic-picker-grid">
        {GREEK_ITALIC_UPPERCASE_ITEMS.map((item) => (
          <button
            key={item.label}
            type="button"
            className="cme-greek-italic-picker-btn"
            title={item.title}
            onMouseDown={(e) => {
              e.preventDefault();
              onInsert(item.insert);
            }}
          >
            <span className="cme-greek-italic-picker-glyph" aria-hidden="true">
              {item.label}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function BlackboardBoldPickerPopover({ position, onInsert }) {
  const left = Math.min(Math.max(position.x - 8, 8), window.innerWidth - 356);
  const top = Math.min(position.y + 2, window.innerHeight - 308);

  return (
    <div
      className="cme-blackboard-bold-picker-popup"
      style={{
        position: 'fixed',
        left: `${left}px`,
        top: `${top}px`,
        zIndex: 100000,
      }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="cme-blackboard-bold-picker-grid">
        {BLACKBOARD_BOLD_PICKER_ITEMS.map((item) => (
          <button
            key={item.insert}
            type="button"
            className="cme-blackboard-bold-picker-btn"
            title={item.title}
            onMouseDown={(e) => {
              e.preventDefault();
              onInsert(item.insert);
            }}
          >
            <span className="cme-blackboard-bold-picker-glyph" aria-hidden="true">
              {item.label}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function FrakturScriptPickerPopover({ position, onInsert }) {
  const left = Math.min(Math.max(position.x - 8, 8), window.innerWidth - 356);
  const top = Math.min(position.y + 2, window.innerHeight - 348);

  return (
    <div
      className="cme-fraktur-script-picker-popup"
      style={{
        position: 'fixed',
        left: `${left}px`,
        top: `${top}px`,
        zIndex: 100000,
      }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="cme-fraktur-script-picker-grid">
        {FRAKTUR_SCRIPT_PICKER_ITEMS.map((item) => (
          <button
            key={item.insert}
            type="button"
            className="cme-fraktur-script-picker-btn"
            title={item.title}
            onMouseDown={(e) => {
              e.preventDefault();
              onInsert(item.insert);
            }}
          >
            <span className="cme-fraktur-script-picker-glyph" aria-hidden="true">
              {item.label}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function HebrewSymbolPickerPopover({ position, onInsert }) {
  const left = Math.min(Math.max(position.x - 8, 8), window.innerWidth - 248);
  const top = Math.min(position.y + 2, window.innerHeight - 88);

  return (
    <div
      className="cme-hebrew-symbol-picker-popup"
      style={{
        position: 'fixed',
        left: `${left}px`,
        top: `${top}px`,
        zIndex: 100000,
      }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="cme-hebrew-symbol-picker-grid">
        {HEBREW_SYMBOL_PICKER_ITEMS.map((item) => (
          <button
            key={item.insert}
            type="button"
            className="cme-hebrew-symbol-picker-btn"
            title={item.title}
            onMouseDown={(e) => {
              e.preventDefault();
              onInsert(item.insert);
            }}
          >
            <span className="cme-hebrew-symbol-picker-glyph" aria-hidden="true">
              {item.label}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function PeriodicTablePickerPopover({ position, onInsert }) {
  const left = Math.min(Math.max(position.x - 8, 8), window.innerWidth - (PERIODIC_TABLE_WIDTH + 20));
  const top = Math.min(position.y + 2, window.innerHeight - (PERIODIC_TABLE_HEIGHT + 18));
  const connectorX = ((3 - 1) * PERIODIC_TABLE_PITCH) + Math.floor(PERIODIC_TABLE_CELL_SIZE / 2);
  const connectorStartY = ((6 - 1) * PERIODIC_TABLE_PITCH) + Math.floor(PERIODIC_TABLE_CELL_SIZE / 2);
  const lanthanideY = ((8 - 1) * PERIODIC_TABLE_PITCH) + Math.floor(PERIODIC_TABLE_CELL_SIZE / 2);
  const actinideY = ((9 - 1) * PERIODIC_TABLE_PITCH) + Math.floor(PERIODIC_TABLE_CELL_SIZE / 2);
  const seriesStartX = ((4 - 1) * PERIODIC_TABLE_PITCH);

  return (
    <div
      className="cme-periodic-table-picker-popup"
      style={{
        position: 'fixed',
        left: `${left}px`,
        top: `${top}px`,
        zIndex: 100000,
      }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div
        className="cme-periodic-table-board"
        style={{
          width: `${PERIODIC_TABLE_WIDTH}px`,
          height: `${PERIODIC_TABLE_HEIGHT}px`,
        }}
      >
        <div
          className="cme-periodic-table-connector cme-periodic-table-connector--vertical"
          style={{
            left: `${connectorX}px`,
            top: `${connectorStartY}px`,
            height: `${actinideY - connectorStartY}px`,
          }}
        />
        <div
          className="cme-periodic-table-connector cme-periodic-table-connector--horizontal"
          style={{
            left: `${connectorX}px`,
            top: `${lanthanideY}px`,
            width: `${seriesStartX - connectorX}px`,
          }}
        />
        <div
          className="cme-periodic-table-connector cme-periodic-table-connector--horizontal"
          style={{
            left: `${connectorX}px`,
            top: `${actinideY}px`,
            width: `${seriesStartX - connectorX}px`,
          }}
        />

        {PERIODIC_TABLE_PICKER_ITEMS.map((item) => (
          <button
            key={`${item.label}-${item.row}-${item.col}`}
            type="button"
            className={`cme-periodic-table-cell cme-periodic-table-cell--${item.tone}`}
            title={item.title}
            style={{
              left: `${(item.col - 1) * PERIODIC_TABLE_PITCH}px`,
              top: `${(item.row - 1) * PERIODIC_TABLE_PITCH}px`,
              width: `${PERIODIC_TABLE_CELL_SIZE}px`,
              height: `${PERIODIC_TABLE_CELL_SIZE}px`,
            }}
            onMouseDown={(e) => {
              e.preventDefault();
              onInsert(item.insert);
            }}
          >
            {item.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function StyleDropdownPopover({ position, options, value, onSelect, width = 132 }) {
  const left = Math.min(Math.max(position.x, 8), window.innerWidth - width - 8);
  const top = Math.max(8, Math.min(position.y + 4, window.innerHeight - 290));

  return (
    <div
      className="cme-style-dropdown-popup"
      style={{
        position: 'fixed',
        left: `${left}px`,
        top: `${top}px`,
        width: `${width}px`,
        zIndex: 100000,
      }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className={`cme-style-dropdown-option${value === option.value ? ' active' : ''}`}
          onMouseDown={(e) => {
            e.preventDefault();
            onSelect(option.value);
          }}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function makeToolbarPlugin(onOpenPopup) {
  return class MathChemToolbarPlugin extends Plugin {
    init() {
      const editor = this.editor;

      editor.ui.componentFactory.add('mathType', () => {
        const btn = new ButtonView();
        btn.set({ label: 'Math', icon: MATH_ICON_SVG, tooltip: 'Insert Math Formula' });
        btn.on('execute', () => onOpenPopup('math'));
        return btn;
      });

      editor.ui.componentFactory.add('chemType', () => {
        const btn = new ButtonView();
        btn.set({ label: 'Chemistry', icon: CHEM_ICON_SVG, tooltip: 'Insert Chemistry Formula' });
        btn.on('execute', () => onOpenPopup('chem'));
        return btn;
      });
    }
  };
}

/* ══════════════════════════════════════════════════════════
   MathChemPopup — same as CustomMathEditor popup
══════════════════════════════════════════════════════════ */
function MatrixHoverGrid({ matrixType, x, y, onSelect, onMouseEnter, onMouseLeave }) {
  const [hoverGrid, setHoverGrid] = useState({ r: 2, c: 2 });
  const labelMap = {
    matrix: 'Plain Matrix',
    bmatrix: 'Square Matrix',
    pmatrix: 'Parenthesis Matrix',
    vmatrix: 'Vertical Matrix'
  };
  const updateGridValue = useCallback((key, nextValue) => {
    const parsedValue = Number.parseInt(nextValue, 10);
    if (Number.isNaN(parsedValue)) return;
    setHoverGrid((prev) => ({
      ...prev,
      [key]: Math.min(20, Math.max(1, parsedValue)),
    }));
  }, []);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        onSelect(hoverGrid.r, hoverGrid.c);
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [hoverGrid.r, hoverGrid.c, onSelect]);

  return (
    <div
      className="cme-matrix-hover-popover ck-only"
      style={{ top: `${y}px`, left: `${x}px` }}
      onMouseDown={(e) => e.stopPropagation()}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <div className="cme-matrix-hover-title-wrap">
        <div className="cme-matrix-hover-title">{labelMap[matrixType] || 'Matrix'}</div>
        <div className="cme-matrix-hover-subtitle">{hoverGrid.r} × {hoverGrid.c}</div>
      </div>
      <div className="cme-matrix-hover-grid">
        {Array.from({ length: 6 }).map((_, rIndex) => (
          <div key={rIndex} className="cme-matrix-hover-row">
            {Array.from({ length: 6 }).map((_, cIndex) => {
              const isSelected = rIndex < hoverGrid.r && cIndex < hoverGrid.c;
              return (
                <div
                  key={`${rIndex}-${cIndex}`}
                  className={`cme-matrix-hover-cell${isSelected ? ' selected' : ''}`}
                  onMouseEnter={() => setHoverGrid({ r: rIndex + 1, c: cIndex + 1 })}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onSelect(rIndex + 1, cIndex + 1);
                  }}
                />
              );
            })}
          </div>
        ))}
      </div>
      <div className="cme-matrix-hover-footer">
        <div className="cme-matrix-counter">
          <span className="cme-counter-label">R</span>
          <input
            type="number"
            min="1"
            max="20"
            value={hoverGrid.r}
            className="cme-counter-input"
            onChange={(e) => updateGridValue('r', e.target.value)}
            onMouseDown={(e) => e.stopPropagation()}
          />
          <div className="cme-counter-btns">
            <button type="button" onClick={() => setHoverGrid(prev => ({ ...prev, r: Math.min(20, prev.r + 1) }))}>+</button>
            <button type="button" onClick={() => setHoverGrid(prev => ({ ...prev, r: Math.max(1, prev.r - 1) }))}>-</button>
          </div>
        </div>
        <div className="cme-matrix-counter">
          <span className="cme-counter-label">C</span>
          <input
            type="number"
            min="1"
            max="20"
            value={hoverGrid.c}
            className="cme-counter-input"
            onChange={(e) => updateGridValue('c', e.target.value)}
            onMouseDown={(e) => e.stopPropagation()}
          />
          <div className="cme-counter-btns">
            <button type="button" onClick={() => setHoverGrid(prev => ({ ...prev, c: Math.min(20, prev.c + 1) }))}>+</button>
            <button type="button" onClick={() => setHoverGrid(prev => ({ ...prev, c: Math.max(1, prev.c - 1) }))}>-</button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   MathChemPopup — same as CustomMathEditor popup
   ══════════════════════════════════════════════════════════ */
function MathChemPopup({ mode, onInsert, onClose, initialLatex, initialDirection = 'ltr', isEditing }) {
  const popupMfRef = useRef(null);
  const popupRef = useRef(null);
  const popupPositionRef = useRef(null);
  const dragStateRef = useRef(null);
  const removeDragListenersRef = useRef(() => {});
  const [activeGroup, setActiveGroup] = useState(0);
  const [activeMatrix, setActiveMatrix] = useState(null); // { type, x, y }
  const [showSpecialChars, setShowSpecialChars] = useState(null); // { x, y } or null
  const [showArrowPicker, setShowArrowPicker] = useState(null); // { x, y } or null
  const [showRelationMorePicker, setShowRelationMorePicker] = useState(null); // { x, y, picker } or null
  const [showArrowLabelPicker, setShowArrowLabelPicker] = useState(null); // { x, y } or null
  const [showGreekItalicPicker, setShowGreekItalicPicker] = useState(null); // { x, y } or null
  const [showBlackboardBoldPicker, setShowBlackboardBoldPicker] = useState(null); // { x, y } or null
  const [showFrakturScriptPicker, setShowFrakturScriptPicker] = useState(null); // { x, y } or null
  const [showHebrewSymbolPicker, setShowHebrewSymbolPicker] = useState(null); // { x, y } or null
  const [showPeriodicTablePicker, setShowPeriodicTablePicker] = useState(null); // { x, y } or null
  const [showColorPicker, setShowColorPicker] = useState(null); // { x, y } or null
  const [showStyleDropdown, setShowStyleDropdown] = useState(null); // { x, y, type, buttonKey } or null
  const [windowMode, setWindowMode] = useState('normal');
  const [popupPosition, setPopupPosition] = useState(null);
  const [isRtlInput, setIsRtlInput] = useState(initialDirection === 'rtl');
  const [customColorInput, setCustomColorInput] = useState('');
  const [customColorError, setCustomColorError] = useState('');
  const groups = mode === 'math' ? ORDERED_MATH_GROUPS : CHEM_GROUPS;
  const isMathMode = mode === 'math';
  const activeGroupConfig = groups[activeGroup] || {};
  const colorSwatches = useMemo(
    () => COLOR_SWATCHES.map((swatch) => ({
      ...swatch,
      normalized: normalizeCssColor(swatch.value) || swatch.value.toLowerCase(),
    })),
    []
  );

  const [activeStyles, setActiveStyles] = useState({
    bold: false,
    italic: false,
    boldItalic: false,
    color: 'none',
    fontOption: '',
    fontSize: 'auto'
  });
  const [numeralMode, setNumeralMode] = useState('western'); // western | arabicIndic | easternArabicIndic
  const [spacingMode, setSpacingMode] = useState('thin'); // thin | negativeThin

  const clampPopupPosition = useCallback((nextX, nextY) => {
    const popupEl = popupRef.current;
    const width = popupEl?.offsetWidth || 720;
    const height = popupEl?.offsetHeight || 384;
    const maxX = Math.max(12, window.innerWidth - width - 12);
    const maxY = Math.max(12, window.innerHeight - height - 12);

    return {
      x: Math.min(Math.max(12, nextX), maxX),
      y: Math.min(Math.max(12, nextY), maxY),
    };
  }, []);

  const stopDragging = useCallback(() => {
    removeDragListenersRef.current();
    removeDragListenersRef.current = () => {};
    dragStateRef.current = null;
  }, []);

  useEffect(() => () => stopDragging(), [stopDragging]);

  useEffect(() => {
    popupPositionRef.current = popupPosition;
  }, [popupPosition]);

  useEffect(() => {
    if (windowMode === 'maximized') return;

    const syncPopupPosition = () => {
      const popupEl = popupRef.current;
      if (!popupEl) return;

      const current = popupPositionRef.current;
      if (current) {
        const clamped = clampPopupPosition(current.x, current.y);
        popupPositionRef.current = clamped;
        setPopupPosition(clamped);
        return;
      }

      const rect = popupEl.getBoundingClientRect();
      const next = clampPopupPosition(
        window.innerWidth - rect.width - 24,
        window.innerHeight - rect.height - 24,
      );
      popupPositionRef.current = next;
      setPopupPosition(next);
    };

    const frameId = requestAnimationFrame(syncPopupPosition);
    return () => cancelAnimationFrame(frameId);
  }, [clampPopupPosition, windowMode]);

  useEffect(() => {
    if (windowMode === 'maximized') return;

    const handleResize = () => {
      const current = popupPositionRef.current;
      if (!current) return;
      const clamped = clampPopupPosition(current.x, current.y);
      popupPositionRef.current = clamped;
      setPopupPosition(clamped);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [clampPopupPosition, windowMode]);

  const handlePopupDragStart = useCallback((event) => {
    if (windowMode === 'maximized') return;
    if (event.button !== undefined && event.button !== 0) return;
    if (event.target.closest('.cme-popup-actions')) return;

    const popupEl = popupRef.current;
    if (!popupEl) return;

    event.preventDefault();

    const rect = popupEl.getBoundingClientRect();
    const startPosition = popupPositionRef.current || { x: rect.left, y: rect.top };
    popupPositionRef.current = startPosition;
    setPopupPosition(startPosition);

    dragStateRef.current = {
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
    };

    const handlePointerMove = (moveEvent) => {
      if (!dragStateRef.current) return;
      moveEvent.preventDefault();

      const next = clampPopupPosition(
        moveEvent.clientX - dragStateRef.current.offsetX,
        moveEvent.clientY - dragStateRef.current.offsetY,
      );

      popupPositionRef.current = next;
      setPopupPosition(next);
    };

    const handlePointerUp = () => stopDragging();

    removeDragListenersRef.current = () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
  }, [clampPopupPosition, stopDragging, windowMode]);


  useEffect(() => {
    setIsRtlInput(initialDirection === 'rtl');
  }, [initialDirection]);

  useEffect(() => {
    const mf = popupMfRef.current;
    if (!mf) return;

    const nextDir = isRtlInput ? 'rtl' : 'ltr';
    mf.setAttribute('dir', nextDir);
    mf.style.direction = nextDir;
    mf.style.textAlign = isRtlInput ? 'right' : 'left';
    mf.style.unicodeBidi = isRtlInput ? 'plaintext' : 'normal';
  }, [isRtlInput]);

  const updateActiveStyles = useCallback(() => {
    const mf = popupMfRef.current;
    if (!mf || typeof mf.queryStyle !== 'function') return;
    try {
      const boldItalic = mf.queryStyle({ variantStyle: 'bolditalic' }) === 'all';
      const bold = (
        boldItalic ||
        mf.queryStyle({ fontSeries: 'b' }) === 'all' ||
        mf.queryStyle({ variantStyle: 'bold' }) === 'all'
      );
      const italic = (
        boldItalic ||
        mf.queryStyle({ fontShape: 'it' }) === 'all' ||
        mf.queryStyle({ variantStyle: 'italic' }) === 'all'
      );

      const currentFontOption = FONT_OPTIONS.find(({ style }) =>
        Object.entries(style).every(([key, value]) => mf.queryStyle({ [key]: value }) === 'all')
      ) || null;

      const currentSize = FONT_SIZE_OPTIONS.find(
        ({ value }) => mf.queryStyle({ fontSize: parseInt(value, 10) }) === 'all'
      )?.value || 'auto';

      const customCandidate = normalizeCssColor(customColorInput);
      const colorCandidates = [
        ...new Set(
          colorSwatches
            .flatMap((swatch) => [swatch.normalized, swatch.value])
            .concat(activeStyles.color !== 'none' ? [activeStyles.color] : [])
            .concat(customCandidate ? [customCandidate, customColorInput.trim()] : [])
            .filter(Boolean)
        ),
      ];
      const currentColorMatch = colorCandidates.find(
        (candidate) => mf.queryStyle({ color: candidate }) === 'all'
      );
      const currentColor = currentColorMatch ? normalizeCssColor(currentColorMatch) || currentColorMatch : 'none';

      setActiveStyles({
        bold,
        italic,
        boldItalic,
        fontOption: currentFontOption?.value || '',
        fontSize: String(currentSize),
        color: currentColor,
      });
    } catch (e) {
      console.warn("Failed to query active styles:", e);
    }
  }, [activeStyles.color, colorSwatches, customColorInput]);

  const applyCurrentTypingStyles = useCallback((styleState) => {
    const mf = popupMfRef.current;
    if (!mf || typeof mf.applyStyle !== 'function') return;

    const nextBold = Boolean(styleState.bold);
    const nextItalic = Boolean(styleState.italic);
    const nextVariantStyle = nextBold && nextItalic
      ? 'bolditalic'
      : nextBold
        ? 'bold'
        : nextItalic
          ? 'italic'
          : 'up';

    mf.applyStyle({
      variantStyle: nextVariantStyle,
      fontSeries: nextBold ? 'b' : 'm',
      fontShape: nextItalic ? 'it' : 'n',
    });

    mf.applyStyle({ color: styleState.color === 'none' ? 'none' : styleState.color });
    mf.applyStyle(DEFAULT_FONT_STYLE);
    const selectedFontOption = FONT_OPTIONS.find(({ value }) => value === styleState.fontOption);
    if (selectedFontOption) {
      mf.applyStyle(selectedFontOption.style);
    }
    if (styleState.fontSize !== 'auto') {
      const fontSize = parseInt(styleState.fontSize, 10);
      mf.applyStyle({ fontSize, size: fontSize });
    }
  }, []);

  const setTypingVariant = useCallback((nextBold, nextItalic) => {
    const mf = popupMfRef.current;
    if (!mf) return;

    mf.focus();
    applyCurrentTypingStyles({
      ...activeStyles,
      bold: nextBold,
      italic: nextItalic,
      boldItalic: nextBold && nextItalic,
    });
    requestAnimationFrame(updateActiveStyles);
  }, [activeStyles, applyCurrentTypingStyles, updateActiveStyles]);

  const applyTextColor = useCallback((value) => {
    const mf = popupMfRef.current;
    if (!mf || typeof mf.applyStyle !== 'function') return false;

    const normalized = value === 'none' ? 'none' : normalizeCssColor(value);
    if (value !== 'none' && !normalized) {
      setCustomColorError('Enter a valid hex code or CSS color name.');
      return false;
    }

    const nextColor = value === 'none' ? 'none' : normalized;
    mf.focus();
    mf.applyStyle({ color: nextColor });
    setActiveStyles((prev) => ({ ...prev, color: nextColor }));
    setCustomColorInput(nextColor === 'none' ? '' : nextColor);
    setCustomColorError('');
    requestAnimationFrame(updateActiveStyles);
    return true;
  }, [updateActiveStyles]);

  const applyStyleDropdownValue = useCallback((type, value) => {
    const mf = popupMfRef.current;
    if (!mf || typeof mf.applyStyle !== 'function') return;

    mf.focus();
    if (type === 'font') {
      mf.applyStyle(DEFAULT_FONT_STYLE);
      const selectedFontOption = FONT_OPTIONS.find((option) => option.value === value);
      if (selectedFontOption) {
        mf.applyStyle(selectedFontOption.style);
      }
      setActiveStyles((prev) => ({ ...prev, fontOption: value }));
    } else {
      const fontSize = value ? parseInt(value, 10) : 'auto';
      mf.applyStyle({ fontSize, size: fontSize });
      setActiveStyles((prev) => ({ ...prev, fontSize: value || 'auto' }));
    }

    requestAnimationFrame(updateActiveStyles);
  }, [updateActiveStyles]);


  useEffect(() => {
    if (!activeMatrix && !showColorPicker && !showStyleDropdown && !showArrowPicker && !showRelationMorePicker && !showArrowLabelPicker && !showGreekItalicPicker && !showBlackboardBoldPicker && !showFrakturScriptPicker && !showHebrewSymbolPicker && !showPeriodicTablePicker) return;
    const handleOutsideClick = (e) => {
      if (!e.target.closest('.cme-matrix-hover-popover') && !e.target.closest('.cme-matrix-btn-wrapper')) {
        setActiveMatrix(null);
      }
      if (!e.target.closest('.cme-color-picker-popup') && !e.target.closest('[title="Text Color"]')) {
        setShowColorPicker(null);
      }
      if (!e.target.closest('.cme-style-dropdown-popup') && !e.target.closest('.cme-style-select-trigger')) {
        setShowStyleDropdown(null);
      }
      if (!e.target.closest('.cme-arrow-picker-popup') && !e.target.closest('.arrow-picker-tool')) {
        setShowArrowPicker(null);
      }
      if (!e.target.closest('.cme-relation-more-picker-popup') && !e.target.closest('.relation-more-picker-tool')) {
        setShowRelationMorePicker(null);
      }
      if (!e.target.closest('.cme-arrow-label-picker-popup') && !e.target.closest('.arrow-label-picker-tool')) {
        setShowArrowLabelPicker(null);
      }
      if (!e.target.closest('.cme-greek-italic-picker-popup') && !e.target.closest('.greek-italic-picker-tool')) {
        setShowGreekItalicPicker(null);
      }
      if (!e.target.closest('.cme-blackboard-bold-picker-popup') && !e.target.closest('.blackboard-bold-picker-tool')) {
        setShowBlackboardBoldPicker(null);
      }
      if (!e.target.closest('.cme-fraktur-script-picker-popup') && !e.target.closest('.fraktur-script-picker-tool')) {
        setShowFrakturScriptPicker(null);
      }
      if (!e.target.closest('.cme-hebrew-symbol-picker-popup') && !e.target.closest('.hebrew-symbol-picker-tool')) {
        setShowHebrewSymbolPicker(null);
      }
      if (!e.target.closest('.cme-periodic-table-picker-popup') && !e.target.closest('.periodic-table-picker-tool')) {
        setShowPeriodicTablePicker(null);
      }
    };
    window.addEventListener('mousedown', handleOutsideClick, true);
    window.addEventListener('pointerdown', handleOutsideClick, true);
    return () => {
      window.removeEventListener('mousedown', handleOutsideClick, true);
      window.removeEventListener('pointerdown', handleOutsideClick, true);
    };
  }, [activeMatrix, showColorPicker, showStyleDropdown, showArrowPicker, showRelationMorePicker, showArrowLabelPicker, showGreekItalicPicker, showBlackboardBoldPicker, showFrakturScriptPicker, showHebrewSymbolPicker, showPeriodicTablePicker]);

  useEffect(() => {
    const mf = popupMfRef.current;
    if (!mf) return;
    mf.defaultMode = mode === 'chem' ? 'text' : 'math';
    mf.letterShapeStyle = 'upright';

    // Pre-fill with existing value when editing
    const prefill = () => {
      // Keep the popup content in sync when switching between different widgets
      // while the editor stays open.
      let valueToSet = initialLatex || '';
      if (mode === 'chem' && valueToSet) {
        const ceMatch = valueToSet.match(/^\\ce\{([\s\S]*)\}$/);
        if (ceMatch) valueToSet = ceMatch[1];
      }
      if (mf.setValue) mf.setValue(valueToSet, { silenceNotifications: true });
      else mf.value = valueToSet;
      requestAnimationFrame(() => mf.focus());
    };

    if (customElements.get('math-field')) {
      requestAnimationFrame(prefill);
    } else {
      customElements.whenDefined('math-field').then(() => requestAnimationFrame(prefill));
    }
  }, [mode, initialLatex]);

  useEffect(() => {
    const mf = popupMfRef.current;
    if (!mf) return;

    const readValue = () => (mf.getValue ? mf.getValue() : mf.value || '');
    const moveCaretToStart = () => {
      try {
        if (typeof mf.executeCommand === 'function') {
          const commands = ['moveToMathFieldStart', 'moveToMathfieldStart', 'moveToStart'];
          for (const command of commands) {
            try {
              mf.executeCommand(command);
              return;
            } catch {}
          }
        }
      } catch {}

      try {
        if (typeof mf.setSelectionRange === 'function') {
          mf.setSelectionRange(0, 0);
        }
      } catch {}
    };

    const writeValue = (nextValue) => {
      if (typeof mf.setValue === 'function') {
        mf.setValue(nextValue);
      } else {
        mf.value = nextValue;
      }
      requestAnimationFrame(() => {
        mf.focus?.();
        moveCaretToStart();
        updateActiveStyles();
      });
    };

    const handleKeyDown = (e) => {
      const isPlainTypingKey =
        e.key.length === 1 &&
        e.key !== ' ' &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey;
      const isPlainDigitKey =
        /^\d$/.test(e.key) &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey;

      if (spacingMode === 'negativeThin' && isPlainTypingKey) {
        e.preventDefault();
        const typedValue =
          numeralMode !== 'western' && isPlainDigitKey
            ? convertDigitsToNumeralSystem(e.key, numeralMode)
            : e.key;

        if (isRtlInput) {
          writeValue(`\\!${typedValue}${readValue()}`);
        } else {
          mf.executeCommand(['insert', `\\!${typedValue}`]);
        }
        return;
      }

      if (numeralMode !== 'western' && isPlainDigitKey) {
        e.preventDefault();
        const localizedDigit = convertDigitsToNumeralSystem(e.key, numeralMode);
        if (isRtlInput) {
          writeValue(`${localizedDigit}${readValue()}`);
        } else {
          mf.executeCommand(['insert', localizedDigit]);
        }
        return;
      }

      if (e.key === ' ') {
        e.preventDefault();
        const spacingInsert = spacingMode === 'negativeThin' ? '\\!' : '\\, ';
        if (isRtlInput) {
          writeValue(`${spacingInsert}${readValue()}`);
        } else {
          mf.executeCommand(['insert', spacingInsert]);
        }
        return;
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (isRtlInput) {
          writeValue(`\\\\${readValue()}`);
        } else {
          mf.executeCommand(['insert', '\\\\']);
        }
        // Re-apply active styles on new line
        setTimeout(() => {
          applyCurrentTypingStyles(activeStyles);
          updateActiveStyles();
        }, 10);
        return;
      }

      if (isRtlInput && e.key === 'Backspace') {
        e.preventDefault();
        writeValue(readValue().slice(1));
        return;
      }

      if (isRtlInput && isPlainTypingKey) {
        e.preventDefault();
        writeValue(`${e.key}${readValue()}`);
      }
    };
    mf.addEventListener('keydown', handleKeyDown);
    return () => mf.removeEventListener('keydown', handleKeyDown);
  }, [mode, activeStyles, applyCurrentTypingStyles, updateActiveStyles, isRtlInput, numeralMode, spacingMode]);



  /* ── Auto-scroll caret into view ── */
  useEffect(() => {
    const popupMf = popupMfRef.current;
    if (!popupMf) return;

    const handleSelectionChange = () => {
      // Small timeout to let MathLive update the DOM caret position first
      setTimeout(() => {
        const shadow = popupMf.shadowRoot;
        if (!shadow) return;
        const caret = shadow.querySelector('.ML__caret') || shadow.querySelector('[class*="caret"]');
        if (caret) {
          caret.scrollIntoView({ behavior: 'auto', block: 'nearest', inline: 'nearest' });
        }
        updateActiveStyles();
      }, 0);
    };

    popupMf.addEventListener('selection-change', handleSelectionChange);
    popupMf.addEventListener('input', handleSelectionChange);
    popupMf.addEventListener('keydown', handleSelectionChange);

    // Initial check
    setTimeout(updateActiveStyles, 50);

    return () => {
      popupMf.removeEventListener('selection-change', handleSelectionChange);
      popupMf.removeEventListener('input', handleSelectionChange);
      popupMf.removeEventListener('keydown', handleSelectionChange);
    };
  }, [updateActiveStyles]);

  const insertAtCursor = useCallback((sym) => {
    const mf = popupMfRef.current;
    if (!mf) return;
    mf.focus();
    mf.executeCommand(['insert', sym]);
  }, []);

  const insertSpacingToolAtCursor = useCallback((sym) => {
    const mf = popupMfRef.current;
    if (!mf) return;

    mf.focus();

    if (sym === '\\hphantom{0}') {
      mf.executeCommand(['insert', '\\hphantom{0}']);
      return;
    }

    if (sym === '\\,') {
      setSpacingMode('thin');
      mf.executeCommand(['insert', '\\,']);
      return;
    }

    if (sym === '\\!') {
      setSpacingMode('negativeThin');
      mf.executeCommand(['insert', '\\!']);
    }
  }, []);

  const applyMoveTextAction = useCallback((direction) => {
    const mf = popupMfRef.current;
    const template = MOVE_TEXT_TEMPLATE_MAP[direction];
    if (!mf || !template) return;

    mf.focus();

    if (mf.selectionIsCollapsed) {
      return;
    }

    if (typeof mf.insert === 'function') {
      mf.insert(template.selection, {
        insertionMode: 'replaceSelection',
        selectionMode: 'after',
      });
      return;
    }

    mf.executeCommand(['insert', template.selection]);
  }, []);

  const handleMatrixInsert = useCallback((type, rows, cols) => {
    let latex = `\\begin{${type}} `;
    for (let i = 0; i < rows; i++) {
      for (let j = 0; j < cols; j++) {
        latex += '#?';
        if (j < cols - 1) latex += ' & ';
      }
      if (i < rows - 1) latex += ' \\\\ ';
    }
    latex += ` \\end{${type}}`;
    insertAtCursor(latex);
  }, [insertAtCursor]);

  const handleInsert = () => {
    const mf = popupMfRef.current;
    if (!mf) return;
    let latex = mf.getValue ? mf.getValue() : mf.value;
    if (!latex || latex.trim() === '') {
      onClose();
      return;
    }
    if (mode === 'chem') latex = serializeChemValue(latex);
    onInsert(latex, { direction: isRtlInput ? 'rtl' : 'ltr' });
    if (mf.setValue) mf.setValue(''); else mf.value = '';
    onClose();
  };

  const popupStyle =
    windowMode !== 'maximized' && popupPosition
      ? {
          left: `${popupPosition.x}px`,
          top: `${popupPosition.y}px`,
          right: 'auto',
          bottom: 'auto',
        }
      : undefined;

  return (
    <div ref={popupRef} className={`cme-editor-popup ${windowMode}`} style={popupStyle} onMouseDown={(e) => e.stopPropagation()}>
      <div className="cme-popup-header" onPointerDown={handlePopupDragStart}>
        <span>{mode === 'math' ? 'MathType' : 'ChemType'}</span>
        <div className="cme-popup-actions" onPointerDown={(e) => e.stopPropagation()}>
          <button
            type="button"
            className="cme-popup-window-btn"
            aria-label={windowMode === 'minimized' ? 'Restore window' : 'Minimize window'}
            onClick={() => setWindowMode((current) => (current === 'minimized' ? 'normal' : 'minimized'))}
          >
            {windowMode === 'minimized' ? '+' : '-'}
          </button>
          <button
            type="button"
            className="cme-popup-window-btn"
            aria-label={windowMode === 'maximized' ? 'Restore window' : 'Maximize window'}
            onClick={() => setWindowMode((current) => (current === 'maximized' ? 'normal' : 'maximized'))}
          >
            {windowMode === 'maximized' ? 'o' : '[]'}
          </button>
          <button
            type="button"
            className="cme-popup-close"
            onClick={() => {
              stopDragging();
              onClose();
            }}
          >
            x
          </button>
        </div>
      </div>

      <div className="cme-toolbar" role="toolbar" aria-label="Symbol palette">
        <div className="cme-toolbar-groups">
          {groups.map((group, index) => (
            <button
              key={group.id || index}
              className={`cme-group-tab${activeGroup === index ? ' active' : ''}`}
              type="button"
              onClick={() => {
                setActiveGroup(index);
                setActiveMatrix(null);
              }}
            >
              {group.label}
            </button>
          ))}
        </div>

        <div className={`cme-toolbar-items${activeGroup === 0 && isMathMode ? ' cme-toolbar-items--first-tab' : ''}${activeGroupConfig.id === 'greek' ? ' cme-toolbar-items--greek' : ''}${activeGroupConfig.id === 'relations' ? ' cme-toolbar-items--relations' : ''}${isMathMode ? ' cme-toolbar-items--math-compact' : ''}`}>
          {(() => {
            const activeItems = activeGroupConfig.items || [];

            if (activeGroupConfig.id === 'greek') {
              const groupedGreekItems = activeItems.reduce((acc, item) => {
                const category = item.category || 'Greek Letters';
                if (!acc[category]) acc[category] = [];
                acc[category].push(item);
                return acc;
              }, {});
              const greekLayouts = {
                'Lowercase Greek Letters': 10,
                'Uppercase Greek Letters': 2,
                'Fraktur / Gothic Symbols': 2,
                'Hebrew Mathematical Symbols': 1,
                'Arabic-Indic Numerals': 1,
                'Eastern Arabic-Indic Numerals': 1,
                'Blackboard Bold / Number Sets': 2,
              };

              return (
                <div className="cme-greek-panel">
                  {Object.entries(groupedGreekItems).map(([category, items]) => {
                    const cols = greekLayouts[category] || 2;

                    return (
                      <section
                        key={category}
                        className={`cme-symbol-subgroup cme-greek-subgroup${isMathMode ? ' cme-symbol-subgroup--compact' : ''}`}
                        style={{
                          gridTemplateColumns: `repeat(${cols}, auto)`,
                          gridTemplateRows: `repeat(${Math.ceil(items.length / cols)}, auto)`,
                        }}
                      >
                        {items.map((item, i) => {
                          const currentGroup = activeGroupConfig;
                          const groupKey = currentGroup.id || currentGroup.label || activeGroup;
                          const buttonKey = `${groupKey}-${category}-${i}-${item.insert || item.action || item.label}`;
                          const isGreekItalicPickerBtn = item.action === 'GREEK_ITALIC_PICKER';
                          const isBlackboardBoldPickerBtn = item.action === 'BLACKBOARD_BOLD_PICKER';
                          const isFrakturScriptPickerBtn = item.action === 'FRAKTUR_SCRIPT_PICKER';
                          const isHebrewSymbolPickerBtn = item.action === 'HEBREW_SYMBOL_PICKER';
                          const isPeriodicTablePickerBtn = item.action === 'PERIODIC_TABLE_PICKER';
                          const isArabicIndicNumeralsBtn = item.action === 'ARABIC_INDIC_NUMERALS';
                          const isEasternArabicIndicNumeralsBtn = item.action === 'EASTERN_ARABIC_INDIC_NUMERALS';
                          const isTouchedButton = isGreekItalicPickerBtn
                            ? !!showGreekItalicPicker
                            : isBlackboardBoldPickerBtn
                              ? !!showBlackboardBoldPicker
                              : isFrakturScriptPickerBtn
                                ? !!showFrakturScriptPicker
                                : isHebrewSymbolPickerBtn
                                  ? !!showHebrewSymbolPicker
                                  : isPeriodicTablePickerBtn
                                    ? !!showPeriodicTablePicker
                                    : isArabicIndicNumeralsBtn
                                      ? numeralMode === 'arabicIndic'
                                    : isEasternArabicIndicNumeralsBtn
                                        ? numeralMode === 'easternArabicIndic'
                                        : false;

                          return (
                            <button
                              key={buttonKey}
                              type="button"
                              className={`cme-btn cme-greek-btn${isMathMode ? ' cme-btn--compact' : ''}${item.cls ? ` ${item.cls}` : ''}${isTouchedButton ? ' active' : ''}`}
                              title={item.title || item.insert}
                              onMouseDown={(e) => {
                                e.preventDefault();
                                if (item.action === 'GREEK_ITALIC_PICKER') {
                                  const rect = e.currentTarget.getBoundingClientRect();
                                  setShowArrowPicker(null);
                                  setShowArrowLabelPicker(null);
                                  setShowColorPicker(null);
                                  setShowSpecialChars(null);
                                  setShowBlackboardBoldPicker(null);
                                  setShowFrakturScriptPicker(null);
                                  setShowHebrewSymbolPicker(null);
                                  setShowPeriodicTablePicker(null);
                                  setShowGreekItalicPicker((prev) => (
                                    prev ? null : { x: rect.left, y: rect.bottom + 4 }
                                  ));
                                  return;
                                }
                                if (item.action === 'BLACKBOARD_BOLD_PICKER') {
                                  const rect = e.currentTarget.getBoundingClientRect();
                                  setShowArrowPicker(null);
                                  setShowArrowLabelPicker(null);
                                  setShowColorPicker(null);
                                  setShowSpecialChars(null);
                                  setShowGreekItalicPicker(null);
                                  setShowFrakturScriptPicker(null);
                                  setShowHebrewSymbolPicker(null);
                                  setShowPeriodicTablePicker(null);
                                  setShowBlackboardBoldPicker((prev) => (
                                    prev ? null : { x: rect.left, y: rect.bottom + 4 }
                                  ));
                                  return;
                                }
                                if (item.action === 'FRAKTUR_SCRIPT_PICKER') {
                                  const rect = e.currentTarget.getBoundingClientRect();
                                  setShowArrowPicker(null);
                                  setShowArrowLabelPicker(null);
                                  setShowColorPicker(null);
                                  setShowSpecialChars(null);
                                  setShowGreekItalicPicker(null);
                                  setShowBlackboardBoldPicker(null);
                                  setShowHebrewSymbolPicker(null);
                                  setShowPeriodicTablePicker(null);
                                  setShowFrakturScriptPicker((prev) => (
                                    prev ? null : { x: rect.left, y: rect.bottom + 4 }
                                  ));
                                  return;
                                }
                                if (item.action === 'HEBREW_SYMBOL_PICKER') {
                                  const rect = e.currentTarget.getBoundingClientRect();
                                  setShowArrowPicker(null);
                                  setShowArrowLabelPicker(null);
                                  setShowColorPicker(null);
                                  setShowSpecialChars(null);
                                  setShowGreekItalicPicker(null);
                                  setShowBlackboardBoldPicker(null);
                                  setShowFrakturScriptPicker(null);
                                  setShowPeriodicTablePicker(null);
                                  setShowHebrewSymbolPicker((prev) => (
                                    prev ? null : { x: rect.left, y: rect.bottom + 4 }
                                  ));
                                  return;
                                }
                                if (item.action === 'PERIODIC_TABLE_PICKER') {
                                  const rect = e.currentTarget.getBoundingClientRect();
                                  setShowArrowPicker(null);
                                  setShowArrowLabelPicker(null);
                                  setShowColorPicker(null);
                                  setShowSpecialChars(null);
                                  setShowGreekItalicPicker(null);
                                  setShowBlackboardBoldPicker(null);
                                  setShowFrakturScriptPicker(null);
                                  setShowHebrewSymbolPicker(null);
                                  setShowPeriodicTablePicker((prev) => (
                                    prev ? null : { x: rect.left, y: rect.bottom + 4 }
                                  ));
                                  return;
                                }
                                if (item.action === 'ARABIC_INDIC_NUMERALS') {
                                  setShowArrowPicker(null);
                                  setShowArrowLabelPicker(null);
                                  setShowColorPicker(null);
                                  setShowSpecialChars(null);
                                  setShowGreekItalicPicker(null);
                                  setShowBlackboardBoldPicker(null);
                                  setShowFrakturScriptPicker(null);
                                  setShowHebrewSymbolPicker(null);
                                  setShowPeriodicTablePicker(null);
                                  setNumeralMode((current) => (current === 'arabicIndic' ? 'western' : 'arabicIndic'));
                                  requestAnimationFrame(() => popupMfRef.current?.focus?.());
                                  return;
                                }
                                if (item.action === 'EASTERN_ARABIC_INDIC_NUMERALS') {
                                  setShowArrowPicker(null);
                                  setShowArrowLabelPicker(null);
                                  setShowColorPicker(null);
                                  setShowSpecialChars(null);
                                  setShowGreekItalicPicker(null);
                                  setShowBlackboardBoldPicker(null);
                                  setShowFrakturScriptPicker(null);
                                  setShowHebrewSymbolPicker(null);
                                  setShowPeriodicTablePicker(null);
                                  setNumeralMode((current) => (current === 'easternArabicIndic' ? 'western' : 'easternArabicIndic'));
                                  requestAnimationFrame(() => popupMfRef.current?.focus?.());
                                  return;
                                }
                                insertAtCursor(item.insert);
                              }}
                            >
                              {renderToolbarItemLabel(item, { groupId: currentGroup.id, isMathMode, isChemMode: !isMathMode })}
                            </button>
                          );
                        })}
                      </section>
                    );
                  })}
                </div>
              );
            }

            // Subgroups support: split by { type: 'sep' }
            const hasSep = activeItems.some(item => item.type === 'sep');
            let subgroups = [];

            if (hasSep) {
              let currentSub = { cols: 2, items: [] };
              for (const item of activeItems) {
                if (item.type === 'sep') {
                  if (currentSub.items.length > 0) {
                    subgroups.push(currentSub);
                  }
                  currentSub = { cols: item.cols || 2, items: [] };
                } else {
                  currentSub.items.push(item);
                }
              }
              if (currentSub.items.length > 0) {
                subgroups.push(currentSub);
              }

              if (activeGroupConfig.id === 'relations') {
                subgroups = subgroups.map((subgroup) => ({
                  ...subgroup,
                  cols: Math.max(1, Math.ceil(subgroup.items.length / 2)),
                }));
              }
            } else {
              // Legacy grouping for tabs without explicit separators (chunk by 4 items = 2x2 grid)
              const size = 4;
              for (let i = 0; i < activeItems.length; i += size) {
                subgroups.push({
                  cols: 2,
                  items: activeItems.slice(i, i + size)
                });
              }
            }

            return subgroups.map((subgroup, chunkIndex) => (
              <div
                key={chunkIndex}
                className={`cme-symbol-subgroup${isMathMode ? ' cme-symbol-subgroup--compact' : ''}`}
                style={{
                  gridTemplateColumns: `repeat(${subgroup.cols}, auto)`,
                  gridTemplateRows: `repeat(${Math.ceil(subgroup.items.length / subgroup.cols)}, auto)`
                }}
              >
                {subgroup.items.map((item, i) => {
                  const currentGroup = activeGroupConfig;
                  const groupKey = currentGroup.id || currentGroup.label || activeGroup;
                  const buttonKey = `${groupKey}-${chunkIndex * 4 + i}-${item.insert || item.action || item.label}`;
                  if (item.type === 'dropdown') {
                    const isFont = item.label === 'Font...';
                    const isSize = item.label === 'Size';

                    const isFontActive = isFont && activeStyles.fontOption !== '';
                    const isSizeActive = isSize && activeStyles.fontSize !== 'auto' && activeStyles.fontSize !== '5';

                    const selectValue = isFont
                      ? activeStyles.fontOption
                      : (isSize
                        ? (activeStyles.fontSize === 'auto' || activeStyles.fontSize === '5' ? '' : activeStyles.fontSize)
                        : '');

                    const dropdownOptions = isFont ? FONT_OPTIONS : FONT_SIZE_OPTIONS;
                    const selectedLabel = dropdownOptions.find((option) => option.value === selectValue)?.label || item.label;
                    const isOpenStyleDropdown = showStyleDropdown?.buttonKey === buttonKey;

                    return (
                      <button
                        key={i}
                        type="button"
                        className={`cme-style-select-trigger cme-select cme-btn template${isFontActive || isSizeActive || isOpenStyleDropdown ? ' active' : ''}`}
                        title={item.label}
                        style={{
                          width: item.width || '60px',
                          boxSizing: 'border-box',
                          margin: '2px 0',
                          gridColumn: (subgroup.cols === 3) ? 'span 1' : ((subgroup.cols === 1) ? 'span 1' : 'span 2')
                        }}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          const rect = e.currentTarget.getBoundingClientRect();
                          setShowStyleDropdown((current) => (
                            current?.buttonKey === buttonKey
                              ? null
                              : {
                                x: rect.left,
                                y: rect.bottom,
                                type: isFont ? 'font' : 'size',
                                buttonKey,
                              }
                          ));
                        }}
                      >
                        {selectedLabel}
                      </button>
                    );
                  }

                  if (currentGroup.isMatrix && !item.directInsert) {
                    return (
                      <div
                        key={i}
                        className="cme-matrix-btn-wrapper"
                      >
                        <button
                          type="button"
                        className={`cme-btn template${isMathMode ? ' cme-btn--compact' : ''}${item.cls ? ` ${item.cls}` : ''}${activeMatrix?.type === item.insert ? ' active' : ''}`}
                          title={item.insert}
                          onMouseDown={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            if (activeMatrix?.type === item.insert) {
                              setActiveMatrix(null);
                            } else {
                              const rect = e.currentTarget.getBoundingClientRect();
                              setActiveMatrix({
                                type: item.insert,
                                x: rect.left + rect.width / 2,
                                y: rect.bottom
                              });
                            }
                          }}
                        >
                          {renderToolbarItemLabel(item, { groupId: currentGroup.id, isMathMode, isChemMode: !isMathMode })}
                        </button>
                      </div>
                    );
                  }

                  const isBoldBtn = item.action === 'BOLD';
                  const isItalicBtn = item.action === 'ITALIC';
                  const isBoldItalicBtn = item.action === 'BOLD_ITALIC';
                  const isColorBtn = item.action === 'TEXT_COLOR';
                  const isRtlBtn = item.action === 'TOGGLE_RTL';
                  const isArrowPickerBtn = item.action === 'ARROW_PICKER';
                  const isRelationMorePickerBtn = item.action === 'RELATION_MORE_PICKER';
                  const isArrowLabelPickerBtn = item.action === 'ARROW_LABEL_PICKER';
                  const isBlackboardBoldPickerBtn = item.action === 'BLACKBOARD_BOLD_PICKER';
                  const isFrakturScriptPickerBtn = item.action === 'FRAKTUR_SCRIPT_PICKER';
                  const isHebrewSymbolPickerBtn = item.action === 'HEBREW_SYMBOL_PICKER';
                  const isPeriodicTablePickerBtn = item.action === 'PERIODIC_TABLE_PICKER';
                  const isBtnActive =
                    (isBoldBtn && activeStyles.bold && !activeStyles.italic) ||
                    (isItalicBtn && activeStyles.italic && !activeStyles.bold) ||
                    (isBoldItalicBtn && activeStyles.boldItalic) ||
                    (isRtlBtn && isRtlInput) ||
                    (isArrowPickerBtn && !!showArrowPicker) ||
                    (isRelationMorePickerBtn && showRelationMorePicker?.picker === item.picker) ||
                    (isArrowLabelPickerBtn && !!showArrowLabelPicker) ||
                    (isBlackboardBoldPickerBtn && !!showBlackboardBoldPicker) ||
                    (isFrakturScriptPickerBtn && !!showFrakturScriptPicker) ||
                    (isHebrewSymbolPickerBtn && !!showHebrewSymbolPicker) ||
                    (isPeriodicTablePickerBtn && !!showPeriodicTablePicker) ||
                    (isColorBtn && activeStyles.color !== 'none');

                  return (
                    <button
                      key={`${groupKey}-${chunkIndex * 4 + i}`}
                      type="button"
                      className={`cme-btn${currentGroup.isTemplate ? ' template' : ''}${isMathMode ? ' cme-btn--compact' : ''}${item.cls ? ` ${item.cls}` : ''}${isBtnActive ? ' active' : ''}`}
                      title={item.title || item.insert}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        const mf = popupMfRef.current;
                        if (item.action === 'SPECIAL_CHARS') {
                          const rect = e.currentTarget.getBoundingClientRect();
                          setShowArrowPicker(null);
                          setShowRelationMorePicker(null);
                          setShowArrowLabelPicker(null);
                          setShowGreekItalicPicker(null);
                          setShowBlackboardBoldPicker(null);
                          setShowFrakturScriptPicker(null);
                          setShowHebrewSymbolPicker(null);
                          setShowPeriodicTablePicker(null);
                          setShowColorPicker(null);
                          setShowSpecialChars({ x: rect.left, y: rect.bottom + 4 });
                        } else if (item.action === 'ARROW_PICKER') {
                          const rect = e.currentTarget.getBoundingClientRect();
                          setShowSpecialChars(null);
                          setShowRelationMorePicker(null);
                          setShowArrowLabelPicker(null);
                          setShowGreekItalicPicker(null);
                          setShowBlackboardBoldPicker(null);
                          setShowFrakturScriptPicker(null);
                          setShowHebrewSymbolPicker(null);
                          setShowPeriodicTablePicker(null);
                          setShowColorPicker(null);
                          setShowArrowPicker((prev) => (
                            prev ? null : { x: rect.left, y: rect.bottom + 4 }
                          ));
                        } else if (item.action === 'RELATION_MORE_PICKER') {
                          const rect = e.currentTarget.getBoundingClientRect();
                          setShowSpecialChars(null);
                          setShowArrowPicker(null);
                          setShowArrowLabelPicker(null);
                          setShowGreekItalicPicker(null);
                          setShowBlackboardBoldPicker(null);
                          setShowFrakturScriptPicker(null);
                          setShowHebrewSymbolPicker(null);
                          setShowPeriodicTablePicker(null);
                          setShowColorPicker(null);
                          setShowRelationMorePicker((prev) => (
                            prev?.picker === item.picker ? null : { x: rect.left, y: rect.bottom + 4, picker: item.picker }
                          ));
                        } else if (item.action === 'ARROW_LABEL_PICKER') {
                          const rect = e.currentTarget.getBoundingClientRect();
                          setShowSpecialChars(null);
                          setShowArrowPicker(null);
                          setShowRelationMorePicker(null);
                          setShowGreekItalicPicker(null);
                          setShowBlackboardBoldPicker(null);
                          setShowFrakturScriptPicker(null);
                          setShowHebrewSymbolPicker(null);
                          setShowPeriodicTablePicker(null);
                          setShowColorPicker(null);
                          setShowArrowLabelPicker((prev) => (
                            prev ? null : { x: rect.left, y: rect.bottom + 4 }
                          ));
                        } else if (item.action === 'BLACKBOARD_BOLD_PICKER') {
                          const rect = e.currentTarget.getBoundingClientRect();
                          setShowSpecialChars(null);
                          setShowArrowPicker(null);
                          setShowArrowLabelPicker(null);
                          setShowColorPicker(null);
                          setShowRelationMorePicker(null);
                          setShowGreekItalicPicker(null);
                          setShowFrakturScriptPicker(null);
                          setShowHebrewSymbolPicker(null);
                          setShowPeriodicTablePicker(null);
                          setShowBlackboardBoldPicker((prev) => (
                            prev ? null : { x: rect.left, y: rect.bottom + 4 }
                          ));
                        } else if (item.action === 'FRAKTUR_SCRIPT_PICKER') {
                          const rect = e.currentTarget.getBoundingClientRect();
                          setShowSpecialChars(null);
                          setShowArrowPicker(null);
                          setShowArrowLabelPicker(null);
                          setShowColorPicker(null);
                          setShowRelationMorePicker(null);
                          setShowGreekItalicPicker(null);
                          setShowBlackboardBoldPicker(null);
                          setShowHebrewSymbolPicker(null);
                          setShowPeriodicTablePicker(null);
                          setShowFrakturScriptPicker((prev) => (
                            prev ? null : { x: rect.left, y: rect.bottom + 4 }
                          ));
                        } else if (item.action === 'HEBREW_SYMBOL_PICKER') {
                          const rect = e.currentTarget.getBoundingClientRect();
                          setShowSpecialChars(null);
                          setShowArrowPicker(null);
                          setShowArrowLabelPicker(null);
                          setShowColorPicker(null);
                          setShowRelationMorePicker(null);
                          setShowGreekItalicPicker(null);
                          setShowBlackboardBoldPicker(null);
                          setShowFrakturScriptPicker(null);
                          setShowPeriodicTablePicker(null);
                          setShowHebrewSymbolPicker((prev) => (
                            prev ? null : { x: rect.left, y: rect.bottom + 4 }
                          ));
                        } else if (item.action === 'PERIODIC_TABLE_PICKER') {
                          const rect = e.currentTarget.getBoundingClientRect();
                          setShowSpecialChars(null);
                          setShowArrowPicker(null);
                          setShowArrowLabelPicker(null);
                          setShowColorPicker(null);
                          setShowRelationMorePicker(null);
                          setShowGreekItalicPicker(null);
                          setShowBlackboardBoldPicker(null);
                          setShowFrakturScriptPicker(null);
                          setShowHebrewSymbolPicker(null);
                          setShowPeriodicTablePicker((prev) => (
                            prev ? null : { x: rect.left, y: rect.bottom + 4 }
                          ));
                        } else if (item.action === 'TEXT_COLOR') {
                          const rect = e.currentTarget.getBoundingClientRect();
                          setShowArrowPicker(null);
                          setShowRelationMorePicker(null);
                          setShowArrowLabelPicker(null);
                          setShowGreekItalicPicker(null);
                          setShowBlackboardBoldPicker(null);
                          setShowFrakturScriptPicker(null);
                          setShowHebrewSymbolPicker(null);
                          setShowPeriodicTablePicker(null);
                          setCustomColorInput(activeStyles.color !== 'none' ? activeStyles.color : '');
                          setCustomColorError('');
                          setShowColorPicker({ x: rect.left, y: rect.bottom + 4 });
                        } else if (item.action === 'TOGGLE_RTL') {
                          setIsRtlInput((prev) => !prev);
                          requestAnimationFrame(() => popupMfRef.current?.focus?.());
                        } else if (item.action === 'BOLD') {
                          setTypingVariant(!activeStyles.bold, activeStyles.italic);
                        } else if (item.action === 'BOLD_ITALIC') {
                          const shouldEnableBoth = !activeStyles.boldItalic;
                          setTypingVariant(shouldEnableBoth, shouldEnableBoth);
                        } else if (item.action === 'CUT') {
                          const latex = mf ? (mf.getValue ? mf.getValue() : mf.value || '') : '';
                          if (latex && navigator.clipboard?.writeText) {
                            void navigator.clipboard.writeText(latex).catch(() => {});
                          }
                          if (mf) {
                            if (typeof mf.setValue === 'function') {
                              mf.setValue('');
                            } else {
                              mf.value = '';
                            }
                            mf.focus?.();
                          }
                        } else if (item.action === 'COPY') {
                          const latex = mf ? (mf.getValue ? mf.getValue() : mf.value || '') : '';
                          if (latex && navigator.clipboard?.writeText) {
                            void navigator.clipboard.writeText(latex).catch(() => {});
                          }
                        } else if (item.action === 'PASTE') {
                          if (navigator.clipboard?.readText) {
                            void navigator.clipboard.readText().then((text) => {
                              if (text) {
                                insertAtCursor(convertDigitsToNumeralSystem(text, numeralMode));
                              }
                            }).catch(() => {});
                          }
                        } else if (item.action === 'ARABIC_INDIC_NUMERALS') {
                          setNumeralMode((current) => (current === 'arabicIndic' ? 'western' : 'arabicIndic'));
                          requestAnimationFrame(() => popupMfRef.current?.focus?.());
                        } else if (item.action === 'EASTERN_ARABIC_INDIC_NUMERALS') {
                          setNumeralMode((current) => (current === 'easternArabicIndic' ? 'western' : 'easternArabicIndic'));
                          requestAnimationFrame(() => popupMfRef.current?.focus?.());
                        } else if (item.action === 'MOVE_TEXT_UP') {
                          applyMoveTextAction('up');
                        } else if (item.action === 'MOVE_TEXT_RIGHT') {
                          applyMoveTextAction('right');
                        } else if (item.action === 'MOVE_TEXT_LEFT') {
                          applyMoveTextAction('left');
                        } else if (item.action === 'MOVE_TEXT_DOWN') {
                          applyMoveTextAction('down');
                        } else if (item.action === 'BLACKBOARD') {
                          insertAtCursor('\\mathbb{#0}');
                        } else if (item.action === 'GREEK') {
                          insertAtCursor('\\Omega');
                        } else if (item.action === 'TILDE') {
                          insertAtCursor('\\widetilde{#0}');
                        } else if (item.action === 'ITALIC') {
                          setTypingVariant(activeStyles.bold, !activeStyles.italic);
                        } else if (item.action === 'TEXT') {
                          insertAtCursor('\\text{#0}');
                        } else if (item.action === 'UNDO') {
                          popupMfRef.current?.executeCommand('undo');
                        } else if (item.action === 'REDO') {
                          popupMfRef.current?.executeCommand('redo');
                        } else if (item.action === 'CLEAR') {
                          if (mf) {
                            if (typeof mf.setValue === 'function') {
                              mf.setValue('');
                            } else {
                              mf.value = '';
                            }
                            mf.focus?.();
                          }
                        } else if (
                          item.insert === '\\hphantom{0}' ||
                          item.insert === '\\,' ||
                          item.insert === '\\!'
                        ) {
                          insertSpacingToolAtCursor(item.insert);
                        } else {
                          insertAtCursor(item.insert);
                        }
                      }}
                    >
                      {renderToolbarItemLabel(item, { groupId: currentGroup.id, isMathMode, isChemMode: !isMathMode })}
                    </button>
                  );
                })}
              </div>
            ));
          })()}
        </div>
      </div>

      <div
        className={`cme-mathfield-container${isRtlInput ? ' cme-mathfield-container--rtl' : ''}`}
        onMouseDown={(e) => {
          if (popupMfRef.current && (e.target === popupMfRef.current || popupMfRef.current.contains(e.target))) return;
          e.preventDefault();
          requestAnimationFrame(() => { popupMfRef.current?.focus?.(); });
        }}
      >
        <math-field
          ref={popupMfRef}
          class={`cme-mathfield${isRtlInput ? ' cme-mathfield--rtl' : ''}`}
          dir={isRtlInput ? 'rtl' : 'ltr'}
          letter-shape-style="upright"
          tabIndex={0}
          math-virtual-keyboard-policy="manual"
          placeholder={mode === 'math' ? '' : ''}
        />
      </div>

      <div className="cme-popup-footer">

        <button type="button" className="cme-insert-btn" onClick={handleInsert}>
          {isEditing ? 'Update' : 'Insert'}
        </button>
        <button type="button" className="cme-cancel-btn" onClick={onClose}>
          Cancel
        </button>
      </div>

      {activeMatrix && (
        <MatrixHoverGrid
          matrixType={activeMatrix.type}
          x={activeMatrix.x}
          y={activeMatrix.y}
          onSelect={(r, c) => {
            handleMatrixInsert(activeMatrix.type, r, c);
            setActiveMatrix(null);
          }}
          onMouseEnter={() => { }}
          onMouseLeave={() => { }}
        />
      )}

      {showSpecialChars && createPortal(
        <SpecialCharacterModal
          isOpen={!!showSpecialChars}
          position={showSpecialChars}
          onClose={() => setShowSpecialChars(null)}
          onInsert={(char) => {
            insertAtCursor(char);
            setShowSpecialChars(null);
          }}
        />,
        document.body
      )}

      {showArrowPicker && createPortal(
        <ArrowPickerPopover
          position={showArrowPicker}
          onInsert={(latex) => {
            insertAtCursor(latex);
            setShowArrowPicker(null);
          }}
        />,
        document.body
      )}

      {showRelationMorePicker && createPortal(
        <RelationMorePickerPopover
          position={showRelationMorePicker}
          items={RELATION_MORE_PICKERS[showRelationMorePicker.picker] || []}
          onInsert={(latex) => {
            insertAtCursor(latex);
            setShowRelationMorePicker(null);
          }}
        />,
        document.body
      )}

      {showArrowLabelPicker && createPortal(
        <ArrowLabelPickerPopover
          position={showArrowLabelPicker}
          onInsert={(latex) => {
            insertAtCursor(latex);
            setShowArrowLabelPicker(null);
          }}
        />,
        document.body
      )}

      {showGreekItalicPicker && createPortal(
        <GreekItalicPickerPopover
          position={showGreekItalicPicker}
          onInsert={(latex) => {
            insertAtCursor(latex);
            setShowGreekItalicPicker(null);
          }}
        />,
        document.body
      )}

      {showBlackboardBoldPicker && createPortal(
        <BlackboardBoldPickerPopover
          position={showBlackboardBoldPicker}
          onInsert={(latex) => {
            insertAtCursor(latex);
            setShowBlackboardBoldPicker(null);
          }}
        />,
        document.body
      )}

      {showFrakturScriptPicker && createPortal(
        <FrakturScriptPickerPopover
          position={showFrakturScriptPicker}
          onInsert={(latex) => {
            insertAtCursor(latex);
            setShowFrakturScriptPicker(null);
          }}
        />,
        document.body
      )}

      {showHebrewSymbolPicker && createPortal(
        <HebrewSymbolPickerPopover
          position={showHebrewSymbolPicker}
          onInsert={(latex) => {
            insertAtCursor(latex);
            setShowHebrewSymbolPicker(null);
          }}
        />,
        document.body
      )}

      {showPeriodicTablePicker && createPortal(
        <PeriodicTablePickerPopover
          position={showPeriodicTablePicker}
          onInsert={(latex) => {
            insertAtCursor(latex);
            setShowPeriodicTablePicker(null);
          }}
        />,
        document.body
      )}

      {showStyleDropdown && createPortal(
        <StyleDropdownPopover
          position={showStyleDropdown}
          options={showStyleDropdown.type === 'font' ? FONT_OPTIONS : FONT_SIZE_OPTIONS}
          value={showStyleDropdown.type === 'font' ? activeStyles.fontOption : activeStyles.fontSize}
          width={showStyleDropdown.type === 'font' ? 142 : 96}
          onSelect={(value) => {
            applyStyleDropdownValue(showStyleDropdown.type, value);
            setShowStyleDropdown(null);
          }}
        />,
        document.body
      )}

      {showColorPicker && createPortal(
        <div
          className="cme-color-picker-popup"
          style={{
            position: 'fixed',
            left: Math.min(showColorPicker.x, window.innerWidth - 260) + 'px',
            top: Math.min(showColorPicker.y, window.innerHeight - 235) + 'px',
            zIndex: 100000,
            width: '244px',
            background: 'linear-gradient(180deg, #ffffff 0%, #f6fafc 100%)',
            border: '1px solid #c8d4dc',
            padding: '12px',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
            borderRadius: '10px',
            boxShadow: '0 16px 28px rgba(15, 23, 42, 0.18), 0 2px 6px rgba(15, 23, 42, 0.08)'
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '10px'
            }}
          >
            <div>
              <div style={{ fontSize: '12px', fontWeight: 700, color: '#1f2f37', lineHeight: 1.1 }}>
                Text Color
              </div>
              <div style={{ fontSize: '10px', color: '#667b88', marginTop: '2px' }}>
                Pick a swatch or enter a custom value
              </div>
            </div>
            <div
              style={{
                width: '28px',
                height: '28px',
                borderRadius: '8px',
                border: '1px solid #b8c8d2',
                background: activeStyles.color === 'none'
                  ? 'linear-gradient(135deg, #ffffff 0%, #eef3f7 100%)'
                  : (normalizeCssColor(customColorInput) || activeStyles.color),
                boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.8)'
              }}
              title={activeStyles.color === 'none' ? 'No color selected' : activeStyles.color}
            />
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(6, 1fr)',
              gap: '6px',
              padding: '8px',
              border: '1px solid #d7e1e8',
              borderRadius: '8px',
              background: 'rgba(255,255,255,0.78)'
            }}
          >
            {colorSwatches.map((swatch) => {
              const isColorSelected = activeStyles.color === swatch.normalized;
              return (
                <div
                  key={swatch.normalized}
                  title={swatch.label}
                  style={{
                    width: '22px',
                    height: '22px',
                    backgroundColor: swatch.value,
                    cursor: 'pointer',
                    border: isColorSelected ? '2px solid #d6a528' : '1px solid rgba(31, 47, 55, 0.22)',
                    borderRadius: '6px',
                    boxSizing: 'border-box',
                    boxShadow: isColorSelected
                      ? '0 0 0 2px rgba(214, 165, 40, 0.16)'
                      : 'inset 0 1px 0 rgba(255,255,255,0.6)'
                  }}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (applyTextColor(swatch.normalized)) {
                      setShowColorPicker(null);
                    }
                  }}
                />
              );
            })}
          </div>

          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '6px'
            }}
          >
            <div style={{ fontSize: '10px', fontWeight: 700, color: '#5f7481', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
              Custom Value
            </div>
            <input
              type="text"
              value={customColorInput}
              placeholder="#2c8a43 or tomato"
              style={{
                width: '100%',
                minWidth: 0,
                height: '32px',
                border: `1px solid ${customColorError ? '#dc2626' : '#b7c7d1'}`,
                borderRadius: '8px',
                padding: '0 10px',
                fontSize: '12px',
                color: '#22343d',
                background: '#fff',
                boxSizing: 'border-box',
                outline: 'none'
              }}
              onChange={(e) => {
                setCustomColorInput(e.target.value);
                if (customColorError) setCustomColorError('');
              }}
              onMouseDown={(e) => e.stopPropagation()}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  e.stopPropagation();
                  if (applyTextColor(customColorInput)) {
                    setShowColorPicker(null);
                  }
                }
              }}
            />
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              type="button"
              style={{
                flex: 1,
                border: '1px solid #7a92a1',
                borderRadius: '8px',
                background: 'linear-gradient(180deg, #8ea3b0 0%, #738d9d 100%)',
                color: '#fff',
                fontSize: '11px',
                fontWeight: 600,
                height: '30px',
                minWidth: 0,
                padding: '0 10px',
                cursor: 'pointer'
              }}
              onMouseDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (applyTextColor(customColorInput)) {
                  setShowColorPicker(null);
                }
              }}
            >
              Apply Color
            </button>
            <button
              type="button"
              style={{
                width: '32px',
                minWidth: '32px',
                border: '1px solid #c4d0d8',
                borderRadius: '8px',
                background: '#ffffff',
                color: '#647987',
                fontSize: '12px',
                fontWeight: 700,
                height: '30px',
                padding: 0,
                cursor: 'pointer'
              }}
              title="Clear color"
              onMouseDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                applyTextColor('none');
                setShowColorPicker(null);
              }}
            >
              ×
            </button>
          </div>

          {customColorError ? (
            <div style={{ fontSize: '10px', color: '#b91c1c', lineHeight: 1.2, marginTop: '-2px' }}>
              {customColorError}
            </div>
          ) : null}
        </div>,
        document.body
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   LaTeX → Unicode plain-text converter
   Converts LaTeX notation to readable Unicode so CKEditor
   treats each character individually (backspace works per-char)
══════════════════════════════════════════════════════════ */
function latexToPlainText(latex) {
  let text = latex;

  // Unwrap \ce{...}
  const ceMatch = text.match(/^\\ce\{([\s\S]*)\}$/);
  if (ceMatch) text = ceMatch[1];

  // Sort replacements longest-first to avoid partial matches
  const replacements = [
    // Greek lowercase
    ['\\varepsilon', 'ε'], ['\\varphi', 'φ'],
    ['\\alpha', 'α'], ['\\beta', 'β'], ['\\gamma', 'γ'], ['\\delta', 'δ'],
    ['\\epsilon', 'ε'], ['\\zeta', 'ζ'], ['\\eta', 'η'], ['\\theta', 'θ'],
    ['\\iota', 'ι'], ['\\kappa', 'κ'], ['\\lambda', 'λ'], ['\\mu', 'μ'],
    ['\\nu', 'ν'], ['\\xi', 'ξ'], ['\\pi', 'π'], ['\\rho', 'ρ'],
    ['\\sigma', 'σ'], ['\\tau', 'τ'], ['\\upsilon', 'υ'], ['\\phi', 'φ'],
    ['\\chi', 'χ'], ['\\psi', 'ψ'], ['\\omega', 'ω'],
    // Greek uppercase
    ['\\Gamma', 'Γ'], ['\\Delta', 'Δ'], ['\\Theta', 'Θ'], ['\\Lambda', 'Λ'],
    ['\\Xi', 'Ξ'], ['\\Pi', 'Π'], ['\\Sigma', 'Σ'], ['\\Upsilon', 'Υ'],
    ['\\Phi', 'Φ'], ['\\Psi', 'Ψ'], ['\\Omega', 'Ω'],
    // Operators
    ['\\pm', '±'], ['\\mp', '∓'], ['\\times', '×'], ['\\div', '÷'],
    ['\\backslash', '\\'],
    ['\\cdot', '·'], ['\\neq', '≠'], ['\\leq', '≤'], ['\\geq', '≥'],
    ['\\approx', '≈'], ['\\equiv', '≡'], ['\\infty', '∞'],
    ['\\sum', '∑'], ['\\prod', '∏'], ['\\int', '∫'], ['\\oint', '∮'],
    ['\\iint', '∬'], ['\\iiint', '∭'], ['\\oiint', '∯'],
    ['\\partial', '∂'], ['\\nabla', '∇'],
    ['\\in', '∈'], ['\\notin', '∉'],
    ['\\subset', '⊂'], ['\\subseteq', '⊆'], ['\\supset', '⊃'], ['\\supseteq', '⊇'],
    ['\\cup', '∪'], ['\\cap', '∩'], ['\\emptyset', '∅'], ['\\setminus', '﹨'],
    ['\\forall', '∀'], ['\\exists', '∃'], ['\\neg', '¬'],
    ['\\land', '∧'], ['\\lor', '∨'],
    // Arrows
    ['\\leftrightarrow', '↔'], ['\\Leftrightarrow', '⇔'],
    ['\\rightarrow', '→'], ['\\leftarrow', '←'],
    ['\\Rightarrow', '⇒'], ['\\Leftarrow', '⇐'],
    ['\\uparrow', '↑'], ['\\downarrow', '↓'],
    // Trig / log
    ['\\sin', 'sin'], ['\\cos', 'cos'], ['\\tan', 'tan'],
    ['\\cot', 'cot'], ['\\sec', 'sec'], ['\\csc', 'csc'],
    ['\\log', 'log'], ['\\ln', 'ln'], ['\\exp', 'exp'], ['\\lim', 'lim'],
    // Math sets
    ...BLACKBOARD_BOLD_PICKER_ITEMS.map(({ insert, label }) => [insert, label]),
    ...FRAKTUR_SCRIPT_PICKER_ITEMS.map(({ insert, label }) => [insert, label]),
    ...HEBREW_SYMBOL_PICKER_ITEMS.map(({ insert, label }) => [insert, label]),
    ['\\wp', '℘'],
    // Delimiters
    ['\\left(', '('], ['\\right)', ')'],
    ['\\left[', '['], ['\\right]', ']'],
    ['\\left|', '|'], ['\\right|', '|'],
    ['\\left\\{', '{'], ['\\right\\}', '}'],
    // Spacing
    ['\\,', ' '], ['\\;', ' '], ['\\quad', ' '], ['\\qquad', '  '],
    // Misc
    ['\\prime', '′'], ['\\vdots', '⋮'], ['\\cdots', '⋯'], ['\\ddots', '⋱'], ['\\ldots', '…'],
  ];

  for (const [cmd, char] of replacements) {
    const escaped = cmd.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    text = text.replace(new RegExp(escaped, 'g'), char);
  }

  // \frac{a}{b} → a/b
  text = text.replace(/\\frac\{([^}]*)\}\{([^}]*)\}/g, '$1/$2');

  // \sqrt[n]{x} → ⁿ√(x)  and  \sqrt{x} → √(x)
  text = text.replace(/\\sqrt\[([^\]]*)\]\{([^}]*)\}/g, '$1√($2)');
  text = text.replace(/\\sqrt\{([^}]*)\}/g, '√($1)');

  // \vec{x} → x⃗  \hat{x} → x̂  \bar{x} → x̄  \dot{x} → ẋ  \ddot{x} → ẍ
  text = text.replace(/\\vec\{([^}]*)\}/g, '$1\u20D7');
  text = text.replace(/\\hat\{([^}]*)\}/g, '$1\u0302');
  text = text.replace(/\\bar\{([^}]*)\}/g, '$1\u0304');
  text = text.replace(/\\ddot\{([^}]*)\}/g, '$1\u0308');
  text = text.replace(/\\dot\{([^}]*)\}/g, '$1\u0307');

  // \text{...} → content
  text = text.replace(/\\text\{([^}]*)\}/g, '$1');

  // \begin{pmatrix}...\end{pmatrix} → [a, b; c, d]
  text = text.replace(/\\begin\{pmatrix\}([\s\S]*?)\\end\{pmatrix\}/g, (_, c) =>
    '[' + c.replace(/\\\\/g, '; ').replace(/&/g, ', ').trim() + ']'
  );

  // Superscripts ^{content}
  const supMap = { '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹', '+': '⁺', '-': '⁻', '=': '⁼', '(': '⁽', ')': '⁾', 'n': 'ⁿ', 'i': 'ⁱ' };
  text = text.replace(/\^\{([^}]*)\}/g, (_, content) =>
    content.split('').map(c => supMap[c] || c).join('')
  );
  text = text.replace(/\^([a-zA-Z0-9])/g, (_, c) => supMap[c] || c);

  // Subscripts _{content}
  const subMap = { '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄', '5': '₅', '6': '₆', '7': '₇', '8': '₈', '9': '₉', '+': '₊', '-': '₋', '=': '₌', '(': '₍', ')': '₎', 'a': 'ₐ', 'e': 'ₑ', 'o': 'ₒ', 'x': 'ₓ', 'i': 'ᵢ', 'j': 'ⱼ', 'n': 'ₙ' };
  text = text.replace(/_\{([^}]*)\}/g, (_, content) =>
    content.split('').map(c => subMap[c] || c).join('')
  );
  text = text.replace(/_([a-zA-Z0-9])/g, (_, c) => subMap[c] || c);

  // Chem arrows
  text = text.replace(/->/g, '→');
  text = text.replace(/<=>/g, '⇌');

  // Clean up remaining LaTeX
  text = text.replace(/\\[a-zA-Z]+/g, '');   // remove unknown commands
  text = text.replace(/[{}]/g, '');           // remove remaining braces
  text = text.replace(/\s+/g, ' ');           // normalize whitespace
  text = text.replace(/\\\\/g, '\n');         // line breaks

  return text.trim();
}

/* ══════════════════════════════════════════════════════════
   Main CkEditor component
══════════════════════════════════════════════════════════ */
function CkEditor({ value, onChange, className = '' }) {
  const editorRef = useRef(null);
  const popupOpenRef = useRef(false);
  const [popup, setPopup] = useState(null);        // 'math' | 'chem' | null
  const [editingWidget, setEditingWidget] = useState(null); // { modelElement, latex } when editing existing widget

  useEffect(() => {
    popupOpenRef.current = !!popup;
  }, [popup]);

  useEffect(() => () => {
    window.__ckMathWidgetClickHandler = null;
  }, []);

  const openPopup = useCallback((mode) => {
    setEditingWidget(null); // toolbar button = fresh insert
    popupOpenRef.current = true;
    setPopup(mode);
  }, []);

  const closePopup = useCallback(() => {
    popupOpenRef.current = false;
    setPopup(null);
    setEditingWidget(null);

    // Clear the selection so that clicking the widget again registers as a change
    const editor = editorRef.current;
    if (editor) {
      editor.model.change(writer => {
        writer.setSelection(null);
      });
    }
  }, []);

  const [insertAsUnicode, setInsertAsUnicode] = useState(false);



  /* Insert new OR update existing widget */
  const handleInsert = useCallback((latex, { direction = 'ltr' } = {}) => {
    const editor = editorRef.current;
    if (!editor || !latex?.trim()) return;
    const mathAttributes = {
      latex: latex.trim(),
      dir: direction === 'rtl' ? 'rtl' : 'ltr',
    };

    if (editingWidget) {
      const targetModel = isModelElementLive(editor, editingWidget.modelElement)
        ? editingWidget.modelElement
        : null;

      if (targetModel) {
        // ── EDIT MODE: replace widget so the math-field re-renders with new latex ──
        editor.model.change((writer) => {
          const mathElement = writer.createElement('mathInline', mathAttributes);
          const position = writer.createPositionBefore(targetModel);
          writer.insert(mathElement, position);
          writer.remove(targetModel);
          writer.setSelection(writer.createPositionAfter(mathElement));
        });
      } else {
        // Fallback: insert updated value at cursor if model reference was lost
        editor.model.change((writer) => {
          const mathElement = writer.createElement('mathInline', mathAttributes);
          editor.model.insertContent(mathElement);
        });
      }
      setEditingWidget(null);
    } else if (insertAsUnicode) {
      const plainText = latexToPlainText(latex.trim());
      if (!plainText) return;

      editor.model.change((writer) => {
        const text = writer.createText(plainText);
        editor.model.insertContent(text);
      });
    } else {
      editor.model.change((writer) => {
        const mathElement = writer.createElement('mathInline', mathAttributes);
        editor.model.insertContent(mathElement);
        editor.model.insertContent(writer.createText(' '));
      });
    }

    editor.editing.view.focus();
  }, [insertAsUnicode, editingWidget]);

  const ToolbarPlugin = useMemo(() => makeToolbarPlugin(openPopup), [openPopup]);

  const handleEditorReady = useCallback((editor) => {
    editorRef.current = editor;

    const openEditPopup = (modelElement, latex, direction = 'ltr') => {
      if (!latex) return;

      const isChem = /^\\ce\{/.test(latex);
      const resolvedDirection =
        modelElement?.getAttribute('dir') === 'rtl' || direction === 'rtl'
          ? 'rtl'
          : 'ltr';
      popupOpenRef.current = true;
      setEditingWidget({ modelElement, latex, direction: resolvedDirection });
      setPopup(isChem ? 'chem' : 'math');
    };

    editor.mathWidgetClickHandler = openEditPopup;
    window.__ckMathWidgetClickHandler = openEditPopup;

    const editable = editor.ui.getEditableElement();
    if (!editable || editable._ckMathClickAttached) return;
    editable._ckMathClickAttached = true;

    const onEditablePointerDown = (e) => {
      const widgetEl = findMathWidgetFromEventTarget(e.target);
      if (!widgetEl) return;
      if (e.button !== 0) return;

      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation?.();
      triggerWidgetEdit(editor, null, getLatexFromWidgetDom(widgetEl), widgetEl);
    };

    editable.addEventListener('mousedown', onEditablePointerDown, true);
    editable.addEventListener('click', onEditablePointerDown, true);
  }, []);

  return (
    <div className={`ck-editor-shell ${className}`.trim()}>
      <style>{`
        .ck-powered-by { display: none !important; }
        .ck-math-widget {
          display: inline-block !important;
          position: relative !important;
          width: auto !important;
          max-width: 100% !important;
          cursor: pointer !important;
          vertical-align: middle !important;
        }
        .ck-math-widget::after {
          content: '';
          position: absolute;
          inset: 0;
          z-index: 2;
          cursor: pointer;
        }
        .ck-math-widget .ck-math-widget-inner,
        .ck-math-widget math-field {
          display: inline-block !important;
          width: auto !important;
          max-width: 100% !important;
          pointer-events: none !important;
          color: #ffffff !important;
        }
        .ck-math-widget[data-dir="rtl"] {
          direction: rtl !important;
          unicode-bidi: plaintext !important;
        }
        .ck-math-widget[data-dir="rtl"] .ck-math-widget-inner,
        .ck-math-widget[data-dir="rtl"] math-field {
          direction: rtl !important;
          text-align: right !important;
        }
        .ck-math-widget:hover,
        .ck-math-widget.ck-widget_selected { outline: 2px solid #0f766e; outline-offset: 1px; border-radius: 4px; }
      `}</style>

      {/* Insert Options Bar */}
      <div className="ck-editor-meta">
        <label className="ck-editor-mode-toggle">
          <input
            className="ck-editor-mode-checkbox"
            type="checkbox"
            checked={insertAsUnicode}
            onChange={(e) => setInsertAsUnicode(e.target.checked)}
          />
          <span>Insert as plain text instead of LaTeX formatting</span>
        </label>
      </div>

      <CKEditor
        editor={ClassicEditor}
        data={value}
        onReady={handleEditorReady}
        config={{
          licenseKey: 'GPL',
          plugins: [
            Essentials, Bold, Italic, Underline, Paragraph, Heading,
            Table, TableToolbar, TableCellProperties, TableProperties,
            List, Link, Undo,
            MathInlinePlugin,
            ToolbarPlugin,
          ],
          toolbar: {
            items: [
              'heading', '|',
              'bold', 'italic', 'underline', '|',
              'bulletedList', 'numberedList', '|',
              'insertTable', '|',
              'link', '|',
              'mathType', 'chemType', '|',
              'undo', 'redo',
            ],
          },
          table: {
            contentToolbar: [
              'tableColumn', 'tableRow', 'mergeTableCells',
              'tableProperties', 'tableCellProperties',
            ],
          },
        }}
        onChange={(event, editor) => {
          if (onChange) onChange(editor.getData());
        }}
      />

      {popup && (
        <MathChemPopup
          mode={popup}
          onInsert={handleInsert}
          onClose={closePopup}
          initialLatex={editingWidget?.latex || ''}
          initialDirection={editingWidget?.direction || 'ltr'}
          isEditing={!!editingWidget}
        />
      )}
    </div>
  );
}

export default CkEditor;

