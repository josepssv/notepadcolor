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

    // Insertion mode: 'letter-spaced', 'letter', or 'word'
    // - 'letter-spaced': each letter in separate span with reduced spacing
    // - 'letter': each letter in separate span with normal spacing
    // - 'word': group characters into words (split by spaces)
    this.insertionMode = options.insertionMode || 'word';

    // Spacing / font defaults for letters (can be changed with API)
    this._letterPadY = (typeof options.letterPadY !== 'undefined') ? options.letterPadY : 2;
    this._letterPadX = (typeof options.letterPadX !== 'undefined') ? options.letterPadX : 4;
    this._letterMarginX = (typeof options.letterMarginX !== 'undefined') ? options.letterMarginX : 0; // px or string
    this._letterBorderRadius = (typeof options.letterBorderRadius !== 'undefined') ? options.letterBorderRadius : 4;
    this._letterBorderWidth = (typeof options.letterBorderWidth !== 'undefined') ? options.letterBorderWidth : 0;
    this._letterBorderColor = (typeof options.letterBorderColor !== 'undefined') ? options.letterBorderColor : '#000000';
    this._textColor = (typeof options.textColor !== 'undefined') ? options.textColor : '#ffffff';
    this.textColorFunc = (typeof options.textColorFunc === 'function') ? options.textColorFunc : null;

    // State
    this.letterNodes = []; // array of DOM nodes (span for chars, br for newline)
    this.cursorPos = 0;
    this.selectionStart = null;
    this.selectionEnd = null;
    this.clipboard = []; // array of { text, color } ; newline as '\n'
    this.isDragging = false;
    this.handlers = {};
    this.overwriteMode = false;
    this.isEditable = true;
    this.editingIndex = null;
    this.editingOffset = 0;
    this._isTypingInWord = false; // Track if actively typing in a word span

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

  /**
   * Insert text as word blocks - each word becomes a single span block
   * @param {string} text - The text to insert (will be split by spaces)
   * @param {Object} options - Configuration options
   * @param {Function} options.colorFunc - Function that returns a color for each word (receives word, index)
   * @param {string} options.spaceColor - Color for spaces (default: 'transparent')
   * @param {boolean} options.randomColors - Use random vibrant colors (default: true)
   */
  insertTextAsWordBlocks(text, options = {}) {
    const {
      colorFunc = null,
      spaceColor = 'transparent',
      randomColors = true
    } = options;

    // Helper to generate random vibrant colors
    const generateRandomColor = () => {
      const hue = Math.floor(Math.random() * 360);
      const saturation = 70 + Math.floor(Math.random() * 30); // 70-100%
      const lightness = 45 + Math.floor(Math.random() * 20);  // 45-65%
      return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
    };

    // Split text into words
    const words = text.split(' ');

    // Clear existing content
    this._clearAll();

    words.forEach((word, index) => {
      // Determine color for this word
      let wordColor;
      if (colorFunc) {
        wordColor = colorFunc(word, index);
      } else if (randomColors) {
        wordColor = generateRandomColor();
      } else {
        // Use default color mapping
        wordColor = this._getColorForChar(word[0] || 'a');
      }

      // Create a single span for the entire word
      const span = document.createElement('span');
      span.textContent = word;
      span.style.display = 'inline-block';
      span.style.backgroundColor = wordColor;
      span.style.color = this._resolveTextColor(word[0], this.letterNodes.length, wordColor);
      span.style.padding = `${this._letterPadY}px ${this._letterPadX}px`;
      span.style.margin = (typeof this._letterMarginX === 'number') ? `0 ${this._letterMarginX}px` : this._letterMarginX;
      span.style.borderRadius = this._letterBorderRadius + 'px';
      span.style.border = this._letterBorderWidth + 'px solid ' + this._letterBorderColor;
      span.dataset.color = wordColor;

      this.letterNodes.push(span);

      // Add space between words (except after last word)
      if (index < words.length - 1) {
        const spaceSpan = document.createElement('span');
        spaceSpan.textContent = ' ';
        spaceSpan.style.display = 'inline-block';
        spaceSpan.style.backgroundColor = spaceColor;
        spaceSpan.style.color = 'transparent';
        spaceSpan.dataset.color = spaceColor;
        this.letterNodes.push(spaceSpan);
      }
    });

    this.cursorPos = this.letterNodes.length;
    this._render();
    this._emit('change');
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
        },
        textColor: node.style.color || this._textColor
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

    if (this.overwriteMode) {
      // Overwrite mode paste
      const range = this._getSelectionRange();
      let startPos = range ? range.start : this.cursorPos;

      // If selection, first clear it to spaces? Or just overwrite from start?
      // Let's overwrite from start of selection/cursor

      let pasteIdx = 0;
      // Flatten clipboard text
      let pasteText = "";
      for (let item of this.clipboard) pasteText += item.text;

      for (let i = startPos; i < this.letterNodes.length && pasteIdx < pasteText.length; i++) {
        const node = this.letterNodes[i];
        if (node.tagName === 'BR') continue; // Skip newlines in overwrite?

        node.textContent = pasteText[pasteIdx];
        pasteIdx++;
      }

      // If selection was larger than paste, fill rest with spaces?
      if (range && (startPos + pasteIdx) < range.end) {
        for (let i = startPos + pasteIdx; i < range.end; i++) {
          const node = this.letterNodes[i];
          if (node.tagName !== 'BR') node.textContent = ' ';
        }
      }

      this.cursorPos = Math.min(this.letterNodes.length, startPos + pasteIdx);
      this._clearSelection();
      this._render();
      this._emit('change');
      return;
    }

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

  setNoteColorMap(map) {
    this.noteColorMap = map;
    this.recolor();
  }

  setRainbowCycleMode(steps = 10) {
    const colors = Notepad.generateRainbowColors(steps);
    let cycleIndex = 0;
    this.setColorFunc((char, index) => {
      // Reset cycle if we are starting from the beginning (index 0)
      // Note: This works well for full re-renders or initial insert.
      // For appending, index will be > 0, so cycle continues.
      if (index === 0) cycleIndex = 0;

      if (char === ' ') return 'transparent';

      const color = colors[cycleIndex % colors.length];
      cycleIndex++;
      return color;
    });
  }

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

  setOverwriteMode(enabled) {
    this.overwriteMode = !!enabled;
  }

  setEditable(enabled) {
    this.isEditable = !!enabled;
    if (!this.isEditable) {
      this.textarea.blur();
      this._clearSelection();
    }
  }

  /**
   * Set the insertion mode for character grouping
   * @param {string} mode - 'letter' or 'word'
   */
  setInsertionMode(mode) {
    const validModes = ['letter', 'word'];
    if (validModes.includes(mode)) {
      this.insertionMode = mode;
    } else {
      console.warn(`Invalid insertion mode: ${mode}. Valid modes are: ${validModes.join(', ')}`);
    }
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

      const textCol = this._resolveTextColor(ch, i, col);
      n.style.color = textCol;
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

  setTextColor(color) {
    this._textColor = color;
    for (const n of this.letterNodes) {
      if (!n || n.tagName === 'BR') continue;
      n.style.color = color;
    }
  }

  setTextColorFunc(fn) {
    this.textColorFunc = (typeof fn === 'function') ? fn : null;
    this.recolor();
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

          g.fill(node.style.color || this._textColor || '#ffffff');
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

          ctx.fillStyle = node.style.color || this._textColor || '#ffffff';
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
      display: 'none', // Hidden by default
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

    this.textarea.addEventListener('focus', () => {
      this.cursor.style.display = 'inline-block';
    });
    this.textarea.addEventListener('blur', () => {
      this.cursor.style.display = 'none';
    });

    // Initial focus call removed to respect "hidden by default"
    // this.focus(); 
  }

  _attachEvents() {
    this._onPointerDown = (e) => {
      e.preventDefault();
      if (!this.isEditable) return;
      this.focus();

      const now = Date.now();
      const isDouble = (this._lastClickTime && (now - this._lastClickTime < 300));
      this._lastClickTime = now;

      if (isDouble) {
        let target = e.target;
        if (target.nodeType === 3) target = target.parentNode;

        if (target && target.dataset && typeof target.dataset.index !== 'undefined') {
          const idx = parseInt(target.dataset.index, 10);
          if (idx >= 0 && idx < this.letterNodes.length) {
            const node = this.letterNodes[idx];
            if (node.tagName !== 'BR') {
              this.editingIndex = idx;

              // Calculate offset
              let offset = node.textContent.length;
              if (document.caretRangeFromPoint) {
                const range = document.caretRangeFromPoint(e.clientX, e.clientY);
                if (range) {
                  if (range.startContainer === node.firstChild) {
                    offset = range.startOffset;
                  } else if (range.startContainer === node) {
                    offset = (range.startOffset === 0) ? 0 : node.textContent.length;
                  }
                }
              } else if (document.caretPositionFromPoint) {
                const pos = document.caretPositionFromPoint(e.clientX, e.clientY);
                if (pos) {
                  if (pos.offsetNode === node.firstChild) {
                    offset = pos.offset;
                  } else if (pos.offsetNode === node) {
                    offset = (pos.offset === 0) ? 0 : node.textContent.length;
                  }
                }
              }

              this.editingOffset = offset;
              this._clearSelection();
              this._render();
              return;
            }
          }
        }
      }

      this.editingIndex = null;
      this._isTypingInWord = false; // Stop typing when clicking

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
      if (!this.isEditable) {
        this.textarea.value = '';
        return;
      }
      // Ignore input events during composition (swipe/handwriting)
      if (this.isComposing) return;

      const inputType = e.inputType;

      if (inputType === 'insertText' && e.data) {
        for (let char of e.data) {
          if (this.overwriteMode) this._overwriteChar(char);
          else this._insertChar(char);
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

      if (!this.isEditable) return;

      if (ctrl && e.key.toLowerCase() === 'x') { e.preventDefault(); this.cut(); return; }
      if (ctrl && e.key.toLowerCase() === 'v') { e.preventDefault(); this.paste(); return; }

      if (e.key === 'Enter') {
        e.preventDefault();
        if (this.editingIndex !== null) {
          this.cursorPos = this.editingIndex + 1;
          this.editingIndex = null;
        }
        this._insertNewline();
        this._render();
        this._emit('change');
        return;
      }

      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        if (this.editingIndex !== null) {
          if (this.editingOffset > 0) {
            this.editingOffset--;
            this._render();
          } else {
            this.cursorPos = this.editingIndex;
            this.editingIndex = null;
            this._render();
          }
          return;
        }
        this.cursorPos = Math.max(0, this.cursorPos - 1);
        this._clearSelection();
        this._isTypingInWord = false; // Stop typing when navigating
        this._render();
        return;
      }
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        if (this.editingIndex !== null) {
          const node = this.letterNodes[this.editingIndex];
          if (this.editingOffset < node.textContent.length) {
            this.editingOffset++;
            this._render();
          } else {
            this.cursorPos = this.editingIndex + 1;
            this.editingIndex = null;
            this._render();
          }
          return;
        }
        this.cursorPos = Math.min(this.letterNodes.length, this.cursorPos + 1);
        this._clearSelection();
        this._isTypingInWord = false; // Stop typing when navigating
        this._render();
        return;
      }

      if (e.key === 'Backspace') {
        e.preventDefault();
        if (this.overwriteMode) this._handleOverwriteBackspace();
        else this._handleBackspace();
        return;
      }
      if (e.key === 'Delete') {
        e.preventDefault();
        if (this.overwriteMode) this._handleOverwriteDelete();
        else this._handleDelete();
        return;
      }

      // If input event handles it (single char), ignore here to avoid double insert
      // But for desktop, keydown is reliable. We can check if key is a single char.
      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault(); // Prevent 'input' event to avoid double insertion

        if (this.overwriteMode) {
          this._overwriteChar(e.key);
        } else {
          this._insertChar(e.key);
        }

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
    if (this.editingIndex !== null) {
      const node = this.letterNodes[this.editingIndex];
      if (this.editingOffset > 0) {
        const text = node.textContent;
        const newText = text.slice(0, this.editingOffset - 1) + text.slice(this.editingOffset);
        node.textContent = newText;
        this.editingOffset--;
        this._render();
        this._emit('change');
      }
      return;
    }

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
    if (this.editingIndex !== null) {
      const node = this.letterNodes[this.editingIndex];
      const text = node.textContent;
      if (this.editingOffset < text.length) {
        const newText = text.slice(0, this.editingOffset) + text.slice(this.editingOffset + 1);
        node.textContent = newText;
        this._render();
        this._emit('change');
      }
      return;
    }

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

    if (this.editingIndex !== null) {
      const node = this.letterNodes[this.editingIndex];
      if (node && node.tagName !== 'BR') {
        const text = node.textContent;
        const newText = text.slice(0, this.editingOffset) + ch + text.slice(this.editingOffset);
        node.textContent = newText;
        this.editingOffset++;
        this._render();
        this._emit('change');
        return;
      }
    }

    const sel = this._getSelectionRange();

    if (sel) {
      for (let i = sel.end - 1; i >= sel.start; i--) {
        this.letterNodes[i].remove();
        this.letterNodes.splice(i, 1);
      }
      this.cursorPos = sel.start;
      this._clearSelection();
    }

    const isSpace = ch === ' ';

    // Word mode: new logic for intelligent grouping
    if (this.insertionMode === 'word') {
      const prevNode = this.letterNodes[this.cursorPos - 1];

      if (isSpace) {
        // Check if previous node is also a space
        const isPrevSpace = prevNode && prevNode.textContent === ' ';

        if (isPrevSpace) {
          // Two spaces in a row: create a visual space block
          const spaceSpan = document.createElement('span');
          spaceSpan.textContent = ' ';
          spaceSpan.style.display = 'inline-block';
          spaceSpan.style.backgroundColor = 'transparent';
          spaceSpan.style.color = 'transparent';
          spaceSpan.style.padding = `${this._letterPadY}px ${this._letterPadX}px`;
          spaceSpan.style.margin = (typeof this._letterMarginX === 'number') ? `0 ${this._letterMarginX}px` : this._letterMarginX;
          spaceSpan.dataset.color = 'transparent';

          this.letterNodes.splice(this.cursorPos, 0, spaceSpan);
          this.cursorPos++;
          this._isTypingInWord = false; // Stop typing in word
          this._render();
          this._emit('change');
          return;
        } else {
          // Single space: just mark it (invisible separator)
          const spaceMarker = document.createElement('span');
          spaceMarker.textContent = ' ';
          spaceMarker.style.display = 'inline-block';
          spaceMarker.style.backgroundColor = 'transparent';
          spaceMarker.style.color = 'transparent';
          spaceMarker.style.padding = '0';
          spaceMarker.style.margin = '0';
          spaceMarker.style.width = '0';
          spaceMarker.style.overflow = 'hidden';
          spaceMarker.dataset.color = 'transparent';
          spaceMarker.dataset.invisibleSpace = 'true';

          this.letterNodes.splice(this.cursorPos, 0, spaceMarker);
          this.cursorPos++;
          this._isTypingInWord = false; // Stop typing in word
          this._render();
          this._emit('change');
          return;
        }
      } else {
        // Not a space - check if we can append to previous word
        // Only append if we were already typing in that word
        const canAppendToPrev = this._isTypingInWord &&
          prevNode &&
          prevNode.tagName === 'SPAN' &&
          prevNode.textContent.trim() !== '' &&
          !prevNode.dataset.invisibleSpace;

        if (canAppendToPrev) {
          // Append character to the previous word span (continuing to type)
          prevNode.textContent += ch;
          this._isTypingInWord = true; // Keep typing flag active
          this._render();
          this._emit('change');
          return;
        }
        // If not appending, we'll create a new span below and start typing
      }
    }

    // Create a new span for this character
    // After creating it, mark that we're starting to type in this new word
    const willStartTyping = !isSpace && this.insertionMode === 'word';
    const span = document.createElement('span');
    span.textContent = ch;

    const color = explicitColor || this._getColorForChar(ch);
    span.style.display = 'inline-block';
    span.style.backgroundColor = isSpace ? 'transparent' : color;
    span.style.color = this._resolveTextColor(ch, this.cursorPos, color);

    // Apply standard spacing
    span.style.padding = `${this._letterPadY}px ${this._letterPadX}px`;
    span.style.margin = (typeof this._letterMarginX === 'number') ? `0 ${this._letterMarginX}px` : this._letterMarginX;
    span.style.borderRadius = this._letterBorderRadius + 'px';
    span.style.border = this._letterBorderWidth + 'px solid ' + this._letterBorderColor;
    // NOTE: do NOT set fontFamily or fontSize inline so spans inherit from container
    span.dataset.color = color;
    //span.dataset.index = this.cursorPos;
    this.letterNodes.splice(this.cursorPos, 0, span);
    this.cursorPos++;

    // Now that we've created the span, mark that we're typing in it
    if (willStartTyping) {
      this._isTypingInWord = true;
    }
  }

  _insertNewline() {
    if (this.editingIndex !== null) {
      this.cursorPos = this.editingIndex + 1;
      this.editingIndex = null;
    }
    if (this.overwriteMode) return; // No newlines in overwrite mode (fixed length/structure)
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

  _overwriteChar(ch) {
    const sel = this._getSelectionRange();
    if (sel) {
      // Replace first char with ch
      const firstNode = this.letterNodes[sel.start];
      if (firstNode && firstNode.tagName !== 'BR') firstNode.textContent = ch;

      // Replace rest with space
      for (let i = sel.start + 1; i < sel.end; i++) {
        const n = this.letterNodes[i];
        if (n && n.tagName !== 'BR') n.textContent = ' ';
      }
      this.cursorPos = sel.start + 1;
      this._clearSelection();
    } else {
      if (this.cursorPos >= this.letterNodes.length) return;
      const node = this.letterNodes[this.cursorPos];
      if (node && node.tagName !== 'BR') {
        node.textContent = ch;
        this.cursorPos++;
      }
    }
  }

  _handleOverwriteBackspace() {
    const range = this._getSelectionRange();
    if (range) {
      // Replace selection with spaces
      for (let i = range.start; i < range.end; i++) {
        const n = this.letterNodes[i];
        if (n && n.tagName !== 'BR') n.textContent = ' ';
      }
      this.cursorPos = range.start;
      this._clearSelection();
      this._render();
      this._emit('change');
      return;
    }

    if (this.cursorPos > 0) {
      const prevIdx = this.cursorPos - 1;
      const node = this.letterNodes[prevIdx];
      if (node && node.tagName !== 'BR') {
        node.textContent = ' ';
        this.cursorPos--;
        this._render();
        this._emit('change');
      }
    }
  }

  _handleOverwriteDelete() {
    const range = this._getSelectionRange();
    if (range) {
      // Replace selection with spaces
      for (let i = range.start; i < range.end; i++) {
        const n = this.letterNodes[i];
        if (n && n.tagName !== 'BR') n.textContent = ' ';
      }
      this.cursorPos = range.start;
      this._clearSelection();
      this._render();
      this._emit('change');
      return;
    }
    if (this.cursorPos < this.letterNodes.length) {
      const node = this.letterNodes[this.cursorPos];
      if (node && node.tagName !== 'BR') {
        node.textContent = ' ';
        // Cursor stays
        this._render();
        this._emit('change');
      }
    }
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

  _resolveTextColor(ch, index, bgColor) {
    if (typeof this.textColorFunc === 'function') {
      try {
        const c = this.textColorFunc(ch, index, bgColor);
        if (c) return c;
      } catch (e) { console.error('textColorFunc error', e); }
    }
    return this._textColor;
  }

  _clearAll() {
    for (let n of this.letterNodes) n.remove();
    this.letterNodes = [];
    this.cursorPos = 0;
    this._clearSelection();
    this._seqIndex = 0;
    this.editingIndex = null;
  }

  _render() {
    this.content.innerHTML = '';
    for (let i = 0; i < this.letterNodes.length; i++) {
      const node = this.letterNodes[i];
      node.dataset.index = i;
      // Normalize content if not editing
      if (this.editingIndex !== i && node.childNodes.length > 1) {
        node.textContent = node.textContent;
      }
    }

    if (this.editingIndex !== null && this.editingIndex < this.letterNodes.length) {
      // Render all nodes
      for (let i = 0; i < this.letterNodes.length; i++) {
        this.content.appendChild(this.letterNodes[i]);
      }
      // Place cursor inside the edited node
      const node = this.letterNodes[this.editingIndex];
      const text = node.textContent;
      node.innerHTML = '';
      const part1 = text.slice(0, this.editingOffset);
      const part2 = text.slice(this.editingOffset);
      node.appendChild(document.createTextNode(part1));
      node.appendChild(this.cursor);
      node.appendChild(document.createTextNode(part2));
      this.cursor.style.display = 'inline-block';
    } else {
      // Check if we should place cursor inside the previous word (word mode)
      let placeCursorInside = false;
      let targetNode = null;

      if (this.insertionMode === 'word' && this.cursorPos > 0 && this._isTypingInWord) {
        const prevNode = this.letterNodes[this.cursorPos - 1];
        // Place cursor inside if previous node is a word (not a space marker)
        if (prevNode &&
          prevNode.tagName === 'SPAN' &&
          !prevNode.dataset.invisibleSpace &&
          prevNode.textContent.trim() !== '') {
          placeCursorInside = true;
          targetNode = prevNode;
        }
      }

      if (placeCursorInside && targetNode) {
        // Render all nodes except we'll handle the target node specially
        for (let i = 0; i < this.letterNodes.length; i++) {
          if (this.letterNodes[i] === targetNode) {
            // Insert cursor at the end of this node
            const text = targetNode.textContent;
            targetNode.innerHTML = '';
            targetNode.appendChild(document.createTextNode(text));
            targetNode.appendChild(this.cursor);
            this.content.appendChild(targetNode);
          } else {
            this.content.appendChild(this.letterNodes[i]);
          }
        }
      } else {
        // Normal cursor placement between nodes
        for (let i = 0; i < this.cursorPos; i++) this.content.appendChild(this.letterNodes[i]);
        this.content.appendChild(this.cursor);
        for (let i = this.cursorPos; i < this.letterNodes.length; i++) this.content.appendChild(this.letterNodes[i]);
      }
    }

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
  // ---------------- Static Color Helpers ----------------

  static get ALPHABET() {
    return "abcdefghijklmnopqrstuvwxyz1234567890".split("");
  }

  static generateRainbowColors(steps) {
    const rainbowColors = [];
    for (let i = 0; i < steps; i++) {
      const hue = (i / steps) * 360;
      rainbowColors.push(`hsl(${hue}, 100%, 50%)`);
    }
    return rainbowColors;
  }

  static generateRandomColors(steps) {
    const randomColors = [];
    for (let i = 0; i < steps; i++) {
      const r = Math.floor(Math.random() * 256);
      const g = Math.floor(Math.random() * 256);
      const b = Math.floor(Math.random() * 256);
      randomColors.push(`rgb(${r}, ${g}, ${b})`);
    }
    return randomColors;
  }

  static assignRainbowColors(letters = Notepad.ALPHABET) {
    const rainbowColors = Notepad.generateRainbowColors(letters.length);
    let colorMap = {};
    letters.forEach((letter, index) => {
      colorMap[letter] = rainbowColors[index];
    });
    return colorMap;
  }

  static assignRandomColors(letters = Notepad.ALPHABET) {
    const randomColors = Notepad.generateRandomColors(letters.length);
    let colorMap = {};
    letters.forEach((letter, index) => {
      colorMap[letter] = randomColors[index];
    });
    return colorMap;
  }

  static getContrastColor(colorString) {
    if (!colorString || colorString === 'transparent') return '#000000';
    let r = 0, g = 0, b = 0;
    if (colorString.startsWith('#')) {
      const hex = colorString.slice(1);
      if (hex.length === 3) {
        r = parseInt(hex[0] + hex[0], 16);
        g = parseInt(hex[1] + hex[1], 16);
        b = parseInt(hex[2] + hex[2], 16);
      } else if (hex.length === 6) {
        r = parseInt(hex.slice(0, 2), 16);
        g = parseInt(hex.slice(2, 4), 16);
        b = parseInt(hex.slice(4, 6), 16);
      }
    } else if (colorString.startsWith('rgb')) {
      const match = colorString.match(/\d+/g);
      if (match && match.length >= 3) {
        r = parseInt(match[0]);
        g = parseInt(match[1]);
        b = parseInt(match[2]);
      }
    } else if (colorString.startsWith('hsl')) {
      const match = colorString.match(/hsl\(\s*\d+\s*,\s*\d+%\s*,\s*(\d+)%\s*\)/);
      if (match) {
        return parseInt(match[1]) > 50 ? '#000000' : '#ffffff';
      }
      return '#000000';
    }
    const yiq = ((r * 299) + (g * 587) + (b * 114)) / 1000;
    return (yiq >= 128) ? '#000000' : '#ffffff';
  }

  static getComplementaryColor(colorString) {
    if (!colorString || colorString === 'transparent') return '#000000';
    const hslMatch = colorString.match(/hsl\(\s*(\d+)\s*,\s*(\d+)%\s*,\s*(\d+)%\s*\)/);
    if (hslMatch) {
      const h = parseInt(hslMatch[1]);
      const s = parseInt(hslMatch[2]);
      const l = parseInt(hslMatch[3]);
      const newH = (h + 180) % 360;
      return `hsl(${newH}, ${s}%, ${l}%)`;
    }
    if (colorString.startsWith('#')) {
      const hex = colorString.slice(1);
      const num = parseInt(hex, 16);
      const inverted = 0xFFFFFF ^ num;
      return '#' + inverted.toString(16).padStart(6, '0');
    }
    return '#000000';
  }
}

// export global
if (typeof module !== 'undefined' && module.exports) {
  module.exports = Notepad;
} else {
  window.Notepad = Notepad;
}
