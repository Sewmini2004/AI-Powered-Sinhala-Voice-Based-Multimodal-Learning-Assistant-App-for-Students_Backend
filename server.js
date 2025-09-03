const express = require('express');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const { spawn } = require('child_process');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const port = 3000;

// Multer setup to handle file uploads
const upload = multer({ dest: 'uploads/' });

app.use(express.json());

const dbConfig = {
    host: 'localhost',
    user: 'root',
    password: '1234',
    database: 'sinhala_voice_app'
};

let pool;
async function connectToDatabase() {
    try {
        pool = mysql.createPool(dbConfig);
        console.log('✅ Database connected successfully!');
    } catch (error) {
        console.error('❌ Database connection failed:', error);
        process.exit(1);
    }
}

connectToDatabase();

// --- API Endpoints ---

// Login API Endpoint
app.post('/login', async (req, res) => {
    const { email, password } = req.body;
    console.log(`➡️ Received login request for email: ${email}`);
    try {
        const [rows] = await pool.execute(
            'SELECT id, password FROM users WHERE email = ?',
            [email]
        );
        if (rows.length === 0) {
            return res.status(401).send({ message: 'Invalid email or password.' });
        }
        const isMatch = await bcrypt.compare(password, rows[0].password);
        if (!isMatch) {
            return res.status(401).send({ message: 'Invalid email or password.' });
        }
        console.log(`✅ Login successful for email: ${email}`);
        res.status(200).send({ message: 'Login successful!', userId: rows[0].id });
    } catch (error) {
        console.error('❌ Login Error:', error);
        res.status(500).send({ message: 'Something went wrong.' });
    }
});

// Signup API Endpoint
app.post('/signup', async (req, res) => {
    const { email, password } = req.body;
    console.log(`➡️ Received signup request for email: ${email}`);
    if (!email || !password) {
        return res.status(400).send({ message: 'Email and password are required.' });
    }
    try {
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);
        await pool.execute(
            'INSERT INTO users (email, password) VALUES (?, ?)',
            [email, hashedPassword]
        );
        console.log(`✅ User created successfully in DB for email: ${email}`);
        res.status(201).send({ message: 'User created successfully!' });
    } catch (error) {
        console.error('❌ Signup Error:', error);
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).send({ message: 'This email is already registered.' });
        }
        res.status(500).send({ message: 'Something went wrong.' });
    }
});

// --- NEW API Endpoints for Voice App ---

// API to handle audio transcription
app.post('/transcribe', upload.single('audioFile'), (req, res) => {
    if (!req.file) {
        console.error('❌ No audio file uploaded.');
        return res.status(400).send({ status: 'error', message: 'No audio file uploaded.' });
    }

    const audioFilePath = req.file.path;
    const pythonScriptPath = path.join(__dirname, 'transcribe.py');

    if (!fs.existsSync(pythonScriptPath)) {
        console.error('❌ Python script not found at:', pythonScriptPath);
        // Clean up the uploaded audio file before returning
        fs.unlink(audioFilePath, (err) => {
            if (err) console.error('Error deleting temp file:', err);
        });
        return res.status(500).send({ status: 'error', message: 'Python transcription script not found.' });
    }

    // Spawn a new Python process
    const pythonProcess = spawn('python', [pythonScriptPath, audioFilePath]);

    let dataString = '';
    let errorString = '';

    pythonProcess.stdout.on('data', (data) => {
        dataString += data.toString();
    });

    pythonProcess.stderr.on('data', (data) => {
        errorString += data.toString();
    });

    pythonProcess.on('close', (code) => {
        // Clean up the uploaded audio file
        fs.unlink(audioFilePath, (err) => {
            if (err) console.error('Error deleting temp file:', err);
        });

        if (code !== 0) {
            console.error(`❌ Python script exited with code ${code}`);
            console.error('Python Stderr:', errorString);
            return res.status(500).send({ status: 'error', message: 'Transcription failed.', details: errorString });
        }

        try {
            const cleanedData = dataString.trim();
            const result = JSON.parse(cleanedData);
            if (result.status === 'success' && result.text) {
                console.log('✅ Transcription successful:', result.text);
                res.send(result);
            } else {
                console.error('❌ Python output is not in the expected format:', result);
                res.status(500).send({ status: 'error', message: 'Invalid transcription result format.' });
            }
        } catch (e) {
            console.error('❌ Failed to parse Python output:', e);
            console.error('Raw Python output:', dataString);
            res.status(500).send({ status: 'error', message: 'Failed to parse transcription result.' });
        }
    });
});

// API to save a transcribed note to the database
app.post('/saveNote', async (req, res) => {
    const { userId, note } = req.body;

    if (!userId || !note) {
        return res.status(400).send({ status: 'error', message: 'User ID and note content are required.' });
    }

    try {
        const notesDir = path.join(__dirname, 'saved_notes');
        if (!fs.existsSync(notesDir)) {
            fs.mkdirSync(notesDir);
        }

        const fileName = `note-${Date.now()}.txt`;
        const filePath = path.join(notesDir, fileName);
        fs.writeFileSync(filePath, note, 'utf8');
        console.log(`✅ Note saved to local file: ${filePath}`);
        const [result] = await pool.execute(
            'INSERT INTO documents (user_id, type, content, file_path) VALUES (?, ?, ?, ?)',
            [userId, 'speech_to_text', note, filePath]
        );
        res.status(201).send({ status: 'success', message: 'Note saved successfully!', documentId: result.insertId });
    } catch (error) {
        console.error('❌ Failed to save note:', error);
        res.status(500).send({ status: 'error', message: 'Failed to save note.' });
    }
});

app.listen(port, () => {
    console.log(`✅ Backend server listening at http://192.168.1.191:${port}`);
});