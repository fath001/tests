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

  if (!resolvedLatex) return;

  if (resolvedModel) {
    editor.model.change((writer) => {
      writer.setSelection(resolvedModel, 'on');
    });
  }

  const handler = editor.mathWidgetClickHandler || window.__ckMathWidgetClickHandler;
  handler?.(resolvedModel, resolvedLatex);
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
      { type: 'dropdown', label: 'Font...' },
      { type: 'dropdown', label: 'Size' }
    ]
  },
  {
    label: '±×÷', items: [
      { label: '±', insert: '\\pm' }, { label: '∓', insert: '\\mp' },
      { label: '×', insert: '\\times' }, { label: '÷', insert: '\\div' },
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
      { label: 'a/b', insert: '\\frac{#0}{#?}', title: 'Fraction', icon: 'fraction-template-image' }, { label: 'xⁿ', insert: '#0^{#?}', title: 'Superscript', icon: 'superscript-template-image' },
      { label: 'xₙ', insert: '#0_{#?}', title: 'Subscript', icon: 'subscript-template-image' }, { label: '√x', insert: '\\sqrt{#0}', title: 'Square Root', icon: 'sqrt-template-image' },
      { label: 'ⁿ√x', insert: '\\sqrt[#?]{#0}', title: 'Nth Root', icon: 'nth-root-template-image' }, { label: '(□)', insert: '\\left(#0\\right)' },
      { label: '[□]', insert: '\\left[#0\\right]' }, { label: '{□}', insert: '\\left\\{#0\\right\\}' },
      { label: '⟨□⟩', insert: '\\left\\langle #0 \\right\\rangle' }, { label: '|□|', insert: '\\left|#0\\right|' },
      { label: 'x̅', insert: '\\overline{#0}', title: 'Overline', icon: 'overline-template-image' }, { label: 'x̲', insert: '\\underline{#0}', title: 'Underline', icon: 'underline-template-image' },
      { label: '□!', insert: '{#0}!' }, { label: '□(mod□)', insert: '#0 \\pmod{#?}' },
      { label: 'lim', insert: '\\lim_{#?}', title: 'Limit', icon: 'limit-template-image' }, { label: '∫dx', insert: '\\int_{#?}^{#?}', title: 'Integral with Limits', icon: 'integral-limits-template-image' },
      { label: '∑', insert: '\\sum_{#?}^{#?}', title: 'Summation with Limits', icon: 'summation-template-image' }, { label: 'vec', insert: '\\vec{#0}', title: 'Vector', icon: 'vector-template-image' },
      { label: '(a/b)', insert: '\\left(\\frac{#0}{#?}\\right)', title: 'Fraction in Parentheses', icon: 'paren-fraction-template-image' },
      { label: '[a/b]', insert: '\\left[\\frac{#0}{#?}\\right]', title: 'Fraction in Brackets', icon: 'bracket-fraction-template-image' },
      { label: '{a/b}', insert: '\\left\\{\\frac{#0}{#?}\\right\\}', title: 'Fraction in Braces', icon: 'brace-fraction-template-image' },
      { label: 'xᵃ/ᵇ', insert: '#0^{\\frac{#?}{#?}}', title: 'Fraction Exponent', icon: 'fraction-exponent-template-image' },
      { label: 'xₐᵇ', insert: '#0_{#?}^{#?}', title: 'Subscript and Superscript', icon: 'subsup-template-image' },
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

      { type: 'sep', cols: 3 },
      { label: '⟶', insert: '\\longrightarrow' }, { label: '⟵', insert: '\\longleftarrow' },
      { label: '⟷', insert: '\\longleftrightarrow' }, { label: '⟹', insert: '\\Longrightarrow' },
      { label: '⟸', insert: '\\Longleftarrow' }, { label: '⟺', insert: '\\Longleftrightarrow' },
      { label: '↤', insert: '\\mapsfrom' }, { label: '↦', insert: '\\mapsto' },

      { type: 'sep', cols: 3 },
      { label: 'A→', insert: '\\xrightarrow{#0}', title: 'Arrow with label above', icon: 'arrow-label-right-above' },
      { label: 'A←', insert: '\\xleftarrow{#0}', title: 'Left arrow with label above', icon: 'arrow-label-left-above' },
      { label: '→A', insert: '\\xrightarrow[#?]{}', title: 'Arrow with label below', icon: 'arrow-label-right-below' },
      { label: 'A→B', insert: '\\xrightarrow[#?]{#0}', title: 'Arrow with labels above and below', icon: 'arrow-label-right-above-below' },
      { label: '←A', insert: '\\xleftarrow[#?]{}', title: 'Left arrow with label below', icon: 'arrow-label-left-below' },
      { label: 'A←B', insert: '\\xleftarrow[#?]{#0}', title: 'Left arrow with labels above and below', icon: 'arrow-label-left-above-below' },

      { type: 'sep', cols: 3 },
      { label: '⇌', insert: '\\rightleftharpoons', title: 'Equilibrium harpoons' },
      { label: '⇋', insert: '\\leftrightharpoons', title: 'Reverse equilibrium harpoons' },
      { label: '⇀', insert: '\\rightharpoonup', title: 'Right harpoon' },
      { label: '↼', insert: '\\leftharpoonup', title: 'Left harpoon' },

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
      { label: '∖', insert: '\\setminus' }, { label: '∩', insert: '\\cap' },
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
      { label: '()', insert: 'pmatrix', cls: 'template' },
      { label: '||', insert: 'vmatrix', cls: 'template' },
      { label: '□ □ □', insert: '\\begin{matrix} #? & #? & #? \\end{matrix}', cls: 'template', directInsert: true },
      { label: '□ \\ □', insert: '\\begin{bmatrix} #? \\\\ #? \\end{bmatrix}', cls: 'template', directInsert: true },
      { label: '□ & □', insert: '\\begin{bmatrix} #? & #? \\end{bmatrix}', cls: 'template', directInsert: true },
      { label: '□ \\ □', insert: '\\begin{pmatrix} #? \\\\ #? \\end{pmatrix}', cls: 'template', directInsert: true },
      { label: '□ & □', insert: '\\begin{pmatrix} #? & #? \\end{pmatrix}', cls: 'template', directInsert: true },
      { label: '□ \\ □ \\ □', insert: '\\begin{bmatrix} #? \\\\ #? \\\\ #? \\end{bmatrix}', cls: 'template', directInsert: true },
      { label: '□ \\ □ \\ □', insert: '\\begin{pmatrix} #? \\\\ #? \\\\ #? \\end{pmatrix}', cls: 'template', directInsert: true },
      { label: 'I₂', insert: '\\begin{bmatrix} 1 & 0 \\\\ 0 & 1 \\end{bmatrix}', cls: 'template', directInsert: true },
      { label: 'I₃', insert: '\\begin{bmatrix} 1 & 0 & 0 \\\\ 0 & 1 & 0 \\\\ 0 & 0 & 1 \\end{bmatrix}', cls: 'template', directInsert: true },
      { label: 'O₂', insert: '\\begin{bmatrix} 0 & 0 \\\\ 0 & 0 \\end{bmatrix}', cls: 'template', directInsert: true },
      { label: 'O₃', insert: '\\begin{bmatrix} 0 & 0 & 0 \\\\ 0 & 0 & 0 \\\\ 0 & 0 & 0 \\end{bmatrix}', cls: 'template', directInsert: true },
    ]
  },
];

