'use client';

import { useState, useEffect } from 'react';
import { booksApi, Book } from '@/lib/api';

interface EditBookModalProps {
  book: Book;
  onClose: () => void;
  onBookUpdated: (book: Book) => void;
}

export default function EditBookModal({
  book,
  onClose,
  onBookUpdated,
}: EditBookModalProps) {
  const [title, setTitle] = useState(book.title);
  const [author, setAuthor] = useState(book.author);
  const [isbn, setIsbn] = useState(book.isbn || '');
  const [description, setDescription] = useState(book.description || '');
  const [language, setLanguage] = useState(book.language || 'en');
  const [tags, setTags] = useState(book.tags?.join(', ') || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setTitle(book.title);
    setAuthor(book.author);
    setIsbn(book.isbn || '');
    setDescription(book.description || '');
    setLanguage(book.language || 'en');
    setTags(book.tags?.join(', ') || '');
  }, [book]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const updatedBook = await booksApi.updateBook(book.id, {
        title,
        author,
        isbn: isbn || undefined,
        description: description || undefined,
        language,
        tags: tags ? tags.split(',').map(tag => tag.trim()) : undefined,
      });
      
      if (updatedBook) {
        onBookUpdated(updatedBook);
      } else {
        setError('Failed to update book: No book data returned.');
      }

    } catch (err) {
      console.error('Error updating book:', err);
      setError(err instanceof Error ? err.message : 'Failed to update book');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <div className="modal-header">
          <h2>Edit Book: {book.title}</h2>
          <button className="close-button" onClick={onClose}>&times;</button>
        </div>
        <form onSubmit={handleSubmit} className="form-card" style={{ boxShadow: 'none', padding: '0' }}>
          {error && <div className="alert alert-danger">{error}</div>}

          <div className="form-group">
            <label htmlFor="edit-title">Title <span className="required">*</span></label>
            <input
              type="text"
              id="edit-title"
              className="form-control"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="edit-author">Author <span className="required">*</span></label>
            <input
              type="text"
              id="edit-author"
              className="form-control"
              value={author}
              onChange={(e) => setAuthor(e.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="edit-isbn">ISBN</label>
            <input
              type="text"
              id="edit-isbn"
              className="form-control"
              value={isbn}
              onChange={(e) => setIsbn(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label htmlFor="edit-description">Description</label>
            <textarea
              id="edit-description"
              className="form-control"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={5}
            ></textarea>
          </div>

          <div className="form-group">
            <label htmlFor="edit-language">Language</label>
            <select
              id="edit-language"
              className="form-control"
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
            >
              <option value="en">English</option>
              <option value="es">Spanish</option>
              <option value="fr">French</option>
              <option value="de">German</option>
              <option value="it">Italian</option>
              <option value="pt">Portuguese</option>
              <option value="ru">Russian</option>
              <option value="zh">Chinese</option>
              <option value="ja">Japanese</option>
              <option value="ko">Korean</option>
            </select>
          </div>

          <div className="form-group">
            <label htmlFor="edit-tags">Tags (comma-separated)</label>
            <input
              type="text"
              id="edit-tags"
              className="form-control"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
            />
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
