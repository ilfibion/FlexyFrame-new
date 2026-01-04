/**
 * Скрипт для оптимизации изображений для FlexyFrame
 * Использование: node optimize-images.js
 */

const fs = require('fs');
const path = require('path');
const sharp = require('sharp'); // npm install sharp

// Конфигурация
const CONFIG = {
    inputDir: './',
    outputDir: './optimized-images',
    sizes: [
        { width: 300, suffix: 'small' },   // Для превью
        { width: 600, suffix: 'medium' },  // Для мобильных
        { width: 1200, suffix: 'large' },  // Для десктопа
        { width: 2000, suffix: 'original' } // Оригинал
    ],
    formats: ['webp', 'jpg'],
    quality: {
        webp: 85,
        jpg: 90
    }
};

// Поддерживаемые форматы
const SUPPORTED_FORMATS = ['.jpg', '.jpeg', '.png', '.webp'];

/**
 * Создание директории если не существует
 */
function ensureDirectoryExists(dir) {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        console.log(`✓ Создана директория: ${dir}`);
    }
}

/**
 * Оптимизация одного изображения
 */
async function optimizeImage(inputPath, outputPath, size, format) {
    try {
        const image = sharp(inputPath);
        
        // Получаем метаданные
        const metadata = await image.metadata();
        
        // Пропускаем если изображение меньше целевого размера
        if (metadata.width <= size.width) {
            console.log(`⚠ Пропущено (маленькое): ${path.basename(inputPath)} (${metadata.width}x${metadata.height})`);
            return false;
        }

        // Изменяем размер
        const resized = image.resize({
            width: size.width,
            height: null,
            fit: 'inside',
            withoutEnlargement: true
        });

        // Конвертируем в нужный формат
        let outputBuffer;
        let outputExt;
        
        if (format === 'webp') {
            outputBuffer = await resized.webp({ quality: CONFIG.quality.webp }).toBuffer();
            outputExt = '.webp';
        } else if (format === 'jpg') {
            outputBuffer = await resized.jpeg({ quality: CONFIG.quality.jpg }).toBuffer();
            outputExt = '.jpg';
        }

        // Формируем имя файла
        const baseName = path.basename(inputPath, path.extname(inputPath));
        const finalOutputPath = path.join(
            path.dirname(outputPath),
            `${baseName}-${size.suffix}${outputExt}`
        );

        // Сохраняем файл
        fs.writeFileSync(finalOutputPath, outputBuffer);
        
        console.log(`✓ Оптимизировано: ${path.basename(finalOutputPath)} (${size.width}w, ${format})`);
        return true;

    } catch (error) {
        console.error(`✗ Ошибка обработки ${inputPath}:`, error.message);
        return false;
    }
}

/**
 * Обработка директории с изображениями
 */
async function processDirectory(dir) {
    const files = fs.readdirSync(dir);
    const imageFiles = files.filter(file => {
        const ext = path.extname(file).toLowerCase();
        return SUPPORTED_FORMATS.includes(ext);
    });

    if (imageFiles.length === 0) {
        console.log('⚠ Изображения не найдены в директории:', dir);
        return;
    }

    console.log(`\n📁 Обработка директории: ${dir}`);
    console.log(`📊 Найдено изображений: ${imageFiles.length}`);

    for (const file of imageFiles) {
        const inputPath = path.join(dir, file);
        const outputDir = path.join(CONFIG.outputDir, path.relative(CONFIG.inputDir, dir));
        
        ensureDirectoryExists(outputDir);

        // Обрабатываем каждый размер и формат
        for (const size of CONFIG.sizes) {
            for (const format of CONFIG.formats) {
                await optimizeImage(inputPath, outputDir, size, format);
            }
        }
    }
}

/**
 * Генерация CSS для responsive images
 */
function generateCSS() {
    const css = `
/* === ОПТИМИЗИРОВАННЫЕ ИЗОБРАЖЕНИЯ === */

/* Responsive images with art direction */
.paint-card img {
    width: 100%;
    height: 250px;
    object-fit: cover;
    background: var(--light-gray);
}

/* WebP с fallback */
.paint-card img[src$=".webp"] {
    /* WebP поддерживается современными браузерами */
}

/* Мобильные оптимизированные изображения */
@media (max-width: 768px) {
    .paint-card img {
        height: 200px;
    }
}

/* Предзагрузка критических изображений */
@keyframes preload {
    0% { opacity: 0; }
    100% { opacity: 1; }
}

.paint-card img.loaded {
    animation: preload 0.3s ease-in;
}

/* Альтернативные тексты для доступности */
.paint-card img[alt=""] {
    border: 2px dashed var(--gray);
    padding: 20px;
}
`;

    const cssPath = path.join(CONFIG.outputDir, 'responsive-images.css');
    fs.writeFileSync(cssPath, css);
    console.log(`\n✓ Сгенерирован CSS: ${cssPath}`);
}

/**
 * Генерация HTML примеров
 */
