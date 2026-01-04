const TelegramBot = require('node-telegram-bot-api');
const sqlite3 = require('sqlite3').verbose();
const axios = require('axios');
const express = require('express');
const crypto = require('crypto');
require('dotenv').config();

// === КОНФИГУРАЦИЯ ===
const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const YOOKASSA_SHOP_ID = process.env.YOOKASSA_SHOP_ID || 'your_shop_id';
const YOOKASSA_SECRET_KEY = process.env.YOOKASSA_SECRET_KEY || 'your_secret_key';
const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID || 'your_admin_id';
const SITE_URL = process.env.SITE_URL || 'http://127.0.0.1:8080';
const PORT = process.env.PORT || 3000;

// Валидация токена
if (!TOKEN || TOKEN === 'your_token_here') {
    console.error('❌ Ошибка: TELEGRAM_BOT_TOKEN не установлен в .env');
    console.error('Пожалуйста, создайте .env файл с правильным токеном');
    process.exit(1);
}

// === ИНИЦИАЛИЗАЦИЯ БОТА ===
const bot = new TelegramBot(TOKEN, { polling: true });
const app = express();

// === ИМПОРТ ЦЕНТРАЛИЗОВАННЫХ ДАННЫХ ===
const { paintings, getPaintingImagePath, findPaintingById, findPaintingByTitle } = require('./data.js');

// === БАЗА ДАННЫХ ===
const db = new sqlite3.Database('./flexyframe.db', (err) => {
    if (err) {
        console.error('Ошибка подключения к БД:', err);
    } else {
        console.log('✅ База данных подключена');
        initDB();
    }
});

function initDB() {
    db.serialize(() => {
        // Таблица заказов
        db.run(`CREATE TABLE IF NOT EXISTS orders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            user_name TEXT,
            painting_id INTEGER,
            painting_title TEXT,
            price INTEGER,
            status TEXT DEFAULT 'new',
            payment_id TEXT,
            token TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);
        
        // Таблица пользователей
        db.run(`CREATE TABLE IF NOT EXISTS users (
            user_id INTEGER PRIMARY KEY,
            username TEXT,
            first_name TEXT,
            last_name TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);
    });
}

// === СЦЕНАРИИ БОТА ===
const userStates = {}; // Храним состояния пользователей

// === СТАРТ БОТА ===
bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    const firstName = msg.chat.first_name;
    const username = msg.chat.username;
    const messageId = msg.message_id;
    
    // Сохраняем пользователя в БД
    db.run(`INSERT OR REPLACE INTO users (user_id, username, first_name, last_name) VALUES (?, ?, ?, ?)`,
        [chatId, username, firstName, msg.chat.last_name]);
    
    // Проверяем, есть ли стартовый параметр (из MiniApp)
    const startParam = msg.text.split(' ')[1];
    
    // Удаляем сообщение /start чтобы пользователь его не видел
    bot.deleteMessage(chatId, messageId).catch(() => {});
    
    if (startParam && startParam.includes('_')) {
        // Это заказ из MiniApp: order_1 или 1_5000
        handleMiniAppOrder(chatId, startParam);
        return;
    }
    
    // Обычный старт
    let greeting = `👋 <b>Добро пожаловать в FlexyFrame, ${firstName}!</b>\n\n`;
    greeting += `🎨 <b>FlexyFrame — где искусство оживает в каждом штрихе</b>\n\n`;
    greeting += `Мы создаём уникальные арт-объекты, которые становятся центром вашего интерьера и отражением вашего вкуса.\n\n`;
    greeting += `✨ Наши преимущества:\n`;
    greeting += `• Печать на премиальном холсте\n`;
    greeting += `• Идеальный формат 60×50 см\n`;
    greeting += `• Ручная роспись по запросу\n`;
    greeting += `• Авторские рамы из натуральной сосны\n\n`;
    
    greeting += `🎯 <b>Выберите действие:</b>\n`;
    greeting += `• 🎨 Выбрать картину\n`;
    greeting += `• 🛒 Открыть MiniApp\n`;
    greeting += `• 📋 Как заказать\n`;
    greeting += `• 💬 О проекте\n`;
    greeting += `• 🛒 Мои заказы\n\n`;
    
    greeting += `💡 <i>Или перейдите на сайт для удобного выбора:</i>\n`;
    greeting += `🔗 ${SITE_URL}/index.html`;
    
    const keyboard = {
        keyboard: [
            [{ text: '🎨 Выбрать картину' }],
            [{ text: '🛒 Открыть MiniApp' }],
            [{ text: '📋 Как заказать' }, { text: '💬 О проекте' }],
            [{ text: '🛒 Мои заказы' }]
        ],
        resize_keyboard: true
    };
    
    bot.sendMessage(chatId, greeting, {
        parse_mode: 'HTML',
        reply_markup: keyboard
    });
});

