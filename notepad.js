/* notepad.js
   Full Notepad implementation (single-file) with:
   - per-character colored spans
   - noteColorMap / colorMap / colorSequence / colorFunc
   - selection (click, drag, shift+click), copy/cut/paste
   - newline support (Enter -> <br>)
   - hit-testing that handles wrapped lines
   - API to change app/container background
   - exportAsImageWithP5 (prefers p5.createGraphics) with automatic canvas fallback
   - APIs to control font, letter padding and letter margin (affect existing and future letters)
   - NOTE: default fallback color array set to ['transparent'] if not provided
   - Inline font-family / font-size removed from individual spans so setFont(...) affects all letters via inheritance
*/

class Notepad {
  constructor(options = {}) {
    this.parent = options.parent || document.body;
    this.width = options.width || 600;
    this.height = options.height || 300;
    this.fontSize = options.fontSize || 20;
    this.fontFamily = options.fontFamily || 'monospace';
    // Default colors fallback (allow transparent spaces)
    this.colors = (options.colors && options.colors.length) ? options.colors : ['transparent'];
    this._containerPadding = (typeof options.containerPadding !== 'undefined') ? options.containerPadding : '0px';
    // Color rules
    this.noteColorMap = options.noteColorMap || null;
    this.colorMap = options.colorMap || null;
    this.colorSequence = options.colorSequence || null;
    this.colorFunc = options.colorFunc || null;
    this._seqIndex = 0;

    // Spacing / font defaults for letters (can be changed with API)
    this._letterPadY = (typeof options.letterPadY !== 'undefined') ? options.letterPadY : 2;
    this._letterPadX = (typeof options.letterPadX !== 'undefined') ? options.letterPadX : 4;
    this._letterMarginX = (typeof options.letterMarginX !== 'undefined') ? options.letterMarginX : 0; // px or string
    this._letterBorderRadius = (typeof options.letterBorderRadius !== 'undefined') ? options.letterBorderRadius : 4;
    this._letterBorderWidth = (typeof options.letterBorderWidth !== 'undefined') ? options.letterBorderWidth : 0;
    this._letterBorderColor = (typeof options.letterBorderColor !== 'undefined') ? options.letterBorderColor : '#000000';

    // State
    this.letterNodes = []; // array of DOM nodes (span for chars, br for newline)
    this.cursorPos = 0;
    this.selectionStart = null;
    this.selectionEnd = null;
    this.clipboard = []; // array of { text, color } ; newline as '\n'
    this.isDragging = false;
    this.handlers = {};

    // Build DOM and events
    this._build();
    this._attachEvents();
    this._render();
  }

  // ---------------- Public API ----------------

  focus() { try { this.textarea.focus(); } catch (e) { } }

  insertText(text) {
    for (let ch of text) {
      this._insertChar(ch);
    }
    this._emit('change');
    this._render();
  }

  getPlainText() {
    return this.letterNodes.map(node => (node.tagName === 'BR' ? '\n' : node.textContent)).join('');
  }

  getRichContent() {
    return this.letterNodes.map(node => (node.tagName === 'BR' ? { text: '\n', color: null } : { text: node.textContent, color: node.dataset.color || null }));
  }

  getDetailedJSON() {
    return this.letterNodes.map((node, index) => {
      if (node.tagName === 'BR') {
        return {
          index: index,
          char: '\n',
          type: 'newline',
          color: null,
          rgb: null
        };
      }

      const color = node.dataset.color || node.style.backgroundColor || 'transparent';
      const rgb = this._parseColor(color);

      return {
        index: index,
        char: node.textContent,
        type: 'character',
        color: color,
        rgb: rgb,
        padding: {
          y: this._letterPadY,
          x: this._letterPadX
        },
        margin: this._letterMarginX,
        borderRadius: this._letterBorderRadius,
        border: {
          width: this._letterBorderWidth,
          color: this._letterBorderColor
        }
      };
    });
  }

