/* notepad.js - Versión Combinada Completa (55KB + 22KB) */
class Notepad {
  constructor(options = {}) {
    // Configuración por defecto (inspirada en versión simplificada)
    const defaults = {
      parent: document.body,
      width: 600,
      height: 300,
      fontSize: 20,
      fontFamily: 'monospace',
      colors: ['transparent'],
      noteColorMap: {},
      colorMap: {},
      colorSequence: null,
      colorFunc: null,
      insertionMode: 'word',
      letterPadY: 2,
      letterPadX: 4,
      letterMarginX: 0,
      letterBorderRadius: 4,
      letterBorderWidth: 0,
      letterBorderColor: '#000000',
      textColor: '#ffffff',
      textColorFunc: null,
      containerPadding: '0px',
      editable: true,
      overwriteMode: false
    };

    // Merge de opciones
    this.opts = { ...defaults, ...options };

    // Legacy compatibility
    if (this.opts.colorMap && Object.keys(this.opts.noteColorMap).length === 0) {
      this.opts.noteColorMap = this.opts.colorMap;
    }

    // State (manteniendo estructura original pero usando opts)
    this.letterNodes = [];
    this.cursorPos = 0;
    this.selectionStart = null;
    this.selectionEnd = null;
    this.clipboard = [];
    this.handlers = {};
    this.isDragging = false;
    this.overwriteMode = this.opts.overwriteMode;
    this.isEditable = this.opts.editable;
    this.editingIndex = null;
    this.editingOffset = 0;
    this._isTypingInWord = false;
    this._lastClickTime = 0;
    this._seqIndex = 0;
    this.isComposing = false;

    // Initialize
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

  insertTextAsWordBlocks(text, options = {}) {
    const {
      colorFunc = null,
      spaceColor = 'transparent',
      randomColors = true
    } = options;

    const generateRandomColor = () => {
      const hue = Math.floor(Math.random() * 360);
      const saturation = 70 + Math.floor(Math.random() * 30);
      const lightness = 45 + Math.floor(Math.random() * 20);
      return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
    };

    const words = text.split(' ');
    this._clearAll();

    words.forEach((word, index) => {
      let wordColor;
      if (colorFunc) {
        wordColor = colorFunc(word, index);
      } else if (randomColors) {
        wordColor = generateRandomColor();
      } else {
        wordColor = this._getColorForChar(word[0] || 'a');
      }

      const span = document.createElement('span');
      span.textContent = word;
      span.style.display = 'inline-block';
      span.style.backgroundColor = wordColor;
      span.style.color = this._resolveTextColor(word[0], this.letterNodes.length, wordColor);
      span.style.padding = `${this.opts.letterPadY}px ${this.opts.letterPadX}px`;
      span.style.margin = (typeof this.opts.letterMarginX === 'number') ? `0 ${this.opts.letterMarginX}px` : this.opts.letterMarginX;
      span.style.borderRadius = this.opts.letterBorderRadius + 'px';
      span.style.border = this.opts.letterBorderWidth + 'px solid ' + this.opts.letterBorderColor;
      span.dataset.color = wordColor;

      this.letterNodes.push(span);

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
          y: this.opts.letterPadY,
          x: this.opts.letterPadX
        },
        margin: this.opts.letterMarginX,
        borderRadius: this.opts.letterBorderRadius,
        border: {
          width: this.opts.letterBorderWidth,
          color: this.opts.letterBorderColor
        },
        textColor: node.style.color || this.opts.textColor
      };
    });
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
      const range = this._getSelectionRange();
      let startPos = range ? range.start : this.cursorPos;
      let pasteIdx = 0;
      let pasteText = "";
      for (let item of this.clipboard) pasteText += item.text;

      for (let i = startPos; i < this.letterNodes.length && pasteIdx < pasteText.length; i++) {
        const node = this.letterNodes[i];
        if (node.tagName === 'BR') continue;
        node.textContent = pasteText[pasteIdx];
        pasteIdx++;
      }

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

