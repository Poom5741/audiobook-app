-- Fix database sync issue for Trading in the Zone book
-- The audio files exist but audio_path is null in database

-- Update chapters with correct audio paths
UPDATE chapters 
SET audio_path = 'mark-douglas-trading-in-the-zone/chapter-' || chapter_number || '.mp3',
    status = 'completed'
WHERE book_id = 'ee369d94-0318-4092-9d55-eb601c953784' 
  AND chapter_number IN (1,2,3,4,5,7,8,9,11,12,13,14,15,16,17,18,19,20,21);

-- Update chapters that failed TTS (6 and 10)
UPDATE chapters 
SET status = 'failed'
WHERE book_id = 'ee369d94-0318-4092-9d55-eb601c953784' 
  AND chapter_number IN (6,10);

-- Update book status to show audio available
UPDATE books 
SET status = 'audio_generated' 
WHERE id = 'ee369d94-0318-4092-9d55-eb601c953784';

-- Verify the updates
SELECT 
  b.title, 
  c.chapter_number, 
  c.title as chapter_title, 
  c.audio_path, 
  c.status 
FROM books b 
JOIN chapters c ON b.id = c.book_id 
WHERE b.id = 'ee369d94-0318-4092-9d55-eb601c953784' 
ORDER BY c.chapter_number;