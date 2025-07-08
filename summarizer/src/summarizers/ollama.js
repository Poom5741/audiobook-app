/**
 * Ollama Local AI Text Summarization
 */

const axios = require('axios');
const winston = require('winston');

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.simple(),
  transports: [new winston.transports.Console()]
});

class OllamaSummarizer {
  constructor() {
    this.baseUrl = process.env.OLLAMA_URL || 'http://localhost:11434';
    this.model = process.env.OLLAMA_MODEL || 'llama2';
    this.maxRetries = 3;
    this.timeout = 300000; // 5 minutes for local processing
  }

  /**
   * Check if Ollama is running and model is available
   */
  async isAvailable() {
    try {
      const response = await axios.get(`${this.baseUrl}/api/tags`, {
        timeout: 5000
      });
      
      const models = response.data.models || [];
      const modelExists = models.some(m => m.name.includes(this.model));
      
      if (!modelExists) {
        logger.warn(`Model ${this.model} not found. Available models:`, 
          models.map(m => m.name));
        return false;
      }
      
      return true;
    } catch (error) {
      logger.error('Ollama not available:', error.message);
      return false;
    }
  }

  /**
   * Get system prompt for different content types and styles
   */
  getSystemPrompt(contentType, style) {
    const basePrompt = `You are an expert at extracting key insights from books and documents. Your goal is to distill the essential "coconut milk" from content that may contain a lot of "water" (filler content).`;

    const contentTypePrompts = {
      instructional: "Focus on actionable steps, methods, and practical guidance.",
      analytical: "Emphasize data insights, conclusions, and evidence-based findings.", 
      narrative: "Extract core themes, key events, and meaningful insights.",
      howto: "Highlight the essential process steps and critical success factors.",
      general: "Identify main concepts, key takeaways, and practical applications."
    };

    const stylePrompts = {
      concise: "Provide a brief, highly focused summary in 2-3 paragraphs.",
      detailed: "Create a comprehensive overview that preserves important context and examples.",
      bullets: "Format as clear bullet points with actionable items.",
      'key-points': "Structure as numbered key insights with brief explanations."
    };

    return `${basePrompt}

Content Type: ${contentType}
${contentTypePrompts[contentType] || contentTypePrompts.general}

Style: ${style}
${stylePrompts[style] || stylePrompts.concise}

Rules:
- Extract only the most valuable insights and skip redundant content
- Preserve important examples and case studies that illustrate key points
- Maintain any critical statistics, quotes, or data points
- Focus on actionable takeaways and practical applications
- If technical concepts are mentioned, explain them briefly
- Aim for clarity and accessibility in your summary
- Keep the summary concise but comprehensive`;
  }

  /**
   * Create the full prompt combining system and user instructions
   */
  getFullPrompt(text, options = {}) {
    const {
      contentType = 'general',
      style = 'concise',
      targetLength = 500,
      analysis = {}
    } = options;

    const systemPrompt = this.getSystemPrompt(contentType, style);
    
    return `${systemPrompt}

Original text length: ${analysis.wordCount || 'unknown'} words
Target summary length: ~${targetLength} words
Content complexity: ${analysis.complexity || 'medium'}

Please summarize the following text, focusing on extracting the key insights and practical value while removing any repetitive or filler content:

---
${text}
---

Summary:`;
  }

  /**
   * Send request to Ollama API
   */
  async generateWithOllama(prompt, options = {}) {
    const requestData = {
      model: this.model,
      prompt: prompt,
      stream: false,
      options: {
        temperature: 0.3, // Lower temperature for more consistent summaries
        top_p: 0.9,
        top_k: 40,
        repeat_penalty: 1.1,
        num_predict: Math.min(2048, Math.ceil(options.targetLength * 2)) // Limit output length
      }
    };

    try {
      const response = await axios.post(
        `${this.baseUrl}/api/generate`,
        requestData,
        {
          timeout: this.timeout,
          headers: {
            'Content-Type': 'application/json'
          }
        }
      );

      return response.data.response?.trim() || '';
    } catch (error) {
      if (error.code === 'ECONNREFUSED') {
        throw new Error('Ollama server not running. Please start Ollama with: ollama serve');
      }
      throw new Error(`Ollama API error: ${error.message}`);
    }
  }

