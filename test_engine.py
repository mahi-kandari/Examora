import sys
import json
from backend.core import ExamExtractor

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python test_engine.py <path_to_pdf_or_image>")
        sys.exit(1)
    
    file_path = sys.argv[1]
    extractor = ExamExtractor()
    result = extractor.process_file(file_path)  # <-- Changed to process_file
    
    print(json.dumps(result, indent=2))