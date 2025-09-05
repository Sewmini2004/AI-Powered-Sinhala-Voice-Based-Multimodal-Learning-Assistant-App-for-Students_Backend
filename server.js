const express = require('express');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const { spawn } = require('child_process');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const port = 3000;

const upload = multer({ dest: 'uploads/' });

app.use(express.json());

// Serve static files from the root and saved_notes directory
app.use(express.static(__dirname));
app.use('/saved_notes', express.static(path.join(__dirname, 'saved_notes')));

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

app.post('/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        const [rows] = await pool.execute('SELECT id, password FROM users WHERE email = ?', [email]);
        if (rows.length === 0) {
            return res.status(401).send({ message: 'Invalid email or password.' });
        }
        const isMatch = await bcrypt.compare(password, rows[0].password);
        if (!isMatch) {
            return res.status(401).send({ message: 'Invalid email or password.' });
        }
        res.status(200).send({ message: 'Login successful!', userId: rows[0].id });
    } catch (error) {
        console.error('❌ Login Error:', error);
        res.status(500).send({ message: 'Something went wrong.' });
    }
});

app.post('/signup', async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
        return res.status(400).send({ message: 'Email and password are required.' });
    }
    try {
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);
        await pool.execute('INSERT INTO users (email, password) VALUES (?, ?)', [email, hashedPassword]);
        res.status(201).send({ message: 'User created successfully!' });
    } catch (error) {
        console.error('❌ Signup Error:', error);
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).send({ message: 'This email is already registered.' });
        }
        res.status(500).send({ message: 'Something went wrong.' });
    }
});

app.post('/ocr', upload.single('imageFile'), (req, res) => {
    if (!req.file) {
        return res.status(400).send({ status: 'error', message: 'No image file uploaded.' });
    }

    const imageFilePath = req.file.path;
    const pythonScriptPath = path.join(__dirname, 'ocr.py');

    if (!fs.existsSync(pythonScriptPath)) {
        fs.unlink(imageFilePath, (err) => {
            if (err) console.error('Error deleting temp file:', err);
        });
        return res.status(500).send({ status: 'error', message: 'Python OCR script not found.' });
    }

    const pythonProcess = spawn('python', [pythonScriptPath, imageFilePath]);
    let dataString = '';
    let errorString = '';

    pythonProcess.stdout.on('data', (data) => {
        dataString += data.toString();
    });

    pythonProcess.stderr.on('data', (data) => {
        errorString += data.toString();
    });

    pythonProcess.on('close', (code) => {
        fs.unlink(imageFilePath, (err) => {
            if (err) console.error('Error deleting temp file:', err);
        });
        if (code !== 0) {
            console.error(`❌ Python script exited with code ${code}`);
            console.error('Python Stderr:', errorString);
            return res.status(500).send({ status: 'error', message: 'OCR failed.', details: errorString });
        }
        try {
            const cleanedData = dataString.trim();
            const result = JSON.parse(cleanedData);
            if (result.status === 'success' && result.text) {
                console.log('✅ OCR successful:', result.text);
                res.send(result);
            } else {
                console.error('❌ Python output is not in the expected format:', result);
                res.status(500).send({ status: 'error', message: 'Invalid OCR result format.' });
            }
        } catch (e) {
            console.error('❌ Failed to parse Python output:', e);
            console.error('Raw Python output:', dataString);
            res.status(500).send({ status: 'error', message: 'Failed to parse OCR result.' });
        }
    });
});