  /**
   * Summarize a single chunk of text
   */
  async summarizeChunk(text, options = {}) {
    const prompt = this.getFullPrompt(text, options);
    
    try {
      const result = await this.generateWithOllama(prompt, options);
      
      if (!result) {
        throw new Error('Empty response from Ollama');
      }
      
      // Clean up the response
      return result
        .replace(/^(Summary:|Here's a summary:|Here is a summary:)/i, '')
        .trim();
        
    } catch (error) {
      logger.error('Ollama chunk summarization error:', error);
      throw error;
    }
  }

  /**
   * Summarize multiple chunks and combine them
   */
  async summarizeChunks(chunks, options = {}) {
    const summaries = [];
    const chunkTargetLength = Math.ceil(options.targetLength / chunks.length);

    // Summarize each chunk
    for (let i = 0; i < chunks.length; i++) {
      logger.info(`Summarizing chunk ${i + 1}/${chunks.length} with Ollama`);
      
      try {
        const chunkSummary = await this.summarizeChunk(chunks[i], {
          ...options,
          targetLength: chunkTargetLength
        });
        
        if (chunkSummary) {
          summaries.push(chunkSummary);
        }
        
      } catch (error) {
        logger.error(`Failed to summarize chunk ${i + 1}:`, error);
        // Continue with other chunks
      }
    }

    if (summaries.length === 0) {
      throw new Error('Failed to summarize any chunks');
    }

    // If we have multiple summaries, combine them
    if (summaries.length > 1) {
      return await this.combineSummaries(summaries, options);
    }

    return summaries[0];
  }

  /**
   * Combine multiple chunk summaries into a cohesive final summary
   */
  async combineSummaries(summaries, options = {}) {
    const { targetLength = 500 } = options;
    
    const combinedText = summaries.join('\n\n');
    
    const combinePrompt = `You are combining multiple section summaries into a single, cohesive summary. Eliminate redundancy while preserving all key insights and maintaining logical flow.

Please combine these section summaries into a single, well-structured summary of approximately ${targetLength} words:

${combinedText}

Final Summary:`;

    try {
      const result = await this.generateWithOllama(combinePrompt, options);
      return result || combinedText; // Fallback to concatenation if combining fails
    } catch (error) {
      logger.error('Failed to combine summaries:', error);
      // Fallback to simple concatenation
      return combinedText;
    }
  }

  /**
   * Main summarization method
   */
  async summarize(text, options = {}) {
    const {
      style = 'concise',
      targetLength = 500,
      contentType = 'general',
      chunks = [text],
      analysis = {}
    } = options;

    // Check if Ollama is available
    if (!(await this.isAvailable())) {
      throw new Error(`Ollama not available or model ${this.model} not found`);
    }

    logger.info(`Starting Ollama summarization: ${chunks.length} chunk(s), style: ${style}, model: ${this.model}`);

    let retries = 0;
    while (retries < this.maxRetries) {
      try {
        const result = chunks.length === 1 
          ? await this.summarizeChunk(chunks[0], options)
          : await this.summarizeChunks(chunks, options);

        logger.info('Ollama summarization completed successfully');
        
        return {
          summary: result,
          originalLength: text.length,
          summaryLength: result.length,
          compressionRatio: (1 - result.length / text.length).toFixed(2),
          provider: 'ollama',
          model: this.model,
          style,
          contentType
        };
      } catch (error) {
        retries++;
        logger.error(`Ollama summarization attempt ${retries} failed:`, error);
        
        if (retries >= this.maxRetries) {
          throw error;
        }
        
        // Wait before retrying
        await new Promise(resolve => setTimeout(resolve, 2000 * retries));
      }
    }
  }

  /**
   * List available models
   */
  async getAvailableModels() {
    try {
      const response = await axios.get(`${this.baseUrl}/api/tags`);
      return response.data.models || [];
    } catch (error) {
      logger.error('Failed to get available models:', error);
      return [];
    }
  }

  /**
   * Pull a model if it doesn't exist
   */
  async pullModel(modelName) {
    try {
      logger.info(`Pulling model: ${modelName}`);
      
      const response = await axios.post(
        `${this.baseUrl}/api/pull`,
        { name: modelName },
        { timeout: 600000 } // 10 minutes for model download
      );
      
      logger.info(`Model ${modelName} pulled successfully`);
      return true;
    } catch (error) {
      logger.error(`Failed to pull model ${modelName}:`, error);
      return false;
    }
  }
}

module.exports = OllamaSummarizer;