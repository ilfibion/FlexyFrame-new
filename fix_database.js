const sqlite3 = require('sqlite3').verbose();

const db = new sqlite3.Database('./flexyframe.db', (err) => {
    if (err) {
        console.error('Ошибка подключения к БД:', err);
        return;
    }
    console.log('✅ База данных подключена');
});

// Добавляем колонку token, если её нет
db.run(`ALTER TABLE orders ADD COLUMN token TEXT`, (err) => {
    if (err && err.code !== 'SQLITE_ERROR') {
        console.error('Ошибка при добавлении колонки:', err);
    } else {
        console.log('✅ Колонка token добавлена (или уже существовала)');
    }
    
    // Проверяем структуру таблицы
    db.all(`PRAGMA table_info(orders)`, (err, rows) => {
        if (err) {
            console.error('Ошибка:', err);
        } else {
            console.log('\n📊 Структура таблицы orders:');
            rows.forEach(row => {
                console.log(`  ${row.name} (${row.type})${row.pk ? ' [PRIMARY KEY]' : ''}`);
            });
        }
        
        db.close();
        console.log('\n✅ База данных исправлена');
        process.exit(0);
    });
});