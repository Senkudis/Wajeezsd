const fetch = require('node-fetch');

async function testFetch() {
    try {
        // Assuming localized run, hard to hit localhost from here if auth is needed. 
        // Actually, the endpoint /api/captain/nearby is public?
        // Checking routes/captain.js... it does NOT have 'protect' middleware in the definition:
        // router.get('/nearby', async (req, res) => ...
        // Wait, let me verify the file content in previous turn.
        // Line 88: router.get('/nearby', async (req, res) => {
        // It does NOT have 'protect'. So I can fetch it directly.

        const res = await fetch('http://localhost:5000/api/captain/nearby');
        const data = await res.json();
        console.log(JSON.stringify(data, null, 2));
    } catch (e) {
        console.error(e);
    }
}

testFetch();