// === ОБРАБОТКА ЗАКАЗА ИЗ MINIAPP ===
function handleMiniAppOrder(chatId, param) {
    // Параметр может быть вида: "order_1_token" или "1_5000"
    let paintingId;
    let token = null;
    
    if (param.startsWith('order_')) {
        // Формат: order_1_token или order_1
        const parts = param.split('_');
        if (parts.length >= 2) {
            paintingId = parseInt(parts[1]);
            if (parts.length >= 3) {
                token = parts[2];
            }
        }
    } else {
        // Старый формат: 1_5000
        paintingId = parseInt(param.split('_')[0]);
    }
    
    // Валидация картины
    const painting = findPaintingById(paintingId);
    if (!painting) {
        bot.sendMessage(chatId, 
            `❌ <b>Картина не найдена!</b>\n\n` +
            `Возможно, она была удалена или ссылка устарела.\n` +
            `Пожалуйста, выберите другую картину на сайте.`,
            { parse_mode: 'HTML' }
        );
        showMainMenu(chatId);
        return;
    }
    
    // Проверяем, не создан ли уже заказ с таким токеном
    if (token) {
        db.get(`SELECT id FROM orders WHERE token = ?`, [token], (err, existingOrder) => {
            if (err) {
                console.error('Ошибка проверки токена:', err);
                bot.sendMessage(chatId, '❌ Произошла ошибка при проверке заказа.');
                return;
            }
            
            if (existingOrder) {
                // Показываем информацию о существующем заказе
                const paymentLink = generatePaymentLink(existingOrder.id, painting.title, painting.price);
                const message = 
                    `📋 <b>Ваш заказ #${existingOrder.id}</b>\n\n` +
                    `🎨 Картина: <b>${painting.title}</b>\n` +
                    `💰 Сумма: <b>${painting.price}₽</b>\n` +
                    `📦 Срок выполнения: 2-4 дня\n` +
                    `📊 Статус: ${existingOrder.status === 'new' ? '⏳ Ожидает оплаты' : existingOrder.status === 'paid' ? '✅ Оплачен' : existingOrder.status}\n\n` +
                    `💳 <b>Для оплаты нажмите кнопку ниже:</b>\n` +
                    `• Откроется страница оплаты\n` +
                    `• Заполните данные карты\n` +
                    `• В комментарии уже указан ваш заказ\n\n` +
                    `⚠️ <b>Важно!</b> После оплаты вернитесь в бот и нажмите "✅ Оплатил(а)".\n` +
                    `📦 Мы начнем работу сразу после подтверждения.\n\n` +
                    `📞 По всем вопросам: @flexyframe_bot_admin\n` +
                    `🔑 Ваш токен: <code>${token}</code>`;
                
                const keyboard = {
                    inline_keyboard: [
                        [{ text: '💳 Оплатить онлайн', url: paymentLink }],
                        [{ text: '✅ Оплатил(а)', callback_data: `paid_${existingOrder.id}` }],
                        [{ text: '📋 Мои заказы', callback_data: 'my_orders' }]
                    ]
                };
                
                // Получаем путь к изображению
                const imagePath = getPaintingImagePath(painting);
                
                // Пытаемся отправить фото, если не получается - отправляем текст
                bot.sendPhoto(chatId, imagePath, { caption: message, parse_mode: 'HTML', reply_markup: keyboard })
                    .catch(err => {
                        console.log('Не удалось отправить фото:', err.message);
                        bot.sendMessage(chatId, message, {
                            parse_mode: 'HTML',
                            reply_markup: keyboard
                        });
                    });
                
                return;
            }
            
            // Создаем новый заказ с токеном
            createOrderFromMiniApp(chatId, painting, token);
        });
    } else {
        // Старый формат без токена - создаем заказ
        createOrderFromMiniApp(chatId, painting, null);
    }
}

