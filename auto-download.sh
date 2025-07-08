#!/bin/bash

# Auto-download script for audiobooks
# Usage: ./auto-download.sh "search query"

API_BASE="http://localhost:3001/api"
SEARCH_QUERY="${1:-'science fiction'}"

echo "🔍 Searching for: $SEARCH_QUERY"

# Search for books
search_results=$(curl -s "$API_BASE/search?q=$SEARCH_QUERY&limit=5&format=epub,pdf")

if [ $? -ne 0 ]; then
    echo "❌ Search failed"
    exit 1
fi

echo "📚 Found books:"
echo "$search_results" | jq -r '.results[] | "- \(.title) by \(.author) (\(.fileType))"'

# Download the first book automatically
book_url=$(echo "$search_results" | jq -r '.results[0].downloadUrl // .results[0].url')

if [ "$book_url" != "null" ] && [ -n "$book_url" ]; then
    echo "⬇️  Downloading first book: $book_url"
    
    download_result=$(curl -s -X POST "$API_BASE/download" \
        -H "Content-Type: application/json" \
        -d "{\"bookUrl\": \"$book_url\", \"priority\": 1}")
    
    if [ $? -eq 0 ]; then
        echo "✅ Download queued successfully"
        echo "$download_result" | jq -r '"Book: \(.book.title) by \(.book.author)"'
    else
        echo "❌ Download failed"
    fi
else
    echo "❌ No downloadable books found"
fi

# Show download stats
echo "📊 Download statistics:"
curl -s "$API_BASE/download/stats" | jq -r '"Total books: \(.totalBooks) | Downloaded: \(.downloadedBooks) | Processing: \(.processingBooks)"'