  setNoteColorMap(map) {
    this.opts.noteColorMap = map || {};
    this.recolor();
  }

  setNoteColor(note, color) {
    if (!this.opts.noteColorMap) this.opts.noteColorMap = {};
    if (color == null) delete this.opts.noteColorMap[note];
    else this.opts.noteColorMap[note] = color;
    this.recolor();
  }

  setColorMap(map) {
    this.opts.colorMap = map || {};
    this.recolor();
  }

  setColorSequence(seq) {
    this.opts.colorSequence = (Array.isArray(seq) && seq.length) ? seq.slice() : null;
    this._seqIndex = 0;
    this.recolor();
  }

  setColorFunc(fn) {
    this.opts.colorFunc = (typeof fn === 'function') ? fn : null;
    this.recolor();
  }

  resetSequence() {
    this._seqIndex = 0;
    this.recolor();
  }

  setAppBackground(color) {
    try { document.body.style.backgroundColor = color; } catch (e) { }
  }

  setContainerBackground(color) {
    try { this.container.style.background = color; } catch (e) { }
  }

  setRainbowCycleMode(steps = 10) {
    const colors = Notepad.generateRainbowColors(steps);
    let cycleIndex = 0;
    this.setColorFunc((char, index) => {
      if (index === 0) cycleIndex = 0;
      if (char === ' ') return 'transparent';
      const color = colors[cycleIndex % colors.length];
      cycleIndex++;
      return color;
    });
  }

  setContainerPadding(padding) {
    this.opts.containerPadding = padding;
    this.container.style.padding = padding;
    this._render();
  }

  setSize(w, h) {
    if (w) {
      this.opts.width = w;
      this.container.style.width = (typeof w === 'number') ? `${w}px` : w;
    }
    if (h) {
      this.opts.height = h;
      this.container.style.height = (typeof h === 'number') ? `${h}px` : h;
    }
  }

