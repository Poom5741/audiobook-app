#!/usr/bin/env node

/**
 * Test script to verify summarization integration
 * Run with: node test-summarization.js
 */

const axios = require('axios');

const BASE_URL = 'http://localhost:5000';
const SUMMARIZER_URL = 'http://localhost:8001';

// Test text for summarization
const testText = `
The quick brown fox jumps over the lazy dog. This is a longer text that should be suitable for summarization testing. 
The purpose of this test is to ensure that the summarization service is properly integrated into the TTS queue system.
When a user enables summarization for their audiobook chapters, the text should be processed through the summarization 
service before being sent to the TTS engine. This can help reduce the length of audiobooks and focus on key content.
The summarization service supports multiple styles including concise, detailed, bullets, and key-points. It also 
supports different content types such as general, instructional, analytical, narrative, and howto. The maximum 
length of the summary can be controlled through the maxLength parameter. The service is designed to work efficiently 
with the existing TTS pipeline and provides fallback mechanisms in case of errors.
`;

async function testSummarizationHealth() {
  console.log('🔍 Testing summarization service health...');
  
  try {
    const response = await axios.get(`${BASE_URL}/api/tts/summarize/health`);
    console.log('✅ Summarization health check passed:', response.data);
    return true;
  } catch (error) {
    console.error('❌ Summarization health check failed:', error.message);
    return false;
  }
}

async function testDirectSummarization() {
  console.log('\n📝 Testing direct summarization...');
  
  try {
    const response = await axios.post(`${BASE_URL}/api/tts/summarize`, {
      text: testText,
      style: 'concise',
      maxLength: 200,
      contentType: 'narrative'
    });
    
    console.log('✅ Direct summarization successful:');
    console.log('Original length:', response.data.original.length);
    console.log('Summary length:', response.data.summaryLength);
    console.log('Compression ratio:', response.data.compressionRatio);
    console.log('Summary:', response.data.summary);
    
    return true;
  } catch (error) {
    console.error('❌ Direct summarization failed:', error.response?.data || error.message);
    return false;
  }
}

async function testSummarizer() {
  console.log('\n🧪 Testing summarizer service directly...');
  
  try {
    const response = await axios.post(`${SUMMARIZER_URL}/api/summarize`, {
      text: testText,
      style: 'concise',
      maxLength: 200,
      contentType: 'narrative'
    });
    
    console.log('✅ Summarizer service working:');
    console.log('Summary:', response.data.summary);
    console.log('Compression ratio:', response.data.compressionRatio);
    
    return true;
  } catch (error) {
    console.error('❌ Summarizer service failed:', error.response?.data || error.message);
    return false;
  }
}

async function runTests() {
  console.log('🚀 Starting summarization integration tests...\n');
  
  const tests = [
    { name: 'Summarizer Service Direct', fn: testSummarizer },
    { name: 'Summarization Health Check', fn: testSummarizationHealth },
    { name: 'Direct Summarization API', fn: testDirectSummarization }
  ];
  
  const results = [];
  
  for (const test of tests) {
    console.log(`\n--- ${test.name} ---`);
    const result = await test.fn();
    results.push({ name: test.name, passed: result });
  }
  
  console.log('\n📊 Test Results:');
  console.log('================');
  
  results.forEach(result => {
    const status = result.passed ? '✅ PASSED' : '❌ FAILED';
    console.log(`${status} - ${result.name}`);
  });
  
  const passedTests = results.filter(r => r.passed).length;
  const totalTests = results.length;
  
  console.log(`\nOverall: ${passedTests}/${totalTests} tests passed`);
  
  if (passedTests === totalTests) {
    console.log('🎉 All tests passed! Summarization integration is working correctly.');
  } else {
    console.log('⚠️  Some tests failed. Please check the services are running and configured correctly.');
    process.exit(1);
  }
}

// Run tests
runTests().catch(error => {
  console.error('💥 Test runner failed:', error);
  process.exit(1);
});