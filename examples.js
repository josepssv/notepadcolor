<!DOCTYPE html>
<html lang="es">

<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Ejemplo de Notepad</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            background-color: #999;
            margin: 0;
            padding: 20px;
        }

        .example-container {
            margin-bottom: 40px;
            text-align: center;
        }

        #notepad-wrap,
        #notepad-wrap-0-5,
        #notepad-wrap-2,
        #notepad-wrap-3,
        #notepad-wrap-4,
        #notepad-wrap-5,
        #notepad-wrap-6 {
            margin: 0 auto;
            display: inline-block;
        }

        .variables-info {
            font-size: 10px;
            color: #666;
            text-align: center;
            margin-top: 5px;
        }

        .export-button {
            margin-top: 10px;
            padding: 8px 16px;
            background-color: #555;
            color: white;
            border: none;
            border-radius: 4px;
            cursor: pointer;
        }

        .export-button:hover {
            background-color: #777;
        }
    </style>
</head>

<body>
    <script src="https://cdn.jsdelivr.net/npm/p5@1.11.11/lib/p5.js"></script>
    <div id="app-header"
        style="display: flex; align-items: center; gap: 15px; margin-bottom: 20px; padding-bottom: 10px; border-bottom: 1px solid #ddd;">
        <h1 style="margin: 0; font-size: 28px; color: #333; font-weight: 600;"><a href="index.html">NotepadDivColor</a>
        </h1>
    </div>
    <!-- Ejemplo 0: Activo / Inactivo -->
    <div class="example-container">
        <h3>Estado Activo / Inactivo</h3>
        <div id="notepad-wrap-0"></div>
        <div style="margin-top: 10px;">
            <label>
                <input type="checkbox" id="toggle-editable" checked> Activo (Editable)
            </label>
        </div>
        <div class="variables-info">
            Prueba la propiedad setEditable(true/false)
        </div>
    </div>

    <!-- Ejemplo 0.5: Modos de Inserción -->
    <div class="example-container">
        <h3>Modos de Inserción</h3>
        <div id="notepad-wrap-0-5"></div>
        <div style="margin-top: 10px;">
            <button id="mode-word" class="export-button" style="margin-top: 0; margin-right: 5px;">Modo Palabra</button>
            <button id="mode-letter" class="export-button" style="margin-top: 0;">Modo Letra</button>
        </div>
        <div class="variables-info">
            <strong>Modo Palabra:</strong> Letras seguidas = 1 bloque | Letra entre espacios = bloque individual | 1
            espacio = invisible | 2 espacios = separación<br>
            <strong>Modo Letra:</strong> cada letra en bloque separado
        </div>
    </div>

    <!-- Ejemplo 1 -->
    <div class="example-container">
        <h3>ESTILO</h3>
        <div id="notepad-wrap"></div>
        <div>
            <button id="export-img" class="export-button">Exportar a PNG</button>
        </div>
        <div class="variables-info">
            Ejemplo 1: fontSize=40, containerPadding=0, letterPadX=20, letterPadY=20, letterBorderRadius=0, colores
            arcoíris
        </div>
    </div>
    <!-- Ejemplo 2 -->
    <div class="example-container">
        <div id="notepad-wrap-2"></div>
        <div>
            <button id="export-img-2" class="export-button">Exportar a PNG</button>
        </div>
        <div class="variables-info">
            Ejemplo 2: fontSize=24, containerPadding=4px, letterPadX=24, letterPadY=24, background=#6b7c6e,
            border=0,
            colores arcoíris
        </div>
    </div>
    <!-- Ejemplo 3 -->
    <div class="example-container">
        <div id="notepad-wrap-3"></div>
        <div>
            <button id="export-img-3" class="export-button">Exportar a PNG</button>
        </div>
        <div class="variables-info">
            Ejemplo 3: fontSize=30, containerPadding=0, letterPadX=15, letterPadY=15, colores secuenciales arcoíris,
            espacios transparentes, fondo transparente
        </div>
    </div>

    <!-- Ejemplo 4 -->
    <div class="example-container">
        <div id="notepad-wrap-4"></div>
        <div>
            <button id="export-img-4" class="export-button">Exportar a PNG</button>
        </div>
        <div class="variables-info">
            Ejemplo 4: fontSize=30, containerPadding=0, letterPadX=15, letterPadY=15, colores aleatorios, contorno
            redondo, fondo transparente, sin borde de fondo
        </div>
    </div>

    <!-- Ejemplo 5 -->
    <div class="example-container">
        <div id="notepad-wrap-5"></div>
        <div>
            <button id="export-img-5" class="export-button">Exportar a PNG</button>
        </div>
        <div class="variables-info">
            Ejemplo 5: fontSize=30, containerPadding=0, letterPadX=15, letterPadY=15, colores aleatorios, texto alto
            contraste (dinámico), fondo transparente
        </div>
    </div>

    <!-- Ejemplo 6 -->
    <div class="example-container">
        <div id="notepad-wrap-6"></div>
        <div>
            <button id="export-img-6" class="export-button">Exportar a PNG</button>
        </div>
        <div class="variables-info">
            Ejemplo 6: fontSize=30, containerPadding=0, letterPadX=20, letterPadY=20, fondo circular, ciclo arcoíris
            (10 pasos), texto complementario, espacios transparentes
        </div>
    </div>

    <script src="notepad.js"></script>
    <script>
        document.addEventListener('DOMContentLoaded', () => {
            const rainbowColorMap = Notepad.assignRainbowColors();
            const rainbowSequence = Notepad.generateRainbowColors(50);
            const randomColorMap = Notepad.assignRandomColors();

            // Ejemplo 0
            const np0 = new Notepad({
                parent: document.getElementById('notepad-wrap-0'),
                fontSize: 24,
                editable: true,
                width: 'auto',
                height: 'auto'
            });
            np0.setRainbowCycleMode(10);
            np0.insertText("Estado activo");
            np0.setContainerBackground('transparent');
            document.getElementById('toggle-editable').addEventListener('change', (e) => {
                np0.setEditable(e.target.checked);
                np0.setContainerBackground(e.target.checked ? '#fff' : '#f0f0f0');
                np0.setTextColor(e.target.checked ? '#000' : '#888');
            });

            // Ejemplo 0.5: Modos de Inserción
            const np05 = new Notepad({
                parent: document.getElementById('notepad-wrap-0-5'),
                fontSize: 24,
                editable: true,
                width: 'auto',
                height: 'auto',
                containerPadding: '5px',
                insertionMode: 'word' // Start in word mode
            });

            // Configurar estilo
            np05.setLetterPadding(10, 10);
            np05.setLetterBorderRadius(6);
            np05.setContainerBackground('transparent');
            np05.setRainbowCycleMode(10);

            // Insertar texto inicial que demuestra el comportamiento
            np05.insertText("Hola a todos");

            // Botones de modo de inserción
            document.getElementById('mode-word').addEventListener('click', () => {
                np05.setInsertionMode('word');
                np05.setFromPlainText('');
                np05.insertText("Hola a todos");
            });

            document.getElementById('mode-letter').addEventListener('click', () => {
                np05.setInsertionMode('letter');
                np05.setFromPlainText('');
                np05.insertText("Hola a todos");
            });

            // Ejemplo 1
            const np = new Notepad({
                parent: document.getElementById('notepad-wrap'),
                fontSize: 40,
                noteColorMap: rainbowColorMap,
                containerPadding: '0px',
                width: 'auto',
                height: 'auto'
            });
            np.setLetterPadding(20, 20);
            np.setLetterBorderRadius(0);
            np.insertText("ABCD");
            np.setInsertionMode('letter');
            np.setContainerBackground('#6b7c6e');

            document.getElementById('export-img').addEventListener('click', () => {
                np.exportAsImageWithP5('notepad-snapshot-1.png', { scale: 2 })
                    .then(() => console.log('Exportación del Ejemplo 1 completada'))
                    .catch(err => console.error('Error en la exportación del Ejemplo 1:', err));
            });

            // Ejemplo 2
            const np2 = new Notepad({
                parent: document.getElementById('notepad-wrap-2'),
                fontSize: 24,
                noteColorMap: rainbowColorMap,
                containerPadding: '4px',
                width: 'auto',
                height: 'auto'
            });
            np2.setLetterPadding(24, 24);
            np2.setLetterBorderRadius(0);
            np2.setContainerBackground('#6b7c6e');
            np2.setBorder(0, null, null);
            np2.setInsertionMode('letter');
            np2.insertText("ABCD");

            document.getElementById('export-img-2').addEventListener('click', () => {
                np2.exportAsImageWithP5('notepad-snapshot-2.png', { scale: 2 })
                    .then(() => console.log('Exportación del Ejemplo 2 completada'))
                    .catch(err => console.error('Error en la exportación del Ejemplo 2:', err));
            });

            // Ejemplo 3
            const np3 = new Notepad({
                parent: document.getElementById('notepad-wrap-3'),
                fontSize: 30,
                colorSequence: rainbowSequence,
                colors: ['transparent'],
                containerPadding: '0px',
                width: 'auto',
                height: 'auto'
            });
            np3.setLetterPadding(15, 15);
            np3.setLetterBorderRadius(0);
            np3.setInsertionMode('letter');
            np3.setContainerBackground('transparent');
            np3.insertText("A B C D");

            document.getElementById('export-img-3').addEventListener('click', () => {
                np3.exportAsImageWithP5('notepad-snapshot-3.png', { scale: 2, background: 'transparent' })
                    .then(() => console.log('Exportación del Ejemplo 3 completada'))
                    .catch(err => console.error('Error en la exportación del Ejemplo 3:', err));
            });

            // Ejemplo 4
            const np4 = new Notepad({
                parent: document.getElementById('notepad-wrap-4'),
                fontSize: 30,
                noteColorMap: randomColorMap,
                colors: ['transparent'],
                containerPadding: '0',
                width: 'auto',
                height: 'auto'
            });
            np4.setLetterPadding(15, 30);
            np4.setLetterBorderRadius(30);
            np4.setLetterBorder(0, '#333');
            np4.setContainerBackground('transparent');
            np4.setInsertionMode('letter');
            np4.insertText("ABCD");
            np4.setBorder(0, null, null);

            document.getElementById('export-img-4').addEventListener('click', () => {
                np4.exportAsImageWithP5('notepad-snapshot-4.png', { scale: 2, background: 'transparent' })
                    .then(() => console.log('Exportación del Ejemplo 4 completada'))
                    .catch(err => console.error('Error en la exportación del Ejemplo 4:', err));
            });

            // Ejemplo 5
            const np5 = new Notepad({
                parent: document.getElementById('notepad-wrap-5'),
                fontSize: 30,
                noteColorMap: randomColorMap,
                containerPadding: '0',
                width: 'auto',
                height: 'auto',
                textColorFunc: (char, index, bg) => Notepad.getContrastColor(bg)
            });
            np5.setLetterPadding(15, 15);
            np5.setContainerBackground('transparent');
            np5.setBorder(0, null, null);
            np5.setInsertionMode('letter');
            np5.insertText("HOLA MUNDO");

            document.getElementById('export-img-5').addEventListener('click', () => {
                np5.exportAsImageWithP5('notepad-snapshot-5.png', { scale: 2, background: 'transparent' })
                    .then(() => console.log('Exportación del Ejemplo 5 completada'))
                    .catch(err => console.error('Error en la exportación del Ejemplo 5:', err));
            });

            // Ejemplo 6
            const np6 = new Notepad({
                parent: document.getElementById('notepad-wrap-6'),
                fontSize: 30,
                containerPadding: '0',
                width: 'auto',
                height: 'auto',
                textColorFunc: (char, index, bg) => Notepad.getComplementaryColor(bg)
            });
            np6.setRainbowCycleMode(10);
            np6.setLetterPadding(20, 20);
            np6.setLetterBorderRadius(50);
            np6.setContainerBackground('transparent');
            np6.setBorder(0, null, null);
            np6.setInsertionMode('word');
            np6.insertText("Entre las f l o r e s");

            document.getElementById('export-img-6').addEventListener('click', () => {
                np6.exportAsImageWithP5('notepad-snapshot-6.png', { scale: 2, background: 'transparent' })
                    .then(() => console.log('Exportación del Ejemplo 6 completada'))
                    .catch(err => console.error('Error en la exportación del Ejemplo 6:', err));
            });
        });
    </script>
</body>

</html>
