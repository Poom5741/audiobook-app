import os
import logging
from pathlib import Path
from typing import Optional
import uuid
import re

logger = logging.getLogger(__name__)

class FileManager:
    def __init__(self, audio_root: str = "/audio"):
        self.audio_root = Path(audio_root)
        self.audio_path = str(self.audio_root)
        
        # Ensure audio directory exists
        self.audio_root.mkdir(parents=True, exist_ok=True)
        
        logger.info(f"FileManager initialized with audio root: {self.audio_root}")
    
    def get_chapter_path(self, book: str, chapter: str) -> Path:
        """Get the full path for a chapter audio file"""
        # Sanitize book name for filesystem
        safe_book = self._sanitize_filename(book)
        
        # Create book directory
        book_dir = self.audio_root / safe_book
        book_dir.mkdir(parents=True, exist_ok=True)
        
        # Generate chapter filename
        safe_chapter = self._sanitize_filename(chapter)
        filename = f"chapter-{safe_chapter}.mp3"
        
        return book_dir / filename
    
    def get_audio_path(self, filename: str) -> Path:
        """Get the full path for a general audio file"""
        # Sanitize filename
        safe_filename = self._sanitize_filename(filename)
        
        # Ensure .mp3 extension
        if not safe_filename.lower().endswith('.mp3'):
            safe_filename += '.mp3'
        
        return self.audio_root / safe_filename
    
    def get_book_directory(self, book: str) -> Path:
        """Get the directory path for a book"""
        safe_book = self._sanitize_filename(book)
        book_dir = self.audio_root / safe_book
        book_dir.mkdir(parents=True, exist_ok=True)
        return book_dir
    
    def list_book_audio_files(self, book: str) -> list:
        """List all audio files for a specific book"""
        try:
            book_dir = self.get_book_directory(book)
            
            if not book_dir.exists():
                return []
            
            audio_files = []
            for file_path in book_dir.glob("*.mp3"):
                try:
                    file_info = {
                        "filename": file_path.name,
                        "path": str(file_path.relative_to(self.audio_root)),
                        "size": file_path.stat().st_size,
                        "created": file_path.stat().st_ctime,
                        "modified": file_path.stat().st_mtime
                    }
                    audio_files.append(file_info)
                except Exception as e:
                    logger.warning(f"Failed to get info for {file_path}: {e}")
            
            return sorted(audio_files, key=lambda x: x["filename"])
            
        except Exception as e:
            logger.error(f"Failed to list audio files for book {book}: {e}")
            return []
    
    def delete_book_audio(self, book: str) -> int:
        """Delete all audio files for a book"""
        try:
            book_dir = self.get_book_directory(book)
            
            if not book_dir.exists():
                return 0
            
            deleted_count = 0
            for file_path in book_dir.glob("*.mp3"):
                try:
                    file_path.unlink()
                    deleted_count += 1
                    logger.debug(f"Deleted audio file: {file_path}")
                except Exception as e:
                    logger.warning(f"Failed to delete {file_path}: {e}")
            
            # Try to remove empty directory
            try:
                if not any(book_dir.iterdir()):
                    book_dir.rmdir()
                    logger.debug(f"Removed empty book directory: {book_dir}")
            except Exception as e:
                logger.debug(f"Could not remove book directory: {e}")
            
            return deleted_count
            
        except Exception as e:
            logger.error(f"Failed to delete book audio for {book}: {e}")
            return 0
    
    def get_disk_usage(self) -> dict:
        """Get disk usage information for the audio directory"""
        try:
            import shutil
            
            total, used, free = shutil.disk_usage(self.audio_root)
            
            # Calculate audio directory size
            audio_size = 0
            for file_path in self.audio_root.rglob("*"):
                if file_path.is_file():
                    try:
                        audio_size += file_path.stat().st_size
                    except Exception:
                        pass
            
            return {
                "total_disk_gb": round(total / (1024**3), 2),
                "used_disk_gb": round(used / (1024**3), 2),
                "free_disk_gb": round(free / (1024**3), 2),
                "audio_directory_gb": round(audio_size / (1024**3), 2),
                "audio_directory_mb": round(audio_size / (1024**2), 2)
            }
            
        except Exception as e:
            logger.error(f"Failed to get disk usage: {e}")
            return {}
    
    def cleanup_orphaned_files(self, valid_books: list = None) -> int:
        """Clean up orphaned audio files"""
        try:
            if valid_books is None:
                logger.warning("No valid books provided for cleanup")
                return 0
            
            valid_books = set(valid_books)
            deleted_count = 0
            
            # Check each subdirectory
            for book_dir in self.audio_root.iterdir():
                if book_dir.is_dir():
                    # Extract book name from directory name
                    book_name = book_dir.name
                    
                    # If book name is not in valid list, delete the directory
                    if book_name not in valid_books:
                        try:
                            import shutil
                            file_count = len(list(book_dir.glob("*.mp3")))
                            shutil.rmtree(book_dir)
                            deleted_count += file_count
                            logger.info(f"Deleted orphaned book directory: {book_dir}")
                        except Exception as e:
                            logger.warning(f"Failed to delete orphaned directory {book_dir}: {e}")
            
            return deleted_count
            
        except Exception as e:
            logger.error(f"Cleanup failed: {e}")
            return 0
    
    def _sanitize_filename(self, filename: str) -> str:
        """Sanitize filename for filesystem compatibility"""
        if not filename:
            return str(uuid.uuid4())
        
        # Remove or replace problematic characters
        sanitized = re.sub(r'[<>:"/\\|?*]', '_', filename)
        sanitized = re.sub(r'[^\w\-_.]', '_', sanitized)
        sanitized = re.sub(r'_+', '_', sanitized)
        sanitized = sanitized.strip('_.')
        
        # Ensure it's not empty and not too long
        if not sanitized:
            sanitized = str(uuid.uuid4())
        elif len(sanitized) > 100:
            sanitized = sanitized[:100]
        
        return sanitized
    
    def ensure_directory_exists(self, path: Path) -> bool:
        """Ensure a directory exists, creating it if necessary"""
        try:
            path.mkdir(parents=True, exist_ok=True)
            return True
        except Exception as e:
            logger.error(f"Failed to create directory {path}: {e}")
            return False
    
    def get_file_info(self, file_path: Path) -> dict:
        """Get detailed information about a file"""
        try:
            if not file_path.exists():
                return {"exists": False}
            
            stat = file_path.stat()
            return {
                "exists": True,
                "size": stat.st_size,
                "created": stat.st_ctime,
                "modified": stat.st_mtime,
                "is_file": file_path.is_file(),
                "is_dir": file_path.is_dir(),
                "extension": file_path.suffix.lower(),
                "relative_path": str(file_path.relative_to(self.audio_root))
            }
            
        except Exception as e:
            logger.error(f"Failed to get file info for {file_path}: {e}")
            return {"exists": False, "error": str(e)}