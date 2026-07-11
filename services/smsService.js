const axios = require('axios');
const logger = require('../utils/logger');

async function sendSmsOTP(phone, message) {
    try {
        const payload = {
            recipient: phone,
            sender_id: "Wajeezsd",
            type: "plain",
            message: message
        };

        const response = await axios.post('https://dash.brqsms.com/api/v3/sms/send', payload, {
            headers: {
                'Authorization': `Bearer ${process.env.BRQSMS_TOKEN}`,
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            }
        });

        logger.info({ phone, result: response.data.message || 'Success' }, '[BRQSMS] SMS sent');
        return response.data;
    } catch (err) {
        logger.error({ phone, err: err?.response?.data || err.message }, '[BRQSMS] SMS send error');
        throw err;
    }
}

module.exports = { sendSmsOTP };
