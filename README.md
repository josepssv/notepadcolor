# Notepad - Colorful Text Editor

A lightweight, zero-dependency JavaScript library to create customizable text editors where each character is an independent DOM element. This allows for unique styling (background colors, borders, padding, radius) per character, making it ideal for creative coding, educational tools, or artistic text displays.

## Features

*   **Per-Character Styling**: Assign unique background colors, text colors, and borders to each character.
*   **Rich Customization**: Control padding, margins, border radius, and fonts globally or per character.
*   **Dynamic Content**: Supports text insertion, selection, copy, cut, and paste operations.
*   **Mobile Friendly**: Includes a hidden textarea to support mobile keyboards and IME input.
*   **Export to Image**: Built-in support to export the notepad content as a PNG image (uses `p5.js` if available, falls back to native Canvas).
*   **No Dependencies**: Works standalone. `p5.js` is optional for advanced image export features.

## Installation

Simply include `notepad.js` in your HTML file:

```html
<script src="notepad.js"></script>
```

## Usage

Create a container element in your HTML and instantiate the `Notepad` class.

```html
<div id="my-notepad"></div>

<script>
  const np = new Notepad({
    parent: document.getElementById('my-notepad'),
    width: 600,
    height: 300,
    fontSize: 20,
    fontFamily: 'monospace'
  });

  np.insertText("Hello World!");
</script>
```

## API Documentation

### Constructor

```javascript
new Notepad(options)
```

**Options Object:**

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `parent` | HTMLElement | `document.body` | The DOM element to append the notepad to. |
| `width` | Number | `600` | Initial width in pixels. |
| `height` | Number | `300` | Initial height in pixels. |
| `fontSize` | Number | `20` | Font size in pixels. |
| `fontFamily` | String | `'monospace'` | Font family. |
| `colors` | Array | `['transparent']` | Array of fallback colors. |
| `noteColorMap` | Object | `null` | Map of characters to colors (e.g., `{'a': 'red'}`). |
| `colorSequence` | Array | `null` | Array of colors to cycle through sequentially. |
| `colorFunc` | Function | `null` | Function `(char, index) => color` to determine color dynamically. |
| `textColorFunc` | Function | `null` | Function `(char, index, bg) => color` for dynamic text color. |
| `containerPadding`| String | `'0px'` | Padding for the main container. |

### Core Methods

*   **`insertText(text)`**: Inserts text at the current cursor position.
*   **`getPlainText()`**: Returns the current text content as a string.
*   **`setFromPlainText(text)`**: Replaces the entire content with the given text.
*   **`focus()`**: Focuses the editor for input.

### Styling Methods

*   **`setFont(family, size)`**: Updates the font family and/or size. Pass `null` to keep current value.
*   **`setLetterPadding(padY, padX)`**: Sets vertical and horizontal padding for each character (in pixels).
*   **`setLetterMargin(margin)`**: Sets the horizontal margin between characters (number for px, or string).
*   **`setLetterBorderRadius(radius)`**: Sets the border radius for character backgrounds.
*   **`setLetterBorder(width, color)`**: Sets the border width and color for individual characters.
*   **`setBorder(width, color, radius)`**: Sets the border style for the main container.
*   **`setAppBackground(color)`**: Changes the document body background color.
*   **`setContainerBackground(color)`**: Changes the notepad container background color.
*   **`setTextColor(color)`**: Sets a static text color for all characters.
*   **`setTextColorFunc(fn)`**: Sets a function to determine text color dynamically based on character, index, and background color.

### Color Management

*   **`setNoteColorMap(map)`**: Sets a dictionary mapping characters to colors.
*   **`setColorSequence(seq)`**: Sets an array of colors to cycle through.
*   **`setColorFunc(fn)`**: Sets a custom function for color logic.

### Export

*   **`exportAsImageWithP5(filename, options)`**: Exports the current view as a PNG image.
    *   `filename`: Name of the file (default: `'notepad.png'`).
    *   `options`: `{ scale: 2, background: 'color' }`.
    *   *Note: Uses `p5.createGraphics` if `p5.js` is loaded, otherwise falls back to a native Canvas implementation.*

## Events

You can listen to events using the `on` method:

```javascript
np.on('change', () => {
  console.log('Text changed:', np.getPlainText());
});
```

*   `'change'`: Fired when text content changes.
*   `'copy'`: Fired when text is copied.
*   `'paste'`: Fired when text is pasted.

## Examples

Check `index.html` and `examples.html` in the repository for interactive demos showing:
*   Rainbow text effects.
*   Circular character backgrounds.
*   High contrast text modes.
*   Transparent backgrounds.
