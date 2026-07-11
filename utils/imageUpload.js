// utils/imageUpload.js
// Handles saving Base64 images to the server filesystem

const fs = require('fs');
const path = require('path');

// Ensure uploads directory exists
const UPLOADS_DIR = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

/**
 * Save a Base64 image string to the server filesystem.
 * @param {string} base64String - The full Base64 data URI (e.g., data:image/jpeg;base64,...)
 * @returns {string} - The public URL path to the saved image (e.g., /uploads/img_xxx.jpg)
 */
function saveBase64Image(base64String) {
    if (!base64String || !base64String.startsWith('data:image')) {
        return null;
    }

    // Extract the MIME type and raw base64 data
    const matches = base64String.match(/^data:image\/(\w+);base64,(.+)$/);
    if (!matches) return null;

    const ext = matches[1] === 'jpeg' ? 'jpg' : matches[1]; // normalize jpeg -> jpg
    const rawData = matches[2];
    const buffer = Buffer.from(rawData, 'base64');

    // Generate a unique filename
    const filename = `img_${Date.now()}_${Math.random().toString(36).substring(2, 8)}.${ext}`;
    const filePath = path.join(UPLOADS_DIR, filename);

    fs.writeFileSync(filePath, buffer);

    // Return the public URL path
    return `/uploads/${filename}`;
}

/**
 * Delete an image from the server filesystem.
 * @param {string} imageUrl - The public URL path (e.g., /uploads/img_xxx.jpg)
 */
function deleteImage(imageUrl) {
    if (!imageUrl || !imageUrl.startsWith('/uploads/')) return;
    const filename = imageUrl.replace('/uploads/', '');
    // Check new location first
    const newPath = path.join(UPLOADS_DIR, filename);
    if (fs.existsSync(newPath)) { fs.unlinkSync(newPath); return; }
    // Fallback to old location
    const oldPath = path.join(__dirname, '..', 'uploads', filename);
    if (fs.existsSync(oldPath)) { fs.unlinkSync(oldPath); }
}

module.exports = { saveBase64Image, deleteImage };