// === СОЗДАНИЕ ЗАКАЗА ИЗ MINIAPP ===
function createOrderFromMiniApp(chatId, painting, token) {
    // Генерируем токен если не передан
    const orderToken = token || crypto.randomBytes(8).toString('hex');
    
    db.run(
        `INSERT INTO orders (user_id, painting_id, painting_title, price, status, token) VALUES (?, ?, ?, ?, 'new', ?)`,
        [chatId, painting.id, painting.title, painting.price, orderToken],
        function(err) {
            if (err) {
                console.error('Ошибка создания заказа:', err);
                bot.sendMessage(chatId, '❌ Произошла ошибка при создании заказа. Попробуйте позже.');
                return;
            }
            
            const orderId = this.lastID;
            
            // Генерируем уникальную ссылку на оплату
            const paymentLink = generatePaymentLink(orderId, painting.title, painting.price);
            
            // Получаем путь к изображению
            const imagePath = getPaintingImagePath(painting);
            
            // Формируем сообщение с заказом и кнопкой оплаты
            const message = 
                `✅ <b>Заказ #${orderId} создан!</b>\n\n` +
                `🎨 Картина: <b>${painting.title}</b>\n` +
                `💰 Сумма: <b>${painting.price}₽</b>\n` +
                `📦 Срок выполнения: 2-4 дня\n\n` +
                `💳 <b>Для оплаты нажмите кнопку ниже:</b>\n` +
                `• Откроется страница оплаты\n` +
                `• Заполните данные карты\n` +
                `• В комментарии уже указан ваш заказ\n\n` +
                `⚠️ <b>Важно!</b> После оплаты вернитесь в бот и нажмите "✅ Оплатил(а)".\n` +
                `📦 Мы начнем работу сразу после подтверждения.\n\n` +
                `📞 По всем вопросам: @flexyframe_bot_admin\n` +
                `🔑 Ваш токен: <code>${orderToken}</code>`;
            
            const keyboard = {
                inline_keyboard: [
                    [{ text: '💳 Оплатить онлайн', url: paymentLink }],
                    [{ text: '✅ Оплатил(а)', callback_data: `paid_${orderId}` }],
                    [{ text: '📋 Мои заказы', callback_data: 'my_orders' }]
                ]
            };
            
            // Пытаемся отправить фото, если не получается - отправляем текст
            console.log('Попытка отправить фото:', imagePath);
            bot.sendPhoto(chatId, imagePath, { caption: message, parse_mode: 'HTML', reply_markup: keyboard })
                .then(() => {
                    console.log('✅ Фото успешно отправлено для заказа #', orderId);
                })
                .catch(err => {
                    console.log('❌ Ошибка отправки фото:', err.message);
                    console.log('Отправляем текстовое сообщение вместо фото');
                    bot.sendMessage(chatId, message, {
                        parse_mode: 'HTML',
                        reply_markup: keyboard
                    });
                });
            
            // Уведомляем администратора (безопасно)
            if (ADMIN_CHAT_ID && ADMIN_CHAT_ID !== 'your_admin_id') {
                bot.sendMessage(ADMIN_CHAT_ID,
                    `🔔 <b>Новый заказ #${orderId} (MiniApp)</b>\n\n` +
                    `👤 Пользователь: ${chatId}\n` +
                    `🎨 Картина: ${painting.title}\n` +
                    `💰 Сумма: ${painting.price}₽\n` +
                    `📊 Статус: Ожидает оплаты\n` +
                    `🔗 Ссылка: ${paymentLink}\n` +
                    `🔑 Токен: ${orderToken}`,
                    { parse_mode: 'HTML' }
                ).catch(err => {
                    console.log('⚠️ Не удалось отправить уведомление администратору:', err.message);
                });
            } else {
                console.log('ℹ️ Администратор не указан, уведомление не отправлено');
            }
        }
    );
}