  _parseColor(colorString) {
    // Helper to parse color string to RGB object
    if (!colorString || colorString === 'transparent') {
      return null;
    }

    // Handle hex colors
    if (colorString.startsWith('#')) {
      const hex = colorString.slice(1);
      if (hex.length === 3) {
        return {
          r: parseInt(hex[0] + hex[0], 16),
          g: parseInt(hex[1] + hex[1], 16),
          b: parseInt(hex[2] + hex[2], 16)
        };
      } else if (hex.length === 6) {
        return {
          r: parseInt(hex.slice(0, 2), 16),
          g: parseInt(hex.slice(2, 4), 16),
          b: parseInt(hex.slice(4, 6), 16)
        };
      }
    }

    // Handle rgb/rgba colors
    const rgbMatch = colorString.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    if (rgbMatch) {
      return {
        r: parseInt(rgbMatch[1]),
        g: parseInt(rgbMatch[2]),
        b: parseInt(rgbMatch[3])
      };
    }

    return null;
  }

  setFromPlainText(text) {
    this._clearAll();
    for (let ch of text) this._insertChar(ch);
    this._render();
    this._emit('change');
  }

  setFromRichContent(arr) {
    this._clearAll();
    for (let item of arr) {
      if (item.text === '\n') this._insertNewline();
      else this._insertChar(item.text, item.color);
    }
    this._render();
    this._emit('change');
  }

  copy() {
    const range = this._getSelectionRange();
    if (!range) return;
    this.clipboard = [];
    for (let i = range.start; i < range.end; i++) {
      const n = this.letterNodes[i];
      if (n.tagName === 'BR') this.clipboard.push({ text: '\n', color: null });
      else this.clipboard.push({ text: n.textContent, color: n.dataset.color || null });
    }
    try {
      const plain = this.clipboard.map(o => o.text).join('');
      navigator.clipboard && navigator.clipboard.writeText(plain).catch(() => { });
    } catch (e) { }
    this._emit('copy', this.clipboard.slice());
  }

  cut() {
    const range = this._getSelectionRange();
    if (!range) return;
    this.copy();
    for (let i = range.end - 1; i >= range.start; i--) {
      this.letterNodes[i].remove();
      this.letterNodes.splice(i, 1);
    }
    this.cursorPos = range.start;
    this._clearSelection();
    this._render();
    this._emit('change');
  }

  paste() {
    if (!this.clipboard || this.clipboard.length === 0) return;
    const range = this._getSelectionRange();
    if (range) {
      for (let i = range.end - 1; i >= range.start; i--) {
        this.letterNodes[i].remove();
        this.letterNodes.splice(i, 1);
      }
      this.cursorPos = range.start;
      this._clearSelection();
    }
    for (let item of this.clipboard) {
      if (item.text === '\n') this._insertNewline();
      else this._insertChar(item.text, item.color);
    }
    this._emit('paste', this.clipboard.slice());
    this._render();
    this._emit('change');
  }

  // ---------------- Color & background API ----------------

  setNoteColorMap(map) { this.noteColorMap = map || null; this.recolor(); }
  setNoteColor(note, color) {
    if (!this.noteColorMap) this.noteColorMap = {};
    if (color == null) delete this.noteColorMap[note];
    else this.noteColorMap[note] = color;
    this.recolor();
  }
  setColorMap(map) { this.colorMap = map || null; this.recolor(); }
  setColorSequence(seq) { this.colorSequence = (Array.isArray(seq) && seq.length) ? seq.slice() : null; this._seqIndex = 0; this.recolor(); }
  setColorFunc(fn) { this.colorFunc = (typeof fn === 'function') ? fn : null; this.recolor(); }
  resetSequence() { this._seqIndex = 0; this.recolor(); }

  // change whole app background or container background
  setAppBackground(color) { try { document.body.style.backgroundColor = color; } catch (e) { } }
  setContainerBackground(color) { try { this.container.style.background = color; } catch (e) { } }

  setContainerPadding(padding) {
    this._containerPadding = padding;
    this.container.style.padding = padding;
    this._render();
  }

  setSize(w, h) {
    if (w) { this.width = w; this.container.style.width = w + 'px'; }
    if (h) { this.height = h; this.container.style.height = h + 'px'; }
  }

  setBorder(width, color, radius) {
    if (width !== null) this.container.style.borderWidth = width + 'px';
    if (color !== null) this.container.style.borderColor = color;
    if (radius !== null) this.container.style.borderRadius = radius + 'px';
    // Ensure style is solid if not set, though _build sets border: 1px solid #ccc
    this.container.style.borderStyle = 'solid';
  }