const RELATIONS_TAB_ITEMS = [
  { label: 'cancel', insert: '\\cancel{#0}', title: 'Negate / Cross Out', icon: 'negate-template-image' },
  { type: 'sep', cols: 1 },
  { label: '+', insert: '+' },
  { label: '×', insert: '\\times' },
  { label: '·', insert: '\\cdot' },
  { label: '−', insert: '-' },
  { label: '÷', insert: '\\div' },
  { label: '/', insert: '/' },
  { label: '±', insert: '\\pm' },
  { label: '*', insert: '\\ast' },
  { label: '°', insert: '\\degree' },

  { type: 'sep', cols: 5 },
  { label: 'π', insert: '\\pi' },
  { label: '∂', insert: '\\partial' },
  { label: '°', insert: '\\degree' },
  { label: '∞', insert: '\\infty' },
  { label: 'Δ', insert: '\\Delta' },
  { label: '′', insert: "'" },
  { label: '∅', insert: '\\emptyset' },
  { label: '∇', insert: '\\nabla' },
  { label: '″', insert: "''" },

  { type: 'sep', cols: 3 },
  { label: '=', insert: '=' },
  { label: '≡', insert: '\\equiv' },
  { label: '~', insert: '\\sim' },
  { label: '≈', insert: '\\approx' },
  { label: '≃', insert: '\\simeq' },
  { label: '≅', insert: '\\cong' },

  { type: 'sep', cols: 3 },
  { label: '>', insert: '>' },
  { label: '<', insert: '<' },
  { label: '≥', insert: '\\geq' },
  { label: '≤', insert: '\\leq' },
  { label: '≫', insert: '\\gg' },
  { label: '≪', insert: '\\ll' },

  { type: 'sep', cols: 3 },
  { label: '∈', insert: '\\in' },
  { label: '∋', insert: '\\ni' },
  { label: '∪', insert: '\\cup' },
  { label: '∩', insert: '\\cap' },
  { label: '⊂', insert: '\\subset' },
  { label: '⊃', insert: '\\supset' },

  { type: 'sep', cols: 3 },
  { label: '∧', insert: '\\land' },
  { label: '∨', insert: '\\lor' },
  { label: '¬', insert: '\\neg' },
  { label: '∀', insert: '\\forall' },
  { label: '∃', insert: '\\exists' },
  { label: '∄', insert: '\\nexists' },

  { type: 'sep', cols: 2 },
  { label: '∠', insert: '\\angle' },
  { label: '∥', insert: '\\parallel' },
  { label: '⊥', insert: '\\perp' },

  { type: 'sep', cols: 3 },
  { label: '□', insert: '\\square' },
  { label: '⊕', insert: '\\oplus' },
  { label: '△', insert: '\\triangle' },
  { label: '⊗', insert: '\\otimes' },
  { label: '○', insert: '\\bigcirc' },
  { label: '⊙', insert: '\\odot' },
];