// === ГЛАВНОЕ МЕНЮ ===
function showMainMenu(chatId) {
    const keyboard = {
        keyboard: [
            [{ text: '🎨 Выбрать картину' }],
            [{ text: '🛒 Открыть MiniApp' }],
            [{ text: '📋 Как заказать' }, { text: '💬 О проекте' }],
            [{ text: '🛒 Мои заказы' }]
        ],
        resize_keyboard: true
    };
    
    bot.sendMessage(chatId, 'Чем могу помочь?', {
        reply_markup: keyboard
    });
}

// === ОБРАБОТКА КНОПОК ===
bot.on('message', (msg) => {
    if (msg.text === '🎨 Выбрать картину') {
        showPaintingsMenu(msg.chat.id);
    } else if (msg.text === '🛒 Открыть MiniApp') {
        showMiniAppLink(msg.chat.id);
    } else if (msg.text === '📋 Как заказать') {
        showHowItWorks(msg.chat.id);
    } else if (msg.text === '💬 О проекте') {
        showAbout(msg.chat.id);
    } else if (msg.text === '🛒 Мои заказы') {
        showMyOrders(msg.chat.id);
    }
});

// === ПОКАЗАТЬ ССЫЛКУ НА MINIAPP ===
function showMiniAppLink(chatId) {
    const message = 
        `📱 <b>Сайт FlexyFrame</b>\n\n` +
        `Откройте сайт для удобного выбора картин:\n\n` +
        `🔗 <b>${SITE_URL}/index.html</b>\n\n` +
        `💡 <i>Как открыть в Telegram:</i>\n` +
        `1. Скопируйте ссылку\n` +
        `2. Вставьте в поиске Telegram\n` +
        `3. Или откройте в браузере\n\n` +
        `✅ На сайте можно:\n` +
        `• Выбрать картину\n` +
        `• Увидеть цену\n` +
        `• Нажать "Оформить заказ"\n` +
        `• Автоматически перейти в бота`;
    
    const keyboard = {
        inline_keyboard: [
            [{ text: '🌐 Открыть сайт', url: `${SITE_URL}/index.html` }]
        ]
    };
    
    bot.sendMessage(chatId, message, {
        parse_mode: 'HTML',
        reply_markup: keyboard
    });
}

// === ПОКАЗАТЬ КАРТИНЫ ===
function showPaintingsMenu(chatId) {
    const keyboard = paintings.map(p => [{
        text: `${p.title} - ${p.price}₽`
    }]);
    
    keyboard.push([{ text: '🔙 Назад' }]);
    
    bot.sendMessage(chatId, '🎨 Выберите картину для заказа:', {
        reply_markup: { keyboard, resize_keyboard: true }
    });
}

// === ОБРАБОТКА ВЫБОРА КАРТИНЫ ===
bot.on('message', (msg) => {
    const text = msg.text;
    const chatId = msg.chat.id;
    
    // Проверяем, выбрал ли пользователь картину
    const painting = paintings.find(p => text.includes(p.title));
    
    if (painting) {
        userStates[chatId] = { paintingId: painting.id, paintingTitle: painting.title, price: painting.price };
        
        const keyboard = {
            keyboard: [
                [{ text: '💳 Оформить заказ' }],
                [{ text: '🎨 Выбрать другую' }]
            ],
            resize_keyboard: true
        };
        
        // Формируем сообщение с информацией о картине
        const message = 
            `🎨 <b>${painting.title}</b>\n` +
            `💰 Цена: <b>${painting.price}₽</b>\n` +
            `📦 Срок: 2-4 дня\n\n` +
            `Эта картина создается индивидуально под ваш заказ.`;
        
        // Получаем путь к изображению
        const imagePath = getPaintingImagePath(painting);
        
        // Пытаемся отправить фото с описанием, если не получается - отправляем текст
        bot.sendPhoto(chatId, imagePath, { caption: message, parse_mode: 'HTML', reply_markup: keyboard })
            .catch(err => {
                console.log('Не удалось отправить фото картины:', err.message);
                bot.sendMessage(chatId, message, {
                    parse_mode: 'HTML',
                    reply_markup: keyboard
                });
            });
    }
    
    // Оформление заказа
    if (text === '💳 Оформить заказ' && userStates[chatId]) {
        createOrder(chatId, userStates[chatId]);
    }
    
    if (text === '🎨 Выбрать другую') {
        showPaintingsMenu(chatId);
        delete userStates[chatId];
    }
    
    if (text === '🔙 Назад') {
        const firstName = msg.chat.first_name;
        const keyboard = {
            keyboard: [
                [{ text: '🎨 Выбрать картину' }],
                [{ text: '🛒 Открыть MiniApp' }],
                [{ text: '📋 Как заказать' }, { text: '💬 О проекте' }],
                [{ text: '🛒 Мои заказы' }]
            ],
            resize_keyboard: true
        };
        
        bot.sendMessage(chatId, `👋 ${firstName}, чем могу помочь?`, {
            reply_markup: keyboard
        });
        
        delete userStates[chatId];
    }
});

