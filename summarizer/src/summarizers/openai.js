/**
 * OpenAI GPT-based Text Summarization
 */

const OpenAI = require('openai');
const winston = require('winston');

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.simple(),
  transports: [new winston.transports.Console()]
});

class OpenAISummarizer {
  constructor() {
    this.client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
    this.model = process.env.OPENAI_MODEL || 'gpt-4-turbo-preview';
    this.maxRetries = 3;
  }

  /**
   * Check if OpenAI is properly configured
   */
  isConfigured() {
    return !!process.env.OPENAI_API_KEY;
  }

  /**
   * Get system prompt for different content types and styles
   */
  getSystemPrompt(contentType, style) {
    const basePrompt = `You are an expert at extracting key insights from books and documents. Your goal is to distill the essential "coconut milk" from content that may contain a lot of "water" (filler).`;

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
- Aim for clarity and accessibility in your summary`;
  }

  /**
   * Create user prompt for the text to summarize
   */
  getUserPrompt(text, targetLength, analysis) {
    return `Please summarize the following text. 

Original length: ${analysis.wordCount} words
Target summary length: ~${targetLength} words
Content complexity: ${analysis.complexity}
Estimated reading time: ${analysis.estimatedReadingTime} minutes

Focus on extracting the key insights and practical value while removing any repetitive or filler content:

---
${text}
---

Summary:`;
  }

  /**
   * Summarize a single chunk of text
   */
  async summarizeChunk(text, options = {}) {
    const {
      contentType = 'general',
      style = 'concise',
      targetLength = 500,
      analysis = {}
    } = options;

    try {
      const systemPrompt = this.getSystemPrompt(contentType, style);
      const userPrompt = this.getUserPrompt(text, targetLength, analysis);

      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        max_tokens: Math.min(4000, Math.ceil(targetLength * 1.5)),
        temperature: 0.3, // Lower temperature for more consistent summaries
        presence_penalty: 0.1,
        frequency_penalty: 0.1
      });

      return response.choices[0]?.message?.content?.trim() || '';
    } catch (error) {
      logger.error('OpenAI API error:', error);
      throw new Error(`OpenAI summarization failed: ${error.message}`);
    }
  }

  /**
   * Summarize multiple chunks and combine them
   */
  async summarizeChunks(chunks, options = {}) {
    const summaries = [];
    const { style = 'concise' } = options;

    // Summarize each chunk
    for (let i = 0; i < chunks.length; i++) {
      logger.info(`Summarizing chunk ${i + 1}/${chunks.length}`);
      
      try {
        const chunkSummary = await this.summarizeChunk(chunks[i], {
          ...options,
          targetLength: Math.ceil(options.targetLength / chunks.length)
        });
        
        if (chunkSummary) {
          summaries.push(chunkSummary);
        }
        
        // Rate limiting delay
        if (i < chunks.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000));
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
    const { style = 'concise', targetLength = 500 } = options;
    
    const combinedText = summaries.join('\n\n');
    
    const systemPrompt = `You are combining multiple section summaries into a single, cohesive summary. Eliminate redundancy while preserving all key insights and maintaining logical flow.`;
    
    const userPrompt = `Please combine these section summaries into a single, well-structured summary of approximately ${targetLength} words:

${combinedText}

Final Summary:`;

    try {
      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        max_tokens: Math.min(4000, Math.ceil(targetLength * 1.5)),
        temperature: 0.2,
        presence_penalty: 0.2,
        frequency_penalty: 0.3
      });

      return response.choices[0]?.message?.content?.trim() || combinedText;
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
    if (!this.isConfigured()) {
      throw new Error('OpenAI API key not configured');
    }

    const {
      style = 'concise',
      targetLength = 500,
      contentType = 'general',
      chunks = [text],
      analysis = {}
    } = options;

    logger.info(`Starting OpenAI summarization: ${chunks.length} chunk(s), style: ${style}`);

    let retries = 0;
    while (retries < this.maxRetries) {
      try {
        const result = chunks.length === 1 
          ? await this.summarizeChunk(chunks[0], options)
          : await this.summarizeChunks(chunks, options);

        logger.info('OpenAI summarization completed successfully');
        return {
          summary: result,
          originalLength: text.length,
          summaryLength: result.length,
          compressionRatio: (1 - result.length / text.length).toFixed(2),
          provider: 'openai',
          model: this.model,
          style,
          contentType
        };
      } catch (error) {
        retries++;
        logger.error(`OpenAI summarization attempt ${retries} failed:`, error);
        
        if (retries >= this.maxRetries) {
          throw error;
        }
        
        // Exponential backoff
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, retries) * 1000));
      }
    }
  }
}

module.exports = OpenAISummarizer;