app.post('/transcribe', upload.single('audioFile'), (req, res) => {
    if (!req.file) {
        return res.status(400).send({ status: 'error', message: 'No audio file uploaded.' });
    }
    const audioFilePath = req.file.path;
    const pythonScriptPath = path.join(__dirname, 'transcribe.py');
    if (!fs.existsSync(pythonScriptPath)) {
        fs.unlink(audioFilePath, (err) => {
            if (err) console.error('Error deleting temp file:', err);
        });
        return res.status(500).send({ status: 'error', message: 'Python transcription script not found.' });
    }
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

// New TTS endpoint
app.post('/tts', (req, res) => {
    const { text } = req.body;
    if (!text) {
        return res.status(400).send({ status: 'error', message: 'Text content is required.' });
    }

    const pythonScriptPath = path.join(__dirname, 'tts.py');
    const pythonProcess = spawn('python', [pythonScriptPath, text]);
    let dataString = '';
    let errorString = '';

    pythonProcess.stdout.on('data', (data) => {
        dataString += data.toString();
    });

    pythonProcess.stderr.on('data', (data) => {
        errorString += data.toString();
    });

    pythonProcess.on('close', (code) => {
        if (code !== 0) {
            console.error(`❌ Python TTS script exited with code ${code}`);
            console.error('Python Stderr:', errorString);
            return res.status(500).send({ status: 'error', message: 'TTS failed.', details: errorString });
        }
        try {
            const result = JSON.parse(dataString.trim());
            if (result.status === 'success' && result.filePath) {
                // Construct the file URL to be returned to the frontend
                const fileUrl = `${req.protocol}://${req.get('host')}/${path.basename(result.filePath)}`;
                res.status(200).send({ status: 'success', audioUrl: fileUrl });
            } else {
                console.error('❌ Python output is not in the expected format:', result);
                res.status(500).send({ status: 'error', message: 'Invalid TTS result format.' });
            }
        } catch (e) {
            console.error('❌ Failed to parse Python output:', e);
            console.error('Raw Python output:', dataString);
            res.status(500).send({ status: 'error', message: 'Failed to parse TTS result.' });
        }
    });
});

app.post('/saveNote', async (req, res) => {
    const { userId, note, type } = req.body;
    if (!userId || !note || !type) {
        return res.status(400).send({ status: 'error', message: 'User ID, note content, and type are required.' });
    }
    try {
        const notesDir = path.join(__dirname, 'saved_notes');
        if (!fs.existsSync(notesDir)) {
            fs.mkdirSync(notesDir);
        }
        const fileName = `${type}-${Date.now()}.txt`;
        const filePath = path.join(notesDir, fileName);
        fs.writeFileSync(filePath, note, 'utf8');
        const [result] = await pool.execute('INSERT INTO documents (user_id, type, content, file_path) VALUES (?, ?, ?, ?)', [userId, type, note, `saved_notes/${fileName}`]);
        res.status(201).send({ status: 'success', message: 'Note saved successfully!', documentId: result.insertId });
    } catch (error) {
        console.error('❌ Failed to save note:', error);
        res.status(500).send({ status: 'error', message: 'Failed to save note.' });
    }
});

app.get('/notes/:userId', async (req, res) => {
    const { userId } = req.params;
    try {
        const [rows] = await pool.execute('SELECT id, type, content, file_path AS filePath, created_at AS createdAt FROM documents WHERE user_id = ? AND deleted_at IS NULL ORDER BY created_at DESC', [userId]);
        res.status(200).send({ status: 'success', notes: rows });
    } catch (error) {
        console.error('❌ Failed to retrieve notes:', error);
        res.status(500).send({ status: 'error', message: 'Failed to retrieve notes.' });
    }
});

app.delete('/notes/:noteId', async (req, res) => {
    const { noteId } = req.params;
    try {
        const [noteRows] = await pool.execute('SELECT user_id, type, content, file_path FROM documents WHERE id = ?', [noteId]);
        if (noteRows.length === 0) {
            return res.status(404).send({ status: 'error', message: 'Note not found.' });
        }
        const noteDetails = noteRows[0];
        await pool.execute('UPDATE documents SET deleted_at = NOW() WHERE id = ?', [noteId]);
        await pool.execute('INSERT INTO document_history (document_id, user_id, type, original_text, file_path, change_type) VALUES (?, ?, ?, ?, ?, ?)', [noteId, noteDetails.user_id, noteDetails.type, noteDetails.content, noteDetails.file_path, 'DELETE']);
        res.status(200).send({ status: 'success', message: 'Note deleted successfully.' });
    } catch (error) {
        console.error('❌ Failed to delete note:', error);
        res.status(500).send({ status: 'error', message: 'Failed to delete note.' });
    }
});

app.listen(port, () => {
    console.log(`✅ Backend server listening at http://192.168.43.114:${port}`);
});