// === СОЗДАНИЕ ЗАКАЗА ===
function createOrder(chatId, state) {
    const { paintingId, paintingTitle, price } = state;
    
    // Находим картину для получения категории
    const painting = findPaintingById(paintingId);
    if (!painting) {
        bot.sendMessage(chatId, '❌ Ошибка: картина не найдена.');
        return;
    }
    
    // Генерируем токен
    const token = crypto.randomBytes(8).toString('hex');
    
    // Сохраняем заказ в БД
    db.run(
        `INSERT INTO orders (user_id, painting_id, painting_title, price, status, token) VALUES (?, ?, ?, ?, 'new', ?)`,
        [chatId, paintingId, paintingTitle, price, token],
        function(err) {
            if (err) {
                bot.sendMessage(chatId, '❌ Произошла ошибка при создании заказа. Попробуйте позже.');
                console.error(err);
                return;
            }
            
            const orderId = this.lastID;
            
            // Генерируем уникальную ссылку на оплату
            const paymentLink = generatePaymentLink(orderId, paintingTitle, price);
            
            // Получаем путь к изображению
            const imagePath = getPaintingImagePath(painting);
            
            // Формируем сообщение для пользователя
            const message = 
                `✅ <b>Заказ #${orderId} создан!</b>\n\n` +
                `🎨 Картина: <b>${paintingTitle}</b>\n` +
                `💰 Сумма: <b>${price}₽</b>\n` +
                `📦 Срок выполнения: 2-4 дня\n\n` +
                `💳 <b>Для оплаты нажмите кнопку ниже:</b>\n` +
                `• Откроется страница оплаты\n` +
                `• Заполните данные карты\n` +
                `• В комментарии уже указан ваш заказ\n\n` +
                `⚠️ <b>Важно!</b> После оплаты вернитесь в бот и нажмите "✅ Оплатил(а)".\n` +
                `📦 Мы начнем работу сразу после подтверждения.\n\n` +
                `📞 По всем вопросам: @flexyframe_bot_admin\n` +
                `🔑 Ваш токен: <code>${token}</code>`;
            
            const keyboard = {
                inline_keyboard: [
                    [{ text: '💳 Оплатить онлайн', url: paymentLink }],
                    [{ text: '✅ Оплатил(а)', callback_data: `paid_${orderId}` }],
                    [{ text: '📋 Мои заказы', callback_data: 'my_orders' }]
                ]
            };
            
            // Пытаемся отправить фото, если не получается - отправляем текст
            bot.sendPhoto(chatId, imagePath, { caption: message, parse_mode: 'HTML', reply_markup: keyboard })
                .catch(err => {
                    console.log('Не удалось отправить фото:', err.message);
                    bot.sendMessage(chatId, message, { 
                        parse_mode: 'HTML',
                        reply_markup: keyboard 
                    });
                });
            
            // Уведомляем администратора (безопасно)
            if (ADMIN_CHAT_ID && ADMIN_CHAT_ID !== 'your_admin_id') {
                bot.sendMessage(ADMIN_CHAT_ID,
                    `🔔 <b>Новый заказ #${orderId}</b>\n\n` +
                    `👤 Пользователь: ${chatId}\n` +
                    `🎨 Картина: ${paintingTitle}\n` +
                    `💰 Сумма: ${price}₽\n` +
                    `📊 Статус: Ожидает оплаты\n` +
                    `🔗 Ссылка: ${paymentLink}\n` +
                    `🔑 Токен: ${token}`,
                    { parse_mode: 'HTML' }
                ).catch(err => {
                    console.log('⚠️ Не удалось отправить уведомление администратору:', err.message);
                });
            } else {
                console.log('ℹ️ Администратор не указан, уведомление не отправлено');
            }
            
            // Очищаем состояние
            delete userStates[chatId];
        }
    );
}