  setResizable(enabled) {
    if (enabled) {
      this.container.style.resize = 'both';
      this.container.style.overflow = 'auto';
    } else {
      this.container.style.resize = 'none';
    }
  }

  // Recolorize deterministically (used after changing maps)
  recolor() {
    for (let i = 0; i < this.letterNodes.length; i++) {
      const n = this.letterNodes[i];
      if (n.tagName === 'BR') continue;
      const ch = n.textContent;
      const col = this._deterministicColorForChar(ch, i);
      n.style.backgroundColor = col;
      n.dataset.color = col;
    }
    this._render();
  }

  // ---------------- Font / spacing API ----------------

  // Apply fontFamily and fontSize (affects container and existing letter nodes)
  // Note: spans do NOT have inline font-family/font-size so they inherit from container.
  setFont(fontFamily, fontSize) {
    if (fontFamily) {
      this.fontFamily = fontFamily;
      this.container.style.fontFamily = fontFamily;
    }
    if (fontSize) {
      this.fontSize = fontSize;
      this.container.style.fontSize = fontSize + 'px';
    }
    // remove inline font properties from spans so they inherit the container styles
    for (const n of this.letterNodes) {
      if (!n || n.tagName === 'BR') continue;
      n.style.removeProperty('font-family');
      n.style.removeProperty('font-size');
    }
    // update cursor height
    this.cursor.style.height = (this.fontSize + 4) + 'px';
  }

  // padding: padY (top/bottom) and padX (left/right) in px
  setLetterPadding(padY = 2, padX = 4) {
    this._letterPadY = padY;
    this._letterPadX = padX;
    for (const n of this.letterNodes) {
      if (!n || n.tagName === 'BR') continue;
      n.style.padding = `${padY}px ${padX}px`;
    }
  }

  setLetterBorderRadius(radius = 4) {
    this._letterBorderRadius = radius;
    for (const n of this.letterNodes) {
      if (!n || n.tagName === 'BR') continue;
      n.style.borderRadius = radius + 'px';
    }
  }

  setLetterBorder(width, color) {
    if (width !== null && width !== undefined) this._letterBorderWidth = width;
    if (color !== null && color !== undefined) this._letterBorderColor = color;
    for (const n of this.letterNodes) {
      if (!n || n.tagName === 'BR') continue;
      n.style.border = this._letterBorderWidth + 'px solid ' + this._letterBorderColor;
    }
  }

  // marginX: number => horizontal margin (px) applied as '0 ${marginX}px'
  // or string to provide full margin value
  setLetterMargin(marginX = 0) {
    this._letterMarginX = marginX;
    const val = (typeof marginX === 'number') ? `0 ${marginX}px` : marginX;
    for (const n of this.letterNodes) {
      if (!n || n.tagName === 'BR') continue;
      n.style.margin = val;
    }
  }

  // ---------------- Events ----------------
  on(eventName, fn) {
    if (!this.handlers[eventName]) this.handlers[eventName] = [];
    this.handlers[eventName].push(fn);
  }

  destroy() {
    this._detachEvents();
    this.container.remove();
  }

  // ---------------- Export: p5-based with canvas fallback ----------------