  setBorder(width, color, radius) {
    if (width !== null) this.container.style.borderWidth = width + 'px';
    if (color !== null) this.container.style.borderColor = color;
    if (radius !== null) this.container.style.borderRadius = radius + 'px';
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

  setInsertionMode(mode) {
    const validModes = ['letter', 'word'];
    if (validModes.includes(mode)) {
      this.opts.insertionMode = mode;
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

  setFont(fontFamily, fontSize) {
    if (fontFamily) {
      this.opts.fontFamily = fontFamily;
      this.container.style.fontFamily = fontFamily;
    }
    if (fontSize) {
      this.opts.fontSize = fontSize;
      this.container.style.fontSize = fontSize + 'px';
    }
    for (const n of this.letterNodes) {
      if (!n || n.tagName === 'BR') continue;
      n.style.removeProperty('font-family');
      n.style.removeProperty('font-size');
    }
    this.cursor.style.height = (this.opts.fontSize + 4) + 'px';
  }

  setLetterPadding(padY = 2, padX = 4) {
    this.opts.letterPadY = padY;
    this.opts.letterPadX = padX;
    for (const n of this.letterNodes) {
      if (!n || n.tagName === 'BR') continue;
      n.style.padding = `${padY}px ${padX}px`;
    }
  }

  setLetterBorderRadius(radius = 4) {
    this.opts.letterBorderRadius = radius;
    for (const n of this.letterNodes) {
      if (!n || n.tagName === 'BR') continue;
      n.style.borderRadius = radius + 'px';
    }
  }

  setLetterBorder(width, color) {
    if (width !== null && width !== undefined) this.opts.letterBorderWidth = width;
    if (color !== null && color !== undefined) this.opts.letterBorderColor = color;
    for (const n of this.letterNodes) {
      if (!n || n.tagName === 'BR') continue;
      n.style.border = this.opts.letterBorderWidth + 'px solid ' + this.opts.letterBorderColor;
    }
  }

  setTextColor(color) {
    this.opts.textColor = color;
    for (const n of this.letterNodes) {
      if (!n || n.tagName === 'BR') continue;
      n.style.color = color;
    }
  }

  setTextColorFunc(fn) {
    this.opts.textColorFunc = (typeof fn === 'function') ? fn : null;
    this.recolor();
  }

  setLetterMargin(marginX = 0) {
    this.opts.letterMarginX = marginX;
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

  // ---------------- Export ----------------

  exportAsImageWithP5(filename = 'notepad.png', opts = {}) {
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
        g.textSize(this.opts.fontSize);
        try { g.textFont(this.opts.fontFamily); } catch (e) { }
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

          g.fill(node.style.color || this.opts.textColor || '#ffffff');
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
        ctx.font = `${this.opts.fontSize}px ${this.opts.fontFamily || 'monospace'}`;

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

          ctx.fillStyle = node.style.color || this.opts.textColor || '#ffffff';
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
      width: (typeof this.opts.width === 'number') ? `${this.opts.width}px` : this.opts.width,
      height: (typeof this.opts.height === 'number') ? `${this.opts.height}px` : this.opts.height,
      border: '1px solid #ccc',
      padding: this.opts.containerPadding,
      fontFamily: this.opts.fontFamily,
      fontSize: this.opts.fontSize + 'px',
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
      display: 'none',
      width: '2px',
      height: (this.opts.fontSize + 4) + 'px',
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

    this.parent = this.opts.parent || document.body;
    this.parent.appendChild(this.container);

    this.textarea = document.createElement('textarea');
    Object.assign(this.textarea.style, {
      position: 'absolute',
      opacity: '0',
      pointerEvents: 'none',
      width: '1px',
      height: 'px',
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
  }

  _attachEvents() {
    // ... (mantener toda la lógica de eventos de la versión original 55KB)
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
      this._isTypingInWord = false;

      const rectContainer = this.container.getBoundingClientRect();
      const clickX = e.clientX - rectContainer.left + this.container.scrollLeft;
      const clickY = e.clientY;

      let idx = null;
      const target = e.target;

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

      if (idx === null) idx = this._indexFromClientXY(e.clientX, e.clientY);

      idx = Math.max(0, Math.min(idx, this.letterNodes.length));

      if (e.shiftKey) {
        if (this.selectionStart === null) this.selectionStart = this.cursorPos;
        this.selectionEnd = idx;
        this.cursorPos = idx;
        this._render();
        return;
      }

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
      this.textarea.focus();
    };

    this.container.addEventListener('pointerdown', this._onPointerDown);
    window.addEventListener('pointermove', this._onPointerMove);
    window.addEventListener('pointerup', this._onPointerUp);

    this.isComposing = false;

    this._onCompositionStart = (e) => {
      this.isComposing = true;
    };

    this._onCompositionEnd = (e) => {
      this.isComposing = false;
      if (e.data) {
        for (let char of e.data) {
          this._insertChar(char);
        }
        this._render();
        this._emit('change');
      }
      this.textarea.value = '';
    };

    this.textarea.addEventListener('compositionstart', this._onCompositionStart);
    this.textarea.addEventListener('compositionend', this._onCompositionEnd);

    this._onInput = (e) => {
      if (!this.isEditable) {
        this.textarea.value = '';
        return;
      }
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
        // Paste handled by paste event
      }

      this.textarea.value = '';
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
        this._isTypingInWord = false;
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
        this._isTypingInWord = false;
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

      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
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
    this.container.addEventListener('keydown', (e) => {
      this.textarea.focus();
    });
  }

  _updateTextareaPosition() {
    try {
      const cursorRect = this.cursor.getBoundingClientRect();
      const containerRect = this.container.getBoundingClientRect();
      this.textarea.style.top = (cursorRect.top - containerRect.top + this.container.scrollTop) + 'px';
      this.textarea.style.left = (cursorRect.left - containerRect.left + this.container.scrollLeft) + 'px';
    } catch (e) { }
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

    if (this.opts.insertionMode === 'word') {
      const prevNode = this.letterNodes[this.cursorPos - 1];

      if (isSpace) {
        const isPrevSpace = prevNode && prevNode.textContent === ' ';

        if (isPrevSpace) {
          const spaceSpan = document.createElement('span');
          spaceSpan.textContent = ' ';
          spaceSpan.style.display = 'inline-block';
          spaceSpan.style.backgroundColor = 'transparent';
          spaceSpan.style.color = 'transparent';
          spaceSpan.style.padding = `${this.opts.letterPadY}px ${this.opts.letterPadX}px`;
          spaceSpan.style.margin = (typeof this.opts.letterMarginX === 'number') ? `0 ${this.opts.letterMarginX}px` : this.opts.letterMarginX;
          spaceSpan.dataset.color = 'transparent';

          this.letterNodes.splice(this.cursorPos, 0, spaceSpan);
          this.cursorPos++;
          this._isTypingInWord = false;
          this._render();
          this._emit('change');
          return;
        } else {
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
          this._isTypingInWord = false;
          this._render();
          this._emit('change');
          return;
        }
      } else {
        const canAppendToPrev = this._isTypingInWord &&
          prevNode &&
          prevNode.tagName === 'SPAN' &&
          prevNode.textContent.trim() !== '' &&
          !prevNode.dataset.invisibleSpace;

        if (canAppendToPrev) {
          prevNode.textContent += ch;
          this._isTypingInWord = true;
          this._render();
          this._emit('change');
          return;
        }
      }
    }

    const span = document.createElement('span');
    span.textContent = ch;

    const color = explicitColor || this._getColorForChar(ch);
    span.style.display = 'inline-block';
    span.style.backgroundColor = isSpace ? 'transparent' : color;
    span.style.color = this._resolveTextColor(ch, this.cursorPos, color);

    span.style.padding = `${this.opts.letterPadY}px ${this.opts.letterPadX}px`;
    span.style.margin = (typeof this.opts.letterMarginX === 'number') ? `0 ${this.opts.letterMarginX}px` : this.opts.letterMarginX;
    span.style.borderRadius = this.opts.letterBorderRadius + 'px';
    span.style.border = this.opts.letterBorderWidth + 'px solid ' + this.opts.letterBorderColor;
    span.dataset.color = color;

    this.letterNodes.splice(this.cursorPos, 0, span);
    this.cursorPos++;

    if (!isSpace && this.opts.insertionMode === 'word') {
      this._isTypingInWord = true;
    }
  }

  _insertNewline() {
    if (this.editingIndex !== null) {
      this.cursorPos = this.editingIndex + 1;
      this.editingIndex = null;
    }
    if (this.overwriteMode) return;
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
      const firstNode = this.letterNodes[sel.start];
      if (firstNode && firstNode.tagName !== 'BR') firstNode.textContent = ch;
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
        this._render();
        this._emit('change');
      }
    }
  }

  _getColorForChar(ch) {
    if (this.opts.noteColorMap && typeof this.opts.noteColorMap === 'object') {
      if (this.opts.noteColorMap.hasOwnProperty(ch)) { this._seqIndex++; return this.opts.noteColorMap[ch]; }
      const lower = ch.toLowerCase();
      if (this.opts.noteColorMap.hasOwnProperty(lower)) { this._seqIndex++; return this.opts.noteColorMap[lower]; }
    }

    if (typeof this.opts.colorFunc === 'function') {
      try {
        const c = this.opts.colorFunc(ch, this.letterNodes.length, this._seqIndex);
        if (c) { this._seqIndex++; return c; }
      } catch (e) { console.error('colorFunc error', e); }
    }

    if (this.opts.colorMap && typeof this.opts.colorMap === 'object') {
      if (this.opts.colorMap.hasOwnProperty(ch)) { this._seqIndex++; return this.opts.colorMap[ch]; }
      const lower = ch.toLowerCase();
      if (this.opts.colorMap.hasOwnProperty(lower)) { this._seqIndex++; return this.opts.colorMap[lower]; }
    }

    if (Array.isArray(this.opts.colorSequence) && this.opts.colorSequence.length) {
      const c = this.opts.colorSequence[this._seqIndex % this.opts.colorSequence.length];
      this._seqIndex++;
      return c;
    }

    const c = this.opts.colors[this._seqIndex % this.opts.colors.length];
    this._seqIndex++;
    return c;
  }

  _deterministicColorForChar(ch, pos) {
    if (this.opts.noteColorMap && typeof this.opts.noteColorMap === 'object') {
      if (this.opts.noteColorMap.hasOwnProperty(ch)) return this.opts.noteColorMap[ch];
      const lower = ch.toLowerCase();
      if (this.opts.noteColorMap.hasOwnProperty(lower)) return this.opts.noteColorMap[lower];
    }

    if (typeof this.opts.colorFunc === 'function') {
      try {
        const c = this.opts.colorFunc(ch, pos, pos);
        if (c) return c;
      } catch (e) { console.error('colorFunc error', e); }
    }

    if (this.opts.colorMap && typeof this.opts.colorMap === 'object') {
      if (this.opts.colorMap.hasOwnProperty(ch)) return this.opts.colorMap[ch];
      const lower = ch.toLowerCase();
      if (this.opts.colorMap.hasOwnProperty(lower)) return this.opts.colorMap[lower];
    }

    if (Array.isArray(this.opts.colorSequence) && this.opts.colorSequence.length) {
      return this.opts.colorSequence[pos % this.opts.colorSequence.length];
    }

    return this.opts.colors[pos % this.opts.colors.length];
  }

  _resolveTextColor(ch, index, bgColor) {
    if (typeof this.opts.textColorFunc === 'function') {
      try {
        const c = this.opts.textColorFunc(ch, index, bgColor);
        if (c) return c;
      } catch (e) { console.error('textColorFunc error', e); }
    }
    return this.opts.textColor;
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
      if (this.editingIndex !== i && node.childNodes.length > 1) {
        node.textContent = node.textContent;
      }
    }

    if (this.editingIndex !== null && this.editingIndex < this.letterNodes.length) {
      for (let i = 0; i < this.letterNodes.length; i++) {
        this.content.appendChild(this.letterNodes[i]);
      }
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
      let placeCursorInside = false;
      let targetNode = null;

      if (this.opts.insertionMode === 'word' && this.cursorPos > 0 && this._isTypingInWord) {
        const prevNode = this.letterNodes[this.cursorPos - 1];
        if (prevNode &&
          prevNode.tagName === 'SPAN' &&
          !prevNode.dataset.invisibleSpace &&
          prevNode.textContent.trim() !== '') {
          placeCursorInside = true;
          targetNode = prevNode;
        }
      }

      if (placeCursorInside && targetNode) {
        for (let i = 0; i < this.letterNodes.length; i++) {
          if (this.letterNodes[i] === targetNode) {
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
    const lineThreshold = Math.max((this.opts.fontSize || 16) * 0.8, 8);

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

  _randomColor() { return this.opts.colors[Math.floor(Math.random() * this.opts.colors.length)]; }

  _emit(eventName, payload) {
    if (!this.handlers[eventName]) return;
    for (const fn of this.handlers[eventName]) {
      try { fn(payload); } catch (e) { console.error(e); }
    }
  }

  _parseColor(colorString) {
    if (!colorString || colorString === 'transparent') {
      return null;
    }

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

if (typeof module !== 'undefined' && module.exports) {
  module.exports = Notepad;
} else {
  window.Notepad = Notepad;
}