// === API ENDPOINTS ДЛЯ СИНХРОНИЗАЦИИ ===

// Получение статуса заказа
app.get('/api/order/:id/status', (req, res) => {
    const orderId = req.params.id;
    db.get('SELECT status FROM orders WHERE id = ?', [orderId], (err, row) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        if (!row) {
            return res.status(404).json({ error: 'Order not found' });
        }
        res.json({ status: row.status });
    });
});

// Получение информации о заказе
app.get('/api/order/:id', (req, res) => {
    const orderId = req.params.id;
    db.get('SELECT * FROM orders WHERE id = ?', [orderId], (err, row) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        if (!row) {
            return res.status(404).json({ error: 'Order not found' });
        }
        res.json(row);
    });
});

// Создание заказа через API (для MiniApp)
app.post('/api/order/create', express.json(), (req, res) => {
    const { user_id, painting_id, painting_title, price } = req.body;
    
    if (!user_id || !painting_id || !painting_title || !price) {
        return res.status(400).json({ error: 'Missing required fields' });
    }
    
    // Проверяем существование картины
    const painting = findPaintingById(painting_id);
    if (!painting) {
        return res.status(404).json({ error: 'Painting not found' });
    }
    
    const token = crypto.randomBytes(8).toString('hex');
    
    db.run(
        `INSERT INTO orders (user_id, painting_id, painting_title, price, status, token) VALUES (?, ?, ?, ?, 'new', ?)`,
        [user_id, painting_id, painting_title, price, token],
        function(err) {
            if (err) {
                return res.status(500).json({ error: err.message });
            }
            
            const orderId = this.lastID;
            const paymentLink = generatePaymentLink(orderId, painting_title, price);
            
            res.json({
                success: true,
                order_id: orderId,
                payment_link: paymentLink,
                token: token
            });
            
            // Уведомляем администратора
            if (ADMIN_CHAT_ID) {
                bot.sendMessage(ADMIN_CHAT_ID,
                    `🔔 <b>Новый заказ #${orderId} (API)</b>\n\n` +
                    `👤 Пользователь: ${user_id}\n` +
                    `🎨 Картина: ${painting_title}\n` +
                    `💰 Сумма: ${price}₽\n` +
                    `📊 Статус: Ожидает оплаты\n` +
                    `🔗 Ссылка: ${paymentLink}\n` +
                    `🔑 Токен: ${token}`,
                    { parse_mode: 'HTML' }
                );
            }
        }
    );
});

// Обновление статуса оплаты
app.post('/api/order/:id/paid', (req, res) => {
    const orderId = req.params.id;
    
    db.run(`UPDATE orders SET status = 'paid' WHERE id = ?`, [orderId], function(err) {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        
        if (this.changes === 0) {
            return res.status(404).json({ error: 'Order not found' });
        }
        
        res.json({ success: true, message: 'Order marked as paid' });
        
        // Уведомляем администратора
        if (ADMIN_CHAT_ID) {
            db.get('SELECT * FROM orders WHERE id = ?', [orderId], (err, order) => {
                if (order) {
                    bot.sendMessage(ADMIN_CHAT_ID,
                        `💰 <b>Оплата подтверждена через API!</b>\n\n` +
                        `Заказ #${orderId}\n` +
                        `👤 Пользователь: ${order.user_id}\n` +
                        `🎨 ${order.painting_title}\n` +
                        `💰 ${order.price}₽`,
                        { parse_mode: 'HTML' }
                    );
                }
            });
        }
    });
});

// Получение списка картин (для сайта)
app.get('/api/paintings', (req, res) => {
    res.json(paintings);
});

// Проверка доступности бота
app.get('/api/bot-status', (req, res) => {
    res.json({ 
        online: true, 
        bot_username: '@flexyframe_bot',
        miniapp_url: `${SITE_URL}/index.html`
    });
});

// === ГЕНЕРАЦИЯ ССЫЛКИ НА ОПЛАТУ ===
function generatePaymentLink(orderId, paintingTitle, price) {
    // Используем нашу страницу оплаты
    // Убедимся, что SITE_URL не заканчивается на слэш
    const baseUrl = SITE_URL.endsWith('/') ? SITE_URL.slice(0, -1) : SITE_URL;
    return `${baseUrl}/payment.html?order=${orderId}&title=${encodeURIComponent(paintingTitle)}&price=${price}`;
}

