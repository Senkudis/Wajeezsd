const twilio = require('twilio');

const sendSMS = async (to, body) => {
    // ⚠️ Check if Twilio is configured
    if (!process.env.TWILIO_SID || !process.env.TWILIO_AUTH_TOKEN || !process.env.TWILIO_PHONE) {
        console.log(`[SMS MOCK] To: ${to} | Body: ${body}`);
        return; // Exit if no keys
    }

    const client = new twilio(process.env.TWILIO_SID, process.env.TWILIO_AUTH_TOKEN);

    try {
        await client.messages.create({
            body: body,
            from: process.env.TWILIO_PHONE,
            to: to
        });
        console.log(`✅ SMS sent to ${to}`);
    } catch (error) {
        console.error('❌ Error sending SMS:', error.message);
    }
};

module.exports = sendSMS;
