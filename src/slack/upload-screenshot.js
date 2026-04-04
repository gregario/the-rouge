const { WebClient } = require('@slack/web-api');
const fs = require('fs');
const path = require('path');

async function uploadScreenshot(filePath, channel, message) {
  const token = process.env.SLACK_BOT_TOKEN;
  if (!token) {
    console.log('No SLACK_BOT_TOKEN — cannot upload screenshot');
    return null;
  }
  if (!fs.existsSync(filePath)) {
    console.log(`Screenshot not found: ${filePath}`);
    return null;
  }

  const client = new WebClient(token);
  try {
    const result = await client.filesUploadV2({
      channel_id: channel,
      file: fs.createReadStream(filePath),
      filename: path.basename(filePath),
      initial_comment: message,
    });
    return result;
  } catch (err) {
    console.error(`Screenshot upload failed: ${(err.message || '').slice(0, 200)}`);
    return null;
  }
}

module.exports = { uploadScreenshot };