// === ПОКАЗАТЬ КАК ЗАКАЗАТЬ ===
function showHowItWorks(chatId) {
    const message = 
        `📋 <b>Как сделать заказ:</b>\n\n` +
        `1️⃣ <b>Выберите картину</b> из галереи\n` +
        `2️⃣ <b>Оформите заказ</b> в боте\n` +
        `3️⃣ <b>Оплатите</b> удобным способом\n` +
        `4️⃣ <b>Получите работу</b> через 2-4 дня\n\n` +
        `💳 <b>Способы оплаты:</b>\n` +
        `• ЮMoney\n` +
        `• Тинькофф\n` +
        `• Сбербанк\n\n` +
        `📦 <b>Доставка:</b>\n` +
        `• Электронная версия (PDF/JPG) - мгновенно\n` +
        `• Физическая печать - 2-4 дня + доставка\n\n` +
        `💡 <b>Сайт:</b>\n` +
        `• ${SITE_URL}/index.html\n` +
        `• Удобный выбор картин\n` +
        `• Автоматический переход в бота`;
    
    bot.sendMessage(chatId, message, { parse_mode: 'HTML' });
}

// === ПОКАЗАТЬ О ПРОЕКТЕ ===
function showAbout(chatId) {
    const message = 
        `🎨 <b>FlexyFrame — где искусство оживает в каждом штрихе</b>\n\n` +
        `Добро пожаловать в FlexyFrame — пространство, где цифровая эстетика встречается с ручной росписью, где ваши воспоминания становятся произведениями искусства, а любимые персонажи обретают новую жизнь на холсте.\n\n` +
        `Мы не просто печатаем картины — мы создаём уникальные арт-объекты, которые становятся центром вашего интерьера и отражением вашего вкуса.\n\n` +
        `✨ <b>Наши преимущества:</b>\n` +
        `🖼️ Печать на премиальном холсте — с использованием профессионального фотопринтера и архивных чернил\n` +
        `📏 Идеальный формат 60×50 см — продуманный баланс между выразительностью и элегантностью\n` +
        `🖌️ Ручная роспись по запросу — включая люминесцентные и элюминесцентные краски\n` +
        `🌲 Авторские рамы из натуральной сосны — каждая обрамляется вручную\n\n` +
        `✅ <b>У нас вы можете:</b>\n` +
        `• Заказать картину по собственному макету или идее\n` +
        `• Выбрать из авторской коллекции FlexyFrame\n` +
        `• Превратить семейную фотографию в музейный экспонат\n\n` +
        `📩 <b>Контакты:</b>\n` +
        `• Telegram: @flexyframe_bot\n` +
        `• Email: art@flexyframe.ru\n` +
        `• Instagram: @flexyframe.art\n\n` +
        `🔗 <b>Сайт:</b> ${SITE_URL}/index.html\n\n` +
        `💡 <i>FlexyFrame — это не просто картина. Это история, подсвеченная вашим вкусом.</i>`;
    
    bot.sendMessage(chatId, message, { parse_mode: 'HTML' });
}

// === ПОКАЗАТЬ МОИ ЗАКАЗЫ ===
function showMyOrders(chatId) {
    db.all(`SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC`, [chatId], (err, rows) => {
        if (err) {
            bot.sendMessage(chatId, '❌ Ошибка при загрузке заказов');
            return;
        }
        
        if (rows.length === 0) {
            bot.sendMessage(chatId, '📭 У вас пока нет заказов. Начните с выбора картины!');
            return;
        }
        
        let message = `📋 <b>Ваши заказы:</b>\n\n`;
        
        rows.forEach(order => {
            const statusEmoji = {
                'new': '⏳',
                'paid': '✅',
                'in_progress': '🎨',
                'completed': '📦',
                'cancelled': '❌'
            };
            
            message += 
                `#${order.id} - ${statusEmoji[order.status] || '⏳'} ${order.status}\n` +
                `🎨 ${order.painting_title} - ${order.price}₽\n` +
                `📅 ${order.created_at}\n\n`;
        });
        
        const keyboard = {
            keyboard: [
                [{ text: '🎨 Сделать новый заказ' }]
            ],
            resize_keyboard: true
        };
        
        bot.sendMessage(chatId, message, { parse_mode: 'HTML', reply_markup: keyboard });
    });
}