  // export using p5.createGraphics if available; otherwise uses native canvas fallback
  exportAsImageWithP5(filename = 'notepad.png', opts = {}) {
    // fallback automatically to canvas exporter if p5 global not available
    if (typeof window.createGraphics !== 'function') {
      if (typeof this.exportAsImageCanvas === 'function') {
        return this.exportAsImageCanvas(filename, opts);
      } else {
        return Promise.reject(new Error('p5.createGraphics no disponible y no existe fallback canvas.'));
      }
    }

    return new Promise((resolve, reject) => {
      const scale = opts.scale || 2;
      const background = (typeof opts.background !== 'undefined') ? opts.background : this.container.style.background;


      const width = Math.max(1, this.container.scrollWidth);
      const height = Math.max(1, this.container.scrollHeight);

      try {
        const g = window.createGraphics(Math.round(width * scale), Math.round(height * scale));
        g.push();
        g.scale(scale);

        if (background !== null) g.background(background); else g.clear();

        g.noStroke();
        g.textSize(this.fontSize);
        try { g.textFont(this.fontFamily); } catch (e) { }
        g.textAlign(g.LEFT, g.TOP);

        const containerRect = this.container.getBoundingClientRect();

        for (let i = 0; i < this.letterNodes.length; i++) {
          const node = this.letterNodes[i];
          if (!node) continue;
          if (node.tagName === 'BR') continue;
          const r = node.getBoundingClientRect();
          const x = r.left - containerRect.left + this.container.scrollLeft;
          const y = r.top - containerRect.top + this.container.scrollTop;
          const w = Math.max(1, r.width);
          const h = Math.max(1, r.height);
          const color = (node.dataset && node.dataset.color) ? node.dataset.color : '#000';

          try {
            g.fill(color);
            g.rect(x, y, w, h, 4);
          } catch (errRect) {
            g.fill(color);
            g.rect(x, y, w, h);
          }

          g.fill(255);
          g.text(node.textContent, x + 2, y + 2);
        }

        g.pop();

        const canvas = g.elt && g.elt.tagName === 'CANVAS' ? g.elt : (g.canvas || (g._renderer && g._renderer.canvas));
        if (!canvas) {
          return reject(new Error('No se pudo acceder al canvas del p5.Graphics'));
        }
        const dataUrl = canvas.toDataURL('image/png');
        const a = document.createElement('a');
        a.href = dataUrl;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        resolve();
      } catch (err) {
        reject(err);
      }
    });
  }

  exportAsImageCanvas(filename = 'notepad.png', opts = {}) {
    return new Promise((resolve, reject) => {
      try {
        const scale = opts.scale || 2;
        const background = (typeof opts.background !== 'undefined') ? opts.background : this.container.style.background;
        const width = Math.max(1, this.container.scrollWidth);
        const height = Math.max(1, this.container.scrollHeight);
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(width * scale);
        canvas.height = Math.round(height * scale);
        const ctx = canvas.getContext('2d');
        ctx.scale(scale, scale);

        if (background !== null) {
          ctx.fillStyle = background;
          ctx.fillRect(0, 0, width, height);
        } else {
          ctx.clearRect(0, 0, width, height);
        }

        const containerRect = this.container.getBoundingClientRect();
        ctx.textBaseline = 'top';
        ctx.font = `${this.fontSize}px ${this.fontFamily || 'monospace'}`;

        for (let i = 0; i < this.letterNodes.length; i++) {
          const node = this.letterNodes[i];
          if (!node) continue;
          if (node.tagName === 'BR') continue;
          const r = node.getBoundingClientRect();
          const x = r.left - containerRect.left + this.container.scrollLeft;
          const y = r.top - containerRect.top + this.container.scrollTop;
          const w = r.width;
          const h = r.height;
          const color = (node.dataset && node.dataset.color) ? node.dataset.color : '#000';

          const radius = 4;
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.moveTo(x + radius, y);
          ctx.lineTo(x + w - radius, y);
          ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
          ctx.lineTo(x + w, y + h - radius);
          ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
          ctx.lineTo(x + radius, y + h);
          ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
          ctx.lineTo(x, y + radius);
          ctx.quadraticCurveTo(x, y, x + radius, y);
          ctx.closePath();
          ctx.fill();

          ctx.fillStyle = '#ffffff';
          ctx.fillText(node.textContent, x + 4, y + 4);
        }

        canvas.toBlob(function (blob) {
          const a = document.createElement('a');
          const url = URL.createObjectURL(blob);
          a.href = url;
          a.download = filename;
          document.body.appendChild(a);
          a.click();
          a.remove();
          URL.revokeObjectURL(url);
          resolve();
        }, 'image/png');
      } catch (err) {
        reject(err);
      }
    });
  }

  // ---------------- Internal helpers ----------------

