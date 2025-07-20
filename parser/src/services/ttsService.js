const { callService } = require('../utils/circuitBreaker');
const fs = require('fs-extra');
const path = require('path');
const { createLogger } = require('../../shared/logger');

const logger = createLogger('tts-service');

const TTS_API_URL = process.env.TTS_API_URL || 'http://tts-api:8000';

async function convertTextToAudio(text, bookSlug, chapterNumber) {
  try {
    logger.info(`Converting text to audio for book: ${bookSlug}, chapter: ${chapterNumber}, text: ${text.substring(0, 50)}...`);
    const response = await callService('tts', {
      method: 'POST',
      url: `${TTS_API_URL}/tts`,
      data: {
        text: text,
        book: bookSlug,
        chapter: chapterNumber.toString() // Ensure chapter is a string
      },
      responseType: 'json' // Expect JSON response from TTS API
    });

    if (response.data && response.data.success) {
      logger.info(`Audio generated: ${response.data.audio_path}`);
      return response.data.audio_path;
    } else {
      throw new Error(`TTS API error: ${response.data.message || 'Unknown error'}`);
    }
  } catch (error) {
    logger.error(`Error converting text to audio: ${error.message}`);
    throw error;
  }
}

module.exports = { convertTextToAudio };