// === ОБРАБОТКА CALLBACK КНОПОК ===
bot.on('callback_query', (callbackQuery) => {
    const chatId = callbackQuery.message.chat.id;
    const data = callbackQuery.data;
    const messageId = callbackQuery.message.message_id;
    
    // Отвечаем на callback, чтобы убрать "часики"
    bot.answerCallbackQuery(callbackQuery.id);
    
    // Обработка кнопки "✅ Оплатил(а)"
    if (data.startsWith('paid_')) {
        const orderId = parseInt(data.replace('paid_', ''));
        
        db.get(`SELECT * FROM orders WHERE id = ? AND user_id = ?`, [orderId, chatId], (err, order) => {
            if (err || !order) {
                bot.sendMessage(chatId, '❌ Заказ не найден или не принадлежит вам.');
                return;
            }
            
            if (order.status === 'paid') {
                bot.sendMessage(chatId, `✅ Заказ #${orderId} уже оплачен и в работе!`);
                return;
            }
            
            // Обновляем статус
            db.run(`UPDATE orders SET status = 'paid' WHERE id = ?`, [orderId]);
            
            // Уведомляем администратора (без сообщения пользователю)
            if (ADMIN_CHAT_ID) {
                bot.sendMessage(ADMIN_CHAT_ID,
                    `💰 <b>Оплата подтверждена!</b>\n\n` +
                    `Заказ #${orderId}\n` +
                    `👤 Пользователь: ${chatId}\n` +
                    `🎨 ${order.painting_title}\n` +
                    `💰 ${order.price}₽`,
                    { parse_mode: 'HTML' }
                ).catch(() => {});
            }
        });
    }
    
    // Обработка кнопки "📋 Мои заказы"
    else if (data === 'my_orders') {
        showMyOrders(chatId);
    }
});


// === ОБСЛУЖИВАНИЕ СТАТИЧЕСКИХ ФАЙЛОВ ===
const path = require('path');

// Разрешаем доступ к статическим файлам
app.use(express.static(path.join(__dirname)));

// Маршрут для всех запросов отдает index.html
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// === ВЕБХУК ДЛЯ ПЛАТЕЖЕЙ (опционально) ===
app.use(express.json());

app.post('/webhook/payment', (req, res) => {
    const { event, object } = req.body;
    
    if (event === 'payment.succeeded') {
        const orderId = object.description?.match(/Заказ #(\d+)/)?.[1];
        if (orderId) {
            db.run(`UPDATE orders SET status = 'paid', payment_id = ? WHERE id = ?`, 
                [object.id, orderId]);
        }
    }
    
    res.status(200).send('OK');
});

// Запуск сервера на порту 8080 для статических файлов и порту 3000 для вебхука
app.listen(8080, () => {
    console.log('🌐 Веб-сервер запущен на порту 8080');
    console.log('🔗 Доступно: http://127.0.0.1:8080');
});

// Отдельный сервер для вебхука (если нужно)
const webhookApp = express();
webhookApp.use(express.json());
webhookApp.post('/webhook/payment', (req, res) => {
    const { event, object } = req.body;
    
    if (event === 'payment.succeeded') {
        const orderId = object.description?.match(/Заказ #(\d+)/)?.[1];
        if (orderId) {
            db.run(`UPDATE orders SET status = 'paid', payment_id = ? WHERE id = ?`, 
                [object.id, orderId]);
        }
    }
    
    res.status(200).send('OK');
});

webhookApp.listen(3000, () => {
    console.log('🌐 Вебхук сервер запущен на порту 3000');
});

// === ОБРАБОТКА ОШИБОК ===
bot.on('polling_error', (error) => {
    console.error('Ошибка поллинга:', error);
});

// === ЗАПУСК БОТА ===
console.log('🚀 FlexyFrame Bot запущен!');
console.log('📱 Бот: @flexyframe_bot');
console.log('🔑 Токен:', TOKEN.substring(0, 10) + '...');
console.log('🌐 Сайт:', `${SITE_URL}/index.html`);