  _build() {
    this.container = document.createElement('div');
    this.container.className = 'notepad-container';
    this.container.tabIndex = 0;
    Object.assign(this.container.style, {
      width: this.width + 'px',
      height: this.height + 'px',
      border: '1px solid #ccc',
      padding: this._containerPadding,
      fontFamily: this.fontFamily,
      fontSize: this.fontSize + 'px',
      lineHeight: '1.5',
      cursor: 'text',
      overflow: 'auto',
      userSelect: 'none',
      outline: 'none',
      background: 'white',
      whiteSpace: 'pre-wrap',
      wordWrap: 'break-word',
    });
    this.content = document.createElement('div');
    this.content.style.display = 'inline';
    this.container.appendChild(this.content);

    this.cursor = document.createElement('span');
    this.cursor.className = 'notepad-cursor';
    Object.assign(this.cursor.style, {
      display: 'inline-block',
      width: '2px',
      height: (this.fontSize + 4) + 'px',
      backgroundColor: '#333',
      verticalAlign: 'text-bottom',
      animation: 'np-blink 1s steps(2,start) infinite',
    });

    if (!document.getElementById('notepad-style')) {
      const st = document.createElement('style');
      st.id = 'notepad-style';
      st.textContent = `
        @keyframes np-blink { 0%{opacity:1}50%{opacity:0}100%{opacity:1} }
        .notepad-letter-selected { outline: 2px solid rgba(0,0,0,0.15); box-shadow: inset 0 0 0 2px rgba(0,0,0,0.03); }
        .notepad-newline { display: block; width: 0; height: 0; margin: 0; padding: 0; }
      `;
      document.head.appendChild(st);
    }

    this.parent.appendChild(this.container);

    // Hidden textarea for mobile input
    this.textarea = document.createElement('textarea');
    Object.assign(this.textarea.style, {
      position: 'absolute',
      opacity: '0',
      pointerEvents: 'none',
      width: '1px',
      height: '1px',
      top: '0',
      left: '0'
    });
    this.container.appendChild(this.textarea);

    this.focus();
  }

  _attachEvents() {
    this._onPointerDown = (e) => {
      e.preventDefault();
      this.focus();

      const rectContainer = this.container.getBoundingClientRect();
      const clickX = e.clientX - rectContainer.left + this.container.scrollLeft;
      const clickY = e.clientY;

      let idx = null;
      const target = e.target;

      // Fast path: if clicked on node with dataset.index, use rect half detection
      if (target && target !== this.container && target !== this.content && target !== this.cursor && target.dataset && typeof target.dataset.index !== 'undefined') {
        const spanIndex = parseInt(target.dataset.index, 10);
        if (target.tagName === 'BR') {
          idx = spanIndex + 1;
        } else {
          const rect = target.getBoundingClientRect();
          if (e.clientX < rect.left + rect.width / 2) idx = spanIndex;
          else idx = spanIndex + 1;
        }
      }

      // If not decided: click to right of last node => end
      if (idx === null) {
        if (this.letterNodes.length > 0) {
          const lastNode = this.letterNodes[this.letterNodes.length - 1];
          const lastRect = lastNode.getBoundingClientRect();
          const lastRightX = lastRect.right - rectContainer.left + this.container.scrollLeft;
          if (clickX >= lastRightX) {
            idx = this.letterNodes.length;
          }
        } else {
          idx = 0;
        }
      }

      // fallback: XY hit test (handles wrapped lines)
      if (idx === null) idx = this._indexFromClientXY(e.clientX, e.clientY);

      idx = Math.max(0, Math.min(idx, this.letterNodes.length));

      if (e.shiftKey) {
        if (this.selectionStart === null) this.selectionStart = this.cursorPos;
        this.selectionEnd = idx;
        this.cursorPos = idx;
        this._render();
        return;
      }

      // start normal click/drag selection
      this.selectionStart = idx;
      this.selectionEnd = idx;
      this.cursorPos = idx;
      this.isDragging = true;
      this._render();
    };

    this._onPointerMove = (e) => {
      if (!this.isDragging) return;
      e.preventDefault();
      const idx = this._indexFromClientXY(e.clientX, e.clientY);
      this.selectionEnd = idx;
      this.cursorPos = idx;
      this._render();
    };

    this._onPointerUp = (e) => {
      if (!this.isDragging) return;
      this.isDragging = false;
      if (this.selectionStart === this.selectionEnd) this._clearSelection();
      this._render();
      this.textarea.focus(); // Ensure focus remains for typing
    };

    this.container.addEventListener('pointerdown', this._onPointerDown);
    window.addEventListener('pointermove', this._onPointerMove);
    window.addEventListener('pointerup', this._onPointerUp);

    // IME Composition handling
    this.isComposing = false;

    this._onCompositionStart = (e) => {
      this.isComposing = true;
    };

    this._onCompositionEnd = (e) => {
      this.isComposing = false;
      // Insert the composed text
      if (e.data) {
        for (let char of e.data) {
          this._insertChar(char);
        }
        this._render();
        this._emit('change');
      }
      this.textarea.value = ''; // Clear buffer
    };

    this.textarea.addEventListener('compositionstart', this._onCompositionStart);
    this.textarea.addEventListener('compositionend', this._onCompositionEnd);

    // Input event for mobile/IME
    this._onInput = (e) => {
      // Ignore input events during composition (swipe/handwriting)
      if (this.isComposing) return;

      const inputType = e.inputType;

      if (inputType === 'insertText' && e.data) {
        for (let char of e.data) {
          this._insertChar(char);
        }
      } else if (inputType === 'insertLineBreak') {
        this._insertNewline();
      } else if (inputType === 'deleteContentBackward') {
        this._handleBackspace();
      } else if (inputType === 'deleteContentForward') {
        this._handleDelete();
      } else if (inputType === 'insertFromPaste') {
        // Paste is usually handled by 'paste' event, but just in case
        // We rely on the paste event listener below
      }

      this.textarea.value = ''; // Clear buffer
      this._render();
      this._emit('change');
    };

    this.textarea.addEventListener('input', this._onInput);

    this._onKeyDown = (e) => {
      const ctrl = e.ctrlKey || e.metaKey;
      if (ctrl && e.key.toLowerCase() === 'c') { e.preventDefault(); this.copy(); return; }
      if (ctrl && e.key.toLowerCase() === 'x') { e.preventDefault(); this.cut(); return; }
      if (ctrl && e.key.toLowerCase() === 'v') { e.preventDefault(); this.paste(); return; }

      if (e.key === 'Enter') {
        e.preventDefault();
        this._insertNewline();
        this._render();
        this._emit('change');
        return;
      }

      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        this.cursorPos = Math.max(0, this.cursorPos - 1);
        this._clearSelection();
        this._render();
        return;
      }
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        this.cursorPos = Math.min(this.letterNodes.length, this.cursorPos + 1);
        this._clearSelection();
        this._render();
        return;
      }