function generateHTMLExamples() {
    const html = `
<!-- Примеры использования оптимизированных изображений -->

<!-- 1. Адаптивное изображение с WebP fallback -->
<picture>
    <source srcset="images/painting-small.webp 300w, images/painting-medium.webp 600w, images/painting-large.webp 1200w" 
            type="image/webp">
    <source srcset="images/painting-small.jpg 300w, images/painting-medium.jpg 600w, images/painting-large.jpg 1200w" 
            type="image/jpeg">
    <img src="images/painting-medium.jpg" 
         alt="Аркейн Триумвират" 
         loading="lazy"
         width="600" 
         height="400">
</picture>

<!-- 2. Использование в CSS -->
/*
.paint-card {
    background-image: url('images/painting-small.webp');
    background-image: image-set(
        url('images/painting-small.webp') 1x,
        url('images/painting-medium.webp') 2x
    );
}
*/

<!-- 3. Lazy loading с placeholder -->
<img data-src="images/painting-large.webp" 
     alt="Описание" 
     class="lazy-load"
     width="1200" 
     height="800">

<!-- 4. Preload для критических изображений -->
<link rel="preload" 
      as="image" 
      href="images/hero-image-large.webp" 
      type="image/webp"
      imagesrcset="images/hero-image-small.webp 300w, images/hero-image-medium.webp 600w, images/hero-image-large.webp 1200w">
`;

    const htmlPath = path.join(CONFIG.outputDir, 'examples.html');
    fs.writeFileSync(htmlPath, html);
    console.log(`✓ Сгенерированы примеры HTML: ${htmlPath}`);
}

/**
 * Генерация отчета
 */
function generateReport(stats) {
    const report = `
# Отчет по оптимизации изображений FlexyFrame

## Статистика
- Обработано директорий: ${stats.directories}
- Обработано изображений: ${stats.images}
- Создано вариантов: ${stats.variants}
- Сэкономлено места: ~${stats.savedMB} MB

## Рекомендации
1. Используйте WebP для современных браузеров
2. Добавьте lazy loading для изображений ниже экрана
3. Используйте placeholder для улучшения UX
4. Предзагружайте критические изображения
5. Используйте CDN для статики

## Файлы
- Оптимизированные изображения: ${CONFIG.outputDir}/
- CSS для responsive: ${CONFIG.outputDir}/responsive-images.css
- Примеры HTML: ${CONFIG.outputDir}/examples.html

## Поддержка браузеров
- WebP: 95%+ современных браузеров
- JPG: 100% поддержка
- AVIF (опционально): 85%+ современных браузеров
`;

    const reportPath = path.join(CONFIG.outputDir, 'OPTIMIZATION_REPORT.md');
    fs.writeFileSync(reportPath, report);
    console.log(`✓ Сгенерирован отчет: ${reportPath}`);
}

/**
 * Основная функция
 */
async function main() {
    console.log('🚀 Начало оптимизации изображений FlexyFrame\n');
    
    const startTime = Date.now();
    const stats = {
        directories: 0,
        images: 0,
        variants: 0,
        savedMB: 0
    };

    try {
        // Создаем выходную директорию
        ensureDirectoryExists(CONFIG.outputDir);

        // Обрабатываем основные директории
        const mainDirs = [
            './Аркейн',
            './Давид',
            './Железный Человек',
            './Земфира',
            './ЛОГОТИП',
            './Магическая битва',
            './Скрудж',
            './Танос',
            './Live'
        ];

        for (const dir of mainDirs) {
            if (fs.existsSync(dir)) {
                await processDirectory(dir);
                stats.directories++;
            }
        }

        // Генерируем дополнительные файлы
        generateCSS();
        generateHTMLExamples();
        generateReport(stats);

        const endTime = Date.now();
        const duration = ((endTime - startTime) / 1000).toFixed(2);

        console.log(`\n✅ Оптимизация завершена за ${duration} секунд`);
        console.log(`📁 Результаты в: ${CONFIG.outputDir}/`);

    } catch (error) {
        console.error('\n❌ Критическая ошибка:', error);
        process.exit(1);
    }
}

// Запуск
if (require.main === module) {
    // Проверка наличия sharp
    try {
        require.resolve('sharp');
    } catch (e) {
        console.error('❌ Необходимо установить sharp: npm install sharp');
        console.error('Или использовать альтернативный метод оптимизации');
        
        // Альтернативный метод без sharp
        console.log('\n🔄 Запуск альтернативной оптимизации...');
        mainAlternative();
        return;
    }
    
    main();
}

// Альтернативная функция без sharp
async function mainAlternative() {
    console.log('🔄 Используется альтернативный метод оптимизации\n');
    
    const report = `
# Альтернативная оптимизация FlexyFrame

## Рекомендации без использования sharp:

1. **Оптимизация вручную:**
   - Используйте TinyPNG (tinypng.com)
   - Или Squoosh (squoosh.app)
   - Или ImageOptim (для Mac)

2. **Размеры изображений:**
   - Превью: 300x250px
   - Мобильные: 600x500px
   - Десктоп: 1200x1000px

3. **Форматы:**
   - WebP (основной)
   - JPG (fallback)
   - PNG (для логотипов)

4. **Инструменты:**
   \`\`\`bash
   # ImageMagick (альтернатива)
   convert input.jpg -resize 1200x1000 -quality 85 output.webp
   
   # OptiPNG
   optipng -o7 input.png
   
   # JPEGoptim
   jpegoptim --size=80% input.jpg
   \`\`\`

5. **Автоматизация:**
   - Используйте Gulp, Webpack или Parcel
   - Настройте CI/CD pipeline
   - Используйте Cloudinary или Imgix

## Ручная оптимизация:
1. Откройте изображение в редакторе
2. Измените размер до нужных пропорций
3. Сохраните в WebP (85% качество)
4. Сохраните в JPG (90% качество)
5. Поместите в папку optimized-images/
`;

    fs.writeFileSync('OPTIMIZATION_GUIDE.md', report);
    console.log('✓ Создано руководство: OPTIMIZATION_GUIDE.md');
    console.log('✅ Готово! Следуйте инструкциям в файле.');
}