const ORDERED_MATH_GROUPS = [
  {
    id: 'roots-main',
    label: <TabIcon top="√□" bottom="□/□" />,
    items: [
      // GROUP 1 - Fractions & Roots (cols: 2)
      { label: '□/□', insert: '\\frac{#0}{#?}', title: 'Fraction', cls: 'green-template', icon: 'stacked-fraction' },
      { label: '√□', insert: '\\sqrt{#0}', title: 'Square Root', cls: 'green-template', icon: 'square-root-template' },
      { label: '□/□', insert: '{#0}/{#?}', title: 'Bevelled Fraction', cls: 'green-template' },
      { label: '□√□', insert: '\\sqrt[#?]{#0}', title: 'Root', cls: 'green-template', icon: 'nth-root-template' },
      { type: 'sep', cols: 2 },
      // GROUP 2a - Brackets (cols: 2)
      { label: '(□)', insert: '\\left(#0\\right)', title: 'Parentheses', cls: 'green-template' },
      { label: '[□]', insert: '\\left[#0\\right]', title: 'Square Brackets', cls: 'green-template' },
      { label: '|□|', insert: '\\left|#0\\right|', title: 'Absolute Value', cls: 'green-template' },
      { label: '{□}', insert: '\\left\\{#0\\right\\}', title: 'Curly Braces', cls: 'green-template' },
      { type: 'sep', cols: 1 },
      // GROUP 2b - Super/Subscript (cols: 1)
      { label: '□^□', insert: '#0^{#?}', title: 'Superscript', cls: 'green-template', icon: 'superscript-template' },
      { label: '□_□', insert: '#0_{#?}', title: 'Subscript', cls: 'green-template', icon: 'subscript-template' },
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
      { label: '=', insert: '=' },
      { label: '∩', insert: '\\cap' },
      { label: '⊂', insert: '\\subset' },
      { label: '≤', insert: '\\leq' },
      { label: '≠', insert: '\\neq' },
      { label: '∈', insert: '\\in' },
      { label: '∪', insert: '\\cup' },
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
    label: <TabIcon top="→⋯" compact />,
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

      { category: 'Uppercase Greek Letters', label: 'Ν', insert: 'Ν' },
      { category: 'Uppercase Greek Letters', label: 'Ζ', insert: 'Ζ' },
      { category: 'Uppercase Greek Letters', label: 'Θ', insert: '\\Theta' },
      { category: 'Uppercase Greek Letters', label: 'Ξ', insert: '\\Xi' },
      { category: 'Uppercase Greek Letters', label: 'Ρ', insert: 'Ρ' },
      { category: 'Uppercase Greek Letters', label: 'Π', insert: '\\Pi' },

      { category: 'Fraktur / Gothic Symbols', label: 'ℜ', insert: '\\Re' },
      { category: 'Fraktur / Gothic Symbols', label: '𝔄', insert: '\\mathfrak{A}' },
      { category: 'Fraktur / Gothic Symbols', label: 'ℑ', insert: '\\Im' },
      { category: 'Fraktur / Gothic Symbols', label: '𝔉', insert: '\\mathfrak{F}' },
      { category: 'Fraktur / Gothic Symbols', label: 'ℭ', insert: '\\mathfrak{C}' },
      { category: 'Fraktur / Gothic Symbols', label: '𝔅', insert: '\\mathfrak{B}' },

      { category: 'Hebrew Mathematical Symbols', label: 'ℵ', insert: '\\aleph' },
      { category: 'Hebrew Mathematical Symbols', label: 'ℶ', insert: '\\beth' },
      { category: 'Hebrew Mathematical Symbols', label: 'ℷ', insert: '\\gimel' },

      { category: 'Blackboard Bold / Number Sets', label: 'ℍ', insert: '\\mathbb{H}' },
      { category: 'Blackboard Bold / Number Sets', label: 'ℂ', insert: '\\mathbb{C}' },
      { category: 'Blackboard Bold / Number Sets', label: 'ℕ', insert: '\\mathbb{N}' },
      { category: 'Blackboard Bold / Number Sets', label: '𝕆', insert: '\\mathbb{O}' },
      { category: 'Blackboard Bold / Number Sets', label: '𝔽', insert: '\\mathbb{F}' },
      { category: 'Blackboard Bold / Number Sets', label: '𝕊', insert: '\\mathbb{S}' },
    ],
  },
  {
    id: 'matrix',
    ...MATH_GROUPS[11],
    label: <TabIcon top="⌗⌘" compact />,
  },
  {
    id: 'power-frac',
    ...MATH_GROUPS[2],
    label: <TabIcon top="□^□" bottom="□_□" />,
  },
  {
    id: 'brackets',
    label: <TabIcon top="( )[ ]" compact />,
    items: [
      { label: '(□)', insert: '\\left(#0\\right)' },
      { label: '[□]', insert: '\\left[#0\\right]' },
      { label: '{□}', insert: '\\left\\{#0\\right\\}' },
      { label: '⟨□⟩', insert: '\\left\\langle #0 \\right\\rangle' },
      { label: '|□|', insert: '\\left|#0\\right|' },
      { label: '⌊□⌋', insert: '\\left\\lfloor #0 \\right\\rfloor' },
      { label: '⌈□⌉', insert: '\\left\\lceil #0 \\right\\rceil' },
      { label: '(□]', insert: '\\left(#0\\right]' },
      { label: '[□)', insert: '\\left[#0\\right)' },
      { label: '‖□‖', insert: '\\left\\| #0 \\right\\|' },
      { label: '{□ □}', insert: '\\left\\{ #0, #? \\right\\}' },
      { label: '[□ □]', insert: '\\left[#0, #?\\right]' },
      { label: '(□ □)', insert: '\\left(#0, #?\\right)' },
    ],
  },
  {
    id: 'sets',
    label: <TabIcon top="Σ ∪" compact />,
    items: [
      { label: 'Σ', insert: '\\sum' },
      { label: '∏', insert: '\\prod' },
      { label: '∪', insert: '\\cup' },
      { label: '∩', insert: '\\cap' },
      { label: '⊂', insert: '\\subset' },
      { label: '⊆', insert: '\\subseteq' },
      { label: '⊃', insert: '\\supset' },
      { label: '⊇', insert: '\\supseteq' },
      { label: '∈', insert: '\\in' },
      { label: '∉', insert: '\\notin' },
      { label: '∅', insert: '\\emptyset' },
      { label: '∖', insert: '\\setminus' },
      { label: '∀', insert: '\\forall' },
      { label: '∃', insert: '\\exists' },
      { label: '¬', insert: '\\neg' },
      { label: '∧', insert: '\\land' },
      { label: '∨', insert: '\\lor' },
      { label: '□⊂□', insert: '#? \\subset #?' },
      { label: '□⊆□', insert: '#? \\subseteq #?' },
      { label: '□∈□', insert: '#? \\in #?' },
      { label: '□∉□', insert: '#? \\notin #?' },
      { label: '□∪□', insert: '#? \\cup #?' },
      { label: '□∩□', insert: '#? \\cap #?' },
      { label: '□⇒□', insert: '#? \\Rightarrow #?' },
      { label: '□⇔□', insert: '#? \\Leftrightarrow #?' },
    ],
  },
  {
    id: 'calc',
    label: <TabIcon top="∫" bottom="lim" />,
    isTemplate: true,
    items: [
      { label: '∫', insert: '\\int' },
      { label: '∬', insert: '\\iint' },
      { label: '∭', insert: '\\iiint' },
      { label: '∮', insert: '\\oint' },
      { label: '∯', insert: '\\oiint' },
      { label: '∰', insert: '\\oiiint' },
      { label: '∫dx', insert: '\\int #0 \\, d#?', icon: 'integral-with-differential' },
      { label: '∫ₐᵇ', insert: '\\int_{#?}^{#?} #0 \\, d#?', icon: 'integral-with-limits-differential' },
      { label: '∬dA', insert: '\\iint_{#?} #0 \\, dA', title: 'Double Integral with Area Element', icon: 'double-integral-area-template-image' },
      { label: 'F(b)-F(a)', insert: '\\left[#0\\right]_{#?}^{#?}', title: 'Evaluated Expression', icon: 'evaluated-expression-template-image' },
      { label: 'd/dx', insert: '\\frac{d}{dx}' },
      { label: 'dy/dx', insert: '\\frac{dy}{dx}' },
      { label: 'd²y/dx²', insert: '\\frac{d^{2}y}{dx^{2}}' },
      { label: '∂/∂x', insert: '\\frac{\\partial}{\\partial x}' },
      { label: '∂□/∂x', insert: '\\frac{\\partial #0}{\\partial x}' },
      { label: '∇□', insert: '\\nabla #0' },
      { label: '∇²□', insert: '\\nabla^{2} #0' },
      { label: 'lim', insert: '\\lim_{#?}' },
      { label: 'log', insert: '\\log' },
      { label: 'ln', insert: '\\ln' },
      { label: 'eˣ', insert: 'e^{#0}', title: 'e to the Power', icon: 'exp-e-template-image' },
      { label: 'aˣ', insert: '#?^{#0}', title: 'Base to the Power', icon: 'exp-generic-template-image' },
      { label: 'sin', insert: '\\sin' },
      { label: 'cos', insert: '\\cos' },
      { label: 'tan', insert: '\\tan' },
      { label: 'sin⁻¹', insert: '\\sin^{-1}' },
      { label: 'exp', insert: '\\exp' },
    ],
  },
  {
    id: 'format',
    label: <TabIcon top="↺" compact />,
    items: [
      { type: 'dropdown', label: 'Font...', width: '92px' },
      { type: 'dropdown', label: 'Size', width: '72px' },
      { type: 'sep', cols: 2 },
      { label: 'sin(□)', insert: '\\sin\\left(#0\\right)' },
      { label: 'cos(□)', insert: '\\cos\\left(#0\\right)' },
      { label: 'tan(□)', insert: '\\tan\\left(#0\\right)' },
      { label: 'log₁₀', insert: '\\log_{10}' },
      { label: 'log₂', insert: '\\log_{2}' },
      { label: 'ln(□)', insert: '\\ln\\left(#0\\right)' },
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
      allowAttributes: ['latex'],
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
        const widgetId = 'math-' + Math.random().toString(36).substr(2, 9);

        // Save mapping to bypass domConverter later
        window.__ckMathWidgets.set(widgetId, modelElement);

        const container = writer.createContainerElement('span', {
          class: 'ck-math-widget ck-math-inline-word',
          contenteditable: 'false',
          'data-math-id': widgetId,
          'data-latex': latex,
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
        const span = writer.createContainerElement('span', {
          class: 'math-tex',
          'data-latex': latex,
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
        return writer.createElement('mathInline', { latex });
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
  'integral-with-differential': makeToolbarIconImage(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 18 18">
      <text x="0.95" y="13.85" font-size="14.6" font-family="Cambria Math, STIX Two Math, Times New Roman, serif" font-weight="700" fill="#37474f">∫</text>
      <rect x="6.55" y="6.15" width="3.05" height="3.05" rx="0.48" fill="none" stroke="#4a5559" stroke-width="1.15"/>
      <text x="10.55" y="8.95" font-size="4.95" font-family="Arial, Helvetica, sans-serif" font-weight="700" fill="#37474f">d</text>
      <rect x="13.15" y="6.15" width="3.05" height="3.05" rx="0.48" fill="none" stroke="#4a5559" stroke-width="1.15"/>
    </svg>
  `),
  'integral-with-limits-differential': makeToolbarIconImage(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 18 18">
      <text x="0.85" y="14.05" font-size="14.4" font-family="Cambria Math, STIX Two Math, Times New Roman, serif" font-weight="700" fill="#37474f">∫</text>
      <rect x="5.15" y="1.15" width="2.45" height="2.45" rx="0.42" fill="none" stroke="#4a5559" stroke-width="1.15"/>
      <rect x="2.15" y="13.1" width="2.45" height="2.45" rx="0.42" fill="none" stroke="#4a5559" stroke-width="1.15"/>
      <rect x="8.45" y="6.95" width="3.45" height="3.45" rx="0.55" fill="none" stroke="#4a5559" stroke-width="1.2"/>
      <text x="12.45" y="9.85" font-size="5.15" font-family="Arial, Helvetica, sans-serif" font-weight="700" fill="#37474f">d</text>
      <rect x="14.15" y="6.95" width="2.9" height="3.45" rx="0.5" fill="none" stroke="#4a5559" stroke-width="1.2"/>
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
};

function renderToolbarItemLabel(item, context = {}) {
  if (
    item.icon === 'fraction-template-image' ||
    item.icon === 'superscript-template-image' ||
    item.icon === 'sqrt-template-image' ||
    item.icon === 'subscript-template-image' ||
    item.icon === 'nth-root-template-image' ||
    item.icon === 'overline-template-image' ||
    item.icon === 'underline-template-image' ||
    item.icon === 'limit-template-image' ||
    item.icon === 'integral-limits-template-image' ||
    item.icon === 'vector-template-image' ||
    item.icon === 'summation-template-image' ||
    item.icon === 'paren-fraction-template-image' ||
    item.icon === 'brace-fraction-template-image' ||
    item.icon === 'bracket-fraction-template-image' ||
    item.icon === 'subsup-template-image' ||
    item.icon === 'fraction-exponent-template-image' ||
    item.icon === 'double-integral-area-template-image' ||
    item.icon === 'exp-e-template-image' ||
    item.icon === 'exp-generic-template-image' ||
    item.icon === 'evaluated-expression-template-image' ||
    item.icon === 'rtl-input-template-image' ||
    item.icon === 'negate-template-image' ||
    item.icon === 'integral-with-differential' ||
    item.icon === 'integral-with-limits-differential'
  ) {
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
    item.icon === 'arrow-label-right-above-below' ||
    item.icon === 'arrow-label-left-above-below'
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
      }
    };
    const layout = arrowLayouts[item.icon];
    const { direction, arrowY, topBox, bottomBox } = layout;
    const arrowGraphic =
      direction === 'left'
        ? <path d={`M5.1 ${arrowY - 1.55}L2.55 ${arrowY}L5.1 ${arrowY + 1.55}M2.95 ${arrowY}H14.9`} />
        : direction === 'both'
          ? <path d={`M5.1 ${arrowY - 1.55}L2.55 ${arrowY}L5.1 ${arrowY + 1.55}M2.95 ${arrowY}H15.05M12.5 ${arrowY - 1.55}L15.05 ${arrowY}L12.5 ${arrowY + 1.55}`} />
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
          <span className="cme-counter-val">{hoverGrid.r}</span>
          <div className="cme-counter-btns">
            <button type="button" onClick={() => setHoverGrid(prev => ({ ...prev, r: Math.min(10, prev.r + 1) }))}>+</button>
            <button type="button" onClick={() => setHoverGrid(prev => ({ ...prev, r: Math.max(1, prev.r - 1) }))}>-</button>
          </div>
        </div>
        <div className="cme-matrix-counter">
          <span className="cme-counter-label">C</span>
          <span className="cme-counter-val">{hoverGrid.c}</span>
          <div className="cme-counter-btns">
            <button type="button" onClick={() => setHoverGrid(prev => ({ ...prev, c: Math.min(10, prev.c + 1) }))}>+</button>
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
function MathChemPopup({ mode, onInsert, onClose, initialLatex, isEditing }) {
  const popupMfRef = useRef(null);
  const [activeGroup, setActiveGroup] = useState(0);
  const [activeMatrix, setActiveMatrix] = useState(null); // { type, x, y }
  const [showSpecialChars, setShowSpecialChars] = useState(null); // { x, y } or null
  const [showColorPicker, setShowColorPicker] = useState(null); // { x, y } or null
  const [windowMode, setWindowMode] = useState('normal');
  const [activeToolbarItem, setActiveToolbarItem] = useState(null);
  const [isRtlInput, setIsRtlInput] = useState(false);
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
    fontFamily: 'none',
    fontSize: 'auto'
  });

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

      const currentFont = ['roman', 'sans-serif', 'monospace'].find(
        (f) => mf.queryStyle({ fontFamily: f }) === 'all'
      ) || 'none';

      const currentSize = [5, 7, 9].find(
        (sz) => mf.queryStyle({ fontSize: sz }) === 'all'
      ) || 'auto';

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
        fontFamily: currentFont,
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
    if (styleState.fontFamily !== 'none') {
      mf.applyStyle({ fontFamily: styleState.fontFamily });
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


  useEffect(() => {
    if (!activeMatrix && !showColorPicker) return;
    const handleOutsideClick = (e) => {
      if (!e.target.closest('.cme-matrix-hover-popover') && !e.target.closest('.cme-matrix-btn-wrapper')) {
        setActiveMatrix(null);
      }
      if (!e.target.closest('.cme-color-picker-popup') && !e.target.closest('[title="Text Color"]')) {
        setShowColorPicker(null);
      }
    };
    window.addEventListener('mousedown', handleOutsideClick, true);
    window.addEventListener('pointerdown', handleOutsideClick, true);
    return () => {
      window.removeEventListener('mousedown', handleOutsideClick, true);
      window.removeEventListener('pointerdown', handleOutsideClick, true);
    };
  }, [activeMatrix, showColorPicker]);

  useEffect(() => {
    const mf = popupMfRef.current;
    if (!mf) return;
    mf.defaultMode = mode === 'chem' ? 'text' : 'math';
    mf.letterShapeStyle = 'upright';

    // Pre-fill with existing value when editing
    const prefill = () => {
      if (initialLatex) {
        // For chem, unwrap \ce{...} so user edits raw content
        let valueToSet = initialLatex;
        if (mode === 'chem') {
          const ceMatch = valueToSet.match(/^\\ce\{([\s\S]*)\}$/);
          if (ceMatch) valueToSet = ceMatch[1];
        }
        if (mf.setValue) mf.setValue(valueToSet, { silenceNotifications: true });
        else mf.value = valueToSet;
      }
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
      if (e.key === ' ') {
        e.preventDefault();
        if (isRtlInput) {
          writeValue(`\\, ${readValue()}`);
        } else {
          mf.executeCommand(['insert', '\\, ']);
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

      const isPlainTypingKey =
        e.key.length === 1 &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey;

      if (isRtlInput && isPlainTypingKey) {
        e.preventDefault();
        writeValue(`${e.key}${readValue()}`);
      }
    };
    mf.addEventListener('keydown', handleKeyDown);
    return () => mf.removeEventListener('keydown', handleKeyDown);
  }, [mode, activeStyles, applyCurrentTypingStyles, updateActiveStyles, isRtlInput]);



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
      setActiveToolbarItem(null);
      onClose();
      return;
    }
    if (mode === 'chem') latex = serializeChemValue(latex);
    onInsert(latex);
    if (mf.setValue) mf.setValue(''); else mf.value = '';
    setActiveToolbarItem(null);
    onClose();
  };

  return (
    <div className={`cme-editor-popup ${windowMode}`} onMouseDown={(e) => e.stopPropagation()}>
      <div className="cme-popup-header">
        <span>{mode === 'math' ? 'MathType' : 'ChemType'}</span>
        <div className="cme-popup-actions">
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
              setActiveToolbarItem(null);
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

        <div className={`cme-toolbar-items${activeGroupConfig.id === 'greek' ? ' cme-toolbar-items--greek' : ''}${isMathMode ? ' cme-toolbar-items--math-compact' : ''}`}>
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
                          const isTouchedButton = activeToolbarItem === buttonKey;

                          return (
                            <button
                              key={buttonKey}
                              type="button"
                              className={`cme-btn cme-greek-btn${isMathMode ? ' cme-btn--compact' : ''}${item.cls ? ` ${item.cls}` : ''}${isTouchedButton ? ' active' : ''}`}
                              title={item.title || item.insert}
                              onMouseDown={(e) => {
                                e.preventDefault();
                                setActiveToolbarItem(buttonKey);
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

                    const isFontActive = isFont && activeStyles.fontFamily !== 'none';
                    const isSizeActive = isSize && activeStyles.fontSize !== 'auto' && activeStyles.fontSize !== '5';
                    const isTouchedSelect = activeToolbarItem === buttonKey;

                    const selectValue = isFont
                      ? (activeStyles.fontFamily === 'none' ? '' : activeStyles.fontFamily)
                      : (isSize
                        ? (activeStyles.fontSize === 'auto' || activeStyles.fontSize === '5' ? '' : activeStyles.fontSize)
                        : '');

                    return (
                      <select
                        key={i}
                        className={`cme-btn template${isFontActive || isSizeActive || isTouchedSelect ? ' active' : ''}`}
                        value={selectValue}
                        style={{
                          width: item.width || '60px',
                          height: '18px',
                          minHeight: '18px',
                          maxHeight: '18px',
                          lineHeight: '18px',
                          boxSizing: 'border-box',
                          marginTop: "10px",
                          fontSize: '10px',
                          padding: '0',
                          margin: '2px 0',
                          gridColumn: (subgroup.cols === 3) ? 'span 1' : ((subgroup.cols === 1) ? 'span 1' : 'span 2')
                        }}
                        onChange={(e) => {
                          const val = e.target.value;
                          const mf = popupMfRef.current;
                          if (!mf || typeof mf.applyStyle !== 'function') return;
                          setActiveToolbarItem(buttonKey);
                          mf.focus();
                          if (isFont) {
                            mf.applyStyle({ fontFamily: val || 'none' });
                          } else if (isSize) {
                            mf.applyStyle({ fontSize: val ? parseInt(val, 10) : 'auto' });
                          }
                          updateActiveStyles();
                        }}
                      >
                        <option value="">{item.label}</option>
                        {isFont && (
                          <>
                            <option value="roman">Times</option>
                            <option value="sans-serif">Helvetica</option>
                            <option value="monospace">Courier</option>
                          </>
                        )}
                        {isSize && (
                          <>
                            <option value="5">12px</option>
                            <option value="7">16px</option>
                            <option value="9">20px</option>
                          </>
                        )}
                      </select>
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
                        className={`cme-btn template${isMathMode ? ' cme-btn--compact' : ''}${item.cls ? ` ${item.cls}` : ''}${activeToolbarItem === buttonKey || activeMatrix?.type === item.insert ? ' active' : ''}`}
                          title={item.insert}
                          onMouseDown={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setActiveToolbarItem(buttonKey);
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
                  const isBtnActive =
                    (isBoldBtn && activeStyles.bold && !activeStyles.italic) ||
                    (isItalicBtn && activeStyles.italic && !activeStyles.bold) ||
                    (isBoldItalicBtn && activeStyles.boldItalic) ||
                    (isRtlBtn && isRtlInput) ||
                    (isColorBtn && activeStyles.color !== 'none') ||
                    (!isRtlBtn && activeToolbarItem === buttonKey);

                  return (
                    <button
                      key={`${groupKey}-${chunkIndex * 4 + i}`}
                      type="button"
                      className={`cme-btn${currentGroup.isTemplate ? ' template' : ''}${isMathMode ? ' cme-btn--compact' : ''}${item.cls ? ` ${item.cls}` : ''}${isBtnActive ? ' active' : ''}`}
                      title={item.title || item.insert}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        setActiveToolbarItem(buttonKey);
                        const mf = popupMfRef.current;
                        if (item.action === 'SPECIAL_CHARS') {
                          const rect = e.currentTarget.getBoundingClientRect();
                          setShowSpecialChars({ x: rect.left, y: rect.bottom + 4 });
                        } else if (item.action === 'TEXT_COLOR') {
                          const rect = e.currentTarget.getBoundingClientRect();
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
                                insertAtCursor(text);
                              }
                            }).catch(() => {});
                          }
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
    ['\\cdot', '·'], ['\\neq', '≠'], ['\\leq', '≤'], ['\\geq', '≥'],
    ['\\approx', '≈'], ['\\equiv', '≡'], ['\\infty', '∞'],
    ['\\sum', '∑'], ['\\prod', '∏'], ['\\int', '∫'], ['\\oint', '∮'],
    ['\\iint', '∬'], ['\\iiint', '∭'], ['\\oiint', '∯'],
    ['\\partial', '∂'], ['\\nabla', '∇'],
    ['\\in', '∈'], ['\\notin', '∉'],
    ['\\subset', '⊂'], ['\\subseteq', '⊆'], ['\\supset', '⊃'], ['\\supseteq', '⊇'],
    ['\\cup', '∪'], ['\\cap', '∩'], ['\\emptyset', '∅'], ['\\setminus', '∖'],
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
    ['\\mathbb{R}', 'ℝ'], ['\\mathbb{Z}', 'ℤ'], ['\\mathbb{N}', 'ℕ'], ['\\mathbb{Q}', 'ℚ'],
    ['\\mathbb{C}', 'ℂ'],
    // Delimiters
    ['\\left(', '('], ['\\right)', ')'],
    ['\\left[', '['], ['\\right]', ']'],
    ['\\left|', '|'], ['\\right|', '|'],
    ['\\left\\{', '{'], ['\\right\\}', '}'],
    // Spacing
    ['\\,', ' '], ['\\;', ' '], ['\\quad', ' '], ['\\qquad', '  '],
    // Misc
    ['\\prime', '′'], ['\\cdots', '⋯'], ['\\ldots', '…'],
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
  const handleInsert = useCallback((latex) => {
    const editor = editorRef.current;
    if (!editor || !latex?.trim()) return;

    if (editingWidget) {
      const targetModel = isModelElementLive(editor, editingWidget.modelElement)
        ? editingWidget.modelElement
        : null;

      if (targetModel) {
        // ── EDIT MODE: replace widget so the math-field re-renders with new latex ──
        editor.model.change((writer) => {
          const mathElement = writer.createElement('mathInline', { latex: latex.trim() });
          const position = writer.createPositionBefore(targetModel);
          writer.insert(mathElement, position);
          writer.remove(targetModel);
          writer.setSelection(writer.createPositionAfter(mathElement));
        });
      } else {
        // Fallback: insert updated value at cursor if model reference was lost
        editor.model.change((writer) => {
          const mathElement = writer.createElement('mathInline', { latex: latex.trim() });
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
        const mathElement = writer.createElement('mathInline', { latex: latex.trim() });
        editor.model.insertContent(mathElement);
        editor.model.insertContent(writer.createText(' '));
      });
    }

    editor.editing.view.focus();
  }, [insertAsUnicode, editingWidget]);

  const ToolbarPlugin = useMemo(() => makeToolbarPlugin(openPopup), [openPopup]);

  const handleEditorReady = useCallback((editor) => {
    editorRef.current = editor;

    const openEditPopup = (modelElement, latex) => {
      if (popupOpenRef.current || !latex) return;

      const isChem = /^\\ce\{/.test(latex);
      popupOpenRef.current = true;
      setEditingWidget({ modelElement, latex });
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
          isEditing={!!editingWidget}
        />
      )}
    </div>
  );
}

export default CkEditor;
