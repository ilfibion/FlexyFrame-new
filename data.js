// === ЦЕНТРАЛИЗОВАННЫЙ СПИСОК КАРТИН ===
// Используется как в боте, так и на сайте

const paintings = [
    {
        id: 1,
        title: "Аркейн Триумвират",
        fullTitle: "Аркейн Триумвират Заводского Города",
        category: "Аркейн",
        price: 4200,
        file: "Аркейн Триумвират Заводского Города.jpg",
        badge: "Хит"
    },
    {
        id: 2,
        title: "Глитч-Давид",
        fullTitle: "Глитч-Давид Рождение в цифровом хаосе",
        category: "Давид",
        price: 4200,
        file: "Глитч-Давид Рождение в цифровом хаосе.jpg",
        badge: "Новинка"
    },
    {
        id: 3,
        title: "Цифровая Древность",
        fullTitle: "Цифровая Древность Голубой Давид",
        category: "Давид",
        price: 4200,
        file: "Цифровая Древность Голубой Давид.jpg"
    },
    {
        id: 4,
        title: "Железный Человек",
        fullTitle: "Железный Человек Перерыв на обед",
        category: "Железный Человек",
        price: 4200,
        file: "Железный Человек Перерыв на обед.jpg"
    },
    {
        id: 5,
        title: "Мысли в облаках",
        fullTitle: "Мысли в облаках",
        category: "Земфира",
        price: 4200,
        file: "Мысли в облаках.jpg"
    },
    {
        id: 6,
        title: "КэнтоНанами",
        fullTitle: "КэнтоНанами",
        category: "Магическая битва",
        price: 4200,
        file: "КэнтоНанами.png",
        badge: "Хит"
    },
    {
        id: 7,
        title: "Скрудж Макдак",
        fullTitle: "Скрудж Макдак Граффити-Миллиардер",
        category: "Скрудж",
        price: 4200,
        file: "Скрудж Макдак Граффити-Миллиардер.jpg"
    },
    {
        id: 8,
        title: "Танос Император",
        fullTitle: "Танос Император Бесконечности",
        category: "Танос",
        price: 4200,
        file: "Танос Император Бесконечности.jpg"
    },
    {
        id: 9,
        title: "Геймерский Энерджи",
        fullTitle: "Геймерский Энерджи Граффити на контроллере",
        category: "Live",
        price: 4200,
        file: "Геймерский Энерджи Граффити на контроллере.jpg",
        badge: "Хит"
    },
    {
        id: 10,
        title: "Ночной Волк",
        fullTitle: "Ночной Волк Мастер звуков",
        category: "Live",
        price: 4200,
        file: "Ночной Волк Мастер звуков.jpg"
    },
    {
        id: 11,
        title: "Примат Премиум",
        fullTitle: "Примат Премиум Король улицы",
        category: "Live",
        price: 4200,
        file: "Примат Премиум Король улицы.jpg"
    }
];

// Функция для получения пути к изображению
function getPaintingImagePath(painting) {
    const path = require('path');
    const fs = require('fs');
    
    if (typeof window === 'undefined') {
        // Node.js среда (bot.js) - возвращаем локальный путь для отправки через Telegram
        // Используем painting.file для поиска, так как это точное имя файла
        const fullPath = path.join(__dirname, painting.category, painting.file);
        
        if (fs.existsSync(fullPath)) {
            return fullPath;
        }
        
        // Fallback: попробовать другие расширения
        const extensions = ['.jpg', '.png', '.jpeg'];
        for (const ext of extensions) {
            const altPath = path.join(__dirname, painting.category, `${painting.title}${ext}`);
            if (fs.existsSync(altPath)) {
                return altPath;
            }
        }
        
        // Fallback на логотип
        return path.join(__dirname, 'ЛОГОТИП', 'Logo.png');
    } else {
        // Browser среда (script.js) - возвращаем URL
        return `${painting.category}/${painting.file}`;
    }
}

// Функция для поиска картины по ID
function findPaintingById(id) {
    return paintings.find(p => p.id === id);
}

// Функция для поиска картины по названию
function findPaintingByTitle(title) {
    return paintings.find(p => p.title === title || p.fullTitle === title);
}

// Экспорт для Node.js
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        paintings,
        getPaintingImagePath,
        findPaintingById,
        findPaintingByTitle
    };
}