      if (e.key === 'Backspace') {
        e.preventDefault();
        this._handleBackspace();
        return;
      }
      if (e.key === 'Delete') {
        e.preventDefault();
        this._handleDelete();
        return;
      }

      // If input event handles it (single char), ignore here to avoid double insert
      // But for desktop, keydown is reliable. We can check if key is a single char.
      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault(); // Prevent 'input' event to avoid double insertion
        this._insertChar(e.key);
        this._render();
        this._emit('change');
      }
    };

    this.textarea.addEventListener('keydown', this._onKeyDown);
    // Keep container listener for focus/shortcuts if needed, but textarea is main input
    this.container.addEventListener('keydown', (e) => {
      // Redirect focus to textarea if container gets keys
      this.textarea.focus();
    });
  }

  _updateTextareaPosition() {
    // Position textarea at cursor to prevent scroll jump on mobile
    try {
      const cursorRect = this.cursor.getBoundingClientRect();
      const containerRect = this.container.getBoundingClientRect();

      this.textarea.style.top = (cursorRect.top - containerRect.top + this.container.scrollTop) + 'px';
      this.textarea.style.left = (cursorRect.left - containerRect.left + this.container.scrollLeft) + 'px';
    } catch (e) {
      // Fallback if cursor not yet rendered
    }
  }

  _handleBackspace() {
    const range = this._getSelectionRange();
    if (range) { this.cut(); return; }
    if (this.cursorPos > 0) {
      this.letterNodes[this.cursorPos - 1].remove();
      this.letterNodes.splice(this.cursorPos - 1, 1);
      this.cursorPos--;
      this._render();
      this._emit('change');
    }
  }

  _handleDelete() {
    const range = this._getSelectionRange();
    if (range) { this.cut(); return; }
    if (this.cursorPos < this.letterNodes.length) {
      this.letterNodes[this.cursorPos].remove();
      this.letterNodes.splice(this.cursorPos, 1);
      this._render();
      this._emit('change');
    }
  }

  _detachEvents() {
    this.container.removeEventListener('pointerdown', this._onPointerDown);
    window.removeEventListener('pointermove', this._onPointerMove);
    window.removeEventListener('pointerup', this._onPointerUp);
    this.textarea.removeEventListener('keydown', this._onKeyDown);
    this.textarea.removeEventListener('input', this._onInput);
    this.textarea.removeEventListener('compositionstart', this._onCompositionStart);
    this.textarea.removeEventListener('compositionend', this._onCompositionEnd);
  }

  // ---------------- Internal: insert / color lookup ----------------

  _insertChar(ch, explicitColor = null) {
    if (ch === '\n') { this._insertNewline(); return; }

    const sel = this._getSelectionRange();
    if (sel) {
      for (let i = sel.end - 1; i >= sel.start; i--) {
        this.letterNodes[i].remove();
        this.letterNodes.splice(i, 1);
      }
      this.cursorPos = sel.start;
      this._clearSelection();
    }

    const span = document.createElement('span');
    span.textContent = ch;

    const color = explicitColor || this._getColorForChar(ch);
    span.style.display = 'inline-block';
    span.style.backgroundColor = color;
    span.style.color = 'white';
    span.style.padding = `${this._letterPadY}px ${this._letterPadX}px`;
    span.style.margin = (typeof this._letterMarginX === 'number') ? `0 ${this._letterMarginX}px` : this._letterMarginX;
    span.style.borderRadius = this._letterBorderRadius + 'px';
    span.style.border = this._letterBorderWidth + 'px solid ' + this._letterBorderColor;
    // NOTE: do NOT set fontFamily or fontSize inline so spans inherit from container
    span.dataset.color = color;

    this.letterNodes.splice(this.cursorPos, 0, span);
    this.cursorPos++;
  }

  _insertNewline() {
    const sel = this._getSelectionRange();
    if (sel) {
      for (let i = sel.end - 1; i >= sel.start; i--) {
        this.letterNodes[i].remove();
        this.letterNodes.splice(i, 1);
      }
      this.cursorPos = sel.start;
      this._clearSelection();
    }
    const br = document.createElement('br');
    br.className = 'notepad-newline';
    this.letterNodes.splice(this.cursorPos, 0, br);
    this.cursorPos++;
  }

  _getColorForChar(ch) {
    // noteColorMap priority
    if (this.noteColorMap && typeof this.noteColorMap === 'object') {
      if (this.noteColorMap.hasOwnProperty(ch)) { this._seqIndex++; return this.noteColorMap[ch]; }
      const lower = ch.toLowerCase();
      if (this.noteColorMap.hasOwnProperty(lower)) { this._seqIndex++; return this.noteColorMap[lower]; }
    }

    // colorFunc
    if (typeof this.colorFunc === 'function') {
      try {
        const c = this.colorFunc(ch, this.letterNodes.length, this._seqIndex);
        if (c) { this._seqIndex++; return c; }
      } catch (e) { console.error('colorFunc error', e); }
    }

    // legacy colorMap
    if (this.colorMap && typeof this.colorMap === 'object') {
      if (this.colorMap.hasOwnProperty(ch)) { this._seqIndex++; return this.colorMap[ch]; }
      const lower = ch.toLowerCase();
      if (this.colorMap.hasOwnProperty(lower)) { this._seqIndex++; return this.colorMap[lower]; }
    }

    // sequence
    if (Array.isArray(this.colorSequence) && this.colorSequence.length) {
      const c = this.colorSequence[this._seqIndex % this.colorSequence.length];
      this._seqIndex++;
      return c;
    }

    // fallback deterministic (from this.colors)
    const c = this.colors[this._seqIndex % this.colors.length];
    this._seqIndex++;
    return c;
  }

  _deterministicColorForChar(ch, pos) {
    if (this.noteColorMap && typeof this.noteColorMap === 'object') {
      if (this.noteColorMap.hasOwnProperty(ch)) return this.noteColorMap[ch];
      const lower = ch.toLowerCase();
      if (this.noteColorMap.hasOwnProperty(lower)) return this.noteColorMap[lower];
    }

    if (typeof this.colorFunc === 'function') {
      try {
        const c = this.colorFunc(ch, pos, pos);
        if (c) return c;
      } catch (e) { console.error('colorFunc error', e); }
    }

    if (this.colorMap && typeof this.colorMap === 'object') {
      if (this.colorMap.hasOwnProperty(ch)) return this.colorMap[ch];
      const lower = ch.toLowerCase();
      if (this.colorMap.hasOwnProperty(lower)) return this.colorMap[lower];
    }

    if (Array.isArray(this.colorSequence) && this.colorSequence.length) {
      return this.colorSequence[pos % this.colorSequence.length];
    }

    return this.colors[pos % this.colors.length];
  }

  _clearAll() {
    for (let n of this.letterNodes) n.remove();
    this.letterNodes = [];
    this.cursorPos = 0;
    this._clearSelection();
    this._seqIndex = 0;
  }

  _render() {
    this.content.innerHTML = '';
    for (let i = 0; i < this.letterNodes.length; i++) {
      const node = this.letterNodes[i];
      node.dataset.index = i;
    }

    for (let i = 0; i < this.cursorPos; i++) this.content.appendChild(this.letterNodes[i]);
    this.content.appendChild(this.cursor);
    for (let i = this.cursorPos; i < this.letterNodes.length; i++) this.content.appendChild(this.letterNodes[i]);

    this._updateSelectionVisual();
    this._updateTextareaPosition();
  }

  _updateSelectionVisual() {
    for (let i = 0; i < this.letterNodes.length; i++) {
      const n = this.letterNodes[i];
      if (n.tagName === 'BR') continue;
      n.classList.remove('notepad-letter-selected');
    }
    const r = this._getSelectionRange();
    if (!r) return;
    for (let i = r.start; i < r.end; i++) {
      const n = this.letterNodes[i];
      if (n && n.tagName !== 'BR') n.classList.add('notepad-letter-selected');
    }
  }

  _getSelectionRange() {
    if (this.selectionStart === null || this.selectionEnd === null) return null;
    const s = Math.min(this.selectionStart, this.selectionEnd);
    const e = Math.max(this.selectionStart, this.selectionEnd);
    if (s === e) return null;
    return { start: s, end: e };
  }

  _clearSelection() {
    this.selectionStart = null;
    this.selectionEnd = null;
    this._updateSelectionVisual();
  }

  // ---------------- Hit testing por X,Y (mejor manejo de wraps) ----------------

  _indexFromClientXY(clientX, clientY) {
    const rectContainer = this.container.getBoundingClientRect();
    if (this.letterNodes.length === 0) return 0;

    const infos = this.letterNodes.map((node, idx) => {
      const r = node.getBoundingClientRect();
      return {
        idx,
        node,
        left: r.left,
        right: r.right,
        top: r.top,
        bottom: r.bottom,
        centerX: r.left + (r.width / 2),
        centerY: r.top + (r.height / 2)
      };
    });

    let minVD = Infinity, best = 0;
    for (let i = 0; i < infos.length; i++) {
      const vd = Math.abs(infos[i].centerY - clientY);
      if (vd < minVD) { minVD = vd; best = i; }
    }

    const lineCenterY = infos[best].centerY;
    const lineThreshold = Math.max((this.fontSize || 16) * 0.8, 8);

    const lineNodes = infos.filter(info => Math.abs(info.centerY - lineCenterY) <= lineThreshold);
    if (lineNodes.length === 0) return infos[best].idx;

    lineNodes.sort((a, b) => a.left - b.left);

    if (clientX < lineNodes[0].centerX) return lineNodes[0].idx;

    for (let i = 0; i < lineNodes.length; i++) {
      if (clientX < lineNodes[i].centerX) return lineNodes[i].idx;
    }

    const lastOnLine = lineNodes[lineNodes.length - 1].idx;
    return lastOnLine + 1;
  }

  _randomColor() { return this.colors[Math.floor(Math.random() * this.colors.length)]; }

  _emit(eventName, payload) {
    if (!this.handlers[eventName]) return;
    for (const fn of this.handlers[eventName]) {
      try { fn(payload); } catch (e) { console.error(e); }
    }
  }
}

// export global
if (typeof module !== 'undefined' && module.exports) {
  module.exports = Notepad;
} else {
  window.Notepad = Notepad;
}
