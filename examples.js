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
        #notepad-wrap-2,
        #notepad-wrap-3,
        #notepad-wrap-4 {
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

    <!-- Ejemplo 1 -->
    <div class="example-container">
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
            Ejemplo 2: fontSize=24, containerPadding=4px, letterPadX=24, letterPadY=24, background=#6b7c6e, border=0,
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

    <script>
        const alfabeto = "abcdefghijklmnopqrstuvwxyz1234567890".split("");

        // Función para generar colores tipo arcoíris
        function generateRainbowColors(steps) {
            const rainbowColors = [];
            for (let i = 0; i < steps; i++) {
                const hue = (i / steps) * 360;
                rainbowColors.push(`hsl(${hue}, 100%, 50%)`);
            }
            return rainbowColors;
        }

        // Función para generar colores aleatorios
        function generateRandomColors(steps) {
            const randomColors = [];
            for (let i = 0; i < steps; i++) {
                const r = Math.floor(Math.random() * 256);
                const g = Math.floor(Math.random() * 256);
                const b = Math.floor(Math.random() * 256);
                randomColors.push(`rgb(${r}, ${g}, ${b})`);
            }
            return randomColors;
        }

        // Asignar colores arcoíris a cada letra
        function assignRainbowColors(letters) {
            const rainbowColors = generateRainbowColors(letters.length);
            let colorMap = {};
            letters.forEach((letter, index) => {
                colorMap[letter] = rainbowColors[index];
            });
            return colorMap;
        }

        // Asignar colores aleatorios a cada letra
        function assignRandomColors(letters) {
            const randomColors = generateRandomColors(letters.length);
            let colorMap = {};
            letters.forEach((letter, index) => {
                colorMap[letter] = randomColors[index];
            });
            return colorMap;
        }
    </script>

    <script src="notepad.js"></script>
    <script>
        document.addEventListener('DOMContentLoaded', () => {
            const rainbowColorMap = assignRainbowColors(alfabeto);
            const rainbowSequence = generateRainbowColors(50);
            const randomColorMap = assignRandomColors(alfabeto);

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

            // Botón de exportación para el Ejemplo 1
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
            np2.insertText("ABCD");

            // Botón de exportación para el Ejemplo 2
            document.getElementById('export-img-2').addEventListener('click', () => {
                np2.exportAsImageWithP5('notepad-snapshot-2.png', { scale: 2 })
                    .then(() => console.log('Exportación del Ejemplo 2 completada'))
                    .catch(err => console.error('Error en la exportación del Ejemplo 2:', err));
            });

            // Ejemplo 3: Fondo transparente
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
            np3.setContainerBackground('transparent');
            np3.insertText("A B C D");

            // Botón de exportación para el Ejemplo 3
            document.getElementById('export-img-3').addEventListener('click', () => {
                np3.exportAsImageWithP5('notepad-snapshot-3.png', { scale: 2, background: 'transparent' })
                    .then(() => console.log('Exportación del Ejemplo 3 completada'))
                    .catch(err => console.error('Error en la exportación del Ejemplo 3:', err));
            });

            // Ejemplo 4: Contorno redondo, colores aleatorios, fondo transparente
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
            np4.setLetterBorderRadius(30); // Contorno redondo
            np4.setLetterBorder(0, '#333'); // Borde visible y más ancho
            np4.setContainerBackground('transparent');
            np4.insertText("ABCD");


            // Botón de exportación para el Ejemplo 4
            document.getElementById('export-img-4').addEventListener('click', () => {
                np4.exportAsImageWithP5('notepad-snapshot-4.png', { scale: 2, background: 'transparent' })
                    .then(() => console.log('Exportación del Ejemplo 4 completada'))
                    .catch(err => console.error('Error en la exportación del Ejemplo 4:', err));
            });
        });
    </script>
</body>

</html>
