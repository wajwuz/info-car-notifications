require('dotenv').config();
const express = require('express');
const fetch = require('node-fetch');
const Push = require('pushover-notifications');
const path = require('path');
const cron = require('node-cron');

const app = express();
const port = process.env.PORT || 3000;

const push = new Push({
    user: process.env.PUSHOVER_USER,
    token: process.env.PUSHOVER_TOKEN
});

push.send({
    message: 'Aplikacja została uruchomiona i system powiadomień działa poprawnie!',
    title: 'Test Powiadomień',
    priority: 1,
    sound: 'magic'
}, function(err, result) {
    if (err) {
        console.error(err);
    } else {
        console.log('Powiadomienie testowe wysłane pomyślnie!');
    }
});

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static('public'));

let lastKnownStatus = null;
let cachedStatus = null;
let lastCheckTime = null;

async function checkStatus() {
    try {
        const response = await fetch("https://info-car.pl/api/ssi/status/driver/driver-licence", {
            body: JSON.stringify({
                name: process.env.NAME,
                surname: process.env.SURNAME,
                pesel: process.env.PESEL
            }),
            headers: {
                "Content-Type": "application/json",
            },
            method: "POST",
            mode: "cors",
            redirect: "follow",
            referrer: "https://info-car.pl/new/prawo-jazdy/sprawdz-status-prawa-jazdy",
            referrerPolicy: "strict-origin-when-cross-origin"
        });

        const data = await response.json();
        
        if (lastKnownStatus && data.statusHistory && data.statusHistory.length > 0) {
            const currentStatus = [...data.statusHistory].reverse()[0];
            const previousStatus = [...lastKnownStatus.statusHistory].reverse()[0];
            
            if (currentStatus.value !== previousStatus.value) {
                push.send({
                    message: `Nowy status: ${currentStatus.value}\n${currentStatus.description}`,
                    title: 'Aktualizacja Statusu Prawa Jazdy',
                    priority: 1,
                    sound: 'magic'
                });
            }
        } else if (data.statusHistory && data.statusHistory.length > 0) {
            const currentStatus = [...data.statusHistory].reverse()[0];
            push.send({
                message: `Aktualny status: ${currentStatus.value}\n${currentStatus.description}`,
                title: 'Status Prawa Jazdy',
                priority: 1,
                sound: 'magic'
            });
        }
        
        lastKnownStatus = data;
        cachedStatus = data;
        lastCheckTime = new Date();
        return data;
    } catch (err) {
        console.error(err);
        return null;
    }
}

cron.schedule('0 0,6,12,18 * * *', () => {
    checkStatus();
});

checkStatus();

app.get('/', async (req, res) => {
    try {
        if (cachedStatus && lastCheckTime) {
            const now = new Date();
            const hoursSinceLastCheck = (now - lastCheckTime) / (1000 * 60 * 60);
            
            if (hoursSinceLastCheck < 6) {
                return res.render('index', { 
                    status: { statusHistory: cachedStatus?.statusHistory || [] }, 
                    error: null 
                });
            }
        }
        
        const data = await checkStatus();
        const safeData = {
            statusHistory: data?.statusHistory || [],
        };
        res.render('index', { status: safeData, error: null });
    } catch (err) {
        console.error(err);
        res.render('index', { 
            status: { statusHistory: [] }, 
            error: 'Nie udało się pobrać statusu' 
        });
    }
});

app.listen(port, () => {
    console.log(`Serwer uruchomiony na http://localhost:${port}`);
});